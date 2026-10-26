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
                <button type="button" class="qt-ib" data-act="export" title="Lưu trang nháp thành ảnh (iPad: chia sẻ / lưu vào Ảnh)" aria-label="Lưu trang nháp thành ảnh"><i class="fas fa-image"></i></button>
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
                <button type="button" class="qt-tool" data-pen="pen" title="Bút (chạm lần nữa: kiểu bút)" aria-label="Bút"><i class="fas fa-pencil"></i></button>
                <button type="button" class="qt-tool" data-pen="hl" title="Bút dạ quang (chạm lần nữa: kẻ thẳng)" aria-label="Bút dạ quang"><i class="fas fa-marker"></i></button>
                <button type="button" class="qt-tool" data-pen="erase" title="Tẩy (chạm lần nữa: tẩy cả nét / từng phần)" aria-label="Tẩy"><i class="fas fa-eraser"></i></button>
                <button type="button" class="qt-tool" data-pen="lasso" title="Khoanh chọn: dời, phóng to / thu nhỏ, đổi màu, nhân bản, xóa" aria-label="Khoanh chọn"><svg class="qt-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5c4.7 0 8 2.3 8 5.2s-3.3 5.2-8 5.2c-1.3 0-2.5-.2-3.6-.5" stroke-dasharray="2.6 2.4"/><path d="M8.4 14.4C5.6 13.5 4 11.7 4 9.7 4 6.8 7.3 4.5 12 4.5" stroke-dasharray="2.6 2.4"/><path d="M8.4 14.4c-.9 1.6-.4 3.2 1 3.9.9.5 1 1.6.2 2.6"/></svg></button>
                <button type="button" class="qt-tool" data-pen="shape" title="Vẽ hình: tự nắn tròn, vuông, tam giác, đường thẳng" aria-label="Vẽ hình"><svg class="qt-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="8.5" cy="8.5" r="4.5"/><path d="M15.5 11.5l5 8.5h-10z"/></svg></button>
                <button type="button" class="qt-tool" data-pen="text" title="Gõ chữ: chạm vào giấy để gõ" aria-label="Gõ chữ"><i class="fas fa-font"></i></button>
                <button type="button" class="qt-tool" data-pen="laser" title="Bút chỉ (laser): sáng lên rồi tự mờ, không lưu" aria-label="Bút chỉ laser"><i class="fas fa-wand-magic-sparkles"></i></button>
            </div>
            <div class="qt-swatches">
                <button type="button" class="qt-dot" data-color="ink" title="Mực đậm" aria-label="Mực đậm"></button>
                <button type="button" class="qt-dot" data-color="red" title="Đỏ" aria-label="Đỏ"></button>
                <button type="button" class="qt-dot" data-color="blue" title="Xanh dương" aria-label="Xanh dương"></button>
                <button type="button" class="qt-dot" data-color="green" title="Xanh lá" aria-label="Xanh lá"></button>
                <span class="qt-recent"></span>
                <label class="qt-dot qt-dot-add" title="Màu khác"><input type="color" aria-label="Chọn màu khác" value="#8E6CD8"><i class="fas fa-plus" aria-hidden="true"></i></label>
            </div>
            <div class="qt-sizes" role="group" aria-label="Cỡ nét">
                <button type="button" class="qt-sz" data-size="0" title="Nét mảnh" aria-label="Nét mảnh"><span></span></button>
                <button type="button" class="qt-sz" data-size="1" title="Nét vừa" aria-label="Nét vừa"><span></span></button>
                <button type="button" class="qt-sz" data-size="2" title="Nét đậm" aria-label="Nét đậm"><span></span></button>
            </div>
        </div>
        <div class="qt-opts" hidden></div>
        <div class="qt-sheet">
            <p class="qt-empty" aria-hidden="true"><i class="fas fa-pencil"></i> Viết, vẽ nháp cho câu này<small>Chụm / kéo 2 ngón: thu phóng, dời trang · chạm 2 ngón: hoàn tác</small></p>
            <canvas class="qt-paper"></canvas><canvas class="qt-ink"></canvas><canvas class="qt-live"></canvas>
            <div class="qt-selmenu" hidden role="toolbar" aria-label="Phần đã khoanh">
                <button type="button" data-sel="color" title="Đổi sang màu đang chọn"><span class="qt-selc" aria-hidden="true"></span>Tô màu</button>
                <button type="button" data-sel="dup" title="Nhân bản"><i class="fas fa-clone"></i>Nhân bản</button>
                <button type="button" data-sel="del" class="qt-sel-del" title="Xóa phần đã khoanh"><i class="fas fa-trash-can"></i>Xóa</button>
            </div>
            <button type="button" class="qt-zoom" hidden title="Về cỡ 100%"><i class="fas fa-magnifying-glass"></i><span>100%</span></button>
        </div>
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
// Mỗi câu một trang nháp (về lại câu cũ là thấy nét cũ). Nét lưu dạng véc-tơ [x, y, lực, ...] theo px CSS của TRANG -> đổi cỡ ngăn /
// đổi sáng-tối / thu phóng thì vẽ lại sắc nét. Lưu sessionStorage theo lượt làm bài (quizStartTime): F5 còn, làm lượt mới thì trang trắng.
// Bộ công cụ kiểu GoodNotes (2026-10-27):
// - Bút (bút máy / bút bi / bút lông) · dạ quang (tự do / kẻ thẳng) · tẩy (cả nét / từng phần / chỉ dạ quang) · khoanh chọn · vẽ hình ·
//   gõ chữ · bút chỉ laser. Chạm lại công cụ đang cầm = hàng tùy chọn của nó (.qt-opts).
// - Vẽ xong GIỮ YÊN bút ~0,5 s = nắn thành hình (đường thẳng, tròn / elip, tam giác, chữ nhật, đa giác); công cụ Hình thì tự nắn mỗi nét.
// - Khoanh chọn: kéo trong khung = dời, kéo chấm góc = phóng to / thu nhỏ, chạm màu = đổi màu, Nhân bản, Xóa (phím Delete).
// - Trang vô tận: chụm / kéo 2 ngón = thu phóng / dời trang (chuột: Ctrl + lăn = thu phóng, lăn = dời); chạm nhanh 2 ngón = hoàn tác, 3 ngón = làm lại.
// - Màu tự chọn (nhớ 3 màu gần nhất) · giấy kẻ ô / kẻ dòng / chấm bi / trơn (vẽ trên canvas nên thu phóng theo) · lưu trang thành ảnh.
const SIZES = { pen: [1.3, 2.3, 3.8], hl: [10, 16, 24] };
const TEXT_SIZES = [16, 22, 30];
const PEN_VAR = { ink: '--ink', red: '--bad-solid', blue: '--pick-solid', green: '--ok-solid' };
const HL_VAR = { ink: '--hue-butter', red: '--hue-blossom', blue: '--hue-sky', green: '--hue-mint' };
const PAPERS = ['grid', 'lines', 'dots', 'plain'];
const PAPER_UI = { grid: ['fa-table-cells', 'Giấy kẻ ô'], lines: ['fa-bars', 'Giấy kẻ dòng'], dots: ['fa-ellipsis-vertical', 'Giấy chấm bi'], plain: ['fa-square', 'Giấy trơn'] };
// Bề rộng nét = w × (a + b × lực): bút máy đậm nhạt rõ, bút bi gần như đều, bút lông nhạy lực nhất
const PEN_KINDS = { fountain: [0.45, 1.1], ball: [0.85, 0.3], brush: [0.2, 1.8] };
const TOOLS_PEN = ['pen', 'hl', 'erase', 'lasso', 'shape', 'text', 'laser'];
const ZMIN = 0.4, ZMAX = 5;
const HEX = /^#[0-9a-f]{6}$/i;
let prefs = { pen: 'pen', color: 'ink', size: 1, paper: 'grid', kind: 'fountain', hlLine: 0, erase: 'stroke', eraseHl: false, recent: [], seen: {} };
try { Object.assign(prefs, JSON.parse(ls.get('quiz_scratch_prefs') || '{}')); } catch (e) { }
if (!TOOLS_PEN.includes(prefs.pen)) prefs.pen = 'pen';
if (!PAPERS.includes(prefs.paper)) prefs.paper = 'grid';
if (!PEN_KINDS[prefs.kind]) prefs.kind = 'fountain';
prefs.recent = (Array.isArray(prefs.recent) ? prefs.recent : []).filter(c => HEX.test(c)).slice(0, 3);
if (!prefs.seen || typeof prefs.seen !== 'object') prefs.seen = {};
let pal = {};
let pages = {}, pagesStamp = null, pageKey = null;
let sheet, paper, ink, live, pctx, ictx, lctx, dpr = 1, sheetW = 0, sheetH = 0;
let selMenu, zoomChip, optsEl, optsOpen = false;
let cur = null;          // nét đang vẽ { st, id, rect, ps, x0, y0, snap, shape, line }
let erasing = null;      // { id, rect, before }
let lasso = null;        // vòng khoanh đang vẽ { id, rect, p: [x, y, ...] }
let sel = null;          // phần đã khoanh { idx: [chỉ số nét], box }
let drag = null;         // đang dời / co giãn phần đã khoanh { id, rect, mode, x0, y0, before, box0, moved }
let tap = null;          // chạm bằng công cụ Chữ { id, x0, y0, x, y }
let textEd = null;       // ô gõ chữ đang mở { ta, x, y, idx, f, c }
let laz = null, lazN = 0, laser = [], laserRaf = 0;
const busy = () => !!(cur || erasing || lasso || drag || tap || laz);

