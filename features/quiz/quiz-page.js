// File: features/quiz/quiz-page.js
// Điểm vào (bootstrap) của trang làm bài quiz.html. Phần ruột đã được tách thành
// các module nhỏ trong features/quiz/page/ — file này chỉ còn khối khởi tạo DOMContentLoaded:
// khôi phục bài làm dở, nối các nút toàn trang, phím tắt và chặn rời trang khi đang làm bài.
//
// Sơ đồ module (features/quiz/page/):
//   quiz-page-prefs.js    — thiết lập Dark/Âm thanh/Rung/ảnh nền + phản hồi rung/âm + cuộn đầu trang
//   quiz-cat-meme.js      — meme con mèo khi trả lời đúng/sai
//   quiz-study-sync.js    — đồng bộ ghi chú/đánh dấu/bôi vàng với cloud
//   quiz-annotations.js   — ghi chú trực quan (bôi vàng / in đậm / in nghiêng)
//   quiz-marks.js         — đánh dấu câu theo lý do + danh sách "Câu đã đánh dấu"
//   quiz-notes-panel.js   — panel ghi chú cá nhân (cột phải)
//   quiz-page-setup.js    — bảng thiết lập nổi, cỡ chữ, chế độ tập trung, kéo cột, vuốt/chạm rìa, lightbox
//   quiz-cases.js         — gom nhóm ca lâm sàng (caseId) + thứ tự câu trong ca
//   quiz-question-view.js — render câu hỏi, chọn/loại trừ đáp án, 50:50, HUD, chuyển câu
//   quiz-session.js       — tải bộ đề, bắt đầu/khôi phục phiên, đếm giờ, nộp bài, luyện tập lại

import { auth } from '../../core/firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import { showConfirm } from '../../core/utils.js';
import { setupQuestionEditor } from './quiz-editor.js';
import { state, clearQuizState, saveQuizState, readQuizState } from './quiz-state.js';
import { ensureMermaidInit } from './quiz-helpers.js';
import { showSubmitQuizBtn } from './quiz-ui.js';

import { scrollQuizToTop } from './page/quiz-page-prefs.js';
import { getCatMemeEnabled, setMemeEnabled } from './page/quiz-cat-meme.js';
import { setupAnnotations } from './page/quiz-annotations.js';
import { setupMarkedList } from './page/quiz-marks.js';
import {
    setupSettings, setupFontSizeControls, setupFocusModeControls,
    setupResizers, setupSwipe, setupEdgeTap, setupLightbox
} from './page/quiz-page-setup.js';
import {
    showQuestion, showNextQuestion, showPreviousQuestion, accrueTime
} from './page/quiz-question-view.js';
import { setupMobileNav } from './page/quiz-mobile-nav.js';
import {
    loadQuizData, startQuizMode, startQuizWithCurrentSettings, startSrsSession, endQuiz
} from './page/quiz-session.js';

