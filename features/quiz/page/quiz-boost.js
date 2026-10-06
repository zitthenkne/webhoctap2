// File: features/quiz/page/quiz-boost.js
// Gói nâng cấp trang làm bài (2026-10-05). Mọi thứ ở đây chỉ BÁM vào DOM/state sẵn có (quan sát #quizSection),
// không sửa luồng chấm điểm -> gỡ file này + dòng setupQuizBoost() là trang về như cũ.
//   1. Thẻ "Ghi nhớ"/"Mở rộng" dài tự gập thành bản xem trước + nút "Mở hết"
//   2. Chọn lại / Đổi đáp án (cứu chạm nhầm)
//   3. Chạm 2 lần để chọn (tùy chọn)
//   4. Nghe đọc câu hỏi  5. Sao chép câu hỏi  6. Phím tắt M N R U K X T
//   7. Nhịp độ + dự báo thời gian còn lại  8. Thanh trên (điện thoại) tự ẩn khi cuộn xuống
//   9. Con dấu mốc tiến độ 25/50/75/100%  10. Giữ màn hình sáng khi đang làm bài

import { showToast } from '../../../core/utils.js';
import { state, saveQuizState } from '../quiz-state.js';
import { isMultiAnswer, isAnswerCorrect, getCorrectIndexes } from '../quiz-helpers.js';
import { isEssay } from '../quiz-essay-core.js';
import { showQuestion, handle5050Help } from './quiz-question-view.js';
import { applyMark } from './quiz-marks.js';
import { hideCatMeme } from './quiz-cat-meme.js';
import { getVibrate } from './quiz-page-prefs.js';
import { speak as voiceSpeak, stopVoice, isSpeaking, voiceSupported, setupVoiceSettings, openVoiceSettings } from './quiz-voice.js';

const LS = { confirmTap: 'quiz_confirm_tap', kbClamp: 'quiz_kb_clamp', wake: 'quiz_wake' };
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };
const isConfirmTapOn = () => lsGet(LS.confirmTap) === '1';   // mặc định TẮT (đổi thói quen chạm là việc người dùng tự chọn)
const isKbClampOn = () => lsGet(LS.kbClamp) !== '0';         // mặc định BẬT
const isWakeOn = () => lsGet(LS.wake) !== '0';               // mặc định BẬT

const $ = (id) => document.getElementById(id);
const curQ = () => state.questions[state.currentIndex];
const isAnswered = (i) => { const a = state.userAnswers[i]; return a !== null && a !== undefined; };
const buzz = (ms = 8) => { if (getVibrate() && navigator.vibrate) navigator.vibrate(ms); };

// Đang ở màn làm bài (không phải trang chờ / kết quả)?
function inQuiz() {
    const box = $('quiz-container'), res = $('resultsSection');
    return document.body.classList.contains('quiz-active') && !!box && !box.classList.contains('hidden')
        && (!res || res.classList.contains('hidden')) && state.questions.length > 0;
}
// Không cướp phím khi đang gõ chữ / có hộp thoại mở
function typing() {
    const t = document.activeElement && document.activeElement.tagName;
    return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || (document.activeElement && document.activeElement.isContentEditable);
}

