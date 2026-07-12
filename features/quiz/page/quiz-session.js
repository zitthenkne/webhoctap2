// File: features/quiz/page/quiz-session.js
// Vòng đời một PHIÊN làm bài: tải dữ liệu bộ đề, bắt đầu/khôi phục phiên, đồng hồ đếm giờ,
// nộp bài (endQuiz), luyện tập lại câu sai và đọc cấu hình từ trang thiết lập.
// Tách từ quiz-page.js — logic giữ nguyên.

import { db } from '../../../core/firebase-init.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { showToast } from '../../../core/utils.js';
import { applyLocalQuestionEdits } from '../quiz-editor.js';
import { getOfflineQuiz, refreshOfflineQuizIfSaved } from '../quiz-offline-store.js';
import { state, saveQuizState, clearQuizState, saveQuizResult } from '../quiz-state.js';
import { shuffleArray, shuffleQuestionOptions } from '../quiz-helpers.js';
import { showSubmitQuizBtn, loadQuizDetails, showResults, toggleFocusMode } from '../quiz-ui.js';
import { getVibrate } from './quiz-page-prefs.js';
import { pullStudyFromCloud, whenStudyPulled, currentQuizId } from './quiz-study-sync.js';
import { buildSrsQueue } from '../quiz-srs-store.js';
import { groupQuestionsByCase, tagCaseSequence } from './quiz-cases.js';
import { showQuestion, accrueTime } from './quiz-question-view.js';
import { hideMobileNav } from './quiz-mobile-nav.js';

let autoSaveInterval = null;

// Biến trang thiết lập thành card lỗi rõ ràng (icon + thông điệp + Thử lại / Về trang chủ)
// thay vì kẹt ở "Đang tải thông tin..." với tiêu đề "Lỗi" khô khan.
function showLandingError(message, { showRetry = true } = {}) {
    const landing = document.getElementById('quiz-landing');
    if (!landing) return;
    landing.innerHTML = `
        <div class="py-8 flex flex-col items-center text-center gap-4">
            <div class="w-16 h-16 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center text-2xl">
                <i class="fas fa-triangle-exclamation"></i>
            </div>
            <h1 class="text-xl font-extrabold text-gray-700">Không tải được bộ đề</h1>
            <p class="text-sm text-gray-500 max-w-sm">${message}</p>
            <div class="flex flex-wrap gap-3 justify-center mt-2">
                ${showRetry ? `<button type="button" id="landing-retry-btn" class="px-6 py-2.5 bg-gradient-to-r from-pink-500 to-[#FF69B4] text-white rounded-xl font-bold text-sm shadow hover:scale-[1.03] active:scale-[0.97] transition"><i class="fas fa-rotate-right"></i> Thử lại</button>` : ''}
                <a href="../../index.html" class="px-6 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-200 transition"><i class="fas fa-home"></i> Về trang chủ</a>
            </div>
        </div>`;
    const retryBtn = document.getElementById('landing-retry-btn');
    if (retryBtn) retryBtn.addEventListener('click', () => window.location.reload());
    // Nút "Bắt đầu ngay" gốc đã bị gỡ cùng landing -> ẩn luôn thanh bắt đầu nổi (mobile),
    // vì IntersectionObserver không bắn lại khi phần tử theo dõi rời DOM.
    const mobileBar = document.getElementById('mobile-start-bar');
    if (mobileBar) mobileBar.classList.remove('show');
    document.title = 'Không tải được bộ đề';
}

export async function loadQuizData() {
    const urlParams = new URLSearchParams(window.location.search);
    const quizId = urlParams.get('id');

    if (!quizId) {
        showLandingError('Đường dẫn không có ID bộ đề. Hãy mở lại bộ đề từ thư viện nhé.', { showRetry: false });
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
            showLandingError('Không tìm thấy bộ đề này. Có thể nó đã bị xóa hoặc đường dẫn không đúng.', { showRetry: false });
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
        showLandingError('Có lỗi khi tải dữ liệu (mạng chập chờn hoặc máy chủ bận). Bộ đề này chưa được tải về máy để làm offline.');
    }
}

