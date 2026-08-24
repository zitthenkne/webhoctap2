// doi-list.js — danh sách hai cột dùng chung cho các mục "mỗi dòng một ý".
//
// Bệnh kèm (tên bệnh — mức độ), dị ứng (tác nhân — biểu hiện), tiền căn gia đình
// (quan hệ — bệnh), thuốc đang dùng (tên thuốc — liều)… đều cùng một kiểu:
// vài dòng, mỗi dòng hai ô, có thể mở bảng chọn thay vì gõ tay.
//
// Không thêm trường lưu mới: các dòng ghép vào chính ô chữ cũ theo dạng
// "A — B; A — B" rồi đọc ngược lại khi mở bệnh án, nên record giữ nguyên cấu trúc.

import { openListPicker } from './list-picker.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const trim = (x) => String(x ?? '').trim();

/** "Tăng huyết áp — độ 2; Đái tháo đường type 2" -> [{a, b}, …] */
export function parseDoi(text, sep = ' — ') {
    return String(text || '').split(/[;\n]+/).map(trim).filter(Boolean).map(part => {
        const i = part.indexOf(sep);
        return i < 0 ? { a: part, b: '' }
            : { a: trim(part.slice(0, i)), b: trim(part.slice(i + sep.length)) };
    });
}

const toText = (rows, sep) => rows
    .filter(r => trim(r.a))
    .map(r => trim(r.a) + (trim(r.b) ? sep + trim(r.b) : ''))
    .join('; ');

/**
 * @param host       hộp chứa các dòng
 * @param field      ô chữ gốc — nguồn lưu duy nhất
 * @param addBtn     nút thêm dòng
 * @param pullBtn    nút chép sẵn dữ liệu từ nơi khác (không bắt buộc)
 * @param groupsA    nhóm cho bảng chọn cột trái (không có thì không hiện nút chọn)
 * @param listA/listB id của <datalist> gợi ý cho từng cột
 * @param suggest    (a) => b — máy tự điền cột phải khi biết cột trái
 * @param getPast    () => [a, …] — nguồn cho nút pullBtn
 */
export function createDoiList({
    host, field, addBtn, pullBtn,
    sep = ' — ', phA = '', phB = '', listA = '', listB = '',
    groupsA = null, pickTitle = 'Chọn',
    suggest = null, getPast = null, empty = 'Chưa có dòng nào.',
    onChange
}) {
    if (!host || !field) return null;
    let rows = parseDoi(field.value, sep);

    const rowHtml = (r, i) => `<div class="dl-row" data-i="${i}">
        <input class="dl-a" data-k="a" ${listA ? `list="${listA}"` : ''} value="${esc(r.a)}"
               placeholder="${esc(phA)}" aria-label="${esc(phA)}">
        <input class="dl-b" data-k="b" ${listB ? `list="${listB}"` : ''} value="${esc(r.b)}"
               placeholder="${esc(phB)}" aria-label="${esc(phB)}">
        ${groupsA ? `<button type="button" class="dl-pick" data-act="pick" title="${esc(pickTitle)}"><i class="fas fa-magnifying-glass"></i></button>` : ''}
        <button type="button" class="dl-x" data-act="del" title="Xóa dòng"><i class="fas fa-xmark"></i></button>
    </div>`;

    function render() {
        host.classList.toggle('no-pick', !groupsA);
        host.innerHTML = rows.length
            ? rows.map(rowHtml).join('')
            : `<p class="dl-empty">${esc(empty)}</p>`;
    }

    /** Ghi ngược vào ô chữ gốc rồi báo cho trang biết để lưu */
    function flush() {
        field.value = toText(rows, sep);
        field.dispatchEvent(new Event('input', { bubbles: true }));
        onChange?.();
    }

    /** Điền cột phải khi máy suy được, và chỉ khi người dùng chưa tự điền */
    function fill(r) {
        if (trim(r.b) || !trim(r.a)) return false;
        const b = suggest?.(r.a) || '';
        if (!b) return false;
        r.b = b;
        return true;
    }

    host.addEventListener('input', (e) => {
        const box = e.target.closest('.dl-row');
        if (!box || !e.target.dataset.k) return;
        const r = rows[+box.dataset.i];
        if (!r) return;
        r[e.target.dataset.k] = e.target.value;
        if (e.target.dataset.k === 'a' && fill(r)) box.querySelector('.dl-b').value = r.b;
        flush();
    });

    host.addEventListener('click', (e) => {
        const pick = e.target.closest('[data-act="pick"]');
        if (pick) {
            const i = +pick.closest('.dl-row').dataset.i;
            return openListPicker({
                title: pickTitle, groups: groupsA,
                onPick: ([a]) => {
                    if (!a) return;
                    rows[i].a = a;
                    fill(rows[i]);
                    render();
                    flush();
                }
            });
        }
        if (!e.target.closest('[data-act="del"]')) return;
        rows.splice(+e.target.closest('.dl-row').dataset.i, 1);
        render();
        flush();
    });

    addBtn?.addEventListener('click', () => {
        rows.push({ a: '', b: '' });
        render();
        flush();
        host.querySelector('.dl-row:last-of-type .dl-a')?.focus();
    });

    pullBtn?.addEventListener('click', () => {
        const have = new Set(rows.map(r => trim(r.a).toLowerCase()));
        let n = 0;
        (getPast?.() || []).forEach(a => {
            if (!a || have.has(a.toLowerCase())) return;
            have.add(a.toLowerCase());
            const r = { a, b: '' };
            fill(r);
            rows.push(r);
            n++;
        });
        render();
        flush();
        pullBtn.dispatchEvent(new CustomEvent('dl-pulled', { detail: { n }, bubbles: true }));
    });

    render();
    return {
        /** Ô chữ bị sửa tay hoặc bệnh án vừa nạp xong -> dựng lại các dòng */
        sync() {
            if (toText(rows, sep) === trim(field.value)) return;
            rows = parseDoi(field.value, sep);
            render();
        },
        /** Chấm lại cột phải cho các dòng còn trống, sau khi có thêm dữ kiện */
        regrade() {
            const n = rows.filter(fill).length;
            if (n) { render(); flush(); }
            return n;
        }
    };
}
