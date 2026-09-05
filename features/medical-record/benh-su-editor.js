// benh-su-editor.js — bệnh sử theo mốc thời gian, cho bệnh án học thuật.
//
// Cách kể bệnh sử chuẩn: mốc xa nhất trước, tiến dần tới ngày nhập viện, mỗi mốc
// mở đầu bằng "CNV <x> <đơn vị>". Triệu chứng đã có từ mốc trước thì phải nói rõ
// còn tương tự / thuyên giảm / nặng hơn và giảm-nặng như thế nào — chỗ hay bị bỏ sót.
//
// Mỗi mốc: { phase:'truoc'|'nv'|'sau', n, u, s, refs:[{sym, st, d}] }
// Máy ghép các mốc thành đoạn văn rồi ghi vào ô `illness-history` cũ, nên phần
// xuất file / trang xem không phải sửa gì.

import { openSymptomPicker } from './symptom-picker.js';
import { openListPicker } from './list-picker.js';
import { BENH_NHOM } from './benh-data.js';
import { careHtml, careLine, hasCare, emptyCare } from './tuyen-truoc-list.js';
import { findSymptom, SYMPTOMS, fold, DOI_TRIEU_CHUNG } from './trieu-chung-data.js';
import { setChips } from './goi-y-nhap.js';
import { attachTypeahead } from './goi-y-go.js';
import { parseNgay, fmtDate } from './cnv-list.js';
import { scaleForSeverity, gradeFromSeverity, boPhanDo } from './phan-do.js';
import { vungProse } from './body-map.js';
import { initDienTien, renderDienTien, playDienTien, stopDienTien, dangPhat,
    openMapModal, dangMoBanDo } from './dien-tien-view.js';

/* Gõ là gợi ý ngay, khỏi phải mở thư viện mới tìm được tên. Tìm không dấu. */
const TEN_TRIEU_CHUNG = SYMPTOMS.map(s => s.ten);
const TEN_BENH_PHANG = [...new Set(BENH_NHOM.flatMap(g => g.items || []))];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const UNITS = ['giờ', 'ngày', 'tuần', 'tháng'];
const UNIT_HOURS = { 'giờ': 1, 'ngày': 24, 'tuần': 168, 'tháng': 720 };
const STATES = ['tương tự', 'thuyên giảm', 'nặng hơn'];

/* Bệnh sử là phần người khác NGHE để nắm bệnh, nên bản ghép phải là văn xuôi:
   không "Diễn tiến:", không gạch đầu dòng, không "vị trí: …; tính chất: …".
   Ba bảng dưới là chỗ đổi từ dữ liệu sang lời nói. */
const KE_TRANG_THAI = {
    'tương tự': 'vẫn còn như cũ',
    'thuyên giảm': 'có giảm',
    'nặng hơn': 'nặng hơn'
};

/** Nối theo lối nói: ["a"] -> "a" · ["a","b"] -> "a và b" · ["a","b","c"] -> "a, b và c" */
const noiLoiKe = (xs) => xs.length < 2 ? (xs[0] || '')
    : `${xs.slice(0, -1).join(', ')} và ${xs[xs.length - 1]}`;

/** Tên triệu chứng lấy từ thư viện luôn viết hoa ("Đau ngực"); nằm giữa câu thì phải
 *  hạ xuống, trừ chữ viết tắt (ECG, SpO2, CRP) — viết hoa giữa câu là lộ ngay bản ghép máy. */
/* Dòng "triệu chứng cũ" chỉ cần cái TÊN; phần mô tả có ô riêng ("rõ là như thế nào").
   Bản chép từ mốc trước hay bản do bảng khai thác ghép thường mang cả câu
   "Sốt: sốt liên tục, không lạnh run" — để nguyên thì ra "sốt sốt liên tục…". */
const tenRef = (t) => {
    const x = trimText(t);
    return trimText(x.split(':')[0]) || x;
};

/* Chép triệu chứng sang mốc sau thì chỉ chép TÊN. `m.s` ngăn các triệu chứng bằng
   dấu ";", còn dấu "," nằm BÊN TRONG một mô tả ("sốt liên tục, không lạnh run,
   giảm sau hạ sốt") — tách theo dấu phẩy là một triệu chứng vỡ thành ba cái giả. */
const tenGoc = (t) => {
    const x = tenRef(t);
    return findSymptom(x)?.ten || x;
};

/* CHỐT CHẶN CUỐI: đoạn bệnh sử tuyệt đối không được có dấu hai chấm. Dữ liệu cũ, ô
   người dùng tự gõ, bản do bảng khai thác ghép — đường nào cũng có thể lọt, nên quét
   một lượt ở cửa ra. Giờ giấc kiểu "14:30" thì giữ (dấu hai chấm nằm giữa hai chữ số). */
