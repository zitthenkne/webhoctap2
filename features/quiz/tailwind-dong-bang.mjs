/* =====================================================================
   tailwind-dong-bang.mjs — ĐÓNG BĂNG TAILWIND CỦA TRANG LÀM BÀI (quiz.html)
   (chép từ tailwind-dong-bang.mjs ở gốc app, đổi TRANG / RA / nguồn quét)

   `<script src="https://cdn.tailwindcss.com">` là bản "Play CDN": tải ~400KB
   JS rồi dò DOM sinh CSS ngay trong máy người dùng, MỖI LẦN mở trang. Đo trên
   CPU giả lập điện thoại: tốn ~1,7 giây trước khi app.js kịp khôi phục đăng nhập.
   Ở đây chạy nó đúng một lần, hứng CSS sinh ra, ghi thành `tailwind-quiz.css`.

   CHẠY LẠI KHI NÀO: thêm/xóa class Tailwind trong quiz.html hoặc bất kỳ .js
   nào trong features/quiz/ hay core/ (+ pwa-install.js). Quên chạy lại = class mới không
   có luật CSS, hỏng âm thầm.

       node tailwind-dong-bang.mjs            # sinh lại
       node tailwind-dong-bang.mjs --kiem     # chỉ báo file có cũ không

   Cần Chrome ở đường dẫn mặc định của Windows và có mạng.
   ===================================================================== */

import { readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..', '..');
const TRANG = join(HERE, 'quiz.html');
const RA = join(HERE, 'tailwind-quiz.css');
const TAM = join(HERE, '_tw-capture.html');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const THE_LINK = '<link rel="stylesheet" href="tailwind-quiz.css">';

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
    // Gom thêm cả file tách theo dấu nháy / backtick / ${}: regex chuỗi ở trên lệch cặp khi template
    // lồng nhau (`...${x ? 'invisible' : ''}...`) -> từng sót .invisible của nút Câu trước. Gom thừa vô hại.
    nhet(noiDung.replace(/[`'"${}]/g, ' '));
    return out;
}

// Trang làm bài chỉ nạp module của features/quiz/ + core/ + pwa-install.js (core/utils.js dựng class toast bằng JS).
const BO_QUA = new Set(['node_modules', 'libs', 'dev', 'tests', '.git', '_backup_truoc_khi_tach_module']);
function jsTrong(d) {
    const out = [];
    for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) { if (!BO_QUA.has(f)) out.push(...jsTrong(p)); }
        else if (f.endsWith('.js') && !f.endsWith('.min.js')) out.push(p);
    }
    return out;
}
const nguon = [TRANG, ...jsTrong(HERE), ...jsTrong(join(APP, 'core')), join(APP, 'pwa-install.js')];
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

// Không lấy thẻ <style> cuối: trang có <style> riêng, chỉ lấy thẻ CDN sinh (có --tw-).
const css = [...dom.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map(m => m[1].trim()).find(s => s.includes('--tw-')) || '';

if (!css.includes('--tw-') || css.length < 5000) {
    console.error('Hứng hụt: CSS lấy được chỉ', css.length, 'byte. Có mạng không?');
    process.exit(1);
}

const dauFile = `/* SINH TỰ ĐỘNG — đừng sửa tay.
   Nguồn: tailwind-dong-bang.mjs (quiz.html + features/quiz/**.js + core/*.js + pwa-install.js).
   Thêm class Tailwind mới thì chạy lại: node tailwind-dong-bang.mjs
   Phải nạp CUỐI <head> — đúng chỗ bản CDN từng chèn CSS lúc chạy, vì nhiều luật
   của trang được viết với giả định Tailwind thắng khi cùng độ ưu tiên. */\n`;

const moi = dauFile + css + '\n';

if (process.argv.includes('--kiem')) {
    const cu = existsSync(RA) ? readFileSync(RA, 'utf8') : '';
    if (cu !== moi) {
        console.error('tailwind-quiz.css đã cũ — chạy: node tailwind-dong-bang.mjs');
        process.exit(1);
    }
    console.log('tailwind-quiz.css còn khớp nguồn.');
} else {
    writeFileSync(RA, moi);
    console.log(`Đã ghi tailwind-quiz.css — ${(moi.length / 1024).toFixed(1)}KB, gom từ ${chu.size} chữ ứng viên.`);
}
