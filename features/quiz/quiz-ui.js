// features/quiz/quiz-ui.js

import { state, MARK_REASONS } from './quiz-state.js';
import { scrollBehaviorFor, sfx, getVibrate } from './page/quiz-page-prefs.js';
import { parseMarkdown, renderMath, convertScoreToGPA, formatTime, triggerConfetti, stripOptionLabels, isAnswerCorrect, getCorrectIndexes, answerCredit, sessionScore } from './quiz-helpers.js';
import { previewSrsCounts, getNewPerDay, setNewPerDay } from './quiz-srs-store.js';
import { caseCellClass } from './page/quiz-cases.js';
import { isEssay, isPendingEssay, isEssayGraded, needsReview, questionWeight } from './quiz-essay-core.js';
import { essayReviewHtml } from './page/quiz-essay.js';
import { readNotes, noteTagsOf, noteTextHtml } from './page/quiz-notes-panel.js';
import { onSessionUser, sessionUser } from '../../core/auth-session.js';
import { showToast } from '../../core/utils.js';
import { wrongItemsMarkdown, wrongItemsCsv } from './quiz-export.js';

// Ghi nhớ + Mở rộng kiến thức của một câu ở màn kết quả (trắc nghiệm lẫn tự luận) — chế độ
// "nộp xong mới mở đáp án" không có dịp xem hai thẻ này trong lúc làm bài.
export function studyExtrasHtml(q) {
    const note = String((q && q.note) || '').trim();
    const more = String((q && q.expanded) || '').trim();
    return (note ? `<div class="study-extra is-memo"><div class="study-extra-head"><i class="fas fa-lightbulb"></i> Ghi nhớ</div>
            <div class="study-extra-body">${parseMarkdown(note)}</div></div>` : '')
        + (more ? `<details class="study-extra is-more" open><summary class="study-extra-head"><i class="fas fa-book-open"></i> Mở rộng kiến thức<i class="fas fa-chevron-down study-extra-chev" aria-hidden="true"></i></summary>
            <div class="study-extra-body">${parseMarkdown(more)}</div></details>` : '');
}

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

// Ô số câu dùng CHUNG bộ lớp trạng thái với bảng nhảy câu mobile (.qjs-cell):
// is-current / is-correct / is-wrong / is-answered / (không lớp = chưa làm).
function navStateClass(i) {
    const ans = state.userAnswers[i];
    const answered = ans !== null && ans !== undefined;
    if (i === state.currentIndex) return answered ? 'is-current is-done' : 'is-current';
    if (!answered) return '';
    if (!state.quizOptions.showAnswerImmediately || isPendingEssay(state.questions[i], ans)) return 'is-answered';
    return isAnswerCorrect(state.questions[i], ans) ? 'is-correct' : 'is-wrong';
}
function navMarkKey(i) {
    return state.markedQuestions.includes(i)
        ? ((state.markedReasons && state.markedReasons[i]) || 'review')
        : '';
}
function navMarkHtml(rk) {
    if (!rk) return '';
    const mc = (MARK_REASONS[rk] && MARK_REASONS[rk].color) || '#eab308';
    return `<span class="quiz-nav-flag" style="background:${mc}"></span>`;
}
// Bản đồ ghi chú đọc MỘT lần mỗi lần vẽ/đồng bộ bảng (không đọc lại cho từng ô)
let _noteMap = {};
function navHasNote(i) {
    const q = state.questions[i];
    return !!(q && String(_noteMap[q.question] || '').trim());
}
function navHasStar(i) {
    const q = state.questions[i];
    return !!(q && String(_noteMap[q.question] || '').includes('⭐'));   // ghi chú gắn nhãn Quan trọng → chấm vàng thay vì oải hương
}
// Lớp đầy đủ của một ô: trạng thái + nối nhóm ca lâm sàng (in-case/case-first/case-last) + có ghi chú
function navCellClass(i) {
    return ['quiz-nav-btn', navStateClass(i), caseCellClass(state.questions[i]), navHasNote(i) ? 'has-note' : '', navHasStar(i) ? 'has-star' : ''].filter(Boolean).join(' ');
}
function navCellHtml(i, rk) {
    return `<span class="quiz-nav-num">${i + 1}</span>${navMarkHtml(rk)}`;
}

// Dựng lại toàn bộ bảng — chỉ gọi khi SỐ câu thay đổi (vào phiên mới).
export function renderQuizProgressBar() {
    const total = state.questions.length;
    _noteMap = readNotes();
    let navHtml = '';
    for (let i = 0; i < total; i++) {
        const rk = navMarkKey(i);
        navHtml += `<button type="button" class="${navCellClass(i)}" data-qidx="${i}" data-mark="${rk}" title="Câu ${i + 1}${rk ? ' (Đánh dấu)' : ''}">${navCellHtml(i, rk)}</button>`;
    }
    return `
        <div class="quiz-panel-drag focus-hide" data-panel="nav" role="separator" aria-label="Kéo để xích bảng số câu lên/xuống" title="Kéo để xích bảng lên/xuống • bấm đúp để trả về"><i class="fas fa-grip-lines"></i></div>
        <a class="qnp-brand focus-hide" href="../../index.html" title="Zitthenkne — Trang chủ"><img src="../../assets/opt/logo-96.webp" width="20" height="20" alt=""><span>Zitthenkne</span></a>
        <div class="mb-4">
            <!-- Thước kẻ tiến độ: vạch bút dạ = phần đã làm, bút chì = câu đang xem -->
            <div class="qnp-head focus-hide">
                <div class="qnp-count"><b id="quiz-nav-answered"></b><span id="quiz-nav-left"></span></div>
                <div class="qnp-ruler" aria-hidden="true"><span id="quiz-nav-fill" class="qnp-fill"></span><i id="quiz-nav-pin" class="fas fa-pencil qnp-pin"></i></div>
            </div>
            <div id="question-nav-wrapper" class="quiz-nav-grid mt-3 bg-gray-50/50 rounded-xl border border-gray-100 focus-hide">${navHtml}</div>
            <button type="button" id="nav-next-unanswered" class="qnp-jump focus-hide" title="Nhảy tới câu chưa trả lời kế tiếp"><i class="fas fa-forward-step"></i> Câu chưa làm</button>
            <button type="button" id="nav-submit-btn" class="qnp-jump qnp-submit focus-hide" title="Nộp bài"><i class="fas fa-flag-checkered"></i> Nộp bài</button>
            <div id="quiz-nav-legend" class="qnp-legend focus-hide" aria-hidden="true">
                <span><i class="lg-cur"></i>Đang xem</span>
                <span class="lg-when-later"><i class="lg-done"></i>Đã làm</span>
                <span class="lg-when-now"><i class="lg-ok"></i>Đúng</span>
                <span class="lg-when-now"><i class="lg-bad"></i>Sai</span>
                <span><i class="lg-flag"></i>Đánh dấu</span>
                <span><i class="lg-note"></i>Ghi chú</span>
            </div>
        </div>
    `;
}

