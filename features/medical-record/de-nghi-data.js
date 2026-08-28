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

/* ---------------------------------------------------------------------------
   KỲ VỌNG: mong tìm thấy gì ở mỗi cận lâm sàng.
   Ô "mong tìm thấy gì" (mục XI) là chỗ sinh viên hay tắc nhất — biết đề nghị
   X-quang ngực nhưng không nói được đang tìm cái gì trên phim. Bảng này đổ vào
   datalist `cd-ky-list` theo đúng dòng đang gõ, nên gợi ý luôn khớp với cận lâm
   sàng của dòng đó chứ không phải một rổ chung.

   Khóa là regex khớp trên tên cận lâm sàng đã bỏ dấu và viết thường
   (dùng `fold()` của tim-kiem.js). Một dòng khớp nhiều mẫu thì gom hết gợi ý.
   Thêm mặt bệnh mới: thêm một hàng vào đây, không phải sửa cls-de-nghi.js.
   --------------------------------------------------------------------------- */
export const KY_VONG_THEO_CLS = [
    [/cong thuc mau/, ['bạch cầu tăng, ưu thế neutrophil', 'bạch cầu không tăng — nghiêng về siêu vi',
        'thiếu máu hồng cầu nhỏ nhược sắc', 'tiểu cầu giảm', 'Hct cô đặc máu']],
    [/crp|procalcitonin|toc do lang/, ['CRP tăng cao — nghiêng về nhiễm khuẩn',
        'procalcitonin > 0,5 ng/mL', 'CRP bình thường — bớt nghĩ nhiễm khuẩn']],
    [/d-?dimer/, ['D-dimer âm tính — loại trừ được thuyên tắc phổi', 'D-dimer tăng cao']],
    [/troponin|ck-?mb/, ['troponin tăng động học — nhồi máu cơ tim', 'troponin âm tính hai lần cách 3 giờ']],
    [/nt-?probnp|\bbnp\b/, ['NT-proBNP > 400 pg/mL — nghiêng về suy tim', 'NT-proBNP thấp — bớt nghĩ suy tim']],
    [/khi mau dong mach/, ['toan hô hấp, PaCO2 tăng', 'giảm oxy máu, PaO2/FiO2 giảm', 'toan chuyển hóa tăng anion gap']],
    [/lactat/, ['lactat > 2 mmol/L — giảm tưới máu mô']],
    [/sinh hoa mau|ure|creatinin/, ['creatinine tăng — tổn thương thận cấp', 'ure/creatinine tăng không cân xứng',
        'AST/ALT tăng', 'ion đồ: hạ natri máu', 'hạ kali máu']],
    [/duong huyet|hba1c/, ['HbA1c > 7% — kiểm soát chưa đạt', 'đường huyết đói > 7 mmol/L']],
    [/bilirubin|albumin|amylase|lipase/, ['bilirubin trực tiếp tăng — tắc mật',
        'albumin giảm', 'amylase/lipase tăng > 3 lần giới hạn trên — viêm tụy cấp']],
    [/cay mau|cay dam|cay nuoc tieu|cay mu|cay phan|cay dich/, ['mọc vi khuẩn và có kháng sinh đồ',
        'cấy âm tính sau 48 giờ', 'định danh tác nhân để xuống thang kháng sinh']],
    [/afb|xpert|mtb/, ['AFB dương tính', 'Xpert phát hiện MTB, không kháng rifampicin', 'AFB âm tính ba mẫu']],
    [/sot xuat huyet|ns1|dengue/, ['NS1 dương tính', 'IgM dương — nhiễm cấp']],
    [/tong phan tich nuoc tieu|can lang nuoc tieu/, ['bạch cầu niệu, nitrit dương — nhiễm trùng tiểu',
        'đạm niệu', 'hồng cầu niệu, trụ hồng cầu']],
    [/dam nieu|protein\/creatinin/, ['đạm niệu > 3,5 g/24h — ngưỡng thận hư']],
    [/choc do dich mang phoi|dich mang phoi/, ['dịch tiết theo tiêu chuẩn Light', 'dịch thấm — nghiêng về suy tim',
        'tế bào ác tính trong dịch', 'ADA tăng — nghĩ lao màng phổi']],
    [/dich mang bung|saag/, ['SAAG ≥ 1,1 — tăng áp cửa', 'bạch cầu đa nhân > 250/mm³ — viêm phúc mạc nhiễm khuẩn nguyên phát']],
    [/dich nao tuy/, ['bạch cầu tăng ưu thế neutrophil, đường giảm — viêm màng não mủ',
        'dịch trong, lympho ưu thế — nghĩ lao / siêu vi']],
    [/x-?quang nguc/, ['đông đặc thùy dưới phải', 'thâm nhiễm mô kẽ lan tỏa', 'tràn dịch màng phổi',
        'bóng tim to, chỉ số tim–ngực > 0,5', 'liềm hơi dưới hoành', 'phổi sáng, cơ hoành dẹt']],
    [/x-?quang bung/, ['mức nước hơi ruột non — tắc ruột', 'liềm hơi dưới hoành — thủng tạng rỗng']],
    [/x-?quang khop|x-?quang cot song|x-?quang chi/, ['đường gãy và mức độ di lệch', 'hẹp khe khớp, gai xương',
        'xẹp thân đốt sống']],
    [/sieu am bung/, ['sỏi túi mật, thành túi mật dày > 3 mm', 'giãn đường mật trong và ngoài gan',
        'gan thô, bờ không đều — xơ gan', 'dịch ổ bụng', 'ruột thừa to > 6 mm, không đè xẹp']],
    [/sieu am tim/, ['EF giảm', 'rối loạn vận động vùng', 'hở van hai lá mức độ nặng',
        'tràn dịch màng ngoài tim', 'áp lực động mạch phổi tăng']],
    [/sieu am doppler|abi|huyet ap tu chi/, ['huyết khối tĩnh mạch sâu chi dưới', 'mất tín hiệu dòng chảy động mạch',
        'ABI < 0,9 — bệnh động mạch chi dưới']],
    [/sieu am thai/, ['tuổi thai và cân nặng ước tính', 'tim thai, ngôi thai, vị trí bánh nhau',
        'chỉ số ối']],
    [/ct .*so nao|ct scan so/, ['xuất huyết não / máu tụ ngoài – dưới màng cứng', 'nhồi máu não, dấu ASPECTS',
        'không thấy tổn thương cấp — loại trừ xuất huyết']],
    [/ct .*nguc|\bcta\b|ct-?angio/, ['huyết khối động mạch phổi', 'khối u và mức độ xâm lấn',
        'bóc tách động mạch chủ']],
    [/ct .*bung|ct bung chau/, ['ổ áp xe', 'thoát mạch thuốc cản quang — đang chảy máu',
        'khối u và hạch di căn', 'tắc ruột và vị trí chuyển tiếp']],
    [/mri/, ['tổn thương chèn ép tủy', 'nhồi máu não trên chuỗi xung khuếch tán', 'tổn thương dây chằng – sụn chêm']],
    [/\becg\b|dien tam do|holter ecg/, ['ST chênh lên ở các chuyển đạo liên tiếp', 'rung nhĩ đáp ứng thất nhanh',
        'block nhĩ thất', 'sóng T cao nhọn — tăng kali máu', 'trục phải, dày thất phải']],
    [/holter huyet ap/, ['tăng huyết áp thật sự / tăng huyết áp áo choàng trắng', 'mất trũng huyết áp về đêm']],
    [/ho hap ky/, ['FEV1/FVC < 0,7 — tắc nghẽn cố định', 'test giãn phế quản dương tính — nghĩ hen']],
    [/noi soi da day|noi soi dai trang|noi soi phe quan/, ['ổ loét đang chảy máu, phân loại Forrest',
        'giãn tĩnh mạch thực quản', 'khối u sùi loét — bấm sinh thiết']],
    [/dien nao|dien co/, ['sóng động kinh khu trú', 'tổn thương thần kinh ngoại biên kiểu sợi trục / mất myelin']],
    [/sinh thiet|te bao hoc|giai phau benh|fna/, ['bản chất mô học và độ biệt hóa', 'tế bào ác tính',
        'viêm mạn, không thấy tế bào ác tính']],
    [/nhom mau|phan ung cheo|du tru mau/, ['định nhóm và dự trù đủ đơn vị máu cho cuộc mổ']],
    [/xet nghiem tien phau/, ['đủ điều kiện gây mê — không rối loạn đông máu, chức năng gan thận trong giới hạn']],
    [/phet mau ngoai bien|tuy do/, ['hồng cầu hình bia, mảnh vỡ hồng cầu', 'blast trong máu ngoại biên',
        'tủy giàu / nghèo tế bào, dòng nào bị lấn át']],
    [/dong mau toan bo|pt, aptt|fibrinogen|\bact\b/, ['INR kéo dài — suy tế bào gan',
        'aPTT kéo dài đơn độc', 'fibrinogen giảm — nghĩ đông máu nội mạch lan tỏa']],
    [/test coombs|dien di hemoglobin/, ['Coombs trực tiếp dương — tán huyết tự miễn',
        'tăng HbA2 — thể beta thalassemia']],
    [/ferritin|sat huyet thanh|vitamin b12|acid folic/, ['ferritin giảm — thiếu máu thiếu sắt',
        'ferritin tăng trong viêm', 'B12 / folate giảm — thiếu máu hồng cầu to']],
    [/bo mo mau|lipid/, ['LDL-C chưa đạt đích theo nguy cơ tim mạch', 'triglyceride rất cao — nguy cơ viêm tụy']],
    [/acid uric/, ['acid uric tăng — ủng hộ cơn gút cấp', 'acid uric bình thường vẫn không loại trừ được gút']],
    [/tuyen giap|tsh|ft4|cortisol/, ['TSH giảm, FT4 tăng — cường giáp',
        'TSH tăng — suy giáp', 'cortisol sáng thấp — suy thượng thận']],
    [/dien giai do|canxi|magie|phospho/, ['hạ natri máu và mức độ', 'hạ kali máu — giải thích yếu cơ / loạn nhịp',
        'hạ canxi máu ion hóa']],
    [/beta-?hcg/, ['beta-hCG dương — xác định có thai', 'beta-hCG không tăng gấp đôi sau 48 giờ — nghĩ thai ngoài tử cung']],
    [/\bafp\b|alpha-?fetoprotein/, ['AFP tăng cao — ủng hộ ung thư tế bào gan']],
    [/anti-?achr|acetylcholine/, ['kháng thể dương — ủng hộ nhược cơ']],
    [/myoglobin nieu/, ['myoglobin niệu và CK tăng — hội chứng tái tưới máu, nguy cơ suy thận cấp']],
    [/widal|weil-?felix|huyet thanh chan doan/, ['hiệu giá kháng thể tăng gấp 4 lần ở hai mẫu cách nhau']],
    [/hbsag|anti hcv|anti hiv|rpr|tpha/, ['HBsAg dương — viêm gan B',
        'Anti-HCV dương', 'HIV dương — cần khẳng định lại', 'huyết thanh giang mai dương']],
    [/pcr cum/, ['cúm A / B dương tính']],
    [/soi phan|ky sinh trung/, ['trứng / ấu trùng ký sinh trùng', 'hồng cầu, bạch cầu trong phân — lỵ']],
    [/dau ong dan luu|manh ghep mach mau/, ['mọc vi khuẩn — nhiễm trùng dụng cụ, phải rút / thay']],
    [/dich khop/, ['tinh thể urat hình kim — gút', 'bạch cầu > 50.000/mm³ — viêm khớp nhiễm khuẩn']],
    [/sieu am mang phoi|e-?fast|mang ngoai tim/, ['dịch màng phổi và lượng ước tính',
        'dịch tự do ổ bụng — FAST dương', 'dịch màng ngoài tim, dấu chèn ép tim']],
    [/sieu am tuyen giap/, ['nhân giáp, phân loại TIRADS']],
    [/ct mach vanh|\bdsa\b|chup mach so hoa/, ['hẹp động mạch vành và mức độ',
        'vị trí tổn thương mạch máu, chỉ định can thiệp']],
    [/pet-?ct|xa hinh xuong/, ['tổn thương tăng chuyển hóa — di căn xa', 'ổ tăng bắt xạ ở xương']],
    [/nghiem phap gang suc/, ['ST chênh xuống khi gắng sức — thiếu máu cơ tim']],
    [/spo2 qua dem/, ['chỉ số giảm bão hòa về đêm — nghĩ ngưng thở khi ngủ']],
    [/mat do xuong/, ['T-score ≤ −2,5 — loãng xương']],
    [/noi soi trung that/, ['hạch trung thất di căn — quyết định giai đoạn và khả năng mổ']],
    [/dung nap glucose/, ['đường huyết 2 giờ ≥ 11,1 mmol/L — đái tháo đường']],
    [/h\. ?pylori|hoi tho/, ['H. pylori dương — chỉ định phác đồ tiệt trừ']]
];
