// File: core/auth-session.js
// Vì sao cần: mở app khi MẤT MẠNG mà ID token đã hết hạn (token chỉ sống 1 giờ),
// Firebase Auth không gọi được máy chủ để làm mới nên onAuthStateChanged trả NULL —
// app hiện "Khách", thư viện trống; có mạng lại thì tự đăng nhập (refresh token vẫn còn).
//
// Cách chữa: nhớ danh tính lần đăng nhập gần nhất vào localStorage. Khi offline mà
// Firebase chưa/không khôi phục được phiên thì vẫn coi như đã đăng nhập:
// - đọc: Firestore trả dữ liệu từ cache IndexedDB (không cần token),
// - ghi: xếp hàng, gửi kèm token thật khi có mạng lại (xem core/offline-write.js).
// Chỉ tin bản lưu khi navigator.onLine === false; còn online mà auth trả null thì
// đúng là đã đăng xuất (không được tự cho đăng nhập, tránh gọi server thiếu token).
import { auth } from './firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const KEY = 'lastAuthUser';

// Tài khoản THẬT = đăng nhập bằng email. Người dùng ẩn danh (Firebase Anonymous) chỉ là khách vào phòng học bằng link:
// KHÔNG được coi là "đã đăng nhập" ở trang chủ / cổng đăng nhập (trước đây bị nhớ vào KEY rồi lọt qua mọi cổng).
const isReal = (u) => !!u && !u.isAnonymous;

let persistAsked = false;
function remember(u) {
    // Xin trình duyệt đừng tự dọn dữ liệu của site (phiên đăng nhập, bản offline) khi máy thiếu dung lượng. Chrome/Edge tự quyết
    // không hỏi; Firefox sẽ bật hộp xin quyền nên bỏ qua.
    if (!persistAsked) {
        persistAsked = true;
        try { if (!/firefox/i.test(navigator.userAgent)) navigator.storage?.persist?.().catch(() => {}); } catch (e) {}
    }
    try {
        localStorage.setItem(KEY, JSON.stringify({
            uid: u.uid,
            displayName: u.displayName || '',
            email: u.email || '',
            photoURL: u.photoURL || ''
        }));
    } catch (e) { /* hết dung lượng: chịu, chỉ mất tiện lợi */ }
}

function cached() {
    try {
        const u = JSON.parse(localStorage.getItem(KEY) || 'null');
        // bản lưu của khách ẩn danh (từng bị ghi nhầm) không có email -> bỏ
        return u && u.uid && u.email ? { ...u, offline: true } : null;
    } catch (e) { return null; }
}

// Tự ghi nhớ mỗi lần Firebase xác nhận có người đăng nhập. KHÔNG xoá khi trả null —
// null lúc offline chính là trường hợp ta muốn chữa; chỉ đăng xuất thật mới xoá.
onAuthStateChanged(auth, (u) => { if (isReal(u)) remember(u); });

/** Người dùng hiện tại: bản thật của Firebase, hoặc bản đã lưu từ trước. */
export function sessionUser() {
    return isReal(auth.currentUser) ? auth.currentUser : cached();
}

// Firebase báo "không còn phiên" trong khi máy đang online mà ta vừa hiện tên người dùng từ bản lưu: phiên đã mất thật
// (đổi mật khẩu ở máy khác, tài khoản bị khóa, xóa dữ liệu trình duyệt...). Trước đây app vẫn giả vờ đang đăng nhập nên mọi lần
// đọc/ghi Firestore lặng lẽ bị từ chối ("không đồng bộ") — nay báo thật một lần để người dùng đăng nhập lại.
let manualSignOut = false, lostShown = false;
function sessionLost() {
    if (lostShown || manualSignOut) return;
    lostShown = true;
    window.dispatchEvent(new CustomEvent('auth:lost'));
    if (!document.getElementById('toast-container')) return;
    import('./utils.js').then(({ showToast }) => showToast('Phiên đăng nhập đã hết hạn — đăng nhập lại để đồng bộ dữ liệu.', 'warning', 6000)).catch(() => {});
    if (typeof window.openAuthModal === 'function') window.openAuthModal('Phiên đăng nhập đã hết hạn');
}

/** Như onAuthStateChanged nhưng ưu tiên báo ngay từ cache (0ms) và giữ đăng nhập khi offline. */
export function onSessionUser(cb) {
    let last;
    const emit = (u) => {
        const key = u ? u.uid + (u.offline ? '~offline' : '') : '';
        if (key === last) return;
        last = key;
        cb(u);
    };
    const off = cached();
    if (off) emit(off);        // Hiện ngay lập tức danh tính người dùng (0ms), không nháy "Khách"
    return onAuthStateChanged(auth, (u) => {
        if (isReal(u)) {
            remember(u);
            emit(u);
        } else if (navigator.onLine === false) {
            emit(cached());          // offline: Firebase không làm mới được token -> tin bản lưu (đọc từ cache IndexedDB, ghi xếp hàng)
        } else {
            // online mà Firebase không có phiên = đã đăng xuất thật; bản lưu chỉ làm UI nói dối
            if (cached()) { dropCache(); sessionLost(); }
            emit(null);
        }
    });
}

/** Gọi khi người dùng CHỦ ĐỘNG đăng xuất, nếu không lần sau offline vẫn thấy đăng nhập. */
function dropCache() {
    try { localStorage.removeItem(KEY); } catch (e) {}
}
export function forgetSession() {
    manualSignOut = true;
    dropCache();
}

let _authReadyPromise = null;

/**
 * Chờ Firebase Auth khôi phục phiên (onAuthStateChanged trả về kết quả đầu tiên).
 * Cực kỳ quan trọng trước khi gửi query Firestore đối với các tài liệu riêng tư (private quiz),
 * tránh gửi request khi request.auth == null làm Firestore Rules từ chối quyền truy cập.
 */
export function whenAuthReady(timeoutMs = 4000) {
    if (auth.currentUser) return Promise.resolve(auth.currentUser);
    if (!_authReadyPromise) {
        _authReadyPromise = new Promise((resolve) => {
            let unsub = null;
            const timer = setTimeout(() => {
                if (unsub) {
                    try { unsub(); } catch (_) {}
                }
                resolve(auth.currentUser || cached());
            }, timeoutMs);

            unsub = onAuthStateChanged(auth, (u) => {
                clearTimeout(timer);
                if (unsub) {
                    try { unsub(); } catch (_) {}
                }
                resolve(u || cached());
            });
        });
    }
    return _authReadyPromise;
}
