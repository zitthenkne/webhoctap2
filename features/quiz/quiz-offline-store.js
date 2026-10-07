// File: features/quiz/quiz-offline-store.js
// Lưu trữ bộ đề để LÀM OFFLINE (không cần mạng).
// - Dữ liệu nặng (cả mảng `questions`) lưu trong IndexedDB.
// - Một chỉ mục id nhẹ lưu trong localStorage để giao diện biết NGAY bộ nào đã tải
//   mà không phải chờ truy vấn bất đồng bộ khi render thư viện.

import { fastImgUrl } from './img-proxy.js';

const DB_NAME = 'zitthenkne-offline';
const STORE = 'quizzes';
const IDS_KEY = 'zitthenkne_offline_quiz_ids';
// Ảnh của bộ đề lưu offline nằm kho RIÊNG: service worker không dọn theo hạn IMG_MAX của kho ảnh chạy lúc (mở nhiều
// bộ → ảnh bộ cũ bị đá khỏi kho trong khi bản đề vẫn còn). Kho này tự dọn khi bộ đề bị xóa (pruneQuizImages).
const QUIZ_IMG_CACHE = 'zitthenkne-quiz-img';

let _dbPromise = null;

function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) {
            reject(new Error('Trình duyệt không hỗ trợ IndexedDB'));
            return;
        }
        // Mở KHÔNG kèm số phiên bản (lấy bản hiện có) rồi kiểm kho. Trước đây mở cứng phiên bản 1: nếu offline.html (bản cũ) hay chỗ khác tạo ra
        // DB tên này MÀ CHƯA CÓ KHO thì không còn lần "nâng cấp" nào để dựng kho → mọi lần lưu bộ đề offline đều lỗi NotFoundError, vĩnh viễn.
        const make = (version) => {
            const req = version ? indexedDB.open(DB_NAME, version) : indexedDB.open(DB_NAME);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    db.createObjectStore(STORE, { keyPath: 'id' });
                }
            };
            req.onsuccess = () => {
                const db = req.result;
                if (db.objectStoreNames.contains(STORE)) return resolve(db);
                const next = db.version + 1;      // tự chữa: DB thiếu kho → nâng phiên bản để dựng kho
                db.close();
                make(next);
            };
            req.onerror = () => reject(req.error);
        };
        make(0);
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
 * Trích xuất toàn bộ URL hình ảnh từ một bộ câu hỏi: ![...](url) hoặc <img src> nằm ở BẤT KỲ trường chữ nào
 * (câu hỏi, phương án, giải thích, giải thích từng phương án, ghi chú, mở rộng, ca lâm sàng, tự luận…) + trường image.
 */
