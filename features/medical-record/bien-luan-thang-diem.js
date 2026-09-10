/* =====================================================================
   bien-luan-thang-diem.js — THANG ĐIỂM TỰ CỘNG, KHÔNG GÕ TAY

   TIEU_CHUAN của bien-luan-data.js đang là CHỮ: "qSOFA ≥ 2 (nhịp thở ≥ 22,
   rối loạn tri giác, HA tâm thu ≤ 100)". Đọc xong sinh viên vẫn phải tự cộng
   nhẩm rồi gõ lại kết quả vào ô "vì…". Ở đây mỗi thang là một bảng tick, và
   những mục nào máy ĐỌC ĐƯỢC từ sinh hiệu / cận lâm sàng / tuổi giới đã nhập
   thì tự tick sẵn, có ghi rõ dựa vào con số nào.

   Mỗi mục:
     t    câu hỏi
     d    số điểm khi CÓ
     auto () => true | false | null   (null = máy chưa đọc được, phải tự tick)
     vi   () => 'dựa vào đâu'         (chỉ hiện khi auto ra kết quả)

   Không lưu gì vào record: kết quả được ghi thành CHỮ vào ô "vì…" của nhánh,
   đó mới là thứ nộp cho thầy.
   ===================================================================== */

import { getCls } from './cls-editor.js';
import { fold } from './tim-kiem.js';

const $ = (id) => document.getElementById(id);
const trim = (x) => String(x ?? '').trim();

/** Số ở một ô sinh hiệu; ô trống hoặc chữ thì trả null */
function so(id) {
    const v = parseFloat(String($(id)?.value || '').replace(',', '.'));
    return Number.isFinite(v) ? v : null;
}

/** Huyết áp "120/80" → [tâm thu, tâm trương] */
function huyetAp() {
    const m = String($('vital-bp')?.value || '').match(/(\d{2,3})\s*[/\\]\s*(\d{2,3})/);
    return m ? [+m[1], +m[2]] : [null, null];
}

const tuoi = () => so('patient-age');
const laNu = () => /^nu/.test(fold($('patient-gender')?.value || ''));

/** Điểm Glasgow từ ba ô E–V–M; chưa chọn đủ thì null */
function gcs() {
    const n = ['gcs-e', 'gcs-v', 'gcs-m'].map(id => parseInt($(id)?.value, 10));
    return n.every(Number.isFinite) ? n[0] + n[1] + n[2] : null;
}

/**
 * Giá trị một chỉ số cận lâm sàng đã nhập ở mục XII.
 * @returns {{v:number, n:string, u:string} | null}
 */
export function chiSo(re) {
    for (const c of getCls()) {
        for (const i of (c.items || [])) {
            if (!re.test(i.n || '')) continue;
            const v = parseFloat(String(i.v ?? '').replace(',', '.'));
            if (Number.isFinite(v)) return { v, n: i.n, u: i.u || '' };
        }
    }
    return null;
}

/** So sánh một chỉ số với ngưỡng; chưa có kết quả thì null (chưa biết) */
const nguong = (re, cmp) => () => {
    const x = chiSo(re);
    return x ? cmp(x.v) : null;
};
const viChiSo = (re) => () => {
    const x = chiSo(re);
    return x ? `${x.n} ${x.v}${x.u ? ' ' + x.u : ''}` : '';
};

/* Các ô văn xuôi của bệnh án — dò một cụm chữ có được nhắc tới không */
const VAN_XUOI = ['illness-history', 'reason-for-admission', 'hx-main-symptom',
    'history-internal', 'history-habit', 'exam-general', 'exam-chest', 'exam-heart',
    'exam-lung', 'exam-abdomen', 'exam-neuro-msk', 'ros-cardio', 'ros-resp', 'ros-gi',
    'provisional-diagnosis', 'dx1-assoc'];

/** Bệnh án có nhắc tới cụm này không? Không thấy thì null chứ không phải false —
 *  "chưa ghi" khác "đã hỏi và không có". */
const nhac = (re) => () => {
    const t = VAN_XUOI.map(id => String($(id)?.value || '')).join(' \n ');
    return re.test(fold(t)) ? true : null;
};

/* =====================================================================
   BẢNG THANG ĐIỂM
   ===================================================================== */
