// bien-luan-data.js — thư viện gợi ý cho sơ đồ biện luận.
//
// Mỗi mục: khớp theo tên vấn đề (re), rồi gợi sẵn ba nhóm nhánh:
//   nn  = các nguyên nhân / chẩn đoán cần nghĩ
//   red = những thứ phải loại trừ khẩn (đe dọa tính mạng)
//   cls = cận lâm sàng thường dùng để phân định
// Phủ nội – ngoại – sản – nhi – cấp cứu để dùng được cho mọi loại bệnh án.

import { searchList } from './tim-kiem.js';

export const LIBRARY = [
    /* ---------------- Huyết học – toàn thân ---------------- */
    {
        k: 'Hội chứng thiếu máu', re: /thi[ếe]u m[áa]u/i,
        nn: ['Mất máu cấp', 'Mất máu mạn (rong kinh, xuất huyết tiêu hóa)', 'Tan máu', 'Giảm sinh tại tủy',
            'Thiếu sắt', 'Thiếu B12 / folate', 'Thiếu máu bệnh mạn tính', 'Bệnh thalassemia'],
        red: ['Sốc mất máu', 'Thiếu máu cơ tim do thiếu máu nặng'],
        cls: ['Công thức máu', 'Phết máu ngoại vi', 'Hồng cầu lưới', 'Sắt huyết thanh – ferritin', 'Coombs', 'Nội soi tiêu hóa']
    },
    {
        k: 'Hội chứng suy tủy', re: /suy t[ủu]y|gi[ảa]m (ba|3) d[òo]ng/i,
        nn: ['Bạch cầu cấp', 'Lymphoma xâm lấn tủy', 'Hội chứng rối loạn sinh tủy (MDS)', 'Suy tủy vô căn',
            'Di căn tủy', 'Do thuốc / hóa chất', 'Nhiễm siêu vi (EBV, CMV, HIV)'],
        red: ['Nhiễm trùng huyết trên nền giảm bạch cầu hạt', 'Xuất huyết nội sọ do giảm tiểu cầu'],
        cls: ['Công thức máu', 'Phết máu ngoại vi', 'Tủy đồ', 'Dấu ấn miễn dịch tế bào', 'LDH – acid uric']
    },
    {
        k: 'Hội chứng xuất huyết', re: /xu[ấa]t huy[ếe]t/i,
        nn: ['Giảm tiểu cầu', 'Rối loạn chức năng tiểu cầu', 'Rối loạn đông máu huyết tương',
            'Bệnh lý thành mạch', 'Đông máu nội mạch lan tỏa (DIC)', 'Do thuốc kháng đông'],
        red: ['Xuất huyết nội sọ', 'Xuất huyết tiêu hóa ồ ạt'],
        cls: ['Công thức máu – tiểu cầu', 'PT – aPTT – fibrinogen', 'D-dimer', 'Chức năng gan']
    },
    {
        k: 'Hạch to', re: /h[ạa]ch to|n[ổo]i h[ạa]ch/i,
        nn: ['Nhiễm trùng vùng dẫn lưu', 'Lao hạch', 'Lymphoma', 'Di căn ung thư', 'Bệnh hệ thống', 'Nhiễm siêu vi'],
        red: ['Hạch chèn ép đường thở', 'Hội chứng tĩnh mạch chủ trên'],
        cls: ['Siêu âm hạch', 'Sinh thiết hạch', 'Công thức máu', 'LDH', 'X-quang ngực']
    },
    {
        k: 'Triệu chứng B / sụt cân', re: /s[ụu]t c[âa]n|tri[ệe]u ch[ứu]ng b|g[ầa]y s[úu]t/i,
        nn: ['Bệnh ác tính', 'Lao', 'Cường giáp', 'Đái tháo đường mất bù', 'Bệnh lý tiêu hóa kém hấp thu', 'Trầm cảm – chán ăn'],
        red: ['Ác tính tiến triển'],
        cls: ['Công thức máu', 'CRP – VS', 'Đường huyết – HbA1c', 'TSH – FT4', 'X-quang ngực', 'Siêu âm bụng']
    },

    /* ---------------- Nhiễm trùng ---------------- */
    {
        k: 'Hội chứng nhiễm trùng / sốt', re: /nhi[ễe]m tr[ùu]ng|s[ốo]t/i,
        nn: ['Nhiễm trùng hô hấp', 'Nhiễm trùng tiêu hóa – gan mật', 'Nhiễm trùng tiết niệu',
            'Nhiễm trùng da – mô mềm', 'Nhiễm trùng thần kinh trung ương', 'Nhiễm trùng huyết',
            'Sốt xuất huyết Dengue', 'Sốt rét', 'Bệnh tự miễn', 'Bệnh lý ác tính', 'Sốt do thuốc'],
        red: ['Nhiễm trùng huyết – sốc nhiễm trùng', 'Viêm màng não', 'Sốt trên bệnh nhân giảm bạch cầu hạt'],
        cls: ['Công thức máu', 'CRP – procalcitonin', 'Cấy máu', 'Tổng phân tích nước tiểu', 'X-quang ngực', 'NS1 – Dengue']
    },
    {
        k: 'Sốt kéo dài chưa rõ nguyên nhân', re: /s[ốo]t k[ée]o d[àa]i|fuo/i,
        nn: ['Nhiễm trùng khu trú sâu (áp xe, viêm nội tâm mạc)', 'Lao', 'Bệnh mô liên kết', 'Ác tính (lymphoma)', 'Do thuốc'],
        red: ['Viêm nội tâm mạc nhiễm trùng', 'Áp xe sâu chưa dẫn lưu'],
        cls: ['Cấy máu nhiều mẫu', 'Siêu âm tim', 'CT ngực – bụng', 'Xét nghiệm lao', 'ANA – RF']
    },

    /* ---------------- Hô hấp ---------------- */
    {
        k: 'Khó thở', re: /kh[óo] th[ởo]/i,
        nn: ['Suy tim cấp / phù phổi cấp', 'Hội chứng vành cấp', 'Đợt cấp COPD', 'Cơn hen phế quản',
            'Viêm phổi', 'Tràn dịch – tràn khí màng phổi', 'Thuyên tắc phổi', 'Thiếu máu nặng', 'Toan chuyển hóa'],
        red: ['Thuyên tắc phổi', 'Tràn khí màng phổi áp lực', 'Phù phổi cấp', 'Sốc phản vệ'],
        cls: ['X-quang ngực', 'Khí máu động mạch', 'ECG', 'NT-proBNP', 'D-dimer', 'Siêu âm tim']
    },
    {
        k: 'Ho ra máu', re: /ho ra m[áa]u|kh[ạa]c m[áa]u/i,
        nn: ['Lao phổi', 'Giãn phế quản', 'Ung thư phổi', 'Viêm phổi hoại tử', 'Thuyên tắc phổi', 'Hẹp van hai lá'],
        red: ['Ho ra máu sét đánh', 'Suy hô hấp do ngập máu phế nang'],
        cls: ['X-quang ngực', 'CT ngực', 'AFB đàm – GeneXpert', 'Công thức máu – đông máu', 'Nội soi phế quản']
    },
    {
        k: 'Hội chứng đông đặc / ba giảm', re: /đ[ôo]ng đ[ặa]c|ba gi[ảa]m|3 gi[ảa]m|tr[àa]n d[ịi]ch m[àa]ng ph[ổo]i/i,
        nn: ['Viêm phổi', 'Tràn dịch màng phổi (nhiễm trùng, lao, ác tính, suy tim)', 'Xẹp phổi', 'U phổi'],
        red: ['Tràn mủ màng phổi', 'Suy hô hấp'],
        cls: ['X-quang ngực', 'Siêu âm màng phổi', 'CT ngực', 'Chọc dò dịch màng phổi']
    },

    /* ---------------- Tim mạch ---------------- */
    {
        k: 'Đau ngực', re: /đau ng[ựu]c/i,
        nn: ['Hội chứng vành cấp', 'Đau thắt ngực ổn định', 'Bóc tách động mạch chủ', 'Thuyên tắc phổi',
            'Viêm màng ngoài tim', 'Trào ngược dạ dày – thực quản', 'Đau cơ xương thành ngực', 'Zona'],
        red: ['Nhồi máu cơ tim cấp', 'Bóc tách động mạch chủ', 'Thuyên tắc phổi', 'Tràn khí màng phổi áp lực'],
        cls: ['ECG', 'Troponin', 'X-quang ngực', 'Siêu âm tim', 'D-dimer', 'CT mạch máu']
    },
    {
        k: 'Tăng huyết áp', re: /t[ăa]ng huy[ếe]t [áa]p/i,
        nn: ['Tăng huyết áp nguyên phát', 'Bệnh nhu mô thận', 'Hẹp động mạch thận', 'Cường aldosteron',
            'U tủy thượng thận', 'Hội chứng Cushing', 'Do thuốc', 'Ngưng thở khi ngủ'],
        red: ['Cơn tăng huyết áp có tổn thương cơ quan đích'],
        cls: ['Ion đồ', 'Chức năng thận', 'Tổng phân tích nước tiểu', 'ECG – siêu âm tim', 'Siêu âm động mạch thận', 'Soi đáy mắt']
    },
    {
        k: 'Hồi hộp – đánh trống ngực', re: /h[ồo]i h[ộo]p|đ[áa]nh tr[ốo]ng ng[ựu]c|lo[ạa]n nh[ịi]p/i,
        nn: ['Rung nhĩ', 'Nhịp nhanh trên thất', 'Ngoại tâm thu', 'Cường giáp', 'Thiếu máu', 'Lo âu', 'Do thuốc – caffein'],
        red: ['Nhịp nhanh thất', 'Rung nhĩ đáp ứng thất nhanh gây rối loạn huyết động'],
        cls: ['ECG', 'Holter ECG', 'TSH – FT4', 'Ion đồ', 'Siêu âm tim']
    },
    {
        k: 'Phù', re: /^ph[ùu]|h[ộo]i ch[ứu]ng ph[ùu]/i,
        nn: ['Suy tim', 'Xơ gan', 'Hội chứng thận hư', 'Suy dinh dưỡng', 'Suy tĩnh mạch – tắc mạch',
            'Phù bạch huyết', 'Do thuốc (chẹn kênh canxi)'],
        red: ['Huyết khối tĩnh mạch sâu', 'Phù phổi cấp'],
        cls: ['Albumin – protein máu', 'Đạm niệu 24 giờ', 'NT-proBNP', 'Siêu âm bụng – tim', 'Siêu âm Doppler chi']
    },
    {
        k: 'Ngất', re: /ng[ấa]t|x[ỉi]u/i,
        nn: ['Ngất do phản xạ (vasovagal)', 'Hạ huyết áp tư thế', 'Rối loạn nhịp', 'Hẹp van động mạch chủ',
            'Thuyên tắc phổi', 'Hạ đường huyết', 'Động kinh'],
        red: ['Ngất do tim (rối loạn nhịp nguy hiểm)', 'Thuyên tắc phổi'],
        cls: ['ECG', 'Holter', 'Siêu âm tim', 'Đường huyết mao mạch', 'Nghiệm pháp bàn nghiêng']
    },

    /* ---------------- Tiêu hóa – gan mật ---------------- */
    {
        k: 'Đau bụng', re: /đau b[ụu]ng/i,
        nn: ['Viêm ruột thừa cấp', 'Thủng tạng rỗng', 'Tắc ruột', 'Viêm tụy cấp', 'Sỏi mật – viêm túi mật',
            'Viêm dạ dày – loét dạ dày tá tràng', 'Cơn đau quặn thận', 'Bệnh lý phụ khoa', 'Viêm phúc mạc'],
        red: ['Bụng ngoại khoa cấp', 'Thai ngoài tử cung vỡ', 'Phình bóc tách động mạch chủ bụng'],
        cls: ['Công thức máu', 'Amylase – lipase', 'Siêu âm bụng', 'X-quang bụng đứng', 'CT bụng', 'Beta-hCG']
    },
    {
        k: 'Xuất huyết tiêu hóa', re: /xu[ấa]t huy[ếe]t ti[êe]u h[óo]a|n[ôo]n ra m[áa]u|ti[êe]u ph[âa]n đen/i,
        nn: ['Loét dạ dày tá tràng', 'Vỡ giãn tĩnh mạch thực quản', 'Viêm dạ dày do thuốc', 'Ung thư dạ dày',
            'Hội chứng Mallory-Weiss', 'Bệnh trĩ – polyp đại tràng'],
        red: ['Sốc mất máu', 'Vỡ giãn tĩnh mạch thực quản ồ ạt'],
        cls: ['Công thức máu', 'Nhóm máu', 'Nội soi tiêu hóa trên', 'Chức năng gan – đông máu']
    },
    {
        k: 'Vàng da', re: /v[àa]ng da/i,
        nn: ['Vàng da trước gan (tán huyết)', 'Vàng da tại gan (viêm gan, xơ gan, do thuốc)',
            'Vàng da sau gan (sỏi ống mật chủ, u đầu tụy)'],
        red: ['Viêm đường mật cấp (tam chứng Charcot)', 'Suy gan cấp'],
        cls: ['Bilirubin TP – TT', 'AST – ALT – GGT – ALP', 'Siêu âm bụng', 'Viêm gan siêu vi', 'MRCP']
    },
    {
        k: 'Cổ trướng – gan lách to', re: /c[ổo] tr[ướơ]{1,2}ng|gan l[áa]ch to|th[âa]m nhi[ễe]m/i,
        nn: ['Xơ gan – tăng áp cửa', 'Ác tính hệ tạo máu', 'Ung thư di căn phúc mạc', 'Lao màng bụng',
            'Suy tim phải', 'Hội chứng thận hư'],
        red: ['Viêm phúc mạc nhiễm khuẩn nguyên phát', 'Hội chứng gan thận'],
        cls: ['Siêu âm bụng', 'Chọc dịch báng (SAAG, tế bào)', 'Albumin', 'AFP', 'CT bụng']
    },
    {
        k: 'Tiêu chảy', re: /ti[êe]u ch[ảa]y/i,
        nn: ['Tiêu chảy nhiễm trùng', 'Ngộ độc thức ăn', 'Do thuốc / kháng sinh', 'Viêm ruột mạn (IBD)',
            'Hội chứng ruột kích thích', 'Kém hấp thu', 'Cường giáp'],
        red: ['Mất nước nặng – sốc giảm thể tích', 'Tiêu chảy nhiễm trùng có phân máu'],
        cls: ['Soi phân – cấy phân', 'Ion đồ', 'Chức năng thận', 'CRP', 'Nội soi đại tràng']
    },

    /* ---------------- Thận – tiết niệu – nội tiết ---------------- */
    {
        k: 'Suy thận / tăng creatinin', re: /suy th[ậa]n|t[ăa]ng creatinin|gi[ảa]m egfr/i,
        nn: ['Trước thận (giảm tưới máu, mất dịch)', 'Tại thận (hoại tử ống thận cấp, viêm cầu thận, do thuốc)',
            'Sau thận (sỏi, u chèn ép, bí tiểu)', 'Bệnh thận mạn tiến triển'],
        red: ['Tăng kali máu nguy hiểm', 'Phù phổi cấp do quá tải dịch', 'Toan chuyển hóa nặng'],
        cls: ['Ure – creatinin', 'Ion đồ', 'Tổng phân tích nước tiểu', 'Siêu âm hệ niệu', 'Khí máu động mạch']
    },
    {
        k: 'Rối loạn điện giải', re: /h[ạa] natri|t[ăa]ng kali|r[ốo]i lo[ạa]n đi[ệe]n gi[ảa]i|h[ạa] kali/i,
        nn: ['Mất qua đường tiêu hóa', 'Mất qua thận (lợi tiểu)', 'SIADH', 'Suy thượng thận',
            'Truyền dịch không phù hợp', 'Toan – kiềm chuyển hóa'],
        red: ['Tăng kali gây rối loạn nhịp', 'Hạ natri cấp gây phù não'],
        cls: ['Ion đồ máu – niệu', 'Áp lực thẩm thấu', 'Cortisol máu', 'ECG', 'Khí máu động mạch']
    },
    {
        k: 'Tăng đường huyết / đái tháo đường', re: /đ[áa]i th[áa]o đ[ườơ]{1,2}ng|t[ăa]ng đ[ườơ]{1,2}ng huy[ếe]t|đ[ườơ]{1,2}ng huy[ếe]t cao/i,
        nn: ['Đái tháo đường type 2', 'Đái tháo đường type 1', 'Do thuốc (corticoid)', 'Tăng đường huyết do stress',
            'Đái tháo đường thứ phát (bệnh tụy, Cushing)'],
        red: ['Nhiễm toan ceton', 'Tăng áp lực thẩm thấu máu', 'Nhiễm trùng nặng trên nền đái tháo đường'],
        cls: ['Đường huyết đói', 'HbA1c', 'Ceton máu / niệu', 'Khí máu động mạch', 'Ion đồ', 'Đạm niệu vi thể']
    },
    {
        k: 'Bệnh lý tuyến giáp', re: /tuy[ếe]n gi[áa]p|c[ườơ]{1,2}ng gi[áa]p|suy gi[áa]p|b[ướơ]{1,2}u c[ổo]/i,
        nn: ['Basedow', 'Viêm giáp', 'Bướu giáp đơn thuần', 'Nhân giáp – ung thư giáp', 'Suy giáp Hashimoto'],
        red: ['Cơn bão giáp', 'Hôn mê phù niêm'],
        cls: ['TSH – FT4 – FT3', 'TRAb – anti TPO', 'Siêu âm tuyến giáp', 'FNA tuyến giáp', 'Xạ hình giáp']
    },

    /* ---------------- Thần kinh ---------------- */
    {
        k: 'Rối loạn tri giác / hôn mê', re: /tri gi[áa]c|h[ôo]n m[êe]|l[úu] l[ẫa]n/i,
        nn: ['Đột quỵ', 'Hạ / tăng đường huyết', 'Rối loạn điện giải', 'Nhiễm trùng thần kinh trung ương',
            'Ngộ độc – quá liều thuốc', 'Bệnh não gan', 'Bệnh não do ure', 'Thiếu oxy não'],
        red: ['Xuất huyết não', 'Viêm màng não mủ', 'Hạ đường huyết nặng'],
        cls: ['Đường huyết mao mạch', 'CT sọ não', 'Ion đồ – chức năng gan thận', 'Khí máu', 'Chọc dò dịch não tủy']
    },
    {
        k: 'Yếu liệt nửa người', re: /y[ếe]u li[ệe]t|li[ệe]t n[ửư]a ng[ườơ]{1,2}i|đ[ộo]t qu[ỵy]/i,
        nn: ['Nhồi máu não', 'Xuất huyết não', 'U não', 'Áp xe não', 'Liệt Todd sau co giật', 'Hạ đường huyết'],
        red: ['Đột quỵ trong cửa sổ tiêu sợi huyết', 'Xuất huyết não lượng lớn'],
        cls: ['CT sọ não không cản quang', 'MRI não', 'Đường huyết', 'ECG', 'Siêu âm động mạch cảnh']
    },
    {
        k: 'Đau đầu', re: /đau đ[ầa]u/i,
        nn: ['Đau đầu căng cơ', 'Migraine', 'Tăng huyết áp', 'Viêm xoang', 'Xuất huyết dưới nhện',
            'U não', 'Viêm màng não'],
        red: ['Xuất huyết dưới nhện (đau đầu sét đánh)', 'Viêm màng não', 'Tăng áp lực nội sọ'],
        cls: ['CT sọ não', 'Chọc dò dịch não tủy', 'Soi đáy mắt', 'MRI não']
    },
    {
        k: 'Co giật', re: /co gi[ậa]t|đ[ộo]ng kinh/i,
        nn: ['Động kinh', 'Co giật do sốt (trẻ em)', 'Hạ đường huyết – hạ natri – hạ canxi',
            'Nhiễm trùng thần kinh trung ương', 'Chấn thương sọ não', 'Ngộ độc – cai rượu', 'Sản giật'],
        red: ['Trạng thái động kinh', 'Viêm màng não', 'Sản giật'],
        cls: ['Đường huyết', 'Ion đồ – canxi – magie', 'CT sọ não', 'Điện não đồ', 'Dịch não tủy']
    },

    /* ---------------- Cơ xương khớp ---------------- */
    {
        k: 'Đau khớp – sưng khớp', re: /đau kh[ớơ]p|s[ưu]ng kh[ớơ]p|vi[êe]m kh[ớơ]p/i,
        nn: ['Viêm khớp nhiễm trùng', 'Gout cấp', 'Viêm khớp dạng thấp', 'Thoái hóa khớp',
            'Lupus ban đỏ hệ thống', 'Viêm khớp phản ứng'],
        red: ['Viêm khớp nhiễm trùng (cần chọc hút khớp sớm)'],
        cls: ['Công thức máu – CRP – VS', 'Acid uric', 'RF – anti CCP – ANA', 'Chọc dịch khớp', 'X-quang khớp']
    },
    {
        k: 'Đau cột sống thắt lưng', re: /đau (c[ộo]t s[ốo]ng|th[ắa]t l[ưu]ng)|đau l[ưu]ng/i,
        nn: ['Thoát vị đĩa đệm', 'Thoái hóa cột sống', 'Lao cột sống', 'Di căn cột sống',
            'Viêm cột sống dính khớp', 'Đau do thâm nhiễm tủy xương'],
        red: ['Hội chứng chùm đuôi ngựa', 'Nhiễm trùng cột sống', 'Di căn gây chèn ép tủy'],
        cls: ['X-quang cột sống', 'MRI cột sống', 'CRP – VS', 'Điện giải – canxi', 'Xạ hình xương']
    },

    /* ---------------- Ngoại khoa – chấn thương ---------------- */
    {
        k: 'Bụng ngoại khoa cấp', re: /b[ụu]ng ngo[ạa]i khoa|vi[êe]m ph[úu]c m[ạa]c|th[ủu]ng t[ạa]ng/i,
        nn: ['Viêm ruột thừa vỡ', 'Thủng dạ dày tá tràng', 'Tắc ruột hoại tử', 'Viêm túi mật hoại tử',
            'Nhồi máu mạc treo', 'Xoắn ruột'],
        red: ['Sốc nhiễm trùng ổ bụng', 'Nhồi máu mạc treo'],
        cls: ['X-quang bụng đứng', 'CT bụng cản quang', 'Công thức máu – lactat', 'Siêu âm bụng']
    },
    {
        k: 'Chấn thương sọ não', re: /ch[ấa]n th[ươư]{1,2}ng s[ọo] n[ãa]o|đ[ầa]u b[ịi] va đ[ậa]p/i,
        nn: ['Chấn động não', 'Máu tụ ngoài màng cứng', 'Máu tụ dưới màng cứng', 'Dập não', 'Xuất huyết dưới nhện do chấn thương'],
        red: ['Máu tụ ngoài màng cứng đang lớn', 'Tụt kẹt não', 'Vỡ nền sọ'],
        cls: ['CT sọ não', 'X-quang cột sống cổ', 'Đông máu', 'Theo dõi Glasgow mỗi giờ']
    },
    {
        k: 'Chấn thương bụng kín', re: /ch[ấa]n th[ươư]{1,2}ng b[ụu]ng/i,
        nn: ['Vỡ lách', 'Vỡ gan', 'Tổn thương ruột – mạc treo', 'Chấn thương thận', 'Tụ máu sau phúc mạc'],
        red: ['Sốc mất máu do vỡ tạng đặc'],
        cls: ['FAST siêu âm bụng', 'CT bụng cản quang', 'Công thức máu – nhóm máu', 'Tổng phân tích nước tiểu']
    },
    {
        k: 'Bí tiểu – khối vùng bẹn bìu', re: /b[íi] ti[ểe]u|tho[áa]t v[ịi]|b[ẹe]n b[ìi]u/i,
        nn: ['Tăng sinh lành tính tuyến tiền liệt', 'Hẹp niệu đạo', 'Sỏi kẹt', 'Thoát vị bẹn nghẹt',
            'Xoắn tinh hoàn', 'Viêm mào tinh'],
        red: ['Xoắn tinh hoàn (cần mổ trong 6 giờ)', 'Thoát vị nghẹt'],
        cls: ['Siêu âm bụng – bìu Doppler', 'Tổng phân tích nước tiểu', 'PSA', 'Chức năng thận']
    },

    /* ---------------- Sản khoa ---------------- */
    {
        k: 'Ra huyết âm đạo khi có thai', re: /ra huy[ếe]t [âa]m đ[ạa]o|xu[ấa]t huy[ếe]t thai/i,
        nn: ['Dọa sẩy thai', 'Thai ngoài tử cung', 'Thai trứng', 'Nhau tiền đạo', 'Nhau bong non'],
        red: ['Thai ngoài tử cung vỡ', 'Nhau bong non', 'Băng huyết'],
        cls: ['Beta-hCG', 'Siêu âm bụng – đầu dò âm đạo', 'Công thức máu – nhóm máu', 'Đông máu']
    },
    {
        k: 'Đau bụng chuyển dạ', re: /chuy[ểe]n d[ạa]|đau b[ụu]ng thai/i,
        nn: ['Chuyển dạ thật', 'Chuyển dạ giả', 'Nhau bong non', 'Vỡ tử cung', 'Viêm ruột thừa trên thai kỳ'],
        red: ['Vỡ tử cung', 'Suy thai cấp', 'Nhau bong non'],
        cls: ['Monitoring sản khoa (CTG)', 'Siêu âm thai', 'Công thức máu – đông máu', 'Tổng phân tích nước tiểu']
    },
    {
        k: 'Tiền sản giật', re: /ti[ềe]n s[ảa]n gi[ậa]t|cao huy[ếe]t [áa]p thai k[ỳy]/i,
        nn: ['Tiền sản giật', 'Tăng huyết áp mạn trên thai kỳ', 'Tăng huyết áp thai kỳ đơn thuần', 'Hội chứng HELLP'],
        red: ['Sản giật', 'Hội chứng HELLP', 'Nhau bong non'],
        cls: ['Đạm niệu', 'Công thức máu – tiểu cầu', 'AST – ALT – LDH', 'Chức năng thận', 'CTG – siêu âm Doppler']
    },

    /* ---------------- Nhi khoa ---------------- */
    {
        k: 'Sốt ở trẻ em', re: /s[ốo]t.*(tr[ẻe]|nhi)|tr[ẻe].*s[ốo]t/i,
        nn: ['Nhiễm siêu vi', 'Viêm hô hấp trên', 'Viêm phổi', 'Nhiễm trùng tiểu', 'Sốt xuất huyết',
            'Tay chân miệng', 'Sởi – rubella', 'Viêm màng não'],
        red: ['Sốc sốt xuất huyết', 'Viêm màng não', 'Nhiễm trùng huyết'],
        cls: ['Công thức máu', 'CRP', 'Tổng phân tích nước tiểu', 'NS1 – Dengue', 'X-quang ngực']
    },
    {
        k: 'Tiêu chảy cấp ở trẻ', re: /ti[êe]u ch[ảa]y.*(tr[ẻe]|nhi)|m[ấa]t n[ướơ]{1,2}c/i,
        nn: ['Tiêu chảy do Rotavirus', 'Tiêu chảy nhiễm khuẩn', 'Ngộ độc thức ăn', 'Do kháng sinh', 'Bất dung nạp lactose'],
        red: ['Mất nước nặng', 'Sốc giảm thể tích', 'Rối loạn điện giải nặng'],
        cls: ['Ion đồ', 'Soi phân', 'Đường huyết', 'Khí máu động mạch']
    },
    {
        k: 'Co giật do sốt', re: /co gi[ậa]t do s[ốo]t/i,
        nn: ['Co giật do sốt đơn thuần', 'Co giật do sốt phức tạp', 'Viêm màng não', 'Động kinh khởi phát'],
        red: ['Viêm màng não', 'Trạng thái động kinh'],
        cls: ['Đường huyết', 'Ion đồ – canxi', 'Dịch não tủy khi nghi ngờ', 'Điện não đồ']
    },
    {
        k: 'Vàng da sơ sinh', re: /v[àa]ng da s[ơo] sinh/i,
        nn: ['Vàng da sinh lý', 'Bất đồng nhóm máu mẹ con', 'Tán huyết', 'Nhiễm trùng sơ sinh',
            'Vàng da do sữa mẹ', 'Tắc mật bẩm sinh'],
        red: ['Vàng da nhân (kernicterus)'],
        cls: ['Bilirubin TP – TT', 'Nhóm máu mẹ con – Coombs', 'Công thức máu – hồng cầu lưới', 'Siêu âm bụng']
    },

    /* ---------------- Cấp cứu ---------------- */
    {
        k: 'Sốc', re: /^s[ốo]c|t[ụu]t huy[ếe]t [áa]p/i,
        nn: ['Sốc giảm thể tích', 'Sốc nhiễm trùng', 'Sốc tim', 'Sốc phản vệ', 'Sốc tắc nghẽn (chèn ép tim, thuyên tắc phổi)'],
        red: ['Sốc phản vệ', 'Chèn ép tim cấp', 'Sốc mất máu đang tiến triển'],
        cls: ['Lactat máu', 'Khí máu động mạch', 'Công thức máu – đông máu', 'Siêu âm tại giường (POCUS)', 'ECG – troponin']
    },
    {
        k: 'Ngộ độc', re: /ng[ộo] đ[ộo]c|u[ốo]ng thu[ốo]c t[ựu] t[ửư]/i,
        nn: ['Ngộ độc thuốc ngủ – an thần', 'Ngộ độc paracetamol', 'Ngộ độc phospho hữu cơ', 'Ngộ độc rượu',
            'Ngộ độc thức ăn', 'Ngộ độc CO'],
        red: ['Suy hô hấp do ức chế thần kinh', 'Rối loạn nhịp do ngộ độc', 'Suy gan cấp do paracetamol'],
        cls: ['Khí máu động mạch', 'Chức năng gan thận', 'Nồng độ thuốc trong máu', 'ECG', 'Ion đồ – khoảng trống anion']
    },

    /* ---------------- Bổ sung: hội chứng hay gặp ở buồng bệnh ---------------- */
    {
        k: 'Hội chứng van tim (hẹp – hở)', re: /van tim|h[ẹe]p van|h[ởo] van|[âa]m th[ổo]i/i,
        nn: ['Bệnh van tim hậu thấp', 'Thoái hóa van tuổi già – vôi hóa', 'Viêm nội tâm mạc nhiễm trùng',
            'Van tim bẩm sinh (van động mạch chủ hai mảnh)', 'Hở van cơ năng do giãn buồng tim', 'Sa van hai lá'],
        red: ['Viêm nội tâm mạc nhiễm trùng', 'Phù phổi cấp do hở van cấp', 'Thuyên tắc mạch do sùi'],
        cls: ['Siêu âm tim Doppler màu', 'ECG', 'X-quang ngực thẳng', 'Cấy máu 3 mẫu', 'NT-proBNP']
    },
    {
        k: 'Viêm tụy cấp', re: /vi[êe]m t[ụu]y/i,
        nn: ['Sỏi mật – bùn mật', 'Rượu', 'Tăng triglyceride máu', 'Sau ERCP', 'Do thuốc',
            'Tăng canxi máu', 'Chấn thương bụng', 'Vô căn'],
        red: ['Viêm tụy cấp hoại tử', 'Suy đa cơ quan', 'Hội chứng chèn ép khoang bụng'],
        cls: ['Amylase – Lipase máu', 'CT bụng cản quang', 'Siêu âm bụng (tìm sỏi mật)',
            'Triglyceride – Canxi máu', 'Khí máu động mạch', 'CRP 48 giờ']
    },
    {
        k: 'Hội chứng tắc ruột', re: /t[ắa]c ru[ộo]t|b[áa]n t[ắa]c/i,
        nn: ['Dính ruột sau mổ', 'Thoát vị nghẹt', 'U đại tràng', 'Xoắn ruột', 'Lồng ruột',
            'Bã thức ăn – búi giun', 'Liệt ruột cơ năng'],
        red: ['Tắc ruột nghẹt – hoại tử ruột', 'Thủng ruột', 'Sốc giảm thể tích'],
        cls: ['X-quang bụng đứng không sửa soạn', 'CT bụng cản quang', 'Ion đồ', 'Công thức máu – lactat']
    },
    {
        k: 'Hội chứng thận hư', re: /th[ậa]n h[ưu]|đ[ạa]m ni[ệe]u ng[ưu][ỡơ]ng th[ậa]n h[ưu]/i,
        nn: ['Bệnh cầu thận sang thương tối thiểu', 'Xơ hóa cầu thận khu trú từng vùng (FSGS)',
            'Bệnh cầu thận màng', 'Bệnh thận đái tháo đường', 'Lupus ban đỏ hệ thống', 'Thoái hóa dạng bột'],
        red: ['Huyết khối tĩnh mạch thận', 'Nhiễm trùng trên nền giảm miễn dịch', 'Tổn thương thận cấp'],
        cls: ['Đạm niệu 24 giờ', 'Albumin – bộ mỡ máu', 'Chức năng thận', 'ANA – anti dsDNA', 'Sinh thiết thận']
    },
    {
        k: 'Nhiễm trùng đường tiểu', re: /nhi[ễe]m tr[ùu]ng (ti[ểe]u|ti[ếe]t ni[ệe]u)|vi[êe]m b[àa]ng quang|vi[êe]m th[ậa]n b[ểe] th[ậa]n/i,
        nn: ['Viêm bàng quang cấp', 'Viêm thận – bể thận cấp', 'Nhiễm trùng tiểu phức tạp (sỏi, sonde, thai kỳ)',
            'Viêm tiền liệt tuyến', 'Lao niệu'],
        red: ['Nhiễm trùng huyết đường niệu', 'Thận ứ mủ', 'Áp xe quanh thận'],
        cls: ['Tổng phân tích nước tiểu', 'Cấy nước tiểu + kháng sinh đồ', 'Siêu âm hệ niệu', 'Công thức máu – CRP']
    },
    {
        k: 'Viêm phổi', re: /vi[êe]m ph[ổo]i/i,
        nn: ['Viêm phổi cộng đồng', 'Viêm phổi bệnh viện – thở máy', 'Viêm phổi hít',
            'Viêm phổi không điển hình', 'Lao phổi', 'Viêm phổi do siêu vi'],
        red: ['Suy hô hấp cấp', 'Nhiễm trùng huyết', 'Tràn mủ màng phổi', 'Áp xe phổi'],
        cls: ['X-quang ngực thẳng', 'Công thức máu', 'CRP – Procalcitonin', 'Cấy đàm', 'Khí máu động mạch']
    },
    {
        k: 'Hội chứng tăng áp lực nội sọ', re: /t[ăa]ng [áa]p l[ựư]c n[ộo]i s[ọo]|ph[ùu] gai/i,
        nn: ['U não nguyên phát hoặc di căn', 'Xuất huyết nội sọ', 'Áp xe não', 'Não úng thủy',
            'Huyết khối xoang tĩnh mạch não', 'Phù não sau chấn thương'],
        red: ['Tụt kẹt não', 'Xuất huyết nội sọ đang tiến triển'],
        cls: ['CT sọ não', 'MRI sọ não có cản từ', 'Soi đáy mắt', 'Chọc dò dịch não tủy sau khi loại trừ chống chỉ định']
    },
    {
        k: 'Dọa sinh non', re: /d[ọo]a sinh non|chuy[ểe]n d[ạa] sinh non/i,
        nn: ['Nhiễm trùng đường sinh dục – ối', 'Nhiễm trùng tiểu', 'Đa thai – đa ối',
            'Hở eo tử cung', 'Nhau tiền đạo – nhau bong non', 'Dị dạng tử cung', 'Vô căn'],
        red: ['Nhiễm trùng ối', 'Nhau bong non', 'Sa dây rốn'],
        cls: ['Siêu âm đo chiều dài cổ tử cung', 'CTG theo dõi cơn gò – tim thai',
            'Fibronectin bào thai', 'Tổng phân tích nước tiểu – cấy', 'Công thức máu – CRP']
    }

];


