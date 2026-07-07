// File: features/quiz/page/quiz-question-view.js
// Hiển thị & tương tác với CÂU HỎI hiện tại: render showQuestion, chọn đáp án,
// loại trừ đáp án, trợ giúp 50:50, HUD, tính giờ từng câu, chuyển câu trước/sau.
// Tách từ quiz-page.js — logic giữ nguyên.

import { showToast, showConfirm } from '../../../core/utils.js';
import { openQuestionEditor } from '../quiz-editor.js';
import { state, saveQuizState } from '../quiz-state.js';
import { renderMath, triggerConfetti, parseMarkdown } from '../quiz-helpers.js';
import { updateProgressBar, renderQuizProgressBar } from '../quiz-ui.js';
import { feedback, getVibrate, scrollQuizToTop } from './quiz-page-prefs.js';
import { hideCatMeme, preloadCurrentMemes, showCatMeme } from './quiz-cat-meme.js';
import { renderMarkControl, setupMarkControl, refreshMarkedPanel, applyMark } from './quiz-marks.js';
import { renderPersonalNotePanel, setupPersonalNote } from './quiz-notes-panel.js';
import { applyAnnotationsAll } from './quiz-annotations.js';
import { caseKeyOf, caseCollapseState } from './quiz-cases.js';
import { applyNavVisibility, attachToggleNavEvent } from './quiz-page-setup.js';
import { endQuiz } from './quiz-session.js';

// Câu vừa hiển thị trước đó — dùng để biết khi nào THỰC SỰ chuyển sang câu khác
// (để cuộn lên đầu trang) so với khi chỉ vẽ lại cùng một câu (đổi cỡ chữ, ghi chú…).
let _lastShownIndex = -1;

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
export function accrueTime() {
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

export function handle5050Help() {
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

export function showQuestion() {
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

    // Khung "Ca lâm sàng" dùng chung cho các câu cùng caseId — luôn hiện, có nút thu gọn.
    const caseText = question.caseText ? String(question.caseText).trim() : '';
    let casePanelHtml = '';
    if (caseText) {
        const caseKey = caseKeyOf(question);
        const collapsed = caseKey ? !!caseCollapseState[caseKey] : false;
        const caseTitleRaw = (question.caseTitle && String(question.caseTitle).trim()) || 'Ca lâm sàng';
        const caseTitleSafe = caseTitleRaw
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const caseKeySafe = caseKey
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const seqLabel = (question.__caseTotal && question.__caseTotal > 1)
            ? `Câu ${question.__caseSeq}/${question.__caseTotal} trong ca` : '';
        casePanelHtml = `
        <div id="clinical-case-panel" class="clinical-case mb-5 rounded-xl border border-teal-200 bg-teal-50/70 p-4 shadow-sm" data-case-id="${caseKeySafe}">
            <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0 text-teal-800">
                    <i class="fas fa-notes-medical flex-shrink-0"></i>
                    <span class="font-bold truncate">${caseTitleSafe}</span>
                    ${seqLabel ? `<span class="hidden sm:inline-block flex-shrink-0 px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 text-xs font-semibold border border-teal-200">${seqLabel}</span>` : ''}
                </div>
                <button type="button" id="case-toggle-btn" class="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-teal-300 text-teal-700 bg-white/70 hover:bg-teal-100 transition text-xs font-semibold" aria-expanded="${collapsed ? 'false' : 'true'}" title="Ẩn/hiện nội dung ca lâm sàng">
                    <i class="fas fa-chevron-${collapsed ? 'down' : 'up'}"></i>
                    <span class="case-toggle-label">${collapsed ? 'Mở ca' : 'Thu gọn'}</span>
                </button>
            </div>
            ${seqLabel ? `<div class="sm:hidden mt-1 text-xs font-semibold text-teal-700">${seqLabel}</div>` : ''}
            <div id="case-body" class="case-body mt-3 text-gray-800 leading-relaxed ${collapsed ? 'hidden' : ''}">${parseMarkdown(caseText)}</div>
        </div>`;
    }

    quizSection.innerHTML = `
    <div class="bg-white rounded-2xl shadow-lg p-6 fade-in">
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
        ${casePanelHtml}
        <div class="question-text font-semibold text-gray-800 my-6 text-left ${qSizeClass}" data-annot="q">${parseMarkdown(question.question)}</div>
        <div id="answers-container" class="${answersGridClass}">
            ${answerOptions.map((answer, index) => `
                <button class="answer-btn p-4 border border-pink-200 rounded-xl text-left hover:bg-[#FFB6C1]/50 hover:border-[#FF69B4] hover:scale-[1.01] hover:-translate-y-0.5 transition-all ${aSizeClass}" data-index="${index}">
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
    // kể cả khi xem lại câu đã trả lời ở chế độ không xem đáp án ngay (return sớm bên dưới).
    refreshMarkedPanel();

    renderMath(quizSection);
    attachToggleNavEvent();
    applyNavVisibility();

    // Chạy cho MỌI trạng thái câu (kể cả khi revisit câu đã trả lời ở chế độ không xem đáp án ngay)
    // #2: cập nhật thanh HUD dính (số câu + tiến trình)
    updateHud();
    // Nút "Sửa câu hỏi": mở modal chỉnh sửa đáp án/giải thích/ghi chú/mở rộng (chạy ở mọi nhánh render)
    const editBtn = document.getElementById('edit-question-btn');
    if (editBtn) editBtn.addEventListener('click', openQuestionEditor);
    // Nút thu gọn / mở lại khung ca lâm sàng (lưu trạng thái theo caseId trong phiên)
    const caseToggleBtn = document.getElementById('case-toggle-btn');
    if (caseToggleBtn) {
        caseToggleBtn.addEventListener('click', () => {
            const panel = document.getElementById('clinical-case-panel');
            const body = document.getElementById('case-body');
            if (!panel || !body) return;
            const caseKey = panel.getAttribute('data-case-id') || '';
            const willCollapse = !body.classList.contains('hidden');
            body.classList.toggle('hidden', willCollapse);
            if (caseKey) caseCollapseState[caseKey] = willCollapse;
            caseToggleBtn.setAttribute('aria-expanded', willCollapse ? 'false' : 'true');
            const icon = caseToggleBtn.querySelector('i');
            if (icon) icon.className = `fas fa-chevron-${willCollapse ? 'down' : 'up'}`;
            const label = caseToggleBtn.querySelector('.case-toggle-label');
            if (label) label.textContent = willCollapse ? 'Mở ca' : 'Thu gọn';
        });
    }
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

export function showPreviousQuestion() {
    if (state.currentIndex > 0) {
        state.currentIndex--;
        showQuestion();
    }
}

export async function showNextQuestion() {
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

export function handleAnswerClick(e) {
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
