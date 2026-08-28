// thuoc-data.js — thư viện thuốc thường dùng, xếp theo nhóm điều trị.
//
// Chọn một thuốc là máy điền sẵn hàm lượng – liều – số lần – đường dùng – giờ dùng
// theo cách kê phổ biến nhất, sinh viên chỉ sửa lại con số cho đúng bệnh nhân.
// Liều ở đây là liều người lớn tham khảo, KHÔNG thay cho tra cứu và chỉ định của thầy.

import { fold } from './tim-kiem.js';

/** [tên, hàm lượng, liều mỗi lần, số lần/ngày, đường dùng, giờ dùng] */
const t = (ten, hamLuong = '', lieu = '', soLan = '', duong = '', gio = '') =>
    ({ ten, hamLuong, lieu, soLan, duong, gio });

export const THUOC_NHOM = [
    {
        ten: 'Kháng sinh', icon: 'fa-shield-virus', items: [
            t('Ceftriaxone', '1 g', '1 lọ', '2', '(TMC)', '8h – 20h'),
            t('Cefotaxime', '1 g', '1 lọ', '3', '(TMC)', '6h – 14h – 22h'),
            t('Ceftazidime', '1 g', '1 lọ', '3', '(TMC)', '6h – 14h – 22h'),
            t('Cefazolin', '1 g', '1 lọ', '3', '(TMC)', '6h – 14h – 22h'),
            t('Cefuroxime', '500 mg', '1 viên', '2', '(u)', '8h – 20h'),
            t('Amoxicillin + Acid clavulanic', '1 g', '1 viên', '2', '(u)', '8h – 20h'),
            t('Ampicillin + Sulbactam', '1,5 g', '1 lọ', '3', '(TMC)', '6h – 14h – 22h'),
            t('Piperacillin + Tazobactam', '4,5 g', '1 lọ', '3', '(TTM)', '6h – 14h – 22h'),
            t('Meropenem', '1 g', '1 lọ', '3', '(TTM)', '6h – 14h – 22h'),
            t('Imipenem + Cilastatin', '500 mg', '1 lọ', '4', '(TTM)', '6h – 12h – 18h – 24h'),
            t('Levofloxacin', '750 mg', '1 chai', '1', '(TTM)', '10h'),
            t('Ciprofloxacin', '400 mg', '1 chai', '2', '(TTM)', '8h – 20h'),
            t('Azithromycin', '500 mg', '1 viên', '1', '(u)', '10h'),
            t('Clarithromycin', '500 mg', '1 viên', '2', '(u)', '8h – 20h'),
            t('Doxycycline', '100 mg', '1 viên', '2', '(u)', '8h – 20h'),
            t('Metronidazole', '500 mg', '1 chai', '3', '(TTM)', '6h – 14h – 22h'),
            t('Vancomycin', '1 g', '1 lọ', '2', '(TTM)', '8h – 20h'),
            t('Gentamicin', '80 mg', '1 ống', '1', '(TB)', '10h'),
            t('Amikacin', '500 mg', '1 lọ', '1', '(TTM)', '10h'),
            t('Clindamycin', '600 mg', '1 ống', '3', '(TTM)', '6h – 14h – 22h'),
            t('Trimethoprim + Sulfamethoxazole', '480 mg', '2 viên', '2', '(u)', '8h – 20h'),
            t('Fosfomycin', '3 g', '1 gói', '1', '(u)', '20h'),
            t('Thuốc chống lao phác đồ RHZE', 'theo cân nặng', '1 lần/ngày', '1', '(u)', 'lúc đói buổi sáng'),
            t('Acyclovir', '800 mg', '1 viên', '5', '(u)', 'cách 4 giờ, bỏ cữ đêm')
        ]
    },
    {
        ten: 'Giảm đau – hạ sốt – kháng viêm', icon: 'fa-pills', items: [
            t('Paracetamol', '500 mg', '1 viên', '3', '(u)', '8h – 14h – 20h'),
            t('Paracetamol truyền', '1 g/100 ml', '1 chai', '3', '(TTM)', '6h – 14h – 22h'),
            t('Ibuprofen', '400 mg', '1 viên', '3', '(u)', 'sau ăn'),
            t('Diclofenac', '75 mg', '1 ống', '1', '(TB)', '10h'),
            t('Meloxicam', '7,5 mg', '1 viên', '1', '(u)', 'sau ăn sáng'),
            t('Celecoxib', '200 mg', '1 viên', '1', '(u)', 'sau ăn sáng'),
            t('Tramadol', '50 mg', '1 viên', '2', '(u)', '8h – 20h'),
            t('Morphin', '10 mg', '1/2 ống', '', '(TDD)', 'khi đau nhiều'),
            t('Fentanyl', '0,1 mg', '1 ống', '', '(TMC)', 'khi đau nhiều'),
            t('Nefopam', '20 mg', '1 ống', '3', '(TTM)', '6h – 14h – 22h'),
            t('Prednisolone', '5 mg', '', '1', '(u)', 'sau ăn sáng'),
            t('Methylprednisolone', '40 mg', '1 lọ', '1', '(TMC)', '8h'),
            t('Dexamethasone', '4 mg', '1 ống', '1', '(TMC)', '8h')
        ]
    },
    {
        ten: 'Tim mạch – huyết áp', icon: 'fa-heart-pulse', items: [
            t('Amlodipine', '5 mg', '1 viên', '1', '(u)', '8h'),
            t('Nifedipine phóng thích chậm', '20 mg', '1 viên', '2', '(u)', '8h – 20h'),
            t('Enalapril', '5 mg', '1 viên', '2', '(u)', '8h – 20h'),
            t('Perindopril', '5 mg', '1 viên', '1', '(u)', '8h'),
            t('Losartan', '50 mg', '1 viên', '1', '(u)', '8h'),
            t('Telmisartan', '40 mg', '1 viên', '1', '(u)', '8h'),
            t('Bisoprolol', '2,5 mg', '1 viên', '1', '(u)', '8h'),
            t('Metoprolol', '50 mg', '1 viên', '2', '(u)', '8h – 20h'),
            t('Carvedilol', '6,25 mg', '1 viên', '2', '(u)', '8h – 20h'),
            t('Furosemide', '40 mg', '1 viên', '1', '(u)', '8h'),
            t('Furosemide tiêm', '20 mg', '1 ống', '2', '(TMC)', '8h – 16h'),
            t('Spironolactone', '25 mg', '1 viên', '1', '(u)', '8h'),
            t('Hydrochlorothiazide', '25 mg', '1 viên', '1', '(u)', '8h'),
            t('Digoxin', '0,25 mg', '1 viên', '1', '(u)', '8h'),
            t('Nitroglycerin', '', '', '', '(TTM)', 'chỉnh theo huyết áp'),
            t('Isosorbide mononitrate', '30 mg', '1 viên', '1', '(u)', '8h'),
            t('Noradrenaline', '', '', '', '(TTM qua BTĐ)', 'chỉnh theo huyết áp'),
            t('Dobutamine', '', '', '', '(TTM qua BTĐ)', 'chỉnh theo đáp ứng')
        ]
    },
    {
        ten: 'Chống đông – kháng kết tập', icon: 'fa-droplet', items: [
            t('Aspirin', '81 mg', '1 viên', '1', '(u)', 'sau ăn sáng'),
            t('Clopidogrel', '75 mg', '1 viên', '1', '(u)', '8h'),
            t('Enoxaparin', '40 mg', '1 bơm', '1', '(TDD)', '20h'),
            t('Heparin không phân đoạn', '', '', '', '(TTM qua BTĐ)', 'chỉnh theo aPTT'),
            t('Warfarin', '5 mg', '', '1', '(u)', '18h, chỉnh theo INR'),
            t('Rivaroxaban', '20 mg', '1 viên', '1', '(u)', 'sau ăn tối'),
            t('Atorvastatin', '20 mg', '1 viên', '1', '(u)', '20h'),
            t('Rosuvastatin', '10 mg', '1 viên', '1', '(u)', '20h')
        ]
    },
    {
        ten: 'Hô hấp', icon: 'fa-lungs', items: [
            t('Salbutamol khí dung', '5 mg/2,5 ml', '1 tép', '3', '(khí dung)', '6h – 14h – 22h'),
            t('Ipratropium khí dung', '0,5 mg', '1 tép', '3', '(khí dung)', '6h – 14h – 22h'),
            t('Budesonide khí dung', '0,5 mg', '1 tép', '2', '(khí dung)', '8h – 20h'),
            t('Salbutamol xịt', '100 mcg', '2 nhát', '', '(xịt họng)', 'khi khó thở'),
            t('Seretide xịt', '25/250 mcg', '2 nhát', '2', '(xịt họng)', '8h – 20h'),
            t('N-Acetylcystein', '200 mg', '1 gói', '3', '(u)', '8h – 14h – 20h'),
            t('Bromhexin', '8 mg', '1 viên', '3', '(u)', '8h – 14h – 20h'),
            t('Theophylline', '100 mg', '1 viên', '2', '(u)', '8h – 20h'),
            t('Oxy liệu pháp', '', '3 lít/phút', '', '(qua canula mũi)', 'liên tục')
        ]
    },
    {
        ten: 'Tiêu hóa – gan mật', icon: 'fa-bowl-food', items: [
            t('Omeprazole', '40 mg', '1 lọ', '2', '(TMC)', '8h – 20h'),
            t('Esomeprazole', '40 mg', '1 lọ', '1', '(TMC)', '8h'),
            t('Pantoprazole', '40 mg', '1 viên', '1', '(u)', 'trước ăn sáng 30 phút'),
            t('Domperidone', '10 mg', '1 viên', '3', '(u)', 'trước ăn 30 phút'),
            t('Metoclopramide', '10 mg', '1 ống', '3', '(TMC)', '6h – 14h – 22h'),
            t('Ondansetron', '8 mg', '1 ống', '2', '(TMC)', '8h – 20h'),
            t('Drotaverin (No-spa)', '40 mg', '1 ống', '2', '(TB)', 'khi đau'),
            t('Hyoscine butylbromide', '20 mg', '1 ống', '3', '(TMC)', 'khi đau'),
            t('Lactulose', '', '15 ml', '2', '(u)', '8h – 20h'),
            t('Silymarin', '140 mg', '1 viên', '3', '(u)', '8h – 14h – 20h'),
            t('Men vi sinh', '', '1 gói', '2', '(u)', '8h – 20h'),
            t('Oresol', '', '1 gói pha 1 lít', '', '(u)', 'uống thay nước'),
            t('Tenofovir 300 mg', '300 mg', '1 viên', '1', '(u)', '20h'),
            t('Entecavir 0,5 mg', '0,5 mg', '1 viên', '1', '(u)', 'xa bữa ăn 2 giờ')
        ]
    },
    {
        ten: 'Nội tiết – đái tháo đường', icon: 'fa-vial', items: [
            t('Metformin', '500 mg', '1 viên', '2', '(u)', 'sau ăn sáng – tối'),
            t('Gliclazide MR', '30 mg', '1 viên', '1', '(u)', 'trước ăn sáng'),
            t('Insulin Regular', '', '', '', '(TDD)', 'trước ăn 30 phút, chỉnh theo đường huyết'),
            t('Insulin NPH', '', '', '2', '(TDD)', 'trước ăn sáng – tối'),
            t('Insulin Glargine', '', '', '1', '(TDD)', '21h'),
            t('Insulin Mixtard 30/70', '', '', '2', '(TDD)', 'trước ăn sáng – tối 30 phút'),
            t('Levothyroxine', '50 mcg', '1 viên', '1', '(u)', 'lúc đói, trước ăn sáng 30 phút'),
            t('Thiamazole', '5 mg', '1 viên', '2', '(u)', '8h – 20h'),
            t('Allopurinol', '300 mg', '1 viên', '1', '(u)', 'sau ăn'),
            t('Colchicine', '1 mg', '1 viên', '1', '(u)', '20h'),
            t('Alendronat 70 mg (uống mỗi tuần)', '70 mg', '1 viên', '1 lần/tuần', '(u)', 'sáng đói, đứng 30 phút sau uống')
        ]
    },
    {
        ten: 'Dịch truyền – điện giải', icon: 'fa-flask', items: [
            t('NaCl 0,9%', '500 ml', '1 chai', '', '(TTM)', 'XX giọt/phút'),
            t('Lactate Ringer', '500 ml', '1 chai', '', '(TTM)', 'XX giọt/phút'),
            t('Glucose 5%', '500 ml', '1 chai', '', '(TTM)', 'XX giọt/phút'),
            t('Glucose 10%', '500 ml', '1 chai', '', '(TTM)', 'XX giọt/phút'),
            t('Kali clorid 10%', '10 ml', '1 ống', '', '(pha truyền)', 'pha trong 500 ml NaCl 0,9%'),
            t('Natri bicarbonat 8,4%', '50 ml', '', '', '(TTM)', 'theo khí máu'),
            t('Albumin 20%', '50 ml', '1 chai', '', '(TTM)', 'chậm'),
            t('Hồng cầu lắng', '', '1 đơn vị', '', '(TTM)', 'truyền chậm, theo dõi phản ứng')
        ]
    },
    {
        ten: 'Thần kinh – an thần', icon: 'fa-brain', items: [
            t('Diazepam', '10 mg', '1 ống', '', '(TMC)', 'khi co giật'),
            t('Midazolam', '5 mg', '1 ống', '', '(TMC)', 'theo chỉ định'),
            t('Phenytoin', '100 mg', '1 viên', '3', '(u)', '8h – 14h – 20h'),
            t('Levetiracetam', '500 mg', '1 viên', '2', '(u)', '8h – 20h'),
            t('Valproat natri', '500 mg', '1 viên', '2', '(u)', '8h – 20h'),
            t('Piracetam', '1 g', '1 ống', '2', '(TMC)', '8h – 20h'),
            t('Citicoline', '1 g', '1 ống', '1', '(TTM)', '8h'),
            t('Gabapentin', '300 mg', '1 viên', '3', '(u)', '8h – 14h – 20h'),
            t('Amitriptyline', '25 mg', '1 viên', '1', '(u)', '20h'),
            t('Mannitol 20%', '250 ml', '1 chai', '', '(TTM)', 'truyền nhanh 30 phút'),
            t('Levodopa + Carbidopa', '250/25 mg', '1 viên', '3', '(u)', 'xa bữa ăn đạm')
        ]
    },
    {
        ten: 'Sản – Nhi', icon: 'fa-baby', items: [
            t('Oxytocin', '5 UI', '1 ống', '', '(TTM)', 'pha 500 ml, chỉnh theo cơn co'),
            t('Magnesium sulfat 15%', '', '', '', '(TTM)', 'phác đồ tiền sản giật'),
            t('Nifedipine (giảm co)', '10 mg', '1 viên', '', '(u)', 'theo phác đồ'),
            t('Betamethasone', '12 mg', '1 ống', '1', '(TB)', 'cách 24 giờ, 2 liều'),
            t('Sắt + Acid folic', '', '1 viên', '1', '(u)', 'sau ăn sáng'),
            t('Paracetamol trẻ em', '', '15 mg/kg/lần', '4', '(u)', 'cách 6 giờ khi sốt'),
            t('Vitamin K1', '1 mg', '1 ống', '1', '(TB)', 'ngay sau sinh'),
            t('Kẽm', '', '20 mg', '1', '(u)', '10 – 14 ngày')
        ]
    },
    {
        ten: 'Khác', icon: 'fa-prescription-bottle-medical', items: [
            t('Vitamin B1 – B6 – B12', '', '1 viên', '2', '(u)', '8h – 20h'),
            t('Vitamin C', '500 mg', '1 viên', '1', '(u)', '8h'),
            t('Calci carbonat + Vitamin D3', '', '1 viên', '1', '(u)', 'sau ăn sáng'),
            t('Chlorpheniramine', '4 mg', '1 viên', '2', '(u)', '8h – 20h'),
            t('Loratadine', '10 mg', '1 viên', '1', '(u)', '20h'),
            t('Adrenaline', '1 mg', '1 ống', '', '(TB)', 'phác đồ sốc phản vệ'),
            t('Nước cất pha tiêm', '5 ml', '1 ống', '', '', 'pha thuốc'),
            t('Erythropoietin (tiêm dưới da)', '2000 UI', '1 lọ', '3 lần/tuần', '(TDD)', 'theo Hb đích'),
            t('Methotrexat 2,5 mg (uống mỗi tuần)', '2,5 mg', 'theo liều', '1 lần/tuần', '(u)', 'kèm acid folic ngày khác'),
            t('Tamsulosin 0,4 mg', '0,4 mg', '1 viên', '1', '(u)', 'sau ăn tối'),
            t('Dutasteride 0,5 mg', '0,5 mg', '1 viên', '1', '(u)', '8h')
        ]
    }
];

