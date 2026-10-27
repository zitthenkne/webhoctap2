// File: features/quiz/local-shelf.js
// "TRÊN MÁY NÀY" — kệ đề cục bộ, không cần tài khoản (giống mục "Gần đây" của Google Drive):
//   1. Bộ đề / thư mục của NGƯỜI KHÁC mà máy này đã mở bằng link (công khai hoặc chia sẻ riêng) → mở lại, ghim, xóa khỏi kệ
//      ở trang "Được chia sẻ với tôi" (folder.html?shared=me) — kể cả khách chưa đăng nhập.
//   2. Kết quả làm bài của KHÁCH (chưa đăng nhập) → lưu trong máy; đăng nhập xong tự đẩy lên tài khoản (quiz_results) rồi xóa bản máy.
// Nội dung câu hỏi KHÔNG lưu ở đây: trang làm bài đã tự lưu bộ đề vào IndexedDB (quiz-offline-store.js) → mở lại được cả khi mất mạng.
// Mọi thứ nằm trong localStorage của trình duyệt này: xóa dữ liệu trình duyệt là mất (giao diện có nói rõ).
import { db } from '../../core/firebase-init.js';
import { doc, collection, setDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const SHELF_KEY = 'localShelf_v1';
const RESULTS_KEY = 'guestResults_v1';
const SHELF_MAX = 200;
const RESULTS_MAX = 300;

const load = (key) => { try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
const save = (key, list) => { try { localStorage.setItem(key, JSON.stringify(list)); return true; } catch (e) { return false; } };
const keyOf = (kind, id) => `${kind}:${id}`;

// ---------- Kệ: mục đã mở ----------
/** Ghi nhớ một bộ đề / thư mục vừa mở (cập nhật tên + giờ mở; giữ ghim). */
export function rememberOpened({ kind, id, title, count, ownerName, access }) {
    if (!kind || !id) return;
    const list = load(SHELF_KEY);
    const k = keyOf(kind, id);
    const old = list.find(x => keyOf(x.kind, x.id) === k);
    const item = {
        ...(old || {}), kind, id,
        title: String(title || old?.title || (kind === 'folder' ? 'Thư mục' : 'Bộ đề')).slice(0, 200),
        count: Number.isFinite(count) ? count : old?.count,
        ownerName: ownerName || old?.ownerName || '',
        access: access || old?.access || '',            // 'public' | 'shared'
        openedAt: Date.now()
    };
    const rest = list.filter(x => keyOf(x.kind, x.id) !== k);
    // Đầy kệ: bỏ mục cũ nhất KHÔNG ghim
    while (rest.length >= SHELF_MAX) {
        let idx = -1;
        rest.forEach((x, i) => { if (!x.pinned && (idx < 0 || x.openedAt < rest[idx].openedAt)) idx = i; });
        if (idx < 0) break;
        rest.splice(idx, 1);
    }
    save(SHELF_KEY, [item, ...rest]);
}

/** Mục trên kệ: ghim trước, rồi mở gần nhất trước. */
export function listShelf() {
    return load(SHELF_KEY).sort((a, b) => (b.pinned === true) - (a.pinned === true) || (b.openedAt || 0) - (a.openedAt || 0));
}
export function forgetShelf(kind, id) {
    save(SHELF_KEY, load(SHELF_KEY).filter(x => keyOf(x.kind, x.id) !== keyOf(kind, id)));
}
export function togglePinShelf(kind, id) {
    const list = load(SHELF_KEY);
    const it = list.find(x => keyOf(x.kind, x.id) === keyOf(kind, id));
    if (it) { it.pinned = !it.pinned; save(SHELF_KEY, list); }
    return !!it?.pinned;
}
export function clearShelf() { save(SHELF_KEY, load(SHELF_KEY).filter(x => x.pinned)); }

// ---------- Kết quả làm bài của khách ----------
/** Lưu một lượt làm bài khi CHƯA đăng nhập. Trả id để màn kết quả cập nhật điểm tự chấm tự luận. */
export function saveLocalResult(r) {
    const id = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const list = load(RESULTS_KEY);
    list.unshift({ id, ...r, completedAt: Date.now() });
    if (list.length > RESULTS_MAX) list.length = RESULTS_MAX;
    return save(RESULTS_KEY, list) ? id : null;
}
export function updateLocalResult(id, patch) {
    const list = load(RESULTS_KEY);
    const it = list.find(x => x.id === id);
    if (it) { Object.assign(it, patch); save(RESULTS_KEY, list); }
}
export function listLocalResults(quizId) {
    const all = load(RESULTS_KEY);
    return quizId ? all.filter(x => x.quizId === quizId) : all;
}
/** Lượt gần nhất + điểm cao nhất của một bộ đề (để hiện trên kệ). */
export function localStatsFor(quizId) {
    const rs = listLocalResults(quizId);
    if (!rs.length) return null;
    return { last: rs[0], best: rs.reduce((m, x) => (x.percentage > m.percentage ? x : m), rs[0]), count: rs.length };
}

let syncing = false;
/**
 * Đăng nhập rồi: đẩy kết quả khách lên quiz_results của tài khoản (luật: userId == mình + điểm hợp lệ), đẩy xong mới xóa bản máy.
 * Lỗi giữa chừng → giữ lại phần chưa lên, lần sau thử tiếp. Trả số lượt đã đẩy.
 */
export async function syncLocalResults(uid) {
    if (!uid || syncing || navigator.onLine === false) return 0;
    const list = load(RESULTS_KEY);
    if (!list.length) return 0;
    syncing = true;
    const left = [];
    let done = 0;
    try {
        for (const r of list) {
            try {
                await setDoc(doc(collection(db, 'quiz_results')), {
                    userId: uid,
                    quizId: r.quizId || null,
                    quizTitle: r.quizTitle || '',
                    score: Number(r.score) || 0,
                    totalQuestions: Math.max(0, Math.min(5000, parseInt(r.totalQuestions, 10) || 0)),
                    timeTaken: r.timeTaken ?? null,
                    percentage: Math.max(0, Math.min(100, Number(r.percentage) || 0)),
                    completedAt: new Date(r.completedAt || Date.now()),
                    fromGuest: true
                });
                done++;
            } catch (e) { left.push(r); }
        }
    } finally {
        save(RESULTS_KEY, left);
        syncing = false;
    }
    return done;
}
