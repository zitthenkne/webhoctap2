// clinical-validator.js — bộ rà soát logic lâm sàng chạy nền cho bệnh án.
//
// Mục đích: bắt lỗi tư duy chứ không bắt lỗi chính tả. Máy quét toàn bộ form rồi
// đối chiếu chéo bốn chiều:
//   1. Chẩn đoán  ↔ triệu chứng / dấu khám  (thiếu tiêu chuẩn, mâu thuẫn vị trí)
//   2. Triệu chứng báo động ↔ nhánh loại trừ ở mục X  (bỏ sót cấp cứu)
//   3. Chẩn đoán ↔ cận lâm sàng đề nghị      (thiếu xét nghiệm bắt buộc)
//   4. Toa thuốc ↔ tiền căn dị ứng / eGFR / bệnh nền (chống chỉ định)
//
// Trả về mảng cảnh báo { id, type, severity, title, message, actionText,
// targetTab, targetField, autoFix } — nơi gọi tự lo phần hiển thị.
//
// Toàn bộ chữ trong bệnh án được bỏ dấu trước khi so, nên luật viết bằng chữ
// thường không dấu ("kho tho") vẫn bắt được cả khi sinh viên gõ có dấu lẫn không.

import { fold } from './tim-kiem.js';
import { parseDoi } from './doi-list.js';
import { benhCuaThuoc } from './thuoc-data.js';
import { getCls } from './cls-editor.js';

const $ = (id) => document.getElementById(id);
const val = (id) => String($(id)?.value ?? '');
const pool = (ids) => fold(ids.map(val).join('\n'));

/* ---------- các vùng chữ trong bệnh án ---------- */
const HX_IDS = ['reason-for-admission', 'illness-history', 'hx-sym-name', 'hx-sym-site',
    'hx-sym-char', 'hx-sym-severity', 'hx-sym-time', 'hx-sym-factors', 'hx-sym-assoc',
    'hx-sym-treated', 'hx-general', 'hx-admit-state', 'hx-after-admit', 'hx-eat',
    'hx-sleep', 'hx-stool', 'hx-urine', 'summary'];
const EXAM_IDS = ['exam-general', 'exam-head', 'exam-chest', 'exam-heart', 'exam-lung',
    'exam-abdomen', 'exam-neuro-msk', 'vital-pulse', 'vital-bp', 'vital-temp',
    'vital-resp', 'vital-spo2', 'ros-cardio', 'ros-resp', 'ros-gi', 'ros-neuro',
    'ros-msk', 'ros-uro'];
const PAST_IDS = ['history-internal', 'history-surgery', 'history-obgyne', 'history-allergy',
    'history-environment', 'history-drugs', 'history-habit', 'history-family'];
const DX_IDS = ['dx1-main', 'dx1-comp', 'dx1-stage', 'dx1-assoc', 'provisional-diagnosis'];
const FINAL_IDS = ['dx2-main', 'dx2-comp', 'dx2-stage', 'dx2-assoc', 'final-diagnosis'];
const LAB_IDS = ['labs-proposed'];

/** Gom mọi con số / chữ trong các phiếu cận lâm sàng đã nhập */
function clsText() {
    return fold(getCls().map(c => [c.ten || c.name || '',
    ...(c.items || []).map(i => `${i.n ?? ''} ${i.v ?? ''} ${i.u ?? ''}`), c.note || ''].join(' ')).join('\n'));
}

/** Tìm giá trị số của một chỉ số trong phiếu cận lâm sàng (vd eGFR, tiểu cầu) */
function labNum(re) {
    for (const c of getCls()) {
        for (const i of (c.items || [])) {
            const n = parseFloat(String(i.v ?? '').replace(',', '.'));
            if (re.test(i.n || '') && !isNaN(n)) return n;
        }
    }
    return null;
}

/**
 * Gom một lần toàn bộ dữ liệu cần cho các luật.
 * @param {{bienLuan?:object, rx?:Array}} extra dữ liệu do các editor con giữ
 */
export function collectContext(extra = {}) {
    const bl = extra.bienLuan || { vanDe: [] };
    const rx = extra.rx || [];
    const vanDe = bl.vanDe || [];

    const blText = fold(vanDe.map(v => [v.ten, v.yeuTo, ...(v.lamSang || []), ...(v.amTinh || []),
    ...(v.redFlags || []), ...(v.nguyenNhan || []).map(n => `${n.ten} ${n.lyDo} ${n.cls}`),
    ...(v.bienChung || []).map(b => `${b.ten} ${b.lapLuan}`)].join(' ')).join('\n'));

    const hx = pool(HX_IDS);
    const exam = pool(EXAM_IDS);

    return {
        bl, vanDe, rx,
        hx, exam,
        negatives: fold(val('hx-negatives')),
        hxexam: hx + '\n' + exam,
        past: pool(PAST_IDS),
        dx: pool(DX_IDS),
        ddx: fold(val('differential-diagnosis')),
        labs: pool(LAB_IDS),
        labsProposed: fold(val('labs-proposed')),
        // Mỗi dòng đề nghị tự mang mục đích + dấu hiệu mong tìm, nên lý do nằm ngay
        // trên dòng đó chứ không còn ô "biện luận đề nghị" riêng.
        labsLines: val('labs-proposed').split('\n').map(x => x.trim()).filter(Boolean),
        final: pool(FINAL_IDS),
        results: fold(val('labs-results')) + '\n' + clsText(),
        problems: fold(val('problem-list')),
        blText,
        rxText: fold(rx.map(r => `${r.ten} ${r.hamLuong}`).join('\n')),
        gender: fold(val('patient-gender')),
        age: parseInt(val('patient-age'), 10) || null,
        egfr: labNum(/egfr|loc cau than|mlct/i),
        // "chẩn đoán đang xét" = sơ bộ + phân biệt + xác định + các nhánh nguyên nhân
        allDx: pool(DX_IDS) + '\n' + fold(val('differential-diagnosis')) + '\n' + pool(FINAL_IDS) + '\n' + blText
    };
}

