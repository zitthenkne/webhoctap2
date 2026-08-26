// cnv-list.js — danh sách "CNV <bao lâu>, <nội dung>" dùng cho tiền căn nội khoa / ngoại khoa.
// Mẫu bệnh án ghi mốc tiền căn theo khoảng cách tới lúc nhập viện: "CNV 9 năm, mổ bắt con".
// Mỗi danh sách tự xếp từ xa tới gần rồi ghép thành các dòng chữ vào ô textarea gốc.

import { openListPicker } from './list-picker.js';
import { attachTypeahead } from './goi-y-go.js';
/* Gõ là gợi ý ngay, không phải mở bảng chọn mới tìm được tên. Tìm không dấu nên
   gõ "dai thao duong" vẫn ra "Đái tháo đường". attachTypeahead tự bỏ qua ô đã gắn
   nên gọi lại sau mỗi lần vẽ cũng không sao. */
const flatNames = (groups) => [...new Set((groups || []).flatMap(g => g.items || []))];
const goiY = (items) => (el) => attachTypeahead(el, { items });

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const UNITS = ['ngày', 'tuần', 'tháng', 'năm'];
/* Bệnh nền ghi tên không thôi thì chưa đủ: đang uống thuốc hay đã bỏ, có kiểm soát được
   không — đó mới là thứ ảnh hưởng tới đợt bệnh này. Chỉ bật cho danh sách nội khoa. */
const TINH_TRANG = ['đang điều trị đều', 'điều trị không đều', 'đã ngưng điều trị',
    'đã điều trị khỏi', 'không điều trị gì'];
const DAYS = { 'ngày': 1, 'tuần': 7, 'tháng': 30, 'năm': 365 };

const trim = (x) => String(x ?? '').trim();
const label = (r) => (trim(r.n) ? `CNV ${trim(r.n)} ${r.u || 'năm'}` : 'CNV');

/* ---------------------------------------------------------------- ngày chính xác
   Bệnh nhân hay nhớ đúng ngày ("mổ ngày 12 tháng 10 năm 2023") — bắt họ tự quy ra
   "cách nhập viện mấy tháng" là vô lý. Gõ 121023 / 12-10-23 / 12/10/2023 đều hiểu,
   rồi máy tự đổi thành CNV bao lâu tính từ ngày nhập viện. */
const pad = (n) => String(n).padStart(2, '0');
export const fmtDate = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
};

/** "1210" | "121023" | "12/10/23" | "12-10-2023" | "2019" -> "yyyy-mm-dd" (rỗng nếu không hiểu)
 *  Gõ ngày-tháng không kèm năm thì mặc định năm nay; nhưng ngày đó chưa tới thì
 *  chắc chắn là năm ngoái (bệnh sử chỉ kể chuyện đã xảy ra). */
export function parseNgay(raw) {
    const s = trim(raw);
    if (!s) return '';
    const nowY = new Date().getFullYear();
    const yFix = (y) => (y > 999 ? y : y + (y + 2000 > nowY + 1 ? 1900 : 2000));
    const ok = (y, m, d) => {
        const dt = new Date(y, m - 1, d);
        return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
            ? `${y}-${pad(m)}-${pad(d)}` : '';
    };
    const homNay = new Date(); homNay.setHours(0, 0, 0, 0);
    const okKhongNam = (m, d) => {
        const nay = ok(nowY, m, d);
        if (!nay) return ok(nowY - 1, m, d);          // 29/02 của năm không nhuận
        return new Date(nay + 'T00:00:00') > homNay ? ok(nowY - 1, m, d) : nay;
    };
    const parts = s.split(/[^\d]+/).filter(Boolean);
    if (parts.length >= 3) return ok(yFix(+parts[2]), +parts[1], +parts[0]);
    if (parts.length === 2) return okKhongNam(+parts[1], +parts[0]);        // dd/mm
    const d = parts[0] || '';
    if (d.length === 8) return ok(+d.slice(4), +d.slice(2, 4), +d.slice(0, 2));
    if (d.length === 6) return ok(yFix(+d.slice(4)), +d.slice(2, 4), +d.slice(0, 2));
    if (d.length === 4) return +d >= 1900 ? `${d}-01-01` : okKhongNam(+d.slice(2), +d.slice(0, 2));
    return '';
}

/** Khoảng cách từ ngày đó tới mốc nhập viện -> { n, u } theo cách bệnh án hay ghi */
function khoangCach(iso, moc) {
    if (!iso) return null;
    const a = new Date(iso + 'T00:00:00');
    const b = moc ? new Date(moc + 'T00:00:00') : new Date();
    const days = Math.round((b - a) / 86400000);
    if (!(days >= 0)) return null;
    if (days < 30) return { n: String(days), u: 'ngày' };
    if (days < 365) return { n: String(Math.max(1, Math.round(days / 30))), u: 'tháng' };
    return { n: String(Math.max(1, Math.round(days / 365))), u: 'năm' };
}

