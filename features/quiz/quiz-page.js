// features/quiz/quiz-page.js

import { db, auth } from '../../core/firebase-init.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import { showToast, showConfirm } from '../../core/utils.js';
import { applyLocalQuestionEdits, openQuestionEditor, setupQuestionEditor } from './quiz-editor.js';
import { studyKeys, syncPullStudy, scheduleCloudPush } from './quiz-study-store.js';
import { getOfflineQuiz, refreshOfflineQuizIfSaved } from './quiz-offline-store.js';

import { state, resetState, saveQuizState, clearQuizState, saveQuizResult, MARK_REASONS } from './quiz-state.js';
import {
    renderMermaid,
    ensureMermaidInit,
    renderMath,
    triggerConfetti,
    parseInlineMarkdown,
    parseMarkdown,
    formatTime,
    shuffleArray,
    shuffleQuestionOptions
} from './quiz-helpers.js';
import {
    showSubmitQuizBtn,
    updateProgressBar,
    renderQuizProgressBar,
    updateStatDuration,
    loadQuizDetails,
    showResults,
    toggleFocusMode
} from './quiz-ui.js';

let navVisible = true;
let autoSaveInterval = null;
// Câu vừa hiển thị trước đó — dùng để biết khi nào THỰC SỰ chuyển sang câu khác
// (để cuộn lên đầu trang) so với khi chỉ vẽ lại cùng một câu (đổi cỡ chữ, ghi chú…).
let _lastShownIndex = -1;
let _catMemeTimer = null; // hẹn giờ tự ẩn meme con mèo
// GIF đã được tải sẵn cho câu đang xem (để khi trả lời hiện tức thì, không trễ)
let _preloadedMemes = { idx: -1, happy: null, sad: null };

// --- Đồng bộ "dữ liệu học tập" (ghi chú / đánh dấu / bôi vàng) lên cloud ---
function currentQuizId() {
    return (state.quizData && state.quizData.id) || (new URLSearchParams(window.location.search)).get('id') || 'default_quiz';
}
// Gọi sau mỗi lần ghi chú / đánh dấu / annotation thay đổi localStorage.
function pushStudyToCloud() {
    const uid = auth.currentUser && auth.currentUser.uid;
    if (uid) scheduleCloudPush(uid, currentQuizId());
}
// Lưu/bỏ đánh dấu BỀN theo nội dung câu hỏi (để trang Lịch sử đọc lại được).
// Khác với state.markedReasons (theo chỉ số phiên, bị xóa khi nộp bài).
function persistMarkByText(qText, reason) {
    if (!qText) return;
    const key = studyKeys(currentQuizId()).marks;
    let store = {};
    try { store = JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) {}
    if (reason === '__unmark' || !reason) delete store[qText];
    else store[qText] = reason;
    try { localStorage.setItem(key, JSON.stringify(store)); } catch (e) {}
    pushStudyToCloud();
}

/* ============================================================
   TIỆN ÍCH NÂNG CẤP TRẢI NGHIỆM LÀM BÀI
   ============================================================ */

// --- Thiết lập (Dark / Âm thanh / Rung) lưu trong localStorage ---
function getTheme()   { try { return localStorage.getItem('quiz_theme') || 'light'; } catch (e) { return 'light'; } }
function getSound()   { try { return localStorage.getItem('quiz_sound') === '1'; } catch (e) { return false; } }
function getVibrate() { try { return localStorage.getItem('quiz_vibrate') !== '0'; } catch (e) { return true; } } // mặc định BẬT
function getBgOpacity() { // % độ rõ ảnh nền, 0–60, mặc định 28
    try { const v = parseInt(localStorage.getItem('quiz_bg_opacity'), 10); return isNaN(v) ? 28 : Math.max(0, Math.min(60, v)); }
    catch (e) { return 28; }
}
function applyBgOpacity(pct) { document.documentElement.style.setProperty('--quiz-bg-opacity', pct / 100); }

// --- #15: Phản hồi rung + âm thanh nhẹ khi trả lời ---
let _audioCtx = null;
function playTone(isCorrect) {
    try {
        _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const ctx = _audioCtx;
        const now = ctx.currentTime;
        const notes = isCorrect ? [660, 880] : [300, 200];
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const t = now + i * 0.09;
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(0.06, t + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.18);
        });
    } catch (e) { /* trình duyệt không hỗ trợ WebAudio -> bỏ qua */ }
}
function feedback(isCorrect) {
    if (getVibrate() && navigator.vibrate) navigator.vibrate(isCorrect ? 18 : [25, 35, 25]);
    if (getSound()) playTone(isCorrect);
}

// --- Cuộn mượt lên đầu trang khi chuyển sang câu khác (nội dung câu luôn nằm gọn ở giữa màn) ---
function scrollQuizToTop() {
    try {
        const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    } catch (e) { try { window.scrollTo(0, 0); } catch (_) {} }
}

// --- Meme con mèo: chỉ hiện ảnh meme (đúng = mèo vui, sai = mèo khóc), lấy qua link ---
// Mỗi danh sách có nhiều link dự phòng: nếu link đầu lỗi sẽ tự thử link sau,
// hết link thì ẩn luôn nên không bao giờ hiện ảnh vỡ.
// Meme câu ĐÚNG (happy cat) — 20 GIF từ giphy.com/search/happy-cat
const HAPPY_CAT_MEMES = [
    'https://media.giphy.com/media/QaO94TsFEnZauKsboY/giphy.gif',
    'https://media.giphy.com/media/LDI8pqI24xe6wxRWuF/giphy.gif',
    'https://media.giphy.com/media/PleihcHr0kbJVD0bNe/giphy.gif',
    'https://media.giphy.com/media/td5eq6qlu1UL6/giphy.gif',
    'https://media.giphy.com/media/BK1EfIsdkKZMY/giphy.gif',
    'https://media.giphy.com/media/gT93oBucqsHNS/giphy.gif',
    'https://media.giphy.com/media/W8hVGGjOjV82Rh6Oyi/giphy.gif',
    'https://media.giphy.com/media/Rtu8Jzs4MzoC3cl8lM/giphy.gif',
    'https://media.giphy.com/media/T70hpBP1L0N7U0jtkq/giphy.gif',
    'https://media.giphy.com/media/GAtTF1kUyoMFx2QL7n/giphy.gif',
    'https://media.giphy.com/media/kalDkPUTRfV4XFEvJ5/giphy.gif',
    'https://media.giphy.com/media/1rzHSymOFmy0Do1Mb0/giphy.gif',
    'https://media.giphy.com/media/NfzERYyiWcXU4/giphy.gif',
    'https://media.giphy.com/media/wvYNSqBAMDVx8CEYkt/giphy.gif',
    'https://media.giphy.com/media/Yt09iFvD9u5AQ/giphy.gif',
    'https://media.giphy.com/media/HJibfnd7xqk5hAMD4v/giphy.gif',
    'https://media.giphy.com/media/gZFHLPFHNpjwaondsz/giphy.gif',
    'https://media.giphy.com/media/NPwRSSWKyXkbxl8SaX/giphy.gif',
    'https://media.giphy.com/media/wXbyhZ5mWQmv7c672G/giphy.gif',
    'https://media.giphy.com/media/GRC8pK6FJ9Nm3AFArf/giphy.gif'
];
// Meme câu SAI (confused) — 20 GIF từ giphy.com/search/confused
const SAD_CAT_MEMES = [
    'https://media.giphy.com/media/ji6zzUZwNIuLS/giphy.gif',
    'https://media.giphy.com/media/gKHGnB1ml0moQdjhEJ/giphy.gif',
    'https://media.giphy.com/media/ukGm72ZLZvYfS/giphy.gif',
    'https://media.giphy.com/media/fa1AV8UvZvfBFOIt7F/giphy.gif',
    'https://media.giphy.com/media/fFwOzwhCO1FMA/giphy.gif',
    'https://media.giphy.com/media/xRq2Mo2yewajZLPmCt/giphy.gif',
    'https://media.giphy.com/media/hv53DaYcXWe3nRbR1A/giphy.gif',
    'https://media.giphy.com/media/lkdH8FmImcGoylv3t3/giphy.gif',
    'https://media.giphy.com/media/5M5N7Rc0y2NkJWEarU/giphy.gif',
    'https://media.giphy.com/media/lHfxDepSGlzom6f65K/giphy.gif',
    'https://media.giphy.com/media/H4zeDO4ocDYqY/giphy.gif',
    'https://media.giphy.com/media/Z5xk7fGO5FjjTElnpT/giphy.gif',
    'https://media.giphy.com/media/WRQBXSCnEFJIuxktnw/giphy.gif',
    'https://media.giphy.com/media/YVPwi7L2izTJS/giphy.gif',
    'https://media.giphy.com/media/YaXDLHHbz0t5lTM03z/giphy.gif',
    'https://media.giphy.com/media/3o7aCTPPm4OHfRLSH6/giphy.gif',
    'https://media.giphy.com/media/3EiNpweH34XGoQcq9Q/giphy.gif',
    'https://media.giphy.com/media/a0FuPjiLZev4c/giphy.gif',
    'https://media.giphy.com/media/iHe7mA9M9SsyQ/giphy.gif',
    'https://media.giphy.com/media/FY8c5SKwiNf1EtZKGs/giphy.gif'
];

// Người dùng có thể tắt meme ở trang thiết lập; lựa chọn lưu cục bộ (mặc định BẬT).
function getCatMemeEnabled() {
    try { return localStorage.getItem('quiz_meme_enabled') !== '0'; } catch (e) { return true; }
}

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Chọn sẵn 1 GIF đúng + 1 GIF sai cho câu hiện tại và tải trước vào cache trình duyệt,
// để khi người dùng trả lời thì meme hiện ra ngay (đỡ phải chờ tải GIF nặng).
function preloadCurrentMemes() {
    if (!getCatMemeEnabled()) return;
    const idx = state.currentIndex;
    if (_preloadedMemes.idx === idx && _preloadedMemes.happy && _preloadedMemes.sad) return;
    const happy = pickRandom(HAPPY_CAT_MEMES);
    const sad = pickRandom(SAD_CAT_MEMES);
    _preloadedMemes = { idx, happy, sad };
    [happy, sad].forEach(u => { try { const im = new Image(); im.src = u; } catch (e) {} });
}

function hideCatMeme() {
    const el = document.getElementById('cat-meme-pop');
    if (!el) return;
    if (_catMemeTimer) { clearTimeout(_catMemeTimer); _catMemeTimer = null; }
    el.classList.remove('show');
    _catMemeTimer = setTimeout(() => {
        el.classList.add('hidden');
        // Xóa luôn ảnh đang giữ để giải phóng RAM khi meme đã ẩn
        // (byte GIF vẫn nằm trong HTTP cache của trình duyệt nên lần sau vẫn hiện nhanh)
        const img = el.querySelector('.cat-meme-img');
        if (img) { img.onload = null; img.onerror = null; img.removeAttribute('src'); }
    }, 240);
}

function showCatMeme(isCorrect) {
    if (!getCatMemeEnabled()) return; // người dùng đã tắt meme
    let el = document.getElementById('cat-meme-pop');
    if (!el) {
        el = document.createElement('div');
        el.id = 'cat-meme-pop';
        el.className = 'hidden';
        el.innerHTML = `<img class="cat-meme-img" alt="Meme phản hồi" />`;
        document.body.appendChild(el);
        // Bấm ra ngoài (hoặc vào) meme là ẩn ngay
        el.addEventListener('click', hideCatMeme);
    }
    if (_catMemeTimer) { clearTimeout(_catMemeTimer); _catMemeTimer = null; }

    // Ẩn NGAY ảnh của câu trước để không lóe meme cũ trong lúc GIF mới đang tải
    el.classList.remove('show');
    const img = el.querySelector('.cat-meme-img');
    img.onload = null;
    img.onerror = null;
    img.style.visibility = 'hidden';
    img.removeAttribute('src');

    // Ưu tiên GIF đã tải sẵn cho câu này (hiện tức thì); phần còn lại xáo trộn làm dự phòng.
    const preferred = (_preloadedMemes.idx === state.currentIndex)
        ? (isCorrect ? _preloadedMemes.happy : _preloadedMemes.sad) : null;
    let candidates = (isCorrect ? HAPPY_CAT_MEMES : SAD_CAT_MEMES)
        .map(u => ({ u, r: Math.random() }))
        .sort((a, b) => a.r - b.r)
        .map(o => o.u);
    if (preferred) candidates = [preferred, ...candidates.filter(u => u !== preferred)];
    // Thêm tham số ngẫu nhiên cho cataas để mỗi lần là một chú mèo khác (tránh cache)
    candidates = candidates.map(u => u.includes('cataas') ? u + (u.includes('?') ? '&' : '?') + 'cb=' + Date.now() + Math.random().toString(36).slice(2) : u);
    let i = 0;

    // Chỉ hiện popup KHI GIF mới đã tải xong -> không bao giờ thấy meme của câu trước
    const reveal = () => {
        img.style.visibility = '';
        el.classList.remove('hidden');
        requestAnimationFrame(() => el.classList.add('show'));
        if (_catMemeTimer) clearTimeout(_catMemeTimer);
        _catMemeTimer = setTimeout(hideCatMeme, 2600);
    };
    img.onload = reveal;
    img.onerror = () => {
        i++;
        if (i < candidates.length) img.src = candidates[i];
        else { img.onerror = null; img.onload = null; hideCatMeme(); } // hết link dự phòng -> ẩn luôn
    };
    img.src = candidates[0];
}

