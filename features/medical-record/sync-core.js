// sync-core.js — phần THUẦN LOGIC của đồng bộ bệnh án nhiều máy (không import gì, không đụng DOM/Firestore,
// nên chạy được cả trong Node để kiểm thử). record-store.js lo phần đọc/ghi, file này lo "ai thắng".
//
// Vấn đề của bản cũ (so cả bệnh án bằng chuỗi `lastUpdated`, máy nào mới hơn thì đè hết):
//   1. Hai máy sửa HAI MỤC KHÁC NHAU của cùng một bệnh án → một máy mất sạch phần đã sửa.
//   2. Xóa ở máy A → máy B vẫn còn bản cũ → lần đồng bộ sau B đẩy ngược lên, bệnh án "sống lại".
//   3. Đồng hồ hai máy lệch nhau → bản sửa SAU lại bị coi là cũ.
//   4. Thư mục đợt thực hành chỉ nằm ở từng máy (xóa/sửa/đợt trống không đi theo).
// Cách làm: mỗi bệnh án mang `_ts` = dấu thời gian của TỪNG TRƯỜNG (độ sâu ≤ 2: "hanhChinh/hoTen"),
// trộn theo trường; dấu thời gian luôn tăng đơn điệu (stamp) nên lệch giờ không đảo thứ tự những gì máy
// ĐÃ THẤY; xóa ghi bia mộ (tombstone) có dấu thời gian để so với lần sửa.

export const ms = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? t : 0; };
export const iso = (t) => new Date(t).toISOString();

