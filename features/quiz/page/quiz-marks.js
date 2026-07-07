// File: features/quiz/page/quiz-marks.js
// Đánh dấu câu hỏi theo lý do (khó / tranh cãi / hay / ôn lại): nút đánh dấu + menu lý do,
// và khối "Câu đã đánh dấu" trong bảng thiết lập (góc trái).
// Tách từ quiz-page.js — logic giữ nguyên.

import { showToast } from '../../../core/utils.js';
import { state, saveQuizState, MARK_REASONS } from '../quiz-state.js';
import { persistMarkByText } from './quiz-study-sync.js';
import { showQuestion } from './quiz-question-view.js';

// Nút "Đánh dấu câu hỏi" nâng cao: bấm để mở menu chọn lý do (khó / tranh cãi / hay / ôn lại).
// Khi đã đánh dấu, nút đổi màu + nhãn theo lý do; mở lại menu để đổi lý do hoặc bỏ đánh dấu.
export function renderMarkControl() {
    const idx = state.currentIndex;
    const isMarked = state.markedQuestions.includes(idx);
    const reasonKey = isMarked ? (state.markedReasons[idx] || 'review') : null;
    const r = reasonKey ? MARK_REASONS[reasonKey] : null;

    const btnClass = r
        ? 'border font-semibold'
        : 'border border-yellow-400 text-yellow-700 bg-yellow-50 hover:bg-yellow-100';
    const btnStyle = r ? `style="border-color:${r.color};color:${r.text};background:${r.bg}"` : '';

    const items = Object.entries(MARK_REASONS).map(([key, m]) => `
        <button type="button" data-mark-reason="${key}" class="mark-reason-item ${reasonKey === key ? 'is-active' : ''}">
            <span class="mark-reason-ic" style="background:${m.bg};color:${m.color}"><i class="fas ${m.icon}"></i></span>
            <span class="mark-reason-label">${m.label}</span>
            ${reasonKey === key ? '<i class="fas fa-check mark-reason-check"></i>' : ''}
        </button>`).join('');

    const unmark = isMarked ? `
        <div class="mark-menu-divider"></div>
        <button type="button" data-mark-reason="__unmark" class="mark-reason-item mark-reason-unmark">
            <span class="mark-reason-ic" style="background:#fee2e2;color:#ef4444"><i class="fas fa-flag-checkered"></i></span>
            <span class="mark-reason-label">Bỏ đánh dấu</span>
        </button>` : '';

    return `
        <div class="relative" id="mark-control">
            <button id="mark-question-btn" type="button" class="px-4 py-2 rounded-lg ${btnClass} transition flex items-center gap-2"
                    ${btnStyle} aria-haspopup="true" aria-expanded="false" title="Đánh dấu câu hỏi theo lý do">
                <i class="fas ${r ? r.icon : 'fa-flag'}"></i>
                <span>${r ? r.short : 'Đánh dấu'}</span>
                <i class="fas fa-chevron-down text-xs opacity-70"></i>
            </button>
            <div id="mark-menu" class="mark-menu hidden">
                <div class="mark-menu-title">Lý do đánh dấu</div>
                ${items}
                ${unmark}
            </div>
        </div>`;
}

// Cập nhật trạng thái đánh dấu của một câu theo lý do ('__unmark' để bỏ đánh dấu)
export function applyMark(idx, reason) {
    if (reason === '__unmark') {
        state.markedQuestions = state.markedQuestions.filter(i => i !== idx);
        delete state.markedReasons[idx];
    } else {
        if (!state.markedQuestions.includes(idx)) state.markedQuestions.push(idx);
        state.markedReasons[idx] = reason;
    }
    saveQuizState();
    // Lưu bền theo nội dung câu hỏi + đồng bộ cloud (cho trang Lịch sử)
    const q = state.questions[idx];
    if (q) persistMarkByText(q.question, reason);
}

// Nối sự kiện cho nút đánh dấu + menu lý do của câu hiện tại.
// (Đóng menu khi bấm ra ngoài được xử lý bởi 1 listener toàn cục đăng ký lúc DOMContentLoaded.)
export function setupMarkControl() {
    const markBtn = document.getElementById('mark-question-btn');
    const markMenu = document.getElementById('mark-menu');
    if (!markBtn || !markMenu) return;

    markBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = markMenu.classList.contains('hidden');
        markMenu.classList.toggle('hidden', !willOpen);
        markBtn.setAttribute('aria-expanded', String(willOpen));
    });

    markMenu.querySelectorAll('[data-mark-reason]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            applyMark(state.currentIndex, item.getAttribute('data-mark-reason'));
            showQuestion();
        });
    });
}

