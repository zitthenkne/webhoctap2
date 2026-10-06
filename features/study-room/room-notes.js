// room-notes.js — GHI CHÚ NGẮN CHO CỤM TỪ trong phòng đánh đề (bản 53, đồng bộ với trang làm đề quiz.html).
// Bôi đen một cụm chữ trong ô sửa tại chỗ -> nút "Ghi chú" trên thanh nổi (room-editor.js) -> viết vài chữ (tối đa 10 từ).
// Khác trang làm đề (ghi chú riêng của mỗi người): ở phòng, MỌI nội dung đều là của cả nhóm, nên ghi chú lưu thẳng
// TRONG nội dung ô sửa như bút dạ: <span data-note="…">cụm từ</span> (sanitizeHtml giữ đúng thuộc tính này) -> đi cùng đường
// 'room:edit' với in đậm / bút dạ, cả phòng thấy ngay, Lưu đề / biên bản mang theo. Hiển thị: study-room.css (bản 53) —
// chip `::after { content: attr(data-note) }` ngay sau cụm từ (không nằm trong DOM nên không lẫn vào chữ đang sửa).
// Công tắc ẩn / hiện nằm ở menu Công cụ (room-boost.js, class body.rm-notes-off).
//
// Nạp LƯỜI từ room-editor.js: chỉ khi có người bấm nút Ghi chú hoặc bấm vào chip.
import { showToast } from '../../core/utils.js';
import { showUndo } from './room-ui.js';

const MAX_WORDS = 10;
const MAX_QUOTE = 160;                         // cụm được ghi chú: chữ, không phải cả đoạn
const wordCount = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);
const isCoarse = () => !!window.matchMedia?.('(pointer: coarse)').matches;
// Không được có trong cụm chọn: công thức / sơ đồ / ảnh / khối (ghi chú chỉ cho CHỮ trong một đoạn)
const NOT_TEXT = '.katex, .katex-display, .katex-error, .mermaid-container, .rm-mm, .rm-upl, img, table, ul, ol, li, div, p, h4, hr';

let ed = null;                                 // { box, input, ctx, off }
const fireInput = (node) => node.dispatchEvent(new Event('input', { bubbles: true }));   // -> room-editor lưu sau 400ms + 'room:edit'

export function closeNoteEditor() {
    if (!ed) return;
    ed.off();
    ed.box.remove();
    ed = null;
}

/** Vị trí (số ký tự) của một điểm (container, offset) tính từ đầu chữ của ô. */
function offsetIn(node, container, offset) {
    try {
        const r = document.createRange();
        r.selectNodeContents(node);
        r.setEnd(container, offset);
        return r.toString().length;
    } catch (e) { return -1; }
}

/** Mọi text node trong ô theo đúng thứ tự tài liệu (cùng cách đếm với Range.toString). */
function textNodes(node) {
    const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
    const out = [];
    while (w.nextNode()) out.push(w.currentNode);
    return out;
}
function locate(nodes, pos, preferEnd) {
    let acc = 0;
    for (let i = 0; i < nodes.length; i++) {
        const len = nodes[i].nodeValue.length;
        if (pos < acc + len || (pos === acc + len && (preferEnd || i === nodes.length - 1))) return { node: nodes[i], offset: pos - acc };
        acc += len;
    }
    const last = nodes[nodes.length - 1];
    return last ? { node: last, offset: last.nodeValue.length } : null;
}
/** Bọc khoảng [from, to) ký tự của ô bằng <span data-note>. Trả về thẻ vừa tạo (hoặc null nếu không bọc được). */
function wrapOffsets(node, from, to, note) {
    const nodes = textNodes(node);
    const a = locate(nodes, from, false), b = locate(nodes, to, true);
    if (!a || !b) return null;
    try {
        const range = document.createRange();
        range.setStart(a.node, a.offset);
        range.setEnd(b.node, b.offset);
        if (range.cloneContents().querySelector(NOT_TEXT)) return null;
        const sp = document.createElement('span');
        sp.setAttribute('data-note', note);
        try { range.surroundContents(sp); } catch (e) { sp.appendChild(range.extractContents()); range.insertNode(sp); }
        return sp;
    } catch (e) { return null; }
}
/** Chỗ xuất hiện của `needle` trong `hay` gần `near` nhất (-1 nếu không có) — khi nội dung ô đã bị người khác sửa lệch chỗ. */
function nearestIndex(hay, needle, near) {
    let best = -1, i = hay.indexOf(needle);
    while (i >= 0) {
        if (best < 0 || Math.abs(i - near) < Math.abs(best - near)) best = i;
        i = hay.indexOf(needle, i + 1);
    }
    return best;
}

