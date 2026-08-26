// cls-de-nghi.js — mục XI. CẬN LÂM SÀNG ĐỀ NGHỊ, mỗi dòng một đề nghị có mục đích.
//
// Trước đây mục XI là một ô chữ rời: sinh viên liệt kê xét nghiệm ở đây, còn lý do
// thì nằm trong ô khác, nên hai bên trôi mỗi nơi một kiểu và thầy hỏi "đề nghị cái
// này để làm gì" là tắc. Nay mỗi cận lâm sàng đi kèm luôn mục đích, bệnh cảnh nó
// nhắm tới và dấu hiệu cụ thể đang mong tìm thấy, lại đối chiếu ngược với cây biện
// luận ở mục X:
//   · CLS đã ghi trong nhánh biện luận mà mục XI còn thiếu  -> chip để bấm thêm
//   · CLS ở mục XI chưa nói rõ để làm gì                    -> nhắc ngay trên dòng
//   · CLS xác định / loại trừ mà chưa nói mong thấy gì      -> nhắc ngay trên dòng
//   · Mục đích suy ra từ mức nghĩ của nhánh (nghĩ nhiều -> xác định, v.v.)
//
// Ba ô trên một dòng đã là một câu biện luận đề nghị hoàn chỉnh, nên mục XI bỏ hẳn
// ô "biện luận đề nghị cận lâm sàng" ở dưới: ô đó chỉ gom lại đúng những gì đã ghi
// ở đây, viết hai lần một ý mà lần sau lại dễ lệch với lần trước.
//
// Vẫn lưu vào chính ô chữ cũ (labs-proposed) theo dạng mỗi dòng
// "Tên CLS — để loại trừ Nhồi máu cơ tim — tìm: D-dimer âm tính", nên bệnh án cũ
// mở lên vẫn đọc được (dòng cũ chỉ thiếu vế "tìm:").

import { CLS_PURPOSES, attachTypeahead } from './goi-y-go.js';
import { openListPicker } from './list-picker.js';
import { CLS_DE_NGHI } from './de-nghi-data.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const trim = (x) => String(x ?? '').trim();
const low = (x) => trim(x).toLowerCase();

const flatNames = (groups) => groups.flatMap(g => g.items);

/** "Cấy máu — để loại trừ nhiễm trùng huyết — tìm: cấy mọc vi khuẩn"
 *  -> { ten, mucDich, dich, kyVong } */
export function parseCls(line) {
    let txt = String(line || '');
    let kyVong = '';
    const m = txt.match(/\s+—\s+tìm:\s*([\s\S]*)$/i);
    if (m) { kyVong = trim(m[1]); txt = txt.slice(0, m.index); }
    const bits = txt.split(' — ').map(trim);
    const ten = bits.shift() || '';
    const tail = bits.join(' — ');
    const hit = CLS_PURPOSES.find(([, t]) => low(tail).startsWith(low(t)));
    return hit
        ? { ten, mucDich: hit[1], dich: trim(tail.slice(hit[1].length)), kyVong }
        : { ten, mucDich: '', dich: tail, kyVong };
}

const clsToLine = (r) => [
    trim(r.ten),
    trim(r.mucDich) && [trim(r.mucDich), trim(r.dich)].filter(Boolean).join(' '),
    trim(r.kyVong) && 'tìm: ' + trim(r.kyVong)
].filter(Boolean).join(' — ');

const needTarget = (mucDich) => !!CLS_PURPOSES.find(([, t]) => t === mucDich)?.[2];

/* Câu hỏi của ô "mong tìm thấy gì" đổi theo mục đích: đề nghị để loại trừ thì thứ
   phải nói ra là dấu hiệu âm tính, còn đề nghị để xác định thì là dấu hiệu dương. */
