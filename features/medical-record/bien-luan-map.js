// bien-luan-map.js — vẽ sơ đồ tư duy cho phần biện luận.
//
// Cây biện luận được vẽ ra canvas: mỗi vấn đề là một nhánh chính, các ý con toả sang
// phải theo màu (lâm sàng, yếu tố nguy cơ, cần loại trừ khẩn, nguyên nhân, biến chứng).
// Vẽ bằng canvas 2D nên vừa hiện trên màn hình vừa tải xuống PNG được, không cần thư viện.

const FONT = '"Segoe UI", Roboto, Arial, sans-serif';

const TONE = {
    root: ['#7c3aed', '#f5f3ff'],
    ls: ['#2563eb', '#eff6ff'],
    yt: ['#ea580c', '#fff7ed'],
    red: ['#e11d48', '#fff1f2'],
    nn0: ['#059669', '#ecfdf5'],   // nghĩ nhiều nhất
    nn1: ['#7c3aed', '#f5f3ff'],   // nghĩ tới
    nn2: ['#b45309', '#fffbeb'],   // ít nghĩ
    nn3: ['#6b7280', '#f3f4f6'],   // loại trừ
    bc: ['#c2410c', '#fff7ed']
};
const LEVEL_TONE = ['nn0', 'nn1', 'nn2', 'nn3'];

/** Cắt chữ thành nhiều dòng vừa bề rộng cho trước */
function wrap(ctx, text, maxWidth) {
    const words = String(text || '').split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
        else line = test;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/** Vẽ một hộp bo góc có nhãn nhỏ phía trên, trả về chiều cao đã dùng */
function nodeBox(ctx, { x, y, w, text, tone, label, bold }) {
    const [ink, bg] = TONE[tone] || TONE.nn1;
    ctx.font = `${bold ? '700' : '500'} 13px ${FONT}`;
    const lines = wrap(ctx, text, w - 24);
    const labelH = label ? 15 : 0;
    const h = labelH + lines.length * 18 + 16;

    ctx.save();
    ctx.shadowColor = 'rgba(17,24,39,.07)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = bg;
    roundRect(ctx, x, y, w, h, 12);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = ink + '33';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, 12);
    ctx.stroke();

    // vệt màu bên trái cho dễ phân nhóm
    ctx.fillStyle = ink;
    roundRect(ctx, x, y + 6, 3.5, h - 12, 2);
    ctx.fill();

    let ty = y + 12;
    if (label) {
        ctx.font = `800 9.5px ${FONT}`;
        ctx.fillStyle = ink;
        ctx.fillText(label.toUpperCase(), x + 14, ty + 4);
        ty += labelH;
    }
    ctx.font = `${bold ? '700' : '500'} 13px ${FONT}`;
    ctx.fillStyle = '#1f2937';
    lines.forEach((l, i) => ctx.fillText(l, x + 14, ty + 13 + i * 18));
    return h;
}

function curve(ctx, x1, y1, x2, y2, color) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x1 + (x2 - x1) / 2, y1, x1 + (x2 - x1) / 2, y2, x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.stroke();
}

/**
 * Vẽ toàn bộ sơ đồ. Trả về { width, height, hits } — hits để bấm vào node biết
 * đang bấm vấn đề nào.
 */
