// File: features/quiz/page/quiz-tools.js
// Công cụ khi làm bài (2026-10-13): Giấy nháp (viết bằng Apple Pencil / bút / ngón tay) + Máy tính bấm số (tab Công thức y khoa).
// Hai thứ bật/tắt ĐỘC LẬP, mở cả hai thì hiện cùng lúc:
// - Giấy nháp ghép thành NGĂN cạnh bài — màn ngang: cột bên phải, màn dọc / điện thoại: nửa dưới — bài làm co lại chứ không bị che.
// - Máy tính là CỤC NỔI: nắm thanh trên kéo đi đâu cũng được (nhớ chỗ đặt), thu gọn được, nằm trên cùng.
// Chỉ đóng khi người dùng bấm × (hoặc bấm lại nút mở); đổi câu, nộp bài, Esc đều không đóng. F5 giữa bài: tự mở lại + giữ nét nháp.
// Nút mở: #scratch-btn / #calc-btn ở hàng công cụ đầu thẻ (quiz-question-view.js) · phím W / L. CSS: quiz-stationery.css §32.
//
// Viết mượt: vẽ thẳng lên canvas ngay trong pointermove (không chờ khung hình), lấy đủ điểm 120–240Hz qua getCoalescedEvents,
// làm trơn bằng đường cong qua trung điểm, nét đậm nhạt theo lực nhấn bút, không đo lại khung khi đang vẽ; touch-action:none +
// chặn touchmove để Safari không cuộn/phóng to/hiện kính lúp; đã thấy bút thì bỏ qua chạm ngón tay (tì lòng bàn tay không ra nét).
import { state } from '../quiz-state.js';
import { getVibrate } from './quiz-page-prefs.js';

const $ = (id) => document.getElementById(id);
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } } };
const ss = { get: (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { } } };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const quizId = () => new URLSearchParams(location.search).get('id') || 'x';
const TOOLS = ['scratch', 'calc'];
const buzz = (ms = 6) => { if (getVibrate() && navigator.vibrate) navigator.vibrate(ms); };

function inQuiz() {
    const box = $('quiz-container'), res = $('resultsSection');
    return document.body.classList.contains('quiz-active') && !!box && !box.classList.contains('hidden')
        && (!res || res.classList.contains('hidden')) && state.questions.length > 0;
}
function typing() {
    const a = document.activeElement, t = a && a.tagName;
    return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || (a && a.isContentEditable);
}

/* ================================================================ NGĂN GHÉP */
let dock, scratchEl, calcEl;
const openSet = new Set();
let maxed = ss.get('quiz_scratch_max') === '1';

function buildDock() {
    dock = document.createElement('aside');
    dock.id = 'qt-dock';
    dock.hidden = true;
    dock.setAttribute('aria-label', 'Công cụ khi làm bài');
    dock.innerHTML = `
    <div class="qt-grip" role="separator" aria-label="Kéo để đổi cỡ ngăn công cụ" title="Kéo để đổi cỡ · bấm đúp để về cỡ mặc định"></div>
    <section id="qt-scratch" class="qt-panel" hidden aria-label="Giấy nháp">
        <span class="washi-tape washi-lav qt-tape" aria-hidden="true"></span>
        <header class="qt-head">
            <span class="qt-label"><i class="fas fa-pencil"></i><span class="qt-word">Nháp</span><b id="qt-scratch-q"></b></span>
            <div class="qt-group">
                <button type="button" class="qt-ib" data-act="paper" aria-label="Đổi kiểu giấy"><i class="fas fa-table-cells"></i></button>
                <button type="button" class="qt-ib" data-act="max" aria-label="Phóng to giấy nháp" aria-pressed="false"><i class="fas fa-up-right-and-down-left-from-center"></i></button>
                <button type="button" class="qt-ib" data-act="finger" title="Cho ngón tay vẽ (tắt khi dùng Apple Pencil để tì tay thoải mái)" aria-label="Vẽ bằng ngón tay"><i class="fas fa-hand"></i></button>
            </div>
            <div class="qt-group">
                <button type="button" class="qt-ib" data-act="undo" title="Hoàn tác" aria-label="Hoàn tác"><i class="fas fa-rotate-left"></i></button>
                <button type="button" class="qt-ib" data-act="redo" title="Làm lại" aria-label="Làm lại"><i class="fas fa-rotate-right"></i></button>
                <button type="button" class="qt-ib" data-act="clear" title="Xóa trang nháp của câu này (hoàn tác được)" aria-label="Xóa trang nháp"><i class="fas fa-trash-can"></i></button>
            </div>
            <button type="button" class="qt-x" data-act="close" data-tool="scratch" title="Đóng giấy nháp" aria-label="Đóng giấy nháp"><i class="fas fa-times"></i></button>
        </header>
        <div class="qt-bar" role="toolbar" aria-label="Bút">
            <div class="qt-tools">
                <button type="button" class="qt-tool" data-pen="pen" title="Bút" aria-label="Bút"><i class="fas fa-pencil"></i></button>
                <button type="button" class="qt-tool" data-pen="hl" title="Bút dạ quang" aria-label="Bút dạ quang"><i class="fas fa-marker"></i></button>
                <button type="button" class="qt-tool" data-pen="erase" title="Tẩy (chạm vào nét nào xóa nét đó)" aria-label="Tẩy"><i class="fas fa-eraser"></i></button>
            </div>
            <div class="qt-swatches">
                <button type="button" class="qt-dot" data-color="ink" title="Mực đậm" aria-label="Mực đậm"></button>
                <button type="button" class="qt-dot" data-color="red" title="Đỏ" aria-label="Đỏ"></button>
                <button type="button" class="qt-dot" data-color="blue" title="Xanh dương" aria-label="Xanh dương"></button>
                <button type="button" class="qt-dot" data-color="green" title="Xanh lá" aria-label="Xanh lá"></button>
            </div>
            <div class="qt-sizes" role="group" aria-label="Cỡ nét">
                <button type="button" class="qt-sz" data-size="0" title="Nét mảnh" aria-label="Nét mảnh"><span></span></button>
                <button type="button" class="qt-sz" data-size="1" title="Nét vừa" aria-label="Nét vừa"><span></span></button>
                <button type="button" class="qt-sz" data-size="2" title="Nét đậm" aria-label="Nét đậm"><span></span></button>
            </div>
        </div>
        <div class="qt-sheet"><p class="qt-empty" aria-hidden="true"><i class="fas fa-pencil"></i> Viết, vẽ nháp cho câu này</p><canvas class="qt-ink"></canvas><canvas class="qt-live"></canvas></div>
    </section>
    </section>`;
    document.body.appendChild(dock);
    scratchEl = $('qt-scratch');

    calcEl = document.createElement('section');
    calcEl.id = 'qt-calc';
    calcEl.className = 'qt-panel';
    calcEl.hidden = true;
    calcEl.setAttribute('aria-label', 'Máy tính');
    calcEl.innerHTML = `
        <span class="washi-tape washi-butter qt-tape" aria-hidden="true"></span>
        <header class="qt-head qt-drag" title="Nắm thanh này để kéo máy tính đi chỗ khác · bấm đúp để về chỗ cũ">
            <span class="qt-grab" aria-hidden="true"><i class="fas fa-grip-lines"></i></span>
            <div class="qt-tabs" role="tablist">
                <button type="button" role="tab" data-tab="calc" aria-selected="true"><i class="fas fa-calculator"></i><span>Máy tính</span></button>
                <button type="button" role="tab" data-tab="med" aria-selected="false"><i class="fas fa-notes-medical"></i><span>Công thức</span></button>
            </div>
            <output class="qt-mini-read" aria-hidden="true"></output>
            <button type="button" class="qt-ib" data-act="mini" title="Thu gọn / mở lại máy tính" aria-label="Thu gọn máy tính" aria-pressed="false"><i class="fas fa-minus"></i></button>
            <button type="button" class="qt-x" data-act="close" data-tool="calc" title="Đóng máy tính" aria-label="Đóng máy tính"><i class="fas fa-times"></i></button>
        </header>
        <div class="qt-pane" data-pane="calc">
            <div class="qt-lcd" title="Chạm vào máy tính rồi gõ phím được">
                <span class="qt-solar" aria-hidden="true"></span>
                <i class="fas fa-keyboard qt-kbd" title="Đang nhận phím từ bàn phím"></i>
                <div class="qt-hist" aria-label="Phép tính trước (bấm để dùng lại kết quả)"></div>
                <div class="qt-expr"></div>
                <div class="qt-res" aria-live="polite"></div>
            </div>
            <div class="qt-keys">${KEYS.map(k => `<button type="button" data-k="${k[0]}" class="${k[2] || ''}" aria-label="${k[3] || k[1]}">${k[1]}</button>`).join('')}</div>
        </div>
        <div class="qt-pane qt-med" data-pane="med" hidden>${medHtml()}</div>`;
    document.body.appendChild(calcEl);
}

