import { showToast } from '../../core/utils.js';
import { getRecord, syncFromCloud, authReady, isSignedIn, saveRecord } from './record-store.js';
import { auth } from '../../core/firebase-init.js';
import { clsToHtml, clsToWordHtml, abnormalItems, refText, FLAG_MARK } from './cls-shared.js';
import { buildModel, VITAL_RANGE, toMarkdown, slugName, downloadMarkdown } from './benh-an-text.js';
import { toProse, downloadProse } from './benh-an-vanxuoi.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Bỏ dấu TỪNG KÝ TỰ nên chuỗi kết quả dài đúng bằng chuỗi gốc — nhờ vậy tìm
   "phoi" vẫn nhảy đúng vị trí chữ "phổi" trong văn bản gốc để tô vàng. */
const fold = (s) => [...String(s)].map(c => {
    const b = c.normalize('NFD')[0];   // NFD đẩy dấu ra sau, ký tự đầu chính là chữ gốc
    return b === 'đ' ? 'd' : b === 'Đ' ? 'D' : b;
}).join('').toLowerCase();

const recordId = new URL(location.href).searchParams.get('id');
const $ = (id) => document.getElementById(id);

/* Khai báo sớm: applyPrivate() chạy ngay lúc nạp có gọi clearSearch(), mà
   const/let không được hoisted như function -> để dưới là vỡ TDZ. */
const searchBar = $('search-bar'), searchInput = $('search-input'), searchCount = $('search-count');
let hits = [], hitIdx = -1;

/* Bệnh án chia 4 PHẦN theo trình tự làm bệnh án, mỗi phần một màu pastel (xem xem-benh-an.css).
   Mục không đánh số (Phẫu thuật, Theo dõi diễn tiến) thuộc phần của mục đứng trước nó. */
const ROMAN = { I: 1, V: 5, X: 10, L: 50 };
const romanToInt = (s) => [...s].reduce((n, c, i, a) => n + (ROMAN[c] < ROMAN[a[i + 1]] ? -ROMAN[c] : ROMAN[c]), 0);
const PARTS = [
    { upTo: 5, name: 'Hỏi bệnh', accent: 'pink', icon: 'fa-comments' },
    { upTo: 8, name: 'Khám & tóm tắt', accent: 'mint', icon: 'fa-stethoscope' },
    { upTo: 13, name: 'Chẩn đoán', accent: 'lavender', icon: 'fa-magnifying-glass' },
    { upTo: 99, name: 'Điều trị & theo dõi', accent: 'peach', icon: 'fa-syringe' }
];
const LOAI = { noi: 'Nội khoa', ngoai: 'Ngoại khoa', san: 'Sản khoa', nhi: 'Nhi khoa', cc: 'Cấp cứu' };

/** "V. LƯỢC QUA CÁC CƠ QUAN (khám ngày 26/8)" → { num:'V', n:5, name:'Lược qua các cơ quan', note:'(khám ngày 26/8)' }.
    Tên viết thường cho dễ đọc; bản in tự in hoa lại bằng CSS. */
function splitTitle(t) {
    const m = String(t).match(/^([IVXL]+)\.\s*(.+)$/);
    const rest = m ? m[2] : String(t);
    const i = rest.indexOf('(');
    const head = (i > 0 ? rest.slice(0, i) : rest).trim();
    return {
        num: m ? m[1] : '', n: m ? romanToInt(m[1]) : 0, key: head,
        name: head.charAt(0) + head.slice(1).toLowerCase(),
        note: i > 0 ? rest.slice(i).trim() : ''
    };
}

/* Nhãn thuộc diện che khi bật chế độ riêng tư */
const PRIVATE_KIND = (label) =>
    /SĐT|Điện thoại/i.test(label) ? 'phone'
        : /Họ và tên|Người liên hệ|Người khai|Người nuôi/i.test(label) ? 'name'
            : /Địa chỉ|Nơi ở/i.test(label) ? 'text' : '';

function maskBy(kind, text) {
    const s = String(text || '').trim();
    if (!s) return s;
    if (kind === 'phone') return s.slice(0, 3) + '•'.repeat(Math.max(3, s.length - 3));
    if (kind === 'name') {
        const w = s.split(/\s+/);
        return w.length < 2 ? w[0][0] + '•••' : w[0] + ' ' + w.slice(1).map(x => x[0].toUpperCase() + '.').join(' ');
    }
    return '••• (đã ẩn)';
}


/* ============================== RENDER MỤC ============================== */
function vitalsHtml(items, caption) {
    const chips = items.filter(([, v]) => String(v ?? '').trim()).map(([label, v, unit]) => {
        const range = VITAL_RANGE[label];
        const num = parseFloat(v);
        const warn = range && !isNaN(num) && (num < range[0] || num > range[1]);
        return `<span class="vital-chip${warn ? ' is-warn' : ''}">
            <span class="lbl">${esc(label)}</span>
            <b>${esc(v)}${unit ? ' ' + unit : ''}</b>
            ${warn ? '<i class="fas fa-triangle-exclamation" style="color:#e79a56;font-size:9px"></i>' : ''}
        </span>`;
    }).join('');
    if (!chips) return '';
    return (caption ? `<div class="xb-cap">${esc(caption)}</div>` : '')
        + `<div class="xb-vitals">${chips}</div>`;
}

/** Ảnh lâm sàng / ảnh hồ sơ — dùng lại class của phiếu CLS nên bấm vào cũng phóng to được */
function anhHtml(list, caption) {
    const imgs = (list || []).filter(im => im && im.url).map(im => `<figure class="cls-fig">
        <img class="cls-img" src="${esc(im.url)}" alt="${esc(im.caption || caption)}" loading="lazy">
        ${im.caption ? `<figcaption>${esc(im.caption)}</figcaption>` : ''}</figure>`).join('');
    if (!imgs) return '';
    return `<div class="xb-cap">${esc(caption)}</div><div class="cls-imgs">${imgs}</div>`;
}

/* ============================== ĐỊNH DẠNG CHỮ ==============================
   Chữ người dùng gõ (nhiều dòng) → HTML dễ đọc, KHÔNG đổi dữ liệu gốc:
   - dòng trống = sang đoạn mới (cách xa); xuống dòng thường = dòng mới cùng đoạn (cách gần)
   - dòng mở đầu bằng - * • + – ● ○ ▪ ➤ ✓ → gạch đầu dòng; 1. 2) a. b) i. → đánh số (giữ nguyên ký hiệu)
   - thụt đầu dòng (2 dấu cách / 1 tab) = cấp con; dòng thụt dưới một mục = viết tiếp mục đó
   - **chữ** = in đậm; "Nhãn ngắn:" ở đầu dòng được in đậm cho dễ dò */
const RE_UL = /^([-*•+–●○◦▪■➤➢✓✔])\s+(.*)$/;
/* Đánh số: 1. 2) ii. IV) a) — chữ cái + "." chỉ tính khi chữ sau viết hoa ("A. Chẩn đoán"),
   để tên vi khuẩn "S. pneumoniae", "E. coli", "H. pylori" đầu dòng không bị biến thành danh sách */