/* =====================================================================
   1. LUẬT BỆNH — dấu chứng bắt buộc, dấu chứng mâu thuẫn, CLS bắt buộc
   =====================================================================
   need    : dấu chứng kinh điển — không thấy trong bệnh sử / khám thì nhắc
   conflict: dấu chứng ngược với chẩn đoán — thấy mà không có chữ gỡ (unless) thì báo đỏ
   labs    : cận lâm sàng bắt buộc phải có trong mục XI
*/
export const DISEASE_RULES = [
    {
        k: 'Viêm phổi cộng đồng', re: /viem phoi|vpcd|viem phe quan phoi/,
        need: [
            { p: 'hx', re: /\bho\b|khac dam|dam |sot|kho tho|lanh run/, label: 'ho / khạc đàm / sốt / khó thở', tab: 'lydo-tiensu', field: 'illness-history' },
            { p: 'exam', re: /ran no|ran am|ran nuoc|dong dac|rung thanh tang|go duc|ri rao phe nang giam/, label: 'ran nổ – ran ẩm hoặc hội chứng đông đặc khi khám phổi', tab: 'kham-benh', field: 'exam-lung' }
        ],
        labs: [{ re: /x[ -]?quang nguc|xq nguc|ct nguc/, add: 'X-quang ngực thẳng' },
        { re: /cong thuc mau|\bctm\b|huyet do/, add: 'Công thức máu' },
        { re: /crp|procalcitonin|\bpct\b/, add: 'CRP – Procalcitonin' }]
    },
    {
        k: 'Hội chứng vành cấp / Nhồi máu cơ tim', re: /hoi chung vanh cap|nhoi mau co tim|\bnmct\b|\bacs\b|dau that nguc khong on dinh/,
        need: [
            { p: 'hx', re: /dau nguc|de nang|de nghet|that nguc|bop nghet/, label: 'tính chất đau ngực (đè nặng / bóp nghẹt, hướng lan, thời gian cơn)', tab: 'lydo-tiensu', field: 'hx-sym-char' }
        ],
        labs: [{ re: /\becg\b|dien tam do|dien tim/, add: 'ECG 12 chuyển đạo khẩn' },
        { re: /troponin|men tim|\bck-?mb\b|hs-?ctn/, add: 'Troponin I/T siêu nhạy (hs-cTn)' }],
        severity: 'HIGH'
    },
    {
        k: 'Suy tim / đợt mất bù', re: /suy tim|mat bu tim|phu phoi cap/,
        need: [
            { p: 'exam', re: /tinh mach co noi|tmc noi|gan to|phan hoi gan|phu chan|phu hai chan|ran am day phoi/, label: 'dấu ứ trệ tuần hoàn (TM cổ nổi, gan to, phản hồi gan – TM cổ, phù chân)', tab: 'kham-benh', field: 'exam-heart' },
            { p: 'all', re: /nyha|phan do|giai doan [abcd]|\bef\b/, label: 'phân độ NYHA hoặc giai đoạn ACC/AHA', tab: 'chan-doan-dieu-tri', field: 'dx1-stage' }
        ],
        labs: [{ re: /nt-?probnp|\bbnp\b/, add: 'NT-proBNP' },
        { re: /sieu am tim|echo tim/, add: 'Siêu âm tim' },
        { re: /\becg\b|dien tam do/, add: 'ECG' }]
    },
    {
        k: 'Viêm ruột thừa cấp', re: /viem ruot thua/,
        need: [{ p: 'exam', re: /ho chau (p|phai)|hcp\b|mcburney|mac ?burney|de khang|phan ung thanh bung|blumberg/, label: 'điểm đau hố chậu phải / McBurney hoặc đề kháng thành bụng', tab: 'kham-benh', field: 'exam-abdomen' }],
        conflict: [{
            p: 'hxexam', re: /ho chau (t|trai)|hct\b|ha suon (t|trai)|hong (t|trai)/,
            unless: /ho chau (p|phai)|mcburney|mac ?burney|dau chuyen|di chuyen xuong ho chau/,
            title: 'Vị trí đau không hợp với viêm ruột thừa',
            msg: 'Bệnh sử / khám ghi đau ở vùng trái (hố chậu trái, hạ sườn trái) trong khi chẩn đoán là Viêm ruột thừa cấp — vốn đau khu trú hố chậu phải. Kiểm tra lại tiền sử đau chuyển vị trí từ thượng vị xuống hố chậu phải, hoặc cân nhắc đảo ngược phủ tạng.',
            tab: 'kham-benh', field: 'exam-abdomen'
        }],
        labs: [{ re: /cong thuc mau|\bctm\b/, add: 'Công thức máu' }, { re: /sieu am bung|\bsadb\b|ct bung/, add: 'Siêu âm bụng' }]
    },
    {
        k: 'Viêm phúc mạc', re: /viem phuc mac/,
        conflict: [{
            p: 'exam', re: /bung mem|khong diem dau|khong de khang|bung xep/,
            unless: /de khang|cam ung phuc mac|phan ung thanh bung|bung cung|co cung thanh bung/,
            title: 'Khám bụng mâu thuẫn với viêm phúc mạc',
            msg: 'Phần khám ghi bụng mềm / không điểm đau nhưng chẩn đoán là Viêm phúc mạc. Viêm phúc mạc bắt buộc phải có đề kháng thành bụng hoặc cảm ứng phúc mạc — xem lại phần khám bụng hoặc xem lại chẩn đoán.',
            tab: 'kham-benh', field: 'exam-abdomen', severity: 'HIGH'
        }],
        labs: [{ re: /x[ -]?quang bung|bung dung|ct bung/, add: 'X-quang bụng đứng không sửa soạn' }]
    },
    {
        k: 'Sốt xuất huyết Dengue', re: /sot xuat huyet|dengue|\bsxh\b/,
        need: [{ p: 'hx', re: /sot|xuat huyet|cham xuat huyet|chay mau|dau co|nhuc mo mat/, label: 'sốt cao + dấu xuất huyết / đau cơ / nhức hố mắt', tab: 'lydo-tiensu', field: 'illness-history' }],
        labs: [{ re: /cong thuc mau|\bctm\b|tieu cau|hematocrit|\bhct\b/, add: 'Công thức máu (Hct – tiểu cầu) mỗi ngày' },
        { re: /ns1|dengue|\bigm\b/, add: 'NS1 / IgM Dengue' }]
    },
    {
        k: 'Đột quỵ não', re: /dot quy|nhoi mau nao|xuat huyet nao|tai bien mach mau nao|\btbmmn\b/,
        need: [
            { p: 'hxexam', re: /yeu|liet|meo mieng|noi dam|noi kho|that ngon|roi loan tri giac|te nua nguoi/, label: 'dấu thần kinh định vị (yếu liệt, méo miệng, nói khó)', tab: 'kham-benh', field: 'exam-neuro-msk' },
            { p: 'all', re: /gio khoi phat|thoi diem khoi phat|dot ngot|cua so|\bnihss\b/, label: 'thời điểm khởi phát chính xác (để tính cửa sổ điều trị) hoặc thang điểm NIHSS', tab: 'lydo-tiensu', field: 'hx-onset-date' }
        ],
        labs: [{ re: /ct (so nao|scan so|nao)|mri nao|chup so nao/, add: 'CT scan sọ não không cản quang khẩn' },
        { re: /duong huyet|glucose/, add: 'Đường huyết mao mạch' }],
        severity: 'HIGH'
    },
    {
        k: 'Viêm màng não', re: /viem mang nao|viem nao mang nao/,
        need: [{ p: 'exam', re: /co guong|co cung gay|kernig|brudzinski|dau mang nao/, label: 'dấu màng não (cổ gượng, Kernig, Brudzinski)', tab: 'kham-benh', field: 'exam-neuro-msk' }],
        labs: [{ re: /dich nao tuy|choc do that lung|\bdnt\b/, add: 'Chọc dò dịch não tủy' }],
        severity: 'HIGH'
    },
    {
        k: 'Xuất huyết tiêu hóa', re: /xuat huyet tieu hoa|\bxhth\b/,
        need: [{ p: 'hxexam', re: /non ra mau|oi ra mau|tieu phan den|di cau phan den|melena|tieu mau|hematemesis/, label: 'nôn ra máu / tiêu phân đen', tab: 'lydo-tiensu', field: 'illness-history' }],
        labs: [{ re: /cong thuc mau|\bctm\b|hemoglobin|\bhb\b/, add: 'Công thức máu' },
        { re: /noi soi (thuc quan|da day|tieu hoa)|\bnsdd\b|egd/, add: 'Nội soi thực quản – dạ dày – tá tràng' },
        { re: /nhom mau|dong mau|\bpt\b/, add: 'Nhóm máu – đông máu toàn bộ' }]
    },
    {
        k: 'Viêm tụy cấp', re: /viem tuy cap/,
        need: [{ p: 'hxexam', re: /dau thuong vi|dau bung tren|lan ra sau lung|xuyen ra sau/, label: 'đau thượng vị lan ra sau lưng', tab: 'lydo-tiensu', field: 'hx-sym-site' }],
        labs: [{ re: /amylase|lipase/, add: 'Amylase – Lipase máu' }, { re: /sieu am bung|ct bung/, add: 'Siêu âm bụng / CT bụng cản quang' }]
    },
    {
        k: 'Xơ gan mất bù', re: /xo gan/,
        need: [{ p: 'exam', re: /bang bung|co truong|tuan hoan bang he|sao mach|long ban tay son|vang da|lach to|phu/, label: 'dấu suy tế bào gan / tăng áp cửa (báng bụng, tuần hoàn bàng hệ, sao mạch, vàng da)', tab: 'kham-benh', field: 'exam-abdomen' }],
        labs: [{ re: /albumin/, add: 'Albumin máu' }, { re: /\bpt\b|inr|dong mau/, add: 'PT – INR' },
        { re: /bilirubin/, add: 'Bilirubin toàn phần – trực tiếp' }, { re: /sieu am bung/, add: 'Siêu âm bụng' }]
    },
    {
        k: 'Đợt cấp COPD', re: /copd|benh phoi tac nghen/,
        need: [{ p: 'hxexam', re: /kho tho|khac dam|dam duc|kho khe|ran ngay|long nguc hinh thung/, label: 'tam chứng đợt cấp (khó thở tăng, đàm tăng, đàm đổi màu)', tab: 'lydo-tiensu', field: 'illness-history' }],
        labs: [{ re: /khi mau dong mach|\bkmdm\b|\babg\b/, add: 'Khí máu động mạch' }, { re: /x[ -]?quang nguc|xq nguc/, add: 'X-quang ngực thẳng' }]
    },
    {
        k: 'Cơn hen phế quản', re: /hen phe quan|con hen|\basthma\b/,
        need: [{ p: 'exam', re: /ran ngay|ran rit|kho khe|wheez|thi tho ra keo dai/, label: 'ran ngáy – ran rít / khò khè thì thở ra', tab: 'kham-benh', field: 'exam-lung' }],
        labs: [{ re: /spo2|khi mau|\bpef\b|luu luong dinh/, add: 'SpO2 – PEF trước và sau giãn phế quản' }]
    },
    {
        k: 'Nhiễm trùng tiểu', re: /nhiem trung tieu|nhiem khuan tiet nieu|viem bang quang|viem than be than/,
        need: [{ p: 'hxexam', re: /tieu gat|tieu buot|tieu lat nhat|tieu duc|tieu mau|dau hong lung|rung than|sot/, label: 'tiểu gắt buốt / tiểu đục hoặc đau hông lưng – rung thận (+)', tab: 'lydo-tiensu', field: 'hx-urine' }],
        labs: [{ re: /tong phan tich nuoc tieu|\btptnt\b|nuoc tieu/, add: 'Tổng phân tích nước tiểu' }, { re: /cay nuoc tieu/, add: 'Cấy nước tiểu + kháng sinh đồ' }]
    },
    {
        k: 'Tắc ruột', re: /tac ruot|ban tac ruot/,
        need: [{ p: 'hxexam', re: /bi trung|bi dai tien|non|bung chuong|dau quan con|nhu dong tang|dau ran/, label: 'tứ chứng tắc ruột (đau quặn cơn, nôn, bí trung – đại tiện, bụng chướng)', tab: 'kham-benh', field: 'exam-abdomen' }],
        labs: [{ re: /x[ -]?quang bung|bung dung|ct bung/, add: 'X-quang bụng đứng không sửa soạn' }, { re: /ion do|dien giai/, add: 'Ion đồ' }]
    },
    {
        k: 'Suy thận cấp / bệnh thận mạn', re: /suy than|benh than man|ton thuong than cap|\bakii?\b|\bckd\b/,
        labs: [{ re: /creatinin|ure\b|\bbun\b/, add: 'Ure – Creatinin máu' }, { re: /ion do|kali|dien giai/, add: 'Ion đồ (đặc biệt Kali)' },
        { re: /tong phan tich nuoc tieu|\btptnt\b/, add: 'Tổng phân tích nước tiểu' }, { re: /sieu am (bung|he nieu|than)/, add: 'Siêu âm hệ niệu' }]
    },
    {
        k: 'Thuyên tắc phổi', re: /thuyen tac phoi|thuyen tac dong mach phoi/,
        labs: [{ re: /d-?dimer/, add: 'D-dimer' }, { re: /ct-?pa|ct dong mach phoi|ctpa/, add: 'CT động mạch phổi (CT-PA)' },
        { re: /sieu am doppler (mach|tinh mach|chi duoi)/, add: 'Siêu âm Doppler tĩnh mạch chi dưới' }],
        severity: 'HIGH'
    },
    {
        k: 'Nhiễm trùng huyết', re: /nhiem trung huyet|nhiem khuan huyet|\bsepsis\b|soc nhiem trung/,
        need: [{ p: 'all', re: /qsofa|\bsofa\b|lactat|tri giac|tut huyet ap/, label: 'đánh giá qSOFA / SOFA (tri giác, nhịp thở, huyết áp) hoặc lactat', tab: 'chan-doan-dieu-tri', field: 'dx1-stage' }],
        labs: [{ re: /cay mau/, add: 'Cấy máu 2 mẫu trước kháng sinh' }, { re: /lactat/, add: 'Lactat máu' },
        { re: /procalcitonin|\bpct\b/, add: 'Procalcitonin' }],
        severity: 'HIGH'
    },
    {
        k: 'Tiền sản giật', re: /tien san giat|san giat/,
        need: [{ p: 'all', re: /huyet ap|dam nieu|protein nieu|phu/, label: 'huyết áp ≥ 140/90 và đạm niệu', tab: 'kham-benh', field: 'vital-bp' }],
        labs: [{ re: /dam nieu|protein nieu/, add: 'Đạm niệu 24 giờ / tỉ số protein–creatinin niệu' },
        { re: /tieu cau|cong thuc mau/, add: 'Công thức máu – tiểu cầu' }, { re: /\bast\b|\balt\b|men gan|\bldh\b/, add: 'AST – ALT – LDH (tầm soát HELLP)' }],
        severity: 'HIGH'
    },
    {
        k: 'Lao phổi', re: /lao phoi/,
        need: [{ p: 'hx', re: /ho keo dai|sot ve chieu|sut can|do mo hoi dem|ho ra mau/, label: 'ho kéo dài / sốt về chiều / sụt cân / đổ mồ hôi đêm', tab: 'lydo-tiensu', field: 'illness-history' }],
        labs: [{ re: /afb|genexpert|gene ?xpert|soi dam/, add: 'AFB đàm – GeneXpert' }, { re: /x[ -]?quang nguc|xq nguc/, add: 'X-quang ngực thẳng' }]
    },
    {
        k: 'Đái tháo đường nhiễm toan ceton', re: /nhiem toan ceton|\bdka\b|toan ceton/,
        labs: [{ re: /khi mau|\bkmdm\b/, add: 'Khí máu động mạch' }, { re: /ceton/, add: 'Ceton máu / ceton niệu' },
        { re: /ion do|kali/, add: 'Ion đồ (theo dõi Kali mỗi 2–4 giờ)' }],
        severity: 'HIGH'
    }
];

