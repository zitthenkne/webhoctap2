// body-map.js — bản đồ giải phẫu SVG phẳng: bấm chọn vùng đau, kéo để vẽ hướng lan.
//
// Sinh viên tả vị trí đau bằng chữ thì mỗi người một kiểu ("bụng dưới bên phải",
// "vùng ruột thừa", "hố chậu (P)"), thầy đọc lại phải đoán. Ở đây vùng là một ô
// bấm được, tên gọi lấy đúng bộ phân khu đang dạy (9 vùng bụng, các khoang ngực,
// hai hố thắt lưng, các khớp lớn), nên câu văn máy ghép ra luôn dùng đúng thuật ngữ.
//
// Module này CHỈ giữ hình và tên vùng, không giữ dữ liệu bệnh án: mốc bệnh sử nào
// đang chọn, đau mấy điểm, lan đi đâu — đều do bên gọi truyền vào.
//
// Dữ liệu gắn vào mỗi mốc bệnh sử (thêm khóa mới, bệnh án cũ mở lên vẫn chạy):
//   m.vung = ['bung-hcp', 'nguc-t']        vùng đang đau
//   m.lan  = [['nguc-giua', 'tay-t']]      [từ vùng, tới vùng]
//   m.dau  = 0–10                          điểm đau, dùng để tô màu

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Hình người tối giản: đầu – cổ – thân – hai tay – hai chân. Dùng chung cho cả mặt
   trước lẫn mặt sau (bóng người đối xứng), chỉ khác bộ vùng phủ lên trên. */
const NGUOI = `
  <ellipse class="bm-body" cx="100" cy="36" rx="22" ry="27"/>
  <path class="bm-body" d="M91,58 h18 v14 h-18 z"/>
  <path class="bm-body" d="M62,84 Q62,74 74,71 L126,71 Q138,74 138,84 L134,140 L130,186 L132,216
        Q100,226 68,216 L70,186 L66,140 Z"/>
  <path class="bm-body" d="M62,78 L48,88 L40,150 L36,210 L47,213 L53,152 L66,102 Z"/>
  <path class="bm-body" d="M138,78 L152,88 L160,150 L164,210 L153,213 L147,152 L134,102 Z"/>
  <path class="bm-body" d="M70,219 L67,300 L72,392 L70,408 L87,408 L89,392 L93,300 L97,223 Z"/>
  <path class="bm-body" d="M130,219 L133,300 L128,392 L130,408 L113,408 L111,392 L107,300 L103,223 Z"/>`;

/* [id, tên đọc lên trong bệnh sử, hình] — hình là ['r',x,y,w,h] hoặc ['e',cx,cy,rx,ry].
   Bên phải / bên trái luôn là của BỆNH NHÂN. Mặt trước thì phải của bệnh nhân nằm
   bên trái người xem; mặt sau thì ngược lại, nên tọa độ mặt sau đã đảo sẵn. */
