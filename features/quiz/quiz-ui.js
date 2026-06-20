// features/quiz/quiz-ui.js

import { state } from './quiz-state.js';
import { parseMarkdown, renderMath, convertScoreToGPA, formatTime } from './quiz-helpers.js';

export function showSubmitQuizBtn(show) {
    const submitQuizBtn = document.getElementById('submit-quiz-btn');
    if (submitQuizBtn) submitQuizBtn.classList.toggle('hidden', !show);
}

export function updateProgressBar() {
    const progressFill = document.getElementById('quiz-progress-fill');
    if (progressFill) {
        const progress = state.questions.length > 0 ? ((state.currentIndex / state.questions.length) * 100) : 0;
        progressFill.style.width = `${progress}%`;
    }
}

export function renderQuizProgressBar() {
    const answeredCount = state.userAnswers.filter(a => a !== null).length;
    const total = state.questions.length;
    const percent = total > 0 ? Math.round((answeredCount / total) * 100) : 0;
    let navHtml = '';
    for (let i = 0; i < total; i++) {
        const isAnswered = state.userAnswers[i] !== null;
        const isMarked = state.markedQuestions.includes(i);
        
        let btnClass = '';
        let markerHtml = '';
        
        if (isMarked) {
            markerHtml = `<span class="absolute -top-1 -right-1 flex h-3 w-3"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span><span class="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span></span>`;
        }

        if (i === state.currentIndex) {
            btnClass = 'bg-[#FF69B4] text-white shadow-md ring-2 ring-pink-300 transform scale-110 z-10';
        } else if (isAnswered) {
            if (state.quizOptions.showAnswerImmediately) {
                const isCorrect = state.userAnswers[i] === state.questions[i].correctAnswerIndex;
                if (isCorrect) {
                    btnClass = 'bg-green-500 text-white border border-green-600 shadow-sm';
                } else {
                    btnClass = 'bg-red-500 text-white border border-red-600 shadow-sm';
                }
            } else {
                btnClass = 'bg-blue-400 text-white shadow-sm';
            }
        } else {
            btnClass = 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200';
        }
        
        navHtml += `
            <button type="button" class="quiz-nav-btn relative rounded-full w-9 h-9 mx-1 my-1 text-sm font-bold focus:outline-none transition-all ${btnClass}" data-qidx="${i}" title="Câu ${i+1}${isMarked ? ' (Đánh dấu)' : ''}">
                ${i+1}
                ${markerHtml}
            </button>
        `;
    }
    return `
        <div class="mb-4">
            <div class="w-full h-4 bg-gray-100 rounded-full overflow-hidden mb-2 shadow-inner border border-gray-200/50 focus-hide">
                <div class="h-full bg-gradient-to-r from-pink-400 via-purple-400 to-indigo-500 transition-all duration-500 relative" style="width:${percent}%">
                    <div class="absolute inset-0 bg-white/20 bg-striped animate-stripes"></div>
                </div>
            </div>
            <div class="flex justify-between items-center text-xs text-gray-600 mb-2 px-1 focus-hide">
                <span class="font-medium">Đã trả lời: ${answeredCount}/${total} (${percent}%)</span>
                <span class="font-medium">Còn lại: ${total - answeredCount}</span>
            </div>
            <div id="question-nav-wrapper" class="flex flex-wrap justify-center mt-3 bg-gray-50/50 p-2 rounded-xl border border-gray-100 focus-hide">${navHtml}</div>
        </div>
    `;
}

export function renderPreviewQuestions() {
    const previewList = document.getElementById('quiz-preview-list');
    if (!previewList) return;
    if (!state.originalQuestions || state.originalQuestions.length === 0) {
        previewList.innerHTML = `<li class="quiz-preview-empty text-gray-400 italic text-xs">Không có câu hỏi nào để xem trước.</li>`;
        return;
    }

    const previewCount = Math.min(state.originalQuestions.length, 5);
    const previewQuestions = state.originalQuestions.slice(0, previewCount);

    let html = '';
    previewQuestions.forEach((q, idx) => {
        const answerOptions = q.answers || q.options;
        let answersHtml = '';
        if (answerOptions && Array.isArray(answerOptions)) {
            answersHtml = `
                <ul class="preview-answers-2col">
                    ${answerOptions.map((ans, aIdx) => `
                        <li class="preview-answer-item">
                            <span class="font-bold mr-1">${String.fromCharCode(65 + aIdx)}:</span> ${parseMarkdown(ans)}
                        </li>
                    `).join('')}
                </ul>
            `;
        } else {
            answersHtml = `<div class="preview-no-answers text-gray-400 italic text-xs">Không có đáp án.</div>`;
        }

        html += `
            <li class="p-3 bg-pink-50/40 rounded-xl border border-pink-100/60 shadow-sm transition hover:bg-pink-50">
                <div class="preview-question-text text-pink-600 font-bold block mb-2 text-sm">Câu ${idx + 1}: ${parseMarkdown(q.question)}</div>
                ${answersHtml}
            </li>
        `;
    });

    previewList.innerHTML = html;
    renderMath(previewList);
}

