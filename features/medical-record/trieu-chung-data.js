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
    }
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
        coOccurring: ['Khó thở', 'Vã mồ hôi đêm', 'Hồi hộp – đánh trống ngực', 'Nôn ói', 'Ngất', 'Ho ra máu'],
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
        coOccurring: ['Ho', 'Sốt', 'Sụt cân', 'Vã mồ hôi đêm', 'Khó thở', 'Đau ngực kiểu màng phổi'],
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
