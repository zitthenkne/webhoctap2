// room-editor.js — SỬA TẠI CHỖ (WYSIWYG) cho cả phòng.
// Không có cửa sổ soạn thảo riêng nữa: BẤM ĐÚP (chuột) / CHẠM ĐÚP (cảm ứng) vào chỗ đang hiển thị (câu hỏi,
// phương án, giải thích, ghi chú…) là gõ được luôn (bản 56: trước đây rê chuột là lộ ô sửa, bấm một cái là bật con trỏ
// + bàn phím ảo → hay bấm nhầm / sượt qua); bôi đen chữ thì hiện thanh
// nhỏ để in đậm / in nghiêng / gạch chân / bôi vàng. Gõ tới đâu tự lưu tới đó,
// mọi người trong phòng thấy ngay.
//
// Cách hoạt động: vùng sửa được là phần tử có [data-live-edit="<khóa>"] và
// contenteditable. Mỗi lần gõ (chờ 400ms cho êm) file này bắn sự kiện
// window 'room:edit' kèm {key, html} — sân khấu bắt lấy rồi ghi lên Firestore.
import { parseMarkdown, renderMath, configureMermaid, svgFigureHtml, SVG_MAX } from '../quiz/quiz-helpers.js';
import { showToast } from '../../core/utils.js';
import { uploadImage, imageFilesOf, safeImgUrl, warnIfTemp } from './room-media.js';
import { effectiveIndex } from './room-quiz-stage.js';

// Thẻ được phép giữ lại khi lưu (đủ để in đậm/nghiêng/gạch chân/bôi vàng/danh sách)
// + ẢNH (chỉ giữ src https / ảnh nhúng) và LINK (chỉ giữ href http/https) cho phần tài liệu.
// + BẢNG (bản 28) và tiêu đề nhỏ H4 / đường kẻ HR cho mở rộng · ghi nhớ · ghi chú.
const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'MARK', 'CODE', 'BR', 'DIV', 'P', 'UL', 'OL', 'LI', 'SUB', 'SUP', 'SPAN', 'IMG', 'A',
    'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'H4', 'HR']);
const TABLE_TAGS = new Set(['TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD']);
// Ghi chú cụm từ (bản 53): <span data-note="chữ ghi chú ngắn">cụm từ</span>. Chỉ giữ chữ trơn, bỏ ký tự điều khiển, tối đa 120 ký tự.
const NOTE_MAX_CHARS = 120;
// Ô nhận ghi chú cụm từ: chỉ những ô hiển thị bằng renderRich (nội dung HTML). Mục tiêu phòng / báo lỗi đề / tên ca là chữ trơn -> không.
const NOTE_OK = /^(question$|explain$|why$|note$|case$|part:|optexp:|opttext:|extra:)/;
const cleanNote = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX_CHARS);
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
    // Ghi chú NGẮN gắn vào cụm từ (bản 53): lưu thẳng trong nội dung <span data-note="…">, hiện ngay cạnh chữ, cả phòng thấy
    { cmd: 'note', icon: 'fa-note-sticky', title: 'Ghi chú cụm từ (hiện ngay cạnh chữ)' },
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

