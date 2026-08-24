// benh-su-editor.js — bệnh sử theo mốc thời gian, cho bệnh án học thuật.
//
// Cách kể bệnh sử chuẩn: mốc xa nhất trước, tiến dần tới ngày nhập viện, mỗi mốc
// mở đầu bằng "CNV <x> <đơn vị>". Triệu chứng đã có từ mốc trước thì phải nói rõ
// còn tương tự / thuyên giảm / nặng hơn và giảm-nặng như thế nào — chỗ hay bị bỏ sót.
//
// Mỗi mốc: { phase:'truoc'|'nv'|'sau', n, u, s, refs:[{sym, st, d}] }
// Máy ghép các mốc thành đoạn văn rồi ghi vào ô `illness-history` cũ, nên phần
// xuất file / trang xem không phải sửa gì.

import { openSymptomPicker } from './symptom-picker.js';
import { findSymptom } from './trieu-chung-data.js';
import { setChips } from './goi-y-nhap.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const UNITS = ['giờ', 'ngày', 'tuần', 'tháng'];
const UNIT_HOURS = { 'giờ': 1, 'ngày': 24, 'tuần': 168, 'tháng': 720 };
const STATES = ['tương tự', 'thuyên giảm', 'nặng hơn'];

/* Ô "Triệu chứng chính" là một khối HTML có sẵn; máy chuyển nguyên khối đó vào
   đúng mốc khởi phát nên mọi ID / phần lưu trữ giữ nguyên, khỏi phải nhân đôi ô. */
const MAIN_BOX = 'hx-main-box', MAIN_PARK = 'hx-main-park';
const mainSymName = () => ($('hx-sym-name')?.value || '').trim();

let steps = [];
let list, onChangeCb = () => { };

const isEmptyStep = (m) =>
    !(m.main && mainSymName()) &&
    !String(m.s || '').trim() && !(m.refs || []).some(r => String(r.sym || '').trim());

export function getSteps() {
    return sorted(steps).filter(m => !isEmptyStep(m));
}

export function setSteps(arr) {
    steps = (Array.isArray(arr) ? arr : []).map(migrate);
    render();
}

/* Bản cũ lưu { t, s } dạng chữ tự do — giữ lại nội dung, xếp vào nhóm "trước nhập viện" */
let seq = 0;
const newId = () => 'm' + (Date.now().toString(36)) + (++seq);

function migrate(m) {
    if (m && m.phase) return { ...JSON.parse(JSON.stringify(m)), id: m.id || newId() };
    const t = String(m?.t || '').trim();
    const num = t.match(/(\d+)\s*(giờ|ngày|tuần|tháng)/);
    return {
        phase: /sau/i.test(t) ? 'sau' : /ngày nhập viện|nhập viện$/i.test(t) && !num ? 'nv' : 'truoc',
        n: num ? num[1] : '', u: num ? num[2] : 'ngày',
        s: [t && !num ? t : '', m?.s || ''].filter(Boolean).join(': '),
        refs: [], id: newId()
    };
}

