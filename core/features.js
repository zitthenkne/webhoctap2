// File: core/features.js
// QUYỀN DÙNG TÍNH NĂNG theo tài khoản — admin bật/tắt ở trang Quản trị (features/admin), máy chủ (api/devices.js) gắn custom claim `feat`.
// Chốt chặn THẬT là can() trong firestore.rules; ở đây chỉ để giao diện khoá sớm và báo rõ ràng (không để người dùng làm xong mới bị từ chối).
//   Mặc định (admin chưa chỉnh): Làm đề + Học nhóm MỞ; Tạo đề + Bệnh án + Làm offline TẮT. Admin: mở hết.
//   Không cần tài khoản: Tính điểm hệ 4, làm đề CÔNG KHAI, vào phòng học bằng link.
// Admin đổi quyền → máy người đó xin token mới ngay (core/device-limit.js nghe claimsAt) và báo 'auth:claims' → khoá / mở lại giao diện.
import { auth } from './firebase-init.js';
import { onSessionUser } from './auth-session.js';
import { whenAuthKnown, requireLogin, guardPage } from './require-login.js';

/** key → [tên, icon, màu chữ, màu nền, mô tả] — trang Quản trị dùng chung. */
export const FEATURES = {
    quiz: ['Làm đề', 'fa-pen-to-square', '#db2777', '#fce7f3', 'Mở đề người khác chia sẻ riêng (đề công khai thì ai cũng làm được)'],
    create: ['Tạo đề', 'fa-wand-magic-sparkles', '#7c3aed', '#ede9fe', 'Tạo bộ đề, thư mục, lưu bản sao, lưu đề từ phòng'],
    room: ['Học nhóm', 'fa-people-group', '#0284c7', '#e0f2fe', 'Tạo phòng học nhóm (vào phòng bằng link thì ai cũng vào được)'],
    record: ['Bệnh án', 'fa-notes-medical', '#059669', '#d1fae5', 'Viết bệnh án mới (bệnh án đã có vẫn xem / sửa được)'],
    // Tắt = không tải đề về máy (features/quiz/quiz-offline-store.js chặn lưu / đọc, xoá bản cũ) → mọi lượt làm phải có mạng, admin theo dõi được
    offline: ['Làm offline', 'fa-plane', '#c2410c', '#ffedd5', 'Tải đề về máy để làm khi mất mạng (tắt thì phải có mạng mới làm được — admin theo dõi được)']
};
export const FEATURE_KEYS = Object.keys(FEATURES);
export const DEFAULT_FEATURES = { quiz: true, create: false, room: true, record: false, offline: false };
export const FULL_FEATURES = { quiz: true, create: true, room: true, record: true, offline: true };
const ADMIN_EMAILS = ['vietthanhne@gmail.com'];                 // khớp isAdmin() trong firestore.rules
const ADMIN_UIDS = ['qZ5dzmJzrjdpN9l4n9x5UGPwHE43'];
const CACHE_KEY = 'myFeatures';

/** Claim `feat` (thiếu = mặc định) → đủ các khoá true/false. Khớp can() trong firestore.rules: có claim thì khoá thiếu = tắt. */
export function normFeatures(feat) {
    const src = feat && typeof feat === 'object' ? feat : DEFAULT_FEATURES;
    return Object.fromEntries(FEATURE_KEYS.map(k => [k, src[k] === true]));
}

let cached = null;           // { uid, f }
/** Quyền của người đang đăng nhập (null = khách). */
export async function myFeatures() {
    const u = await whenAuthKnown();
    if (!u || u.isAnonymous) return null;
    if (ADMIN_EMAILS.includes(String(u.email || '').toLowerCase()) || ADMIN_UIDS.includes(u.uid)) return { ...FULL_FEATURES };
    if (cached?.uid === u.uid) return cached.f;
    let f = null;
    try {
        const cur = auth.currentUser;
        if (cur && cur.uid === u.uid) {
            const claims = (await cur.getIdTokenResult()).claims;
            f = claims.admin === true ? { ...FULL_FEATURES } : normFeatures(claims.feat);      // admin phụ: mở hết như admin gốc
            try { localStorage.setItem(CACHE_KEY, JSON.stringify({ uid: u.uid, f })); } catch (e) {}
        }
    } catch (e) { f = null; }
    if (!f) {
        // Mất mạng (danh tính lưu máy): dùng quyền lần trước của chính tài khoản này
        try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (c?.uid === u.uid) f = normFeatures(c.f); } catch (e) {}
    }
    f = f || normFeatures(null);
    cached = { uid: u.uid, f };
    return f;
}

export async function canUse(key) {
    const f = await myFeatures();
    return !!f && f[key] === true;
}

/**
 * Bấm vào một tính năng: khách → hộp đăng nhập (guestOk: cho khách đi tiếp — vd khu phòng học), thiếu quyền → hộp báo khoá.
 * @returns {Promise<boolean>} true = được đi tiếp.
 */
export async function requireFeature(key, { guestOk = false, label } = {}) {
    const u = await whenAuthKnown();
    if (!u) return guestOk ? true : requireLogin(label || FEATURES[key][0]);
    if (await canUse(key)) return true;
    showLocked(key);
    return false;
}

