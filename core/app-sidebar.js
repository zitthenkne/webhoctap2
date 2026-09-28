/* core/app-sidebar.js — THANH BÊN DÙNG CHUNG (index.html, features/study-room/waiting-room.html…).
   Một nguồn danh sách lối tắt: thêm/bớt mục ở NHOM là mọi trang đổi theo. Giao diện: core/app-sidebar.css.

   Cách gắn vào một trang:
       <aside id="sidebar" class="…class Tailwind trượt vào/ra như cũ…"></aside>
       <script src="…/core/app-sidebar.js"></script>      ← script THƯỜNG, ngay sau </aside>
   Không defer/module: index.html cần các .nav-link có sẵn trước khi app.js (module) gắn sự kiện.

   - Ở index.html (<aside data-spa>) mục tab mang data-target, app.js chuyển tab tại chỗ.
     Trang khác: mục tab dẫn về index.html#<tab>.
   - Khối người dùng là link sang trang hồ sơ (id #sb-user); khách thì trang hồ sơ tự đưa về đăng nhập.
   - Nút thu gọn (máy tính) nhớ theo thiết bị: localStorage sidebarMini → body.sb-mini. */
(function () {
    var aside = document.getElementById('sidebar');
    if (!aside) return;
    var root = document.currentScript.src.replace(/core\/app-sidebar\.js.*$/, '');
    // data-spa: trang chủ index.html (script chạy khi các tab bên dưới CHƯA được parse nên phải có cờ)
    var onIndex = aside.hasAttribute('data-spa');

    // [khóa, nhãn, icon, màu icon, nền icon, (tùy chọn) tiêu đề tab]
    // khóa = id tab trong index.html, hoặc đường dẫn trang tính từ gốc app (có dấu "/").
    var NHOM = [
        ['Học tập', [
            ['dashboardContent', 'Trang chủ', 'fa-house', '#ec4899', '#fde7f1'],
            ['libraryContent', 'Thư viện', 'fa-book', '#d97706', '#fef3c7'],
            ['createQuizContent', 'Tạo trắc nghiệm', 'fa-plus', '#f43f5e', '#ffe4e6'],
            ['statsContent', 'Thống kê', 'fa-chart-simple', '#8b5cf6', '#ede9fe']
        ]],
        ['Công cụ', [
            ['myStudyRoomsContent', 'Phòng đánh đề', 'fa-users', '#0284c7', '#e0f2fe', 'Phòng học của tôi'],
            ['gpaCalculatorContent', 'Tính điểm hệ 4', 'fa-calculator', '#a855f7', '#f3e8ff'],
            ['features/study-room/waiting-room.html', 'Bệnh án', 'fa-notes-medical', '#16a34a', '#dcfce7'],
            ['features/checklist/checklist.html', 'Checklist ATCS', 'fa-list-check', '#2563eb', '#dbeafe'],
            ['features/link-vault/link-vault.html', 'Lưu trữ link', 'fa-link', '#db2777', '#fce7f3']
        ]]
    ];

    function muc(m) {
        var key = m[0], isTab = key.indexOf('/') < 0;
        var active = isTab ? (onIndex && key === 'dashboardContent') : location.pathname.slice(-key.length) === key;
        var href = !isTab ? root + key
            : onIndex ? '#'
            : root + 'index.html' + (key === 'dashboardContent' ? '' : '#' + key);
        return '<li><a href="' + href + '"' +
            (isTab && onIndex ? ' data-target="' + key + '"' : '') +
            (m[5] ? ' data-title="' + m[5] + '"' : '') +
            ' class="nav-link' + (active ? ' is-active" aria-current="page"' : '"') +
            ' title="' + m[1] + '" style="--c:' + m[3] + ';--cb:' + m[4] + '">' +
            '<span class="sb-ico"><i class="fas ' + m[2] + '"></i></span><span class="sb-text">' + m[1] + '</span></a></li>';
    }

    aside.innerHTML =
        '<button type="button" id="sidebar-close-btn" aria-label="Đóng thanh bên"' +
        ' class="md:hidden absolute top-3 right-3 text-gray-400 hover:text-pink-500 text-2xl z-50 bg-white/80 rounded-full p-1 shadow"><i class="fas fa-times"></i></button>' +
        '<div class="sb-head">' +
            '<a href="' + root + 'index.html" class="sb-brand" title="Zitthenkne — Trang chủ">' +
                '<img src="' + root + 'assets/logo.png" alt="Zitthenkne Logo" class="sb-logo"><span class="sb-text sb-brand-name">Zitthenkne</span></a>' +
            '<button type="button" id="sb-collapse-btn" class="sb-collapse"><i class="fas fa-angles-left"></i></button>' +
        '</div>' +
        '<a id="sb-user" class="sb-user" href="' + root + 'features/profile/profile.html" title="Hồ sơ cá nhân">' +
            '<img id="user-avatar-sidebar" src="https://ui-avatars.com/api/?name=?&background=D8BFD8&color=fff" alt=""' +
            ' class="w-9 h-9 rounded-full border-2 border-[#D8BFD8] shadow flex-shrink-0">' +
            '<span class="sb-text sb-user-meta"><span id="user-name-sidebar" class="sb-user-name">Khách</span>' +
            '<span class="sb-user-sub">Hồ sơ cá nhân</span></span>' +
            '<i class="fas fa-chevron-right sb-text sb-user-go"></i>' +
        '</a>' +
        '<nav class="sb-nav" aria-label="Điều hướng chính"><ul>' +
            NHOM.map(function (g) {
                return '<li class="sb-label"><span class="sb-text">' + g[0] + '</span></li>' + g[1].map(muc).join('');
            }).join('') +
        '</ul></nav>' +
        '<p class="sb-foot sb-text">&copy; 2025 Zitthenk · Y23C · UMP</p>';

    // Thu gọn thành dải icon (máy tính)
    var btn = document.getElementById('sb-collapse-btn');
    function nhan() {
        var t = document.body.classList.contains('sb-mini') ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên';
        btn.title = t;
        btn.setAttribute('aria-label', t);
    }
    try { if (localStorage.getItem('sidebarMini') === '1') document.body.classList.add('sb-mini'); } catch (e) {}
    nhan();
    btn.addEventListener('click', function () {
        var mini = document.body.classList.toggle('sb-mini');
        try { localStorage.setItem('sidebarMini', mini ? '1' : '0'); } catch (e) {}
        nhan();
    });
})();
