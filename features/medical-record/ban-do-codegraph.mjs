/* ban-do-codegraph.mjs — sinh BAN-DO-DU-LIEU.codegraph từ chính mã nguồn.
 *
 * Bản đồ dữ liệu viết tay sẽ rữa ngay lần sửa sau. Tệp này đọc thẳng
 * tao-benh-an.html / .js, benh-an-text.js, clinical-validator.js, cls-de-nghi.js
 * rồi in ra một đồ thị phẳng cho máy đọc.
 *
 *   node ban-do-codegraph.mjs           -> ghi đè BAN-DO-DU-LIEU.codegraph
 *   node ban-do-codegraph.mjs --check    -> chỉ báo số nút/cạnh, không ghi
 *
 * Chạy lại sau mỗi lần thêm/bớt ô nhập liệu.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(DIR, f), 'utf8');

const HTML = read('tao-benh-an.html');
const JS = read('tao-benh-an.js');
const TEXT = read('benh-an-text.js');
const VAL = read('clinical-validator.js');
const CDN = read('cls-de-nghi.js');

const N = [];   // nút:  [id, {k:v}]
const E = [];   // cạnh: [src, rel, dst, {k:v}]
const seen = new Set();
const node = (id, at = {}) => { if (!seen.has(id)) { seen.add(id); N.push([id, at]); } };
const edge = (s, r, d, at = {}) => E.push([s, r, d, at]);

/* ---------- 1. tab ---------- */
const TABS = [...HTML.matchAll(/<div id="([a-z-]+)" class="tab-content/g)]
    .map(m => ({ id: m.group ?? m[1], at: m.index }));
TABS.forEach(t => node(`t:${t.id}`, { kind: 'tab' }));
const tabOf = (pos) => {
    let cur = '?';
    for (const t of TABS) if (t.at <= pos) cur = t.id;
    return cur;
};

/* ---------- 2. ô nhập liệu ---------- */
const FIELD_RE = /<(input|select|textarea)\b([^>]*)>/g;
const attr = (s, k) => (s.match(new RegExp(`\\b${k}="([^"]*)"`)) || [])[1];
const fields = new Map();
for (const m of HTML.matchAll(FIELD_RE)) {
    const id = attr(m[2], 'id');
    if (!id) continue;
    fields.set(id, {
        kind: 'field', tag: m[1].toLowerCase(),
        dtype: attr(m[2], 'type') || (m[1] === 'textarea' ? 'multiline' : 'select'),
        tab: tabOf(m.index),
        list: attr(m[2], 'list') || undefined,
        required: /\brequired\b/.test(m[2]) || undefined
    });
}
for (const [id, at] of fields) node(`f:${id}`, at);
for (const [id, at] of fields) if (at.tab !== '?') edge(`f:${id}`, 'on_tab', `t:${at.tab}`);

/* ---------- 3. FIELDS: ô  <->  đường dẫn bản ghi ---------- */
const fieldsBlock = JS.match(/const FIELDS = \{([\s\S]*?)\n\};/)[1];
const PAIRS = [...fieldsBlock.matchAll(/'([^']+)':\s*'([^']+)'/g)].map(m => [m[1], m[2]]);
for (const [path, id] of PAIRS) {
    node(`p:${path}`, { kind: 'recordpath' });
    edge(`f:${id}`, 'persists_as', `p:${path}`, { via: 'FIELDS' });
}
const pathOfId = Object.fromEntries(PAIRS.map(([p, i]) => [i, p]));

/* ---------- 4. buildModel: đường dẫn -> mục in ra ---------- */
/* Trong buildModel các nhánh gốc được đặt tên tắt; nối lại để suy ngược ra path. */
const ALIAS = {
    h: 'hanhChinh', t: 'tienSu', k: 'khamBenh', s: 'khamBenh.sinhTon',
    ros: 'luocQuaCoQuan', bs: 'benhSuChiTiet', av: 'benhSuChiTiet.sinhHieuNhapVien',
    px: 'phauThuat', sk: 'sanKhoa', nk: 'nhiKhoa', cc: 'capCuu', ct: 'chanThuong',
    bsn: 'benhSuChiTiet.san', bnh: 'benhSuChiTiet.nhi', r: ''
};
const model = TEXT.match(/export function buildModel\(r\) \{([\s\S]*?)\n\}/)[1];
const SEC_RE = /\['([IVX]+\.[^']*|PHẪU THUẬT|THEO DÕI DIỄN TIẾN)'\s*,\s*'fa-[^']*'\s*,\s*\[/g;
const secs = [...model.matchAll(SEC_RE)].map(m => ({ title: m[1], at: m.index }));
secs.forEach((s, i) => {
    s.end = i + 1 < secs.length ? secs[i + 1].at : model.length;
    s.id = `s:${s.title.split('.')[0].trim()}`;
    node(s.id, { kind: 'section', title: s.title });
});
const pathSet = new Set(PAIRS.map(([p]) => p));
const pathsIn = (src) => {
    const hit = new Set();
    for (const m of src.matchAll(/\b([a-z]{1,3})\??\.([A-Za-z0-9?.]+)/g)) {
        const base = ALIAS[m[1]];
        if (base === undefined) continue;
        const full = [base, m[2].replace(/\?/g, '')].filter(Boolean).join('.');
        if (pathSet.has(full)) hit.add(full);
    }
    return hit;
};
/* Vài mảng (admVitals…) dựng trước mảng mục rồi mới cắm vào một mục bằng '@vitals'.
   Quét riêng phần đầu hàm, rồi mục nào nhắc tên biến thì tính luôn các path đó. */
const prelude = model.slice(0, secs[0]?.at ?? model.length);
const VARS = new Map();
for (const m of prelude.matchAll(/const (\w+) = \[([\s\S]*?)\n {4}\];/g))
    VARS.set(m[1], pathsIn(m[2]));
for (const s of secs) {
    const body = model.slice(s.at, s.end);
    const hit = pathsIn(body);
    for (const [v, ps] of VARS) if (new RegExp(`\\b${v}\\b`).test(body)) ps.forEach(p => hit.add(p));
    for (const p of hit) edge(`p:${p}`, 'renders_in', s.id, { via: 'buildModel' });
}

/* ---------- 5. ô con ghép xuống ô chữ ---------- */
for (const m of JS.matchAll(/function (apply\w+)\(\)[\s\S]{0,700}?upsertLine\('([a-z0-9-]+)'/g))
    node(`fn:${m[1]}`, { kind: 'composer' }), edge(`fn:${m[1]}`, 'composes_into', `f:${m[2]}`, { via: 'upsertLine' });
for (const m of JS.matchAll(/autoApply\(\[([^\]]+)\],\s*\n?\s*(apply\w+)\)/g))
    for (const s of m[1].matchAll(/'([a-z0-9-]+)'/g)) edge(`f:${s[1]}`, 'feeds', `fn:${m[2]}`);
for (const m of JS.matchAll(/const (\w+) = bindAuto\('([a-z0-9-]+)'/g)) {
    node(`fn:${m[1]}`, { kind: 'binder', note: 'phai co trong danh sach adopt() cuoi loadExisting' });
    edge(`fn:${m[1]}`, 'composes_into', `f:${m[2]}`, { via: 'bindAuto' });
}
for (const m of JS.matchAll(/(\w+):\s*bindAuto\('([a-z0-9-]+)'/g)) {
    node(`fn:${m[1]}Binder`, { kind: 'binder', note: 'phai co trong danh sach adopt() cuoi loadExisting' });
    edge(`fn:${m[1]}Binder`, 'composes_into', `f:${m[2]}`, { via: 'bindAuto' });
}
for (const m of JS.matchAll(/bindAuto\('([a-z0-9-]+)',\s*(?:\(\)\s*=>\s*)?(\w+)/g))
    if (!/^bindAuto$/.test(m[2])) edge(`fn:${m[2]}`, 'builds_text_for', `f:${m[1]}`);

/* Danh sach adopt(): thieu mot binder o day la o chu do dong bang khi mo lai benh an cu */
const ad = JS.match(/\[([^\]]*Binder[^\]]*)\]\.forEach\(b => b\.adopt\(\)\)/);
if (ad) for (const m of ad[1].matchAll(/([\w.]+Binder|dxBinder\.\w+)/g))
    edge(`fn:${m[1].replace('dxBinder.', '')}${m[1].startsWith('dxBinder.') ? 'Binder' : ''}`,
        'adopted_on_load', 'note:adopt', { why: 'khong adopt thi o chu dong bang sau khi mo lai' });
node('note:adopt', { kind: 'note', text: 'loadExisting() cuoi ham goi adopt() cho moi binder' });

/* ---------- 5b. o con -> ham ghep chu o mo-dun khac ---------- */
const HX = read('benh-su-editor.js');
const prose = HX.match(/export function buildProse\(\) \{([\s\S]*?)\n\}/);
if (prose) {
    node('fn:buildProse', { kind: 'composer', file: 'benh-su-editor.js' });
    const ids = new Set([...prose[1].matchAll(/v\('([a-z0-9-]+)'\)/g)].map(x => x[1]));
    for (const i of ids) if (fields.has(i)) edge(`f:${i}`, 'feeds', 'fn:buildProse');
}

/* Nhom o cung tien to do xuong o chu qua binder: if (el.id.startsWith('dx1-')) dxBinder.dx1.sync() */
for (const m of JS.matchAll(/startsWith\('([a-z0-9]+-)'\)\)\s*(\w+)(?:\.(\w+))?\.sync\(\)/g)) {
    const bind = m[3] ? `fn:${m[3]}Binder` : `fn:${m[2]}`;
    for (const [id] of fields) if (id.startsWith(m[1])) edge(`f:${id}`, 'feeds', bind);
}

/* ENV_FIELDS ghi thang xuong history-environment bang mot listener rieng */
const env = JS.match(/const ENV_FIELDS = \[([\s\S]*?)\];/);
if (env) {
    node('fn:envText', { kind: 'composer' });
    edge('fn:envText', 'composes_into', 'f:history-environment', { via: 'change listener' });
    for (const m of env[1].matchAll(/'([a-z0-9-]+)'\]/g)) edge(`f:${m[1]}`, 'feeds', 'fn:envText');
}

/* Ho ten / MSSV sinh vien in o dong dau ban Markdown, khong nam trong mot muc nao */
node('s:HEADER', { kind: 'section', title: 'dong ky ten dau ban Markdown' });
for (const [path, id] of PAIRS) if (path.startsWith('sinhVien.'))
    edge(`p:${path}`, 'renders_in', 's:HEADER', { via: 'toMarkdown head' });

/* ---------- 5c. du lieu khong phai o nhap: mo-dun tu giu ---------- */
const collect = JS.match(/function collectRecord\(\) \{([\s\S]*?)\n\}/)[1];
const GETTER_FILE = {
    getCls: 'cls-editor.js', getSteps: 'benh-su-editor.js', getBienLuan: 'bien-luan-editor.js',
    getTheoDoi: 'theo-doi-editor.js', getRx: 'rx-editor.js', getAsk: 'ui-ask.js',
    getPhanDo: 'phan-do.js', imgExam: 'image-upload.js', imgHoSo: 'image-upload.js',
    cnvInternal: 'cnv-list.js', cnvSurgery: 'cnv-list.js', dsGiaDinh: 'gia-dinh-list.js',
    dsDiUng: 'di-ung-list.js', burnGet: 'body-map.js', gayXuong: 'chan-thuong-data.js',
    currentFolder: 'folder-store.js'
};
const addStore = (key, src) => {
    node(`p:${key}`, { kind: 'recordpath', source: 'module' });
    node(`m:${src}`, { kind: 'module', file: GETTER_FILE[src] || '?' });
    edge(`m:${src}`, 'stores_as', `p:${key}`, { via: 'collectRecord' });
};
for (const m of collect.matchAll(/rec\.(\w+)\s*=\s*(?:\()?(\w+)/g)) addStore(m[1], m[2]);
for (const m of collect.matchAll(/setPath\(rec, '([^']+)',\s*(\w+)/g)) addStore(m[1], m[2]);

/* ---------- 6. ô cùng một dữ kiện ---------- */
const mir = JS.match(/const MIRRORS = \[([\s\S]*?)\n\];/);
if (mir) for (const m of mir[1].matchAll(/\['([a-z0-9-]+)',\s*'([a-z0-9-]+)'\]/g))
    edge(`f:${m[1]}`, 'mirrors', `f:${m[2]}`, { rule: 'fill_if_empty', on: 'change' });
const der = JS.match(/function fillDerived\(id\) \{([\s\S]*?)\n\}/);
if (der) {
    let src = null;
    for (const line of der[1].split('\n')) {
        const s = line.match(/id === '([a-z0-9-]+)'/);
        if (s) src = s[1];
        const d = line.match(/fillIfEmpty\('([a-z0-9-]+)'/);
        if (d && src) edge(`f:${src}`, 'derives_to', `f:${d[1]}`, { rule: 'fill_if_empty', on: 'change' });
    }
}

/* ---------- 7. ô nào kích hoạt phép tính nào ---------- */
for (const line of JS.split('\n')) {
    if (!/^\s{4}if \(/.test(line)) continue;
    const calls = [...line.matchAll(/\b((?:calc|refresh|sync|render|flag|apply)[A-Z]\w*)\(/g)].map(x => x[1]);
    if (!calls.length) continue;
    const ids = [...line.matchAll(/'([a-z][a-z0-9]*-[a-z0-9-]+)'/g)].map(x => x[1]);
    const pre = line.match(/startsWith\('([a-z0-9-]+)'\)/g) || [];
    for (const c of calls) {
        node(`fn:${c}`, { kind: 'calc' });
        for (const i of ids) if (fields.has(i)) edge(`f:${i}`, 'triggers', `fn:${c}`);
        for (const p of pre) {
            const px = p.match(/'([a-z0-9-]+)'/)[1];
            edge(`prefix:${px}*`, 'triggers', `fn:${c}`);
            node(`prefix:${px}*`, { kind: 'fieldgroup' });
        }
    }
}

/* ---------- 8. luật kiểm tra chéo ---------- */
for (const m of VAL.matchAll(/title:\s*'([^']+)'[\s\S]{0,900}?targetTab:\s*'([a-z-]+)',\s*targetField:\s*'([a-z0-9-]+)'/g)) {
    const id = `rule:${m[1]}`;
    node(id, { kind: 'rule', file: 'clinical-validator.js' });
    edge(id, 'points_at', `f:${m[3]}`);
    edge(id, 'points_at', `t:${m[2]}`);
}

/* ---------- 9. kho gợi ý ---------- */
for (const m of HTML.matchAll(/<datalist id="([a-z0-9-]+)">([\s\S]*?)<\/datalist>/g))
    node(`dl:${m[1]}`, { kind: 'datalist', inline_options: (m[2].match(/<option/g) || []).length });
for (const [id, at] of fields) if (at.list) edge(`f:${id}`, 'suggested_by', `dl:${at.list}`);
for (const m of JS.matchAll(/fillDatalist\('([a-z0-9-]+)',\s*([A-Z_][\w.]*)/g)) {
    node(`lib:${m[2]}`, { kind: 'datalib', file: 'tao-benh-an.js imports' });
    edge(`lib:${m[2]}`, 'fills', `dl:${m[1]}`);
}
if (/KY_VONG_THEO_CLS/.test(CDN)) {
    node('lib:KY_VONG_THEO_CLS', { kind: 'datalib', file: 'de-nghi-data.js' });
    edge('lib:KY_VONG_THEO_CLS', 'fills', 'dl:cd-ky-list', { via: 'cls-de-nghi.js focusin', per: 'row' });
}
const qf = read('goi-y-nhap.js').match(/const QUICK_FILL\s*=\s*\{([\s\S]*?)\n\};/);
if (qf) {
    node('lib:QUICK_FILL', { kind: 'datalib', file: 'goi-y-nhap.js' });
    for (const m of qf[1].matchAll(/^\s{4}'([a-z0-9-]+)':\s*\[/gm))
        if (fields.has(m[1])) edge('lib:QUICK_FILL', 'suggests_for', `f:${m[1]}`);
}

/* Bang chon + goi y khi go (goi-y-nhap.js) cung la nguon goi y */
const GY = read('goi-y-nhap.js');
for (const m of GY.matchAll(/attachPicker\('([a-z0-9-]+)',\s*\{[^}]*?groups:\s*(\w+)/g)) {
    node(`lib:${m[2]}`, { kind: 'datalib' });
    edge(`lib:${m[2]}`, 'suggests_for', `f:${m[1]}`, { via: 'attachPicker' });
}
for (const m of GY.matchAll(/attachPicker\('([a-z0-9-]+)',\s*\{\s*\.\.\.(\w+)/g)) {
    const src = (GY.match(new RegExp(`const ${m[2].replace('P', '')} = \{[^}]*groups:\s*(\w+)`)) || [])[1];
    if (src) { node(`lib:${src}`, { kind: 'datalib' }); edge(`lib:${src}`, 'suggests_for', `f:${m[1]}`, { via: 'attachPicker' }); }
}
for (const m of GY.matchAll(/attachTypeahead\(\$\('([a-z0-9-]+)'\),\s*\{\s*items:\s*(\w+)/g)) {
    node(`lib:${m[2]}`, { kind: 'datalib' });
    edge(`lib:${m[2]}`, 'suggests_for', `f:${m[1]}`, { via: 'attachTypeahead' });
}
for (const m of GY.matchAll(/\[([^\]]*?)\][\s\S]{0,20}?\.forEach\(id => attachTypeahead\(\$\(id\),\s*\{\s*items:\s*(\w+)/g)) {
    node(`lib:${m[2]}`, { kind: 'datalib' });
    for (const i of m[1].matchAll(/'([a-z0-9-]+)'/g)) edge(`lib:${m[2]}`, 'suggests_for', `f:${i[1]}`, { via: 'attachTypeahead' });
}
/* benh-kem-list.js: hai danh sach bk1/bk2 ghep xuong dx1-assoc / dx2-assoc */
for (const m of JS.matchAll(/field:\s*\$\(`(dx\$\{n\}-assoc)`\)/g)) {
    node('fn:benhKemList', { kind: 'composer', file: 'benh-kem-list.js' });
    for (const n_ of [1, 2]) {
        edge('fn:benhKemList', 'composes_into', `f:dx${n_}-assoc`, { via: 'createBenhKemList' });
        edge('lib:BENH_NHOM', 'suggests_for', `f:dx${n_}-assoc`, { via: 'benh-kem-list.js' });
    }
}

/* Cac o co bang chon rieng, gan trong tao-benh-an.js */
for (const [f, lib, via] of [
    ['reason-for-admission', 'LY_DO_NHOM', 'ly-do-list.js'],
    ['history-drugs', 'THUOC_GROUPS', 'doi-list.js'],
    ['history-allergy', 'DI_UNG_NHOM', 'di-ung-list.js'],
    ['history-family', 'BENH_NHOM', 'gia-dinh-list.js'],
    ['history-internal', 'BENH_NHOM', 'cnv-list.js'],
    ['history-surgery', 'BENH_NHOM', 'cnv-list.js'],
    ['problem-list', 'VAN_DE_NHOM', 'bien-luan-data.js']
]) { node(`lib:${lib}`, { kind: 'datalib' }); edge(`lib:${lib}`, 'suggests_for', `f:${f}`, { via }); }

/* ---------- 10. ô không lưu ---------- */
for (const [id] of fields) if (!pathOfId[id]) node(`f:${id}`, {}), edge(`f:${id}`, 'not_persisted', 'note:by_design');
node('note:by_design', { kind: 'note', text: 'medical-record-id/record-status gan rieng trong collectRecord; ba-guide la cong tac giao dien' });

/* ---------- 10b. chang noi may khong doc duoc, khai bao tay ----------
   Vai duong di qua textContent cua mot the <span> hoac qua mot ham trung gian
   khong co trong cac mau regex tren. Khai bao o day de phep tu kiem o muc 11
   khong bao dong gia. Moi dong deu ghi ro duong di that. */
const MANUAL = [
    ['fn:mainSymProse', 'builds_text_for', 'fn:buildProse',
        'benh-su-editor.js: buildProse() goi mainSymProse()'],
    ['fn:calcOnset', 'builds_text_for', 'fn:buildProse',
        'calcOnset ghi vao #hx-onset-tag, buildProse doc textContent cua no'],
    ['fn:calcScores', 'builds_text_for', 'f:summary',
        'calcScores ghi #curb-out va #gcs-out, buildSummary doc textContent nhom "Thang diem"'],
    ['fn:calcQsofa', 'builds_text_for', 'f:summary',
        'calcQsofa ghi #qsofa-out, buildSummary doc textContent nhom "Thang diem"']
];
for (const [s_, r, d, why] of MANUAL) { node(s_, { kind: 'composer' }); edge(s_, r, d, { manual: 1, why }); }
for (const id of ['hx-sym-name', 'hx-sym-site', 'hx-sym-char', 'hx-sym-severity',
    'hx-sym-time', 'hx-sym-factors', 'hx-sym-assoc', 'hx-sym-treated'])
    if (fields.has(id)) edge(`f:${id}`, 'feeds', 'fn:mainSymProse', { manual: 1 });
edge('f:hx-onset-date', 'feeds', 'fn:calcOnset', { manual: 1 });
edge('f:curb-confusion', 'feeds', 'fn:calcScores', { manual: 1 });

/* O co y khong ra ban benh an: cong tac giao dien / khoa ban ghi */
for (const id of ['medical-record-id', 'record-status', 'ba-guide', 'record-type'])
    if (fields.has(id)) edge(`f:${id}`, 'control_only', 'note:by_design', { manual: 1 });

/* ---------- 11. tu kiem: o nao khong co duong ra ban benh an ----------
   Di nguoc tu cac muc I..XV. Mot o "toi duoc" khi no persists_as mot path co
   renders_in, hoac no feeds mot ham ghep chu do lai xuong mot o toi duoc.
   O nao con lai la go xong mat chu — dung day la cho phai xem lai. */
const CARRY = new Set(['persists_as', 'renders_in', 'feeds', 'composes_into',
    'builds_text_for', 'mirrors', 'derives_to']);
/* Lan nguoc tu cac muc I..XV: mot nut "toi duoc ban xuat" khi no co mot canh
   thuoc CARRY tro toi mot nut da toi duoc. Lap den khi khong them duoc gi nua. */
const toOut = new Set(N.filter(([, a_]) => a_.kind === 'section').map(([id]) => id));
for (let grew = true; grew;) {
    grew = false;
    for (const [s_, r, d] of E)
        if (CARRY.has(r) && toOut.has(d) && !toOut.has(s_)) { toOut.add(s_); grew = true; }
}
const ctrl = new Set(E.filter(([, r]) => r === 'control_only').map(([x]) => x));
const orphan = [...fields.keys()].filter(id => !toOut.has(`f:${id}`) && !ctrl.has(`f:${id}`));
node('note:no_route', {
    kind: 'note',
    text: 'go vao o nay xong chu khong ra ban benh an xuat — hoac la o phu tro (calc/UI), hoac la mot cho dut'
});
for (const id of orphan) edge(`f:${id}`, 'no_route_to_output', 'note:no_route');

/* ---------- in ra ---------- */
const kv = (o) => Object.entries(o).filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${String(v).replace(/[|\n]/g, ' ')}`).join('|');
const out = [
    '# CODEGRAPH tao-benh-an.html — do thi du lieu, danh cho may doc.',
    '# SINH TU DONG bang `node ban-do-codegraph.mjs`. DUNG SUA TAY.',
    '# Doc kem: BAN-DO-DU-LIEU.md (giai thich quy tac cho nguoi).',
    '#',
    '# N|<id>|k=v|...            nut',
    '# E|<src>|<rel>|<dst>|k=v   canh',
    '#',
    '# khong gian ten id:',
    '#   f:<id>        o nhap lieu trong HTML',
    '#   p:<path>      duong dan trong doi tuong ban ghi',
    '#   s:<mucLaMa>   muc I..XV trong ban benh an xuat ra',
    '#   t:<tab>       tab tren trang',
    '#   fn:<ten>      ham ghep chu / phep tinh',
    '#   dl:<id>       datalist   · lib:<TEN> kho du lieu · rule:<title> luat kiem tra',
    '#   prefix:<x>*   nhom o cung tien to (vd vital-*)',
    '#',
    '# quan he:',
    '#   persists_as   o  -> duong dan (bang FIELDS, dung chung cho luu va nap)',
    '#   renders_in    duong dan -> muc trong ban xuat (buildModel)',
    '#   composes_into ham ghep -> o chu lon (upsertLine / bindAuto)',
    '#   feeds         o con -> ham ghep',
    '#   mirrors       hai o cung mot du kien, do qua lai khi o kia con trong',
    '#   derives_to    o nay suy ra o kia, mot chieu',
    '#   triggers      o doi -> chay lai phep tinh',
    '#   points_at     luat kiem tra -> o / tab no chi toi',
    '#   suggested_by  o -> datalist · fills kho -> datalist · suggests_for kho -> o',
    '#   on_tab        o nam o tab nao',
    '#   not_persisted o khong co trong FIELDS (co y)',
    '#',
    `# nut=${N.length} canh=${E.length}`,
    ''
];
for (const [id, at] of N) out.push(`N|${id}${Object.keys(at).length ? '|' + kv(at) : ''}`);
out.push('');
for (const [s, r, d, at] of E) out.push(`E|${s}|${r}|${d}${Object.keys(at).length ? '|' + kv(at) : ''}`);

if (process.argv.includes('--check')) console.log(`nut=${N.length} canh=${E.length}`);
else {
    writeFileSync(join(DIR, 'BAN-DO-DU-LIEU.codegraph'), out.join('\n') + '\n', 'utf8');
    console.log(`da ghi BAN-DO-DU-LIEU.codegraph — nut=${N.length} canh=${E.length}`);
}