/* =====================================================================
   Dấu hiệu then chốt (hallmarks) của từng hội chứng — chip bấm một cái là
   rơi thẳng vào khối "Dấu chứng lâm sàng ủng hộ" ở mục X.
   ===================================================================== */
export const HALLMARKS = [
    [/thi[ếe]u m[áa]u/i, ['Da niêm nhạt', 'Chóng mặt khi thay đổi tư thế', 'Hồi hộp – đánh trống ngực',
        'Khó thở khi gắng sức', 'Móng tay khô dễ gãy', 'Âm thổi tâm thu cơ năng']],
    [/nhi[ễe]m tr[ùu]ng|s[ốo]t/i, ['Sốt cao kèm lạnh run', 'Môi khô lưỡi dơ', 'Vẻ mặt nhiễm trùng',
        'Mạch nhanh theo nhiệt độ', 'Tiểu ít – nước tiểu sậm']],
    [/đ[ôo]ng đ[ặa]c|ba gi[ảa]m|tr[àa]n d[ịi]ch m[àa]ng ph[ổo]i/i, ['Rung thanh tăng', 'Gõ đục',
        'Rì rào phế nang giảm', 'Ran nổ cuối thì hít vào', 'Đau ngực kiểu màng phổi']],
    [/kh[óo] th[ởo]/i, ['Khó thở khi gắng sức', 'Khó thở phải ngồi', 'Cơn khó thở kịch phát về đêm',
        'Thở co kéo cơ hô hấp phụ', 'SpO2 giảm', 'Tím môi – đầu chi']],
    [/suy tim|[ứu] huy[ếe]t/i, ['Khó thở khi nằm', 'Cơn khó thở kịch phát về đêm', 'Tĩnh mạch cổ nổi',
        'Phản hồi gan – tĩnh mạch cổ (+)', 'Gan to đau', 'Phù hai chân ấn lõm', 'Ran ẩm hai đáy phổi']],
    [/đau ng[ựư]c|v[àa]nh c[ấa]p/i, ['Đau ngực đè nặng sau xương ức', 'Lan lên hàm – vai – tay trái',
        'Kéo dài trên 20 phút', 'Kèm vã mồ hôi lạnh', 'Không giảm khi nghỉ']],
    [/x[ơo] gan|t[ăa]ng [áa]p (c[ửư]a|t[ĩi]nh m[ạa]ch)/i, ['Vàng da – vàng mắt', 'Báng bụng',
        'Tuần hoàn bàng hệ', 'Sao mạch', 'Lòng bàn tay son', 'Lách to', 'Phù hai chân']],
    [/đau b[ụu]ng/i, ['Vị trí đau khu trú', 'Đau lan ra sau lưng / vai', 'Đau quặn từng cơn',
        'Đề kháng thành bụng', 'Cảm ứng phúc mạc', 'Nhu động ruột tăng / mất']],
    [/v[àa]ng da|t[ắa]c m[ậa]t/i, ['Vàng da – vàng mắt', 'Tiểu sậm màu', 'Phân bạc màu', 'Ngứa toàn thân',
        'Túi mật to sờ được']],
    [/xu[ấa]t huy[ếe]t ti[êe]u h[óo]a/i, ['Nôn ra máu', 'Tiêu phân đen', 'Da niêm nhạt',
        'Mạch nhanh – huyết áp tụt', 'Thăm trực tràng có phân đen']],
    [/suy th[ậa]n|creatinin|ni[ệe]u/i, ['Tiểu ít / vô niệu', 'Phù mặt và hai chân', 'Buồn nôn – nôn',
        'Tăng huyết áp', 'Da xanh xao – ngứa']],
    [/nhi[ễe]m tr[ùu]ng ti[ểe]u|ti[ếe]t ni[ệe]u/i, ['Tiểu gắt buốt', 'Tiểu lắt nhắt', 'Tiểu đục',
        'Đau hông lưng', 'Rung thận (+)', 'Sốt lạnh run']],
    [/đ[ộo]t qu[ỵy]|th[ầa]n kinh khu tr[úu]/i, ['Khởi phát đột ngột', 'Yếu liệt nửa người', 'Méo miệng',
        'Nói đớ – thất ngôn', 'Rối loạn tri giác', 'Babinski (+)']],
    [/m[àa]ng n[ãa]o/i, ['Sốt cao', 'Đau đầu dữ dội', 'Nôn vọt', 'Cổ gượng', 'Kernig (+)', 'Brudzinski (+)']],
    [/copd|hen|t[ắa]c ngh[ẽe]n/i, ['Khò khè thì thở ra', 'Ran ngáy – ran rít', 'Lồng ngực hình thùng',
        'Thở ra kéo dài', 'Co kéo cơ hô hấp phụ']],
    [/ti[êe]u ch[ảa]y|m[ấa]t n[ướơ]{1,2}c/i, ['Mắt trũng', 'Dấu véo da mất chậm', 'Khát nước – môi khô',
        'Tiểu ít', 'Mạch nhanh nhẹ']],
    [/s[ốo]c|t[ụu]t huy[ếe]t [áa]p/i, ['Huyết áp tụt', 'Mạch nhanh nhẹ khó bắt', 'Da lạnh ẩm – nổi bông',
        'Thời gian đổ đầy mao mạch > 3 giây', 'Thiểu niệu', 'Rối loạn tri giác']],
    [/kh[ớo]p|c[ơo] x[ươư]{1,2}ng/i, ['Sưng – nóng – đỏ – đau khớp', 'Cứng khớp buổi sáng',
        'Giới hạn tầm vận động', 'Biến dạng khớp']],
    [/ph[ùu]/i, ['Phù ấn lõm', 'Phù mặt buổi sáng', 'Tăng cân nhanh', 'Báng bụng', 'Tràn dịch màng phổi']],
    [/co gi[ậa]t/i, ['Cơn co cứng – co giật toàn thân', 'Mất ý thức trong cơn', 'Cắn lưỡi – tiêu tiểu không tự chủ',
        'Lú lẫn sau cơn']]
];

