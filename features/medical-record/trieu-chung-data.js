// trieu-chung-data.js — thư viện triệu chứng thường gặp kèm bộ thuộc tính cần khai thác.
//
// Mỗi triệu chứng: tên, nhóm, và các câu hỏi cần hỏi cho đủ ý. Kiểu câu hỏi:
//   ['key', 'Nhãn', [danh sách chọn]]  -> ô chọn (vẫn gõ tay được)
//   ['key', 'Nhãn', null, 'gợi ý']     -> ô chữ tự do
// tpl(f) ghép các ý đã điền thành một câu mô tả hoàn chỉnh.

import { searchList, fold } from './tim-kiem.js';

const join = (parts) => parts.filter(Boolean).join(', ');

/** Câu mô tả mặc định: "<tên>: ý 1, ý 2…" */
const basic = (ten) => (f, fields) =>
    `${ten}${fields.map(([k]) => f(k)).some(Boolean) ? ': ' + join(fields.map(([k]) => f(k))) : ''}`;

export const NHOM = ['Toàn thân', 'Hô hấp', 'Tim mạch', 'Tiêu hóa', 'Tiết niệu – sinh dục',
    'Thần kinh', 'Cơ xương khớp', 'Da – niêm', 'Tai – mũi – họng', 'Mắt',
    'Nội tiết – chuyển hóa', 'Huyết học', 'Tâm thần', 'Sản phụ khoa', 'Nhi khoa'];

/* Biểu tượng + màu của từng hệ cơ quan. Khai ở module lá này (nó không import
   thứ gì của trang) để bảng chọn triệu chứng, lưới hệ cơ quan ở màn Toàn cảnh và
   mọi chip gợi ý cùng lấy một bộ — "Tim mạch" ở đâu cũng là quả tim đỏ. */
export const HE = {
    'Toàn thân': ['fa-person', '#8b5cf6'],
    'Hô hấp': ['fa-lungs', '#0ea5e9'],
    'Tim mạch': ['fa-heart-pulse', '#ef4444'],
    'Tiêu hóa': ['fa-bowl-food', '#f59e0b'],
    'Tiết niệu – sinh dục': ['fa-droplet', '#06b6d4'],
    'Thần kinh': ['fa-brain', '#a855f7'],
    'Cơ xương khớp': ['fa-bone', '#64748b'],
    'Da – niêm': ['fa-hand-dots', '#f472b6'],
    'Tai – mũi – họng': ['fa-ear-listen', '#14b8a6'],
    'Mắt': ['fa-eye', '#3b82f6'],
    'Nội tiết – chuyển hóa': ['fa-flask', '#10b981'],
    'Huyết học': ['fa-vial', '#dc2626'],
    'Tâm thần': ['fa-face-meh', '#7c3aed'],
    'Sản phụ khoa': ['fa-baby', '#ec4899'],
    'Nhi khoa': ['fa-child-reaching', '#f97316']
};
export const heIcon = (nhom) => HE[nhom]?.[0] || 'fa-notes-medical';
export const heMau = (nhom) => HE[nhom]?.[1] || '#8b8496';

