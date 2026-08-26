// doi-list.js — danh sách hai cột dùng chung cho các mục "mỗi dòng một ý".
//
// Bệnh kèm (tên bệnh — mức độ), dị ứng (tác nhân — biểu hiện), tiền căn gia đình
// (quan hệ — bệnh), thuốc đang dùng (tên thuốc — liều)… đều cùng một kiểu:
// vài dòng, mỗi dòng hai ô, có thể mở bảng chọn thay vì gõ tay.
//
// Không thêm trường lưu mới: các dòng ghép vào chính ô chữ cũ theo dạng
// "A — B; A — B" rồi đọc ngược lại khi mở bệnh án, nên record giữ nguyên cấu trúc.

import { openListPicker } from './list-picker.js';
import { fold, laCauPhuDinh } from './tim-kiem.js';
import { attachTypeahead } from './goi-y-go.js';
/* Gõ là gợi ý ngay, không phải mở bảng chọn mới tìm được tên. Tìm không dấu nên
   gõ "dai thao duong" vẫn ra "Đái tháo đường". attachTypeahead tự bỏ qua ô đã gắn
   nên gọi lại sau mỗi lần vẽ cũng không sao. */
const flatNames = (groups) => [...new Set((groups || []).flatMap(g => g.items || []))];
const goiY = (items) => (el) => attachTypeahead(el, { items });

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const trim = (x) => String(x ?? '').trim();

/** "Tăng huyết áp — độ 2; Đái tháo đường type 2" -> [{a, b, c}, …]
    Cột thứ ba (nếu có) mang dấu markC nên đọc ngược không lẫn vào cột b:
    "Amlodipine — 5 mg 1 viên (u) — điều trị: Tăng huyết áp". */
export function parseDoi(text, sep = ' — ', markC = '') {
    const reC = markC ? new RegExp('^' + markC + '\\s*:\\s*', 'i') : null;
    return String(text || '').split(/[;\n]+/).map(trim).filter(x => x && !laCauPhuDinh(x)).map(part => {
        const bits = part.split(sep).map(trim);
        const row = { a: bits.shift() || '', b: '', c: '' };
        bits.forEach(x => {
            if (reC && reC.test(x)) row.c = trim(x.replace(reC, ''));
            else row.b = row.b ? row.b + sep + x : x;
        });
        return row;
    });
}

const toText = (rows, sep, markC = '') => rows
    .filter(r => trim(r.a))
    .map(r => trim(r.a)
        + (trim(r.b) ? sep + trim(r.b) : '')
        + (markC && trim(r.c) ? `${sep}${markC}: ${trim(r.c)}` : ''))
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
 * @param keepOther  giữ nguyên những dòng không phải của danh sách này (ô chữ đang
 *                   dùng chung với nơi khác, vd PARA và kinh nguyệt trong tiền căn sản)
 * @param phC/listC/markC bật cột thứ ba (vd "thuốc này dùng cho bệnh nào")
 * @param suggestC   (a) => c — máy tự điền cột ba khi biết cột trái
 */
