// room-diagram.js — XEM PHÓNG TO & SỬA SƠ ĐỒ MERMAID trong phòng (nạp lười: chỉ khi bấm ⤢ / Sửa / Chèn sơ đồ).
//  · openDiagramViewer(box): xuất lại từ ../quiz/diagram-viewer.js (dùng chung với quiz.html).
//  · openDiagramEditor(box | null, liveNode): hộp sửa mã có XEM TRƯỚC ngay khi gõ + mẫu dựng sẵn; Lưu -> thay khung
//    sơ đồ trong ô sửa rồi lưu ngay (saveNode). box = null -> chèn sơ đồ mới vào chỗ con trỏ của ô.
// CSS nằm luôn trong file (tiêm 1 lần) — không chở thêm gì vào study-room.css cho người không dùng sơ đồ.
import { mermaidSvg, fixMermaidCode } from '../quiz/quiz-helpers.js';
// Xem phóng to dùng chung với trang làm bài (quiz.html) -> nằm ở features/quiz/diagram-viewer.js
export { openDiagramViewer } from '../quiz/diagram-viewer.js';
import { diagramHtml, renderRichMath, saveNode } from './room-editor.js';

const CSS = `
.rm-dge { position: fixed; inset: 0; z-index: 90; font-family: Quicksand, "Segoe UI", sans-serif; }
.rm-dge { display: grid; place-items: center; padding: 1rem; background: rgba(46, 34, 52, .45); backdrop-filter: blur(3px); animation: rm-dg-in .18s ease both; }
.rm-dge-card { width: min(62rem, 100%); max-height: calc(100vh - 2rem); display: flex; flex-direction: column; gap: .7rem; padding: 1rem; border-radius: 1.4rem; background: #fff; color: #4A3B52; box-shadow: 0 30px 60px -30px rgba(0,0,0,.6); }
.rm-dge-head { display: flex; align-items: baseline; gap: .6rem; }
.rm-dge-head b { font-size: 1rem; font-weight: 600; white-space: nowrap; }
.rm-dge-head span { font-size: .74rem; color: #A49BB0; }
.rm-dge-head button { margin-left: auto; width: 2.1rem; height: 2.1rem; border-radius: 999px; color: #A49BB0; }
.rm-dge-head button:hover { background: #FFEDF4; color: #E0528A; }
.rm-dge-tpl { display: flex; gap: .4rem; overflow-x: auto; scrollbar-width: none; padding-bottom: .1rem; }
.rm-dge-tpl button { flex-shrink: 0; padding: .38rem .75rem; border-radius: 999px; background: var(--t, #FFF1B8); color: #4A3B52; font: 600 .74rem Quicksand, sans-serif; }
.rm-dge-tpl button:hover { filter: brightness(.97); }
.rm-dge-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); gap: .7rem; }
.rm-dge-code { min-height: 16rem; resize: none; padding: .8rem .9rem; border-radius: 1rem; border: 1.5px solid #F3D3E0; background: #FFFBFD; color: #4A3B52; font: 500 .82rem/1.55 ui-monospace, "Cascadia Mono", Consolas, monospace; outline: none; tab-size: 4; }
.rm-dge-code:focus { border-color: #FF8FB8; box-shadow: 0 0 0 3px rgba(255, 143, 184, .18); }
.rm-dge-prev { position: relative; min-height: 16rem; overflow: auto; border-radius: 1rem; background: #FFFDF8; border: 1.5px dashed #EADFD2; display: grid; place-items: center; padding: .8rem; }
.rm-dge-prev svg { height: auto; }
.rm-dge-prev.is-stale .rm-dge-svg { opacity: .35; filter: grayscale(.4); }
.rm-dge-msg { position: absolute; left: .6rem; right: .6rem; bottom: .6rem; margin: 0; padding: .45rem .7rem; border-radius: .7rem; background: #FFF6EA; color: #8A5414; font-size: .74rem; font-weight: 600; }
.rm-dge-msg:empty { display: none; }
.rm-dge-empty { color: #B9AEC4; font-size: .8rem; }
.rm-dge-foot { display: flex; align-items: center; gap: .5rem; }
.rm-dge-foot a { font-size: .72rem; color: #A49BB0; text-decoration: underline dotted; }
.rm-dge-foot .sp { flex: 1; }
.rm-dge-btn { white-space: nowrap; padding: .55rem 1rem; border-radius: 999px; font: 600 .82rem Quicksand, sans-serif; color: #8A7A96; }
.rm-dge-btn:hover { background: #F7F2F9; }
.rm-dge-btn.is-main { background: #FF8FB8; color: #fff; }
.rm-dge-btn.is-main:hover { background: #F2709C; }
.rm-dge-btn.is-del { color: #E5484D; }
.rm-dge-btn.is-del:hover { background: #FFEFF0; }
@keyframes rm-dg-in { from { opacity: 0; } }
@media (max-width: 720px) {
  .rm-dge { padding: .5rem; align-items: end; }
  .rm-dge-card { max-height: calc(100dvh - 1rem); border-radius: 1.3rem 1.3rem 1rem 1rem; }
  .rm-dge-body { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(10rem, 1fr); }
  .rm-dge-code { min-height: 9rem; font-size: 16px; }   /* >=16px: iPhone không tự phóng cả trang */
  .rm-dge-head span, .rm-dge-foot a { display: none; }
  .rm-dge-btn { padding: .55rem .8rem; }
  .rm-dge-prev { min-height: 10rem; }
}
@media (prefers-reduced-motion: reduce) { .rm-dge { animation: none; } }
html.theme-dark .rm-dge-card { background: #2b2527; color: #F3E9EE; }
html.theme-dark .rm-dge-code { background: #221d1f; border-color: #4a3a41; color: #F3E9EE; }
`;
function injectCss() {
    if (document.getElementById('rm-diagram-css')) return;
    const st = document.createElement('style');
    st.id = 'rm-diagram-css';
    st.textContent = CSS;
    document.head.appendChild(st);
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ================= SỬA / CHÈN SƠ ĐỒ =================
const TEMPLATES = [
    ['Lưu đồ Có / Không', '#D6F5E8', `flowchart TD
    A[Triệu chứng / lý do đến khám] --> B{Có dấu hiệu nguy hiểm?}
    B -- Có --> C[Xử trí cấp cứu]
    B -- Không --> D[Khám thêm + cận lâm sàng]
    D --> E[Chẩn đoán]`],
    ['Cơ chế bệnh sinh', '#E9E0FF', `flowchart LR
    A[Nguyên nhân] --> B[Cơ chế]
    B --> C[Rối loạn sinh lý]
    C --> D[Triệu chứng]
    C --> E[Cận lâm sàng]`],
    ['Sơ đồ tư duy', '#FFD9E6', `mindmap
  root((Tên bệnh))
    Nguyên nhân
    Lâm sàng
    Cận lâm sàng
    Điều trị`],
    ['Dòng thời gian', '#FFE2CC', `timeline
    title Bệnh sử
    N-5 : Sốt cao
    N-2 : Ho khạc đàm
    Nhập viện : Khó thở`],
    ['Trình tự', '#D8ECFF', `sequenceDiagram
    participant BN as Bệnh nhân
    participant BS as Bác sĩ
    BN->>BS: Than đau ngực
    BS->>BN: Hỏi bệnh, khám
    BS-->>BN: Chỉ định ECG, men tim`],
];
const decodeCode = (enc) => { try { return decodeURIComponent(enc || ''); } catch (e) { return ''; } };

/** @param {Element|null} box khung sơ đồ đang có (null = chèn mới) · @param {Element} liveNode ô sửa chứa nó */
export function openDiagramEditor(box, liveNode) {
    if (!liveNode) return;
    injectCss();
    // chèn mới: nhớ chỗ con trỏ trong ô trước khi hộp lấy mất tiêu điểm
    const sel = window.getSelection();
    const range = !box && sel?.rangeCount && liveNode.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
    const old = box ? decodeCode(box.querySelector('[data-code]')?.getAttribute('data-code')) : '';
    const ov = document.createElement('div');
    ov.className = 'rm-dge';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-label', box ? 'Sửa sơ đồ' : 'Chèn sơ đồ');
    ov.innerHTML = `<div class="rm-dge-card">
        <div class="rm-dge-head"><b>${box ? 'Sửa sơ đồ' : 'Chèn sơ đồ'}</b><span>Mã Mermaid · sơ đồ vẽ lại ngay khi gõ</span>
            <button type="button" data-a="x" title="Đóng (Esc)" aria-label="Đóng"><i class="fas fa-xmark"></i></button></div>
        <div class="rm-dge-tpl">${TEMPLATES.map(([n, c], i) => `<button type="button" data-tpl="${i}" style="--t:${c}">${esc(n)}</button>`).join('')}</div>
        <div class="rm-dge-body">
            <textarea class="rm-dge-code" wrap="off" spellcheck="false" aria-label="Mã sơ đồ Mermaid" placeholder="Chọn một mẫu ở trên, hoặc gõ mã Mermaid…">${esc(old)}</textarea>
            <div class="rm-dge-prev"><div class="rm-dge-svg"><p class="rm-dge-empty">Xem trước sơ đồ ở đây</p></div><p class="rm-dge-msg"></p></div>
        </div>
        <div class="rm-dge-foot">
            ${box ? '<button type="button" class="rm-dge-btn is-del" data-a="del"><i class="fas fa-trash"></i> Xoá sơ đồ</button>' : ''}
            <a href="https://mermaid.js.org/syntax/flowchart.html" target="_blank" rel="noopener noreferrer">Cú pháp Mermaid</a>
            <span class="sp"></span>
            <button type="button" class="rm-dge-btn" data-a="x">Huỷ</button>
            <button type="button" class="rm-dge-btn is-main" data-a="ok">${box ? 'Lưu sơ đồ' : 'Chèn vào ô'}</button>
        </div></div>`;
    document.body.appendChild(ov);
    const ta = ov.querySelector('.rm-dge-code'), prev = ov.querySelector('.rm-dge-prev'), out = ov.querySelector('.rm-dge-svg'), msg = ov.querySelector('.rm-dge-msg');
    let t = 0, seq = 0;
    const paint = async () => {
        const code = ta.value.trim(), my = ++seq;
        if (!code) { out.innerHTML = '<p class="rm-dge-empty">Xem trước sơ đồ ở đây</p>'; msg.textContent = ''; prev.classList.remove('is-stale'); return; }
        try {
            const { svg } = await mermaidSvg(fixMermaidCode(code));
            if (my !== seq) return;
            out.innerHTML = svg; msg.textContent = ''; prev.classList.remove('is-stale');
            const el = out.querySelector('svg'), vw = el?.viewBox?.baseVal?.width;
            if (el && vw) { el.style.maxWidth = 'none'; el.style.width = Math.round(Math.min(prev.clientWidth - 28, vw * 1.6)) + 'px'; }
        } catch (err) {
            if (my !== seq) return;
            const line = /line (\d+)/i.exec(String(err?.message || ''))?.[1];
            msg.textContent = `⚠ Chưa đúng cú pháp${line ? ` ở dòng ${line}` : ''} — sơ đồ bên trên là bản đúng gần nhất.`;
            prev.classList.add('is-stale');
        }
    };
    const later = () => { clearTimeout(t); t = setTimeout(paint, 350); };
    ta.addEventListener('input', later);
    // Tab trong ô mã = thụt lề (mermaid dựa vào thụt lề ở mindmap / timeline), không nhảy khỏi ô
    ta.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '    '); }
        else if (e.key === 'Escape') close();
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
    });
    const close = () => { clearTimeout(t); ov.remove(); };
    const save = () => {
        const code = ta.value.trim();
        if (!code) return del();
        const tmp = document.createElement('div');
        tmp.innerHTML = diagramHtml(code);
        const fresh = tmp.firstElementChild;
        if (box?.isConnected) box.replaceWith(fresh);
        else {
            // chèn XUỐNG SAU dòng đang chứa con trỏ (không cắt đôi câu / không lồng sơ đồ vào giữa dòng chữ)
            let ref = range?.startContainer || null;
            while (ref && ref.parentNode !== liveNode) ref = ref.parentNode;
            const isBlock = (n) => n.nodeType === 1 && /^(DIV|P|UL|OL|TABLE|H4|HR|BR)$/.test(n.tagName);
            if (ref && !isBlock(ref)) {            // con trỏ giữa dòng chữ: đi tới hết dòng (trước khối kế / qua dấu xuống dòng)
                while (ref.nextSibling && !isBlock(ref.nextSibling)) ref = ref.nextSibling;
                if (ref.nextSibling?.tagName === 'BR') ref = ref.nextSibling;
            }
            if (ref) ref.after(fresh); else liveNode.appendChild(fresh);
            if (!fresh.nextSibling) fresh.after(Object.assign(document.createElement('p'), { innerHTML: '<br>' }));
        }
        liveNode.dataset.empty = '0';
        renderRichMath(liveNode);
        saveNode(liveNode);
        close();
    };
    const del = () => {
        if (box?.isConnected) { box.remove(); saveNode(liveNode); }
        close();
    };
    ov.addEventListener('click', (e) => {
        if (e.target === ov) return close();
        const a = e.target.closest('[data-a]')?.dataset.a;
        if (a === 'x') return close();
        if (a === 'ok') return save();
        if (a === 'del') return del();
        const tp = e.target.closest('[data-tpl]');
        if (tp) {
            // thay bằng execCommand để Ctrl+Z trong ô mã lấy lại được mã cũ (khỏi hỏi xác nhận)
            ta.focus(); ta.select();
            if (!document.execCommand('insertText', false, TEMPLATES[+tp.dataset.tpl][2])) ta.value = TEMPLATES[+tp.dataset.tpl][2];
            paint();
        }
    });
    ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    if (old) paint();
    ta.focus({ preventScroll: true });
}
