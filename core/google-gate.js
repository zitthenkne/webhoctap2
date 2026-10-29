// File: core/google-gate.js
// CHỈ ĐĂNG NHẬP BẰNG GOOGLE (2026-10-28): tài khoản đang dùng phiên KHÔNG phải Google (email + mật khẩu cũ) → phủ màn hình bắt
// "Tiếp tục với Google". Cùng tài khoản (cùng uid) nên mọi dữ liệu giữ nguyên:
//   • Chưa gắn Google: linkWithPopup gắn Gmail vào tài khoản này, rồi đăng nhập lại bằng chính chứng thực vừa nhận (không hỏi lần hai).
//   • Đã gắn Google: signInWithPopup; lỡ chọn Gmail khác (ra tài khoản khác) thì đăng xuất và báo chọn đúng Gmail.
// Vì sao bắt buộc: cho mượn mật khẩu web thì dễ, cho mượn Gmail (lộ cả email, Drive, ảnh; Google báo đăng nhập lạ) thì gần như không ai làm.
// Luật Firestore cũng chỉ cho phiên Google đọc đề được chia sẻ (trustedSession) — màn hình này là để người dùng biết phải làm gì.
// Mất mạng: không chặn (popup Google cần mạng; dữ liệu offline vẫn dùng như cũ), có mạng lại thì hiện.
// Chế độ app: chọn Gmail bằng chuyển trang (core/google-signin.js) → quay về trang này, checkGoogleSession làm nốt (resumeOnce) rồi tải lại.
import { auth } from './firebase-init.js';
import { GoogleAuthProvider, signInWithCredential, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { markFreshLogin, clearFreshLogin, isExemptUser } from './device-limit.js';
import { openGoogle, resumeGoogle, isCancelled } from './google-signin.js';

const ROOT = new URL('../', import.meta.url).href;
let shown = false;

function gateError(e) {
    if (isCancelled(e)) return '';
    return e?.code === 'auth/credential-already-in-use'
        ? 'Gmail này đã gắn với một tài khoản khác trên web. Hãy chọn Gmail khác (hoặc nhờ admin).'
        : e?.code === 'auth/popup-blocked' ? 'Trình duyệt chặn cửa sổ đăng nhập — cho phép popup rồi bấm lại.'
        : e?.message || 'Không đăng nhập được, thử lại nhé.';
}

function overlay(user, firstMsg = '') {
    if (shown || document.getElementById('google-gate')) return;
    shown = true;
    const el = document.createElement('div');
    el.id = 'google-gate';
    // Giao diện tự chứa (style nội tuyến) vì hiện trên MỌI trang — cùng tông với hộp đăng nhập (home-scrapbook.css .am-*)
    el.style.cssText = 'position:fixed;inset:0;z-index:2147483001;background:rgba(60,25,42,.5);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto;font-family:Quicksand,Outfit,system-ui,-apple-system,"Segoe UI",sans-serif';
    const G = '<svg viewBox="0 0 48 48" width="22" height="22" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.9 6.2C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.2 5.6c4.2-3.9 7.1-9.7 7.1-17z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.9-6.2z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.2-5.6c-2.2 1.5-5 2.4-8.7 2.4-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.2C6.6 42.6 14.6 48 24 48z"/></svg>';
    el.innerHTML = `
<div style="background:#FFFBFC;border:1.5px solid #F6C9D8;border-radius:26px;max-width:400px;width:100%;overflow:hidden;text-align:center;box-shadow:0 4px 0 #F6C9D8,0 24px 60px rgba(110,58,85,.3)">
  <div style="padding:24px 22px 20px;background:#FFDDE7;border-bottom:1.5px dashed #F4B6CB">
    <div style="width:56px;height:56px;margin:0 auto 10px;border-radius:18px;display:flex;align-items:center;justify-content:center;background:#fff;box-shadow:0 2px 0 #F4B6CB;font-size:26px">🔐</div>
    <h2 style="margin:0;font-size:19px;font-weight:800;color:#6E3A55">Từ nay đăng nhập bằng Google</h2>
    <p style="margin:6px 0 0;font-size:13.5px;font-weight:600;color:#9B5C79;line-height:1.5">Gắn Gmail một lần là xong — <b>dữ liệu cũ giữ nguyên</b>.</p>
  </div>
  <div style="padding:18px 22px 20px">
    <p style="margin:0 0 6px;font-size:12.5px;color:#7A4A62;line-height:1.5">Web chỉ nhận đăng nhập Google để bảo vệ tài khoản và các đề được chia sẻ (mỗi tài khoản tối đa 2 máy).</p>
    <p style="margin:0 0 14px;font-size:12.5px;color:#7A4A62">Tài khoản hiện tại: <b style="color:#6E3A55">${String(user.email || '').replace(/[<>&"]/g, '')}</b></p>
    <button type="button" id="gg-go" style="width:100%;height:52px;border-radius:16px;background:#fff;border:1.5px solid #E7D4DD;box-shadow:0 3px 0 #EBD3DD;color:#3b2230;font-weight:800;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px">
      ${G} Gắn Gmail & tiếp tục</button>
    <p id="gg-msg" style="margin:10px 0 0;font-size:13px;font-weight:600;color:#D14343;min-height:1em"></p>
    <button type="button" id="gg-out" style="margin-top:4px;border:0;background:none;color:#A07086;font-size:13px;font-weight:700;cursor:pointer">Đăng xuất</button>
  </div>
</div>`;
    document.body.appendChild(el);
    document.documentElement.style.overflow = 'hidden';
    const msg = el.querySelector('#gg-msg');
    msg.textContent = firstMsg;
    const go = el.querySelector('#gg-go');
    go.addEventListener('click', async () => {
        go.disabled = true;
        msg.textContent = '';
        try {
            await toGoogle(user);
            location.reload();
        } catch (e) {
            clearFreshLogin();
            go.disabled = false;
            msg.textContent = gateError(e);
        }
    });
    el.querySelector('#gg-out').addEventListener('click', async () => {
        try { (await import('./auth-session.js')).forgetSession(); } catch (e) {}
        await signOut(auth).catch(() => {});
        location.href = ROOT + 'index.html';
    });
}

async function toGoogle(user) {
    const params = user.email ? { login_hint: user.email } : {};
    const linked = user.providerData.some(p => p.providerId === 'google.com');
    markFreshLogin();
    if (!linked) return afterLink(await openGoogle({ kind: 'link', user, tag: 'gate', params }), user.uid, params);
    const res = await openGoogle({ tag: 'gate', data: { oldUid: user.uid }, params });
    await ensureSameUser(res, user.uid);
}

async function afterLink(res, uid, params) {
    const cred = GoogleAuthProvider.credentialFromResult(res);
    // Phiên vẫn là "mật khẩu" → đăng nhập lại bằng chứng thực Google vừa nhận để có phiên Google (luật trustedSession đòi)
    if (cred) await signInWithCredential(auth, cred);
    else await ensureSameUser(await openGoogle({ tag: 'gate', data: { oldUid: uid }, params }), uid);
}

async function ensureSameUser(res, oldUid) {
    if (res.user.uid !== oldUid) {
        await signOut(auth).catch(() => {});
        throw new Error('Bạn vừa chọn Gmail của một tài khoản khác. Hãy đăng nhập lại và chọn đúng Gmail đã gắn với tài khoản này.');
    }
}

// Quay về từ Google (chế độ app): làm nốt bước gắn / đăng nhập rồi tải lại. Chỉ chạy một lần mỗi trang — onAuthStateChanged
// báo lại ngay khi getRedirectResult đổi phiên, lần gọi sau nhận chung kết quả. true = đã lo xong (thành công hoặc đã hiện lỗi).
let resuming = null;
function resumeOnce(user) {
    if (!resuming) resuming = (async () => {
        try {
            const r = await resumeGoogle('gate');
            if (!r) return false;
            if (r.data?.oldUid) await ensureSameUser(r.result, r.data.oldUid);
            else await afterLink(r.result, user.uid, user.email ? { login_hint: user.email } : {});
            location.reload();
            return true;
        } catch (e) {
            clearFreshLogin();
            if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));
            overlay(user, gateError(e));
            return true;
        }
    })();
    return resuming;
}

/** auth-session.js gọi với mỗi người dùng thật. Tài khoản đặc biệt (admin / deviceExempt) không cần đăng nhập Google. */
export async function checkGoogleSession(user) {
    if (!user || user.isAnonymous) return;
    if (await resumeOnce(user)) return;
    if (navigator.onLine === false) return;
    let provider;
    try { provider = (await user.getIdTokenResult()).claims.firebase?.sign_in_provider; } catch (e) { return; }
    if (provider === 'google.com' || await isExemptUser(user)) return;
    if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));
    overlay(user);
}
