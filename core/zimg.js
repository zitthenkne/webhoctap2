// core/zimg.js — ẢNH BỘ ĐỀ LƯU THẲNG TRONG FIRESTORE (collection quiz_images), thay cho host ngoài (catbox/wsrv).
//
// Trong câu hỏi viết:  ![mô tả](zimg:<32 ký tự hex>)   — id = 32 ký tự đầu của SHA-256 nội dung ảnh (cùng ảnh → cùng id, tự khử trùng).
// Doc quiz_images/<id> = { data: Bytes (WebP/PNG/JPEG/GIF ≤ 900 KB), mime, w, h, bytes, userId, createdAt }, BẤT BIẾN (luật không cho sửa).
//
// Cách hiện ảnh (không đổi chỗ nào khác trong web):
//   1. parseInlineMarkdown đổi `zimg:<id>` thành <img src=".../zimg/<id>.webp"> (zimgUrl).
//   2. Service Worker chặn đúng đường dẫn đó, lấy ảnh từ Firestore (REST, đọc công khai), cất vào CacheStorage rồi trả về — các lần sau 0 mạng.
//   3. Trang chưa được SW quản (lần đầu mở, trình duyệt tắt SW): đường dẫn trả 404 → sự kiện error của <img> → loadZimg() ở đây tự lấy
//      ảnh từ Firestore và gán blob: vào chính thẻ <img> đó. Cả hai đường dùng chung một kho cache (ZIMG_CACHE).
//
// Module này KHÔNG nạp Firebase SDK (được import từ quiz-helpers — chạy cả trong node:test): chỉ fetch tới REST. Hằng số cấu hình là
// cấu hình web công khai, trùng core/firebase-init.js và sw.js — đổi dự án thì đổi cả ba chỗ.
const PROJECT_ID = 'zitthenkne';
const API_KEY = 'AIzaSyBFNNeJMeDIVRcG2Xj4ZVjr2-0d9RGrURc';
export const ZIMG_CACHE = 'zitthenkne-zimg';
export const ZIMG_MAX_BYTES = 900000;

const ID_RE = /^[a-f0-9]{32}$/;
const ROOT = new URL('../', import.meta.url).href;                       // thư mục gốc web (tính từ /core/)

/** Id hợp lệ → true. */
export const isZimgId = (id) => typeof id === 'string' && ID_RE.test(id);
/** 'zimg:<id>' → id (chữ thường) | null. */
export function parseZimgRef(src) {
    const m = /^zimg:([a-f0-9]{32})$/i.exec(String(src || '').trim());
    return m ? m[1].toLowerCase() : null;
}
/** Mọi id `zimg:<id>` xuất hiện trong một đoạn chữ. */
export function zimgIdsIn(text) {
    const out = new Set();
    for (const m of String(text || '').matchAll(/zimg:([a-f0-9]{32})/gi)) out.add(m[1].toLowerCase());
    return [...out];
}
/** Đường dẫn <img> dùng — SW bắt đường này; không có SW thì lỗi 404 → fallback ở dưới. */
export const zimgUrl = (id) => `${ROOT}zimg/${id}.webp`;
/** URL ảnh zimg → id | null (nhận cả bản có query / blob không). */
export function idFromUrl(url) {
    const m = /\/zimg\/([a-f0-9]{32})\.[a-z0-9]+(?:[?#].*)?$/i.exec(String(url || ''));
    return m ? m[1].toLowerCase() : null;
}

/** Đúng là URL ảnh zimg CỦA TRANG NÀY (cùng gốc) — bộ lọc ảnh của phòng học cho qua kể cả khi chạy http://localhost. */
export const isZimgUrl = (u) => String(u || '').startsWith(ROOT + 'zimg/') && !!idFromUrl(u);

const endpoint = () => globalThis.__ZIMG_ENDPOINT__ || `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function b64ToBytes(b64) {
    const bin = atob(String(b64 || '').replace(/\s+/g, ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

const inflight = new Map();
const missing = new Map();          // id -> lúc nhận 404: một phiên làm bài nạp ảnh nhiều lần (xem trước, lưu offline, thẻ <img>) — đừng hỏi lại ảnh không có mỗi lần
const MISSING_MS = 60000;
/** Lấy ảnh (Blob): CacheStorage trước, không có thì Firestore REST rồi cất lại. Lỗi → ném. */
export function loadZimg(id) {
    if (!isZimgId(id)) return Promise.reject(new Error('zimg: id không hợp lệ'));
    if (inflight.has(id)) return inflight.get(id);
    if (Date.now() - (missing.get(id) || 0) < MISSING_MS) return Promise.reject(new Error('zimg: 404'));
    const p = (async () => {
        const url = zimgUrl(id);
        let cache = null;
        try { if (typeof caches !== 'undefined') cache = await caches.open(ZIMG_CACHE); } catch (e) { /* không có CacheStorage */ }
        if (cache) {
            const hit = await cache.match(url).catch(() => null);
            if (hit) return hit.blob();
        }
        const res = await fetch(`${endpoint()}/quiz_images/${id}?mask.fieldPaths=data&mask.fieldPaths=mime&key=${API_KEY}`);
        if (res.status === 404) missing.set(id, Date.now());
        if (!res.ok) throw new Error(`zimg: ${res.status}`);
        const f = (await res.json()).fields || {};
        const bytes = b64ToBytes(f.data && f.data.bytesValue);
        if (!bytes.length) throw new Error('zimg: ảnh rỗng');
        const mime = (f.mime && f.mime.stringValue) || 'image/webp';
        const blob = new Blob([bytes], { type: mime });
        // Chờ cất xong rồi mới trả: lời gọi kế tiếp (ảnh khác cùng id, trang khác) mới thấy kho đã có, khỏi tải lần hai
        if (cache) await cache.put(url, new Response(blob, { headers: { 'Content-Type': mime, 'Cache-Control': 'public, max-age=31536000, immutable' } })).catch(() => {});
        return blob;
    })().finally(() => inflight.delete(id));
    inflight.set(id, p);
    return p;
}

// ---- Fallback cho trang chưa có Service Worker: <img> lỗi tải đường dẫn zimg → lấy từ Firestore, gán blob: ----
function fixImg(im) {
    if (!im || im.tagName !== 'IMG' || im.dataset.zfix) return;
    const id = idFromUrl(im.getAttribute('src') || im.src);
    if (!id) return;
    im.dataset.zfix = '1';
    loadZimg(id).then((blob) => { im.src = URL.createObjectURL(blob); }).catch(() => { im.classList.add('zimg-failed'); im.title = 'Không tải được ảnh'; });
}
if (typeof document !== 'undefined') {
    // Sự kiện error của <img> không nổi bọt → nghe ở pha capture: bắt cả ảnh dựng động / nằm trong HTML phòng đánh đề.
    document.addEventListener('error', (e) => fixImg(e.target), true);
    // Ảnh đã lỗi TRƯỚC khi module này chạy (trang vẽ xong rồi mới nạp module) → quét một lần.
    const sweep = () => document.querySelectorAll('img').forEach((im) => { if (im.complete && im.naturalWidth === 0) fixImg(im); });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sweep, { once: true }); else setTimeout(sweep, 0);
}
