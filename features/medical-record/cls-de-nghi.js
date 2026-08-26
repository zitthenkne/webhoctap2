// cls-de-nghi.js — mục XI. CẬN LÂM SÀNG ĐỀ NGHỊ, mỗi dòng một đề nghị có mục đích.
//
// Trước đây mục XI là một ô chữ rời: sinh viên liệt kê xét nghiệm ở đây, còn lý do
// thì nằm trong ô khác, nên hai bên trôi mỗi nơi một kiểu và thầy hỏi "đề nghị cái
// này để làm gì" là tắc. Nay mỗi cận lâm sàng đi kèm luôn mục đích và bệnh cảnh nó
// nhắm tới, lại đối chiếu ngược với cây biện luận ở mục X:
//   · CLS đã ghi trong nhánh biện luận mà mục XI còn thiếu  -> chip để bấm thêm
//   · CLS ở mục XI chưa nói rõ để làm gì                    -> nhắc ngay trên dòng
//   · Mục đích suy ra từ mức nghĩ của nhánh (nghĩ nhiều -> xác định, v.v.)
//
// Vẫn lưu vào chính ô chữ cũ (labs-proposed) theo dạng mỗi dòng
// "Tên CLS — để loại trừ Nhồi máu cơ tim", nên bệnh án cũ mở lên vẫn đọc được.

import { CLS_PURPOSES, attachTypeahead } from './goi-y-go.js';
import { openListPicker } from './list-picker.js';
import { CLS_DE_NGHI } from './de-nghi-data.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const trim = (x) => String(x ?? '').trim();
const low = (x) => trim(x).toLowerCase();

const flatNames = (groups) => groups.flatMap(g => g.items);

/** "Cấy máu — để loại trừ nhiễm trùng huyết" -> { ten, mucDich, dich } */
export function parseCls(line) {
    const bits = String(line || '').split(' — ').map(trim);
    const ten = bits.shift() || '';
    const tail = bits.join(' — ');
    const hit = CLS_PURPOSES.find(([, t]) => low(tail).startsWith(low(t)));
    return hit
        ? { ten, mucDich: hit[1], dich: trim(tail.slice(hit[1].length)) }
        : { ten, mucDich: '', dich: tail };
}

const clsToLine = (r) => [trim(r.ten), trim(r.mucDich) && [trim(r.mucDich), trim(r.dich)].filter(Boolean).join(' ')]
    .filter(Boolean).join(' — ');

const needTarget = (mucDich) => !!CLS_PURPOSES.find(([, t]) => t === mucDich)?.[2];

/**
 * @param field    ô chữ gốc (labs-proposed) — nguồn lưu duy nhất
 * @param rationale ô biện luận đề nghị (labs-rationale) cho nút ghép lý do
 * @param host     hộp chứa các dòng
 * @param addBtn   nút thêm dòng · blHost hộp đối chiếu với mục X · buildBtn nút ghép lý do
 * @param derived  () => [{ten, mucDich, dich, vanDe}] — CLS đã ghi trong cây biện luận
 * @param targets  () => [tên bệnh cảnh] cho ô "… cái gì?"
 */
