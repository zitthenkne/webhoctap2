// features/quiz/quiz-study-store.js
//
// Kho lưu trữ "dữ liệu học tập cá nhân" của một bộ đề: ghi chú cá nhân,
// đánh dấu (kèm lý do) và các đoạn đã bôi vàng/đậm/nghiêng (annotation).
//
// - Dưới localStorage (đồng bộ với quiz-page.js): mỗi loại là một map theo
//   nội dung câu hỏi:
//     quiz_notes_<id>  = { [qText]: noteText }
//     quiz_marks_<id>  = { [qText]: reasonKey }          // 'hard'|'doubt'|'interesting'|'review'
//     quiz_annot_<id>  = { [qText]: [ {scope,text,type} ] }
//
// - Trên Firestore: KHÔNG dùng map vì tên field (map key) không được chứa
//   '.', '/', '[', ']', '~', '*' — mà nội dung câu hỏi gần như luôn có. Vì vậy
//   lưu dưới dạng MẢNG object để an toàn:
//     quiz_study/{uid}__{quizId} = {
//        userId, quizId,
//        notes:       [ { q, text } ],
//        marks:       [ { q, reason } ],
//        annotations: [ { q, items:[{scope,text,type}] } ],
//        srs:         [ { q, n, ivl, due, lapses, last } ],  // lịch ôn ngắt quãng
//        annotDel:    [ { id, ts } ],   // "bia mộ" annotation đã xóa -> máy khác không gộp nó sống lại
//        updatedAt
//     }
//   Mỗi annotation mang `ts` (lần sửa cuối): hai máy cùng sửa một ghi chú cụm từ -> bản ts mới hơn thắng.
//
//   Từ 2026-11-10 ghi chú / đánh dấu / dấu tô lên cloud theo TỪNG BẢN GHI (map nx / mx / ax — xem "ĐỒNG BỘ TỪNG THAO TÁC"); ba mảng
//   trên chỉ còn là dữ liệu đời cũ được đọc làm nền. srs vẫn là mảng, kèm bản tóm tắt srsSum cho chuông ôn.
//   tiến trình làm dở: branches.<deviceId> (mỗi máy một nhánh) + inProgress = dấu "lượt đã nộp".
//
// LƯU Ý khi thêm loại dữ liệu mới: field mới phải đi qua ĐỦ readLocalStudy / writeLocalStudy / mapsToArrays /
// arraysToMaps / mergeStudy (hoặc flatStudy / cloudFlat nếu đồng bộ theo bản ghi) — thiếu một chỗ là chu trình pull→push xóa mất nó.

import { db } from '../../core/firebase-init.js';
import { srsKeys, mergeSrsMaps, readSrsMeta, summarizeSrs } from './quiz-srs-store.js';
import { hash64 } from './quiz-attempt.js';
import { makeCoalescer } from './quiz-coalesce.js';
import { doc, getDoc, serverTimestamp, deleteField } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
// Ghi không treo khi mất mạng (xem core/offline-write.js)
import { setDocQ as setDoc } from "../../core/offline-write.js";

// ----- Khóa localStorage -----
export function studyKeys(quizId) {
    const id = quizId || 'default_quiz';
    return {
        notes: `quiz_notes_${id}`,
        marks: `quiz_marks_${id}`,
        annot: `quiz_annot_${id}`,
        annotDel: `quiz_annot_del_${id}`,
        srs: srsKeys(id).map,
    };
}
// Ghi "bia mộ" cho các annotation vừa xóa (theo id) — bên hợp nhất sẽ bỏ chúng dù máy khác còn giữ
export function buryAnnots(data, items) {
    data.annotDel = data.annotDel || {};
    (items || []).forEach(it => { if (it && it.id) data.annotDel[it.id] = Date.now(); });
}

function readMap(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; }
    catch (e) { return {}; }
}
function writeMap(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj || {})); } catch (e) {}
}

// Đọc toàn bộ dữ liệu học tập cục bộ của một bộ đề (dạng map theo qText).
export function readLocalStudy(quizId) {
    const k = studyKeys(quizId);
    return {
        notes: readMap(k.notes),
        marks: readMap(k.marks),
        annotations: readMap(k.annot),
        annotDel: readMap(k.annotDel),
        srs: readMap(k.srs),
    };
}

