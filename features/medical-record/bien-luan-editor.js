// bien-luan-editor.js — X. BIỆN LUẬN LÂM SÀNG dựng theo 4 khối tư duy kinh điển.
//
//   Khối 1. Vấn đề / hội chứng
//   Khối 2. Dấu chứng lâm sàng ủng hộ + âm tính có giá trị + yếu tố nguy cơ
//   Khối 3. Phân tầng nguyên nhân (4 mức) — mỗi nhánh kèm lý do và CLS phân định
//   Khối 4. Biến chứng cần bàn & theo dõi
//
// Bản cũ có thêm ô "Nghĩ đến" nằm giữa dấu chứng và nguyên nhân, gây trùng chữ
// (sinh viên ghi hội chứng ở đó rồi ghi lại ở nhánh nguyên nhân). Ô đó đã bỏ;
// nội dung cũ được chuyển thành một nhánh nguyên nhân mức "Nghĩ nhiều nhất".
//
// Lưu ở record.bienLuan =
//   { vanDe:[{ id, ten, lamSang:[], amTinh:[], yeuTo, redFlags:[],
//              nguyenNhan:[{id,ten,muc,lyDo,cls}], bienChung:[{id,ten,lapLuan}] }] }

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const trim = (x) => String(x ?? '').trim();
const newId = () => 'b' + Math.random().toString(36).slice(2, 8);

import { suggestFor, searchLibrary, clsForCause } from './bien-luan-data.js';
import { drawMap, downloadMapPng } from './bien-luan-map.js';
import { getSteps, mainSymLabels } from './benh-su-editor.js';

/** 4 mức phân tầng — thứ tự này quyết định màu badge và thứ tự trình bày */
export const LEVELS = ['Nghĩ nhiều nhất', 'Nghĩ tới', 'Ít nghĩ', 'Cần loại trừ'];
const LEVEL_META = [
    { ico: '🔴', hint: 'chẩn đoán sơ bộ — hợp nhất về dịch tễ, bệnh sử, dấu chứng then chốt' },
    { ico: '🟡', hint: 'chẩn đoán phân biệt — có triệu chứng trùng nhưng thiếu tiêu chuẩn' },
    { ico: '⚪', hint: 'ít nghĩ — có dấu chứng âm tính giá trị làm giảm khả năng' },
    { ico: '🚨', hint: 'bệnh cảnh đe dọa tính mạng, phải tầm soát trước' }
];
/** Bản cũ ghi "Loại trừ" — quy về mức thứ tư */
const fixLevel = (m) => {
    const t = trim(m);
    if (!t) return LEVELS[1];
    if (/^lo[aạ]i tr[uừ]/i.test(t)) return LEVELS[3];
    return LEVELS.includes(t) ? t : LEVELS[1];
};

let data = { vanDe: [] };
let host, onChangeCb = () => { };

/* ---------- dữ liệu ---------- */
const splitList = (v) => Array.isArray(v)
    ? v.filter(Boolean).map(trim)
    : trim(v).split(/[;\n]/).map(trim).filter(Boolean);

function normalize(v) {
    const out = {
        id: v.id || newId(), ten: v.ten || '',
        lamSang: splitList(v.lamSang), amTinh: splitList(v.amTinh),
        yeuTo: v.yeuTo || '',
        redFlags: Array.isArray(v.redFlags) ? v.redFlags.filter(Boolean) : [],
        nguyenNhan: [], bienChung: []
    };

    if (Array.isArray(v.nguyenNhan)) {
        out.nguyenNhan = v.nguyenNhan.map(n => ({
            id: n.id || newId(), ten: n.ten || '', muc: fixLevel(n.muc), lyDo: n.lyDo || '', cls: n.cls || ''
        }));
    } else if (trim(v.nguyenNhan)) {
        out.nguyenNhan = trim(v.nguyenNhan).split(/[;,\n]/).map(trim).filter(Boolean)
            .map(ten => ({ id: newId(), ten, muc: LEVELS[1], lyDo: '', cls: '' }));
    }
    if (trim(v.loaiTru)) out.nguyenNhan.push({ id: newId(), ten: trim(v.loaiTru), muc: LEVELS[3], lyDo: '', cls: '' });

    // Ô "Nghĩ đến" của bản cũ: đưa lên đầu danh sách nguyên nhân thay vì để trùng chữ
    if (trim(v.nghiDen) && !out.nguyenNhan.some(n => trim(n.ten).toLowerCase() === trim(v.nghiDen).toLowerCase())) {
        out.nguyenNhan.unshift({ id: newId(), ten: trim(v.nghiDen), muc: LEVELS[0], lyDo: '', cls: '' });
    }

    if (Array.isArray(v.bienChung)) {
        out.bienChung = v.bienChung.map(b => ({ id: b.id || newId(), ten: b.ten || '', lapLuan: b.lapLuan || '' }));
    }
    return out;
}