export const REGIONS = [
    /* ---------- mặt trước: đầu – mặt – cổ ---------- */
    ['tran', 'trán', 'truoc', ['r', 86, 15, 28, 12]],
    ['thai-duong-p', 'thái dương phải', 'truoc', ['r', 78, 30, 13, 13]],
    ['thai-duong-t', 'thái dương trái', 'truoc', ['r', 109, 30, 13, 13]],
    ['goc-ham-p', 'góc hàm phải', 'truoc', ['r', 80, 47, 13, 11]],
    ['goc-ham-t', 'góc hàm trái', 'truoc', ['r', 107, 47, 13, 11]],
    ['co-truoc', 'vùng cổ trước', 'truoc', ['r', 90, 59, 20, 13]],

    /* ---------- mặt trước: lồng ngực ---------- */
    ['nguc-p', 'ngực phải', 'truoc', ['r', 67, 78, 26, 46]],
    ['nguc-t', 'ngực trái (vùng trước tim)', 'truoc', ['r', 107, 78, 26, 46]],
    ['sau-xuong-uc', 'sau xương ức', 'truoc', ['r', 93, 78, 14, 46]],

    /* ---------- mặt trước: 9 phân khu ổ bụng ---------- */
    ['bung-hsp', 'hạ sườn phải', 'truoc', ['r', 68, 128, 21, 22]],
    ['bung-tv', 'thượng vị', 'truoc', ['r', 89, 128, 21, 22]],
    ['bung-hst', 'hạ sườn trái', 'truoc', ['r', 110, 128, 21, 22]],
    ['bung-hongp', 'hông phải', 'truoc', ['r', 68, 150, 21, 22]],
    ['bung-ron', 'quanh rốn', 'truoc', ['r', 89, 150, 21, 22]],
    ['bung-hongt', 'hông trái', 'truoc', ['r', 110, 150, 21, 22]],
    ['bung-hcp', 'hố chậu phải', 'truoc', ['r', 68, 172, 21, 22]],
    ['bung-hv', 'hạ vị', 'truoc', ['r', 89, 172, 21, 22]],
    ['bung-hct', 'hố chậu trái', 'truoc', ['r', 110, 172, 21, 22]],

    /* ---------- mặt trước: chi và khớp ---------- */
    ['vai-p', 'khớp vai phải', 'truoc', ['e', 62, 81, 10, 9]],
    ['vai-t', 'khớp vai trái', 'truoc', ['e', 138, 81, 10, 9]],
    ['tay-p', 'mặt trong cánh tay phải', 'truoc', ['r', 44, 100, 16, 40]],
    ['tay-t', 'mặt trong cánh tay trái', 'truoc', ['r', 140, 100, 16, 40]],
    ['khuyu-p', 'khuỷu phải', 'truoc', ['e', 45, 150, 9, 9]],
    ['khuyu-t', 'khuỷu trái', 'truoc', ['e', 155, 150, 9, 9]],
    ['cotay-p', 'cổ tay phải', 'truoc', ['e', 40, 205, 8, 8]],
    ['cotay-t', 'cổ tay trái', 'truoc', ['e', 160, 205, 8, 8]],
    ['ben-p', 'vùng bẹn phải', 'truoc', ['r', 72, 196, 22, 20]],
    ['ben-t', 'vùng bẹn trái', 'truoc', ['r', 106, 196, 22, 20]],
    ['hang-p', 'khớp háng phải', 'truoc', ['e', 76, 220, 10, 9]],
    ['hang-t', 'khớp háng trái', 'truoc', ['e', 124, 220, 10, 9]],
    ['goi-p', 'khớp gối phải', 'truoc', ['e', 80, 300, 10, 10]],
    ['goi-t', 'khớp gối trái', 'truoc', ['e', 120, 300, 10, 10]],
    ['cangchan-p', 'cẳng chân phải', 'truoc', ['r', 71, 320, 18, 55]],
    ['cangchan-t', 'cẳng chân trái', 'truoc', ['r', 111, 320, 18, 55]],
    ['cochan-p', 'cổ chân phải', 'truoc', ['e', 77, 392, 8, 8]],
    ['cochan-t', 'cổ chân trái', 'truoc', ['e', 123, 392, 8, 8]],

    /* ---------- mặt sau (trái / phải đã đảo cho đúng phía bệnh nhân) ---------- */
    ['gay', 'vùng gáy', 'sau', ['r', 88, 58, 24, 14]],
    ['cham', 'vùng chẩm', 'sau', ['r', 86, 30, 28, 20]],
    ['lien-ba-vai', 'vùng liên bả vai', 'sau', ['r', 74, 80, 52, 28]],
    ['cs-nguc', 'cột sống ngực', 'sau', ['r', 93, 80, 14, 60]],
    ['cs-tl', 'cột sống thắt lưng', 'sau', ['r', 93, 142, 14, 50]],
    ['ho-tl-p', 'hố thắt lưng phải', 'sau', ['r', 110, 140, 22, 32]],
    ['ho-tl-t', 'hố thắt lưng trái', 'sau', ['r', 68, 140, 22, 32]],
    ['mong-p', 'vùng mông phải', 'sau', ['r', 104, 196, 24, 26]],
    ['mong-t', 'vùng mông trái', 'sau', ['r', 72, 196, 24, 26]],
    ['khoeo-p', 'khoeo chân phải', 'sau', ['e', 120, 300, 10, 10]],
    ['khoeo-t', 'khoeo chân trái', 'sau', ['e', 80, 300, 10, 10]]
];

const BY_ID = new Map(REGIONS.map(r => [r[0], r]));

/** Tên vùng để đọc lên trong bệnh sử — id lạ thì trả về chính id, khỏi mất dữ liệu */
export const regionTen = (id) => BY_ID.get(id)?.[1] || String(id || '');

/** Tâm của một vùng, dùng để bắn tia hướng lan */
export function regionTam(id) {
    const s = BY_ID.get(id)?.[3];
    if (!s) return null;
    return s[0] === 'e' ? [s[1], s[2]] : [s[1] + s[3] / 2, s[2] + s[4] / 2];
}

