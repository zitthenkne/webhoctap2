// File: features/quiz/page/quiz-mobile-nav.js
// Thanh điều hướng cố định ở ĐÁY màn hình khi đang làm bài (chỉ mobile/tablet hẹp) +
// bảng "nhảy câu" dạng bottom-sheet. Mục tiêu: trên điện thoại luôn với tới nút
// Trước/Tiếp và thấy tiến trình mà không phải cuộn xuống cuối thẻ câu hỏi (vốn có thể
// rất dài khi đã hiện giải thích / mở rộng). Bổ trợ cho cú vuốt sẵn có,
// và thay cho lưới số câu xếp dọc (đỡ chiếm chỗ trên màn hẹp).

import { state, MARK_REASONS, saveQuizState } from '../quiz-state.js';
import { isAnswerCorrect, isMultiAnswer } from '../quiz-helpers.js';
import { isEssay, isPendingEssay } from '../quiz-essay-core.js';
import { showQuestion, showNextQuestion, showPreviousQuestion, handle5050Help } from './quiz-question-view.js';
import { applyMark } from './quiz-marks.js';
import { caseCellClass } from './quiz-cases.js';
import { getVibrate } from './quiz-page-prefs.js';
import { liveStats, accTone } from '../quiz-ui.js';
import { openQuickNote, closeQuickNote } from './quiz-notes-panel.js';

// --- Dock: sổ ghi chú trượt lên (CSS body.qmn-dock-on.fm-note-open) ---
let noteBtn = null;
const noteOpen = () => document.body.classList.contains('fm-note-open');

// Bàn phím ảo (iOS không co trang, chỉ co visualViewport): phần màn bị che = innerHeight − vv.height − vv.offsetTop.
// Đang gõ ghi chú trong sổ trượt -> body.qmn-kb, sổ nhấc lên ngay trên bàn phím (§30c). Android co cả trang nên kb ≈ 0.
// (2026-11-13) Hàm này chạy theo visualViewport resize/scroll — Safari bắn liên tục khi thanh công cụ co giãn / trang nảy lúc đang kéo.
// Ghi biến CSS lên <html> mỗi lần = tính lại style CẢ TRANG (~700 KB CSS) ngay giữa cú vuốt -> giật. --kb / --vvh chỉ có sổ ghi chú
// trượt dùng (quiz-stationery.css §30c), nên: sổ đóng thì không ghi gì; sổ mở thì chỉ ghi khi giá trị thật sự đổi.
let lastKb = -1, lastVvh = -1;
function syncKb() {
    const vv = window.visualViewport;
    if (!vv) return;
    const body = document.body.classList;
    if (!noteOpen()) { if (body.contains('qmn-kb')) body.remove('qmn-kb'); return; }
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    const vvh = Math.round(vv.height);
    const on = kb > 80 && body.contains('qmn-dock-on') && !body.contains('focus-mode-active');
    const root = document.documentElement.style;
    if (kb !== lastKb) { lastKb = kb; root.setProperty('--kb', kb + 'px'); }
    if (vvh !== lastVvh) { lastVvh = vvh; root.setProperty('--vvh', vvh + 'px'); }
    if (body.contains('qmn-kb') !== on) body.toggle('qmn-kb', on);
}
function syncNoteBtn() {
    syncKb();
    if (!noteBtn) return;
    const open = noteOpen();
    noteBtn.classList.toggle('is-active', open);
    noteBtn.setAttribute('aria-expanded', String(open));
    const v = document.getElementById('personal-note-input')?.value || '';
    noteBtn.classList.toggle('has-note', !!v.trim());   // chấm oải hương = câu này đã có ghi chú
}
function setupDockNote() {
    noteBtn = document.getElementById('qmn-note');
    if (!noteBtn) return;
    noteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        buzz();
        setMarkMenu(false);
        if (noteOpen()) closeQuickNote(); else openQuickNote();
        syncNoteBtn();
    });
    // Chạm ra ngoài sổ / Esc -> đóng (chỉ ở dock; chế độ tập trung có cách đóng riêng trên thanh tập trung)
    document.addEventListener('pointerdown', (e) => {
        if (!document.body.classList.contains('qmn-dock-on') || !noteOpen()) return;
        if (e.target.closest('#quiz-note-panel, #qmn-note, #annot-toolbar, .zt-confirm-overlay')) return;
        closeQuickNote(); syncNoteBtn();
    }, true);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.body.classList.contains('qmn-dock-on') && noteOpen()) { closeQuickNote(); syncNoteBtn(); }
    });
    document.addEventListener('input', (e) => { if (e.target && e.target.id === 'personal-note-input') syncNoteBtn(); });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', syncKb);
        window.visualViewport.addEventListener('scroll', syncKb);
    }
    // Phím Q (bàn phím rời iPad) / thanh tập trung cũng mở-đóng sổ: theo dõi lớp fm-note-open thay vì chỉ nghe nút dock
    let was = noteOpen();
    new MutationObserver(() => { const now = noteOpen(); if (now !== was) { was = now; syncNoteBtn(); } })
        .observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

