// waiting-room.js - Script for Waiting Room page

document.addEventListener('DOMContentLoaded', () => {
    // Hamburger menu logic for mobile
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
    if (menuToggleBtn && sidebar && sidebarOverlay && sidebarCloseBtn) {
        menuToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.remove('-translate-x-full');
            sidebarOverlay.classList.remove('hidden');
        });
        function closeSidebarImmediately() {
            sidebar.classList.add('-translate-x-full');
            sidebarOverlay.classList.add('hidden');
        }
        sidebarCloseBtn.addEventListener('click', closeSidebarImmediately);
        sidebarOverlay.addEventListener('click', closeSidebarImmediately);
        const sidebarNav = sidebar.querySelector('nav');
        if (sidebarNav) {
            sidebarNav.querySelectorAll('a, button').forEach(el => {
                el.addEventListener('click', () => {
                    closeSidebarImmediately();
                });
            });
        }
    }
    // Đồng bộ avatar, tên người dùng cho sidebar/mobile
    const userName = document.getElementById('user-name');
    const userAvatar = document.getElementById('user-avatar');
    const userNameSidebar = document.getElementById('user-name-sidebar');
    const userAvatarSidebar = document.getElementById('user-avatar-sidebar');
    const userAvatarMobile = document.getElementById('user-avatar-mobile');
    function syncUserInfo() {
        if (userName && userNameSidebar) userNameSidebar.textContent = userName.textContent;
        if (userAvatar && userAvatarSidebar) userAvatarSidebar.src = userAvatar.src;
        if (userAvatar && userAvatarMobile) userAvatarMobile.src = userAvatar.src;
    }
    setTimeout(syncUserInfo, 500);
    function updateSidebarState() {
        if (window.innerWidth >= 768) {
            if (sidebar) sidebar.classList.remove('-translate-x-full');
            if (sidebarOverlay) sidebarOverlay.classList.add('hidden');
        } else {
            if (sidebar) sidebar.classList.add('-translate-x-full');
            if (sidebarOverlay) sidebarOverlay.classList.add('hidden');
        }
    }
    window.addEventListener('resize', updateSidebarState);
    updateSidebarState();

    // Squirrel mascot floating message logic
    const squirrelFloating = document.getElementById('squirrel-floating');
    const squirrelMessage = document.getElementById('squirrel-message');
    if (!squirrelMessage) {
        const msgDiv = document.createElement('div');
        msgDiv.id = 'squirrel-message';
        msgDiv.className = 'hidden absolute bottom-16 right-0 bg-white/90 text-gray-800 rounded-lg shadow-lg px-4 py-2 text-base max-w-[80vw] sm:max-w-xs z-50 border border-pink-200';
        squirrelFloating && squirrelFloating.appendChild(msgDiv);
    }
    const squirrelMessages = [
        'Chúc bạn học tốt! 💪',
        'Cố lên nhé, bạn làm được mà! 🐿️',
        'Học vui như sóc nhảy cành!',
        '<i class="fas fa-heart text-pink-400"></i>',
        '<i class="fas fa-book text-blue-400"></i>',
        '<i class="fas fa-graduation-cap text-purple-400"></i>',
        'Đừng quên uống nước nhé! 💧',
        'Bạn là số 1! ⭐',
        'Kiến thức là hạt dẻ, hãy tích lũy mỗi ngày!',
        '<i class="fas fa-lightbulb text-yellow-400"></i>',
        'Học tập chăm chỉ, thành công sẽ đến!',
        'Tự tin lên nào! ✨',
        'Hôm nay bạn đã cố gắng rất nhiều rồi!'
    ];
    if (squirrelFloating) {
        const msgBox = document.getElementById('squirrel-message');
        squirrelFloating.addEventListener('click', () => {
            const msg = squirrelMessages[Math.floor(Math.random() * squirrelMessages.length)];
            if (msgBox) {
                msgBox.innerHTML = msg;
                msgBox.classList.remove('hidden');
                setTimeout(() => {
                    msgBox.classList.add('hidden');
                }, 2200);
            }
        });
    }

    // ====== BỆNH ÁN: Hiển thị danh sách, tạo mới, xem, chỉnh sửa ======

    // Lấy danh sách bệnh án từ localStorage nếu có, nếu không thì dùng mẫu
    let records = [];
    try {
        records = JSON.parse(localStorage.getItem('medicalRecords')) || [];
    } catch (e) {
        records = [];
    }
    if (!records || records.length === 0) {
        records = [
            {
                id: 1,
                name: 'Bệnh án Viêm phổi',
                created: '2025-06-20',
                status: 'Hoàn thành'
            },
            {
                id: 2,
                name: 'Bệnh án Đái tháo đường',
                created: '2025-06-25',
                status: 'Đang chỉnh sửa'
            },
            {
                id: 3,
                name: 'Bệnh án Tăng huyết áp',
                created: '2025-06-28',
                status: 'Hoàn thành'
            }
        ];
    }

    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function renderMedicalRecords(records) {
        const cardContainer = document.getElementById('medical-record-cards');
        if (!cardContainer) return;
        const countEl = document.getElementById('record-count');
        if (countEl) countEl.textContent = records.length ? `· ${records.length} bệnh án` : '';
        cardContainer.innerHTML = '';
        if (records.length === 0) {
            cardContainer.innerHTML = `
                <div class='col-span-full flex flex-col items-center justify-center py-12 text-center'>
                    <div class='w-16 h-16 rounded-full bg-pink-100 flex items-center justify-center mb-3'><i class='fas fa-notes-medical text-2xl text-pink-400'></i></div>
                    <p class='text-gray-500 font-semibold'>Chưa có bệnh án nào</p>
                    <p class='text-gray-400 text-sm mt-1'>Bấm nút <b class='text-pink-500'>+ Tạo bệnh án</b> để bắt đầu nhé!</p>
                </div>`;
            return;
        }
        records.forEach((rec) => {
            let badgeClass = 'bg-gray-100 text-gray-600 border border-gray-200';
            let badgeIcon = 'fa-circle';
            const status = rec.status || 'Hoàn thành';
            if (status === 'Hoàn thành') { badgeClass = 'bg-green-50 text-green-600 border border-green-200'; badgeIcon = 'fa-check-circle'; }
            else if (status === 'Đang chỉnh sửa') { badgeClass = 'bg-yellow-50 text-yellow-600 border border-yellow-200'; badgeIcon = 'fa-pen'; }
            else if (status === 'Đã xóa') { badgeClass = 'bg-red-50 text-red-600 border border-red-200'; badgeIcon = 'fa-trash'; }
            const hoTen = esc(rec.hanhChinh?.hoTen);
            const lyDo = esc(rec.lyDoVaoVien);
            const chanDoan = esc(rec.chanDoanSoBo || rec.chanDoanXacDinh);
            const soPhong = esc(rec.hanhChinh?.roomNumber || rec.hanhChinh?.soPhong);
            const soGiuong = esc(rec.hanhChinh?.bedNumber || rec.hanhChinh?.soGiuong);
            const thoiGian = esc(rec.hanhChinh?.ngayLamBenhAn);
            const initial = esc((rec.hanhChinh?.hoTen || '?').trim().charAt(0).toUpperCase());
            const card = document.createElement('div');
            card.className = 'group bg-white border border-pink-100 rounded-2xl shadow-sm hover:shadow-lg hover:-translate-y-0.5 hover:border-pink-300 transition-all duration-200 p-4 flex flex-col gap-2.5 h-full';
            card.innerHTML = `
                <div class='flex items-start gap-3'>
                    <div class='w-10 h-10 rounded-full bg-gradient-to-br from-pink-400 to-purple-400 text-white font-bold flex items-center justify-center flex-shrink-0 shadow'>${initial}</div>
                    <div class='min-w-0 flex-1'>
                        <p class='font-bold text-gray-800 truncate' title='${hoTen}'>${hoTen || 'Chưa đặt tên'}</p>
                        <span class='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium mt-0.5 ${badgeClass}'><i class='fas ${badgeIcon} text-[10px]'></i>${esc(status)}</span>
                    </div>
                </div>
                <div class='text-gray-600 text-sm truncate' title='${lyDo}'><span class='text-gray-400'>Lý do:</span> ${lyDo || '—'}</div>
                <div class='text-gray-600 text-sm truncate' title='${chanDoan}'><span class='text-gray-400'>Chẩn đoán:</span> ${chanDoan || '—'}</div>
                <div class='flex items-center gap-4 text-gray-400 text-xs mt-auto pt-1'>
                    <span><i class='fas fa-door-open mr-1'></i>Phòng ${soPhong || '—'}</span>
                    <span><i class='fas fa-bed mr-1'></i>Giường ${soGiuong || '—'}</span>
                    ${thoiGian ? `<span class='ml-auto'><i class='far fa-clock mr-1'></i>${thoiGian}</span>` : ''}
                </div>
                <div class='flex gap-2 pt-2 border-t border-pink-50'>
                    <button class="view-record flex-1 px-2 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 active:scale-95 transition text-sm font-medium" data-id="${esc(rec.id)}" title="Xem bệnh án"><i class="fas fa-eye mr-1"></i>Xem</button>
                    <button class="edit-record flex-1 px-2 py-1.5 bg-yellow-50 text-yellow-600 rounded-lg hover:bg-yellow-100 active:scale-95 transition text-sm font-medium" data-id="${esc(rec.id)}" title="Chỉnh sửa"><i class="fas fa-edit mr-1"></i>Sửa</button>
                    <button class="delete-record px-3 py-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 active:scale-95 transition text-sm" data-id="${esc(rec.id)}" title="Xóa"><i class="fas fa-trash"></i></button>
                </div>
            `;
            cardContainer.appendChild(card);
        });
    }

    renderMedicalRecords(records);

    // Tìm kiếm bệnh án
    const searchInput = document.getElementById('search-record');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const keyword = e.target.value.trim().toLowerCase();
            const filtered = records.filter(r => {
                const hoTen = (r.hanhChinh?.hoTen || '').toLowerCase();
                const soPhong = (r.hanhChinh?.roomNumber || r.hanhChinh?.soPhong || '').toString().toLowerCase();
                const soGiuong = (r.hanhChinh?.bedNumber || r.hanhChinh?.soGiuong || '').toString().toLowerCase();
                const lyDo = (r.lyDoVaoVien || '').toLowerCase();
                const chanDoan = (r.chanDoanSoBo || r.chanDoanXacDinh || '').toLowerCase();
                return (
                    hoTen.includes(keyword) ||
                    soPhong.includes(keyword) ||
                    soGiuong.includes(keyword) ||
                    lyDo.includes(keyword) ||
                    chanDoan.includes(keyword)
                );
            });
            renderMedicalRecords(filtered);
        });
    }

    // Xử lý nút tạo mới
    const createBtn = document.getElementById('create-new-record');
    if (createBtn) {
        createBtn.addEventListener('click', () => {
            const newId = 'ba_' + Date.now();
            localStorage.setItem('newMedicalRecordId', newId);
            window.location.href = '../medical-record/tao-benh-an.html?id=' + encodeURIComponent(newId);
            window.showToast('Tạo bệnh án mới!');
        });
    }

    // Xử lý nút xem/sửa/xóa
    document.getElementById('medical-record-cards')?.addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const id = target.getAttribute('data-id');
        if (target.classList.contains('view-record')) {
            window.open(`../medical-record/xem-benh-an.html?id=${encodeURIComponent(id)}`, '_blank');
        } else if (target.classList.contains('edit-record')) {
            window.location.href = `../medical-record/tao-benh-an.html?id=${encodeURIComponent(id)}`;
        } else if (target.classList.contains('delete-record')) {
            if (confirm('Bạn có chắc muốn xóa bệnh án này?')) {
                const idx = records.findIndex(r => r.id == id);
                if (idx !== -1) {
                    records.splice(idx, 1);
                    localStorage.setItem('medicalRecords', JSON.stringify(records));
                    renderMedicalRecords(records);
                    window.showToast('Đã xóa bệnh án!');
                }
            }
        }
    });
});
