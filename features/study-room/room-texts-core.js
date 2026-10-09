// room-texts-core.js — phần THUẦN (không Firebase) của "tách chữ ra khỏi doc phiên" (bản 74b).
//
// Vì sao: quizSession/current chứa MỌI ghi chú chung (notes), giải thích từng phương án (optNotes), bản sửa đề (edits), mở rộng/ghi nhớ
// (extra), bài làm chung nhiều ô (parts), báo lỗi (issues) của CẢ ĐỀ. Firestore gửi lại NGUYÊN doc cho mọi máy mỗi lần doc đổi, nên
// một người gõ ghi chú (tự lưu ~0,6s) bắt cả phòng tải lại toàn bộ chữ của cả đề — đo: 31 KB/lần khi đề có 30 ghi chú.
// Nay các bản đồ chữ nằm trong doc con quizSession/t<khối> (mỗi khối 10 câu) + t_c (ca lâm sàng); room.session vẫn là MỘT đối tượng
// đủ trường nhờ mergeTexts() nên mọi module đọc không đổi.
//
//   t<b> = { kind:'texts', live:true, sid, notes:{qN:html}, notesBy, optNotes:{qN:{oK}}, edits:{qN:{…}}, issues, extra, extraBy, parts }
//   t_c  = { kind:'texts', live:true, sid, caseEdits:{ck:{text,title}}, caseBy }
//   `live:true` để doc đi chung truy vấn hiện diện sẵn có (refs.live) — không thêm listener nào.
//   `sid` = định danh PHIÊN: doc của phiên cũ bị bỏ qua, nên mở phiên mới không phải dọn.
export const TEXT_ROOTS = ['notes', 'notesBy', 'optNotes', 'edits', 'issues', 'extra', 'extraBy', 'parts'];
export const CASE_ROOTS = ['caseEdits', 'caseBy'];
export const ALL_ROOTS = [...TEXT_ROOTS, ...CASE_ROOTS];
export const BLOCK = 10;
export const TEXTS_CAP = 1;                              // máy biết đọc doc chữ (bản 74b)
export const MEMBER_CAP = 2;                             // máy biết đọc doc đáp án theo khối của thành viên (bản 74c)
export const CAP = MEMBER_CAP;                           // mức cao nhất máy này biết — ghi vào hiện diện để máy khác biết
// Bản 74c: các bản đồ KHÓA THEO CÂU của doc thành viên (đáp án, bình luận, đánh dấu…) — nằm ở quizSession/m_<uid>_b<khối>
// ({kind:'mshard', live:true, uid, sid, b, answers:{qN}, args:{qN:{id}}, …}). Doc thành viên chỉ còn phần nhỏ (tên, mặt, giơ tay, đội…).
export const MEMBER_ROOTS = ['answers', 'args', 'marks', 'flags', 'ready', 'unclear', 'dissent', 'diff', 'rf'];

export const sidOf = (s) => (s ? `${s.qid || 0}:${s.startedAtMs || 0}` : '');
export const shardDocId = (id) => (id === 'tc' ? 't_c' : 't_' + id.slice(1));

/** 'notes.q23.x' → { id:'t2', root:'notes', seg }, 'caseEdits.ck.text' → { id:'tc' }; đường khác → null. */
export function shardOfPath(path) {
    const seg = String(path).split('.');
    const root = seg[0];
    if (TEXT_ROOTS.includes(root)) {
        const m = /^q(\d+)$/.exec(seg[1] || '');
        if (m) return { id: 't' + Math.floor(Number(m[1]) / BLOCK), root, seg };
    } else if (CASE_ROOTS.includes(root) && seg[1]) return { id: 'tc', root, seg };
    return null;
}

/** Tách một patch dạng đường chấm thành phần ở doc phiên và phần ở từng doc chữ. */
export function splitPatch(patch) {
    const cur = {}, shards = {};
    for (const [k, v] of Object.entries(patch || {})) {
        const s = shardOfPath(k);
        if (s) (shards[s.id] ||= {})[k] = v;
        else cur[k] = v;
    }
    return { cur, shards };
}

