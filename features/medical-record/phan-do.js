// phan-do.js — phân độ triệu chứng ngay lúc hỏi bệnh.
//
// NYHA, mMRC, CCS, thang đau, mức kiểm soát hen, độ trĩ… đều là những thang chỉ
// cần HỎI chứ không cần xét nghiệm, nhưng sinh viên hay ghi đại "NYHA III" mà
// không nhớ tiêu chuẩn. Ở đây mỗi thang là vài ô chọn theo đúng câu hỏi lâm sàng,
// máy ráp lại thành phân độ, nói rõ dựa vào đâu và ghi thẳng vào ô "Mức độ" của
// triệu chứng chính ngay khi chọn — không phải bấm thêm nút nào.
//
// Thang nào hiện ra là do bệnh cảnh đang khai thác quyết định (triệu chứng chính,
// triệu chứng ở lý do vào viện, chẩn đoán sơ bộ) — không bày cả mớ cho rối.
//
// Lưu ở record.phanDo = { nyha: { gangSuc: 'khi gắng sức nhẹ…' }, … }
//
// Thang chỉ có MỘT câu hỏi (NYHA, mMRC, CCS, độ trĩ) thì câu hỏi đó chính là ô
// "Mức độ" của triệu chứng chính — bày thêm một hộp riêng để hỏi lại là thừa.
// Những thang đó mang cờ `oMucDo`: lựa chọn của chúng trở thành chip của ô Mức độ,
// người dùng chạm một cái là máy suy ra phân độ và ghi ngay vào ô đó.
// Hộp `.pd-box` chỉ còn giữ các thang cần NHIỀU câu hỏi (đau, GINA, phù), và tự
// ẩn hẳn khi bệnh cảnh đang khai thác không có thang nào.

import { fold } from './tim-kiem.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------------------------------------------------------- thư viện thang
   hoi   : [khóa, câu hỏi, [các lựa chọn]] — thứ tự lựa chọn chính là thứ tự độ nặng
   cham  : (v) => { ket, muc: 'nhe|vua|nang', dua } ; thiếu dữ kiện thì trả null */
const idx = (v, k, list) => list.indexOf(v[k]);

