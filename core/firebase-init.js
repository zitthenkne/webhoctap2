// File: firebase-init.js
// Đổi phiên bản SDK Firebase cho CẢ site: `node firebase-nang-cap.mjs <cũ> <mới>` (thay URL ở mọi tệp + sw.js, kèm kiểm tra
// tên hàm còn xuất hiện trong bản mới). Đừng sửa tay từng tệp — hai trang khác phiên bản dùng chung IndexedDB sẽ vấp nhau.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    CACHE_SIZE_UNLIMITED
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBFNNeJMeDIVRcG2Xj4ZVjr2-0d9RGrURc",
    authDomain: "zitthenkne.firebaseapp.com",
    projectId: "zitthenkne",
    storageBucket: "zitthenkne.firebasestorage.app",
    messagingSenderId: "288090340109",
    appId: "1:288090340109:web:2fdf3e4117e92318ef8e44"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Bộ nhớ đệm offline (IndexedDB), cấu hình NGAY lúc khởi tạo (kiểu mới của SDK 10+; hàm cũ
// enableMultiTabIndexedDbPersistence đã bị đánh dấu lỗi thời): dữ liệu đã đọc vẫn xem được khi mất mạng,
// thao tác ghi được xếp hàng và tự đồng bộ khi có mạng lại.
//  - persistentMultipleTabManager: mở nhiều tab/cửa sổ vẫn còn offline (bản 1 tab sẽ TẮT cache ở các tab sau).
//  - cacheSizeBytes không giới hạn: mặc định 40MB sẽ tự dọn (LRU) bộ đề cũ khỏi cache offline.
//    Học liệu là text nên để nguyên, mất mạng vẫn còn đủ dữ liệu cũ.
//  - Máy không có IndexedDB (chế độ riêng tư...): SDK tự rơi về bộ nhớ tạm, vẫn đọc/ghi bình thường (đã thử).
//  - experimentalAutoDetectLongPolling: Safari/iPad và mạng có proxy hay làm kênh WebChannel (streaming) treo im
//    -> đọc/ghi đứng cả chục giây dù có mạng. Tự dò: thử kênh thường, không nối được thì chuyển sang long-polling.
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
        cacheSizeBytes: CACHE_SIZE_UNLIMITED
    }),
    ignoreUndefinedProperties: true,
    experimentalAutoDetectLongPolling: true
});
// Storage KHÔNG khởi tạo ở đây: firebase-storage.js (28KB) chỉ bảng trắng + ảnh bệnh án cần,
// nên trang nào cũng phải tải kèm là phí. Cần thì tự `getStorage()` (app mặc định đã có ở trên).
