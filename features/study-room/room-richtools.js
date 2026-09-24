// room-richtools.js — THANH SOẠN THẢO khi đang gõ trong một ô sửa (bản 28).
//  · 🖼 Ảnh · ▦ Bảng (rê chọn kích thước như Word) · • gạch đầu dòng · 1. đánh số · H tiêu đề nhỏ.
//  · Con trỏ nằm trong bảng: + hàng · + cột · − hàng · − cột · 🗑 xoá bảng; Tab / Shift+Tab đi ô, Tab ở ô
//    cuối tự thêm hàng (như Word / Google Docs).
//  · Gõ tắt kiểu Notion ở ĐẦU dòng: "- " hoặc "* " gạch đầu dòng · "1. " đánh số · "# " tiêu đề nhỏ.
// Áp cho mọi ô sửa giàu định dạng (giải thích, mở rộng, ghi nhớ, ghi chú của tôi, báo lỗi, lý do, giải thích
// phương án, bài làm chung). Câu hỏi / chữ phương án giữ gọn -> không hiện thanh.
// Dán bảng từ Excel / Word / Google Sheets: xem room-editor.js (paste).
import { insertImagesInto } from './room-editor.js';

const NO_TOOLS = /^(question$|opttext:)/;
let bar = null;
let grid = null;
let fileIn = null;
let cur = null;           // ô sửa đang có thanh
let last = null;          // ô sửa gần nhất (hộp chọn ảnh làm mất focus)

const liveEditOf = (n) => { const e = n?.nodeType === 3 ? n.parentElement : n; return e?.closest?.('[data-live-edit]') || null; };
function cellAt() {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !cur) return null;
    let n = sel.anchorNode;
    n = n?.nodeType === 3 ? n.parentElement : n;
    const td = n?.closest?.('td, th');
    return td && cur.contains(td) ? td : null;
}
function caretInto(node, end = false) {
    const r = document.createRange();
    r.selectNodeContents(node);
    r.collapse(!end);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
}
const changed = () => cur?.dispatchEvent(new Event('input', { bubbles: true }));
const newCell = (tag = 'td') => { const c = document.createElement(tag); c.innerHTML = '<br>'; return c; };

// ---------- Bảng ----------
function insertTable(rows, cols) {
    if (!cur) return;
    const row = (tag) => `<tr>${`<${tag}><br></${tag}>`.repeat(cols)}</tr>`;
    const body = Array.from({ length: Math.max(1, rows - 1) }, () => row('td')).join('');
    cur.focus({ preventScroll: true });
    document.execCommand('insertHTML', false, `<table data-new="1"><thead>${row('th')}</thead><tbody>${body}</tbody></table><p><br></p>`);
    const t = cur.querySelector('table[data-new]');
    if (t) { t.removeAttribute('data-new'); caretInto(t.rows[0].cells[0]); }
    changed();
    place();
}
function tableOp(op) {
    const td = cellAt();
    if (!td) return;
    const tr = td.parentElement;
    const table = td.closest('table');
    const idx = td.cellIndex;
    if (op === 'tdel') { const after = table.nextElementSibling; table.remove(); if (after) caretInto(after); return; }
    if (op === 'row+') {
        const nr = document.createElement('tr');
        [...tr.cells].forEach(() => nr.appendChild(newCell('td')));
        // hàng tiêu đề -> hàng mới là hàng đầu của phần thân
        if (tr.parentElement.tagName === 'THEAD') {
            const tb = table.tBodies[0] || table.appendChild(document.createElement('tbody'));
            tb.prepend(nr);
        } else tr.after(nr);
        return void caretInto(nr.cells[Math.min(idx, nr.cells.length - 1)]);
    }
    if (op === 'col+') {
        [...table.rows].forEach(r => {
            const ref = r.cells[Math.min(idx, r.cells.length - 1)];
            const c = newCell(ref?.tagName === 'TH' ? 'th' : 'td');
            if (ref) ref.after(c); else r.appendChild(c);
        });
        return void caretInto(tr.cells[idx + 1] || td);
    }
    if (op === 'row-') {
        if (table.rows.length <= 1) return tableOp('tdel');
        const next = tr.nextElementSibling || tr.previousElementSibling;
        const sec = tr.parentElement;
        tr.remove();
        if (!sec.rows.length) sec.remove();
        const target = next?.cells?.[Math.min(idx, next.cells.length - 1)] || table.rows[0]?.cells[0];
        if (target) caretInto(target);
        return;
    }
    if (op === 'col-') {
        const most = Math.max(...[...table.rows].map(r => r.cells.length));
        if (most <= 1) return tableOp('tdel');
        [...table.rows].forEach(r => r.cells[Math.min(idx, r.cells.length - 1)]?.remove());
        const target = tr.cells[Math.max(0, idx - 1)];
        if (target) caretInto(target);
    }
}