export const SCALES = [
    {
        id: 'nyha', ten: 'NYHA — khó thở do tim', re: /kho tho|suy tim|phu phoi|kho tho khi nam/,
        oMucDo: true, nhan: 'Khó thở xuất hiện khi nào',
        hoi: [['gs', 'Khó thở xuất hiện khi nào', [
            'không khó thở khi gắng sức thường ngày',
            'gắng sức nặng (leo hơn 1 tầng lầu, mang vác nặng)',
            'gắng sức nhẹ (đi bộ đường phẳng, tắm giặt, mặc áo)',
            'khó thở cả khi nghỉ ngơi']]],
        cham(v) {
            const i = idx(v, 'gs', this.hoi[0][2]);
            if (i < 0) return null;
            const la = ['NYHA I', 'NYHA II', 'NYHA III', 'NYHA IV'][i];
            return { ket: `${la} — ${this.hoi[0][2][i]}`, muc: i >= 2 ? 'nang' : i === 1 ? 'vua' : 'nhe', dua: this.hoi[0][2][i] };
        }
    },
    {
        id: 'mmrc', ten: 'mMRC — khó thở mạn (COPD)', re: /copd|phoi tac nghen/,
        oMucDo: true, nhan: 'Mức khó thở trong sinh hoạt',
        hoi: [['gs', 'Mức khó thở trong sinh hoạt', [
            'chỉ khó thở khi gắng sức mạnh',
            'khó thở khi đi nhanh đường phẳng hoặc lên dốc nhẹ',
            'đi chậm hơn người cùng tuổi, phải dừng lại thở khi đi đường phẳng',
            'đi khoảng 100 m hoặc vài phút là phải dừng thở',
            'khó thở khi thay quần áo, không ra khỏi nhà được']]],
        cham(v) {
            const i = idx(v, 'gs', this.hoi[0][2]);
            if (i < 0) return null;
            return { ket: `mMRC ${i} — ${this.hoi[0][2][i]}`, muc: i >= 3 ? 'nang' : i === 2 ? 'vua' : 'nhe', dua: this.hoi[0][2][i] };
        }
    },
    {
        id: 'ccs', ten: 'CCS — đau thắt ngực', re: /dau that nguc|mach vanh|nhoi mau co tim|thieu mau co tim/,
        oMucDo: true, nhan: 'Đau ngực xuất hiện khi',
        hoi: [['gs', 'Đau ngực xuất hiện khi', [
            'gắng sức mạnh, kéo dài; sinh hoạt thường ngày không đau',
            'đi bộ nhanh, leo hơn 1 tầng lầu, đi sau ăn hoặc trời lạnh',
            'đi bộ 100 – 200 m hoặc leo 1 tầng lầu bình thường',
            'gắng sức rất nhẹ hoặc đau cả khi nghỉ']]],
        cham(v) {
            const i = idx(v, 'gs', this.hoi[0][2]);
            if (i < 0) return null;
            return { ket: `CCS ${['I', 'II', 'III', 'IV'][i]} — ${this.hoi[0][2][i]}`, muc: i >= 2 ? 'nang' : i === 1 ? 'vua' : 'nhe', dua: this.hoi[0][2][i] };
        }
    },
    {
        /* Ô "Mức độ" của mọi triệu chứng đau trong thư viện vốn là ô chữ trống trơn.
           Gộp "mấy điểm trên 10" với "ảnh hưởng sinh hoạt" thành MỘT câu bệnh nhân trả
           lời được, để thang chiếm luôn ô đó — hỏi một lần, ra cả điểm lẫn mức. */
        id: 'dau', ten: 'NRS — thang điểm đau', re: /dau/,
        oMucDo: true, nhan: 'Đau tới mức nào',
        hoi: [['muc', 'Đau tới mức nào', [
            '1–3/10 — khó chịu nhưng vẫn sinh hoạt bình thường',
            '4–6/10 — ảnh hưởng sinh hoạt, khó tập trung làm việc',
            '7–8/10 — phải nằm nghỉ, không làm việc được',
            '9–10/10 — dữ dội, mất ngủ vì đau']]],
        cham(v) {
            const i = idx(v, 'muc', this.hoi[0][2]);
            if (i < 0) return null;
            const diem = ['2/10', '5/10', '7/10', '9/10'][i];
            const ten = ['đau nhẹ', 'đau vừa', 'đau nhiều', 'đau rất dữ dội'][i];
            return {
                ket: `${diem} — ${ten}`, muc: i >= 2 ? 'nang' : i === 1 ? 'vua' : 'nhe',
                dua: this.hoi[0][2][i]
            };
        }
    },
    {
        id: 'gina', ten: 'Mức kiểm soát hen (GINA, 4 tuần qua)', re: /hen|kho khe|con hen/,
        hoi: [
            ['ngay', 'Triệu chứng ban ngày hơn 2 lần/tuần', ['không', 'có']],
            ['dem', 'Thức giấc về đêm vì hen', ['không', 'có']],
            ['catCon', 'Dùng thuốc cắt cơn hơn 2 lần/tuần', ['không', 'có']],
            ['hanChe', 'Hạn chế hoạt động vì hen', ['không', 'có']]
        ],
        cham(v) {
            const ks = ['ngay', 'dem', 'catCon', 'hanChe'];
            if (ks.some(k => !v[k])) return null;
            const n = ks.filter(k => v[k] === 'có').length;
            const ket = n === 0 ? 'Kiểm soát tốt' : n <= 2 ? 'Kiểm soát một phần' : 'Chưa kiểm soát';
            return { ket: `${ket} (${n}/4 tiêu chí dương)`, muc: n === 0 ? 'nhe' : n <= 2 ? 'vua' : 'nang', dua: `${n}/4 tiêu chí GINA` };
        }
    },
    {
        // "\btri\b" từng khớp cả "rối loạn TRI giác" -> bệnh nhân hôn mê bị hỏi búi trĩ
        id: 'tri', ten: 'Phân độ trĩ nội', re: /tri noi|bui tri|sa bui tri|di cau ra mau|tieu ra mau/,
        oMucDo: true, nhan: 'Búi trĩ sa thế nào',
        hoi: [['sa', 'Búi trĩ sa thế nào', [
            'chỉ chảy máu, chưa sa ra ngoài',
            'sa khi rặn, tự co lên được',
            'sa khi rặn, phải dùng tay đẩy lên',
            'sa thường xuyên, đẩy lên không được']]],
        cham(v) {
            const i = idx(v, 'sa', this.hoi[0][2]);
            if (i < 0) return null;
            return { ket: `Trĩ nội độ ${['I', 'II', 'III', 'IV'][i]} — ${this.hoi[0][2][i]}`, muc: i >= 2 ? 'nang' : i === 1 ? 'vua' : 'nhe', dua: this.hoi[0][2][i] };
        }
    },
    {
        id: 'phu', ten: 'Mức độ phù', re: /\bphu\b|phu chan|phu toan than/,
        hoi: [
            ['viTri', 'Phù tới đâu', ['chỉ mắt cá chân', 'tới cẳng chân', 'tới đùi – bụng', 'phù toàn thân, có tràn dịch']],
            ['an', 'Ấn lõm', ['ấn lõm', 'ấn không lõm']]
        ],
        cham(v) {
            const i = idx(v, 'viTri', this.hoi[0][2]);
            if (i < 0) return null;
            return {
                ket: `Phù độ ${i + 1} — ${this.hoi[0][2][i]}${v.an ? ', ' + v.an : ''}`,
                muc: i >= 3 ? 'nang' : i >= 1 ? 'vua' : 'nhe', dua: this.hoi[0][2][i]
            };
        }
    }
];

