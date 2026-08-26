// bien-luan-map.js — vẽ lưu đồ tư duy cho phần biện luận.
//
// Đây là cây thật sự nhiều tầng, không phải một cột hộp xếp dọc:
//
//   [VẤN ĐỀ] ─┬─ [Lâm sàng ủng hộ] ─┬─ dấu chứng 1
//             │                     └─ dấu chứng 2
//             ├─ [Âm tính có giá trị] ─ …
//             ├─ [🔴 Nghĩ nhiều nhất] ─┬─ Bệnh A · vì… · CLS…
//             │                        └─ Bệnh B …
//             ├─ [🟠 Cần loại trừ khẩn] ─ …
//             └─ [Biến chứng] ─ …
//
// Bố cục tính theo chiều cao cây con (mỗi nhánh chiếm đúng chỗ nó cần, cha
// nằm giữa các con), dây nối kiểu lưu đồ — ngang, gấp khúc bo góc.
// Vẽ bằng canvas 2D nên vừa hiện trên màn hình vừa tải xuống PNG được.

const FONT = "Nunito, 'Segoe UI', Roboto, Arial, sans-serif";

const TONE = {
    root: ['#7c3aed', '#f5f3ff'],
    ls: ['#2563eb', '#eff6ff'],
    am: ['#0891b2', '#ecfeff'],
    yt: ['#ea580c', '#fff7ed'],
    red: ['#e11d48', '#fff1f2'],
    nn0: ['#059669', '#ecfdf5'],   // nghĩ nhiều nhất
    nn1: ['#7c3aed', '#f5f3ff'],   // nghĩ tới
    nn2: ['#6b7280', '#f3f4f6'],   // ít nghĩ
    nn3: ['#ea580c', '#fff7ed'],   // cần loại trừ khẩn
    bc: ['#c2410c', '#fff7ed']
};
const LEVEL_TONE = ['nn0', 'nn1', 'nn2', 'nn3'];
const LEVEL_ICO = ['🔴', '🟣', '⚪', '🟠'];
/** Bốn mức phân tầng — phải khớp thứ tự với LEVELS trong bien-luan-editor.js */
const LEVELS = ['Nghĩ nhiều nhất', 'Nghĩ tới', 'Ít nghĩ', 'Cần loại trừ'];

const PAD = 26;
const GAP_X = 54;          // khoảng hở giữa hai tầng
const GAP_Y = 9;           // khoảng hở giữa hai hộp cùng tầng
const GAP_ROOT = 26;       // khoảng hở giữa hai vấn đề
const LINE_H = 17;

const trim = (x) => String(x ?? '').trim();

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

/* =====================================================================
   1. Dựng cây từ dữ liệu biện luận
   Mỗi node: { text, sub, tone, kind, hit, kids }
   ===================================================================== */
function buildTree(vanDe) {
    return (vanDe || []).map((v, i) => {
        const kids = [];
        const group = (tone, label, kids2) => {
            if (kids2.length) kids.push({ text: label, tone, kind: 'group', hit: { index: i }, kids: kids2 });
        };
        const leaves = (list, tone) => list.map(t => ({ text: t, tone, kind: 'leaf', hit: { index: i }, kids: [] }));

        group('ls', 'Lâm sàng ủng hộ', leaves((v.lamSang || []).filter(Boolean), 'ls'));
        group('am', 'Âm tính có giá trị', leaves((v.amTinh || []).filter(Boolean), 'am'));
        group('yt', 'Yếu tố nguy cơ', trim(v.yeuTo) ? leaves([trim(v.yeuTo)], 'yt') : []);

        /* Nguyên nhân tách thành từng tầng nghĩ tới — đây mới là xương sống của
           lưu đồ: nhìn một cái là thấy hướng nào đang được ưu tiên. */
        LEVELS.forEach((lv, li) => {
            const rows = (v.nguyenNhan || [])
                .map((n, ni) => ({ n, ni }))
                .filter(x => (x.n.muc || LEVELS[1]) === lv && trim(x.n.ten));
            if (!rows.length) return;
            kids.push({
                text: `${LEVEL_ICO[li]} ${lv}`, tone: LEVEL_TONE[li], kind: 'group', hit: { index: i },
                kids: rows.map(({ n, ni }) => ({
                    text: trim(n.ten),
                    sub: [trim(n.lyDo) && `vì ${trim(n.lyDo)}`, trim(n.cls) && `CLS: ${trim(n.cls)}`]
                        .filter(Boolean).join('\n'),
                    tone: LEVEL_TONE[li], kind: 'leaf', hit: { index: i, nn: ni }, kids: []
                }))
            });
        });

        const rf = (v.redFlags || []).filter(Boolean);
        group('red', '🚨 Cần loại trừ khẩn', leaves(rf, 'red'));

        const bc = (v.bienChung || []).filter(b => trim(b.ten));
        group('bc', 'Biến chứng cần bàn', bc.map(b => ({
            text: trim(b.ten), sub: trim(b.lapLuan), tone: 'bc', kind: 'leaf', hit: { index: i }, kids: []
        })));

        return {
            text: trim(v.ten) || `Vấn đề ${i + 1}`, tone: 'root', kind: 'root',
            badge: `VẤN ĐỀ ${i + 1}`, hit: { index: i }, kids
        };
    });
}

