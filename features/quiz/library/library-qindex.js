// File: features/quiz/library/library-qindex.js
// Chỉ mục CÂU HỎI bền (IndexedDB) cho ô "tìm theo nội dung câu hỏi" ở thư viện.
//
// Trước đây mỗi lần tìm (mỗi lần mở trang — RAM trống) kéo CẢ bộ câu hỏi của MỌI bộ đề bằng SDK (N × hàng trăm KB) chỉ để lấy chữ câu hỏi + phương án
// (không cần lời giải). Nay mỗi bộ đề giữ MỘT bản chỉ mục gọn trong IndexedDB kèm "dấu phiên bản" (updatedAt) của bộ đề lúc lập chỉ mục;
// lần tìm sau chỉ tải lại những bộ ĐỔI dấu (hoặc mới) — còn lại đọc thẳng từ máy.
//
// DB riêng `zitthenkne-qindex` (không đụng kho offline `zitthenkne-offline`). Mọi hàm đều nuốt lỗi → nơi gọi coi như "chưa có chỉ mục".

const DB_NAME = 'zitthenkne-qindex';
const STORE = 'sets';
let _dbPromise = null;

function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) { reject(new Error('no indexedDB')); return; }
        const make = (version) => {
            const req = version ? indexedDB.open(DB_NAME, version) : indexedDB.open(DB_NAME);
            req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' }); };
            req.onsuccess = () => {
                const db = req.result;
                if (db.objectStoreNames.contains(STORE)) return resolve(db);
                const next = db.version + 1; db.close(); make(next);        // tự chữa DB thiếu kho (cùng cách quiz-offline-store.js)
            };
            req.onerror = () => reject(req.error);
        };
        make(0);
    }).catch((e) => { _dbPromise = null; throw e; });
    return _dbPromise;
}

const tx = (mode) => openDB().then((db) => db.transaction(STORE, mode).objectStore(STORE));
const wrap = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

/** Mọi bản chỉ mục của máy này → Map(id → { id, uid, stamp, n, at, title, qs:[{question, options}] }). Lỗi → Map rỗng. */
export async function qindexGetAll(uid) {
    try {
        const rows = await wrap((await tx('readonly')).getAll());
        return new Map(rows.filter(r => r && r.uid === uid).map(r => [r.id, r]));
    } catch (e) { return new Map(); }
}

/** Ghi / xóa theo lô trong MỘT giao dịch. */
export async function qindexApply({ put = [], del = [] }) {
    if (!put.length && !del.length) return;
    try {
        const db = await openDB();
        await new Promise((resolve, reject) => {
            const t = db.transaction(STORE, 'readwrite');
            const st = t.objectStore(STORE);
            put.forEach(r => st.put(r));
            del.forEach(id => st.delete(id));
            t.oncomplete = () => resolve();
            t.onerror = () => reject(t.error);
            t.onabort = () => reject(t.error);
        });
    } catch (e) { /* hết dung lượng / IDB lỗi: lần sau lập lại, không ảnh hưởng tìm kiếm */ }
}

/** Phiên bản cấu trúc bản chỉ mục. Đổi số → mọi bản cũ coi như hết hạn, lập lại (v2: thêm đáp án đúng, giải thích, ghi chú, ca lâm sàng). */
export const QINDEX_V = 2;

// Ảnh nhúng base64 rất nặng mà không tìm được chữ gì → thay bằng chỗ trống (ảnh link thường vẫn giữ để xem trước)
const DATA_URI = /data:[\w/+.-]+;base64,[A-Za-z0-9+/=]{2000,}/g;
const txt = (v) => (v == null ? '' : typeof v === 'string' ? v : (v.text || v.content || String(v))).replace(DATA_URI, '');

/** Rút gọn một câu hỏi về phần CHỮ: đủ để tìm sâu (đáp án, giải thích, ghi chú) và xem đầy đủ ngay ở thư viện. */
export const slimQuestion = (q) => {
    q = q || {};
    const opts = (q.answers || q.options || []).map(txt);
    const correct = Array.isArray(q.correctAnswerIndexes) && q.correctAnswerIndexes.length
        ? q.correctAnswerIndexes.slice() : (typeof q.correctAnswerIndex === 'number' && q.correctAnswerIndex >= 0 ? [q.correctAnswerIndex] : []);
    const out = { question: txt(q.question), options: opts, correct };
    if (q.explanation) out.exp = txt(q.explanation);
    if (Array.isArray(q.optionExplanations) && q.optionExplanations.some(Boolean)) out.optExp = q.optionExplanations.map(txt);
    if (q.note) out.note = txt(q.note);
    if (q.expanded) out.expanded = txt(q.expanded);
    if (q.caseText) { out.caseText = txt(q.caseText); if (q.caseTitle) out.caseTitle = txt(q.caseTitle); }
    if (q.type) out.type = q.type;
    if (q.modelAnswer) out.modelAnswer = txt(q.modelAnswer);
    if (Array.isArray(q.keyPoints) && q.keyPoints.length) out.keyPoints = q.keyPoints.map(txt);
    return out;
};