/* ---------------------------------------------------------------- 1. Gập thẻ kiến thức dài */
// Trang ngắn lại thì "Câu tiếp" luôn gần tầm tay, và chuyển câu không còn nhảy dài. Gập bằng CSS max-height
// (nội dung vẫn nguyên trong DOM nên bôi đen/ghi chú theo offset không lệch).
function clampKb() {
    const on = isKbClampOn();
    const limit = Math.max(240, Math.round(window.innerHeight * 0.42));
    document.querySelectorAll('#quizSection .kb-card').forEach(card => {
        const body = card.querySelector('.kb-body');
        if (!body) return;
        if (!on) {
            if (card.classList.contains('is-long')) {
                card.classList.remove('is-long', 'is-open');
                const b = card.querySelector('.kb-more-btn'); if (b) b.remove();
            }
            return;
        }
        if (card.classList.contains('hidden') || card.classList.contains('is-folded')) return;   // chưa hiện / đã gập cả thẻ
        if (card.classList.contains('is-long')) return;
        if (body.scrollHeight <= limit * 1.3) return;                                            // ngắn: để nguyên
        card.classList.add('is-long');
        body.style.setProperty('--kb-limit', limit + 'px');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'kb-more-btn';
        btn.setAttribute('aria-expanded', 'false');
        btn.innerHTML = '<i class="fas fa-chevron-down"></i><span>Mở hết</span>';
        body.after(btn);
    });
}
function toggleKb(btn) {
    const card = btn.closest('.kb-card');
    if (!card) return;
    const open = card.classList.toggle('is-open');
    btn.setAttribute('aria-expanded', String(open));
    btn.querySelector('span').textContent = open ? 'Thu lại' : 'Mở hết';
    if (!open) card.scrollIntoView({ block: 'nearest' });
}

/* ---------------------------------------------------------------- 2+3. Chọn lại / chạm 2 lần */
const snaps = {};          // { idx: {score, streak} } chụp TRƯỚC khi chọn, để hoàn tác trả lại đúng
const stamps = {};         // { idx: ms } lúc vừa chọn (chế độ hiện đáp án ngay) -> cửa sổ hoàn tác 8 giây
const seenOpen = new Set(); // câu đã thấy ở trạng thái CHƯA trả lời -> mới được tính cửa sổ (khôi phục phiên thì không)
const UNDO_MS = 8000;
let undoTimer = 0;

function undoEligible() {
    const i = state.currentIndex, q = curQ();
    if (!q || !isAnswered(i)) return false;
    if (isMultiAnswer(q) || isEssay(q) || state.quizMode === 'srs') return false;   // nhiều đáp án có nút Xác nhận; ôn ngắt quãng đã chấm lịch
    if (!state.quizOptions.showAnswerImmediately) return true;                       // thi: đáp án chưa lộ -> đổi lúc nào cũng được
    return !!stamps[i] && Date.now() - stamps[i] < UNDO_MS;                          // luyện: lộ đáp án rồi -> chỉ cứu chạm nhầm
}
function syncUndo() {
    const i = state.currentIndex;
    let btn = $('undo-answer-btn');
    if (!isAnswered(i)) {
        seenOpen.add(i); delete stamps[i];
        if (btn) btn.remove();
        return;
    }
    if (seenOpen.has(i) && !stamps[i]) { stamps[i] = Date.now(); seenOpen.delete(i); }
    if (!undoEligible()) { if (btn) btn.remove(); return; }
    const imm = !!state.quizOptions.showAnswerImmediately;
    if (!btn) {
        const host = document.querySelector('#quizSection .q-tools > div');
        if (!host) return;
        btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'undo-answer-btn';
        host.prepend(btn);
    }
    const label = imm ? 'Chọn lại' : 'Đổi đáp án';
    if (btn.dataset.label !== label) {
        btn.dataset.label = label;
        btn.title = label + ' (phím U)';
        btn.innerHTML = `<i class="fas fa-rotate-left"></i> ${label}`;
    }
    clearTimeout(undoTimer);
    if (imm) undoTimer = setTimeout(syncUndo, Math.max(60, UNDO_MS - (Date.now() - stamps[i]) + 60));
}
function undoAnswer() {
    if (!undoEligible()) return;
    const i = state.currentIndex, q = curQ(), a = state.userAnswers[i];
    if (state.quizOptions.showAnswerImmediately) {
        const wasOk = isAnswerCorrect(q, a), snap = snaps[i];
        if (wasOk) state.score = Math.max(0, state.score - 1);
        state.streak = snap ? snap.streak : (wasOk ? Math.max(0, state.streak - 1) : 0);
    }
    state.userAnswers[i] = null;
    delete stamps[i]; delete snaps[i];
    seenOpen.add(i);
    hideCatMeme();
    buzz(10);
    saveQuizState();
    showQuestion();   // cùng câu -> không cuộn, vẽ lại ô đáp án ở trạng thái chưa chọn
}

