// room-boost.js — lớp "tiện ích + cảm giác dùng" của phòng đánh đề.
// Gom những thứ không dính tới dữ liệu Firestore: âm thanh phản hồi, rung nhẹ,
// gợn sóng khi bấm, chế độ tập trung, tìm nhanh câu hỏi, bảng phím tắt, chip mất mạng.
// Tách riêng để các module chính (state/members/quiz) không phình thêm.
import { room, hasSession } from './room-state.js';
import { showToast } from '../../core/utils.js';
import { effectiveIndex, setViewIndex, toggleRace } from './room-quiz-stage.js';
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
/** Đọc Excel: 269KB, chỉ chủ trì mở đề mới cần. */
export const ensureXlsx = () => (window.XLSX
    ? Promise.resolve()
    : loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'));

/** Rung nhẹ trên điện thoại (máy không hỗ trợ thì im lặng bỏ qua). */
export const haptic = (ms = 8) => { try { navigator.vibrate?.(ms); } catch (e) {} };

// --- Tự chuyển sang câu chưa chọn sau khi bạn chọn xong ---
const AUTO_KEY = 'roomAutoNext';
export const autoNextOn = () => { try { return localStorage.getItem(AUTO_KEY) === '1'; } catch (e) { return false; } };
function paintAutoLabel() {
    const n = el('auto-label');
    if (n) n.textContent = 'Tự chuyển câu: ' + (autoNextOn() ? 'bật' : 'tắt');
}
function toggleAutoNext() {
    try { localStorage.setItem(AUTO_KEY, autoNextOn() ? '0' : '1'); } catch (e) {}
    paintAutoLabel();
    showToast(autoNextOn() ? 'Chọn xong sẽ tự nhảy tới câu chưa làm.' : 'Đã tắt tự chuyển câu.', 'info', 2200);
}

function paintSoundLabel() {
    const s = el('sound-label');
    if (s) s.textContent = soundOn ? 'Âm thanh: bật' : 'Âm thanh: tắt';
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
const ZEN_KEY = 'roomZen';
export function toggleZen(force) {
    const on = force === undefined ? !document.body.classList.contains('zen') : !!force;
    document.body.classList.toggle('zen', on);
    try { localStorage.setItem(ZEN_KEY, on ? '1' : '0'); } catch (e) {}
    window.dispatchEvent(new Event('resize'));
}

// ---------------- Chip mất mạng / có mạng lại ----------------
function initNetChip() {
    const chip = el('net-chip');
    const text = el('net-text');
    if (!chip) return;
    const paint = () => {
        if (navigator.onLine) {
            chip.classList.add('is-back');
            if (text) text.textContent = 'Đã kết nối lại';
            setTimeout(() => chip.classList.add('hidden'), 2600);
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
const KEYS = [
    ['1–9 · A–D', 'Chọn phương án'],
    ['← →', 'Câu trước / câu sau (của riêng bạn)'],
    ['J', 'Nhảy tới câu chưa chọn tiếp theo'],
    ['Home / End', 'Về câu đầu / câu cuối'],
    ['Ctrl K', 'Tìm nhanh câu hỏi'],
    ['Z', 'Chế độ tập trung'],
    ['M', 'Bật / tắt âm thanh'],
    ['F', 'Trình chiếu'],
    ['?', 'Bảng phím tắt này'],
    ['S', 'Chủ trì: hiện đáp án tham khảo'],
    ['Space', 'Chủ trì: chốt theo đa số'],
    ['N', 'Chủ trì: câu tiếp'],
    ['G', 'Chủ trì: rủ cả phòng bàn câu này'],
    ['Shift ← →', 'Chủ trì: dời câu cả phòng đang bàn'],
];
function openHelp() {
    const box = el('help-modal');
    const list = el('help-list');
    if (!box || !list) return;
    list.innerHTML = KEYS.map(([k, v]) => `<div class="rm-help-row"><span>${v}</span><kbd class="rm-kbd">${k}</kbd></div>`).join('');
    box.classList.remove('hidden');
}

// ---------------- Tìm nhanh câu hỏi (Ctrl+K) ----------------
let findPick = 0;
const plain = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const fold = (s) => plain(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');

function findRows(q) {
    const qs = room.session?.questions || [];
    const needle = fold(q);
    const num = /^\d+$/.test(q.trim()) ? Number(q.trim()) - 1 : null;
    return qs.map((_, i) => i)
        .filter(i => {
            if (!needle) return true;
            if (num !== null && i === num) return true;
            return fold(room.session.questions[i]?.question).includes(needle);
        })
        .slice(0, 60);
}

function paintFind() {
    const list = el('find-list');
    const input = el('find-input');
    if (!list || !input) return;
    const rows = findRows(input.value);
    const me = room.members.find(m => m.uid === room.user?.uid);
    if (!rows.length) {
        list.innerHTML = '<p class="rm-find-empty">Không thấy câu nào khớp.</p>';
        return;
    }
    findPick = Math.max(0, Math.min(findPick, rows.length - 1));
    list.innerHTML = rows.map((i, k) => {
        const done = !!me?.answers?.['q' + i];
        const chosen = typeof room.session?.chosen?.['q' + i] === 'number';
        return `<button class="rm-find-item ${k === findPick ? 'on' : ''} ${done ? 'done' : ''}" data-find="${i}">
            <span class="rm-find-num">${i + 1}</span>
            <span class="flex-1 min-w-0 truncate">${escapeHtml(plain(room.session.questions[i]?.question).slice(0, 90) || '(chưa có nội dung)')}</span>
            ${chosen ? '<span class="rm-kbd">đã chốt</span>' : done ? '<span class="rm-kbd">đã chọn</span>' : ''}
        </button>`;
    }).join('');
    list.querySelector('.rm-find-item.on')?.scrollIntoView({ block: 'nearest' });
}

function openFind() {
    if (!hasSession()) return;
    const box = el('find-modal');
    const input = el('find-input');
    if (!box || !input) return;
    box.classList.remove('hidden');
    input.value = '';
    findPick = 0;
    paintFind();
    setTimeout(() => input.focus(), 60);
}
const closeFind = () => el('find-modal')?.classList.add('hidden');

function gotoFound(i) {
    closeFind();
    setViewIndex(i);
    el('stage-quiz')?.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------------- Khởi tạo ----------------
export function initBoost() {
    paintSoundLabel();
    paintAutoLabel();
    document.addEventListener('pointerdown', () => { if (soundOn) ctx(); }, { once: true });
    initRipple();
    initNetChip();
    try { if (localStorage.getItem(ZEN_KEY) === '1') document.body.classList.add('zen'); } catch (e) {}

    // Chip nhắc thoát chế độ tập trung
    if (!el('zen-chip')) {
        const chip = document.createElement('button');
        chip.id = 'zen-chip';
        chip.className = 'rm-zen-chip';
        chip.innerHTML = '<i class="fas fa-feather"></i>Chế độ tập trung — bấm để thoát';
        chip.addEventListener('click', () => toggleZen(false));
        document.body.appendChild(chip);
    }

    // Menu công cụ ở đầu trang
    const menu = el('room-menu');
    el('room-menu-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        menu?.classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#room-menu') && !e.target.closest('#room-menu-btn')) menu?.classList.add('hidden');
    });
    menu?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-tool]');
        if (!b) return;
        menu.classList.add('hidden');
        runTool(b.dataset.tool);
    });

    // Hộp tìm câu
    el('find-input')?.addEventListener('input', () => { findPick = 0; paintFind(); });
    el('find-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'find-modal') return closeFind();
        const b = e.target.closest('[data-find]');
        if (b) gotoFound(Number(b.dataset.find));
    });
    el('find-input')?.addEventListener('keydown', (e) => {
        const rows = findRows(el('find-input').value);
        if (e.key === 'ArrowDown') { e.preventDefault(); findPick = Math.min(findPick + 1, rows.length - 1); paintFind(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); findPick = Math.max(findPick - 1, 0); paintFind(); }
        else if (e.key === 'Enter') { e.preventDefault(); if (rows[findPick] !== undefined) gotoFound(rows[findPick]); }
        else if (e.key === 'Escape') closeFind();
    });

    el('help-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'help-modal' || e.target.closest('[data-close-help]')) el('help-modal').classList.add('hidden');
    });

    // Phím tắt của lớp tiện ích (không đụng phím của module đề)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'k' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); return openFind(); }
        if (isTyping(e.target)) return;
        if (e.key === '?') return openHelp();
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key.toLowerCase();
        if (k === 'z') return toggleZen();
        if (k === 'm') return toggleSound();
        if (k === 'j') return jumpToUnanswered();
        if (hasSession() && (e.key === 'Home' || e.key === 'End')) {
            e.preventDefault();
            return setViewIndex(e.key === 'Home' ? 0 : room.session.questions.length - 1);
        }
        if (e.key === 'Escape') {
            closeFind();
            el('help-modal')?.classList.add('hidden');
            el('question-map')?.classList.add('hidden');
        }
    });

    // Menu "Thêm" của điện thoại gọi sang đây
    window.addEventListener('room:tool', (e) => runTool(e.detail));

    // Mách nước một lần: nhiều người không biết có phím tắt
    try {
        if (!localStorage.getItem('roomTipSeen')) {
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
    if (name === 'race') return toggleRace();
}

/** Câu chưa chọn tiếp theo (vòng lại từ đầu). Dùng cho phím J và chip "còn N câu". */
export function jumpToUnanswered() {
    if (!hasSession()) return;
    const total = room.session.questions.length;
    const me = room.members.find(m => m.uid === room.user?.uid);
    const cur = effectiveIndex();
    for (let s = 1; s <= total; s++) {
        const i = (cur + s) % total;
        if (!me?.answers?.['q' + i]) {
            setViewIndex(i);
            el('stage-quiz')?.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
    }
}
