// goi-y-nhap.js — mọi thứ để "chạm là điền", tách khỏi tao-benh-an.js cho dễ quản lý.
//
//   QUICK_FILL   chip gợi ý cho từng ô — chạm để điền, chạm lại để bỏ
//   NORMAL_EXAM  mẫu khám bình thường, điền một lượt các mục không bất thường
//   buildChips   dựng chip cho mọi ô có trong QUICK_FILL
//   buildPickers gắn nút mở bảng chọn có tìm kiếm cho các ô chẩn đoán

import { openListPicker } from './list-picker.js';
import { BENH_NHOM } from './benh-data.js';
import { CLS_DE_NGHI, HOI_CHUNG } from './de-nghi-data.js';
import { ROS_BY_NHOM, SYMPTOMS } from './trieu-chung-data.js';
import { attachTypeahead, CLS_PURPOSES } from './goi-y-go.js';
import { suggestFor, hallmarksFor } from './bien-luan-data.js';
import { requirementsFor } from './clinical-validator.js';
import { fold } from './tim-kiem.js';

const $ = (id) => document.getElementById(id);

const nowTime = () => new Date().toTimeString().slice(0, 5);
const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/* Ngày khởi phát: đếm ngược từ ngày nhập viện (chưa có thì từ hôm nay) — khỏi mở lịch bấm tay */
const backFrom = (n) => () => {
    const base = $('admission-date')?.value;
    const d = base ? new Date(base + 'T00:00:00') : new Date();
    d.setDate(d.getDate() - n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const QUICK_FILL = {
    'admission-time': [['Bây giờ', nowTime]],
    'admission-date': [['Hôm nay', todayISO]],
    'history-internal': ['Chưa ghi nhận bệnh lý nội khoa', 'Tăng huyết áp', 'Đái tháo đường type 2', 'Rối loạn lipid máu', 'Viêm dạ dày'],
    'history-surgery': ['Chưa ghi nhận tiền căn ngoại khoa', 'Mổ lấy thai', 'Cắt ruột thừa'],
    'history-obgyne': ['Kinh nguyệt đều', 'PARA', 'Đã mãn kinh'],
    'history-allergy': ['Chưa ghi nhận dị ứng thuốc, thức ăn'],
    'history-habit': ['Không hút thuốc lá, không uống rượu bia', 'Hút thuốc lá', 'Uống rượu bia thường xuyên',
        'Nhai trầu', 'Ăn mặn', 'Ăn nhiều dầu mỡ', 'Ít vận động', 'Thức khuya sau 24h',
        'Tự mua thuốc uống khi bệnh', 'Dùng thuốc nam không rõ nguồn gốc'],
    'history-family': ['Chưa ghi nhận bệnh lý tương tự trong gia đình', 'Gia đình có người tăng huyết áp', 'Gia đình có người đái tháo đường'],
    'ros-cardio': [['Bình thường', () => 'Không hồi hộp, không đánh trống ngực, không khó thở'], 'Có khó thở khi gắng sức'],
    'ros-resp': [['Bình thường', () => 'Không ho, không khò khè, không đau ngực'], 'Ho khan', 'Ho đàm'],
    'ros-gi': [['Bình thường', () => 'Không đau bụng, không buồn nôn, đi phân vàng đóng khuôn'], 'Chán ăn', 'Sụt cân'],
    'ros-neuro': [['Bình thường', () => 'Không đau đầu, không chóng mặt'], 'Mất ngủ'],
    'ros-msk': [['Bình thường', () => 'Không đau khớp, không yếu liệt cơ, không giới hạn vận động'], 'Đau mỏi cơ'],
    'ros-uro': [['Bình thường', () => 'Nước tiểu vàng trong, không tiểu gắt buốt, không tiểu máu'], 'Tiểu đêm'],
    'exam-general': ['Bệnh nhân tỉnh, tiếp xúc tốt', 'Da niêm hồng', 'Da niêm nhạt', 'Chi ấm, mạch quay rõ, CRT < 2s', 'Không phù', 'Hạch ngoại vi sờ không chạm', 'Môi khô, lưỡi dơ'],
    'exam-head': ['Cân đối, không biến dạng', 'Họng sạch', 'Tuyến giáp không to, khí quản không lệch', 'Không âm thổi động mạch cảnh', 'Kết mạc mắt nhạt'],
    'exam-chest': ['Lồng ngực cân đối, không sang thương, di động đều theo nhịp thở', 'Không co kéo cơ hô hấp phụ', 'Có sẹo mổ cũ'],
    'exam-heart': ['Mỏm tim khoang liên sườn V đường trung đòn trái', 'T1 T2 đều rõ, không âm thổi', 'Tim nhanh đều', 'Dấu Harzer (-)'],
    'exam-lung': ['Rung thanh đều 2 bên', 'Gõ trong khắp phổi', 'Rì rào phế nang êm dịu 2 phế trường, không ran', 'Ran nổ đáy phổi (P)', 'Ran ẩm 2 đáy phổi'],
    'exam-abdomen': ['Bụng mềm, không điểm đau khu trú', 'Nhu động ruột 5 lần/phút', 'Gan lách sờ không chạm', 'Gõ đục vùng thấp (-), sóng vỗ (-)', 'Chạm thận (-), bập bềnh thận (-)'],
    'exam-neuro-msk': ['Cổ mềm, không dấu thần kinh định vị', 'Không yếu liệt chi, không giới hạn vận động', 'Không biến dạng chi, không gù vẹo cột sống'],
    'labs-proposed': ['Công thức máu', 'Sinh hóa máu: ure, creatinine, AST, ALT, ion đồ', 'Đường huyết', 'CRP', 'Tổng phân tích nước tiểu', 'X-quang ngực thẳng', 'ECG', 'Siêu âm bụng tổng quát'],
    'labs-rationale': ['Để chẩn đoán xác định:', 'Để chẩn đoán phân biệt:', 'Để đánh giá mức độ nặng:', 'Để tìm biến chứng:', 'Để tìm nguyên nhân / yếu tố thúc đẩy:', 'Để theo dõi điều trị:', 'Xét nghiệm thường quy:'],
    'labs-interpretation': ['Kết quả phù hợp với chẩn đoán sơ bộ vì:', 'Kết quả không ủng hộ chẩn đoán… vì:', 'Đã loại trừ… vì:', 'Đề nghị làm thêm… vì:'],
    'diagnosis-reasoning': ['Nghĩ nhiều đến… vì:', 'Ít nghĩ đến… vì:', 'Chưa loại trừ… nên đề nghị:', 'Yếu tố nguy cơ:', 'Biến chứng cần tìm:'],
    'differential-diagnosis': ['Cùng triệu chứng nhưng khác cơ chế:', 'Bệnh cảnh nặng cần loại trừ trước:'],
    'treatment-plan': ['Điều trị nguyên nhân', 'Điều trị triệu chứng', 'Điều trị hỗ trợ, nâng tổng trạng', 'Điều trị bệnh nền đi kèm', 'Theo dõi sinh hiệu, biến chứng', 'Chế độ ăn – vận động'],
    'prognosis': ['Tiên lượng gần: khá', 'Tiên lượng xa: dè dặt'],
    'prevention': ['Tuân thủ điều trị, tái khám đúng hẹn', 'Chế độ ăn hợp lý, tập luyện đều đặn'],

    /* --- Bệnh sử: triệu chứng chính, đủ 6 thuộc tính --- */
    'hx-onset-date': [['Ngay ngày NV', backFrom(0)], ['1 ngày trước', backFrom(1)], ['3 ngày', backFrom(3)],
        ['1 tuần', backFrom(7)], ['2 tuần', backFrom(14)], ['1 tháng', backFrom(30)]],
    'hx-relation': ['bệnh nhân tự khai', 'con gái', 'con trai', 'vợ', 'chồng', 'mẹ', 'cha', 'anh/chị em ruột'],
    'hx-sym-name': ['Sốt', 'Ho', 'Khó thở', 'Đau ngực', 'Đau bụng', 'Đau đầu', 'Nôn ói', 'Tiêu chảy', 'Phù', 'Chóng mặt'],
    'hx-sym-site': ['sau xương ức, lan tay trái', 'ngực (T)', 'thượng vị', 'hạ sườn (P)', 'hố chậu (P)', 'quanh rốn', 'vùng trán – thái dương', 'thắt lưng lan xuống bẹn'],
    'hx-sym-char': ['đau âm ỉ', 'đau từng cơn', 'đau quặn', 'đè nặng, bóp nghẹt', 'đau nhói như dao đâm', 'nóng rát'],
    'hx-sym-severity': ['3/10 — nhẹ, vẫn sinh hoạt bình thường', '5/10 — ảnh hưởng sinh hoạt', '7/10 — phải nằm nghỉ', '9/10 — dữ dội, không chịu nổi'],
    'hx-sym-time': ['khởi phát đột ngột', 'tăng dần nhiều ngày nay', 'từng cơn 5–10 phút, 3–4 cơn/ngày', 'liên tục cả ngày', 'tăng về đêm', 'tăng sau ăn'],
    'hx-sym-factors': ['tăng khi gắng sức, giảm khi nghỉ', 'tăng khi hít sâu và ho', 'tăng sau ăn, giảm khi nhịn ăn', 'giảm sau khi uống thuốc giảm đau', 'không rõ yếu tố tăng giảm'],
    'hx-sym-assoc': ['vã mồ hôi', 'khó thở', 'buồn nôn, nôn', 'sốt, lạnh run', 'hồi hộp, đánh trống ngực', 'không kèm triệu chứng nào khác'],
    'hx-sym-treated': ['chưa điều trị gì', 'tự mua thuốc uống, không giảm', 'uống paracetamol giảm ít rồi đau lại', 'đã khám phòng khám tư, có toa thuốc', 'đã điều trị ở bệnh viện tuyến trước'],

    /* --- Bệnh sử: tình trạng & toàn thân --- */
    'hx-admit-state': ['tỉnh, tiếp xúc tốt, sinh hiệu ổn', 'tỉnh, mệt nhiều, sốt cao', 'lơ mơ, gọi mở mắt', 'khó thở phải ngồi thở', 'mạch nhanh, huyết áp tụt'],
    'hx-after-admit': ['hết sốt sau 2 ngày kháng sinh', 'triệu chứng giảm dần, ăn uống được', 'chưa cải thiện, còn đau nhiều', 'diễn tiến nặng hơn, phải đổi kháng sinh', 'sinh hiệu ổn định, đang theo dõi tiếp'],
    'hx-general': ['ăn uống kém', 'sụt cân', 'ngủ kém do đau', 'vã mồ hôi đêm', 'tiêu tiểu bình thường'],
    'hx-negatives': ['không sốt, không lạnh run', 'không khó thở, không đau ngực', 'không nôn ói, không tiêu chảy', 'không tiêu phân đen, không tiểu máu', 'không sụt cân, không vã mồ hôi đêm'],
    'adm-note': ['thở khí trời', 'đang thở oxy qua canula', 'đang truyền dịch', 'tri giác tỉnh táo, GCS 15'],

    /* --- Ngoại khoa: cơ chế chấn thương --- */
    'tr-energy': ['xe máy ~40–50 km/h', 'xe máy tốc độ chậm trong khu dân cư', 'ô tô ~60 km/h', 'té từ độ cao ~2 m', 'té từ độ cao > 3 m', 'té ngã ngang tầm đứng'],
    'tr-impact': ['đập vùng chỏm đầu xuống mặt đường', 'đập vùng chẩm xuống nền cứng', 'đập vai và hông (P)', 'ngực đập vào tay lái', 'không rõ vị trí va đập đầu tiên'],
    'tr-object': ['mặt đường nhựa', 'vật tày', 'dao nhọn', 'mảnh kính', 'máy cắt / máy cưa'],
    'tr-firstaid': ['chưa được sơ cứu gì', 'băng ép cầm máu tại chỗ', 'nẹp cố định chi gãy', 'cố định cột sống cổ', 'rửa và băng vết thương'],
    'tr-transport': ['người nhà tự chở đến bằng xe máy', 'xe cấp cứu 115', 'chuyển từ bệnh viện tuyến trước', 'đến viện sau ~30 phút', 'đến viện sau hơn 6 giờ'],

    /* --- Cấp cứu: ABCDE --- */
    'cc-a': ['thông thoáng, tự thở', 'ứ đọng đàm nhớt', 'nguy cơ tắc nghẽn, cần hút đàm', 'đã đặt nội khí quản'],
    'cc-b': ['thở đều, SpO2 98% khí trời', 'thở nhanh nông 28 l/p, SpO2 92% khí trời', 'co kéo cơ hô hấp phụ', 'thông khí giảm bên (P)'],
    'cc-c': ['mạch quay rõ, HA ổn, CRT < 2s', 'mạch nhanh nhẹ 120 l/p, HA 90/60, CRT > 3s', 'da lạnh ẩm, dấu hiệu sốc', 'còn chảy máu ngoài đang cầm'],
    'cc-d': ['GCS 15, đồng tử 2 bên đều 3 mm, phản xạ (+)', 'GCS 14, không dấu thần kinh định vị', 'GCS ≤ 8, cần bảo vệ đường thở', 'đồng tử không đều, nghi tổn thương nội sọ'],
    'cc-e': ['không vết thương ngoài, T 37°C', 'nhiều vết xây xát tay chân', 'bụng chướng, đau khắp bụng', 'hạ thân nhiệt, T 35,5°C'],
    'cc-initial': ['thở oxy qua canula 3 l/phút', 'lập 2 đường truyền tĩnh mạch lớn', 'truyền NaCl 0,9% 500 ml nhanh', 'cố định cột sống cổ, bất động', 'giảm đau đường tĩnh mạch'],

    /* --- Sản khoa --- */
    'ob-contraction': ['chưa có cơn co tử cung', 'cơn co thưa 1–2 cơn/10 phút', '3 cơn/10 phút, mỗi cơn 30 giây', '4–5 cơn/10 phút, cường độ mạnh'],
    'ob-cervix': ['cổ tử cung đóng, chưa xóa', 'xóa 30%, mở 1 cm', 'xóa 60%, mở 3 cm', 'xóa hết, mở 6 cm', 'mở trọn 10 cm'],
    'ob-position': ['ngôi chỏm', 'ngôi mông', 'ngôi ngang', 'chưa xác định được ngôi'],
    'ob-amniotic': ['ối còn, màu trong', 'ối vỡ, dịch trong', 'ối vỡ, dịch có phân su', 'ối vỡ non trước chuyển dạ'],
    'ob-pelvis': ['khung chậu bình thường', 'khung chậu giới hạn', 'khung chậu hẹp'],

    /* --- Nhi khoa --- */
    'ped-birth': ['sinh thường đủ tháng 39 tuần, 3200 g', 'sinh mổ đủ tháng, 3000 g', 'sinh non 34 tuần, 2000 g', 'khóc ngay sau sinh, không ngạt'],
    'ped-nutrition': ['bú mẹ hoàn toàn 6 tháng đầu', 'bú mẹ kết hợp sữa công thức', 'ăn dặm từ 6 tháng', 'hiện ăn cơm cùng gia đình'],
    'ped-vaccine': ['tiêm chủng đủ theo lịch quốc gia', 'tiêm chủng chưa đủ', 'chưa tiêm chủng', 'không rõ tiền căn chủng ngừa'],
    'ped-development': ['phát triển tâm vận bình thường theo tuổi', 'biết lật 4 tháng, ngồi 6 tháng', 'biết đi lúc 12 tháng', 'chậm phát triển so với tuổi'],

    /* --- Phẫu thuật --- */
    'sx-method': ['cắt túi mật nội soi', 'cắt ruột thừa nội soi', 'khâu lỗ thủng dạ dày', 'mổ lấy thai ngang đoạn dưới', 'kết hợp xương nẹp vít'],
    'sx-anesthesia': ['mê nội khí quản', 'tê tủy sống', 'tê tại chỗ', 'mê tĩnh mạch'],
    'sx-drain': ['không đặt dẫn lưu', 'dẫn lưu dưới gan ra 50 ml dịch vàng trong', 'dẫn lưu Douglas ra dịch hồng loãng', 'vết mổ khô, không chảy dịch', 'vết mổ tấy đỏ, có dịch đục'],

    /* --- Chẩn đoán: sơ bộ (dx1) và xác định (dx2) --- */
    'dx1-main': ['Viêm phổi cộng đồng', 'Đợt cấp COPD', 'Suy tim mạn mất bù', 'Nhồi máu cơ tim cấp', 'Xuất huyết tiêu hóa trên', 'Nhiễm trùng tiểu', 'Sốt xuất huyết Dengue', 'Viêm dạ dày cấp', 'Viêm ruột thừa cấp'],
    'dx1-comp': ['chưa ghi nhận biến chứng', 'suy hô hấp cấp', 'sốc nhiễm trùng', 'suy thận cấp', 'rối loạn điện giải', 'thiếu máu'],
    'dx1-stage': ['mức độ nhẹ', 'mức độ trung bình', 'mức độ nặng', 'CURB-65 = 2, nguy cơ trung bình'],
    'dx2-main': ['Viêm phổi cộng đồng', 'Đợt cấp COPD', 'Suy tim mạn mất bù', 'Nhồi máu cơ tim cấp', 'Xuất huyết tiêu hóa trên', 'Nhiễm trùng tiểu', 'Sốt xuất huyết Dengue', 'Viêm dạ dày cấp', 'Viêm ruột thừa cấp'],
    'dx2-comp': ['chưa ghi nhận biến chứng', 'suy hô hấp cấp', 'sốc nhiễm trùng', 'suy thận cấp', 'rối loạn điện giải', 'thiếu máu'],
    'dx2-stage': ['mức độ nhẹ', 'mức độ trung bình', 'mức độ nặng', 'giai đoạn ổn định'],

    'tr-burn-agent': ['nước sôi', 'lửa xăng', 'dầu ăn nóng', 'điện', 'hóa chất', 'bô xe máy'],
    'env-job': ['không có phơi nhiễm nghề nghiệp', 'phun thuốc trừ sâu', 'làm ruộng, tiếp xúc bùn đất', 'thợ hàn – khói kim loại', 'công nhân dệt – bụi bông', 'lái xe đường dài', 'làm việc trong môi trường lạnh'],
    'env-area': ['không sống / đi vùng dịch tễ', 'vùng lưu hành sốt xuất huyết', 'vùng lưu hành sốt rét', 'vùng có dịch tay chân miệng', 'khu vực đang có dịch cúm'],
    'env-contact': ['chưa ghi nhận tiếp xúc người bệnh', 'nhà có người ho kéo dài', 'nhà có người đang điều trị lao', 'lớp học có bạn bị tay chân miệng', 'tiếp xúc người sốt phát ban'],
    'env-animal': ['không nuôi, không tiếp xúc động vật', 'nuôi gà, vịt', 'nuôi chó, mèo', 'bị chó cắn', 'bị mèo cào', 'giết mổ gia cầm'],
    'env-water': ['dùng nước máy, ăn chín uống sôi', 'dùng nước giếng khoan', 'hay ăn gỏi cá – thịt tái', 'hay ăn rau sống', 'uống nước chưa đun sôi'],
    'env-travel': ['không đi đâu xa trong 1 tháng nay', 'về quê 2 tuần trước', 'đi nước ngoài trong 1 tháng nay', 'đi vùng rừng núi'],
    'history-environment': ['Chưa ghi nhận yếu tố phơi nhiễm đặc biệt', 'Tiếp xúc khói bụi nghề nghiệp', 'Tiếp xúc thuốc bảo vệ thực vật', 'Tiếp xúc hóa chất công nghiệp', 'Sống vùng dịch tễ sốt xuất huyết', 'Nuôi gia súc, gia cầm'],
    'sx-pre-dx': ['Viêm ruột thừa cấp', 'Viêm túi mật cấp do sỏi', 'Thủng tạng rỗng', 'Tắc ruột cơ học', 'Gãy xương kín'],
    'sx-post-dx': ['Chẩn đoán sau mổ phù hợp chẩn đoán trước mổ', 'Viêm ruột thừa cấp đã vỡ mủ', 'Viêm túi mật hoại tử', 'Thủng ổ loét hành tá tràng'],
    'sx-report': ['Tổn thương ghi nhận:', 'Các thì mổ chính:', 'Lượng máu mất ước tính:', 'Không tai biến trong mổ', 'Dẫn lưu đặt tại:']
};

/* Ô liệt kê nhiều ý: chạm thêm chip là nối tiếp, không đè mất ý đã chọn */
const CHIP_APPEND = new Set(['hx-sym-assoc', 'hx-negatives', 'hx-general', 'cc-initial',
    'tr-firstaid', 'dx1-comp', 'dx1-assoc', 'dx2-comp', 'dx2-assoc']);

export function buildChips() {
    for (const [id, items] of Object.entries(QUICK_FILL)) makeChips(id, items);
}

/** Thay bộ chip gợi ý của một ô; truyền null để trả về bộ mặc định của ô đó */
export function setChips(id, items) {
    const el = $(id);
    if (!el) return;
    if (el.nextElementSibling?.classList.contains('chips')) el.nextElementSibling.remove();
    const use = items ?? QUICK_FILL[id];
    if (use?.length) makeChips(id, use);
}

function makeChips(id, items) {
    {
        const el = $(id);
        if (!el) return;
        const wrap = document.createElement('div');
        // Ô trong lưới: chip chỉ bung ra khi bấm vào ô, đỡ làm trang dài trên điện thoại
        wrap.className = 'chips' + (el.classList.contains('calc-in') ? ' compact' : '');
        items.forEach(item => {
            // 3 dạng: 'chữ' | ['nhãn', hàm lấy giá trị] | { text, tag } (chip theo bệnh cảnh)
            const ctx = item && typeof item === 'object' && !Array.isArray(item) ? item : null;
            const [label, getValue] = ctx ? [`${ctx.tag || ''} ${ctx.text}`.trim(), () => ctx.text]
                : Array.isArray(item) ? item : [item, () => item];
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'chip' + (ctx ? ' is-ctx' : '');
            btn.textContent = label;
            if (ctx?.title) btn.title = ctx.title;
            // Chip cố định (không phải "Bây giờ" / "Hôm nay") thì bật tắt được
            const fixed = !Array.isArray(item);
            if (fixed) btn.dataset.text = ctx ? ctx.text : item;
            // Giữ con trỏ ở lại ô: chip hiện theo :focus-within, mất focus là chip
            // biến mất ngay giữa cú chạm (iOS không focus nút khi chạm).
            btn.addEventListener('mousedown', (e) => e.preventDefault());
            btn.addEventListener('click', () => {
                const text = getValue();
                const cur = el.value.trim();
                if (fixed && cur.includes(text)) el.value = dropChip(cur, text, el.tagName);
                else if (el.tagName === 'TEXTAREA' && cur) el.value = cur + '\n' + text;
                else if (cur && CHIP_APPEND.has(id)) el.value = cur.replace(/[,;\s]+$/, '') + ', ' + text;
                else el.value = text;
                el.dispatchEvent(new Event('input', { bubbles: true }));
            });
            wrap.appendChild(btn);
        });
        el.insertAdjacentElement('afterend', wrap);
        // Tô sáng chip đang có mặt trong ô, để biết mình đã chọn những gì.
        // Gắn một lần cho mỗi ô và tra hộp chip hiện tại lúc chạy, vì bộ chip có thể bị thay.
        const mark = () => el.nextElementSibling?.querySelectorAll?.('.chip[data-text]')
            .forEach(b => b.classList.toggle('is-on', el.value.includes(b.dataset.text)));
        if (!el.dataset.chipMark) {
            el.dataset.chipMark = '1';
            el.addEventListener('input', mark);
            el.addEventListener('focus', mark);
        }
        mark();
    }
}

/* =====================================================================
   Gợi ý bám theo bệnh cảnh: triệu chứng đã khai thác ở bệnh sử quyết định
   khám gì trước và lược qua cơ quan nào. Chip 🎯 nhảy lên đầu, ô liên quan
   được làm nổi để không lướt qua.
   ===================================================================== */
const CTX_EXAM_IDS = ['exam-general', 'exam-head', 'exam-chest', 'exam-heart',
    'exam-lung', 'exam-abdomen', 'exam-neuro-msk'];
let ctxKey = '';

/* Dấu chứng kinh điển thuộc về ô khám nào — để chip rơi đúng chỗ thay vì dồn
   hết vào "khám tổng quát". Mẫu đầu tiên khớp là lấy. */
const EXAM_ROUTE = [
    [/ph[ổo]i|ran |r[ìi] r[àa]o|g[õo] đ[ụu]c|rung thanh|kh[òo] kh[èe]|th[ởo] ra|ba gi[ảa]m|đ[ôo]ng đ[ặa]c/i, 'exam-lung'],
    [/tim|m[ỏo]m|[âa]m th[ổo]i|t[ĩi]nh m[ạa]ch c[ổo]|ph[ảa]n h[ồo]i gan|nh[ịi]p|m[ạa]ch nhanh/i, 'exam-heart'],
    [/b[ụu]ng|gan |l[áa]ch|b[áa]ng|ph[úu]c m[ạa]c|nhu đ[ộo]ng|tr[ựư]c tr[àa]ng|đ[ềe] kh[áa]ng/i, 'exam-abdomen'],
    [/c[ổo] g[ượư]{1,2}ng|kernig|brudzinski|li[ệe]t|babinski|tri gi[áa]c|th[ầa]n kinh|kh[ớo]p|n[óo]i (đ[ớơ]|kh[óo])|m[ée]o mi[ệe]ng|co gi[ậa]t|c[ứư]ng kh[ớo]p/i, 'exam-neuro-msk'],
    [/l[ồo]ng ng[ựư]c|co k[ée]o|r[úu]t l[õo]m|s[ẹe]o m[ổo]/i, 'exam-chest'],
    [/h[ọo]ng|tuy[ếe]n gi[áa]p|kh[íi] qu[ảa]n|h[ạa]ch|m[ắa]t tr[ũu]ng|đ[ồo]ng t[ửư]|k[ếe]t m[ạa]c/i, 'exam-head']
];
const examFieldFor = (t) => (EXAM_ROUTE.find(([re]) => re.test(t)) || [, 'exam-general'])[1];

/** Đọc một ô nhiều dòng thành mảng tên, bỏ số thứ tự và phần giải thích sau dấu — */
const lines = (id) => String($(id)?.value || '').split('\n')
    .map(l => l.replace(/^\s*\d+[.)]\s*/, '').replace(/\s+—\s+.*$/, '').trim()).filter(Boolean);

const DX_IDS = ['dx1-main', 'dx2-main', 'differential-diagnosis'];

/**
 * Nối lại toàn bộ mạng gợi ý sau mỗi lần bệnh án đổi. Ba chiều:
 *
 *   bệnh sử   → ô khám, lược qua cơ quan, triệu chứng đi kèm / âm tính
 *   vấn đề    → chip chẩn đoán nên nghĩ tới và bệnh cảnh phải loại trừ
 *   chẩn đoán → dấu chứng kinh điển phải mô tả + cận lâm sàng bắt buộc
 *
 * @param {Array} syms mảng triệu chứng (từ getClinicalContext)
 */
export function applyClinicalContext(syms) {
    const problems = lines('problem-list');
    const dxLines = [...new Set(DX_IDS.flatMap(lines))];
    const dxText = dxLines.join('\n');
    const key = [syms.map(s => s.ten).join('|'), problems.join('|'), dxText].join('#');
    if (key === ctxKey) return;            // gõ từng chữ mà dựng lại chip cả trang thì phí
    ctxKey = key;

    /* --- 1. Chẩn đoán đang ghi kéo ngược về phần khám --- */
    const hallByField = {};
    [...new Set([...dxLines, ...problems].flatMap(hallmarksFor))]
        .forEach(t => (hallByField[examFieldFor(t)] ||= []).push(t));
    const { labs: mustLabs, needs } = requirementsFor(dxText);
    const needByField = {};
    needs.forEach(n => (needByField[n.field] ||= []).push(n));

    CTX_EXAM_IDS.forEach(id => {
        const fromSym = new Set(syms.flatMap(s => s.examTargets?.[id] || []));
        const hits = [...new Set([...fromSym, ...(hallByField[id] || [])])];
        const base = QUICK_FILL[id] || [];
        setChips(id, hits.length
            ? [...hits.map(t => ({
                text: t, tag: '🎯',
                title: fromSym.has(t) ? 'Liên quan bệnh sử — nên khám và mô tả rõ'
                    : 'Dấu chứng kinh điển của chẩn đoán đang ghi — mô tả để chứng minh'
            })), ...base.filter(x => typeof x !== 'string' || !hits.includes(x))]
            : null);
        markHot(id, hits.length);
    });

    /* Ô nào bị chẩn đoán "đòi" dấu chứng thì nói thẳng: đòi cái gì, cho bệnh nào */
    NEED_HINT_IDS.forEach(id => setNeedHint(id, needByField[id]));

    /* --- 2. Vấn đề đã đặt kéo sang chip chẩn đoán --- */
    const seen = new Set();
    const cand = [];
    problems.forEach(p => {
        const g = suggestFor(p);
        const push = (t, tag, title) => {
            const k = String(t || '').toLowerCase();
            if (!k || seen.has(k)) return;
            seen.add(k);
            cand.push({ text: t, tag, title });
        };
        (g.red || []).forEach(t => push(t, '🚨', `Nguy hiểm — phải loại trừ trước khi chốt "${p}"`));
        (g.nn || []).forEach(t => push(t, '🎯', `Nguyên nhân thường gặp của "${p}"`));
    });
    DX_IDS.forEach(id => setChips(id, cand.length ? [...cand, ...(QUICK_FILL[id] || [])] : null));

    /* --- 3. Chẩn đoán kéo sang cận lâm sàng bắt buộc --- */
    const co = fold(String($('labs-proposed')?.value || ''));
    const thieu = mustLabs.filter(l => !co.includes(fold(l.ten)));
    setChips('labs-proposed', thieu.length
        ? [...thieu.map(l => ({ text: l.ten, tag: '🎯', title: `Bắt buộc cho chẩn đoán ${l.benh} — mục XI chưa có` })),
            ...(QUICK_FILL['labs-proposed'] || [])]
        : null);
    markHot('labs-proposed', thieu.length);

    /* --- 4. Hai ô hay bí nhất của triệu chứng chính --- */
    const kem = [...new Set(syms.flatMap(s => s.coOccurring || []))];
    setChips('hx-sym-assoc', kem.length
        ? [...kem.map(t => ({ text: t, tag: '🎯', title: 'Thường đi kèm bệnh cảnh này — hỏi cho đủ' })),
            ...(QUICK_FILL['hx-sym-assoc'] || [])]
        : null);
    markHot('hx-sym-assoc', kem.length);

    const negs = [...new Map(syms.flatMap(s => s.pertinentNegatives || [])
        .map(([cau, viCo]) => [cau, viCo])).entries()];
    setChips('hx-negatives', negs.length
        ? [...negs.map(([cau, viCo]) => ({ text: cau, tag: '🎯', title: `Âm tính có giá trị — giúp loại trừ ${viCo}` })),
            ...(QUICK_FILL['hx-negatives'] || [])]
        : null);
    markHot('hx-negatives', negs.length);

    Object.entries(ROS_BY_NHOM).forEach(([nhom, id]) => {
        const names = syms.filter(s => s.nhom === nhom).map(s => s.ten.toLowerCase());
        setChips(id, names.length
            ? [{ text: `Ghi nhận ${names.join(', ')} (chi tiết ở bệnh sử)`, tag: '🎯', title: 'Cơ quan đang có triệu chứng — phải mô tả, không được ghi "bình thường"' },
                ...(QUICK_FILL[id] || [])]
            : null);
        markHot(id, names.length);
    });
}

/** Làm nổi ô đang liên quan bệnh cảnh để mắt bắt được ngay khi đổi tab */
function markHot(id, on) {
    const el = $(id);
    if (el) el.classList.toggle('is-ctx-hot', !!on);
}

/* Dòng nhắc ngay dưới ô: chẩn đoán đang ghi đòi dấu chứng gì ở chính ô này.
   Nối mục IX ngược về mục II–VI mà trước đây phải đợi bảng rà soát mới biết. */
const NEED_HINT_IDS = [...CTX_EXAM_IDS, 'illness-history', 'hx-sym-char', 'hx-onset-date', 'dx1-stage'];

function setNeedHint(id, list) {
    const el = $(id);
    if (!el) return;
    const anchor = el.nextElementSibling?.classList.contains('chips') ? el.nextElementSibling : el;
    const next = anchor.nextElementSibling;
    let hint = next?.classList.contains('ctx-need') ? next : null;
    if (!list?.length) { hint?.remove(); return; }
    if (!hint) {
        hint = document.createElement('p');
        hint.className = 'ctx-need';
        anchor.insertAdjacentElement('afterend', hint);
    }
    hint.innerHTML = list.map(n =>
        `<span><i class="fas fa-link"></i> <b>${n.benh}</b> cần: ${n.label}</span>`).join('');
}

/** Gỡ một ý đã chọn ra khỏi ô, dọn luôn dấu phân cách thừa */
function dropChip(cur, text, tag) {
    if (tag === 'TEXTAREA') {
        return cur.split('\n').filter(l => l.trim() !== text).join('\n').trim();
    }
    return cur.replace(text, '').replace(/\s*,\s*,\s*/g, ', ')
        .replace(/^[,;\s]+|[,;\s]+$/g, '').trim();
}

/* Ô nào có cả một thư viện dài phía sau thì gắn nút mở bảng chọn có tìm kiếm,
   thay vì nhồi hết vào chip hay datalist. */
function attachPicker(id, { title, groups, multi = false, label = 'Chọn từ danh sách', autoGrow }) {
    const el = $(id);
    if (!el) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pick-btn';
    btn.innerHTML = `<i class="fas fa-magnifying-glass"></i> ${label}`;
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        openListPicker({
            title, groups, multi, value: el.value,
            onPick: (names) => {
                if (!names.length) return;
                el.value = multi ? names.join('\n') : names[0];
                el.dispatchEvent(new Event('input', { bubbles: true }));
                if (el.tagName === 'TEXTAREA') autoGrow(el);
            }
        });
    });
    (el.nextElementSibling?.classList.contains('chips')
        ? el.nextElementSibling : el).insertAdjacentElement('afterend', btn);
}

