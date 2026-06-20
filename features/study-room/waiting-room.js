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

    function renderMedicalRecords(records) {
        const cardContainer = document.getElementById('medical-record-cards');
        if (cardContainer) {
            cardContainer.innerHTML = '';
            if (records.length === 0) {
                cardContainer.innerHTML = `<div class='text-center py-6 text-gray-400'>Chưa có bệnh án nào.</div>`;
            } else {
                records.forEach((rec, idx) => {
                    let badgeClass = 'bg-gray-200 text-gray-700';
                    let status = rec.status || '';
                    if (!status) status = 'Hoàn thành';
                    if (status === 'Hoàn thành') badgeClass = 'bg-green-100 text-green-700 border border-green-300';
                    else if (status === 'Đang chỉnh sửa') badgeClass = 'bg-yellow-100 text-yellow-700 border border-yellow-300';
                    else if (status === 'Đã xóa') badgeClass = 'bg-red-100 text-red-700 border border-red-300';
                    const hoTen = rec.hanhChinh?.hoTen || '';
                    const lyDo = rec.lyDoVaoVien || '';
                    const chanDoan = rec.chanDoanSoBo || rec.chanDoanXacDinh || '';
                    const soPhong = rec.hanhChinh?.roomNumber || rec.hanhChinh?.soPhong || '';
                    const soGiuong = rec.hanhChinh?.bedNumber || rec.hanhChinh?.soGiuong || '';
                    const thoiGian = rec.hanhChinh?.ngayLamBenhAn || '';
                    const card = document.createElement('div');
                    card.className = 'bg-pink-50 border border-pink-200 rounded-2xl shadow-md p-4 flex flex-col gap-2 h-full';
                    card.innerHTML = `
                        <div class='flex justify-between items-center'>
                            <span class='font-bold text-pink-700 text-lg'>${hoTen || 'Chưa đặt tên'}</span>
                            <span class='px-2 py-1 rounded text-xs ${badgeClass}'>${status}</span>
                        </div>
                        <div class='text-gray-600'><b>Lý do:</b> ${lyDo}</div>
                        <div class='text-gray-600'><b>Chẩn đoán:</b> ${chanDoan}</div>
                        <div class='flex gap-4 text-gray-500 text-sm'>
                            <span><i class='fas fa-door-open'></i> Phòng: ${soPhong}</span>
                            <span><i class='fas fa-bed'></i> Giường: ${soGiuong}</span>
                        </div>
                        <div class='text-gray-400 text-xs'>Thời gian: ${thoiGian}</div>
                        <div class='flex gap-2 mt-2'>
                            <button class="view-record flex-1 px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition shadow" data-id="${rec.id}" title="Xem bệnh án"><i class="fas fa-eye"></i></button>
                            <button class="edit-record flex-1 px-2 py-1 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 transition shadow" data-id="${rec.id}" title="Chỉnh sửa"><i class="fas fa-edit"></i></button>
                            <button class="delete-record flex-1 px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition shadow" data-id="${rec.id}" title="Xóa"><i class="fas fa-trash"></i></button>
                        </div>
                    `;
                    cardContainer.appendChild(card);
                });
            }
        }
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
            window.location.href = 'tao-benh-an.html?id=' + encodeURIComponent(newId);
            window.showToast('Tạo bệnh án mới!');
        });
    }

    // Xử lý nút xem/sửa/xóa
    document.getElementById('medical-record-list')?.addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const id = target.getAttribute('data-id');
        if (target.classList.contains('view-record')) {
            window.open(`xem-benh-an.html?id=${encodeURIComponent(id)}`, '_blank');
        } else if (target.classList.contains('edit-record')) {
            window.location.href = `tao-benh-an.html?id=${encodeURIComponent(id)}`;
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
    // Xử lý nút xem/sửa/xóa cho card (mobile)
    document.getElementById('medical-record-cards')?.addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const id = target.getAttribute('data-id');
        if (target.classList.contains('view-record')) {
            window.open(`xem-benh-an.html?id=${encodeURIComponent(id)}`, '_blank');
        } else if (target.classList.contains('edit-record')) {
            window.location.href = `tao-benh-an.html?id=${encodeURIComponent(id)}`;
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
