// benh-kem-list.js — danh sách bệnh kèm, mỗi bệnh giữ mức độ / giai đoạn riêng.
//
// Mẫu bệnh án hay ghi bệnh kèm thành một dòng dài rồi nhét chung mức độ vào ô
// "Mức độ / giai đoạn" của bệnh chính — sai, vì mỗi bệnh nền có phân độ riêng.
// Ở đây mỗi bệnh là một dòng [tên bệnh] + [mức độ / giai đoạn].
//
// Không thêm trường lưu mới: danh sách ghép thẳng vào ô chữ cũ (dx1-assoc / dx2-assoc)
// theo dạng "Tên bệnh — mức độ; Tên bệnh khác — mức độ", và đọc ngược lại khi mở bệnh án.

import { openListPicker } from './list-picker.js';
import { BENH_NHOM } from './benh-data.js';
import { attachTypeahead } from './goi-y-go.js';
/* Gõ là gợi ý ngay, không phải mở bảng chọn mới tìm được tên. Tìm không dấu nên
   gõ "dai thao duong" vẫn ra "Đái tháo đường". attachTypeahead tự bỏ qua ô đã gắn
   nên gọi lại sau mỗi lần vẽ cũng không sao. */
const flatNames = (groups) => [...new Set((groups || []).flatMap(g => g.items || []))];
const goiY = (items) => (el) => attachTypeahead(el, { items });

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const trim = (x) => String(x ?? '').trim();
const SEP = ' — ';

/** "Tăng huyết áp — độ 2; Đái tháo đường type 2" -> [{ten, gd}, …] */
export function parseAssoc(text) {
    return String(text || '').split(/[;\n]+/).map(trim).filter(Boolean).map(part => {
        const i = part.indexOf(SEP);
        return i < 0 ? { ten: part, gd: '' }
            : { ten: trim(part.slice(0, i)), gd: trim(part.slice(i + SEP.length)) };
    });
}

const toText = (rows) => rows
    .filter(r => trim(r.ten))
    .map(r => trim(r.ten) + (trim(r.gd) ? SEP + trim(r.gd) : ''))
    .join('; ');

/**
 * @param host      hộp chứa các dòng
 * @param addBtn    nút thêm dòng
 * @param pullBtn   nút lấy bệnh nền từ tiền căn
 * @param field     ô chữ gốc (dx1-assoc / dx2-assoc) — nguồn lưu duy nhất
 * @param suggest   (tênBệnh) => 'mức độ suy ra từ dữ kiện đã nhập' | ''
 * @param getPast   () => ['Tăng huyết áp', …] các bệnh nền đã ghi ở tiền căn
 */
export function createBenhKemList({ host, addBtn, pullBtn, field, suggest, getPast, onChange }) {
    let rows = parseAssoc(field.value);

    const rowHtml = (r, i) => `<div class="bk-row" data-i="${i}">
        <input class="bk-ten" data-k="ten" value="${esc(r.ten)}"
               placeholder="Tên bệnh kèm — gõ vài chữ là có gợi ý" aria-label="Tên bệnh kèm">
        <input class="bk-gd" data-k="gd" list="bk-stage-list" value="${esc(r.gd)}"
               placeholder="Mức độ / giai đoạn" aria-label="Mức độ hoặc giai đoạn">
        <button type="button" class="bk-pick" data-act="pick" title="Chọn bệnh theo chuyên khoa"><i class="fas fa-magnifying-glass"></i></button>
        <button type="button" class="bk-x" data-act="del" title="Xóa bệnh này"><i class="fas fa-xmark"></i></button>
    </div>`;

    function render() {
        host.innerHTML = rows.length
            ? rows.map(rowHtml).join('')
            : `<p class="cnv-empty">Chưa có bệnh kèm — bấm “Lấy từ tiền căn” để máy chép sang, hoặc “Thêm bệnh”.</p>`;
        host.querySelectorAll('.bk-ten').forEach(goiY(flatNames(BENH_NHOM)));
    }

    /** Ghi ngược vào ô chữ gốc rồi báo cho trang biết để lưu */
    function flush() {
        field.value = toText(rows);
        field.dispatchEvent(new Event('input', { bubbles: true }));
        onChange?.();
    }

    host.addEventListener('input', (e) => {
        const box = e.target.closest('.bk-row');
        if (!box || !e.target.dataset.k) return;
        const r = rows[+box.dataset.i];
        if (!r) return;
        r[e.target.dataset.k] = e.target.value;
        // Vừa gõ xong tên bệnh mà chưa có mức độ: máy đề nghị luôn từ dữ kiện đã nhập
        if (e.target.dataset.k === 'ten' && !trim(r.gd)) {
            const g = suggest?.(r.ten) || '';
            if (g) {
                r.gd = g;
                box.querySelector('.bk-gd').value = g;
            }
        }
        flush();
    });

    host.addEventListener('click', (e) => {
        const pickBtn = e.target.closest('[data-act="pick"]');
        if (pickBtn) {
            const i = +pickBtn.closest('.bk-row').dataset.i;
            return openListPicker({
                title: 'Chọn bệnh kèm', groups: BENH_NHOM,
                onPick: ([ten]) => {
                    if (!ten) return;
                    rows[i].ten = ten;
                    if (!trim(rows[i].gd)) rows[i].gd = suggest?.(ten) || '';
                    render();
                    flush();
                }
            });
        }
        if (!e.target.closest('[data-act="del"]')) return;
        rows.splice(+e.target.closest('.bk-row').dataset.i, 1);
        render();
        flush();
    });

    addBtn?.addEventListener('click', () => {
        rows.push({ ten: '', gd: '' });
        render();
        flush();
        host.querySelector('.bk-row:last-of-type .bk-ten')?.focus();
    });

    pullBtn?.addEventListener('click', () => {
        const have = new Set(rows.map(r => trim(r.ten).toLowerCase()));
        let n = 0;
        (getPast?.() || []).forEach(ten => {
            if (!ten || have.has(ten.toLowerCase())) return;
            have.add(ten.toLowerCase());
            rows.push({ ten, gd: suggest?.(ten) || '' });
            n++;
        });
        render();
        flush();
        pullBtn.dispatchEvent(new CustomEvent('bk-pulled', { detail: { n }, bubbles: true }));
    });

    render();
    return {
        /** Ô chữ bị sửa tay hoặc bệnh án vừa nạp xong -> dựng lại các dòng */
        sync() {
            if (toText(rows) === trim(field.value)) return;
            rows = parseAssoc(field.value);
            render();
        },
        /** Chấm lại mức độ cho các bệnh chưa điền, sau khi có thêm sinh hiệu / cận lâm sàng */
        regrade() {
            let n = 0;
            rows.forEach(r => {
                if (trim(r.gd) || !trim(r.ten)) return;
                const g = suggest?.(r.ten) || '';
                if (g) { r.gd = g; n++; }
            });
            if (n) { render(); flush(); }
            return n;
        }
    };
}
