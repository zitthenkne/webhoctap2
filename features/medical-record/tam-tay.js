/* =====================================================================
   tam-tay.js — NĂM NÂNG CẤP ĐIỆN THOẠI, ĐỢT 2026-09-07

   Đo trước khi viết (Chrome headless, khung 504×900, mục I):
     · 290px đầu màn hình là tiêu đề + dải mục + hộp cài đặt, chưa tới ô nào;
       cuộn xuống thì dải mục thu lại (dt-hide-top) → MẤT SẠCH điều hướng,
       muốn đổi mục phải cuộn ngược lên tận đầu trang.
     · Mục II có 102 ô trong một mục: muốn tới khối cuối phải cuộn ~6000px,
       mà bảng chọn mục chỉ liệt kê 7 mục lớn, không có khối con.
     · Hết một mục thì không có lối đi tiếp — lại cuộn ngược lên dải mục.
     · pv-fab[685] và logic-inspector-bar[681] nổi đè lên hàng ô cuối cùng.
     · Chip/xóa sạch ô/dán đè ghi thẳng vào ô, mất cả đoạn vừa gõ mà không có
       đường lùi (Ctrl+Z của máy không cứu được ô bị JS ghi đè).

   Năm việc file này làm — tất cả chỉ ở màn hình ≤640px:
     1. THANH NGỮ CẢNH dính đầu: cuộn xuống là hiện tên mục · % · số ô trống,
        thay đúng chỗ dải mục vừa thu. Điều hướng không bao giờ rời màn hình.
     2. MỤC LỤC HAI TẦNG: bảng chọn mục có sẵn được chèn thêm các khối con của
        mục đang mở kèm "3/8 ô" — một chạm tới thẳng khối, không cuộn.
     3. VÙNG NGÓN CÁI: nút "Từng câu" và huy hiệu Logic thôi đè lên hàng ô cuối
        và hàng Trước/Tiếp (nới đáy mục + tắt hai nút nổi khi hàng đó hiện ra).
     4. HÀNG TRƯỚC/TIẾP THÀNH THANH VIỆC: con số "5/7" ở giữa đổi thành nút
        "Còn n ô trống" — chạm là nhảy tới ô trống kế tiếp của mục.
     5. HOÀN TÁC MỘT CHẠM: ô nào bị mất từ 12 ký tự trở lên (hoặc bị xóa trắng)
        thì hiện viên "Hoàn tác" 7 giây.

   KHÔNG làm lại những thứ trang đã có (đã kiểm trước khi viết, kẻo chạy hai
   lần): vuốt ngang đổi mục nằm ở tao-benh-an.js (vuốt hai bộ là nhảy 2 mục
   một lần), hàng Trước/Tiếp cũng của file đó, hoàn tác cho lần điền hàng loạt
   ở nhap-lien-ket.js, hoàn tác cho tìm & thay thế ở mach-benh-an.js — mục 5
   chỉ lo cú ghi đè vào MỘT ô (chip, "Xóa sạch ô", dán đè), chỗ chưa ai lo.

   Như mọi lớp điện thoại khác của trang: CHỈ đọc DOM có sẵn, ghi vào ô bằng
   input/change y như người gõ — không đụng FIELDS/buildModel, không sinh cạnh
   mới trong codegraph. Máy tính không đổi pixel nào.

   Dính vào hai file cùng thư mục (cố ý, để khỏi viết lại):
     · tao-benh-an-dt.js — class body.dt-hide-top quyết định lúc nào thanh ngữ
       cảnh hiện ra (nó hiện đúng lúc dải mục thu đi, hai thứ không chồng nhau).
     · tao-benh-an.js   — bảng chọn mục #sec-sheet (đã có nút Back của máy).
   ===================================================================== */

import { showToast } from '../../core/utils.js';
import { goTo, labelOf } from './tao-benh-an-them.js';

const $ = (id) => document.getElementById(id);
const form = $('medical-record-form');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const mq = matchMedia('(max-width: 640px)');
const isPhone = () => mq.matches;

