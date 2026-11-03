// File: features/quiz/page/quiz-note-md.js
// Markdown gọn cho GHI CHÚ (ghi chú cụm từ — quiz-annotations.js; sổ ghi chú — quiz-notes-panel.js) + tự đổi ký hiệu mũi tên.
// Không import gì (test chạy thẳng mã nguồn). Mọi chữ đều được thoát HTML TRƯỚC khi áp định dạng -> không chèn được thẻ lạ.
//
// Hỗ trợ:
//   dòng:   # / ## / ### tiêu đề · "- " "* " "+ " "1. " danh sách (thụt 2 dấu cách = cấp con) · "- [ ]" / "- [x]" / ☐ ☑ việc cần làm
//           "> " trích · "---" kẻ ngang · dòng trống = khoảng cách · mỗi lần xuống dòng là một dòng riêng
//   chữ:    **đậm** __đậm__ · *nghiêng* _nghiêng_ · ~~gạch~~ · ==tô sáng== · `mã` · x^2^ · H~2~O
//   ký hiệu: -> --> → · <- ← · <-> ↔ · => ⇒ · <= ≤ · >= ≥ · <=> ⇔ · != ≠ · ~= ≈ · +- +/- ±

// Thứ tự quan trọng: chuỗi dài / hai chiều trước. Các dạng "≤>", "←->"… là chỗ khung viết đã đổi dở khi gõ từng ký tự.
const ARROWS = [
    [/<-{1,2}>|←-?>/g, '↔'],
    [/<={1,2}>|≤=?>|⇐>/g, '⇔'],
    [/<==|≤=/g, '⇐'],
    [/-{1,2}>/g, '→'],
    [/<-{1,2}/g, '←'],
    [/={1,2}>/g, '⇒'],
    [/>=/g, '≥'],
    [/<=/g, '≤'],
    [/!=/g, '≠'],
    [/~=/g, '≈'],
    [/\+\/?-(?!-)/g, '±']
];
export function arrowize(s) {
    let out = String(s ?? '');
    for (const [re, to] of ARROWS) out = out.replace(re, to);
    return out;
}
// Khung viết: vừa gõ xong ký tự `typed` -> đổi đuôi chữ trước con trỏ nếu thành ký hiệu. Chỉ đổi khi ký tự vừa gõ khép một
// ký hiệu (> hoặc =) để "<-" / "+-" đang gõ dở không bị đổi sớm; trong `mã` thì để nguyên.
// Trả { text, caret, raw } (raw = đoạn gốc bị thay, để Backspace hoàn tác) hoặc null.
export function arrowizeTyping(value, caret, typed) {
    if (typed !== '>' && typed !== '=') return null;
    const before = value.slice(0, caret);
    if ((before.match(/`/g) || []).length % 2) return null;
    // Cửa sổ dài trước ("<-->" trước "->"); chỉ nhận khi CẢ cửa sổ thành đúng một ký hiệu -> không đổi lén chỗ khác
    // (vd. "->" người dùng vừa Backspace giữ lại ngay phía trước).
    for (let len = 4; len >= 2; len--) {
        if (before.length < len) continue;
        const raw = before.slice(-len), rep = arrowize(raw);
        if (rep === raw || [...rep].length !== 1) continue;
        const head = before.slice(0, -len);
        return { text: head + rep + value.slice(caret), caret: head.length + rep.length, raw, rep };
    }
    return null;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const TAG_RE = /^((?:⭐\s*)?(?:nhớ|dễ nhầm(?: với)?|hỏi lại|nguồn|cơ chế|chẩn đoán|điều trị|hỏi|đáp)\s*:)/iu;

// Định dạng trong dòng (đã thoát HTML). `mã` giữ nguyên chữ, không đổi mũi tên.
export function noteInlineHtml(raw) {
    return String(raw ?? '').split(/(`[^`\n]+`)/).map((part, i) => {
        if (i % 2) return '<code>' + esc(part.slice(1, -1)) + '</code>';
        let h = esc(arrowize(part));
        h = h.replace(/\*\*(?=\S)([^\n]*?\S)\*\*/g, '<b>$1</b>')
            .replace(/(^|[^\p{L}\p{N}_])__(?=\S)([^\n]*?\S)__(?![\p{L}\p{N}_])/gu, '$1<b>$2</b>')
            .replace(/~~(?=\S)([^\n]*?\S)~~/g, '<s>$1</s>')
            .replace(/==(?=\S)([^\n]*?\S)==/g, '<mark>$1</mark>')
            .replace(/(^|[^\p{L}\p{N}*])\*(?=[^\s*])([^*\n]*?[^\s*])?\*(?![*\p{L}\p{N}])/gu, (m, a, b) => b === undefined ? m : `${a}<i>${b}</i>`)
            .replace(/(^|[^\p{L}\p{N}_])_(?=[^\s_])([^_\n]*?[^\s_])?_(?![_\p{L}\p{N}])/gu, (m, a, b) => b === undefined ? m : `${a}<i>${b}</i>`)
            .replace(/\^([^\s^]{1,24})\^/g, '<sup>$1</sup>')
            .replace(/(^|[^~])~([^\s~]{1,24})~(?!~)/g, '$1<sub>$2</sub>');
        return h;
    }).join('');
}
function lineBody(text) {
    let s = String(text);
    let pre = '';
    const box = /^(?:\[( |x|X)\]|([☐☑]))\s*/.exec(s);
    if (box) {
        const done = box[1] ? box[1] !== ' ' : box[2] === '☑';
        pre = `<span class="ck${done ? ' on' : ''}" aria-hidden="true"></span>`;
        s = s.slice(box[0].length);
    }
    const tag = TAG_RE.exec(s);
    if (tag) return pre + `<span class="t">${noteInlineHtml(tag[1])}</span>` + noteInlineHtml(s.slice(tag[1].length));
    return pre + noteInlineHtml(s);
}
// Cả ghi chú -> HTML khối (mỗi dòng một khối, nên không cần white-space: pre-line)
export function noteMdHtml(text) {
    const lines = String(text ?? '').replace(/\r/g, '').split('\n');
    let out = '';
    for (const line of lines) {
        if (!line.trim()) { out += '<div class="g"></div>'; continue; }
        let m;
        if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) { out += '<hr>'; continue; }
        if ((m = /^\s{0,3}(#{1,3})\s+(.+)$/.exec(line))) { out += `<div class="h h${m[1].length}">${lineBody(m[2])}</div>`; continue; }
        if ((m = /^\s*>\s?(.*)$/.exec(line))) { out += `<div class="q">${lineBody(m[1])}</div>`; continue; }
        if ((m = /^([ \t]*)([-*+•]|\d{1,3}[.)])\s+(.*)$/.exec(line))) {
            const lv = Math.min(4, Math.floor(m[1].replace(/\t/g, '  ').length / 2));
            const ord = /\d/.test(m[2]);
            const task = !ord && /^(?:\[[ xX]\]|[☐☑])/.test(m[3]);
            const mark = ord ? esc(m[2]) : (task ? '' : (lv % 2 ? '◦' : '•'));
            out += `<div class="li${ord ? ' ol' : ''}${task ? ' task' : ''}" style="--lv:${lv}">`
                + (mark ? `<span class="b" aria-hidden="true">${mark}</span>` : '') + `<span class="c">${lineBody(m[3])}</span></div>`;
            continue;
        }
        out += `<div class="p">${lineBody(line.replace(/^\s+/, ''))}</div>`;
    }
    return out;
}
// Ghi chú có dùng định dạng / nhiều dòng không (khung viết chỉ hiện "Xem trước" khi có)
export const noteHasMd = (text) => /\n|\*\*|__|~~|==|`|\^|(^|\s)[*_~]\S|^\s*(#{1,3}\s|>|[-*+]\s|\d{1,3}[.)]\s)|->|=>|<-|<=|>=|!=/m.test(String(text || ''));

// Kiểu chung: dùng trong bóng thoại đọc ghi chú (tài liệu chính) và trong hàng ghi chú (shadow DOM).
// Màu theo biến của hàng / bóng thoại (--nt, --nt-ink) — biến CSS đi xuyên shadow DOM.
export const NOTE_MD_CSS = `
.nmd { min-width: 0; overflow-wrap: anywhere; }
.nmd > div { margin: 0; }
.nmd .p, .nmd .h, .nmd .q, .nmd .li .c { text-wrap: pretty; }
.nmd .g { height: .4em; }
.nmd .h { font-weight: 700; letter-spacing: .01em; }
.nmd .h1 { font-size: 1.16em; }
.nmd .h2 { font-size: 1.07em; }
.nmd .h3 { text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--nt, currentColor) 60%, transparent); text-underline-offset: .15em; }
.nmd .li { display: flex; gap: .3em; padding-left: calc(var(--lv, 0) * 1em); }
.nmd .li .b { flex: none; min-width: .55em; text-align: center; opacity: .85; }
.nmd .li.ol .b { min-width: auto; font-variant-numeric: tabular-nums; }
.nmd .li .c { min-width: 0; flex: 1; text-align: left; }
.nmd .q { border-left: 2px solid color-mix(in srgb, var(--nt, currentColor) 70%, transparent); padding-left: .45em; opacity: .92; }
.nmd hr { border: 0; border-top: 1.5px dashed color-mix(in srgb, currentColor 40%, transparent); margin: .25em 0; }
.nmd b { font-weight: 700; }
.nmd i { font-style: italic; }
.nmd mark { color: inherit; background: color-mix(in srgb, var(--nt, #F2BE2E) 42%, transparent); border-radius: .25em; padding: 0 .12em; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
.nmd code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: .84em; padding: 0 .28em; border-radius: .3em; background: color-mix(in srgb, currentColor 11%, transparent); }
.nmd sup, .nmd sub { font-size: .72em; line-height: 0; }
.nmd .t { font-weight: 700; }
.nmd .ck { display: inline-block; width: .78em; height: .78em; margin-right: .28em; vertical-align: -.06em; border: 1.5px solid currentColor; border-radius: .22em; box-sizing: border-box; }
.nmd .ck.on { background: currentColor; box-shadow: inset 0 0 0 1.5px var(--surface-card, #fff); }
`;
// Bóng thoại / sổ ghi chú (tài liệu chính) cần cùng kiểu: chèn một lần
export function ensureNoteMdCss(doc = document) {
    if (doc.getElementById('nmd-css')) return;
    const st = doc.createElement('style');
    st.id = 'nmd-css';
    st.textContent = NOTE_MD_CSS;
    doc.head.appendChild(st);
}

// Hàng ghi chú (.an-line): nội dung nằm trong SHADOW DOM -> không phải chữ của đề. TreeWalker / Range.toString / textContent của
// vùng ghi chú (offset ghi chú, quét dữ kiện, đọc to, sao chép) không thấy nó — giống ::after content: attr() trước đây, nhưng
// giờ vẽ được markdown. Hàng tự cao theo chữ, quá ROW_LINES dòng thì mờ đuôi (bấm hàng để đọc đủ).
const ROW_CSS = NOTE_MD_CSS + `
.tx { flex: 1; min-width: 0; max-height: calc(var(--an-lines, 8) * 1lh); overflow: hidden;
      -webkit-user-select: none; user-select: none; }
:host(.is-clip) .tx { -webkit-mask-image: linear-gradient(#000 calc(100% - 1.1lh), transparent); mask-image: linear-gradient(#000 calc(100% - 1.1lh), transparent); }
.nmd .p, .nmd .h, .nmd .q, .nmd .li .c { text-wrap: balance; }   /* đã xuống dòng thì cân độ dài các dòng */
`;
let rowSheet = null;
function rowStyles(root) {
    try {
        if (!rowSheet && 'adoptedStyleSheets' in root && typeof CSSStyleSheet === 'function' && 'replaceSync' in CSSStyleSheet.prototype) {
            rowSheet = new CSSStyleSheet();
            rowSheet.replaceSync(ROW_CSS);
        }
        if (rowSheet) { root.adoptedStyleSheets = [rowSheet]; return ''; }
    } catch (e) { rowSheet = null; }
    return `<style>${ROW_CSS}</style>`;
}
export function mountNoteRow(row, text) {
    if (!row || !row.attachShadow) return;
    let root = row.shadowRoot;
    try { root = root || row.attachShadow({ mode: 'open' }); } catch (e) { return; }
    root.innerHTML = rowStyles(root) + `<div class="tx nmd" part="text">${noteMdHtml(text)}</div>`;
}
// Bản sao DOM (innerHTML) không mang theo shadow root -> dựng lại nội dung cho mọi hàng ghi chú trong khối đó
export function hydrateNoteRows(container) {
    if (!container) return;
    container.querySelectorAll('.an-line[data-txt]').forEach(row => { if (!row.shadowRoot) mountNoteRow(row, row.getAttribute('data-txt')); });
}
