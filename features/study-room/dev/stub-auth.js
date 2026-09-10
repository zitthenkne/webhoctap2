// CHỈ DÙNG ĐỂ XEM TRƯỚC — giả lập firebase-auth.
// ?as=guest  -> giả bộ chưa đăng nhập VÀ Firebase tắt đăng nhập ẩn danh,
//               để thử luồng "khách vào bằng link" (hỏi tên rồi vào thẳng).
const asGuest = new URLSearchParams(location.search).get('as') === 'guest';

export function onAuthStateChanged(_auth, cb) {
    cb(asGuest ? null : { uid: 'u1', displayName: 'Việt Thành', email: 'thanh@ump.edu.vn', photoURL: null, isAnonymous: false });
    return () => {};
}
export const signInAnonymously = async () => {
    if (asGuest) throw Object.assign(new Error('admin-restricted-operation'), { code: 'auth/admin-restricted-operation' });
    return {};
};