/* =====================================================================
   2. LUẬT TRIỆU CHỨNG BÁO ĐỘNG — có dấu này thì mục X phải có nhánh loại trừ
   ===================================================================== */
export const RED_FLAG_RULES = [
    {
        k: 'Đau ngực cấp', re: /dau nguc/,
        musts: ['Nhồi máu cơ tim cấp', 'Bóc tách động mạch chủ ngực', 'Thuyên tắc phổi', 'Tràn khí màng phổi áp lực'],
        keys: [/nhoi mau co tim|vanh cap|\bnmct\b/, /boc tach|dissection/, /thuyen tac phoi/, /tran khi mang phoi|\btkmp\b|pneumothorax/]
    },
    {
        k: 'Đau đầu dữ dội khởi phát đột ngột (sét đánh)', re: /dau dau.{0,40}(du doi|dot ngot|set danh)|set danh|thunderclap/,
        musts: ['Xuất huyết dưới nhện', 'Viêm màng não'],
        keys: [/duoi nhen|\bsah\b/, /viem mang nao/]
    },
    {
        k: 'Sốt + đau hạ sườn phải + vàng da (tam chứng Charcot)', re: /(?=[\s\S]*sot)(?=[\s\S]*(ha suon (p|phai)|hsp\b))(?=[\s\S]*vang da)/,
        musts: ['Viêm đường mật cấp do sỏi', 'Nhiễm trùng huyết đường mật'],
        keys: [/viem duong mat|nhiem trung duong mat/, /nhiem trung huyet|\bsepsis\b/]
    },
    {
        k: 'Khó thở cấp', re: /kho tho.{0,30}(cap|dot ngot|du doi)|suy ho hap/,
        musts: ['Phù phổi cấp', 'Thuyên tắc phổi', 'Tràn khí màng phổi áp lực', 'Sốc phản vệ'],
        keys: [/phu phoi cap/, /thuyen tac phoi/, /tran khi mang phoi|\btkmp\b/, /phan ve/]
    },
    {
        k: 'Đau bụng cấp có phản ứng thành bụng', re: /de khang|cam ung phuc mac|phan ung thanh bung|bung cung/,
        musts: ['Thủng tạng rỗng', 'Viêm phúc mạc'],
        keys: [/thung tang rong|thung (da day|ruot|tang)/, /viem phuc mac/]
    },
    {
        k: 'Yếu liệt nửa người khởi phát đột ngột', re: /(yeu|liet|te).{0,20}nua nguoi|liet nua nguoi/,
        musts: ['Nhồi máu não', 'Xuất huyết não', 'Hạ đường huyết'],
        keys: [/nhoi mau nao/, /xuat huyet nao/, /ha duong huyet|hypoglycemi/]
    },
    {
        k: 'Tụt huyết áp / sốc', re: /\bsoc\b|tut huyet ap|huyet ap tut|mach nhanh nhe/,
        musts: ['Sốc nhiễm trùng', 'Sốc giảm thể tích', 'Sốc tim', 'Sốc phản vệ'],
        keys: [/soc nhiem trung/, /soc (giam the tich|mat mau)/, /soc tim/, /soc phan ve|phan ve/]
    },
    {
        k: 'Sốt kèm rối loạn tri giác hoặc cổ gượng', re: /(?=[\s\S]*sot)(?=[\s\S]*(co guong|roi loan tri giac|li bi|hon me))/,
        musts: ['Viêm màng não', 'Viêm não'],
        keys: [/viem mang nao/, /viem nao/]
    },
    {
        k: 'Đau bụng ở phụ nữ tuổi sinh đẻ có trễ kinh', re: /(?=[\s\S]*dau bung)(?=[\s\S]*(tre kinh|mat kinh|cham kinh|que thu thai))/,
        musts: ['Thai ngoài tử cung vỡ'],
        keys: [/thai ngoai tu cung|chua ngoai tu cung/]
    },
    {
        k: 'Nôn ra máu / tiêu phân đen', re: /non ra mau|oi ra mau|tieu phan den|melena/,
        musts: ['Vỡ giãn tĩnh mạch thực quản', 'Sốc mất máu'],
        keys: [/gian tinh mach thuc quan|vo gian|varice/, /soc mat mau|soc giam the tich/]
    }
];