/** Từ nút Ghi chú trên thanh bôi đen: `range` là vùng chọn đã chép lại (khung viết sẽ lấy mất tiêu điểm của ô). */
export function openNoteForSelection(node, range) {
    if (!node?.isConnected) return;
    const raw = range.toString();
    const text = raw.replace(/\s+/g, ' ').trim();
    if (!text) return;
    if (text.length > MAX_QUOTE) return void showToast(`Chọn cụm ngắn hơn (dưới ${MAX_QUOTE} ký tự) rồi ghi chú nhé.`, 'info', 2600);
    // Vùng chọn chạm vào một ghi chú có sẵn -> sửa ghi chú đó (không lồng ghi chú vào ghi chú)
    const hit = [...node.querySelectorAll('span[data-note]')].find(s => { try { return range.intersectsNode(s); } catch (e) { return false; } });
    if (hit) return openNoteForSpan(hit);
    if (range.cloneContents().querySelector(NOT_TEXT)) {
        return void showToast('Ghi chú dành cho chữ trong MỘT đoạn — chọn lại nhỏ hơn nhé.', 'info', 2800);
    }
    const start = offsetIn(node, range.startContainer, range.startOffset);
    const end = offsetIn(node, range.endContainer, range.endOffset);
    if (start < 0 || end <= start) return;
    openEditor({ mode: 'new', node, key: node.dataset.liveEdit, raw, text, start, end, note: '', rect: range.getBoundingClientRect() });
}

/** Từ chip ghi chú (bấm vào cạnh cụm từ): sửa hoặc xóa. */
export function openNoteForSpan(span) {
    const node = span?.closest?.('[data-live-edit]');
    if (!node) return;
    openEditor({ mode: 'edit', node, key: node.dataset.liveEdit, span, text: span.textContent.replace(/\s+/g, ' ').trim(),
        note: span.getAttribute('data-note') || '', rect: span.getBoundingClientRect() });
}

function openEditor(ctx) {
    closeNoteEditor();
    const box = document.createElement('div');
    box.id = 'room-note-pop';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Ghi chú cho cụm từ');
    box.innerHTML = '<span class="rnp-tape" aria-hidden="true"></span>'
        + '<div class="rnp-head"><span class="rnp-ic" aria-hidden="true"></span><div class="rnp-quote">“<span></span>”</div></div>'
        + '<div class="rnp-field">'
        + `<input class="rm-input rnp-input" type="text" maxlength="90" enterkeyhint="done" autocomplete="off" placeholder="Ghi chú ngắn, tối đa ${MAX_WORDS} từ…">`
        + '<span class="rnp-count"></span></div>'
        + '<div class="rnp-row">'
        + (ctx.mode === 'edit' ? '<button type="button" class="rm-ghost-btn rnp-del" data-rnp="del"><i class="fas fa-trash-can"></i> Xóa</button>' : '')
        + '<span class="rnp-sp"></span>'
        + '<button type="button" class="rm-ghost-btn" data-rnp="cancel">Hủy</button>'
        + '<button type="button" class="rm-cta rm-solid-btn rnp-ok" data-rnp="save"><i class="fas fa-check"></i> Lưu</button></div>';
    const quote = ctx.text.length > 70 ? ctx.text.slice(0, 70) + '…' : ctx.text;
    box.querySelector('.rnp-quote span').textContent = quote;
    const input = box.querySelector('.rnp-input');
    input.value = ctx.note;
    const cnt = box.querySelector('.rnp-count'), ok = box.querySelector('.rnp-ok');
    const sync = () => {
        const n = wordCount(input.value);
        cnt.textContent = `${n}/${MAX_WORDS}`;
        cnt.classList.toggle('is-over', n > MAX_WORDS);
        ok.disabled = n > MAX_WORDS;
    };
    input.addEventListener('input', sync);
    sync();
    document.body.appendChild(box);

    // Cảm ứng: ghim phía trên màn hình (bàn phím ảo che nửa dưới); chuột: ngay dưới cụm từ
    const vv = window.visualViewport;
    if (isCoarse() || !ctx.rect) {
        box.style.top = Math.round((vv ? vv.offsetTop : 0) + 64) + 'px';
    } else {
        const w = box.offsetWidth, h = box.offsetHeight;
        box.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, ctx.rect.left + ctx.rect.width / 2 - w / 2)) + 'px';
        const top = ctx.rect.bottom + 10;
        box.style.top = (top + h > window.innerHeight - 8 ? Math.max(8, ctx.rect.top - h - 10) : top) + 'px';
        box.classList.add('is-near');
    }

    const onOutside = (e) => { if (!box.contains(e.target)) closeNoteEditor(); };
    setTimeout(() => {                         // đợi cú bấm đang mở khung xong rồi mới nghe "bấm ra ngoài"
        document.addEventListener('mousedown', onOutside, true);
        document.addEventListener('touchstart', onOutside, { capture: true, passive: true });
    }, 0);
    ed = { box, input, ctx, off: () => { document.removeEventListener('mousedown', onOutside, true); document.removeEventListener('touchstart', onOutside, true); } };

    box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-rnp]');
        if (!b) return;
        const act = b.getAttribute('data-rnp');
        if (act === 'cancel') closeNoteEditor();
        else if (act === 'save') save();
        else if (act === 'del') remove();
    });
    input.addEventListener('keydown', (e) => {
        e.stopPropagation();                   // đừng kích hoạt phím tắt của phòng (A–D, mũi tên, Z…)
        if (e.key === 'Escape') closeNoteEditor();
        else if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); save(); }   // Enter chốt chữ đang ghép (Telex / VNI) thì chưa lưu
    });
    setTimeout(() => { input.focus(); input.select(); }, 30);
}

