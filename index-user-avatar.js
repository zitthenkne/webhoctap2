// index-user-avatar.js
// Hiển thị avatar động vật + màu nền từ Firestore lên index.html,
// tự lưu cache cục bộ để mất mạng vẫn hiện đúng màu + con vật,
// kèm chấm trạng thái mạng (xanh = online, cam = offline giữ phiên).
import { auth, db } from './core/firebase-init.js';
import { onSessionUser } from './core/auth-session.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
  const avatarEls = [
    document.getElementById('user-avatar-sidebar'),
    document.getElementById('user-avatar-mobile'),
    document.getElementById('user-avatar')
  ];
  const nameEls = [
    document.getElementById('user-name-sidebar'),
    document.getElementById('user-name')
  ];

  let currentUid = null;

  function updateStatusDots() {
    const isOnline = navigator.onLine;
    document.querySelectorAll('.user-net-dot').forEach(dot => {
      dot.style.background = isOnline ? '#10b981' : '#f59e0b';
      dot.title = isOnline ? 'Trực tuyến (Đã kết nối)' : 'Ngoại tuyến (Đang giữ phiên)';
    });
  }

  window.addEventListener('online', updateStatusDots);
  window.addEventListener('offline', updateStatusDots);

  onSessionUser(async user => {
    if (!user) return;
    currentUid = user.uid;

    let displayName = user.displayName || user.email.split('@')[0] || 'Khách';
    let avatarBgColor = '#D8BFD8';
    let avatarAnimal = '🐱';

    // 1. Đọc nhanh từ cache cục bộ (0ms)
    try {
      const cached = JSON.parse(localStorage.getItem('userAvatarPrefs_' + user.uid) || 'null');
      if (cached) {
        if (cached.avatarBgColor) avatarBgColor = cached.avatarBgColor;
        if (cached.avatarAnimal) avatarAnimal = cached.avatarAnimal;
        if (cached.displayName) displayName = cached.displayName;
      }
    } catch (_) {}

    // 2. Nếu có mạng thì kéo cấu hình mới nhất từ Firestore và cập nhật lại cache
    if (navigator.onLine) {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.avatarBgColor) avatarBgColor = data.avatarBgColor;
          if (data.avatarAnimal) avatarAnimal = data.avatarAnimal;
          if (data.displayName) displayName = data.displayName;
          try {
            localStorage.setItem('userAvatarPrefs_' + user.uid, JSON.stringify({ avatarBgColor, avatarAnimal, displayName }));
          } catch (_) {}
        }
      } catch (_) {}
    }

    // 3. Render avatar với chấm trạng thái mạng
    avatarEls.forEach((el) => {
      if (!el) return;
      const avatarDiv = document.createElement('div');
      avatarDiv.style.position = 'relative';
      avatarDiv.style.width = el.classList.contains('w-10') ? '40px' : '36px';
      avatarDiv.style.height = el.classList.contains('h-10') ? '40px' : '36px';
      avatarDiv.style.borderRadius = '9999px';
      avatarDiv.style.background = avatarBgColor;
      avatarDiv.style.display = 'flex';
      avatarDiv.style.alignItems = 'center';
      avatarDiv.style.justifyContent = 'center';
      avatarDiv.style.fontSize = '1.6rem';
      avatarDiv.style.color = '#fff';
      avatarDiv.style.border = '2px solid #D8BFD8';
      avatarDiv.style.boxShadow = '0 2px 8px #FFD6E0';
      avatarDiv.innerText = avatarAnimal;
      avatarDiv.title = user ? 'Thông tin cá nhân' : 'Đăng nhập';
      avatarDiv.className = el.className;
      avatarDiv.id = el.id;
      avatarDiv.style.cursor = 'pointer';

      // Chấm nhỏ trạng thái kết nối mạng
      const dot = document.createElement('span');
      dot.className = 'user-net-dot';
      dot.style.position = 'absolute';
      dot.style.bottom = '-1px';
      dot.style.right = '-1px';
      dot.style.width = '11px';
      dot.style.height = '11px';
      dot.style.borderRadius = '9999px';
      dot.style.border = '2px solid #fff';
      dot.style.boxShadow = '0 1px 3px rgba(0,0,0,0.15)';
      dot.style.background = navigator.onLine ? '#10b981' : '#f59e0b';
      dot.title = navigator.onLine ? 'Trực tuyến (Đã kết nối)' : 'Ngoại tuyến (Đang giữ phiên)';
      avatarDiv.appendChild(dot);

      avatarDiv.onclick = (e) => {
        if (e) e.stopPropagation();
        if (user) {
          window.location.href = 'features/profile/profile.html';
        } else {
          const authModal = document.getElementById('authModal');
          if (authModal) authModal.classList.remove('hidden');
        }
      };
      el.replaceWith(avatarDiv);
    });

    nameEls.forEach((el) => {
      if (el) {
        el.textContent = displayName;
        el.onclick = null;
      }
    });
  });
});
