// File: core/dashboard-ui.js
import { requireLogin } from './require-login.js';

// Module chịu trách nhiệm quản lý các tương tác giao diện (UI) trang chủ, sidebar mobile và modal sửa phòng học local

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

        // Nút "Thêm" ở thanh tab dưới mở thanh bên; Esc đóng thanh bên đang mở trên điện thoại
        document.getElementById('tabbar-menu-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            openSidebar();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && window.innerWidth < 768 && !sidebar.classList.contains('-translate-x-full')) closeSidebarImmediately();
        });
    }

    // (Nút thu gọn thanh bên do core/app-sidebar.js lo — dùng chung mọi trang)
    initHome();

    // 2. Window Resize Sidebar State
    window.addEventListener('resize', updateSidebarState);
    updateSidebarState();

    // Đồng bộ user info trễ một chút sau khi app load
    setTimeout(syncUserInfo, 600);

    // 5. Viết bệnh án button routing
    const selectWriteMedicalRecord = document.getElementById('selectWriteMedicalRecord');
    if (selectWriteMedicalRecord) {
        selectWriteMedicalRecord.addEventListener('click', async () => {
            if (!await requireLogin('Viết bệnh án')) return;
            // Vào danh sách bệnh án trước (tạo mới / mở lại bài cũ ở đó), không nhảy thẳng vào trang viết
            window.location.href = 'features/study-room/waiting-room.html';
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

// ===================== BẢNG TRANG CHỦ =====================
// Lời chào, ô tìm nhanh, phím "/".

function renderHello() {
    const el = document.getElementById('home-hello');
    if (!el) return;
    const h = new Date().getHours();
    const buoi = h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
    const name = (document.getElementById('user-name')?.textContent || '').trim();
    const date = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric' });
    el.textContent = `${buoi}${name && name !== 'Khách' ? ', ' + name : ''} · ${date}`;
}

function initHome() {
    renderHello();
    const nameEl = document.getElementById('user-name');
    if (nameEl) new MutationObserver(renderHello).observe(nameEl, { childList: true, characterData: true, subtree: true });

    const goTab = (id) => document.querySelector(`#sidebar .nav-link[data-target="${id}"]`)?.click();

    // Ô tìm nhanh: Enter → sang Thư viện, đổ từ khóa vào ô tìm của thư viện
    const form = document.getElementById('home-search');
    const input = document.getElementById('home-search-input');
    form?.addEventListener('submit', (e) => {
        e.preventDefault();
        const q = input.value.trim();
        goTab('libraryContent');
        const lib = document.getElementById('library-search-input');
        if (lib && q) { lib.value = q; lib.dispatchEvent(new Event('input')); }
        input.value = '';
        input.blur();
    });

    // "/" = gõ tìm kiếm ở tab đang mở (Trang chủ hoặc Thư viện)
    document.addEventListener('keydown', (e) => {
        if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
        const a = document.activeElement;
        if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;
        const visible = (id) => { const p = document.getElementById(id); return p && !p.classList.contains('hidden'); };
        const target = visible('dashboardContent') ? input
            : visible('libraryContent') ? document.getElementById('library-search-input') : null;
        if (!target) return;
        e.preventDefault();
        target.focus();
        target.select();
    });
}
