// de-nghi-data.js — hai danh mục cho phần biện luận:
//   CLS_DE_NGHI  : cận lâm sàng đề nghị (mục XI) — rộng hơn danh mục phiếu ở cls-shared,
//                  vì đề nghị thì có cả những thăm dò chưa có phiếu kết quả mẫu.
// Danh mục hội chứng / vấn đề của mục VIII nằm ở `VAN_DE_NHOM` (bien-luan-data.js) —
// một danh mục duy nhất dùng chung cho mục VIII và mục X, đừng dựng bản thứ hai ở đây.

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
            'Điện giải đồ', 'Canxi – Magie – Phospho', 'Beta-hCG',
            'AFP (alpha-fetoprotein)', 'Kháng thể kháng thụ thể Acetylcholine (Anti-AChR)',
            'ACT (thời gian đông máu hoạt hóa)', 'Nhóm máu – phản ứng chéo, dự trù máu',
            'Myoglobin niệu – CK (theo dõi tái tưới máu chi)'
        ]
    },
    {
        ten: 'Vi sinh – nhiễm', icon: 'fa-virus', items: [
            'Cấy máu', 'Cấy đàm', 'Cấy nước tiểu', 'Cấy mủ – dịch vết thương',
            'Soi đàm tìm AFB', 'Xpert MTB/RIF', 'Test nhanh sốt xuất huyết (NS1, IgM/IgG)',
            'Huyết thanh chẩn đoán (Widal, Weil-Felix)', 'HBsAg – Anti HCV', 'Anti HIV',
            'RPR – TPHA', 'PCR cúm', 'Soi phân tìm ký sinh trùng', 'Cấy phân',
            'Cấy dịch màng phổi', 'Cấy đầu ống dẫn lưu', 'Cấy mô – mảnh ghép mạch máu'
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
            'MRI sọ não', 'MRI cột sống', 'Chụp mạch số hóa xóa nền (DSA)',
            'X-quang ngực nghiêng', 'CT ngực có cản quang (u phổi – u trung thất)',
            'MRI ngực (u trung thất sau, đánh giá xâm lấn ống sống)',
            'CT-angiography động mạch chủ ngực – bụng (CTA)', 'CT-angiography mạch máu chi',
            'Siêu âm E-FAST tại giường', 'Siêu âm màng ngoài tim',
            'Siêu âm tim qua thực quản (TEE)', 'Siêu âm Doppler tĩnh mạch chi dưới',
            'PET-CT (18F-FDG)', 'Xạ hình xương'
        ]
    },
    {
        ten: 'Thăm dò chức năng', icon: 'fa-wave-square', items: [
            'ECG 12 chuyển đạo', 'Holter ECG 24 giờ', 'Holter huyết áp 24 giờ',
            'Nghiệm pháp gắng sức', 'Hô hấp ký', 'Đo SpO2 qua đêm',
            'Nội soi dạ dày – tá tràng', 'Nội soi đại tràng', 'Nội soi phế quản',
            'Điện não đồ', 'Điện cơ', 'Đo mật độ xương',
            'Đo chỉ số ABI cổ chân – cánh tay', 'Đo huyết áp tứ chi',
            'Hô hấp ký – tính ppoFEV1 trước mổ cắt thùy phổi',
            'Nội soi trung thất', 'Nội soi lồng ngực (VATS) sinh thiết'
        ]
    },
    {
        ten: 'Giải phẫu bệnh – khác', icon: 'fa-microscope', items: [
            'Sinh thiết tổn thương', 'Sinh thiết hạch', 'Tế bào học FNA',
            'Giải phẫu bệnh bệnh phẩm sau mổ', 'Xét nghiệm tiền phẫu',
            'Nghiệm pháp dung nạp glucose 75 g', 'Test hơi thở H. pylori',
            'Sinh thiết xuyên thành ngực dưới hướng dẫn CT',
            'Tế bào học dịch màng phổi', 'Dịch màng phổi — tiêu chuẩn Light',
            'Sinh thiết u trung thất', 'Giải phẫu bệnh mảnh phổi – hạch sau mổ'
        ]
    }
];
