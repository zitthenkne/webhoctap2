/* =====================================================================
   toan-canh.js — MÀN "TOÀN CẢNH CA BỆNH"

   Bệnh án dài 7 mục, mỗi mục vài chục ô. Gõ xong rồi thì không ai còn
   nhìn ra được BỨC TRANH: bệnh nhân đau ở đâu, hệ nào đã hỏi hệ nào bỏ
   trống, và mấy hướng chẩn đoán đang cân nhắc thì cái nào đủ dấu chứng.
   Ba câu đó là ba khung hình của màn này.

   Cùng tầng với nhap-lien-ket.js: KHÔNG thêm ô nội dung nào, chỉ đọc DOM
   và các module đã có rồi vẽ lại. Nên không phải đụng FIELDS / buildModel
   và không sinh cạnh no_route_to_output trong codegraph.

   Ba khung:
     1. CƠ THỂ    hình người tô màu theo điểm đau gom từ MỌI mốc bệnh sử,
                  kèm thẻ triệu chứng có thanh mức độ (nâng cấp 4 + 6)
     2. HỆ CƠ QUAN lưới ô màu: hệ nào bất thường / đã hỏi bình thường /
                  còn bỏ trống — chạm là nhảy về đúng ô (nâng cấp 5)
     3. PHÂN BIỆT bảng đối chiếu: mỗi hàng một hướng chẩn đoán, mỗi cột
                  một dấu chứng then chốt, ô cho biết đã có / đã ghi âm
                  tính / chưa hỏi (nâng cấp 7)

   Bộ biểu tượng + màu theo hệ cơ quan (HE) xuất ra cho chỗ khác dùng
   chung, để chip gợi ý ở bảng chọn triệu chứng cũng có màu (nâng cấp 8).
   ===================================================================== */
import { showToast } from '../../core/utils.js';
import { goTo } from './tao-benh-an-them.js';
import { bodyMapSvg, mucDau, regionTen, regionMat, MAT_LIST, matTen,
    LOAI_DAU, loaiTen, loaiIcon, loaiMau } from './body-map.js';
import { getSteps, stepLabel, getClinicalContext } from './benh-su-editor.js';
import { docRos, ROS_IDS } from './ros-editor.js';
import { ROS_BY_NHOM, findSymptom, heIcon, heMau } from './trieu-chung-data.js';
import { getBienLuan } from './bien-luan-editor.js';
import { hallmarksFor } from './bien-luan-data.js';
import { fold } from './tim-kiem.js';

const $ = (id) => document.getElementById(id);
const val = (id) => String($(id)?.value || '').trim();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ------------------------------------------------------------------ */
/* BỘ BIỂU TƯỢNG + MÀU THEO HỆ CƠ QUAN                                 */
/* Một chỗ khai duy nhất: màn này, bảng chọn triệu chứng và lưới hệ cơ  */
/* quan đều lấy ở đây nên "Tim mạch" ở đâu cũng cùng một màu đỏ.        */
/* ------------------------------------------------------------------ */
export { HE, heIcon, heMau } from './trieu-chung-data.js';

/* ------------------------------------------------------------------ */
/* KHO CHỮ CỦA CẢ BỆNH ÁN — tách sẵn thành vế DƯƠNG và vế ÂM           */
/* Bảng đối chiếu ở khung 3 hỏi "dấu chứng này đã ghi chưa"; hỏi trên   */
/* chuỗi thô thì "không phù" cũng bị tính là CÓ phù.                    */
/* ------------------------------------------------------------------ */
const PHU_DINH = /^(khong|chua|phu nhan|khong ghi nhan|am tinh|\(-\))\b/;

/* Chữ đệm không mang thông tin — bỏ đi để "khó thở KHI nằm" và "khó thở KHI
   gắng sức" khác nhau ở đúng chỗ đáng khác. */
const DEM = new Set(['khi', 'không', 'chưa', 'của', 'các', 'một', 'hai', 'ba', 'trên', 'dưới',
    'trong', 'ngoài', 'vào', 'theo', 'thì', 'như', 'với', 'cho', 'nhiều', 'hoặc', 'phải', 'trái']);

/* GIỮ NGUYÊN DẤU ở bảng này (mọi chỗ khác trong trang đều fold cho dễ khớp).
   Bỏ dấu thì "đau" và "đầu" thành cùng một từ, nên vế "không đau đầu" biến
   dấu chứng "Gan to đau" thành đã-ghi-âm-tính — sai hẳn nghĩa. Cả HALLMARKS
   lẫn chữ sinh viên gõ đều có dấu đầy đủ nên so thẳng là đúng nhất; gõ thiếu
   dấu thì cùng lắm ra "chưa hỏi tới", tức là ngả an toàn. */
