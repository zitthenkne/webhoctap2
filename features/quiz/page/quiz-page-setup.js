// File: features/quiz/page/quiz-page-setup.js
// Nối các khối điều khiển của trang làm bài: bảng thiết lập nổi, cỡ chữ, chế độ tập trung,
// ẩn/hiện bảng số câu, kéo giãn 3 cột, vuốt / chạm rìa chuyển câu (mobile), lightbox ảnh.
// Tách từ quiz-page.js — logic giữ nguyên.

import { showToast } from '../../../core/utils.js';
import { state, saveQuizState } from '../quiz-state.js';
import { toggleFocusMode } from '../quiz-ui.js';
import { startTimer, stopTimer } from './quiz-session.js';
import {
    getTheme, getSound, getVibrate, getBgOpacity, applyBgOpacity, getNotesInline, applyNotesInline
} from './quiz-page-prefs.js';
import {
    PACKS, GROUPS, setSound, getPack, setPack, getVolume, setVolume, isGroupOn, setGroupOn, previewSound, sfx,
    AMBIENTS, getAmbient, setAmbient, getAmbientVol, setAmbientVol, syncAmbient
} from './quiz-sound.js';
import { getCatMemeEnabled, setMemeEnabled } from './quiz-cat-meme.js';
import { showQuestion, showNextQuestion, showPreviousQuestion } from './quiz-question-view.js';
import { isAutoNextOn, setAutoNext, setupAutoNextGuards } from './quiz-auto-next.js';

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
        toggleBtn.onclick = function () {
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
    if (focusModeBtn) focusModeBtn.onclick = handleToggleFocusMode;
}

