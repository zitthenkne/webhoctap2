// File: features/quiz/page/quiz-sound.js
// Bộ âm thanh của trang làm bài (WebAudio, không file âm thanh nào): 4 bộ âm (Chuông / Marimba / Điện tử / Giọt nước),
// âm lượng, phạm vi (đầy đủ / chỉ đúng-sai-kết quả) và ~20 sự kiện (đúng có thang âm leo theo chuỗi, sai, chọn, chuyển câu,
// đánh dấu, gạch đáp án, ghi chú, hoàn tác, mốc tiến độ, đếm giờ, vào/ra tập trung, kết quả theo bậc điểm...).
// File này KHÔNG import gì (tránh vòng phụ thuộc): quiz-page-prefs.js re-export sfx/getSound cho chỗ gọi cũ.

const LS = { on: 'quiz_sound', pack: 'quiz_sound_pack', vol: 'quiz_sound_vol', scope: 'quiz_sound_scope', off: 'quiz_sound_off' };
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };

export const PACKS = [
    { id: 'chime', name: 'Chuông' },
    { id: 'marimba', name: 'Marimba' },
    { id: 'pixel', name: 'Điện tử' },
    { id: 'drop', name: 'Giọt nước' }
];
// Nhóm âm thanh: bật/tắt riêng từng nhóm (chip trong bảng Ngựa thì chỉnh). Lưu danh sách nhóm TẮT ở quiz_sound_off.
export const GROUPS = [
    { id: 'answer', name: 'Đáp án', ev: ['correct', 'wrong', 'pick', 'toggleOn', 'toggleOff', 'undo', 'strike', 'unstrike', 'srsFar'], demo: 'correct' },
    { id: 'nav', name: 'Chuyển câu', ev: ['next', 'prev'], demo: 'next' },
    { id: 'timer', name: 'Đồng hồ', ev: ['timerTick', 'timerWarn', 'timeUp'], demo: 'timerWarn' },
    { id: 'notes', name: 'Ghi chú, đánh dấu', ev: ['noteSave', 'mark', 'unmark'], demo: 'mark' },
    { id: 'result', name: 'Kết quả', ev: ['finish', 'scoreTick', 'stamp'], demo: 'finish' },
    { id: 'extra', name: 'Hiệu ứng khác', ev: ['milestone', 'ui', 'focusOn', 'focusOff', 'breakStart', 'breakEnd'], demo: 'milestone' }
];
const GROUP_OF = {};
GROUPS.forEach(g => g.ev.forEach(e => { GROUP_OF[e] = g.id; }));
function offGroups() {
    const raw = lsGet(LS.off);
    if (raw === null) return lsGet(LS.scope) === 'basic' ? ['nav', 'notes', 'extra'] : [];   // bản cũ "chỉ đúng/sai" → tắt các nhóm phụ
    return raw ? raw.split(',').filter(Boolean) : [];
}
export function isGroupOn(id) { return !offGroups().includes(id); }
export function setGroupOn(id, on) {
    const off = offGroups().filter(x => x !== id);
    if (!on) off.push(id);
    lsSet(LS.off, off.join(','));
}

export function getSound() { return lsGet(LS.on) === '1'; }
export function setSound(on) { lsSet(LS.on, on ? '1' : '0'); }
export function getPack() { const p = lsGet(LS.pack); return PACKS.some(x => x.id === p) ? p : 'chime'; }
export function setPack(id) { if (PACKS.some(x => x.id === id)) lsSet(LS.pack, id); }
export function getVolume() { const v = parseInt(lsGet(LS.vol), 10); return isNaN(v) ? 70 : Math.max(0, Math.min(100, v)); }
export function setVolume(v) { lsSet(LS.vol, String(Math.max(0, Math.min(100, Math.round(v))))); applyVolume(); }