// Ghi đè dữ liệu học tập cục bộ (dạng map theo qText). srs / annotDel chỉ ghi khi có mặt:
// bên gọi chỉ cầm notes/marks/annotations (trang Lịch sử cũ) không được xóa trắng lịch ôn + bia mộ.
export function writeLocalStudy(quizId, data) {
    const k = studyKeys(quizId);
    writeMap(k.notes, data.notes || {});
    writeMap(k.marks, data.marks || {});
    writeMap(k.annot, data.annotations || {});
    if (data.annotDel) writeMap(k.annotDel, data.annotDel);
    if (data.srs) writeMap(k.srs, data.srs);
}

// ----- Chuyển đổi map <-> mảng (cho Firestore) -----
function mapsToArrays(data) {
    const notes = Object.entries(data.notes || {})
        .filter(([, v]) => v && String(v).trim() !== '')
        .map(([q, text]) => ({ q, text }));
    const marks = Object.entries(data.marks || {})
        .filter(([, v]) => !!v)
        .map(([q, reason]) => ({ q, reason }));
    const annotations = Object.entries(data.annotations || {})
        .filter(([, v]) => Array.isArray(v) && v.length > 0)
        .map(([q, items]) => ({ q, items }));
    // due/last là ms epoch — KHÔNG dùng |0 (tràn 32-bit), ép qua Number.
    const srs = Object.entries(data.srs || {})
        .filter(([, v]) => !!v)
        .map(([q, e]) => ({
            q,
            n: Number(e.n) || 0,
            ivl: Number(e.ivl) || 0,
            due: Number(e.due) || 0,
            lapses: Number(e.lapses) || 0,
            last: Number(e.last) || 0,
        }));
    const annotDel = Object.entries(data.annotDel || {}).map(([id, ts]) => ({ id, ts: Number(ts) || 0 }));
    return { notes, marks, annotations, srs, annotDel };
}
function arraysToMaps(payload) {
    const notes = {};
    (payload.notes || []).forEach(n => { if (n && n.q != null) notes[n.q] = n.text; });
    const marks = {};
    (payload.marks || []).forEach(m => { if (m && m.q != null) marks[m.q] = m.reason; });
    const annotations = {};
    (payload.annotations || []).forEach(a => { if (a && a.q != null) annotations[a.q] = a.items || []; });
    const srs = {};
    (payload.srs || []).forEach(e => { // doc cũ không có srs → giữ {}
        if (e && e.q != null) srs[e.q] = { n: e.n, ivl: e.ivl, due: e.due, lapses: e.lapses, last: e.last };
    });
    const annotDel = {};
    (payload.annotDel || []).forEach(d => { if (d && d.id) annotDel[d.id] = Number(d.ts) || 0; });
    return { notes, marks, annotations, srs, annotDel };
}

// ----- Hợp nhất hai bộ dữ liệu (dạng map). preferCloud=true → khi cùng một câu
// có giá trị ở cả hai phía thì lấy phía cloud; ngược lại lấy phía local. -----
export function mergeStudy(localData, cloudData, preferCloud) {
    const base = preferCloud ? localData : cloudData;   // phía "thua" khi tranh chấp
    const top = preferCloud ? cloudData : localData;    // phía "thắng" khi tranh chấp

    const merged = { notes: {}, marks: {}, annotations: {} };

    // srs: không theo preferCloud toàn phần — từng câu lấy entry có `last` mới hơn.
    merged.srs = mergeSrsMaps(localData.srs || {}, cloudData.srs || {});

    // notes & marks: union, top thắng khi trùng khóa
    ['notes', 'marks'].forEach(kind => {
        const out = { ...(base[kind] || {}) };
        Object.entries(top[kind] || {}).forEach(([q, v]) => {
            if (v != null && String(v).trim() !== '') out[q] = v;
        });
        merged[kind] = out;
    });

    // bia mộ: hợp hai phía (giữ mốc mới hơn), bỏ cái quá 120 ngày cho doc khỏi phình
    const del = { ...(localData.annotDel || {}) };
    Object.entries(cloudData.annotDel || {}).forEach(([id, ts]) => { if (!(del[id] >= ts)) del[id] = ts; });
    const cutoff = Date.now() - 120 * 864e5;
    Object.keys(del).forEach(id => { if (!(del[id] > cutoff)) delete del[id]; });
    merged.annotDel = del;

    // annotations: union theo từng câu, trừ cái đã có bia mộ. Khóa = vị trí (scope|type|start|end) — cùng luật trùng của addAnnot;
    // dữ liệu cũ không offset thì (scope|text|type). Cùng khóa: ts mới hơn thắng (sửa ghi chú ở máy kia), hòa thì "top".
    const aKeys = new Set([
        ...Object.keys(base.annotations || {}),
        ...Object.keys(top.annotations || {}),
    ]);
    aKeys.forEach(q => {
        const byKey = new Map();
        [...(base.annotations?.[q] || []), ...(top.annotations?.[q] || [])].forEach(it => {
            if (!it || (it.id && del[it.id])) return;
            const k = typeof it.start === 'number' ? `${it.scope}|${it.type}|${it.start}|${it.end}` : `${it.scope}|${it.text}|${it.type}`;
            const cur = byKey.get(k);
            if (!cur || (Number(it.ts) || 0) >= (Number(cur.ts) || 0)) byKey.set(k, it);
        });
        if (byKey.size) merged.annotations[q] = [...byKey.values()];
    });

    return merged;
}

