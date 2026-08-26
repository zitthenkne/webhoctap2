// rx-editor.js — bảng y lệnh thuốc: nhập từng cột thay vì gõ cả câu.
//
// Mỗi dòng: tên thuốc · hàm lượng · liều mỗi lần · số lần/ngày · đường dùng · giờ dùng.
// Máy ghép thành y lệnh chuẩn "Ceftriaxone 1g 1 lọ x 2 (TMC) 8h – 20h" rồi ghi vào ô
// `treatment-detail` cũ, nên phần lưu và xuất file không phải sửa gì.

import { openListPicker } from './list-picker.js';
import { THUOC_GROUPS, findThuoc, canhBaoThuoc } from './thuoc-data.js';
import { checkRxRows } from './clinical-validator.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const trim = (x) => String(x ?? '').trim();

const ROUTES = ['(u)', '(TMC)', '(TB)', '(TDD)', '(TTM)', '(đặt hậu môn)', '(khí dung)', '(nhỏ mắt)', '(bôi)'];

let rows = [];
let host, onChangeCb = () => { };
const newId = () => 'rx' + Math.random().toString(36).slice(2, 7);

export const getRx = () => rows.filter(r => trim(r.ten));

export function setRx(arr) {
    rows = (Array.isArray(arr) ? JSON.parse(JSON.stringify(arr)) : []).map(r => ({ id: r.id || newId(), ...r }));
    render();
}

/**
 * Thêm thuốc vào bảng y lệnh, bỏ qua thuốc đã có (dùng cho nút "lấy thuốc đang
 * dùng ở nhà" — nhập viện thì thuốc nền phải được quyết định tiếp tục hay ngưng).
 * @param {string[]} names tên thuốc
 * @returns {number} số dòng thật sự thêm
 */
export function addRx(names = []) {
    let n = 0;
    names.forEach(ten => {
        const t = trim(ten);
        if (!t || rows.some(r => trim(r.ten).toLowerCase() === t.toLowerCase())) return;
        const r = { id: newId(), ten: t, hamLuong: '', lieu: '', soLan: '', duong: '', gio: '' };
        fillFrom(r, true);
        rows.push(r);
        n++;
    });
    if (n) { render(); onChangeCb(); }
    return n;
}

/** "Ceftriaxone 1g 1 lọ x 2 (TMC) 8h – 20h" */
export function rxLine(r) {
    const parts = [trim(r.ten), trim(r.hamLuong)].filter(Boolean).join(' ');
    const dose = [trim(r.lieu), trim(r.soLan) && 'x ' + trim(r.soLan)].filter(Boolean).join(' ');
    return [parts, dose, trim(r.duong), trim(r.gio)].filter(Boolean).join(' ');
}

export const rxToText = (list) => (list || []).filter(r => trim(r.ten))
    .map((r, i) => `${i + 1}. ${rxLine(r)}`).join('\n');

/* Cảnh báo của từng dòng: phần đỏ là xung đột với chính bệnh nhân này
   (dị ứng, eGFR, bệnh nền), phần xám là ghi chú tĩnh của bản thân thuốc. */
function rxWarnHtml(r, canhBao) {
    const rows = (canhBao || []).map(w =>
        `<div class="rx-warn sev-${w.severity}"><i class="fas fa-triangle-exclamation"></i>
            <span><b>${esc(w.title)}</b> — ${esc(w.message)} <i>${esc(w.act)}</i></span></div>`).join('');
    const tinh = canhBaoThuoc(r.ten);
    const note = tinh ? [['Chống chỉ định', tinh.ccd], ['Thận trọng', tinh.than], ['Dị ứng', tinh.diUng]]
        .filter(([, v]) => v).map(([k, v]) => `<b>${k}:</b> ${esc(v)}`).join(' · ') : '';
    return `<div class="rx-warns">${rows}${note
        ? `<div class="rx-note"><i class="fas fa-circle-info"></i> <span>${note}</span></div>` : ''}</div>`;
}

