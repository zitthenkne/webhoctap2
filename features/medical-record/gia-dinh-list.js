// gia-dinh-list.js — tiền căn gia đình ghi cho đủ ý, không chỉ mỗi "cha bị tăng huyết áp".
//
// Mỗi dòng: ai — bệnh gì — phát hiện lúc bao nhiêu tuổi — bị bao lâu rồi — còn sống hay đã mất
// (mất thì do chính bệnh đó hay nguyên nhân khác). Đó là những ý người chấm bệnh án hỏi tới,
// và cũng là thứ quyết định bệnh này có tính là yếu tố nguy cơ gia đình hay không.
//
// Dữ liệu có cấu trúc lưu ở `tienSu.giaDinhChiTiet`; đoạn chữ ghép ra vẫn ghi vào ô
// `history-family` cũ nên trang xem / bản xuất không phải sửa gì.

import { openListPicker } from './list-picker.js';
import { laCauPhuDinh } from './tim-kiem.js';
import { QUAN_HE } from './tien-can-data.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const trim = (x) => String(x ?? '').trim();

const UNITS = ['năm', 'tháng'];
const SONG = ['còn sống', 'đã mất', 'không rõ'];
const DO_BENH = ['do chính bệnh này', 'do nguyên nhân khác', 'không rõ nguyên nhân'];

const newId = () => 'g' + Math.random().toString(36).slice(2, 7);

/** "Cha — Tăng huyết áp, phát hiện lúc 55 tuổi, đã 10 năm, đã mất do chính bệnh này" */
export function giaDinhLine(r) {
    const who = trim(r.qh) || 'Người thân';
    const detail = [
        trim(r.tuoi) && `phát hiện lúc ${trim(r.tuoi)} tuổi`,
        trim(r.n) && `đã ${trim(r.n)} ${r.u || 'năm'}`,
        r.song === 'đã mất' ? ['đã mất', trim(r.doBenh)].filter(Boolean).join(' ') : trim(r.song)
    ].filter(Boolean).join(', ');
    const benh = trim(r.benh) || '(chưa ghi bệnh)';
    return `${who} — ${benh}${detail ? ', ' + detail : ''}`;
}

/** Đọc ngược dòng chữ của bản cũ ("Cha — Tăng huyết áp; Mẹ — Đái tháo đường") */
export function parseGiaDinh(text) {
    return String(text || '').split(/[;\n]+/).map(trim).filter(x => x && !laCauPhuDinh(x)).map(part => {
        const i = part.indexOf(' — ');
        const qh = i < 0 ? '' : trim(part.slice(0, i));
        const rest = i < 0 ? part : trim(part.slice(i + 3));
        // Phần sau dấu phẩy đầu tiên là các ý chi tiết — bản cũ không có thì rest chính là tên bệnh
        const j = rest.indexOf(', ');
        return {
            id: newId(), qh, benh: j < 0 ? rest : trim(rest.slice(0, j)),
            tuoi: '', n: '', u: 'năm', song: '', doBenh: ''
        };
    });
}

export function createGiaDinhList({ host, field, addBtn, groups, onChange }) {
    if (!host || !field) return null;
    let rows = [];

    const opt = (list, val) => list.map(x =>
        `<option ${val === x ? 'selected' : ''}>${esc(x)}</option>`).join('');

    const rowHtml = (r, i) => `<div class="gd-row" data-i="${i}">
        <select class="gd-qh" data-k="qh" aria-label="Quan hệ với bệnh nhân">
            <option value="">— ai? —</option>${opt(QUAN_HE, r.qh)}
        </select>
        <input class="gd-benh" data-k="benh" value="${esc(r.benh)}" placeholder="Mắc bệnh gì" aria-label="Mắc bệnh gì">
        <button type="button" class="gd-pick" data-act="pick" title="Chọn bệnh theo chuyên khoa"><i class="fas fa-magnifying-glass"></i></button>
        <input class="gd-tuoi" data-k="tuoi" type="number" min="0" max="120" value="${esc(r.tuoi)}" placeholder="tuổi" aria-label="Phát hiện lúc bao nhiêu tuổi" title="Phát hiện lúc bao nhiêu tuổi">
        <input class="gd-n" data-k="n" type="number" min="0" value="${esc(r.n)}" placeholder="bao lâu" aria-label="Bị bao lâu rồi" title="Bị bao lâu rồi">
        <select class="gd-u" data-k="u" aria-label="Đơn vị">${opt(UNITS, r.u || 'năm')}</select>
        <select class="gd-song" data-k="song" aria-label="Còn sống hay đã mất">
            <option value="">— tình trạng —</option>${opt(SONG, r.song)}
        </select>
        ${r.song === 'đã mất' ? `<select class="gd-do" data-k="doBenh" aria-label="Mất do đâu">
            <option value="">— mất do? —</option>${opt(DO_BENH, r.doBenh)}
        </select>` : ''}
        <button type="button" class="gd-x" data-act="del" title="Xóa dòng"><i class="fas fa-xmark"></i></button>
        <p class="gd-preview">${esc(giaDinhLine(r))}</p>
    </div>`;

    function render() {
        host.innerHTML = rows.length
            ? rows.map(rowHtml).join('')
            : `<p class="dl-empty">Chưa ghi ai — bấm “Thêm người”, chọn quan hệ rồi chọn bệnh.</p>`;
    }

    const get = () => rows.filter(r => trim(r.qh) || trim(r.benh));

    function sync() {
        field.value = get().map(giaDinhLine).join('; ');
        field.dispatchEvent(new Event('input', { bubbles: true }));
        onChange?.();
    }

    host.addEventListener('input', handle);
    host.addEventListener('change', handle);
    function handle(e) {
        const box = e.target.closest('.gd-row');
        if (!box || !e.target.dataset.k) return;
        const r = rows[+box.dataset.i];
        if (!r) return;
        r[e.target.dataset.k] = e.target.value;
        // Đổi "còn sống / đã mất" thì phải vẽ lại vì có thêm ô "mất do đâu"
        if (e.target.dataset.k === 'song') render();
        else box.querySelector('.gd-preview').textContent = giaDinhLine(r);
        sync();
    }

    host.addEventListener('click', (e) => {
        const row = e.target.closest('.gd-row');
        if (!row) return;
        const i = +row.dataset.i;
        if (e.target.closest('[data-act="pick"]')) {
            return openListPicker({
                title: 'Chọn bệnh trong gia đình', groups, value: rows[i].benh,
                onPick: ([name]) => { if (!name) return; rows[i].benh = name; render(); sync(); }
            });
        }
        if (!e.target.closest('[data-act="del"]')) return;
        rows.splice(i, 1);
        render();
        sync();
    });

    addBtn?.addEventListener('click', () => {
        rows.push({ id: newId(), qh: '', benh: '', tuoi: '', n: '', u: 'năm', song: '', doBenh: '' });
        render();
        host.querySelector('.gd-row:last-of-type .gd-qh')?.focus();
    });

    render();
    return {
        get,
        set(arr) {
            rows = Array.isArray(arr) && arr.length
                ? JSON.parse(JSON.stringify(arr)).map(r => ({ id: r.id || newId(), ...r }))
                : parseGiaDinh(field.value);   // bệnh án cũ chỉ có dòng chữ — đọc ngược ra
            render();
        }
    };
}
