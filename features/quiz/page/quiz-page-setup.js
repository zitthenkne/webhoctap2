// File: features/quiz/page/quiz-page-setup.js
// Nối các khối điều khiển của trang làm bài: bảng thiết lập nổi, cỡ chữ, chế độ tập trung,
// ẩn/hiện bảng số câu, kéo giãn 3 cột, vuốt / chạm rìa chuyển câu (mobile), lightbox ảnh.
// Tách từ quiz-page.js — logic giữ nguyên.

import { showToast } from '../../../core/utils.js';
import { state } from '../quiz-state.js';
import { toggleFocusMode } from '../quiz-ui.js';
import {
    getTheme, getSound, getVibrate, getBgOpacity, applyBgOpacity, playTone
} from './quiz-page-prefs.js';
import { getCatMemeEnabled, setMemeEnabled } from './quiz-cat-meme.js';
import { showQuestion, showNextQuestion, showPreviousQuestion } from './quiz-question-view.js';

let navVisible = true;

export function setNavVisibility(visible) {
    const navWrapper = document.getElementById('question-nav-wrapper');
    if (navWrapper) {
        navWrapper.style.display = visible ? '' : 'none';
    }
    const toggleBtn = document.getElementById('toggle-nav-btn');
    if (toggleBtn) {
        toggleBtn.innerHTML = visible
            ? '<span class="qs-label"><i class="fas fa-eye-slash"></i> Ẩn số câu hỏi</span>'
            : '<span class="qs-label"><i class="fas fa-eye"></i> Hiện số câu hỏi</span>';
    }
}

// Áp lại trạng thái ẩn/hiện bảng số câu mà người dùng đã chọn (gọi sau mỗi lần render câu hỏi)
export function applyNavVisibility() {
    setNavVisibility(navVisible);
}

export function attachToggleNavEvent() {
    const toggleBtn = document.getElementById('toggle-nav-btn');
    if (toggleBtn) {
        toggleBtn.onclick = function() {
            navVisible = !navVisible;
            setNavVisibility(navVisible);
        };
    }
}

function handleToggleFocusMode() {
    toggleFocusMode();
    const navWrapper = document.getElementById('question-nav-wrapper');
    if (state.focusMode) {
        if (navWrapper) navWrapper.style.display = 'none';
    } else {
        setNavVisibility(navVisible);
    }
}

export function setupFocusModeControls() {
    const focusModeBtn = document.getElementById('focus-mode-btn');
    const exitFocusBtn = document.getElementById('exit-focus-btn');
    if (focusModeBtn) focusModeBtn.onclick = handleToggleFocusMode;
    if (exitFocusBtn) exitFocusBtn.onclick = handleToggleFocusMode;
}

// --- #13 (bổ sung): phóng to ảnh trong đề ---
export function setupLightbox() {
    const lb = document.getElementById('img-lightbox');
    if (!lb) return;
    const lbImg = lb.querySelector('img');
    document.addEventListener('click', (e) => {
        const img = e.target.closest && e.target.closest('img.quiz-image');
        if (img) {
            lbImg.src = img.src;
            lb.classList.remove('hidden');
            requestAnimationFrame(() => lb.classList.add('show'));
        }
    });
    const close = () => {
        lb.classList.remove('show');
        setTimeout(() => { lb.classList.add('hidden'); lbImg.src = ''; }, 200);
    };
    lb.addEventListener('click', close);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !lb.classList.contains('hidden')) close(); });
}

