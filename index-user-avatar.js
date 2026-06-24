// index-user-avatar.js
// Hiển thị avatar động vật + màu nền từ Firestore lên index.html
import { auth, db } from './core/firebase-init.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";

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

  onAuthStateChanged(auth, async user => {
    if (user) {
      let displayName = user.displayName || user.email.split('@')[0] || 'Khách';
      let avatarBgColor = '#D8BFD8';
      let avatarAnimal = '🐱';
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.avatarBgColor) avatarBgColor = data.avatarBgColor;
          if (data.avatarAnimal) avatarAnimal = data.avatarAnimal;
          if (data.displayName) displayName = data.displayName;
        }
      } catch {}
      // Render avatar as div with icon + color (replace <img> by outerHTML)
      avatarEls.forEach((el, idx) => {
        if (!el) return;
        const avatarDiv = document.createElement('div');
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
        avatarDiv.title = displayName;
        avatarDiv.className = el.className;
        // Click vào AVATAR: sang trang thông tin cá nhân (chưa đăng nhập thì sang auth.html)
        avatarDiv.style.cursor = 'pointer';
        avatarDiv.title = user ? 'Thông tin cá nhân' : 'Đăng nhập';
        avatarDiv.onclick = (e) => {
          if (e) e.stopPropagation();
          window.location.href = user ? 'features/profile/profile.html' : 'features/auth/auth.html';
        };
        el.replaceWith(avatarDiv);
      });
      nameEls.forEach((el, idx) => {
        if (el) {
          el.textContent = displayName;
          el.style.cursor = 'pointer';
          // Click vào TÊN người dùng: hỏi đăng xuất thay vì vào trang thông tin cá nhân
          el.title = 'Bấm để đăng xuất';
          el.onclick = (e) => {
            if (e) e.stopPropagation();
            if (typeof window.handleLogout === 'function') {
              window.handleLogout();
            } else {
              // Dự phòng nếu app.js chưa sẵn sàng
              window.location.href = 'features/profile/profile.html';
            }
          };
        }
      });
    }
  });
});