// ---------- Công thức (KaTeX) & sơ đồ (Mermaid) trong ô sửa tại chỗ ----------
// Ô sửa là contenteditable nên công thức / sơ đồ ĐÃ VẼ nằm luôn trong innerHTML. Trước đây lưu là qua
// sanitizeHtml: thẻ <math> bị gỡ còn chữ vụn ("x2x^2x2", mất dấu $), <svg> của sơ đồ bị xoá sạch -> sửa một
// chữ trong ô là HỎNG công thức, MẤT sơ đồ. Nay mọi đường lưu đều đổi ngược về mã nguồn trước:
//   công thức -> $…$ / $$…$$ (lấy từ <annotation> KaTeX cài sẵn) · sơ đồ -> <div data-mermaid="mã đã mã hoá">.
const MM_BOX = 'mermaid-container flex justify-center my-4 overflow-x-auto w-full bg-white/50 p-4 rounded-xl border border-pink-100/30 shadow-sm';
const MM_OK = /^[\w\-.!~*'()%]{1,20000}$/;       // đúng bộ ký tự encodeURIComponent sinh ra
const MM_CHARS = /^[\w\-.!~*'()%]+$/;
const texOf = (k) => k.querySelector('annotation[encoding="application/x-tex"]')?.textContent ?? null;
/** Đổi công thức đã vẽ trong `root` về chữ $…$ (tại chỗ). Trả về số công thức đã đổi. */
export function unrenderMath(root) {
    let n = 0;
    root.querySelectorAll('.katex-display, .katex, .katex-error').forEach(k => {
        if (!root.contains(k)) return;                            // đã nằm trong một khối vừa đổi
        const disp = k.classList.contains('katex-display') || !!k.closest('.katex-display');
        let box = k.closest('.katex-display') || k;
        // auto-render bọc thêm 1 <span> trần quanh mỗi công thức -> gỡ luôn, kẻo sửa bao nhiêu lần lồng bấy nhiêu lớp
        while (box.parentElement && box.parentElement !== root && box.parentElement.tagName === 'SPAN'
            && !box.parentElement.attributes.length && box.parentElement.childNodes.length === 1) box = box.parentElement;
        const tex = k.classList.contains('katex-error') ? k.textContent : texOf(k);
        if (tex == null) return;
        box.replaceWith(document.createTextNode(disp ? `$$${tex}$$` : `$${tex}$`));
        n++;
    });
    return n;
}
/** Đổi sơ đồ đã vẽ trong `root` về thẻ gọn <div data-mermaid> (tại chỗ). */
function unrenderDiagrams(root) {
    root.querySelectorAll('.mermaid-container, .mermaid, .mermaid-viewer').forEach(m => {
        if (!root.contains(m)) return;
        const src = m.matches('[data-code]') ? m : m.querySelector('[data-code]');
        const code = src?.getAttribute('data-code') || '';
        const box = m.closest('.mermaid-container') || m;
        if (!code || !MM_OK.test(code)) { box.remove(); return; }
        const d = document.createElement('div');
        d.setAttribute('data-mermaid', code);
        box.replaceWith(d);
    });
}
/** Hình SVG (khung .svg-fig của parseMarkdown, hiện qua <img data:>) -> <div data-svg="mã đã mã hoá"> khi lưu:
 *  sanitize bỏ ảnh data:image/svg (safeImgUrl chỉ nhận png/jpg/webp/gif) nên không đổi trước là MẤT HÌNH. */
const SVG_OK = (c) => typeof c === 'string' && c.length <= SVG_MAX * 3 && MM_CHARS.test(c);
function unrenderSvgs(root) {
    root.querySelectorAll('.svg-fig').forEach(f => {
        const code = f.getAttribute('data-svg') || '';
        if (!SVG_OK(code)) { f.remove(); return; }
        const d = document.createElement('div');
        d.setAttribute('data-svg', code);
        f.replaceWith(d);
    });
}
/** <div data-mermaid> / <div data-svg> (dạng lưu) -> khung sơ đồ / khung hình chuẩn của parseMarkdown. */
const expandDiagrams = (html) => html.replace(/<div data-mermaid="([^"]*)"><\/div>/g, (m, code) =>
    MM_OK.test(code) ? `<div class="${MM_BOX}"><div class="mermaid-viewer" data-code="${code}"></div></div>` : '')
    .replace(/<div data-svg="([^"]*)"><\/div>/g, (m, code) => {
        if (!SVG_OK(code)) return '';
        try { return svgFigureHtml(decodeURIComponent(code)); } catch (e) { return ''; }
    });
/** Khung sơ đồ mới (chèn từ thanh soạn thảo / hộp sửa sơ đồ). */
export const diagramHtml = (code) => `<div class="${MM_BOX}"><div class="mermaid-viewer" data-code="${encodeURIComponent(String(code || '').trim())}"></div></div>`;

