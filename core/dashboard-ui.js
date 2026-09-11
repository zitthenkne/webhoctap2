// File: core/dashboard-ui.js
import { requireLogin } from './require-login.js';

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

    // 5. Viết bệnh án button routing
    const selectWriteMedicalRecord = document.getElementById('selectWriteMedicalRecord');
    if (selectWriteMedicalRecord) {
        selectWriteMedicalRecord.addEventListener('click', async () => {
            if (!await requireLogin('Viết bệnh án')) return;
            window.location.href = 'features/medical-record/tao-benh-an.html';
        });
    }

    // 6. Tạo Checklist button routing
    const selectChecklist = document.getElementById('selectChecklist');
    if (selectChecklist) {
        selectChecklist.addEventListener('click', async () => {
            if (!await requireLogin('Tạo Checklist')) return;
            window.location.href = 'features/checklist/checklist.html';
        });
    }

}