const RE_OL = /^((?:\d{1,2}|[ivxIVX]{2,4}|[a-zA-Z])\)|(?:\d{1,2}|[ivxIVX]{2,4})\.|[a-zA-Z]\.(?=\s+[\p{Lu}\d]))\s+(.*)$/u;

function inlineRt(s) {
    let x = esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    // "Mạch: 96 l/p" → nhãn in đậm. Chỉ nhận nhãn ngắn, không dấu câu / ngoặc, để câu văn thường không bị tô
    x = x.replace(/^([^:.,;!?()<>]{2,32}?):(?=\s|$)/, '<span class="rt-k">$1:</span>');
    return x;
}

function richText(raw, asBullets = false) {
    const lines = String(raw ?? '').replace(/\r/g, '').replace(/\t/g, '    ').split('\n');
    if (lines.length === 1 && !asBullets) {
        const m = lines[0].trim().match(RE_UL) || lines[0].trim().match(RE_OL);
        if (!m) return inlineRt(lines[0].trim());
    }
    // gap: vừa gặp dòng trống → khối kế tiếp (đoạn / danh sách) mang .rt-gap = cách XA;
    // khối nối liền không có dòng trống ở giữa thì chỉ cách GẦN như xuống dòng thường
    let out = '', para = [], paraGap = false, gap = false;
    const stack = [];                      // danh sách đang mở: { tag, ind }
    const gapCls = () => { const c = gap ? ' class="rt-gap"' : ''; gap = false; return c; };
    const flushPara = () => { if (para.length) out += `<p${paraGap ? ' class="rt-gap"' : ''}>${para.join('<br>')}</p>`; para = []; };
    const closeTo = (ind) => {             // đóng các danh sách thụt sâu hơn ind
        while (stack.length && stack[stack.length - 1].ind > ind) out += `</li></${stack.pop().tag}>`;
    };
    const closeAll = () => closeTo(-1);

    lines.forEach(line => {
        if (!line.trim()) { flushPara(); closeAll(); if (out) gap = true; return; }
        const ind = line.length - line.trimStart().length;
        let t = line.trim();
        if (asBullets && !RE_UL.test(t) && !RE_OL.test(t) && !ind) t = '- ' + t;
        const ul = t.match(RE_UL), ol = !ul && t.match(RE_OL);
        if (ul || ol) {
            flushPara();
            const tag = ul ? 'ul' : 'ol';
            closeTo(ind);
            // cùng cấp mà đổi kiểu (gạch ↔ số) → đóng danh sách cũ, mở danh sách mới
            if (stack.at(-1)?.ind === ind && stack.at(-1).tag !== tag) out += `</li></${stack.pop().tag}>`;
            if (stack.at(-1)?.ind === ind) {
                out += '</li>';                    // mục kế tiếp cùng danh sách
            } else {
                // danh sách mới (hoặc cấp con, nằm trong mục đang mở); chỉ danh sách ngoài cùng mới xét cách đoạn
                out += `<${tag}${stack.length ? '' : gapCls()}>`;
                stack.push({ tag, ind });
            }
            out += ol ? `<li><span class="rt-m">${esc(ol[1])}</span>${inlineRt(ol[2])}` : `<li>${inlineRt(ul[2])}`;
            return;
        }
        // Dòng thường thụt vào dưới một mục danh sách → viết tiếp trong mục đó
        if (stack.length && ind > 0 && ind >= stack.at(-1).ind) { out += '<br>' + inlineRt(t); return; }
        closeAll();
        if (!para.length) { paraGap = gap; gap = false; }
        para.push(inlineRt(t));
    });
    flushPara();
    closeAll();
    return out;
}

/* ============================== SỬA NHANH ==============================
   Ô nào sửa được ngay trong trang xem: [tên mục (không số, không "(khám ngày…)") → nhãn dòng → đường dẫn].
   Chỉ nhận khi chữ đang hiện ĐÚNG BẰNG giá trị ở đường dẫn đó → dòng máy ghép từ nhiều ô (Tuổi,
   Ngày giờ nhập viện, khối sản khoa…) tự bị loại, không thể ghi nhầm. Lưu bằng saveRecord nên
   trang Sửa (tao-benh-an) mở ra là thấy bản mới; ô tự ghép ở đó (bindAuto) không đè chữ người sửa. */
const EDIT_MAP = {
    'HÀNH CHÍNH': {
        'Họ và tên bệnh nhân': 'hanhChinh.hoTen', 'Giới tính': 'hanhChinh.gioiTinh', 'Dân tộc': 'hanhChinh.danToc',
        'Nghề nghiệp': 'hanhChinh.ngheNghiep', 'Địa chỉ': 'hanhChinh.diaChi',
        'Người liên hệ': 'hanhChinh.nguoiLienHe', 'SĐT liên hệ': 'hanhChinh.sdtLienHe'
    },
    'LÝ DO VÀO VIỆN': { '': 'lyDoVaoVien' },
    'BỆNH SỬ': { '': 'benhSu' },
    'TIỀN CĂN': {
        '1. Nội khoa': 'tienSu.noiKhoa', '2. Thuốc đang dùng tại nhà': 'tienSu.thuocDangDung',
        '3. Ngoại khoa': 'tienSu.ngoaiKhoa', '4. Sản phụ khoa': 'tienSu.sanPhuKhoa', '5. Dị ứng': 'tienSu.diUng',
        '6. Môi trường – phơi nhiễm': 'tienSu.moiTruong', '7. Thói quen': 'tienSu.thoiQuen', '8. Gia đình': 'tienSu.giaDinh'
    },
    'LƯỢC QUA CÁC CƠ QUAN': {
        'Tim mạch': 'luocQuaCoQuan.timMach', 'Hô hấp': 'luocQuaCoQuan.hoHap', 'Tiêu hóa': 'luocQuaCoQuan.tieuHoa',
        'Thần kinh': 'luocQuaCoQuan.thanKinh', 'Cơ xương khớp': 'luocQuaCoQuan.coXuongKhop', 'Thận – Tiết niệu': 'luocQuaCoQuan.thanNieu'
    },
    'KHÁM LÂM SÀNG': {
        'Xử trí ban đầu': 'capCuu.xuTriBanDau', '1. Tổng trạng': 'khamBenh.tongTrang', '2. Đầu – mặt – cổ': 'khamBenh.dauMatCo',
        '3. Ngực': 'khamBenh.nguc', '4. Tim': 'khamBenh.tim', '5. Phổi': 'khamBenh.phoi', '6. Bụng': 'khamBenh.bung',
        '7. Thần kinh – Cơ xương khớp': 'khamBenh.thanKinhCoXuongKhop'
    },
    'TÓM TẮT BỆNH ÁN': { '': 'tomTatBenhAn' },
    'ĐẶT VẤN ĐỀ': { '': 'datVanDe' },
    'CHẨN ĐOÁN': { 'Chẩn đoán sơ bộ': 'chanDoanSoBo', 'Chẩn đoán phân biệt': 'chanDoanPhanBiet' },
    'BIỆN LUẬN LÂM SÀNG': { '': 'bienLuanChanDoan' },
    // Không có bienLuanDeNghiCLS / bienLuanKetQuaCLS / duPhong: ô kiểu cũ, trang Sửa GỘP chúng vào
    // Biện luận / Tiên lượng mỗi lần mở (tao-benh-an.js ~dòng 376) → sửa ở đây sẽ bị gộp trùng.
    'ĐỀ NGHỊ CẬN LÂM SÀNG': { '': 'canLamSangDeNghi' },
    'KẾT QUẢ CẬN LÂM SÀNG': { '': 'ketQuaCanLamSang' },
    'PHẪU THUẬT': {
        'Phương pháp phẫu thuật': 'phauThuat.phuongPhap', 'Phương pháp vô cảm': 'phauThuat.voCam',
        'Dẫn lưu – vết mổ': 'phauThuat.danLuu', 'Chẩn đoán trước mổ': 'phauThuat.chanDoanTruocMo',
        'Chẩn đoán sau mổ': 'phauThuat.chanDoanSauMo', 'Tường trình phẫu thuật': 'phauThuat.tuongTrinh'
    },
    'CHẨN ĐOÁN XÁC ĐỊNH': { '': 'chanDoanXacDinh' },
    'ĐIỀU TRỊ': { '1. Điều trị đặc hiệu / nguyên tắc': 'huongDieuTri', '2. Điều trị triệu chứng & biến chứng': 'dieuTriCuThe' },
    'TIÊN LƯỢNG': { '': 'tienLuong' }
};
const getPath = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
function setPath(o, p, v) {
    const ks = p.split('.'), last = ks.pop();
    ks.reduce((x, k) => (x[k] && typeof x[k] === 'object' ? x[k] : (x[k] = {})), o)[last] = v;
}
function pathFor(key, label, value) {
    const c = EDIT_MAP[key]?.[label];
    if (!c || !record) return '';
    return [].concat(c).find(p => { const v = getPath(record, p); return v != null && String(v) === String(value); }) || '';
}