/** Dọn HTML người dùng dán/gõ vào: chỉ giữ thẻ định dạng, bỏ sạch thuộc tính. */
export function sanitizeHtml(html) {
    const box = document.createElement('div');
    box.innerHTML = String(html || '');
    unrenderMath(box);
    unrenderDiagrams(box);
    unrenderSvgs(box);
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
        const nt = tag === 'SPAN' ? cleanNote(node.getAttribute('data-note')) : '';
        const mm = tag === 'DIV' ? node.getAttribute('data-mermaid') : null;
        const sv = tag === 'DIV' ? node.getAttribute('data-svg') : null;
        [...node.attributes].forEach(a => node.removeAttribute(a.name));
        if (mm && MM_OK.test(mm)) { node.setAttribute('data-mermaid', mm); node.replaceChildren(); }
        if (sv && SVG_OK(sv)) { node.setAttribute('data-svg', sv); node.replaceChildren(); }
        span.forEach(([a, v]) => node.setAttribute(a, v));
        if (nt) node.setAttribute('data-note', nt);
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
    // Ghi chú mà cụm từ đã bị xóa hết chữ -> gỡ thẻ (không để chip mồ côi); hai thẻ liền nhau cùng ghi chú (do định dạng cắt đôi) -> gộp
    box.querySelectorAll('span[data-note]').forEach(sp => {
        if (!box.contains(sp)) return;                    // (box nằm ngoài tài liệu nên không dùng isConnected)
        if (!sp.textContent.trim()) return void sp.replaceWith(...sp.childNodes);
        const nx = sp.nextSibling;
        if (nx && nx.nodeType === 1 && nx.tagName === 'SPAN' && nx.getAttribute('data-note') === sp.getAttribute('data-note')) {
            sp.append(...nx.childNodes);
            nx.remove();
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
    // Có ```svg / <svg> (từ file) thì là Markdown -> parseMarkdown dựng khung hình; <div data-svg> là HTML đã lưu
    const looksHtml = /<(b|strong|i|em|u|mark|code|br|div|p|ul|ol|li|span|img|a|table|h4|hr)\b/i.test(v.replace(/<svg[\s>][\s\S]*?<\/svg>/gi, ''));
    return looksHtml ? expandDiagrams(sanitizeHtml(v)) : parseMarkdown(v);
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
const isCoarse = () => !!window.matchMedia?.('(pointer: coarse)').matches;
// Ghi chú cụm từ (room-notes.js ~6KB): chỉ nạp khi có người bấm nút Ghi chú / bấm chip ghi chú
let notesLib = null;
const loadNotes = () => (notesLib ||= import('./room-notes.js').catch(err => { notesLib = null; throw err; }));
/** Chạm vào CHIP ghi chú (phần ::after, không phải DOM) = nằm trong khung span nhưng không trúng ô chữ nào của nó. */
function onNoteChip(sp, x, y) {
    const r = document.createRange();
    r.selectNodeContents(sp);
    const hit = [...r.getClientRects()].some(b => x >= b.left - 1 && x <= b.right + 1 && y >= b.top - 1 && y <= b.bottom + 1);
    return !hit && [...sp.getClientRects()].some(b => x >= b.left - 1 && x <= b.right + 1 && y >= b.top - 1 && y <= b.bottom + 1);
}

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
    if (isCoarse()) {
        // Máy cảm ứng: menu Sao chép / Tra cứu của hệ điều hành hiện SÁT vùng chọn (thường ở TRÊN, lật xuống khi sát mép trên)
        // -> thanh nằm DƯỚI, cách ~44px chừa chấm kéo chọn; vùng chọn sát đáy / bị bàn phím ảo che thì nhảy lên TRÊN menu.
        const vv = window.visualViewport;
        const bottomLimit = (vv ? vv.offsetTop + vv.height : window.innerHeight) - 8;
        const osAbove = rect.top >= 90;
        if (osAbove && rect.bottom + 44 + bh < bottomLimit) y = rect.bottom + 44;
        else if (!osAbove && rect.bottom + 100 + bh < bottomLimit) y = rect.bottom + 100;
        else if (rect.top - 70 - bh > 58) y = rect.top - 70 - bh;
        else y = Math.max(8, Math.min(bottomLimit - bh, rect.bottom + 44));
    }
    bar.style.left = `${x}px`;
    bar.style.top = `${y}px`;
}

// Vạch bút dạ của ghi chú cụm từ vẽ bằng text-decoration: underline -> trình duyệt tưởng chữ ĐÃ gạch chân (nút U luôn "bật",
// lệnh underline không làm gì). Tạm tắt vạch đó (class body.rm-nodeco) đúng lúc hỏi trạng thái / chạy lệnh.
const noDeco = (fn) => {
    document.body.classList.add('rm-nodeco');
    try { return fn(); } finally { document.body.classList.remove('rm-nodeco'); }
};
function syncToolbarState() {
    const bar = el('sel-toolbar');
    if (!bar) return;
    ['bold', 'italic', 'underline'].forEach(cmd => {
        let on = false;
        try { on = noDeco(() => document.queryCommandState(cmd)); } catch (e) {}
        bar.querySelector(`[data-cmd="${cmd}"]`)?.classList.toggle('on', on);
    });
}

function applyCommand(cmd) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const node = editNodeOf(sel.anchorNode) || editNodeOf(sel.focusNode);
    if (!node) return;
    if (cmd === 'note') {
        if (!NOTE_OK.test(node.dataset.liveEdit || '')) return;
        const range = sel.getRangeAt(0).cloneRange();
        hideToolbar();
        loadNotes().then(m => m.openNoteForSelection(node, range)).catch(() => showToast('Không mở được khung ghi chú — kiểm tra mạng.', 'error'));
        return;
    }
    if (cmd === 'comment') {
        const t = sel.toString().replace(/\s+/g, ' ').trim();
        hideToolbar();
        if (t) window.dispatchEvent(new CustomEvent('room:quote', { detail: { text: t, key: node.dataset.liveEdit } }));
        return;
    }
    // Bản 56: ô chỉ-đọc (chưa bấm đúp) vẫn in đậm / nghiêng / bút dạ được — bôi đen rồi bấm nút trên thanh nổi. execCommand chỉ chạy
    // trong vùng sửa được nên bật .is-editing đúng trong lúc chạy lệnh rồi tắt (không focus, không bật bàn phím ảo); input -> lưu sau 400ms như thường.
    const temp = !node.classList.contains('is-editing');
    const before = temp ? sanitizeHtml(node.innerHTML) : '';
    if (temp) node.classList.add('is-editing');
    try {
        if (cmd.startsWith('hl:')) {
            const bg = HL[cmd.slice(3)]?.bg || HL.y.bg;
            if (!document.execCommand('hiliteColor', false, bg)) document.execCommand('backColor', false, bg);
        } else {
            noDeco(() => document.execCommand(cmd, false, null));
        }
    } catch (e) { /* trình duyệt cũ thì thôi */ }
    node.dispatchEvent(new Event('input', { bubbles: true }));
    if (temp) {
        // execCommand có thể kéo tiêu điểm vào ô -> focusin ghi đè lastSaved bằng bản MỚI và lúc rời ô saveNow tưởng không đổi (mất thay đổi):
        // trả lastSaved về bản trước lệnh rồi lưu ngay; nhả tiêu điểm (khỏi bật bàn phím ảo / kẹt chế độ sửa), giữ vùng bôi đen cho lệnh kế tiếp
        node.dataset.lastSaved = before;
        clearTimeout(saveTimer);
        saveNow(node);
        if (node.contains(document.activeElement)) { node.blur(); setTimeout(() => document.dispatchEvent(new Event('mouseup')), 160); }
        node.classList.remove('is-editing');
    }
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

    initDoubleToEdit();

    // Vào / rời vùng sửa
    document.addEventListener('focusin', (e) => {
        const node = e.target.closest?.('[data-live-edit]');
        editingKey = node ? node.dataset.liveEdit : null;
        if (!node) return;
        node.classList.add('is-editing');                 // tiêu điểm quay lại ô (vd. về từ tab khác) = vẫn đang sửa
        node.dataset.lastSaved = sanitizeHtml(node.innerHTML);
        showMathSource(node);
    });
    document.addEventListener('focusout', (e) => {
        const node = e.target.closest?.('[data-live-edit]');
        if (!node) return;
        node.classList.remove('is-editing');              // rời ô là về chế độ chỉ-đọc
        clearTimeout(saveTimer);
        saveNow(node);
        editingKey = null;
        setTimeout(hideToolbar, 120);
        // rời ô: $…$ vẽ lại thành công thức (nếu tiêu điểm chưa quay lại chính ô này — vd. bấm nút thanh công cụ)
        setTimeout(() => { if (!node.contains(document.activeElement)) renderRichMath(node); }, 0);
    });
    initDiagrams();

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
        if (!/^(question$|casetitle$|opttext:)/.test(node.dataset.liveEdit || '')) {
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
        el('sel-toolbar')?.classList.toggle('no-note', !NOTE_OK.test(node.dataset.liveEdit || ''));   // ô chữ trơn: ẩn nút Ghi chú
        showToolbarFor(sel.getRangeAt(0));
        syncToolbarState();
    };
    document.addEventListener('mouseup', () => setTimeout(onSelect, 10));
    document.addEventListener('keyup', (e) => { if (e.shiftKey || e.key.startsWith('Arrow')) onSelect(); });
    let selTimer = 0;
    document.addEventListener('selectionchange', () => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) return hideToolbar();
        if (!isCoarse()) return;
        clearTimeout(selTimer);
        selTimer = setTimeout(onSelect, 140);      // kéo chấm chọn trên iPad / điện thoại không bắn mouseup
    });
    document.addEventListener('touchend', () => { if (isCoarse()) setTimeout(onSelect, 30); }, { passive: true });
    window.addEventListener('scroll', () => {
        if (!isCoarse()) return hideToolbar();
        if (el('sel-toolbar')?.classList.contains('show')) { clearTimeout(selTimer); selTimer = setTimeout(onSelect, 120); }   // bám theo vùng chọn khi trang trôi
    }, true);

    // Bấm vào chip ghi chú (cạnh cụm từ) -> sửa / xóa ghi chú. Bấm vào CHỮ của cụm từ vẫn là đặt con trỏ gõ như thường.
    document.addEventListener('click', (e) => {
        const sp = e.target.closest?.('span[data-note]');
        if (!sp || !sp.closest('[data-live-edit]') || !window.getSelection().isCollapsed) return;
        if (!onNoteChip(sp, e.clientX, e.clientY)) return;
        e.preventDefault(); e.stopPropagation();
        loadNotes().then(m => m.openNoteForSpan(sp)).catch(() => showToast('Không mở được khung ghi chú — kiểm tra mạng.', 'error'));
    }, true);
}

