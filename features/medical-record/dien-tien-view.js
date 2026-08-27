// dien-tien-view.js — chế độ xem thứ hai của Bệnh sử: nhìn cả diễn tiến trong một màn.
//
// Bảng nhập ở chế độ thứ nhất rất đủ ý nhưng phải cuộn dọc mới thấy hết; lúc trình
// ca bệnh thì cần thấy ngay "bệnh đi lên hay đi xuống, đau ở đâu, lan đi đâu, uống
// thuốc có đỡ không". Màn này gom lại ba thứ, cùng đọc một nguồn dữ liệu với bảng
// nhập nên sửa bên nào bên kia cũng đổi:
//   1. Đường sóng động học — điểm đau / nhiệt độ / SpO2 theo trục thời gian
//   2. Làn diễn tiến (swimlane) — mỗi mốc một thẻ: triệu chứng mới, động học triệu
//      chứng cũ, xử trí và nơi đã khám
//   3. Bản đồ giải phẫu — vùng đau của mốc đang chọn, kéo một vùng sang vùng khác
//      để vẽ hướng lan
//
// Bấm ▶ thì con trỏ quét từ mốc xa nhất tới lúc nhập viện, thẻ sáng dần và bản đồ
// đổi theo — dùng khi trình bệnh án, khỏi đọc một tràng chữ.
//
// Module không tự giữ mốc nào: `getSteps()` trả mảng mốc đang có, mọi thay đổi báo
// ngược ra bằng `onPatch(id, patch)` để benh-su-editor còn ghi vào bệnh án.

import { bodyMapSvg, regionTen, regionMat, mucDau, vungProse } from './body-map.js';
import { careLine, hasCare } from './tuyen-truoc-list.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const num = (v) => {
    const n = parseFloat(String(v ?? '').replace(',', '.'));
    return isFinite(n) ? n : null;
};

/* Hai đường số đo: thang riêng, vẽ nét đứt cho khác hẳn các đường triệu chứng.
   [khóa trong mốc, nhãn, thấp nhất, cao nhất, đơn vị, màu] */
const SO_DO = [
    ['nd', 'Nhiệt độ', 35, 41, '°C', '#f59e0b'],
    ['spo2', 'SpO2', 85, 100, '%', '#0ea5e9']
];

/* Màu cho từng đường triệu chứng — tránh trùng màu của hai đường số đo ở trên */
const MAU_TC = ['#ef4444', '#7c3aed', '#059669', '#2563eb', '#db2777',
    '#0d9488', '#c2410c', '#4f46e5', '#65a30d', '#9333ea'];

/* Mức độ một triệu chứng, thang 0–10. Không bắt sinh viên chấm điểm từng thứ:
   mức suy ra từ chính lựa chọn "còn như cũ / thuyên giảm / nặng hơn" vốn đã phải
   chọn ở mỗi mốc. Ai muốn chỉnh thì kéo thẳng điểm trên đồ thị, lúc đó số chỉnh
   tay được ghi vào m.tc[tên triệu chứng] và máy không suy đè lên nữa. */
const MUC_DAU_TIEN = 5;     // mới xuất hiện = vừa
const BUOC = 2;             // nặng hơn / thuyên giảm nhích 2 nấc
const MUC_HET = 0;          // vắng mặt ở mốc sau = đã hết

let host, getSteps = () => [], onPatch = () => { }, labelOf = () => '', proseOf = () => '';
let tenChuan = (x) => String(x || '').trim();   // quy tên triệu chứng về tên trong thư viện
let mainTen = () => '';                          // triệu chứng chính (nằm ở khối riêng)
let activeId = '';     // mốc đang chọn trên bản đồ
let mat = 'truoc';     // mặt trước / mặt sau
let keo = '';          // vùng đang giữ để kéo tia hướng lan
let playing = 0;       // id của setTimeout đang phát
const an = new Set();  // đường đang bị tắt ở chú giải
let dangKeo = null;    // { key, i, id } — đang kéo một điểm trên đồ thị

