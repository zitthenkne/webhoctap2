// File: features/quiz/page/quiz-mobile-nav.js
// Thanh điều hướng cố định ở ĐÁY màn hình khi đang làm bài (chỉ mobile/tablet hẹp) +
// bảng "nhảy câu" dạng bottom-sheet. Mục tiêu: trên điện thoại luôn với tới nút
// Trước/Tiếp và thấy tiến trình mà không phải cuộn xuống cuối thẻ câu hỏi (vốn có thể
// rất dài khi đã hiện giải thích / mở rộng). Bổ trợ cho vuốt & chạm rìa sẵn có,
// và thay cho lưới số câu xếp dọc (đỡ chiếm chỗ trên màn hẹp).

import { state, MARK_REASONS } from '../quiz-state.js';
import { isAnswerCorrect, isMultiAnswer } from '../quiz-helpers.js';
import { showQuestion, showNextQuestion, showPreviousQuestion, handle5050Help } from './quiz-question-view.js';
import { applyMark } from './quiz-marks.js';
import { getVibrate } from './quiz-page-prefs.js';

let bar, prevBtn, nextBtn, jumpBtn, counterEl, fillEl, fiveBtn, markBtn;
let sheet, sheetGrid, sheetMeta, sheetBackdrop, sheetClose;
let wired = false;

// Chỉ hiện ở màn hình hẹp (mobile / tablet dọc). ≥1024px đã có bố cục 3 cột + lưới số câu.
function isNarrow() { return window.innerWidth < 1024; }

// Đang thực sự trong lúc làm bài (không phải trang thiết lập / màn kết quả)?
function inQuiz() {
    const results = document.getElementById('resultsSection');
    return document.body.classList.contains('quiz-active')
        && (!results || results.classList.contains('hidden'));
}

function buzz(ms = 8) {
    if (getVibrate() && navigator.vibrate) navigator.vibrate(ms);
}

// --- Bảng nhảy câu (bottom-sheet) ---
function renderJumpGrid() {
    if (!sheetGrid) return;
    const total = state.questions.length;
    const immediate = !!(state.quizOptions && state.quizOptions.showAnswerImmediately);
    let html = '';
    for (let i = 0; i < total; i++) {
        const ans = state.userAnswers[i];
        const answered = ans !== null && ans !== undefined;
        const marked = state.markedQuestions.includes(i);
        let cls = 'qjs-cell';
        if (i === state.currentIndex) {
            cls += ' is-current';
        } else if (answered) {
            if (immediate) {
                cls += isAnswerCorrect(state.questions[i], ans) ? ' is-correct' : ' is-wrong';
            } else {
                cls += ' is-answered';
            }
        }
        let dot = '';
        if (marked) {
            const rk = (state.markedReasons && state.markedReasons[i]) || 'review';
            const mc = (MARK_REASONS[rk] && MARK_REASONS[rk].color) || '#eab308';
            dot = `<span class="qjs-flag" style="background:${mc}"></span>`;
        }
        html += `<button type="button" class="${cls}" data-qidx="${i}" aria-label="Câu ${i + 1}">${i + 1}${dot}</button>`;
    }
    sheetGrid.innerHTML = html;
    if (sheetMeta) {
        const answered = state.userAnswers.filter(a => a !== null && a !== undefined).length;
        sheetMeta.textContent = `${answered}/${total}`;
    }
}

function openJumpSheet() {
    if (!sheet) return;
    renderJumpGrid();
    sheet.classList.remove('hidden');
    requestAnimationFrame(() => sheet.classList.add('show'));
    document.body.classList.add('qjs-open');
    if (jumpBtn) jumpBtn.setAttribute('aria-expanded', 'true');
    const cur = sheetGrid && sheetGrid.querySelector('.is-current');
    if (cur) cur.scrollIntoView({ block: 'nearest' });
}

function closeJumpSheet() {
    if (!sheet || sheet.classList.contains('hidden')) return;
    sheet.classList.remove('show');
    document.body.classList.remove('qjs-open');
    if (jumpBtn) jumpBtn.setAttribute('aria-expanded', 'false');
    setTimeout(() => sheet.classList.add('hidden'), 240);
}

