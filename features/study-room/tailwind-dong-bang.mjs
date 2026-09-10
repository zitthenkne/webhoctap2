/* =====================================================================
   tailwind-dong-bang.mjs — ĐÓNG BĂNG TAILWIND CỦA PHÒNG ĐÁNH ĐỀ

   `<script src="https://cdn.tailwindcss.com">` là bản "Play CDN": tải ~400KB
   JS rồi dò DOM sinh CSS ngay trong máy người dùng, MỖI LẦN mở trang. Ở đây
   chạy nó đúng một lần, hứng CSS sinh ra, ghi thành `tailwind-phong.css`.

   CHẠY LẠI KHI NÀO: thêm/xóa class Tailwind trong study-room.html hoặc bất kỳ
   .js nào mà trang nạp (room-*.js, core/*.js, ../quiz/*.js). Quên chạy lại =
   class mới không có luật CSS, hỏng âm thầm.

       node tailwind-dong-bang.mjs            # sinh lại
       node tailwind-dong-bang.mjs --kiem     # chỉ báo file có cũ không

   Cần Chrome ở đường dẫn mặc định của Windows và có mạng.
   ===================================================================== */

import { readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const TRANG = join(HERE, 'study-room.html');
const RA = join(HERE, 'tailwind-phong.css');
const TAM = join(HERE, '_tw-capture.html');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const THE_LINK = '<link rel="stylesheet" href="tailwind-phong.css">';

/* ---------- 1. Gom mọi chữ có thể là tên class (gom thừa vô hại, sót mới chết) ---------- */
const HOP_LE = /^-?[a-zA-Z][a-zA-Z0-9:_\-[\]/.(),%#!]*$/;

function gomChu(noiDung) {
    const out = new Set();
    const nhet = (s) => s.split(/\s+/).forEach(t => {
        if (t.length > 1 && t.length < 48 && HOP_LE.test(t)) out.add(t);
    });
    for (const m of noiDung.matchAll(/class=["']([^"']*)["']/g)) nhet(m[1]);
    for (const m of noiDung.matchAll(/'([^'\n\\]{2,300})'|"([^"\n\\]{2,300})"|`([^`\\]{2,600})`/g)) {
        nhet(m[1] || m[2] || m[3] || '');
    }
    return out;
}

// core/utils.js dựng class toast bằng JS; quiz-helpers.js dựng HTML cho markdown.
const jsCua = (d) => existsSync(d)
    ? readdirSync(d).filter(f => f.endsWith('.js')).map(f => join(d, f)) : [];
const nguon = [
    TRANG,
    ...jsCua(HERE),
    ...jsCua(join(HERE, '..', '..', 'core')),
    ...jsCua(join(HERE, '..', 'quiz')),
];
const chu = new Set();
for (const f of nguon) gomChu(readFileSync(f, 'utf8')).forEach(t => chu.add(t));

/* ---------- 2. Trang mồi: trang thật + khối ẩn chứa hết các chữ ---------- */
const goc = readFileSync(TRANG, 'utf8');
const html = (goc.includes(THE_LINK)
    ? goc.replace(THE_LINK, '<script src="https://cdn.tailwindcss.com"></script>')
    : goc)
    .replace('</body>', `<div hidden class="${[...chu].join(' ')}"></div></body>`);
writeFileSync(TAM, html);

/* ---------- 3. Cho Chrome chạy CDN một lần rồi hứng CSS ---------- */
let dom;
try {
    dom = execFileSync(CHROME, [
        '--headless=new', '--disable-gpu', '--no-first-run',
        '--virtual-time-budget=15000', '--dump-dom', 'file:///' + TAM.replace(/\\/g, '/'),
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
} finally {
    if (existsSync(TAM)) unlinkSync(TAM);
}

const het = dom.lastIndexOf('</style>');
const dau = dom.lastIndexOf('<style', het);
const css = dom.slice(dom.indexOf('>', dau) + 1, het).trim();

if (!css.includes('--tw-') || css.length < 5000) {
    console.error('Hứng hụt: CSS lấy được chỉ', css.length, 'byte. Có mạng không?');
    process.exit(1);
}

const dauFile = `/* SINH TỰ ĐỘNG — đừng sửa tay.
   Nguồn: tailwind-dong-bang.mjs (study-room.html + *.js của phòng + core/ + ../quiz/).
   Thêm class Tailwind mới thì chạy lại: node tailwind-dong-bang.mjs
   Phải nạp CUỐI <head> — đúng chỗ bản CDN từng chèn CSS lúc chạy, vì nhiều luật
   của trang được viết với giả định Tailwind thắng khi cùng độ ưu tiên. */\n`;

const moi = dauFile + css + '\n';

if (process.argv.includes('--kiem')) {
    const cu = existsSync(RA) ? readFileSync(RA, 'utf8') : '';
    if (cu !== moi) {
        console.error('tailwind-phong.css đã cũ — chạy: node tailwind-dong-bang.mjs');
        process.exit(1);
    }
    console.log('tailwind-phong.css còn khớp nguồn.');
} else {
    writeFileSync(RA, moi);
    console.log(`Đã ghi tailwind-phong.css — ${(moi.length / 1024).toFixed(1)}KB, gom từ ${chu.size} chữ ứng viên.`);
}
