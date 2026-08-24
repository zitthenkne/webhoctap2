// auto-grade.js — tự chấm mức độ / phân độ từ những gì đã ghi trong bệnh án.
//
// Đọc sinh hiệu, Glasgow, cân nặng và các chỉ số cận lâm sàng đã nhập, rồi trả về
// danh sách đánh giá: sốc mất máu, suy hô hấp, thiếu máu, giảm tiểu cầu, suy thận,
// rối loạn điện giải, mức độ sốt, mức độ đau… Thiếu dữ liệu thì nói rõ thiếu gì.

const num = (v) => {
    const n = parseFloat(String(v ?? '').replace(',', '.').replace(/[^0-9.+-]/g, ''));
    return isNaN(n) ? null : n;
};

const LV = { ok: 'ok', nhe: 'nhe', vua: 'vua', nang: 'nang' };

/** Tách huyết áp "120/80" thành [tâm thu, tâm trương] */
export function parseBp(v) {
    const m = String(v || '').match(/(\d{2,3})\s*[\/\-]\s*(\d{2,3})/);
    return m ? [+m[1], +m[2]] : [null, null];
}

/**
 * ctx: { pulse, bp, temp, resp, spo2, weight, gcs, gender, age, labs: {tên: giá trị}, painText }
 * Trả về [{ ten, ketQua, muc, dua, thieu }]
 */
