/* =====================================================================
   mot-tay.js — VIẾT BỆNH ÁN BẰNG MỘT TAY (điện thoại, ≤640px)

   Cảnh dùng thật: đứng cạnh giường bệnh, một tay cầm hồ sơ hoặc ống nghe,
   tay kia vừa giữ máy vừa gõ. Ngón cái với được vùng cung tròn bán kính
   ~110px quanh góc dưới màn hình, tất cả những thứ nằm ngoài vùng đó (dải
   mục ở đầu trang, khay công cụ, nút Lưu ở mép đối diện) đều phải đổi tay
   hoặc rướn — mà rướn thì rơi máy.

   Bốn việc file này làm, tất cả nằm gọn trong vùng ngón cái:

   1. NÚT CÁI VẠN NĂNG + CUNG QUẠT — giữ ngón lên nút rồi trượt tới việc muốn
      làm, thả tay là chạy. Không cần nhìn, không cần chạm chính xác. Chạm
      một cái thì cung vẫn mở ra để bấm bình thường.
   2. THANH MÉP LƯỚT KHỐI — vuốt dọc mép bên tay thuận là chạy qua từng khối
      của mục đang mở, tên khối và số ô trống hiện lên giữa màn hình, thả tay
      là nhảy tới. Mục dài 100 ô đi hết bằng một ngón, không cuộn.
   3. ĐỔI TAY — chạm đúp vào nút cái là mọi thứ nổi đổi sang mép bên kia
      (nhớ vào máy). Người thuận tay trái không phải chịu bố cục tay phải.
   4. KÉO XUỐNG Ở ĐẦU TRANG = MỞ MỤC LỤC, và CHẶN KÉO-ĐỂ-TẢI-LẠI. Trình duyệt
      Android mặc định kéo xuống là tải lại trang — đang viết dở mà lỡ tay
      là mất chỗ đang gõ; nay cú kéo đó thành mục lục.

   Không dựng lại tính năng nào: mỗi việc trong cung quạt chỉ là bấm hộ cái
   nút đã có (mục lục và ô trống của tam-tay.js, Từng câu của
   tao-benh-an-tungcau.js, Đọc để điền của tao-benh-an-dt.js, Xem trước của
   tao-benh-an.js). Nút cái này thay luôn .pv-fab để bớt một thứ nổi.
   ===================================================================== */

import { showToast } from '../../core/utils.js';
import { goTo, labelOf } from './tao-benh-an-them.js';

const $ = (id) => document.getElementById(id);
const form = $('medical-record-form');
const mq = matchMedia('(max-width: 640px)');
const isPhone = () => mq.matches;

if (form) init();

