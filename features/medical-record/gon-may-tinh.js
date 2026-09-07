/* =====================================================================
   gon-may-tinh.js — DỌN GỌN ĐẦU TRANG TRÊN MÁY TÍNH (≥641px)

   Đo trước khi sửa (Chrome 1440×900, mục I):
     · 15 nút công cụ, cộng lại rộng 1828px trong khung 1086px nên xuống
       thành HAI hàng, ăn 82px.
     · 7 thẻ mục cộng lại 1276px, cũng hai hàng, ăn thêm 75px.
     · Cộng cả tiêu đề và hàng Cài đặt thì ô nhập đầu tiên nằm ở 477px —
       hơn NỬA màn hình là thanh với nút, chưa tới chữ nào.

   Ba việc file này làm, đều chỉ ở màn hình lớn (điện thoại không đổi gì —
   ở đó .ba-tools vẫn là khay trượt ngang của body.ba-tools-open):

   1. Cả hàng công cụ thu vào MỘT nút "Công cụ" nằm ngay hàng tiêu đề, bấm
      mới xổ ra thành bảng. KHÔNG dời nút nào sang chỗ khác — mọi trình xử
      lý sự kiện của tao-benh-an-them.js, mach-benh-an.js, thuan-tay.js đều
      gắn thẳng vào các nút đó, dời node là phải đi sửa cả ba file.
      Hai việc hay dùng nhất vẫn còn lối tắt riêng — Ctrl K (tìm mục) và
      vòng tròn phần trăm ở góc phải (nhảy tới ô còn trống).
   2. Viên phần trăm trong thẻ mục thành vạch mảnh dưới chân thẻ. Bảy thẻ
      hết chỗ chỉ vì bảy viên số đó, mà thông tin thì vạch nói cũng đủ.
      Chữ vẫn nằm nguyên trong DOM (chỉ font-size 0) vì thanh ngữ cảnh và
      bảng chọn mục của điện thoại đọc textContent của nó.
   3. Bấm một công cụ là bảng tự đóng, đỡ phải bấm hai lần.
   ===================================================================== */

const mq = matchMedia('(min-width: 641px)');
const tools = document.getElementById('ba-tools');
const btn = document.getElementById('ba-tools-btn');

if (tools && btn) init();

function init() {

    /* ---------- 1. Bảng công cụ xổ xuống ---------- */
    /* Bảng để position:fixed và tự đo chỗ đứng theo nút: neo bằng số cứng thì
       tiêu đề dài xuống hai dòng là bảng lệch hẳn khỏi nút. */
    function datCho() {
        const r = btn.getBoundingClientRect();
        tools.style.top = Math.round(r.bottom + 8) + 'px';
        tools.style.right = Math.round(innerWidth - r.right) + 'px';
    }

    const dangMo = () => document.body.classList.contains('ba-menu-on');

    function mo() {
        document.body.classList.add('ba-menu-on');
        datCho();
        btn.setAttribute('aria-expanded', 'true');
    }

    function dong() {
        document.body.classList.remove('ba-menu-on');
        btn.setAttribute('aria-expanded', 'false');
    }

    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        dangMo() ? dong() : mo();
    });

    document.addEventListener('click', (e) => {
        if (dangMo() && !e.target.closest('#ba-tools, #ba-tools-btn')) dong();
    });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && dangMo()) dong(); });
    addEventListener('scroll', () => { if (dangMo()) dong(); }, { passive: true });
    addEventListener('resize', () => { if (dangMo()) datCho(); });

    /* Chọn xong một việc là đóng bảng. Trừ mấy nút bật/tắt hay chỉnh liên tiếp
       (cỡ chữ, đọc đêm, riêng tư) — đóng ngay thì phải mở lại để bấm tiếp. */
    const GIU = ['ba-fs', 'ba-night', 'ba-priv', 'ba-zen'];
    tools.addEventListener('click', (e) => {
        const b = e.target.closest('.ba-tool');
        if (b && !GIU.includes(b.id)) dong();
    });

    /* Về điện thoại thì trả .ba-tools lại đúng khay trượt ngang của nó — bỏ
       hết toạ độ nội tuyến mình vừa đặt, kẻo khay dính cứng một chỗ. */
    mq.addEventListener('change', () => {
        dong();
        tools.style.top = '';
        tools.style.right = '';
    });

    /* ---------- 2. Phần trăm của mục thành vạch dưới chân thẻ ---------- */
    /* Số do tao-benh-an.js ghi lại sau mỗi lần gõ, nên phải rình chữ đổi chứ
       không đọc một lần lúc nạp. */
    document.querySelectorAll('.tab-link .tab-progress').forEach((el) => {
        const the = el.closest('.tab-link');
        const dat = () => the.style.setProperty('--p', parseInt(el.textContent) || 0);
        new MutationObserver(dat).observe(el, { childList: true, characterData: true, subtree: true });
        dat();
    });
}