export function gradeAll(ctx = {}) {
    const out = [];
    const L = ctx.labs || {};
    const [sys, dia] = parseBp(ctx.bp);
    const pulse = num(ctx.pulse), resp = num(ctx.resp), spo2 = num(ctx.spo2), temp = num(ctx.temp);
    const gcs = num(ctx.gcs);
    const nu = /nữ/i.test(ctx.gender || '');

    const add = (ten, ketQua, muc, dua, thieu) => out.push({ ten, ketQua, muc, dua, thieu });

    /* ---------- Sốc mất máu theo ATLS ---------- */
    (() => {
        const thieu = [];
        if (pulse == null) thieu.push('mạch');
        if (sys == null) thieu.push('huyết áp');
        if (resp == null) thieu.push('nhịp thở');
        if (pulse == null || sys == null) {
            return add('Sốc mất máu (ATLS)', 'Chưa đủ dữ liệu', null, '', thieu.join(', '));
        }
        let cls = 1, mat = '< 15% (< 750 mL)';
        if (pulse >= 140 || sys < 70 || (gcs != null && gcs <= 13 && sys < 90)) { cls = 4; mat = '> 40% (> 2000 mL)'; }
        else if (sys < 90 || pulse >= 120) { cls = 3; mat = '30 – 40% (1500 – 2000 mL)'; }
        else if (pulse >= 100 || (resp != null && resp > 20)) { cls = 2; mat = '15 – 30% (750 – 1500 mL)'; }
        const dua = [`mạch ${pulse}`, `HA ${sys}/${dia ?? '?'}`, resp != null && `nhịp thở ${resp}`,
        gcs != null && `GCS ${gcs}`].filter(Boolean).join(' · ');
        add('Sốc mất máu (ATLS)',
            cls === 1 ? 'Độ I — chưa mất bù' : `Độ ${'I'.repeat(cls).replace('IIII', 'IV')} — ước lượng mất ${mat}`,
            cls >= 3 ? LV.nang : cls === 2 ? LV.vua : LV.nhe, dua, thieu.join(', '));
    })();

    /* ---------- Huyết áp trung bình – tưới máu ---------- */
    if (sys != null && dia != null) {
        const map = Math.round((sys + 2 * dia) / 3);
        add('Huyết áp trung bình', `${map} mmHg${map < 65 ? ' — tưới máu mô không đủ' : ''}`,
            map < 65 ? LV.nang : LV.ok, `HA ${sys}/${dia}`);
        // phân độ tăng huyết áp
        if (sys >= 140 || dia >= 90) {
            const do_ = (sys >= 180 || dia >= 110) ? 3 : (sys >= 160 || dia >= 100) ? 2 : 1;
            add('Tăng huyết áp', `Độ ${do_}`, do_ >= 3 ? LV.nang : do_ === 2 ? LV.vua : LV.nhe, `HA ${sys}/${dia}`);
        }
    }

    /* ---------- Suy hô hấp ---------- */
    (() => {
        const pao2 = num(L['PaO2']), fio2 = num(L['FiO2']);
        if (pao2 != null) {
            const pf = fio2 ? pao2 / (fio2 / 100) : pao2 / 21 * 100 / 100 * 4.76;  // khí trời ≈ FiO2 21%
            const val = fio2 ? Math.round(pf) : Math.round(pao2 / 0.21);
            add('Tỷ lệ P/F', `${val}${val < 100 ? ' — ARDS nặng' : val < 200 ? ' — ARDS trung bình' : val < 300 ? ' — ARDS nhẹ' : ''}`,
                val < 200 ? LV.nang : val < 300 ? LV.vua : LV.ok, `PaO2 ${pao2}${fio2 ? `, FiO2 ${fio2}%` : ', khí trời'}`);
        }
        if (spo2 != null) {
            add('Oxy hóa máu (SpO2)',
                spo2 < 90 ? 'Giảm oxy máu nặng' : spo2 < 94 ? 'Giảm oxy máu' : 'Trong giới hạn',
                spo2 < 90 ? LV.nang : spo2 < 94 ? LV.vua : LV.ok, `SpO2 ${spo2}%`);
        }
        if (resp != null && resp >= 25) {
            add('Nhịp thở', resp >= 30 ? 'Thở nhanh nhiều' : 'Thở nhanh', resp >= 30 ? LV.nang : LV.vua, `nhịp thở ${resp} l/p`);
        }
    })();

    /* ---------- Sốt ---------- */
    if (temp != null && temp >= 37.5) {
        add('Mức độ sốt',
            temp >= 41 ? 'Sốt rất cao (≥ 41°C)' : temp >= 39 ? 'Sốt cao' : temp >= 38 ? 'Sốt vừa' : 'Sốt nhẹ',
            temp >= 39 ? LV.nang : temp >= 38 ? LV.vua : LV.nhe, `nhiệt độ ${temp}°C`);
    }

    /* ---------- Tri giác ---------- */
    if (gcs != null) {
        add('Rối loạn tri giác (Glasgow)',
            gcs <= 8 ? `GCS ${gcs} — hôn mê, cân nhắc bảo vệ đường thở` : gcs <= 12 ? `GCS ${gcs} — trung bình` : `GCS ${gcs} — nhẹ`,
            gcs <= 8 ? LV.nang : gcs <= 12 ? LV.vua : LV.ok, `E-V-M đã chọn`);
    }

    /* ---------- Thiếu máu theo HGB ---------- */
    (() => {
        let hgb = num(L['HGB']);
        if (hgb == null) return;
        if (hgb < 25) hgb = hgb * 10;                       // ghi theo g/dL thì đổi sang g/L
        const nguong = nu ? 120 : 130;
        if (hgb >= nguong) return add('Thiếu máu', 'Không thiếu máu', LV.ok, `HGB ${hgb} g/L`);
        add('Thiếu máu',
            hgb < 60 ? 'Rất nặng — cân nhắc truyền máu' : hgb < 80 ? 'Nặng' : hgb < 100 ? 'Trung bình' : 'Nhẹ',
            hgb < 80 ? LV.nang : hgb < 100 ? LV.vua : LV.nhe, `HGB ${hgb} g/L (nữ < 120, nam < 130)`);
    })();

    /* ---------- Giảm tiểu cầu ---------- */
    (() => {
        const plt = num(L['PLT']);
        if (plt == null || plt >= 150) return;
        add('Giảm tiểu cầu',
            plt < 20 ? 'Nặng — nguy cơ xuất huyết tự nhiên' : plt < 50 ? 'Trung bình' : 'Nhẹ',
            plt < 20 ? LV.nang : plt < 50 ? LV.vua : LV.nhe, `PLT ${plt} K/µL`);
    })();

    /* ---------- Bạch cầu ---------- */
    (() => {
        const wbc = num(L['WBC']);
        if (wbc == null) return;
        if (wbc > 100) add('Tăng bạch cầu', 'Rất cao — nguy cơ ứ trệ bạch cầu', LV.nang, `WBC ${wbc} K/µL`);
        else if (wbc < 1) add('Giảm bạch cầu', 'Nặng — nguy cơ nhiễm trùng cơ hội', LV.nang, `WBC ${wbc} K/µL`);
        else if (wbc < 4) add('Giảm bạch cầu', 'Nhẹ – trung bình', LV.vua, `WBC ${wbc} K/µL`);
    })();

    /* ---------- Chức năng thận theo eGFR (KDIGO) ---------- */
    (() => {
        const e = num(L['eGFR']);
        if (e == null) return;
        const g = e >= 90 ? 'G1 — bình thường' : e >= 60 ? 'G2 — giảm nhẹ' : e >= 45 ? 'G3a — giảm nhẹ đến vừa'
            : e >= 30 ? 'G3b — giảm vừa đến nặng' : e >= 15 ? 'G4 — giảm nặng' : 'G5 — suy thận, cân nhắc lọc máu';
        add('Chức năng thận (KDIGO)', g, e < 30 ? LV.nang : e < 60 ? LV.vua : LV.ok, `eGFR ${e} mL/ph/1,73m²`);
    })();

    /* ---------- Điện giải ---------- */
    (() => {
        const na = num(L['Na+']), k = num(L['K+']);
        if (na != null && (na < 135 || na > 145)) {
            add('Rối loạn natri máu',
                na < 125 ? 'Hạ natri nặng — nguy cơ phù não' : na < 130 ? 'Hạ natri trung bình'
                    : na < 135 ? 'Hạ natri nhẹ' : na > 155 ? 'Tăng natri nặng' : 'Tăng natri nhẹ',
                (na < 125 || na > 155) ? LV.nang : LV.vua, `Na+ ${na} mmol/L`);
        }
        if (k != null && (k < 3.5 || k > 5.1)) {
            add('Rối loạn kali máu',
                k >= 6.5 ? 'Tăng kali nặng — nguy cơ rối loạn nhịp, xử trí ngay'
                    : k > 5.1 ? 'Tăng kali' : k < 2.5 ? 'Hạ kali nặng' : 'Hạ kali',
                (k >= 6.5 || k < 2.5) ? LV.nang : LV.vua, `K+ ${k} mmol/L`);
        }
    })();

    /* ---------- Toan – kiềm, lactat ---------- */
    (() => {
        const ph = num(L['pH']), lac = num(L['Lactate']);
        if (ph != null && (ph < 7.35 || ph > 7.45)) {
            add('Rối loạn toan – kiềm',
                ph < 7.2 ? 'Toan máu nặng' : ph < 7.35 ? 'Toan máu' : ph > 7.55 ? 'Kiềm máu nặng' : 'Kiềm máu',
                (ph < 7.2 || ph > 7.55) ? LV.nang : LV.vua, `pH ${ph}`);
        }
        if (lac != null && lac >= 2) {
            add('Lactat máu', lac >= 4 ? 'Tăng cao — gợi ý giảm tưới máu mô nặng' : 'Tăng nhẹ',
                lac >= 4 ? LV.nang : LV.vua, `lactat ${lac} mmol/L`);
        }
    })();

    /* ---------- Đường huyết ---------- */
    (() => {
        const glu = num(L['Glucose']) ?? num(L['Glucose đói']);
        if (glu == null) return;
        if (glu < 3.9) add('Đường huyết', glu < 2.8 ? 'Hạ đường huyết nặng' : 'Hạ đường huyết', glu < 2.8 ? LV.nang : LV.vua, `glucose ${glu} mmol/L`);
        else if (glu >= 11.1) add('Đường huyết', 'Tăng đường huyết đáng kể', LV.vua, `glucose ${glu} mmol/L`);
        const a1c = num(L['HbA1c']);
        if (a1c != null && a1c >= 6.5) add('Kiểm soát đường huyết', `HbA1c ${a1c}% — chưa đạt mục tiêu`, a1c >= 9 ? LV.nang : LV.vua, `HbA1c ${a1c}%`);
    })();

    /* ---------- Men gan – bilirubin ---------- */
    (() => {
        const ast = num(L['AST']), alt = num(L['ALT']), bil = num(L['Bilirubin toàn phần']);
        const men = Math.max(ast ?? 0, alt ?? 0);
        if (men > 40) {
            const lan = Math.round(men / 40 * 10) / 10;
            add('Tăng men gan', `Gấp khoảng ${lan} lần giới hạn trên`, men > 400 ? LV.nang : men > 120 ? LV.vua : LV.nhe,
                `AST ${ast ?? '—'} / ALT ${alt ?? '—'} U/L`);
        }
        if (bil != null && bil > 17.1) {
            add('Tăng bilirubin', bil > 85 ? 'Vàng da rõ trên lâm sàng' : 'Tăng nhẹ', bil > 85 ? LV.vua : LV.nhe, `bilirubin ${bil} µmol/L`);
        }
    })();

    /* ---------- Mức độ đau từ thang điểm đã ghi ---------- */
    (() => {
        const m = String(ctx.painText || '').match(/(\d{1,2})\s*\/\s*10/);
        if (!m) return;
        const p = +m[1];
        add('Mức độ đau', p >= 7 ? `${p}/10 — đau nặng` : p >= 4 ? `${p}/10 — đau trung bình` : `${p}/10 — đau nhẹ`,
            p >= 7 ? LV.nang : p >= 4 ? LV.vua : LV.nhe, 'thang điểm đau đã ghi');
    })();

    return out;
}

/** Câu chữ để chèn vào tóm tắt / biện luận */
export function gradeToText(list) {
    return (list || []).filter(g => g.ketQua && g.ketQua !== 'Chưa đủ dữ liệu')
        .map(g => `- ${g.ten}: ${g.ketQua}${g.dua ? ` (${g.dua})` : ''}`).join('\n');
}
