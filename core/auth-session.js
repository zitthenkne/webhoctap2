// File: core/auth-session.js
// Vì sao cần: mở app khi MẤT MẠNG mà ID token đã hết hạn (token chỉ sống 1 giờ),
// Firebase Auth không gọi được máy chủ để làm mới nên onAuthStateChanged trả NULL —
// app hiện "Khách", thư viện trống; có mạng lại thì tự đăng nhập (refresh token vẫn còn).
//
// Cách chữa: nhớ danh tính lần đăng nhập gần nhất vào localStorage. Khi offline mà
// Firebase chưa/không khôi phục được phiên thì vẫn coi như đã đăng nhập:
// - đọc: Firestore trả dữ liệu từ cache IndexedDB (không cần token),
// - ghi: xếp hàng, gửi kèm token thật khi có mạng lại (xem core/offline-write.js).
// Chỉ tin bản lưu khi navigator.onLine === false; còn online mà auth trả null thì
// đúng là đã đăng xuất (không được tự cho đăng nhập, tránh gọi server thiếu token).
import { auth } from './firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";

const KEY = 'lastAuthUser';

function remember(u) {
    try {
        localStorage.setItem(KEY, JSON.stringify({
            uid: u.uid,
            displayName: u.displayName || '',
            email: u.email || '',
            photoURL: u.photoURL || ''
        }));
    } catch (e) { /* hết dung lượng: chịu, chỉ mất tiện lợi */ }
}

function cached() {
    try {
        const u = JSON.parse(localStorage.getItem(KEY) || 'null');
        return u && u.uid ? { ...u, offline: true } : null;
    } catch (e) { return null; }
}

// Tự ghi nhớ mỗi lần Firebase xác nhận có người đăng nhập. KHÔNG xoá khi trả null —
// null lúc offline chính là trường hợp ta muốn chữa; chỉ đăng xuất thật mới xoá.
onAuthStateChanged(auth, (u) => { if (u) remember(u); });

/** Người dùng hiện tại: bản thật của Firebase, hoặc bản đã lưu nếu đang offline. */
export function sessionUser() {
    return auth.currentUser || (navigator.onLine ? null : cached());
}

/** Như onAuthStateChanged nhưng offline thì trả người dùng đã lưu thay vì null. */
export function onSessionUser(cb) {
    const off = cached();
    if (!navigator.onLine && off) cb(off);          // đừng để giao diện nháy "Khách"
    return onAuthStateChanged(auth, (u) => cb(u || (navigator.onLine ? null : cached())));
}

/** Gọi khi người dùng CHỦ ĐỘNG đăng xuất, nếu không lần sau offline vẫn thấy đăng nhập. */
export function forgetSession() {
    try { localStorage.removeItem(KEY); } catch (e) {}
}