/** Tra một thuốc theo tên để lấy sẵn liều gợi ý */
export function findThuoc(ten) {
    const s = String(ten || '').trim().toLowerCase();
    if (!s) return null;
    for (const g of THUOC_NHOM) {
        const hit = g.items.find(x => x.ten.toLowerCase() === s);
        if (hit) return hit;
    }
    return null;
}

/** Dạng { ten, icon, items:[tên] } cho bảng chọn dùng chung */
export const THUOC_GROUPS = THUOC_NHOM.map(g => ({
    ten: g.ten, icon: g.icon, items: g.items.map(x => x.ten)
}));

/* =====================================================================
   Ghi chú an toàn thuốc — chống chỉ định, thận trọng theo eGFR, dị ứng.
   Đây là thông tin TĨNH của bản thân thuốc (đúng với mọi bệnh nhân), hiện
   ngay dưới dòng y lệnh để nhớ mà tra. Phần đối chiếu với tiền căn / eGFR
   của chính bệnh nhân do clinical-validator.js lo, không lặp ở đây.
   ===================================================================== */
/** [regex tên thuốc, { ccd, than, diUng }] */
export const THUOC_CANH_BAO = [
    [/amoxicillin|ampicillin|penicillin|piperacillin|oxacillin|cloxacillin|unasyn|augmentin/i, {
        diUng: 'Dị ứng nhóm Penicillin / beta-lactam — hỏi kỹ tiền căn nổi mề đay, phù mạch, phản vệ.',
        ccd: 'Tiền căn phản vệ với beta-lactam.',
        than: 'Giảm liều hoặc giãn khoảng cách khi eGFR < 30.'
    }],
    [/cefazolin|cephalexin|cefadroxil|cefuroxime/i, {
        diUng: 'Dị ứng chéo với Penicillin khoảng 1–3% (cao hơn ở thế hệ 1 do chuỗi bên tương tự).',
        than: 'Chỉnh liều khi eGFR < 30.'
    }],
    [/ceftriaxone|cefotaxime|ceftazidime|cefepime/i, {
        diUng: 'Dị ứng chéo Penicillin thấp; vẫn tránh nếu tiền căn phản vệ.',
        ccd: 'Ceftriaxone: không dùng chung đường truyền với dung dịch chứa canxi ở trẻ sơ sinh.',
        than: 'Ceftriaxone thải chủ yếu qua mật, ít cần chỉnh; Cefotaxime/Ceftazidime chỉnh theo eGFR.'
    }],
    [/levofloxacin|ciprofloxacin|moxifloxacin/i, {
        ccd: 'Trẻ em đang lớn, thai kỳ, tiền căn viêm gân do quinolone, nhược cơ.',
        than: 'Kéo dài QT; chỉnh liều khi eGFR < 50 (trừ Moxifloxacin).'
    }],
    [/gentamicin|amikacin|tobramycin/i, {
        ccd: 'Nhược cơ, tiền căn độc tai do aminoglycoside.',
        than: 'Độc thận và độc tai — chỉnh liều theo eGFR, theo dõi creatinin và nồng độ đáy.'
    }],
    [/vancomycin/i, {
        than: 'Chỉnh liều theo eGFR, theo dõi nồng độ đáy 15–20 µg/mL; truyền chậm tránh hội chứng người đỏ.'
    }],
    [/metronidazole/i, {
        ccd: 'Ba tháng đầu thai kỳ (cân nhắc).',
        than: 'Kiêng rượu trong và 48 giờ sau dùng (phản ứng kiểu disulfiram).'
    }],
    [/ibuprofen|diclofenac|meloxicam|naproxen|ketorolac|piroxicam|celecoxib/i, {
        ccd: 'Loét dạ dày – tá tràng đang hoạt động, xuất huyết tiêu hóa, suy tim mất bù, ba tháng cuối thai kỳ, hen do aspirin.',
        than: 'Chống chỉ định khi eGFR < 30; tránh khi eGFR < 60 hoặc đang dùng lợi tiểu + ƯCMC.',
        diUng: 'Dị ứng chéo trong nhóm NSAID và với aspirin.'
    }],
    [/aspirin/i, {
        ccd: 'Xuất huyết đang tiến triển, trẻ < 16 tuổi đang nhiễm siêu vi (hội chứng Reye).',
        than: 'Tránh liều kháng viêm khi eGFR < 30.'
    }],
    [/paracetamol|acetaminophen/i, {
        ccd: 'Suy gan nặng.',
        than: 'Không quá 3 g/ngày ở người suy gan, nghiện rượu hoặc suy kiệt.'
    }],
    [/methylprednisolon|prednisolon|prednison|dexamethason|hydrocortison/i, {
        ccd: 'Nhiễm nấm toàn thân, nhiễm trùng chưa kiểm soát, loét dạ dày đang hoạt động (nếu buộc dùng phải kèm PPI).',
        than: 'Tăng đường huyết, giữ muối nước, loãng xương khi dùng kéo dài; giảm liều dần khi ngưng.'
    }],
    [/metformin/i, {
        ccd: 'eGFR < 30, toan chuyển hóa cấp, suy gan nặng, tình trạng giảm tưới máu mô.',
        than: 'Ngưng trước chụp cản quang 48 giờ; giảm liều khi eGFR 30–45.'
    }],
    [/insulin/i, {
        than: 'Nguy cơ hạ đường huyết tăng khi eGFR giảm — cần giảm liều và theo dõi đường huyết sát.'
    }],
    [/gliclazid|glimepirid|glibenclamid/i, {
        ccd: 'Đái tháo đường type 1, nhiễm toan ceton, suy gan – suy thận nặng.',
        than: 'Nguy cơ hạ đường huyết kéo dài ở người già và khi eGFR < 30.'
    }],
    [/enalapril|captopril|lisinopril|perindopril|ramipril/i, {
        ccd: 'Thai kỳ, tiền căn phù mạch do ƯCMC, hẹp động mạch thận hai bên, Kali > 5,5 mmol/L.',
        than: 'Kiểm tra creatinin và Kali sau 1–2 tuần; creatinin tăng > 30% thì ngưng.'
    }],
    [/losartan|valsartan|telmisartan|irbesartan/i, {
        ccd: 'Thai kỳ, hẹp động mạch thận hai bên, tăng Kali máu.',
        than: 'Không phối hợp cùng lúc với ƯCMC; theo dõi Kali và creatinin.'
    }],
    [/propranolol|nadolol/i, {
        ccd: 'Hen phế quản, COPD co thắt, block nhĩ thất độ 2–3, nhịp chậm < 50, sốc tim.',
        than: 'Không ngưng đột ngột (nguy cơ cơn đau thắt ngực dội ngược).'
    }],
    [/bisoprolol|metoprolol|nebivolol|carvedilol/i, {
        ccd: 'Block nhĩ thất độ 2–3, nhịp chậm nặng, suy tim mất bù đang sung huyết nặng.',
        than: 'Chọn lọc β1 nên dùng được ở COPD nếu liều thấp, vẫn theo dõi co thắt phế quản.'
    }],
    [/amlodipin|nifedipin|felodipin/i, {
        than: 'Phù mắt cá chân phụ thuộc liều; Nifedipine tác dụng nhanh không dùng cho cơn tăng huyết áp.'
    }],
    [/furosemid|spironolacton|hydrochlorothiazid|indapamid/i, {
        ccd: 'Spironolactone: Kali > 5,5 mmol/L, suy thận nặng.',
        than: 'Theo dõi ion đồ và chức năng thận; Thiazide kém hiệu quả khi eGFR < 30.'
    }],
    [/warfarin|acenocoumarol|sintrom/i, {
        ccd: 'Xuất huyết đang tiến triển, thai kỳ, tuân thủ kém không theo dõi được INR.',
        than: 'Rất nhiều tương tác (kháng sinh, NSAID, thức ăn nhiều vitamin K) — theo dõi INR.'
    }],
    [/rivaroxaban|apixaban|dabigatran/i, {
        ccd: 'Xuất huyết đang tiến triển, van tim cơ học, hội chứng kháng phospholipid.',
        than: 'Chỉnh liều theo eGFR; Dabigatran chống chỉ định khi eGFR < 30.'
    }],
    [/clopidogrel|ticagrelor/i, {
        ccd: 'Xuất huyết đang tiến triển, xuất huyết nội sọ.',
        than: 'Ngưng trước phẫu thuật chương trình 5–7 ngày.'
    }],
    [/omeprazol|pantoprazol|esomeprazol|rabeprazol|lansoprazol/i, {
        than: 'Dùng kéo dài gây thiếu B12, hạ magie, tăng nguy cơ nhiễm C. difficile và gãy xương.'
    }],
    [/tramadol|morphin|fentanyl|pethidin/i, {
        ccd: 'Suy hô hấp chưa kiểm soát, đang dùng IMAO (Tramadol), tăng áp lực nội sọ chưa đánh giá.',
        than: 'Giảm liều khi eGFR < 30 và ở người già; theo dõi tri giác – nhịp thở.'
    }],
    [/allopurinol|colchicin/i, {
        ccd: 'Colchicine: suy gan và suy thận nặng phối hợp.',
        than: 'Cả hai đều phải giảm liều theo eGFR; Allopurinol có nguy cơ hội chứng quá mẫn (HLA-B*58:01).'
    }],
    [/statin|atorvastatin|rosuvastatin|simvastatin/i, {
        ccd: 'Bệnh gan hoạt động, thai kỳ và cho con bú.',
        than: 'Theo dõi men gan và CK khi có đau cơ; giảm liều Rosuvastatin khi eGFR < 30.'
    }],
    [/salbutamol|terbutalin/i, {
        than: 'Gây run tay, nhịp nhanh, hạ Kali máu khi dùng liều cao lặp lại.'
    }],
    [/adrenaline|epinephrin/i, {
        than: 'Trong phản vệ không có chống chỉ định tuyệt đối — tiêm bắp mặt trước ngoài đùi 0,5 mg ngay.'
    }]
];