if (form) init();

function init() {

    const syncMode = () => document.body.classList.toggle('tt-on', isPhone());
    syncMode();
    mq.addEventListener('change', syncMode);

    const tabLinks = [...document.querySelectorAll('.tab-link')];
    const pane = () => form.querySelector('.tab-content.active');
    const curLink = () => tabLinks.find(l => l.classList.contains('active'));
    const tabName = (l) => l?.querySelector('.tab-text')?.textContent.trim() || 'Bệnh án';

    const FIELD_SEL = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select';
    /** Ô đếm được trong một khối (cùng luật với vòng tròn % và vạch cuộn) */
    const fieldsIn = (root) => [...(root || pane() || form).querySelectorAll(FIELD_SEL)]
        .filter(f => !f.disabled && !f.readOnly && f.offsetParent !== null
            && !f.closest('#ba-settings') && !f.closest('[data-nocount]') && !f.closest('.bl-raw'));
    const emptyIn = (root) => fieldsIn(root).filter(f => !String(f.value || '').trim());

    const setVal = (el, v) => {
        el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    /* =================================================================
       1. THANH NGỮ CẢNH DÍNH ĐẦU
       Không tự nghe cuộn: nó hiện/ẩn theo class body.dt-hide-top mà
       tao-benh-an-dt.js đã bật sẵn khi cuộn xuống. Một nguồn sự thật, và
       chắc chắn không bao giờ đứng chồng lên dải mục.
       ================================================================= */
    const bar = document.createElement('div');
    bar.className = 'tt-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Mục đang mở');
    bar.innerHTML =
        '<button type="button" class="tt-b tt-sec" data-t="nav">'
        + '<i class="fas fa-bars"></i><b class="tt-name">Bệnh án</b>'
        + '<span class="tt-pct">0%</span><i class="fas fa-chevron-down tt-car"></i></button>'
        + '<button type="button" class="tt-b tt-gap" data-t="gap">'
        + '<i class="fas fa-location-crosshairs"></i><span class="tt-left"></span></button>';
    document.body.appendChild(bar);

    function syncBar() {
        if (!isPhone()) return;
        const l = curLink();
        bar.querySelector('.tt-name').textContent = tabName(l);
        bar.querySelector('.tt-pct').textContent = l?.querySelector('.tab-progress')?.textContent || '';
        const n = emptyIn().length;
        bar.querySelector('.tt-left').textContent = n ? n + ' ô trống' : 'đủ rồi';
        bar.classList.toggle('is-done', !n);
        syncFoot();
    }

    /* =================================================================
       2. MỤC LỤC HAI TẦNG
       Dùng lại bảng #sec-sheet có sẵn (nó đã có nút Back của máy, đã nằm
       trong danh sách của lop-noi.js) rồi chèn khối con của mục đang mở
       ngay dưới dòng mục đó.
       ================================================================= */
    /** Tiêu đề khối trong mục đang mở — cùng bộ chọn với vạch cuộn của máy tính */
    const heads = () => [...(pane()?.querySelectorAll('legend, label.text-pink-500, details > summary') || [])]
        .filter(h => h.offsetParent !== null).slice(0, 20);
    /** Khối chứa một tiêu đề: <legend> → <fieldset>, <summary> → <details>,
        nhãn mục → hộp bọc ngoài nó. */
    const boxOf = (h) => h.parentElement;

    /* Tên khối cho mục lục. Tiêu đề của trang có sẵn huy hiệu đếm ("0/27"),
       số thứ tự và chữ nhắc — bê nguyên textContent ra là dính hết vào tên
       ("III. BỆNH SỬ0/27"). Bỏ đúng những thứ đó, cùng danh sách với vạch cuộn
       của máy tính, thêm luật "cục chỉ toàn số thì bỏ". */
    function headText(h) {
        const c = h.cloneNode(true);
        c.querySelectorAll('input, select, textarea, small, button, i, .hx-q, .lb-sub, .tab-progress, .fold-count, .caret')
            .forEach(x => x.remove());
        c.querySelectorAll('*').forEach(x => {
            if (!x.children.length && /^\d+([\/.,]\d+)?$/.test(x.textContent.trim())) x.remove();
        });
        return c.textContent.replace(/\s+/g, ' ').replace(/\s*\*+$/, '').trim().slice(0, 44);
    }

    let subHeads = [];

    function enrichNav() {
        const list = $('sec-sheet-list');
        const at = list?.querySelector('.sec-item.active');
        if (!at || list.querySelector('.tt-sub')) return;
        subHeads = heads().map(h => ({ h, box: boxOf(h), ten: headText(h), n: fieldsIn(boxOf(h)).length }))
            .filter(x => x.ten.length > 1
                /* Hộp gợi ý / bản máy ghép không có ô nào để điền — bỏ khỏi mục
                   lục cho khỏi loãng, trừ tiêu đề mục lớn (vẫn là cột mốc). */
                && (x.n > 0 || x.h.tagName === 'LEGEND' || x.h.classList.contains('text-pink-500')));
        if (!subHeads.length) return;
        at.insertAdjacentHTML('afterend', '<div class="tt-subs">' + subHeads.map((x, i) => {
            const os = fieldsIn(x.box);
            const co = os.filter(f => String(f.value || '').trim()).length;
            const st = !os.length ? '' : co === os.length ? ' is-full' : co ? ' is-part' : '';
            return `<button type="button" class="tt-sub${st}" data-tt-i="${i}">`
                + `<span class="tt-sub-dot"></span><span class="tt-sub-lb">${esc(x.ten)}</span>`
                + (os.length ? `<em>${co}/${os.length}</em>` : '') + '</button>';
        }).join('') + '</div>');
    }

    function openNav() {
        $('sec-picker')?.click();      // nút xổ mục có sẵn (đang display:none ở điện thoại nhưng vẫn chạy)
        setTimeout(enrichNav, 40);
    }

    $('sec-sheet')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-tt-i]');
        if (!b) return;
        const x = subHeads[+b.dataset.ttI];
        $('sec-sheet')?.querySelector('[data-sec-close]')?.click();
        if (x) setTimeout(() => goTo(x.h), 60);
    });

    /* =================================================================
       3. VÙNG NGÓN CÁI KHÔNG CÒN BỊ ĐÈ
       Đo được: .pv-fab (nút "Từng câu") và #logic-inspector-bar (huy hiệu
       Logic) đều nằm ở bottom:var(--rail) — đúng chỗ hàng ô cuối và hàng
       "Trước / Tiếp" của mục. Ảnh chụp: nút "Từng câu" đè lên nút Trước,
       huy hiệu đè lên nút Tiếp, bấm vào là trúng nút nổi chứ không trúng nút
       thật. Hai việc chữa: nới đáy mục ra, và tắt hẳn hai nút nổi trong lúc
       hàng Trước/Tiếp đang nằm trong tầm nhìn (lúc đó đã có nút thật rồi).
       ================================================================= */
    const pagerOf = (p) => p?.querySelector(':scope > div.justify-between.border-t') || null;

    const clear = new IntersectionObserver((rows) => {
        if (!isPhone()) return;
        const hien = rows.some(r => r.isIntersecting);
        document.body.classList.toggle('tt-clear', hien);
    }, { rootMargin: '0px 0px -76px 0px' });

    /* =================================================================
       4. HÀNG "TRƯỚC / TIẾP" THÀNH THANH VIỆC
       Trang đã có hàng Trước / Tiếp ở cuối mỗi mục, nhưng ở giữa là con số
       "5/7" — thứ đọc xong không làm được gì. Thay bằng nút đếm ô trống của
       mục và nhảy tới ô trống kế tiếp: cuối mục là chỗ người ta tự hỏi
       "còn thiếu gì không", trả lời ngay tại đó.
       Không dựng thêm hàng thứ hai — hàng cũ vốn đã đúng chỗ.
       ================================================================= */
    const gapBtn = document.createElement('button');
    gapBtn.type = 'button';
    gapBtn.className = 'tt-pgap';
    gapBtn.dataset.t = 'gap';
    gapBtn.innerHTML = '<i class="fas fa-location-crosshairs"></i> <b></b>';
    gapBtn.addEventListener('click', onTool);

    function syncFoot() {
        const p = pane();
        const pager = pagerOf(p);
        if (!pager) return;
        if (!pager.classList.contains('tt-pager')) {
            pager.classList.add('tt-pager');
            pager.children[1]?.classList.add('tt-pn');     // con số "5/7" — giấu ở điện thoại
            clear.observe(pager);
        }
        if (gapBtn.parentElement !== pager) pager.insertBefore(gapBtn, pager.children[1] || null);
        const n = emptyIn().length;
        gapBtn.querySelector('b').textContent = n ? 'Còn ' + n + ' ô trống' : 'Mục này đã kín';
        gapBtn.classList.toggle('is-done', !n);
    }

    /* Một bộ xử lý cho cả thanh ngữ cảnh lẫn hàng cuối mục */
    function onTool(e) {
        const b = e.target.closest('[data-t]');
        if (!b) return;
        const k = b.dataset.t;
        if (k === 'nav') return openNav();
        if (k === 'gap') {
            const list = emptyIn();
            if (!list.length) return showToast('Mục này đã kín — vuốt ngang để sang mục kế.', 'success', 2000);
            /* Ô trống KẾ TIẾP tính từ chỗ đang đứng, không phải ô trống đầu mục:
               bấm nhiều lần là đi hết mục, không quay lại chỗ cũ. */
            const nx = list.find(f => f.getBoundingClientRect().top > 140) || list[0];
            goTo(nx);
            navigator.vibrate?.(6);
        }
    }
    bar.addEventListener('click', onTool);

    /* =================================================================
       5. HOÀN TÁC MỘT CHẠM
       Chip, "Xóa sạch ô", dán đè, điền hàng loạt đều ghi thẳng vào ô bằng
       sự kiện input — Ctrl+Z của máy không cứu được. Giữ lại giá trị cũ của
       lần ghi làm mất chữ gần nhất là đủ: người ta chỉ tiếc ngay lúc đó.
       ================================================================= */
    const prev = new WeakMap();
    let pill = null, pillT = 0;

    const seed = () => fieldsIn(form).forEach(f => { if (!prev.has(f)) prev.set(f, String(f.value || '')); });

    form.addEventListener('input', (e) => {
        const el = e.target;
        if (!el.matches?.(FIELD_SEL) || el.closest('#ba-settings')) return;
        const now = String(el.value || '');
        const before = prev.get(el);
        prev.set(el, now);
        if (!isPhone() || before === undefined || before === now) return;
        // Gõ/xóa từng ký tự thì thôi — chỉ bắt cú ghi làm mất cả đoạn
        if (before.length - now.length < 12 && !(before.trim() && !now.trim())) return;
        offerUndo(el, before);
    });

    function offerUndo(el, before) {
        clearTimeout(pillT);
        pill?.remove();
        pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'tt-undo';
        pill.innerHTML = '<i class="fas fa-rotate-left"></i> Hoàn tác <b>'
            + esc(String(labelOf(el) || 'ô vừa xóa').slice(0, 22)) + '</b>';
        pill.addEventListener('click', () => {
            setVal(el, before);
            prev.set(el, before);
            pill.remove();
            pill = null;
            goTo(el);
            showToast('Đã trả lại nội dung cũ.', 'success', 1600);
        });
        document.body.appendChild(pill);
        pillT = setTimeout(() => { pill?.remove(); pill = null; }, 7000);
    }

    /* =================================================================
       NHỊP CẬP NHẬT
       ================================================================= */
    let t = 0;
    form.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(syncBar, 700);
    });
    tabLinks.forEach(l => l.addEventListener('click', () => setTimeout(() => { syncBar(); seed(); }, 320)));
    setTimeout(() => { syncBar(); seed(); }, 1000);
    setTimeout(() => { syncBar(); seed(); }, 2600);
}