const stepsView = () => getSteps().filter(Boolean);
const active = () => stepsView().find(m => m.id === activeId) || stepsView().at(-1) || null;

/* ---------------------------------------------------------------- đường sóng */

/** Đường cong trơn qua các điểm (Catmull-Rom đổi sang Bezier) — mượt mà không vọt lố */
function smoothPath(pts) {
    if (pts.length < 2) return '';
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1];
        const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
        const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
        d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
    }
    return d;
}

/* =====================================================================
   Suy ra đường đi của từng triệu chứng qua các mốc
   ===================================================================== */

/** Tên các triệu chứng mới ghi ở một mốc (ô "triệu chứng mới xuất hiện") */
const symMoi = (m) => String(m.s || '').split(';').map(x => x.trim()).filter(Boolean);

/**
 * Mỗi triệu chứng một đường: [{ key, ten, mau, pts: [{i, v}], het }]
 * - lần đầu thấy   -> 5/10
 * - "nặng hơn"     -> +2   · "thuyên giảm" -> −2   · "tương tự" -> giữ nguyên
 * - vắng mặt ở mốc sau khi đã từng có -> 0 (đã hết) rồi kết thúc đường
 * - m.tc[key] có số -> lấy số đó, và mức đó thành mốc để tính tiếp
 */
export function symSeries(view) {
    const duong = new Map();          // key -> { ten, pts, het }
    const muc = new Map();            // key -> mức hiện tại
    const chinh = tenChuan(mainTen());

    view.forEach((m, i) => {
        const thay = new Map();       // key -> tên hiển thị, các triệu chứng có mặt ở mốc này
        const ghi = (raw) => {
            const ten = tenChuan(raw);
            if (ten) thay.set(ten.toLowerCase(), ten);
        };
        symMoi(m).forEach(ghi);
        (m.refs || []).forEach(r => ghi(r.sym));
        if (m.main && chinh) ghi(chinh);

        // Trạng thái của triệu chứng cũ ở mốc này (nặng hơn / thuyên giảm / tương tự)
        const trang = new Map();
        (m.refs || []).forEach(r => {
            const ten = tenChuan(r.sym);
            if (ten) trang.set(ten.toLowerCase(), r.st || 'tương tự');
        });

        thay.forEach((ten, key) => {
            const tay = num(m.tc?.[key]);
            let v;
            if (tay != null) v = tay;
            else if (!muc.has(key)) v = MUC_DAU_TIEN;
            else {
                const st = trang.get(key);
                v = muc.get(key) + (st === 'nặng hơn' ? BUOC : st === 'thuyên giảm' ? -BUOC : 0);
            }
            v = Math.min(10, Math.max(1, v));
            muc.set(key, v);
            if (!duong.has(key)) duong.set(key, { ten, pts: [], het: false });
            const d = duong.get(key);
            d.ten = ten;
            d.pts.push({ i, v });
        });

        // Đã từng có mà mốc này không nhắc tới nữa -> vẽ rơi về 0 rồi dừng
        duong.forEach((d, key) => {
            if (thay.has(key) || d.het || !d.pts.length) return;
            d.pts.push({ i, v: MUC_HET });
            d.het = true;
            muc.delete(key);
        });
    });

    return [...duong.entries()].map(([key, d], k) => ({
        key, ten: d.ten, het: d.het, pts: d.pts, mau: MAU_TC[k % MAU_TC.length]
    }));
}

const W = 700, H = 210, PAD_L = 34, PAD_R = 46, PAD_T = 16, PAD_B = 44;

/** Đổi tọa độ y của đồ thị ngược về mức 0–10 (dùng khi kéo điểm) */
const mucTuY = (y) => Math.round(Math.min(10, Math.max(0,
    (1 - (y - PAD_T) / (H - PAD_T - PAD_B)) * 10)));

