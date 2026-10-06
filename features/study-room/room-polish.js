// room-polish.js — bản 55 (2026-10-06): 9 nâng cấp điện thoại / iPad cho các màn của phòng (CSS đi kèm: mục "BẢN 55" cuối study-room.css).
//  1 đầu trang tự thu khi cuộn xuống (điện thoại) · 2 giữ màn hình sáng khi đang làm bài · 3 dock có viên chỉ báo trượt
//  4 giữ ô đáp án = gạch (riêng mình) · 5 chụm hai ngón đổi cỡ chữ · 6 nghe đọc câu hỏi · 7 ảnh kết quả để chia sẻ
//  8 menu Thêm: hàng "Hay dùng" · 9 bàn luận: chạm đúp = 👍, vuốt phải = trả lời.
// (Chuyển màn có chuyển động + tự theo chế độ tối của máy nằm ở CSS / <head>, không cần JS.)
import { room, hasSession, questionAt, optsOf, subscribe } from './room-state.js';
import { effectiveIndex } from './room-quiz-stage.js';
import { haptic, paintToolStates } from './room-boost.js';
import { computeScores } from './room-scoreboard.js';
import { shortName } from './room-ui.js';
import { showToast } from '../../core/utils.js';
import { stripOptionLabels } from '../quiz/quiz-helpers.js';
import { speak, stopVoice, isSpeaking, voiceSupported } from '../quiz/page/quiz-voice.js';

const el = (id) => document.getElementById(id);
const phone = () => matchMedia('(max-width: 767px)').matches;
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

// ---------- 1. Đầu trang tự thu khi cuộn xuống, hiện lại khi cuộn lên ----------
// Header + lời ghim ăn ~135px (16% màn điện thoại) mà chỉ cần lúc mới vào. Cuộn xuống ≥28px là thu, cuộn lên ≥18px
// hoặc về sát đầu là hiện. Thu/hiện làm khung cuộn đổi chiều cao -> trình duyệt có thể kẹp scrollTop -> sinh sự kiện
// cuộn giả; nên sau mỗi lần đổi bỏ qua sự kiện cuộn 450ms (không thì thu/hiện nhấp nháy ở cuối trang).
function initHeaderAway() {
    const sc = el('stage-quiz'), hdr = document.querySelector('body > header');
    if (!sc || !hdr) return;
    const measure = () => document.body.style.setProperty('--hdr-h', Math.round(hdr.getBoundingClientRect().height) + 'px');
    measure();
    window.ResizeObserver && new ResizeObserver(measure).observe(hdr);
    let last = 0, acc = 0, until = 0;
    const set = (away) => {
        if (document.body.classList.contains('hdr-away') === away) return;
        document.body.classList.toggle('hdr-away', away);
        until = performance.now() + 450;
        acc = 0;
    };
    sc.addEventListener('scroll', () => {
        const t = sc.scrollTop;
        if (!phone()) { set(false); last = t; return; }
        if (performance.now() < until) { last = t; return; }
        const d = t - last;
        last = t;
        if (d * acc < 0) acc = 0;                           // đổi chiều vuốt thì tính lại
        acc += d;
        if (t < 48 || acc < -18) set(false);
        else if (acc > 28 && t > 120) set(true);
    }, { passive: true });
    matchMedia('(max-width: 767px)').addEventListener?.('change', (e) => { if (!e.matches) set(false); });
}

// ---------- 2. Giữ màn hình sáng khi đang có phiên ----------
// Cả nhóm ngồi bàn luận, điện thoại tắt màn sau 30s là mất chỗ + mất tiếng chuông. Chỉ giữ khi phiên đang chạy
// (sảnh chờ để máy tự tắt cho đỡ hao pin); trình duyệt tự thả khóa khi ẩn tab nên xin lại lúc quay về.
function initWakeLock() {
    if (!('wakeLock' in navigator)) return;
    let lock = null;
    const want = () => hasSession() && !room.session?.ended && document.visibilityState === 'visible';
    const sync = async () => {
        if (want() && !lock) {
            try {
                lock = await navigator.wakeLock.request('screen');
                lock.addEventListener('release', () => { lock = null; });
            } catch (e) { lock = null; }
        } else if (!want() && lock) {
            lock.release().catch(() => {});
            lock = null;
        }
    };
    subscribe(sync);
    document.addEventListener('visibilitychange', sync);
    sync();
}