function fieldHtml(label, value, o = {}) {
    if (!String(value ?? '').trim()) return '';
    const kind = PRIVATE_KIND(label);
    // Số điện thoại: bấm là gọi được luôn trên điện thoại
    const tel = /SĐT|Điện thoại/i.test(label) && String(value).replace(/[^0-9+]/g, '');
    const inner = tel && tel.length >= 8
        ? `<a href="tel:${esc(tel)}">${esc(value)}</a>`
        : richText(value, o.bullet);
    // Dấu ":" sau nhãn chỉ in ra giấy (CSS ::after) — trên màn hình nhãn đã tách cột riêng.
    // is-long: ô Hành chính dài (địa chỉ…) chiếm cả hàng trên điện thoại
    const cls = ['xb-f', (String(value).length > 30 || /\n/.test(value)) && 'is-long', o.path && 'is-editable']
        .filter(Boolean).join(' ');
    const attrs = o.path ? ` data-path="${esc(o.path)}" data-label="${esc(label)}"${o.bullet ? ' data-bullet="1"' : ''}` : '';
    return `<div class="${cls}"${attrs}>`
        + (label ? `<span class="field-label">${esc(label)}</span> ` : '')
        + `<div class="field-value rt"${kind ? ` data-private="${kind}"` : ''}>${inner}</div>`
        + (o.path ? `<button type="button" class="xb-qe no-print" data-qe title="Sửa nhanh tại đây (bấm đúp vào chữ cũng được)" aria-label="Sửa nhanh ${esc(label || 'mục này')}"><i class="fas fa-pen"></i></button>` : '')
        + `</div>`;
}

function sectionHtml(title, icon, rows, index, accent) {
    const t = splitTitle(title);
    const body = rows.map(([label, value, extra]) =>
        label === '@vitals' ? vitalsHtml(value, extra)
            : label === '@cls' ? clsToHtml(value)
                : label === '@anh' ? anhHtml(value, extra)
                    : fieldHtml(label, value, { path: pathFor(t.key, label, value), bullet: extra === 'bullet' })).join('');
    if (!body) return '';
    // Hành chính toàn là dòng ngắn -> xếp ô 2 cột như thẻ căn cước
    const cls = index === 0 ? 'xb-sec-body sec-grid' : 'xb-sec-body';
    // Tem tròn: số La Mã; mục không đánh số thì dùng icon
    const stamp = t.num ? `<span class="xb-num">${t.num}</span>` : `<span class="xb-num is-icon"><i class="fas ${icon}"></i></span>`;
    return `<section id="sec-${index}" class="rec-section xb-sec" data-accent="${accent}">
        <button class="xb-sec-head" aria-expanded="true">
            ${stamp}
            <span class="xb-sec-t">${esc(t.name)}${t.note ? `<small>${esc(t.note)}</small>` : ''}</span>
            <i class="fas fa-chevron-down xb-chev"></i>
        </button>
        <div class="${cls}">${body}</div>
    </section>`;
}

/** Tấm bìa ngăn đầu mỗi phần: "Hỏi bệnh I–V" */
function partHtml(p, list) {
    const nums = list.map(s => s.st.num).filter(Boolean);
    const range = nums.length ? `<small>${nums[0]}${nums.length > 1 ? '–' + nums[nums.length - 1] : ''}</small>` : '';
    return `<div class="xb-part no-print" data-accent="${p.accent}"><span class="xb-part-no"><i class="fas ${p.icon}"></i>${p.name}${range}</span></div>`;
}

function emptyHtml(icon, title, text, btn) {
    return `<div class="xb-empty">
        <div class="xb-empty-ic"><i class="fas ${icon}"></i></div>
        <h2>${title}</h2><p>${text}</p>
        ${btn || ''}
    </div>`;
}


/* ============================== NẠP BỆNH ÁN ============================== */
let record = recordId ? getRecord(recordId) : null;
if (!record && recordId && await authReady()) {
    await syncFromCloud();
    record = getRecord(recordId);
}

const view = $('medical-record-view');
const actions = {};
let sections = [];

