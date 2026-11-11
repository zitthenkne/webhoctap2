// File: features/quiz/access-request.js
// Khối "GỬI YÊU CẦU TRUY CẬP" — hiện ở MỌI chỗ bị chặn: link riêng hết suất / hết hạn / thu hồi / bị gỡ (link.js), bộ đề riêng tư
// (quiz-session.js), thư mục riêng tư (folder.js). Bắt buộc tài khoản THẬT: đăng nhập Google, hoặc tài khoản email/mật khẩu có sẵn
// (khách ẩn danh không gửi được). Máy chủ: api/link.js (request / myRequest). Chủ duyệt ở hộp Chia sẻ (share-access.js) → người xin
// được 1 suất trên link → khối này tự chuyển sang link đó.
// Đăng nhập xong luôn TẢI LẠI trang: biết đâu tài khoản đó đã có quyền sẵn (được chia sẻ riêng, đang giữ suất trên link).
import { auth } from '../../core/firebase-init.js';
import { signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { openGoogle, resumeGoogle, isCancelled } from '../../core/google-signin.js';
import { apiUrl, deviceLabel } from '../../core/device-limit.js';

const CSS = `
.ar{margin-top:16px;padding:14px;border-radius:16px;background:#fff;border:1.5px dashed #F3C6D7;text-align:left;font-family:inherit;color:#3b2230}
.ar-h{margin:0 0 4px;font-size:.88rem;font-weight:800;display:flex;align-items:center;gap:7px}
.ar-h i{color:#E05A8E}
.ar-p{margin:0 0 10px;font-size:.8rem;font-weight:600;line-height:1.5;color:#8A7080}
.ar-p b{color:#6E3A55}
.ar-row{display:flex;flex-direction:column;gap:7px}
.ar-btn{height:42px;padding:0 16px;border:0;border-radius:13px;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-family:inherit;font-size:.86rem;font-weight:700;cursor:pointer;text-decoration:none}
.ar-btn svg{width:16px;height:16px;flex:none;background:#fff;border-radius:50%;padding:2px}
.ar-main{background:#FF7FB0;color:#fff;box-shadow:0 3px 0 #E05A8E}
.ar-main:disabled{opacity:.6;cursor:wait}
.ar-ghost{background:#fff;color:#8A5A72;border:1.5px solid #F0D3DF}
.ar-link{border:0;background:none;padding:2px 0;font-family:inherit;font-size:.76rem;font-weight:700;color:#A07086;text-decoration:underline;cursor:pointer;align-self:center}
.ar-in{width:100%;box-sizing:border-box;padding:9px 11px;border-radius:11px;border:1.5px solid #F0D3DF;font-family:inherit;font-size:.84rem;font-weight:600;color:#3b2230;outline:0;resize:vertical}
.ar-in:focus{border-color:#FF7FB0}
.ar-err{margin:0;font-size:.76rem;font-weight:700;color:#D14343}
.ar-ok{color:#15925F}
`;
function injectCss() {
    if (document.getElementById('ar-style')) return;
    const s = document.createElement('style');
    s.id = 'ar-style';
    s.textContent = CSS;
    document.head.appendChild(s);
}
// Logo Google vẽ sẵn (trang làm bài chỉ có bộ icon rút gọn fa-quiz.css, không có fa-google)
const G_LOGO = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

async function api(action, body) {
    const u = auth.currentUser;
    const r = await fetch(apiUrl('api/link'), {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', ...(u ? { Authorization: `Bearer ${await u.getIdToken()}` } : {}) },
        body: JSON.stringify({ action, ...body })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    return d;
}

/**
 * Gắn khối xin quyền vào `box`. target: { token } (link riêng) hoặc { kind: 'quiz'|'folder', id }.
 */
export async function mountAccessRequest(box, target) {
    if (!box) return;
    injectCss();
    box.className = 'ar';
    box.innerHTML = `<p class="ar-p" style="margin:0">Đang kiểm tra quyền truy cập…</p>`;
    // Chế độ app: chọn Gmail bằng chuyển trang → quay về đây làm nốt
    try { if (await resumeGoogle('access-req')) return location.reload(); } catch (e) { /* lỗi chọn Gmail → hiện lại nút */ }
    try { await auth.authStateReady(); } catch (e) {}
    const u = auth.currentUser;
    if (!u || u.isAnonymous) return paintLogin(box);
    let r = { status: 'none' };
    try { r = await api('myRequest', target); } catch (e) { /* không rõ → cho gửi */ }
    if (r.status === 'owner') { box.remove(); return; }
    if (r.status === 'approved' && r.token) {
        box.innerHTML = `<p class="ar-h ar-ok"><i class="fas fa-check"></i> Yêu cầu đã được duyệt</p><p class="ar-p">Đang mở…</p>`;
        location.replace(new URL(`features/quiz/link.html?t=${encodeURIComponent(r.token)}`, location.origin + '/').href);
        return;
    }
    if (r.status === 'pending') return paintPending(box, target, u);
    paintForm(box, target, u, r.status === 'denied');
}

function paintLogin(box, error = '') {
    box.innerHTML = `
        <p class="ar-h"><i class="fas fa-hand"></i> Xin quyền truy cập</p>
        <p class="ar-p">Đăng nhập để gửi yêu cầu — chủ sẽ thấy bạn là ai và duyệt cho bạn vào.</p>
        <div class="ar-row">
            <button type="button" class="ar-btn ar-main" data-ar="google">${G_LOGO} Đăng nhập Google</button>
            <button type="button" class="ar-link" data-ar="pw">Tôi có tài khoản email / mật khẩu</button>
            <form class="ar-row" data-ar="pwform" hidden>
                <input class="ar-in" type="email" name="email" placeholder="Email" autocomplete="username" required>
                <input class="ar-in" type="password" name="pw" placeholder="Mật khẩu" autocomplete="current-password" required>
                <button type="submit" class="ar-btn ar-ghost"><i class="fas fa-right-to-bracket"></i> Đăng nhập</button>
            </form>
            ${error ? `<p class="ar-err">${esc(error)}</p>` : ''}
        </div>`;
    box.querySelector('[data-ar="google"]').addEventListener('click', async (e) => {
        e.currentTarget.disabled = true;
        try { await openGoogle({ tag: 'access-req' }); location.reload(); }
        catch (err) { if (!isCancelled(err)) paintLogin(box, 'Không đăng nhập được: ' + (err.code || err.message)); else e.currentTarget.disabled = false; }
    });
    const form = box.querySelector('[data-ar="pwform"]');
    box.querySelector('[data-ar="pw"]').addEventListener('click', () => { form.hidden = !form.hidden; if (!form.hidden) form.email.focus(); });
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button');
        btn.disabled = true;
        try { await signInWithEmailAndPassword(auth, form.email.value.trim(), form.pw.value); location.reload(); }
        catch (err) {
            const bad = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(err.code);
            paintLogin(box, bad ? 'Sai email hoặc mật khẩu.' : 'Không đăng nhập được: ' + (err.code || err.message));
        }
    });
}

function whoLine(u) {
    return `Gửi bằng <b>${esc(u.email || u.displayName || 'tài khoản của bạn')}</b> · <button type="button" class="ar-link" data-ar="switch">đổi tài khoản</button>`;
}
function bindSwitch(box) {
    box.querySelector('[data-ar="switch"]')?.addEventListener('click', async () => { await signOut(auth).catch(() => {}); paintLogin(box); });
}

function paintForm(box, target, u, denied, error = '') {
    box.innerHTML = `
        <p class="ar-h"><i class="fas fa-hand"></i> Xin quyền truy cập</p>
        <p class="ar-p">${denied ? 'Lần trước chủ đã từ chối — bạn có thể gửi lại kèm lời nhắn. ' : ''}${whoLine(u)}</p>
        <div class="ar-row">
            <textarea class="ar-in" rows="2" maxlength="300" placeholder="Lời nhắn (không bắt buộc) — vd: Nguyễn An, lớp Y4"></textarea>
            <button type="button" class="ar-btn ar-main" data-ar="send"><i class="fas fa-hand"></i> Gửi yêu cầu truy cập</button>
            ${error ? `<p class="ar-err">${esc(error)}</p>` : ''}
        </div>`;
    bindSwitch(box);
    const btn = box.querySelector('[data-ar="send"]');
    btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
            await api('request', { ...target, message: box.querySelector('textarea').value, label: deviceLabel() });
            paintPending(box, target, u, true);
        } catch (e) { paintForm(box, target, u, denied, 'Chưa gửi được: ' + e.message); }
    });
}

function paintPending(box, target, u, justSent = false) {
    box.innerHTML = `
        <p class="ar-h ar-ok"><i class="fas fa-check"></i> ${justSent ? 'Đã gửi yêu cầu' : 'Yêu cầu đang chờ duyệt'}</p>
        <p class="ar-p">Chủ duyệt xong, quay lại trang này (hoặc bấm Kiểm tra) là vào được. ${whoLine(u)}</p>
        <div class="ar-row"><button type="button" class="ar-btn ar-ghost" data-ar="check"><i class="fas fa-rotate-right"></i> Kiểm tra lại</button></div>`;
    bindSwitch(box);
    box.querySelector('[data-ar="check"]').addEventListener('click', () => mountAccessRequest(box, target));
    // Quay lại tab (vd. vừa nhắn chủ xong) → tự kiểm lại một lần
    const again = () => { if (document.visibilityState === 'visible' && box.isConnected) { document.removeEventListener('visibilitychange', again); mountAccessRequest(box, target); } };
    document.addEventListener('visibilitychange', again);
}
