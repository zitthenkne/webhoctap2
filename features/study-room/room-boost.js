// room-boost.js — lớp "tiện ích + cảm giác dùng" của phòng đánh đề.
// Gom những thứ không dính tới dữ liệu Firestore: âm thanh phản hồi, rung nhẹ,
// gợn sóng khi bấm, chế độ tập trung, tìm nhanh câu hỏi, bảng phím tắt, chip mất mạng.
// Tách riêng để các module chính (state/members/quiz) không phình thêm.
import { room, hasSession, doneOf, questionAt, isEssay, subscribe, optsOf, isAnnounced, canControl } from './room-state.js';
import { stripOptionLabels } from '../quiz/quiz-helpers.js';
import { isSpeaking } from '../quiz/page/quiz-voice.js';
import { showToast } from '../../core/utils.js';
import { effectiveIndex, setViewIndex, toggleRace, raceHidden } from './room-quiz-stage.js';
import { focusHub, gotoNotebook, toggleNotebookRail } from './room-answer.js';
import { escapeHtml } from './room-ui.js';

const el = (id) => document.getElementById(id);
const isTyping = (t) => !!(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable));

// ---------------- Âm thanh phản hồi (WebAudio, không tải file) ----------------
const SOUND_KEY = 'roomSound';
let soundOn = true;
let actx = null;

try { soundOn = localStorage.getItem(SOUND_KEY) !== '0'; } catch (e) {}

// AudioContext chỉ được tạo sau một cú chạm của người dùng (luật của trình duyệt)
function ctx() {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    return actx;
}

const TONES = {
    tap:  [[520, .05, .035]],
    good: [[660, .09, .05], [880, .12, .05]],
    bad:  [[300, .16, .05]],
    lock: [[440, .07, .045], [560, .1, .045]],
    join: [[720, .06, .03], [960, .08, .03]],
};

/** Tiếng "tinh" ngắn. kind: tap | good | bad | lock | join */
export function beep(kind = 'tap') {
    if (!soundOn) return;
    const seq = TONES[kind] || TONES.tap;
    try {
        const c = ctx();
        seq.forEach(([hz, dur, vol], k) => {
            const t0 = c.currentTime + k * 0.075;
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = 'sine';
            osc.frequency.value = hz;
            gain.gain.setValueAtTime(0.0001, t0);
            gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
            osc.connect(gain).connect(c.destination);
            osc.start(t0);
            osc.stop(t0 + dur + 0.02);
        });
    } catch (e) {}
}

// ---------------- Nạp thư viện KHI CẦN (không nằm trên đường tải trang) ----------------
const scripts = Object.create(null);
export function loadScript(src) {
    if (scripts[src]) return scripts[src];
    scripts[src] = new Promise((res, rej) => {
        const sc = document.createElement('script');
        sc.src = src;
        sc.onload = res;
        sc.onerror = rej;
        document.head.appendChild(sc);
    });
    return scripts[src];
}
/** Pháo giấy: chỉ tải khi thật sự ăn mừng lần đầu (~4KB). */
export const ensureConfetti = () => (window.confetti
    ? Promise.resolve()
    : loadScript('https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js')).catch(() => {});