if (!record) {
    $('snapshot').innerHTML = '';
    view.innerHTML = emptyHtml('fa-file-circle-question', 'Không tìm thấy bệnh án',
        isSignedIn() ? 'Bệnh án này không có trong tài khoản của bạn.'
            : 'Bệnh án đang lưu trên máy đã tạo. Hãy đăng nhập để đồng bộ giữa các thiết bị.',
        `<a href="../study-room/waiting-room.html" class="xb-btn xb-primary" style="margin-top:16px"><i class="fas fa-arrow-left"></i>Về danh sách bệnh án</a>`);
    document.querySelector('aside.xb-toc').hidden = true;
    $('dock').hidden = true;
} else {
    const model = buildModel(record);
    let partIdx = 0;
    sections = model.map(([t, i, rows], idx) => {
        const st = splitTitle(t);
        if (st.n) partIdx = Math.max(partIdx, PARTS.findIndex(p => st.n <= p.upTo));
        return { title: t, st, icon: i, part: partIdx, html: sectionHtml(t, i, rows, idx, PARTS[partIdx].accent), idx };
    }).filter(s => s.html);

    // Chèn tấm bìa ngăn trước mục đầu tiên của mỗi phần
    const withParts = sections.map((s, k) => (k === 0 || sections[k - 1].part !== s.part
        ? partHtml(PARTS[s.part], sections.filter(x => x.part === s.part)) : '') + s.html);

    view.innerHTML = sections.length ? withParts.join('')
        : emptyHtml('fa-pen-to-square', 'Bệnh án này chưa có nội dung', 'Bấm Sửa để bắt đầu điền.',
            `<a href="tao-benh-an.html?id=${encodeURIComponent(record.id)}" class="xb-btn xb-primary" style="margin-top:16px"><i class="fas fa-pen"></i>Sửa bệnh án</a>`);

    const h = record.hanhChinh || {};
    const name = h.hoTen || 'Chưa đặt tên';

    /* ---------- 1. THẺ TỔNG QUAN + BẢNG CHỈ SỐ BẤT THƯỜNG ---------- */
    const daysFrom = (ymd) => {
        const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return 0;
        const t = new Date(); t.setHours(0, 0, 0, 0);
        return Math.floor((t - new Date(+m[1], +m[2] - 1, +m[3])) / 864e5) + 1;
    };

    /** Gom mọi con số nằm ngoài khoảng tham chiếu: sinh hiệu + toàn bộ phiếu CLS */
    function abnormalRows() {
        const out = [];
        const s = record.khamBenh?.sinhTon || {};
        [['Mạch', s.mach, 'lần/phút'], ['Nhiệt độ', s.nhietDo, '°C'],
        ['Nhịp thở', s.nhipTho, 'lần/phút'], ['SpO2', s.spo2, '%']].forEach(([n, v, u]) => {
            const r = VITAL_RANGE[n], x = parseFloat(v);
            if (!r || isNaN(x) || (x >= r[0] && x <= r[1])) return;
            out.push({ n, v, u, flag: x < r[0] ? 'low' : 'high', from: 'Sinh hiệu', ref: `${r[0]} – ${r[1]}` });
        });
        abnormalItems(record.canLamSang).forEach(i =>
            out.push({ n: i.n, v: i.v, u: i.u, flag: i.flag, from: i.from, ref: refText(i.lo, i.hi) }));
        return out;
    }
    const abn = abnormalRows();
    // Mục cận lâm sàng để bấm vào dòng bất thường là nhảy tới
    const clsSec = sections.find(s => /CẬN LÂM SÀNG/.test(s.title) && /XII/.test(s.title)) || sections[0];

    const vit = record.khamBenh?.sinhTon || {};
    const adm = record.benhSuChiTiet?.sinhHieuNhapVien || {};
    const pick = (a, b) => String(a ?? '').trim() || String(b ?? '').trim();
    const snapVitals = [
        ['Mạch', pick(vit.mach, adm.mach), 'l/p'], ['HA', pick(vit.huyetAp, adm.huyetAp), 'mmHg'],
        ['Nhiệt độ', pick(vit.nhietDo, adm.nhietDo), '°C'], ['SpO2', pick(vit.spo2, adm.spo2), '%'],
        ['BMI', vit.bmi, '']
    ].filter(([, v]) => v);

    const dx = String(record.chanDoanXacDinh || '').trim()
        || String(record.chanDoanSoBo || '').trim() || String(record.lyDoVaoVien || '').trim();
    const dxLabel = record.chanDoanXacDinh ? 'Chẩn đoán xác định'
        : record.chanDoanSoBo ? 'Chẩn đoán sơ bộ' : 'Lý do vào viện';

    const done = sections.length, total = model.length;
    const pct = total ? Math.round(done / total * 100) : 0;
    const C = 2 * Math.PI * 22;

    const dayN = daysFrom(h.ngayVaoVien);
    const initials = name.trim().split(/\s+/).slice(-2).map(x => x[0]).join('').toUpperCase() || '?';

    const isDoneRec = (record.status || 'Hoàn thành') === 'Hoàn thành';
    $('snapshot').innerHTML = `<div class="xb-snap" data-accent="pink">
        <i class="fas fa-paperclip xb-clip" aria-hidden="true"></i>
        <div class="xb-snap-top">
            <div class="xb-ava" aria-hidden="true"><span>${esc(initials)}</span></div>
            <div class="xb-snap-id">
                <p class="xb-kicker">
                    <span class="xb-tag">${esc(LOAI[record.loaiBenhAn] || 'Bệnh án')}</span>
                    <span class="xb-tag ${isDoneRec ? 'is-done' : 'is-draft'}">${isDoneRec ? 'Hoàn thành' : 'Đang viết'}</span>
                </p>
                <h2 class="xb-snap-name"><span data-private="name">${esc(name)}</span></h2>
                <p class="xb-snap-sub">${esc([h.tuoi && h.tuoi + ' tuổi', h.gioiTinh, h.khoa, h.benhVien,
        h.soPhong && 'P.' + h.soPhong, (h.soGiuong || h.bedNumber) && 'G.' + (h.soGiuong || h.bedNumber)]
        .filter(Boolean).join(' · ') || 'Chưa có phần hành chính')}</p>
            </div>
            <div class="xb-ring" title="${done}/${total} mục đã có nội dung">
                <svg width="56" height="56" viewBox="0 0 52 52" aria-hidden="true">
                    <circle cx="26" cy="26" r="22" fill="none" stroke="#ffe0ee" stroke-width="5"></circle>
                    <circle cx="26" cy="26" r="22" fill="none" stroke="#fb92c1" stroke-width="5" stroke-linecap="round"
                        stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct / 100)).toFixed(1)}"></circle>
                </svg><b>${pct}%</b>
            </div>
        </div>

        ${dx ? `<div class="xb-dx"><b>${dxLabel}</b>${esc(dx.split('\n')[0])}</div>` : ''}

        <div class="xb-pills">
            ${dayN > 0 ? `<span class="xb-stamp">Nằm viện<b>ngày ${dayN}</b></span>` : ''}
            ${snapVitals.map(([l, v, u]) => {
            const r = VITAL_RANGE[l === 'HA' ? 'Huyết áp' : l], x = parseFloat(v);
            const warn = r && !isNaN(x) && (x < r[0] || x > r[1]);
            return `<span class="xb-pill${warn ? ' is-warn' : ''}">${esc(l)} <b>${esc(v)}${u ? ' ' + u : ''}</b></span>`;
        }).join('')}
            ${abn.length ? `<button class="xb-pill is-warn" id="abn-toggle" aria-expanded="false">
                <i class="fas fa-triangle-exclamation" style="font-size:10px"></i> <b>${abn.length}</b> chỉ số bất thường</button>` : ''}
            <span class="xb-pill is-info">${done}/${total} mục</span>
        </div>

        ${abn.length ? `<div class="xb-abn" id="abn-panel" hidden>
            <div class="xb-abn-h">Chỉ số ngoài khoảng tham chiếu</div>
            ${abn.map(a => `<div class="xb-abn-row is-${a.flag}">
                <span class="n">${esc(a.n)}<small>${esc(a.from || '')}</small></span>
                <span class="v">${esc(a.v)}${a.u ? ' ' + esc(a.u) : ''} ${FLAG_MARK[a.flag]}</span>
                ${a.ref ? `<span class="r">${esc(a.ref)}</span>` : ''}
            </div>`).join('')}
        </div>` : ''}
    </div>`;

    // Mở / đóng bảng bất thường; bấm một dòng thì nhảy tới mục cận lâm sàng
    $('abn-toggle')?.addEventListener('click', () => {
        const p = $('abn-panel');
        p.hidden = !p.hidden;
        $('abn-toggle').setAttribute('aria-expanded', String(!p.hidden));
    });
    $('abn-panel')?.addEventListener('click', (e) => {
        if (e.target.closest('.xb-abn-row')) jumpTo('sec-' + clsSec.idx);
    });

    /* ---------- Mục lục ---------- */
    const tocHtml = sections.map((s, k) => {
        const p = PARTS[s.part];
        const cap = k === 0 || sections[k - 1].part !== s.part
            ? `<p class="toc-part" data-accent="${p.accent}"><i class="fas ${p.icon}"></i>${p.name}</p>` : '';
        return cap + `<a href="#sec-${s.idx}" class="toc-link" data-accent="${p.accent}" data-target="sec-${s.idx}">`
            + `<span class="toc-num">${s.st.num || `<i class="fas ${s.icon}"></i>`}</span>${esc(s.st.name)}</a>`;
    }).join('');
    $('toc-nav').innerHTML = tocHtml;
    $('toc-nav-mobile').innerHTML = tocHtml;

    /* ---------- Đầu trang + khối ký tên ---------- */
    document.title = 'Bệnh án - ' + name;
    $('head-name').innerHTML = `<span data-private="name">${esc(name)}</span>`;
    const meta = [h.tuoi && h.tuoi + ' tuổi', h.gioiTinh, h.benhVien,
    (h.soPhong || h.roomNumber) && 'P.' + (h.soPhong || h.roomNumber)].filter(Boolean).join(' · ');
    $('head-meta').textContent = meta;
    $('print-sub').innerHTML = `<span data-private="name">${esc(name)}</span>${meta ? ' — ' + esc(meta) : ''}`;

    const editBtn = $('edit-record-btn');
    editBtn.href = 'tao-benh-an.html?id=' + encodeURIComponent(record.id);
    editBtn.hidden = false;
    [$('edit-link-mobile'), $('edit-top-mobile')].forEach(a => { a.href = editBtn.href; a.hidden = false; });

    const dm = String(h.ngayLamBenhAn || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    $('sign-date').textContent = dm
        ? `Ngày ${dm[3]} tháng ${dm[2]} năm ${dm[1]}`
        : 'Ngày ......  tháng ......  năm ..........';
    authReady().then(() => {
        const u = auth.currentUser;
        $('sign-name').textContent = u ? (u.displayName || (u.email || '').split('@')[0] || '') : '';
    });

    /* ---------- Đánh dấu mục đang xem trong mục lục ---------- */
    const links = [...document.querySelectorAll('.toc-link')];
    const observer = new IntersectionObserver(entries => {
        entries.forEach(en => {
            if (!en.isIntersecting) return;
            links.forEach(l => l.classList.toggle('active', l.dataset.target === en.target.id));
        });
    }, { rootMargin: '-90px 0px -68% 0px' });
    document.querySelectorAll('.rec-section').forEach(s => observer.observe(s));


    /* ============================== XUẤT / CHIA SẺ ============================== */
    const plain = () => toMarkdown(record, model);

    /* Bản HTML của bệnh án: vừa là ruột của file .doc tải về, vừa là mặt hàng
       'text/html' đặt lên clipboard — dán thẳng vào Google Docs / Word là ra đúng
       heading, in đậm, gạch đầu dòng, khỏi phải tải file rồi mở lại. */
    /* Ô nhiều dòng (tóm tắt, đặt vấn đề, biện luận): dòng bắt đầu bằng "- " gom
       thành <ul> thật. Nối bằng <br> như trước thì dán sang Google Docs / Word ra
       một khối chữ còn nguyên dấu gạch và khoảng trắng thụt lề. */
    const khoiHtml = (label, value) => {
        const rows = String(value).split('\n').map(x => x.trim()).filter(Boolean);
        let out = '', ul = [];
        const xaUl = () => {
            if (!ul.length) return;
            out += `<ul>${ul.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
            ul = [];
        };
        rows.forEach((x, i) => {
            if (/^[-*•]\s+/.test(x)) return void ul.push(x.replace(/^[-*•]\s+/, ''));
            xaUl();
            out += `<p>${label && i === 0 ? '<b>' + esc(label) + ':</b> ' : ''}${esc(x)}</p>`;
        });
        xaUl();
        return out;
    };

    const docHtml = () => {
        const html = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">
            <style>body{font-family:'Times New Roman',serif;font-size:13pt;line-height:1.5}
            h2{text-align:center;font-size:14pt;text-transform:uppercase}
            h3{font-size:13pt;border-bottom:1px solid #000;margin:14pt 0 6pt}
            p{margin:0 0 4pt}</style></head><body>
            ${[record.sinhVien?.hoTen, record.sinhVien?.mssv, record.sinhVien?.lop, record.sinhVien?.stt]
                .filter(Boolean).length ? `<p>${esc([record.sinhVien?.hoTen, record.sinhVien?.mssv, record.sinhVien?.lop, record.sinhVien?.stt].filter(Boolean).join(' - '))}</p>` : ''}
            <h2>Bệnh án</h2>` +
            model.map(([title, , rows]) => {
                const body = rows.map(([label, value]) => {
                    if (label === '@vitals') {
                        const v = value.filter(([, x]) => String(x ?? '').trim())
                            .map(([l, x, u]) => `${l}: ${x}${u ? ' ' + u : ''}`).join(' · ');
                        return v ? `<p>${esc(v)}</p>` : '';
                    }
                    if (label === '@cls') return clsToWordHtml(value);
                    if (label === '@anh') {
                        const co = (value || []).filter(im => im && im.url);
                        return co.length ? co.map(im => `<p><img src="${esc(im.url)}" width="420">`
                            + (im.caption ? `<br><i>${esc(im.caption)}</i>` : '') + '</p>').join('') : '';
                    }
                    if (!String(value ?? '').trim()) return '';
                    return khoiHtml(label, value);
                }).join('');
                return body ? `<h3>${esc(title)}</h3>${body}` : '';
            }).join('') + '<\/body><\/html>';
        return html;
    };

    Object.assign(actions, {
        print: () => window.print(),
        edit: () => { location.href = editBtn.href; },
        copy: async () => {
            /* Dán vào Google Docs mà chỉ có chữ trơn thì heading, in đậm, gạch đầu
               dòng rơi hết — phải đặt LÊN CLIPBOARD CẢ HAI mặt hàng: 'text/html' cho
               Docs / Word ăn định dạng, 'text/plain' là bản Markdown cho ô chat, ghi
               chú, hay trình soạn thảo chữ trơn. */
            try {
                const md = plain();
                if (window.ClipboardItem && navigator.clipboard?.write) {
                    await navigator.clipboard.write([new ClipboardItem({
                        'text/html': new Blob([docHtml()], { type: 'text/html' }),
                        'text/plain': new Blob([md], { type: 'text/plain' })
                    })]);
                    showToast('Đã sao chép — dán thẳng vào Google Docs / Word là giữ nguyên định dạng.', 'success', 5000);
                    return;
                }
                await navigator.clipboard.writeText(md);
                showToast('Đã sao chép bản Markdown.', 'success');
            } catch {
                showToast('Trình duyệt chặn sao chép. Hãy chọn và copy thủ công.', 'error');
            }
        },
        /* Bản văn xuôi học thuật — cùng dữ liệu, nhưng là đoạn văn liền mạch và
           tuyệt đối không có dấu chấm phẩy hay dấu hai chấm. Xem benh-an-vanxuoi.js */
        vanxuoi: async () => {
            try {
                await navigator.clipboard.writeText(toProse(record, 'day-du'));
                showToast('Đã chép bản văn xuôi — dán thẳng vào Word hay Google Docs.', 'success', 4000);
            } catch {
                downloadProse(record, 'day-du');
                showToast('Trình duyệt chặn sao chép nên đã tải về file .txt.', 'info', 4000);
            }
        },
        vanxuoitrinh: () => {
            downloadProse(record, 'trinh');
            showToast('Đã tải bản trình bệnh — bản rút gọn, các cơ quan bình thường gộp thành một câu.', 'success', 4500);
        },
        txt: () => {
            downloadMarkdown(record, model);
            showToast('Đã tải file .md — kéo thẳng vào Google Drive rồi mở bằng Google Docs, heading tự lên sẵn.', 'success');
        },
        word: () => {
            const html = docHtml();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob(['﻿' + html], { type: 'application/msword' }));
            a.download = `benh-an-${slugName(h.hoTen)}.doc`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            showToast('Đã tải file Word.', 'success');
        },
        share: async () => {
            try { await navigator.share({ title: 'Bệnh án - ' + name, text: plain() }); }
            catch { /* người dùng hủy */ }
        },
        search: () => openSearch(),
        present: () => openPresent(0)
    });

    if (navigator.share) $('share-btn').hidden = false;
    $('pr-who').textContent = name;
}


/* ============================== 2. THU GỌN MỤC + CỠ CHỮ ============================== */
const KEY_FOLD = 'xbFold_' + (recordId || 'x');
const foldState = new Set(JSON.parse(localStorage.getItem(KEY_FOLD) || '[]'));
const saveFold = () => localStorage.setItem(KEY_FOLD, JSON.stringify([...foldState]));

foldState.forEach(id => {
    const s = document.getElementById(id);
    if (s) { s.classList.add('is-closed'); s.querySelector('.xb-sec-head')?.setAttribute('aria-expanded', 'false'); }
});

function toggleSec(sec, force) {
    const closed = force !== undefined ? force : !sec.classList.contains('is-closed');
    sec.classList.toggle('is-closed', closed);
    sec.querySelector('.xb-sec-head')?.setAttribute('aria-expanded', String(!closed));
    closed ? foldState.add(sec.id) : foldState.delete(sec.id);
    saveFold();
}

function jumpTo(id) {
    const sec = document.getElementById(id);
    if (!sec) return;
    if (sec.classList.contains('is-closed')) toggleSec(sec, false);
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    sec.classList.remove('is-flash');
    void sec.offsetWidth;
    sec.classList.add('is-flash');
}

const FS = [0.88, 1, 1.14, 1.3];
let fsIdx = +(localStorage.getItem('xbFs') ?? 1);
function applyFs() {
    fsIdx = Math.max(0, Math.min(FS.length - 1, fsIdx));
    document.documentElement.style.setProperty('--fs', (15.5 * FS[fsIdx]).toFixed(1) + 'px');
    $('fs-val').textContent = Math.round(FS[fsIdx] * 100) + '%';
    localStorage.setItem('xbFs', fsIdx);
}
applyFs();
$('fs-up').addEventListener('click', () => { fsIdx++; applyFs(); });
$('fs-down').addEventListener('click', () => { fsIdx--; applyFs(); });

const foldSwitch = $('fold-switch');
foldSwitch.addEventListener('click', () => {
    const on = !foldSwitch.classList.contains('is-on');
    foldSwitch.classList.toggle('is-on', on);
    foldSwitch.setAttribute('aria-checked', String(on));
    document.querySelectorAll('.xb-sec').forEach(s => toggleSec(s, on));
});


/* ============================== 3. CHẾ ĐỘ RIÊNG TƯ ============================== */
const privSwitch = $('private-switch');
let priv = localStorage.getItem('xbPrivate') === '1';

function applyPrivate(on) {
    clearSearch();
    document.querySelectorAll('[data-private]').forEach(el => {
        if (el.dataset.real === undefined) el.dataset.real = el.innerHTML;
        if (on) el.textContent = maskBy(el.dataset.private, el.dataset.real.replace(/<[^>]+>/g, ''));
        else el.innerHTML = el.dataset.real;
        el.classList.toggle('xb-masked', on);
    });
    privSwitch.classList.toggle('is-on', on);
    privSwitch.setAttribute('aria-checked', String(on));
    localStorage.setItem('xbPrivate', on ? '1' : '0');
}
if (priv) applyPrivate(true);
privSwitch.addEventListener('click', () => {
    priv = !priv;
    applyPrivate(priv);
    showToast(priv ? 'Đã che tên, địa chỉ, số điện thoại — in ra cũng che.' : 'Đã hiện lại thông tin bệnh nhân.', 'info');
});


/* ============================== 4. TÌM TRONG BỆNH ÁN ============================== */
function clearSearch() {
    view.querySelectorAll('mark.xb-hit').forEach(m => m.replaceWith(document.createTextNode(m.textContent)));
    view.normalize();
    hits = []; hitIdx = -1;
    searchCount.textContent = '';
}

function runSearch(q) {
    clearSearch();
    const needle = fold(q.trim());
    if (needle.length < 2) return;

    const walker = document.createTreeWalker(view, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => n.nodeValue.trim() && n.parentNode.nodeName !== 'MARK'
            ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach(n => {
        const raw = n.nodeValue, hay = fold(raw);   // fold giữ nguyên độ dài -> chỉ số khớp 1:1
        let from = 0, at = hay.indexOf(needle), last = 0;
        if (at < 0) return;
        const frag = document.createDocumentFragment();
        while (at >= 0) {
            if (at > last) frag.append(raw.slice(last, at));
            const mk = document.createElement('mark');
            mk.className = 'xb-hit';
            mk.textContent = raw.slice(at, at + needle.length);
            frag.append(mk);
            last = at + needle.length;
            from = last;
            at = hay.indexOf(needle, from);
        }
        frag.append(raw.slice(last));
        n.replaceWith(frag);
    });

    hits = [...view.querySelectorAll('mark.xb-hit')];
    if (hits.length) gotoHit(0); else searchCount.textContent = '0';
}

function gotoHit(i) {
    if (!hits.length) return;
    hitIdx = (i + hits.length) % hits.length;
    hits.forEach(m => m.classList.remove('is-cur'));
    const m = hits[hitIdx];
    m.classList.add('is-cur');
    const sec = m.closest('.xb-sec');
    if (sec?.classList.contains('is-closed')) toggleSec(sec, false);   // mục đang gấp thì mở ra
    m.scrollIntoView({ behavior: 'smooth', block: 'center' });
    searchCount.textContent = `${hitIdx + 1}/${hits.length}`;
}

function openSearch() {
    searchBar.classList.add('is-open');
    searchInput.focus();
    searchInput.select();
}
function closeSearch() {
    searchBar.classList.remove('is-open');
    clearSearch();
}

let tid;
searchInput.addEventListener('input', () => {
    clearTimeout(tid);
    tid = setTimeout(() => runSearch(searchInput.value), 180);
});
searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); gotoHit(hitIdx + (e.shiftKey ? -1 : 1)); }
    if (e.key === 'Escape') closeSearch();
});
$('search-next').addEventListener('click', () => gotoHit(hitIdx + 1));
$('search-prev').addEventListener('click', () => gotoHit(hitIdx - 1));
$('search-close').addEventListener('click', closeSearch);
$('search-btn').addEventListener('click', () => searchBar.classList.contains('is-open') ? closeSearch() : openSearch());