let bar, prevBtn, nextBtn, jumpBtn, counterEl, fillEl, fiveBtn, markBtn, markMenu, settingsBtn;
let sheet, sheetGrid, sheetMeta, sheetBackdrop, sheetClose;
let wired = false;
let jumpFilter = 'all';   // bộ lọc bảng nhảy câu: all | todo | marked | wrong

// Chỉ hiện ở màn hình hẹp (mobile / tablet dọc). ≥1024px đã có bố cục 3 cột + lưới số câu.
// 2026-11-03: thanh đáy = DOCK nổi cho ngón cái ở MỌI màn < 1024 (quiz-stationery.css §30c), có thêm nút Ghi chú (sổ trượt lên).
// iPad dọc (isTab, 768–1023) dùng bản gọn: chỉ hàng nút, bỏ dải "Câu X/Y" vì bảng số câu dính đỉnh (§30b) đã có.
// Nút Câu tiếp nổi (quiz-tablet-next.js) nay chỉ còn ở ≥1024 nên không bao giờ có hai nút Tiếp cùng lúc.
function isNarrow() { return window.innerWidth < 1024; }
function isTab() { return window.innerWidth >= 768; }

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
    const counts = { todo: 0, marked: 0, wrong: 0 };
    for (let i = 0; i < total; i++) {
        const ans = state.userAnswers[i];
        const answered = ans !== null && ans !== undefined;
        const marked = state.markedQuestions.includes(i);
        const judged = immediate && !isPendingEssay(state.questions[i], ans);
        const wrong = answered && judged && !isAnswerCorrect(state.questions[i], ans);
        if (!answered) counts.todo++;
        if (marked) counts.marked++;
        if (wrong) counts.wrong++;
        const match = jumpFilter === 'all' || (jumpFilter === 'todo' ? !answered : jumpFilter === 'marked' ? marked : wrong);
        let cls = 'qjs-cell' + (match ? '' : ' is-dim');
        if (i === state.currentIndex) {
            cls += ' is-current';
        } else if (answered) {
            if (judged) {
                cls += isAnswerCorrect(state.questions[i], ans) ? ' is-correct' : ' is-wrong';
            } else {
                cls += ' is-answered';
            }
        }
        const caseCls = caseCellClass(state.questions[i]);
        if (caseCls) cls += ' ' + caseCls;
        let dot = '';
        if (marked) {
            const rk = (state.markedReasons && state.markedReasons[i]) || 'review';
            const mc = (MARK_REASONS[rk] && MARK_REASONS[rk].color) || '#eab308';
            dot = `<span class="qjs-flag" style="background:${mc}"></span>`;
        }
        html += `<button type="button" class="${cls}" data-qidx="${i}" aria-label="Câu ${i + 1}">${i + 1}${dot}</button>`;
    }
    sheetGrid.innerHTML = html;
    // Chip lọc: số đếm từng nhóm; "Sai" chỉ có nghĩa khi đang chấm từng câu
    if (sheet) sheet.querySelectorAll('[data-qjs-filter]').forEach((b) => {
        const k = b.getAttribute('data-qjs-filter');
        const n = b.querySelector('b');
        if (n) n.textContent = counts[k];
        if (k === 'wrong') b.hidden = !immediate;
        b.classList.toggle('is-on', k === jumpFilter);
        b.setAttribute('aria-pressed', String(k === jumpFilter));
    });
    if (sheetMeta) {
        const answered = state.userAnswers.filter(a => a !== null && a !== undefined).length;
        sheetMeta.textContent = `${answered}/${total}`;
    }
}

