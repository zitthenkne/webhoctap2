// di-ung-list.js — tiền căn dị ứng ghi cho đủ ý.
//
// "Dị ứng hải sản" chưa đủ để quyết định gì. Cái người chấm hỏi tới là: biểu hiện ra sao,
// NẶNG tới mức nào (đã từng phản vệ chưa), lần gần nhất khi nào, lúc đó xử trí thế nào.
// Có phản vệ hay không đổi hẳn cách dùng thuốc sau này, nên tách riêng thành một ô.
//
// Dữ liệu có cấu trúc lưu ở `tienSu.diUngChiTiet`; đoạn chữ ghép ra vẫn ghi vào ô
// `history-allergy` cũ nên trang xem / bản xuất không phải sửa gì.

import { openListPicker } from './list-picker.js';
import { laCauPhuDinh } from './tim-kiem.js';
import { attachTypeahead } from './goi-y-go.js';
/* Gõ là gợi ý ngay, không phải mở bảng chọn mới tìm được tên. Tìm không dấu nên
   gõ "dai thao duong" vẫn ra "Đái tháo đường". attachTypeahead tự bỏ qua ô đã gắn
   nên gọi lại sau mỗi lần vẽ cũng không sao. */
const flatNames = (groups) => [...new Set((groups || []).flatMap(g => g.items || []))];
const goiY = (items) => (el) => attachTypeahead(el, { items });

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const trim = (x) => String(x ?? '').trim();

const MUC_DO = ['nhẹ (chỉ ngoài da)', 'trung bình (mề đay lan, phù mi mắt)',
    'nặng (khó thở, nôn ói)', 'phản vệ (tụt huyết áp, ngất)'];
const XU_TRI = ['tự hết khi ngưng tiếp xúc', 'uống thuốc dị ứng tại nhà',
    'khám phòng khám / trạm y tế', 'cấp cứu tại bệnh viện', 'phải tiêm Adrenaline'];
const UNITS = ['ngày', 'tháng', 'năm'];

const newId = () => 'd' + Math.random().toString(36).slice(2, 7);

/** "Hải sản — nổi mề đay toàn thân, mức độ nặng (khó thở, nôn ói), lần gần nhất 2 năm trước, cấp cứu tại bệnh viện" */
export function diUngLine(r) {
    const detail = [
        trim(r.bieuHien),
        trim(r.mucDo) && `mức độ ${trim(r.mucDo)}`,
        trim(r.n) && `lần gần nhất ${trim(r.n)} ${r.u || 'năm'} trước`,
        trim(r.xuTri)
    ].filter(Boolean).join(', ');
    return `${trim(r.tacNhan) || '(chưa ghi tác nhân)'}${detail ? ' — ' + detail : ''}`;
}

/** Đọc ngược dòng chữ bản cũ ("Hải sản — nổi mề đay; Penicillin — ngứa") */
export function parseDiUng(text) {
    return String(text || '').split(/[;\n]+/).map(trim).filter(x => x && !laCauPhuDinh(x)).map(part => {
        const i = part.indexOf(' — ');
        const rest = i < 0 ? '' : trim(part.slice(i + 3));
        const j = rest.indexOf(', ');
        return {
            id: newId(), tacNhan: i < 0 ? part : trim(part.slice(0, i)),
            bieuHien: j < 0 ? rest : trim(rest.slice(0, j)),
            mucDo: '', n: '', u: 'năm', xuTri: ''
        };
    });
}

