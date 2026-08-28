// benh-an-text.js — khung dữ liệu + bản văn xuôi Markdown của một bệnh án.
//
// Tách ra khỏi xem-benh-an.js để trang nhập liệu (tao-benh-an.html) dùng CHUNG một
// bộ luật: gõ tới đâu, ô xem trước dựng lại bản văn xuôi tới đó, không còn cảnh
// bản xem trước và bản xuất ra khác nhau.
//
// Xuất ra Markdown (không phải .txt trơn): dán / mở bằng Google Docs là tự lên
// heading, đỡ phải ngồi tô lại từng mục.

import { clsToText } from './cls-shared.js';
import { theoDoiToText } from './theo-doi-editor.js';

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
export const VITAL_RANGE = { 'Mạch': [60, 100], 'Nhiệt độ': [36, 37.5], 'Nhịp thở': [12, 20], 'SpO2': [95, 100] };

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

export function buildModel(r) {
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
                t.truocMo?.anUong, t.truocMo?.rangGia, t.truocMo?.asa].filter(Boolean).join('. ')]
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

/* ---------- xuất Markdown ----------
   Bám đúng mẫu bệnh án của trường, nhưng đánh dấu bằng cú pháp Markdown để Google
   Docs / Word mở ra là có sẵn heading:
     # BỆNH ÁN            -> Tiêu đề 1
     ## I. HÀNH CHÍNH     -> Tiêu đề 2
     **Nhãn:** giá trị    -> nhãn in đậm
     - dòng               -> gạch đầu dòng
   Đoạn văn xuôi (bệnh sử, biện luận…) giữ nguyên là đoạn, KHÔNG bẻ thành bullet. */

/* Ký tự Markdown lọt vào giữa câu tiếng Việt sẽ ăn mất chữ khi Docs đọc lại
   ("2*2cm" thành in nghiêng). Chỉ thoát mấy ký tự thật sự nguy hiểm. */
const escMd = (s) => String(s ?? '').replace(/([*_`])/g, '\$1');

const dedupeLines = (arr) => {
    const seen = new Set();
    return arr.filter(x => {
        const k = x.trim().toLowerCase();
        if (!k) return true;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
};

export function toMarkdown(record, model = buildModel(record)) {
    const h = record.hanhChinh || {}, sv = record.sinhVien || {};
    const lines = [];

    const head = [sv.hoTen, sv.mssv, sv.lop, sv.stt].map(x => String(x || '').trim()).filter(Boolean);
    if (head.length) lines.push(`*${escMd(head.join(' - '))}*`, '');
    lines.push('# BỆNH ÁN', '');

    /* Ô nhiều dòng: mỗi dòng là một ý -> gạch đầu dòng. Ô văn xuôi (không nhãn)
       giữ nguyên đoạn. Dòng trùng nhau y hệt bị bỏ — dữ liệu cũ hay bị nhân bản. */
    const bullet = (label, value, mode) => {
        const parts = dedupeLines(String(value ?? '').split('\n').map(x => x.trim()).filter(Boolean));
        if (!parts.length) return;
        const mark = (x) => (/^[-*•]\s|^\d+[.)]\s/.test(x) ? '- ' + x.replace(/^[-*•]\s*/, '') : '- ' + x);
        if (!label) {
            parts.forEach(x => lines.push(mode === 'bullet' ? mark(escMd(x)) : escMd(x), ''));
            return;
        }
        if (parts.length === 1) { lines.push(`**${escMd(label)}:** ${escMd(parts[0])}`, ''); return; }
        lines.push(`**${escMd(label)}:**`, '');
        parts.forEach(x => lines.push(mark(escMd(x))));
        lines.push('');
    };

    for (const [title, , rows] of model) {
        const body = [];
        for (const [label, value, extra] of rows) {
            if (label === '@vitals') {
                const shown = value.filter(([, x]) => String(x ?? '').trim());
                if (!shown.length) continue;
                body.push(() => {
                    if (extra) lines.push(`**${escMd(extra)}:**`, '');
                    shown.forEach(([l, x, u]) => lines.push(`- ${escMd(l)}: ${escMd(x)}${u ? ' ' + u : ''}`));
                    lines.push('');
                });
            } else if (label === '@cls') {
                const v = clsToText(value);
                if (v) body.push(() => lines.push(...v.split('\n').map(escMd), ''));
            } else if (label === '@anh') {
                // Markdown mang được ảnh: dán vào Docs là thấy luôn, khỏi phải mô tả suông
                const co = (value || []).filter(im => im && im.url);
                if (co.length) body.push(() => {
                    lines.push(`**${escMd(extra)}:**`, '');
                    co.forEach(im => lines.push(`![${escMd(im.caption || extra)}](${im.url})`, ''));
                });
            } else if (String(value ?? '').trim()) {
                body.push(() => bullet(label, value, extra));
            }
        }
        if (!body.length) continue;
        lines.push(`## ${escMd(title)}`, '');
        body.forEach(fn => fn());
    }

    const dm = String(h.ngayLamBenhAn || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    lines.push('---', '',
        dm ? `*Ngày ${dm[3]} tháng ${dm[2]} năm ${dm[1]}*` : '*Ngày ...... tháng ...... năm ..........*',
        '', '**Người làm bệnh án**', '', head[0] ? escMd(head[0]) : '(Ký, ghi rõ họ tên)');

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

export function slugName(s) {
    return String(s || 'khong-ten').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

/** Tải bản Markdown về máy */
export function downloadMarkdown(record, model) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + toMarkdown(record, model)],
        { type: 'text/markdown;charset=utf-8' }));
    a.download = `benh-an-${slugName(record.hanhChinh?.hoTen)}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
