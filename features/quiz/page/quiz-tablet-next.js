// File: features/quiz/page/quiz-tablet-next.js
// iPad / máy tính bảng: nút "Câu tiếp" nổi, chỉ hiện khi nút Câu tiếp trong thẻ đã mở khóa
// (đã trả lời) mà đang nằm NGOÀI màn hình -> chuyển câu bất cứ lúc nào, không cần cuộn xuống.
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

    let raf = 0;
    const check = () => {
        raf = 0;
        const real = document.getElementById('nextBtn');
        const results = document.getElementById('resultsSection');
        const ok = isTablet() && real && !real.classList.contains('hidden')
            && document.body.classList.contains('quiz-active')
            && (!results || results.classList.contains('hidden'));
        if (!ok) { btn.hidden = true; return; }
        const r = real.getBoundingClientRect();
        const offscreen = r.bottom < 0 || r.top > window.innerHeight - 8;
        if (offscreen) {
            btn.innerHTML = real.textContent.trim() + ' <i class="fas fa-arrow-right"></i>';
        }
        btn.hidden = !offscreen;
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(check); };
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    const quiz = document.getElementById('quizSection');
    if (quiz) new MutationObserver(queue).observe(quiz, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
}