export function createDiUngList({ host, field, addBtn, groups, listB, onChange }) {
    if (!host || !field) return null;
    let rows = [];

    const opt = (list, val) => list.map(x =>
        `<option ${val === x ? 'selected' : ''}>${esc(x)}</option>`).join('');

    const rowHtml = (r, i) => `<div class="du-row${/phản vệ/.test(r.mucDo || '') ? ' is-severe' : ''}" data-i="${i}">
        <input class="du-tn" data-k="tacNhan" value="${esc(r.tacNhan)}" placeholder="Dị ứng với gì" aria-label="Dị ứng với gì">
        <button type="button" class="du-pick" data-act="pick" title="Chọn tác nhân từ danh sách"><i class="fas fa-magnifying-glass"></i></button>
        <input class="du-bh" data-k="bieuHien" ${listB ? `list="${listB}"` : ''} value="${esc(r.bieuHien)}" placeholder="Biểu hiện khi dị ứng" aria-label="Biểu hiện">
        <select class="du-md" data-k="mucDo" aria-label="Mức độ">
            <option value="">— mức độ —</option>${opt(MUC_DO, r.mucDo)}
        </select>
        <input class="du-n" data-k="n" type="number" min="0" value="${esc(r.n)}" placeholder="lần gần nhất" aria-label="Lần gần nhất cách đây bao lâu" title="Lần gần nhất cách đây bao lâu">
        <select class="du-u" data-k="u" aria-label="Đơn vị">${opt(UNITS, r.u || 'năm')}</select>
        <select class="du-xt" data-k="xuTri" aria-label="Lúc đó xử trí thế nào">
            <option value="">— lúc đó xử trí —</option>${opt(XU_TRI, r.xuTri)}
        </select>
        <button type="button" class="du-x" data-act="del" title="Xóa dòng"><i class="fas fa-xmark"></i></button>
        <p class="du-preview">${/phản vệ/.test(r.mucDo || '')
            ? '<b class="du-flag"><i class="fas fa-triangle-exclamation"></i> Đã từng phản vệ — ghi rõ ở bìa bệnh án và tránh tuyệt đối tác nhân này.</b> ' : ''}${esc(diUngLine(r))}</p>
    </div>`;

    function render() {
        host.innerHTML = rows.length
            ? rows.map(rowHtml).join('')
            : `<p class="dl-empty">Chưa ghi dị ứng nào — bấm “Thêm dị ứng”, hoặc ghi “Chưa ghi nhận” ở ô chữ bên dưới.</p>`;
        host.querySelectorAll('.du-tn').forEach(goiY(flatNames(groups)));
    }

    const get = () => rows.filter(r => trim(r.tacNhan));

    function sync() {
        field.value = get().map(diUngLine).join('; ');
        field.dispatchEvent(new Event('input', { bubbles: true }));
        onChange?.();
    }

    host.addEventListener('input', handle);
    host.addEventListener('change', handle);
    function handle(e) {
        const box = e.target.closest('.du-row');
        if (!box || !e.target.dataset.k) return;
        const r = rows[+box.dataset.i];
        if (!r) return;
        r[e.target.dataset.k] = e.target.value;
        // Mức độ đổi thì khung có thể chuyển sang cảnh báo đỏ -> vẽ lại
        if (e.target.dataset.k === 'mucDo') render();
        else box.querySelector('.du-preview').textContent = diUngLine(r);
        sync();
    }

    host.addEventListener('click', (e) => {
        const row = e.target.closest('.du-row');
        if (!row) return;
        const i = +row.dataset.i;
        if (e.target.closest('[data-act="pick"]')) {
            return openListPicker({
                title: 'Chọn tác nhân gây dị ứng', groups, value: rows[i].tacNhan,
                onPick: ([name]) => { if (!name) return; rows[i].tacNhan = name; render(); sync(); }
            });
        }
        if (!e.target.closest('[data-act="del"]')) return;
        rows.splice(i, 1);
        render();
        sync();
    });

    addBtn?.addEventListener('click', () => {
        rows.push({ id: newId(), tacNhan: '', bieuHien: '', mucDo: '', n: '', u: 'năm', xuTri: '' });
        render();
        host.querySelector('.du-row:last-of-type .du-tn')?.focus();
    });

    render();
    return {
        get,
        /** Có ai từng phản vệ không — chỗ khác dùng để cảnh báo khi kê thuốc */
        hasAnaphylaxis: () => rows.some(r => /phản vệ/.test(r.mucDo || '')),
        set(arr) {
            rows = Array.isArray(arr) && arr.length
                ? JSON.parse(JSON.stringify(arr)).map(r => ({ id: r.id || newId(), ...r }))
                : parseDiUng(field.value);
            render();
        }
    };
}