// Thời điểm nộp bài -> chuỗi "x phút/giờ/ngày trước" (quá 1 tuần thì hiện ngày cụ thể)
function formatTimeAgo(ms) {
    if (!ms) return '';
    const mins = Math.floor((Date.now() - ms) / 60000);
    if (mins < 1) return 'vừa xong';
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} ngày trước`;
    const d = new Date(ms);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// Thẻ "Lần làm gần nhất" trên trang thiết lập: đọc cache kết quả đã đồng bộ sẵn từ thư viện
// (quizAttemptCache_{uid} — xem library/library-attempts.js) nên không tốn thêm lượt đọc server.
function setupLastAttemptStat() {
    const valueEl = document.getElementById('stat-last-attempt');
    const subEl = document.getElementById('stat-last-attempt-sub');
    if (!valueEl) return;
    const quizId = new URLSearchParams(window.location.search).get('id');
    onAuthStateChanged(auth, (user) => {
        valueEl.classList.remove('skeleton-line');
        if (!user || !quizId) {
            valueEl.textContent = '—';
            if (subEl) subEl.textContent = user ? '' : 'Đăng nhập để lưu kết quả';
            return;
        }
        let cache = null;
        try { cache = JSON.parse(localStorage.getItem(`quizAttemptCache_${user.uid}`) || 'null'); } catch {}
        const attempt = cache && cache.map && cache.map[quizId];
        if (attempt && attempt.t) {
            valueEl.textContent = `${attempt.s}/${attempt.t} câu`;
            if (subEl) subEl.textContent = formatTimeAgo(attempt.at);
        } else if (cache && cache.lastSync > 0) {
            // Đã từng đồng bộ mà không có kết quả cho đề này -> chắc chắn là chưa làm
            valueEl.textContent = 'Chưa làm';
            if (subEl) subEl.textContent = 'Chiến thôi!';
        } else {
            valueEl.textContent = '—';
            if (subEl) subEl.textContent = '';
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // Khởi tạo Mermaid một lần duy nhất bằng cấu hình dùng chung trong quiz-helpers
    ensureMermaidInit();

    setupLastAttemptStat();

    // === BÀI LÀM DỞ ===
    // KHÔNG hỏi "làm tiếp?" ngay khi vừa vào trang — người dùng chưa kịp đọc thông tin bộ đề
    // mà đã bị modal chặn lại. Thay vào đó: hiện gợi ý nhỏ dưới nút Bắt đầu, và chỉ hỏi
    // đúng lúc người dùng chủ động bấm "Bắt đầu ngay" / "Ôn ngay".
    const getPendingSavedState = () => {
        try {
            const savedState = readQuizState();
            if (savedState && savedState.userAnswers
                && savedState.userAnswers.length === savedState.questionsLength && !savedState.finished) {
                return savedState;
            }
        } catch (err) { console.warn('Không thể đọc bài làm dở đã lưu:', err); }
        return null;
    };

    const restoreSavedSession = (savedState) => {
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
    };

    // Hỏi khôi phục khi người dùng CHỦ ĐỘNG bắt đầu; cancelText đổi theo ngữ cảnh nút bấm
    // (chọn cancel đồng nghĩa bỏ bài dở và đi tiếp luồng mới).
    const askResumeSavedSession = (savedState, cancelText) => {
        const answered = savedState.userAnswers.filter(a => a !== null).length;
        return showConfirm(
            `Bạn đang làm dở bài này (đã trả lời ${answered}/${savedState.questionsLength} câu). Tiếp tục từ chỗ cũ nhé?`,
            { title: 'Tiếp tục bài làm?', confirmText: 'Tiếp tục', cancelText, tone: 'primary' }
        );
    };

    // Gợi ý nhỏ dưới nút Bắt đầu để người dùng biết trước là có bài dở (thay cho modal đường đột)
    const pendingAtLoad = getPendingSavedState();
    if (pendingAtLoad) {
        const startBtn = document.getElementById('start-now-btn');
        if (startBtn && !document.getElementById('resume-hint')) {
            const answered = pendingAtLoad.userAnswers.filter(a => a !== null).length;
            const total = pendingAtLoad.questionsLength || 0;
            const percent = total ? Math.round(answered / total * 100) : 0;
            const ago = formatTimeAgo(pendingAtLoad.savedAt);
            // Bấm thẳng vào thẻ là vào tiếp đúng câu đang dở (không phải qua modal hỏi lại)
            const hint = document.createElement('button');
            hint.type = 'button';
            hint.id = 'resume-hint';
            hint.className = 'resume-chip';
            hint.innerHTML = `
                <span class="resume-chip-icon"><i class="fas fa-play"></i></span>
                <span class="resume-chip-body">
                    <span class="resume-chip-title">Làm tiếp câu ${(pendingAtLoad.currentIndex || 0) + 1}/${total}</span>
                    <span class="resume-chip-sub">Đã trả lời ${answered}/${total} câu${ago ? ' · ' + ago : ''}</span>
                    <span class="resume-chip-bar"><i style="width:${percent}%"></i></span>
                </span>
                <i class="fas fa-chevron-right resume-chip-go"></i>`;
            hint.addEventListener('click', () => restoreSavedSession(pendingAtLoad));
            startBtn.insertAdjacentElement('afterend', hint);
        }
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
    setupMobileNav();      // Thanh điều hướng đáy + bảng nhảy câu (mobile)

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
        startNowBtn.addEventListener('click', async () => {
            // Có bài dở -> hỏi đúng lúc này (người dùng vừa chủ động bấm nên câu hỏi không đường đột)
            let beginQuiz = startQuizWithCurrentSettings;
            const savedState = getPendingSavedState();
            if (savedState) {
                if (await askResumeSavedSession(savedState, 'Làm lại từ đầu')) {
                    beginQuiz = () => restoreSavedSession(savedState);
                } else {
                    clearQuizState();
                }
            }
            const landing = document.getElementById('quiz-landing');
            // Hiệu ứng chuyển cảnh: trang thiết lập "bay" ra rồi mới vào màn làm bài
            if (landing && !landing.classList.contains('hidden') && !landing.classList.contains('quiz-landing-leaving')) {
                const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                landing.classList.add('quiz-landing-leaving');
                scrollQuizToTop();
                setTimeout(beginQuiz, reduce ? 0 : 420);
            } else {
                beginQuiz();
            }
        });
    }

    // Nút "Ôn ngay" (ôn ngắt quãng) — cùng hiệu ứng chuyển cảnh với nút bắt đầu.
    // startSrsSession trả false khi hết câu để ôn → trả landing về trạng thái cũ.
    const startSrsBtn = document.getElementById('start-srs-btn');
    if (startSrsBtn) {
        startSrsBtn.addEventListener('click', async () => {
            const landing = document.getElementById('quiz-landing');
            let runSrs = async () => {
                if (await startSrsSession() === false && landing) {
                    landing.classList.remove('quiz-landing-leaving');
                }
            };
            // Phiên ôn cũng ghi đè bài dở đã lưu -> hỏi trước, giống nút Bắt đầu
            const savedState = getPendingSavedState();
            if (savedState) {
                if (await askResumeSavedSession(savedState, 'Bỏ qua, ôn ngay')) {
                    runSrs = () => restoreSavedSession(savedState);
                } else {
                    clearQuizState();
                }
            }
            if (landing && !landing.classList.contains('hidden') && !landing.classList.contains('quiz-landing-leaving')) {
                const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                landing.classList.add('quiz-landing-leaving');
                scrollQuizToTop();
                setTimeout(runSrs, reduce ? 0 : 420);
            } else {
                runSrs();
            }
        });
    }

    // Bật/tắt meme con mèo — đồng bộ với lựa chọn đã lưu cục bộ
    const memeCheckbox = document.getElementById('meme-enabled-checkbox');
    if (memeCheckbox) {
        memeCheckbox.checked = getCatMemeEnabled();
        memeCheckbox.addEventListener('change', () => setMemeEnabled(memeCheckbox.checked));
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

    // Mở từ chuông thông báo (?srs=1) → tự vào phiên ôn ngắt quãng ngay khi dữ liệu
    // sẵn sàng. Nếu đang có bài làm dở thì KHÔNG tự vào (tránh ghi đè bài dở khi chưa hỏi):
    // đứng lại ở trang thiết lập, gợi ý "đang làm dở" đã hiện và người dùng tự bấm nút.
    loadQuizData().then(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('srs') === '1' && !getPendingSavedState()
            && Array.isArray(state.originalQuestions) && state.originalQuestions.length) {
            startSrsSession();
        }
    });
});