function setupAnswerGuards() {
    const quiz = $('quizSection');
    if (!quiz) return;
    let downAt = 0;
    quiz.addEventListener('pointerdown', () => { downAt = Date.now(); }, true);
    // Chạm ra ngoài đáp án -> bỏ "đang chờ chạm lần 2"
    document.addEventListener('pointerdown', (e) => {
        if (e.target.closest && e.target.closest('.answer-btn')) return;
        quiz.querySelectorAll('.answer-btn.is-armed').forEach(b => b.classList.remove('is-armed'));
    }, true);
    quiz.addEventListener('click', (e) => {
        const btn = e.target.closest && e.target.closest('.answer-btn');
        if (!btn || btn.classList.contains('answer-locked') || btn.disabled) return;
        const q = curQ();
        if (!q || isEssay(q)) return;
        if (!isMultiAnswer(q)) snaps[state.currentIndex] = { score: state.score, streak: state.streak };
        if (!isConfirmTapOn() || isMultiAnswer(q)) return;
        if (e.detail === 0) return;                                 // bàn phím / phím tắt A–D: đã chủ ý -> chọn luôn
        if (Date.now() - downAt > 300) return;                      // giữ lâu = gạch bỏ đáp án, để luồng cũ lo
        if (btn.classList.contains('answer-eliminated')) return;    // chạm ô đã gạch = khôi phục (luồng cũ)
        const sel = window.getSelection && window.getSelection();
        if (sel && !sel.isCollapsed && sel.toString().trim()) return; // đang bôi đen để ghi chú
        if (btn.classList.contains('is-armed')) return;             // lần 2 -> cho chọn thật
        e.stopPropagation(); e.preventDefault();
        quiz.querySelectorAll('.answer-btn.is-armed').forEach(b => b.classList.remove('is-armed'));
        btn.classList.add('is-armed');
        buzz(10);
    }, true);
    // Bấm nút Chọn lại (ủy quyền: nút được dựng lại mỗi lần vẽ câu)
    quiz.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('#undo-answer-btn')) undoAnswer(); });
}

