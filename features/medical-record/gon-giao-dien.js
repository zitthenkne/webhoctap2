/* =====================================================================
   gon-giao-dien.js — DỌN GỌN GIAO DIỆN TRANG VIẾT BỆNH ÁN (mọi cỡ màn hình)

   Thay hẳn gon-may-tinh.js (file đó chỉ lo màn ≥641px và chỉ lo hàng công
   cụ). Bảy việc, tất cả đều là DỜI CHỖ node sẵn có — không nút nào bị dựng
   lại, nên mọi listener của tao-benh-an-them.js, mach-benh-an.js,
   thuan-tay.js, tao-benh-an-dt.js, tao-benh-an-tungcau.js vẫn gắn nguyên
   trên chính node đó và chạy y như trước:

     1. Một SỔ CÔNG CỤ duy nhất cho cả máy tính lẫn điện thoại, chia bốn
        nhóm có tiêu đề, thêm ô lọc gõ-là-thấy.
     2. Hộp "Cài đặt bệnh án" dọn vào sổ — đầu form bớt hẳn một khối.
     3. Bảy chip nhảy mục ngay trong sổ (kèm % từng mục) — thêm việc mới,
        không thêm dải nào ra ngoài trang.
     4. Thanh % và dải mục gộp thành MỘT khối dính (.gg-rail).
     5. Viên trạng thái từ thanh đáy dời lên cụm "Tự động lưu" ở đầu trang;
        thanh đáy 7 món còn 4.
     6. Dải mời xem bệnh án mẫu thu thành một chip, tắt được vĩnh viễn.
     7. Phần trăm của thẻ mục thành vạch màu dưới chân thẻ (CSS đọc --p).

   Bẫy đã tránh:
     · #ba-settings PHẢI ở lại trong <form>: bộ lắng nghe input của form là
       thứ nhớ thông tin sinh viên và tự lưu khi đổi trạng thái. Nên sổ được
       gắn vào chính <form>, không gắn vào <body>. .page-card không có
       backdrop-filter nên position:fixed bên trong vẫn bám đúng màn hình.
     · #save-state bị tao-benh-an.js ghi đè innerHTML mỗi lần đổi trạng
       thái — không nhét gì vào TRONG nó, phải bọc ra ngoài (.gg-stat).
     · tao-benh-an-dt.js chèn thêm hai nút vào #ba-tools SAU khi trang nạp,
       nên phải xếp nhóm lại mỗi lần mở sổ chứ không xếp một lần.
     · #dock-more đã có listener cũ bật khay .ba-tools của điện thoại — thay
       node bằng bản sao để gỡ listener đó rồi mới gắn cái mới.
     · Ô lọc của sổ là <div contenteditable>, KHÔNG phải <input>. Sổ nằm
       trong <form>, mà mười module khác đang quét "mọi input/select/textarea
       trong form" để đếm phần trăm, nhảy ô trống, bật bong bóng gợi ý, tự
       lưu… Một ô nhập thật ở đây là lọt vào cả mười danh sách đó.
   ===================================================================== */

const $ = (id) => document.getElementById(id);
const body = document.body;
const form = $('medical-record-form');
const tools = $('ba-tools');

if (form && tools) dung();