export const SYMPTOMS = [
    /* ---------------- Toàn thân ---------------- */
    {
        ten: 'Sốt', nhom: 'Toàn thân', fields: [
            ['kieu', 'Kiểu sốt', ['sốt liên tục', 'sốt từng cơn', 'sốt về chiều', 'sốt dao động', 'sốt nhẹ']],
            ['nhietDo', 'Nhiệt độ cao nhất', null, 'vd 39,5°C'],
            ['lanhRun', 'Kèm lạnh run', ['có lạnh run', 'không lạnh run']],
            ['dapUng', 'Đáp ứng hạ sốt', ['giảm sau hạ sốt rồi tái phát', 'không đáp ứng thuốc hạ sốt', 'hết sau hạ sốt']],
            ['thoiGian', 'Thời gian – tần suất', null, 'vd 3–4 cơn/ngày, kéo dài 5 ngày']
        ]
    },
    {
        ten: 'Mệt mỏi – suy nhược', nhom: 'Toàn thân', fields: [
            ['mucDo', 'Mức độ', ['nhẹ, vẫn sinh hoạt được', 'phải nghỉ ngơi nhiều', 'nằm tại giường']],
            ['dienTien', 'Diễn tiến', ['tăng dần', 'từng đợt', 'không đổi']]
        ]
    },
    {
        ten: 'Sụt cân', nhom: 'Toàn thân', fields: [
            ['soKg', 'Sụt bao nhiêu', null, 'vd 4 kg/tháng (64 → 60 kg)'],
            ['anUong', 'Ăn uống', ['chán ăn', 'ăn bình thường', 'ăn nhiều hơn']],
            ['keyTheo', 'Kèm theo', ['vã mồ hôi đêm', 'sốt kéo dài', 'không kèm gì khác']]
        ]
    },
    {
        ten: 'Vã mồ hôi đêm', nhom: 'Toàn thân', fields: [
            ['mucDo', 'Mức độ', ['ướt áo', 'nhẹ']],
            ['tanSuat', 'Tần suất', null, 'vd gần như mỗi đêm, 2 tuần nay']
        ]
    },
    {
        ten: 'Phù', nhom: 'Toàn thân', fields: [
            ['viTri', 'Vị trí', ['hai chi dưới', 'mặt', 'toàn thân', 'một bên chi']],
            ['tinhChat', 'Tính chất', ['ấn lõm', 'ấn không lõm', 'phù trắng mềm']],
            ['thoiDiem', 'Thời điểm rõ nhất', ['buổi sáng', 'cuối ngày', 'cả ngày']]
        ]
    },

    /* ---------------- Hô hấp ---------------- */
    {
        ten: 'Ho', nhom: 'Hô hấp', fields: [
            ['kieu', 'Kiểu ho', ['ho khan', 'ho có đàm', 'ho từng cơn', 'ho khạc đàm kéo dài']],
            ['dam', 'Tính chất đàm', ['đàm trắng trong', 'đàm vàng đục', 'đàm xanh', 'đàm có máu', 'đàm bọt hồng']],
            ['luong', 'Lượng đàm', null, 'vd khoảng 1/2 chén/ngày'],
            ['thoiDiem', 'Thời điểm', ['về đêm', 'sáng sớm', 'cả ngày', 'khi gắng sức']],
            ['thoiGian', 'Kéo dài', null, 'vd 5 ngày']
        ]
    },
    {
        ten: 'Khó thở', nhom: 'Hô hấp', fields: [
            ['hoanCanh', 'Hoàn cảnh', ['khi gắng sức', 'cả khi nghỉ', 'khi nằm (khó thở nằm)', 'kịch phát về đêm']],
            ['mucDo', 'Mức độ', ['NYHA I', 'NYHA II', 'NYHA III', 'NYHA IV', 'mMRC 1', 'mMRC 2', 'mMRC 3', 'mMRC 4']],
            ['khoiPhat', 'Khởi phát', ['đột ngột', 'tăng dần']],
            ['kemTheo', 'Kèm theo', ['khò khè', 'đau ngực', 'ho', 'tím môi']]
        ]
    },
    {
        ten: 'Đau ngực kiểu màng phổi', nhom: 'Hô hấp', fields: [
            ['viTri', 'Vị trí', ['ngực phải', 'ngực trái', 'sau xương ức', 'hai bên']],
            ['lienQuan', 'Liên quan', ['tăng khi hít sâu', 'tăng khi ho', 'giảm khi nằm nghiêng về bên đau']],
            ['mucDo', 'Mức độ đau', null, 'vd 6/10']
        ]
    },
    {
        ten: 'Chấn thương ngực', nhom: 'Hô hấp', fields: [
            ['coChe', 'Cơ chế', ['tai nạn giao thông', 'té cao', 'vật nặng đè ép ngực', 'bị đánh – va đập trực tiếp', 'sóng nổ']],
            ['viTri', 'Vùng va đập', ['ngực phải', 'ngực trái', 'xương ức', 'ngực hai bên', 'ngực – bụng']],
            ['thoiDiem', 'Cách nhập viện bao lâu', null, 'vd 3 giờ trước nhập viện'],
            ['triGiac', 'Tri giác sau tai nạn', ['tỉnh hoàn toàn', 'choáng váng thoáng qua', 'ngất – quên lúc tai nạn']],
            ['soCuu', 'Xử trí tuyến trước', ['chưa xử trí gì', 'băng ép – cố định', 'thở oxy', 'đã đặt dẫn lưu màng phổi', 'truyền dịch – giảm đau']],
            ['kemTheo', 'Kèm theo', ['khó thở tăng dần', 'ho ra máu', 'lép bép dưới da', 'chấn thương nơi khác']]
        ]
    },
    {
        ten: 'Vết thương vùng ngực', nhom: 'Hô hấp', fields: [
            ['tacNhan', 'Tác nhân', ['dao – vật nhọn', 'mảnh kính', 'đạn – hỏa khí', 'vật nhọn đâm khi té']],
            ['viTri', 'Vị trí vết thương', ['vùng trước tim (tam giác nguy hiểm)', 'ngực phải', 'ngực trái', 'vùng nách', 'ngực – bụng (nghi thấu cơ hoành)']],
            ['phiPho', 'Khí ra vào phì phò', ['có, nghe rõ tiếng khí', 'không']],
            ['chayMau', 'Chảy máu', ['rỉ ít', 'chảy nhiều thấm băng', 'phun thành tia']],
            ['thoiDiem', 'Cách nhập viện bao lâu', null, 'vd 45 phút trước nhập viện'],
            ['soCuu', 'Xử trí tuyến trước', ['băng kín vết thương', 'băng van 3 cạnh', 'chưa xử trí gì', 'đã dẫn lưu màng phổi']]
        ]
    },
    {
        ten: 'Lép bép khí dưới da', nhom: 'Hô hấp', fields: [
            ['viTri', 'Vị trí', ['thành ngực bên tổn thương', 'lan lên cổ – mặt', 'lan xuống bụng']],
            ['dienTien', 'Diễn tiến', ['lan rộng nhanh trong vài giờ', 'không đổi', 'đang giảm dần']],
            ['kemTheo', 'Kèm theo', ['khó thở tăng', 'đau ngực', 'khàn tiếng', 'nuốt vướng']]
        ]
    },
    {
        ten: 'Ho ra máu', nhom: 'Hô hấp', fields: [
            ['luong', 'Lượng', ['dây máu trong đàm', 'vài mL', 'khoảng 50 mL', 'trên 100 mL/24 giờ']],
            ['mauSac', 'Màu sắc', ['đỏ tươi', 'đỏ sẫm', 'lẫn đàm mủ']],
            ['soLan', 'Số lần', null, 'vd 3 lần trong 2 ngày']
        ]
    },

    /* ---------------- Tim mạch ---------------- */
    {
        ten: 'Đau ngực', nhom: 'Tim mạch', fields: [
            ['viTri', 'Vị trí', ['sau xương ức', 'ngực trái', 'thượng vị', 'vùng trước tim']],
            ['tinhChat', 'Tính chất', ['đè nặng', 'bóp nghẹt', 'nóng rát', 'nhói', 'như dao đâm']],
            ['lan', 'Hướng lan', ['lan tay trái', 'lan hàm', 'lan sau lưng', 'không lan']],
            ['mucDo', 'Mức độ', null, 'vd 7/10'],
            ['thoiGian', 'Kéo dài mỗi cơn', null, 'vd 10 phút'],
            ['yeuTo', 'Yếu tố tăng / giảm', ['tăng khi gắng sức, giảm khi nghỉ', 'giảm khi ngậm nitrat', 'không đổi khi nghỉ']]
        ]
    },
    {
        ten: 'Hồi hộp – đánh trống ngực', nhom: 'Tim mạch', fields: [
            ['kieu', 'Kiểu', ['từng cơn', 'liên tục', 'khi gắng sức', 'khi nghỉ']],
            ['thoiGian', 'Kéo dài', null, 'vd vài phút mỗi cơn'],
            ['kemTheo', 'Kèm theo', ['chóng mặt', 'khó thở', 'vã mồ hôi', 'ngất']]
        ]
    },
    {
        ten: 'Đau cách hồi', nhom: 'Tim mạch', fields: [
            ['viTri', 'Vị trí', ['bắp chân', 'đùi', 'mông', 'hai bên mông – đùi (nghi hội chứng Leriche)']],
            ['quangDuong', 'Đi được bao xa', null, 'vd khoảng 100 m thì phải nghỉ 3–5 phút'],
            ['dienTien', 'Diễn tiến', ['quãng đường đi được ngắn dần', 'ổn định nhiều tháng nay', 'đã đau cả khi nghỉ và về đêm (Fontaine III)']],
            ['kemTheo', 'Kèm theo', ['lạnh – tê bàn chân', 'rụng lông, móng dày sọc', 'loét – hoại tử đầu ngón (Fontaine IV)', 'rối loạn cương (hội chứng Leriche)', 'không kèm gì khác']]
        ]
    },
    {
        ten: 'Đau chi cấp – mất mạch', nhom: 'Tim mạch', fields: [
            ['viTri', 'Chi nào', ['cẳng – bàn chân phải', 'cẳng – bàn chân trái', 'cẳng – bàn tay phải', 'cẳng – bàn tay trái']],
            ['khoiPhat', 'Khởi phát', ['đột ngột khi đang nghỉ', 'sau chấn thương – vết thương', 'nặng dần trên nền đau cách hồi']],
            ['gioThu', 'Giờ thứ mấy của thiếu máu', null, 'vd giờ thứ 5 (thời gian vàng < 6 giờ)'],
            ['dau6P', 'Dấu 6P đã có', ['đau (Pain)', 'tái nhợt (Pallor)', 'mất mạch (Pulselessness)', 'lạnh chi (Poikilothermia)', 'tê – dị cảm (Paresthesia)', 'liệt vận động (Paralysis)']],
            ['vanDong', 'Vận động – cảm giác', ['còn cử động và cảm giác bình thường', 'tê bì nhưng còn cử động', 'mất cảm giác kèm liệt vận động — chi đe dọa nặng']]
        ]
    },
    {
        ten: 'Nặng chân – giãn tĩnh mạch', nhom: 'Tim mạch', fields: [
            ['viTri', 'Chân nào', ['chân phải', 'chân trái', 'hai chân']],
            ['thoiDiem', 'Nặng nhất khi nào', ['cuối ngày, sau khi đứng lâu', 'ban đêm kèm chuột rút', 'cả ngày']],
            ['gianTM', 'Tĩnh mạch nổi', ['giãn mạng nhện', 'búi giãn ngoằn ngoèo mặt trong cẳng chân', 'giãn cả đùi và cẳng chân']],
            ['kemTheo', 'Kèm theo', ['phù cổ chân về chiều', 'sạm da – chàm ứ trệ quanh mắt cá trong', 'loét cẳng chân đáy ẩm ít đau', 'không kèm gì khác']],
            ['giamKhi', 'Giảm khi', ['gác chân cao', 'mang vớ áp lực', 'không giảm']]
        ]
    },
    {
        ten: 'Sưng đau bắp chân một bên', nhom: 'Tim mạch', fields: [
            ['viTri', 'Bên nào', ['bắp chân phải', 'bắp chân trái']],
            ['chuVi', 'Chênh chu vi so với bên lành', null, 'vd hơn 3 cm, đo cách lồi củ chày 10 cm'],
            ['tinhChat', 'Tính chất', ['căng tức, đau khi bóp bắp chân', 'nóng đỏ', 'phù ấn lõm', 'nổi tĩnh mạch nông bàng hệ']],
            ['yeuTo', 'Yếu tố thúc đẩy', ['nằm bất động dài ngày', 'sau phẫu thuật – bó bột', 'sau chuyến đi xa', 'đang điều trị ung thư', 'thuốc ngừa thai – thai kỳ']]
        ]
    },
    {
        ten: 'Phù áo khoác – sưng mặt cổ', nhom: 'Tim mạch', fields: [
            ['viTri', 'Vùng sưng', ['mặt và mi mắt', 'cổ', 'nửa trên ngực và hai tay']],
            ['thoiDiem', 'Rõ nhất khi', ['buổi sáng vừa ngủ dậy', 'khi cúi người', 'cả ngày']],
            ['dienTien', 'Diễn tiến', ['tăng dần vài tuần', 'đột ngột vài ngày']],
            ['kemTheo', 'Kèm theo', ['tĩnh mạch cổ nổi to', 'tuần hoàn bàng hệ ngực trước', 'nhức đầu – nặng đầu', 'khàn tiếng', 'khó thở khi nằm']]
        ]
    },
    {
        ten: 'Khối đập theo nhịp mạch', nhom: 'Tim mạch', fields: [
            ['viTri', 'Vị trí', ['quanh rốn – bụng giữa', 'vùng bẹn', 'khoeo chân', 'vùng cổ', 'ngay vết thương cũ']],
            ['kichThuoc', 'Kích thước ước lượng', null, 'vd khoảng 6 cm, giãn nở theo hai bên'],
            ['dau', 'Đau', ['không đau, tình cờ phát hiện', 'đau âm ỉ', 'đau dữ dội mới xuất hiện — dọa vỡ']],
            ['dienTien', 'Diễn tiến', ['to dần nhiều tháng', 'không đổi', 'to nhanh trong vài ngày']],
            ['kemTheo', 'Kèm theo', ['nghe âm thổi tại khối', 'sờ rung miu', 'tê – thiếu máu chi cùng bên', 'không kèm gì khác']]
        ]
    },

    /* ---------------- Tiêu hóa ---------------- */
    {
        ten: 'Đau bụng', nhom: 'Tiêu hóa', fields: [
            ['viTri', 'Vị trí', ['thượng vị', 'hạ sườn phải', 'hố chậu phải', 'hố chậu trái', 'quanh rốn', 'hạ vị', 'khắp bụng']],
            ['tinhChat', 'Tính chất', ['âm ỉ', 'quặn từng cơn', 'đau dữ dội', 'nóng rát']],
            ['lan', 'Hướng lan', ['lan sau lưng', 'lan vai phải', 'lan bẹn', 'không lan']],
            ['mucDo', 'Mức độ', null, 'vd 8/10'],
            ['lienQuan', 'Liên quan', ['tăng sau ăn', 'giảm sau ăn', 'tăng khi đói', 'không liên quan bữa ăn']],
            ['kemTheo', 'Kèm theo', ['buồn nôn – nôn', 'sốt', 'tiêu chảy', 'bí trung đại tiện']]
        ]
    },
    {
        ten: 'Nôn ói', nhom: 'Tiêu hóa', fields: [
            ['soLan', 'Số lần', null, 'vd 5 lần/ngày'],
            ['chatNon', 'Chất nôn', ['thức ăn cũ', 'dịch vàng', 'dịch xanh', 'máu đỏ', 'máu bầm như bã cà phê']],
            ['lienQuan', 'Liên quan', ['sau ăn', 'buổi sáng', 'kèm đau đầu']]
        ]
    },
    {
        ten: 'Tiêu chảy', nhom: 'Tiêu hóa', fields: [
            ['soLan', 'Số lần', null, 'vd 6 lần/ngày'],
            ['tinhChat', 'Tính chất phân', ['phân lỏng nước', 'phân nhầy', 'phân có máu', 'phân sống']],
            ['kemTheo', 'Kèm theo', ['đau quặn bụng', 'sốt', 'mót rặn', 'nôn ói']]
        ]
    },
    {
        ten: 'Tiêu phân đen', nhom: 'Tiêu hóa', fields: [
            ['soLan', 'Số lần', null, 'vd 2 lần/ngày, 3 ngày nay'],
            ['tinhChat', 'Tính chất', ['phân đen sệt như hắc ín', 'phân đen lẫn máu đỏ']],
            ['kemTheo', 'Kèm theo', ['đau thượng vị', 'chóng mặt', 'dùng NSAID trước đó']]
        ]
    },
    {
        ten: 'Vàng da – vàng mắt', nhom: 'Tiêu hóa', fields: [
            ['mucDo', 'Mức độ', ['nhẹ', 'trung bình', 'đậm']],
            ['dienTien', 'Diễn tiến', ['tăng dần', 'dao động', 'xuất hiện đột ngột']],
            ['kemTheo', 'Kèm theo', ['ngứa', 'nước tiểu sẫm màu', 'phân bạc màu', 'sốt lạnh run', 'đau hạ sườn phải']]
        ]
    },
    {
        ten: 'Chán ăn – đầy bụng', nhom: 'Tiêu hóa', fields: [
            ['bieuHien', 'Biểu hiện', ['ăn mau no', 'đầy hơi sau ăn', 'buồn nôn khi ăn']],
            ['thoiGian', 'Kéo dài', null, 'vd 1 tháng nay']
        ]
    },

    /* ---------------- Tiết niệu – sinh dục ---------------- */
    {
        ten: 'Tiểu gắt buốt', nhom: 'Tiết niệu – sinh dục', fields: [
            ['bieuHien', 'Biểu hiện', ['buốt cuối dòng', 'buốt suốt dòng', 'tiểu lắt nhắt']],
            ['kemTheo', 'Kèm theo', ['tiểu đục', 'tiểu máu', 'sốt', 'đau hông lưng']]
        ]
    },
    {
        ten: 'Tiểu máu', nhom: 'Tiết niệu – sinh dục', fields: [
            ['thoiDiem', 'Thời điểm', ['đầu dòng', 'cuối dòng', 'toàn dòng']],
            ['mauSac', 'Màu sắc', ['đỏ tươi', 'đỏ sẫm', 'như nước rửa thịt']],
            ['kemTheo', 'Kèm theo', ['đau quặn thận', 'không đau', 'sốt']]
        ]
    },
    {
        ten: 'Thay đổi lượng nước tiểu', nhom: 'Tiết niệu – sinh dục', fields: [
            ['huong', 'Thay đổi', ['tiểu ít (thiểu niệu)', 'vô niệu', 'tiểu nhiều', 'tiểu đêm nhiều lần']],
            ['soLuong', 'Ước lượng', null, 'vd khoảng 300 mL/24 giờ']
        ]
    },

    /* ---------------- Thần kinh ---------------- */
    {
        ten: 'Đau đầu', nhom: 'Thần kinh', fields: [
            ['viTri', 'Vị trí', ['vùng chẩm', 'vùng trán', 'nửa đầu', 'lan tỏa']],
            ['tinhChat', 'Tính chất', ['âm ỉ', 'giật theo nhịp mạch', 'như bóp chặt', 'dữ dội đột ngột (sét đánh)']],
            ['mucDo', 'Mức độ', null, 'vd 7/10'],
            ['kemTheo', 'Kèm theo', ['buồn nôn – nôn', 'sợ ánh sáng', 'nhìn mờ', 'yếu liệt', 'sốt – cổ gượng']]
        ]
    },
    {
        ten: 'Chóng mặt', nhom: 'Thần kinh', fields: [
            ['kieu', 'Kiểu', ['xoay tròn', 'choáng váng', 'mất thăng bằng']],
            ['hoanCanh', 'Hoàn cảnh', ['khi thay đổi tư thế', 'tự nhiên', 'khi quay đầu']],
            ['kemTheo', 'Kèm theo', ['buồn nôn', 'ù tai', 'giảm thính lực', 'yếu chi']]
        ]
    },
    {
        ten: 'Yếu liệt chi', nhom: 'Thần kinh', fields: [
            ['viTri', 'Vị trí', ['nửa người phải', 'nửa người trái', 'hai chi dưới', 'tứ chi']],
            ['khoiPhat', 'Khởi phát', ['đột ngột', 'tăng dần trong nhiều giờ', 'tăng dần trong nhiều ngày']],
            ['mucDo', 'Sức cơ', ['1/5', '2/5', '3/5', '4/5']],
            ['kemTheo', 'Kèm theo', ['méo miệng', 'nói khó', 'rối loạn cảm giác', 'rối loạn cơ vòng']]
        ]
    },
    {
        ten: 'Sụp mi – nhìn đôi', nhom: 'Thần kinh', fields: [
            ['ben', 'Bên nào', ['mắt phải', 'mắt trái', 'hai bên']],
            ['thoiDiem', 'Nặng nhất khi', ['cuối ngày hoặc sau khi nhìn lâu', 'buổi sáng', 'không đổi trong ngày']],
            ['nghiNgoi', 'Nghỉ ngơi', ['đỡ hẳn sau khi nhắm mắt nghỉ', 'không đỡ']],
            ['kemTheo', 'Kèm theo', ['nhai mỏi – nuốt sặc', 'nói giọng mũi', 'yếu tay chân về chiều', 'co đồng tử cùng bên (Horner)', 'đau vai lan xuống tay']]
        ]
    },
    {
        ten: 'Co giật', nhom: 'Thần kinh', fields: [
            ['kieu', 'Kiểu', ['toàn thể co cứng – co giật', 'cục bộ', 'vắng ý thức']],
            ['thoiGian', 'Kéo dài', null, 'vd 2 phút'],
            ['sauCon', 'Sau cơn', ['lú lẫn', 'ngủ sâu', 'tỉnh hoàn toàn', 'yếu liệt thoáng qua']],
            ['soLan', 'Số cơn', null, 'vd 2 cơn trong 6 giờ']
        ]
    },

    /* ---------------- Cơ xương khớp ---------------- */
    {
        ten: 'Đau khớp', nhom: 'Cơ xương khớp', fields: [
            ['viTri', 'Khớp nào', null, 'vd khớp gối phải, khớp bàn ngón chân cái'],
            ['kieu', 'Kiểu đau', ['đau kiểu viêm (đau đêm, cứng khớp buổi sáng)', 'đau kiểu cơ học (đau khi vận động)']],
            ['cungKhop', 'Cứng khớp buổi sáng', null, 'vd khoảng 30 phút'],
            ['kemTheo', 'Kèm theo', ['sưng nóng đỏ', 'giới hạn vận động', 'sốt']]
        ]
    },
    {
        ten: 'Đau cột sống thắt lưng', nhom: 'Cơ xương khớp', fields: [
            ['tinhChat', 'Tính chất', ['âm ỉ sâu trong xương', 'đau nhói khi vận động', 'đau liên tục cả đêm']],
            ['lan', 'Hướng lan', ['lan xuống chân phải', 'lan xuống chân trái', 'không lan']],
            ['mucDo', 'Mức độ', null, 'vd 8/10'],
            ['yeuTo', 'Yếu tố tăng giảm', ['tăng khi vận động', 'không giảm khi nghỉ', 'giảm khi nằm nghỉ']]
        ]
    },
    {
        ten: 'Yếu mỏi cơ', nhom: 'Cơ xương khớp', fields: [
            ['viTri', 'Vị trí', ['gốc chi', 'ngọn chi', 'cơ đùi hai bên', 'toàn thân']],
            ['dienTien', 'Diễn tiến', ['tăng dần', 'sau gắng sức', 'từng đợt']]
        ]
    },

    /* ---------------- Da – niêm ---------------- */
    {
        ten: 'Xuất huyết da niêm', nhom: 'Da – niêm', fields: [
            ['dang', 'Dạng', ['chấm xuất huyết', 'mảng xuất huyết', 'vết bầm máu', 'chảy máu chân răng', 'chảy máu mũi']],
            ['viTri', 'Vị trí', null, 'vd mặt trong đùi phải'],
            ['kichThuoc', 'Kích thước', null, 'vd 4–5 cm'],
            ['hoanCanh', 'Hoàn cảnh', ['tự nhiên', 'sau va chạm nhẹ', 'sau tiêm chích']]
        ]
    },
    {
        ten: 'Ban da', nhom: 'Da – niêm', fields: [
            ['dang', 'Dạng ban', ['dát đỏ', 'sẩn', 'mụn nước', 'mày đay', 'ban xuất huyết']],
            ['viTri', 'Vị trí – lan', null, 'vd bắt đầu ở mặt rồi lan xuống thân'],
            ['nguaSot', 'Kèm theo', ['ngứa nhiều', 'không ngứa', 'kèm sốt']]
        ]
    },
    {
        ten: 'Ngứa', nhom: 'Da – niêm', fields: [
            ['viTri', 'Vị trí', ['toàn thân', 'lòng bàn tay – bàn chân', 'khu trú']],
            ['thoiDiem', 'Thời điểm', ['về đêm', 'cả ngày', 'sau tắm']]
        ]
    },

    /* ---------------- Sản phụ khoa ---------------- */
    {
        ten: 'Ra huyết âm đạo', nhom: 'Sản phụ khoa', fields: [
            ['luong', 'Lượng', ['ít, thấm giọt', 'trung bình', 'nhiều, ướt băng liên tục']],
            ['mauSac', 'Màu sắc', ['đỏ tươi', 'đỏ sẫm', 'nâu đen']],
            ['thoiGian', 'Kéo dài', null, 'vd 10 ngày, chu kỳ đến sớm 1 tuần'],
            ['kemTheo', 'Kèm theo', ['đau bụng', 'ra dịch hôi', 'chóng mặt']]
        ]
    },
    {
        ten: 'Đau bụng chuyển dạ', nhom: 'Sản phụ khoa', fields: [
            ['conCo', 'Cơn co', null, 'vd 3 cơn/10 phút, mỗi cơn 40 giây'],
            ['raNhot', 'Kèm theo', ['ra nhớt hồng', 'ra nước ối', 'chưa ra gì']],
            ['thaiMay', 'Thai máy', ['thai máy tốt', 'thai máy giảm']]
        ]
    },

    /* ---------------- Nhi khoa ---------------- */
    {
        ten: 'Bú kém – bỏ bú', nhom: 'Nhi khoa', fields: [
            ['mucDo', 'Mức độ', ['bú giảm một nửa', 'bỏ bú hoàn toàn']],
            ['thoiGian', 'Từ khi nào', null, 'vd 2 ngày nay'],
            ['kemTheo', 'Kèm theo', ['nôn trớ', 'quấy khóc', 'li bì']]
        ]
    },
    {
        ten: 'Quấy khóc – li bì', nhom: 'Nhi khoa', fields: [
            ['bieuHien', 'Biểu hiện', ['quấy khóc liên tục', 'li bì khó đánh thức', 'kích thích']],
            ['kemTheo', 'Kèm theo', ['sốt', 'nôn', 'co giật', 'thóp phồng']]
        ]
    },

    /* ---------------- Toàn thân (bổ sung) ---------------- */
    {
        ten: 'Ớn lạnh – lạnh run', nhom: 'Toàn thân', fields: [
            ['mucDo', 'Mức độ', ['ớn lạnh nhẹ', 'lạnh run toàn thân, đắp mền vẫn run']],
            ['lienQuan', 'Liên quan', ['xuất hiện trước cơn sốt', 'kèm lúc sốt cao']],
            ['tanSuat', 'Tần suất', null, 'vd 2 cơn/ngày, 3 ngày nay']
        ]
    },
    {
        ten: 'Ngất', nhom: 'Toàn thân', fields: [
            ['hoanCanh', 'Hoàn cảnh', ['khi đang đứng lâu', 'khi gắng sức', 'khi thay đổi tư thế', 'khi đang nằm/ngồi yên']],
            ['baoTruoc', 'Dấu báo trước', ['hoa mắt, vã mồ hôi', 'hồi hộp trống ngực', 'không có dấu báo']],
            ['thoiGian', 'Bất tỉnh bao lâu', null, 'vd khoảng 30 giây'],
            ['sauNgat', 'Sau khi tỉnh', ['tỉnh táo hoàn toàn ngay', 'lú lẫn một lúc', 'yếu nửa người']],
            ['soLan', 'Số lần', null, 'vd 2 lần trong 1 tháng']
        ]
    },
    {
        ten: 'Mất ngủ', nhom: 'Toàn thân', fields: [
            ['kieu', 'Kiểu mất ngủ', ['khó vào giấc', 'thức giấc giữa đêm', 'thức dậy quá sớm']],
            ['thoiGianNgu', 'Ngủ được bao lâu', null, 'vd 3–4 giờ/đêm'],
            ['nguyenNhan', 'Do', ['đau', 'khó thở', 'lo lắng', 'không rõ']]
        ]
    },

    /* ---------------- Hô hấp (bổ sung) ---------------- */
    {
        ten: 'Khạc đàm', nhom: 'Hô hấp', fields: [
            ['mauSac', 'Màu đàm', ['trắng trong', 'trắng đục', 'vàng', 'xanh', 'nâu gỉ sắt', 'lẫn máu']],
            ['luong', 'Lượng', ['ít, vài bãi/ngày', 'trung bình', 'nhiều, khạc cả chén']],
            ['muiVi', 'Mùi', ['không hôi', 'hôi thối']],
            ['thoiDiem', 'Nhiều nhất lúc', ['sáng sớm', 'cả ngày', 'về đêm']]
        ]
    },
    {
        ten: 'Khò khè', nhom: 'Hô hấp', fields: [
            ['thoiDiem', 'Thời điểm', ['về đêm và gần sáng', 'khi gắng sức', 'liên tục']],
            ['yeuTo', 'Khởi phát khi', ['tiếp xúc bụi, khói', 'thay đổi thời tiết', 'nhiễm siêu vi', 'không rõ']],
            ['dapUng', 'Đáp ứng thuốc giãn phế quản', ['giảm rõ sau xịt', 'không giảm', 'chưa dùng']]
        ]
    },
    {
        ten: 'Đau họng', nhom: 'Tai – mũi – họng', fields: [
            ['mucDo', 'Mức độ', ['đau rát nhẹ', 'đau nhiều, nuốt vướng', 'đau dữ dội, không nuốt được']],
            ['kemTheo', 'Kèm theo', ['sốt', 'ho', 'khàn tiếng', 'nổi hạch cổ']],
            ['thoiGian', 'Bao lâu', null, 'vd 3 ngày nay']
        ]
    },
    {
        ten: 'Khàn tiếng', nhom: 'Tai – mũi – họng', fields: [
            ['dienTien', 'Diễn tiến', ['đột ngột', 'tăng dần nhiều tuần']],
            ['thoiGian', 'Kéo dài', null, 'vd 3 tuần'],
            ['kemTheo', 'Kèm theo', ['ho kéo dài', 'nuốt vướng', 'sụt cân', 'không kèm gì']]
        ]
    },
    {
        ten: 'Nghẹt mũi – chảy mũi', nhom: 'Tai – mũi – họng', fields: [
            ['ben', 'Bên', ['hai bên', 'một bên phải', 'một bên trái']],
            ['dich', 'Dịch mũi', ['trong loãng', 'đặc vàng xanh', 'lẫn máu']],
            ['kemTheo', 'Kèm theo', ['hắt hơi từng tràng', 'ngứa mũi', 'đau nhức vùng mặt', 'giảm khứu giác']]
        ]
    },
    {
        ten: 'Chảy máu mũi', nhom: 'Tai – mũi – họng', fields: [
            ['ben', 'Bên', ['một bên', 'hai bên']],
            ['luong', 'Lượng', ['ít, tự cầm', 'nhiều, phải nhét mèche']],
            ['soLan', 'Số lần', null, 'vd 3 lần trong tuần'],
            ['kemTheo', 'Kèm theo', ['chảy máu răng', 'xuất huyết da', 'tăng huyết áp lúc chảy']]
        ]
    },
    {
        ten: 'Ù tai – nghe kém', nhom: 'Tai – mũi – họng', fields: [
            ['ben', 'Bên', ['tai phải', 'tai trái', 'hai tai']],
            ['kieu', 'Kiểu', ['ù như ve kêu', 'nghe kém dần', 'điếc đột ngột']],
            ['kemTheo', 'Kèm theo', ['chóng mặt xoay tròn', 'chảy dịch tai', 'đau tai']]
        ]
    },

    /* ---------------- Mắt ---------------- */
    {
        ten: 'Nhìn mờ', nhom: 'Mắt', fields: [
            ['ben', 'Bên', ['mắt phải', 'mắt trái', 'hai mắt']],
            ['dienTien', 'Diễn tiến', ['đột ngột', 'mờ dần nhiều tháng']],
            ['kieu', 'Kiểu', ['mờ toàn bộ', 'mất một phần thị trường', 'nhìn đôi', 'ruồi bay']],
            ['kemTheo', 'Kèm theo', ['đau nhức mắt', 'đỏ mắt', 'đau đầu', 'không kèm gì']]
        ]
    },
    {
        ten: 'Đỏ mắt', nhom: 'Mắt', fields: [
            ['ben', 'Bên', ['một mắt', 'hai mắt']],
            ['ghen', 'Ghèn', ['nhiều ghèn vàng', 'ghèn trong', 'không ghèn']],
            ['kemTheo', 'Kèm theo', ['cộm xốn', 'đau nhức', 'nhìn mờ', 'sợ ánh sáng']]
        ]
    },

    /* ---------------- Tim mạch (bổ sung) ---------------- */
    {
        ten: 'Khó thở khi nằm', nhom: 'Tim mạch', fields: [
            ['soGoi', 'Phải nằm mấy gối', null, 'vd 2–3 gối mới ngủ được'],
            ['kichPhatDem', 'Khó thở kịch phát về đêm', ['có, phải ngồi dậy thở', 'không']],
            ['dienTien', 'Diễn tiến', ['tăng dần', 'đột ngột']],
            ['kemTheo', 'Kèm theo', ['phù chân', 'tiểu ít', 'ho khan về đêm']]
        ]
    },
    {
        ten: 'Tím tái', nhom: 'Tim mạch', fields: [
            ['viTri', 'Vị trí', ['môi và đầu chi', 'toàn thân', 'chỉ đầu chi']],
            ['hoanCanh', 'Xuất hiện khi', ['gắng sức', 'cả lúc nghỉ', 'khi lạnh']],
            ['dapUngOxy', 'Đáp ứng thở oxy', ['giảm rõ', 'không cải thiện', 'chưa thở oxy']]
        ]
    },

    /* ---------------- Tiêu hóa (bổ sung) ---------------- */
    {
        ten: 'Ợ hơi – ợ chua', nhom: 'Tiêu hóa', fields: [
            ['thoiDiem', 'Thời điểm', ['sau ăn', 'khi đói', 'khi nằm', 'về đêm']],
            ['kemTheo', 'Kèm theo', ['nóng rát sau xương ức', 'buồn nôn', 'đau thượng vị']],
            ['dapUng', 'Đáp ứng thuốc', ['giảm khi uống thuốc dạ dày', 'không giảm', 'chưa dùng']]
        ]
    },
    {
        ten: 'Nuốt khó', nhom: 'Tiêu hóa', fields: [
            ['loai', 'Khó nuốt với', ['thức ăn đặc', 'cả đặc và lỏng', 'chỉ nước']],
            ['dienTien', 'Diễn tiến', ['tăng dần', 'từng đợt', 'không đổi']],
            ['viTri', 'Cảm giác nghẹn ở', ['cổ họng', 'sau xương ức', 'thượng vị']],
            ['kemTheo', 'Kèm theo', ['sụt cân', 'ọc thức ăn', 'đau khi nuốt']]
        ]
    },
    {
        ten: 'Táo bón', nhom: 'Tiêu hóa', fields: [
            ['tanSuat', 'Số lần đi tiêu', null, 'vd 2 lần/tuần'],
            ['tinhChatPhan', 'Tính chất phân', ['cứng, lổn nhổn', 'khuôn to, khó rặn']],
            ['dienTien', 'Diễn tiến', ['mới thay đổi gần đây', 'kéo dài nhiều năm']],
            ['kemTheo', 'Kèm theo', ['đau bụng', 'chướng bụng', 'máu dính phân', 'sụt cân']]
        ]
    },
    {
        ten: 'Tiêu máu đỏ', nhom: 'Tiêu hóa', fields: [
            ['luong', 'Lượng', ['dính giấy vệ sinh', 'nhỏ giọt sau phân', 'thành tia', 'máu trộn lẫn phân']],
            ['mauSac', 'Màu', ['đỏ tươi', 'đỏ bầm', 'lẫn nhầy']],
            ['soLan', 'Số lần', null, 'vd 3 lần trong 2 ngày'],
            ['kemTheo', 'Kèm theo', ['đau khi đi tiêu', 'chóng mặt', 'sụt cân']]
        ]
    },
    {
        ten: 'Bụng to dần', nhom: 'Tiêu hóa', fields: [
            ['thoiGian', 'Trong bao lâu', null, 'vd 1 tháng, tăng 5 kg'],
            ['kemTheo', 'Kèm theo', ['phù chân', 'vàng da', 'tiểu ít', 'khó thở khi nằm']],
            ['tuanHoanBangHe', 'Tuần hoàn bàng hệ', ['có thấy', 'không thấy']]
        ]
    },

    /* ---------------- Tiết niệu (bổ sung) ---------------- */
    {
        ten: 'Tiểu đêm', nhom: 'Tiết niệu – sinh dục', fields: [
            ['soLan', 'Số lần mỗi đêm', null, 'vd 3–4 lần'],
            ['thoiGian', 'Từ bao lâu', null, 'vd 6 tháng nay'],
            ['kemTheo', 'Kèm theo', ['tiểu khó, tia yếu', 'khát nhiều uống nhiều', 'phù chân']]
        ]
    },
    {
        ten: 'Tiểu khó – tia yếu', nhom: 'Tiết niệu – sinh dục', fields: [
            ['bieuHien', 'Biểu hiện', ['phải rặn mới ra', 'tia nước tiểu yếu', 'tiểu ngắt quãng', 'tiểu xong còn cảm giác chưa hết']],
            ['dienTien', 'Diễn tiến', ['tăng dần', 'đột ngột']],
            ['biTieu', 'Có bí tiểu cấp', ['có, phải đặt sonde', 'chưa từng']]
        ]
    },
    {
        ten: 'Đau quặn thận', nhom: 'Tiết niệu – sinh dục', fields: [
            ['ben', 'Bên', ['hông lưng phải', 'hông lưng trái', 'hai bên']],
            ['huongLan', 'Lan xuống', ['bẹn cùng bên', 'bìu / môi lớn', 'không lan']],
            ['mucDo', 'Mức độ', ['đau dữ dội, lăn lộn', 'đau vừa', 'đau âm ỉ']],
            ['kemTheo', 'Kèm theo', ['tiểu máu', 'buồn nôn, nôn', 'sốt lạnh run', 'tiểu gắt']]
        ]
    },

    /* ---------------- Thần kinh (bổ sung) ---------------- */
    {
        ten: 'Rối loạn tri giác', nhom: 'Thần kinh', fields: [
            ['mucDo', 'Mức độ', ['lú lẫn, trả lời chậm', 'ngủ gà, gọi mới mở mắt', 'hôn mê']],
            ['khoiPhat', 'Khởi phát', ['đột ngột', 'từ từ vài ngày']],
            ['daoDong', 'Dao động trong ngày', ['có, nặng về đêm', 'không đổi']],
            ['kemTheo', 'Kèm theo', ['sốt', 'yếu liệt chi', 'co giật', 'nôn ói']]
        ]
    },
    {
        ten: 'Nói khó', nhom: 'Thần kinh', fields: [
            ['kieu', 'Kiểu', ['nói đớ, méo tiếng', 'không tìm được từ', 'không hiểu lời người khác', 'không nói được']],
            ['khoiPhat', 'Khởi phát', ['đột ngột', 'tăng dần']],
            ['kemTheo', 'Kèm theo', ['yếu nửa người', 'méo miệng', 'nuốt sặc']]
        ]
    },
    {
        ten: 'Tê bì – dị cảm', nhom: 'Thần kinh', fields: [
            ['viTri', 'Vị trí', ['hai bàn chân kiểu mang vớ', 'hai bàn tay kiểu mang găng', 'nửa người', 'theo một rễ thần kinh']],
            ['dienTien', 'Diễn tiến', ['tăng dần nhiều tháng', 'đột ngột', 'từng cơn']],
            ['thoiDiem', 'Rõ nhất', ['về đêm', 'cả ngày', 'khi vận động']]
        ]
    },
    {
        ten: 'Run tay', nhom: 'Thần kinh', fields: [
            ['kieu', 'Kiểu run', ['run khi nghỉ', 'run khi giữ tư thế', 'run khi làm động tác']],
            ['ben', 'Bên', ['một bên', 'hai bên']],
            ['kemTheo', 'Kèm theo', ['cử động chậm', 'cứng đờ', 'sụt cân, hồi hộp', 'không kèm gì']]
        ]
    },

    /* ---------------- Cơ xương khớp (bổ sung) ---------------- */
    {
        ten: 'Sưng khớp', nhom: 'Cơ xương khớp', fields: [
            ['viTri', 'Khớp nào', null, 'vd khớp gối phải, các khớp bàn ngón tay'],
            ['soKhop', 'Số khớp', ['một khớp', 'vài khớp', 'nhiều khớp đối xứng']],
            ['tinhChat', 'Tính chất', ['sưng nóng đỏ đau', 'sưng không nóng đỏ']],
            ['cungKhopSang', 'Cứng khớp buổi sáng', null, 'vd hơn 1 giờ']
        ]
    },
    {
        ten: 'Đau vai gáy', nhom: 'Cơ xương khớp', fields: [
            ['huongLan', 'Lan', ['xuống tay', 'lên đầu', 'không lan']],
            ['yeuTo', 'Tăng khi', ['cúi ngửa cổ', 'ngồi lâu', 'về đêm']],
            ['kemTheo', 'Kèm theo', ['tê tay', 'yếu tay', 'chóng mặt']]
        ]
    },
    {
        ten: 'Chuột rút', nhom: 'Cơ xương khớp', fields: [
            ['viTri', 'Vị trí', ['bắp chân', 'bàn chân', 'nhiều nơi']],
            ['thoiDiem', 'Thời điểm', ['về đêm', 'khi đi lại', 'sau chạy thận']],
            ['tanSuat', 'Tần suất', null, 'vd gần như mỗi đêm']
        ]
    },

    /* ---------------- Nội tiết – chuyển hóa ---------------- */
    {
        ten: 'Khát nhiều – uống nhiều – tiểu nhiều', nhom: 'Nội tiết – chuyển hóa', fields: [
            ['luongNuoc', 'Uống bao nhiêu', null, 'vd 4–5 lít/ngày'],
            ['luongTieu', 'Tiểu bao nhiêu', null, 'vd tiểu nhiều lần, nước tiểu trong'],
            ['thoiGian', 'Từ bao lâu', null, 'vd 2 tháng nay'],
            ['kemTheo', 'Kèm theo', ['sụt cân dù ăn nhiều', 'mệt mỏi', 'nhìn mờ', 'ngứa vùng kín']]
        ]
    },
    {
        ten: 'Bướu cổ to', nhom: 'Nội tiết – chuyển hóa', fields: [
            ['thoiGian', 'Phát hiện từ', null, 'vd 2 năm nay, gần đây to nhanh'],
            ['tinhChat', 'Tính chất', ['to đều hai thùy', 'một nhân', 'nhiều nhân']],
            ['chenEp', 'Dấu chèn ép', ['nuốt vướng', 'khàn tiếng', 'khó thở khi nằm', 'không có']],
            ['cuongGiap', 'Dấu cường giáp', ['hồi hộp, sụt cân, run tay', 'sợ lạnh, tăng cân, chậm chạp', 'không rõ']]
        ]
    },

    /* ---------------- Huyết học ---------------- */
    {
        ten: 'Hạch to', nhom: 'Huyết học', fields: [
            ['viTri', 'Vị trí', ['cổ', 'nách', 'bẹn', 'nhiều nơi']],
            ['kichThuoc', 'Kích thước', null, 'vd hạch 2 cm, chắc, không đau'],
            ['tinhChat', 'Tính chất', ['mềm, di động, đau', 'chắc, dính, không đau']],
            ['kemTheo', 'Kèm theo', ['sốt kéo dài', 'sụt cân', 'vã mồ hôi đêm', 'không kèm gì']]
        ]
    },
    {
        ten: 'Chảy máu răng', nhom: 'Huyết học', fields: [
            ['hoanCanh', 'Khi nào', ['khi đánh răng', 'tự nhiên chảy']],
            ['luong', 'Lượng', ['ít, tự cầm', 'kéo dài khó cầm']],
            ['kemTheo', 'Kèm theo', ['chấm xuất huyết da', 'chảy máu mũi', 'rong kinh']]
        ]
    },

    /* ---------------- Da – niêm (bổ sung) ---------------- */
    {
        ten: 'Hoại tử đầu ngón', nhom: 'Da – niêm', fields: [
            ['viTri', 'Ngón nào', null, 'vd ngón I và II bàn chân trái'],
            ['kieu', 'Kiểu hoại tử', ['khô, đen, ranh giới rõ', 'ướt, chảy dịch hôi', 'đang lan lên gốc ngón']],
            ['dau', 'Đau', ['đau liên tục, tăng về đêm', 'đau ít', 'mất cảm giác nên không đau']],
            ['thoiGian', 'Bao lâu', null, 'vd 3 tuần, lan dần'],
            ['kemTheo', 'Kèm theo', ['bàn chân lạnh – mất mạch', 'sốt', 'chảy mủ hôi', 'đái tháo đường đang điều trị']]
        ]
    },
    {
        ten: 'Chảy máu vết thương', nhom: 'Da – niêm', fields: [
            ['viTri', 'Vị trí', null, 'vd mặt trong đùi phải, 1/3 giữa'],
            ['kieu', 'Kiểu chảy', ['phun thành tia theo nhịp mạch', 'chảy ồ ạt thấm băng', 'rỉ rả', 'đã cầm sau băng ép']],
            ['luong', 'Lượng ước tính', null, 'vd ướt đẫm 2 cuộn băng, khoảng 500 mL'],
            ['soCuu', 'Sơ cứu', ['băng ép', 'garrot', 'kẹp cầm máu', 'chưa xử trí gì']],
            ['kemTheo', 'Kèm theo', ['khối máu tụ to nhanh, đập nảy', 'tê – lạnh phần chi phía dưới', 'chóng mặt, vã mồ hôi']]
        ]
    },
    {
        ten: 'Chảy dịch – hở vết mổ', nhom: 'Da – niêm', fields: [
            ['viTri', 'Vết mổ nào', ['xương ức sau mổ tim', 'thành ngực sau mổ phổi', 'chân ống dẫn lưu', 'vết mổ lấy tĩnh mạch hiển', 'vết mổ mạch máu vùng bẹn']],
            ['tinhChat', 'Tính chất dịch', ['huyết thanh trong', 'dịch đục – mủ', 'máu đỏ tươi', 'dịch hôi']],
            ['luong', 'Lượng', null, 'vd thấm ướt 2 gạc mỗi ngày'],
            ['kemTheo', 'Kèm theo', ['sốt', 'đau tăng tại vết mổ', 'xương ức lạo xạo khi ho', 'mép vết mổ hở – nề đỏ']],
            ['thoiGian', 'Ngày hậu phẫu thứ mấy', null, 'vd hậu phẫu ngày 8']
        ]
    },
    {
        ten: 'Loét da', nhom: 'Da – niêm', fields: [
            ['viTri', 'Vị trí', null, 'vd mặt lòng bàn chân phải, vùng cùng cụt'],
            ['kichThuoc', 'Kích thước', null, 'vd 3 × 4 cm, sâu tới cân cơ'],
            ['dayVetLoet', 'Đáy vết loét', ['sạch, mô hạt đỏ', 'giả mạc vàng', 'hoại tử đen']],
            ['dich', 'Dịch tiết', ['ít, trong', 'nhiều, đục hôi', 'không dịch']],
            ['thoiGian', 'Bao lâu', null, 'vd 3 tuần không lành']
        ]
    },

    /* ---------------- Tâm thần ---------------- */
    {
        ten: 'Lo âu – bồn chồn', nhom: 'Tâm thần', fields: [
            ['bieuHien', 'Biểu hiện', ['bồn chồn không yên', 'hồi hộp, vã mồ hôi', 'sợ hãi vô cớ']],
            ['anhHuong', 'Ảnh hưởng', ['mất ngủ', 'không tập trung làm việc', 'ngại ra ngoài']],
            ['thoiGian', 'Kéo dài', null, 'vd 3 tháng nay']
        ]
    },
    {
        ten: 'Khí sắc trầm', nhom: 'Tâm thần', fields: [
            ['bieuHien', 'Biểu hiện', ['buồn chán kéo dài', 'mất hứng thú mọi việc', 'tự trách bản thân']],
            ['anGiacNgu', 'Ăn – ngủ', ['chán ăn, sụt cân', 'mất ngủ', 'ngủ nhiều']],
            ['yTuong', 'Ý tưởng tiêu cực', ['không có', 'có nghĩ tới', 'đã có hành vi']]
        ]
    },

    /* ---------------- Sản phụ khoa (bổ sung) ---------------- */
    {
        ten: 'Trễ kinh', nhom: 'Sản phụ khoa', fields: [
            ['soNgay', 'Trễ bao lâu', null, 'vd trễ 3 tuần'],
            ['kinhChot', 'Kinh chót', null, 'vd 12/6'],
            ['thuThai', 'Que thử thai', ['2 vạch', '1 vạch', 'chưa thử']],
            ['kemTheo', 'Kèm theo', ['nghén', 'đau bụng', 'ra huyết']]
        ]
    },
    {
        ten: 'Ra nước âm đạo', nhom: 'Sản phụ khoa', fields: [
            ['luong', 'Lượng', ['ướt quần lót', 'chảy thành dòng']],
            ['mauSac', 'Màu', ['trong', 'vàng', 'xanh có phân su', 'lẫn máu']],
            ['thoiDiem', 'Từ lúc nào', null, 'vd 6 giờ trước nhập viện'],
            ['conCo', 'Kèm cơn co', ['có', 'chưa có']]
        ]
    },
    {
        ten: 'Thai máy giảm', nhom: 'Sản phụ khoa', fields: [
            ['soLan', 'Đếm được', null, 'vd dưới 10 lần trong 2 giờ'],
            ['thoiGian', 'Từ khi nào', null, 'vd 1 ngày nay'],
            ['kemTheo', 'Kèm theo', ['đau bụng', 'ra huyết', 'ra nước', 'không kèm gì']]
        ]
    },
    {
        ten: 'Ra huyết trắng', nhom: 'Sản phụ khoa', fields: [
            ['tinhChat', 'Tính chất', ['trắng đục vón cục', 'vàng xanh loãng', 'xám, loãng']],
            ['mui', 'Mùi', ['hôi tanh', 'không hôi']],
            ['kemTheo', 'Kèm theo', ['ngứa âm hộ', 'tiểu gắt', 'đau khi giao hợp']]
        ]
    },

    /* ---------------- Nhi khoa (bổ sung) ---------------- */
    {
        ten: 'Nôn trớ', nhom: 'Nhi khoa', fields: [
            ['soLan', 'Số lần', null, 'vd 5 lần/ngày'],
            ['tinhChat', 'Chất nôn', ['sữa vừa bú', 'dịch vàng', 'dịch xanh', 'lẫn máu']],
            ['lienQuanBu', 'Liên quan bú', ['ngay sau bú', 'không liên quan bú']],
            ['kemTheo', 'Kèm theo', ['tiêu chảy', 'chướng bụng', 'sốt', 'li bì']]
        ]
    },
    {
        ten: 'Chậm tăng cân', nhom: 'Nhi khoa', fields: [
            ['canNang', 'Cân nặng hiện tại', null, 'vd 7 kg lúc 18 tháng'],
            ['dienTien', 'Diễn tiến', ['đứng cân nhiều tháng', 'sụt cân']],
            ['anUong', 'Ăn uống', ['bú kém', 'ăn được nhưng không lên cân']],
            ['kemTheo', 'Kèm theo', ['tiêu chảy kéo dài', 'ho kéo dài', 'hay ốm vặt']]
        ]
    },
    {
        ten: 'Thở nhanh – rút lõm ngực', nhom: 'Nhi khoa', fields: [
            ['nhipTho', 'Nhịp thở', null, 'vd 60 lần/phút'],
            ['rutLom', 'Rút lõm', ['rút lõm lồng ngực', 'phập phồng cánh mũi', 'thở rên']],
            ['tim', 'Tím', ['tím quanh môi', 'không tím']],
            ['buOn', 'Bú', ['bú kém', 'bỏ bú', 'bú được']]
        ]
    },

    /* ================================================================
       BỔ SUNG ĐỢT 2 — lấp những hệ cơ quan còn mỏng (Mắt, Nội tiết,
       Huyết học, Tâm thần, TMH) và thêm các triệu chứng cơ năng hay
       gặp ở buồng bệnh mà bảng trên chưa có. Cùng khuôn: mỗi mục là
       một triệu chứng + đúng những câu phải hỏi để tả cho đủ ý.
       ================================================================ */

    /* ---------------- Toàn thân (bổ sung) ---------------- */
    {
        ten: 'Sốt kéo dài chưa rõ nguyên nhân', nhom: 'Toàn thân', fields: [
            ['thoiGian', 'Sốt bao lâu', null, 'vd 3 tuần nay'],
            ['kieu', 'Kiểu sốt', ['sốt về chiều', 'sốt liên tục', 'sốt dao động', 'sốt từng đợt cách quãng']],
            ['daDieuTri', 'Đã điều trị gì', null, 'vd đã uống 2 đợt kháng sinh, không giảm'],
            ['kemTheo', 'Kèm theo', ['sụt cân', 'vã mồ hôi đêm', 'hạch to', 'đau khớp', 'ban da']],
            ['dichTe', 'Yếu tố dịch tễ', null, 'vd đi vùng sốt rét, tiếp xúc lao, nuôi mèo']
        ]
    },
    {
        ten: 'Tăng cân nhanh', nhom: 'Toàn thân', fields: [
            ['soKg', 'Tăng bao nhiêu', null, 'vd 6 kg trong 1 tháng'],
            ['viTri', 'Tăng ở đâu', ['toàn thân', 'chủ yếu bụng', 'mặt và thân, chi teo nhỏ']],
            ['phuKem', 'Có phù kèm không', ['có phù chân', 'có bụng to', 'không phù']],
            ['thuoc', 'Thuốc đang dùng', null, 'vd corticoid kéo dài']
        ]
    },
    {
        ten: 'Giảm khả năng gắng sức', nhom: 'Toàn thân', fields: [
            ['truoc', 'Trước đây làm được', null, 'vd leo 3 tầng lầu không mệt'],
            ['nay', 'Nay chỉ còn', null, 'vd đi 50 m phải dừng nghỉ'],
            ['dienTien', 'Diễn tiến', ['giảm dần trong nhiều tháng', 'giảm nhanh vài tuần', 'đột ngột']],
            ['kemTheo', 'Kèm theo', ['khó thở', 'đau ngực', 'hồi hộp', 'chóng mặt']]
        ]
    },
    {
        ten: 'Đau mỏi cơ toàn thân', nhom: 'Toàn thân', fields: [
            ['viTri', 'Rõ nhất ở', ['cơ vai gáy', 'cơ đùi cẳng chân', 'khắp người']],
            ['thoiDiem', 'Thời điểm', ['suốt ngày', 'sau vận động', 'buổi sáng']],
            ['kemTheo', 'Kèm theo', ['sốt', 'nước tiểu sẫm màu', 'yếu cơ', 'không kèm gì']],
            ['thuoc', 'Thuốc đang dùng', null, 'vd statin, thuốc lao']
        ]
    },
    {
        ten: 'Buồn ngủ ban ngày quá mức', nhom: 'Toàn thân', fields: [
            ['mucDo', 'Mức độ', ['ngủ gật khi ngồi yên', 'ngủ gật khi đang nói chuyện', 'ngủ gật khi lái xe']],
            ['nguDem', 'Ngủ đêm', ['ngáy to, ngưng thở', 'ngủ đủ vẫn buồn ngủ', 'mất ngủ ban đêm']],
            ['thoiGian', 'Bao lâu nay', null, 'vd vài tháng nay']
        ]
    },

    /* ---------------- Hô hấp (bổ sung) ---------------- */
    {
        ten: 'Thở rít thanh quản', nhom: 'Hô hấp', fields: [
            ['thi', 'Thì nào', ['thì hít vào', 'thì thở ra', 'cả hai thì']],
            ['khoiPhat', 'Khởi phát', ['đột ngột sau sặc', 'tăng dần vài ngày', 'sau đặt nội khí quản']],
            ['kemTheo', 'Kèm theo', ['khàn tiếng', 'khó nuốt', 'rút lõm', 'tím tái']],
            ['tuThe', 'Tư thế dễ chịu', null, 'vd phải ngồi cúi ra trước']
        ]
    },
    {
        ten: 'Ngáy – ngưng thở khi ngủ', nhom: 'Hô hấp', fields: [
            ['nguoiNha', 'Người nhà kể', ['ngáy to hằng đêm', 'thấy ngưng thở từng lúc', 'giật mình thức giấc']],
            ['banNgay', 'Ban ngày', ['buồn ngủ nhiều', 'đau đầu buổi sáng', 'giảm tập trung']],
            ['yeuTo', 'Yếu tố', null, 'vd BMI 32, amidan to, uống rượu buổi tối']
        ]
    },
    {
        ten: 'Khó thở kịch phát về đêm', nhom: 'Hô hấp', fields: [
            ['tanSuat', 'Mấy lần mỗi đêm', null, 'vd 1–2 lần, 3 đêm nay'],
            ['xuTri', 'Phải làm gì cho đỡ', ['ngồi dậy', 'ra cửa sổ hít thở', 'xịt thuốc']],
            ['thoiGian', 'Bao lâu thì hết', null, 'vd 15–20 phút'],
            ['kemTheo', 'Kèm theo', ['ho khan', 'khò khè', 'khạc bọt hồng', 'hồi hộp']]
        ]
    },
    {
        ten: 'Nấc cụt kéo dài', nhom: 'Hô hấp', fields: [
            ['thoiGian', 'Kéo dài bao lâu', null, 'vd liên tục 3 ngày'],
            ['anhHuong', 'Ảnh hưởng', ['mất ngủ', 'không ăn được', 'chỉ khó chịu']],
            ['kemTheo', 'Kèm theo', ['nôn ói', 'đau ngực', 'sau mổ bụng', 'không kèm gì']]
        ]
    },
    {
        ten: 'Sặc – hội chứng xâm nhập', nhom: 'Hô hấp', fields: [
            ['hoanCanh', 'Đang làm gì', null, 'vd đang ăn đậu phộng, trẻ chơi hạt nhựa'],
            ['bieuHien', 'Lúc đó', ['ho sặc sụa dữ dội', 'tím tái', 'ngưng thở thoáng qua']],
            ['sauDo', 'Sau đó', ['hết hẳn', 'còn ho, khò khè kéo dài', 'khó thở tăng dần']]
        ]
    },

    /* ---------------- Tim mạch (bổ sung) ---------------- */
    {
        ten: 'Hụt nhịp – nhịp không đều', nhom: 'Tim mạch', fields: [
            ['camGiac', 'Cảm giác', ['hẫng một nhịp', 'tim đập loạn xạ', 'tim đập rất nhanh rồi ngưng']],
            ['khoiPhat', 'Khởi phát – kết thúc', ['đột ngột cả hai đầu', 'tăng giảm từ từ']],
            ['thoiGian', 'Kéo dài', null, 'vd vài giây tới vài phút'],
            ['yeuTo', 'Yếu tố khởi phát', ['cà phê, rượu', 'gắng sức', 'lo lắng', 'không rõ']],
            ['kemTheo', 'Kèm theo', ['choáng váng', 'ngất', 'đau ngực', 'khó thở']]
        ]
    },
    {
        ten: 'Cơn tăng huyết áp', nhom: 'Tim mạch', fields: [
            ['soDo', 'Huyết áp đo được', null, 'vd 200/110 mmHg'],
            ['trieuChung', 'Lúc đó có', ['nhức đầu', 'nhìn mờ', 'đau ngực', 'khó thở', 'không triệu chứng']],
            ['thuoc', 'Thuốc huyết áp', ['uống đều', 'tự bỏ thuốc', 'chưa từng điều trị']],
            ['tanSuat', 'Đã mấy lần như vậy', null, 'vd lần thứ 3 trong 2 tháng']
        ]
    },
    {
        ten: 'Đau ngực xé lan sau lưng', nhom: 'Tim mạch', fields: [
            ['khoiPhat', 'Khởi phát', ['đột ngột, dữ dội ngay từ đầu', 'tăng dần']],
            ['huongLan', 'Lan tới', ['giữa hai xương bả vai', 'bụng', 'cổ', 'hông lưng']],
            ['tinhChat', 'Tính chất', ['như xé', 'như dao đâm', 'đè nặng']],
            ['kemTheo', 'Kèm theo', ['yếu nửa người', 'chênh huyết áp hai tay', 'ngất', 'đau bụng']]
        ]
    },
    {
        ten: 'Lạnh – tê đầu chi từng cơn', nhom: 'Tim mạch', fields: [
            ['doiMau', 'Đổi màu', ['trắng rồi tím rồi đỏ', 'chỉ trắng nhợt', 'chỉ tím']],
            ['yeuTo', 'Khởi phát khi', ['gặp lạnh', 'xúc động', 'không rõ']],
            ['viTri', 'Vị trí', ['các ngón tay', 'ngón chân', 'mũi, vành tai']],
            ['kemTheo', 'Kèm theo', ['loét đầu ngón', 'đau khớp', 'khô mắt khô miệng']]
        ]
    },

    /* ---------------- Tiêu hóa (bổ sung) ---------------- */
    {
        ten: 'Buồn nôn', nhom: 'Tiêu hóa', fields: [
            ['thoiDiem', 'Thời điểm', ['buổi sáng', 'sau ăn', 'suốt ngày', 'khi thay đổi tư thế']],
            ['nonKhong', 'Có nôn ra không', ['có nôn', 'chỉ buồn nôn']],
            ['kemTheo', 'Kèm theo', ['đau bụng', 'chóng mặt', 'đau đầu', 'thai kỳ']]
        ]
    },
    {
        ten: 'Nôn ra máu', nhom: 'Tiêu hóa', fields: [
            ['luong', 'Lượng', null, 'vd khoảng 200 ml, đầy một chén'],
            ['tinhChat', 'Tính chất', ['máu đỏ tươi', 'máu bầm lợn cợn', 'như bã cà phê']],
            ['soLan', 'Số lần', null, 'vd 3 lần trong 6 giờ'],
            ['hoanCanh', 'Trước đó', ['nôn nhiều rồi mới ra máu', 'sau uống rượu', 'sau uống thuốc giảm đau']],
            ['kemTheo', 'Kèm theo', ['tiêu phân đen', 'choáng váng', 'vã mồ hôi', 'đau thượng vị']]
        ]
    },
    {
        ten: 'Cơn đau quặn mật', nhom: 'Tiêu hóa', fields: [
            ['viTri', 'Vị trí', ['hạ sườn phải', 'thượng vị']],
            ['huongLan', 'Lan tới', ['bả vai phải', 'sau lưng', 'không lan']],
            ['hoanCanh', 'Khởi phát sau', ['bữa ăn nhiều dầu mỡ', 'ban đêm', 'không rõ']],
            ['thoiGian', 'Kéo dài', null, 'vd 2–4 giờ rồi tự hết'],
            ['kemTheo', 'Kèm theo', ['nôn ói', 'sốt lạnh run', 'vàng da', 'tiểu sẫm màu']]
        ]
    },
    {
        ten: 'Tiêu phân nhầy máu', nhom: 'Tiêu hóa', fields: [
            ['soLan', 'Số lần/ngày', null, 'vd 8–10 lần'],
            ['tinhChat', 'Tính chất', ['nhầy lẫn máu', 'toàn nhầy', 'máu tươi cuối bãi']],
            ['motRan', 'Mót rặn', ['có mót rặn, đau quặn', 'không mót rặn']],
            ['kemTheo', 'Kèm theo', ['sốt', 'đau bụng quặn', 'sụt cân', 'đau khớp']]
        ]
    },
    {
        ten: 'Sôi bụng – chướng hơi', nhom: 'Tiêu hóa', fields: [
            ['thoiDiem', 'Thời điểm', ['sau ăn', 'suốt ngày', 'về chiều']],
            ['trungTien', 'Trung tiện', ['nhiều hơi, đỡ chướng', 'không trung tiện được']],
            ['kemTheo', 'Kèm theo', ['đau bụng từng cơn', 'nôn ói', 'tiêu chảy', 'táo bón']]
        ]
    },
    {
        ten: 'Bí trung đại tiện', nhom: 'Tiêu hóa', fields: [
            ['thoiGian', 'Từ bao lâu', null, 'vd 2 ngày nay'],
            ['bung', 'Bụng', ['chướng căng', 'thấy quai ruột nổi', 'mềm']],
            ['kemTheo', 'Kèm theo', ['đau bụng cơn', 'nôn ra dịch xanh', 'nôn ra phân']],
            ['tienCan', 'Tiền căn', ['đã mổ bụng', 'thoát vị bẹn', 'chưa mổ lần nào']]
        ]
    },
    {
        ten: 'Thay đổi thói quen đi cầu', nhom: 'Tiêu hóa', fields: [
            ['kieu', 'Thay đổi kiểu', ['táo bón tăng dần', 'táo lỏng xen kẽ', 'phân dẹt nhỏ lại']],
            ['thoiGian', 'Từ khi nào', null, 'vd 3 tháng nay'],
            ['kemTheo', 'Kèm theo', ['sụt cân', 'tiêu máu', 'thiếu máu', 'đau bụng']]
        ]
    },
    {
        ten: 'Khối sa hậu môn', nhom: 'Tiêu hóa', fields: [
            ['khiNao', 'Sa khi nào', ['khi rặn, tự lên', 'khi rặn, phải đẩy lên', 'sa thường xuyên']],
            ['chayMau', 'Chảy máu', ['máu đỏ tươi nhỏ giọt sau phân', 'dính giấy', 'không chảy máu']],
            ['dau', 'Đau', ['đau nhiều, sờ thấy khối cứng', 'không đau']]
        ]
    },

    /* ---------------- Tiết niệu – sinh dục (bổ sung) ---------------- */
    {
        ten: 'Tiểu lắt nhắt – tiểu gấp', nhom: 'Tiết niệu – sinh dục', fields: [
            ['soLan', 'Số lần/ngày', null, 'vd trên 12 lần'],
            ['luongMoiLan', 'Mỗi lần', ['rất ít', 'bình thường']],
            ['tieuGap', 'Tiểu gấp', ['phải đi ngay, có khi không kịp', 'nhịn được']],
            ['kemTheo', 'Kèm theo', ['tiểu buốt', 'tiểu máu', 'đau hạ vị', 'sốt']]
        ]
    },
    {
        ten: 'Tiểu đục – tiểu mủ', nhom: 'Tiết niệu – sinh dục', fields: [
            ['tinhChat', 'Tính chất', ['đục như nước vo gạo', 'có cặn lắng', 'lợn cợn mủ']],
            ['mui', 'Mùi', ['hôi', 'không hôi']],
            ['kemTheo', 'Kèm theo', ['sốt lạnh run', 'đau hông lưng', 'tiểu buốt']]
        ]
    },
    {
        ten: 'Tiểu bọt', nhom: 'Tiết niệu – sinh dục', fields: [
            ['mucDo', 'Mức độ', ['bọt lâu tan', 'bọt nhiều như xà phòng']],
            ['thoiGian', 'Bao lâu nay', null, 'vd 2 tháng'],
            ['kemTheo', 'Kèm theo', ['phù mi mắt buổi sáng', 'phù chân', 'tăng huyết áp']]
        ]
    },
    {
        ten: 'Bí tiểu cấp', nhom: 'Tiết niệu – sinh dục', fields: [
            ['thoiGian', 'Từ bao lâu', null, 'vd 8 giờ không đi tiểu được'],
            ['camGiac', 'Cảm giác', ['căng tức, mắc tiểu dữ dội', 'đau vùng hạ vị']],
            ['truocDo', 'Trước đó', ['tiểu khó, tia yếu nhiều tháng', 'bình thường', 'sau mổ, sau sinh']],
            ['xuTri', 'Đã xử trí', ['đặt thông tiểu', 'chưa xử trí']]
        ]
    },
    {
        ten: 'Đau tinh hoàn – sưng bìu', nhom: 'Tiết niệu – sinh dục', fields: [
            ['ben', 'Bên nào', ['phải', 'trái', 'hai bên']],
            ['khoiPhat', 'Khởi phát', ['đột ngột dữ dội', 'tăng dần vài ngày']],
            ['kemTheo', 'Kèm theo', ['sốt', 'nôn ói', 'tiểu buốt', 'sau chấn thương']],
            ['dacDiem', 'Đặc điểm', ['bìu đỏ nóng', 'tinh hoàn treo cao', 'sờ thấy khối riêng']]
        ]
    },
    {
        ten: 'Rối loạn cương', nhom: 'Tiết niệu – sinh dục', fields: [
            ['mucDo', 'Mức độ', ['cương không đủ cứng', 'không cương được', 'mất cương buổi sáng']],
            ['thoiGian', 'Bao lâu nay', null, 'vd 1 năm'],
            ['benhNen', 'Bệnh nền', ['đái tháo đường', 'tăng huyết áp', 'trầm cảm', 'không có']]
        ]
    },

    /* ---------------- Thần kinh (bổ sung) ---------------- */
    {
        ten: 'Đau đầu kiểu sét đánh', nhom: 'Thần kinh', fields: [
            ['khoiPhat', 'Đạt đỉnh trong', ['dưới 1 phút', 'vài phút']],
            ['mucDo', 'Mức độ', null, 'vd đau nhất từ trước tới nay, 10/10'],
            ['hoanCanh', 'Đang làm gì', ['gắng sức', 'đi cầu rặn', 'quan hệ', 'nghỉ ngơi']],
            ['kemTheo', 'Kèm theo', ['nôn vọt', 'cứng gáy', 'rối loạn tri giác', 'yếu liệt']]
        ]
    },
    {
        ten: 'Mất thăng bằng – đi loạng choạng', nhom: 'Thần kinh', fields: [
            ['kieu', 'Kiểu', ['loạng choạng như say rượu', 'ngã về một bên', 'không đi trên đường thẳng được']],
            ['nhamMat', 'Khi nhắm mắt', ['nặng hơn rõ', 'không đổi']],
            ['kemTheo', 'Kèm theo', ['chóng mặt xoay', 'nhìn đôi', 'nói khó', 'run tay khi với']],
            ['dienTien', 'Diễn tiến', ['đột ngột', 'tăng dần vài tuần', 'từng cơn']]
        ]
    },
    {
        ten: 'Hay quên – sa sút trí tuệ', nhom: 'Thần kinh', fields: [
            ['kieu', 'Quên kiểu gì', ['quên chuyện vừa xảy ra', 'quên đường về nhà', 'quên tên người thân']],
            ['dienTien', 'Diễn tiến', ['tăng dần nhiều tháng', 'nặng lên từng bậc sau mỗi lần yếu liệt']],
            ['sinhHoat', 'Sinh hoạt', ['tự làm được', 'cần nhắc nhở', 'phụ thuộc hoàn toàn']],
            ['kemTheo', 'Kèm theo', ['thay đổi tính tình', 'ảo giác', 'đi lại chậm chạp', 'tiểu không tự chủ']]
        ]
    },
    {
        ten: 'Đau thần kinh tọa', nhom: 'Thần kinh', fields: [
            ['duongLan', 'Đường lan', ['thắt lưng xuống mặt sau đùi, cẳng chân', 'tới bàn chân, ngón cái', 'tới ngón út']],
            ['tangKhi', 'Tăng khi', ['ho, hắt hơi, rặn', 'đi lại', 'ngồi lâu']],
            ['teYeu', 'Tê – yếu', ['tê theo đường lan', 'yếu bàn chân', 'không tê yếu']],
            ['coVong', 'Rối loạn cơ vòng', ['có bí tiểu hoặc són phân', 'không']]
        ]
    },
    {
        ten: 'Rối loạn cơ vòng', nhom: 'Thần kinh', fields: [
            ['kieu', 'Kiểu', ['bí tiểu', 'tiểu không tự chủ', 'són phân', 'táo bón do mất cảm giác']],
            ['khoiPhat', 'Khởi phát', ['đột ngột', 'tăng dần']],
            ['kemTheo', 'Kèm theo', ['yếu hai chân', 'tê vùng yên ngựa', 'đau lưng dữ dội']]
        ]
    },
    {
        ten: 'Đau nửa đầu có tiền triệu', nhom: 'Thần kinh', fields: [
            ['tienTrieu', 'Tiền triệu', ['ám điểm chớp sáng', 'tê nửa mặt bàn tay', 'nói khó thoáng qua']],
            ['dacDiem', 'Cơn đau', ['một bên, mạch đập', 'sợ ánh sáng, sợ tiếng động', 'buồn nôn, nôn']],
            ['thoiGian', 'Kéo dài', null, 'vd 4–24 giờ'],
            ['tanSuat', 'Tần suất', null, 'vd 2–3 cơn mỗi tháng']
        ]
    },
    {
        ten: 'Cứng gáy – sợ ánh sáng', nhom: 'Thần kinh', fields: [
            ['khoiPhat', 'Từ khi nào', null, 'vd 1 ngày nay'],
            ['kemTheo', 'Kèm theo', ['sốt cao', 'đau đầu dữ dội', 'nôn vọt', 'lơ mơ', 'ban xuất huyết']],
            ['coGiat', 'Co giật', ['có', 'không']]
        ]
    },

    /* ---------------- Cơ xương khớp (bổ sung) ---------------- */
    {
        ten: 'Cứng khớp buổi sáng', nhom: 'Cơ xương khớp', fields: [
            ['thoiGian', 'Cứng bao lâu', ['dưới 30 phút', 'trên 1 giờ']],
            ['viTri', 'Khớp nào', ['bàn ngón tay hai bên', 'cổ tay', 'gối', 'cột sống thắt lưng']],
            ['giamKhi', 'Giảm khi', ['vận động', 'nghỉ ngơi', 'không giảm']]
        ]
    },
    {
        ten: 'Sưng nóng đỏ khớp cấp', nhom: 'Cơ xương khớp', fields: [
            ['viTri', 'Khớp', ['bàn ngón chân cái', 'cổ chân', 'gối', 'cổ tay']],
            ['khoiPhat', 'Khởi phát', ['đột ngột ban đêm', 'tăng dần vài ngày']],
            ['yeuTo', 'Sau khi', ['nhậu, ăn hải sản', 'dùng lợi tiểu', 'chấn thương', 'không rõ']],
            ['tienCan', 'Đã từng', null, 'vd cơn thứ 4 trong năm, có hạt tophi']
        ]
    },
    {
        ten: 'Hạn chế vận động khớp', nhom: 'Cơ xương khớp', fields: [
            ['khop', 'Khớp nào', ['vai', 'gối', 'háng', 'khuỷu', 'cột sống']],
            ['dongTac', 'Không làm được', null, 'vd không chải tóc, không ngồi xổm được'],
            ['dau', 'Đau kèm', ['đau khi vận động', 'đau cả khi nghỉ', 'không đau']]
        ]
    },
    {
        ten: 'Biến dạng khớp', nhom: 'Cơ xương khớp', fields: [
            ['kieu', 'Kiểu biến dạng', ['bàn tay gió thổi', 'ngón hình cổ cò', 'gối vẹo', 'gù vẹo cột sống']],
            ['thoiGian', 'Từ bao lâu', null, 'vd nhiều năm, nặng dần'],
            ['chucNang', 'Ảnh hưởng', ['cầm nắm khó', 'đi lại khó', 'chưa ảnh hưởng']]
        ]
    },
    {
        ten: 'Đau xương về đêm', nhom: 'Cơ xương khớp', fields: [
            ['viTri', 'Vị trí', ['cột sống', 'xương chậu', 'xương dài chi dưới', 'nhiều nơi']],
            ['dacDiem', 'Đặc điểm', ['đau tăng về đêm', 'không giảm khi nghỉ', 'thuốc giảm đau thường không đỡ']],
            ['kemTheo', 'Kèm theo', ['sụt cân', 'gãy xương tự nhiên', 'thiếu máu', 'sốt']]
        ]
    },
    {
        ten: 'Đau gót chân', nhom: 'Cơ xương khớp', fields: [
            ['thoiDiem', 'Đau nhất khi', ['bước chân đầu tiên buổi sáng', 'sau đứng lâu', 'cả ngày']],
            ['viTri', 'Vị trí', ['mặt dưới gót', 'sau gót, chỗ bám gân gót']],
            ['kemTheo', 'Kèm theo', ['đau lưng, viêm khớp cùng chậu', 'không kèm gì']]
        ]
    },

    /* ---------------- Da – niêm (bổ sung) ---------------- */
    {
        ten: 'Mụn nước – bóng nước', nhom: 'Da – niêm', fields: [
            ['viTri', 'Vị trí', ['thành chùm một bên theo khoanh da', 'quanh miệng', 'lòng bàn tay chân', 'toàn thân']],
            ['dacDiem', 'Đặc điểm', ['căng, dịch trong', 'dịch đục', 'dễ vỡ để lại trợt']],
            ['camGiac', 'Cảm giác', ['đau rát nhiều', 'ngứa', 'không đau']],
            ['niemMac', 'Niêm mạc', ['có tổn thương miệng, mắt, sinh dục', 'không']]
        ]
    },
    {
        ten: 'Mề đay – phù mạch', nhom: 'Da – niêm', fields: [
            ['thoiGian', 'Mỗi đợt kéo dài', ['dưới 24 giờ rồi mất', 'trên 24 giờ, để lại vết thâm']],
            ['yeuTo', 'Sau khi', ['ăn thức ăn lạ', 'uống thuốc', 'côn trùng đốt', 'không rõ']],
            ['phuMach', 'Phù mạch', ['sưng môi, mi mắt', 'khàn tiếng, khó thở', 'không']],
            ['dienTien', 'Diễn tiến', null, 'vd tái phát hằng ngày trên 6 tuần']
        ]
    },
    {
        ten: 'Sạm da – tăng sắc tố', nhom: 'Da – niêm', fields: [
            ['viTri', 'Rõ nhất ở', ['vùng hở, mặt', 'nếp gấp, sẹo cũ', 'niêm mạc miệng', 'toàn thân']],
            ['thoiGian', 'Từ khi nào', null, 'vd 6 tháng nay'],
            ['kemTheo', 'Kèm theo', ['sụt cân, mệt mỏi', 'huyết áp thấp', 'thèm ăn mặn', 'không kèm gì']]
        ]
    },
    {
        ten: 'Rụng tóc', nhom: 'Da – niêm', fields: [
            ['kieu', 'Kiểu rụng', ['rụng lan tỏa', 'từng mảng tròn', 'rụng vùng đỉnh trán']],
            ['thoiGian', 'Từ khi nào', null, 'vd 3 tháng sau sinh'],
            ['kemTheo', 'Kèm theo', ['ban cánh bướm', 'đau khớp', 'sụt cân', 'sau hóa trị', 'không kèm gì']]
        ]
    },
    {
        ten: 'Móng dùi trống', nhom: 'Da – niêm', fields: [
            ['thoiGian', 'Từ khi nào', null, 'vd nhiều năm nay'],
            ['kemTheo', 'Kèm theo', ['ho kéo dài', 'khó thở', 'tím môi', 'tiêu chảy mạn']]
        ]
    },
    {
        ten: 'Vảy da – bong tróc', nhom: 'Da – niêm', fields: [
            ['viTri', 'Vị trí', ['mặt duỗi khuỷu, gối', 'da đầu', 'nếp gấp', 'toàn thân']],
            ['dacDiem', 'Đặc điểm', ['vảy trắng dày, cạo ra như nến', 'vảy mỡ vàng', 'da đỏ bong toàn thân']],
            ['kemTheo', 'Kèm theo', ['ngứa', 'đau khớp', 'tổn thương móng']]
        ]
    },

    /* ---------------- Tai – mũi – họng (bổ sung) ---------------- */
    {
        ten: 'Chảy mủ tai', nhom: 'Tai – mũi – họng', fields: [
            ['ben', 'Bên', ['phải', 'trái', 'hai bên']],
            ['tinhChat', 'Tính chất', ['mủ vàng đặc, hôi', 'dịch trong', 'lẫn máu']],
            ['thoiGian', 'Bao lâu', null, 'vd chảy tái đi tái lại 2 năm'],
            ['kemTheo', 'Kèm theo', ['nghe kém', 'đau tai', 'chóng mặt', 'liệt mặt', 'sốt']]
        ]
    },
    {
        ten: 'Đau tai', nhom: 'Tai – mũi – họng', fields: [
            ['ben', 'Bên', ['phải', 'trái', 'hai bên']],
            ['tinhChat', 'Tính chất', ['đau nhói từng cơn', 'đau âm ỉ', 'đau tăng khi kéo vành tai']],
            ['kemTheo', 'Kèm theo', ['sốt', 'chảy dịch tai', 'nghe kém', 'sau viêm mũi họng']]
        ]
    },
    {
        ten: 'Nuốt vướng – cảm giác dị vật họng', nhom: 'Tai – mũi – họng', fields: [
            ['viTri', 'Cảm giác vướng ở', ['ngang cổ', 'sau xương ức']],
            ['thoiGian', 'Bao lâu', null, 'vd 2 tháng nay'],
            ['kemTheo', 'Kèm theo', ['khàn tiếng', 'sụt cân', 'ợ chua', 'hạch cổ', 'không kèm gì']]
        ]
    },
    {
        ten: 'Đau nhức vùng mặt – xoang', nhom: 'Tai – mũi – họng', fields: [
            ['viTri', 'Vị trí', ['trán', 'gò má', 'quanh hốc mắt', 'sau gáy']],
            ['tangKhi', 'Tăng khi', ['cúi đầu', 'buổi sáng', 'thay đổi thời tiết']],
            ['kemTheo', 'Kèm theo', ['nghẹt mũi', 'chảy mũi đục', 'chảy mũi sau', 'giảm khứu giác', 'sốt']]
        ]
    },
    {
        ten: 'Mất mùi – giảm khứu giác', nhom: 'Tai – mũi – họng', fields: [
            ['mucDo', 'Mức độ', ['giảm', 'mất hẳn']],
            ['khoiPhat', 'Khởi phát', ['đột ngột sau nhiễm siêu vi', 'tăng dần', 'sau chấn thương đầu']],
            ['kemTheo', 'Kèm theo', ['nghẹt mũi', 'polyp mũi', 'không kèm gì']]
        ]
    },
    {
        ten: 'Sưng hạch vùng cổ', nhom: 'Tai – mũi – họng', fields: [
            ['viTri', 'Vị trí', ['dưới hàm', 'cảnh máng cổ', 'thượng đòn', 'sau tai']],
            ['kichThuoc', 'Kích thước', null, 'vd 2 cm, một khối'],
            ['tinhChat', 'Tính chất', ['mềm, di động, đau', 'chắc, dính, không đau', 'hóa mủ vỡ ra']],
            ['kemTheo', 'Kèm theo', ['sốt', 'viêm họng', 'sụt cân', 'nghẹt mũi một bên, ù tai']]
        ]
    },

    /* ---------------- Mắt (bổ sung) ---------------- */
    {
        ten: 'Đau nhức mắt', nhom: 'Mắt', fields: [
            ['ben', 'Bên', ['phải', 'trái', 'hai bên']],
            ['tinhChat', 'Tính chất', ['nhức sâu trong hốc mắt', 'cộm như có cát', 'đau khi liếc mắt']],
            ['kemTheo', 'Kèm theo', ['nhìn mờ', 'thấy quầng xanh đỏ quanh đèn', 'buồn nôn, nôn', 'đỏ mắt']],
            ['khoiPhat', 'Khởi phát', ['đột ngột dữ dội', 'tăng dần']]
        ]
    },
    {
        ten: 'Mất thị lực đột ngột', nhom: 'Mắt', fields: [
            ['ben', 'Bên', ['một mắt', 'hai mắt', 'nửa thị trường']],
            ['thoiGian', 'Kéo dài', ['thoáng qua vài phút rồi hồi phục', 'kéo dài, chưa hồi phục']],
            ['dau', 'Đau kèm', ['có đau nhức', 'không đau']],
            ['kemTheo', 'Kèm theo', ['ruồi bay, chớp sáng', 'như màn che kéo xuống', 'yếu nửa người', 'đau thái dương']]
        ]
    },
    {
        ten: 'Ruồi bay – chớp sáng', nhom: 'Mắt', fields: [
            ['khoiPhat', 'Từ khi nào', null, 'vd 3 ngày nay, tăng nhiều'],
            ['mucDo', 'Mức độ', ['vài chấm đen', 'như mưa bồ hóng']],
            ['kemTheo', 'Kèm theo', ['thấy màn che một phần thị trường', 'giảm thị lực', 'không kèm gì']],
            ['yeuTo', 'Yếu tố', ['cận thị nặng', 'sau chấn thương', 'sau mổ thể thủy tinh']]
        ]
    },
    {
        ten: 'Chảy nước mắt sống', nhom: 'Mắt', fields: [
            ['ben', 'Bên', ['phải', 'trái', 'hai bên']],
            ['thoiDiem', 'Khi nào', ['thường xuyên', 'ra gió, ra nắng']],
            ['kemTheo', 'Kèm theo', ['ghèn nhiều', 'sưng đau góc trong mắt', 'cộm mắt']]
        ]
    },
    {
        ten: 'Sợ ánh sáng – cộm mắt', nhom: 'Mắt', fields: [
            ['mucDo', 'Mức độ', ['nheo mắt khi ra sáng', 'không mở mắt được']],
            ['kemTheo', 'Kèm theo', ['đỏ quanh rìa giác mạc', 'chảy nước mắt', 'nhìn mờ', 'đau nhức']],
            ['yeuTo', 'Sau khi', ['hàn điện, ra nắng gắt', 'đeo kính tiếp xúc', 'dị vật bay vào', 'không rõ']]
        ]
    },
    {
        ten: 'Lồi mắt', nhom: 'Mắt', fields: [
            ['ben', 'Bên', ['một bên', 'hai bên']],
            ['dienTien', 'Diễn tiến', ['tăng dần nhiều tháng', 'nhanh trong vài tuần']],
            ['kemTheo', 'Kèm theo', ['nhìn đôi', 'co kéo mi trên', 'sụt cân, hồi hộp', 'đau nhức, đỏ mắt']]
        ]
    },
    {
        ten: 'Quáng gà – nhìn kém ban đêm', nhom: 'Mắt', fields: [
            ['thoiGian', 'Từ khi nào', null, 'vd từ nhỏ, nặng dần'],
            ['thiTruong', 'Thị trường', ['thu hẹp dần hai bên', 'bình thường']],
            ['tienCan', 'Tiền căn', ['gia đình có người tương tự', 'suy dinh dưỡng', 'không rõ']]
        ]
    },

    /* ---------------- Nội tiết – chuyển hóa (bổ sung) ---------------- */
    {
        ten: 'Sợ nóng – vã mồ hôi nhiều', nhom: 'Nội tiết – chuyển hóa', fields: [
            ['mucDo', 'Mức độ', ['phải bật quạt liên tục', 'ướt áo cả ngày']],
            ['kemTheo', 'Kèm theo', ['sụt cân dù ăn nhiều', 'hồi hộp', 'run tay', 'tiêu lỏng', 'mất ngủ']],
            ['thoiGian', 'Bao lâu nay', null, 'vd 4 tháng']
        ]
    },
    {
        ten: 'Sợ lạnh – da khô', nhom: 'Nội tiết – chuyển hóa', fields: [
            ['kemTheo', 'Kèm theo', ['tăng cân', 'táo bón', 'ngủ nhiều, chậm chạp', 'rụng tóc', 'phù mặt']],
            ['thoiGian', 'Bao lâu nay', null, 'vd 6 tháng'],
            ['tienCan', 'Tiền căn', ['đã mổ tuyến giáp', 'đã uống iốt phóng xạ', 'không']]
        ]
    },
    {
        ten: 'Cơn hạ đường huyết', nhom: 'Nội tiết – chuyển hóa', fields: [
            ['bieuHien', 'Biểu hiện', ['vã mồ hôi, run tay, đói cồn cào', 'lơ mơ, nói nhảm', 'hôn mê, co giật']],
            ['thoiDiem', 'Thời điểm', ['xa bữa ăn', 'ban đêm', 'sau tiêm insulin', 'sau gắng sức']],
            ['duongHuyet', 'Đường huyết đo được', null, 'vd 45 mg/dL'],
            ['xuTri', 'Xử trí', ['ăn ngọt là hết', 'phải truyền đường']]
        ]
    },
    {
        ten: 'Mặt tròn – rạn da đỏ', nhom: 'Nội tiết – chuyển hóa', fields: [
            ['dacDiem', 'Đặc điểm', ['mặt tròn đỏ', 'gáy trâu', 'bụng to, chi teo', 'rạn da tím rộng']],
            ['thuoc', 'Thuốc', null, 'vd uống thuốc bắc tán có corticoid nhiều tháng'],
            ['kemTheo', 'Kèm theo', ['tăng huyết áp', 'đường huyết cao', 'yếu cơ gốc chi', 'dễ bầm da']]
        ]
    },
    {
        ten: 'Rậm lông – nam hóa', nhom: 'Nội tiết – chuyển hóa', fields: [
            ['viTri', 'Vị trí', ['mặt, cằm', 'ngực bụng', 'quanh rốn']],
            ['kemTheo', 'Kèm theo', ['kinh thưa, vô kinh', 'mụn nhiều', 'giọng trầm', 'hói trán']],
            ['dienTien', 'Diễn tiến', ['tăng chậm nhiều năm', 'tăng nhanh vài tháng']]
        ]
    },
    {
        ten: 'Chậm phát triển chiều cao', nhom: 'Nội tiết – chuyển hóa', fields: [
            ['chieuCao', 'Chiều cao hiện tại', null, 'vd 118 cm lúc 11 tuổi'],
            ['tocDo', 'Tốc độ', null, 'vd chỉ cao thêm 2 cm trong 1 năm'],
            ['dayThi', 'Dấu dậy thì', ['chưa có', 'đã có']],
            ['giaDinh', 'Chiều cao cha mẹ', null, 'vd cha 168 cm, mẹ 155 cm']
        ]
    },

    /* ---------------- Huyết học (bổ sung) ---------------- */
    {
        ten: 'Da niêm nhợt', nhom: 'Huyết học', fields: [
            ['thoiGian', 'Từ khi nào', null, 'vd 3 tháng, nhợt dần'],
            ['kemTheo', 'Kèm theo', ['mệt khi gắng sức', 'chóng mặt', 'hồi hộp', 'ăn kém']],
            ['nguonMat', 'Có mất máu không', ['rong kinh', 'tiêu phân đen', 'trĩ chảy máu', 'không rõ']],
            ['anUong', 'Ăn uống', ['ăn chay trường', 'kiêng khem', 'bình thường']]
        ]
    },
    {
        ten: 'Sốt khi đang giảm bạch cầu hạt', nhom: 'Huyết học', fields: [
            ['hoaTri', 'Sau hóa trị', null, 'vd ngày 10 sau đợt hóa trị thứ 2'],
            ['nhietDo', 'Nhiệt độ', null, 'vd 38,8°C'],
            ['oNhiem', 'Ổ nhiễm nghi ngờ', ['miệng họng', 'phổi', 'hậu môn', 'chỗ đặt catheter', 'chưa rõ']],
            ['bachCau', 'Bạch cầu hạt', null, 'vd neutrophil 0,3 K/µL']
        ]
    },
    {
        ten: 'Rong kinh – cường kinh', nhom: 'Huyết học', fields: [
            ['soNgay', 'Số ngày hành kinh', null, 'vd 10 ngày'],
            ['luong', 'Lượng', null, 'vd thay 6–8 băng mỗi ngày, có cục máu đông'],
            ['thoiGian', 'Từ bao lâu', null, 'vd 6 tháng nay'],
            ['kemTheo', 'Kèm theo', ['mệt, da xanh', 'bầm da', 'chảy máu răng', 'không kèm gì']]
        ]
    },
    {
        ten: 'Huyết khối tái phát', nhom: 'Huyết học', fields: [
            ['viTri', 'Vị trí các lần', null, 'vd huyết khối tĩnh mạch sâu chân trái, thuyên tắc phổi'],
            ['soLan', 'Số lần', null, 'vd lần thứ 3 trong 2 năm'],
            ['hoanCanh', 'Hoàn cảnh', ['sau bất động, sau mổ', 'tự nhiên', 'đang dùng thuốc ngừa thai']],
            ['giaDinh', 'Gia đình', ['có người bị huyết khối trẻ tuổi', 'không']]
        ]
    },
    {
        ten: 'Ngứa sau tắm nước nóng', nhom: 'Huyết học', fields: [
            ['thoiGian', 'Từ khi nào', null, 'vd 1 năm nay'],
            ['kemTheo', 'Kèm theo', ['mặt đỏ bừng', 'đau rát đầu chi', 'nhức đầu', 'lách to']]
        ]
    },
    {
        ten: 'Phụ thuộc truyền máu', nhom: 'Huyết học', fields: [
            ['tanSuat', 'Bao lâu truyền một lần', null, 'vd mỗi 4 tuần'],
            ['tuKhi', 'Từ khi nào', null, 'vd từ 2 tuổi'],
            ['kemTheo', 'Kèm theo', ['bụng to, lách to', 'biến dạng xương mặt', 'da sạm', 'chậm lớn']]
        ]
    },

    /* ---------------- Tâm thần (bổ sung) ---------------- */
    {
        ten: 'Hoang tưởng – ảo giác', nhom: 'Tâm thần', fields: [
            ['noiDung', 'Nội dung', ['nghe tiếng nói trong đầu', 'nghĩ có người hại mình', 'nhìn thấy hình ảnh lạ']],
            ['thoiGian', 'Từ bao lâu', null, 'vd 3 tháng nay'],
            ['hanhVi', 'Hành vi kèm', ['thu mình, không tiếp xúc', 'kích động', 'bỏ ăn, bỏ ngủ']],
            ['chatKichThich', 'Rượu – chất', ['đang uống rượu nhiều', 'dùng chất kích thích', 'không']]
        ]
    },
    {
        ten: 'Kích động – hành vi gây hại', nhom: 'Tâm thần', fields: [
            ['bieuHien', 'Biểu hiện', ['la hét, đập phá', 'đe dọa người khác', 'tự làm đau mình']],
            ['khoiPhat', 'Khởi phát', ['đột ngột', 'tăng dần vài ngày']],
            ['yeuTo', 'Yếu tố', ['ngưng rượu đột ngột', 'bỏ thuốc điều trị', 'sau sang chấn', 'không rõ']],
            ['anToan', 'An toàn', null, 'vd cần người nhà giữ, đã có gây thương tích']
        ]
    },
    {
        ten: 'Cơn hoảng loạn', nhom: 'Tâm thần', fields: [
            ['bieuHien', 'Trong cơn', ['hồi hộp, khó thở', 'tê tay chân', 'sợ chết, sợ phát điên', 'vã mồ hôi']],
            ['thoiGian', 'Đạt đỉnh trong', null, 'vd vài phút, kéo dài 20 phút'],
            ['tanSuat', 'Tần suất', null, 'vd 2–3 cơn mỗi tuần'],
            ['neTranh', 'Né tránh', ['sợ ra khỏi nhà một mình', 'sợ chỗ đông người', 'không né tránh']]
        ]
    },
    {
        ten: 'Ý tưởng tự sát', nhom: 'Tâm thần', fields: [
            ['mucDo', 'Mức độ', ['chán sống, không muốn tiếp tục', 'có nghĩ tới cách làm', 'đã có kế hoạch cụ thể', 'đã từng thực hiện']],
            ['thoiGian', 'Từ khi nào', null, 'vd 2 tuần nay, dày lên'],
            ['nguyCo', 'Yếu tố nguy cơ', ['sống một mình', 'mất mát gần đây', 'đang có sẵn phương tiện', 'lạm dụng rượu']],
            ['hoTro', 'Chỗ dựa', null, 'vd có gia đình bên cạnh, đã báo người thân']
        ]
    },
    {
        ten: 'Lạm dụng rượu – hội chứng cai', nhom: 'Tâm thần', fields: [
            ['luong', 'Lượng uống', null, 'vd 500 ml rượu 40 độ mỗi ngày, 15 năm'],
            ['lanCuoi', 'Lần uống cuối', null, 'vd 36 giờ trước'],
            ['trieuChung', 'Triệu chứng cai', ['run tay, vã mồ hôi', 'lo âu, mất ngủ', 'ảo giác', 'co giật']],
            ['tienCan', 'Đã từng', ['sảng rượu', 'co giật khi cai', 'chưa từng']]
        ]
    },
    {
        ten: 'Thay đổi nhân cách – hành vi bất thường', nhom: 'Tâm thần', fields: [
            ['moTa', 'Người nhà mô tả', null, 'vd trước hiền, nay dễ nổi nóng, nói tục'],
            ['thoiGian', 'Từ khi nào', null, 'vd 6 tháng nay'],
            ['kemTheo', 'Kèm theo', ['hay quên', 'ăn uống thay đổi', 'mất kiểm soát hành vi', 'động kinh']]
        ]
    },

    /* ---------------- Sản phụ khoa (bổ sung) ---------------- */
    {
        ten: 'Nghén nặng – nôn nhiều khi có thai', nhom: 'Sản phụ khoa', fields: [
            ['tuoiThai', 'Tuổi thai', null, 'vd 9 tuần'],
            ['soLan', 'Số lần nôn', null, 'vd trên 10 lần mỗi ngày'],
            ['anUong', 'Ăn uống', ['không giữ được thức ăn nước uống', 'ăn ít vẫn giữ được']],
            ['sutCan', 'Sụt cân', null, 'vd sụt 4 kg so với trước mang thai'],
            ['kemTheo', 'Kèm theo', ['tiểu ít, nước tiểu sẫm', 'chóng mặt', 'không kèm gì']]
        ]
    },
    {
        ten: 'Đau bụng dưới ở phụ nữ', nhom: 'Sản phụ khoa', fields: [
            ['viTri', 'Vị trí', ['hạ vị', 'hố chậu phải', 'hố chậu trái', 'hai bên']],
            ['lienQuanKinh', 'Liên quan kinh nguyệt', ['đau trước và trong hành kinh', 'đau giữa chu kỳ', 'không liên quan']],
            ['thoiGian', 'Kéo dài', null, 'vd âm ỉ 6 tháng nay'],
            ['kemTheo', 'Kèm theo', ['ra huyết bất thường', 'huyết trắng hôi', 'đau khi giao hợp', 'sốt']]
        ]
    },
    {
        ten: 'Rối loạn kinh nguyệt', nhom: 'Sản phụ khoa', fields: [
            ['kieu', 'Kiểu rối loạn', ['kinh thưa, trên 35 ngày', 'kinh mau, dưới 21 ngày', 'vô kinh', 'ra huyết giữa kỳ']],
            ['thoiGian', 'Từ bao lâu', null, 'vd 1 năm nay'],
            ['kemTheo', 'Kèm theo', ['tăng cân, rậm lông', 'tiết sữa ngoài thai kỳ', 'bốc hỏa', 'sụt cân nhiều']],
            ['kinhChot', 'Kinh chót', null, 'vd 20/5']
        ]
    },
    {
        ten: 'Thống kinh', nhom: 'Sản phụ khoa', fields: [
            ['mucDo', 'Mức độ', ['chịu được', 'phải uống thuốc giảm đau', 'phải nghỉ học nghỉ làm']],
            ['thoiDiem', 'Thời điểm', ['ngay ngày đầu hành kinh', 'trước hành kinh vài ngày']],
            ['dienTien', 'Diễn tiến', ['có từ lần hành kinh đầu tiên', 'mới xuất hiện, nặng dần']],
            ['kemTheo', 'Kèm theo', ['đau khi giao hợp', 'khó có thai', 'tiêu chảy khi hành kinh']]
        ]
    },
    {
        ten: 'Khối u vú – tiết dịch núm vú', nhom: 'Sản phụ khoa', fields: [
            ['viTri', 'Vị trí', ['vú phải', 'vú trái', 'hai bên']],
            ['kichThuoc', 'Kích thước', null, 'vd 2 cm, góc phần tư trên ngoài'],
            ['tinhChat', 'Tính chất', ['chắc, không đau, dính', 'mềm, di động, đau theo chu kỳ']],
            ['tietDich', 'Tiết dịch', ['máu', 'dịch trong', 'sữa', 'không tiết dịch']],
            ['daHach', 'Da – hạch', ['da sần vỏ cam, tụt núm vú', 'hạch nách', 'bình thường']]
        ]
    },
    {
        ten: 'Phù – tăng huyết áp thai kỳ', nhom: 'Sản phụ khoa', fields: [
            ['tuoiThai', 'Tuổi thai', null, 'vd 34 tuần'],
            ['huyetAp', 'Huyết áp', null, 'vd 160/100 mmHg'],
            ['phu', 'Phù', ['hai chân', 'mặt và tay', 'toàn thân, tăng cân nhanh']],
            ['dauHieuNang', 'Dấu hiệu nặng', ['nhức đầu', 'nhìn mờ', 'đau thượng vị', 'thiểu niệu', 'không có']]
        ]
    },
    {
        ten: 'Cơn co tử cung dọa sinh non', nhom: 'Sản phụ khoa', fields: [
            ['tuoiThai', 'Tuổi thai', null, 'vd 30 tuần'],
            ['tanSuat', 'Cơn co', null, 'vd 3 cơn trong 10 phút, mỗi cơn 30 giây'],
            ['raHuyet', 'Ra huyết – ra nhớt hồng', ['có', 'không']],
            ['raNuoc', 'Ra nước', ['có', 'không']],
            ['xuTri', 'Đã xử trí', null, 'vd đã tiêm 1 liều corticoid trưởng thành phổi']
        ]
    },

    /* ---------------- Nhi khoa (bổ sung) ---------------- */
    {
        ten: 'Co giật do sốt', nhom: 'Nhi khoa', fields: [
            ['tuoi', 'Tuổi', null, 'vd 18 tháng'],
            ['kieuGiat', 'Kiểu giật', ['toàn thân', 'cục bộ một bên']],
            ['thoiGian', 'Kéo dài', null, 'vd 2 phút'],
            ['soCon', 'Số cơn trong đợt sốt', null, 'vd 1 cơn'],
            ['sauCon', 'Sau cơn', ['tỉnh lại ngay', 'lơ mơ kéo dài', 'yếu liệt sau cơn']]
        ]
    },
    {
        ten: 'Vàng da sơ sinh', nhom: 'Nhi khoa', fields: [
            ['ngayTuoi', 'Ngày tuổi xuất hiện', null, 'vd ngày thứ 3'],
            ['vungVang', 'Vàng tới đâu', ['mặt', 'tới ngực bụng', 'tới đùi', 'tới lòng bàn tay chân']],
            ['bu', 'Bú', ['bú tốt', 'bú kém', 'bỏ bú']],
            ['kemTheo', 'Kèm theo', ['li bì', 'gồng ưỡn người', 'phân bạc màu', 'tiểu sẫm']],
            ['nhomMau', 'Nhóm máu mẹ con', null, 'vd mẹ O, con A']
        ]
    },
    {
        ten: 'Chậm phát triển tâm thần vận động', nhom: 'Nhi khoa', fields: [
            ['moc', 'Mốc chưa đạt', null, 'vd 14 tháng chưa tự ngồi, chưa nói từ đơn'],
            ['linhVuc', 'Lĩnh vực', ['vận động thô', 'vận động tinh', 'ngôn ngữ', 'giao tiếp xã hội']],
            ['dienTien', 'Diễn tiến', ['chậm từ đầu', 'từng đạt rồi mất kỹ năng']],
            ['tienCan', 'Tiền căn', ['sinh non, ngạt', 'vàng da nặng', 'co giật', 'không']]
        ]
    },
    {
        ten: 'Khóc cơn – khóc dạ đề', nhom: 'Nhi khoa', fields: [
            ['thoiDiem', 'Thời điểm', ['chiều tối', 'ban đêm', 'bất kỳ lúc nào']],
            ['thoiGian', 'Mỗi cơn', null, 'vd trên 3 giờ, 4 ngày mỗi tuần'],
            ['duDo', 'Dỗ có nín không', ['dỗ được', 'dỗ không nín']],
            ['kemTheo', 'Kèm theo', ['ưỡn người, co chân', 'nôn trớ', 'tiêu máu', 'sốt', 'không kèm gì']]
        ]
    },
    {
        ten: 'Sốt phát ban ở trẻ', nhom: 'Nhi khoa', fields: [
            ['thuTu', 'Ban xuất hiện', ['sau khi hết sốt', 'trong lúc còn sốt']],
            ['viTri', 'Ban bắt đầu từ', ['mặt rồi lan xuống', 'thân mình', 'toàn thân cùng lúc']],
            ['dacDiem', 'Đặc điểm ban', ['dát sẩn đỏ', 'ban xuất huyết ấn không mất', 'mụn nước']],
            ['kemTheo', 'Kèm theo', ['ho, chảy mũi, đỏ mắt', 'hạch sau tai', 'loét miệng', 'sưng đau khớp']],
            ['chungNgua', 'Chủng ngừa', null, 'vd chưa tiêm sởi']
        ]
    },
    {
        ten: 'Ho cơn kéo dài ở trẻ', nhom: 'Nhi khoa', fields: [
            ['kieuCon', 'Kiểu cơn', ['ho rũ rượi từng chuỗi', 'ho tới nôn ói', 'ho có tiếng rít cuối cơn']],
            ['thoiDiem', 'Thời điểm', ['về đêm', 'suốt ngày']],
            ['giuaCon', 'Giữa các cơn', ['trẻ vẫn chơi bình thường', 'mệt, tím môi']],
            ['chungNgua', 'Chủng ngừa', null, 'vd chưa tiêm đủ mũi ho gà']
        ]
    },
    {
        ten: 'Suy dinh dưỡng – phù dinh dưỡng', nhom: 'Nhi khoa', fields: [
            ['canNang', 'Cân nặng – chiều cao', null, 'vd 8 kg / 82 cm lúc 2 tuổi'],
            ['dacDiem', 'Đặc điểm', ['gầy đét, mất lớp mỡ', 'phù hai mu bàn chân', 'tóc thưa dễ rụng', 'da bong mảng']],
            ['anUong', 'Chế độ ăn', null, 'vd chỉ ăn cháo trắng với nước mắm'],
            ['kemTheo', 'Kèm theo', ['tiêu chảy kéo dài', 'nhiễm trùng tái đi tái lại', 'chậm phát triển']]
        ]
    },
];