/* =====================================================================
   2. Đo — mỗi node biết cao bao nhiêu, cây con cao bao nhiêu
   ===================================================================== */
function measure(ctx, node, depth, widths) {
    const w = widths[Math.min(depth, widths.length - 1)];
    const bold = node.kind !== 'leaf';
    ctx.font = `${bold ? '700' : '600'} ${node.kind === 'root' ? 14.5 : 12.5}px ${FONT}`;
    node.lines = wrap(ctx, node.text, w - 26);

    node.subLines = [];
    if (node.sub) {
        ctx.font = `500 11px ${FONT}`;
        String(node.sub).split('\n').forEach(part =>
            node.subLines.push(...wrap(ctx, part, w - 26)));
    }
    node.w = w;
    node.h = (node.kind === 'root' ? 20 : 14) + node.lines.length * LINE_H
        + node.subLines.length * 14 + (node.badge ? 15 : 0) + (node.subLines.length ? 3 : 0);

    node.kids.forEach(k => measure(ctx, k, depth + 1, widths));
    const kidsH = node.kids.reduce((s, k) => s + k.treeH, 0)
        + Math.max(0, node.kids.length - 1) * GAP_Y;
    node.treeH = Math.max(node.h, kidsH);
    return node.treeH;
}

/** Gán toạ độ: cha nằm giữa khối con của nó */
function place(node, x, top, widths, depth = 0) {
    node.x = x;
    node.y = top + (node.treeH - node.h) / 2;
    const nextX = x + node.w + GAP_X;
    let cy = top + (node.treeH - (node.kids.reduce((s, k) => s + k.treeH, 0)
        + Math.max(0, node.kids.length - 1) * GAP_Y)) / 2;
    node.kids.forEach(k => {
        place(k, nextX, cy, widths, depth + 1);
        cy += k.treeH + GAP_Y;
    });
}

/* =====================================================================
   3. Vẽ
   ===================================================================== */
function drawNode(ctx, n) {
    const [ink, bg] = TONE[n.tone] || TONE.nn1;
    ctx.save();
    ctx.shadowColor = n.kind === 'root' ? 'rgba(124,58,237,.26)' : 'rgba(17,24,39,.07)';
    ctx.shadowBlur = n.kind === 'root' ? 14 : 8;
    ctx.shadowOffsetY = n.kind === 'root' ? 4 : 2;
    if (n.kind === 'root') {
        const g = ctx.createLinearGradient(n.x, n.y, n.x + n.w, n.y + n.h);
        g.addColorStop(0, '#a78bfa');
        g.addColorStop(1, '#f472b6');
        ctx.fillStyle = g;
    } else ctx.fillStyle = bg;
    roundRect(ctx, n.x, n.y, n.w, n.h, n.kind === 'root' ? 14 : 11);
    ctx.fill();
    ctx.restore();

    if (n.kind !== 'root') {
        ctx.strokeStyle = ink + (n.kind === 'group' ? '55' : '33');
        ctx.lineWidth = n.kind === 'group' ? 1.4 : 1;
        roundRect(ctx, n.x, n.y, n.w, n.h, 11);
        ctx.stroke();
        // vệt màu bên trái cho dễ phân nhóm
        ctx.fillStyle = ink;
        roundRect(ctx, n.x, n.y + 6, 3.5, n.h - 12, 2);
        ctx.fill();
    }

    let ty = n.y + 12;
    if (n.badge) {
        ctx.font = `800 9.5px ${FONT}`;
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        ctx.fillText(n.badge, n.x + 14, ty + 4);
        ty += 15;
    }
    ctx.font = `${n.kind === 'leaf' ? '600' : '700'} ${n.kind === 'root' ? 14.5 : 12.5}px ${FONT}`;
    ctx.fillStyle = n.kind === 'root' ? '#fff' : '#1f2937';
    n.lines.forEach((l, i) => ctx.fillText(l, n.x + 14, ty + 12 + i * LINE_H));
    ty += n.lines.length * LINE_H;

    if (n.subLines.length) {
        ctx.font = `500 11px ${FONT}`;
        ctx.fillStyle = '#6b7280';
        n.subLines.forEach((l, i) => ctx.fillText(l, n.x + 14, ty + 13 + i * 14));
    }
}

