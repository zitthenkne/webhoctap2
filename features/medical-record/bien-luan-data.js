// bien-luan-data.js — thư viện gợi ý cho sơ đồ biện luận.
//
// Mỗi mục: khớp theo tên vấn đề (re), rồi gợi sẵn ba nhóm nhánh:
//   nn  = các nguyên nhân / chẩn đoán cần nghĩ
//   red = những thứ phải loại trừ khẩn (đe dọa tính mạng)
//   cls = cận lâm sàng thường dùng để phân định
// Phủ nội – ngoại – sản – nhi – cấp cứu để dùng được cho mọi loại bệnh án.

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
        k: 'Cổ trướng – gan lách to', re: /c[ổo] tr[ướơ]ng|gan l[áa]ch to|th[âa]m nhi[ễe]m/i,
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
        k: 'Tăng đường huyết / đái tháo đường', re: /đ[áa]i th[áa]o đ[ườơ]ng|t[ăa]ng đ[ườơ]ng huy[ếe]t|đ[ườơ]ng huy[ếe]t cao/i,
        nn: ['Đái tháo đường type 2', 'Đái tháo đường type 1', 'Do thuốc (corticoid)', 'Tăng đường huyết do stress',
            'Đái tháo đường thứ phát (bệnh tụy, Cushing)'],
        red: ['Nhiễm toan ceton', 'Tăng áp lực thẩm thấu máu', 'Nhiễm trùng nặng trên nền đái tháo đường'],
        cls: ['Đường huyết đói', 'HbA1c', 'Ceton máu / niệu', 'Khí máu động mạch', 'Ion đồ', 'Đạm niệu vi thể']
    },
    {
        k: 'Bệnh lý tuyến giáp', re: /tuy[ếe]n gi[áa]p|c[ườơ]ng gi[áa]p|suy gi[áa]p|b[ướơ]u c[ổo]/i,
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
        k: 'Yếu liệt nửa người', re: /y[ếe]u li[ệe]t|li[ệe]t n[ửư]a ng[ườơ]i|đ[ộo]t qu[ỵy]/i,
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
        k: 'Chấn thương sọ não', re: /ch[ấa]n th[ươư]ng s[ọo] n[ãa]o|đ[ầa]u b[ịi] va đ[ậa]p/i,
        nn: ['Chấn động não', 'Máu tụ ngoài màng cứng', 'Máu tụ dưới màng cứng', 'Dập não', 'Xuất huyết dưới nhện do chấn thương'],
        red: ['Máu tụ ngoài màng cứng đang lớn', 'Tụt kẹt não', 'Vỡ nền sọ'],
        cls: ['CT sọ não', 'X-quang cột sống cổ', 'Đông máu', 'Theo dõi Glasgow mỗi giờ']
    },
    {
        k: 'Chấn thương bụng kín', re: /ch[ấa]n th[ươư]ng b[ụu]ng/i,
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
        k: 'Tiêu chảy cấp ở trẻ', re: /ti[êe]u ch[ảa]y.*(tr[ẻe]|nhi)|m[ấa]t n[ướơ]c/i,
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
    }
];

/** Tìm bộ gợi ý khớp tên vấn đề; không khớp thì trả bộ rỗng */
export function suggestFor(ten) {
    return LIBRARY.find(x => x.re.test(ten || '')) || { nn: [], red: [], cls: [] };
}

/** Tìm theo từ khóa gõ tay (dùng cho ô tìm trong thư viện) */
export function searchLibrary(q) {
    const s = String(q || '').trim().toLowerCase();
    if (!s) return [];
    return LIBRARY.filter(x => x.k.toLowerCase().includes(s)
        || x.nn.some(n => n.toLowerCase().includes(s))).slice(0, 6);
}
