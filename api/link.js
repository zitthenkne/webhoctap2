// POST /api/link — LINK DÙNG CHO 1 THIẾT BỊ (2026-11-03). Bộ đề / thư mục vẫn RIÊNG TƯ; chủ tạo link có mã ngẫu nhiên, máy (trình duyệt)
// đầu tiên bấm "Mở trên máy này" giữ link — máy khác mở bị chặn; quá hạn thì đóng hẳn. Người nhận KHÔNG cần tài khoản.
//
// Danh tính "máy" = uid Firebase của trình duyệt: khách được đăng nhập ẨN DANH (Firebase Anonymous — phải BẬT ở Firebase Console →
// Authentication → Sign-in method → Anonymous), phiên lưu trong IndexedDB của trình duyệt đó; người đang đăng nhập tài khoản thật thì dùng uid tài khoản.
//
// Dữ liệu (CHỈ máy chủ đọc/ghi — firestore.rules chặn app):
//   share_links/{token} = { kind: 'quiz'|'folder', targetId, ownerUid, ownerName, title, count, createdAt, expiresAt (null = không hết hạn),
//                           claimedBy (uid | null), claimedAt, claimLabel, claimCity, claimCountry, lastSeenAt, gq: [quizId], gf: [folderId] }
//   link_grants/{uid}   = { q: { quizId: hạn }, f: { folderId: hạn } } — luật linkGranted() cho uid này đọc đúng các bộ đề / thư mục đó tới hạn.
//   Thư mục: cấp quyền DẦN — mở thư mục nào (action 'folder') thì cấp thư mục con + bộ đề trực tiếp của nó (rẻ, và bộ đề thêm sau vẫn vào được).
//
// Hành động (body.action):
//   peek   { token }                 — ai cũng gọi được (có token thì biết "của mình"): { status, kind, title, count, ownerName, expiresAt }
//   claim  { token, label }          — cần token Firebase (ẩn danh / thật): máy đầu tiên giữ link → { status: 'mine'|'owner'|..., kind, targetId }
//   folder { token, folderId }       — người giữ link mở một thư mục trong nhánh: { status, folder, subFolders, quizzes }
//   create { kind, id, hours }       — CHỦ: tạo link (hours: 24 | 168 | 720 | 0 = không hết hạn)
//   list   { kind, id }              — CHỦ: các link của mục này
//   revoke { token }                 — CHỦ: thu hồi (xóa link + gỡ quyền đã cấp)
// status: ok (chưa ai nhận) · mine (máy này đang giữ) · owner (chủ tự mở — không tốn lượt) · taken (máy khác đã giữ) · expired · missing
const crypto = require('crypto');
const { init, verifyUser, send, readJson, geoOf, untilMs } = require('./_lib/admin');

const FAR_MS = Date.parse('2100-01-01T00:00:00Z');     // "không hết hạn" trong link_grants (luật so request.time < hạn)
const HOUR_CHOICES = [24, 168, 720, 0];
const MAX_LINKS = 30;                                  // mỗi bộ đề / thư mục
const MAX_DEPTH = 25;                                  // thư mục lồng nhau
const cleanId = (s) => String(s || '').replace(/[^\w-]/g, '').slice(0, 64);
const colOf = (kind) => (kind === 'folder' ? 'quiz_folders' : 'quiz_sets');
const err = (status, message) => Object.assign(new Error(message), { status });

async function optionalUser(req) {
    if (!/^Bearer\s+/i.test(req.headers.authorization || '')) return null;
    try { return await verifyUser(req); } catch (e) { return null; }
}

function statusOf(l, uid) {
    if (!l) return 'missing';
    const exp = untilMs(l.expiresAt);
    if (uid && uid === l.ownerUid) return 'owner';
    if (exp != null && exp <= Date.now()) return 'expired';
    if (l.claimedBy) return l.claimedBy === uid ? 'mine' : 'taken';
    return 'ok';
}

/** Mục đích còn tồn tại và vẫn của chủ link? Trả data hoặc null. */
async function targetOf(db, kind, id, ownerUid) {
    const s = await db.doc(`${colOf(kind)}/${id}`).get();
    const d = s.exists ? s.data() : null;
    return d && !d.deleted && d.userId === ownerUid ? d : null;
}