/** Ghi chú an toàn của một thuốc: { ccd, than, diUng } — rỗng nếu chưa có trong bảng */
export function canhBaoThuoc(ten) {
    const hit = THUOC_CANH_BAO.find(([re]) => re.test(String(ten || '')));
    return hit ? hit[1] : null;
}

/* =====================================================================
   Bệnh nền ↔ thuốc đang dùng ở nhà.
   Bệnh án là một thể thống nhất: đã khai "tăng huyết áp 10 năm" thì phải có
   thuốc huyết áp; ngược lại thấy Metformin trong toa cũ mà tiền căn trống
   là đã bỏ sót một bệnh nền. Bảng này chạy cả hai chiều:
     thuocTheoBenh(tên bệnh) -> gợi thuốc để bấm thêm
     benhCuaThuoc(tên thuốc) -> bệnh mà thuốc đó ám chỉ
   Tên thuốc trùng với THUOC_NHOM ở trên thì findThuoc() điền luôn liều.
   ===================================================================== */
/** { benh: nhãn hiện ra, re: dò tên bệnh đã khai (chữ không dấu), thuoc: [tên thuốc],
      capTinh: bộ y lệnh của một mặt bệnh cấp — chỉ gợi ý xuôi (bệnh -> thuốc),
      không dùng để đoán ngược (thuốc -> bệnh nền), vì Ceftriaxone trong toa
      không có nghĩa bệnh nhân "có tiền căn viêm phổi". } */
