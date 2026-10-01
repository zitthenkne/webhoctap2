/*
 * quiz-launch-transition.js
 * ---------------------------------------------------------------------------
 * Bấm vào một thẻ bộ đề ở thư viện → lá bài sổ dán xoay vòng rồi "mở thành trang" (~2,3s;
 * làm lại 2026-10-01 theo giao diện sổ dán — người dùng THÍCH cú xoay lá bài, muốn ấn tượng,
 * không cần vội; chỉ thay phần trang trí cũ: gradient hồng-tím, emoji ✨, mặt sau tím).
 *
 *   1. NHẤC + XOAY (≈1,5s): nền thư viện phủ giấy hồng mờ; bản sao của thẻ nhấc lên, bay ra giữa
 *      màn hình, lật 2 vòng rồi đầm xuống. Mặt sau lá bài = giấy CÙNG màu + loại giấy của thẻ,
 *      viền chỉ khâu, băng washi, sticker icon ở giữa. Giấy vụn pastel bung ra lúc đang xoay.
 *      Trang chờ quiz.html nạp ngầm trong iframe phủ kín (đang ẩn).
 *   2. KHÂU (chỉ khi tải lâu hơn cú xoay): đường chỉ nét đứt chạy quanh lá bài — "kim chỉ" báo đang tải.
 *   3. MỞ (≈0,7s): tờ giấy cùng màu thẻ nở ra phủ kín màn hình (clip-path), cùng lúc icon sticker
 *      bay khớp vào ô ảnh sóc và tên đề bay khớp vào tiêu đề của trang chờ (toạ độ ĐO THẲNG trong
 *      iframe cùng origin); trang chờ hiện dần ở nửa sau → bàn giao liền mạch.
 *
 * Bắt click ở pha capture trên document (chạy trước listener của thẻ & mặc định của <a>) —
 * vì vậy side-effect khi bấm thẻ phải gắn ở document (xem library-cards.js markQuizOpened).
 * Giảm hiệu ứng (prefers-reduced-motion) hoặc lỗi → điều hướng thường.
 * Giữ nguyên id #quiz-hero-img / #quiz-title ở quiz.html: file này đo hai ô đó.
 * ---------------------------------------------------------------------------
 */
