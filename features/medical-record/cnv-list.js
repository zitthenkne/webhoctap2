// cnv-list.js — danh sách "CNV <bao lâu>, <nội dung>" dùng cho tiền căn nội khoa / ngoại khoa.
// Mẫu bệnh án ghi mốc tiền căn theo khoảng cách tới lúc nhập viện: "CNV 9 năm, mổ bắt con".
// Mỗi danh sách tự xếp từ xa tới gần rồi ghép thành các dòng chữ vào ô textarea gốc.

import { openListPicker } from './list-picker.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const UNITS = ['ngày', 'tuần', 'tháng', 'năm'];
const DAYS = { 'ngày': 1, 'tuần': 7, 'tháng': 30, 'năm': 365 };

const trim = (x) => String(x ?? '').trim();
const label = (r) => (trim(r.n) ? `CNV ${trim(r.n)} ${r.u || 'năm'}` : 'CNV');

/** Một danh sách CNV gắn với một ô textarea */
export function createCnvList({ host, addBtn, onChange, groups = null, pickTitle = 'Chọn' }) {
    let rows = [];
    const ph = host?.dataset.ph || 'Nội dung';

    const sorted = () => rows.slice().sort((a, b) =>
        (parseFloat(b.n) || 0) * (DAYS[b.u] || 365) - (parseFloat(a.n) || 0) * (DAYS[a.u] || 365));

    const rowHtml = (r, i) => `<div class="cnv-row" data-i="${i}">
        <span class="cnv-tag">CNV</span>
        <input class="cnv-n" data-k="n" type="number" min="0" value="${esc(r.n || '')}" placeholder="số" aria-label="Số">
        <select class="cnv-u" data-k="u" aria-label="Đơn vị">
            ${UNITS.map(u => `<option ${r.u === u ? 'selected' : ''}>${u}</option>`).join('')}
        </select>
        <input class="cnv-s" data-k="s" value="${esc(r.s || '')}" placeholder="${esc(ph)}" aria-label="Nội dung">
        ${groups ? `<button type="button" class="cnv-pick" data-act="pick" title="${esc(pickTitle)}"><i class="fas fa-magnifying-glass"></i></button>` : ''}
        <button type="button" class="cnv-x" data-act="del" title="Xóa dòng"><i class="fas fa-xmark"></i></button>
    </div>`;

    function render() {
        rows = sorted();
        host.innerHTML = rows.length ? rows.map(rowHtml).join('')
            : `<p class="cnv-empty">Chưa có dòng nào — bấm “Thêm dòng” để ghi mốc thời gian.</p>`;
    }

    function get() {
        return sorted().filter(r => trim(r.s) || trim(r.n));
    }

    /** Các dòng chữ để ghép vào ô tiền căn */
    function toLines() {
        return get().map(r => `${label(r)}, ${trim(r.s)}`.replace(/,\s*$/, '')).join('\n');
    }

    host.addEventListener('input', handle);
    host.addEventListener('change', handle);
    function handle(e) {
        const box = e.target.closest('.cnv-row');
        if (!box || !e.target.dataset.k) return;
        const r = rows[+box.dataset.i];
        if (!r) return;
        r[e.target.dataset.k] = e.target.value;
        if (e.type === 'change' && e.target.dataset.k !== 's') {
            const id = r.id;
            render();
            host.querySelector(`.cnv-row[data-i="${rows.findIndex(x => x.id === id)}"] .cnv-s`)?.focus();
        }
        onChange?.();
    }

    host.addEventListener('click', (e) => {
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
        rows.push({ id: 'r' + Math.random().toString(36).slice(2, 7), n: '', u: 'năm', s: '' });
        render();
        onChange?.();
        host.querySelector('.cnv-row:last-of-type .cnv-n')?.focus();
    });

    render();
    return {
        get, toLines,
        set(arr) {
            rows = (Array.isArray(arr) ? JSON.parse(JSON.stringify(arr)) : [])
                .map(r => ({ id: r.id || 'r' + Math.random().toString(36).slice(2, 7), ...r }));
            render();
        }
    };
}
