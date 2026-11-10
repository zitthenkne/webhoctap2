import { auth } from '../../../core/firebase-init.js';
import { sessionUser, onSessionUser } from '../../../core/auth-session.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { studyKeys, syncPullStudy, scheduleCloudPush, fetchCloudProgress, scheduleCloudProgressPush } from '../quiz-study-store.js';
import { state, readQuizState, readQuizStateLight, writeQuizState, markQuizStateFinished } from '../quiz-state.js';
import { firstDivergence, mergeBranches, sameAttempt } from '../quiz-attempt.js';
import { deviceId } from '../../../core/device-limit.js';
import { showQuestion } from './quiz-question-view.js';

export function currentQuizId() {
    return (state.quizData && state.quizData.id) || (new URLSearchParams(window.location.search)).get('id') || 'default_quiz';
}
// Gọi sau mỗi lần ghi chú / đánh dấu / annotation thay đổi localStorage.
export function pushStudyToCloud() {
    const u = sessionUser();
    const uid = u && u.uid;
    if (uid) scheduleCloudPush(uid, currentQuizId());
}
// Lưu/bỏ đánh dấu BỀN theo nội dung câu hỏi (để trang Lịch sử đọc lại được).
// Khác với state.markedReasons (theo chỉ số phiên, bị xóa khi nộp bài).
export function persistMarkByText(qText, reason) {
    if (!qText) return;
    const key = studyKeys(currentQuizId()).marks;
    let store = {};
    try { store = JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) {}
    if (reason === '__unmark' || !reason) delete store[qText];
    else store[qText] = reason;
    try { localStorage.setItem(key, JSON.stringify(store)); } catch (e) {}
    pushStudyToCloud();
}

// Kéo dữ liệu học tập từ cloud về máy này (chạy 1 lần khi đã biết người dùng).
// Gọi ngay nếu đã đăng nhập; nếu auth resolve muộn thì chờ qua onAuthStateChanged.
let _studyPulled = false;
let _studyPullPromise = null;

// Chờ tới khi bản kéo cloud đầu tiên hoàn tất (hoặc hết timeout — mạng chậm/offline
// thì dùng dữ liệu local, không treo). Dùng trước khi build hàng đợi ôn ngắt quãng
// để lịch ôn trên máy mới lấy đúng từ Firestore thay vì coi tất cả là câu mới.
export function whenStudyPulled(timeoutMs = 4000) {
    if (!_studyPullPromise) {
        // Chưa có phiên kéo nào (khách / auth chưa resolve) → chờ ngắn cho auth kịp
        // khởi động phiên kéo, hết thời gian thì thôi.
        return new Promise((resolve) => {
            const t0 = Date.now();
            const tick = () => {
                if (_studyPullPromise) {
                    Promise.race([
                        _studyPullPromise,
                        new Promise(r => setTimeout(r, Math.max(0, timeoutMs - (Date.now() - t0)))),
                    ]).then(resolve);
                } else if (Date.now() - t0 >= Math.min(1500, timeoutMs) || !navigator.onLine) {
                    resolve(); // khách hoặc offline — đi tiếp với local
                } else {
                    setTimeout(tick, 100);
                }
            };
            tick();
        });
    }
    return Promise.race([_studyPullPromise, new Promise(r => setTimeout(r, timeoutMs))]);
}

// ---- Hai nhánh offline, một lượt nộp (quiz-attempt.js) ----
// Hai máy làm CÙNG một lượt (cùng attemptId, cùng đề): câu chỉ một máy trả lời → gộp tự động; cả hai trả lời KHÁC nhau ở cùng câu → giữ cả hai
// nhánh, ghi lại xung đột để lần bấm "Làm tiếp" hỏi người học chọn nhánh, rồi đưa tới đúng câu khác đầu tiên (quiz-page.js).
// So theo NỘI DUNG câu trả lời, không theo giờ máy (lệch đồng hồ / kết nối lại ngược thứ tự không đổi kết quả).
const _conflicts = new Map();   // quizId -> { attemptId, at, other }
/** Xung đột nhánh đang chờ người học chọn cho lượt dở hiện tại của bộ đề (hoặc null). */
export function branchConflict(quizId) {
    const c = _conflicts.get(quizId);
    const local = readQuizStateLight(quizId);
    return c && local && !local.finished && local.attemptId === c.attemptId ? c : null;
}
export function resolveBranchConflict(quizId) { _conflicts.delete(quizId); }

function emitSynced(detail) {
    const ev = new CustomEvent('quiz-state-synced', { bubbles: true, detail });
    document.dispatchEvent(ev);
    window.dispatchEvent(ev);
}