/* =====================================================================
   3. LUẬT AN TOÀN THUỐC — dị ứng, eGFR, bệnh nền, tương tác
   ===================================================================== */
export const DRUG_SAFETY_RULES = [
    {
        id: 'penicillin',
        drug: /amoxicillin|augmentin|ampicillin|unasyn|penicillin|piperacillin|tazobactam|oxacillin|cloxacillin/,
        when: (c) => /di ung/.test(c.past) && /penicillin|amoxicillin|augmentin|ampicillin|beta ?lactam/.test(c.past),
        severity: 'HIGH',
        title: 'Chống chỉ định: dị ứng nhóm Penicillin',
        msg: (d) => `Tiền căn ghi nhận dị ứng nhóm Penicillin nhưng toa đang kê ${d}. Nguy cơ sốc phản vệ.`,
        act: 'Cân nhắc đổi sang Quinolone (Levofloxacin) hoặc Macrolide (Azithromycin)'
    },
    {
        id: 'ceph1-cross',
        drug: /cefazolin|cephalexin|cefalexin|cefadroxil/,
        when: (c) => /di ung/.test(c.past) && /penicillin|amoxicillin|augmentin/.test(c.past),
        severity: 'MEDIUM',
        title: 'Thận trọng: dị ứng chéo Cephalosporin thế hệ 1',
        msg: (d) => `Bệnh nhân dị ứng Penicillin, ${d} là Cephalosporin thế hệ 1 nên có nguy cơ dị ứng chéo (chuỗi bên tương tự).`,
        act: 'Ưu tiên Cephalosporin thế hệ 3 hoặc nhóm khác nếu tiền căn dị ứng nặng'
    },
    {
        id: 'nsaid-egfr',
        drug: /ibuprofen|diclofenac|meloxicam|celecoxib|ketorolac|naproxen|piroxicam/,
        when: (c) => c.egfr != null && c.egfr < 30,
        severity: 'HIGH',
        title: 'Chống chỉ định NSAID khi eGFR < 30',
        msg: (d) => `eGFR đo được dưới 30 mL/ph nhưng toa có ${d} (NSAID). Nguy cơ tổn thương thận cấp tiến triển.`,
        act: 'Thay bằng Paracetamol, hội chẩn nếu cần giảm đau mạnh'
    },
    {
        id: 'metformin-egfr',
        drug: /metformin|glucophage/,
        when: (c) => c.egfr != null && c.egfr < 30,
        severity: 'HIGH',
        title: 'Chống chỉ định Metformin khi eGFR < 30',
        msg: (d) => `eGFR dưới 30 mL/ph mà toa vẫn có ${d}. Nguy cơ nhiễm toan lactic.`,
        act: 'Ngưng Metformin, chuyển sang Insulin trong giai đoạn cấp'
    },
    {
        id: 'beta-block-asthma',
        drug: /propranolol|nadolol/,
        when: (c) => /hen phe quan|\bhen\b|copd|tac nghen/.test(c.past + c.allDx),
        severity: 'HIGH',
        title: 'Chẹn beta không chọn lọc trên bệnh nhân co thắt phế quản',
        msg: (d) => `Bệnh nhân có hen phế quản / COPD nhưng toa kê ${d} (chẹn beta không chọn lọc). Nguy cơ khởi phát cơn co thắt phế quản nặng.`,
        act: 'Đổi sang chẹn beta chọn lọc β1 (Bisoprolol, Metoprolol) và theo dõi sát'
    },
    {
        id: 'nsaid-ulcer',
        drug: /ibuprofen|diclofenac|meloxicam|ketorolac|naproxen|aspirin|piroxicam/,
        when: (c) => /loet (da day|ta trang)|xuat huyet tieu hoa|\bxhth\b/.test(c.past + c.allDx)
            && !/omeprazol|pantoprazol|esomeprazol|rabeprazol|lansoprazol/.test(c.rxText),
        severity: 'HIGH',
        title: 'NSAID trên nền loét dạ dày – tá tràng, chưa có PPI',
        msg: (d) => `Tiền căn loét dạ dày – tá tràng / xuất huyết tiêu hóa nhưng toa có ${d} mà không kèm thuốc ức chế bơm proton.`,
        act: 'Thêm PPI (Pantoprazole 40 mg) hoặc bỏ NSAID'
    },
    {
        id: 'corticoid-ulcer',
        drug: /methylprednisolon|prednisolon|prednison|dexamethason|hydrocortison/,
        when: (c) => /loet (da day|ta trang)|xuat huyet tieu hoa|\bxhth\b/.test(c.past + c.allDx)
            && !/omeprazol|pantoprazol|esomeprazol|rabeprazol|lansoprazol/.test(c.rxText),
        severity: 'MEDIUM',
        title: 'Corticoid trên nền loét dạ dày, chưa có PPI bảo vệ',
        msg: (d) => `Bệnh nhân có loét dạ dày – tá tràng mà toa kê ${d} không kèm PPI.`,
        act: 'Thêm PPI bảo vệ dạ dày trong suốt đợt dùng corticoid'
    },
    {
        id: 'nsaid-heart-failure',
        drug: /ibuprofen|diclofenac|meloxicam|ketorolac|naproxen/,
        when: (c) => /suy tim|xo gan|co truong/.test(c.past + c.allDx),
        severity: 'MEDIUM',
        title: 'NSAID trên bệnh nhân suy tim / xơ gan',
        msg: (d) => `${d} gây giữ muối nước và giảm tưới máu thận, làm nặng thêm suy tim / báng bụng.`,
        act: 'Ưu tiên Paracetamol để giảm đau'
    },
    {
        id: 'acei-pregnancy',
        drug: /enalapril|captopril|lisinopril|perindopril|losartan|valsartan|telmisartan|irbesartan/,
        when: (c) => /co thai|mang thai|thai ky|dang co thai/.test(c.past + c.hx),
        severity: 'HIGH',
        title: 'ƯCMC / ƯCTT chống chỉ định trong thai kỳ',
        msg: (d) => `Bệnh nhân đang mang thai nhưng toa kê ${d} — nhóm này gây độc thận và thiểu ối cho thai.`,
        act: 'Đổi sang Methyldopa, Labetalol hoặc Nifedipine tác dụng kéo dài'
    },
    {
        id: 'aminoglycoside-egfr',
        drug: /gentamicin|amikacin|tobramycin|vancomycin/,
        when: (c) => c.egfr != null && c.egfr < 30,
        severity: 'MEDIUM',
        title: 'Kháng sinh độc thận khi eGFR thấp',
        msg: (d) => `eGFR dưới 30 mL/ph mà toa có ${d}. Cần chỉnh liều theo độ lọc cầu thận và theo dõi nồng độ đáy.`,
        act: 'Chỉnh liều theo eGFR, theo dõi creatinin mỗi 2–3 ngày'
    },
    {
        id: 'warfarin-nsaid',
        drug: /ibuprofen|diclofenac|aspirin|naproxen|ketorolac/,
        when: (c) => /warfarin|acenocoumarol|sintrom|rivaroxaban|apixaban|dabigatran|clopidogrel/.test(c.rxText),
        severity: 'MEDIUM',
        title: 'Tương tác: NSAID + thuốc kháng đông / kháng kết tập',
        msg: (d) => `Toa có đồng thời ${d} và thuốc kháng đông – kháng kết tập tiểu cầu. Nguy cơ xuất huyết tiêu hóa tăng rõ.`,
        act: 'Bỏ NSAID hoặc thêm PPI và theo dõi dấu xuất huyết'
    },
    {
        id: 'spiro-acei-kali',
        drug: /spironolacton|verospiron|eplerenon/,
        when: (c) => /enalapril|captopril|lisinopril|perindopril|losartan|valsartan|telmisartan/.test(c.rxText)
            && c.egfr != null && c.egfr < 45,
        severity: 'MEDIUM',
        title: 'Nguy cơ tăng Kali máu',
        msg: (d) => `Phối hợp ${d} với ƯCMC/ƯCTT trên nền eGFR giảm — nguy cơ tăng Kali máu nặng.`,
        act: 'Kiểm tra Kali máu trước và sau 5–7 ngày dùng thuốc'
    }
];