// ---------- Bản 56: chỉ bấm ĐÚP / chạm ĐÚP mới vào chế độ sửa ----------
// Ô [data-live-edit] mặc định CHỈ ĐỌC (CSS: -webkit-user-modify:read-only đè contenteditable="true" nên không đụng attribute —
// nhiều chỗ code đọc / đặt lại nó). Vào chế độ sửa = thêm class .is-editing rồi focus(): bấm đúp (mouse), chạm đúp (touch), hoặc
// code CHỦ Ý gọi focus() (bước "Ghi lý do", phím R / E / W, nút chèn ảnh…) — focus() được vá bên dưới để tự thêm class.
// Rời ô (focusout) thì gỡ class. Hai lần chạm / bấm rơi vào chỗ KHÁC (vd. chữ phương án) thì bắn 'room:dbl' cho module đó tự xử.
function initDoubleToEdit() {
    const nativeFocus = HTMLElement.prototype.focus;
    if (!nativeFocus.__rmEdit) {
        HTMLElement.prototype.focus = function (opts) {
            if (this.dataset && 'liveEdit' in this.dataset) this.classList.add('is-editing');
            return nativeFocus.call(this, opts);
        };
        HTMLElement.prototype.focus.__rmEdit = true;
    }
    const SKIP = 'a, button, img, .rm-mm-tools, .rm-mm';
    const pointRange = (x, y) => {
        if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
        const p = document.caretPositionFromPoint?.(x, y);
        if (!p) return null;
        const r = document.createRange();
        r.setStart(p.offsetNode, p.offset);
        r.collapse(true);
        return r;
    };
    let armedAt = 0;
    // Con trỏ thu về đúng chỗ bấm (bấm đúp tự bôi đen một từ — gõ phím đầu tiên sẽ đè mất từ đó nếu không thu lại)
    function caretAt(node, x, y) {
        // Chỗ bấm nằm TRONG công thức / sơ đồ đã vẽ: để showMathSource (focusin) tự đặt con trỏ sau mã — chỗ bấm sẽ lệch khi công thức đổi về $…$
        const r = pointRange(x, y);
        const host = r && (r.startContainer.nodeType === 3 ? r.startContainer.parentElement : r.startContainer);
        if (!r || !node.contains(r.startContainer) || host?.closest?.('.katex, .katex-error, .rm-mm')) return;
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
    }
    function arm(node, x, y) {
        const was = pointRange(x, y);               // đo TRƯỚC khi ô đổi (công thức hiện lại mã)
        node.classList.add('is-editing');
        armedAt = Date.now();
        nativeFocus.call(node, { preventScroll: true });
        if (was && node.contains(was.startContainer) && !(was.startContainer.parentElement?.closest?.('.katex, .katex-error, .rm-mm'))) {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(was);
        }
    }
    const onDouble = (target, x, y) => {
        const node = target.closest?.('[data-live-edit]');
        if (node) {
            if (!node.classList.contains('is-editing') && !target.closest(SKIP)) arm(node, x, y);
            return;
        }
        window.dispatchEvent(new CustomEvent('room:dbl', { detail: { target, x, y } }));
    };
    document.addEventListener('dblclick', (e) => {
        const node = e.target.closest?.('[data-live-edit]');
        // Cảm ứng: touchend đã vào chế độ sửa rồi, nhưng trình duyệt vẫn bắn tiếp dblclick + bôi đen một từ -> thu về con trỏ
        if (node?.classList.contains('is-editing') && Date.now() - armedAt < 900) return caretAt(node, e.clientX, e.clientY);
        onDouble(e.target, e.clientX, e.clientY);
    });
    // Cảm ứng: tự dò chạm đúp (iOS không bắn dblclick đáng tin; touch-action đã tắt phóng bằng chạm đúp)
    let s0 = null, last = { t: 0, x: 0, y: 0 };
    document.addEventListener('touchstart', (e) => { s0 = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; }, { passive: true });
    document.addEventListener('touchend', (e) => {
        const t = e.changedTouches[0];
        if (e.touches.length || !s0 || !t || Math.hypot(t.clientX - s0.x, t.clientY - s0.y) > 12) { last.t = 0; return; }   // kéo / cuộn không tính
        const now = Date.now();
        if (now - last.t < 380 && Math.hypot(t.clientX - last.x, t.clientY - last.y) < 32) {
            last.t = 0;
            return onDouble(e.target, t.clientX, t.clientY);
        }
        last = { t: now, x: t.clientX, y: t.clientY };
    }, { passive: true });
}