/** Dấu hiệu then chốt gợi ý cho một tên vấn đề */
export function hallmarksFor(ten) {
    const hit = HALLMARKS.find(([re]) => re.test(ten || ''));
    return hit ? hit[1] : [];
}

/* =====================================================================
   Cận lâm sàng phân định gắn sẵn cho từng nguyên nhân — bấm chip nguyên nhân
   là ô "CLS để phân định" tự có nội dung, khỏi phải nhớ bộ xét nghiệm nào.
   ===================================================================== */
export const CAUSE_CLS = [
    [/thi[ếe]u s[ắa]t/i, 'Ferritin, Sắt huyết thanh, Transferrin, Hồng cầu lưới'],
    [/thalassemia/i, 'Điện di huyết sắc tố, Phết máu ngoại vi, Ferritin'],
    [/b12|folate/i, 'Vitamin B12, Folate máu, LDH, Bilirubin gián tiếp'],
    [/tan m[áa]u|t[áa]n huy[ếe]t/i, 'Hồng cầu lưới, LDH, Haptoglobin, Bilirubin gián tiếp, Coombs'],
    [/gi[ảa]m sinh|suy t[ủu]y|b[ạa]ch c[ầa]u c[ấa]p|lo[ạa]n sinh t[ủu]y/i, 'Tủy đồ, Phết máu ngoại vi, Dấu ấn miễn dịch tế bào'],
    [/m[ấa]t m[áa]u|xu[ấa]t huy[ếe]t ti[êe]u h[óo]a/i, 'Công thức máu, Nội soi tiêu hóa, Tìm máu ẩn trong phân'],

    [/vi[êe]m ph[ổo]i/i, 'X-quang ngực thẳng, Công thức máu, CRP – Procalcitonin, Cấy đàm'],
    [/lao/i, 'AFB đàm 2 mẫu, GeneXpert MTB/RIF, X-quang ngực thẳng'],
    [/thuy[êe]n t[ắa]c ph[ổo]i/i, 'D-dimer, CT động mạch phổi (CT-PA), Siêu âm Doppler tĩnh mạch chi dưới'],
    [/tr[àa]n kh[íi] m[àa]ng ph[ổo]i/i, 'X-quang ngực thẳng đứng, Siêu âm màng phổi tại giường'],
    [/tr[àa]n d[ịi]ch m[àa]ng ph[ổo]i/i, 'X-quang ngực, Siêu âm màng phổi, Chọc dò dịch màng phổi (Light)'],
    [/ung th[ưu] ph[ổo]i/i, 'CT ngực có cản quang, Nội soi phế quản sinh thiết, Tế bào học đàm'],
    [/copd|t[ắa]c ngh[ẽe]n/i, 'Hô hấp ký sau giãn phế quản, Khí máu động mạch, X-quang ngực'],
    [/hen/i, 'Hô hấp ký có test giãn phế quản, PEF, IgE – FeNO'],

    [/nh[ồo]i m[áa]u c[ơo] tim|v[àa]nh c[ấa]p/i, 'ECG 12 chuyển đạo, Troponin hs (0h – 1h), Siêu âm tim'],
    [/b[óo]c t[áa]ch đ[ộo]ng m[ạa]ch ch[ủu]/i, 'CT động mạch chủ có cản quang, D-dimer, Siêu âm tim qua thực quản'],
    [/suy tim/i, 'NT-proBNP, Siêu âm tim (EF), ECG, X-quang ngực'],
    [/h[ẹe]p|h[ởo] van/i, 'Siêu âm tim Doppler màu, ECG, X-quang ngực'],
    [/vi[êe]m n[ộo]i t[âa]m m[ạa]c/i, 'Cấy máu 3 mẫu, Siêu âm tim qua thực quản, CRP – VS'],
    [/lo[ạa]n nh[ịi]p|rung nh[ĩi]/i, 'ECG 12 chuyển đạo, Holter ECG 24 giờ, TSH – FT4, Ion đồ'],

    [/vi[êe]m ru[ộo]t th[ừu]a/i, 'Công thức máu, CRP, Siêu âm bụng (Alvarado), CT bụng khi khó'],
    [/t[ắa]c ru[ộo]t/i, 'X-quang bụng đứng không sửa soạn, CT bụng cản quang, Ion đồ'],
    [/th[ủu]ng t[ạa]ng r[ỗo]ng/i, 'X-quang bụng đứng (liềm hơi), CT bụng'],
    [/vi[êe]m t[ụu]y/i, 'Amylase – Lipase máu, CT bụng cản quang, Triglyceride – Canxi máu'],
    [/s[ỏo]i m[ậa]t|đ[ườơ]{1,2}ng m[ậa]t|t[úu]i m[ậa]t/i, 'Siêu âm bụng, Bilirubin TP – TT, ALP – GGT, MRCP'],
    [/xo gan|x[ơo] gan/i, 'Albumin, PT – INR, Bilirubin, Siêu âm bụng, Nội soi tìm giãn tĩnh mạch thực quản'],
    [/vi[êe]m gan (si[êe]u vi|virus|b|c)/i, 'HBsAg – Anti HCV, AST – ALT, PT – INR, Tải lượng virus'],
    [/lo[ée]t d[ạa] d[àa]y|t[áa] tr[àa]ng/i, 'Nội soi thực quản – dạ dày – tá tràng, Test HP (urease / hơi thở)'],
    [/gi[ãa]n t[ĩi]nh m[ạa]ch th[ựư]c qu[ảa]n/i, 'Nội soi thực quản – dạ dày cấp cứu, Công thức máu, Nhóm máu'],
    [/ung th[ưu] (d[ạa] d[àa]y|đ[ạa]i tr[àa]ng|tr[ựư]c tr[àa]ng)/i, 'Nội soi sinh thiết, CEA – CA 19-9, CT bụng chậu'],

    [/nhi[ễe]m tr[ùu]ng ti[ểe]u|vi[êe]m b[àa]ng quang|b[ểe] th[ậa]n/i, 'Tổng phân tích nước tiểu, Cấy nước tiểu + kháng sinh đồ, Siêu âm hệ niệu'],
    [/s[ỏo]i (ni[ệe]u|th[ậa]n)/i, 'Siêu âm hệ niệu, CT hệ niệu không cản quang, Tổng phân tích nước tiểu'],
    [/h[ộo]i ch[ứu]ng th[ậa]n h[ưu]/i, 'Đạm niệu 24 giờ, Albumin máu, Bộ mỡ, Sinh thiết thận'],
    [/vi[êe]m c[ầa]u th[ậa]n/i, 'Tổng phân tích nước tiểu (trụ hồng cầu), ASO, C3 – C4, ANA'],

    [/nh[ồo]i m[áa]u n[ãa]o/i, 'CT sọ não không cản quang, MRI DWI, Siêu âm Doppler động mạch cảnh, ECG'],
    [/xu[ấa]t huy[ếe]t n[ãa]o|d[ướơ]{1,2}i nh[ệe]n/i, 'CT sọ não không cản quang khẩn, CTA mạch máu não, Chọc dò dịch não tủy'],
    [/vi[êe]m m[àa]ng n[ãa]o/i, 'Chọc dò dịch não tủy (sinh hóa – tế bào – nhuộm Gram – cấy), CT sọ não trước chọc'],
    [/đ[ộo]ng kinh/i, 'Điện não đồ, MRI sọ não, Ion đồ – Đường huyết – Canxi'],
    [/h[ạa] đ[ườơ]{1,2}ng huy[ếe]t/i, 'Đường huyết mao mạch, Insulin – C-peptid'],

    [/đ[áa]i th[áa]o đ[ườơ]{1,2}ng/i, 'Đường huyết đói, HbA1c, Ceton niệu, Đạm niệu vi lượng'],
    [/c[ườơ]{1,2}ng gi[áa]p|basedow/i, 'TSH – FT4 – FT3, TRAb, Siêu âm tuyến giáp'],
    [/suy gi[áa]p/i, 'TSH – FT4, Anti-TPO, Siêu âm tuyến giáp'],

    [/s[ốo]t xu[ấa]t huy[ếe]t|dengue/i, 'NS1 / IgM Dengue, Công thức máu (Hct – tiểu cầu) mỗi ngày, AST – ALT'],
    [/s[ốo]t r[ée]t/i, 'Phết máu tìm ký sinh trùng sốt rét, Test nhanh sốt rét'],
    [/nhi[ễe]m tr[ùu]ng huy[ếe]t|sepsis/i, 'Cấy máu 2 mẫu, Lactat máu, Procalcitonin, Khí máu động mạch'],
    [/ph[ảa]n v[ệe]/i, 'Tryptase máu, theo dõi sinh hiệu liên tục'],
    [/thai ngo[àa]i t[ửư] cung/i, 'Beta hCG định lượng, Siêu âm đầu dò âm đạo'],
    [/ti[ềe]n s[ảa]n gi[ậa]t|hellp/i, 'Đạm niệu, Công thức máu – tiểu cầu, AST – ALT – LDH, Chức năng thận']
];

/** Bộ cận lâm sàng phân định chuẩn của một nguyên nhân (rỗng nếu chưa có trong thư viện) */
export function clsForCause(ten) {
    const hit = CAUSE_CLS.find(([re]) => re.test(ten || ''));
    return hit ? hit[1] : '';
}

/* Đợt 2: phủ nốt các nguyên nhân hay được bấm nhất trong thư viện. Đặt sau nên
   không đè lên các mẫu hẹp hơn ở trên (find lấy mẫu khớp đầu tiên). */
CAUSE_CLS.push(
    /* --- huyết học --- */
    [/gi[ảa]m ti[ểe]u c[ầa]u/i, 'Công thức máu + phết máu ngoại vi (loại trừ giả giảm), Đông máu toàn bộ, HIV – HCV, Kháng thể kháng tiểu cầu'],
    [/r[ốo]i lo[ạa]n đ[ôo]ng m[áa]u|đ[ôo]ng m[áa]u huy[ếe]t t[ươư]{1,2}ng/i, 'PT – aPTT – Fibrinogen, D-dimer, Định lượng yếu tố đông máu, Mixing test'],
    [/\bdic\b|n[ộo]i m[ạa]ch lan t[ỏo]a/i, 'Tiểu cầu, PT – aPTT, Fibrinogen, D-dimer, Phết máu tìm mảnh vỡ hồng cầu'],
    [/lymphoma|h[ạa]ch [áa]c t[íi]nh/i, 'Sinh thiết hạch trọn, LDH – Beta2 microglobulin, CT ngực – bụng – chậu hoặc PET-CT, Tủy đồ'],
    [/di c[ăa]n|[áa]c t[íi]nh|ung th[ưu]/i, 'CT ngực – bụng – chậu có cản quang, Dấu ấn ung thư theo cơ quan, Sinh thiết mô bệnh học'],
    [/thi[ếe]u m[áa]u b[ệe]nh m[ạa]n/i, 'Ferritin (bình thường hoặc tăng), Sắt huyết thanh giảm, Transferrin giảm, CRP – VS'],
    [/kh[áa]ng đ[ôo]ng|warfarin|heparin/i, 'PT – INR, aPTT, Anti-Xa, Công thức máu – tiểu cầu'],

    /* --- nhiễm --- */
    [/nhi[ễe]m tr[ùu]ng h[ôo] h[ấa]p/i, 'X-quang ngực thẳng, Công thức máu, CRP – Procalcitonin, Cấy đàm'],
    [/nhi[ễe]m tr[ùu]ng (ti[ếe]t ni[ệe]u|đ[ườơ]{1,2}ng ti[ểe]u)/i, 'Tổng phân tích nước tiểu, Cấy nước tiểu + kháng sinh đồ, Siêu âm hệ niệu'],
    [/nhi[ễe]m tr[ùu]ng (ti[êe]u h[óo]a|gan m[ậa]t)/i, 'Siêu âm bụng, Men gan – Bilirubin, Cấy máu, Soi – cấy phân'],
    [/nhi[ễe]m tr[ùu]ng (da|m[ôo] m[ềe]m)/i, 'Công thức máu – CRP, Cấy mủ + kháng sinh đồ, Siêu âm phần mềm tìm ổ áp xe'],
    [/th[ầa]n kinh trung [ươư]{1,2}ng|vi[êe]m n[ãa]o/i, 'Chọc dò dịch não tủy, CT / MRI sọ não, PCR đa tác nhân dịch não tủy'],
    [/nhi[ễe]m si[êe]u vi|ebv|cmv/i, 'Công thức máu – phết máu, Huyết thanh chẩn đoán (EBV, CMV), Men gan, Test nhanh HIV'],
    [/\bhiv\b/i, 'Test nhanh HIV + khẳng định, CD4, Tải lượng HIV RNA'],
    [/vi[êe]m m[àa]ng ngo[àa]i tim/i, 'ECG (ST chênh lên lan tỏa), Siêu âm tim, CRP – VS, Troponin'],

    /* --- hô hấp --- */
    [/gi[ãa]n ph[ếe] qu[ảa]n/i, 'CT ngực lớp mỏng độ phân giải cao (HRCT), Cấy đàm, Hô hấp ký'],
    [/x[ẹe]p ph[ổo]i/i, 'X-quang ngực thẳng – nghiêng, CT ngực, Nội soi phế quản tìm tắc nghẽn'],
    [/u ph[ổo]i|kh[ốo]i ph[ổo]i/i, 'CT ngực có cản quang, Nội soi phế quản sinh thiết, Tế bào học đàm, PET-CT'],
    [/toan chuy[ểe]n h[óo]a/i, 'Khí máu động mạch, Ion đồ – khoảng trống anion, Lactat, Ceton máu'],
    [/tr[àa]n m[ủu] m[àa]ng ph[ổo]i|m[ủu] m[àa]ng ph[ổo]i/i, 'Chọc dò dịch màng phổi (pH, LDH, glucose, nhuộm Gram – cấy), CT ngực'],

    /* --- tim mạch --- */
    [/đau th[ắa]t ng[ựư]c [ổo]n đ[ịi]nh/i, 'ECG gắng sức hoặc siêu âm tim gắng sức, CT mạch vành, Bộ mỡ máu'],
    [/t[ăa]ng huy[ếe]t [áa]p/i, 'Holter huyết áp 24 giờ, Ion đồ – creatinin, Đạm niệu, Soi đáy mắt, ECG – siêu âm tim'],
    [/ch[èe]n [ée]p tim|tr[àa]n d[ịi]ch m[àa]ng ngo[àa]i tim/i, 'Siêu âm tim cấp cứu, ECG (điện thế thấp, luân phiên điện học), X-quang ngực'],
    [/suy t[ĩi]nh m[ạa]ch|huy[ếe]t kh[ốo]i t[ĩi]nh m[ạa]ch s[âa]u|\bdvt\b/i, 'Siêu âm Doppler tĩnh mạch chi dưới, D-dimer'],

    /* --- tiêu hóa --- */
    [/tr[àa]o ng[ượơ]{1,2}c d[ạa] d[àa]y/i, 'Nội soi thực quản – dạ dày, Đo pH thực quản 24 giờ, Test điều trị PPI'],
    [/vi[êe]m d[ạa] d[àa]y/i, 'Nội soi dạ dày, Test HP (urease nhanh / hơi thở / kháng nguyên phân)'],
    [/vi[êe]m ru[ộo]t|crohn|vi[êe]m lo[ée]t đ[ạa]i tr[àa]ng/i, 'Nội soi đại tràng sinh thiết, Calprotectin phân, CRP – VS'],
    [/l[ỵy]|nhi[ễe]m tr[ùu]ng đ[ườơ]{1,2}ng ru[ộo]t/i, 'Soi phân – cấy phân, Công thức máu, Ion đồ'],
    [/k[ée]m h[ấa]p thu/i, 'Albumin – Prealbumin, Vitamin B12 – Folate – Sắt, Nội soi sinh thiết tá tràng, Anti-tTG'],
    [/th[ủu]ng t[ạa]ng r[ỗo]ng/i, 'X-quang bụng đứng tìm liềm hơi, CT bụng, Công thức máu – lactat'],
    [/xu[ấa]t huy[ếe]t ti[êe]u h[óo]a d[ướơ]{1,2}i/i, 'Nội soi đại tràng, CT mạch máu tạng, Xạ hình hồng cầu đánh dấu'],

    /* --- thận – niệu --- */
    [/ho[ạa]i t[ửư] [ốo]ng th[ậa]n c[ấa]p|\batn\b/i, 'Cặn lắng nước tiểu (trụ hạt nâu bùn), Ion đồ niệu – FeNa, Siêu âm hệ niệu'],
    [/tr[ướơ]{1,2}c th[ậa]n|gi[ảa]m t[ướơ]{1,2}i m[áa]u th[ậa]n/i, 'FeNa < 1%, Tỉ số ure/creatinin > 20, Siêu âm đánh giá thể tích tuần hoàn'],
    [/sau th[ậa]n|t[ắa]c ngh[ẽe]n đ[ườơ]{1,2}ng ni[ệe]u/i, 'Siêu âm hệ niệu (thận ứ nước), CT hệ niệu không cản quang'],
    [/ti[ểe]u m[áa]u/i, 'Tổng phân tích nước tiểu + cặn lắng, Siêu âm hệ niệu, CT hệ niệu, Nội soi bàng quang'],

    /* --- nội tiết --- */
    [/suy th[ượơ]{1,2}ng th[ậa]n/i, 'Cortisol máu 8 giờ sáng, ACTH, Ion đồ (Na giảm – K tăng), Đường huyết'],
    [/cushing/i, 'Cortisol tự do niệu 24 giờ, Test ức chế Dexamethasone 1 mg, ACTH, MRI tuyến yên'],
    [/h[ạa] đ[ườơ]{1,2}ng huy[ếe]t/i, 'Đường huyết mao mạch và tĩnh mạch, Insulin – C-peptid, Cortisol'],
    [/r[ốo]i lo[ạa]n lipid|m[ỡơ] m[áa]u/i, 'Bộ mỡ máu đói (Cholesterol, LDL, HDL, Triglyceride), HbA1c, TSH'],

    /* --- thần kinh --- */
    [/đ[ộo]ng kinh/i, 'Điện não đồ, MRI sọ não, Ion đồ – Canxi – Đường huyết'],
    [/u n[ãa]o|kh[ốo]i n[ộo]i s[ọo]/i, 'MRI sọ não có cản từ, CT sọ não, Sinh thiết định vị'],
    [/[áa]p xe n[ãa]o/i, 'MRI sọ não có cản từ, Cấy máu, CRP – Procalcitonin'],
    [/sa s[úu]t tr[íi] tu[ệe]|alzheimer/i, 'MMSE / MoCA, MRI sọ não, TSH – Vitamin B12, VDRL'],
    [/ti[ềe]n đ[ìi]nh|ch[óo]ng m[ặa]t/i, 'Nghiệm pháp Dix-Hallpike, MRI sọ não khi nghi trung ương, Đo thính lực'],

    /* --- cơ xương khớp – tự miễn --- */
    [/lupus|\bsle\b/i, 'ANA, Anti dsDNA, C3 – C4, Công thức máu, Đạm niệu'],
    [/vi[êe]m kh[ớo]p d[ạa]ng th[ấa]p/i, 'RF, Anti-CCP, CRP – VS, X-quang bàn tay – cổ tay'],
    [/b[ệe]nh h[ệe] th[ốo]ng|m[ôo] li[êe]n k[ếe]t|t[ựư] mi[ễe]n/i, 'ANA, ENA profile, CRP – VS, Bổ thể C3 – C4'],
    [/gout|g[úu]t/i, 'Acid uric máu, Dịch khớp tìm tinh thể urat, Siêu âm khớp (dấu đường đôi)'],
    [/vi[êe]m kh[ớo]p nhi[ễe]m tr[ùu]ng/i, 'Chọc dịch khớp (tế bào, nhuộm Gram, cấy), Cấy máu, CRP – Procalcitonin'],
    [/tho[áa]i h[óo]a kh[ớo]p/i, 'X-quang khớp tư thế chịu lực, CRP – VS (để loại trừ viêm)'],
    [/tho[áa]t v[ịi] đ[ĩi]a đ[ệe]m|ch[èe]n [ée]p r[ễe]/i, 'MRI cột sống, X-quang cột sống, Điện cơ khi cần'],

    /* --- do thuốc / khác --- */
    [/do thu[ốo]c|thu[ốo]c g[âa]y/i, 'Rà lại toàn bộ thuốc đang dùng và mốc thời gian, Ngưng thuốc nghi ngờ và theo dõi, Men gan – chức năng thận'],
    [/tr[ầa]m c[ảa]m|t[âa]m l[ýy]|lo [âa]u/i, 'Thang PHQ-9 / GAD-7, Loại trừ nguyên nhân thực thể (TSH, công thức máu, sinh hóa)'],
    [/v[ôo] c[ăa]n/i, 'Chẩn đoán loại trừ — cần rà lại toàn bộ bệnh sử, thuốc và các xét nghiệm đã làm']
);