const stamp = () => (state.quizStartTime ? new Date(state.quizStartTime).getTime() || 0 : 0);
const storeKey = () => 'quizScratch_' + quizId();
const page = () => (pages[pageKey] || (pages[pageKey] = { s: [], undo: [], redo: [], v: { s: 1, x: 0, y: 0 } }));
const NO_VIEW = { s: 1, x: 0, y: 0 };
const view = () => (pageKey === null ? NO_VIEW : page().v);
let penSeen = ls.get('quiz_scratch_pen') === '1';
const fingerOn = () => { const v = ls.get('quiz_scratch_finger'); return v === null || v === '' ? !penSeen : v === '1'; };

// Màu CSS (kể cả color-mix / var) -> chuỗi màu canvas hiểu được; canvas không nhận thì dùng màu dự phòng
let probe = null, probeCtx = null;
function cssColor(expr, fb) {
    if (!probe) {
        probe = document.createElement('i');
        probe.setAttribute('aria-hidden', 'true');
        probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none';
        document.body.appendChild(probe);
        probeCtx = document.createElement('canvas').getContext('2d');
    }
    probe.style.color = '';
    probe.style.color = expr;
    const c = getComputedStyle(probe).color;
    probeCtx.fillStyle = '#010203'; probeCtx.fillStyle = c;
    return probeCtx.fillStyle === '#010203' ? fb : c;
}
function readPalette() {
    const cs = getComputedStyle(document.documentElement);
    pal = { pen: {}, hl: {} };
    for (const k in PEN_VAR) { pal.pen[k] = cs.getPropertyValue(PEN_VAR[k]).trim() || '#5A4640'; pal.hl[k] = cs.getPropertyValue(HL_VAR[k]).trim() || '#F2BE2E'; }
    if (!document.body) return;
    pal.paper = cssColor('var(--paper)', '#FFFCF8');
    pal.rule = cssColor('var(--rule)', 'rgba(126, 192, 238, .24)');
    pal.dot = cssColor('var(--dot)', 'rgba(236, 160, 165, .34)');
    pal.margin = cssColor('color-mix(in srgb, var(--hue-blossom) 55%, transparent)', 'rgba(255, 143, 184, .55)');
    pal.lasso = cssColor('var(--ink-lav)', '#7C5CC4');
    pal.lassoFill = cssColor('color-mix(in srgb, var(--hue-lav) 10%, transparent)', 'rgba(185, 162, 240, .1)');
}
const colorOf = (st) => (st.t === 'hl' ? pal.hl : pal.pen)[st.c] || (HEX.test(st.c || '') ? st.c : pal.pen.ink);

function ensurePages() {
    const t = stamp();
    if (t === pagesStamp) return;
    pagesStamp = t; pages = {}; pageKey = null;
    try {
        const o = JSON.parse(ss.get(storeKey()) || 'null');
        if (o && o.t === t && o.p) for (const k in o.p) pages[k] = { s: o.p[k], undo: [], redo: [], v: { s: 1, x: 0, y: 0 } };
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
    [paper, ink, live].forEach(c => { c.width = Math.round(w * d); c.height = Math.round(h * d); });
    [pctx, ictx, lctx].forEach(c => { c.lineCap = 'round'; c.lineJoin = 'round'; });
    redraw();
}
// Canvas mực + lớp tạm vẽ theo tọa độ TRANG (thu phóng / dời = đổi ma trận); giấy kẻ vẽ theo px màn hình cho nét kẻ luôn mảnh
function applyView() {
    const v = view();
    [ictx, lctx].forEach(c => c.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * v.x, dpr * v.y));
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function clearCtx(c) { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, c.canvas.width, c.canvas.height); c.restore(); }
const toPage = (cx, cy, r) => { const v = view(); return [(cx - r.left - v.x) / v.s, (cy - r.top - v.y) / v.s]; };

