// core/usernames.js — ĐĂNG NHẬP BẰNG TÊN: bảng tra `usernames/{khóa tên}` = { uid, email }.
// Trước đây ô đăng nhập truy vấn `users where displayName == …` lúc CHƯA đăng nhập → luật (users chỉ đọc được doc của chính mình)
// chặn 403 → gõ tên là luôn báo "Không tra cứu được tên người dùng". Mở users cho khách đọc thì lộ email mọi người,
// nên dùng bảng tra riêng: đọc được TỪNG tên (get), không liệt kê được (luật), mỗi tên chỉ chủ của nó ghi/xóa.
// Bản tra tự có: đổi tên ở hồ sơ, và một lần/máy khi đã đăng nhập mà có tên (người dùng cũ khỏi cần chạy script).
import { db } from './firebase-init.js';
import { doc, getDoc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

/** Khóa tên: không phân biệt hoa thường / khoảng trắng thừa; mã hóa để tên có "/" vẫn là id hợp lệ. */
export const nameKey = (name) => encodeURIComponent(String(name || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase());

/** Tên → email (null = chưa có ai giữ tên này). Lỗi mạng → ném. */
export async function emailForName(name) {
    const k = nameKey(name);
    if (!k) return null;
    const snap = await getDoc(doc(db, 'usernames', k));
    return snap.exists() ? (snap.data().email || null) : null;
}

/** Gắn `name` với tài khoản đang đăng nhập (bỏ bản tra `oldName` nếu đổi tên). Tên đã có người giữ / mất mạng → false, không chặn việc chính. */
export async function claimName(user, name, oldName) {
    const k = nameKey(name);
    if (!user || !user.uid || !user.email || !k) return false;
    const mark = 'unameKey_' + user.uid;
    try { if (!oldName && localStorage.getItem(mark) === k) return true; } catch (e) { /* không có localStorage */ }
    try {
        await setDoc(doc(db, 'usernames', k), { uid: user.uid, email: user.email });
        try { localStorage.setItem(mark, k); } catch (e) { }
    } catch (e) {
        return false;
    }
    const ok = nameKey(oldName);
    if (ok && ok !== k) deleteDoc(doc(db, 'usernames', ok)).catch(() => {});   // chưa có / của người khác → luật chặn, kệ
    return true;
}