// ---------- 3. Dock: viên chỉ báo trượt dưới nút đang mở ----------
function initDockInd() {
    const nav = el('mobile-nav');
    if (!nav) return;
    const ind = document.createElement('i');
    ind.className = 'rm-dock-ind';
    ind.setAttribute('aria-hidden', 'true');
    nav.prepend(ind);
    let raf = 0;
    const place = () => {
        raf = 0;
        const on = nav.querySelector('.rm-dock-btn.is-on');
        if (!on || !on.offsetWidth) { ind.style.opacity = '0'; return; }
        const n = nav.getBoundingClientRect(), r = on.getBoundingClientRect();
        ind.style.setProperty('--x', (r.left - n.left) + 'px');
        ind.style.setProperty('--w', r.width + 'px');
        ind.style.opacity = '1';
    };
    const sched = () => { raf ||= requestAnimationFrame(place); };
    const mo = new MutationObserver(sched);
    mo.observe(nav, { attributes: true, subtree: true, attributeFilter: ['class'] });
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });     // nút rm-only-* hiện/ẩn theo class của body
    addEventListener('resize', sched);
    sched();
}

// ---------- 4. Giữ ô đáp án để GẠCH (riêng mình, nhớ theo câu) ----------
// Mẹo làm trắc nghiệm: loại dần phương án sai. Giữ ~0,5s một ô để gạch / giữ lại để bỏ gạch; chạm bình thường vẫn chọn.
// Khác "Loại trừ" của room-reason (có lý do, cả nhóm thấy): đây chỉ là nét bút của riêng mình.
const strikeKey = () => `roomStrike_${room.roomId}_${room.session?.startedAtMs || 0}`;
const readStrike = () => { try { return JSON.parse(lsGet(strikeKey()) || '{}'); } catch (e) { return {}; } };
function paintStrike() {
    const area = el('options-area');
    if (!area || !hasSession()) return;
    const set = new Set(readStrike()[effectiveIndex()] || []);
    area.querySelectorAll('.rm-ocard').forEach(c => c.classList.toggle('is-struck', set.has(Number(c.dataset.card))));
}
function toggleStrike(k) {
    const i = effectiveIndex(), all = readStrike(), cur = new Set(all[i] || []);
    cur.has(k) ? cur.delete(k) : cur.add(k);
    if (cur.size) all[i] = [...cur]; else delete all[i];
    lsSet(strikeKey(), JSON.stringify(all));
    paintStrike();
    haptic(14);
}
function initStrike() {
    const area = el('options-area');
    if (!area) return;
    let timer = 0, sx = 0, sy = 0, fired = false;
    const clear = () => { clearTimeout(timer); timer = 0; };
    area.addEventListener('pointerdown', (e) => {
        fired = false;
        if (e.pointerType === 'mouse' || e.button) return;
        const c = e.target.closest('.rm-ocard');
        if (!c || e.target.closest('[contenteditable], input, textarea, .rm-odisc')) return;
        sx = e.clientX; sy = e.clientY;
        clear();
        timer = setTimeout(() => { timer = 0; fired = true; toggleStrike(Number(c.dataset.card)); setTimeout(() => { fired = false; }, 700); }, 520);
    });
    area.addEventListener('pointermove', (e) => { if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 9) clear(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => area.addEventListener(t, clear));
    // Cú click ngay sau khi giữ là của việc giữ, không phải chọn đáp án
    area.addEventListener('click', (e) => { if (fired) { fired = false; e.stopPropagation(); e.preventDefault(); } }, true);
    // Menu giữ-lâu của Android + chuột phải trên máy tính: chặn, chuột phải thì gạch luôn
    area.addEventListener('contextmenu', (e) => {
        const c = e.target.closest('.rm-ocard');
        if (!c || e.target.closest('[contenteditable], input, textarea')) return;
        e.preventDefault();
        if (e.pointerType === 'mouse') toggleStrike(Number(c.dataset.card));
    });
    new MutationObserver(paintStrike).observe(area, { childList: true });
    subscribe(() => {
        if (!hasSession() || lsGet('roomStrikeTip')) return;
        lsSet('roomStrikeTip', '1');
        setTimeout(() => showToast('Mẹo: giữ một ô đáp án để gạch nó (chỉ mình bạn thấy).', 'info', 4500), 3000);
    });
    paintStrike();
}

// ---------- 5. Chụm hai ngón để đổi cỡ chữ ----------
// Cùng biến --rm-scale với nút "Cỡ chữ" (study-room-main.js nghe 'room:textscale' để cập nhật nhãn + nhớ). #stage-quiz đặt
// touch-action: pan-x pan-y (CSS) nên chụm KHÔNG phóng cả trang như trước mà phóng chữ — bố cục không bị trượt ngang.
function initPinch() {
    const sc = el('stage-quiz');
    if (!sc) return;
    let d0 = 0, s0 = 1, cur = 1, on = false, raf = 0, tipTimer = 0;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const tip = (v) => {
        let n = el('pinch-tip');
        if (!n) { n = document.createElement('div'); n.id = 'pinch-tip'; n.setAttribute('aria-hidden', 'true'); document.body.appendChild(n); }
        n.textContent = `Cỡ chữ ${Math.round(v * 100)}%`;
        n.classList.add('is-on');
        clearTimeout(tipTimer);
        tipTimer = setTimeout(() => n.classList.remove('is-on'), 900);
    };
    sc.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 2) return;
        on = true;
        d0 = dist(e.touches) || 1;
        s0 = cur = Number(getComputedStyle(document.documentElement).getPropertyValue('--rm-scale')) || 1;
    }, { passive: true });
    sc.addEventListener('touchmove', (e) => {
        if (!on || e.touches.length !== 2) return;
        e.preventDefault();
        cur = Math.max(.9, Math.min(1.6, s0 * dist(e.touches) / d0));
        raf ||= requestAnimationFrame(() => { raf = 0; document.documentElement.style.setProperty('--rm-scale', cur.toFixed(3)); tip(cur); });
    }, { passive: false });
    const end = () => {
        if (!on) return;
        on = false;
        const v = Math.round(cur * 100) / 100;
        window.dispatchEvent(new CustomEvent('room:textscale', { detail: v }));
    };
    sc.addEventListener('touchend', end, { passive: true });
    sc.addEventListener('touchcancel', end, { passive: true });
}