function setStyle(ctx, st) {
    const col = colorOf(st);
    ctx.strokeStyle = col; ctx.fillStyle = col;
}
// Bề rộng tại điểm k: bút đậm nhạt theo lực nhấn (lực đã làm mượt lúc ghi) và kiểu bút, dạ quang đều nét.
// Ba điểm đầu vuốt nhọn nhẹ như mực thật đặt xuống giấy (bút bi thì không).
const TAPER = [0.62, 0.8, 0.92];
const widthAt = (st, k) => {
    if (st.t === 'hl') return st.w;
    const K = PEN_KINDS[st.k] || PEN_KINDS.fountain;
    return st.w * (K[0] + K[1] * st.p[k * 3 + 2]) * (k < 3 && st.k !== 'ball' ? TAPER[k] : 1);
};
// Lực (0–1) cho điểm sắp thêm vào nét st — dùng chung giấy nháp + vẽ lên hình (quiz-ink.js); c = trạng thái nét đang vẽ.
// - Bút: cong lực p^0,65 (viết nhẹ tay vẫn rõ nét, đè mạnh mới đậm hẳn), làm mượt, mỗi điểm đổi tối đa 0,12 -> đậm nhạt chuyển êm, không giật cục.
// - Apple Pencil hay báo lực 0 ở lúc chạm xuống -> điểm đầu chờ lực thật của điểm kế rồi điền ngược (hết chấm đậm ở đầu nét).
// - Chuột / ngón tay không có lực: giả lực theo tốc độ như mực bút máy — đi chậm đậm, lướt nhanh mảnh.
function inkPressure(c, ev, x, y, st) {
    const n = st.p.length / 3, now = ev.timeStamp || performance.now();
    let raw;
    if (ev.pointerType === 'pen') {
        if (ev.pressure > 0) raw = Math.pow(Math.min(1, ev.pressure), 0.65);
        else if (!n) { c.pend = true; c.lt = now; return 0.5; }
        else raw = c.lastRaw === undefined ? 0.5 : c.lastRaw;
        c.lastRaw = raw;
    } else if (!n) raw = 0.62;
    else {
        const dt = Math.max(1, now - (c.lt || now - 16)), v = Math.hypot(x - st.p[n * 3 - 3], y - st.p[n * 3 - 2]) / dt;   // px / ms
        raw = clamp(0.78 - v * 0.22, 0.3, 0.78);
    }
    c.lt = now;
    let ps = raw;
    if (n) {
        if (c.pend) { c.pend = false; st.p[2] = Math.round(raw * 100) / 100; c.ps = raw; }
        ps = c.ps + clamp(c.ps * 0.55 + raw * 0.45 - c.ps, -0.12, 0.12);
    }
    c.ps = ps;
    return Math.round(ps * 100) / 100;
}
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
// Chữ gõ: { t: 'tx', x, y (góc trên trái), s: nội dung, c: màu, f: cỡ chữ }
const FONT = (f) => `600 ${f}px "Patrick Hand", Quicksand, system-ui, sans-serif`;
const LH = 1.25;
const boxCache = new WeakMap();
function textBox(st) {
    let b = boxCache.get(st);
    if (b) return b;
    const c = probeCtx || document.createElement('canvas').getContext('2d');
    c.save(); c.font = FONT(st.f);
    const lines = st.s.split('\n');
    const w = Math.max(4, ...lines.map(l => c.measureText(l).width));
    c.restore();
    b = { x: st.x, y: st.y, w, h: lines.length * st.f * LH };
    boxCache.set(st, b);
    return b;
}
function drawText(ctx, st) {
    ctx.save();
    ctx.font = FONT(st.f); ctx.textBaseline = 'top'; ctx.fillStyle = colorOf(st);
    st.s.split('\n').forEach((l, i) => ctx.fillText(l, st.x, st.y + i * st.f * LH + st.f * 0.1));
    ctx.restore();
}
// Vẽ lại cả nét (lật câu, hoàn tác, đổi cỡ ngăn): các đoạn cùng bề rộng (làm tròn 0,25px) đi chung một path ->
// trang nhiều nét trên iPad / điện thoại vẽ lại nhanh hơn nhiều so với stroke() từng đoạn. Khi đang viết vẫn vẽ từng đoạn (penSeg).
function drawStroke(ctx, st) {
    if (st.t === 'tx') { drawText(ctx, st); return; }
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
export { SIZES, readPalette, drawStroke, penSeg, penTail, hlPath, setStyle, inkPressure };

// dạ quang nằm dưới mực, chữ gõ nằm trên cùng
function drawAll(ctx, s, skip = -1) {
    s.forEach((st, i) => { if (i !== skip && st.t === 'hl') drawStroke(ctx, st); });
    s.forEach((st, i) => { if (i !== skip && st.t === 'pen') drawStroke(ctx, st); });
    s.forEach((st, i) => { if (i !== skip && st.t === 'tx') drawStroke(ctx, st); });
}
// Giấy kẻ theo khung nhìn v (đơn vị = px của ctx): ô 22 · dòng 28 · chấm 20, cộng vạch lề hồng như vở
function drawPaper(ctx, v, w, h, kind = prefs.paper) {
    const xs = [], ys = [];
    const rules = (G, off, max, out) => { const g = G * v.s; for (let q = ((off % g) + g) % g; q <= max + 1; q += g) out.push(q); };
    ctx.save();
    if (kind === 'grid') { rules(22, v.x, w, xs); rules(22, v.y, h, ys); }
    else if (kind === 'lines') rules(28, v.y + 27 * v.s, h, ys);   // như vở cũ: vạch ở đáy mỗi dòng cao 28px
    if (xs.length || ys.length) {
        ctx.strokeStyle = pal.rule; ctx.lineWidth = 1; ctx.beginPath();
        xs.forEach(x => { const X = Math.round(x) + 0.5; ctx.moveTo(X, 0); ctx.lineTo(X, h); });
        ys.forEach(y => { const Y = Math.round(y) + 0.5; ctx.moveTo(0, Y); ctx.lineTo(w, Y); });
        ctx.stroke();
    }
    if (kind === 'dots') {
        const G = 20 * v.s, r = clamp(1.25 * v.s, 0.8, 2.2);
        ctx.fillStyle = pal.dot; ctx.beginPath();
        for (let x = ((v.x % G) + G) % G; x <= w; x += G) for (let y = ((v.y % G) + G) % G; y <= h; y += G) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
        ctx.fill();
    }
    const mx = 34 * v.s + v.x;
    if (mx > -2 && mx < w + 2) { ctx.strokeStyle = pal.margin; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(mx, 0); ctx.lineTo(mx, h); ctx.stroke(); }
    ctx.restore();
}

function redraw() {
    if (!ictx) return;
    applyView();
    clearCtx(ictx); clearCtx(pctx);
    drawPaper(pctx, view(), sheetW, sheetH);
    drawAll(ictx, pageKey === null ? [] : page().s, textEd ? textEd.idx : -1);
    clearLive();
    syncZoom();
}
// Lớp tạm: xóa rồi vẽ lại khung phần đang khoanh (nếu có) — mọi thứ tạm khác (chấm xem trước, vòng tẩy, laser…) vẽ chồng lên sau
function clearLive() {
    clearCtx(lctx);
    if (sel) drawSel();
}
function syncZoom() {
    if (!zoomChip) return;
    const v = view(), z = Math.abs(v.s - 1) > 0.01 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1;
    zoomChip.hidden = !z;
    zoomChip.lastElementChild.textContent = Math.round(v.s * 100) + '%';
}
function resetView() { const v = view(); v.s = 1; v.x = 0; v.y = 0; redraw(); placeSelMenu(); }

function commit(next) {
    const pg = page();
    pg.undo.push(pg.s); if (pg.undo.length > 60) pg.undo.shift();
    pg.redo = []; pg.s = next;
    saveSoon(); syncScratchBar();
}

function undo() {
    const pg = pageKey === null ? null : page();
    if (!pg || !pg.undo.length) return false;
    finishText(); clearSel();
    pg.redo.push(pg.s); pg.s = pg.undo.pop(); redraw(); saveSoon(); syncScratchBar();
    return true;
}
function redo() {
    const pg = pageKey === null ? null : page();
    if (!pg || !pg.redo.length) return false;
    finishText(); clearSel();
    pg.undo.push(pg.s); pg.s = pg.redo.pop(); redraw(); saveSoon(); syncScratchBar();
    return true;
}

const eraseR = () => (9 + prefs.size * 4) / view().s;   // vòng tẩy giữ nguyên cỡ trên MÀN HÌNH dù đang thu phóng
// Chấm xem trước khi bút lơ lửng trên giấy (Apple Pencil hover trên iPad Pro, bút Surface) hoặc rê chuột: thấy trước màu + cỡ nét
function hoverDot(x, y) {
    clearLive();
    if (!['pen', 'hl', 'erase', 'shape'].includes(prefs.pen)) return;
    lctx.save();
    if (prefs.pen === 'erase') {
        lctx.globalAlpha = 0.55; lctx.lineWidth = 1.5 / view().s; lctx.strokeStyle = pal.pen.ink;
        lctx.beginPath(); lctx.arc(x, y, eraseR(), 0, Math.PI * 2); lctx.stroke();
    } else {
        const hl = prefs.pen === 'hl';
        lctx.globalAlpha = hl ? 0.45 : 0.7;
        lctx.fillStyle = colorOf({ t: hl ? 'hl' : 'pen', c: prefs.color });
        lctx.beginPath(); lctx.arc(x, y, Math.max(1.6, SIZES[hl ? 'hl' : 'pen'][prefs.size] / 2), 0, Math.PI * 2); lctx.fill();
    }
    lctx.restore();
}

function addPoint(ev) {
    const st = cur.st;
    let [x, y] = toPage(ev.clientX, ev.clientY, cur.rect);
    x = Math.round(x * 10) / 10; y = Math.round(y * 10) / 10;
    const n = st.p.length / 3;
    if (n && Math.abs(st.p[n * 3 - 3] - x) < 0.6 && Math.abs(st.p[n * 3 - 2] - y) < 0.6) return false;   // bút 240Hz: bỏ điểm sát nhau (nét y hệt, lưu & vẽ lại nhẹ hơn)
    const pr = inkPressure(cur, ev, x, y, st);
    st.p.push(x, y, pr);
    return true;
}

/* ---------------------------------------------------------------- Tẩy */
function hitStroke(st, x, y, R) {
    const p = st.p, rr = R + st.w / 2;
    for (let k = 0; k < p.length; k += 3) {
        const ax = p[k], ay = p[k + 1], bx = k + 3 < p.length ? p[k + 3] : ax, by = k + 3 < p.length ? p[k + 4] : ay;
        const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
        const t = L ? clamp(((x - ax) * dx + (y - ay) * dy) / L, 0, 1) : 0;
        const ex = ax + t * dx - x, ey = ay + t * dy - y;
        if (ex * ex + ey * ey <= rr * rr) return true;
    }
    return false;
}
// Tẩy từng phần: bỏ các điểm nằm trong vòng tẩy, phần còn lại tách thành các nét riêng. null = không chạm nét này
function splitStroke(st, x, y, R) {
    const p = st.p, rr = (R + st.w / 2) ** 2, runs = [];
    let run = [], hit = false;
    for (let k = 0; k < p.length; k += 3) {
        const dx = p[k] - x, dy = p[k + 1] - y;
        if (dx * dx + dy * dy <= rr) { hit = true; if (run.length) runs.push(run); run = []; }
        else run.push(p[k], p[k + 1], p[k + 2]);
    }
    if (!hit) return null;
    if (run.length) runs.push(run);
    return runs.filter(r => r.length >= 6).map(r => ({ ...st, p: r }));
}
function inTextBox(st, x, y, R = 0) { const b = textBox(st); return x >= b.x - R && x <= b.x + b.w + R && y >= b.y - R && y <= b.y + b.h + R; }
function eraseAt(x, y) {
    const pg = page(), R = eraseR(), out = [];
    let changed = false;
    for (const st of pg.s) {
        if (prefs.eraseHl && st.t !== 'hl') { out.push(st); continue; }
        if (st.t === 'tx') { if (inTextBox(st, x, y, R)) changed = true; else out.push(st); continue; }
        if (prefs.erase === 'part') {
            const parts = splitStroke(st, x, y, R);
            if (parts) { changed = true; out.push(...parts); } else out.push(st);
            continue;
        }
        if (hitStroke(st, x, y, R)) changed = true; else out.push(st);
    }
    if (changed) { pg.s = out; redraw(); }
    clearLive();
    lctx.save(); lctx.globalAlpha = 0.5; lctx.lineWidth = 1.5 / view().s; lctx.strokeStyle = pal.pen.ink;
    lctx.beginPath(); lctx.arc(x, y, R, 0, Math.PI * 2); lctx.stroke(); lctx.restore();
}

/* ---------------------------------------------------------------- Nắn hình */
// Đường gấp khúc -> điểm dày đều ~3px (lực 0,5): vẽ bằng đúng bộ vẽ nét thường, tẩy từng phần vẫn ăn
function densify(verts, step = 3) {
    const out = [];
    for (let i = 0; i < verts.length - 1; i++) {
        const [ax, ay] = verts[i], [bx, by] = verts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
        for (let j = 0; j < n; j++) out.push(Math.round((ax + (bx - ax) * j / n) * 10) / 10, Math.round((ay + (by - ay) * j / n) * 10) / 10, 0.5);
    }
    const [lx, ly] = verts[verts.length - 1];
    out.push(Math.round(lx * 10) / 10, Math.round(ly * 10) / 10, 0.5);
    return out;
}
function ellipsePts(cx, cy, rx, ry) {
    const n = Math.max(48, Math.ceil(Math.PI * (rx + ry) / 3)), v = [];
    for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + i / n * Math.PI * 2; v.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
    return densify(v, 4);
}
// Ramer–Douglas–Peucker: giữ các đỉnh "góc" của đường vẽ tay
function rdp(pts, eps) {
    if (pts.length < 3) return pts.slice();
    const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1], L = Math.hypot(bx - ax, by - ay) || 1;
    let far = 0, fd = -1;
    for (let i = 1; i < pts.length - 1; i++) {
        const d = Math.abs((by - ay) * pts[i][0] - (bx - ax) * pts[i][1] + bx * ay - by * ax) / L;
        if (d > fd) { fd = d; far = i; }
    }
    if (fd <= eps) return [pts[0], pts[pts.length - 1]];
    return [...rdp(pts.slice(0, far + 1), eps).slice(0, -1), ...rdp(pts.slice(far), eps)];
}
// Nét vẽ tay -> { p, line } của hình đã nắn; null = không giống hình nào (giữ nguyên nét)
function recognize(p) {
    const pts = [];
    for (let k = 0; k < p.length; k += 3) pts.push([p[k], p[k + 1]]);
    if (pts.length < 3) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, len = 0;
    pts.forEach(([x, y], i) => {
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        if (i) len += Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]);
    });
    const w = x1 - x0, h = y1 - y0, diag = Math.hypot(w, h);
    if (diag < 14) return null;
    const [sx, sy] = pts[0], [ex, ey] = pts[pts.length - 1], gap = Math.hypot(ex - sx, ey - sy);
    if (gap > Math.max(22, len * 0.18)) {
        // nét hở: gần thẳng = đường thẳng, vài khúc gãy = đường gấp khúc (góc, mũi tên)
        if (gap / len > 0.92) return { p: densify([pts[0], pts[pts.length - 1]]), line: true };
        const v = rdp(pts, diag * 0.06);
        return v.length <= 5 ? { p: densify(v) } : null;
    }
    // nét khép kín: tròn / elip nếu bám sát elip ngoại tiếp khung
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = Math.max(w / 2, 1), ry = Math.max(h / 2, 1);
    let err = 0;
    pts.forEach(([x, y]) => { err += Math.abs(Math.hypot((x - cx) / rx, (y - cy) / ry) - 1); });
    err /= pts.length;
    if (err < 0.11) {
        if (Math.abs(rx - ry) / Math.max(rx, ry) < 0.16) { const r = (rx + ry) / 2; return { p: ellipsePts(cx, cy, r, r) }; }
        return { p: ellipsePts(cx, cy, rx, ry) };
    }
    // đa giác: tách tại điểm xa điểm đầu nhất rồi RDP hai nửa, bỏ đỉnh gần thẳng hàng (chỗ bắt đầu vẽ giữa cạnh)
    let far = 0, fd = 0;
    pts.forEach(([x, y], i) => { const d = Math.hypot(x - sx, y - sy); if (d > fd) { fd = d; far = i; } });
    const eps = diag * 0.07;
    let v = [...rdp(pts.slice(0, far + 1), eps).slice(0, -1), ...rdp([...pts.slice(far), pts[0]], eps).slice(0, -1)];
    for (let changed = true; changed && v.length > 3;) {
        changed = false;
        for (let i = 0; i < v.length; i++) {
            const a = v[(i + v.length - 1) % v.length], b = v[i], c = v[(i + 1) % v.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
            if (Math.abs((c[1] - a[1]) * b[0] - (c[0] - a[0]) * b[1] + c[0] * a[1] - c[1] * a[0]) / L < eps * 1.2) { v.splice(i, 1); changed = true; break; }
        }
    }
    if (v.length < 3 || v.length > 8) return err < 0.2 ? { p: ellipsePts(cx, cy, rx, ry) } : null;
    if (v.length === 4) {
        // gần vuông góc với trục -> chữ nhật thẳng thớm theo khung các đỉnh
        const axis = v.every((q, i) => { const n = v[(i + 1) % 4], a = Math.abs(Math.atan2(n[1] - q[1], n[0] - q[0])) % (Math.PI / 2); return a < 0.26 || a > Math.PI / 2 - 0.26; });
        if (axis) {
            const X0 = Math.min(...v.map(q => q[0])), X1 = Math.max(...v.map(q => q[0])), Y0 = Math.min(...v.map(q => q[1])), Y1 = Math.max(...v.map(q => q[1]));
            v = [[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]];
        }
    }
    return { p: densify([...v, v[0]]) };
}

