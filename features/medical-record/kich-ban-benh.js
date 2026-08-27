// kich-ban-benh.js — nhập nhanh theo kịch bản bệnh thường gặp.
//
// Một mốc bệnh sử phải qua rất nhiều ô (tên, vị trí, tính chất, mức độ, thời gian,
// yếu tố tăng giảm, đi kèm, xử trí, triệu chứng cũ / mới), trên điện thoại gõ hết
// chừng đó là hết buổi đi buồng. Ở đây mỗi mặt bệnh thường gặp có sẵn một bản nháp
// đủ ý theo O-P-Q-R-S-T: lý do vào viện, triệu chứng chính đã khai thác đủ đặc
// điểm, âm tính có giá trị, và hai ba mốc diễn tiến. Một chạm là có khung, sinh
// viên chỉ còn sửa lại cho đúng bệnh nhân của mình.
//
// Bản nháp CHỈ là khung mẫu — con số và câu chữ phải sửa theo lời bệnh nhân,
// không được nộp nguyên xi.
//
// `dac` dùng KHÓA đặc điểm của trieu-chung-data.js (viTri, tinhChat, mucDo…)
// chứ không dùng thứ tự ô: bảng triệu chứng đổi thứ tự thì vẫn điền đúng ô.
// `mocs`: [giai đoạn, số, đơn vị, nội dung, có phải mốc khởi phát không]

/** @type {{ten:string, nhom:string, sym:string, lyDo:string[], dac:object,
 *           xuTri?:string, amTinh:string, mocs:Array}[]} */
