// File: features/quiz/page/quiz-page-prefs.js
// Thiết lập cá nhân của trang làm bài (Dark / Âm thanh / Rung / độ rõ ảnh nền) lưu trong localStorage,
// kèm phản hồi rung + âm thanh khi trả lời và cuộn mượt lên đầu trang.
// Tách từ quiz-page.js — logic giữ nguyên.

import { sfx, getSound } from './quiz-sound.js';
export { sfx, getSound };   // chỗ gọi cũ vẫn import từ file này

export function getTheme()   { try { return localStorage.getItem('quiz_theme') || 'light'; } catch (e) { return 'light'; } }
export function getVibrate() { try { return localStorage.getItem('quiz_vibrate') !== '0'; } catch (e) { return true; } } // mặc định BẬT
export function getNotesInline() { try { return localStorage.getItem('quiz_notes_inline') !== '0'; } catch (e) { return true; } } // mặc định BẬT
export function applyNotesInline() { document.body.classList.toggle('qz-notes-inline', getNotesInline()); }
export function getBgOpacity() { // % độ rõ ảnh nền, 0–60, mặc định 40
    try { const v = parseInt(localStorage.getItem('quiz_bg_opacity'), 10); return isNaN(v) ? 40 : Math.max(0, Math.min(60, v)); }
    catch (e) { return 28; }
}
export function applyBgOpacity(pct) { document.documentElement.style.setProperty('--quiz-bg-opacity', pct / 100); }

// --- #15: Phản hồi rung + âm thanh khi trả lời (âm thanh: page/quiz-sound.js) ---
// streak = độ dài chuỗi đúng SAU câu này (0 nếu sai): chuỗi càng dài, âm càng cao + rung nhiều nhịp hơn.
// lost = chuỗi đang có TRƯỚC khi sai (≥3 thì thêm tiếng "đứt chuỗi").
export function feedback(isCorrect, streak = 0, lost = 0) {
    if (getVibrate() && navigator.vibrate) {
        navigator.vibrate(!isCorrect ? [25, 35, 25] : streak >= 5 ? [14, 30, 14, 30, 34] : streak >= 3 ? [14, 30, 24] : 18);
    }
    sfx(isCorrect ? 'correct' : 'wrong', { streak, lost });
}

// Vùng đọc cho trình đọc màn hình (aria-live, ẩn khỏi mắt): "Đúng. Chuỗi 3." / "Sai. Đáp án đúng là B." / "Câu 4 trên 12"
export function announce(text) {
    try {
        let el = document.getElementById('quiz-live');
        if (!el) {
            el = document.createElement('div');
            el.id = 'quiz-live';
            el.setAttribute('role', 'status');
            el.setAttribute('aria-live', 'polite');
            el.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;padding:0';
            document.body.appendChild(el);
        }
        el.textContent = '';
        setTimeout(() => { el.textContent = text; }, 30);   // xóa rồi đặt lại: cùng nội dung hai lần liền vẫn được đọc
    } catch (e) { }
}

// --- Cuộn lên đầu trang khi chuyển sang câu khác (nội dung câu luôn nằm gọn ở giữa màn) ---
// Cuộn mượt CHỈ khi quãng ngắn. Quãng xa (đang ở cuối thẻ có Mở rộng dài) thì nhảy thẳng: thẻ mới ngắn hơn
// nên trình duyệt đã kẹp vị trí cuộn xuống đáy trang — cuộn mượt từ đó sẽ lộ phần nền trơn bên dưới (lỗi iPad).
// PHẢI gọi SAU khi thẻ mới đã vẽ xong (cùng nhịp, chưa kịp tô khung hình nào).
export function scrollQuizTo(y) {
    try {
        const far = Math.abs(window.scrollY - y) > Math.min(260, window.innerHeight * 0.3);
        window.scrollTo({ top: y, behavior: far ? 'auto' : scrollBehaviorFor() });
    } catch (e) { try { window.scrollTo(0, y); } catch (_) {} }
}

// Cuộn mượt CHỈ khi dùng chuột. Trên máy cảm ứng (iPad/iPhone) WebKit khóa luôn thao tác kéo của người dùng trong lúc
// một hoạt ảnh cuộn đang chạy, và có lúc kẹt nếu nội dung đổi giữa chừng (thẻ giải thích vừa bung ra) -> trang "đứng",
// nút vẫn bấm được. Cảm ứng nhảy thẳng tới chỗ cần (nhanh hơn và không bao giờ kẹt).
export function scrollBehaviorFor() {
    try {
        const mq = (q) => window.matchMedia && window.matchMedia(q).matches;
        if (mq('(prefers-reduced-motion: reduce)') || mq('(pointer: coarse)')) return 'auto';
    } catch (e) { }
    return 'smooth';
}
export function scrollQuizToTop() { scrollQuizTo(0); }