export const THUOC_THEO_BENH = [
    /* ---------- Mặt bệnh cấp: bộ y lệnh mẫu cho chẩn đoán đợt này ----------
       Xếp trước nhóm bệnh mạn vì dò theo thứ tự, cái khớp đầu tiên thắng.
       Trong nhóm này cũng xếp cái hẹp trước cái rộng (viêm phổi bệnh viện
       trước viêm phổi cộng đồng). Liều lấy từ THUOC_NHOM — vẫn phải tra lại. */
    { benh: 'Viêm phổi bệnh viện – thở máy', capTinh: 1, re: /viem phoi benh vien|viem phoi tho may|\bvap\b|^(?!.*ho hap).*\bhap\b/, thuoc: ['Piperacillin + Tazobactam', 'Meropenem', 'Vancomycin', 'Levofloxacin', 'Oxy liệu pháp'] },
    { benh: 'Viêm phổi cộng đồng', capTinh: 1, re: /viem phoi cong dong|\bvpcd\b|viem phoi thuy|viem phe quan phoi|viem phoi/, thuoc: ['Ceftriaxone', 'Azithromycin', 'Paracetamol', 'N-Acetylcystein', 'Oxy liệu pháp', 'NaCl 0,9%'] },
    { benh: 'Đợt cấp COPD', capTinh: 1, re: /dot cap copd|copd dot cap|dot cap benh phoi tac nghen/, thuoc: ['Salbutamol khí dung', 'Ipratropium khí dung', 'Methylprednisolone', 'Ceftriaxone', 'Oxy liệu pháp', 'N-Acetylcystein'] },
    { benh: 'Cơn hen phế quản cấp', capTinh: 1, re: /con hen|hen cap|con kich phat hen/, thuoc: ['Salbutamol khí dung', 'Ipratropium khí dung', 'Methylprednisolone', 'Oxy liệu pháp'] },
    { benh: 'Hội chứng vành cấp – nhồi máu cơ tim cấp', capTinh: 1, re: /hoi chung vanh cap|nhoi mau co tim cap|\bstemi\b|\bnstemi\b|dau that nguc khong on dinh/, thuoc: ['Aspirin', 'Clopidogrel', 'Enoxaparin', 'Atorvastatin', 'Bisoprolol', 'Nitroglycerin', 'Morphin'] },
    { benh: 'Suy tim cấp – phù phổi cấp', capTinh: 1, re: /suy tim cap|phu phoi cap|dot cap suy tim|suy tim mat bu/, thuoc: ['Furosemide tiêm', 'Nitroglycerin', 'Oxy liệu pháp', 'Dobutamine'] },
    { benh: 'Nhồi máu não cấp', capTinh: 1, re: /nhoi mau nao cap|dot quy nhoi mau|dot quy thieu mau/, thuoc: ['Aspirin', 'Atorvastatin', 'Citicoline', 'NaCl 0,9%'] },
    { benh: 'Xuất huyết não', capTinh: 1, re: /xuat huyet nao|xuat huyet noi so/, thuoc: ['Mannitol 20%', 'Paracetamol', 'NaCl 0,9%', 'Oxy liệu pháp'] },
    { benh: 'Nhiễm khuẩn huyết – sốc nhiễm khuẩn', capTinh: 1, re: /soc nhiem khuan|nhiem khuan huyet|nhiem trung huyet|\bsepsis\b/, thuoc: ['Lactate Ringer', 'Noradrenaline', 'Meropenem', 'Vancomycin', 'Paracetamol'] },
    { benh: 'Nhiễm khuẩn tiết niệu – viêm đài bể thận', capTinh: 1, re: /nhiem trung tieu(?! hoa)|nhiem khuan tiet nieu|viem dai be than|viem bang quang/, thuoc: ['Ceftriaxone', 'Ciprofloxacin', 'Paracetamol', 'NaCl 0,9%'] },
    { benh: 'Viêm ruột thừa cấp', capTinh: 1, re: /viem ruot thua/, thuoc: ['Ceftriaxone', 'Metronidazole', 'Paracetamol', 'Lactate Ringer'] },
    { benh: 'Viêm tụy cấp', capTinh: 1, re: /viem tuy cap/, thuoc: ['Lactate Ringer', 'Paracetamol', 'Pantoprazole', 'Ondansetron', 'Hyoscine butylbromide'] },
    { benh: 'Xuất huyết tiêu hóa trên', capTinh: 1, re: /xuat huyet tieu hoa|\bxhth\b|non ra mau|di cau phan den/, thuoc: ['Esomeprazole', 'NaCl 0,9%', 'Hồng cầu lắng', 'Ondansetron'] },
    { benh: 'Xơ gan mất bù – bệnh não gan', capTinh: 1, re: /hon me gan|benh nao gan|xo gan mat bu|nhiem trung dich bang/, thuoc: ['Lactulose', 'Albumin 20%', 'Spironolactone', 'Furosemide', 'Ceftriaxone'] },
    { benh: 'Sốt xuất huyết Dengue', capTinh: 1, re: /sot xuat huyet|dengue/, thuoc: ['Paracetamol', 'Lactate Ringer', 'Oresol', 'NaCl 0,9%'] },
    { benh: 'Tiêu chảy cấp – nhiễm trùng tiêu hóa', capTinh: 1, re: /tieu chay cap|nhiem trung tieu hoa|viem da day ruot/, thuoc: ['Oresol', 'Men vi sinh', 'Ciprofloxacin', 'Kẽm', 'Lactate Ringer'] },
    { benh: 'Nhiễm toan ceton do đái tháo đường', capTinh: 1, re: /nhiem toan ceton|toan ceton|\bdka\b/, thuoc: ['NaCl 0,9%', 'Insulin Regular', 'Kali clorid 10%', 'Glucose 5%'] },
    { benh: 'Cơn tăng huyết áp cấp cứu', capTinh: 1, re: /con tang huyet ap|tang huyet ap cap cuu|tang huyet ap khan cap/, thuoc: ['Nitroglycerin', 'Furosemide tiêm', 'Amlodipine'] },
    { benh: 'Sốc phản vệ', capTinh: 1, re: /soc phan ve|phan ve/, thuoc: ['Adrenaline', 'Methylprednisolone', 'Chlorpheniramine', 'NaCl 0,9%', 'Oxy liệu pháp'] },
    { benh: 'Trạng thái động kinh – cơn co giật', capTinh: 1, re: /trang thai dong kinh|con co giat/, thuoc: ['Diazepam', 'Levetiracetam', 'Phenytoin'] },

    /* ---------- Bệnh nền mạn tính: dò xuôi lẫn ngược ---------- */
    { benh: 'Tăng huyết áp', re: /tang huyet ap|\btha\b|cao huyet ap/, thuoc: ['Amlodipine', 'Losartan', 'Telmisartan', 'Perindopril', 'Bisoprolol', 'Hydrochlorothiazide'] },
    { benh: 'Đái tháo đường type 2', re: /dai thao duong type 2|dai thao duong typ 2|\bdtd\b type 2|tieu duong/, thuoc: ['Metformin', 'Gliclazide MR', 'Insulin Mixtard 30/70', 'Insulin Glargine'] },
    { benh: 'Đái tháo đường type 1', re: /dai thao duong type 1|dai thao duong typ 1/, thuoc: ['Insulin Glargine', 'Insulin Regular'] },
    { benh: 'Rối loạn lipid máu', re: /roi loan lipid|roi loan mo mau|tang cholesterol|tang mo mau/, thuoc: ['Atorvastatin', 'Rosuvastatin'] },
    { benh: 'Bệnh mạch vành', re: /mach vanh|nhoi mau co tim|dat stent|dau that nguc|bac cau mach vanh/, thuoc: ['Aspirin', 'Clopidogrel', 'Atorvastatin', 'Bisoprolol', 'Isosorbide mononitrate'] },
    { benh: 'Suy tim', re: /suy tim|benh co tim gian/, thuoc: ['Furosemide', 'Spironolactone', 'Bisoprolol', 'Perindopril', 'Digoxin'] },
    { benh: 'Rung nhĩ', re: /rung nhi|cuong nhi/, thuoc: ['Rivaroxaban', 'Warfarin', 'Bisoprolol', 'Digoxin'] },
    { benh: 'Van tim nhân tạo', re: /thay van tim|van tim co hoc|van tim hau thap/, thuoc: ['Warfarin'] },
    { benh: 'Huyết khối tĩnh mạch – thuyên tắc phổi', re: /huyet khoi tinh mach|thuyen tac phoi/, thuoc: ['Rivaroxaban', 'Enoxaparin'] },
    { benh: 'Di chứng tai biến mạch máu não', re: /tai bien mach mau nao|nhoi mau nao|dot quy|di chung liet/, thuoc: ['Aspirin', 'Clopidogrel', 'Atorvastatin'] },
    { benh: 'Bệnh phổi tắc nghẽn mạn tính (COPD)', re: /copd|phoi tac nghen/, thuoc: ['Seretide xịt', 'Salbutamol xịt', 'Ipratropium khí dung', 'N-Acetylcystein'] },
    { benh: 'Hen phế quản', re: /hen phe quan|\bhen\b/, thuoc: ['Seretide xịt', 'Salbutamol xịt', 'Budesonide khí dung'] },
    { benh: 'Lao phổi', re: /\blao\b(?! (suy|hoa|khoa))|lao phoi|lao mang phoi/, thuoc: ['Thuốc chống lao phác đồ RHZE', 'Vitamin B1 – B6 – B12'] },
    { benh: 'Loét dạ dày – tá tràng / trào ngược', re: /loet da day|loet ta trang|trao nguoc|viem da day/, thuoc: ['Pantoprazole', 'Domperidone'] },
    { benh: 'Xơ gan', re: /xo gan|co truong/, thuoc: ['Spironolactone', 'Furosemide', 'Lactulose', 'Silymarin'] },
    { benh: 'Viêm gan B – C mạn', re: /viem gan b|viem gan c/, thuoc: ['Tenofovir 300 mg', 'Entecavir 0,5 mg'] },
    { benh: 'Bệnh thận mạn', re: /benh than man|suy than|chay than|loc mau/, thuoc: ['Furosemide', 'Calci carbonat + Vitamin D3', 'Sắt + Acid folic', 'Erythropoietin (tiêm dưới da)'] },
    { benh: 'Gout', re: /\bgout\b|gut\b|tang acid uric/, thuoc: ['Allopurinol', 'Colchicine'] },
    { benh: 'Suy giáp', re: /suy giap/, thuoc: ['Levothyroxine'] },
    { benh: 'Cường giáp – Basedow', re: /cuong giap|basedow/, thuoc: ['Thiamazole', 'Bisoprolol'] },
    { benh: 'Động kinh', re: /dong kinh/, thuoc: ['Levetiracetam', 'Valproat natri', 'Phenytoin'] },
    { benh: 'Bệnh Parkinson', re: /parkinson/, thuoc: ['Levodopa + Carbidopa'] },
    { benh: 'Loãng xương', re: /loang xuong/, thuoc: ['Calci carbonat + Vitamin D3', 'Alendronat 70 mg (uống mỗi tuần)'] },
    { benh: 'Thiếu máu thiếu sắt', re: /thieu mau thieu sat|thieu mau man/, thuoc: ['Sắt + Acid folic'] },
    { benh: 'Viêm khớp dạng thấp – lupus', re: /viem khop dang thap|lupus|thoai hoa khop/, thuoc: ['Methotrexat 2,5 mg (uống mỗi tuần)', 'Prednisolone', 'Meloxicam'] },
    { benh: 'Tăng sinh lành tính tuyến tiền liệt', re: /tuyen tien liet/, thuoc: ['Tamsulosin 0,4 mg', 'Dutasteride 0,5 mg'] },
    { benh: 'Bệnh thần kinh ngoại biên do đái tháo đường', re: /than kinh ngoai bien|dau than kinh/, thuoc: ['Gabapentin', 'Vitamin B1 – B6 – B12'] },
    { benh: 'Hội chứng thận hư', re: /thanh hu|than hu/, thuoc: ['Prednisolone', 'Furosemide'] },
    { benh: 'Mày đay – viêm mũi dị ứng', re: /may day|viem mui di ung|di ung man/, thuoc: ['Loratadine', 'Chlorpheniramine'] }
];