/* =====================================================================
   4. Bộ máy chạy luật
   ===================================================================== */
let seq = 0;
const mk = (o) => ({ id: `val_${++seq}`, severity: 'MEDIUM', type: 'INFO', ...o });
const has = (text, re) => re.test(text);

function ruleActive(c, r) {
    return has(c.dx, r.re) || has(c.ddx, r.re) || has(c.final, r.re)
        || has(c.blText, r.re) || has(c.problems, r.re);
}

function runDiseaseRules(c) {
    const out = [];
    for (const r of DISEASE_RULES) {
        if (!ruleActive(c, r)) continue;

        (r.need || []).forEach(n => {
            const text = n.p === 'all' ? `${c.hxexam}\n${c.dx}\n${c.final}\n${c.blText}` : (c[n.p] ?? c.hxexam);
            if (has(text, n.re)) return;
            out.push(mk({
                type: 'MISSING_CRITERIA', severity: r.severity === 'HIGH' ? 'MEDIUM' : 'LOW',
                title: `Thiếu dấu chứng kinh điển — ${r.k}`,
                message: `Đang chẩn đoán ${r.k} nhưng bệnh án chưa ghi nhận ${n.label}. Bổ sung để phần biện luận có bằng chứng, hoặc xem lại chẩn đoán.`,
                actionText: 'Đi tới ô cần bổ sung', targetTab: n.tab, targetField: n.field
            }));
        });

        (r.conflict || []).forEach(cf => {
            const text = c[cf.p] ?? c.hxexam;
            if (!has(text, cf.re)) return;
            if (cf.unless && has(text, cf.unless)) return;
            out.push(mk({
                type: 'CONFLICT', severity: cf.severity || 'HIGH',
                title: cf.title, message: cf.msg,
                actionText: 'Xem lại ô này', targetTab: cf.tab, targetField: cf.field
            }));
        });

        const missLab = (r.labs || []).filter(l => !has(c.labs, l.re) && !has(c.results, l.re)).map(l => l.add);
        if (missLab.length) {
            out.push(mk({
                type: 'MISSING_LAB', severity: r.severity === 'HIGH' ? 'HIGH' : 'MEDIUM',
                title: `Thiếu cận lâm sàng bắt buộc — ${r.k}`,
                message: `Chẩn đoán ${r.k} cần đề nghị: ${missLab.join('; ')}. Mục XI hiện chưa có.`,
                actionText: `Thêm ${missLab.length} cận lâm sàng vào mục XI`,
                targetTab: 'chan-doan-dieu-tri', targetField: 'labs-proposed',
                autoFix: { targetField: 'labs-proposed', appendValue: missLab.join('\n') }
            }));
        }
    }
    return out;
}

