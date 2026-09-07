/* =====================================================================
   benh-an-vanxuoi.js — BẢN VĂN XUÔI HỌC THUẬT của một bệnh án.

   Vì sao có file này: benh-an-text.js xuất ra bản "nhãn — giá trị"
   (**Họ và tên:** ... · **Mạch:** 96) — đúng là biểu mẫu, nhưng đọc lên
   không thành văn, và nộp bài thì thầy đọc ra một tờ khai chứ không phải
   một bệnh án. File này viết lại cùng dữ liệu đó thành ĐOẠN VĂN liền mạch,
   ngôi thứ ba, văn phong học thuật.

   HAI DẤU BỊ CẤM TUYỆT ĐỐI TRONG BẢN XUẤT: dấu chấm phẩy và dấu hai chấm.
   Không chỉ ở câu mình sinh ra mà cả ở chữ người dùng gõ vào — nên có hàm
   sach() chạy sau cùng trên toàn bản:
     · "14:30"  → "14 giờ 30"   (giờ phải đổi trước, kẻo thành "14 — 30")
     · ";"      → ","
     · ":"      → " — "         (gạch ngang dài, vẫn học thuật, không phạm luật)
     · "38.5"   → "38,5"        (số thập phân tiếng Việt, không đụng "12.000")

   Ba mức độ, cùng một dữ liệu:
     · 'day-du'  — nộp bài, đủ mười lăm mục.
     · 'trinh'   — trình bệnh, bỏ phần hành chính rườm rà, gộp các cơ quan
                   bình thường thành MỘT câu, chỉ giữ cái bất thường.
     · 'tom-tat' — mười dòng, đọc trong một phút.

   Không đụng gì tới benh-an-text.js: hai bản sống song song, người dùng bấm
   công tắc chọn bản nào.
   ===================================================================== */

import { clsToText } from './cls-shared.js';
import { theoDoiToText } from './theo-doi-editor.js';
import { fold } from './tim-kiem.js';
import { slugName } from './benh-an-text.js';

/* ---------------------------------------------------------------- */
/* Mấy hàm chữ nghĩa dùng chung                                       */
/* ---------------------------------------------------------------- */
/* false phải thành chuỗi rỗng: cả file viết theo lối `có(x) && 'chữ'`, mà
   String(false) là "false" — sót một chỗ là chữ "false" nằm giữa bệnh án. */
const T = (v) => (v === false || v == null ? '' : String(v).trim());
const has = (v) => T(v).length > 0;

/** Các dòng có chữ của một ô nhiều dòng, đã bỏ dấu gạch đầu dòng và số thứ tự */
const dong = (v) => T(v).split('\n')
    .map(x => x.trim().replace(/^[-*•]\s*/, '').replace(/^\d+[.)]\s*/, ''))
    .filter(Boolean);

/** Hạ chữ cái đầu để ghép được vào giữa câu. Giữ nguyên từ viết tắt (CRP, SpO2). */
function thap(s) {
    const t = T(s);
    if (!t) return '';
    /* Từ viết tắt giữ nguyên. Không chỉ loại "CRP" toàn hoa mà cả "SpO2",
       "BiPAP" — chữ hoa nằm ở giữa từ đầu tiên cũng là dấu hiệu viết tắt. */
    const dau = t.split(/\s/)[0];
    if (/^[A-ZĐ]{2,}/.test(t) || /[A-Z]/.test(dau.slice(1))) return t;
    return t[0].toLocaleLowerCase('vi') + t.slice(1);
}

/** Hoàn thiện một câu — viết hoa đầu câu, có dấu chấm cuối câu */
function cau(s) {
    let t = T(s).replace(/\s+/g, ' ');
    if (!t) return '';
    t = t[0].toLocaleUpperCase('vi') + t.slice(1);
    if (!/[.!?…]$/.test(t)) t += '.';
    return t;
}

/** "a, b và c" — cách liệt kê của văn viết, không phải dấu chấm phẩy */
function va(arr) {
    const a = arr.map(T).filter(Boolean);
    if (a.length <= 1) return a[0] || '';
    return a.slice(0, -1).join(', ') + ' và ' + a.at(-1);
}

