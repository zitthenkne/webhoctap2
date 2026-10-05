// File: features/quiz/library/folder-open-fx.js
// Lớp hiệu ứng THÊM cho hoạt ảnh "mở thư mục" (playFolderOpenBurst trong library-cards.js):
// vòng sóng, băng washi bị bóc bay, pháo giấy + sao/tim lấp lánh bắn ra từ miệng thư mục, và sticker icon
// nhảy lên khỏi túi rồi bay vòng cung vào ô thư mục trên thanh đường dẫn (breadcrumb) — "đang ở trong thư mục này".
//
// Luật mượt (điện thoại/iPad từng bị chớp giật, xem style.css khối .folder-open-stage):
//  - CHỈ transform + opacity, chạy bằng WAAPI (luồng GPU), KHÔNG filter/backdrop-filter/animate box-shadow.
//  - Mọi phần tử dựng SẴN ở trạng thái trong suốt lúc chèn bản sao (đã vẽ trước khi chạy), chỉ .animate() ở play().
//  - Đo hết toạ độ ở createFolderOpenFx (TRƯỚC khi breadcrumb hiện ra làm trang xô xuống); play() chỉ đo ô đích.
//  - Đây chỉ là trang trí: lỗi gì cũng nuốt, không được làm hỏng việc mở thư mục.

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function createFolderOpenFx(stage, cardEl, rect, ghost) {
    if (typeof stage.animate !== 'function') return { play() {} };

    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const hex = cardEl.style.getPropertyValue('--fc').trim() || '#ec4899';
    const k = Math.min(1.25, rect.width / 200);           // thẻ rộng/hẹp → quãng bay co theo
    const cx = rect.left + rect.width / 2;
    const mouthY = rect.top + 2.4 * rem;                  // miệng thư mục: chỗ xấp giấy thò lên
    const tint = (pct) => `color-mix(in srgb, ${hex} ${pct}%, #fffdf8)`;

    const mk = (tag, cls, css, html = '') => {
        const e = document.createElement(tag);
        e.className = cls;
        e.style.cssText = css;
        if (html) e.innerHTML = html;
        stage.appendChild(e);
        return e;
    };

    // Vòng sóng lan ra phía SAU thẻ
    const ringD = rect.width * 0.8;
    const ring = mk('span', 'fo-ring',
        `left:${cx - ringD / 2}px;top:${rect.top + rect.height * 0.45 - ringD / 2}px;width:${ringD}px;height:${ringD}px;border-color:${tint(70)}`);
    stage.insertBefore(ring, stage.firstChild);

    // Băng washi (bản thật trong ghost bị ẩn, bản này bóc ra bay đi) — túi rỗng không có băng
    let tape = null;
    const content = cardEl.querySelector('.folder-mini-card-content');
    if (content && cardEl.dataset.fill !== '0') {
        const c = content.getBoundingClientRect();
        tape = mk('span', 'fo-tape', `left:${c.left + 1.1 * rem}px;top:${c.top - 0.5 * rem}px;--fc:${hex}`);
    }

    // Pháo giấy
    const palette = [tint(100), tint(60), tint(32), '#ffffff', '#ffd86b', '#ff9ec4', '#9be3c4'];
    const bits = Array.from({ length: 12 }, (_, i) => {
        const el = mk('i', 'fo-bit' + (i % 3 === 0 ? ' is-dot' : ''),
            `left:${cx + rnd(-0.3, 0.3) * rect.width}px;top:${mouthY}px;background:${palette[i % palette.length]}`);
        return el;
    });

    // Sao / tim lấp lánh
    const sparkIcons = ['fa-star', 'fa-heart', 'fa-star', 'fa-star', 'fa-heart'];
    const sparks = sparkIcons.map((ic, i) => mk('i', `fas ${ic} fo-spark`,
        `left:${cx + (i - 2) * rect.width * 0.2 + rnd(-8, 8)}px;top:${mouthY - rnd(0, 30)}px;font-size:${rnd(12, 18)}px;color:${i % 2 ? tint(85) : tint(100)}`));

    // Sticker icon: bản sao nằm đúng chỗ icon trong túi
    let badge = null;
    let ic = null;
    const icon = cardEl.querySelector('.folder-icon-wrapper');
    if (icon) {
        const r = icon.getBoundingClientRect();
        ic = { x: r.left + r.width / 2, y: r.top + r.height / 2, w: icon.offsetWidth, h: icon.offsetHeight };
        badge = icon.cloneNode(true);
        badge.classList.add('fo-badge');
        badge.style.cssText = `left:${ic.x - ic.w / 2}px;top:${ic.y - ic.h / 2}px;width:${ic.w}px;height:${ic.h}px;--fc:${hex}`;
        stage.appendChild(badge);
    }

    // targetEl = icon thư mục trong breadcrumb (có thể null → sticker bay lên rồi tan)
    function play(targetEl) {
        try {
            const go = (el, frames, opts) => el.animate(frames, { fill: 'both', ...opts });

            go(ring, [
                { transform: 'scale(0.35)', opacity: 0 },
                { transform: 'scale(0.8)', opacity: 0.9, offset: 0.2 },
                { transform: 'scale(1.9)', opacity: 0 }
            ], { duration: 850, delay: 240, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' });

            if (tape) {
                go(tape, [
                    { transform: 'translate(0, 0) rotate(0deg)', opacity: 0.92, easing: 'ease-out' },
                    { transform: 'translate(3px, -9px) rotate(-12deg)', opacity: 0.92, offset: 0.25, easing: 'cubic-bezier(0.4, 0, 0.9, 0.6)' },
                    { transform: `translate(${-44 * k}px, ${-86 * k}px) rotate(-210deg)`, opacity: 0 }
                ], { duration: 700, delay: 40 });
            }

            // Pháo giấy: vọt lên → rơi xuống, xoay, mờ dần. easing đặt theo từng đoạn
            bits.forEach((el) => {
                const dx = rnd(-1, 1) * 115 * k;
                const up = rnd(70, 150) * k;
                const fall = rnd(50, 125) * k;
                const rot = rnd(-420, 420);
                go(el, [
                    { transform: 'translate(0, 0) rotate(0deg) scale(0.4)', opacity: 0, easing: 'linear' },
                    { transform: `translate(${dx * 0.06}px, ${-up * 0.12}px) rotate(${rot * 0.06}deg) scale(1)`, opacity: 1, offset: 0.06, easing: 'cubic-bezier(0.15, 0.7, 0.35, 1)' },
                    { transform: `translate(${dx * 0.55}px, ${-up}px) rotate(${rot * 0.5}deg) scale(1)`, opacity: 1, offset: 0.42, easing: 'cubic-bezier(0.45, 0, 0.9, 0.55)' },
                    { transform: `translate(${dx}px, ${-up + fall}px) rotate(${rot}deg) scale(0.9)`, opacity: 0 }
                ], { duration: rnd(900, 1250), delay: rnd(290, 430) });
            });

            // Sao/tim: nở bung → xoay → co biến mất
            sparks.forEach((el, i) => {
                const dx = (i - 2) * 26 * k + rnd(-10, 10);
                const dy = -rnd(34, 78) * k;
                go(el, [
                    { transform: 'translate(0, 0) scale(0) rotate(-40deg)', opacity: 0, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
                    { transform: `translate(${dx * 0.5}px, ${dy * 0.6}px) scale(1.25) rotate(10deg)`, opacity: 1, offset: 0.38, easing: 'ease-in' },
                    { transform: `translate(${dx}px, ${dy}px) scale(0) rotate(90deg)`, opacity: 0 }
                ], { duration: rnd(720, 960), delay: 320 + i * 70 });
            });

            if (badge && ic) {
                if (ghost) {
                    const gi = ghost.querySelector('.folder-icon-wrapper');
                    if (gi) gi.style.visibility = 'hidden';   // sticker thật nằm trong nắp, nắp sắp lật → dùng bản sao này
                }
                // Điểm đích: icon trong breadcrumb (kẹp trong màn hình, thanh có thể đang ngoài tầm nhìn)
                let tx = ic.x, ty = ic.y - 90, ts = 0.3;
                if (targetEl) {
                    const t = targetEl.getBoundingClientRect();
                    if (t.width) {
                        tx = clamp(t.left + t.width / 2, 16, window.innerWidth - 16);
                        ty = clamp(t.top + t.height / 2, 16, window.innerHeight - 16);
                        ts = Math.max(0.2, t.width / ic.w);
                    }
                }
                const dx = tx - ic.x;
                const dy = ty - ic.y;
                const apexY = Math.max(rect.top - 34, 30);          // nhảy lên cao hơn xấp giấy, không vọt khỏi màn hình
                const up = ic.y - apexY;
                const ax = dx * 0.1;
                const mx = (ax + dx) / 2;
                const my = (-up + dy) / 2 - 46 * k;                  // cung bay nhô lên
                const spring = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
                const T = (x, y, s, r) => `translate(${x}px, ${y}px) scale(${s}) rotate(${r}deg)`;
                go(badge, [
                    { transform: T(0, 0, 1, 0), opacity: 1, easing: 'ease-out' },
                    { transform: 'translate(0px, 3px) scale(1.07, 0.88) rotate(0deg)', opacity: 1, offset: 0.06, easing: spring },
                    { transform: T(ax, -up, 1.3, 16), opacity: 1, offset: 0.3, easing: 'ease-in-out' },
                    { transform: T(ax, -up + 7, 1.24, -10), opacity: 1, offset: 0.4, easing: 'ease-in-out' },
                    { transform: T(ax, -up, 1.3, 8), opacity: 1, offset: 0.5, easing: 'cubic-bezier(0.5, 0, 0.2, 1)' },
                    { transform: T(mx, my, (1.3 + ts) / 2 + 0.15, 200), opacity: 1, offset: 0.76, easing: 'cubic-bezier(0.3, 0.6, 0.4, 1)' },
                    { transform: T(dx, dy, ts, 364), opacity: 1, offset: 0.94 },
                    { transform: T(dx, dy, ts, 364), opacity: 0 }
                ], { duration: 1500 });

                // Hạ cánh: icon thật trong breadcrumb nảy một cái (tìm lại lúc đó vì breadcrumb có thể đã vẽ lại)
                setTimeout(() => {
                    const el = document.querySelector('#folder-breadcrumb .fd-crumb i');
                    if (el && el.animate) {
                        el.animate([
                            { transform: 'scale(1) rotate(0deg)' },
                            { transform: 'scale(1.7) rotate(-14deg)', offset: 0.4 },
                            { transform: 'scale(1) rotate(0deg)' }
                        ], { duration: 440, easing: spring });
                    }
                }, 1380);
            }
        } catch (e) {
            // trang trí thôi — bỏ qua
        }
    }

    return { play };
}