const tuChinh = (s) => String(s || '').toLowerCase().split(/[^\p{L}\p{N}]+/u)
    .filter(w => w.length > 2 && !DEM.has(w));

function khoChu() {
    const form = $('medical-record-form');
    const duong = [], am = [];
    form?.querySelectorAll('textarea, input[type=text]').forEach(el => {
        if (el.closest('#ba-settings') || !el.value.trim()) return;
        String(el.value).split(/[,;.\n]+/).map(x => x.trim()).filter(Boolean).forEach(ve => {
            /* Giữ thành TẬP TỪ chứ không giữ nguyên chuỗi: dò kiểu "chứa chuỗi con"
               thì "gan" khớp luôn vào "gắng", "lao" khớp vào "lão" — bỏ dấu xong
               tiếng Việt đầy cặp như vậy. */
            (PHU_DINH.test(fold(ve)) ? am : duong).push(new Set(tuChinh(ve)));
        });
    });
    return { duong, am };
}

/**
 * Dấu chứng `h` đang ở trạng thái nào trong bệnh án: có / âm tính / chưa hỏi.
 *
 * Phải khớp ĐỦ mọi từ chính, không phải "trùng vài từ là được". Luật lỏng từng
 * cho "khó thở khi gắng sức" tick xanh vào ô "Khó thở khi nằm" — hai câu khác
 * hẳn nhau về mặt lâm sàng, và dòng này nằm ngay dưới tên chẩn đoán nên đọc như
 * một khẳng định. Thà để "chưa hỏi tới" còn hơn nói sai.
 */
function traDauChung(h, kho) {
    const tu = tuChinh(h);
    if (!tu.length) return 'chua';
    if (kho.duong.some(v => tu.every(w => v.has(w)))) return 'co';
    /* Vế âm tính viết ngắn hơn hẳn ("không phù", "không tiểu máu"): đòi đủ từ là
       không bao giờ khớp. Ở đây chỉ cần vế âm nằm GỌN trong dấu chứng đang xét. */
    const bo = new Set(tu);
    if (kho.am.some(v => v.size && [...v].every(x => bo.has(x)))) return 'am';
    return 'chua';
}

/* ================================================================== */
/* KHUNG 1 — CƠ THỂ + THẺ TRIỆU CHỨNG                                  */
/* ================================================================== */

/** Gom điểm đau + mọi dấu khác của MỌI mốc lên cùng một hình */
function gomDau() {
    const bac = { none: 0, nhe: 1, vua: 2, nang: 3 };
    const heat = {}, nhan = {}, lan = [], marks = [];
    getSteps().forEach(m => {
        const muc = mucDau(m.dau);
        (m.vung || []).forEach(id => {
            if (bac[muc] >= bac[heat[id] || 'none']) heat[id] = muc;
            const ghi = `${stepLabel(m)}${m.dau ? ` · đau ${m.dau}/10` : ''}`;
            nhan[id] = nhan[id] ? `${nhan[id]}; ${ghi}` : ghi;
        });
        (m.lan || []).forEach(x => x?.[0] && x?.[1] && lan.push(x));
        (m.dh || []).forEach(d => {
            if (!d?.z || !d?.k) return;
            marks.push(d);
            const ghi = `${loaiTen(d.k)}${d.t ? ` — ${d.t}` : ''} (${stepLabel(m)})`;
            nhan[d.z] = nhan[d.z] ? `${nhan[d.z]}; ${ghi}` : ghi;
        });
    });
    return { heat, nhan, lan, marks };
}