/** Câu "Về X, <nội dung>." — bỏ qua khi ô trống.
    Mở đầu kết thúc bằng giới từ hay động từ ("tại", "là", "gồm", "vì", "ghi
    nhận"…) thì KHÔNG chấm phẩy sau nó, kẻo ra "cư trú tại, ấp 3". */
const NOI_LIEN = /(?:tại|là|gồm|vì|của|với|do|theo|trong|ghi nhận|sau|có)$/i;
const ve = (mo, v) => has(v)
    ? cau(`${mo}${NOI_LIEN.test(T(mo)) ? ' ' : ', '}${thap(T(v).replace(/\s+/g, ' '))}`) : '';

const THU = ['Thứ nhất', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm',
    'Thứ sáu', 'Thứ bảy', 'Thứ tám', 'Thứ chín', 'Thứ mười'];

/** Danh sách gạch đầu dòng → chuỗi câu "Thứ nhất, … Thứ hai, …" */
function keRa(v) {
    const ds = dong(v);
    if (!ds.length) return '';
    if (ds.length === 1) return cau(ds[0]);
    return ds.map((x, i) => cau(`${THU[i] || 'Tiếp theo'}, ${thap(x)}`)).join(' ');
}

/** Ô khám có nội dung "bình thường / chưa ghi nhận…" — dùng để gộp lại khi trình bệnh */
const laThuong = (v) => /^(binh thuong|chua ghi nhan|khong ghi nhan|khong co|am tinh)/
    .test(fold(T(v)));

/* Ngày giờ viết bằng chữ, không dùng dấu hai chấm */
function ngayChu(v) {
    const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `ngày ${+m[3]} tháng ${+m[2]} năm ${m[1]}` : T(v);
}
function gioChu(v) {
    const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return T(v);
    return `${+m[4]} giờ ${m[5]} ngày ${+m[3]} tháng ${+m[2]} năm ${m[1]}`;
}

/** Câu sinh hiệu — "mạch 96 lần/phút, huyết áp 120/80 mmHg và nhiệt độ 38,5 độ C" */
function sinhHieu(mo, cap) {
    const co = cap.filter(([, v]) => has(v))
        /* "95%" chứ không phải "95 %" — dấu phần trăm dính liền số theo lối
           viết của bệnh án, mấy đơn vị còn lại thì cách ra một khoảng. */
        .map(([ten, v, dv]) => `${thap(ten)} ${T(v)}${dv ? (dv === '%' ? '' : ' ') + dv : ''}`);
    return co.length ? cau(`${mo} ${va(co)}`) : '';
}

/* ---------------------------------------------------------------- */
/* LUẬT KHÔNG DẤU CHẤM PHẨY, KHÔNG DẤU HAI CHẤM                      */
/* ---------------------------------------------------------------- */
export function sach(t) {
    return String(t ?? '')
        /* Giờ phải đổi TRƯỚC luật dấu hai chấm, không thì "14:30" thành
           "14 — 30" và mất nghĩa. */
        .replace(/\b(\d{1,2}):(\d{2})\b/g, '$1 giờ $2')
        .replace(/\s*;\s*/g, ', ')
        .replace(/\s*:\s*/g, ' — ')
        /* Số thập phân kiểu Việt. Chỉ đổi khi sau dấu chấm có một hoặc hai chữ
           số rồi hết — "12.000" (hàng nghìn) và "10.10.2026" phải để yên. */
        .replace(/(\d)\.(\d{1,2})(?!\d)/g, '$1,$2')
        .replace(/ +([,.])/g, '$1')
        .replace(/,\s*,/g, ',')
        .replace(/[ \t]{2,}/g, ' ');
}

/* ---------------------------------------------------------------- */
/* BẢN VĂN XUÔI                                                       */
/* ---------------------------------------------------------------- */
/**
 * @param {object} r  bản ghi bệnh án (cùng khuôn với buildModel)
 * @param {'day-du'|'trinh'|'tom-tat'} muc
 */