(function () {
    'use strict';

    // Chỉ chạy ở trang thư viện (index). Tránh tự kích hoạt khi nhúng trong iframe.
    if (window.top !== window.self) return;

    var LIFT_MS = 240;         // nhấc lá bài khỏi trang (nằm trong cùng một mạch hoạt ảnh với cú xoay)
    var SPIN_MS = 1250;        // bay ra giữa + lật 2 vòng + đầm xuống
    var OPEN_AFTER_MIN = LIFT_MS + SPIN_MS + 120;  // xoay xong, khựng một nhịp rồi mới mở
    var STITCH_AFTER = OPEN_AFTER_MIN + 200;       // tải lâu hơn cú xoay mới hiện đường chỉ chạy
    var OPEN_MS = 700;         // tờ giấy nở thành trang + icon/tên đề bay vào chỗ
    var REVEAL_MAX_MS = 9000;  // chờ iframe tối đa rồi vẫn mở (mạng chậm)
    var STYLE_ID = 'quiz-launch-transition-style';
    var EASE_OPEN = 'cubic-bezier(.65,0,.25,1)';   // tăng tốc rồi hạ cánh êm
    var EASE_FLY = 'cubic-bezier(.3,.9,.25,1)';    // bay vọt rồi lắng

    var active = null;
    var prefersReducedMotion = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function injectStyleOnce() {
        if (document.getElementById(STYLE_ID)) return;
        var css = [
            '#quiz-launch-overlay{position:fixed;inset:0;z-index:9998;pointer-events:none;}',
            // Nền thư viện lùi ra sau dưới một lớp giấy hồng phấn mờ (màu phẳng)
            '#quiz-launch-backdrop{position:fixed;inset:0;background:rgba(252,230,239,0);',
            '  transition:background .32s ease,backdrop-filter .32s ease,-webkit-backdrop-filter .32s ease;}',
            '#quiz-launch-backdrop.is-on{background:rgba(252,230,239,.74);',
            '  -webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);}',
            // Tờ giấy (bản sao của thẻ) — nhấc lên, bóng đổ dài ra
            // Lá bài: preserve-3d + ẩn mặt lưng của CHÍNH nó (trong 3D, z-index không quyết định thứ tự
            // vẽ khi lật quá 90° — không ẩn thì Chrome vẽ nền thẻ soi gương đè lên mặt sau)
            '.ql-ghost{position:fixed !important;margin:0 !important;box-sizing:border-box;z-index:2;',
            '  pointer-events:none;animation:none !important;transition:none !important;transform-origin:50% 50%;',
            '  transform-style:preserve-3d;backface-visibility:hidden;-webkit-backface-visibility:hidden;',
            '  will-change:transform;box-shadow:0 30px 50px -22px rgba(150,60,100,.55) !important;}',
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
            '  -webkit-mask:conic-gradient(from 45deg at left,#000 90deg,#0000 0) left/51% 6px repeat-y,conic-gradient(from 225deg at right,#000 90deg,#0000 0) right/51% 6px repeat-y;',
            '  mask:conic-gradient(from 45deg at left,#000 90deg,#0000 0) left/51% 6px repeat-y,conic-gradient(from 225deg at right,#000 90deg,#0000 0) right/51% 6px repeat-y;}',
            '.ql-back-badge{position:relative;height:min(4.6rem,58cqh);aspect-ratio:1;border-radius:24%;',
            '  display:flex;align-items:center;justify-content:center;font-size:min(1.9rem,24cqh);background:#fff;',
            '  color:color-mix(in srgb,var(--ql) 80%,#3a2430);rotate:-6deg;',
            '  box-shadow:0 0 0 4px color-mix(in srgb,var(--ql) 45%,#fff),0 10px 20px -8px rgba(90,40,60,.45);}',
            // Quầng sáng pastel cùng màu thẻ sau lưng lá bài (màu phẳng + blur, không gradient)
            '.ql-glow{position:fixed;left:50%;top:50%;width:min(80vw,560px);aspect-ratio:1;translate:-50% -50%;',
            '  border-radius:50%;z-index:0;opacity:0;pointer-events:none;filter:blur(46px);',
            '  background:color-mix(in srgb,var(--qc-from,#f472b6) 38%,#fff);}',
            // Giấy vụn pastel bung ra lúc lá bài đang xoay
            '.ql-bit{position:fixed;left:50%;top:50%;z-index:3;pointer-events:none;opacity:0;}',
            '.ql-bit.is-icon{font-size:15px;line-height:1;}',
            // Đường chỉ chạy quanh tờ giấy khi đang tải ("kim chỉ")
            '.ql-stitch{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;',
            '  opacity:0;transition:opacity .25s ease;}',
            '.ql-stitch.is-on{opacity:1;}',
            '.ql-stitch rect{fill:none;stroke:var(--qc-from,#f472b6);stroke-width:2.2;stroke-linecap:round;',
            '  stroke-dasharray:7 6;animation:ql-sew .8s linear infinite;}',
            '@keyframes ql-sew{to{stroke-dashoffset:-26;}}',
            // Tờ giấy nở thành trang: giấy caro hồng nhạt, nở bằng clip-path từ đúng hộp của thẻ
            '.ql-sheet{position:fixed;inset:0;z-index:1;--ql:var(--qc-from,#f472b6);',
            '  --ql-line:color-mix(in srgb,var(--ql) 20%,transparent);',
            '  background-color:color-mix(in srgb,var(--ql) 9%,#fffdfa);',
            '  background-image:linear-gradient(var(--ql-line) 1px,transparent 1px),linear-gradient(90deg,var(--ql-line) 1px,transparent 1px);',
            '  background-size:24px 24px;}',
            '.ql-sheet[data-paper="dot"]{background-image:radial-gradient(color-mix(in srgb,var(--ql) 34%,transparent) 1.3px,transparent 1.9px);background-size:20px 20px;}',
            '.ql-sheet[data-paper="lined"]{background-image:linear-gradient(transparent calc(100% - 1px),var(--ql-line) 0);background-size:100% 28px;}',
            // Icon & tên đề bay khớp vào trang chờ (trên cả iframe)
            // Lớp bay nằm TRÊN iframe (overlay ở z 9998 thấp hơn iframe 10000 nên không chứa được nó)
            '#quiz-launch-fly{position:fixed;inset:0;z-index:10001;pointer-events:none;}',
            '.ql-morph{position:fixed;margin:0 !important;pointer-events:none;transform-origin:0 0;',
            '  will-change:transform,opacity;}',
            '.ql-morph-title{white-space:normal;overflow:hidden;}',
            // Trang chờ hiện dần đè lên tờ giấy
            '#quiz-launch-frame{position:fixed;inset:0;width:100%;height:100%;border:0;z-index:10000;',
            '  opacity:0;pointer-events:none;background:#FCE4EC;transition:opacity .36s ease;}',
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

    // Đo ĐÍCH trong iframe (cùng origin, phủ kín màn hình, không zoom → toạ độ trùng cửa sổ)
    function measureTargets(frame) {
        try {
            var doc = frameDoc(frame);
            var img = doc && doc.getElementById('quiz-hero-img');
            var title = doc && doc.getElementById('quiz-title');
            if (!img || !title) return null;
            var box = img.parentElement || img;
            var hr = box.getBoundingClientRect();
            var tr = textRect(title, doc);
            if (!hr.width || !tr.width) return null;
            var cs = (frame.contentWindow || window).getComputedStyle(title);
            var color = cs.color;
            if (!color || /rgba\(0, 0, 0, 0\)|transparent/.test(color)) color = '#be185d';
            return { hero: hr, heroImg: img, title: tr, titleEl: title, titleFont: parseFloat(cs.fontSize) || 28, titleColor: color };
        } catch (e) { return null; }
    }

    function teardown(session) {
        if (!session) return;
        try {
            if (session.overlay && session.overlay.parentNode) session.overlay.parentNode.removeChild(session.overlay);
            if (session.frame && session.frame.parentNode) session.frame.parentNode.removeChild(session.frame);
        } catch (e) {}
        if (session.fly && session.fly.parentNode) session.fly.parentNode.removeChild(session.fly);
        if (session.card) session.card.style.visibility = '';
        document.documentElement.style.overflow = session.prevOverflow || '';
        if (active === session) active = null;
    }

    // Back trong lúc đang xem iframe quiz: gỡ lớp phủ, trả về thư viện
    window.addEventListener('popstate', function () { if (active) teardown(active); });

    function launch(card, url) {
        injectStyleOnce();
        if (tiltCard) { tiltCard.style.transition = 'none'; tiltCard.style.transform = ''; tiltCard = null; }
        var rect = card.getBoundingClientRect();
        var srcTitleEl = findTitleEl(card);
        var srcTitleText = srcTitleEl ? srcTitleEl.textContent.trim() : '';

        var prevOverflow = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden';

        var overlay = document.createElement('div');
        overlay.id = 'quiz-launch-overlay';
        var backdrop = document.createElement('div');
        backdrop.id = 'quiz-launch-backdrop';
        overlay.appendChild(backdrop);

        // Tờ giấy = bản sao của thẻ, đặt đúng chỗ; thẻ thật ẩn đi để không thấy hai tờ
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
        overlay.appendChild(ghost);
        card.style.visibility = 'hidden';

        var glow = document.createElement('div');
        glow.className = 'ql-glow';
        glow.style.setProperty('--qc-from', card.style.getPropertyValue('--qc-from') || '#f472b6');
        overlay.insertBefore(glow, ghost);

        // Đường chỉ (SVG) bám theo mép tờ giấy, chỉ bật khi tải lâu
        var svgNS = 'http://www.w3.org/2000/svg';
        var stitch = document.createElementNS(svgNS, 'svg');
        stitch.setAttribute('class', 'ql-stitch');
        var r = document.createElementNS(svgNS, 'rect');
        r.setAttribute('x', '5'); r.setAttribute('y', '5');
        r.setAttribute('width', Math.max(0, rect.width - 10));
        r.setAttribute('height', Math.max(0, rect.height - 10));
        r.setAttribute('rx', card.classList.contains('quiz-list-card') ? '12' : '17');
        stitch.appendChild(r);
        stitch.style.backfaceVisibility = 'hidden';
        ghost.appendChild(stitch);

        document.body.appendChild(overlay);

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
            overlay: overlay, frame: frame, fly: fly, card: card, prevOverflow: prevOverflow,
            opened: false, frameReady: false, loadCount: 0
        };
        active = session;
        var startTime = Date.now();

        // Đích: giữa màn hình, to vừa mắt (thẻ danh sách vốn đã rộng thì gần như giữ cỡ)
        var W0 = window.innerWidth, H0 = window.innerHeight;
        var isList = card.classList.contains('quiz-list-card');
        var S = Math.max(1.04, Math.min((isList ? 0.92 * W0 : Math.min(440, 0.9 * W0)) / rect.width, 0.62 * H0 / rect.height));
        var dx = W0 / 2 - (rect.left + rect.width / 2), dy = H0 / 2 - (rect.top + rect.height / 2);
        var settled = 'translate(' + dx + 'px,' + dy + 'px) scale(' + S + ')';
        var P = ' perspective(1300px) ';
        var spin = null;
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                backdrop.classList.add('is-on');
                // Một mạch duy nhất: nhấc tại chỗ → bay ra giữa + lật 2 vòng (rotateY 720°) → vượt đích
                // một chút rồi đầm xuống như vật thật. Cùng danh sách hàm transform ở mọi mốc → nội suy
                // từng hàm, quay đủ 2 vòng (không bị rút gọn thành 0°).
                spin = ghost.animate([
                    { transform: 'translate(0px,0px)' + P + 'rotateZ(0deg) rotateY(0deg) scale(1)', easing: 'cubic-bezier(.2,.9,.3,1.2)' },
                    { offset: LIFT_MS / (LIFT_MS + SPIN_MS), transform: 'translate(0px,-12px)' + P + 'rotateZ(-5deg) rotateY(0deg) scale(1.06)', easing: 'cubic-bezier(.16,.72,.2,1.045)' },
                    { transform: 'translate(' + dx + 'px,' + dy + 'px)' + P + 'rotateZ(0deg) rotateY(720deg) scale(' + S + ')' }
                ], { duration: LIFT_MS + SPIN_MS, fill: 'forwards' });
                spin.onfinish = settle;
                glow.animate([{ opacity: 0, scale: 0.6 }, { opacity: 0.85, scale: 1 }],
                    { duration: 700, delay: LIFT_MS + 200, easing: 'ease-out', fill: 'forwards' });
                setTimeout(function () { burstConfetti(overlay, card); }, LIFT_MS + Math.round(SPIN_MS * 0.42));
            });
        });
        // Chốt lá bài ở tư thế đứng yên 2D (bỏ hoạt ảnh đang giữ khung cuối) → đo/clip chuẩn
        function settle() {
            if (session.settled) return;
            session.settled = true;
            if (spin) spin.cancel();
            ghost.style.transform = settled;
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
            clearTimeout(stitchTimer);
            stitch.classList.remove('is-on');
            glow.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: 420, easing: 'ease-out', fill: 'forwards' });
            try { history.pushState({ quizLaunch: true }, '', url); } catch (e) {}

            primeFrameTitle();
            var targets = measureTargets(frame);
            var g = ghost.getBoundingClientRect();
            var W = window.innerWidth, H = window.innerHeight;

            // 1) Tờ giấy nở từ đúng hộp tờ đang nhấc → phủ kín màn hình
            var sheet = document.createElement('div');
            sheet.className = 'ql-sheet';
            sheet.style.setProperty('--qc-from', card.style.getPropertyValue('--qc-from') || '#f472b6');
            if (card.dataset.paper) sheet.dataset.paper = card.dataset.paper;
            overlay.insertBefore(sheet, ghost);   // nằm DƯỚI tờ giấy: tờ giấy tan dần trên nền đang nở
            var from = 'inset(' + g.top + 'px ' + (W - g.right) + 'px ' + (H - g.bottom) + 'px ' + g.left + 'px round 18px)';
            sheet.animate([{ clipPath: from }, { clipPath: 'inset(0px 0px 0px 0px round 0px)' }],
                { duration: OPEN_MS, easing: EASE_OPEN, fill: 'forwards' });
            ghost.animate([{ opacity: 1 }, { opacity: 0 }],
                { duration: Math.round(OPEN_MS * 0.42), easing: 'ease-out', fill: 'forwards' });

            // 2) Icon + tên đề bay khớp vào trang chờ
            if (targets) flyParts(targets);

            // 3) Trang chờ hiện dần ở nửa sau chuyến bay
            setTimeout(function () { frame.classList.add('is-on'); }, Math.round(OPEN_MS * 0.6));
            setTimeout(function () {
                try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) {}
                try { if (fly.parentNode) fly.parentNode.removeChild(fly); } catch (e) {}
            }, OPEN_MS + 420);
        }

        function flyParts(t) {
            var icon = ghost.querySelector('.quiz-card-icon');
            var title = findTitleEl(ghost);
            var parts = [];
            var lift = rect.width ? ghost.getBoundingClientRect().width / rect.width : 1; // tờ giấy đang phóng 1.035
            var HANDOFF = Math.round(OPEN_MS * 0.82);   // lúc giao ca: thật hiện dần, bản bay tan dần

            if (icon) {
                var ir = icon.getBoundingClientRect();
                var clone = icon.cloneNode(true);
                clone.classList.add('ql-morph');
                // Kích thước gốc (chưa scale của cú nhấc) + transform → nội dung <i> giữ tỉ lệ
                var iw = icon.offsetWidth || ir.width, ih = icon.offsetHeight || ir.height;
                clone.style.left = '0px'; clone.style.top = '0px';
                clone.style.width = iw + 'px'; clone.style.height = ih + 'px';
                clone.style.rotate = '0deg';
                var ics = getComputedStyle(icon);
                clone.style.setProperty('background', ics.backgroundColor, 'important');
                clone.style.color = ics.color;
                clone.style.borderRadius = ics.borderRadius;
                clone.style.boxShadow = ics.boxShadow;
                clone.style.fontSize = ics.fontSize;
                clone.style.display = 'flex';
                clone.style.alignItems = 'center';
                clone.style.justifyContent = 'center';
                var s0 = ir.width / iw;
                var s1 = Math.min(t.hero.width / iw, t.hero.height / ih);
                var x1 = t.hero.left + (t.hero.width - iw * s1) / 2, y1 = t.hero.top + (t.hero.height - ih * s1) / 2;
                fly.appendChild(clone);
                icon.style.visibility = 'hidden';   // bản bay tách ra → ô trên tờ giấy trống, không thấy 2 cái
                clone.animate([
                    { transform: 'translate(' + ir.left + 'px,' + ir.top + 'px) scale(' + s0 + ') rotate(-4deg)' },
                    { transform: 'translate(' + x1 + 'px,' + y1 + 'px) scale(' + s1 + ') rotate(0deg)' }
                ], { duration: OPEN_MS, easing: EASE_FLY, fill: 'forwards' });
                parts.push(clone);
                hideUntilLanded(t.heroImg);
            }

            if (title) {
                var tr = textRect(title);
                var cs = getComputedStyle(title);
                var f0 = parseFloat(cs.fontSize) || 16;
                var tclone = document.createElement('div');
                tclone.className = 'ql-morph ql-morph-title';
                tclone.textContent = srcTitleText;
                tclone.style.left = '0px'; tclone.style.top = '0px';
                tclone.style.width = Math.ceil(tr.width / lift) + 2 + 'px';
                tclone.style.font = cs.fontWeight + ' ' + f0 + 'px/' + cs.lineHeight + ' ' + cs.fontFamily;
                tclone.style.letterSpacing = cs.letterSpacing;
                tclone.style.textAlign = cs.textAlign || 'left';
                tclone.style.maxHeight = Math.ceil(tr.height / lift) + 2 + 'px';
                tclone.style.color = cs.color;
                fly.appendChild(tclone);
                title.style.visibility = 'hidden';
                var k = t.titleFont / f0;
                tclone.animate([
                    { transform: 'translate(' + tr.left + 'px,' + tr.top + 'px) scale(' + lift + ')', color: cs.color,
                      width: (Math.ceil(tr.width / lift) + 2) + 'px', maxHeight: (Math.ceil(tr.height / lift) + 2) + 'px' },
                    // Khổ chữ đích chừa rộng 6% (phông/độ đậm khác nhau dễ đẩy chữ cuối xuống thêm dòng),
                    // cắt đúng chiều cao khối đích → không lòi dòng thừa
                    { transform: 'translate(' + t.title.left + 'px,' + t.title.top + 'px) scale(' + k + ')', color: t.titleColor,
                      width: Math.ceil(t.title.width * 1.06 / k) + 'px', maxHeight: Math.ceil(t.title.height / k) + 'px' }
                ], { duration: OPEN_MS, easing: EASE_FLY, fill: 'forwards' });
                parts.push(tclone);
                hideUntilLanded(t.titleEl);
            }

            // Hạ cánh = MỜ CHÉO: bản bay tan dần đúng lúc phần thật của trang chờ hiện dần tại cùng chỗ
            setTimeout(function () {
                parts.forEach(function (p) {
                    p.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-in-out', fill: 'forwards' });
                });
            }, HANDOFF);
        }

        // Giấu phần thật trong trang chờ (ảnh sóc / tiêu đề) tới lúc giao ca rồi cho hiện dần
        function hideUntilLanded(el) {
            if (!el) return;
            try {
                el.style.opacity = '0';
                setTimeout(function () {
                    el.style.transition = 'opacity .26s ease-in-out';
                    el.style.opacity = '';
                    setTimeout(function () { el.style.transition = ''; }, 320);
                }, Math.round(OPEN_MS * 0.82));
            } catch (e) {}
        }

        frame.addEventListener('load', function () {
            session.loadCount++;
            if (session.loadCount === 1) {
                session.frameReady = true;
                tryOpen();
                return;
            }
            // Điều hướng nội bộ trong iframe về index.html ("Về trang chủ") → điều hướng cả trang
            try {
                var loc = frame.contentWindow.location;
                if (loc && /index\.html$/.test(loc.pathname)) window.location.href = loc.href;
            } catch (e) {}
        });
        frame.addEventListener('error', function () { window.location.href = url; });
        setTimeout(function () {
            if (!session.opened) { session.frameReady = true; open(); }
        }, REVEAL_MAX_MS);
    }

    // Giấy vụn pastel (vuông / tròn / dải + vài ngôi sao, trái tim) bung ra từ giữa màn hình
    function burstConfetti(overlay, card) {
        var base = card.style.getPropertyValue('--qc-from') || '#f472b6';
        var colors = [base, '#f9a8d4', '#fde68a', '#a7f3d0', '#bae6fd', '#fbcfe8', '#fed7aa'];
        var icons = ['fa-star', 'fa-heart', 'fa-star', 'fa-heart'];
        var n = 22;
        for (var i = 0; i < n; i++) {
            var b = document.createElement('span');
            var isIcon = i < icons.length;
            b.className = 'ql-bit' + (isIcon ? ' is-icon' : '');
            var c = colors[i % colors.length];
            if (isIcon) {
                b.innerHTML = '<i class="fas ' + icons[i] + '"></i>';
                b.style.color = c;
            } else {
                var shape = i % 3;
                b.style.width = (shape === 2 ? 5 : 9) + 'px';
                b.style.height = (shape === 2 ? 14 : 9) + 'px';
                b.style.borderRadius = shape === 1 ? '50%' : '2px';
                b.style.background = c;
            }
            overlay.appendChild(b);
            var ang = (Math.PI * 2 * i) / n + Math.random() * 0.4;
            var dist = 170 + Math.random() * 170;
            var x = Math.cos(ang) * dist, y = Math.sin(ang) * dist;
            var spinDeg = (Math.random() < 0.5 ? -1 : 1) * (200 + Math.random() * 300);
            b.animate([
                { transform: 'translate(-50%,-50%) scale(.3) rotate(0deg)', opacity: 0 },
                { offset: 0.18, opacity: 1 },
                { transform: 'translate(calc(-50% + ' + (x * 0.85) + 'px),calc(-50% + ' + (y * 0.85) + 'px)) scale(1) rotate(' + (spinDeg * 0.7) + 'deg)', opacity: 1, offset: 0.7 },
                { transform: 'translate(calc(-50% + ' + x + 'px),calc(-50% + ' + (y + 40) + 'px)) scale(.9) rotate(' + spinDeg + 'deg)', opacity: 0 }
            ], { duration: 1000 + Math.random() * 500, easing: 'cubic-bezier(.2,.75,.3,1)', fill: 'forwards' });
        }
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
