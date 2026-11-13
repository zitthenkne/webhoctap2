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
//   quiz-page-setup.js    — bảng thiết lập nổi, cỡ chữ, chế độ tập trung, kéo cột, vuốt, lightbox
//   quiz-cases.js         — gom nhóm ca lâm sàng (caseId) + thứ tự câu trong ca
//   quiz-question-view.js — render câu hỏi, chọn/loại trừ đáp án, 50:50, HUD, chuyển câu
//   quiz-session.js       — tải bộ đề, bắt đầu/khôi phục phiên, đếm giờ, nộp bài, luyện tập lại

import { auth } from '../../core/firebase-init.js';
import { onSessionUser } from '../../core/auth-session.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { showConfirm, showToast } from '../../core/utils.js';
import { setupQuestionEditor } from './quiz-editor.js';
import { state, clearQuizState, saveQuizState, readQuizState, flushQuizState } from './quiz-state.js';
import { ensureMermaidInit, applyOptionOrder } from './quiz-helpers.js';
import { rebuildFromBlueprint, mergeBranches } from './quiz-attempt.js';
import { branchConflict, resolveBranchConflict } from './page/quiz-study-sync.js';
import { showSubmitQuizBtn, renderPreviewQuestions } from './quiz-ui.js';

import { scrollQuizToTop } from './page/quiz-page-prefs.js';
import { getCatMemeEnabled, setMemeEnabled } from './page/quiz-cat-meme.js';
import { setupAnnotations } from './page/quiz-annotations.js';
import { setupMarkedList } from './page/quiz-marks.js';
import {
    setupSettings, setupFontSizeControls, setupFocusModeControls,
    setupResizers, setupSwipe, setupLightbox
} from './page/quiz-page-setup.js';
import {
    showQuestion, showNextQuestion, showPreviousQuestion, accrueTime
} from './page/quiz-question-view.js';
import { setupMobileNav } from './page/quiz-mobile-nav.js';
import { setupTabletNext } from './page/quiz-tablet-next.js';
import { setupQuizBoost } from './page/quiz-boost.js';
import { setupReasoningSettings } from './page/quiz-reasoning.js';
import { setupSettingsNav } from './page/quiz-settings-nav.js';
import { setupInk } from './page/quiz-ink.js';
import { setupQuizTools } from './page/quiz-tools.js';
import { setupFocus } from './page/quiz-focus.js';
import { setupFind } from './page/quiz-find.js';
import { noteCount } from './page/quiz-notes-panel.js';
import {
    loadQuizData, startQuizMode, startQuizWithCurrentSettings, startSrsSession, startPickedSession, endQuiz
} from './page/quiz-session.js';

// Trang chờ "bay" ra bao lâu rồi mới vào bài — khớp thời lượng animation quiz-landing-leave (quiz-enhance.css). Trước là 420ms.
const LEAVE_MS = 200;

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

// Gợi ý chế độ theo kết quả lần trước: dán nhãn "Gợi ý" lên thẻ chế độ + sóc nói lý do (window.__mascotSay — script trang chờ quiz.html).
// Chỉ là gợi ý: không tự gạt tùy chọn nào của người dùng.
function suggestMode(mode, why) {
    document.querySelectorAll('#quiz-mode-presets .mp-hint').forEach(el => el.remove());
    const btn = document.querySelector(`#quiz-mode-presets [data-mode="${mode}"]`);
    if (!btn) return;
    const tag = document.createElement('span');
    tag.className = 'mp-hint';
    tag.textContent = 'Gợi ý';
    btn.appendChild(tag);
    btn.title = why;
    if (typeof window.__mascotSay === 'function') window.__mascotSay(why, 6000);
}

// Thẻ "Lần làm gần nhất" trên trang thiết lập: đọc cache kết quả đã đồng bộ sẵn từ thư viện
// (quizAttemptCache_{uid} — xem library/library-attempts.js) nên không tốn thêm lượt đọc server.
function setupLastAttemptStat() {
    const valueEl = document.getElementById('stat-last-attempt');
    const subEl = document.getElementById('stat-last-attempt-sub');
    if (!valueEl) return;
    const quizId = new URLSearchParams(window.location.search).get('id');
    onSessionUser((user) => {
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
            const pct = attempt.s / attempt.t * 100, last = `Lần trước ${attempt.s}/${attempt.t}`;
            if (pct < 50) suggestMode('study', `${last} — "Ôn tập" lại cho chắc nha 💪`);
            else if (pct < 80) suggestMode('sprint', `${last} — làm nhanh 20 câu lấp chỗ hổng nè ✨`);
            else suggestMode('exam', `${last}, giỏi quá! Thử "Thi thử" tính giờ xem 🏆`);
        } else if (cache && cache.lastSync > 0) {
            // Đã từng đồng bộ mà không có kết quả cho đề này -> chắc chắn là chưa làm
            valueEl.textContent = 'Chưa làm';
            if (subEl) subEl.textContent = 'Chiến thôi!';
            suggestMode('study', 'Đề mới nè! Thử "Ôn tập" để vừa làm vừa xem giải thích nha 🌰');
        } else {
            valueEl.textContent = '—';
            if (subEl) subEl.textContent = '';
        }
    });
}

