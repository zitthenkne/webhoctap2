// File: core/qr.js — MÃ QR "SỔ DÁN" dùng chung toàn web (2026-11-12)
// Tạo NGAY TRÊN MÁY (qrcode-generator chỉ để tính ma trận, nạp lười) — không gửi link ra dịch vụ ngoài:
// link riêng (api/link?t=<mã bí mật>) mà lọt sang máy chủ QR bên thứ ba là lộ suất.
// Tự vẽ SVG từ ma trận: các ô liền nhau nối thành khối bo tròn (kiểu kẹo dẻo) tô chuyển sắc, 3 "mắt" bo tròn,
// sticker mặt cười chính giữa. Mức sửa lỗi H (chịu ~30% hỏng) nên phần giữa bị sticker che vẫn quét được; giữ lề trắng 4 ô.
// Màu đủ đậm trên nền trắng để camera đọc được; mỗi `seed` (mã link, id phòng…) ra một bảng màu riêng.
// Dùng ở: share-access.js (link riêng), library-actions.js + quiz.html (link chung), link-vault.html, phòng học (study-room-main.js, rooms-hub.js).
const SRC = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
let lib = null;
let uid = 0;

// a → b: chuyển sắc của mã (đủ đậm cho camera) · face: má sticker mặt cười · ring: viền sticker
const PALETTES = [
    { a: '#D6336C', b: '#862E9C', face: '#FFA8C9', ring: '#FFD6E5' },   // dâu – nho
    { a: '#1C7ED6', b: '#5F3DC4', face: '#A5D8FF', ring: '#D0EBFF' },   // biển đêm
    { a: '#0B7A5C', b: '#1864AB', face: '#96F2D7', ring: '#C3FAE8' },   // bạc hà
    { a: '#D9480F', b: '#C2255C', face: '#FFC9A8', ring: '#FFE3D3' },   // đào
    { a: '#6741D9', b: '#C2255C', face: '#D0BFFF', ring: '#E5DBFF' }    // oải hương
];

function load() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    if (!lib) {
        lib = new Promise((ok, bad) => {
            const s = document.createElement('script');
            s.src = SRC;
            s.onload = () => ok(window.qrcode);
            s.onerror = () => { lib = null; bad(new Error('Không tải được thư viện QR')); };
            document.head.appendChild(s);
        });
    }
    return lib;
}

