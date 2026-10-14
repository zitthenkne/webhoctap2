// File: features/quiz/page/quiz-center.js
// Sang câu mới -> thẻ câu hỏi + đáp án nằm GIỮA khung nhìn theo chiều dọc (khi thẻ thấp hơn khung nhìn; thẻ dài hơn thì như cũ: đỉnh thẻ ở đầu trang).
// Cách làm: đệm trên của #quiz-main = (khung nhìn khả dụng − chiều cao thẻ) / 2, rồi cuộn để #quiz-main nằm sát mép trên khả dụng.
// Dùng innerHeight THẬT (iPad/iPhone Safari: 100vh lớn hơn phần nhìn thấy nên canh bằng CSS vh bị lệch xuống) và trừ thanh trên /
// thanh đáy điện thoại / ngăn giấy nháp dưới đáy đang che màn.
// Chỉ từ 768px trở lên (điện thoại để nguyên). Đệm chỉ tính khi vừa sang câu (thẻ còn ngắn, chưa chọn đáp án) rồi GIỮ NGUYÊN: bung giải thích / Mở rộng chỉ kéo thẻ dài xuống,
// ô đáp án không bị nhảy lên dưới ngón tay. Trong lúc người dùng chưa chạm / cuộn gì (tối đa SETTLE_MS), thẻ đổi cao vì ảnh / sơ đồ / font
// tải xong hoặc vì khung làm bài mới hiện ra (lần đo đầu lúc chuyển cảnh từ trang chờ từng ra 6520px) thì tính lại + cuộn lại.
import { scrollQuizTo } from './quiz-page-prefs.js';

const SETTLE_MS = 8000;   // quá chừng này mà người dùng chưa chạm gì thì thôi không tính lại nữa
let watcher = null, settled = true, timer = 0;

// Điện thoại (<768px): KHÔNG canh giữa, giữ cách cũ (thẻ bắt đầu từ đầu trang) — người dùng bảo cứ để như bình thường
const isPhone = () => window.innerWidth < 768;

// Vị trí tuyệt đối theo offsetTop (không bị transform của hoạt ảnh vào khung làm sai)
const absTop = (el) => { let y = 0; for (let e = el; e; e = e.offsetParent) y += e.offsetTop; return y; };

function insets() {
    let top = 0, bottom = 0;
    const bar = document.querySelector('.nb-topbar');
    if (bar && bar.offsetHeight && /fixed|sticky/.test(getComputedStyle(bar).position)) top = bar.offsetHeight;
    const nav = document.getElementById('quiz-mobile-nav');
    if (nav && nav.classList.contains('show')) bottom += nav.offsetHeight;
    const root = document.documentElement;
    if (root.classList.contains('qt-bottom')) {
        const cs = getComputedStyle(root);
        bottom += (parseFloat(cs.getPropertyValue('--qt-h')) || 0) + (parseFloat(cs.getPropertyValue('--qt-bot')) || 0);
    }
    return { top, bottom };
}

function place() {
    const main = document.getElementById('quiz-main');
    const sec = document.getElementById('quizSection');
    if (!main || !sec || isPhone()) return;
    const h = sec.offsetHeight;   // KHÔNG xóa đệm cũ trước khi đo: trang ngắn đi giữa chừng làm trình duyệt kẹp scrollY về 0
    if (!h) return;   // khung làm bài còn ẩn: ResizeObserver gọi lại khi nó hiện
    const { top, bottom } = insets();
    const pad = Math.max(0, Math.round((window.innerHeight - top - bottom - h) / 2));
    main.style.paddingTop = pad ? pad + 'px' : '';
    scrollQuizTo(pad ? Math.max(0, absTop(main) - top) : 0);
}

export function centerQuizCard() {
    const sec = document.getElementById('quizSection');
    if (!sec) return;
    if (isPhone()) {   // gỡ đệm còn sót (vừa xoay / đổi cỡ cửa sổ từ máy rộng sang hẹp) rồi cuộn lên đầu như trước
        const main = document.getElementById('quiz-main');
        if (main) main.style.paddingTop = '';
        scrollQuizTo(0);
        return;
    }
    if (!watcher) {
        watcher = new ResizeObserver(() => { if (!settled) place(); });
        watcher.observe(sec);
        ['pointerdown', 'keydown', 'wheel', 'touchmove'].forEach(t => document.addEventListener(t, () => { settled = true; }, { capture: true, passive: true }));
    }
    settled = false;
    clearTimeout(timer);
    timer = setTimeout(() => { settled = true; }, SETTLE_MS);
    place();
}