// Nút "Ghi chú của bạn (N)" ở trang chờ: chỉ hiện khi bộ đề đã có ghi chú (kể cả vừa kéo từ cloud về); mở sổ ghi chú (chế độ xem)
function setupLandingNotes() {
    const btn = document.getElementById('landing-notes-btn');
    if (!btn) return;
    const refresh = () => {
        const n = noteCount();
        btn.classList.toggle('hidden', n === 0);
        const label = document.getElementById('landing-notes-label');
        if (label) label.textContent = `Ghi chú của bạn (${n})`;
    };
    refresh();
    window.addEventListener('quiz-study-pulled', refresh);
    btn.addEventListener('click', () => import('./page/quiz-notes-all.js').then(m => m.openAllNotes()));
}

// Chạm / bấm vào sơ đồ Mermaid (đề, giải thích, mở rộng, kết quả) -> xem phóng to toàn màn hình
// (chụm 2 ngón / Ctrl + lăn / nút +−). Sơ đồ nằm TRONG ô đáp án thì bỏ qua: cú bấm đó là chọn đáp án.
document.addEventListener('click', (e) => {
    const box = e.target.closest('.mermaid-container');
    if (!box || !box.querySelector('svg') || e.target.closest('a, button, .answer-btn')) return;
    import('./diagram-viewer.js').then(m => m.openDiagramViewer(box)).catch(() => {});
});

