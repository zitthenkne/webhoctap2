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
// + BẢNG (bản 28) và tiêu đề nhỏ H4 / đường kẻ HR cho mở rộng · ghi nhớ · ghi chú.
const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'MARK', 'CODE', 'BR', 'DIV', 'P', 'UL', 'OL', 'LI', 'SUB', 'SUP', 'SPAN', 'IMG', 'A',
    'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'H4', 'HR']);
const TABLE_TAGS = new Set(['TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD']);
// Bỏ HẲN cả nội dung (không gỡ thẻ giữ chữ): dán từ Excel / Word có <style> — gỡ thẻ là lộ nguyên đống CSS thành chữ
const DROP = new Set(['STYLE', 'SCRIPT', 'META', 'TITLE', 'LINK', 'HEAD', 'NOSCRIPT', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'CANVAS', 'XML', 'COLGROUP', 'COL']);
// Bút dạ pastel: 4 màu, lưu thành <mark data-c="…"> (sanitize giữ đúng 4 giá trị này, bỏ mọi style lạ)
const HL = {
    y: { bg: '#FFF3A8', rgb: 'rgb(255, 243, 168)', name: 'vàng chanh' },
    p: { bg: '#FFD6E7', rgb: 'rgb(255, 214, 231)', name: 'hồng đào' },
    g: { bg: '#CDF3E1', rgb: 'rgb(205, 243, 225)', name: 'xanh bạc hà' },
    v: { bg: '#E4DAFF', rgb: 'rgb(228, 218, 255)', name: 'tím oải hương' },
};
const HL_BY_RGB = Object.fromEntries(Object.entries(HL).map(([k, v]) => [v.rgb, k]));
const FORMAT_BTNS = [
    { cmd: 'bold', icon: 'fa-bold', title: 'In đậm (Ctrl+B)' },
    { cmd: 'italic', icon: 'fa-italic', title: 'In nghiêng (Ctrl+I)' },
    { cmd: 'underline', icon: 'fa-underline', title: 'Gạch chân (Ctrl+U)' },
    ...Object.entries(HL).map(([k, v]) => ({ cmd: 'hl:' + k, dot: k, title: `Bút dạ ${v.name}` })),
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
    const tw = document.createTreeWalker(box, NodeFilter.SHOW_COMMENT);   // <!--StartFragment--> của Word/Excel
    const comments = [];
    while (tw.nextNode()) comments.push(tw.currentNode);
    comments.forEach(c => c.remove());
    box.querySelectorAll('*').forEach(node => {
        const tag = node.tagName.toUpperCase();          // svg / o:p … có tagName chữ thường
        if (DROP.has(tag)) { node.remove(); return; }
        // Chỗ giữ ảnh đang tải (⏳) không bao giờ được lưu lên Firestore
        if (node.hasAttribute('data-uploading')) { node.remove(); return; }
        // Bút dạ của trình duyệt ra <span style="background-color:…"> -> đổi thành <mark data-c="màu">.
        // DỜI chính các node con sang (append), đừng chép innerHTML: bản chép là node MỚI không nằm
        // trong danh sách đang duyệt -> lọt qua bộ lọc (vd. <img onerror> ai đó ghi thẳng lên Firestore).
        const bg = node.style?.backgroundColor;
        // (chỉ thẻ chữ SPAN/FONT — ô bảng Excel tô nền mà đổi thành mark là vỡ cả bảng)
        if (bg && bg !== 'transparent' && (tag === 'SPAN' || tag === 'FONT')) {
            const mark = document.createElement('mark');
            if (HL_BY_RGB[bg]) mark.dataset.c = HL_BY_RGB[bg];
            mark.append(...node.childNodes);
            node.replaceWith(mark);
            return;
        }
        const c = tag === 'MARK' ? (HL_BY_RGB[bg] || node.getAttribute('data-c')) : null;
        if (!ALLOWED.has(tag)) {
            node.replaceWith(...node.childNodes);   // bỏ thẻ lạ, giữ chữ bên trong
            return;
        }
        const src = node.tagName === 'IMG' ? safeImgUrl(node.getAttribute('src')) : '';
        const href = node.tagName === 'A' ? node.getAttribute('href') || '' : '';
        // Ô gộp của bảng: giữ colspan / rowspan (số nhỏ), còn lại bỏ sạch thuộc tính
        const span = TABLE_TAGS.has(tag) ? ['colspan', 'rowspan'].map(a => [a, node.getAttribute(a)])
            .filter(([, v]) => /^\d{1,2}$/.test(v || '') && +v > 1 && +v <= 20) : [];
        [...node.attributes].forEach(a => node.removeAttribute(a.name));
        span.forEach(([a, v]) => node.setAttribute(a, v));
        if (c && HL[c]) node.setAttribute('data-c', c);
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
    const looksHtml = /<(b|strong|i|em|u|mark|code|br|div|p|ul|ol|li|span|img|a|table|h4|hr)\b/i.test(v);
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
        // Chèn chỗ giữ bằng Range (không qua execCommand('insertHTML')): chèn trong mục danh sách / ô bảng,
        // Chrome làm rơi data-uploading -> ảnh tải xong không tìm được chỗ, còn "Đang tải ảnh…" bị lưu thành chữ.
        const holder = document.createElement('span');
        holder.className = 'rm-upl';
        holder.dataset.uploading = id;
        holder.contentEditable = 'false';
        holder.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i><span> Đang tải ảnh…</span>';
        const sel = window.getSelection();
        let rg = sel.rangeCount ? sel.getRangeAt(0) : null;
        if (!rg || !node.contains(rg.startContainer)) { rg = document.createRange(); rg.selectNodeContents(node); rg.collapse(false); }
        rg.deleteContents();
        rg.insertNode(holder);
        const gap = document.createTextNode(' ');
        holder.after(gap);
        rg = document.createRange();
        rg.setStartAfter(gap);
        rg.collapse(true);
        sel.removeAllRanges();
        sel.addRange(rg);
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

/** Ô sửa "trống" = không chữ VÀ không ảnh (lý do chỉ có một tấm ảnh vẫn là lý do — đừng đè chữ mờ lên). */
export const isBlank = (node) => !node.textContent.trim() && !node.querySelector('img');

// Đặt con trỏ ở CUỐI ô sửa nếu con trỏ đang không nằm trong ô (bấm nút ngoài ô rồi mới chèn)
function caretIn(node) {
    node.focus({ preventScroll: true });
    const sel = window.getSelection();
    if (sel.rangeCount && node.contains(sel.anchorNode)) return;
    const r = document.createRange();
    r.selectNodeContents(node);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
}
/** Nút 🖼 cạnh một ô sửa (điện thoại không có Ctrl+V): chèn ảnh vào đúng ô đó. */
export function insertImagesInto(node, files) {
    const list = [...(files || [])].filter(f => /^image\//.test(f.type)).slice(0, 4);
    if (!node || !list.length) return;
    caretIn(node);
    insertImages(node, list);
}
/** Chèn một mẩu HTML (mẫu câu "🔬 Cơ chế:" …) vào ô sửa, xuống dòng nếu ô đã có chữ, rồi lưu như đang gõ. */
export function insertHtmlInto(node, html) {
    if (!node) return;
    const blank = isBlank(node);
    caretIn(node);
    document.execCommand('insertHTML', false, (blank ? '' : '<br>') + html);
    node.dispatchEvent(new Event('input', { bubbles: true }));
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
        if (cmd.startsWith('hl:')) {
            const bg = HL[cmd.slice(3)]?.bg || HL.y.bg;
            if (!document.execCommand('hiliteColor', false, bg)) document.execCommand('backColor', false, bg);
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
            `<button type="button" data-cmd="${b.cmd}" class="rm-selbtn" title="${b.title}">${b.dot
                ? `<span class="rm-hl-dot" data-c="${b.dot}"></span>` : `<i class="fas ${b.icon}"></i>`}</button>`).join('');
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
        node.dataset.empty = isBlank(node) ? '1' : '0';
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
        // BẢNG (bản 28): Excel / Word / Google Sheets gửi kèm HTML có <table> -> giữ nguyên bảng (đã lọc sạch);
        // chỉ có chữ phân cách bằng Tab (Excel dán dạng chữ) -> dựng bảng. Ô đơn lẻ thì vẫn dán chữ thường.
        if (!/^(question$|opttext:)/.test(node.dataset.liveEdit || '')) {
            const html = cd.getData('text/html');
            if (/<table[\s>]/i.test(html)) {
                const clean = sanitizeHtml(html);
                if ((clean.match(/<t[dh][\s>]/gi) || []).length > 1) {
                    document.execCommand('insertHTML', false, clean + '<p><br></p>');
                    return;
                }
            }
            const rows = text.replace(/\r/g, '').replace(/\n+$/, '').split('\n');
            if (rows.length >= 2 && rows.every(r => r.includes('\t'))) {
                const esc = (s) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
                const tr = (r, tag) => `<tr>${r.split('\t').map(c => `<${tag}>${esc(c.trim()) || '<br>'}</${tag}>`).join('')}</tr>`;
                document.execCommand('insertHTML', false,
                    `<table><thead>${tr(rows[0], 'th')}</thead><tbody>${rows.slice(1).map(r => tr(r, 'td')).join('')}</tbody></table><p><br></p>`);
                return;
            }
        }
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