export function drawMap(canvas, vanDe, opts = {}) {
    const scale = opts.scale || (window.devicePixelRatio || 1);
    const W = opts.width || 1100;
    const ctx = canvas.getContext('2d');
    ctx.font = `500 13px ${FONT}`;

    const PAD = 24, ROOT_W = 210, CHILD_W = Math.min(300, (W - PAD * 2 - ROOT_W - 90) / 1.15);
    const colX = PAD + ROOT_W + 70;

    // Đo trước để biết chiều cao canvas
    const plan = (vanDe || []).map((v, i) => {
        const items = [];
        if (v.lamSang?.length) items.push({ tone: 'ls', label: 'Lâm sàng ủng hộ', text: v.lamSang.join(' · ') });
        if (v.yeuTo) items.push({ tone: 'yt', label: 'Yếu tố nguy cơ', text: v.yeuTo });
        if (v.redFlags?.length) items.push({ tone: 'red', label: 'Cần loại trừ khẩn', text: v.redFlags.join(' · ') });
        if (v.nghiDen) items.push({ tone: 'nn1', label: 'Nghĩ đến', text: v.nghiDen });
        (v.nguyenNhan || []).forEach(n => items.push({
            tone: LEVEL_TONE[['Nghĩ nhiều nhất', 'Nghĩ tới', 'Ít nghĩ', 'Loại trừ'].indexOf(n.muc)] || 'nn1',
            label: n.muc || 'Nghĩ tới',
            text: n.ten + (n.lyDo ? ` — ${n.lyDo}` : '') + (n.cls ? `  ⟨CLS: ${n.cls}⟩` : '')
        }));
        (v.bienChung || []).forEach(b => items.push({
            tone: 'bc', label: 'Biến chứng', text: b.ten + (b.lapLuan ? ` — ${b.lapLuan}` : '')
        }));
        return { v, i, items };
    });

    // tính chiều cao từng khối
    let total = PAD;
    plan.forEach(p => {
        p.y = total;
        let h = 0;
        p.items.forEach(it => {
            ctx.font = `500 13px ${FONT}`;
            const lines = wrap(ctx, it.text, CHILD_W - 24);
            it.h = 15 + lines.length * 18 + 16;
            h += it.h + 10;
        });
        ctx.font = `700 15px ${FONT}`;
        const rootLines = wrap(ctx, p.v.ten || `Vấn đề ${p.i + 1}`, ROOT_W - 30);
        p.rootH = rootLines.length * 20 + 26;
        p.h = Math.max(h, p.rootH) + 18;
        total += p.h + 16;
    });
    const H = Math.max(total + PAD, 200);

    canvas.width = W * scale;
    canvas.height = H * scale;
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    ctx.scale(scale, scale);

    // nền
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#fffdfe');
    g.addColorStop(1, '#faf8ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const hits = [];
    plan.forEach(p => {
        // node gốc
        ctx.font = `700 15px ${FONT}`;
        const rootLines = wrap(ctx, p.v.ten || `Vấn đề ${p.i + 1}`, ROOT_W - 30);
        const rx = PAD, ry = p.y + Math.max(0, (p.h - p.rootH) / 2);
        ctx.save();
        ctx.shadowColor = 'rgba(124,58,237,.28)';
        ctx.shadowBlur = 14;
        ctx.shadowOffsetY = 4;
        const rg = ctx.createLinearGradient(rx, ry, rx + ROOT_W, ry + p.rootH);
        rg.addColorStop(0, '#a78bfa');
        rg.addColorStop(1, '#f472b6');
        ctx.fillStyle = rg;
        roundRect(ctx, rx, ry, ROOT_W, p.rootH, 14);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = '#fff';
        ctx.font = `800 11px ${FONT}`;
        ctx.fillText(`VẤN ĐỀ ${p.i + 1}`, rx + 15, ry + 18);
        ctx.font = `700 15px ${FONT}`;
        rootLines.forEach((l, i) => ctx.fillText(l, rx + 15, ry + 38 + i * 20));
        hits.push({ x: rx, y: ry, w: ROOT_W, h: p.rootH, index: p.i });

        // các nhánh con
        let cy = p.y + 8;
        p.items.forEach(it => {
            const drawn = nodeBox(ctx, { x: colX, y: cy, w: CHILD_W, text: it.text, tone: it.tone, label: it.label });
            curve(ctx, rx + ROOT_W, ry + p.rootH / 2, colX, cy + drawn / 2, (TONE[it.tone] || TONE.nn1)[0] + '66');
            cy += drawn + 10;
        });
    });

    return { width: W, height: H, hits };
}

/** Xuất sơ đồ ra file PNG để dán vào bài trình bày */
export function downloadMapPng(vanDe, name = 'so-do-bien-luan') {
    const cv = document.createElement('canvas');
    drawMap(cv, vanDe, { width: 1400, scale: 2 });
    const a = document.createElement('a');
    a.href = cv.toDataURL('image/png');
    a.download = `${name}.png`;
    a.click();
}
