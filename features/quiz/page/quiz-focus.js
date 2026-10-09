// File: features/quiz/page/quiz-focus.js
// CHẾ ĐỘ TẬP TRUNG v2 (2026-10-07). Lớp ngoài quiz-ui.js toggleFocusMode (hàm đó chỉ bật/tắt lớp .focus-mode-active rồi bắn
// sự kiện 'quiz-focus-change'); mọi thứ ở đây chỉ NGHE sự kiện đó:
//   1. Thanh tập trung mảnh trên đỉnh: vạch tiến độ + câu x/y + thời gian đã tập trung + đồng hồ đếm ngược; tự ẩn khi không động tay
//   2. Gỡ mọi thứ gây xao nhãng (logo, nút ngựa mờ dần, meme, confetti, thông báo thường, ảnh nền) — phần CSS ở §24 quiz-stationery.css
//   3. Toàn màn hình (nút trên thanh; nhớ lựa chọn cho lần sau)
//   4. Ghi chú nhanh (phím Q): sổ ghi chú trượt lên từ đáy, không phải cuộn xuống tìm
//   5. Nhắc nghỉ mắt kiểu 20-20-20 (bài tính giờ thì KHÔNG chặn) + tổng kết lúc thoát (phút, số câu, tổng hôm nay)
//   6. Esc thoát; tải lại trang (F5) giữa bài vẫn ở chế độ tập trung

import { showToast } from '../../../core/utils.js';
import { state } from '../quiz-state.js';
import { sfx, getSound } from './quiz-page-prefs.js';
import { setSound, AMBIENTS, getAmbient, setAmbient, syncAmbient } from './quiz-sound.js';
import { openQuickNote, closeQuickNote, readNotes } from './quiz-notes-panel.js';
import { togglePause } from './quiz-session.js';

const LS = { fs: 'quiz_focus_fs', brk: 'quiz_focus_break', log: 'quiz_focus_log', auto: 'quiz_focus_auto', w: 'quiz_focus_width' };
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };
const $ = (id) => document.getElementById(id);

export const SS_KEY = 'quizFocus';                       // sessionStorage: đang tập trung → F5 vẫn tập trung
const BREAK_SECONDS = 20;

const root = document.documentElement;
const canFs = !!(root.requestFullscreen || root.webkitRequestFullscreen);
const inFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
const swallow = (p) => { if (p && p.catch) p.catch(() => { }); };
const enterFs = () => { try { swallow((root.requestFullscreen || root.webkitRequestFullscreen).call(root)); } catch (e) { } };
const exitFs = () => { try { swallow((document.exitFullscreen || document.webkitExitFullscreen).call(document)); } catch (e) { } };

const answeredIdx = () => state.userAnswers.map((a, i) => (a !== null && a !== undefined ? i : -1)).filter(i => i >= 0);
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const widthPref = () => { const v = lsGet(LS.w); return v === '1' || v === '3' ? v : '2'; };
function applyWidth(on) {
    const cl = document.body.classList;
    cl.remove('fm-w-1', 'fm-w-3');
    if (on && widthPref() !== '2') cl.add('fm-w-' + widthPref());
}

// Điện thoại / máy tính bảng dọc: thanh đáy trượt xuống khi cuộn xuống, hiện lại khi cuộn lên hoặc chạm sát đáy (chỉ trong chế độ tập trung)
let awayY = 0;
const navAway = () => {
    const cl = document.body.classList;
    if (window.innerWidth >= 1024) { cl.remove('fm-nav-away'); return; }
    const y = window.scrollY, dy = y - awayY;
    if (y < 80 || dy < -8) { cl.remove('fm-nav-away'); awayY = y; }
    else if (dy > 12) { cl.add('fm-nav-away'); awayY = y; }
};
const navReveal = (e) => { if (e.clientY > window.innerHeight - 90) document.body.classList.remove('fm-nav-away'); };