/* ---------------------------------------------------------------- Khoanh chọn */
function strokeBox(st) {
    if (st.t === 'tx') return textBox(st);
    const p = st.p, r = st.w / 2;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let k = 0; k < p.length; k += 3) { x0 = Math.min(x0, p[k]); y0 = Math.min(y0, p[k + 1]); x1 = Math.max(x1, p[k]); y1 = Math.max(y1, p[k + 1]); }
    return { x: x0 - r, y: y0 - r, w: x1 - x0 + 2 * r, h: y1 - y0 + 2 * r };
}
function unionBox(list) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    list.forEach(st => { const b = strokeBox(st); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); });
    return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}
function inPoly(poly, x, y) {
    let inside = false;
    for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
        const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}
function mapStroke(st, fn, f = 1) {
    if (st.t === 'tx') { const [x, y] = fn(st.x, st.y); return { ...st, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, f: Math.round(st.f * f * 10) / 10 }; }
    const p = st.p.slice();
    for (let k = 0; k < p.length; k += 3) { const [x, y] = fn(p[k], p[k + 1]); p[k] = Math.round(x * 10) / 10; p[k + 1] = Math.round(y * 10) / 10; }
    return { ...st, p, w: Math.round(st.w * f * 100) / 100 };
}
function drawSel() {
    const v = view(), b = sel.box, pad = 6 / v.s;
    lctx.save();
    lctx.setLineDash([6 / v.s, 4 / v.s]); lctx.lineWidth = 1.5 / v.s; lctx.strokeStyle = pal.lasso; lctx.fillStyle = pal.lassoFill;
    lctx.beginPath(); lctx.rect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2); lctx.fill(); lctx.stroke();
    lctx.setLineDash([]); lctx.fillStyle = pal.paper; lctx.lineWidth = 2 / v.s;
    lctx.beginPath(); lctx.arc(b.x + b.w + pad, b.y + b.h + pad, 7 / v.s, 0, Math.PI * 2); lctx.fill(); lctx.stroke();
    lctx.restore();
}
function drawLasso() {
    clearLive();
    const p = lasso.p, v = view();
    lctx.save();
    lctx.setLineDash([5 / v.s, 4 / v.s]); lctx.lineWidth = 1.5 / v.s; lctx.strokeStyle = pal.lasso; lctx.fillStyle = pal.lassoFill;
    lctx.beginPath(); lctx.moveTo(p[0], p[1]);
    for (let k = 2; k < p.length; k += 2) lctx.lineTo(p[k], p[k + 1]);
    lctx.closePath(); lctx.fill(); lctx.stroke();
    lctx.restore();
}
function setSel(idx) {
    const s = page().s;
    sel = { idx, box: unionBox(idx.map(i => s[i])) };
    clearLive(); placeSelMenu();
}
function clearSel() {
    if (!sel) return;
    sel = null;
    if (selMenu) selMenu.hidden = true;
    if (lctx) clearLive();
}
function placeSelMenu() {
    if (!selMenu) return;
    if (!sel || drag) { selMenu.hidden = true; return; }
    const v = view(), b = sel.box;
    selMenu.hidden = false;
    selMenu.querySelector('.qt-selc').style.background = colorOf({ t: 'pen', c: prefs.color });
    const mw = selMenu.offsetWidth, mh = selMenu.offsetHeight;
    let top = (b.y - 6 / v.s) * v.s + v.y - mh - 10;
    if (top < 6) top = (b.y + b.h + 6 / v.s) * v.s + v.y + 14;
    selMenu.style.top = Math.round(clamp(top, 6, Math.max(6, sheetH - mh - 6))) + 'px';
    selMenu.style.left = Math.round(clamp((b.x + b.w / 2) * v.s + v.x - mw / 2, 6, Math.max(6, sheetW - mw - 6))) + 'px';
}
function startLasso(e, rect, x, y) {
    if (sel) {
        const b = sel.box, v = view(), pad = 6 / v.s;
        const onHandle = Math.hypot(x - (b.x + b.w + pad), y - (b.y + b.h + pad)) <= 20 / v.s;
        const inBox = x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;
        if (onHandle || inBox) {
            drag = { id: e.pointerId, rect, mode: onHandle ? 'scale' : 'move', x0: x, y0: y, before: page().s, box0: { ...b }, moved: false };
            selMenu.hidden = true;
            return;
        }
        clearSel();
    }
    lasso = { id: e.pointerId, rect, p: [x, y] };
}
function endLasso() {
    const poly = lasso.p;
    lasso = null;
    clearLive();
    if (poly.length < 8) return;
    const idx = [];
    page().s.forEach((st, i) => {
        if (st.t === 'tx') { const b = textBox(st); if (inPoly(poly, b.x + b.w / 2, b.y + b.h / 2)) idx.push(i); return; }
        let n = 0, m = 0;
        for (let k = 0; k < st.p.length; k += 3) { m++; if (inPoly(poly, st.p[k], st.p[k + 1])) n++; }
        if (m && n / m >= 0.5) idx.push(i);
    });
    if (idx.length) { setSel(idx); buzz(8); }
}
function moveDrag(x, y) {
    const d = drag, b = d.box0;
    if (!d.moved && Math.hypot(x - d.x0, y - d.y0) * view().s < 3) return;
    d.moved = true;
    let fn, f = 1;
    if (d.mode === 'move') { const dx = x - d.x0, dy = y - d.y0; fn = (px, py) => [px + dx, py + dy]; }
    else {
        f = clamp(Math.hypot(x - b.x, y - b.y) / (Math.hypot(b.w, b.h) || 1), 0.15, 8);
        fn = (px, py) => [b.x + (px - b.x) * f, b.y + (py - b.y) * f];
    }
    const next = d.before.slice();
    sel.idx.forEach(i => { next[i] = mapStroke(d.before[i], fn, f); });
    page().s = next;
    sel.box = unionBox(sel.idx.map(i => next[i]));
    redraw();
}
function endDrag() {
    const d = drag, pg = page();
    drag = null;
    if (d.moved) { const next = pg.s; pg.s = d.before; commit(next); }
    clearLive(); placeSelMenu();
}
function selAction(act) {
    if (!sel) return;
    const s = page().s, set = new Set(sel.idx);
    if (act === 'del') { commit(s.filter((_, i) => !set.has(i))); sel = null; selMenu.hidden = true; }
    else if (act === 'dup') {
        const off = 18 / view().s, clones = sel.idx.map(i => mapStroke(s[i], (x, y) => [x + off, y + off]));
        commit([...s, ...clones]);
        setSel(clones.map((_, j) => s.length + j));
    } else if (act === 'color') { commit(s.map((st, i) => (set.has(i) ? { ...st, c: prefs.color } : st))); setSel(sel.idx); }
    redraw(); placeSelMenu(); buzz();
}

