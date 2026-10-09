// File: features/quiz/page/quiz-result-card.js
// "Lưu ảnh kết quả": vẽ thẻ điểm 1080×1350 bằng canvas (giấy kẻ chấm, băng keo, vòng phần trăm, 3 ô đúng/sai/bỏ trống, giờ, ngày)
// rồi chia sẻ (điện thoại có Web Share cho tệp) hoặc tải .png. Màu lấy từ biến CSS đang dùng nên đúng cả chế độ sáng lẫn tối.
// nạp lười từ quiz-ui.js khi bấm nút — không tốn gì lúc làm bài.

const FONT = 'Quicksand, "Segoe UI", system-ui, sans-serif';

function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
}
// Chia chữ thành tối đa maxLines dòng theo bề rộng; dòng cuối bị cắt thì thêm "…"
function wrap(g, text, maxW, maxLines) {
    const words = String(text).split(/\s+/).filter(Boolean), lines = [];
    let cur = '';
    for (const w of words) {
        const t = cur ? cur + ' ' + w : w;
        if (g.measureText(t).width <= maxW || !cur) cur = t;
        else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
        lines.length = maxLines;
        let last = lines[maxLines - 1];
        while (last.length > 1 && g.measureText(last + '…').width > maxW) last = last.slice(0, -1);
        lines[maxLines - 1] = last.trimEnd() + '…';
    }
    return lines;
}
// Trộn hai màu (#rrggbb hoặc rgb()) theo tỉ lệ t của màu a — canvas không có color-mix()
function rgbOf(c) {
    c = String(c).trim();
    if (c[0] === '#') { const h = c.length === 4 ? c.replace(/./g, (x, i) => i ? x + x : x) : c; return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
    const m = c.match(/[\d.]+/g) || [0, 0, 0]; return [+m[0], +m[1], +m[2]];
}
function mix(a, b, t) { const x = rgbOf(a), y = rgbOf(b); return `rgb(${x.map((n, i) => Math.round(n * t + y[i] * (1 - t))).join(',')})`; }
function star(g, cx, cy, r, rot) {
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = rot + (Math.PI / 5) * i - Math.PI / 2, rr2 = i % 2 ? r * 0.46 : r; g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2); }
    g.closePath(); g.fillStyle = '#FFE39A'; g.fill(); g.lineWidth = 3.5; g.strokeStyle = '#E0AE2E'; g.lineJoin = 'round'; g.stroke();
}
function heart(g, cx, cy, r) {
    g.beginPath(); g.moveTo(cx, cy + r * 0.9);
    g.bezierCurveTo(cx - r * 1.6, cy - r * 0.1, cx - r * 0.7, cy - r * 1.3, cx, cy - r * 0.4);
    g.bezierCurveTo(cx + r * 0.7, cy - r * 1.3, cx + r * 1.6, cy - r * 0.1, cx, cy + r * 0.9);
    g.closePath(); g.fillStyle = '#FFC2D4'; g.fill(); g.lineWidth = 3.5; g.strokeStyle = '#F2709C'; g.lineJoin = 'round'; g.stroke();
}
function loadImg(src) {
    return new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
}

