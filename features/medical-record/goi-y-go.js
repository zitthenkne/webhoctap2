// goi-y-go.js — gõ tới đâu gợi tới đó, ngay trên ô đang nhập.
//
// Gõ "ec" là hiện "ECG 12 chuyển đạo"; chọn xong máy hỏi luôn *đề nghị để làm gì*
// (xác định, phân biệt, loại trừ cái gì, tìm biến chứng gì) rồi ghép thành một dòng
// hoàn chỉnh: "ECG 12 chuyển đạo — để loại trừ hội chứng vành cấp".
//
// attachTypeahead(el, { items, purposes, targets, autoGrow })
//   items    : mảng chuỗi để dò (tên CLS, tên bệnh, hội chứng…)
//   purposes : [[nhãn, đuôi câu, cầnĐích]] — bỏ trống thì chọn xong là xong
//   targets  : () => mảng gợi ý cho "để loại trừ …" (bệnh cảnh đang cân nhắc)

import { searchList, highlight } from './tim-kiem.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Mục đích đề nghị một cận lâm sàng — đúng bốn câu hỏi thầy hay vặn */
export const CLS_PURPOSES = [
    ['Chẩn đoán xác định', 'để chẩn đoán xác định', true],
    ['Chẩn đoán phân biệt', 'để chẩn đoán phân biệt', true],
    ['Loại trừ', 'để loại trừ', true],
    ['Tìm biến chứng', 'để tìm biến chứng', true],
    ['Đánh giá mức độ nặng', 'để đánh giá mức độ nặng', false],
    ['Tìm nguyên nhân / yếu tố thúc đẩy', 'để tìm nguyên nhân, yếu tố thúc đẩy', false],
    ['Theo dõi điều trị', 'để theo dõi điều trị', false],
    ['Thường quy', 'xét nghiệm thường quy', false]
];

let pop, cur = null;   // cur = { el, cfg, mode, list, active, item, tail }

function ensurePop() {
    if (pop) return pop;
    pop = document.createElement('div');
    pop.className = 'ta-pop hidden';
    document.body.appendChild(pop);

    pop.addEventListener('mousedown', (e) => e.preventDefault());   // giữ con trỏ ở lại ô
    pop.addEventListener('click', (e) => {
        const b = e.target.closest('[data-ta]');
        if (!b || !cur) return;
        if (cur.mode === 'items') return chooseItem(b.dataset.ta);
        if (cur.mode === 'purpose') return choosePurpose(+b.dataset.ta);
        appendText(' ' + b.dataset.ta);
        hide();
    });
    // Cuộn thì bám theo ô chứ đừng tắt: chọn xong ô tự cuộn vào giữa màn,
    // tắt ở đây là mất luôn bước hỏi "đề nghị để làm gì".
    const follow = () => {
        if (!cur || pop.classList.contains('hidden')) return;
        const r = cur.el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) return hide();
        place(cur.el);
    };
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    return pop;
}

/* ---------- đọc / ghi đúng dòng đang gõ ---------- */

function lineRange(el) {
    if (el.tagName !== 'TEXTAREA') return [0, el.value.length];
    const c = el.selectionStart ?? el.value.length;
    const start = el.value.lastIndexOf('\n', c - 1) + 1;
    const end = el.value.indexOf('\n', c);
    return [start, end < 0 ? el.value.length : end];
}

const curLine = (el) => { const [a, b] = lineRange(el); return el.value.slice(a, b); };

function setLine(el, text) {
    const [a, b] = lineRange(el);
    el.value = el.value.slice(0, a) + text + el.value.slice(b);
    const at = a + text.length;
    el.setSelectionRange?.(at, at);
    cur.skip = true;                       // lần input do máy gây ra thì đừng dò lại
    el.dispatchEvent(new Event('input', { bubbles: true }));
    cur.cfg.autoGrow?.(el);
    el.focus();
}

const appendText = (extra) => setLine(cur.el, curLine(cur.el).replace(/\s+$/, '') + extra);

/* ---------- vẽ ---------- */

function place(el) {
    const r = el.getBoundingClientRect();
    pop.style.left = `${Math.round(r.left)}px`;
    pop.style.width = `${Math.round(r.width)}px`;
    // Hết chỗ bên dưới thì lật lên trên, khỏi che mất ô đang gõ
    const below = window.innerHeight - r.bottom;
    if (below < 210 && r.top > below) {
        pop.style.top = 'auto';
        pop.style.bottom = `${Math.round(window.innerHeight - r.top + 4)}px`;
    } else {
        pop.style.bottom = 'auto';
        pop.style.top = `${Math.round(r.bottom + 4)}px`;
    }
}