/** Mặt (trước / sau) chứa vùng này */
export const regionMat = (id) => BY_ID.get(id)?.[2] || 'truoc';

/* Màu theo thang điểm đau — cùng bộ màu với các mức độ khác trong bệnh án */
export function mucDau(d) {
    const n = parseFloat(d);
    if (!isFinite(n) || n <= 0) return 'none';
    if (n <= 3) return 'nhe';
    if (n <= 6) return 'vua';
    return 'nang';
}

function shapeHtml(s, cls, attrs = '', inner = '') {
    const tag = s[0] === 'e' ? 'ellipse' : 'rect';
    const geo = s[0] === 'e'
        ? `cx="${s[1]}" cy="${s[2]}" rx="${s[3]}" ry="${s[4]}"`
        : `x="${s[1]}" y="${s[2]}" width="${s[3]}" height="${s[4]}" rx="3"`;
    return `<${tag} class="${cls}" ${geo} ${attrs}>${inner}</${tag}>`;
}

/**
 * Một mặt của bản đồ.
 * @param mat   'truoc' | 'sau'
 * @param vung  [id] vùng đang đau
 * @param lan   [[từ, tới]] hướng lan
 * @param dau   điểm đau 0–10 (quyết định màu)
 * @param keo   id vùng đang giữ để kéo tia (vẽ viền nhấp nháy)
 */
export function bodyMapSvg({ mat = 'truoc', vung = [], lan = [], dau = '', keo = '' } = {}) {
    const on = new Set(vung);
    const muc = mucDau(dau);
    const items = REGIONS.filter(r => r[2] === mat).map(([id, ten, , s]) => {
        const cls = ['bm-z', on.has(id) ? 'is-on is-' + muc : '', keo === id ? 'is-keo' : '']
            .filter(Boolean).join(' ');
        return shapeHtml(s, cls, `data-z="${id}"`, `<title>${esc(ten)}</title>`);
    }).join('');

    // Tia hướng lan: chỉ vẽ khi cả hai đầu cùng nằm trên mặt đang xem
    const tia = lan.map(([a, b]) => {
        if (regionMat(a) !== mat || regionMat(b) !== mat) return '';
        const p = regionTam(a), q = regionTam(b);
        if (!p || !q) return '';
        // Cong nhẹ cho dễ nhìn khi hai vùng nằm cùng cột
        const mx = (p[0] + q[0]) / 2 + (q[1] - p[1]) * 0.18;
        const my = (p[1] + q[1]) / 2 - (q[0] - p[0]) * 0.18;
        return `<path class="bm-tia" d="M${p[0]},${p[1]} Q${mx},${my} ${q[0]},${q[1]}"
            marker-end="url(#bm-arrow)"><title>${esc(regionTen(a))} → ${esc(regionTen(b))}</title></path>`;
    }).join('');

    return `<svg class="bm-svg" viewBox="0 0 200 430" role="img"
        aria-label="Bản đồ cơ thể ${mat === 'truoc' ? 'mặt trước' : 'mặt sau'}">
        <defs>
            <marker id="bm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" class="bm-arrowhead"/>
            </marker>
        </defs>
        ${NGUOI}
        ${items}
        ${tia}
    </svg>`;
}

/** "đau ở hố chậu phải" · "đau sau xương ức, lan lên góc hàm trái và mặt trong cánh tay trái" */
export function vungProse(vung = [], lan = []) {
    const noi = (xs) => xs.length < 2 ? (xs[0] || '')
        : xs.slice(0, -1).join(', ') + ' và ' + xs.at(-1);
    const oVung = vung.filter(Boolean).map(regionTen);
    const tia = lan.filter(x => x?.[0] && x?.[1]);
    const cau = [];
    if (oVung.length) cau.push('đau ở ' + noi(oVung));
    // Tia xuất phát từ vùng đã kể rồi thì chỉ cần nói lan tới đâu
    const daKe = new Set(vung);
    const nhom = new Map();
    tia.forEach(([a, b]) => {
        const key = daKe.has(a) ? '' : regionTen(a);
        if (!nhom.has(key)) nhom.set(key, []);
        nhom.get(key).push(regionTen(b));
    });
    nhom.forEach((toi, tu) => {
        cau.push((tu ? `đau ở ${tu}, ` : '') + 'lan tới ' + noi(toi));
    });
    return cau.join(', ');
}
