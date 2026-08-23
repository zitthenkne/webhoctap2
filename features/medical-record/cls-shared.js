// cls-shared.js — phiếu cận lâm sàng: bộ mẫu chỉ số + cách hiển thị.
// Dùng chung cho trang viết (tao-benh-an) và trang xem/in (xem-benh-an).
//
// Một phiếu lưu trong bệnh án ở record.canLamSang:
//   { id, name, g (nhóm), dt (ngày giờ), items:[{n,v,u,lo,hi}], note, images:[{url,path,caption}] }
// Khóa viết tắt cho nhẹ localStorage/Firestore: n=tên, v=giá trị, u=đơn vị, lo/hi=khoảng tham chiếu.

const NAM = 'Nam', NU = 'Nữ';

/* Khoảng tham chiếu: [thấp, cao] hoặc { Nam:[..], Nữ:[..] }.
   lo = 0 -> hiển thị "< cao"; hi = 99999 -> hiển thị "≥ thấp". */
export const PANELS = [
    {
        g: 'Huyết học', name: 'Công thức máu', icon: 'fa-droplet', items: [
            ['WBC', 'K/µL', [4, 10]],
            ['NEU', '%', [45, 75]],
            ['LYM', '%', [20, 40]],
            ['MONO', '%', [4, 8]],
            ['EOS', '%', [0, 7]],
            ['RBC', 'T/L', { [NAM]: [4.3, 5.8], [NU]: [3.9, 5.2] }],
            ['HGB', 'g/L', { [NAM]: [130, 170], [NU]: [120, 150] }],
            ['HCT', '%', { [NAM]: [40, 50], [NU]: [37, 47] }],
            ['MCV', 'fL', [80, 100]],
            ['MCH', 'pg', [27, 32]],
            ['MCHC', 'g/L', [320, 360]],
            ['PLT', 'K/µL', [150, 450]]
        ]
    },
    {
        g: 'Huyết học', name: 'Đông máu toàn bộ', icon: 'fa-droplet', items: [
            ['PT', 'giây', [11, 13.5]],
            ['PT', '%', [70, 140]],
            ['INR', '', [0.8, 1.2]],
            ['aPTT', 'giây', [25, 35]],
            ['Fibrinogen', 'g/L', [2, 4]],
            ['D-dimer', 'mg/L FEU', [0, 0.5]]
        ]
    },
    {
        g: 'Sinh hóa', name: 'Sinh hóa máu cơ bản', icon: 'fa-flask', items: [
            ['Glucose', 'mmol/L', [3.9, 6.4]],
            ['Ure', 'mmol/L', [2.5, 7.5]],
            ['Creatinine', 'µmol/L', { [NAM]: [62, 120], [NU]: [53, 100] }],
            ['eGFR', 'mL/ph/1.73m²', [90, 99999]],
            ['AST', 'U/L', [0, 40]],
            ['ALT', 'U/L', [0, 41]],
            ['GGT', 'U/L', [0, 60]],
            ['Bilirubin toàn phần', 'µmol/L', [3.4, 17.1]],
            ['Bilirubin trực tiếp', 'µmol/L', [0, 4.3]],
            ['Albumin', 'g/L', [35, 50]],
            ['Protein toàn phần', 'g/L', [65, 82]],
            ['Na+', 'mmol/L', [135, 145]],
            ['K+', 'mmol/L', [3.5, 5.1]],
            ['Cl-', 'mmol/L', [98, 107]],
            ['Ca toàn phần', 'mmol/L', [2.15, 2.55]],
            ['CRP', 'mg/L', [0, 5]]
        ]
    },
    {
        g: 'Sinh hóa', name: 'Bộ mỡ máu', icon: 'fa-flask', items: [
            ['Cholesterol toàn phần', 'mmol/L', [0, 5.2]],
            ['Triglyceride', 'mmol/L', [0, 1.7]],
            ['HDL-C', 'mmol/L', [1, 99999]],
            ['LDL-C', 'mmol/L', [0, 3.4]]
        ]
    },
    {
        g: 'Sinh hóa', name: 'Đường huyết – HbA1c', icon: 'fa-flask', items: [
            ['Glucose đói', 'mmol/L', [3.9, 5.5]],
            ['HbA1c', '%', [4, 5.6]]
        ]
    },
    {
        g: 'Sinh hóa', name: 'Men tim – suy tim', icon: 'fa-heart-pulse', items: [
            ['Troponin T hs', 'ng/L', [0, 14]],
            ['CK', 'U/L', [0, 190]],
            ['CK-MB', 'U/L', [0, 24]],
            ['NT-proBNP', 'pg/mL', [0, 125]]
        ]
    },
    {
        g: 'Sinh hóa', name: 'Khí máu động mạch', icon: 'fa-lungs', items: [
            ['pH', '', [7.35, 7.45]],
            ['PaCO2', 'mmHg', [35, 45]],
            ['PaO2', 'mmHg', [80, 100]],
            ['HCO3-', 'mmol/L', [22, 26]],
            ['BE', 'mmol/L', [-2, 2]],
            ['SaO2', '%', [95, 100]],
            ['Lactate', 'mmol/L', [0, 2]]
        ]
    },
    {
        g: 'Sinh hóa', name: 'Chức năng tuyến giáp', icon: 'fa-flask', items: [
            ['TSH', 'µIU/mL', [0.4, 4]],
            ['FT4', 'pmol/L', [12, 22]],
            ['FT3', 'pmol/L', [3.1, 6.8]]
        ]
    },
    {
        g: 'Nước tiểu', name: 'Tổng phân tích nước tiểu', icon: 'fa-vial', items: [
            ['Tỷ trọng', '', [1.005, 1.03]],
            ['pH', '', [4.6, 8]],
            ['Protein', '', null],
            ['Glucose', '', null],
            ['Ketone', '', null],
            ['Nitrite', '', null],
            ['Bạch cầu', '', null],
            ['Hồng cầu', '', null],
            ['Bilirubin', '', null]
        ]
    },
    { g: 'Chẩn đoán hình ảnh', name: 'X-quang ngực thẳng', icon: 'fa-x-ray', items: [] },
    { g: 'Chẩn đoán hình ảnh', name: 'Siêu âm bụng tổng quát', icon: 'fa-wave-square', items: [] },
    { g: 'Chẩn đoán hình ảnh', name: 'Siêu âm tim', icon: 'fa-heart-pulse', items: [] },
    { g: 'Chẩn đoán hình ảnh', name: 'CT scan', icon: 'fa-x-ray', items: [] },
    { g: 'Chẩn đoán hình ảnh', name: 'MRI', icon: 'fa-x-ray', items: [] },
    { g: 'Thăm dò chức năng', name: 'ECG', icon: 'fa-heart-pulse', items: [] },
    { g: 'Thăm dò chức năng', name: 'Nội soi tiêu hóa', icon: 'fa-magnifying-glass', items: [] },
    { g: 'Khác', name: 'Phiếu tự nhập', icon: 'fa-file-medical', items: [] }
];