// ===== "Câu đã đánh dấu" trong bảng thiết lập (góc trái) =====
// Rút gọn nội dung câu hỏi (bỏ markdown/latex, escape HTML) để hiện preview gọn trong danh sách.
function plainSnippet(str, max = 52) {
    let s = String(str || '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')   // ảnh markdown
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')  // [text](url) -> text
        .replace(/[`*_#>~$]/g, '')                // ký hiệu markdown/latex
        .replace(/\s+/g, ' ')
        .trim();
    if (s.length > max) s = s.slice(0, max).trim() + '…';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Dựng lại danh sách câu đã đánh dấu + số đếm; ẩn cả khối khi chưa đánh dấu câu nào.
export function refreshMarkedPanel() {
    const control = document.getElementById('marked-control');
    const panel = document.getElementById('marked-list-panel');
    const badge = document.getElementById('marked-count-badge');
    if (!control || !panel) return;

    const marked = [...state.markedQuestions].sort((a, b) => a - b);
    if (badge) badge.textContent = String(marked.length);
    control.classList.toggle('hidden', marked.length === 0);
    if (marked.length === 0) {
        panel.innerHTML = '';
        panel.classList.add('hidden');
        const tb = document.getElementById('marked-list-btn');
        if (tb) tb.setAttribute('aria-expanded', 'false');
        return;
    }

    panel.innerHTML = marked.map(idx => {
        const q = state.questions[idx];
        const rk = state.markedReasons[idx] || 'review';
        const r = MARK_REASONS[rk] || MARK_REASONS.review;
        const answered = state.userAnswers[idx] !== null && state.userAnswers[idx] !== undefined;
        const isCurrent = idx === state.currentIndex;
        const snippet = plainSnippet(q && q.question);
        return `
            <div class="qs-marked-item ${isCurrent ? 'qs-marked-current' : ''}" data-marked-idx="${idx}" role="menuitem" tabindex="0" title="Tới câu ${idx + 1}">
                <span class="qs-marked-num" style="background:${r.color}">${idx + 1}</span>
                <span class="qs-marked-body">
                    <span class="qs-marked-reason" style="color:${r.text}"><i class="fas ${r.icon}"></i> ${r.short}${answered ? '' : ' · <span class="qs-marked-todo">chưa làm</span>'}</span>
                    <span class="qs-marked-text">${snippet || 'Câu ' + (idx + 1)}</span>
                </span>
                <button type="button" class="qs-marked-unmark" data-unmark-idx="${idx}" title="Bỏ đánh dấu câu ${idx + 1}" aria-label="Bỏ đánh dấu câu ${idx + 1}"><i class="fas fa-times"></i></button>
            </div>`;
    }).join('');
}

// Nối sự kiện cho khối "Câu đã đánh dấu" (gọi 1 lần lúc khởi tạo; dùng ủy quyền sự kiện).
export function setupMarkedList() {
    const toggleBtn = document.getElementById('marked-list-btn');
    const panel = document.getElementById('marked-list-panel');
    const pop = document.getElementById('quiz-settings-popover');
    if (!toggleBtn || !panel) return;

    // Mở/đóng danh sách trong popover (không đóng popover)
    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = panel.classList.contains('hidden');
        panel.classList.toggle('hidden', !willOpen);
        toggleBtn.setAttribute('aria-expanded', String(willOpen));
        if (willOpen) {
            // Cuộn mục câu hiện tại vào tầm nhìn nếu có
            const cur = panel.querySelector('.qs-marked-current');
            if (cur) cur.scrollIntoView({ block: 'nearest' });
        }
    });

    const jumpTo = (idx) => {
        if (isNaN(idx)) return;
        state.currentIndex = idx;
        if (pop) pop.classList.add('hidden-pop');     // đóng popover sau khi nhảy câu
        showQuestion();
    };

    panel.addEventListener('click', (e) => {
        e.stopPropagation();
        const unmarkBtn = e.target.closest('[data-unmark-idx]');
        if (unmarkBtn) {
            const idx = parseInt(unmarkBtn.getAttribute('data-unmark-idx'), 10);
            applyMark(idx, '__unmark');
            // Giữ popover & danh sách đang mở; cập nhật lại nav + thẻ câu hiện tại
            showQuestion();
            showToast('Đã bỏ đánh dấu câu ' + (idx + 1));
            return;
        }
        const item = e.target.closest('[data-marked-idx]');
        if (item) jumpTo(parseInt(item.getAttribute('data-marked-idx'), 10));
    });

    // Bàn phím: Enter/Space để nhảy tới câu đang focus
    panel.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const item = e.target.closest('[data-marked-idx]');
        if (item) {
            e.preventDefault();
            e.stopPropagation();   // không để lọt xuống phím tắt làm bài toàn cục
            jumpTo(parseInt(item.getAttribute('data-marked-idx'), 10));
        }
    });
}