/** Gom một danh mục nhiều nhóm thành mảng tên phẳng để dò khi gõ */
const flatNames = (groups) => [...new Set(groups.flatMap(g => g.items || []))];

export function buildPickers({ autoGrow, clsTargets }) {
    const benh = { title: 'Chọn chẩn đoán', groups: BENH_NHOM };
    const benhP = { ...benh, autoGrow };
    attachPicker('dx1-main', { ...benhP, label: 'Chọn bệnh theo chuyên khoa' });
    attachPicker('dx2-main', { ...benhP, label: 'Chọn bệnh theo chuyên khoa' });
    attachPicker('sx-pre-dx', { ...benhP, label: 'Chọn chẩn đoán trước mổ' });
    attachPicker('sx-post-dx', { ...benhP, label: 'Chọn chẩn đoán sau mổ' });
    attachPicker('differential-diagnosis', {
        title: 'Chọn các chẩn đoán phân biệt', groups: BENH_NHOM, multi: true, autoGrow,
        label: 'Chọn nhiều bệnh cần phân biệt'
    });
    attachPicker('problem-list', {
        title: 'Chọn hội chứng / vấn đề', groups: HOI_CHUNG, multi: true, autoGrow,
        label: 'Chọn hội chứng theo hệ cơ quan'
    });
    attachPicker('labs-proposed', {
        title: 'Chọn cận lâm sàng đề nghị', groups: CLS_DE_NGHI, multi: true, autoGrow,
        label: 'Chọn cận lâm sàng theo nhóm'
    });

    /* Gõ tay cũng không phải nhớ đủ tên: gõ vài chữ là hiện gợi ý ngay dưới ô.
       Riêng cận lâm sàng thì hỏi luôn "đề nghị để làm gì" — chỗ hay bị bỏ trống. */
    attachTypeahead($('labs-proposed'), {
        items: flatNames(CLS_DE_NGHI), purposes: CLS_PURPOSES, targets: clsTargets, autoGrow
    });
    const benhNames = flatNames(BENH_NHOM);
    ['dx1-main', 'dx2-main', 'sx-pre-dx', 'sx-post-dx', 'differential-diagnosis']
        .forEach(id => attachTypeahead($(id), { items: benhNames, autoGrow }));
    attachTypeahead($('problem-list'), { items: flatNames(HOI_CHUNG), autoGrow });
    const symNames = SYMPTOMS.map(s => s.ten);
    // Ô lý do vào viện có bảng chọn riêng (ly-do-list.js) nên không gắn typeahead nữa
    attachTypeahead($('hx-sym-name'), { items: symNames, autoGrow });
}