function waveSvg(view, upto, series) {
    if (view.length < 1) return '';
    const cols = view.length;
    const xOf = (i) => PAD_L + (cols === 1 ? (W - PAD_L - PAD_R) / 2
        : i * (W - PAD_L - PAD_R) / (cols - 1));
    const yOf = (v, lo, hi) => PAD_T + (1 - (v - lo) / (hi - lo)) * (H - PAD_T - PAD_B);

    // Đường triệu chứng: kéo được từng điểm để chỉnh mức
    const duongTc = series.filter(s => !an.has(s.key)).map(s => {
        const hien = s.pts.filter(p => p.i <= upto).map(p => [xOf(p.i), yOf(p.v, 0, 10), p.i, p.v]);
        if (!hien.length) return '';
        return `<path class="dt-line" style="stroke:${s.mau}" d="${smoothPath(hien.map(p => [p[0], p[1]]))}"/>`
            + hien.map(p => `<circle class="dt-dot dt-drag" style="fill:${s.mau}" cx="${p[0]}" cy="${p[1]}" r="5"
                data-i="${p[2]}" data-key="${esc(s.key)}"><title>${esc(s.ten)} — mức ${p[3]}/10${p[3] === 0 ? ' (đã hết)' : ''}. Kéo lên xuống để chỉnh.</title></circle>`).join('');
    }).join('');

    // Nhiệt độ / SpO2: thang riêng, nét đứt, không kéo (gõ số ở thẻ bên dưới)
    const duongSo = SO_DO.map(([k, ten, lo, hi, dv, mau]) => {
        if (an.has(k)) return '';
        const hien = view.map((m, i) => [i, num(m[k])]).filter(([i, v]) => v != null && i <= upto)
            .map(([i, v]) => [xOf(i), yOf(Math.min(Math.max(v, lo), hi), lo, hi), i, v]);
        if (!hien.length) return '';
        return `<path class="dt-line is-do" style="stroke:${mau}" d="${smoothPath(hien.map(p => [p[0], p[1]]))}"/>`
            + hien.map(p => `<circle class="dt-dot" style="fill:${mau}" cx="${p[0]}" cy="${p[1]}" r="4"
                data-i="${p[2]}"><title>${esc(ten)} ${p[3]}${dv}</title></circle>`).join('');
    }).join('');

    const duong = duongTc + duongSo;

    // Mốc có dùng thuốc / đã đi khám: gạch dọc mờ, để thấy chỗ nào là can thiệp
    const canThiep = view.map((m, i) => (i <= upto && coXuTri(m))
        ? `<line class="dt-rx" x1="${xOf(i)}" y1="${PAD_T}" x2="${xOf(i)}" y2="${H - PAD_B}"/>
           <text class="dt-rxlab" x="${xOf(i)}" y="${PAD_T - 3}" text-anchor="middle">℞</text>` : '').join('');

    const nhan = view.map((m, i) => `<text class="dt-xlab${i === upto ? ' is-now' : ''}"
        x="${xOf(i)}" y="${H - PAD_B + 16}" text-anchor="middle">${esc(labelOf(m))}</text>`).join('');

    // Vạch ngang + mức bên trái: không có mốc quy chiếu thì đường sóng chỉ nói
    // được "lên hay xuống", không nói được "lên tới đâu".
    const luoi = [[0, "nặng"], [0.5, "vừa"], [1, "hết"]].map(([f, nhan]) => {
        const y = PAD_T + f * (H - PAD_T - PAD_B);
        return `<line class="dt-grid" x1="${PAD_L}" y1="${y}" x2="${W - PAD_R}" y2="${y}"/>
            <text class="dt-ylab" x="${PAD_L - 6}" y="${y + 3}" text-anchor="end">${nhan}</text>`;
    }).join('');

    const quet = `<line class="dt-scrub" x1="${xOf(upto)}" y1="${PAD_T - 6}" x2="${xOf(upto)}" y2="${H - PAD_B + 4}"/>`;

    return `<svg class="dt-wave" viewBox="0 0 ${W} ${H}"
        role="img" aria-label="Đường diễn tiến mức độ từng triệu chứng theo thời gian">
        ${luoi}${canThiep}${duong}${quet}${nhan}
    </svg>`;
}