/* =====================================================================
   Danh mục vấn đề / hội chứng xếp theo chuyên khoa — dùng cho bảng chọn ở
   mục VIII. Đặt vấn đề. Chọn một mục là mục X tự mọc thẻ biện luận tương ứng.
   ===================================================================== */
export const VAN_DE_NHOM = [
    {
        ten: 'Toàn thân', icon: 'fa-person', items: [
            'Hội chứng nhiễm trùng', 'Hội chứng nhiễm siêu vi', 'Sốt kéo dài chưa rõ nguyên nhân',
            'Hội chứng đáp ứng viêm toàn thân (SIRS)',
            'Sụt cân – triệu chứng B', 'Suy kiệt – suy dinh dưỡng', 'Thừa cân – béo phì',
            'Hội chứng phù toàn thân', 'Mệt mỏi kéo dài', 'Hội chứng lão suy']
    },
    {
        ten: 'Hô hấp', icon: 'fa-lungs', items: [
            'Hội chứng đông đặc phổi', 'Hội chứng ba giảm (tràn dịch màng phổi)', 'Hội chứng tràn khí màng phổi',
            'Hội chứng tắc nghẽn đường thở', 'Suy hô hấp cấp', 'Suy hô hấp mạn',
            'Ho kéo dài', 'Ho ra máu', 'Khó thở cấp', 'Khó thở mạn', 'Hội chứng xẹp phổi',
            'Hội chứng trung thất', 'Ngưng thở khi ngủ']
    },
    {
        ten: 'Tim mạch', icon: 'fa-heart-pulse', items: [
            'Hội chứng suy tim ứ huyết', 'Hội chứng suy tim trái', 'Hội chứng suy tim phải',
            'Hội chứng suy tim toàn bộ', 'Đợt mất bù suy tim', 'Đau ngực cấp',
            'Cơn đau thắt ngực ổn định', 'Hội chứng vành cấp', 'Tăng huyết áp',
            'Cơn tăng huyết áp cấp cứu', 'Hội chứng van tim (hẹp – hở)', 'Rối loạn nhịp tim',
            'Hồi hộp – đánh trống ngực', 'Ngất', 'Hội chứng tĩnh mạch chủ trên',
            'Bệnh động mạch chi dưới', 'Huyết khối tĩnh mạch sâu']
    },
    {
        ten: 'Tiêu hóa – gan mật', icon: 'fa-utensils', items: [
            'Đau bụng cấp', 'Đau bụng mạn', 'Hội chứng xuất huyết tiêu hóa trên',
            'Hội chứng xuất huyết tiêu hóa dưới', 'Hội chứng vàng da tắc mật',
            'Hội chứng suy tế bào gan', 'Hội chứng tăng áp tĩnh mạch cửa', 'Cổ trướng',
            'Hội chứng nhiễm trùng đường mật', 'Hội chứng lỵ', 'Tiêu chảy cấp', 'Tiêu chảy mạn',
            'Táo bón kéo dài',
            'Hội chứng kém hấp thu', 'Hội chứng não gan', 'Khối u vùng bụng']
    },
    {
        ten: 'Thận – tiết niệu', icon: 'fa-droplet', items: [
            'Hội chứng thận hư', 'Hội chứng viêm cầu thận cấp', 'Tổn thương thận cấp',
            'Bệnh thận mạn', 'Hội chứng ure huyết cao', 'Nhiễm trùng đường tiểu',
            'Cơn đau quặn thận', 'Tiểu máu', 'Hội chứng bế tắc đường tiểu', 'Bí tiểu cấp',
            'Rối loạn điện giải',
            'Toan – kiềm chuyển hóa']
    },
    {
        ten: 'Thần kinh', icon: 'fa-brain', items: [
            'Hội chứng liệt nửa người', 'Hội chứng tăng áp lực nội sọ', 'Hội chứng màng não',
            'Rối loạn tri giác – hôn mê', 'Đau đầu cấp', 'Đau đầu mạn', 'Cơn co giật',
            'Hội chứng tiểu não', 'Hội chứng tháp', 'Hội chứng ngoại tháp', 'Hội chứng chèn ép tủy',
            'Bệnh lý đa dây thần kinh', 'Chóng mặt – rối loạn tiền đình']
    },
    {
        ten: 'Nhiễm', icon: 'fa-shield-virus', items: [
            'Sốt xuất huyết Dengue', 'Nhiễm trùng huyết', 'Sốc nhiễm trùng',
            'Lao phổi', 'Lao ngoài phổi', 'Sốt rét', 'Nhiễm HIV/AIDS',
            'Viêm gan siêu vi cấp', 'Nhiễm trùng da – mô mềm', 'Uốn ván', 'Tay chân miệng']
    },
    {
        ten: 'Huyết học', icon: 'fa-droplet', items: [
            'Hội chứng thiếu máu', 'Hội chứng xuất huyết', 'Hội chứng suy tủy',
            'Hội chứng tăng sinh tủy', 'Hạch to', 'Lách to', 'Rối loạn đông máu',
            'Giảm tiểu cầu', 'Tăng bạch cầu bất thường']
    },
    {
        ten: 'Nội tiết – chuyển hóa', icon: 'fa-flask', items: [
            'Đái tháo đường', 'Nhiễm toan ceton do đái tháo đường', 'Hạ đường huyết',
            'Hội chứng cường giáp', 'Hội chứng suy giáp', 'Bướu giáp',
            'Hội chứng Cushing', 'Suy thượng thận cấp', 'Rối loạn lipid máu', 'Loãng xương']
    },
    {
        ten: 'Cơ xương khớp', icon: 'fa-bone', items: [
            'Hội chứng viêm khớp', 'Đau khớp cơ học', 'Đau cột sống thắt lưng',
            'Hội chứng chèn ép rễ thần kinh', 'Viêm khớp dạng thấp', 'Gout cấp',
            'Thoái hóa khớp', 'Loãng xương – gãy xương bệnh lý', 'Viêm cơ – yếu cơ gốc chi']
    },
    {
        ten: 'Ngoại khoa – chấn thương', icon: 'fa-user-injured', items: [
            'Hội chứng viêm phúc mạc', 'Hội chứng tắc ruột', 'Hội chứng thủng tạng rỗng',
            'Hội chứng chảy máu trong ổ bụng', 'Viêm ruột thừa cấp', 'Viêm tụy cấp',
            'Chấn thương sọ não', 'Chấn thương bụng kín', 'Chấn thương ngực kín',
            'Gãy xương', 'Bỏng', 'Khối vùng bẹn bìu', 'Áp xe – nhiễm trùng vết mổ']
    },
    {
        ten: 'Sản – phụ khoa', icon: 'fa-baby', items: [
            'Thai kỳ bình thường theo dõi chuyển dạ', 'Dọa sinh non', 'Dọa sẩy thai',
            'Ra huyết âm đạo trong thai kỳ', 'Tiền sản giật', 'Sản giật',
            'Đái tháo đường thai kỳ', 'Thai ngoài tử cung', 'Nhiễm trùng hậu sản',
            'Băng huyết sau sinh', 'Khối u phần phụ', 'Rong kinh – rong huyết']
    },
    {
        ten: 'Nhi khoa', icon: 'fa-child', items: [
            'Sốt ở trẻ em', 'Co giật do sốt', 'Tiêu chảy cấp có mất nước',
            'Viêm phổi ở trẻ em', 'Suy dinh dưỡng ở trẻ', 'Vàng da sơ sinh',
            'Nhiễm trùng sơ sinh', 'Hen phế quản trẻ em', 'Chậm phát triển tâm vận']
    },
    {
        ten: 'Cấp cứu', icon: 'fa-truck-medical', items: [
            'Sốc giảm thể tích', 'Sốc tim', 'Sốc phản vệ', 'Sốc tắc nghẽn',
            'Ngưng hô hấp tuần hoàn', 'Ngộ độc cấp', 'Đuối nước', 'Điện giật',
            'Say nắng – sốc nhiệt', 'Rắn cắn']
    }
];

/* =====================================================================
   Tiêu chuẩn chẩn đoán tối thiểu — hiện khi bấm vào tên vấn đề để sinh viên
   biết cần có đủ những gì mới được kết luận, tránh chẩn đoán "theo cảm tính".
   ===================================================================== */
export const TIEU_CHUAN = [
    [/vi[êe]m ph[ổo]i/i, 'Thâm nhiễm mới trên X-quang ngực + ≥ 2 trong: sốt > 38°C hoặc < 36°C, ho khạc đàm mủ, bạch cầu > 10.000 hoặc < 4.000, ran nổ / hội chứng đông đặc.'],
    [/v[àa]nh c[ấa]p|nh[ồo]i m[áa]u c[ơo] tim/i, 'Troponin hs tăng – giảm với ít nhất một giá trị trên bách phân vị 99, KÈM ≥ 1 trong: triệu chứng thiếu máu cơ tim, biến đổi ST-T / block nhánh trái mới, sóng Q bệnh lý, rối loạn vận động vùng mới trên siêu âm tim.'],
    [/suy tim/i, 'Tiêu chuẩn Framingham: ≥ 2 tiêu chuẩn chính, hoặc 1 chính + 2 phụ. Kèm NT-proBNP tăng và EF trên siêu âm tim để phân nhóm HFrEF / HFmrEF / HFpEF.'],
    [/đ[ợo]t c[ấa]p copd/i, 'Nền COPD đã xác định bằng hô hấp ký (FEV1/FVC < 0,70 sau giãn phế quản) + tăng ít nhất 1 trong tam chứng Anthonisen: khó thở tăng, lượng đàm tăng, đàm đổi màu mủ.'],
    [/hen/i, 'Triệu chứng hô hấp thay đổi theo thời gian + bằng chứng giới hạn luồng khí dao động: test giãn phế quản dương (FEV1 tăng > 12% và > 200 mL) hoặc dao động PEF > 10%.'],
    [/s[ốo]t xu[ấa]t huy[ếe]t|dengue/i, 'Sốt cấp 2–7 ngày + ≥ 2 trong: nhức đầu – đau sau hố mắt, đau cơ khớp, buồn nôn, phát ban, dấu dây thắt (+), bạch cầu giảm; xác định bằng NS1 / IgM / PCR Dengue.'],
    [/nhi[ễe]m tr[ùu]ng huy[ếe]t|sepsis/i, 'Sepsis-3: nghi ngờ nhiễm trùng + tăng ≥ 2 điểm SOFA. Sàng lọc nhanh bằng qSOFA ≥ 2 (nhịp thở ≥ 22, rối loạn tri giác, HA tâm thu ≤ 100).'],
    [/vi[êe]m ru[ộo]t th[ừu]a/i, 'Điểm Alvarado ≥ 7 (đau chuyển vị hố chậu phải, chán ăn, buồn nôn, đau khu trú, phản ứng dội, sốt, bạch cầu tăng, neutrophil ưu thế) + hình ảnh siêu âm / CT phù hợp.'],
    [/vi[êe]m t[ụu]y c[ấa]p/i, 'Atlanta 2012: ≥ 2 trong 3 — đau bụng điển hình thượng vị lan sau lưng; Amylase / Lipase ≥ 3 lần giới hạn trên; hình ảnh viêm tụy trên siêu âm / CT.'],
    [/xo gan|x[ơo] gan/i, 'Hội chứng suy tế bào gan + hội chứng tăng áp cửa trên lâm sàng và hình ảnh; phân giai đoạn bằng Child-Pugh và MELD.'],
    [/t[ổo]n th[ươư]{1,2}ng th[ậa]n c[ấa]p|suy th[ậa]n c[ấa]p/i, 'KDIGO: creatinin tăng ≥ 0,3 mg/dL trong 48 giờ, hoặc tăng ≥ 1,5 lần nền trong 7 ngày, hoặc nước tiểu < 0,5 mL/kg/giờ trong 6 giờ.'],
    [/b[ệe]nh th[ậa]n m[ạa]n/i, 'Bất thường cấu trúc hoặc chức năng thận kéo dài > 3 tháng: eGFR < 60 mL/ph/1,73m² hoặc có dấu tổn thương thận (đạm niệu, tiểu máu, bất thường hình ảnh).'],
    [/th[ậa]n h[ưu]/i, 'Đạm niệu > 3,5 g/24 giờ + Albumin máu < 30 g/L + phù + rối loạn lipid máu.'],
    [/vi[êe]m c[ầa]u th[ậa]n c[ấa]p/i, 'Hội chứng viêm thận: tiểu máu (trụ hồng cầu) + đạm niệu + tăng huyết áp + phù + giảm mức lọc cầu thận.'],
    [/đ[áa]i th[áa]o đ[ườơ]{1,2}ng/i, 'ADA: HbA1c ≥ 6,5%, hoặc đường huyết đói ≥ 126 mg/dL, hoặc đường huyết 2 giờ sau nghiệm pháp ≥ 200 mg/dL, hoặc đường huyết bất kỳ ≥ 200 mg/dL kèm triệu chứng. Cần 2 lần xét nghiệm nếu không có triệu chứng.'],
    [/nhi[ễe]m toan ceton/i, 'Đường huyết > 250 mg/dL + pH < 7,3 hoặc HCO3⁻ < 18 mmol/L + ceton máu / niệu dương tính.'],
    [/đ[ộo]t qu[ỵy]|nh[ồo]i m[áa]u n[ãa]o|xu[ấa]t huy[ếe]t n[ãa]o/i, 'Khiếm khuyết thần kinh khu trú khởi phát đột ngột kéo dài > 24 giờ (hoặc tử vong sớm), có nguồn gốc mạch máu; phân định nhồi máu / xuất huyết bằng CT hoặc MRI sọ não.'],
    [/vi[êe]m m[àa]ng n[ãa]o/i, 'Hội chứng nhiễm trùng + hội chứng màng não, xác định bằng dịch não tủy: tế bào tăng, protein tăng, glucose DNT/máu giảm, nhuộm Gram – cấy hoặc PCR dương.'],
    [/ti[ềe]n s[ảa]n gi[ậa]t/i, 'Thai ≥ 20 tuần: huyết áp ≥ 140/90 mmHg đo 2 lần cách 4 giờ + đạm niệu ≥ 300 mg/24 giờ (hoặc dấu hiệu nặng cơ quan đích khi không có đạm niệu).'],
    [/d[ọo]a sinh non/i, 'Thai 22–36 tuần 6 ngày: cơn gò tử cung đều ≥ 4 cơn/20 phút + biến đổi cổ tử cung (xóa ≥ 80% hoặc mở ≥ 2 cm) hoặc chiều dài cổ tử cung < 25 mm trên siêu âm.'],
    [/vi[êe]m kh[ớo]p d[ạa]ng th[ấa]p/i, 'ACR/EULAR 2010 ≥ 6/10 điểm: số khớp viêm, RF / anti-CCP, CRP / VS, thời gian triệu chứng ≥ 6 tuần.'],
    [/gout/i, 'Viêm khớp cấp một khớp (thường ngón cái) + acid uric máu tăng; tiêu chuẩn vàng là tìm thấy tinh thể urat hình kim lưỡng chiết âm trong dịch khớp.'],
    [/thi[ếe]u m[áa]u/i, 'WHO: Hb < 130 g/L ở nam, < 120 g/L ở nữ, < 110 g/L ở phụ nữ mang thai. Phân loại tiếp theo MCV và hồng cầu lưới.'],
    [/nhi[ễe]m tr[ùu]ng ti[ểe]u|ti[ếe]t ni[ệe]u/i, 'Triệu chứng đường tiểu + bạch cầu niệu (≥ 10/µL) + cấy nước tiểu ≥ 10⁵ CFU/mL (≥ 10³ nếu lấy qua sonde hoặc có triệu chứng rõ).'],
    [/tr[àa]n d[ịi]ch m[àa]ng ph[ổo]i/i, 'Hội chứng ba giảm + hình ảnh trên X-quang / siêu âm; phân dịch thấm – dịch tiết theo tiêu chuẩn Light qua chọc dò.'],
    [/thuy[êe]n t[ắa]c ph[ổo]i/i, 'Đánh giá xác suất lâm sàng (Wells / Geneva) → D-dimer nếu xác suất thấp – trung bình → CT động mạch phổi xác định huyết khối.'],
    [/vi[êe]m ph[úu]c m[ạa]c/i, 'Đau bụng + đề kháng thành bụng hoặc cảm ứng phúc mạc toàn thể + hội chứng nhiễm trùng; hình ảnh liềm hơi / dịch tự do ổ bụng.'],
    [/t[ắa]c ru[ộo]t/i, 'Tứ chứng: đau quặn cơn, nôn, bí trung – đại tiện, bụng chướng; X-quang bụng đứng có mực nước hơi, quai ruột giãn.'],
    [/c[ườơ]{1,2}ng gi[áa]p/i, 'TSH giảm + FT4 và/hoặc FT3 tăng, kèm triệu chứng nhiễm độc giáp; TRAb dương gợi ý Basedow.'],
    [/suy gi[áa]p/i, 'TSH tăng + FT4 giảm (suy giáp nguyên phát rõ); TSH tăng với FT4 bình thường là suy giáp dưới lâm sàng.'],
    [/s[ốo]c/i, 'Tụt huyết áp (HA tâm thu < 90 hoặc giảm > 40 mmHg so với nền) + dấu giảm tưới máu mô: da lạnh ẩm, thiểu niệu, rối loạn tri giác, lactat > 2 mmol/L.']
];

/** Tiêu chuẩn chẩn đoán tối thiểu của một vấn đề / bệnh (rỗng nếu chưa có) */
export function tieuChuanFor(ten) {
    const hit = TIEU_CHUAN.find(([re]) => re.test(ten || ''));
    return hit ? hit[1] : '';
}

/* Bổ sung phủ nốt các hội chứng còn lại trong LIBRARY — đặt sau nên không đè
   lên các mẫu hẹp hơn ở trên (find lấy mẫu khớp đầu tiên). */
