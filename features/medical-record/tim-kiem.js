// tim-kiem.js — bộ dò dùng chung cho mọi bảng chọn (bệnh, thuốc, CLS, triệu chứng…).
//
// Gõ kiểu gì cũng ra: không dấu ("dai thao duong"), thiếu chữ đệm và sai thứ tự
// ("duong dai thao"), hoặc viết tắt chữ cái đầu ("dtd", "vptp"). Kết quả xếp theo
// độ khớp — khớp nguyên chữ lên trước, viết tắt xuống cuối.
//
//   score(text, q)          -> 0 là không khớp, càng lớn càng sát
//   searchList(items, q, …) -> mảng đã lọc và xếp hạng
//   highlight(text, q)      -> HTML đã thoát, tô đậm phần khớp

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Bỏ dấu nhưng GIỮ NGUYÊN số ký tự (mỗi chữ có dấu vẫn thành đúng 1 chữ),
   nhờ vậy chỉ số tìm được trên chuỗi đã bỏ dấu vẫn dùng được cho chuỗi gốc. */
export const fold = (s) => String(s ?? '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');

const words = (s) => fold(s).split(/[^a-z0-9]+/).filter(Boolean);
const initials = (s) => words(s).map(w => w[0]).join('');

/**
 * Độ khớp của một chuỗi với từ khóa. 0 = không khớp.
 * 100 trùng khít · 90 khớp từ đầu · 70 chứa nguyên cụm
 * · 55 đủ chữ nhưng rời rạc · 40 khớp viết tắt chữ cái đầu
 */
/* Vài chữ tắt viết trong bệnh án mà chữ cái đầu không dò ra được */
const EXPAND = {
    xq: 'x quang', sadb: 'sieu am bung', sat: 'sieu am tim',
    tptnt: 'tong phan tich nuoc tieu', kmdm: 'khi mau dong mach',
    nsdd: 'noi soi da day', dnt: 'dich nao tuy', ptnb: 'phan tich nuoc tieu'
};
const expand = (s) => s.split(/\s+/).map(w => EXPAND[w] || w).join(' ');

export function score(text, q) {
    const s0 = fold(q).trim();
    const s1 = expand(s0);
    const p = core(text, s0);
    return s1 === s0 ? p : Math.max(p, core(text, s1) - 5);
}

function core(text, s) {
    const t = fold(text);
    if (!s) return 1;
    if (!t) return 0;
    if (t === s) return 100;
    if (t.startsWith(s)) return 90;
    if (t.includes(s)) return 70;
    const toks = s.split(/\s+/).filter(Boolean);
    if (toks.length > 1 && toks.every(k => t.includes(k))) return 55;
    // "vpcd" ra "Viêm phổi cộng đồng" — kiểu gõ tắt quen tay của sinh viên.
    // Phải khớp từ chữ đầu, không thì gõ "ct" ra cả "nhồi máu Cơ Tim…" đầy màn hình.
    const flat = s.replace(/\s+/g, '');
    if (flat.length >= 2 && initials(text).startsWith(flat)) return 40;
    return 0;
}

/**
 * Lọc + xếp hạng một danh sách.
 * @param items  mảng bất kỳ
 * @param q      từ khóa
 * @param key    lấy chuỗi chính để so (mặc định: chính phần tử)
 * @param alias  các chuỗi phụ (tên nhóm, bí danh…) — khớp ở đây thì xếp sau
 * @param limit  số kết quả tối đa
 */
export function searchList(items, q, { key = (x) => x, alias = () => [], limit = 80 } = {}) {
    const s = String(q ?? '').trim();
    if (!s) return items.slice(0, limit);
    return items
        .map((x, i) => {
            const main = score(key(x), s);
            const sub = main ? 0 : Math.max(0, ...[].concat(alias(x) || []).map(a => score(a, s))) * 0.4;
            return { x, i, p: main || sub };
        })
        .filter(r => r.p > 0)
        .sort((a, b) => b.p - a.p || a.i - b.i)   // cùng điểm thì giữ thứ tự gốc
        .slice(0, limit)
        .map(r => r.x);
}

/** Tô đậm phần khớp để mắt bắt ngay chỗ trùng; trả HTML đã thoát ký tự */
export function highlight(text, q) {
    const t = String(text ?? '');
    const toks = [...new Set(fold(q).trim().split(/\s+/).filter(Boolean))];
    if (!toks.length || !t) return esc(t);
    const f = fold(t);
    const on = new Array(t.length).fill(false);
    toks.forEach(k => {
        for (let i = f.indexOf(k); i >= 0; i = f.indexOf(k, i + k.length)) {
            for (let j = i; j < i + k.length; j++) on[j] = true;
        }
    });
    let out = '', run = '';
    const flush = (mark) => { if (run) out += mark ? `<mark>${esc(run)}</mark>` : esc(run); run = ''; };
    for (let i = 0; i < t.length; i++) {
        if (i && on[i] !== on[i - 1]) flush(on[i - 1]);
        run += t[i];
    }
    flush(on[t.length - 1]);
    return out;
}

/* "Chưa ghi nhận dị ứng", "Không hút thuốc lá", "Đã mãn kinh"… là câu KẾT LUẬN của
   cả một mục, không phải một mục trong danh sách. Các danh sách con phải bỏ qua
   những dòng này khi đọc ngược từ ô chữ, kẻo sinh ra một dòng rỗng nghĩa. */
export const laCauPhuDinh = (s) => /^(ch[uư]a ghi nh[aậ]n|kh[oô]ng (c[oó]|d[uù]ng|h[uú]t|u[oố]ng|ghi nh[aậ]n)|đã mãn kinh)/i
    .test(String(s ?? '').trim());