export function resolveRef(ref, gender) {
    if (!ref) return [null, null];
    if (Array.isArray(ref)) return ref;
    return ref[gender] || ref[NAM] || [null, null];
}

export const toNum = (v) => parseFloat(String(v ?? '').replace(',', '.').replace(/[^0-9.+-]/g, ''));

/** '' (bình thường / không phải số) | 'low' | 'high' */
export function flagOf(it) {
    const v = toNum(it.v);
    if (isNaN(v)) return '';
    if (it.lo != null && v < it.lo) return 'low';
    if (it.hi != null && it.hi < 99999 && v > it.hi) return 'high';
    return '';
}

export function refText(lo, hi) {
    if (lo == null && hi == null) return '';
    if (hi != null && hi >= 99999) return '≥ ' + lo;
    if (hi != null && (lo == null || lo === 0)) return '< ' + hi;
    if (hi == null) return '≥ ' + lo;
    return `${lo} – ${hi}`;
}

export const clsIsEmpty = (c) =>
    !(c?.items || []).some(i => String(i.v ?? '').trim()) &&
    !String(c?.note ?? '').trim() && !(c?.images || []).length;

/** Các chỉ số bất thường của toàn bộ phiếu — dùng cho tóm tắt / đặt vấn đề tự động */
export function abnormalItems(list) {
    const out = [];
    (list || []).forEach(c => (c.items || []).forEach(i => {
        const f = flagOf(i);
        if (f) out.push({ ...i, flag: f, from: c.name });
    }));
    return out;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function fmtDt(v) {
    const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    if (!m) return '';
    return (m[4] ? `${m[4]}:${m[5]} ` : '') + `${m[3]}/${m[2]}/${m[1]}`;
}

/* ---------- hiển thị trên trang xem / in ---------- */

export const FLAG_MARK = { high: '↑', low: '↓' };

function cardHtml(c) {
    const rows = (c.items || []).filter(i => String(i.v ?? '').trim()).map(i => {
        const f = flagOf(i);
        const ref = refText(i.lo, i.hi);
        return `<tr class="${f ? 'cls-abn' : ''}">
            <td class="cls-n">${esc(i.n)}</td>
            <td class="cls-v"><b>${esc(i.v)}</b>${f ? ` <span class="cls-flag cls-${f}">${FLAG_MARK[f]}</span>` : ''}</td>
            <td class="cls-u">${esc(i.u || '')}</td>
            <td class="cls-r">${esc(ref)}</td>
        </tr>`;
    }).join('');

    const table = rows ? `<table class="cls-table">
        <thead><tr><th>Chỉ số</th><th>Kết quả</th><th>Đơn vị</th><th>Tham chiếu</th></tr></thead>
        <tbody>${rows}</tbody></table>` : '';

    const imgs = (c.images || []).filter(im => im.url).map(im => `<figure class="cls-fig">
        <img class="cls-img" src="${esc(im.url)}" alt="${esc(im.caption || c.name)}" loading="lazy">
        ${im.caption ? `<figcaption>${esc(im.caption)}</figcaption>` : ''}
    </figure>`).join('');

    const note = String(c.note || '').trim();
    return `<div class="cls-card">
        <div class="cls-head">
            <span class="cls-title">${esc(c.name || 'Phiếu cận lâm sàng')}</span>
            ${c.g ? `<span class="cls-group">${esc(c.g)}</span>` : ''}
            ${c.dt ? `<span class="cls-date">${esc(fmtDt(c.dt))}</span>` : ''}
        </div>
        ${table}
        ${note ? `<div class="cls-note">${esc(note)}</div>` : ''}
        ${imgs ? `<div class="cls-imgs">${imgs}</div>` : ''}
    </div>`;
}

export function clsToHtml(list) {
    const cards = (list || []).filter(c => !clsIsEmpty(c));
    return cards.length ? cards.map(cardHtml).join('') : '';
}

export function clsToText(list) {
    return (list || []).filter(c => !clsIsEmpty(c)).map(c => {
        const lines = [`* ${c.name || 'Phiếu cận lâm sàng'}${c.dt ? ' (' + fmtDt(c.dt) + ')' : ''}`];
        (c.items || []).filter(i => String(i.v ?? '').trim()).forEach(i => {
            const f = flagOf(i);
            const ref = refText(i.lo, i.hi);
            lines.push(`  - ${i.n}: ${i.v}${i.u ? ' ' + i.u : ''}${f ? ' ' + FLAG_MARK[f] : ''}${ref ? ` (TC: ${ref})` : ''}`);
        });
        if (String(c.note || '').trim()) lines.push('  ' + String(c.note).trim().replace(/\n/g, '\n  '));
        (c.images || []).forEach(im => im.url && lines.push(`  [Ảnh] ${im.caption || ''} ${im.url}`.trimEnd()));
        return lines.join('\n');
    }).join('\n');
}

/** Bảng + ảnh cho file Word (thẻ đơn giản để Word đọc được) */
export function clsToWordHtml(list) {
    return (list || []).filter(c => !clsIsEmpty(c)).map(c => {
        const rows = (c.items || []).filter(i => String(i.v ?? '').trim()).map(i => {
            const f = flagOf(i);
            return `<tr><td>${esc(i.n)}</td><td><b>${esc(i.v)}</b>${f ? ' ' + FLAG_MARK[f] : ''}</td>
                <td>${esc(i.u || '')}</td><td>${esc(refText(i.lo, i.hi))}</td></tr>`;
        }).join('');
        return `<p><b>${esc(c.name || 'Phiếu cận lâm sàng')}</b>${c.dt ? ' — ' + esc(fmtDt(c.dt)) : ''}</p>` +
            (rows ? `<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse">
                <tr><td><b>Chỉ số</b></td><td><b>Kết quả</b></td><td><b>Đơn vị</b></td><td><b>Tham chiếu</b></td></tr>
                ${rows}</table>` : '') +
            (String(c.note || '').trim() ? `<p>${esc(c.note).replace(/\n/g, '<br>')}</p>` : '') +
            (c.images || []).filter(im => im.url).map(im =>
                `<p><img src="${esc(im.url)}" width="440">${im.caption ? '<br><i>' + esc(im.caption) + '</i>' : ''}</p>`).join('');
    }).join('');
}
