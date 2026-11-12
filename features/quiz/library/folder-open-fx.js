// File: features/quiz/library/folder-open-fx.js
// Hiệu ứng THÊM cho hoạt ảnh "mở thư mục" (playFolderOpenBurst trong library-cards.js): sticker icon
// lướt một đường cong nhẹ từ thẻ vào ô thư mục trên thanh đường dẫn (breadcrumb) — "đang ở trong thư mục này".
// (Bản cũ có pháo giấy, sao/tim, vòng sóng, băng washi bay, icon nhảy + xoay 364° → rối và gượng, đã bỏ.)
//
// Luật mượt: CHỈ transform + opacity bằng WAAPI; đo toạ độ icon TRƯỚC khi breadcrumb hiện ra làm trang
// xô xuống, play() chỉ đo ô đích. Đây chỉ là trang trí: lỗi gì cũng nuốt.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function createFolderOpenFx(stage, cardEl, rect, ghost) {
    const icon = cardEl.querySelector('.folder-icon-wrapper');
    if (typeof stage.animate !== 'function' || !icon) return { play() {} };

    const hex = cardEl.style.getPropertyValue('--fc').trim() || '#ec4899';
    const r = icon.getBoundingClientRect();
    const ic = { x: r.left + r.width / 2, y: r.top + r.height / 2, w: icon.offsetWidth, h: icon.offsetHeight };
    const badge = icon.cloneNode(true);
    badge.classList.add('fo-badge');
    badge.style.cssText = `left:${ic.x - ic.w / 2}px;top:${ic.y - ic.h / 2}px;width:${ic.w}px;height:${ic.h}px;--fc:${hex}`;
    stage.appendChild(badge);

    function play(targetEl) {
        try {
            const gi = ghost && ghost.querySelector('.folder-icon-wrapper');
            if (gi) gi.style.visibility = 'hidden';   // thẻ bản sao tan dần, sticker này bay tiếp

            // Không có ô đích (breadcrumb ngoài màn hình…) → nhô lên một chút rồi tan
            let dx = 0, dy = -40, s = 0.6;
            const t = targetEl && targetEl.getBoundingClientRect();
            if (t && t.width) {
                dx = clamp(t.left + t.width / 2, 16, window.innerWidth - 16) - ic.x;
                dy = clamp(t.top + t.height / 2, 16, window.innerHeight - 16) - ic.y;
                s = Math.max(0.3, t.width / ic.w);
            }
            const lift = Math.min(60, Math.abs(dy) * 0.25 + 18);   // độ cong đường bay
            badge.animate([
                { transform: 'translate(0, 0) scale(1)', opacity: 1 },
                { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - lift}px) scale(${(1 + s) / 2 + 0.12})`, opacity: 1, offset: 0.45 },
                { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 1, offset: 0.9 },
                { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0 }
            ], { duration: 620, easing: 'cubic-bezier(0.45, 0, 0.25, 1)', fill: 'both' });

            // Hạ cánh: icon thật trong breadcrumb nảy nhẹ (tìm lại lúc đó vì breadcrumb có thể đã vẽ lại)
            setTimeout(() => {
                const el = document.querySelector('#folder-breadcrumb .fd-crumb i');
                if (el && el.animate) {
                    el.animate([
                        { transform: 'scale(1)' },
                        { transform: 'scale(1.35)', offset: 0.4 },
                        { transform: 'scale(1)' }
                    ], { duration: 320, easing: 'ease-out' });
                }
            }, 560);
        } catch (e) {
            // trang trí thôi — bỏ qua
        }
    }

    return { play };
}