// ----- Firestore -----
export function studyDocId(uid, quizId) {
    return `${uid}__${quizId}`;
}

// ----- Giảm lượt đọc / ghi Firestore (2026-10-06) -----
// 1) Mở một bộ đề: kéo ghi chú (fetchCloudStudy) rồi tới tiến trình dở (fetchCloudProgress) — CÙNG một tài liệu
//    quiz_study/{uid}__{quizId} nên trước đây đọc 2 lần (tính 2 lượt đọc). Giờ dùng chung một lần đọc trong 15 giây;
//    mọi lần GHI xóa bộ nhớ đệm này để lần đọc sau luôn thấy dữ liệu mới.
const _docCache = new Map();   // docId -> { p: Promise<DocumentSnapshot>, at }
const DOC_TTL = 15000;
function getStudyDoc(uid, quizId) {
    const id = studyDocId(uid, quizId);
    const hit = _docCache.get(id);
    if (hit && Date.now() - hit.at < DOC_TTL) return hit.p;
    const p = getDoc(doc(db, 'quiz_study', id));
    _docCache.set(id, { p, at: Date.now() });
    p.catch(() => { if (_docCache.get(id) && _docCache.get(id).p === p) _docCache.delete(id); });   // lỗi thì lần sau đọc lại
    return p;
}
const dropStudyDoc = (uid, quizId) => _docCache.delete(studyDocId(uid, quizId));

// 2) Chữ ký nội dung lần ghi/đọc gần nhất: dữ liệu y hệt thì KHÔNG ghi lại (trước đây mỗi lần mở đề đều ghi lại bản
//    vừa kéo về, dù không có gì đổi). Sắp xếp để thứ tự mảng khác nhau không làm lệch chữ ký.
const _studySig = new Map();   // docId -> chữ ký lịch ôn + bia mộ + meta đã có trên cloud (ghi chú / đánh dấu / dấu tô: so bản gốc — xem dưới)
const _progSig = new Map();    // docId/thiết bị -> chữ ký nhánh tiến trình dở đã có trên cloud (bỏ savedAt)
function progSig(p) { const { savedAt, seq, ...rest } = p || {}; return JSON.stringify(rest); }