export function startQuizMode(questionsArray, mode = 'normal', restoreState = null) {
    if (mode === 'normal' || mode === 'practice' || mode === 'srs') {
        showSubmitQuizBtn(true);
    } else {
        showSubmitQuizBtn(false);
    }
    state.quizMode = mode;
    state.questions = questionsArray;
    // Bảo đảm thông tin thứ tự câu trong ca lâm sàng luôn có mặt cho mọi đường vào
    // (luyện tập lại, khôi phục bài làm dở...), không chỉ riêng startQuizWithCurrentSettings.
    tagCaseSequence(state.questions);

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

export function endQuiz() {
    showSubmitQuizBtn(false);
    // #11: chốt thời gian của câu cuối cùng đang xem
    accrueTime();
    state._timingIndex = null;
    const hud = document.getElementById('quiz-hud');
    if (hud) hud.style.display = 'none';
    // Ẩn thanh điều hướng đáy (mobile) + đóng bảng nhảy câu khi rời màn làm bài
    hideMobileNav();
    // Rời màn làm bài -> ẩn nhóm điều khiển làm bài trong bảng thiết lập
    document.body.classList.remove('quiz-active');
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
        autoSaveInterval = null;
    }
    if (state.focusMode) {
        toggleFocusMode();
    }

    // LUÔN chấm lại điểm từ userAnswers: "Xem đáp án ngay" giờ bật/tắt được giữa chừng
    // (bảng Ngựa thì chỉnh) nên bộ đếm dồn state.score không còn đáng tin — các câu trả
    // lời trong lúc chế độ đang tắt không được cộng điểm lúc bấm.
    state.score = 0;
    for (let i = 0; i < state.questions.length; i++) {
        if (state.userAnswers[i] === state.questions[i].correctAnswerIndex) state.score++;
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

export function startIncorrectPracticeMode() {
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

export function startTimer(totalSeconds) {
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

// Tắt đồng hồ đếm ngược giữa chừng (công tắc "Tính giờ" trong bảng Ngựa thì chỉnh)
export function stopTimer() {
    if (state.quizTimerInterval) clearInterval(state.quizTimerInterval);
    state.quizTimerInterval = null;
    const timerDisplay = document.getElementById('timerDisplay');
    if (timerDisplay) {
        timerDisplay.classList.add('hidden');
        timerDisplay.classList.remove('timer-warn', 'timer-critical');
    }
}

export function startQuizWithCurrentSettings() {
    clearQuizState();
    state.streak = 0;
    state.used5050Questions = {};

    // Gắn chỉ số gốc (__origIdx) cho từng câu để khi người dùng chỉnh sửa trong lúc làm bài
    // còn ánh xạ ngược về đúng câu trong dữ liệu gốc (kể cả khi đã trộn câu/đáp án).
    let selectedQuestions = state.originalQuestions.map((q, i) => ({ ...q, __origIdx: i }));

    // Gom các câu cùng ca lâm sàng (caseId) thành "khối" để không bị xé lẻ khi trộn/cắt số câu.
    // Câu không có caseId là khối kích thước 1.
    let caseBlocks = groupQuestionsByCase(selectedQuestions);

    const shuffleCheckbox = document.getElementById('shuffle-questions-checkbox');
    if (shuffleCheckbox && shuffleCheckbox.checked) {
        // Trộn ở mức KHỐI: thứ tự các ca bị xáo, nhưng câu con trong mỗi ca giữ nguyên thứ tự.
        caseBlocks = shuffleArray(caseBlocks);
    }

    const enableCountCheckbox = document.getElementById('enable-question-count-checkbox');
    const countInput = document.getElementById('question-count-input');
    if (enableCountCheckbox && enableCountCheckbox.checked && countInput) {
        const countVal = parseInt(countInput.value);
        if (!isNaN(countVal) && countVal > 0) {
            // Cắt theo ranh giới khối: gom đủ khối cho tới khi đạt số câu yêu cầu, không cắt ngang một ca.
            const limitedBlocks = [];
            let total = 0;
            for (const block of caseBlocks) {
                if (total >= countVal) break;
                limitedBlocks.push(block);
                total += block.length;
            }
            caseBlocks = limitedBlocks;
        }
    }

    selectedQuestions = caseBlocks.flat();
    // Gán thứ tự câu trong ca (__caseSeq / __caseTotal / __caseFirst) sau khi đã chốt thứ tự cuối.
    tagCaseSequence(selectedQuestions);

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

// Bắt đầu phiên ÔN NGẮT QUÃNG: hàng đợi = câu đến hạn + câu mới trong quota ngày
// (xem quiz-srs-store.js). Luôn hiện đáp án ngay (cần biết đúng/sai để chấm lịch),
// không tính giờ. Trả về (Promise) false nếu hôm nay không còn gì để ôn.
export async function startSrsSession() {
    // Firestore là nguồn chính: chờ bản kéo cloud đầu tiên hợp nhất vào local
    // (timeout 4s — mạng chậm/khách thì dùng local) rồi mới tính hàng đợi,
    // để máy mới không coi toàn bộ câu đã học là "câu mới".
    await whenStudyPulled();
    clearQuizState();
    state.streak = 0;
    state.used5050Questions = {};
    state.quizOptions.isTimed = false;
    state.quizOptions.timedMinutes = 0;
    state.quizOptions.showAnswerImmediately = true;

    const base = state.originalQuestions.map((q, i) => ({ ...q, __origIdx: i }));
    const { queue, dueCount, newCount } = buildSrsQueue(
        currentQuizId(), base, { title: state.quizData && state.quizData.title }
    );
    if (!queue.length) {
        showToast('Hôm nay không có câu nào đến hạn ôn. Quay lại sau nhé!', 'info');
        return false;
    }

    let questions = queue;
    const shuffleAnswersCheckbox = document.getElementById('shuffle-answers-checkbox');
    if (shuffleAnswersCheckbox && shuffleAnswersCheckbox.checked) {
        questions = questions.map(q => shuffleQuestionOptions(q));
    }

    state._srsSessionInfo = { dueCount, newCount };
    startQuizMode(questions, 'srs');
    return true;
}