HALLMARKS.push(
    [/suy t[ủu]y|gi[ảa]m (ba|3) d[òo]ng/i, ['Thiếu máu tiến triển', 'Sốt do nhiễm trùng tái đi tái lại',
        'Xuất huyết da niêm', 'Không gan lách hạch to', 'Bạch cầu và tiểu cầu cùng giảm']],
    [/xu[ấa]t huy[ếe]t(?! ti[êe]u| n[ãa]o| d[ướơ]{1,2}i)/i, ['Chấm – nốt xuất huyết da', 'Bầm máu tự nhiên',
        'Chảy máu chân răng – chảy máu mũi', 'Rong kinh kéo dài', 'Dấu dây thắt (+)']],
    [/h[ạa]ch to|n[ổo]i h[ạa]ch/i, ['Hạch to > 1 cm', 'Hạch dính – không di động', 'Hạch không đau',
        'Nhiều vùng hạch', 'Kèm sốt – sụt cân – đổ mồ hôi đêm']],
    [/s[ụu]t c[âa]n|tri[ệe]u ch[ứu]ng b|g[ầa]y s[úu]t/i, ['Sụt > 10% cân nặng trong 6 tháng', 'Sốt về chiều',
        'Đổ mồ hôi đêm', 'Chán ăn', 'Mệt mỏi kéo dài']],
    [/ho ra m[áa]u|kh[ạa]c m[áa]u/i, ['Máu đỏ tươi lẫn bọt', 'Ho ra sau cơn ho', 'Ước lượng số lượng máu / 24 giờ',
        'Kèm sốt – sụt cân', 'Tiền căn lao – hút thuốc']],
    [/t[ăa]ng huy[ếe]t [áa]p/i, ['Huyết áp ≥ 140/90 đo nhiều lần', 'Đau đầu vùng chẩm buổi sáng',
        'Chóng mặt – ù tai', 'Dày thất trái trên ECG', 'Tổn thương cơ quan đích (mắt, thận, tim)']],
    [/h[ồo]i h[ộo]p|đ[áa]nh tr[ốo]ng ng[ựư]c/i, ['Cơn khởi phát và kết thúc đột ngột', 'Mạch không đều',
        'Kèm chóng mặt hoặc ngất', 'Kèm khó thở – đau ngực', 'Yếu tố khởi phát: cà phê, rượu, gắng sức']],
    [/^ng[ấa]t|tho[áa]ng ng[ấa]t/i, ['Mất ý thức thoáng qua tự hồi phục', 'Có tiền triệu (hoa mắt, vã mồ hôi)',
        'Xảy ra khi gắng sức (gợi ý nguyên nhân tim)', 'Không lú lẫn sau cơn', 'Hạ huyết áp tư thế']],
    [/c[ổo] tr[ướơ]{1,2}ng|gan l[áa]ch to|b[áa]ng b[ụu]ng/i, ['Bụng bè, gõ đục vùng thấp', 'Dấu sóng vỗ',
        'Tuần hoàn bàng hệ', 'Gan bờ sắc / lách quá bờ sườn', 'Phù hai chân']],
    [/r[ốo]i lo[ạa]n đi[ệe]n gi[ảa]i|ion đ[ồo]/i, ['Yếu cơ – chuột rút', 'Buồn nôn – nôn', 'Lú lẫn – co giật',
        'Rối loạn nhịp trên ECG', 'Tiền căn dùng lợi tiểu / tiêu chảy kéo dài']],
    [/đ[áa]i th[áa]o đ[ườơ]{1,2}ng|t[ăa]ng đ[ườơ]{1,2}ng huy[ếe]t/i, ['Tiểu nhiều – khát nhiều', 'Ăn nhiều mà sụt cân',
        'Mệt mỏi', 'Vết thương lâu lành', 'Tê bì đầu chi', 'Nhìn mờ']],
    [/tuy[ếe]n gi[áa]p|c[ườơ]{1,2}ng gi[áa]p|suy gi[áa]p|b[ướơ]{1,2}u gi[áa]p/i, ['Bướu giáp to – có âm thổi',
        'Run tay biên độ nhỏ', 'Sụt cân dù ăn nhiều', 'Nhịp tim nhanh – hồi hộp', 'Lồi mắt', 'Sợ nóng hoặc sợ lạnh']],
    [/tri gi[áa]c|h[ôo]n m[êe]|l[úu] l[ẫa]n/i, ['Điểm Glasgow', 'Đồng tử hai bên và phản xạ ánh sáng',
        'Dấu thần kinh định vị', 'Dấu màng não', 'Kiểu thở bất thường', 'Đường huyết mao mạch']],
    [/y[ếe]u|li[ệe]t n[ửư]a ng[ườơ]{1,2}i/i, ['Khởi phát đột ngột', 'Sức cơ theo thang 0–5', 'Tăng phản xạ gân xương',
        'Babinski (+)', 'Méo miệng cùng bên hoặc đối bên', 'Rối loạn ngôn ngữ']],
    [/đau đ[ầa]u/i, ['Kiểu đau (mạch đập, siết chặt, như sét đánh)', 'Thời điểm khởi phát',
        'Kèm nôn vọt – nhìn mờ', 'Nặng lên khi ho – gắng sức', 'Kèm sốt hoặc cổ gượng', 'Dấu thần kinh khu trú']],
    [/c[ộo]t s[ốo]ng th[ắa]t l[ưu]ng|đau l[ưu]ng/i, ['Đau lan xuống chân theo rễ', 'Lasègue (+)',
        'Co cứng cơ cạnh sống', 'Giới hạn cúi ngửa', 'Tê – yếu chi dưới', 'Rối loạn cơ vòng (red flag)']],
    [/b[ụu]ng ngo[ạa]i khoa|b[ụu]ng c[ấa]p/i, ['Đau bụng liên tục tăng dần', 'Đề kháng thành bụng',
        'Cảm ứng phúc mạc', 'Mất nhu động ruột', 'Bụng chướng', 'Sốt – mạch nhanh']],
    [/ch[ấa]n th[ươư]{1,2}ng s[ọo] n[ãa]o/i, ['Cơ chế chấn thương', 'Bất tỉnh sau chấn thương', 'Quên sự việc',
        'Nôn nhiều lần', 'Glasgow', 'Chảy máu / dịch tai mũi', 'Dấu thần kinh khu trú']],
    [/ch[ấa]n th[ươư]{1,2}ng b[ụu]ng/i, ['Vết bầm thành bụng – dấu đai an toàn', 'Đau bụng khu trú',
        'Đề kháng thành bụng', 'Mạch nhanh – huyết áp tụt', 'Bụng chướng dần']],
    [/b[íi] ti[ểe]u|b[ẹe]n b[ìi]u/i, ['Cầu bàng quang', 'Mót tiểu mà không tiểu được', 'Khối vùng bẹn bìu',
        'Khối không đẩy lên được (nghẹt)', 'Đau lan xuống bìu']],
    [/ra huy[ếe]t [âa]m đ[ạa]o|xu[ấa]t huy[ếe]t [âa]m đ[ạa]o/i, ['Lượng máu và tính chất', 'Tuổi thai',
        'Đau bụng kèm theo', 'Cổ tử cung đóng hay mở', 'Tim thai', 'Sinh hiệu mẹ']],
    [/ti[ềe]n s[ảa]n gi[ậa]t|s[ảa]n gi[ậa]t/i, ['Huyết áp ≥ 140/90', 'Đạm niệu', 'Phù mặt và tay',
        'Đau đầu – nhìn mờ', 'Đau thượng vị / hạ sườn phải', 'Tăng phản xạ gân xương']],
    [/ng[ộo] đ[ộo]c/i, ['Thời điểm và loại chất', 'Số lượng đã dùng', 'Hội chứng ngộ độc (toxidrome)',
        'Đồng tử', 'Mùi hơi thở', 'Tri giác – nhịp thở']],
    [/van tim|h[ẹe]p van|h[ởo] van|[âa]m th[ổo]i/i, ['Âm thổi tâm thu / tâm trương', 'Vị trí nghe rõ nhất và hướng lan',
        'Rung miu', 'Mỏm tim lệch', 'Khó thở gắng sức', 'Hồi hộp – ngất']],
    [/vi[êe]m t[ụu]y/i, ['Đau thượng vị dữ dội lan ra sau lưng', 'Nôn không giảm đau', 'Bụng chướng – giảm nhu động',
        'Dấu Cullen / Grey-Turner', 'Tiền căn sỏi mật hoặc rượu']],
    [/t[ắa]c ru[ộo]t/i, ['Đau quặn từng cơn', 'Nôn ra dịch mật hoặc dịch phân', 'Bí trung – đại tiện',
        'Bụng chướng', 'Nhu động ruột tăng rồi mất', 'Quai ruột nổi']],
    [/th[ậa]n h[ưu]/i, ['Phù toàn thân ấn lõm', 'Phù mặt buổi sáng', 'Nước tiểu có bọt',
        'Tăng cân nhanh', 'Tràn dịch đa màng']],
    [/vi[êe]m ph[ổo]i/i, ['Sốt cao lạnh run', 'Ho khạc đàm mủ', 'Đau ngực kiểu màng phổi',
        'Ran nổ khu trú', 'Rung thanh tăng – gõ đục', 'Thở nhanh – SpO2 giảm']],
    [/t[ăa]ng [áa]p l[ựư]c n[ộo]i s[ọo]/i, ['Đau đầu tăng về sáng', 'Nôn vọt không buồn nôn',
        'Phù gai thị', 'Tam chứng Cushing (HA tăng, mạch chậm, thở bất thường)', 'Rối loạn tri giác tiến triển']],
    [/d[ọo]a sinh non|sinh non/i, ['Cơn gò tử cung đều', 'Đau trằn bụng dưới', 'Ra nhớt hồng âm đạo',
        'Cổ tử cung xóa mở', 'Tuổi thai 22–36 tuần 6 ngày']]
);

TIEU_CHUAN.push(
    [/suy t[ủu]y|gi[ảa]m (ba|3) d[òo]ng/i, 'Giảm ≥ 2 dòng tế bào máu ngoại vi + tủy nghèo tế bào (< 25% mật độ theo tuổi) trên tủy đồ / sinh thiết tủy, sau khi loại trừ xâm lấn tủy và nguyên nhân ngoại vi.'],
    [/xu[ấa]t huy[ếe]t(?! ti[êe]u| n[ãa]o| d[ướơ]{1,2}i)/i, 'Xác định tầng rối loạn: tiểu cầu (xuất huyết da niêm, chấm nốt) hay đông máu huyết tương (bầm mảng, chảy máu khớp – cơ); đối chiếu tiểu cầu, PT, aPTT, fibrinogen.'],
    [/h[ạa]ch to|n[ổo]i h[ạa]ch/i, 'Hạch > 1 cm tồn tại > 4 tuần, hoặc hạch cứng – dính – không đau, hoặc kèm triệu chứng B: có chỉ định sinh thiết hạch trọn.'],
    [/s[ụu]t c[âa]n|tri[ệe]u ch[ứu]ng b/i, 'Sụt > 5% cân nặng trong 6–12 tháng không chủ ý. Triệu chứng B (lymphoma): sốt > 38°C, đổ mồ hôi đêm, sụt > 10% trong 6 tháng.'],
    [/nhi[ễe]m tr[ùu]ng|^s[ốo]t/i, 'Sốt: nhiệt độ trung tâm > 38°C. Cần xác định ổ nhiễm, tác nhân và mức độ đáp ứng toàn thân (qSOFA / SOFA) trước khi kết luận.'],
    [/s[ốo]t k[ée]o d[àa]i|fuo/i, 'Sốt > 38,3°C kéo dài > 3 tuần, chưa rõ chẩn đoán sau 1 tuần thăm dò tại bệnh viện (hoặc 3 lần khám ngoại trú).'],
    [/kh[óo] th[ởo]/i, 'Định lượng bằng mMRC hoặc NYHA; đánh giá suy hô hấp qua nhịp thở, SpO2 và khí máu (PaO2 < 60 mmHg và/hoặc PaCO2 > 45 mmHg).'],
    [/ho ra m[áa]u/i, 'Phân mức: nhẹ < 50 mL/24 giờ, trung bình 50–200 mL, ho ra máu nặng (sét đánh) > 200 mL/lần hoặc > 600 mL/24 giờ — cấp cứu đường thở.'],
    [/đ[ôo]ng đ[ặa]c|ba gi[ảa]m/i, 'Đông đặc: rung thanh tăng, gõ đục, ran nổ. Ba giảm (tràn dịch): rung thanh giảm, gõ đục, rì rào phế nang giảm — xác định bằng X-quang / siêu âm màng phổi.'],
    [/đau ng[ựư]c/i, 'Phân tầng nguy cơ tim mạch trước tiên (HEART score) và loại trừ 4 bệnh cảnh chết người: hội chứng vành cấp, bóc tách động mạch chủ, thuyên tắc phổi, tràn khí màng phổi áp lực.'],
    [/t[ăa]ng huy[ếe]t [áa]p/i, 'Huyết áp ≥ 140/90 mmHg đo đúng cách ở 2 lần khám khác nhau (hoặc ≥ 135/85 khi đo tại nhà / Holter huyết áp ban ngày).'],
    [/h[ồo]i h[ộo]p|đ[áa]nh tr[ốo]ng ng[ựư]c/i, 'Phải bắt được rối loạn nhịp trong cơn: ECG 12 chuyển đạo lúc có triệu chứng hoặc Holter / máy ghi biến cố.'],
    [/^ph[ùu]/i, 'Phân biệt phù toàn thân (tim, gan, thận, dinh dưỡng) với phù khu trú (tĩnh mạch, bạch huyết, viêm); đánh giá albumin, đạm niệu, chức năng gan thận và NT-proBNP.'],
    [/^ng[ấa]t|tho[áa]ng ng[ấa]t/i, 'Mất ý thức thoáng qua, khởi phát nhanh, thời gian ngắn, tự hồi phục hoàn toàn do giảm tưới máu não. Bắt buộc có ECG để loại trừ ngất do tim.'],
    [/đau b[ụu]ng/i, 'Trước hết loại trừ bụng ngoại khoa cấp (đề kháng thành bụng, cảm ứng phúc mạc, mất nhu động) và các bệnh cảnh mạch máu; sau đó khu trú theo vùng đau.'],
    [/xu[ấa]t huy[ếe]t ti[êe]u h[óo]a/i, 'Xác định bằng nôn ra máu / tiêu phân đen / tiêu máu; phân tầng nguy cơ bằng Blatchford – Rockall và xác định vị trí bằng nội soi trong 24 giờ.'],
    [/v[àa]ng da/i, 'Vàng da lâm sàng khi Bilirubin toàn phần > 2,5 mg/dL. Phân biệt tăng bilirubin gián tiếp (tán huyết, Gilbert) với trực tiếp (tắc mật, tổn thương tế bào gan).'],
    [/c[ổo] tr[ướơ]{1,2}ng|b[áa]ng b[ụu]ng/i, 'Xác định bằng siêu âm bụng; chọc dò tính SAAG — SAAG ≥ 1,1 g/dL là do tăng áp cửa, < 1,1 g/dL do nguyên nhân phúc mạc (lao, ung thư).'],
    [/ti[êe]u ch[ảa]y/i, 'Đi tiêu ≥ 3 lần/ngày phân lỏng. Cấp < 14 ngày, kéo dài 14–29 ngày, mạn ≥ 30 ngày. Ưu tiên đánh giá mức độ mất nước trước khi tìm tác nhân.'],
    [/suy th[ậa]n|creatinin|egfr/i, 'Cấp (KDIGO): creatinin tăng ≥ 0,3 mg/dL trong 48 giờ hoặc ≥ 1,5 lần nền trong 7 ngày. Mạn: bất thường thận > 3 tháng hoặc eGFR < 60 mL/ph/1,73m².'],
    [/r[ốo]i lo[ạa]n đi[ệe]n gi[ảa]i/i, 'Đối chiếu ion đồ với áp lực thẩm thấu máu và nước tiểu, ion đồ niệu và thể tích tuần hoàn; Natri < 135 hoặc > 145, Kali < 3,5 hoặc > 5,0 mmol/L.'],
    [/tuy[ếe]n gi[áa]p|b[ướơ]{1,2}u gi[áa]p/i, 'Bắt đầu bằng TSH; TSH bất thường thì làm FT4 (và FT3 nếu nghi cường giáp). Bướu giáp có nhân cần siêu âm phân loại TIRADS và FNA khi có chỉ định.'],
    [/tri gi[áa]c|h[ôo]n m[êe]/i, 'Định lượng bằng thang Glasgow (E4V5M6). Hôn mê khi GCS ≤ 8. Bắt buộc loại trừ ngay hạ đường huyết, thiếu oxy, ngộ độc và tổn thương cấu trúc.'],
    [/y[ếe]u|li[ệe]t n[ửư]a ng[ườơ]{1,2}i/i, 'Xác định tổn thương neuron vận động trên (tăng trương lực, tăng phản xạ, Babinski dương) và định khu tổn thương; đánh giá nặng bằng NIHSS nếu nghi đột quỵ.'],
    [/đau đ[ầa]u/i, 'Phân biệt đau đầu nguyên phát (migraine, căng cơ, chuỗi) với thứ phát. Red flag SNOOP: triệu chứng toàn thân, dấu thần kinh, khởi phát đột ngột, tuổi > 50, thay đổi kiểu đau.'],
    [/co gi[ậa]t/i, 'Mô tả cơn (khu trú hay toàn thể, có mất ý thức không), thời gian và giai đoạn sau cơn. Trạng thái động kinh khi cơn > 5 phút hoặc nhiều cơn không hồi phục ý thức giữa các cơn.'],
    [/đau kh[ớo]p|s[ưu]ng kh[ớo]p/i, 'Phân biệt viêm (cứng khớp sáng > 30 phút, sưng nóng đỏ, đỡ khi vận động) với cơ học; đếm số khớp và tính đối xứng để định hướng nhóm bệnh.'],
    [/c[ộo]t s[ốo]ng th[ắa]t l[ưu]ng|đau l[ưu]ng/i, 'Đau lưng cơ học thường lành tính. Red flag cần hình ảnh: tuổi > 50 hoặc < 20, sụt cân, sốt, tiền căn ung thư, dùng corticoid, rối loạn cơ vòng, yếu chi tiến triển.'],
    [/b[ụu]ng ngo[ạa]i khoa|b[ụu]ng c[ấa]p/i, 'Đau bụng cấp kèm hội chứng nhiễm trùng nhiễm độc và ít nhất một trong: đề kháng thành bụng, cảm ứng phúc mạc, mất nhu động, liềm hơi trên X-quang.'],
    [/ch[ấa]n th[ươư]{1,2}ng s[ọo] n[ãa]o/i, 'Phân độ theo Glasgow: nhẹ 13–15, trung bình 9–12, nặng ≤ 8. Chỉ định CT sọ theo Canadian CT Head Rule / New Orleans.'],
    [/ch[ấa]n th[ươư]{1,2}ng b[ụu]ng/i, 'Huyết động không ổn định + FAST dương → mổ ngay. Huyết động ổn định → CT bụng chậu có cản quang để phân độ tổn thương tạng.'],
    [/b[íi] ti[ểe]u|b[ẹe]n b[ìi]u/i, 'Bí tiểu cấp: không tiểu được kèm cầu bàng quang căng đau, xác định bằng siêu âm thể tích tồn lưu > 300 mL. Khối bẹn bìu nghẹt là cấp cứu ngoại khoa.'],
    [/ra huy[ếe]t [âa]m đ[ạa]o/i, 'Ba tháng đầu: định lượng beta hCG + siêu âm đầu dò để phân biệt dọa sẩy, sẩy thai, thai ngoài tử cung, thai trứng. Ba tháng cuối: nghĩ nhau tiền đạo, nhau bong non — không khám âm đạo trước khi siêu âm.'],
    [/chuy[ểe]n d[ạa]/i, 'Chuyển dạ thật: cơn gò đều ≥ 3 cơn/10 phút, tăng dần cường độ, kèm xóa mở cổ tử cung tiến triển và thành lập đầu ối.'],
    [/s[ốo]t.*(tr[ẻe]|nhi)|tr[ẻe].*s[ốo]t/i, 'Sốt trẻ em: nhiệt độ hậu môn ≥ 38°C. Trẻ < 3 tháng sốt là chỉ định tầm soát nhiễm trùng nặng đầy đủ. Đánh giá dấu hiệu nguy hiểm toàn thân trước khi tìm ổ nhiễm.'],
    [/ti[êe]u ch[ảa]y.*(tr[ẻe]|nhi)|m[ấa]t n[ướơ]{1,2}c/i, 'Phân độ mất nước theo IMCI: nặng (li bì, mắt trũng, không uống được, véo da rất chậm), có mất nước (kích thích, khát, véo da chậm), không mất nước.'],
    [/co gi[ậa]t do s[ốo]t/i, 'Trẻ 6 tháng – 5 tuổi, co giật khi sốt, không nhiễm trùng thần kinh trung ương và không có tiền căn co giật không sốt. Đơn thuần: toàn thể, < 15 phút, không tái phát trong 24 giờ.'],
    [/v[àa]ng da s[ơo] sinh/i, 'Bệnh lý khi: vàng da trong 24 giờ đầu, bilirubin tăng > 5 mg/dL/ngày, kéo dài > 14 ngày (đủ tháng), hoặc bilirubin trực tiếp > 2 mg/dL. Đối chiếu biểu đồ Bhutani theo giờ tuổi.'],
    [/ng[ộo] đ[ộo]c/i, 'Xác định chất – liều – thời điểm; nhận diện hội chứng ngộ độc (toxidrome) qua sinh hiệu, đồng tử, da niêm, tri giác; tính khoảng trống anion và khoảng trống thẩm thấu khi cần.'],
    [/van tim|h[ẹe]p van|h[ởo] van/i, 'Xác định và phân độ bằng siêu âm tim Doppler (diện tích lỗ van, chênh áp, phân suất dòng phụt ngược); đối chiếu triệu chứng cơ năng để quyết định thời điểm can thiệp.'],
    [/t[ăa]ng [áa]p l[ựư]c n[ộo]i s[ọo]/i, 'Đau đầu + nôn vọt + phù gai thị, kèm hình ảnh chèn ép / đẩy lệch đường giữa trên CT–MRI. Tam chứng Cushing là dấu hiệu muộn, báo tụt kẹt não.']
);


/** Tìm bộ gợi ý khớp tên vấn đề; không khớp thì trả bộ rỗng */
export function suggestFor(ten) {
    const hit = LIBRARY.find(x => x.re.test(ten || ''));
    return { nn: [], red: [], cls: [], ...(hit || {}), hall: hallmarksFor(ten), tieuChuan: tieuChuanFor(ten) };
}

/** Tìm theo từ khóa gõ tay (dùng cho ô tìm trong thư viện) */
export function searchLibrary(q) {
    if (!String(q || '').trim()) return [];
    // Gõ không dấu ("kho tho") hay gõ tên một nguyên nhân đều ra đúng mẫu
    return searchList(LIBRARY, q, { key: (x) => x.k, alias: (x) => [...x.nn, ...(x.red || [])], limit: 6 });
}

/* =====================================================================
   Biến chứng cần bàn của từng vấn đề / bệnh — khối ④ trước đây hoàn toàn
   phải gõ tay, giờ bấm chip là có, kèm sẵn cách theo dõi.
   Mỗi mục: [mẫu tên, [ [biến chứng, lập luận / theo dõi], … ]]
   ===================================================================== */
