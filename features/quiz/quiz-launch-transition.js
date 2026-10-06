/*
 * quiz-launch-transition.js
 * ---------------------------------------------------------------------------
 * Bấm vào một thẻ bộ đề ở thư viện → MÀN TRÌNH DIỄN SỔ DÁN (~3s) rồi vào trang chờ.
 * Người dùng (2026-10-01): thích cú xoay lá bài, muốn "cầu kì, dễ thương, hoành tráng", không cần nhanh;
 * sau đó chê "giật lag" → bản này viết lại cho MƯỢT (xem "Nguyên tắc mượt" bên dưới).
 *
 *   1. NÉN–BẬT (0,3s): thẻ lún xuống rồi bật lên; BĂNG WASHI trên thẻ bị gỡ ra bay đi;
 *      các thẻ xung quanh rung rinh như bị gió thổi; nền thư viện chìm dưới giấy hồng mờ.
 *   2. XOAY (1,3s): lá bài bay ra giữa màn hình, lật 2 vòng rồi đầm xuống. Mặt sau = giấy cùng
 *      màu + loại giấy của thẻ, viền chỉ khâu, washi, sticker icon. Giấy vụn pastel bung ra.
 *   3. TRÌNH DIỄN (0,7s): vòng STICKER nảy ra quanh lá bài; SỢI CHỈ tự khâu thành trái tim sau
 *      lá bài; CHÚ SÓC ló đầu. Tải lâu hơn → lá bài bồng bềnh + đường chỉ chạy quanh.
 *   4. MỞ (0,85s): lá bài nảy, sóc nhảy đi, sticker bay tán ra; tờ giấy cùng màu thẻ nở TRÒN có
 *      viền chỉ khâu; icon + tên đề bay khớp vào ô ảnh sóc / tiêu đề trang chờ (đo trong iframe
 *      cùng origin). Hạ cánh xong → trang chờ vẽ trước ở 1% → hiện dần + giao ca + MƯA GIẤY VỤN.
 *
 * Nguyên tắc mượt (đo bằng trace, CPU chậm 4×: bản trước rớt ~30% khung, kẹt tới ~1s):
 *   - Trang chờ nạp trong iframe CÙNG LUỒNG CHÍNH với thư viện → luồng chính sẽ bận. Vì vậy MỌI
 *     chuyển động chỉ dùng transform / opacity (card đồ hoạ tự chạy, không cần luồng chính).
 *     Cấm animate: clip-path, left/top/width/height, color, background, backdrop-filter.
 *   - Nhịp hình cài bằng `delay` của Web Animations, không setTimeout từng tiết mục (luồng chính kẹt
 *     là nhịp vỡ). Lúc bấm chỉ dựng lá bài/quầng/băng washi; phần còn lại dựng ở task sau (buildShow)
 *     với delay bù theo thời gian đã trôi → khung đầu ra nhanh.
 *   - Không đổi overflow của <html> (bắt dàn lại cả trang chủ ~0,7s), không backdrop-filter.
 *   - Chỉ MỞ khi iframe đã tải xong VÀ luồng chính rảnh (requestIdleCallback trong iframe).
 *   - Lần vẽ đầu của trang chờ làm GPU đứng ~0,2s (lần đầu mở trình duyệt, chưa có cache shader: ~0,6s)
 *     → chỉ cho iframe hiện (opacity > 0) khi màn hình đã đứng yên, đợi nhịp khung đều lại (waitSmooth).
 *
 * Màu phẳng pastel (không gradient trang trí), không chữ/câu thoại — dễ thương bằng hình.
 * Bắt click ở pha capture trên document → side-effect khi bấm thẻ phải gắn ở document
 * (xem library-cards.js markQuizOpened). Giảm hiệu ứng / không có Web Animations → điều hướng thường.
 * Giữ nguyên id #quiz-hero-img / #quiz-title ở quiz.html: file này đo hai ô đó.
 * ---------------------------------------------------------------------------
 */