// --- #17: chỉ dùng 1 cột khi bản thân đáp án dài (không tính giải thích) ---
function answersNeedSingleColumn(options) {
    if (!Array.isArray(options)) return false;
    return options.some(opt => {
        const t = String(opt == null ? '' : opt);
        if (t.length > 85) return true;            // đáp án dài
        if (/\n/.test(t)) return true;             // nhiều dòng
        if (/!\[.*?\]\(.*?\)/.test(t)) return true; // có ảnh
        if (/(^|\n)\s*[-*+]\s+/.test(t)) return true; // danh sách
        if (/\|.*\|/.test(t)) return true;         // bảng
        if (/```/.test(t)) return true;            // khối mã / mermaid
        if (/\$\$/.test(t)) return true;           // công thức khối
        return false;
    });
}

// --- #11: tính thời gian cho từng câu ---
function accrueTime() {
    if (state._timingIndex !== null && state._timingEnterAt) {
        const dt = Math.max(0, Math.round((Date.now() - state._timingEnterAt) / 1000));
        if (!Array.isArray(state.questionTimes)) state.questionTimes = [];
        state.questionTimes[state._timingIndex] = (state.questionTimes[state._timingIndex] || 0) + dt;
    }
}
function startTiming(idx) {
    accrueTime();
    state._timingIndex = idx;
    state._timingEnterAt = Date.now();
}

// --- #2: cập nhật thanh HUD dính ---
function updateHud() {
    const hud = document.getElementById('quiz-hud');
    if (hud) hud.style.display = '';
    const counter = document.getElementById('hud-counter');
    const fill = document.getElementById('hud-progress-fill');
    const total = state.questions.length;
    if (counter) counter.textContent = `Câu ${state.currentIndex + 1}/${total}`;
    const answered = state.userAnswers.filter(a => a !== null && a !== undefined).length;
    if (fill) fill.style.width = (total ? Math.round((answered / total) * 100) : 0) + '%';
}

// --- #4: loại trừ đáp án (gạch bỏ) + chạm để khôi phục ---
function applyEliminatedStyles() {
    const elim = state.eliminatedAnswers[state.currentIndex] || [];
    document.querySelectorAll('.answer-btn').forEach(btn => {
        const idx = parseInt(btn.getAttribute('data-index'));
        btn.classList.toggle('answer-eliminated', elim.includes(idx));
    });
}
function toggleEliminate(idx) {
    // Chỉ cho loại trừ khi câu CHƯA trả lời
    const ans = state.userAnswers[state.currentIndex];
    if (ans !== null && ans !== undefined) return;
    const cur = state.eliminatedAnswers[state.currentIndex] || [];
    if (cur.includes(idx)) {
        state.eliminatedAnswers[state.currentIndex] = cur.filter(i => i !== idx);
    } else {
        state.eliminatedAnswers[state.currentIndex] = [...cur, idx];
    }
    applyEliminatedStyles();
    if (getVibrate() && navigator.vibrate) navigator.vibrate(10);
    saveQuizState();
}
// Khóa nút đáp án SAU KHI trả lời bằng class thay vì thuộc tính `disabled`.
// Lý do: nút <button disabled> bị trình duyệt chặn luôn việc bôi đen chữ bên trong,
// khiến không thể ghi chú lên đáp án/giải thích. Việc chặn chọn lại đáp án đã được
// bảo đảm bởi guard `userAnswers !== null` trong handleAnswerClick & toggleEliminate.
function setAnswerLock(btn, locked) {
    if (!btn) return;
    btn.classList.toggle('answer-locked', !!locked);
    btn.setAttribute('aria-disabled', locked ? 'true' : 'false');
}

function setupAnswerInteractions() {
    applyEliminatedStyles();
    document.querySelectorAll('.answer-btn').forEach(btn => {
        const idx = parseInt(btn.getAttribute('data-index'));
        let pressTimer = null;
        let longPressed = false;
        let pStartX = 0, pStartY = 0;
        const startPress = (e) => {
            longPressed = false;
            pStartX = e.clientX; pStartY = e.clientY;
            pressTimer = setTimeout(() => { longPressed = true; toggleEliminate(idx); }, 450);
        };
        const cancelPress = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
        const movePress = (e) => {
            // chỉ hủy nếu di chuyển đáng kể (cuộn trang), bỏ qua rung tay nhẹ
            if (Math.abs(e.clientX - pStartX) > 12 || Math.abs(e.clientY - pStartY) > 12) cancelPress();
        };
        btn.addEventListener('pointerdown', startPress);
        btn.addEventListener('pointerup', cancelPress);
        btn.addEventListener('pointermove', movePress);
        btn.addEventListener('pointercancel', cancelPress);
        btn.addEventListener('pointerleave', cancelPress);
        // Chuột phải (desktop) = loại trừ nhanh
        btn.addEventListener('contextmenu', (e) => { e.preventDefault(); toggleEliminate(idx); });
        btn.addEventListener('click', (e) => {
            // Vừa giữ lâu -> đã loại trừ, không tính là chọn
            if (longPressed) { e.preventDefault(); e.stopImmediatePropagation(); longPressed = false; return; }
            // Đang bôi đen chữ trong đáp án (để ghi chú) -> không tính là chọn đáp án
            const sel = window.getSelection();
            if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) {
                e.preventDefault(); e.stopImmediatePropagation(); return;
            }
            // Chạm vào đáp án đã loại -> KHÔI PHỤC thay vì chọn (tránh chọn nhầm)
            const elim = state.eliminatedAnswers[state.currentIndex] || [];
            if (elim.includes(idx)) {
                e.preventDefault(); e.stopImmediatePropagation();
                toggleEliminate(idx);
                return;
            }
            handleAnswerClick(e);
        });
    });
}

// --- #9: ghi chú trực quan (bôi vàng / in đậm / in nghiêng) cho từng vùng của câu hỏi ---
// Lưu theo từng câu: { qText: [ { scope, text, type } ] }
// scope = "q" (đề), "a<idx>" (đáp án), "oe<idx>" (giải thích đáp án),
//         "note" (ghi chú ghi nhớ), "expand" (mở rộng kiến thức)
function annotStorageKey() {
    const quizId = (state.quizData && state.quizData.id) || (new URLSearchParams(window.location.search)).get('id') || 'default_quiz';
    return `quiz_annot_${quizId}`;
}
function getAnnotStore() {
    try { return JSON.parse(localStorage.getItem(annotStorageKey()) || '{}'); } catch (e) { return {}; }
}
function saveAnnotStore(store) {
    try { localStorage.setItem(annotStorageKey(), JSON.stringify(store)); } catch (e) {}
}
function getAnnotsFor(qText) {
    const store = getAnnotStore();
    return Array.isArray(store[qText]) ? store[qText] : [];
}
function addAnnot(qText, scope, text, type) {
    const store = getAnnotStore();
    const arr = Array.isArray(store[qText]) ? store[qText] : [];
    if (!arr.some(a => a.scope === scope && a.text === text && a.type === type)) {
        arr.push({ scope, text, type });
    }
    store[qText] = arr;
    saveAnnotStore(store);
    pushStudyToCloud();
}
function removeAnnot(qText, scope, text, type) {
    const store = getAnnotStore();
    if (Array.isArray(store[qText])) {
        store[qText] = store[qText].filter(a => !(a.scope === scope && a.text === text && a.type === type));
        if (store[qText].length === 0) delete store[qText];
        saveAnnotStore(store);
        pushStudyToCloud();
    }
}
function annotTag(type) { return type === 'bold' ? 'strong' : type === 'italic' ? 'em' : 'mark'; }
function annotClass(type) {
    // Tái dùng class markdown sẵn có để màu in đậm (hồng) / in nghiêng (xanh) đồng nhất
    // với phần còn lại của web và tự đổi màu theo nền đúng/sai/tối.
    if (type === 'bold') return 'quiz-annot obsidian-bold';
    if (type === 'italic') return 'quiz-annot obsidian-italic';
    return 'quiz-annot quiz-hl';
}
// Bọc các đoạn đã ghi chú trong một vùng cụ thể (bỏ qua phần đã bọc sẵn để chạy lại an toàn)
function applyAnnotsToContainer(container, annots) {
    if (!container || !annots || !annots.length) return;
    annots.forEach(a => {
        const phrase = a.text;
        if (!phrase || phrase.length < 1) return;
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
            acceptNode: (n) => {
                if (!n.nodeValue.includes(phrase)) return NodeFilter.FILTER_REJECT;
                let p = n.parentNode;
                while (p && p !== container) {
                    if (p.classList && p.classList.contains('quiz-annot')) return NodeFilter.FILTER_REJECT;
                    p = p.parentNode;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        const targets = [];
        while (walker.nextNode()) targets.push(walker.currentNode);
        targets.forEach(node => {
            const pos = node.nodeValue.indexOf(phrase);
            if (pos === -1) return;
            try {
                const range = document.createRange();
                range.setStart(node, pos);
                range.setEnd(node, pos + phrase.length);
                const el = document.createElement(annotTag(a.type));
                el.className = annotClass(a.type);
                el.setAttribute('data-annot-type', a.type);
                range.surroundContents(el);
            } catch (e) { /* vùng chọn trải qua nhiều thẻ -> bỏ qua đoạn này */ }
        });
    });
}
// Áp dụng ghi chú cho mọi vùng [data-annot] của câu đang hiển thị
function applyAnnotationsAll() {
    const quizSection = document.getElementById('quizSection');
    if (!quizSection) return;
    const question = state.questions[state.currentIndex];
    if (!question) return;
    const annots = getAnnotsFor(question.question);
    if (!annots.length) return;
    quizSection.querySelectorAll('[data-annot]').forEach(el => {
        const scope = el.getAttribute('data-annot');
        applyAnnotsToContainer(el, annots.filter(a => a.scope === scope));
    });
}
function setupAnnotations() {
    const toolbar = document.getElementById('annot-toolbar');
    if (!toolbar) return;

    let activeScope = null;
    const hide = () => { toolbar.classList.remove('show'); activeScope = null; };
    const scopeOf = (node) => {
        const el = node && node.nodeType === 3 ? node.parentElement : node;
        return el && el.closest ? el.closest('#quizSection [data-annot]') : null;
    };
    const onSelect = () => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) { hide(); return; }
        const text = sel.toString().trim();
        if (text.length < 1) { hide(); return; }
        // Vùng chọn phải nằm gọn trong MỘT vùng cho phép ghi chú
        const a = scopeOf(sel.anchorNode);
        const b = scopeOf(sel.focusNode);
        if (!a || a !== b) { hide(); return; }
        activeScope = a.getAttribute('data-annot');
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        toolbar.style.left = (rect.left + rect.width / 2) + 'px';
        toolbar.style.top = (rect.top - 8) + 'px';
        toolbar.classList.add('show');
    };
    document.addEventListener('mouseup', () => setTimeout(onSelect, 10));
    document.addEventListener('touchend', () => setTimeout(onSelect, 10));
    // Giữ vùng chọn khi nhấn nút công cụ (đừng để mousedown xóa selection)
    toolbar.addEventListener('mousedown', (e) => e.preventDefault());
    toolbar.querySelectorAll('[data-annot-action]').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.getAttribute('data-annot-action');
            const sel = window.getSelection();
            const text = sel ? sel.toString().trim() : '';
            const question = state.questions[state.currentIndex];
            if (text.length >= 1 && question && activeScope) {
                addAnnot(question.question, activeScope, text, type);
                sel.removeAllRanges();
                hide();
                showQuestion(); // vẽ lại để áp dụng định dạng
            }
        });
    });
    // Bấm vào một đoạn đã ghi chú để gỡ (capture để không kích hoạt chọn đáp án)
    document.addEventListener('click', (e) => {
        const mark = e.target.closest && e.target.closest('.quiz-annot');
        if (!mark) return;
        const cont = mark.closest('#quizSection [data-annot]');
        if (!cont) return;
        e.preventDefault();
        e.stopPropagation();
        const question = state.questions[state.currentIndex];
        if (question) {
            const scope = cont.getAttribute('data-annot');
            const type = mark.getAttribute('data-annot-type') || 'highlight';
            removeAnnot(question.question, scope, mark.textContent, type);
            showQuestion();
        }
    }, true);
}

// --- #13 (bổ sung): phóng to ảnh trong đề ---
function setupLightbox() {
    const lb = document.getElementById('img-lightbox');
    if (!lb) return;
    const lbImg = lb.querySelector('img');
    document.addEventListener('click', (e) => {
        const img = e.target.closest && e.target.closest('img.quiz-image');
        if (img) {
            lbImg.src = img.src;
            lb.classList.remove('hidden');
            requestAnimationFrame(() => lb.classList.add('show'));
        }
    });
    const close = () => {
        lb.classList.remove('show');
        setTimeout(() => { lb.classList.add('hidden'); lbImg.src = ''; }, 200);
    };
    lb.addEventListener('click', close);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !lb.classList.contains('hidden')) close(); });
}

// --- #1 + #15: bảng thiết lập nổi (Dark / Âm thanh / Rung) ---
function setupSettings() {
    const fab = document.getElementById('quiz-settings-fab');
    const pop = document.getElementById('quiz-settings-popover');
    const rowDark = document.getElementById('qs-dark');
    const rowSound = document.getElementById('qs-sound');
    const rowVibrate = document.getElementById('qs-vibrate');
    const bgOpacityInput = document.getElementById('qs-bg-opacity');
    const rowShuffleBg = document.getElementById('qs-shuffle-bg');
    if (!fab || !pop) return;

    const sync = () => {
        if (rowDark) rowDark.setAttribute('aria-checked', getTheme() === 'dark');
        if (rowSound) rowSound.setAttribute('aria-checked', getSound());
        if (rowVibrate) rowVibrate.setAttribute('aria-checked', getVibrate());
        if (bgOpacityInput) bgOpacityInput.value = getBgOpacity();
        applyBgOpacity(getBgOpacity());
    };
    sync();

    fab.addEventListener('click', (e) => { e.stopPropagation(); pop.classList.toggle('hidden-pop'); });
    document.addEventListener('click', (e) => {
        if (!pop.classList.contains('hidden-pop') && !pop.contains(e.target) && e.target !== fab && !fab.contains(e.target)) {
            pop.classList.add('hidden-pop');
        }
    });

    const setLS = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
    if (rowDark) rowDark.addEventListener('click', () => {
        const dark = getTheme() !== 'dark';
        setLS('quiz_theme', dark ? 'dark' : 'light');
        document.documentElement.classList.toggle('theme-dark', dark);
        sync();
    });
    if (rowSound) rowSound.addEventListener('click', () => {
        const on = !getSound();
        setLS('quiz_sound', on ? '1' : '0');
        if (on) playTone(true); // nghe thử
        sync();
    });
    if (rowVibrate) rowVibrate.addEventListener('click', () => {
        const on = !getVibrate();
        setLS('quiz_vibrate', on ? '1' : '0');
        if (on && navigator.vibrate) navigator.vibrate(20);
        sync();
    });
    if (bgOpacityInput) {
        // Áp ngay khi đang kéo cho cảm giác trực quan; lưu lại để nhớ cho bài sau
        bgOpacityInput.addEventListener('input', () => {
            const pct = Math.max(0, Math.min(60, parseInt(bgOpacityInput.value, 10) || 0));
            applyBgOpacity(pct);
            setLS('quiz_bg_opacity', String(pct));
        });
        // Không đóng popover khi tương tác với thanh trượt
        bgOpacityInput.addEventListener('click', (e) => e.stopPropagation());
    }
    if (rowShuffleBg) rowShuffleBg.addEventListener('click', (e) => {
        // Giữ popover mở để bấm đổi liên tục cho tới khi ưng ý
        e.stopPropagation();
        if (typeof window.shuffleQuizBg === 'function') {
            window.shuffleQuizBg();
            showToast('Đã đổi ảnh nền 🎨');
        }
    });
}

// --- Kéo giãn độ rộng 3 cột (số câu | bài làm | ghi chú), nhớ riêng theo thiết bị ---
// Mỗi cột bên có giới hạn min/max; bề rộng lưu vào localStorage (px) theo từng máy.
const COLUMN_RESIZE = {
    nav:  { min: 120, max: 320, key: 'quiz_nav_w',  cssVar: '--quiz-nav-w',  panelId: 'quiz-nav-panel' },
    note: { min: 150, max: 380, key: 'quiz_note_w', cssVar: '--quiz-note-w', panelId: 'quiz-note-panel' }
};

function applyStoredColumnWidths() {
    const ws = document.getElementById('quiz-workspace');
    if (!ws) return;
    Object.values(COLUMN_RESIZE).forEach(cfg => {
        let v = parseInt(localStorage.getItem(cfg.key), 10);
        if (!isNaN(v)) {
            v = Math.max(cfg.min, Math.min(cfg.max, v));
            ws.style.setProperty(cfg.cssVar, v + 'px');
        }
    });
}

function resetColumnWidths() {
    const ws = document.getElementById('quiz-workspace');
    if (!ws) return;
    Object.values(COLUMN_RESIZE).forEach(cfg => {
        ws.style.removeProperty(cfg.cssVar);
        try { localStorage.removeItem(cfg.key); } catch (e) {}
    });
}

function setupResizers() {
    const ws = document.getElementById('quiz-workspace');
    if (!ws) return;
    applyStoredColumnWidths();

    ws.querySelectorAll('.quiz-resizer').forEach(handle => {
        const cfg = COLUMN_RESIZE[handle.getAttribute('data-resize')];
        if (!cfg) return;
        const panel = document.getElementById(cfg.panelId);
        if (!panel) return;
        const isNav = handle.getAttribute('data-resize') === 'nav';

        let startX = 0, startW = 0;
        const onPointerMove = (e) => {
            const delta = e.clientX - startX;
            // Kéo phải nới rộng cột số câu; cột ghi chú thì ngược lại
            let w = isNav ? startW + delta : startW - delta;
            w = Math.max(cfg.min, Math.min(cfg.max, w));
            ws.style.setProperty(cfg.cssVar, Math.round(w) + 'px');
        };
        const onPointerUp = () => {
            handle.classList.remove('is-dragging');
            document.body.classList.remove('quiz-resizing');
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            try { localStorage.setItem(cfg.key, String(Math.round(panel.getBoundingClientRect().width))); } catch (e) {}
        };
        handle.addEventListener('pointerdown', (e) => {
            // Chỉ kéo ở bố cục 3 cột (desktop), bỏ qua khi đang ở chế độ tập trung
            if (window.innerWidth < 1024 || document.body.classList.contains('focus-mode-active')) return;
            e.preventDefault();
            startX = e.clientX;
            startW = panel.getBoundingClientRect().width;
            handle.classList.add('is-dragging');
            document.body.classList.add('quiz-resizing');
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
        });
        // Bấm đúp tay kéo: trả riêng cột này về mặc định
        handle.addEventListener('dblclick', () => {
            ws.style.removeProperty(cfg.cssVar);
            try { localStorage.removeItem(cfg.key); } catch (e) {}
        });
    });

    const resetBtn = document.getElementById('reset-layout-btn');
    if (resetBtn) resetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetColumnWidths();
        showToast('Đã khôi phục độ rộng cột mặc định');
    });
}

// --- #3: vuốt trái/phải để chuyển câu (mobile) ---
function setupSwipe() {
    const section = document.getElementById('quizSection');
    if (!section) return;
    let startX = 0, startY = 0, tracking = false;
    section.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) { tracking = false; return; }
        // Không cướp thao tác trên vùng cần tương tác / chọn chữ
        if (e.target.closest('button, a, textarea, input, .answer-btn, table, .question-text, mark, .quiz-annot, .quiz-image, .mermaid')) {
            tracking = false; return;
        }
        tracking = true;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    }, { passive: true });
    section.addEventListener('touchend', (e) => {
        if (!tracking) return;
        tracking = false;
        const t = e.changedTouches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        if (Math.abs(dx) < 60 || Math.abs(dy) > 45) return; // phải đủ ngang & dứt khoát
        if (window.getSelection && window.getSelection().toString().trim()) return; // đang chọn chữ
        if (dx < 0) {
            // vuốt sang trái -> câu tiếp (không nộp bài ở câu cuối)
            if (state.currentIndex < state.questions.length - 1) showNextQuestion();
        } else {
            // vuốt sang phải -> câu trước
            if (state.currentIndex > 0 && state.quizMode !== 'practice') showPreviousQuestion();
        }
    }, { passive: true });
}

// --- Chạm vào CẠNH trái/phải màn hình để chuyển câu (mobile) ---
// Không vẽ gì cả: chỉ lắng nghe cú chạm nhanh ở rìa màn hình, nên không che nội dung.
// Tự động "chừa" các nút/điều khiển nhờ kiểm tra closest() y như khi vuốt.
function setupEdgeTap() {
    // Bề rộng vùng chạm ở mỗi rìa: ~9% màn hình, tối thiểu 34px, tối đa 64px
    const edgeWidth = () => Math.max(34, Math.min(64, window.innerWidth * 0.09));
    let sx = 0, sy = 0, st = 0, tracking = false;

    document.addEventListener('touchstart', (e) => {
        // Chỉ ở màn hình hẹp (mobile/tablet), và chỉ khi đang làm bài
        if (window.innerWidth >= 1024 || e.touches.length !== 1) { tracking = false; return; }
        if (!document.body.classList.contains('quiz-active')) { tracking = false; return; }
        if (document.body.classList.contains('focus-mode-active')) { tracking = false; return; }
        const x = e.touches[0].clientX;
        const ew = edgeWidth();
        // Chỉ quan tâm cú chạm bắt đầu ở rìa trái hoặc rìa phải
        if (x > ew && x < window.innerWidth - ew) { tracking = false; return; }
        // Chừa ra các nút bấm / vùng tương tác / chữ chọn được
        if (e.target.closest('button, a, textarea, input, select, label, .answer-btn, table, .question-text, mark, .quiz-annot, .quiz-image, .mermaid, .qs-row, #quiz-settings-popover, #quiz-settings-fab, #quiz-mobile-menu')) {
            tracking = false; return;
        }
        tracking = true;
        sx = x;
        sy = e.touches[0].clientY;
        st = Date.now();
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (!tracking) return;
        tracking = false;
        const t = e.changedTouches[0];
        // Phải là một cú CHẠM dứt khoát: nhanh & gần như không di chuyển (không phải vuốt/cuộn)
        if (Date.now() - st > 400) return;
        if (Math.abs(t.clientX - sx) > 12 || Math.abs(t.clientY - sy) > 12) return;
        if (window.getSelection && window.getSelection().toString().trim()) return; // đang chọn chữ
        if (sx <= edgeWidth()) {
            // Chạm rìa TRÁI -> câu trước
            if (state.currentIndex > 0 && state.quizMode !== 'practice') showPreviousQuestion();
        } else {
            // Chạm rìa PHẢI -> câu tiếp (không tự nộp bài ở câu cuối)
            if (state.currentIndex < state.questions.length - 1) showNextQuestion();
        }
    }, { passive: true });
}

function setupFontSizeControls() {
    const btnSmall = document.getElementById('font-size-small');
    const btnNormal = document.getElementById('font-size-normal');
    const btnLarge = document.getElementById('font-size-large');
    if (!btnSmall || !btnNormal || !btnLarge) return;

    function updateActiveButton(size) {
        [btnSmall, btnNormal, btnLarge].forEach(btn => {
            btn.classList.remove('bg-pink-500', 'text-white');
            btn.classList.add('text-gray-600', 'hover:bg-pink-100');
        });
        let activeBtn = btnNormal;
        if (size === 'small') activeBtn = btnSmall;
        else if (size === 'large') activeBtn = btnLarge;

        activeBtn.classList.remove('text-gray-600', 'hover:bg-pink-100');
        activeBtn.classList.add('bg-pink-500', 'text-white');
    }

    updateActiveButton(state.currentFontSize);

    btnSmall.onclick = () => {
        state.currentFontSize = 'small';
        localStorage.setItem('quiz_font_size', 'small');
        updateActiveButton('small');
        const quizContainer = document.getElementById('quiz-container');
        if (quizContainer && !quizContainer.classList.contains('hidden')) {
            showQuestion();
        }
    };
    btnNormal.onclick = () => {
        state.currentFontSize = 'normal';
        localStorage.setItem('quiz_font_size', 'normal');
        updateActiveButton('normal');
        const quizContainer = document.getElementById('quiz-container');
        if (quizContainer && !quizContainer.classList.contains('hidden')) {
            showQuestion();
        }
    };
    btnLarge.onclick = () => {
        state.currentFontSize = 'large';
        localStorage.setItem('quiz_font_size', 'large');
        updateActiveButton('large');
        const quizContainer = document.getElementById('quiz-container');
        if (quizContainer && !quizContainer.classList.contains('hidden')) {
            showQuestion();
        }
    };
}

function handle5050Help() {
    if (state.userAnswers[state.currentIndex] !== null || state.used5050Questions[state.currentIndex]) return;

    const correctAnswerIdx = state.questions[state.currentIndex].correctAnswerIndex;
    const answerBtns = document.querySelectorAll('.answer-btn');
    if (answerBtns.length <= 2) {
        showToast('Không thể sử dụng 50:50 khi số đáp án ít hơn hoặc bằng 2!');
        return;
    }

    const incorrectIndices = [];
    answerBtns.forEach((btn, idx) => {
        if (idx !== correctAnswerIdx) {
            incorrectIndices.push(idx);
        }
    });

    for (let i = incorrectIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [incorrectIndices[i], incorrectIndices[j]] = [incorrectIndices[j], incorrectIndices[i]];
    }

    const toHide = incorrectIndices.slice(0, 2);
    
    answerBtns.forEach((btn, idx) => {
        if (toHide.includes(idx)) {
            btn.disabled = true;
            btn.classList.add('opacity-20', 'border-gray-300', 'cursor-not-allowed');
            btn.classList.remove('hover:bg-[#FFB6C1]/50', 'hover:border-[#FF69B4]', 'hover:scale-[1.01]', 'hover:-translate-y-0.5');
        }
    });

    state.used5050Questions[state.currentIndex] = toHide;
    
    const btn5050 = document.getElementById('help-5050-btn');
    if (btn5050) {
        btn5050.disabled = true;
        btn5050.classList.add('opacity-50', 'cursor-not-allowed');
        btn5050.classList.remove('hover:bg-blue-100');
    }

    // Pill độ chắc chắn -> trạng thái tự động "Đã dùng trợ giúp" (khóa, không bấm đổi nữa)
    const confBtn = document.getElementById('confidence-toggle');
    if (confBtn) {
        confBtn.classList.remove('conf-guess');
        confBtn.classList.add('conf-helped');
        confBtn.disabled = true;
        confBtn.setAttribute('title', 'Bạn đã dùng trợ giúp 50:50 cho câu này');
        confBtn.innerHTML = '<i class="fas fa-life-ring"></i> Đã dùng trợ giúp';
    }

    // Tự đánh dấu câu là "Hay, để dành xem lại" — không ghi đè nếu đã được đánh dấu lý do khác
    let autoMarked = false;
    if (!state.markedQuestions.includes(state.currentIndex)) {
        applyMark(state.currentIndex, 'interesting');
        autoMarked = true;
        const markControl = document.getElementById('mark-control');
        if (markControl) {
            markControl.outerHTML = renderMarkControl();
            setupMarkControl();
        }
        refreshMarkedPanel();
    }

    showToast(autoMarked
        ? 'Đã loại 2 đáp án sai • Đánh dấu câu "Hay, để dành xem lại"'
        : 'Đã loại bỏ 2 đáp án sai!');
}

function handleToggleFocusMode() {
    toggleFocusMode();
    const navWrapper = document.getElementById('question-nav-wrapper');
    if (state.focusMode) {
        if (navWrapper) navWrapper.style.display = 'none';
    } else {
        setNavVisibility(navVisible);
    }
}

function setupFocusModeControls() {
    const focusModeBtn = document.getElementById('focus-mode-btn');
    const exitFocusBtn = document.getElementById('exit-focus-btn');
    if (focusModeBtn) focusModeBtn.onclick = handleToggleFocusMode;
    if (exitFocusBtn) exitFocusBtn.onclick = handleToggleFocusMode;
}

// Kéo dữ liệu học tập từ cloud về máy này (chạy 1 lần khi đã biết người dùng).
// Gọi ngay nếu đã đăng nhập; nếu auth resolve muộn thì chờ qua onAuthStateChanged.
let _studyPulled = false;
function pullStudyFromCloud(quizId) {
    const run = (uid) => {
        if (_studyPulled || !uid) return;
        _studyPulled = true;
        syncPullStudy(uid, quizId, { preferCloud: false }).then(() => {
            // Sao lưu ngay bản đã hợp nhất (đề phòng ghi chú cũ chỉ có ở máy này)
            scheduleCloudPush(uid, quizId, 800);
            // Nếu đang hiển thị một câu hỏi, vẽ lại để áp dụng ghi chú/annotation mới kéo về
            const sec = document.getElementById('quizSection');
            if (state.questions && state.questions.length && sec && !sec.classList.contains('hidden')) {
                try { showQuestion(); } catch (e) {}
            }
        });
    };
    if (auth.currentUser) run(auth.currentUser.uid);
    else onAuthStateChanged(auth, (u) => { if (u) run(u.uid); });
}

async function loadQuizData() {
    const urlParams = new URLSearchParams(window.location.search);
    const quizId = urlParams.get('id');

    if (!quizId) {
        document.body.innerHTML = `<div class="text-center text-red-500">Lỗi: Không tìm thấy ID của bộ đề.</div>`;
        return;
    }

    // Dùng bộ đề đã tải về máy (IndexedDB) để bắt đầu làm bài.
    const useOfflineData = (data) => {
        state.quizData = data;
        state.quizData.id = quizId;
        applyLocalQuestionEdits();
        state.originalQuestions = state.quizData.questions;
        loadQuizDetails();
        pullStudyFromCloud(quizId);
    };

    // Nếu đang ngoại tuyến, thử dùng bản đã tải về máy trước (không phải chờ mạng timeout).
    if (!navigator.onLine) {
        const offline = await getOfflineQuiz(quizId);
        if (offline) {
            useOfflineData(offline);
            showToast('Đang dùng bản đã tải về máy (ngoại tuyến).', 'info');
            return;
        }
    }

    try {
        const docRef = doc(db, "quiz_sets", quizId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            state.quizData = docSnap.data();
            state.quizData.id = quizId; // Make sure id is stored in state
            // Áp dụng các chỉnh sửa câu hỏi đã lưu cục bộ trên thiết bị này (nếu không phải chủ bộ đề)
            applyLocalQuestionEdits();
            state.originalQuestions = state.quizData.questions;
            loadQuizDetails();
            // Nếu bộ đề này đã được tải về máy, cập nhật lại bản offline để giữ dữ liệu mới nhất.
            refreshOfflineQuizIfSaved(quizId, docSnap.data());
            // Kéo ghi chú / đánh dấu / bôi vàng đã sao lưu trên cloud về máy này.
            // Hợp nhất vào localStorage trước khi người dùng bắt đầu làm bài.
            pullStudyFromCloud(quizId);
        } else {
            document.getElementById('quiz-title').textContent = "Lỗi";
            document.getElementById('quiz-info').textContent = "Không tìm thấy bộ đề này.";
        }
    } catch (error) {
        console.error("Lỗi tải dữ liệu bộ đề:", error);
        // Mất mạng / lỗi server: thử dùng bản đã tải về máy nếu có.
        const offline = await getOfflineQuiz(quizId);
        if (offline) {
            useOfflineData(offline);
            showToast('Mất kết nối — đang dùng bản đã tải về máy.', 'info');
            return;
        }
        document.getElementById('quiz-title').textContent = "Lỗi";
        document.getElementById('quiz-info').textContent = "Đã xảy ra lỗi khi tải dữ liệu. Bộ đề này chưa được tải về máy để làm offline.";
    }
}

function startQuizMode(questionsArray, mode = 'normal', restoreState = null) {
    if (mode === 'normal' || mode === 'practice') {
        showSubmitQuizBtn(true);
    } else {
        showSubmitQuizBtn(false);
    }
    state.quizMode = mode;
    state.questions = questionsArray;

    const quizLanding = document.getElementById('quiz-landing');
    const quizContainer = document.getElementById('quiz-container');
    const quizSection = document.getElementById('quizSection');
    const resultsSection = document.getElementById('resultsSection');

    if (!state.questions || state.questions.length === 0) {
        quizContainer.innerHTML = `<p class="text-red-500">Lỗi: Không có dữ liệu câu hỏi để bắt đầu.</p>`;
        return;
    }

    if (restoreState) {
        state.currentIndex = restoreState.currentIndex || 0;
        state.userAnswers = restoreState.userAnswers || new Array(state.questions.length).fill(null);
        state.score = restoreState.score || 0;
        state.markedQuestions = restoreState.markedQuestions || [];
        state.markedReasons = restoreState.markedReasons || {};
        state.eliminatedAnswers = restoreState.eliminatedAnswers || {};
        state.confidence = restoreState.confidence || {};
        state.questionTimes = restoreState.questionTimes || new Array(state.questions.length).fill(0);
        state.quizStartTime = restoreState.quizStartTime ? new Date(restoreState.quizStartTime) : new Date();
    } else {
        state.currentIndex = 0;
        state.userAnswers = new Array(state.questions.length).fill(null);
        state.score = 0;
        state.quizStartTime = new Date();
        state.markedQuestions = [];
        state.markedReasons = {};
        state.streak = 0;
        state.used5050Questions = {};
        state.eliminatedAnswers = {};
        state.confidence = {};
        state.questionTimes = new Array(state.questions.length).fill(0);
    }
    state._timingIndex = null;
    state._timingEnterAt = 0;

    if (state.quizTimerInterval) clearInterval(state.quizTimerInterval);
    if (state.quizOptions.isTimed) {
        let totalSeconds = 0;
        if (state.quizOptions.timedMinutes && !isNaN(state.quizOptions.timedMinutes)) {
            totalSeconds = state.quizOptions.timedMinutes * 60;
        }
        startTimer(totalSeconds);
    }

    quizLanding.classList.add('hidden');
    quizLanding.classList.remove('quiz-landing-leaving');
    quizContainer.classList.remove('hidden');
    // Khởi động lại hiệu ứng "vào màn" mỗi lần bắt đầu (kể cả khi làm lại từ kết quả)
    quizContainer.classList.remove('quiz-enter');
    void quizContainer.offsetWidth; // ép trình duyệt reflow để animation chạy lại
    quizContainer.classList.add('quiz-enter');
    quizSection.innerHTML = '';
    resultsSection.innerHTML = '';
    quizSection.classList.remove('hidden');
    resultsSection.classList.add('hidden');

    showQuestion();
    saveQuizState();

    // Tự động lưu định kỳ để không mất tiến độ (ghi chú, đáp án...) nếu trình duyệt đóng đột ngột
    if (autoSaveInterval) clearInterval(autoSaveInterval);
    autoSaveInterval = setInterval(() => {
        const resultsSection = document.getElementById('resultsSection');
        if (resultsSection && !resultsSection.classList.contains('hidden')) return;
        saveQuizState();
    }, 15000);
}

function setNavVisibility(visible) {
    const navWrapper = document.getElementById('question-nav-wrapper');
    if (navWrapper) {
        navWrapper.style.display = visible ? '' : 'none';
    }
    const toggleBtn = document.getElementById('toggle-nav-btn');
    if (toggleBtn) {
        toggleBtn.innerHTML = visible
            ? '<span class="qs-label"><i class="fas fa-eye-slash"></i> Ẩn số câu hỏi</span>'
            : '<span class="qs-label"><i class="fas fa-eye"></i> Hiện số câu hỏi</span>';
    }
}

function attachToggleNavEvent() {
    const toggleBtn = document.getElementById('toggle-nav-btn');
    if (toggleBtn) {
        toggleBtn.onclick = function() {
            navVisible = !navVisible;
            setNavVisibility(navVisible);
        };
    }
}

// Nút "Đánh dấu câu hỏi" nâng cao: bấm để mở menu chọn lý do (khó / tranh cãi / hay / ôn lại).
// Khi đã đánh dấu, nút đổi màu + nhãn theo lý do; mở lại menu để đổi lý do hoặc bỏ đánh dấu.
function renderMarkControl() {
    const idx = state.currentIndex;
    const isMarked = state.markedQuestions.includes(idx);
    const reasonKey = isMarked ? (state.markedReasons[idx] || 'review') : null;
    const r = reasonKey ? MARK_REASONS[reasonKey] : null;

    const btnClass = r
        ? 'border font-semibold'
        : 'border border-yellow-400 text-yellow-700 bg-yellow-50 hover:bg-yellow-100';
    const btnStyle = r ? `style="border-color:${r.color};color:${r.text};background:${r.bg}"` : '';

    const items = Object.entries(MARK_REASONS).map(([key, m]) => `
        <button type="button" data-mark-reason="${key}" class="mark-reason-item ${reasonKey === key ? 'is-active' : ''}">
            <span class="mark-reason-ic" style="background:${m.bg};color:${m.color}"><i class="fas ${m.icon}"></i></span>
            <span class="mark-reason-label">${m.label}</span>
            ${reasonKey === key ? '<i class="fas fa-check mark-reason-check"></i>' : ''}
        </button>`).join('');

    const unmark = isMarked ? `
        <div class="mark-menu-divider"></div>
        <button type="button" data-mark-reason="__unmark" class="mark-reason-item mark-reason-unmark">
            <span class="mark-reason-ic" style="background:#fee2e2;color:#ef4444"><i class="fas fa-flag-checkered"></i></span>
            <span class="mark-reason-label">Bỏ đánh dấu</span>
        </button>` : '';

    return `
        <div class="relative" id="mark-control">
            <button id="mark-question-btn" type="button" class="px-4 py-2 rounded-lg ${btnClass} transition flex items-center gap-2"
                    ${btnStyle} aria-haspopup="true" aria-expanded="false" title="Đánh dấu câu hỏi theo lý do">
                <i class="fas ${r ? r.icon : 'fa-flag'}"></i>
                <span>${r ? r.short : 'Đánh dấu'}</span>
                <i class="fas fa-chevron-down text-xs opacity-70"></i>
            </button>
            <div id="mark-menu" class="mark-menu hidden">
                <div class="mark-menu-title">Lý do đánh dấu</div>
                ${items}
                ${unmark}
            </div>
        </div>`;
}

// Cập nhật trạng thái đánh dấu của một câu theo lý do ('__unmark' để bỏ đánh dấu)
function applyMark(idx, reason) {
    if (reason === '__unmark') {
        state.markedQuestions = state.markedQuestions.filter(i => i !== idx);
        delete state.markedReasons[idx];
    } else {
        if (!state.markedQuestions.includes(idx)) state.markedQuestions.push(idx);
        state.markedReasons[idx] = reason;
    }
    saveQuizState();
    // Lưu bền theo nội dung câu hỏi + đồng bộ cloud (cho trang Lịch sử)
    const q = state.questions[idx];
    if (q) persistMarkByText(q.question, reason);
}

// Nối sự kiện cho nút đánh dấu + menu lý do của câu hiện tại.
// (Đóng menu khi bấm ra ngoài được xử lý bởi 1 listener toàn cục đăng ký lúc DOMContentLoaded.)
function setupMarkControl() {
    const markBtn = document.getElementById('mark-question-btn');
    const markMenu = document.getElementById('mark-menu');
    if (!markBtn || !markMenu) return;

    markBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = markMenu.classList.contains('hidden');
        markMenu.classList.toggle('hidden', !willOpen);
        markBtn.setAttribute('aria-expanded', String(willOpen));
    });

    markMenu.querySelectorAll('[data-mark-reason]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            applyMark(state.currentIndex, item.getAttribute('data-mark-reason'));
            showQuestion();
        });
    });
}

// ===== "Câu đã đánh dấu" trong bảng thiết lập (góc trái) =====
// Rút gọn nội dung câu hỏi (bỏ markdown/latex, escape HTML) để hiện preview gọn trong danh sách.
function plainSnippet(str, max = 52) {
    let s = String(str || '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')   // ảnh markdown
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')  // [text](url) -> text
        .replace(/[`*_#>~$]/g, '')                // ký hiệu markdown/latex
        .replace(/\s+/g, ' ')
        .trim();
    if (s.length > max) s = s.slice(0, max).trim() + '…';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Dựng lại danh sách câu đã đánh dấu + số đếm; ẩn cả khối khi chưa đánh dấu câu nào.
function refreshMarkedPanel() {
    const control = document.getElementById('marked-control');
    const panel = document.getElementById('marked-list-panel');
    const badge = document.getElementById('marked-count-badge');
    if (!control || !panel) return;

    const marked = [...state.markedQuestions].sort((a, b) => a - b);
    if (badge) badge.textContent = String(marked.length);
    control.classList.toggle('hidden', marked.length === 0);
    if (marked.length === 0) {
        panel.innerHTML = '';
        panel.classList.add('hidden');
        const tb = document.getElementById('marked-list-btn');
        if (tb) tb.setAttribute('aria-expanded', 'false');
        return;
    }

    panel.innerHTML = marked.map(idx => {
        const q = state.questions[idx];
        const rk = state.markedReasons[idx] || 'review';
        const r = MARK_REASONS[rk] || MARK_REASONS.review;
        const answered = state.userAnswers[idx] !== null && state.userAnswers[idx] !== undefined;
        const isCurrent = idx === state.currentIndex;
        const snippet = plainSnippet(q && q.question);
        return `
            <div class="qs-marked-item ${isCurrent ? 'qs-marked-current' : ''}" data-marked-idx="${idx}" role="menuitem" tabindex="0" title="Tới câu ${idx + 1}">
                <span class="qs-marked-num" style="background:${r.color}">${idx + 1}</span>
                <span class="qs-marked-body">
                    <span class="qs-marked-reason" style="color:${r.text}"><i class="fas ${r.icon}"></i> ${r.short}${answered ? '' : ' · <span class="qs-marked-todo">chưa làm</span>'}</span>
                    <span class="qs-marked-text">${snippet || 'Câu ' + (idx + 1)}</span>
                </span>
                <button type="button" class="qs-marked-unmark" data-unmark-idx="${idx}" title="Bỏ đánh dấu câu ${idx + 1}" aria-label="Bỏ đánh dấu câu ${idx + 1}"><i class="fas fa-times"></i></button>
            </div>`;
    }).join('');
}

// Nối sự kiện cho khối "Câu đã đánh dấu" (gọi 1 lần lúc khởi tạo; dùng ủy quyền sự kiện).
function setupMarkedList() {
    const toggleBtn = document.getElementById('marked-list-btn');
    const panel = document.getElementById('marked-list-panel');
    const pop = document.getElementById('quiz-settings-popover');
    if (!toggleBtn || !panel) return;

    // Mở/đóng danh sách trong popover (không đóng popover)
    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = panel.classList.contains('hidden');
        panel.classList.toggle('hidden', !willOpen);
        toggleBtn.setAttribute('aria-expanded', String(willOpen));
        if (willOpen) {
            // Cuộn mục câu hiện tại vào tầm nhìn nếu có
            const cur = panel.querySelector('.qs-marked-current');
            if (cur) cur.scrollIntoView({ block: 'nearest' });
        }
    });

    const jumpTo = (idx) => {
        if (isNaN(idx)) return;
        state.currentIndex = idx;
        if (pop) pop.classList.add('hidden-pop');     // đóng popover sau khi nhảy câu
        showQuestion();
    };

    panel.addEventListener('click', (e) => {
        e.stopPropagation();
        const unmarkBtn = e.target.closest('[data-unmark-idx]');
        if (unmarkBtn) {
            const idx = parseInt(unmarkBtn.getAttribute('data-unmark-idx'), 10);
            applyMark(idx, '__unmark');
            // Giữ popover & danh sách đang mở; cập nhật lại nav + thẻ câu hiện tại
            showQuestion();
            showToast('Đã bỏ đánh dấu câu ' + (idx + 1));
            return;
        }
        const item = e.target.closest('[data-marked-idx]');
        if (item) jumpTo(parseInt(item.getAttribute('data-marked-idx'), 10));
    });

    // Bàn phím: Enter/Space để nhảy tới câu đang focus
    panel.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const item = e.target.closest('[data-marked-idx]');
        if (item) {
            e.preventDefault();
            e.stopPropagation();   // không để lọt xuống phím tắt làm bài toàn cục
            jumpTo(parseInt(item.getAttribute('data-marked-idx'), 10));
        }
    });
}

