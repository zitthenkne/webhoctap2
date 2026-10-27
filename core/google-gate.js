// File: core/google-gate.js
// CHỈ ĐĂNG NHẬP BẰNG GOOGLE (2026-10-28): tài khoản đang dùng phiên KHÔNG phải Google (email + mật khẩu cũ) → phủ màn hình bắt
// "Tiếp tục với Google". Cùng tài khoản (cùng uid) nên mọi dữ liệu giữ nguyên:
//   • Chưa gắn Google: linkWithPopup gắn Gmail vào tài khoản này, rồi đăng nhập lại bằng chính chứng thực vừa nhận (không hỏi lần hai).
//   • Đã gắn Google: signInWithPopup; lỡ chọn Gmail khác (ra tài khoản khác) thì đăng xuất và báo chọn đúng Gmail.
// Vì sao bắt buộc: cho mượn mật khẩu web thì dễ, cho mượn Gmail (lộ cả email, Drive, ảnh; Google báo đăng nhập lạ) thì gần như không ai làm.
// Luật Firestore cũng chỉ cho phiên Google đọc đề được chia sẻ (trustedSession) — màn hình này là để người dùng biết phải làm gì.
// Mất mạng: không chặn (popup Google cần mạng; dữ liệu offline vẫn dùng như cũ), có mạng lại thì hiện.
import { auth } from './firebase-init.js';
import {
    GoogleAuthProvider, linkWithPopup, signInWithPopup, signInWithCredential, signOut, browserPopupRedirectResolver
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { markFreshLogin, clearFreshLogin } from './device-limit.js';

const ROOT = new URL('../', import.meta.url).href;
let shown = false;

function overlay(user) {
    if (shown || document.getElementById('google-gate')) return;
    shown = true;
    const el = document.createElement('div');
    el.id = 'google-gate';
    el.style.cssText = 'position:fixed;inset:0;z-index:2147483001;background:rgba(17,24,39,.72);display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto;font-family:system-ui,-apple-system,"Segoe UI",sans-serif';
    el.innerHTML = `
<div style="background:#fff;border-radius:24px;max-width:400px;width:100%;padding:26px 22px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.25)">
  <div style="width:60px;height:60px;margin:0 auto 12px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#eef2ff;font-size:28px">🔐</div>
  <h2 style="margin:0 0 6px;font-size:19px;font-weight:800;color:#1f2937">Từ nay đăng nhập bằng Google</h2>
  <p style="margin:0 0 14px;font-size:14px;color:#6b7280;line-height:1.5">Để bảo vệ tài khoản và đề được chia sẻ, web chỉ nhận đăng nhập bằng Google.
    Bấm nút dưới và chọn Gmail của bạn — <b>dữ liệu cũ giữ nguyên</b>.</p>
  <p style="margin:0 0 16px;font-size:13px;color:#374151">Tài khoản hiện tại: <b>${String(user.email || '').replace(/[<>&"]/g, '')}</b></p>
  <button type="button" id="gg-go" style="width:100%;padding:13px;border:0;border-radius:14px;background:#fff;border:2px solid #e5e7eb;color:#1f2937;font-weight:700;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
    <span style="font-weight:900;color:#4285F4">G</span> Tiếp tục với Google</button>
  <p id="gg-msg" style="margin:10px 0 0;font-size:13px;color:#dc2626;min-height:1em"></p>
  <button type="button" id="gg-out" style="margin-top:6px;border:0;background:none;color:#9ca3af;font-size:13px;cursor:pointer">Đăng xuất</button>
</div>`;
    document.body.appendChild(el);
    document.documentElement.style.overflow = 'hidden';
    const msg = el.querySelector('#gg-msg');
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
            if (e?.code === 'auth/popup-closed-by-user' || e?.code === 'auth/cancelled-popup-request') return;
            msg.textContent = e?.code === 'auth/credential-already-in-use'
                ? 'Gmail này đã gắn với một tài khoản khác trên web. Hãy chọn Gmail khác (hoặc nhờ admin).'
                : e?.code === 'auth/popup-blocked' ? 'Trình duyệt chặn cửa sổ đăng nhập — cho phép popup rồi bấm lại.'
                : e?.message || 'Không đăng nhập được, thử lại nhé.';
        }
    });
    el.querySelector('#gg-out').addEventListener('click', async () => {
        try { (await import('./auth-session.js')).forgetSession(); } catch (e) {}
        await signOut(auth).catch(() => {});
        location.href = ROOT + 'index.html';
    });
}

async function toGoogle(user) {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account', ...(user.email ? { login_hint: user.email } : {}) });
    const linked = user.providerData.some(p => p.providerId === 'google.com');
    markFreshLogin();
    if (!linked) {
        const res = await linkWithPopup(user, provider, browserPopupRedirectResolver);
        const cred = GoogleAuthProvider.credentialFromResult(res);
        // Phiên vẫn là "mật khẩu" → đăng nhập lại bằng chứng thực Google vừa nhận để có phiên Google (luật trustedSession đòi)
        if (cred) await signInWithCredential(auth, cred);
        else await signInWithPopup(auth, provider, browserPopupRedirectResolver);
        return;
    }
    const oldUid = user.uid;
    const res = await signInWithPopup(auth, provider, browserPopupRedirectResolver);
    if (res.user.uid !== oldUid) {
        await signOut(auth).catch(() => {});
        throw new Error('Bạn vừa chọn Gmail của một tài khoản khác. Hãy đăng nhập lại và chọn đúng Gmail đã gắn với tài khoản này.');
    }
}

/** auth-session.js gọi với mỗi người dùng thật. */
export async function checkGoogleSession(user) {
    if (!user || user.isAnonymous || navigator.onLine === false) return;
    let provider;
    try { provider = (await user.getIdTokenResult()).claims.firebase?.sign_in_provider; } catch (e) { return; }
    if (provider === 'google.com') return;
    if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));
    overlay(user);
}