/**
 * Một danh sách CNV gắn với một ô textarea.
 * @param thuocCuaBenh (tên bệnh) => ["Amlodipine 5 mg", …] — thuốc đang dùng đã khai
 *        cho đúng bệnh đó; có hàm này thì dòng bệnh nền hiện thuốc thay vì bắt gõ lại.
 * @param onAddThuoc   (tên bệnh) => void — bấm "thêm thuốc" cho bệnh đó
 */
export function createCnvList({ host, addBtn, onChange, groups = null, pickTitle = 'Chọn',
    trangThai = false, thuocCuaBenh = null, onAddThuoc = null,
    mocDate = () => document.getElementById('admission-date')?.value || '' }) {
    let rows = [];
    const ph = host?.dataset.ph || 'Nội dung';

    const sorted = () => rows.slice().sort((a, b) =>
        (parseFloat(b.n) || 0) * (DAYS[b.u] || 365) - (parseFloat(a.n) || 0) * (DAYS[a.u] || 365));

    const rowHtml = (r, i) => `<div class="cnv-row${r.dm ? ' is-date' : ''}" data-i="${i}">
        <button type="button" class="cnv-tag" data-act="mode"
                title="${r.dm ? 'Đang nhập theo ngày — bấm để quay về nhập khoảng cách' : 'Bệnh nhân nhớ đúng ngày? Bấm để nhập ngày'}">
            ${r.dm ? '<i class="fas fa-calendar-day"></i>' : 'CNV'}</button>
        ${r.dm ? `<input class="cnv-d" data-k="d" value="${esc(r.d ? fmtDate(r.d) : (r.dRaw || ''))}"
                   inputmode="numeric" placeholder="ddmmyy" aria-label="Ngày xảy ra">
            <span class="cnv-calc${r.d ? '' : ' is-empty'}">${esc(r.d ? label(r) : 'gõ 121023')}</span>`
            : `<input class="cnv-n" data-k="n" type="number" min="0" value="${esc(r.n || '')}" placeholder="số" aria-label="Số">
        <select class="cnv-u" data-k="u" aria-label="Đơn vị">
            ${UNITS.map(u => `<option ${r.u === u ? 'selected' : ''}>${u}</option>`).join('')}
        </select>`}
        <input class="cnv-s" data-k="s" value="${esc(r.s || '')}" placeholder="${esc(ph)}" aria-label="Nội dung">
        ${groups ? `<button type="button" class="cnv-pick" data-act="pick" title="${esc(pickTitle)}"><i class="fas fa-magnifying-glass"></i></button>` : ''}
        <button type="button" class="cnv-x" data-act="del" title="Xóa dòng"><i class="fas fa-xmark"></i></button>
        ${trangThai ? `<div class="cnv-more">
            <select class="cnv-tt" data-k="tt" aria-label="Hiện đang điều trị thế nào">
                <option value="">— đang điều trị thế nào? —</option>
                ${TINH_TRANG.map(x => `<option ${r.tt === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}
            </select>
            ${thuocCuaBenh ? medHtml(r) : `<input class="cnv-thuoc" data-k="thuoc" value="${esc(r.thuoc || '')}" placeholder="Thuốc đang dùng cho bệnh này" aria-label="Thuốc đang dùng cho bệnh này">`}
        </div>` : ''}
    </div>`;

    /* Thuốc của bệnh này không cho gõ lại ở đây: gõ hai nơi là hai bản khác nhau.
       Ô này chỉ soi vào danh sách "Thuốc đang dùng tại nhà" đã gắn đúng bệnh. */
    function medHtml(r) {
        const meds = trim(r.s) ? thuocCuaBenh(r.s) : [];
        return `<div class="cnv-med">
            ${meds.length
                ? meds.map(m => `<span class="cnv-pill"><i class="fas fa-pills"></i> ${esc(m)}</span>`).join('')
                : `<span class="cnv-med-empty">${trim(r.s) ? 'Chưa gắn thuốc nào cho bệnh này' : 'Ghi tên bệnh trước'}</span>`}
            ${trim(r.s) && onAddThuoc ? `<button type="button" class="cnv-med-add" data-act="med" title="Thêm thuốc đang dùng cho bệnh này"><i class="fas fa-plus"></i> thuốc</button>` : ''}
        </div>`;
    }

    function render() {
        rows = sorted();
        host.innerHTML = rows.length ? rows.map(rowHtml).join('')
            : `<p class="cnv-empty">Chưa có dòng nào — bấm “Thêm dòng” để ghi mốc thời gian.</p>`;
        host.querySelectorAll('.cnv-s').forEach(goiY(flatNames(groups)));
    }

    function get() {
        return sorted().filter(r => trim(r.s) || trim(r.n));
    }

    /** Các dòng chữ để ghép vào ô tiền căn */
    function toLines() {
        return get().map(r => {
            const meds = thuocCuaBenh && trim(r.s) ? thuocCuaBenh(r.s).join(', ') : trim(r.thuoc);
            // Chưa ghi mắc bao lâu thì đừng in "CNV," trơ trọi — vô nghĩa trong bệnh án.
            // Có ngày chính xác thì ghi kèm trong ngoặc, bệnh án đọc là biết mốc thật.
            const dau = trim(r.n) ? `${label(r)}${r.d ? ` (${fmtDate(r.d)})` : ''}, ` : '';
            return [`${dau}${trim(r.s)}`.replace(/,\s*$/, ''),
                trim(r.tt), meds && `thuốc: ${meds}`].filter(Boolean).join(' — ');
        }).join('\n');
    }

    host.addEventListener('input', handle);
    host.addEventListener('change', handle);
    function handle(e) {
        const box = e.target.closest('.cnv-row');
        if (!box || !e.target.dataset.k) return;
        const r = rows[+box.dataset.i];
        if (!r) return;
        // Ô ngày: gõ tới đâu đoán tới đó, đủ số là hiện luôn "CNV mấy tháng"
        if (e.target.dataset.k === 'd') {
            r.dRaw = e.target.value;
            const iso = parseNgay(e.target.value);
            const kc = khoangCach(iso, mocDate());
            r.d = kc ? iso : '';
            if (kc) { r.n = kc.n; r.u = kc.u; }
            const tag = box.querySelector('.cnv-calc');
            if (tag) {
                tag.textContent = kc ? label(r) : (iso ? 'ngày sau khi nhập viện?' : 'gõ 121023');
                tag.classList.toggle('is-empty', !kc);
            }
            if (e.type === 'change' && r.d) {
                e.target.value = fmtDate(r.d);
                r.dRaw = e.target.value;
            }
            onChange?.();
            return;
        }
        r[e.target.dataset.k] = e.target.value;
        // Vừa đặt tên bệnh xong thì soi lại thuốc của bệnh đó, khỏi phải bấm đi bấm lại
        if (e.target.dataset.k === 's' && thuocCuaBenh) {
            const med = box.querySelector('.cnv-med');
            if (med) med.outerHTML = medHtml(r);
        }
        if (e.type === 'change' && !['s', 'tt', 'thuoc'].includes(e.target.dataset.k)) {
            const id = r.id;
            render();
            host.querySelector(`.cnv-row[data-i="${rows.findIndex(x => x.id === id)}"] .cnv-s`)?.focus();
        }
        onChange?.();
    }

    host.addEventListener('click', (e) => {
        const mode = e.target.closest('[data-act="mode"]');
        if (mode) {
            const row = mode.closest('.cnv-row');
            const r = rows[+row.dataset.i];
            if (!r) return;
            r.dm = r.dm ? 0 : 1;               // đổi giữa "cách nhập viện bao lâu" và "ngày chính xác"
            if (!r.dm) { r.d = ''; r.dRaw = ''; }
            const id = r.id;
            render();
            host.querySelector(`.cnv-row[data-i="${rows.findIndex(x => x.id === id)}"] ${r.dm ? '.cnv-d' : '.cnv-n'}`)?.focus();
            onChange?.();
            return;
        }
        const med = e.target.closest('[data-act="med"]');
        if (med) {
            const r = rows[+med.closest('.cnv-row').dataset.i];
            return r && onAddThuoc?.(trim(r.s));
        }
        const pick = e.target.closest('[data-act="pick"]');
        if (pick) {
            const i = +pick.closest('.cnv-row').dataset.i;
            return openListPicker({
                title: pickTitle, groups,
                onPick: ([name]) => {
                    if (!name) return;
                    rows[i].s = name;
                    render();
                    onChange?.();
                }
            });
        }
        if (!e.target.closest('[data-act="del"]')) return;
        rows.splice(+e.target.closest('.cnv-row').dataset.i, 1);
        render();
        onChange?.();
    });

    addBtn?.addEventListener('click', () => {
        rows.push({ id: 'r' + Math.random().toString(36).slice(2, 7), n: '', u: 'năm', s: '', tt: '', thuoc: '' });
        render();
        onChange?.();
        host.querySelector('.cnv-row:last-of-type .cnv-n')?.focus();
    });

    render();
    return {
        get, toLines, render,
        /** Tên các bệnh nền đã khai — cho ô "thuốc này dùng cho bệnh nào" gợi ý */
        names: () => get().map(r => trim(r.s)).filter(Boolean),
        set(arr) {
            rows = (Array.isArray(arr) ? JSON.parse(JSON.stringify(arr)) : [])
                .map(r => ({ id: r.id || 'r' + Math.random().toString(36).slice(2, 7), ...r }));
            render();
        }
    };
}