// --- #13 (bổ sung): phóng to ảnh trong đề ---
export function setupLightbox() {
    const lb = document.getElementById('img-lightbox');
    if (!lb) return;
    const lbImg = lb.querySelector('img');
    document.addEventListener('click', (e) => {
        const img = e.target.closest && e.target.closest('img.quiz-image, .svg-fig img');
        // Hình NẰM TRONG phương án (vd. chọn băng CTG đúng): chưa trả lời thì bấm hình = chọn đáp án, trả lời rồi mới phóng to.
        // Nghe ở pha CAPTURE: chạy TRƯỚC nút phương án — pha nổi bọt thì nút đã tự khóa xong, lần chọn nào cũng bật phóng to.
        if (img && img.closest('.answer-btn:not(.answer-locked)')) return;
        if (img) {
            lbImg.src = img.src;
            lb.classList.remove('hidden');
            requestAnimationFrame(() => lb.classList.add('show'));
        }
    }, true);
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
    const rowMin = document.getElementById('qs-min');
    const rowSound = document.getElementById('qs-sound');
    const rowVibrate = document.getElementById('qs-vibrate');
    const rowMeme = document.getElementById('qs-meme');
    const rowAutoNext = document.getElementById('qs-auto-next');
    const rowTimed = document.getElementById('qs-timed');
    const rowNotes = document.getElementById('qs-notes-inline');
    const rowShowAns = document.getElementById('qs-show-answer');
    const bgOpacityInput = document.getElementById('qs-bg-opacity');
    const rowShuffleBg = document.getElementById('qs-shuffle-bg');
    if (!fab || !pop) return;
    setupAutoNextGuards(); // chạm/cuộn/gõ phím ở bất kỳ đâu đều hủy đếm ngược tự chuyển câu

    const soundDetail = document.getElementById('qs-sound-detail');
    const packSel = document.getElementById('qs-sound-pack');
    const volInput = document.getElementById('qs-sound-vol');
    const groupBox = document.getElementById('qs-sound-groups');
    if (packSel) packSel.innerHTML = PACKS.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    if (groupBox) groupBox.innerHTML = GROUPS.map(g => `<button type="button" class="qs-sg" data-sg="${g.id}" aria-pressed="true">${g.name}</button>`).join('');
    const ambSel = document.getElementById('qs-amb');
    const ambVol = document.getElementById('qs-amb-vol');
    const ambVolRow = document.getElementById('qs-amb-vol-row');
    if (ambSel) ambSel.innerHTML = AMBIENTS.map(a => `<option value="${a.id}">${a.name}</option>`).join('');

    const sync = () => {
        if (rowDark) rowDark.setAttribute('aria-checked', getTheme() === 'dark');
        if (rowMin) rowMin.setAttribute('aria-checked', document.documentElement.classList.contains('ui-min'));
        if (rowSound) rowSound.setAttribute('aria-checked', getSound());
        if (soundDetail) soundDetail.hidden = !getSound();
        if (packSel) packSel.value = getPack();
        if (groupBox) groupBox.querySelectorAll('[data-sg]').forEach(b => { const on = isGroupOn(b.dataset.sg); b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
        if (volInput) volInput.value = getVolume();
        if (ambSel) ambSel.value = getAmbient();
        if (ambVol) ambVol.value = getAmbientVol();
        if (ambVolRow) ambVolRow.hidden = getAmbient() === 'off';
        if (rowVibrate) rowVibrate.setAttribute('aria-checked', getVibrate());
        if (rowMeme) rowMeme.setAttribute('aria-checked', getCatMemeEnabled());
        if (rowAutoNext) rowAutoNext.setAttribute('aria-checked', isAutoNextOn());
        if (rowTimed) rowTimed.setAttribute('aria-checked', !!state.quizOptions.isTimed);
        if (rowNotes) rowNotes.setAttribute('aria-checked', getNotesInline());
        applyNotesInline();
        if (rowShowAns) rowShowAns.setAttribute('aria-checked', !!state.quizOptions.showAnswerImmediately);
        if (bgOpacityInput) bgOpacityInput.value = getBgOpacity();
        applyBgOpacity(getBgOpacity());
    };
    sync();

    // sync() lại mỗi lần mở bảng: isTimed/showAnswerImmediately được gán lúc BẮT ĐẦU
    // phiên (sau khi setupSettings chạy) nên trạng thái công tắc phải đọc lại từ state.
    fab.addEventListener('click', (e) => { e.stopPropagation(); sync(); pop.classList.toggle('hidden-pop'); });
    document.addEventListener('click', (e) => {
        if (!pop.classList.contains('hidden-pop') && !pop.contains(e.target) && e.target !== fab && !fab.contains(e.target)) {
            pop.classList.add('hidden-pop');
        }
    });

    const setLS = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };
    if (rowDark) rowDark.addEventListener('click', () => {
        const dark = getTheme() !== 'dark';
        setLS('quiz_theme', dark ? 'dark' : 'light');
        document.documentElement.classList.toggle('theme-dark', dark);
        sync();
    });
    if (rowMin) rowMin.addEventListener('click', () => {         // giao diện tinh gọn: class + nhớ theo máy (quiz-min.css)
        const on = document.documentElement.classList.toggle('ui-min');
        setLS('quiz_minimal', on ? '1' : '0');
        window.dispatchEvent(new Event('resize'));
        sync();
    });
    if (rowSound) rowSound.addEventListener('click', () => {
        const on = !getSound();
        setSound(on);
        if (on) previewSound(); // nghe thử bộ âm đang chọn
        sync();
    });
    // Chi tiết âm thanh: đổi bộ âm / phạm vi → nghe thử ngay; kéo âm lượng → mỗi cữ một tiếng "tách" để biết to nhỏ
    const keepOpen = (el) => el && el.addEventListener('click', (e) => e.stopPropagation());
    [packSel, groupBox, volInput].forEach(keepOpen);
    if (packSel) packSel.addEventListener('change', () => { setPack(packSel.value); previewSound(packSel.value); });
    if (groupBox) groupBox.addEventListener('click', (e) => {
        const b = e.target.closest('[data-sg]');
        if (!b) return;
        const g = GROUPS.find(x => x.id === b.dataset.sg), on = !isGroupOn(g.id);
        setGroupOn(g.id, on);
        sync();
        if (on) sfx(g.demo, { force: true, streak: 3, pct: 85, remaining: 4 });   // bật lại nhóm nào nghe thử ngay tiếng đại diện của nhóm đó
    });
    if (volInput) {
        volInput.addEventListener('input', () => { setVolume(+volInput.value); sfx('pick', { force: true }); });
    }
    document.getElementById('qs-sound-test')?.addEventListener('click', (e) => { e.stopPropagation(); previewSound(); });
    // Âm nền: đang làm bài thì phát tiếp ngay; ở trang chờ chỉ nghe thử 4 giây
    const ambApply = () => {
        const live = document.body.classList.contains('quiz-active');
        syncAmbient(true);
        if (!live) setTimeout(() => { if (!document.body.classList.contains('quiz-active')) syncAmbient(false); }, 4000);
    };
    [ambSel, ambVol].forEach(keepOpen);
    if (ambSel) ambSel.addEventListener('change', () => { setAmbient(ambSel.value); sync(); ambApply(); });
    if (ambVol) ambVol.addEventListener('input', () => { setAmbientVol(+ambVol.value); if (getAmbient() !== 'off') ambApply(); });
    if (rowVibrate) rowVibrate.addEventListener('click', () => {
        const on = !getVibrate();
        setLS('quiz_vibrate', on ? '1' : '0');
        if (on && navigator.vibrate) navigator.vibrate(20);
        sync();
    });
    if (rowNotes) rowNotes.addEventListener('click', () => {
        setLS('quiz_notes_inline', getNotesInline() ? '0' : '1');
        sync();
    });
    if (rowMeme) rowMeme.addEventListener('click', () => {
        setMemeEnabled(!getCatMemeEnabled()); // lưu cục bộ + đồng bộ ô gạt ở trang thiết lập
        showToast(getCatMemeEnabled() ? '🤡 Đã bật chế độ meme' : '🤡 Đã tắt chế độ meme');
        sync();
    });
    if (rowAutoNext) rowAutoNext.addEventListener('click', () => {
        const on = !isAutoNextOn();
        setAutoNext(on);
        showToast(on
            ? '⏭️ Trả lời đúng sẽ tự sang câu sau — chạm bất kỳ đâu để ở lại'
            : 'Đã tắt tự chuyển câu');
        sync();
    });

    // --- Bật/tắt TÍNH GIỜ ngay giữa phiên làm bài ---
    // Bật: đếm ngược MỚI từ bây giờ theo số phút đã cấu hình (hoặc gợi ý theo số câu).
    // Tắt: dừng + ẩn đồng hồ, bài không còn tự nộp khi hết giờ.
    if (rowTimed) rowTimed.addEventListener('click', () => {
        const on = !state.quizOptions.isTimed;
        state.quizOptions.isTimed = on;
        if (on) {
            let mins = parseInt(state.quizOptions.timedMinutes, 10);
            if (isNaN(mins) || mins <= 0) {
                mins = Math.max(1, Math.ceil((state.questions.length || 0) / 2 + 10));
                state.quizOptions.timedMinutes = mins;
            }
            startTimer(mins * 60);
            showToast(`⏱️ Đã bật tính giờ: ${mins} phút, đếm từ bây giờ`);
        } else {
            stopTimer();
            showToast('Đã tắt tính giờ — làm bài thoải mái nhé');
        }
        saveQuizState(); // nhớ vào bản lưu bài dở để khôi phục đúng chế độ
        sync();
    });

    // --- Bật/tắt XEM ĐÁP ÁN NGAY ngay giữa phiên làm bài ---
    // Vẽ lại câu hiện tại + bảng số câu để phản ánh chế độ mới (câu đã trả lời sẽ
    // hiện/giấu đúng-sai tương ứng). Điểm cuối luôn được chấm lại từ userAnswers
    // trong endQuiz nên đổi chế độ giữa chừng không làm sai điểm.
    if (rowShowAns) rowShowAns.addEventListener('click', () => {
        if (state.quizMode === 'srs') {
            showToast('Chế độ ôn ngắt quãng luôn hiện đáp án ngay để chấm lịch ôn.', 'info');
            return;
        }
        const on = !state.quizOptions.showAnswerImmediately;
        state.quizOptions.showAnswerImmediately = on;
        showToast(on ? '👀 Đáp án + giải thích sẽ hiện ngay sau mỗi câu' : '📝 Đáp án sẽ chỉ hiện khi nộp bài');
        saveQuizState();
        const quizContainer = document.getElementById('quiz-container');
        if (quizContainer && !quizContainer.classList.contains('hidden') && state.questions.length) {
            showQuestion();
        }
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
    nav: { min: 120, max: 320, key: 'quiz_nav_w', cssVar: '--quiz-nav-w', panelId: 'quiz-nav-panel' },
    note: { min: 150, max: 380, key: 'quiz_note_w', cssVar: '--quiz-note-w', panelId: 'quiz-note-panel' }
};

// Xích bảng số câu / ghi chú LÊN–XUỐNG (translateY), nhớ riêng theo thiết bị (px).
// Chỉ có tác dụng ở bố cục 3 cột (desktop) nơi hai bảng là cột sticky.
const PANEL_OFFSET = {
    nav: { min: -140, max: 600, key: 'quiz_nav_y', cssVar: '--quiz-nav-y' },
    note: { min: -140, max: 600, key: 'quiz_note_y', cssVar: '--quiz-note-y' }
};

function applyStoredColumnWidths() {
    const ws = document.getElementById('quiz-workspace');
    if (!ws) return;
    [...Object.values(COLUMN_RESIZE), ...Object.values(PANEL_OFFSET)].forEach(cfg => {
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
    [...Object.values(COLUMN_RESIZE), ...Object.values(PANEL_OFFSET)].forEach(cfg => {
        ws.style.removeProperty(cfg.cssVar);
        try { localStorage.removeItem(cfg.key); } catch (e) { }
    });
    try { localStorage.removeItem(caseHeightKey()); } catch (e) { }
    applyCaseHeight();
}

// Chiều cao phần nội dung khung ca chùm (#case-body): kéo tay nắm ⠿ ở mép dưới khung ca.
// Khung ca vẽ lại mỗi câu -> giá trị đặt thành biến --case-h trên <html>; lưu riêng máy tính / điện thoại
// (điện thoại mặc định KHÔNG giới hạn chiều cao, chỉ khi người dùng kéo mới có khung cuộn).
const CASE_MIN_H = 96;
const caseHeightKey = () => (window.innerWidth <= 640 ? 'quiz_case_h_m' : 'quiz_case_h');
function applyCaseHeight(px) {
    const root = document.documentElement;
    let v = px;
    if (v === undefined) { try { v = parseInt(localStorage.getItem(caseHeightKey()), 10); } catch (e) { v = NaN; } }
    if (v > 0) {
        root.style.setProperty('--case-h', Math.max(CASE_MIN_H, Math.round(v)) + 'px');
        root.classList.add('case-h-set');
    } else {
        root.style.removeProperty('--case-h');
        root.classList.remove('case-h-set');
    }
}
function setupCaseResize() {
    applyCaseHeight();
    let resizeTimer = null;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => applyCaseHeight(), 150); });
    let startY = 0, startH = 0, maxH = 0, body = null;
    const clampH = (h) => Math.max(CASE_MIN_H, Math.min(maxH, h));
    const onMove = (e) => { if (body) applyCaseHeight(clampH(startH + (e.clientY - startY))); };
    const onUp = () => {
        if (body) {
            const v = parseInt(document.documentElement.style.getPropertyValue('--case-h'), 10);
            try { if (v > 0) localStorage.setItem(caseHeightKey(), String(v)); } catch (e) { }
        }
        body = null;
        document.body.classList.remove('quiz-resizing', 'case-resizing');
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
    };
    document.addEventListener('pointerdown', (e) => {
        const grip = e.target.closest && e.target.closest('.case-resize');
        body = grip && document.getElementById('case-body');
        if (!body || body.classList.contains('hidden')) { body = null; return; }
        e.preventDefault();
        startY = e.clientY;
        startH = body.getBoundingClientRect().height;
        // Kéo quá chiều cao nội dung thì vô nghĩa; trần là 85% màn hình
        maxH = Math.max(CASE_MIN_H, Math.min(window.innerHeight * 0.85, body.scrollHeight));
        document.body.classList.add('quiz-resizing', 'case-resizing');
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    });
    // Bấm đúp tay nắm: về chiều cao mặc định
    document.addEventListener('dblclick', (e) => {
        if (!(e.target.closest && e.target.closest('.case-resize'))) return;
        try { localStorage.removeItem(caseHeightKey()); } catch (err) { }
        applyCaseHeight();
    });
    // Bàn phím: ↑/↓ chỉnh từng nấc 40px, Home về mặc định
    document.addEventListener('keydown', (e) => {
        const grip = e.target.closest && e.target.closest('.case-resize');
        const b = grip && document.getElementById('case-body');
        if (!b || !['ArrowUp', 'ArrowDown', 'Home'].includes(e.key)) return;
        e.preventDefault();
        e.stopPropagation();   // không để phím mũi tên / Home lọt xuống phím tắt chuyển câu
        if (e.key === 'Home') { try { localStorage.removeItem(caseHeightKey()); } catch (err) { } applyCaseHeight(); return; }
        const cap = Math.max(CASE_MIN_H, Math.min(window.innerHeight * 0.85, b.scrollHeight));
        const h = Math.max(CASE_MIN_H, Math.min(cap, b.getBoundingClientRect().height + (e.key === 'ArrowDown' ? 40 : -40)));
        applyCaseHeight(h);
        try { localStorage.setItem(caseHeightKey(), String(Math.round(h))); } catch (err) { }
    }, true);
}

// Kéo grip trên mỗi bảng để xích lên/xuống. Grip nằm trong HTML được vẽ lại mỗi câu
// nên phải ủy thác sự kiện ở #quiz-workspace (phần tử KHÔNG bị vẽ lại).
function setupPanelOffsetDrag() {
    const ws = document.getElementById('quiz-workspace');
    if (!ws) return;
    let cfg = null, startY = 0, startVal = 0;
    const onMove = (e) => {
        if (!cfg) return;
        let v = Math.max(cfg.min, Math.min(cfg.max, startVal + (e.clientY - startY)));
        ws.style.setProperty(cfg.cssVar, Math.round(v) + 'px');
    };
    const onUp = () => {
        if (cfg) {
            const v = parseInt(ws.style.getPropertyValue(cfg.cssVar), 10) || 0;
            try { localStorage.setItem(cfg.key, String(v)); } catch (e) { }
        }
        cfg = null;
        document.body.classList.remove('quiz-resizing', 'dragging-panel-y');
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);   // iOS hay bắn pointercancel thay vì pointerup (cuộn/cử chỉ hệ thống chen vào)
    };
    ws.addEventListener('pointerdown', (e) => {
        const grip = e.target.closest && e.target.closest('.quiz-panel-drag');
        if (!grip) return;
        if (window.innerWidth < 1024 || document.body.classList.contains('focus-mode-active')) return;
        cfg = PANEL_OFFSET[grip.getAttribute('data-panel')];
        if (!cfg) return;
        e.preventDefault();
        startY = e.clientY;
        startVal = parseInt(ws.style.getPropertyValue(cfg.cssVar), 10) || 0;
        document.body.classList.add('quiz-resizing', 'dragging-panel-y');
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    });
    // Bấm đúp grip: trả bảng này về vị trí mặc định
    ws.addEventListener('dblclick', (e) => {
        const grip = e.target.closest && e.target.closest('.quiz-panel-drag');
        if (!grip) return;
        const c = PANEL_OFFSET[grip.getAttribute('data-panel')];
        if (!c) return;
        ws.style.removeProperty(c.cssVar);
        try { localStorage.removeItem(c.key); } catch (e) { }
    });
}

export function setupResizers() {
    const ws = document.getElementById('quiz-workspace');
    if (!ws) return;
    applyStoredColumnWidths();
    setupPanelOffsetDrag();
    setupCaseResize();

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
            window.removeEventListener('pointercancel', onPointerUp);
            try { localStorage.setItem(cfg.key, String(Math.round(panel.getBoundingClientRect().width))); } catch (e) { }
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
            window.addEventListener('pointercancel', onPointerUp);
        });
        // Bấm đúp tay kéo: trả riêng cột này về mặc định
        handle.addEventListener('dblclick', () => {
            ws.style.removeProperty(cfg.cssVar);
            try { localStorage.removeItem(cfg.key); } catch (e) { }
        });
    });

    const resetBtn = document.getElementById('reset-layout-btn');
    if (resetBtn) resetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetColumnWidths();
        showToast('Đã khôi phục bố cục mặc định');
    });
}