/* ---------------------------------------------------------------- Gõ chữ */
function openText(x, y, idx = -1) {
    finishText();
    const v = view(), old = idx >= 0 ? page().s[idx] : null;
    const f = old ? old.f : TEXT_SIZES[prefs.size], c = old ? old.c : prefs.color;
    const ta = document.createElement('textarea');
    ta.className = 'qt-text-edit';
    ta.value = old ? old.s : '';
    ta.spellcheck = false;
    ta.setAttribute('aria-label', 'Gõ chữ lên giấy nháp');
    ta.placeholder = 'Gõ chữ…';
    Object.assign(ta.style, { left: (x * v.s + v.x) + 'px', top: (y * v.s + v.y) + 'px', font: FONT(f * v.s), lineHeight: String(LH), color: colorOf({ t: 'pen', c }) });
    const fit = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; ta.style.width = '1px'; ta.style.width = Math.max(f * v.s * 5, ta.scrollWidth + 6) + 'px'; };
    ta.addEventListener('input', fit);
    ta.addEventListener('blur', () => finishText());
    ta.addEventListener('keydown', (e) => {
        e.stopPropagation();   // không để phím tắt làm bài (A–H, ← →…) ăn mất phím đang gõ
        if (e.key === 'Escape') { e.preventDefault(); finishText(true); }
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finishText(); }
    });
    sheet.appendChild(ta);
    textEd = { ta, x, y, idx, f, c };
    redraw();   // giấu chữ cũ trong lúc sửa
    fit();
    ta.focus({ preventScroll: true });
}
function finishText(cancel = false) {
    const t = textEd;
    if (!t) return;
    textEd = null;
    const s = t.ta.value.replace(/\s+$/, '');
    t.ta.remove();
    const pg = page(), old = t.idx >= 0 ? pg.s[t.idx] : null;
    if (!cancel) {
        if (old && !s) commit(pg.s.filter((_, i) => i !== t.idx));
        else if (old && s !== old.s) commit(pg.s.map((st, i) => (i === t.idx ? { ...st, s } : st)));
        else if (!old && s) { commit([...pg.s, { t: 'tx', x: Math.round(t.x * 10) / 10, y: Math.round(t.y * 10) / 10, s, c: t.c, f: t.f }]); sheet.classList.add('has-ink'); }
    }
    redraw();
}
function openTextAt(x, y) {
    const s = page().s;
    for (let i = s.length - 1; i >= 0; i--) if (s[i].t === 'tx' && inTextBox(s[i], x, y, 4 / view().s)) { openText(s[i].x, s[i].y, i); return; }
    openText(x, y - TEXT_SIZES[prefs.size] * 0.6);   // chạm = giữa dòng chữ đầu
}