/* ------------------------------------------------------------------ máy phát */
let ctx = null, master = null, comp = null, noiseBuf = null;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function applyVolume() {
    if (!master || !ctx) return;
    const v = getVolume() / 100;
    master.gain.setTargetAtTime(v * v * 0.9, ctx.currentTime, 0.02);   // đường cong bình phương: thanh trượt nghe đều tai
}
function engine() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => { }); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    comp = ctx.createDynamicsCompressor();            // nhiều nốt chồng nhau không vỡ tiếng
    comp.threshold.value = -18; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
    master.connect(comp).connect(ctx.destination);
    applyVolume();
    return ctx;
}
// iOS/Safari chỉ cho phát tiếng sau một cú chạm thật: mở khóa ở lần chạm đầu tiên của trang
if (typeof window !== 'undefined') {
    const unlock = () => { try { if (getSound()) engine(); } catch (e) { } };
    ['pointerdown', 'keydown'].forEach(t => window.addEventListener(t, unlock, { once: true, capture: true }));
}

// Một nốt: bao hình (attack → decay mũ) + âm sắc theo bộ âm
function note(m, at, dur, vel, pack, opt = {}) {
    const c = ctx, t = c.currentTime + at, f = mtof(m);
    const out = c.createGain();
    if (opt.pan && c.createStereoPanner) { const pn = c.createStereoPanner(); pn.pan.value = opt.pan; out.connect(pn).connect(master); }
    else out.connect(master);
    const att = opt.att || (pack === 'pixel' ? 0.004 : 0.008);
    const peak = Math.max(0.0002, vel * (opt.gain || 0.22));
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(peak, t + att);
    if (pack === 'pixel') {                               // 8-bit: giữ phẳng rồi cắt gọn
        out.gain.setValueAtTime(peak * 0.8, t + dur * 0.7);
        out.gain.linearRampToValueAtTime(0.0001, t + dur);
    } else {
        out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
    const parts = pack === 'marimba' ? [['triangle', 1, 1], ['sine', 4, 0.22]]
        : pack === 'pixel' ? [['square', 1, 0.5]]
            : pack === 'drop' ? [['sine', 1, 1]]
                : [['sine', 1, 1], ['sine', 2.01, 0.32], ['sine', 3.02, 0.1]];   // chuông: hài bậc 2, 3
    parts.forEach(([type, mul, amp]) => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = type;
        if (pack === 'drop') {                              // giọt nước: tần số rơi nhanh từ cao xuống
            o.frequency.setValueAtTime(f * 1.7, t);
            o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
        } else {
            o.frequency.value = f * mul;
            if (opt.slide) o.frequency.exponentialRampToValueAtTime(f * mul * Math.pow(2, opt.slide / 12), t + dur * 0.8);
        }
        g.gain.value = amp;
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + dur + 0.05);
    });
}

// Tiếng "vút" (nhiễu lọc dải quét tần): chuyển câu
function swish(at, up, vel, pack, pan = 0) {
    if (pack === 'pixel') { note(up ? 84 : 72, at, 0.05, vel * 1.2, pack, { pan }); note(up ? 91 : 65, at + 0.045, 0.06, vel * 1.2, pack, { pan }); return; }
    const c = ctx, t = c.currentTime + at;
    if (!noiseBuf) {
        noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.4), c.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = c.createBufferSource(); src.buffer = noiseBuf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(up ? 500 : 2200, t);
    bp.frequency.exponentialRampToValueAtTime(up ? 2200 : 500, t + 0.13);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel * 0.16, t + 0.035);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    if (pan && c.createStereoPanner) { const pn = c.createStereoPanner(); pn.pan.value = pan; src.connect(bp).connect(g).connect(pn).connect(master); }
    else src.connect(bp).connect(g).connect(master);
    src.start(t); src.stop(t + 0.18);
}