function runRedFlagRules(c) {
    const out = [];
    for (const r of RED_FLAG_RULES) {
        if (!has(c.hxexam, r.re)) continue;
        const missing = r.musts.filter((_, i) => !has(c.allDx, r.keys[i]));
        if (!missing.length) continue;
        out.push(mk({
            type: 'RED_FLAG', severity: 'HIGH',
            title: `Chưa loại trừ bệnh cảnh nguy hiểm — ${r.k}`,
            message: `Bệnh án có ${r.k.toLowerCase()} nhưng mục X chưa có nhánh loại trừ: ${missing.join('; ')}.`,
            actionText: 'Đưa vào "cần loại trừ khẩn" ở mục X',
            targetTab: 'chan-doan-dieu-tri', targetField: 'bl-host',
            autoFix: { redFlags: missing }
        }));
    }
    return out;
}

function runDrugRules(c) {
    const out = [];
    for (const r of DRUG_SAFETY_RULES) {
        const hit = (c.rx || []).filter(x => r.drug.test(fold(x.ten || '')));
        if (!hit.length || !r.when(c)) continue;
        const names = [...new Set(hit.map(x => String(x.ten).trim()))].join(', ');
        out.push(mk({
            type: 'CONTRAINDICATION', severity: r.severity,
            title: r.title, message: r.msg(names), actionText: r.act,
            targetTab: 'ket-luan', targetField: 'rx-list'
        }));
    }
    return out;
}

/* ---------- 3b. Thuốc đang dùng ở nhà ↔ y lệnh nội trú ----------
   Bệnh nhân vào viện là thuốc nền bị bỏ quên — lỗi kinh điển và nguy hiểm
   (ngưng chẹn beta, ngưng chống đông, ngưng insulin). Ở đây chỉ soi những
   thuốc điều trị bệnh mạn tính, thuốc uống một đợt thì không tính. */
function runHomeDrugRules(c) {
    const nha = parseDoi(val('history-drugs'), ' — ', 'điều trị')
        .map(r => ({ ten: String(r.a || '').trim(), benh: String(r.c || '').trim() }))
        .filter(r => r.ten && benhCuaThuoc(r.ten).length);
    const bo = nha.filter(r => !c.rxText.includes(fold(r.ten).split(' ')[0]));
    if (!bo.length || !c.rx.length) return [];
    return [mk({
        type: 'MISSING', severity: 'MEDIUM',
        title: 'Thuốc nền đang dùng ở nhà chưa thấy trong y lệnh',
        message: `Tiền căn ghi bệnh nhân đang dùng ${bo.map(r => r.ten + (r.benh ? ` (${r.benh})` : '')).join(', ')} `
            + 'nhưng toa nội trú không có. Thuốc bệnh mạn tính phải nói rõ là tiếp tục, chỉnh liều hay tạm ngưng — và ngưng thì vì lý do gì.',
        actionText: 'Bổ sung vào y lệnh hoặc ghi rõ lý do tạm ngưng',
        targetTab: 'ket-luan', targetField: 'rx-list'
    })];
}

/* ---------- 3c. Mốc thời gian & danh tính phải khớp nhau ----------
   Những lỗi này không phải lỗi y khoa mà là lỗi ghi chép, nhưng hội đồng bắt
   ngay: bệnh khởi phát sau ngày nhập viện, tuổi lệch năm sinh, bệnh án nhi
   của người 60 tuổi. Máy so giùm vì mắt người đọc dễ lướt qua. */
const dayOf = (v) => { const d = new Date(String(v || '')); return isNaN(d) ? null : d; };
const dayVn = (v) => String(v || '').split('T')[0].split('-').reverse().join('/');

function runConsistencyRules(c) {
    const out = [];
    const push = (o) => out.push(mk({ type: 'CONFLICT', severity: 'MEDIUM', ...o }));
    const nhapVien = dayOf(val('admission-date'));
    const khoiPhat = dayOf(val('hx-onset-date'));
    const lamBenhAn = dayOf(val('record-datetime'));
    const chanThuong = dayOf(val('tr-time'));
    const homNay = new Date(); homNay.setHours(23, 59, 59, 999);

    if (nhapVien && khoiPhat && khoiPhat > nhapVien) {
        push({
            severity: 'HIGH', title: 'Ngày khởi phát sau ngày nhập viện',
            message: `Bệnh khởi phát ${dayVn(val('hx-onset-date'))} mà nhập viện ${dayVn(val('admission-date'))} — bệnh sử đang chạy ngược thời gian.`,
            actionText: 'Sửa lại ngày khởi phát hoặc ngày nhập viện',
            targetTab: 'lydo-tiensu', targetField: 'hx-onset-date'
        });
    }
    if (nhapVien && nhapVien > homNay) {
        push({
            title: 'Ngày nhập viện nằm ở tương lai',
            message: `Ngày nhập viện ghi ${dayVn(val('admission-date'))}, muộn hơn hôm nay.`,
            actionText: 'Kiểm tra lại ngày nhập viện', targetTab: 'hanh-chinh', targetField: 'admission-date'
        });
    }
    if (nhapVien && lamBenhAn && lamBenhAn < nhapVien) {
        push({
            title: 'Làm bệnh án trước cả lúc bệnh nhân nhập viện',
            message: `Ngày làm bệnh án ${dayVn(val('record-datetime'))} sớm hơn ngày nhập viện ${dayVn(val('admission-date'))}.`,
            actionText: 'Sửa ngày giờ làm bệnh án', targetTab: 'hanh-chinh', targetField: 'record-datetime'
        });
    }
    if (nhapVien && chanThuong && chanThuong > nhapVien) {
        push({
            title: 'Chấn thương xảy ra sau khi đã nhập viện',
            message: 'Thời điểm chấn thương ghi muộn hơn ngày nhập viện — xem lại cơ chế chấn thương.',
            actionText: 'Sửa thời điểm chấn thương', targetTab: 'lydo-tiensu', targetField: 'tr-time'
        });
    }

    // Tuổi ↔ năm sinh
    const tuoi = parseFloat(val('patient-age'));
    const namSinh = parseFloat(val('patient-yob'));
    const tuoiTheoNam = namSinh > 1900 ? new Date().getFullYear() - namSinh : null;
    if (tuoi > 0 && tuoiTheoNam != null && Math.abs(tuoi - tuoiTheoNam) > 1) {
        push({
            title: 'Tuổi không khớp năm sinh',
            message: `Ghi ${tuoi} tuổi nhưng năm sinh ${namSinh} ứng với ${tuoiTheoNam} tuổi.`,
            actionText: 'Sửa tuổi hoặc năm sinh', targetTab: 'hanh-chinh', targetField: 'patient-age'
        });
    }

    // Loại bệnh án ↔ tuổi / giới
    const loai = val('record-type');
    const tuoiThat = tuoi > 0 ? tuoi : tuoiTheoNam;
    if (loai === 'nhi' && tuoiThat != null && tuoiThat > 16) {
        push({
            title: 'Bệnh án nhi nhưng bệnh nhân đã lớn',
            message: `Đang chọn mẫu bệnh án Nhi trong khi bệnh nhân ${tuoiThat} tuổi.`,
            actionText: 'Đổi loại bệnh án', targetTab: 'hanh-chinh', targetField: 'record-type'
        });
    }
    if (loai === 'san' && /nam/.test(c.gender) && !/\bnu\b/.test(c.gender)) {
        push({
            severity: 'HIGH', title: 'Bệnh án sản khoa trên bệnh nhân nam',
            message: 'Loại bệnh án là Sản trong khi giới tính ghi Nam.',
            actionText: 'Kiểm tra lại giới tính / loại bệnh án', targetTab: 'hanh-chinh', targetField: 'record-type'
        });
    }
    if (!c.gender.trim()) {
        push({
            severity: 'LOW', title: 'Chưa chọn giới tính',
            message: 'Giới tính bỏ trống nên máy không rà được các mục sản – phụ khoa và các luật theo giới.',
            actionText: 'Chọn giới tính', targetTab: 'hanh-chinh', targetField: 'patient-gender'
        });
    }
    return out;
}