/** Dây nối kiểu lưu đồ: ra khỏi cha theo chiều ngang, gấp khúc bo góc, vào con */
function elbow(ctx, p, c, color) {
    const x1 = p.x + p.w, y1 = p.y + p.h / 2;
    const x2 = c.x, y2 = c.y + c.h / 2;
    const mx = x1 + Math.min(26, (x2 - x1) / 2);
    const r = Math.min(9, Math.abs(y2 - y1) / 2, Math.abs(x2 - mx));
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    if (r < 1.5 || Math.abs(y2 - y1) < 1.5) {
        ctx.lineTo(x2, y2);
    } else {
        const dir = y2 > y1 ? 1 : -1;
        ctx.lineTo(mx - r, y1);
        ctx.quadraticCurveTo(mx, y1, mx, y1 + r * dir);
        ctx.lineTo(mx, y2 - r * dir);
        ctx.quadraticCurveTo(mx, y2, mx + r, y2);
        ctx.lineTo(x2, y2);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.7;
    ctx.stroke();

    // đầu mũi tên nhỏ ở chỗ cắm vào hộp con
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 5, y2 - 3.2);
    ctx.lineTo(x2 - 5, y2 + 3.2);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
}

function walk(node, fn, depth = 0) {
    fn(node, depth);
    node.kids.forEach(k => walk(k, fn, depth + 1));
}

/**
 * Vẽ toàn bộ lưu đồ. Trả về { width, height, hits } — hits để bấm vào node
 * biết đang bấm vấn đề nào / nhánh nguyên nhân nào.
 */
export function drawMap(canvas, vanDe, opts = {}) {
    const scale = opts.scale || (window.devicePixelRatio || 1);
    const W = opts.width || 1100;
    const ctx = canvas.getContext('2d');

    /* Ba tầng: vấn đề — nhóm nhánh — lá. Tầng lá ăn hết phần bề ngang còn lại
       vì đó là chỗ chữ dài nhất (tên bệnh + lý do + cận lâm sàng). */
    const wRoot = 200, wGroup = 168;
    // Cột lá không cho phình hết bề ngang: hộp dài ngoẵng đọc mỏi mắt và
    // để trống một mảng lớn bên phải. Thừa chỗ thì thu hẹp cả khung lại.
    const wLeaf = Math.max(200, Math.min(430, W - PAD * 2 - wRoot - wGroup - GAP_X * 2));
    const widths = [wRoot, wGroup, wLeaf];
    const CW = Math.min(W, PAD * 2 + wRoot + wGroup + wLeaf + GAP_X * 2);

    const roots = buildTree(vanDe);
    let total = PAD;
    roots.forEach(r => {
        measure(ctx, r, 0, widths);
        place(r, PAD, total, widths);
        total += r.treeH + GAP_ROOT;
    });
    const H = Math.max(total - GAP_ROOT + PAD, 200);

    canvas.width = CW * scale;
    canvas.height = H * scale;
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    const g = ctx.createLinearGradient(0, 0, CW, H);
    g.addColorStop(0, '#fffdfe');
    g.addColorStop(1, '#faf8ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CW, H);

    if (!roots.length) {
        ctx.fillStyle = '#9ca3af';
        ctx.font = `600 14px ${FONT}`;
        ctx.fillText('Chưa có vấn đề nào — thêm vấn đề ở bảng để lưu đồ mọc nhánh.', PAD, 60);
        return { width: CW, height: H, hits: [] };
    }

    // Vẽ dây trước, hộp sau, để hộp luôn nằm trên dây
    roots.forEach(r => walk(r, (n) => n.kids.forEach(k =>
        elbow(ctx, n, k, (TONE[k.tone] || TONE.nn1)[0] + '77'))));

    // Vạch phân cách giữa hai vấn đề cho đỡ dính vào nhau
    roots.slice(1).forEach(r => {
        const y = r.y + r.h / 2 - r.treeH / 2 - GAP_ROOT / 2;
        ctx.save();
        ctx.strokeStyle = '#f1e7fb';
        ctx.setLineDash([5, 6]);
        ctx.beginPath();
        ctx.moveTo(PAD, y);
        ctx.lineTo(CW - PAD, y);
        ctx.stroke();
        ctx.restore();
    });

    const hits = [];
    roots.forEach(r => walk(r, (n) => {
        drawNode(ctx, n);
        if (n.kind !== 'group') hits.push({ x: n.x, y: n.y, w: n.w, h: n.h, ...n.hit });
    }));

    return { width: CW, height: H, hits };
}

/** Xuất lưu đồ ra file PNG để dán vào bài trình bày */
export function downloadMapPng(vanDe, name = 'so-do-bien-luan') {
    const cv = document.createElement('canvas');
    drawMap(cv, vanDe, { width: 1500, scale: 2 });
    const a = document.createElement('a');
    a.href = cv.toDataURL('image/png');
    a.download = `${name}.png`;
    a.click();
}