export const isFocusAuto = () => lsGet(LS.auto) === '1';
const getBreakMin = () => { const v = parseFloat(lsGet(LS.brk)); return isNaN(v) ? 25 : v; };   // số lẻ chỉ để kiểm thử (0.05 = 3 giây)

let bar = null, tickT = 0, idleT = 0, mo = null, rafId = 0;
let focusSec = 0, sinceBreak = 0, startAnswered = new Set(), leaving = false, breakEl = null, breakT = 0, lastMove = 0;

/* ---------------------------------------------------------------- thanh tập trung */
function buildBar() {
    bar = document.createElement('div');
    bar.id = 'focus-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Thanh tập trung');
    bar.innerHTML = `
        <div class="fb-prog" aria-hidden="true"><i id="fb-prog-fill"></i></div>
        <div class="fb-inner">
            <span class="fb-count" id="fb-count"></span>
            <span class="fb-time" id="fb-time" title="Thời gian tập trung phiên này"><i class="fas fa-clock"></i> <b>0:00</b></span>
            <span class="fb-timer" id="fb-timer" hidden title="Thời gian còn lại"><i class="fas fa-stopwatch"></i> <b></b></span>
            <span class="fb-spacer"></span>
            <button type="button" id="fb-w" title="Độ rộng khung đọc" aria-label="Độ rộng khung đọc"><i class="fas fa-arrows-left-right"></i></button>
            <button type="button" id="fb-break" title="Nghỉ mắt ngay" aria-label="Nghỉ mắt ngay"><i class="fas fa-mug-hot"></i></button>
            <button type="button" id="fb-note" title="Ghi chú nhanh (Q)" aria-label="Ghi chú nhanh"><i class="fas fa-sticky-note"></i><span class="fb-dot" hidden></span></button>
            <button type="button" id="fb-font-" class="fb-font" title="Chữ nhỏ lại" aria-label="Chữ nhỏ lại"><i class="fas fa-font"></i><sub>−</sub></button>
            <button type="button" id="fb-font+" class="fb-font" title="Chữ to lên" aria-label="Chữ to lên"><i class="fas fa-font"></i><sup>+</sup></button>
            <button type="button" id="fb-amb" title="Âm nền" aria-label="Đổi âm nền"><i class="fas fa-wave-square"></i></button>
            <button type="button" id="fb-sound" title="Âm thanh (S)" aria-label="Bật tắt âm thanh"><i class="fas fa-volume-up"></i></button>
            <button type="button" id="fb-fs" title="Toàn màn hình" aria-label="Toàn màn hình"><i class="fas fa-expand"></i></button>
            <button type="button" id="fb-exit" title="Thoát tập trung (Esc)"><i class="fas fa-xmark"></i> Thoát</button>
        </div>`;
    document.body.appendChild(bar);
    if (!canFs) $('fb-fs').hidden = true;
    $('fb-exit').addEventListener('click', () => $('focus-mode-btn')?.click());
    $('fb-note').addEventListener('click', () => (document.body.classList.contains('fm-note-open') ? closeQuickNote() : openQuickNote()));
    $('fb-sound').addEventListener('click', () => { const on = !getSound(); setSound(on); if (on) sfx('ui'); syncBar(); });
    // Âm nền: bấm để đổi vòng Tắt → Nhiễu nâu → Mưa → Gió
    $('fb-amb').addEventListener('click', () => {
        const ids = AMBIENTS.map(a => a.id);
        setAmbient(ids[(ids.indexOf(getAmbient()) + 1) % ids.length]);
        syncAmbient(true); syncBar();
    });
    // Chữ to/nhỏ: bấm lại đúng ba nút A-/A/A+ có sẵn trong bảng thiết lập (một nguồn sự thật)
    const sizes = ['small', 'normal', 'large'];
    const bump = (d) => {
        const i = Math.max(0, Math.min(2, sizes.indexOf(state.currentFontSize) + d));
        $('font-size-' + sizes[i])?.click();
        syncBar();
    };
    // Độ rộng khung đọc: hẹp / vừa / rộng (nhớ lại cho lần sau)
    $('fb-w').addEventListener('click', () => { lsSet(LS.w, { '1': '2', '2': '3', '3': '1' }[widthPref()]); applyWidth(true); syncBar(); });
    // Nghỉ mắt ngay: bài thường = màn nghỉ 20 giây; bài tính giờ = tạm dừng đồng hồ (màn tạm dừng đóng vai nghỉ)
    $('fb-break').addEventListener('click', () => { if (state.quizOptions.isTimed) togglePause(); else showBreak(); });
    $('fb-font-').addEventListener('click', () => bump(-1));
    $('fb-font+').addEventListener('click', () => bump(1));
    $('fb-fs').addEventListener('click', () => { if (inFs()) exitFs(); else enterFs(); });
    // trỏ vào thanh / focus trong thanh → không ẩn
    bar.addEventListener('pointerenter', wake);
    bar.addEventListener('focusin', wake);
}