document.addEventListener('DOMContentLoaded', () => {
    // Khởi tạo Mermaid một lần duy nhất bằng cấu hình dùng chung trong quiz-helpers
    ensureMermaidInit();

    setupLastAttemptStat();
    setupLandingNotes();

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

    // Khôi phục không thành → trả trang chờ về trạng thái đứng yên (nút Bắt đầu đã cho trang chờ "bay" ra)
    const backToLanding = () => document.getElementById('quiz-landing')?.classList.remove('quiz-landing-leaving');
    const waitForQuizData = async (ms = 10000) => {
        for (let t = 0; t < ms && !(state.quizData && Array.isArray(state.quizData.questions) && state.quizData.questions.length); t += 200) {
            await new Promise(r => setTimeout(r, 200));
        }
        return !!(state.quizData && Array.isArray(state.quizData.questions) && state.quizData.questions.length);
    };

    // Hai máy cùng một lượt trả lời khác nhau (quiz-study-sync.js) → người học chọn nhánh; câu chỉ một máy trả lời được giữ cả.
    // Trả bản lưu đã gộp (vào thẳng câu khác đầu tiên), hoặc null nếu người học đóng hộp chọn.
    const pickBranch = async (savedState) => {
        const quizId = savedState.quizId || new URLSearchParams(location.search).get('id');
        const c = branchConflict(quizId);
        if (!c) return savedState;
        const other = c.other.deviceLabel || 'máy kia';
        const mineFirst = await showConfirm(
            `Máy này và ${other} cùng làm lượt này nhưng trả lời KHÁC nhau từ câu ${c.at + 1}. Chọn nhánh để làm tiếp — câu chỉ một máy đã trả lời vẫn được giữ.`,
            { title: 'Hai nhánh khác nhau', confirmText: 'Theo máy này', cancelText: `Theo ${other.split('·')[0].trim()}`, tone: 'warning', icon: 'fas fa-code-branch', dismiss: null }
        );
        if (mineFirst === null) return null;
        const merged = mergeBranches(mineFirst ? savedState : c.other, mineFirst ? c.other : savedState);
        merged.currentIndex = c.at;                                    // đưa tới đúng câu khác đầu tiên
        Object.defineProperty(merged, 'questions', { value: savedState.questions, writable: true, configurable: true, enumerable: false });
        resolveBranchConflict(quizId);
        return merged;
    };

    // Lượt dở → dựng lại ĐÚNG đề của lượt (quiz-attempt.js):
    //  1. bộ câu đã chơi còn trong máy → y nguyên;
    //  2. cùng revision → theo blueprint; khác revision → ghép theo khóa câu + dấu vân tay (tác giả chèn câu / đảo phương án vẫn đúng);
    //  3. tác giả đã SỬA câu của lượt → hỏi người học: làm tiếp (riêng các câu bị sửa tính theo bản mới, phải trả lời lại) hay làm lại;
    //  4. bản lưu đời cũ không ghi revision / câu của lượt đã bị xóa khỏi đề → KHÔNG tự đoán (dễ chấm sai câu) — hỏi làm lại.
    const restoreSavedSession = async (input) => {
        const savedState = await pickBranch(input);
        if (!savedState) { backToLanding(); return false; }
        // Khôi phục cấu hình phiên (tính giờ, xem đáp án ngay...) để render đúng trạng thái
        if (savedState.quizOptions) state.quizOptions = savedState.quizOptions;
        const restoreMode = savedState.quizMode || 'normal';

        if (Array.isArray(savedState.questions) && savedState.questions.length === savedState.questionsLength) {
            // Có sẵn bộ câu hỏi đã chơi (đã trộn câu/đáp án) -> khôi phục chính xác tuyệt đối
            const same = savedState.revisionId && state.quizData && state.quizData._rev === savedState.revisionId;
            startQuizMode(savedState.questions, restoreMode, { ...savedState, _attemptSource: same ? state.quizData : undefined });
            return true;
        }

        if (!await waitForQuizData()) { backToLanding(); return false; }
        const r = rebuildFromBlueprint(savedState, state.quizData, applyOptionOrder);
        if (r.ok) {
            startQuizMode(r.questions, restoreMode, { ...savedState, _attemptSource: state.quizData, _attemptRev: r.exact ? savedState.revisionId : state.quizData._rev });
            return true;
        }
        if (r.reason === 'changed' && savedState.revisionId) {
            const r2 = rebuildFromBlueprint(savedState, state.quizData, applyOptionOrder, { lenient: true });
            if (r2.ok) {
                const n = r2.reset.length;
                const go = await showConfirm(
                    `Tác giả đã sửa ${n} câu trong lượt này sau khi bạn bắt đầu. Làm tiếp thì ${n === 1 ? 'câu đó' : n + ' câu đó'} hiện theo bản mới và cần trả lời lại; các câu khác giữ nguyên.`,
                    { title: 'Bộ đề vừa được sửa', confirmText: 'Làm tiếp', cancelText: 'Làm lại từ đầu', tone: 'warning', dismiss: null });
                if (go === null) { backToLanding(); return false; }
                if (go) {
                    const s = { ...savedState, userAnswers: [...(savedState.userAnswers || [])] };
                    ['eliminatedAnswers', 'used5050Questions', 'multiSelections', 'confidence', 'markedReasons'].forEach(k => { s[k] = { ...(savedState[k] || {}) }; });
                    r2.reset.forEach(i => {
                        s.userAnswers[i] = null;
                        ['eliminatedAnswers', 'used5050Questions', 'multiSelections', 'confidence'].forEach(k => { delete s[k][i]; });
                    });
                    s.currentIndex = r2.reset[0];
                    startQuizMode(r2.questions, restoreMode, { ...s, _attemptSource: state.quizData, _attemptRev: state.quizData._rev });
                    return true;
                }
                backToLanding();
                clearQuizState();
                renderResumeHint(null);
                startQuizWithCurrentSettings();
                return false;
            }
        }
        const why = r.reason === 'legacy'
            ? 'Bản lưu này được tạo từ phiên bản cũ của web, không ghi lại phiên bản đề nên không xác định được đề gốc.'
            : 'Bộ đề đã được sửa sau khi bạn bắt đầu (có câu của lượt này đã bị xóa khỏi đề).';
        backToLanding();
        if (await showConfirm(`${why} Khôi phục theo đề hiện tại có thể chấm sai câu, nên lượt này cần làm lại.`,
            { title: 'Không khôi phục chính xác được', confirmText: 'Làm lại từ đầu', cancelText: 'Để sau', tone: 'warning' })) {
            clearQuizState();
            renderResumeHint(null);
            startQuizWithCurrentSettings();
        }
        return false;
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
    const renderResumeHint = (savedState) => {
        const startBtn = document.getElementById('start-now-btn');
        let hint = document.getElementById('resume-hint');
        if (!savedState) {
            if (hint) hint.remove();
            return;
        }
        if (!startBtn) return;

        const answered = (savedState.userAnswers || []).filter(a => a !== null).length;
        const total = savedState.questionsLength || 0;
        const percent = total ? Math.round(answered / total * 100) : 0;
        const ago = formatTimeAgo(savedState.savedAt);

        if (!hint) {
            hint = document.createElement('button');
            hint.type = 'button';
            hint.id = 'resume-hint';
            hint.className = 'resume-chip';
            startBtn.insertAdjacentElement('afterend', hint);
        }

        hint.innerHTML = `
            <span class="resume-chip-icon"><i class="fas fa-play"></i></span>
            <span class="resume-chip-body">
                <span class="resume-chip-title">Làm tiếp câu ${(savedState.currentIndex || 0) + 1}/${total}</span>
                <span class="resume-chip-sub">Đã trả lời ${answered}/${total} câu${ago ? ' · ' + ago : ''}</span>
                <span class="resume-chip-bar"><i style="width:${percent}%"></i></span>
            </span>
            <i class="fas fa-chevron-right resume-chip-go"></i>`;
        hint.onclick = () => restoreSavedSession(savedState);
    };

    renderResumeHint(getPendingSavedState());

    // Đổi tài khoản / đăng xuất ngay trên trang (core/scope.js đã đổi ngăn dữ liệu riêng): bài làm + ghi chú đang trong bộ nhớ là của
    // người trước → tải lại trang để chỉ hiện dữ liệu của người đang đăng nhập.
    window.addEventListener('scope:changed', () => location.reload());

    // Cập nhật gợi ý làm bài dở khi dữ liệu cloud đồng bộ về hoặc xóa khi đã nộp trên máy khác
    window.addEventListener('quiz-state-synced', () => {
        const landing = document.getElementById('quiz-landing');
        if (landing && !landing.classList.contains('hidden')) {
            renderResumeHint(getPendingSavedState());
        }
    });

    // Khi có mạng trở lại trong lúc đang làm bài dở -> lưu ngay để đồng bộ lên cloud
    window.addEventListener('online', () => {
        const inProgress = Array.isArray(state.userAnswers) && state.userAnswers.some(a => a !== null);
        if (inProgress) {
            saveQuizState({ immediate: true });
        }
    });

    // Khi người dùng chuyển tab hoặc ẩn trình duyệt -> flush ngay tiến trình lên cloud
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            const inProgress = Array.isArray(state.userAnswers) && state.userAnswers.some(a => a !== null);
            if (inProgress) flushQuizState();
        }
    });
    window.addEventListener('pagehide', () => {
        const inProgress = Array.isArray(state.userAnswers) && state.userAnswers.some(a => a !== null);
        if (inProgress) flushQuizState();
    });

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
            saveQuizState({ immediate: true });
            const ok = await showConfirm(
                'Tiến trình của bạn đã được tự động lưu và có thể tiếp tục khi quay lại.',
                { title: 'Về trang chủ?', confirmText: 'Về trang chủ', cancelText: 'Ở lại', tone: 'primary' }
            );
            if (ok) {
                flushQuizState();
                window.location.href = hudHomeBtn.getAttribute('href');
            }
        });
    }

    const submitQuizBtn = document.getElementById('submit-quiz-btn');
    // Nút Nộp bài trong cột ô câu (bảng được dựng lại nên ủy thác ở document) -> dùng chung logic nút lớn
    document.addEventListener('click', (e) => { if (e.target.closest('#nav-submit-btn')) submitQuizBtn?.click(); });
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
            renderPreviewQuestions();   // danh sách chỉ dựng khi khung đang mở (quiz-ui.js)
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
    setupInk();            // vẽ / viết ghi chú lên hình trong đề: Apple Pencil viết thẳng, khung phóng to có thanh bút
    setupQuestionEditor(showQuestion); // Chỉnh sửa câu hỏi (đáp án/giải thích/ghi chú/mở rộng) ngay khi làm bài
    setupSwipe();          // #3: vuốt chuyển câu
    setupMobileNav();      // Thanh điều hướng đáy + bảng nhảy câu (mobile)
    setupTabletNext();     // iPad: nút Câu tiếp nổi khi nút trong thẻ ngoài màn hình
    setupQuizBoost();      // gói nâng cấp 2026-10-05: gập thẻ dài, chọn lại, nghe đọc, phím tắt, nhịp độ...
    setupReasoningSettings(showQuestion);   // nhóm "Hướng tư duy" trong bảng thiết lập: tô dữ kiện / từng bước / hiệu ứng quét
    setupSettingsNav();    // bảng Ngựa thì chỉnh: 4 tab theo nhu cầu, gợi ý 1 chạm theo kiểu học, ô tìm thiết lập (gọi SAU mọi công tắc)
    setupQuizTools();      // giấy nháp (Apple Pencil) + máy tính / công thức: ngăn ghép cạnh bài, chỉ đóng khi bấm ×
    setupFocus();          // chế độ tập trung v2: thanh mảnh, toàn màn hình, nhắc nghỉ mắt, Esc
    setupFind();           // Ctrl+K / "/": tìm và nhảy câu

    // "Làm cùng nhau": mở đề sang phòng đánh đề (trang chờ + bảng thiết lập khi đang làm) — nạp lười
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#group-quiz-btn, #qs-group-room')) return;
        document.getElementById('quiz-settings-popover')?.classList.add('hidden-pop');
        import('./page/quiz-group.js').then(m => m.openInRoom());
    });

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
            // Dữ liệu bộ đề chưa về: script trang chờ (quiz.html) đã ghi nhận cú bấm, loadQuizData xong sẽ tự bấm lại
            if (!window.__quizBooted) return;
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
                setTimeout(beginQuiz, reduce ? 0 : LEAVE_MS);
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
                setTimeout(runSrs, reduce ? 0 : LEAVE_MS);
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
        if (document.querySelector('#notes-all.is-open') || document.body.classList.contains('quiz-paused')) return;   // sổ ghi chú mở / đang tạm dừng: phím A–Z không được chọn đáp án phía sau

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

    // ĐÓNG TAB / F5 / gõ URL khác: chỉ LƯU bài, không bật hộp "Tải lại trang?" của trình duyệt nữa —
    // tải lại giờ vào thẳng câu đang làm (cờ sessionStorage 'quizLive'), đóng tab thì lần sau có chip
    // "Làm tiếp", nên hộp thoại đó chỉ còn là một bước thừa. pagehide: iOS/Android hay bỏ qua beforeunload.
    const saveIfInProgress = () => { if (!allowLeaveWithoutPrompt && isQuizInProgress()) saveQuizState(); };
    window.addEventListener('beforeunload', saveIfInProgress);
    window.addEventListener('pagehide', saveIfInProgress);

    // Mở từ chuông thông báo (?srs=1) → tự vào phiên ôn ngắt quãng ngay khi dữ liệu
    // sẵn sàng. Nếu đang có bài làm dở thì KHÔNG tự vào (tránh ghi đè bài dở khi chưa hỏi):
    // đứng lại ở trang thiết lập, gợi ý "đang làm dở" đã hiện và người dùng tự bấm nút.
    const resumingAfterReload = document.documentElement.classList.contains('quiz-resuming');
    loadQuizData().then(() => {
        window.__quizBooted = true;
        if (resumingAfterReload) {
            const saved = getPendingSavedState();
            if (saved && state.quizData) { restoreSavedSession(saved); return; }
            try { sessionStorage.removeItem('quizLive'); } catch (e) {}   // bài đã nộp / hết dữ liệu -> về trang chờ
        }
        const params = new URLSearchParams(window.location.search);
        // Từ kết quả tìm câu hỏi ở thư viện (?pick=3,7): vào luyện ngay đúng các câu đó. Bỏ ?pick khỏi URL để F5 khôi phục bài dở
        // như thường (không bắt đầu lại). Có bài dở thì không tự vào — giống ?srs=1.
        const pick = params.get('pick');
        if (pick !== null) {
            const u = new URL(location.href); u.searchParams.delete('pick'); history.replaceState(history.state, '', u.href);
            if (!getPendingSavedState() && startPickedSession(pick.split(',').map(Number))) return;
        }
        if (params.get('srs') === '1' && !getPendingSavedState()
            && Array.isArray(state.originalQuestions) && state.originalQuestions.length) {
            startSrsSession();
            return;
        }
        // Người dùng đã bấm Bắt đầu trong lúc chờ tải → vào bài luôn (nút gốc còn đó và đã có câu hỏi)
        if (window.__startQueued) {
            window.__startQueued = false;
            const ic = startNowBtn && startNowBtn.querySelector('i');
            if (ic) ic.className = 'fas fa-play';
            if (startNowBtn && startNowBtn.isConnected && Array.isArray(state.originalQuestions) && state.originalQuestions.length) startNowBtn.click();
        }
    }).finally(() => { window.__quizBooted = true; document.documentElement.classList.remove('quiz-resuming'); });
});