// --- #1 + #15: bảng thiết lập nổi (Dark / Âm thanh / Rung) ---
export function setupSettings() {
    const fab = document.getElementById('quiz-settings-fab');
    const pop = document.getElementById('quiz-settings-popover');
    const rowDark = document.getElementById('qs-dark');
    const rowSound = document.getElementById('qs-sound');
    const rowVibrate = document.getElementById('qs-vibrate');
    const rowMeme = document.getElementById('qs-meme');
    const bgOpacityInput = document.getElementById('qs-bg-opacity');
    const rowShuffleBg = document.getElementById('qs-shuffle-bg');
    if (!fab || !pop) return;

    const sync = () => {
        if (rowDark) rowDark.setAttribute('aria-checked', getTheme() === 'dark');
        if (rowSound) rowSound.setAttribute('aria-checked', getSound());
        if (rowVibrate) rowVibrate.setAttribute('aria-checked', getVibrate());
        if (rowMeme) rowMeme.setAttribute('aria-checked', getCatMemeEnabled());
        if (bgOpacityInput) bgOpacityInput.value = getBgOpacity();
        applyBgOpacity(getBgOpacity());
    };
    sync();

    fab.addEventListener('click', (e) => { e.stopPropagation(); pop.classList.toggle('hidden-pop'); });
    document.addEventListener('click', (e) => {
        if (!pop.classList.contains('hidden-pop') && !pop.contains(e.target) && e.target !== fab && !fab.contains(e.target)) {
            pop.classList.add('hidden-pop');
        }
    });

    const setLS = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
    if (rowDark) rowDark.addEventListener('click', () => {
        const dark = getTheme() !== 'dark';
        setLS('quiz_theme', dark ? 'dark' : 'light');
        document.documentElement.classList.toggle('theme-dark', dark);
        sync();
    });
    if (rowSound) rowSound.addEventListener('click', () => {
        const on = !getSound();
        setLS('quiz_sound', on ? '1' : '0');
        if (on) playTone(true); // nghe thử
        sync();
    });
    if (rowVibrate) rowVibrate.addEventListener('click', () => {
        const on = !getVibrate();
        setLS('quiz_vibrate', on ? '1' : '0');
        if (on && navigator.vibrate) navigator.vibrate(20);
        sync();
    });
    if (rowMeme) rowMeme.addEventListener('click', () => {
        setMemeEnabled(!getCatMemeEnabled()); // lưu cục bộ + đồng bộ ô gạt ở trang thiết lập
        showToast(getCatMemeEnabled() ? '🤡 Đã bật chế độ meme' : '🤡 Đã tắt chế độ meme');
        sync();
    });
    if (bgOpacityInput) {
        // Áp ngay khi đang kéo cho cảm giác trực quan; lưu lại để nhớ cho bài sau
        bgOpacityInput.addEventListener('input', () => {
            const pct = Math.max(0, Math.min(60, parseInt(bgOpacityInput.value, 10) || 0));
            applyBgOpacity(pct);
            setLS('quiz_bg_opacity', String(pct));
        });
        // Không đóng popover khi tương tác với thanh trượt
        bgOpacityInput.addEventListener('click', (e) => e.stopPropagation());
    }
    if (rowShuffleBg) rowShuffleBg.addEventListener('click', (e) => {
        // Giữ popover mở để bấm đổi liên tục cho tới khi ưng ý
        e.stopPropagation();
        if (typeof window.shuffleQuizBg === 'function') {
            window.shuffleQuizBg();
            showToast('Đã đổi ảnh nền 🎨');
        }
    });
}

// --- Kéo giãn độ rộng 3 cột (số câu | bài làm | ghi chú), nhớ riêng theo thiết bị ---
// Mỗi cột bên có giới hạn min/max; bề rộng lưu vào localStorage (px) theo từng máy.
const COLUMN_RESIZE = {
    nav:  { min: 120, max: 320, key: 'quiz_nav_w',  cssVar: '--quiz-nav-w',  panelId: 'quiz-nav-panel' },
    note: { min: 150, max: 380, key: 'quiz_note_w', cssVar: '--quiz-note-w', panelId: 'quiz-note-panel' }
};

function applyStoredColumnWidths() {
    const ws = document.getElementById('quiz-workspace');
    if (!ws) return;
    Object.values(COLUMN_RESIZE).forEach(cfg => {
        let v = parseInt(localStorage.getItem(cfg.key), 10);
        if (!isNaN(v)) {
            v = Math.max(cfg.min, Math.min(cfg.max, v));
            ws.style.setProperty(cfg.cssVar, v + 'px');
        }
    });
}