export const BIEN_CHUNG = [
    [/vi[êe]m ph[ổo]i|đ[ôo]ng đ[ặa]c/i, [
        ['Suy hô hấp cấp', 'theo dõi SpO2, nhịp thở, khí máu động mạch khi SpO2 < 92%'],
        ['Nhiễm trùng huyết – sốc nhiễm trùng', 'theo dõi qSOFA, lactat, cấy máu trước kháng sinh'],
        ['Tràn dịch – tràn mủ màng phổi', 'siêu âm màng phổi, chọc dò khi dịch nhiều'],
        ['Áp xe phổi', 'X-quang / CT ngực kiểm tra khi sốt kéo dài > 72 giờ dùng kháng sinh']
    ]],
    [/suy tim|[ứu] huy[ếe]t|ph[ùu] ph[ổo]i/i, [
        ['Phù phổi cấp', 'theo dõi khó thở khi nằm, ran ẩm dâng cao, SpO2'],
        ['Sốc tim', 'theo dõi huyết áp, tưới máu ngoại biên, lactat'],
        ['Suy thận cấp trước thận (hội chứng tim – thận)', 'theo dõi creatinin, nước tiểu 24 giờ khi dùng lợi tiểu'],
        ['Rối loạn nhịp – rung nhĩ', 'ECG mỗi ngày, theo dõi ion đồ khi lợi tiểu'],
        ['Huyết khối thuyên tắc', 'cân nhắc kháng đông nếu rung nhĩ hoặc EF rất thấp']
    ]],
    [/v[àa]nh c[ấa]p|nh[ồo]i m[áa]u c[ơo] tim/i, [
        ['Rối loạn nhịp thất – rung thất', 'monitor liên tục 48 giờ đầu'],
        ['Sốc tim', 'theo dõi huyết áp, nước tiểu, siêu âm tim đánh giá EF'],
        ['Suy tim cấp sau nhồi máu', 'khám dấu ứ trệ, NT-proBNP, siêu âm tim'],
        ['Biến chứng cơ học (hở van hai lá cấp, thủng vách liên thất)', 'nghe tim mỗi ngày tìm âm thổi mới']
    ]],
    [/copd|hen|t[ắa]c ngh[ẽe]n/i, [
        ['Suy hô hấp tăng CO2', 'khí máu động mạch, theo dõi tri giác'],
        ['Tràn khí màng phổi', 'X-quang ngực khi đau ngực đột ngột, khó thở tăng'],
        ['Tâm phế mạn', 'siêu âm tim đánh giá áp lực động mạch phổi']
    ]],
    [/nhi[ễe]m tr[ùu]ng|s[ốo]t/i, [
        ['Nhiễm trùng huyết – sốc nhiễm trùng', 'qSOFA, lactat, cấy máu, theo dõi huyết áp'],
        ['Rối loạn nước – điện giải', 'ion đồ, bilan dịch vào ra'],
        ['Suy đa cơ quan', 'theo dõi creatinin, men gan, đông máu, tri giác']
    ]],
    [/x[ơo] gan|t[ăa]ng [áa]p (c[ửư]a|t[ĩi]nh m[ạa]ch)/i, [
        ['Xuất huyết tiêu hóa do vỡ giãn tĩnh mạch thực quản', 'nội soi tiêu hóa trên, theo dõi Hb'],
        ['Bệnh não gan', 'theo dõi tri giác, NH3 máu, tìm yếu tố thúc đẩy'],
        ['Viêm phúc mạc nhiễm khuẩn nguyên phát', 'chọc dịch báng đếm neutrophil > 250/mm³'],
        ['Hội chứng gan – thận', 'creatinin, natri niệu, ngưng lợi tiểu thử'],
        ['Ung thư biểu mô tế bào gan', 'AFP, siêu âm bụng mỗi 6 tháng']
    ]],
    [/xu[ấa]t huy[ếe]t ti[êe]u h[óo]a/i, [
        ['Sốc mất máu', 'mạch, huyết áp tư thế, Hb mỗi 6 giờ'],
        ['Chảy máu tái phát', 'nội soi kiểm tra, phân loại Forrest'],
        ['Bệnh não gan (trên nền xơ gan)', 'theo dõi tri giác sau xuất huyết']
    ]],
    [/đ[áa]i th[áa]o đ[ườơ]{1,2}ng/i, [
        ['Nhiễm toan ceton / tăng áp lực thẩm thấu', 'đường huyết mao mạch, ceton, khí máu'],
        ['Hạ đường huyết do điều trị', 'đo đường huyết trước ăn và lúc 3 giờ sáng'],
        ['Biến chứng mạch máu nhỏ (võng mạc, thận, thần kinh)', 'soi đáy mắt, đạm niệu vi lượng, khám bàn chân'],
        ['Nhiễm trùng bàn chân', 'khám bàn chân mỗi ngày, cấy mủ nếu có loét']
    ]],
    [/t[ăa]ng huy[ếe]t [áa]p/i, [
        ['Cơn tăng huyết áp cấp cứu', 'theo dõi huyết áp, dấu tổn thương cơ quan đích'],
        ['Phì đại thất trái – suy tim', 'ECG, siêu âm tim'],
        ['Bệnh thận do tăng huyết áp', 'creatinin, đạm niệu'],
        ['Đột quỵ', 'khám thần kinh mỗi ngày']
    ]],
    [/đ[ộo]t qu[ỵy]|nh[ồo]i m[áa]u n[ãa]o|xu[ấa]t huy[ếe]t n[ãa]o/i, [
        ['Phù não – tăng áp lực nội sọ', 'theo dõi tri giác, đồng tử, CT kiểm tra'],
        ['Viêm phổi hít', 'test nuốt trước khi cho ăn đường miệng'],
        ['Huyết khối tĩnh mạch sâu', 'vận động sớm, tất áp lực'],
        ['Loét tì đè', 'xoay trở mỗi 2 giờ']
    ]],
    [/suy th[ậa]n|th[ậa]n m[ạa]n|t[ổo]n th[ươư]{1,2}ng th[ậa]n/i, [
        ['Tăng kali máu', 'ion đồ, ECG tìm sóng T cao nhọn'],
        ['Toan chuyển hóa', 'khí máu động mạch, HCO3⁻'],
        ['Quá tải dịch – phù phổi', 'cân mỗi ngày, bilan dịch'],
        ['Thiếu máu do bệnh thận mạn', 'Hb, ferritin, cân nhắc EPO']
    ]],
    [/thi[ếe]u m[áa]u/i, [
        ['Thiếu máu cơ tim do thiếu máu nặng', 'ECG, troponin nếu đau ngực'],
        ['Suy tim cung lượng cao', 'khám dấu ứ trệ khi Hb rất thấp']
    ]],
    [/vi[êe]m t[ụu]y c[ấa]p/i, [
        ['Hoại tử tụy nhiễm trùng', 'CT bụng cản quang sau 72 giờ nếu nặng lên'],
        ['Suy hô hấp – ARDS', 'SpO2, khí máu, X-quang ngực'],
        ['Nang giả tụy', 'siêu âm bụng theo dõi'],
        ['Hạ canxi máu', 'ion đồ, canxi máu']
    ]],
    [/vi[êe]m ru[ộo]t th[ừu]a|vi[êe]m ph[úu]c m[ạa]c|th[ủu]ng t[ạa]ng/i, [
        ['Viêm phúc mạc toàn thể', 'khám bụng mỗi 6 giờ, bạch cầu, CRP'],
        ['Áp xe tồn lưu sau mổ', 'siêu âm bụng khi còn sốt sau mổ'],
        ['Nhiễm trùng vết mổ', 'thay băng, quan sát vết mổ mỗi ngày'],
        ['Tắc ruột do dính', 'theo dõi trung tiện, bụng chướng']
    ]],
    [/s[ốo]t xu[ấa]t huy[ếe]t|dengue/i, [
        ['Sốc sốt xuất huyết Dengue', 'theo dõi mạch, huyết áp, Hct mỗi 4–6 giờ ngày 4–6'],
        ['Xuất huyết nặng', 'theo dõi tiểu cầu, dấu xuất huyết niêm mạc'],
        ['Tổn thương gan – suy gan cấp', 'AST, ALT, đông máu']
    ]],
    [/ti[ềe]n s[ảa]n gi[ậa]t/i, [
        ['Sản giật', 'theo dõi phản xạ gân xương, magie sulfat dự phòng'],
        ['Hội chứng HELLP', 'tiểu cầu, men gan, LDH'],
        ['Nhau bong non', 'theo dõi tim thai, cơn gò, ra huyết âm đạo']
    ]],
    [/s[ốo]c/i, [
        ['Suy đa cơ quan', 'lactat, creatinin, men gan, đông máu'],
        ['Tổn thương thận cấp', 'nước tiểu theo giờ'],
        ['Rối loạn đông máu nội mạch lan tỏa', 'PT, aPTT, fibrinogen, D-dimer']
    ]]
];

/** Biến chứng gợi ý cho một tên vấn đề / bệnh */
export function bienChungFor(ten) {
    const hit = BIEN_CHUNG.find(([re]) => re.test(ten || ''));
    return hit ? hit[1] : [];
}

/* =====================================================================
   Yếu tố nguy cơ / thúc đẩy kinh điển của từng bệnh cảnh — chip bấm là xong,
   khỏi nghĩ xem "còn thiếu yếu tố nào".
   ===================================================================== */
export const YEU_TO = [
    [/suy tim|v[àa]nh c[ấa]p|nh[ồo]i m[áa]u c[ơo] tim|t[ăa]ng huy[ếe]t [áa]p/i,
        ['tăng huyết áp nhiều năm', 'đái tháo đường type 2', 'rối loạn lipid máu', 'hút thuốc lá',
            'tiền căn gia đình bệnh mạch vành sớm', 'bỏ thuốc điều trị', 'ăn mặn', 'béo phì']],
    [/vi[êe]m ph[ổo]i|nhi[ễe]m tr[ùu]ng h[ôo] h[ấa]p/i,
        ['lớn tuổi', 'hút thuốc lá', 'COPD nền', 'đái tháo đường', 'nằm lâu – hạn chế vận động',
            'sặc – rối loạn nuốt', 'suy giảm miễn dịch']],
    [/copd|hen|t[ắa]c ngh[ẽe]n/i,
        ['hút thuốc lá nhiều năm', 'tiếp xúc khói bụi nghề nghiệp', 'nhiễm siêu vi hô hấp',
            'ngưng thuốc hít', 'dùng bình xịt sai kỹ thuật', 'thời tiết lạnh']],
    [/x[ơo] gan|gan m[ậa]t|vi[êe]m gan/i,
        ['uống rượu bia nhiều năm', 'viêm gan B mạn', 'viêm gan C mạn', 'gan nhiễm mỡ',
            'dùng thuốc nam không rõ nguồn gốc']],
    [/xu[ấa]t huy[ếe]t ti[êe]u h[óo]a|lo[ée]t d[ạa] d[àa]y/i,
        ['dùng NSAID kéo dài', 'dùng corticoid', 'nhiễm H. pylori', 'uống rượu bia',
            'dùng thuốc kháng đông – kháng kết tập', 'stress nặng']],
    [/đ[áa]i th[áa]o đ[ườơ]{1,2}ng/i,
        ['thừa cân – béo phì', 'ít vận động', 'tiền căn gia đình đái tháo đường', 'ăn nhiều tinh bột – đường',
            'tự ý ngưng thuốc', 'nhiễm trùng đi kèm']],
    [/th[ậa]n|ni[ệe]u/i,
        ['đái tháo đường', 'tăng huyết áp', 'dùng thuốc độc thận (NSAID, aminoglycoside)',
            'sỏi niệu tái phát', 'mất nước – giảm thể tích']],
    [/nhi[ễe]m tr[ùu]ng|s[ốo]t/i,
        ['đái tháo đường', 'suy giảm miễn dịch – dùng corticoid', 'lớn tuổi', 'nằm viện dài ngày',
            'có catheter – sonde tiểu', 'vết thương hở']],
    [/đ[ộo]t qu[ỵy]|th[ầa]n kinh/i,
        ['tăng huyết áp', 'rung nhĩ', 'đái tháo đường', 'rối loạn lipid máu', 'hút thuốc lá',
            'tiền căn đột quỵ cũ', 'ngưng thuốc kháng đông']],
    [/thuy[êe]n t[ắa]c|huy[ếe]t kh[ốo]i/i,
        ['bất động kéo dài', 'sau phẫu thuật lớn', 'ung thư đang điều trị', 'dùng thuốc ngừa thai',
            'thai kỳ – hậu sản', 'tiền căn huyết khối']],
    [/thi[ếe]u m[áa]u/i,
        ['rong kinh kéo dài', 'chế độ ăn thiếu sắt', 'xuất huyết tiêu hóa mạn', 'bệnh thận mạn',
            'nhiễm giun móc']]
];

/** Yếu tố nguy cơ gợi ý cho một tên vấn đề / bệnh */
export function yeuToFor(ten) {
    const hit = YEU_TO.find(([re]) => re.test(ten || ''));
    return hit ? hit[1] : [];
}

/* Mẫu câu cho ô "vì…" — dùng khi bệnh án chưa có sẵn dấu chứng để bấm */
export const LY_DO_MAU = [
    'phù hợp bệnh cảnh lâm sàng', 'có đủ tiêu chuẩn chẩn đoán', 'yếu tố nguy cơ rõ',
    'diễn tiến phù hợp', 'đáp ứng điều trị thử', 'thiếu dấu chứng đặc hiệu',
    'không có yếu tố nguy cơ', 'đã loại trừ bằng cận lâm sàng', 'cần cận lâm sàng mới kết luận được',
    'hiếm gặp ở lứa tuổi này'
];


/* =====================================================================
   Đợt bổ sung: phủ nốt các hội chứng có trong danh mục VAN_DE_NHOM mà thư
   viện chưa có mẫu — trước đây chọn xong là không gợi ý được nguyên nhân nào.
   Đặt cuối nên không đè lên các mẫu hẹp hơn ở trên (find lấy mẫu đầu tiên).
   ===================================================================== */
