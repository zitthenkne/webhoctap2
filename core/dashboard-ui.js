// File: core/dashboard-ui.js
// Module chịu trách nhiệm quản lý các tương tác giao diện (UI) trang chủ, sidebar mobile, mascot và modal sửa phòng học local

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

/**
 * Đồng bộ thông tin người dùng từ Header chính sang Sidebar và Mobile Top Bar
 */
export function syncUserInfo() {
    const userName = document.getElementById('user-name');
    const userAvatar = document.getElementById('user-avatar');
    const userNameSidebar = document.getElementById('user-name-sidebar');
    const userAvatarSidebar = document.getElementById('user-avatar-sidebar');
    const userAvatarMobile = document.getElementById('user-avatar-mobile');
    
    if (userName && userNameSidebar) userNameSidebar.textContent = userName.textContent;
    if (userAvatar) {
        if (userAvatarSidebar) userAvatarSidebar.src = userAvatar.src;
        if (userAvatarMobile) userAvatarMobile.src = userAvatar.src;
    }
}

/**
 * Cập nhật trạng thái hiển thị của Sidebar dựa trên kích thước màn hình
 */
export function updateSidebarState() {
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    if (!sidebar) return;

    if (window.innerWidth >= 768) {
        sidebar.classList.remove('-translate-x-full');
        if (sidebarOverlay) sidebarOverlay.classList.add('hidden', 'opacity-0');
    } else {
        sidebar.classList.add('-translate-x-full');
        if (sidebarOverlay) sidebarOverlay.classList.add('hidden', 'opacity-0');
    }
}

/**
 * Hiển thị danh sách phòng học mẫu lưu ở localStorage
 */
export function renderLocalStudyRooms() {
    const myStudyRoomsList = document.getElementById('my-study-rooms-list');
    if (!myStudyRoomsList) return;
    const rooms = JSON.parse(localStorage.getItem('myStudyRooms') || '[]');
    myStudyRoomsList.innerHTML = rooms.map((room, idx) => `
        <div class="bg-white rounded-xl shadow p-4 flex flex-col gap-2 border border-pink-100">
            <div class="flex items-center justify-between">
                <div>
                    <div class="font-bold text-lg text-pink-600">${room.name || 'Phòng học'}</div>
                    <div class="text-gray-500 text-sm">ID: <span class="font-mono">${room.id}</span></div>
                </div>
                <button class="edit-room-id-btn px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition text-xs font-semibold" data-idx="${idx}"><i class="fas fa-edit mr-1"></i>Sửa</button>
            </div>
        </div>
    `).join('');
}

/**
 * Khởi tạo toàn bộ các tương tác UI cho Dashboard
 */