export function updateStatDuration() {
    const timedCheckbox = document.getElementById('timed-mode-checkbox');
    const timedInput = document.getElementById('timed-minutes-input');
    const statDuration = document.getElementById('stat-duration');
    if (statDuration) {
        if (timedCheckbox && timedCheckbox.checked && timedInput) {
            statDuration.textContent = `${timedInput.value} phút`;
        } else {
            statDuration.textContent = "Tự do";
        }
    }
}

export function loadQuizDetails() {
    const quizTitle = document.getElementById('quiz-title');
    const quizInfo = document.getElementById('quiz-info');
    const statQuestionsCount = document.getElementById('stat-questions-count');
    
    if (state.quizData) {
        quizTitle.textContent = state.quizData.title;
        quizInfo.textContent = "Hãy lựa chọn cấu hình làm bài phù hợp nhất dưới đây để sẵn sàng chinh phục đỉnh cao kiến thức!";
        document.title = state.quizData.title;
        
        window.quizQuestionsLength = state.originalQuestions.length;
        
        if (statQuestionsCount) {
            statQuestionsCount.textContent = `${state.originalQuestions.length} câu`;
        }
        
        updateStatDuration();
        
        const timedCheckbox = document.getElementById('timed-mode-checkbox');
        const timedInput = document.getElementById('timed-minutes-input');
        if (timedCheckbox) {
            timedCheckbox.addEventListener('change', updateStatDuration);
        }
        if (timedInput) {
            timedInput.addEventListener('input', updateStatDuration);
        }

        const enableCountCheckbox = document.getElementById('enable-question-count-checkbox');
        if (enableCountCheckbox) {
            enableCountCheckbox.dispatchEvent(new Event('change'));
        }

        renderPreviewQuestions();
    }
}

