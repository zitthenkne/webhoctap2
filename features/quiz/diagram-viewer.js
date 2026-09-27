// features/quiz/diagram-viewer.js — xem sơ đồ Mermaid phóng to toàn màn hình (dùng chung:
// quiz.html chạm vào sơ đồ; phòng đánh đề nút ⤢ qua room-diagram.js).
// Phóng/thu bằng nút, phím + / -, Ctrl + lăn chuột, chụm 2 ngón; kéo chuột / vuốt để xem chỗ khác; Esc đóng.
// Tự tiêm CSS lần đầu mở -> không tốn gì khi trang không có sơ đồ.

const CSS = `
.rm-dgv { position: fixed; inset: 0; z-index: 90; font-family: Quicksand, "Segoe UI", sans-serif; }
.rm-dgv { display: flex; flex-direction: column; background: rgba(46, 34, 52, .6); backdrop-filter: blur(4px); animation: rm-dg-in .18s ease both; }
.rm-dgv-bar { display: flex; align-items: center; gap: .3rem; margin: .7rem auto .5rem; padding: .3rem .35rem .3rem .9rem; border-radius: 999px; background: #fff; color: #4A3B52; box-shadow: 0 12px 30px -16px rgba(0,0,0,.5); max-width: calc(100% - 1rem); }
.rm-dgv-bar b { font-weight: 600; font-size: .82rem; margin-right: .3rem; white-space: nowrap; }
.rm-dgv-bar button { min-width: 2.2rem; height: 2.2rem; border-radius: 999px; color: #8A7A96; font: 600 .8rem Quicksand, sans-serif; display: grid; place-items: center; padding: 0 .55rem; }
.rm-dgv-bar button:hover { background: #FFEDF4; color: #E0528A; }
.rm-dgv-bar .rm-dgv-pct { min-width: 3.2rem; color: #4A3B52; font-variant-numeric: tabular-nums; }
.rm-dgv-bar .rm-dgv-x { background: #FF8FB8; color: #fff; }
.rm-dgv-stage { flex: 1; min-height: 0; overflow: auto; touch-action: pan-x pan-y; cursor: grab; overscroll-behavior: contain; }
.rm-dgv-stage.is-drag { cursor: grabbing; }
.rm-dgv-inner { display: inline-block; min-width: 100%; min-height: 100%; box-sizing: border-box; padding: 1rem; text-align: center; }
.rm-dgv-paper { display: inline-block; padding: 1.2rem; border-radius: 1.2rem; background: #FFFDF8; box-shadow: 0 20px 50px -24px rgba(0,0,0,.6); }
.rm-dgv-paper svg { display: block; max-width: none !important; height: auto; }
@keyframes rm-dg-in { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .rm-dgv { animation: none; } }
html.theme-dark .rm-dgv-bar { background: #2b2527; color: #F3E9EE; }
html.theme-dark .rm-dgv-bar .rm-dgv-pct { color: #F3E9EE; }
`;
function injectCss() {
    if (document.getElementById('dgv-css')) return;
    const st = document.createElement('style');
    st.id = 'dgv-css';
    st.textContent = CSS;
    document.head.appendChild(st);
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** @param {Element} box khung chứa sơ đồ đã vẽ (có <svg>) */
export function openDiagramViewer(box) {
    const svg0 = box?.querySelector('svg');
    if (!svg0) return;
    injectCss();
    const vb = svg0.viewBox?.baseVal;
    const r0 = svg0.getBoundingClientRect();
    const w0 = vb?.width || r0.width || 600, h0 = vb?.height || r0.height || 400;
    // Bản sao đổi hết id (mermaid đặt id kiểu mmd-xxx cho mũi tên / CSS) -> không trùng với sơ đồ gốc
    const oid = svg0.id, nid = 'mmz-' + Math.random().toString(36).slice(2, 9);
    const html = oid ? svg0.outerHTML.split(oid).join(nid) : svg0.outerHTML;
    const ov = document.createElement('div');
    ov.className = 'rm-dgv';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-label', 'Xem sơ đồ phóng to');
    ov.innerHTML = `<div class="rm-dgv-bar">
            <b>Sơ đồ</b>
            <button type="button" data-z="out" title="Thu nhỏ" aria-label="Thu nhỏ"><i class="fas fa-minus"></i></button>
            <button type="button" data-z="fit" class="rm-dgv-pct" title="Vừa màn hình">100%</button>
            <button type="button" data-z="in" title="Phóng to" aria-label="Phóng to"><i class="fas fa-plus"></i></button>
            <button type="button" data-z="x" class="rm-dgv-x" title="Đóng (Esc)" aria-label="Đóng"><i class="fas fa-xmark"></i></button>
        </div>
        <div class="rm-dgv-stage"><div class="rm-dgv-inner"><div class="rm-dgv-paper">${html}</div></div></div>`;
    document.body.appendChild(ov);
    const stage = ov.querySelector('.rm-dgv-stage'), svg = ov.querySelector('svg'), pct = ov.querySelector('.rm-dgv-pct');
    svg.removeAttribute('style');
    let k = 1;
    const fitK = () => clamp(Math.min((stage.clientWidth - 72) / w0, (stage.clientHeight - 72) / h0), 0.2, 3);
    const setK = (nk, cx, cy) => {
        const old = k;
        k = clamp(nk, 0.2, 6);
        // giữ điểm dưới con trỏ / giữa hai ngón đứng yên khi phóng
        const px = cx ?? stage.clientWidth / 2, py = cy ?? stage.clientHeight / 2;
        const ax = (stage.scrollLeft + px) / old, ay = (stage.scrollTop + py) / old;
        svg.setAttribute('width', Math.round(w0 * k));
        svg.setAttribute('height', Math.round(h0 * k));
        stage.scrollLeft = ax * k - px; stage.scrollTop = ay * k - py;
        pct.textContent = Math.round(k * 100) + '%';
    };
    setK(fitK());
    const close = () => { ov.remove(); document.removeEventListener('keydown', onKey, true); };
    const onKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); close(); }
        else if (e.key === '+' || e.key === '=') { e.stopPropagation(); setK(k * 1.25); }
        else if (e.key === '-') { e.stopPropagation(); setK(k / 1.25); }
    };
    document.addEventListener('keydown', onKey, true);
    ov.querySelector('.rm-dgv-bar').addEventListener('click', (e) => {
        const z = e.target.closest('[data-z]')?.dataset.z;
        if (z === 'x') close();
        else if (z === 'in') setK(k * 1.25);
        else if (z === 'out') setK(k / 1.25);
        else if (z === 'fit') setK(fitK());
    });
    stage.addEventListener('wheel', (e) => {
        if (!e.ctrlKey && !e.metaKey) return;               // lăn thường = cuộn; Ctrl + lăn (hoặc chụm touchpad) = phóng
        e.preventDefault();
        const r = stage.getBoundingClientRect();
        setK(k * Math.pow(1.0018, -clamp(e.deltaY, -120, 120)), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    // chuột: kéo để xem chỗ khác · cảm ứng: 1 ngón cuộn (trình duyệt lo), 2 ngón chụm = phóng
    const pts = new Map();
    let drag = null, pinch = null;
    stage.addEventListener('pointerdown', (e) => {
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size === 2) {
            const [a, b] = [...pts.values()], r = stage.getBoundingClientRect();
            pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k, cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top };
            drag = null;
        } else if (e.pointerType === 'mouse' && e.button === 0) {
            drag = { x: e.clientX, y: e.clientY, sl: stage.scrollLeft, st: stage.scrollTop };
            stage.classList.add('is-drag');
            try { stage.setPointerCapture(e.pointerId); } catch (err) {}
        }
    });
    stage.addEventListener('pointermove', (e) => {
        if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinch && pts.size === 2) {
            const [a, b] = [...pts.values()];
            setK(pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, pinch.cx, pinch.cy);
        } else if (drag) {
            stage.scrollLeft = drag.sl - (e.clientX - drag.x);
            stage.scrollTop = drag.st - (e.clientY - drag.y);
        }
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; drag = null; stage.classList.remove('is-drag'); };
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    ov.querySelector('[data-z="x"]').focus({ preventScroll: true });
}
