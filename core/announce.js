// File: core/announce.js
// THÔNG BÁO TỪ ADMIN (trang Quản trị → config/announce): hiện một thẻ nhỏ ở đáy màn hình cho mọi người hoặc đúng vài email.
// config/announce = { active, id, text, tone: 'info'|'warn'|'success', to: [email] (rỗng = tất cả), until: Timestamp|null }
// Đọc 1 lần / 15 phút / tab (cache sessionStorage) — không nghe liên tục cho đỡ tốn lượt đọc. Bấm "Đã xem" thì thông báo đó
// (theo id) không hiện lại trên máy này; admin gửi thông báo mới (id mới) thì hiện lại.
import { db } from './firebase-init.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const CACHE_KEY = 'announceCache';
const SEEN_KEY = 'announceSeen';
const CACHE_MS = 15 * 60 * 1000;
const TONES = {
    info: ['#EFF6FF', '#BFDBFE', '#1E3A8A', '📣'],
    warn: ['#FFFBEB', '#FCD34D', '#78350F', '⚠️'],
    success: ['#ECFDF5', '#6EE7B7', '#064E3B', '🎉']
};
let shown = false;

async function load() {
    try {
        const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
        if (c && Date.now() - c.at < CACHE_MS) return c.a;
    } catch (e) {}
    const s = await getDoc(doc(db, 'config', 'announce'));
    const d = s.exists() ? s.data() : {};
    const a = {
        active: d.active === true, id: String(d.id || ''), text: String(d.text || ''), tone: d.tone || 'info',
        to: Array.isArray(d.to) ? d.to.map(e => String(e).toLowerCase()) : [],
        until: d.until && typeof d.until.toMillis === 'function' ? d.until.toMillis() : null
    };
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), a })); } catch (e) {}
    return a;
}

export async function showAnnouncement(user) {
    if (shown || !user || user.isAnonymous || navigator.onLine === false) return;
    let a;
    try { a = await load(); } catch (e) { return; }
    if (!a.active || !a.text || !a.id || (a.until && a.until < Date.now())) return;
    if (a.to.length && !a.to.includes(String(user.email || '').toLowerCase())) return;
    try { if (localStorage.getItem(SEEN_KEY) === a.id) return; } catch (e) {}
    if (shown) return;
    shown = true;
    if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));

    const [bg, border, color, icon] = TONES[a.tone] || TONES.info;
    const el = document.createElement('div');
    el.setAttribute('role', 'status');
    el.style.cssText = `position:fixed;left:12px;right:12px;bottom:calc(14px + env(safe-area-inset-bottom));margin:0 auto;max-width:520px;z-index:2147483000;background:${bg};border:1.5px solid ${border};color:${color};border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.16);padding:12px 14px;display:flex;gap:10px;align-items:flex-start;font:600 14px/1.5 Quicksand,Nunito,system-ui,-apple-system,"Segoe UI",sans-serif`;
    const text = document.createElement('div');
    text.style.cssText = 'flex:1;min-width:0;white-space:pre-line;overflow-wrap:anywhere';
    text.textContent = a.text;
    const ic = document.createElement('span');
    ic.textContent = icon;
    ic.style.cssText = 'font-size:18px;line-height:1.3';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.textContent = 'Đã xem';
    ok.style.cssText = `flex-shrink:0;border:0;border-radius:12px;padding:6px 10px;background:${border};color:${color};font:800 12.5px Quicksand,Nunito,system-ui,sans-serif;cursor:pointer`;
    ok.addEventListener('click', () => {
        try { localStorage.setItem(SEEN_KEY, a.id); } catch (e) {}
        el.remove();
    });
    el.append(ic, text, ok);
    document.body.appendChild(el);
}
