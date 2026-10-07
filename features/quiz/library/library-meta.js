// File: features/quiz/library/library-meta.js
// Tải NHANH danh sách bộ đề cho thư viện.
//
// Vì sao cần file này: SDK Firestore không cho chọn trường (projection) — mỗi lần mở thư viện
// nó kéo về NGUYÊN mảng `questions` của mọi bộ đề (chiếm ~99% dung lượng) rồi JS mới vứt đi.
// Thư viện chỉ cần vài trường mô tả, nên ở đây gọi thẳng REST API `runQuery` kèm `select`
// → chỉ tải đúng phần cần, nhẹ hơn hàng chục lần. Lỗi gì (mạng, token, API đổi) thì tự lùi về
// đường SDK cũ, không làm hỏng thư viện.
//
// Kèm theo là cache metadata trong localStorage: mở lại thư viện thấy nội dung ngay lập tức,
// dữ liệu mới từ server về sau sẽ vẽ đè.

import { auth, db } from '../../../core/firebase-init.js';
import { sessionUser } from '../../../core/auth-session.js';
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { runQueryRest } from '../../../core/firestore-rest.js';

// Các trường thư viện thật sự dùng tới (KHÔNG có `questions`)
const META_FIELDS = ['title', 'questionCount', 'createdAt', 'updatedAt', 'folderId', 'isPublic', 'deleted', 'deletedAt'];      // updatedAt: dấu phiên bản (chỉ mục câu hỏi bền so dấu này)

// === CACHE METADATA (localStorage, theo từng tài khoản) ===
const CACHE_VERSION = 2;   // v2 (C4): mỗi bộ đề trong cache có thêm updatedAt (dấu phiên bản cho chỉ mục câu hỏi bền) — cache v1 bị bỏ, tải lại một lần

function readCache(key) {
    try {
        const raw = JSON.parse(localStorage.getItem(key) || 'null');
        if (!raw || raw.v !== CACHE_VERSION || !Array.isArray(raw.list)) return null;
        return raw.list;
    } catch {
        return null;
    }
}

function writeCache(key, list) {
    try {
        localStorage.setItem(key, JSON.stringify({ v: CACHE_VERSION, at: Date.now(), list }));
    } catch {
        // Hết dung lượng localStorage → bỏ cache, không ảnh hưởng luồng chính
        try { localStorage.removeItem(key); } catch {}
    }
}

export function readMetaCache(uid) { return readCache(`libMetaCache_${uid}`); }
export function writeMetaCache(uid, list) { writeCache(`libMetaCache_${uid}`, list); }
export function readFoldersCache(uid) { return readCache(`libFolderCache_${uid}`); }
export function writeFoldersCache(uid, list) { writeCache(`libFolderCache_${uid}`, list); }

export function clearMetaCache(uid) {
    try {
        localStorage.removeItem(`libMetaCache_${uid}`);
        localStorage.removeItem(`libFolderCache_${uid}`);
    } catch {}
}

// === ĐỌC QUA REST API (có projection) — phần dùng chung nằm ở core/firestore-rest.js ===

// Đường lùi: vẫn là SDK (tải cả câu hỏi rồi bỏ) — chậm nhưng chắc chắn chạy.
async function fetchViaSdk(uid) {
    const snap = await getDocs(query(collection(db, 'quiz_sets'), where('userId', '==', uid)));
    return snap.docs.map(d => {
        const { questions, ...meta } = d.data();
        return { id: d.id, ...meta };
    });
}

/**
 * Lấy metadata TOÀN BỘ bộ đề của một tài khoản.
 * Không dùng orderBy: Firestore loại bỏ document thiếu trường sắp xếp — bộ đề cũ không có
 * `createdAt` sẽ biến mất khỏi thư viện. Sắp xếp để nơi gọi tự làm bằng JS.
 * @returns {Promise<Array>} danh sách metadata (chưa lọc `deleted`)
 */
export async function fetchAllQuizMeta(uid, { restOnly = false } = {}) {
    // restOnly: chỉ chấp nhận đường REST nhẹ — lỗi thì trả null (nơi gọi tự chọn đường khác), KHÔNG lùi về SDK (SDK kéo cả câu hỏi)
    if (!sessionUser()) return restOnly ? null : fetchViaSdk(uid);
    try {
        return await runQueryRest({ collection: 'quiz_sets', where: [['userId', uid]], select: META_FIELDS, requireUser: true });
    } catch (err) {
        console.warn('Tải nhanh metadata thất bại' + (restOnly ? '' : ', quay về SDK') + ':', err && err.message);
        return restOnly ? null : fetchViaSdk(uid);
    }
}

/** Tuổi (ms) của một cache trong máy; chưa có / hỏng → Infinity. */
function cacheAge(key) {
    try {
        const raw = JSON.parse(localStorage.getItem(key) || 'null');
        return raw && raw.v === CACHE_VERSION && Array.isArray(raw.list) ? Math.max(0, Date.now() - (Number(raw.at) || 0)) : Infinity;
    } catch { return Infinity; }
}
export function metaCacheAge(uid) { return cacheAge(`libMetaCache_${uid}`); }
/** Tuổi của cache THƯ VIỆN = bên cũ hơn trong (bộ đề, thư mục); thiếu một trong hai → Infinity (phải tải). */
export function libraryCacheAge(uid) { return Math.max(cacheAge(`libMetaCache_${uid}`), cacheAge(`libFolderCache_${uid}`)); }