// --- Bong bóng chọn lý do đánh dấu (nút Đánh dấu ở thanh đáy) ---
function renderMarkMenu() {
    if (!markMenu) return;
    const i = state.currentIndex;
    const cur = state.markedQuestions.includes(i) ? (state.markedReasons[i] || 'review') : '';
    markMenu.innerHTML = '<div class="qmm-title">Đánh dấu câu ' + (i + 1) + ' vì…</div>'
        + Object.entries(MARK_REASONS).map(([k, m]) =>
            `<button type="button" role="menuitemradio" aria-checked="${cur === k}" class="qmm-item${cur === k ? ' is-on' : ''}" data-mark-reason="${k}" style="--mk:${m.color};--mk-bg:${m.bg};--mk-ink:${m.text}">`
            + `<span class="qmm-ic"><i class="fas ${m.icon}"></i></span><span class="qmm-label">${m.label}</span>`
            + (cur === k ? '<i class="fas fa-check qmm-check"></i>' : '') + '</button>').join('')
        + (cur ? '<button type="button" role="menuitem" class="qmm-item qmm-unmark" data-mark-reason="__unmark"><span class="qmm-ic"><i class="fas fa-xmark"></i></span><span class="qmm-label">Bỏ đánh dấu</span></button>' : '');
}
function setMarkMenu(open) {
    if (!markMenu || !markBtn) return;
    if (open) renderMarkMenu();
    markMenu.classList.toggle('hidden', !open);
    markBtn.setAttribute('aria-expanded', String(open));
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
    // "Tiếp" luôn khả dụng (nhất quán với cú vuốt). Ở câu cuối -> showNextQuestion
    // sẽ hỏi xác nhận rồi nộp bài.
    if (nextBtn) nextBtn.addEventListener('click', () => { buzz(); showNextQuestion(); });

    if (jumpBtn) jumpBtn.addEventListener('click', () => {
        buzz();
        if (sheet && !sheet.classList.contains('hidden')) closeJumpSheet();
        else openJumpSheet();
    });

    // (Đã bỏ "vuốt LÊN trên dải = mở danh sách câu": dải chặn kéo (touch-action:none) nên vuốt bắt đầu ở đáy màn
    //  không cuộn được trang — quiz-stationery.css §31. Bấm dải vẫn mở danh sách.)

    // 50:50 ở thanh đáy — gọi đúng logic trong thẻ rồi làm mờ nút khi đã dùng
    if (fiveBtn) fiveBtn.addEventListener('click', () => {
        if (fiveBtn.classList.contains('is-off')) return;
        buzz();
        handle5050Help();
        updateMobileNav();
    });

    setupDockNote();

    // Đánh dấu ở thanh đáy: mở bong bóng chọn lý do (giống menu trong thẻ), chọn xong tự đóng
    markMenu = document.getElementById('qmn-mark-menu');
    if (markBtn) markBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        buzz();
        setMarkMenu(markMenu && markMenu.classList.contains('hidden'));
    });
    if (markMenu) markMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = e.target.closest('[data-mark-reason]');
        if (!item) return;
        buzz(12);
        applyMark(state.currentIndex, item.getAttribute('data-mark-reason'));
        setMarkMenu(false);
        showQuestion(); // đồng bộ nút đánh dấu trong thẻ + bảng "Câu đã đánh dấu"
    });
    document.addEventListener('click', (e) => {
        if (markMenu && !markMenu.classList.contains('hidden') && !markMenu.contains(e.target)) setMarkMenu(false);
    });

    // Thiết lập: mở bảng "Ngựa thì chỉnh" (nút ngựa nổi được ẩn khi thanh đáy đang hiện).
    // Chặn nổi bọt để bộ "bấm ra ngoài thì đóng" của bảng không đóng ngay lại.
    settingsBtn = document.getElementById('qmn-settings');
    if (settingsBtn) settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        buzz();
        setMarkMenu(false);
        const fab = document.getElementById('quiz-settings-fab');
        if (fab) fab.click();
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
            saveQuizState();
            showQuestion();
        }
    });

    if (sheet) sheet.addEventListener('click', (e) => {
        const f = e.target.closest('[data-qjs-filter]');
        if (!f) return;
        buzz();
        jumpFilter = f.getAttribute('data-qjs-filter');
        renderJumpGrid();
    });
    if (sheetClose) sheetClose.addEventListener('click', closeJumpSheet);
    if (sheetBackdrop) sheetBackdrop.addEventListener('click', closeJumpSheet);
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (markMenu && !markMenu.classList.contains('hidden')) setMarkMenu(false);
        if (sheet && !sheet.classList.contains('hidden')) closeJumpSheet();
    });

    window.addEventListener('resize', () => {
        if (!isNarrow()) closeJumpSheet();
        updateMobileNav();
    });

    wired = true;
}

