// de-nghi-data.js — hai danh mục cho phần biện luận:
//   CLS_DE_NGHI  : cận lâm sàng đề nghị (mục XI) — rộng hơn danh mục phiếu ở cls-shared,
//                  vì đề nghị thì có cả những thăm dò chưa có phiếu kết quả mẫu.
//   HOI_CHUNG    : hội chứng / vấn đề thường đặt ở mục VIII, để không phải nghĩ ra từ đầu.

export const CLS_DE_NGHI = [
    {
        ten: 'Huyết học – đông máu', icon: 'fa-droplet', items: [
            'Công thức máu', 'Phết máu ngoại biên', 'Tốc độ lắng máu (VS)',
            'Đông máu toàn bộ (PT, aPTT, INR)', 'Fibrinogen', 'D-dimer',
            'Nhóm máu ABO – Rh', 'Test Coombs', 'Điện di hemoglobin',
            'Ferritin – sắt huyết thanh', 'Vitamin B12 – Acid folic', 'Tủy đồ'
        ]
    },
    {
        ten: 'Sinh hóa – miễn dịch', icon: 'fa-vial', items: [
            'Sinh hóa máu cơ bản (ure, creatinine, AST, ALT, ion đồ)',
            'Đường huyết đói', 'HbA1c', 'Bộ mỡ máu', 'Acid uric',
            'Bilirubin toàn phần – trực tiếp', 'Albumin – protein toàn phần',
            'Amylase – Lipase máu', 'CK – CK-MB', 'Troponin T hs', 'NT-proBNP',
            'CRP', 'Procalcitonin', 'Khí máu động mạch', 'Lactate máu',
            'Chức năng tuyến giáp (TSH, FT4)', 'Cortisol máu',
            'Điện giải đồ', 'Canxi – Magie – Phospho', 'Beta-hCG'
        ]
    },
    {
        ten: 'Vi sinh – nhiễm', icon: 'fa-virus', items: [
            'Cấy máu', 'Cấy đàm', 'Cấy nước tiểu', 'Cấy mủ – dịch vết thương',
            'Soi đàm tìm AFB', 'Xpert MTB/RIF', 'Test nhanh sốt xuất huyết (NS1, IgM/IgG)',
            'Huyết thanh chẩn đoán (Widal, Weil-Felix)', 'HBsAg – Anti HCV', 'Anti HIV',
            'RPR – TPHA', 'PCR cúm', 'Soi phân tìm ký sinh trùng', 'Cấy phân'
        ]
    },
    {
        ten: 'Nước tiểu – dịch cơ thể', icon: 'fa-flask', items: [
            'Tổng phân tích nước tiểu', 'Cặn lắng nước tiểu',
            'Đạm niệu 24 giờ', 'Tỉ số protein/creatinine niệu',
            'Chọc dò dịch màng phổi — sinh hóa, tế bào',
            'Chọc dò dịch màng bụng — sinh hóa, tế bào, SAAG',
            'Chọc dò dịch não tủy', 'Dịch khớp — tế bào, tinh thể'
        ]
    },
    {
        ten: 'Hình ảnh học', icon: 'fa-x-ray', items: [
            'X-quang ngực thẳng', 'X-quang bụng không sửa soạn',
            'X-quang khớp / chi tổn thương', 'X-quang cột sống',
            'Siêu âm bụng tổng quát', 'Siêu âm tim', 'Siêu âm màng phổi',
            'Siêu âm Doppler mạch máu chi', 'Siêu âm tuyến giáp', 'Siêu âm thai',
            'CT scan sọ não không cản quang', 'CT scan ngực',
            'CT scan bụng chậu có cản quang', 'CT mạch vành',
            'MRI sọ não', 'MRI cột sống', 'Chụp mạch số hóa xóa nền (DSA)'
        ]
    },
    {
        ten: 'Thăm dò chức năng', icon: 'fa-wave-square', items: [
            'ECG 12 chuyển đạo', 'Holter ECG 24 giờ', 'Holter huyết áp 24 giờ',
            'Nghiệm pháp gắng sức', 'Hô hấp ký', 'Đo SpO2 qua đêm',
            'Nội soi dạ dày – tá tràng', 'Nội soi đại tràng', 'Nội soi phế quản',
            'Điện não đồ', 'Điện cơ', 'Đo mật độ xương'
        ]
    },
    {
        ten: 'Giải phẫu bệnh – khác', icon: 'fa-microscope', items: [
            'Sinh thiết tổn thương', 'Sinh thiết hạch', 'Tế bào học FNA',
            'Giải phẫu bệnh bệnh phẩm sau mổ', 'Xét nghiệm tiền phẫu',
            'Nghiệm pháp dung nạp glucose 75 g', 'Test hơi thở H. pylori'
        ]
    }
];

