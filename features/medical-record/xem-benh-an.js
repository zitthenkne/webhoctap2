import { showToast } from '../../core/utils.js';
import { getRecord, syncFromCloud, authReady, isSignedIn } from './record-store.js';
import { auth } from '../../core/firebase-init.js';
import { clsToHtml, clsToText, clsToWordHtml } from './cls-shared.js';
import { theoDoiToText } from './theo-doi-editor.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const recordId = new URL(location.href).searchParams.get('id');

/* ---------- định dạng ---------- */
function fmtDate(v) {
    if (!v) return '';
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v);
}
function fmtDateTime(v) {
    if (!v) return '';
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    return m ? `${m[4]}:${m[5]} ngày ${m[3]}/${m[2]}/${m[1]}` : String(v);
}

/* ---------- khung dữ liệu để render + xuất text ---------- */
const VITAL_RANGE = { 'Mạch': [60, 100], 'Nhiệt độ': [36, 37.5], 'Nhịp thở': [12, 20], 'SpO2': [95, 100] };

/** Nối các mảnh có nội dung thành một dòng, bỏ mảnh trống */
const gop = (...xs) => xs.map(x => String(x ?? '').trim()).filter(Boolean).join(' · ');

/* Khớp với data-vung của các ô bỏng bên tao-benh-an.html — sửa bên đó thì sửa cả đây */
const BONG_VUNG = {
    'dau-mat-co': ['Đầu – mặt – cổ', 9], 'chi-tren-p': ['Chi trên phải', 9],
    'chi-tren-t': ['Chi trên trái', 9], 'than-truoc': ['Thân trước', 18],
    'than-sau': ['Thân sau', 18], 'chi-duoi-p': ['Chi dưới phải', 18],
    'chi-duoi-t': ['Chi dưới trái', 18], 'sinh-duc': ['Sinh dục – tầng sinh môn', 1]
};
function bongText(list) {
    const co = (list || []).map(k => BONG_VUNG[k]).filter(Boolean);
    if (!co.length) return '';
    return `${co.reduce((t, [, pct]) => t + pct, 0)}% diện tích da `
        + `(${co.map(([ten]) => ten.toLowerCase()).join(', ')})`;
}
function xuongGayText(list) {
    return (list || []).filter(x => x && x.ten)
        .map(x => x.ten + (x.n > 1 ? ` ×${x.n}` : '')).join(', ');
}

