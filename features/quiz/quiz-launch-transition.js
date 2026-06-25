/*
 * quiz-launch-transition.js
 * ---------------------------------------------------------------------------
 * Nâng cấp trải nghiệm khi bấm "Làm bài" trên thẻ bộ đề ở thư viện:
 *   1. Làm mờ + tối toàn bộ giao diện xung quanh.
 *   2. Thẻ bộ đề được chọn "nhấc" lên, phóng to ra giữa màn hình như đang mở ra.
 *   3. TRONG LÚC diễn ra hoạt ảnh, trang quiz.html tương ứng được nạp ngầm trong
 *      một iframe phủ kín màn hình (ẩn). Khi hoạt ảnh xong & iframe đã sẵn sàng,
 *      iframe hiện ra mượt mà -> người dùng không cảm nhận được độ trễ load trang.
 *
 * Module này KHÔNG cần sửa quiz-library-controller.js: nó bắt sự kiện click ở
 * pha capture trên document, nên chạy trước cả listener của thẻ và mặc định của
 * thẻ <a>. Nếu trình duyệt giảm hiệu ứng (prefers-reduced-motion) hoặc môi trường
 * không phù hợp thì rơi về điều hướng thường.
 * ---------------------------------------------------------------------------
 */
(function () {
    'use strict';

    // Chỉ chạy ở trang thư viện (index). Tránh tự kích hoạt khi nhúng trong iframe.
    if (window.top !== window.self) return;

    var FLY_MS = 1700;         // thời lượng pha "bay ra giữa + lật vòng vòng + phóng to"
    var SETTLE_MS = 450;       // khựng lại một chút sau khi lật xong
    var REVEAL_MIN_MS = FLY_MS + SETTLE_MS; // chờ đủ rồi mới "mở ra" toàn màn hình
    var REVEAL_MAX_MS = 9000;  // chờ iframe tối đa rồi vẫn hiện (đề phòng mạng chậm)
    var STYLE_ID = 'quiz-launch-transition-style';

    var active = null;   // tham chiếu phiên hoạt ảnh đang chạy (để dọn dẹp / xử lý back)
    var tiltCard = null; // thẻ đang được nghiêng theo con trỏ

    var prefersReducedMotion = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function injectStyleOnce() {
        if (document.getElementById(STYLE_ID)) return;
        var css = [
            // ---- Hover: thẻ to nhẹ + nghiêng 3D theo con trỏ (do JS điều khiển transform) ----
            // Lưu ý: KHÔNG đặt transform-style/transform cố định lên thẻ, vì sẽ tạo
            // stacking-context khiến menu "..." (z-20) bị thẻ bên dưới đè lên.
            '.qz-tilt-on{box-shadow:0 32px 64px rgba(255,105,180,0.38), 0 12px 28px rgba(0,0,0,0.18) !important;',
            '  border-color:rgba(255,105,180,0.55) !important;z-index:5;}',

            // ---- Điện thoại: thẻ lưới cao/dày hơn (vuông vắn hơn) cho hợp hoạt ảnh phóng to ----
            '@media (max-width:767px){',
            '  #quiz-list-container .quiz-grid-card{min-height:172px;padding:1.15rem 1.2rem !important;',
            '    border-radius:1.4rem !important;gap:.35rem;}',
            '  #quiz-list-container .quiz-grid-card .quiz-card-icon{width:3.1rem;height:3.1rem;font-size:1.15rem;}',
            '  #quiz-list-container .quiz-grid-card h3{font-size:1rem;}',
            '}',

            // ---- Lớp phủ khi mở bộ đề ----
            '#quiz-launch-overlay{position:fixed;inset:0;z-index:9998;pointer-events:none;}',
            '#quiz-launch-backdrop{position:fixed;inset:0;z-index:9998;opacity:0;',
            '  background:radial-gradient(120% 120% at 50% 50%, rgba(255,105,180,0.20), rgba(17,12,20,0.45) 72%);',
            '  -webkit-backdrop-filter:blur(0px);backdrop-filter:blur(0px);',
            '  transition:opacity .8s ease, backdrop-filter .8s ease, -webkit-backdrop-filter .8s ease;}',
            '#quiz-launch-backdrop.is-on{opacity:1;-webkit-backdrop-filter:blur(11px) saturate(1.15);backdrop-filter:blur(11px) saturate(1.15);}',

            // Quầng sáng "thở" phía sau thẻ
            '#quiz-launch-glow{position:fixed;inset:0;margin:auto;width:min(85vw,660px);height:min(85vw,660px);',
            '  z-index:9998;border-radius:50%;pointer-events:none;opacity:0;transform:scale(.7);',
            '  background:radial-gradient(circle, rgba(255,150,205,0.55), rgba(168,139,250,0.28) 45%, transparent 70%);',
            '  filter:blur(26px);transition:opacity .7s ease, transform .7s ease;}',
            '#quiz-launch-glow.is-on{opacity:1;transform:scale(1);animation:quiz-launch-breathe 2.6s ease-in-out infinite;}',
            '@keyframes quiz-launch-breathe{0%,100%{transform:scale(.92);}50%{transform:scale(1.08);}}',

            // Vòng sáng bùng ra khi trang lộ diện
            '#quiz-launch-ring{position:fixed;inset:0;margin:auto;width:44px;height:44px;border-radius:50%;',
            '  z-index:9999;border:3px solid rgba(255,255,255,0.85);opacity:0;pointer-events:none;',
            '  box-shadow:0 0 18px rgba(255,150,205,0.7);}',
            '#quiz-launch-ring.is-on{animation:quiz-launch-ring .75s ease-out forwards;}',
            '@keyframes quiz-launch-ring{0%{opacity:.9;transform:scale(.3);}100%{opacity:0;transform:scale(15);}}',

            // Thẻ bay ra giữa: vừa phóng to vừa lật vòng vòng (3 vòng) rồi khựng lại
            '.quiz-launch-ghost{position:fixed;z-index:9999;margin:0;box-sizing:border-box;',
            '  transform-origin:center center;will-change:transform,opacity;pointer-events:none;backface-visibility:visible;',
            '  transition:transform .7s cubic-bezier(.5,0,.55,1), box-shadow .5s ease, opacity .45s ease;',
            '  box-shadow:0 40px 90px rgba(255,105,180,0.40), 0 12px 30px rgba(0,0,0,0.22);}',
            // Một mạch duy nhất (2 mốc) để trình duyệt nội suy liên tục -> xoay đều,
            // không bị khựng ở các mốc giữa. Easing đặt ở JS (giảm tốc dần khi về đích).
            '@keyframes quiz-launch-fly{',
            '  0%{transform:translate(0px,0px) perspective(1300px) rotateZ(-8deg) rotateY(0deg) scale(1.04);}',
            '  100%{transform:translate(var(--fx),var(--fy)) perspective(1300px) rotateZ(0deg) rotateY(1080deg) scale(var(--fs));}}',

            // Tia sáng quét ngang thẻ lúc bay
            '.quiz-launch-shine{position:absolute;inset:0;border-radius:inherit;overflow:hidden;pointer-events:none;z-index:6;}',
            '.quiz-launch-shine::before{content:"";position:absolute;top:-50%;left:-70%;width:55%;height:200%;',
            '  background:linear-gradient(115deg, transparent, rgba(255,255,255,0.55), transparent);',
            '  transform:rotate(9deg);animation:quiz-launch-sweep 1.15s .3s ease-in-out 1;}',
            '@keyframes quiz-launch-sweep{0%{left:-70%;}100%{left:140%;}}',

            // Vài đốm lấp lánh bay quanh thẻ
            '.quiz-launch-spark{position:fixed;z-index:9999;pointer-events:none;font-size:18px;opacity:0;',
            '  will-change:transform,opacity;}',
            '@keyframes quiz-launch-spark{0%{opacity:0;transform:translate(0,0) scale(.2) rotate(0deg);}',
            '  20%{opacity:1;}100%{opacity:0;transform:translate(var(--sx),var(--sy)) scale(1.1) rotate(160deg);}}',

            // Trang quiz đi vào: bắt đầu phóng to tràn màn hình rồi thu về kích thước chuẩn
            // -> nối liền mạch với pha thẻ "bung" kín màn hình, chuyển ảnh mượt hơn.
            '#quiz-launch-frame{position:fixed;inset:0;width:100%;height:100%;border:0;z-index:10000;',
            '  opacity:0;pointer-events:none;background:#FCE4EC;',
            '  transform:scale(1.22);transform-origin:center center;will-change:transform,opacity;',
            '  transition:opacity .45s ease, transform 1.05s cubic-bezier(.2,.7,.2,1);}',
            '#quiz-launch-frame.is-on{opacity:1;transform:scale(1);pointer-events:auto;}',
            'html.theme-dark #quiz-launch-frame{background:#1f2430;}',
            '@media (prefers-reduced-motion: reduce){',
            '  #quiz-launch-backdrop,.quiz-launch-ghost,#quiz-launch-frame,#quiz-launch-glow{transition-duration:.01ms !important;}',
            '  .quiz-launch-ghost,#quiz-launch-glow.is-on,.quiz-launch-shine::before{animation:none !important;}}'
        ].join('\n');
        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = css;
        document.head.appendChild(style);
    }

    // Tìm thẻ bộ đề chứa liên kết được bấm.
    function findCard(el) {
        return el.closest && el.closest('.quiz-grid-card, .quiz-list-card');
    }

    // Đang ở chế độ chọn nhiều? (lúc đó thẻ render kèm checkbox .bulk-quiz-checkbox)
    function inSelectionMode() {
        return !!document.querySelector('.bulk-quiz-checkbox');
    }

    function teardown(session) {
        if (!session) return;
        try {
            if (session.overlay && session.overlay.parentNode) session.overlay.parentNode.removeChild(session.overlay);
            if (session.frame && session.frame.parentNode) session.frame.parentNode.removeChild(session.frame);
        } catch (e) {}
        document.documentElement.style.overflow = session.prevOverflow || '';
        if (active === session) active = null;
    }

    // Khi người dùng bấm Back trong lúc đang xem iframe quiz: gỡ lớp phủ, trả về thư viện.
    window.addEventListener('popstate', function () {
        if (active) teardown(active);
    });

    function launch(card, url) {
        injectStyleOnce();

        // Gỡ hiệu ứng nghiêng đang áp lên thẻ để đo & sao chép cho chuẩn
        if (tiltCard) { resetTilt(tiltCard); tiltCard = null; }
        card.style.transform = '';
        card.style.transition = '';

        var rect = card.getBoundingClientRect();
        var prevOverflow = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden';

        // --- Lớp phủ (overlay) chứa backdrop làm mờ + bản sao "bóng ma" của thẻ ---
        var overlay = document.createElement('div');
        overlay.id = 'quiz-launch-overlay';

        var backdrop = document.createElement('div');
        backdrop.id = 'quiz-launch-backdrop';
        overlay.appendChild(backdrop);

        // Quầng sáng + vòng sáng + đốm lấp lánh cho ấn tượng
        var glow = document.createElement('div');
        glow.id = 'quiz-launch-glow';
        overlay.appendChild(glow);

        var ring = document.createElement('div');
        ring.id = 'quiz-launch-ring';
        overlay.appendChild(ring);

        // Bản sao của thẻ để phóng to (giữ nguyên class -> giữ nguyên giao diện)
        var ghost = card.cloneNode(true);
        ghost.classList.add('quiz-launch-ghost');
        ghost.classList.remove('hover:-translate-y-1', 'qz-tilt-on'); // tránh xung đột transform
        ghost.style.left = rect.left + 'px';
        ghost.style.top = rect.top + 'px';
        ghost.style.width = rect.width + 'px';
        ghost.style.height = rect.height + 'px';
        // tư thế "nhấc lên" ban đầu (khớp 0% của keyframes để không bị giật khi bắt đầu)
        ghost.style.transform = 'translate(0px,0px) perspective(1300px) rotateZ(-8deg) rotateY(0deg) scale(1.04)';
        // Tia sáng quét ngang
        var shine = document.createElement('div');
        shine.className = 'quiz-launch-shine';
        ghost.appendChild(shine);
        overlay.appendChild(ghost);

        document.body.appendChild(overlay);

        // Tạo các đốm lấp lánh bay toả ra từ giữa màn hình
        spawnSparkles(overlay);

        // --- iframe nạp ngầm nội dung quiz.html ---
        var frame = document.createElement('iframe');
        frame.id = 'quiz-launch-frame';
        frame.setAttribute('title', 'Trang làm bài');
        frame.src = url;
        document.body.appendChild(frame);

        var session = {
            overlay: overlay, frame: frame, ghost: ghost,
            backdrop: backdrop, prevOverflow: prevOverflow,
            revealed: false, frameReady: false, loadCount: 0
        };
        active = session;

        // --- Tính đích phóng to: đưa thẻ ra giữa màn hình, to vừa phải ---
        var targetW = Math.min(window.innerWidth * 0.92, 560);
        var scale = targetW / rect.width;
        // Giới hạn để thẻ không tràn quá chiều cao màn hình
        var maxScaleByH = (window.innerHeight * 0.9) / rect.height;
        scale = Math.min(scale, maxScaleByH);
        if (!isFinite(scale) || scale <= 0) scale = 1;
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        var dx = (window.innerWidth / 2) - cx;
        var dy = (window.innerHeight / 2) - cy;

        // Trạng thái "đứng yên" sau khi lật xong (rotateY 1080° ≡ 0° về mặt hình ảnh)
        var settledTransform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + scale + ')';
        // Hệ số phóng để thẻ phủ KÍN màn hình ở pha "mở ra" cuối cùng
        var coverScale = Math.max(window.innerWidth / rect.width, window.innerHeight / rect.height) * 1.08;

        // Truyền đích bay/phóng cho keyframes qua biến CSS
        ghost.style.setProperty('--fx', dx + 'px');
        ghost.style.setProperty('--fy', dy + 'px');
        ghost.style.setProperty('--fs', scale);

        // Bật hoạt ảnh ở khung hình kế tiếp: thẻ bay ra giữa, lật vòng vòng rồi khựng lại
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                backdrop.classList.add('is-on');
                glow.classList.add('is-on');
                // Bắt đầu nhanh rồi giảm tốc mượt về đích (decelerate) -> xoay & phóng liền mạch
                ghost.style.animation = 'quiz-launch-fly ' + (FLY_MS / 1000) +
                    's cubic-bezier(.12,.66,.18,1) forwards';
            });
        });

        var startTime = Date.now();

        function tryReveal() {
            if (session.revealed) return;
            if (!session.frameReady) return;
            var elapsed = Date.now() - startTime;
            if (elapsed < REVEAL_MIN_MS) {
                setTimeout(tryReveal, REVEAL_MIN_MS - elapsed);
                return;
            }
            doReveal();
        }

        function doReveal() {
            if (session.revealed) return;
            session.revealed = true;

            // Cập nhật thanh địa chỉ & lịch sử để Back quay lại thư viện đúng cách
            try { history.pushState({ quizLaunch: true }, '', url); } catch (e) {}

            ring.classList.add('is-on');   // vòng sáng bùng ra
            glow.style.opacity = '0';
            backdrop.style.opacity = '0';

            // Chốt trạng thái đứng yên rồi mới chuyển sang transition (animation đang
            // giữ frame 100% sẽ đè inline-style nếu không gỡ trước).
            ghost.style.animation = 'none';
            ghost.style.transform = settledTransform;
            void ghost.offsetWidth; // ép reflow để mốc transition là trạng thái đứng yên

            // PHA "MỞ RA": thẻ bung nhanh phủ KÍN màn hình + bo góc về 0, rồi tan NHANH
            // để nhường chỗ cho trang quiz tự co từ-to-về-chuẩn ở phần lộ rõ phía sau.
            ghost.style.transition = 'transform .5s cubic-bezier(.5,0,.55,1), ' +
                'border-radius .45s ease, box-shadow .4s ease, opacity .32s ease';
            ghost.style.borderRadius = '0px';
            ghost.style.boxShadow = 'none';
            ghost.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + coverScale + ')';

            // iframe (đang phóng to tràn màn hình) lộ ra sớm; thẻ tan nhanh để thấy rõ
            // pha trang quiz THU NHỎ dần về kích thước chuẩn.
            setTimeout(function () { frame.classList.add('is-on'); }, 180);
            setTimeout(function () { ghost.style.opacity = '0'; }, 240);

            setTimeout(function () {
                // Gỡ lớp phủ (thẻ/backdrop); iframe vẫn tiếp tục co về scale(1) ở phía sau.
                try {
                    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                } catch (e) {}
            }, 720);
        }

        // iframe đã tải xong -> sẵn sàng để lộ
        frame.addEventListener('load', function () {
            session.loadCount++;
            if (session.loadCount === 1) {
                session.frameReady = true;
                tryReveal();
                return;
            }
            // Điều hướng nội bộ trong iframe (vd. bấm "Về trang chủ" / "Thư viện"):
            // nếu quay về index.html thì thoát iframe, điều hướng cả trang cho gọn.
            try {
                var loc = frame.contentWindow.location;
                if (loc && /index\.html$/.test(loc.pathname)) {
                    window.location.href = loc.href;
                }
            } catch (e) {}
        });

        // Phòng khi iframe lỗi hoặc quá lâu: vẫn hiện sau REVEAL_MAX_MS, hoặc rơi về điều hướng thường
        frame.addEventListener('error', function () {
            window.location.href = url;
        });
        setTimeout(function () {
            if (!session.revealed) {
                session.frameReady = true;
                doReveal();
            }
        }, REVEAL_MAX_MS);
    }

    // Tạo các đốm lấp lánh toả ra từ giữa màn hình khi mở bộ đề
    function spawnSparkles(overlay) {
        var emojis = ['✨', '⭐', '💫', '🌟']; // ✨ ⭐ 💫 🌟
        var n = 10;
        var ccx = window.innerWidth / 2;
        var ccy = window.innerHeight / 2;
        for (var i = 0; i < n; i++) {
            var s = document.createElement('div');
            s.className = 'quiz-launch-spark';
            s.textContent = emojis[i % emojis.length];
            var ang = (Math.PI * 2 * i) / n + Math.random() * 0.5;
            var dist = 120 + Math.random() * 160;
            s.style.left = ccx + 'px';
            s.style.top = ccy + 'px';
            s.style.setProperty('--sx', Math.cos(ang) * dist + 'px');
            s.style.setProperty('--sy', Math.sin(ang) * dist + 'px');
            s.style.animation = 'quiz-launch-spark ' + (0.9 + Math.random() * 0.6) + 's ' +
                (0.25 + Math.random() * 0.35) + 's ease-out forwards';
            overlay.appendChild(s);
        }
    }

    // ---- Hover: thẻ to nhẹ + nghiêng 3D theo vị trí con trỏ ----
    function resetTilt(card) {
        if (!card) return;
        card.style.transition = 'transform .55s cubic-bezier(.22,1,.36,1), box-shadow .3s ease';
        card.style.transform = '';
        card.classList.remove('qz-tilt-on');
    }
    function applyTilt(card, e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width;   // 0..1
        var py = (e.clientY - r.top) / r.height;   // 0..1
        var rx = (0.5 - py) * 30;                   // nghiêng trên/dưới (rất mạnh)
        var ry = (px - 0.5) * 36;                   // nghiêng trái/phải (rất mạnh)
        card.style.transform = 'perspective(520px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' +
            ry.toFixed(2) + 'deg) scale(1.11)';
    }
    document.addEventListener('pointermove', function (e) {
        if (prefersReducedMotion || active) return;
        if (e.pointerType && e.pointerType !== 'mouse') return; // chỉ áp dụng cho chuột
        var card = (e.target.closest && e.target.closest('.quiz-grid-card, .quiz-list-card')) || null;
        if (card && inSelectionMode()) card = null;             // đang chọn nhiều thì thôi
        if (card && card.querySelector('.quiz-menu:not(.hidden)')) card = null; // menu "..." đang mở
        if (card !== tiltCard) {
            if (tiltCard) resetTilt(tiltCard);
            tiltCard = card;
            if (card) {
                card.style.transition = 'transform .12s ease-out, box-shadow .25s ease';
                card.classList.add('qz-tilt-on');
            }
        }
        if (card) applyTilt(card, e);
    }, true);
    // Con trỏ rời khỏi cửa sổ -> trả thẻ về phẳng
    document.addEventListener('pointerleave', function () {
        if (tiltCard) { resetTilt(tiltCard); tiltCard = null; }
    });
    // Mở menu "..." -> gỡ NGAY hiệu ứng nghiêng (xoá hẳn transform, không để lại
    // stacking-context) để menu đổ xuống không bị thẻ bên dưới che mất.
    document.addEventListener('click', function (e) {
        if (!e.target.closest) return;
        if (e.target.closest('.quiz-menu-btn') && tiltCard) {
            tiltCard.style.transition = 'none';
            tiltCard.style.transform = '';
            tiltCard.classList.remove('qz-tilt-on');
            tiltCard = null;
        }
    }, true);

    // Bắt click ở pha capture: chạy trước listener của thẻ và mặc định của <a>.
    // Phủ TOÀN BỘ thẻ bộ đề (không chỉ nút "Làm bài"): bấm vào tên đề, biểu tượng
    // hay vùng trống của thẻ đều cho ra cùng một hoạt ảnh — vì cả thẻ vốn dẫn sang
    // quiz.html (xem quiz-library-controller.js).
    document.addEventListener('click', function (e) {
        if (prefersReducedMotion) return;            // tôn trọng cài đặt giảm hiệu ứng
        if (active) return;                          // đang có phiên chạy rồi
        if (e.defaultPrevented) return;
        if (e.button !== 0) return;                  // chỉ chuột trái
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; // mở tab mới...
        if (!e.target.closest) return;

        var card = findCard(e.target);
        if (!card) return;                           // chỉ áp dụng cho thẻ bộ đề ở thư viện
        if (inSelectionMode()) return;               // đang chọn nhiều -> để xử lý mặc định

        var anchor = e.target.closest('a[href*="quiz.html"]');
        // Bấm vào các nút điều khiển (ghim, sửa, chia sẻ, menu, checkbox...) -> bỏ qua,
        // để handler riêng của chúng chạy. Liên kết "Làm bài"/tên đề thì vẫn nhận.
        if (!anchor && e.target.closest('button, .quiz-menu, .quiz-menu-btn, input')) return;
        // Có bấm vào một liên kết khác không trỏ sang quiz.html thì để mặc định.
        if (!anchor && e.target.closest('a')) return;
        if (anchor && anchor.target && anchor.target !== '' && anchor.target !== '_self') return;

        // URL ưu tiên từ liên kết được bấm; nếu bấm vùng trống thì lấy từ liên kết của thẻ.
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

    // Nạp style ngay khi tải trang để dáng thẻ (mobile) & hiệu ứng hover áp dụng từ đầu.
    injectStyleOnce();
})();