export function toProse(r = {}, muc = 'day-du') {
    const h = r.hanhChinh || {}, t = r.tienSu || {}, k = r.khamBenh || {}, s = k.sinhTon || {};
    const ros = r.luocQuaCoQuan || {}, bs = r.benhSuChiTiet || {}, av = bs.sinhHieuNhapVien || {};
    const px = r.phauThuat || {}, sk = r.sanKhoa || {}, nk = r.nhiKhoa || {};
    const cc = r.capCuu || {}, ct = r.chanThuong || {}, bsn = bs.san || {}, bnh = bs.nhi || {};
    const sv = r.sinhVien || {};
    const gon = muc !== 'day-du';          // trình bệnh và tóm tắt đều là bản gọn
    const rat = muc === 'tom-tat';

    const out = [];
    const muc_ = (ten, ...doan) => {
        const co = doan.flat().map(T).filter(Boolean);
        if (co.length) out.push('## ' + ten, '', co.join(' '), '');
    };

    /* ---------- Câu nhận dạng bệnh nhân ---------- */
    const tuoi = has(h.tuoi) ? `${T(h.tuoi)} tuổi`
        : has(h.namSinh) ? `sinh năm ${T(h.namSinh)}` : '';
    const nhanDang = cau([
        has(h.hoTen) ? `bệnh nhân ${T(h.hoTen)}` : 'bệnh nhân',
        thap(h.gioiTinh), tuoi,
        has(h.danToc) && `dân tộc ${T(h.danToc)}`,
        has(h.ngheNghiep) && `nghề nghiệp ${thap(h.ngheNghiep)}`
    ].filter(Boolean).join(', '));

    if (rat) {
        muc_('TÓM TẮT', nhanDang,
            ve('Bệnh nhân nhập viện vì', r.lyDoVaoVien),
            /* Tóm tắt và đặt vấn đề gần như luôn nói cùng một danh sách. Bản
               mười dòng chỉ lấy một, không thì ra hai lần "Thứ nhất…". */
            has(r.tomTatBenhAn) ? keRa(r.tomTatBenhAn) : keRa(r.datVanDe),
            ve('Chẩn đoán xác định là', r.chanDoanXacDinh) || ve('Chẩn đoán sơ bộ là', r.chanDoanSoBo),
            ve('Hướng điều trị', r.huongDieuTri));
        return ketThuc(out, h, sv);
    }

    /* ---------- I. HÀNH CHÍNH ---------- */
    const nhapVien = [
        has(h.gioVaoVien) && `lúc ${T(h.gioVaoVien).replace(/^(\d{1,2}):(\d{2})$/, '$1 giờ $2')}`,
        has(h.ngayVaoVien) && ngayChu(h.ngayVaoVien)
    ].filter(Boolean).join(' ');
    const noiNam = va([
        has(h.khoa) && `khoa ${thap(h.khoa)}`,
        has(h.benhVien) && T(h.benhVien),
        has(h.soPhong) && `phòng ${T(h.soPhong)}`,
        (has(h.soGiuong) || has(h.bedNumber)) && `giường ${T(h.soGiuong || h.bedNumber)}`
    ].filter(Boolean));

    if (gon) {
        muc_('HÀNH CHÍNH', nhanDang,
            nhapVien && cau(`Bệnh nhân nhập viện ${nhapVien}`));
    } else {
        muc_('I. HÀNH CHÍNH', nhanDang,
            ve('Bệnh nhân hiện cư trú tại', h.diaChi),
            nhapVien && cau(`Bệnh nhân nhập viện ${nhapVien}`),
            noiNam && cau(`Bệnh nhân đang điều trị tại ${noiNam}`),
            has(h.ngayLamBenhAn) && cau(`Bệnh án được thực hiện lúc ${gioChu(h.ngayLamBenhAn)}`),
            has(h.nguoiLienHe) && cau(`Người liên hệ là ${T(h.nguoiLienHe)}`
                + (has(h.sdtLienHe) ? `, số điện thoại ${T(h.sdtLienHe)}` : '')));
    }

    /* ---------- II. LÝ DO VÀO VIỆN ---------- */
    muc_(gon ? 'LÝ DO VÀO VIỆN' : 'II. LÝ DO VÀO VIỆN',
        ve('Bệnh nhân nhập viện vì', r.lyDoVaoVien));

    /* ---------- III. BỆNH SỬ ---------- */
    const coCheChan = va([
        thap(ct.loai), has(ct.thoiDiem) && gioChu(ct.thoiDiem), thap(ct.vanTocDoCao),
        has(ct.viTriVaDap) && `va đập đầu tiên vào ${thap(ct.viTriVaDap)}`,
        has(ct.vatGayThuongTich) && `vật gây thương tích là ${thap(ct.vatGayThuongTich)}`,
        thap(ct.baoHo)
    ].filter(Boolean));
    muc_(gon ? 'BỆNH SỬ' : 'III. BỆNH SỬ',
        has(r.benhSu) ? T(r.benhSu).split('\n').map(x => cau(x)).join(' ') : '',
        ve('Về cơ chế chấn thương', coCheChan),
        ve('Ngay sau chấn thương', va([thap(ct.batTinh), thap(ct.quenSuViec), thap(ct.non),
            thap(ct.vanDong), has(ct.soCuu) && `được sơ cứu ${thap(ct.soCuu)}`,
            has(ct.chuyenVien) && `chuyển viện ${thap(ct.chuyenVien)}`].filter(Boolean))),
        ve('Về thai kỳ lần này', va([thap(bsn.soLanKhamThai),
            has(bsn.noiKhamThai) && `khám thai tại ${thap(bsn.noiKhamThai)}`,
            has(bsn.sieuAm) && `siêu âm ${thap(bsn.sieuAm)}`, thap(bsn.xetNghiem),
            has(bsn.uonVan) && `đã tiêm uốn ván ${thap(bsn.uonVan)}`, thap(bsn.batThuong)].filter(Boolean))),
        ve('Về nuôi dưỡng và diễn tiến của trẻ', va([
            has(bnh.nguoiNuoi) && `người khai bệnh là ${thap(bnh.nguoiNuoi)}`,
            thap(bnh.anBu), thap(bnh.nuocTieu), thap(bnh.phan), thap(bnh.dichTe),
            has(bnh.daDieuTri) && `đã điều trị ${thap(bnh.daDieuTri)}`].filter(Boolean))),
        sinhHieu('Sinh hiệu lúc nhập viện ghi nhận', [
            ['Mạch', av.mach, 'lần/phút'], ['Huyết áp', av.huyetAp, 'mmHg'],
            ['Nhiệt độ', av.nhietDo, 'độ C'], ['Nhịp thở', av.nhipTho, 'lần/phút'],
            ['SpO2', av.spo2, '%']
        ]),
        (r.anhHoSo || []).length && !gon
            ? cau(`Hồ sơ tuyến trước có ${(r.anhHoSo || []).length} hình ảnh kèm theo`) : '');

    /* ---------- IV. TIỀN CĂN ---------- */
    const tcRieng = [
        ['Về tiền căn nội khoa', t.noiKhoa],
        ['Các thuốc bệnh nhân đang dùng tại nhà gồm', t.thuocDangDung],
        ['Về tiền căn ngoại khoa', t.ngoaiKhoa],
        ['Về tiền căn sản phụ khoa', t.sanPhuKhoa],
        ['Về tiền căn dị ứng', t.diUng],
        ['Về môi trường và phơi nhiễm', t.moiTruong],
        ['Về thói quen', t.thoiQuen],
        ['Về tiền căn gia đình', t.giaDinh]
    ];
    /* Trình bệnh chỉ nói bốn thứ hay đổi hướng chẩn đoán, phần còn lại giữ cho
       bản nộp — đứng trước hội đồng mà đọc hết tám mục thì hết thời gian. */
    const tcLoc = gon ? tcRieng.filter((_, i) => [0, 1, 4, 7].includes(i)) : tcRieng;
    muc_(gon ? 'TIỀN CĂN' : 'IV. TIỀN CĂN',
        tcLoc.map(([mo, v]) => ve(mo, v)),
        !gon ? ve('Cần lưu ý trước mổ', va([t.truocMo?.gayMe, t.truocMo?.chongDong,
            t.truocMo?.anUong, t.truocMo?.rangGia, t.truocMo?.asa].filter(has).map(thap))) : '');

    /* ---------- V. LƯỢC QUA CÁC CƠ QUAN ---------- */
    const coQuan = [['tim mạch', ros.timMach], ['hô hấp', ros.hoHap], ['tiêu hóa', ros.tieuHoa],
    ['thần kinh', ros.thanKinh], ['cơ xương khớp', ros.coXuongKhop], ['thận và tiết niệu', ros.thanNieu]];
    const rosBat = coQuan.filter(([, v]) => has(v) && !laThuong(v));
    const rosThuong = coQuan.filter(([, v]) => has(v) && laThuong(v)).map(([ten]) => ten);
    muc_(gon ? 'LƯỢC QUA CÁC CƠ QUAN' : 'V. LƯỢC QUA CÁC CƠ QUAN',
        rosBat.map(([ten, v]) => ve(`Về cơ quan ${ten}`, v)),
        /* Sáu cơ quan bình thường viết thành sáu câu giống hệt nhau là chỗ khô
           nhất của cả bệnh án — gộp lại một câu. */
        rosThuong.length
            ? cau(`${rosThuong.length === coQuan.length ? 'Các cơ quan' : 'Các cơ quan còn lại gồm'} `
                + `${va(rosThuong)} chưa ghi nhận bất thường`) : '');

    /* ---------- VI. KHÁM LÂM SÀNG ---------- */
    const boPhan = [['đầu, mặt và cổ', k.dauMatCo], ['ngực', k.nguc], ['tim', k.tim],
    ['phổi', k.phoi], ['bụng', k.bung], ['thần kinh và cơ xương khớp', k.thanKinhCoXuongKhop]];
    const khamBat = boPhan.filter(([, v]) => has(v) && !laThuong(v));
    const khamThuong = boPhan.filter(([, v]) => has(v) && laThuong(v)).map(([ten]) => ten);
    const glasgow = k.glasgow && k.glasgow.e && k.glasgow.v && k.glasgow.m
        ? `${+k.glasgow.e + +k.glasgow.v + +k.glasgow.m} trên 15 điểm `
        + `(mắt ${k.glasgow.e} điểm, lời nói ${k.glasgow.v} điểm, vận động ${k.glasgow.m} điểm)` : '';

    muc_(gon ? 'KHÁM LÂM SÀNG' : 'VI. KHÁM LÂM SÀNG',
        has(h.ngayLamBenhAn) && !gon ? cau(`Khám ${ngayChu(h.ngayLamBenhAn)} ghi nhận như dưới đây`) : '',
        ve('Về tổng trạng', k.tongTrang),
        sinhHieu('Sinh hiệu ghi nhận', [
            ['Mạch', s.mach, 'lần/phút'], ['Huyết áp', s.huyetAp, 'mmHg'],
            ['Nhiệt độ', s.nhietDo, 'độ C'], ['Nhịp thở', s.nhipTho, 'lần/phút'],
            ['SpO2', s.spo2, '%']
        ]),
        !gon ? sinhHieu('Các chỉ số nhân trắc gồm', [
            ['Chiều cao', s.chieuCao, 'cm'], ['Cân nặng', s.canNang, 'kg'],
            ['BMI', s.bmi, 'kg/m²'], ['BSA', s.bsa, 'm²']
        ]) : '',
        glasgow ? cau(`Điểm Glasgow là ${glasgow}`) : '',
        ve('Về tiếp nhận cấp cứu', va([has(cc.uuTien) && `mức ưu tiên ${thap(cc.uuTien)}`,
            has(cc.thoiDiem) && gioChu(cc.thoiDiem)].filter(Boolean))),
        ve('Đánh giá ABCDE ghi nhận', va([
            has(cc.a) && `đường thở ${thap(cc.a)}`, has(cc.b) && `hô hấp ${thap(cc.b)}`,
            has(cc.c) && `tuần hoàn ${thap(cc.c)}`, has(cc.d) && `tri giác ${thap(cc.d)}`,
            has(cc.e) && `bộc lộ toàn thân ${thap(cc.e)}`].filter(Boolean))),
        ve('Xử trí ban đầu', cc.xuTriBanDau),
        khamBat.map(([ten, v]) => cau(`Khám ${ten} ghi nhận ${thap(T(v).replace(/\s+/g, ' '))}`)),
        khamThuong.length ? cau(`Khám ${va(khamThuong)} chưa ghi nhận bất thường`) : '',
        ve('Khám sản khoa ghi nhận', va([
            has(sk.bcTC) && `bề cao tử cung ${T(sk.bcTC)} cm`,
            has(sk.vongBung) && `vòng bụng ${T(sk.vongBung)} cm`,
            has(sk.timThai) && `tim thai ${T(sk.timThai)} lần/phút`,
            has(sk.conCo) && `cơn co ${thap(sk.conCo)}`,
            has(sk.coTuCung) && `cổ tử cung ${thap(sk.coTuCung)}`,
            thap(sk.ngoiThai), thap(sk.oi),
            has(sk.khungChau) && `khung chậu ${thap(sk.khungChau)}`].filter(Boolean))),
        ve('Về đặc điểm nhi khoa', va([
            has(nk.tuoiThang) && `trẻ ${T(nk.tuoiThang)} tháng tuổi`,
            has(nk.lieuMgKg) && `liều thuốc tính theo cân nặng là ${T(nk.lieuMgKg)} mg/kg mỗi lần`,
            has(nk.sanKhoaLucSinh) && `lúc sinh ${thap(nk.sanKhoaLucSinh)}`,
            thap(nk.dinhDuong), thap(nk.chungNgua), thap(nk.phatTrien)].filter(Boolean))),
        (r.anhKham || []).length && !gon
            ? cau(`Có ${(r.anhKham || []).length} hình ảnh lâm sàng kèm theo`) : '');

    /* ---------- VII đến XV ---------- */
    muc_(gon ? 'TÓM TẮT BỆNH ÁN' : 'VII. TÓM TẮT BỆNH ÁN', keRa(r.tomTatBenhAn));
    muc_(gon ? 'ĐẶT VẤN ĐỀ' : 'VIII. ĐẶT VẤN ĐỀ', keRa(r.datVanDe));
    muc_(gon ? 'CHẨN ĐOÁN' : 'IX. CHẨN ĐOÁN',
        ve('Chẩn đoán sơ bộ là', r.chanDoanSoBo),
        has(r.chanDoanPhanBiet)
            ? cau(`Chẩn đoán phân biệt gồm ${va(dong(r.chanDoanPhanBiet).map(thap))}`) : '');
    muc_(gon ? 'BIỆN LUẬN' : 'X. BIỆN LUẬN LÂM SÀNG',
        has(r.bienLuanChanDoan) ? T(r.bienLuanChanDoan).split('\n').map(x => cau(x)).join(' ') : '');

    const deNghi = dong(r.canLamSangDeNghi);
    muc_(gon ? 'ĐỀ NGHỊ CẬN LÂM SÀNG' : 'XI. ĐỀ NGHỊ CẬN LÂM SÀNG',
        !deNghi.length ? ''
            : deNghi.every(x => x.length <= 60)
                ? cau(`Đề nghị các cận lâm sàng gồm ${va(deNghi.map(thap))}`)
                : deNghi.map(x => cau(`Đề nghị ${thap(x)}`)).join(' '),
        !gon ? ve('Biện luận đề nghị', r.bienLuanDeNghiCLS) : '');

    if (!rat) {
        const clsTxt = clsToText(r.canLamSang);
        muc_(gon ? 'KẾT QUẢ CẬN LÂM SÀNG' : 'XII. KẾT QUẢ CẬN LÂM SÀNG',
            has(clsTxt) ? dong(clsTxt).map(x => cau(x)).join(' ') : '',
            has(r.ketQuaCanLamSang) ? dong(r.ketQuaCanLamSang).map(x => cau(x)).join(' ') : '',
            has(r.bienLuanKetQuaCLS) ? dong(r.bienLuanKetQuaCLS).map(x => cau(x)).join(' ') : '');
    }

    if (!gon) {
        muc_('PHẪU THUẬT',
            has(px.ngayGio) ? cau(`Bệnh nhân được phẫu thuật lúc ${gioChu(px.ngayGio)}`) : '',
            ve('Phương pháp phẫu thuật là', px.phuongPhap),
            ve('Phương pháp vô cảm là', px.voCam),
            ve('Về dẫn lưu và vết mổ', px.danLuu),
            ve('Chẩn đoán trước mổ là', px.chanDoanTruocMo),
            ve('Chẩn đoán sau mổ là', px.chanDoanSauMo),
            has(px.tuongTrinh) ? dong(px.tuongTrinh).map(x => cau(x)).join(' ') : '');
    }

    muc_(gon ? 'CHẨN ĐOÁN XÁC ĐỊNH' : 'XIII. CHẨN ĐOÁN XÁC ĐỊNH',
        ve('Chẩn đoán xác định là', r.chanDoanXacDinh));
    muc_(gon ? 'ĐIỀU TRỊ' : 'XIV. ĐIỀU TRỊ',
        ve('Về nguyên tắc điều trị', r.huongDieuTri),
        has(r.dieuTriCuThe) ? keRa(r.dieuTriCuThe) : '');
    muc_(gon ? 'TIÊN LƯỢNG' : 'XV. TIÊN LƯỢNG',
        ve('Tiên lượng của bệnh nhân', r.tienLuong),
        ve('Về dự phòng', r.duPhong));

    if (!gon) {
        const td = theoDoiToText(r.theoDoi);
        muc_('THEO DÕI DIỄN TIẾN', has(td) ? dong(td).map(x => cau(x)).join(' ') : '');
    }

    return ketThuc(out, h, sv);
}