/* ---------------------------------------------------------------- 4+5. Nghe đọc + Sao chép */
// Chữ thuần của một vùng đã render (bỏ bản MathML trùng của KaTeX, ảnh, sơ đồ)
function plain(el) {
    if (!el) return '';
    const c = el.cloneNode(true);
    c.querySelectorAll('.katex-mathml, script, style, svg, .mermaid, .option-explanation, button').forEach(n => n.remove());
    return c.textContent.replace(/\s+/g, ' ').trim();
}
function cardParts() {
    const card = document.querySelector('#quizSection .quiz-card');
    if (!card) return null;
    const answers = [...card.querySelectorAll('.answer-btn')].map((b, i) => `${String.fromCharCode(65 + i)}. ${plain(b.querySelector('.answer-content'))}`);
    const shown = (sel) => { const n = card.querySelector(sel); return n && !n.closest('.hidden') ? plain(n.querySelector('.kb-body')) : ''; };
    return {
        caseText: plain(card.querySelector('#case-body')),
        question: plain(card.querySelector('.question-text')),
        answers,
        note: shown('#explanation-area'),
        more: shown('#expanded-area')
    };
}
function correctLetters() {
    return getCorrectIndexes(curQ()).map(i => String.fromCharCode(65 + i)).join(', ');
}
// Nút loa sáng/tắt theo trạng thái đọc (quiz-voice.js gọi lại khi đọc xong hoặc bị dừng)
function setSpeakBtn(on) {
    const b = $('listen-btn');
    if (b) { b.classList.toggle('is-speaking', on); b.setAttribute('aria-pressed', String(on)); }
}
function stopSpeaking() { if (isSpeaking()) stopVoice(); setSpeakBtn(false); }
function toggleSpeak() {
    if (!voiceSupported()) { showToast('Trình duyệt này chưa hỗ trợ đọc to.', 'info'); return; }
    if (isSpeaking()) { stopSpeaking(); return; }
    const p = cardParts();
    if (!p || !p.question) return;
    const answered = isAnswered(state.currentIndex) && state.quizOptions.showAnswerImmediately && !isEssay(curQ());
    const text = [
        p.question,
        ...p.answers.map(a => a.replace(/^([A-Z])\. /, 'Đáp án $1: ')),
        answered ? `Đáp án đúng là ${correctLetters()}.` : '',
        answered ? p.note : ''
    ].filter(Boolean).join('. ');
    setSpeakBtn(true);
    voiceSpeak(text, () => setSpeakBtn(false));   // gọi ngay trong cú chạm: iOS chỉ cho phát tiếng khi có thao tác
}
async function copyQuestion() {
    const p = cardParts();
    if (!p) return;
    const q = curQ();
    const lines = [`Câu ${state.currentIndex + 1}/${state.questions.length}`];
    if (p.caseText) lines.push(p.caseText, '');
    lines.push(p.question, ...p.answers);
    if (isAnswered(state.currentIndex) && state.quizOptions.showAnswerImmediately && !isEssay(q)) {
        lines.push('', `Đáp án đúng: ${correctLetters()}`);
        if (p.note) lines.push(`Ghi nhớ: ${p.note}`);
        if (p.more) lines.push(`Mở rộng: ${p.more}`);
    }
    const text = lines.join('\n');
    try {
        await navigator.clipboard.writeText(text);
    } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch (_) { }
        ta.remove();
    }
    buzz(10);
    showToast('Đã sao chép câu hỏi', 'success', 1800);
}

/* ---------------------------------------------------------------- 6. Phím tắt */
// Chỉ dùng chữ NGOÀI A–H (A–H là chọn đáp án) và V (xem lại ca).
function setupKeys() {
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing || e.repeat) return;
        if (typing() || !inQuiz()) return;
        if (document.querySelector('#kbd-sheet:not(.hidden), .zt-confirm-overlay')) return;
        const k = e.key.length === 1 ? e.key.toLowerCase() : '';
        if (k === 'm') {                                 // đánh dấu nhanh / bỏ đánh dấu
            const i = state.currentIndex;
            applyMark(i, state.markedQuestions.includes(i) ? '__unmark' : 'review');
            showQuestion();
        } else if (k === 'n') {                          // câu CHƯA làm kế tiếp (vòng lại từ đầu)
            const total = state.questions.length;
            for (let s = 1; s < total; s++) {
                const i = (state.currentIndex + s) % total;
                if (!isAnswered(i)) { state.currentIndex = i; saveQuizState(); showQuestion(); return; }
            }
            showToast('Bạn đã trả lời tất cả các câu.', 'info');
        } else if (k === 'r') { toggleSpeak();
        } else if (k === 'u') { undoAnswer();
        } else if (k === 'k') { copyQuestion();
        } else if (k === 'x') {                          // 50:50
            const b = $('help-5050-btn');
            if (b && !b.disabled && b.style.display !== 'none') handle5050Help();
        } else if (k === 't') {                          // chế độ tập trung
            const b = $('focus-mode-btn'); if (b) b.click();
        } else return;
        e.preventDefault();
    });
}