export function getBienLuan() {
    return {
        vanDe: data.vanDe
            .map(v => ({
                ...v,
                lamSang: v.lamSang.filter(x => trim(x)),
                amTinh: v.amTinh.filter(x => trim(x)),
                nguyenNhan: v.nguyenNhan.filter(n => trim(n.ten)),
                bienChung: v.bienChung.filter(b => trim(b.ten))
            }))
            .filter(v => trim(v.ten) || v.lamSang.length || v.amTinh.length || trim(v.yeuTo)
                || v.redFlags.length || v.nguyenNhan.length || v.bienChung.length)
    };
}

export function setBienLuan(obj) {
    const src = obj && Array.isArray(obj.vanDe) ? obj.vanDe : [];
    // Bảng "phân định" của bản cũ: gắn vào vấn đề đầu tiên cho khỏi mất
    const legacy = (obj?.phanDinh || []).map(p => ({ id: p.id || newId(), ten: p.ten || '', muc: fixLevel(p.muc), lyDo: p.lyDo || '', cls: '' }));
    data = { vanDe: src.map(normalize) };
    if (legacy.length) {
        if (!data.vanDe.length) data.vanDe.push(normalize({ ten: '' }));
        data.vanDe[0].nguyenNhan.push(...legacy.filter(l => trim(l.ten)));
    }
    (obj?.bienChung || []).forEach(b => {
        if (!data.vanDe.length) data.vanDe.push(normalize({ ten: '' }));
        data.vanDe[0].bienChung.push({ id: b.id || newId(), ten: b.ten || '', lapLuan: b.lapLuan || '' });
    });
    render();
}

/* =====================================================================
   Hốt chứng cứ: quét lại những gì đã ghi ở bệnh sử và khám rồi đổ thành
   các dấu chứng ủng hộ, sinh viên chỉ sửa cho gọn thay vì gõ lại từ đầu.
   ===================================================================== */
const EXAM_FIELDS = [['Khám', 'exam-general'], ['Đầu – mặt – cổ', 'exam-head'], ['Ngực', 'exam-chest'],
['Tim', 'exam-heart'], ['Phổi', 'exam-lung'], ['Bụng', 'exam-abdomen'], ['Thần kinh – cơ xương khớp', 'exam-neuro-msk']];

export function collectEvidence() {
    const v = (id) => trim($(id)?.value);
    const out = [];

    // Cơ năng: triệu chứng chính đủ thuộc tính + triệu chứng ở từng mốc bệnh sử
    const name = v('hx-sym-name');
    if (name) {
        const attrs = mainSymLabels().filter(x => x.on && v(x.id)).map(x => v(x.id));
        out.push(attrs.length ? `${name}: ${attrs.join(', ')}` : name);
    }
    getSteps().forEach(m => {
        trim(m.s).split(';').map(trim).filter(Boolean).forEach(t => out.push(t));
        (m.refs || []).filter(r => trim(r.sym) && r.st !== 'tương tự')
            .forEach(r => out.push(`${trim(r.sym)} ${r.st}${trim(r.d) ? ` (${trim(r.d)})` : ''}`));
    });

    // Sinh hiệu lúc khám
    const vitals = [['Mạch', 'vital-pulse', 'l/p'], ['HA', 'vital-bp', 'mmHg'], ['Nhiệt độ', 'vital-temp', '°C'],
    ['Nhịp thở', 'vital-resp', 'l/p'], ['SpO2', 'vital-spo2', '%']]
        .map(([l, id, u]) => v(id) && `${l} ${v(id)} ${u}`).filter(Boolean);
    if (vitals.length) out.push(vitals.join(', '));

    // Thực thể: mỗi dòng đã ghi ở các ô khám là một dấu chứng
    EXAM_FIELDS.forEach(([, id]) => v(id).split('\n').map(trim).filter(Boolean).forEach(t => out.push(t)));

    // Tiền căn liên quan — phần làm nên "yếu tố nguy cơ" của vấn đề
    const tc = [v('history-internal'), v('history-habit')].filter(Boolean).join('; ');
    if (tc) out.push(`Tiền căn: ${tc}`);

    const seen = new Set();
    return out.filter(x => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase())).slice(0, 25);
}

/** Âm tính có giá trị: lấy từ ô âm tính của bệnh sử và phần lược qua cơ quan */
export function collectNegatives() {
    const v = (id) => trim($(id)?.value);
    const out = v('hx-negatives').split(/[;,]/).map(trim).filter(Boolean);
    ['ros-cardio', 'ros-resp', 'ros-gi', 'ros-neuro', 'ros-msk', 'ros-uro'].forEach(id => {
        v(id).split(/[;,\n]/).map(trim).filter(x => /^kh[ôo]ng|^ch[ưu]a/i.test(x)).forEach(x => out.push(x));
    });
    const seen = new Set();
    return out.filter(x => !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase())).slice(0, 15);
}

/** Các bệnh cảnh "cần loại trừ khẩn" đang có trong cây — để nơi khác đối chiếu */
export const listRedFlags = () => [...new Set([
    ...data.vanDe.flatMap(v => v.redFlags),
    ...data.vanDe.flatMap(v => v.nguyenNhan.filter(n => n.muc === LEVELS[3]).map(n => trim(n.ten)))
].filter(Boolean))];