/* ---------------------------------------------------------------- giao diện */
let host, data = {}, ctxFn = () => [], applyFn = null, onChangeCb = () => { };
/* Câu trả lời của thang một-câu-hỏi nằm ở một ô thuộc tính của triệu chứng chính;
   ô nào là do benh-su-editor quyết (đổi theo từng triệu chứng) nên nhận qua tham số. */
let sevFn = () => '';

export const getPhanDo = () => JSON.parse(JSON.stringify(data));
export function setPhanDo(obj) {
    data = obj && typeof obj === 'object' ? JSON.parse(JSON.stringify(obj)) : {};
    render();
}

/** Các thang hợp với bệnh cảnh đang khai thác */
function activeScales() {
    const text = fold(ctxFn().join(' · '));
    return SCALES.filter(s => s.re.test(text) || data[s.id] && Object.keys(data[s.id]).length);
}

/** Thang một-câu-hỏi hợp bệnh cảnh — câu hỏi của nó thay luôn ô "Mức độ".
 *  Bệnh cảnh khớp nhiều thang thì lấy thang đặc hiệu nhất (khai báo trước là ưu tiên). */
export function scaleForSeverity() {
    const text = fold(ctxFn().join(' · '));
    return SCALES.find(s => s.oMucDo && s.re.test(text)) || null;
}

/** Bỏ phần phân độ máy đã gắn ở đuôi để so lại với danh sách lựa chọn */
export const boPhanDo = (t) => String(t ?? '')
    .replace(/\s+—\s+(NYHA|mMRC|CCS|Trĩ nội độ)\b.*$/i, '').trim();

/** Câu trả lời ở ô Mức độ -> phân độ. Chỉ nhận khi trùng đúng một lựa chọn của thang,
 *  người dùng gõ tay câu của riêng họ thì máy không đoán bừa. */
export function gradeFromSeverity(sc, text) {
    if (!sc) return null;
    const [k, , opts] = sc.hoi[0];
    const sach = fold(boPhanDo(text));
    const hit = opts.find(o => fold(o) === sach);
    if (!hit) return null;
    data[sc.id] = { ...(data[sc.id] || {}), [k]: hit };
    return sc.cham(data[sc.id]);
}