/* ---------------------------------------------------------------- 7. Nhịp độ + dự báo */
function syncPace() {
    const total = state.questions.length;
    const head = document.querySelector('#quiz-nav-panel .qnp-head');
    if (!head || !total) return;
    let el = $('quiz-nav-pace');
    const secs = [];
    state.userAnswers.forEach((a, i) => {
        const t = state.questionTimes && state.questionTimes[i];
        if (a !== null && a !== undefined && t > 0) secs.push(Math.min(t, 300));
    });
    const left = total - state.userAnswers.filter(a => a !== null && a !== undefined).length;
    if (secs.length < 3 || left <= 0) { if (el) el.remove(); return; }
    secs.sort((a, b) => a - b);
    const med = secs[Math.floor(secs.length / 2)];
    const mins = Math.max(1, Math.ceil(med * left / 60));
    const eta = mins >= 60 ? `${Math.floor(mins / 60)} giờ ${mins % 60 ? (mins % 60) + ' phút' : ''}`.trim() : `${mins} phút`;
    if (!el) {
        el = document.createElement('div');
        el.id = 'quiz-nav-pace';
        el.className = 'qnp-pace focus-hide';
        el.innerHTML = '<i class="fas fa-clock" aria-hidden="true"></i><span></span>';
        head.after(el);
    }
    const txt = `${med}s/câu · còn ~${eta}`;
    const span = el.lastElementChild;
    if (span.textContent !== txt) span.textContent = txt;
    el.title = 'Nhịp làm bài của bạn (trung vị các câu đã làm) và thời gian ước tính để làm hết số câu còn lại';
}

/* ---------------------------------------------------------------- 9. Con dấu mốc tiến độ */
const MILES = [25, 50, 75, 100];
let mileSession = null, mileDone = new Set(), lastAnswered = 0;
function syncMilestone() {
    const total = state.questions.length;
    if (!total) return;
    const answered = state.userAnswers.filter(a => a !== null && a !== undefined).length;
    const pct = Math.floor(answered / total * 100);
    if (mileSession !== state.quizStartTime) {            // phiên mới / khôi phục: ghi nhận mốc đã qua, KHÔNG đóng dấu
        mileSession = state.quizStartTime;
        mileDone = new Set(MILES.filter(m => pct >= m));
        lastAnswered = answered;
        return;
    }
    if (answered > lastAnswered) {
        const hit = MILES.filter(m => pct >= m && !mileDone.has(m)).pop();
        MILES.forEach(m => { if (pct >= m) mileDone.add(m); });
        if (hit) stampMilestone(hit);
    } else if (answered < lastAnswered) {                 // hoàn tác: mốc có thể đóng lại
        MILES.forEach(m => { if (pct < m) mileDone.delete(m); });
    }
    lastAnswered = answered;
}
function stampMilestone(pct) {
    const card = document.querySelector('#quizSection .quiz-card');
    if (!card) return;
    const old = card.querySelector('.ms-stamp'); if (old) old.remove();
    const s = document.createElement('div');
    s.className = 'ms-stamp';
    s.dataset.full = pct === 100 ? '1' : '';
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = `<i class="fas fa-star"></i><b>${pct}%</b>`;
    card.appendChild(s);
    setTimeout(() => s.remove(), 2000);
}

/* ---------------------------------------------------------------- 10. Giữ màn hình sáng */
let wakeLock = null;
async function syncWake() {
    const want = isWakeOn() && inQuiz() && document.visibilityState === 'visible';
    if (!want) {
        if (wakeLock) { try { await wakeLock.release(); } catch (e) { } wakeLock = null; }
        return;
    }
    if (wakeLock || !('wakeLock' in navigator)) return;
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (e) { /* pin yếu / bị từ chối: bỏ qua */ }
}

/* ---------------------------------------------------------------- 8. Thanh trên tự ẩn (điện thoại) */
function setupBarAway() {
    let lastY = window.scrollY, ticking = false;
    window.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            ticking = false;
            const cl = document.body.classList;
            if (window.innerWidth >= 768) { cl.remove('nb-bar-away'); return; }   // thanh trên chỉ có ở điện thoại
            const y = window.scrollY, dy = y - lastY;
            if (y < 90) { cl.remove('nb-bar-away'); lastY = y; }
            else if (dy > 10) { cl.add('nb-bar-away'); lastY = y; }
            else if (dy < -8) { cl.remove('nb-bar-away'); lastY = y; }
        });
    }, { passive: true });
}

