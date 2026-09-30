// essay-format-editor.js — BỘ SỬA "Ô TRẢ LỜI" của câu tự luận, dùng chung cho modal sửa câu (quiz-editor.js)
// và phòng đánh đề (study-room/room-answer.js). Không phụ thuộc trang: chỉ sinh HTML (lớp .fe-*) + đọc lại
// answerFormat; mỗi trang tự tô CSS. Mô hình ô: quiz-essay-core.js formatOf / slotOf.
//   Danh sách / Nhiều ô: mỗi ô đặt tự do — nhãn · gợi ý trong ô · cỡ (1 dòng / đoạn / dài) · đơn vị; thêm, xóa, đổi thứ tự.
//   Bảng: tên cột + số hàng hoặc nhãn hàng (ngăn bằng |).
import { formatOf, slotOf } from './quiz-essay-core.js';

const KINDS = [['text', 'Ô văn bản dài'], ['short', 'Trả lời ngắn (1 dòng)'], ['list', 'Danh sách N ô'], ['fields', 'Nhiều ô tự đặt'], ['table', 'Bảng']];
const SIZES = [['line', '1 dòng'], ['para', 'Đoạn'], ['long', 'Dài']];
const E = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const defSize = (kind) => (kind === 'fields' ? 'para' : 'line');