// ----- ĐỒNG BỘ TỪNG THAO TÁC ghi chú / đánh dấu / dấu tô (2026-11-10) -----
// Trước đây mỗi lần đẩy là gửi lại CẢ mảng notes / marks / annotations, và hợp nhất kiểu "hợp hai phía": máy A xóa ghi chú X lúc offline,
// máy B sửa ghi chú Y — A có mạng lại kéo về thấy X vẫn ở cloud nên X SỐNG LẠI. Nay:
//   - Trên cloud mỗi bản ghi là MỘT khóa trong map: nx.<khóa câu> = { q, t|null, ts } (ghi chú), mx.<…> = { q, r|null, ts } (đánh dấu),
//     ax.<khóa dấu tô> = { q, it|null, ts } (khóa = id dấu tô, đời cũ theo vị trí). null = đã xóa (dấu xóa). setDoc merge chỉ ghi các khóa
//     vừa đổi → mỗi lần đẩy là một cụm nhỏ, hai máy sửa / xóa hai bản ghi khác nhau không đè nhau.
//   - Máy nhớ "bản gốc" = cloud có gì ở lần đồng bộ trước (quiz_study_base_<id>). Đẩy = khác biệt máy ↔ bản gốc. Kéo = hợp nhất 3 chiều:
//     bên nào khác bản gốc thì bên đó vừa đổi; cả hai cùng đổi một bản ghi → preferCloud quyết (sửa thắng xóa để không mất chữ).
//   - Mảng notes / marks / annotations đời cũ vẫn đọc làm nền (máy chạy bản cũ còn ghi vào đó); lần đẩy đầu chuyển hẳn sang map rồi gỡ mảng.
const opKey = (s) => 'k' + hash64(String(s)).slice(0, 12);
const annKeyOf = (q, it) => opKey(it && it.id ? 'id:' + it.id
    : q + '|' + (typeof it.start === 'number' ? `${it.scope}|${it.type}|${it.start}|${it.end}` : `${it.scope}|${it.text}|${it.type}`));
const baseKey = (quizId) => `quiz_study_base_${quizId || 'default_quiz'}`;
const SECTIONS = [['n', 'nx', 't'], ['m', 'mx', 'r'], ['a', 'ax', 'it']];   // [mục phẳng, trường cloud, tên giá trị]

/** Map theo qText → dạng phẳng { n:{khóa:{q,t}}, m:{khóa:{q,r}}, a:{khóa:{q,it}} }. */
export function flatStudy(data) {
    const f = { n: {}, m: {}, a: {} };
    Object.entries(data.notes || {}).forEach(([q, t]) => { if (t != null && String(t).trim() !== '') f.n[opKey(q)] = { q, t }; });
    Object.entries(data.marks || {}).forEach(([q, r]) => { if (r) f.m[opKey(q)] = { q, r }; });
    Object.entries(data.annotations || {}).forEach(([q, items]) => (Array.isArray(items) ? items : []).forEach(it => {
        if (it) f.a[annKeyOf(q, it)] = { q, it };
    }));
    return f;
}
function unflatStudy(f) {
    const notes = {}, marks = {}, annotations = {};
    Object.values(f.n).forEach(({ q, t }) => { notes[q] = t; });
    Object.values(f.m).forEach(({ q, r }) => { marks[q] = r; });
    Object.values(f.a).forEach(({ q, it }) => { (annotations[q] = annotations[q] || []).push(it); });
    return { notes, marks, annotations };
}
/** Doc quiz_study → dạng phẳng: mảng đời cũ làm nền, map thao tác (nx/mx/ax) đè lên, dấu xóa annotDel bỏ dấu tô. */
function cloudFlat(d) {
    const legacy = arraysToMaps(d);
    const f = flatStudy(legacy);
    SECTIONS.forEach(([s, field, val]) => {
        Object.entries(d[field] || {}).forEach(([k, e]) => {
            if (!e || typeof e !== 'object') return;
            if (e[val] == null || e[val] === '') delete f[s][k];
            else f[s][k] = { q: e.q, [val]: e[val] };
        });
    });
    Object.keys(f.a).forEach(k => { const id = f.a[k].it && f.a[k].it.id; if (id && legacy.annotDel[id]) delete f.a[k]; });
    return f;
}
/** Doc quiz_study bất kỳ → { notes, marks, annotations, srs, annotDel } dạng map (trang Thống kê đọc thẳng doc cũng dùng). */
export function decodeStudyDoc(d) {
    const legacy = arraysToMaps(d || {});
    return { ...unflatStudy(cloudFlat(d || {})), srs: legacy.srs, annotDel: legacy.annotDel };
}
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** Hợp nhất 3 chiều trên dạng phẳng. */
export function merge3(base, local, cloud, preferCloud = false) {
    const out = { n: {}, m: {}, a: {} };
    ['n', 'm', 'a'].forEach(s => {
        new Set([...Object.keys(base[s] || {}), ...Object.keys(local[s] || {}), ...Object.keys(cloud[s] || {})]).forEach(k => {
            const b = (base[s] || {})[k], l = (local[s] || {})[k], c = (cloud[s] || {})[k];
            let v;
            if (same(l, b)) v = c;                 // máy không đổi → theo cloud (cloud sửa / xóa đều nhận)
            else if (same(c, b)) v = l;            // cloud không đổi → theo máy
            else if (s === 'a' && l && c) v = (Number(c.it.ts) || 0) > (Number(l.it.ts) || 0) || (preferCloud && Number(c.it.ts) === Number(l.it.ts)) ? c : l;
            else { v = preferCloud ? c : l; if (v === undefined) v = preferCloud ? l : c; }   // cả hai đổi: sửa thắng xóa
            if (v !== undefined) out[s][k] = v;
        });
    });
    return out;
}
function readBase(quizId) {
    try { const v = JSON.parse(localStorage.getItem(baseKey(quizId)) || 'null'); return v && v.n && v.m && v.a ? v : null; }
    catch (e) { return null; }
}
function writeBase(quizId, f) { try { localStorage.setItem(baseKey(quizId), JSON.stringify(f)); } catch (e) {} }
const _hasLegacy = new Map();   // docId -> doc còn mảng đời cũ (lần đẩy kế tiếp chuyển hẳn sang map)

