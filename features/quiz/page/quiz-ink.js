// File: features/quiz/page/quiz-ink.js
// Viết / vẽ lên HÌNH trong đề (2026-10-21) — người dùng: lưu đồ, sơ đồ GV sửa muốn vẽ lên để ghi chú bằng Apple Pencil.
//  · Apple Pencil viết THẲNG lên hình ngay trong câu hỏi; ngón tay vẫn cuộn trang / bấm phóng to như cũ
//    (Safari phân biệt bút bằng Touch.touchType 'stylus' -> chỉ chặn cuộn khi là bút).
//  · Bấm hình -> khung phóng to có thanh bút: bút / dạ quang / tẩy, 4 màu, hoàn tác, làm lại, xóa. Chuột, bút đều vẽ được;
//    ngón tay vẽ khi máy chưa từng thấy bút (hoặc bật nút bàn tay) — dùng chung lựa chọn với giấy nháp.
//  · Nét lưu theo TỈ LỆ bề rộng hình: hình to nhỏ thế nào, máy khác cỡ màn khác, nét vẫn nằm đúng chỗ.
//  · Lưu trên máy: localStorage quizInk_<id bộ đề> = { <khóa hình>: [nét] }; khóa = id zimg hoặc src -> cùng hình ở nhiều câu dùng chung nét.
// Bộ vẽ (làm trơn, lực nhấn, màu theo sáng/tối) dùng chung với giấy nháp: page/quiz-tools.js.
import { SIZES, readPalette, drawStroke, penSeg, penTail, hlPath, setStyle, inkPressure } from './quiz-tools.js';

const $ = (id) => document.getElementById(id);
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } } };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const IMG_SEL = 'img.quiz-image, .svg-fig img';
const storeKey = () => 'quizInk_' + (new URLSearchParams(location.search).get('id') || 'x');
const imgKey = (img) => img.dataset.zimg || img.getAttribute('src') || '';
const fingerOn = () => { const v = ls.get('quiz_scratch_finger'); return v === null || v === '' ? ls.get('quiz_scratch_pen') !== '1' : v === '1'; };

let prefs = { pen: 'pen', color: 'red', size: 1 };
try { Object.assign(prefs, JSON.parse(ls.get('quiz_ink_prefs') || '{}')); } catch (e) { }
let store = null;
const load = () => store || (store = (() => { try { return JSON.parse(ls.get(storeKey()) || '{}') || {}; } catch (e) { return {}; } })());
const hist = new Map();   // khóa hình -> { undo: [], redo: [] } (trong phiên)
const strokesOf = (k) => load()[k] || [];
let lb = null;            // { key } hình đang mở trong khung phóng to
let lastStrokeAt = 0;

// Vùng nội dung của hình (trừ viền + đệm khung ảnh dán) trong hệ tọa độ của phần tử bao
function contentBox(img) {
    const cs = getComputedStyle(img);
    const pl = parseFloat(cs.paddingLeft) || 0, pt = parseFloat(cs.paddingTop) || 0;
    return {
        x: img.offsetLeft + img.clientLeft + pl, y: img.offsetTop + img.clientTop + pt,
        w: img.clientWidth - pl - (parseFloat(cs.paddingRight) || 0), h: img.clientHeight - pt - (parseFloat(cs.paddingBottom) || 0),
    };
}
// Nét lưu theo tỉ lệ bề rộng hình -> đổi ra điểm ảnh của khung đang vẽ
const toPx = (st, w) => ({ ...st, w: st.w * w, p: st.p.map((v, i) => (i % 3 === 2 ? v : v * w)) });
const toRel = (st, w) => ({ ...st, w: Math.round(st.w / w * 1e5) / 1e5, p: st.p.map((v, i) => (i % 3 === 2 ? v : Math.round(v / w * 1e4) / 1e4)) });

