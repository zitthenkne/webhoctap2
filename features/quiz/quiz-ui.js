// features/quiz/quiz-ui.js

import { state, MARK_REASONS } from './quiz-state.js';
import { parseMarkdown, renderMath, convertScoreToGPA, formatTime, triggerConfetti } from './quiz-helpers.js';

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
            const rk = (state.markedReasons && state.markedReasons[i]) || 'review';
            const mc = (MARK_REASONS[rk] && MARK_REASONS[rk].color) || '#eab308';
            markerHtml = `<span class="absolute -top-1 -right-1 flex h-3 w-3"><span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style="background:${mc}"></span><span class="relative inline-flex rounded-full h-3 w-3" style="background:${mc}"></span></span>`;
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
            <button type="button" class="quiz-nav-btn relative rounded-full w-8 h-8 text-sm font-bold focus:outline-none transition-all ${btnClass}" data-qidx="${i}" title="Câu ${i+1}${isMarked ? ' (Đánh dấu)' : ''}">
                ${i+1}
                ${markerHtml}
            </button>
        `;
    }
    return `
        <div class="mb-4">
            <div class="flex justify-between items-center text-xs text-gray-600 mb-2 px-1 focus-hide">
                <span class="font-medium">Đã trả lời: ${answeredCount}/${total} (${percent}%)</span>
                <span class="font-medium">Còn lại: ${total - answeredCount}</span>
            </div>
            <div id="question-nav-wrapper" class="quiz-nav-grid mt-3 bg-gray-50/50 rounded-xl border border-gray-100 focus-hide">${navHtml}</div>
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

    const total = state.originalQuestions.length;
    const previewCount = Math.min(total, 5);
    const previewQuestions = state.originalQuestions.slice(0, previewCount);

    // Cập nhật huy hiệu đếm: "X / Y câu"
    const badge = document.getElementById('preview-count-badge');
    if (badge) badge.innerHTML = `<i class="fas fa-layer-group"></i> ${previewCount} / ${total} câu`;

    let html = '';
    previewQuestions.forEach((q, idx) => {
        const answerOptions = q.answers || q.options;
        let answersHtml = '';
        if (answerOptions && Array.isArray(answerOptions)) {
            answersHtml = `
                <ul class="qpc-answers">
                    ${answerOptions.map((ans, aIdx) => `
                        <li class="qpc-ans">
                            <span class="qpc-letter">${String.fromCharCode(65 + aIdx)}</span>
                            <span class="qpc-text">${parseMarkdown(ans)}</span>
                        </li>
                    `).join('')}
                </ul>
            `;
        } else {
            answersHtml = `<div class="preview-no-answers">Không có đáp án.</div>`;
        }

        html += `
            <li class="quiz-preview-card">
                <div class="qpc-head">
                    <span class="qpc-num">${idx + 1}</span>
                    <div class="qpc-q">${parseMarkdown(q.question)}</div>
                </div>
                ${answersHtml}
            </li>
        `;
    });

    // Lưu ý: đáp án đúng được giấu cho tới khi làm bài
    html += `
        <li class="quiz-preview-foot">
            <i class="fas fa-lock"></i> Đáp án đúng sẽ hiện khi bạn bắt đầu làm bài
        </li>
    `;

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

        // Gợi ý thời gian làm bài: phút = ceil(số câu / 2 + 10)
        const estMinutes = Math.max(1, Math.ceil(state.originalQuestions.length / 2 + 10));
        const statDurationEst = document.getElementById('stat-duration-est');
        if (statDurationEst) {
            statDurationEst.textContent = `≈ ${estMinutes} phút gợi ý`;
        }
        // Điền sẵn thời gian gợi ý cho chế độ tính giờ (người dùng vẫn chỉnh được)
        if (typeof window.applySuggestedTime === 'function') window.applySuggestedTime();

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

    resultsSection.classList.remove('hidden');

    // --- Tính toán thống kê ---
    const total = state.questions.length;
    let correctCount = 0;
    state.questions.forEach((q, i) => {
        if (state.userAnswers[i] === q.correctAnswerIndex) correctCount++;
    });
    const answeredCount = state.userAnswers.filter(a => a !== null && a !== undefined).length;
    const unansweredCount = total - answeredCount;
    const wrongCount = answeredCount - correctCount;

    const percentage = total > 0 ? (correctCount / total) * 100 : 0;
    const percentageStr = percentage.toFixed(1);
    const gpaResult = convertScoreToGPA(correctCount, total);
    const { score4: gpa4, letterGrade, motivation, score10 } = gpaResult;
    const incorrectCount = total - correctCount;
    const showPracticeButton = incorrectCount > 0;

    // Màu sắc theo thành tích
    let ringColor = '#ef4444', ringBg = '#fee2e2';
    if (percentage >= 80) { ringColor = '#22c55e'; ringBg = '#dcfce7'; }
    else if (percentage >= 50) { ringColor = '#f59e0b'; ringBg = '#fef3c7'; }

    const radius = 52;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference * (1 - percentage / 100);

    // --- Thống kê theo chủ đề (chỉ hiện khi có từ 2 chủ đề trở lên) ---
    const topicStats = {};
    state.questions.forEach((q, i) => {
        const t = (q.topic && String(q.topic).trim()) ? String(q.topic).trim() : '';
        if (!t || t.toLowerCase() === 'chung') return;
        if (!topicStats[t]) topicStats[t] = { correct: 0, total: 0 };
        topicStats[t].total++;
        if (state.userAnswers[i] === q.correctAnswerIndex) topicStats[t].correct++;
    });
    const topicEntries = Object.entries(topicStats);
    let topicHtml = '';
    if (topicEntries.length >= 2) {
        topicHtml = `
        <div class="bg-white rounded-2xl shadow-lg p-5 sm:p-6 mt-6 fade-in text-left">
            <h3 class="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
                <i class="fas fa-chart-pie text-pink-500"></i> Kết quả theo chủ đề
            </h3>
            <div class="space-y-3">
                ${topicEntries.map(([topic, s]) => {
                    const pct = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
                    let barColor = 'bg-red-400';
                    if (pct >= 80) barColor = 'bg-green-500';
                    else if (pct >= 50) barColor = 'bg-amber-400';
                    return `
                    <div>
                        <div class="flex justify-between items-center text-sm mb-1">
                            <span class="font-medium text-gray-600 truncate pr-2">${topic}</span>
                            <span class="font-semibold text-gray-500 flex-shrink-0">${s.correct}/${s.total} · ${pct}%</span>
                        </div>
                        <div class="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                            <div class="h-full ${barColor} rounded-full transition-all duration-700" style="width:${pct}%"></div>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    }

    // --- Danh sách chi tiết từng câu ---
    const letter = (idx) => String.fromCharCode(65 + idx);
    const statusConfig = {
        correct: { wrap: 'bg-green-50/60 border-green-200', icon: 'fa-check-circle text-green-500', pill: 'bg-green-100 text-green-700', label: 'Đúng' },
        wrong: { wrap: 'bg-red-50/60 border-red-200', icon: 'fa-times-circle text-red-500', pill: 'bg-red-100 text-red-700', label: 'Sai' },
        unanswered: { wrap: 'bg-gray-50 border-gray-200', icon: 'fa-minus-circle text-gray-400', pill: 'bg-gray-200 text-gray-600', label: 'Bỏ trống' }
    };

    // #11: xác định câu tốn nhiều thời gian nhất (chỉ xét câu có >0s) để đánh dấu tinh tế
    const times = Array.isArray(state.questionTimes) ? state.questionTimes : [];
    let slowestIdx = -1, slowestVal = 0;
    times.forEach((t, i) => { if (t > slowestVal) { slowestVal = t; slowestIdx = i; } });
    // #7: số câu người dùng tự nhận là "đoán"
    const guessCount = Object.values(state.confidence || {}).filter(v => v === 'guess').length;

    // Câu đã đánh dấu (kèm lý do) -> hiển thị nhãn trong chi tiết + bộ lọc riêng
    const markedSet = new Set(state.markedQuestions || []);
    const markedReasons = state.markedReasons || {};
    const markedCount = markedSet.size;

    const detailedResultsHtml = state.questions.map((q, index) => {
        const userAnswerIndex = state.userAnswers[index];
        const answerOptions = q.answers || q.options;
        const isUnanswered = userAnswerIndex === null || userAnswerIndex === undefined;
        const isCorrect = !isUnanswered && userAnswerIndex === q.correctAnswerIndex;
        const status = isCorrect ? 'correct' : (isUnanswered ? 'unanswered' : 'wrong');

        if (!answerOptions || !Array.isArray(answerOptions)) {
            return `<div class="result-item rounded-xl bg-red-50 border border-red-200 p-3" data-status="wrong">
                        <div class="text-sm font-semibold text-gray-800">Câu ${index + 1}: dữ liệu đáp án bị hỏng.</div>
                    </div>`;
        }

        const userAnswerText = !isUnanswered ? parseMarkdown(answerOptions[userAnswerIndex]) : '';
        const correctAnswerText = parseMarkdown(answerOptions[q.correctAnswerIndex]);
        const cfg = statusConfig[status];
        const correctOptionExp = q.optionExplanations && q.optionExplanations[q.correctAnswerIndex] && String(q.optionExplanations[q.correctAnswerIndex]).trim();
        const explanationText = correctOptionExp || (q.explanation && String(q.explanation).trim());
        const hasExplanation = !!explanationText;

        const markReasonKey = markedSet.has(index) ? (markedReasons[index] || 'review') : '';
        const mr = markReasonKey ? MARK_REASONS[markReasonKey] : null;
        const markBadge = mr ? `<span class="q-mark-badge" style="background:${mr.bg};color:${mr.text}" title="Đã đánh dấu: ${mr.label}"><i class="fas ${mr.icon}"></i> ${mr.short}</span>` : '';

        return `
        <div class="result-item rounded-xl border ${cfg.wrap} overflow-hidden transition-all" data-status="${status}" data-marked="${markReasonKey}">
            <div class="result-header flex items-start gap-2.5 p-3 cursor-pointer select-none" role="button" tabindex="0" aria-expanded="false">
                <i class="fas ${cfg.icon} text-lg flex-shrink-0 mt-0.5"></i>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center flex-wrap gap-2 mb-0.5">
                        <span class="text-xs font-bold text-gray-500">Câu ${index + 1}</span>
                        <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cfg.pill}">${cfg.label}</span>
                        ${(times[index] > 0) ? `<span class="q-time ${index === slowestIdx && slowestVal >= 5 ? 'q-slow' : ''}" title="Thời gian làm câu này"><i class="fas fa-clock"></i> ${formatTime(times[index])}${index === slowestIdx && slowestVal >= 5 ? ' · lâu nhất' : ''}</span>` : ''}
                        ${state.confidence && state.confidence[index] === 'guess' ? `<span class="q-guess-badge" title="Bạn đã đánh dấu là đoán"><i class="fas fa-dice"></i> Đoán</span>` : ''}
                        ${markBadge}
                    </div>
                    <div class="result-question text-sm text-gray-700 line-clamp-2">${parseMarkdown(q.question)}</div>
                </div>
                <i class="fas fa-chevron-down text-gray-300 text-xs flex-shrink-0 mt-1.5 result-chevron transition-transform duration-300"></i>
            </div>
            <div class="result-body hidden border-t border-gray-200/50 px-3 py-3 space-y-2 text-sm bg-white/50">
                ${!isCorrect ? `
                <div>
                    <span class="font-medium text-gray-500">Bạn chọn: </span>
                    <span class="${isUnanswered ? 'text-gray-400 italic' : 'text-red-600 font-medium'}">${isUnanswered ? 'Chưa trả lời' : letter(userAnswerIndex) + '. ' + userAnswerText}</span>
                </div>` : ''}
                <div>
                    <span class="font-medium text-gray-500">Đáp án đúng: </span>
                    <span class="text-green-600 font-medium">${letter(q.correctAnswerIndex)}. ${correctAnswerText}</span>
                </div>
                ${hasExplanation ? `
                <div class="mt-1 p-2.5 bg-amber-50/60 border border-amber-100 rounded-lg text-gray-600">
                    <span class="font-semibold text-gray-700"><i class="fas fa-lightbulb text-amber-400 mr-1"></i>Giải thích:</span> ${parseMarkdown(explanationText)}
                </div>` : ''}
            </div>
        </div>`;
    }).join('');

    resultsSection.innerHTML = `
        <!-- Thẻ tổng kết -->
        <div class="bg-white rounded-3xl shadow-xl p-6 sm:p-8 fade-in border border-pink-100/60">
            <div class="flex flex-col md:flex-row items-center gap-6 md:gap-10">
                <!-- Vòng tròn phần trăm -->
                <div class="relative flex-shrink-0">
                    <svg width="150" height="150" viewBox="0 0 120 120" class="-rotate-90">
                        <circle cx="60" cy="60" r="${radius}" fill="none" stroke="${ringBg}" stroke-width="12" />
                        <circle id="result-ring" cx="60" cy="60" r="${radius}" fill="none" stroke="${ringColor}" stroke-width="12" stroke-linecap="round"
                            stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${circumference.toFixed(2)}"
                            style="transition: stroke-dashoffset 1.2s ease-out;" />
                    </svg>
                    <div class="absolute inset-0 flex flex-col items-center justify-center">
                        <span class="text-3xl font-extrabold" style="color:${ringColor}">${percentageStr}%</span>
                        <span class="text-xs text-gray-400 font-medium">${correctCount}/${total} câu</span>
                    </div>
                </div>
                <!-- Thông tin tổng kết -->
                <div class="flex-1 text-center md:text-left w-full">
                    <h2 class="text-2xl sm:text-3xl font-extrabold text-gray-800 mb-1">Hoàn thành! 🎉</h2>
                    <p class="text-pink-600 font-semibold mb-4">${motivation}</p>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                        <div class="bg-green-50 border border-green-100 rounded-xl px-3 py-2 text-center">
                            <div class="text-lg font-bold text-green-600">${correctCount}</div>
                            <div class="text-[11px] text-gray-500 font-medium">Đúng</div>
                        </div>
                        <div class="bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-center">
                            <div class="text-lg font-bold text-red-500">${wrongCount}</div>
                            <div class="text-[11px] text-gray-500 font-medium">Sai</div>
                        </div>
                        <div class="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-center">
                            <div class="text-lg font-bold text-gray-500">${unansweredCount}</div>
                            <div class="text-[11px] text-gray-500 font-medium">Bỏ trống</div>
                        </div>
                        <div class="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-center">
                            <div class="text-lg font-bold text-blue-500">${formatTime(totalTime)}</div>
                            <div class="text-[11px] text-gray-500 font-medium">Thời gian</div>
                        </div>
                    </div>
                    <div class="flex flex-wrap justify-center md:justify-start gap-2">
                        <span class="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full text-sm font-semibold border border-blue-100">Hệ 4: <b>${gpa4}</b></span>
                        <span class="inline-flex items-center gap-1.5 bg-pink-50 text-pink-700 px-3 py-1.5 rounded-full text-sm font-semibold border border-pink-100">Điểm chữ: <b>${letterGrade}</b></span>
                        <span class="inline-flex items-center gap-1.5 bg-green-50 text-green-700 px-3 py-1.5 rounded-full text-sm font-semibold border border-green-100">Hệ 10: <b>${score10}</b></span>
                    </div>
                </div>
            </div>

            <!-- Instant Redo Loop Banner -->
            ${showPracticeButton ? `
            <div class="mt-6 p-5 sm:p-6 bg-gradient-to-r from-amber-500/15 via-orange-500/15 to-red-500/10 border-2 border-amber-400/80 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-md transition-all duration-300">
                <div class="flex items-center gap-4 text-left">
                    <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shadow-lg flex-shrink-0 animate-bounce">
                        <i class="fas fa-fire text-2xl"></i>
                    </div>
                    <div>
                        <h4 class="font-extrabold text-gray-800 text-lg sm:text-xl flex flex-wrap items-center gap-2">
                            <span>Instant Redo Loop</span>
                            <span class="text-xs bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full font-bold border border-amber-300/60">⚡ Khuyên dùng</span>
                        </h4>
                        <p class="text-xs sm:text-sm text-gray-700 font-medium mt-1">Bạn có <span class="text-red-600 font-extrabold text-base">${incorrectCount} câu</span> sai hoặc chưa trả lời. Ôn lại ngay lúc đang có ấn tượng mạnh để nhớ lâu nhất!</p>
                    </div>
                </div>
                <button id="practiceIncorrectBtn" class="w-full md:w-auto px-6 py-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl shadow-[0_8px_20px_rgba(245,158,11,0.4)] hover:scale-[1.03] active:scale-[0.98] transition-all font-extrabold text-sm sm:text-base flex items-center justify-center gap-2.5 flex-shrink-0">
                    <i class="fas fa-redo-alt"></i> Làm lại ngay ${incorrectCount} câu sai
                </button>
            </div>` : `
            <div class="mt-6 p-5 sm:p-6 bg-gradient-to-r from-green-500/15 to-emerald-500/15 border-2 border-green-400/80 rounded-2xl flex items-center gap-4 text-left shadow-md">
                <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 text-white flex items-center justify-center shadow-lg flex-shrink-0">
                    <i class="fas fa-trophy text-2xl"></i>
                </div>
                <div>
                    <h4 class="font-extrabold text-green-800 text-lg sm:text-xl">Hoàn hảo! 100% chính xác!</h4>
                    <p class="text-xs sm:text-sm text-green-700 font-medium mt-1">Bạn đã trả lời đúng toàn bộ ${total} câu hỏi trong phiên này. Quá xuất sắc, không còn câu nào cần làm lại!</p>
                </div>
            </div>`}

            <div class="mt-6 pt-6 border-t border-gray-100 flex flex-wrap justify-center gap-3">
                <button id="restartQuizBtn" class="px-5 py-2.5 bg-[#FF69B4] text-white rounded-xl hover:bg-opacity-90 hover:scale-[1.02] transition shadow-md font-semibold flex items-center gap-2">
                    <i class="fas fa-redo"></i> Làm lại toàn bộ
                </button>
                <a href="../../index.html#libraryContent" class="px-5 py-2.5 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition shadow-sm font-semibold flex items-center gap-2">
                    <i class="fas fa-book"></i> Thư viện
                </a>
                <a href="../../index.html" class="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition shadow-sm font-semibold flex items-center gap-2">
                    <i class="fas fa-home"></i> Trang chủ
                </a>
            </div>
        </div>

        ${topicHtml}

        <!-- Chi tiết kết quả -->
        <div class="bg-white rounded-2xl shadow-lg p-5 sm:p-6 mt-6 fade-in">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                <div>
                <h3 class="text-xl font-bold text-gray-700 flex items-center gap-2">
                    <i class="fas fa-list-ul text-pink-500"></i> Chi tiết kết quả
                </h3>
                ${(guessCount > 0 || (slowestIdx >= 0 && slowestVal >= 5)) ? `
                <p class="text-xs text-gray-400 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    ${guessCount > 0 ? `<span><i class="fas fa-dice text-amber-400 mr-1"></i>Đã đoán: ${guessCount} câu</span>` : ''}
                    ${(slowestIdx >= 0 && slowestVal >= 5) ? `<span><i class="fas fa-clock text-amber-400 mr-1"></i>Lâu nhất: Câu ${slowestIdx + 1} (${formatTime(slowestVal)})</span>` : ''}
                </p>` : ''}
                </div>
                <div class="flex flex-wrap gap-1.5" id="result-filter-tabs">
                    <button data-filter="all" class="result-filter-btn px-3 py-1.5 rounded-full text-xs font-semibold bg-pink-500 text-white transition">Tất cả (${total})</button>
                    <button data-filter="wrong" class="result-filter-btn px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition">Câu sai (${wrongCount})</button>
                    <button data-filter="unanswered" class="result-filter-btn px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition">Bỏ trống (${unansweredCount})</button>
                    <button data-filter="correct" class="result-filter-btn px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition">Đúng (${correctCount})</button>
                    ${markedCount > 0 ? `<button data-filter="marked" class="result-filter-btn px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition"><i class="fas fa-flag mr-1 text-amber-500"></i>Đã đánh dấu (${markedCount})</button>` : ''}
                </div>
            </div>
            <div id="detailed-results-list" class="space-y-2.5">
                ${detailedResultsHtml}
            </div>
            <div id="result-empty-msg" class="hidden text-center text-gray-400 py-8 italic">Không có câu nào trong mục này.</div>
        </div>

        <!-- Dòng nguồn tinh tế -->
        <p class="flex flex-wrap items-center justify-center gap-1.5 mt-6 mb-2 text-[11px] text-gray-400/90 tracking-wide">
            <span>&copy; 2025</span>
            <a href="https://fb.com/vietthanh1911" target="_blank" rel="noopener noreferrer"
                class="font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#FF69B4] to-[#D8BFD8] hover:underline underline-offset-2 transition-all duration-200">Zitthenk</a>
            <span class="text-pink-300/70">&bull;</span>
            <span>Y23C</span>
            <span class="text-pink-300/70">&bull;</span>
            <span>17</span>
            <span class="text-pink-300/70">&bull;</span>
            <span>UMP</span>
        </p>
    `;

    // Hiệu ứng vẽ vòng tròn phần trăm
    requestAnimationFrame(() => {
        const ring = document.getElementById('result-ring');
        if (ring) ring.style.strokeDashoffset = dashOffset.toFixed(2);
    });

    // Pháo giấy chúc mừng khi đạt điểm cao
    if (percentage >= 80) {
        setTimeout(() => triggerConfetti(), 300);
    }

    // Bộ lọc danh sách chi tiết
    const filterTabs = document.getElementById('result-filter-tabs');
    if (filterTabs) {
        filterTabs.addEventListener('click', (e) => {
            const btn = e.target.closest('.result-filter-btn');
            if (!btn) return;
            const filter = btn.getAttribute('data-filter');
            filterTabs.querySelectorAll('.result-filter-btn').forEach(b => {
                b.classList.remove('bg-pink-500', 'text-white');
                b.classList.add('bg-gray-100', 'text-gray-600', 'hover:bg-gray-200');
            });
            btn.classList.add('bg-pink-500', 'text-white');
            btn.classList.remove('bg-gray-100', 'text-gray-600', 'hover:bg-gray-200');

            let visibleCount = 0;
            document.querySelectorAll('#detailed-results-list .result-item').forEach(item => {
                let match;
                if (filter === 'all') match = true;
                else if (filter === 'marked') match = !!item.getAttribute('data-marked');
                else match = item.getAttribute('data-status') === filter;
                item.classList.toggle('hidden', !match);
                if (match) visibleCount++;
            });
            const emptyMsg = document.getElementById('result-empty-msg');
            if (emptyMsg) emptyMsg.classList.toggle('hidden', visibleCount > 0);
        });
    }

    // Mở/đóng chi tiết từng câu (accordion): mặc định gọn, bấm để xem đầy đủ
    const detailedList = document.getElementById('detailed-results-list');
    if (detailedList) {
        const toggleItem = (header) => {
            const item = header.closest('.result-item');
            if (!item) return;
            const body = item.querySelector('.result-body');
            if (!body) return;
            const chevron = header.querySelector('.result-chevron');
            const question = header.querySelector('.result-question');
            const willOpen = body.classList.contains('hidden');
            body.classList.toggle('hidden', !willOpen);
            if (chevron) chevron.classList.toggle('rotate-180', willOpen);
            if (question) question.classList.toggle('line-clamp-2', !willOpen);
            header.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        };
        detailedList.addEventListener('click', (e) => {
            const header = e.target.closest('.result-header');
            if (header) toggleItem(header);
        });
        detailedList.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const header = e.target.closest('.result-header');
            if (header) {
                e.preventDefault();
                toggleItem(header);
            }
        });
    }

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
