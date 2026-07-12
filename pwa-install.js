// PWA Installation helper for Zitthenkne
let deferredPrompt;

// 1. Register Service Worker và tự động cập nhật khi có bản mới
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Tự động xác định thư mục gốc của ứng dụng (đặc biệt khi chạy trong thư mục con như trên Live Server)
    const path = window.location.pathname;
    let rootPath = '/';
    if (path.includes('/features/')) {
        rootPath = path.substring(0, path.indexOf('/features/')) + '/';
    } else {
        rootPath = path.substring(0, path.lastIndexOf('/')) + '/';
    }
    if (!rootPath.startsWith('/')) rootPath = '/' + rootPath;
    if (rootPath.endsWith('//')) rootPath = rootPath.slice(0, -1);

    const swPath = rootPath + 'sw.js';
    navigator.serviceWorker.register(swPath, { scope: rootPath })
      .then(reg => {
        console.log('Zitthenkne Service Worker registered successfully with scope: ', reg.scope);

        // Kiểm tra xem có SW mới đang chờ kích hoạt không
        if (reg.waiting) {
          reg.waiting.postMessage({ action: 'skipWaiting' });
        }

        // Lắng nghe sự kiện tìm thấy SW mới
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Có bản cập nhật mới, gửi lệnh skipWaiting để kích hoạt
              newWorker.postMessage({ action: 'skipWaiting' });
            }
          });
        });
      })
      .catch(err => {
        console.error('Zitthenkne Service Worker registration failed: ', err);
      });
  });

  // Tự động tải lại trang khi Service Worker mới kích hoạt thành công (claim clients)
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      console.log('Service Worker mới đã kích hoạt. Đang tải lại trang để cập nhật giao diện...');
      window.location.reload();
    }
  });
}

// --- Nhận diện nền tảng ---
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS giả danh Mac
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

// 2. Handle the beforeinstallprompt event (Chrome/Edge/Android — trình duyệt hỗ trợ cài đặt native)
window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent the mini-infobar from appearing on mobile
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt = e;

  // Show the install button/prompts in the UI
  showPwaInstallPrompts();
});

// 3. Handle when the app is successfully installed
window.addEventListener('appinstalled', (evt) => {
  console.log('Zitthenkne PWA was installed successfully!');
  // Hide all install prompts since app is already installed
  hidePwaInstallPrompts();
  deferredPrompt = null;
});

// Function to dynamically insert PWA Install Buttons
function showPwaInstallPrompts() {
  if (isStandalone()) return; // Đã cài rồi thì không hiện

  // --- NÚT TRÒN Ở THANH TRÊN (MOBILE) ---
  const avatarMobile = document.getElementById('user-avatar-mobile');
  const existingMobileBtn = document.getElementById('pwa-install-btn-mobile');

  if (avatarMobile && !existingMobileBtn) {
    const installBtnMobile = document.createElement('button');
    installBtnMobile.id = 'pwa-install-btn-mobile';
    installBtnMobile.type = 'button';
    // Nút tròn kín đáo: nền xám nhạt, icon hồng dịu → không hút mắt khỏi avatar
    installBtnMobile.className = 'flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 text-pink-500 active:scale-90 transition-transform flex-shrink-0';
    installBtnMobile.setAttribute('title', 'Tải ứng dụng Zitthenkne về máy');
    installBtnMobile.setAttribute('aria-label', 'Tải ứng dụng Zitthenkne về máy');
    installBtnMobile.innerHTML = `<i class="fas fa-download text-sm"></i>`;

    // Insert right before the avatar
    avatarMobile.parentNode.insertBefore(installBtnMobile, avatarMobile);

    installBtnMobile.addEventListener('click', triggerPwaInstall);
  }

  // --- MỤC TRONG SIDEBAR ---
  const sidebarMenu = document.querySelector('aside#sidebar nav ul');
  const existingSidebarLi = document.getElementById('pwa-install-sidebar-li');

  if (sidebarMenu && !existingSidebarLi) {
    const installLi = document.createElement('li');
    installLi.id = 'pwa-install-sidebar-li';
    // Mục nav kín đáo: chữ xám, hover nhẹ — không còn pill gradient chói mắt
    installLi.innerHTML = `
      <a href="#" id="pwa-install-btn-sidebar"
        class="nav-link flex items-center p-3 rounded-2xl text-gray-500 hover:bg-pink-50 hover:text-pink-600 transition font-medium text-base gap-3">
        <i class="fas fa-download text-lg w-7 text-center text-gray-400"></i>
        <span>Tải ứng dụng</span>
      </a>
    `;

    sidebarMenu.appendChild(installLi);

    installLi.addEventListener('click', (e) => {
      e.preventDefault();
      triggerPwaInstall();
    });
  }
}

