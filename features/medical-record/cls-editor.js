// cls-editor.js — trình nhập kết quả cận lâm sàng: phiếu có chỉ số + khoảng tham chiếu,
// tự đánh dấu bất thường, tự tính các chỉ số suy ra được, và đính kèm ảnh (chụp/dán/kéo thả).
//
// Ảnh nén ở máy rồi tải lên Firebase Storage; bệnh án chỉ giữ đường dẫn, không giữ base64
// (base64 sẽ làm phình localStorage và vượt giới hạn 1MB mỗi tài liệu Firestore).

import { PANELS, resolveRef, flagOf, refText, toNum, FLAG_MARK } from './cls-shared.js';
import { fold } from './tim-kiem.js';
import { showToast } from '../../core/utils.js';
import { storage } from '../../core/firebase-init.js';
import { authReady } from './record-store.js';
import { openPicker, coCamera } from './image-upload.js';
import {
    ref as storageRef, uploadBytes, getDownloadURL, deleteObject
} from 'https://www.gstatic.com/firebasejs/9.6.0/firebase-storage.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let cards = [];
let list, toolbar, opts = {};

export function getCls() {
    // Bỏ phiếu rỗng hoàn toàn để bệnh án không đầy phiếu trắng
    return cards.filter(c => (c.items || []).some(i => String(i.v ?? '').trim())
        || String(c.note || '').trim() || (c.images || []).length);
}

export function setCls(arr) {
    cards = Array.isArray(arr) ? JSON.parse(JSON.stringify(arr)) : [];
    render();
}

/* =====================================================================
   Chỉ số tự suy ra: nhập cái này thì máy điền cái kia
   ===================================================================== */
const find = (c, name) => (c.items || []).find(i => i.n.toLowerCase() === name.toLowerCase());
const val = (c, name) => toNum(find(c, name)?.v);

/** Đặt giá trị cho ô máy tự tính — không đè lên số bác sĩ tự gõ */
function setAuto(c, name, unit, value, ref) {
    let it = find(c, name);
    if (it && !it.auto && String(it.v ?? '').trim()) return;   // người dùng đã nhập tay
    if (!it) {
        if (!isFinite(value)) return;
        it = { n: name, v: '', u: unit, lo: ref?.[0] ?? null, hi: ref?.[1] ?? null, auto: true };
        c.items.push(it);
    }
    it.auto = true;
    it.v = isFinite(value) ? String(value) : '';
}

function recompute(c) {
    const age = toNum(opts.getAge?.());
    const gender = opts.getGender?.() || 'Nam';

    // eGFR theo CKD-EPI 2021 (creatinine µmol/L)
    const cr = val(c, 'Creatinine');
    if (isFinite(cr) && cr > 0 && isFinite(age) && age > 0) {
        const scr = cr / 88.4;                       // mg/dL
        const nu = gender === 'Nữ';
        const k = nu ? 0.7 : 0.9, a = nu ? -0.241 : -0.302;
        const egfr = 142 * Math.pow(Math.min(scr / k, 1), a) * Math.pow(Math.max(scr / k, 1), -1.2)
            * Math.pow(0.9938, age) * (nu ? 1.012 : 1);
        setAuto(c, 'eGFR', 'mL/ph/1.73m²', Math.round(egfr), [90, 99999]);
    }

    // Khoảng trống anion = Na - (Cl + HCO3)
    const na = val(c, 'Na+'), cl = val(c, 'Cl-'), hco3 = val(c, 'HCO3-');
    if ([na, cl, hco3].every(isFinite)) {
        setAuto(c, 'Anion gap', 'mmol/L', Math.round((na - cl - hco3) * 10) / 10, [8, 16]);
    }

    // Canxi hiệu chỉnh theo albumin
    const ca = val(c, 'Ca toàn phần'), alb = val(c, 'Albumin');
    if (isFinite(ca) && isFinite(alb)) {
        setAuto(c, 'Ca hiệu chỉnh', 'mmol/L', Math.round((ca + 0.02 * (40 - alb)) * 100) / 100, [2.15, 2.55]);
    }

    // LDL-C theo Friedewald (chỉ đúng khi triglyceride < 4.5 mmol/L)
    const chol = val(c, 'Cholesterol toàn phần'), tg = val(c, 'Triglyceride'), hdl = val(c, 'HDL-C');
    const ldl = find(c, 'LDL-C');
    if ([chol, tg, hdl].every(isFinite) && tg < 4.5 && (!ldl || ldl.auto || !String(ldl.v ?? '').trim())) {
        setAuto(c, 'LDL-C', 'mmol/L', Math.round((chol - hdl - tg / 2.2) * 100) / 100, [0, 3.4]);
    }
}

