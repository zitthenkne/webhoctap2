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
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";

// Các trường thư viện thật sự dùng tới (KHÔNG có `questions`)
const META_FIELDS = ['title', 'questionCount', 'createdAt', 'folderId', 'isPublic', 'deleted', 'deletedAt'];

// === CACHE METADATA (localStorage, theo từng tài khoản) ===
const CACHE_VERSION = 1;

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

// === ĐỌC QUA REST API (có projection) ===

// Đổi một giá trị kiểu Firestore REST về giá trị JS thường.
// Timestamp trả về chuỗi ISO — chỗ nào cần cũng đã dùng `new Date(...)` nên dùng thẳng được.
function decodeValue(v) {
    if (!v || typeof v !== 'object') return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('timestampValue' in v) return v.timestampValue;
    if ('nullValue' in v) return null;
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
    if ('mapValue' in v) {
        const out = {};
        Object.entries(v.mapValue.fields || {}).forEach(([k, val]) => { out[k] = decodeValue(val); });
        return out;
    }
    return null;
}

function decodeDoc(document) {
    const id = String(document.name || '').split('/').pop();
    const out = { id };
    Object.entries(document.fields || {}).forEach(([k, v]) => { out[k] = decodeValue(v); });
    return out;
}

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
export async function fetchAllQuizMeta(uid) {
    const user = sessionUser();
    const projectId = db && db.app && db.app.options ? db.app.options.projectId : null;
    if (!user || !projectId || typeof fetch !== 'function') return fetchViaSdk(uid);

    try {
        const token = await user.getIdToken();
        const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
                structuredQuery: {
                    from: [{ collectionId: 'quiz_sets' }],
                    where: {
                        fieldFilter: {
                            field: { fieldPath: 'userId' },
                            op: 'EQUAL',
                            value: { stringValue: uid }
                        }
                    },
                    select: { fields: META_FIELDS.map(f => ({ fieldPath: f })) }
                }
            })
        });
        if (!res.ok) throw new Error(`runQuery ${res.status}`);
        const rows = await res.json();
        if (!Array.isArray(rows)) throw new Error('runQuery: dữ liệu trả về không đúng dạng');
        return rows.filter(r => r && r.document).map(r => decodeDoc(r.document));
    } catch (err) {
        console.warn('Tải nhanh metadata thất bại, quay về SDK:', err && err.message);
        return fetchViaSdk(uid);
    }
}
