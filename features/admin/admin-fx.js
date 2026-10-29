// File: features/admin/admin-fx.js
// HIỆU ỨNG & TIỆN ÍCH GIAO DIỆN cho Sổ Quản trị (admin.js gọi) — không đụng dữ liệu, không gọi máy chủ.
//   countUp (số chạy), spark (đường xu hướng nhỏ), burst (bung sticker khi bật), hl (tô bút dạ chữ khớp ô tìm), skeleton (khung chờ),
//   undoToast (thẻ "Hoàn tác"), openPalette (Tìm nhanh Ctrl/⌘ K), openSheet (bảng phím tắt), giao diện sổ (ngày / đêm, màu, mật độ),
//   onSwipe (vuốt trên điện thoại). Tôn trọng "giảm chuyển động" của máy.
const reduced = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Số chạy: từ giá trị lần trước tới giá trị mới (lần đầu chạy từ 0) ----------
const lastVal = new Map();
export function countUp(el, key, to, suffix = '') {
    if (!el) return;
    if (!Number.isFinite(to)) { el.textContent = String(to); return; }
    const from = lastVal.has(key) ? lastVal.get(key) : 0;
    lastVal.set(key, to);
    const show = (v) => { el.textContent = Math.round(v).toLocaleString('vi-VN') + suffix; };
    if (reduced() || from === to) return show(to);
    const t0 = performance.now(), D = 750;
    const step = (t) => {
        const p = Math.min(1, (t - t0) / D);
        show(from + (to - from) * (1 - Math.pow(1 - p, 3)));
        if (p < 1 && el.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

// ---------- Đường xu hướng nhỏ (SVG, tô bằng currentColor) ----------
export function spark(vals) {
    if (!Array.isArray(vals) || vals.length < 2 || !vals.some(v => v > 0)) return '';
    const w = 100, h = 30, max = Math.max(1, ...vals);
    const pts = vals.map((v, i) => [(i / (vals.length - 1) * w).toFixed(1), (h - 3 - v / max * (h - 7)).toFixed(1)]);
    const line = pts.map(p => p.join(',')).join(' ');
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
        <polygon points="0,${h} ${line} ${w},${h}"/><polyline points="${line}"/>
        <circle cx="${pts[pts.length - 1][0]}" cy="${pts[pts.length - 1][1]}" r="2.6"/></svg>`;
}

// ---------- Bung sticker (bật tính năng / mở full) ----------
export function burst(x, y, set = ['💖', '✨', '⭐', '🌸', '🎀']) {
    if (reduced()) return;
    const n = 10;
    for (let i = 0; i < n; i++) {
        const s = document.createElement('span');
        s.className = 'burst';
        s.textContent = set[i % set.length];
        const a = (Math.PI * 2 * i) / n + Math.random() * .5;
        const d = 34 + Math.random() * 30;
        s.style.cssText = `left:${x}px;top:${y}px;--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d).toFixed(0)}px;--r:${(Math.random() * 90 - 45) | 0}deg`;
        document.body.appendChild(s);
        setTimeout(() => s.remove(), 850);
    }
}
export const burstAt = (el, set) => { const r = el?.getBoundingClientRect?.(); if (r) burst(r.left + r.width / 2, r.top + r.height / 2, set); };

// ---------- Tô bút dạ chữ khớp ô tìm (đã escape) ----------
export function hl(text, q) {
    const s = String(text ?? '');
    if (!q) return esc(s);
    const i = s.toLowerCase().indexOf(q);
    if (i < 0) return esc(s);
    return esc(s.slice(0, i)) + '<mark class="hl">' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length));
}

// ---------- Khung chờ (giấy lấp lánh) ----------
export const skeleton = (n = 4, kind = 'row') =>
    `<div class="skel-wrap" aria-busy="true" aria-label="Đang tải">${Array.from({ length: n }, (_, i) => `<div class="skel skel-${kind}" style="animation-delay:${i * 90}ms"></div>`).join('')}</div>`;

// ---------- Thẻ "Hoàn tác" (một thẻ một lúc; Ctrl/⌘ Z cũng hoàn tác) ----------
let undoEl = null, undoTimer = 0, undoFn = null;
export function undoToast(text, onUndo, ms = 7000) {
    undoEl?.remove();
    clearTimeout(undoTimer);
    const el = undoEl = document.createElement('div');
    undoFn = onUndo;
    el.className = 'undo-toast';
    el.setAttribute('role', 'status');
    el.innerHTML = `<span class="ut-ic">🎀</span><span class="ut-t"></span><button type="button">↶ Hoàn tác</button><i class="ut-bar" style="animation-duration:${ms}ms"></i>`;
    el.querySelector('.ut-t').textContent = text;
    el.querySelector('button').onclick = undoNow;
    document.body.appendChild(el);
    undoTimer = setTimeout(() => dropUndo(el), ms);
}
function dropUndo(el) {
    if (undoEl !== el) return;
    undoEl = null; undoFn = null;
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 300);
}
export function undoNow() {
    if (!undoFn) return false;
    const fn = undoFn;
    clearTimeout(undoTimer);
    undoEl?.remove();
    undoEl = null; undoFn = null;
    fn();
    return true;
}

// ---------- Hộp nổi dùng chung (Tìm nhanh, bảng phím tắt, giao diện sổ) ----------
function overlay(id, html, onClose) {
    document.getElementById(id)?.remove();
    const wrap = document.createElement('div');
    wrap.id = id;
    wrap.className = 'fx-overlay';
    wrap.innerHTML = html;
    document.body.appendChild(wrap);
    const close = () => { wrap.classList.add('is-out'); setTimeout(() => wrap.remove(), 180); document.removeEventListener('keydown', onKey, true); onClose?.(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
    return { wrap, close };
}
export const isOpen = () => !!document.querySelector('.fx-overlay');

/** Tìm nhanh: search(q) → [{ group, icon, label, labelHtml?, sub?, run }] — ↑↓ chọn, Enter chạy. */
export function openPalette(search) {
    const { wrap, close } = overlay('cmdk', `<div class="cmdk-box" role="dialog" aria-modal="true" aria-label="Tìm nhanh">
        <label class="cmdk-in"><i class="fas fa-magnifying-glass"></i><input placeholder="Tìm tài khoản, đề, thao tác…" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></label>
        <div class="cmdk-list" role="listbox"></div>
        <p class="cmdk-foot"><span><kbd>↑</kbd><kbd>↓</kbd> chọn</span><span><kbd>Enter</kbd> mở</span><span><kbd>Esc</kbd> đóng</span></p></div>`);
    const input = wrap.querySelector('input'), list = wrap.querySelector('.cmdk-list');
    let items = [], idx = 0;
    const paint = () => {
        items = search(input.value.trim().toLowerCase()).slice(0, 40);
        idx = Math.max(0, Math.min(idx, items.length - 1));
        let g = '';
        list.innerHTML = items.length ? items.map((it, i) => {
            const head = it.group !== g ? `<p class="cmdk-g">${esc(g = it.group)}</p>` : '';
            return head + `<button type="button" class="cmdk-it ${i === idx ? 'is-on' : ''}" data-i="${i}" role="option" aria-selected="${i === idx}">
                <span class="cmdk-ic">${it.icon}</span><span class="min-w-0 flex-1"><b>${it.labelHtml || esc(it.label)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>
                <span class="cmdk-enter">↵</span></button>`;
        }).join('') : '<p class="cmdk-empty">Không thấy gì cả 🌸</p>';
        list.querySelector('.is-on')?.scrollIntoView({ block: 'nearest' });
    };
    const run = (i) => { const it = items[i]; if (!it) return; close(); setTimeout(() => it.run(), 0); };
    input.addEventListener('input', () => { idx = 0; paint(); });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(items.length - 1, idx + 1); paint(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, idx - 1); paint(); }
        else if (e.key === 'Enter') { e.preventDefault(); run(idx); }
    });
    list.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) run(Number(b.dataset.i)); });
    list.addEventListener('mousemove', (e) => {
        const b = e.target.closest('[data-i]');
        if (b && Number(b.dataset.i) !== idx) { idx = Number(b.dataset.i); list.querySelectorAll('.cmdk-it').forEach((x, i) => x.classList.toggle('is-on', i === idx)); }
    });
    paint();
    input.focus();
}

/** Bảng phím tắt. rows = [[phím, mô tả]] */
export function openSheet(rows) {
    const { wrap, close } = overlay('keys-sheet', `<div class="sheet-box" role="dialog" aria-modal="true" aria-label="Phím tắt">
        <p class="sheet-h">⌨️ Phím tắt của sổ</p>
        <ul>${rows.map(([k, d]) => `<li><span>${k.split(' ').map(x => `<kbd>${esc(x)}</kbd>`).join(' ')}</span><span>${esc(d)}</span></li>`).join('')}</ul>
        <button type="button" class="btn btn-candy w-full mt-3" data-x>Đã nhớ 💖</button></div>`);
    wrap.querySelector('[data-x]').onclick = close;
}

// ---------- Giao diện sổ: ngày / đêm / theo máy · màu chủ đạo · mật độ ----------
const LOOK_KEY = 'adminLook';
export const ACCENTS = [['blossom', '#FF8FB8', 'Hồng đào'], ['lav', '#B9A2F0', 'Tím oải hương'], ['mint', '#6FD1AE', 'Bạc hà'], ['sky', '#7EC0EE', 'Trời xanh'], ['peach', '#F79A5E', 'Cam đào']];
export function loadLook() { try { return JSON.parse(localStorage.getItem(LOOK_KEY) || '{}') || {}; } catch (e) { return {}; } }
export function applyLook(l = loadLook()) {
    const r = document.documentElement;
    const night = l.theme === 'night' || (l.theme !== 'day' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    r.dataset.theme = night ? 'night' : 'day';
    r.dataset.accent = ACCENTS.some(a => a[0] === l.accent) ? l.accent : 'blossom';
    r.dataset.density = l.density === 'compact' ? 'compact' : 'cozy';
}
export function openLook() {
    const l = loadLook();
    const seg = (key, opts) => `<div class="look-seg">${opts.map(([v, label]) => `<button type="button" data-k="${key}" data-v="${v}" class="${(l[key] || opts[0][0]) === v ? 'is-on' : ''}">${label}</button>`).join('')}</div>`;
    const { wrap } = overlay('look', `<div class="sheet-box" role="dialog" aria-modal="true" aria-label="Giao diện sổ">
        <p class="sheet-h">🎨 Giao diện sổ</p>
        <p class="look-l">Ánh sáng</p>${seg('theme', [['auto', '🌗 Theo máy'], ['day', '☀️ Ngày'], ['night', '🌙 Đêm cacao']])}
        <p class="look-l">Màu chủ đạo</p>
        <div class="look-dots">${ACCENTS.map(([v, c, name]) => `<button type="button" data-k="accent" data-v="${v}" class="${(l.accent || 'blossom') === v ? 'is-on' : ''}" style="--c:${c}" title="${name}"><i></i><span>${name}</span></button>`).join('')}</div>
        <p class="look-l">Mật độ</p>${seg('density', [['cozy', '🛋️ Thoáng'], ['compact', '📏 Gọn']])}
        <p class="nb-tiny mt-3">Chỉ lưu trên máy này.</p></div>`);
    wrap.addEventListener('click', (e) => {
        const b = e.target.closest('[data-k]');
        if (!b) return;
        const next = { ...loadLook(), [b.dataset.k]: b.dataset.v };
        try { localStorage.setItem(LOOK_KEY, JSON.stringify(next)); } catch (err) {}
        applyLook(next);
        wrap.querySelectorAll(`[data-k="${b.dataset.k}"]`).forEach(x => x.classList.toggle('is-on', x === b));
    });
}
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyLook());

// ---------- Vuốt (điện thoại) ----------
export function onSwipe(el, { right, left } = {}) {
    let x0 = 0, y0 = 0, on = false;
    el.addEventListener('touchstart', (e) => { const t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; on = true; }, { passive: true });
    el.addEventListener('touchend', (e) => {
        if (!on) return;
        on = false;
        const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
        if (Math.abs(dx) < 80 || Math.abs(dy) > 60) return;
        if (dx > 0) right?.(); else left?.();
    }, { passive: true });
}
