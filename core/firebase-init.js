// File: firebase-init.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import {
    initializeFirestore,
    enableMultiTabIndexedDbPersistence,
    enableIndexedDbPersistence,
    CACHE_SIZE_UNLIMITED
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyBFNNeJMeDIVRcG2Xj4ZVjr2-0d9RGrURc",
    authDomain: "zitthenkne.firebaseapp.com",
    projectId: "zitthenkne",
    storageBucket: "zitthenkne.appspot.com",
    messagingSenderId: "288090340109",
    appId: "1:288090340109:web:2fdf3e4117e92318ef8e44"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
// cacheSizeBytes không giới hạn: mặc định 40MB sẽ tự dọn (LRU) bộ đề cũ khỏi cache
// offline. Học liệu là text nên để nguyên, mất mạng vẫn còn đủ dữ liệu cũ.
export const db = initializeFirestore(app, {
    cacheSizeBytes: CACHE_SIZE_UNLIMITED,
    ignoreUndefinedProperties: true
});
export const storage = getStorage(app);

// Bật cache offline (IndexedDB): dữ liệu đã đọc vẫn xem được khi mất mạng,
// thao tác ghi được xếp hàng và tự đồng bộ khi có mạng lại.
// Bản đa-tab (multi-tab) để mở nhiều tab/cửa sổ vẫn còn offline — bản 1 tab sẽ
// TẮT hẳn cache ở các tab sau. Trình duyệt quá cũ mới rơi về bản 1 tab.
enableMultiTabIndexedDbPersistence(db)
    .catch(() => enableIndexedDbPersistence(db).catch(() => {}));