function rowHtml(r, i, canhBao) {
    return `<div class="rx-row" data-i="${i}">
        <input class="rx-in name" data-k="ten" list="rx-names" value="${esc(r.ten)}" placeholder="Tên thuốc" aria-label="Tên thuốc">
        <button type="button" class="rx-pick" data-act="pick" title="Chọn thuốc theo nhóm — máy điền sẵn hàm lượng, liều, đường dùng, giờ"><i class="fas fa-magnifying-glass"></i></button>
        <input class="rx-in rx-ham" data-k="hamLuong" value="${esc(r.hamLuong)}" placeholder="1g" aria-label="Hàm lượng">
        <input class="rx-in rx-lieu" data-k="lieu" value="${esc(r.lieu)}" placeholder="1 lọ" aria-label="Liều mỗi lần">
        <input class="rx-in rx-lan" data-k="soLan" value="${esc(r.soLan)}" placeholder="2 lần/ngày" aria-label="Số lần mỗi ngày">
        <input class="rx-in rx-duong" data-k="duong" value="${esc(r.duong)}" list="rx-routes" placeholder="(TMC)" aria-label="Đường dùng">
        <button type="button" class="rx-x" data-act="del" title="Xóa thuốc"><i class="fas fa-xmark"></i></button>
        <input class="rx-in rx-gio" data-k="gio" value="${esc(r.gio)}" placeholder="8h – 20h" aria-label="Giờ dùng">
        ${rxWarnHtml(r, canhBao)}
    </div>`;
}

/** Vẽ lại riêng khối cảnh báo của một dòng (gõ tên thuốc thì con trỏ vẫn ở nguyên chỗ) */
function refreshWarn(rowEl, r, i) {
    let canhBao = {};
    try { canhBao = checkRxRows(rows); } catch (err) { console.warn('Rà toa thuốc lỗi:', err); }
    rowEl.querySelector('.rx-warns')?.replaceWith(
        document.createRange().createContextualFragment(rxWarnHtml(r, canhBao[i])));
}

function render() {
    if (!host) return;
    // Rà một lượt cho cả bảng rồi vẽ, thay vì rà lại từng dòng
    let canhBao = {};
    try { canhBao = checkRxRows(rows); } catch (err) { console.warn('Rà toa thuốc lỗi:', err); }
    host.innerHTML = (rows.length
        ? rows.map((r, i) => rowHtml(r, i, canhBao[i])).join('')
        : `<p class="rx-empty">Chưa có thuốc nào — bấm “Thêm thuốc”, mỗi cột một ý, máy ghép thành y lệnh chuẩn.</p>`)
        + (rows.some(r => trim(r.ten))
            ? `<div class="rx-preview">${esc(rxToText(rows))}</div>` : '')
        + `<datalist id="rx-routes">${ROUTES.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`
        + `<datalist id="rx-names">${THUOC_GROUPS.flatMap(g => g.items).map(x => `<option value="${esc(x)}">`).join('')}</datalist>`;
}

/** Điền hàm lượng – liều – số lần – đường – giờ theo thư viện; trả về true nếu có điền gì */
function fillFrom(r, force = false) {
    const t = findThuoc(r.ten);
    if (!t) return false;
    let done = false;
    ['hamLuong', 'lieu', 'soLan', 'duong', 'gio'].forEach(k => {
        if ((force || !trim(r[k])) && t[k]) { r[k] = t[k]; done = true; }
    });
    return done;
}

export function initRx(options) {
    onChangeCb = options?.onChange || (() => { });
    host = $('rx-list');
    if (!host) return;
    render();

    host.addEventListener('input', (e) => {
        const row = e.target.closest('.rx-row');
        if (!row || !e.target.dataset.k) return;
        const r = rows[+row.dataset.i];
        r[e.target.dataset.k] = e.target.value;
        // Gõ (hoặc chọn từ datalist) trúng tên thuốc có sẵn thì điền nốt các cột còn trống,
        // không đè lên con số người dùng đã tự sửa.
        if (e.target.dataset.k === 'ten' && fillFrom(r)) return render(), onChangeCb();
        if (e.target.dataset.k === 'ten') refreshWarn(row, r, +row.dataset.i);
        const prev = host.querySelector('.rx-preview');
        if (prev) prev.textContent = rxToText(rows); else render();
        onChangeCb();
    });

    host.addEventListener('click', (e) => {
        const row = e.target.closest('.rx-row');
        if (!row) return;
        if (e.target.closest('[data-act="pick"]')) {
            const r = rows[+row.dataset.i];
            openListPicker({
                title: 'Chọn thuốc theo nhóm', groups: THUOC_GROUPS, value: r.ten,
                onPick: (names) => {
                    if (!names.length) return;
                    r.ten = names[0];
                    fillFrom(r, true);
                    render();
                    onChangeCb();
                }
            });
            return;
        }
        if (!e.target.closest('[data-act="del"]')) return;
        rows.splice(+row.dataset.i, 1);
        render();
        onChangeCb();
    });

    $('rx-add')?.addEventListener('click', () => {
        rows.push({ id: newId(), ten: '', hamLuong: '', lieu: '', soLan: '', duong: '', gio: '' });
        render();
        onChangeCb();
        host.querySelector('.rx-row:last-of-type .name')?.focus();
    });
}