// ---------- 6. Nghe đọc câu hỏi (dùng chung giọng đọc với trang làm bài: quiz-voice.js) ----------
// Bản 66: văn bản gốc là markdown — công thức $…$ đọc nguyên mã thành tiếng lẫn lộn, ảnh / link / khối mã cũng vậy
const speakable = (t) => t
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\([\s\S]*?\\\)/g, ' công thức ')
    .replace(/\|?(?:\s*:?-{3,}:?\s*\|)+/g, ' ')                // hàng ngăn |---|---| của bảng
    .replace(/\|/g, ', ')
    .replace(/[*_#>~`]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
const plain = (h) => { const d = document.createElement('div'); d.innerHTML = String(h || ''); return speakable((d.textContent || '').replace(/\s+/g, ' ').trim()); };
let spokenAt = -1;
function readText() {
    const i = effectiveIndex(), q = questionAt(i);
    if (!q) return '';
    const opts = stripOptionLabels(optsOf(q)).map((o, k) => `Phương án ${String.fromCharCode(65 + k)}. ${plain(o)}.`);
    return [`Câu ${i + 1}.`, plain(q.caseText || q.case), plain(q.question), ...opts].filter(Boolean).join(' ');
}
// Thanh điều khiển nổi khi đang đọc (bản 66): Dừng + đổi tốc độ — trước đây công tắc nằm trong menu, muốn dừng phải mở menu; tốc độ chỉ chỉnh được ở trang làm bài.
const RATES = [.8, 1, 1.2, 1.4];
const rateNow = () => { const v = parseFloat(lsGet('quiz_voice_rate')); return isNaN(v) ? 1 : v; };
const rateText = (r) => String(r).replace('.', ',') + '×';
function speakBar() {
    let b = el('speakbar');
    if (b) return b;
    b = document.createElement('div');
    b.id = 'speakbar'; b.className = 'rm-speakbar hidden'; b.setAttribute('role', 'group'); b.setAttribute('aria-label', 'Đang đọc câu hỏi');
    b.innerHTML = '<i class="fas fa-volume-high" aria-hidden="true"></i><span id="speak-q"></span>'
        + '<button type="button" id="speak-rate" title="Đổi tốc độ đọc"></button><button type="button" id="speak-stop">Dừng</button>';
    document.body.appendChild(b);
    b.addEventListener('click', (e) => {
        if (e.target.closest('#speak-stop')) { stopVoice(); return paintSpeak(); }
        if (e.target.closest('#speak-rate')) {
            const cur = rateNow();
            const k = RATES.findIndex(r => r > cur + .01);
            lsSet('quiz_voice_rate', String(RATES[k < 0 ? 0 : k]));
            stopVoice(); toggleSpeak();                    // đọc lại từ đầu câu với tốc độ mới (nằm trong cú chạm nên iOS cho phát)
        }
    });
    return b;
}
const paintSpeak = () => {
    paintToolStates();
    const on = isSpeaking();
    if (!on && !el('speakbar')) return;
    const b = speakBar();
    b.classList.toggle('hidden', !on);
    if (on) { el('speak-q').textContent = `Đang đọc câu ${spokenAt + 1}`; el('speak-rate').textContent = rateText(rateNow()); }
};
function toggleSpeak() {
    if (isSpeaking()) { stopVoice(); return paintSpeak(); }
    if (!voiceSupported()) return showToast('Máy này chưa hỗ trợ đọc to.', 'info');
    const text = readText();
    if (!text) return showToast('Chưa có câu hỏi để đọc.', 'info', 1600);
    spokenAt = effectiveIndex();
    speak(text, paintSpeak);          // gọi thẳng trong cú chạm: iOS chỉ cho phát tiếng khi có thao tác
    paintSpeak();
}
function initSpeak() {
    window.addEventListener('room:speak', toggleSpeak);
    subscribe(() => { if (isSpeaking() && effectiveIndex() !== spokenAt) { stopVoice(); paintSpeak(); } });   // sang câu khác thì thôi đọc
}

// ---------- 7. Ảnh kết quả để chia sẻ (khung tờ giấy sổ dán, màu phẳng) ----------
const FONT = "'Quicksand', 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
function fit(g, text, max) { let s = String(text); while (s.length > 1 && g.measureText(s).width > max) s = s.slice(0, -2) + '…'; return s; }
async function resultCanvas() {
    const rows = computeScores().filter(r => r.answered > 0);
    if (!rows.length) return null;
    try { await Promise.all(['500', '600', '700'].map(w => document.fonts.load(`${w} 40px Quicksand`))); } catch (e) {}
    const W = 1080, H = 1350, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const INK = '#574049', MUTED = '#A58A94', ROSE = '#D25C7E';
    g.fillStyle = '#FCE6EF'; g.fillRect(0, 0, W, H);                                  // bàn hồng phấn + chấm bi
    g.fillStyle = 'rgba(236,128,165,.22)';
    for (let y = 18; y < H; y += 36) for (let x = 18; x < W; x += 36) { g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(190,90,125,.16)'; rr(g, 66, 92, 960, 1200, 60); g.fill();     // bóng phẳng lệch
    g.fillStyle = '#FFFBFD'; rr(g, 54, 76, 960, 1200, 60); g.fill();                   // tờ giấy
    g.strokeStyle = 'rgba(236,128,165,.6)'; g.lineWidth = 3; g.setLineDash([16, 12]); rr(g, 78, 100, 912, 1152, 44); g.stroke(); g.setLineDash([]);
    g.save(); g.translate(690, 70); g.rotate(.07); g.fillStyle = 'rgba(255,190,170,.9)'; g.fillRect(-110, -26, 220, 52);   // băng keo
    g.fillStyle = 'rgba(255,255,255,.4)'; for (let x = -130; x < 130; x += 22) { g.beginPath(); g.moveTo(x, 26); g.lineTo(x + 26, -26); g.lineTo(x + 38, -26); g.lineTo(x + 12, 26); g.fill(); } g.restore();

    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillStyle = INK; g.font = `700 66px ${FONT}`; g.fillText('Kết thúc phiên', W / 2 - 6, 224);
    g.fillStyle = MUTED; g.font = `500 34px ${FONT}`;
    g.fillText(fit(g, room.session?.quizTitle || 'Đề ôn tập', 800), W / 2 - 6, 280);
    const nQ = room.session?.questions?.length || 0;
    g.fillStyle = ROSE; g.font = `600 30px ${FONT}`; g.fillText(`${nQ} câu · ${rows.length} người làm`, W / 2 - 6, 328);

    // Bục top 3: 2 – 1 – 3
    const cols = [[1, 300, 250, '#E3ECF8'], [0, 534, 330, '#FFD36B'], [2, 768, 200, '#FFC9A3']];
    const base = 840;
    cols.forEach(([i, cx, h, color]) => {
        const r = rows[i];
        if (!r) return;
        const w = 210;
        g.fillStyle = color; rr(g, cx - w / 2, base - h, w, h, 34); g.fill();
        g.fillStyle = INK; g.font = `700 60px ${FONT}`; g.fillText(String(r.points), cx, base - h + 92);
        g.fillStyle = 'rgba(87,64,73,.7)'; g.font = `500 28px ${FONT}`; g.fillText(`${r.correct} câu đúng`, cx, base - h + 136);
        const ay = base - h - 78;
        g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, ay, 66, 0, 7); g.fill();
        g.strokeStyle = color; g.lineWidth = 8; g.stroke();
        g.font = `64px ${FONT}`; g.textBaseline = 'middle'; g.fillStyle = INK; g.fillText(r.member?.emoji || shortName(r.name, 2), cx, ay + 4); g.textBaseline = 'alphabetic';
        g.fillStyle = ROSE; g.beginPath(); g.arc(cx + 54, ay - 54, 26, 0, 7); g.fill();
        g.fillStyle = '#fff'; g.font = `700 30px ${FONT}`; g.fillText(String(r.rank), cx + 54, ay - 43);
        g.fillStyle = INK; g.font = `600 32px ${FONT}`; g.fillText(fit(g, shortName(r.name, 14), 220), cx, base + 48);
    });

    const me = rows.find(r => r.member?.uid === room.user?.uid);
    if (me) {
        g.fillStyle = '#FDE8F0'; rr(g, 114, 930, 840, 230, 40); g.fill();
        g.fillStyle = INK; g.font = `700 44px ${FONT}`; g.fillText(`Hạng ${me.rank}/${rows.length} · ${me.points} điểm`, W / 2 - 6, 998);
        const acc = me.answered ? Math.round(100 * me.correct / me.answered) : 0;
        [[`${me.correct}/${me.answered}`, 'câu trúng'], [`${acc}%`, 'chính xác'], [String(me.best), 'chuỗi dài nhất']].forEach(([v, l], k) => {
            const x = 264 + k * 270;
            g.fillStyle = ROSE; g.font = `700 54px ${FONT}`; g.fillText(v, x, 1088);
            g.fillStyle = MUTED; g.font = `500 26px ${FONT}`; g.fillText(l, x, 1128);
        });
    }
    g.fillStyle = ROSE; g.font = `600 30px ${FONT}`; g.fillText(`Zitthenkne · phòng ${room.roomId}`, W / 2 - 6, 1216);
    return cv;
}
async function shareResult(btn) {
    btn.disabled = true;
    try {
        const cv = await resultCanvas();
        if (!cv) return showToast('Chưa có ai trả lời nên chưa có gì để chia sẻ.', 'info');
        const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
        if (!blob) throw new Error('toBlob');
        const file = new File([blob], `ket-qua-${room.roomId}.png`, { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) {
            try { await navigator.share({ files: [file], title: 'Kết quả đánh đề' }); return; }
            catch (e) { if (e?.name === 'AbortError') return; }       // người dùng đóng bảng chia sẻ thì thôi; lỗi khác rơi xuống tải về
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = file.name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        showToast('Đã lưu ảnh kết quả vào máy.', 'success');
    } catch (e) {
        console.error(e);
        showToast('Không tạo được ảnh, thử lại nhé.', 'error');
    } finally { btn.disabled = false; }
}
function initShare() {
    el('quiz-result')?.addEventListener('click', (e) => {
        const b = e.target.closest('#result-share-btn');
        if (b) shareResult(b);
    });
}

// ---------- 8. Menu Thêm: hàng "Hay dùng" tự học theo thói quen ----------
const USE_KEY = 'roomMoreUse';
function initFavs() {
    const sheet = el('m-more');
    if (!sheet) return;
    const use = () => { try { return JSON.parse(lsGet(USE_KEY) || '{}'); } catch (e) { return {}; } };
    const paint = () => {
        sheet.querySelector('.rm-more-fav')?.remove();
        const u = use();
        const top = Object.entries(u).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3)
            .map(([k]) => sheet.querySelector(`.rm-more-grid [data-more="${k}"]`)).filter(Boolean);
        if (top.length < 2) return;
        const box = document.createElement('div');
        box.className = 'rm-more-fav';
        box.innerHTML = '<p class="rm-more-cap">Hay dùng</p><div class="rm-more-grid"></div>';
        top.forEach(b => box.lastElementChild.appendChild(b.cloneNode(true)));
        sheet.querySelector('.rm-sheet-grip').after(box);
    };
    sheet.addEventListener('click', (e) => {
        const b = e.target.closest('[data-more]');
        if (!b) return;
        const u = use();
        u[b.dataset.more] = (u[b.dataset.more] || 0) + 1;
        lsSet(USE_KEY, JSON.stringify(u));
    }, true);
    new MutationObserver(() => { if (!sheet.classList.contains('hidden')) paint(); }).observe(sheet, { attributes: true, attributeFilter: ['class'] });
    paint();
}

// ---------- 9. Bàn luận: chạm đúp = 👍 · vuốt phải = trả lời ----------
// Chỉ bấm hộ NÚT CÓ SẴN (👍 / ↩) của dòng ý kiến hay tin chat nên mọi luật cũ (đổi like, quote trả lời…) giữ nguyên.
function initGestures() {
    const ITEM = 'li.rm-cmt, .rm-msg';
    const SKIP = 'button, a, input, textarea, select, [contenteditable="true"], .rm-cform, img';
    const like = (it) => it.querySelector('[data-agree], [data-like]');
    const reply = (it) => it.querySelector('[data-reply-to], [data-reply]');
    const pop = (x, y, ch) => {
        const n = document.createElement('span');
        n.className = 'rm-heartpop'; n.textContent = ch; n.style.left = x + 'px'; n.style.top = y + 'px';
        document.body.appendChild(n);
        setTimeout(() => n.remove(), 900);
    };
    let tapT = 0, tapX = 0, tapY = 0, tapEl = null;
    let sx = 0, sy = 0, sEl = null, dx = 0, swiping = false;
    document.addEventListener('touchstart', (e) => {
        sEl = null; swiping = false;
        if (e.touches.length !== 1) return;
        const it = e.target.closest?.(ITEM);
        if (!it || e.target.closest(SKIP)) return;
        sEl = it; sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = 0;
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
        if (!sEl) return;
        dx = e.touches[0].clientX - sx;
        const dy = e.touches[0].clientY - sy;
        if (!swiping && (Math.abs(dy) > 12 || dx < -12)) { sEl.style.translate = ''; sEl = null; return; }     // đang cuộn dọc / vuốt trái: bỏ
        if (dx > 14 && reply(sEl)) {
            swiping = true;
            sEl.classList.add('is-swiping');
            sEl.style.translate = Math.min(70, dx * .6) + 'px 0';
            sEl.classList.toggle('is-armed', dx > 80);
        }
    }, { passive: true });
    document.addEventListener('touchend', (e) => {
        const t = e.changedTouches[0];
        if (sEl && swiping) {
            const armed = dx > 80, it = sEl;
            it.classList.remove('is-swiping', 'is-armed');
            it.style.translate = '';
            sEl = null; swiping = false;
            if (armed) { haptic(10); reply(it)?.click(); }
            return;
        }
        if (sEl) sEl = null;
        // chạm đúp
        const it = e.target.closest?.(ITEM);
        if (!it || e.target.closest(SKIP) || Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) { tapT = 0; return; }
        const now = Date.now();
        if (tapEl === it && now - tapT < 320 && Math.hypot(t.clientX - tapX, t.clientY - tapY) < 28) {
            tapT = 0;
            const b = like(it);
            if (b) { if (!b.classList.contains('on')) b.click(); haptic(12); pop(t.clientX, t.clientY, '👍'); }
            return;
        }
        tapT = now; tapX = t.clientX; tapY = t.clientY; tapEl = it;
    }, { passive: true });
}

// ---------- 10. Hộp thoại chung (bản 68): Esc đóng · tiêu điểm vào trong rồi trả về chỗ cũ · role=dialog ----------
// Trước đây Biên bản / Chia sẻ / Tài liệu / Dán đề / Thao tác thành viên không đóng được bằng Esc, và tiêu điểm vẫn ở nút phía sau
// (người dùng bàn phím gõ Tab là chạy vào trang bên dưới). Hộp nhập tên (name-modal) bắt buộc điền nên KHÔNG đóng bằng Esc.
const MODALS = ['doc-modal', 'paste-modal', 'minutes-modal', 'share-modal', 'member-sheet', 'help-modal'];
const modalOpen = (m) => !!m && !m.classList.contains('hidden') && getComputedStyle(m).display !== 'none';
function initModals() {
    const back = {};
    MODALS.forEach((id) => {
        const m = el(id), box = m?.querySelector('.rm-modal-box');
        if (!m || !box) return;
        box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.tabIndex = -1;
        const h = box.querySelector('h3, h2');
        if (h) { h.id ||= id + '-title'; box.setAttribute('aria-labelledby', h.id); }
        new MutationObserver(() => {
            if (modalOpen(m)) {
                if (id in back) return;
                back[id] = document.activeElement;
                setTimeout(() => { if (!m.contains(document.activeElement)) (box.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([disabled]), textarea') || box).focus({ preventScroll: true }); }, 50);
            } else if (id in back) {
                const o = back[id]; delete back[id];
                if (o && o !== document.body && o.isConnected && !modalOpen(el('find-modal'))) o.focus({ preventScroll: true });
            }
        }).observe(m, { attributes: true, attributeFilter: ['class'] });
    });
    // Bản 69: hộp thoại đang mở thì phím thường KHÔNG được lọt xuống trang phía sau — trước đây gõ Space / N / F / Z / M khi đang đọc Biên bản
    // vẫn chốt đáp án, sang câu cho cả phòng, bật toàn màn hình… (bắt ở window, pha capture: chạy trước mọi phím tắt của trang)
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.key === 'Tab' || e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
        if (Array.from(document.querySelectorAll('.rm-modal')).some(modalOpen)) e.stopPropagation();
    }, true);
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
        const top = MODALS.map(el).filter(modalOpen).pop();         // hộp nằm sau cùng trong trang = hộp mở sau cùng
        if (!top) return;
        e.preventDefault();
        (top.querySelector('.rm-modal-x') || top).click();           // bấm nút ✕ (hoặc nền mờ) để mỗi hộp tự dọn theo cách của nó
    });
}

export function initPolish() {
    initModals();
    initHeaderAway();
    initWakeLock();
    initDockInd();
    initStrike();
    initPinch();
    initSpeak();
    initShare();
    initFavs();
    initGestures();
}