// orig = vị trí ô này trong answerFormat cũ (ô mới thêm: không có) -> dời bài làm theo đúng ô khi đổi thứ tự / chèn / xóa
function rowHtml(s, n, orig) {
    return `<div class="fe-row" data-fe-row${orig == null ? '' : ` data-orig="${orig}"`}>
        <span class="fe-n">${n}</span>
        <input class="fe-in fe-label" data-k="label" value="${E(s.label)}" placeholder="Nhãn ô (vd. Mạch)" aria-label="Nhãn ô ${n}">
        <input class="fe-in fe-hint" data-k="hint" value="${E(s.hint)}" placeholder="Gợi ý trong ô" aria-label="Gợi ý ô ${n}">
        <input class="fe-in fe-unit" data-k="unit" value="${E(s.unit)}" placeholder="Đơn vị" aria-label="Đơn vị ô ${n}">
        <select class="fe-in fe-size" data-k="size" aria-label="Cỡ ô ${n}">${SIZES.map(([v, l]) => `<option value="${v}"${v === s.size ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <button type="button" class="fe-btn" data-fe-up title="Đưa ô này lên">↑</button>
        <button type="button" class="fe-btn" data-fe-del title="Xóa ô này">✕</button>
    </div>`;
}

/** HTML bộ sửa cho một answerFormat (null = ô văn bản dài). */
export function formatEditorHtml(answerFormat) {
    const f = formatOf({ answerFormat });
    const multi = f.kind === 'list' || f.kind === 'fields';
    const slots = multi ? f.slots : [];
    const join = (a) => (Array.isArray(a) ? a.join(' | ') : '');
    return `<div class="fe" data-fe data-kind="${f.kind}">
        <select class="fe-in fe-kind" data-fe-kind aria-label="Kiểu ô trả lời">${KINDS.map(([v, l]) => `<option value="${v}"${v === f.kind ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <div class="fe-slots" data-fe-slots${multi ? '' : ' hidden'}>${slots.map((s, k) => rowHtml(s, k + 1, k)).join('')}</div>
        <button type="button" class="fe-add" data-fe-add${multi ? '' : ' hidden'}>＋ Thêm ô</button>
        <div class="fe-table" data-fe-table${f.kind === 'table' ? '' : ' hidden'}>
            <input class="fe-in" data-fe-cols value="${E(f.kind === 'table' ? join(f.columns) : '')}" placeholder="Tên cột, ngăn bằng | (vd. Thuốc | Liều | Đường dùng)">
            <input class="fe-in" data-fe-rows value="${E(f.kind === 'table' ? (f.rowLabels.length ? join(f.rowLabels) : String(f.rows)) : '')}" placeholder="Số hàng (vd. 3) hoặc nhãn hàng ngăn bằng |">
        </div>
    </div>`;
}

const renumber = (root) => root.querySelectorAll('[data-fe-row]').forEach((r, k) => { r.querySelector('.fe-n').textContent = k + 1; });

/** Gắn một lần trên phần tử chứa (ủy quyền — vẽ lại innerHTML vẫn chạy). onChange() khi người dùng sửa. */
export function wireFormatEditor(host, onChange = () => {}) {
    if (!host || host.dataset.feWired) return;
    host.dataset.feWired = '1';
    host.addEventListener('change', (e) => {
        const kindSel = e.target.closest('[data-fe-kind]');
        if (kindSel) {
            const root = kindSel.closest('[data-fe]');
            const kind = kindSel.value;
            const multi = kind === 'list' || kind === 'fields';
            root.dataset.kind = kind;
            const box = root.querySelector('[data-fe-slots]');
            box.hidden = !multi;
            root.querySelector('[data-fe-add]').hidden = !multi;
            root.querySelector('[data-fe-table]').hidden = kind !== 'table';
            if (multi && !box.children.length) box.innerHTML = [1, 2, 3].slice(0, kind === 'list' ? 3 : 2).map(n => rowHtml(slotOf('', defSize(kind)), n)).join('');
        }
        onChange();
    });
    host.addEventListener('input', () => onChange());
    host.addEventListener('click', (e) => {
        const b = e.target.closest('[data-fe-add], [data-fe-up], [data-fe-del]');
        if (!b) return;
        const root = b.closest('[data-fe]');
        const box = root.querySelector('[data-fe-slots]');
        const row = b.closest('[data-fe-row]');
        if (b.hasAttribute('data-fe-add')) {
            if (box.children.length >= 20) return;
            box.insertAdjacentHTML('beforeend', rowHtml(slotOf('', defSize(root.dataset.kind)), box.children.length + 1));
            box.lastElementChild.querySelector('.fe-label').focus();
        } else if (b.hasAttribute('data-fe-up') && row.previousElementSibling) {
            row.previousElementSibling.before(row);
        } else if (b.hasAttribute('data-fe-del') && box.children.length > 1) {
            row.remove();
        }
        renumber(root);
        onChange();
    });
}

// Ô chỉ có nhãn + cỡ mặc định -> lưu gọn thành chuỗi (giống dữ liệu cũ); còn lại object bỏ trường trống
function compact(s, kind) {
    if (!s.hint && !s.unit && s.size === defSize(kind)) return s.label;
    const o = { label: s.label };
    if (s.hint) o.hint = s.hint;
    if (s.unit) o.unit = s.unit;
    if (s.size !== defSize(kind)) o.size = s.size;
    return o;
}

/** Đọc lại: { format, order? } (null = ô văn bản dài) hoặc { error }.
 *  order[n] = ô cũ nằm ở ô mới thứ n (null = ô mới) — để dời bài làm đã gõ theo đúng ô. */
export function readFormatEditor(host) {
    const root = host?.querySelector('[data-fe]');
    if (!root) return { format: null };
    const kind = root.querySelector('[data-fe-kind]').value;
    const split = (s) => String(s || '').split('|').map(x => x.trim()).filter(Boolean);
    if (kind === 'short') return { format: { kind } };
    if (kind === 'list' || kind === 'fields') {
        const els = [...root.querySelectorAll('[data-fe-row]')];
        const rows = els.map(r => slotOf(Object.fromEntries(
            [...r.querySelectorAll('[data-k]')].map(i => [i.dataset.k, i.value])), defSize(kind)));
        const orig = els.map(r => (r.dataset.orig == null ? null : Number(r.dataset.orig)));
        const keep = rows.map((s, k) => k).filter(k => kind === 'list' || rows[k].label || rows[k].hint || rows[k].unit);
        const order = keep.map(k => orig[k]);
        if (kind === 'list') {
            const any = rows.some(s => s.label || s.hint || s.unit);
            return { format: any ? { kind, count: rows.length, labels: rows.map(s => compact(s, kind)) } : { kind, count: rows.length }, order };
        }
        return keep.length ? { format: { kind, labels: keep.map(k => compact(rows[k], kind)) }, order }
            : { error: 'Kiểu "nhiều ô tự đặt" cần ít nhất một ô có nhãn hoặc gợi ý.' };
    }
    if (kind === 'table') {
        const columns = split(root.querySelector('[data-fe-cols]').value);
        if (!columns.length) return { error: 'Kiểu "bảng" cần tên các cột (ngăn bằng |).' };
        const b = root.querySelector('[data-fe-rows]').value.trim();
        const rows = /^\d+$/.test(b) ? Math.min(12, Math.max(1, Number(b))) : (split(b).length ? split(b) : 3);
        return { format: { kind, columns, rows } };
    }
    return { format: null };
}
