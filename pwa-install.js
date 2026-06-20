// PWA Installation helper for Zitthenkne
let deferredPrompt;

// 1. Register Service Worker và tự động cập nhật khi có bản mới
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
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

// 2. Handle the beforeinstallprompt event
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
  // --- MOBILE BANNER / ICON IN TOP BAR ---
  const avatarMobile = document.getElementById('user-avatar-mobile');
  const existingMobileBtn = document.getElementById('pwa-install-btn-mobile');
  
  if (avatarMobile && !existingMobileBtn) {
    const installBtnMobile = document.createElement('button');
    installBtnMobile.id = 'pwa-install-btn-mobile';
    // Style matches layout nicely, sits directly next to avatar, very neat.
    installBtnMobile.className = 'text-pink-500 hover:text-pink-600 focus:outline-none p-2 text-xl relative mr-1 flex items-center justify-center flex-shrink-0 transition-transform active:scale-90';
    installBtnMobile.setAttribute('title', 'Tải ứng dụng Zitthenkne');
    installBtnMobile.innerHTML = `
      <i class="fas fa-arrow-down-long animate-bounce text-pink-500"></i>
      <span class="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-pink-500"></span>
      </span>
    `;
    
    // Insert right before the avatar
    avatarMobile.parentNode.insertBefore(installBtnMobile, avatarMobile);
    
    // Click action
    installBtnMobile.addEventListener('click', () => {
      triggerPwaInstall();
    });
  }

  // --- SIDEBAR MENU ITEM ---
  const sidebarMenu = document.querySelector('aside#sidebar nav ul');
  const existingSidebarLi = document.getElementById('pwa-install-sidebar-li');
  
  if (sidebarMenu && !existingSidebarLi) {
    const installLi = document.createElement('li');
    installLi.id = 'pwa-install-sidebar-li';
    installLi.innerHTML = `
      <a href="#" id="pwa-install-btn-sidebar"
        class="nav-link flex items-center p-3 rounded-2xl text-pink-600 bg-pink-50 hover:bg-pink-100 transition font-bold shadow-sm text-base gap-3 border border-pink-200">
        <i class="fas fa-download text-xl w-7 text-center animate-pulse"></i>
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
  const mobileBtn = document.getElementById('pwa-install-btn-mobile');
  if (mobileBtn) {
    mobileBtn.remove();
  }
  
  const sidebarLi = document.getElementById('pwa-install-sidebar-li');
  if (sidebarLi) {
    sidebarLi.remove();
  }
}

// Function to trigger the PWA Install Dialog
function triggerPwaInstall() {
  if (!deferredPrompt) {
    return;
  }
  
  // Show the install prompt
  deferredPrompt.prompt();
  
  // Wait for the user to respond to the prompt
  deferredPrompt.userChoice.then((choiceResult) => {
    if (choiceResult.outcome === 'accepted') {
      console.log('User accepted the PWA install prompt');
      hidePwaInstallPrompts();
    } else {
      console.log('User dismissed the PWA install prompt');
    }
    deferredPrompt = null;
  });
}

// Check if app is already running in standalone mode (installed)
window.addEventListener('DOMContentLoaded', () => {
  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
    console.log('App is running in standalone mode (already installed)');
    hidePwaInstallPrompts();
  }
});
