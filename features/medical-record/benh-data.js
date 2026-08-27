// benh-data.js — thư viện chẩn đoán thường gặp, xếp theo chuyên khoa.
//
// Dùng cho bảng chọn bệnh ở mục Chẩn đoán sơ bộ / xác định / bệnh kèm /
// chẩn đoán phân biệt / chẩn đoán trước – sau mổ. Danh sách chỉ để bấm cho nhanh,
// người dùng luôn gõ tay được tên khác.

export const BENH_NHOM = [
    {
        ten: 'Tim mạch', icon: 'fa-heart-pulse', items: [
            'Tăng huyết áp', 'Tăng huyết áp cấp cứu', 'Bệnh mạch vành mạn',
            'Nhồi máu cơ tim cấp ST chênh lên', 'Nhồi máu cơ tim cấp không ST chênh lên',
            'Đau thắt ngực không ổn định', 'Suy tim mạn mất bù', 'Suy tim cấp – phù phổi cấp',
            'Rung nhĩ', 'Cuồng nhĩ', 'Nhịp nhanh kịch phát trên thất', 'Block nhĩ thất độ III',
            'Bệnh van hai lá hậu thấp', 'Hẹp van động mạch chủ', 'Hở van động mạch chủ',
            'Viêm nội tâm mạc nhiễm trùng', 'Viêm màng ngoài tim', 'Bệnh cơ tim giãn',
            'Thuyên tắc phổi', 'Bóc tách động mạch chủ', 'Bệnh động mạch chi dưới mạn',
            'Huyết khối tĩnh mạch sâu chi dưới', 'Suy tĩnh mạch mạn chi dưới', 'Sốc tim'
        ]
    },
    {
        ten: 'Hô hấp', icon: 'fa-lungs', items: [
            'Viêm phổi cộng đồng', 'Viêm phổi bệnh viện', 'Viêm phổi hít',
            'Đợt cấp bệnh phổi tắc nghẽn mạn tính (COPD)', 'Bệnh phổi tắc nghẽn mạn tính',
            'Cơn hen phế quản cấp', 'Hen phế quản', 'Lao phổi', 'Lao màng phổi',
            'Tràn dịch màng phổi', 'Tràn khí màng phổi', 'Áp xe phổi', 'Giãn phế quản',
            'Ung thư phổi', 'Suy hô hấp cấp', 'Suy hô hấp mạn', 'Viêm phế quản cấp',
            'Xơ phổi mô kẽ', 'Ho ra máu', 'Ngưng thở khi ngủ do tắc nghẽn'
        ]
    },
    {
        ten: 'Tiêu hóa – Gan mật', icon: 'fa-bowl-food', items: [
            'Xuất huyết tiêu hóa trên', 'Xuất huyết tiêu hóa dưới',
            'Loét dạ dày – tá tràng', 'Viêm dạ dày cấp', 'Trào ngược dạ dày – thực quản',
            'Xơ gan', 'Xơ gan mất bù', 'Viêm gan B mạn', 'Viêm gan C mạn', 'Viêm gan cấp',
            'Bệnh gan nhiễm mỡ không do rượu', 'Bệnh gan do rượu', 'Ung thư gan nguyên phát',
            'Viêm tụy cấp', 'Viêm tụy mạn', 'Sỏi túi mật', 'Viêm túi mật cấp',
            'Sỏi ống mật chủ', 'Viêm đường mật cấp', 'Viêm ruột thừa cấp',
            'Tắc ruột cơ học', 'Thủng tạng rỗng', 'Viêm phúc mạc',
            'Bệnh trĩ', 'Viêm đại tràng', 'Hội chứng ruột kích thích', 'Ung thư đại trực tràng',
            'Ung thư dạ dày', 'Nhiễm trùng đường ruột cấp', 'Bệnh Crohn', 'Viêm loét đại tràng'
        ]
    },
    {
        ten: 'Thận – Tiết niệu', icon: 'fa-droplet', items: [
            'Bệnh thận mạn', 'Bệnh thận mạn giai đoạn cuối', 'Tổn thương thận cấp',
            'Hội chứng thận hư', 'Viêm cầu thận cấp', 'Viêm cầu thận mạn',
            'Nhiễm trùng tiểu dưới', 'Viêm đài bể thận cấp', 'Sỏi niệu quản', 'Sỏi thận',
            'Sỏi bàng quang', 'Bí tiểu cấp', 'Tăng sinh lành tính tuyến tiền liệt',
            'Ung thư tuyến tiền liệt', 'Ung thư bàng quang', 'Thận ứ nước',
            'Bệnh thận do đái tháo đường', 'Bệnh thận do tăng huyết áp', 'Nang thận'
        ]
    },
    {
        ten: 'Nội tiết – Chuyển hóa', icon: 'fa-vial', items: [
            'Đái tháo đường type 2', 'Đái tháo đường type 1', 'Đái tháo đường thai kỳ',
            'Nhiễm toan ceton do đái tháo đường', 'Tăng áp lực thẩm thấu do tăng đường huyết',
            'Hạ đường huyết', 'Bàn chân đái tháo đường', 'Rối loạn lipid máu',
            'Béo phì', 'Thừa cân', 'Suy dinh dưỡng', 'Cường giáp – Basedow', 'Suy giáp',
            'Bướu giáp đơn thuần', 'Nhân giáp', 'Cơn bão giáp', 'Suy thượng thận',
            'Hội chứng Cushing', 'Gout', 'Cơn gout cấp', 'Loãng xương'
        ]
    },
    {
        ten: 'Thần kinh', icon: 'fa-brain', items: [
            'Nhồi máu não cấp', 'Xuất huyết não', 'Xuất huyết khoang dưới nhện',
            'Cơn thiếu máu não thoáng qua', 'Di chứng tai biến mạch máu não',
            'Động kinh', 'Trạng thái động kinh', 'Viêm màng não mủ', 'Viêm màng não lao',
            'Viêm não', 'Đau đầu Migraine', 'Đau đầu căng cơ', 'Bệnh Parkinson',
            'Sa sút trí tuệ', 'Bệnh thần kinh ngoại biên do đái tháo đường',
            'Hội chứng Guillain–Barré', 'Nhược cơ', 'Liệt dây VII ngoại biên',
            'Thoát vị đĩa đệm cột sống thắt lưng', 'Hẹp ống sống', 'Rối loạn tiền đình'
        ]
    },
    {
        ten: 'Huyết học', icon: 'fa-droplet', items: [
            'Thiếu máu thiếu sắt', 'Thiếu máu do bệnh mạn tính', 'Thiếu máu tán huyết',
            'Thiếu máu hồng cầu to', 'Thalassemia', 'Suy tủy xương',
            'Bạch cầu cấp dòng tủy', 'Bạch cầu cấp dòng lympho', 'Bạch cầu mạn dòng tủy',
            'U lympho Hodgkin', 'U lympho không Hodgkin', 'Đa u tủy',
            'Xuất huyết giảm tiểu cầu miễn dịch', 'Rối loạn đông máu', 'Đông máu nội mạch lan tỏa'
        ]
    },
    {
        ten: 'Nhiễm', icon: 'fa-virus', items: [
            'Sốt xuất huyết Dengue', 'Sốt xuất huyết Dengue có dấu hiệu cảnh báo',
            'Sốt xuất huyết Dengue nặng', 'Sốc nhiễm trùng', 'Nhiễm trùng huyết',
            'Sốt rét', 'Thương hàn', 'Tay chân miệng', 'Sởi', 'Thủy đậu', 'Quai bị',
            'Cúm mùa', 'COVID-19', 'Nhiễm HIV', 'Nhiễm HIV giai đoạn AIDS',
            'Uốn ván', 'Dại', 'Leptospirosis', 'Nhiễm trùng da mô mềm', 'Viêm mô tế bào',
            'Áp xe phần mềm', 'Nhiễm nấm Candida', 'Lao hạch', 'Lao màng bụng'
        ]
    },
    {
        ten: 'Cơ xương khớp – Miễn dịch', icon: 'fa-bone', items: [
            'Thoái hóa khớp gối', 'Thoái hóa cột sống thắt lưng', 'Thoái hóa cột sống cổ',
            'Viêm khớp dạng thấp', 'Lupus ban đỏ hệ thống', 'Xơ cứng bì',
            'Viêm cột sống dính khớp', 'Viêm khớp phản ứng', 'Viêm khớp nhiễm trùng',
            'Viêm quanh khớp vai', 'Viêm gân', 'Hội chứng ống cổ tay',
            'Đau thần kinh tọa', 'Viêm đa cơ', 'Viêm mạch máu hệ thống'
        ]
    },
    {
        ten: 'Ngoại tổng quát', icon: 'fa-scissors', items: [
            'Viêm ruột thừa cấp', 'Viêm ruột thừa vỡ mủ', 'Viêm phúc mạc ruột thừa',
            'Thủng ổ loét dạ dày – tá tràng', 'Tắc ruột do dính', 'Xoắn ruột',
            'Thoát vị bẹn', 'Thoát vị bẹn nghẹt', 'Thoát vị rốn', 'Thoát vị thành bụng',
            'Viêm túi mật cấp do sỏi', 'Áp xe gan', 'Áp xe hậu môn', 'Rò hậu môn',
            'Trĩ nội độ III', 'Nứt kẽ hậu môn', 'Ung thư dạ dày', 'Ung thư đại trực tràng',
            'Bướu giáp nhân cần mổ', 'Ung thư vú'
        ]
    },
    {
        ten: 'Chấn thương chỉnh hình', icon: 'fa-bone', items: [
            'Chấn thương sọ não', 'Máu tụ ngoài màng cứng', 'Máu tụ dưới màng cứng',
            'Dập não – xuất huyết não do chấn thương', 'Vỡ xương sọ',
            'Chấn thương ngực kín', 'Gãy xương sườn', 'Tràn máu màng phổi',
            'Tràn khí màng phổi do chấn thương', 'Chấn thương bụng kín', 'Vỡ gan', 'Vỡ lách',
            'Gãy xương đùi', 'Gãy cổ xương đùi', 'Gãy xương cẳng chân', 'Gãy xương cánh tay',
            'Gãy xương cẳng tay', 'Gãy xương chậu', 'Gãy cột sống', 'Trật khớp vai',
            'Đứt dây chằng chéo trước', 'Vết thương phần mềm', 'Bỏng', 'Đa chấn thương'
        ]
    },
    {
        ten: 'Sản – Phụ khoa', icon: 'fa-baby', items: [
            'Thai kỳ bình thường', 'Chuyển dạ', 'Chuyển dạ đình trệ', 'Ối vỡ non', 'Ối vỡ sớm',
            'Dọa sinh non', 'Sinh non', 'Thai quá ngày', 'Tiền sản giật', 'Tiền sản giật nặng',
            'Sản giật', 'Đái tháo đường thai kỳ', 'Nhau tiền đạo', 'Nhau bong non',
            'Thai ngoài tử cung', 'Dọa sảy thai', 'Sảy thai', 'Thai lưu', 'Thai trứng',
            'Băng huyết sau sinh', 'Nhiễm trùng hậu sản', 'U xơ tử cung', 'U nang buồng trứng',
            'Viêm âm đạo', 'Viêm vùng chậu', 'Ung thư cổ tử cung'
        ]
    },
    {
        ten: 'Nhi khoa', icon: 'fa-child', items: [
            'Viêm phổi trẻ em', 'Viêm tiểu phế quản', 'Viêm thanh khí phế quản cấp',
            'Hen phế quản trẻ em', 'Tiêu chảy cấp', 'Tiêu chảy cấp có mất nước',
            'Sốt xuất huyết Dengue trẻ em', 'Tay chân miệng', 'Sốt siêu vi',
            'Viêm họng cấp', 'Viêm tai giữa cấp', 'Nhiễm trùng tiểu trẻ em',
            'Co giật do sốt', 'Suy dinh dưỡng cấp nặng', 'Thiếu máu thiếu sắt trẻ em',
            'Vàng da sơ sinh', 'Nhiễm trùng sơ sinh', 'Hội chứng thận hư trẻ em', 'Tim bẩm sinh'
        ]
    },
    {
        ten: 'Cấp cứu – Hồi sức', icon: 'fa-truck-medical', items: [
            'Sốc giảm thể tích', 'Sốc nhiễm trùng', 'Sốc phản vệ', 'Sốc tim',
            'Ngưng tim ngưng thở', 'Suy hô hấp cấp', 'Hôn mê chưa rõ nguyên nhân',
            'Ngộ độc cấp', 'Ngộ độc thuốc trừ sâu phospho hữu cơ', 'Ngộ độc paracetamol',
            'Ngộ độc rượu', 'Rắn cắn', 'Đuối nước', 'Say nắng – sốc nhiệt', 'Điện giật',
            'Hạ đường huyết nặng', 'Rối loạn điện giải nặng', 'Toan chuyển hóa nặng'
        ]
    },
    {
        ten: 'Da liễu – Dị ứng', icon: 'fa-hand-dots', items: [
            'Viêm da cơ địa', 'Viêm da tiếp xúc', 'Mày đay', 'Phù mạch',
            'Dị ứng thuốc', 'Hội chứng Stevens–Johnson', 'Vảy nến', 'Zona',
            'Nhiễm nấm da', 'Ghẻ', 'Chốc', 'Nhọt – hậu bối'
        ]
    },
    {
        ten: 'Tâm thần – Khác', icon: 'fa-head-side-virus', items: [
            'Rối loạn lo âu', 'Trầm cảm', 'Mất ngủ mạn tính', 'Rối loạn do sử dụng rượu',
            'Hội chứng cai rượu', 'Sảng rượu', 'Rối loạn lưỡng cực', 'Tâm thần phân liệt',
            'Suy kiệt', 'Chăm sóc giảm nhẹ'
        ]
    },
    {
        ten: 'Ngoại lồng ngực', icon: 'fa-lungs', items: [
            /* chấn thương – vết thương ngực */
            'Chấn thương ngực kín', 'Vết thương thấu ngực', 'Vết thương ngực hở',
            'Gãy xương sườn', 'Mảng sườn di động', 'Gãy xương ức',
            'Tràn khí màng phổi do chấn thương', 'Tràn khí màng phổi áp lực',
            'Tràn khí màng phổi tự phát', 'Tràn máu màng phổi', 'Tràn máu – tràn khí màng phổi',
            'Máu đông màng phổi', 'Dập phổi', 'Vỡ cơ hoành do chấn thương',
            'Tràn mủ màng phổi', 'Tràn dưỡng chấp màng phổi', 'Tràn khí trung thất',
            /* bệnh lý lồng ngực */
            'U trung thất trước', 'U tuyến ức (Thymoma)', 'U trung thất sau nguồn gốc thần kinh',
            'Nang phế quản trung thất', 'Bướu giáp thòng trung thất', 'U tế bào mầm trung thất',
            'Nhược cơ (Myasthenia gravis)',
            'Ung thư phổi không tế bào nhỏ', 'Ung thư phổi tế bào nhỏ', 'U phổi di căn',
            'Hội chứng Pancoast – Tobias', 'Hội chứng chèn ép tĩnh mạch chủ trên',
            'Kén khí phổi', 'Áp xe phổi có chỉ định phẫu thuật', 'Dày dính màng phổi'
        ]
    },
    {
        ten: 'Mạch máu', icon: 'fa-heart-circle-bolt', items: [
            /* động mạch chủ */
            'Phình động mạch chủ bụng', 'Phình động mạch chủ bụng vỡ', 'Phình động mạch chủ ngực',
            'Bóc tách động mạch chủ Stanford A', 'Bóc tách động mạch chủ Stanford B',
            'Phình giả động mạch',
            /* động mạch ngoại biên */
            'Bệnh động mạch chi dưới mạn tính', 'Hội chứng Leriche',
            'Thiếu máu chi cấp tính', 'Thuyên tắc động mạch chi', 'Huyết khối động mạch chi',
            'Chấn thương mạch máu chi', 'Vết thương động mạch chi',
            'Thông động – tĩnh mạch sau chấn thương', 'Hội chứng chèn ép khoang',
            'Bệnh Buerger (viêm tắc mạch máu)', 'Hẹp động mạch cảnh',
            'Bàn chân đái tháo đường có thiếu máu chi',
            /* tĩnh mạch */
            'Suy tĩnh mạch mạn chi dưới', 'Giãn tĩnh mạch nông chi dưới',
            'Loét tĩnh mạch cẳng chân', 'Huyết khối tĩnh mạch sâu chi dưới',
            'Dò động – tĩnh mạch chạy thận nhân tạo (AVF)'
        ]
    },
    {
        ten: 'Phẫu thuật tim', icon: 'fa-heart-circle-plus', items: [
            /* cấp cứu tim */
            'Vết thương tim', 'Chèn ép tim cấp', 'Dập cơ tim', 'Tràn dịch màng ngoài tim',
            /* van – mạch vành */
            'Bệnh van hai lá hậu thấp có chỉ định phẫu thuật',
            'Hẹp van động mạch chủ có chỉ định thay van',
            'Bệnh mạch vành có chỉ định bắc cầu (CABG)',
            'Viêm nội tâm mạc nhiễm trùng trên van tim',
            /* tim bẩm sinh */
            'Thông liên nhĩ', 'Thông liên thất', 'Còn ống động mạch', 'Tứ chứng Fallot',
            /* hậu phẫu */
            'Hậu phẫu tim hở có tuần hoàn ngoài cơ thể'
        ]
    }
];

/** Danh sách phẳng, dùng cho ô tìm kiếm */
export const BENH_ALL = [...new Set(BENH_NHOM.flatMap(g => g.items))];