export function initClsDeNghi({ field, rationale, host, addBtn, blHost, buildBtn,
    derived = () => [], targets = () => [], onChange, autoGrow, toast }) {
    if (!field || !host) return null;
    let rows = [];

    let writing = false;
    const read = () => String(field.value || '').split('\n').map(trim).filter(Boolean).map(parseCls);
    const write = () => {
        writing = true;
        field.value = rows.filter(r => trim(r.ten)).map(clsToLine).join('\n');
        field.dispatchEvent(new Event('input', { bubbles: true }));
        writing = false;
        autoGrow?.(field);
        autoRationale();
        onChange?.();
    };

    /* Đoạn "biện luận đề nghị CLS" ghép lại ngay mỗi khi danh sách đổi — chỉ ghi khi
       ô còn trống hoặc vẫn đúng bản máy ghép lần trước, sửa tay là máy buông. */
    let lastLyDo = '';
    function autoRationale() {
        if (!rationale) return;
        const t = buildRationale();
        const cur = String(rationale.value || '').trim();
        if (!t || (cur && cur !== lastLyDo)) return;
        rationale.value = t;
        lastLyDo = t;
        rationale.dispatchEvent(new Event('input', { bubbles: true }));
        autoGrow?.(rationale);
    }
    // Sửa thẳng trong ô chữ (bản máy ghép) thì các dòng ở trên phải theo kịp
    field.addEventListener('input', () => { if (!writing) { rows = read(); render(); } });

    /* Nguồn của một dòng: có trong cây biện luận thì nói rõ phục vụ nhánh nào */
    const nguon = (ten) => derived().find(d => low(d.ten) === low(ten));

    /* Nhãn dưới mỗi dòng: từ nhánh nào của mục X, hoặc nhắc còn thiếu mục đích */
    function srcHtml(r) {
        const src = nguon(r.ten);
        if (src) return `<span class="cd-tag ok"><i class="fas fa-diagram-project"></i> mục X${src.vanDe ? ' · ' + esc(src.vanDe) : ''}${src.dich ? ' → ' + esc(src.dich) : ''}</span>`;
        return trim(r.ten) && !trim(r.mucDich)
            ? `<span class="cd-tag warn"><i class="fas fa-circle-question"></i> chưa nói rõ đề nghị để làm gì</span>` : '';
    }

    function rowHtml(r, i) {
        return `<div class="cd-row${trim(r.ten) && !trim(r.mucDich) ? ' is-hollow' : ''}" data-i="${i}">
            <input class="cd-ten" data-k="ten" value="${esc(r.ten)}" placeholder="Tên cận lâm sàng" aria-label="Tên cận lâm sàng">
            <select class="cd-muc" data-k="mucDich" aria-label="Đề nghị để làm gì">
                <option value="">— đề nghị để làm gì? —</option>
                ${CLS_PURPOSES.map(([nhan, tail]) =>
            `<option value="${esc(tail)}" ${r.mucDich === tail ? 'selected' : ''}>${esc(nhan)}</option>`).join('')}
            </select>
            <input class="cd-dich" data-k="dich" list="cd-dich-list" value="${esc(r.dich)}"
                   placeholder="${needTarget(r.mucDich) ? '… bệnh cảnh nào?' : 'ghi thêm (không bắt buộc)'}"
                   aria-label="Nhắm tới bệnh cảnh nào">
            <button type="button" class="cd-pick" data-act="pick" title="Chọn cận lâm sàng"><i class="fas fa-magnifying-glass"></i></button>
            <button type="button" class="cd-x" data-act="del" title="Xóa dòng"><i class="fas fa-xmark"></i></button>
            <div class="cd-src">${srcHtml(r)}</div>
        </div>`;
    }

    function render() {
        host.innerHTML = rows.length
            ? rows.map(rowHtml).join('')
            : `<p class="dl-empty">Chưa có đề nghị nào — bấm “Thêm dòng”, hoặc lấy thẳng từ cây biện luận bên dưới.</p>`;
        host.querySelectorAll('.cd-ten').forEach(el =>
            attachTypeahead(el, { items: flatNames(CLS_DE_NGHI) }));
        const dl = $('cd-dich-list');
        if (dl) dl.innerHTML = [...new Set(targets().filter(Boolean))]
            .map(x => `<option value="${esc(x)}">`).join('');
        renderBl();
    }

    /* ---------- đối chiếu với cây biện luận (mục X) ---------- */
    function renderBl() {
        if (!blHost) return;
        const co = (ten) => rows.some(r => low(r.ten) === low(ten));
        const thieu = derived().filter(d => !co(d.ten));
        const tong = derived().length;
        if (!tong) {
            blHost.innerHTML = `<div class="tg-line"><i class="fas fa-diagram-project"></i>
                Cây biện luận ở mục X chưa ghi cận lâm sàng nào cho các nhánh —
                đề nghị ở đây sẽ không có chỗ dựa để giải thích.</div>`;
            return;
        }
        if (!thieu.length) {
            blHost.innerHTML = `<div class="tg-line is-ok"><i class="fas fa-circle-check"></i>
                Đã có đủ ${tong} cận lâm sàng mà mục X đề nghị.</div>`;
            return;
        }
        blHost.innerHTML = `<div class="tg-line"><i class="fas fa-diagram-project"></i>
            <span class="tg-benh">Mục X còn ${thieu.length} cận lâm sàng chưa đưa xuống đây</span>
            ${thieu.map((d, i) => `<button type="button" class="tg-chip" data-bl="${i}">+ ${esc(d.ten)}
                <em>(${esc(d.mucDich)}${d.dich ? ' ' + esc(d.dich) : ''})</em></button>`).join('')}
            <button type="button" class="tg-chip is-all" data-bl-all="1"><i class="fas fa-angles-down"></i> Lấy hết</button>
        </div>`;
    }

    /** Thêm một dòng, bỏ qua nếu đã có cùng tên */
    function add(r) {
        if (!trim(r.ten) || rows.some(x => low(x.ten) === low(r.ten))) return false;
        rows.push({ ten: trim(r.ten), mucDich: r.mucDich || '', dich: r.dich || '' });
        return true;
    }

    host.addEventListener('input', (e) => {
        const box = e.target.closest('.cd-row');
        if (!box || !e.target.dataset.k) return;
        rows[+box.dataset.i][e.target.dataset.k] = e.target.value;
        write();
        if (e.target.dataset.k !== 'ten') return;
        const r = rows[+box.dataset.i];
        box.classList.toggle('is-hollow', !!trim(r.ten) && !trim(r.mucDich));
        box.querySelector('.cd-src').innerHTML = srcHtml(r);
        renderBl();
    });

    host.addEventListener('change', (e) => {
        if (e.target.dataset.k !== 'mucDich') return;
        const box = e.target.closest('.cd-row');
        rows[+box.dataset.i].mucDich = e.target.value;
        write();
        render();
    });

    host.addEventListener('click', (e) => {
        const box = e.target.closest('.cd-row');
        if (!box) return;
        const i = +box.dataset.i;
        if (e.target.closest('[data-act="pick"]')) {
            return openListPicker({
                title: 'Chọn cận lâm sàng đề nghị', groups: CLS_DE_NGHI,
                onPick: ([ten]) => {
                    if (!ten) return;
                    rows[i].ten = ten;
                    // Nhánh biện luận đã đề nghị CLS này thì bê luôn mục đích của nó xuống
                    const src = nguon(ten);
                    if (src && !trim(rows[i].mucDich)) { rows[i].mucDich = src.mucDich; rows[i].dich = src.dich; }
                    render();
                    write();
                }
            });
        }
        if (!e.target.closest('[data-act="del"]')) return;
        rows.splice(i, 1);
        render();
        write();
    });

    addBtn?.addEventListener('click', () => {
        rows.push({ ten: '', mucDich: '', dich: '' });
        render();
        host.querySelector('.cd-row:last-of-type .cd-ten')?.focus();
    });

    blHost?.addEventListener('click', (e) => {
        const all = e.target.closest('[data-bl-all]');
        const one = e.target.closest('[data-bl]');
        if (!all && !one) return;
        const co = (ten) => rows.some(r => low(r.ten) === low(ten));
        const thieu = derived().filter(d => !co(d.ten));
        const them = all ? thieu : [thieu[+one.dataset.bl]].filter(Boolean);
        const n = them.filter(add).length;
        render();
        write();
        if (n) toast?.(`Đã lấy ${n} cận lâm sàng từ cây biện luận — mục đích lấy theo mức nghĩ của nhánh.`, 'success');
    });

    /* ---------- ghép đoạn "biện luận đề nghị cận lâm sàng" ---------- */
    function buildRationale() {
        const nhom = CLS_PURPOSES.map(([nhan, tail]) => [nhan,
            rows.filter(r => trim(r.ten) && r.mucDich === tail)
                .map(r => trim(r.ten) + (trim(r.dich) ? ` (${trim(r.dich)})` : ''))])
            .filter(([, xs]) => xs.length);
        const chuaRo = rows.filter(r => trim(r.ten) && !trim(r.mucDich)).map(r => trim(r.ten));
        if (!nhom.length && !chuaRo.length) return '';
        const out = nhom.map(([nhan, xs], i) => `${i + 1}. ${nhan}: ${xs.join('; ')}.`);
        if (chuaRo.length) out.push(`Chưa nêu mục đích: ${chuaRo.join('; ')}.`);
        return out.join('\n');
    }

    buildBtn?.addEventListener('click', () => {
        const t = buildRationale();
        if (!t) return toast?.('Chưa có cận lâm sàng nào để ghép lý do.', 'warning');
        rationale.value = t;
        rationale.dispatchEvent(new Event('input', { bubbles: true }));
        autoGrow?.(rationale);
        onChange?.();
        toast?.('Đã ghép lý do đề nghị theo đúng nhóm mục đích.', 'success');
    });

    rows = read();
    render();

    return {
        /** Ô chữ vừa bị sửa tay / vừa nạp bệnh án -> dựng lại các dòng */
        sync() {
            const now = rows.filter(r => trim(r.ten)).map(clsToLine).join('\n');
            if (now === trim(field.value)) return renderBl();
            rows = read();
            render();
        },
        /** Cây biện luận đổi -> vẽ lại phần đối chiếu và nhãn nguồn */
        refresh: render,
        add(r) { if (add(r)) { render(); write(); } }
    };
}
