// benh-an-mau.js — BỆNH ÁN MẪU: một bệnh án hoàn chỉnh, luôn có sẵn để xem thử.
//
// Vì sao có file này: trang viết bệnh án mở ra là một biểu mẫu trống trơn, người
// mới không hình dung nổi "viết đủ" nghĩa là viết tới đâu. Mở
// tao-benh-an.html?id=BA-MAU là nạp thẳng bản mẫu dưới đây vào chính biểu mẫu
// đó — đủ 15 mục, đủ mốc diễn tiến, đủ phiếu cận lâm sàng, đủ bảng biện luận.
//
// Bản mẫu KHÔNG nằm trong kho bệnh án của người dùng: không có trong
// localStorage, không lên Firestore, không hiện ở phòng chờ. Nó là hằng số trong
// mã nguồn nên sửa gì trên màn hình cũng không lưu, tải lại là về nguyên trạng
// (xem chốt chặn ở record-store.saveRecord và cờ LA_MAU trong tao-benh-an.js).
//
// Ca bệnh: nam 62 tuổi, viêm phổi cộng đồng trên nền đái tháo đường típ 2 —
// chọn ca nội khoa kinh điển vì nó dùng tới gần hết các khối của trang: mốc
// bệnh sử, gói·năm thuốc lá, CURB-65, khí máu, biện luận nhiều vấn đề, y lệnh
// thuốc, bảng theo dõi.

export const MAU_ID = 'BA-MAU';

/** Bệnh án đang mở có phải bản mẫu không */
export const laBenhAnMau = (id) => String(id) === MAU_ID;

/* Ngày tháng cố định: bản mẫu là một ca đã khép lại, để ngày "hôm nay" thì mỗi
   lần mở lại lệch nhau, mà mốc "CNV 3 ngày" cũng hết khớp với ngày nhập viện. */
const NGAY_VAO = '2026-08-24';
const NGAY_LAM = '2026-08-26T08:00';