export const THANG = [
    {
        k: 'qsofa', ten: 'qSOFA', max: 3,
        re: /nhi[ễe]m tr[ùu]ng huy[ếe]t|sepsis|s[ốo]c nhi[ễe]m tr[ùu]ng|nhi[ễe]m tr[ùu]ng|^s[ốo]t/i,
        vi: 'Sàng lọc nhiễm trùng huyết tại giường (Sepsis-3)',
        y: [
            {
                t: 'Nhịp thở ≥ 22 lần/phút', d: 1,
                auto: () => { const r = so('vital-resp'); return r == null ? null : r >= 22; },
                vi: () => { const r = so('vital-resp'); return r == null ? '' : `nhịp thở ${r} l/p`; }
            },
            {
                t: 'Rối loạn tri giác (GCS < 15)', d: 1,
                auto: () => { const g = gcs(); return g == null ? null : g < 15; },
                vi: () => { const g = gcs(); return g == null ? '' : `GCS ${g}`; }
            },
            {
                t: 'Huyết áp tâm thu ≤ 100 mmHg', d: 1,
                auto: () => { const [s] = huyetAp(); return s == null ? null : s <= 100; },
                vi: () => { const [s, d] = huyetAp(); return s == null ? '' : `HA ${s}/${d} mmHg`; }
            }
        ],
        ket: (n) => n >= 2
            ? `qSOFA ${n}/3 — nguy cơ cao, tầm soát nhiễm trùng huyết ngay (cấy máu, lactat, SOFA đầy đủ)`
            : `qSOFA ${n}/3 — chưa đạt ngưỡng cảnh báo, vẫn theo dõi sát`
    },
    {
        k: 'curb65', ten: 'CURB-65', max: 5,
        re: /vi[êe]m ph[ổo]i|[đd][ôo]ng [đd][ặa]c/i,
        vi: 'Phân tầng nặng viêm phổi cộng đồng — quyết định nội trú hay ngoại trú',
        y: [
            {
                t: 'C — Lú lẫn mới xuất hiện', d: 1,
                auto: () => { const g = gcs(); return g == null ? null : g < 15; },
                vi: () => { const g = gcs(); return g == null ? '' : `GCS ${g}`; }
            },
            {
                t: 'U — Ure máu > 7 mmol/L (≈ 20 mg/dL)', d: 1,
                auto: nguong(/ure|b\.?u\.?n/i, (v) => v > 7 || v > 20),
                vi: viChiSo(/ure|b\.?u\.?n/i)
            },
            {
                t: 'R — Nhịp thở ≥ 30 lần/phút', d: 1,
                auto: () => { const r = so('vital-resp'); return r == null ? null : r >= 30; },
                vi: () => { const r = so('vital-resp'); return r == null ? '' : `nhịp thở ${r} l/p`; }
            },
            {
                t: 'B — HA tâm thu < 90 hoặc tâm trương ≤ 60 mmHg', d: 1,
                auto: () => { const [s, d] = huyetAp(); return s == null ? null : (s < 90 || d <= 60); },
                vi: () => { const [s, d] = huyetAp(); return s == null ? '' : `HA ${s}/${d} mmHg`; }
            },
            {
                t: '65 — Tuổi ≥ 65', d: 1,
                auto: () => { const a = tuoi(); return a == null ? null : a >= 65; },
                vi: () => { const a = tuoi(); return a == null ? '' : `${a} tuổi`; }
            }
        ],
        ket: (n) => n >= 3
            ? `CURB-65 ${n}/5 — nặng, cân nhắc nhập hồi sức`
            : n === 2 ? `CURB-65 ${n}/5 — nhập viện điều trị nội trú`
                : `CURB-65 ${n}/5 — nhẹ, có thể điều trị ngoại trú`
    },
    {
        k: 'wells-pe', ten: 'Wells thuyên tắc phổi', max: 12.5,
        re: /thuy[êe]n t[ắa]c ph[ổo]i|thuy[êe]n t[ắa]c [đd][ộo]ng m[ạa]ch ph[ổo]i/i,
        vi: 'Xác suất lâm sàng trước khi quyết định làm D-dimer hay CT động mạch phổi',
        y: [
            { t: 'Dấu hiệu lâm sàng của huyết khối tĩnh mạch sâu', d: 3, auto: nhac(/sung.*bap chan|phu mot ben|huyet khoi tinh mach/), vi: () => 'bệnh án có nhắc' },
            { t: 'Thuyên tắc phổi là chẩn đoán khả dĩ nhất', d: 3, auto: () => null },
            {
                t: 'Nhịp tim > 100 lần/phút', d: 1.5,
                auto: () => { const p = so('vital-pulse'); return p == null ? null : p > 100; },
                vi: () => { const p = so('vital-pulse'); return p == null ? '' : `mạch ${p} l/p`; }
            },
            { t: 'Bất động ≥ 3 ngày hoặc mổ trong 4 tuần', d: 1.5, auto: nhac(/bat dong|nam lau|sau mo|hau phau/), vi: () => 'bệnh án có nhắc' },
            { t: 'Tiền căn huyết khối tĩnh mạch sâu hoặc thuyên tắc phổi', d: 1.5, auto: nhac(/tien can.*huyet khoi|tien can.*thuyen tac/), vi: () => 'bệnh án có nhắc' },
            { t: 'Ho ra máu', d: 1, auto: nhac(/ho ra mau/), vi: () => 'bệnh án có nhắc' },
            { t: 'Ung thư đang điều trị hoặc trong 6 tháng', d: 1, auto: nhac(/ung thu|ac tinh|hoa tri|xa tri/), vi: () => 'bệnh án có nhắc' }
        ],
        ket: (n) => n > 6
            ? `Wells ${n} điểm — xác suất CAO, chụp CT động mạch phổi thẳng, không cần D-dimer`
            : n >= 2 ? `Wells ${n} điểm — xác suất trung bình, làm D-dimer trước`
                : `Wells ${n} điểm — xác suất thấp, D-dimer âm là loại trừ được`
    },
    {
        k: 'alvarado', ten: 'Alvarado', max: 10,
        re: /vi[êe]m ru[ộo]t th[ừu]a/i,
        vi: 'Khả năng viêm ruột thừa cấp — quyết định mổ, theo dõi hay tìm chẩn đoán khác',
        y: [
            { t: 'Đau chuyển vị về hố chậu phải', d: 1, auto: nhac(/chuyen.*ho chau phai|quanh ron.*ho chau/), vi: () => 'bệnh án có nhắc' },
            { t: 'Chán ăn', d: 1, auto: nhac(/chan an/), vi: () => 'bệnh án có nhắc' },
            { t: 'Buồn nôn hoặc nôn', d: 1, auto: nhac(/buon non|non oi|non mua/), vi: () => 'bệnh án có nhắc' },
            { t: 'Ấn đau hố chậu phải', d: 2, auto: nhac(/an dau ho chau phai|mcburney/), vi: () => 'bệnh án có nhắc' },
            { t: 'Phản ứng dội', d: 1, auto: nhac(/phan ung doi|blumberg/), vi: () => 'bệnh án có nhắc' },
            {
                t: 'Sốt ≥ 37,3°C', d: 1,
                auto: () => { const t = so('vital-temp'); return t == null ? null : t >= 37.3; },
                vi: () => { const t = so('vital-temp'); return t == null ? '' : `nhiệt độ ${t}°C`; }
            },
            {
                t: 'Bạch cầu > 10.000/mm³', d: 2,
                auto: nguong(/b[ạa]ch c[ầa]u|wbc/i, (v) => v > 10000 || (v > 10 && v < 100)),
                vi: viChiSo(/b[ạa]ch c[ầa]u|wbc/i)
            },
            {
                t: 'Neutrophil > 75%', d: 1,
                auto: nguong(/neu|b[ạa]ch c[ầa]u [đd]a nh[âa]n/i, (v) => v > 75),
                vi: viChiSo(/neu|b[ạa]ch c[ầa]u [đd]a nh[âa]n/i)
            }
        ],
        ket: (n) => n >= 7
            ? `Alvarado ${n}/10 — rất gợi ý viêm ruột thừa, hội chẩn ngoại`
            : n >= 5 ? `Alvarado ${n}/10 — nghi ngờ, cần hình ảnh học và theo dõi sát`
                : `Alvarado ${n}/10 — ít khả năng, tìm chẩn đoán khác`
    },
    {
        k: 'chadsvasc', ten: 'CHA₂DS₂-VASc', max: 9,
        re: /rung nh[ĩi]|cu[ồo]ng nh[ĩi]/i,
        vi: 'Nguy cơ đột quỵ do rung nhĩ — quyết định có kháng đông hay không',
        y: [
            { t: 'C — Suy tim / rối loạn chức năng thất trái', d: 1, auto: nhac(/suy tim|ef gi[ảa]m|phan suat tong mau giam/), vi: () => 'bệnh án có nhắc' },
            { t: 'H — Tăng huyết áp', d: 1, auto: nhac(/tang huyet ap|thA\b/), vi: () => 'bệnh án có nhắc' },
            {
                t: 'A₂ — Tuổi ≥ 75', d: 2,
                auto: () => { const a = tuoi(); return a == null ? null : a >= 75; },
                vi: () => { const a = tuoi(); return a == null ? '' : `${a} tuổi`; }
            },
            { t: 'D — Đái tháo đường', d: 1, auto: nhac(/dai thao duong|tieu duong/), vi: () => 'bệnh án có nhắc' },
            { t: 'S₂ — Tiền căn đột quỵ / TIA / thuyên tắc', d: 2, auto: nhac(/dot quy|tai bien mach mau nao|nhoi mau nao|tia\b/), vi: () => 'bệnh án có nhắc' },
            { t: 'V — Bệnh mạch máu (nhồi máu cơ tim cũ, bệnh động mạch ngoại biên)', d: 1, auto: nhac(/nhoi mau co tim|benh mach vanh|dong mach ngoai bien/), vi: () => 'bệnh án có nhắc' },
            {
                t: 'A — Tuổi 65–74', d: 1,
                auto: () => { const a = tuoi(); return a == null ? null : (a >= 65 && a <= 74); },
                vi: () => { const a = tuoi(); return a == null ? '' : `${a} tuổi`; }
            },
            {
                t: 'Sc — Giới nữ', d: 1,
                auto: () => trim($('patient-gender')?.value) ? laNu() : null,
                vi: () => trim($('patient-gender')?.value) ? `giới ${trim($('patient-gender').value)}` : ''
            }
        ],
        ket: (n) => n >= 2
            ? `CHA₂DS₂-VASc ${n} điểm — có chỉ định kháng đông đường uống`
            : n === 1 ? `CHA₂DS₂-VASc ${n} điểm — cân nhắc kháng đông tùy từng ca`
                : `CHA₂DS₂-VASc ${n} điểm — chưa cần kháng đông`
    },
    {
        k: 'centor', ten: 'Centor – McIsaac', max: 5,
        re: /vi[êe]m h[ọo]ng|vi[êe]m amidan|vi[êe]m h[ầa]u h[ọo]ng/i,
        vi: 'Khả năng viêm họng do liên cầu — quyết định có cần kháng sinh không',
        y: [
            {
                t: 'Sốt > 38°C', d: 1,
                auto: () => { const t = so('vital-temp'); return t == null ? null : t > 38; },
                vi: () => { const t = so('vital-temp'); return t == null ? '' : `nhiệt độ ${t}°C`; }
            },
            { t: 'Không ho', d: 1, auto: nhac(/khong ho\b/), vi: () => 'bệnh án ghi âm tính' },
            { t: 'Hạch cổ trước sưng đau', d: 1, auto: nhac(/hach co truoc|hach duoi ham/), vi: () => 'bệnh án có nhắc' },
            { t: 'Amidan sưng hoặc có giả mạc', d: 1, auto: nhac(/amidan.*sung|gia mac|mu amidan/), vi: () => 'bệnh án có nhắc' },
            {
                t: 'Tuổi 3–14 (trên 45 tuổi trừ 1 điểm)', d: 1,
                auto: () => { const a = tuoi(); return a == null ? null : (a >= 3 && a <= 14); },
                vi: () => { const a = tuoi(); return a == null ? '' : `${a} tuổi`; }
            }
        ],
        ket: (n) => n >= 4
            ? `Centor ${n}/5 — khả năng liên cầu cao, cân nhắc kháng sinh`
            : n >= 2 ? `Centor ${n}/5 — nên làm test nhanh liên cầu trước khi cho kháng sinh`
                : `Centor ${n}/5 — nhiều khả năng do siêu vi, không cần kháng sinh`
    }
];