const boHaiCham = (t) => String(t ?? '')
    .replace(/(^|\D):[ \t]*/g, '$1 ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([,.;])/g, '$1')
    .trim();

/* Câu trả lời phủ định của một ô hỏi ("không kèm triệu chứng nào khác", "chưa ghi
   nhận sốt") không phải một triệu chứng — ghép thẳng vào câu thì ra "kèm không kèm
   triệu chứng nào khác". Chỗ của nó là mục khám âm tính, không phải câu tả bệnh. */
const laPhuDinh = (t) => /^(kh[oô]ng|ch[uư]a)\b/i.test(String(t ?? '').trim());

const lowerDau = (t) => {
    const x = trimText(t);
    if (!x || /^[A-ZĐ]{2,}/.test(x)) return x;
    return x[0].toLowerCase() + x.slice(1);
};

/** Cụm mở đầu câu của một mốc: "CNV 5 ngày".
 *  Viết tắt CNV chứ không phải "Cách nhập viện": đó là lối viết trong bệnh án, và
 *  mỗi đoạn mở đầu bằng bốn chữ "Cách nhập viện" thì đọc rất nặng. */
export function stepWhen(m) {
    if (m.phase === 'nv') return 'Ngày nhập viện';
    const n = String(m.n || '').trim();
    if (m.phase === 'sau') return n ? `Sau nhập viện ${n} ${m.u}` : 'Sau nhập viện';
    return n ? `CNV ${n} ${m.u}` : 'Trước nhập viện';
}

/** Triệu chứng chính thành một cụm mô tả liền mạch, bỏ hết nhãn "vị trí:", "tính chất:"
 *  — sáu ô thuộc tính vốn đã là cụm mô tả sẵn ("sau xương ức, lan tay trái", "đè nặng",
 *  "7/10"), dán nhãn vào là hỏng văn xuôi. */
export function mainSymProse() {
    const v = (id) => ($(id)?.value || '').trim();
    const labs = mainSymLabels();
    const on = (id) => labs.find(l => l.id === id)?.on;
    /* Mỗi ô thuộc tính là một ô nhập riêng nên chữ đầu hay bị viết hoa ("Từ chân
       trái lên gối", "Đau nhức, âm ỉ"). Nằm giữa câu thì phải hạ xuống, không thì
       ra "đau nhức chân Từ chân trái lên gối trái, Đau nhức, âm ỉ" — lộ ngay bản ghép. */
    const val = (id) => (on(id) ? lowerDau(v(id)) : '');
    const ten = v('hx-sym-name');
    const ta = ['hx-sym-site', 'hx-sym-char', 'hx-sym-severity', 'hx-sym-time', 'hx-sym-factors']
        .map(val).filter(Boolean);
    const kemLab = labs.find(l => l.id === 'hx-sym-assoc');
    /* "không kèm triệu chứng nào khác" là câu TRẢ LỜI PHỦ ĐỊNH của ô hỏi, không phải
       một triệu chứng — ghép vào thành "kèm không kèm triệu chứng nào khác". Câu phủ
       định thuộc về mục "khám âm tính", nên ở đây bỏ hẳn. */
    const kemRaw = kemLab?.on ? v('hx-sym-assoc') : '';
    const kem = laPhuDinh(kemRaw) ? '' : lowerDau(kemRaw);
    if (!ten && !ta.length && !kem) return '';
    // Thuộc tính đầu (vị trí / nhiệt độ…) dính liền tên: "đau ngực sau xương ức",
    // không phải "đau ngực, sau xương ức".
    const dau = [lowerDau(ten), ta[0]].filter(Boolean).join(' ');
    let out = [dau, ...ta.slice(1)].filter(Boolean).join(', ');
    // Ô thứ 6 đổi nhãn theo từng triệu chứng — chỉ gắn chữ "kèm" khi nó thật sự là
    // "triệu chứng đi kèm", không thì nối thẳng như một thuộc tính nữa.
    if (kem) out += (/đi k[eè]m/i.test(kemLab.label) ? ', kèm ' : ', ') + kem;
    return out;
}

/** Một mốc thành câu văn xuôi hoàn chỉnh — dùng cho cả ô xem trước lẫn bản ghép. */
export function stepProse(m, { laKhoiPhat = false } = {}) {
    const menh = [];
    const chinh = laKhoiPhat ? mainSymProse() : '';
    const moi = symParts(m).map(lowerDau);
    if (chinh) menh.push(`bệnh nhân ${chinh}`);
    if (moi.length) menh.push((chinh ? 'kèm ' : 'bệnh nhân ') + noiLoiKe(moi));

    /* Triệu chứng cũ: máy chép sẵn từ mốc trước, người dùng lại tự thêm tay -> hay
       trùng tên. Và một mốc mà năm câu "vẫn còn như cũ" liên tiếp thì không ai nghe
       nổi, nên gom những cái không có mô tả riêng vào một mệnh đề "đều vẫn còn như cũ". */
    const daCo = new Set(moi.map(fold));   // đã kể ở phần "mới" thì đừng kể lại ở phần "cũ"
    // Mốc khởi phát đã tả kỹ triệu chứng chính ở khối trên rồi; mốc trước đó cũng
    // nhắc tên nó nên máy chép sang thành "triệu chứng cũ" -> câu hóa ra thừa
    // ("… không giảm khi nghỉ, đau ngực vẫn còn như cũ").
    if (chinh) daCo.add(fold(tenRef(mainSymName())));
    const cu = [], nhuCu = [];
    (m.refs || []).filter(r => trimText(r.sym)).forEach(r => {
        const key = fold(tenRef(r.sym));
        if (daCo.has(key) || [...daCo].some(k => k.startsWith(key) || key.startsWith(k))) return;
        daCo.add(key);
        const ten = lowerDau(tenRef(r.sym)), d = trimText(r.d);
        if (!d && (r.st || 'tương tự') === 'tương tự') return void nhuCu.push(ten);
        cu.push(`${ten} ${KE_TRANG_THAI[r.st] || KE_TRANG_THAI['tương tự']}${d ? ', ' + d : ''}`);
    });
    // Cái đổi kể trước, cái không đổi gom lại kể sau — nghe mới ra diễn tiến
    if (nhuCu.length) cu.push(nhuCu.length > 1
        ? `${noiLoiKe(nhuCu)} đều vẫn còn như cũ`
        : `${nhuCu[0]} vẫn còn như cũ`);
    // Trong mệnh đề đã có "và" rồi thì đừng thêm "và" thứ hai, ngăn bằng dấu phẩy
    if (cu.length) menh.push(cu.some(x => x.includes(' và ')) ? cu.join(', ') : noiLoiKe(cu));

    /* Vùng đau chấm trên bản đồ giải phẫu -> câu dùng đúng tên phân khu đang dạy
       ("hố chậu phải" chứ không phải "bụng dưới bên phải"). Mốc khởi phát đã tả vị
       trí trong khối triệu chứng chính rồi thì không kể lại. */
    const daTaViTri = laKhoiPhat && !!($('hx-sym-site')?.value || '').trim();
    /* Dấu khác đau (vết thương, ban da, phù, khối, sẹo mổ) luôn kể, kể cả khi vị
       trí đau đã tả ở khối triệu chứng chính — đó là dữ kiện riêng, không trùng. */
    const vung = daTaViTri ? vungProse([], [], m.dh || [])
        : vungProse(m.vung || [], m.lan || [], m.dh || []);
    if (vung) menh.push(menh.length ? vung : 'bệnh nhân ' + vung);

    const care = careLine(m.care);
    const cau = [];
    if (menh.length) {
        cau.push(`${stepWhen(m)}, ${menh.join(', ')}.`);
        if (care) cau.push(`Bệnh nhân ${care}.`);
    } else if (care) {
        cau.push(`${stepWhen(m)}, bệnh nhân ${care}.`);
    }
    return cau.join(' ');
}

/* Ô "Triệu chứng chính" là một khối HTML có sẵn; máy chuyển nguyên khối đó vào
   đúng mốc khởi phát nên mọi ID / phần lưu trữ giữ nguyên, khỏi phải nhân đôi ô. */
/* Hai khối HTML có sẵn được dời nguyên vào mốc khởi phát: mô tả triệu chứng chính
   và cơ chế chấn thương (bệnh án ngoại). Mọi ID / chỗ lưu giữ nguyên. */
const EMBEDS = [
    ['hx-trauma-box', 'hx-trauma-park'],   // ngoại: cơ chế chấn thương
    ['hx-san-box', 'hx-san-park'],         // sản: bệnh sử thai kỳ
    ['hx-nhi-box', 'hx-nhi-park'],         // nhi: hỏi người nuôi trẻ
    ['hx-main-box', 'hx-main-park']
];
const mainSymName = () => ($('hx-sym-name')?.value || '').trim();

let steps = [];
let list, onChangeCb = () => { };
let carrying = false;

const isEmptyStep = (m) =>
    !(m.main && mainSymName()) && !hasCare(m.care) &&
    !String(m.s || '').trim() && !(m.refs || []).some(r => String(r.sym || '').trim())
    // Mốc chỉ có dấu chấm trên bản đồ (vết thương, ban da…) vẫn là mốc CÓ nội dung
    && !(m.vung || []).length && !(m.dh || []).length;

export function getSteps() {
    return sorted(steps).filter(m => !isEmptyStep(m));
}

export function setSteps(arr) {
    steps = (Array.isArray(arr) ? arr : []).map(migrate);
    // Chuẩn hoá `m.s` NGAY khi nạp: mốc sau tự chép triệu chứng của mốc trước, chép
    // phải bản đã bỏ dấu hai chấm chứ không phải bản thô "Sốt: sốt về chiều".
    steps.forEach(symRows);
    render();
}

/* Bản cũ lưu { t, s } dạng chữ tự do — giữ lại nội dung, xếp vào nhóm "trước nhập viện" */
let seq = 0;
const newId = () => 'm' + (Date.now().toString(36)) + (++seq);

function migrate(m) {
    if (m && m.phase) return { ...JSON.parse(JSON.stringify(m)), id: m.id || newId() };
    const t = String(m?.t || '').trim();
    const num = t.match(/(\d+)\s*(giờ|ngày|tuần|tháng)/);
    return {
        phase: /sau/i.test(t) ? 'sau' : /ngày nhập viện|nhập viện$/i.test(t) && !num ? 'nv' : 'truoc',
        n: num ? num[1] : '', u: num ? num[2] : 'ngày',
        // Bản rất cũ ghép mốc + triệu chứng bằng dấu hai chấm — nối bằng dấu phẩy
        // cho khỏi lọt dấu ":" vào đoạn bệnh sử.
        s: [t && !num ? t : '', m?.s || ''].filter(Boolean).join(', '),
        refs: [], id: newId()
    };
}

/** Xa nhất trước, tiến dần về ngày nhập viện rồi tới sau nhập viện */
function sorted(arr) {
    const rank = (m) => {
        const h = (parseFloat(m.n) || 0) * (UNIT_HOURS[m.u] || 24);
        if (m.phase === 'truoc') return -h;          // CNV 5 ngày = -120, CNV 1 ngày = -24
        if (m.phase === 'nv') return 0;
        return h + 0.001;                            // sau nhập viện
    };
    return arr.map((m, i) => [m, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(x => x[0]);
}

/** Tất cả triệu chứng đã xuất hiện ở các mốc trước mốc thứ i */
function symptomsBefore(i) {
    const names = new Set();
    const view = sorted(steps);
    const mainIdx = view.findIndex(m => m.main);
    const main = mainSymName();
    // Triệu chứng chính chỉ là "đã có từ trước" với các mốc SAU mốc khởi phát của nó
    if (main && mainIdx >= 0 && mainIdx < i) names.add(main);
    view.slice(0, i).forEach(m => {
        symParts(m).map(tenGoc).forEach(x => x && names.add(x));
        (m.refs || []).forEach(r => r.sym && names.add(tenGoc(r.sym)));
    });
    return [...names];
}

/** Triệu chứng cũ mà mốc này chưa nhắc tới — người đọc sẽ không biết còn hay hết */
function missingCarry(m, i) {
    const said = new Set([...(m.refs || []).map(r => tenGoc(r.sym)),
    ...symParts(m).map(tenGoc)].filter(Boolean).map(x => x.toLowerCase()));
    return symptomsBefore(i).filter(x => !said.has(x.toLowerCase()));
}

const trimText = (x) => String(x ?? '').trim();
const lower = (x) => trimText(x).toLowerCase();

/** Triệu chứng người dùng đã cố ý xóa khỏi mốc này — đừng chép lại nữa */
const skipped = (m) => new Set((m.skip || []).map(lower));

/**
 * Mỗi mốc phải nói lại các triệu chứng đã có từ mốc trước (còn / giảm / nặng hơn),
 * nên máy tự điền sẵn dòng "tương tự" thay vì bắt gõ lại. Xóa dòng nào thì nhớ luôn
 * là đã bỏ, khỏi bị chép về sau mỗi lần vẽ lại.
 * @returns true nếu có thêm dòng mới
 */
function autoCarry(view) {
    let changed = false;
    view.forEach((m, i) => {
        if (!i) return;                       // mốc đầu chưa có gì "từ trước"
        const skip = skipped(m);
        missingCarry(m, i).forEach(sym => {
            if (skip.has(lower(sym))) return;
            (m.refs ||= []).push({ sym, st: 'tương tự', d: '' });
            changed = true;
        });
    });
    return changed;
}

/* Triệu chứng mới của một mốc vẫn lưu chung trong chuỗi `s` (ngăn bằng dấu ;)
   để không phải đổi cấu trúc bệnh án đã lưu, nhưng giao diện bày thành từng thẻ. */
const symParts = (m) => String(m.s || '').split(';').map(trimText).filter(Boolean);
const setSymParts = (m, arr) => { m.s = arr.join('; '); };

/* ---------- triệu chứng mới của một mốc, có cấu trúc ----------
   `m.s` vẫn là nơi lưu duy nhất (chuỗi ngăn bằng ";") nên bản ghi cũ, phần xuất file
   và những chỗ khác ghi thẳng vào `m.s` (lý do vào viện đổ triệu chứng phụ xuống mốc)
   đều không phải đổi gì. `m.sx` chỉ là bản có cấu trúc để sửa từng đặc điểm tại chỗ,
   tự dựng lại mỗi khi `m.s` bị nơi khác sửa. */
let openNew = null;      // "idMốc|chỉ số" — dòng đang mở bảng đặc điểm

/* `findSymptom` nay khớp theo ranh giới từ ở đầu chuỗi (xem trieu-chung-data.js)
   nên tra thẳng là an toàn: "Tiểu máu: đỏ tươi, sốt" ra Tiểu máu chứ không ra Sốt. */
const symOf = (r) => findSymptom(trimText(r?.ten));

/** Tách một phần của `m.s` thành { ten, v, tuDo }.
 *  Bản do bảng khai thác ghép có dạng "Tên: v1, v2, v3" (describe của trieu-chung-data),
 *  tách ngược ra để sửa lại từng đặc điểm ngay tại dòng. */
function tachMoTa(t) {
    const m = /^([^:]+):\s*(.+)$/.exec(trimText(t));
    const sym = m && SYMPTOMS.find(x => fold(x.ten) === fold(m[1]));
    if (!sym) return { ten: trimText(t), v: {}, tuDo: trimText(t) };
    const con = m[2].split(',').map(trimText).filter(Boolean);
    const v = {};
    // Ưu tiên gán theo đúng danh sách lựa chọn của từng ô; `describe` bỏ ô trống
    // trước khi nối nên gán thuần theo thứ tự dễ lệch.
    sym.fields.forEach(([k, , opts]) => {
        if (!opts) return;
        const i = con.findIndex(x => opts.some(o => fold(o) === fold(x)));
        if (i >= 0) v[k] = con.splice(i, 1)[0];
    });
    sym.fields.forEach(([k]) => { if (!v[k] && con.length) v[k] = con.shift(); });
    return { ten: sym.ten, v, tuDo: trimText(t) };
}

/** Ghép một dòng thành câu mô tả, KHÔNG dùng dấu hai chấm: "Đau ngực sau xương ức, đè nặng" */
function moTaMoi(r) {
    const ten = trimText(r.ten);
    const sym = symOf(r);
    /* Mỗi đặc điểm là một ô nhập riêng nên hay được gõ hoa chữ đầu; nằm giữa câu
       thì ra "loét da Lòng bàn chân trái, 2×2cm, Hoại tử đen" — hạ xuống hết. */
    const vals = sym ? sym.fields.map(([k]) => lowerDau(trimText(r.v?.[k]))).filter(Boolean) : [];
    if (!vals.length) return trimText(r.tuDo) || ten;
    // Nhiều lựa chọn đã tự mang tên triệu chứng ("sốt về chiều", "ho ra máu") —
    // dán tên vào nữa thì ra "Sốt sốt về chiều".
    const dau = fold(vals[0]).startsWith(fold(ten)) ? vals[0] : `${ten} ${vals[0]}`;
    return [dau, ...vals.slice(1)].join(', ');
}

/** Danh sách có cấu trúc của một mốc; dựng lại khi `m.s` vừa bị nơi khác sửa */
function symRows(m) {
    if (!Array.isArray(m.sx) || m._sKey !== m.s) {
        m.sx = symParts(m).map(tachMoTa);
        // Chuẩn hoá luôn: bản cũ do bảng khai thác ghép có dấu hai chấm ("Tiểu máu:
        // đỏ tươi") — đọc lên là chuyển sang lối văn xuôi, khỏi lọt vào bệnh sử.
        m.s = m.sx.map(moTaMoi).filter(Boolean).join('; ');
        m._sKey = m.s;
    }
    return m.sx;
}

/** Sửa xong thì ghép ngược xuống `m.s` — nguồn lưu vẫn chỉ có một */
function syncSymRows(m) {
    m.s = (m.sx || []).map(moTaMoi).filter(Boolean).join('; ');
    m._sKey = m.s;
}

/** Nhãn mốc: "CNV 4 ngày" / "Ngày nhập viện" / "Sau nhập viện 2 ngày" */
export function stepLabel(m) {
    if (m.phase === 'nv') return 'Ngày nhập viện';
    const n = String(m.n || '').trim();
    if (m.phase === 'sau') return n ? `Sau nhập viện ${n} ${m.u}` : 'Sau nhập viện';
    return n ? `CNV ${n} ${m.u}` : 'CNV';
}

/** Triệu chứng chính chỉ neo vào đúng một mốc — mặc định mốc xa nhất (lúc khởi phát) */
function ensureMain(view) {
    const idx = view.findIndex(m => m.main);
    view.forEach((m, i) => { m.main = i === (idx < 0 ? 0 : idx); });
}

/** Ngày dương lịch -> mốc so với ngày nhập viện. Bệnh nhân nhớ "hôm 12/10" chứ
 *  không nhớ "cách nhập viện 5 ngày", nên cho gõ ngày rồi máy quy đổi. */
function mocTuNgay(iso) {
    const admit = $('admission-date')?.value;
    if (!iso || !admit) return null;
    const days = Math.round(
        (new Date(admit + 'T00:00:00') - new Date(iso + 'T00:00:00')) / 86400000);
    if (!Number.isFinite(days)) return null;
    if (days === 0) return { phase: 'nv', n: '', u: 'ngày' };
    const abs = Math.abs(days);
    const u = abs < 21 ? 'ngày' : abs < 90 ? 'tuần' : 'tháng';
    const n = u === 'ngày' ? abs : u === 'tuần' ? Math.round(abs / 7) : Math.round(abs / 30);
    return { phase: days > 0 ? 'truoc' : 'sau', n: String(Math.max(1, n)), u };
}

/** Ngày dương lịch của mốc, tính ngược từ ngày nhập viện — khỏi phải nhẩm trong đầu */
function stepDate(m) {
    if (m.d) return fmtDate(m.d).slice(0, 5);      // đã gõ ngày cụ thể thì khỏi tính lại
    const admit = $('admission-date')?.value;
    if (!admit) return '';
    const sign = m.phase === 'truoc' ? -1 : m.phase === 'sau' ? 1 : 0;
    if (sign && !String(m.n || '').trim()) return '';
    const d = new Date(admit + 'T00:00:00');
    d.setHours(d.getHours() + sign * (parseFloat(m.n) || 0) * (UNIT_HOURS[m.u] || 24));
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/* ---------- vẽ ---------- */

/* Chọn "thuyên giảm" / "nặng hơn" xong thì phải nói RÕ LÀ NHƯ THẾ NÀO — đó là chỗ
   sinh viên hay bỏ trống nhất. Bày sẵn câu trả lời, lấy từ chính các trục mà thư viện
   đã hỏi cho triệu chứng đó (kiểu sốt, mức độ, tần suất…) nên mỗi triệu chứng ra một
   bộ gợi ý khác nhau, cộng vài câu chung luôn đúng. */
/* Danh sách lựa chọn của thư viện là PHÂN LOẠI, không xếp theo độ nặng — suy ra
   "nặng hơn" từ đó là ra những câu tự mâu thuẫn ("sốt nặng hơn, nay sốt nhẹ").
   Nên gợi ý theo TRỤC THAY ĐỔI (chính là nhãn các ô mà thư viện đã hỏi), để dở dang
   cho người dùng điền nốt con số — đúng lối viết bệnh án:
   "sốt nặng hơn, nhiệt độ cao nhất tăng lên 39,5°C". */
const TRUC_DINH_LUONG = /m[ứu]c đ[ộo]|t[ầa]n su[ấa]t|th[ờo]i gian|nhi[ệe]t đ[ộo]|l[ưu][ơợ]ng|s[ốo] l[ầa]n|k[ée]o d[àa]i|đi[ểe]m/i;

function goiYDoi(r) {
    if (r.st !== 'thuyên giảm' && r.st !== 'nặng hơn') return [];
    const nang = r.st === 'nặng hơn';
    const sym = findSymptom(tenRef(r.sym));
    // Có bộ câu riêng của triệu chứng đó thì dùng — sốt đổi ngưỡng nhiệt, đau đổi
    // điểm đau, khó thở đổi ngưỡng gắng sức, mỗi thứ một kiểu.
    const rieng = DOI_TRIEU_CHUNG[sym?.ten]?.[nang ? 'nang' : 'giam'] || [];
    if (rieng.length) return rieng;
    // Chưa có thì sinh theo TRỤC THAY ĐỔI, để dở dang cho người dùng điền nốt con số
    const chung = nang
        ? ['tăng cả mức độ lẫn tần suất', 'cơn dày hơn và kéo dài hơn']
        : ['giảm rõ sau khi dùng thuốc', 'cơn thưa hơn và ngắn lại'];
    const truc = (sym?.fields || []).map(([, nhan]) => {
        const l = trimText(nhan).toLowerCase();
        return TRUC_DINH_LUONG.test(l)
            ? `${l} ${nang ? 'tăng lên' : 'giảm còn'} `
            : `${l} đổi thành `;
    });
    return [...new Set([...chung, ...truc])].slice(0, 8);
}

function refHtml(r, i, k) {
    const needDetail = (r.st === 'thuyên giảm' || r.st === 'nặng hơn') && !String(r.d || '').trim();
    return `<div class="hx-ref ${needDetail ? 'is-warn' : ''}" data-i="${i}" data-k="${k}">
        <input class="hx-sym" data-f="sym" list="hx-sym-list" value="${esc(r.sym || '')}" placeholder="Triệu chứng cũ" aria-label="Triệu chứng cũ">
        <button type="button" class="hx-refpick" data-act="pick-ref" title="Chọn từ thư viện triệu chứng"><i class="fas fa-magnifying-glass"></i></button>
        <select class="hx-st" data-f="st" aria-label="Diễn biến của triệu chứng">
            ${STATES.map(s => `<option ${r.st === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <input class="hx-d" data-f="d" value="${esc(r.d || '')}"
            placeholder="${r.st === 'tương tự' ? 'mô tả thêm (không bắt buộc)' : 'chạm để chọn, hoặc gõ rõ là như thế nào'}" aria-label="Mô tả rõ">
        <button type="button" class="hx-x" data-act="del-ref" title="Xóa dòng"><i class="fas fa-xmark"></i></button>
    </div>`;
}

/* Mỗi triệu chứng mới bày ra như khối "Triệu chứng chính": tên ở trên, bấm mũi tên
   là bung đúng bộ câu hỏi của nó, chạm chip là xong — không phải mở modal riêng. */
function newFieldHtml(r, [k, label, opts, ph]) {
    const val = trimText(r.v?.[k]);
    if (!opts) {
        return `<label class="sp-f"><span>${esc(label)}</span>
            <input data-nf="${esc(k)}" value="${esc(val)}" placeholder="${esc(ph || '')}"></label>`;
    }
    const la = opts.some(o => o === val);
    return `<label class="sp-f"><span>${esc(label)}</span>
        <div class="sp-opts">${opts.map(o =>
        `<button type="button" class="sp-opt${val === o ? ' is-on' : ''}" data-nopt="${esc(k)}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>
        ${val && !la ? `<input data-nf="${esc(k)}" value="${esc(val)}" placeholder="tự gõ ý khác">` : ''}</label>`;
}

/** Ruột của bảng đặc điểm — tách riêng để vẽ lại được mà không đụng ô tên đang gõ */
function newPanelInner(r) {
    const sym = symOf(r);
    return sym?.fields?.length
        ? `<div class="hx-newgrid">${sym.fields.map(f => newFieldHtml(r, f)).join('')}</div>`
        : `<label class="sp-f"><span>Mô tả triệu chứng này</span>
            <input data-nfree="1" value="${esc(r.tuDo || '')}" placeholder="vd: chóng mặt khi đứng dậy, kéo dài vài phút"></label>`;
}

function newRowHtml(r, j, m) {
    const sym = symOf(r);
    const mo = openNew === `${m.id}|${j}`;
    const daHoi = (sym?.fields || []).some(([k]) => trimText(r.v?.[k]));
    const thieu = !!sym?.fields?.length && !daHoi;
    const cau = moTaMoi(r);
    return `<div class="hx-newrow${thieu ? ' chua-khai' : ''}${mo ? ' is-open' : ''}" data-j="${j}">
        <input class="hx-newin" data-k="new-ten" data-j="${j}" value="${esc(r.ten)}"
            placeholder="Tên triệu chứng" aria-label="Triệu chứng mới">
        <button type="button" class="hx-newpick${thieu ? ' is-warn' : ''}" data-act="open-new" data-j="${j}"
            title="${sym?.fields?.length ? 'Hỏi cho đủ ý về triệu chứng này' : 'Không có bộ câu hỏi sẵn — gõ mô tả vào ô bên dưới'}"><i
                class="fas fa-chevron-${mo ? 'up' : 'down'}"></i></button>
        <button type="button" class="hx-x" data-act="del-new" data-j="${j}" title="Bỏ triệu chứng này"><i class="fas fa-xmark"></i></button>
        ${cau && cau !== trimText(r.ten) ? `<p class="hx-newline">${esc(cau)}</p>` : ''}
        ${thieu && !mo ? `<p class="hx-newnote"><i class="fas fa-circle-exclamation"></i>
            Mới có tên — bấm mũi tên để hỏi cho đủ đặc điểm.</p>` : ''}
        ${mo ? `<div class="hx-newpanel">${newPanelInner(r)}</div>` : ''}
    </div>`;
}

function warnHtml(m) {
    const msgs = [];
    if (m.phase !== 'nv' && !String(m.n || '').trim()) msgs.push('chưa ghi cách nhập viện bao lâu');
    if (m.dup) msgs.push('trùng mốc thời gian với một mốc khác');
    if (m.beforeOnset) msgs.push('mốc này nằm trước cả ngày khởi phát bệnh — xem lại ngày khởi phát hoặc số ngày');
    return msgs.length
        ? `<p class="hx-warn"><i class="fas fa-triangle-exclamation"></i> ${esc(msgs.join(' · '))}</p>` : '';
}

function stepHtml(m, i) {
    return `<div class="hx-step ph-${esc(m.phase || 'truoc')}${m.dup || m.beforeOnset ? ' is-warn' : ''}" data-i="${i}" data-id="${esc(m.id || '')}">
        <div class="hx-top">
            <span class="hx-label">${esc(stepLabel(m))}</span>
            ${(() => { const d = stepDate(m); return d ? `<span class="hx-date" title="Ngày dương lịch của mốc này">${esc(d)}</span>` : ''; })()}
            ${m.main ? '<span class="hx-mainflag"><i class="fas fa-star"></i> khởi phát</span>' : ''}
            <span class="hx-acts">
                <button type="button" class="hx-pin${m.main ? ' is-on' : ''}" data-act="pin"
                    title="Triệu chứng chính khởi phát ở mốc này"><i class="fas fa-star"></i></button>
                <button type="button" class="hx-x" data-act="del-step" title="Xóa mốc"><i class="fas fa-trash"></i></button>
            </span>
        </div>
        <div class="hx-when${m.phase === 'nv' ? ' is-nv' : ''}">
            <div class="hx-seg" role="group" aria-label="Mốc này ở đâu so với ngày nhập viện">
                ${[['truoc', 'Trước nhập viện'], ['nv', 'Ngày nhập viện'], ['sau', 'Sau nhập viện']]
            .map(([v, t]) => `<button type="button" class="hx-segb${m.phase === v ? ' is-on' : ''}" data-act="phase" data-v="${v}">${t}</button>`).join('')}
            </div>
            <span class="hx-numwrap">
                <button type="button" class="hx-dmode${m.dm ? ' is-on' : ''}" data-act="dmode"
                    title="${m.dm ? 'Đang gõ ngày — bấm để quay về nhập khoảng cách'
            : 'Bệnh nhân nhớ đúng ngày? Bấm rồi gõ 1210 (ngày tháng) hoặc 121025'}"><i class="fas fa-calendar-day"></i></button>
                ${m.dm ? `<input class="hx-d2" data-k="d" inputmode="numeric"
                        value="${esc(m.d ? fmtDate(m.d) : (m.dRaw || ''))}" placeholder="1210"
                        aria-label="Ngày xảy ra">
                    <span class="hx-dcalc${m.d ? '' : ' is-empty'}">${esc(m.d ? stepLabel(m) : 'gõ 1210 · 121025')}</span>`
            : (m.phase === 'nv' ? '<span class="hx-numlab">bấm lịch để gõ ngày cụ thể</span>' : `
                    <input class="hx-n" data-k="n" type="number" min="0" value="${esc(m.n || '')}" placeholder="số" aria-label="Số">
                    <select class="hx-u" data-k="u" aria-label="Đơn vị">
                        ${UNITS.map(u => `<option ${m.u === u ? 'selected' : ''}>${u}</option>`).join('')}
                    </select>
                    <span class="hx-numlab">${m.phase === 'sau' ? 'sau khi nhập viện' : 'trước khi nhập viện'}</span>`)}
            </span>
        </div>
        ${warnHtml(m)}
        ${m.main ? '<div class="hx-main-slot"></div>' : ''}
        <div class="hx-newbox">
            <div class="hx-newhead"><i class="fas fa-plus-circle"></i> Triệu chứng mới xuất hiện ở mốc này</div>
            ${(() => {
            const rows = symRows(m);
            return rows.length ? rows.map((r, j) => newRowHtml(r, j, m)).join('')
                : '<p class="hx-newempty">Chưa có — gõ nhanh bên dưới, hoặc bấm “Khai thác đủ ý” để mô tả cho chuẩn.</p>';
        })()}
            <div class="hx-new">
                <input class="hx-s" data-k="quick" value="" placeholder="Gõ nhanh rồi Enter" aria-label="Thêm nhanh triệu chứng">
                <button type="button" class="hx-pick" data-act="pick-sym" title="Chọn từ thư viện và khai thác đủ đặc điểm"><i class="fas fa-notes-medical"></i> Khai thác đủ ý</button>
            </div>
        </div>
        ${careHtml(m.care)}
        ${(() => {
            const refs = m.refs || [];
            const miss = missingCarry(m, i);
            // Mốc đầu tiên chưa có gì "từ trước" — khỏi bày hộp rỗng làm rối
            if (!i && !refs.length && !miss.length) return '';
            return `<div class="hx-oldbox">
                <div class="hx-oldhead"><i class="fas fa-rotate-left"></i> Triệu chứng đã có từ trước — nay còn hay hết?
                    <span class="hx-oldtip">máy tự chép từ mốc trước, chỉ cần chọn còn / giảm / nặng hơn</span></div>
                ${miss.length ? `<p class="hx-carry">Đã bỏ qua: <b>${esc(miss.join(', '))}</b>
                    <button type="button" class="hx-mini" data-act="carry">+ Thêm lại</button></p>` : ''}
                ${refs.map((r, k) => refHtml(r, i, k)).join('')}
                <button type="button" class="hx-mini" data-act="add-ref"><i class="fas fa-plus"></i> Thêm triệu chứng cũ</button>
            </div>`;
        })()}
        ${(() => {
            // Thấy ngay mốc này sẽ thành câu gì trong đoạn bệnh sử — sửa ô nào là câu đổi ngay.
            const cau = stepProse(m, { laKhoiPhat: !!m.main });
            return `<p class="hx-preview${cau ? '' : ' is-empty'}">${cau
                ? esc(cau)
                : 'Mốc này chưa có nội dung — chưa góp câu nào vào bệnh sử.'}</p>`;
        })()}
    </div>`;
}

function symbolList() {
    const names = new Set();
    const main = ($('hx-sym-name')?.value || '').trim();
    if (main) names.add(main);
    steps.forEach(m => {
        String(m.s || '').split(/[,;]/).map(x => x.trim()).filter(Boolean).forEach(x => names.add(x));
        (m.refs || []).forEach(r => r.sym && names.add(r.sym.trim()));
    });
    return [...names].slice(0, 30);
}

/** Số giờ từ mốc tới lúc nhập viện (dương = trước nhập viện) */
function hoursBefore(m) {
    if (m.phase !== 'truoc') return 0;
    return (parseFloat(m.n) || 0) * (UNIT_HOURS[m.u] || 24);
}

/** Bệnh khởi phát cách nhập viện bao nhiêu giờ — để bắt mốc ghi ngược đời */
function onsetHours() {
    const onset = $('hx-onset-date')?.value;
    const admit = $('admission-date')?.value;
    if (!onset || !admit) return null;
    const h = (new Date(admit) - new Date(onset)) / 3600000;
    return h >= 0 ? h : null;
}

function flagLogic(view) {
    const onset = onsetHours();
    const seen = new Map();
    view.forEach(m => {
        const key = m.phase + '|' + (String(m.n || '').trim() || '?') + '|' + m.u;
        m.dup = m.phase === 'nv' ? seen.has('nv') : (String(m.n || '').trim() ? seen.has(key) : false);
        seen.set(m.phase === 'nv' ? 'nv' : key, true);
        // +12 giờ cho phép sai số nửa ngày, khỏi báo động vì làm tròn
        m.beforeOnset = onset != null && m.phase === 'truoc' && hoursBefore(m) > onset + 12;
    });
}

function render() {
    if (!list) return;
    const view = sorted(steps);
    flagLogic(view);
    ensureMain(view);
    const added = autoCarry(view);
    steps = view;                        // giữ mảng đúng thứ tự hiển thị, khỏi lệch chỉ số
    // Gỡ khối "Triệu chứng chính" về chỗ đậu trước khi xóa danh sách, kẻo mất luôn ô đang có dữ liệu
    const boxes = EMBEDS.map(([id, park]) => [$(id), $(park)]);
    boxes.forEach(([box, park]) => { if (box) park?.appendChild(box); });
    list.innerHTML = view.length
        ? view.map((m, i) => (i ? gapHtml(view[i - 1], m) : '') + stepHtml(m, i)).join('')
        : `<p class="hx-empty">Chưa có mốc nào — bấm “Thêm mốc” và kể từ xa tới gần: CNV 5 ngày → CNV 2 ngày → ngày nhập viện.</p>`;
    const slot = list.querySelector('.hx-main-slot');
    boxes.forEach(([box, park]) => { if (box) (slot || park)?.appendChild(box); });
    const dl = $('hx-sym-list');
    if (dl) dl.innerHTML = symbolList().map(n => `<option value="${esc(n)}">`).join('');
    // Ô "gõ nhanh triệu chứng" và ô "tuyến trước chẩn đoán gì" đều có nút mở bảng chọn;
    // gắn thêm gợi ý khi gõ để khỏi phải mở bảng mới tìm được tên.
    list.querySelectorAll('.hx-s').forEach(el => attachTypeahead(el, { items: TEN_TRIEU_CHUNG }));
    /* Ô "rõ là như thế nào": chạm vào là bày sẵn các câu đổi của ĐÚNG triệu chứng đó
       theo đúng chiều tăng / giảm. Bộ câu đổi theo trạng thái nên phải gán lại `items`
       sau mỗi lần vẽ (attachTypeahead bỏ qua ô đã gắn, nhưng cfg thì dùng chung tham
       chiếu — nên giữ mảng riêng cho từng ô rồi đổ nội dung vào). */
    list.querySelectorAll('.hx-ref').forEach(box => {
        const el = box.querySelector('.hx-d');
        const m = steps[+box.closest('.hx-step').dataset.i];
        const r = m?.refs?.[+box.dataset.k];
        if (!el || !r) return;
        el._goiY ||= [];
        el._goiY.length = 0;
        el._goiY.push(...goiYDoi(r));
        attachTypeahead(el, { items: el._goiY, minLen: 0, moKhiFocus: true });
    });
    list.querySelectorAll('.tt-dx [data-c="chanDoan"]').forEach(el => attachTypeahead(el, { items: TEN_BENH_PHANG }));
    // Máy vừa tự thêm dòng thì phải báo ra ngoài để lưu, nhưng đừng để gọi vòng lại render
    if (added && !carrying) {
        carrying = true;
        try { onChangeCb(); } finally { carrying = false; }
    }
    if (mode === 'dt') renderDienTien();   // hai chế độ xem cùng một dữ liệu, vẽ lại cả hai
}

/** Vẽ lại danh sách mốc — dùng khi ngày nhập viện đổi (mốc phải hiện ngày mới) */
export const refreshSteps = () => render();

/* =====================================================================
   Chế độ xem thứ hai: Diễn tiến (sóng + làn + bản đồ giải phẫu)
   Hai chế độ dùng chung đúng một mảng `steps`, nên sửa bên nào bên kia cũng đổi.
   ===================================================================== */
let mode = 'form';

/** Bản đồ / thanh trượt sửa một mốc — chỉ mốc đó đổi, không dựng lại cả danh sách.
 *  `nhe` = đang kéo thanh trượt: đừng vẽ lại màn (mất luôn ngón tay đang kéo). */
export function patchStep(id, patch, { nhe = false } = {}) {
    const m = steps.find(x => x.id === id);
    if (!m) return;
    Object.assign(m, patch);
    if (!nhe) renderDienTien();
    onChangeCb();
}

function applyHxMode(v) {
    mode = v === 'dt' ? 'dt' : 'form';
    if (mode !== 'dt') { stopDienTien(); if (dangMoBanDo()) openMapModal(false); }
    $('hx-list')?.classList.toggle('is-hidden', mode === 'dt');
    $('hx-dt')?.classList.toggle('is-hidden', mode !== 'dt');
    const play = $('hx-play');
    if (play) play.hidden = mode !== 'dt';
    $('hx-mode')?.querySelectorAll('[data-mode]')
        .forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    if (mode === 'dt') renderDienTien();
}

/* ---------- bộ câu hỏi của triệu chứng chính ---------- */
/* Sáu ô thuộc tính là sáu chỗ trống dùng chung: chọn "Sốt" thì chúng thành
   kiểu sốt / nhiệt độ / lạnh run…, chọn "Đau ngực" thì thành vị trí / tính chất / hướng lan…
   ID và chỗ lưu giữ nguyên, chỉ đổi nhãn – gợi ý – chip, nên bệnh án cũ vẫn đọc được. */
const SYM_SLOTS = ['hx-sym-site', 'hx-sym-char', 'hx-sym-severity',
    'hx-sym-time', 'hx-sym-factors', 'hx-sym-assoc'];
let symDefaults = null;   // nhãn + gợi ý gốc, để trả về khi triệu chứng không có trong thư viện

const slotLabel = (id) => $(id)?.closest('label')?.querySelector('.lb');
const slotQ = (id) => $(id)?.closest('label')?.querySelector('.hx-q');

function rememberDefaults() {
    if (symDefaults) return;
    symDefaults = SYM_SLOTS.map(id => ({
        label: slotLabel(id)?.textContent || '', ph: $(id)?.placeholder || '',
        q: slotQ(id)?.textContent || ''
    }));
}

/** Ô nào chưa hỏi thì nói thẳng ngay tại ô đó — khỏi phải cuộn xuống hộp nhắc việc.
 *  Phải quét CẢ ô "Triệu chứng" và ô "Đã xử trí": CSS đánh dấu theo class trên <label>,
 *  bỏ sót ô nào là ô đó đeo tick xanh dù đang trống. */
export function markSymFilled() {
    const ids = ['hx-sym-name', ...SYM_SLOTS, 'hx-sym-treated'];
    ids.forEach(id => {
        const el = $(id), w = el?.closest('label');
        if (w) w.classList.toggle('is-blank', !w.hidden && !String(el.value || '').trim());
    });
}

/** Tên trần của một triệu chứng có trong thư viện mà thư viện còn bộ câu hỏi riêng
 *  -> mới ghi tên, chưa khai thác đặc điểm nào. Dùng cho cả triệu chứng chính lẫn phụ. */
export function chuaKhaiThac(text) {
    const t = trimText(text);
    if (!t) return false;
    const sym = findSymptom(t);
    return !!sym?.fields?.length && fold(sym.ten) === fold(t);
}

/** Nhãn đang hiển thị của các ô thuộc tính — đoạn văn phải kể đúng tên đang thấy trên màn */
export const mainSymLabels = () => SYM_SLOTS.map(id => ({
    id, label: (slotLabel(id)?.textContent || '').trim(), on: !$(id)?.closest('label')?.hidden
}));

/** Số ô thuộc tính đang dùng — thang chấm "đủ ý" phải chấm theo số này, không phải luôn 6 */
export const mainSymSlotCount = () => mainSymLabels().filter(x => x.on).length;

/** Điền các ô thuộc tính của triệu chứng chính theo KHÓA đặc điểm (viTri, tinhChat…).
 *  Dùng khóa chứ không dùng vị trí ô: bảng triệu chứng đổi thứ tự `fields` lúc nào
 *  thì kịch bản vẫn rơi đúng ô đó. Gọi SAU `syncMainSymFields()` (ô phải mang nhãn
 *  của triệu chứng mới rồi mới điền). Trả về số ô đã điền. */
export function fillMainSym(dac = {}) {
    const sym = findSymptom(mainSymName());
    let n = 0;
    (sym?.fields || []).forEach(([k], i) => {
        const el = $(SYM_SLOTS[i]), v = trimText(dac[k]);
        if (!el || !v) return;
        el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        n++;
    });
    markSymFilled();
    return n;
}

/** Đổi bộ câu hỏi cho khớp triệu chứng chính vừa chọn */
export function syncMainSymFields() {
    rememberDefaults();
    const sym = findSymptom(mainSymName());
    SYM_SLOTS.forEach((id, i) => {
        const el = $(id), lb = slotLabel(id), wrap = el?.closest('label');
        if (!el || !lb || !wrap) return;
        const f = sym?.fields?.[i];
        wrap.hidden = !!sym && !f;
        lb.textContent = f ? f[1] : symDefaults[i].label;
        el.placeholder = f ? (f[3] || (f[2] ? 'vd ' + f[2][0] : '')) : symDefaults[i].ph;
        setChips(id, f ? (f[2] || []) : null);
        /* Câu nhắc hỏi phải đổi theo triệu chứng: ô này vừa bị đổi từ "Vị trí" sang
           "Kiểu sốt" mà câu dưới vẫn hỏi "đau ở chỗ nào" thì hỏng cả bộ câu hỏi.
           Có sẵn danh sách trả lời thì nói rõ có mấy lựa chọn — chip đang giấu tới
           lúc chạm vào ô nên không nói thì không ai biết là có. */
        const q = slotQ(id);
        if (q) {
            const txt = !f ? symDefaults[i].q
                : f[2]?.length ? `Chạm vào ô để chọn 1 trong ${f[2].length} câu trả lời thường gặp.`
                    : (f[3] ? `Ghi cụ thể — ${f[3]}` : '');
            q.textContent = txt;
            q.hidden = !txt;
        }
    });
    const tag = $('hx-sym-tune');
    if (tag) {
        tag.hidden = !sym;
        tag.innerHTML = sym
            ? `<i class="fas fa-wand-magic-sparkles"></i> Đã đổi bộ câu hỏi cho đúng <b>${esc(sym.ten)}</b> — chạm vào ô là có sẵn lựa chọn.`
            : '';
    }
    syncSeveritySlot();
    markSymFilled();
}

/* Thang phân độ một câu hỏi (NYHA, mMRC, CCS, độ trĩ) hỏi đúng cái mà ô "Mức độ"
   đang hỏi. Thay vì bày thêm một hộp riêng, lấy luôn các lựa chọn của thang làm chip
   cho ô đó — chạm một cái là máy suy ra phân độ và ghi ngay vào cuối ô. */

/** Ô của thư viện chỉ bày sẵn TÊN phân độ ("NYHA I", "NYHA II"…) — đúng cái kiểu ghi
 *  đại mà không nhớ tiêu chuẩn. Có thang rồi thì ô này phải nhường chỗ cho thang. */
const laOPhanDo = (f) =>
    // Nhãn đã là "Mức độ" / "Phân độ" thì đó đúng là ô của thang, kể cả khi thư viện
    // để trống lựa chọn (nhiều triệu chứng đau đang là ô chữ trơn).
    /^(m[ứu]c ?đ[ộo]|ph[âa]n ?đ[ộo])/i.test(f?.[1] || '')
    || ((f?.[2] || []).length
        && f[2].every(o => /^(nyha|mmrc|ccs|độ\s|grade)/i.test(String(o))));

let sevId = 'hx-sym-severity';     // ô đang mang câu hỏi của thang

/** Giá trị ô đang giữ câu trả lời của thang — phan-do.js hỏi lại để chấm */
export const severityValue = () => String($(sevId)?.value || '');

export function syncSeveritySlot() {
    const sc = scaleForSeverity();
    sevId = 'hx-sym-severity';
    if (!sc) return;                       // để nguyên bộ câu hỏi của triệu chứng
    // Thư viện có sẵn một ô "Mức độ: NYHA I / II / III" thì thay chính ô đó, đừng
    // chiếm ô khác rồi để hai chỗ cùng hỏi mức độ (một chỗ hỏi đúng, một chỗ hỏi ẩu).
    const i = (findSymptom(mainSymName())?.fields || []).findIndex(laOPhanDo);
    if (i >= 0 && SYM_SLOTS[i]) sevId = SYM_SLOTS[i];
    const el = $(sevId), lb = slotLabel(sevId), wrap = el?.closest('label');
    if (!el || !lb || !wrap) return;
    wrap.hidden = false;
    lb.textContent = sc.nhan || sc.hoi[0][1];
    el.placeholder = 'chạm một lựa chọn — máy tự ra ' + sc.ten.split(' —')[0];
    setChips(sevId, sc.hoi[0][2]);
    applySeverityGrade();
}

/** Ô Mức độ vừa đổi -> gắn (hoặc gỡ) phần phân độ ở đuôi câu */
function applySeverityGrade() {
    const el = $(sevId);
    const sc = scaleForSeverity();
    if (!el || !sc) return;
    const raw = boPhanDo(el.value);
    const kq = gradeFromSeverity(sc, raw);
    const moi = kq ? `${raw} — ${kq.ket.split(' — ')[0]}` : raw;
    if (moi === el.value) return;
    el.value = moi;
    el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** "1 ngày sau" — khoảng cách từ mốc trước tới mốc này, vẽ chèn giữa hai thẻ */
function gapHtml(prev, cur) {
    const rankH = (m) => {
        const h = (parseFloat(m.n) || 0) * (UNIT_HOURS[m.u] || 24);
        return m.phase === 'truoc' ? -h : m.phase === 'nv' ? 0 : h;
    };
    const d = rankH(cur) - rankH(prev);
    if (!(d > 0)) return '';
    const text = d < 24 ? `${Math.round(d)} giờ sau`
        : d < 168 ? `${Math.round(d / 24)} ngày sau`
            : d < 720 ? `${Math.round(d / 168)} tuần sau` : `${Math.round(d / 720)} tháng sau`;
    return `<div class="hx-gap"><span><i class="fas fa-arrow-down-long"></i> ${esc(text)}</span></div>`;
}

/* ---------- ngày khởi phát ---------- */
export function calcOnset() {
    const tag = $('hx-onset-tag');
    if (!tag) return;
    const onset = $('hx-onset-date')?.value;
    if (!onset) { tag.textContent = ''; return; }
    const day = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);
    const admit = $('admission-date')?.value;
    const now = String($('record-datetime')?.value || '').slice(0, 10);
    const parts = [];
    if (now) {
        const d = day(now, onset);
        if (d >= 0) parts.push(`Bệnh ngày thứ ${d + 1}`);
    }
    if (admit) {
        const d = day(admit, onset);
        if (d > 0) parts.push(`khởi phát cách nhập viện ${d} ngày`);
        else if (d === 0) parts.push('khởi phát ngay ngày nhập viện');
    }
    tag.textContent = parts.join(' · ');
}

/** Ghép các câu âm tính vừa tick trong bảng chọn vào ô "triệu chứng âm tính" */
export function addNegatives(list) {
    const el = $('hx-negatives');
    if (!el || !list?.length) return;
    const cur = el.value.split(/[,;]/).map(trimText).filter(Boolean);
    list.forEach(x => { if (!cur.some(c => lower(c) === lower(x))) cur.push(trimText(x)); });
    el.value = cur.join(', ');
    el.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Bệnh cảnh đang khai thác: tên triệu chứng chính + triệu chứng ở mọi mốc.
 * Các tab sau (lược qua cơ quan, khám, biện luận) dựa vào đây để gợi ý đúng trọng tâm.
 */
export function getClinicalContext() {
    const names = new Set();
    const main = mainSymName();
    if (main) names.add(main);
    // Lý do vào viện tính luôn: mới mở bệnh án, chưa kịp khai bệnh sử thì các tab
    // sau vẫn phải biết đang đi theo bệnh cảnh nào mà gợi ý cho trúng.
    String($('reason-for-admission')?.value || '').split(/[,;\n]+/)
        .map(trimText).filter(Boolean).forEach(t => names.add(t));
    steps.forEach(m => {
        symParts(m).forEach(t => names.add(t));
        (m.refs || []).forEach(r => r.sym && names.add(trimText(r.sym)));
    });
    // Chuỗi mô tả dài ("Đau ngực: sau xương ức, đè nặng") vẫn dò ra được triệu chứng gốc
    return [...new Set([...names].map(resolveSymptom).filter(Boolean))];
}

/* Dò triệu chứng trong một câu mô tả. Phải so theo *nguyên chữ*: bắt kiểu
   "chứa chuỗi con" thì "khó thở" lại khớp trúng "Ho" — sai bét bộ gợi ý. */
function resolveSymptom(text) {
    const head = fold(String(text).split(':')[0]).trim();
    if (!head) return null;
    return SYMPTOMS.find(s => fold(s.ten) === head)
        || SYMPTOMS.find(s => new RegExp(`(^|[^a-z0-9])${fold(s.ten).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(head))
        || null;
}

/** Mốc nào đang thiếu mô tả cho triệu chứng giảm/nặng hơn */
export function missingDetails() {
    const out = [];
    getSteps().forEach(m => (m.refs || []).forEach(r => {
        if ((r.st === 'thuyên giảm' || r.st === 'nặng hơn') && !String(r.d || '').trim()) {
            out.push(`${stepLabel(m)}: ${r.sym || 'triệu chứng'} ${r.st}`);
        }
    }));
    return out;
}

/* ---------- ghép đoạn văn ---------- */
export function buildProse() {
    const v = (id) => ($(id)?.value || '').trim();
    const out = [];

    const who = v('hx-informant');
    if (who) {
        const rel = v('hx-relation');
        const trust = v('hx-reliability');
        const duoi = trust ? `, độ tin cậy ${trust.toLowerCase()}` : '';
        out.push(who === 'Bệnh nhân'
            ? `Bệnh nhân tự khai bệnh${duoi}.`
            : `Người khai bệnh là ${who.toLowerCase()}${rel ? ` (${rel})` : ''}${duoi}.`);
    }

    const tag = $('hx-onset-tag')?.textContent;
    if (tag) out.push(tag.charAt(0).toUpperCase() + tag.slice(1) + '.');

    const symDesc = mainSymProse();
    const timeline = getSteps();
    const mainStep = timeline.find(m => m.main);
    // Triệu chứng chính được kể ngay tại mốc khởi phát; chỉ tách ra câu riêng khi
    // chưa dựng mốc nào, không thì kể hai lần.
    if (symDesc && !mainStep) out.push(`Bệnh nhân ${symDesc}.`);

    /* Diễn tiến: MỖI MỐC MỘT ĐOẠN. Dồn hết vào một đoạn thì người đọc không thấy
       được bệnh đi qua mấy chặng; tách ra là nhìn phát biết ngay mạch thời gian. */
    timeline.forEach(m => {
        const doan = stepProse(m, { laKhoiPhat: m === mainStep });
        if (doan) out.push(doan);
    });
    if (v('hx-sym-treated')) out.push(`Trước khi nhập viện, bệnh nhân đã ${v('hx-sym-treated')}.`);
    // Sản khoa: theo dõi thai kỳ là một phần của bệnh sử, không phải tiền căn
    const san = [
        v('ob-hx-visits'), v('ob-hx-where') && `tại ${v('ob-hx-where')}`,
        v('ob-hx-vat') && `tiêm uốn ván ${v('ob-hx-vat')}`,
        v('ob-hx-us') && `siêu âm gần nhất ghi nhận ${v('ob-hx-us')}`,
        v('ob-hx-tests') && `xét nghiệm ${v('ob-hx-tests')}`,
        v('ob-hx-abnormal') && `ghi nhận ${v('ob-hx-abnormal')}`
    ].filter(Boolean);
    if (san.length) out.push(`Trong thai kỳ, bệnh nhân ${san.join(', ')}.`);
    const gain = $('ob-gain-out')?.textContent || '';
    if (san.length && /^Tăng /.test(gain)) out.push(gain + '.');

    // Nhi khoa: ăn – tiểu – phân – dịch tễ là bốn ý bắt buộc hỏi
    const nhi = [
        v('ped-hx-feed') && `ăn – bú ${v('ped-hx-feed')}`,
        v('ped-hx-urine'), v('ped-hx-stool') && `đi phân ${v('ped-hx-stool')}`,
        v('ped-hx-epi') && `dịch tễ ghi nhận ${v('ped-hx-epi')}`,
        v('ped-hx-treated') && `đã được điều trị ${v('ped-hx-treated')}`
    ].filter(Boolean);
    if (v('ped-hx-who')) out.push(`Người nuôi trẻ khai bệnh là ${v('ped-hx-who').toLowerCase()}.`);
    if (nhi.length) out.push(`Trẻ ${nhi.join(', ')}.`);
    const dehyd = $('ped-dehyd-out')?.textContent || '';
    if (nhi.length && /^Sụt /.test(dehyd)) out.push(dehyd + '.');

    const daily = [['ăn uống', v('hx-eat')], ['ngủ', v('hx-sleep')],
    ['tiêu', v('hx-stool')], ['tiểu', v('hx-urine')]].filter(([, x]) => x);
    const chung = [v('hx-general'), ...daily.map(([k, x]) => `${k} ${x}`)].filter(Boolean);
    if (chung.length) out.push(`Trong quá trình bệnh, bệnh nhân ${noiLoiKe(chung)}.`);
    if (v('hx-negatives')) out.push(`Bệnh nhân ${v('hx-negatives')}.`);
    // Nhãn viết thường cho hợp văn xuôi, nhưng đơn vị (mmHg, SpO2, °C) phải giữ nguyên
    const admV = [['mạch', 'adm-pulse', 'lần/phút'], ['huyết áp', 'adm-bp', 'mmHg'],
    ['nhiệt độ', 'adm-temp', '°C'], ['nhịp thở', 'adm-resp', 'lần/phút'],
    ['SpO2', 'adm-spo2', '%'], ['', 'adm-note', '']]
        .map(([l, id, u]) => v(id) && `${l ? l + ' ' : ''}${v(id)}${u ? ' ' + u : ''}`).filter(Boolean);
    if (admV.length) out.push(`Ghi nhận lúc nhập viện, bệnh nhân có ${admV.join(', ')}.`);
    if (v('hx-admit-state')) out.push(`Lúc nhập viện, bệnh nhân ${v('hx-admit-state')}.`);
    if (v('hx-after-admit')) out.push(`Từ lúc nhập viện đến lúc làm bệnh án, ${v('hx-after-admit')}.`);

    return out.map(boHaiCham).filter(Boolean).join('\n');
}

/* ---------- khởi động ---------- */
export function initHistory(options) {
    onChangeCb = options.onChange || (() => { });
    list = $('hx-list');
    if (!list) return;

    /* Chế độ Diễn tiến phải dựng TRƯỚC render() đầu tiên: render() có thể gọi
       renderDienTien() ngay, mà lúc đó nó chưa biết lấy mốc ở đâu. */
    initDienTien({
        host: $('hx-dt'),
        getSteps: () => sorted(steps),
        onPatch: patchStep,
        labelOf: stepLabel,
        proseOf: (m) => stepProse(m, { laKhoiPhat: !!m.main }),
        // Quy tên về đúng tên trong thư viện triệu chứng, để "Đau bụng âm ỉ quanh
        // rốn…" ở mốc này và "Đau bụng" ở mốc kia vẫn là MỘT đường trên đồ thị
        tenChuan: tenGoc,
        mainTen: mainSymName
    });
    $('hx-mode')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-mode]');
        if (b) applyHxMode(b.dataset.mode);
    });

    /* Mở bản đồ cơ thể từ bất kỳ đâu. Ba việc phải làm đủ, thiếu cái nào cũng ra
       màn trống: có ít nhất một mốc (không thì chế độ Diễn tiến báo "chưa có mốc
       nào"), chuyển sang chế độ Diễn tiến, rồi mới bung cửa sổ. */
    function moBanDo() {
        if (!steps.length) {
            steps.push({
                id: 'm' + Date.now().toString(36), phase: 'truoc',
                n: '', u: 'ngày', s: '', refs: []
            });
            render();
            onChangeCb();
        }
        applyHxMode('dt');
        openMapModal(true);
    }
    $('hx-map')?.addEventListener('click', moBanDo);
    $('hx-sym-map')?.addEventListener('click', moBanDo);
    $('hx-play')?.addEventListener('click', (e) => {
        const b = e.currentTarget;
        const nhan = (dang) => {
            b.innerHTML = dang ? '<i class="fas fa-stop"></i> Dừng'
                : '<i class="fas fa-play"></i> Phát diễn tiến';
        };
        // Bấm lần nữa lúc đang chạy = dừng, trả màn về đủ mốc
        if (dangPhat()) { stopDienTien(); renderDienTien(); return nhan(false); }
        playDienTien((dang) => {
            b.innerHTML = dang
                ? '<i class="fas fa-stop"></i> Dừng'
                : '<i class="fas fa-play"></i> Phát diễn tiến';
        });
    });
    applyHxMode('form');

    render();
    // Ngay từ đầu, ô nào trống phải mang dấu nhắc chứ đừng đeo tick xanh
    markSymFilled();

    /* Chạm chip ở ô "Mức độ" là máy gắn phân độ ngay. Chỉ chạy với input do MÁY
       phát (chip bấm) và lúc rời ô — chứ gắn giữa lúc đang gõ tay thì con trỏ bị
       đẩy ra sau đoạn "— NYHA III" vừa chèn. */
    /* Ô mang thang có thể đổi theo từng triệu chứng nên bắt sự kiện ở cả khối,
       lọc theo `sevId` lúc chạy thay vì gắn cứng vào một ô. */
    const laOThang = (e) => e.target.id === sevId;
    $('hx-main-box')?.addEventListener('input', (e) => {
        if (laOThang(e) && !e.isTrusted) applySeverityGrade();
    });
    $('hx-main-box')?.addEventListener('change', (e) => {
        if (laOThang(e)) applySeverityGrade();
    });

    // Điền tới đâu bỏ dấu "chưa hỏi" tới đó
    $('hx-main-box')?.addEventListener('input', markSymFilled);

    /* Triệu chứng chính cũng chọn từ bảng đầy đủ như ở Lý do vào viện — chọn xong
       máy đổ luôn từng đặc điểm vào đúng ô của nó, khỏi gõ lại. */
    $('hx-sym-pick')?.addEventListener('click', () => openSymptomPicker({
        title: 'Triệu chứng chính — khai thác đủ ý',
        initial: mainSymName(),
        onPick: (text, ten, extra) => {
            const el = $('hx-sym-name');
            if (!el) return;
            el.value = ten;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            syncMainSymFields();
            // Bộ ô thuộc tính chính là bộ `fields` của triệu chứng đó -> khớp theo thứ tự
            (findSymptom(ten)?.fields || []).forEach((f, i) => {
                const o = $(SYM_SLOTS[i]), v = extra?.values?.[f[0]];
                if (!o || !v || o.closest('label')?.hidden) return;
                o.value = v;
                o.dispatchEvent(new Event('input', { bubbles: true }));
            });
            addNegatives(extra?.negatives);
            markSymFilled();
            onChangeCb();
        }
    }));

    const stepOf = (el) => steps[+el.closest('.hx-step').dataset.i];

    /** Vẽ lại đúng câu xem trước của một mốc, khỏi dựng lại cả thẻ (mất chỗ con trỏ) */
    function refreshPreview(stepEl, m) {
        const box = stepEl?.querySelector('.hx-preview');
        if (!box) return;
        const cau = stepProse(m, { laKhoiPhat: !!m.main });
        box.textContent = cau || 'Mốc này chưa có nội dung — chưa góp câu nào vào bệnh sử.';
        box.classList.toggle('is-empty', !cau);
    }

    /** Vẽ lại theo thứ tự thời gian rồi trả con trỏ về ô vừa sửa */
    function reorder(id, key) {
        render();
        const back = list.querySelector(`.hx-step[data-id="${id}"] [data-k="${key}"]`);
        if (!back) return;
        back.focus();
        back.setSelectionRange?.(back.value.length, back.value.length);
    }

    const onEdit = (e) => {
        const el = e.target;
        if (el.closest('.hx-embed')) return;   // khối gắn thêm do form chính lo, không phải dữ liệu mốc
        if (!el.closest('.hx-step')) return;
        const m = stepOf(el);
        if (!m) return;
        const refEl = el.closest('.hx-ref');
        if (refEl) {
            m.refs[+refEl.dataset.k][el.dataset.f] = el.value;
            if (el.dataset.f === 'st') render();     // đổi trạng thái -> đổi lời nhắc + cảnh báo
            else {
                refEl.classList.toggle('is-warn',
                    (m.refs[+refEl.dataset.k].st !== 'tương tự') && !el.value.trim() && el.dataset.f === 'd');
                refreshPreview(el.closest('.hx-step'), m);
            }
        } else if (el.dataset.c) {
            (m.care ||= emptyCare())[el.dataset.c] = el.value;
            // Đổi hình thức thì hiện / ẩn ô "nằm bao nhiêu ngày"
            if (el.dataset.c === 'hinhThuc') render();
            else {
                const box = el.closest('.tt-card')?.querySelector('.tt-preview');
                if (box) box.textContent = careLine(m.care); else render();
                refreshPreview(el.closest('.hx-step'), m);
            }
        } else if (el.dataset.k === 'd') {
            // Gõ tới đâu quy đổi tới đó, đủ số là hiện luôn "Cách nhập viện mấy ngày"
            m.dRaw = el.value;
            const iso = parseNgay(el.value);
            const moc = iso ? mocTuNgay(iso) : null;
            m.d = moc ? iso : '';
            if (moc) Object.assign(m, moc);
            const stepEl = el.closest('.hx-step');
            const tag = stepEl?.querySelector('.hx-dcalc');
            if (tag) {
                tag.textContent = moc ? `${stepLabel(m)} · ${fmtDate(iso)}`
                    : (iso ? 'chưa ghi ngày nhập viện nên chưa quy đổi được' : 'gõ 1210 · 121025');
                tag.classList.toggle('is-empty', !moc);
            }
            const lb = stepEl?.querySelector('.hx-label');
            if (lb) lb.textContent = stepLabel(m);
            refreshPreview(stepEl, m);
            if (e.type === 'change' && m.d) {
                el.value = fmtDate(m.d);
                m.dRaw = el.value;
                reorder(m.id, 'd');
            }
            onChangeCb();
            return;
        } else if (el.dataset.k === 'new-ten' || el.dataset.nf || el.dataset.nfree) {
            const box = el.closest('.hx-newrow');
            const r = symRows(m)[+box?.dataset.j];
            if (!r) return;
            // Dấu ";" ngăn các triệu chứng trong `m.s` -> gõ vào là vỡ danh sách
            const sach = (x) => String(x || '').replace(/;/g, ',');
            if (el.dataset.k === 'new-ten') {
                r.ten = sach(el.value);
                r.tuDo = r.ten;
                /* Đổi tên là đổi luôn bộ câu hỏi. Vẽ lại RIÊNG bảng đặc điểm (không
                   đụng ô tên) để con trỏ ở nguyên chỗ đang gõ; giá trị của triệu chứng
                   cũ phải bỏ đi, giữ lại là gán nhầm sang triệu chứng mới. */
                const panel = box.querySelector('.hx-newpanel');
                const tenSym = symOf(r)?.ten || '';
                if (panel && tenSym !== (r._sym ?? null)) {
                    r._sym = tenSym;
                    r.v = {};
                    panel.innerHTML = newPanelInner(r);
                }
            }
            else if (el.dataset.nfree) r.tuDo = sach(el.value);
            else {
                (r.v ||= {})[el.dataset.nf] = sach(el.value);
                // Gõ tay ý khác thì bỏ sáng chip đang chọn của đúng ô đó
                el.closest('.sp-f')?.querySelectorAll('.sp-opt')
                    .forEach(b => b.classList.toggle('is-on', b.dataset.v === el.value));
            }
            syncSymRows(m);
            const line = box.querySelector('.hx-newline');
            const cau = moTaMoi(r);
            if (line) line.textContent = cau;
            else if (cau && cau !== r.ten) box.insertAdjacentHTML('beforeend', `<p class="hx-newline">${esc(cau)}</p>`);
            refreshPreview(el.closest('.hx-step'), m);
        } else if (el.dataset.k === 'quick') {
            // Ô gõ nhanh không thuộc dữ liệu mốc — chỉ chốt khi Enter hoặc rời ô
            if (e.type === 'change') commitQuick(el, m);
            return;
        } else {
            m[el.dataset.k] = el.value;
            const timeKey = el.dataset.k === 'n' || el.dataset.k === 'u' || el.dataset.k === 'phase';
            // Nhãn mốc nằm ở .hx-top chứ không nằm trong .hx-when — tìm sai chỗ là
            // querySelector trả null rồi vỡ ngay khi gõ con số đầu tiên.
            const stepEl = el.closest('.hx-step');
            if (timeKey) {
                const lb = stepEl?.querySelector('.hx-label');
                if (lb) lb.textContent = stepLabel(m);
                refreshPreview(stepEl, m);
            }
            // Gõ tới đâu chỉ đổi nhãn; nhập xong (change / rời ô) mới xếp lại thứ tự
            if (timeKey && (e.type === 'change' || el.dataset.k === 'phase')) reorder(m.id, el.dataset.k);
        }
        onChangeCb();
    };
    list.addEventListener('input', onEdit);
    list.addEventListener('change', onEdit);

    /** Chốt nội dung ô gõ nhanh thành một thẻ triệu chứng mới */
    function commitQuick(el, m) {
        const t = el.value.trim();
        el.value = '';
        if (!t) return;
        setSymParts(m, [...symParts(m), t]);
        const id = m.id;
        render();
        onChangeCb();
        list.querySelector(`.hx-step[data-id="${id}"] [data-k="quick"]`)?.focus();
    }

    // Enter ở ô gõ nhanh = thêm thẻ, không để form hiểu nhầm là nhảy ô kế
    list.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.target.dataset.k !== 'quick' || e.isComposing) return;
        e.preventDefault();
        e.stopPropagation();
        const m = stepOf(e.target);
        if (m) commitQuick(e.target, m);
    });

    /* Chạm một lựa chọn trong bảng đặc điểm của triệu chứng mới — không vẽ lại cả
       mốc, chỉ đổi đúng ô và câu mô tả, giữ nguyên chỗ đang cuộn. */
    list.addEventListener('click', (e) => {
        const opt = e.target.closest('[data-nopt]');
        if (!opt) return;
        const box = opt.closest('.hx-newrow'), stepEl = opt.closest('.hx-step');
        const m = steps[+stepEl.dataset.i];
        const r = symRows(m)[+box.dataset.j];
        if (!r) return;
        const k = opt.dataset.nopt;
        (r.v ||= {})[k] = r.v[k] === opt.dataset.v ? '' : opt.dataset.v;
        opt.closest('.sp-f').querySelectorAll('.sp-opt')
            .forEach(b => b.classList.toggle('is-on', b.dataset.v === r.v[k]));
        syncSymRows(m);
        box.classList.toggle('chua-khai', !Object.values(r.v).some(x => String(x || '').trim()));
        const line = box.querySelector('.hx-newline');
        const cau = moTaMoi(r);
        if (line) line.textContent = cau;
        else box.querySelector('.hx-newpanel')
            ?.insertAdjacentHTML('beforebegin', `<p class="hx-newline">${esc(cau)}</p>`);
        refreshPreview(stepEl, m);
        onChangeCb();
    });

    list.addEventListener('click', (e) => {
        if (e.target.closest('.hx-embed')) return;
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const stepEl = btn.closest('.hx-step');
        const i = +stepEl.dataset.i;
        if (btn.dataset.act === 'care-add') steps[i].care = emptyCare();
        else if (btn.dataset.act === 'care-del') delete steps[i].care;
        else if (btn.dataset.act === 'care-pick') {
            openListPicker({
                title: 'Chẩn đoán của tuyến trước', groups: BENH_NHOM, value: steps[i].care?.chanDoan || '',
                onPick: ([name]) => {
                    if (!name) return;
                    (steps[i].care ||= emptyCare()).chanDoan = name;
                    render();
                    onChangeCb();
                }
            });
            return;
        }
        else if (btn.dataset.act === 'phase') {
            if (steps[i].phase === btn.dataset.v) return;
            steps[i].phase = btn.dataset.v;
            const id = steps[i].id;
            render();
            onChangeCb();
            list.querySelector(`.hx-step[data-id="${id}"] .hx-n`)?.focus();
            return;
        }
        else if (btn.dataset.act === 'pin') steps.forEach((m, k) => { m.main = k === i; });
        else if (btn.dataset.act === 'del-step') steps.splice(i, 1);
        else if (btn.dataset.act === 'del-ref') {
            const [gone] = steps[i].refs.splice(+btn.closest('.hx-ref').dataset.k, 1);
            if (gone?.sym) (steps[i].skip ||= []).push(gone.sym);
        }
        else if (btn.dataset.act === 'add-ref') (steps[i].refs ||= []).push({ sym: '', st: 'tương tự', d: '' });
        else if (btn.dataset.act === 'open-new') {
            const key = `${steps[i].id}|${btn.dataset.j}`;
            openNew = openNew === key ? null : key;
            const r = symRows(steps[i])[+btn.dataset.j];
            if (r) r._sym = symOf(r)?.ten || '';
        }
        else if (btn.dataset.act === 'del-new') {
            const ps = symParts(steps[i]);
            ps.splice(+btn.dataset.j, 1);
            setSymParts(steps[i], ps);
        }
        else if (btn.dataset.act === 'pick-ref') {
            const k = +btn.closest('.hx-ref').dataset.k;
            openSymptomPicker({
                title: 'Triệu chứng đã có từ trước',
                initial: steps[i].refs[k]?.sym || '',
                onPick: (text, ten) => {
                    // Ô này chỉ cần tên triệu chứng; phần mô tả để ở ô "rõ là như thế nào"
                    steps[i].refs[k].sym = ten || text;
                    render();
                    onChangeCb();
                }
            });
            return;
        }
        else if (btn.dataset.act === 'pick-sym') {
            openSymptomPicker({
                title: 'Triệu chứng mới ở ' + stepLabel(steps[i]),
                onPick: (text, ten, extra) => {
                    setSymParts(steps[i], [...symParts(steps[i]), text, ...(extra?.extras || [])]);
                    addNegatives(extra?.negatives);
                    openNew = null;
                    render();
                    onChangeCb();
                }
            });
            return;
        }
        else if (btn.dataset.act === 'dmode') {
            steps[i].dm = !steps[i].dm;
            if (!steps[i].dm) { steps[i].d = ''; steps[i].dRaw = ''; }
        }
        else if (btn.dataset.act === 'carry') steps[i].skip = [];
        else return;
        render();
        onChangeCb();
        if (btn.dataset.act === 'add-ref') {
            list.querySelector(`.hx-step[data-i="${i}"] .hx-ref:last-of-type .hx-sym`)?.focus();
        }
    });

    $('hx-add')?.addEventListener('click', () => {
        // Mốc đầu tiên lấy luôn khoảng cách khởi phát -> nhập viện; các mốc sau tiến dần
        // về ngày nhập viện, đúng mạch kể bệnh từ xa tới gần.
        const truoc = steps.filter(m => m.phase === 'truoc');
        const last = truoc.at(-1);
        const onset = onsetHours();
        let n = '';
        if (!truoc.length && onset != null) n = String(Math.round(onset / 24));
        else if (last && parseFloat(last.n) > 1) n = String(parseFloat(last.n) - 1);
        steps.push({ id: 'm' + Date.now().toString(36), phase: 'truoc', n, u: last?.u || 'ngày', s: '', refs: [] });
        render();
        onChangeCb();
        list.querySelector('.hx-step:last-of-type .hx-n')?.focus();
    });
}