/** Tìm lại thẻ ghi chú đang sửa (ô có thể đã được vẽ lại vì người khác vừa sửa). */
function findSpan(ctx) {
    if (ctx.span?.isConnected) return ctx.span;
    const node = ctx.node?.isConnected ? ctx.node : document.querySelector(`[data-live-edit="${CSS.escape(ctx.key)}"]`);
    return node ? [...node.querySelectorAll('span[data-note]')].find(s => s.textContent.replace(/\s+/g, ' ').trim() === ctx.text) || null : null;
}

function save() {
    if (!ed) return;
    const { input, ctx } = ed;
    const note = input.value.trim().replace(/\s+/g, ' ');
    if (wordCount(note) > MAX_WORDS) return;       // phải NGẮN: hiện thẳng cạnh chữ
    if (ctx.mode === 'edit') {
        if (!note) return void remove();
        const sp = findSpan(ctx);
        if (!sp) { closeNoteEditor(); return void showToast('Ghi chú này vừa bị sửa — bấm lại vào ghi chú rồi sửa nhé.', 'info', 2800); }
        sp.setAttribute('data-note', note);
        pulse(sp);
        fireInput(sp.closest('[data-live-edit]') || ctx.node);
    } else if (note) {
        const node = ctx.node.isConnected ? ctx.node : document.querySelector(`[data-live-edit="${CSS.escape(ctx.key)}"]`);
        if (!node) { closeNoteEditor(); return void showToast('Ô này vừa được vẽ lại — chọn chữ rồi ghi chú lại nhé.', 'info', 2800); }
        let { start, end } = ctx;
        const full = node.textContent;
        if (full.slice(start, end) !== ctx.raw) {   // có người vừa sửa ô này -> dò lại đúng cụm chữ, gần chỗ cũ nhất
            const at = nearestIndex(full, ctx.raw, start);
            if (at < 0) { closeNoteEditor(); return void showToast('Đoạn chữ này vừa bị sửa — chọn lại rồi ghi chú nhé.', 'info', 2800); }
            start = at; end = at + ctx.raw.length;
        }
        const sp = wrapOffsets(node, start, end, note);
        if (!sp) { closeNoteEditor(); return void showToast('Không ghi chú được ở chỗ này — chọn chữ trong một đoạn nhé.', 'info', 2800); }
        pulse(sp);
        fireInput(node);
    }
    closeNoteEditor();
}

function remove() {
    if (!ed) return;
    const { ctx } = ed;
    if (ctx.mode === 'edit') {
        const sp = findSpan(ctx);
        if (sp) {
            const node = sp.closest('[data-live-edit]') || ctx.node;
            // Bản 69: xóa ghi chú là xóa của CẢ PHÒNG và không hỏi lại -> có thanh Hoàn tác (dựng lại đúng cụm chữ + ghi chú cũ)
            const keep = { raw: sp.textContent, note: sp.getAttribute('data-note') || '', start: offsetIn(node, sp, 0), key: node.dataset.liveEdit };
            sp.replaceWith(...sp.childNodes);
            node.normalize();
            fireInput(node);
            showUndo('Đã xóa ghi chú', () => restore(node, keep));
        }
    }
    closeNoteEditor();
}

/** Hoàn tác xóa: bọc lại đúng cụm chữ (dò lại gần chỗ cũ nếu người khác vừa sửa ô). */
function restore(node, { raw, note, start, key }) {
    const n = node.isConnected ? node : document.querySelector(`[data-live-edit="${CSS.escape(key)}"]`);
    if (!n || !raw || !note) return void showToast('Không khôi phục được ghi chú — ô đã đổi.', 'info', 2600);
    const full = n.textContent;
    let at = start;
    if (at < 0 || full.slice(at, at + raw.length) !== raw) at = nearestIndex(full, raw, Math.max(0, start));
    const sp = at < 0 ? null : wrapOffsets(n, at, at + raw.length, note);
    if (!sp) return void showToast('Không khôi phục được ghi chú — chữ đã bị sửa.', 'info', 2600);
    pulse(sp);
    fireInput(n);
}

/** Chip vừa lưu bật ra như dán nhãn (class tự gỡ sau hoạt ảnh). */
function pulse(sp) {
    sp.classList.add('is-new');
    setTimeout(() => sp.classList.remove('is-new'), 800);
}