export const HOI_CHUNG = [
    {
        ten: 'Toàn thân – nhiễm', icon: 'fa-temperature-high', items: [
            'Hội chứng nhiễm trùng', 'Hội chứng nhiễm siêu vi',
            'Hội chứng đáp ứng viêm toàn thân', 'Sốt kéo dài chưa rõ nguyên nhân',
            'Hội chứng suy kiệt', 'Hội chứng thiếu máu'
        ]
    },
    {
        ten: 'Hô hấp', icon: 'fa-lungs', items: [
            'Hội chứng đông đặc phổi', 'Hội chứng ba giảm',
            'Hội chứng tràn khí màng phổi', 'Hội chứng tắc nghẽn đường thở',
            'Hội chứng suy hô hấp', 'Hội chứng trung thất', 'Ho ra máu'
        ]
    },
    {
        ten: 'Tim mạch', icon: 'fa-heart-pulse', items: [
            'Hội chứng suy tim trái', 'Hội chứng suy tim phải', 'Hội chứng suy tim toàn bộ',
            'Hội chứng vành cấp', 'Hội chứng đau thắt ngực',
            'Rối loạn nhịp tim', 'Tăng huyết áp chưa kiểm soát', 'Hội chứng sốc'
        ]
    },
    {
        ten: 'Tiêu hóa – gan mật', icon: 'fa-bowl-food', items: [
            'Hội chứng tăng áp lực tĩnh mạch cửa', 'Hội chứng suy tế bào gan',
            'Hội chứng vàng da tắc mật', 'Hội chứng báng bụng',
            'Hội chứng xuất huyết tiêu hóa', 'Hội chứng tắc ruột',
            'Hội chứng nhiễm trùng đường mật', 'Bụng ngoại khoa'
        ]
    },
    {
        ten: 'Thận – tiết niệu', icon: 'fa-droplet', items: [
            'Hội chứng thận hư', 'Hội chứng viêm cầu thận cấp',
            'Hội chứng urê huyết cao', 'Hội chứng nhiễm trùng tiểu',
            'Hội chứng bế tắc đường tiểu', 'Rối loạn nước – điện giải'
        ]
    },
    {
        ten: 'Thần kinh – cơ xương khớp', icon: 'fa-brain', items: [
            'Hội chứng màng não', 'Hội chứng tăng áp lực nội sọ',
            'Hội chứng liệt nửa người', 'Hội chứng tiểu não',
            'Hội chứng tháp', 'Hội chứng ngoại tháp',
            'Hội chứng chèn ép tủy', 'Hội chứng viêm khớp'
        ]
    },
    {
        ten: 'Nội tiết – chuyển hóa', icon: 'fa-vial', items: [
            'Hội chứng tăng đường huyết', 'Hội chứng hạ đường huyết',
            'Hội chứng cường giáp', 'Hội chứng suy giáp',
            'Hội chứng Cushing', 'Rối loạn lipid máu', 'Toan chuyển hóa'
        ]
    }
];