// Ngăn ghép chỉ dành cho giấy nháp (máy tính nổi riêng, không chiếm chỗ của bài)
function layout() {
    const root = document.documentElement, on = openSet.has('scratch');
    const W = innerWidth, H = innerHeight, side = W >= 640 && W / H >= 1.15;
    dock.hidden = !on;
    scratchEl.hidden = !on;
    calcEl.hidden = !openSet.has('calc');
    root.classList.toggle('qt-on', on);
    root.classList.toggle('qt-side', on && side);
    root.classList.toggle('qt-bottom', on && !side);
    root.classList.toggle('qt-tight', false);
    root.classList.toggle('qt-narrow', false);
    root.classList.toggle('qt-nav', false);
    root.classList.toggle('qt-max', on && maxed);
    if (!on) return;
    if (side) {
        const base = clamp(+ls.get('quiz_tools_w') || Math.min(440, Math.max(300, W * 0.36)), 260, W * 0.6);
        const w = maxed ? Math.max(base, Math.min(W * 0.66, W - 420)) : base;   // phóng to: vẫn chừa ≥ 420px cho bài
        root.style.setProperty('--qt-w', Math.round(w) + 'px');
        root.classList.toggle('qt-tight', W >= 1024 && W - w < 1180);   // không đủ chỗ cho 3 cột: ghi chú xuống dưới bài làm
        root.classList.toggle('qt-narrow', W >= 1024 && W - w < 640);   // còn hẹp hơn nữa (phóng to giấy): bài 1 cột, tạm ẩn cột số câu
    } else {
        const nav = $('quiz-mobile-nav');
        const bot = nav && nav.classList.contains('show') ? nav.offsetHeight : 0;
        const h = maxed ? (H - bot) * 0.8 : clamp(+ls.get('quiz_tools_h') || H * 0.44, 190, (H - bot) * 0.75);
        root.style.setProperty('--qt-h', Math.round(h) + 'px');
        root.style.setProperty('--qt-bot', bot + 'px');
        root.classList.toggle('qt-nav', bot > 0);
    }
}

function setOpen(tool, on) {
    if (on) openSet.add(tool); else openSet.delete(tool);
    ss.set('quiz_tools_open', JSON.stringify([...openSet]));
    layout();
    syncLaunchers();
    if (tool === 'scratch' && on) { fitSheet(); syncScratchPage(); }
    if (tool === 'calc') { calcHot = on; syncHot(); if (on) showCalcAt(); }
}
const toggle = (tool) => setOpen(tool, !openSet.has(tool));

function syncLaunchers() {
    [['scratch-btn', 'scratch'], ['calc-btn', 'calc']].forEach(([id, t]) => {
        const b = $(id);
        if (b && b.getAttribute('aria-pressed') !== String(openSet.has(t))) b.setAttribute('aria-pressed', String(openSet.has(t)));
    });
}

// Kéo mép ngăn để đổi cỡ (lưu lại); bấm đúp về mặc định
function setupGrip() {
    const grip = dock.querySelector('.qt-grip');
    let drag = null;
    grip.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        grip.setPointerCapture(e.pointerId);
        drag = { side: document.documentElement.classList.contains('qt-side') };
        document.body.classList.add('qt-resizing');
        if (maxed) { maxed = false; ss.set('quiz_scratch_max', ''); syncScratchBar(); }   // tự kéo cỡ = thôi chế độ phóng to
    });
    grip.addEventListener('pointermove', (e) => {
        if (!drag) return;
        if (drag.side) ls.set('quiz_tools_w', String(Math.round(clamp(innerWidth - e.clientX, 260, innerWidth * 0.6))));
        else {
            const bot = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--qt-bot')) || 0;
            ls.set('quiz_tools_h', String(Math.round(clamp(innerHeight - bot - e.clientY, 190, innerHeight * 0.75))));
        }
        layout();
    });
    const end = () => { if (!drag) return; drag = null; document.body.classList.remove('qt-resizing'); fitSheet(); };
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
    grip.addEventListener('dblclick', () => { ls.set('quiz_tools_w', ''); ls.set('quiz_tools_h', ''); layout(); fitSheet(); });
}