// Function to hide PWA Install Buttons
function hidePwaInstallPrompts() {
  document.getElementById('pwa-install-btn-mobile')?.remove();
  document.getElementById('pwa-install-sidebar-li')?.remove();
}

// Function to trigger the PWA Install Dialog
function triggerPwaInstall() {
  // Trình duyệt hỗ trợ cài native (Chrome/Edge/Android) → mở hộp thoại hệ thống
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the PWA install prompt');
        hidePwaInstallPrompts();
      } else {
        console.log('User dismissed the PWA install prompt');
      }
      deferredPrompt = null;
    });
    return;
  }

  // Không có prompt native (iOS Safari, Safari máy tính...) → hiện hướng dẫn thủ công
  showInstallInstructions();
}

// Hộp thoại hướng dẫn cài đặt thủ công (chủ yếu cho iOS)
function showInstallInstructions() {
  let modal = document.getElementById('pwa-install-modal');
  if (modal) { modal.classList.remove('hidden'); return; }

  const steps = isIOS
    ? `
      <li class="flex items-start gap-3">
        <span class="flex-shrink-0 w-7 h-7 rounded-full bg-pink-100 text-pink-600 font-bold flex items-center justify-center">1</span>
        <span>Nhấn nút <b>Chia sẻ</b> <i class="fas fa-arrow-up-from-bracket text-pink-500 mx-0.5"></i> ở thanh công cụ Safari.</span>
      </li>
      <li class="flex items-start gap-3">
        <span class="flex-shrink-0 w-7 h-7 rounded-full bg-pink-100 text-pink-600 font-bold flex items-center justify-center">2</span>
        <span>Kéo xuống và chọn <b>Thêm vào MH chính</b> <i class="fas fa-square-plus text-pink-500 mx-0.5"></i>.</span>
      </li>
      <li class="flex items-start gap-3">
        <span class="flex-shrink-0 w-7 h-7 rounded-full bg-pink-100 text-pink-600 font-bold flex items-center justify-center">3</span>
        <span>Nhấn <b>Thêm</b> ở góc trên bên phải. Xong!</span>
      </li>`
    : `
      <li class="flex items-start gap-3">
        <span class="flex-shrink-0 w-7 h-7 rounded-full bg-pink-100 text-pink-600 font-bold flex items-center justify-center">1</span>
        <span>Mở <b>menu</b> <i class="fas fa-ellipsis-vertical text-pink-500 mx-0.5"></i> của trình duyệt.</span>
      </li>
      <li class="flex items-start gap-3">
        <span class="flex-shrink-0 w-7 h-7 rounded-full bg-pink-100 text-pink-600 font-bold flex items-center justify-center">2</span>
        <span>Chọn <b>Cài đặt ứng dụng</b> hoặc <b>Thêm vào màn hình chính</b>.</span>
      </li>
      <li class="flex items-start gap-3">
        <span class="flex-shrink-0 w-7 h-7 rounded-full bg-pink-100 text-pink-600 font-bold flex items-center justify-center">3</span>
        <span>Xác nhận cài đặt. Xong!</span>
      </li>`;

  modal = document.createElement('div');
  modal.id = 'pwa-install-modal';
  modal.className = 'fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4';
  modal.innerHTML = `
    <div class="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 border-t-4 sm:border-t-0 border-pink-200">
      <div class="flex flex-col items-center text-center mb-4">
        <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FF69B4] to-[#D8BFD8] flex items-center justify-center shadow-md mb-3">
          <i class="fas fa-download text-white text-2xl"></i>
        </div>
        <h3 class="text-lg font-extrabold text-gray-800">Tải Zitthenkne về máy</h3>
        <p class="text-gray-500 text-sm mt-1">Cài như app thật: mở nhanh, chạy toàn màn hình, dùng được cả khi mạng yếu.</p>
      </div>
      <ul class="flex flex-col gap-3 text-sm text-gray-700 mb-5">${steps}</ul>
      <button type="button" id="pwa-install-modal-close"
        class="w-full py-3 rounded-2xl bg-gradient-to-r from-[#FF69B4] to-[#f472b6] text-white font-bold shadow-md active:scale-95 transition-transform">
        Đã hiểu
      </button>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.classList.add('hidden');
  modal.querySelector('#pwa-install-modal-close').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
}

// Khi trang tải xong: iOS/Safari không bắn beforeinstallprompt nên phải chủ động hiện nút hướng dẫn
window.addEventListener('DOMContentLoaded', () => {
  if (isStandalone()) {
    console.log('App is running in standalone mode (already installed)');
    hidePwaInstallPrompts();
    return;
  }
  if (isIOS) {
    showPwaInstallPrompts(); // nút sẽ mở hướng dẫn "Thêm vào MH chính"
  }
});