function init() {

    /* ---------- tay thuận ---------- */
    let tay = localStorage.getItem('baTayThuan') || 'phai';
    let dungXong = false;
    function apTay(luu) {
        document.body.classList.toggle('oh-trai', tay === 'trai');
        document.body.classList.toggle('oh-phai', tay !== 'trai');
        if (luu) { try { localStorage.setItem('baTayThuan', tay); } catch { } }
        /* apTay() còn chạy MỘT LẦN trước khi dựng cung (lúc nạp module), mà
           xepCung() đọc `arc` — hằng const chưa khởi tạo thì đụng vào là
           ReferenceError, chết cả file. Cờ này canh đúng chỗ đó. */
        if (dungXong) xepCung();
    }
    const syncMode = () => document.body.classList.toggle('oh-on', isPhone());
    syncMode();
    apTay(false);
    mq.addEventListener('change', syncMode);

    /* ================================================================
       1. NÚT CÁI + CUNG QUẠT
       ================================================================ */
    /* Mỗi việc chỉ là bấm hộ một nút đã có ở đâu đó trên trang. Nút ẩn hay
       nằm ngoài màn hình vẫn bấm được — .click() không cần nhìn thấy. */
    /* Nhãn phải ngắn — vòng tròn 62px chỉ chứa gọn hai từ, dài hơn là bị cắt. */
    const VIEC = [
        ['fa-bars', 'Mục lục', () => bam('.tt-bar .tt-sec')],
        ['fa-location-crosshairs', 'Ô trống', () => bam('.tt-bar .tt-gap')],
        ['fa-wand-magic-sparkles', 'Từng câu', () => bam('#pv-open')],
        ['fa-microphone-lines', 'Đọc', () => bam('#dt-say')],
        ['fa-clock-rotate-left', 'Chỗ gõ', veChoDangGo],
        ['fa-file-lines', 'Văn xuôi', () => bam('#preview-btn')]
    ];

    function bam(sel) {
        const el = document.querySelector(sel);
        if (!el) return showToast('Chưa mở được việc này.', 'warning', 1600);
        el.click();
    }

    function veChoDangGo() {
        let s = null;
        try { s = JSON.parse(localStorage.getItem('baLastField') || 'null'); } catch { }
        const el = s?.id && $(s.id);
        if (!el) return showToast('Chưa có chỗ nào đang gõ dở.', 'info', 1600);
        goTo(el);
        showToast('Về ' + String(labelOf(el) || 'ô đang gõ').slice(0, 30), 'info', 1400);
    }

    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'oh-fab';
    fab.setAttribute('aria-label', 'Việc nhanh trong tầm ngón cái');
    fab.innerHTML = '<i class="fas fa-hand-pointer"></i>';
    fab.dataset.noswipe = '1';

    const arc = document.createElement('div');
    arc.className = 'oh-arc hidden';
    arc.dataset.noswipe = '1';
    /* Hai nút chữ nằm giữa màn: đổi tay (trước đây giấu trong cử chỉ chạm đúp,
       không ai đoán ra) và Đóng (để không phải mò cách thoát). */
    arc.innerHTML = VIEC.map(([ic, ten], i) =>
        `<button type="button" class="oh-item" data-i="${i}">`
        + `<i class="fas ${ic}"></i><b>${ten}</b></button>`).join('')
        + '<div class="oh-bar">'
        + '<button type="button" class="oh-pill" data-oh="tay"><i class="fas fa-right-left"></i> Đổi tay</button>'
        + '<button type="button" class="oh-pill" data-oh="dong"><i class="fas fa-xmark"></i> Đóng</button>'
        + '</div>';

    document.body.append(arc, fab);
    dungXong = true;

    let mo = false, keo = false, chon = -1;

    /* Sáu việc rải đều trên một phần tư vòng tròn bán kính 122px quanh nút cái —
       đúng đường ngón cái quét được. Tính bằng JS chứ không bằng cos()/sin() của
       CSS: thử rồi, cả cụm transform hỏng im lặng và sáu nút chồng một chỗ. */
    function xepCung() {
        const d = document.body.classList.contains('oh-trai') ? 1 : -1;
        arc.querySelectorAll('.oh-item').forEach((b, i) => {
            /* Cách nhau 22 độ trên bán kính 132px — vừa đủ để hai vòng tròn 50px
               không chồng mép nhau. Cả cung còn được đẩy vào trong 40px: sáu việc
               trải hết 110 độ, mà quá 90 độ thì đầu trên vòng ngược ra mép màn
               hình và bị cắt mất (đã dính, việc thứ sáu lòi nửa ra ngoài). */
            const a = i * 22 * Math.PI / 180;
            b.style.setProperty('--tx', Math.round(d * (Math.cos(a) * 132 + 40)) + 'px');
            b.style.setProperty('--ty', Math.round(-Math.sin(a) * 132) + 'px');
        });
    }

    const matNut = () => { fab.innerHTML = mo ? '<i class="fas fa-xmark"></i>' : '<i class="fas fa-hand-pointer"></i>'; };

    function moArc() {
        xepCung();
        arc.classList.remove('hidden');
        document.body.classList.add('oh-arc-on');
        mo = true;
        matNut();
        navigator.vibrate?.(10);
    }
    function dongArc() {
        arc.classList.add('hidden');
        document.body.classList.remove('oh-arc-on');
        mo = false;
        chon = -1;
        matNut();
        arc.querySelectorAll('.oh-item').forEach(b => b.classList.remove('is-on'));
    }

    /** Việc gần ngón nhất — so bằng khoảng cách tới tâm từng nút */
    function ganNhat(x, y) {
        let best = -1, bd = 62;      // xa hơn 62px thì coi như chưa chọn gì
        arc.querySelectorAll('.oh-item').forEach((b, i) => {
            const r = b.getBoundingClientRect();
            const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
            if (d < bd) { bd = d; best = i; }
        });
        return best;
    }

    /* Chạm nút cái là BẬT TẮT — mở ra rồi chạm lại là đóng. Trước đây chạm lại
       không làm gì, mà lớp phủ thì trong suốt nên người dùng bấm nhầm là kẹt
       luôn trong cung quạt. */
    fab.addEventListener('touchstart', (e) => {
        e.preventDefault();                     // giữ nút không cho trang cuộn theo
        if (mo) { keo = false; return dongArc(); }
        keo = true;
        moArc();
    }, { passive: false });

    fab.addEventListener('touchmove', (e) => {
        if (!keo || !mo) return;
        e.preventDefault();
        const t = e.touches[0];
        chon = ganNhat(t.clientX, t.clientY);
        arc.querySelectorAll('.oh-item').forEach((b, i) => {
            const on = i === chon;
            if (on !== b.classList.contains('is-on')) {
                b.classList.toggle('is-on', on);
                if (on) navigator.vibrate?.(6);
            }
        });
    }, { passive: false });

    fab.addEventListener('touchend', () => {
        if (!keo) return;
        keo = false;
        /* Trượt ra ngoài rồi thả — chạy việc đang sáng. Chạm rồi thả tại chỗ —
           để cung mở đó, người dùng bấm tay như một khay nút bình thường. */
        if (chon >= 0) { const v = VIEC[chon]; dongArc(); v[2](); }
    });

    arc.addEventListener('click', (e) => {
        const b = e.target.closest('[data-i]');
        if (b) { const v = VIEC[+b.dataset.i]; dongArc(); return v?.[2](); }
        if (e.target.closest('[data-oh="tay"]')) return doiTay();
        if (e.target.closest('[data-oh="dong"]')) return dongArc();
        /* Chạm vào nền mờ là hủy. Đây chính là chỗ hỏng của bản trước: lớp phủ
           .oh-arc trải kín màn hình nên `closest('.oh-arc')` luôn khớp, câu
           lệnh "chạm ra ngoài thì đóng" không bao giờ chạy được. */
        if (e.target === arc) dongArc();
    });

    /* Chạm nền mờ đóng ngay từ lúc đặt ngón, khỏi chờ sự kiện click */
    arc.addEventListener('touchstart', (e) => {
        if (e.target === arc) dongArc();
    }, { passive: true });

    function doiTay() {
        dongArc();
        tay = tay === 'trai' ? 'phai' : 'trai';
        apTay(true);
        navigator.vibrate?.(16);
        showToast(tay === 'trai' ? 'Đã chuyển bố cục sang tay trái.'
            : 'Đã chuyển bố cục sang tay phải.', 'success', 1800);
    }

    addEventListener('keydown', (e) => { if (e.key === 'Escape' && mo) dongArc(); });

    /* ================================================================
       2. THANH MÉP LƯỚT KHỐI
       ================================================================ */
    /* Cùng bộ chọn tiêu đề với mục lục hai tầng của tam-tay.js — hai chỗ phải
       ra cùng một danh sách, nếu không thì lướt tới khối thứ ba mà mục lục lại
       ghi khối khác. */
    const FIELD_SEL = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select';
    const pane = () => form.querySelector('.tab-content.active');
    const heads = () => [...(pane()?.querySelectorAll('legend, label.text-pink-500, details > summary') || [])]
        .filter(h => h.offsetParent !== null).slice(0, 20);
    const tenKhoi = (h) => {
        const c = h.cloneNode(true);
        c.querySelectorAll('input, select, textarea, small, button, i, .hx-q, .lb-sub, .tab-progress, .fold-count, .caret')
            .forEach(x => x.remove());
        c.querySelectorAll('*').forEach(x => {
            if (!x.children.length && /^\d+([\/.,]\d+)?$/.test(x.textContent.trim())) x.remove();
        });
        return c.textContent.replace(/\s+/g, ' ').replace(/\s*\*+$/, '').trim().slice(0, 40);
    };
    const trongKhoi = (h) => {
        const os = [...(h.parentElement?.querySelectorAll(FIELD_SEL) || [])]
            .filter(f => !f.disabled && !f.readOnly && f.offsetParent !== null
                && !f.closest('#ba-settings') && !f.closest('[data-nocount]') && !f.closest('.bl-raw'));
        return [os.filter(f => String(f.value || '').trim()).length, os.length];
    };

    const rail = document.createElement('div');
    rail.className = 'oh-rail';
    rail.dataset.noswipe = '1';
    rail.setAttribute('aria-hidden', 'true');
    const tip = document.createElement('div');
    tip.className = 'oh-tip hidden';
    document.body.append(rail, tip);

    let ds = [], at = -1;

    function veTip(i) {
        const h = ds[i];
        if (!h) return;
        const [co, tong] = trongKhoi(h);
        tip.innerHTML = `<b>${tenKhoi(h)}</b>`
            + (tong ? `<span>${co}/${tong} ô đã điền</span>` : '<span>khối không có ô nhập</span>')
            + `<em>${i + 1}/${ds.length}</em>`;
        tip.classList.remove('hidden');
    }

    function doi(e) {
        const r = rail.getBoundingClientRect();
        const y = e.touches[0].clientY;
        const i = Math.max(0, Math.min(ds.length - 1,
            Math.floor((y - r.top) / Math.max(1, r.height) * ds.length)));
        if (i === at) return;
        at = i;
        veTip(i);
        navigator.vibrate?.(5);
    }

    rail.addEventListener('touchstart', (e) => {
        ds = heads();
        if (!ds.length) return showToast('Mục này chưa có khối nào để lướt.', 'info', 1600);
        e.preventDefault();
        rail.classList.add('is-on');
        at = -1;
        doi(e);
    }, { passive: false });

    rail.addEventListener('touchmove', (e) => {
        if (!ds.length) return;
        e.preventDefault();
        doi(e);
    }, { passive: false });

    rail.addEventListener('touchend', () => {
        rail.classList.remove('is-on');
        tip.classList.add('hidden');
        const h = ds[at];
        ds = [];
        if (h) { goTo(h); navigator.vibrate?.(10); }
    });

    /* ================================================================
       3. KÉO XUỐNG Ở ĐẦU TRANG = MỤC LỤC
       Luật overscroll-behavior nằm trong CSS (chặn kéo-để-tải-lại). Ở đây chỉ
       cần nhận ra cú kéo đó và mở mục lục thay vì để nó rơi vào khoảng không.
       ================================================================ */
    let y0 = 0, x0 = 0, rinh = false;
    form.addEventListener('touchstart', (e) => {
        rinh = isPhone() && e.touches.length === 1 && scrollY <= 2
            && !e.target.closest('input, textarea, select, button, .chips, [data-noswipe]');
        if (rinh) { y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; }
    }, { passive: true });

    form.addEventListener('touchend', (e) => {
        if (!rinh) return;
        rinh = false;
        if (scrollY > 2) return;
        const dy = e.changedTouches[0].clientY - y0;
        const dx = Math.abs(e.changedTouches[0].clientX - x0);
        /* Kéo dọc mới là mục lục — kéo chéo là người ta đang định vuốt đổi mục
           (cú vuốt ngang do tao-benh-an.js lo). */
        if (dy < 90 || dx > 60) return;
        bam('.tt-bar .tt-sec');
        navigator.vibrate?.(10);
    }, { passive: true });
}