/* =====================================================================
   Vẽ giao diện
   ===================================================================== */
function itemRow(it, i, j) {
    const f = flagOf(it);
    const ref = refText(it.lo, it.hi);
    return `<div class="cls-row ${f ? 'is-' + f : ''}" data-i="${i}" data-j="${j}">
        <input class="cls-in cls-in-name" data-k="n" value="${esc(it.n)}" placeholder="Tên chỉ số" aria-label="Tên chỉ số">
        <input class="cls-in cls-in-val ${it.auto ? 'is-auto' : ''}" data-k="v" value="${esc(it.v)}" inputmode="decimal" placeholder="—" aria-label="Kết quả ${esc(it.n)}">
        <input class="cls-in cls-in-unit" data-k="u" value="${esc(it.u || '')}" placeholder="đơn vị" aria-label="Đơn vị">
        <span class="cls-ref">${esc(ref)}</span>
        <span class="cls-badge">${f ? FLAG_MARK[f] : ''}${it.auto ? '<i class="fas fa-calculator cls-auto-ico" title="Máy tự tính"></i>' : ''}</span>
        <button type="button" class="cls-x" data-act="del-item" title="Xóa chỉ số"><i class="fas fa-xmark"></i></button>
    </div>`;
}

function imgHtml(im, i, k) {
    return `<figure class="cls-thumb" data-i="${i}" data-k="${k}">
        ${im.pending
            ? `<div class="cls-thumb-img cls-thumb-load"><i class="fas fa-circle-notch fa-spin"></i></div>`
            : `<a href="${esc(im.url)}" target="_blank" rel="noopener"><img class="cls-thumb-img" src="${esc(im.url)}" alt="${esc(im.caption || 'Ảnh cận lâm sàng')}"></a>`}
        <input class="cls-cap" data-act="cap" value="${esc(im.caption || '')}" placeholder="Chú thích ảnh" aria-label="Chú thích ảnh">
        ${im.pending ? '' : `<button type="button" class="cls-thumb-x" data-act="del-img" title="Xóa ảnh"><i class="fas fa-trash"></i></button>`}
    </figure>`;
}

function cardHtml(c, i) {
    const rows = (c.items || []).map((it, j) => itemRow(it, i, j)).join('');
    const imgs = (c.images || []).map((im, k) => imgHtml(im, i, k)).join('');
    return `<div class="cls-c" data-i="${i}">
        <div class="cls-c-head">
            <i class="fas ${esc(c.icon || 'fa-file-medical')} cls-c-ico"></i>
            <input class="cls-c-name" data-k="name" value="${esc(c.name || '')}" placeholder="Tên phiếu cận lâm sàng">
            <input class="cls-c-dt" data-k="dt" type="datetime-local" value="${esc(c.dt || '')}" title="Ngày giờ có kết quả">
            <button type="button" class="cls-c-x" data-act="del-card" title="Xóa phiếu"><i class="fas fa-trash"></i></button>
        </div>
        ${rows ? `<div class="cls-rows">
            <div class="cls-row cls-row-h"><span>Chỉ số</span><span>Kết quả</span><span>Đơn vị</span><span>Tham chiếu</span><span></span><span></span></div>
            ${rows}</div>` : ''}
        <div class="cls-c-tools">
            <button type="button" class="cls-mini" data-act="add-item"><i class="fas fa-plus"></i> Thêm chỉ số</button>
            ${coCamera() ? '<button type="button" class="cls-mini is-cam" data-act="shoot-img"><i class="fas fa-camera-retro"></i> Chụp phiếu</button>' : ''}
            <button type="button" class="cls-mini" data-act="add-img"><i class="fas fa-image"></i> ${coCamera() ? 'Chọn ảnh' : 'Thêm ảnh'}</button>
            <span class="cls-hint"><i class="fas fa-paste"></i> Dán ảnh (Ctrl+V) hoặc kéo thả vào đây</span>
        </div>
        <textarea class="cls-note" data-k="note" rows="2" placeholder="Mô tả / Kết luận của phiếu (vd: Bóng tim to, chỉ số tim ngực 0,55 — Kết luận: tim to)">${esc(c.note || '')}</textarea>
        ${imgs ? `<div class="cls-thumbs">${imgs}</div>` : ''}
    </div>`;
}