function reconcileProgress(uid, quizId, cloud) {
    const local = readQuizState(quizId);
    const isPlaying = document.getElementById('quiz-container') && !document.getElementById('quiz-container').classList.contains('hidden');
    const pushMine = () => { if (local && !local.finished) scheduleCloudProgressPush(uid, quizId, () => readQuizState(quizId), 500); };
    if (!cloud) { pushMine(); return; }
    const fin = cloud.finished;
    const finishedHere = (b) => !!(fin && b && (fin.attemptId ? fin.attemptId === b.attemptId
        : (Number(fin.savedAt) || 0) >= (Number(b.savedAt) || 0)));   // dấu đời cũ không có attemptId: theo giờ như trước
    // 1. Lượt này đã nộp / bỏ ở máy khác
    if (local && !local.finished && finishedHere(local)) {
        if (!isPlaying) { markQuizStateFinished(quizId); emitSynced({ finished: true }); }
        return;
    }
    if (isPlaying) { pushMine(); return; }

    const me = deviceId();
    const others = Object.entries(cloud.branches || {}).filter(([dev]) => dev !== me).map(([, b]) => b)
        .filter(b => b && !b.finished && !finishedHere(b));
    if (cloud.legacy && !finishedHere(cloud.legacy)) others.push(cloud.legacy);      // máy còn chạy bản cũ (một trường inProgress)
    const mine = local && !local.finished ? local : null;
    const newest = (arr) => arr.slice().sort((a, b) => (Number(b.savedAt) || 0) - (Number(a.savedAt) || 0))[0];

    if (!mine) {
        // Máy này không có lượt dở → nhận nhánh mới nhất của máy khác (làm tiếp ở đây sẽ thành nhánh của máy này, cùng attemptId)
        const best = newest(others);
        if (best) { writeQuizState(quizId, best); emitSynced({ progress: best }); }
        return;
    }
    const twins = others.filter(b => sameAttempt(mine, b));
    if (twins.length) {
        let merged = mine, conflict = null;
        twins.forEach(b => {
            const at = firstDivergence(merged, b);
            if (at < 0) merged = mergeBranches(merged, b);
            else if (!conflict || at < conflict.at) conflict = { attemptId: mine.attemptId, at, other: b };
        });
        if (conflict) _conflicts.set(quizId, conflict); else _conflicts.delete(quizId);
        if (merged !== mine) {
            merged.questions = mine.questions;            // giữ bộ câu đang làm trong máy (cùng lượt = cùng đề)
            writeQuizState(quizId, merged);
            emitSynced({ progress: merged, merged: true });
        } else if (conflict) emitSynced({ conflict: true });
        pushMine();
        return;
    }
    // Lượt KHÁC ở máy khác: giữ cách cũ — lượt mới hơn thay vào trang chờ (giờ máy chỉ dùng để chọn giữa hai lượt khác nhau)
    const best = newest(others);
    if (best && (Number(best.savedAt) || 0) > (Number(mine.savedAt) || 0)) { writeQuizState(quizId, best); emitSynced({ progress: best }); }
    else pushMine();
}

export function pullStudyFromCloud(quizId) {
    const run = (uid) => {
        if (_studyPulled || !uid) return;
        _studyPulled = true;
        _studyPullPromise = syncPullStudy(uid, quizId, { preferCloud: false }).then(() => {
            // Sao lưu ngay bản đã hợp nhất (đề phòng ghi chú cũ chỉ có ở máy này)
            scheduleCloudPush(uid, quizId, 800);
            // Nếu đang hiển thị một câu hỏi, vẽ lại để áp dụng ghi chú/annotation mới kéo về
            const sec = document.getElementById('quizSection');
            if (state.questions && state.questions.length && sec && !sec.classList.contains('hidden')) {
                try { showQuestion(); } catch (e) {}
            }
            // Báo cho các UI đọc dữ liệu học tập (card Ôn ngắt quãng...) vẽ lại
            document.dispatchEvent(new CustomEvent('quiz-study-pulled', { bubbles: true }));
            window.dispatchEvent(new CustomEvent('quiz-study-pulled'));

            // Đồng bộ tiến trình bài làm dở giữa các thiết bị — theo NHÁNH từng máy (quiz-study-store.js pushCloudProgress)
            fetchCloudProgress(uid, quizId).then((cloud) => reconcileProgress(uid, quizId, cloud))
                .catch((err) => console.warn('Không tải được tiến trình từ cloud:', err));
        });
        // Quay lại tab / mở lại app (≥ 60s sau lần kéo trước): kéo lại để thấy ghi chú vừa viết ở máy khác.
        // Chỉ vẽ lại câu khi annotation thật sự đổi và không đang viết dở ghi chú.
        let lastPull = Date.now();
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible' || Date.now() - lastPull < 60000 || !navigator.onLine) return;
            lastPull = Date.now();
            const key = studyKeys(quizId).annot, before = localStorage.getItem(key);
            syncPullStudy(uid, quizId).then(() => {
                scheduleCloudPush(uid, quizId, 800);
                const sec = document.getElementById('quizSection');
                if (localStorage.getItem(key) === before || document.getElementById('annot-note-pop')) return;
                if (state.questions && state.questions.length && sec && !sec.classList.contains('hidden')) {
                    try { showQuestion(); } catch (e) {}
                }
            });
        });
    };
    const u = sessionUser();
    if (u) run(u.uid);
    else onSessionUser((x) => { if (x) run(x.uid); });
}