function runGenderAgeRules(c) {
    const out = [];
    const male = /nam/.test(c.gender) && !/\bnu\b/.test(c.gender);
    if (male) {
        if (/para|kinh nguyet|man kinh|sinh thuong|sinh mo|thai ky|luu thai/.test(c.past)) {
            out.push(mk({
                type: 'CONFLICT', severity: 'HIGH',
                title: 'Tiền căn sản khoa trên bệnh nhân nam',
                message: 'Giới tính ghi là Nam nhưng phần tiền căn có nội dung sản – phụ khoa (PARA, kinh nguyệt, sinh nở). Kiểm tra lại ô giới tính hoặc xóa phần tiền căn nhập nhầm.',
                actionText: 'Kiểm tra lại giới tính / tiền căn', targetTab: 'hanh-chinh', targetField: 'patient-gender'
            }));
        }
        if (/u xo tu cung|viem phan phu|thai ngoai tu cung|u nang buong trung|ung thu co tu cung|tien san giat/.test(c.allDx)) {
            out.push(mk({
                type: 'CONFLICT', severity: 'HIGH',
                title: 'Chẩn đoán phụ khoa trên bệnh nhân nam',
                message: 'Giới tính ghi là Nam nhưng chẩn đoán / biện luận có bệnh lý phụ khoa – sản khoa. Xem lại giới tính hoặc chẩn đoán.',
                actionText: 'Kiểm tra lại giới tính', targetTab: 'hanh-chinh', targetField: 'patient-gender'
            }));
        }
    }
    if (/\bnu\b/.test(c.gender) && /tien liet tuyen|phi dai tien liet|ung thu tinh hoan|hep bao quy dau/.test(c.allDx)) {
        out.push(mk({
            type: 'CONFLICT', severity: 'HIGH',
            title: 'Chẩn đoán nam khoa trên bệnh nhân nữ',
            message: 'Giới tính ghi là Nữ nhưng chẩn đoán là bệnh lý tiền liệt tuyến / nam khoa.',
            actionText: 'Kiểm tra lại giới tính', targetTab: 'hanh-chinh', targetField: 'patient-gender'
        }));
    }
    if (c.age != null && c.age < 16 && /tien liet tuyen|man kinh|thoai hoa khop|copd/.test(c.allDx)) {
        out.push(mk({
            type: 'CONFLICT', severity: 'MEDIUM',
            title: 'Chẩn đoán không hợp lứa tuổi',
            message: `Bệnh nhân ${c.age} tuổi nhưng chẩn đoán là bệnh lý của người lớn tuổi. Kiểm tra lại tuổi hoặc chẩn đoán.`,
            actionText: 'Kiểm tra lại tuổi', targetTab: 'hanh-chinh', targetField: 'patient-age'
        }));
    }
    return out;
}

/* ---------- 5. Đối chiếu kết quả CLS với chẩn đoán xác định (mục XIII) ---------- */
function runResultRules(c) {
    const out = [];
    if (!c.results.trim()) return out;

    if (/nhoi mau co tim|\bnmct\b|hoi chung vanh cap/.test(c.final)
        && /troponin.{0,30}(am tinh|khong tang|binh thuong)|men tim.{0,30}(am tinh|binh thuong)/.test(c.results)
        && !/troponin.{0,20}(tang|duong tinh)/.test(c.results)) {
        out.push(mk({
            type: 'RESULT_MISMATCH', severity: 'HIGH',
            title: 'Kết quả cận lâm sàng không ủng hộ chẩn đoán xác định',
            message: 'Chẩn đoán xác định ghi Nhồi máu cơ tim cấp nhưng men tim / ECG ghi nhận âm tính. Cân nhắc Cơn đau thắt ngực không ổn định hoặc đau ngực không do tim.',
            actionText: 'Xem lại chẩn đoán xác định', targetTab: 'ket-luan', targetField: 'dx2-main'
        }));
    }

    const nhiemTrung = /bach cau.{0,20}(tang|cao)|\bwbc\b.{0,20}(tang|cao)|crp.{0,20}(tang|cao)|neutrophil/.test(c.results);
    const thamNhiem = /tham nhiem|dong dac|mo phe nang|dam mo/.test(c.results);
    if (nhiemTrung && thamNhiem && !/viem phoi/.test(c.final)) {
        out.push(mk({
            type: 'SUGGEST', severity: 'LOW',
            title: 'Kết quả gợi ý viêm phổi',
            message: 'Bạch cầu / CRP tăng kèm hình ảnh thâm nhiễm phế nang trên X-quang — bộ ba này ủng hộ chẩn đoán Viêm phổi. Cân nhắc hoàn thiện chẩn đoán xác định ở mục XIII.',
            actionText: 'Ghi vào chẩn đoán xác định', targetTab: 'ket-luan', targetField: 'dx2-main',
            autoFix: { targetField: 'dx2-main', setValue: 'Viêm phổi cộng đồng' }
        }));
    }
    return out;
}

/* ---------- 6. Kiểm tra mạch logic giữa các mục VIII – IX – X – XI ---------- */
const INVASIVE = [
    [/ct[ -]?scan|chup cat lop/, 'CT scan'], [/\bmri\b|cong huong tu/, 'MRI'],
    [/noi soi/, 'Nội soi'], [/sinh thiet/, 'Sinh thiết'], [/choc do|choc dich/, 'Chọc dò'],
    [/chup mach|\bdsa\b/, 'Chụp mạch số hóa xóa nền']
];

