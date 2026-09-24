// sinh-preview.mjs — dựng lại dev/preview.html từ study-room.html (khỏi chép tay rồi lệch nhau).
//     node dev/sinh-preview.mjs
// Khác bản thật đúng 2 chỗ: <base href="../"> + import map trỏ Firebase sang stub-*.js,
// và bỏ modulepreload của Firebase thật (import map không áp cho modulepreload -> tải phí).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(HERE, '..', 'study-room.html'), 'utf8');
const MAP = `    <base href="../">
    <script type="importmap">
    {"imports":{
      "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js":"./dev/stub-firestore.js",
      "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js":"./dev/stub-auth.js",
      "https://www.gstatic.com/firebasejs/9.6.0/firebase-storage.js":"./dev/stub-storage.js",
      "../../core/firebase-init.js":"./dev/stub-init.js"
    }}
    </script>
`;
const anchor = '    <script src="../../pwa-install.js" defer></script>\n';
if (!src.includes(anchor)) throw new Error('Không thấy mốc pwa-install.js trong study-room.html');
const out = src
    .replace(anchor, MAP + anchor)
    .split('\n')
    .filter(l => !/rel="modulepreload" href="(https:\/\/www\.gstatic\.com|\.\.\/\.\.\/core\/firebase-init\.js)/.test(l))
    .join('\n');
writeFileSync(join(HERE, 'preview.html'), out);
console.log('Đã sinh dev/preview.html từ study-room.html');