/** Ghi quyền cho uid (gộp vào map) + nhớ trong link để thu hồi được. */
async function grant(db, admin, ref, l, uid, { q = [], f = [] }) {
    if (!q.length && !f.length) return;
    const until = admin.firestore.Timestamp.fromMillis(untilMs(l.expiresAt) ?? FAR_MS);
    const map = (ids) => Object.fromEntries(ids.map(id => [id, until]));
    await db.doc(`link_grants/${uid}`).set({ ...(q.length ? { q: map(q) } : {}), ...(f.length ? { f: map(f) } : {}), updatedAt: admin.firestore.Timestamp.now() }, { merge: true });
    const FV = admin.firestore.FieldValue;
    const patch = {};
    const newQ = q.filter(id => !(l.gq || []).includes(id));
    const newF = f.filter(id => !(l.gf || []).includes(id));
    if (newQ.length) patch.gq = FV.arrayUnion(...newQ);
    if (newF.length) patch.gf = FV.arrayUnion(...newF);
    if (Object.keys(patch).length) await ref.update(patch);
}

/** Gỡ mọi quyền link này đã cấp cho người giữ. */
async function ungrant(db, admin, l) {
    if (!l?.claimedBy) return;
    const FP = admin.firestore.FieldPath, del = admin.firestore.FieldValue.delete();
    const args = [];
    (l.gq || []).forEach(id => args.push(new FP('q', id), del));
    (l.gf || []).forEach(id => args.push(new FP('f', id), del));
    if (args.length) await db.doc(`link_grants/${l.claimedBy}`).update(...args).catch(() => {});
}

function view(token, l) {
    const ms = (v) => untilMs(v);
    return {
        token, kind: l.kind, targetId: l.targetId, status: statusOf(l, null),
        createdAt: ms(l.createdAt), expiresAt: ms(l.expiresAt),
        claimed: !!l.claimedBy, claimedAt: ms(l.claimedAt), lastSeenAt: ms(l.lastSeenAt),
        claimLabel: l.claimLabel || '', claimCity: l.claimCity || '', claimCountry: l.claimCountry || ''
    };
}