function fit(cv, img) {
    const b = contentBox(img);
    if (!(b.w > 0 && b.h > 0)) return null;
    const d = Math.min(window.devicePixelRatio || 1, 2);
    Object.assign(cv.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' });
    if (cv.width !== Math.round(b.w * d) || cv.height !== Math.round(b.h * d)) { cv.width = Math.round(b.w * d); cv.height = Math.round(b.h * d); }
    const ctx = cv.getContext('2d');
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    return { ctx, w: b.w, h: b.h };
}
function paint(cv, img) {
    const f = fit(cv, img);
    if (!f) return;
    f.ctx.clearRect(0, 0, f.w, f.h);
    const px = strokesOf(cv.dataset.inkKey).map(st => toPx(st, f.w));
    px.filter(st => st.t === 'hl').forEach(st => drawStroke(f.ctx, st));   // dạ quang nằm dưới mực
    px.filter(st => st.t !== 'hl').forEach(st => drawStroke(f.ctx, st));
    cv.closest('.qi-wrap')?.classList.toggle('has-ink', px.length > 0);
}
function paintKey(k) {
    document.querySelectorAll('canvas.qi-ink').forEach(cv => { if (cv.dataset.inkKey === k) paint(cv, cv.parentElement.querySelector('img')); });
}

function setStrokes(k, next) {
    const h = hist.get(k) || { undo: [], redo: [] };
    h.undo.push(strokesOf(k)); if (h.undo.length > 60) h.undo.shift();
    h.redo = [];
    hist.set(k, h);
    write(k, next);
}
function write(k, arr) {
    const s = load();
    if (arr.length) s[k] = arr; else delete s[k];
    ls.set(storeKey(), JSON.stringify(s));
    paintKey(k);
    syncBar();
}
function step(k, back) {
    const h = hist.get(k);
    const from = h && (back ? h.undo : h.redo);
    if (!from || !from.length) return;
    (back ? h.redo : h.undo).push(strokesOf(k));
    write(k, from.pop());
}

// ---- Gắn lớp mực cho mọi hình trong bài (đề / ca / giải thích / mở rộng) ----
const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(es => es.forEach(e => { const cv = e.target.parentElement?.querySelector('canvas.qi-ink'); if (cv) paint(cv, e.target); })) : null;
function decorate(root) {
    root.querySelectorAll(IMG_SEL).forEach(img => {
        if (img.parentElement.classList.contains('qi-wrap') || img.closest('#img-lightbox')) return;
        const k = imgKey(img);
        if (!k) return;
        const wrap = document.createElement('span');
        wrap.className = 'qi-wrap';
        img.replaceWith(wrap);
        const cv = document.createElement('canvas');
        cv.className = 'qi-ink';
        cv.dataset.inkKey = k;
        cv.setAttribute('aria-hidden', 'true');
        wrap.append(img, cv);
        if (!img.title) img.title = 'Bấm để phóng to và vẽ ghi chú · Apple Pencil viết thẳng lên hình';
        const go = () => paint(cv, img);
        if (img.complete) go(); else img.addEventListener('load', go, { once: true });
        ro?.observe(img);
    });
}

// ---- Nhận nét bút (dùng chung: hình trong bài + khung phóng to) ----
let cur = null;   // { id, cv, ctx, w, rect, ps, st, k, tap }
function begin(e, cv) {
    const img = cv.parentElement.querySelector('img');
    const f = fit(cv, img);
    if (!f) return false;
    const k = cv.dataset.inkKey;
    try { cv.parentElement.setPointerCapture(e.pointerId); } catch (err) { }
    const rect = cv.getBoundingClientRect();
    if (prefs.pen === 'erase' || (e.pointerType === 'pen' && (e.buttons & 32))) {
        cur = { id: e.pointerId, cv, k, rect, w: f.w, erase: true, before: strokesOf(k), now: strokesOf(k) };
        eraseAt(e);
        return true;
    }
    const t = prefs.pen === 'hl' ? 'hl' : 'pen';
    cur = { id: e.pointerId, cv, k, rect, w: f.w, ctx: f.ctx, ps: 0.5, t0: performance.now(), mouse: e.pointerType !== 'pen',
        st: { t, c: prefs.color, w: SIZES[t][prefs.size], p: [] } };
    paint(cv, img);
    addPoint(e);
    setStyle(cur.ctx, cur.st);
    return true;
}
function addPoint(ev) {
    const st = cur.st, r = cur.rect;
    const x = Math.round((ev.clientX - r.left) * 10) / 10, y = Math.round((ev.clientY - r.top) * 10) / 10;
    const n = st.p.length / 3;
    if (n && Math.abs(st.p[n * 3 - 3] - x) < 0.6 && Math.abs(st.p[n * 3 - 2] - y) < 0.6) return false;
    const pr = inkPressure(cur, ev, x, y, st);   // cùng cách tính lực với giấy nháp (quiz-tools.js)
    st.p.push(x, y, pr);
    return true;
}
function eraseAt(ev) {
    const x = ev.clientX - cur.rect.left, y = ev.clientY - cur.rect.top, R = 9 + prefs.size * 4;
    const hit = (rel) => {
        const st = toPx(rel, cur.w), p = st.p, rr = R + st.w / 2;
        for (let k = 0; k < p.length; k += 3) {
            const ax = p[k], ay = p[k + 1], bx = k + 3 < p.length ? p[k + 3] : ax, by = k + 3 < p.length ? p[k + 4] : ay;
            const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
            const t = L ? clamp(((x - ax) * dx + (y - ay) * dy) / L, 0, 1) : 0;
            const ex = ax + t * dx - x, ey = ay + t * dy - y;
            if (ex * ex + ey * ey <= rr * rr) return true;
        }
        return false;
    };
    const keep = cur.now.filter(st => !hit(st));
    if (keep.length !== cur.now.length) { cur.now = keep; store[cur.k] = keep; paintKey(cur.k); }
}
function move(e) {
    if (!cur || e.pointerId !== cur.id) return;
    const evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
    if (cur.erase) { (evs.length ? evs : [e]).forEach(eraseAt); return; }
    const st = cur.st;
    for (const ev of (evs.length ? evs : [e])) if (addPoint(ev) && st.t === 'pen') penSeg(cur.ctx, st, st.p.length / 3 - 1);
    if (st.t === 'hl') { paint(cur.cv, cur.cv.parentElement.querySelector('img')); setStyle(cur.ctx, st); hlPath(cur.ctx, st); }
}
function end(e) {
    if (!cur || e.pointerId !== cur.id) return;
    const c = cur;
    cur = null;
    if (c.erase) {
        if (c.now !== c.before) { store[c.k] = c.before; setStrokes(c.k, c.now); }
        lastStrokeAt = performance.now();
        return;
    }
    // Chuột / ngón tay chạm rồi nhả tại chỗ = bấm (đóng khung phóng to), không phải chấm mực
    if (c.mouse && c.st.p.length <= 3 && performance.now() - c.t0 < 300) { paintKey(c.k); return; }
    if (c.st.t === 'pen') penTail(c.ctx, c.st);
    lastStrokeAt = performance.now();
    setStrokes(c.k, [...strokesOf(c.k), toRel(c.st, c.w)]);
}

// ---- Thanh bút trong khung phóng to ----
function syncBar() {
    const bar = document.querySelector('#img-lightbox .qi-bar');
    if (!bar) return;
    bar.querySelectorAll('[data-ink-pen]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.inkPen === prefs.pen)));
    bar.querySelectorAll('[data-ink-color]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.inkColor === prefs.color && prefs.pen !== 'erase')));
    const h = lb && hist.get(lb.key);
    const set = (a, on) => { const b = bar.querySelector(`[data-ink-act="${a}"]`); if (b) b.disabled = !on; };
    set('undo', !!(h && h.undo.length));
    set('redo', !!(h && h.redo.length));
    set('clear', !!(lb && strokesOf(lb.key).length));
    bar.querySelector('[data-ink-act="finger"]')?.setAttribute('aria-pressed', String(fingerOn()));
}

function openLightboxInk(img) {
    const box = $('img-lightbox');
    const lbImg = box && box.querySelector('img');
    const cv = box && box.querySelector('canvas.qi-ink');
    if (!cv) return;
    lb = { key: imgKey(img) };
    cv.dataset.inkKey = lb.key;
    const go = () => { if (lb && lb.key === cv.dataset.inkKey) paint(cv, lbImg); };
    lbImg.addEventListener('load', go, { once: true });
    requestAnimationFrame(() => requestAnimationFrame(go));
    syncBar();
}

export function setupInk() {
    const sec = $('quizSection'), box = $('img-lightbox');
    if (!sec) return;
    readPalette();
    // Hình mới xuất hiện (vẽ câu, mở đáp án, mở rộng) -> gắn lớp mực; gộp theo khung hình
    let raf = 0;
    new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; decorate(sec); }); }).observe(sec, { childList: true, subtree: true });
    decorate(sec);

    // Apple Pencil viết thẳng lên hình trong bài (chuột / ngón tay: bấm phóng to như cũ)
    sec.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'pen' || cur) return;
        const wrap = e.target.closest && e.target.closest('.qi-wrap');
        const cv = wrap && wrap.querySelector('canvas.qi-ink');
        if (cv && begin(e, cv)) { ls.set('quiz_scratch_pen', '1'); e.preventDefault(); }
    });
    // Bút đặt lên hình: không cuộn trang / không hiện kính lúp, menu ảnh (ngón tay vẫn cuộn bình thường)
    const stylus = (e) => [...(e.changedTouches || [])].some(t => t.touchType === 'stylus');
    ['touchstart', 'touchmove'].forEach(t => document.addEventListener(t, (e) => {
        if (stylus(e) && e.target.closest && e.target.closest('.qi-wrap, #img-lightbox .qi-stage')) e.preventDefault();
    }, { passive: false }));
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);

    // Ngay sau một nét: nuốt cú "click" kèm theo (không mở khung phóng to / không chọn đáp án / không đóng khung).
    // Nghe ở WINDOW pha bắt -> chạy trước bộ mở khung phóng to (document pha bắt, page/quiz-page-setup.js setupLightbox)
    window.addEventListener('click', (e) => {
        const onInk = e.target.closest && e.target.closest('.qi-wrap, #img-lightbox .qi-stage');
        if (onInk && performance.now() - lastStrokeAt < 450) { e.preventDefault(); e.stopImmediatePropagation(); return; }
        const img = e.target.closest && e.target.closest(IMG_SEL);
        if (img && !img.closest('#img-lightbox') && !img.closest('.answer-btn:not(.answer-locked)')) openLightboxInk(img);
    }, true);

    if (!box) return;
    const stage = box.querySelector('.qi-stage'), cv = box.querySelector('canvas.qi-ink');
    stage.addEventListener('pointerdown', (e) => {
        if (cur || (e.pointerType === 'mouse' && e.button !== 0)) return;
        if (e.pointerType === 'touch' && !fingerOn()) return;
        if (e.pointerType === 'pen') ls.set('quiz_scratch_pen', '1');
        if (begin(e, cv)) e.preventDefault();
    });
    box.querySelector('.qi-bar').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        e.stopPropagation();   // bấm thanh bút không đóng khung
        if (b.dataset.inkPen) prefs.pen = b.dataset.inkPen;
        else if (b.dataset.inkColor) { prefs.color = b.dataset.inkColor; if (prefs.pen === 'erase') prefs.pen = 'pen'; }
        else if (b.dataset.inkAct === 'undo' && lb) step(lb.key, true);
        else if (b.dataset.inkAct === 'redo' && lb) step(lb.key, false);
        else if (b.dataset.inkAct === 'clear' && lb && strokesOf(lb.key).length) setStrokes(lb.key, []);
        else if (b.dataset.inkAct === 'finger') ls.set('quiz_scratch_finger', fingerOn() ? '0' : '1');
        else if (b.dataset.inkAct === 'close') { box.click(); return; }
        ls.set('quiz_ink_prefs', JSON.stringify(prefs));
        syncBar();
    });
    document.addEventListener('keydown', (e) => {
        if (!lb || box.classList.contains('hidden') || !(e.ctrlKey || e.metaKey) || (e.key || '').toLowerCase() !== 'z' && (e.key || '').toLowerCase() !== 'y') return;
        e.preventDefault();
        step(lb.key, (e.key || '').toLowerCase() === 'z' && !e.shiftKey);
    });
    new MutationObserver(() => { if (box.classList.contains('hidden')) lb = null; }).observe(box, { attributes: true, attributeFilter: ['class'] });
    // Đổi sáng / tối: đổi màu mực rồi vẽ lại mọi hình
    let dark = document.documentElement.classList.contains('theme-dark');
    new MutationObserver(() => {
        const d = document.documentElement.classList.contains('theme-dark');
        if (d === dark) return;
        dark = d; readPalette();
        document.querySelectorAll('canvas.qi-ink').forEach(c => { if (c.dataset.inkKey) paint(c, c.parentElement.querySelector('img')); });
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    syncBar();
}
