// POST /api/publish-rev  { quizId }  — ĐÁNH DẤU revision nội dung của một bộ đề (2026-11-10, features/quiz/quiz-fresh.js).
//
// Máy chủ đọc quiz_sets/{id} (+ quiz_payloads nếu câu hỏi tách riêng), băm câu hỏi (api/_lib/revision.js — khớp quiz-attempt.js contentRev)
// rồi ghi quiz_sets.contentRevision = băm đó. Máy khách so băm này với nội dung đang có trong máy: khớp thì chỉ metadata (tiêu đề, chia sẻ…)
// đổi → vá metadata, KHÔNG tải lại câu hỏi.
// Vì sao ở máy chủ: app không được tự đặt revision (firestore.rules dropsRevision) — máy khách gian có thể trỏ revision cũ cho nội dung mới.
// Ghi kèm điều kiện "doc chưa đổi kể từ lúc đọc" (lastUpdateTime): ai vừa sửa câu hỏi thì thôi, lần mở sau đánh dấu lại.
// Không lưu bản sao đề nào (không tốn dung lượng) — chỉ một trường chuỗi trên doc bộ đề.
const { init, verifyUser, send, readJson, publicAlive } = require('./_lib/admin');
const { contentRev } = require('./_lib/revision');

async function canRead(db, d, id, token) {
    if (publicAlive(d)) return true;
    if (!token) return false;
    if (d.userId === token.uid) return true;
    const email = String(token.email || '').toLowerCase();
    if (token.email_verified && email && Array.isArray(d.sharedWith) && d.sharedWith.includes(email)) return true;
    const g = await db.doc(`link_grants/${token.uid}`).get();
    const until = g.exists && g.get('q') && g.get('q')[id];
    return !!until && (typeof until.toMillis === 'function' ? until.toMillis() : 0) > Date.now();
}

module.exports = async function handler(req, res) {
    if (req.method === 'OPTIONS') return send(res, 200, { ok: true });
    if (req.method !== 'POST') return send(res, 405, { error: 'Chỉ nhận POST' });
    try {
        const body = await readJson(req);
        const id = String(body.quizId || '').replace(/[^\w-]/g, '').slice(0, 120);
        if (!id) return send(res, 400, { error: 'Thiếu quizId' });
        const token = req.headers.authorization ? await verifyUser(req) : null;
        const { db } = init();
        const ref = db.doc(`quiz_sets/${id}`);
        const snap = await ref.get();
        if (!snap.exists) return send(res, 404, { error: 'Không có bộ đề' });
        const d = snap.data();
        if (!(await canRead(db, d, id, token))) return send(res, 403, { error: 'Không có quyền' });

        let questions = Array.isArray(d.questions) ? d.questions : [];
        if (!questions.length) {
            const p = await db.doc(`quiz_payloads/${id}`).get();
            if (p.exists && Array.isArray(p.get('questions'))) questions = p.get('questions');
        }
        if (!questions.length) return send(res, 409, { error: 'Bộ đề chưa có câu hỏi' });

        const rev = contentRev(questions);
        let pointed = d.contentRevision === rev;
        if (!pointed) {
            try { await ref.update({ contentRevision: rev }, { lastUpdateTime: snap.updateTime }); pointed = true; }
            catch (e) { pointed = false; }
        }
        return send(res, 200, { rev, pointed });
    } catch (e) {
        return send(res, e.status || 500, { error: e.message || 'Lỗi máy chủ' });
    }
};
