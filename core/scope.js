// File: core/scope.js
// KHO OFFLINE THEO TÀI KHOẢN + PHẠM VI CHIA SẺ MÁY (2026-11-10).
//
// Vì sao: bài làm dở, ghi chú, dấu tô, lịch ôn, chỉnh sửa câu, nét vẽ, danh sách đề đã tải… nằm ở localStorage KHÔNG theo tài khoản —
// đổi tài khoản trên cùng máy là người sau thấy (và lần đẩy cloud đang chờ còn gửi dữ liệu của người trước vào tài khoản người sau).
//
// Cách làm (không phải đổi khóa ở hàng chục chỗ đọc / ghi):
//   - Mọi khóa RIÊNG TƯ (PRIVATE_PREFIXES) thuộc về một danh tính `privOwner` (uid, hoặc 'guest').
//   - Đổi danh tính (đăng nhập tài khoản khác / đăng xuất): cất khóa của người cũ sang "@<uid>:<khóa>" (không ai đọc tới), lấy ra khóa đã
//     cất của người mới. Báo 'scope:changed' → các hàng gửi chờ (quiz-study-store.js) hủy lượt đẩy của người cũ — dữ liệu và "bản gốc"
//     của họ còn trong ngăn cất, đăng nhập lại là gửi nốt đúng tài khoản. Lệnh ghi Firestore đang xếp hàng thì SDK tự giữ theo từng
//     người dùng (chỉ gửi khi đúng người đó đăng nhập lại).
//   - Bản đề tải offline (IndexedDB) mang `_owner`; người khác không đọc được (quiz-offline-store.js).
//   - CHẾ ĐỘ MÁY (đổi ở Hồ sơ → Thiết bị, không hỏi): "Máy cá nhân" (mặc định) giữ nội dung offline như trên. "Máy dùng chung": không lưu đề về máy, Firestore chỉ đệm trong
//     bộ nhớ của trang (core/firebase-init.js), đổi người / đăng xuất là XÓA hẳn dữ liệu riêng (không cất) — người sau không thấy gì.
// Khách (chưa đăng nhập) đăng nhập lần đầu trên MÁY CÁ NHÂN: dữ liệu khách theo vào tài khoản (thường là cùng một người).

const OWNER_KEY = 'privOwner';
const MODE_KEY = 'deviceMode';          // 'personal' | 'shared'
export const PRIVATE_PREFIXES = [
    'quizState_', 'quizStateQ_', 'quiz_notes_', 'quiz_marks_', 'quiz_annot_', 'quiz_study_base_',
    'quiz_srs_', 'quizSrsSum_', 'quiz_qedits_', 'quiz_scratch_', 'quiz_ink_', 'quiz_essay_',
    'zitthenkne_offline_quiz_ids',
];
const isPrivate = (k) => PRIVATE_PREFIXES.some(p => k.startsWith(p));
const stash = (owner) => `@${owner}:`;

// MÁY CỦA TÔI: máy này nằm trong danh sách máy hợp lệ của tài khoản (máy chủ ghi — core/device-limit.js watchDevices đánh dấu / bỏ dấu).
// Lưu uid trong localStorage để biết cả khi mất mạng. Đủ điều kiện này là được làm offline (features/quiz/quiz-offline-store.js).
const MINE_KEY = 'deviceMine';
export function markMine(uid) { try { localStorage.setItem(MINE_KEY, uid); } catch (e) {} }
export function clearMine() { try { localStorage.removeItem(MINE_KEY); } catch (e) {} }
/** Máy này đã được máy chủ nhận là máy của tài khoản `uid`? (đọc đồng bộ, dùng được khi offline) */
export function isMyDevice(uid) { try { return !!uid && localStorage.getItem(MINE_KEY) === uid; } catch (e) { return false; } }