/* ============================== 4b. SỬA NHANH TẠI CHỖ ==============================
   Nút ✎ (hoặc bấm đúp vào chữ) trên dòng có data-path → ô soạn ngay tại chỗ. Lưu = ghi
   vào record + saveRecord (máy + đám mây) → trang Sửa mở ra là thấy bản mới. */
const RELOAD_PATHS = new Set(['hanhChinh.hoTen', 'chanDoanXacDinh', 'chanDoanSoBo', 'lyDoVaoVien']);  // bìa hồ sơ / đầu trang dùng
let qe = null;   // { f: dòng đang sửa, ta: textarea, raw: chữ gốc }

const grow = (ta) => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 3 + 'px'; };

/** Áp fn(dòng[]) lên các dòng đang chọn (hoặc dòng có con trỏ), giữ vùng chọn */
function qeLines(ta, fn) {
    const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    const a = v.lastIndexOf('\n', s - 1) + 1;
    let b = v.indexOf('\n', e > s && v[e - 1] === '\n' ? e - 1 : e);
    if (b < 0) b = v.length;
    const next = fn(v.slice(a, b).split('\n')).join('\n');
    ta.value = v.slice(0, a) + next + v.slice(b);
    ta.setSelectionRange(a, a + next.length);
    grow(ta);
}
const splitMark = (l) => {
    const ind = l.match(/^\s*/)[0], t = l.trim();
    const m = t.match(RE_UL) || t.match(RE_OL);
    return [ind, m ? m[2] : t];
};
const allMarked = (ls, re) => ls.filter(l => l.trim()).every(l => re.test(l.trim()));
const FMT = {
    // bấm lần nữa trên các dòng đã có ký hiệu = bỏ ký hiệu
    ul: (ls) => { const off = allMarked(ls, RE_UL); return ls.map(l => { if (!l.trim()) return l; const [i, t] = splitMark(l); return off ? i + t : i + '- ' + t; }); },
    ol: (ls) => { const off = allMarked(ls, RE_OL); let n = 0; return ls.map(l => { if (!l.trim()) return l; const [i, t] = splitMark(l); return off ? i + t : i + (++n) + '. ' + t; }); },
    in: (ls) => ls.map(l => (l.trim() ? '  ' + l : l)),
    out: (ls) => ls.map(l => l.replace(/^ {1,2}/, ''))
};
function qeBold(ta) {
    const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
    const sel = v.slice(s, e) || 'chữ đậm';
    ta.value = v.slice(0, s) + '**' + sel + '**' + v.slice(e);
    ta.setSelectionRange(s + 2, s + 2 + sel.length);
}
/** Enter trong một mục danh sách → mục mới cùng ký hiệu (số tự tăng); mục rỗng + Enter → thoát danh sách */
function qeEnter(ta, e) {
    const v = ta.value, s = ta.selectionStart;
    if (s !== ta.selectionEnd) return;
    const a = v.lastIndexOf('\n', s - 1) + 1;
    const line = v.slice(a, s), ind = line.match(/^\s*/)[0], t = line.slice(ind.length);
    const ul = t.match(/^([-*•+–●○◦▪■➤➢✓✔])\s+(.*)$|^([-*•+–●○◦▪■➤➢✓✔])\s*$/);
    const ol = !ul && t.match(/^(\d{1,2}|[a-zA-Z])([.)])(?:\s+(.*))?$/);
    if (!ul && !ol) return;
    e.preventDefault();
    const body = ul ? (ul[2] ?? '') : (ol[3] ?? '');
    if (!body.trim()) {
        ta.value = v.slice(0, a) + v.slice(s);
        ta.setSelectionRange(a, a);
    } else {
        const mk = ul ? (ul[1] || ul[3]) + ' '
            : (/\d/.test(ol[1]) ? +ol[1] + 1 : String.fromCharCode(ol[1].charCodeAt(0) + 1)) + ol[2] + ' ';
        const ins = '\n' + ind + mk;
        ta.value = v.slice(0, s) + ins + v.slice(s);
        ta.setSelectionRange(s + ins.length, s + ins.length);
    }
    grow(ta);
}

