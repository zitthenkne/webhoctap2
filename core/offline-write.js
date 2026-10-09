// File: core/offline-write.js
// Firestore XẾP HÀNG lệnh ghi khi mất mạng, nhưng Promise trả về chỉ resolve khi
// máy chủ xác nhận => `await setDoc(...)` lúc offline sẽ TREO mãi (nút xoay vòng,
// toast "đã lưu" không bao giờ hiện) dù dữ liệu đã nằm an toàn trong IndexedDB và
// sẽ tự đồng bộ khi có mạng lại.
//
// queued(): offline thì coi như xong ngay; online thì chờ bình thường để vẫn bắt
// được lỗi quyền/mạng. setDocQ/updateDocQ/deleteDocQ là bản bọc sẵn — import với
// alias (`import { updateDocQ as updateDoc }`) để chỗ gọi khỏi phải sửa.
//
// Bản 2026-10-09: trước đây MỌI lỗi bị nuốt (`.catch(() => {})`) -> luật từ chối vẫn báo thành công. Nay lỗi "bị từ chối" (write-errors.js)
// được NÉM cho nơi gọi nếu tới trong cửa sổ chờ, hoặc báo bằng toast nếu tới muộn (sau khi đã coi như xong / sau khi có mạng lại).
import {
    setDoc,
    updateDoc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { isHardWriteError, writeErrorMessage } from "./write-errors.js";

let lastLateToast = 0;
function reportLate(e) {
    console.warn('Ghi Firestore bị từ chối:', e && e.code, e && e.message);
    if (Date.now() - lastLateToast < 8000) return;          // ghi hàng loạt thất bại một lượt = một thông báo
    lastLateToast = Date.now();
    import('./utils.js').then((m) => m.showToast && m.showToast(writeErrorMessage(e), 'error', 6000)).catch(() => {});
}

export function queued(promise, timeoutMs = 2500) {
    if (!navigator.onLine) {
        // offline: lỗi (nếu có) chỉ tới lúc đồng bộ lại -> báo nhẹ, không treo giao diện
        promise.catch((e) => { if (isHardWriteError(e)) reportLate(e); });
        return Promise.resolve();
    }
    let early = true;
    const timer = new Promise((resolve) => setTimeout(() => { early = false; resolve(); }, timeoutMs));
    // Nếu có mạng nhưng mạng lag/treo > 2.5s: Firestore SDK đã kịp lưu vào IndexedDB cục bộ,
    // ta resolve sớm để UI không bị đóng băng nút bấm. Bị từ chối sau mốc đó -> toast.
    promise.catch((e) => { if (!early && isHardWriteError(e)) reportLate(e); });
    return Promise.race([promise, timer]).catch((e) => { if (isHardWriteError(e)) throw e; });
}

export const setDocQ = (...args) => queued(setDoc(...args));
export const updateDocQ = (...args) => queued(updateDoc(...args));
export const deleteDocQ = (...args) => queued(deleteDoc(...args));
