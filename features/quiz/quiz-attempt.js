// File: features/quiz/quiz-attempt.js
// HỢP ĐỒNG CỦA MỘT LƯỢT LÀM (2026-11-10) — hàm thuần, không DOM / Firebase, chạy được cả trong node --test.
//   1. Niêm phong phiên bản: revision của bộ đề (băm nội dung), khóa câu ổn định, dấu vân tay câu, ID phương án.
//      Blueprint v2 dựng lại đúng đề của lượt; bộ đề đã sửa thì chỉ chuyển đổi khi nhận diện được bản nguồn.
//   2. Đồng hồ theo lượt: chính sách + deadline / số giây còn lại; 0 = đã hết giờ (không bao giờ "đủ giờ lại").
//   3. Nhánh offline: hai máy cùng một lượt (cùng attemptId) trả lời khác nhau → tìm câu khác đầu tiên, gộp phần không xung đột.
// Máy chủ băm y hệt ở api/_lib/revision.js — đổi cách băm ở đây thì đổi cả bên đó (tests/quiz-attempt.test.js so hai bản).

// ---------- Băm ----------
// Chuẩn hóa: khóa object sắp xếp, bỏ khóa bắt đầu bằng "_" (trường nội bộ của app: __origIdx, __optOrder, _srvStamp…) và giá trị undefined.
// Firestore REST / SDK web / Admin SDK trả cùng dữ liệu nhưng thứ tự khóa có thể khác → phải sắp xếp thì máy khách và máy chủ mới ra cùng revision.
export function canon(v) {
    if (v === null || typeof v !== 'object') return v === undefined ? 'null' : JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    return '{' + Object.keys(v).filter(k => k[0] !== '_' && v[k] !== undefined).sort()
        .map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
}
// FNV-1a 2 nhánh 32-bit (khác hạt giống) → 16 ký tự hex. Không phải băm mật mã: chỉ để nhận diện nội dung.
export function hash64(str) {
    let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        a = Math.imul(a ^ c, 0x01000193);
        b = Math.imul(b ^ c, 0x5bd1e995);
        b ^= b >>> 15;
    }
    return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
/** Revision nội dung của bộ đề = băm mảng câu hỏi đã chuẩn hóa. */
export const contentRev = (questions) => 'r' + hash64(canon(Array.isArray(questions) ? questions : []));

const optsOf = (q) => (q && (Array.isArray(q.answers) ? q.answers : Array.isArray(q.options) ? q.options : null)) || [];
/** ID phương án = băm nội dung phương án: đảo thứ tự không đổi ID. Trùng nội dung → thêm hậu tố để vẫn phân biệt. */
export function optionIds(q) {
    const seen = {};
    return optsOf(q).map(o => {
        const h = hash64(canon(o)).slice(0, 8);
        seen[h] = (seen[h] || 0) + 1;
        return seen[h] > 1 ? `${h}~${seen[h]}` : h;
    });
}
const correctSet = (q) => {
    if (Array.isArray(q.correctAnswerIndexes) && q.correctAnswerIndexes.length) return q.correctAnswerIndexes;
    return typeof q.correctAnswerIndex === 'number' && q.correctAnswerIndex >= 0 ? [q.correctAnswerIndex] : [];
};
/** Khóa câu ổn định: qid / id tác giả đặt; không có thì băm thân câu (sửa phương án / đáp án / giải thích không đổi khóa). */
export function questionKey(q) {
    if (!q) return '';
    if (q.qid != null && q.qid !== '') return 'i' + String(q.qid);
    if (typeof q.id === 'string' && q.id) return 'i' + q.id;
    return 's' + hash64(canon(q.question ?? q.text ?? q.prompt ?? '')).slice(0, 10);
}
/** Dấu vân tay câu: mọi nội dung + tập phương án (kèm đúng/sai, giải thích từng phương án) KHÔNG theo thứ tự.
 *  Chỉ đảo phương án → dấu giữ nguyên (ánh xạ lại được bằng ID phương án); sửa chữ / đáp án / giải thích → dấu đổi. */
