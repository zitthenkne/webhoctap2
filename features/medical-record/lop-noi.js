/* lop-noi.js — quản lý chồng lớp nổi (bảng phủ, khay, sheet) của trang viết bệnh án.
 *
 * Trang có 15 lớp nổi, mỗi lớp do một module tự dựng lấy. Không lớp nào là
 * <dialog>, nên cả bốn thứ một hộp thoại cần đều thiếu, và thiếu giống hệt nhau:
 *
 *   1. Escape đóng SẠCH mọi lớp — mỗi module gắn một listener 'keydown' riêng
 *      trên document, một phím Escape chạy hết cả mười. Mở Trạm rồi mở Lịch sử,
 *      bấm Escape là mất luôn cả hai.
 *   2. Hai lớp cùng số z — #mach-tram, #ls-box, #pt-box, #tc-sheet đều z-index 88.
 *      Mở chồng nhau thì thứ tự vẽ do vị trí trong DOM quyết định, tức là ngẫu nhiên.
 *   3. Tiêu điểm ở lại ô form phía dưới — mở lớp xong gõ phím, chữ chui xuống ô
 *      đang bị lớp che. Đo được: mở #mach-tram, activeElement vẫn là #patient-name.
 *   4. Nền vẫn cuộn được sau lưng lớp — không chỗ nào khóa cuộn.
 *
 * File này vá cả bốn từ BÊN NGOÀI: không module nào phải sửa, không hàm đóng nào
 * bị viết lại. Nó chỉ nhìn class 'hidden' của các lớp đã có, rồi xếp chồng cho đúng.
 *
 * Thêm lớp mới thì thêm bộ chọn vào LOP, và nút đóng của nó vào NUT_DONG.
 */

/* Lớp phủ thật sự — thứ chiếm màn hình. KHÔNG gồm thanh/khay luôn hiện
   (.ba-scroll, .ol-rail, #toast-container, .pv-fab, #logic-inspector-bar)
   và không gồm bong bóng gợi ý (.ta-pop, .nl-assist, .dt-kb, .nl-peek). */
const LOP = ['#mach-tram', '#ls-box', '#pt-box', '#tc-sheet', '#ba-cmd', '#soi-panel',
    '#sec-sheet', '#md-preview', '#map-overlay', '#net-overlay', '#tb',
    '.nl-modal', '.pv', '.pad', '.dt-full', '.dt-lp', '.blx-slide',
    '.sp-modal', '.lp-modal'].join(',');

/* Nút đóng sẵn có của từng lớp. Escape bấm hộ nút này chứ không tự ẩn lớp —
   để hàm đóng thật của module còn chạy (nó còn gỡ body.tb-on, clearInterval…). */
const NUT_DONG = ['[data-mach-close]', '[data-tc-close]', '[data-cmd-close]', '[data-ls-close]',
    '[data-pt-close]', '[data-sec-close]', '[data-mdp-close]', '[data-map-close]',
    '[data-nl-close]', '[data-sp-close]', '[data-lp-close]',
    '[data-p="close"]', '[data-k="close"]', '[data-s="close"]', '[data-f="close"]',
    '[data-l="close"]', '#soi-close', '#tb-x', '#net-close', '#map-overlay-close'].join(',');

const O_GO = 'input:not([type="hidden"]):not([disabled]),textarea,select,button:not([disabled]),[tabindex]:not([tabindex="-1"])';

const hienRa = (el) => el.getClientRects().length > 0;

let nganXep = [];      // các lớp đang mở, theo thứ tự mở
let oCu = null;        // ô đang gõ trước khi lớp đầu tiên mở ra

function dongBo() {
    const mo = [...document.querySelectorAll(LOP)].filter(hienRa);
    nganXep = nganXep.filter(el => mo.includes(el));
    mo.forEach(el => { if (!nganXep.includes(el)) nganXep.push(el); });

    /* (2) Xếp tầng: lớp mở sau luôn nằm trên lớp mở trước. Lớp dưới cùng giữ
       nguyên z của CSS — chỉ khi có lớp chồng lên mới phải đặt số. */
    nganXep.forEach(el => { el.style.zIndex = ''; });
    let z = 0;
    nganXep.forEach((el, i) => {
        const zCss = +getComputedStyle(el).zIndex || 0;
        z = i ? Math.max(z + 2, zCss) : zCss;
        if (i) el.style.zIndex = z;
    });

    document.querySelectorAll(LOP).forEach(el => {
        const dangMo = nganXep.includes(el);
        el.toggleAttribute('aria-modal', dangMo);
        if (dangMo) el.setAttribute('role', 'dialog'); else el.removeAttribute('role');
    });

    /* (4) Khóa cuộn nền khi còn lớp nào mở */
    document.body.classList.toggle('co-lop-noi', nganXep.length > 0);

    /* (3) Kéo tiêu điểm vào lớp trên cùng, trả về chỗ cũ khi đóng hết */
    const tren = nganXep[nganXep.length - 1];
    if (!tren) {
        const ve = oCu; oCu = null;
        if (ve && document.contains(ve)) ve.focus({ preventScroll: true });
        return;
    }
    if (!oCu) oCu = document.activeElement;
    if (tren.contains(document.activeElement)) return;   // module đã tự chọn ô rồi
    const dich = tren.querySelector(O_GO);
    if (dich) dich.focus({ preventScroll: true });
    else { tren.tabIndex = -1; tren.focus({ preventScroll: true }); }
}

/* (1) Escape đóng ĐÚNG một lớp — lớp trên cùng. Bắt ở pha capture trên window
   nên luôn chạy trước mọi listener trên document, rồi chặn hẳn để chín listener
   Escape còn lại của các module không đóng theo. */
addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !nganXep.length) return;
    if (document.querySelector('.ta-pop:not(.hidden)')) return;   // gợi ý gõ được đóng trước
    e.preventDefault();
    e.stopImmediatePropagation();
    const tren = nganXep[nganXep.length - 1];
    const nut = tren.querySelector(NUT_DONG);
    if (nut) nut.click(); else tren.classList.add('hidden');
}, true);

/* Các lớp được dựng bằng JS lúc nạp trang, nên vừa theo dõi class của lớp đã có,
   vừa quét lại mỗi khi body mọc thêm con. */
/* Gom nhiều mutation vào một lần chạy, bằng microtask chứ KHÔNG bằng
   requestAnimationFrame: rAF chỉ nổ khi trình duyệt còn vẽ khung hình, nên lúc
   trang đứng yên (hoặc thẻ chạy nền) nó im luôn — đo được: đóng #tc-sheet xong mà
   ngăn xếp vẫn kẹt lớp cũ, Escape tiếp theo bấm vào nút đóng của lớp đã đóng.
   Observer chỉ theo dõi class của 19 lớp phủ nên chạy thẳng cũng không tốn. */
let cho = false;
const doi = () => {
    if (cho) return;
    cho = true;
    queueMicrotask(() => { cho = false; dongBo(); });
};
const doiClass = new MutationObserver(doi);
const daGan = new WeakSet();
const ganTheoDoi = () => document.querySelectorAll(LOP).forEach(el => {
    if (daGan.has(el)) return;
    daGan.add(el);
    doiClass.observe(el, { attributes: true, attributeFilter: ['class'] });
});
new MutationObserver(() => { ganTheoDoi(); doi(); }).observe(document.body, { childList: true });
ganTheoDoi();
doi();