function cardHtml(s) {
    const v = data[s.id] || {};
    const kq = s.cham(v);
    return `<div class="pd-card" data-s="${s.id}">
        <div class="pd-head"><b>${esc(s.ten)}</b>
            ${kq ? `<span class="pd-kq lv-${kq.muc}">${esc(kq.ket)}</span>` : '<span class="pd-kq is-empty">chọn để máy chấm</span>'}
        </div>
        ${s.hoi.map(([k, cau, opts]) => `<div class="pd-q">
            <span class="pd-lab">${esc(cau)}</span>
            <span class="pd-opts">${opts.map(o =>
        `<button type="button" class="pd-opt${v[k] === o ? ' is-on' : ''}" data-k="${esc(k)}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</span>
        </div>`).join('')}
        ${kq ? `<div class="pd-foot"><span><i class="fas fa-circle-info"></i> Dựa vào: ${esc(kq.dua)}</span>
            <button type="button" class="pd-apply" data-apply="${s.id}"><i class="fas fa-rotate-right"></i> Ghi lại</button></div>` : ''}
    </div>`;
}

function render() {
    if (!host) return;
    // Thang một-câu-hỏi đã nằm ngay ở ô "Mức độ" của triệu chứng chính, đừng hỏi lại
    const list = activeScales().filter(s => !s.oMucDo);
    host.innerHTML = list.map(cardHtml).join('');
    // Không có thang nào cần nhiều câu hỏi thì giấu hẳn cả hộp, khỏi bày hộp rỗng
    const box = host.closest('.pd-box') || host.parentElement;
    if (box) box.hidden = !list.length;
}

/**
 * @param host  hộp chứa
 * @param context () => [tên triệu chứng / chẩn đoán đang xét]
 * @param apply (text, scale) => void — ghi câu phân độ vào bệnh án
 */
export function initPhanDo(opt = {}) {
    host = $('pd-list');
    if (!host) return;
    ctxFn = opt.context || ctxFn;
    sevFn = opt.severity || sevFn;
    applyFn = opt.apply || null;
    onChangeCb = opt.onChange || onChangeCb;

    host.addEventListener('click', (e) => {
        const opt2 = e.target.closest('.pd-opt');
        if (opt2) {
            const id = opt2.closest('.pd-card').dataset.s;
            const k = opt2.dataset.k;
            data[id] = data[id] || {};
            data[id][k] = data[id][k] === opt2.dataset.v ? '' : opt2.dataset.v;
            render();
            // Chọn xong là ghi luôn, không bắt bấm thêm nút nào
            const sc = SCALES.find(x => x.id === id);
            const kq = sc && sc.cham(data[id] || {});
            if (kq) applyFn?.(kq.ket, sc, true);
            return onChangeCb();
        }
        const ap = e.target.closest('[data-apply]');
        if (!ap) return;
        const s = SCALES.find(x => x.id === ap.dataset.apply);
        const kq = s && s.cham(data[s.id] || {});
        if (kq) applyFn?.(kq.ket, s);
    });
    render();
    // ui-fold.js bọc .calc-box thành <details> SAU khi module này chạy, nên lần vẽ
    // đầu tiên đặt `hidden` lên phần tử sắp bị thay. Vẽ lại một nhịp sau cho chắc.
    setTimeout(render, 0);
}

/** Vẽ lại khi bệnh cảnh đổi (chọn triệu chứng chính khác, thêm chẩn đoán…) */
export const refreshPhanDo = render;

/** Câu phân độ đã chấm được — cho phần tóm tắt dùng lại */
export function phanDoLines() {
    // Thang gắn ở ô Mức độ: lấy đúng câu đang có trong ô đó rồi chấm lại,
    // không dựa vào bản nhớ trong `data` (người dùng có thể vừa sửa tay).
    const sc = scaleForSeverity();
    if (sc) gradeFromSeverity(sc, sevFn());
    return SCALES.map(s => {
        const kq = s.cham(data[s.id] || {});
        return kq ? kq.ket : '';
    }).filter(Boolean);
}