/** Danh sách triệu chứng của cả ca, kèm mức độ và chỗ đã ghi ra nó */
function theTrieuChung() {
    const out = new Map();
    const them = (ten, nhom, muc, nguon, el) => {
        const key = fold(ten);
        if (!key) return;
        const cu = out.get(key);
        const bac = { nhe: 1, vua: 2, nang: 3 };
        if (cu) {
            if (bac[muc] > bac[cu.muc]) cu.muc = muc;
            if (!cu.nguon.includes(nguon)) cu.nguon.push(nguon);
            return;
        }
        out.set(key, { ten, nhom, muc, nguon: [nguon], el });
    };

    // 1. Triệu chứng chính + mọi triệu chứng đã kể trong bệnh sử
    const dauNang = Math.max(0, ...getSteps().map(m => parseFloat(m.dau) || 0));
    getClinicalContext().forEach(s =>
        them(s.ten, s.nhom, dauNang ? mucDau(dauNang) : 'vua', 'Bệnh sử', $('hx-sym-name')));

    // 2. Bất thường đọc ra từ mục V — cờ đỏ thì tô mức nặng
    Object.entries(ROS_BY_NHOM).forEach(([nhom, id]) => {
        const r = docRos(id);
        r.batThuong.forEach(t => {
            const s = findSymptom(t);
            them(s?.ten || t, s?.nhom || nhom, r.doTin.includes(t) ? 'nang' : 'vua',
                'Mục V', $(id));
        });
    });

    // 3. Lý do vào viện — có khi bệnh sử chưa kịp gõ mà lý do đã có
    val('reason-for-admission').split(/[,;\n]+/).map(x => x.trim()).filter(Boolean).forEach(t => {
        const s = findSymptom(t);
        if (s) them(s.ten, s.nhom, 'vua', 'Lý do vào viện', $('reason-for-admission'));
    });

    const bac = { nang: 0, vua: 1, nhe: 2 };
    return [...out.values()].sort((a, b) => bac[a.muc] - bac[b.muc] || a.ten.localeCompare(b.ten, 'vi'));
}

function veCoThe() {
    const { heat, nhan, lan, marks } = gomDau();
    const soVung = Object.keys(heat).length;
    const the = theTrieuChung();

    /* Chỉ vẽ khung nhìn nào THẬT SỰ có dấu — bày cả tám hình rỗng thì phải cuộn
       rất dài mới thấy được cái duy nhất có nội dung. Toàn thân trước/sau luôn
       hiện vì đó là chỗ nhìn quen mắt. */
    const coDau = new Set([
        ...Object.keys(heat).map(regionMat),
        ...marks.map(d => regionMat(d.z))
    ]);
    const hinh = MAT_LIST
        .filter(([id, , , la]) => !la || coDau.has(id))
        .map(([id, ten]) => `
        <div class="tc-mat">
            <span class="tc-mat-ten">${esc(ten)}</span>
            ${bodyMapSvg({ mat: id, heat, nhan, lan, marks })}
        </div>`).join('');

    const soLoai = new Map();
    marks.forEach(d => soLoai.set(d.k, (soLoai.get(d.k) || 0) + 1));

    const thePhan = the.length ? the.map((t, i) => `
        <button type="button" class="tc-sym is-${t.muc}" data-sym="${i}"
            style="--he:${heMau(t.nhom)}">
            <i class="fas ${heIcon(t.nhom)}"></i>
            <span class="tc-sym-ten">${esc(t.ten)}</span>
            <span class="tc-sym-bar"><i></i></span>
            <span class="tc-sym-nguon">${esc(t.nguon.join(' · '))}</span>
        </button>`).join('')
        : `<p class="tc-empty">Chưa có triệu chứng nào để vẽ. Ghi triệu chứng chính ở mục III hoặc
           lược qua các cơ quan ở mục V rồi quay lại đây.</p>`;

    return {
        html: `
        <p class="tc-lead"><i class="fas fa-circle-info"></i>
            Hình gom <b>tất cả các mốc</b> bệnh sử: vùng đau tô theo mức nặng nhất, các dấu khác
            (chấn thương, dấu da, phù, khối, sẹo mổ) hiện thành chấm màu dưới mỗi vùng.
            Chỉ những bản đồ khu có dấu mới được vẽ ra. Chạm một vùng hoặc một thẻ triệu chứng
            để nhảy về đúng ô đã ghi ra nó.</p>
        <div class="tc-body-wrap">${hinh}</div>
        <div class="tc-legend">
            <span><i class="tc-dot is-nhe"></i> đau nhẹ 1–3</span>
            <span><i class="tc-dot is-vua"></i> vừa 4–6</span>
            <span><i class="tc-dot is-nang"></i> nặng 7–10</span>
            <span><i class="tc-dot is-none"></i> có ghi vùng, chưa chấm điểm</span>
            <b>${soVung} vùng đau · ${marks.length} dấu khác · ${the.length} triệu chứng</b>
        </div>
        ${marks.length ? `<div class="tc-legend tc-legend-k">
            ${LOAI_DAU.filter(([k]) => soLoai.has(k)).map(([k, ten, ic, mau]) =>
            `<span style="--k:${mau}"><i class="fas ${ic}"></i> ${esc(ten)}
                <b>${soLoai.get(k)}</b></span>`).join('')}
        </div>
        <div class="tc-dh-list">${marks.map(d =>
            `<span class="tc-dh" style="--k:${loaiMau(d.k)}"><i class="fas ${loaiIcon(d.k)}"></i>
                <b>${esc(regionTen(d.z))}</b>${d.t ? ` — ${esc(d.t)}` : ''}
                <em>${esc(matTen(regionMat(d.z)))}</em></span>`).join('')}</div>` : ''}
        <div class="tc-sym-grid">${thePhan}</div>`,
        the
    };
}