export function extractQuizImageUrls(questions) {
    if (!Array.isArray(questions)) return [];
    const urls = new Set();
    const mdImgRegex = /!\[.*?\]\((https?:\/\/[^\s\)]+)\)/g;
    const htmlImgRegex = /<img[^>]+src=["'](https?:\/\/[^"'\s>]+)["']/gi;
    // Đi qua mọi chuỗi trong câu hỏi: liệt kê tay từng trường từng bỏ sót ảnh ở ghi chú / ca lâm sàng.
    const strings = (v, out, depth = 0) => {
        if (typeof v === 'string') out.push(v);
        else if (v && typeof v === 'object' && depth < 4) Object.values(v).forEach((x) => strings(x, out, depth + 1));
        return out;
    };

    questions.forEach((q) => {
        if (!q) return;
        if (q.image && typeof q.image === 'string' && q.image.startsWith('http')) {
            urls.add(q.image.trim());
        }
        const fullText = strings(q, []).join(' ');

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
 * Tải 1 ảnh vào kho cache. Thử CORS trước; host không có CORS thì thử no-cors (ảnh đục).
 * Mỗi lần thử có hạn riêng 60 giây (proxy lần đầu kéo ảnh từ catbox có khi mất ~40 giây) (gồm cả đọc hết thân ảnh). Trả true nếu đã cất được.
 */
async function fetchToCache(cache, url) {
    for (const mode of ['cors', 'no-cors']) {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 60000);
        try {
            const res = await fetch(url, { mode, credentials: 'omit', signal: ctl.signal });
            if (!res.ok && res.type !== 'opaque') return false;   // lỗi HTTP thật (404…): đừng cất trang lỗi
            if (cache) await cache.put(url, res);
            return true;
        } catch (e) {
            if (ctl.signal.aborted) return false;                 // quá giờ: khỏi thử lại
        } finally {
            clearTimeout(timer);
        }
    }
    return false;
}

// Mở một bộ đề chạy HAI lượt tải ảnh gần như cùng lúc (từ bản trong máy, rồi từ bản vừa hỏi Firestore): lượt sau thấy
// ảnh chưa vào kho nên tải lại y hệt -> gấp đôi băng thông đúng lúc người dùng đang chờ ảnh câu đầu. Gộp theo URL.
const _imgInflight = new Map();
function fetchToCacheOnce(cache, url) {
    if (_imgInflight.has(url)) return _imgInflight.get(url);
    const p = fetchToCache(cache, url).finally(() => _imgInflight.delete(url));
    _imgInflight.set(url, p);
    return p;
}

/**
 * Tải và lưu trước hình ảnh vào CacheStorage (kho QUIZ_IMG_CACHE).
 * Nhờ đó Service Worker và trình duyệt có thể phục vụ ảnh ngay cả khi ngoại tuyến hoàn toàn.
 * Trả { total, cached, failed } — failed là số ảnh thật sự chưa tải được (gọi lại sẽ chỉ tải nốt những ảnh này).
 */
export async function cacheQuizImages(questions, { onProgress } = {}) {
    // Cùng URL mà trang sẽ thật sự gọi (ảnh catbox đi qua proxy) — không thì kho offline lưu nhầm link gốc chậm.
    const urls = extractQuizImageUrls(questions).map(fastImgUrl);
    if (!urls.length) return { total: 0, cached: 0, failed: 0 };

    let cache = null;
    try {
        if ('caches' in window) {
            cache = await caches.open(QUIZ_IMG_CACHE);
        }
    } catch (e) {
        console.warn('CacheStorage không khả dụng:', e);
    }

    let done = 0;
    let failed = 0;
    const poolLimit = 4;
    const queue = [...urls];

    async function worker() {
        while (queue.length > 0) {
            const url = queue.shift();
            try {
                const have = cache && await cache.match(url);
                if (!have && !(await fetchToCacheOnce(cache, url))) failed++;
            } catch (err) {
                failed++;
                console.warn('Không tải được ảnh offline:', url, err);
            }
            done++;
            if (onProgress) onProgress(done, urls.length, url);
        }
    }

    const workers = Array.from({ length: Math.min(poolLimit, urls.length) }, () => worker());
    await Promise.all(workers);

    return { total: urls.length, cached: urls.length - failed, failed };
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
        _fullAt: Date.now(),   // lần TẢI ĐỦ gần nhất (touchOfflineQuiz chỉ làm mới _offlineSavedAt) — hạn cứng 24h không tin dấu updatedAt
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
            record.imgFailed = (await cacheQuizImages(data.questions, { onProgress })).failed;
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

/** Đã hỏi máy chủ và bản trong máy vẫn đúng → làm mới mốc "tươi" (_offlineSavedAt) mà KHÔNG ghi lại cả bộ câu hỏi / dò lại ảnh. */
export async function touchOfflineQuiz(id) {
    try {
        const rec = await getOfflineQuiz(id);
        if (!rec) return;
        rec._offlineSavedAt = Date.now();
        await new Promise((resolve, reject) => {
            txStore('readwrite').then((store) => {
                const req = store.put(rec);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            }).catch(reject);
        });
    } catch (e) { /* không ghi được thì lần sau hỏi lại, không sao */ }
}

/** Xóa bản offline của một bộ đề. */
export async function deleteOfflineQuiz(id, { prune = true } = {}) {
    await new Promise((resolve, reject) => {
        txStore('readwrite').then((store) => {
            const req = store.delete(id);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        }).catch(reject);
    });
    writeIds(readIds().filter((x) => x !== id));
    if (prune) await pruneQuizImages();
}

/** Bỏ khỏi kho ảnh những ảnh không còn bộ đề offline nào dùng (ảnh dùng chung giữa các bộ được giữ lại). */
async function pruneQuizImages() {
    try {
        const keep = new Set();
        for (const q of await listOfflineQuizzes()) {
            extractQuizImageUrls(q.questions).forEach((u) => keep.add(new URL(fastImgUrl(u)).href));
        }
        const cache = await caches.open(QUIZ_IMG_CACHE);
        for (const req of await cache.keys()) if (!keep.has(req.url)) await cache.delete(req);
    } catch (e) { /* dọn không được thì thôi, ảnh thừa không hại */ }
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
    for (const q of autos.slice(AUTO_LIMIT)) await deleteOfflineQuiz(q.id, { prune: false });
    if (autos.length > AUTO_LIMIT) await pruneQuizImages();
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