const rec = {
    id: MAU_ID,
    status: 'Hoàn thành',
    loaiBenhAn: 'noi',
    lastUpdated: '2026-08-26T08:00:00.000Z',

    /* ---------- I. HÀNH CHÍNH ---------- */
    hanhChinh: {
        hoTen: 'BỆNH ÁN MẪU',
        namSinh: '1963',
        tuoi: '62',
        gioiTinh: 'Nam',
        danToc: 'Kinh',
        ngheNghiep: 'Thợ hồ, đã nghỉ việc 2 năm nay',
        diaChi: 'Ấp 3, xã Tân Kiên, huyện Bình Chánh, TP. Hồ Chí Minh',
        nguoiLienHe: 'Con gái (ở cùng nhà)',
        sdtLienHe: '090x xxx xxx',
        gioVaoVien: '07:40',
        ngayVaoVien: NGAY_VAO,
        ngayLamBenhAn: NGAY_LAM,
        soGiuong: '12',
        soPhong: '305',
        benhVien: 'Bệnh viện Nhân dân Gia Định',
        khoa: 'Nội Hô hấp'
    },
    sinhVien: { hoTen: '', mssv: '', lop: '', stt: '' },

    /* ---------- II. LÝ DO VÀO VIỆN ---------- */
    lyDoVaoVien: 'Sốt và khó thở tăng dần 3 ngày',

    /* ---------- III. BỆNH SỬ ---------- */
    benhSuChiTiet: {
        nguoiKhai: 'Bệnh nhân',
        quanHe: 'con gái (bổ sung phần thuốc uống ở nhà)',
        doTinCay: 'Tốt',
        ngayKhoiPhat: '2026-08-17',
        trieuChung: {
            ten: 'Sốt',
            viTri: 'Toàn thân; kèm đau ngực khu trú vùng dưới nách phải, không lan',
            tinhChat: 'Sốt cao kèm lạnh run, sau đó vã mồ hôi; đau ngực kiểu nhói, tăng khi hít sâu và khi ho',
            mucDo: 'Sốt cao nhất 39,5°C; đau ngực 4/10, không làm mất ngủ nhưng khiến bệnh nhân thở nông',
            thoiGian: 'Liên tục 3 ngày, sốt nhiều về chiều tối, mỗi cơn 3–4 giờ',
            tangGiam: 'Giảm ít sau uống paracetamol rồi sốt lại sau 4 giờ; tăng khi ho và khi hít sâu',
            kemTheo: 'Ho đàm vàng đặc, khó thở khi gắng sức nhẹ, ăn kém, mệt nhiều',
            daXuTri: 'Tự mua paracetamol 500 mg và amoxicillin 500 mg uống 2 ngày ở nhà thuốc gần nhà, không giảm'
        },

        /* Diễn tiến theo mốc — khối này sinh ra đoạn văn bệnh sử ở dưới */
        mocs: [
            {
                id: 'mau1', phase: 'truoc', n: '7', u: 'ngày', refs: [],
                s: 'Ho khan từng cơn, chảy mũi trong, mệt nhẹ; vẫn ăn uống và đi lại bình thường, không sốt, không khó thở'
            },
            {
                id: 'mau2', phase: 'truoc', n: '3', u: 'ngày', refs: [],
                s: 'Sốt cao 39°C kèm lạnh run về chiều; ho chuyển sang đàm vàng đặc lượng nhiều; đau ngực phải kiểu nhói tăng khi hít sâu'
            },
            {
                id: 'mau3', phase: 'truoc', n: '1', u: 'ngày', refs: [],
                s: 'Khó thở khi đi lại trong nhà khoảng 20 mét phải dừng nghỉ; ăn được nửa chén cháo mỗi bữa; tự uống amoxicillin 2 ngày không giảm'
            },
            {
                id: 'mau4', phase: 'nv', n: '', u: 'ngày', refs: [],
                s: 'Khó thở cả lúc nằm nghỉ, sốt 39,2°C, thở nhanh nông, môi khô, người nhà đưa vào cấp cứu'
            },
            {
                id: 'mau5', phase: 'sau', n: '1', u: 'ngày', refs: [],
                s: 'Hết lạnh run, còn sốt 38°C; khó thở giảm rõ sau thở oxy kính mũi 3 lít/phút; ho khạc đàm dễ hơn'
            },
            {
                id: 'mau6', phase: 'sau', n: '2', u: 'ngày', refs: [],
                s: 'Hết sốt 24 giờ; đàm loãng và bớt hẳn lượng; tự đi lại trong phòng không khó thở; ăn hết một chén cháo'
            }
        ],

        anUong: 'Ăn kém từ 3 ngày nay, khoảng 1/2 chén cháo mỗi bữa, uống được 1 lít nước/ngày',
        giacNgu: 'Ngủ kém vì ho và khó thở, khoảng 4 giờ mỗi đêm, phải kê hai gối',
        tieu: 'Tiêu phân vàng đóng khuôn 1 lần/ngày, không đàm máu',
        tieuTien: 'Tiểu vàng trong, khoảng 1,2 lít/ngày, không gắt buốt',
        toanThan: 'Sụt khoảng 2 kg trong 1 tuần, mệt nhiều, không phù',
        amTinh: 'Không đau ngực sau xương ức kiểu đè nặng, không hồi hộp, không phù chân, '
            + 'không ho ra máu, không sụt cân kéo dài, không đổ mồ hôi đêm, '
            + 'không tiêu chảy, không rối loạn tri giác',

        lucNhapVien: 'Bệnh nhân tỉnh, tiếp xúc tốt, thở nhanh nông, môi khô, da nóng ẩm; '
            + 'phải ngồi dựa mới dễ thở; nói được từng câu ngắn',
        sinhHieuNhapVien: {
            mach: '112', huyetAp: '110/70', nhietDo: '39.2', nhipTho: '26', spo2: '90',
            ghiChu: 'SpO2 đo khí trời; sau thở oxy kính mũi 3 lít/phút lên 96%'
        },
        sauNhapVien: 'Được thở oxy kính mũi 3 lít/phút, cấy máu và cấy đàm trước khi dùng kháng sinh, '
            + 'truyền dịch NaCl 0,9% và khởi động kháng sinh đường tĩnh mạch trong giờ đầu. '
            + 'Sau 48 giờ hết sốt, SpO2 khí trời 95%, giảm dần oxy.'
    },
    benhSu: 'Bệnh khởi phát cách nhập viện 7 ngày với ho khan và chảy mũi trong, bệnh nhân vẫn sinh hoạt bình thường. '
        + 'Cách nhập viện 3 ngày, bệnh nhân sốt cao 39°C kèm lạnh run về chiều, ho chuyển sang khạc đàm vàng đặc lượng nhiều, '
        + 'kèm đau ngực phải kiểu nhói tăng khi hít sâu và khi ho. Cách nhập viện 1 ngày, bệnh nhân khó thở khi đi lại trong nhà '
        + 'khoảng 20 mét phải dừng nghỉ, ăn kém, tự mua amoxicillin uống 2 ngày không giảm. Ngày nhập viện, bệnh nhân khó thở cả '
        + 'lúc nằm nghỉ, sốt 39,2°C, thở nhanh nông nên người nhà đưa vào cấp cứu. Trong quá trình bệnh, bệnh nhân không ho ra máu, '
        + 'không đau ngực sau xương ức kiểu đè nặng, không phù chân, không đổ mồ hôi đêm, không sụt cân kéo dài.',

    /* ---------- IV. TIỀN CĂN ---------- */
    tienSu: {
        noiKhoa: 'CNV 8 năm, Đái tháo đường típ 2 — điều trị tại trạm y tế phường — thuốc: metformin 1000 mg\n'
            + 'CNV 5 năm, Tăng huyết áp — huyết áp tại nhà thường 140/85 mmHg — thuốc: amlodipin 5 mg',
        noiKhoaMoc: [
            { id: 'mau-nk1', n: '8', u: 'năm', s: 'Đái tháo đường típ 2', tt: 'điều trị tại trạm y tế phường, có lúc tự ngưng thuốc', thuoc: 'metformin 1000 mg' },
            { id: 'mau-nk2', n: '5', u: 'năm', s: 'Tăng huyết áp', tt: 'huyết áp tại nhà thường 140/85 mmHg', thuoc: 'amlodipin 5 mg' }
        ],
        ngoaiKhoa: 'Chưa ghi nhận tiền căn phẫu thuật',
        ngoaiKhoaMoc: [],
        diUng: 'Chưa ghi nhận dị ứng thuốc, thức ăn hay thời tiết',
        diUngChiTiet: [],
        thuocDangDung: 'Metformin 1000 mg — 1 viên x 2 lần/ngày (uống sau ăn) — điều trị đái tháo đường típ 2\n'
            + 'Amlodipin 5 mg — 1 viên buổi sáng — điều trị tăng huyết áp',
        thoiQuen: 'Hút thuốc lá 30 gói·năm (20 điếu/ngày từ năm 22 tuổi đến nay); '
            + 'uống bia 1–2 lần/tuần, mỗi lần 2 lon 330 ml; không dùng chất kích thích khác',
        thuocLa: { dieuMoiNgay: '20', tuTuoi: '22', denTuoi: '62' },
        ruou: { thucUong: 'Bia lon 330 ml (5%)', soLuongMoiLan: '2', tanSuat: '1.5', dungTich: '330', doCon: '5', tuTuoi: '25', denTuoi: '62' },
        giaDinh: 'Cha mất năm 70 tuổi vì tai biến mạch máu não; mẹ 84 tuổi còn sống, đái tháo đường típ 2 phát hiện năm 60 tuổi; '
            + 'chưa ghi nhận lao phổi trong gia đình',
        giaDinhChiTiet: [
            { id: 'mau-gd1', qh: 'Cha', benh: 'Tai biến mạch máu não', tuoi: '70', n: '', u: 'năm', song: 'đã mất', doBenh: 'mất năm 70 tuổi' },
            { id: 'mau-gd2', qh: 'Mẹ', benh: 'Đái tháo đường típ 2', tuoi: '60', n: '24', u: 'năm', song: 'còn sống', doBenh: 'đang uống thuốc, kiểm soát tạm ổn' }
        ],
        moiTruong: 'Làm thợ hồ 30 năm, thường xuyên hít bụi xi măng, không dùng khẩu trang bảo hộ',
        phoiNhiem: {
            ngheNghiep: 'Bụi xi măng, bụi đá trong 30 năm làm thợ hồ',
            vungDich: 'Không đi vùng có dịch trong 1 tháng qua',
            nguoiBenh: 'Không tiếp xúc người ho kéo dài, không tiếp xúc người mắc lao',
            dongVat: 'Không nuôi và không tiếp xúc gia cầm',
            nuocAn: 'Dùng nước máy, ăn chín uống sôi',
            diLai: 'Không đi xa khỏi nơi cư trú trong 3 tháng qua'
        }
    },

    /* ---------- V. LƯỢC QUA CÁC CƠ QUAN ---------- */
    luocQuaCoQuan: {
        timMach: 'Không đau ngực sau xương ức, không hồi hộp, không khó thở kịch phát về đêm, không phù chân',
        hoHap: 'Ho đàm vàng đặc, khó thở khi gắng sức nhẹ, đau ngực phải khi hít sâu; không ho ra máu',
        tieuHoa: 'Ăn kém, không buồn nôn, không nôn, không đau bụng, không tiêu chảy',
        thanKinh: 'Tỉnh táo, không nhức đầu, không chóng mặt, không yếu liệt chi',
        coXuongKhop: 'Đau mỏi cơ toàn thân khi sốt, không sưng đau khớp',
        thanNieu: 'Tiểu vàng trong, không tiểu gắt buốt, không tiểu máu, không tiểu đêm nhiều'
    },

    /* ---------- VI. KHÁM LÂM SÀNG ---------- */
    khamBenh: {
        sinhTon: {
            mach: '96', nhietDo: '38.3', huyetAp: '120/70', nhipTho: '24', spo2: '94',
            chieuCao: '165', canNang: '58', bmi: '', bsa: ''
        },
        glasgow: { e: '4', v: '5', m: '6' },
        roiLoanTriGiac: 'Không',
        tongTrang: 'Bệnh nhân tỉnh, tiếp xúc tốt, GCS 15 điểm. Thể trạng gầy (BMI 21,3 kg/m²). '
            + 'Da niêm hồng nhạt, môi khô nhẹ, lưỡi dơ. Không phù, không xuất huyết dưới da. '
            + 'Tuyến giáp không to, không sờ thấy hạch ngoại vi. Nhiệt độ 38,3°C, chi ấm, mạch quay rõ đều.',
        dauMatCo: 'Đầu cân đối, không u cục. Kết mạc mắt không vàng, không xuất huyết. '
            + 'Họng đỏ nhẹ, amidan không to, không giả mạc. Răng sâu 2 cái hàm dưới, vệ sinh răng miệng kém. '
            + 'Cổ mềm, khí quản không lệch, tĩnh mạch cổ không nổi ở tư thế 45°.',
        nguc: 'Lồng ngực cân đối, di động theo nhịp thở, không sẹo mổ, không biến dạng. '
            + 'Thở nhanh nông 24 lần/phút, có co kéo nhẹ cơ hô hấp phụ vùng cổ. '
            + 'Không tuần hoàn bàng hệ, không rung miu.',
        tim: 'Mỏm tim ở khoang liên sườn V đường trung đòn trái. '
            + 'T1, T2 đều rõ, tần số 96 lần/phút, không âm thổi, không tiếng ngựa phi. '
            + 'Mạch ngoại biên bắt rõ và đều hai bên.',
        phoi: 'Rung thanh tăng vùng đáy phổi phải. Gõ đục từ liên sườn VI trở xuống bên phải. '
            + 'Nghe: ran nổ thì hít vào rải khắp đáy phổi phải, kèm âm phế bào giảm cùng vùng; '
            + 'phổi trái nghe rõ, không ran. Không tiếng cọ màng phổi.',
        bung: 'Bụng mềm, cân đối, di động theo nhịp thở, không sẹo mổ, không tuần hoàn bàng hệ. '
            + 'Sờ nông và sờ sâu đều mềm, không điểm đau khu trú. Gan lách không sờ chạm. '
            + 'Nhu động ruột 8 lần/phút. Chạm thận âm tính, rung thận âm tính.',
        thanKinhCoXuongKhop: 'Cổ mềm, không dấu màng não. Không dấu thần kinh khu trú, sức cơ 5/5 bốn chi. '
            + 'Cảm giác nông sâu còn. Các khớp không sưng, không nóng đỏ, vận động trong giới hạn bình thường. '
            + 'Bàn chân hai bên: da khô, không loét, mất cảm giác rung nhẹ đầu ngón (khám bằng âm thoa 128 Hz).'
    },

    /* ---------- XII. KẾT QUẢ CẬN LÂM SÀNG ---------- */
    canLamSang: [
        {
            id: 'mau-cls1', g: 'Huyết học', name: 'Công thức máu', dt: '2026-08-24T08:10',
            items: [
                { n: 'WBC', v: '18.4', u: 'K/µL', lo: 4, hi: 10 },
                { n: 'NEU', v: '88', u: '%', lo: 45, hi: 75 },
                { n: 'LYM', v: '7', u: '%', lo: 20, hi: 40 },
                { n: 'RBC', v: '4.6', u: 'T/L', lo: 4.3, hi: 5.8 },
                { n: 'HGB', v: '134', u: 'g/L', lo: 130, hi: 170 },
                { n: 'HCT', v: '40', u: '%', lo: 40, hi: 50 },
                { n: 'MCV', v: '87', u: 'fL', lo: 80, hi: 100 },
                { n: 'PLT', v: '268', u: 'K/µL', lo: 150, hi: 450 }
            ],
            note: 'Bạch cầu tăng cao ưu thế đa nhân trung tính — phù hợp nhiễm trùng cấp do vi khuẩn.',
            images: []
        },
        {
            id: 'mau-cls2', g: 'Sinh hóa', name: 'Sinh hóa máu cơ bản', dt: '2026-08-24T08:10',
            items: [
                { n: 'Glucose', v: '13.6', u: 'mmol/L', lo: 3.9, hi: 6.4 },
                { n: 'Ure', v: '8.9', u: 'mmol/L', lo: 2.5, hi: 7.5 },
                { n: 'Creatinine', v: '96', u: 'µmol/L', lo: 62, hi: 120 },
                { n: 'eGFR', v: '74', u: 'mL/ph/1.73m²', lo: 90, hi: 99999 },
                { n: 'AST', v: '34', u: 'U/L', lo: 0, hi: 40 },
                { n: 'ALT', v: '29', u: 'U/L', lo: 0, hi: 41 },
                { n: 'Albumin', v: '33', u: 'g/L', lo: 35, hi: 50 },
                { n: 'Na+', v: '132', u: 'mmol/L', lo: 135, hi: 145 },
                { n: 'K+', v: '4.1', u: 'mmol/L', lo: 3.5, hi: 5.1 },
                { n: 'Cl-', v: '99', u: 'mmol/L', lo: 98, hi: 107 },
                { n: 'CRP', v: '164', u: 'mg/L', lo: 0, hi: 5 }
            ],
            note: 'CRP rất cao, Ure tăng nhẹ (1 điểm CURB-65), hạ natri máu nhẹ thường gặp trong viêm phổi. '
                + 'Đường huyết 13,6 mmol/L trên nền đái tháo đường đang mất kiểm soát vì nhiễm trùng.',
            images: []
        },
        {
            id: 'mau-cls3', g: 'Sinh hóa', name: 'Đường huyết – HbA1c', dt: '2026-08-24T08:10',
            items: [
                { n: 'Glucose đói', v: '9.8', u: 'mmol/L', lo: 3.9, hi: 5.5 },
                { n: 'HbA1c', v: '9.4', u: '%', lo: 4, hi: 5.6 }
            ],
            note: 'HbA1c 9,4% — đái tháo đường kiểm soát kém suốt 3 tháng qua, không phải chỉ tăng cấp do stress nhiễm trùng.',
            images: []
        },
        {
            id: 'mau-cls4', g: 'Sinh hóa', name: 'Khí máu động mạch', dt: '2026-08-24T08:20',
            items: [
                { n: 'pH', v: '7.47', u: '', lo: 7.35, hi: 7.45 },
                { n: 'PaCO2', v: '31', u: 'mmHg', lo: 35, hi: 45 },
                { n: 'PaO2', v: '61', u: 'mmHg', lo: 80, hi: 100 },
                { n: 'HCO3-', v: '22.5', u: 'mmol/L', lo: 22, hi: 26 },
                { n: 'SaO2', v: '91', u: '%', lo: 95, hi: 100 },
                { n: 'Lactate', v: '1.6', u: 'mmol/L', lo: 0, hi: 2 }
            ],
            note: 'Lấy lúc thở khí trời: kiềm hô hấp do thở nhanh, giảm oxy máu (PaO2/FiO2 ≈ 290) — '
                + 'suy hô hấp giảm oxy mức nhẹ. Lactate bình thường, chưa có dấu giảm tưới máu mô.',
            images: []
        },
        {
            id: 'mau-cls5', g: 'Chẩn đoán hình ảnh', name: 'X-quang ngực thẳng', dt: '2026-08-24T08:35',
            items: [],
            note: 'Đám mờ không đồng nhất chiếm gần hết thùy dưới phổi phải, bờ không rõ, '
                + 'có hình phế quản hơi bên trong. Góc sườn hoành phải tù nhẹ (dịch lượng ít). '
                + 'Phổi trái sáng bình thường. Bóng tim không to, chỉ số tim/lồng ngực < 0,5. '
                + 'Không thấy hang, không thấy tổn thương đỉnh phổi.',
            images: []
        },
        {
            id: 'mau-cls6', g: 'Khác', name: 'Nhuộm Gram và cấy đàm', dt: '2026-08-24T08:40',
            items: [],
            note: 'Nhuộm Gram: > 25 bạch cầu và < 10 tế bào biểu mô mỗi quang trường — mẫu đàm đạt chuẩn. '
                + 'Thấy song cầu Gram dương xếp đôi. Cấy đàm sau 48 giờ: Streptococcus pneumoniae, '
                + 'còn nhạy penicillin, ceftriaxone, levofloxacin. Cấy máu 2 mẫu: âm tính sau 5 ngày.',
            images: []
        }
    ],

    /* ---------- VII–XI. TÓM TẮT · ĐẶT VẤN ĐỀ · BIỆN LUẬN ---------- */
    tomTatBenhAn: 'Bệnh nhân nam 62 tuổi, tiền căn đái tháo đường típ 2 8 năm điều trị không đều và tăng huyết áp 5 năm, '
        + 'hút thuốc lá 30 gói·năm, vào viện vì sốt và khó thở tăng dần 3 ngày. '
        + 'Qua hỏi bệnh và thăm khám ghi nhận các hội chứng và dấu chứng sau:\n'
        + '• Hội chứng nhiễm trùng: sốt cao 39,2°C kèm lạnh run, môi khô lưỡi dơ, bạch cầu 18,4 K/µL ưu thế neutrophil 88%, CRP 164 mg/L.\n'
        + '• Hội chứng đông đặc phổi phải: ho đàm vàng đặc, đau ngực phải kiểu màng phổi, rung thanh tăng, gõ đục và ran nổ đáy phổi phải.\n'
        + '• Suy hô hấp giảm oxy máu mức nhẹ: thở nhanh 24–26 lần/phút, SpO2 90% khí trời, PaO2 61 mmHg, PaO2/FiO2 ≈ 290.\n'
        + '• Đái tháo đường típ 2 mất kiểm soát: đường huyết 13,6 mmol/L, HbA1c 9,4%.\n'
        + '• Tiền căn: hút thuốc lá 30 gói·năm, phơi nhiễm bụi xi măng 30 năm, tự ngưng thuốc từng đợt.',

    /* Mỗi dòng ở đây phải có một nhánh tương ứng ở mục X, nếu không bộ rà soát
       logic của trang sẽ báo "có vấn đề chưa được biện luận". */
    datVanDe: '1. Hội chứng nhiễm trùng hô hấp dưới cấp kèm đông đặc phổi phải\n'
        + '2. Suy hô hấp giảm oxy máu mức nhẹ\n'
        + '3. Đái tháo đường típ 2 mất kiểm soát trên nền nhiễm trùng cấp',

    bienLuan: {
        vanDe: [
            {
                id: 'mau-vd1',
                ten: 'Hội chứng nhiễm trùng hô hấp dưới cấp kèm đông đặc phổi phải',
                lamSang: [
                    'Sốt cao 39,2°C kèm lạnh run 3 ngày',
                    'Ho đàm vàng đặc lượng nhiều',
                    'Đau ngực phải kiểu màng phổi, tăng khi hít sâu',
                    'Rung thanh tăng, gõ đục, ran nổ đáy phổi phải',
                    'Bạch cầu 18,4 K/µL, NEU 88%, CRP 164 mg/L',
                    'X-quang: đám mờ thùy dưới phổi phải có hình phế quản hơi'
                ],
                amTinh: [
                    'Không ho ra máu',
                    'Không sốt về chiều kéo dài, không đổ mồ hôi đêm',
                    'Không sụt cân kéo dài trước đợt bệnh',
                    'Không tiếp xúc người mắc lao',
                    'Không phù chân, không khó thở kịch phát về đêm',
                    'Trước đợt bệnh leo hai tầng lầu không mệt — phân độ khó thở NYHA I'
                ],
                yeuTo: 'Bệnh khởi phát cấp trong vòng 1 tuần, ngoài bệnh viện, không nằm viện hay dùng kháng sinh '
                    + 'tĩnh mạch trong 90 ngày qua → viêm phổi mắc phải cộng đồng. '
                    + 'Yếu tố thuận lợi: đái tháo đường kiểm soát kém, hút thuốc lá 30 gói·năm, vệ sinh răng miệng kém.',
                redFlags: ['SpO2 90% khí trời', 'Nhịp thở 26 lần/phút lúc nhập viện'],
                nguyenNhan: [
                    {
                        id: 'mau-nn1', ten: 'Viêm phổi cộng đồng do Streptococcus pneumoniae', muc: 'Nghĩ nhiều nhất',
                        lyDo: 'Khởi phát cấp, sốt lạnh run, đàm vàng đặc, đông đặc một thùy điển hình, bạch cầu và CRP tăng cao; '
                            + 'là tác nhân thường gặp nhất ở người lớn có bệnh nền đái tháo đường.',
                        cls: 'Nhuộm Gram và cấy đàm; Cấy máu 2 mẫu trước kháng sinh'
                    },
                    {
                        id: 'mau-nn2', ten: 'Viêm phổi do vi khuẩn không điển hình (Mycoplasma, Chlamydia)', muc: 'Ít nghĩ',
                        lyDo: 'Thường gặp ở người trẻ, khởi phát từ từ, ho khan kéo dài, tổn thương mô kẽ lan tỏa hai bên; '
                            + 'bệnh nhân này đông đặc một thùy rõ, đàm mủ, bạch cầu tăng cao nên ít phù hợp. '
                            + 'Không cần huyết thanh chẩn đoán khi cấy đàm đã ra tác nhân.',
                        cls: ''
                    },
                    {
                        id: 'mau-nn3', ten: 'Lao phổi', muc: 'Cần loại trừ',
                        lyDo: 'Vẫn phải nghĩ tới ở bệnh nhân đái tháo đường tại vùng lưu hành. Tuy nhiên bệnh cấp tính 1 tuần, '
                            + 'không ho ra máu, không sốt chiều kéo dài, không đổ mồ hôi đêm, tổn thương ở thùy dưới chứ không ở đỉnh phổi.',
                        cls: 'AFB đàm – GeneXpert (2 mẫu)'
                    },
                    {
                        id: 'mau-nn4', ten: 'Thuyên tắc phổi kèm nhồi máu phổi', muc: 'Cần loại trừ',
                        lyDo: 'Có đau ngực kiểu màng phổi và giảm oxy máu. Nhưng bệnh nhân sốt cao lạnh run nhiều ngày, '
                            + 'đàm mủ, bạch cầu và CRP tăng cao, không có yếu tố nguy cơ huyết khối, không phù chi dưới một bên.',
                        cls: 'D-dimer; CT động mạch phổi (CT-PA)'
                    }
                ],
                bienChung: [
                    {
                        id: 'mau-bc1', ten: 'Tràn dịch màng phổi phải lượng ít cạnh vùng viêm',
                        lapLuan: 'Góc sườn hoành phải tù nhẹ trên X-quang, âm phế bào giảm cùng vùng. '
                            + 'Lượng ít, chưa có chỉ định chọc dò; siêu âm màng phổi kiểm tra và theo dõi sát.'
                    },
                    {
                        id: 'mau-bc2', ten: 'Suy hô hấp giảm oxy máu mức nhẹ',
                        lapLuan: 'SpO2 90% khí trời, PaO2 61 mmHg, PaO2/FiO2 ≈ 290 — do vùng phổi đông đặc gây shunt trong phổi. '
                            + 'Đáp ứng tốt với oxy kính mũi 3 lít/phút (SpO2 lên 96%) nên là giảm oxy do bất tương xứng thông khí – tưới máu, chưa phải ARDS.'
                    }
                ]
            },
            {
                id: 'mau-vd2',
                ten: 'Đái tháo đường típ 2 mất kiểm soát trên nền nhiễm trùng cấp',
                lamSang: [
                    'Tiền căn đái tháo đường típ 2 8 năm, tự ngưng thuốc từng đợt',
                    'Đường huyết lúc nhập viện 13,6 mmol/L',
                    'HbA1c 9,4%',
                    'Mất cảm giác rung nhẹ đầu ngón chân hai bên'
                ],
                amTinh: [
                    'Không thở nhanh sâu kiểu Kussmaul',
                    'Không buồn nôn, không nôn, không đau bụng',
                    'Ketone niệu âm tính',
                    'Không loét bàn chân, mạch mu chân bắt rõ'
                ],
                yeuTo: 'HbA1c 9,4% chứng minh đường huyết cao kéo dài từ trước chứ không chỉ do stress nhiễm trùng. '
                    + 'Đây vừa là yếu tố thuận lợi gây viêm phổi, vừa là thứ nhiễm trùng làm nặng thêm — cần kiểm soát song song.',
                redFlags: [],
                nguyenNhan: [
                    {
                        id: 'mau-nn5', ten: 'Tăng đường huyết do nhiễm trùng trên nền kiểm soát kém sẵn', muc: 'Nghĩ nhiều nhất',
                        lyDo: 'HbA1c 9,4% cho thấy nền kiểm soát đã kém; nhiễm trùng cấp làm tăng hormone đối kháng insulin đẩy đường huyết lên thêm.',
                        cls: 'Đường huyết đói và HbA1c; Ceton máu / ceton niệu'
                    },
                    {
                        id: 'mau-nn6', ten: 'Nhiễm toan ceton do đái tháo đường', muc: 'Cần loại trừ',
                        lyDo: 'Đường huyết 13,6 mmol/L kèm nhiễm trùng là bối cảnh khởi phát điển hình, nhưng bệnh nhân tỉnh táo, '
                            + 'không thở Kussmaul, pH 7,47 và HCO3- 22,5 mmol/L bình thường, ketone niệu âm tính.',
                        cls: 'Khí máu động mạch; Ceton máu / ceton niệu'
                    }
                ],
                bienChung: [
                    {
                        id: 'mau-bc3', ten: 'Bệnh thần kinh ngoại biên do đái tháo đường',
                        lapLuan: 'Mất cảm giác rung nhẹ đầu ngón chân hai bên đối xứng trên nền bệnh 8 năm kiểm soát kém. '
                            + 'Cần hướng dẫn chăm sóc bàn chân và tầm soát định kỳ.'
                    }
                ]
            }
        ]
    },

    chanDoanSoBoChiTiet: {
        benhChinh: 'Viêm phổi cộng đồng thùy dưới phổi phải',
        mucDo: 'mức độ trung bình, CURB-65 1 điểm',
        bienChung: 'Suy hô hấp giảm oxy máu mức nhẹ, tràn dịch màng phổi phải lượng ít',
        benhKem: 'Đái tháo đường típ 2 mất kiểm soát, tăng huyết áp'
    },
    chanDoanSoBo: 'Viêm phổi cộng đồng thùy dưới phổi phải – mức độ trung bình, CURB-65 1 điểm – '
        + 'Biến chứng: Suy hô hấp giảm oxy máu mức nhẹ, tràn dịch màng phổi phải lượng ít – '
        + 'Bệnh kèm: Đái tháo đường típ 2 mất kiểm soát, tăng huyết áp',

    chanDoanPhanBiet: '1. Lao phổi bội nhiễm\n'
        + '2. Viêm phổi do vi khuẩn không điển hình\n'
        + '3. Ung thư phổi gây viêm phổi tắc nghẽn sau chỗ hẹp (bệnh nhân hút thuốc 30 gói·năm)\n'
        + '\n'
        + 'Có đau ngực cấp và khó thở cấp nên phải loại trừ nhanh các bệnh cảnh nguy hiểm:\n'
        + '4. Thuyên tắc phổi kèm nhồi máu phổi — không yếu tố nguy cơ huyết khối, không phù chi dưới một bên\n'
        + '5. Nhồi máu cơ tim cấp — đau không kiểu đè nặng, không lan, không vã mồ hôi lạnh; ECG và troponin để chốt\n'
        + '6. Bóc tách động mạch chủ ngực — đau không kiểu xé, huyết áp và mạch hai tay đều nhau\n'
        + '7. Tràn khí màng phổi áp lực — không khởi phát đột ngột, gõ đục chứ không gõ vang, khí quản không lệch\n'
        + '8. Phù phổi cấp — trước đợt bệnh gắng sức tốt (NYHA I), không khó thở kịch phát về đêm, '
        + 'không ran ẩm hai đáy phổi, tĩnh mạch cổ không nổi; chờ siêu âm tim đo EF để chốt\n'
        + '9. Sốc phản vệ — không mày đay, không phù mạch, huyết áp không tụt, không liên quan thuốc hay thức ăn',

    bienLuanChanDoan: 'Bệnh nhân nam 62 tuổi vào viện vì sốt và khó thở 3 ngày. Trên lâm sàng có đủ hai nhóm dấu chứng: '
        + 'hội chứng nhiễm trùng (sốt cao lạnh run, môi khô lưỡi dơ, bạch cầu 18,4 K/µL ưu thế neutrophil, CRP 164 mg/L) và '
        + 'hội chứng đông đặc phổi phải (rung thanh tăng, gõ đục, ran nổ đáy phổi phải, X-quang có đám mờ thùy dưới phổi phải '
        + 'kèm hình phế quản hơi). Hai hội chứng cùng xuất hiện cấp tính trong vòng một tuần ở người sống tại cộng đồng, '
        + 'không nằm viện và không dùng kháng sinh tĩnh mạch trong 90 ngày trước, cho phép nghĩ nhiều nhất tới viêm phổi mắc phải cộng đồng.\n\n'
        + 'Về tác nhân, hình ảnh đông đặc một thùy kèm khởi phát đột ngột với cơn lạnh run và đàm vàng đặc là kiểu hình kinh điển '
        + 'của Streptococcus pneumoniae; nhuộm Gram đàm đạt chuẩn thấy song cầu Gram dương và cấy đàm mọc S. pneumoniae đã xác nhận. '
        + 'Vi khuẩn không điển hình ít nghĩ vì bệnh nhân lớn tuổi, bạch cầu tăng cao và tổn thương khu trú một thùy chứ không lan tỏa mô kẽ.\n\n'
        + 'Lao phổi luôn phải đặt ra ở bệnh nhân đái tháo đường trong vùng lưu hành, nhưng diễn tiến chỉ một tuần, không ho ra máu, '
        + 'không sốt chiều kéo dài, không đổ mồ hôi đêm và tổn thương nằm ở thùy dưới chứ không phải đỉnh phổi nên ít phù hợp; '
        + 'sẽ làm AFB đàm và Xpert MTB/RIF nếu sau 72 giờ kháng sinh bệnh nhân không đáp ứng. '
        + 'Thuyên tắc phổi được nghĩ tới vì có đau ngực kiểu màng phổi và giảm oxy máu, nhưng bệnh cảnh nhiễm trùng rầm rộ nhiều ngày, '
        + 'đàm mủ và không có yếu tố nguy cơ huyết khối làm chẩn đoán này khó đứng vững. '
        + 'Ung thư phổi gây viêm phổi tắc nghẽn cần được loại trừ về sau ở người hút thuốc 30 gói·năm bằng X-quang kiểm tra sau 6–8 tuần: '
        + 'nếu đám mờ không tan hết thì phải chụp CT ngực.\n\n'
        + 'Về mức độ nặng, CURB-65 được 1 điểm (Ure 8,9 mmol/L > 7; bệnh nhân tỉnh táo, nhịp thở 24–26 < 30, huyết áp 110/70 không tụt, '
        + 'tuổi 62 < 65) — tương ứng nguy cơ tử vong thấp. Tuy nhiên bệnh nhân có giảm oxy máu (SpO2 90% khí trời, PaO2 61 mmHg) '
        + 'và bệnh nền đái tháo đường mất kiểm soát nên vẫn có chỉ định nhập viện điều trị nội trú thay vì điều trị ngoại trú.\n\n'
        + 'Song song, đái tháo đường típ 2 của bệnh nhân đang mất kiểm soát với HbA1c 9,4% — con số này chứng minh đường huyết đã cao '
        + 'kéo dài từ trước chứ không chỉ tăng nhất thời do nhiễm trùng. Đã loại trừ nhiễm toan ceton nhờ pH 7,47, HCO3- 22,5 mmol/L và '
        + 'ketone niệu âm tính. Trong đợt nằm viện cần chuyển tạm sang insulin và chỉ quay lại metformin khi nhiễm trùng ổn.',

    canLamSangDeNghi: 'Công thức máu — đánh giá mức độ nhiễm trùng\n'
        + 'CRP – Procalcitonin — theo dõi đáp ứng điều trị, phân biệt nhiễm siêu vi\n'
        + 'Sinh hóa máu: Ure – Creatinin máu, ion đồ, AST, ALT, albumin — tính CURB-65 và chỉnh liều thuốc\n'
        + 'Đường huyết đói và HbA1c — đánh giá kiểm soát đái tháo đường\n'
        + 'Khí máu động mạch — xác định mức độ suy hô hấp\n'
        + 'Lactat máu — đánh giá tưới máu mô, tầm soát nhiễm trùng huyết\n'
        + 'X-quang ngực thẳng — xác định vị trí và diện tổn thương\n'
        + 'Nhuộm Gram và cấy đàm — tìm tác nhân\n'
        + 'Cấy máu 2 mẫu trước kháng sinh — tìm vãng khuẩn huyết\n'
        + 'Ceton máu / ceton niệu và ion đồ (theo dõi Kali mỗi 2–4 giờ) — loại trừ nhiễm toan ceton\n'
        + 'Tổng phân tích nước tiểu — tầm soát nhiễm trùng tiểu đi kèm ở bệnh nhân đái tháo đường\n'
        + 'Siêu âm màng phổi — đánh giá lượng dịch bên phải\n'
        + 'ECG 12 chuyển đạo khẩn — bệnh nhân lớn tuổi có đau ngực\n'
        + 'Troponin I/T siêu nhạy (hs-cTn) — loại trừ nhồi máu cơ tim\n'
        + 'NT-proBNP và siêu âm tim — loại trừ phù phổi cấp do tim, đánh giá chức năng thất trái\n'
        + 'D-dimer, và CT động mạch phổi (CT-PA) kèm siêu âm Doppler tĩnh mạch chi dưới nếu D-dimer dương — loại trừ thuyên tắc phổi\n'
        + 'AFB đàm – GeneXpert (2 mẫu) — loại trừ lao phổi nếu sau 72 giờ kháng sinh không đáp ứng',

    ketQuaCanLamSang: 'Xem chi tiết ở mục XII — Kết quả cận lâm sàng (6 phiếu). Tóm tắt các bất thường chính:\n'
        + '• Bạch cầu 18,4 K/µL (NEU 88%), CRP 164 mg/L — nhiễm trùng cấp do vi khuẩn.\n'
        + '• Ure 8,9 mmol/L, Na+ 132 mmol/L, Albumin 33 g/L.\n'
        + '• Glucose 13,6 mmol/L, HbA1c 9,4%.\n'
        + '• Khí máu khí trời: pH 7,47 – PaCO2 31 – PaO2 61 – SaO2 91%.\n'
        + '• X-quang: đám mờ thùy dưới phổi phải có hình phế quản hơi, góc sườn hoành phải tù nhẹ.\n'
        + '• Cấy đàm: Streptococcus pneumoniae nhạy ceftriaxone; cấy máu âm tính.',

    /* ---------- XIII–XV. CHẨN ĐOÁN XÁC ĐỊNH · ĐIỀU TRỊ · TIÊN LƯỢNG ---------- */
    chanDoanXacDinhChiTiet: {
        benhChinh: 'Viêm phổi cộng đồng thùy dưới phổi phải do Streptococcus pneumoniae',
        mucDo: 'mức độ trung bình, CURB-65 1 điểm',
        bienChung: 'Suy hô hấp giảm oxy máu mức nhẹ, tràn dịch màng phổi phải lượng ít',
        benhKem: 'Đái tháo đường típ 2 mất kiểm soát (HbA1c 9,4%), tăng huyết áp'
    },
    chanDoanXacDinh: 'Viêm phổi cộng đồng thùy dưới phổi phải do Streptococcus pneumoniae – '
        + 'mức độ trung bình, CURB-65 1 điểm – '
        + 'Biến chứng: Suy hô hấp giảm oxy máu mức nhẹ, tràn dịch màng phổi phải lượng ít – '
        + 'Bệnh kèm: Đái tháo đường típ 2 mất kiểm soát (HbA1c 9,4%), tăng huyết áp',

    huongDieuTri: '1. Kháng sinh đường tĩnh mạch sớm trong giờ đầu, sau khi đã lấy cấy máu và cấy đàm; '
        + 'xuống thang sang đường uống khi hết sốt 48 giờ và ăn uống được.\n'
        + '2. Hỗ trợ hô hấp: thở oxy kính mũi giữ SpO2 92–96%, giảm dần khi cải thiện.\n'
        + '3. Kiểm soát đường huyết bằng insulin trong đợt cấp, mục tiêu 7,8–10 mmol/L; ngưng metformin tạm thời.\n'
        + '4. Bù dịch, hạ sốt, vỗ lưng long đàm, vận động sớm tại giường.\n'
        + '5. Duy trì thuốc huyết áp đang dùng, theo dõi huyết áp mỗi ngày.\n'
        + '6. Tư vấn cai thuốc lá và tiêm ngừa phế cầu, cúm trước khi ra viện.',

    yLenhThuoc: [
        { id: 'mau-rx1', ten: 'Ceftriaxone', hamLuong: '1 g', lieu: '1 lọ', soLan: '2 lần/ngày', duong: '(TMC)', gio: '8h – 20h' },
        { id: 'mau-rx2', ten: 'Azithromycin', hamLuong: '500 mg', lieu: '1 viên', soLan: '1 lần/ngày', duong: '(uống)', gio: '9h' },
        { id: 'mau-rx3', ten: 'Insulin glargine', hamLuong: '100 UI/mL', lieu: '14 UI', soLan: '1 lần/ngày', duong: '(TDD)', gio: '21h' },
        { id: 'mau-rx4', ten: 'Insulin aspart', hamLuong: '100 UI/mL', lieu: '4 UI', soLan: '3 lần/ngày', duong: '(TDD)', gio: 'trước 3 bữa ăn' },
        { id: 'mau-rx5', ten: 'Paracetamol', hamLuong: '500 mg', lieu: '1 viên', soLan: 'khi sốt > 38,5°C', duong: '(uống)', gio: 'cách nhau ≥ 6 giờ' },
        { id: 'mau-rx6', ten: 'Amlodipin', hamLuong: '5 mg', lieu: '1 viên', soLan: '1 lần/ngày', duong: '(uống)', gio: '8h' },
        { id: 'mau-rx7', ten: 'NaCl 0,9%', hamLuong: '500 mL', lieu: '1 chai', soLan: '2 chai/ngày', duong: '(TTM)', gio: 'XX giọt/phút' },
        { id: 'mau-rx8', ten: 'Metformin', hamLuong: '1000 mg', lieu: 'TẠM NGƯNG trong đợt nhiễm trùng cấp', soLan: 'dùng lại khi hết sốt và ăn uống được', duong: '', gio: '' }
    ],
    dieuTriCuThe: '1. Ceftriaxone 1 g 1 lọ x 2 lần/ngày (TMC) 8h – 20h\n'
        + '2. Azithromycin 500 mg 1 viên x 1 lần/ngày (uống) 9h\n'
        + '3. Insulin glargine 100 UI/mL 14 UI x 1 lần/ngày (TDD) 21h\n'
        + '4. Insulin aspart 100 UI/mL 4 UI x 3 lần/ngày (TDD) trước 3 bữa ăn\n'
        + '5. Paracetamol 500 mg 1 viên x khi sốt > 38,5°C (uống) cách nhau ≥ 6 giờ\n'
        + '6. Amlodipin 5 mg 1 viên x 1 lần/ngày (uống) 8h\n'
        + '7. NaCl 0,9% 500 mL 1 chai x 2 chai/ngày (TTM) XX giọt/phút\n'
        + '8. Metformin 1000 mg TẠM NGƯNG trong đợt nhiễm trùng cấp x dùng lại khi hết sốt và ăn uống được',

    tienLuong: 'Tiên lượng gần: tốt. CURB-65 1 điểm ứng với nguy cơ tử vong thấp; bệnh nhân hết sốt sau 48 giờ, '
        + 'SpO2 khí trời trở lại 95%, bạch cầu và CRP đang giảm — đáp ứng đúng với kháng sinh theo kháng sinh đồ. '
        + 'Dự kiến đủ tiêu chuẩn xuất viện sau 5–7 ngày.\n\n'
        + 'Tiên lượng xa: dè dặt vừa. Bệnh nhân còn ba yếu tố kéo nguy cơ tái phát lên: đái tháo đường HbA1c 9,4% '
        + 'với thói quen tự ngưng thuốc, hút thuốc lá 30 gói·năm, và 30 năm phơi nhiễm bụi xi măng. '
        + 'Nếu không kiểm soát được đường huyết và không cai thuốc lá thì nguy cơ viêm phổi tái phát và bệnh phổi tắc nghẽn mạn tính là đáng kể.\n\n'
        + 'Dự phòng: cai thuốc lá; tiêm ngừa phế cầu và cúm hằng năm; tái khám nội tiết trong 2 tuần để chỉnh thuốc hạ đường huyết; '
        + 'chụp X-quang ngực kiểm tra sau 6–8 tuần để chắc chắn đám mờ tan hết — nếu còn tồn tại phải chụp CT ngực tìm tổn thương bên dưới.',

    /* ---------- THEO DÕI ---------- */
    theoDoi: [
        {
            id: 'mau-td1', dt: '2026-08-24T20:00',
            m: '104', ha: '115/70', t: '38.6', nt: '24', spo2: '95',
            trieuChung: [
                { ten: 'Sốt', tt: 'giảm', note: 'còn 38,6°C sau paracetamol' },
                { ten: 'Khó thở', tt: 'giảm', note: 'nằm đầu cao vẫn dễ chịu' },
                { ten: 'Ho đàm vàng', tt: 'như cũ', note: 'lượng còn nhiều' }
            ],
            dienTien: 'Sau 12 giờ kháng sinh, bệnh nhân bớt lạnh run, ăn được nửa chén cháo. SpO2 95% với oxy kính mũi 3 lít/phút.',
            xuTri: 'Tiếp tục y lệnh. Đường huyết mao mạch 4 lần/ngày. Giữ oxy 3 lít/phút.'
        },
        {
            id: 'mau-td2', dt: '2026-08-25T07:30',
            m: '96', ha: '120/72', t: '38.0', nt: '22', spo2: '96',
            trieuChung: [
                { ten: 'Sốt', tt: 'giảm', note: 'cao nhất 38,0°C trong đêm' },
                { ten: 'Khó thở', tt: 'giảm', note: 'ngồi dậy đánh răng không mệt' },
                { ten: 'Ho đàm vàng', tt: 'giảm', note: 'đàm loãng hơn' }
            ],
            dienTien: 'Ngày thứ 2: đáp ứng lâm sàng rõ. Đường huyết mao mạch 9,2 – 11,4 mmol/L. SpO2 96% với oxy 2 lít/phút.',
            xuTri: 'Giảm oxy còn 2 lít/phút. Tăng insulin glargine lên 16 UI. Tiếp tục kháng sinh.'
        },
        {
            id: 'mau-td3', dt: '2026-08-26T07:30',
            m: '86', ha: '125/75', t: '37.0', nt: '19', spo2: '95',
            trieuChung: [
                { ten: 'Sốt', tt: 'hết', note: 'hết sốt 24 giờ' },
                { ten: 'Khó thở', tt: 'hết', note: 'đi lại trong phòng bình thường' },
                { ten: 'Ho đàm vàng', tt: 'giảm', note: 'đàm trắng loãng, ít' }
            ],
            dienTien: 'Ngày thứ 3: hết sốt 24 giờ, cai được oxy (SpO2 95% khí trời), ăn hết một chén cháo. '
                + 'Cấy đàm về S. pneumoniae nhạy ceftriaxone. Bạch cầu 11,2 K/µL, CRP 62 mg/L.',
            xuTri: 'Ngưng oxy. Ngưng azithromycin (đã có tác nhân). Dự kiến xuống thang sang kháng sinh uống ngày mai. '
                + 'Tư vấn cai thuốc lá và hẹn tiêm ngừa phế cầu trước ra viện.'
        }
    ],

    /* ---------- Khối đặc thù chuyên khoa Nội ---------- */
    dacThu: {
        'noi-benh': 'Đái tháo đường típ 2',
        'noi-nam': '2018',
        'noi-noikham': 'Trạm y tế phường, tái khám mỗi 2–3 tháng nhưng hay bỏ hẹn',
        'noi-tuanthu': 'uống không đều, khi nhớ khi quên',
        'noi-kiemsoat': 'HbA1c 9,4%; đường huyết đói tại nhà thường 9–11 mmol/L',
        'noi-nhapvien': '0',
        'noi-bienchung': 'Bệnh thần kinh ngoại biên (mất cảm giác rung đầu ngón chân hai bên)',
        'noi-yeuto': 'hút thuốc lá, tăng huyết áp'
    },

    /* Trả lời "mục này có cần hỏi không" — để trang cụp sẵn những khối không liên quan */
    hoiCo: {
        chanThuong: 'khong',
        benhNen: 'co',
        benhMan: 'co',
        thuocNha: 'co',
        diUng: 'khong',
        ngoaiKhoa: 'khong',
        truocMo: 'khong',
        phoiNhiem: 'co',
        hutThuoc: 'co',
        ruouBia: 'co',
        giaDinh: 'co',
        daMo: 'khong'
    },

    anhKham: [],
    anhHoSo: [],
    chanThuong: { xuongGay: [], bongVung: [] },
    phanDo: {}
};

/** Bản sao mới mỗi lần gọi — trang viết sẽ sửa thẳng lên object khi người dùng gõ */
export const benhAnMau = () => JSON.parse(JSON.stringify(rec));
