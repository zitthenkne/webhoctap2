// File: features/quiz/quiz-coalesce.js
// Gom nhiều lần gọi liên tiếp thành MỘT lần chạy: chờ `delay` kể từ lần gọi CUỐI (trailing debounce), nhưng không để một đợt dồn kéo dài quá
// `maxWait` kể từ lần gọi ĐẦU (nếu không, người làm bài liên tục trả lời mỗi vài giây sẽ không bao giờ chạm "yên lặng" đủ lâu và tiến trình
// cloud không bao giờ được đẩy). `flush()` chạy ngay nếu đang chờ (dùng khi ẩn tab / rời trang / nộp bài).
// Thuần (không import gì, đồng hồ + hẹn giờ truyền vào được) để test bằng đồng hồ giả trong Node.
export function makeCoalescer(run, { delay, maxWait, now = Date.now, setT = setTimeout, clearT = clearTimeout }) {
    let timer = 0, first = 0, pending = false;
    const fire = () => {
        clearT(timer); timer = 0;
        const was = pending;
        pending = false; first = 0;
        if (was) run();
    };
    return {
        /** d: ghi đè `delay` cho riêng lần gọi này (vd. 500ms khi nạp tiến trình từ máy khác). */
        call(d = delay) {
            const t = now();
            if (!pending) { pending = true; first = t; }
            clearT(timer);
            timer = setT(fire, Math.max(0, Math.min(d, maxWait - (t - first))));
        },
        flush() { if (pending) fire(); },
        cancel() { clearT(timer); timer = 0; pending = false; first = 0; },
        get pending() { return pending; },
    };
}