export function initDashboardUI() {
    // 1. Sidebar hamburger toggle cho Mobile
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const sidebarCloseBtn = document.getElementById('sidebar-close-btn');

    if (menuToggleBtn && sidebar && sidebarOverlay && sidebarCloseBtn) {
        let overlayHideTimer = null;

        const openSidebar = () => {
            clearTimeout(overlayHideTimer);
            // Phòng trường hợp sidebar bị gắn 'hidden' ở nơi khác -> gỡ ra để trượt vào hiện được
            sidebar.classList.remove('hidden', '-translate-x-full');
            sidebarOverlay.classList.remove('hidden');
            // Hiện overlay rồi fade-in ở frame kế tiếp để transition chạy mượt
            requestAnimationFrame(() => sidebarOverlay.classList.remove('opacity-0'));
        };

        const closeSidebarImmediately = () => {
            clearTimeout(overlayHideTimer);
            sidebar.classList.add('-translate-x-full');
            sidebarOverlay.classList.add('opacity-0');
            // Ẩn hẳn overlay sau khi fade-out xong để không chặn thao tác chạm
            overlayHideTimer = setTimeout(() => sidebarOverlay.classList.add('hidden'), 250);
        };

        menuToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            // Toggle: đang đóng thì mở, đang mở thì đóng
            if (sidebar.classList.contains('-translate-x-full')) {
                openSidebar();
            } else {
                closeSidebarImmediately();
            }
        });

        sidebarCloseBtn.addEventListener('click', closeSidebarImmediately);
        sidebarOverlay.addEventListener('click', closeSidebarImmediately);

        const sidebarLinks = sidebar.querySelectorAll('nav a, nav button');
        sidebarLinks.forEach(el => {
            el.addEventListener('click', closeSidebarImmediately);
        });
    }

    // 2. Window Resize Sidebar State
    window.addEventListener('resize', updateSidebarState);
    updateSidebarState();

    // Đồng bộ user info trễ một chút sau khi app load
    setTimeout(syncUserInfo, 600);

    // 3. Squirrel pixel mascot floating logic
    const squirrelFloating = document.getElementById('squirrel-floating');
    if (squirrelFloating) {
        let msgBox = document.getElementById('squirrel-message');
        if (!msgBox) {
            msgBox = document.createElement('div');
            msgBox.id = 'squirrel-message';
            msgBox.className = 'hidden absolute bottom-16 right-0 bg-white/90 text-gray-800 rounded-lg shadow-lg px-4 py-2 text-base max-w-[80vw] sm:max-w-xs z-50 border border-pink-200';
            squirrelFloating.appendChild(msgBox);
        }

        squirrelFloating.addEventListener('click', () => {
            const msg = squirrelMessages[Math.floor(Math.random() * squirrelMessages.length)];
            msgBox.innerHTML = msg;
            msgBox.classList.remove('hidden');
            setTimeout(() => {
                msgBox.classList.add('hidden');
            }, 2200);
        });
    }

    // 4. Vào phòng học bằng mã (Modal join room)
    const joinRoomModal = document.getElementById('joinRoomModal');
    const closeJoinRoomModalBtn = document.getElementById('closeJoinRoomModalBtn');
    const joinRoomBtn = document.getElementById('joinRoomBtn');
    const joinRoomIdInput = document.getElementById('joinRoomIdInput');
    const joinRoomByCodeBtn = document.getElementById('join-room-by-code-btn');

    const joinRoomById = (id) => {
        const roomId = id ? id.trim() : '';
        if (roomId) {
            window.location.href = `features/study-room/study-room.html?id=${encodeURIComponent(roomId)}`;
        } else if (joinRoomIdInput) {
            joinRoomIdInput.classList.add('border-red-400');
            joinRoomIdInput.focus();
        }
    };

    if (joinRoomByCodeBtn && joinRoomModal) {
        joinRoomByCodeBtn.addEventListener('click', () => {
            joinRoomModal.classList.remove('hidden');
            if (joinRoomIdInput) {
                joinRoomIdInput.value = '';
                joinRoomIdInput.classList.remove('border-red-400');
                joinRoomIdInput.focus();
            }
        });
    }

    if (closeJoinRoomModalBtn && joinRoomModal) {
        closeJoinRoomModalBtn.addEventListener('click', () => joinRoomModal.classList.add('hidden'));
    }

    if (joinRoomBtn) {
        joinRoomBtn.addEventListener('click', () => joinRoomById(joinRoomIdInput ? joinRoomIdInput.value : ''));
    }

    if (joinRoomIdInput) {
        joinRoomIdInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') joinRoomById(joinRoomIdInput.value);
            joinRoomIdInput.classList.remove('border-red-400');
        });
    }

    // 5. Viết bệnh án button routing
    const selectWriteMedicalRecord = document.getElementById('selectWriteMedicalRecord');
    if (selectWriteMedicalRecord) {
        selectWriteMedicalRecord.addEventListener('click', () => {
            window.location.href = 'features/medical-record/tao-benh-an.html';
        });
    }

    // 6. Tạo Checklist button routing
    const selectChecklist = document.getElementById('selectChecklist');
    if (selectChecklist) {
        selectChecklist.addEventListener('click', () => {
            window.location.href = 'features/checklist/checklist.html';
        });
    }

    // 7. Sửa ID phòng học local trong localStorage
    const editRoomIdModal = document.getElementById('editRoomIdModal');
    const closeEditRoomIdModalBtn = document.getElementById('closeEditRoomIdModalBtn');
    const saveEditRoomIdBtn = document.getElementById('saveEditRoomIdBtn');
    const editRoomIdInput = document.getElementById('editRoomIdInput');
    const myStudyRoomsList = document.getElementById('my-study-rooms-list');
    let editingRoomIdx = null;

    if (myStudyRoomsList) {
        // Khởi tạo dữ liệu mẫu nếu trống
        if (!localStorage.getItem('myStudyRooms') || JSON.parse(localStorage.getItem('myStudyRooms')).length === 0) {
            localStorage.setItem('myStudyRooms', JSON.stringify([
                { id: 'room1', name: 'Phòng Toán' },
                { id: 'room2', name: 'Phòng Lý' }
            ]));
        }
        renderLocalStudyRooms();

        myStudyRoomsList.addEventListener('click', (e) => {
            const btn = e.target.closest('.edit-room-id-btn');
            if (btn && editRoomIdModal && editRoomIdInput) {
                editingRoomIdx = btn.getAttribute('data-idx');
                const rooms = JSON.parse(localStorage.getItem('myStudyRooms') || '[]');
                editRoomIdInput.value = rooms[editingRoomIdx]?.id || '';
                editRoomIdModal.classList.remove('hidden');
            }
        });
    }

    if (closeEditRoomIdModalBtn && editRoomIdModal) {
        closeEditRoomIdModalBtn.addEventListener('click', () => editRoomIdModal.classList.add('hidden'));
    }

    if (saveEditRoomIdBtn && editRoomIdModal && editRoomIdInput) {
        saveEditRoomIdBtn.addEventListener('click', () => {
            const newId = editRoomIdInput.value.trim();
            if (!newId) {
                editRoomIdInput.classList.add('border-red-400');
                return;
            }
            const rooms = JSON.parse(localStorage.getItem('myStudyRooms') || '[]');
            if (rooms.some((r, idx) => r.id === newId && idx != editingRoomIdx)) {
                alert('ID phòng đã tồn tại!');
                return;
            }
            rooms[editingRoomIdx].id = newId;
            localStorage.setItem('myStudyRooms', JSON.stringify(rooms));
            editRoomIdModal.classList.add('hidden');
            renderLocalStudyRooms();
        });

        editRoomIdInput.addEventListener('input', () => {
            editRoomIdInput.classList.remove('border-red-400');
        });
    }
}