// Tải dữ liệu học tập từ cloud (đã chuyển về dạng map). Trả về null nếu chưa có. `_flat` (không liệt kê) = dạng phẳng cho hợp nhất 3 chiều.
export async function fetchCloudStudy(uid, quizId) {
    if (!uid || !quizId) return null;
    try {
        const snap = await getStudyDoc(uid, quizId);
        if (!snap.exists()) return null;
        const d = snap.data() || {};
        const id = studyDocId(uid, quizId);
        _hasLegacy.set(id, ['notes', 'marks', 'annotations'].some(k => Array.isArray(d[k]) && d[k].length));
        _studySig.set(id, srsSig(mapsToArrays(arraysToMaps(d)).srs, mapsToArrays(arraysToMaps(d)).annotDel,
            { title: d.srsTitle, total: d.srsTotal, paused: d.srsPaused, pausedAt: d.srsPausedAt }));
        const out = decodeStudyDoc(d);
        Object.defineProperty(out, '_flat', { value: cloudFlat(d), enumerable: false });
        return out;
    } catch (e) {
        console.warn('Không tải được dữ liệu học tập từ cloud:', e);
        return null;
    }
}
function srsSig(srs, annotDel, meta) {
    return JSON.stringify([
        (srs || []).slice().sort((x, y) => String(x.q).localeCompare(String(y.q))),
        (annotDel || []).map(x => x.id + ':' + x.ts).sort(),
        meta.title || '', meta.total | 0, !!meta.paused, Number(meta.pausedAt) || 0
    ]);
}

// Đẩy dữ liệu học tập (dạng map) lên cloud: CHỈ các bản ghi khác bản gốc (+ lịch ôn nếu đổi). Bỏ qua nếu chưa đăng nhập.
export async function pushCloudStudy(uid, quizId, data) {
    if (!uid || !quizId) return false;
    try {
        const id = studyDocId(uid, quizId);
        const ref = doc(db, 'quiz_study', id);
        const local = flatStudy(data);
        const base = readBase(quizId) || { n: {}, m: {}, a: {} };
        const migrate = _hasLegacy.get(id) === true;
        const ts = Date.now();
        const ops = {};
        SECTIONS.forEach(([s, field, val]) => {
            const out = {};
            new Set([...Object.keys(local[s]), ...Object.keys(base[s])]).forEach(k => {
                const l = local[s][k], b = base[s][k];
                if (!migrate && same(l, b)) return;
                out[k] = l ? { q: l.q, [val]: l[val], ts } : { q: b.q, [val]: null, ts };
            });
            if (Object.keys(out).length) ops[field] = out;
        });
        const arrays = mapsToArrays(data);
        // Kèm tên/số câu của bộ đề (từ meta SRS cục bộ) để chuông thông báo trên
        // index đọc thẳng từ cloud được — máy mới chưa từng mở bộ đề vẫn hiện đúng.
        const meta = readSrsMeta(quizId);
        const withSrs = !!data.srs;      // bên gọi chỉ cầm ghi chú (trang Lịch sử cũ) không được xóa trắng lịch ôn
        const sig = srsSig(withSrs ? arrays.srs : null, arrays.annotDel, meta);
        const srsChanged = withSrs && _studySig.get(id) !== sig;
        if (!Object.keys(ops).length && !srsChanged && !migrate) return true;   // không có gì mới: khỏi ghi
        await setDoc(ref, {
            userId: uid,
            quizId,
            ...ops,
            ...(migrate ? { notes: deleteField(), marks: deleteField(), annotations: deleteField() } : {}),
            ...(srsChanged ? {
                srs: arrays.srs,
                srsSum: summarizeSrs(data.srs),        // bản tóm tắt cho chuông ôn (quiz-srs-bell.js) — không phải kéo cả mảng srs
                annotDel: arrays.annotDel,
                srsTitle: meta.title || '',
                srsTotal: meta.total | 0,
                // Trạng thái tạm dừng ôn ngắt quãng — scalar last-write-wins theo
                // pausedAt; máy khác adopt trong syncSrsFromCloud (quiz-srs-bell.js)
                srsPaused: !!meta.paused,
                srsPausedAt: Number(meta.pausedAt) || 0,
            } : {}),
            updatedAt: serverTimestamp(),
        }, { merge: true });
        if (srsChanged) _studySig.set(id, sig);
        _hasLegacy.set(id, false);
        writeBase(quizId, local);
        dropStudyDoc(uid, quizId);
        return true;
    } catch (e) {
        console.warn('Không lưu được dữ liệu học tập lên cloud:', e);
        return false;
    }
}