export function setupMobileNav() {
    bar = document.getElementById('quiz-mobile-nav');
    if (!bar || wired) return;
    prevBtn = document.getElementById('qmn-prev');
    nextBtn = document.getElementById('qmn-next');
    jumpBtn = document.getElementById('qmn-jump');
    counterEl = document.getElementById('qmn-counter');
    fillEl = document.getElementById('qmn-progress-fill');
    fiveBtn = document.getElementById('qmn-5050');
    markBtn = document.getElementById('qmn-mark');
    sheet = document.getElementById('quiz-jump-sheet');
    sheetGrid = document.getElementById('qjs-grid');
    sheetMeta = document.getElementById('qjs-meta');
    sheetBackdrop = sheet && sheet.querySelector('.qjs-backdrop');
    sheetClose = document.getElementById('qjs-close');

    if (prevBtn) prevBtn.addEventListener('click', () => {
        if (state.currentIndex > 0 && state.quizMode !== 'practice') { buzz(); showPreviousQuestion(); }
    });
    // "Tiếp" luôn khả dụng (nhất quán với vuốt / chạm rìa). Ở câu cuối -> showNextQuestion
    // sẽ hỏi xác nhận rồi nộp bài.
    if (nextBtn) nextBtn.addEventListener('click', () => { buzz(); showNextQuestion(); });

    if (jumpBtn) jumpBtn.addEventListener('click', () => {
        buzz();
        if (sheet && !sheet.classList.contains('hidden')) closeJumpSheet();
        else openJumpSheet();
    });

    // Vuốt trên thanh: LÊN = mở danh sách câu, XUỐNG = đóng (bù cho việc phải bấm đúng dải)
    if (jumpBtn) {
        let barY = 0, barTrack = false;
        jumpBtn.addEventListener('touchstart', (e) => {
            barTrack = e.touches.length === 1;
            if (barTrack) barY = e.touches[0].clientY;
        }, { passive: true });
        jumpBtn.addEventListener('touchend', (e) => {
            if (!barTrack) return; barTrack = false;
            const dy = e.changedTouches[0].clientY - barY;
            if (dy < -32) { buzz(); openJumpSheet(); }
            else if (dy > 32) closeJumpSheet();
        }, { passive: true });
    }

    // 50:50 ở thanh đáy — gọi đúng logic trong thẻ rồi làm mờ nút khi đã dùng
    if (fiveBtn) fiveBtn.addEventListener('click', () => {
        if (fiveBtn.classList.contains('is-off')) return;
        buzz();
        handle5050Help();
        updateMobileNav();
    });

    // Đánh dấu nhanh ở thanh đáy — bật/tắt lý do mặc định "để dành xem lại".
    // Muốn đổi lý do cụ thể thì dùng nút đánh dấu trong thẻ (có menu).
    if (markBtn) markBtn.addEventListener('click', () => {
        buzz();
        const i = state.currentIndex;
        applyMark(i, state.markedQuestions.includes(i) ? '__unmark' : 'review');
        showQuestion(); // đồng bộ nút đánh dấu trong thẻ + bảng "Câu đã đánh dấu"
    });

    if (sheetGrid) sheetGrid.addEventListener('click', (e) => {
        const cell = e.target.closest('.qjs-cell');
        if (!cell) return;
        const idx = parseInt(cell.getAttribute('data-qidx'), 10);
        if (isNaN(idx)) return;
        buzz();
        closeJumpSheet();
        if (idx !== state.currentIndex) {
            state.currentIndex = idx;
            showQuestion();
        }
    });

    if (sheetClose) sheetClose.addEventListener('click', closeJumpSheet);
    if (sheetBackdrop) sheetBackdrop.addEventListener('click', closeJumpSheet);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sheet && !sheet.classList.contains('hidden')) closeJumpSheet();
    });

    window.addEventListener('resize', () => {
        if (!isNarrow()) closeJumpSheet();
        updateMobileNav();
    });

    wired = true;
}

// Gọi ở cuối showQuestion() (mọi lần render câu) để đồng bộ số câu / tiến trình / nút.
export function updateMobileNav() {
    if (!bar) return;
    if (!isNarrow() || !inQuiz()) {
        bar.classList.remove('show');
        bar.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('has-mobile-nav');
        return;
    }
    bar.classList.add('show');
    bar.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-mobile-nav');

    const total = state.questions.length;
    const idx = state.currentIndex;
    const answered = state.userAnswers.filter(a => a !== null && a !== undefined).length;

    if (counterEl) counterEl.textContent = `Câu ${idx + 1}/${total}`;
    if (fillEl) fillEl.style.width = (total ? Math.round((answered / total) * 100) : 0) + '%';

    const canPrev = idx > 0 && state.quizMode !== 'practice';
    if (prevBtn) {
        prevBtn.disabled = !canPrev;
        prevBtn.classList.toggle('is-off', !canPrev);
    }

    const isLast = idx >= total - 1;
    if (nextBtn) {
        nextBtn.classList.toggle('qmn-submit', isLast);
        nextBtn.innerHTML = isLast
            ? '<i class="fas fa-flag-checkered"></i><span class="qmn-arrow-txt">Nộp bài</span>'
            : '<span class="qmn-arrow-txt">Tiếp</span><i class="fas fa-chevron-right"></i>';
    }

    // 50:50: ẩn với câu nhiều đáp án; làm mờ (khóa) khi đã trả lời hoặc đã dùng
    const q = state.questions[idx];
    if (fiveBtn) {
        const multi = isMultiAnswer(q);
        fiveBtn.style.display = multi ? 'none' : '';
        const off = multi || state.userAnswers[idx] != null || !!state.used5050Questions[idx];
        fiveBtn.classList.toggle('is-off', off);
    }
    // Đánh dấu: tô đậm khi câu hiện tại đang được đánh dấu
    if (markBtn) markBtn.classList.toggle('is-active', state.markedQuestions.includes(idx));

    // Nếu bảng nhảy câu đang mở, cập nhật lại các ô cho khớp trạng thái mới nhất
    if (sheet && !sheet.classList.contains('hidden')) renderJumpGrid();
}

export function hideMobileNav() {
    if (bar) {
        bar.classList.remove('show');
        bar.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('has-mobile-nav');
    closeJumpSheet();
}