function runStructureRules(c) {
    const out = [];
    const problems = val('problem-list').split('\n')
        .map(l => l.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);

    const chuaBienLuan = problems.filter(p => !c.blText.includes(fold(p).slice(0, 18)));
    if (problems.length && chuaBienLuan.length) {
        out.push(mk({
            type: 'MISSING_BRANCH', severity: 'MEDIUM',
            title: 'Có vấn đề chưa được biện luận',
            message: `Mục VIII đặt ${problems.length} vấn đề nhưng mục X còn thiếu nhánh cho: ${chuaBienLuan.join('; ')}.`,
            actionText: 'Tạo thẻ biện luận cho các vấn đề này',
            targetTab: 'chan-doan-dieu-tri', targetField: 'bl-host',
            autoFix: { syncProblems: true }
        }));
    }

    const coNghiNhieu = c.vanDe.some(v => (v.nguyenNhan || []).some(n => /nghi nhieu nhat/.test(fold(n.muc || ''))));
    if (c.vanDe.length && !coNghiNhieu) {
        out.push(mk({
            type: 'MISSING_BRANCH', severity: 'MEDIUM',
            title: 'Chưa chốt hướng nghĩ nhiều nhất',
            message: 'Bảng biện luận chưa có nhánh nào được đánh mức "Nghĩ nhiều nhất" — chưa suy ra được chẩn đoán sơ bộ ở mục IX.',
            actionText: 'Chọn mức cho nhánh chính ở mục X',
            targetTab: 'chan-doan-dieu-tri', targetField: 'bl-host'
        }));
    }

    if (c.vanDe.length && !val('dx1-main').trim()) {
        out.push(mk({
            type: 'MISSING_CRITERIA', severity: 'LOW',
            title: 'Chưa ghi chẩn đoán sơ bộ',
            message: 'Mục IX còn trống trong khi bảng biện luận đã có nội dung — bấm "Đổ vào chẩn đoán sơ bộ / phân biệt" hoặc gõ tay.',
            actionText: 'Đi tới chẩn đoán sơ bộ', targetTab: 'chan-doan-dieu-tri', targetField: 'dx1-main'
        }));
    }

    const clsBranch = [...new Set(c.vanDe.flatMap(v => (v.nguyenNhan || []).flatMap(n =>
        String(n.cls || '').split(/[;,\n]/).map(x => x.trim()).filter(Boolean))))];
    const chuaDo = clsBranch.filter(x => !c.labsProposed.includes(fold(x).slice(0, 12)));
    if (chuaDo.length) {
        out.push(mk({
            type: 'MISSING_LAB', severity: 'LOW',
            title: 'Cận lâm sàng ở mục X chưa đổ sang mục XI',
            message: `Các nhánh biện luận có ${chuaDo.length} cận lâm sàng chưa xuất hiện ở danh sách đề nghị: ${chuaDo.slice(0, 6).join('; ')}.`,
            actionText: 'Đổ sang mục XI', targetTab: 'chan-doan-dieu-tri', targetField: 'labs-proposed',
            autoFix: { targetField: 'labs-proposed', appendValue: chuaDo.join('\n') }
        }));
    }

    INVASIVE.forEach(([re, ten]) => {
        const line = c.labsLines.find(l => re.test(fold(l)));
        // Đủ lý do khi chính dòng đó đã ghi "để làm gì" và "tìm: dấu hiệu nào"
        if (!line || (line.includes(' — ') && /—\s*tìm:/i.test(line))) return;
        if (has(c.blText, re) && line.includes(' — ')) return;
        out.push(mk({
            type: 'UNJUSTIFIED_LAB', severity: 'LOW',
            title: `${ten} chưa nói rõ đề nghị để làm gì`,
            message: `Mục XI đề nghị ${ten} — đây là thăm dò xâm lấn / chi phí cao nên ngay trên dòng đó phải ghi dùng để xác định hay loại trừ bệnh cảnh nào, và mong tìm thấy dấu hiệu gì.`,
            actionText: 'Bổ sung mục đích', targetTab: 'chan-doan-dieu-tri', targetField: 'labs-proposed'
        }));
    });

    if (val('hx-sym-name').trim() && !val('hx-negatives').trim()) {
        out.push(mk({
            type: 'MISSING_CRITERIA', severity: 'LOW',
            title: 'Chưa có triệu chứng âm tính có giá trị',
            message: 'Không có triệu chứng âm tính thì phần chẩn đoán phân biệt sẽ thiếu căn cứ để loại trừ.',
            actionText: 'Ghi triệu chứng âm tính', targetTab: 'lydo-tiensu', targetField: 'hx-negatives'
        }));
    }
    return out;
}

const ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/**
 * Chạy toàn bộ luật trên dữ liệu hiện có của form.
 * @param {{bienLuan?:object, rx?:Array}} extra
 * @returns {Array} danh sách cảnh báo đã xếp theo mức nặng
 */
export function validateRecord(extra = {}) {
    seq = 0;
    const c = collectContext(extra);
    const all = [
        ...runDiseaseRules(c), ...runRedFlagRules(c), ...runDrugRules(c), ...runHomeDrugRules(c), ...runConsistencyRules(c),
        ...runGenderAgeRules(c), ...runResultRules(c), ...runStructureRules(c)
    ];
    // Trùng tiêu đề thì giữ một cái cho đỡ rối mắt
    const seen = new Set();
    return all.filter(a => !seen.has(a.title) && seen.add(a.title))
        .sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}

/**
 * Rà từng dòng y lệnh để bảng thuốc hiện cảnh báo ngay tại dòng đang kê,
 * thay vì phải mở thanh giám sát logic mới thấy.
 * @param {Array} rows các dòng y lệnh { ten, hamLuong, … }
 * @returns {Object} { [chỉ số dòng]: [{ severity, title, message, act }] }
 */
export function checkRxRows(rows = []) {
    const c = collectContext({ rx: rows });
    const out = {};
    rows.forEach((r, i) => {
        const ten = fold(r.ten || '');
        if (!ten.trim()) return;
        const hits = DRUG_SAFETY_RULES
            .filter(rule => rule.drug.test(ten) && rule.when(c))
            .map(rule => ({ severity: rule.severity, title: rule.title, message: rule.msg(String(r.ten).trim()), act: rule.act }));
        if (hits.length) out[i] = hits;
    });
    return out;
}

/** Đếm nhanh theo mức để vẽ đèn tín hiệu */
export function summarize(alerts) {
    const n = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    alerts.forEach(a => n[a.severity]++);
    return { ...n, level: n.HIGH ? 'red' : n.MEDIUM ? 'amber' : 'green', total: alerts.length };
}

/* =====================================================================
   Gợi ý NGƯỢC — cùng bộ luật, nhưng chạy theo chiều "đã có chẩn đoán thì
   còn thiếu gì". Bày sẵn trước khi sinh viên gõ, thay vì đợi cảnh báo.
   ===================================================================== */

/** Các luật bệnh khớp với một đoạn chữ chẩn đoán */
export function rulesForDiagnosis(text) {
    const s = fold(String(text || ''));
    return s ? DISEASE_RULES.filter(r => r.re.test(s)) : [];
}

/**
 * Bộ cận lâm sàng bắt buộc + ô khám cần mô tả của các chẩn đoán đang ghi.
 * @returns {{labs: Array<{ten:string,benh:string}>, needs: Array<{field:string,label:string,benh:string}>}}
 */
export function requirementsFor(text) {
    const rules = rulesForDiagnosis(text);
    const labs = [], needs = [];
    rules.forEach(r => {
        (r.labs || []).forEach(l => { if (!labs.some(x => x.ten === l.add)) labs.push({ ten: l.add, benh: r.k }); });
        (r.need || []).forEach(n => {
            if (n.field && !needs.some(x => x.field === n.field && x.label === n.label)) {
                needs.push({ field: n.field, label: n.label, benh: r.k });
            }
        });
    });
    return { labs, needs };
}
