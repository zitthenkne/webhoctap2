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
export async function saveOfflineQuiz(id, data, { auto = false } = {}) {
    const record = {
        ...data,
        id,
        _offlineSavedAt: Date.now(),
        _auto: auto,   // true = tự lưu khi mở bài (có thể bị dọn), false = người dùng tải tay
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

// Số bộ đề TỰ lưu giữ lại (bộ người dùng tải tay không tính, không bị dọn).
const AUTO_LIMIT = 40;

/**
 * Gọi mỗi lần mở bài khi ONLINE: lưu luôn bộ đề xuống máy để lần sau mất mạng vẫn
 * làm được mà không phải bấm tải. Bộ đã tải tay thì chỉ cập nhật, giữ nguyên nhãn.
 */
export async function autoCacheQuiz(id, data) {
    try {
        const existing = await getOfflineQuiz(id);
        const auto = existing ? !!existing._auto : true;
        await saveOfflineQuiz(id, data, { auto });
        await pruneAutoCached();
    } catch (e) { /* hết dung lượng / lỗi IDB: bỏ qua, không chặn làm bài */ }
}

/** Dọn bớt các bộ TỰ lưu cũ nhất khi vượt AUTO_LIMIT. */
async function pruneAutoCached() {
    const all = await listOfflineQuizzes();
    const autos = all.filter((q) => q._auto).sort((a, b) => (b._offlineSavedAt || 0) - (a._offlineSavedAt || 0));
    for (const q of autos.slice(AUTO_LIMIT)) await deleteOfflineQuiz(q.id);
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