// ----- Tiến trình bài làm dở trên Cloud (đồng bộ giữa các thiết bị) -----
// HAI NHÁNH OFFLINE, MỘT LƯỢT NỘP (2026-11-10): Firestore gộp ghi trên cùng tài liệu theo lượt ghi SAU CÙNG — trước đây một trường
// `inProgress` chung nên iPad và điện thoại cùng làm offline rồi có mạng lại thì máy nào gửi sau xóa sạch câu trả lời của máy kia (và "sau"
// tính theo đồng hồ từng máy — lệch giờ là chọn sai). Nay mỗi MÁY một nhánh `branches.<deviceId>` (setDoc merge chỉ ghi đúng khóa đó →
// hai máy không đè nhau dù kết nối lại theo thứ tự nào). Nhánh mang attemptId của lượt; so nhánh theo NỘI DUNG câu trả lời
// (quiz-attempt.js firstDivergence), không theo giờ máy. `inProgress` chỉ còn là dấu "lượt <attemptId> đã nộp / đã bỏ".

/** Đẩy nhánh tiến trình của MÁY NÀY lên cloud. Payload nhẹ không chứa mảng questions. */
export async function pushCloudProgress(uid, quizId, progressObj) {
    if (!uid || !quizId || !progressObj) return false;
    try {
        const id = studyDocId(uid, quizId);
        const ref = doc(db, 'quiz_study', id);
        const clean = { ...progressObj };
        delete clean.questions; // Đã có questionBlueprint, bỏ questions để payload luôn < 5KB
        const dev = String(clean.deviceId || 'unknown').replace(/[^\w-]/g, '').slice(0, 40) || 'unknown';
        const sig = progSig(clean);
        if (_progSig.get(id + '/' + dev) === sig) return true;   // y hệt nhánh đã có trên cloud (chỉ khác savedAt / seq): khỏi ghi
        // mergeFields: THAY nguyên nhánh của máy này (merge thường gộp sâu map con → câu vừa bỏ đánh dấu / bỏ gạch vẫn còn trên cloud),
        // không đụng nhánh máy khác hay ghi chú / lịch ôn cùng doc
        await setDoc(ref, {
            userId: uid,
            quizId,
            branches: { [dev]: clean },
            updatedAt: serverTimestamp(),
        }, { mergeFields: ['userId', 'quizId', `branches.${dev}`, 'updatedAt'] });
        _progSig.set(id + '/' + dev, sig);
        dropStudyDoc(uid, quizId);
        return true;
    } catch (e) {
        console.warn('Không lưu được tiến trình làm bài lên cloud:', e);
        return false;
    }
}

