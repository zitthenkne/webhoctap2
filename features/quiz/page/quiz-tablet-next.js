// File: features/quiz/page/quiz-tablet-next.js
// iPad / máy tính bảng: nút "Câu tiếp" nổi, chỉ hiện khi nút Câu tiếp trong thẻ đã mở khóa
// (đã trả lời) mà đang nằm NGOÀI màn hình -> chuyển câu bất cứ lúc nào, không cần cuộn xuống.
//
// 2026-10-06: theo dõi vị trí nút thật bằng IntersectionObserver (trình duyệt tự báo khi nút vào/ra khung nhìn),
// KHÔNG còn lắng nghe `scroll` rồi gọi getBoundingClientRect mỗi khung hình (ép dàn lại trang ngay lúc người dùng đang kéo).
import { showNextQuestion } from './quiz-question-view.js';

const isTablet = () => window.innerWidth >= 768 && window.matchMedia('(pointer: coarse)').matches;

export function setupTabletNext() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'tablet-next-fab';
    btn.className = 'nb-cta';
    btn.hidden = true;
    document.body.appendChild(btn);
    btn.addEventListener('click', () => { btn.hidden = true; showNextQuestion(); });

    let raf = 0, io = null, target = null, visible = true;
    const apply = () => {
        raf = 0;
        const real = document.getElementById('nextBtn');
        const results = document.getElementById('resultsSection');
        const ok = isTablet() && real && !real.classList.contains('hidden')
            && document.body.classList.contains('quiz-active')
            && (!results || results.classList.contains('hidden'));
        if (!ok) { btn.hidden = true; return; }
        if (real !== target) {   // thẻ vừa được vẽ lại -> nút Câu tiếp là phần tử mới
            if (io) io.disconnect();
            target = real;
            visible = true;
            io = new IntersectionObserver((entries) => {
                visible = entries[entries.length - 1].isIntersecting;
                queue();
            }, { rootMargin: '0px 0px -8px 0px' });
            io.observe(real);
        }
        if (!visible) btn.innerHTML = real.textContent.trim() + ' <i class="fas fa-arrow-right"></i>';
        btn.hidden = visible;
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(apply); };
    window.addEventListener('resize', queue);
    const quiz = document.getElementById('quizSection');
    if (quiz) new MutationObserver(queue).observe(quiz, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
}