const coXuTri = (m) => hasCare(m?.care);

/* ---------------------------------------------------------------- làn diễn tiến */

/** Nhãn mức của một triệu chứng ở đúng mốc đó — thẻ đọc được số, không chỉ nhìn đường */
function mucTag(raw, i, mucTai) {
    const pts = mucTai?.get(tenChuan(raw).toLowerCase());
    const p = pts?.find(x => x.i === i);
    if (!p) return '';
    return ` <b class="dt-muc is-${mucDau(p.v)}">${p.v === 0 ? 'hết' : p.v + '/10'}</b>`;
}

const DONG_HOC = { 'nặng hơn': ['↑', 'up'], 'thuyên giảm': ['↓', 'down'], 'tương tự': ['=', 'same'] };

const careText = (care) => careLine(care);

function laneCard(m, i, upto, mucTai) {
    const moi = String(m.s || '').split(';').map(x => x.trim()).filter(Boolean);
    const cu = (m.refs || []).filter(r => String(r.sym || '').trim());
    const care = careText(m.care);
    const d = num(m.dau);
    return `<div class="dt-card${m.id === activeId ? ' is-active' : ''}${i > upto ? ' is-dim' : ''}${m.main ? ' is-main' : ''}"
            data-id="${esc(m.id)}" data-i="${i}" tabindex="0">
        <div class="dt-when">${esc(labelOf(m))}
            ${m.main ? '<span class="dt-flag"><i class="fas fa-star"></i> khởi phát</span>' : ''}</div>
        ${moi.length ? `<div class="dt-syms">${moi.map(x =>
        `<span class="dt-chip">${esc(x)}${mucTag(x, i, mucTai)}</span>`).join('')}</div>` : ''}
        ${cu.length ? `<div class="dt-old">${cu.map(r => {
        const [ky, cls] = DONG_HOC[r.st] || DONG_HOC['tương tự'];
        return `<span class="dt-dyn is-${cls}"><b>${ky}</b> ${esc(r.sym)}${mucTag(r.sym, i, mucTai)}${r.d ? ' — ' + esc(r.d) : ''}</span>`;
    }).join('')}</div>` : ''}
        ${care ? `<div class="dt-care"><i class="fas fa-house-medical"></i> ${esc(care)}</div>` : ''}
        <div class="dt-nums">
            <label class="dt-num"><span>Đau</span>
                <input type="range" min="0" max="10" step="1" value="${d ?? 0}" data-k="dau" aria-label="Điểm đau ở mốc ${esc(labelOf(m))}">
                <b class="dt-val is-${mucDau(d)}">${d != null ? d + '/10' : '—'}</b></label>
            <label class="dt-num"><span>Nhiệt độ</span>
                <input type="number" step="0.1" min="34" max="42" class="dt-in" value="${esc(m.nd ?? '')}" data-k="nd" placeholder="°C" aria-label="Nhiệt độ">
            </label>
            <label class="dt-num"><span>SpO2</span>
                <input type="number" step="1" min="50" max="100" class="dt-in" value="${esc(m.spo2 ?? '')}" data-k="spo2" placeholder="%" aria-label="SpO2">
            </label>
        </div>
        ${(m.vung || []).length || (m.lan || []).length
            ? `<div class="dt-vung"><i class="fas fa-crosshairs"></i> ${esc(vungProse(m.vung || [], m.lan || []))}</div>` : ''}
    </div>`;
}

/* ---------------------------------------------------------------- vẽ cả màn */

