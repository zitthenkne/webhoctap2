/* =====================================================================
   fa-dong-bang.mjs — CẮT GỌN FONT AWESOME CHO PHÒNG ĐÁNH ĐỀ

   Bản CDN `all.min.css` (102KB) + `fa-solid-900.woff2` (147KB) chở ~2000 icon,
   phòng chỉ dùng hơn trăm cái — lại nằm ở máy chủ khác (thêm DNS + TLS, chặn
   vẽ trang). Script này dò icon THẬT SỰ dùng trong cây module của phòng, rồi sinh:
       fa-phong/fa-phong.css   — luật nền + đúng các icon đó
       fa-phong/solid.woff2 · regular.woff2 · brands.woff2 — font chỉ còn các glyph đó

   CHẠY LẠI KHI NÀO: thêm icon `fa-…` mới vào study-room.html hoặc bất kỳ module
   nào phòng nạp. Quên chạy = icon mới hiện ô vuông trống.

       node fa-dong-bang.mjs            # sinh lại
       node fa-dong-bang.mjs --kiem     # chỉ báo có icon nào đang thiếu

   Cần mạng (tải FA 6.4.0 từ cdnjs) và Python có fontTools: pip install fonttools brotli
   ===================================================================== */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const RA = join(HERE, 'fa-phong');
const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/';

/* ---------- 1. Cây module của phòng (đi theo import tĩnh + import() động) ---------- */
const GOC = [join(HERE, 'study-room-main.js'), join(HERE, 'whiteboard.js'), resolve(HERE, '../../pwa-install.js')];
const daGap = new Set();
function diQua(f) {
    if (daGap.has(f) || !existsSync(f)) return;
    daGap.add(f);
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?:from\s*|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+\.js)['"]/g)) diQua(resolve(dirname(f), m[1]));
}
GOC.forEach(diQua);
const nguon = [join(HERE, 'study-room.html'), ...daGap];

const dung = new Set();
for (const f of nguon) for (const m of readFileSync(f, 'utf8').matchAll(/\bfa-([a-z0-9]+(?:-[a-z0-9]+)*)/g)) dung.add(m[1]);

/* ---------- 2. Tải bản gốc (có cache trong thư mục tạm) ---------- */
async function lay(ten, nhiPhan) {
    const tam = join(tmpdir(), 'fa640-' + basename(ten));
    if (!existsSync(tam)) {
        const r = await fetch(CDN + ten);
        if (!r.ok) throw new Error('Tải hụt ' + ten + ': ' + r.status);
        writeFileSync(tam, Buffer.from(await r.arrayBuffer()));
    }
    return nhiPhan ? tam : readFileSync(tam, 'utf8');
}
const css = await lay('css/all.min.css');