LIBRARY.push(
    /* ---------------- Toàn thân ---------------- */
    {
        k: 'Hội chứng đáp ứng viêm toàn thân (SIRS)', re: /\bsirs\b|đ[áa]p [ứu]ng vi[êe]m to[àa]n th[âa]n/i,
        nn: ['Nhiễm trùng khu trú', 'Viêm tụy cấp', 'Chấn thương lớn – sau mổ', 'Bỏng nặng', 'Thuyên tắc phổi', 'Bệnh tự miễn đang hoạt động'],
        red: ['Nhiễm trùng huyết – sốc nhiễm trùng'],
        cls: ['Công thức máu', 'CRP – procalcitonin', 'Lactat máu', 'Cấy máu 2 mẫu', 'Khí máu động mạch']
    },
    {
        k: 'Suy kiệt – suy dinh dưỡng', re: /suy ki[ệe]t|suy dinh d[ưu]{1,2}[ỡo]ng/i,
        nn: ['Bệnh ác tính', 'Lao', 'Hội chứng kém hấp thu', 'Bệnh mạn giai đoạn cuối (suy tim, COPD)', 'Trầm cảm – chán ăn', 'Nghiện rượu', 'Cường giáp'],
        red: ['Ác tính tiến triển', 'Hội chứng nuôi ăn lại (refeeding)'],
        cls: ['Albumin – prealbumin', 'Công thức máu', 'Đường huyết – HbA1c', 'TSH – FT4', 'X-quang ngực', 'Nội soi tiêu hóa']
    },
    {
        k: 'Thừa cân – béo phì', re: /th[ừu]a c[âa]n|b[ée]o ph[ìi]/i,
        nn: ['Mất cân bằng năng lượng – ít vận động', 'Hội chứng chuyển hóa', 'Suy giáp', 'Hội chứng Cushing', 'Do thuốc (corticoid, chống loạn thần)', 'Yếu tố di truyền'],
        red: ['Ngưng thở khi ngủ nặng', 'Bệnh mạch vành'],
        cls: ['BMI – vòng eo', 'Đường huyết – HbA1c', 'Bộ mỡ máu', 'TSH – FT4', 'Men gan – siêu âm bụng']
    },
    {
        k: 'Mệt mỏi kéo dài', re: /m[ệe]t m[ỏo]i k[ée]o d[àa]i|su[ỵy] nh[ượơ]{1,2}c/i,
        nn: ['Thiếu máu', 'Suy giáp', 'Đái tháo đường', 'Trầm cảm – rối loạn giấc ngủ', 'Nhiễm trùng mạn (lao, HIV)', 'Bệnh ác tính', 'Suy thượng thận', 'Do thuốc'],
        red: ['Bệnh ác tính', 'Suy thượng thận cấp'],
        cls: ['Công thức máu', 'TSH – FT4', 'Đường huyết – HbA1c', 'Chức năng gan thận', 'Ion đồ', 'X-quang ngực']
    },
    {
        k: 'Hội chứng lão suy', re: /l[ãa]o suy|frailty/i,
        nn: ['Đa bệnh nền', 'Suy dinh dưỡng – thiểu cơ', 'Đa thuốc', 'Sa sút trí tuệ', 'Trầm cảm', 'Giảm vận động kéo dài'],
        red: ['Té ngã – gãy cổ xương đùi', 'Mê sảng cấp'],
        cls: ['Đánh giá lão khoa toàn diện', 'Albumin', 'Công thức máu', 'Vitamin D – canxi', 'Trắc nghiệm MMSE']
    },

    /* ---------------- Hô hấp ---------------- */
    {
        k: 'Hội chứng tràn khí màng phổi', re: /tr[àa]n kh[íi] m[àa]ng ph[ổo]i|\btkmp\b|pneumothorax/i,
        nn: ['Tràn khí nguyên phát tự phát', 'Tràn khí thứ phát (COPD, lao, kén khí)', 'Do chấn thương ngực', 'Do thủ thuật (chọc dò, đặt catheter)', 'Vỡ bóng khí phổi'],
        red: ['Tràn khí màng phổi áp lực'],
        cls: ['X-quang ngực thẳng đứng', 'CT ngực', 'Siêu âm màng phổi', 'Khí máu động mạch']
    },
    {
        k: 'Hội chứng tắc nghẽn đường thở', re: /t[ắa]c ngh[ẽe]n đ[ườơ]{1,2}ng th[ởo]/i,
        nn: ['COPD', 'Hen phế quản', 'Giãn phế quản', 'Dị vật đường thở', 'U chèn ép khí – phế quản', 'Viêm tiểu phế quản'],
        red: ['Dị vật đường thở', 'Cơn hen nguy kịch'],
        cls: ['Hô hấp ký có test giãn phế quản', 'X-quang ngực', 'CT ngực', 'Khí máu động mạch', 'Nội soi phế quản']
    },
    {
        k: 'Suy hô hấp cấp', re: /suy h[ôo] h[ấa]p c[ấa]p/i,
        nn: ['Viêm phổi', 'Phù phổi cấp do tim', 'Đợt cấp COPD', 'Cơn hen nặng', 'Thuyên tắc phổi', 'ARDS', 'Tràn khí – tràn dịch màng phổi', 'Nguyên nhân thần kinh cơ'],
        red: ['ARDS', 'Thuyên tắc phổi lớn', 'Tràn khí màng phổi áp lực'],
        cls: ['Khí máu động mạch', 'X-quang ngực', 'ECG', 'D-dimer', 'Siêu âm tim', 'CT ngực']
    },
    {
        k: 'Suy hô hấp mạn', re: /suy h[ôo] h[ấa]p m[ạa]n/i,
        nn: ['COPD giai đoạn nặng', 'Bệnh phổi mô kẽ', 'Giãn phế quản', 'Gù vẹo cột sống – béo phì giảm thông khí', 'Bệnh thần kinh cơ', 'Tăng áp động mạch phổi'],
        red: ['Đợt cấp mất bù', 'Tâm phế mạn'],
        cls: ['Khí máu động mạch', 'Hô hấp ký', 'CT ngực độ phân giải cao', 'Siêu âm tim', 'Đo SpO2 qua đêm']
    },
    {
        k: 'Ho kéo dài', re: /ho k[ée]o d[àa]i|ho m[ạa]n/i,
        nn: ['Chảy dịch mũi sau', 'Hen – ho biến thể hen', 'Trào ngược dạ dày – thực quản', 'Do thuốc ức chế men chuyển', 'Lao phổi', 'Giãn phế quản', 'Ung thư phổi', 'Hút thuốc lá'],
        red: ['Lao phổi', 'Ung thư phổi'],
        cls: ['X-quang ngực', 'Hô hấp ký', 'AFB đàm – GeneXpert', 'CT ngực', 'Nội soi tai mũi họng']
    },
    {
        k: 'Hội chứng xẹp phổi', re: /x[ẹe]p ph[ổo]i|atelectasis/i,
        nn: ['Nút đàm bít phế quản', 'U nội phế quản', 'Dị vật', 'Chèn ép từ ngoài (tràn dịch, hạch)', 'Giảm thông khí sau mổ'],
        red: ['Ung thư phế quản'],
        cls: ['X-quang ngực', 'CT ngực', 'Nội soi phế quản']
    },
    {
        k: 'Hội chứng trung thất', re: /trung th[ấa]t/i,
        nn: ['U lympho', 'U tuyến ức', 'Ung thư phổi di căn hạch', 'Lao hạch trung thất', 'Bướu giáp thòng', 'U tế bào mầm'],
        red: ['Hội chứng tĩnh mạch chủ trên', 'Chèn ép khí quản'],
        cls: ['X-quang ngực', 'CT ngực có cản quang', 'Sinh thiết hạch – u', 'LDH – beta hCG – AFP']
    },
    {
        k: 'Ngưng thở khi ngủ', re: /ng[ưu]ng th[ởo] khi ng[ủu]|\bosa\b/i,
        nn: ['Ngưng thở tắc nghẽn do béo phì', 'Bất thường giải phẫu hầu họng', 'Ngưng thở trung ương', 'Suy tim', 'Suy giáp'],
        red: ['Tăng áp động mạch phổi', 'Rối loạn nhịp về đêm'],
        cls: ['Đa ký giấc ngủ', 'BMI – vòng cổ', 'TSH – FT4', 'Siêu âm tim', 'Khí máu động mạch']
    },

    /* ---------------- Tim mạch ---------------- */
    {
        k: 'Hội chứng suy tim ứ huyết', re: /suy tim|[ứu] huy[ếe]t|m[ấa]t b[ùu] tim/i,
        nn: ['Bệnh mạch vành – nhồi máu cơ tim cũ', 'Tăng huyết áp lâu ngày', 'Bệnh van tim', 'Bệnh cơ tim giãn', 'Rối loạn nhịp (rung nhĩ nhanh)', 'Bệnh cơ tim do rượu', 'Cường giáp', 'Thiếu máu nặng'],
        red: ['Phù phổi cấp', 'Sốc tim', 'Hội chứng vành cấp'],
        cls: ['NT-proBNP', 'Siêu âm tim (EF)', 'ECG', 'X-quang ngực', 'Ion đồ – chức năng thận', 'Troponin hs']
    },
    {
        k: 'Cơn đau thắt ngực ổn định', re: /đau th[ắa]t ng[ựư]c [ổo]n đ[ịi]nh|đau th[ắa]t ng[ựư]c/i,
        nn: ['Hẹp mạch vành ổn định', 'Co thắt mạch vành', 'Hẹp van động mạch chủ', 'Bệnh cơ tim phì đại', 'Thiếu máu', 'Cường giáp'],
        red: ['Hội chứng vành cấp'],
        cls: ['ECG gắng sức', 'Siêu âm tim', 'CT mạch vành – chụp mạch vành', 'Bộ mỡ – đường huyết']
    },
    {
        k: 'Hội chứng vành cấp', re: /v[àa]nh c[ấa]p|\bacs\b/i,
        nn: ['Nhồi máu cơ tim ST chênh lên', 'Nhồi máu cơ tim không ST chênh lên', 'Đau thắt ngực không ổn định', 'Co thắt mạch vành (Prinzmetal)', 'Bóc tách mạch vành tự phát', 'MINOCA'],
        red: ['Sốc tim', 'Rối loạn nhịp thất', 'Bóc tách động mạch chủ'],
        cls: ['ECG 12 chuyển đạo khẩn', 'Troponin hs theo thời điểm', 'Siêu âm tim', 'Chụp mạch vành', 'Bộ mỡ – HbA1c']
    },
    {
        k: 'Hội chứng tĩnh mạch chủ trên', re: /t[ĩi]nh m[ạa]ch ch[ủu] tr[êe]n/i,
        nn: ['Ung thư phổi', 'U lympho', 'Huyết khối do catheter tĩnh mạch trung tâm', 'Xơ hóa trung thất', 'Bướu giáp thòng'],
        red: ['Phù não – phù thanh quản'],
        cls: ['CT ngực có cản quang', 'X-quang ngực', 'Sinh thiết u', 'Siêu âm Doppler mạch máu']
    },
    {
        k: 'Bệnh động mạch chi dưới', re: /đ[ộo]ng m[ạa]ch chi d[ướơ]{1,2}i|đau c[áa]ch h[ồo]i/i,
        nn: ['Xơ vữa động mạch', 'Đái tháo đường', 'Viêm tắc mạch máu (Buerger)', 'Thuyên tắc từ huyết khối tim', 'Hẹp eo động mạch chủ'],
        red: ['Thiếu máu chi cấp tính'],
        cls: ['Chỉ số ABI', 'Siêu âm Doppler động mạch chi', 'CT / MR mạch máu', 'Bộ mỡ – HbA1c']
    },
    {
        k: 'Huyết khối tĩnh mạch sâu', re: /huy[ếe]t kh[ốo]i t[ĩi]nh m[ạa]ch s[âa]u|\bdvt\b/i,
        nn: ['Bất động – sau phẫu thuật', 'Ung thư đang tiến triển', 'Thai kỳ – thuốc ngừa thai', 'Bệnh lý tăng đông', 'Chấn thương chi', 'Nhiễm trùng nặng'],
        red: ['Thuyên tắc phổi'],
        cls: ['Siêu âm Doppler tĩnh mạch chi', 'D-dimer', 'Bilan tăng đông', 'CT động mạch phổi']
    },

    /* ---------------- Tiêu hóa – gan mật ---------------- */
    {
        k: 'Hội chứng suy tế bào gan', re: /suy t[ếe] b[àa]o gan/i,
        nn: ['Xơ gan do rượu', 'Viêm gan B mạn', 'Viêm gan C mạn', 'Gan nhiễm mỡ không do rượu', 'Viêm gan do thuốc', 'Viêm gan tự miễn', 'Bệnh Wilson – ứ sắt'],
        red: ['Suy gan cấp', 'Bệnh não gan'],
        cls: ['AST – ALT – Bilirubin', 'Albumin – PT/INR', 'Siêu âm bụng', 'HBsAg – anti-HCV', 'AFP']
    },
    {
        k: 'Hội chứng tăng áp tĩnh mạch cửa', re: /t[ăa]ng [áa]p (t[ĩi]nh m[ạa]ch )?c[ửư]a/i,
        nn: ['Xơ gan', 'Huyết khối tĩnh mạch cửa', 'Hội chứng Budd–Chiari', 'Sán máng', 'Xơ hóa gan bẩm sinh'],
        red: ['Vỡ giãn tĩnh mạch thực quản'],
        cls: ['Siêu âm Doppler hệ cửa', 'Nội soi tiêu hóa trên', 'Công thức máu – tiểu cầu', 'Albumin – PT']
    },
    {
        k: 'Hội chứng lỵ', re: /h[ộo]i ch[ứu]ng l[ỵy]|\bl[ỵy]\b/i,
        nn: ['Lỵ trực trùng (Shigella)', 'Lỵ amip', 'Campylobacter – Salmonella', 'Viêm đại tràng do C. difficile', 'Bệnh viêm ruột mạn (IBD)', 'Ung thư đại trực tràng'],
        red: ['Nhiễm trùng huyết', 'Phình đại tràng nhiễm độc'],
        cls: ['Soi phân – cấy phân', 'Công thức máu – CRP', 'Nội soi đại tràng', 'Ion đồ']
    },
    {
        k: 'Táo bón kéo dài', re: /t[áa]o b[óo]n/i,
        nn: ['Táo bón chức năng', 'Chế độ ăn ít chất xơ – ít vận động', 'Do thuốc (opioid, kháng cholinergic)', 'Suy giáp', 'Bệnh thần kinh tự chủ do đái tháo đường', 'Ung thư đại trực tràng', 'Tắc nghẽn cơ học'],
        red: ['Ung thư đại trực tràng', 'Tắc ruột'],
        cls: ['Nội soi đại tràng', 'TSH', 'Ion đồ – canxi máu', 'X-quang bụng không sửa soạn']
    },
    {
        k: 'Hội chứng kém hấp thu', re: /k[ée]m h[ấa]p thu/i,
        nn: ['Bệnh celiac', 'Suy tụy ngoại tiết', 'Nhiễm giun sán', 'Loạn khuẩn ruột non', 'Bệnh Crohn', 'Sau cắt đoạn ruột'],
        red: ['Suy dinh dưỡng nặng'],
        cls: ['Mỡ phân', 'Albumin – vitamin tan trong mỡ', 'Nội soi sinh thiết ruột non', 'Elastase phân', 'Kháng thể celiac']
    },
    {
        k: 'Hội chứng não gan', re: /n[ãa]o gan/i,
        nn: ['Xơ gan mất bù', 'Xuất huyết tiêu hóa', 'Nhiễm trùng (viêm phúc mạc nguyên phát)', 'Táo bón', 'Rối loạn điện giải', 'Dùng thuốc an thần'],
        red: ['Hôn mê gan', 'Phù não'],
        cls: ['NH3 máu', 'Ion đồ', 'Công thức máu – CRP', 'Chọc dịch báng', 'CT sọ não']
    },
    {
        k: 'Khối u vùng bụng', re: /kh[ốo]i u v[ùu]ng b[ụu]ng|u [ổo] b[ụu]ng/i,
        nn: ['U gan', 'U đại tràng', 'U dạ dày', 'U buồng trứng', 'U thận', 'Lách to', 'Phình động mạch chủ bụng', 'Áp xe trong ổ bụng'],
        red: ['Phình bóc tách động mạch chủ bụng', 'Bệnh lý ác tính'],
        cls: ['Siêu âm bụng', 'CT bụng có cản quang', 'Nội soi tiêu hóa', 'Dấu ấn ung thư (CEA, CA 19-9, AFP)']
    },

    /* ---------------- Thận – tiết niệu ---------------- */
    {
        k: 'Hội chứng viêm cầu thận cấp', re: /vi[êe]m c[ầa]u th[ậa]n/i,
        nn: ['Viêm cầu thận hậu nhiễm liên cầu', 'Bệnh thận IgA', 'Lupus ban đỏ hệ thống', 'Viêm mạch ANCA', 'Bệnh kháng màng đáy (Goodpasture)', 'Viêm cầu thận màng tăng sinh'],
        red: ['Viêm cầu thận tiến triển nhanh', 'Phù phổi cấp – tăng huyết áp ác tính'],
        cls: ['Tổng phân tích nước tiểu – cặn lắng', 'Đạm niệu 24 giờ', 'Bổ thể C3 – C4', 'ANA – ANCA – anti-GBM', 'ASO', 'Sinh thiết thận']
    },
    {
        k: 'Tổn thương thận cấp', re: /t[ổo]n th[ươư]{1,2}ng th[ậa]n c[ấa]p|suy th[ậa]n c[ấa]p/i,
        nn: ['Trước thận (giảm thể tích, suy tim)', 'Hoại tử ống thận cấp', 'Viêm thận mô kẽ do thuốc', 'Viêm cầu thận', 'Sau thận – tắc nghẽn đường niệu', 'Hội chứng gan – thận'],
        red: ['Tăng kali máu', 'Phù phổi cấp', 'Toan chuyển hóa nặng'],
        cls: ['Creatinin – ure', 'Ion đồ', 'Khí máu động mạch', 'Tổng phân tích nước tiểu', 'Siêu âm hệ niệu', 'Natri niệu – FeNa']
    },
    {
        k: 'Bệnh thận mạn', re: /b[ệe]nh th[ậa]n m[ạa]n/i,
        nn: ['Đái tháo đường', 'Tăng huyết áp', 'Viêm cầu thận mạn', 'Thận đa nang', 'Bệnh thận tắc nghẽn', 'Do thuốc độc thận'],
        red: ['Hội chứng ure huyết cao', 'Tăng kali máu'],
        cls: ['eGFR – creatinin', 'Đạm niệu / creatinin niệu', 'Siêu âm thận', 'Công thức máu – ferritin', 'PTH – canxi – phospho']
    },
    {
        k: 'Hội chứng ure huyết cao', re: /ure huy[ếe]t cao|h[ộo]i ch[ứu]ng ure/i,
        nn: ['Bệnh thận mạn giai đoạn cuối', 'Tổn thương thận cấp', 'Xuất huyết tiêu hóa', 'Tăng dị hóa đạm'],
        red: ['Viêm màng ngoài tim do ure', 'Bệnh não do ure'],
        cls: ['Ure – creatinin', 'Ion đồ – khí máu', 'ECG', 'Siêu âm tim', 'Công thức máu']
    },
    {
        k: 'Cơn đau quặn thận', re: /đau qu[ặa]n th[ậa]n/i,
        nn: ['Sỏi niệu quản', 'Cục máu đông đường niệu', 'Hẹp khúc nối bể thận – niệu quản', 'Chèn ép niệu quản từ ngoài'],
        red: ['Nhiễm trùng đường tiểu có tắc nghẽn', 'Vô niệu do tắc thận độc nhất'],
        cls: ['Siêu âm hệ niệu', 'CT bụng không cản quang', 'Tổng phân tích nước tiểu', 'Creatinin']
    },
    {
        k: 'Tiểu máu', re: /ti[ểe]u m[áa]u/i,
        nn: ['Sỏi niệu', 'Nhiễm trùng đường tiểu', 'Viêm cầu thận', 'Ung thư đường niệu', 'Phì đại tuyến tiền liệt', 'Do thuốc kháng đông', 'Lao niệu'],
        red: ['Ung thư đường niệu'],
        cls: ['Tổng phân tích nước tiểu – cặn lắng', 'Siêu âm hệ niệu', 'CT hệ niệu', 'Tế bào học nước tiểu', 'Nội soi bàng quang']
    },
    {
        k: 'Rối loạn toan – kiềm', re: /toan|ki[ềe]m chuy[ểe]n h[óo]a/i,
        nn: ['Toan ceton đái tháo đường', 'Toan lactic', 'Toan do suy thận', 'Mất bicarbonate qua tiêu hóa', 'Ngộ độc (methanol, salicylate)', 'Kiềm chuyển hóa do nôn – lợi tiểu'],
        red: ['Toan lactic nặng', 'Ngộ độc rượu độc'],
        cls: ['Khí máu động mạch', 'Ion đồ – khoảng trống anion', 'Lactat máu', 'Ceton máu', 'Áp lực thẩm thấu máu']
    },

    /* ---------------- Thần kinh ---------------- */
    {
        k: 'Hội chứng màng não', re: /h[ộo]i ch[ứu]ng m[àa]ng n[ãa]o|d[ấa]u m[àa]ng n[ãa]o/i,
        nn: ['Viêm màng não mủ', 'Viêm màng não lao', 'Viêm màng não siêu vi', 'Viêm màng não do nấm Cryptococcus', 'Xuất huyết dưới nhện', 'Di căn màng não'],
        red: ['Viêm màng não mủ', 'Xuất huyết dưới nhện'],
        cls: ['Chọc dò dịch não tủy', 'CT sọ não trước chọc dò', 'Công thức máu – CRP', 'Cấy máu', 'Kháng nguyên nấm']
    },
    {
        k: 'Hội chứng tiểu não', re: /ti[ểe]u n[ãa]o/i,
        nn: ['Đột quỵ tiểu não', 'U tiểu não', 'Thoái hóa tiểu não do rượu', 'Xơ cứng rải rác', 'Ngộ độc thuốc (phenytoin)', 'Thất điều di truyền'],
        red: ['Nhồi máu – xuất huyết tiểu não gây chèn ép'],
        cls: ['MRI sọ não', 'CT sọ não', 'Vitamin B1 – B12', 'Định lượng thuốc trong máu']
    },
    {
        k: 'Hội chứng ngoại tháp', re: /ngo[ạa]i th[áa]p|parkinson/i,
        nn: ['Bệnh Parkinson', 'Hội chứng Parkinson do thuốc chống loạn thần', 'Teo đa hệ thống', 'Liệt trên nhân tiến triển', 'Bệnh Wilson', 'Di chứng sau viêm não'],
        red: ['Hội chứng ác tính do thuốc an thần kinh'],
        cls: ['MRI sọ não', 'Đồng huyết thanh – ceruloplasmin', 'Rà soát thuốc đang dùng', 'DAT-scan']
    },
    {
        k: 'Hội chứng chèn ép tủy', re: /ch[èe]n [ée]p t[ủu]y/i,
        nn: ['Di căn cột sống', 'U tủy nguyên phát', 'Áp xe ngoài màng cứng', 'Thoát vị đĩa đệm lớn', 'Lao cột sống (bệnh Pott)', 'Chấn thương cột sống'],
        red: ['Chèn ép tủy cấp', 'Hội chứng chùm đuôi ngựa'],
        cls: ['MRI cột sống khẩn', 'X-quang cột sống', 'Công thức máu – CRP', 'Sinh thiết tổn thương']
    },
    {
        k: 'Bệnh lý đa dây thần kinh', re: /đa d[âa]y th[ầa]n kinh|polyneuropathy/i,
        nn: ['Đái tháo đường', 'Thiếu vitamin B12', 'Nghiện rượu', 'Do thuốc (isoniazid, hóa trị)', 'Suy thận mạn', 'Hội chứng Guillain–Barré', 'Bệnh lý đơn dòng'],
        red: ['Hội chứng Guillain–Barré'],
        cls: ['Điện cơ – đo dẫn truyền thần kinh', 'HbA1c', 'Vitamin B12', 'Chức năng gan thận', 'Điện di đạm máu']
    },
    {
        k: 'Chóng mặt – rối loạn tiền đình', re: /ch[óo]ng m[ặa]t|ti[ềe]n đ[ìi]nh/i,
        nn: ['Chóng mặt tư thế kịch phát lành tính', 'Viêm thần kinh tiền đình', 'Bệnh Ménière', 'Đột quỵ hố sau', 'Hạ huyết áp tư thế', 'Do thuốc'],
        red: ['Đột quỵ hố sau'],
        cls: ['Nghiệm pháp Dix–Hallpike', 'Khám HINTS', 'MRI sọ não', 'Huyết áp tư thế', 'Thính lực đồ']
    },

    /* ---------------- Nhiễm ---------------- */
    {
        k: 'Lao phổi', re: /lao ph[ổo]i/i,
        nn: ['Lao phổi mới', 'Lao tái phát', 'Lao kháng thuốc', 'Lao trên nền nhiễm HIV'],
        red: ['Ho ra máu sét đánh', 'Lao kê'],
        cls: ['AFB đàm – GeneXpert', 'X-quang ngực', 'CT ngực', 'Xét nghiệm HIV', 'Cấy đàm – kháng sinh đồ']
    },
    {
        k: 'Lao ngoài phổi', re: /lao ngo[àa]i ph[ổo]i|lao h[ạa]ch|lao m[àa]ng|lao c[ộo]t s[ốo]ng/i,
        nn: ['Lao hạch', 'Lao màng phổi', 'Lao màng bụng', 'Lao màng não', 'Lao cột sống', 'Lao niệu – sinh dục'],
        red: ['Lao màng não', 'Lao kê'],
        cls: ['Sinh thiết – GeneXpert bệnh phẩm', 'ADA dịch màng', 'X-quang – CT', 'Xét nghiệm HIV']
    },
    {
        k: 'Nhiễm HIV/AIDS', re: /\bhiv\b|\baids\b/i,
        nn: ['Nhiễm HIV cấp', 'Nhiễm HIV mạn chưa điều trị', 'Thất bại điều trị ARV', 'Nhiễm trùng cơ hội kèm theo'],
        red: ['Viêm màng não do Cryptococcus', 'Lao lan tỏa', 'Viêm phổi do Pneumocystis'],
        cls: ['Test nhanh HIV – xét nghiệm khẳng định', 'CD4', 'Tải lượng virus', 'X-quang ngực', 'Soi đáy mắt']
    },
    {
        k: 'Viêm gan siêu vi cấp', re: /vi[êe]m gan si[êe]u vi|vi[êe]m gan c[ấa]p/i,
        nn: ['Viêm gan A', 'Viêm gan B cấp', 'Viêm gan C cấp', 'Viêm gan E', 'EBV – CMV', 'Viêm gan do thuốc'],
        red: ['Suy gan cấp'],
        cls: ['AST – ALT – Bilirubin', 'PT/INR', 'IgM anti-HAV', 'HBsAg – IgM anti-HBc', 'anti-HCV', 'Siêu âm bụng']
    },
    {
        k: 'Uốn ván', re: /u[ốo]n v[áa]n|tetanus/i,
        nn: ['Vết thương bẩn không tiêm phòng', 'Uốn ván rốn sơ sinh', 'Sau thủ thuật không vô trùng'],
        red: ['Co thắt thanh quản', 'Rối loạn thần kinh tự chủ'],
        cls: ['Chẩn đoán lâm sàng', 'Công thức máu – CRP', 'Khí máu động mạch', 'Cấy vết thương']
    },
    {
        k: 'Tay chân miệng', re: /tay ch[âa]n mi[ệe]ng/i,
        nn: ['Enterovirus 71', 'Coxsackie A16', 'Enterovirus khác'],
        red: ['Viêm não thân não do EV71', 'Phù phổi cấp do EV71'],
        cls: ['PCR EV71', 'Công thức máu – CRP', 'Đường huyết', 'Siêu âm tim khi độ nặng ≥ 2b']
    },

    /* ---------------- Huyết học ---------------- */
    {
        k: 'Hội chứng tăng sinh tủy', re: /t[ăa]ng sinh t[ủu]y/i,
        nn: ['Đa hồng cầu nguyên phát', 'Tăng tiểu cầu tiên phát', 'Xơ tủy nguyên phát', 'Bạch cầu mạn dòng tủy'],
        red: ['Huyết khối động – tĩnh mạch', 'Chuyển dạng cấp'],
        cls: ['Công thức máu – phết máu', 'JAK2 V617F', 'BCR-ABL', 'Tủy đồ – sinh thiết tủy', 'Erythropoietin huyết thanh']
    },
    {
        k: 'Lách to', re: /l[áa]ch to/i,
        nn: ['Tăng áp cửa do xơ gan', 'Nhiễm trùng (sốt rét, EBV, nhiễm trùng huyết)', 'Bệnh máu ác tính', 'Tan máu mạn', 'Bệnh dự trữ (Gaucher)', 'Lupus'],
        red: ['Vỡ lách'],
        cls: ['Siêu âm bụng', 'Công thức máu – phết máu', 'Chức năng gan', 'Phết máu tìm ký sinh trùng sốt rét', 'Tủy đồ']
    },
    {
        k: 'Rối loạn đông máu', re: /r[ốo]i lo[ạa]n đ[ôo]ng m[áa]u/i,
        nn: ['Bệnh gan', 'Thiếu vitamin K', 'Đông máu nội mạch lan tỏa (DIC)', 'Hemophilia', 'Do thuốc kháng đông', 'Kháng thể kháng phospholipid'],
        red: ['DIC', 'Xuất huyết nội sọ'],
        cls: ['PT – aPTT – fibrinogen', 'D-dimer', 'Định lượng yếu tố đông máu', 'Mixing test', 'Chức năng gan']
    },
    {
        k: 'Giảm tiểu cầu', re: /gi[ảa]m ti[ểe]u c[ầa]u/i,
        nn: ['Giảm tiểu cầu miễn dịch (ITP)', 'Do thuốc – heparin', 'Sốt xuất huyết Dengue', 'Nhiễm trùng huyết – DIC', 'Cường lách', 'Bệnh lý tủy xương', 'Giả giảm tiểu cầu do EDTA'],
        red: ['Xuất huyết nội sọ', 'TTP – HUS'],
        cls: ['Công thức máu lặp lại + phết máu', 'Đông máu toàn bộ', 'HIV – HCV', 'Tủy đồ', 'LDH – haptoglobin']
    },
    {
        k: 'Tăng bạch cầu bất thường', re: /t[ăa]ng b[ạa]ch c[ầa]u/i,
        nn: ['Nhiễm trùng', 'Bạch cầu cấp', 'Bạch cầu mạn dòng tủy', 'Phản ứng giả bạch cầu (leukemoid)', 'Do corticoid', 'Stress – sau phẫu thuật'],
        red: ['Bạch cầu cấp', 'Tăng bạch cầu gây ứ trệ (leukostasis)'],
        cls: ['Công thức máu – phết máu ngoại vi', 'Tủy đồ', 'Dấu ấn miễn dịch tế bào', 'CRP – cấy máu', 'LDH – acid uric']
    },

    /* ---------------- Nội tiết – chuyển hóa ---------------- */
    {
        k: 'Hạ đường huyết', re: /h[ạa] đ[ườơ]{1,2}ng huy[ếe]t/i,
        nn: ['Quá liều insulin – sulfonylurea', 'Bỏ bữa – uống rượu', 'Suy gan – suy thận', 'Suy thượng thận', 'U tiết insulin (insulinoma)', 'Nhiễm trùng nặng'],
        red: ['Hôn mê hạ đường huyết', 'Tổn thương não do hạ đường huyết kéo dài'],
        cls: ['Đường huyết mao mạch và tĩnh mạch', 'Insulin – C-peptide', 'Cortisol máu', 'Chức năng gan thận']
    },
    {
        k: 'Bướu giáp', re: /b[ướơ]{1,2}u gi[áa]p|nh[âa]n gi[áa]p/i,
        nn: ['Bướu giáp đơn thuần do thiếu iod', 'Bệnh Basedow', 'Viêm giáp Hashimoto', 'Bướu giáp đa nhân', 'Ung thư tuyến giáp', 'Viêm giáp bán cấp'],
        red: ['Ung thư tuyến giáp', 'Chèn ép khí quản'],
        cls: ['TSH – FT4', 'Siêu âm tuyến giáp', 'FNA nhân giáp', 'TRAb – anti-TPO', 'Xạ hình tuyến giáp']
    },
    {
        k: 'Hội chứng Cushing', re: /cushing/i,
        nn: ['Do dùng corticoid kéo dài', 'U tuyến yên tiết ACTH', 'U thượng thận', 'Tiết ACTH lạc chỗ'],
        red: ['Cơn suy thượng thận khi ngưng thuốc đột ngột', 'Loãng xương – gãy xương bệnh lý'],
        cls: ['Cortisol niệu 24 giờ', 'Nghiệm pháp ức chế dexamethasone', 'ACTH máu', 'MRI tuyến yên – CT thượng thận']
    },
    {
        k: 'Suy thượng thận cấp', re: /suy th[ượơ]{1,2}ng th[ậa]n/i,
        nn: ['Ngưng corticoid đột ngột', 'Bệnh Addison', 'Xuất huyết thượng thận', 'Suy tuyến yên', 'Nhiễm trùng nặng trên nền suy thượng thận mạn'],
        red: ['Sốc do suy thượng thận cấp'],
        cls: ['Cortisol máu 8 giờ', 'ACTH', 'Ion đồ (Na thấp – K cao)', 'Đường huyết', 'CT thượng thận']
    },
    {
        k: 'Rối loạn lipid máu', re: /r[ốo]i lo[ạa]n lipid|t[ăa]ng cholesterol|t[ăa]ng triglyceride/i,
        nn: ['Rối loạn lipid nguyên phát – gia đình', 'Chế độ ăn – béo phì', 'Đái tháo đường', 'Suy giáp', 'Hội chứng thận hư', 'Do thuốc', 'Rượu'],
        red: ['Viêm tụy cấp do tăng triglyceride', 'Bệnh mạch vành sớm'],
        cls: ['Bộ mỡ máu lúc đói', 'HbA1c', 'TSH', 'Đạm niệu', 'Men gan']
    },
    {
        k: 'Loãng xương', re: /lo[ãa]ng x[ươư]{1,2}ng/i,
        nn: ['Loãng xương sau mãn kinh', 'Loãng xương tuổi cao', 'Do corticoid', 'Cường giáp – cường cận giáp', 'Kém hấp thu – thiếu vitamin D', 'Bất động kéo dài'],
        red: ['Gãy cổ xương đùi', 'Gãy lún đốt sống'],
        cls: ['Đo mật độ xương (DXA)', 'Canxi – phospho – PTH', 'Vitamin D', 'X-quang cột sống']
    },

    /* ---------------- Cơ xương khớp ---------------- */
    {
        k: 'Hội chứng chèn ép rễ thần kinh', re: /ch[èe]n [ée]p r[ễe]|th[ầa]n kinh t[ọo]a/i,
        nn: ['Thoát vị đĩa đệm', 'Thoái hóa – hẹp ống sống', 'Trượt đốt sống', 'U chèn ép rễ', 'Lao cột sống', 'Zona thần kinh'],
        red: ['Hội chứng chùm đuôi ngựa'],
        cls: ['MRI cột sống', 'X-quang cột sống', 'Điện cơ', 'CRP – VS']
    },
    {
        k: 'Gout cấp', re: /\bgout\b|g[úu]t/i,
        nn: ['Tăng acid uric nguyên phát', 'Do thuốc lợi tiểu', 'Suy thận', 'Chế độ ăn nhiều đạm – bia rượu', 'Bệnh tăng sinh tủy'],
        red: ['Viêm khớp nhiễm trùng'],
        cls: ['Acid uric máu', 'Dịch khớp tìm tinh thể urat', 'Công thức máu – CRP', 'Chức năng thận', 'Siêu âm khớp']
    },
    {
        k: 'Thoái hóa khớp', re: /tho[áa]i h[óo]a kh[ớo]p/i,
        nn: ['Thoái hóa nguyên phát do tuổi', 'Sau chấn thương khớp', 'Béo phì – quá tải khớp', 'Sau viêm khớp', 'Bệnh khớp do chuyển hóa'],
        red: ['Viêm khớp nhiễm trùng', 'Hoại tử vô mạch chỏm xương'],
        cls: ['X-quang khớp', 'CRP – VS', 'Chọc dịch khớp khi cần', 'MRI khớp']
    },
    {
        k: 'Viêm cơ – yếu cơ gốc chi', re: /vi[êe]m đa c[ơo]|y[ếe]u c[ơo] g[ốo]c chi/i,
        nn: ['Viêm đa cơ – viêm da cơ', 'Bệnh cơ do statin', 'Suy giáp', 'Bệnh cơ do corticoid', 'Loạn dưỡng cơ', 'Rối loạn điện giải'],
        red: ['Tiêu cơ vân – suy thận cấp', 'Ác tính đi kèm viêm da cơ'],
        cls: ['CK – LDH', 'Điện cơ', 'Kháng thể đặc hiệu viêm cơ (anti-Jo1)', 'TSH', 'Sinh thiết cơ', 'Ion đồ']
    },

    /* ---------------- Ngoại khoa – chấn thương ---------------- */
    {
        k: 'Hội chứng chảy máu trong ổ bụng', re: /ch[ảa]y m[áa]u trong [ổo] b[ụu]ng|xu[ấa]t huy[ếe]t n[ộo]i/i,
        nn: ['Vỡ lách', 'Vỡ gan', 'Rách mạc treo', 'Thai ngoài tử cung vỡ', 'Vỡ phình động mạch chủ bụng', 'Vỡ nang buồng trứng'],
        red: ['Sốc mất máu'],
        cls: ['Siêu âm FAST', 'CT bụng có cản quang', 'Công thức máu – nhóm máu', 'Beta hCG']
    },
    {
        k: 'Viêm ruột thừa cấp', re: /vi[êe]m ru[ộo]t th[ừu]a/i,
        nn: ['Viêm ruột thừa cấp chưa biến chứng', 'Viêm ruột thừa hoại tử – vỡ', 'Đám quánh ruột thừa'],
        red: ['Viêm phúc mạc ruột thừa'],
        cls: ['Công thức máu – CRP', 'Siêu âm bụng', 'CT bụng', 'Beta hCG (nữ tuổi sinh đẻ)']
    },
    {
        k: 'Chấn thương ngực kín', re: /ch[ấa]n th[ươư]{1,2}ng ng[ựư]c/i,
        nn: ['Gãy xương sườn', 'Dập phổi', 'Tràn máu – tràn khí màng phổi', 'Mảng sườn di động', 'Dập cơ tim', 'Vỡ động mạch chủ ngực'],
        red: ['Tràn khí màng phổi áp lực', 'Chèn ép tim cấp', 'Vỡ động mạch chủ'],
        cls: ['X-quang ngực', 'CT ngực', 'Siêu âm FAST', 'ECG – troponin', 'Khí máu động mạch']
    },
    {
        k: 'Gãy xương', re: /g[ãa]y x[ươư]{1,2}ng/i,
        nn: ['Chấn thương năng lượng cao', 'Té ngã trên nền loãng xương', 'Gãy bệnh lý do u – di căn', 'Gãy do mỏi'],
        red: ['Hội chứng chèn ép khoang', 'Tổn thương mạch – thần kinh kèm theo', 'Thuyên tắc mỡ'],
        cls: ['X-quang 2 bình diện', 'CT dựng hình xương', 'Đo mật độ xương', 'Công thức máu – đông máu trước mổ']
    },
    {
        k: 'Bỏng', re: /b[ỏo]ng/i,
        nn: ['Bỏng nhiệt', 'Bỏng điện', 'Bỏng hóa chất', 'Bỏng do bức xạ'],
        red: ['Bỏng đường hô hấp', 'Sốc bỏng'],
        cls: ['Ước lượng diện tích – độ sâu bỏng', 'Khí máu – HbCO', 'Ion đồ – chức năng thận', 'Công thức máu', 'Cấy dịch vết bỏng']
    },

    /* ---------------- Sản – phụ khoa ---------------- */
    {
        k: 'Dọa sẩy thai', re: /d[ọo]a s[ẩa]y thai|s[ẩa]y thai/i,
        nn: ['Bất thường nhiễm sắc thể phôi', 'Thiếu hoàng thể', 'Bất thường tử cung', 'Nhiễm trùng', 'Hội chứng kháng phospholipid', 'Bệnh nội tiết của mẹ'],
        red: ['Thai ngoài tử cung', 'Thai trứng', 'Sẩy thai băng huyết'],
        cls: ['Beta hCG định lượng', 'Siêu âm đầu dò âm đạo', 'Progesterone', 'Công thức máu – nhóm máu Rh']
    },
    {
        k: 'Sản giật', re: /s[ảa]n gi[ậa]t/i,
        nn: ['Tiền sản giật nặng tiến triển', 'Tăng huyết áp mạn trong thai kỳ', 'Bệnh thận nền', 'Đa thai – thai trứng'],
        red: ['Xuất huyết não', 'Hội chứng HELLP', 'Nhau bong non'],
        cls: ['Huyết áp – đạm niệu', 'Công thức máu – tiểu cầu', 'AST – ALT – LDH', 'Chức năng thận', 'Monitor tim thai']
    }
);