module.exports = async function handler(req, res) {
    if (req.method === 'OPTIONS') return send(res, 200, { ok: true });
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
    try {
        const { db, admin } = init();
        const body = await readJson(req);
        const action = String(body.action || '');
        const Timestamp = admin.firestore.Timestamp;

        // ---------- CHỦ: tạo / liệt kê / thu hồi ----------
        if (action === 'create' || action === 'list') {
            const me = await verifyUser(req);
            const kind = body.kind === 'folder' ? 'folder' : 'quiz';
            const id = cleanId(body.id);
            if (!id) throw err(400, 'Thiếu id');
            const t = await targetOf(db, kind, id, me.uid);
            if (!t) throw err(403, 'Chỉ chủ bộ đề / thư mục mới tạo và xem được link này.');
            const snap = await db.collection('share_links').where('targetId', '==', id).get();
            const mine = snap.docs.filter(d => d.data().ownerUid === me.uid && d.data().kind === kind);
            if (action === 'list') {
                const links = mine.map(d => view(d.id, d.data())).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                return send(res, 200, { ok: true, links });
            }
            if (mine.length >= MAX_LINKS) throw err(400, `Mỗi mục tối đa ${MAX_LINKS} link — thu hồi bớt link cũ trước nhé.`);
            const hours = HOUR_CHOICES.includes(Number(body.hours)) ? Number(body.hours) : 168;
            const token = crypto.randomBytes(24).toString('base64url');
            const now = Date.now();
            const l = {
                kind, targetId: id, ownerUid: me.uid,
                ownerName: String(me.name || (me.email || '').split('@')[0] || '').slice(0, 80),
                title: String((kind === 'folder' ? t.name : t.title) || '').slice(0, 200),
                count: kind === 'quiz' ? (Number(t.questionCount) || (Array.isArray(t.questions) ? t.questions.length : 0)) : null,
                createdAt: Timestamp.fromMillis(now),
                expiresAt: hours ? Timestamp.fromMillis(now + hours * 3600 * 1000) : null,
                claimedBy: null, gq: [], gf: []
            };
            await db.doc(`share_links/${token}`).set(l);
            return send(res, 200, { ok: true, link: view(token, l) });
        }
        if (action === 'revoke') {
            const me = await verifyUser(req);
            const token = cleanId(body.token);
            const ref = db.doc(`share_links/${token}`);
            const s = await ref.get();
            if (!s.exists) return send(res, 200, { ok: true });
            const l = s.data();
            if (l.ownerUid !== me.uid) throw err(403, 'Không phải link của bạn.');
            await ungrant(db, admin, l);
            await ref.delete();
            return send(res, 200, { ok: true });
        }

        // ---------- NGƯỜI NHẬN ----------
        const token = cleanId(body.token);
        if (!token) throw err(400, 'Thiếu mã link');
        const ref = db.doc(`share_links/${token}`);

        if (action === 'peek') {
            const me = await optionalUser(req);
            const s = await ref.get();
            const l = s.exists ? s.data() : null;
            const status = statusOf(l, me?.uid);
            if (!l) return send(res, 200, { status });
            return send(res, 200, {
                status, kind: l.kind, title: l.title || '', count: l.count ?? null, ownerName: l.ownerName || '',
                expiresAt: untilMs(l.expiresAt), ...(status === 'mine' || status === 'owner' ? { targetId: l.targetId } : {})
            });
        }

        if (action === 'claim') {
            const me = await verifyUser(req);
            const geo = geoOf(req);
            const now = Date.now();
            const label = String(body.label || '').slice(0, 80);
            // Giao dịch: hai máy bấm cùng lúc thì chỉ MỘT máy giữ được
            const out = await db.runTransaction(async (tx) => {
                const s = await tx.get(ref);
                const l = s.exists ? s.data() : null;
                const st = statusOf(l, me.uid);
                if (st === 'ok') {
                    const claim = { claimedBy: me.uid, claimedAt: Timestamp.fromMillis(now), lastSeenAt: Timestamp.fromMillis(now),
                        claimLabel: label, claimCity: geo.city || '', claimCountry: geo.country || '', claimAnon: me.firebase?.sign_in_provider === 'anonymous' };
                    tx.update(ref, claim);
                    return { st: 'mine', l: { ...l, ...claim } };
                }
                if (st === 'mine') tx.update(ref, { lastSeenAt: Timestamp.fromMillis(now) });
                return { st, l };
            });
            const { st, l } = out;
            if (st !== 'mine' && st !== 'owner') return send(res, 200, { status: st });
            if (st === 'owner') return send(res, 200, { status: st, kind: l.kind, targetId: l.targetId });
            if (!await targetOf(db, l.kind, l.targetId, l.ownerUid)) return send(res, 200, { status: 'missing' });
            await grant(db, admin, ref, l, me.uid, l.kind === 'quiz' ? { q: [l.targetId] } : { f: [l.targetId] });
            return send(res, 200, { status: st, kind: l.kind, targetId: l.targetId });
        }

        if (action === 'folder') {
            const me = await verifyUser(req);
            const s = await ref.get();
            const l = s.exists ? s.data() : null;
            const st = statusOf(l, me.uid);
            if (st !== 'mine' && st !== 'owner') return send(res, st === 'ok' ? 401 : 403, { status: st === 'ok' ? 'unclaimed' : st });
            if (l.kind !== 'folder') throw err(400, 'Link này không phải thư mục');
            const folderId = cleanId(body.folderId) || l.targetId;
            // Thư mục yêu cầu phải nằm trong nhánh của thư mục gốc của link: đi ngược parentId tới gốc
            let cur = folderId, folder = null;
            for (let i = 0; i < MAX_DEPTH && cur; i++) {
                const fs = await db.doc(`quiz_folders/${cur}`).get();
                const d = fs.exists ? fs.data() : null;
                if (!d || d.deleted || d.userId !== l.ownerUid) break;
                if (i === 0) folder = d;
                if (cur === l.targetId) { cur = 'ROOT'; break; }
                cur = d.parentId || null;
            }
            if (cur !== 'ROOT' || !folder) return send(res, 404, { status: 'missing' });
            const [subSnap, setSnap] = await Promise.all([
                db.collection('quiz_folders').where('parentId', '==', folderId).where('userId', '==', l.ownerUid).get(),
                db.collection('quiz_sets').where('folderId', '==', folderId).where('userId', '==', l.ownerUid)
                    .select('title', 'questionCount', 'deleted').get()
            ]);
            const subFolders = subSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(f => !f.deleted)
                .map(f => ({ id: f.id, name: f.name || '', color: f.color || '', icon: f.icon || '' }));
            const quizzes = setSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(q => !q.deleted)
                .map(q => ({ id: q.id, title: q.title || '', questionCount: q.questionCount || 0 }));
            if (st === 'mine') {
                await grant(db, admin, ref, l, me.uid, { f: [folderId, ...subFolders.map(f => f.id)], q: quizzes.map(q => q.id) });
                await ref.update({ lastSeenAt: Timestamp.now() }).catch(() => {});
            }
            return send(res, 200, {
                status: st, root: l.targetId, expiresAt: untilMs(l.expiresAt),
                folder: { id: folderId, name: folder.name || '', color: folder.color || '', icon: folder.icon || '', parentId: folderId === l.targetId ? null : (folder.parentId || null) },
                ownerName: l.ownerName || '', subFolders, quizzes
            });
        }

        throw err(400, 'action không hợp lệ');
    } catch (e) {
        return send(res, e.status || 500, { error: e.message || 'Lỗi máy chủ' });
    }
};