// Cập nhật TẠI CHỖ: giữ nguyên DOM nên transition CSS mới chạy được (ô cũ mờ đi, ô mới
// phồng lên) và không phải dựng lại hàng trăm nút mỗi lần chuyển câu.
export function syncQuizNavPanel() {
    const wrap = document.getElementById('question-nav-wrapper');
    if (!wrap) return;
    _noteMap = readNotes();
    const total = state.questions.length;
    const answered = state.userAnswers.filter(a => a !== null && a !== undefined).length;
    const percent = total > 0 ? Math.round((answered / total) * 100) : 0;
    const answeredEl = document.getElementById('quiz-nav-answered');
    const leftEl = document.getElementById('quiz-nav-left');
    if (answeredEl) answeredEl.textContent = `Đã làm ${answered}/${total}`;
    if (leftEl) leftEl.textContent = `${percent}%`;
    const fillEl = document.getElementById('quiz-nav-fill');
    if (fillEl) fillEl.style.width = `${percent}%`;
    const pinEl = document.getElementById('quiz-nav-pin');
    if (pinEl && total > 0) pinEl.style.left = `${((state.currentIndex + 0.5) / total) * 100}%`;
    const jumpEl = document.getElementById('nav-next-unanswered');
    if (jumpEl) jumpEl.disabled = answered >= total;
    const legendEl = document.getElementById('quiz-nav-legend');
    if (legendEl) legendEl.dataset.imm = state.quizOptions.showAnswerImmediately ? '1' : '0';
    wrap.querySelectorAll('.quiz-nav-btn').forEach(btn => {
        const i = parseInt(btn.dataset.qidx, 10);
        if (isNaN(i)) return;
        const cls = navCellClass(i);
        if (btn.className !== cls) btn.className = cls;
        // Chỉ vẽ lại phần trong khi ĐÁNH DẤU đổi -> chấm nhấp nháy không bị khởi động lại
        const rk = navMarkKey(i);
        if (btn.dataset.mark !== rk) {
            btn.dataset.mark = rk;
            btn.innerHTML = navCellHtml(i, rk);
            btn.title = `Câu ${i + 1}${rk ? ' (Đánh dấu)' : ''}`;
        }
    });
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
        const answerOptions = stripOptionLabels(q.answers || q.options);
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
        quizInfo.textContent = "Chọn chế độ, chỉnh chi tiết nếu cần rồi bấm Bắt đầu.";
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

        // Dữ liệu đã sẵn sàng -> gỡ hiệu ứng skeleton trên các thẻ stats
        // (riêng thẻ "Lần làm gần nhất" còn được quiz-page.js điền theo tài khoản)
        document.querySelectorAll('#quiz-landing .skeleton-line')
            .forEach(el => el.classList.remove('skeleton-line'));

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

        renderSrsLandingCard();

        renderPreviewQuestions();
    }
}

// Điền số liệu cho card "Ôn ngắt quãng" trên landing: X câu đến hạn · Y câu mới
// hôm nay (previewSrsCounts KHÔNG trừ quota — quota chỉ trừ khi thật sự bắt đầu).
function renderSrsLandingCard() {
    const countEl = document.getElementById('srs-due-count');
    const startBtn = document.getElementById('start-srs-btn');
    const newPerDayInput = document.getElementById('srs-new-per-day');
    if (!countEl || !startBtn) return;

    const quizId = state.quizData && state.quizData.id;

    const refresh = () => {
        const { due, newToday } = previewSrsCounts(quizId, state.originalQuestions);
        countEl.classList.remove('skeleton-line');
        countEl.innerHTML = due + newToday > 0
            ? `<b class="text-indigo-700">${due} câu đến hạn</b> · ${newToday} câu mới hôm nay`
            : 'Hôm nay không còn câu đến hạn';
        startBtn.disabled = due + newToday === 0;
        // Không có gì để ôn: nút nói rõ lý do thay vì chỉ mờ đi
        startBtn.innerHTML = startBtn.disabled
            ? '<i class="fas fa-circle-check"></i> Chưa đến hạn'
            : '<i class="fas fa-calendar-check"></i> Ôn ngay';
    };

    if (newPerDayInput) {
        // null = không giới hạn (mặc định) → input để trống, placeholder "Tất cả"
        const cur = getNewPerDay(quizId);
        newPerDayInput.value = cur == null ? '' : cur;
        newPerDayInput.addEventListener('change', () => {
            const v = setNewPerDay(quizId, newPerDayInput.value);
            newPerDayInput.value = v == null ? '' : v;
            refresh();
        });
    }
    refresh();
    // Cloud có thể kéo lịch về SAU khi card đã vẽ (pullStudyFromCloud chạy nền)
    document.addEventListener('quiz-study-pulled', refresh);

    // Gợi ý đăng nhập để lịch ôn được sao lưu/đồng bộ qua quiz_study
    const loginHint = document.getElementById('srs-login-hint');
    if (loginHint) {
        onSessionUser((u) => loginHint.classList.toggle('hidden', !!u));
    }
}

