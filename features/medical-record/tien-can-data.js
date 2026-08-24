// tien-can-data.js — thư viện cho mục IV. TIỀN CĂN.
//
// Tiền căn là chỗ sinh viên hay ghi qua loa "chưa ghi nhận" vì ngại gõ.
// Ở đây mọi thứ đều bày sẵn để chạm: tác nhân dị ứng, loại phẫu thuật đã mổ,
// quan hệ trong gia đình, thói quen — kèm các mục đặc thù cho sản và nhi.

/* ---------------------------------------------------------------- Dị ứng */
export const DI_UNG_NHOM = [
    {
        ten: 'Thuốc', icon: 'fa-pills', items: [
            'Penicillin', 'Amoxicillin', 'Cephalosporin', 'Sulfamid (Bactrim)',
            'Quinolon (Ciprofloxacin, Levofloxacin)', 'Tetracyclin', 'Vancomycin',
            'Aspirin', 'NSAID (Ibuprofen, Diclofenac)', 'Paracetamol',
            'Thuốc cản quang chứa iod', 'Thuốc tê (Lidocaine)', 'Thuốc mê',
            'Thuốc chống lao', 'Allopurinol', 'Carbamazepine', 'Vaccin'
        ]
    },
    {
        ten: 'Thức ăn', icon: 'fa-utensils', items: [
            'Tôm, cua, hải sản', 'Cá biển', 'Nhộng tằm', 'Trứng', 'Sữa bò',
            'Đậu phộng', 'Đậu nành', 'Thịt bò', 'Thịt gà', 'Măng', 'Nấm', 'Bột ngọt'
        ]
    },
    {
        ten: 'Môi trường – khác', icon: 'fa-wind', items: [
            'Phấn hoa', 'Bụi nhà', 'Mạt bụi nhà', 'Lông chó mèo', 'Nấm mốc',
            'Thay đổi thời tiết', 'Khói thuốc lá', 'Hóa chất tẩy rửa',
            'Mủ cao su (latex)', 'Nọc ong', 'Kiến ba khoang', 'Ánh nắng'
        ]
    }
];

/** Biểu hiện khi dị ứng — gợi ý cho cột phải */
export const DI_UNG_BIEU_HIEN = [
    'nổi mày đay, ngứa', 'ban đỏ toàn thân', 'phù mặt – phù môi',
    'phù mạch, khó thở', 'khó thở, khò khè', 'buồn nôn, nôn, đau bụng',
    'sốc phản vệ, phải cấp cứu', 'bong tróc da (Stevens–Johnson)',
    'chỉ ngứa nhẹ, tự hết', 'không rõ biểu hiện'
];

/* ---------------------------------------------------------------- Ngoại khoa */
export const PHAU_THUAT_NHOM = [
    {
        ten: 'Ổ bụng – tiêu hóa', icon: 'fa-bowl-food', items: [
            'Cắt ruột thừa', 'Cắt túi mật', 'Khâu lỗ thủng dạ dày', 'Cắt dạ dày',
            'Cắt đại tràng', 'Gỡ dính ruột', 'Mổ thoát vị bẹn', 'Mổ thoát vị rốn',
            'Mổ trĩ', 'Mổ rò hậu môn', 'Nội soi mật tụy ngược dòng (ERCP)',
            'Cắt gan', 'Cắt lách', 'Mở hậu môn nhân tạo'
        ]
    },
    {
        ten: 'Sản – phụ khoa', icon: 'fa-baby', items: [
            'Mổ lấy thai', 'Cắt tử cung', 'Bóc u xơ tử cung', 'Cắt u nang buồng trứng',
            'Mổ thai ngoài tử cung', 'Nạo hút thai', 'Khâu vòng cổ tử cung', 'Triệt sản'
        ]
    },
    {
        ten: 'Chấn thương – chỉnh hình', icon: 'fa-bone', items: [
            'Kết hợp xương nẹp vít', 'Đóng đinh nội tủy', 'Thay khớp háng',
            'Thay khớp gối', 'Nội soi khớp gối', 'Mổ thoát vị đĩa đệm',
            'Mổ cột sống', 'Cắt cụt chi', 'Khâu vết thương phần mềm', 'Ghép da'
        ]
    },
    {
        ten: 'Tim mạch – lồng ngực', icon: 'fa-heart-pulse', items: [
            'Đặt stent mạch vành', 'Bắc cầu mạch vành', 'Thay van tim',
            'Đặt máy tạo nhịp', 'Dẫn lưu màng phổi', 'Cắt thùy phổi', 'Mổ bướu giáp'
        ]
    },
    {
        ten: 'Tiết niệu – khác', icon: 'fa-droplet', items: [
            'Tán sỏi ngoài cơ thể', 'Nội soi tán sỏi niệu quản', 'Mổ lấy sỏi thận',
            'Cắt đốt tuyến tiền liệt qua niệu đạo', 'Mổ hẹp bao quy đầu',
            'Mổ mắt (đục thủy tinh thể)', 'Cắt amidan', 'Mổ xoang', 'Nhổ răng khôn'
        ]
    }
];

