// File: core/require-login.js
// Cổng đăng nhập dùng chung. Vì sao cần: các tính năng "tạo ra dữ liệu" (viết bệnh án,
// tạo checklist, thêm bộ đề) trước đây chạy được ở chế độ khách nhưng chỉ lưu localStorage
// → người dùng mất dữ liệu khi đổi máy/xoá cache, còn máy chủ thì luôn từ chối (firestore.rules
// bắt request.auth != null). Chặn ngay từ đầu thật thà hơn là cho làm rồi mới báo lỗi lúc lưu.
//
// Hai kiểu dùng:
//   requireLogin('Tên tính năng')  -> trong SPA index.html: mở modal đăng nhập, trả false
//   guardPage('Tên tính năng')     -> trang riêng: phủ lớp chặn toàn màn hình
import { onSessionUser } from './auth-session.js';

const ROOT = new URL('../', import.meta.url).href;   // thư mục gốc web, tính từ /core/

let user = null, resolved = false;
const waiters = [];
onSessionUser(u => {
    user = u;
    if (!resolved) { resolved = true; waiters.splice(0).forEach(f => f()); }
});

/** Đợi Firebase trả lời xong rồi mới kết luận có đăng nhập hay không (tránh nháy "Khách"). */
export function whenAuthKnown() {
    return resolved ? Promise.resolve(user) : new Promise(r => waiters.push(() => r(user)));
}

const PERKS = [
    'Đồng bộ bộ đề, bệnh án, checklist giữa điện thoại và máy tính',
    'Lưu lịch sử làm bài, thống kê tiến bộ và lịch ôn ngắt quãng',
    'Không mất dữ liệu khi xoá cache hay đổi thiết bị',
    'Chia sẻ bộ đề và thư mục cho bạn bè bằng link'
];

function gateHtml(feature, blocking) {
    const back = blocking
        ? `<a href="${ROOT}index.html" style="display:block;margin-top:10px;color:#9ca3af;font-size:13px;text-decoration:none">Về trang chủ</a>`
        : '';
    return `
<div style="background:#fff;border-radius:24px;max-width:400px;width:100%;padding:28px 24px;text-align:center;
            box-shadow:0 20px 50px rgba(0,0,0,.25);font-family:system-ui,-apple-system,'Segoe UI',sans-serif">
  <div style="width:60px;height:60px;margin:0 auto 14px;border-radius:50%;display:flex;align-items:center;
              justify-content:center;background:linear-gradient(135deg,#FF69B4,#D8BFD8);font-size:26px">🔒</div>
  <h2 style="margin:0 0 6px;font-size:20px;font-weight:800;color:#1f2937">Cần đăng nhập</h2>
  <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.5">
    <b style="color:#FF69B4">${feature}</b> chỉ dành cho tài khoản đã đăng nhập.</p>
  <ul style="margin:0 0 20px;padding:0;list-style:none;text-align:left;font-size:13px;color:#4b5563;line-height:1.6">
    ${PERKS.map(p => `<li style="margin-bottom:6px">✓ ${p}</li>`).join('')}
  </ul>
  <a href="${ROOT}index.html?next=${encodeURIComponent(location.href)}"
     style="display:block;padding:13px;border-radius:14px;background:linear-gradient(90deg,#FF69B4,#FF8DC7);
            color:#fff;font-weight:700;text-decoration:none;font-size:15px">Đăng nhập / Đăng ký</a>
  ${back}
</div>`;
}

function showOverlay(feature, blocking) {
    if (document.getElementById('login-gate')) return;
    const el = document.createElement('div');
    el.id = 'login-gate';
    // KHÔNG dùng backdrop-filter: nó tạo containing block mới, phá position:fixed của trang bên dưới.
    el.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(17,24,39,.72);' +
                       'display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto';
    el.innerHTML = gateHtml(feature, blocking);
    document.body.appendChild(el);
    if (blocking) document.documentElement.style.overflow = 'hidden';
}

/**
 * Dùng trong SPA (index.html): mở sẵn modal đăng nhập của trang chủ nếu có.
 * @returns {Promise<boolean>} true nếu được phép đi tiếp.
 */
export async function requireLogin(feature) {
    if (await whenAuthKnown()) return true;
    if (typeof window.openAuthModal === 'function') window.openAuthModal(feature);
    else showOverlay(feature, false);
    return false;
}

function hideOverlay() {
    document.getElementById('login-gate')?.remove();
    document.documentElement.style.overflow = '';
}

// Cùng khoá với core/auth-session.js: chỉ cần biết MÁY NÀY đã từng đăng nhập hay chưa.
function neverSignedIn() {
    try { return !localStorage.getItem('lastAuthUser'); } catch (e) { return false; }
}

/**
 * Dùng ở đầu một trang riêng: chưa đăng nhập thì phủ lớp chặn, không cho thao tác.
 * Máy chưa từng đăng nhập thì chặn NGAY, không đợi Firebase — trang nặng mất vài giây
 * mới biết danh tính, đủ để khách gõ cả đoạn rồi mới bị chặn (và mất công gõ).
 * Máy đã từng đăng nhập thì chờ xác nhận, tránh nháy lớp chặn oan.
 */
export async function guardPage(feature) {
    if (neverSignedIn()) showOverlay(feature, true);
    if (await whenAuthKnown()) { hideOverlay(); return true; }
    showOverlay(feature, true);
    return false;
}