/** Vẽ lại công thức toán trong một vùng vừa được cập nhật. */
export function renderRichMath(node) {
    try { renderMath(node); } catch (e) {}
}

/** Lưu NGAY một ô sửa (không đợi 400ms) — dùng khi đổi nội dung từ ngoài ô (hộp sửa sơ đồ). */
export function saveNode(node) { clearTimeout(saveTimer); saveNow(node); }

/** Bấm vào ô sửa: công thức đã vẽ hiện lại mã $…$ để sửa thẳng (rời ô thì vẽ lại). Giữ con trỏ gần chỗ bấm. */
function showMathSource(node) {
    if (!node.querySelector('.katex, .katex-error')) return;
    const sel = window.getSelection();
    const inK = sel?.anchorNode && (sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode)?.closest?.('.katex-display, .katex, .katex-error');
    const holder = inK && node.contains(inK) ? inK.closest('.katex-display') || inK : null;
    const mark = holder ? document.createComment('caret') : null;
    if (mark) holder.after(mark);
    unrenderMath(node);
    if (mark?.isConnected) {                      // bấm trúng công thức -> con trỏ đứng ngay sau mã của nó
        const r = document.createRange();
        r.setStartBefore(mark); r.collapse(true);
        mark.remove();
        sel.removeAllRanges(); sel.addRange(r);
    }
}