function resetColumnWidths() {
    const ws = document.getElementById('quiz-workspace');
    if (!ws) return;
    Object.values(COLUMN_RESIZE).forEach(cfg => {
        ws.style.removeProperty(cfg.cssVar);
        try { localStorage.removeItem(cfg.key); } catch (e) {}
    });
}

export function setupResizers() {
    const ws = document.getElementById('quiz-workspace');
    if (!ws) return;
    applyStoredColumnWidths();

    ws.querySelectorAll('.quiz-resizer').forEach(handle => {
        const cfg = COLUMN_RESIZE[handle.getAttribute('data-resize')];
        if (!cfg) return;
        const panel = document.getElementById(cfg.panelId);
        if (!panel) return;
        const isNav = handle.getAttribute('data-resize') === 'nav';

        let startX = 0, startW = 0;
        const onPointerMove = (e) => {
            const delta = e.clientX - startX;
            // Kéo phải nới rộng cột số câu; cột ghi chú thì ngược lại
            let w = isNav ? startW + delta : startW - delta;
            w = Math.max(cfg.min, Math.min(cfg.max, w));
            ws.style.setProperty(cfg.cssVar, Math.round(w) + 'px');
        };
        const onPointerUp = () => {
            handle.classList.remove('is-dragging');
            document.body.classList.remove('quiz-resizing');
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            try { localStorage.setItem(cfg.key, String(Math.round(panel.getBoundingClientRect().width))); } catch (e) {}
        };
        handle.addEventListener('pointerdown', (e) => {
            // Chỉ kéo ở bố cục 3 cột (desktop), bỏ qua khi đang ở chế độ tập trung
            if (window.innerWidth < 1024 || document.body.classList.contains('focus-mode-active')) return;
            e.preventDefault();
            startX = e.clientX;
            startW = panel.getBoundingClientRect().width;
            handle.classList.add('is-dragging');
            document.body.classList.add('quiz-resizing');
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
        });
        // Bấm đúp tay kéo: trả riêng cột này về mặc định
        handle.addEventListener('dblclick', () => {
            ws.style.removeProperty(cfg.cssVar);
            try { localStorage.removeItem(cfg.key); } catch (e) {}
        });
    });

    const resetBtn = document.getElementById('reset-layout-btn');
    if (resetBtn) resetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetColumnWidths();
        showToast('Đã khôi phục độ rộng cột mặc định');
    });
}

// --- #3: vuốt trái/phải để chuyển câu (mobile) ---
export function setupSwipe() {
    const section = document.getElementById('quizSection');
    if (!section) return;
    let startX = 0, startY = 0, tracking = false;
    section.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) { tracking = false; return; }
        // Không cướp thao tác trên vùng cần tương tác / chọn chữ
        if (e.target.closest('button, a, textarea, input, .answer-btn, table, .question-text, mark, .quiz-annot, .quiz-image, .mermaid')) {
            tracking = false; return;
        }
        tracking = true;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    }, { passive: true });
    section.addEventListener('touchend', (e) => {
        if (!tracking) return;
        tracking = false;
        const t = e.changedTouches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        if (Math.abs(dx) < 60 || Math.abs(dy) > 45) return; // phải đủ ngang & dứt khoát
        if (window.getSelection && window.getSelection().toString().trim()) return; // đang chọn chữ
        if (dx < 0) {
            // vuốt sang trái -> câu tiếp (không nộp bài ở câu cuối)
            if (state.currentIndex < state.questions.length - 1) showNextQuestion();
        } else {
            // vuốt sang phải -> câu trước
            if (state.currentIndex > 0 && state.quizMode !== 'practice') showPreviousQuestion();
        }
    }, { passive: true });
}

