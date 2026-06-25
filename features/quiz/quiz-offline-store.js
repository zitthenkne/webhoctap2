// File: features/quiz/quiz-offline-store.js
// Lưu trữ bộ đề để LÀM OFFLINE (không cần mạng).
// - Dữ liệu nặng (cả mảng `questions`) lưu trong IndexedDB.
// - Một chỉ mục id nhẹ lưu trong localStorage để giao diện biết NGAY bộ nào đã tải
//   mà không phải chờ truy vấn bất đồng bộ khi render thư viện.

const DB_NAME = 'zitthenkne-offline';
const DB_VERSION = 1;
const STORE = 'quizzes';
const IDS_KEY = 'zitthenkne_offline_quiz_ids';

let _dbPromise = null;

function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) {
            reject(new Error('Trình duyệt không hỗ trợ IndexedDB'));
            return;
        }
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return _dbPromise;
}

function txStore(mode) {
    return openDB().then((db) => db.transaction(STORE, mode).objectStore(STORE));
}

// ---- Chỉ mục id (localStorage) — đọc đồng bộ, dùng khi render ----
function readIds() {
    try {
        const raw = localStorage.getItem(IDS_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
    } catch (e) {
        return [];
    }
}

function writeIds(ids) {
    try {
        localStorage.setItem(IDS_KEY, JSON.stringify([...new Set(ids)]));
    } catch (e) { /* hết dung lượng cũng không sao, IndexedDB là nguồn chính */ }
}

/** Kiểm tra nhanh (đồng bộ) một bộ đề đã được tải offline hay chưa. */
export function isOfflineSavedSync(id) {
    return readIds().includes(id);
}

/** Trả về Set tất cả id bộ đề đã tải offline (đồng bộ). */
export function getOfflineIdsSync() {
    return new Set(readIds());
}

/**
 * Lưu một bộ đề để làm offline. `data` là toàn bộ dữ liệu doc quiz_sets (kèm `questions`).
 * Trả về Promise.
 */
export async function saveOfflineQuiz(id, data) {
    const record = {
        ...data,
        id,
        _offlineSavedAt: Date.now(),
    };
    await new Promise((resolve, reject) => {
        txStore('readwrite').then((store) => {
            const req = store.put(record);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        }).catch(reject);
    });
    const ids = readIds();
    ids.push(id);
    writeIds(ids);
    return record;
}

/** Lấy bộ đề đã lưu offline theo id. Trả về dữ liệu doc (hoặc null nếu chưa có). */
export async function getOfflineQuiz(id) {
    try {
        return await new Promise((resolve, reject) => {
            txStore('readonly').then((store) => {
                const req = store.get(id);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error);
            }).catch(reject);
        });
    } catch (e) {
        return null;
    }
}

/** Xóa bản offline của một bộ đề. */
export async function deleteOfflineQuiz(id) {
    await new Promise((resolve, reject) => {
        txStore('readwrite').then((store) => {
            const req = store.delete(id);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        }).catch(reject);
    });
    writeIds(readIds().filter((x) => x !== id));
}

/**
 * Cập nhật lại bản offline NẾU bộ đề này đang được lưu offline (giữ dữ liệu mới nhất).
 * Không làm gì nếu bộ đề chưa được tải offline. An toàn để gọi mỗi lần mở bài online.
 */
export async function refreshOfflineQuizIfSaved(id, data) {
    if (!isOfflineSavedSync(id)) return;
    try { await saveOfflineQuiz(id, data); } catch (e) { /* bỏ qua */ }
}

/** Danh sách metadata các bộ đề đã tải offline (để màn hình quản lý nếu cần). */
export async function listOfflineQuizzes() {
    try {
        return await new Promise((resolve, reject) => {
            txStore('readonly').then((store) => {
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => reject(req.error);
            }).catch(reject);
        });
    } catch (e) {
        return [];
    }
}