/* =====================================================================
   Quan hệ ngữ cảnh — bốn trường tri thức gắn thêm cho triệu chứng hay gặp.
   Khai báo tách riêng cho khỏi phình bảng SYMPTOMS ở trên, rồi trộn vào:
     coOccurring        chùm triệu chứng dương tính hay đi kèm (bấm 1 chạm là thêm)
     pertinentNegatives [câu âm tính, hỏi để loại trừ cái gì]
     examTargets        khám gì cho trúng, gom theo đúng ô khám ở mục VI
     redFlags           bệnh cảnh nguy hiểm phải loại trừ
   ===================================================================== */
const CONTEXT = {
    'Chấn thương ngực': {
        coOccurring: ['Khó thở', 'Đau ngực kiểu màng phổi', 'Ho ra máu', 'Lép bép khí dưới da', 'Tím tái'],
        pertinentNegatives: [
            ['không ngất, không quên lúc tai nạn', 'chấn thương sọ não kèm theo'],
            ['không đau bụng, không nôn ói', 'chấn thương bụng kín – vỡ tạng'],
            ['không đau cột sống, không tê yếu chi', 'chấn thương cột sống'],
            ['không tiểu máu', 'chấn thương thận – niệu'],
            ['không đau ngực xé lan sau lưng', 'vỡ eo động mạch chủ do giảm tốc']
        ],
        examTargets: {
            'exam-chest': ['Điểm đau chói và lạo xạo xương sườn', 'Mảng ngực di động ngược chiều khi thở',
                'Lép bép khí dưới da', 'Vết bầm – dấu dây an toàn', 'Lồng ngực di động không đều hai bên'],
            'exam-lung': ['Rì rào phế nang giảm / mất một bên', 'Gõ vang (tràn khí) hay gõ đục (tràn máu)', 'Rung thanh giảm'],
            'exam-general': ['Tĩnh mạch cổ (nổi căng hay xẹp)', 'Khí quản có lệch không', 'Mạch – huyết áp – SpO2', 'Da niêm nhợt, chi lạnh']
        },
        redFlags: ['Tràn khí màng phổi áp lực', 'Tràn máu màng phổi lượng lớn', 'Mảng sườn di động suy hô hấp',
            'Chèn ép tim cấp', 'Vỡ động mạch chủ ngực', 'Vỡ khí – phế quản']
    },
    'Vết thương vùng ngực': {
        coOccurring: ['Khó thở', 'Đau ngực', 'Tím tái', 'Chảy máu vết thương', 'Lép bép khí dưới da'],
        pertinentNegatives: [
            ['không có vết thương thứ hai (tìm cả lỗ vào – lỗ ra)', 'bỏ sót đường đi vết thương'],
            ['không đau bụng, không đề kháng thành bụng', 'vết thương thấu cơ hoành vào ổ bụng'],
            ['không lơ mơ, không vã mồ hôi lạnh', 'sốc mất máu, chèn ép tim'],
            ['không tê yếu tay cùng bên', 'tổn thương đám rối thần kinh cánh tay – mạch dưới đòn']
        ],
        examTargets: {
            'exam-chest': ['Vị trí vết thương so với tam giác nguy hiểm trước tim', 'Khí phì phò qua vết thương',
                'Lép bép khí dưới da', 'Tìm lỗ vào – lỗ ra'],
            'exam-heart': ['Tiếng tim mờ xa xăm', 'Mạch nghịch', 'Huyết áp tụt kẹp'],
            'exam-lung': ['Rì rào phế nang một bên', 'Gõ vang hay gõ đục'],
            'exam-general': ['Tĩnh mạch cổ nổi căng (Beck) hay xẹp (mất máu)', 'Mạch – huyết áp – tri giác']
        },
        redFlags: ['Vết thương tim – chèn ép tim cấp', 'Vết thương ngực hở phì phò', 'Tràn khí màng phổi áp lực',
            'Tràn máu màng phổi lượng lớn', 'Vết thương thấu cơ hoành']
    },
    'Phù áo khoác – sưng mặt cổ': {
        coOccurring: ['Khó thở', 'Khàn tiếng', 'Nuốt khó', 'Đau đầu', 'Ho', 'Sụt cân'],
        pertinentNegatives: [
            ['không phù hai chân, không tiểu ít', 'suy tim, hội chứng thận hư'],
            ['không đặt catheter tĩnh mạch trung tâm trước đó', 'huyết khối do catheter'],
            ['không sốt, không đau họng', 'phù mặt do nhiễm trùng – dị ứng'],
            ['không nổi mề đay, không khó thở thanh quản đột ngột', 'phù mạch dị ứng']
        ],
        examTargets: {
            'exam-general': ['Phù mặt – cổ – nửa trên ngực, phù ấn không lõm', 'Tĩnh mạch cổ nổi to không đập',
                'Tuần hoàn bàng hệ ngực trước', 'Hạch thượng đòn', 'Nghiệm pháp Pemberton (đỏ mặt khi giơ hai tay)'],
            'exam-lung': ['Rì rào phế nang giảm khu trú', 'Tiếng rít thanh – khí quản'],
            'exam-heart': ['Tiếng tim mờ', 'Mạch nghịch']
        },
        redFlags: ['Hội chứng chèn ép tĩnh mạch chủ trên', 'Chèn ép khí quản', 'U trung thất ác tính', 'Ung thư phổi xâm lấn']
    },
    'Hoại tử đầu ngón': {
        coOccurring: ['Đau cách hồi', 'Đau chi cấp – mất mạch', 'Loét da', 'Tê bì – dị cảm', 'Sốt'],
        pertinentNegatives: [
            ['không sốt, không chảy mủ hôi, không lan nhanh', 'hoại tử ướt nhiễm trùng – nhiễm trùng huyết'],
            ['không đau đột ngột dữ dội', 'thiếu máu chi cấp chồng lên nền mạn'],
            ['không loét vùng tì đè', 'loét do tì đè – thần kinh (bàn chân đái tháo đường)'],
            ['không hiện tượng Raynaud, không đau khớp', 'viêm mạch máu – bệnh mô liên kết']
        ],
        examTargets: {
            'exam-general': ['Mạch khoeo – chày sau – mu chân hai bên', 'Ranh giới hoại tử, mùi, dịch',
                'Nhiệt độ da so bên đối diện', 'Đo ABI (chú ý vôi hóa ở người đái tháo đường)', 'Thời gian đổ đầy mao mạch'],
            'exam-neuro-msk': ['Cảm giác nông – rung âm thoa bàn chân', 'Biến dạng bàn chân, chai chân']
        },
        redFlags: ['Thiếu máu chi đe dọa đoạn chi (ABI < 0,4)', 'Hoại tử ướt – nhiễm trùng huyết', 'Bàn chân đái tháo đường nhiễm trùng sâu']
    },
    'Chảy máu vết thương': {
        coOccurring: ['Đau chi cấp – mất mạch', 'Tê bì – dị cảm', 'Chóng mặt', 'Ngất', 'Yếu liệt chi'],
        pertinentNegatives: [
            ['không tê – lạnh phần chi phía dưới', 'tổn thương động mạch kèm thiếu máu chi'],
            ['không khối máu tụ đập nảy to nhanh', 'giả phình – tổn thương động mạch'],
            ['không yếu liệt, không mất cảm giác', 'tổn thương thần kinh đi kèm'],
            ['không chóng mặt khi ngồi dậy', 'mất máu đáng kể']
        ],
        examTargets: {
            'exam-general': ['Mạch hai bên chi so sánh', 'Khối máu tụ: kích thước, có đập nảy không',
                'Sờ rung miu – nghe âm thổi tại chỗ', 'Đo ABI bên tổn thương', 'Dấu sốc mất máu'],
            'exam-neuro-msk': ['Vận động – cảm giác phía dưới vết thương', 'Đau khi kéo căng cơ thụ động']
        },
        redFlags: ['Dấu hiệu chắc chắn tổn thương động mạch — mổ ngay', 'Sốc mất máu', 'Hội chứng chèn ép khoang', 'Thông động – tĩnh mạch sau chấn thương']
    },
    'Chảy dịch – hở vết mổ': {
        coOccurring: ['Sốt', 'Ớn lạnh – lạnh run', 'Đau ngực', 'Mệt mỏi – suy nhược'],
        pertinentNegatives: [
            ['không sốt, không lạnh run', 'nhiễm trùng sâu – viêm trung thất'],
            ['xương ức không lạo xạo khi ho', 'toác xương ức sau mổ tim'],
            ['dịch không hôi, không đục', 'nhiễm trùng vết mổ'],
            ['không đường huyết cao khó kiểm soát', 'yếu tố làm chậm lành vết mổ']
        ],
        examTargets: {
            'exam-chest': ['Mép vết mổ: nề, đỏ, hở', 'Ấn đau dọc xương ức', 'Dấu lạo xạo xương ức khi ho', 'Tính chất dịch chảy ra'],
            'exam-general': ['Nhiệt độ, mạch', 'Vẻ mặt nhiễm trùng', 'Chân ống dẫn lưu']
        },
        redFlags: ['Viêm trung thất sau mổ tim', 'Toác xương ức', 'Nhiễm trùng huyết', 'Nhiễm trùng mảnh ghép mạch máu']
    },
    'Sụp mi – nhìn đôi': {
        coOccurring: ['Nuốt khó', 'Nói khó', 'Yếu mỏi cơ', 'Khó thở', 'Nhìn mờ'],
        pertinentNegatives: [
            ['không đau đầu dữ dội, không nôn vọt', 'phình mạch não chèn dây III, tăng áp lực nội sọ'],
            ['không yếu nửa người, không nói đớ đột ngột', 'đột quỵ thân não'],
            ['không sốt, không đau hốc mắt', 'viêm mô tế bào hốc mắt'],
            ['không đau vai lan bờ trong cánh tay', 'hội chứng Pancoast – Horner']
        ],
        examTargets: {
            'exam-head': ['Độ sụp mi hai bên, khe mi', 'Đồng tử (co đồng tử gợi ý Horner)', 'Vận nhãn – nhìn đôi hướng nào',
                'Nghiệm pháp túi nước đá', 'Nhìn lên trần 60 giây xem mi có sụp thêm'],
            'exam-neuro-msk': ['Sức cơ gốc chi trước và sau vận động lặp lại', 'Cơ hô hấp: đếm hơi, dung tích sống'],
            'exam-general': ['Giảm tiết mồ hôi nửa mặt cùng bên']
        },
        redFlags: ['Cơn nhược cơ suy hô hấp', 'U tuyến ức', 'Hội chứng Pancoast – Horner', 'Phình mạch não chèn dây III']
    },
    'Khàn tiếng': {
        coOccurring: ['Ho', 'Nuốt khó', 'Sụt cân', 'Ho ra máu', 'Phù áo khoác – sưng mặt cổ'],
        pertinentNegatives: [
            ['không sốt, không đau họng', 'viêm thanh quản cấp'],
            ['không sụt cân, không ho ra máu', 'ung thư phổi – u trung thất chèn thần kinh quặt ngược'],
            ['không mổ tuyến giáp hay mổ tim trước đó', 'tổn thương thần kinh quặt ngược sau mổ'],
            ['không nuốt sặc, không nói giọng mũi', 'bệnh lý thần kinh cơ']
        ],
        examTargets: {
            'exam-head': ['Nội soi thanh quản: liệt dây thanh bên nào', 'Khám tuyến giáp'],
            'exam-general': ['Hạch cổ – hạch thượng đòn', 'Tĩnh mạch cổ nổi, tuần hoàn bàng hệ'],
            'exam-lung': ['Rì rào phế nang giảm khu trú', 'Tiếng rít khí quản']
        },
        redFlags: ['Ung thư phổi chèn thần kinh quặt ngược (T4)', 'U trung thất', 'Bướu giáp thòng chèn ép', 'Phình quai động mạch chủ']
    },
    'Nuốt khó': {
        coOccurring: ['Sụt cân', 'Khàn tiếng', 'Ho', 'Phù áo khoác – sưng mặt cổ', 'Đau ngực'],
        pertinentNegatives: [
            ['không nghẹn cả với nước ngay từ đầu', 'rối loạn vận động thực quản – bệnh thần kinh cơ'],
            ['không sụt cân nhanh, không thiếu máu', 'ung thư thực quản'],
            ['không ợ chua, không đau rát sau xương ức', 'trào ngược – viêm thực quản'],
            ['không sụp mi, không yếu cơ cuối ngày', 'nhược cơ'],
            ['không khàn tiếng, không phù mặt cổ', 'khối trung thất chèn ép']
        ],
        examTargets: {
            'exam-general': ['Cân nặng, dấu mất nước', 'Hạch cổ – thượng đòn', 'Tĩnh mạch cổ, tuần hoàn bàng hệ'],
            'exam-head': ['Khám vùng cổ tìm khối', 'Phản xạ nôn, nuốt thử ngụm nước'],
            'exam-chest': ['Nghe rít khí quản', 'Gõ vùng trung thất']
        },
        redFlags: ['U trung thất chèn thực quản', 'Ung thư thực quản', 'Cơn nhược cơ (sặc – viêm phổi hít)', 'Phình động mạch chủ ngực chèn ép']
    },
    'Tím tái': {
        coOccurring: ['Khó thở', 'Đau ngực', 'Ho', 'Ngất', 'Chấn thương ngực'],
        pertinentNegatives: [
            ['không tím chỉ khi lạnh, ấm lên thì hết', 'tím ngoại biên do co mạch'],
            ['tím có cải thiện khi thở oxy', 'luồng thông phải – trái (tim bẩm sinh) thì không cải thiện'],
            ['không ngón tay dùi trống', 'tím mạn tính do tim bẩm sinh'],
            ['không dùng thuốc – hóa chất lạ', 'methemoglobin máu']
        ],
        examTargets: {
            'exam-general': ['Tím trung ương (môi, lưỡi) hay ngoại biên (đầu chi)', 'SpO2 tay và chân',
                'Ngón tay dùi trống', 'Đáp ứng sau thở oxy 100%'],
            'exam-heart': ['Âm thổi tim', 'T2 mạnh ở ổ van động mạch phổi', 'Dấu Harzer'],
            'exam-lung': ['Rì rào phế nang hai bên', 'Ran, gõ vang hay gõ đục']
        },
        redFlags: ['Suy hô hấp cấp', 'Tràn khí màng phổi áp lực', 'Chèn ép tim cấp', 'Tim bẩm sinh tím', 'Sốc']
    },
    'Đau chi cấp – mất mạch': {
        coOccurring: ['Tê bì – dị cảm', 'Yếu liệt chi', 'Hồi hộp – đánh trống ngực', 'Đau cách hồi', 'Loét da'],
        pertinentNegatives: [
            ['không chấn thương, không vết thương vùng chi', 'chấn thương – vết thương động mạch'],
            ['không sưng nóng đỏ bắp chân', 'huyết khối tĩnh mạch sâu, viêm mô tế bào'],
            ['không đau cách hồi trước đó', 'huyết khối trên nền xơ vữa (phân biệt với thuyên tắc)'],
            ['không đau ngực xé lan sau lưng', 'bóc tách động mạch chủ lan xuống chi'],
            ['không hồi hộp, không tiền căn rung nhĩ', 'thuyên tắc từ tim']
        ],
        examTargets: {
            'exam-general': ['Bắt mạch đối xứng 8 vị trí (cánh tay, quay, trụ, đùi, khoeo, chày sau, mu chân)',
                'Chi lạnh, tái nhợt, ranh giới đổi màu rõ', 'Thời gian đổ đầy mao mạch kéo dài', 'Đo ABI hai bên'],
            'exam-neuro-msk': ['Cảm giác nông đầu chi', 'Sức cơ vận động các ngón', 'Đau khi kéo căng cơ thụ động (chèn ép khoang)',
                'Khoang cẳng chân căng cứng'],
            'exam-heart': ['Nhịp tim không đều (rung nhĩ)', 'Âm thổi tại tim', 'Âm thổi dọc đường đi động mạch']
        },
        redFlags: ['Thiếu máu chi cấp mất giờ vàng (< 6 giờ)', 'Hội chứng chèn ép khoang', 'Hội chứng tái tưới máu – tăng kali',
            'Chấn thương – vết thương động mạch', 'Bóc tách động mạch chủ']
    },
    'Đau cách hồi': {
        coOccurring: ['Tê bì – dị cảm', 'Loét da', 'Đau chi cấp – mất mạch', 'Chuột rút'],
        pertinentNegatives: [
            ['không đau khi nghỉ, không đau về đêm', 'thiếu máu chi mạn nặng (Fontaine III)'],
            ['không loét, không hoại tử đầu ngón', 'thiếu máu chi đe dọa (Fontaine IV)'],
            ['không đau lan từ thắt lưng xuống chân theo rễ', 'đau cách hồi thần kinh do hẹp ống sống'],
            ['không sưng nóng đỏ bắp chân', 'huyết khối tĩnh mạch sâu'],
            ['không rối loạn cương, đau hai mông – đùi', 'hội chứng Leriche (tắc ngã ba chủ – chậu)']
        ],
        examTargets: {
            'exam-general': ['Mạch đùi – khoeo – chày sau – mu chân hai bên', 'Rụng lông mu chân, móng dày sọc',
                'Teo cơ cẳng chân, đo chu vi hai bên', 'Loét – hoại tử đầu ngón', 'Nghiệm pháp Buerger', 'Chỉ số ABI'],
            'exam-heart': ['Âm thổi tâm thu dọc động mạch đùi – chậu', 'Nhịp tim đều hay không đều']
        },
        redFlags: ['Thiếu máu chi cấp trên nền mạn', 'Loét – hoại tử đe dọa đoạn chi', 'Bàn chân đái tháo đường nhiễm trùng']
    },
    'Nặng chân – giãn tĩnh mạch': {
        coOccurring: ['Loét da', 'Phù', 'Chuột rút', 'Ngứa', 'Sưng đau bắp chân một bên'],
        pertinentNegatives: [
            ['không sưng đau bắp chân một bên đột ngột', 'huyết khối tĩnh mạch sâu'],
            ['không đau cách hồi, mạch mu chân rõ', 'bệnh động mạch chi dưới đi kèm (cấm băng ép nếu ABI thấp)'],
            ['không khó thở, không đau ngực', 'thuyên tắc phổi'],
            ['không sốt, vùng loét không sưng nóng đỏ lan', 'viêm mô tế bào']
        ],
        examTargets: {
            'exam-general': ['Búi tĩnh mạch nông ngoằn ngoèo, vị trí và mức lan', 'Sạm da – chàm ứ trệ quanh mắt cá trong',
                'Loét: vị trí, đáy, bờ, kích thước', 'Phù ấn lõm cổ chân', 'Nghiệm pháp Trendelenburg – Perthes',
                'Mạch mu chân – chày sau và ABI trước khi băng ép']
        },
        redFlags: ['Huyết khối tĩnh mạch sâu đang hoạt động', 'Loét nhiễm trùng – viêm mô tế bào', 'Chảy máu búi giãn']
    },
    'Sưng đau bắp chân một bên': {
        coOccurring: ['Phù', 'Đau ngực kiểu màng phổi', 'Khó thở', 'Sốt', 'Nặng chân – giãn tĩnh mạch'],
        pertinentNegatives: [
            ['không khó thở, không đau ngực kiểu màng phổi, không ho ra máu', 'thuyên tắc phổi'],
            ['không sốt, không sưng nóng đỏ lan rộng', 'viêm mô tế bào'],
            ['không chấn thương, không vận động gắng sức trước đó', 'đứt cơ bụng chân, tụ máu trong cơ'],
            ['không mất mạch, chi không lạnh tái', 'thiếu máu chi cấp']
        ],
        examTargets: {
            'exam-general': ['Đo chu vi bắp chân hai bên cách lồi củ chày 10 cm', 'Đau khi bóp bắp chân',
                'Phù ấn lõm, nóng đỏ vùng da', 'Tĩnh mạch nông bàng hệ nổi', 'Mạch mu chân – chày sau'],
            'exam-lung': ['Rì rào phế nang, ran nổ khu trú', 'Tiếng cọ màng phổi'],
            'exam-heart': ['Nhịp tim nhanh', 'T2 mạnh ở ổ van động mạch phổi']
        },
        redFlags: ['Thuyên tắc phổi', 'Huyết khối tĩnh mạch sâu lan lên đùi – chậu', 'Phlegmasia cerulea dolens', 'Viêm mô tế bào']
    },
    'Khối đập theo nhịp mạch': {
        coOccurring: ['Đau bụng', 'Đau cột sống thắt lưng', 'Chóng mặt', 'Ngất', 'Đau chi cấp – mất mạch'],
        pertinentNegatives: [
            ['khối không to nhanh, không đau mới xuất hiện', 'dọa vỡ phình động mạch chủ'],
            ['không chóng mặt khi ngồi dậy, không vã mồ hôi', 'sốc mất máu do vỡ phình'],
            ['không đau ngực xé lan sau lưng', 'bóc tách động mạch chủ'],
            ['không sốt kéo dài', 'phình dạng nấm (nhiễm trùng)'],
            ['không tê lạnh bàn chân', 'thuyên tắc mảnh xơ vữa xuống chi']
        ],
        examTargets: {
            'exam-abdomen': ['Sờ khối đập theo nhịp mạch, giãn nở hai bên', 'Ước lượng đường kính khối',
                'Nghe âm thổi tâm thu tại khối', 'Đề kháng thành bụng (dấu vỡ vào phúc mạc)'],
            'exam-general': ['Mạch đùi – khoeo – mu chân hai bên', 'Huyết áp tứ chi', 'Dấu sốc: chi lạnh, vã mồ hôi, mạch nhanh'],
            'exam-heart': ['Âm thổi tâm trương hở van động mạch chủ', 'Chênh lệch huyết áp hai tay']
        },
        redFlags: ['Vỡ phình động mạch chủ bụng', 'Dọa vỡ phình', 'Bóc tách động mạch chủ', 'Thuyên tắc mảnh xơ vữa xuống chi']
    },
    'Đau ngực': {
        coOccurring: ['Khó thở', 'Vã mồ hôi đêm', 'Hồi hộp – đánh trống ngực', 'Nôn ói', 'Ngất', 'Ho ra máu',
            'Tím tái', 'Chấn thương ngực'],
        pertinentNegatives: [
            ['không đau lan sau lưng kiểu rách xé', 'bóc tách động mạch chủ'],
            ['không ho ra máu, không đau tăng khi hít sâu', 'thuyên tắc phổi, viêm màng phổi'],
            ['không khó thở khi nằm, không khó thở kịch phát về đêm', 'suy tim cấp'],
            ['không sốt', 'viêm màng ngoài tim, viêm phổi'],
            ['không ợ chua, không liên quan bữa ăn', 'trào ngược, loét dạ dày']
        ],
        examTargets: {
            'exam-heart': ['Âm thổi tâm thu / tâm trương', 'Tiếng T3, T4 (gallop)', 'Tiếng cọ màng ngoài tim', 'Mỏm tim lệch ngoài đường trung đòn', 'Dấu Harzer (-)'],
            'exam-lung': ['Ran ẩm đáy phổi', 'Rì rào phế nang giảm', 'Ran nổ'],
            'exam-general': ['Tĩnh mạch cổ nổi (JVP)', 'Phù 2 chi dưới', 'Chi lạnh, vã mồ hôi (dấu sốc)', 'Mạch 2 tay không đều nhau']
        },
        redFlags: ['Hội chứng vành cấp', 'Bóc tách động mạch chủ', 'Thuyên tắc phổi', 'Tràn khí màng phổi áp lực', 'Chèn ép tim cấp']
    },
    'Khó thở': {
        coOccurring: ['Ho', 'Đau ngực', 'Khò khè', 'Phù', 'Khó thở khi nằm', 'Tím tái'],
        pertinentNegatives: [
            ['không sốt, không ho đàm mủ', 'viêm phổi'],
            ['không đau ngực kiểu màng phổi, không ho ra máu', 'thuyên tắc phổi'],
            ['không phù chân, không tiểu ít', 'suy tim mất bù'],
            ['không khò khè, không tiền căn hen – COPD', 'co thắt phế quản'],
            ['không sặc, không hội chứng xâm nhập', 'dị vật đường thở']
        ],
        examTargets: {
            'exam-lung': ['Ran ẩm 2 đáy phổi', 'Ran rít, ran ngáy', 'Rì rào phế nang giảm 1 bên', 'Gõ vang / gõ đục 1 bên'],
            'exam-heart': ['T1 T2 đều rõ, không âm thổi', 'Tiếng T3 (gallop)', 'Tim nhanh đều'],
            'exam-chest': ['Co kéo cơ hô hấp phụ', 'Lồng ngực di động không đều 2 bên'],
            'exam-general': ['Tĩnh mạch cổ nổi (JVP)', 'Tím môi và đầu chi', 'Phù 2 chi dưới']
        },
        redFlags: ['Suy hô hấp cấp', 'Phù phổi cấp', 'Thuyên tắc phổi', 'Tràn khí màng phổi áp lực', 'Cơn hen nặng / dọa ngưng thở']
    },
    'Ho': {
        coOccurring: ['Sốt', 'Khạc đàm', 'Khó thở', 'Đau ngực kiểu màng phổi', 'Sụt cân', 'Vã mồ hôi đêm'],
        pertinentNegatives: [
            ['không ho ra máu', 'lao phổi, ung thư phổi'],
            ['không sụt cân, không vã mồ hôi đêm', 'lao phổi, bệnh ác tính'],
            ['không khó thở khi nằm', 'suy tim'],
            ['không ợ chua, không ho sau ăn', 'trào ngược dạ dày – thực quản']
        ],
        examTargets: {
            'exam-lung': ['Ran nổ đáy phổi (P)', 'Ran ẩm 2 đáy phổi', 'Rung thanh tăng khu trú', 'Gõ đục vùng đáy'],
            'exam-head': ['Họng đỏ, amidan sưng', 'Chảy mũi sau'],
            'exam-general': ['Hạch cổ, hạch thượng đòn', 'Ngón tay dùi trống']
        },
        redFlags: ['Viêm phổi nặng', 'Lao phổi', 'Ung thư phổi', 'Dị vật đường thở']
    },
    'Sốt': {
        coOccurring: ['Ớn lạnh – lạnh run', 'Ho', 'Tiểu gắt buốt', 'Tiêu chảy', 'Đau đầu', 'Ban da'],
        pertinentNegatives: [
            ['không đau đầu, không cổ gượng, không nôn vọt', 'viêm màng não'],
            ['không tiểu gắt buốt, không đau hông lưng', 'nhiễm trùng tiểu – viêm đài bể thận'],
            ['không ho đàm, không đau ngực', 'viêm phổi'],
            ['không đau bụng khu trú, không tiêu chảy', 'nhiễm trùng ổ bụng'],
            ['không ban da, không xuất huyết da niêm', 'sốt xuất huyết, nhiễm trùng huyết']
        ],
        examTargets: {
            'exam-general': ['Da niêm hồng, không xuất huyết da niêm', 'Chi ấm, mạch quay rõ, CRT < 2s', 'Hạch ngoại vi sờ không chạm', 'Dấu véo da mất nhanh'],
            'exam-neuro-msk': ['Cổ mềm, không dấu màng não', 'Không dấu thần kinh định vị'],
            'exam-lung': ['Rì rào phế nang êm dịu, không ran'],
            'exam-abdomen': ['Bụng mềm, không điểm đau khu trú', 'Chạm thận (-), rung thận (-)']
        },
        redFlags: ['Nhiễm trùng huyết – sốc nhiễm trùng', 'Viêm màng não', 'Sốt xuất huyết Dengue nặng', 'Sốt rét ác tính']
    },
    'Đau bụng': {
        coOccurring: ['Nôn ói', 'Sốt', 'Tiêu chảy', 'Táo bón', 'Tiêu phân đen', 'Vàng da – vàng mắt'],
        pertinentNegatives: [
            ['không nôn ra máu, không tiêu phân đen', 'xuất huyết tiêu hóa'],
            ['không bí trung đại tiện, không bụng chướng', 'tắc ruột'],
            ['không sốt, không vàng da', 'viêm túi mật – viêm đường mật'],
            ['không tiểu gắt, không đau lan xuống bẹn', 'cơn đau quặn thận'],
            ['không trễ kinh, không ra huyết âm đạo', 'thai ngoài tử cung (nữ tuổi sinh đẻ)']
        ],
        examTargets: {
            'exam-abdomen': ['Bụng mềm, không điểm đau khu trú', 'Đề kháng thành bụng, phản ứng dội', 'Điểm McBurney (+)', 'Murphy (+)', 'Nhu động ruột tăng / mất', 'Gõ đục vùng thấp, sóng vỗ'],
            'exam-general': ['Chi lạnh, vã mồ hôi (dấu sốc)', 'Da niêm nhạt', 'Vàng da vàng mắt']
        },
        redFlags: ['Viêm phúc mạc / thủng tạng rỗng', 'Tắc ruột', 'Viêm tụy cấp nặng', 'Phình bóc tách động mạch chủ bụng', 'Thai ngoài tử cung vỡ']
    },
    'Đau đầu': {
        coOccurring: ['Nôn ói', 'Sốt', 'Chóng mặt', 'Nhìn mờ', 'Yếu liệt chi', 'Co giật'],
        pertinentNegatives: [
            ['không đau đầu dữ dội đột ngột kiểu sét đánh', 'xuất huyết dưới nhện'],
            ['không sốt, không cổ gượng', 'viêm màng não'],
            ['không yếu liệt chi, không nói khó, không nhìn đôi', 'đột quỵ, u não'],
            ['không nôn vọt, không nhìn mờ tăng dần', 'tăng áp lực nội sọ']
        ],
        examTargets: {
            'exam-neuro-msk': ['Cổ mềm, không dấu màng não', 'Không dấu thần kinh định vị', 'Đồng tử 2 bên đều, phản xạ ánh sáng (+)', 'Sức cơ tứ chi 5/5'],
            'exam-head': ['Ấn đau xoang trán – xoang hàm', 'Động mạch thái dương không dày cứng']
        },
        redFlags: ['Xuất huyết dưới nhện', 'Viêm màng não', 'Tăng áp lực nội sọ / u não', 'Đột quỵ', 'Tăng huyết áp ác tính']
    },
    'Ho ra máu': {
        coOccurring: ['Ho', 'Sốt', 'Sụt cân', 'Vã mồ hôi đêm', 'Khó thở', 'Đau ngực kiểu màng phổi',
            'Khàn tiếng', 'Chấn thương ngực'],
        pertinentNegatives: [
            ['không nôn ra máu, máu không lẫn thức ăn', 'xuất huyết tiêu hóa nhầm lẫn'],
            ['không chảy máu mũi, không chảy máu răng', 'nguồn chảy máu đường hô hấp trên'],
            ['không sụt cân, không sốt về chiều', 'lao phổi, ung thư phổi'],
            ['không đau ngực kiểu màng phổi, không sưng đau bắp chân', 'thuyên tắc phổi']
        ],
        examTargets: {
            'exam-lung': ['Ran nổ khu trú', 'Rì rào phế nang giảm khu trú', 'Gõ đục vùng đỉnh'],
            'exam-general': ['Da niêm nhạt', 'Ngón tay dùi trống', 'Hạch thượng đòn']
        },
        redFlags: ['Ho ra máu sét đánh', 'Lao phổi tiến triển', 'Ung thư phế quản', 'Thuyên tắc phổi', 'Giãn phế quản bội nhiễm']
    },
    'Phù': {
        coOccurring: ['Khó thở', 'Khó thở khi nằm', 'Thay đổi lượng nước tiểu', 'Bụng to dần', 'Vàng da – vàng mắt'],
        pertinentNegatives: [
            ['không khó thở khi nằm, không khó thở kịch phát về đêm', 'suy tim'],
            ['không tiểu bọt, không tiểu ít', 'hội chứng thận hư, suy thận'],
            ['không vàng da, không bụng to dần', 'xơ gan mất bù'],
            ['phù 2 bên cân xứng, không sưng nóng đỏ 1 chân', 'huyết khối tĩnh mạch sâu']
        ],
        examTargets: {
            'exam-general': ['Phù 2 chi dưới ấn lõm', 'Tĩnh mạch cổ nổi (JVP)', 'Da niêm nhạt'],
            'exam-heart': ['Tiếng T3 (gallop)', 'Âm thổi tâm thu'],
            'exam-lung': ['Ran ẩm 2 đáy phổi', 'Hội chứng 3 giảm đáy phổi'],
            'exam-abdomen': ['Gõ đục vùng thấp, sóng vỗ (+)', 'Gan to, phản hồi gan – tĩnh mạch cổ (+)']
        },
        redFlags: ['Suy tim mất bù / phù phổi cấp', 'Hội chứng thận hư', 'Suy thận cấp', 'Huyết khối tĩnh mạch sâu']
    },
    'Nôn ói': {
        coOccurring: ['Đau bụng', 'Tiêu chảy', 'Sốt', 'Đau đầu', 'Chóng mặt'],
        pertinentNegatives: [
            ['không nôn ra máu', 'xuất huyết tiêu hóa trên'],
            ['không nôn vọt, không đau đầu tăng dần', 'tăng áp lực nội sọ'],
            ['không bí trung đại tiện, không bụng chướng', 'tắc ruột'],
            ['không trễ kinh', 'thai nghén (nữ tuổi sinh đẻ)']
        ],
        examTargets: {
            'exam-abdomen': ['Bụng mềm, nhu động ruột bình thường', 'Bụng chướng, nhu động tăng (dấu tắc ruột)', 'Điểm đau thượng vị'],
            'exam-general': ['Dấu véo da mất chậm', 'Môi khô, lưỡi dơ', 'Mắt trũng']
        },
        redFlags: ['Tắc ruột', 'Xuất huyết tiêu hóa', 'Tăng áp lực nội sọ', 'Mất nước – rối loạn điện giải nặng']
    },
    'Tiêu chảy': {
        coOccurring: ['Sốt', 'Đau bụng', 'Nôn ói', 'Sụt cân', 'Tiêu máu đỏ'],
        pertinentNegatives: [
            ['không tiêu đàm máu, không mót rặn', 'lỵ, viêm đại tràng nhiễm trùng'],
            ['không sốt cao, không đau bụng dữ dội', 'nhiễm trùng xâm lấn'],
            ['không sụt cân, không tiêu chảy về đêm', 'bệnh lý ác tính, viêm ruột mạn'],
            ['không dùng kháng sinh gần đây', 'viêm đại tràng do C. difficile']
        ],
        examTargets: {
            'exam-general': ['Dấu véo da mất chậm', 'Mắt trũng, môi khô', 'Chi lạnh, CRT > 2s'],
            'exam-abdomen': ['Bụng mềm, nhu động ruột tăng', 'Không điểm đau khu trú']
        },
        redFlags: ['Mất nước nặng – sốc giảm thể tích', 'Lỵ trực trùng', 'Tả', 'Viêm đại tràng giả mạc']
    },
    'Tiêu phân đen': {
        coOccurring: ['Nôn ói', 'Đau bụng', 'Chóng mặt', 'Mệt mỏi – suy nhược', 'Ngất'],
        pertinentNegatives: [
            ['không uống sắt, không ăn tiết canh – huyết', 'phân đen giả'],
            ['không nôn ra máu', 'xuất huyết tiêu hóa trên lượng nhiều'],
            ['không vàng da, không bụng to dần', 'vỡ giãn tĩnh mạch thực quản do xơ gan'],
            ['không dùng NSAID, không dùng kháng đông', 'loét do thuốc']
        ],
        examTargets: {
            'exam-general': ['Da niêm nhạt', 'Mạch nhanh, huyết áp tụt tư thế', 'Chi lạnh, CRT > 2s'],
            'exam-abdomen': ['Ấn đau thượng vị', 'Gan lách sờ chạm', 'Tuần hoàn bàng hệ, báng bụng']
        },
        redFlags: ['Sốc mất máu', 'Vỡ giãn tĩnh mạch thực quản', 'Loét dạ dày – tá tràng đang chảy máu']
    },
    'Ngất': {
        coOccurring: ['Hồi hộp – đánh trống ngực', 'Đau ngực', 'Khó thở', 'Chóng mặt', 'Co giật'],
        pertinentNegatives: [
            ['không ngất khi gắng sức', 'hẹp van động mạch chủ, bệnh cơ tim phì đại'],
            ['không hồi hộp trước ngất', 'loạn nhịp'],
            ['không co giật, không tiêu tiểu không tự chủ, không lú lẫn sau cơn', 'động kinh'],
            ['không tiêu phân đen, không xuất huyết', 'ngất do giảm thể tích']
        ],
        examTargets: {
            'exam-heart': ['Âm thổi tâm thu ổ van động mạch chủ', 'Nhịp tim đều / không đều', 'Mạch chậm'],
            'exam-general': ['Huyết áp tư thế (nằm – đứng)', 'Da niêm nhạt'],
            'exam-neuro-msk': ['Không dấu thần kinh định vị']
        },
        redFlags: ['Loạn nhịp nguy hiểm', 'Hẹp van động mạch chủ nặng', 'Thuyên tắc phổi', 'Xuất huyết nội', 'Đột quỵ hố sau']
    },
    'Yếu liệt chi': {
        coOccurring: ['Nói khó', 'Đau đầu', 'Tê bì – dị cảm', 'Rối loạn tri giác', 'Co giật'],
        pertinentNegatives: [
            ['không đau đầu dữ dội, không nôn vọt', 'xuất huyết não'],
            ['không sốt, không cổ gượng', 'nhiễm trùng thần kinh trung ương'],
            ['không chấn thương đầu – cột sống gần đây', 'tổn thương do chấn thương'],
            ['không rối loạn cơ vòng', 'chèn ép tủy']
        ],
        examTargets: {
            'exam-neuro-msk': ['Sức cơ từng nhóm (thang 0–5)', 'Phản xạ gân xương, Babinski', 'Trương lực cơ', 'Dấu thần kinh sọ', 'Cảm giác nông – sâu'],
            'exam-general': ['Huyết áp 2 tay', 'Loạn nhịp hoàn toàn (rung nhĩ)']
        },
        redFlags: ['Đột quỵ trong cửa sổ điều trị', 'Xuất huyết não', 'Chèn ép tủy cấp', 'Hội chứng Guillain–Barré']
    },
    'Tiểu máu': {
        coOccurring: ['Tiểu gắt buốt', 'Đau quặn thận', 'Sốt', 'Sụt cân', 'Phù'],
        pertinentNegatives: [
            ['không sốt, không đau hông lưng', 'viêm đài bể thận'],
            ['không sụt cân, không tiểu máu không đau', 'ung thư đường niệu'],
            ['không phù, không tăng huyết áp', 'viêm cầu thận'],
            ['không đang hành kinh, không chấn thương', 'tiểu máu giả']
        ],
        examTargets: {
            'exam-abdomen': ['Chạm thận (-), bập bềnh thận (-)', 'Rung thận (+)', 'Cầu bàng quang'],
            'exam-general': ['Da niêm nhạt', 'Phù mi mắt, phù chi dưới']
        },
        redFlags: ['Ung thư đường niệu', 'Viêm cầu thận tiến triển nhanh', 'Nhiễm trùng đường tiểu có tắc nghẽn']
    },
    'Xuất huyết da niêm': {
        coOccurring: ['Sốt', 'Chảy máu răng', 'Chảy máu mũi', 'Mệt mỏi – suy nhược', 'Tiêu phân đen'],
        pertinentNegatives: [
            ['không đau đầu, không rối loạn tri giác', 'xuất huyết nội sọ'],
            ['không tiêu phân đen, không nôn ra máu', 'xuất huyết tiêu hóa'],
            ['không sốt, không đau cơ khớp vùng dịch tễ', 'sốt xuất huyết Dengue'],
            ['không dùng kháng đông, không dùng thuốc mới', 'xuất huyết do thuốc']
        ],
        examTargets: {
            'exam-general': ['Chấm – mảng xuất huyết, dấu dây thắt', 'Da niêm nhạt', 'Hạch ngoại vi', 'Chi lạnh, CRT > 2s'],
            'exam-abdomen': ['Gan lách sờ chạm']
        },
        redFlags: ['Sốt xuất huyết Dengue nặng', 'Xuất huyết nội sọ do giảm tiểu cầu', 'Bạch cầu cấp', 'Đông máu nội mạch lan tỏa (DIC)']
    },
    'Thở nhanh – rút lõm ngực': {
        coOccurring: ['Sốt', 'Ho', 'Bú kém – bỏ bú', 'Quấy khóc – li bì', 'Tím tái'],
        pertinentNegatives: [
            ['không tím tái, không cơn ngưng thở', 'suy hô hấp nặng'],
            ['không bỏ bú, không co giật, không li bì', 'dấu hiệu nguy hiểm toàn thân'],
            ['không sặc, không hội chứng xâm nhập', 'dị vật đường thở'],
            ['không khò khè tái đi tái lại', 'hen phế quản']
        ],
        examTargets: {
            'exam-lung': ['Ran ẩm nhỏ hạt 2 phế trường', 'Rì rào phế nang giảm', 'Ran rít, ran ngáy'],
            'exam-chest': ['Rút lõm lồng ngực', 'Phập phồng cánh mũi, thở rên'],
            'exam-general': ['Tím quanh môi', 'Dấu véo da mất chậm', 'Li bì, khó đánh thức']
        },
        redFlags: ['Viêm phổi nặng', 'Suy hô hấp cấp', 'Dị vật đường thở', 'Viêm tiểu phế quản nặng']
    }
};