/* ------------------------------------------------------------------ sự kiện */
const PENTA = [0, 2, 4, 7, 9];
const climb = (streak) => {                                // chuỗi đúng càng dài, nốt gốc càng cao (tối đa ~2 quãng tám)
    const d = Math.min(Math.max(streak, 1) - 1, 9);
    return 72 + PENTA[d % 5] + 12 * Math.floor(d / 5);
};

const EVENTS = {
    correct(p, o) {
        const s = o.streak || 1, m = climb(s);
        note(m, 0, 0.2, 1, p); note(m + 4, 0.085, 0.26, 1, p);
        if (s >= 3) note(m + 12, 0.17, 0.3, 0.8, p);                         // chuỗi 3+: thêm nốt lấp lánh quãng tám trên
        if (s >= 5) { note(m + 7, 0.17, 0.34, 0.55, p); note(m + 16, 0.25, 0.38, 0.6, p); }
        if (s >= 10) { note(m + 19, 0.33, 0.5, 0.55, p); }
    },
    wrong(p, o) {
        note(62, 0, 0.2, 0.9, p, { slide: -2 }); note(56, 0.1, 0.34, 0.8, p, { slide: -3 });
        if (o.lost >= 3) { note(52, 0.3, 0.3, 0.5, p); note(47, 0.42, 0.3, 0.5, p); note(40, 0.54, 0.55, 0.5, p); }   // đang có chuỗi ≥3 mà sai: nốt trầm kéo xuống thêm
    },
    pick(p) { note(79, 0, 0.07, 0.55, p); },
    // Ôn ngắt quãng: câu đúng được hẹn ≥ 7 ngày sau → ba nốt lên nối vào sau tiếng đúng ("nhớ lâu rồi")
    srsFar(p) { note(84, 0.45, 0.22, 0.6, p); note(88, 0.53, 0.22, 0.6, p); note(91, 0.61, 0.5, 0.6, p); },
    toggleOn(p) { note(81, 0, 0.07, 0.5, p); },
    toggleOff(p) { note(74, 0, 0.07, 0.45, p); },
    next(p) { swish(0, true, 0.9, p, 0.4); },       // sang phải
    prev(p) { swish(0, false, 0.9, p, -0.4); },     // sang trái
    mark(p) { note(76, 0, 0.12, 0.7, p); note(83, 0.07, 0.2, 0.7, p); },
    unmark(p) { note(83, 0, 0.1, 0.5, p); note(74, 0.06, 0.16, 0.5, p); },
    strike(p) { note(71, 0, 0.09, 0.6, p, { slide: -6 }); },
    unstrike(p) { note(65, 0, 0.09, 0.55, p, { slide: 6 }); },
    noteSave(p) { note(88, 0, 0.05, 0.4, p); note(84, 0.04, 0.09, 0.4, p); },
    undo(p) { note(79, 0, 0.08, 0.55, p); note(74, 0.06, 0.08, 0.55, p); note(67, 0.12, 0.14, 0.55, p); },
    milestone(p) { note(72, 0, 0.3, 0.8, p); note(76, 0.09, 0.3, 0.8, p); note(79, 0.18, 0.34, 0.8, p); note(84, 0.27, 0.5, 0.7, p); },
    ui(p) { note(84, 0, 0.035, 0.4, p); },
    timerTick(p, o) { const r = o.remaining || 10; note(r <= 5 ? 88 : 84, 0, 0.05, r <= 3 ? 0.9 : 0.5, p, { gain: 0.16 }); },
    timerWarn(p) { note(79, 0, 0.16, 0.8, p); note(79, 0.2, 0.2, 0.8, p); },
    timeUp(p) { note(79, 0, 0.26, 0.9, p); note(72, 0.22, 0.28, 0.9, p); note(65, 0.44, 0.5, 0.9, p); },
    focusOn(p) { note(60, 0, 0.5, 0.6, p, { att: 0.09 }); note(67, 0.14, 0.6, 0.6, p, { att: 0.09 }); },
    focusOff(p) { note(67, 0, 0.4, 0.55, p, { att: 0.05 }); note(60, 0.12, 0.5, 0.55, p, { att: 0.05 }); },
    breakStart(p) { note(72, 0, 0.5, 0.6, p, { att: 0.05 }); note(79, 0.22, 0.7, 0.55, p, { att: 0.05 }); },
    breakEnd(p) { note(67, 0, 0.3, 0.6, p); note(72, 0.12, 0.3, 0.6, p); note(76, 0.24, 0.5, 0.6, p); },
    // Công bố điểm hệ 4: mỗi nấc 0,5 chạy qua là một tiếng "tách" cao dần (quiz-ui.js đếm số), số dừng lại thì con dấu "cộp", rồi tới nhạc theo bậc
    scoreTick(p, o) { const i = o.i || 0; note(72 + PENTA[i % 5] + 12 * Math.floor(i / 5), 0, 0.09, 0.45, p, { gain: 0.14 }); },
    stamp(p) { note(48, 0, 0.18, 0.9, p); note(55, 0.02, 0.14, 0.5, p); },
    // Kết quả theo bậc điểm hệ 4 (≥3,5 giỏi → hợp âm lên; ≥3 khá → bộ ba lên; ≥2 vừa → hai nốt; thấp hơn → nhẹ nhàng đi xuống rồi về chủ âm)
    finish(p, o) {
        const pct = typeof o.gpa4 === 'number' ? (o.gpa4 >= 3.5 ? 95 : o.gpa4 >= 3 ? 75 : o.gpa4 >= 2 ? 55 : 0) : (typeof o.pct === 'number' ? o.pct : 0);
        if (pct >= 90) { [72, 76, 79, 84].forEach((m, i) => note(m, i * 0.11, 0.45, 0.9, p)); [72, 76, 79, 84].forEach(m => note(m, 0.52, 0.9, 0.55, p)); note(96, 0.6, 0.8, 0.45, p); }
        else if (pct >= 70) { [72, 76, 79].forEach((m, i) => note(m, i * 0.12, 0.4, 0.85, p)); note(84, 0.4, 0.6, 0.7, p); }
        else if (pct >= 50) { note(67, 0, 0.3, 0.8, p); note(72, 0.16, 0.5, 0.8, p); }
        else { note(67, 0, 0.35, 0.7, p); note(64, 0.2, 0.35, 0.7, p); note(60, 0.4, 0.7, 0.7, p); }
    }
};

