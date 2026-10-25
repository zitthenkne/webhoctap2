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
// Promise còn chờ thì SDK còn xếp hàng/thử lại. Một khi Promise đã reject, lệnh ghi đã thất bại:
// ném MỌI lỗi cho caller nếu còn chờ, hoặc báo toast nếu đã nhả giao diện. Không nuốt cả not-found/lỗi mạng.
import {
    setDoc,
    updateDoc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { writeErrorMessage } from "./write-errors.js";

let lastLateToast = 0;
function reportLate(e) {
    console.warn('Ghi Firestore thất bại:', e && e.code, e && e.message);
    if (Date.now() - lastLateToast < 8000) return;          // ghi hàng loạt thất bại một lượt = một thông báo
    lastLateToast = Date.now();
    import('./utils.js').then((m) => m.showToast && m.showToast(writeErrorMessage(e), 'error', 6000)).catch(() => {});
}

export function queued(promise, timeoutMs = 2500) {
    if (navigator.onLine === false) {
        // offline: lỗi (nếu có) chỉ tới lúc đồng bộ lại -> báo nhẹ, không treo giao diện
        promise.catch(reportLate);
        return Promise.resolve();
    }
    let expired = false, timerId;
    const timer = new Promise((resolve) => {
        timerId = setTimeout(() => { expired = true; resolve(); }, timeoutMs);
    });
    // Nếu có mạng nhưng mạng lag/treo > 2.5s: Firestore SDK đã kịp lưu vào IndexedDB cục bộ,
    // ta resolve sớm để UI không bị đóng băng nút bấm. Bị từ chối sau mốc đó -> toast.
    const write = promise.catch((e) => {
        if (expired) reportLate(e);
        throw e;
    });
    return Promise.race([write, timer]).finally(() => clearTimeout(timerId));
}

export const setDocQ = (...args) => queued(setDoc(...args));
export const updateDocQ = (...args) => queued(updateDoc(...args));
export const deleteDocQ = (...args) => queued(deleteDoc(...args));