/** Đánh dấu lượt `attemptId` đã kết thúc (nộp / bỏ) trên cloud và gỡ các nhánh CỦA LƯỢT ĐÓ — máy khác đang làm lượt khác giữ nguyên. */
const _lastBranches = new Map();   // docId -> branches đọc được lần gần nhất
export async function clearCloudProgress(uid, quizId, attemptId = null) {
    if (!uid || !quizId) return false;
    try {
        const id = studyDocId(uid, quizId);
        const ref = doc(db, 'quiz_study', id);
        const known = _lastBranches.get(id) || {};
        const drop = {};
        Object.entries(known).forEach(([dev, b]) => { if (!attemptId || !b || b.attemptId === attemptId) drop[dev] = deleteField(); });
        const own = deviceIdOf();
        if (own) drop[own] = deleteField();
        // Kèm userId/quizId: nếu doc chưa tồn tại (nộp bài nhanh hơn nhịp gom 30s nên chưa từng đẩy tiến trình) thì đây là lệnh TẠO,
        // luật yêu cầu đủ hai trường này — thiếu thì bị từ chối (và nay lỗi từ chối còn hiện toast qua queued()).
        await setDoc(ref, {
            userId: uid,
            quizId,
            inProgress: { finished: true, attemptId: attemptId || null, savedAt: Date.now() },
            ...(Object.keys(drop).length ? { branches: drop } : {}),
            updatedAt: serverTimestamp(),
        }, { merge: true });
        [..._progSig.keys()].forEach(k => { if (k.startsWith(id + '/')) _progSig.delete(k); });   // lần làm bài sau chắc chắn khác
        dropStudyDoc(uid, quizId);
        return true;
    } catch (e) {
        return false;
    }
}
const deviceIdOf = () => { try { return localStorage.getItem('deviceId') || ''; } catch (e) { return ''; } };

/**
 * Tải tiến trình làm dở từ cloud. Trả về null (chưa có) hoặc
 * { finished: {attemptId, savedAt}|null, branches: { deviceId: nhánh }, legacy: tiến trình kiểu cũ (một trường inProgress)|null }.
 */
export async function fetchCloudProgress(uid, quizId) {
    if (!uid || !quizId) return null;
    try {
        const snap = await getStudyDoc(uid, quizId);
        if (!snap.exists()) return null;
        const d = snap.data() || {};
        const id = studyDocId(uid, quizId);
        const branches = (d.branches && typeof d.branches === 'object') ? d.branches : {};
        _lastBranches.set(id, branches);
        Object.entries(branches).forEach(([dev, b]) => _progSig.set(id + '/' + dev, progSig(b)));
        const ip = d.inProgress || null;
        return { finished: ip && ip.finished ? ip : null, branches, legacy: ip && !ip.finished ? ip : null };
    } catch (e) {
        console.warn('Không tải được tiến trình làm bài từ cloud:', e);
        return null;
    }
}

// ----- Đẩy tiến trình cloud có giảm tần suất (gom lần ghi — quiz-coalesce.js) -----
// Bản C5: trước đây chờ 5s sau lần đổi cuối → làm một bộ 100 câu, mỗi câu cách nhau >5s là ≈100 lần ghi `quiz_study` (mỗi lần 2–20 KB).
// Nay chờ 30s sau lần đổi cuối nhưng không quá 120s kể từ lần đổi đầu của đợt (≈ 1 lần ghi / 2 phút khi làm liên tục); vẫn flush NGAY khi ẩn tab /
// rời trang / nộp bài (xem flushAllPending bên dưới). Tiến trình trong máy luôn được ghi tức thì (localStorage) — cloud chỉ để tiếp tục ở máy khác.
const PROGRESS_DELAY = 30000, PROGRESS_MAX_WAIT = 120000;
const _progress = new Map();   // key -> { co, uid, quizId, fn }
export function scheduleCloudProgressPush(uid, quizId, getProgressFn, delay = PROGRESS_DELAY) {
    if (!uid || !quizId) return;
    const key = studyDocId(uid, quizId);
    let e = _progress.get(key);
    if (!e) {
        e = { uid, quizId, fn: null, co: null };
        e.co = makeCoalescer(() => {
            const progress = typeof e.fn === 'function' ? e.fn() : e.fn;
            if (progress && !progress.finished) pushCloudProgress(e.uid, e.quizId, progress);
        }, { delay: PROGRESS_DELAY, maxWait: PROGRESS_MAX_WAIT });
        _progress.set(key, e);
    }
    e.fn = getProgressFn;
    e.co.call(delay);
}