/* ---------------------------------------------------------------- Máy tính nổi: nắm thanh trên kéo đi, nhớ chỗ đặt */
// Luôn nằm trọn trong vùng nhìn thấy: kéo ra mép / xoay máy / đổi cỡ cửa sổ / đổi tab / bàn phím ảo bật lên (visualViewport co lại)
// đều không che phím; tránh tai thỏ, góc bo, vạch Home (trang dùng viewport-fit=cover). calcPos = chỗ NGƯỜI DÙNG đặt:
// bàn phím ảo tắt / thôi thu gọn thì máy tính về lại đúng chỗ đó.
let calcPos = null;
const safe = { t: 0, r: 0, b: 0, l: 0 };
let safeProbe = null;
function readSafe() {
    if (!safeProbe) {
        safeProbe = document.createElement('div');
        safeProbe.setAttribute('aria-hidden', 'true');
        safeProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;'
            + 'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
        document.body.appendChild(safeProbe);
    }
    const cs = getComputedStyle(safeProbe);
    safe.t = parseFloat(cs.paddingTop) || 0; safe.r = parseFloat(cs.paddingRight) || 0;
    safe.b = parseFloat(cs.paddingBottom) || 0; safe.l = parseFloat(cs.paddingLeft) || 0;
}
function placeCalc(x, y) {
    const v = window.visualViewport, w = calcEl.offsetWidth, h = calcEl.offsetHeight;
    const L = (v ? v.offsetLeft : 0) + safe.l + 4, T = (v ? v.offsetTop : 0) + safe.t + 4;
    const R = (v ? v.offsetLeft + v.width : innerWidth) - safe.r - 4, B = (v ? v.offsetTop + v.height : innerHeight) - safe.b - 4;
    calcEl.style.left = Math.round(clamp(x, L, Math.max(L, R - w))) + 'px';
    calcEl.style.top = Math.round(clamp(y, T, Math.max(T, B - h))) + 'px';
}
// Chỗ mặc định: góc phải dưới của phần bài làm (né ngăn giấy nháp nếu đang mở)
function defaultCalcPos() {
    const root = document.documentElement, cs = getComputedStyle(root), px = (v) => parseFloat(cs.getPropertyValue(v)) || 0;
    const right = root.classList.contains('qt-side') ? px('--qt-w') : 0;
    const bottom = root.classList.contains('qt-bottom') ? px('--qt-h') + px('--qt-bot') : 0;
    return [innerWidth - right - calcEl.offsetWidth - 16, innerHeight - bottom - calcEl.offsetHeight - 16];
}
function showCalcAt() {
    const p = (ls.get('quiz_calc_pos') || '').split(',').map(Number);
    calcPos = p.length === 2 && p.every(Number.isFinite) ? p : defaultCalcPos();
    placeCalc(...calcPos);
}
function setupCalcDrag() {
    const head = calcEl.querySelector('.qt-drag');
    let drag = null, swallow = false;
    // Nắm cả trên chữ tab cũng kéo được: chỉ thành "kéo" khi đã đi quá 6px, không thì vẫn là bấm tab
    window.addEventListener('pointerdown', () => { swallow = false; }, true);   // thả tay ngoài máy tính thì không có click để nuốt: lần chạm mới xóa cờ
    head.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.qt-ib, .qt-x') || (e.pointerType === 'mouse' && e.button !== 0)) return;
        const r = calcEl.getBoundingClientRect();
        drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
    });
    window.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
        drag.moved = true;
        calcEl.classList.add('is-drag');
        placeCalc(e.clientX - drag.dx, e.clientY - drag.dy);
    });
    const end = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        if (drag.moved) {
            swallow = true;   // nuốt cú click đi kèm lúc thả tay (thả trên tab thì không đổi tab)
            calcEl.classList.remove('is-drag');
            calcPos = [parseInt(calcEl.style.left, 10), parseInt(calcEl.style.top, 10)];
            ls.set('quiz_calc_pos', calcPos.join(','));
        }
        drag = null;
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    calcEl.addEventListener('click', (e) => { if (swallow) { swallow = false; e.stopPropagation(); e.preventDefault(); } }, true);
    head.addEventListener('dblclick', (e) => {
        if (e.target.closest('button')) return;
        ls.set('quiz_calc_pos', '');
        calcPos = defaultCalcPos();
        placeCalc(...calcPos);
    });
}

/* ================================================================ GIẤY NHÁP */
// Mỗi câu một trang nháp (về lại câu cũ là thấy nét cũ). Nét lưu dạng véc-tơ [x, y, lực, ...] theo px CSS -> đổi cỡ ngăn / đổi
// sáng-tối thì vẽ lại sắc nét. Lưu sessionStorage theo lượt làm bài (quizStartTime): F5 còn, làm lượt mới thì trang trắng.
const SIZES = { pen: [1.3, 2.3, 3.8], hl: [10, 16, 24] };
const PEN_VAR = { ink: '--ink', red: '--bad-solid', blue: '--pick-solid', green: '--ok-solid' };
const HL_VAR = { ink: '--hue-butter', red: '--hue-blossom', blue: '--hue-sky', green: '--hue-mint' };
const PAPERS = ['grid', 'lines', 'plain'];
const PAPER_UI = { grid: ['fa-table-cells', 'Giấy kẻ ô'], lines: ['fa-bars', 'Giấy kẻ dòng'], plain: ['fa-square', 'Giấy trơn'] };
let prefs = { pen: 'pen', color: 'ink', size: 1, paper: 'grid' };
try { Object.assign(prefs, JSON.parse(ls.get('quiz_scratch_prefs') || '{}')); } catch (e) { }
let pal = {};
let pages = {}, pagesStamp = null, pageKey = null;
let sheet, ink, live, ictx, lctx, dpr = 1, sheetW = 0, sheetH = 0;
let cur = null;          // nét đang vẽ { st, id, rect, ps }
let erasing = null;      // { id, rect, before }

const stamp = () => (state.quizStartTime ? new Date(state.quizStartTime).getTime() || 0 : 0);
const storeKey = () => 'quizScratch_' + quizId();
const page = () => (pages[pageKey] || (pages[pageKey] = { s: [], undo: [], redo: [] }));
let penSeen = ls.get('quiz_scratch_pen') === '1';
const fingerOn = () => { const v = ls.get('quiz_scratch_finger'); return v === null || v === '' ? !penSeen : v === '1'; };

function readPalette() {
    const cs = getComputedStyle(document.documentElement);
    pal = { pen: {}, hl: {} };
    for (const k in PEN_VAR) { pal.pen[k] = cs.getPropertyValue(PEN_VAR[k]).trim() || '#5A4640'; pal.hl[k] = cs.getPropertyValue(HL_VAR[k]).trim() || '#F2BE2E'; }
}

function ensurePages() {
    const t = stamp();
    if (t === pagesStamp) return;
    pagesStamp = t; pages = {}; pageKey = null;
    try {
        const o = JSON.parse(ss.get(storeKey()) || 'null');
        if (o && o.t === t && o.p) for (const k in o.p) pages[k] = { s: o.p[k], undo: [], redo: [] };
    } catch (e) { }
}
let saveT = 0;
function saveSoon() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
        const p = {};
        for (const k in pages) if (pages[k].s.length) p[k] = pages[k].s;
        ss.set(storeKey(), JSON.stringify({ t: pagesStamp, p }));
    }, 700);
}

function fitSheet() {
    if (!sheet || scratchEl.hidden) return;
    const w = sheet.clientWidth, h = sheet.clientHeight, d = Math.min(window.devicePixelRatio || 1, 2);   // iPhone 3x -> 2x: vẫn sắc, bớt 44% điểm ảnh phải tô
    if (!w || !h || (w === sheetW && h === sheetH && d === dpr)) return;
    sheetW = w; sheetH = h; dpr = d;
    [ink, live].forEach(c => { c.width = Math.round(w * d); c.height = Math.round(h * d); });
    [ictx, lctx].forEach(c => { c.setTransform(d, 0, 0, d, 0, 0); c.lineCap = 'round'; c.lineJoin = 'round'; });
    redraw();
}

