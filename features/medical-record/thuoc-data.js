// thuoc-data.js — thư viện thuốc thường dùng, xếp theo nhóm điều trị.
//
// Chọn một thuốc là máy điền sẵn hàm lượng – liều – số lần – đường dùng – giờ dùng
// theo cách kê phổ biến nhất, sinh viên chỉ sửa lại con số cho đúng bệnh nhân.
// Liều ở đây là liều người lớn tham khảo, KHÔNG thay cho tra cứu và chỉ định của thầy.

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
            t('Fosfomycin', '3 g', '1 gói', '1', '(u)', '20h')
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
            t('Oresol', '', '1 gói pha 1 lít', '', '(u)', 'uống thay nước')
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
            t('Colchicine', '1 mg', '1 viên', '1', '(u)', '20h')
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
            t('Mannitol 20%', '250 ml', '1 chai', '', '(TTM)', 'truyền nhanh 30 phút')
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
            t('Nước cất pha tiêm', '5 ml', '1 ống', '', '', 'pha thuốc')
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