// ---------- Thanh + hộp chọn kích thước bảng ----------
function paintGrid(r, c) {
    grid.querySelectorAll('[data-r]').forEach(n => n.classList.toggle('on', +n.dataset.r <= r && +n.dataset.c <= c));
    grid.querySelector('.rm-tgrid-cap').textContent = `Bảng ${r} hàng × ${c} cột`;
}
function hideGrid() { grid?.classList.add('hidden'); }
function toggleGrid(btn) {
    if (!grid.classList.contains('hidden')) return hideGrid();
    grid.classList.remove('hidden');
    paintGrid(3, 3);
    const b = btn.getBoundingClientRect();
    const gw = grid.offsetWidth;
    const gh = grid.offsetHeight;
    let top = b.bottom + 6;
    if (top + gh > window.innerHeight - 8) top = b.top - gh - 6;
    grid.style.left = `${Math.max(8, Math.min(b.left, window.innerWidth - gw - 8))}px`;
    grid.style.top = `${Math.max(8, top)}px`;
}
function act(cmd, btn) {
    if (!cur) return;
    if (cmd === 'img') return void fileIn.click();
    if (cmd === 'table') return void toggleGrid(btn);
    hideGrid();
    try {
        if (cmd === 'ul') document.execCommand('insertUnorderedList');
        else if (cmd === 'ol') document.execCommand('insertOrderedList');
        else if (cmd === 'h') {
            let n = window.getSelection()?.anchorNode;
            n = n?.nodeType === 3 ? n.parentElement : n;
            document.execCommand('formatBlock', false, n?.closest?.('h4') && cur.contains(n) ? '<p>' : '<h4>');
        } else tableOp(cmd);
    } catch (e) { /* trình duyệt cũ */ }
    changed();
    place();
}
function build() {
    bar = document.createElement('div');
    bar.id = 'edit-toolbar';
    bar.className = 'rm-edtool';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Chèn vào ô đang sửa');
    bar.innerHTML = `
        <button type="button" data-ed="img" title="Chèn ảnh (hoặc Ctrl+V / kéo thả vào ô)"><i class="fas fa-image"></i><span>Ảnh</span></button>
        <button type="button" data-ed="table" title="Chèn bảng — dán thẳng bảng từ Excel / Word cũng được"><b class="rm-edtool-ic">▦</b><span>Bảng</span></button>
        <button type="button" data-ed="ul" title="Gạch đầu dòng — hoặc gõ &quot;- &quot; ở đầu dòng"><i class="fas fa-list-ul"></i></button>
        <button type="button" data-ed="ol" title="Đánh số — hoặc gõ &quot;1. &quot; ở đầu dòng"><b class="rm-edtool-ic">1.</b></button>
        <button type="button" data-ed="h" title="Tiêu đề nhỏ — hoặc gõ &quot;# &quot; ở đầu dòng"><b class="rm-edtool-ic">H</b></button>
        <span class="rm-edtool-tbl">
            <i class="rm-edtool-sep"></i>
            <button type="button" data-ed="row+" title="Thêm hàng bên dưới (Tab ở ô cuối cũng thêm hàng)">+ Hàng</button>
            <button type="button" data-ed="col+" title="Thêm cột bên phải">+ Cột</button>
            <button type="button" data-ed="row-" title="Xoá hàng này">− Hàng</button>
            <button type="button" data-ed="col-" title="Xoá cột này">− Cột</button>
            <button type="button" data-ed="tdel" title="Xoá cả bảng">🗑</button>
        </span>`;
    grid = document.createElement('div');
    grid.className = 'rm-tgrid hidden';
    grid.innerHTML = `<p class="rm-tgrid-cap">Bảng 3 hàng × 3 cột</p><div class="rm-tgrid-cells">${Array.from({ length: 36 }, (_, n) =>
        `<i data-r="${Math.floor(n / 6) + 1}" data-c="${(n % 6) + 1}"></i>`).join('')}</div><p class="rm-tgrid-hint">Hàng đầu là hàng tiêu đề</p>`;
    fileIn = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    document.body.append(bar, grid, fileIn);
    // mousedown + preventDefault: giữ con trỏ / vùng chọn trong ô đang sửa
    bar.addEventListener('mousedown', (e) => {
        const b = e.target.closest('[data-ed]');
        if (!b) return;
        e.preventDefault();
        act(b.dataset.ed, b);
    });
    grid.addEventListener('mousedown', (e) => e.preventDefault());
    grid.addEventListener('mouseover', (e) => { const c = e.target.closest('[data-r]'); if (c) paintGrid(+c.dataset.r, +c.dataset.c); });
    grid.addEventListener('click', (e) => {
        const c = e.target.closest('[data-r]');
        if (!c) return;
        hideGrid();
        insertTable(+c.dataset.r, +c.dataset.c);
    });
    fileIn.addEventListener('change', () => {
        const target = cur || last;
        if (target?.isConnected) insertImagesInto(target, fileIn.files);
        fileIn.value = '';
    });
}

