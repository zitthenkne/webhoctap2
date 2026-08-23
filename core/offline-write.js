// File: core/offline-write.js
// Firestore XẾP HÀNG lệnh ghi khi mất mạng, nhưng Promise trả về chỉ resolve khi
// máy chủ xác nhận => `await setDoc(...)` lúc offline sẽ TREO mãi (nút xoay vòng,
// toast "đã lưu" không bao giờ hiện) dù dữ liệu đã nằm an toàn trong IndexedDB và
// sẽ tự đồng bộ khi có mạng lại.
//
// queued(): offline thì coi như xong ngay; online thì chờ bình thường để vẫn bắt
// được lỗi quyền/mạng. setDocQ/updateDocQ/deleteDocQ là bản bọc sẵn — import với
// alias (`import { updateDocQ as updateDoc }`) để chỗ gọi khỏi phải sửa.
import {
    setDoc,
    updateDoc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";

export function queued(promise) {
    if (navigator.onLine) return promise;
    promise.catch(() => {}); // tránh unhandled rejection nếu lúc sync bị từ chối
    return Promise.resolve();
}

export const setDocQ = (...args) => queued(setDoc(...args));
export const updateDocQ = (...args) => queued(updateDoc(...args));
export const deleteDocQ = (...args) => queued(deleteDoc(...args));