function openQe(f) {
    if (!f || !record) return;
    if (qe) closeQe();
    const raw = String(getPath(record, f.dataset.path) ?? '');
    const box = document.createElement('div');
    box.className = 'qe-box no-print';
    box.innerHTML = `<div class="qe-tools">
            <button type="button" data-qe-fmt="ul" title="Gạch đầu dòng (bấm lại để bỏ)"><i class="fas fa-list-ul"></i></button>
            <button type="button" data-qe-fmt="ol" title="Đánh số 1. 2. 3. (bấm lại để bỏ)"><i class="fas fa-list-ol"></i></button>
            <button type="button" data-qe-fmt="in" title="Thụt vào — thành mục con (Tab)"><i class="fas fa-indent"></i></button>
            <button type="button" data-qe-fmt="out" title="Lùi ra (Shift+Tab)"><i class="fas fa-outdent"></i></button>
            <button type="button" data-qe-fmt="b" title="In đậm (Ctrl+B)"><i class="fas fa-bold"></i></button>
            <span class="qe-hint">Dòng trống = sang đoạn mới · Ctrl+Enter lưu · Esc hủy</span>
        </div>
        <textarea class="qe-ta" spellcheck="false" aria-label="Sửa ${esc(f.dataset.label || 'nội dung')}"></textarea>
        <div class="qe-foot">
            <span class="qe-note"><i class="fas fa-rotate"></i> Lưu xong trang Sửa cũng có bản mới</span>
            <button type="button" data-qe-cancel>Hủy</button>
            <button type="button" data-qe-save class="qe-save"><i class="fas fa-check"></i> Lưu</button>
        </div>`;
    f.classList.add('is-editing');
    f.appendChild(box);
    const ta = box.querySelector('textarea');
    ta.value = raw;
    qe = { f, ta, raw };
    grow(ta);
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(raw.length, raw.length);
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function closeQe() {
    if (!qe) return;
    qe.f.classList.remove('is-editing');
    qe.f.querySelector('.qe-box')?.remove();
    qe = null;
}
async function saveQe() {
    if (!qe) return;
    const { f, ta, raw } = qe;
    const path = f.dataset.path;
    const val = ta.value.replace(/\s+$/, '');
    if (val === raw) return closeQe();
    setPath(record, path, val);
    const res = await saveRecord(record);
    if (res?.mau) {
        setPath(record, path, raw);
        showToast('Đây là bệnh án mẫu nên không lưu thay đổi.', 'warning');
        return closeQe();
    }
    if (RELOAD_PATHS.has(path)) return location.reload();   // bìa hồ sơ + đầu trang cũng phải đổi theo
    qe = null;
    const html = fieldHtml(f.dataset.label, val, { path, bullet: f.dataset.bullet === '1' });
    if (html) f.outerHTML = html; else f.remove();
    if (priv) applyPrivate(true);
    showToast(res?.cloud ? 'Đã lưu và đồng bộ — trang Sửa đã có bản mới.' : 'Đã lưu trên máy — trang Sửa đã có bản mới.', 'success');
}

view.addEventListener('click', (e) => {
    const pen = e.target.closest('[data-qe]');
    if (pen) return openQe(pen.closest('.xb-f'));
    if (!qe) return;
    const fmt = e.target.closest('[data-qe-fmt]');
    if (fmt) {
        const k = fmt.dataset.qeFmt;
        if (k === 'b') qeBold(qe.ta); else qeLines(qe.ta, FMT[k]);
        return qe.ta.focus();
    }
    if (e.target.closest('[data-qe-save]')) return saveQe();
    if (e.target.closest('[data-qe-cancel]')) return closeQe();
});
view.addEventListener('dblclick', (e) => {
    const f = e.target.closest('.xb-f.is-editable');
    if (f && !f.classList.contains('is-editing') && !e.target.closest('a, .qe-box')) openQe(f);
});
view.addEventListener('keydown', (e) => {
    if (!qe || e.target !== qe.ta) return;
    e.stopPropagation();                      // Esc / Ctrl+F của trang không được chạy khi đang gõ
    const ta = qe.ta;
    if (e.key === 'Escape') { e.preventDefault(); return closeQe(); }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); return saveQe(); }
    if (e.key === 'Enter' && !e.shiftKey) return qeEnter(ta, e);
    if (e.key === 'Tab') { e.preventDefault(); return qeLines(ta, FMT[e.shiftKey ? 'out' : 'in']); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); qeBold(ta); }
});
view.addEventListener('input', (e) => { if (qe && e.target === qe.ta) grow(qe.ta); });
// Đang sửa dở mà rời trang → hỏi lại cho khỏi mất chữ
addEventListener('beforeunload', (e) => { if (qe && qe.ta.value !== qe.raw) e.preventDefault(); });


