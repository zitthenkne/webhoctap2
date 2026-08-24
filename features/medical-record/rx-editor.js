// rx-editor.js — bảng y lệnh thuốc: nhập từng cột thay vì gõ cả câu.
//
// Mỗi dòng: tên thuốc · hàm lượng · liều mỗi lần · số lần/ngày · đường dùng · giờ dùng.
// Máy ghép thành y lệnh chuẩn "Ceftriaxone 1g 1 lọ x 2 (TMC) 8h – 20h" rồi ghi vào ô
// `treatment-detail` cũ, nên phần lưu và xuất file không phải sửa gì.

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

/** "Ceftriaxone 1g 1 lọ x 2 (TMC) 8h – 20h" */
export function rxLine(r) {
    const parts = [trim(r.ten), trim(r.hamLuong)].filter(Boolean).join(' ');
    const dose = [trim(r.lieu), trim(r.soLan) && 'x ' + trim(r.soLan)].filter(Boolean).join(' ');
    return [parts, dose, trim(r.duong), trim(r.gio)].filter(Boolean).join(' ');
}

export const rxToText = (list) => (list || []).filter(r => trim(r.ten))
    .map((r, i) => `${i + 1}. ${rxLine(r)}`).join('\n');

function rowHtml(r, i) {
    return `<div class="rx-row" data-i="${i}">
        <input class="rx-in name" data-k="ten" value="${esc(r.ten)}" placeholder="Tên thuốc" aria-label="Tên thuốc">
        <input class="rx-in" data-k="hamLuong" value="${esc(r.hamLuong)}" placeholder="1g" aria-label="Hàm lượng">
        <input class="rx-in" data-k="lieu" value="${esc(r.lieu)}" placeholder="1 lọ" aria-label="Liều mỗi lần">
        <input class="rx-in" data-k="soLan" value="${esc(r.soLan)}" placeholder="2 lần/ngày" aria-label="Số lần mỗi ngày">
        <input class="rx-in" data-k="duong" value="${esc(r.duong)}" list="rx-routes" placeholder="(TMC)" aria-label="Đường dùng">
        <button type="button" class="rx-x" data-act="del" title="Xóa thuốc"><i class="fas fa-xmark"></i></button>
        <input class="rx-in" data-k="gio" value="${esc(r.gio)}" placeholder="8h – 20h" aria-label="Giờ dùng" style="grid-column:1/-1">
    </div>`;
}

function render() {
    if (!host) return;
    host.innerHTML = (rows.length
        ? rows.map(rowHtml).join('')
        : `<p class="rx-empty">Chưa có thuốc nào — bấm “Thêm thuốc”, mỗi cột một ý, máy ghép thành y lệnh chuẩn.</p>`)
        + (rows.some(r => trim(r.ten))
            ? `<div class="rx-preview">${esc(rxToText(rows))}</div>` : '')
        + `<datalist id="rx-routes">${ROUTES.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`;
}

export function initRx(options) {
    onChangeCb = options?.onChange || (() => { });
    host = $('rx-list');
    if (!host) return;
    render();

    host.addEventListener('input', (e) => {
        const row = e.target.closest('.rx-row');
        if (!row || !e.target.dataset.k) return;
        rows[+row.dataset.i][e.target.dataset.k] = e.target.value;
        const prev = host.querySelector('.rx-preview');
        if (prev) prev.textContent = rxToText(rows); else render();
        onChangeCb();
    });

    host.addEventListener('click', (e) => {
        if (!e.target.closest('[data-act="del"]')) return;
        rows.splice(+e.target.closest('.rx-row').dataset.i, 1);
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