function render() {
    if (!list) return;
    list.innerHTML = cards.length ? cards.map(cardHtml).join('')
        : `<div class="cls-empty">
            <i class="fas fa-vials"></i>
            <p>Chưa có phiếu cận lâm sàng nào.</p>
            <p class="cls-empty-sub">Chọn phiếu mẫu ở trên — máy sẽ tự kèm khoảng tham chiếu và đánh dấu chỉ số bất thường.</p>
        </div>`;
    list.querySelectorAll('textarea').forEach(autoGrow);
}

function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = Math.max(el.scrollHeight, 44) + 'px';
}

/** Vẽ lại một dòng chỉ số (đổi cờ bất thường) mà không mất con trỏ đang gõ */
function refreshCard(i) {
    const c = cards[i];
    const el = list.querySelector(`.cls-c[data-i="${i}"]`);
    if (!c || !el) return;
    (c.items || []).forEach((it, j) => {
        const row = el.querySelector(`.cls-row[data-j="${j}"]`);
        if (!row) return;
        const f = flagOf(it);
        row.classList.toggle('is-low', f === 'low');
        row.classList.toggle('is-high', f === 'high');
        row.querySelector('.cls-badge').innerHTML =
            (f ? FLAG_MARK[f] : '') + (it.auto ? '<i class="fas fa-calculator cls-auto-ico" title="Máy tự tính"></i>' : '');
        const vi = row.querySelector('.cls-in-val');
        if (vi && document.activeElement !== vi && vi.value !== String(it.v ?? '')) vi.value = it.v ?? '';
        vi?.classList.toggle('is-auto', !!it.auto);
    });
    // Chỉ số mới do máy tính ra (chưa có dòng) thì vẽ lại cả phiếu
    if (el.querySelectorAll('.cls-row:not(.cls-row-h)').length !== (c.items || []).length) {
        const focus = document.activeElement;
        const keep = focus?.closest?.('.cls-row');
        const j = keep?.dataset.j, k = focus?.dataset?.k;
        el.outerHTML = cardHtml(c, i);
        if (j == null) return;
        const back = list.querySelector(`.cls-c[data-i="${i}"] .cls-row[data-j="${j}"] [data-k="${k}"]`);
        if (!back) return;
        back.focus();
        back.setSelectionRange?.(back.value.length, back.value.length);   // giữ con trỏ ở cuối, khỏi nhảy về đầu
    }
}

/* =====================================================================
   Thêm phiếu
   ===================================================================== */
/** @param quiet  thêm hàng loạt: không vẽ lại / không nhảy tới từng phiếu
 *  @param tenRieng  đặt tên khác tên phiếu mẫu (dùng cho phiếu tự nhập) */