function render() {
    if (!cur) return;
    if (cur.mode === 'items') {
        pop.innerHTML = cur.list.map((x, i) =>
            `<button type="button" class="ta-row${i === cur.active ? ' is-active' : ''}" data-ta="${esc(x)}">
                ${highlight(x, cur.q)}</button>`).join('')
            + `<div class="ta-foot">↑↓ chọn · Enter chèn · Esc bỏ qua</div>`;
    } else if (cur.mode === 'purpose') {
        pop.innerHTML = `<div class="ta-head"><b>${esc(cur.item)}</b> — đề nghị để làm gì?</div>`
            + cur.cfg.purposes.map(([label], i) =>
                `<button type="button" class="ta-row${i === cur.active ? ' is-active' : ''}" data-ta="${i}">${esc(label)}</button>`).join('')
            + `<div class="ta-foot">Esc nếu chưa muốn ghi mục đích</div>`;
    } else {
        const list = cur.list;
        pop.innerHTML = `<div class="ta-head">${esc(cur.tail)} <b>cái gì?</b></div>`
            + (list.length
                ? list.map((x, i) => `<button type="button" class="ta-row${i === cur.active ? ' is-active' : ''}" data-ta="${esc(x)}">${esc(x)}</button>`).join('')
                : `<div class="ta-foot">Chưa có bệnh cảnh nào ở mục biện luận — cứ gõ tiếp vào ô.</div>`)
            + `<div class="ta-foot">Hoặc gõ thẳng vào ô, con trỏ đang ở cuối dòng</div>`;
    }
    place(cur.el);
    pop.classList.remove('hidden');
    pop.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
}

function hide() {
    pop?.classList.add('hidden');
    if (cur) cur.mode = null;
}

/* ---------- các bước chọn ---------- */

function chooseItem(text) {
    setLine(cur.el, text);
    cur.item = text;
    if (!cur.cfg.purposes?.length) return hide();
    cur.mode = 'purpose';
    cur.active = 0;
    render();
}

function choosePurpose(i) {
    const [, tail, needTarget] = cur.cfg.purposes[i];
    appendText(` — ${tail}`);
    if (!needTarget) return hide();
    cur.mode = 'target';
    cur.tail = tail;
    cur.active = 0;
    cur.list = [...new Set((cur.cfg.targets?.() || []).filter(Boolean))].slice(0, 8);
    render();
}

/* ---------- gắn vào một ô ---------- */

export function attachTypeahead(el, cfg = {}) {
    if (!el || el.dataset.ta) return;
    el.dataset.ta = '1';
    ensurePop();
    const minLen = cfg.minLen ?? 2;

    const doGoiY = (e) => {
        if (cur?.skip) { cur.skip = false; return; }
        // Máy tự điền ô (lý do vào viện đổ xuống triệu chứng chính, chip gợi ý…) thì
        // đừng bung bảng gợi ý đè lên màn hình — chỉ bung khi người thật đang gõ.
        if (e && e.type === 'input' && e.isTrusted === false) return hide();
        const q = curLine(el).trim();
        // Đã ghi mục đích rồi thì thôi, đừng nhảy ra gợi ý đè lên
        if (q.length < minLen || q.includes('—')) return hide();
        const list = searchList(cfg.items || [], q, { limit: 6 });
        if (!list.length || (list.length === 1 && list[0] === q)) return hide();
        cur = { el, cfg, mode: 'items', list, active: 0, q, skip: false };
        render();
    };
    el.addEventListener('input', doGoiY);
    /* Ô có sẵn một bộ câu trả lời ngắn (vd "rõ là như thế nào" của triệu chứng cũ)
       thì chạm vào là bày ra luôn, khỏi bắt gõ mới thấy — dùng chung một bảng gợi ý,
       không phải bày thêm hàng chip riêng cho gọn màn hình. */
    if (cfg.moKhiFocus) el.addEventListener('focus', doGoiY);

    el.addEventListener('keydown', (e) => {
        if (!cur || cur.el !== el || !cur.mode || pop.classList.contains('hidden')) return;
        const n = cur.mode === 'purpose' ? cfg.purposes.length : cur.list.length;
        if (e.key === 'Escape') { e.stopPropagation(); return hide(); }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!n) return;
            cur.active = (cur.active + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
            return render();
        }
        if (e.key === 'Enter' && !e.isComposing) {
            if (!n) return hide();
            e.preventDefault();
            if (cur.mode === 'items') return chooseItem(cur.list[cur.active]);
            if (cur.mode === 'purpose') return choosePurpose(cur.active);
            appendText(' ' + cur.list[cur.active]);
            return hide();
        }
    });

    el.addEventListener('blur', () => setTimeout(hide, 120));
}
