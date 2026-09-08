/* =====================================================================
   tailwind-dong-bang.mjs — ĐÓNG BĂNG TAILWIND THÀNH FILE TĨNH

   Vì sao có file này: `<script src="https://cdn.tailwindcss.com">` là bản
   "Play CDN" — tải ~400KB JS rồi tự dò DOM sinh CSS ngay trong trình duyệt,
   mỗi lần mở trang. Đo trên máy này (Chrome headless, localhost, không độ trễ
   mạng): bỏ nó ra thì lúc chạy xong module cuối rơi từ ~1400ms xuống ~780ms.
   Chính Tailwind cũng cảnh báo "should not be used in production".

   Cách làm: chạy CDN ĐÚNG MỘT LẦN ở đây, hứng lấy CSS nó sinh ra, ghi thành
   `tailwind-benh-an.css` (khoảng 20KB). Trang chỉ còn một thẻ <link>.

   CHẠY LẠI KHI NÀO: thêm/xóa class Tailwind trong tao-benh-an.html hoặc trong
   mấy file .js của thư mục này. Quên chạy lại thì class mới không có luật CSS
   nào — nên có sẵn chế độ tự kiểm:

       node tailwind-dong-bang.mjs            # sinh lại file
       node tailwind-dong-bang.mjs --kiem     # chỉ báo file có cũ không (CI)

   Cần Chrome ở đường dẫn mặc định của Windows và có mạng (để tải CDN).
   ===================================================================== */

import { readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const TRANG = join(HERE, 'tao-benh-an.html');
const RA = join(HERE, 'tailwind-benh-an.css');
const TAM = join(HERE, '_tw-capture.html');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

/* ---------- 1. Gom mọi chữ có thể là tên class ----------
   Gom THỪA còn hơn thiếu: Tailwind bỏ qua chữ nó không hiểu, nên rác không sao,
   nhưng sót một class là mất luôn luật CSS của class đó. Vậy nên quét cả chuỗi
   trong .js (chỗ `classList.add`, chuỗi HTML dựng bằng template literal…). */
const HOP_LE = /^-?[a-zA-Z][a-zA-Z0-9:_\-[\]/.(),%#!]*$/;

function gomChu(noiDung) {
    const out = new Set();
    const nhet = (s) => s.split(/\s+/).forEach(t => {
        if (t.length > 1 && t.length < 48 && HOP_LE.test(t)) out.add(t);
    });
    // class="..." trong HTML
    for (const m of noiDung.matchAll(/class=["']([^"']*)["']/g)) nhet(m[1]);
    // mọi chuỗi trong JS: '…' "…" `…`
    for (const m of noiDung.matchAll(/'([^'\n\\]{2,300})'|"([^"\n\\]{2,300})"|`([^`\\]{2,600})`/g)) {
        nhet(m[1] || m[2] || m[3] || '');
    }
    return out;
}

const nguon = [TRANG, ...readdirSync(HERE).filter(f => f.endsWith('.js')).map(f => join(HERE, f))];
const chu = new Set();
for (const f of nguon) gomChu(readFileSync(f, 'utf8')).forEach(t => chu.add(t));

/* ---------- 2. Trang mồi: trang thật + một khối ẩn chứa hết các chữ ----------
   Dùng trang THẬT chứ không dựng trang rỗng, để không sót class nào viết thẳng
   trong markup. JS của trang không chạy (file:// chặn module) — không sao, vì
   class do JS gắn đã gom ở bước 1 rồi. */
const html = readFileSync(TRANG, 'utf8')
    .replace('<link rel="stylesheet" href="tailwind-benh-an.css">', '<script src="https://cdn.tailwindcss.com"></script>')
    .replace('</body>', `<div hidden class="${[...chu].join(' ')}"></div></body>`);
writeFileSync(TAM, html);

/* ---------- 3. Cho Chrome chạy CDN một lần rồi hứng CSS ---------- */
let dom;
try {
    dom = execFileSync(CHROME, [
        '--headless=new', '--disable-gpu', '--no-first-run',
        '--virtual-time-budget=15000', '--dump-dom', 'file:///' + TAM.replace(/\\/g, '/')
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
} finally {
    if (existsSync(TAM)) unlinkSync(TAM);
}

// Khối <style> Tailwind chèn nằm CUỐI <head>, tức là thẻ style cuối cùng của DOM.
const het = dom.lastIndexOf('</style>');
const dau = dom.lastIndexOf('<style', het);
const css = dom.slice(dom.indexOf('>', dau) + 1, het).trim();

if (!css.includes('--tw-') || css.length < 5000) {
    console.error('Hứng hụt: CSS lấy được chỉ', css.length, 'byte. Có mạng không?');
    process.exit(1);
}

const dauFile = `/* SINH TỰ ĐỘNG — đừng sửa tay.
   Nguồn: tailwind-dong-bang.mjs (đọc tao-benh-an.html + *.js cùng thư mục).
   Thêm class Tailwind mới thì chạy lại: node tailwind-dong-bang.mjs
   Phải nạp SAU tao-benh-an.css — bản CDN cũ chèn CSS vào cuối <head> nên các
   luật của trang vốn THUA class Tailwind khi cùng độ ưu tiên; đổi thứ tự là
   đổi giao diện. */\n`;

const moi = dauFile + css + '\n';

if (process.argv.includes('--kiem')) {
    const cu = existsSync(RA) ? readFileSync(RA, 'utf8') : '';
    if (cu !== moi) {
        console.error('tailwind-benh-an.css đã cũ — chạy: node tailwind-dong-bang.mjs');
        process.exit(1);
    }
    console.log('tailwind-benh-an.css còn khớp nguồn.');
} else {
    writeFileSync(RA, moi);
    console.log(`Đã ghi tailwind-benh-an.css — ${(moi.length / 1024).toFixed(1)}KB, gom từ ${chu.size} chữ ứng viên.`);
}
