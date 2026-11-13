// File: core/firebase-auth.js
// App + Auth Firebase, KHÔNG kèm Firestore. Trang chỉ cần đăng nhập (trang cổng link riêng features/quiz/link.html) nạp tệp này
// → khỏi tải + khởi tạo firebase-firestore.js (nặng, mở IndexedDB) trước khi gọi máy chủ. Trang khác vẫn dùng firebase-init.js
// (tệp đó nạp lại đúng module này nên chung MỘT app / auth).
// Đổi phiên bản SDK: `node firebase-nang-cap.mjs <cũ> <mới>` (xem firebase-init.js).
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

// authDomain = CHÍNH tên miền web (vercel.json chuyển /__/auth/* sang zitthenkne.firebaseapp.com): trang chọn Gmail cùng tên miền
// nên chế độ app không bị bật khung có thanh địa chỉ, và redirect trên Safari/iPhone không mất kết quả (core/google-signin.js).
// Chỉ bản chính thức: bản xem trước Vercel / localhost / GitHub Pages chưa khai trong Google Cloud (Authorized redirect URIs) → giữ firebaseapp.com.
const PROD_HOST = 'zitthenkne.vercel.app';
export const firebaseConfig = {
    apiKey: "AIzaSyBFNNeJMeDIVRcG2Xj4ZVjr2-0d9RGrURc",
    authDomain: globalThis.location?.hostname === PROD_HOST ? PROD_HOST : "zitthenkne.firebaseapp.com",
    projectId: "zitthenkne",
    storageBucket: "zitthenkne.firebasestorage.app",
    messagingSenderId: "288090340109",
    appId: "1:288090340109:web:2fdf3e4117e92318ef8e44"
};

export const app = initializeApp(firebaseConfig);

// KHÔNG dùng getAuth(): nó gắn sẵn popupRedirectResolver, và trên điện thoại/iPad/Safari SDK tự nạp apis.google.com/js/api.js +
// iframe zitthenkne.firebaseapp.com/__/auth/iframe rồi CHỜ xong mới báo trạng thái đăng nhập (đo: 3 request thừa, chậm ~550ms MỖI trang).
// Danh sách persistence = đúng mặc định của getAuth -> phiên đăng nhập cũ giữ nguyên.
// Đăng nhập Google (core/google-signin.js) truyền browserPopupRedirectResolver NGAY LÚC GỌI popup / redirect — đừng gắn vào đây.
export const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence] });
// Mail xác nhận / đặt lại mật khẩu do Firebase gửi viết bằng tiếng Việt (mẫu mặc định của Firebase có sẵn bản dịch).
auth.languageCode = 'vi';
