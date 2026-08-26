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
        id: 'mmrc', ten: 'mMRC — khó thở mạn (COPD)', re: /kho tho|copd|phoi tac nghen|hen phe quan/,
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
        id: 'ccs', ten: 'CCS — đau thắt ngực', re: /dau nguc|dau that nguc|mach vanh|nhoi mau co tim/,
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
        id: 'dau', ten: 'Thang điểm đau (NRS)', re: /dau/,
        hoi: [
            ['diem', 'Bệnh nhân tự chấm đau mấy điểm trên 10', ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']],
            ['anhHuong', 'Ảnh hưởng sinh hoạt', ['vẫn sinh hoạt bình thường', 'ảnh hưởng sinh hoạt', 'phải nằm nghỉ', 'mất ngủ vì đau']]
        ],
        cham(v) {
            const n = parseInt(v.diem, 10);
            if (!(n > 0)) return null;
            const muc = n >= 7 ? 'nang' : n >= 4 ? 'vua' : 'nhe';
            const ten = n >= 7 ? 'đau nhiều' : n >= 4 ? 'đau vừa' : 'đau nhẹ';
            return { ket: `${n}/10 — ${ten}${v.anhHuong ? ', ' + v.anhHuong : ''}`, muc, dua: `bệnh nhân tự chấm ${n}/10` };
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
        id: 'tri', ten: 'Phân độ trĩ nội', re: /\btri\b|di cau ra mau|tieu ra mau|sa bui tri/,
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
    const list = activeScales();
    host.innerHTML = list.length
        ? list.map(cardHtml).join('')
        : `<p class="pd-empty">Chưa rõ bệnh cảnh — ghi triệu chứng ở mục II hoặc triệu chứng chính, máy sẽ bày đúng thang phân độ cần hỏi.</p>`;
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
}

/** Vẽ lại khi bệnh cảnh đổi (chọn triệu chứng chính khác, thêm chẩn đoán…) */
export const refreshPhanDo = render;

/** Câu phân độ đã chấm được — cho phần tóm tắt dùng lại */
export function phanDoLines() {
    return SCALES.map(s => {
        const kq = s.cham(data[s.id] || {});
        return kq ? kq.ket : '';
    }).filter(Boolean);
}