// Thanh nằm ngay DƯỚI góc phải ô đang sửa; ô dài quá màn thì dính mép dưới màn hình (vẫn trong tầm tay)
function place() {
    if (!bar) return;
    if (!cur || !cur.isConnected) return hide();
    bar.classList.toggle('in-table', !!cellAt());
    bar.classList.add('on');
    // Neo vào CẢ khung của ô ([data-live-wrap]: ô gõ + hàng mẫu câu + Xem thêm), không phải riêng ô gõ -> không đè hàng mẫu câu
    const r = (cur.closest('[data-live-wrap]') || cur).getBoundingClientRect();
    const vv = window.visualViewport;
    const vh = vv ? vv.height + vv.offsetTop : window.innerHeight;
    const bw = bar.offsetWidth;
    const bh = bar.offsetHeight;
    if (r.bottom < 0 || r.top > vh) return void bar.classList.remove('on');
    let top = Math.min(r.bottom + 6, vh - bh - 10);
    top = Math.max(top, Math.min(r.top + 4, vh - bh - 10), 8);
    const left = Math.max(8, Math.min(r.right - bw, window.innerWidth - bw - 8));
    // left/top (KHÔNG transform): hoạt ảnh bật lên giữ transform sau khi chạy xong -> đè mất vị trí, thanh kẹt góc 0,0
    bar.style.left = `${left}px`;
    bar.style.top = `${top}px`;
}
function hide() { bar?.classList.remove('on'); hideGrid(); }

export function initRichTools() {
    build();
    document.addEventListener('focusin', (e) => {
        const ed = e.target.closest?.('[data-live-edit]');
        if (!ed || NO_TOOLS.test(ed.dataset.liveEdit || '')) return;
        cur = last = ed;
        place();
    });
    document.addEventListener('focusout', (e) => {
        if (!cur || !(e.target === cur || cur.contains(e.target))) return;
        setTimeout(() => {
            if (cur && (cur.contains(document.activeElement) || document.activeElement === cur)) return;
            cur = null;
            hide();
        }, 160);
    });
    document.addEventListener('selectionchange', () => { if (cur) place(); });
    document.addEventListener('input', (e) => { if (cur && cur.contains(e.target)) requestAnimationFrame(place); });
    window.addEventListener('scroll', () => { if (cur) place(); }, true);
    window.addEventListener('resize', () => { if (cur) place(); });
    window.visualViewport?.addEventListener('resize', () => { if (cur) place(); });
    document.addEventListener('mousedown', (e) => { if (!e.target.closest('.rm-tgrid, [data-ed="table"]')) hideGrid(); });

    // Tab / Shift+Tab trong bảng: đi ô; Tab ở ô cuối -> thêm hàng
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab' || !cur) return;
        const td = cellAt();
        if (!td) return;
        e.preventDefault();
        const cells = [...td.closest('table').querySelectorAll('th, td')];
        const k = cells.indexOf(td) + (e.shiftKey ? -1 : 1);
        if (k >= cells.length) { tableOp('row+'); changed(); }
        else if (k >= 0) caretInto(cells[k], true);
        place();
    });

    // Gõ tắt kiểu Notion ở đầu dòng
    document.addEventListener('input', (e) => {
        if (e.inputType !== 'insertText' || e.data !== ' ') return;
        const ed = liveEditOf(e.target);
        if (!ed || NO_TOOLS.test(ed.dataset.liveEdit || '')) return;
        const sel = window.getSelection();
        if (!sel?.rangeCount || !sel.isCollapsed) return;
        const r = sel.getRangeAt(0);
        const tn = r.startContainer;
        if (tn.nodeType !== 3) return;
        const m = /^([-*•]|1[.)]|#)[\s ]$/.exec(tn.data.slice(0, r.startOffset));
        if (!m) return;
        const prev = tn.previousSibling;
        const par = tn.parentElement;
        const atStart = (!prev || prev.nodeName === 'BR') && (par === ed || /^(P|DIV)$/.test(par.tagName));
        if (!atStart || par.closest('li, td, th, h4')) return;
        tn.deleteData(0, r.startOffset);
        caretInto(tn);
        const k = m[1];
        if (k === '#') document.execCommand('formatBlock', false, '<h4>');
        else document.execCommand(/^1/.test(k) ? 'insertOrderedList' : 'insertUnorderedList');
    });
}