export function questionFp(q) {
    if (!q) return '';
    const ids = optionIds(q), right = new Set(correctSet(q)), oe = Array.isArray(q.optionExplanations) ? q.optionExplanations : [];
    const opts = ids.map((id, i) => [id, right.has(i), oe[i] == null ? '' : hash64(canon(oe[i]))]).sort((x, y) => (x[0] < y[0] ? -1 : 1));
    const rest = {};
    Object.keys(q).forEach(k => {
        if (!['answers', 'options', 'correctAnswerIndex', 'correctAnswerIndexes', 'optionExplanations'].includes(k)) rest[k] = q[k];
    });
    return hash64(canon(rest) + '|' + canon(opts)).slice(0, 12);
}
/** Niêm phong nội dung bộ đề vừa tải (TRƯỚC khi áp chỉnh sửa cục bộ): revision + dấu từng câu, gắn vào bản dữ liệu (khóa "_" không lên máy chủ). */
export function sealContent(data) {
    if (!data || !Array.isArray(data.questions)) return data;
    data._rev = contentRev(data.questions);
    data._fps = data.questions.map(questionFp);
    data._qks = data.questions.map(questionKey);
    return data;
}

// ---------- Blueprint v2 ----------
/** Một câu đang làm → mục blueprint: vị trí gốc + khóa + dấu + thứ tự phương án đã xáo + ID phương án theo thứ tự đang hiện. */
export function blueprintEntry(q, idx, sealed) {
    const origIdx = typeof q.__origIdx === 'number' ? q.__origIdx : idx;
    const base = sealed && Array.isArray(sealed.questions) ? sealed.questions[origIdx] : null;
    const order = Array.isArray(q.__optOrder) ? q.__optOrder : null;
    const baseIds = base ? optionIds(base) : null;
    return {
        origIdx,
        optOrder: order,
        caseId: q.caseId || null,
        qk: sealed && sealed._qks ? sealed._qks[origIdx] || null : null,
        fp: sealed && sealed._fps ? sealed._fps[origIdx] || null : null,
        oids: baseIds ? (order ? order.map(i => baseIds[i]) : baseIds) : null,
    };
}

/**
 * Dựng lại đề của lượt từ blueprint trên NỘI DUNG HIỆN CÓ.
 * @param saved  bản lưu lượt ({ revisionId, questionBlueprint })
 * @param data   bộ đề đã niêm phong (sealContent) — có thể là bản HIỆN TẠI hoặc bản đúng revision cũ
 * @param applyOrder (q, order) => q đã đảo phương án (applyOptionOrder của quiz-helpers)
 * @returns { ok:true, questions, exact, reset? } | { ok:false, reason:'legacy'|'changed'|'empty', changed?:[vị trí] }
 *   exact = cùng revision (khôi phục theo vị trí). Khác revision: ghép theo khóa câu + dấu vân tay, đảo phương án ánh xạ bằng ID.
 *   lenient: câu bị sửa vẫn lấy bản mới cùng khóa, trả `reset` = các vị trí phải trả lời lại (câu bị XÓA khỏi đề → vẫn 'changed').
 *   Bản lưu đời cũ (không revision / không dấu) chỉ được dựng khi bản nguồn nhận diện được — tức là KHÔNG (trả 'legacy').
 */
export function rebuildFromBlueprint(saved, data, applyOrder, { lenient = false } = {}) {
    const bp = saved && saved.questionBlueprint;
    const qs = data && data.questions;
    if (!Array.isArray(bp) || !bp.length || !Array.isArray(qs) || !qs.length) return { ok: false, reason: 'empty' };
    const take = (origIdx, order, caseId) => {
        let q = { ...qs[origIdx], __origIdx: origIdx };
        if (caseId) q.caseId = caseId;
        if (Array.isArray(order) && order.length > 1) q = applyOrder(q, order);
        return q;
    };
    if (saved.revisionId && data._rev && saved.revisionId === data._rev) {
        if (bp.some(it => !(it.origIdx >= 0 && it.origIdx < qs.length))) return { ok: false, reason: 'changed', changed: [] };
        return { ok: true, exact: true, questions: bp.map(it => take(it.origIdx, it.optOrder, it.caseId)) };
    }
    if (!saved.revisionId || bp.some(it => !it.fp || !it.qk)) return { ok: false, reason: 'legacy' };
    const byKey = new Map();
    (data._qks || qs.map(questionKey)).forEach((k, i) => { if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(i); });
    const fps = data._fps || qs.map(questionFp);
    const used = new Set(), changed = [], out = [];
    bp.forEach((it, pos) => {
        const cands = (byKey.get(it.qk) || []).filter(i => !used.has(i));
        // cùng khóa VÀ cùng dấu (câu trùng thân thì lấy câu chưa dùng đầu tiên)
        let i = cands.find(c => fps[c] === it.fp) ?? null;
        let order = null;
        if (i !== null && Array.isArray(it.oids)) {
            const ids = optionIds(qs[i]);
            order = it.oids.map(id => ids.indexOf(id));
            if (order.some(x => x < 0)) { i = null; order = null; }
        }
        if (i === null) {
            // câu đã bị tác giả SỬA: chế độ nới lấy bản mới cùng khóa (phương án theo thứ tự gốc) — câu này phải trả lời lại
            const j = lenient ? cands.find(c => !used.has(c)) ?? null : null;
            changed.push(pos);
            if (j === null) { out.push(null); return; }
            used.add(j);
            out.push(take(j, null, it.caseId));
            return;
        }
        used.add(i);
        out.push(take(i, order, it.caseId));
    });
    if (!changed.length) return { ok: true, exact: false, questions: out };
    if (lenient && out.every(Boolean)) return { ok: true, exact: false, questions: out, reset: changed };
    return { ok: false, reason: 'changed', changed };
}