function setStyle(ctx, st) {
    const col = (st.t === 'hl' ? pal.hl : pal.pen)[st.c] || pal.pen.ink;
    ctx.strokeStyle = col; ctx.fillStyle = col;
}
// Bề rộng tại điểm k: bút đậm nhạt theo lực nhấn (lực đã làm mượt lúc ghi), dạ quang đều nét
const widthAt = (st, k) => (st.t === 'hl' ? st.w : st.w * (0.45 + 1.1 * st.p[k * 3 + 2]));
// Đoạn kết thúc ở điểm k (k ≥ 1): cong bậc 2 từ trung điểm (k-2,k-1) qua điểm k-1 tới trung điểm (k-1,k)
function penSeg(ctx, st, k) {
    const p = st.p, i = (k - 1) * 3, x0 = p[i], y0 = p[i + 1], mx = (x0 + p[i + 3]) / 2, my = (y0 + p[i + 4]) / 2;
    ctx.lineWidth = widthAt(st, k - 1);
    ctx.beginPath();
    if (k === 1) ctx.moveTo(x0, y0);
    else ctx.moveTo((p[i - 3] + x0) / 2, (p[i - 2] + y0) / 2);
    if (k === 1) ctx.lineTo(mx, my); else ctx.quadraticCurveTo(x0, y0, mx, my);
    ctx.stroke();
}
function penTail(ctx, st) {
    const p = st.p, n = p.length / 3;
    if (n === 1) { ctx.beginPath(); ctx.arc(p[0], p[1], widthAt(st, 0) / 2, 0, Math.PI * 2); ctx.fill(); return; }
    const i = (n - 2) * 3;
    ctx.lineWidth = widthAt(st, n - 1);
    ctx.beginPath(); ctx.moveTo((p[i] + p[i + 3]) / 2, (p[i + 1] + p[i + 4]) / 2); ctx.lineTo(p[i + 3], p[i + 4]); ctx.stroke();
}
function hlPath(ctx, st) {
    const p = st.p, n = p.length / 3;
    ctx.save();
    ctx.globalAlpha = 0.4; ctx.lineWidth = st.w;
    ctx.beginPath(); ctx.moveTo(p[0], p[1]);
    for (let k = 1; k < n; k++) ctx.quadraticCurveTo(p[k * 3 - 3], p[k * 3 - 2], (p[k * 3 - 3] + p[k * 3]) / 2, (p[k * 3 - 2] + p[k * 3 + 1]) / 2);
    ctx.lineTo(p[n * 3 - 3], p[n * 3 - 2] + (n === 1 ? 0.01 : 0));
    ctx.stroke();
    ctx.restore();
}
// Vẽ lại cả nét (lật câu, hoàn tác, đổi cỡ ngăn): các đoạn cùng bề rộng (làm tròn 0,25px) đi chung một path ->
// trang nhiều nét trên iPad / điện thoại vẽ lại nhanh hơn nhiều so với stroke() từng đoạn. Khi đang viết vẫn vẽ từng đoạn (penSeg).
function drawStroke(ctx, st) {
    setStyle(ctx, st);
    if (st.t === 'hl') { hlPath(ctx, st); return; }
    const p = st.p, n = p.length / 3;
    let w = -1;
    for (let k = 1; k < n; k++) {
        const i = (k - 1) * 3, x0 = p[i], y0 = p[i + 1], mx = (x0 + p[i + 3]) / 2, my = (y0 + p[i + 4]) / 2;
        const wk = Math.round(widthAt(st, k - 1) * 4) / 4;
        if (wk !== w) {
            if (w >= 0) ctx.stroke();
            w = wk; ctx.lineWidth = w; ctx.beginPath();
            if (k === 1) ctx.moveTo(x0, y0); else ctx.moveTo((p[i - 3] + x0) / 2, (p[i - 2] + y0) / 2);
        }
        if (k === 1) ctx.lineTo(mx, my); else ctx.quadraticCurveTo(x0, y0, mx, my);
    }
    if (w >= 0) ctx.stroke();
    penTail(ctx, st);
}
// Dùng chung với mực trên HÌNH trong đề (page/quiz-ink.js): cùng cách làm trơn nét, đậm nhạt theo lực bút, bảng màu theo sáng/tối
export { SIZES, readPalette, drawStroke, penSeg, penTail, hlPath, setStyle };

function redraw() {
    if (!ictx) return;
    ictx.clearRect(0, 0, sheetW, sheetH);
    lctx.clearRect(0, 0, sheetW, sheetH);
    const s = pageKey === null ? [] : page().s;
    s.filter(st => st.t === 'hl').forEach(st => drawStroke(ictx, st));   // dạ quang nằm dưới mực
    s.filter(st => st.t !== 'hl').forEach(st => drawStroke(ictx, st));
}

function commit(next) {
    const pg = page();
    pg.undo.push(pg.s); if (pg.undo.length > 60) pg.undo.shift();
    pg.redo = []; pg.s = next;
    saveSoon(); syncScratchBar();
}

function undo() {
    const pg = pageKey === null ? null : page();
    if (!pg || !pg.undo.length) return false;
    pg.redo.push(pg.s); pg.s = pg.undo.pop(); redraw(); saveSoon(); syncScratchBar();
    return true;
}
function redo() {
    const pg = pageKey === null ? null : page();
    if (!pg || !pg.redo.length) return false;
    pg.undo.push(pg.s); pg.s = pg.redo.pop(); redraw(); saveSoon(); syncScratchBar();
    return true;
}

// Chấm xem trước khi bút lơ lửng trên giấy (Apple Pencil hover trên iPad Pro, bút Surface) hoặc rê chuột: thấy trước màu + cỡ nét
function hoverDot(x, y) {
    lctx.clearRect(0, 0, sheetW, sheetH);
    lctx.save();
    if (prefs.pen === 'erase') {
        lctx.globalAlpha = 0.55; lctx.lineWidth = 1.5; lctx.strokeStyle = pal.pen.ink;
        lctx.beginPath(); lctx.arc(x, y, 9 + prefs.size * 4, 0, Math.PI * 2); lctx.stroke();
    } else {
        const hl = prefs.pen === 'hl';
        lctx.globalAlpha = hl ? 0.45 : 0.7;
        lctx.fillStyle = (hl ? pal.hl : pal.pen)[prefs.color];
        lctx.beginPath(); lctx.arc(x, y, Math.max(1.6, SIZES[hl ? 'hl' : 'pen'][prefs.size] / 2), 0, Math.PI * 2); lctx.fill();
    }
    lctx.restore();
}

function addPoint(ev) {
    const st = cur.st, r = cur.rect;
    const x = Math.round((ev.clientX - r.left) * 10) / 10, y = Math.round((ev.clientY - r.top) * 10) / 10;
    const n = st.p.length / 3;
    if (n && Math.abs(st.p[n * 3 - 3] - x) < 0.6 && Math.abs(st.p[n * 3 - 2] - y) < 0.6) return false;   // bút 240Hz: bỏ điểm sát nhau (nét y hệt, lưu & vẽ lại nhẹ hơn)
    const raw = ev.pointerType === 'pen' && ev.pressure > 0 ? ev.pressure : 0.5;
    cur.ps = n ? cur.ps * 0.6 + raw * 0.4 : raw;
    st.p.push(x, y, Math.round(cur.ps * 100) / 100);
    return true;
}

