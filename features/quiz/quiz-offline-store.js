// File: features/quiz/quiz-offline-store.js
// Lưu trữ bộ đề để LÀM OFFLINE (không cần mạng).
// - Dữ liệu nặng (cả mảng `questions`) lưu trong IndexedDB.
// - Một chỉ mục id nhẹ lưu trong localStorage để giao diện biết NGAY bộ nào đã tải
//   mà không phải chờ truy vấn bất đồng bộ khi render thư viện.

import { fastImgUrl } from './img-proxy.js';

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
 * Trích xuất toàn bộ URL hình ảnh từ một bộ câu hỏi (markdown ![...](url), trường image, options, feedback).
 */
export function extractQuizImageUrls(questions) {
    if (!Array.isArray(questions)) return [];
    const urls = new Set();
    const mdImgRegex = /!\[.*?\]\((https?:\/\/[^\s\)]+)\)/g;
    const htmlImgRegex = /<img[^>]+src=["'](https?:\/\/[^"'\s>]+)["']/gi;

    questions.forEach((q) => {
        if (!q) return;
        if (q.image && typeof q.image === 'string' && q.image.startsWith('http')) {
            urls.add(q.image.trim());
        }
        const textParts = [q.question, q.explanation, q.expanded];
        if (Array.isArray(q.options)) textParts.push(...q.options);
        if (Array.isArray(q.answers)) textParts.push(...q.answers);
        if (q.feedback && typeof q.feedback === 'object') textParts.push(...Object.values(q.feedback));
        const fullText = textParts.filter(Boolean).join(' ');

        let m;
        while ((m = mdImgRegex.exec(fullText)) !== null) {
            urls.add(m[1].trim());
        }
        while ((m = htmlImgRegex.exec(fullText)) !== null) {
            urls.add(m[1].trim());
        }
    });

    return Array.from(urls);
}

/**
 * Tải và lưu trước hình ảnh vào CacheStorage (kho zitthenkne-img).
 * Nhờ đó Service Worker và trình duyệt có thể phục vụ ảnh ngay cả khi ngoại tuyến hoàn toàn.
 * Hỗ trợ các host không có CORS như files.catbox.moe qua mode no-cors.
 */
export async function cacheQuizImages(questions, { onProgress } = {}) {
    // Cùng URL mà trang sẽ thật sự gọi (ảnh catbox đi qua proxy) — không thì kho offline lưu nhầm link gốc chậm.
    const urls = extractQuizImageUrls(questions).map(fastImgUrl);
    if (!urls.length) return { total: 0, cached: 0 };

    let cache = null;
    try {
        if ('caches' in window) {
            cache = await caches.open('zitthenkne-img');
        }
    } catch (e) {
        console.warn('CacheStorage không khả dụng:', e);
    }

    let done = 0;
    const poolLimit = 4;
    const queue = [...urls];

    async function worker() {
        while (queue.length > 0) {
            const url = queue.shift();
            try {
                if (cache) {
                    const match = await cache.match(url);
                    if (match) {
                        done++;
                        if (onProgress) onProgress(done, urls.length, url);
                        continue;
                    }
                }
                const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
                const timer = controller ? setTimeout(() => controller.abort(), 12000) : null;
                let res = null;
                try {
                    res = await fetch(url, {
                        mode: 'cors',
                        credentials: 'omit',
                        signal: controller ? controller.signal : undefined
                    });
                    if (!res.ok) throw new Error('CORS failed');
                } catch (_) {
                    try {
                        res = await fetch(url, {
                            mode: 'no-cors',
                            credentials: 'omit',
                            signal: controller ? controller.signal : undefined
                        });
                    } catch (e) {}
                } finally {
                    if (timer) clearTimeout(timer);
                }

                if (res && (res.ok || res.type === 'opaque')) {
                    if (cache) {
                        await cache.put(url, res.clone());
                    }
                }
            } catch (err) {
                console.warn('Không tải được ảnh offline:', url, err);
            }
            done++;
            if (onProgress) onProgress(done, urls.length, url);
        }
    }

    const workers = Array.from({ length: Math.min(poolLimit, urls.length) }, () => worker());
    await Promise.all(workers);

    return { total: urls.length, cached: done };
}

/**
 * Lưu một bộ đề để làm offline. `data` là toàn bộ dữ liệu doc quiz_sets (kèm `questions`).
 * Tự động tải trước toàn bộ hình ảnh vào CacheStorage để làm được khi mất mạng.
 * Trả về Promise.
 */
export async function saveOfflineQuiz(id, data, { auto = false, cacheImages = true, onProgress } = {}) {
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

    // Tải và lưu trước toàn bộ hình ảnh vào CacheStorage
    if (cacheImages && Array.isArray(data.questions) && data.questions.length > 0) {
        try {
            await cacheQuizImages(data.questions, { onProgress });
        } catch (imgErr) {
            console.warn('Lỗi khi nạp ảnh offline:', imgErr);
        }
    }

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
 * Chờ `promise` tối đa `ms`; quá hạn thì trả `undefined` (promise vẫn chạy tiếp ở nền), lỗi thì ném như thường.
 * Dành cho mạng chập chờn: máy vẫn báo "có mạng" nhưng không tới được máy chủ — Firestore phải chờ
 * ~10 giây mới chịu lùi về cache, trong khi bản tải về máy mở được ngay.
 */
export const SLOW_NET_MS = 4000;
export function within(promise, ms = SLOW_NET_MS) {
    return Promise.race([promise, new Promise((r) => setTimeout(r, ms))]);
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