const KY_VONG_PH = {
    'để chẩn đoán xác định': 'mong thấy hình ảnh / chỉ số gì? vd: đông đặc thùy dưới phải',
    'để chẩn đoán phân biệt': 'dấu hiệu nào tách được hai bệnh? vd: BNP > 400 nghiêng về suy tim',
    'để loại trừ': 'thấy gì thì loại trừ được? vd: D-dimer âm tính',
    'để tìm biến chứng': 'biến chứng đó hiện ra dưới dạng gì? vd: dịch màng phổi lượng nhiều',
    'để đánh giá mức độ nặng': 'chỉ số nào cho biết nặng? vd: lactat > 2 mmol/L',
    'để tìm nguyên nhân, yếu tố thúc đẩy': 'mong tìm tác nhân gì? vd: cấy đàm mọc phế cầu',
    'để theo dõi điều trị': 'theo dõi con số nào, mong nó đổi ra sao?',
    'xét nghiệm thường quy': 'ghi thêm nếu có ý riêng (không bắt buộc)'
};

/**
 * @param field    ô chữ gốc (labs-proposed) — nguồn lưu duy nhất
 * @param host     hộp chứa các dòng
 * @param addBtn   nút thêm dòng · blHost hộp đối chiếu với mục X
 * @param derived  () => [{ten, mucDich, dich, vanDe}] — CLS đã ghi trong cây biện luận
 * @param required () => [{ten, benh}] — CLS bắt buộc của chẩn đoán đang ghi
 * @param targets  () => [tên bệnh cảnh] cho ô "… cái gì?"
 */