/* ---------------------------------------------------------------- Bút chỉ laser: vệt sáng tự mờ, không lưu */
const LASER_MS = 850;
function runLaser() { if (!laserRaf) laserRaf = requestAnimationFrame(laserTick); }
function laserTick() {
    laserRaf = 0;
    const now = performance.now();
    laser = laser.filter(q => now - q.t < LASER_MS);
    clearLive();
    if (!laser.length) return;
    const v = view();
    lctx.save();
    lctx.lineCap = 'round'; lctx.strokeStyle = '#FF4D6D'; lctx.shadowColor = 'rgba(255, 77, 109, .85)'; lctx.shadowBlur = 12;
    lctx.lineWidth = 4.5 / v.s;
    for (let i = 1; i < laser.length; i++) {
        const a = laser[i - 1], b = laser[i];
        if (a.g !== b.g) continue;
        lctx.globalAlpha = Math.max(0, 1 - (now - b.t) / LASER_MS);
        lctx.beginPath(); lctx.moveTo(a.x, a.y); lctx.lineTo(b.x, b.y); lctx.stroke();
    }
    const h = laser[laser.length - 1];
    if (laz && h.g === laz.g) { lctx.globalAlpha = 1; lctx.shadowBlur = 16; lctx.fillStyle = '#FFF4F6'; lctx.beginPath(); lctx.arc(h.x, h.y, 3.2 / v.s, 0, Math.PI * 2); lctx.fill(); }
    lctx.restore();
    runLaser();
}

/* ---------------------------------------------------------------- Lưu trang thành ảnh */
function exportPage() {
    const s = pageKey === null ? [] : page().s;
    if (!s.length) return;
    const b = unionBox(s), pad = 28;
    const sc = Math.min(2, 4096 / (b.w + pad * 2), 4096 / (b.h + pad * 2));
    const W = Math.ceil((b.w + pad * 2) * sc), H = Math.ceil((b.h + pad * 2) * sc);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = pal.paper; x.fillRect(0, 0, W, H);
    const v = { s: sc, x: (pad - b.x) * sc, y: (pad - b.y) * sc };
    drawPaper(x, v, W, H);
    x.setTransform(sc, 0, 0, sc, v.x, v.y); x.lineCap = 'round'; x.lineJoin = 'round';
    drawAll(x, s);
    // Chuyển ảnh ĐỒNG BỘ (toDataURL) để gọi share() ngay trong cú bấm — Safari đòi thao tác người dùng còn "nóng"
    const bin = atob(c.toDataURL('image/png').split(',')[1]), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const name = `nhap-cau-${pageKey + 1}.png`, blob = new Blob([u8], { type: 'image/png' });
    const file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
    const download = () => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    };
    if (file && navigator.canShare && navigator.maxTouchPoints > 0 && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: name }).catch((e) => { if (e && e.name !== 'AbortError') download(); });
    } else download();
}

/* ---------------------------------------------------------------- Hàng tùy chọn của công cụ đang cầm */
const segOpt = (key, items) => `<div class="qt-seg" role="group">${items.map(([v, l]) => `<button type="button" data-opt="${key}" data-val="${v}" aria-pressed="${String(prefs[key]) === String(v)}">${l}</button>`).join('')}</div>`;
const chipOpt = (key, label) => `<button type="button" class="qt-chip" data-opt="${key}" data-val="toggle" aria-pressed="${!!prefs[key]}">${label}</button>`;
const hintOpt = (ico, html) => `<span class="qt-hint"><i class="fas ${ico}" aria-hidden="true"></i>${html}</span>`;
const OPTS = {
    pen: () => segOpt('kind', [['fountain', 'Bút máy'], ['ball', 'Bút bi'], ['brush', 'Bút lông']]) + hintOpt('fa-hand', 'Vẽ xong <b>giữ yên bút</b> = tự nắn thành hình'),
    hl: () => segOpt('hlLine', [[0, 'Tự do'], [1, 'Kẻ thẳng']]) + hintOpt('fa-hand', 'Giữ yên cuối nét = nắn thẳng'),
    erase: () => segOpt('erase', [['stroke', 'Cả nét'], ['part', 'Từng phần']]) + chipOpt('eraseHl', 'Chỉ tẩy dạ quang'),
    lasso: () => hintOpt('fa-hand-pointer','Khoanh quanh nét → kéo để <b>dời</b>, kéo chấm góc để <b>phóng to / thu nhỏ</b>, chạm màu để <b>đổi màu</b>'),
    shape: () => hintOpt('fa-wand-magic-sparkles','Vẽ tròn, vuông, tam giác, mũi tên, đường thẳng — tự nắn thẳng thớm'),
    text: () => hintOpt('fa-keyboard', 'Chạm vào giấy để gõ · chạm chữ cũ để sửa · cỡ chữ = nút cỡ nét'),
    laser: () => hintOpt('fa-wand-magic-sparkles', 'Vẽ là sáng lên rồi tự mờ — để chỉ, không lưu lại'),
};
function syncOpts() {
    const on = optsOpen && !!OPTS[prefs.pen];
    optsEl.hidden = !on;
    if (on) optsEl.innerHTML = OPTS[prefs.pen]();
}

