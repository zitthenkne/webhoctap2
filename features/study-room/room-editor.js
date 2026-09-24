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
import { showToast } from '../../core/utils.js';
import { uploadImage, imageFilesOf, safeImgUrl, warnIfTemp } from './room-media.js';
import { effectiveIndex } from './room-quiz-stage.js';

// Thẻ được phép giữ lại khi lưu (đủ để in đậm/nghiêng/gạch chân/bôi vàng/danh sách)
// + ẢNH (chỉ giữ src https / ảnh nhúng) và LINK (chỉ giữ href http/https) cho phần tài liệu.
const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'MARK', 'CODE', 'BR', 'DIV', 'P', 'UL', 'OL', 'LI', 'SUB', 'SUP', 'SPAN', 'IMG', 'A']);
const FORMAT_BTNS = [
    { cmd: 'bold', icon: 'fa-bold', title: 'In đậm (Ctrl+B)' },
    { cmd: 'italic', icon: 'fa-italic', title: 'In nghiêng (Ctrl+I)' },
    { cmd: 'underline', icon: 'fa-underline', title: 'Gạch chân (Ctrl+U)' },
    { cmd: 'hilite', icon: 'fa-highlighter', title: 'Bôi vàng' },
    { cmd: 'insertUnorderedList', icon: 'fa-list-ul', title: 'Gạch đầu dòng' },
    { cmd: 'removeFormat', icon: 'fa-eraser', title: 'Xóa định dạng' },
    // Không phải định dạng: gắn đoạn đang bôi đen vào ô nhận xét (room-answer.js) — nhận xét đúng đoạn đó
    { cmd: 'comment', icon: 'fa-comment-dots', title: 'Nhận xét đoạn này' },
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
        // Chỗ giữ ảnh đang tải (⏳) không bao giờ được lưu lên Firestore
        if (node.hasAttribute('data-uploading')) { node.remove(); return; }
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
        const src = node.tagName === 'IMG' ? safeImgUrl(node.getAttribute('src')) : '';
        const href = node.tagName === 'A' ? node.getAttribute('href') || '' : '';
        [...node.attributes].forEach(a => node.removeAttribute(a.name));
        if (node.tagName === 'IMG') {
            if (!src) return void node.remove();
            node.setAttribute('src', src);
            node.setAttribute('alt', 'Ảnh minh họa');
        } else if (node.tagName === 'A') {
            if (!/^https?:\/\/\S+$/i.test(href)) return void node.replaceWith(...node.childNodes);
            node.setAttribute('href', href);
            node.setAttribute('target', '_blank');
            node.setAttribute('rel', 'noopener noreferrer');
        }
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
    const looksHtml = /<(b|strong|i|em|u|mark|code|br|div|p|ul|ol|li|span|img|a)\b/i.test(v);
    return looksHtml ? sanitizeHtml(v) : parseMarkdown(v);
}

/** extra: { qi, appendHtml } — nối thêm vào nội dung ĐANG LƯU của câu qi (dùng khi ảnh tải xong
 *  mà ô sửa đã bị vẽ lại / người dùng đã sang câu khác). */
function fire(key, html, extra = {}) {
    window.dispatchEvent(new CustomEvent('room:edit', { detail: { key, html, ...extra } }));
}

// ---------- Dán / kéo thả ẢNH vào ô đang sửa ----------
// Chèn chỗ giữ "⏳ Đang tải ảnh…" đúng vị trí con trỏ, tải lên host ngoài (room-media.js),
// xong thay bằng <img>. Chỗ giữ bị sanitize bỏ qua nên lỡ lưu giữa chừng cũng không dính.
async function insertImages(node, files) {
    const key = node.dataset.liveEdit;
    const qi = effectiveIndex();
    for (const file of files) {
        const id = 'up' + Math.random().toString(36).slice(2, 9);
        document.execCommand('insertHTML', false,
            `<span class="rm-upl" data-uploading="${id}" contenteditable="false"><i class="fas fa-circle-notch fa-spin"></i><span> Đang tải ảnh…</span></span>&nbsp;`);
        let res;
        try {
            res = await uploadImage(file, (x) => {
                const t = document.querySelector(`[data-uploading="${id}"] span`);
                if (t) t.textContent = ` Đang tải ảnh… ${Math.round(x * 100)}%`;
            });
        } catch (err) {
            document.querySelector(`[data-uploading="${id}"]`)?.remove();
            showToast('Không tải được ảnh — kiểm tra mạng rồi dán lại nhé.', 'error');
            continue;
        }
        warnIfTemp(res);
        const img = `<img src="${res.u}" alt="Ảnh minh họa">`;
        const ph = document.querySelector(`[data-uploading="${id}"]`);
        const host = ph?.closest('[data-live-edit]');
        if (ph && host) {
            ph.outerHTML = img;
            host.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            fire(key, null, { qi, appendHtml: `<p>${img}</p>` });
        }
    }
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
    if (cmd === 'comment') {
        const t = sel.toString().replace(/\s+/g, ' ').trim();
        hideToolbar();
        if (t) window.dispatchEvent(new CustomEvent('room:quote', { detail: { text: t, key: node.dataset.liveEdit } }));
        return;
    }
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

    // Dán: ảnh trong bộ nhớ tạm (Ctrl+V ảnh chụp màn hình / "Sao chép hình ảnh") -> tải lên host;
    // còn lại dán CHỮ TRƠN, bỏ định dạng lạ của Word/web.
    // Có cả chữ lẫn ảnh (copy từ Word/Excel) thì ưu tiên chữ — kẻo lỡ tay đẩy ảnh chụp bảng lên mạng.
    document.addEventListener('paste', (e) => {
        const node = e.target.closest?.('[data-live-edit]');
        if (!node) return;
        e.preventDefault();
        const cd = e.clipboardData || window.clipboardData;
        const text = cd.getData('text/plain');
        const imgs = imageFilesOf(cd);
        if (imgs.length && !text.trim()) return void insertImages(node, imgs);
        document.execCommand('insertText', false, text);
    });
    // Kéo ảnh từ máy thả thẳng vào ô đang sửa
    document.addEventListener('dragover', (e) => {
        if (e.target.closest?.('[data-live-edit]') && [...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault();
    });
    document.addEventListener('drop', (e) => {
        const node = e.target.closest?.('[data-live-edit]');
        const imgs = imageFilesOf(e.dataTransfer);
        if (!node || !imgs.length) return;
        e.preventDefault();
        node.focus();
        const r = document.caretRangeFromPoint?.(e.clientX, e.clientY);
        if (r && node.contains(r.startContainer)) { const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
        insertImages(node, imgs);
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
