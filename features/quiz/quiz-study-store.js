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
//        updatedAt
//     }

import { db } from '../../core/firebase-init.js';
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";

// ----- Khóa localStorage -----
export function studyKeys(quizId) {
    const id = quizId || 'default_quiz';
    return {
        notes: `quiz_notes_${id}`,
        marks: `quiz_marks_${id}`,
        annot: `quiz_annot_${id}`,
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
    };
}

// Ghi đè dữ liệu học tập cục bộ (dạng map theo qText).
export function writeLocalStudy(quizId, data) {
    const k = studyKeys(quizId);
    writeMap(k.notes, data.notes || {});
    writeMap(k.marks, data.marks || {});
    writeMap(k.annot, data.annotations || {});
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
    return { notes, marks, annotations };
}
function arraysToMaps(payload) {
    const notes = {};
    (payload.notes || []).forEach(n => { if (n && n.q != null) notes[n.q] = n.text; });
    const marks = {};
    (payload.marks || []).forEach(m => { if (m && m.q != null) marks[m.q] = m.reason; });
    const annotations = {};
    (payload.annotations || []).forEach(a => { if (a && a.q != null) annotations[a.q] = a.items || []; });
    return { notes, marks, annotations };
}

// ----- Hợp nhất hai bộ dữ liệu (dạng map). preferCloud=true → khi cùng một câu
// có giá trị ở cả hai phía thì lấy phía cloud; ngược lại lấy phía local. -----
export function mergeStudy(localData, cloudData, preferCloud) {
    const base = preferCloud ? localData : cloudData;   // phía "thua" khi tranh chấp
    const top = preferCloud ? cloudData : localData;    // phía "thắng" khi tranh chấp

    const merged = { notes: {}, marks: {}, annotations: {} };

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
        const seen = new Set();
        const list = [];
        [...(base.annotations?.[q] || []), ...(top.annotations?.[q] || [])].forEach(it => {
            if (!it) return;
            const sig = `${it.scope}|${it.text}|${it.type}`;
            if (seen.has(sig)) return;
            seen.add(sig);
            list.push(it);
        });
        if (list.length) merged.annotations[q] = list;
    });

    return merged;
}

// ----- Firestore -----
export function studyDocId(uid, quizId) {
    return `${uid}__${quizId}`;
}

// Tải dữ liệu học tập từ cloud (đã chuyển về dạng map). Trả về null nếu chưa có.
export async function fetchCloudStudy(uid, quizId) {
    if (!uid || !quizId) return null;
    try {
        const ref = doc(db, 'quiz_study', studyDocId(uid, quizId));
        const snap = await getDoc(ref);
        if (!snap.exists()) return null;
        return arraysToMaps(snap.data() || {});
    } catch (e) {
        console.warn('Không tải được dữ liệu học tập từ cloud:', e);
        return null;
    }
}

// Đẩy dữ liệu học tập (dạng map) lên cloud. Bỏ qua nếu chưa đăng nhập.
export async function pushCloudStudy(uid, quizId, data) {
    if (!uid || !quizId) return false;
    try {
        const ref = doc(db, 'quiz_study', studyDocId(uid, quizId));
        const arrays = mapsToArrays(data);
        await setDoc(ref, {
            userId: uid,
            quizId,
            ...arrays,
            updatedAt: serverTimestamp(),
        });
        return true;
    } catch (e) {
        console.warn('Không lưu được dữ liệu học tập lên cloud:', e);
        return false;
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