/** Thang điểm hợp với tên bệnh / tên vấn đề này */
export function thangCho(ten) {
    const t = trim(ten);
    return t ? THANG.filter(x => x.re.test(t)) : [];
}

/* Câu trả lời do người dùng tự tick — chỉ sống trong phiên, vì kết quả cuối
   cùng đã được ghi thành chữ vào ô "vì…" rồi. */
const tay = new Map();
const khoa = (k, ten) => k + '|' + fold(ten);

export function datTay(k, ten, i, v) { tay.set(khoa(k, ten) + '|' + i, v); }
export function xoaTay(k, ten) {
    [...tay.keys()].filter(x => x.startsWith(khoa(k, ten) + '|')).forEach(x => tay.delete(x));
}

/**
 * Chấm một thang cho một chẩn đoán.
 * @returns {{diem:number, ket:string, y:{t,d,on,auto,vi}[] , thieu:number}}
 */
export function cham(thang, ten) {
    let diem = 0, thieu = 0;
    const y = thang.y.map((m, i) => {
        const a = m.auto ? m.auto() : null;
        const t = tay.get(khoa(thang.k, ten) + '|' + i);
        const on = t !== undefined ? t : (a === true);
        if (a === null && t === undefined) thieu++;
        if (on) diem += m.d;
        return { ...m, on, tuMay: t === undefined && a !== null, vi: a !== null && m.vi ? m.vi() : '' };
    });
    const lam = Math.round(diem * 10) / 10;
    return { diem: lam, ket: thang.ket(lam), y, thieu };
}