/* ============================== 5. CHẾ ĐỘ TRÌNH BỆNH ============================== */
const present = $('present'), prBody = $('pr-body');
let prIdx = 0;

function renderPresent() {
    const s = sections[prIdx];
    // Lấy bản ĐANG HIỆN trên trang (đã sửa nhanh thì thấy chữ mới), đổi id để không đụng
    // với id của mục ngoài trang (mục lục, IntersectionObserver)
    const live = document.getElementById('sec-' + s.idx);
    prBody.innerHTML = (live ? live.outerHTML : s.html).replace('id="sec-', 'id="psec-');
    prBody.scrollTop = 0;
    $('pr-count').textContent = `${prIdx + 1} / ${sections.length}`;
    $('pr-dots').innerHTML = sections.map((_, i) => `<i class="${i === prIdx ? 'on' : ''}"></i>`).join('');
    $('pr-prev').disabled = prIdx === 0;
    $('pr-next').disabled = prIdx === sections.length - 1;
}
function openPresent(i) {
    if (!sections.length) return;
    prIdx = i;
    present.hidden = false;
    renderPresent();
}
const closePresent = () => { present.hidden = true; };
const stepPresent = (d) => {
    const n = prIdx + d;
    if (n < 0 || n >= sections.length) return;
    prIdx = n;
    renderPresent();
};