/* ---------------------------------------------------------------- Công tắc trong bảng "Ngựa thì chỉnh" */
function setupBoostSettings() {
    const rows = [
        ['qs-confirm-tap', isConfirmTapOn, () => lsSet(LS.confirmTap, isConfirmTapOn() ? '0' : '1'),
            () => showToast(isConfirmTapOn() ? 'Chạm 2 lần mới chọn: lần 1 chỉ đánh dấu ô, lần 2 mới chốt' : 'Đã tắt chạm 2 lần', 'info')],
        ['qs-kb-clamp', isKbClampOn, () => lsSet(LS.kbClamp, isKbClampOn() ? '0' : '1'), () => clampKb()],
        ['qs-wake', isWakeOn, () => lsSet(LS.wake, isWakeOn() ? '0' : '1'), () => syncWake()]
    ];
    const sync = () => rows.forEach(([id, get]) => { const r = $(id); if (r) r.setAttribute('aria-checked', String(get())); });
    sync();
    rows.forEach(([id, , flip, after]) => {
        const r = $(id);
        if (!r) return;
        const go = () => { flip(); sync(); after(); };
        r.addEventListener('click', go);
        r.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    const fab = $('quiz-settings-fab');
    if (fab) fab.addEventListener('click', sync);
}

/* ---------------------------------------------------------------- Khởi tạo */
export function setupQuizBoost() {
    const quiz = $('quizSection');
    if (!quiz) return;
    const listen = () => { if (!voiceSupported()) { const b = $('listen-btn'); if (b) b.hidden = true; } };

    setupAnswerGuards();
    setupKeys();
    setupBarAway();
    setupBoostSettings();
    setupVoiceSettings();

    // Bấm GIỮ nút loa (hoặc chuột phải) = mở bảng chọn giọng; bấm thường = đọc / dừng
    let lpTimer = 0, lpFired = false;
    const cancelLp = () => clearTimeout(lpTimer);
    document.addEventListener('pointerdown', (e) => {
        if (!(e.target.closest && e.target.closest('#listen-btn'))) return;
        lpFired = false; cancelLp();
        lpTimer = setTimeout(() => { lpFired = true; buzz(14); }, 550);
    });
    ['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, cancelLp));
    document.addEventListener('click', (e) => {
        if (!lpFired || !(e.target.closest && e.target.closest('#listen-btn'))) return;
        lpFired = false;
        e.preventDefault(); e.stopPropagation();   // chặn cả bộ "bấm ra ngoài thì đóng bảng" của Ngựa thì chỉnh
        openVoiceSettings();
    }, true);
    document.addEventListener('contextmenu', (e) => {
        if (!(e.target.closest && e.target.closest('#listen-btn'))) return;
        e.preventDefault();
        if (!lpFired) { lpFired = true; openVoiceSettings(); }   // cờ giữ tới lần chạm kế (pointerdown xóa) để nuốt click theo sau
    });

    document.addEventListener('click', (e) => {
        const t = e.target.closest && e.target.closest('.kb-more-btn, #listen-btn, #copy-q-btn');
        if (!t) return;
        if (t.classList.contains('kb-more-btn')) toggleKb(t);
        else if (t.id === 'listen-btn') toggleSpeak();
        else copyQuestion();
    });
    document.addEventListener('visibilitychange', syncWake);
    window.addEventListener('pagehide', stopSpeaking);

    let lastIdx = -1, raf = 0;
    const run = () => {
        raf = 0;
        if (!inQuiz()) { syncWake(); return; }
        if (state.currentIndex !== lastIdx) { lastIdx = state.currentIndex; stopSpeaking(); }
        listen();
        clampKb();
        syncUndo();
        syncPace();
        syncMilestone();
        syncWake();
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(run); };
    new MutationObserver(queue).observe(quiz, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    new MutationObserver(queue).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', queue);
    // Ảnh nạp xong làm thẻ kiến thức dài ra -> đo lại
    quiz.addEventListener('load', queue, true);
}