let upto = 1e9;   // mốc cuối đang hiện (dùng khi phát diễn tiến)

export function renderDienTien() {
    if (!host) return;
    const view = stepsView();
    if (!view.length) {
        host.innerHTML = `<p class="dt-empty"><i class="fas fa-chart-line"></i>
            Chưa có mốc nào để vẽ diễn tiến — sang <b>Bảng nhập</b> thêm mốc trước,
            hoặc dùng <b>Nhập nhanh theo kịch bản bệnh</b>.</p>`;
        return;
    }
    if (!view.some(m => m.id === activeId)) activeId = view.at(-1).id;
    const gioiHan = Math.min(upto, view.length - 1);
    const m = active();
    const series = symSeries(view);
    // Mức của từng triệu chứng ở mốc đang xem — thẻ in kèm để đọc được số, không chỉ nhìn đường
    const mucTai = new Map(series.map(s => [s.key, s.pts]));

    host.innerHTML = `
        <div class="dt-grid2">
            <div class="dt-left">
                <div class="dt-wavebox">
                    <div class="dt-legend">
                        ${series.map(s => `<button type="button" class="dt-lg dt-lgb${an.has(s.key) ? ' is-off' : ''}"
                            data-toggle="${esc(s.key)}" title="Bấm để ẩn / hiện đường này">
                            <i style="background:${s.mau}"></i>${esc(s.ten)}${s.het ? ' <em>(đã hết)</em>' : ''}</button>`).join('')}
                        ${SO_DO.map(([k, ten, lo, hi, dv, mau]) => `<button type="button"
                            class="dt-lg dt-lgb is-do${an.has(k) ? ' is-off' : ''}" data-toggle="${esc(k)}"
                            title="Thang riêng ${lo}–${hi}${dv} — bấm để ẩn / hiện">
                            <i style="background:${mau}"></i>${esc(ten)}</button>`).join('')}
                        <span class="dt-lg dt-lgrx"><b>℞</b> mốc có xử trí</span>
                        <span class="dt-lg dt-note">Mỗi triệu chứng một đường — nặng hơn thì lên, thuyên giảm thì xuống,
                            chạm đáy là đã hết. <b>Kéo một điểm lên xuống</b> để chỉnh lại mức.</span>
                    </div>
                    <div class="dt-wavewrap">${waveSvg(view, gioiHan, series)}</div>
                </div>
                <div class="dt-lanes">${view.map((s, i) => laneCard(s, i, gioiHan, mucTai)).join('')}</div>
            </div>
            <div class="dt-right">
                <div class="dt-maphead">
                    <div class="seg dt-seg">
                        <button type="button" class="${mat === 'truoc' ? 'active' : ''}" data-mat="truoc">Mặt trước</button>
                        <button type="button" class="${mat === 'sau' ? 'active' : ''}" data-mat="sau">Mặt sau</button>
                    </div>
                    <span class="dt-mapfor">${esc(labelOf(m))}</span>
                </div>
                <div class="dt-mapwrap">${bodyMapSvg({
        mat, vung: m?.vung || [], lan: m?.lan || [], dau: m?.dau, keo
    })}</div>
                <p class="dt-maphint"><i class="fas fa-hand-pointer"></i> Chạm một vùng để đánh dấu đau ·
                    <b>giữ rồi kéo</b> sang vùng khác để vẽ hướng lan · chạm lại để bỏ.</p>
                ${(m?.lan || []).length ? `<div class="dt-tialist">${m.lan.map((x, k) =>
        `<span class="dt-tia">${esc(regionTen(x[0]))} → ${esc(regionTen(x[1]))}
            <button type="button" data-del-lan="${k}" title="Xóa tia"><i class="fas fa-xmark"></i></button></span>`).join('')}</div>` : ''}
            </div>
        </div>
        <div class="dt-prose"><div class="dt-prosehead"><i class="fas fa-align-left"></i> Đoạn bệnh sử máy ghép</div>
            <div class="dt-prosebody">${view.slice(0, gioiHan + 1).map((s, i) =>
            `<p class="dt-sent${i === gioiHan ? ' is-now' : ''}">${esc(proseOf(s)) || '<i>(mốc chưa có nội dung)</i>'}</p>`).join('')}</div>
        </div>`;
}