(function () {
    'use strict';

    // Chỉ chạy ở trang thư viện (index). Tránh tự kích hoạt khi nhúng trong iframe.
    if (window.top !== window.self) return;

    var LIFT_MS = 300;         // nén–bật tại chỗ (cùng một mạch với cú xoay)
    var SPIN_MS = 1300;        // bay ra giữa + lật 2 vòng + đầm xuống
    var SHOW_MS = 700;         // vòng sticker + chỉ khâu trái tim + sóc ló đầu
    var T_SPIN = LIFT_MS + SPIN_MS;
    var OPEN_AFTER_MIN = T_SPIN + SHOW_MS;
    var STITCH_AFTER = OPEN_AFTER_MIN + 250;   // tải lâu hơn cả màn trình diễn mới hiện chỉ chạy quanh lá bài
    var OPEN_MS = 850;         // icon/tên đề bay vào chỗ
    var SETTLE_MS = 720;       // tờ giấy nở xong + sticker bay hết → từ đây màn hình đứng yên (vẽ trước trang chờ)
    var REVEAL_MAX_MS = 9000;  // chờ iframe tối đa rồi vẫn mở (mạng chậm)
    var STYLE_ID = 'quiz-launch-transition-style';
    var EASE_OPEN = 'cubic-bezier(.65,0,.25,1)';
    var EASE_FLY = 'cubic-bezier(.3,.9,.25,1)';
    var EASE_POP = 'cubic-bezier(.34,1.56,.64,1)';   // nảy vượt đích rồi lắng
    var SQUIRREL_SRC = 'features/quiz/web_assets/mascot_stationery_squirrel.webp';
    var PASTELS = ['#f9a8d4', '#fde68a', '#a7f3d0', '#bae6fd', '#fbcfe8', '#fed7aa', '#ddd6fe'];
    var STICKERS = [
        ['fa-star', '#fde68a'], ['fa-heart', '#fbcfe8'], ['fa-cloud', '#bae6fd'], ['fa-pencil', '#fed7aa'],
        ['fa-bookmark', '#a7f3d0'], ['fa-paperclip', '#ddd6fe'], ['fa-seedling', '#bbf7d0'], ['fa-music', '#fecdd3']
    ];

    var active = null;
    var prefersReducedMotion = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var TORN = 'conic-gradient(from 45deg at left,#000 90deg,#0000 0) left/51% 6px repeat-y,' +
        'conic-gradient(from 225deg at right,#000 90deg,#0000 0) right/51% 6px repeat-y';

    function injectStyleOnce() {
        if (document.getElementById(STYLE_ID)) return;
        var css = [
            '#quiz-launch-overlay{position:fixed;inset:0;z-index:9998;pointer-events:none;}',
            // Nền thư viện lùi ra sau dưới lớp giấy hồng phấn: chỉ đổi opacity (không backdrop-filter)
            '#quiz-launch-backdrop{position:fixed;inset:0;background:rgba(252,230,239,.84);opacity:0;will-change:opacity;}',
            // Lá bài: preserve-3d + ẩn mặt lưng của CHÍNH nó (trong 3D, z-index không quyết định thứ tự
            // vẽ khi lật quá 90° — không ẩn thì Chrome vẽ nền thẻ soi gương đè lên mặt sau)
            '.ql-ghost{position:fixed !important;margin:0 !important;box-sizing:border-box;z-index:4;',
            '  pointer-events:none;animation:none !important;transition:none !important;transform-origin:50% 50%;',
            '  transform-style:preserve-3d;backface-visibility:hidden;-webkit-backface-visibility:hidden;',
            '  will-change:transform,opacity;box-shadow:0 30px 50px -22px rgba(150,60,100,.55) !important;}',
            // Mặt sau: giấy cùng màu + loại giấy của thẻ, viền chỉ khâu trắng, băng washi, sticker icon
            '.ql-back{position:absolute;inset:0;border-radius:inherit;transform:rotateY(180deg);',
            '  backface-visibility:hidden;-webkit-backface-visibility:hidden;container-type:size;',
            '  --ql:var(--qc-from,#f472b6);--ql-line:color-mix(in srgb,var(--ql) 32%,transparent);',
            '  background-color:color-mix(in srgb,var(--ql) 26%,#fffdfa);',
            '  background-image:linear-gradient(var(--ql-line) 1px,transparent 1px),linear-gradient(90deg,var(--ql-line) 1px,transparent 1px);',
            '  background-size:18px 18px;border:1.5px solid color-mix(in srgb,var(--ql) 50%,#fff);',
            '  box-shadow:0 30px 50px -22px rgba(120,50,80,.45);display:flex;align-items:center;justify-content:center;}',
            '.ql-ghost[data-paper="dot"] .ql-back{background-image:radial-gradient(color-mix(in srgb,var(--ql) 45%,transparent) 1.3px,transparent 1.9px);background-size:15px 15px;}',
            '.ql-ghost[data-paper="lined"] .ql-back{background-image:linear-gradient(transparent calc(100% - 1px),var(--ql-line) 0);background-size:100% 20px;}',
            '.ql-back::before{content:"";position:absolute;inset:8px;border-radius:12px;border:2px dashed rgba(255,255,255,.95);}',
            '.ql-back::after{content:"";position:absolute;top:-10px;left:50%;width:84px;height:22px;translate:-50% 0;rotate:-4deg;',
            '  background-color:color-mix(in srgb,var(--ql) 55%,#fff);',
            '  background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.5) 0 5px,transparent 5px 10px);',
            '  -webkit-mask:' + TORN + ';mask:' + TORN + ';}',
            '.ql-back-badge{position:relative;height:min(4.6rem,58cqh);aspect-ratio:1;border-radius:24%;',
            '  display:flex;align-items:center;justify-content:center;font-size:min(1.9rem,24cqh);background:#fff;',
            '  color:color-mix(in srgb,var(--ql) 80%,#3a2430);rotate:-6deg;',
            '  box-shadow:0 0 0 4px color-mix(in srgb,var(--ql) 45%,#fff),0 10px 20px -8px rgba(90,40,60,.45);}',
            // Các tiết mục: lớp riêng (will-change), chỉ animate transform/opacity
            '.ql-fx{position:fixed;left:0;top:0;pointer-events:none;will-change:transform,opacity;}',
            '.ql-tape{z-index:6;-webkit-mask:' + TORN + ';mask:' + TORN + ';}',
            // Quầng sáng: vẽ NHỎ rồi phóng to bằng transform (blur rẻ hơn nhiều so với vẽ to)
            '.ql-glow{z-index:0;width:220px;height:220px;border-radius:50%;filter:blur(30px);',
            '  background:color-mix(in srgb,var(--qc-from,#f472b6) 40%,#fff);}',
            '.ql-heart{z-index:1;overflow:visible;}',
            '.ql-heart .ql-thread{fill:none;stroke-linecap:round;}',
            '.ql-squirrel{z-index:3;height:auto;',
            '  filter:drop-shadow(2px 0 0 #fff) drop-shadow(-2px 0 0 #fff) drop-shadow(0 2px 0 #fff) drop-shadow(0 -2px 0 #fff) drop-shadow(0 8px 10px rgba(90,40,60,.28));}',
            // Sticker bế: nền pastel, icon tông đậm, viền trắng dày như bế dao
            '.ql-sticker{z-index:5;width:38px;height:38px;border-radius:32%;display:flex;align-items:center;',
            '  justify-content:center;font-size:17px;box-shadow:0 0 0 3.5px #fff,0 8px 14px -6px rgba(90,40,60,.4);}',
            '.ql-bit{z-index:5;}',
            '.ql-bit.is-icon{font-size:15px;line-height:1;}',
            // Đường chỉ chạy quanh lá bài khi đang tải ("kim chỉ")
            '.ql-stitch{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;',
            '  opacity:0;transition:opacity .25s ease;}',
            '.ql-stitch.is-on{opacity:1;}',
            '.ql-stitch rect{fill:none;stroke:var(--qc-from,#f472b6);stroke-width:2.2;stroke-linecap:round;',
            '  stroke-dasharray:7 6;}',
            '.ql-stitch.is-on rect{animation:ql-sew .8s linear infinite;}',   // chỉ chạy khi hiện (vẽ lại lá bài mỗi khung)
            '@keyframes ql-sew{to{stroke-dashoffset:-26;}}',
            // Tờ giấy nở TRÒN: một đĩa tròn cỡ cuối, phóng to bằng transform (không clip-path);
            // viền chỉ khâu là ::after nên tự chạy theo mép
            '.ql-sheet{z-index:2;border-radius:50%;--ql:var(--qc-from,#f472b6);',
            '  --ql-line:color-mix(in srgb,var(--ql) 20%,transparent);',
            '  background-color:color-mix(in srgb,var(--ql) 9%,#fffdfa);',
            '  background-image:linear-gradient(var(--ql-line) 1px,transparent 1px),linear-gradient(90deg,var(--ql-line) 1px,transparent 1px);',
            '  background-size:24px 24px;}',
            '.ql-sheet[data-paper="dot"]{background-image:radial-gradient(color-mix(in srgb,var(--ql) 34%,transparent) 1.3px,transparent 1.9px);background-size:20px 20px;}',
            '.ql-sheet[data-paper="lined"]{background-image:linear-gradient(transparent calc(100% - 1px),var(--ql-line) 0);background-size:100% 28px;}',
            '.ql-sheet::after{content:"";position:absolute;inset:10px;border-radius:50%;',
            '  border:4px dashed color-mix(in srgb,var(--ql) 70%,#fff);}',
            '.ql-rain{will-change:transform,opacity;}',
            // Lớp bay nằm TRÊN iframe (overlay ở z 9998 thấp hơn iframe 10000 nên không chứa được nó)
            '#quiz-launch-fly{position:fixed;inset:0;z-index:10001;pointer-events:none;overflow:hidden;}',
            '.ql-morph{position:fixed;left:0;top:0;margin:0 !important;pointer-events:none;transform-origin:0 0;',
            '  will-change:transform,opacity;}',
            '.ql-morph-title{white-space:normal;overflow:hidden;}',
            // Trang chờ: hiện dần bằng hoạt ảnh opacity; class is-on chỉ để bật nhận bấm
            '#quiz-launch-frame{position:fixed;inset:0;width:100%;height:100%;border:0;z-index:10000;',
            '  opacity:0;pointer-events:none;background:#FCE4EC;will-change:opacity;}',
            '#quiz-launch-frame.is-on{opacity:1;pointer-events:auto;}',
            'html.theme-dark #quiz-launch-frame{background:#1f2430;}'
        ].join('\n');
        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = css;
        document.head.appendChild(style);
    }

    function findCard(el) {
        return el.closest && el.closest('.quiz-grid-card, .quiz-list-card');
    }
    // Đang ở chế độ chọn nhiều? (lúc đó thẻ render kèm checkbox .bulk-quiz-checkbox)
    function inSelectionMode() {
        return !!document.querySelector('.bulk-quiz-checkbox');
    }
    function findTitleEl(root) {
        return (root.querySelector && (root.querySelector('h3 a[href*="quiz.html"]') ||
            root.querySelector('h3 a') || root.querySelector('h3'))) || null;
    }
    function frameDoc(frame) {
        try { return frame.contentDocument || (frame.contentWindow && frame.contentWindow.document); }
        catch (e) { return null; }
    }
    // Hộp bao quanh CHỮ thật (Range) — <a>/<h1> là block cả cột nên tâm hộp phần tử không phải tâm chữ
    function textRect(el, doc) {
        try {
            var r = (doc || document).createRange();
            r.selectNodeContents(el);
            var rect = r.getBoundingClientRect();
            if (rect && rect.width) return rect;
        } catch (e) {}
        return el.getBoundingClientRect();
    }
    function rand(a, b) { return a + Math.random() * (b - a); }
    function tr(x, y) { return 'translate(' + x + 'px,' + y + 'px)'; }
    function fx(cls) {
        var el = document.createElement('span');
        el.className = 'ql-fx ' + cls;
        return el;
    }

    // Đo ĐÍCH trong iframe (cùng origin, phủ kín màn hình, không zoom → toạ độ trùng cửa sổ)
    function measureTargets(frame) {
        try {
            var doc = frameDoc(frame);
            var img = doc && doc.getElementById('quiz-hero-img');
            var title = doc && doc.getElementById('quiz-title');
            if (!img || !title) return null;
            var box = img.parentElement || img;
            var hr = box.getBoundingClientRect();
            var trc = textRect(title, doc);
            if (!hr.width || !trc.width) return null;
            var cs = (frame.contentWindow || window).getComputedStyle(title);
            var color = cs.color;
            if (!color || /rgba\(0, 0, 0, 0\)|transparent/.test(color)) color = '#be185d';
            return {
                hero: hr, heroImg: img, title: trc, titleEl: title, titleFont: parseFloat(cs.fontSize) || 28, titleColor: color,
                titleStyle: { weight: cs.fontWeight, family: cs.fontFamily, lh: cs.lineHeight, ls: cs.letterSpacing, ta: cs.textAlign }
            };
        } catch (e) { return null; }
    }

    function teardown(session) {
        if (!session) return;
        try {
            if (session.overlay && session.overlay.parentNode) session.overlay.parentNode.removeChild(session.overlay);
            if (session.frame && session.frame.parentNode) {
                // Giải phóng kết nối mạng, Web Locks và IndexedDB của iframe trước khi gỡ khỏi DOM
                try { session.frame.src = 'about:blank'; } catch (_) {}
                session.frame.parentNode.removeChild(session.frame);
            }
        } catch (e) {}
        if (session.fly && session.fly.parentNode) session.fly.parentNode.removeChild(session.fly);
        if (session.card) session.card.style.visibility = '';
        if (active === session) active = null;
    }

    // Back trong lúc đang xem iframe quiz: gỡ lớp phủ, trả về thư viện
    window.addEventListener('popstate', function () { if (active) teardown(active); });

    // ===== Các "tiết mục" — tất cả tạo SẴN lúc bấm, nhịp nằm trong `delay` =====

    // Gió thổi: tối đa 8 thẻ gần nhất rung rinh, đẩy nhẹ ra xa thẻ vừa bấm rồi về chỗ (translate/rotate)
    function flutterNeighbors(card, rect) {
        var cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        var others = document.querySelectorAll('#quiz-list-container > .quiz-grid-card, #quiz-list-container > .quiz-list-card, #folders-container > .folder-mini-card');
        var list = [];
        Array.prototype.forEach.call(others, function (el) {
            if (el === card) return;
            var r = el.getBoundingClientRect();
            if (r.bottom < 0 || r.top > window.innerHeight) return;
            var ex = r.left + r.width / 2 - cx, ey = r.top + r.height / 2 - cy;
            list.push({ el: el, ex: ex, ey: ey, d: Math.max(1, Math.hypot(ex, ey)) });
        });
        list = list.sort(function (a, b) { return a.d - b.d; }).slice(0, 8).filter(function (o) {
            o.force = Math.max(0, 1 - o.d / 800) * 24;
            o.r0 = getComputedStyle(o.el).rotate;   // đọc hết trước khi animate (xen kẽ đọc/ghi = ép tính style)
            if (!o.r0 || o.r0 === 'none') o.r0 = '0deg';
            return o.force >= 2;
        });
        list.forEach(function (o) {
            var force = o.force, r0 = o.r0;
            var tx = o.ex / o.d * force, ty = o.ey / o.d * force, rot = (o.ex >= 0 ? 1 : -1) * force * 0.35;
            o.el.animate([
                { translate: '0px 0px', rotate: r0 },
                { translate: tx + 'px ' + ty + 'px', rotate: rot + 'deg', offset: 0.35 },
                { translate: (-tx * 0.25) + 'px ' + (-ty * 0.25) + 'px', rotate: (-rot * 0.4) + 'deg', offset: 0.7 },
                { translate: '0px 0px', rotate: r0 }
            ], { duration: 900, delay: o.d * 0.1, easing: 'ease-out' });
        });
    }

    // Gỡ băng washi khỏi thẻ: mẩu băng bong lên, xoay tròn bay vút đi (đo ở thẻ THẬT trước khi ẩn)
    function peelTape(card, ghost, layer) {
        var rail = card.querySelector('.qc-rail');
        var gRail = ghost.querySelector('.qc-rail');
        if (!rail || !gRail) return;
        var r = rail.getBoundingClientRect();
        if (!r.width) return;
        var cs = getComputedStyle(rail);
        var tape = fx('ql-tape');
        tape.style.width = rail.offsetWidth + 'px';
        tape.style.height = rail.offsetHeight + 'px';
        tape.style.backgroundColor = cs.backgroundColor;
        tape.style.backgroundImage = cs.backgroundImage;
        tape.style.opacity = '0';   // chưa tới lúc gỡ: băng còn nằm trên lá bài
        layer.appendChild(tape);
        var dir = Math.random() < 0.5 ? -1 : 1, x = r.left, y = r.top;
        tape.animate([
            { transform: tr(x, y) + ' rotate(-3deg) scale(1)', opacity: 1 },
            { transform: tr(x + dir * 18, y - 26) + ' rotate(' + (dir * 24) + 'deg) scale(1.08)', opacity: 1, offset: 0.25 },
            { transform: tr(x + dir * 260, y - window.innerHeight * 0.55) + ' rotate(' + (dir * 420) + 'deg) scale(.7)', opacity: 0 }
        ], { duration: 1100, delay: 140, easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'forwards' });
        gRail.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 60, delay: 140, fill: 'forwards' });
    }

    // Giấy vụn pastel (vuông / tròn / dải + sao, tim) bung ra từ giữa màn hình lúc lá bài đang xoay
    function burstConfetti(layer, base, delay) {
        var colors = [base].concat(PASTELS);
        var icons = ['fa-star', 'fa-heart', 'fa-star', 'fa-heart', 'fa-star'];
        var cx = window.innerWidth / 2, cy = window.innerHeight / 2;
        var n = 26;
        for (var i = 0; i < n; i++) {
            var isIcon = i < icons.length;
            var b = fx('ql-bit' + (isIcon ? ' is-icon' : ''));
            var c = colors[i % colors.length];
            var sw = 9, sh = 9;
            if (isIcon) {
                b.innerHTML = '<i class="fas ' + icons[i] + '"></i>';
                b.style.color = c;
            } else {
                var shape = i % 3;
                sw = shape === 2 ? 5 : 9; sh = shape === 2 ? 15 : 9;
                b.style.width = sw + 'px'; b.style.height = sh + 'px';
                b.style.borderRadius = shape === 1 ? '50%' : '2px';
                b.style.background = c;
            }
            layer.appendChild(b);
            var ang = (Math.PI * 2 * i) / n + rand(0, 0.4);
            var dist = rand(180, 380);
            var x = Math.cos(ang) * dist, y = Math.sin(ang) * dist;
            var spinDeg = (Math.random() < 0.5 ? -1 : 1) * rand(200, 520);
            var ox = cx - sw / 2, oy = cy - sh / 2;
            b.animate([
                { transform: tr(ox, oy) + ' scale(.3) rotate(0deg)', opacity: 0 },
                { transform: tr(ox + x * 0.15, oy + y * 0.15) + ' scale(.8) rotate(' + (spinDeg * 0.15) + 'deg)', opacity: 1, offset: 0.16 },
                { transform: tr(ox + x * 0.85, oy + y * 0.85) + ' scale(1) rotate(' + (spinDeg * 0.7) + 'deg)', opacity: 1, offset: 0.68 },
                { transform: tr(ox + x, oy + y + 60) + ' scale(.9) rotate(' + spinDeg + 'deg)', opacity: 0 }
            ], { duration: rand(1100, 1700), delay: delay, easing: 'cubic-bezier(.2,.75,.3,1)', fill: 'both' });
        }
    }

    // Vòng sticker nảy ra quanh lá bài (đứng giữa màn hình) rồi bồng bềnh; trả về để lúc mở cho bay tán ra
    function popStickers(layer, box, delay) {
        var W = window.innerWidth, H = window.innerHeight;
        var cx = W / 2, cy = H / 2;
        var rx = Math.min(box.width / 2 + 54, W / 2 - 26), ry = Math.min(box.height / 2 + 50, H / 2 - 26);
        return STICKERS.map(function (s, i) {
            var a = -Math.PI / 2 + (Math.PI * 2 * i) / STICKERS.length + 0.25;
            var x = cx + Math.cos(a) * rx - 19, y = cy + Math.sin(a) * ry - 19;
            var el = fx('ql-sticker');
            el.style.background = s[1];
            el.style.color = 'color-mix(in srgb,' + s[1] + ' 30%,#5a2a40)';
            el.innerHTML = '<i class="fas ' + s[0] + '"></i>';
            layer.appendChild(el);
            var tilt = rand(-18, 18);
            var d = delay + i * 55;
            var pop = el.animate([
                { transform: tr(cx - 19, cy - 19) + ' scale(0) rotate(-90deg)', opacity: 0 },
                { transform: tr(x, y) + ' scale(1) rotate(' + tilt + 'deg)', opacity: 1 }
            ], { duration: 560, delay: d, easing: EASE_POP, fill: 'both' });
            // bồng bềnh (thuộc tính translate tách khỏi transform → không đè cú nảy)
            var bob = el.animate([{ translate: '0 0' }, { translate: '0 -6px' }],
                { duration: rand(900, 1300), delay: d + 560, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' });
            return { el: el, x: x, y: y, a: a, tilt: tilt, anims: [pop, bob] };
        });
    }

    // Sợi chỉ tự khâu thành trái tim sau lá bài (mặt nạ lộ dần đường nét đứt — phần duy nhất vẽ lại
    // trên luồng chính, vùng nhỏ, chạy trước lúc mở)
    var HEART_PATH = 'M50 87 C 22 67, 3 47, 3 28 C 3 13, 15 3, 29 3 C 39 3, 46 9, 50 17 C 54 9, 61 3, 71 3 C 85 3, 97 13, 97 28 C 97 47, 78 67, 50 87 Z';
    function stitchHeart(layer, box, base, delay) {
        if (box.width / box.height > 2.4) return null;   // thẻ danh sách quá dẹt: trái tim sẽ khổng lồ
        var w = Math.min(box.width * 1.5, window.innerWidth * 0.96), h = w * 0.9;
        var svgNS = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('class', 'ql-fx ql-heart');
        svg.setAttribute('viewBox', '0 0 100 90');
        svg.setAttribute('width', w); svg.setAttribute('height', h);
        var x = window.innerWidth / 2 - w / 2, y = window.innerHeight / 2 - h * 0.46;
        svg.style.transform = tr(x, y);
        var id = 'qlh' + Date.now();
        var u = w / 100;   // 1 đơn vị khung vẽ = u px → quy đổi nét chỉ ra px thật (2,6px, mũi 7px cách 6px)
        svg.innerHTML =
            '<defs><mask id="' + id + '" maskUnits="userSpaceOnUse"><path d="' + HEART_PATH + '" fill="none" stroke="#fff" stroke-width="6" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1" class="ql-mask"/></mask></defs>' +
            '<path d="' + HEART_PATH + '" fill="' + base + '" fill-opacity=".16" stroke="none" class="ql-heart-fill"/>' +
            '<path class="ql-thread" d="' + HEART_PATH + '" stroke="' + base + '" mask="url(#' + id + ')" stroke-width="' + (2.6 / u) +
            '" stroke-dasharray="' + (7 / u) + ' ' + (6 / u) + '"/>';
        layer.appendChild(svg);
        svg.querySelector('.ql-mask').animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
            { duration: 820, delay: delay, easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'both' });
        // phần tô nhạt hiện dần cùng cả hình bằng opacity của chính <svg> (lớp riêng)
        svg.querySelector('.ql-heart-fill').style.opacity = '0';
        svg.querySelector('.ql-heart-fill').animate([{ opacity: 0 }, { opacity: 1 }],
            { duration: 450, delay: delay + 520, easing: 'ease-out', fill: 'forwards' });
        return { el: svg, x: x, y: y };
    }

    // Chú sóc ló đầu từ sau góc trên-phải lá bài, lúc lắc chào
    function peekSquirrel(layer, box, delay) {
        var img = document.createElement('img');
        img.className = 'ql-fx ql-squirrel';
        img.src = SQUIRREL_SRC;
        img.alt = '';
        var size = Math.max(64, Math.min(104, window.innerWidth * 0.09));
        img.style.width = size + 'px';
        layer.appendChild(img);
        var x = Math.min(window.innerWidth - size - 8, box.right - size * 0.95), y = box.top - size * 0.72;
        var pop = img.animate([
            { transform: tr(x, y + size * 0.75) + ' rotate(8deg)', opacity: 0 },
            { transform: tr(x, y - 6) + ' rotate(-6deg)', opacity: 1, offset: 0.6 },
            { transform: tr(x, y) + ' rotate(0deg)', opacity: 1 }
        ], { duration: 520, delay: delay, easing: EASE_POP, fill: 'both' });
        var wiggle = img.animate([{ rotate: '0deg' }, { rotate: '-7deg' }, { rotate: '6deg' }, { rotate: '0deg' }],
            { duration: 900, delay: delay + 520, iterations: Infinity, easing: 'ease-in-out' });
        return { el: img, x: x, y: y, anims: [pop, wiggle] };
    }

    // Mưa giấy vụn rơi trên trang chờ lúc hạ cánh (lớp bay, không chặn bấm)
    function rainConfetti(layer, base, delay) {
        var W = window.innerWidth, H = window.innerHeight;
        var colors = [base].concat(PASTELS);
        var n = W < 640 ? 24 : 36;
        var frag = document.createDocumentFragment();
        for (var i = 0; i < n; i++) {
            var b = fx('ql-rain');
            var shape = i % 4;
            if (shape === 3) {
                b.innerHTML = '<i class="fas ' + (i % 8 === 3 ? 'fa-heart' : 'fa-star') + '"></i>';
                b.style.color = colors[i % colors.length];
                b.style.fontSize = rand(11, 16) + 'px';
            } else {
                b.style.width = (shape === 2 ? 6 : 10) + 'px';
                b.style.height = (shape === 2 ? 16 : 10) + 'px';
                b.style.borderRadius = shape === 1 ? '50%' : '2px';
                b.style.background = colors[i % colors.length];
            }
            frag.appendChild(b);
            var x0 = rand(0, W), sway = rand(-60, 60), rot = rand(-540, 540);
            b.animate([
                { transform: tr(x0, -30) + ' rotate(0deg)', opacity: 1 },
                { transform: tr(x0 + sway, H * 0.5) + ' rotate(' + (rot / 2) + 'deg)', opacity: 1, offset: 0.55 },
                { transform: tr(x0 - sway * 0.5, H + 30) + ' rotate(' + rot + 'deg)', opacity: 0.85 }
            ], { duration: rand(1300, 2100), delay: delay + rand(0, 450), easing: 'cubic-bezier(.35,.1,.6,1)', fill: 'both' });
        }
        layer.appendChild(frag);
    }

    // ===== Phiên trình diễn =====
    function launch(card, url) {
        injectStyleOnce();
        if (tiltCard) { tiltCard.style.transition = 'none'; tiltCard.style.transform = ''; tiltCard = null; }
        var rect = card.getBoundingClientRect();
        var srcTitleEl = findTitleEl(card);
        var srcTitleText = srcTitleEl ? srcTitleEl.textContent.trim() : '';
        var base = card.style.getPropertyValue('--qc-from') || '#f472b6';
        var W0 = window.innerWidth, H0 = window.innerHeight;

        var overlay = document.createElement('div');
        overlay.id = 'quiz-launch-overlay';
        var backdrop = document.createElement('div');
        backdrop.id = 'quiz-launch-backdrop';
        overlay.appendChild(backdrop);

        var glow = fx('ql-glow');
        glow.style.setProperty('--qc-from', base);
        overlay.appendChild(glow);

        // Lá bài = bản sao của thẻ, đặt đúng chỗ; thẻ thật ẩn đi để không thấy hai tờ
        var ghost = card.cloneNode(true);
        ghost.classList.add('ql-ghost');
        ghost.style.left = rect.left + 'px';
        ghost.style.top = rect.top + 'px';
        ghost.style.width = rect.width + 'px';
        ghost.style.height = rect.height + 'px';
        var back = document.createElement('div');
        back.className = 'ql-back';
        var srcIcon = card.querySelector('.quiz-card-icon i');
        back.innerHTML = '<span class="ql-back-badge"><i class="' + (srcIcon ? srcIcon.className : 'fas fa-star') + '"></i></span>';
        // Mặt trước ẩn khi lá bài quay lưng (không thì thấy chữ bị soi gương)
        Array.prototype.forEach.call(ghost.children, function (el) {
            el.style.backfaceVisibility = 'hidden';
            el.style.webkitBackfaceVisibility = 'hidden';
        });
        ghost.appendChild(back);

        // Đường chỉ (SVG) bám theo mép lá bài, chỉ bật khi tải lâu
        var svgNS = 'http://www.w3.org/2000/svg';
        var stitch = document.createElementNS(svgNS, 'svg');
        stitch.setAttribute('class', 'ql-stitch');
        var sr = document.createElementNS(svgNS, 'rect');
        sr.setAttribute('x', '5'); sr.setAttribute('y', '5');
        sr.setAttribute('width', Math.max(0, rect.width - 10));
        sr.setAttribute('height', Math.max(0, rect.height - 10));
        sr.setAttribute('rx', card.classList.contains('quiz-list-card') ? '12' : '17');
        stitch.appendChild(sr);
        stitch.style.backfaceVisibility = 'hidden';
        ghost.appendChild(stitch);
        overlay.appendChild(ghost);

        // Đích: giữa màn hình, to vừa mắt (điện thoại thu còn ~72% bề ngang để tim + sticker có chỗ)
        var isList = card.classList.contains('quiz-list-card');
        var targetW = isList ? 0.92 * W0 : Math.min(440, (W0 < 640 ? 0.72 : 0.86) * W0);
        var S = Math.min(targetW / rect.width, 0.58 * H0 / rect.height);
        S = Math.max(S, W0 < 640 ? 0.6 : 1.04);
        var dx = W0 / 2 - (rect.left + rect.width / 2), dy = H0 / 2 - (rect.top + rect.height / 2);
        var settled = 'translate(' + dx + 'px,' + dy + 'px) scale(' + S + ')';
        var finalBox = {
            left: W0 / 2 - rect.width * S / 2, right: W0 / 2 + rect.width * S / 2,
            top: H0 / 2 - rect.height * S / 2, bottom: H0 / 2 + rect.height * S / 2,
            width: rect.width * S, height: rect.height * S
        };

        // Lúc bấm chỉ dựng thứ cần trong nửa giây đầu (lá bài, quầng, băng washi) để khung đầu ra nhanh;
        // giấy vụn / sticker / tim / sóc dựng ở task sau (buildShow), nhịp vẫn tính từ lúc bấm
        peelTape(card, ghost, overlay);
        var stickers = [], heart = null, squirrel = null;
        // Mọi phép ĐO (thẻ gốc, băng washi, thẻ bên cạnh) xong rồi mới chạy hoạt ảnh/chèn DOM:
        // đo sau khi đã ghi là ép trình duyệt tính lại style giữa chừng (~30ms/lần trên máy yếu)
        flutterNeighbors(card, rect);

        document.body.appendChild(overlay);
        card.style.visibility = 'hidden';

        // Trang chờ nạp ngầm
        var frame = document.createElement('iframe');
        frame.id = 'quiz-launch-frame';
        frame.setAttribute('title', 'Trang làm bài');
        frame.src = url;
        document.body.appendChild(frame);

        var fly = document.createElement('div');
        fly.id = 'quiz-launch-fly';
        document.body.appendChild(fly);

        var session = {
            overlay: overlay, frame: frame, fly: fly, card: card,
            opened: false, settled: false, frameReady: false, loadCount: 0
        };
        active = session;
        var startTime = Date.now();

        backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450, delay: 120, easing: 'ease-out', fill: 'both' });
        glow.style.transform = tr(W0 / 2 - 110, H0 / 2 - 110) + ' scale(1)';
        glow.animate([
            { transform: tr(W0 / 2 - 110, H0 / 2 - 110) + ' scale(1.2)', opacity: 0 },
            { transform: tr(W0 / 2 - 110, H0 / 2 - 110) + ' scale(' + (Math.min(620, W0 * 0.86) / 220).toFixed(2) + ')', opacity: 0.9 }
        ], { duration: 800, delay: LIFT_MS + 250, easing: 'ease-out', fill: 'both' });

        // Một mạch: NÉN (lún, phình ngang) → BẬT lên nghiêng → bay ra giữa + lật 2 vòng (rotateY 720°)
        // → vượt đích một chút rồi đầm xuống. Cùng danh sách hàm transform ở mọi mốc → nội suy
        // từng hàm, quay đủ 2 vòng (không bị rút gọn thành 0°). Chạy hoàn toàn trên card đồ hoạ.
        var P = ' perspective(1300px) ';
        var spin = ghost.animate([
            { transform: 'translate(0px,0px)' + P + 'rotateZ(0deg) rotateY(0deg) scale(1,1)', easing: 'ease-out' },
            { offset: 120 / T_SPIN, transform: 'translate(0px,6px)' + P + 'rotateZ(0deg) rotateY(0deg) scale(1.07,.9)', easing: 'cubic-bezier(.2,.9,.3,1.35)' },
            { offset: LIFT_MS / T_SPIN, transform: 'translate(0px,-22px)' + P + 'rotateZ(-6deg) rotateY(0deg) scale(1.06,1.06)', easing: 'cubic-bezier(.16,.72,.2,1.05)' },
            { transform: 'translate(' + dx + 'px,' + dy + 'px)' + P + 'rotateZ(0deg) rotateY(720deg) scale(' + S + ',' + S + ')' }
        ], { duration: T_SPIN, fill: 'forwards' });
        var bob = null;
        spin.onfinish = settle;

        // Dựng phần còn lại của màn trình diễn sau khung đầu. `at` = mốc tính từ lúc bấm; trễ hơn dự
        // kiến thì delay âm → hoạt ảnh vào giữa chừng, nhịp tổng không lệch.
        setTimeout(function buildShow() {
            if (session.opened || active !== session) return;
            var at = function (ms) { return ms - (Date.now() - startTime); };
            var layer = document.createDocumentFragment();
            burstConfetti(layer, base, at(LIFT_MS + Math.round(SPIN_MS * 0.4)));
            stickers = popStickers(layer, finalBox, at(LIFT_MS + Math.round(SPIN_MS * 0.78)));
            heart = stitchHeart(layer, finalBox, base, at(T_SPIN - 60));
            squirrel = peekSquirrel(layer, finalBox, at(T_SPIN + 220));
            overlay.appendChild(layer);
        }, 90);

        // Chốt lá bài ở tư thế đứng yên 2D (bỏ hoạt ảnh đang giữ khung cuối) → đo chuẩn
        function settle() {
            if (session.settled) return;
            session.settled = true;
            ghost.style.transform = settled;
            spin.cancel();
            // Chờ tải lâu: lá bài bồng bềnh nhè nhẹ (thuộc tính translate tách khỏi transform)
            if (!session.opened) {
                bob = ghost.animate([{ translate: '0 0' }, { translate: '0 -7px' }],
                    { duration: 1100, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' });
            }
        }
        var stitchTimer = setTimeout(function () { if (!session.opened) stitch.classList.add('is-on'); }, STITCH_AFTER);

        function tryOpen() {
            if (session.opened || !session.frameReady) return;
            var wait = OPEN_AFTER_MIN - (Date.now() - startTime);
            if (wait > 0) { setTimeout(tryOpen, wait); return; }
            open();
        }

        // "Mồi" tên đề vào #quiz-title của iframe trước khi đo → đích đúng cách tên thật xuống dòng,
        // không nháy "Đang tải thông tin...". quiz-ui.js sau đó vẫn gán lại đúng tên từ dữ liệu.
        function primeFrameTitle() {
            try {
                var doc = frameDoc(frame);
                var t = doc && doc.getElementById('quiz-title');
                if (t && srcTitleText && t.textContent.indexOf('Đang tải') !== -1) {
                    t.textContent = srcTitleText;
                    doc.title = srcTitleText;
                }
            } catch (e) {}
        }

        function open() {
            if (session.opened) return;
            session.opened = true;
            settle();
            if (bob) bob.cancel();
            clearTimeout(stitchTimer);
            stitch.classList.remove('is-on');
            session.prevHref = location.href;
            try { history.pushState({ quizLaunch: true }, '', url); } catch (e) {}

            primeFrameTitle();
            var targets = measureTargets(frame);
            var g = finalBox;   // tư thế đứng yên đã biết trước — khỏi đo (đỡ ép dàn trang)
            var W = window.innerWidth, H = window.innerHeight;
            var gcx = g.left + g.width / 2, gcy = g.top + g.height / 2;

            // Màn chào kết: sticker bay tán ra, sóc nhảy đi, trái tim & quầng tan
            stickers.forEach(function (s, i) {
                s.anims.forEach(function (a) { a.cancel(); });
                var far = Math.hypot(W, H);
                var tx = W / 2 + Math.cos(s.a) * far - 19, ty = H / 2 + Math.sin(s.a) * far - 19;
                s.el.animate([
                    { transform: tr(s.x, s.y) + ' scale(1) rotate(' + s.tilt + 'deg)', opacity: 1 },
                    { transform: tr(s.x + (s.x - W / 2) * 0.12, s.y + (s.y - H / 2) * 0.12) + ' scale(1.25) rotate(' + (s.tilt - 20) + 'deg)', opacity: 1, offset: 0.2 },
                    { transform: tr(tx, ty) + ' scale(.8) rotate(' + (s.tilt + 260) + 'deg)', opacity: 0.2 }
                ], { duration: 600, delay: i * 15, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'both' });
            });
            if (squirrel) {
                squirrel.anims.forEach(function (a) { a.cancel(); });
                squirrel.el.animate([
                    { transform: tr(squirrel.x, squirrel.y) + ' rotate(0deg)', opacity: 1 },
                    { transform: tr(squirrel.x, squirrel.y - 46) + ' rotate(-12deg)', opacity: 1, offset: 0.4 },
                    { transform: tr(squirrel.x + 70, squirrel.y + H * 0.5) + ' rotate(30deg)', opacity: 0 }
                ], { duration: 700, easing: 'cubic-bezier(.3,.7,.5,1)', fill: 'forwards' });
            }
            if (heart) {
                heart.el.animate([
                    { transform: tr(heart.x, heart.y) + ' scale(1)', opacity: 1 },
                    { transform: tr(heart.x, heart.y) + ' scale(1.2)', opacity: 0 }
                ], { duration: 520, easing: 'ease-out', fill: 'forwards' });
            }
            glow.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 500, easing: 'ease-out', fill: 'forwards' });

            // Lá bài nảy một nhịp rồi tan vào tờ giấy đang nở
            ghost.animate([{ scale: 1 }, { scale: 1.1, offset: 0.35 }, { scale: 1.04 }], { duration: 520, easing: 'ease-out', fill: 'forwards' });
            ghost.animate([{ opacity: 1 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }],
                { duration: Math.round(OPEN_MS * 0.6), easing: 'ease-out', fill: 'forwards' });

            // Tờ giấy nở tròn: đĩa CỠ CUỐI đặt sẵn, phóng từ nhỏ lên bằng transform (card đồ hoạ tự chạy)
            var r0 = Math.hypot(g.width, g.height) / 2 * 0.9;
            var r1 = Math.hypot(Math.max(gcx, W - gcx), Math.max(gcy, H - gcy)) + 30;
            var sheet = fx('ql-sheet');
            sheet.style.setProperty('--qc-from', base);
            if (card.dataset.paper) sheet.dataset.paper = card.dataset.paper;
            sheet.style.width = sheet.style.height = (2 * r1) + 'px';
            overlay.insertBefore(sheet, ghost);
            var sx = gcx - r1, sy = gcy - r1;
            sheet.animate([
                { transform: tr(sx, sy) + ' scale(' + (r0 / r1).toFixed(4) + ')' },
                { transform: tr(sx, sy) + ' scale(1)' }
            ], { duration: SETTLE_MS, easing: EASE_OPEN, fill: 'both' });

            // Icon + tên đề bay khớp vào trang chờ, hạ cánh rồi đứng chờ giao ca
            var landed = targets ? flyParts(targets) : { parts: [], real: [] };

            // Lần vẽ ĐẦU của trang chờ chiếm GPU ~0,2s (máy yếu / lần đầu mở trình duyệt: lâu hơn) và
            // làm khựng MỌI hoạt ảnh. Nên đợi hạ cánh xong (màn hình gần như đứng yên) mới cho trang chờ
            // vẽ trước ở độ mờ 1%, chờ nhịp khung hình đều lại, rồi mới hiện dần + giao ca + mưa giấy.
            setTimeout(function () {
                if (active !== session) return;
                frame.style.opacity = '0.01';
                waitSmooth(reveal);
            }, SETTLE_MS + 10);

            function reveal() {
                if (active !== session) return;
                frame.animate([{ opacity: 0.01 }, { opacity: 1 }], { duration: 380, easing: 'ease-out', fill: 'forwards' });
                // Giao ca = MỜ CHÉO: bản bay tan dần đúng lúc phần thật hiện dần tại cùng chỗ
                landed.parts.forEach(function (p) {
                    p.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'ease-in-out', fill: 'forwards' });
                });
                landed.real.forEach(function (r) { landIn(r.el, r.bounce); });
                rainConfetti(fly, base, 60);
                setTimeout(function () { frame.classList.add('is-on'); frame.style.opacity = ''; }, 400);
                setTimeout(function () {
                    try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) {}
                }, 450);
                setTimeout(function () {
                    try { if (fly.parentNode) fly.parentNode.removeChild(fly); } catch (e) {}
                }, 2700);   // đợi mưa giấy rơi hết (lớp bay không chặn bấm nên trang chờ dùng được ngay)
            }
        }

        // Gọi cb khi nhịp khung hình đã đều lại: ≥3 khung liền < 34ms, tối thiểu 140ms, tối đa 450ms
        // (đứng lâu hơn trông như treo). GPU đang vẽ thì Chrome ngừng phát khung → rAF đứng → đếm lại.
        function waitSmooth(cb) {
            var t0 = performance.now(), last = t0, ok = 0;
            requestAnimationFrame(function tick(now) {
                ok = now - last < 34 ? ok + 1 : 0;
                last = now;
                if ((ok >= 3 && now - t0 >= 140) || now - t0 > 450) cb();
                else requestAnimationFrame(tick);
            });
        }

        function flyParts(t) {
            var icon = ghost.querySelector('.quiz-card-icon');
            var title = findTitleEl(ghost);
            var parts = [], real = [];
            // Toạ độ trên lá bài đứng yên = toạ độ trên thẻ gốc biến đổi theo settled (khỏi đo ghost)
            var ox = rect.left + rect.width / 2, oy = rect.top + rect.height / 2;
            var mapPt = function (x, y) { return { x: W0 / 2 + (x - ox) * S, y: H0 / 2 + (y - oy) * S }; };

            if (icon) {
                var srcIc = card.querySelector('.quiz-card-icon');
                var ir0 = srcIc.getBoundingClientRect();
                var iw = srcIc.offsetWidth || ir0.width, ih = srcIc.offsetHeight || ir0.height;
                var p0 = mapPt(ir0.left + ir0.width / 2, ir0.top + ir0.height / 2);
                var clone = icon.cloneNode(true);
                clone.classList.add('ql-morph');
                clone.style.width = iw + 'px'; clone.style.height = ih + 'px';
                clone.style.rotate = '0deg';
                // CSS sticker gắn theo .quiz-grid-card → ra ngoài thẻ phải chép màu computed, không thì thành ô trắng
                var ics = getComputedStyle(srcIc);
                clone.style.setProperty('background', ics.backgroundColor, 'important');
                clone.style.color = ics.color;
                clone.style.borderRadius = ics.borderRadius;
                clone.style.boxShadow = ics.boxShadow;
                clone.style.fontSize = ics.fontSize;
                clone.style.display = 'flex';
                clone.style.alignItems = 'center';
                clone.style.justifyContent = 'center';
                var s0 = S;
                var s1 = Math.min(t.hero.width / iw, t.hero.height / ih);
                var x0 = p0.x - iw * s0 / 2, y0 = p0.y - ih * s0 / 2;
                var x1 = t.hero.left + (t.hero.width - iw * s1) / 2, y1 = t.hero.top + (t.hero.height - ih * s1) / 2;
                fly.appendChild(clone);
                icon.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1, fill: 'forwards' });   // ô trên lá bài trống
                // Bay theo đường vòng (vồng lên giữa chừng) + xoay một vòng cho vui mắt
                var mx = (x0 + x1) / 2, my = Math.min(y0, y1) - 70;
                clone.animate([
                    { transform: tr(x0, y0) + ' scale(' + s0 + ') rotate(-4deg)' },
                    { transform: tr(mx, my) + ' scale(' + ((s0 + s1) / 2 * 1.15) + ') rotate(-200deg)', offset: 0.5 },
                    { transform: tr(x1, y1) + ' scale(' + s1 + ') rotate(-360deg)' }
                ], { duration: OPEN_MS, easing: EASE_FLY, fill: 'both' });
                parts.push(clone);
                real.push({ el: hideReal(t.heroImg), bounce: true });
            }

            if (title && srcTitleEl) {
                var trc = textRect(srcTitleEl);
                var cs = getComputedStyle(srcTitleEl);
                var f0 = parseFloat(cs.fontSize) || 16;
                var pt0 = mapPt(trc.left, trc.top);
                var k = t.titleFont / f0;
                var from = tr(pt0.x, pt0.y) + ' scale(' + S + ')';
                var to = tr(t.title.left, t.title.top) + ' scale(' + k + ')';
                // Hai bản chữ cùng bay một đường: A dàn dòng như trên thẻ, B dàn dòng như tiêu đề đích;
                // mờ chéo A→B giữa chừng thay cho animate width/màu (vốn bắt luồng chính dàn chữ mỗi khung)
                // B chép đúng kiểu chữ của tiêu đề ĐÍCH (độ đậm, giãn chữ, dòng — quy về cỡ f0) để lúc
                // giao ca chồng khít lên chữ thật, không lệch dần về cuối dòng
                var px = function (v, div) { var n = parseFloat(v); return isNaN(n) ? v : (n / div) + 'px'; };
                var ts = t.titleStyle;
                var mk = function (wPx, hPx, color, st) {
                    var el = document.createElement('div');
                    el.className = 'ql-morph ql-morph-title';
                    el.textContent = srcTitleText;
                    el.style.width = wPx + 'px';
                    el.style.maxHeight = hPx + 'px';
                    el.style.font = st.weight + ' ' + f0 + 'px/' + st.lh + ' ' + st.family;
                    el.style.letterSpacing = st.ls;
                    el.style.textAlign = 'left';
                    el.style.color = color;
                    fly.appendChild(el);
                    return el;
                };
                var A = mk(Math.ceil(trc.width) + 2, Math.ceil(trc.height) + 2, cs.color,
                    { weight: cs.fontWeight, family: cs.fontFamily, lh: cs.lineHeight, ls: cs.letterSpacing });
                var wB = Math.ceil(t.title.width * 1.06 / k);   // rộng hơn chữ 6% để không xuống dòng khác
                var Bt = mk(wB, Math.ceil(t.title.height / k) + 1, t.titleColor,
                    { weight: ts.weight, family: ts.family, lh: px(ts.lh, k), ls: px(ts.ls, k) });
                if (ts.ta === 'center') {   // điện thoại: tiêu đề căn giữa → căn giữa + lùi nửa phần rộng dư
                    Bt.style.textAlign = 'center';
                    Bt.style.translate = (-(wB * k - t.title.width) / 2) + 'px 0';
                }
                title.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1, fill: 'forwards' });
                A.animate([
                    { transform: from, opacity: 1 }, { opacity: 1, offset: 0.28 }, { opacity: 0, offset: 0.62 }, { transform: to, opacity: 0 }
                ], { duration: OPEN_MS, easing: EASE_FLY, fill: 'both' });
                Bt.animate([
                    { transform: from, opacity: 0 }, { opacity: 0, offset: 0.28 }, { opacity: 1, offset: 0.62 }, { transform: to, opacity: 1 }
                ], { duration: OPEN_MS, easing: EASE_FLY, fill: 'both' });
                parts.push(Bt);
                real.push({ el: hideReal(t.titleEl), bounce: false });
            }
            return { parts: parts, real: real };
        }

        // Phần thật trong trang chờ (ảnh sóc / tiêu đề): ẩn tới lúc giao ca rồi hiện dần (sóc nảy nhẹ)
        function hideReal(el) {
            if (el && el.style) el.style.opacity = '0';
            return el;
        }
        function landIn(el, bounce) {
            if (!el || !el.animate) return;
            el.style.opacity = '';
            el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-in-out' });
            if (bounce) {
                el.animate([{ transform: 'scale(.8)' }, { transform: 'scale(1.1)', offset: 0.55 }, { transform: 'scale(1)' }],
                    { duration: 480, easing: 'ease-out' });
            }
        }

        // Mở khi iframe đã tải xong VÀ luồng chính rảnh (trang chờ còn chạy JS khởi tạo sau load —
        // mở giữa lúc đó là chuyến bay giật)
        function markReady() {
            if (session.frameReady) return;
            session.frameReady = true;
            tryOpen();
        }
        frame.addEventListener('load', function () {
            session.loadCount++;
            if (session.loadCount === 1) {
                var w = frame.contentWindow;
                if (w && w.requestIdleCallback) w.requestIdleCallback(markReady, { timeout: 900 });
                else setTimeout(markReady, 120);
                return;
            }
            // Điều hướng nội bộ trong iframe về index.html ("Về trang chủ") → đóng iframe êm đềm, không reload trang mẹ
            try {
                var loc = frame.contentWindow.location;
                if (loc && /index\.html$/.test(loc.pathname)) {
                    // KHÔNG history.back(): điều hướng trong iframe cũng nằm trong lịch sử chung, lùi 1 bước
                    // chỉ quay về trang chờ của chính iframe (bấm "Trang chủ" mà hiện lại trang chờ làm bài)
                    teardown(session);
                    try { history.replaceState(null, '', session.prevHref || 'index.html'); } catch (e) {}
                    return;
                }
            } catch (e) {}
        });
        frame.addEventListener('error', function () { window.location.href = url; });
        setTimeout(function () {
            if (!session.opened) { session.frameReady = true; open(); }
        }, REVEAL_MAX_MS);
    }

    // ---- Rê chuột: thẻ nghiêng 3D nhẹ theo con trỏ (bản cũ 30–36° + phóng 1,11 quá gắt) ----
    var tiltCard = null;
    function resetTilt(card) {
        if (!card) return;
        card.style.transition = 'transform .5s cubic-bezier(.22,1,.36,1)';
        card.style.transform = '';
    }
    document.addEventListener('pointermove', function (e) {
        if (prefersReducedMotion || active) return;
        if (e.pointerType && e.pointerType !== 'mouse') return;
        var card = (e.target.closest && e.target.closest('.quiz-grid-card')) || null;   // chỉ thẻ lưới
        if (card && (inSelectionMode() || card.querySelector('.quiz-menu:not(.hidden)'))) card = null;
        if (card !== tiltCard) {
            if (tiltCard) resetTilt(tiltCard);
            tiltCard = card;
            if (card) card.style.transition = 'transform .14s ease-out';
        }
        if (!card) return;
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        card.style.transform = 'perspective(700px) translateY(-4px) rotateX(' + ((0.5 - py) * 12).toFixed(2) +
            'deg) rotateY(' + ((px - 0.5) * 14).toFixed(2) + 'deg) scale(1.03)';
    }, true);
    document.addEventListener('pointerleave', function () { if (tiltCard) { resetTilt(tiltCard); tiltCard = null; } });
    // Mở menu "..." → gỡ nghiêng ngay (transform tạo stacking context làm menu bị thẻ dưới che)
    document.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('.quiz-menu-btn') && tiltCard) {
            tiltCard.style.transition = 'none';
            tiltCard.style.transform = '';
            tiltCard = null;
        }
    }, true);

    // Bắt click ở pha capture: phủ TOÀN BỘ thẻ (tên đề, icon, vùng trống, nút Làm bài)
    document.addEventListener('click', function (e) {
        if (prefersReducedMotion) return;            // tôn trọng cài đặt giảm hiệu ứng
        if (active) return;                          // đang có phiên chạy rồi
        if (e.defaultPrevented) return;
        if (e.button !== 0) return;                  // chỉ chuột trái
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; // mở tab mới...
        if (!e.target.closest) return;
        if (typeof Element.prototype.animate !== 'function') return;  // không có Web Animations → điều hướng thường

        var card = findCard(e.target);
        if (!card) return;
        if (inSelectionMode()) return;

        var anchor = e.target.closest('a[href*="quiz.html"]');
        // Nút điều khiển (ghim, menu "...", checkbox...) → để handler riêng chạy
        if (!anchor && e.target.closest('button, .quiz-menu, .quiz-menu-btn, input')) return;
        if (!anchor && e.target.closest('a')) return;
        if (anchor && anchor.target && anchor.target !== '' && anchor.target !== '_self') return;

        var url = anchor ? anchor.href : null;
        if (!url) {
            var cardLink = card.querySelector('a[href*="quiz.html"]');
            url = cardLink ? cardLink.href : null;
        }
        if (!url) return;

        e.preventDefault();
        e.stopPropagation();
        launch(card, url);
    }, true);
})();
