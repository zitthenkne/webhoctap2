// File: features/quiz/library/library-attempts.js
// "Dấu vết học tập" cho thư viện: lần LÀM BÀI gần nhất của từng bộ đề (đồng bộ tăng dần
// từ Firestore `quiz_results`, cache localStorage theo tài khoản) và lần MỞ gần nhất
// (chỉ lưu cục bộ, giống folderLastOpened). Cung cấp dữ liệu cho chip tiến độ trên thẻ,
// bộ lọc "Chưa làm" và bộ lọc "Gần đây".

import { auth, db } from '../../../core/firebase-init.js';
import { sessionUser } from '../../../core/auth-session.js';
import { collection, query, where, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { S } from './library-state.js';

// Tối đa 1 lần hỏi server / 5 phút / phiên — tránh tốn lượt đọc khi chuyển tab qua lại
const ATTEMPT_SYNC_MIN_INTERVAL = 5 * 60 * 1000;

function attemptCacheKey() {
    const uid = sessionUser() ? sessionUser().uid : 'anon';
    return `quizAttemptCache_${uid}`;
}

// Nạp cache lần-làm-gần-nhất từ localStorage vào RAM (gọi mỗi lần mở thư viện — rẻ)
export function loadAttemptCache() {
    try {
        const raw = JSON.parse(localStorage.getItem(attemptCacheKey()) || 'null');
        S.attemptMap = (raw && raw.map) || {};
        S.attemptCacheSyncedAt = (raw && raw.lastSync) || 0;
    } catch {
        S.attemptMap = {};
        S.attemptCacheSyncedAt = 0;
    }
}

function saveAttemptCache() {
    try {
        localStorage.setItem(attemptCacheKey(), JSON.stringify({
            lastSync: S.attemptCacheSyncedAt,
            map: S.attemptMap
        }));
    } catch {}
}

// Đã đồng bộ ít nhất một lần chưa? Chưa thì đừng gắn nhãn "Chưa làm" kẻo sai
// (người dùng có thể đã làm nhiều lần nhưng máy này chưa kéo dữ liệu về).
export function hasAttemptData() {
    return S.attemptCacheSyncedAt > 0;
}

// { s: số câu đúng, t: tổng số câu, at: thời điểm nộp (ms) } hoặc null nếu chưa làm
export function getLastAttempt(quizId) {
    return S.attemptMap[quizId] || null;
}

// Đồng bộ TĂNG DẦN: chỉ kéo các kết quả mới hơn lần đồng bộ trước (lần đầu kéo toàn bộ,
// tương đương một lần mở tab Thống kê). Trả về true nếu có dữ liệu mới.
export function syncAttemptsFromServer() {
    const user = sessionUser();
    if (!user) return Promise.resolve(false);
    if (S.attemptSyncPromise) return S.attemptSyncPromise;
    if (Date.now() - S.attemptLastSyncTry < ATTEMPT_SYNC_MIN_INTERVAL) return Promise.resolve(false);
    S.attemptLastSyncTry = Date.now();

    S.attemptSyncPromise = (async () => {
        try {
            const constraints = [where('userId', '==', user.uid)];
            if (S.attemptCacheSyncedAt > 0) {
                constraints.push(where('completedAt', '>', new Date(S.attemptCacheSyncedAt)));
            }
            constraints.push(orderBy('completedAt', 'asc'));
            const snap = await getDocs(query(collection(db, 'quiz_results'), ...constraints));

            let changed = false;
            snap.forEach(d => {
                const r = d.data();
                if (!r.quizId) return;
                const at = r.completedAt && typeof r.completedAt.toDate === 'function'
                    ? r.completedAt.toDate().getTime()
                    : 0;
                const cur = S.attemptMap[r.quizId];
                if (!cur || at >= cur.at) {
                    S.attemptMap[r.quizId] = {
                        s: Number(r.score) || 0,
                        t: Number(r.totalQuestions) || 0,
                        at
                    };
                    changed = true;
                }
                if (at > S.attemptCacheSyncedAt) S.attemptCacheSyncedAt = at;
            });
            // Lần đầu mà chưa có kết quả nào: vẫn đánh dấu "đã đồng bộ" để chip "Chưa làm" được phép hiện
            if (S.attemptCacheSyncedAt === 0) {
                S.attemptCacheSyncedAt = Date.now();
                changed = true;
            }
            saveAttemptCache();
            return changed;
        } catch (e) {
            console.warn('Không đồng bộ được lịch sử làm bài cho thư viện:', e);
            return false;
        } finally {
            S.attemptSyncPromise = null;
        }
    })();
    return S.attemptSyncPromise;
}

// === LẦN MỞ BỘ ĐỀ GẦN NHẤT (cục bộ, giống folderLastOpened) ===
const QUIZ_LAST_OPENED_KEY = 'quizLastOpened';
const QUIZ_LAST_OPENED_MAX = 60; // giữ gọn localStorage: chỉ nhớ 60 bộ đề mở gần nhất

export function getQuizLastOpenedMap() {
    try { return JSON.parse(localStorage.getItem(QUIZ_LAST_OPENED_KEY) || '{}'); }
    catch { return {}; }
}

export function markQuizOpened(quizId) {
    if (!quizId) return;
    const map = getQuizLastOpenedMap();
    map[quizId] = Date.now();
    const ids = Object.keys(map);
    if (ids.length > QUIZ_LAST_OPENED_MAX) {
        ids.sort((a, b) => map[b] - map[a]);
        ids.slice(QUIZ_LAST_OPENED_MAX).forEach(id => delete map[id]);
    }
    try { localStorage.setItem(QUIZ_LAST_OPENED_KEY, JSON.stringify(map)); } catch {}
}

// Thời điểm "chạm" gần nhất vào một bộ đề: lần mở hoặc lần nộp bài, cái nào muộn hơn
export function getLastTouchedAt(quizId) {
    const opened = getQuizLastOpenedMap()[quizId] || 0;
    const attempt = S.attemptMap[quizId];
    return Math.max(opened, attempt ? attempt.at : 0);
}