function eraseAt(x, y) {
    const pg = page(), R = 9 + (prefs.size * 4);
    const hit = (st) => {
        const p = st.p, rr = R + st.w / 2;
        for (let k = 0; k < p.length; k += 3) {
            const ax = p[k], ay = p[k + 1], bx = k + 3 < p.length ? p[k + 3] : ax, by = k + 3 < p.length ? p[k + 4] : ay;
            const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
            const t = L ? clamp(((x - ax) * dx + (y - ay) * dy) / L, 0, 1) : 0;
            const ex = ax + t * dx - x, ey = ay + t * dy - y;
            if (ex * ex + ey * ey <= rr * rr) return true;
        }
        return false;
    };
    const keep = pg.s.filter(st => !hit(st));
    if (keep.length !== pg.s.length) { pg.s = keep; redraw(); }
    lctx.clearRect(0, 0, sheetW, sheetH);
    lctx.save(); lctx.globalAlpha = 0.5; lctx.lineWidth = 1.5; lctx.strokeStyle = pal.pen.ink;
    lctx.beginPath(); lctx.arc(x, y, R, 0, Math.PI * 2); lctx.stroke(); lctx.restore();
}

function setupScratch() {
    sheet = scratchEl.querySelector('.qt-sheet');
    ink = sheet.querySelector('.qt-ink');
    live = sheet.querySelector('.qt-live');
    // KHÔNG dùng { desynchronized: true }: Chrome trên một số máy Windows (GPU) coi canvas đó là lớp đặc -> chỗ trong suốt hiện ĐEN thui
    ictx = ink.getContext('2d');
    lctx = live.getContext('2d');
    readPalette();

    const isEraserTip = (e) => e.pointerType === 'pen' && (e.buttons & 32);   // đầu tẩy của bút Surface/Wacom
    // Cử chỉ kiểu GoodNotes: chạm NHANH 2 ngón = hoàn tác, 3 ngón = làm lại (ngón tay vẽ hay không đều dùng được)
    const touches = new Map();
    let gest = null, firstTouchAt = 0;
    sheet.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch') {
            if (!touches.size) firstTouchAt = performance.now();
            touches.set(e.pointerId, [e.clientX, e.clientY]);
            if (touches.size >= 2) {
                if (!gest) gest = { n: 0, t0: firstTouchAt, moved: false };
                gest.n = Math.max(gest.n, touches.size);
                // ngón thứ hai chạm ngay sau ngón đầu: nét ngón đầu vừa bắt đầu là một phần của cử chỉ -> bỏ nét đó
                if (cur && cur.touch && (performance.now() - cur.t0 < 260 || cur.st.p.length < 36)) { cur = null; redraw(); }
                return;
            }
        }
        if (e.pointerType === 'pen') { if (!penSeen) { penSeen = true; ls.set('quiz_scratch_pen', '1'); syncScratchBar(); } }
        else if (e.pointerType === 'touch' && !fingerOn()) return;   // tì tay khi viết bằng bút
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (cur || erasing || pageKey === null) return;               // đang có một nét khác (ngón thứ hai, lòng bàn tay...)
        e.preventDefault();
        try { sheet.setPointerCapture(e.pointerId); } catch (err) { }
        const rect = sheet.getBoundingClientRect();                    // đo MỘT lần mỗi nét
        if (prefs.pen === 'erase' || isEraserTip(e)) {
            erasing = { id: e.pointerId, rect, before: page().s };
            eraseAt(e.clientX - rect.left, e.clientY - rect.top);
            return;
        }
        const t = prefs.pen === 'hl' ? 'hl' : 'pen';
        sheet.classList.add('has-ink');
        lctx.clearRect(0, 0, sheetW, sheetH);   // xóa chấm xem trước
        cur = { id: e.pointerId, rect, ps: 0.5, touch: e.pointerType === 'touch', t0: performance.now(), st: { t, c: prefs.color, w: SIZES[t][prefs.size], p: [] } };
        addPoint(e);
        setStyle(t === 'hl' ? lctx : ictx, cur.st);
        if (t === 'hl') { lctx.clearRect(0, 0, sheetW, sheetH); hlPath(lctx, cur.st); }
    });
    let hoverRect = null;
    sheet.addEventListener('pointermove', (e) => {
        if (gest && touches.has(e.pointerId)) {
            const s0 = touches.get(e.pointerId);
            if (Math.hypot(e.clientX - s0[0], e.clientY - s0[1]) > 14) gest.moved = true;   // kéo / chụm = không phải chạm nhanh
            return;
        }
        if (!cur && !erasing && e.buttons === 0 && (e.pointerType === 'pen' || e.pointerType === 'mouse')) {
            if (!hoverRect) hoverRect = sheet.getBoundingClientRect();
            hoverDot(e.clientX - hoverRect.left, e.clientY - hoverRect.top);
            return;
        }
        if (erasing && e.pointerId === erasing.id) {
            const evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
            (evs.length ? evs : [e]).forEach(ev => eraseAt(ev.clientX - erasing.rect.left, ev.clientY - erasing.rect.top));
            return;
        }
        if (!cur || e.pointerId !== cur.id) return;
        const evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
        const st = cur.st;
        for (const ev of (evs.length ? evs : [e])) {
            if (addPoint(ev) && st.t === 'pen') penSeg(ictx, st, st.p.length / 3 - 1);   // vẽ ngay đoạn mới, không chờ khung hình
        }
        if (st.t === 'hl') { lctx.clearRect(0, 0, sheetW, sheetH); hlPath(lctx, st); }
    });
    sheet.addEventListener('pointerleave', () => { hoverRect = null; if (!cur && !erasing) lctx.clearRect(0, 0, sheetW, sheetH); });
    const end = (e) => {
        if (touches.delete(e.pointerId) && gest) {
            if (!touches.size) {
                const quick = !gest.moved && performance.now() - gest.t0 < 500, n = gest.n;
                gest = null;
                if (quick && (n === 2 ? undo() : redo())) buzz(10);
            }
            return;
        }
        if (erasing && e.pointerId === erasing.id) {
            const pg = page(), before = erasing.before;
            erasing = null;
            lctx.clearRect(0, 0, sheetW, sheetH);
            if (pg.s !== before) { const now = pg.s; pg.s = before; commit(now); }
            return;
        }
        if (!cur || e.pointerId !== cur.id) return;
        const st = cur.st;
        cur = null;
        if (st.t === 'pen') penTail(ictx, st);
        commit([...page().s, st]);
        if (st.t === 'hl') redraw();   // dạ quang từ lớp tạm về đúng chỗ (dưới mực)
    };
    sheet.addEventListener('pointerup', end);
    sheet.addEventListener('pointercancel', end);
    sheet.addEventListener('lostpointercapture', end);
    // Safari: chặn cuộn / phóng to / kính lúp / chọn chữ khi bút hay ngón tay đặt lên giấy
    ['touchstart', 'touchmove'].forEach(t => sheet.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
    sheet.addEventListener('contextmenu', (e) => e.preventDefault());

    scratchEl.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        const pg = pageKey === null ? null : page();
        if (b.dataset.pen) prefs.pen = b.dataset.pen;
        else if (b.dataset.color) { prefs.color = b.dataset.color; if (prefs.pen === 'erase') prefs.pen = 'pen'; }
        else if (b.dataset.size) prefs.size = +b.dataset.size;
        else if (b.dataset.act === 'paper') prefs.paper = PAPERS[(PAPERS.indexOf(prefs.paper) + 1) % PAPERS.length];
        else if (b.dataset.act === 'finger') ls.set('quiz_scratch_finger', fingerOn() ? '0' : '1');
        else if (b.dataset.act === 'undo') undo();
        else if (b.dataset.act === 'redo') redo();
        else if (b.dataset.act === 'clear' && pg && pg.s.length) { commit([]); redraw(); }
        else if (b.dataset.act === 'max') {
            maxed = !maxed; ss.set('quiz_scratch_max', maxed ? '1' : '');
            layout(); fitSheet();
            if (openSet.has('calc')) placeCalc(...(calcPos || [calcEl.offsetLeft, calcEl.offsetTop]));
        } else return;
        buzz();
        ls.set('quiz_scratch_prefs', JSON.stringify(prefs));
        syncScratchBar();
    });
    new ResizeObserver(() => { if (!cur && !erasing) fitSheet(); }).observe(sheet);
    // Đổi sáng / tối: đổi màu mực rồi vẽ lại
    let dark = document.documentElement.classList.contains('theme-dark');
    new MutationObserver(() => {
        const d = document.documentElement.classList.contains('theme-dark');
        if (d === dark) return;
        dark = d; readPalette(); redraw(); syncScratchBar();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    syncScratchBar();
}

function syncScratchBar() {
    if (!scratchEl) return;
    scratchEl.querySelectorAll('[data-pen]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pen === prefs.pen)));
    scratchEl.querySelectorAll('[data-color]').forEach(b => {
        b.style.setProperty('--c', (prefs.pen === 'hl' ? pal.hl : pal.pen)[b.dataset.color]);
        b.setAttribute('aria-pressed', String(b.dataset.color === prefs.color && prefs.pen !== 'erase'));
    });
    scratchEl.querySelectorAll('[data-size]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.size === prefs.size)));
    const pb = scratchEl.querySelector('[data-act="paper"]'), pu = PAPER_UI[prefs.paper] || PAPER_UI.grid;
    pb.firstElementChild.className = 'fas ' + pu[0];
    pb.title = pu[1] + ' · bấm để đổi kiểu giấy';
    sheet.dataset.paper = prefs.paper;
    sheet.dataset.pen = prefs.pen;
    const f = scratchEl.querySelector('[data-act="finger"]');
    f.hidden = !(navigator.maxTouchPoints > 0 && penSeen);
    const mb = scratchEl.querySelector('[data-act="max"]');
    mb.setAttribute('aria-pressed', String(maxed));
    mb.firstElementChild.className = 'fas ' + (maxed ? 'fa-compress-arrows-alt' : 'fa-up-right-and-down-left-from-center');
    mb.title = maxed ? 'Thu giấy nháp về cỡ cũ' : 'Phóng to giấy nháp';
    f.setAttribute('aria-pressed', String(fingerOn()));
    const pg = pageKey === null ? null : page();
    scratchEl.querySelector('[data-act="undo"]').disabled = !(pg && pg.undo.length);
    scratchEl.querySelector('[data-act="redo"]').disabled = !(pg && pg.redo.length);
    scratchEl.querySelector('[data-act="clear"]').disabled = !(pg && pg.s.length);
    sheet.classList.toggle('has-ink', !!(pg && pg.s.length) || !!cur);
}

// Đổi câu -> lật sang trang nháp của câu đó
function syncScratchPage() {
    if (!openSet.has('scratch') || !state.questions.length) return;
    ensurePages();
    const k = state.currentIndex;
    if (k === pageKey) return;
    if (cur || erasing) return;   // đang giữa nét: để nét xong rồi mới lật
    pageKey = k;
    $('qt-scratch-q').textContent = 'Câu ' + (k + 1);
    redraw();
    syncScratchBar();
}

/* ================================================================ MÁY TÍNH */
// [phím, nhãn, lớp, nhãn đọc]
const KEYS = [
    ['AC', 'AC', 'is-ac', 'Xóa hết'], ['(', '(', 'is-fn', 'Mở ngoặc'], [')', ')', 'is-fn', 'Đóng ngoặc'], ['back', '⌫', 'is-fn', 'Xóa một ký tự'], ['÷', '÷', 'is-op', 'Chia'],
    ['7', '7'], ['8', '8'], ['9', '9'], ['√', '√', 'is-fn', 'Căn bậc hai'], ['×', '×', 'is-op', 'Nhân'],
    ['4', '4'], ['5', '5'], ['6', '6'], ['^2', 'x²', 'is-fn', 'Bình phương'], ['−', '−', 'is-op', 'Trừ'],
    ['1', '1'], ['2', '2'], ['3', '3'], ['^', 'xʸ', 'is-fn', 'Lũy thừa'], ['+', '+', 'is-op', 'Cộng'],
    ['0', '0'], ['.', '.', '', 'Dấu thập phân'], ['%', '%', 'is-fn', 'Phần trăm'], ['log(', 'log', 'is-fn', 'Logarit cơ số 10'], ['=', '=', 'is-eq', 'Bằng'],
];
let expr = '', justEq = false, calcHot = false;
const hist = [];

// Bộ tính biểu thức tự viết (không eval): + − × ÷ ^ % √ log ln, ngoặc thiếu tự đóng, "2(3)" = 2×3
function calcEval(src) {
    const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/,/g, '.').replace(/\s+/g, '');
    let i = 0;
    const eat = (c) => (s[i] === c ? (i++, true) : false);
    const num = () => {
        const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/.exec(s.slice(i));
        if (!m) throw new Error('cú pháp');
        i += m[0].length;
        return parseFloat(m[0]);
    };
    const atom = () => {
        if (eat('(')) { const v = add(); eat(')'); return v; }
        if (eat('√')) return Math.sqrt(unary());
        if (s.startsWith('log', i)) { i += 3; return Math.log10(unary()); }
        if (s.startsWith('ln', i)) { i += 2; return Math.log(unary()); }
        return num();
    };
    const post = () => { let v = atom(); while (eat('%')) v /= 100; return v; };
    const pow = () => { const b = post(); return eat('^') ? Math.pow(b, unary()) : b; };
    const unary = () => (eat('-') ? -unary() : eat('+') ? unary() : pow());
    const mul = () => {
        let v = unary();
        for (;;) {
            if (eat('*')) v *= unary();
            else if (eat('/')) v /= unary();
            else if (i < s.length && /[\d.(√l]/.test(s[i])) v *= unary();
            else return v;
        }
    };
    const add = () => { let v = mul(); for (;;) { if (eat('+')) v += mul(); else if (eat('-')) v -= mul(); else return v; } };
    if (!s) throw new Error('trống');
    const v = add();
    if (i < s.length) throw new Error('cú pháp');
    return v;
}
const fmtNum = (v) => (Number.isFinite(v) ? String(+v.toPrecision(12)) : 'Lỗi');
const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function calcPress(k) {
    if (k === 'AC') { expr = ''; justEq = false; }
    else if (k === 'back') { expr = /log\($/.test(expr) ? expr.slice(0, -4) : expr.slice(0, -1); justEq = false; }
    else if (k === '=') {
        if (!expr) return;
        let r;
        try { r = fmtNum(calcEval(expr)); } catch (e) { r = 'Lỗi'; }
        if (r === 'Lỗi') {
            calcEl.querySelector('.qt-res').textContent = 'Phép tính chưa đúng';
            flash(calcEl.querySelector('.qt-lcd'), 'is-err');
            return;
        }
        hist.push({ e: expr, r }); if (hist.length > 30) hist.shift();
        expr = r; justEq = true;
        renderCalc();
        flash(calcEl.querySelector('.qt-expr'), 'is-pop');
        return;
    } else {
        if (justEq && (k === '√' || k === 'log(')) { expr = k + expr; justEq = false; renderCalc(); return; }   // √ / log của kết quả vừa ra
        const isOp = /^[+−×÷^%)]/.test(k);
        if (justEq && !isOp) expr = '';   // vừa ra kết quả: gõ số mới là phép tính mới, gõ dấu là tính tiếp
        justEq = false;
        expr += k;
    }
    renderCalc();
}
// Chạy lại một hiệu ứng ngắn (gỡ lớp -> ép vẽ -> gắn lại)
function flash(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
const opHtml = (t) => esc(t).replace(/log|[+−×÷^%()√]/g, (m) => `<span class="op">${m}</span>`);
function renderCalc() {
    const ex = calcEl.querySelector('.qt-expr');
    ex.innerHTML = expr ? opHtml(expr) : '0';
    ex.scrollLeft = ex.scrollWidth;   // biểu thức dài: luôn thấy phần cuối đang gõ
    let prev = '';
    if (expr && !justEq && /[^\d.]/.test(expr)) { try { const v = fmtNum(calcEval(expr)); if (v !== 'Lỗi') prev = '= ' + v; } catch (e) { } }
    calcEl.querySelector('.qt-res').textContent = justEq ? '' : prev;
    ex.classList.toggle('is-result', justEq);
    calcEl.querySelector('.qt-mini-read').textContent = justEq || !prev ? (expr || '0') : prev;
    const h = calcEl.querySelector('.qt-hist');
    h.innerHTML = hist.length
        ? hist.map(x => `<button type="button" data-v="${esc(x.r)}">${opHtml(x.e)} = <b>${esc(x.r)}</b></button>`).join('')
        : '<span class="qt-hist-empty">Phép tính đã làm hiện ở đây</span>';
    h.scrollTop = h.scrollHeight;
}

function setupCalc() {
    let lpT = 0, lpDone = false;
    calcEl.addEventListener('pointerdown', (e) => {
        lpDone = false; clearTimeout(lpT);
        if (e.target.closest('[data-k="back"]')) lpT = setTimeout(() => { lpDone = true; calcPress('AC'); buzz(18); }, 480);
    });
    ['pointerup', 'pointercancel'].forEach(t => window.addEventListener(t, () => clearTimeout(lpT)));
    calcEl.addEventListener('contextmenu', (e) => { if (e.target.closest('.qt-keys')) e.preventDefault(); });   // giữ phím không bật menu
    calcEl.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        calcHot = true; syncHot();
        if (lpDone && b.dataset.k === 'back') { lpDone = false; return; }   // vừa giữ ⌫ để xóa hết
        if (b.dataset.k) buzz();
        if (b.dataset.act === 'mini') {
            const mini = calcEl.classList.toggle('is-mini');
            b.setAttribute('aria-pressed', String(mini));
            b.firstElementChild.className = 'fas ' + (mini ? 'fa-plus' : 'fa-minus');
            placeCalc(...(calcPos || [calcEl.offsetLeft, calcEl.offsetTop]));   // mở lại khi đang sát đáy: đẩy lên cho vừa màn
        } else if (b.dataset.k) calcPress(b.dataset.k);
        else if (b.dataset.v) { if (justEq || !expr) expr = ''; justEq = false; expr += b.dataset.v; renderCalc(); }
        else if (b.dataset.tab) {
            calcEl.querySelectorAll('[data-tab]').forEach(t => t.setAttribute('aria-selected', String(t === b)));
            calcEl.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== b.dataset.tab; });
            placeCalc(...(calcPos || [calcEl.offsetLeft, calcEl.offsetTop]));
        }
    });
    // "Đang dùng máy tính" = lần chạm gần nhất nằm trong máy tính -> phím số / phép tính vào máy tính, không chọn đáp án
    document.addEventListener('pointerdown', (e) => { calcHot = !!(e.target.closest && e.target.closest('#qt-calc')); syncHot(); }, true);
    window.addEventListener('keydown', (e) => {
        if (!calcHot || calcEl.hidden || calcEl.classList.contains('is-mini') || e.ctrlKey || e.metaKey || e.altKey || typing()) return;
        if (calcEl.querySelector('[data-pane="calc"]').hidden) return;
        const map = { '*': '×', 'x': '×', '/': '÷', '-': '−', ',': '.', 'Enter': '=', '=': '=', 'Backspace': 'back', 'Delete': 'AC' };
        const k = map[e.key] || (/^[\d.+()^%]$/.test(e.key) ? e.key : '');
        if (e.key === 'Escape') { calcHot = false; syncHot(); return; }
        if (!k) return;
        e.preventDefault(); e.stopImmediatePropagation();
        calcPress(k);
    }, true);
    ['input', 'change'].forEach(t => calcEl.querySelector('.qt-med').addEventListener(t, onMedInput));
    renderCalc();
}
function syncHot() { if (calcEl) calcEl.classList.toggle('is-hot', calcHot && !calcEl.hidden); }