/* ================================================================== */
/* KHUNG 2 — LƯỚI HỆ CƠ QUAN                                           */
/* ================================================================== */
const O_KHAM = [
    ['Toàn trạng', 'exam-general', 'fa-user-check'],
    ['Đầu – mặt – cổ', 'exam-head', 'fa-head-side-mask'],
    ['Lồng ngực', 'exam-chest', 'fa-lungs'],
    ['Tim', 'exam-heart', 'fa-heart-pulse'],
    ['Phổi', 'exam-lung', 'fa-wind'],
    ['Bụng', 'exam-abdomen', 'fa-bowl-food'],
    ['Thần kinh – cơ xương khớp', 'exam-neuro-msk', 'fa-brain']
];
const O_SINH_HIEU = [['Mạch', 'vital-pulse'], ['Nhiệt độ', 'vital-temp'], ['Huyết áp', 'vital-bp'],
['Nhịp thở', 'vital-resp'], ['SpO₂', 'vital-spo2'], ['Cân nặng', 'vital-weight']];

function veHeCoQuan() {
    const oRos = Object.entries(ROS_BY_NHOM).map(([nhom, id]) => {
        const r = docRos(id);
        const trang = r.doTin.length ? 'do' : r.batThuong.length ? 'vang' : r.co ? 'xanh' : 'xam';
        const chip = r.batThuong.slice(0, 5).map(t =>
            `<em class="${r.doTin.includes(t) ? 'is-co' : ''}">${esc(t)}</em>`).join('');
        const noi = { do: 'có dấu phải chú ý', vang: 'có bất thường', xanh: 'đã hỏi, bình thường', xam: 'chưa hỏi' };
        return `<button type="button" class="tc-tile is-${trang}" data-go="${id}" style="--he:${heMau(nhom)}">
            <span class="tc-tile-top"><i class="fas ${heIcon(nhom)}"></i>${esc(nhom)}</span>
            <span class="tc-tile-st">${noi[trang]}</span>
            <span class="tc-tile-chips">${chip}</span>
        </button>`;
    }).join('');

    const oKham = O_KHAM.map(([ten, id, ic]) => {
        const v = val(id);
        return `<button type="button" class="tc-tile is-${v ? 'xanh' : 'xam'}" data-go="${id}">
            <span class="tc-tile-top"><i class="fas ${ic}"></i>${esc(ten)}</span>
            <span class="tc-tile-st">${v ? 'đã khám' : 'chưa ghi'}</span>
            <span class="tc-tile-chips">${v ? `<em>${esc(v.slice(0, 60))}${v.length > 60 ? '…' : ''}</em>` : ''}</span>
        </button>`;
    }).join('');

    const oSinh = O_SINH_HIEU.map(([ten, id]) => {
        const v = val(id);
        return `<button type="button" class="tc-mini is-${v ? 'xanh' : 'xam'}" data-go="${id}">
            <b>${esc(ten)}</b><span>${esc(v) || '—'}</span></button>`;
    }).join('');

    const chuaHoi = ROS_IDS.filter(id => !docRos(id).co).length;
    const chuaKham = O_KHAM.filter(([, id]) => !val(id)).length;

    return `
        <p class="tc-lead"><i class="fas fa-circle-info"></i>
            Ô <b>xám</b> là chỗ chưa hỏi / chưa khám — đó mới là thứ đáng đi tìm.
            Chạm một ô là nhảy thẳng về đúng chỗ nhập.
            ${chuaHoi || chuaKham ? `<b class="tc-warn">Còn ${chuaHoi} cơ quan chưa lược qua, ${chuaKham} vùng chưa khám.</b>` : '<b class="tc-ok">Đã phủ hết cơ quan và vùng khám.</b>'}</p>
        <h4 class="tc-h">Lược qua các cơ quan (mục V)</h4>
        <div class="tc-grid">${oRos}</div>
        <h4 class="tc-h">Khám lâm sàng (mục VI)</h4>
        <div class="tc-grid">${oKham}</div>
        <h4 class="tc-h">Sinh hiệu</h4>
        <div class="tc-mini-grid">${oSinh}</div>`;
}