// ---------- Sơ đồ: khối nguyên (không gõ lẫn vào SVG) + nút phóng to / sửa mã ----------
// Công cụ gắn vào khung sơ đồ lúc vẽ xong; không bao giờ bị lưu (unrenderDiagrams thay cả khung khi lưu).
function decorateDiagram(div, ok) {
    const box = div.closest('.mermaid-container') || div;
    box.contentEditable = 'false';
    box.classList.add('rm-mm');
    // cỡ gốc của sơ đồ -> CSS cho vừa cột mà không phóng bè sơ đồ nhỏ, không co sơ đồ to quá mức đọc được
    const svg = div.querySelector('svg');
    const nat = svg && (parseFloat(svg.style.maxWidth) || svg.viewBox?.baseVal?.width);
    if (nat) div.style.setProperty('--mm-w', Math.round(nat) + 'px');
    box.querySelector(':scope > .rm-mm-tools')?.remove();
    const editable = !!box.closest('[data-live-edit]');
    const t = document.createElement('span');
    t.className = 'rm-mm-tools';
    t.innerHTML = (ok ? '<button type="button" data-mm-zoom title="Phóng to sơ đồ"><i class="fas fa-expand"></i></button>' : '')
        + (editable ? '<button type="button" data-mm-edit title="Sửa mã sơ đồ"><i class="fas fa-pen"></i><span>Sửa</span></button>' : '');
    if (t.innerHTML) box.appendChild(t);
}
let dgLib = null;
const loadDiagramTools = () => (dgLib ||= import('./room-diagram.js').catch(err => { dgLib = null; throw err; }));
function initDiagrams() {
    // Nội dung ở phòng do NHIỀU người cùng sửa -> nhãn sơ đồ không được chạy script (mặc định trang đề là 'loose')
    configureMermaid({ securityLevel: 'antiscript', decorate: decorateDiagram });
    // pha capture + chặn mặc định: bấm nút trong sơ đồ không được kéo con trỏ vào ô sửa
    document.addEventListener('mousedown', (e) => { if (e.target.closest?.('.rm-mm-tools')) e.preventDefault(); }, true);
    document.addEventListener('click', (e) => {
        const b = e.target.closest?.('[data-mm-zoom], [data-mm-edit]');
        if (!b) return;
        e.preventDefault(); e.stopPropagation();
        const box = b.closest('.mermaid-container, .rm-mm');
        if (!box) return;
        loadDiagramTools().then(m => b.hasAttribute('data-mm-zoom') ? m.openDiagramViewer(box) : m.openDiagramEditor(box, box.closest('[data-live-edit]')))
            .catch(() => showToast('Không mở được công cụ sơ đồ — kiểm tra mạng.', 'error'));
    }, true);
}
/** Thanh soạn thảo: chèn sơ đồ mới vào ô đang sửa (mở luôn hộp sửa mã). */
export function insertDiagramInto(node) {
    loadDiagramTools().then(m => m.openDiagramEditor(null, node)).catch(() => showToast('Không mở được công cụ sơ đồ — kiểm tra mạng.', 'error'));
}