/** Đầu một trang riêng (viết bệnh án, soạn đề…): cần đăng nhập + có quyền, không thì phủ lớp chặn. */
export async function guardFeaturePage(key, label) {
    if (!await guardPage(label || FEATURES[key][0])) return false;
    if (await canUse(key)) return true;
    showLocked(key, true);
    return false;
}

const ROOT = new URL('../', import.meta.url).href;
/** Hộp báo "tính năng chưa mở" — blocking: phủ cả trang (trang riêng), không thì đóng được. */
export function showLocked(key, blocking = false) {
    document.getElementById('feature-lock')?.remove();
    const [name, icon, color, bg] = FEATURES[key] || ['Tính năng này', 'fa-lock', '#db2777', '#fce7f3'];
    const el = document.createElement('div');
    el.id = 'feature-lock';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(80,40,90,.35);display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto';
    el.innerHTML = `
<div style="background:linear-gradient(160deg,#fff 0%,#fff7fb 60%,${bg} 100%);border:2px solid ${bg};border-radius:28px;max-width:380px;width:100%;padding:26px 22px;text-align:center;
            box-shadow:0 18px 50px rgba(190,90,160,.28);font-family:Quicksand,Nunito,system-ui,-apple-system,'Segoe UI',sans-serif">
  <div style="width:64px;height:64px;margin:0 auto 12px;border-radius:22px;display:flex;align-items:center;justify-content:center;background:${bg};color:${color};font-size:26px;position:relative">
    <i class="fas ${icon}"></i><span style="position:absolute;right:-6px;bottom:-6px;font-size:20px">🔒</span></div>
  <h2 style="margin:0 0 6px;font-size:19px;font-weight:800;color:#4a3045">Chưa mở tính năng <span style="color:${color}">${name}</span></h2>
  <p style="margin:0 0 18px;font-size:14px;color:#7a6274;line-height:1.55">Tài khoản của bạn chưa được admin mở tính năng này. Nhắn admin để được mở nha 💌<br>
    <span style="font-size:12.5px;color:#a08a9b">Tính điểm hệ 4, đề công khai và phòng học có link thì vẫn dùng thoải mái.</span></p>
  ${blocking
        ? `<a href="${ROOT}index.html" style="display:block;padding:12px;border-radius:16px;background:linear-gradient(90deg,#f9a8d4,#c4b5fd);color:#fff;font-weight:800;text-decoration:none">Về trang chủ</a>`
        : `<button type="button" data-ok style="width:100%;padding:12px;border:0;border-radius:16px;background:linear-gradient(90deg,#f9a8d4,#c4b5fd);color:#fff;font-weight:800;font-size:15px;cursor:pointer">Đã hiểu</button>`}
</div>`;
    if (!blocking) {
        el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-ok]')) el.remove(); });
        document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { el.remove(); document.removeEventListener('keydown', esc); } });
    } else {
        document.documentElement.style.overflow = 'hidden';
    }
    document.body.appendChild(el);
    el.querySelector('[data-ok]')?.focus();
}

// Lối vào các tính năng (thanh bên mọi trang + nút trang chủ) → gắn ổ khoá nhỏ khi tài khoản chưa được mở
const NAV = {
    create: '.nav-link[data-target="createQuizContent"], .nav-link[href$="#createQuizContent"], #selectCreateQuiz',
    room: '.nav-link[data-target="myStudyRoomsContent"], .nav-link[href$="#myStudyRoomsContent"], #selectStudyRoom',
    record: '.nav-link[href$="study-room/waiting-room.html"], #selectWriteMedicalRecord'
};
async function decorateNav() {
    if (!document.getElementById('feature-lock-css')) {
        const s = document.createElement('style');
        s.id = 'feature-lock-css';
        s.textContent = '.feat-locked{opacity:.6}.feat-lock-ic{margin-left:auto;padding-left:6px;font-size:11px;color:#c084fc}';
        document.head.appendChild(s);
    }
    const f = await myFeatures();
    for (const [key, sel] of Object.entries(NAV)) {
        const off = !!f && !f[key];            // khách: giữ như cũ (bấm vào thì mời đăng nhập)
        document.querySelectorAll(sel).forEach(a => {
            a.classList.toggle('feat-locked', off);
            let ic = a.querySelector(':scope > .feat-lock-ic');
            if (off && !ic) {
                ic = document.createElement('i');
                ic.className = 'fas fa-lock feat-lock-ic';
                ic.title = 'Chưa mở cho tài khoản này';
                a.appendChild(ic);
            } else if (!off && ic) ic.remove();
        });
    }
}

let watching = false;
/** app-sidebar.js gọi: vẽ ổ khoá + vẽ lại khi đổi tài khoản / admin đổi quyền. */
export function watchNav() {
    if (watching) return;
    watching = true;
    onSessionUser(() => { cached = null; decorateNav().catch(() => {}); });
}
window.addEventListener('auth:claims', () => {
    cached = null;
    if (watching) decorateNav().catch(() => {});
});