/* ---------- 3. Lọc luật: icon chỉ giữ cái dùng; bỏ font-face v4/v5 ---------- */
const luat = [];
{
    let i = 0, sau = 0;
    const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
    while (i < body.length) {
        const mo = body.indexOf('{', i);
        if (mo < 0) break;
        let sau2 = mo + 1, tang = 1;
        while (tang && sau2 < body.length) { if (body[sau2] === '{') tang++; else if (body[sau2] === '}') tang--; sau2++; }
        luat.push([body.slice(i, mo).trim(), body.slice(mo + 1, sau2 - 1)]);
        i = sau2; sau = sau2;
    }
}
const ma = new Map(); // tên icon -> codepoint
const out = [];
for (const [sel, than] of luat) {
    const icon = sel.split(',').every(s => /^\.fa-[a-z0-9-]+:(?:before|after)$/.test(s.trim()));
    if (icon && /content:/.test(than)) {
        const giu = sel.split(',').map(s => s.trim()).filter(s => dung.has(s.slice(4).replace(/:(?:before|after)$/, '')));
        if (!giu.length) continue;
        const cp = /content:"\\([0-9a-f]+)"/.exec(than);
        if (cp) giu.forEach(s => ma.set(s.slice(4).replace(/:(?:before|after)$/, ''), parseInt(cp[1], 16)));
        out.push(`${giu.join(',')}{${than}}`);
        continue;
    }
    if (sel === '@font-face') {
        const ho = /font-family:"([^"]+)"/.exec(than)?.[1];
        const nang = /font-weight:(\d+)/.exec(than)?.[1];
        const tep = ho === 'Font Awesome 6 Brands' ? 'brands' : ho === 'Font Awesome 6 Free' ? (nang === '900' ? 'solid' : 'regular') : null;
        if (!tep) continue; // FontAwesome v4 / v5 cũ: phòng không dùng
        out.push(`@font-face{font-family:"${ho}";font-style:normal;font-weight:${nang};font-display:block;src:url(${tep}.woff2) format("woff2")}`);
        continue;
    }
    // Hoạt ảnh/tiện ích (fa-beat, fa-flip, fa-2x…) chỉ giữ cái được dùng; keyframe bản -webkit- bỏ hẳn
    if (sel.startsWith('@-webkit-keyframes')) continue;
    const kf = /^@keyframes fa-([a-z0-9-]+)$/.exec(sel);
    if (kf) { if (dung.has(kf[1])) out.push(`${sel}{${than}}`); continue; }
    if (sel.startsWith('@')) { out.push(`${sel}{${than}}`); continue; }
    const NEN = /^(solid|regular|brands|classic)$/;
    const giu = sel.split(',').map(s => s.trim()).filter(s => {
        if (/fa-sharp|fa-duotone|\.fad\b|\.fass\b|\.fasr\b/.test(s)) return false;
        return [...s.matchAll(/\.fa-([a-z0-9-]+)/g)].every(m => NEN.test(m[1]) || dung.has(m[1]));
    });
    if (giu.length) out.push(`${giu.join(',')}{${than}}`);
}

const thieu = [...dung].filter(n => !ma.has(n) && !out.some(r => r.includes('.fa-' + n + '{') || r.includes('.fa-' + n + ',') || r.includes('.fa-' + n + ' ') || r.includes('.fa-' + n + '>')));
// Chữ trùng tiền tố "fa-" mà không phải icon (tên biến, keyframe…) thì vô hại; chỉ in ra để soi.

/* ---------- 4. Cắt font bằng fontTools ---------- */
const diem = [...new Set(ma.values())].map(c => 'U+' + c.toString(16)).join(',');
if (process.argv.includes('--kiem')) {
    const cu = existsSync(join(RA, 'fa-phong.css')) ? readFileSync(join(RA, 'fa-phong.css'), 'utf8') : '';
    const vang = [...ma.keys()].filter(n => !cu.includes('.fa-' + n + ':'));
    if (vang.length) { console.error('fa-phong.css thiếu icon:', vang.join(', '), '— chạy: node fa-dong-bang.mjs'); process.exit(1); }
    console.log(`fa-phong.css đủ ${ma.size} icon.`);
    process.exit(0);
}
mkdirSync(RA, { recursive: true });
for (const [tep, goc] of [['solid', 'fa-solid-900'], ['regular', 'fa-regular-400'], ['brands', 'fa-brands-400']]) {
    const vao = await lay(`webfonts/${goc}.ttf`, true);
    execFileSync('python', ['-m', 'fontTools.subset', vao, `--unicodes=${diem}`, '--flavor=woff2',
        '--layout-features=*', '--no-hinting', '--desubroutinize', `--output-file=${join(RA, tep + '.woff2')}`], { stdio: 'inherit' });
}

const dau = `/* SINH TỰ ĐỘNG — đừng sửa tay. Nguồn: fa-dong-bang.mjs (Font Awesome Free 6.4.0, CC BY 4.0 / OFL / MIT).
   ${ma.size} icon dò từ ${nguon.length} file của phòng. Thêm icon mới thì chạy lại: node fa-dong-bang.mjs */\n`;
writeFileSync(join(RA, 'fa-phong.css'), dau + out.join('\n') + '\n');
const kb = f => (readFileSync(join(RA, f)).length / 1024).toFixed(1) + 'KB';
console.log(`Đã ghi fa-phong/: css ${kb('fa-phong.css')} · solid ${kb('solid.woff2')} · regular ${kb('regular.woff2')} · brands ${kb('brands.woff2')} — ${ma.size} icon từ ${nguon.length} file.`);
if (thieu.length) console.log('Chữ "fa-…" không khớp icon nào (thường là tiện ích/tên biến):', thieu.join(' '));