// --- Chạm vào CẠNH trái/phải màn hình để chuyển câu (mobile) ---
// Không vẽ gì cả: chỉ lắng nghe cú chạm nhanh ở rìa màn hình, nên không che nội dung.
// Tự động "chừa" các nút/điều khiển nhờ kiểm tra closest() y như khi vuốt.
export function setupEdgeTap() {
    // Bề rộng vùng chạm ở mỗi rìa: ~9% màn hình, tối thiểu 34px, tối đa 64px
    const edgeWidth = () => Math.max(34, Math.min(64, window.innerWidth * 0.09));
    let sx = 0, sy = 0, st = 0, tracking = false;

    document.addEventListener('touchstart', (e) => {
        // Chỉ ở màn hình hẹp (mobile/tablet), và chỉ khi đang làm bài
        if (window.innerWidth >= 1024 || e.touches.length !== 1) { tracking = false; return; }
        if (!document.body.classList.contains('quiz-active')) { tracking = false; return; }
        if (document.body.classList.contains('focus-mode-active')) { tracking = false; return; }
        const x = e.touches[0].clientX;
        const ew = edgeWidth();
        // Chỉ quan tâm cú chạm bắt đầu ở rìa trái hoặc rìa phải
        if (x > ew && x < window.innerWidth - ew) { tracking = false; return; }
        // Chừa ra các nút bấm / vùng tương tác / chữ chọn được
        if (e.target.closest('button, a, textarea, input, select, label, .answer-btn, table, .question-text, mark, .quiz-annot, .quiz-image, .mermaid, .qs-row, #quiz-settings-popover, #quiz-settings-fab, #quiz-mobile-menu')) {
            tracking = false; return;
        }
        tracking = true;
        sx = x;
        sy = e.touches[0].clientY;
        st = Date.now();
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (!tracking) return;
        tracking = false;
        const t = e.changedTouches[0];
        // Phải là một cú CHẠM dứt khoát: nhanh & gần như không di chuyển (không phải vuốt/cuộn)
        if (Date.now() - st > 400) return;
        if (Math.abs(t.clientX - sx) > 12 || Math.abs(t.clientY - sy) > 12) return;
        if (window.getSelection && window.getSelection().toString().trim()) return; // đang chọn chữ
        if (sx <= edgeWidth()) {
            // Chạm rìa TRÁI -> câu trước
            if (state.currentIndex > 0 && state.quizMode !== 'practice') showPreviousQuestion();
        } else {
            // Chạm rìa PHẢI -> câu tiếp (không tự nộp bài ở câu cuối)
            if (state.currentIndex < state.questions.length - 1) showNextQuestion();
        }
    }, { passive: true });
}

export function setupFontSizeControls() {
    const btnSmall = document.getElementById('font-size-small');
    const btnNormal = document.getElementById('font-size-normal');
    const btnLarge = document.getElementById('font-size-large');
    if (!btnSmall || !btnNormal || !btnLarge) return;

    function updateActiveButton(size) {
        [btnSmall, btnNormal, btnLarge].forEach(btn => {
            btn.classList.remove('bg-pink-500', 'text-white');
            btn.classList.add('text-gray-600', 'hover:bg-pink-100');
        });
        let activeBtn = btnNormal;
        if (size === 'small') activeBtn = btnSmall;
        else if (size === 'large') activeBtn = btnLarge;

        activeBtn.classList.remove('text-gray-600', 'hover:bg-pink-100');
        activeBtn.classList.add('bg-pink-500', 'text-white');
    }

    updateActiveButton(state.currentFontSize);

    btnSmall.onclick = () => {
        state.currentFontSize = 'small';
        localStorage.setItem('quiz_font_size', 'small');
        updateActiveButton('small');
        const quizContainer = document.getElementById('quiz-container');
        if (quizContainer && !quizContainer.classList.contains('hidden')) {
            showQuestion();
        }
    };
    btnNormal.onclick = () => {
        state.currentFontSize = 'normal';
        localStorage.setItem('quiz_font_size', 'normal');
        updateActiveButton('normal');
        const quizContainer = document.getElementById('quiz-container');
        if (quizContainer && !quizContainer.classList.contains('hidden')) {
            showQuestion();
        }
    };
    btnLarge.onclick = () => {
        state.currentFontSize = 'large';
        localStorage.setItem('quiz_font_size', 'large');
        updateActiveButton('large');
        const quizContainer = document.getElementById('quiz-container');
        if (quizContainer && !quizContainer.classList.contains('hidden')) {
            showQuestion();
        }
    };
}