/* Mẫu "khám bình thường": điền một lượt các mục khám không bất thường */
export const NORMAL_EXAM = {
    'ros-cardio': 'Không hồi hộp, không đánh trống ngực, không khó thở',
    'ros-resp': 'Không ho, không khò khè, không đau ngực',
    'ros-gi': 'Không đau bụng, không buồn nôn, không nôn, đi phân vàng đóng khuôn',
    'ros-neuro': 'Không đau đầu, không chóng mặt',
    'ros-msk': 'Không đau khớp, không yếu liệt cơ, không giới hạn vận động',
    'ros-uro': 'Nước tiểu vàng trong, không tiểu gắt buốt, không tiểu máu',
    'exam-general': 'Bệnh nhân tỉnh, tiếp xúc tốt. Da niêm hồng. Chi ấm, mạch quay rõ, CRT < 2s. Không phù, không xuất huyết da niêm. Hạch ngoại vi sờ không chạm',
    'exam-head': 'Cân đối, không biến dạng. Họng sạch. Tuyến giáp không to, khí quản không lệch. Không âm thổi động mạch cảnh',
    'exam-chest': 'Lồng ngực cân đối, không sang thương, di động đều theo nhịp thở',
    'exam-heart': 'Mỏm tim khoang liên sườn V đường trung đòn trái, T1 T2 đều rõ, không âm thổi',
    'exam-lung': 'Rung thanh đều 2 bên, gõ trong, rì rào phế nang êm dịu 2 phế trường, không ran',
    'exam-abdomen': 'Bụng mềm, cân đối, di động theo nhịp thở, không điểm đau khu trú. Gan lách sờ không chạm. Chạm thận (-)',
    'exam-neuro-msk': 'Cổ mềm, không dấu thần kinh định vị, không yếu liệt chi, không giới hạn vận động khớp'
};