/** Thuốc thường dùng cho một bệnh nền đã khai — [] nếu chưa có trong bảng */
export function thuocTheoBenh(tenBenh) {
    const s = fold(tenBenh);
    if (!s) return [];
    const hit = THUOC_THEO_BENH.find(x => x.re.test(s));
    return hit ? hit.thuoc.slice() : [];
}

/** Các bệnh nền mà một thuốc ám chỉ — nhãn đầu tiên là khả năng thường gặp nhất */
export function benhCuaThuoc(tenThuoc) {
    // So bằng chữ đầu tiên: người dùng hay gõ kèm hàm lượng ("Amlodipin 5mg")
    const s = fold(tenThuoc).replace(/[^a-z0-9 ]/g, ' ').trim().split(' ')[0];
    if (s.length < 4) return [];
    return THUOC_THEO_BENH
        .filter(x => !x.capTinh)
        .filter(x => x.thuoc.some(t => fold(t).startsWith(s) || s.startsWith(fold(t).split(' ')[0])))
        .map(x => x.benh);
}

/* ---------------------------------------------------------------------------
   Bổ sung 2026-08-28 — bộ y lệnh mẫu cho các mặt bệnh đã có tiêu chuẩn chẩn đoán
   nhưng chưa có phác đồ, nên gõ chẩn đoán xong bảng y lệnh không gợi được gì.

   Dùng `push` chứ KHÔNG `unshift`: `thuocTheoBenh()` lấy mẫu khớp ĐẦU TIÊN, nên
   thêm vào cuối thì 49 mặt bệnh cũ vẫn giữ nguyên thứ tự ưu tiên. Trong chính
   khối này thì vẫn xếp mẫu hẹp trước mẫu rộng.

   Chỉ được dùng tên thuốc có trong THUOC_NHOM — tên lạ thì chip vẫn thêm được
   dòng nhưng không có liều, để lại một dòng trống trong y lệnh.
   --------------------------------------------------------------------------- */