/* ---------------------------------------------------------------- phát diễn tiến */

export function playDienTien(onTick) {
    const view = stepsView();
    if (!view.length) return;
    stopDienTien();
    let i = 0;
    upto = 0;
    renderDienTien();
    onTick?.(true);
    const buoc = Math.max(700, Math.min(2200, Math.round(15000 / view.length)));
    const chay = () => {
        i++;
        if (i >= view.length) { playing = 0; upto = 1e9; renderDienTien(); onTick?.(false); return; }
        upto = i;
        renderDienTien();
        playing = setTimeout(chay, buoc);
    };
    playing = setTimeout(chay, buoc);
}

export function stopDienTien() {
    if (playing) clearTimeout(playing);
    playing = 0;
    upto = 1e9;
}

export const dangPhat = () => !!playing;

/* ---------------------------------------------------------------- khởi động */

export function initDienTien(o) {
    host = o.host;
    if (!host) return;
    getSteps = o.getSteps || getSteps;
    onPatch = o.onPatch || onPatch;
    labelOf = o.labelOf || labelOf;
    proseOf = o.proseOf || proseOf;
    tenChuan = o.tenChuan || tenChuan;
    mainTen = o.mainTen || mainTen;

    const patch = (p) => { const m = active(); if (m) onPatch(m.id, p); };

    host.addEventListener('click', (e) => {
        const mt = e.target.closest('[data-mat]');
        if (mt) { mat = mt.dataset.mat; return renderDienTien(); }

        // Chú giải: bấm một đường để ẩn / hiện — nhiều triệu chứng thì đồ thị rối
        const tg = e.target.closest('[data-toggle]');
        if (tg) {
            const k = tg.dataset.toggle;
            an.has(k) ? an.delete(k) : an.add(k);
            return renderDienTien();
        }

        const del = e.target.closest('[data-del-lan]');
        if (del) {
            const m = active();
            const lan = (m?.lan || []).slice();
            lan.splice(+del.dataset.delLan, 1);
            return patch({ lan });
        }

        const card = e.target.closest('.dt-card');
        // Bấm vào ô nhập trong thẻ thì đừng coi là chọn thẻ (sẽ vẽ lại, mất con trỏ)
        if (card && !e.target.closest('input')) {
            activeId = card.dataset.id;
            stopDienTien();
            return renderDienTien();
        }

        const dot = e.target.closest('.dt-dot');
        if (dot) {
            const m = stepsView()[+dot.dataset.i];
            if (m) { activeId = m.id; renderDienTien(); }
        }
    });

    /* Chạm vùng = đánh dấu đau; giữ ở vùng này rồi thả ở vùng kia = vẽ tia hướng lan.
       Dùng pointer để chạy được cả chuột lẫn ngón tay, và setPointerCapture để ngón
       trượt ra ngoài hình vẫn nhận được nhát thả. */
    /* Kéo một điểm trên đường triệu chứng để chỉnh mức. Mức chỉnh tay ghi vào
       m.tc[tên] và từ đó máy không suy đè lên nữa — mốc sau vẫn cộng trừ tiếp từ
       con số này, nên chỉnh một chỗ là cả đoạn sau dịch theo. */
    host.addEventListener('pointerdown', (e) => {
        const dot = e.target.closest('.dt-drag');
        if (dot) {
            const m = stepsView()[+dot.dataset.i];
            if (!m) return;
            dangKeo = { key: dot.dataset.key, id: m.id, el: dot };
            dot.classList.add('is-keo');
            try { dot.ownerSVGElement?.setPointerCapture?.(e.pointerId); } catch { }
            e.preventDefault();
            return;
        }
        const z = e.target.closest('[data-z]');
        if (!z) return;
        keo = z.dataset.z;
        z.classList.add('is-keo');
        // Bắt con trỏ để ngón tay trượt ra ngoài hình vẫn nhận được nhát thả.
        // Vài trường hợp không có con trỏ thật (trình duyệt tự động hóa) sẽ ném lỗi,
        // nhưng thao tác chấm / kéo vẫn phải chạy tiếp nên nuốt lỗi ở đây.
        try { host.querySelector('.bm-svg')?.setPointerCapture?.(e.pointerId); } catch { }
    });

    /** Tọa độ y của con trỏ, quy về hệ tọa độ trong viewBox của đồ thị */
    function yTrongSvg(svg, clientY) {
        const r = svg.getBoundingClientRect();
        return (clientY - r.top) / r.height * H;
    }

    host.addEventListener('pointermove', (e) => {
        if (!dangKeo) return;
        const svg = dangKeo.el.ownerSVGElement;
        if (!svg) return;
        const v = mucTuY(yTrongSvg(svg, e.clientY));
        // Chỉ nhích tròn con điểm đang kéo, vẽ lại cả màn thì mất luôn ngón tay
        dangKeo.el.setAttribute('cy', PAD_T + (1 - v / 10) * (H - PAD_T - PAD_B));
        dangKeo.muc = v;
        e.preventDefault();
    });

    host.addEventListener('pointerup', (e) => {
        if (dangKeo) {
            const { id, key, muc } = dangKeo;
            const el = dangKeo.el;
            dangKeo = null;
            try { el.ownerSVGElement?.releasePointerCapture?.(e.pointerId); } catch { }
            if (muc == null) { el.classList.remove('is-keo'); return; }
            const m = stepsView().find(x => x.id === id);
            if (m) onPatch(id, { tc: { ...(m.tc || {}), [key]: muc } });
            return;
        }
        if (!keo) return;
        const tu = keo;
        keo = '';
        const svg = host.querySelector('.bm-svg');
        try { svg?.releasePointerCapture?.(e.pointerId); } catch { }
        // Ngón tay có thể rời ra ngoài thẻ đang giữ -> hỏi lại xem đang thả trên vùng nào
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const toi = el?.closest?.('[data-z]')?.dataset.z || '';
        const m = active();
        if (!m) return;

        if (!toi || toi === tu) {
            const vung = (m.vung || []).slice();
            const k = vung.indexOf(tu);
            if (k < 0) vung.push(tu); else vung.splice(k, 1);
            return onPatch(m.id, { vung });
        }
        if (regionMat(tu) !== regionMat(toi)) return renderDienTien();   // hai mặt khác nhau, bỏ qua
        const lan = (m.lan || []).slice();
        if (!lan.some(x => x[0] === tu && x[1] === toi)) lan.push([tu, toi]);
        const vung = (m.vung || []).slice();
        if (!vung.includes(tu)) vung.push(tu);
        onPatch(m.id, { lan, vung });
    });

    host.addEventListener('input', (e) => {
        const k = e.target.dataset.k;
        if (!k) return;
        const card = e.target.closest('.dt-card');
        const m = stepsView()[+card?.dataset.i];
        if (!m) return;
        // Kéo thanh trượt thì chỉ đổi con số hiện tại chỗ, khỏi vẽ lại cả màn
        if (k === 'dau') {
            const b = card.querySelector('.dt-val');
            if (b) { b.textContent = e.target.value + '/10'; b.className = 'dt-val is-' + mucDau(e.target.value); }
        }
        onPatch(m.id, { [k]: e.target.value }, { nhe: true });
    });

    renderDienTien();
}

/** Mốc nào đang được chọn — benh-su-editor cần để đồng bộ hai chế độ xem */
export const setActiveStep = (id) => { activeId = id || ''; };