// --- Luật chung cho cử chỉ chuyển câu (vuốt / chạm rìa): một cú chạm chỉ là MỘT việc ---
// Ghi lần cuối có gì đó cuộn (capture để bắt cả khung cuộn con: bảng, ca lâm sàng...).
let lastScrollAt = 0;
window.addEventListener('scroll', () => { lastScrollAt = Date.now(); }, { capture: true, passive: true });

// true = cú chạm này KHÔNG được hiểu là chuyển câu.
function touchNavBlocked(target) {
    // Đang phóng to 2 ngón: kéo 1 ngón là để dịch khung nhìn (tọa độ rìa cũng không còn đúng)
    if (window.visualViewport && window.visualViewport.scale > 1.05) return true;
    // Có lớp nổi đang mở -> chạm ra ngoài là để ĐÓNG nó, không phải chuyển câu
    if (document.querySelector('#quiz-settings-popover:not(.hidden-pop), #mark-menu:not(.hidden), #qmn-mark-menu:not(.hidden), #annot-toolbar.show')) return true;
    // Chạm trên lớp nổi (modal, thanh đáy, nút nổi, logo góc...) hoặc trong vùng cuộn ngang (bảng/hình rộng)
    for (let el = target; el && el !== document.body; el = el.parentElement) {
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed') return true;
        if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) return true;
    }
    return false;
}

