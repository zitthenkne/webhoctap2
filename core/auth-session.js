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
import { onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

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
onAuthStateChanged(auth, (u) => { if (isReal(u)) { remember(u); if (!u.emailVerified) refreshEmailVerified(); } });

// XÁC NHẬN EMAIL: bấm link trong mail (ở tab/máy khác) không đổi phiên đang mở — `emailVerified` và token cũ vẫn ghi "chưa xác nhận",
// luật chia sẻ riêng (firestore.rules sharedWithMe) vẫn từ chối. Tài khoản chưa xác nhận thì hỏi lại máy chủ lúc mở trang và mỗi lần
// quay lại tab (tối đa 1 lần / 60 giây cho cả phiên tab — mốc lưu sessionStorage nên chuyển trang không hỏi lại); vừa xác nhận xong thì xin
// token mới và báo 'auth:verified'. force: nơi THẬT cần biết ngay (mở thư mục/bộ đề chia sẻ riêng bị chặn) — bỏ qua mốc.
const VERIFY_GAP_MS = 60000;
let lastVerifyCheck = 0;
function verifyCheckedAt() {
    try { return Math.max(lastVerifyCheck, Number(sessionStorage.getItem('verifyCheckAt')) || 0); } catch (e) { return lastVerifyCheck; }
}
export async function refreshEmailVerified({ force = false } = {}) {
    const u = auth.currentUser;
    if (!isReal(u)) return false;
    if (u.emailVerified) return true;
    if (!force && Date.now() - verifyCheckedAt() < VERIFY_GAP_MS) return false;
    lastVerifyCheck = Date.now();
    try { sessionStorage.setItem('verifyCheckAt', String(lastVerifyCheck)); } catch (e) { /* chế độ riêng tư */ }
    try {
        await u.reload();
        if (!auth.currentUser?.emailVerified) return false;
        await auth.currentUser.getIdToken(true);
        window.dispatchEvent(new CustomEvent('auth:verified'));
        return true;
    } catch (e) { return false; }
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine !== false) refreshEmailVerified();
});

// Bấm link trong mail xong, trang xác nhận của Firebase có nút "Tiếp tục" quay về đây (phải là tên miền đã khai ở Firebase Auth → Authorized domains).
const actionSettings = () => ({ url: location.origin + '/index.html' });

/** Gửi (lại) mail xác nhận cho tài khoản đang đăng nhập. Lỗi → ném (thông điệp đã dịch: authErrorVi). */
export async function sendVerifyMail() {
    const u = auth.currentUser;
    if (!isReal(u)) throw new Error('Bạn cần đăng nhập trước.');
    try { await sendEmailVerification(u, actionSettings()); }
    catch (e) {
        // Tên miền chưa khai (chạy localhost, bản xem trước Vercel…) → gửi mail không kèm nút quay về
        if (e?.code === 'auth/unauthorized-continue-uri' || e?.code === 'auth/invalid-continue-uri') await sendEmailVerification(u);
        else throw e;
    }
}

/** Gửi mail đặt lại mật khẩu. Firebase không báo email có tồn tại hay không (chống dò tài khoản). */
export async function sendResetMail(email) {
    try { await sendPasswordResetEmail(auth, email, actionSettings()); }
    catch (e) {
        if (e?.code === 'auth/unauthorized-continue-uri' || e?.code === 'auth/invalid-continue-uri') await sendPasswordResetEmail(auth, email);
        else throw e;
    }
}

const AUTH_ERRORS = {
    'auth/invalid-credential': 'Sai email/tên hoặc mật khẩu.',
    'auth/wrong-password': 'Sai mật khẩu.',
    'auth/user-not-found': 'Không có tài khoản với email này.',
    'auth/invalid-email': 'Email không hợp lệ.',
    'auth/email-already-in-use': 'Email này đã có tài khoản — hãy đăng nhập (hoặc bấm "Quên mật khẩu").',
    'auth/weak-password': 'Mật khẩu quá yếu (tối thiểu 6 ký tự).',
    'auth/too-many-requests': 'Thử quá nhiều lần. Đợi vài phút rồi thử lại nhé.',
    'auth/network-request-failed': 'Mất kết nối mạng.',
    'auth/user-disabled': 'Tài khoản này đã bị khóa.',
    'auth/requires-recent-login': 'Vì an toàn, hãy đăng xuất rồi đăng nhập lại và thử lại.',
};
/** Lỗi Firebase Auth → câu tiếng Việt dễ hiểu. */
export function authErrorVi(e) {
    return AUTH_ERRORS[e?.code] || e?.message || 'Lỗi không xác định.';
}

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

/**
 * Chờ Firebase Auth khôi phục phiên, với thời gian chờ riêng cho từng caller.
 * Cực kỳ quan trọng trước khi gửi query Firestore đối với các tài liệu riêng tư (private quiz),
 * tránh gửi request khi request.auth == null làm Firestore Rules từ chối quyền truy cập.
 */
export async function whenAuthReady(timeoutMs = 4000) {
    if (auth.currentUser) return auth.currentUser;
    let timer;
    try {
        // Timeout của một caller không hủy việc khôi phục phiên hay giữ kết quả cũ cho lần sau.
        await Promise.race([
            auth.authStateReady(),
            new Promise(resolve => { timer = setTimeout(resolve, timeoutMs); })
        ]);
        return auth.currentUser || (navigator.onLine === false ? cached() : null);
    } finally { clearTimeout(timer); }
}