/** Xa nhất trước, tiến dần về ngày nhập viện rồi tới sau nhập viện */
function sorted(arr) {
    const rank = (m) => {
        const h = (parseFloat(m.n) || 0) * (UNIT_HOURS[m.u] || 24);
        if (m.phase === 'truoc') return -h;          // CNV 5 ngày = -120, CNV 1 ngày = -24
        if (m.phase === 'nv') return 0;
        return h + 0.001;                            // sau nhập viện
    };
    return arr.map((m, i) => [m, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(x => x[0]);
}

/** Tất cả triệu chứng đã xuất hiện ở các mốc trước mốc thứ i */
function symptomsBefore(i) {
    const names = new Set();
    const view = sorted(steps);
    const mainIdx = view.findIndex(m => m.main);
    const main = mainSymName();
    // Triệu chứng chính chỉ là "đã có từ trước" với các mốc SAU mốc khởi phát của nó
    if (main && mainIdx >= 0 && mainIdx < i) names.add(main);
    view.slice(0, i).forEach(m => {
        String(m.s || '').split(/[,;]/).map(x => x.trim()).filter(Boolean).forEach(x => names.add(x));
        (m.refs || []).forEach(r => r.sym && names.add(r.sym.trim()));
    });
    return [...names];
}

/** Triệu chứng cũ mà mốc này chưa nhắc tới — người đọc sẽ không biết còn hay hết */
function missingCarry(m, i) {
    const said = new Set([...(m.refs || []).map(r => trimText(r.sym)),
    ...String(m.s || '').split(/[,;]/).map(x => x.trim())].filter(Boolean).map(x => x.toLowerCase()));
    return symptomsBefore(i).filter(x => !said.has(x.toLowerCase()));
}

const trimText = (x) => String(x ?? '').trim();

/* Triệu chứng mới của một mốc vẫn lưu chung trong chuỗi `s` (ngăn bằng dấu ;)
   để không phải đổi cấu trúc bệnh án đã lưu, nhưng giao diện bày thành từng thẻ. */
const symParts = (m) => String(m.s || '').split(';').map(trimText).filter(Boolean);
const setSymParts = (m, arr) => { m.s = arr.join('; '); };

/** Nhãn mốc: "CNV 4 ngày" / "Ngày nhập viện" / "Sau nhập viện 2 ngày" */
export function stepLabel(m) {
    if (m.phase === 'nv') return 'Ngày nhập viện';
    const n = String(m.n || '').trim();
    if (m.phase === 'sau') return n ? `Sau nhập viện ${n} ${m.u}` : 'Sau nhập viện';
    return n ? `CNV ${n} ${m.u}` : 'CNV';
}

/** Triệu chứng chính chỉ neo vào đúng một mốc — mặc định mốc xa nhất (lúc khởi phát) */
function ensureMain(view) {
    const idx = view.findIndex(m => m.main);
    view.forEach((m, i) => { m.main = i === (idx < 0 ? 0 : idx); });
}

/** Ngày dương lịch của mốc, tính ngược từ ngày nhập viện — khỏi phải nhẩm trong đầu */
function stepDate(m) {
    const admit = $('admission-date')?.value;
    if (!admit) return '';
    const sign = m.phase === 'truoc' ? -1 : m.phase === 'sau' ? 1 : 0;
    if (sign && !String(m.n || '').trim()) return '';
    const d = new Date(admit + 'T00:00:00');
    d.setHours(d.getHours() + sign * (parseFloat(m.n) || 0) * (UNIT_HOURS[m.u] || 24));
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/* ---------- vẽ ---------- */

function refHtml(r, i, k) {
    const needDetail = (r.st === 'thuyên giảm' || r.st === 'nặng hơn') && !String(r.d || '').trim();
    return `<div class="hx-ref ${needDetail ? 'is-warn' : ''}" data-i="${i}" data-k="${k}">
        <input class="hx-sym" data-f="sym" list="hx-sym-list" value="${esc(r.sym || '')}" placeholder="Triệu chứng cũ" aria-label="Triệu chứng cũ">
        <button type="button" class="hx-refpick" data-act="pick-ref" title="Chọn từ thư viện triệu chứng"><i class="fas fa-magnifying-glass"></i></button>
        <select class="hx-st" data-f="st" aria-label="Diễn biến của triệu chứng">
            ${STATES.map(s => `<option ${r.st === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <input class="hx-d" data-f="d" value="${esc(r.d || '')}"
            placeholder="${r.st === 'tương tự' ? 'mô tả thêm (không bắt buộc)' : 'rõ là như thế nào? vd: sốt 39 lên 40°C, ho ra máu'}" aria-label="Mô tả rõ">
        <button type="button" class="hx-x" data-act="del-ref" title="Xóa dòng"><i class="fas fa-xmark"></i></button>
    </div>`;
}

function warnHtml(m) {
    const msgs = [];
    if (m.phase !== 'nv' && !String(m.n || '').trim()) msgs.push('chưa ghi cách nhập viện bao lâu');
    if (m.dup) msgs.push('trùng mốc thời gian với một mốc khác');
    if (m.beforeOnset) msgs.push('mốc này nằm trước cả ngày khởi phát bệnh — xem lại ngày khởi phát hoặc số ngày');
    return msgs.length
        ? `<p class="hx-warn"><i class="fas fa-triangle-exclamation"></i> ${esc(msgs.join(' · '))}</p>` : '';
}

function stepHtml(m, i) {
    return `<div class="hx-step${m.dup || m.beforeOnset ? ' is-warn' : ''}" data-i="${i}" data-id="${esc(m.id || '')}">
        <div class="hx-when">
            <select class="hx-phase" data-k="phase" aria-label="Mốc thời gian">
                <option value="truoc" ${m.phase === 'truoc' ? 'selected' : ''}>CNV (trước nhập viện)</option>
                <option value="nv" ${m.phase === 'nv' ? 'selected' : ''}>Ngày nhập viện</option>
                <option value="sau" ${m.phase === 'sau' ? 'selected' : ''}>Sau nhập viện</option>
            </select>
            ${m.phase === 'nv' ? '' : `
            <input class="hx-n" data-k="n" type="number" min="0" value="${esc(m.n || '')}" placeholder="số" aria-label="Số">
            <select class="hx-u" data-k="u" aria-label="Đơn vị">
                ${UNITS.map(u => `<option ${m.u === u ? 'selected' : ''}>${u}</option>`).join('')}
            </select>`}
            <span class="hx-label">${esc(stepLabel(m))}</span>
            ${(() => { const d = stepDate(m); return d ? `<span class="hx-date" title="Ngày dương lịch của mốc này">${esc(d)}</span>` : ''; })()}
            <button type="button" class="hx-pin${m.main ? ' is-on' : ''}" data-act="pin"
                title="Triệu chứng chính khởi phát ở mốc này"><i class="fas fa-star"></i></button>
            <button type="button" class="hx-x" data-act="del-step" title="Xóa mốc"><i class="fas fa-trash"></i></button>
        </div>
        ${warnHtml(m)}
        ${m.main ? '<div class="hx-main-slot"></div>' : ''}
        ${(() => {
            const miss = missingCarry(m, i);
            return miss.length ? `<p class="hx-carry"><i class="fas fa-rotate-left"></i>
                Ch\u01b0a nh\u1eafc l\u1ea1i: <b>${esc(miss.join(', '))}</b>
                <button type="button" class="hx-mini" data-act="carry">+ Th\u00eam t\u1ea5t c\u1ea3 (t\u01b0\u01a1ng t\u1ef1)</button></p>` : '';
        })()}
        <div class="hx-newbox">
            <div class="hx-newhead"><i class="fas fa-plus-circle"></i> Triệu chứng mới xuất hiện ở mốc này</div>
            <div class="hx-tags">${(() => {
                const ps = symParts(m);
                return ps.length ? ps.map((t, j) =>
                    `<span class="hx-tag">${esc(t)}<button type="button" data-act="del-new" data-j="${j}" aria-label="Bỏ"><i class="fas fa-xmark"></i></button></span>`
                ).join('') : '<span class="hx-newempty">Chưa có — bấm “Khai thác đủ ý” để mô tả cho chuẩn</span>';
            })()}</div>
            <div class="hx-new">
                <input class="hx-s" data-k="quick" value="" placeholder="Gõ nhanh rồi Enter" aria-label="Thêm nhanh triệu chứng">
                <button type="button" class="hx-pick" data-act="pick-sym" title="Chọn từ thư viện và khai thác đủ đặc điểm"><i class="fas fa-notes-medical"></i> Khai thác đủ ý</button>
            </div>
        </div>
        ${(m.refs || []).map((r, k) => refHtml(r, i, k)).join('')}
        <button type="button" class="hx-mini" data-act="add-ref"><i class="fas fa-plus"></i> Triệu chứng đã có từ trước</button>
    </div>`;
}

function symbolList() {
    const names = new Set();
    const main = ($('hx-sym-name')?.value || '').trim();
    if (main) names.add(main);
    steps.forEach(m => {
        String(m.s || '').split(/[,;]/).map(x => x.trim()).filter(Boolean).forEach(x => names.add(x));
        (m.refs || []).forEach(r => r.sym && names.add(r.sym.trim()));
    });
    return [...names].slice(0, 30);
}

/** Số giờ từ mốc tới lúc nhập viện (dương = trước nhập viện) */
function hoursBefore(m) {
    if (m.phase !== 'truoc') return 0;
    return (parseFloat(m.n) || 0) * (UNIT_HOURS[m.u] || 24);
}

/** Bệnh khởi phát cách nhập viện bao nhiêu giờ — để bắt mốc ghi ngược đời */
function onsetHours() {
    const onset = $('hx-onset-date')?.value;
    const admit = $('admission-date')?.value;
    if (!onset || !admit) return null;
    const h = (new Date(admit) - new Date(onset)) / 3600000;
    return h >= 0 ? h : null;
}

function flagLogic(view) {
    const onset = onsetHours();
    const seen = new Map();
    view.forEach(m => {
        const key = m.phase + '|' + (String(m.n || '').trim() || '?') + '|' + m.u;
        m.dup = m.phase === 'nv' ? seen.has('nv') : (String(m.n || '').trim() ? seen.has(key) : false);
        seen.set(m.phase === 'nv' ? 'nv' : key, true);
        // +12 giờ cho phép sai số nửa ngày, khỏi báo động vì làm tròn
        m.beforeOnset = onset != null && m.phase === 'truoc' && hoursBefore(m) > onset + 12;
    });
}

function render() {
    if (!list) return;
    const view = sorted(steps);
    flagLogic(view);
    ensureMain(view);
    steps = view;                        // giữ mảng đúng thứ tự hiển thị, khỏi lệch chỉ số
    // Gỡ khối "Triệu chứng chính" về chỗ đậu trước khi xóa danh sách, kẻo mất luôn ô đang có dữ liệu
    const box = $(MAIN_BOX);
    if (box) $(MAIN_PARK)?.appendChild(box);
    list.innerHTML = view.length
        ? view.map(stepHtml).join('')
        : `<p class="hx-empty">Chưa có mốc nào — bấm “Thêm mốc” và kể từ xa tới gần: CNV 5 ngày → CNV 2 ngày → ngày nhập viện.</p>`;
    if (box) (list.querySelector('.hx-main-slot') || $(MAIN_PARK))?.appendChild(box);
    const dl = $('hx-sym-list');
    if (dl) dl.innerHTML = symbolList().map(n => `<option value="${esc(n)}">`).join('');
}

/** Vẽ lại danh sách mốc — dùng khi ngày nhập viện đổi (mốc phải hiện ngày mới) */
export const refreshSteps = () => render();

/* ---------- bộ câu hỏi của triệu chứng chính ---------- */
/* Sáu ô thuộc tính là sáu chỗ trống dùng chung: chọn "Sốt" thì chúng thành
   kiểu sốt / nhiệt độ / lạnh run…, chọn "Đau ngực" thì thành vị trí / tính chất / hướng lan…
   ID và chỗ lưu giữ nguyên, chỉ đổi nhãn – gợi ý – chip, nên bệnh án cũ vẫn đọc được. */
const SYM_SLOTS = ['hx-sym-site', 'hx-sym-char', 'hx-sym-severity',
    'hx-sym-time', 'hx-sym-factors', 'hx-sym-assoc'];
let symDefaults = null;   // nhãn + gợi ý gốc, để trả về khi triệu chứng không có trong thư viện

const slotLabel = (id) => $(id)?.closest('label')?.querySelector('.lb');

function rememberDefaults() {
    if (symDefaults) return;
    symDefaults = SYM_SLOTS.map(id => ({
        label: slotLabel(id)?.textContent || '', ph: $(id)?.placeholder || ''
    }));
}

/** Nhãn đang hiển thị của các ô thuộc tính — đoạn văn phải kể đúng tên đang thấy trên màn */
export const mainSymLabels = () => SYM_SLOTS.map(id => ({
    id, label: (slotLabel(id)?.textContent || '').trim(), on: !$(id)?.closest('label')?.hidden
}));

/** Số ô thuộc tính đang dùng — thang chấm "đủ ý" phải chấm theo số này, không phải luôn 6 */
export const mainSymSlotCount = () => mainSymLabels().filter(x => x.on).length;

/** Đổi bộ câu hỏi cho khớp triệu chứng chính vừa chọn */
export function syncMainSymFields() {
    rememberDefaults();
    const sym = findSymptom(mainSymName());
    SYM_SLOTS.forEach((id, i) => {
        const el = $(id), lb = slotLabel(id), wrap = el?.closest('label');
        if (!el || !lb || !wrap) return;
        const f = sym?.fields?.[i];
        wrap.hidden = !!sym && !f;
        lb.textContent = f ? f[1] : symDefaults[i].label;
        el.placeholder = f ? (f[3] || (f[2] ? 'vd ' + f[2][0] : '')) : symDefaults[i].ph;
        setChips(id, f ? (f[2] || []) : null);
    });
    const tag = $('hx-sym-tune');
    if (tag) {
        tag.hidden = !sym;
        tag.innerHTML = sym
            ? `<i class="fas fa-wand-magic-sparkles"></i> Đã đổi bộ câu hỏi cho đúng <b>${esc(sym.ten)}</b> — chạm vào ô là có sẵn lựa chọn.`
            : '';
    }
}

/* ---------- ngày khởi phát ---------- */
export function calcOnset() {
    const tag = $('hx-onset-tag');
    if (!tag) return;
    const onset = $('hx-onset-date')?.value;
    if (!onset) { tag.textContent = ''; return; }
    const day = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);
    const admit = $('admission-date')?.value;
    const now = String($('record-datetime')?.value || '').slice(0, 10);
    const parts = [];
    if (now) {
        const d = day(now, onset);
        if (d >= 0) parts.push(`Bệnh ngày thứ ${d + 1}`);
    }
    if (admit) {
        const d = day(admit, onset);
        if (d > 0) parts.push(`khởi phát cách nhập viện ${d} ngày`);
        else if (d === 0) parts.push('khởi phát ngay ngày nhập viện');
    }
    tag.textContent = parts.join(' · ');
}

/** Mốc nào đang thiếu mô tả cho triệu chứng giảm/nặng hơn */
export function missingDetails() {
    const out = [];
    getSteps().forEach(m => (m.refs || []).forEach(r => {
        if ((r.st === 'thuyên giảm' || r.st === 'nặng hơn') && !String(r.d || '').trim()) {
            out.push(`${stepLabel(m)}: ${r.sym || 'triệu chứng'} ${r.st}`);
        }
    }));
    return out;
}

/* ---------- ghép đoạn văn ---------- */
export function buildProse() {
    const v = (id) => ($(id)?.value || '').trim();
    const out = [];

    const who = v('hx-informant');
    if (who) {
        const rel = v('hx-relation');
        const trust = v('hx-reliability');
        const extra = [rel, trust && 'độ tin cậy ' + trust.toLowerCase()].filter(Boolean).join(', ');
        // Mẫu bệnh án mở đầu bằng câu này rồi mới kể diễn tiến
        out.push(who === 'Bệnh nhân'
            ? `Bệnh nhân (BN) là người khai bệnh${extra ? ' (' + extra + ')' : ''}:`
            : `Người khai bệnh: ${who}${extra ? ' (' + extra + ')' : ''}:`);
    }

    const tag = $('hx-onset-tag')?.textContent;
    if (tag) out.push(tag.charAt(0).toUpperCase() + tag.slice(1) + '.');

    const sym = mainSymLabels()
        .filter(x => x.on && v(x.id))
        .map(x => [x.label.toLowerCase(), v(x.id)]);
    const symName = v('hx-sym-name');
    const attrs = sym.map(([k, x]) => `${k}: ${x}`).join('; ');
    const symDesc = symName ? `${symName}${attrs ? ` (${attrs})` : ''}` : attrs;

    const timeline = getSteps();
    const mainStep = timeline.find(m => m.main);
    // Triệu chứng chính kể ngay tại mốc khởi phát; chỉ tách ra câu riêng khi chưa có mốc nào
    if (symDesc && !mainStep) out.push(`Triệu chứng chính: ${symDesc}.`);
    if (v('hx-sym-treated')) out.push(`Đã xử trí trước nhập viện: ${v('hx-sym-treated')}.`);

    if (timeline.length) {
        out.push('Diễn tiến:');
        timeline.forEach(m => {
            const refs = (m.refs || []).filter(r => String(r.sym || '').trim()).map(r =>
                `${r.sym} ${r.st || 'tương tự'}${String(r.d || '').trim() ? ` (${r.d.trim()})` : ''}`);
            const head = m === mainStep && symDesc ? `Triệu chứng chính: ${symDesc}` : '';
            const body = [head, String(m.s || '').trim(), ...refs].filter(Boolean).join('; ');
            out.push(`- ${stepLabel(m)}: ${body}${body.endsWith('.') ? '' : '.'}`);
        });
    }
    // Sản khoa: theo dõi thai kỳ là một phần của bệnh sử, không phải tiền căn
    const san = [
        v('ob-hx-visits'), v('ob-hx-where') && `tại ${v('ob-hx-where')}`,
        v('ob-hx-vat') && `uốn ván: ${v('ob-hx-vat')}`,
        v('ob-hx-us') && `siêu âm gần nhất: ${v('ob-hx-us')}`,
        v('ob-hx-tests') && `xét nghiệm: ${v('ob-hx-tests')}`,
        v('ob-hx-abnormal') && `bất thường trong thai kỳ: ${v('ob-hx-abnormal')}`
    ].filter(Boolean);
    if (san.length) out.push(`Theo dõi thai kỳ: ${san.join(', ')}.`);
    const gain = $('ob-gain-out')?.textContent || '';
    if (san.length && /^Tăng /.test(gain)) out.push(gain + '.');

    // Nhi khoa: ăn – tiểu – phân – dịch tễ là bốn ý bắt buộc hỏi
    const nhi = [
        v('ped-hx-who') && `người khai bệnh: ${v('ped-hx-who').toLowerCase()}`,
        v('ped-hx-feed') && `ăn – bú: ${v('ped-hx-feed')}`,
        v('ped-hx-urine'), v('ped-hx-stool') && `phân: ${v('ped-hx-stool')}`,
        v('ped-hx-epi') && `dịch tễ: ${v('ped-hx-epi')}`,
        v('ped-hx-treated') && `đã điều trị: ${v('ped-hx-treated')}`
    ].filter(Boolean);
    if (nhi.length) out.push(`${nhi.join('; ')}.`);
    const dehyd = $('ped-dehyd-out')?.textContent || '';
    if (nhi.length && /^Sụt /.test(dehyd)) out.push(dehyd + '.');

    if (v('hx-general')) out.push(`Trong quá trình bệnh: ${v('hx-general')}.`);
    if (v('hx-negatives')) out.push(`Bệnh nhân ${v('hx-negatives')}.`);
    const admV = [['Mạch', 'adm-pulse', 'lần/phút'], ['Huyết áp', 'adm-bp', 'mmHg'],
    ['Nhiệt độ', 'adm-temp', '°C'], ['Nhịp thở', 'adm-resp', 'lần/phút'],
    ['SpO2', 'adm-spo2', '%'], ['', 'adm-note', '']]
        .map(([l, id, u]) => v(id) && `${l ? l + ' ' : ''}${v(id)}${u ? ' ' + u : ''}`).filter(Boolean);
    if (admV.length) out.push(`Sinh hiệu lúc nhập viện: ${admV.join(', ')}.`);
    if (v('hx-admit-state')) out.push(`Tình trạng lúc nhập viện: ${v('hx-admit-state')}.`);
    if (v('hx-after-admit')) out.push(`Diễn tiến sau nhập viện đến lúc làm bệnh án: ${v('hx-after-admit')}.`);

    return out.join('\n');
}

/* ---------- khởi động ---------- */
export function initHistory(options) {
    onChangeCb = options.onChange || (() => { });
    list = $('hx-list');
    if (!list) return;
    render();

    const stepOf = (el) => steps[+el.closest('.hx-step').dataset.i];

    /** Vẽ lại theo thứ tự thời gian rồi trả con trỏ về ô vừa sửa */
    function reorder(id, key) {
        render();
        const back = list.querySelector(`.hx-step[data-id="${id}"] [data-k="${key}"]`);
        if (!back) return;
        back.focus();
        back.setSelectionRange?.(back.value.length, back.value.length);
    }

    const onEdit = (e) => {
        const el = e.target;
        if (el.closest('#' + MAIN_BOX)) return;   // ô triệu chứng chính do form chính lo
        if (!el.closest('.hx-step')) return;
        const m = stepOf(el);
        if (!m) return;
        const refEl = el.closest('.hx-ref');
        if (refEl) {
            m.refs[+refEl.dataset.k][el.dataset.f] = el.value;
            if (el.dataset.f === 'st') render();     // đổi trạng thái -> đổi lời nhắc + cảnh báo
            else refEl.classList.toggle('is-warn',
                (m.refs[+refEl.dataset.k].st !== 'tương tự') && !el.value.trim() && el.dataset.f === 'd');
        } else if (el.dataset.k === 'quick') {
            // Ô gõ nhanh không thuộc dữ liệu mốc — chỉ chốt khi Enter hoặc rời ô
            if (e.type === 'change') commitQuick(el, m);
            return;
        } else {
            m[el.dataset.k] = el.value;
            const timeKey = el.dataset.k === 'n' || el.dataset.k === 'u' || el.dataset.k === 'phase';
            if (timeKey) el.closest('.hx-when').querySelector('.hx-label').textContent = stepLabel(m);
            // Gõ tới đâu chỉ đổi nhãn; nhập xong (change / rời ô) mới xếp lại thứ tự
            if (timeKey && (e.type === 'change' || el.dataset.k === 'phase')) reorder(m.id, el.dataset.k);
        }
        onChangeCb();
    };
    list.addEventListener('input', onEdit);
    list.addEventListener('change', onEdit);

    /** Chốt nội dung ô gõ nhanh thành một thẻ triệu chứng mới */
    function commitQuick(el, m) {
        const t = el.value.trim();
        el.value = '';
        if (!t) return;
        setSymParts(m, [...symParts(m), t]);
        const id = m.id;
        render();
        onChangeCb();
        list.querySelector(`.hx-step[data-id="${id}"] [data-k="quick"]`)?.focus();
    }

    // Enter ở ô gõ nhanh = thêm thẻ, không để form hiểu nhầm là nhảy ô kế
    list.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.target.dataset.k !== 'quick' || e.isComposing) return;
        e.preventDefault();
        e.stopPropagation();
        const m = stepOf(e.target);
        if (m) commitQuick(e.target, m);
    });

    list.addEventListener('click', (e) => {
        if (e.target.closest('#' + MAIN_BOX)) return;
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const stepEl = btn.closest('.hx-step');
        const i = +stepEl.dataset.i;
        if (btn.dataset.act === 'pin') steps.forEach((m, k) => { m.main = k === i; });
        else if (btn.dataset.act === 'del-step') steps.splice(i, 1);
        else if (btn.dataset.act === 'del-ref') steps[i].refs.splice(+btn.closest('.hx-ref').dataset.k, 1);
        else if (btn.dataset.act === 'add-ref') (steps[i].refs ||= []).push({ sym: '', st: 'tương tự', d: '' });
        else if (btn.dataset.act === 'del-new') {
            const ps = symParts(steps[i]);
            ps.splice(+btn.dataset.j, 1);
            setSymParts(steps[i], ps);
        }
        else if (btn.dataset.act === 'pick-ref') {
            const k = +btn.closest('.hx-ref').dataset.k;
            openSymptomPicker({
                title: 'Triệu chứng đã có từ trước',
                initial: steps[i].refs[k]?.sym || '',
                onPick: (text, ten) => {
                    // Ô này chỉ cần tên triệu chứng; phần mô tả để ở ô "rõ là như thế nào"
                    steps[i].refs[k].sym = ten || text;
                    render();
                    onChangeCb();
                }
            });
            return;
        }
        else if (btn.dataset.act === 'pick-sym') {
            openSymptomPicker({
                title: 'Triệu chứng mới ở ' + stepLabel(steps[i]),
                onPick: (text) => {
                    setSymParts(steps[i], [...symParts(steps[i]), text]);
                    render();
                    onChangeCb();
                }
            });
            return;
        }
        else if (btn.dataset.act === 'carry') {
            (steps[i].refs ||= []).push(...missingCarry(steps[i], i).map(sym => ({ sym, st: 'tương tự', d: '' })));
        }
        else return;
        render();
        onChangeCb();
        if (btn.dataset.act === 'add-ref') {
            list.querySelector(`.hx-step[data-i="${i}"] .hx-ref:last-of-type .hx-sym`)?.focus();
        }
    });

    $('hx-add')?.addEventListener('click', () => {
        // Mốc đầu tiên lấy luôn khoảng cách khởi phát -> nhập viện; các mốc sau tiến dần
        // về ngày nhập viện, đúng mạch kể bệnh từ xa tới gần.
        const truoc = steps.filter(m => m.phase === 'truoc');
        const last = truoc.at(-1);
        const onset = onsetHours();
        let n = '';
        if (!truoc.length && onset != null) n = String(Math.round(onset / 24));
        else if (last && parseFloat(last.n) > 1) n = String(parseFloat(last.n) - 1);
        const carried = symptomsBefore(steps.length).map(sym => ({ sym, st: 'tương tự', d: '' }));
        steps.push({ id: 'm' + Date.now().toString(36), phase: 'truoc', n, u: last?.u || 'ngày', s: '', refs: carried });
        render();
        onChangeCb();
        list.querySelector('.hx-step:last-of-type .hx-n')?.focus();
    });
}