function buildModel(r) {
    const h = r.hanhChinh || {}, t = r.tienSu || {}, k = r.khamBenh || {}, s = k.sinhTon || {};
    const ros = r.luocQuaCoQuan || {};
    const bs = r.benhSuChiTiet || {};
    const av = bs.sinhHieuNhapVien || {};
    // Các khối chuyên khoa: bày ra khi CÓ dữ liệu, không khóa theo r.loaiBenhAn — đổi
    // loại bệnh án giữa chừng thì phần đã ghi vẫn phải in ra, không được nuốt mất.
    const px = r.phauThuat || {}, sk = r.sanKhoa || {}, nk = r.nhiKhoa || {};
    const cc = r.capCuu || {}, ct = r.chanThuong || {};
    const bsn = bs.san || {}, bnh = bs.nhi || {};
    const examDay = (() => {
        const m = String(h.ngayLamBenhAn || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? ` (khám ngày ${+m[3]}/${+m[2]}/${m[1]})` : '';
    })();
    const admVitals = [
        ['Mạch', av.mach, 'lần/phút'], ['Huyết áp', av.huyetAp, 'mmHg'],
        ['Nhiệt độ', av.nhietDo, '°C'], ['Nhịp thở', av.nhipTho, 'lần/phút'],
        ['SpO2', av.spo2, '%'], ['Ghi chú', av.ghiChu, '']
    ];

    return [
        ['I. HÀNH CHÍNH', 'fa-user', [
            ['Họ và tên bệnh nhân', h.hoTen],
            ['Tuổi', h.tuoi ? `${h.tuoi}${h.namSinh ? ' (Năm sinh: ' + h.namSinh + ')' : ''}` : h.namSinh],
            ['Giới tính', h.gioiTinh], ['Dân tộc', h.danToc], ['Nghề nghiệp', h.ngheNghiep],
            ['Địa chỉ', h.diaChi],
            ['Ngày giờ nhập viện', [h.gioVaoVien, fmtDate(h.ngayVaoVien)].filter(Boolean).join(' ngày ')],
            ['Ngày giờ làm bệnh án', fmtDateTime(h.ngayLamBenhAn)],
            ['Khoa – Bệnh viện', [h.khoa, h.benhVien].filter(Boolean).join(' - ')],
            ['Phòng – Giường', [h.soPhong && 'Phòng ' + h.soPhong, (h.soGiuong || h.bedNumber) && 'Giường ' + (h.soGiuong || h.bedNumber)].filter(Boolean).join(' - ')],
            ['Người liên hệ', h.nguoiLienHe], ['SĐT liên hệ', h.sdtLienHe]
        ]],
        ['II. LÝ DO VÀO VIỆN', 'fa-sign-in-alt', [['', r.lyDoVaoVien]]],
        ['III. BỆNH SỬ', 'fa-history', [
            ['', r.benhSu],
            ['Cơ chế chấn thương', gop(ct.loai, fmtDateTime(ct.thoiDiem), ct.vanTocDoCao,
                ct.viTriVaDap && 'va đập đầu tiên vào ' + ct.viTriVaDap,
                ct.vatGayThuongTich && 'vật gây thương tích ' + ct.vatGayThuongTich, ct.baoHo)],
            ['Ngay sau chấn thương', gop(ct.batTinh, ct.quenSuViec, ct.non, ct.vanDong,
                ct.soCuu && 'sơ cứu ' + ct.soCuu, ct.chuyenVien && 'chuyển viện ' + ct.chuyenVien)],
            ['Xương gãy', xuongGayText(ct.xuongGay)],
            ['Bỏng', gop(bongText(ct.bongVung), ct.bongDoSau, ct.bongTacNhan && 'tác nhân ' + ct.bongTacNhan)],
            ['Thai kỳ lần này', gop(bsn.soLanKhamThai, bsn.noiKhamThai && 'khám tại ' + bsn.noiKhamThai,
                bsn.sieuAm && 'siêu âm ' + bsn.sieuAm, bsn.xetNghiem, bsn.uonVan && 'uốn ván ' + bsn.uonVan,
                bsn.batThuong, bsn.canTruocMangThai && `cân trước mang thai ${bsn.canTruocMangThai} kg`,
                bsn.canHienTai && `cân hiện tại ${bsn.canHienTai} kg`)],
            ['Bệnh sử nhi khoa', gop(bnh.nguoiNuoi && 'người khai ' + bnh.nguoiNuoi, bnh.anBu, bnh.nuocTieu,
                bnh.phan, bnh.dichTe, bnh.daDieuTri, bnh.canTruocBenh && `cân trước khi bệnh ${bnh.canTruocBenh} kg`)],
            ['@vitals', admVitals, 'Sinh hiệu lúc nhập viện'],
            ['@anh', r.anhHoSo, 'Ảnh hồ sơ tuyến trước']
        ]],
        ['IV. TIỀN CĂN', 'fa-notes-medical', [
            ['1. Nội khoa', t.noiKhoa], ['2. Thuốc đang dùng tại nhà', t.thuocDangDung],
            ['3. Ngoại khoa', t.ngoaiKhoa], ['4. Sản phụ khoa', t.sanPhuKhoa],
            ['5. Dị ứng', t.diUng], ['6. Môi trường – phơi nhiễm', t.moiTruong],
            ['7. Thói quen', t.thoiQuen], ['8. Gia đình', t.giaDinh],
            ['Cần hỏi trước mổ', [t.truocMo?.gayMe, t.truocMo?.chongDong,
                t.truocMo?.anUong, t.truocMo?.rangGia].filter(Boolean).join('. ')]
        ]],
        ['V. LƯỢC QUA CÁC CƠ QUAN' + examDay, 'fa-list-ul', [
            ['Tim mạch', ros.timMach], ['Hô hấp', ros.hoHap], ['Tiêu hóa', ros.tieuHoa],
            ['Thần kinh', ros.thanKinh], ['Cơ xương khớp', ros.coXuongKhop], ['Thận – Tiết niệu', ros.thanNieu]
        ]],
        ['VI. KHÁM LÂM SÀNG' + examDay, 'fa-stethoscope', [
            ['Tiếp nhận cấp cứu', gop(cc.uuTien && 'mức ưu tiên ' + cc.uuTien, fmtDateTime(cc.thoiDiem))],
            ['Đánh giá ABCDE', gop(cc.a && 'A: ' + cc.a, cc.b && 'B: ' + cc.b, cc.c && 'C: ' + cc.c,
                cc.d && 'D: ' + cc.d, cc.e && 'E: ' + cc.e)],
            ['Xử trí ban đầu', cc.xuTriBanDau],
            ['1. Tổng trạng', k.tongTrang],
            ['@vitals', [
                ['Mạch', s.mach, 'lần/phút'], ['Nhiệt độ', s.nhietDo, '°C'], ['Huyết áp', s.huyetAp, 'mmHg'],
                ['Nhịp thở', s.nhipTho, 'lần/phút'], ['SpO2', s.spo2, '%'],
                ['Chiều cao', s.chieuCao, 'cm'], ['Cân nặng', s.canNang, 'kg'],
                ['BMI', s.bmi, 'kg/m²'], ['BSA', s.bsa, 'm²'],
                ['Glasgow', k.glasgow && k.glasgow.e && k.glasgow.v && k.glasgow.m
                    ? `${+k.glasgow.e + +k.glasgow.v + +k.glasgow.m}/15 (E${k.glasgow.e} V${k.glasgow.v} M${k.glasgow.m})` : '', '']
            ]],
            ['2. Đầu – mặt – cổ', k.dauMatCo], ['3. Ngực', k.nguc], ['4. Tim', k.tim],
            ['5. Phổi', k.phoi], ['6. Bụng', k.bung],
            ['Khám sản', gop(sk.bcTC && `bề cao tử cung ${sk.bcTC} cm`, sk.vongBung && `vòng bụng ${sk.vongBung} cm`,
                sk.timThai && `tim thai ${sk.timThai} l/p`, sk.conCo && 'cơn co ' + sk.conCo,
                sk.coTuCung && 'cổ tử cung ' + sk.coTuCung, sk.ngoiThai, sk.oi, sk.khungChau && 'khung chậu ' + sk.khungChau)],
            ['Nhi khoa', gop(nk.tuoiThang && `${nk.tuoiThang} tháng tuổi`, nk.lieuMgKg && `liều thuốc ${nk.lieuMgKg} mg/kg/lần`,
                nk.sanKhoaLucSinh && 'lúc sinh: ' + nk.sanKhoaLucSinh, nk.dinhDuong, nk.chungNgua, nk.phatTrien)],
            ['7. Thần kinh – Cơ xương khớp', k.thanKinhCoXuongKhop],
            ['@anh', r.anhKham, 'Ảnh lâm sàng']
        ]],
        ['VII. TÓM TẮT BỆNH ÁN', 'fa-clipboard-list', [['', r.tomTatBenhAn]]],
        ['VIII. ĐẶT VẤN ĐỀ', 'fa-list-check', [['', r.datVanDe]]],
        ['IX. CHẨN ĐOÁN', 'fa-search', [
            ['Chẩn đoán sơ bộ', r.chanDoanSoBo], ['Chẩn đoán phân biệt', r.chanDoanPhanBiet]
        ]],
        ['X. BIỆN LUẬN LÂM SÀNG', 'fa-comments', [['', r.bienLuanChanDoan]]],
        // Mỗi dòng đề nghị đã tự mang mục đích + dấu hiệu mong tìm, nên không còn
        // đoạn biện luận riêng. Dòng dưới chỉ để bệnh án cũ mở lên vẫn đọc được.
        ['XI. ĐỀ NGHỊ CẬN LÂM SÀNG', 'fa-vials', [
            ['', r.canLamSangDeNghi, 'bullet'], ['Biện luận đề nghị (bản cũ)', r.bienLuanDeNghiCLS]
        ]],
        ['XII. KẾT QUẢ CẬN LÂM SÀNG', 'fa-microscope', [
            ['@cls', r.canLamSang], ['', r.ketQuaCanLamSang], ['', r.bienLuanKetQuaCLS]
        ]],
        ['PHẪU THUẬT', 'fa-scissors', [
            ['Ngày giờ mổ', fmtDateTime(px.ngayGio)],
            ['Phương pháp phẫu thuật', px.phuongPhap], ['Phương pháp vô cảm', px.voCam],
            ['Dẫn lưu – vết mổ', px.danLuu],
            ['Chẩn đoán trước mổ', px.chanDoanTruocMo], ['Chẩn đoán sau mổ', px.chanDoanSauMo],
            ['Tường trình phẫu thuật', px.tuongTrinh]
        ]],
        ['XIII. CHẨN ĐOÁN XÁC ĐỊNH', 'fa-check-circle', [['', r.chanDoanXacDinh]]],
        ['XIV. ĐIỀU TRỊ', 'fa-syringe', [
            ['1. Điều trị đặc hiệu / nguyên tắc', r.huongDieuTri],
            ['2. Điều trị triệu chứng & biến chứng', r.dieuTriCuThe]
        ]],
        ['XV. TIÊN LƯỢNG', 'fa-heartbeat', [['', r.tienLuong], ['Dự phòng', r.duPhong]]],
        ['THEO DÕI DIỄN TIẾN', 'fa-clipboard-list', [['', theoDoiToText(r.theoDoi), 'bullet']]]
    ];
}

/* ---------- render ---------- */
function vitalsHtml(items, caption) {
    const chips = items.filter(([, v]) => String(v ?? '').trim()).map(([label, v, unit]) => {
        const range = VITAL_RANGE[label];
        const num = parseFloat(v);
        const warn = range && !isNaN(num) && (num < range[0] || num > range[1]);
        return `<span class="vital-chip inline-flex items-baseline gap-1.5 rounded-xl px-3 py-1.5 text-sm border ${warn ? 'bg-orange-50 border-orange-300' : 'bg-pink-50/60 border-pink-200'}">
            <span class="text-gray-400 text-xs">${esc(label)}</span>
            <b class="${warn ? 'text-orange-600' : 'text-gray-700'}">${esc(v)}${unit ? ' ' + unit : ''}</b>
            ${warn ? '<i class="fas fa-triangle-exclamation text-orange-400 text-[10px]"></i>' : ''}
        </span>`;
    }).join('');
    if (!chips) return '';
    return (caption ? `<div class="text-xs font-semibold text-pink-500 mt-1">${esc(caption)}</div>` : '')
        + `<div class="flex flex-wrap gap-2 mb-1">${chips}</div>`;
}

/** Ảnh lâm sàng / ảnh hồ sơ — dùng lại class của phiếu CLS nên bấm vào cũng phóng to được */
function anhHtml(list, caption) {
    const imgs = (list || []).filter(im => im && im.url).map(im => `<figure class="cls-fig">
        <img class="cls-img" src="${esc(im.url)}" alt="${esc(im.caption || caption)}" loading="lazy">
        ${im.caption ? `<figcaption>${esc(im.caption)}</figcaption>` : ''}</figure>`).join('');
    if (!imgs) return '';
    return `<div class="text-xs font-semibold text-pink-500 mt-1">${esc(caption)}</div>`
        + `<div class="cls-imgs">${imgs}</div>`;
}

function fieldHtml(label, value) {
    if (!String(value ?? '').trim()) return '';
    // Số điện thoại: bấm là gọi được luôn trên điện thoại
    const tel = /SĐT|Điện thoại/i.test(label) && String(value).replace(/[^0-9+]/g, '');
    const shown = tel && tel.length >= 8
        ? `<a href="tel:${esc(tel)}" class="text-pink-600 underline underline-offset-2 font-medium">${esc(value)}</a>`
        : `<span class="field-value text-gray-700 break-words whitespace-pre-line">${esc(value)}</span>`;
    return `<div class="leading-relaxed">${label ? `<span class="field-label font-semibold text-pink-500">${esc(label)}:</span> ` : ''}${shown}</div>`;
}

function sectionHtml(title, icon, rows, index) {
    const body = rows.map(([label, value, extra]) =>
        label === '@vitals' ? vitalsHtml(value, extra)
            : label === '@cls' ? clsToHtml(value)
                : label === '@anh' ? anhHtml(value, extra)
                    : fieldHtml(label, value)).join('');
    if (!body) return '';
    // Hành chính toàn là dòng ngắn -> xếp 2 cột cho đỡ dài
    const cls = index === 0 ? 'sec-grid' : 'space-y-2';
    return `<section id="sec-${index}" class="rec-section bg-pink-50/60 border border-pink-200 rounded-2xl p-4 sm:p-5 transition hover:border-pink-300">
        <h3 class="text-base sm:text-lg font-bold text-pink-600 mb-3 flex items-center gap-2"><i class="fas ${icon}"></i>${esc(title)}</h3>
        <div class="${cls}">${body}</div>
    </section>`;
}

function notFoundHtml() {
    return `<div class="flex flex-col items-center justify-center py-16 text-center">
        <div class="w-16 h-16 rounded-full bg-pink-100 flex items-center justify-center mb-3"><i class="fas fa-file-circle-question text-2xl text-pink-400"></i></div>
        <p class="text-gray-600 font-bold">Không tìm thấy bệnh án</p>
        <p class="text-gray-400 text-sm mt-1 max-w-sm">${isSignedIn()
            ? 'Bệnh án này không có trong tài khoản của bạn.'
            : 'Bệnh án đang lưu trên máy đã tạo. Hãy đăng nhập để đồng bộ giữa các thiết bị.'}</p>
        <a href="../study-room/waiting-room.html" class="mt-4 px-5 py-2.5 bg-pink-500 text-white rounded-xl font-semibold hover:bg-pink-600 transition">Về danh sách bệnh án</a>
    </div>`;
}

/* ---------- xuất text ----------
   Bám đúng mẫu bệnh án của trường: dòng đầu là thông tin sinh viên, tiêu đề BỆNH ÁN,
   rồi 15 mục La Mã; ô một dòng in "* Nhãn: giá trị", ô nhiều dòng in nhãn rồi bullet. */
function toPlainText(record, model) {
    const h = record.hanhChinh || {};
    const sv = record.sinhVien || {};
    const lines = [];

    const head = [sv.hoTen, sv.mssv, sv.lop, sv.stt].map(x => String(x || '').trim()).filter(Boolean);
    if (head.length) lines.push(head.join(' - '));
    lines.push('BỆNH ÁN');

    const mark = (x, indent) => (/^[*\-•]|^\d+[.)]/.test(x) ? indent + x : indent + '* ' + x);
    const bullet = (label, value, mode) => {
        const text = String(value ?? '').trim();
        if (!text) return;
        const parts = text.split('\n').map(x => x.trim()).filter(Boolean);
        if (!label) {
            // Van xuoi giu nguyen; danh sach (de nghi CLS...) thi gach dau dong
            parts.forEach(x => lines.push(mode === 'bullet' ? mark(x, '') : x));
            return;
        }
        // Nhan da danh so nhu mau ("1. Noi khoa") -> xuong dong roi liet ke
        if (/^\d+\./.test(label)) {
            lines.push(label + ':');
            parts.forEach(x => lines.push(mark(x, '')));
            return;
        }
        if (parts.length === 1) { lines.push('* ' + label + ': ' + parts[0]); return; }
        lines.push('* ' + label + ':');
        parts.forEach(x => lines.push(mark(x, '   ')));
    };

    for (const [title, , rows] of model) {
        const before = lines.length;
        const body = [];
        for (const [label, value, extra] of rows) {
            if (label === '@vitals') {
                const shown = value.filter(([, x]) => String(x ?? '').trim());
                if (!shown.length) continue;
                body.push(() => {
                    if (extra) lines.push(`${extra}:`);
                    shown.forEach(([l, x, u]) => lines.push(`* ${l}: ${x}${u ? ' ' + u : ''}`));
                });
            } else if (label === '@cls') {
                const v = clsToText(value);
                if (v) body.push(() => lines.push(v));
            } else if (label === '@anh') {
                // File text không mang được ảnh — ghi lại số lượng và chú thích để không ai quên
                const co = (value || []).filter(im => im && im.url);
                if (co.length) body.push(() => lines.push(`* ${extra}: ${co.length} ảnh`
                    + (co.some(im => im.caption) ? ' — ' + co.map(im => im.caption).filter(Boolean).join('; ') : '')));
            } else if (String(value ?? '').trim()) {
                body.push(() => bullet(label, value, extra));
            }
        }
        if (!body.length) continue;
        lines.push(title);
        body.forEach(fn => fn());
        if (lines.length > before) lines.push('');
    }

    const dm = String(h.ngayLamBenhAn || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    const pad = ' '.repeat(40);
    lines.push('',
        pad + (dm ? `Ngày ${dm[3]} tháng ${dm[2]} năm ${dm[1]}` : 'Ngày ...... tháng ...... năm ..........'),
        pad + 'Người làm bệnh án',
        pad + (head[0] || '(Ký, ghi rõ họ tên)'), '');

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

function slugName(s) {
    return String(s || 'khong-ten').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/đ/gi, 'd').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

/* ---------- chạy ---------- */
let record = recordId ? getRecord(recordId) : null;
if (!record && recordId && await authReady()) {
    await syncFromCloud();
    record = getRecord(recordId);
}

const view = document.getElementById('medical-record-view');

if (!record) {
    view.innerHTML = notFoundHtml();
    document.getElementById('toc').style.display = 'none';
    document.getElementById('toc-fab').style.display = 'none';
} else {
    const model = buildModel(record);
    const sections = model.map(([t, i, rows], idx) => ({ title: t, html: sectionHtml(t, i, rows, idx), idx }))
        .filter(s => s.html);
    view.innerHTML = sections.length ? sections.map(s => s.html).join('') : `
        <div class="flex flex-col items-center justify-center py-14 text-center">
            <div class="w-16 h-16 rounded-full bg-pink-100 flex items-center justify-center mb-3"><i class="fas fa-pen-to-square text-2xl text-pink-400"></i></div>
            <p class="text-gray-600 font-bold">Bệnh án này chưa có nội dung</p>
            <p class="text-gray-400 text-sm mt-1">Bấm Sửa để bắt đầu điền.</p>
            <a href="tao-benh-an.html?id=${encodeURIComponent(record.id)}" class="mt-4 px-5 py-2.5 bg-pink-500 text-white rounded-xl font-semibold hover:bg-pink-600 transition"><i class="fas fa-pen mr-1"></i>Sửa bệnh án</a>
        </div>`;

    // Mục lục (cột bên cho màn lớn, thẻ trượt cho điện thoại)
    const tocHtml = sections.map(s =>
        `<a href="#sec-${s.idx}" class="toc-link" data-target="sec-${s.idx}">${esc(s.title)}</a>`).join('');
    document.getElementById('toc-nav').innerHTML = tocHtml;
    document.getElementById('toc-nav-mobile').innerHTML = tocHtml;

    // Tiêu đề trang + đầu trang in
    const h = record.hanhChinh || {};
    const name = h.hoTen || 'Chưa đặt tên';
    document.title = 'Bệnh án - ' + name;
    document.getElementById('head-name').textContent = name;
    const meta = [h.tuoi && h.tuoi + ' tuổi', h.gioiTinh, h.benhVien,
        (h.soPhong || h.roomNumber) && 'P.' + (h.soPhong || h.roomNumber)].filter(Boolean).join(' · ');
    document.getElementById('head-meta').textContent = meta;
    document.getElementById('print-sub').textContent = [name, meta].filter(Boolean).join(' — ');

    const editBtn = document.getElementById('edit-record-btn');
    editBtn.href = 'tao-benh-an.html?id=' + encodeURIComponent(record.id);
    editBtn.classList.remove('hidden');

    // Khối chữ ký (chỉ hiện khi in)
    const dm = String(h.ngayLamBenhAn || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    document.getElementById('sign-date').textContent = dm
        ? `Ngày ${dm[3]} tháng ${dm[2]} năm ${dm[1]}`
        : 'Ngày ......  tháng ......  năm ..........';
    authReady().then(() => {
        const u = auth.currentUser;
        document.getElementById('sign-name').textContent =
            u ? (u.displayName || (u.email || '').split('@')[0] || '') : '';
    });

    // Đánh dấu mục đang xem trong mục lục
    const links = [...document.querySelectorAll('.toc-link')];
    const observer = new IntersectionObserver(entries => {
        entries.forEach(en => {
            if (!en.isIntersecting) return;
            links.forEach(l => l.classList.toggle('active', l.dataset.target === en.target.id));
        });
    }, { rootMargin: '-80px 0px -70% 0px' });
    document.querySelectorAll('.rec-section').forEach(s => observer.observe(s));

    /* ---------- hành động ---------- */
    const plain = () => toPlainText(record, model);

    const actions = {
        print: () => window.print(),
        edit: () => { location.href = editBtn.href; },
        copy: async () => {
            try {
                await navigator.clipboard.writeText(plain());
                showToast('Đã sao chép toàn bộ bệnh án.', 'success');
            } catch {
                showToast('Trình duyệt chặn sao chép. Hãy chọn và copy thủ công.', 'error');
            }
        },
        txt: () => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob(['﻿' + plain()], { type: 'text/plain;charset=utf-8' }));
            a.download = `benh-an-${slugName(h.hoTen)}.txt`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            showToast('Đã tải file .txt — mở file, chọn tất cả rồi dán vào Google Docs.', 'success');
        },
        word: () => {
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
                        return `<p>${label ? '<b>' + esc(label) + ':</b> ' : ''}${esc(value).replace(/\n/g, '<br>')}</p>`;
                    }).join('');
                    return body ? `<h3>${esc(title)}</h3>${body}` : '';
                }).join('') + '<\/body><\/html>';
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
        }
    };

    ['print', 'copy', 'txt', 'word', 'share'].forEach(act => {
        document.getElementById(act + '-btn')?.addEventListener('click', actions[act]);
    });
    if (navigator.share) document.getElementById('share-btn').classList.remove('hidden');

    document.getElementById('mobile-actions').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-act]');
        if (b) actions[b.dataset.act]?.();
    });
}