SYMPTOMS.forEach(s => Object.assign(s, CONTEXT[s.ten]));

/** Nhóm triệu chứng ↔ ô "Lược qua các cơ quan" ở mục IV */
export const ROS_BY_NHOM = {
    'Tim mạch': 'ros-cardio',
    'Hô hấp': 'ros-resp',
    'Tiêu hóa': 'ros-gi',
    'Thần kinh': 'ros-neuro',
    'Cơ xương khớp': 'ros-msk',
    'Tiết niệu – sinh dục': 'ros-uro'
};

/** Ghép các ý đã điền thành câu mô tả */
export function describe(sym, values) {
    const f = (k) => String(values?.[k] ?? '').trim();
    const parts = sym.fields.map(([k]) => f(k)).filter(Boolean);
    return parts.length ? `${sym.ten}: ${parts.join(', ')}` : sym.ten;
}

/* ---------------------------------------------------------------- đổi ra sao
   Mỗi triệu chứng nặng lên / nhẹ đi theo một kiểu riêng: sốt thì đổi ngưỡng nhiệt và
   kiểu sốt, đau thì đổi điểm đau và tần suất cơn, khó thở thì đổi ngưỡng gắng sức,
   phù thì đổi mức lan. Bày sẵn đúng những câu đó ở ô "rõ là như thế nào" của mục
   "triệu chứng đã có từ trước", để không phải nghĩ ra từ đầu mỗi lần.
   Triệu chứng không có ở đây thì benh-su-editor tự sinh gợi ý từ nhãn các ô đã hỏi. */