THUOC_THEO_BENH.push(
    /* ---------- Gan mật – tiêu hóa ---------- */
    { benh: 'Viêm đường mật cấp', capTinh: 1, re: /viem duong mat/, thuoc: ['Ceftriaxone', 'Metronidazole', 'Paracetamol truyền', 'Lactate Ringer', 'Ondansetron', 'Pantoprazole'] },
    { benh: 'Viêm túi mật cấp', capTinh: 1, re: /viem tui mat/, thuoc: ['Ceftriaxone', 'Metronidazole', 'Paracetamol', 'Drotaverin (No-spa)', 'NaCl 0,9%', 'Ondansetron'] },
    { benh: 'Áp xe gan', capTinh: 1, re: /ap xe gan/, thuoc: ['Ceftriaxone', 'Metronidazole', 'Paracetamol', 'NaCl 0,9%'] },
    { benh: 'Đợt cấp viêm loét đại tràng – Crohn', capTinh: 1, re: /viem loet dai trang|crohn/, thuoc: ['Methylprednisolone', 'Men vi sinh', 'Paracetamol', 'NaCl 0,9%', 'Methotrexat 2,5 mg (uống mỗi tuần)'] },
    { benh: 'Bệnh gan do rượu', capTinh: 0, re: /gan do ruou/, thuoc: ['Vitamin B1 – B6 – B12', 'Silymarin', 'Glucose 10%', 'Lactulose', 'Methylprednisolone'] },
    { benh: 'Gan nhiễm mỡ không do rượu', capTinh: 0, re: /gan nhiem mo|nafld|masld/, thuoc: ['Atorvastatin', 'Metformin', 'Silymarin'] },
    { benh: 'Trĩ – nứt kẽ hậu môn', capTinh: 0, re: /benh tri|tri noi|tri ngoai|nut ke hau mon/, thuoc: ['Lactulose', 'Paracetamol', 'Diclofenac'] },
    { benh: 'Hội chứng ruột kích thích', capTinh: 0, re: /ruot kich thich|\bibs\b/, thuoc: ['Drotaverin (No-spa)', 'Hyoscine butylbromide', 'Men vi sinh'] },

    /* ---------- Nhiễm ---------- */
    { benh: 'Thương hàn', capTinh: 1, re: /thuong han/, thuoc: ['Ceftriaxone', 'Paracetamol', 'Oresol', 'NaCl 0,9%'] },
    { benh: 'Leptospirosis', capTinh: 1, re: /leptospir|xoan khuan vang da/, thuoc: ['Ceftriaxone', 'Doxycycline', 'NaCl 0,9%', 'Paracetamol'] },
    { benh: 'COVID-19', capTinh: 1, re: /covid/, thuoc: ['Oxy liệu pháp', 'Dexamethasone', 'Enoxaparin', 'Paracetamol'] },
    { benh: 'Cúm mùa', capTinh: 1, re: /cum mua|\bcum a\b|\bcum b\b/, thuoc: ['Paracetamol', 'Oresol', 'N-Acetylcystein'] },
    { benh: 'Thủy đậu', capTinh: 1, re: /thuy dau|trai ra/, thuoc: ['Acyclovir', 'Paracetamol', 'Chlorpheniramine'] },
    { benh: 'Zona', capTinh: 1, re: /\bzona\b|gioi leo|herpes zoster/, thuoc: ['Acyclovir', 'Paracetamol', 'Gabapentin'] },
    { benh: 'Sởi', capTinh: 1, re: /^(?!.*soi (nieu|than|mat|tui mat|ong mat|bang quang|duong mat))(?=.*\bsoi\b)/, thuoc: ['Paracetamol', 'Oresol', 'Vitamin C', 'Amoxicillin + Acid clavulanic'] },
    { benh: 'Quai bị', capTinh: 1, re: /quai bi/, thuoc: ['Paracetamol', 'Ibuprofen'] },
        { benh: 'Viêm mô tế bào – nhọt – áp xe phần mềm', capTinh: 1,
      /* Chan truoc roi moi khop: "nhot" cung la "nhốt" (phoi bi nhot) va
         "choc" cung la "chọc" (choc do) sau khi bo dau. Guard phai bao ca mau,
         de rieng mot nhanh alternation thi cac nhanh kia van khop duoc. */
      re: /^(?!.*bi nhot)(?!.*choc (do|hut|dich|thao))(?=.*(viem mo te bao|\bnhot\b|hau boi|ap xe phan mem|\bchoc\b))/,
      thuoc: ['Cefazolin', 'Clindamycin', 'Paracetamol', 'NaCl 0,9%'] },

    /* ---------- Hô hấp ---------- */
    { benh: 'Áp xe phổi', capTinh: 1, re: /ap xe phoi/, thuoc: ['Ampicillin + Sulbactam', 'Clindamycin', 'Metronidazole', 'Paracetamol', 'N-Acetylcystein', 'Oxy liệu pháp'] },
    { benh: 'Đợt bội nhiễm giãn phế quản', capTinh: 1, re: /gian phe quan/, thuoc: ['Amoxicillin + Acid clavulanic', 'N-Acetylcystein', 'Salbutamol khí dung', 'Oxy liệu pháp'] },
    { benh: 'Viêm phế quản cấp', capTinh: 1, re: /viem phe quan cap/, thuoc: ['Paracetamol', 'N-Acetylcystein', 'Bromhexin'] },
    { benh: 'Bệnh phổi mô kẽ – xơ phổi', capTinh: 0, re: /xo phoi mo ke|benh phoi mo ke|\bild\b/, thuoc: ['Oxy liệu pháp', 'Prednisolone', 'N-Acetylcystein'] },

    /* ---------- Tim mạch – mạch máu ---------- */
    { benh: 'Viêm màng ngoài tim', capTinh: 1, re: /viem mang ngoai tim/, thuoc: ['Ibuprofen', 'Colchicine', 'Paracetamol'] },
    { benh: 'Bệnh van hai lá hậu thấp', capTinh: 0, re: /van hai la hau thap/, thuoc: ['Furosemide', 'Bisoprolol', 'Warfarin', 'Digoxin'] },
    { benh: 'Thiếu máu chi cấp – huyết khối động mạch chi', capTinh: 1, re: /thieu mau chi|huyet khoi dong mach chi|thuyen tac dong mach chi/, thuoc: ['Heparin không phân đoạn', 'Morphin', 'NaCl 0,9%', 'Paracetamol'] },
    { benh: 'Bệnh động mạch chi dưới – Buerger', capTinh: 0, re: /buerger|viem tac mach mau|dong mach chi duoi|leriche/, thuoc: ['Aspirin', 'Atorvastatin', 'Paracetamol'] },
    { benh: 'Hẹp động mạch cảnh', capTinh: 0, re: /hep dong mach canh/, thuoc: ['Aspirin', 'Clopidogrel', 'Atorvastatin'] },

    /* ---------- Thận – tiết niệu ---------- */
    { benh: 'Cơn đau quặn thận – sỏi niệu quản', capTinh: 1, re: /soi nieu quan|con dau quan than|soi than/, thuoc: ['Diclofenac', 'Drotaverin (No-spa)', 'Tamsulosin 0,4 mg', 'NaCl 0,9%', 'Paracetamol'] },
    { benh: 'Thận ứ nước nhiễm trùng', capTinh: 1, re: /than u nuoc|u mu than/, thuoc: ['Ceftriaxone', 'NaCl 0,9%', 'Paracetamol'] },
    { benh: 'Sỏi bàng quang', capTinh: 0, re: /soi bang quang/, thuoc: ['Tamsulosin 0,4 mg', 'Paracetamol'] },

    /* ---------- Sản – phụ khoa ---------- */
    { benh: 'Dọa sinh non', capTinh: 1, re: /doa sinh non|sinh non/, thuoc: ['Nifedipine (giảm co)', 'Betamethasone', 'Magnesium sulfat 15%'] },
    { benh: 'Ối vỡ non – ối vỡ sớm', capTinh: 1, re: /oi vo non|oi vo som/, thuoc: ['Ampicillin + Sulbactam', 'Azithromycin', 'Betamethasone'] },
    { benh: 'Viêm vùng chậu', capTinh: 1, re: /viem vung chau|viem phan phu/, thuoc: ['Ceftriaxone', 'Doxycycline', 'Metronidazole', 'Paracetamol'] },
    { benh: 'Viêm âm đạo', capTinh: 0, re: /viem am dao/, thuoc: ['Metronidazole'] },
    { benh: 'Sảy thai – thai lưu', capTinh: 1, re: /say thai|thai luu|thai trung/, thuoc: ['Oxytocin', 'NaCl 0,9%', 'Paracetamol', 'Hồng cầu lắng'] },
    { benh: 'Nhau tiền đạo', capTinh: 1, re: /nhau tien dao/, thuoc: ['Betamethasone', 'NaCl 0,9%', 'Hồng cầu lắng', 'Lactate Ringer'] },

    /* ---------- Thần kinh – tâm thần ---------- */
    { benh: 'Viêm não', capTinh: 1, re: /viem nao/, thuoc: ['Acyclovir', 'Ceftriaxone', 'Mannitol 20%', 'Levetiracetam', 'Paracetamol'] },
    { benh: 'Hội chứng Guillain–Barré', capTinh: 1, re: /guillain|viem da re day than kinh/, thuoc: ['Enoxaparin', 'Paracetamol', 'Gabapentin', 'NaCl 0,9%'] },
    { benh: 'Liệt dây VII ngoại biên', capTinh: 1, re: /liet day vii|liet mat ngoai bien|\bbell\b/, thuoc: ['Prednisolone', 'Acyclovir', 'Vitamin B1 – B6 – B12'] },
    { benh: 'Hội chứng cai rượu – sảng rượu', capTinh: 1, re: /cai ruou|sang ruou|delirium tremens/, thuoc: ['Diazepam', 'Vitamin B1 – B6 – B12', 'Glucose 10%', 'NaCl 0,9%', 'Midazolam'] },
    { benh: 'Sa sút trí tuệ', capTinh: 0, re: /sa sut tri tue|dementia|alzheimer/, thuoc: ['Citicoline', 'Piracetam', 'Vitamin B1 – B6 – B12'] },

    /* ---------- Cơ xương khớp ---------- */
    { benh: 'Viêm cột sống dính khớp', capTinh: 0, re: /viem cot song dinh khop/, thuoc: ['Meloxicam', 'Celecoxib', 'Methotrexat 2,5 mg (uống mỗi tuần)'] },
    { benh: 'Viêm quanh khớp vai – viêm gân', capTinh: 0, re: /viem quanh khop vai|dong cung khop vai|viem diem bam gan/, thuoc: ['Meloxicam', 'Diclofenac', 'Paracetamol'] },
    { benh: 'Hội chứng ống cổ tay', capTinh: 0, re: /ong co tay|carpal tunnel/, thuoc: ['Meloxicam', 'Gabapentin', 'Vitamin B1 – B6 – B12'] },
    { benh: 'Thoái hóa cột sống', capTinh: 0, re: /thoai hoa cot song|hep ong song/, thuoc: ['Paracetamol', 'Meloxicam', 'Vitamin B1 – B6 – B12', 'Gabapentin'] },

    /* ---------- Da liễu – dị ứng ---------- */
    { benh: 'Hội chứng Stevens–Johnson', capTinh: 1, re: /stevens|\bsjs\b|hoai tu thuong bi/, thuoc: ['Methylprednisolone', 'NaCl 0,9%', 'Paracetamol', 'Albumin 20%'] },
    { benh: 'Dị ứng thuốc – viêm da cơ địa – viêm da tiếp xúc', capTinh: 1, re: /di ung thuoc|phan ung thuoc|viem da co dia|viem da tiep xuc|cham the tang/, thuoc: ['Chlorpheniramine', 'Loratadine', 'Methylprednisolone'] },
    { benh: 'Vảy nến', capTinh: 0, re: /vay nen|psoriasis/, thuoc: ['Methotrexat 2,5 mg (uống mỗi tuần)', 'Loratadine'] },

    /* ---------- Nhi ---------- */
    { benh: 'Viêm tiểu phế quản', capTinh: 1, re: /viem tieu phe quan/, thuoc: ['Oxy liệu pháp', 'NaCl 0,9%', 'Salbutamol khí dung', 'Paracetamol trẻ em'] },
    { benh: 'Viêm thanh khí phế quản cấp (croup)', capTinh: 1, re: /viem thanh khi phe quan|croup/, thuoc: ['Dexamethasone', 'Adrenaline', 'Oxy liệu pháp', 'Paracetamol trẻ em'] },
    { benh: 'Viêm tai giữa cấp', capTinh: 1, re: /viem tai giua/, thuoc: ['Amoxicillin + Acid clavulanic', 'Paracetamol trẻ em'] },
    { benh: 'Viêm họng cấp', capTinh: 1, re: /viem hong cap/, thuoc: ['Paracetamol trẻ em', 'Amoxicillin + Acid clavulanic'] },

    /* ---------- Nội tiết – huyết học ---------- */
    { benh: 'Cơn bão giáp', capTinh: 1, re: /bao giap|con cuong giap cap/, thuoc: ['Thiamazole', 'Bisoprolol', 'Methylprednisolone', 'NaCl 0,9%', 'Paracetamol'] },
    { benh: 'Bạch cầu cấp', capTinh: 1, re: /bach cau cap|\baml\b|\ball\b/, thuoc: ['Allopurinol', 'NaCl 0,9%', 'Piperacillin + Tazobactam', 'Hồng cầu lắng'] },
    { benh: 'Thalassemia', capTinh: 0, re: /thalassemia|tan mau bam sinh/, thuoc: ['Hồng cầu lắng', 'Calci carbonat + Vitamin D3'] }
);