// Markup panel ghi chú cá nhân (đặt ở cột phải; logic được nối trong showQuestion)
function renderPersonalNotePanel() {
    return `
        <div id="personal-note-box" class="quiz-note-box">
            <button type="button" id="note-toggle" class="quiz-note-header" aria-expanded="true" aria-controls="note-body">
                <span class="quiz-note-title">
                    <i class="fas fa-sticky-note"></i> Ghi chú cá nhân
                    <span id="note-dot" class="quiz-note-dot hidden" title="Câu này đã có ghi chú"></span>
                </span>
                <span class="quiz-note-meta">
                    <span id="note-save-status" class="text-xs font-medium opacity-0 transition-opacity duration-300">
                        <i class="fas fa-check-circle mr-1"></i>Đã lưu
                    </span>
                    <i id="note-chevron" class="fas fa-chevron-up quiz-note-chevron"></i>
                </span>
            </button>
            <div id="note-body" class="quiz-note-body">
                <textarea id="personal-note-input"
                    class="quiz-note-input"
                    rows="2"
                    placeholder="Nhập ghi chú cho câu hỏi này — tự động lưu, hiển thị cả ở chế độ tập trung..."></textarea>
                <div class="quiz-note-footer">
                    <span id="note-char-count" class="quiz-note-count">Chưa có ghi chú</span>
                    <button type="button" id="note-clear-btn" class="quiz-note-clear hidden">
                        <i class="fas fa-eraser mr-1"></i>Xóa ghi chú
                    </button>
                </div>
            </div>
        </div>`;
}