export const DOI_TRIEU_CHUNG = {
    'Sốt': {
        nang: ['sốt cao hơn, từ 38 lên 39,5°C', 'sốt liên tục thay vì từng cơn',
            'nay kèm lạnh run', 'không còn đáp ứng thuốc hạ sốt', 'cơn sốt dày hơn trong ngày'],
        giam: ['chỉ còn sốt nhẹ 37,5–38°C', 'giãn cơn, 1 cơn/ngày',
            'hạ sốt sau uống paracetamol và không tái phát', 'hết lạnh run']
    },
    'Ho': {
        nang: ['ho nhiều hơn, thành từng cơn kéo dài', 'ho tăng về đêm gây mất ngủ',
            'đàm nhiều hơn và đổi sang màu đục', 'ho kèm đau ngực khi ho'],
        giam: ['ho thưa hơn, chỉ vài lần trong ngày', 'ho khan nhẹ, không còn đàm',
            'không còn ho về đêm']
    },
    'Khó thở': {
        nang: ['khó thở khi gắng sức nhẹ hơn trước (đi trong nhà đã mệt)',
            'khó thở cả khi nghỉ', 'phải nằm đầu cao mới thở được',
            'thức giấc về đêm vì khó thở', 'nay kèm tím môi'],
        giam: ['chỉ khó thở khi gắng sức nặng', 'nằm đầu bằng vẫn thở được',
            'đỡ sau khi dùng thuốc giãn phế quản']
    },
    'Đau ngực': {
        nang: ['đau tăng từ 5/10 lên 8/10', 'cơn dày hơn, 3–4 cơn/ngày',
            'mỗi cơn kéo dài hơn 20 phút', 'lan thêm ra tay trái và hàm',
            'đau cả khi nghỉ, không cần gắng sức', 'nay kèm vã mồ hôi, khó thở'],
        giam: ['giảm còn 2/10', 'cơn thưa hơn, 1 cơn/ngày',
            'chỉ đau khi gắng sức mạnh', 'đỡ sau khi ngậm nitrat']
    },
    'Đau bụng': {
        nang: ['đau tăng từ 4/10 lên 8/10', 'đau liên tục thay vì từng cơn',
            'đau khu trú lại một điểm rõ', 'lan ra sau lưng', 'nay kèm nôn ói, bí trung đại tiện'],
        giam: ['giảm còn 2/10', 'cơn thưa và ngắn lại',
            'đỡ sau khi dùng thuốc giảm co thắt', 'chỉ còn âm ỉ']
    },
    'Phù': {
        nang: ['phù lan lên tới đùi và bụng', 'phù cả mặt, thấy rõ lúc sáng ngủ dậy',
            'ấn lõm sâu hơn, lâu hồi phục', 'tăng cân nhanh trong vài ngày'],
        giam: ['chỉ còn phù mắt cá chân', 'hết phù mặt', 'giảm sau khi dùng lợi tiểu']
    },
    'Tiêu chảy': {
        nang: ['đi nhiều lần hơn, trên 10 lần/ngày', 'phân toàn nước, lượng nhiều',
            'nay có nhầy máu', 'nay kèm đau quặn bụng và mót rặn'],
        giam: ['giảm còn 2–3 lần/ngày', 'phân sệt lại, không còn toàn nước',
            'đỡ sau khi bù dịch và uống men vi sinh']
    },
    'Nôn ói': {
        nang: ['nôn nhiều lần hơn, trên 5 lần/ngày', 'nôn ra dịch xanh vàng',
            'nôn vọt, không liên quan bữa ăn', 'không ăn uống được gì'],
        giam: ['chỉ còn buồn nôn, không nôn nữa', 'ăn uống lại được ít một']
    },
    'Đau đầu': {
        nang: ['đau tăng từ 4/10 lên 8/10', 'đau liên tục cả ngày',
            'đau tăng khi ho, khi cúi', 'nay kèm nôn vọt và nhìn mờ'],
        giam: ['giảm còn 2/10', 'chỉ đau thoáng qua', 'đỡ sau khi dùng thuốc giảm đau']
    },
    'Tiểu máu': {
        nang: ['nước tiểu đỏ sẫm hơn, có máu cục', 'tiểu máu cả bãi thay vì cuối bãi',
            'nay kèm đau hông lưng', 'lượng nước tiểu giảm dần'],
        giam: ['nước tiểu chỉ còn hồng nhạt', 'hết máu cục', 'nước tiểu trong trở lại']
    },
    'Ho ra máu': {
        nang: ['lượng máu nhiều hơn, trên 100 ml/ngày', 'máu đỏ tươi thay vì dây máu',
            'ho ra máu liên tục nhiều lần trong ngày'],
        giam: ['chỉ còn dây máu trong đàm', 'ngưng ho ra máu']
    },
    'Chóng mặt': {
        nang: ['chóng mặt cả khi nằm yên', 'không tự đi lại được vì mất thăng bằng',
            'nay kèm nôn ói và ù tai'],
        giam: ['chỉ chóng mặt thoáng qua khi đổi tư thế', 'đi lại được bình thường']
    }
};