// d = { title, pct (0–100), gpa4 (0–4), score10 (chuỗi đã định dạng), grade, label ("8/10 câu"), correct, wrong, blank, time, when }
// ĐIỂM HỆ 4 là số to nhất (giống màn kết quả); vòng tô theo gpa4/4.
export async function saveResultCard(d) {
    const css = getComputedStyle(document.documentElement);
    const v = (n, f) => css.getPropertyValue(n).trim() || f;
    const W = 1080, H = 1350;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    try { await Promise.all([document.fonts.load(`800 64px ${FONT}`), document.fonts.load(`600 32px ${FONT}`)]); } catch (e) { }

    const ink = v('--ink', '#5A4640'), muted = v('--ink-muted', '#9A8780'), line = v('--line', '#F2DED6');
    const g4 = Number(d.gpa4) || 0, fmt1 = (n) => Number(n).toFixed(1).replace('.', ',');
    const tone = g4 >= 3 ? v('--ok-solid', '#3DB37A') : g4 >= 2 ? v('--hue-butter', '#F2BE2E') : v('--bad-solid', '#E4646C');
    const toneInk = g4 >= 3 ? v('--ok-ink', '#1E7A4C') : g4 >= 2 ? v('--ink-butter', '#8C6500') : v('--bad-ink', '#A33A42');

    // bàn học + chấm bi
    g.fillStyle = v('--bg-desk', '#FBF0EC'); g.fillRect(0, 0, W, H);
    g.fillStyle = v('--dot', 'rgba(236,160,165,0.34)');
    for (let y = 28; y < H; y += 44) for (let x = 28; x < W; x += 44) { g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI * 2); g.fill(); }

    // tờ giấy kẻ ô
    const cx = 84, cy = 120, cw = W - 168, ch = H - 250;
    g.save();
    g.shadowColor = 'rgba(120,80,70,0.25)'; g.shadowBlur = 40; g.shadowOffsetY = 18;
    rr(g, cx, cy, cw, ch, 56); g.fillStyle = v('--paper', '#FFFCF8'); g.fill();
    g.restore();
    g.save(); rr(g, cx, cy, cw, ch, 56); g.clip();
    g.strokeStyle = v('--rule', 'rgba(126,192,238,0.24)'); g.lineWidth = 1.5;
    for (let x = cx + 36; x < cx + cw; x += 36) { g.beginPath(); g.moveTo(x, cy); g.lineTo(x, cy + ch); g.stroke(); }
    for (let y = cy + 36; y < cy + ch; y += 36) { g.beginPath(); g.moveTo(cx, y); g.lineTo(cx + cw, y); g.stroke(); }
    g.restore();
    rr(g, cx, cy, cw, ch, 56); g.lineWidth = 5; g.strokeStyle = v('--line', '#F2DED6'); g.stroke();

    // băng keo
    g.save(); g.translate(W / 2, cy + 6); g.rotate(-0.04);
    g.fillStyle = v('--washi-blossom', 'rgba(255,190,210,0.9)'); g.fillRect(-120, -26, 240, 52);
    g.restore();

    // tên bộ đề
    g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = `800 52px ${FONT}`;
    const lines = wrap(g, d.title || 'Bộ đề', cw - 150, 2);
    lines.forEach((t, i) => g.fillText(t, W / 2, cy + 130 + i * 64));
    const ringY = cy + 130 + lines.length * 64 + 240;

    // vòng điểm hệ 4 (tô theo điểm/4) + số hệ 4 thật to ở giữa + nhãn chữ như con tem đè mép dưới vòng
    const R = 190;
    g.lineWidth = 40; g.lineCap = 'round';
    g.strokeStyle = tone; g.globalAlpha = 0.2; g.beginPath(); g.arc(W / 2, ringY, R, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;   // đường ray = chính màu tông, nhạt
    g.strokeStyle = tone; g.beginPath();
    g.arc(W / 2, ringY, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.012, Math.min(1, g4 / 4))); g.stroke();
    g.setLineDash([14, 14]); g.lineWidth = 4; g.strokeStyle = tone; g.globalAlpha = 0.5;
    g.beginPath(); g.arc(W / 2, ringY, R + 46, 0, Math.PI * 2); g.stroke();
    g.setLineDash([3, 10]); g.lineWidth = 3.5; g.strokeStyle = tone; g.globalAlpha = 0.4;   // chỉ khâu bên trong vòng
    g.beginPath(); g.arc(W / 2, ringY, R - 36, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]); g.globalAlpha = 1;
    // hạt ở đầu cung (cùng vị trí với màn kết quả)
    const endA = -Math.PI / 2 + Math.PI * 2 * Math.max(0.012, Math.min(1, g4 / 4)), bx = W / 2 + Math.cos(endA) * R, by = ringY + Math.sin(endA) * R;
    g.beginPath(); g.arc(bx, by + 4, 17, 0, Math.PI * 2); g.fillStyle = mix(tone, '#000000', 0.4); g.fill();
    g.beginPath(); g.arc(bx, by, 17, 0, Math.PI * 2); g.fillStyle = v('--surface-card', '#FFFFFF'); g.fill(); g.lineWidth = 7; g.strokeStyle = tone; g.stroke();
    // sao / tim dán quanh dấu theo bậc điểm (giống màn kết quả)
    if (g4 >= 2) star(g, W / 2 + R + 40, ringY - R + 30, 30, 0.2);
    if (g4 >= 3) { star(g, W / 2 - R - 56, ringY - 40, 22, -0.3); heart(g, W / 2 + R + 56, ringY + 120, 20); }
    if (g4 >= 4) star(g, W / 2 - R + 30, ringY - R + 40, 18, 0.1);
    g.fillStyle = muted; g.font = `800 28px ${FONT}`;
    g.fillText('ĐIỂM HỆ 4', W / 2, ringY - 86);
    // "3,5" + "/4" căn thành một cụm giữa vòng
    g.font = `900 156px ${FONT}`; const gw = g.measureText(fmt1(g4)).width;
    g.font = `800 46px ${FONT}`; const sw = g.measureText('/4').width;
    const gx = W / 2 - (gw + 10 + sw) / 2;
    g.textAlign = 'left';
    g.fillStyle = mix(tone, '#FFFFFF', 0.28); g.font = `900 156px ${FONT}`; g.fillText(fmt1(g4), gx, ringY + 68);   // bóng đáy
    g.fillStyle = toneInk; g.fillText(fmt1(g4), gx, ringY + 62);
    g.fillStyle = muted; g.font = `800 46px ${FONT}`; g.fillText('/4', gx + gw + 10, ringY + 62);
    g.textAlign = 'center';
    const lw = 170, lh = 78, lx = W / 2 - lw / 2, ly = ringY + R - lh / 2 + 8;
    rr(g, lx, ly, lw, lh, 39); g.fillStyle = v('--surface-card', '#FFFFFF'); g.fill();
    g.lineWidth = 7; g.strokeStyle = tone; g.stroke();
    g.save(); g.setLineDash([9, 8]); g.lineWidth = 3; g.globalAlpha = 0.55; rr(g, lx - 9, ly - 9, lw + 18, lh + 18, 48); g.stroke(); g.restore();
    g.fillStyle = toneInk; g.font = `900 54px ${FONT}`;
    g.fillText(String(d.grade || '–'), W / 2, ly + 56);

    // 3 ô phụ: điểm hệ 10 · câu đúng · thời gian
    const ty = ringY + R + 90, tw = (cw - 150 - 2 * 24) / 3, tx0 = cx + 75;
    [['ĐIỂM HỆ 10', d.score10, ''],
     ['CÂU ĐÚNG', String(d.label || '').replace(/ câu$/, ''), `${d.wrong} sai${d.blank ? ' · ' + d.blank + ' bỏ trống' : ''}`],
     ['THỜI GIAN', d.time, '']].forEach(([k, big, small], i) => {
        const x = tx0 + i * (tw + 24);
        const note = [v('--hue-sky', '#7EC0EE'), v('--hue-mint', '#6FD1AE'), v('--hue-butter', '#F2BE2E')][i];
        const tape = [v('--washi-sky', '#B4DCFA'), v('--washi-mint', '#AAE8CD'), v('--washi-butter', '#FFE48C')][i];
        const card = v('--surface-card', '#FFFFFF');
        g.save(); g.translate(x + tw / 2, ty + 75); g.rotate([-0.016, 0.012, -0.01][i]); g.translate(-(x + tw / 2), -(ty + 75));
        rr(g, x, ty, tw, 150, 30); g.fillStyle = mix(note, card, 0.14); g.fill();
        g.lineWidth = 4; g.setLineDash([12, 10]); g.strokeStyle = mix(note, card, 0.6); g.stroke(); g.setLineDash([]);
        g.save(); g.translate(x + tw / 2, ty - 2); g.rotate(-0.05); g.fillStyle = tape; g.fillRect(-30, -10, 60, 20); g.restore();   // băng keo
        g.fillStyle = muted; g.font = `800 24px ${FONT}`; g.fillText(k, x + tw / 2, ty + 44);
        g.fillStyle = ink; g.font = `800 52px ${FONT}`; g.fillText(String(big), x + tw / 2, ty + 100);
        if (small) { g.fillStyle = muted; g.font = `700 24px ${FONT}`; g.fillText(small, x + tw / 2, ty + 134); }
        g.restore();
    });

    // thời gian + ngày
    g.fillStyle = muted; g.font = `700 32px ${FONT}`;
    g.fillText(d.when || '', W / 2, ty + 150 + 64);

    // linh vật (nếu tải được) + chân trang
    const mascot = await loadImg(new URL('../web_assets/mascot_stationery_squirrel.webp', import.meta.url).href);
    if (mascot) g.drawImage(mascot, cx + cw - 190, cy + ch - 170, 170, 170);
    g.textAlign = 'left'; g.fillStyle = v('--ink-blossom', '#C8487A'); g.font = `800 38px ${FONT}`;
    g.fillText('Zitthenkne', cx + 56, cy + ch - 56);
    g.textAlign = 'center'; g.fillStyle = muted; g.font = `600 28px ${FONT}`;
    g.fillText('zitthenkne · học y bằng bộ đề của chính mình', W / 2, H - 56);

    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    if (!blob) return 'error';
    const slug = String(d.title || 'bo-de').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) || 'bo-de';
    const file = new File([blob], `ket-qua-${slug}.png`, { type: 'image/png' });
    // điện thoại: mở bảng chia sẻ của hệ điều hành (ảnh thẳng vào Zalo/Messenger…); không có thì tải về
    if (navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        try { await navigator.share({ files: [file], title: d.title || 'Kết quả' }); return 'shared'; }
        catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return 'saved';
}
