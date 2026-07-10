/*
 * quiz-launch-transition.js
 * ---------------------------------------------------------------------------
 * Nâng cấp trải nghiệm khi bấm "Làm bài" trên thẻ bộ đề ở thư viện:
 *   1. Làm mờ + tối toàn bộ giao diện xung quanh.
 *   2. Thẻ bộ đề được chọn "nhấc" lên, bay ra giữa màn hình, LẬT VÒNG VÒNG (3 vòng)
 *      rồi khựng lại — pha "mở bài" quen thuộc.
 *   3. PHA KẾT = MORPH (shared-element): thay vì thẻ phóng to rồi nhạt đi nhạt nhẽo,
 *      icon của thẻ TÁCH RA, bay + phóng to khớp đúng vào ô ảnh sóc của trang chờ rồi
 *      cross-fade thành con sóc; tên đề trượt khớp vào tiêu đề gradient. Toạ độ đích
 *      được ĐO THẲNG trong iframe (cùng origin) nên khớp pixel.
 *   4. Trong lúc hoạt ảnh, quiz.html được nạp ngầm trong iframe phủ kín (ẩn). Khi
 *      morph hạ cánh thì iframe hiện ra -> nối liền mạch, không thấy độ trễ load.
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
    var SETTLE_MS = 340;       // nhịp khựng ngắn sau khi lật xong (spin dừng hẳn rồi mới morph)
    var TITLE_LIFT_MS = 320;   // nhịp 1: nâng tên đề (chữ đen) lên khỏi thẻ
    var TITLE_SWEEP_MS = 520;  // nhịp 2: quét đổi màu gradient dọc theo chiều dài tên
    var MORPH_MS = 950;        // nhịp 3: morph icon/tên đề bay vào trang chờ
    var TITLE_LEAD_MS = 90;    // icon nở thành sóc hơi trễ so với tên đề khi bay -> có biên đạo
    var REVEAL_MIN_MS = FLY_MS + SETTLE_MS; // chờ đủ rồi mới bắt đầu morph
    var REVEAL_MAX_MS = 9000;  // chờ iframe tối đa rồi vẫn hiện (đề phòng mạng chậm)
    var HERO_RADIUS = 24;      // bo góc ô ảnh sóc trên trang chờ (rounded-3xl ≈ 1.5rem)
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

            // Quầng sáng "thở" phía sau thẻ / ô ảnh sóc
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

            // ---- PHA MORPH: icon & tên đề "tách" khỏi thẻ, bay khớp vào trang chờ ----
            '.quiz-launch-morph{position:fixed;z-index:10001;margin:0;box-sizing:border-box;pointer-events:none;',
            '  transform-origin:center center;will-change:transform,opacity;backface-visibility:hidden;}',
            // Tên đề khi morph: LUÔN một hàng (dàn ra, không xuống dòng, không cắt "…")
            '.quiz-launch-morph-title{display:inline-grid;place-items:center;white-space:nowrap;line-height:1.15;}',
            // Hai lớp chữ xếp chồng: lớp đen (như thẻ) + lớp gradient phủ đúng lên trên.
            '.quiz-launch-morph-title .qz-mt-solid,.quiz-launch-morph-title .qz-mt-grad{',
            '  grid-area:1/1;white-space:nowrap;}',
            // Gradient lộ dần TỪ TRÁI SANG PHẢI (clip-path) -> màu chạy dọc theo chiều dài tên
            '.quiz-launch-morph-title .qz-mt-grad{',
            '  background:linear-gradient(90deg,#ec4899,#a855f7,#6366f1);',
            '  -webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;',
            '  -webkit-clip-path:inset(0 100% 0 0);clip-path:inset(0 100% 0 0);}',

            // Quầng sáng "bung" mềm khi con sóc đáp xuống (điểm nhấn tinh tế lúc morph hạ cánh)
            '#quiz-launch-overlay .qz-bloom{position:fixed;z-index:10002;border-radius:50%;pointer-events:none;opacity:0;',
            '  background:radial-gradient(circle, rgba(255,255,255,0.92), rgba(255,190,225,0.5) 42%, transparent 70%);',
            '  filter:blur(5px);will-change:transform,opacity;}',
            '@keyframes quiz-launch-bloom{0%{opacity:0;transform:scale(.45);}32%{opacity:.85;}100%{opacity:0;transform:scale(1.4);}}',

            // Trang quiz lộ ra bằng cross-fade (không zoom) để khớp toạ độ morph pixel-perfect
            '#quiz-launch-frame{position:fixed;inset:0;width:100%;height:100%;border:0;z-index:10000;',
            '  opacity:0;pointer-events:none;background:#FCE4EC;transition:opacity .7s ease;}',
            '#quiz-launch-frame.is-on{opacity:1;pointer-events:auto;}',
            'html.theme-dark #quiz-launch-frame{background:#1f2430;}',
            '@media (prefers-reduced-motion: reduce){',
            '  #quiz-launch-backdrop,.quiz-launch-ghost,.quiz-launch-morph,#quiz-launch-frame,#quiz-launch-glow{transition-duration:.01ms !important;}',
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

    // Tìm liên kết tên đề bên trong một thẻ (dùng cho cả thẻ gốc lẫn bản clone).
    function findTitleEl(root) {
        return (root.querySelector && (root.querySelector('h3 a[href*="quiz.html"]') ||
            root.querySelector('h3 a') || root.querySelector('h3'))) || null;
    }

    // Đo toạ độ ĐÍCH trong iframe trang chờ: ô ảnh sóc + tiêu đề (cùng origin nên đọc được).
    // iframe phủ kín màn hình & không zoom -> toạ độ nội bộ trùng với toạ độ cửa sổ.
    function measureTargets(frame) {
        try {
            var doc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
            if (!doc) return null;
            var img = doc.getElementById('quiz-hero-img');
            var title = doc.getElementById('quiz-title');
            if (!img || !title) return null;
            var box = img.parentElement || img;   // ô bo tròn quanh ảnh sóc
            var hr = box.getBoundingClientRect();
            var tr = title.getBoundingClientRect();
            if (!hr.width || !tr.width) return null;
            var win = frame.contentWindow || window;
            var tf = parseFloat(win.getComputedStyle(title).fontSize) || 28;
            return { hero: hr, title: tr, titleFont: tf };
        } catch (e) { return null; }
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

        // Đo icon & tên đề của thẻ (kích thước THẬT chưa bị scale) để morph về sau.
        var srcIconEl = card.querySelector('.quiz-card-icon');
        var srcTitleEl = findTitleEl(card);
        var srcIconRect = srcIconEl ? srcIconEl.getBoundingClientRect() : null;
        var srcTitleRect = srcTitleEl ? srcTitleEl.getBoundingClientRect() : null;
        var titleCS = srcTitleEl ? getComputedStyle(srcTitleEl) : null;
        var srcTitleFont = titleCS ? (parseFloat(titleCS.fontSize) || 16) : 16;
        var srcTitleWeight = titleCS ? titleCS.fontWeight : '700';
        var srcTitleFamily = titleCS ? titleCS.fontFamily : 'inherit';
        var srcTitleColor = titleCS ? titleCS.color : '#1f2937';
        var srcTitleLetter = titleCS ? titleCS.letterSpacing : 'normal';
        var srcTitleText = srcTitleEl ? srcTitleEl.textContent.trim() : '';

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
        // Hệ số phóng để thẻ phủ KÍN màn hình ở pha dự phòng (khi không đo được đích)
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

        // Chốt thẻ ở tư thế "đứng yên" giữa màn hình (gỡ animation đang giữ frame 100%).
        function settleGhost() {
            ghost.style.animation = 'none';
            ghost.style.transform = settledTransform;
            void ghost.offsetWidth; // ép reflow -> mốc kế tiếp tính từ trạng thái đứng yên
        }

        function doReveal() {
            if (session.revealed) return;
            session.revealed = true;

            // Cập nhật thanh địa chỉ & lịch sử để Back quay lại thư viện đúng cách
            try { history.pushState({ quizLaunch: true }, '', url); } catch (e) {}

            settleGhost();

            var targets = measureTargets(frame);
            if (targets && srcIconRect && srcTitleRect) {
                morphReveal(targets);
            } else {
                fallbackCover();  // không đo được đích -> rơi về pha "bung kín màn hình" cũ
            }
        }

        // ===== PHA KẾT (chính): MORPH icon -> ảnh sóc, tên đề -> tiêu đề trang chờ =====
        function morphReveal(targets) {
            // Vị trí THẬT (đã scale) của icon & tên đề bên trong thẻ đang khựng giữa màn hình
            var gIcon = ghost.querySelector('.quiz-card-icon');
            var gTitle = findTitleEl(ghost);
            var giR = gIcon ? gIcon.getBoundingClientRect() : null;
            var gtR = gTitle ? gTitle.getBoundingClientRect() : null;
            if (!giR || !gtR) { fallbackCover(); return; }

            // Ẩn icon/tên đề GỐC trong thẻ để không bị "nhân đôi" khi bản morph tách ra
            if (gIcon) gIcon.style.visibility = 'hidden';
            if (gTitle) gTitle.style.visibility = 'hidden';

            var easeMove = 'cubic-bezier(.22,.9,.24,1)';   // trượt mượt, giảm tốc dịu (tên đề)
            var easeIcon = 'cubic-bezier(.34,1.06,.28,1)';  // nở ra hơi vượt đích rồi lắng (icon -> sóc)

            // ---- Bản morph của ICON ----
            // Dùng kích thước GỐC (chưa scale) + transform scale(flip) để nội dung <i> giữ
            // đúng tỉ lệ; điểm đầu trùng khít icon đang hiện, điểm cuối khớp ô ảnh sóc.
            var iw = srcIconRect.width, ih = srcIconRect.height;
            var iCx = giR.left + giR.width / 2, iCy = giR.top + giR.height / 2;
            var iScaleEnd = targets.hero.width / iw;
            var iTx = (targets.hero.left + targets.hero.width / 2) - iCx;
            var iTy = (targets.hero.top + targets.hero.height / 2) - iCy;

            var iconGhost = gIcon.cloneNode(true);
            iconGhost.style.visibility = 'visible';
            iconGhost.classList.add('quiz-launch-morph');
            iconGhost.style.left = (iCx - iw / 2) + 'px';
            iconGhost.style.top = (iCy - ih / 2) + 'px';
            iconGhost.style.width = iw + 'px';
            iconGhost.style.height = ih + 'px';
            iconGhost.style.transform = 'translate(0px,0px) scale(' + scale + ')';
            iconGhost.style.boxShadow = '0 14px 32px rgba(255,105,180,0.34)'; // bóng nhỏ, lớn dần khi nở
            overlay.appendChild(iconGhost);

            // ---- Bản morph của TÊN ĐỀ (một hàng + đổi màu đen -> gradient) ----
            // Dựng 2 lớp chữ xếp chồng: lớp đen (như thẻ) & lớp gradient (như tiêu đề đích).
            var tCx = gtR.left + gtR.width / 2, tCy = gtR.top + gtR.height / 2;
            var tScaleEnd = targets.titleFont / srcTitleFont;

            var titleGhost = document.createElement('div');
            titleGhost.className = 'quiz-launch-morph quiz-launch-morph-title';
            titleGhost.style.fontSize = srcTitleFont + 'px';
            titleGhost.style.fontWeight = srcTitleWeight;
            titleGhost.style.fontFamily = srcTitleFamily;
            titleGhost.style.letterSpacing = srcTitleLetter;
            titleGhost.style.opacity = '0';           // fade-in nhẹ để "dàn 1 hàng" không bị giật
            var titleSolid = document.createElement('span');
            titleSolid.className = 'qz-mt-solid';
            titleSolid.textContent = srcTitleText;
            titleSolid.style.color = srcTitleColor;
            var titleGrad = document.createElement('span');
            titleGrad.className = 'qz-mt-grad';
            titleGrad.textContent = srcTitleText;
            titleGhost.appendChild(titleSolid);
            titleGhost.appendChild(titleGrad);
            overlay.appendChild(titleGhost);

            // Đo kích thước tự nhiên (đã là MỘT hàng) rồi canh tâm trùng tên đề đang hiện.
            var natT = titleGhost.getBoundingClientRect();
            titleGhost.style.left = (tCx - natT.width / 2) + 'px';
            titleGhost.style.top = (tCy - natT.height / 2) + 'px';
            titleGhost.style.transform = 'translate(0px,0px) scale(' + scale + ')';

            var tTx = (targets.title.left + targets.title.width / 2) - tCx;
            var tTy = (targets.title.top + targets.title.height / 2) - tCy;

            // ---- Quầng sáng "đáp" mềm phía sau ô ảnh sóc (điểm nhấn khi icon hạ cánh) ----
            var bloomSize = targets.hero.width * 1.75;
            var bloom = document.createElement('div');
            bloom.className = 'qz-bloom';
            bloom.style.width = bloomSize + 'px';
            bloom.style.height = bloomSize + 'px';
            bloom.style.left = (targets.hero.left + targets.hero.width / 2 - bloomSize / 2) + 'px';
            bloom.style.top = (targets.hero.top + targets.hero.height / 2 - bloomSize / 2) + 'px';
            overlay.appendChild(bloom);

            var morphStart = TITLE_LIFT_MS + TITLE_SWEEP_MS; // tên đề: nâng -> quét màu -> rồi mới morph

            // ===== NHỊP 1: nâng tên đề (chữ đen) lên khỏi thẻ =====
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    titleGhost.style.transition = 'transform ' + TITLE_LIFT_MS + 'ms cubic-bezier(.22,1,.36,1)' +
                        ', opacity .28s ease';
                    titleGhost.style.opacity = '1';
                    titleGhost.style.transform = 'translate(0px,-14px) scale(' + scale + ')'; // nhấc lên tại chỗ
                });
            });

            // ===== NHỊP 2: quét đổi màu gradient dọc theo chiều dài tên (trái -> phải) =====
            setTimeout(function () {
                titleGrad.style.transition = 'clip-path ' + TITLE_SWEEP_MS + 'ms ease' +
                    ', -webkit-clip-path ' + TITLE_SWEEP_MS + 'ms ease';
                titleGrad.style.webkitClipPath = 'inset(0 0 0 0)';
                titleGrad.style.clipPath = 'inset(0 0 0 0)';
            }, TITLE_LIFT_MS);

            // ===== NHỊP 3: morph icon nở thành sóc + tên đề bay khớp vào trang chờ =====
            setTimeout(function () {
                ring.classList.add('is-on'); // vòng sáng bùng quanh ô ảnh sóc

                // ICON: nở to + trôi lên ô sóc, bóng đổ lớn dần; hơi trễ so với tên đề (so le)
                iconGhost.style.transition =
                    'transform ' + MORPH_MS + 'ms ' + easeIcon + ' ' + TITLE_LEAD_MS + 'ms, ' +
                    'border-radius ' + MORPH_MS + 'ms ease ' + TITLE_LEAD_MS + 'ms, ' +
                    'box-shadow ' + MORPH_MS + 'ms ease ' + TITLE_LEAD_MS + 'ms, opacity .55s ease';
                iconGhost.style.borderRadius = (HERO_RADIUS / iScaleEnd) + 'px';
                iconGhost.style.boxShadow = '0 44px 92px rgba(255,105,180,0.5), 0 18px 42px rgba(0,0,0,0.22)';
                iconGhost.style.transform = 'translate(' + iTx + 'px,' + iTy + 'px) scale(' + iScaleEnd + ')';

                // TÊN ĐỀ (giờ đã gradient): bay khớp vào tiêu đề trang chờ
                titleGhost.style.transition = 'transform ' + MORPH_MS + 'ms ' + easeMove + ', opacity .3s ease';
                titleGhost.style.transform = 'translate(' + tTx + 'px,' + tTy + 'px) scale(' + tScaleEnd + ')';

                // Khung thẻ tan ra để nhường chỗ cho trang chờ (glow vẫn sáng sau lưng)
                ghost.style.transition = 'opacity .5s ease';
                ghost.style.opacity = '0';

                // Mốc thời gian trong nhịp morph (giãn nhịp để mắt kịp bắt từng bước):
                setTimeout(function () { frame.classList.add('is-on'); }, TITLE_LEAD_MS + Math.round(MORPH_MS * 0.60));
                setTimeout(function () { bloom.style.animation = 'quiz-launch-bloom .8s ease-out forwards'; }, TITLE_LEAD_MS + Math.round(MORPH_MS * 0.80));
                setTimeout(function () { titleGhost.style.opacity = '0'; }, MORPH_MS + 40);
                var iconFadeAt = TITLE_LEAD_MS + MORPH_MS + 140; // icon tan CHẬM -> sóc hiện ra từ trong
                setTimeout(function () { iconGhost.style.opacity = '0'; }, iconFadeAt);
                setTimeout(function () {
                    try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) {}
                }, iconFadeAt + 660);
            }, morphStart);
        }

        // ===== PHA KẾT (dự phòng): không đo được đích -> thẻ bung kín màn hình rồi tan =====
        function fallbackCover() {
            ring.classList.add('is-on');
            glow.style.opacity = '0';
            backdrop.style.opacity = '0';

            ghost.style.transition = 'transform .5s cubic-bezier(.5,0,.55,1), ' +
                'border-radius .45s ease, box-shadow .4s ease, opacity .32s ease';
            ghost.style.borderRadius = '0px';
            ghost.style.boxShadow = 'none';
            ghost.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + coverScale + ')';

            setTimeout(function () { frame.classList.add('is-on'); }, 180);
            setTimeout(function () { ghost.style.opacity = '0'; }, 240);
            setTimeout(function () {
                try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) {}
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