export { fold };

/* Dò tên triệu chứng phải CHẶT, không thì cả hệ thống lệch theo.
   Luật cũ là "chứa nhau ở bất kỳ đâu, cái nào khai báo trước thì thắng" nên:
     · "Khó thở: khi nằm"        -> Ho   (vì "kho tho" có chữ "ho")
     · "Chóng mặt: kèm buồn nôn" -> Ho   (chữ "ho" nằm trong "chong")
     · "Tiểu máu: đỏ tươi, sốt"  -> Sốt  (bắt chữ "sốt" ở giữa câu)
   và người dùng lãnh nguyên bộ câu hỏi của triệu chứng khác.
   Luật mới: chỉ nhận khi tên nằm ở ĐẦU chuỗi và kết thúc đúng ranh giới từ; khớp
   nhiều thì lấy tên DÀI nhất (để "ho ra máu" không rơi về "Ho"). */
const chuCai = /[a-z0-9]/;
const khopDau = (chuoi, ten) =>
    chuoi === ten || (chuoi.startsWith(ten) && !chuCai.test(chuoi[ten.length] || ' '));

const thuong = (x) => String(x ?? '').trim().toLowerCase();

/* Bỏ dấu xong thì "tiểu" (đi tiểu) và "tiêu" (đi cầu) thành cùng một chuỗi — hai hệ
   cơ quan ngược nhau. Khớp được nhiều thì ưu tiên cái còn đúng cả DẤU, hết cách mới
   lấy bản bỏ dấu; trong cùng nhóm thì tên dài hơn thắng. */
