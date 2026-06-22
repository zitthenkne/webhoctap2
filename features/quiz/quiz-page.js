// features/quiz/quiz-page.js

import { db, auth } from '../../core/firebase-init.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { showToast } from '../../core/utils.js';

import { state, resetState, saveQuizState, clearQuizState, saveQuizResult } from './quiz-state.js';
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

/* ============================================================
   TIỆN ÍCH NÂNG CẤP TRẢI NGHIỆM LÀM BÀI
   ============================================================ */

// --- Thiết lập (Dark / Âm thanh / Rung) lưu trong localStorage ---
function getTheme()   { try { return localStorage.getItem('quiz_theme') || 'light'; } catch (e) { return 'light'; } }
function getSound()   { try { return localStorage.getItem('quiz_sound') === '1'; } catch (e) { return false; } }
function getVibrate() { try { return localStorage.getItem('quiz_vibrate') !== '0'; } catch (e) { return true; } } // mặc định BẬT

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

// --- #9: bôi vàng từ khóa trong đề, lưu theo từng câu ---
function hlStorageKey() {
    const quizId = (state.quizData && state.quizData.id) || (new URLSearchParams(window.location.search)).get('id') || 'default_quiz';
    return `quiz_hl_${quizId}`;
}
function getHighlightStore() {
    try { return JSON.parse(localStorage.getItem(hlStorageKey()) || '{}'); } catch (e) { return {}; }
}
function saveHighlightStore(store) {
    try { localStorage.setItem(hlStorageKey(), JSON.stringify(store)); } catch (e) {}
}
function getHighlightsFor(qText) {
    const store = getHighlightStore();
    return Array.isArray(store[qText]) ? store[qText] : [];
}
function applyHighlights(container, phrases) {
    if (!container || !phrases || !phrases.length) return;
    phrases.forEach(phrase => {
        if (!phrase || phrase.length < 2) return;
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
            acceptNode: (n) => (n.parentNode && n.parentNode.nodeName !== 'MARK' && n.nodeValue.includes(phrase))
                ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
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
                const mark = document.createElement('mark');
                mark.className = 'quiz-hl';
                range.surroundContents(mark);
            } catch (e) { /* selection trải qua nhiều thẻ -> bỏ qua đoạn này */ }
        });
    });
}
function addHighlight(qText, phrase) {
    const store = getHighlightStore();
    const arr = Array.isArray(store[qText]) ? store[qText] : [];
    if (!arr.includes(phrase)) arr.push(phrase);
    store[qText] = arr;
    saveHighlightStore(store);
}
function removeHighlight(qText, phrase) {
    const store = getHighlightStore();
    if (Array.isArray(store[qText])) {
        store[qText] = store[qText].filter(p => p !== phrase);
        if (store[qText].length === 0) delete store[qText];
        saveHighlightStore(store);
    }
}
function setupHighlighting() {
    const hlBtn = document.getElementById('hl-float-btn');
    if (!hlBtn) return;

    const hideBtn = () => hlBtn.classList.remove('show');
    const onSelect = () => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) { hideBtn(); return; }
        const qTextEl = document.querySelector('#quizSection .question-text');
        if (!qTextEl) { hideBtn(); return; }
        // Chỉ hiện khi vùng chọn nằm trong đề bài
        if (!qTextEl.contains(sel.anchorNode) || !qTextEl.contains(sel.focusNode)) { hideBtn(); return; }
        const text = sel.toString().trim();
        if (text.length < 2) { hideBtn(); return; }
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        hlBtn.style.left = (rect.left + rect.width / 2) + 'px';
        hlBtn.style.top = (rect.top - 8) + 'px';
        hlBtn.classList.add('show');
    };
    document.addEventListener('mouseup', () => setTimeout(onSelect, 10));
    document.addEventListener('touchend', () => setTimeout(onSelect, 10));
    // Giữ vùng chọn khi nhấn nút (đừng để mousedown xóa selection)
    hlBtn.addEventListener('mousedown', (e) => e.preventDefault());
    hlBtn.addEventListener('click', () => {
        const sel = window.getSelection();
        const text = sel ? sel.toString().trim() : '';
        const question = state.questions[state.currentIndex];
        if (text.length >= 2 && question) {
            addHighlight(question.question, text);
            sel.removeAllRanges();
            hideBtn();
            showQuestion(); // vẽ lại để áp dụng bôi vàng
        }
    });
    // Bấm vào một đoạn bôi vàng để gỡ
    document.addEventListener('click', (e) => {
        const mark = e.target.closest && e.target.closest('mark.quiz-hl');
        if (mark && document.querySelector('#quizSection .question-text') && document.querySelector('#quizSection .question-text').contains(mark)) {
            const question = state.questions[state.currentIndex];
            if (question) {
                removeHighlight(question.question, mark.textContent);
                showQuestion();
            }
        }
    });
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
    if (!fab || !pop) return;

    const sync = () => {
        if (rowDark) rowDark.setAttribute('aria-checked', getTheme() === 'dark');
        if (rowSound) rowSound.setAttribute('aria-checked', getSound());
        if (rowVibrate) rowVibrate.setAttribute('aria-checked', getVibrate());
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
}