// Nối logic ghi chú cá nhân cho câu hiện tại: nạp nội dung đã lưu, tự lưu, tự giãn,
// đếm ký tự, thu gọn/mở rộng, xóa nhanh. Tách riêng để chạy được trên mọi nhánh render.
function setupPersonalNote(question) {
    const noteInput = document.getElementById('personal-note-input');
    const noteStatus = document.getElementById('note-save-status');
    if (!noteInput) return;

    const noteBox = document.getElementById('personal-note-box');
    const noteToggle = document.getElementById('note-toggle');
    const noteDot = document.getElementById('note-dot');
    const noteCount = document.getElementById('note-char-count');
    const noteClearBtn = document.getElementById('note-clear-btn');

    const quizIdKey = (state.quizData && state.quizData.id) || (new URLSearchParams(window.location.search)).get('id') || 'default_quiz';
    const storageKey = `quiz_notes_${quizIdKey}`;
    let notesObj = {};
    try {
        notesObj = JSON.parse(localStorage.getItem(storageKey) || '{}');
    } catch(e) {
        console.error("Lỗi đọc ghi chú cá nhân:", e);
    }

    const qText = question.question;
    noteInput.value = notesObj[qText] || '';

    // Tự giãn chiều cao textarea theo nội dung (giới hạn rồi cuộn)
    const autoGrow = () => {
        noteInput.style.height = 'auto';
        noteInput.style.height = Math.min(noteInput.scrollHeight, 260) + 'px';
    };
    // Cập nhật bộ đếm ký tự, chấm báo có ghi chú, nút xóa
    const refreshMeta = () => {
        const len = noteInput.value.length;
        const has = noteInput.value.trim().length > 0;
        if (noteCount) noteCount.textContent = has ? `${len} ký tự` : 'Chưa có ghi chú';
        if (noteDot) noteDot.classList.toggle('hidden', !has);
        if (noteClearBtn) noteClearBtn.classList.toggle('hidden', !has);
    };

    // Trạng thái lưu (đang lưu / đã lưu / lỗi)
    const showSaving = () => {
        if (!noteStatus) return;
        noteStatus.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Đang lưu...';
        noteStatus.classList.remove('opacity-0', 'text-green-600', 'text-red-500');
        noteStatus.classList.add('opacity-100', 'text-gray-500');
    };
    const showSaved = () => {
        if (!noteStatus) return;
        noteStatus.innerHTML = '<i class="fas fa-check-circle mr-1"></i>Đã lưu';
        noteStatus.classList.remove('text-gray-500', 'text-red-500', 'opacity-0');
        noteStatus.classList.add('text-green-600', 'opacity-100');
        clearTimeout(noteStatus._hideT);
        noteStatus._hideT = setTimeout(() => {
            noteStatus.classList.add('opacity-0');
            noteStatus.classList.remove('opacity-100');
        }, 1500);
    };
    const showError = () => {
        if (!noteStatus) return;
        noteStatus.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i>Lỗi khi lưu';
        noteStatus.classList.remove('text-gray-500', 'text-green-600', 'opacity-0');
        noteStatus.classList.add('text-red-500', 'opacity-100');
    };

    const persist = (val) => {
        try {
            const currentNotes = JSON.parse(localStorage.getItem(storageKey) || '{}');
            if (val.trim() === '') {
                delete currentNotes[qText];
            } else {
                currentNotes[qText] = val;
            }
            localStorage.setItem(storageKey, JSON.stringify(currentNotes));
            showSaved();
            pushStudyToCloud();
        } catch(err) {
            console.error("Lỗi lưu ghi chú:", err);
            showError();
        }
    };

    // Khởi tạo hiển thị
    autoGrow();
    refreshMeta();

    // Thu gọn / mở rộng panel (ghi nhớ lựa chọn cho toàn phiên)
    if (noteToggle && noteBox) {
        const collapsed = localStorage.getItem('quiz_note_collapsed') === '1';
        noteBox.classList.toggle('collapsed', collapsed);
        noteToggle.setAttribute('aria-expanded', String(!collapsed));
        noteToggle.addEventListener('click', () => {
            const nowCollapsed = !noteBox.classList.contains('collapsed');
            noteBox.classList.toggle('collapsed', nowCollapsed);
            noteToggle.setAttribute('aria-expanded', String(!nowCollapsed));
            localStorage.setItem('quiz_note_collapsed', nowCollapsed ? '1' : '0');
            if (!nowCollapsed) autoGrow();
        });
    }

    let saveTimeout;
    noteInput.addEventListener('input', () => {
        autoGrow();
        refreshMeta();
        clearTimeout(saveTimeout);
        showSaving();
        saveTimeout = setTimeout(() => persist(noteInput.value), 600);
    });
    // Lưu ngay khi rời ô nhập (không phải chờ debounce)
    noteInput.addEventListener('blur', () => {
        clearTimeout(saveTimeout);
        persist(noteInput.value);
    });
    // Nút xóa nhanh ghi chú của câu hiện tại
    if (noteClearBtn) {
        noteClearBtn.addEventListener('click', () => {
            noteInput.value = '';
            autoGrow();
            refreshMeta();
            clearTimeout(saveTimeout);
            persist('');
            noteInput.focus();
        });
    }
}