/** Bật / tắt một bệnh cảnh cần loại trừ (thêm vào vấn đề đầu, chưa có thì tạo) */
export function toggleRedFlag(text) {
    const has = data.vanDe.find(v => v.redFlags.includes(text));
    if (has) has.redFlags = has.redFlags.filter(x => x !== text);
    else {
        if (!data.vanDe.length) data.vanDe.push(normalize({ ten: '' }));
        data.vanDe[0].redFlags.push(text);
    }
    render();
    onChangeCb();
    return !has;
}

/** Tạo cây từ mục VIII. Đặt vấn đề */
export function syncFromProblems() {
    const lines = ($('problem-list')?.value || '').split('\n')
        .map(l => l.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
    if (!lines.length) return 0;
    let added = 0;
    lines.forEach(ten => {
        if (data.vanDe.some(v => trim(v.ten).toLowerCase() === ten.toLowerCase())) return;
        data.vanDe.push(normalize({ ten }));
        added++;
    });
    if (added) { render(); onChangeCb(); }
    return added;
}

/* ---------- Khối 3: một nhánh nguyên nhân ---------- */
function nguyenNhanHtml(n, vi, ni) {
    const lv = fixLevel(n.muc);
    const li = LEVELS.indexOf(lv);
    return `<div class="tr-leaf lv-${li}" data-v="${vi}" data-n="${ni}">
        <span class="tr-dot" title="${esc(LEVEL_META[li].hint)}">${LEVEL_META[li].ico}</span>
        <input class="tr-in name" data-k="ten" value="${esc(n.ten)}" placeholder="Nguyên nhân / chẩn đoán" aria-label="Nguyên nhân">
        <select class="tr-lv" data-k="muc" aria-label="Mức độ nghĩ tới">
            ${LEVELS.map((l, i) => `<option ${lv === l ? 'selected' : ''}>${LEVEL_META[i].ico} ${l}</option>`).join('')}
        </select>
        <input class="tr-in" data-k="lyDo" value="${esc(n.lyDo)}" placeholder="vì… (ủng hộ / thiếu / âm tính giá trị)" aria-label="Lý do">
        <button type="button" class="tr-x" data-act="del-nn" title="Xóa nhánh"><i class="fas fa-xmark"></i></button>
        <input class="tr-in sub" data-k="cls" value="${esc(n.cls)}" placeholder="Cận lâm sàng để phân định nhánh này" aria-label="Cận lâm sàng">
    </div>`;
}

function bienChungHtml(b, vi, bi) {
    return `<div class="tr-leaf lv-warn" data-v="${vi}" data-b="${bi}">
        <span class="tr-dot"></span>
        <input class="tr-in name" data-k="ten" value="${esc(b.ten)}" placeholder="Biến chứng" aria-label="Biến chứng">
        <input class="tr-in wide" data-k="lapLuan" value="${esc(b.lapLuan)}" placeholder="dấu chứng gợi ý, cần làm gì để xác định" aria-label="Lập luận">
        <button type="button" class="tr-x" data-act="del-bc" title="Xóa nhánh"><i class="fas fa-xmark"></i></button>
    </div>`;
}

/** Danh sách thẻ chữ có nút xóa (dùng cho lâm sàng ủng hộ và âm tính giá trị) */
function tagsHtml(list, vi, key, cls = '') {
    return list.map((x, i) => `<span class="tr-tag ${cls}" data-v="${vi}" data-${key}="${i}">${esc(x)}
        <button type="button" data-act="del-${key}" aria-label="Xóa"><i class="fas fa-xmark"></i></button></span>`).join('');
}

function vanDeHtml(v, vi) {
    const lib = suggestFor(v.ten);
    const daCo = (t) => v.nguyenNhan.some(n => trim(n.ten).toLowerCase() === t.toLowerCase());
    const goiY = lib.nn.filter(x => !daCo(x)).slice(0, 8);
    const goiRed = (lib.red || []).filter(x => !v.redFlags.includes(x) && !daCo(x)).slice(0, 4);
    const goiHall = (lib.hall || []).filter(x => !v.lamSang.some(y => trim(y).toLowerCase() === x.toLowerCase())).slice(0, 6);
    const goiCls = (lib.cls || []).slice(0, 6);

    // Nhánh nguyên nhân xếp theo mức để mắt đọc được ngay thứ tự ưu tiên
    const byLevel = LEVELS.map((lv, li) => ({
        lv, li, rows: v.nguyenNhan.map((n, ni) => ({ n, ni })).filter(x => fixLevel(x.n.muc) === lv)
    })).filter(g => g.rows.length);

    return `<div class="tr-card" data-v="${vi}">
        <div class="tr-root">
            <span class="tr-no">${vi + 1}</span>
            <input class="tr-title" data-k="ten" value="${esc(v.ten)}" placeholder="Tên hội chứng / vấn đề (gõ để app gợi nhánh)" aria-label="Tên vấn đề">
            <span class="tr-tools">
                <button type="button" class="tr-x" data-act="up" title="Lên trên"><i class="fas fa-arrow-up"></i></button>
                <button type="button" class="tr-x" data-act="down" title="Xuống dưới"><i class="fas fa-arrow-down"></i></button>
                <button type="button" class="tr-x" data-act="dup-vd" title="Nhân bản"><i class="fas fa-copy"></i></button>
                <button type="button" class="tr-x" data-act="del-vd" title="Xóa vấn đề"><i class="fas fa-trash"></i></button>
            </span>
        </div>
        ${lib.tieuChuan ? `<div class="tr-crit"><i class="fas fa-clipboard-check"></i>
            <span><b>Tiêu chuẩn chẩn đoán tối thiểu:</b> ${esc(lib.tieuChuan)}</span></div>` : ''}

        <div class="tr-branch">
            <div class="tr-label"><i class="fas fa-magnifying-glass"></i> ② Dấu chứng lâm sàng ủng hộ
                <button type="button" class="tr-mini" data-act="harvest"
                    title="Quét bệnh sử và phần khám, đổ sẵn dấu chứng vào đây"><i class="fas fa-wand-magic-sparkles"></i> Quét tự động từ bệnh án</button>
            </div>
            <div class="tr-tags">
                ${tagsHtml(v.lamSang, vi, 's')}
                <input class="tr-tag-in" data-act="add-ls" data-v="${vi}" placeholder="+ thêm dấu chứng rồi Enter" aria-label="Thêm dấu chứng">
            </div>
            ${goiHall.length ? `<div class="tr-sugg"><span>Dấu hiệu then chốt của hội chứng này:</span>
                ${goiHall.map(x => `<button type="button" class="tr-sugg-b" data-act="add-hall" data-text="${esc(x)}">+ ${esc(x)}</button>`).join('')}</div>` : ''}
        </div>

        <div class="tr-branch">
            <div class="tr-label"><i class="fas fa-circle-minus"></i> Âm tính có giá trị
                <button type="button" class="tr-mini" data-act="harvest-neg"
                    title="Lấy các triệu chứng âm tính đã ghi ở bệnh sử và lược qua cơ quan"><i class="fas fa-wand-magic-sparkles"></i> Quét âm tính</button>
            </div>
            <div class="tr-tags">
                ${tagsHtml(v.amTinh, vi, 'a', 'neg')}
                <input class="tr-tag-in" data-act="add-am" data-v="${vi}" placeholder="+ vd: không sốt về chiều, không sụt cân" aria-label="Thêm âm tính">
            </div>
        </div>

        <div class="tr-branch">
            <div class="tr-label"><i class="fas fa-fire-flame-curved"></i> Yếu tố nguy cơ / thúc đẩy</div>
            <input class="tr-in wide" data-k="yeuTo" data-v="${vi}" value="${esc(v.yeuTo)}"
                placeholder="vd hút thuốc 40 gói·năm, đái tháo đường, dùng corticoid kéo dài" aria-label="Yếu tố nguy cơ">
        </div>

        <div class="tr-branch">
            <div class="tr-label"><i class="fas fa-code-branch"></i> ③ Phân tầng nguyên nhân &amp; chẩn đoán phân biệt
                <button type="button" class="tr-mini" data-act="add-nn"><i class="fas fa-plus"></i> Thêm nhánh</button>
            </div>
            ${byLevel.map(g => `<div class="tr-tier">
                <div class="tr-tier-h lv-${g.li}">${LEVEL_META[g.li].ico} ${g.lv}
                    <small>${esc(LEVEL_META[g.li].hint)}</small></div>
                ${g.rows.map(x => nguyenNhanHtml(x.n, vi, x.ni)).join('')}
            </div>`).join('')
        || '<p class="tr-empty">Chưa có nhánh nguyên nhân nào — bấm một chip gợi ý bên dưới là xong.</p>'}
            ${goiY.length ? `<div class="tr-sugg"><span>Gợi ý nguyên nhân:</span>
                ${goiY.map(x => `<button type="button" class="tr-sugg-b" data-act="sugg" data-text="${esc(x)}">+ ${esc(x)}</button>`).join('')}</div>` : ''}
            ${goiRed.length ? `<div class="tr-sugg"><span>🚨 Cần loại trừ khẩn:</span>
                ${goiRed.map(x => `<button type="button" class="tr-sugg-b red" data-act="sugg-red" data-text="${esc(x)}">+ ${esc(x)}</button>`).join('')}</div>` : ''}
            ${v.redFlags.length ? `<div class="tr-tags">${tagsHtml(v.redFlags, vi, 'r', 'red')}</div>` : ''}
            ${goiCls.length ? `<div class="tr-sugg cls"><span>CLS hay dùng:</span>
                ${goiCls.map(x => `<button type="button" class="tr-sugg-b cls" data-act="sugg-cls" data-text="${esc(x)}">+ ${esc(x)}</button>`).join('')}</div>` : ''}
        </div>

        <div class="tr-branch last">
            <div class="tr-label"><i class="fas fa-notes-medical"></i> ④ Biến chứng cần bàn &amp; theo dõi
                <button type="button" class="tr-mini" data-act="add-bc"><i class="fas fa-plus"></i> Thêm biến chứng</button>
            </div>
            ${v.bienChung.map((b, bi) => bienChungHtml(b, vi, bi)).join('')
        || '<p class="tr-empty">Chưa ghi biến chứng nào.</p>'}
        </div>
    </div>`;
}

let mapMode = false;
let mapHits = [];

/** Vẽ lại sơ đồ khi đang ở chế độ xem bản đồ */
function refreshMap() {
    const cv = $('bl-map');
    if (!cv || !mapMode) return;
    const wrap = $('bl-map-wrap');
    const w = Math.max(760, wrap.clientWidth || 900);
    mapHits = drawMap(cv, getBienLuan().vanDe, { width: w }).hits;
}

/* Ô tìm mẫu nằm trong khối bị vẽ lại, nên phải nhớ chữ đang gõ ở ngoài */
let searchQ = '';

/* =====================================================================
   Vẽ lại cả khối là cách dựng đơn giản nhất, nhưng nó thay luôn ô đang gõ:
   con trỏ văng đi, và bộ gõ tiếng Việt mất luôn phần dấu đang dựng dở —
   chính là lỗi "không nhập được". Nên trước khi vẽ thì chụp lại xem con trỏ
   đang ở ô nào, vẽ xong đặt nó về đúng chỗ cũ.
   ===================================================================== */
function snapshotFocus() {
    const el = document.activeElement;
    if (!el || !host?.contains(el) || !('selectionStart' in el)) return null;
    const card = el.closest('[data-v]');
    const leaf = el.closest('.tr-leaf');
    return {
        id: el.id, v: card?.dataset.v, n: leaf?.dataset.n, b: leaf?.dataset.b,
        k: el.dataset.k, act: el.dataset.act, pos: el.selectionStart, val: el.value
    };
}

function restoreFocus(s) {
    if (!s) return;
    let el = null;
    if (s.id) el = host.querySelector('#' + s.id);
    else if (s.v != null) {
        const card = host.querySelector(`.tr-card[data-v="${s.v}"]`);
        const scope = s.n != null ? card?.querySelector(`.tr-leaf[data-n="${s.n}"]`)
            : s.b != null ? card?.querySelector(`.tr-leaf[data-b="${s.b}"]`) : card;
        el = s.k ? scope?.querySelector(`[data-k="${s.k}"]`)
            : s.act ? scope?.querySelector(`[data-act="${s.act}"]`) : null;
    }
    if (!el) return;
    el.focus({ preventScroll: true });
    try { el.setSelectionRange(s.pos, s.pos); } catch { }
}

function render() {
    if (!host) return;
    const keep = snapshotFocus();
    host.innerHTML = `<div class="tr-bar">
            <button type="button" class="bl-mini" data-add="sync"><i class="fas fa-wand-magic-sparkles"></i> Lấy vấn đề từ mục VIII</button>
            <button type="button" class="bl-mini" data-add="vanDe"><i class="fas fa-plus"></i> Thêm vấn đề</button>
            <input id="tr-search" class="tr-search" value="${esc(searchQ)}" placeholder="Tìm mẫu biện luận (ví dụ: khó thở, đau bụng, sốc…)" aria-label="Tìm mẫu biện luận">
            <span class="tr-hint">Điền 4 khối, máy sẽ chuyển thành đoạn văn biện luận.</span>
        </div>
        <div id="tr-search-res" class="tr-search-res"></div>`
        + (data.vanDe.length ? data.vanDe.map(vanDeHtml).join('')
            : `<p class="tr-empty big">Chưa có vấn đề nào — điền mục VIII rồi bấm “Lấy vấn đề từ mục VIII”.</p>`);
    restoreFocus(keep);
    refreshMap();
}

/* ---------- chuyển cây thành văn xuôi ---------- */
const joinList = (xs) => xs.map(trim).filter(Boolean).join('; ');

function nhomTheoMuc(v, lv) {
    return v.nguyenNhan.filter(n => fixLevel(n.muc) === lv);
}

/** Một câu "Bệnh X vì lý do, phân định bằng CLS" */
function cauNguyenNhan(n) {
    const ly = trim(n.lyDo) ? ` vì ${trim(n.lyDo)}` : '';
    const cls = trim(n.cls) ? `, phân định bằng ${trim(n.cls)}` : '';
    return `${trim(n.ten)}${ly}${cls}`;
}

export function buildProse() {
    const out = [];
    getBienLuan().vanDe.forEach((v, i) => {
        out.push(`${i + 1}. Vấn đề ${i + 1}: ${trim(v.ten) || '(chưa đặt tên)'}`);

        const cau = [];
        if (v.lamSang.length) cau.push(`Lâm sàng ghi nhận các dấu chứng ủng hộ gồm ${joinList(v.lamSang)}`);
        if (v.amTinh.length) cau.push(`các dấu chứng âm tính có giá trị gồm ${joinList(v.amTinh)}`);
        if (trim(v.yeuTo)) cau.push(`trên bệnh nhân có yếu tố nguy cơ ${trim(v.yeuTo)}`);
        if (cau.length) out.push(cau.join(', ') + '.');

        const nhieu = nhomTheoMuc(v, LEVELS[0]);
        const toi = nhomTheoMuc(v, LEVELS[1]);
        const it = nhomTheoMuc(v, LEVELS[2]);
        const tru = nhomTheoMuc(v, LEVELS[3]);
        if (nhieu.length || toi.length || it.length || tru.length || v.redFlags.length) {
            const ve = [];
            if (nhieu.length) ve.push(`Nghĩ nhiều nhất đến ${nhieu.map(cauNguyenNhan).join('; ')}`);
            if (toi.length) ve.push(`Cần phân biệt với ${toi.map(cauNguyenNhan).join('; ')}`);
            if (it.length) ve.push(`Ít nghĩ đến ${it.map(cauNguyenNhan).join('; ')}`);
            const truTen = [...tru.map(cauNguyenNhan), ...v.redFlags.map(trim)].filter(Boolean);
            if (truTen.length) ve.push(`Cần loại trừ bệnh cảnh cấp cứu ${truTen.join('; ')}`);
            out.push(`→ Về nguyên nhân: ${ve.join('. ')}.`);
        }

        if (v.bienChung.length) {
            out.push(`→ Về biến chứng: theo dõi ${v.bienChung
                .map(b => `${trim(b.ten)}${trim(b.lapLuan) ? ` (${trim(b.lapLuan)})` : ''}`).join('; ')}.`);
        }
        out.push('');
    });

    const { soBo, phanBiet } = derivedDiagnosis();
    if (soBo || phanBiet) {
        out.push('Tổng hợp các vấn đề trên:');
        if (soBo) out.push(`→ Nghĩ nhiều nhất đến ${soBo} (chẩn đoán sơ bộ).`);
        if (phanBiet) out.push(`→ Cần phân biệt với: ${phanBiet.split('\n').join('; ')}.`);
    }
    return out.join('\n').trim();
}

/* Mức nghĩ của nhánh quyết định luôn mục đích đề nghị cận lâm sàng — đó là mạch
   nối giữa mục X và mục XI: đề nghị cái gì cũng phải trả lời "để làm gì cho nhánh nào". */
const MUC_DICH_THEO_MUC = ['để chẩn đoán xác định', 'để chẩn đoán phân biệt',
    'để chẩn đoán phân biệt', 'để loại trừ'];

/**
 * Từng cận lâm sàng đã ghi trong cây biện luận, kèm nó phục vụ nhánh nào.
 * @returns {{ten:string, mucDich:string, dich:string, vanDe:string}[]}
 */
export function derivedClsDetail() {
    const out = [];
    getBienLuan().vanDe.forEach(v => v.nguyenNhan.forEach(n => {
        const li = LEVELS.indexOf(fixLevel(n.muc));
        trim(n.cls).split(/[;,]/).map(trim).filter(Boolean).forEach(ten => {
            if (out.some(x => x.ten.toLowerCase() === ten.toLowerCase())) return;
            out.push({ ten, mucDich: MUC_DICH_THEO_MUC[li] || 'để chẩn đoán phân biệt', dich: trim(n.ten), vanDe: trim(v.ten) });
        });
    }));
    return out;
}

/** Suy chẩn đoán sơ bộ / phân biệt từ mức độ nghĩ của các nhánh */
export function derivedDiagnosis() {
    const all = getBienLuan().vanDe.flatMap(v => v.nguyenNhan);
    const soBo = all.filter(n => fixLevel(n.muc) === LEVELS[0]).map(n => trim(n.ten));
    const phanBiet = all.filter(n => [LEVELS[1], LEVELS[2], LEVELS[3]].includes(fixLevel(n.muc)))
        .map(n => trim(n.ten) + (trim(n.lyDo) ? ` — ${trim(n.lyDo)}` : ''));
    return { soBo: [...new Set(soBo)].join('; '), phanBiet: [...new Set(phanBiet)].join('\n') };
}

/* ---------- khởi động ---------- */
/* Hoãn 600ms rồi mới vẽ lại — đủ để gõ hết một cụm chữ mà bộ gợi ý vẫn
   bám kịp theo tên vấn đề vừa nhập. */
let laterTimer;
function laterRender() {
    clearTimeout(laterTimer);
    laterTimer = setTimeout(render, 600);
}

export function initBienLuan(options) {
    onChangeCb = options?.onChange || (() => { });
    host = $('bl-host');
    if (!host) return;
    render();
    setupMapUi();

    const vd = (el) => data.vanDe[+el.closest('[data-v]').dataset.v];

    const onEdit = (e) => {
        const el = e.target;
        if (!el.dataset.k) return;
        const leaf = el.closest('.tr-leaf');
        const v = vd(el);
        if (!v) return;
        if (leaf && leaf.dataset.n !== undefined) {
            // Ô select hiện kèm emoji ("🔴 Nghĩ nhiều nhất") — cắt lấy phần chữ
            v.nguyenNhan[+leaf.dataset.n][el.dataset.k] =
                el.dataset.k === 'muc' ? fixLevel(el.value.replace(/^\S+\s/, '')) : el.value;
        }
        else if (leaf && leaf.dataset.b !== undefined) v.bienChung[+leaf.dataset.b][el.dataset.k] = el.value;
        else v[el.dataset.k] = el.value;
        onChangeCb();
        // Đổi mức nghĩ tới thì phải xếp lại tầng ngay; còn tên vấn đề thì đợi
        // gõ xong hẵng vẽ lại, vì vẽ lại giữa chừng là mất dấu tiếng Việt.
        if (el.dataset.k === 'muc') render();
        else if (el.dataset.k === 'ten' && !leaf) laterRender();
        else if (leaf) refreshMap();
    };
    host.addEventListener('input', onEdit);
    host.addEventListener('change', onEdit);

    /* Enter ở ô tên một nhánh nguyên nhân -> mở luôn nhánh trống kế tiếp,
       gõ liên tục được cả chuỗi chẩn đoán phân biệt mà không phải rê chuột. */
    host.addEventListener('keydown', (e) => {
        const el = e.target;
        if (e.key !== 'Enter' || e.isComposing || !el.classList?.contains('name')) return;
        const leaf = el.closest('.tr-leaf');
        if (!leaf || leaf.dataset.n === undefined) return;
        e.preventDefault();
        const v = data.vanDe[+leaf.closest('[data-v]').dataset.v];
        if (!trim(el.value)) return;
        v.nguyenNhan.push({ id: newId(), ten: '', muc: fixLevel(v.nguyenNhan[+leaf.dataset.n]?.muc), lyDo: '', cls: '' });
        render();
        onChangeCb();
        const rows = host.querySelectorAll(`.tr-card[data-v="${+leaf.closest('[data-v]').dataset.v}"] .tr-leaf .name`);
        rows[rows.length - 1]?.focus();
    });

    // Enter ở các ô "+ thêm…" -> gắn thành một nhánh lá
    const ENTER_TARGETS = { 'add-ls': 'lamSang', 'add-am': 'amTinh', 'add-red-in': 'redFlags' };
    host.addEventListener('keydown', (e) => {
        const key = ENTER_TARGETS[e.target.dataset.act];
        if (e.key !== 'Enter' || e.isComposing || !key) return;
        e.preventDefault();
        const text = trim(e.target.value);
        if (!text) return;
        const act = e.target.dataset.act;
        data.vanDe[+e.target.dataset.v][key].push(text);
        render();
        onChangeCb();
        host.querySelector(`[data-act="${act}"][data-v="${e.target.dataset.v}"]`)?.focus();
    });

    host.addEventListener('input', (e) => {
        if (e.target.id !== 'tr-search') return;
        searchQ = e.target.value;
        const box = $('tr-search-res');
        const found = searchLibrary(e.target.value);
        box.innerHTML = found.length
            ? found.map(x => `<button type="button" class="tr-found" data-tpl="${esc(x.k)}">
                <b>${esc(x.k)}</b><small>${esc(x.nn.slice(0, 3).join(' · '))}…</small></button>`).join('')
            : (trim(e.target.value) ? '<p class="tr-empty">Không tìm thấy mẫu phù hợp.</p>' : '');
    });

    host.addEventListener('click', (e) => {
        const tpl = e.target.closest('[data-tpl]');
        if (tpl) {
            const lib = searchLibrary(tpl.dataset.tpl)[0];
            if (lib) {
                data.vanDe.push(normalize({
                    ten: lib.k,
                    redFlags: (lib.red || []).slice(0, 3),
                    nguyenNhan: lib.nn.slice(0, 5).map((t, i) => ({
                        ten: t, muc: i === 0 ? LEVELS[0] : LEVELS[1], lyDo: '', cls: clsForCause(t)
                    }))
                }));
                render();
                onChangeCb();
            }
            return;
        }
        const add = e.target.closest('[data-add]');
        if (add) {
            if (add.dataset.add === 'sync') {
                if (!syncFromProblems()) options?.onNoProblems?.();
            } else {
                data.vanDe.push(normalize({ ten: '' }));
                render();
                onChangeCb();
                host.querySelector('.tr-card:last-of-type .tr-title')?.focus();
            }
            return;
        }
        const btn = e.target.closest('[data-act]');
        if (!btn || btn.tagName === 'INPUT') return;
        const box = btn.closest('[data-v]');
        const v = data.vanDe[+box.dataset.v];
        const act = btn.dataset.act;

        if (act === 'del-vd') data.vanDe.splice(+box.dataset.v, 1);
        else if (act === 'del-s') v.lamSang.splice(+btn.closest('.tr-tag').dataset.s, 1);
        else if (act === 'del-a') v.amTinh.splice(+btn.closest('.tr-tag').dataset.a, 1);
        else if (act === 'del-r') v.redFlags.splice(+btn.closest('.tr-tag').dataset.r, 1);
        else if (act === 'del-nn') v.nguyenNhan.splice(+btn.closest('.tr-leaf').dataset.n, 1);
        else if (act === 'del-bc') v.bienChung.splice(+btn.closest('.tr-leaf').dataset.b, 1);
        else if (act === 'harvest') {
            const have = new Set(v.lamSang.map(x => trim(x).toLowerCase()));
            const add = collectEvidence().filter(x => !have.has(x.toLowerCase()));
            v.lamSang.push(...add);
            options?.onHarvest?.(add.length);
        }
        else if (act === 'harvest-neg') {
            const have = new Set(v.amTinh.map(x => trim(x).toLowerCase()));
            const add = collectNegatives().filter(x => !have.has(x.toLowerCase()));
            v.amTinh.push(...add);
            options?.onHarvest?.(add.length);
        }
        else if (act === 'add-hall') { if (!v.lamSang.includes(btn.dataset.text)) v.lamSang.push(btn.dataset.text); }
        else if (act === 'add-nn') v.nguyenNhan.push({ id: newId(), ten: '', muc: LEVELS[1], lyDo: '', cls: '' });
        else if (act === 'add-bc') v.bienChung.push({ id: newId(), ten: '', lapLuan: '' });
        // Bấm chip nguyên nhân là kéo luôn bộ CLS phân định chuẩn của bệnh đó theo
        else if (act === 'sugg') v.nguyenNhan.push({
            id: newId(), ten: btn.dataset.text,
            muc: v.nguyenNhan.some(n => fixLevel(n.muc) === LEVELS[0]) ? LEVELS[1] : LEVELS[0],
            lyDo: '', cls: clsForCause(btn.dataset.text)
        });
        else if (act === 'sugg-red') v.nguyenNhan.push({
            id: newId(), ten: btn.dataset.text, muc: LEVELS[3], lyDo: '', cls: clsForCause(btn.dataset.text)
        });
        else if (act === 'sugg-cls') {
            const target = v.nguyenNhan.find(n => !trim(n.cls)) || v.nguyenNhan[0];
            if (!target) v.nguyenNhan.push({ id: newId(), ten: '', muc: LEVELS[1], lyDo: '', cls: btn.dataset.text });
            else target.cls = [trim(target.cls), btn.dataset.text].filter(Boolean).join('; ');
        }
        else if (act === 'dup-vd') data.vanDe.splice(+box.dataset.v + 1, 0, normalize({ ...v, id: null }));
        else if (act === 'up' && +box.dataset.v > 0) {
            const i = +box.dataset.v;
            [data.vanDe[i - 1], data.vanDe[i]] = [data.vanDe[i], data.vanDe[i - 1]];
        }
        else if (act === 'down' && +box.dataset.v < data.vanDe.length - 1) {
            const i = +box.dataset.v;
            [data.vanDe[i + 1], data.vanDe[i]] = [data.vanDe[i], data.vanDe[i + 1]];
        }
        else return;

        render();
        onChangeCb();
    });
}

/* ---------- chế độ xem sơ đồ ---------- */
function setupMapUi() {
    const seg = $('bl-mode');
    const wrap = $('bl-map-wrap');
    if (!seg || !wrap) return;

    seg.addEventListener('click', (e) => {
        const b = e.target.closest('[data-mode]');
        if (!b) return;
        mapMode = b.dataset.mode === 'map';
        seg.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
        wrap.classList.toggle('is-hidden', !mapMode);
        host.classList.toggle('is-hidden', mapMode);
        refreshMap();
    });

    // Bấm vào node trên sơ đồ -> quay về bảng, con trỏ nhảy đúng ô của node đó
    $('bl-map')?.addEventListener('click', (e) => {
        const cv = e.currentTarget;
        const r = cv.getBoundingClientRect();
        const sx = (e.clientX - r.left) * (cv.width / (window.devicePixelRatio || 1) / r.width);
        const sy = (e.clientY - r.top) * (cv.height / (window.devicePixelRatio || 1) / r.height);
        const hit = mapHits.find(h => sx >= h.x && sx <= h.x + h.w && sy >= h.y && sy <= h.y + h.h);
        if (!hit) return;
        seg.querySelector('[data-mode="table"]').click();
        const card = host.querySelector(`.tr-card[data-v="${hit.index}"]`);
        card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Node nguyên nhân thì nhảy thẳng vào ô tên nhánh, còn lại vào tên vấn đề
        const target = hit.nn != null
            ? card?.querySelector(`.tr-leaf[data-n="${hit.nn}"] .name`)
            : card?.querySelector('.tr-title');
        target?.focus();
    });

    $('bl-png')?.addEventListener('click', () => downloadMapPng(getBienLuan().vanDe));

    const ov = $('map-overlay');
    $('bl-zoom')?.addEventListener('click', () => {
        ov.classList.remove('hidden');
        drawMap($('map-overlay-canvas'), getBienLuan().vanDe, { width: 1400, scale: 2 });
    });
    $('map-overlay-close')?.addEventListener('click', () => ov.classList.add('hidden'));
    $('map-overlay-png')?.addEventListener('click', () => downloadMapPng(getBienLuan().vanDe));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') ov?.classList.add('hidden'); });
    window.addEventListener('resize', () => refreshMap());
}