function setupScratch() {
    sheet = scratchEl.querySelector('.qt-sheet');
    paper = sheet.querySelector('.qt-paper');
    ink = sheet.querySelector('.qt-ink');
    live = sheet.querySelector('.qt-live');
    selMenu = sheet.querySelector('.qt-selmenu');
    zoomChip = sheet.querySelector('.qt-zoom');
    optsEl = scratchEl.querySelector('.qt-opts');
    // KHÔNG dùng { desynchronized: true }: Chrome trên một số máy Windows (GPU) coi canvas đó là lớp đặc -> chỗ trong suốt hiện ĐEN thui
    pctx = paper.getContext('2d');
    ictx = ink.getContext('2d');
    lctx = live.getContext('2d');
    readPalette();

    const UI = '.qt-selmenu, .qt-zoom, .qt-text-edit';
    const isEraserTip = (e) => e.pointerType === 'pen' && (e.buttons & 32);   // đầu tẩy của bút Surface/Wacom
    // Cử chỉ kiểu GoodNotes: chạm NHANH 2 ngón = hoàn tác, 3 ngón = làm lại; chụm / kéo 2 ngón = thu phóng / dời trang
    const touches = new Map();   // pointerId -> { sx, sy, x, y }
    let gest = null, firstTouchAt = 0, pinch = null, viewRaf = 0;
    const queueView = () => { if (!viewRaf) viewRaf = requestAnimationFrame(() => { viewRaf = 0; redraw(); placeSelMenu(); }); };
    const startPinch = () => {
        const [a, b] = [...touches.values()], r = sheet.getBoundingClientRect(), v = view();
        pinch = { r, v0: { ...v }, d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), m0: [(a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top] };
    };
    const movePinch = () => {
        if (!pinch || touches.size !== 2 || pageKey === null) return;
        const [a, b] = [...touches.values()], { r, v0, d0, m0 } = pinch, v = view();
        const s = clamp(v0.s * Math.hypot(a.x - b.x, a.y - b.y) / d0, ZMIN, ZMAX);
        const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
        v.x = mx - (m0[0] - v0.x) / v0.s * s; v.y = my - (m0[1] - v0.y) / v0.s * s; v.s = s;
        queueView();
    };
    const cancelCur = () => { if (!cur) return; clearTimeout(cur.holdT); cur = null; redraw(); };
    // Giữ yên bút ~0,5 s giữa nét = nắn thành hình (rung nhẹ báo đã nắn); sau đó kéo tiếp chỉ chỉnh đầu mút nếu là đường thẳng
    const paintCur = () => {
        if (cur.st.t === 'hl') { clearLive(); setStyle(lctx, cur.st); hlPath(lctx, cur.st); }
        else { redraw(); drawStroke(ictx, cur.st); }
    };
    const snapNow = () => {
        if (!cur || cur.snap || cur.line) return;
        const q = recognize(cur.st.p);
        if (!q) return;
        cur.st.p = q.p; cur.snap = q.line ? 'line' : 'shape';
        paintCur(); buzz(14);
    };
    const armSnap = (cx, cy) => { clearTimeout(cur.holdT); cur.hx = cx; cur.hy = cy; cur.holdT = setTimeout(snapNow, 520); };

    sheet.addEventListener('pointerdown', (e) => {
        if (e.target.closest(UI)) return;
        if (e.pointerType === 'touch') {
            if (!touches.size) firstTouchAt = performance.now();
            touches.set(e.pointerId, { sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY });
            if (touches.size >= 2) {
                if (!gest) gest = { n: 0, t0: firstTouchAt, moved: false };
                gest.n = Math.max(gest.n, touches.size);
                // ngón thứ hai chạm ngay sau ngón đầu: nét ngón đầu vừa bắt đầu là một phần của cử chỉ -> bỏ nét đó
                if (cur && cur.touch && (performance.now() - cur.t0 < 260 || cur.st.p.length < 36)) cancelCur();
                if (lasso && lasso.touch) { lasso = null; clearLive(); }
                if (touches.size === 2) { finishText(); startPinch(); } else pinch = null;
                return;
            }
        }
        if (e.pointerType === 'pen') { if (!penSeen) { penSeen = true; ls.set('quiz_scratch_pen', '1'); syncScratchBar(); } }
        else if (e.pointerType === 'touch' && !fingerOn()) return;   // tì tay khi viết bằng bút
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (busy() || pageKey === null) return;                       // đang có một nét khác (ngón thứ hai, lòng bàn tay...)
        finishText();
        e.preventDefault();
        try { sheet.setPointerCapture(e.pointerId); } catch (err) { }
        const rect = sheet.getBoundingClientRect();                    // đo MỘT lần mỗi nét
        const [x, y] = toPage(e.clientX, e.clientY, rect);
        if (prefs.pen === 'erase' || isEraserTip(e)) {
            clearSel();
            erasing = { id: e.pointerId, rect, before: page().s };
            eraseAt(x, y);
            return;
        }
        if (prefs.pen === 'lasso') { startLasso(e, rect, x, y); if (lasso) lasso.touch = e.pointerType === 'touch'; return; }
        if (prefs.pen === 'text') { tap = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x, y }; return; }
        if (prefs.pen === 'laser') { laz = { id: e.pointerId, rect, g: ++lazN }; laser.push({ x, y, t: performance.now(), g: laz.g }); runLaser(); return; }
        clearSel();
        const t = prefs.pen === 'hl' ? 'hl' : 'pen';
        sheet.classList.add('has-ink');
        clearLive();   // xóa chấm xem trước
        cur = { id: e.pointerId, rect, ps: 0.5, touch: e.pointerType === 'touch', t0: performance.now(), x0: x, y0: y,
            shape: prefs.pen === 'shape', line: t === 'hl' && !!prefs.hlLine, st: { t, c: prefs.color, w: SIZES[t][prefs.size], p: [] } };
        if (t === 'pen' && prefs.kind !== 'fountain' && !cur.shape) cur.st.k = prefs.kind;
        addPoint(e);
        setStyle(t === 'hl' ? lctx : ictx, cur.st);
        if (t === 'hl') { clearLive(); setStyle(lctx, cur.st); hlPath(lctx, cur.st); }
        if (!cur.shape) armSnap(e.clientX, e.clientY);
    });
    let hoverRect = null;
    sheet.addEventListener('pointermove', (e) => {
        const tp = touches.get(e.pointerId);
        if (tp) { tp.x = e.clientX; tp.y = e.clientY; }
        if (gest && tp) {
            if (Math.hypot(tp.x - tp.sx, tp.y - tp.sy) > 14) gest.moved = true;   // kéo / chụm = không phải chạm nhanh
            if (gest.moved) movePinch();
            return;
        }
        if (!busy() && e.buttons === 0 && (e.pointerType === 'pen' || e.pointerType === 'mouse')) {
            if (!hoverRect) hoverRect = sheet.getBoundingClientRect();
            hoverDot(...toPage(e.clientX, e.clientY, hoverRect));
            return;
        }
        const evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
        const all = evs.length ? evs : [e];
        if (erasing && e.pointerId === erasing.id) { all.forEach(ev => eraseAt(...toPage(ev.clientX, ev.clientY, erasing.rect))); return; }
        if (lasso && e.pointerId === lasso.id) {
            const [x, y] = toPage(e.clientX, e.clientY, lasso.rect), p = lasso.p;
            if (Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) * view().s > 2) { p.push(x, y); drawLasso(); }
            return;
        }
        if (drag && e.pointerId === drag.id) { moveDrag(...toPage(e.clientX, e.clientY, drag.rect)); return; }
        if (laz && e.pointerId === laz.id) { all.forEach(ev => { const [x, y] = toPage(ev.clientX, ev.clientY, laz.rect); laser.push({ x, y, t: performance.now(), g: laz.g }); }); runLaser(); return; }
        if (!cur || e.pointerId !== cur.id) return;
        if (!cur.shape && Math.hypot(e.clientX - cur.hx, e.clientY - cur.hy) > 4) armSnap(e.clientX, e.clientY);
        if (cur.snap === 'line' || cur.line) {
            const [x, y] = toPage(e.clientX, e.clientY, cur.rect);
            cur.st.p = densify([[cur.x0, cur.y0], [x, y]]);
            paintCur();
            return;
        }
        if (cur.snap) return;
        const st = cur.st;
        for (const ev of all) {
            if (addPoint(ev) && st.t === 'pen') penSeg(ictx, st, st.p.length / 3 - 1);   // vẽ ngay đoạn mới, không chờ khung hình
        }
        if (st.t === 'hl') { clearLive(); setStyle(lctx, st); hlPath(lctx, st); }
    });
    sheet.addEventListener('pointerleave', () => { hoverRect = null; if (!busy() && !laserRaf) clearLive(); });
    const end = (e) => {
        if (touches.delete(e.pointerId) && gest) {
            if (touches.size < 2) pinch = null;
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
            clearLive();
            if (pg.s !== before) { const now = pg.s; pg.s = before; commit(now); }
            return;
        }
        if (lasso && e.pointerId === lasso.id) { endLasso(); return; }
        if (drag && e.pointerId === drag.id) { endDrag(); return; }
        if (laz && e.pointerId === laz.id) { laz = null; runLaser(); return; }
        if (tap && e.pointerId === tap.id) {
            const t = tap;
            tap = null;
            if (e.type === 'pointerup' && Math.hypot(e.clientX - t.x0, e.clientY - t.y0) < 10) openTextAt(t.x, t.y);
            return;
        }
        if (!cur || e.pointerId !== cur.id) return;
        const c = cur, st = c.st;
        clearTimeout(c.holdT);
        cur = null;
        if (!c.snap && c.shape) { const q = recognize(st.p); if (q) st.p = q.p; }
        else if (!c.snap && !c.line && st.t === 'pen') penTail(ictx, st);
        commit([...page().s, st]);
        if (st.t === 'hl' || c.snap || c.shape) redraw();   // dạ quang từ lớp tạm về đúng chỗ (dưới mực) · hình đã nắn vẽ lại sạch
    };
    sheet.addEventListener('pointerup', end);
    sheet.addEventListener('pointercancel', end);
    sheet.addEventListener('lostpointercapture', end);
    // Safari: chặn cuộn / phóng to / kính lúp / chọn chữ khi bút hay ngón tay đặt lên giấy (trừ ô gõ chữ / menu khoanh / nút 100%)
    ['touchstart', 'touchmove'].forEach(t => sheet.addEventListener(t, (e) => { if (!(e.target.closest && e.target.closest(UI))) e.preventDefault(); }, { passive: false }));
    sheet.addEventListener('contextmenu', (e) => { if (!e.target.closest(UI)) e.preventDefault(); });
    // Chuột / bàn di: lăn = dời trang, Ctrl (hoặc chụm trên bàn di) + lăn = thu phóng quanh con trỏ
    sheet.addEventListener('wheel', (e) => {
        if (pageKey === null || e.target.closest('.qt-text-edit')) return;
        e.preventDefault();
        finishText();
        const v = view(), r = sheet.getBoundingClientRect();
        if (e.ctrlKey || e.metaKey) {
            const s = clamp(v.s * Math.exp(-e.deltaY * 0.01), ZMIN, ZMAX), mx = e.clientX - r.left, my = e.clientY - r.top;
            v.x = mx - (mx - v.x) / v.s * s; v.y = my - (my - v.y) / v.s * s; v.s = s;
        } else { v.x -= e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX; v.y -= e.shiftKey && !e.deltaX ? 0 : e.deltaY; }
        queueView();
    }, { passive: false });
    zoomChip.addEventListener('click', () => { resetView(); buzz(); });
    selMenu.addEventListener('click', (e) => { const b = e.target.closest('[data-sel]'); if (b) selAction(b.dataset.sel); });
    document.addEventListener('keydown', (e) => {
        if (!sel || typing() || scratchEl.hidden) return;
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); selAction('del'); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); clearSel(); }
    }, true);

    // Màu tự chọn: nhớ 3 màu gần nhất thành chấm màu riêng
    const picker = scratchEl.querySelector('.qt-dot-add input');
    picker.addEventListener('change', () => {
        const c = picker.value;
        if (!HEX.test(c)) return;
        prefs.recent = [c, ...prefs.recent.filter(x => x.toLowerCase() !== c.toLowerCase())].slice(0, 3);
        pickColor(c);
    });
    const pickColor = (c) => {
        prefs.color = c;
        if (prefs.pen === 'erase' || prefs.pen === 'laser') prefs.pen = 'pen';
        if (sel) selAction('color');
        buzz();
        ls.set('quiz_scratch_prefs', JSON.stringify(prefs));
        syncScratchBar();
    };

    scratchEl.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b || b.closest('.qt-selmenu') || b.classList.contains('qt-zoom')) return;
        const pg = pageKey === null ? null : page();
        if (b.dataset.pen) {
            const t = b.dataset.pen;
            if (prefs.pen === t) optsOpen = !optsOpen;   // chạm lại công cụ đang cầm = mở / đóng tùy chọn của nó
            else {
                prefs.pen = t;
                if (!prefs.seen[t]) { prefs.seen[t] = 1; optsOpen = true; }   // lần đầu cầm công cụ: hiện luôn cách dùng
            }
            if (t !== 'lasso') clearSel();
            if (t !== 'text') finishText();
        } else if (b.dataset.color) { pickColor(b.dataset.color); return; }
        else if (b.dataset.opt) {
            const k = b.dataset.opt, v = b.dataset.val;
            prefs[k] = v === 'toggle' ? !prefs[k] : (k === 'hlLine' ? +v : v);
        }
        else if (b.dataset.size) prefs.size = +b.dataset.size;
        else if (b.dataset.act === 'paper') { prefs.paper = PAPERS[(PAPERS.indexOf(prefs.paper) + 1) % PAPERS.length]; redraw(); }
        else if (b.dataset.act === 'finger') ls.set('quiz_scratch_finger', fingerOn() ? '0' : '1');
        else if (b.dataset.act === 'undo') undo();
        else if (b.dataset.act === 'redo') redo();
        else if (b.dataset.act === 'clear' && pg && pg.s.length) { finishText(); clearSel(); commit([]); redraw(); }
        else if (b.dataset.act === 'export') { exportPage(); return; }
        else if (b.dataset.act === 'max') {
            maxed = !maxed; ss.set('quiz_scratch_max', maxed ? '1' : '');
            layout(); fitSheet();
            if (openSet.has('calc')) placeCalc(...(calcPos || [calcEl.offsetLeft, calcEl.offsetTop]));
        } else return;
        buzz();
        ls.set('quiz_scratch_prefs', JSON.stringify(prefs));
        syncScratchBar();
    });
    new ResizeObserver(() => { if (!busy()) { fitSheet(); placeSelMenu(); } }).observe(sheet);
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
    const rec = scratchEl.querySelector('.qt-recent');
    const want = prefs.recent.join(',');
    if (rec.dataset.list !== want) {
        rec.dataset.list = want;
        rec.innerHTML = prefs.recent.map(c => `<button type="button" class="qt-dot" data-color="${c}" title="Màu ${c}" aria-label="Màu ${c}"></button>`).join('');
    }
    scratchEl.querySelectorAll('[data-color]').forEach(b => {
        b.style.setProperty('--c', colorOf({ t: prefs.pen === 'hl' ? 'hl' : 'pen', c: b.dataset.color }));
        b.setAttribute('aria-pressed', String(b.dataset.color === prefs.color && prefs.pen !== 'erase' && prefs.pen !== 'laser'));
    });
    scratchEl.querySelectorAll('[data-size]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.size === prefs.size)));
    const pb = scratchEl.querySelector('[data-act="paper"]'), pu = PAPER_UI[prefs.paper] || PAPER_UI.grid;
    pb.firstElementChild.className = 'fas ' + pu[0];
    pb.title = pu[1] + ' · bấm để đổi kiểu giấy';
    scratchEl.dataset.pen = prefs.pen;
    sheet.dataset.pen = prefs.pen;
    syncOpts();
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
    scratchEl.querySelector('[data-act="export"]').disabled = !(pg && pg.s.length);
    sheet.classList.toggle('has-ink', !!(pg && pg.s.length) || !!cur || !!textEd);
    placeSelMenu();
}

// Đổi câu -> lật sang trang nháp của câu đó
function syncScratchPage() {
    if (!openSet.has('scratch') || !state.questions.length) return;
    ensurePages();
    const k = state.currentIndex;
    if (k === pageKey) return;
    if (busy()) return;   // đang giữa nét: để nét xong rồi mới lật
    finishText(); clearSel();
    laser = [];
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
