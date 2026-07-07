// File: features/quiz/page/quiz-page-prefs.js
// Thiết lập cá nhân của trang làm bài (Dark / Âm thanh / Rung / độ rõ ảnh nền) lưu trong localStorage,
// kèm phản hồi rung + âm thanh khi trả lời và cuộn mượt lên đầu trang.
// Tách từ quiz-page.js — logic giữ nguyên.

export function getTheme()   { try { return localStorage.getItem('quiz_theme') || 'light'; } catch (e) { return 'light'; } }
export function getSound()   { try { return localStorage.getItem('quiz_sound') === '1'; } catch (e) { return false; } }
export function getVibrate() { try { return localStorage.getItem('quiz_vibrate') !== '0'; } catch (e) { return true; } } // mặc định BẬT
export function getBgOpacity() { // % độ rõ ảnh nền, 0–60, mặc định 28
    try { const v = parseInt(localStorage.getItem('quiz_bg_opacity'), 10); return isNaN(v) ? 28 : Math.max(0, Math.min(60, v)); }
    catch (e) { return 28; }
}
export function applyBgOpacity(pct) { document.documentElement.style.setProperty('--quiz-bg-opacity', pct / 100); }

// --- #15: Phản hồi rung + âm thanh nhẹ khi trả lời ---
let _audioCtx = null;
export function playTone(isCorrect) {
    try {
        _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const ctx = _audioCtx;
        const now = ctx.currentTime;
        const notes = isCorrect ? [660, 880] : [300, 200];
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const t = now + i * 0.09;
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(0.06, t + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.18);
        });
    } catch (e) { /* trình duyệt không hỗ trợ WebAudio -> bỏ qua */ }
}
export function feedback(isCorrect) {
    if (getVibrate() && navigator.vibrate) navigator.vibrate(isCorrect ? 18 : [25, 35, 25]);
    if (getSound()) playTone(isCorrect);
}

// --- Cuộn mượt lên đầu trang khi chuyển sang câu khác (nội dung câu luôn nằm gọn ở giữa màn) ---
export function scrollQuizToTop() {
    try {
        const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    } catch (e) { try { window.scrollTo(0, 0); } catch (_) {} }
}