export function initClsDeNghi({ field, host, addBtn, blHost,
    derived = () => [], required = () => [], targets = () => [], onChange, autoGrow, toast }) {
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
        onChange?.();
    };

    // Sửa thẳng trong ô chữ (bản máy ghép) thì các dòng ở trên phải theo kịp
    field.addEventListener('input', () => { if (!writing) { rows = read(); render(); } });

    /* Nguồn của một dòng: có trong cây biện luận thì nói rõ phục vụ nhánh nào */
    const nguon = (ten) => derived().find(d => low(d.ten) === low(ten));

    /* Nhãn dưới mỗi dòng: từ nhánh nào của mục X, hoặc nhắc còn thiếu mục đích */
    /** Dòng đã đủ ý chưa: có mục đích, và nếu mục đích cần bệnh cảnh thì phải nói
        luôn mong tìm thấy gì — đó mới là câu trả lời cho "đề nghị để làm gì". */
    const thieuKyVong = (r) => !!trim(r.ten) && needTarget(r.mucDich) && !trim(r.kyVong);

    function srcHtml(r) {
        const tags = [];
        const src = nguon(r.ten);
        if (src) tags.push(`<span class="cd-tag ok"><i class="fas fa-diagram-project"></i> mục X${src.vanDe ? ' · ' + esc(src.vanDe) : ''}${src.dich ? ' → ' + esc(src.dich) : ''}</span>`);
        else if (trim(r.ten) && !trim(r.mucDich))
            tags.push(`<span class="cd-tag warn"><i class="fas fa-circle-question"></i> chưa nói rõ đề nghị để làm gì</span>`);
        if (thieuKyVong(r))
            tags.push(`<span class="cd-tag warn"><i class="fas fa-eye"></i> chưa nói mong tìm thấy gì</span>`);
        return tags.join(' ');
    }

    function rowHtml(r, i) {
        return `<div class="cd-row${trim(r.ten) && !trim(r.mucDich) ? ' is-hollow' : ''}${thieuKyVong(r) ? ' need-ky' : ''}" data-i="${i}">
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
            <label class="cd-ky"><i class="fas fa-eye" title="Mong tìm thấy gì"></i>
                <input data-k="kyVong" list="cd-ky-list" value="${esc(r.kyVong)}"
                       placeholder="${esc(KY_VONG_PH[r.mucDich] || 'mong tìm thấy hình ảnh / chỉ số gì?')}"
                       aria-label="Mong tìm thấy gì">
            </label>
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

    /* ---------- hai nguồn nhắc, gộp về cùng một chỗ ngay trên danh sách ----------
       (1) cây biện luận mục X — cận lâm sàng của từng nhánh
       (2) chẩn đoán đang ghi  — cận lâm sàng bắt buộc theo phác đồ
       (2) trước đây là dải chip gắn dưới ô chữ `#labs-proposed`; ô đó nay gấp vào
       <details> nên chip không ai thấy — kéo về đây, cạnh nguồn nhắc kia. */
    const co = (ten) => rows.some(r => low(r.ten) === low(ten));
    const thieuBl = () => derived().filter(d => !co(d.ten));
    const thieuBb = () => required().filter(l => !co(l.ten));

    function lineBl() {
        const tong = derived().length;
        if (!tong) return `<div class="tg-line"><i class="fas fa-diagram-project"></i>
            Cây biện luận ở mục X chưa ghi cận lâm sàng nào cho các nhánh —
            đề nghị ở đây sẽ không có chỗ dựa để giải thích.</div>`;
        const thieu = thieuBl();
        if (!thieu.length) return `<div class="tg-line is-ok"><i class="fas fa-circle-check"></i>
            Đã có đủ ${tong} cận lâm sàng mà mục X đề nghị.</div>`;
        return `<div class="tg-line"><i class="fas fa-diagram-project"></i>
            <span class="tg-benh">Mục X còn ${thieu.length} cận lâm sàng chưa đưa xuống đây</span>
            ${thieu.map((d, i) => `<button type="button" class="tg-chip" data-bl="${i}">+ ${esc(d.ten)}
                <em>(${esc(d.mucDich)}${d.dich ? ' ' + esc(d.dich) : ''})</em></button>`).join('')}
            <button type="button" class="tg-chip is-all" data-bl-all="1"><i class="fas fa-angles-down"></i> Lấy hết</button>
        </div>`;
    }

    function lineBb() {
        const thieu = thieuBb();
        if (!thieu.length) return '';
        return `<div class="tg-line"><i class="fas fa-triangle-exclamation"></i>
            <span class="tg-benh">Chẩn đoán đang ghi còn đòi ${thieu.length} cận lâm sàng bắt buộc</span>
            ${thieu.map((l, i) => `<button type="button" class="tg-chip" data-req="${i}"
                title="Bắt buộc cho chẩn đoán ${esc(l.benh)}">+ ${esc(l.ten)} <em>(${esc(l.benh)})</em></button>`).join('')}
            <button type="button" class="tg-chip is-all" data-req-all="1"><i class="fas fa-angles-down"></i> Lấy hết</button>
        </div>`;
    }

    function renderBl() {
        if (!blHost) return;
        blHost.innerHTML = lineBb() + lineBl();
    }

    /** Thêm một dòng, bỏ qua nếu đã có cùng tên */
    function add(r) {
        if (!trim(r.ten) || rows.some(x => low(x.ten) === low(r.ten))) return false;
        rows.push({ ten: trim(r.ten), mucDich: r.mucDich || '', dich: r.dich || '', kyVong: r.kyVong || '' });
        return true;
    }

    host.addEventListener('input', (e) => {
        const box = e.target.closest('.cd-row');
        if (!box || !e.target.dataset.k) return;
        rows[+box.dataset.i][e.target.dataset.k] = e.target.value;
        write();
        const r = rows[+box.dataset.i];
        if (e.target.dataset.k === 'kyVong') {
            box.classList.toggle('need-ky', thieuKyVong(r));
            box.querySelector('.cd-src').innerHTML = srcHtml(r);
            return;
        }
        if (e.target.dataset.k !== 'ten') return;
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
        rows.push({ ten: '', mucDich: '', dich: '', kyVong: '' });
        render();
        host.querySelector('.cd-row:last-of-type .cd-ten')?.focus();
    });

    blHost?.addEventListener('click', (e) => {
        const chon = (list, btn, key) => btn ? [list[+btn.dataset[key]]].filter(Boolean) : list;
        let them = null, msg = '';
        if (e.target.closest('[data-bl-all]') || e.target.closest('[data-bl]')) {
            them = chon(thieuBl(), e.target.closest('[data-bl]'), 'bl');
            msg = 'từ cây biện luận — mục đích lấy theo mức nghĩ của nhánh';
        } else if (e.target.closest('[data-req-all]') || e.target.closest('[data-req]')) {
            them = chon(thieuBb(), e.target.closest('[data-req]'), 'req')
                .map(l => ({ ten: l.ten, mucDich: 'để chẩn đoán xác định', dich: l.benh }));
            msg = 'bắt buộc theo chẩn đoán — nhớ ghi thêm mong tìm thấy gì';
        }
        if (!them) return;
        const n = them.filter(add).length;
        render();
        write();
        if (n) toast?.(`Đã lấy ${n} cận lâm sàng ${msg}.`, 'success');
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
