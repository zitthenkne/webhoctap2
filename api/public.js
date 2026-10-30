// GET /api/public?kind=folder&id=…  — nội dung THƯ MỤC CÔNG KHAI (còn hạn) cho trang folder.html: thư mục + thư mục con + bộ đề (chỉ mô tả).
// GET /api/public?kind=quiz&id=…    — chỉ TRẠNG THÁI link của một bộ đề: { status: 'ok' | 'expired' | 'private' | 'missing' }.
// GET /api/public?kind=geo          — vị trí GẦN ĐÚNG theo IP của chính người gọi (Vercel gắn sẵn header, miễn phí): { ip (đã che), city,
//                                     region, country }. Máy khách làm đề công khai (core/quiz-run.js) ghi kèm vào quiz_guest để admin biết
//                                     máy ở đâu. Không đọc Firestore, không tốn lượt đọc.
//
// Vì sao qua máy chủ: link công khai có hạn (publicUntil, mặc định 12 giờ). Luật Firestore kiểm được hạn khi đọc TỪNG doc, nhưng không
// chứng minh được cho truy vấn danh sách → luật nay CẤM liệt kê đề công khai từ app (trước đây ai cũng quét được mọi đề công khai).
// Máy chủ (Admin SDK) đọc rồi lọc đúng những gì còn hạn. Không trả câu hỏi — bộ đề mở bằng quiz.html như cũ (luật kiểm hạn khi đọc).
const { init, send, untilMs, publicAlive, geoOf } = require('./_lib/admin');

const SET_FIELDS = ['title', 'questionCount', 'createdAt', 'folderId', 'isPublic', 'publicUntil', 'deleted', 'sharedBy'];
const statusOf = (d) => (!d ? 'missing' : d.deleted ? 'missing' : d.isPublic !== true ? 'private' : publicAlive(d) ? 'ok' : 'expired');
const ms = (v) => untilMs(v);

module.exports = async function handler(req, res) {
    if (req.method === 'OPTIONS') return send(res, 200, { ok: true });
    if (req.query.kind === 'geo') {
        let region = '';
        try { region = decodeURIComponent(String(req.headers['x-vercel-ip-country-region'] || '')).slice(0, 10); } catch (e) {}
        return send(res, 200, { ...geoOf(req), region });
    }
    try {
        const id = String(req.query.id || '').replace(/[^\w-]/g, '').slice(0, 64);
        const kind = req.query.kind === 'quiz' ? 'quiz' : 'folder';
        if (!id) return send(res, 400, { error: 'Thiếu id' });
        const { db } = init();

        if (kind === 'quiz') {
            const s = await db.doc(`quiz_sets/${id}`).get();
            const d = s.exists ? s.data() : null;
            return send(res, 200, { status: statusOf(d), publicUntil: d ? ms(d.publicUntil) : null });
        }

        const fs = await db.doc(`quiz_folders/${id}`).get();
        const folder = fs.exists ? fs.data() : null;
        const status = statusOf(folder);
        if (status !== 'ok') return send(res, status === 'expired' ? 410 : 404, { status });

        const [subSnap, setSnap] = await Promise.all([
            db.collection('quiz_folders').where('parentId', '==', id).where('isPublic', '==', true).get(),
            db.collection('quiz_sets').where('folderId', '==', id).where('isPublic', '==', true).select(...SET_FIELDS).get()
        ]);
        const subFolders = subSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(publicAlive).filter(f => !f.deleted)
            .map(f => ({ id: f.id, name: f.name || '', color: f.color || '', icon: f.icon || '' }));
        const quizzes = setSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(publicAlive).filter(q => !q.deleted)
            .map(q => ({ id: q.id, title: q.title || '', questionCount: q.questionCount || 0, sharedBy: q.sharedBy || '' }));
        return send(res, 200, {
            status,
            folder: { id, name: folder.name || '', color: folder.color || '', icon: folder.icon || '', sharedBy: folder.sharedBy || '', publicUntil: ms(folder.publicUntil) },
            subFolders, quizzes
        });
    } catch (e) {
        return send(res, e.status || 500, { error: e.message || 'Lỗi máy chủ' });
    }
};