export function flushCloudProgressPush(uid, quizId, getProgressFn) {
    if (!uid || !quizId) return;
    const key = studyDocId(uid, quizId);
    _progress.get(key)?.co.cancel();
    const progress = typeof getProgressFn === 'function' ? getProgressFn() : getProgressFn;
    if (progress && !progress.finished) {
        pushCloudProgress(uid, quizId, progress);
    }
}

// Tải cloud (nếu có) rồi hợp nhất vào local. preferCloud quyết định bên nào
// thắng khi tranh chấp. Trả về dữ liệu đã hợp nhất (map) hoặc local nếu offline.
export async function syncPullStudy(uid, quizId, { preferCloud = false } = {}) {
    if (!uid) return readLocalStudy(quizId);
    const cloud = await fetchCloudStudy(uid, quizId);
    // Người học có thể vừa lưu ghi chú / màu trong lúc chờ mạng: hợp nhất bản local mới nhất.
    const local = readLocalStudy(quizId);
    if (!cloud) return local;
    const base = readBase(quizId);
    let merged;
    if (base && cloud._flat) {
        // Hợp nhất 3 chiều theo từng bản ghi (xem đầu mục "ĐỒNG BỘ TỪNG THAO TÁC"); lịch ôn + bia mộ vẫn như cũ
        const legacy = mergeStudy(local, cloud, preferCloud);
        merged = { ...unflatStudy(merge3(base, flatStudy(local), cloud._flat, preferCloud)), srs: legacy.srs, annotDel: legacy.annotDel };
    } else {
        merged = mergeStudy(local, cloud, preferCloud);   // máy chưa từng đồng bộ: chưa có bản gốc → hợp hai phía như trước
    }
    writeLocalStudy(quizId, merged);
    if (cloud._flat) writeBase(quizId, cloud._flat);       // bản gốc = cloud vừa đọc; lần đẩy sau gửi đúng phần máy khác cloud
    return merged;
}

// ----- Đẩy cloud có giảm tần suất — dùng trong lúc làm bài -----
// Bản C5: mỗi câu ôn ngắt quãng (SRS) / mỗi lần sửa ghi chú từng là MỘT lần ghi CẢ doc quiz_study (mọi ghi chú + đánh dấu + bôi vàng + lịch ôn, hàng chục KB)
// sau 1,5s. Nay chờ 8s sau lần đổi cuối, không quá 60s kể từ lần đổi đầu của đợt; flush ngay khi ẩn tab / rời trang.
const STUDY_DELAY = 8000, STUDY_MAX_WAIT = 60000;
const _study = new Map();   // key -> { co }
export function scheduleCloudPush(uid, quizId, delay = STUDY_DELAY) {
    if (!uid || !quizId) return;
    const key = studyDocId(uid, quizId);
    let e = _study.get(key);
    if (!e) {
        e = { co: makeCoalescer(() => { pushCloudStudy(uid, quizId, readLocalStudy(quizId)); }, { delay: STUDY_DELAY, maxWait: STUDY_MAX_WAIT }) };
        _study.set(key, e);
    }
    e.co.call(delay);
}

// Ẩn tab / rời trang / đóng ứng dụng: đẩy NGAY mọi lần ghi đang chờ (Firestore xếp hàng ghi trong IndexedDB nên lần mở sau vẫn gửi nốt nếu trang đóng giữa chừng).
function flushAllPending() {
    _study.forEach((e) => e.co.flush());
    _progress.forEach((e) => e.co.flush());
}
if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAllPending(); });
    window.addEventListener('pagehide', flushAllPending);
    // Đổi danh tính trên máy (core/scope.js): lượt đẩy đang chờ của người cũ sẽ đọc localStorage — lúc đó đã là dữ liệu người MỚI → HỦY,
    // không gửi. Dữ liệu + bản gốc của người cũ nằm trong ngăn cất; họ đăng nhập lại thì lần đồng bộ đầu gửi nốt đúng tài khoản của họ.
    window.addEventListener('scope:changed', () => {
        _study.forEach((e) => e.co.cancel());
        _progress.forEach((e) => e.co.cancel());
        _study.clear(); _progress.clear();
        _docCache.clear(); _studySig.clear(); _progSig.clear(); _hasLegacy.clear(); _lastBranches.clear();
    });
}

