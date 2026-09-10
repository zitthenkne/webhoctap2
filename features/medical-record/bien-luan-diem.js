/* =====================================================================
   bien-luan-diem.js — BỘ CHẤM ĐIỂM DÙNG CHUNG CHO MỤC X

   Trước đây phần chấm ("nhánh này khớp bao nhiêu dấu hiệu của bệnh án")
   nằm kín trong closure của bien-luan-them.js, nên chỉ tab "Đối chiếu" mới
   thấy được. Sinh viên đang gõ ở bảng nhập phải bấm qua tab khác mới biết
   nhánh mình vừa viết mạnh hay yếu — biết trễ thì đã viết xong mất rồi.

   Tách ra đây để BA nơi cùng dùng một con số:
     · bien-luan-editor.js  — thanh điểm ngay trên từng nhánh lúc gõ
     · bien-luan-matrix.js  — ma trận nhánh × dấu chứng
     · bien-luan-them.js    — bàn cân, hỏi vặn, so A–B

   Điểm có TRỌNG SỐ, không đếm đầu người:
     · đặc điểm '+' trọng số 3 xuất hiện  ->  cộng 3
     · đặc điểm '+' bị ghi âm tính        ->  trừ 3 (bằng chứng chống lại)
     · đặc điểm '-' xuất hiện             ->  trừ 3 (càng có càng bớt nghĩ)
   pct = phần trăm của điểm tối đa có thể đạt, kẹp trong [0, 100].
   ===================================================================== */

import { hallmarksFor } from './bien-luan-data.js';
import { phanBietFor } from './bien-luan-phanbiet.js';
import { collectEvidence, collectNegatives } from './bien-luan-editor.js';
import { fold } from './tim-kiem.js';

const $ = (id) => document.getElementById(id);
const trim = (x) => String(x ?? '').trim();

/* Chữ đệm không mang thông tin — để "hội chứng của bệnh nhân" không khớp mọi dòng */
const STOP = new Set(['hoi', 'cua', 'khi', 'the', 'mot', 'hai', 'cac', 'cho', 'den', 'tai',
    'voi', 'vao', 'nhu', 'sau', 'truoc', 'moi', 'thi', 'lam', 'nhieu', 'kieu', 'dang',
    'benh', 'nhan', 'con', 'hoac', 'khong', 'chua', 'trong', 'ngay', 'gio']);

export const W = (t) => fold(t).split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w));

/**
 * Dấu hiệu này có mặt trong kho câu chữ nào không?
 * So theo TỪ chứ không so cả câu: "Ran nổ cuối thì hít vào" phải khớp được với
 * dòng khám "phổi ran nổ đáy phải". Ngưỡng 0.6 là chỗ cân giữa bắt sót và bắt
 * bừa (0.5 thì "đau ngực" khớp cả "đau bụng").
 */
export function findIn(feature, pool) {
    const w = W(feature);
    if (!w.length) return null;
    let best = null, bestN = 0;
    for (const p of pool) {
        const f = fold(p);
        const n = w.filter(x => f.includes(x)).length;
        if (n > bestN) { bestN = n; best = p; }
    }
    return bestN / w.length >= 0.6 ? best : null;
}

/* collectEvidence() chỉ lấy dữ kiện đã được CẤU TRÚC HÓA (mốc bệnh sử, ô khám,
   sinh hiệu, CLS bất thường). Chấm điểm thì phải đọc cả mấy ô văn xuôi — sinh
   viên hay kể "sốt cao lạnh run, ho khạc đàm vàng" thẳng vào ô Bệnh sử, không
   tách thành mốc. Thiếu chỗ này là dấu hiệu nào cũng ra "chưa hỏi". */
const VAN_XUOI = ['illness-history', 'reason-for-admission', 'hx-main-symptom',
    'ros-cardio', 'ros-resp', 'ros-gi', 'ros-neuro', 'ros-msk', 'ros-uro',
    'exam-general', 'exam-head', 'exam-chest', 'exam-heart', 'exam-lung',
    'exam-abdomen', 'exam-neuro-msk', 'history-internal', 'history-habit',
    'history-family', 'labs-results', 'summary'];