const chonKhop = (ds, sRaw, dai = true) => {
    const coDau = ds.filter(x => khopDau(thuong(sRaw), thuong(x.ten)) || khopDau(thuong(x.ten), thuong(sRaw)));
    const nhom = coDau.length ? coDau : ds;
    return nhom.sort((a, b) => dai
        ? fold(b.ten).length - fold(a.ten).length
        : fold(a.ten).length - fold(b.ten).length)[0];
};

export function findSymptom(ten) {
    const s = fold(ten).trim();
    if (!s) return null;
    const eq = SYMPTOMS.find(x => fold(x.ten) === s);
    if (eq) return eq;
    // "tiểu máu đỏ tươi" -> Tiểu máu · "ho ra máu" -> Ho ra máu (dài hơn thì thắng)
    const dau = chonKhop(SYMPTOMS.filter(x => khopDau(s, fold(x.ten))), ten);
    if (dau) return dau;
    // Người dùng gõ thiếu đuôi: "vàng da" -> "Vàng da – vàng mắt"
    return chonKhop(SYMPTOMS.filter(x => khopDau(fold(x.ten), s)), ten, false) || null;
}

export function searchSymptoms(q) {
    // Tìm cả theo nhóm và theo bệnh cảnh nguy hiểm: gõ "vành cấp" vẫn ra "Đau ngực"
    return searchList(SYMPTOMS, q, {
        key: (x) => x.ten,
        alias: (x) => [x.nhom, ...(x.redFlags || []), ...(x.coOccurring || [])],
        limit: 60
    });
}