/* ---------------------------------------------------------------- Công thức y khoa */
// Ô cùng tên dùng chung giữa các công thức (gõ cân nặng ở BMI là Cockcroft–Gault cũng có). Đơn vị SI như xét nghiệm trong nước.
const MED = [
    { n: 'BMI', s: 'cân nặng ÷ (chiều cao m)²', i: ['kg', 'cm'],
        r: (v) => { const b = v.kg / (v.cm / 100) ** 2; return `${fx(b, 1)} kg/m² · ${b < 18.5 ? 'gầy' : b < 23 ? 'bình thường' : b < 25 ? 'thừa cân' : b < 30 ? 'béo phì độ I' : 'béo phì độ II'}`; },
        note: 'Phân loại IDI & WPRO cho người châu Á' },
    { n: 'Diện tích da (Mosteller)', s: '√(chiều cao cm × cân nặng kg ÷ 3600)', i: ['kg', 'cm'], r: (v) => `${fx(Math.sqrt(v.cm * v.kg / 3600), 2)} m²` },
    { n: 'Độ thanh thải creatinin (Cockcroft–Gault)', s: '(140 − tuổi) × kg ÷ (0,815 × Cr) · nữ × 0,85', i: ['age', 'kg', 'cr', 'nu'],
        r: (v) => `${fx((140 - v.age) * v.kg / (0.815 * v.cr) * (v.nu ? 0.85 : 1), 0)} mL/phút` },
    { n: 'Huyết áp trung bình', s: '(HA tâm thu + 2 × HA tâm trương) ÷ 3', i: ['sys', 'dia'], r: (v) => `${fx((v.sys + 2 * v.dia) / 3, 0)} mmHg` },
    { n: 'Khoảng trống anion', s: 'Na − (Cl + HCO₃) · hiệu chỉnh: + 0,25 × (40 − albumin)', i: ['na', 'cl', 'hco3', 'albo'],
        r: (v) => { const ag = v.na - v.cl - v.hco3; return `${fx(ag, 1)} mmol/L` + (v.albo ? ` · hiệu chỉnh ${fx(ag + 0.25 * (40 - v.albo), 1)}` : ''); } },
    { n: 'Canxi hiệu chỉnh theo albumin', s: 'Ca + 0,02 × (40 − albumin g/L)', i: ['ca', 'alb'], r: (v) => `${fx(v.ca + 0.02 * (40 - v.alb), 2)} mmol/L` },
    { n: 'Áp lực thẩm thấu máu', s: '2 × Na + glucose + urê', i: ['na', 'glu', 'ure'], r: (v) => `${fx(2 * v.na + v.glu + v.ure, 0)} mOsm/kg` },
];
// [nhãn, đơn vị]  (albo = albumin không bắt buộc; dùng chung giá trị với alb)
const FIELDS = {
    kg: ['Cân nặng', 'kg'], cm: ['Chiều cao', 'cm'], age: ['Tuổi', 'năm'], cr: ['Creatinin', 'µmol/L'], nu: ['Nữ', ''],
    sys: ['HA tâm thu', 'mmHg'], dia: ['HA tâm trương', 'mmHg'], na: ['Na⁺', 'mmol/L'], cl: ['Cl⁻', 'mmol/L'], hco3: ['HCO₃⁻', 'mmol/L'],
    alb: ['Albumin', 'g/L'], albo: ['Albumin (nếu có)', 'g/L'], ca: ['Ca toàn phần', 'mmol/L'], glu: ['Glucose', 'mmol/L'], ure: ['Urê', 'mmol/L'],
};
const fx = (v, d) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');
const fieldKey = (k) => (k === 'albo' ? 'alb' : k);
const medVals = {};

