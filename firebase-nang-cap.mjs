// Nâng phiên bản SDK Firebase cho CẢ site trong một lần.
//   node firebase-nang-cap.mjs <cũ> <mới>     thay URL gstatic ở mọi tệp .js/.mjs/.html (cả sw.js), rồi kiểm tra
//   node firebase-nang-cap.mjs --kiem-tra <mới>   chỉ kiểm tra, không sửa gì
// Kiểm tra = mọi tên hàm repo đang import từ firebase-app/auth/firestore/storage còn được bản mới xuất ra không
// (đọc danh sách export{...} cuối tệp trên gstatic). Thoát mã 1 nếu thiếu tên nào.
// Vì sao một lần: nhiều trang dùng chung IndexedDB của Firestore — hai trang khác phiên bản sẽ vấp nhau.
// Xong nhớ: tăng CACHE_NAME trong sw.js; chạy thử các trang bằng trình duyệt thật (SDK thật, không stub).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SKIP = /(^|[\\/])(_backup[^\\/]*|node_modules|\.git)([\\/]|$)/;
const args = process.argv.slice(2);
const checkOnly = args[0] === '--kiem-tra';
const [OLD, NEW] = checkOnly ? [null, args[1]] : args;
if (!NEW || (!checkOnly && !OLD)) { console.error('Dùng: node firebase-nang-cap.mjs <cũ> <mới>  |  --kiem-tra <mới>'); process.exit(2); }

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (SKIP.test(p)) continue;
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|mjs|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(ROOT);
if (!checkOnly) {
  const needle = `gstatic.com/firebasejs/${OLD}/`, repl = `gstatic.com/firebasejs/${NEW}/`;
  let nFiles = 0, nHits = 0;
  for (const f of files) {
    const s = fs.readFileSync(f, 'utf8');
    const n = s.split(needle).length - 1;
    if (!n) continue;
    fs.writeFileSync(f, s.split(needle).join(repl));   // giữ nguyên kiểu xuống dòng của tệp
    nFiles++; nHits += n;
  }
  console.log(`Đã đổi ${nFiles} tệp, ${nHits} chỗ: ${OLD} -> ${NEW}`);
}

// ---- kiểm tra tên import ----
const used = new Map();   // module -> Map(tên -> tệp[])
const reStatic = /import\s*\{([^}]*)\}\s*from\s*["']https:\/\/www\.gstatic\.com\/firebasejs\/([\d.]+)\/firebase-([a-z-]+)\.js["']/g;
const reDyn = /import\(\s*["']https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/firebase-([a-z-]+)\.js["']\s*\)/g;
const versions = new Set(), dynamic = [];
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = reStatic.exec(s))) {
    versions.add(m[2]);
    if (!used.has(m[3])) used.set(m[3], new Map());
    for (const part of m[1].replace(/\/\/.*$/gm, '').split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (!name) continue;
      const mod = used.get(m[3]);
      if (!mod.has(name)) mod.set(name, []);
      mod.get(name).push(path.relative(ROOT, f));
    }
  }
  while ((m = reDyn.exec(s))) dynamic.push(`${path.relative(ROOT, f)} (${m[1]})`);
}
console.log('Phiên bản còn trong mã:', [...versions].join(', ') || '(không có)');
if (dynamic.length) console.log('CÓ import() động — tự soát tay tên hàm:', dynamic.join(' | '));

let missing = 0;
for (const [mod, names] of used) {
  const text = await (await fetch(`https://www.gstatic.com/firebasejs/${NEW}/firebase-${mod}.js`)).text();
  const m = /export\s*\{([^}]*)\}\s*;?\s*(?:\/\/# sourceMappingURL.*)?\s*$/.exec(text);
  if (!m) { console.error(`Không đọc được danh sách export của firebase-${mod}.js ${NEW}`); missing++; continue; }
  const have = new Set(m[1].split(',').map(p => { const seg = p.trim().split(/\s+as\s+/); return (seg[1] || seg[0]).trim(); }));
  const lost = [...names.keys()].filter(n => !have.has(n));
  console.log(`[${mod}] ${names.size} tên đang dùng, ${lost.length ? 'THIẾU: ' + lost.join(', ') : 'đủ cả'}`);
  for (const n of lost) console.log(`    ${n} <- ${[...new Set(names.get(n))].join(', ')}`);
  missing += lost.length;
}
if (versions.size > 1 && !checkOnly) console.log('CẢNH BÁO: vẫn còn nhiều phiên bản khác nhau trong mã.');
process.exit(missing ? 1 : 0);