const cauCua = (id) => String($(id)?.value || '')
    .split(/[,;.\n]/).map(trim).filter(t => t.length > 2);

/** Kho dữ kiện dương / âm của cả bệnh án — tính một lần cho mỗi lượt vẽ */
export function pools(v) {
    const raw = VAN_XUOI.flatMap(cauCua);
    const amTinh = raw.filter(t => /^(kh[ôo]ng|ch[ưu]a|ph[ủu] nh[ậa]n)/i.test(t));
    return {
        yes: [...collectEvidence(v?.ten || ''), ...(v?.lamSang || []),
        ...raw.filter(t => !amTinh.includes(t))],
        no: [...collectNegatives(), ...(v?.amTinh || []), ...amTinh]
    };
}

/**
 * Bộ dấu hiệu để đối chiếu một nguyên nhân: gộp dấu hiệu then chốt của hội
 * chứng (HALLMARKS, mặc định coi là ủng hộ, trọng số 2) với đặc điểm phân
 * biệt riêng của bệnh đó (PHAN_BIET, có dấu và trọng số thật).
 * PHAN_BIET thắng khi trùng chữ vì nó nói rõ hướng.
 */
export function featuresOf(ten) {
    const pb = phanBietFor(ten);
    const co = new Set(pb.map(x => fold(x.t)));
    const hall = hallmarksFor(ten)
        .filter(t => !co.has(fold(t)))
        .map(t => ({ t, huong: '+', w: 2 }));
    return [...pb, ...hall];
}

/**
 * Đối chiếu một nhánh với bệnh án.
 * @returns {{t:string, huong:'+'|'-', w:number, st:'yes'|'no'|'ask', src?:string}[]}
 */
export function checkCause(ten, pool) {
    return featuresOf(ten).map(f => {
        const y = findIn(f.t, pool.yes);
        if (y) return { ...f, st: 'yes', src: y };
        const n = findIn(f.t, pool.no);
        return n ? { ...f, st: 'no', src: n } : { ...f, st: 'ask' };
    });
}

/**
 * Gộp thành một con số.
 *   yes/no/ask/tot — đếm đầu dòng, để hiện "✓3 ✗1 ?2"
 *   diem           — có trọng số và có dấu (âm được)
 *   pct            — 0–100, dùng vẽ thanh
 */
export function scoreOf(rows) {
    const tot = rows.length;
    if (!tot) return { yes: 0, no: 0, ask: 0, tot: 0, diem: 0, max: 0, pct: null };
    let diem = 0, max = 0;
    let yes = 0, no = 0;
    rows.forEach(r => {
        const ung = r.huong !== '-';                    // '+' là ủng hộ
        if (ung) max += r.w;
        if (r.st === 'yes') {
            yes++;
            diem += ung ? r.w : -r.w;                   // '-' mà có mặt thì trừ
        } else if (r.st === 'no') {
            no++;
            if (ung) diem -= r.w;                       // '+' mà bị phủ nhận thì trừ
        }
    });
    const pct = max ? Math.max(0, Math.min(100, Math.round(diem / max * 100))) : null;
    return { yes, no, ask: tot - yes - no, tot, diem, max, pct };
}

/** Xếp hạng các nhánh của một vấn đề theo điểm — nhánh chưa có bộ dấu hiệu đứng cuối */
export function xepHang(v, pool = pools(v)) {
    return v.nguyenNhan
        .map(n => {
            const ck = checkCause(n.ten, pool);
            return { n, ck, sc: scoreOf(ck) };
        })
        .filter(r => r.sc.tot)
        .sort((a, b) => b.sc.diem - a.sc.diem);
}

/** Nhãn gọn cho thanh điểm */
export const nhanDiem = (sc) => sc.tot
    ? `✓ ${sc.yes} · ✗ ${sc.no} · ? ${sc.ask}`
    : 'chưa có bộ dấu hiệu';
