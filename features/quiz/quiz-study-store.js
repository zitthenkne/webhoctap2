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
//        updatedAt
//     }
//
// LƯU Ý khi thêm loại dữ liệu mới: pushCloudStudy setDoc GHI ĐÈ TOÀN DOC, nên
// field mới phải đi qua ĐỦ readLocalStudy / writeLocalStudy / mapsToArrays /
// arraysToMaps / mergeStudy — thiếu một chỗ là chu trình pull→push xóa mất nó.

import { db } from '../../core/firebase-init.js';
import { srsKeys, mergeSrsMaps, readSrsMeta } from './quiz-srs-store.js';
import { doc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
// Ghi không treo khi mất mạng (xem core/offline-write.js)
import { setDocQ as setDoc } from "../../core/offline-write.js";

// ----- Khóa localStorage -----
export function studyKeys(quizId) {
    const id = quizId || 'default_quiz';
    return {
        notes: `quiz_notes_${id}`,
        marks: `quiz_marks_${id}`,
        annot: `quiz_annot_${id}`,
        srs: srsKeys(id).map,
    };
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
        srs: readMap(k.srs),
    };
}

// Ghi đè dữ liệu học tập cục bộ (dạng map theo qText).
export function writeLocalStudy(quizId, data) {
    const k = studyKeys(quizId);
    writeMap(k.notes, data.notes || {});
    writeMap(k.marks, data.marks || {});
    writeMap(k.annot, data.annotations || {});
    writeMap(k.srs, data.srs || {});
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
    return { notes, marks, annotations, srs };
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
    return { notes, marks, annotations, srs };
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

    // annotations: union theo từng câu, gộp các đoạn theo (scope|text|type)
    const aKeys = new Set([
        ...Object.keys(base.annotations || {}),
        ...Object.keys(top.annotations || {}),
    ]);
    aKeys.forEach(q => {
        // Map theo (scope|text|type): bản "top" ghi đè bản "base" cùng khóa -> sửa nội dung ghi chú (note) không bị bản cũ nuốt
        const bySig = new Map();
        [...(base.annotations?.[q] || []), ...(top.annotations?.[q] || [])].forEach(it => {
            if (!it) return;
            bySig.set(`${it.scope}|${it.text}|${it.type}`, it);
        });
        if (bySig.size) merged.annotations[q] = [...bySig.values()];
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
const _studySig = new Map();   // docId -> chữ ký ghi chú/đánh dấu/annotation/srs đã có trên cloud
const _progSig = new Map();    // docId -> chữ ký tiến trình dở đã có trên cloud (bỏ savedAt)
function studySig(a, meta) {
    const by = (arr, f) => (arr || []).map(f).sort((x, y) => String(x.q).localeCompare(String(y.q)));
    return JSON.stringify([
        by(a.notes, x => x), by(a.marks, x => x),
        by(a.annotations, x => ({ q: x.q, items: (x.items || []).map(i => JSON.stringify(i)).sort() })),
        by(a.srs, x => x),
        meta.title || '', meta.total | 0, !!meta.paused, Number(meta.pausedAt) || 0
    ]);
}
function progSig(p) { const { savedAt, ...rest } = p || {}; return JSON.stringify(rest); }

// Tải dữ liệu học tập từ cloud (đã chuyển về dạng map). Trả về null nếu chưa có.
export async function fetchCloudStudy(uid, quizId) {
    if (!uid || !quizId) return null;
    try {
        const snap = await getStudyDoc(uid, quizId);
        if (!snap.exists()) return null;
        const d = snap.data() || {};
        _studySig.set(studyDocId(uid, quizId), studySig(mapsToArrays(arraysToMaps(d)),
            { title: d.srsTitle, total: d.srsTotal, paused: d.srsPaused, pausedAt: d.srsPausedAt }));
        return arraysToMaps(d);
    } catch (e) {
        console.warn('Không tải được dữ liệu học tập từ cloud:', e);
        return null;
    }
}

// Đẩy dữ liệu học tập (dạng map) lên cloud. Bỏ qua nếu chưa đăng nhập.
export async function pushCloudStudy(uid, quizId, data) {
    if (!uid || !quizId) return false;
    try {
        const id = studyDocId(uid, quizId);
        const ref = doc(db, 'quiz_study', id);
        const arrays = mapsToArrays(data);
        // Kèm tên/số câu của bộ đề (từ meta SRS cục bộ) để chuông thông báo trên
        // index đọc thẳng từ cloud được — máy mới chưa từng mở bộ đề vẫn hiện đúng.
        const meta = readSrsMeta(quizId);
        const sig = studySig(arrays, meta);
        if (_studySig.get(id) === sig) return true;   // y hệt bản đang có trên cloud: khỏi ghi
        await setDoc(ref, {
            userId: uid,
            quizId,
            ...arrays,
            srsTitle: meta.title || '',
            srsTotal: meta.total | 0,
            // Trạng thái tạm dừng ôn ngắt quãng — scalar last-write-wins theo
            // pausedAt; máy khác adopt trong syncSrsFromCloud (quiz-srs-bell.js)
            srsPaused: !!meta.paused,
            srsPausedAt: Number(meta.pausedAt) || 0,
            updatedAt: serverTimestamp(),
        }, { merge: true });
        _studySig.set(id, sig);
        dropStudyDoc(uid, quizId);
        return true;
    } catch (e) {
        console.warn('Không lưu được dữ liệu học tập lên cloud:', e);
        return false;
    }
}

// ----- Tiến trình bài làm dở trên Cloud (đồng bộ giữa các thiết bị) -----

/** Đẩy tiến trình làm bài dở lên cloud (Firestore). Payload nhẹ không chứa mảng questions. */
export async function pushCloudProgress(uid, quizId, progressObj) {
    if (!uid || !quizId || !progressObj) return false;
    try {
        const id = studyDocId(uid, quizId);
        const ref = doc(db, 'quiz_study', id);
        const clean = { ...progressObj };
        delete clean.questions; // Đã có questionBlueprint, bỏ questions để payload luôn < 5KB
        const sig = progSig(clean);
        if (_progSig.get(id) === sig) return true;   // y hệt tiến trình đã có trên cloud (chỉ khác savedAt): khỏi ghi
        await setDoc(ref, {
            userId: uid,
            quizId,
            inProgress: clean,
            updatedAt: serverTimestamp(),
        }, { merge: true });
        _progSig.set(id, sig);
        dropStudyDoc(uid, quizId);
        return true;
    } catch (e) {
        console.warn('Không lưu được tiến trình làm bài lên cloud:', e);
        return false;
    }
}

/** Đánh dấu phiên làm bài đã kết thúc trên cloud để thiết bị khác không báo làm dở nữa. */
export async function clearCloudProgress(uid, quizId) {
    if (!uid || !quizId) return false;
    try {
        const id = studyDocId(uid, quizId);
        const ref = doc(db, 'quiz_study', id);
        await setDoc(ref, {
            inProgress: { finished: true, savedAt: Date.now() },
            updatedAt: serverTimestamp(),
        }, { merge: true });
        _progSig.delete(id);   // lần làm bài sau chắc chắn khác bản "đã nộp"
        dropStudyDoc(uid, quizId);
        return true;
    } catch (e) {
        return false;
    }
}

/** Tải tiến trình làm bài dở từ cloud (Firestore). Trả về object hoặc null. */
export async function fetchCloudProgress(uid, quizId) {
    if (!uid || !quizId) return null;
    try {
        const snap = await getStudyDoc(uid, quizId);
        if (!snap.exists()) return null;
        const d = snap.data();
        if (d && d.inProgress) _progSig.set(studyDocId(uid, quizId), progSig(d.inProgress));
        return (d && d.inProgress) ? d.inProgress : null;
    } catch (e) {
        console.warn('Không tải được tiến trình làm bài từ cloud:', e);
        return null;
    }
}

// ----- Đẩy tiến trình cloud có giảm tần suất (debounce) -----
const _progressTimers = {};
// 5 giây (trước 1,2s): mỗi lần đổi câu từng là MỘT lần ghi Firestore; giờ gom lại, còn flush khi ẩn tab / rời trang.
export function scheduleCloudProgressPush(uid, quizId, getProgressFn, delay = 5000) {
    if (!uid || !quizId) return;
    const key = studyDocId(uid, quizId);
    clearTimeout(_progressTimers[key]);
    _progressTimers[key] = setTimeout(() => {
        const progress = typeof getProgressFn === 'function' ? getProgressFn() : getProgressFn;
        if (progress && !progress.finished) {
            pushCloudProgress(uid, quizId, progress);
        }
    }, delay);
}

export function flushCloudProgressPush(uid, quizId, getProgressFn) {
    if (!uid || !quizId) return;
    const key = studyDocId(uid, quizId);
    clearTimeout(_progressTimers[key]);
    const progress = typeof getProgressFn === 'function' ? getProgressFn() : getProgressFn;
    if (progress && !progress.finished) {
        pushCloudProgress(uid, quizId, progress);
    }
}

// Tải cloud (nếu có) rồi hợp nhất vào local. preferCloud quyết định bên nào
// thắng khi tranh chấp. Trả về dữ liệu đã hợp nhất (map) hoặc local nếu offline.
export async function syncPullStudy(uid, quizId, { preferCloud = false } = {}) {
    const local = readLocalStudy(quizId);
    if (!uid) return local;
    const cloud = await fetchCloudStudy(uid, quizId);
    if (!cloud) return local;
    const merged = mergeStudy(local, cloud, preferCloud);
    writeLocalStudy(quizId, merged);
    return merged;
}

// ----- Đẩy cloud có giảm tần suất (debounce) — dùng trong lúc làm bài -----
const _pushTimers = {};
export function scheduleCloudPush(uid, quizId, delay = 1500) {
    if (!uid || !quizId) return;
    const key = studyDocId(uid, quizId);
    clearTimeout(_pushTimers[key]);
    _pushTimers[key] = setTimeout(() => {
        pushCloudStudy(uid, quizId, readLocalStudy(quizId));
    }, delay);
}