export const KICH_BAN = [
    {
        ten: 'Hội chứng vành cấp — đau ngực điển hình', nhom: 'Tim mạch',
        sym: 'Đau ngực',
        lyDo: ['Đau ngực', 'Khó thở'],
        dac: {
            viTri: 'sau xương ức', tinhChat: 'đè nặng như có vật chặn', lan: 'lan lên hàm và mặt trong tay trái',
            mucDo: '8/10, không dám cử động', thoiGian: 'liên tục hơn 30 phút', yeuTo: 'không giảm khi nghỉ'
        },
        xuTri: 'ngậm nitrat dưới lưỡi 2 lần nhưng không giảm',
        amTinh: 'không sốt, không ho, không đau tăng khi hít sâu, không đau khi ấn thành ngực',
        mocs: [
            ['truoc', '3', 'ngày', 'Đau ngực khi leo cầu thang, nghỉ khoảng 5 phút thì hết, chưa đi khám', { dau: 4, vung: ['sau-xuong-uc'] }],
            ['truoc', '2', 'giờ', '', true, { dau: 8, nd: 36.8, spo2: 96, vung: ['sau-xuong-uc'], lan: [['sau-xuong-uc', 'tay-t'], ['sau-xuong-uc', 'goc-ham-t']] }]
        ]
    },
    {
        ten: 'Suy tim mất bù — khó thở tăng dần', nhom: 'Tim mạch',
        sym: 'Khó thở',
        lyDo: ['Khó thở', 'Phù', 'Khó thở khi nằm'],
        dac: {
            hoanCanh: 'xuất hiện cả khi đi lại trong nhà', mucDo: 'NYHA III',
            khoiPhat: 'tăng dần trong một tuần', kemTheo: 'phù hai chân, tiểu ít hơn thường ngày'
        },
        xuTri: 'tự tăng liều lợi tiểu ở nhà nhưng không đỡ',
        amTinh: 'không sốt, không đau ngực, không ho ra máu',
        mocs: [
            ['truoc', '1', 'tuần', 'Phù hai mắt cá chân về chiều, đi lại mau mệt', { dau: 0, spo2: 95 }],
            ['truoc', '2', 'ngày', 'Khó thở tăng lên, phải nằm 3 gối mới ngủ được, đêm có cơn khó thở kịch phát phải ngồi dậy', { dau: 0, spo2: 93, refs: [{ sym: 'Phù', st: 'nặng hơn', d: 'phù lên tới cẳng chân' }] }],
            ['truoc', '6', 'giờ', '', true, { dau: 0, nd: 36.9, spo2: 89, vung: ['nguc-t', 'cangchan-p', 'cangchan-t'], refs: [{ sym: 'Phù', st: 'nặng hơn', d: 'phù tới gối, ấn lõm sâu' }] }]
        ]
    },
    {
        ten: 'Viêm phổi cộng đồng — sốt, ho đàm', nhom: 'Hô hấp',
        sym: 'Sốt',
        lyDo: ['Sốt', 'Ho', 'Khạc đàm'],
        dac: {
            kieu: 'liên tục, cao về chiều', nhietDo: '39,5°C', lanhRun: 'có lạnh run',
            dapUng: 'giảm ít sau paracetamol rồi sốt lại', thoiGian: '4 ngày nay'
        },
        xuTri: 'tự mua paracetamol uống, sốt giảm rồi tăng lại',
        amTinh: 'không ho ra máu, không sụt cân, không ra mồ hôi đêm, không tiếp xúc người ho kéo dài',
        mocs: [
            ['truoc', '4', 'ngày', 'Sốt lạnh run, ho khan, mệt mỏi', { dau: 2, nd: 39.5, spo2: 96 }],
            ['truoc', '2', 'ngày', 'Ho khạc đàm vàng đặc, đau ngực phải khi hít sâu', { dau: 5, nd: 39, spo2: 94, refs: [{ sym: 'Sốt', st: 'nặng hơn', d: 'sốt cao hơn, lạnh run rõ hơn' }] }],
            ['truoc', '1', 'ngày', '', true, { dau: 5, nd: 38.8, spo2: 92, vung: ['nguc-p'], refs: [{ sym: 'Sốt', st: 'thuyên giảm', d: 'hạ được sau paracetamol nhưng vẫn 38,8°C' }, { sym: 'Ho', st: 'nặng hơn', d: 'ho nhiều hơn, đàm đặc hơn' }] }]
        ]
    },
    {
        ten: 'Đợt cấp COPD — khó thở, đàm đổi màu', nhom: 'Hô hấp',
        sym: 'Khó thở',
        lyDo: ['Khó thở', 'Ho', 'Khạc đàm'],
        dac: {
            hoanCanh: 'khi đi lại trong nhà, phải dừng lại để thở', mucDo: 'mMRC 3',
            khoiPhat: 'nặng dần 3 ngày nay', kemTheo: 'ho khạc đàm đục nhiều hơn thường ngày'
        },
        xuTri: 'xịt salbutamol tại nhà nhiều lần, đỡ được một lúc rồi khó thở lại',
        amTinh: 'không sốt cao, không đau ngực kiểu mạch vành, không phù chân mới xuất hiện',
        mocs: [
            ['truoc', '3', 'ngày', 'Ho khạc đàm nhiều hơn, đàm chuyển màu vàng đục', { dau: 0, nd: 37.4, spo2: 92 }],
            ['truoc', '1', 'ngày', '', true, { dau: 0, nd: 37.6, spo2: 88, vung: ['nguc-p', 'nguc-t'], refs: [{ sym: 'Ho', st: 'nặng hơn', d: 'ho liên tục, khạc đàm đục nhiều' }] }]
        ]
    },
    {
        ten: 'Viêm ruột thừa cấp — đau hố chậu phải', nhom: 'Tiêu hóa – gan mật',
        sym: 'Đau bụng',
        lyDo: ['Đau bụng', 'Sốt', 'Nôn ói'],
        dac: {
            viTri: 'khởi đầu quanh rốn, sau khu trú hố chậu phải', tinhChat: 'âm ỉ tăng dần',
            lan: 'không lan', mucDo: '7/10', lienQuan: 'tăng khi ho và khi đi lại',
            kemTheo: 'buồn nôn, chán ăn, sốt nhẹ'
        },
        amTinh: 'không tiêu chảy, không tiểu gắt buốt, không trễ kinh, không đau kiểu quặn thận',
        mocs: [
            ['truoc', '1', 'ngày', 'Đau bụng âm ỉ quanh rốn, kèm chán ăn và buồn nôn', { dau: 4, nd: 37.4, vung: ['bung-ron'] }],
            ['truoc', '12', 'giờ', '', true, { dau: 7, nd: 38.3, spo2: 98, vung: ['bung-hcp'], lan: [['bung-ron', 'bung-hcp']], refs: [{ sym: 'Đau bụng', st: 'nặng hơn', d: 'đau khu trú hẳn xuống hố chậu phải, đau nhiều hơn khi ho' }] }]
        ]
    },
    {
        ten: 'Loét dạ dày – tá tràng — đau thượng vị', nhom: 'Tiêu hóa – gan mật',
        sym: 'Đau bụng',
        lyDo: ['Đau bụng', 'Ợ hơi – ợ chua'],
        dac: {
            viTri: 'thượng vị', tinhChat: 'nóng rát, âm ỉ', lan: 'không lan', mucDo: '5/10',
            lienQuan: 'tăng khi đói và về đêm, giảm sau khi ăn', kemTheo: 'ợ hơi, ợ chua, đầy bụng'
        },
        xuTri: 'mua thuốc dạ dày ở tiệm uống, đỡ ít rồi đau lại',
        amTinh: 'không nôn ra máu, không tiêu phân đen, không sụt cân, không nuốt khó',
        mocs: [
            ['truoc', '2', 'tháng', 'Đau bụng vùng thượng vị từng đợt vài ngày, tự mua thuốc uống thì đỡ', { dau: 4, vung: ['bung-tv'] }],
            ['truoc', '3', 'ngày', '', true, { dau: 5, nd: 36.8, vung: ['bung-tv'] }]
        ]
    },
    {
        ten: 'Xuất huyết tiêu hóa trên — tiêu phân đen', nhom: 'Tiêu hóa – gan mật',
        sym: 'Tiêu phân đen',
        lyDo: ['Tiêu phân đen', 'Chóng mặt', 'Mệt mỏi – suy nhược'],
        dac: {
            soLan: '3 lần trong 2 ngày', tinhChat: 'phân đen sệt như hắc ín, mùi thối khẳn',
            kemTheo: 'chóng mặt, hoa mắt khi ngồi dậy, vã mồ hôi'
        },
        amTinh: 'không sốt, không đau bụng dữ dội, không vàng da, không nôn ra máu',
        mocs: [
            ['truoc', '2', 'ngày', 'Tiêu phân đen sệt, người mệt nhiều, ăn kém', { dau: 1, nd: 36.7, spo2: 97 }],
            ['truoc', '6', 'giờ', '', true, { dau: 2, nd: 36.5, spo2: 96, vung: ['bung-tv'] }]
        ]
    },
    {
        ten: 'Nhiễm trùng đường mật — tam chứng Charcot', nhom: 'Tiêu hóa – gan mật',
        sym: 'Đau bụng',
        lyDo: ['Đau bụng', 'Sốt', 'Vàng da – vàng mắt'],
        dac: {
            viTri: 'hạ sườn phải', tinhChat: 'quặn từng cơn', lan: 'lan lên vai phải',
            mucDo: '8/10', lienQuan: 'tăng sau bữa ăn nhiều dầu mỡ',
            kemTheo: 'sốt lạnh run, vàng da vàng mắt, nước tiểu sẫm màu'
        },
        amTinh: 'không tiêu phân đen, không sụt cân nhanh, không ngứa kéo dài trước đó',
        mocs: [
            ['truoc', '3', 'ngày', 'Đau bụng quặn hạ sườn phải sau bữa ăn nhiều dầu mỡ, tự hết sau vài giờ', { dau: 5, nd: 37.2, vung: ['bung-hsp'] }],
            ['truoc', '1', 'ngày', '', true, { dau: 8, nd: 39.2, spo2: 95, vung: ['bung-hsp'], lan: [['bung-hsp', 'vai-p']] }]
        ]
    },
    {
        ten: 'Đột quỵ — yếu nửa người đột ngột', nhom: 'Thần kinh',
        sym: 'Yếu liệt chi',
        lyDo: ['Yếu liệt chi', 'Nói khó'],
        dac: {
            viTri: 'nửa người phải', khoiPhat: 'đột ngột, người nhà phát hiện lúc bệnh nhân thức dậy',
            mucDo: 'sức cơ tay 2/5, chân 3/5', kemTheo: 'nói đớ, méo miệng lệch trái'
        },
        xuTri: 'được người nhà đưa thẳng tới bệnh viện, chưa dùng thuốc gì',
        amTinh: 'không đau đầu dữ dội, không nôn ói, không co giật, không sốt, không chấn thương đầu',
        mocs: [
            ['truoc', '5', 'giờ', '', true, { dau: 0, nd: 37, spo2: 96, vung: ['tay-p', 'cangchan-p'] }]
        ]
    },
    {
        ten: 'Sốt xuất huyết Dengue — sốt cao, xuất huyết da', nhom: 'Nhiễm',
        sym: 'Sốt',
        lyDo: ['Sốt', 'Đau đầu', 'Xuất huyết da niêm'],
        dac: {
            kieu: 'cao liên tục', nhietDo: '39,5°C', lanhRun: 'không lạnh run',
            dapUng: 'hạ ít sau paracetamol rồi sốt lại', thoiGian: 'ngày thứ 4 của bệnh'
        },
        xuTri: 'uống paracetamol và bù nước tại nhà',
        amTinh: 'không ho, không tiêu chảy, không tiểu gắt buốt, không đau họng',
        mocs: [
            ['truoc', '4', 'ngày', 'Sốt cao liên tục, đau đầu, đau sau hốc mắt, đau mỏi cơ khớp', { dau: 5, nd: 39.5, spo2: 98 }],
            ['truoc', '1', 'ngày', '', true, { dau: 4, nd: 38.6, spo2: 97, vung: ['tran'], refs: [{ sym: 'Sốt', st: 'thuyên giảm', d: 'hết sốt nhưng người mệt hơn, bắt đầu có chấm xuất huyết' }] }]
        ]
    },
    {
        ten: 'Viêm đài bể thận cấp — tiểu buốt, sốt lạnh run', nhom: 'Thận – tiết niệu',
        sym: 'Tiểu gắt buốt',
        lyDo: ['Tiểu gắt buốt', 'Sốt', 'Ớn lạnh – lạnh run'],
        dac: {
            bieuHien: 'cuối bãi, tiểu lắt nhắt nhiều lần trong ngày',
            kemTheo: 'sốt lạnh run, đau âm ỉ vùng hông lưng phải'
        },
        xuTri: 'uống nhiều nước và thuốc hạ sốt, không đỡ',
        amTinh: 'không tiểu máu đại thể, không đau quặn thận lan xuống bẹn, không ra huyết âm đạo',
        mocs: [
            ['truoc', '3', 'ngày', 'Tiểu gắt buốt, tiểu lắt nhắt, nước tiểu đục', { dau: 3, nd: 37.5, vung: ['bung-hv'] }],
            ['truoc', '1', 'ngày', '', true, { dau: 6, nd: 39.3, spo2: 97, vung: ['bung-hv', 'ho-tl-p'] }]
        ]
    },
    {
        ten: 'Hội chứng thận hư — phù, tiểu ít', nhom: 'Thận – tiết niệu',
        sym: 'Phù',
        lyDo: ['Phù', 'Thay đổi lượng nước tiểu', 'Mệt mỏi – suy nhược'],
        dac: {
            viTri: 'mí mắt và hai chi dưới', tinhChat: 'trắng, mềm, ấn lõm, không đau',
            thoiDiem: 'rõ nhất buổi sáng khi vừa ngủ dậy'
        },
        amTinh: 'không khó thở khi nằm, không sốt, không tiểu buốt, không tiểu máu',
        mocs: [
            ['truoc', '2', 'tuần', 'Phù mí mắt buổi sáng, nước tiểu nổi nhiều bọt', { dau: 0, nd: 36.8, spo2: 98 }],
            ['truoc', '3', 'ngày', '', true, { dau: 0, nd: 36.9, spo2: 97, vung: ['tran', 'cangchan-p', 'cangchan-t'] }]
        ]
    },
    {
        ten: 'Chấn thương ngực kín — tràn máu tràn khí màng phổi', nhom: 'Ngoại lồng ngực – mạch máu',
        sym: 'Đau ngực kiểu màng phổi',
        lyDo: ['Đau ngực kiểu màng phổi', 'Khó thở', 'Ho ra máu'],
        dac: {
            viTri: 'ngực phải', lienQuan: 'tăng khi hít sâu và khi ho', mucDo: '7/10'
        },
        xuTri: 'được sơ cứu và thở oxy tại tuyến trước rồi chuyển lên',
        amTinh: 'không ngất sau tai nạn, không nôn ói, không đau bụng, không tiểu máu, không yếu liệt chi',
        mocs: [
            ['truoc', '5', 'giờ', 'Tai nạn giao thông, xe máy té đập ngực phải xuống lề đường, tỉnh hoàn toàn, đau ngực phải nhiều', { dau: 7, nd: 37, spo2: 95, vung: ['nguc-p'] }],
            ['truoc', '2', 'giờ', 'Khó thở tăng dần, ho khạc ra ít máu tươi, được đặt dẫn lưu màng phổi phải ra khoảng 600 mL máu đỏ sẫm', { dau: 7, nd: 37.2, spo2: 91, vung: ['nguc-p'], refs: [{ sym: 'Khó thở', st: 'nặng hơn', d: 'khó thở cả khi nằm yên, thở nhanh nông' }] }],
            ['truoc', '30', 'phút', '', true, { dau: 6, nd: 37.1, spo2: 93, vung: ['nguc-p'], refs: [{ sym: 'Đau ngực kiểu màng phổi', st: 'thuyên giảm', d: 'đỡ hơn sau khi dẫn lưu và giảm đau' }] }]
        ]
    },
    {
        ten: 'Vết thương thấu ngực — nghi vết thương tim', nhom: 'Ngoại lồng ngực – mạch máu',
        sym: 'Đau ngực',
        lyDo: ['Đau ngực', 'Khó thở', 'Tím tái'],
        dac: {
            viTri: 'vùng trước tim', tinhChat: 'như dao đâm', lan: 'không lan',
            mucDo: '8/10', thoiGian: 'liên tục từ lúc bị đâm', yeuTo: 'không đổi khi nghỉ'
        },
        xuTri: 'người nhà băng ép vết thương rồi đưa thẳng tới cấp cứu',
        amTinh: 'không co giật, không nôn ói, không có vết thương nơi khác, không dùng rượu bia trước đó',
        mocs: [
            ['truoc', '1', 'giờ', 'Bị đâm bằng dao vào vùng ngực trái trước tim trong lúc xô xát, chảy máu ít tại chỗ', { dau: 8, nd: 36.8, spo2: 96, vung: ['nguc-t'] }],
            ['truoc', '20', 'phút', '', true, { dau: 8, nd: 36.4, spo2: 92, vung: ['nguc-t'], refs: [{ sym: 'Khó thở', st: 'nặng hơn', d: 'vã mồ hôi, tay chân lạnh, lơ mơ dần' }] }]
        ]
    },
    {
        ten: 'Thiếu máu chi cấp — hội chứng 6P', nhom: 'Ngoại lồng ngực – mạch máu',
        sym: 'Đau chi cấp – mất mạch',
        lyDo: ['Đau chi cấp – mất mạch', 'Tê bì – dị cảm'],
        dac: {
            viTri: 'cẳng – bàn chân trái', khoiPhat: 'đột ngột khi đang nghỉ',
            gioThu: 'giờ thứ 5 kể từ lúc đau (thời gian vàng < 6 giờ)',
            dau6P: 'đau, tái nhợt, mất mạch, lạnh chi, tê bì',
            vanDong: 'tê bì nhưng còn cử động được các ngón'
        },
        xuTri: 'xoa bóp và đắp ấm tại nhà, không đỡ nên tới bệnh viện',
        amTinh: 'không chấn thương, không sốt, không đau ngực, không khó thở, không đau bụng',
        mocs: [
            ['truoc', '2', 'năm', 'Được chẩn đoán rung nhĩ, có toa thuốc kháng đông nhưng tự ngưng uống nửa năm nay', { dau: 0 }],
            ['truoc', '5', 'giờ', '', true, { dau: 8, nd: 36.7, spo2: 97, vung: ['cangchan-t'] }]
        ]
    },
    {
        ten: 'Bệnh động mạch chi dưới mạn — đau cách hồi Fontaine IIb', nhom: 'Ngoại lồng ngực – mạch máu',
        sym: 'Đau cách hồi',
        lyDo: ['Đau cách hồi', 'Tê bì – dị cảm'],
        dac: {
            viTri: 'bắp chân trái', quangDuong: 'khoảng 100 m thì phải nghỉ 3–5 phút mới đi tiếp được',
            dienTien: 'quãng đường đi được ngắn dần trong 6 tháng nay',
            kemTheo: 'lạnh và tê bàn chân trái, rụng lông mu chân'
        },
        xuTri: 'uống thuốc giãn mạch mua ở tiệm, không cải thiện; chưa bỏ thuốc lá',
        amTinh: 'chưa loét hay hoại tử đầu ngón, chưa đau khi nghỉ về đêm, không sốt, không sưng đỏ bắp chân',
        mocs: [
            ['truoc', '6', 'tháng', 'Đi bộ khoảng 500 m thì mỏi và đau bắp chân trái, nghỉ vài phút thì hết, vẫn đi làm bình thường', { dau: 3, vung: ['cangchan-t'] }],
            ['truoc', '2', 'tháng', 'Quãng đường đi được rút xuống còn khoảng 100 m, bàn chân trái lạnh hơn bên phải', { dau: 5, vung: ['cangchan-t'], refs: [{ sym: 'Đau cách hồi', st: 'nặng hơn', d: 'đi ngắn hơn đã phải nghỉ' }] }],
            ['truoc', '3', 'ngày', '', true, { dau: 5, nd: 36.8, spo2: 98, vung: ['cangchan-t'] }]
        ]
    },
    {
        ten: 'Phình động mạch chủ bụng dọa vỡ', nhom: 'Ngoại lồng ngực – mạch máu',
        sym: 'Đau bụng',
        lyDo: ['Đau bụng', 'Khối đập theo nhịp mạch', 'Chóng mặt'],
        dac: {
            viTri: 'quanh rốn', tinhChat: 'đau dữ dội', lan: 'lan sau lưng',
            mucDo: '9/10', lienQuan: 'không liên quan bữa ăn',
            kemTheo: 'chóng mặt khi ngồi dậy, vã mồ hôi'
        },
        xuTri: 'chưa dùng thuốc gì, được người nhà đưa vào cấp cứu ngay',
        amTinh: 'không nôn ra máu, không tiêu phân đen, không sốt, không tiểu buốt, không chấn thương',
        mocs: [
            ['truoc', '1', 'năm', 'Siêu âm bụng kiểm tra sức khỏe phát hiện phình động mạch chủ bụng khoảng 4,5 cm, được hẹn theo dõi nhưng không tái khám', { dau: 0 }],
            ['truoc', '6', 'giờ', '', true, { dau: 9, nd: 36.6, spo2: 96, vung: ['bung-ron'], lan: [['bung-ron', 'cs-tl']] }]
        ]
    },
    {
        ten: 'Ung thư phổi — ho kéo dài, ho ra máu, sụt cân', nhom: 'Ngoại lồng ngực – mạch máu',
        sym: 'Ho ra máu',
        lyDo: ['Ho ra máu', 'Ho', 'Sụt cân'],
        dac: {
            luong: 'dây máu trong đàm, mỗi lần vài mL', mauSac: 'đỏ tươi',
            soLan: 'khoảng 5 lần trong 3 tuần nay'
        },
        xuTri: 'uống kháng sinh và thuốc ho hai đợt ở phòng khám tư, ho có giảm rồi tái lại',
        amTinh: 'không sốt cao lạnh run, không tiếp xúc người lao, không khó thở khi nằm, không phù chân',
        mocs: [
            ['truoc', '3', 'tháng', 'Ho khan kéo dài, hút thuốc lá 30 gói·năm, nghĩ do thuốc lá nên không đi khám', { dau: 0, spo2: 97 }],
            ['truoc', '3', 'tuần', 'Ho khạc ra dây máu đỏ tươi trong đàm, sụt 4 kg trong 2 tháng, ăn kém', { dau: 2, nd: 37.3, spo2: 96, vung: ['nguc-p'], refs: [{ sym: 'Ho', st: 'nặng hơn', d: 'ho đổi tính chất, có máu trong đàm' }] }],
            ['truoc', '2', 'ngày', '', true, { dau: 4, nd: 37.5, spo2: 95, vung: ['nguc-p', 'vai-p'] }]
        ]
    },
    {
        ten: 'Suy tĩnh mạch mạn — loét cẳng chân', nhom: 'Ngoại lồng ngực – mạch máu',
        sym: 'Nặng chân – giãn tĩnh mạch',
        lyDo: ['Nặng chân – giãn tĩnh mạch', 'Loét da'],
        dac: {
            viTri: 'hai chân, chân trái nhiều hơn',
            thoiDiem: 'cuối ngày, sau khi đứng lâu',
            gianTM: 'búi giãn ngoằn ngoèo mặt trong cẳng chân',
            kemTheo: 'sạm da – chàm ứ trệ quanh mắt cá trong, loét cẳng chân trái',
            giamKhi: 'gác chân cao'
        },
        xuTri: 'bôi thuốc và đắp lá tại nhà, vết loét không lành',
        amTinh: 'không sốt, không đau cách hồi, không tê lạnh bàn chân, không chấn thương vùng loét',
        mocs: [
            ['truoc', '5', 'năm', 'Nổi búi tĩnh mạch ngoằn ngoèo hai cẳng chân, chiều tối nặng chân, gác chân cao thì đỡ', { dau: 2, vung: ['cangchan-t'] }],
            ['truoc', '6', 'tháng', 'Da quanh mắt cá trong bên trái sạm màu, ngứa, tróc vảy', { dau: 3, vung: ['cangchan-t', 'cochan-t'] }],
            ['truoc', '1', 'tháng', '', true, { dau: 4, nd: 36.9, spo2: 98, vung: ['cochan-t'], refs: [{ sym: 'Loét da', st: 'nặng hơn', d: 'vết loét trên mắt cá trong rộng dần, đáy ẩm, ít đau' }] }]
        ]
    }
];

/** Nhóm cho bảng chọn — giữ đúng thứ tự xuất hiện trong KICH_BAN */
export const KICH_BAN_NHOM = [...new Set(KICH_BAN.map(k => k.nhom))].map(ten => ({
    ten, items: KICH_BAN.filter(k => k.nhom === ten).map(k => k.ten)
}));

export const findKichBan = (ten) => KICH_BAN.find(k => k.ten === ten) || null;

/** Các mốc của một kịch bản, đổi sang đúng dạng lưu của bệnh sử.
 *  Phần tử thứ 6 là số liệu cho chế độ xem Diễn tiến ({dau, nd, spo2, vung, lan}). */
export const kichBanSteps = (kb) => (kb.mocs || []).map(([phase, n, u, s, a, b]) => {
    // Mốc không phải khởi phát thì bỏ luôn cờ `true`, khối số liệu tụt lên ô thứ 5 —
    // nhận theo kiểu dữ liệu để khỏi phải đếm dấu phẩy khi viết thêm kịch bản.
    const so = (a && typeof a === 'object' ? a : b) || {};
    return { phase, n, u, s: s || '', refs: [], ...(a === true ? { main: true } : {}), ...so };
});
