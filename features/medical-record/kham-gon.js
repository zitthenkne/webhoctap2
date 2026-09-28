/* =====================================================================
   MỤC KHÁM GỌN (V. Lược qua cơ quan + VI. Khám lâm sàng) — 2026-09-28

   Đo trên điện thoại, bệnh án mẫu: mục Khám dài 8.952px mà chữ thật sự gõ
   vào chỉ 1.430px. Phần còn lại là chip gợi ý bày sẵn ở MỌI cơ quan
   (3.259px), bảng "Đánh giá mức độ" 13 dòng (1.258px) và dòng "Bất thường —
   bấm để khai thác" (638px).

   Không xóa gì, chỉ đổi lúc nào hiện:
   1. Chip gợi ý + dòng bất thường chỉ bung ở CƠ QUAN ĐANG GHI (.kg-mo) —
      cơ quan khác còn tên + ô chữ + dòng trạng thái, nhãn có "N gợi ý ▾".
      Chạm vào tên hoặc ô là bung, chạm lại TÊN ("Thu gọn ▴") là đóng.
      Mở cơ quan mới thì cơ quan cũ thu lại,
      và trang được bù cuộn để ô vừa chạm không nhảy khỏi ngón tay.
   2. Bảng Đánh giá mức độ: chỉ bày chỉ số lệch chuẩn, chỉ số bình thường
      gói sau nút "Xem cả N chỉ số".
   Chỉ gắn class + một nút; dữ liệu, chip, listener của các module khác
   giữ nguyên (chip vẫn là đúng nút cũ, chỉ bị ẩn bằng CSS).
   ===================================================================== */
const pane = document.getElementById('kham-benh');

if (pane) {
    /* ---------- 1. Cơ quan: khối <div> có nhãn + ô chữ + hàng chip ---------- */
    const coQuan = () => [...pane.querySelectorAll('.flex-col > div')]
        .filter(d => d.querySelector(':scope > label[for]') && d.querySelector(':scope > textarea'));

    let dangMo = null;

    function demGoiY() {
        coQuan().forEach(d => {
            d.classList.add('kg-o');
            const n = d.querySelectorAll(':scope > .chips .chip:not(.dt-sel-x), :scope > .fd-box button').length;
            const lab = d.querySelector(':scope > label[for]');
            if (n) lab.dataset.kg = n + ' gợi ý';
            else delete lab.dataset.kg;
        });
    }

    /* Vị trí khối lúc NGÓN TAY NHẤN XUỐNG: tới lúc focusin/click chạy thì ô chữ
       của cơ quan cũ đã mất focus và có thể đã co lại — đo lúc đó là bù thiếu */
    /* Mốc chỉ sống 0,8 giây: nhấn xuống để VUỐT CUỘN rồi lát sau mới nhảy tới khối
       đó bằng nút "Ô trống" thì mốc đã cũ — dùng nó là bù sai, trang giật. */
    let moc = null;
    pane.addEventListener('pointerdown', e => {
        const o = e.target.closest('.kg-o');
        moc = o && o !== dangMo ? { o, top: o.getBoundingClientRect().top, t: performance.now() } : null;
    }, true);

    function mo(o) {
        if (!o || o === dangMo) return;
        const tuoi = moc?.o === o && performance.now() - moc.t < 800;
        const truoc = tuoi ? moc.top : o.getBoundingClientRect().top;
        moc = null;
        dangMo?.classList.remove('kg-mo');
        o.classList.add('kg-mo');
        dangMo = o;
        /* Khối cũ nằm PHÍA TRÊN thu lại thì mọi thứ bên dưới tụt lên — bù lại
           đúng khoảng đó (Safari không có scroll anchoring như Chrome) */
        const lech = o.getBoundingClientRect().top - truoc;
        if (Math.abs(lech) > 1) scrollBy(0, lech);
    }

    function dong(o) {
        o.classList.remove('kg-mo');
        if (dangMo === o) dangMo = null;
        // Đang gõ trong ô của khối vừa đóng thì nhả ra, kẻo gõ tiếp là nó bung lại ngay
        if (o.contains(document.activeElement)) document.activeElement.blur();
    }

    pane.addEventListener('focusin', e => mo(e.target.closest('.kg-o')));
    // goTo() của tao-benh-an-them.js báo trước khi nhảy tới một ô đang bị thu gọn
    pane.addEventListener('ba:hien', e => mo(e.target.closest('.kg-o')));
    pane.addEventListener('click', e => {
        const o = e.target.closest('.kg-o');
        if (!o) return;
        /* Chạm lại TÊN cơ quan đang mở = thu gọn. Chặn hành vi mặc định của <label>
           (đưa con trỏ vào ô chữ) — không thì focusin mở lại ngay lập tức. */
        if (o === dangMo && e.target.closest('.kg-o > label[data-kg]')) {
            e.preventDefault();
            dong(o);
            return;
        }
        // iOS không đặt focus vào <button> khi chạm -> bắt thêm cú chạm để mở
        mo(o);
    });

    /* ---------- 2. Bảng Đánh giá mức độ ---------- */
    const gBox = pane.querySelector('.grade-box');
    const gList = document.getElementById('grade-list');
    const nut = document.createElement('button');
    nut.type = 'button';
    nut.className = 'kg-grade-all';
    gList?.insertAdjacentElement('afterend', nut);

    /* Chỉ ghi khi chữ đổi: nút nằm TRONG mục nên ghi innerHTML là một lần đổi DOM,
       bộ theo dõi bên dưới sẽ gọi lại veNut — ghi vô điều kiện là vòng lặp vô tận */
    let nutCu = '';
    function veNut() {
        const ok = gList.querySelectorAll(':scope > .grade-row.ok').length;
        const lech = gList.querySelectorAll(':scope > .grade-row:not(.ok)').length;
        const het = gBox.classList.contains('kg-het');
        nut.hidden = !ok;
        const html = het
            ? '<i class="fas fa-chevron-up"></i> Chỉ xem chỉ số lệch chuẩn'
            : lech
                ? `<i class="fas fa-chevron-down"></i> Xem cả ${ok + lech} chỉ số (${ok} trong giới hạn)`
                : `<i class="fas fa-circle-check"></i> ${ok} chỉ số đều trong giới hạn — xem`;
        if (html !== nutCu) { nut.innerHTML = html; nutCu = html; }
    }
    nut.addEventListener('click', () => { gBox.classList.toggle('kg-het'); veNut(); });

    /* Chip theo bệnh cảnh + bảng chấm được vẽ lại liên tục -> đếm lại có hẹn giờ */
    let hen = 0;
    new MutationObserver(() => {
        clearTimeout(hen);
        hen = setTimeout(() => { demGoiY(); if (gList) veNut(); }, 250);
    }).observe(pane, { childList: true, subtree: true });

    demGoiY();
    if (gList) veNut();
}