/** { 'notes.q5': 'x' } → { notes: { q5: 'x' } } (dựng doc mới). */
export function nest(dotted) {
    const out = {};
    for (const [k, v] of Object.entries(dotted)) {
        const seg = k.split('.');
        let o = out;
        for (const s of seg.slice(0, -1)) { if (!o[s] || typeof o[s] !== 'object') o[s] = {}; o = o[s]; }
        o[seg[seg.length - 1]] = v;
    }
    return out;
}

/** Đường chấm có tồn tại (kể cả giá trị null) trong đối tượng không. */
export function hasPath(obj, path) {
    let o = obj;
    for (const s of String(path).split('.')) {
        if (!o || typeof o !== 'object' || !(s in o)) return false;
        o = o[s];
    }
    return true;
}

const isMap = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
// Gộp sâu hai bản đồ: bản đồ vào bản đồ thì gộp từng trường, còn lại (chuỗi, số, mảng, null) bản MỚI thay. Giới hạn độ sâu để khỏi vòng.
function deepMerge(old, v, depth = 0) {
    if (!isMap(v) || !isMap(old) || depth > 6) return v;
    const out = { ...old };
    for (const [k, x] of Object.entries(v)) out[k] = deepMerge(old[k], x, depth + 1);
    return out;
}

/** Gộp các bản đồ `roots` của `docs` (đã lọc đúng phiên) vào bản sao của `cur`. Không có gì để gộp -> trả NGUYÊN `cur`. */
function mergeRoots(cur, docs, roots) {
    if (!cur || !docs.length) return cur;
    let out = null;
    for (const root of roots) {
        let map = null;
        for (const d of docs) {
            const m = d[root];
            if (!isMap(m)) continue;
            map ||= { ...(isMap(cur[root]) ? cur[root] : {}) };
            for (const [k, v] of Object.entries(m)) map[k] = deepMerge(map[k], v, 1);
        }
        if (map) { out ||= { ...cur }; out[root] = map; }
    }
    return out || cur;
}

/**
 * Gộp doc phiên (có thể còn chữ cũ) với các doc chữ CÙNG phiên. Doc chữ thắng, gộp sâu; null của doc chữ = "đã xóa" và đè chữ cũ.
 * Không có doc chữ nào hợp lệ thì trả NGUYÊN `cur` (cùng tham chiếu).
 */
export function mergeTexts(cur, shards, sid) {
    if (!cur) return cur;
    return mergeRoots(cur, Object.values(shards || {}).filter(d => d && d.sid === sid), ALL_ROOTS);
}

// ---------- Bản 74c: doc thành viên theo khối câu ----------
export const mshardDocId = (uid, id) => `m_${uid}_${id}`;

/** 'answers.q23.why' → { id:'b2', root:'answers', seg }; đường khác (kể cả cả-map 'answers') → null. */
export function memberShardOfPath(path) {
    const seg = String(path).split('.');
    if (!MEMBER_ROOTS.includes(seg[0])) return null;
    const m = /^q(\d+)$/.exec(seg[1] || '');
    return m ? { id: 'b' + Math.floor(Number(m[1]) / BLOCK), root: seg[0], seg } : null;
}

/** Tách patch ghi doc thành viên: phần khóa-theo-câu → doc khối; `whole` = các map ghi nguyên cả cục ('answers: {}' khi làm lại phiên). */
export function splitMemberPatch(patch) {
    const base = {}, shards = {}, whole = [];
    for (const [k, v] of Object.entries(patch || {})) {
        const s = memberShardOfPath(k);
        if (s) (shards[s.id] ||= {})[k] = v;
        else { base[k] = v; if (MEMBER_ROOTS.includes(k)) whole.push(k); }
    }
    return { base, shards, whole };
}

/** Gộp doc thành viên với các doc khối CÙNG phiên của người đó. */
export function mergeMember(base, docs, sid) {
    return mergeRoots(base, (docs || []).filter(d => d && d.sid === sid), MEMBER_ROOTS);
}

/** Nhóm các doc khối theo uid (chỉ doc đúng phiên). */
export function groupMemberShards(docMap, sid) {
    const by = new Map();
    for (const d of Object.values(docMap || {})) {
        if (!d || d.sid !== sid || !d.uid) continue;
        if (!by.has(d.uid)) by.set(d.uid, []);
        by.get(d.uid).push(d);
    }
    return by;
}
