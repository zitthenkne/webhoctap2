// room-editor.js — SỬA TẠI CHỖ (WYSIWYG) cho cả phòng.
// Không có cửa sổ soạn thảo riêng nữa: bấm thẳng vào chỗ đang hiển thị (câu hỏi,
// phương án, giải thích, ghi chú…) là gõ được luôn; bôi đen chữ thì hiện thanh
// nhỏ để in đậm / in nghiêng / gạch chân / bôi vàng. Gõ tới đâu tự lưu tới đó,
// mọi người trong phòng thấy ngay.
//
// Cách hoạt động: vùng sửa được là phần tử có [data-live-edit="<khóa>"] và
// contenteditable. Mỗi lần gõ (chờ 400ms cho êm) file này bắn sự kiện
// window 'room:edit' kèm {key, html} — sân khấu bắt lấy rồi ghi lên Firestore.
import { parseMarkdown, renderMath } from '../quiz/quiz-helpers.js';

// Thẻ được phép giữ lại khi lưu (đủ để in đậm/nghiêng/gạch chân/bôi vàng/danh sách)
const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'MARK', 'CODE', 'BR', 'DIV', 'P', 'UL', 'OL', 'LI', 'SUB', 'SUP', 'SPAN']);
const FORMAT_BTNS = [
    { cmd: 'bold', icon: 'fa-bold', title: 'In đậm (Ctrl+B)' },
    { cmd: 'italic', icon: 'fa-italic', title: 'In nghiêng (Ctrl+I)' },
    { cmd: 'underline', icon: 'fa-underline', title: 'Gạch chân (Ctrl+U)' },
    { cmd: 'hilite', icon: 'fa-highlighter', title: 'Bôi vàng' },
    { cmd: 'insertUnorderedList', icon: 'fa-list-ul', title: 'Gạch đầu dòng' },
    { cmd: 'removeFormat', icon: 'fa-eraser', title: 'Xóa định dạng' },
];

let editingKey = null;
// Bôi đen bằng chuột cho text node, còn Ctrl+A / nhấp 3 lần lại trả về chính thẻ div
const editNodeOf = (n) => {
    const e = n && n.nodeType === 3 ? n.parentElement : n;
    return (e && e.closest) ? e.closest('[data-live-edit]') : null;
};
let saveTimer = null;
const el = (id) => document.getElementById(id);

export const currentEditKey = () => editingKey;

/** Dọn HTML người dùng dán/gõ vào: chỉ giữ thẻ định dạng, bỏ sạch thuộc tính. */
export function sanitizeHtml(html) {
    const box = document.createElement('div');
    box.innerHTML = String(html || '');
    box.querySelectorAll('*').forEach(node => {
        // Bôi vàng của trình duyệt ra <span style="background-color:…"> -> đổi thành <mark>
        const hasBg = node.style && node.style.backgroundColor && node.style.backgroundColor !== 'transparent';
        if (hasBg && node.tagName !== 'MARK') {
            const mark = document.createElement('mark');
            mark.innerHTML = node.innerHTML;
            node.replaceWith(mark);
            return;
        }
        if (!ALLOWED.has(node.tagName)) {
            node.replaceWith(...node.childNodes);   // bỏ thẻ lạ, giữ chữ bên trong
            return;
        }
        [...node.attributes].forEach(a => node.removeAttribute(a.name));
    });
    return box.innerHTML
        .replace(/<div><br><\/div>/g, '<br>')
        .replace(/(&nbsp;|\s)+$/g, '')
        .trim();
}

/** Nội dung của phòng có thể là HTML (sửa tại chỗ) hoặc Markdown (từ file đề). */
export function renderRich(text) {
    const v = String(text ?? '');
    if (!v.trim()) return '';
    const looksHtml = /<(b|strong|i|em|u|mark|code|br|div|p|ul|ol|li|span)\b/i.test(v);
    return looksHtml ? sanitizeHtml(v) : parseMarkdown(v);
}

function fire(key, html) {
    window.dispatchEvent(new CustomEvent('room:edit', { detail: { key, html } }));
}

function saveNow(node) {
    if (!node) return;
    const key = node.dataset.liveEdit;
    const html = sanitizeHtml(node.innerHTML);
    if (node.dataset.lastSaved === html) return;
    node.dataset.lastSaved = html;
    fire(key, html);
    flashSaved(node);
}

function flashSaved(node) {
    const tag = node.closest('[data-live-wrap]')?.querySelector('[data-live-status]');
    if (!tag) return;
    tag.textContent = 'Đã lưu';
    tag.classList.add('on');
    clearTimeout(tag._t);
    tag._t = setTimeout(() => tag.classList.remove('on'), 1400);
}

// ---------- Thanh định dạng nổi khi bôi đen ----------
function hideToolbar() { el('sel-toolbar')?.classList.remove('show'); }