// Thanh công cụ điện thoại
const bar = document.getElementById('mobile-actions');
document.getElementById('mobile-more').addEventListener('click', () => {
    bar.classList.toggle('translate-y-full');
});

// Thẻ trượt mục lục
const sheet = document.getElementById('toc-sheet');
const panel = document.getElementById('toc-panel');
const openSheet = () => {
    sheet.classList.remove('hidden');
    requestAnimationFrame(() => panel.classList.remove('translate-y-full'));
};
const closeSheet = () => {
    panel.classList.add('translate-y-full');
    setTimeout(() => sheet.classList.add('hidden'), 200);
};
document.getElementById('toc-fab').addEventListener('click', openSheet);
sheet.addEventListener('click', (e) => {
    if (e.target.dataset.close !== undefined || e.target.closest('.toc-link')) closeSheet();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

// Ctrl/Cmd + P dùng bố cục in A4 sẵn có

/* Ảnh cận lâm sàng: bấm để xem to, phóng to bằng cử chỉ sẵn có của trình duyệt */
const lightbox = document.createElement('div');
lightbox.className = 'lightbox hidden no-print';
lightbox.innerHTML = `<button class="lightbox-x" aria-label="Đóng"><i class="fas fa-xmark"></i></button>
    <img alt="Ảnh cận lâm sàng"><p class="lightbox-cap"></p>`;
document.body.appendChild(lightbox);

const closeBox = () => lightbox.classList.add('hidden');
view.addEventListener('click', (e) => {
    const img = e.target.closest('.cls-img');
    if (!img) return;
    e.preventDefault();
    lightbox.querySelector('img').src = img.src;
    lightbox.querySelector('.lightbox-cap').textContent =
        img.closest('.cls-fig')?.querySelector('figcaption')?.textContent || '';
    lightbox.classList.remove('hidden');
});
lightbox.addEventListener('click', closeBox);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeBox(); });