// --- #3: vuốt trái/phải để chuyển câu (mobile) ---
export function setupSwipe() {
    const section = document.getElementById('quizSection');
    if (!section) return;
    let startX = 0, startY = 0, startT = 0, startTarget = null, tracking = false;
    section.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) { tracking = false; return; }
        // Không cướp thao tác trên vùng cần tương tác / chọn chữ
        if (e.target.closest('button, a, textarea, input, label, summary, [role="separator"], .answer-btn, table, .question-text, mark, .quiz-annot, .quiz-image, .mermaid')) {
            tracking = false; return;
        }
        const x = e.touches[0].clientX;
        // Bắt đầu sát mép = cử chỉ "Quay lại" của hệ điều hành/trình duyệt -> nhường nó
        if (x < 24 || x > window.innerWidth - 24) { tracking = false; return; }
        // Trang còn trôi quán tính: ngón chạm vào là để dừng cuộn
        if (Date.now() - lastScrollAt < 150) { tracking = false; return; }
        tracking = true;
        startX = x;
        startY = e.touches[0].clientY;
        startT = Date.now();
        startTarget = e.target;
    }, { passive: true });
    section.addEventListener('touchend', (e) => {
        if (!tracking) return;
        tracking = false;
        const t = e.changedTouches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        // Phải NGANG rõ (gấp đôi độ lệch dọc), đủ dài & dứt khoát (kéo chậm là đang đọc/kéo chọn)
        if (Math.abs(dx) < 60 || Math.abs(dy) > 45 || Math.abs(dx) < 2 * Math.abs(dy)) return;
        if (Date.now() - startT > 700) return;
        if (lastScrollAt > startT) return; // trình duyệt đã hiểu là CUỘN -> không chuyển câu nữa
        if (window.getSelection && window.getSelection().toString().trim()) return; // đang chọn chữ
        if (touchNavBlocked(startTarget)) return;
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
    // Dải chạm HẸP sát mép (~6% màn hình, 24–40px). Nhỏ nên hiếm khi đè lên chỗ
    // người dùng nhắm để CHỌN đáp án (họ nhắm chữ/giữa ô), nhưng đủ để "chạm rìa".
    const edgeWidth = () => Math.max(24, Math.min(40, window.innerWidth * 0.06));
    let sx = 0, sy = 0, st = 0, tracking = false, side = 0;

    // Gợi ý trực quan: lóe một mũi tên ở rìa vừa chạm -> cảm giác "ăn" & dạy chỗ chạm.
    let hintEl = null;
    const flashHint = (leftSide) => {
        if (!hintEl) {
            hintEl = document.createElement('div');
            hintEl.className = 'edge-tap-hint';
            hintEl.innerHTML = '<i class="fas fa-chevron-left"></i>';
            document.body.appendChild(hintEl);
        }
        hintEl.classList.toggle('is-left', leftSide);
        hintEl.classList.toggle('is-right', !leftSide);
        hintEl.querySelector('i').className = leftSide ? 'fas fa-chevron-left' : 'fas fa-chevron-right';
        hintEl.classList.remove('show');
        void hintEl.offsetWidth; // reset animation
        hintEl.classList.add('show');
    };

    const canNav = () => window.innerWidth < 1024
        && document.body.classList.contains('quiz-active')
        && !document.body.classList.contains('focus-mode-active')
        && !document.body.classList.contains('qjs-open'); // bảng nhảy câu đang mở

    document.addEventListener('touchstart', (e) => {
        tracking = false;
        if (!canNav() || e.touches.length !== 1) return;
        const x = e.touches[0].clientX;
        const ew = edgeWidth();
        if (x > ew && x < window.innerWidth - ew) return; // không phải rìa
        // Chỉ chừa CHROME thật + vùng cần vuốt/gõ ngang (ảnh, bảng, ô nhập). Đáp án
        // KHÔNG còn bị chừa: chạm sát rìa luôn là chuyển câu, và ta chặn luôn cú click
        // tổng hợp bên dưới -> hết cảnh "định chuyển câu mà bấm nhầm đáp án".
        // Nút/điều khiển KHÁC đáp án nằm sát rìa (gập thẻ, ghi chú, kéo khung...) -> bấm là bấm nút đó.
        if (e.target.closest('a, textarea, input, select, label, summary, button:not(.answer-btn), [role="separator"], .quiz-image, .mermaid, table, #quiz-settings-popover, #quiz-settings-fab, #quiz-mobile-menu, #quiz-mobile-nav, .qjs-sheet')) return;
        // Trang còn trôi quán tính: chạm rìa là để DỪNG cuộn, không phải chuyển câu
        if (Date.now() - lastScrollAt < 150) return;
        if (touchNavBlocked(e.target)) return;
        tracking = true;
        side = x <= ew ? -1 : 1;
        sx = x; sy = e.touches[0].clientY; st = Date.now();
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (!tracking) return;
        tracking = false;
        const t = e.changedTouches[0];
        // Cú CHẠM dứt khoát: nhanh & gần như không nhích (khỏi lẫn với vuốt/cuộn, và luôn
        // ngắn hơn hẳn cú giữ-để-gạch đáp án 500ms -> không bao giờ vừa gạch vừa chuyển câu)
        if (Date.now() - st > 300) return;
        if (lastScrollAt > st) return; // ngón có làm trang cuộn -> là cuộn
        if (Math.abs(t.clientX - sx) > 14 || Math.abs(t.clientY - sy) > 14) return;
        if (window.getSelection && window.getSelection().toString().trim()) return; // đang chọn chữ

        const goPrev = side < 0 && state.currentIndex > 0 && state.quizMode !== 'practice';
        const goNext = side > 0 && state.currentIndex < state.questions.length - 1;
        if (!goPrev && !goNext) return; // ở đầu/cuối: không làm gì, cũng KHÔNG nuốt click

        // Nuốt cú click tổng hợp mà trình duyệt bắn ra sau touch (nếu ngón nằm trên đáp án)
        // -> chuyển câu chứ không chọn nhầm đáp án. Tự gỡ sau 350ms nếu chẳng có click nào.
        const kill = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
        document.addEventListener('click', kill, { capture: true, once: true });
        setTimeout(() => document.removeEventListener('click', kill, true), 350);

        if (getVibrate() && navigator.vibrate) navigator.vibrate(10);
        if (goPrev) { flashHint(true); showPreviousQuestion(); }
        else { flashHint(false); showNextQuestion(); }
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