// Gọi ở cuối showQuestion() (mọi lần render câu) để đồng bộ số câu / tiến trình / nút.
// Dải tiến trình: "✓12 ✗3 · 80%" cạnh "Câu 5/40" — chỉ khi chế độ xem đáp án ngay (thi thử không lộ đúng/sai).
// Có điểm thì ẩn chữ "Danh sách câu" (chỉ giữ biểu tượng) cho đủ chỗ trên màn hẹp.
let _stripPrev = { correct: -1, wrong: -1 };
function renderStripScore() {
    const el = document.getElementById('qmn-score');
    if (!el) return;
    const s = liveStats();
    const show = s.immediate && s.answered > 0;
    el.hidden = !show;
    if (bar) bar.classList.toggle('has-score', show);
    if (!show) { _stripPrev = { correct: -1, wrong: -1 }; return; }
    el.innerHTML = `<span class="qms-ok"><i class="fas fa-check"></i>${s.correct}</span>`
        + `<span class="qms-bad"><i class="fas fa-xmark"></i>${s.wrong}</span>`
        + (s.acc != null ? `<span class="qms-acc ${accTone(s.acc)}">${s.acc}%</span>` : '');
    el.setAttribute('aria-label', `Đúng ${s.correct}, sai ${s.wrong}${s.acc != null ? `, tỉ lệ đúng ${s.acc}%` : ''}`);
    if (_stripPrev.correct >= 0 && s.correct > _stripPrev.correct) el.querySelector('.qms-ok')?.classList.add('is-bump');
    if (_stripPrev.wrong >= 0 && s.wrong > _stripPrev.wrong) el.querySelector('.qms-bad')?.classList.add('is-bump');
    _stripPrev = { correct: s.correct, wrong: s.wrong };
}

export function updateMobileNav() {
    if (!bar) return;
    if (!isNarrow() || !inQuiz()) {
        bar.classList.remove('show', 'qmn-dock');
        bar.setAttribute('aria-hidden', 'true');
        if (document.body.classList.contains('qmn-dock-on') && noteOpen()) closeQuickNote();   // sổ dạng trượt không được kẹt mở khi rời dock
        document.body.classList.remove('has-mobile-nav', 'qmn-dock-on', 'qmn-tab', 'qmn-kb');
        return;
    }
    const tab = isTab();
    bar.classList.add('show', 'qmn-dock');
    bar.classList.toggle('qmn-tab', tab);
    bar.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-mobile-nav', 'qmn-dock-on');
    document.body.classList.toggle('qmn-tab', tab);
    if (noteBtn) noteBtn.hidden = false;
    syncNoteBtn();
    // chiều cao dock -> sổ ghi chú đặt ngay trên dock, chân trang chừa đủ chỗ (dock điện thoại 2 tầng, iPad 1 tầng)
    requestAnimationFrame(() => { if (bar.offsetHeight) document.documentElement.style.setProperty('--qmn-h', bar.offsetHeight + 'px'); });

    const total = state.questions.length;
    const idx = state.currentIndex;
    const answered = state.userAnswers.filter(a => a !== null && a !== undefined).length;

    if (counterEl) counterEl.textContent = `Câu ${idx + 1}/${total}`;
    if (fillEl) fillEl.style.width = (total ? Math.round((answered / total) * 100) : 0) + '%';
    renderStripScore();

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
        const multi = isMultiAnswer(q) || isEssay(q);
        fiveBtn.style.display = multi ? 'none' : '';
        const off = multi || state.userAnswers[idx] != null || !!state.used5050Questions[idx];
        fiveBtn.classList.toggle('is-off', off);
    }
    // Đánh dấu: câu đang được đánh dấu -> nút mang icon + màu của lý do
    if (markBtn) {
        const rk = state.markedQuestions.includes(idx) ? (state.markedReasons[idx] || 'review') : '';
        const m = rk ? MARK_REASONS[rk] : null;
        markBtn.classList.toggle('is-active', !!m);
        markBtn.style.cssText = m ? `--mk:${m.color};--mk-bg:${m.bg};--mk-ink:${m.text}` : '';
        markBtn.innerHTML = `<i class="fas ${m ? m.icon : 'fa-bookmark'}"></i>`;
        markBtn.title = m ? `Đã đánh dấu: ${m.short} — bấm để đổi` : 'Đánh dấu câu';
    }
    if (markMenu && !markMenu.classList.contains('hidden')) renderMarkMenu();
    // Câu hiện tại đã trả lời -> nút Tiếp "sẵn sàng" (sáng nhẹ) để biết bước kế tiếp
    if (nextBtn) nextBtn.classList.toggle('is-ready', state.userAnswers[idx] != null && !isLast);

    // Nếu bảng nhảy câu đang mở, cập nhật lại các ô cho khớp trạng thái mới nhất
    if (sheet && !sheet.classList.contains('hidden')) renderJumpGrid();
}

export function hideMobileNav() {
    setMarkMenu(false);
    if (bar) {
        bar.classList.remove('show');
        bar.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('has-mobile-nav');
    closeJumpSheet();
}
