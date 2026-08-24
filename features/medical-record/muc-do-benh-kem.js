// muc-do-benh-kem.js — máy tự đề nghị mức độ / giai đoạn cho từng bệnh kèm,
// suy từ dữ kiện đã nhập trong bệnh án (huyết áp, BMI, HbA1c, eGFR, LDL, FEV1)
// và đọc danh sách bệnh nền từ ô tiền căn nội khoa.

import { getCls } from './cls-editor.js';
import { BMI_TAGS, BP_STAGES } from './chi-so-chuan.js';

const $ = (id) => document.getElementById(id);

/** Tìm một chỉ số trong các phiếu cận lâm sàng đã nhập */
function labValue(re) {
    for (const c of getCls()) {
        for (const i of (c.items || [])) {
            const v = parseFloat(String(i.v ?? '').replace(',', '.'));
            if (re.test(i.n || '') && !isNaN(v)) return v;
        }
    }
    return null;
}

/** Phân độ tăng huyết áp từ ô huyết áp đã đo (dùng lại bảng BP_STAGES) */
function bpStageName() {
    const m = String($('vital-bp')?.value || '').match(/(\d{2,3})\s*[\/\-]\s*(\d{2,3})/);
    if (!m) return '';
    const sys = +m[1], dia = +m[2];
    if (sys < 90 || dia < 60) return '';
    const stage = BP_STAGES.find(([sm, dm]) => sys < sm && dia < dm) || BP_STAGES.at(-1);
    return /^Tăng huyết áp/.test(stage[2]) ? stage[2].replace('Tăng huyết áp ', '') : '';
}

/** Máy đề nghị mức độ / giai đoạn cho một bệnh nền, chỉ khi đã có dữ kiện thật */
export function suggestStage(ten) {
    const t = String(ten || '').toLowerCase();
    if (!t) return '';

    if (/tăng huyết áp|^tha\b|cao huyết áp/.test(t)) {
        const d = bpStageName();
        return d ? `${d} (HA ${$('vital-bp').value.trim()})` : '';
    }
    if (/đái tháo đường|tiểu đường/.test(t)) {
        const a1c = labValue(/hba1c/i);
        if (a1c == null) return '';
        const vn = String(a1c).replace('.', ',');
        return a1c < 7 ? `kiểm soát đạt (HbA1c ${vn}%)` : `kiểm soát chưa đạt (HbA1c ${vn}%)`;
    }
    if (/thận mạn|suy thận/.test(t)) {
        const gfr = labValue(/egfr|lọc cầu thận|mlct/i);
        if (gfr == null) return '';
        const g = gfr >= 90 ? 'G1' : gfr >= 60 ? 'G2' : gfr >= 45 ? 'G3a'
            : gfr >= 30 ? 'G3b' : gfr >= 15 ? 'G4' : 'G5';
        return `giai đoạn ${g} (eGFR ${String(gfr).replace('.', ',')} ml/ph/1,73m²)`;
    }
    if (/béo phì|thừa cân|dinh dưỡng/.test(t)) {
        const bmi = parseFloat($('vital-bmi')?.value);
        if (isNaN(bmi)) return '';
        const hit = BMI_TAGS.find(([max]) => bmi < max);
        return `${hit[1].toLowerCase()} (BMI ${$('vital-bmi').value})`;
    }
    if (/lipid|mỡ máu/.test(t)) {
        const ldl = labValue(/ldl/i);
        return ldl == null ? '' : `LDL-C ${String(ldl).replace('.', ',')} mmol/L`;
    }
    if (/copd|phổi tắc nghẽn/.test(t)) {
        const fev = labValue(/fev1/i);
        if (fev == null) return '';
        const g = fev >= 80 ? 'GOLD 1' : fev >= 50 ? 'GOLD 2' : fev >= 30 ? 'GOLD 3' : 'GOLD 4';
        return `${g} (FEV1 ${String(fev).replace('.', ',')}%)`;
    }
    return '';
}

/** Bệnh nền đã ghi ở tiền căn nội khoa -> tên bệnh để chép sang mục bệnh kèm */
export function pastDiseases() {
    return String($('history-internal')?.value || '')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !/chưa ghi nhận|không ghi nhận/i.test(l))
        .map(l => l
            .replace(/^CNV\s*[^,:]*[,:]\s*/i, '')       // bỏ mốc "CNV 5 năm, "
            .split(/[,;(]/)[0]                            // bỏ phần điều trị phía sau
            .replace(/^(bệnh|mắc)\s+/i, '')
            .trim())
        .filter(t => t.length > 2 && t.length < 60);
}