let lastAt = {};
// Phát một sự kiện. Trả về true nếu có phát. force: bỏ qua công tắc (nghe thử trong bảng thiết lập).
export function sfx(name, opts = {}) {
    try {
        if (!opts.force) {
            if (!getSound()) return false;
            if (GROUP_OF[name] && !isGroupOn(GROUP_OF[name])) return false;
        }
        const fn = EVENTS[name];
        if (!fn || getVolume() === 0) return false;
        const now = Date.now(), gap = name === 'timerTick' ? 0 : 45;
        if (now - (lastAt[name] || 0) < gap) return false;     // chống bắn đôi (một cú bấm đi qua 2 trình xử lý)
        lastAt[name] = now;
        if (!engine()) return false;
        fn(opts.pack || getPack(), opts);
        return true;
    } catch (e) { return false; }                              // trình duyệt không hỗ trợ WebAudio -> bỏ qua
}

// Nghe thử bộ âm trong bảng thiết lập: đúng (chuỗi 4) rồi sai
export function previewSound(pack) {
    sfx('correct', { force: true, streak: 4, pack });
    setTimeout(() => sfx('wrong', { force: true, pack }), 520);
}


/* ------------------------------------------------------------------ âm nền (nhiễu nâu / mưa / gió) */
// Sinh bằng WebAudio (không file): bộ đệm nhiễu 5 giây lặp vòng qua bộ lọc; âm lượng RIÊNG, nối thẳng vào bộ nén (không chịu công tắc Âm thanh).
// Chỉ phát khi đang làm bài + tab đang hiện (syncAmbient do quiz-boost.js gọi); vào/ra mờ dần.
const LSA = { kind: 'quiz_amb', vol: 'quiz_amb_vol' };
export const AMBIENTS = [
    { id: 'off', name: 'Tắt' },
    { id: 'brown', name: 'Nhiễu nâu' },
    { id: 'rain', name: 'Mưa' },
    { id: 'wind', name: 'Gió' }
];
export function getAmbient() { const k = lsGet(LSA.kind); return AMBIENTS.some(x => x.id === k) ? k : 'off'; }
export function setAmbient(id) { lsSet(LSA.kind, AMBIENTS.some(x => x.id === id) ? id : 'off'); }
export function getAmbientVol() { const v = parseInt(lsGet(LSA.vol), 10); return isNaN(v) ? 40 : Math.max(0, Math.min(100, v)); }
export function setAmbientVol(v) {
    lsSet(LSA.vol, String(Math.max(0, Math.min(100, Math.round(v)))));
    if (amb && ctx) amb.g.gain.setTargetAtTime(ambLevel(amb.kind), ctx.currentTime, 0.1);
}
let amb = null;
const ambBufs = {};
const ambLevel = (kind) => { const v = getAmbientVol() / 100; return v * v * (kind === 'rain' ? 0.22 : kind === 'wind' ? 0.5 : 0.4); };
function ambBuffer(kind) {
    if (ambBufs[kind]) return ambBufs[kind];
    const sr = ctx.sampleRate, len = sr * 5, b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'rain') d[i] = w;
        else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }   // nhiễu nâu: tích phân nhiễu trắng
    }
    const x = Math.floor(sr * 0.15);                                    // trộn đuôi về đầu để chỗ nối vòng lặp không "tách"
    for (let i = 0; i < x; i++) { const t = i / x; d[len - x + i] = d[len - x + i] * (1 - t) + d[i] * t; }
    return (ambBufs[kind] = b);
}
function startAmbient() {
    const kind = getAmbient();
    if (kind === 'off') { stopAmbient(); return; }
    if (!engine()) return;
    if (amb && amb.kind === kind) { amb.g.gain.setTargetAtTime(ambLevel(kind), ctx.currentTime, 0.4); return; }
    stopAmbient();
    const src = ctx.createBufferSource(); src.buffer = ambBuffer(kind); src.loop = true;
    const f = ctx.createBiquadFilter(), g = ctx.createGain(), extra = [];
    g.gain.value = 0.0001;
    if (kind === 'rain') { f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 0.45; }
    else if (kind === 'brown') { f.type = 'lowpass'; f.frequency.value = 1100; }
    else {                                                              // gió: lọc thấp có tần số cắt lắc chậm
        f.type = 'lowpass'; f.frequency.value = 450;
        const lfo = ctx.createOscillator(), lg = ctx.createGain();
        lfo.frequency.value = 0.11; lg.gain.value = 260;
        lfo.connect(lg).connect(f.frequency); lfo.start(); extra.push(lfo);
    }
    src.connect(f).connect(g).connect(comp);
    src.start();
    g.gain.setTargetAtTime(ambLevel(kind), ctx.currentTime, 0.6);
    amb = { kind, src, g, extra };
}
function stopAmbient() {
    if (!amb) return;
    const a = amb; amb = null;
    a.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.25);
    setTimeout(() => { try { a.src.stop(); a.extra.forEach(o => o.stop()); } catch (e) { } }, 1200);
}
// active = đang làm bài. Gọi lại bất cứ lúc nào (idempotent): đổi loại / tắt / ẩn tab đều tự khớp.
export function syncAmbient(active) {
    try { if (active && document.visibilityState === 'visible' && getAmbient() !== 'off') startAmbient(); else stopAmbient(); } catch (e) { }
}