export function createDoiList({
    host, field, addBtn, pullBtn,
    sep = ' — ', phA = '', phB = '', listA = '', listB = '',
    phC = '', listC = '', markC = '', suggestC = null, keepOther = false,
    groupsA = null, pickTitle = 'Chọn',
    suggest = null, getPast = null, empty = 'Chưa có dòng nào.',
    onChange
}) {
    if (!host || !field) return null;
    let other = [];                       // dòng của nơi khác trong cùng ô chữ
    const readRows = () => {
        if (!keepOther) return parseDoi(field.value, sep, markC);
        const parts = String(field.value || '').split(/[;\n]+/).map(trim).filter(Boolean);
        other = parts.filter(x => !x.includes(sep));
        return parseDoi(parts.filter(x => x.includes(sep)).join('\n'), sep, markC);
    };
    let rows = readRows();

    const rowHtml = (r, i) => `<div class="dl-row" data-i="${i}">
        <input class="dl-a" data-k="a" ${listA ? `list="${listA}"` : ''} value="${esc(r.a)}"
               placeholder="${esc(phA)}" aria-label="${esc(phA)}">
        <input class="dl-b" data-k="b" ${listB ? `list="${listB}"` : ''} value="${esc(r.b)}"
               placeholder="${esc(phB)}" aria-label="${esc(phB)}">
        ${phC ? `<input class="dl-c" data-k="c" ${listC ? `list="${listC}"` : ''} value="${esc(r.c || '')}"
               placeholder="${esc(phC)}" aria-label="${esc(phC)}">` : ''}
        ${groupsA ? `<button type="button" class="dl-pick" data-act="pick" title="${esc(pickTitle)}"><i class="fas fa-magnifying-glass"></i></button>` : ''}
        <button type="button" class="dl-x" data-act="del" title="Xóa dòng"><i class="fas fa-xmark"></i></button>
    </div>`;

    function render() {
        host.classList.toggle('no-pick', !groupsA);
        host.classList.toggle('has-c', !!phC);
        host.innerHTML = rows.length
            ? rows.map(rowHtml).join('')
            : `<p class="dl-empty">${esc(empty)}</p>`;
        host.querySelectorAll('.dl-a').forEach(goiY(flatNames(groupsA)));
    }

    /** Ghi ngược vào ô chữ gốc rồi báo cho trang biết để lưu */
    let writing = false;
    function flush() {
        writing = true;
        field.value = [...other, toText(rows, sep, markC)].filter(Boolean).join('\n');
        field.dispatchEvent(new Event('input', { bubbles: true }));
        writing = false;
        onChange?.();
    }

    /* Ô chữ dùng chung: nơi khác vừa ghi thêm dòng (PARA, kinh nguyệt…) thì phải
       đọc lại ngay, không thì lần flush sau sẽ ghi đè mất dòng của người ta. */
    if (keepOther) field.addEventListener('input', () => {
        if (writing) return;
        rows = readRows();
        render();
    });

    /** Điền cột phải / cột ba khi máy suy được, và chỉ khi người dùng chưa tự điền */
    function fill(r) {
        let done = false;
        if (!trim(r.a)) return false;
        if (!trim(r.b)) {
            const b = suggest?.(r.a) || '';
            if (b) { r.b = b; done = true; }
        }
        if (phC && !trim(r.c)) {
            const c = suggestC?.(r.a) || '';
            if (c) { r.c = c; done = true; }
        }
        return done;
    }

    host.addEventListener('input', (e) => {
        const box = e.target.closest('.dl-row');
        if (!box || !e.target.dataset.k) return;
        const r = rows[+box.dataset.i];
        if (!r) return;
        r[e.target.dataset.k] = e.target.value;
        if (e.target.dataset.k === 'a' && fill(r)) {
            box.querySelector('.dl-b').value = r.b;
            if (phC) box.querySelector('.dl-c').value = r.c || '';
        }
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
        rows.push({ a: '', b: '', c: '' });
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
            const r = { a, b: '', c: '' };
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
        get: () => rows.filter(r => trim(r.a)).map(r => ({ ...r })),
        /** Thêm một dòng có sẵn nội dung (chip gợi ý, chuyển dữ liệu từ nơi khác) */
        add({ a = '', b = '', c = '' } = {}) {
            if (rows.some(r => fold(r.a) === fold(a) && fold(r.c) === fold(c))) return false;
            const r = { a, b, c };
            fill(r);
            rows.push(r);
            render();
            flush();
            return true;
        },
        /** Gắn cột ba cho dòng đang có sẵn (vd vừa bổ sung bệnh nền cho thuốc đó) */
        setBenh(a, c) {
            const r = rows.find(x => fold(x.a) === fold(a));
            if (!r || trim(r.c)) return false;
            r.c = c;
            render();
            flush();
            return true;
        },
        /** Ô chữ bị sửa tay hoặc bệnh án vừa nạp xong -> dựng lại các dòng */
        sync() {
            if ([...other, toText(rows, sep, markC)].filter(Boolean).join('\n') === trim(field.value)) return;
            rows = readRows();
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