function addPanel(name, quiet = false, tenRieng = '') {
    const p = PANELS.find(x => x.name === name) || PANELS.at(-1);
    const gender = opts.getGender?.() || 'Nam';
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    cards.push({
        id: 'cls-' + Date.now().toString(36) + '-' + cards.length.toString(36),
        name: tenRieng || (p.name === 'Phiếu tự nhập' ? '' : p.name),
        g: p.g, icon: p.icon,
        dt: now.toISOString().slice(0, 16),
        items: p.items.map(([n, u, ref]) => {
            const [lo, hi] = resolveRef(ref, gender);
            return { n, v: '', u, lo, hi };
        }),
        note: '', images: []
    });
    if (quiet) return;
    render();
    changed();
    const el = list.querySelector(`.cls-c[data-i="${cards.length - 1}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el?.querySelector(p.items.length ? '.cls-in-val' : '.cls-note')?.focus();
}

/* =====================================================================
   Nối mục XI -> mục XII: đề nghị cận lâm sàng nào thì mở sẵn phiếu nhập đó
   ---------------------------------------------------------------------
   Trước đây hai mục trôi độc lập: biện luận đề nghị Troponin ở mục XI xong
   sang đây vẫn phải tự đi tìm "Men tim – suy tim" trong bảng chọn. Nay tên
   đề nghị được dò về phiếu mẫu tương ứng; dò không ra thì mở phiếu tự nhập
   mang đúng tên đã đề nghị, chứ không bỏ rơi dòng đó.
   ===================================================================== */
const PANEL_ALIAS = [
    [/cong thuc mau|huyet do|\bcbc\b|bach cau|tieu cau|hong cau|hemoglobin|\bhb\b/, 'Công thức máu'],
    [/dong mau|\bpt\b|\binr\b|aptt|d.?dimer|fibrinogen/, 'Đông máu toàn bộ'],
    [/mo mau|lipid|cholesterol|triglycerid|\bldl\b|\bhdl\b/, 'Bộ mỡ máu'],
    [/hba1c|duong huyet doi/, 'Đường huyết – HbA1c'],
    [/troponin|men tim|ck.?mb|\bck\b|probnp|\bbnp\b/, 'Men tim – suy tim'],
    [/khi mau|\bkmdm\b|lactat|toan kiem/, 'Khí máu động mạch'],
    [/tuyen giap|\btsh\b|\bft4\b|\bft3\b/, 'Chức năng tuyến giáp'],
    [/nuoc tieu|tptnt|\bptnt\b|cặn lang/, 'Tổng phân tích nước tiểu'],
    [/sinh hoa|\bure\b|creatinin|ion do|dien giai|\bast\b|\balt\b|men gan|bilirubin|albumin|\bcrp\b|glucose|duong huyet|natri|kali|\bnhu\b/, 'Sinh hóa máu cơ bản'],
    [/x.?quang nguc|x.?quang phoi|\bxq\b nguc|phim phoi/, 'X-quang ngực thẳng'],
    [/sieu am bung|sieu am o bung|\bsadb\b/, 'Siêu âm bụng tổng quát'],
    [/sieu am tim|doppler tim|echo tim|\bsat\b/, 'Siêu âm tim'],
    [/\bct\b|ct scan|cat lop|\bmsct\b|chup cat lop/, 'CT scan'],
    [/\bmri\b|cong huong tu/, 'MRI'],
    [/\becg\b|dien tam do|dien tim|\bekg\b/, 'ECG'],
    [/noi soi/, 'Nội soi tiêu hóa']
];

/** Tên đề nghị ở mục XI -> tên phiếu mẫu ('' nếu không có phiếu mẫu nào hợp) */
function panelFor(ten) {
    const s = fold(ten);
    const exact = PANELS.find(p => fold(p.name) === s);
    if (exact) return exact.name;
    return PANEL_ALIAS.find(([re]) => re.test(s))?.[1] || '';
}

function fromDeNghi() {
    const names = (opts.getProposed?.() || []).map(x => String(x || '').trim()).filter(Boolean);
    if (!names.length) {
        return showToast('Mục XI chưa có đề nghị cận lâm sàng nào — quay lại đó ghi trước.', 'warning');
    }
    let them = 0, boQua = 0;
    names.forEach(ten => {
        const panel = panelFor(ten);
        const nhan = panel || ten;
        if (cards.some(c => fold(c.name || '') === fold(nhan))) { boQua++; return; }
        addPanel(panel || 'Phiếu tự nhập', true, panel ? '' : ten);
        them++;
    });
    render();
    changed();
    showToast(them
        ? `Đã mở ${them} phiếu nhập theo đề nghị mục XI` + (boQua ? `, bỏ qua ${boQua} phiếu đã có.` : '.')
        : 'Các phiếu theo đề nghị mục XI đều đã có sẵn.', them ? 'success' : 'info');
}

/* =====================================================================
   Dán nguyên chuỗi kết quả từ máy xét nghiệm -> tự bóc tách vào phiếu
   ===================================================================== */
/** tên chỉ số (không dấu) -> { panel, n, u, ref } — dựng một lần từ PANELS */
const ITEM_MAP = (() => {
    const m = new Map();
    PANELS.forEach(p => p.items.forEach(([n, u, ref]) => {
        const k = fold(n);
        if (!m.has(k)) m.set(k, { panel: p.name, n, u, ref });
    }));
    // Tên tiếng Việt hay in trên phiếu giấy, quy về đúng chỉ số của phiếu mẫu
    [['bach cau', 'WBC'], ['so luong bach cau', 'WBC'], ['hong cau', 'RBC'], ['so luong hong cau', 'RBC'],
    ['tieu cau', 'PLT'], ['so luong tieu cau', 'PLT'], ['huyet sac to', 'HGB'], ['hemoglobin', 'HGB'],
    ['hb', 'HGB'], ['hematocrit', 'HCT'], ['dung tich hong cau', 'HCT'],
    ['bach cau da nhan trung tinh', 'NEU'], ['neutrophil', 'NEU'], ['lympho', 'LYM'], ['lymphocyte', 'LYM'],
    ['duong huyet', 'Glucose'], ['duong mau', 'Glucose'], ['creatinin', 'Creatinine'],
    ['natri', 'Na+'], ['na', 'Na+'], ['kali', 'K+'], ['k', 'K+'], ['clo', 'Cl-'], ['cl', 'Cl-'],
    ['ure mau', 'Ure'], ['bun', 'Ure'], ['bilirubin tp', 'Bilirubin toàn phần'],
    ['bilirubin tt', 'Bilirubin trực tiếp'], ['sgot', 'AST'], ['sgpt', 'ALT'],
    ['protein tp', 'Protein toàn phần'], ['calci', 'Ca toàn phần'], ['ca', 'Ca toàn phần'],
    ['cholesterol', 'Cholesterol toàn phần'], ['ldl', 'LDL-C'], ['hdl', 'HDL-C'],
    ['troponin t', 'Troponin T hs'], ['troponin i', 'Troponin T hs'], ['nt probnp', 'NT-proBNP'],
    ['paco2', 'PaCO2'], ['pao2', 'PaO2'], ['sao2', 'SaO2'], ['lactat', 'Lactate']
    // Ghi đè cả khi tên đó đã có trong bảng: phiếu nước tiểu cũng có dòng
    // "Bạch cầu", nhưng chuỗi dán kiểu "Bạch cầu 12.3" gần như luôn là WBC máu.
    ].forEach(([alias, name]) => {
        const src = m.get(fold(name));
        if (src) m.set(alias, src);
    });
    return m;
})();

/** "WBC: 14,5 K/uL" / "Bạch cầu 14.5" -> [{ panel, n, u, ref, v }] */
function parsePasted(text) {
    const out = [];
    String(text || '').split(/[\n;|]+/).forEach(line => {
        const m = String(line).match(/^\s*([^0-9:=]+?)\s*[:=]?\s+(-?[\d]+(?:[.,]\d+)?)\b/);
        if (!m) return;
        const hit = ITEM_MAP.get(fold(m[1]).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim());
        if (!hit || out.some(o => o.n === hit.n && o.panel === hit.panel)) return;
        out.push({ ...hit, v: m[2].replace(',', '.') });
    });
    return out;
}

function applyPasted(text) {
    const hits = parsePasted(text);
    if (!hits.length) {
        return showToast('Không bóc tách được chỉ số nào — mỗi dòng cần dạng "Tên  giá trị", vd "WBC 14,5".', 'warning');
    }
    const gender = opts.getGender?.() || 'Nam';
    hits.forEach(h => {
        let c = cards.find(x => fold(x.name || '') === fold(h.panel));
        if (!c) { addPanel(h.panel, true); c = cards.at(-1); }
        let it = (c.items || []).find(i => fold(i.n) === fold(h.n));
        if (!it) {
            const [lo, hi] = resolveRef(h.ref, gender);
            it = { n: h.n, v: '', u: h.u, lo, hi };
            c.items.push(it);
        }
        it.v = h.v;
        it.auto = false;
    });
    cards.forEach(recompute);
    render();
    changed();
    showToast(`Đã điền ${hits.length} chỉ số vào phiếu — đối chiếu lại với tờ kết quả gốc.`, 'success');
}

function buildToolbar() {
    const groups = [...new Set(PANELS.map(p => p.g))];
    toolbar.innerHTML = `
        <div class="cls-quick">
            ${['Công thức máu', 'Sinh hóa máu cơ bản', 'X-quang ngực thẳng', 'ECG', 'Tổng phân tích nước tiểu']
            .map(n => `<button type="button" class="cls-quick-b" data-panel="${esc(n)}"><i class="fas fa-plus"></i> ${esc(n)}</button>`).join('')}
        </div>
        <div class="cls-pick">
            <select id="cls-select" class="cls-select" aria-label="Chọn phiếu cận lâm sàng">
                ${groups.map(g => `<optgroup label="${esc(g)}">${PANELS.filter(p => p.g === g)
                    .map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('')}</optgroup>`).join('')}
            </select>
            <button type="button" class="cls-add" data-act="add-panel"><i class="fas fa-file-circle-plus"></i> Thêm phiếu</button>
        </div>
        <div class="cls-link">
            <button type="button" class="cls-add is-link" data-act="from-dn"><i class="fas fa-bolt"></i> Tạo phiếu theo đề nghị mục XI</button>
            <button type="button" class="cls-quick-b" data-act="paste-open"><i class="fas fa-paste"></i> Dán chuỗi kết quả</button>
        </div>
        <div class="cls-paste" hidden>
            <textarea class="cls-paste-in" rows="4" aria-label="Chuỗi kết quả cận lâm sàng"
                placeholder="Dán nguyên đoạn kết quả từ máy xét nghiệm — mỗi dòng một chỉ số, vd:&#10;WBC 14,5 K/uL&#10;NEU 86 %&#10;Creatinine 132 umol/L"></textarea>
            <div class="cls-pick">
                <button type="button" class="cls-add" data-act="paste-run"><i class="fas fa-wand-magic-sparkles"></i> Bóc tách vào phiếu</button>
                <span class="cls-hint">Chỉ số nào có trong phiếu mẫu thì máy điền thẳng, kèm khoảng tham chiếu và cờ bất thường.</span>
            </div>
        </div>`;

    toolbar.addEventListener('click', (e) => {
        const q = e.target.closest('[data-panel]');
        if (q) return addPanel(q.dataset.panel);
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'add-panel') return addPanel(toolbar.querySelector('#cls-select').value);
        if (act === 'from-dn') return fromDeNghi();
        if (act === 'paste-open') {
            const box = toolbar.querySelector('.cls-paste');
            box.hidden = !box.hidden;
            if (!box.hidden) box.querySelector('.cls-paste-in').focus();
            return;
        }
        if (act === 'paste-run') {
            const ta = toolbar.querySelector('.cls-paste-in');
            applyPasted(ta.value);
            ta.value = '';
        }
    });
}

/* =====================================================================
   Ảnh: nén ở máy rồi tải lên Storage
   ===================================================================== */
const MAX_SIDE = 1600;

async function compress(file) {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch { bmp = await createImageBitmap(file); }
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * scale);
    cv.height = Math.round(bmp.height * scale);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    bmp.close?.();
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.85));
    return blob || file;
}

async function addImages(i, files) {
    const pics = [...files].filter(f => f.type.startsWith('image/'));
    if (!pics.length) return;
    const uid = await authReady();
    if (!uid) {
        showToast('Đăng nhập để đính kèm ảnh — ảnh được lưu trên đám mây, không nằm trong bộ nhớ máy.', 'warning', 5000);
        return;
    }
    const c = cards[i];
    if (!c) return;

    for (const file of pics) {
        const slot = { pending: true, caption: '' };
        c.images.push(slot);
        render();
        try {
            const blob = await compress(file);
            const path = `medical_records/${uid}/${opts.recordId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
            await uploadBytes(storageRef(storage, path), blob, { contentType: 'image/jpeg' });
            slot.url = await getDownloadURL(storageRef(storage, path));
            slot.path = path;
            delete slot.pending;
            changed();
        } catch (err) {
            console.warn('[benh-an] tải ảnh lên lỗi:', err);
            c.images.splice(c.images.indexOf(slot), 1);
            showToast(err?.code === 'storage/unauthorized'
                ? 'Không có quyền tải ảnh lên (kiểm tra Storage Rules).'
                : 'Tải ảnh lên thất bại — kiểm tra mạng rồi thử lại.', 'error');
        }
        render();
    }
}