// opts.instant: vẽ lại sau khi tự chấm tự luận — không chạy lại hiệu ứng vòng tròn / pháo giấy
export function showResults(totalTime, opts = {}) {
    const resultsSection = document.getElementById('resultsSection');
    if (!resultsSection) return;

    resultsSection.classList.remove('hidden');

    // --- Tính toán thống kê ---
    // Điểm = tổng điểm từng câu (tự luận tính theo tỉ lệ ý đã tick); "Đúng" = đạt (tự luận ≥ 50%)
    const total = state.questions.length;
    // Điểm theo trọng số câu (maxScore) — xem sessionScore; "Cần xem lại" = tự luận chưa chấm + máy chấm sơ bộ
    let correctCount = 0, pendingCount = 0, autoCount = 0, hasEssay = false, weighted = false;
    state.questions.forEach((q, i) => {
        const a = state.userAnswers[i];
        if (isAnswerCorrect(q, a)) correctCount++;
        if (isPendingEssay(q, a)) pendingCount++;
        else if (needsReview(q, a)) autoCount++;
        if (isEssay(q)) hasEssay = true;
        if (Number(q.maxScore) > 0) weighted = true;
    });
    const { score: scoreSum, max: scoreMax } = sessionScore(state.questions, state.userAnswers);
    const reviewCount = pendingCount + autoCount;
    const fmtNum = (n) => String(n).replace('.', ',');
    const answeredCount = state.userAnswers.filter(a => a !== null && a !== undefined).length;
    const unansweredCount = total - answeredCount;
    const wrongCount = answeredCount - correctCount - pendingCount;

    const percentage = scoreMax > 0 ? (scoreSum / scoreMax) * 100 : 0;
    const gpaResult = convertScoreToGPA(scoreSum, scoreMax);
    const { score4: gpa4, letterGrade, motivation, score10 } = gpaResult;
    const incorrectCount = total - correctCount - pendingCount;
    const scoreLabel = (hasEssay || weighted) ? `${fmtNum(scoreSum)}/${fmtNum(scoreMax)} điểm` : `${correctCount}/${total} câu`;
    const showPracticeButton = incorrectCount > 0;
    const isSrs = state.quizMode === 'srs';

    // --- Tóm tắt lịch hẹn cho phiên ôn ngắt quãng ---
    let srsSummaryHtml = '';
    if (isSrs) {
        const info = state._srsSessionInfo || {};
        const newPart = info.newCount ? ` (trong đó ${info.newCount} câu mới bắt đầu học)` : '';
        srsSummaryHtml = `
            <div class="res-banner is-srs">
                <span class="res-banner-ic" aria-hidden="true"><i class="fas fa-calendar-check"></i></span>
                <div class="res-banner-txt">
                    <h4>Đã hẹn lịch ôn ngắt quãng</h4>
                    <p><b class="is-ok">${correctCount} câu đúng</b> được giãn ra xa hơn, <b class="is-bad">${wrongCount} câu sai</b> sẽ quay lại trong hôm nay${newPart}. Chuông thông báo sẽ báo khi có câu đến hạn.</p>
                </div>
            </div>`;
    }

    // Tông theo ĐIỂM HỆ 4: ≥ 3,0 (B trở lên) xanh lá · ≥ 2,0 (C, C+) vàng · thấp hơn đỏ. Màu lấy từ biến CSS (.tone-ok/mid/low) nên đúng cả chế độ tối.
    const tone = gpa4 >= 3 ? 'ok' : gpa4 >= 2 ? 'mid' : 'low';
    const fmt1 = (n) => Number(n).toFixed(1).replace('.', ',');                       // 3,5 · 4,0
    const fmt2 = (n) => String(Number(Number(n).toFixed(2))).replace('.', ',');       // 8,13 · 8,5 · 10
    // Thang điểm hệ 4 của UMP (đúng ngưỡng trong convertScoreToGPA): [chữ, điểm hệ 4, từ bao nhiêu điểm hệ 10]. A+ cùng 4,0 với A (từ 9,5).
    const LADDER = [['F', 0, 0], ['D', 1, 4], ['D+', 1.5, 5], ['C', 2, 5.5], ['C+', 2.5, 6.5], ['B', 3, 7], ['B+', 3.5, 8], ['A', 4, 8.5]];
    const nowIdx = letterGrade === 'A+' ? LADDER.length - 1 : Math.max(0, LADDER.findIndex(l => l[0] === letterGrade));
    const ladderHtml = LADDER.map((l, i) => {
        const cls = i < nowIdx ? 'is-passed' : i === nowIdx ? 'is-now' : i === nowIdx + 1 ? 'is-next' : '';
        const lab = i === nowIdx && letterGrade === 'A+' ? 'A+' : l[0];
        return `<li class="rs-scale-step ${cls}" title="${l[0]} = ${fmt1(l[1])} điểm hệ 4 · từ ${fmt1(l[2])} điểm hệ 10"${i === nowIdx ? ' aria-current="true"' : ''}><span>${lab}</span></li>`;
    }).join('');
    // Bước kế tiếp: còn thiếu bao nhiêu câu đúng để lên nấc trên (chỉ tính được khi mọi câu cùng trọng số; có tự luận/điểm riêng thì nêu ngưỡng hệ 10)
    const nextStep = letterGrade === 'A' ? ['A+', 4, 9.5] : (letterGrade !== 'A+' && nowIdx < LADDER.length - 1 ? LADDER[nowIdx + 1] : null);
    let nextHint = '';
    if (nextStep) {
        let need = 0;
        if (!hasEssay && !weighted) {
            for (let e = 1; e <= total - correctCount; e++) { if (convertScoreToGPA(correctCount + e, total).score10 >= nextStep[2]) { need = e; break; } }
        }
        nextHint = need
            ? `Đúng thêm <b>${need} câu</b> nữa là lên <b>${nextStep[0]}</b> <span>(từ ${fmt1(nextStep[2])} điểm hệ 10)</span>`
            : `Cần từ <b>${fmt1(nextStep[2])}</b> điểm hệ 10 để lên <b>${nextStep[0]}</b>`;
    }
    const tileMain = (hasEssay || weighted) ? `${fmtNum(scoreSum)}/${fmtNum(scoreMax)}` : `${correctCount}/${total}`;
    const tileKey = (hasEssay || weighted) ? 'Điểm' : 'Câu đúng';
    // Sao/tim dán quanh dấu điểm (chỉ là hình trang trí, không chữ): giỏi nhiều hơn, vừa một ngôi sao, thấp không có
    const sparkHtml = tone === 'ok'
        ? `<i class="nb-doodle nb-doodle-star rs2-spark sp1" aria-hidden="true"></i><i class="nb-doodle nb-doodle-star rs2-spark sp2" aria-hidden="true"></i><i class="nb-doodle nb-doodle-heart rs2-spark sp3" aria-hidden="true"></i>${letterGrade === 'A+' ? '<i class="nb-doodle nb-doodle-star rs2-spark sp4" aria-hidden="true"></i>' : ''}`
        : tone === 'mid' ? '<i class="nb-doodle nb-doodle-star rs2-spark sp1" aria-hidden="true"></i>' : '';
    // Dòng ngữ cảnh như nhãn phiếu: tên bộ đề · ngày · loại phiên
    const escMeta = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const modeName = state.quizMode === 'srs' ? 'Ôn ngắt quãng' : state.quizMode === 'practice' ? 'Ôn câu sai' : '';
    const metaTitle = (state.quizData && state.quizData.title) || '';
    const metaHtml = metaTitle
        ? `<p class="rs2-meta" title="${escMeta(metaTitle)}"><i class="fas fa-book-open" aria-hidden="true"></i><span>${escMeta(metaTitle)}</span><em>${new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}${modeName ? ' · ' + modeName : ''}</em></p>`
        : '';

    // --- So sánh với lần làm trước (đọc cache đã đồng bộ từ thư viện — cache chỉ được
    // cập nhật ở lần đồng bộ SAU nên lúc này vẫn còn giữ kết quả của lần trước) ---
    let deltaHtml = '';
    if (state.quizMode === 'normal') {
        try {
            const user = sessionUser();
            const qid = state.quizData && state.quizData.id;
            const cache = (user && qid) ? JSON.parse(localStorage.getItem(`quizAttemptCache_${user.uid}`) || 'null') : null;
            const prev = cache && cache.map && cache.map[qid];
            if (prev && prev.t > 0) {
                const prevPct = (prev.s / prev.t) * 100;
                const diff = percentage - prevPct;
                const diffStr = Math.abs(diff).toFixed(1).replace(/\.0$/, '');
                if (diff > 0.05) {
                    deltaHtml = `<span class="inline-flex items-center gap-1.5 bg-green-50 text-green-700 border border-green-200 px-3 py-1 rounded-full text-xs font-bold" title="Lần trước: ${prev.s}/${prev.t} câu (${prevPct.toFixed(1)}%)"><i class="fas fa-arrow-trend-up"></i> Tiến bộ +${diffStr}% so với lần trước</span>`;
                } else if (diff < -0.05) {
                    deltaHtml = `<span class="inline-flex items-center gap-1.5 bg-red-50 text-red-600 border border-red-200 px-3 py-1 rounded-full text-xs font-bold" title="Lần trước: ${prev.s}/${prev.t} câu (${prevPct.toFixed(1)}%)"><i class="fas fa-arrow-trend-down"></i> Thấp hơn lần trước ${diffStr}%</span>`;
                } else {
                    deltaHtml = `<span class="inline-flex items-center gap-1.5 bg-gray-50 text-gray-500 border border-gray-200 px-3 py-1 rounded-full text-xs font-bold"><i class="fas fa-equals"></i> Bằng lần trước (${prevPct.toFixed(1)}%)</span>`;
                }
            }
        } catch (e) { }
    }

    // --- Độ chính xác khi "đoán": tự nhận đoán mà vẫn trúng thì nên ôn lại cho chắc ---
    let guessRight = 0, guessTotal = 0;
    Object.entries(state.confidence || {}).forEach(([i, v]) => {
        if (v !== 'guess') return;
        guessTotal++;
        if (isAnswerCorrect(state.questions[i], state.userAnswers[i])) guessRight++;
    });

    const radius = 52;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference * (1 - Math.max(0.012, gpa4 / 4));   // vòng = điểm hệ 4 trên thang 4 (không còn là % đúng)

    // --- Thống kê theo chủ đề (chỉ hiện khi có từ 2 chủ đề trở lên) ---
    const topicStats = {};
    state.questions.forEach((q, i) => {
        const t = (q.topic && String(q.topic).trim()) ? String(q.topic).trim() : '';
        if (!t || t.toLowerCase() === 'chung') return;
        if (!topicStats[t]) topicStats[t] = { correct: 0, total: 0 };
        topicStats[t].total++;
        if (isAnswerCorrect(q, state.userAnswers[i])) topicStats[t].correct++;
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
        unanswered: { wrap: 'bg-gray-50 border-gray-200', icon: 'fa-minus-circle text-gray-400', pill: 'bg-gray-200 text-gray-600', label: 'Bỏ trống' },
        pending: { wrap: 'bg-blue-50 border-blue-200', icon: 'fa-list-check text-blue-500', pill: 'bg-blue-100 text-blue-700', label: 'Chưa chấm' }
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
    // Ghi chú của chính người làm (quiz_notes_<id>) hiện ngay trong chi tiết từng câu + bộ lọc "Có ghi chú" / "Hỏi lại"
    const myNotes = readNotes();
    let noteItemCount = 0, askItemCount = 0;

    // Trạng thái hiển thị của một câu ở màn kết quả (dùng chung cho danh sách chi tiết + bản đồ kết quả)
    const resultStatus = (q, ua) => {
        const un = ua === null || ua === undefined;
        return isPendingEssay(q, ua) ? 'pending' : (!un && isAnswerCorrect(q, ua)) ? 'correct' : (un ? 'unanswered' : 'wrong');
    };

    const detailedResultsHtml = state.questions.map((q, index) => {
        const userAnswerIndex = state.userAnswers[index];
        const essay = isEssay(q);
        const answerOptions = essay ? [] : stripOptionLabels(q.answers || q.options);
        const isUnanswered = userAnswerIndex === null || userAnswerIndex === undefined;
        const isCorrect = !isUnanswered && isAnswerCorrect(q, userAnswerIndex);
        const status = resultStatus(q, userAnswerIndex);
        // Câu nhiều đáp án đúng: gộp các lựa chọn của người dùng / các đáp án đúng thành chuỗi "A, C".
        const correctIdxList = getCorrectIndexes(q);

        if (!answerOptions || !Array.isArray(answerOptions)) {
            return `<div class="result-item rounded-xl bg-red-50 border border-red-200 p-3" data-status="wrong" data-ridx="${index}">
                        <div class="text-sm font-semibold text-gray-800">Câu ${index + 1}: dữ liệu đáp án bị hỏng.</div>
                    </div>`;
        }

        const userIdxList = essay ? [] : Array.isArray(userAnswerIndex) ? userAnswerIndex.slice().sort((a, b) => a - b) : (isUnanswered ? [] : [userAnswerIndex]);
        const userAnswerText = userIdxList.map(i => `${letter(i)}. ${parseMarkdown(answerOptions[i])}`).join('<br>');
        const correctAnswerText = correctIdxList.map(i => `${letter(i)}. ${parseMarkdown(answerOptions[i])}`).join('<br>');
        const cfg = statusConfig[status];
        const firstCorrectIdx = correctIdxList.length ? correctIdxList[0] : q.correctAnswerIndex;
        const correctOptionExp = q.optionExplanations && q.optionExplanations[firstCorrectIdx] && String(q.optionExplanations[firstCorrectIdx]).trim();
        const explanationText = correctOptionExp || (q.explanation && String(q.explanation).trim());
        const hasExplanation = !!explanationText;

        const markReasonKey = markedSet.has(index) ? (markedReasons[index] || 'review') : '';
        const mr = markReasonKey ? MARK_REASONS[markReasonKey] : null;
        const myNote = String(myNotes[q.question] || '').trim();
        const askNote = !!myNote && noteTagsOf(myNote).has('Hỏi lại');
        if (myNote) noteItemCount++;
        if (askNote) askItemCount++;
        const noteBadge = myNote ? `<span class="q-note-badge" title="Bạn có ghi chú cho câu này"><i class="fas fa-sticky-note"></i> Ghi chú${askNote ? ' · hỏi lại' : ''}</span>` : '';
        const markBadge = mr ? `<span class="q-mark-badge" style="background:${mr.bg};color:${mr.text}" title="Đã đánh dấu: ${mr.label}"><i class="fas ${mr.icon}"></i> ${mr.short}</span>` : '';

        // Ca lâm sàng: chip nhận diện ở tiêu đề + tình huống (thu gọn) trong phần chi tiết.
        const caseText = q.caseText ? String(q.caseText).trim() : '';
        const caseSeqLabel = (q.__caseTotal && q.__caseTotal > 1) ? ` ${q.__caseSeq}/${q.__caseTotal}` : '';
        const caseTitleSafe = ((q.caseTitle && String(q.caseTitle).trim()) || 'Ca lâm sàng')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const caseBadge = caseText ? `<span class="q-case-badge inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-cyan-100 text-cyan-700 border border-cyan-200" title="Câu thuộc ca lâm sàng"><i class="fas fa-notes-medical"></i> Ca${caseSeqLabel}</span>` : '';
        const caseBlock = caseText ? `
                <details class="result-case rounded-lg border border-cyan-200 bg-cyan-50/60 px-2.5 py-2">
                    <summary class="cursor-pointer text-xs font-semibold text-cyan-700 select-none"><i class="fas fa-notes-medical mr-1"></i>${caseTitleSafe} — xem tình huống</summary>
                    <div class="mt-2 leading-relaxed text-gray-700">${parseMarkdown(caseText)}</div>
                </details>` : '';

        return `
        <div class="result-item rounded-xl border ${cfg.wrap} overflow-hidden transition-all" data-status="${status}" data-ridx="${index}" data-marked="${markReasonKey}"${essay && needsReview(q, userAnswerIndex) ? ' data-review="1"' : ''}${myNote ? ' data-note="1"' : ''}${askNote ? ' data-ask="1"' : ''}>
            <div class="result-header flex items-start gap-2.5 p-3 cursor-pointer select-none" role="button" tabindex="0" aria-expanded="false">
                <i class="fas ${cfg.icon} text-lg flex-shrink-0 mt-0.5"></i>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center flex-wrap gap-2 mb-0.5">
                        <span class="text-xs font-bold text-gray-500">Câu ${index + 1}</span>
                        <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cfg.pill}">${cfg.label}</span>
                        ${essay ? `<span class="q-essay-chip is-sm"><i class="fas fa-pen"></i> Tự luận${isEssayGraded(q, userAnswerIndex) ? ` · ${String(Math.round(answerCredit(q, userAnswerIndex) * 100))}%` : ''}</span>` : ''}
                        ${essay && userAnswerIndex && userAnswerIndex.auto ? '<span class="q-auto-chip"><i class="fas fa-wand-magic-sparkles"></i> Máy chấm sơ bộ</span>' : ''}
                        ${Number(q.maxScore) > 0 ? `<span class="q-essay-chip is-sm is-pts">${fmtNum(Math.round(answerCredit(q, userAnswerIndex) * questionWeight(q) * 100) / 100)}/${fmtNum(questionWeight(q))}đ</span>` : ''}
                        ${(times[index] > 0) ? `<span class="q-time ${index === slowestIdx && slowestVal >= 5 ? 'q-slow' : ''}" title="Thời gian làm câu này"><i class="fas fa-clock"></i> ${formatTime(times[index])}${index === slowestIdx && slowestVal >= 5 ? ' · lâu nhất' : ''}</span>` : ''}
                        ${state.confidence && state.confidence[index] === 'guess' ? `<span class="q-guess-badge" title="Bạn đã đánh dấu là đoán"><i class="fas fa-dice"></i> Đoán</span>` : ''}
                        ${caseBadge}
                        ${markBadge}
                        ${noteBadge}
                    </div>
                    <div class="result-question text-sm text-gray-700 line-clamp-2">${parseMarkdown(q.question)}</div>
                </div>
                <i class="fas fa-chevron-down text-gray-300 text-xs flex-shrink-0 mt-1.5 result-chevron transition-transform duration-300"></i>
            </div>
            <div class="result-body hidden border-t border-gray-200/50 px-3 py-3 space-y-2 text-sm bg-white/50">
                ${caseBlock}
                ${essay ? essayReviewHtml(q, index, userAnswerIndex) : `
                ${!isCorrect ? `
                <div>
                    <span class="font-medium text-gray-500">Bạn chọn: </span>
                    <span class="${isUnanswered ? 'text-gray-400 italic' : 'text-red-600 font-medium'}">${isUnanswered ? 'Chưa trả lời' : userAnswerText}</span>
                </div>` : ''}
                <div>
                    <span class="font-medium text-gray-500">Đáp án đúng${correctIdxList.length > 1 ? ' (chọn tất cả)' : ''}: </span>
                    <span class="text-green-600 font-medium">${correctAnswerText}</span>
                </div>`}
                ${hasExplanation ? `
                <div class="mt-1 p-2.5 bg-amber-50/60 border border-amber-100 rounded-lg text-gray-600">
                    <span class="font-semibold text-gray-700"><i class="fas fa-lightbulb text-amber-400 mr-1"></i>Giải thích:</span> ${parseMarkdown(explanationText)}
                </div>` : ''}
                ${essay ? '' : studyExtrasHtml(q)}
                ${myNote ? `<div class="result-note"><div class="result-note-head"><i class="fas fa-sticky-note"></i> Ghi chú của bạn</div><div class="result-note-body">${noteTextHtml(myNote)}</div></div>` : ''}
            </div>
        </div>`;
    }).join('');

    // Bản đồ kết quả (D2): mỗi câu một ô, cùng ngôn ngữ màu với bảng nhảy câu (.qjs-cell); bấm để nhảy tới câu trong danh sách chi tiết
    const mapCount = { correct: 0, wrong: 0, pending: 0, unanswered: 0 };
    const resultMapCells = state.questions.map((q, i) => {
        const st = resultStatus(q, state.userAnswers[i]);
        mapCount[st]++;
        let cls = 'qjs-cell' + (st === 'correct' ? ' is-correct' : st === 'wrong' ? ' is-wrong' : st === 'pending' ? ' is-answered' : '');
        const cc = caseCellClass(q);
        if (cc) cls += ' ' + cc;
        let flag = '';
        if (markedSet.has(i)) {
            const rk = markedReasons[i] || 'review';
            flag = `<span class="qjs-flag" style="background:${(MARK_REASONS[rk] && MARK_REASONS[rk].color) || '#eab308'}"></span>`;
        }
        return `<button type="button" class="${cls}" data-qidx="${i}" aria-label="Câu ${i + 1}: ${statusConfig[st].label}">${i + 1}${flag}</button>`;
    }).join('');
    const mapKey = (st, label) => mapCount[st] > 0 ? `<span class="res-map-key is-${st}">${label} ${mapCount[st]}</span>` : '';
    const resultMapHtml = state.questions.length > 1 ? `
            <div class="res-map-wrap">
                <div id="result-map" class="qjs-grid res-map" role="group" aria-label="Bản đồ kết quả: bấm một ô để tới câu đó">${resultMapCells}</div>
                <div class="res-map-legend" aria-hidden="true">${mapKey('correct', 'Đúng')}${mapKey('wrong', 'Sai')}${mapKey('pending', 'Chưa chấm')}${mapKey('unanswered', 'Bỏ trống')}</div>
            </div>` : '';

    resultsSection.innerHTML = `
        <!-- Phiếu điểm: ĐIỂM HỆ 4 là số to nhất; dưới là thang điểm cho biết mình đứng ở đâu + còn thiếu bao nhiêu để lên nấc -->
        <div class="bg-white rounded-3xl shadow-xl p-6 sm:p-8 fade-in border border-pink-100/60${gpa4 >= 3.5 ? ' is-great' : ''}">
            <div class="rs2 tone-${tone}">
                <div class="rs2-stamp" role="img" aria-label="Điểm hệ 4: ${fmt1(gpa4)} trên 4, xếp loại ${letterGrade}">
                    <svg class="rs2-ring" viewBox="0 0 120 120" aria-hidden="true">
                        <circle class="rs2-ring-track" cx="60" cy="60" r="${radius}" fill="none" stroke-width="11" />
                        <circle class="rs2-stitch" cx="60" cy="60" r="${radius - 9}" fill="none" stroke-width="1.6" stroke-dasharray="2 5" />
                        <circle id="result-ring" class="rs2-ring-bar" cx="60" cy="60" r="${radius}" fill="none" stroke-width="11" stroke-linecap="round"
                            stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${circumference.toFixed(2)}"
                            style="transition: stroke-dashoffset 1.2s ease-out;" />
                        <g id="result-head" class="rs2-head" style="transform: rotate(0deg); transform-origin: 60px 60px; transition: transform 1.2s ease-out;"><circle class="rs2-bead" cx="${60 + radius}" cy="60" r="6.4" stroke-width="3" /></g>
                    </svg>
                    ${sparkHtml}
                    <div class="rs2-core">
                        <span class="rs2-eyebrow">Điểm hệ 4</span>
                        <span class="rs2-gpa"><b id="result-gpa4">${fmt1(gpa4)}</b><i>/4</i></span>
                    </div>
                    <span id="result-letter" class="rs2-letter">${letterGrade}</span>
                </div>
                <div class="rs2-info">
                    <h2 class="rs2-title">Kết quả bài làm</h2>
                    ${metaHtml}
                    <p class="rs2-sub">${motivation}</p>
                    <ol class="rs2-scale" aria-label="Thang điểm hệ 4">${ladderHtml}</ol>
                    ${nextHint ? `<p class="rs2-next"><i class="fas fa-arrow-up" aria-hidden="true"></i> ${nextHint}</p>` : ''}
                    <div class="rs2-tiles">
                        <div class="rs2-tile is-sky"><span class="rs2-k">Điểm hệ 10</span><b>${fmt2(score10)}</b></div>
                        <div class="rs2-tile is-mint"><span class="rs2-k">${tileKey}</span><b>${tileMain}</b><small>${fmtNum(Math.round(percentage * 10) / 10)}% · ${wrongCount} sai${unansweredCount ? ` · ${unansweredCount} bỏ trống` : ''}</small></div>
                        <div class="rs2-tile is-butter"><span class="rs2-k">Thời gian</span><b>${formatTime(totalTime)}</b>${total > 0 && totalTime > 0 ? `<small>TB ${formatTime(Math.round(totalTime / total))}/câu</small>` : ''}</div>
                    </div>
                    ${(deltaHtml || guessTotal > 0) ? `<div class="rs2-chips">${deltaHtml}${guessTotal > 0 ? `<span class="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-1 rounded-full text-xs font-bold border border-amber-100" title="Câu bạn tự nhận là đoán — trúng nhờ may mắn thì vẫn nên ôn lại"><i class="fas fa-dice"></i> Đoán trúng <b>${guessRight}/${guessTotal}</b></span>` : ''}</div>` : ''}
                </div>
            </div>

            ${srsSummaryHtml}

            ${reviewCount > 0 ? `
            <div class="essay-pending-card">
                <i class="fas fa-list-check" aria-hidden="true"></i>
                <div class="essay-pending-txt">
                    <b>Còn ${reviewCount} câu tự luận cần xem lại</b>
                    <span>${[autoCount ? `${autoCount} câu máy đã chấm sơ bộ theo từ khóa — điểm tạm tính, hãy kiểm tra và tick thêm ý bạn nêu bằng cách diễn đạt khác` : '',
            pendingCount ? `${pendingCount} câu chưa chấm (đang tính 0 điểm)` : ''].filter(Boolean).join('. ')}.</span>
                </div>
                <button type="button" id="essay-grade-now">Xem lại ngay</button>
            </div>` : ''}

            <!-- Việc tiếp theo -->
            ${showPracticeButton ? `
            <div class="res-banner is-practice">
                <span class="res-banner-ic" aria-hidden="true"><i class="fas fa-rotate-right"></i></span>
                <div class="res-banner-txt">
                    <h4>Ôn lại câu sai</h4>
                    <p>${incorrectCount} câu sai hoặc bỏ trống. ${isSrs ? 'Học lại ngay không tính vào lịch ôn — lịch vẫn giữ nguyên hẹn của phiên vừa rồi.' : 'Làm lại riêng các câu này khi lời giải còn mới.'}</p>
                </div>
                <button id="practiceIncorrectBtn" type="button" class="res-banner-go"><i class="fas fa-redo-alt"></i> Làm lại ${incorrectCount} câu sai</button>
            </div>` : reviewCount ? '' : `
            <div class="res-banner is-perfect">
                <span class="res-banner-ic" aria-hidden="true"><i class="fas fa-trophy"></i></span>
                <div class="res-banner-txt">
                    <h4>Đúng toàn bộ ${total} câu</h4>
                    <p>Không có câu sai hay bỏ trống trong phiên này.</p>
                </div>
            </div>`}

            <div class="res-groups">
                <div class="res-group">
                    <span class="res-group-label">Làm tiếp</span>
                    <div class="res-group-btns">
                        ${isSrs ? '' : `<button id="restartQuizBtn" type="button" class="res-btn is-primary"><i class="fas fa-redo"></i> Làm lại toàn bộ</button>`}
                        ${state.quizData && state.quizData.id ? `
                        <a href="../flashcard/flashcard.html?id=${encodeURIComponent(state.quizData.id)}" class="res-btn"><i class="fas fa-clone"></i> Flashcard</a>
                        <a href="quiz-history.html?id=${encodeURIComponent(state.quizData.id)}" class="res-btn"><i class="fas fa-clock-rotate-left"></i> Lịch sử</a>` : ''}
                    </div>
                </div>
                <div class="res-group">
                    <span class="res-group-label">Lưu &amp; chia sẻ</span>
                    <div class="res-group-btns">
                        <button id="result-card-btn" type="button" class="res-btn" title="Lưu thẻ điểm thành ảnh để gửi bạn bè"><i class="fas fa-image"></i> Lưu ảnh kết quả</button>
                        <button id="result-share-btn" type="button" class="res-btn"><i class="fas fa-share-alt"></i> Chia sẻ</button>
                        ${incorrectCount > 0 ? `
                        <button id="result-copy-wrong-btn" type="button" class="res-btn" title="Sao chép các câu sai / bỏ trống (Markdown) để dán vào ghi chú"><i class="fas fa-copy"></i> Sao chép câu sai</button>
                        <button id="result-anki-btn" type="button" class="res-btn" title="Tải CSV (dấu ;) để nhập vào Anki"><i class="fas fa-download"></i> CSV Anki</button>` : ''}
                        ${noteItemCount > 0 ? `<button id="result-notes-btn" type="button" class="res-btn" title="Mở sổ ghi chú của bộ đề này"><i class="fas fa-sticky-note"></i> Sổ ghi chú (${noteItemCount})</button>` : ''}
                    </div>
                </div>
                <div class="res-group">
                    <span class="res-group-label">Đi tới</span>
                    <div class="res-group-btns">
                        <a href="../../index.html#libraryContent" class="res-btn"><i class="fas fa-book"></i> Thư viện</a>
                        <a href="../../index.html" class="res-btn"><i class="fas fa-home"></i> Trang chủ</a>
                    </div>
                </div>
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
                <div class="flex flex-wrap items-center gap-1.5" id="result-filter-tabs">
                    <button data-filter="all" class="result-filter-btn px-3 py-1.5 rounded-full text-xs font-semibold bg-pink-500 text-white transition">Tất cả (${total})</button>
                    <button data-filter="wrong" class="result-filter-btn px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition">Câu sai (${wrongCount})</button>
                    <button data-filter="unanswered" class="result-filter-btn px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition">Bỏ trống (${unansweredCount})</button>
                    <button data-filter="correct" class="result-filter-btn px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition">Đúng (${correctCount})</button>
                    ${reviewCount > 0 ? `<button data-filter="review" class="result-filter-btn px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition">Cần xem lại (${reviewCount})</button>` : ''}
                    ${noteItemCount > 0 ? `<button data-filter="note" class="result-filter-btn px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition"><i class="fas fa-sticky-note mr-1 text-purple-400"></i>Có ghi chú (${noteItemCount})</button>` : ''}
                    ${askItemCount > 0 ? `<button data-filter="ask" class="result-filter-btn px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition"><i class="fas fa-circle-question mr-1 text-purple-400"></i>Hỏi lại (${askItemCount})</button>` : ''}
                    ${markedCount > 0 ? `<button data-filter="marked" class="result-filter-btn px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition"><i class="fas fa-flag mr-1 text-amber-500"></i>Đã đánh dấu (${markedCount})</button>` : ''}
                    <button id="toggle-all-results" class="px-3 py-1.5 rounded-full text-xs font-semibold bg-white text-pink-600 border border-pink-200 hover:bg-pink-50 transition flex items-center gap-1" title="Mở/thu gọn toàn bộ câu đang hiện">
                        <i class="fas fa-angles-down"></i> <span>Mở tất cả</span>
                    </button>
                </div>
            </div>
            ${resultMapHtml}
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

    // Hiệu ứng vẽ vòng tròn phần trăm + đếm số % chạy song song
    const ringNow = document.getElementById('result-ring');
    if (opts.instant && ringNow) {
        ringNow.style.transition = 'none'; ringNow.style.strokeDashoffset = dashOffset.toFixed(2);
        const h = document.getElementById('result-head');
        if (h) { h.style.transition = 'none'; h.style.transform = `rotate(${(Math.max(0.012, gpa4 / 4) * 360).toFixed(1)}deg)`; }
    }
    requestAnimationFrame(() => {
        const ring = document.getElementById('result-ring');
        if (ring) ring.style.strokeDashoffset = dashOffset.toFixed(2);
        const head = document.getElementById('result-head');
        if (head) head.style.transform = `rotate(${(Math.max(0.012, gpa4 / 4) * 360).toFixed(1)}deg)`;   // hạt bám đầu cung, chạy cùng nhịp 1,2s

        const gpaEl = document.getElementById('result-gpa4');
        if (!gpaEl) return;
        // Số đã dừng: con dấu "cộp" + nhạc theo bậc + rung nhẹ (vẽ lại tại chỗ khi chấm tự luận — opts.instant — thì im)
        const reveal = () => {
            if (opts.instant) return;
            sfx('stamp');
            setTimeout(() => sfx('finish', { gpa4, pct: percentage }), 240);
            if (getVibrate() && navigator.vibrate) navigator.vibrate(gpa4 >= 3.5 ? [20, 40, 20, 40, 60] : gpa4 >= 2 ? [20, 40, 20] : 25);
        };
        const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce || opts.instant) { gpaEl.textContent = fmt1(gpa4); reveal(); return; }
        const DURATION = 1200; // khớp với transition 1.2s của vòng tròn
        const startAt = performance.now();
        let lastStep = 0;
        const tick = (now) => {
            const t = Math.min(1, (now - startAt) / DURATION);
            const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic, khớp nhịp giảm tốc của vòng
            const val = gpa4 * eased;
            gpaEl.textContent = fmt1(val);
            const step = Math.floor(val * 2 + 1e-6);   // mỗi 0,5 điểm một tiếng "tách" cao dần
            if (step > lastStep) { lastStep = step; sfx('scoreTick', { i: step - 1 }); }
            if (t < 1) requestAnimationFrame(tick);
            else { gpaEl.textContent = fmt1(gpa4); reveal(); }
        };
        gpaEl.textContent = fmt1(0);
        requestAnimationFrame(tick);
    });

    // Nút "Chia sẻ": mở lại modal chia sẻ bộ đề (inline script của quiz.html phơi sẵn)
    const shareResultBtn = document.getElementById('result-share-btn');
    if (shareResultBtn) {
        if (typeof window.openQuizShareModal === 'function') {
            shareResultBtn.addEventListener('click', () => window.openQuizShareModal());
        } else {
            shareResultBtn.classList.add('hidden');
        }
    }

    document.getElementById('result-notes-btn')?.addEventListener('click', () => import('./page/quiz-notes-all.js').then(m => m.openAllNotes()));

    // Lưu ảnh kết quả: vẽ canvas ở module riêng (nạp lười khi bấm)
    document.getElementById('result-card-btn')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        if (btn.disabled) return;
        btn.disabled = true;
        try {
            const m = await import('./page/quiz-result-card.js');
            const r = await m.saveResultCard({
                title: (state.quizData && state.quizData.title) || '', pct: percentage, gpa4, score10: fmt2(score10), grade: letterGrade, label: scoreLabel,
                correct: correctCount, wrong: Math.max(0, wrongCount), blank: unansweredCount, time: formatTime(totalTime),
                when: new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
            });
            if (r === 'saved') showToast('Đã lưu ảnh kết quả', 'success', 2000);
            else if (r === 'error') showToast('Không tạo được ảnh kết quả.', 'error');
        } catch (err) { showToast('Không tạo được ảnh kết quả.', 'error'); }
        btn.disabled = false;
    });

    // Xuất câu sai / bỏ trống: Markdown (clipboard) + CSV cho Anki (quiz-export.js, hàm thuần)
    const wrongExportItems = () => state.questions.map((q, i) => {
        const ua = state.userAnswers[i];
        const st = resultStatus(q, ua);
        if (st !== 'wrong' && st !== 'unanswered') return null;
        const essay = isEssay(q);
        return {
            n: i + 1, question: q.question, caseText: q.caseText,
            options: essay ? [] : stripOptionLabels(q.answers || q.options),
            correct: essay ? [] : getCorrectIndexes(q),
            picked: (essay || ua === null || ua === undefined) ? null : (Array.isArray(ua) ? ua : [ua]),
            modelAnswer: q.modelAnswer, explanation: q.explanation, note: q.note, expanded: q.expanded,
            myNote: String(myNotes[q.question] || '').trim()
        };
    }).filter(Boolean);
    const quizTitleForExport = (state.quizData && state.quizData.title) || '';
    document.getElementById('result-copy-wrong-btn')?.addEventListener('click', async () => {
        const items = wrongExportItems();
        const text = wrongItemsMarkdown(items, quizTitleForExport);
        try {
            await navigator.clipboard.writeText(text);
        } catch (_) {
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
            document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); } catch (__) { }
            ta.remove();
        }
        showToast(`Đã sao chép ${items.length} câu`, 'success', 2000);
    });
    document.getElementById('result-anki-btn')?.addEventListener('click', () => {
        const items = wrongExportItems();
        const blob = new Blob([wrongItemsCsv(items, quizTitleForExport)], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `cau-sai-${String(quizTitleForExport || 'bo-de').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) || 'bo-de'}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        showToast(`Đã tải ${items.length} thẻ`, 'success', 2000);
    });

    // Pháo giấy chúc mừng khi đạt điểm cao
    if (gpa4 >= 3.5 && !opts.instant) {   // từ B+ trở lên; bắn khi số vừa dừng
        setTimeout(() => triggerConfetti(), 1400);
    }

    // "Xem lại ngay": lọc các câu tự luận cần xem lại, mở hết, cuộn tới danh sách
    document.getElementById('essay-grade-now')?.addEventListener('click', () => {
        document.querySelector('#result-filter-tabs [data-filter="review"]')?.click();
        document.querySelectorAll('#detailed-results-list .result-item:not(.hidden) .result-body.hidden')
            .forEach(b => b.closest('.result-item').querySelector('.result-header')?.click());
        document.getElementById('detailed-results-list')?.scrollIntoView({ behavior: scrollBehaviorFor(), block: 'start' });
    });

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
                else if (filter === 'review') match = !!item.getAttribute('data-review');
                else if (filter === 'note') match = !!item.getAttribute('data-note');
                else if (filter === 'ask') match = !!item.getAttribute('data-ask');
                else match = item.getAttribute('data-status') === filter;
                item.classList.toggle('hidden', !match);
                const mapCell = document.querySelector(`#result-map [data-qidx="${item.getAttribute('data-ridx')}"]`);
                if (mapCell) mapCell.classList.toggle('is-dim', !match);
                if (match) visibleCount++;
            });
            const emptyMsg = document.getElementById('result-empty-msg');
            if (emptyMsg) emptyMsg.classList.toggle('hidden', visibleCount > 0);

            // Nhãn "Mở tất cả / Thu gọn" tính lại theo các câu đang hiện sau khi lọc
            const toggleAllBtn = document.getElementById('toggle-all-results');
            if (toggleAllBtn) {
                const anyClosed = [...document.querySelectorAll('#detailed-results-list .result-item:not(.hidden)')]
                    .some(it => { const b = it.querySelector('.result-body'); return b && b.classList.contains('hidden'); });
                const icon = toggleAllBtn.querySelector('i');
                const label = toggleAllBtn.querySelector('span');
                if (icon) icon.className = anyClosed ? 'fas fa-angles-down' : 'fas fa-angles-up';
                if (label) label.textContent = anyClosed ? 'Mở tất cả' : 'Thu gọn';
            }
        });
    }

    // Bản đồ kết quả: bấm ô → (đang lọc ẩn thì về "Tất cả") mở câu đó, cuộn tới và nháy viền
    const resultMap = document.getElementById('result-map');
    if (resultMap) {
        resultMap.addEventListener('click', (e) => {
            const cell = e.target.closest('.qjs-cell');
            if (!cell) return;
            const list = document.getElementById('detailed-results-list');
            let item = list && list.querySelector(`.result-item[data-ridx="${cell.getAttribute('data-qidx')}"]`);
            if (!item) return;
            if (item.classList.contains('hidden')) {
                document.querySelector('#result-filter-tabs [data-filter="all"]')?.click();
                item = list.querySelector(`.result-item[data-ridx="${cell.getAttribute('data-qidx')}"]`) || item;
            }
            const body = item.querySelector('.result-body');
            if (body && body.classList.contains('hidden')) item.querySelector('.result-header')?.click();
            item.scrollIntoView({ behavior: scrollBehaviorFor(), block: 'start' });
            item.classList.remove('res-flash');
            void item.offsetWidth;
            item.classList.add('res-flash');
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

        // "Mở tất cả / Thu gọn": chỉ tác động các câu đang hiện theo bộ lọc hiện tại
        const toggleAllBtn = document.getElementById('toggle-all-results');
        if (toggleAllBtn) {
            const setItemOpen = (item, open) => {
                const body = item.querySelector('.result-body');
                const header = item.querySelector('.result-header');
                if (!body || !header) return;
                body.classList.toggle('hidden', !open);
                const chevron = header.querySelector('.result-chevron');
                const question = header.querySelector('.result-question');
                if (chevron) chevron.classList.toggle('rotate-180', open);
                if (question) question.classList.toggle('line-clamp-2', !open);
                header.setAttribute('aria-expanded', open ? 'true' : 'false');
            };
            toggleAllBtn.addEventListener('click', () => {
                const visibleItems = [...detailedList.querySelectorAll('.result-item:not(.hidden)')];
                // Còn câu nào đang đóng -> mở hết; tất cả đã mở -> thu gọn hết
                const anyClosed = visibleItems.some(it => {
                    const b = it.querySelector('.result-body');
                    return b && b.classList.contains('hidden');
                });
                visibleItems.forEach(it => setItemOpen(it, anyClosed));
                const icon = toggleAllBtn.querySelector('i');
                const label = toggleAllBtn.querySelector('span');
                if (icon) icon.className = anyClosed ? 'fas fa-angles-up' : 'fas fa-angles-down';
                if (label) label.textContent = anyClosed ? 'Thu gọn' : 'Mở tất cả';
            });
        }
    }

    renderMath(resultsSection);
}

// Bật/tắt lớp .focus-mode-active + bắn 'quiz-focus-change' (thanh tập trung, toàn màn hình, nhắc nghỉ… ở page/quiz-focus.js).
// restore = true khi bật lại sau F5 (không có thao tác người dùng → không xin toàn màn hình, không phát tiếng).
// auto = true khi do HỆ THỐNG bật/tắt (công tắc tự tập trung, nộp bài) → không coi là lựa chọn của người dùng cho bộ đề này.
export function toggleFocusMode(restore = false, auto = false) {
    state.focusMode = !state.focusMode;
    document.body.classList.toggle('focus-mode-active', state.focusMode);

    const navWrapper = document.getElementById('question-nav-wrapper');
    if (state.focusMode) {
        if (navWrapper) navWrapper.style.display = 'none';
    } else {
        // Let main controller update visibility or restore manually
        if (navWrapper) navWrapper.style.display = '';
    }
    document.dispatchEvent(new CustomEvent('quiz-focus-change', { detail: { on: state.focusMode, restore, auto } }));
}