/** Biên bản buổi học (room-minutes.js 57KB): chỉ nạp khi có người mở hộp xuất. */
let minutesMod = null;
export function openMinutes() {
    minutesMod ||= import('./room-minutes.js').then(m => { m.initMinutes(); return m; });
    minutesMod.then(m => m.openMinutes()).catch(() => {
        minutesMod = null;
        showToast('Không tải được phần biên bản — kiểm tra mạng rồi thử lại.', 'error');
    });
}
/** Đọc Excel: 269KB, chỉ chủ trì mở đề mới cần. */
export const ensureXlsx = () => (window.XLSX
    ? Promise.resolve()
    : loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'));

/** Rung nhẹ trên điện thoại (máy không hỗ trợ thì im lặng bỏ qua). */
// Một công tắc "Âm thanh" lo cả tiếng lẫn rung (nhãn trong menu ghi "tiếng + rung") — trước đây tắt âm thanh mà máy vẫn rung.
export const haptic = (ms = 8) => { if (!soundOn) return; try { navigator.vibrate?.(ms); } catch (e) {} };

// --- Tự chuyển sang câu chưa chọn sau khi bạn chọn xong ---
const AUTO_KEY = 'roomAutoNext';
export const autoNextOn = () => { try { return localStorage.getItem(AUTO_KEY) === '1'; } catch (e) { return false; } };
function paintAutoLabel() { paintToolStates(); }
// Bám câu nhóm đang bàn (bản 45): chế độ cùng làm vẫn tự do, nhưng ai bật thì chủ trì dời câu là mình tới theo
const FOLLOW_KEY = 'roomFollow';
export const followOn = () => { try { return localStorage.getItem(FOLLOW_KEY) === '1'; } catch (e) { return false; } };
function paintFollowLabel() { paintToolStates(); }
function toggleFollow() {
    try { localStorage.setItem(FOLLOW_KEY, followOn() ? '0' : '1'); } catch (e) {}
    paintFollowLabel();
    showToast(followOn() ? '📍 Chủ trì chuyển câu là bạn tự tới câu đó.' : 'Đã tắt bám câu — bạn tự đi câu như thường.', 'info', 2400);
    if (followOn()) window.dispatchEvent(new CustomEvent('room:follow'));
}

// Ghi chú cụm từ (bản 53, room-notes.js): mặc định HIỆN nội dung ngay cạnh chữ; tắt thì chỉ còn bong bóng nhỏ (rê chuột / bấm để xem).
// Lưu theo máy. Mặc định bật nên class đảo chiều (body.rm-notes-off): chưa chạy JS vẫn đúng, khỏi nháy.
const NOTES_KEY = 'roomNotesInline';
export const notesInlineOn = () => { try { return localStorage.getItem(NOTES_KEY) !== '0'; } catch (e) { return true; } };
function paintNotes() {
    const on = notesInlineOn();
    document.body.classList.toggle('rm-notes-off', !on);
    const m = el('notes-sub');
    if (m) m.textContent = on ? 'hiện cạnh chữ' : 'chỉ còn bong bóng';
    paintToolStates();
}
function toggleNotes() {
    try { localStorage.setItem(NOTES_KEY, notesInlineOn() ? '0' : '1'); } catch (e) {}
    paintNotes();
    showToast(notesInlineOn() ? 'Ghi chú cụm từ hiện ngay cạnh chữ.' : 'Đã ẩn nội dung ghi chú — chỉ còn bong bóng nhỏ cạnh chữ.', 'info', 2400);
}

function toggleAutoNext() {
    try { localStorage.setItem(AUTO_KEY, autoNextOn() ? '0' : '1'); } catch (e) {}
    paintAutoLabel();
    showToast(autoNextOn() ? 'Chọn xong sẽ tự nhảy tới câu chưa làm.' : 'Đã tắt tự chuyển câu.', 'info', 2200);
}

function paintSoundLabel() { paintToolStates(); }

// ---------------- Trạng thái các công tắc trong menu ⋮ và khay Thêm (bản 60) ----------------
// Mỗi nút có data-sw="<tên>" được tô .is-on + aria-checked/pressed theo nguồn sự thật bên dưới; nút có data-need="session" mờ đi khi chưa có phiên.
const TOOL_STATE = {
    sound: () => soundOn,
    autonext: () => autoNextOn(),
    follow: () => followOn(),
    notes: () => notesInlineOn(),
    speak: () => isSpeaking(),
    zen: () => document.body.classList.contains('zen'),
    present: () => document.body.classList.contains('present'),
    race: () => !raceHidden(),
    theme: () => document.documentElement.classList.contains('theme-dark'),
};
export function paintToolStates() {
    document.querySelectorAll('[data-sw]').forEach(n => {
        const on = !!TOOL_STATE[n.dataset.sw]?.();
        n.classList.toggle('is-on', on);
        n.setAttribute(n.getAttribute('role') === 'menuitemcheckbox' ? 'aria-checked' : 'aria-pressed', String(on));
    });
    // Tooltip gốc được giữ lại (trước đây lúc có phiên bị xóa sạch -> mất lời giải thích của Dải tiến độ, Nghe đọc, Biên bản…)
    const tip = (n, t) => {
        if (n.dataset.t0 === undefined) n.dataset.t0 = n.getAttribute('title') || '';
        if (t) n.title = t; else if (n.dataset.t0) n.title = n.dataset.t0; else n.removeAttribute('title');
    };
    const live = hasSession();
    document.querySelectorAll('[data-need="session"]').forEach(n => {
        n.disabled = !live;
        tip(n, live ? '' : 'Chỉ dùng được khi đang có phiên đánh đề');
    });
    // Chủ trì / chủ phòng luôn ở câu của nhóm -> "Bám câu nhóm" vô nghĩa với họ (công tắc bật cũng chẳng làm gì): khóa kèm lý do
    const lead = live && canControl();
    document.querySelectorAll('[data-tool="follow"], [data-more="follow"]').forEach(n => {
        n.disabled = lead;
        tip(n, lead ? 'Bạn đang là chủ trì — câu nhóm đang bàn chính là câu bạn đang ở' : '');
    });
    const lb = el('text-size-label'), ts = document.querySelector('[data-more="text"] small');
    if (lb && ts) ts.textContent = lb.textContent;
}
function toggleSound() {
    soundOn = !soundOn;
    try { localStorage.setItem(SOUND_KEY, soundOn ? '1' : '0'); } catch (e) {}
    paintSoundLabel();
    if (soundOn) beep('good');
}

// ---------------- Gợn sóng khi bấm (cảm giác nút "ăn" tay) ----------------
const RIPPLE_SEL = '.rm-option, .rm-cta, .rm-solid-btn, .rm-dock-btn, .rm-dock-main, .rm-host-btn, .rm-ghost-btn, .rm-pip, .rm-tab';
function initRipple() {
    document.addEventListener('pointerdown', (e) => {
        const b = e.target.closest?.(RIPPLE_SEL);
        if (!b || b.disabled) return;
        const r = b.getBoundingClientRect();
        const size = Math.max(r.width, r.height) * 0.6;
        const dot = document.createElement('span');
        dot.className = 'rm-ripple';
        dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
        if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
        b.appendChild(dot);
        setTimeout(() => dot.remove(), 560);
    }, { passive: true });
}

// ---------------- Chế độ tập trung ----------------
// Bản 62: làm đúng nghĩa "tập trung" — ẩn đầu trang, lời ghim, bàn luận, phiếu của nhóm (tránh bị dắt mũi) và thông báo; xem CSS BẢN 62.
// Nhớ theo TAB (sessionStorage): đóng tab mở lại là về bình thường, khỏi ngơ ngác vì giao diện thiếu đồ.
const ZEN_KEY = 'roomZen';
let zenTimer = 0;
function zenIntro() {
    const t = el('zen-chip-txt');
    if (!t) return;
    t.textContent = 'Đã ẩn bàn luận, phiếu của nhóm và thông báo';
    clearTimeout(zenTimer);
    zenTimer = setTimeout(() => { t.textContent = 'Đang tập trung'; }, 4200);
}
export function toggleZen(force) {
    const on = force === undefined ? !document.body.classList.contains('zen') : !!force;
    document.body.classList.toggle('zen', on);
    try { sessionStorage.setItem(ZEN_KEY, on ? '1' : '0'); } catch (e) {}
    window.dispatchEvent(new Event('resize'));
    paintToolStates();
    if (on) zenIntro();
}

// ---------------- Chip mất mạng / có mạng lại ----------------
function initNetChip() {
    const chip = el('net-chip');
    const text = el('net-text');
    if (!chip) return;
    let hideT = 0;
    const paint = () => {
        clearTimeout(hideT);          // sóng chập chờn (mất → có → mất): hẹn giờ ẩn của lần "có lại" không được tắt luôn chip "Mất mạng" của lần sau
        if (navigator.onLine) {
            chip.classList.add('is-back');
            if (text) text.textContent = 'Đã kết nối lại';
            hideT = setTimeout(() => { if (navigator.onLine) chip.classList.add('hidden'); }, 2600);
        } else {
            chip.classList.remove('hidden', 'is-back');
            if (text) text.textContent = 'Mất mạng · sẽ gửi lại khi có sóng';
        }
    };
    window.addEventListener('offline', paint);
    window.addEventListener('online', paint);
    if (!navigator.onLine) paint();
}

// ---------------- Bảng phím tắt ----------------
// Bảng hướng dẫn (bản 65): nhóm theo ngữ cảnh thay vì một danh sách phẳng 25 dòng; máy cảm ứng mở thẻ "Cử chỉ" trước (điện thoại không có phím).
const KEYS = [
    ['Làm bài', [
        ['1–9 · A–D', 'Chọn phương án'],
        ['R', 'Viết lý do của bạn (ô mình chọn)'],
        ['W', 'Câu tự luận: gõ vào bài làm chung'],
        ['E', 'Sổ tay: viết giải thích'],
        ['D', 'Tới khối Đáp án & bàn luận (nhận xét)'],
        ['O', 'Mở / thu gọn cột sổ tay'],
        ['Bôi đen chữ → nút 📝', 'Ghi chú ngắn (≤ 10 từ) ngay cạnh cụm từ — cả phòng thấy; bấm chip để sửa / xóa'],
        ['Bấm mặt người ở đầu trang', 'Tới chỗ bạn ấy đang xem / đang sửa'],
    ]],
    ['Đi câu', [
        ['← →', 'Câu trước / câu sau (của riêng bạn)'],
        ['J', 'Nhảy tới câu chưa chọn tiếp theo'],
        ['Home / End', 'Về câu đầu / câu cuối'],
        ['Ctrl K', 'Tìm câu theo chữ trong câu hỏi hoặc đáp án'],
    ]],
    ['Giao diện', [
        ['Z', 'Chế độ tập trung'],
        ['M', 'Bật / tắt âm thanh + rung'],
        ['F', 'Trình chiếu'],
        ['Esc', 'Đóng hộp đang mở; không còn gì thì thoát tập trung / trình chiếu'],
        ['?', 'Bảng này'],
    ]],
    ['Chủ trì', [
        ['S', 'Hiện đáp án tham khảo'],
        ['Space', 'Chốt nhanh (theo thói quen của đề); đã chốt rồi thì Space = câu tiếp'],
        ['Giữ nút Chốt · chuột phải', 'Bảng chọn cách chốt (A–D · đa số · file · chưa thống nhất)'],
        ['N', 'Câu tiếp'],
        ['G', 'Rủ cả phòng bàn câu này'],
        ['Shift ← →', 'Dời câu cả phòng đang bàn'],
    ]],
    ['Sảnh chờ', [
        ['R', 'Bật / tắt "Tôi sẵn sàng"'],
        ['I', 'Mời bạn (link + QR)'],
        ['Enter', 'Chủ trì: bắt đầu cho cả phòng'],
    ]],
];
const GESTURES = [
    ['Đi câu', [
        ['Vuốt ngang', 'Câu trước / câu sau (của riêng bạn)'],
        ['Kéo ngón trên thanh câu', 'Chạy qua các câu: kéo chậm đi từng câu, kéo nhanh nhảy xa'],
        ['Chạm "Câu 21/60"', 'Mở bản đồ câu — lọc theo chưa chọn, cờ, đánh dấu…'],
    ]],
    ['Làm bài', [
        ['Giữ một ô đáp án', 'Gạch ô để loại trừ (chỉ mình bạn thấy)'],
        ['Chạm 2 lần vào chữ', 'Sửa nội dung ngay tại chỗ'],
        ['Bôi đen chữ', 'Ghi chú ngắn (≤ 10 từ) cạnh cụm từ — cả phòng thấy'],
        ['Chụm hai ngón', 'Chỉnh cỡ chữ'],
    ]],
    ['Bàn luận', [
        ['Chạm 2 lần vào nhận xét', 'Thả 👍'],
        ['Vuốt phải nhận xét', 'Trả lời nhận xét đó'],
    ]],
    ['Chủ trì', [
        ['Giữ nút Chốt', 'Bảng chọn cách chốt (A–D · đa số · file · chưa thống nhất)'],
    ]],
];
let helpTab = 'gesture';
function openHelp(tab) {
    const box = el('help-modal');
    const list = el('help-list');
    if (!box || !list) return;
    const touch = matchMedia('(pointer: coarse)').matches;
    helpTab = touch ? (tab || helpTab) : 'keys';              // chuột + bàn phím: cử chỉ cảm ứng vô nghĩa -> chỉ phím tắt
    const gest = helpTab === 'gesture';
    list.innerHTML = (gest ? GESTURES : KEYS).map(([title, rows]) => `<section class="rm-help-sec"><p class="rm-help-cap">${title}</p>${rows.map(([k, v]) => `<div class="rm-help-row"><span>${v}</span><kbd class="rm-kbd">${k}</kbd></div>`).join('')}</section>`).join('');
    list.classList.toggle('is-gest', gest);
    el('help-title').textContent = gest ? 'Cử chỉ' : 'Phím tắt';
    el('help-sub').innerHTML = gest ? 'Mở lại bằng nút <b>Thêm</b> → <b>Cử chỉ</b>.' : 'Bấm <kbd class="rm-kbd">?</kbd> bất cứ lúc nào để mở lại bảng này.';
    const tabs = el('help-tabs');
    tabs?.classList.toggle('hidden', !touch);
    tabs?.querySelectorAll('[data-help-tab]').forEach(b => { const on = b.dataset.helpTab === helpTab; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    box.classList.remove('hidden');
    list.scrollTop = 0;
}

// ---------------- Tìm nhanh câu hỏi (Ctrl+K) ----------------
let findPick = 0;
const plain = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
export const fold = (s) => plain(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');

// Bản 63: tìm cả trong ĐÁP ÁN và tên ca lâm sàng (nhớ cụm trong phương án nhưng quên câu), lọc Chưa chọn / Đã chốt,
// gõ số câu thì câu đó lên đầu, không còn cắt âm thầm ở 60 câu.
let findFilter = 'all';
const FIND_KEEP = {
    all: () => true,
    todo: (i, me) => !doneOf(me, i),
    locked: (i) => typeof room.session?.chosen?.['q' + i] === 'number',
};
const LETTERS = 'ABCDEFGH';
const foldCh = (c) => c.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');

function findRows(q) {
    const me = room.members.find(m => m.uid === room.user?.uid);
    const needle = fold(q);
    const num = /^\d+$/.test(q.trim()) ? Number(q.trim()) - 1 : null;
    const keep = FIND_KEEP[findFilter] || FIND_KEEP.all;
    const rows = [];
    (room.session?.questions || []).forEach((_, i) => {
        if (!keep(i, me)) return;
        const qu = questionAt(i);
        const text = plain(qu?.question);
        if (!needle) return void rows.push({ i, text });
        const byNum = i === num;
        if (fold(text).includes(needle)) return void rows.push({ i, text, byNum });
        const ct = plain(qu?.caseTitle);
        if (ct && fold(ct).includes(needle)) return void rows.push({ i, text, sub: ct, tag: 'Ca', byNum });
        const opts = stripOptionLabels(optsOf(qu)).map(plain);
        const k = opts.findIndex(o => fold(o).includes(needle));
        if (k >= 0) return void rows.push({ i, text, sub: opts[k], tag: LETTERS[k] || String(k + 1), byNum });
        if (byNum) rows.push({ i, text, byNum });
    });
    return num === null ? rows : [...rows.filter(r => r.byNum), ...rows.filter(r => !r.byNum)];
}

/** Tô đậm đoạn khớp: dò trên bản bỏ dấu, cắt trên bản gốc; chuỗi dài thì cắt quanh chỗ khớp. */
function markHit(text, needle, max = 90) {
    let at = -1, end = -1;
    if (needle) {
        let f = ''; const map = [];
        for (let k = 0; k < text.length; k++) for (const c of foldCh(text[k])) { map.push(k); f += c; }
        const p = f.indexOf(needle);
        if (p >= 0) { at = map[p]; end = map[p + needle.length - 1] + 1; }
    }
    let from = 0;
    if (at > 40) from = at - 30;
    const shown = text.slice(from, from + max);
    const lead = from > 0 ? '…' : '';
    const tail = from + max < text.length ? '…' : '';
    if (at < 0 || at - from >= max) return escapeHtml(shown) + tail;
    const a = at - from, b = Math.min(end - from, shown.length);
    return lead + escapeHtml(shown.slice(0, a)) + '<mark>' + escapeHtml(shown.slice(a, b)) + '</mark>' + escapeHtml(shown.slice(b)) + tail;
}

function paintFind() {
    const list = el('find-list');
    const input = el('find-input');
    if (!list || !input) return;
    const rows = findRows(input.value);
    const me = room.members.find(m => m.uid === room.user?.uid);
    const total = room.session?.questions?.length || 0;
    const needle = fold(input.value);
    const cnt = el('find-count');
    if (cnt) cnt.textContent = (needle || findFilter !== 'all') ? `${rows.length}/${total} câu` : `${total} câu`;
    document.querySelectorAll('#find-modal [data-ff]').forEach(b => { const on = b.dataset.ff === findFilter; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    if (!rows.length) {
        list.innerHTML = findFilter !== 'all' && !needle
            ? `<p class="rm-find-empty">${findFilter === 'todo' ? 'Bạn đã chọn hết mọi câu.' : 'Chưa có câu nào được chốt.'}</p>`
            : `<p class="rm-find-empty">Không thấy câu nào khớp${findFilter !== 'all' ? ' trong bộ lọc này' : ''}.</p>`;
        return;
    }
    findPick = Math.max(0, Math.min(findPick, rows.length - 1));
    const cur = effectiveIndex();
    list.innerHTML = rows.map((r, k) => {
        const done = doneOf(me, r.i);
        const chosen = typeof room.session?.chosen?.['q' + r.i] === 'number';
        const badge = chosen ? 'đã chốt' : done ? 'đã chọn' : '';
        return `<button type="button" class="rm-find-item ${k === findPick ? 'on' : ''} ${done ? 'done' : ''} ${r.i === cur ? 'cur' : ''}" data-find="${r.i}"${r.i === cur ? ' aria-current="true"' : ''}>
            <span class="rm-find-num">${r.i + 1}</span>
            <span class="rm-find-txt">
                <span class="rm-find-q">${r.text ? markHit(r.text, needle) : '(chưa có nội dung)'}</span>
                ${r.sub ? `<span class="rm-find-sub"><b>${r.tag}</b>${markHit(r.sub, needle, 80)}</span>` : ''}
            </span>
            ${r.i === cur ? '<span class="rm-kbd">đang xem</span>' : ''}${badge ? `<span class="rm-kbd">${badge}</span>` : ''}
        </button>`;
    }).join('');
    list.querySelector('.rm-find-item.on')?.scrollIntoView({ block: 'nearest' });
}

function openFind() {
    if (!hasSession()) return;
    const box = el('find-modal');
    const input = el('find-input');
    if (!box || !input) return;
    findBack = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    box.classList.remove('hidden');
    input.value = '';
    findPick = 0;
    findFilter = 'all';
    paintFind();
    fitFind();
    setTimeout(() => input.focus(), 60);
}
let findBack = null;
/** Bàn phím ảo che danh sách (iOS không co khung nhìn): đo visualViewport rồi chừa chỗ cho danh sách. */
function fitFind() {
    const vv = window.visualViewport;
    el('find-modal')?.style.setProperty('--find-vh', (vv ? vv.height : innerHeight) + 'px');
}
function closeFind() {
    const box = el('find-modal');
    if (!box || box.classList.contains('hidden')) return;
    box.classList.add('hidden');
    if (findBack?.isConnected) findBack.focus({ preventScroll: true });
    findBack = null;
}

function gotoFound(i) {
    closeFind();
    setViewIndex(i);
    el('stage-quiz')?.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------------- Khởi tạo ----------------
export function initBoost() {
    paintSoundLabel();
    paintAutoLabel();
    paintNotes();
    document.addEventListener('pointerdown', () => { if (soundOn) ctx(); }, { once: true });
    initRipple();
    initNetChip();
    try { if (sessionStorage.getItem(ZEN_KEY) === '1') document.body.classList.add('zen'); } catch (e) {}

    // Chip nhắc thoát chế độ tập trung
    if (!el('zen-chip')) {
        const chip = document.createElement('button');
        chip.id = 'zen-chip';
        chip.className = 'rm-zen-chip';
        chip.type = 'button';
        chip.title = 'Thoát chế độ tập trung (phím Z hoặc Esc)';
        chip.innerHTML = '<i class="fas fa-feather"></i><span id="zen-chip-txt">Đang tập trung</span><em>Thoát</em>';
        chip.addEventListener('click', () => toggleZen(false));
        document.body.appendChild(chip);
    }

    // Menu công cụ ở đầu trang
    const menu = el('room-menu');
    const menuBtn = el('room-menu-btn');
    const menuItems = () => [...(menu?.querySelectorAll('.rm-menu-item:not(:disabled)') || [])];
    const setMenu = (on, focusFirst = false) => {
        if (!menu) return;
        menu.classList.toggle('hidden', !on);
        menuBtn?.setAttribute('aria-expanded', String(on));
        if (on) { paintToolStates(); if (focusFirst) menuItems()[0]?.focus(); }
    };
    menuBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        setMenu(menu.classList.contains('hidden'), e.detail === 0);          // detail 0 = mở bằng bàn phím -> đưa tiêu điểm vào menu
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#room-menu') && !e.target.closest('#room-menu-btn')) setMenu(false);
    });
    menu?.addEventListener('click', (e) => {
        const b = e.target.closest('.rm-menu-item');
        if (!b || b.disabled) return;
        // Công tắc (data-keep) KHÔNG đóng menu — bật / tắt nhiều mục liền; các mục khác đóng như cũ.
        // Cỡ chữ / sáng tối / trình chiếu có listener riêng theo id (study-room-main.js) chạy TRƯỚC (nút con), nên vẽ lại trạng thái ở nhịp sau.
        if (!b.hasAttribute('data-keep')) setMenu(false);
        if (b.dataset.tool) runTool(b.dataset.tool);
        setTimeout(paintToolStates, 0);
    });
    menu?.addEventListener('keydown', (e) => {
        const items = menuItems();
        const k = items.indexOf(document.activeElement);
        const go = (n) => { e.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
        if (e.key === 'ArrowDown') go(k + 1);
        else if (e.key === 'ArrowUp') go(k < 0 ? -1 : k - 1);
        else if (e.key === 'Home') go(0);
        else if (e.key === 'End') go(-1);
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setMenu(false); menuBtn?.focus(); }
        else if (e.key === 'Tab') setMenu(false);
    });
    el('m-more')?.addEventListener('click', () => setTimeout(paintToolStates, 0));
    if (el('m-more')) new MutationObserver(() => { if (!el('m-more').classList.contains('hidden')) paintToolStates(); }).observe(el('m-more'), { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('room:textscale', () => setTimeout(paintToolStates, 0));
    subscribe(() => { if (menu && !menu.classList.contains('hidden')) paintToolStates(); });
    paintToolStates();

    // Hộp tìm câu
    el('find-input')?.addEventListener('input', () => { findPick = 0; paintFind(); });
    window.visualViewport?.addEventListener('resize', fitFind);
    el('find-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'find-modal') return closeFind();
        const f = e.target.closest('[data-ff]');
        if (f) { findFilter = f.dataset.ff; findPick = 0; paintFind(); return void el('find-input')?.focus({ preventScroll: true }); }
        const b = e.target.closest('[data-find]');
        if (b) gotoFound(Number(b.dataset.find));
    });
    el('find-input')?.addEventListener('keydown', (e) => {
        if (e.isComposing || e.keyCode === 229) return;                    // Enter của bộ gõ Telex/VNI là chốt từ, chưa phải "đi tới câu"
        const rows = findRows(el('find-input').value);
        if (e.key === 'ArrowDown') { e.preventDefault(); findPick = Math.min(findPick + 1, rows.length - 1); paintFind(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); findPick = Math.max(findPick - 1, 0); paintFind(); }
        else if (e.key === 'Enter') { e.preventDefault(); if (rows[findPick] !== undefined) gotoFound(rows[findPick].i); }
        else if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
    });

    el('help-modal')?.addEventListener('click', (e) => {
        const t = e.target.closest('[data-help-tab]');
        if (t) return openHelp(t.dataset.helpTab);
        if (e.target.id === 'help-modal' || e.target.closest('[data-close-help]')) el('help-modal').classList.add('hidden');
    });

    // Phím tắt của lớp tiện ích (không đụng phím của module đề)
    document.addEventListener('keydown', (e) => {
        // Esc đóng menu ⋮ dù tiêu điểm đang ở nút ⋮ (mở bằng chuột) hay ở trong menu — rồi trả tiêu điểm về nút
        if (e.key === 'Escape' && menu && !menu.classList.contains('hidden')) { e.preventDefault(); setMenu(false); menuBtn?.focus(); return; }
        if (e.key === 'k' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); return openFind(); }
        if (isTyping(e.target)) return;
        if (e.key === '?') return openHelp('keys');
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key.toLowerCase();
        if (k === 'z') return toggleZen();
        if (k === 'm') return toggleSound();
        if (k === 'j') return jumpToUnanswered();
        if (k === 'd' && hasSession()) { e.preventDefault(); return void focusHub(); }
        // Sổ tay (bản 27): E viết giải thích · R viết lý do của bạn · O mở / thu cột sổ tay
        if (k === 'e' && hasSession()) { e.preventDefault(); return void gotoNotebook('exp'); }
        if (k === 'o' && hasSession()) { e.preventDefault(); return void toggleNotebookRail(); }
        if (k === 'r' && hasSession() && !el('quiz-live')?.classList.contains('hidden')) {
            const w = document.querySelector('#options-area [data-live-edit="why"]');
            if (!w) return void showToast('Chọn một đáp án trước rồi mới ghi lý do nhé.', 'info', 1600);
            e.preventDefault();
            w.scrollIntoView({ block: 'center', behavior: 'smooth' });
            return void w.focus();
        }
        if (k === 'w' && hasSession() && isEssay(questionAt(effectiveIndex()))) {
            const n = document.querySelector('#answer-block [data-live-edit="explain"]');
            if (n) { e.preventDefault(); n.scrollIntoView({ block: 'center', behavior: 'smooth' }); n.focus(); }
            return;
        }
        if (hasSession() && (e.key === 'Home' || e.key === 'End')) {
            e.preventDefault();
            return setViewIndex(e.key === 'Home' ? 0 : room.session.questions.length - 1);
        }
        if (e.key === 'Escape') {
            const open = !el('find-modal')?.classList.contains('hidden') || !el('help-modal')?.classList.contains('hidden') || !el('question-map')?.classList.contains('hidden');
            closeFind();
            el('help-modal')?.classList.add('hidden');
            el('question-map')?.classList.add('hidden');
            if (!open && document.body.classList.contains('zen')) toggleZen(false);       // không còn gì để đóng -> Esc thoát chế độ tập trung
        }
    });

    // Menu "Thêm" của điện thoại gọi sang đây
    window.addEventListener('room:tool', (e) => runTool(e.detail));

    if (matchMedia('(pointer: coarse)').matches) { const h = document.querySelector('[data-tool="help"] .rm-menu-lb'); if (h) h.textContent = 'Cử chỉ & phím tắt'; }      // iPad: cùng bảng, mở thẻ Cử chỉ trước
    paintFollowLabel();
    // Mách nước một lần: nhiều người không biết có phím tắt (máy cảm ứng không có bàn phím -> khỏi mách)
    try {
        if (!localStorage.getItem('roomTipSeen') && !matchMedia('(pointer: coarse)').matches) {
            localStorage.setItem('roomTipSeen', '1');
            setTimeout(() => showToast('Mẹo: bấm ? xem phím tắt · Ctrl K tìm câu · Z tập trung', 'info', 5000), 2500);
        }
    } catch (e) {}
}

export function runTool(name) {
    if (name === 'find') return openFind();
    if (name === 'help') return openHelp();
    if (name === 'zen') return toggleZen();
    if (name === 'sound') return toggleSound();
    if (name === 'autonext') return toggleAutoNext();
    if (name === 'follow') return toggleFollow();
    if (name === 'notes') return toggleNotes();
    if (name === 'race') return toggleRace();
    if (name === 'speak') return void window.dispatchEvent(new Event('room:speak'));      // room-polish.js
    if (name === 'minutes') return void window.dispatchEvent(new Event('room:minutes'));
}

/** Câu chưa chọn tiếp theo (vòng lại từ đầu). Dùng cho phím J và chip "còn N câu".
 *  openOnly (tự chuyển câu): bỏ qua câu đã chốt — nhảy tới câu không chọn được nữa là vô ích. Hết câu thì nói một câu thay vì im lặng. */
export function jumpToUnanswered({ openOnly = false } = {}) {
    if (!hasSession()) return;
    const total = room.session.questions.length;
    const me = room.members.find(m => m.uid === room.user?.uid);
    const cur = effectiveIndex();
    let missed = 0;
    for (let s = 1; s <= total; s++) {
        const i = (cur + s) % total;
        if (doneOf(me, i)) continue;
        if (openOnly && isAnnounced(i)) { missed++; continue; }
        setViewIndex(i);
        el('stage-quiz')?.scrollTo({ top: 0, behavior: 'smooth' });
        return;
    }
    showToast(missed ? `Hết câu cần chọn. Còn ${missed} câu đã chốt mà bạn chưa chọn (bấm "Còn ${missed}" để xem).` : 'Bạn đã chọn hết mọi câu.', 'info', 2600);
}