function medHtml() {
    return MED.map((f, idx) => `
        <details class="qt-f" data-f="${idx}">
            <summary><span>${f.n}</span><output class="qt-f-out"></output></summary>
            <p class="qt-f-s">${f.s}</p>
            <div class="qt-f-in">${f.i.map(k => k === 'nu'
                ? `<label class="qt-f-chk"><input type="checkbox" data-k="nu"><span>Nữ</span></label>`
                : `<label><span>${FIELDS[k][0]}</span><span class="qt-in"><input type="text" inputmode="decimal" autocomplete="off" size="4" data-k="${fieldKey(k)}" aria-label="${FIELDS[k][0]}"><em>${FIELDS[k][1]}</em></span></label>`).join('')}</div>
            ${f.note ? `<p class="qt-f-note">${f.note}</p>` : ''}
        </details>`).join('');
}
function onMedInput(e) {
    const inp = e.target, k = inp.dataset.k;
    if (!k) return;
    medVals[k] = inp.type === 'checkbox' ? inp.checked : inp.value;
    calcEl.querySelectorAll(`.qt-med [data-k="${k}"]`).forEach(o => { if (o === inp) return; if (o.type === 'checkbox') o.checked = !!medVals[k]; else o.value = medVals[k]; });
    MED.forEach((f, idx) => {
        const v = {}; let ok = true;
        f.i.forEach(key => {
            const fk = fieldKey(key), raw = medVals[fk];
            if (key === 'nu') { v.nu = !!raw; return; }
            const n = parseFloat(String(raw ?? '').replace(',', '.'));
            if (key === 'albo') { v.albo = Number.isFinite(n) && n > 0 ? n : 0; return; }
            if (!Number.isFinite(n) || n <= 0) ok = false;
            v[key] = n;
        });
        calcEl.querySelector(`.qt-f[data-f="${idx}"] .qt-f-out`).textContent = ok ? f.r(v) : '';
    });
}