LIBRARY.push(
    {
        k: 'Thai ngoài tử cung', re: /thai ngo[àa]i t[ửư] cung|ch[ửư]a ngo[àa]i t[ửư] cung/i,
        nn: ['Thai ở vòi trứng', 'Tiền căn viêm nhiễm vùng chậu', 'Sau phẫu thuật vòi trứng', 'Mang dụng cụ tử cung', 'Sau hỗ trợ sinh sản'],
        red: ['Thai ngoài tử cung vỡ – sốc mất máu'],
        cls: ['Beta hCG định lượng lặp lại', 'Siêu âm đầu dò âm đạo', 'Công thức máu – nhóm máu', 'Siêu âm FAST tìm dịch ổ bụng']
    },
    {
        k: 'Băng huyết sau sinh', re: /b[ăa]ng huy[ếe]t sau sinh/i,
        nn: ['Đờ tử cung', 'Sót nhau – sót màng', 'Rách đường sinh dục', 'Rối loạn đông máu', 'Vỡ tử cung', 'Lộn tử cung'],
        red: ['Sốc mất máu', 'Đông máu nội mạch lan tỏa'],
        cls: ['Công thức máu – nhóm máu', 'Đông máu toàn bộ', 'Siêu âm tử cung tìm sót nhau', 'Fibrinogen']
    },
    {
        k: 'Khối u phần phụ', re: /kh[ốo]i u ph[ầa]n ph[ụu]|u bu[ồo]ng tr[ứu]ng/i,
        nn: ['Nang cơ năng buồng trứng', 'U lạc nội mạc tử cung', 'U bì buồng trứng', 'Ung thư buồng trứng', 'Ứ dịch – ứ mủ vòi trứng', 'Thai ngoài tử cung'],
        red: ['Xoắn phần phụ', 'Ung thư buồng trứng', 'Thai ngoài tử cung vỡ'],
        cls: ['Siêu âm đầu dò âm đạo', 'CA-125 – HE4', 'Beta hCG', 'CT / MRI vùng chậu']
    },
    {
        k: 'Rong kinh – rong huyết', re: /rong kinh|rong huy[ếe]t/i,
        nn: ['U xơ tử cung', 'Lạc nội mạc trong cơ tử cung', 'Polyp buồng tử cung', 'Rối loạn phóng noãn', 'Rối loạn đông máu', 'Do thuốc nội tiết', 'Ung thư nội mạc tử cung'],
        red: ['Ung thư nội mạc tử cung', 'Thiếu máu nặng do mất máu'],
        cls: ['Siêu âm đầu dò âm đạo', 'Công thức máu – ferritin', 'Beta hCG', 'Nội soi buồng tử cung – sinh thiết nội mạc', 'Đông máu toàn bộ']
    },
    {
        k: 'Hen phế quản trẻ em', re: /hen ph[ếe] qu[ảa]n tr[ẻe] em|hen tr[ẻe] em/i,
        nn: ['Hen dị ứng', 'Khởi phát do nhiễm siêu vi hô hấp', 'Do gắng sức', 'Do dị nguyên trong nhà (bụi nhà, lông thú)', 'Trào ngược dạ dày thực quản'],
        red: ['Cơn hen nguy kịch', 'Dị vật đường thở'],
        cls: ['Hô hấp ký (trẻ ≥ 6 tuổi)', 'X-quang ngực', 'SpO2 – khí máu khi nặng', 'Test dị nguyên', 'Công thức máu – IgE']
    },
    {
        k: 'Chậm phát triển tâm vận', re: /ch[ậa]m ph[áa]t tri[ểe]n t[âa]m v[ậa]n/i,
        nn: ['Bại não', 'Bất thường nhiễm sắc thể', 'Suy giáp bẩm sinh', 'Di chứng ngạt – nhiễm trùng sơ sinh', 'Rối loạn phổ tự kỷ', 'Suy dinh dưỡng nặng', 'Bệnh chuyển hóa bẩm sinh'],
        red: ['Suy giáp bẩm sinh bỏ sót', 'Bệnh chuyển hóa mất bù'],
        cls: ['TSH – FT4', 'MRI sọ não', 'Nhiễm sắc thể đồ', 'Sàng lọc chuyển hóa', 'Đánh giá thính lực – thị lực']
    },
    {
        k: 'Ngưng hô hấp tuần hoàn', re: /ng[ưu]ng h[ôo] h[ấa]p tu[ầa]n ho[àa]n|ng[ưu]ng tim/i,
        nn: ['Rung thất – nhịp nhanh thất vô mạch', 'Vô tâm thu', 'Hoạt động điện vô mạch', 'Thiếu oxy', 'Tăng kali máu', 'Sốc mất máu', 'Chèn ép tim', 'Thuyên tắc phổi lớn'],
        red: ['Các nguyên nhân hồi phục được: 5H – 5T'],
        cls: ['ECG – monitor liên tục', 'Khí máu động mạch', 'Ion đồ – kali máu', 'Siêu âm tim tại giường', 'Đường huyết mao mạch']
    },
    {
        k: 'Đuối nước', re: /đu[ốo]i n[ướơ]{1,2}c|ng[ạa]t n[ướơ]{1,2}c/i,
        nn: ['Ngạt nước ngọt', 'Ngạt nước mặn', 'Kèm chấn thương cột sống cổ khi nhảy', 'Cơn động kinh – ngất khi bơi', 'Ngộ độc rượu'],
        red: ['ARDS sau đuối nước', 'Tổn thương não do thiếu oxy', 'Hạ thân nhiệt'],
        cls: ['Khí máu động mạch', 'X-quang ngực', 'Ion đồ', 'CT sọ – cột sống cổ', 'Đo thân nhiệt trung tâm']
    },
    {
        k: 'Điện giật', re: /đi[ệe]n gi[ậa]t|b[ỏo]ng đi[ệe]n/i,
        nn: ['Điện hạ thế trong sinh hoạt', 'Điện cao thế', 'Sét đánh'],
        red: ['Rối loạn nhịp – ngưng tim', 'Tiêu cơ vân – suy thận cấp', 'Bỏng sâu tổn thương mô ẩn'],
        cls: ['ECG – monitor 24 giờ', 'CK – CK-MB – myoglobin niệu', 'Ion đồ – chức năng thận', 'Khí máu', 'Đánh giá vết bỏng vào – ra']
    },
    {
        k: 'Say nắng – sốc nhiệt', re: /say n[ắa]ng|s[ốo]c nhi[ệe]t|heat stroke/i,
        nn: ['Sốc nhiệt do gắng sức', 'Sốc nhiệt cổ điển ở người già', 'Mất nước – mất muối', 'Do thuốc (kháng cholinergic, lợi tiểu)'],
        red: ['Suy đa cơ quan', 'Tiêu cơ vân', 'Đông máu nội mạch lan tỏa'],
        cls: ['Thân nhiệt trung tâm', 'Ion đồ – chức năng thận', 'CK', 'Đông máu toàn bộ', 'Men gan']
    },
    {
        k: 'Rắn cắn', re: /r[ắa]n c[ắa]n/i,
        nn: ['Rắn lục (hội chứng chảy máu)', 'Rắn hổ (hội chứng liệt)', 'Rắn biển (tiêu cơ vân)', 'Rắn không độc – vết cắn khô'],
        red: ['Suy hô hấp do liệt cơ', 'Rối loạn đông máu nặng', 'Suy thận cấp do tiêu cơ vân'],
        cls: ['Đông máu toàn bộ – 20WBCT', 'Công thức máu – tiểu cầu', 'CK – myoglobin niệu', 'Chức năng thận', 'Theo dõi sinh hiệu – hô hấp']
    }
);

/** Toàn bộ tên vấn đề / hội chứng để dò khi gõ */
export const TEN_VAN_DE = [...new Set([
    ...VAN_DE_NHOM.flatMap(g => g.items || []),
    ...LIBRARY.map(x => x.k)
])];

/** Toàn bộ tên nguyên nhân có trong thư viện để dò khi gõ */
export const TEN_NGUYEN_NHAN = [...new Set(LIBRARY.flatMap(x => [...(x.nn || []), ...(x.red || [])]))];

/** Toàn bộ tên cận lâm sàng có trong thư viện biện luận */
export const TEN_CLS = [...new Set(LIBRARY.flatMap(x => x.cls || []))];