/* ================================================================== */
/* KHUNG 3 — BẢNG ĐỐI CHIẾU CHẨN ĐOÁN PHÂN BIỆT                        */
/* ================================================================== */
function vePhanBiet() {
    const kho = khoChu();
    const { vanDe } = getBienLuan();

    /* Mỗi hướng chẩn đoán là một nguyên nhân trong cây biện luận. Không có
       nguyên nhân nào thì lấy tạm chẩn đoán sơ bộ / phân biệt ở mục X, để
       bảng vẫn dùng được lúc mới chỉ nghĩ ra hai ba hướng. */
    let huong = vanDe.flatMap(v => v.nguyenNhan.map(n => ({ ten: n.ten, muc: n.muc, cua: v.ten })));
    if (!huong.length) {
        [val('dx1-main'), val('dx1-assoc'), val('dx2-main')]
            .flatMap(x => x.split(/[,;\n]+/)).map(x => x.trim()).filter(Boolean)
            .forEach(t => huong.push({ ten: t, muc: '', cua: 'Chẩn đoán đã ghi' }));
    }
    huong = huong.filter(h => h.ten).slice(0, 10);

    if (!huong.length) return `<p class="tc-empty">Chưa có hướng chẩn đoán nào để đối chiếu.
        Thêm nguyên nhân trong cây biện luận (mục VIII–IX) hoặc ghi chẩn đoán phân biệt ở mục X.</p>`;

    const hang = huong.map(h => {
        const dau = hallmarksFor(h.ten).slice(0, 6);
        if (!dau.length) return { ...h, dau: [], co: 0 };
        const o = dau.map(d => ({ ten: d, tt: traDauChung(d, kho) }));
        return { ...h, dau: o, co: o.filter(x => x.tt === 'co').length };
    }).sort((a, b) => (b.co / (b.dau.length || 1)) - (a.co / (a.dau.length || 1)));

    const icon = { co: 'fa-circle-check', am: 'fa-circle-xmark', chua: 'fa-circle-question' };
    const noi = { co: 'đã ghi nhận', am: 'đã ghi âm tính', chua: 'chưa hỏi tới' };

    const body = hang.map(h => {
        if (!h.dau.length) {
            return `<div class="tc-row is-trong">
                <div class="tc-row-head"><b>${esc(h.ten)}</b><span>${esc(h.cua || '')}</span></div>
                <p class="tc-row-note">Chưa có bộ dấu chứng mẫu cho tên này — tự liệt kê trong ô biện luận.</p>
            </div>`;
        }
        const pct = Math.round(h.co / h.dau.length * 100);
        const cells = h.dau.map(d => `
            <span class="tc-cell is-${d.tt}" title="${esc(d.ten)} — ${noi[d.tt]}">
                <i class="fas ${icon[d.tt]}"></i>${esc(d.ten)}</span>`).join('');
        return `<div class="tc-row">
            <div class="tc-row-head">
                <b>${esc(h.ten)}</b>
                <span>${esc(h.muc || h.cua || '')}</span>
                <span class="tc-score" style="--p:${pct}%"><i></i>${h.co}/${h.dau.length}</span>
            </div>
            <div class="tc-cells">${cells}</div>
        </div>`;
    }).join('');

    const thieu = hang.flatMap(h => h.dau.filter(d => d.tt === 'chua').map(d => d.ten));
    const top = [...new Set(thieu)].slice(0, 6);

    return `
        <p class="tc-lead"><i class="fas fa-circle-info"></i>
            Mỗi hàng là một hướng chẩn đoán đang cân nhắc; mỗi ô là một dấu chứng then chốt của nó.
            Máy dò trong chính chữ đã gõ khắp bệnh án:
            <b class="tc-k co">đã ghi nhận</b>, <b class="tc-k am">đã ghi âm tính</b>,
            <b class="tc-k chua">chưa hỏi tới</b>. Đây là gợi ý để đi hỏi tiếp, không phải kết luận.</p>
        <div class="tc-rows">${body}</div>
        ${top.length ? `<div class="tc-todo"><b><i class="fas fa-list-check"></i> Còn phải hỏi / khám</b>
            ${top.map(t => `<em>${esc(t)}</em>`).join('')}</div>` : ''}`;
}

