// File: core/firestore-rest.js
// Đọc Firestore qua REST có CHỌN TRƯỜNG (projection) — SDK web không có `select`, nên mỗi getDoc/getDocs kéo NGUYÊN doc
// (bộ đề: mảng `questions` ~99% dung lượng, hàng trăm KB) chỉ để đọc vài trường. Số lượt đọc tính tiền vẫn như nhau
// (mỗi doc = 1 lượt) nhưng băng thông / độ trễ giảm hàng chục lần.
//
// Mọi hàm NÉM LỖI khi thất bại (mạng, token, API đổi, luật chặn…): nơi gọi tự lùi về đường SDK cũ — không bao giờ làm hỏng trang.
// Có đăng nhập thì gửi Bearer token; chưa đăng nhập (trang chia sẻ thư mục công khai) thì dùng khóa API của dự án — luật vẫn áp dụng
// như SDK (truy vấn phải chứa điều kiện isPublic == true, v.v.). Chạy được cả với emulator (đọc host từ cấu hình của `db`).
import { auth, db } from './firebase-init.js';
import { whenAuthReady } from './auth-session.js';

// Đổi một giá trị kiểu Firestore REST về giá trị JS thường. Timestamp trả về chuỗi ISO — chỗ nào cần cũng đã dùng `new Date(...)`.
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
export function decodeDoc(document) {
    // `_updateTime` = giờ GHI CUỐI do máy chủ Firestore tự đóng dấu cho MỌI cách ghi (web, MCP, script…), không phụ thuộc người ghi có
    // nhớ cập nhật trường `updatedAt` hay không — dùng làm "số phiên bản" của doc (quiz-fresh.js).
    const out = { id: String(document.name || '').split('/').pop(), _updateTime: document.updateTime || null };
    Object.entries(document.fields || {}).forEach(([k, v]) => { out[k] = decodeValue(v); });
    return out;
}
const encodeValue = (v) => (typeof v === 'boolean' ? { booleanValue: v }
    : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
    : { stringValue: String(v) });

function endpoint() {
    const opt = db?.app?.options || {};
    if (!opt.projectId || typeof fetch !== 'function') throw new Error('rest: thiếu cấu hình');
    const st = db._settings || {};
    const prod = !st.host || /googleapis\.com/.test(st.host);
    const origin = prod ? 'https://firestore.googleapis.com' : `${st.ssl === false ? 'http' : 'https'}://${st.host}`;
    return { base: `${origin}/v1/projects/${opt.projectId}/databases/(default)/documents`, apiKey: opt.apiKey };
}

async function call(url, init, { requireUser = false, timeoutMs = 15000 } = {}) {
    const { apiKey } = endpoint();
    // KHÔNG dùng sessionUser(): lúc mới mở trang nó trả bản danh tính lưu trong máy (không có getIdToken) trước khi Firebase khôi phục phiên.
    // Cần đăng nhập thì chờ Firebase Auth (tối đa 4s); chỉ đọc công khai thì đi luôn với phiên đã có hoặc khóa API.
    let user = auth.currentUser;
    if (!user && requireUser) { await whenAuthReady(4000); user = auth.currentUser; }
    if (requireUser && !user) throw new Error('rest: cần đăng nhập');
    const headers = { 'Content-Type': 'application/json' };
    let target = url;
    if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
    else if (apiKey) target += `${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(apiKey)}`;
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : 0;
    try {
        return await fetch(target, { ...init, headers, signal: ctl?.signal });
    } finally { clearTimeout(timer); }
}

/**
 * Truy vấn một collection với điều kiện ĐẲNG THỨC và chỉ lấy các trường `select`.
 * @param {{collection:string, where?:Array<[string, any]>, select?:string[], requireUser?:boolean}} o
 * @returns {Promise<Array>} [{ id, ...trường }]
 */
export async function runQueryRest({ collection, where = [], select = [], requireUser = false }) {
    const { base } = endpoint();
    const filters = where.map(([f, v]) => ({ fieldFilter: { field: { fieldPath: f }, op: 'EQUAL', value: encodeValue(v) } }));
    const structuredQuery = {
        from: [{ collectionId: collection }],
        ...(filters.length === 1 ? { where: filters[0] } : filters.length > 1 ? { where: { compositeFilter: { op: 'AND', filters } } } : {}),
        ...(select.length ? { select: { fields: select.map(f => ({ fieldPath: f })) } } : {}),
    };
    const res = await call(`${base}:runQuery`, { method: 'POST', body: JSON.stringify({ structuredQuery }) }, { requireUser });
    if (!res.ok) throw new Error(`runQuery ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error('runQuery: dữ liệu trả về không đúng dạng');
    return rows.filter(r => r && r.document).map(r => decodeDoc(r.document));
}

/** Đọc MỘT doc nhưng chỉ lấy các trường `fields`. Doc không tồn tại → null. */
export async function getDocRest(collection, id, fields = [], { requireUser = false } = {}) {
    const { base } = endpoint();
    const mask = fields.map(f => `mask.fieldPaths=${encodeURIComponent(f)}`).join('&');
    const res = await call(`${base}/${collection}/${encodeURIComponent(id)}${mask ? `?${mask}` : ''}`, { method: 'GET' }, { requireUser });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`getDoc ${res.status}`);
    return decodeDoc(await res.json());
}