function syncBar() {
    if (!bar) return;
    const total = state.questions.length || 1;
    const done = answeredIdx().length;
    $('fb-count').textContent = `Câu ${state.currentIndex + 1}/${state.questions.length}`;
    $('fb-prog-fill').style.width = Math.round(done / total * 100) + '%';
    $('fb-time').lastElementChild.textContent = fmt(focusSec);
    const td = $('timerDisplay'), tm = $('fb-timer');
    const showT = !!td && !td.classList.contains('hidden') && !!td.textContent.trim();
    tm.hidden = !showT;
    if (showT) {
        tm.lastElementChild.textContent = td.textContent.trim();
        tm.classList.toggle('timer-warn', td.classList.contains('timer-warn'));
        tm.classList.toggle('timer-critical', td.classList.contains('timer-critical'));
    }
    const q = state.questions[state.currentIndex];
    $('fb-note').querySelector('.fb-dot').hidden = !(q && String(readNotes()[q.question] || '').trim());
    $('fb-sound').classList.toggle('is-off', !getSound());
    const amb = getAmbient();
    $('fb-amb').classList.toggle('is-off', amb === 'off');
    $('fb-amb').title = 'Âm nền: ' + AMBIENTS.find(a => a.id === amb).name + ' (bấm để đổi)';
    $('fb-w').title = 'Khung đọc: ' + { '1': 'hẹp', '2': 'vừa', '3': 'rộng' }[widthPref()] + ' (bấm để đổi)';
    $('fb-font-').disabled = state.currentFontSize === 'small';
    $('fb-font+').disabled = state.currentFontSize === 'large';
    const fs = $('fb-fs');
    fs.firstElementChild.className = 'fas ' + (inFs() ? 'fa-compress-arrows-alt' : 'fa-expand');
    fs.title = inFs() ? 'Thoát toàn màn hình' : 'Toàn màn hình';
}
const queueSync = () => { if (!rafId) rafId = requestAnimationFrame(() => { rafId = 0; syncBar(); }); };

// Tự ẩn phần chữ/nút sau 2,8 giây không động tay; chỉ còn vạch tiến độ mảnh
function wake() {
    if (!bar) return;
    bar.classList.remove('is-idle');
    clearTimeout(idleT);
    idleT = setTimeout(() => {
        if (!bar.matches(':hover') && !bar.contains(document.activeElement)) bar.classList.add('is-idle');
    }, 2800);
}
function onActivity(e) {
    if (e.type === 'pointermove') {
        const now = performance.now();
        if (now - lastMove < 150) return;
        lastMove = now;
        // chuột ở nửa dưới màn hình = đang đọc/chọn đáp án, không cần thanh: chỉ đánh thức khi gần đỉnh
        if (e.clientY > 90 && bar.classList.contains('is-idle')) return;
    }
    wake();
}