export function showResults(totalTime) {
    const resultsSection = document.getElementById('resultsSection');
    if (!resultsSection) return;

    const retryWrongBtn = document.getElementById('retry-wrong-btn');
    if (retryWrongBtn) {
        const incorrectCount = state.questions.reduce((count, q, idx) => {
            if (state.userAnswers[idx] !== q.correctAnswerIndex) count++;
            return count;
        }, 0);
        if (incorrectCount > 0) {
            retryWrongBtn.classList.remove('hidden');
        } else {
            retryWrongBtn.classList.add('hidden');
        }
    }

    resultsSection.classList.remove('hidden');
    const percentage = state.questions.length > 0 ? ((state.score / state.questions.length) * 100).toFixed(1) : 0;
    const gpaResult = convertScoreToGPA(state.score, state.questions.length);
    const gpa4 = gpaResult.score4;
    const letterGrade = gpaResult.letterGrade;
    const motivation = gpaResult.motivation;
    const score10 = gpaResult.score10;
    const showPracticeButton = state.score < state.questions.length;
    const unansweredList = state.questions.map((q, i) => state.userAnswers[i] === null ? i+1 : null).filter(x => x !== null);
    const markedList = state.markedQuestions.map(i => i+1);

    const detailedResultsHtml = state.questions.map((q, index) => {
        const userAnswerIndex = state.userAnswers[index];
        const isCorrect = userAnswerIndex === q.correctAnswerIndex;
        const answerOptions = q.answers || q.options;

        if (!answerOptions || !Array.isArray(answerOptions)) {
            return `<div class="mb-8 p-6 rounded-lg bg-red-50 border border-red-200">
                        <div class="text-lg font-semibold text-gray-800">Câu ${index + 1}: ${parseMarkdown(q.question || 'Câu hỏi bị lỗi')}</div>
                        <p class="text-red-600 mt-2">Lỗi: Không thể hiển thị chi tiết do dữ liệu đáp án bị lỗi.</p>
                    </div>`;
        }

        const userAnswerText = userAnswerIndex !== null ? answerOptions[userAnswerIndex] : 'Chưa trả lời';
        const correctAnswerText = answerOptions[q.correctAnswerIndex];

        return `
            <div class="mb-8 p-6 rounded-lg ${isCorrect ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}">
                <div class="flex items-center mb-3">
                    ${isCorrect ? 
                        '<i class="fas fa-check-circle text-green-500 text-xl mr-3"></i>' : 
                        '<i class="fas fa-times-circle text-red-500 text-xl mr-3"></i>'
                    }
                    <div class="text-lg font-semibold text-gray-800">Câu ${index + 1}: ${parseMarkdown(q.question)}</div>
                </div>
                <div class="ml-8">
                    <p class="text-gray-700 mb-2">
                        <span class="font-medium">Câu trả lời của bạn:</span> 
                        <span class="${isCorrect ? 'text-green-600' : 'text-red-600'}">${parseMarkdown(userAnswerText)}</span>
                        ${!isCorrect && userAnswerIndex !== null ? `<i class="fas fa-times ml-1"></i>` : ''}
                    </p>
                    <p class="text-gray-700 mb-2">
                        <span class="font-medium">Đáp án đúng:</span> 
                        <span class="text-green-600">${parseMarkdown(correctAnswerText)}</span> <i class="fas fa-check ml-1"></i>
                    </p>
                    <div class="mt-4 p-3 bg-gray-100 rounded-md">
                        <h5 class="font-bold text-gray-800">Giải thích:</h5>
                        <p class="text-gray-700">${parseMarkdown(q.explanation || 'Không có giải thích.')}</p>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    resultsSection.innerHTML = `
        <div class="bg-gradient-to-br from-pink-100 via-white to-pink-200 rounded-2xl shadow-2xl p-10 text-center fade-in animate__animated animate__bounceIn">
            <div class="flex flex-col items-center justify-center mb-6">
                <div class="w-24 h-24 rounded-full bg-[#FF69B4]/10 flex items-center justify-center shadow-lg mb-2 animate__animated animate__tada">
                    <i class="fas fa-crown text-5xl text-[#FF69B4] animate__animated animate__heartBeat"></i>
                </div>
                <h2 class="text-4xl font-extrabold text-[#FF69B4] drop-shadow mb-2">Hoàn thành!</h2>
                <p class="text-gray-600">Đây là kết quả của bạn:</p>
            </div>
            <div class="my-8">
                <p class="text-6xl font-extrabold text-[#FF69B4] animate__animated animate__pulse animate__infinite">
                    ${percentage}%
                </p>
                <p class="text-lg text-gray-700 mt-2">Đúng ${state.score}/${state.questions.length} câu</p>
                <div class="flex flex-wrap justify-center gap-4 mt-4">
                  <div class="bg-white/80 px-6 py-3 rounded-xl shadow text-center">
                    <div class="text-gray-600 text-sm font-medium">Điểm hệ 4</div>
                    <div class="text-3xl font-bold text-blue-500">${gpa4}</div>
                  </div>
                  <div class="bg-white/80 px-6 py-3 rounded-xl shadow text-center">
                    <div class="text-gray-600 text-sm font-medium">Điểm chữ</div>
                    <div class="text-2xl font-bold text-pink-500">${letterGrade}</div>
                  </div>
                  <div class="bg-white/80 px-6 py-3 rounded-xl shadow text-center">
                    <div class="text-gray-600 text-sm font-medium">Điểm hệ 10</div>
                    <div class="text-2xl font-bold text-green-500">${score10}</div>
                  </div>
                </div>
                <div class="mt-3 text-pink-700 font-semibold text-base">${motivation}</div>
                <p class="text-sm text-gray-500 mt-1">Bạn đã trả lời ${state.questions.length - state.userAnswers.filter(a => a === null).length} / ${state.questions.length} câu</p>
            </div>
            <div class="text-md text-gray-500">
                <i class="fas fa-clock mr-2"></i> Thời gian: ${formatTime(totalTime)}
            </div>
            <div class="mt-4 text-left">
                ${unansweredList.length > 0 ? `<div class="mb-2"><span class="font-bold text-red-500">Câu chưa trả lời:</span> ${unansweredList.join(', ')}</div>` : ''}
                ${markedList.length > 0 ? `<div><span class="font-bold text-yellow-600">Câu đã đánh dấu:</span> ${markedList.join(', ')}</div>` : ''}
            </div>
            <div class="mt-8 flex justify-center flex-wrap gap-4">
                <button id="restartQuizBtn" class="px-6 py-3 bg-[#FF69B4] text-white rounded-lg hover:bg-opacity-80 transition shadow-lg">
                    <i class="fas fa-redo mr-2"></i> Làm lại
                </button>
                ${showPracticeButton ? `
                    <button id="practiceIncorrectBtn" class="px-6 py-3 bg-orange-400 text-white rounded-lg hover:bg-orange-500 transition shadow-lg">
                        <i class="fas fa-pencil-alt mr-2"></i> Luyện tập câu sai
                    </button>` : ''}
                <a href="../../index.html#libraryContent" class="px-6 py-3 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition shadow-lg">
                    <i class="fas fa-book mr-2"></i> Về thư viện
                </a>
                <a href="../../index.html" class="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition shadow-lg">
                    <i class="fas fa-home mr-2"></i> Về trang chủ
                </a>
            </div>
        </div>
        <div class="bg-white rounded-lg shadow-lg p-8 mt-8 fade-in">
            <h3 class="text-2xl font-bold text-[#FF69B4] mb-6 text-center">Chi tiết kết quả</h3>
            <div id="detailed-results-list">
                ${detailedResultsHtml}
            </div>
        </div>
    `;
    renderMath(resultsSection);
}

export function toggleFocusMode() {
    state.focusMode = !state.focusMode;
    document.body.classList.toggle('focus-mode-active', state.focusMode);
    
    const exitFocusBtn = document.getElementById('exit-focus-btn');
    if (exitFocusBtn) {
        exitFocusBtn.classList.toggle('hidden', !state.focusMode);
    }

    const navWrapper = document.getElementById('question-nav-wrapper');
    if (state.focusMode) {
        if (navWrapper) navWrapper.style.display = 'none';
    } else {
        const toggleBtn = document.getElementById('toggle-nav-btn');
        // Let main controller update visibility or restore manually
        if (navWrapper) navWrapper.style.display = '';
    }
}