// --- #3: vuốt trái/phải để chuyển câu (mobile) ---
function setupSwipe() {
    const section = document.getElementById('quizSection');
    if (!section) return;
    let startX = 0, startY = 0, tracking = false;
    section.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) { tracking = false; return; }
        // Không cướp thao tác trên vùng cần tương tác / chọn chữ
        if (e.target.closest('button, a, textarea, input, .answer-btn, table, .question-text, mark, .quiz-image, .mermaid')) {
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

    showToast('Đã loại bỏ 2 đáp án sai!');
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

async function loadQuizData() {
    const urlParams = new URLSearchParams(window.location.search);
    const quizId = urlParams.get('id');

    if (!quizId) {
        document.body.innerHTML = `<div class="text-center text-red-500">Lỗi: Không tìm thấy ID của bộ đề.</div>`;
        return;
    }

    try {
        const docRef = doc(db, "quiz_sets", quizId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            state.quizData = docSnap.data();
            state.quizData.id = quizId; // Make sure id is stored in state
            state.originalQuestions = state.quizData.questions;
            loadQuizDetails();
        } else {
            document.getElementById('quiz-title').textContent = "Lỗi";
            document.getElementById('quiz-info').textContent = "Không tìm thấy bộ đề này.";
        }
    } catch (error) {
        console.error("Lỗi tải dữ liệu bộ đề:", error);
        document.getElementById('quiz-title').textContent = "Lỗi";
        document.getElementById('quiz-info').textContent = "Đã xảy ra lỗi khi tải dữ liệu.";
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
    quizContainer.classList.remove('hidden');
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
            ? '<i class="fas fa-eye-slash"></i> Ẩn số câu hỏi'
            : '<i class="fas fa-eye"></i> Hiện số câu hỏi';
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

function showQuestion() {
    updateProgressBar();
    const question = state.questions[state.currentIndex];
    const quizSection = document.getElementById('quizSection');

    let qSizeClass = 'text-lg md:text-2xl';
    let aSizeClass = 'text-base md:text-lg';
    if (state.currentFontSize === 'small') {
        qSizeClass = 'text-base md:text-lg';
        aSizeClass = 'text-sm md:text-base';
    } else if (state.currentFontSize === 'large') {
        qSizeClass = 'text-2xl md:text-3xl';
        aSizeClass = 'text-lg md:text-xl';
    }

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

    quizSection.innerHTML = `
    ${renderQuizProgressBar()}
    <div class="bg-white rounded-lg shadow-lg p-6 fade-in">
        <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-bold text-gray-700">${title}</h2>
        </div>
        <div class="mb-2 flex flex-wrap items-center gap-2 focus-hide">
            ${question.topic && String(question.topic).trim() && String(question.topic).trim().toLowerCase() !== 'chung' ? `<span class="inline-block px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold border border-blue-200"><i class="fas fa-tag mr-1"></i> Chủ đề: ${question.topic}</span>` : ''}
            ${question.level && question.level.trim() ? `<span class="inline-block px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-semibold border border-purple-200"><i class="fas fa-layer-group mr-1"></i> Mức độ: ${question.level}</span>` : ''}
            ${question.source && question.source.trim() ? `<span class="inline-block px-3 py-1 rounded-full bg-pink-100 text-pink-700 text-xs font-semibold border border-pink-200"><i class="fas fa-book mr-1"></i> Nguồn: ${question.source}</span>` : ''}
            ${state.streak > 0 ? `<span id="streak-badge" class="inline-block px-3 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-semibold border border-orange-200 animate-pulse"><i class="fas fa-fire mr-1 text-orange-500 animate-bounce"></i> Chuỗi đúng: ${state.streak}</span>` : ''}
        </div>
        <div class="question-text font-semibold text-gray-800 my-6 text-left ${qSizeClass}">${parseMarkdown(question.question)}</div>
        <div id="answers-container" class="${answersGridClass}">
            ${answerOptions.map((answer, index) => `
                <button class="answer-btn p-4 border border-pink-200 rounded-lg text-left hover:bg-[#FFB6C1]/50 hover:border-[#FF69B4] hover:scale-[1.01] hover:-translate-y-0.5 transition-all ${aSizeClass}" data-index="${index}">
                    <div class="flex items-start">
                        <span class="answer-letter inline-block w-8 h-8 rounded-full bg-pink-50 text-[#FF69B4] border border-pink-200 text-center leading-7 font-bold mr-2 text-sm flex-shrink-0">${String.fromCharCode(65 + index)}</span>
                        <div class="flex-1">
                            <div class="answer-content">${parseMarkdown(answer)}</div>
                            <div class="option-explanation mt-2 text-xs md:text-sm font-normal border-t pt-1.5 border-dashed border-gray-300/30 hidden transition-all duration-300"></div>
                        </div>
                    </div>
                </button>
            `).join('')}
        </div>
        <div class="mt-3 text-center text-xs text-gray-400 focus-hide hidden sm:block">
            <i class="fas fa-keyboard mr-1"></i> Mẹo: nhấn <kbd class="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-gray-600 font-semibold">A</kbd>–<kbd class="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-gray-600 font-semibold">D</kbd> hoặc <kbd class="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-gray-600 font-semibold">1</kbd>–<kbd class="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-gray-600 font-semibold">4</kbd> để chọn đáp án, <kbd class="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-gray-600 font-semibold">Enter</kbd> để câu tiếp, <kbd class="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-gray-600 font-semibold">←</kbd> <kbd class="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-gray-600 font-semibold">→</kbd> để chuyển câu.
        </div>
        <div class="mt-4 flex flex-wrap justify-between items-center gap-2">
            <button type="button" id="confidence-toggle" class="${isGuess ? 'conf-guess' : ''}" title="Đánh dấu nếu bạn chỉ đoán câu này — sẽ được gợi ý ôn lại ở phần kết quả">
                <i class="fas ${isGuess ? 'fa-dice' : 'fa-circle-check'}"></i> ${isGuess ? 'Đoán' : 'Chắc chắn'}
            </button>
            <div class="flex flex-wrap justify-end gap-2">
            <button type="button" id="help-5050-btn" class="px-4 py-2 rounded-lg border border-blue-400 text-blue-700 bg-blue-50 hover:bg-blue-100 transition flex items-center gap-2">
                <i class="fas fa-life-ring"></i> Trợ giúp 50:50
            </button>
            <button id="mark-question-btn" class="px-4 py-2 rounded-lg border border-yellow-400 text-yellow-700 bg-yellow-50 hover:bg-yellow-100 transition flex items-center gap-2">
                <i class="fas fa-flag"></i> ${state.markedQuestions.includes(state.currentIndex) ? 'Bỏ đánh dấu' : 'Đánh dấu câu này'}
            </button>
            <button id="review-marked-btn" class="px-4 py-2 rounded-lg border border-blue-400 text-blue-700 bg-blue-50 hover:bg-blue-100 transition flex items-center gap-2 ${state.markedQuestions.length === 0 ? 'hidden' : ''}">
                <i class="fas fa-eye"></i> Xem các câu đã đánh dấu
            </button>
            </div>
        </div>
        <!-- Ghi chú cá nhân -->
        <div class="mt-6 p-4 bg-pink-50/50 border border-pink-100 rounded-xl focus-hide">
            <div class="flex items-center justify-between mb-2">
                <h4 class="font-bold text-gray-700 text-sm flex items-center gap-2">
                    <i class="fas fa-sticky-note text-pink-500 animate-pulse"></i> Ghi chú cá nhân của bạn
                </h4>
                <span id="note-save-status" class="text-xs text-green-600 font-medium opacity-0 transition-opacity duration-300">
                    <i class="fas fa-check-circle mr-1"></i>Đã tự động lưu
                </span>
            </div>
            <textarea id="personal-note-input" 
                class="w-full p-3 border border-pink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-300 text-sm text-gray-700 placeholder-gray-400 bg-white/80 resize-none shadow-sm transition-all" 
                rows="2" 
                placeholder="Nhập ghi chú cá nhân của bạn cho câu hỏi này (sẽ được tự động lưu)..."></textarea>
        </div>
        ${question.note && question.note.trim() ? `
        <div id="explanation-area" class="mt-6 p-6 bg-gradient-to-r from-pink-50 to-orange-50 border-l-8 border-pink-400 rounded-xl shadow-inner hidden fade-in animate__animated animate__fadeIn">
            <div class="flex items-start gap-3 bg-white/60 p-3 rounded-lg border border-pink-100">
                <i class="fas fa-thumbtack text-pink-500 mt-1 animate-bounce"></i>
                <div class="text-pink-800 text-base">
                    <span class="font-bold">Ghi chú ghi nhớ:</span> 
                    <div class="mt-1">${parseMarkdown(question.note)}</div>
                </div>
            </div>
        </div>` : `<div id="explanation-area" class="hidden"></div>`}
        <div id="expanded-area" class="mt-6 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-l-8 border-blue-400 rounded-xl shadow-inner hidden fade-in animate__animated animate__fadeIn">
            <h4 class="font-extrabold text-blue-800 text-xl flex items-center gap-2 mb-3">
                <i class="fas fa-expand text-blue-500 animate-pulse"></i> Mở rộng kiến thức
            </h4>
            <div class="text-blue-900 leading-relaxed text-base">${question.expanded ? parseMarkdown(question.expanded) : ''}</div>
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
    renderMath(quizSection);
    attachToggleNavEvent();
    setNavVisibility(navVisible);

    // Chạy cho MỌI trạng thái câu (kể cả khi revisit câu đã trả lời ở chế độ không xem đáp án ngay)
    // #2: cập nhật thanh HUD dính (số câu + tiến trình)
    updateHud();
    // #7: nút độ chắc chắn (tinh tế, mặc định "chắc chắn")
    const confBtn = document.getElementById('confidence-toggle');
    if (confBtn) {
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
    // #9: áp dụng các đoạn đã bôi vàng đã lưu cho câu hiện tại
    const qTextEl = quizSection.querySelector('.question-text');
    if (qTextEl) applyHighlights(qTextEl, getHighlightsFor(question.question));

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
                btn.disabled = true;
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
            return;
        }
        document.querySelectorAll('.answer-btn').forEach((btn, idx) => {
            btn.disabled = true;
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
    document.getElementById('mark-question-btn').addEventListener('click', () => {
        if (state.markedQuestions.includes(state.currentIndex)) {
            state.markedQuestions = state.markedQuestions.filter(i => i !== state.currentIndex);
        } else {
            state.markedQuestions.push(state.currentIndex);
        }
        showQuestion();
    });
    document.querySelectorAll('.quiz-nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.getAttribute('data-qidx'));
            if (!isNaN(idx)) {
                state.currentIndex = idx;
                showQuestion();
            }
        });
    });
    const reviewMarkedBtn = document.getElementById('review-marked-btn');
    if (reviewMarkedBtn) {
        reviewMarkedBtn.addEventListener('click', () => {
            if (state.markedQuestions.length > 0) {
                state.currentIndex = state.markedQuestions[0];
                showQuestion();
            }
        });
    }

    const noteInput = document.getElementById('personal-note-input');
    const noteStatus = document.getElementById('note-save-status');
    if (noteInput) {
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
        
        let saveTimeout;
        noteInput.addEventListener('input', (e) => {
            clearTimeout(saveTimeout);
            if (noteStatus) {
                noteStatus.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Đang lưu...';
                noteStatus.classList.remove('opacity-0', 'text-green-600');
                noteStatus.classList.add('opacity-100', 'text-gray-500');
            }
            
            saveTimeout = setTimeout(() => {
                const updatedVal = e.target.value;
                try {
                    const currentNotes = JSON.parse(localStorage.getItem(storageKey) || '{}');
                    if (updatedVal.trim() === '') {
                        delete currentNotes[qText];
                    } else {
                        currentNotes[qText] = updatedVal;
                    }
                    localStorage.setItem(storageKey, JSON.stringify(currentNotes));
                    
                    if (noteStatus) {
                        noteStatus.innerHTML = '<i class="fas fa-check-circle mr-1"></i>Đã tự động lưu';
                        noteStatus.classList.remove('text-gray-500');
                        noteStatus.classList.add('text-green-600');
                        setTimeout(() => {
                            noteStatus.classList.add('opacity-0');
                            noteStatus.classList.remove('opacity-100');
                        }, 1500);
                    }
                } catch(err) {
                    console.error("Lỗi lưu ghi chú:", err);
                    if (noteStatus) {
                        noteStatus.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i>Lỗi khi lưu';
                        noteStatus.classList.remove('text-gray-500');
                        noteStatus.classList.add('text-red-500');
                    }
                }
            }, 600);
        });
    }
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

    // Tự động cuộn lên đầu trang để xem kết quả ngay từ đầu
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showNextQuestion() {
    if (state.currentIndex < state.questions.length - 1) {
        state.currentIndex++;
        showQuestion();
    } else {
        const unanswered = state.userAnswers.filter(a => a === null).length;
        if (unanswered > 0 || state.markedQuestions.length > 0) {
            if (!confirm(`Bạn còn ${unanswered} câu chưa trả lời và ${state.markedQuestions.length} câu đã đánh dấu. Bạn chắc chắn muốn nộp bài?`)) {
                return;
            }
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
        answerBtns.forEach(btn => btn.disabled = true);
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
    if (isCorrect) {
        state.score++;
        state.streak++;
        triggerConfetti();
    } else {
        state.streak = 0;
    }

    const question = state.questions[state.currentIndex];

    document.querySelectorAll('.answer-btn').forEach((btn, idx) => {
        btn.disabled = true;
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

    let selectedQuestions = [...state.originalQuestions];

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
                setTimeout(() => {
                    if (confirm('Bạn có muốn tiếp tục bài làm trước đó không?')) {
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
                                    startQuizMode([...state.originalQuestions], restoreMode, savedState);
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

    const submitQuizBtn = document.getElementById('submit-quiz-btn');
    if (submitQuizBtn) {
        submitQuizBtn.addEventListener('click', () => {
            const unanswered = state.userAnswers.filter(ans => ans == null).length;
            const marked = state.markedQuestions.length;
            if (unanswered > 0 || marked > 0) {
                if (!confirm(`Bạn còn ${unanswered} câu chưa trả lời${marked > 0 ? ' và ' + marked + ' câu đã đánh dấu' : ''}. Bạn chắc chắn muốn nộp bài?`)) return;
            }
            endQuiz();
            showSubmitQuizBtn(false);
        });
    }

    const showPreviewBtn = document.getElementById('show-preview-btn');
    const collapsePreviewBtn = document.getElementById('collapse-preview-btn');
    const quizPreview = document.getElementById('quiz-preview');
    if (showPreviewBtn && quizPreview) {
        showPreviewBtn.addEventListener('click', () => {
            quizPreview.classList.toggle('hidden');
        });
    }
    if (collapsePreviewBtn && quizPreview) {
        collapsePreviewBtn.addEventListener('click', () => {
            quizPreview.classList.add('hidden');
        });
    }

    setupFontSizeControls();
    setupFocusModeControls();
    setupSettings();       // #1 + #15: Dark / Âm thanh / Rung
    setupHighlighting();   // #9: bôi vàng
    setupLightbox();       // #13: phóng to ảnh
    setupSwipe();          // #3: vuốt chuyển câu

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
        startNowBtn.addEventListener('click', startQuizWithCurrentSettings);
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
                if (targetBtn && !targetBtn.disabled) {
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

    // Cảnh báo khi người dùng định rời trang trong lúc đang làm bài dở
    window.addEventListener('beforeunload', (e) => {
        const quizContainerElement = document.getElementById('quiz-container');
        const resultsSectionElement = document.getElementById('resultsSection');
        const inProgress = quizContainerElement
            && !quizContainerElement.classList.contains('hidden')
            && (!resultsSectionElement || resultsSectionElement.classList.contains('hidden'))
            && state.questions && state.questions.length > 0;
        if (inProgress) {
            saveQuizState();
            e.preventDefault();
            e.returnValue = '';
        }
    });

    loadQuizData();
});