/* ---------------------------------------------------------------- Gia đình */
export const QUAN_HE = [
    'Cha', 'Mẹ', 'Anh ruột', 'Chị ruột', 'Em ruột', 'Con trai', 'Con gái',
    'Ông nội', 'Bà nội', 'Ông ngoại', 'Bà ngoại', 'Cô', 'Chú', 'Bác', 'Dì', 'Cậu',
    'Vợ', 'Chồng', 'Người sống cùng nhà'
];

/* ---------------------------------------------------------------- Thói quen */
export const THOI_QUEN = [
    'Không hút thuốc lá, không uống rượu bia',
    'Hút thuốc lào', 'Nhai trầu', 'Nhai cau',
    'Dùng ma túy đường hít', 'Dùng ma túy đường tiêm',
    'Ăn mặn', 'Ăn nhiều dầu mỡ', 'Ăn nhiều đường – nước ngọt',
    'Ăn thức ăn tái, sống', 'Uống nước chưa đun sôi',
    'Ít vận động', 'Tập thể dục đều đặn 30 phút/ngày',
    'Thức khuya sau 24h', 'Làm việc ca đêm',
    'Tự mua thuốc uống khi bệnh', 'Dùng thuốc nam – thuốc bắc không rõ nguồn gốc'
];

/* ---------------------------------------------------------------- Sản phụ khoa */
export const KINH_NGUYET = {
    chuKy: ['đều 28–30 ngày', 'đều 30–32 ngày', 'không đều', 'thưa (> 35 ngày)', 'đã mãn kinh'],
    luong: ['lượng vừa', 'lượng ít', 'lượng nhiều, phải thay băng nhiều lần'],
    dauBung: ['không đau bụng kinh', 'đau bụng kinh nhẹ', 'đau bụng kinh nhiều, phải uống thuốc'],
    soNgay: ['3 ngày', '4 ngày', '5 ngày', '6 – 7 ngày']
};

export const NGUA_THAI = [
    'không dùng biện pháp ngừa thai', 'thuốc viên ngừa thai hằng ngày',
    'thuốc ngừa thai khẩn cấp', 'đặt vòng', 'que cấy tránh thai',
    'thuốc tiêm ngừa thai', 'bao cao su', 'triệt sản', 'xuất tinh ngoài'
];

/** Cách kết thúc của một lần mang thai trước — cho danh sách PARA chi tiết */
export const KET_CUC_THAI = [
    'sinh thường đủ tháng', 'sinh mổ đủ tháng', 'sinh thường thiếu tháng',
    'sinh mổ thiếu tháng', 'sinh hút – sinh kềm', 'sảy thai', 'thai lưu',
    'phá thai', 'thai ngoài tử cung', 'thai trứng'
];

/* ---------------------------------------------------------------- Nhi khoa */
export const NHI_SINH = [
    'sinh thường đủ tháng', 'sinh mổ đủ tháng', 'sinh non 32 – 36 tuần',
    'sinh non < 32 tuần', 'sinh già tháng', 'sinh hút – sinh kềm'
];

export const NHI_CAN_NANG = ['≥ 3500 g', '3000 – 3499 g', '2500 – 2999 g',
    '2000 – 2499 g (nhẹ cân)', '1500 – 1999 g', '< 1500 g (rất nhẹ cân)'];

export const NHI_SAU_SINH = [
    'khóc ngay sau sinh, không ngạt', 'ngạt phải hồi sức', 'vàng da sơ sinh phải chiếu đèn',
    'nằm dưỡng nhi', 'thở máy sau sinh', 'không có bất thường gì'
];

export const NHI_CHUNG_NGUA = [
    'tiêm chủng đủ theo lịch quốc gia', 'tiêm chủng chưa đủ theo lịch',
    'chưa tiêm mũi nào', 'không rõ tiền căn chủng ngừa',
    'có tiêm dịch vụ (phế cầu, cúm, thủy đậu)', 'đã tiêm nhắc sởi – bạch hầu'
];

export const NHI_PHAT_TRIEN = [
    'phát triển tâm vận bình thường theo tuổi',
    'biết lật 4 tháng, ngồi 6 tháng, đi 12 tháng',
    'chậm biết đi (sau 18 tháng)', 'chậm nói (sau 24 tháng)',
    'chậm phát triển toàn diện', 'học lực bình thường'
];

export const NHI_DINH_DUONG = [
    'bú mẹ hoàn toàn 6 tháng đầu', 'bú mẹ kết hợp sữa công thức',
    'bú sữa công thức hoàn toàn', 'cai sữa lúc 12 tháng',
    'ăn dặm từ 6 tháng', 'ăn dặm sớm trước 4 tháng',
    'hiện ăn cơm cùng gia đình', 'biếng ăn kéo dài'
];