// ---------- Đồng hồ theo lượt ----------
// timing = { policy: 'pausable' | 'deadline', limit (giây), deadlineAt (ms, chỉ 'deadline'), remaining (giây), paused }
//  - pausable (mặc định khi bật Tính giờ): đếm khi trang đang mở (kể cả khóa màn hình); ĐÓNG / tải lại trang = dừng tại lần lưu cuối;
//    tạm dừng (P) giữ nguyên số giây; chuyển máy mang theo số giây còn lại.
//  - deadline (chế độ thi): mốc hết giờ cố định từ lúc bắt đầu — đóng trang, khóa máy, đổi máy đều không dừng; không cho tạm dừng.
/** Số giây còn lại khi khôi phục; null = bản lưu không ghi (đời cũ chưa tính giờ). 0 = ĐÃ HẾT GIỜ. */
export function restoredRemaining(saved, now = Date.now()) {
    const t = saved && saved.timing;
    if (t && t.policy === 'deadline' && Number(t.deadlineAt) > 0) return Math.max(0, Math.round((t.deadlineAt - now) / 1000));
    if (t && typeof t.remaining === 'number' && isFinite(t.remaining)) return Math.max(0, Math.round(t.remaining));
    if (saved && typeof saved.timeLeft === 'number' && isFinite(saved.timeLeft)) return Math.max(0, Math.round(saved.timeLeft));
    return null;
}
export function newTiming(limitSec, policy = 'pausable', now = Date.now()) {
    const p = policy === 'deadline' ? 'deadline' : 'pausable';
    return { policy: p, limit: limitSec, deadlineAt: p === 'deadline' ? now + limitSec * 1000 : null, remaining: limitSec, paused: false };
}

// ---------- Nhánh offline ----------
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const answered = (a) => a !== null && a !== undefined;
/** Hai nhánh của CÙNG một lượt (cùng attemptId + cùng đề) → vị trí câu đầu tiên cả hai đã trả lời mà KHÁC nhau; -1 nếu không xung đột. */
export function firstDivergence(a, b) {
    if (!a || !b || a.attemptId !== b.attemptId) return -1;
    const ua = a.userAnswers || [], ub = b.userAnswers || [];
    const n = Math.min(ua.length, ub.length);
    for (let i = 0; i < n; i++) if (answered(ua[i]) && answered(ub[i]) && !same(ua[i], ub[i])) return i;
    return -1;
}
/** Hai nhánh cùng đề? (cùng attemptId và cùng dấu vân tay từng vị trí) */
export function sameAttempt(a, b) {
    if (!a || !b || !a.attemptId || a.attemptId !== b.attemptId) return false;
    const fa = (a.questionBlueprint || []).map(x => x.fp || x.origIdx), fb = (b.questionBlueprint || []).map(x => x.fp || x.origIdx);
    return fa.length === fb.length && fa.every((x, i) => x === fb[i]);
}
/** Gộp nhánh: `main` thắng ở câu xung đột; câu chỉ nhánh kia trả lời thì lấy từ nhánh kia (kèm trạng thái phụ của câu đó). */
export function mergeBranches(main, other) {
    const out = { ...main, userAnswers: [...(main.userAnswers || [])] };
    const perQ = ['eliminatedAnswers', 'used5050Questions', 'multiSelections', 'confidence'];
    perQ.forEach(k => { out[k] = { ...(main[k] || {}) }; });
    (other.userAnswers || []).forEach((a, i) => {
        if (answered(a) && !answered(out.userAnswers[i])) {
            out.userAnswers[i] = a;
            perQ.forEach(k => { if (other[k] && other[k][i] !== undefined && out[k][i] === undefined) out[k][i] = other[k][i]; });
        }
    });
    const qt = main.questionTimes || [], ot = other.questionTimes || [];
    out.questionTimes = qt.map((t, i) => Math.max(Number(t) || 0, Number(ot[i]) || 0));
    out.markedQuestions = [...new Set([...(main.markedQuestions || []), ...(other.markedQuestions || [])])];
    return out;
}