/* ================================================================== */
/* VỎ MÀN HÌNH                                                         */
/* ================================================================== */
const KHUNG = [
    ['co-the', 'Cơ thể', 'fa-person-rays'],
    ['he', 'Hệ cơ quan', 'fa-table-cells-large'],
    ['phan-biet', 'Phân biệt', 'fa-code-compare']
];

let sheet, view = 'co-the', symList = [];

function ensure() {
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'tc-sheet';
    sheet.className = 'tc-sheet hidden';
    sheet.dataset.nocount = '1';
    sheet.innerHTML = `
        <div class="tc-bg" data-tc-close></div>
        <div class="tc-panel">
            <div class="tc-head">
                <i class="fas fa-panorama"></i> Toàn cảnh ca bệnh
                <span style="flex:1"></span>
                <button type="button" class="tc-x" data-tc-close aria-label="Đóng"><i class="fas fa-xmark"></i></button>
            </div>
            <div class="tc-tabs" role="tablist">
                ${KHUNG.map(([k, ten, ic]) => `<button type="button" role="tab" data-view="${k}"><i class="fas ${ic}"></i> ${ten}</button>`).join('')}
            </div>
            <div class="tc-view" id="tc-view"></div>
        </div>`;
    document.body.appendChild(sheet);

    sheet.addEventListener('click', (e) => {
        if (e.target.closest('[data-tc-close]') || e.target.classList.contains('tc-bg')) return dong();
        const tab = e.target.closest('[data-view]');
        if (tab) { view = tab.dataset.view; return render(); }

        const z = e.target.closest('[data-z]');
        if (z) return nhayVung(z.dataset.z);

        const sym = e.target.closest('[data-sym]');
        if (sym) {
            const t = symList[+sym.dataset.sym];
            dong();
            return goTo(t?.el);
        }
        const go = e.target.closest('[data-go]');
        if (go) { dong(); return goTo($(go.dataset.go)); }
    });
    return sheet;
}

/** Chạm một vùng trên hình: nói ra vùng đó thuộc mốc nào rồi đưa về bảng bệnh sử */
function nhayVung(id) {
    const moc = getSteps().filter(m => (m.vung || []).includes(id)).map(stepLabel);
    showToast(moc.length
        ? `${regionTen(id)} — ghi ở ${moc.join(', ')}`
        : `${regionTen(id)} — chưa mốc nào ghi vùng này`, moc.length ? 'info' : 'warning', 2600);
    if (moc.length) { dong(); goTo($('hx-list') || $('hx-sym-name')); }
}

function render() {
    const box = $('tc-view');
    sheet.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('is-on', b.dataset.view === view));
    if (view === 'co-the') {
        const r = veCoThe();
        symList = r.the;
        box.innerHTML = r.html;
    } else if (view === 'he') box.innerHTML = veHeCoQuan();
    else box.innerHTML = vePhanBietSafe();
    box.scrollTop = 0;
}

/* Cây biện luận có thể chưa dựng xong lúc mở màn này; hỏng một khung thì
   nói ra chứ đừng để cả màn trắng. */
function vePhanBietSafe() {
    try { return vePhanBiet(); }
    catch (err) {
        console.warn('[toan-canh] khung phân biệt lỗi', err);
        return `<p class="tc-empty">Chưa đọc được cây biện luận. Mở mục VIII–IX một lần rồi quay lại.</p>`;
    }
}

export function moToanCanh(k) {
    ensure();
    if (k) view = k;
    sheet.classList.remove('hidden');
    document.body.classList.add('tc-open');
    render();
}
const dong = () => {
    sheet?.classList.add('hidden');
    document.body.classList.remove('tc-open');
};

/* ------------------------------------------------------------------ */
/* GẮN NÚT MỞ                                                          */
/* ------------------------------------------------------------------ */
$('ba-overview')?.addEventListener('click', () => moToanCanh());
$('dock-overview')?.addEventListener('click', () => moToanCanh());

addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheet && !sheet.classList.contains('hidden')) return dong();
    // Ctrl/Cmd + Shift + O — mở nhanh từ bất kỳ ô nào đang gõ
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        moToanCanh();
    }
}, true);