/** Khóa dùng trong bản đồ Firestore: không chứa ký tự làm hỏng đường dẫn trường */
export const kid = (id) => String(id).replace(/[.\[\]*~`\/]/g, '_');

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** JSON ổn định (sắp khóa) để so hai giá trị mà không phụ thuộc thứ tự khóa */
export function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (isObj(v)) return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
}
export const same = (a, b) => stable(a) === stable(b);

const META_KEYS = new Set(['id', 'lastUpdated', '_ts']);

/** Khóa cấp 1 mà hai bản khác KIỂU (một bên object, một bên chuỗi/mảng) → coi cả khóa là một trường */
function unitKeys(...recs) {
    const out = new Set();
    const keys = new Set(recs.flatMap(r => (r ? Object.keys(r) : [])));
    keys.forEach((k) => {
        if (META_KEYS.has(k)) return;
        const kinds = new Set(recs.filter(r => r && k in r).map(r => (isObj(r[k]) ? 'o' : 'x')));
        if (kinds.size > 1) out.add(k);
    });
    return out;
}

/** Phẳng hóa bệnh án thành Map "khóa" | "khóa/khóa con" → giá trị (đối tượng rỗng và mảng là MỘT trường) */
export function pathsOf(rec, units = new Set()) {
    const out = new Map();
    if (!rec) return out;
    for (const [k, v] of Object.entries(rec)) {
        if (META_KEYS.has(k) || v === undefined) continue;
        if (isObj(v) && !units.has(k) && Object.keys(v).length) {
            for (const [sk, sv] of Object.entries(v)) if (sv !== undefined) out.set(k + '/' + sk, sv);
        } else out.set(k, v);
    }
    return out;
}

/** Mốc thời gian lớn nhất bản này đã mang (lastUpdated hoặc bất kỳ trường nào) */
export function maxTs(rec) {
    if (!rec) return 0;
    let m = ms(rec.lastUpdated);
    for (const v of Object.values(rec._ts || {})) if (typeof v === 'number' && v > m) m = v;
    return m;
}

/** Dấu thời gian mới: không bao giờ nhỏ hơn mốc đã thấy → máy chậm giờ vẫn "đè" được thứ nó vừa kéo về */
export const stamp = (floor, now = Date.now()) => Math.max(now, (floor || 0) + 1);

/** Giá trị "chưa có gì": form viết bệnh án tự điền sẵn '' cho mọi ô — đó không phải người dùng vừa sửa */
const isEmpty = (v) => v === '' || v === null || (Array.isArray(v) && !v.length) || (isObj(v) && !Object.keys(v).length);

/**
 * `_ts` cho bản sắp lưu: chỉ những trường THẬT SỰ đổi so với bản trước mới nhận dấu mới (kể cả trường bị xóa).
 * Trường mới xuất hiện mà RỖNG thì KHÔNG đóng dấu: trang viết bệnh án đang mở (đã cũ) lưu lại cả các ô rỗng mặc định,
 * nếu đóng dấu thì ô rỗng đó sẽ đè lên chữ máy khác vừa viết vào đúng ô ấy.
 */
export function touchTs(prev, next, st) {
    const ts = { ...(prev?._ts || {}) };
    const units = unitKeys(prev, next);
    const P = pathsOf(prev, units), N = pathsOf(next, units);
    for (const [p, v] of N) {
        if (!P.has(p)) { if (!isEmpty(v)) ts[p] = st; }
        else if (!same(P.get(p), v)) ts[p] = st;
    }
    for (const p of P.keys()) if (!N.has(p)) ts[p] = st;
    return ts;
}

function setPath(out, p, v) {
    const i = p.indexOf('/');
    if (i < 0) { out[p] = v; return; }
    const k = p.slice(0, i), sk = p.slice(i + 1);
    if (!isObj(out[k])) out[k] = {};
    out[k][sk] = v;
}

/**
 * Trộn hai phiên bản của MỘT bệnh án (a = máy này, b = cloud/máy khác) theo từng trường.
 * Trả về { record, useA, useB }:
 *   useA = bản trộn có thứ mà b chưa có  → phải ĐẨY lên;
 *   useB = bản trộn có thứ mà a chưa có  → phải GHI về máy.
 * Hai bên đều đóng góp thì lastUpdated = max + 1ms: tất định → hai máy trộn cùng lúc ra cùng một kết quả.
 * Bản cũ chưa có `_ts` (cả hai) → quay về so cả bệnh án như trước.
 */
export function mergeRecord(a, b) {
    const ta = ms(a.lastUpdated), tb = ms(b.lastUpdated);
    if (!a._ts && !b._ts) {
        if (same(a, b)) return { record: a, useA: false, useB: false };
        return tb > ta ? { record: b, useA: false, useB: true } : { record: a, useA: true, useB: false };
    }
    const units = unitKeys(a, b);
    const A = pathsOf(a, units), B = pathsOf(b, units);
    // Trường chưa từng được đóng dấu = cũ nhất (0), TRỪ khi cả hai bên đều chưa đóng dấu → so theo cả bệnh án như trước
    const stampsOf = (p) => {
        let xa = typeof a._ts?.[p] === 'number' ? a._ts[p] : 0;
        let xb = typeof b._ts?.[p] === 'number' ? b._ts[p] : 0;
        if (!xa && !xb) { xa = ta; xb = tb; }
        return [xa, xb];
    };
    const paths = new Set([...A.keys(), ...B.keys(), ...Object.keys(a._ts || {}), ...Object.keys(b._ts || {})]);
    const out = {};
    const mts = {};
    let useA = false, useB = false;
    for (const p of paths) {
        const hasA = A.has(p), hasB = B.has(p);
        const [xa, xb] = stampsOf(p);
        let pick;
        if (xa > xb) pick = 'a';
        else if (xb > xa) pick = 'b';
        else if (hasA && hasB && same(A.get(p), B.get(p))) pick = 'a';
        // cùng dấu mà khác giá trị (hiếm): chọn tất định theo nội dung để hai máy ra cùng kết quả
        else pick = (hasA ? stable(A.get(p)) : '') >= (hasB ? stable(B.get(p)) : '') ? 'a' : 'b';
        mts[p] = Math.max(xa, xb);
        const has = pick === 'a' ? hasA : hasB;
        if (has) setPath(out, p, (pick === 'a' ? A : B).get(p));
        const other = pick === 'a' ? (hasB ? B.get(p) : undefined) : (hasA ? A.get(p) : undefined);
        const differs = has ? (pick === 'a' ? !(hasB && same(A.get(p), other)) : !(hasA && same(B.get(p), other)))
            : (pick === 'a' ? hasB : hasA);          // bên thắng KHÔNG có trường (đã xóa) mà bên kia còn
        if (differs) { if (pick === 'a') useA = true; else useB = true; }
    }
    const rebuilt = { id: a.id ?? b.id };
    Object.assign(rebuilt, out);
    rebuilt._ts = mts;
    rebuilt.lastUpdated = useA && useB ? iso(Math.max(ta, tb) + 1) : useA ? a.lastUpdated : useB ? b.lastUpdated : (tb > ta ? b.lastUpdated : a.lastUpdated);
    return { record: rebuilt, useA, useB };
}

/**
 * Trộn một "tập có dấu thời gian" (thư mục đợt, ghim…) giữa máy này và cloud, có bia mộ.
 *   items: { id: { ...,[tk]: ms } }   del: { id: ms }
 * Mỗi id: bản sống mới nhất vs bia mộ mới nhất — bia mộ >= bản sống thì coi là đã xóa.
 * Trả về trạng thái hợp nhất (items, del) + việc phải làm:
 *   toLocal  { set, remove }          — id cần ghi / bỏ ở máy này
 *   toRemote { set, remove, tomb, undel } — id cần ghi / xóa / ghi bia mộ / gỡ bia mộ ở cloud
 */
export function mergeSet(localItems, localDel, remoteItems, remoteDel, tk = '_t') {
    const items = {}, del = {};
    const toLocal = { set: [], remove: [] };
    const toRemote = { set: [], remove: [], tomb: [], undel: [] };
    const ids = new Set([...Object.keys(localItems || {}), ...Object.keys(remoteItems || {}), ...Object.keys(localDel || {}), ...Object.keys(remoteDel || {})]);
    for (const id of ids) {
        const l = localItems?.[id], r = remoteItems?.[id];
        const tl = l ? Number(l[tk]) || 0 : -1, tr = r ? Number(r[tk]) || 0 : -1;
        const alive = tl >= tr ? l : r;
        const aliveT = Math.max(tl, tr);
        const dl = Number(localDel?.[id]) || 0, dr = Number(remoteDel?.[id]) || 0;
        const d = Math.max(dl, dr);
        if (alive && aliveT > d) {                       // còn sống (kể cả sống lại sau bia mộ cũ)
            items[id] = alive;
            if (!l || !same(l, alive)) toLocal.set.push(id);
            if (!r || !same(r, alive)) toRemote.set.push(id);
            if (dr) toRemote.undel.push(id);
        } else if (d > 0) {                              // đã xóa
            del[id] = d;
            if (l) toLocal.remove.push(id);
            if (r) toRemote.remove.push(id);
            if (dr < d) toRemote.tomb.push(id);
        } else if (alive) {                              // sống, không bia mộ
            items[id] = alive;
            if (!l || !same(l, alive)) toLocal.set.push(id);
            if (!r || !same(r, alive)) toRemote.set.push(id);
        }
    }
    return { items, del, toLocal, toRemote };
}

/** Bia mộ quá cũ thì dọn (đủ lâu để mọi máy đã kịp thấy) */
export const TOMB_TTL = 120 * 86400000;
export function pruneDel(del, now = Date.now()) {
    const out = {};
    for (const [k, v] of Object.entries(del || {})) if (now - Number(v) < TOMB_TTL) out[k] = v;
    return out;
}