export function deviceMode() {
    try { return localStorage.getItem(MODE_KEY) === 'shared' ? 'shared' : 'personal'; } catch (e) { return 'personal'; }
}
/** Danh tính sở hữu dữ liệu riêng đang nằm trong máy (uid | 'guest'). */
export function currentOwner() {
    try { return localStorage.getItem(OWNER_KEY) || lastUid() || 'guest'; } catch (e) { return 'guest'; }
}
function lastUid() {
    try { const u = JSON.parse(localStorage.getItem('lastAuthUser') || 'null'); return u && u.uid && u.email ? u.uid : null; }
    catch (e) { return null; }
}
const keysWhere = (pred) => {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && pred(k)) out.push(k); }
    return out;
};

/** Chuyển phạm vi dữ liệu riêng sang `owner`. Trả true nếu có đổi (khi đó đã báo 'scope:changed'). */
export function switchScope(owner) {
    owner = owner || 'guest';
    try {
        const cur = localStorage.getItem(OWNER_KEY);
        if (!cur) { localStorage.setItem(OWNER_KEY, owner); return false; }   // lần đầu: dữ liệu đang có thuộc về người đang dùng
        if (cur === owner) return false;
        const shared = deviceMode() === 'shared';
        const adoptGuest = cur === 'guest' && !shared && !keysWhere(k => k.startsWith(stash(owner))).length;
        if (!adoptGuest) {
            keysWhere(isPrivate).forEach(k => {
                const v = localStorage.getItem(k);
                localStorage.removeItem(k);
                if (!shared) { try { localStorage.setItem(stash(cur) + k, v); } catch (e) { /* đầy bộ nhớ: bỏ, KHÔNG để lộ cho người sau */ } }
            });
        }
        keysWhere(k => k.startsWith(stash(owner))).forEach(sk => {
            const v = localStorage.getItem(sk);
            localStorage.removeItem(sk);
            try { localStorage.setItem(sk.slice(stash(owner).length), v); } catch (e) {}
        });
        localStorage.setItem(OWNER_KEY, owner);
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('scope:changed', { detail: { from: cur, to: owner } }));
        return true;
    } catch (e) { return false; }
}

/** Đổi chế độ máy. Sang "dùng chung": xóa dữ liệu riêng đã cất của mọi người khác + đề offline + đệm Firestore (ở lần tải trang sau). */
export async function setDeviceMode(mode) {
    const shared = mode === 'shared';
    try {
        localStorage.setItem(MODE_KEY, shared ? 'shared' : 'personal');
        if (shared) {
            keysWhere(k => k[0] === '@' && k.includes(':')).forEach(k => localStorage.removeItem(k));
            localStorage.setItem('fsWipeCache', '1');                 // core/firebase-init.js xóa kho đệm Firestore trước khi khởi tạo
            try { (await import('../features/quiz/quiz-offline-store.js')).wipeAllOffline(); } catch (e) {}
        }
    } catch (e) {}
}

/**
 * Máy dùng chung: dữ liệu riêng chỉ sống trong MỘT phiên trình duyệt. Mở trình duyệt lại (không còn tab nào của web đang mở — hỏi qua
 * BroadcastChannel) = phiên mới → trả true để nơi gọi đăng xuất + xóa dữ liệu riêng. Máy cá nhân luôn false.
 */
export function isNewSharedSession() {
    if (deviceMode() !== 'shared' || typeof BroadcastChannel === 'undefined') return Promise.resolve(false);
    let alive = false;
    try { alive = sessionStorage.getItem('sharedAlive') === '1'; sessionStorage.setItem('sharedAlive', '1'); } catch (e) {}
    const ch = new BroadcastChannel('zt-shared-session');
    ch.onmessage = (e) => { if (e.data === 'ping') ch.postMessage('pong'); else if (e.data === 'pong') alive = true; };
    if (alive) return Promise.resolve(false);
    ch.postMessage('ping');
    return new Promise(r => setTimeout(() => r(!alive), 250));
}
/** Xóa sạch dữ liệu riêng (của mọi danh tính) khỏi máy — máy dùng chung, đầu phiên mới. */
export function wipePrivate() {
    try {
        keysWhere(k => isPrivate(k) || (k[0] === '@' && k.includes(':'))).forEach(k => localStorage.removeItem(k));
        localStorage.setItem(OWNER_KEY, 'guest');
    } catch (e) {}
}