/* ================================================================ KHỞI TẠO */
export function setupQuizTools() {
    if (dock) return;
    buildDock();
    setupGrip();
    setupScratch();
    setupCalc();
    setupCalcDrag();

    document.addEventListener('click', (e) => {
        const t = e.target.closest && e.target.closest('#scratch-btn, #calc-btn, .qt-panel .qt-x');
        if (!t) return;
        if (t.classList.contains('qt-x')) setOpen(t.dataset.tool, false);
        else toggle(t.id === 'scratch-btn' ? 'scratch' : 'calc');
    });
    let scratchHot = false;
    document.addEventListener('pointerdown', (e) => { scratchHot = !!(e.target.closest && e.target.closest('#qt-scratch')); }, true);
    window.addEventListener('keydown', (e) => {
        if (!scratchHot || scratchEl.hidden || typing() || !(e.ctrlKey || e.metaKey) || e.altKey) return;
        const k = e.key.toLowerCase();
        if (k !== 'z' && k !== 'y') return;
        e.preventDefault(); e.stopImmediatePropagation();
        if (k === 'y' || e.shiftKey) redo(); else undo();
    }, true);
    // Phím W = giấy nháp, L = máy tính (A–H chọn đáp án, các chữ khác đã có việc ở quiz-boost.js)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing || e.repeat || typing() || !inQuiz()) return;
        if (document.body.classList.contains('quiz-paused') || document.querySelector('#kbd-sheet:not(.hidden), .zt-confirm-overlay, #notes-all.is-open')) return;
        const k = e.key.length === 1 ? e.key.toLowerCase() : '';
        if (k === 'w') toggle('scratch');
        else if (k === 'l') toggle('calc');
        else return;
        e.preventDefault();
    });

    let restored = false;
    const run = () => {
        raf = 0;
        if (!restored && inQuiz()) {   // F5 giữa bài: mở lại đúng các công cụ đang mở
            restored = true;
            try { JSON.parse(ss.get('quiz_tools_open') || '[]').forEach(t => { if (TOOLS.includes(t)) openSet.add(t); }); } catch (e) { }
            if (openSet.size) { layout(); fitSheet(); if (openSet.has('calc')) showCalcAt(); }
        }
        syncLaunchers();
        syncScratchPage();
        syncHot();
    };
    let raf = 0;
    const queue = () => { if (!raf) raf = requestAnimationFrame(run); };
    const quiz = $('quizSection');
    if (quiz) new MutationObserver(queue).observe(quiz, { childList: true, subtree: true });
    new MutationObserver(queue).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    const nav = $('quiz-mobile-nav');
    if (nav) new MutationObserver(() => { if (openSet.size) layout(); }).observe(nav, { attributes: true, attributeFilter: ['class'] });
    readSafe();
    const reflow = () => {
        if (!openSet.size) return;
        readSafe(); layout(); fitSheet();
        if (openSet.has('calc')) placeCalc(...(calcPos || [calcEl.offsetLeft, calcEl.offsetTop]));
    };
    window.addEventListener('resize', reflow);
    window.addEventListener('orientationchange', () => setTimeout(reflow, 250));   // iOS: kích thước mới có sau khi xoay xong
    // Bàn phím ảo bật (gõ ô Công thức) làm vùng nhìn thấy co lại: đẩy máy tính lên cho khỏi bị che; tắt thì về chỗ cũ
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { if (openSet.has('calc')) placeCalc(...(calcPos || [calcEl.offsetLeft, calcEl.offsetTop])); });
    queue();
}