// Đếm số từ của câu hỏi (bỏ markdown/HTML/công thức để đếm sát thực tế)
function countQuestionWords(raw) {
    if (!raw) return 0;
    const text = String(raw)
        .replace(/\$[^$]*\$/g, ' ')        // công thức KaTeX $...$
        .replace(/`[^`]*`/g, ' ')          // code inline
        .replace(/<[^>]+>/g, ' ')          // thẻ HTML
        .replace(/[#*_>~\-\[\]()!]/g, ' ') // ký hiệu markdown
        .trim();
    if (!text) return 0;
    return text.split(/\s+/).length;
}

// Chọn cỡ chữ câu hỏi theo lựa chọn người dùng + độ dài câu.
// Câu > 40 từ giảm 1 bậc, > 80 từ giảm 2 bậc (tự co thêm trên mobile nhờ lớp responsive).
function getQuestionSizeClass(fontSize, rawQuestion) {
    // Thang cỡ chữ từ nhỏ -> lớn (mobile : md trở lên)
    const ladder = [
        'text-sm md:text-base',
        'text-base md:text-lg',
        'text-lg md:text-xl',
        'text-lg md:text-2xl',  // = "normal" mặc định
        'text-xl md:text-2xl',
        'text-2xl md:text-3xl', // = "large"
    ];
    const baseIdx = fontSize === 'small' ? 1 : fontSize === 'large' ? 5 : 3;
    const words = countQuestionWords(rawQuestion);
    let drop = 0;
    if (words > 80) drop = 2;
    else if (words > 40) drop = 1;
    const idx = Math.max(0, baseIdx - drop);
    return ladder[idx];
}

function showQuestion() {
    // Đang làm bài -> mở khóa nhóm điều khiển làm bài trong bảng thiết lập
    document.body.classList.add('quiz-active');
    // Chỉ cuộn lên đầu khi THỰC SỰ chuyển sang câu khác (không cuộn khi vẽ lại cùng câu
    // do đổi cỡ chữ / thêm ghi chú…) để nội dung câu hỏi luôn nằm gọn ở giữa màn hình.
    const indexChanged = _lastShownIndex !== state.currentIndex;
    _lastShownIndex = state.currentIndex;
    if (indexChanged) { hideCatMeme(); scrollQuizToTop(); }
    // Tải trước meme cho câu này ngay khi đang đọc đề -> trả lời là hiện liền, không trễ
    preloadCurrentMemes();
    updateProgressBar();
    const question = state.questions[state.currentIndex];
    const quizSection = document.getElementById('quizSection');

    let aSizeClass = 'text-base md:text-lg';
    if (state.currentFontSize === 'small') {
        aSizeClass = 'text-sm md:text-base';
    } else if (state.currentFontSize === 'large') {
        aSizeClass = 'text-lg md:text-xl';
    }
    // Cỡ chữ câu hỏi "thông minh": câu dài thì tự thu nhỏ 1–2 bậc cho dễ đọc,
    // đặc biệt trên màn hình nhỏ. Vẫn tôn trọng lựa chọn A-/A/A+ của người dùng.
    const qSizeClass = getQuestionSizeClass(state.currentFontSize, question && question.question);

    if (!question || !question.question) {
        quizSection.innerHTML = `<p class="text-red-500 text-center p-6">Lỗi: Không thể tải dữ liệu câu hỏi. Dữ liệu có thể bị hỏng.</p>`;
        return;
    }

    const answerOptions = question.answers || question.options;
    if (!answerOptions || !Array.isArray(answerOptions)) {
        quizSection.innerHTML = `<p class="text-red-500 text-center p-6">Lỗi: Câu hỏi này không có đáp án. Dữ liệu có thể bị hỏng.</p>`;
        return;
    }

    let title = state.quizMode === 'practice' ? 'Luyện tập lại' : `Câu hỏi ${state.currentIndex + 1}`;
    saveQuizState();

    startTiming(state.currentIndex);

    // #17: chỉ chuyển 1 cột khi BẢN THÂN đáp án dài (không tính phần giải thích),
    // để câu trả lời ngắn vẫn giữ bố cục 2 cột đồng nhất kể cả khi hiện giải thích.
    const useSingleCol = answersNeedSingleColumn(answerOptions);
    const answersGridClass = useSingleCol ? 'grid grid-cols-1 gap-4' : 'grid grid-cols-1 md:grid-cols-2 gap-4';

    // #7: trạng thái nút độ chắc chắn (mặc định "chắc chắn", ẩn mình)
    const isGuess = state.confidence[state.currentIndex] === 'guess';
    // Đã dùng 50:50 cho câu này -> pill chuyển sang trạng thái tự động "Đã dùng trợ giúp" (khóa lại)
    const usedHelp = !!state.used5050Questions[state.currentIndex];

    // Tên bộ đề hiển thị tinh tế phía trên "Câu hỏi N" (eyebrow nhỏ, 1 dòng, tự cắt nếu dài)
    const setName = (state.quizData && state.quizData.title) ? String(state.quizData.title).trim() : '';
    const setNameSafe = setName
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    quizSection.innerHTML = `
    <div class="bg-white rounded-lg shadow-lg p-6 fade-in">
        <div class="flex justify-between items-start gap-3 mb-4">
            <div class="min-w-0 flex-1">
                ${setNameSafe ? `<div class="quiz-setname focus-hide" title="${setNameSafe}"><i class="fas fa-book-open"></i><span class="quiz-setname-text">${setNameSafe}</span></div>` : ''}
                <h2 class="quiz-question-heading text-xl font-bold text-gray-700">${title}</h2>
            </div>
            <button type="button" id="edit-question-btn" class="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border border-pink-300 text-[#FF69B4] bg-pink-50 hover:bg-pink-100 hover:text-pink-600 transition" title="Sửa đáp án, giải thích, ghi chú, mở rộng cho câu này" aria-label="Sửa câu hỏi">
                <i class="fas fa-pen-to-square"></i>
            </button>
        </div>
        <div class="mb-2 flex flex-wrap items-center gap-2 focus-hide">
            ${question.topic && String(question.topic).trim() && String(question.topic).trim().toLowerCase() !== 'chung' ? `<span class="inline-block px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold border border-blue-200"><i class="fas fa-tag mr-1"></i> Chủ đề: ${question.topic}</span>` : ''}
            ${question.level && question.level.trim() ? `<span class="inline-block px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-semibold border border-purple-200"><i class="fas fa-layer-group mr-1"></i> Mức độ: ${question.level}</span>` : ''}
            ${question.source && question.source.trim() ? `<span class="inline-block px-3 py-1 rounded-full bg-pink-100 text-pink-700 text-xs font-semibold border border-pink-200"><i class="fas fa-book mr-1"></i> Nguồn: ${question.source}</span>` : ''}
            ${state.streak > 0 ? `<span id="streak-badge" class="inline-block px-3 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-semibold border border-orange-200 animate-pulse"><i class="fas fa-fire mr-1 text-orange-500 animate-bounce"></i> Chuỗi đúng: ${state.streak}</span>` : ''}
        </div>
        <div class="question-text font-semibold text-gray-800 my-6 text-left ${qSizeClass}" data-annot="q">${parseMarkdown(question.question)}</div>
        <div id="answers-container" class="${answersGridClass}">
            ${answerOptions.map((answer, index) => `
                <button class="answer-btn p-4 border border-pink-200 rounded-lg text-left hover:bg-[#FFB6C1]/50 hover:border-[#FF69B4] hover:scale-[1.01] hover:-translate-y-0.5 transition-all ${aSizeClass}" data-index="${index}">
                    <div class="flex items-start">
                        <span class="answer-letter inline-block w-8 h-8 rounded-full bg-pink-50 text-[#FF69B4] border border-pink-200 text-center leading-7 font-bold mr-2 text-sm flex-shrink-0">${String.fromCharCode(65 + index)}</span>
                        <div class="flex-1">
                            <div class="answer-content" data-annot="a${index}">${parseMarkdown(answer)}</div>
                            <div class="option-explanation mt-2 text-xs md:text-sm font-normal border-t pt-1.5 border-dashed border-gray-300/30 hidden transition-all duration-300" data-annot="oe${index}"></div>
                        </div>
                    </div>
                </button>
            `).join('')}
        </div>
        <div class="mt-4 flex flex-wrap justify-between items-center gap-2">
            <button type="button" id="confidence-toggle" class="${usedHelp ? 'conf-helped' : (isGuess ? 'conf-guess' : '')}" ${usedHelp ? 'disabled' : ''} title="${usedHelp ? 'Bạn đã dùng trợ giúp 50:50 cho câu này' : 'Đánh dấu nếu bạn chỉ đoán câu này — sẽ được gợi ý ôn lại ở phần kết quả'}">
                <i class="fas ${usedHelp ? 'fa-life-ring' : (isGuess ? 'fa-dice' : 'fa-circle-check')}"></i> ${usedHelp ? 'Đã dùng trợ giúp' : (isGuess ? 'Đoán' : 'Chắc chắn')}
            </button>
            <div class="flex flex-wrap justify-end gap-2">
            <button type="button" id="help-5050-btn" class="px-4 py-2 rounded-lg border border-blue-400 text-blue-700 bg-blue-50 hover:bg-blue-100 transition flex items-center gap-2">
                <i class="fas fa-life-ring"></i> Trợ giúp 50:50
            </button>
            ${renderMarkControl()}
            </div>
        </div>
        ${question.note && question.note.trim() ? `
        <div id="explanation-area" class="mt-6 p-6 bg-gradient-to-r from-pink-50 to-orange-50 border-l-8 border-pink-400 rounded-xl shadow-inner hidden fade-in animate__animated animate__fadeIn">
            <div class="flex items-start gap-3 bg-white/60 p-3 rounded-lg border border-pink-100">
                <i class="fas fa-thumbtack text-pink-500 mt-1 animate-bounce"></i>
                <div class="text-pink-800 text-base">
                    <span class="font-bold">Ghi chú ghi nhớ:</span>
                    <div class="mt-1" data-annot="note">${parseMarkdown(question.note)}</div>
                </div>
            </div>
        </div>` : `<div id="explanation-area" class="hidden"></div>`}
        <div id="expanded-area" class="mt-6 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-l-8 border-blue-400 rounded-xl shadow-inner hidden fade-in animate__animated animate__fadeIn">
            <h4 class="font-extrabold text-blue-800 text-xl flex items-center gap-2 mb-3">
                <i class="fas fa-expand text-blue-500 animate-pulse"></i> Mở rộng kiến thức
            </h4>
            <div class="text-blue-900 leading-relaxed text-base" data-annot="expand">${question.expanded ? parseMarkdown(question.expanded) : ''}</div>
        </div>
        <div class="mt-8 flex justify-between">
            <button id="prevBtn" class="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition ${state.currentIndex === 0 || state.quizMode === 'practice' ? 'invisible' : ''}">
                Câu trước
            </button>
            <button id="nextBtn" class="px-6 py-2 bg-[#FF69B4] text-white rounded-lg hover:bg-opacity-80 transition hidden">
                ${state.currentIndex === state.questions.length - 1 ? 'Xem kết quả' : 'Câu tiếp'} <i class="fas fa-arrow-right ml-2"></i>
            </button>
        </div>
    </div>
    `;

    // Đưa bảng số câu (cột trái) và ghi chú cá nhân (cột phải) ra hai bên hông trên màn rộng.
    // Màn hẹp / chế độ tập trung sẽ tự xếp lại 1 cột (xem quiz-enhance.css).
    const navPanel = document.getElementById('quiz-nav-panel');
    if (navPanel) {
        navPanel.innerHTML = renderQuizProgressBar();
        navPanel.classList.remove('hidden');
    }
    const notePanel = document.getElementById('quiz-note-panel');
    if (notePanel) {
        notePanel.innerHTML = renderPersonalNotePanel();
        notePanel.classList.remove('hidden');
        // Nối logic ghi chú ngay tại đây để hoạt động trên MỌI nhánh render
        // (kể cả khi xem lại câu đã trả lời ở chế độ không hiện đáp án ngay -> return sớm)
        setupPersonalNote(question);
    }
    const workspaceEl = document.getElementById('quiz-workspace');
    if (workspaceEl) workspaceEl.classList.remove('results-active');

    // Đồng bộ bảng "Câu đã đánh dấu" (số đếm + danh sách) — đặt ở MỌI nhánh render,
    // kể cả khi xem lại câu đã trả lời ở chế độ không hiện đáp án ngay (return sớm bên dưới).
    refreshMarkedPanel();

    renderMath(quizSection);
    attachToggleNavEvent();
    setNavVisibility(navVisible);

    // Chạy cho MỌI trạng thái câu (kể cả khi revisit câu đã trả lời ở chế độ không xem đáp án ngay)
    // #2: cập nhật thanh HUD dính (số câu + tiến trình)
    updateHud();
    // Nút "Sửa câu hỏi": mở modal chỉnh sửa đáp án/giải thích/ghi chú/mở rộng (chạy ở mọi nhánh render)
    const editBtn = document.getElementById('edit-question-btn');
    if (editBtn) editBtn.addEventListener('click', openQuestionEditor);
    // #7: nút độ chắc chắn (tinh tế, mặc định "chắc chắn")
    const confBtn = document.getElementById('confidence-toggle');
    // Khi đã dùng 50:50, pill là nhãn trạng thái "Đã dùng trợ giúp" (khóa) -> không gắn toggle.
    if (confBtn && !state.used5050Questions[state.currentIndex]) {
        confBtn.addEventListener('click', () => {
            if (state.confidence[state.currentIndex] === 'guess') {
                delete state.confidence[state.currentIndex];
            } else {
                state.confidence[state.currentIndex] = 'guess';
            }
            saveQuizState();
            const guess = state.confidence[state.currentIndex] === 'guess';
            confBtn.classList.toggle('conf-guess', guess);
            confBtn.innerHTML = `<i class="fas ${guess ? 'fa-dice' : 'fa-circle-check'}"></i> ${guess ? 'Đoán' : 'Chắc chắn'}`;
        });
    }
    // #9: áp dụng ghi chú trực quan (bôi vàng/đậm/nghiêng) đã lưu cho câu hiện tại

    const answeredIdx = state.userAnswers[state.currentIndex];
    const btn5050 = document.getElementById('help-5050-btn');
    const hiddenIndices = state.used5050Questions[state.currentIndex];
    
    if (hiddenIndices) {
        const answerBtns = document.querySelectorAll('.answer-btn');
        answerBtns.forEach((btn, idx) => {
            if (hiddenIndices.includes(idx)) {
                btn.disabled = true;
                btn.classList.add('opacity-20', 'border-gray-300', 'cursor-not-allowed');
                btn.classList.remove('hover:bg-[#FFB6C1]/50', 'hover:border-[#FF69B4]', 'hover:scale-[1.01]', 'hover:-translate-y-0.5');
            }
        });
    }

    if (btn5050) {
        if (answeredIdx !== null || hiddenIndices) {
            btn5050.disabled = true;
            btn5050.classList.add('opacity-50', 'cursor-not-allowed');
            btn5050.classList.remove('hover:bg-blue-100');
        } else {
            btn5050.onclick = handle5050Help;
        }
    }

    if (answeredIdx !== null && answeredIdx !== undefined) {
        if (!state.quizOptions.showAnswerImmediately) {
            document.querySelectorAll('.answer-btn').forEach((btn, idx) => {
                setAnswerLock(btn, true);
                if (idx === answeredIdx) {
                    btn.classList.add('bg-blue-100', 'border-blue-400');
                }
            });
            const explanationArea = document.getElementById('explanation-area');
            if (explanationArea) explanationArea.classList.add('hidden');
            const nextBtn = document.getElementById('nextBtn');
            if (nextBtn) {
                nextBtn.classList.remove('hidden');
                nextBtn.addEventListener('click', showNextQuestion, { once: true });
            }
            applyAnnotationsAll();
            return;
        }
        document.querySelectorAll('.answer-btn').forEach((btn, idx) => {
            setAnswerLock(btn, true);
            const isCorrectAnswer = (idx === state.questions[state.currentIndex].correctAnswerIndex);
            const isSelectedAnswer = (idx === answeredIdx);

            if (isSelectedAnswer) {
                btn.classList.add('ring-2', 'ring-[#FF69B4]');
            }
            if (isCorrectAnswer) {
                btn.classList.add('bg-green-200', 'border-green-400', 'text-green-800', 'font-bold', 'hover:bg-green-200', 'hover:border-green-400');
                if (isSelectedAnswer) btn.classList.add('correct-answer-pulse');
            } else if (isSelectedAnswer) {
                btn.classList.add('bg-red-200', 'border-red-400', 'text-red-800', 'wrong-answer-shake', 'hover:bg-red-200', 'hover:border-red-400');
            } else {
                btn.classList.remove('hover:bg-[#FFB6C1]/50', 'hover:border-[#FF69B4]');
            }

            const expDiv = btn.querySelector('.option-explanation');
            if (expDiv) {
                if (isCorrectAnswer) {
                    const correctExp = (question.optionExplanations && question.optionExplanations[idx] && question.optionExplanations[idx].trim()) 
                                       || (question.explanation && question.explanation.trim());
                    if (correctExp) {
                        expDiv.innerHTML = `<span class="font-semibold text-xs uppercase tracking-wider block mb-1 opacity-80"><i class="fas fa-check-circle mr-1"></i>Tại sao đúng:</span>${parseMarkdown(correctExp)}`;
                        expDiv.classList.remove('hidden');
                        expDiv.className = "option-explanation exp-correct mt-2 text-sm md:text-base font-normal border-t pt-1.5 border-green-300/40 text-green-950 transition-all duration-300";
                        renderMath(expDiv);
                    }
                } else {
                    if (question.optionExplanations && question.optionExplanations[idx] && question.optionExplanations[idx].trim()) {
                        expDiv.innerHTML = `<span class="font-semibold text-xs uppercase tracking-wider block mb-1 opacity-80"><i class="fas fa-times-circle mr-1"></i>Tại sao sai:</span>${parseMarkdown(question.optionExplanations[idx])}`;
                        expDiv.classList.remove('hidden');
                        if (isSelectedAnswer) {
                            expDiv.className = "option-explanation exp-wrong-selected mt-2 text-sm md:text-base font-normal border-t pt-1.5 border-red-300/40 text-red-950 transition-all duration-300";
                        } else {
                            expDiv.className = "option-explanation exp-wrong-normal mt-2 text-sm md:text-base font-normal border-t pt-1.5 border-pink-200/50 text-gray-600 transition-all duration-300";
                        }
                        renderMath(expDiv);
                    }
                }
            }
        });
        const explanationArea = document.getElementById('explanation-area');
        if (explanationArea) explanationArea.classList.remove('hidden');
        const expandedArea = document.getElementById('expanded-area');
        if (expandedArea && question.expanded && String(question.expanded).trim()) {
            expandedArea.classList.remove('hidden');
        }
        const nextBtn = document.getElementById('nextBtn');
        if (nextBtn) {
            nextBtn.classList.remove('hidden');
            nextBtn.addEventListener('click', showNextQuestion, { once: true });
        }
    } else {
        setupAnswerInteractions();
    }
    if (state.quizMode === 'normal' && state.currentIndex > 0) {
        document.getElementById('prevBtn').addEventListener('click', showPreviousQuestion);
    }
    setupMarkControl();
    document.querySelectorAll('.quiz-nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.getAttribute('data-qidx'));
            if (!isNaN(idx)) {
                state.currentIndex = idx;
                showQuestion();
            }
        });
    });
    // #9: áp dụng ghi chú trực quan cho mọi vùng (đề, đáp án, giải thích, mở rộng, ghi chú)
    applyAnnotationsAll();
}

function showPreviousQuestion() {
    if (state.currentIndex > 0) {
        state.currentIndex--;
        showQuestion();
    }
}

function endQuiz() {
    showSubmitQuizBtn(false);
    // #11: chốt thời gian của câu cuối cùng đang xem
    accrueTime();
    state._timingIndex = null;
    const hud = document.getElementById('quiz-hud');
    if (hud) hud.style.display = 'none';
    // Rời màn làm bài -> ẩn nhóm điều khiển làm bài trong bảng thiết lập
    document.body.classList.remove('quiz-active');
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
        autoSaveInterval = null;
    }
    if (state.focusMode) {
        toggleFocusMode();
    }

    if (!state.quizOptions.showAnswerImmediately) {
        state.score = 0;
        for (let i = 0; i < state.questions.length; i++) {
            if (state.userAnswers[i] === state.questions[i].correctAnswerIndex) state.score++;
        }
    }

    try {
        const savedStateStr = localStorage.getItem('quizState');
        if (savedStateStr) {
            const savedState = JSON.parse(savedStateStr);
            savedState.finished = true;
            localStorage.setItem('quizState', JSON.stringify(savedState));
        }
    } catch (e) {}

    let totalTime = 0;
    if (state.quizStartTime) {
        totalTime = Math.floor((new Date() - state.quizStartTime) / 1000);
    }
    if (state.quizTimerInterval) clearInterval(state.quizTimerInterval);
    
    showResults(totalTime);
    
    // Register buttons for result actions
    const restartBtn = document.getElementById('restartQuizBtn');
    if (restartBtn) {
        restartBtn.addEventListener('click', () => {
            startQuizWithCurrentSettings();
        });
    }
    const practiceBtn = document.getElementById('practiceIncorrectBtn');
    if (practiceBtn) {
        practiceBtn.addEventListener('click', startIncorrectPracticeMode);
    }

    if (state.quizMode === 'normal') {
        const percentage = state.questions.length > 0 ? (state.score / state.questions.length) * 100 : 0;
        saveQuizResult(state.score, state.questions.length, percentage, totalTime);
    }
    
    const quizSection = document.getElementById('quizSection');
    const resultsSection = document.getElementById('resultsSection');
    quizSection.classList.add('hidden');
    resultsSection.classList.remove('hidden');
    // Ẩn hai cột bên hông (số câu / ghi chú) ở màn kết quả để dồn về 1 cột
    const navPanel = document.getElementById('quiz-nav-panel');
    const notePanel = document.getElementById('quiz-note-panel');
    if (navPanel) navPanel.classList.add('hidden');
    if (notePanel) notePanel.classList.add('hidden');
    const workspace = document.getElementById('quiz-workspace');
    if (workspace) workspace.classList.add('results-active');

    // Tự động cuộn lên đầu trang để xem kết quả ngay từ đầu
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function showNextQuestion() {
    if (state.currentIndex < state.questions.length - 1) {
        state.currentIndex++;
        showQuestion();
    } else {
        const unanswered = state.userAnswers.filter(a => a === null).length;
        if (unanswered > 0 || state.markedQuestions.length > 0) {
            const ok = await showConfirm(
                `Bạn còn ${unanswered} câu chưa trả lời và ${state.markedQuestions.length} câu đã đánh dấu. Bạn chắc chắn muốn nộp bài?`,
                { title: 'Nộp bài?', confirmText: 'Nộp bài', cancelText: 'Tiếp tục làm', tone: 'warning' }
            );
            if (!ok) return;
        }
        endQuiz();
    }
}

function startIncorrectPracticeMode() {
    const incorrectQuestions = state.questions.filter((q, index) => state.userAnswers[index] !== q.correctAnswerIndex);
    if (incorrectQuestions.length > 0) {
        startQuizMode(incorrectQuestions, 'practice');
    } else {
        showToast("Chúc mừng! Bạn không có câu nào sai.", 'success');
    }
}

function formatTimeLocal(seconds) {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
}

function startTimer(totalSeconds) {
    if (!totalSeconds) return;
    let elapsed = 0;
    const timerDisplay = document.getElementById('timerDisplay');
    if (!timerDisplay) return;
    timerDisplay.classList.remove('hidden');
    timerDisplay.textContent = formatTimeLocal(totalSeconds);
    let warnedOneMin = false;
    clearInterval(state.quizTimerInterval);
    state.quizTimerInterval = setInterval(() => {
        elapsed++;
        const remaining = totalSeconds - elapsed;
        timerDisplay.textContent = formatTimeLocal(remaining);
        // #5: cảnh báo sắp hết giờ (đổi màu + rung)
        if (remaining <= 10 && remaining > 0) {
            timerDisplay.classList.add('timer-critical');
            timerDisplay.classList.remove('timer-warn');
            if (remaining <= 5 && getVibrate() && navigator.vibrate) navigator.vibrate(40);
        } else if (remaining <= 60 && remaining > 10) {
            timerDisplay.classList.add('timer-warn');
            if (!warnedOneMin) {
                warnedOneMin = true;
                if (getVibrate() && navigator.vibrate) navigator.vibrate([30, 40, 30]);
                showToast('Còn 1 phút!', 'info');
            }
        }
        if (remaining <= 0) {
            timerDisplay.classList.remove('timer-warn', 'timer-critical');
            clearInterval(state.quizTimerInterval);
            showToast('Hết giờ! Bài sẽ được nộp tự động.', 'info');
            setTimeout(() => {
                endQuiz();
            }, 1000);
            return;
        }
        totalSeconds--;
    }, 1000);
}

function handleAnswerClick(e) {
    if (!state.quizOptions.showAnswerImmediately) {
        const selectedBtn = e.currentTarget;
        const selectedIdx = parseInt(selectedBtn.getAttribute('data-index'));
        if (isNaN(selectedIdx)) return;
        if (state.userAnswers[state.currentIndex] !== null) return;
        state.userAnswers[state.currentIndex] = selectedIdx;
        if (getVibrate() && navigator.vibrate) navigator.vibrate(12);
        selectedBtn.classList.add('bg-blue-100', 'border-blue-400');
        const answerBtns = document.querySelectorAll('.answer-btn');
        answerBtns.forEach(btn => setAnswerLock(btn, true));
        const nextBtn = document.getElementById('nextBtn');
        if (nextBtn) {
            nextBtn.classList.remove('hidden');
            nextBtn.addEventListener('click', showNextQuestion, { once: true });
        }
        return;
    }

    const selectedBtn = e.currentTarget;
    const selectedIdx = parseInt(selectedBtn.getAttribute('data-index'));
    if (isNaN(selectedIdx)) return;

    if (state.userAnswers[state.currentIndex] !== null) return;

    state.userAnswers[state.currentIndex] = selectedIdx;
    const isCorrect = selectedIdx === state.questions[state.currentIndex].correctAnswerIndex;
    feedback(isCorrect); // #15: rung/âm thanh phản hồi
    showCatMeme(isCorrect); // meme con mèo vui khi đúng / khóc khi sai
    if (isCorrect) {
        state.score++;
        state.streak++;
        triggerConfetti();
    } else {
        state.streak = 0;
    }

    const question = state.questions[state.currentIndex];

    document.querySelectorAll('.answer-btn').forEach((btn, idx) => {
        setAnswerLock(btn, true);
        const isCorrectAnswer = (idx === question.correctAnswerIndex);
        const isSelectedAnswer = (idx === selectedIdx);

        if (isCorrectAnswer) {
            btn.classList.add('bg-green-200', 'border-green-400', 'text-green-800', 'font-bold');
            btn.classList.add('hover:bg-green-200', 'hover:border-green-400');
            if (isSelectedAnswer) {
                btn.classList.add('correct-answer-pulse');
            }
        } 
        else if (isSelectedAnswer) {
            btn.classList.add('bg-red-200', 'border-red-400', 'text-red-800');
            btn.classList.add('wrong-answer-shake');
            btn.classList.add('hover:bg-red-200', 'hover:border-red-400');
        } else {
            btn.classList.remove('hover:bg-[#FFB6C1]/50', 'hover:border-[#FF69B4]');
        }

        const expDiv = btn.querySelector('.option-explanation');
        if (expDiv) {
            if (isCorrectAnswer) {
                const correctExp = (question.optionExplanations && question.optionExplanations[idx] && question.optionExplanations[idx].trim()) 
                                   || (question.explanation && question.explanation.trim());
                if (correctExp) {
                    expDiv.innerHTML = `<span class="font-semibold text-xs uppercase tracking-wider block mb-1 opacity-80"><i class="fas fa-check-circle mr-1"></i>Tại sao đúng:</span>${parseMarkdown(correctExp)}`;
                    expDiv.classList.remove('hidden');
                    expDiv.className = "option-explanation exp-correct mt-2 text-sm md:text-base font-normal border-t pt-1.5 border-green-300/40 text-green-950 transition-all duration-300";
                    renderMath(expDiv);
                }
            } else {
                if (question.optionExplanations && question.optionExplanations[idx] && question.optionExplanations[idx].trim()) {
                    expDiv.innerHTML = `<span class="font-semibold text-xs uppercase tracking-wider block mb-1 opacity-80"><i class="fas fa-times-circle mr-1"></i>Tại sao sai:</span>${parseMarkdown(question.optionExplanations[idx])}`;
                    expDiv.classList.remove('hidden');
                    if (isSelectedAnswer) {
                        expDiv.className = "option-explanation exp-wrong-selected mt-2 text-sm md:text-base font-normal border-t pt-1.5 border-red-300/40 text-red-950 transition-all duration-300";
                    } else {
                        expDiv.className = "option-explanation exp-wrong-normal mt-2 text-sm md:text-base font-normal border-t pt-1.5 border-pink-200/50 text-gray-600 transition-all duration-300";
                    }
                    renderMath(expDiv);
                }
            }
        }
    });

    const explanationArea = document.getElementById('explanation-area');
    if (explanationArea) explanationArea.classList.remove('hidden');
    
    const expandedArea = document.getElementById('expanded-area');
    if (expandedArea && question.expanded && String(question.expanded).trim()) {
        expandedArea.classList.remove('hidden');
    }

    const nextBtn = document.getElementById('nextBtn');
    if (nextBtn) {
        nextBtn.classList.remove('hidden');
        nextBtn.addEventListener('click', showNextQuestion, { once: true });
    }
}

function startQuizWithCurrentSettings() {
    clearQuizState();
    state.streak = 0;
    state.used5050Questions = {};

    // Gắn chỉ số gốc (__origIdx) cho từng câu để khi người dùng chỉnh sửa trong lúc làm bài
    // còn ánh xạ ngược về đúng câu trong dữ liệu gốc (kể cả khi đã trộn câu/đáp án).
    let selectedQuestions = state.originalQuestions.map((q, i) => ({ ...q, __origIdx: i }));

    const shuffleCheckbox = document.getElementById('shuffle-questions-checkbox');
    if (shuffleCheckbox && shuffleCheckbox.checked) {
        selectedQuestions = shuffleArray(selectedQuestions);
    }

    const enableCountCheckbox = document.getElementById('enable-question-count-checkbox');
    const countInput = document.getElementById('question-count-input');
    if (enableCountCheckbox && enableCountCheckbox.checked && countInput) {
        const countVal = parseInt(countInput.value);
        if (!isNaN(countVal) && countVal > 0) {
            selectedQuestions = selectedQuestions.slice(0, Math.min(countVal, selectedQuestions.length));
        }
    }

    // Xáo trộn thứ tự đáp án trong từng câu (sau khi đã chọn/cắt số câu)
    const shuffleAnswersCheckbox = document.getElementById('shuffle-answers-checkbox');
    if (shuffleAnswersCheckbox && shuffleAnswersCheckbox.checked) {
        selectedQuestions = selectedQuestions.map(q => shuffleQuestionOptions(q));
    }

    const timedCheckbox = document.getElementById('timed-mode-checkbox');
    const timedInput = document.getElementById('timed-minutes-input');
    state.quizOptions.isTimed = timedCheckbox && timedCheckbox.checked;
    state.quizOptions.timedMinutes = timedInput ? parseInt(timedInput.value) : 0;

    const showAnswerCheckbox = document.getElementById('show-answer-immediately-checkbox');
    state.quizOptions.showAnswerImmediately = showAnswerCheckbox && showAnswerCheckbox.checked;

    showSubmitQuizBtn(true);
    startQuizMode(selectedQuestions, 'normal');
}

document.addEventListener('DOMContentLoaded', () => {
    // Khởi tạo Mermaid một lần duy nhất bằng cấu hình dùng chung trong quiz-helpers
    ensureMermaidInit();

    const savedStateStr = localStorage.getItem('quizState');
    let askedToRestore = false;
    if (savedStateStr) {
        try {
            const savedState = JSON.parse(savedStateStr);
            const quizId = (new URLSearchParams(window.location.search)).get('id');
            if (savedState.quizId === quizId && savedState.userAnswers && savedState.userAnswers.length === savedState.questionsLength && !savedState.finished) {
                askedToRestore = true;
                setTimeout(async () => {
                    const wantRestore = await showConfirm(
                        'Bạn có muốn tiếp tục bài làm trước đó không?',
                        { title: 'Tiếp tục bài làm', confirmText: 'Tiếp tục', cancelText: 'Làm lại từ đầu', tone: 'primary' }
                    );
                    if (wantRestore) {
                        // Khôi phục cấu hình phiên (tính giờ, xem đáp án ngay...) để render đúng trạng thái
                        if (savedState.quizOptions) state.quizOptions = savedState.quizOptions;
                        const restoreMode = savedState.quizMode || 'normal';

                        if (Array.isArray(savedState.questions) && savedState.questions.length === savedState.questionsLength) {
                            // Có sẵn bộ câu hỏi đã chơi (đã trộn câu/đáp án) -> khôi phục chính xác tuyệt đối
                            startQuizMode(savedState.questions, restoreMode, savedState);
                        } else {
                            // Bản lưu cũ không kèm câu hỏi -> chờ dữ liệu gốc tải xong rồi khôi phục
                            const restoreInterval = setInterval(() => {
                                if (state.originalQuestions && state.originalQuestions.length === savedState.questionsLength) {
                                    clearInterval(restoreInterval);
                                    startQuizMode(state.originalQuestions.map((q, i) => ({ ...q, __origIdx: i })), restoreMode, savedState);
                                }
                            }, 200);
                        }
                    } else {
                        clearQuizState();
                    }
                }, 400);
            }
        } catch (err) { console.warn('Không thể khôi phục trạng thái quiz:', err); }
    }

    const hudHomeBtn = document.getElementById('hud-home-btn');
    if (hudHomeBtn) {
        hudHomeBtn.addEventListener('click', async (e) => {
            // Chỉ hỏi khi đang làm bài dở để tránh mất tiến trình do chạm nhầm.
            // (HUD đã bị ẩn ở màn kết quả nên nút này chỉ xuất hiện khi đang làm bài.)
            // Tiến trình vẫn được tự động lưu nên có thể khôi phục khi quay lại.
            const inProgress = Array.isArray(state.userAnswers) && state.userAnswers.some(a => a !== null);
            if (!inProgress) return;
            // Vì là thẻ <a>, luôn chặn điều hướng mặc định rồi tự chuyển trang khi đã xác nhận
            e.preventDefault();
            const ok = await showConfirm(
                'Tiến trình của bạn đã được tự động lưu và có thể tiếp tục khi quay lại.',
                { title: 'Về trang chủ?', confirmText: 'Về trang chủ', cancelText: 'Ở lại', tone: 'primary' }
            );
            if (ok) window.location.href = hudHomeBtn.getAttribute('href');
        });
    }

    const submitQuizBtn = document.getElementById('submit-quiz-btn');
    if (submitQuizBtn) {
        submitQuizBtn.addEventListener('click', async () => {
            const unanswered = state.userAnswers.filter(ans => ans == null).length;
            const marked = state.markedQuestions.length;
            if (unanswered > 0 || marked > 0) {
                const ok = await showConfirm(
                    `Bạn còn ${unanswered} câu chưa trả lời${marked > 0 ? ' và ' + marked + ' câu đã đánh dấu' : ''}. Bạn chắc chắn muốn nộp bài?`,
                    { title: 'Nộp bài?', confirmText: 'Nộp bài', cancelText: 'Tiếp tục làm', tone: 'warning' }
                );
                if (!ok) return;
            }
            endQuiz();
            showSubmitQuizBtn(false);
        });
    }

    const showPreviewBtn = document.getElementById('show-preview-btn');
    const collapsePreviewBtn = document.getElementById('collapse-preview-btn');
    const quizPreview = document.getElementById('quiz-preview');
    const previewLabel = document.getElementById('show-preview-label');
    const previewChevron = document.getElementById('show-preview-chevron');
    const syncPreviewBtn = () => {
        const open = quizPreview && !quizPreview.classList.contains('hidden');
        if (previewLabel) previewLabel.textContent = open ? 'Ẩn phần xem trước' : 'Xem trước một số câu hỏi';
        if (previewChevron) previewChevron.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
    };
    if (showPreviewBtn && quizPreview) {
        showPreviewBtn.addEventListener('click', () => {
            quizPreview.classList.toggle('hidden');
            syncPreviewBtn();
        });
    }
    if (collapsePreviewBtn && quizPreview) {
        collapsePreviewBtn.addEventListener('click', () => {
            quizPreview.classList.add('hidden');
            syncPreviewBtn();
        });
    }

    setupFontSizeControls();
    setupFocusModeControls();
    setupMarkedList();     // "Câu đã đánh dấu" trong bảng thiết lập (góc trái)
    setupSettings();       // #1 + #15: Dark / Âm thanh / Rung
    setupResizers();       // Kéo giãn độ rộng 3 cột + nhớ theo thiết bị
    setupAnnotations();    // #9: ghi chú trực quan (bôi vàng / in đậm / in nghiêng)
    setupLightbox();       // #13: phóng to ảnh
    setupQuestionEditor(showQuestion); // Chỉnh sửa câu hỏi (đáp án/giải thích/ghi chú/mở rộng) ngay khi làm bài
    setupSwipe();          // #3: vuốt chuyển câu
    setupEdgeTap();        // Chạm rìa trái/phải màn hình để chuyển câu (mobile)

    // Đóng menu lý do đánh dấu khi bấm ra ngoài (1 listener dùng chung cho mọi câu)
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('mark-menu');
        if (!menu || menu.classList.contains('hidden')) return;
        const control = document.getElementById('mark-control');
        if (control && !control.contains(e.target)) {
            menu.classList.add('hidden');
            const b = document.getElementById('mark-question-btn');
            if (b) b.setAttribute('aria-expanded', 'false');
        }
    });

    // #11: tạm dừng tính giờ khi rời tab để không cộng dồn thời gian "treo"
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            accrueTime();
            state._timingEnterAt = 0;
        } else if (state._timingIndex !== null) {
            state._timingEnterAt = Date.now();
        }
    });

    const startNowBtn = document.getElementById('start-now-btn');
    if (startNowBtn) {
        startNowBtn.addEventListener('click', () => {
            const landing = document.getElementById('quiz-landing');
            // Hiệu ứng chuyển cảnh: trang thiết lập "bay" ra rồi mới vào màn làm bài
            if (landing && !landing.classList.contains('hidden') && !landing.classList.contains('quiz-landing-leaving')) {
                const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                landing.classList.add('quiz-landing-leaving');
                scrollQuizToTop();
                setTimeout(startQuizWithCurrentSettings, reduce ? 0 : 420);
            } else {
                startQuizWithCurrentSettings();
            }
        });
    }

    // Bật/tắt meme con mèo — đồng bộ với lựa chọn đã lưu cục bộ
    const memeCheckbox = document.getElementById('meme-enabled-checkbox');
    if (memeCheckbox) {
        memeCheckbox.checked = getCatMemeEnabled();
        memeCheckbox.addEventListener('change', () => {
            try { localStorage.setItem('quiz_meme_enabled', memeCheckbox.checked ? '1' : '0'); } catch (e) {}
            if (!memeCheckbox.checked) hideCatMeme();
        });
    }

    const retryWrongBtn = document.getElementById('retry-wrong-btn');
    if (retryWrongBtn) {
        retryWrongBtn.addEventListener('click', startIncorrectPracticeMode);
    }

    document.addEventListener('keydown', (e) => {
        const quizContainerElement = document.getElementById('quiz-container');
        const resultsSectionElement = document.getElementById('resultsSection');
        if (!quizContainerElement || quizContainerElement.classList.contains('hidden')) return;
        if (resultsSectionElement && !resultsSectionElement.classList.contains('hidden')) return;

        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

        // Bỏ qua khi đang dùng tổ hợp phím hệ thống (Ctrl/Alt/Cmd)
        if (e.ctrlKey || e.altKey || e.metaKey) return;

        // Chọn đáp án bằng phím A–Z hoặc số 1–9
        let optionIdx = -1;
        if (/^[1-9]$/.test(e.key)) {
            optionIdx = parseInt(e.key, 10) - 1;
        } else if (/^[a-zA-Z]$/.test(e.key)) {
            optionIdx = e.key.toLowerCase().charCodeAt(0) - 97;
        }
        if (optionIdx >= 0) {
            const answerBtns = document.querySelectorAll('.answer-btn');
            if (optionIdx < answerBtns.length) {
                const targetBtn = answerBtns[optionIdx];
                if (targetBtn && !targetBtn.disabled && !targetBtn.classList.contains('answer-locked')) {
                    e.preventDefault();
                    targetBtn.click();
                }
            }
            return;
        }

        // Enter: sang câu tiếp / xem kết quả nếu nút đang hiện
        if (e.key === 'Enter') {
            const nextBtn = document.getElementById('nextBtn');
            if (nextBtn && !nextBtn.classList.contains('hidden')) {
                e.preventDefault();
                nextBtn.click();
            }
            return;
        }

        if (e.key === 'ArrowLeft') {
            if (state.currentIndex > 0 && state.quizMode !== 'practice') {
                e.preventDefault();
                showPreviousQuestion();
            }
        } else if (e.key === 'ArrowRight') {
            // Cho phép sang câu tiếp tự do (giống bảng số câu), trừ câu cuối
            // để tránh vô tình nộp bài bằng phím mũi tên.
            if (state.currentIndex < state.questions.length - 1) {
                e.preventDefault();
                showNextQuestion();
            }
        }
    });

    // Đang làm bài dở (chưa nộp) hay không?
    const isQuizInProgress = () => {
        const quizContainerElement = document.getElementById('quiz-container');
        const resultsSectionElement = document.getElementById('resultsSection');
        return quizContainerElement
            && !quizContainerElement.classList.contains('hidden')
            && (!resultsSectionElement || resultsSectionElement.classList.contains('hidden'))
            && state.questions && state.questions.length > 0;
    };

    // Khi đã xác nhận rời qua modal đẹp thì không hiện thêm dialog mặc định nữa
    let allowLeaveWithoutPrompt = false;

    // Chặn điều hướng NỘI BỘ (bấm link trong trang) khi đang làm bài dở:
    // hiện modal đẹp của web thay cho hộp thoại mặc định của trình duyệt.
    document.addEventListener('click', async (e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const anchor = e.target.closest('a[href]');
        if (!anchor) return;
        const href = anchor.getAttribute('href');
        // Bỏ qua link neo trong trang, mở tab mới, hoặc link không điều hướng
        if (!href || href.startsWith('#') || anchor.target === '_blank'
            || /^(javascript:|mailto:|tel:)/i.test(href)) return;
        if (!isQuizInProgress()) return;

        e.preventDefault();
        const ok = await showConfirm('Tiến độ làm bài sẽ được lưu lại để bạn quay lại tiếp tục sau.', {
            title: 'Rời khỏi trang làm bài?',
            confirmText: 'Rời khỏi',
            cancelText: 'Ở lại',
            tone: 'danger',
            icon: 'fas fa-door-open'
        });
        if (ok) {
            allowLeaveWithoutPrompt = true;
            saveQuizState();
            window.location.href = anchor.href;
        }
    }, true); // capture: chặn trước khi link kịp điều hướng

    // Lớp bảo vệ cuối cho ĐÓNG TAB / F5 / gõ URL khác — trình duyệt không cho thay
    // hộp thoại này bằng modal tùy biến, nên đành dùng dialog mặc định.
    window.addEventListener('beforeunload', (e) => {
        if (allowLeaveWithoutPrompt) return;
        if (isQuizInProgress()) {
            saveQuizState();
            e.preventDefault();
            e.returnValue = '';
        }
    });

    loadQuizData();
});