/* ---------------------------------------------------------------- nhắc nghỉ mắt */
function showBreak() {
    if (breakEl) return;
    sfx('breakStart');
    let left = BREAK_SECONDS;
    breakEl = document.createElement('div');
    breakEl.id = 'focus-break';
    breakEl.setAttribute('role', 'dialog');
    breakEl.setAttribute('aria-modal', 'true');
    breakEl.setAttribute('aria-label', 'Nghỉ mắt');
    breakEl.innerHTML = `
        <div class="fbk-ring" aria-hidden="true"><i></i></div>
        <p class="fbk-title">Nghỉ mắt ${BREAK_SECONDS} giây</p>
        <p class="fbk-sub">Nhìn ra xa một vật cách khoảng 6 m, thả lỏng vai. Bài làm đã được lưu.</p>
        <div class="fbk-count" id="fbk-count">${left}</div>
        <button type="button" class="fbk-skip">Bỏ qua</button>`;
    document.body.appendChild(breakEl);
    const end = (quiet) => {
        clearInterval(breakT);
        if (breakEl) { breakEl.remove(); breakEl = null; }
        sinceBreak = 0;
        if (!quiet) sfx('breakEnd');
    };
    breakEl.querySelector('.fbk-skip').addEventListener('click', () => end(true));
    breakEl.querySelector('.fbk-skip').focus();
    breakT = setInterval(() => {
        left--;
        const c = $('fbk-count'); if (c) c.textContent = String(Math.max(left, 0));
        if (left <= 0) end(false);
    }, 1000);
}

/* ---------------------------------------------------------------- nhịp 1 giây */
function tick() {
    if (breakEl || document.body.classList.contains('quiz-paused') || document.visibilityState !== 'visible') return;   // nghỉ mắt / tab ẩn không tính là thời gian tập trung
    focusSec++; sinceBreak++;
    const min = getBreakMin();
    if (min > 0 && sinceBreak >= min * 60 && !state.quizOptions.isTimed) showBreak();   // bài tính giờ: không chặn màn hình
    syncBar();
}

function todayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
// Cộng dồn giây tập trung theo ngày (giữ 60 ngày) → trả về tổng giây của hôm nay
function logToday(sec) {
    let log = {};
    try { log = JSON.parse(lsGet(LS.log) || '{}') || {}; } catch (e) { }
    const k = todayKey();
    log[k] = (log[k] || 0) + sec;
    Object.keys(log).sort().slice(0, -60).forEach(d => delete log[d]);
    lsSet(LS.log, JSON.stringify(log));
    return log[k];
}

// Người dùng tự bật tập trung trong một bộ đề → nhớ (quiz_focus_q_<id>) để lần sau vào bộ đề đó tự tập trung; tự tắt → quên. Hệ thống bật/tắt (auto) thì không đụng.
function rememberForQuiz(on) {
    try {
        const id = (state.quizData && state.quizData.id) || new URLSearchParams(location.search).get('id');
        if (!id) return;
        if (on) localStorage.setItem('quiz_focus_q_' + id, '1'); else localStorage.removeItem('quiz_focus_q_' + id);
    } catch (e) { }
}