function dung() {
    body.classList.add('gg-on');

    /* =================================================================
       1. SỔ CÔNG CỤ
       ================================================================= */
    const sheet = document.createElement('div');
    sheet.id = 'gg-sheet';
    sheet.className = 'gg-sheet hidden';
    sheet.dataset.nocount = '';
    sheet.innerHTML =
        '<div class="gg-bg" data-gg-close></div>'
        + '<div class="gg-panel">'
        + '<div class="gg-head"><i class="fas fa-sliders"></i>'
        + '<div id="gg-q" class="gg-q" contenteditable="plaintext-only" role="searchbox"'
        + ' aria-label="Lọc công cụ" data-ph="Lọc công cụ, nhảy mục…"></div>'
        + '<button type="button" data-gg-close aria-label="Đóng"><i class="fas fa-xmark"></i></button></div>'
        + '<div class="gg-body" id="gg-body"></div>'
        + '<div class="gg-foot">Ctrl / mở bảng này · Ctrl K tìm ô · Alt 1…7 nhảy mục · Esc đóng</div>'
        + '</div>';
    form.appendChild(sheet);

    const panel = sheet.querySelector('.gg-panel');
    const khung = $('gg-body');
    const oLoc = $('gg-q');

    /* Bốn nhóm theo VIỆC người viết đang định làm, không theo thứ tự nút
       nằm trong HTML. Id nào không có tên ở đây thì rơi xuống nhóm cuối —
       module khác chèn thêm nút vào #ba-tools cũng không bị mất. */
    const NHOM = [
        ['Đi tới trong bệnh án', ['ba-search', 'ba-gap', 'dt-gaps', 'ba-ghim']],
        ['Nhập cho nhanh', ['ba-paste', 'dt-say', 'pv-open', 'pv-pad', 'ba-tat']],
        ['Soi lại và trình bày', ['ba-tram', 'ba-overview', 'ba-trinh', 'ba-peek', 'ba-ls']],
        ['Cách hiển thị', ['ba-fold', 'ba-night', 'ba-zen', 'ba-priv', 'ba-fs']]
    ];

    /* Nút bật/tắt hoặc chỉnh liên tiếp: bấm xong sổ ĐỨNG YÊN, kẻo phải mở
       lại để bấm nấc cỡ chữ tiếp theo. Còn lại bấm là đóng. */
    const GIU = new Set(['ba-fs', 'ba-night', 'ba-priv', 'ba-zen', 'ba-fold', 'dt-gaps']);

    /* Khung nhóm dựng một lần; nút thì xếp lại mỗi lần mở. */
    const hangCua = new Map();
    NHOM.forEach(([ten]) => {
        const g = document.createElement('section');
        g.className = 'gg-grp';
        g.innerHTML = '<h4>' + ten + '</h4><div class="gg-row"></div>';
        khung.appendChild(g);
        hangCua.set(ten, g.querySelector('.gg-row'));
    });

    /* Hàng nhảy mục: đọc thẳng bảy thẻ .tab-link có sẵn rồi bấm hộ, nên
       không phải chép lại danh sách mục lần thứ tám trong mã nguồn. */
    const gMuc = document.createElement('section');
    gMuc.className = 'gg-grp';
    gMuc.innerHTML = '<h4>Nhảy tới mục</h4><div class="gg-row" id="gg-secs"></div>';
    khung.appendChild(gMuc);
    const hangMuc = $('gg-secs');

    const theMuc = [...document.querySelectorAll('#tab-nav .tab-link')];
    const chipMuc = theMuc.map((the, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'gg-sec';
        b.dataset.i = i;
        b.innerHTML = '<i class="' + (the.querySelector('i')?.className || 'fas fa-circle') + '"></i>'
            + '<span></span><u></u>';
        b.addEventListener('click', () => { the.click(); dong(); });
        hangMuc.appendChild(b);
        return b;
    });

    function veChipMuc() {
        chipMuc.forEach((b, i) => {
            const the = theMuc[i];
            b.querySelector('span').textContent = (the.querySelector('.tab-text')?.textContent || '').trim();
            b.querySelector('u').textContent = (the.querySelector('.tab-progress')?.textContent || '').trim();
            b.classList.toggle('is-on', the.classList.contains('active'));
        });
    }

    /* Hộp Cài đặt bệnh án: DỜI cả thẻ <details> vào sổ và mở sẵn. Nó vẫn
       nằm trong <form> nên input/change vẫn chạy qua bộ tự lưu như cũ. */
    const hopSet = $('ba-settings');
    let dauSet = null;
    if (hopSet) {
        dauSet = document.createElement('section');
        dauSet.className = 'gg-grp';
        dauSet.innerHTML = '<h4>Cài đặt bệnh án</h4>';
        khung.appendChild(dauSet);
        khung.appendChild(hopSet);
        hopSet.open = true;
    }

    /* Xếp nút vào nhóm. Chạy mỗi lần mở vì tao-benh-an-dt.js chèn thêm
       "Đọc để điền" / "Chỉ ô còn trống" sau khi trang đã nạp xong. */
    function xepNhom() {
        const con = [...tools.querySelectorAll('.ba-tool')];
        const cuoi = hangCua.get(NHOM[NHOM.length - 1][0]);
        con.forEach((b) => {
            const ten = NHOM.find(([, ids]) => ids.includes(b.id))?.[0];
            const dich = hangCua.get(ten) || cuoi;
            if (b.parentElement !== dich) dich.appendChild(b);
        });
    }

    /* Sổ Công cụ giữ lại chính #ba-tools (rỗng, ẩn) làm chỗ neo: vài module
       vẫn hỏi $('ba-tools') để chèn nút mới vào. */
    khung.appendChild(tools);

    /* ---------- Mở / đóng ---------- */
    const dangMo = () => !sheet.classList.contains('hidden');

    function datCho() {
        /* Điện thoại: khay dính đáy màn hình, CSS lo hết. Máy tính: neo dưới nút
           "Công cụ" — đo theo nút chứ không cắm số cứng, vì tiêu đề dài xuống
           hai dòng là nút tụt xuống theo. */
        if (innerWidth <= 640 || !nutMo) {
            /* Kéo cửa sổ từ rộng về hẹp: phải XOÁ toạ độ đã đặt, kẻo `right`
               nội tuyến còn nguyên và đánh nhau với left:0/right:0 của khay
               dính đáy — khay thò một nửa ra ngoài mép phải. */
            panel.style.top = panel.style.right = '';
            return;
        }
        const r = nutMo.getBoundingClientRect();
        panel.style.top = Math.round(r.bottom + 8) + 'px';
        panel.style.right = Math.round(innerWidth - r.right) + 'px';
    }

    function mo() {
        /* Giục bốn module lớp nổi nạp cho kịp (xem thẻ <script> cuối
           tao-benh-an.html) nhưng KHÔNG đợi: đợi thì trên mạng chậm, bấm nút
           xong nửa giây sổ mới hiện ra. Chính cú pointerdown/keydown mở sổ này
           đã châm ngòi cho chúng rồi, nên tới lúc mắt đọc xong bốn nhóm là
           listener đã gắn xong. */
        window.napLopNoi?.();
        xepNhom();
        veChipMuc();
        sheet.classList.remove('hidden');
        body.classList.add('gg-mo');
        nutMo?.setAttribute('aria-expanded', 'true');
        datCho();
        if (innerWidth > 640) oLoc.focus({ preventScroll: true });
    }

    function dong() {
        sheet.classList.add('hidden');
        body.classList.remove('gg-mo');
        nutMo?.setAttribute('aria-expanded', 'false');
        if (oLoc.textContent) { oLoc.textContent = ''; loc(); }
    }

    const nutMo = $('ba-tools-btn');
    nutMo?.setAttribute('aria-expanded', 'false');
    nutMo?.addEventListener('click', (e) => { e.stopPropagation(); dangMo() ? dong() : mo(); });

    /* Nút ⋯ ở thanh đáy đã mang listener cũ (bật khay .ba-tools của điện
       thoại). Thay bằng bản sao để gỡ sạch listener đó rồi gắn cái mới —
       không phải đi sửa tao-benh-an-them.js. */
    const dockCu = $('dock-more');
    if (dockCu) {
        const dock = dockCu.cloneNode(true);
        dockCu.replaceWith(dock);
        dock.addEventListener('click', (e) => { e.stopPropagation(); dangMo() ? dong() : mo(); });
    }

    sheet.addEventListener('click', (e) => {
        if (e.target.closest('[data-gg-close]')) { dong(); return; }
        const b = e.target.closest('.ba-tool');
        if (b && !GIU.has(b.id)) dong();
    });

    addEventListener('resize', () => { if (dangMo()) datCho(); });

    /* Ctrl + / — phím duy nhất phải nhớ để với tới cả 14 công cụ. Escape do
       lop-noi.js lo (nó bấm hộ [data-gg-close]). */
    addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); dangMo() ? dong() : mo(); }
    });

    /* ---------- Ô lọc ---------- */
    /* Bỏ dấu, để gõ "co chu" cũng lọc ra nút "Cỡ chữ". Dải dấu kết hợp dựng
       bằng số hiệu ký tự chứ không dán ký tự trần vào mã nguồn: dấu kết hợp
       đứng một mình rất dễ bị đổi mã lúc lưu file, lúc đó regex im lặng
       ngừng ăn mà nhìn mã vẫn thấy đúng. */
    const DAU = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');
    const bo = (s) => s.normalize('NFD').replace(DAU, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

    function loc() {
        const q = bo(oLoc.textContent.trim());
        khung.querySelectorAll('.ba-tool, .gg-sec').forEach((b) => {
            b.hidden = !!q && !bo(b.textContent).includes(q);
        });
        khung.querySelectorAll('.gg-grp').forEach((g) => {
            const co = [...g.querySelectorAll('.ba-tool, .gg-sec')];
            g.hidden = co.length > 0 && co.every((b) => b.hidden);
        });
        /* Hộp Cài đặt không lọc theo từng ô được (nó là cả một biểu mẫu), nên
           đang lọc thì cất cả hộp lẫn tiêu đề của nó đi cho khỏi chắn kết quả. */
        if (hopSet) hopSet.hidden = !!q;
        if (dauSet) dauSet.hidden = !!q;
    }

    oLoc.addEventListener('input', loc);
    oLoc.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        khung.querySelector('.ba-tool:not([hidden]), .gg-sec:not([hidden])')?.click();
    });


    /* =================================================================
       2. DẢI ĐẦU: THANH % + DẢI MỤC THÀNH MỘT KHỐI DÍNH
       ================================================================= */
    const daiMuc = document.querySelector('.sticky-tabs');
    const thanh = document.querySelector('.overall-track');
    if (daiMuc && thanh) {
        const rail = document.createElement('div');
        rail.className = 'gg-rail';
        daiMuc.before(rail);
        rail.append(thanh, daiMuc);
    }

    let daCuon = false;
    addEventListener('scroll', () => {
        const c = scrollY > 8;
        if (c !== daCuon) { daCuon = c; body.classList.toggle('gg-cuon', c); }
    }, { passive: true });


    /* =================================================================
       3. CỤM TRẠNG THÁI Ở ĐẦU TRANG
       Bọc NGOÀI #save-state chứ không nhét vào trong: tao-benh-an.js ghi đè
       innerHTML của nó mỗi lần đổi trạng thái lưu.
       ================================================================= */
    const oTxt = document.querySelector('.ba-hero-txt');
    const oLuu = $('save-state');
    const vien = $('status-pill');
    if (oTxt && oLuu && vien) {
        const cum = document.createElement('div');
        cum.className = 'gg-stat';
        oLuu.before(cum);
        cum.append(oLuu, vien);
    }


    /* =================================================================
       4. DẢI BỆNH ÁN MẪU → MỘT CHIP
       Đang MỞ bản mẫu thì giữ nguyên dải: đó là cảnh báo "sửa gì cũng không
       lưu", không phải lời mời.
       ================================================================= */
    const KHOA_MAU = 'ggMauTat';
    if (document.documentElement.dataset.mau === '1') {
        body.classList.add('gg-mau');
    } else if (nutMo && localStorage.getItem(KHOA_MAU) !== '1') {
        const chip = document.createElement('span');
        chip.className = 'gg-mau-chip';
        chip.innerHTML = '<a href="tao-benh-an.html?id=BA-MAU" style="color:inherit;text-decoration:none">'
            + '<i class="fas fa-book-open-reader"></i> Xem bệnh án mẫu</a>'
            + '<b role="button" tabindex="0" title="Ẩn hẳn lời mời này"><i class="fas fa-xmark"></i></b>';
        chip.querySelector('b').addEventListener('click', () => {
            try { localStorage.setItem(KHOA_MAU, '1'); } catch { /* chế độ riêng tư */ }
            chip.remove();
        });
        nutMo.before(chip);
    }


    /* =================================================================
       5. PHẦN TRĂM CỦA THẺ MỤC THÀNH VẠCH DƯỚI CHÂN THẺ
       Số do tao-benh-an.js ghi lại sau mỗi lần gõ nên phải rình chữ đổi.
       Nhân thể cập nhật luôn chip mục trong sổ khi sổ đang mở.
       ================================================================= */
    document.querySelectorAll('.tab-link .tab-progress').forEach((el) => {
        const the = el.closest('.tab-link');
        const dat = () => {
            the.style.setProperty('--p', parseInt(el.textContent) || 0);
            if (dangMo()) veChipMuc();
        };
        new MutationObserver(dat).observe(el, { childList: true, characterData: true, subtree: true });
        dat();
    });
}
