// File: features/quiz/page/quiz-auto-next.js
// Hai tiện ích "học nhanh trên điện thoại", cùng nhắm vào một vấn đề: mỗi câu đang tốn
// thừa 1–2 thao tác tay.
//
//  1) TỰ CHUYỂN CÂU — trả lời ĐÚNG thì đếm ngược rồi sang câu sau, khỏi phải với tay
//     bấm "Tiếp". Trả lời SAI thì KHÔNG tự chuyển: đó là lúc cần đọc giải thích.
//     Bất kỳ thao tác nào (chạm, cuộn, gõ phím) đều hủy đếm ngược.
//  2) TỰ CUỘN TỚI GIẢI THÍCH — trên màn hẹp, đáp án đúng + phần "Tại sao đúng" hay nằm
//     ngoài khung nhìn sau khi chạm; đưa nó vào giữa màn hình luôn.
//
// Lưu lựa chọn ở localStorage 'quiz_auto_next' = '0' (tắt) hoặc số GIÂY chờ.

const LS_KEY = 'quiz_auto_next';
const DEFAULT_DELAY = 2.5;   // giây — đủ để liếc qua đáp án đúng

let timerId = null;
let rafId = null;
let pillEl = null;
let onFire = null;           // callback chuyển câu, do quiz-question-view truyền vào

export function getAutoNextDelay() {
    try {
        const v = parseFloat(localStorage.getItem(LS_KEY));
        return isNaN(v) || v <= 0 ? 0 : Math.min(10, v);
    } catch (e) { return 0; }
}

export function isAutoNextOn() { return getAutoNextDelay() > 0; }

export function setAutoNext(on, delay = DEFAULT_DELAY) {
    try { localStorage.setItem(LS_KEY, on ? String(delay) : '0'); } catch (e) {}
    if (!on) cancelAutoNext();
}

function ensurePill() {
    if (pillEl && document.body.contains(pillEl)) return pillEl;
    pillEl = document.createElement('div');
    pillEl.id = 'auto-next-pill';
    pillEl.setAttribute('role', 'status');
    pillEl.innerHTML = `
        <span class="anp-ring"><svg viewBox="0 0 36 36" aria-hidden="true">
            <circle class="anp-track" cx="18" cy="18" r="15.5"></circle>
            <circle class="anp-bar" cx="18" cy="18" r="15.5"></circle>
        </svg><i class="fas fa-forward"></i></span>
        <span class="anp-text">Tự sang câu sau<small>Chạm để ở lại</small></span>`;
    pillEl.addEventListener('click', (e) => { e.stopPropagation(); cancelAutoNext(true); });
    document.body.appendChild(pillEl);
    return pillEl;
}

export function cancelAutoNext(showHint = false) {
    if (timerId) { clearTimeout(timerId); timerId = null; }
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    onFire = null;
    if (pillEl) {
        pillEl.classList.remove('show');
        if (showHint) {
            pillEl.classList.add('cancelled');
            setTimeout(() => pillEl && pillEl.classList.remove('cancelled'), 400);
        }
    }
}

/**
 * Bắt đầu đếm ngược tự chuyển câu.
 * @param {Function} next hàm chuyển sang câu tiếp theo
 */
export function scheduleAutoNext(next) {
    const delay = getAutoNextDelay();
    if (!delay) return;
    cancelAutoNext();
    onFire = next;

    const pill = ensurePill();
    const bar = pill.querySelector('.anp-bar');
    const LEN = 2 * Math.PI * 15.5;
    if (bar) { bar.style.strokeDasharray = String(LEN); bar.style.strokeDashoffset = '0'; }
    pill.classList.add('show');

    const t0 = performance.now();
    const ms = delay * 1000;
    const tick = (now) => {
        const p = Math.min(1, (now - t0) / ms);
        if (bar) bar.style.strokeDashoffset = String(LEN * p);
        if (p < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    timerId = setTimeout(() => {
        const fn = onFire;
        cancelAutoNext();
        if (typeof fn === 'function') fn();
    }, ms);
}

// Mọi thao tác của người dùng đều là tín hiệu "khoan, tôi đang đọc" -> hủy đếm ngược.
// Gắn một lần ở tầng document, dùng capture để bắt cả khi con chặn sự kiện.
let wired = false;
export function setupAutoNextGuards() {
    if (wired) return;
    wired = true;
    const bail = () => { if (timerId) cancelAutoNext(true); };
    ['pointerdown', 'wheel', 'keydown', 'touchmove'].forEach(evt =>
        document.addEventListener(evt, bail, { capture: true, passive: true }));
}

/**
 * Đưa đáp án đúng (kèm phần "Tại sao đúng") vào giữa khung nhìn — chỉ trên màn hẹp,
 * nơi thẻ câu hỏi thường dài hơn màn hình.
 * @param {number} correctIdx chỉ mục phương án đúng
 */
export function focusExplanation(correctIdx) {
    if (window.innerWidth >= 1024) return;
    const btn = document.querySelector(`.answer-btn[data-index="${correctIdx}"]`);
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    // Chỉ cuộn khi nó thực sự nằm ngoài (hoặc sát mép) khung nhìn — tránh giật vô cớ
    if (r.top >= 8 && r.bottom <= window.innerHeight - 96) return;
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    btn.scrollIntoView({ behavior, block: 'center' });
}