$('pr-exit').addEventListener('click', closePresent);
$('pr-prev').addEventListener('click', () => stepPresent(-1));
$('pr-next').addEventListener('click', () => stepPresent(1));
$('present-btn').addEventListener('click', () => openPresent(0));
$('print-btn').addEventListener('click', () => window.print());
$('pr-dots').addEventListener('click', (e) => {
    const dots = [...$('pr-dots').children];
    const i = dots.indexOf(e.target);
    if (i >= 0) { prIdx = i; renderPresent(); }
});

// Vuốt trái / phải để lật mục trên điện thoại
let tx = 0, ty = 0;
prBody.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
prBody.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) stepPresent(dx < 0 ? 1 : -1);
}, { passive: true });


/* ============================== THẺ TRƯỢT + DOCK ============================== */
function openSheet(id) {
    const s = $('sheet-' + id);
    if (!s) return;
    s.hidden = false;
    requestAnimationFrame(() => s.classList.add('is-open'));
}
function closeSheets() {
    document.querySelectorAll('.xb-sheet.is-open').forEach(s => {
        s.classList.remove('is-open');
        // Bấm lại đúng thẻ vừa đóng thì nó mở lại ngay -> hẹn giờ cũ không được giấu nhầm
        setTimeout(() => { if (!s.classList.contains('is-open')) s.hidden = true; }, 240);
    });
}

document.addEventListener('click', (e) => {
    const sh = e.target.closest('[data-sheet]');
    if (sh) { closeSheets(); return openSheet(sh.dataset.sheet); }
    if (e.target.closest('[data-close]')) return closeSheets();

    const link = e.target.closest('.toc-link');
    if (link) {
        e.preventDefault();
        closeSheets();
        jumpTo(link.dataset.target);
        return;
    }

    const act = e.target.closest('[data-act]');
    if (act) {
        if (act.dataset.act !== 'search') closeSheets();
        actions[act.dataset.act]?.();
        return;
    }

    const head = e.target.closest('.xb-sec-head');
    if (head && !e.target.closest('#present')) toggleSec(head.parentElement);
});


/* ============================== PHÍM TẮT ============================== */
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        // Tìm sẵn có của trình duyệt không mở được mục đang gấp -> dùng ô tìm của trang
        e.preventDefault();
        return openSearch();
    }
    if (e.key === 'Escape') { closeSheets(); closePresent(); closeBox(); closeSearch(); }
    if (!present.hidden) {
        if (e.key === 'ArrowRight') stepPresent(1);
        if (e.key === 'ArrowLeft') stepPresent(-1);
    }
    if (e.key === '/' && document.activeElement === document.body) { e.preventDefault(); openSearch(); }
});


/* ============================== VẠCH TIẾN ĐỘ ĐỌC ============================== */
const readBar = $('read-bar');
addEventListener('scroll', () => {
    const d = document.documentElement;
    const max = d.scrollHeight - d.clientHeight;
    readBar.style.width = (max > 4 ? d.scrollTop / max * 100 : 0) + '%';
}, { passive: true });


/* ============================== XEM ẢNH TO ============================== */
const lightbox = $('lightbox');
const closeBox = () => { lightbox.hidden = true; };
document.addEventListener('click', (e) => {
    const img = e.target.closest('.cls-img');
    if (!img) return;
    e.preventDefault();
    lightbox.querySelector('img').src = img.src;
    lightbox.querySelector('.lightbox-cap').textContent =
        img.closest('.cls-fig')?.querySelector('figcaption')?.textContent || '';
    lightbox.hidden = false;
});
lightbox.addEventListener('click', closeBox);
