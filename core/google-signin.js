// File: core/google-signin.js
// MỞ CHỌN GMAIL: popup hay chuyển trang (redirect)?
// Web cài ra màn hình chính (chế độ APP — Android lẫn iPhone/iPad): popup Google là cửa sổ ngoài app → máy mở trong khung trình duyệt
// CÓ THANH ĐỊA CHỈ, và hay không tự đóng được (iPhone gần như luôn kẹt) → người dùng kẹt lại dùng web trong khung đó, mất toàn màn hình.
// Nên ở chế độ app: chuyển hẳn trang sang Google rồi quay về đúng trang cũ (thanh địa chỉ chỉ hiện lúc đang chọn Gmail).
// Trình duyệt thường vẫn dùng popup (không mất trang đang làm dở).
// Kết quả redirect xử lý ở CHÍNH trang đã bấm: trang đó gọi resumeGoogle(tag) lúc mở rồi làm nốt phần sau đăng nhập như với popup.
// Redirect cần authDomain CÙNG tên miền web (firebase-init.js + vercel.json chuyển /__/auth) — khác tên miền thì Safari chặn bộ nhớ bên thứ ba, quay về trắng tay.
// browserPopupRedirectResolver chỉ truyền lúc gọi, không gắn vào initializeAuth (firebase-init.js: gắn sẵn thì mọi trang tải thêm iframe ~550ms).
import { auth } from './firebase-init.js';
import {
    GoogleAuthProvider, signInWithPopup, linkWithPopup, signInWithRedirect, linkWithRedirect, getRedirectResult, browserPopupRedirectResolver
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const PENDING_KEY = 'googleRedirect';
const PENDING_MAX_MS = 10 * 60 * 1000;

/** Đang chạy như app cài trên màn hình chính (navigator.standalone: iPhone/iPad đời cũ chưa hiểu display-mode). */
export function isAppMode() {
    try {
        return navigator.standalone === true || ['standalone', 'fullscreen', 'minimal-ui'].some(m => matchMedia(`(display-mode: ${m})`).matches);
    } catch (e) { return false; }
}

/** Người dùng tự đóng / quay lại khi đang chọn Gmail — không phải lỗi, khỏi báo. */
export function isCancelled(e) {
    return ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/redirect-cancelled-by-user', 'auth/user-cancelled'].includes(e?.code);
}

/**
 * Mở chọn Gmail. kind 'signin' = đăng nhập, 'link' = gắn Google vào `user`. params: thêm vào setCustomParameters (login_hint…).
 * tag: nơi gọi — resumeGoogle(tag) ở trang đó nhận lại kết quả; data: thứ cần mang qua lần chuyển trang (JSON, nằm sessionStorage của tab).
 * Trình duyệt thường: trả UserCredential như popup. Chế độ app: trang chuyển sang Google, promise không bao giờ xong.
 */
export async function openGoogle({ kind = 'signin', user = null, tag, data = null, params = {} }) {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account', ...params });
    let redirect = isAppMode();
    if (redirect) {
        // Không ghi được sessionStorage (chế độ riêng tư…) thì quay về cũng không biết làm nốt gì → đành popup
        try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ tag, data, at: Date.now() })); } catch (e) { redirect = false; }
    }
    if (!redirect) {
        return kind === 'link'
            ? linkWithPopup(user, provider, browserPopupRedirectResolver)
            : signInWithPopup(auth, provider, browserPopupRedirectResolver);
    }
    try {
        if (kind === 'link') await linkWithRedirect(user, provider, browserPopupRedirectResolver);
        else await signInWithRedirect(auth, provider, browserPopupRedirectResolver);
    } catch (e) {
        try { sessionStorage.removeItem(PENDING_KEY); } catch (_) {}
        throw e;
    }
    return new Promise(() => {});
}

/**
 * Vừa chọn Gmail xong quay về (chế độ app)? null = không có gì đang chờ cho `tag` (hoặc người dùng bấm quay lại giữa chừng).
 * Có: { data, result } — result là UserCredential như popup trả. Lỗi (Gmail đã gắn tài khoản khác…) thì ném như popup.
 */
export async function resumeGoogle(tag) {
    let p = null;
    try { p = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null'); } catch (e) { return null; }
    if (!p || p.tag !== tag) return null;
    try { sessionStorage.removeItem(PENDING_KEY); } catch (e) {}
    if (Date.now() - (p.at || 0) > PENDING_MAX_MS) return null;
    const result = await getRedirectResult(auth, browserPopupRedirectResolver);
    return result ? { data: p.data, result } : null;
}