function pickFiles(i, capture = false) {
    openPicker({ capture, onFiles: (files) => addImages(i, files) });
}

/** Phiếu đang thao tác: nơi con trỏ đang đứng, không thì phiếu cuối */
function activeIndex() {
    const el = document.activeElement?.closest?.('.cls-c');
    if (el) return +el.dataset.i;
    return cards.length ? cards.length - 1 : -1;
}

/* =====================================================================
   Khởi động
   ===================================================================== */
let onChangeCb = () => { };
const changed = () => onChangeCb();

export function initCls(options) {
    opts = options;
    onChangeCb = options.onChange || (() => { });
    list = document.getElementById('cls-list');
    toolbar = document.getElementById('cls-toolbar');
    if (!list || !toolbar) return;

    buildToolbar();
    render();

    // Gõ vào ô nào thì cập nhật đúng ô đó trong dữ liệu
    list.addEventListener('input', (e) => {
        const el = e.target;
        const cardEl = el.closest('.cls-c');
        if (!cardEl) return;
        const i = +cardEl.dataset.i;
        const c = cards[i];
        if (!c) return;

        if (el.dataset.act === 'cap') {
            c.images[+el.closest('.cls-thumb').dataset.k].caption = el.value;
        } else if (el.closest('.cls-row')) {
            const j = +el.closest('.cls-row').dataset.j;
            const it = c.items[j];
            if (!it) return;
            it[el.dataset.k] = el.value;
            if (el.dataset.k === 'v') it.auto = false;   // gõ tay thì máy thôi ghi đè
            if (el.dataset.k === 'n') { it.lo = it.hi = null; }
            recompute(c);
            refreshCard(i);
        } else if (el.dataset.k) {
            c[el.dataset.k] = el.value;
            if (el.tagName === 'TEXTAREA') autoGrow(el);
        }
        changed();
    });

    list.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const cardEl = btn.closest('.cls-c');
        const i = +cardEl.dataset.i;
        const c = cards[i];
        const act = btn.dataset.act;

        if (act === 'del-card') {
            (c.images || []).forEach(im => im.path && deleteObject(storageRef(storage, im.path)).catch(() => { }));
            cards.splice(i, 1);
        } else if (act === 'del-item') {
            c.items.splice(+btn.closest('.cls-row').dataset.j, 1);
        } else if (act === 'add-item') {
            c.items.push({ n: '', v: '', u: '', lo: null, hi: null });
        } else if (act === 'add-img') {
            return pickFiles(i);
        } else if (act === 'shoot-img') {
            return pickFiles(i, true);
        } else if (act === 'del-img') {
            const k = +btn.closest('.cls-thumb').dataset.k;
            const im = c.images[k];
            if (im?.path) deleteObject(storageRef(storage, im.path)).catch(() => { });
            c.images.splice(k, 1);
        } else return;

        render();
        changed();
        if (act === 'add-item') {
            list.querySelector(`.cls-c[data-i="${i}"] .cls-row:last-of-type .cls-in-name`)?.focus();
        }
    });

    // Kéo thả ảnh vào phiếu
    list.addEventListener('dragover', (e) => {
        const cardEl = e.target.closest('.cls-c');
        if (!cardEl) return;
        e.preventDefault();
        cardEl.classList.add('is-drop');
    });
    list.addEventListener('dragleave', (e) => e.target.closest('.cls-c')?.classList.remove('is-drop'));
    list.addEventListener('drop', (e) => {
        const cardEl = e.target.closest('.cls-c');
        if (!cardEl) return;
        e.preventDefault();
        cardEl.classList.remove('is-drop');
        addImages(+cardEl.dataset.i, e.dataTransfer.files);
    });

    // Dán ảnh (Ctrl+V) khi đang ở tab Cận lâm sàng
    document.addEventListener('paste', (e) => {
        if (!document.getElementById('can-lam-sang')?.classList.contains('active')) return;
        const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
        if (!files.length) return;
        e.preventDefault();
        let i = activeIndex();
        if (i < 0) { addPanel('Phiếu tự nhập'); i = cards.length - 1; }
        addImages(i, files);
    });
}