function showToolbarFor(range) {
    const bar = el('sel-toolbar');
    if (!bar) return;
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) return hideToolbar();
    bar.classList.add('show');
    const bw = bar.offsetWidth, bh = bar.offsetHeight;
    let x = rect.left + rect.width / 2 - bw / 2;
    x = Math.max(8, Math.min(x, window.innerWidth - bw - 8));
    let y = rect.top - bh - 10;
    if (y < 8) y = rect.bottom + 10;              // sát mép trên thì lật xuống dưới
    bar.style.left = `${x}px`;
    bar.style.top = `${y}px`;
}

function syncToolbarState() {
    const bar = el('sel-toolbar');
    if (!bar) return;
    ['bold', 'italic', 'underline'].forEach(cmd => {
        let on = false;
        try { on = document.queryCommandState(cmd); } catch (e) {}
        bar.querySelector(`[data-cmd="${cmd}"]`)?.classList.toggle('on', on);
    });
}

function applyCommand(cmd) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const node = editNodeOf(sel.anchorNode) || editNodeOf(sel.focusNode);
    if (!node) return;
    try {
        if (cmd === 'hilite') {
            if (!document.execCommand('hiliteColor', false, '#FFF3A8')) {
                document.execCommand('backColor', false, '#FFF3A8');
            }
        } else {
            document.execCommand(cmd, false, null);
        }
    } catch (e) { /* trình duyệt cũ thì thôi */ }
    node.dispatchEvent(new Event('input', { bubbles: true }));
    syncToolbarState();
}

export function initInlineEdit() {
    // Ép trình duyệt sinh thẻ <b>/<i>/<u> thay vì <span style> (sanitize sẽ giữ được)
    try { document.execCommand('styleWithCSS', false, false); } catch (e) {}
    const bar = el('sel-toolbar');
    if (bar) {
        bar.innerHTML = FORMAT_BTNS.map(b =>
            `<button type="button" data-cmd="${b.cmd}" class="rm-selbtn" title="${b.title}"><i class="fas ${b.icon}"></i></button>`).join('');
        // mousedown + preventDefault để không mất vùng bôi đen khi bấm nút
        bar.addEventListener('mousedown', (e) => {
            const b = e.target.closest('[data-cmd]');
            if (!b) return;
            e.preventDefault();
            applyCommand(b.dataset.cmd);
        });
    }

    // Vào / rời vùng sửa
    document.addEventListener('focusin', (e) => {
        const node = e.target.closest?.('[data-live-edit]');
        editingKey = node ? node.dataset.liveEdit : null;
        if (node) node.dataset.lastSaved = sanitizeHtml(node.innerHTML);
    });
    document.addEventListener('focusout', (e) => {
        const node = e.target.closest?.('[data-live-edit]');
        if (!node) return;
        clearTimeout(saveTimer);
        saveNow(node);
        editingKey = null;
        setTimeout(hideToolbar, 120);
    });

    // Gõ tới đâu lưu tới đó
    document.addEventListener('input', (e) => {
        const node = e.target.closest?.('[data-live-edit]');
        if (!node) return;
        node.dataset.empty = node.textContent.trim() ? '0' : '1';
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => saveNow(node), 400);
    });

    // Phím tắt + Esc để thoát vùng sửa
    document.addEventListener('keydown', (e) => {
        const node = e.target.closest?.('[data-live-edit]');
        if (!node) return;
        if (e.key === 'Escape') { e.preventDefault(); node.blur(); return; }
        if ((e.ctrlKey || e.metaKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
            e.preventDefault();
            applyCommand({ b: 'bold', i: 'italic', u: 'underline' }[e.key.toLowerCase()]);
        }
    });

    // Dán chữ: bỏ định dạng lạ của Word/web
    document.addEventListener('paste', (e) => {
        const node = e.target.closest?.('[data-live-edit]');
        if (!node) return;
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, text);
    });

    // Bôi đen -> hiện thanh định dạng
    const onSelect = () => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return hideToolbar();
        const node = editNodeOf(sel.anchorNode) || editNodeOf(sel.focusNode);
        if (!node) return hideToolbar();
        showToolbarFor(sel.getRangeAt(0));
        syncToolbarState();
    };
    document.addEventListener('mouseup', () => setTimeout(onSelect, 10));
    document.addEventListener('keyup', (e) => { if (e.shiftKey || e.key.startsWith('Arrow')) onSelect(); });
    document.addEventListener('selectionchange', () => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) hideToolbar();
    });
    window.addEventListener('scroll', hideToolbar, true);
}

/** Vẽ lại công thức toán trong một vùng vừa được cập nhật. */
export function renderRichMath(node) {
    try { renderMath(node); } catch (e) {}
}