function ketThuc(out, h, sv) {
    const ten = [sv.hoTen, sv.mssv, sv.lop, sv.stt].map(T).filter(Boolean);
    const dm = String(h.ngayLamBenhAn || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    const dau = ten.length ? [`*${ten.join(' - ')}*`, ''] : [];
    const cuoi = ['---', '',
        dm ? `*Ngày ${dm[3]} tháng ${dm[2]} năm ${dm[1]}*` : '*Ngày ...... tháng ...... năm ..........*',
        '', '**Người làm bệnh án**', '', ten[0] || '(Ký, ghi rõ họ tên)'];
    const than = out.length ? out : ['*Chưa có nội dung nào để dựng thành văn xuôi.*', ''];
    return sach([...dau, '# BỆNH ÁN', '', ...than, ...cuoi].join('\n'))
        .replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/** Số chữ và thời gian đọc thành tiếng (150 chữ mỗi phút — nhịp trình bệnh) */
export function doDai(vanXuoi) {
    const chu = String(vanXuoi || '').replace(/^[#*\-\s]+$/gm, ' ')
        .replace(/[#*]/g, ' ').trim().split(/\s+/).filter(Boolean).length;
    const giay = Math.round(chu / 150 * 60);
    const doc = giay < 60 ? `${giay} giây`
        : `${Math.floor(giay / 60)} phút${giay % 60 ? ' ' + (giay % 60) + ' giây' : ''}`;
    return { chu, doc };
}

/** Tải bản văn xuôi về máy dưới dạng .txt — mở bằng Word hay Docs đều đọc được */
export function downloadProse(record, muc = 'day-du') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + toProse(record, muc)],
        { type: 'text/plain;charset=utf-8' }));
    a.download = `benh-an-van-xuoi-${slugName(record?.hanhChinh?.hoTen)}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------------------------------------------------------------- */
/* CÔNG TẮC BẢN VĂN XUÔI / BẢN MARKDOWN                              */
/* Trang nhập liệu gọi setProseSource(collectRecord) một lần, rồi hỏi */
/* proseMode() mỗi lần dựng lại bản xem trước.                        */
/* ---------------------------------------------------------------- */
let mode = localStorage.getItem('baVanXuoi') || 'day-du';   // '' = bản Markdown cũ
let nguon = null;
export const proseMode = () => mode;
export const setProseSource = (fn) => { nguon = fn; };
export const layBanGhi = () => (typeof nguon === 'function' ? nguon() : null);
export function setProseMode(v) {
    mode = v || '';
    try { localStorage.setItem('baVanXuoi', mode); } catch { }
}