const paletteOf = (seed) => {
    let h = 0;
    for (const ch of String(seed || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return PALETTES[h % PALETTES.length];
};
const f = (n) => Math.round(n * 100) / 100;

/**
 * Thẻ <svg> co giãn theo khung chứa (width/height 100%).
 * opts.seed: chọn bảng màu (mặc định theo chính nội dung) · opts.face: false = không sticker giữa
 */
export async function qrSvg(text, opts = {}) {
    const q = (await load())(0, 'H');
    q.addData(String(text));
    q.make();
    const n = q.getModuleCount();
    const M = 4, N = n + M * 2;
    const P = paletteOf(opts.seed ?? text);
    const id = `zq${++uid}`;
    const X = M + n / 2;                                  // tâm mã (đơn vị = 1 ô)
    // Sticker giữa: đường kính ≈ 24% cạnh; bỏ mọi ô có tâm chạm sticker → vùng trống ĐỐI XỨNG quanh tâm
    const R = opts.face === false ? 0 : n * 0.12;
    const inEye = (r, c) => (r < 8 && c < 8) || (r < 8 && c >= n - 8) || (r >= n - 8 && c < 8);
    const inFace = (r, c) => R && Math.hypot(c + 0.5 - n / 2, r + 0.5 - n / 2) < R + 0.75;
    const on = (r, c) => r >= 0 && c >= 0 && r < n && c < n && q.isDark(r, c) && !inEye(r, c) && !inFace(r, c);
    // Ô tối = chấm tròn; ô bên phải / bên dưới cũng tối → nối bằng một dải → các ô liền nhau thành khối bo tròn như kẹo dẻo
    let body = '';
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            if (!on(r, c)) continue;
            const x = c + M, y = r + M;
            body += `<circle cx="${x + 0.5}" cy="${y + 0.5}" r="0.5"/>`;
            // chồng 0.04 ô để không lộ đường nối mờ (khử răng cưa) giữa chấm và dải
            if (on(r, c + 1)) body += `<rect x="${x + 0.48}" y="${y}" width="1.04" height="1"/>`;
            if (on(r + 1, c)) body += `<rect x="${x}" y="${y + 0.48}" width="1" height="1.04"/>`;
        }
    }
    // Mắt: khung bo tròn tô chuyển sắc + lõi tròn
    const eye = (r, c) => `<rect x="${c + M + 0.5}" y="${r + M + 0.5}" width="6" height="6" rx="2.4" fill="none" stroke="url(#${id})" stroke-width="1"/>`
        + `<rect x="${c + M + 2}" y="${r + M + 2}" width="3" height="3" rx="1.5" fill="url(#${id})"/>`;
    // Sticker mặt cười: viền trắng + vòng pastel, mặt màu má, mắt tròn có đốm sáng, miệng cười, má hồng
    const ink = '#4A2638';
    const face = !R ? '' : `<circle cx="${f(X)}" cy="${f(X)}" r="${f(R + 0.35)}" fill="#fff"/>`
        + `<circle cx="${f(X)}" cy="${f(X)}" r="${f(R - 0.1)}" fill="${P.face}" stroke="${P.ring}" stroke-width="${f(R * 0.14)}"/>`
        + `<circle cx="${f(X - R * 0.34)}" cy="${f(X - R * 0.08)}" r="${f(R * 0.12)}" fill="${ink}"/>`
        + `<circle cx="${f(X + R * 0.34)}" cy="${f(X - R * 0.08)}" r="${f(R * 0.12)}" fill="${ink}"/>`
        + `<circle cx="${f(X - R * 0.30)}" cy="${f(X - R * 0.13)}" r="${f(R * 0.045)}" fill="#fff"/>`
        + `<circle cx="${f(X + R * 0.38)}" cy="${f(X - R * 0.13)}" r="${f(R * 0.045)}" fill="#fff"/>`
        + `<path d="M${f(X - R * 0.17)} ${f(X + R * 0.14)} Q${f(X)} ${f(X + R * 0.36)} ${f(X + R * 0.17)} ${f(X + R * 0.14)}" fill="none" stroke="${ink}" stroke-width="${f(R * 0.085)}" stroke-linecap="round"/>`
        + `<ellipse cx="${f(X - R * 0.56)}" cy="${f(X + R * 0.18)}" rx="${f(R * 0.15)}" ry="${f(R * 0.09)}" fill="#FF6B9A" opacity=".55"/>`
        + `<ellipse cx="${f(X + R * 0.56)}" cy="${f(X + R * 0.18)}" rx="${f(R * 0.15)}" ry="${f(R * 0.09)}" fill="#FF6B9A" opacity=".55"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" width="100%" height="100%" role="img" aria-label="Mã QR">`
        // userSpaceOnUse: MỘT dải chuyển sắc trải cả mã (mặc định objectBoundingBox thì mỗi chấm tự chuyển sắc → lấm tấm sọc)
        + `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${N}" y2="${N}"><stop offset="0" stop-color="${P.a}"/><stop offset="1" stop-color="${P.b}"/></linearGradient></defs>`
        + `<rect width="${N}" height="${N}" rx="${f(N * 0.08)}" fill="#fff"/>`
        + `<g fill="url(#${id})">${body}</g>`
        + eye(0, 0) + eye(0, n - 7) + eye(n - 7, 0) + face
        + `</svg>`;
}

/** Ảnh SVG dạng data URL — cho <img>. */
export async function qrSvgUrl(text, opts = {}) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(await qrSvg(text, opts));
}

/** Ảnh PNG (data URL) — cho nút "Tải ảnh" (gửi / in được ở mọi nơi). */
export async function qrPng(text, opts = {}, size = 720) {
    const svg = (await qrSvg(text, opts)).replace('width="100%" height="100%"', `width="${size}" height="${size}"`);
    const img = new Image();
    await new Promise((ok, bad) => {
        img.onload = ok;
        img.onerror = () => bad(new Error('Không vẽ được ảnh QR'));
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
    const c = document.createElement('canvas');
    c.width = c.height = size;
    c.getContext('2d').drawImage(img, 0, 0, size, size);
    return c.toDataURL('image/png');
}

/** Vẽ thẳng vào một khung (div) — lỗi / mất mạng thì hiện lời nhắn. */
export async function qrInto(box, text, opts = {}) {
    if (!box) return;
    try { box.innerHTML = await qrSvg(text, opts); }
    catch (e) { box.innerHTML = '<span style="font-size:.72rem;color:#8b8494;text-align:center;padding:.5rem">Mất mạng nên chưa tạo được mã QR — dùng nút chép link nhé.</span>'; }
}