function onFocusOn(restore) {
    if (!bar) buildBar();
    focusSec = 0; sinceBreak = 0; leaving = false;
    startAnswered = new Set(answeredIdx());
    bar.classList.remove('is-idle');
    clearInterval(tickT); tickT = setInterval(tick, 1000);
    applyWidth(true);
    awayY = window.scrollY;
    window.addEventListener('scroll', navAway, { passive: true });
    window.addEventListener('pointerdown', navReveal, { passive: true });
    ['pointermove', 'pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(t => window.addEventListener(t, onActivity, { passive: true }));
    mo = new MutationObserver(queueSync);
    const qs = $('quizSection'); if (qs) mo.observe(qs, { childList: true });
    try { sessionStorage.setItem(SS_KEY, '1'); } catch (e) { }
    syncBar(); wake();
    if (!restore) {
        sfx('focusOn');
        if (lsGet(LS.fs) === '1' && canFs && !inFs()) enterFs();   // gọi ngay trong cú bấm: trình duyệt chỉ cho khi có thao tác người dùng
    }
}

function onFocusOff() {
    clearInterval(tickT); clearInterval(breakT); clearTimeout(idleT);
    if (breakEl) { breakEl.remove(); breakEl = null; }
    ['pointermove', 'pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(t => window.removeEventListener(t, onActivity));
    if (mo) { mo.disconnect(); mo = null; }
    window.removeEventListener('scroll', navAway);
    window.removeEventListener('pointerdown', navReveal);
    applyWidth(false);
    document.body.classList.remove('fm-nav-away');
    try { sessionStorage.removeItem(SS_KEY); } catch (e) { }
    document.body.classList.remove('fm-note-open');
    leaving = true;
    if (inFs()) exitFs();
    setTimeout(() => { leaving = false; }, 500);
    sfx('focusOff');
    if (focusSec >= 60) {
        const today = logToday(focusSec);
        const newly = answeredIdx().filter(i => !startAnswered.has(i)).length;
        const m = Math.round(focusSec / 60), tm = Math.round(today / 60);
        showToast(`Đã tập trung ${m} phút${newly ? ` · làm ${newly} câu` : ''}${tm > m ? ` · hôm nay ${tm} phút` : ''}`, 'success', 4200);
    } else if (focusSec > 0) logToday(focusSec);
}

/* ---------------------------------------------------------------- khởi tạo */
export function setupFocus() {
    document.addEventListener('quiz-focus-change', (e) => {
        const d = e.detail || {};
        if (!d.restore && !d.auto) rememberForQuiz(!!d.on);
        if (d.on) onFocusOn(!!d.restore); else onFocusOff();
    });
    document.addEventListener('fullscreenchange', () => { queueSync(); if (!leaving && state.focusMode) lsSet(LS.fs, inFs() ? '1' : '0'); });
    document.addEventListener('webkitfullscreenchange', () => { queueSync(); if (!leaving && state.focusMode) lsSet(LS.fs, inFs() ? '1' : '0'); });

    // Esc: đóng sổ ghi chú trượt trước, rồi mới thoát tập trung (lớp nào khác đang mở thì để lớp đó tự xử lý)
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || e.defaultPrevented || !state.focusMode || document.body.classList.contains('quiz-paused')) return;   // đang tạm dừng: Esc chỉ để tiếp tục (quiz-boost.js)
        if (document.querySelector('#kbd-sheet:not(.hidden), .zt-confirm-overlay, #notes-all.is-open, #img-lightbox.show, #quiz-settings-popover:not(.hidden-pop)')) return;
        if (breakEl) { breakEl.querySelector('.fbk-skip').click(); return; }
        if (document.body.classList.contains('fm-note-open')) { closeQuickNote(); return; }
        $('focus-mode-btn')?.click();
    });

    // Tự vào tập trung khi bắt đầu làm bài (công tắc trong bảng "Ngựa thì chỉnh"; quiz-session.js đọc cờ này)
    const auto = $('qs-focus-auto');
    if (auto) {
        const syncAuto = () => auto.setAttribute('aria-checked', String(isFocusAuto()));
        syncAuto();
        const flip = () => { lsSet(LS.auto, isFocusAuto() ? '0' : '1'); syncAuto(); };
        auto.addEventListener('click', flip);
        auto.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
        $('quiz-settings-fab')?.addEventListener('click', syncAuto);
    }

    // Chọn khoảng nhắc nghỉ mắt trong bảng "Ngựa thì chỉnh"
    const sel = $('qs-focus-break');
    if (sel) {
        sel.value = String(getBreakMin());
        sel.addEventListener('change', () => { lsSet(LS.brk, sel.value); sinceBreak = 0; });
        sel.addEventListener('click', (e) => e.stopPropagation());
    }
}
