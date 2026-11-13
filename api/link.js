// /api/link — LINK RIÊNG (2026-11-03, nâng cấp 2026-11-11). Bộ đề / thư mục vẫn RIÊNG TƯ; chủ tạo link có mã ngẫu nhiên, ĐẶT TÊN người nhận
// ("Gửi bạn ABC…") và số SUẤT (mặc định 1 = link dùng 1 lần). Mỗi máy (trình duyệt) / tài khoản bấm "Mở trên máy này" chiếm 1 suất;
// hết suất thì máy khác bị chặn; quá hạn / thu hồi là đóng. Ai bị chặn (hết suất, hết hạn, thu hồi, bị gỡ, đề riêng tư) có thể GỬI YÊU CẦU
// TRUY CẬP — bắt buộc đăng nhập tài khoản thật (Google hoặc tài khoản có sẵn); chủ duyệt = cấp cho tài khoản đó 1 suất trên link.
//
// Danh tính "máy" = uid Firebase của trình duyệt: khách được đăng nhập ẨN DANH (Firebase Anonymous — phải BẬT ở Firebase Console →
// Authentication → Sign-in method → Anonymous), phiên lưu trong IndexedDB của trình duyệt đó; người đang đăng nhập tài khoản thật thì dùng uid tài khoản.
//
// Dữ liệu (CHỈ máy chủ đọc/ghi — firestore.rules chặn app):
//   share_links/{token} = { kind: 'quiz'|'folder', targetId, ownerUid, ownerName, title, count, createdAt, expiresAt (null = không hết hạn),
//                           name (tên người nhận / tên nhóm), maxUses (số suất, 1..200), group (link nhóm), members (danh sách tên, có thể rỗng),
//                           claims: { uid: { at, seen, label, city, country, anon, email, name, who (tên tự xưng — link nhóm), via } },
//                           visits: { uid: {...như claims} } — LINK THƯ MỤC: máy đã VÀO XEM nhưng chưa làm bài, KHÔNG tính suất
//                           (2026-11-12). Bấm vào một bộ đề để làm mới 'claim' = chiếm suất (mở bộ đề là đọc được câu hỏi rồi).
//                           blocked: [uid bị chủ gỡ], revoked, revokedAt, gq: [quizId], gf: [folderId] }
//     (link cũ: claimedBy/claimedAt/claimLabel/claimCity/claimCountry/lastSeenAt/claimAnon — claimsOf() đọc được, lần ghi sau đổi sang claims)
//   link_grants/{uid}   = { q: { quizId: hạn }, f: { folderId: hạn } } — luật linkGranted() cho uid này đọc đúng các bộ đề / thư mục đó tới hạn.
//   access_requests/{q|f}_{targetId}_{uid} = { kind, targetId, ownerUid, title, token (link đã bấm, nếu có), linkName, uid, email, name, message,
//                           label, city, country, status: pending|approved|denied, grantToken (link được cấp khi duyệt), createdAt, updatedAt, decidedAt }
//   link_history/{q|f}_{targetId} = { kind, targetId, ownerUid, title, tokens: [mã], items: [{ token, name, maxUses, createdAt, expiresAt, endedAt,
//                           reason: expired|revoked, opens: [{ who, label, place, at, seen, via }] }] } — LỊCH SỬ GỌN (≤ 100 dòng / mục).
//   Link HẾT HẠN hoặc bị THU HỒI → chép vào lịch sử, xóa doc share_links + gỡ link_grants (đỡ nặng Firestore). Dọn lười: lúc chủ mở hộp
//   Chia sẻ (list) hoặc lúc có người mở trúng link đã hết hạn (peek / claim). Mã cũ vẫn tra được trong lịch sử (tokens array-contains)
//   → người mở link cũ vẫn thấy "đã hết hạn / thu hồi" và vẫn GỬI YÊU CẦU TRUY CẬP được.
//   Thư mục: cấp quyền DẦN — mở thư mục nào (action 'folder') thì cấp thư mục con + bộ đề trực tiếp của nó (rẻ, và bộ đề thêm sau vẫn vào được).
//
// GET /api/link?t=<mã> — trang xem trước (Open Graph) RIÊNG TỪNG LINK cho Messenger/Zalo ("Gửi bạn ABC, bạn được mời làm bộ đề XYZ…"),
//                        trình duyệt thật tự chuyển sang features/quiz/link.html?t=<mã>. Trình quét không chạy JS → không bao giờ chiếm suất.
// POST — body.action:
//   peek      { token }                       — ai cũng gọi: { status, kind, title, count, ownerName, expiresAt, name, maxUses }
//   claim     { token, label, who? }          — cần token Firebase (ẩn danh / thật): chiếm 1 suất → { status: 'mine'|'owner'|..., kind, targetId }
//                                               link nhóm: thiếu who → needWho · ngoài danh sách → notMember · tên đã có máy giữ → whoTaken
//   visit     { token, label, who? }          — LINK THƯ MỤC: ghi nhận "đã vào" (không tốn suất) → { status: 'visitor'|'mine'|'owner'|..., kind, targetId }
//   folder    { token, folderId }             — người giữ link (hoặc đã vào xem) mở một thư mục trong nhánh: { status, folder, subFolders, quizzes, link,
//                                               me (hồ sơ máy này: tên, thiết bị, lần vào…), done (nhật ký làm bài của máy này) }
//   unvisit   { token }                       — máy ĐANG VÀO XEM (chưa tốn suất) tự xoá lượt vào (chọn lại tên)
//   progress  { token, quizId, pct, total, title } — người giữ link nộp bài: ghi link_progress để chủ xem ai làm đề nào
//   start     { token, quizId, title, at }    — người giữ link bấm bắt đầu làm đề → claims.<uid>.go (chủ thấy "đang làm")
//   create    { kind, id, hours, name, maxUses, group?, members? } — CHỦ: tạo link (hours: 24 | 168 | 720 | 0 = không hết hạn)
//   list      { kind, id }                    — CHỦ: các link còn sống + yêu cầu đang chờ + lịch sử link của mục này
//   update    { token, name?, maxUses?, hours?, members? } — CHỦ: đổi tên / số suất / gia hạn (tính từ bây giờ) / danh sách nhóm
//   kick      { token, uid }                  — CHỦ: gỡ + chặn một máy / tài khoản khỏi link
//   revoke    { token }                       — CHỦ: thu hồi (gỡ mọi quyền, chuyển link vào lịch sử)
//   request   { token | kind,id, message, label } — TÀI KHOẢN THẬT: gửi yêu cầu truy cập
//   myRequest { token | kind,id }             — TÀI KHOẢN THẬT: yêu cầu của mình → { status: none|pending|approved|denied, token? }
//   approve   { id, hours? }                  — CHỦ: duyệt (thêm suất trên link đã bấm, hoặc tạo link riêng mới) · deny { id } — từ chối
//   inbox     {}                              — CHỦ: mọi yêu cầu đang chờ
// status: ok (còn suất) · mine (máy này đang giữ) · owner (chủ tự mở — không tốn suất) · taken (hết suất) · blocked (bị chủ gỡ)
//         · expired · revoked (từ lịch sử) · missing
const crypto = require('crypto');
const { init, verifyUser, send, readJson, geoOf, untilMs } = require('./_lib/admin');

const FAR_MS = Date.parse('2100-01-01T00:00:00Z');     // "không hết hạn" trong link_grants (luật so request.time < hạn)
const HOUR_CHOICES = [24, 168, 720, 0];
const MAX_LINKS = 30;                                  // mỗi bộ đề / thư mục
const MAX_USES = 200;                                  // suất tối đa mỗi link (link nhóm cho cả lớp)
const MAX_MEMBERS = 200;                               // danh sách thành viên link nhóm
const MAX_DEPTH = 25;                                  // thư mục lồng nhau
const LEGACY = ['claimedBy', 'claimedAt', 'claimLabel', 'claimCity', 'claimCountry', 'lastSeenAt', 'claimAnon'];
const cleanId = (s) => String(s || '').replace(/[^\w-]/g, '').slice(0, 64);
const cleanName = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 60);
const colOf = (kind) => (kind === 'folder' ? 'quiz_folders' : 'quiz_sets');
const err = (status, message) => Object.assign(new Error(message), { status });
const usesOf = (l) => Math.min(MAX_USES, Math.max(1, Math.round(Number(l?.maxUses)) || 1));
const hoursOf = (h, def) => (HOUR_CHOICES.includes(Number(h)) ? Number(h) : def);
const isAnon = (me) => me?.firebase?.sign_in_provider === 'anonymous';
const reqIdOf = (kind, id, uid) => `${kind === 'folder' ? 'f' : 'q'}_${id}_${uid}`;
const ms = (v) => untilMs(v);
// LINK NHÓM (group: true): "Gửi Tổ 17…" — người mở phải XƯNG TÊN (chọn trong danh sách thành viên nếu chủ có nhập, không thì tự gõ).
// Mỗi tên chỉ một máy giữ; mỗi máy vẫn chiếm 1 suất và làm bài bao nhiêu lần cũng được.
const whoKey = (s) => cleanName(s).toLocaleLowerCase('vi');
function cleanMembers(arr) {
    const seen = new Set(), out = [];
    for (const raw of Array.isArray(arr) ? arr : []) {
        const n = cleanName(raw).slice(0, 40);
        if (n && !seen.has(whoKey(n))) { seen.add(whoKey(n)); out.push(n); }
        if (out.length >= MAX_MEMBERS) break;
    }
    return out;
}
// Tên đã có máy GIỮ SUẤT (đã làm bài) — trừ chính máy `exceptUid`. Máy chỉ vào xem (visits) KHÔNG giữ tên: chưa làm bài thì chưa mất gì;
// hai máy cùng xem bằng một tên → máy nào bắt đầu làm bài trước được tên, máy kia chọn lại (action 'claim').
const takenWho = (l, exceptUid = '') => Object.entries(claimsOf(l))
    .filter(([uid]) => uid !== exceptUid).map(([, x]) => x.who).filter(Boolean);
const MAX_VISITS = 300;                                // máy "đã vào xem" giữ tối đa (bỏ máy lâu nhất) — doc khỏi phình
/** Máy đã vào xem thư mục, chưa chiếm suất: { uid: {...} } */
const visitsOf = (l) => (l?.visits && typeof l.visits === 'object' ? l.visits : {});
const isVisitor = (l, uid) => !!uid && !!visitsOf(l)[uid] && !claimsOf(l)[uid];
/** Bỏ trường rỗng ('' / null / undefined / false) trước khi ghi Firestore */
const compact = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null && v !== false));
const SEEN_GAP_MS = 60 * 1000;                         // tải lại trong 1 phút: không tính thêm lượt vào, không ghi
/** Link nhóm: kiểm tên máy mới xưng → { who } hoặc { st: needWho | notMember | whoTaken } */
function checkWho(l, raw, uid) {
    let who = cleanName(raw).slice(0, 40);
    if (!who) return { st: 'needWho' };
    const members = l.members || [];
    if (members.length) {
        who = members.find(m => whoKey(m) === whoKey(who)) || '';
        if (!who) return { st: 'notMember' };
    }
    if (takenWho(l, uid).some(x => whoKey(x) === whoKey(who))) return { st: 'whoTaken' };
    return { who };
}

async function optionalUser(req) {
    if (!/^Bearer\s+/i.test(req.headers.authorization || '')) return null;
    try { return await verifyUser(req); } catch (e) { return null; }
}

/** Các máy / tài khoản đang giữ suất: { uid: {...} } (đọc được cả link cũ một-máy). */
function claimsOf(l) {
    if (!l) return {};
    if (l.claims && typeof l.claims === 'object') return l.claims;
    if (l.claimedBy) return { [l.claimedBy]: { at: l.claimedAt || null, seen: l.lastSeenAt || null, label: l.claimLabel || '', city: l.claimCity || '', country: l.claimCountry || '', anon: !!l.claimAnon } };
    return {};
}
/** Patch ghi cả map claims (và bỏ các trường kiểu cũ). */
function claimsPatch(admin, claims) {
    const del = admin.firestore.FieldValue.delete();
    return { claims, ...Object.fromEntries(LEGACY.map(k => [k, del])) };
}

function statusOf(l, uid) {
    if (!l) return 'missing';
    if (uid && uid === l.ownerUid) return 'owner';
    const exp = untilMs(l.expiresAt);
    if (exp != null && exp <= Date.now()) return 'expired';
    if (uid && (l.blocked || []).includes(uid)) return 'blocked';
    const c = claimsOf(l);
    if (uid && c[uid]) return 'mine';
    return Object.keys(c).length >= usesOf(l) ? 'taken' : 'ok';
}

/** Mục đích còn tồn tại và vẫn của chủ link? Trả data hoặc null. */
async function targetOf(db, kind, id, ownerUid) {
    const s = await db.doc(`${colOf(kind)}/${id}`).get();
    const d = s.exists ? s.data() : null;
    return d && !d.deleted && d.userId === ownerUid ? d : null;
}

async function writeGrant(db, admin, uid, untilVal, q, f) {
    if (!q.length && !f.length) return;
    const until = admin.firestore.Timestamp.fromMillis(untilVal ?? FAR_MS);
    const map = (ids) => Object.fromEntries(ids.map(id => [id, until]));
    await db.doc(`link_grants/${uid}`).set({ ...(q.length ? { q: map(q) } : {}), ...(f.length ? { f: map(f) } : {}), updatedAt: admin.firestore.Timestamp.now() }, { merge: true });
}

/** Ghi quyền cho uid (gộp vào map) + nhớ trong link để thu hồi được. */
async function grant(db, admin, ref, l, uid, { q = [], f = [] }) {
    if (!q.length && !f.length) return;
    await writeGrant(db, admin, uid, untilMs(l.expiresAt), q, f);
    const FV = admin.firestore.FieldValue;
    const patch = {};
    const newQ = q.filter(id => !(l.gq || []).includes(id));
    const newF = f.filter(id => !(l.gf || []).includes(id));
    if (newQ.length) patch.gq = FV.arrayUnion(...newQ);
    if (newF.length) patch.gf = FV.arrayUnion(...newF);
    if (Object.keys(patch).length) await ref.update(patch);
}

/** Gỡ mọi quyền link này đã cấp (cho mọi người giữ, hoặc chỉ `uids`). */
async function ungrant(db, admin, l, uids = Object.keys(claimsOf(l))) {
    const FP = admin.firestore.FieldPath, del = admin.firestore.FieldValue.delete();
    const args = [];
    (l.gq || []).forEach(id => args.push(new FP('q', id), del));
    (l.gf || []).forEach(id => args.push(new FP('f', id), del));
    if (!args.length) return;
    await Promise.all(uids.map(uid => db.doc(`link_grants/${uid}`).update(...args).catch(() => {})));
}

/**
 * LINK THƯ MỤC CŨ (trước 2026-11-12, mở thư mục là chiếm suất ngay) → áp luật mới, MỘT lần mỗi link (đánh dấu mig: 1):
 * máy giữ suất KHÔNG có `in` (luồng mới luôn vào xem trước nên claim nào cũng có `in`), không phải được chủ duyệt (via 'request'),
 * và CHƯA NỘP bài nào (không có link_progress) → chuyển về "đã vào xem": trả suất, trả tên (link nhóm), gỡ quyền đọc bộ đề đã cấp.
 * Lỗi → trả nguyên l (lần sau thử lại).
 */
async function settleOldFolder(db, admin, token, l) {
    if (!l || l.kind !== 'folder' || l.mig >= 1) return l;
    try {
        const c = claimsOf(l);
        const cand = Object.keys(c).filter(uid => !c[uid].in && c[uid].via !== 'request');
        let moved = [];
        if (cand.length) {
            const ps = await db.collection('link_progress').where('token', '==', token).get();
            const did = new Set(ps.docs.map(d => d.data().uid));
            moved = cand.filter(uid => !did.has(uid));
        }
        const ref = db.doc(`share_links/${token}`);
        const out = await db.runTransaction(async (tx) => {
            const s = await tx.get(ref);
            if (!s.exists) return null;
            const x = s.data();
            if (x.mig >= 1) return x;
            const cc = { ...claimsOf(x) }, v = { ...visitsOf(x) };
            moved.filter(uid => cc[uid]).forEach(uid => {
                const o = cc[uid];
                v[uid] = compact({ at: o.at, seen: o.seen, n: o.n || 1, label: o.label, city: o.city, country: o.country, email: o.email, name: o.name, who: o.who });
                delete cc[uid];
            });
            tx.update(ref, { ...claimsPatch(admin, cc), visits: v, mig: 1 });
            return { ...x, claims: cc, visits: v, mig: 1 };
        });
        if (out && moved.length) await ungrant(db, admin, l, moved).catch(() => {});
        return out || l;
    } catch (e) { return l; }
}

function newLinkDoc(Timestamp, me, kind, id, t, { hours, name, maxUses, claims = {}, group = false, members = [] }) {
    const now = Date.now();
    return {
        kind, targetId: id, ownerUid: me.uid,
        ownerName: String(me.name || (me.email || '').split('@')[0] || '').slice(0, 80),
        title: String((kind === 'folder' ? t.name : t.title) || '').slice(0, 200),
        count: kind === 'quiz' ? (Number(t.questionCount) || (Array.isArray(t.questions) ? t.questions.length : 0)) : null,
        createdAt: Timestamp.fromMillis(now),
        expiresAt: hours ? Timestamp.fromMillis(now + hours * 3600 * 1000) : null,
        name: cleanName(name), maxUses: usesOf({ maxUses }), claims, blocked: [], gq: [], gf: [],
        ...(group ? { group: true, members: cleanMembers(members) } : {})
    };
}

// ---------- Kết quả làm bài qua link (action 'progress') ----------
// link_progress/{token}_{uid} = { token, uid, kind, targetId, ownerUid, quizzes: { quizId: { title, n, best, last, total, first, at } } }
// — một doc cho mỗi (link, máy); chủ đọc qua 'list'. Link vào lịch sử → chép gọn vào opens[].done rồi xóa doc.
const doneView = (quizzes) => Object.entries(quizzes || {}).map(([quizId, x]) => ({
    quizId, title: x.title || '', n: x.n || 0, best: x.best ?? null, last: x.last ?? null, total: x.total || 0, at: ms(x.at), first: ms(x.first)
})).sort((a, b) => (b.at || 0) - (a.at || 0));
/** Snapshot truy vấn link_progress → { token: { uid: quizzes } } */
function progressMap(docs) {
    const m = {};
    docs.forEach(d => { const p = d.data(); (m[p.token] = m[p.token] || {})[p.uid] = p.quizzes || {}; });
    return m;
}

function view(token, l, prog = {}) {
    const claims = Object.entries(claimsOf(l)).map(([uid, x]) => ({
        uid, at: ms(x.at), seen: ms(x.seen), label: x.label || '', city: x.city || '', country: x.country || '',
        anon: !!x.anon, email: x.email || '', name: x.name || '', who: x.who || '', via: x.via || '', in: ms(x.in), n: x.n || 1, done: doneView(prog[uid]),
        go: x.go ? { q: x.go.q || '', t: x.go.t || '', at: ms(x.go.at) } : null
    })).sort((a, b) => (a.at || 0) - (b.at || 0));
    const c = claimsOf(l);
    const visitors = Object.entries(visitsOf(l)).filter(([uid]) => !c[uid]).map(([uid, x]) => ({
        uid, at: ms(x.at), seen: ms(x.seen), label: x.label || '', city: x.city || '', country: x.country || '',
        anon: !x.email, email: x.email || '', name: x.name || '', who: x.who || '', n: x.n || 1, visit: true, done: []
    })).sort((a, b) => (a.at || 0) - (b.at || 0));
    return {
        token, kind: l.kind, targetId: l.targetId, status: statusOf(l, null), name: l.name || '', maxUses: usesOf(l),
        group: !!l.group, members: l.members || [],
        createdAt: ms(l.createdAt), expiresAt: ms(l.expiresAt), claims, visitors
    };
}

// ---------- Lịch sử link (link hết hạn / thu hồi → xóa doc, giữ dòng gọn) ----------
const histIdOf = (kind, id) => `${kind === 'folder' ? 'f' : 'q'}_${id}`;
const HIST_MAX = 100;

/** Chép các link (CÙNG một mục) vào lịch sử, xóa doc link, gỡ quyền đã cấp — MỘT giao dịch cho cả lô. Trả các dòng lịch sử mới. */
async function archiveMany(db, admin, pairs, reason) {
    if (!pairs.length) return null;
    const Timestamp = admin.firestore.Timestamp;
    const l0 = pairs[0][1];
    // Kết quả làm bài của từng máy → chép gọn vào lịch sử (≤ 60 đề / máy), doc link_progress xóa cùng giao dịch
    const progSnaps = await Promise.all([
        ...pairs.map(([, l]) => ungrant(db, admin, l)).map(p => p.then(() => null)),
        ...pairs.map(([token]) => db.collection('link_progress').where('token', '==', token).get().catch(() => null))
    ]);
    const progDocs = progSnaps.filter(Boolean).flatMap(s => s.docs);
    const prog = progressMap(progDocs);
    const entries = pairs.map(([token, l]) => ({
        token, name: l.name || '', maxUses: usesOf(l), group: !!l.group, createdAt: l.createdAt || null, expiresAt: l.expiresAt || null,
        endedAt: Timestamp.now(), reason,
        opens: Object.entries(claimsOf(l)).map(([uid, x]) => ({
            who: x.who || x.email || x.name || '', label: x.label || '', place: [x.city, x.country].filter(Boolean).join(', '),
            at: x.at || null, seen: x.seen || null, via: x.via || '', n: x.n || 1,
            done: Object.values(prog[token]?.[uid] || {}).slice(0, 60).map(q => ({ t: q.title || '', b: q.best ?? null, n: q.n || 0 }))
        })).concat(Object.entries(visitsOf(l)).filter(([uid]) => !claimsOf(l)[uid]).map(([, x]) => ({
            who: x.who || x.email || x.name || '', label: x.label || '', place: [x.city, x.country].filter(Boolean).join(', '),
            at: x.at || null, seen: x.seen || null, n: x.n || 1, visit: true, done: []
        })))
    }));
    const tokens = new Set(entries.map(e => e.token));
    const href = db.doc(`link_history/${histIdOf(l0.kind, l0.targetId)}`);
    return db.runTransaction(async (tx) => {
        const s = await tx.get(href);
        const h = s.exists ? s.data() : {};
        const items = [...entries, ...(h.items || []).filter(x => !tokens.has(x.token))].slice(0, HIST_MAX);
        tx.set(href, { kind: l0.kind, targetId: l0.targetId, ownerUid: l0.ownerUid, title: l0.title || h.title || '', items, tokens: items.map(x => x.token) });
        tokens.forEach(t => tx.delete(db.doc(`share_links/${t}`)));
        progDocs.forEach(d => tx.delete(db.doc(`link_progress/${d.id}`)));
        return items;
    });
}
const archive = (db, admin, token, l, reason) => archiveMany(db, admin, [[token, l]], reason);

/** Mã link đã vào lịch sử → { h (doc lịch sử), e (dòng của mã) } hoặc null. */
async function historyOf(db, token) {
    const s = await db.collection('link_history').where('tokens', 'array-contains', token).limit(1).get();
    if (s.empty) return null;
    const h = s.docs[0].data();
    const e = (h.items || []).find(x => x.token === token);
    return e ? { h, e } : null;
}

function histView(e) {
    return {
        token: e.token, name: e.name || '', maxUses: e.maxUses || 1, group: !!e.group, reason: e.reason, createdAt: ms(e.createdAt), expiresAt: ms(e.expiresAt), endedAt: ms(e.endedAt),
        opens: (e.opens || []).map(o => ({ who: o.who || '', label: o.label || '', place: o.place || '', at: ms(o.at), seen: ms(o.seen), via: o.via || '', visit: !!o.visit, n: o.n || 1, done: o.done || [] }))
    };
}

function reqView(id, r) {
    return {
        id, kind: r.kind, targetId: r.targetId, title: r.title || '', email: r.email || '', name: r.name || '', message: r.message || '',
        linkName: r.linkName || '', viaLink: !!r.token, label: r.label || '', city: r.city || '', country: r.country || '',
        status: r.status, createdAt: ms(r.createdAt), updatedAt: ms(r.updatedAt)
    };
}

/** Mục người xin quyền đang nhắm tới: theo link đã bấm (token) hoặc theo kind + id (trang bộ đề / thư mục bị chặn). */
async function requestTarget(db, body) {
    const token = cleanId(body.token);
    if (token) {
        const s = await db.doc(`share_links/${token}`).get();
        if (s.exists) {
            const l = s.data();
            return { kind: l.kind, id: l.targetId, ownerUid: l.ownerUid, title: l.title || '', token, linkName: l.name || '' };
        }
        // Link đã hết hạn / thu hồi (chỉ còn trong lịch sử) → vẫn biết trỏ tới đâu
        const old = await historyOf(db, token);
        if (!old) throw err(404, 'Link này đã bị xóa — không xin quyền qua nó được nữa.');
        return { kind: old.h.kind, id: old.h.targetId, ownerUid: old.h.ownerUid, title: old.h.title || '', token, linkName: old.e.name || '' };
    }
    const kind = body.kind === 'folder' ? 'folder' : 'quiz';
    const id = cleanId(body.id);
    if (!id) throw err(400, 'Thiếu id');
    const s = await db.doc(`${colOf(kind)}/${id}`).get();
    const d = s.exists ? s.data() : null;
    if (!d || d.deleted) throw err(404, 'Bộ đề / thư mục không tồn tại hoặc đã bị xóa.');
    return { kind, id, ownerUid: d.userId, title: String((kind === 'folder' ? d.name : d.title) || '').slice(0, 200), token: '', linkName: '' };
}

// ---------- Trang xem trước (Open Graph) riêng từng link ----------
// Chỉ BOT xem trước (Messenger / Zalo / Telegram…) tới được đây: người thật bị vercel.json chuyển thẳng ở edge sang link.html
// (đỡ một lượt khởi động hàm + đi-về VN ↔ iad1). Bot mới nào hiện thẻ chung → thêm tên nó vào danh sách user-agent trong vercel.json.
const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
async function previewPage(req, res) {
    const token = cleanId(req.query.t);
    let l = null;
    try { if (token) { const { db } = init(); const s = await db.doc(`share_links/${token}`).get(); l = s.exists ? s.data() : null; } }
    catch (e) { /* lỗi máy chủ → thẻ chung */ }
    const st = statusOf(l, null);
    let title = 'Bạn được mời làm bộ đề trên Zitthenkne';
    let desc = 'Link riêng — bấm để mở trên máy của bạn.';
    if (l && (st === 'ok' || st === 'taken')) {
        const verb = l.kind === 'folder' ? 'học thư mục' : 'làm bộ đề';
        const what = l.title ? `“${l.title}”` : '';
        const uses = usesOf(l);
        // Đuôi ngắn gắn vào TIÊU ĐỀ: khung chat Messenger thường không hiện dòng mô tả
        if (l.group) {
            title = `${l.name ? `Gửi ${l.name}: các bạn` : 'Các bạn'} được mời ${verb} ${what} trên Zitthenkne · link nhóm, mỗi người 1 thiết bị`.replace(/\s+/g, ' ');
            desc = 'Link truy cập nhóm — mỗi thành viên xác nhận tên và sử dụng trên 1 thiết bị.';
        } else {
            title = `${l.name ? `Gửi bạn ${l.name}, bạn` : 'Bạn'} được mời ${verb} ${what} trên Zitthenkne · link riêng, ${uses} thiết bị`.replace(/\s+/g, ' ');
            desc = `Link truy cập riêng, sử dụng được trên ${uses} thiết bị.`;
        }
    } else if (l) {
        desc = st === 'expired' ? 'Link này đã hết hạn.' : 'Link này không còn hiệu lực.';
    }
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'zitthenkne.vercel.app';
    const origin = `${String(host).includes('localhost') ? 'http' : 'https'}://${host}`;
    const target = `/features/quiz/link.html?t=${encodeURIComponent(token)}`;
    // Ảnh ngang 1024×536 (~160 KB) + khai báo kích thước: mỗi link là URL MỚI → Messenger / Zalo luôn quét "lần đầu"; không biết cỡ ảnh
    // thì Facebook xử lý ảnh sau và hiện thẻ nhỏ (mất ảnh + dòng mô tả)
    const T = escHtml(title), D = escHtml(desc), img = `${origin}/assets/og_link.jpg`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(`<!DOCTYPE html>
<html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${T}</title>
<meta property="og:type" content="website"><meta property="og:site_name" content="Zitthenkne"><meta property="og:locale" content="vi_VN">
<meta property="og:title" content="${T}"><meta property="og:description" content="${D}">
<meta property="og:url" content="${escHtml(origin + req.url)}"><meta property="og:image" content="${img}"><meta property="og:image:secure_url" content="${img}"><meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="1024"><meta property="og:image:height" content="536"><meta property="og:image:alt" content="${T}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${T}"><meta name="twitter:description" content="${D}"><meta name="twitter:image" content="${img}">
<script>location.replace(${JSON.stringify(target)});</script>
</head><body style="font-family:sans-serif;text-align:center;margin-top:50px;color:#e0559f"><p>Đang mở link…</p><noscript><a href="${escHtml(target)}">Bấm vào đây để mở</a></noscript></body></html>`);
}

module.exports = async function handler(req, res) {
    if (req.method === 'OPTIONS') return send(res, 200, { ok: true });
    if (req.method === 'GET') return previewPage(req, res);
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
    try {
        const { db, admin } = init();
        const body = await readJson(req);
        const action = String(body.action || '');
        const Timestamp = admin.firestore.Timestamp;

        // ---------- CHỦ: tạo / liệt kê ----------
        if (action === 'create' || action === 'list') {
            const me = await verifyUser(req);
            const kind = body.kind === 'folder' ? 'folder' : 'quiz';
            const id = cleanId(body.id);
            if (!id) throw err(400, 'Thiếu id');
            // Mọi lượt đọc chạy SONG SONG (mỗi lượt là một chuyến Vercel ↔ Firestore — tuần tự thì điện thoại chờ rất lâu)
            const isList = action === 'list';
            const [t, snap, rs, hs, ps] = await Promise.all([
                targetOf(db, kind, id, me.uid),
                db.collection('share_links').where('targetId', '==', id).get(),
                isList ? db.collection('access_requests').where('targetId', '==', id).where('status', '==', 'pending').get() : null,
                isList ? db.doc(`link_history/${histIdOf(kind, id)}`).get() : null,
                isList ? db.collection('link_progress').where('targetId', '==', id).get() : null
            ]);
            if (!t) throw err(403, 'Chỉ chủ bộ đề / thư mục mới tạo và xem được link này.');
            let mine = snap.docs.filter(d => d.data().ownerUid === me.uid && d.data().kind === kind);
            let history = hs?.exists && hs.data().ownerUid === me.uid ? (hs.data().items || []).map(histView) : [];
            // Dọn link hết hạn: chép cả lô vào lịch sử rồi xóa (một giao dịch)
            const dead = mine.filter(d => statusOf(d.data(), null) === 'expired');
            if (dead.length) {
                const items = await archiveMany(db, admin, dead.map(d => [d.id, d.data()]), 'expired').catch(() => null);
                if (items) { history = items.map(histView); mine = mine.filter(d => !dead.includes(d)); }
            }
            if (isList) {
                const prog = progressMap(ps.docs.filter(d => d.data().ownerUid === me.uid));
                const datas = await Promise.all(mine.map(d => settleOldFolder(db, admin, d.id, d.data())));   // link thư mục cũ → luật mới
                const links = mine.map((d, i) => view(d.id, datas[i], prog[d.id])).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                const requests = rs.docs.filter(d => d.data().ownerUid === me.uid && d.data().kind === kind)
                    .map(d => reqView(d.id, d.data())).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
                return send(res, 200, { ok: true, links, requests, history });
            }
            if (mine.length >= MAX_LINKS) throw err(400, `Mỗi mục tối đa ${MAX_LINKS} link — xóa bớt link cũ trước nhé.`);
            const token = crypto.randomBytes(24).toString('base64url');
            const l = newLinkDoc(Timestamp, me, kind, id, t, { hours: hoursOf(body.hours, 168), name: body.name, maxUses: body.maxUses,
                group: body.group === true, members: body.members });
            await db.doc(`share_links/${token}`).set(l);
            return send(res, 200, { ok: true, link: view(token, l) });
        }

        // ---------- CHỦ: sửa / gỡ máy / thu hồi link ----------
        if (['update', 'kick', 'revoke'].includes(action)) {
            const me = await verifyUser(req);
            const token = cleanId(body.token);
            const ref = db.doc(`share_links/${token}`);
            const s = await ref.get();
            if (!s.exists) return action === 'revoke' ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Link không còn (đã hết hạn hoặc thu hồi).' });
            const l = s.data();
            if (l.ownerUid !== me.uid) throw err(403, 'Không phải link của bạn.');

            if (action === 'revoke') {
                const items = await archive(db, admin, token, l, 'revoked');
                return send(res, 200, { ok: true, history: (items || []).map(histView) });
            }
            if (action === 'kick') {
                const uid = String(body.uid || '').replace(/[^\w-]/g, '').slice(0, 128);
                if (!uid) throw err(400, 'Thiếu máy cần gỡ');
                const out = await db.runTransaction(async (tx) => {
                    const x = (await tx.get(ref)).data();
                    const c = { ...claimsOf(x) };
                    delete c[uid];
                    const visits = { ...visitsOf(x) };
                    delete visits[uid];
                    const blocked = [...new Set([...(x.blocked || []), uid])].slice(-200);
                    tx.update(ref, { ...claimsPatch(admin, c), visits, blocked });
                    return { ...x, claims: c, visits, blocked };
                });
                await ungrant(db, admin, l, [uid]);
                return send(res, 200, { ok: true, link: view(token, out) });
            }
            // update
            if (statusOf(l, null) === 'expired') throw err(400, 'Link đã hết hạn — tạo link mới nhé.');
            const patch = {};
            if (body.name !== undefined) patch.name = cleanName(body.name);
            if (body.maxUses !== undefined) patch.maxUses = usesOf({ maxUses: body.maxUses });
            if (body.members !== undefined && l.group) patch.members = cleanMembers(body.members);
            if (body.hours !== undefined) {
                const h = hoursOf(body.hours, 168);
                patch.expiresAt = h ? Timestamp.fromMillis(Date.now() + h * 3600 * 1000) : null;
            }
            if (!Object.keys(patch).length) return send(res, 200, { ok: true, link: view(token, l) });
            await ref.update(patch);
            const next = { ...l, ...patch };
            // Gia hạn → quyền đã cấp cho từng người giữ đổi theo hạn mới
            if ('expiresAt' in patch) {
                await Promise.all(Object.keys(claimsOf(next)).map(uid => writeGrant(db, admin, uid, untilMs(next.expiresAt), next.gq || [], next.gf || [])));
            }
            return send(res, 200, { ok: true, link: view(token, next) });
        }

        // ---------- YÊU CẦU TRUY CẬP ----------
        if (action === 'request' || action === 'myRequest') {
            const me = await verifyUser(req);
            if (isAnon(me)) {
                if (action === 'myRequest') return send(res, 200, { status: 'none' });
                throw err(401, 'Cần đăng nhập tài khoản (Google hoặc tài khoản có sẵn) mới gửi được yêu cầu.');
            }
            let t;
            try { t = await requestTarget(db, body); }
            catch (e) { if (action === 'myRequest') return send(res, 200, { status: 'none' }); throw e; }
            if (t.ownerUid === me.uid) return send(res, 200, { status: 'owner' });
            const rref = db.doc(`access_requests/${reqIdOf(t.kind, t.id, me.uid)}`);
            const rs = await rref.get();
            const old = rs.exists ? rs.data() : null;
            // Đã duyệt mà link được cấp vẫn còn giữ suất cho mình → báo "approved" (kèm link để mở). Bị gỡ / thu hồi sau đó → coi như chưa xin.
            if (old?.status === 'approved' && old.grantToken) {
                const ls = await db.doc(`share_links/${old.grantToken}`).get();
                if (statusOf(ls.exists ? ls.data() : null, me.uid) === 'mine') return send(res, 200, { status: 'approved', token: old.grantToken });
            }
            if (action === 'myRequest') {
                return send(res, 200, { status: old && old.status !== 'approved' ? old.status : 'none', at: old ? ms(old.updatedAt) : null });
            }
            if (old?.status === 'pending' && Date.now() - (ms(old.updatedAt) || 0) < 60 * 1000) return send(res, 200, { status: 'pending' });
            const geo = geoOf(req);
            const now = Timestamp.now();
            await rref.set({
                kind: t.kind, targetId: t.id, ownerUid: t.ownerUid, title: t.title, token: t.token || null, linkName: t.linkName || '',
                uid: me.uid, email: String(me.email || '').slice(0, 120), name: String(me.name || '').slice(0, 80),
                message: String(body.message || '').trim().slice(0, 300), label: String(body.label || '').slice(0, 80),
                city: geo.city || '', country: geo.country || '', status: 'pending',
                createdAt: old?.createdAt || now, updatedAt: now, grantToken: null
            });
            return send(res, 200, { status: 'pending' });
        }

        if (action === 'approve' || action === 'deny') {
            const me = await verifyUser(req);
            const rid = String(body.id || '').replace(/[^\w-]/g, '').slice(0, 220);
            const rref = db.doc(`access_requests/${rid}`);
            const rs = await rref.get();
            if (!rs.exists) throw err(404, 'Yêu cầu không còn.');
            const r = rs.data();
            if (r.ownerUid !== me.uid) throw err(403, 'Không phải yêu cầu gửi cho bạn.');
            if (action === 'deny') {
                await rref.update({ status: 'denied', decidedAt: Timestamp.now() });
                return send(res, 200, { ok: true });
            }
            const t = await targetOf(db, r.kind, r.targetId, me.uid);
            if (!t) throw err(404, 'Bộ đề / thư mục đã bị xóa.');
            const entry = { at: Timestamp.now(), seen: null, label: r.label || '', city: r.city || '', country: r.country || '', anon: false,
                email: r.email || '', name: r.name || '', via: 'request' };
            let token = null, l = null;
            // Xin qua một link còn sống → thêm suất cho tài khoản này ngay trên link đó (hết suất thì nới thêm 1)
            if (r.token) {
                const ref = db.doc(`share_links/${r.token}`);
                token = await db.runTransaction(async (tx) => {
                    const s = await tx.get(ref);
                    const x = s.exists ? s.data() : null;
                    const st = statusOf(x, r.uid);
                    if (!x || x.ownerUid !== me.uid || x.targetId !== r.targetId || st === 'expired' || st === 'missing') return null;
                    const c = { ...claimsOf(x) };
                    // Link nhóm: người được duyệt mang tên tài khoản làm "tên trong nhóm" — chỉ khi tên đó hợp lệ (đúng danh sách, chưa ai làm bài
                    // bằng tên đó); không thì để trống, chủ vẫn thấy email (đỡ giành mất tên của thành viên thật)
                    const w = x.group ? checkWho(x, r.name || (r.email || '').split('@')[0], r.uid) : {};
                    if (!c[r.uid]) c[r.uid] = w.who ? { ...entry, who: w.who } : entry;
                    const blocked = (x.blocked || []).filter(u => u !== r.uid);
                    const maxUses = Math.min(MAX_USES, Math.max(usesOf(x), Object.keys(c).length));
                    tx.update(ref, { ...claimsPatch(admin, c), blocked, maxUses });
                    l = { ...x, claims: c, blocked, maxUses };
                    return r.token;
                });
            }
            // Không có link (xin từ trang bộ đề / thư mục) hoặc link đã chết → tạo link riêng mang tên người xin, giữ sẵn suất cho họ
            if (!token) {
                token = crypto.randomBytes(24).toString('base64url');
                l = newLinkDoc(Timestamp, me, r.kind, r.targetId, t, {
                    hours: hoursOf(body.hours, 168), name: r.name || (r.email || '').split('@')[0], maxUses: 1, claims: { [r.uid]: entry }
                });
                await db.doc(`share_links/${token}`).set(l);
            }
            const ref = db.doc(`share_links/${token}`);
            await grant(db, admin, ref, l, r.uid, r.kind === 'quiz' ? { q: [r.targetId] } : { f: [r.targetId] });
            await rref.update({ status: 'approved', grantToken: token, decidedAt: Timestamp.now() });
            return send(res, 200, { ok: true, token, link: view(token, l) });
        }

        if (action === 'inbox') {
            const me = await verifyUser(req);
            const rs = await db.collection('access_requests').where('ownerUid', '==', me.uid).where('status', '==', 'pending').limit(50).get();
            const requests = rs.docs.map(d => reqView(d.id, d.data())).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
            return send(res, 200, { ok: true, requests });
        }

        // ---------- NGƯỜI NHẬN ----------
        const token = cleanId(body.token);
        if (!token) throw err(400, 'Thiếu mã link');
        const ref = db.doc(`share_links/${token}`);

        if (action === 'peek') {
            const me = await optionalUser(req);
            const s = await ref.get();
            const l = await settleOldFolder(db, admin, token, s.exists ? s.data() : null);
            const status = statusOf(l, me?.uid);
            if (!l) {
                // Đã vào lịch sử → báo đúng lý do (người mở vẫn xin quyền được)
                const old = await historyOf(db, token).catch(() => null);
                if (!old) return send(res, 200, { status });
                return send(res, 200, { status: old.e.reason === 'revoked' ? 'revoked' : 'expired', kind: old.h.kind, title: old.h.title || '', name: old.e.name || '' });
            }
            if (status === 'expired') await archive(db, admin, token, l, 'expired').catch(() => {});
            return send(res, 200, {
                status, kind: l.kind, title: l.title || '', count: l.count ?? null, ownerName: l.ownerName || '',
                name: l.name || '', maxUses: usesOf(l), used: Object.keys(claimsOf(l)).length, visitor: isVisitor(l, me?.uid),
                // Số máy KHÁC đã vào xem nhưng chưa làm (chưa tốn suất) — trang cổng báo cho người mở biết
                viewers: Object.keys(visitsOf(l)).filter(u => u !== me?.uid && !claimsOf(l)[u]).length,
                ...(l.group ? { group: true, members: l.members || [], taken: takenWho(l) } : {}),
                // targetId cho máy đã giữ suất / đã vào xem → trang cổng chuyển thẳng tới thư mục, khỏi gọi thêm 'visit'
                expiresAt: untilMs(l.expiresAt), ...(status === 'mine' || status === 'owner' || isVisitor(l, me?.uid) ? { targetId: l.targetId } : {})
            });
        }

        // LINK THƯ MỤC: vào xem → ghi nhận "đã vào" cho chủ thấy, KHÔNG chiếm suất (làm bài mới 'claim').
        // Chỉ vào được khi link còn suất (hết suất thì máy mới vào cũng không làm được bài → trang cổng báo + xin quyền).
        if (action === 'visit') {
            const me = await verifyUser(req);
            const geo = geoOf(req);
            const label = String(body.label || '').slice(0, 80);
            const out = await db.runTransaction(async (tx) => {
                const s = await tx.get(ref);
                const l = s.exists ? s.data() : null;
                const st = statusOf(l, me.uid);
                if (st !== 'ok') return { st, l };
                if (l.kind !== 'folder') return { st: 'notFolder', l };
                // Đã vào trước đó → KHÔNG ghi gì ở đây (lượt vào + "mở gần nhất" đếm ở action 'folder' khi mở thư mục gốc)
                if (visitsOf(l)[me.uid]) return { st: 'visitor', l };
                const now = Timestamp.now();
                const v = { ...visitsOf(l) };
                let who = '';
                if (l.group) {
                    const w = checkWho(l, body.who, me.uid);
                    if (w.st) return { st: w.st, l };
                    who = w.who;
                }
                // Gọn: chỉ lưu trường có giá trị (thiếu email = máy ẩn danh) — đỡ dung lượng doc + băng thông khi chủ xem danh sách
                v[me.uid] = compact({ at: now, seen: now, n: 1, label, city: geo.city, country: geo.country,
                    email: isAnon(me) ? '' : String(me.email || '').slice(0, 120), name: isAnon(me) ? '' : String(me.name || '').slice(0, 80), who });
                // Quá nhiều máy chỉ xem → bỏ máy vào lâu nhất
                const uids = Object.keys(v);
                if (uids.length > MAX_VISITS) uids.sort((a, b) => (ms(v[a].seen) || 0) - (ms(v[b].seen) || 0))
                    .slice(0, uids.length - MAX_VISITS).forEach(u => delete v[u]);
                tx.update(ref, { visits: v });
                return { st: 'visitor', l };
            });
            const { st, l } = out;
            if (st === 'expired') await archive(db, admin, token, l, 'expired').catch(() => {});
            if (st === 'missing') {
                const old = await historyOf(db, token).catch(() => null);
                if (old) return send(res, 200, { status: old.e.reason === 'revoked' ? 'revoked' : 'expired' });
            }
            if (st === 'notFolder') throw err(400, 'Link này không phải thư mục');
            if (!['visitor', 'mine', 'owner'].includes(st)) return send(res, 200, { status: st });
            if (!await targetOf(db, l.kind, l.targetId, l.ownerUid)) return send(res, 200, { status: 'missing' });
            return send(res, 200, { status: st, kind: l.kind, targetId: l.targetId });
        }

        if (action === 'claim') {
            const me = await verifyUser(req);
            const geo = geoOf(req);
            const label = String(body.label || '').slice(0, 80);
            // Giao dịch: hai máy bấm cùng lúc giành suất cuối (hay cùng một tên trong nhóm) thì chỉ MỘT máy giữ được
            const out = await db.runTransaction(async (tx) => {
                const s = await tx.get(ref);
                const l = s.exists ? s.data() : null;
                const st = statusOf(l, me.uid);
                if (st !== 'ok' && st !== 'mine') return { st, l };
                const now = Timestamp.now();
                const c = { ...claimsOf(l) };
                // Máy đã VÀO XEM thư mục (visits) giờ bắt đầu làm bài → giữ tên đã xưng, lần vào đầu tiên ghi ở `in`
                const v = st === 'ok' ? visitsOf(l)[me.uid] : null;
                // Link nhóm: máy mới phải xưng tên; có danh sách thì tên phải nằm trong đó; mỗi tên một máy.
                // Máy đã vào xem dùng lại tên đã xưng — vẫn kiểm lại vì tên đó có thể vừa bị máy khác làm bài trước
                let who = v?.who || '';
                if (st === 'ok' && l.group) {
                    const w = checkWho(l, who || body.who, me.uid);
                    if (w.st) {
                        // Bỏ lượt xem cũ → trang cổng hiện lại danh sách để chọn tên khác
                        if (v) tx.update(ref, { [`visits.${me.uid}`]: admin.firestore.FieldValue.delete() });
                        return { st: w.st, l };
                    }
                    who = w.who;
                }
                const old = c[me.uid];
                if (st === 'mine' && Date.now() - (ms(old.seen) || 0) < SEEN_GAP_MS) return { st: 'mine', l };   // tải lại liền: khỏi ghi
                c[me.uid] = st === 'mine' ? { ...old, seen: now, n: (old.n || 1) + 1 }
                    : { at: now, seen: now, n: v?.n || 1, label, city: geo.city || '', country: geo.country || '', anon: isAnon(me),
                        email: isAnon(me) ? '' : String(me.email || '').slice(0, 120), name: isAnon(me) ? '' : String(me.name || '').slice(0, 80),
                        ...(who ? { who } : {}), ...(v?.at ? { in: v.at } : {}), via: 'link' };
                const patch = claimsPatch(admin, c);
                if (v) patch[`visits.${me.uid}`] = admin.firestore.FieldValue.delete();
                tx.update(ref, patch);
                return { st: 'mine', l: { ...l, claims: c } };
            });
            const { st, l } = out;
            if (st === 'expired') await archive(db, admin, token, l, 'expired').catch(() => {});
            if (st === 'missing') {
                const old = await historyOf(db, token).catch(() => null);
                if (old) return send(res, 200, { status: old.e.reason === 'revoked' ? 'revoked' : 'expired' });
            }
            if (st !== 'mine' && st !== 'owner') return send(res, 200, { status: st });
            if (st === 'owner') return send(res, 200, { status: st, kind: l.kind, targetId: l.targetId });
            if (!await targetOf(db, l.kind, l.targetId, l.ownerUid)) return send(res, 200, { status: 'missing' });
            await grant(db, admin, ref, l, me.uid, l.kind === 'quiz' ? { q: [l.targetId] } : { f: [l.targetId] });
            return send(res, 200, { status: st, kind: l.kind, targetId: l.targetId });
        }

        // Người giữ link nộp bài → ghi điểm cho chủ xem (chỉ khi máy đang giữ link và bộ đề nằm trong phạm vi link)
        if (action === 'progress') {
            const me = await verifyUser(req);
            const quizId = cleanId(body.quizId);
            const s = await ref.get();
            const l = s.exists ? s.data() : null;
            const st = statusOf(l, me.uid);
            if (st !== 'mine') return send(res, 200, { ok: false, status: st });
            const inScope = l.kind === 'quiz' ? l.targetId === quizId : (l.gq || []).includes(quizId);
            if (!quizId || !inScope) return send(res, 200, { ok: false, status: 'scope' });
            const pct = Math.round(Math.min(100, Math.max(0, Number(body.pct) || 0)) * 10) / 10;
            const pref = db.doc(`link_progress/${token}_${me.uid}`);
            const ps = await pref.get();
            const old = (ps.exists ? ps.data().quizzes || {} : {})[quizId] || {};
            const now = Timestamp.now();
            await pref.set({
                token, uid: me.uid, kind: l.kind, targetId: l.targetId, ownerUid: l.ownerUid,
                quizzes: { [quizId]: {
                    title: String(body.title || old.title || '').slice(0, 200), n: (old.n || 0) + 1,
                    best: Math.max(old.best ?? 0, pct), last: pct, total: Math.max(0, Math.round(Number(body.total) || 0)),
                    first: old.first || now, at: now
                } }
            }, { merge: true });
            if (l.claims) {
                const FP = admin.firestore.FieldPath;
                const args = [new FP('claims', me.uid, 'seen'), now];
                // Nộp xong đề đang làm → bỏ dấu "đang làm" (cùng lượt ghi, không tốn thêm)
                if (l.claims[me.uid]?.go?.q === quizId) args.push(new FP('claims', me.uid, 'go'), admin.firestore.FieldValue.delete());
                await ref.update(...args).catch(() => {});
            }
            return send(res, 200, { ok: true });
        }

        // Người giữ link BẤM BẮT ĐẦU làm một đề (chế độ thường) → claims.<uid>.go = { q, t, at } cho chủ thấy "đang làm đề nào, từ lúc nào".
        // Chỉ giữ đề gần nhất (ghi đè), nộp bài thì 'progress' xoá. Tiếp tục bài dở (cùng giờ bắt đầu) → khỏi ghi.
        if (action === 'start') {
            const me = await verifyUser(req);
            const quizId = cleanId(body.quizId);
            const s = await ref.get();
            const l = s.exists ? s.data() : null;
            const st = statusOf(l, me.uid);
            if (st !== 'mine' || !l.claims) return send(res, 200, { ok: false, status: st });
            const inScope = l.kind === 'quiz' ? l.targetId === quizId : (l.gq || []).includes(quizId);
            if (!quizId || !inScope) return send(res, 200, { ok: false, status: 'scope' });
            const now = Date.now();
            const at = Math.min(now, Math.max(now - 12 * 3600000, Number(body.at) || now));
            const go = l.claims[me.uid]?.go;
            if (go?.q === quizId && Math.abs((ms(go.at) || 0) - at) < SEEN_GAP_MS) return send(res, 200, { ok: true });
            const FP = admin.firestore.FieldPath;
            await ref.update(new FP('claims', me.uid, 'go'), { q: quizId, t: String(body.title || '').slice(0, 120), at: Timestamp.fromMillis(at) },
                new FP('claims', me.uid, 'seen'), Timestamp.now());
            return send(res, 200, { ok: true });
        }

        if (action === 'folder') {
            const me = await verifyUser(req);
            const s = await ref.get();
            const l = await settleOldFolder(db, admin, token, s.exists ? s.data() : null);
            // Máy đã vào xem (chưa chiếm suất) duyệt được thư mục nhưng KHÔNG được cấp quyền đọc bộ đề — làm bài phải 'claim' trước
            const st = statusOf(l, me.uid) === 'ok' && isVisitor(l, me.uid) ? 'visitor' : statusOf(l, me.uid);
            if (!['mine', 'owner', 'visitor'].includes(st)) return send(res, st === 'ok' ? 401 : 403, { status: st === 'ok' ? 'unclaimed' : st });
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
            const [subSnap, setSnap, progSnap] = await Promise.all([
                db.collection('quiz_folders').where('parentId', '==', folderId).where('userId', '==', l.ownerUid).get(),
                db.collection('quiz_sets').where('folderId', '==', folderId).where('userId', '==', l.ownerUid)
                    .select('title', 'questionCount', 'deleted').get(),
                // Nhật ký làm bài của CHÍNH máy này trên link (1 doc) — chỉ máy giữ suất mới nộp bài được
                st === 'mine' ? db.doc(`link_progress/${token}_${me.uid}`).get().catch(() => null) : null
            ]);
            const subFolders = subSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(f => !f.deleted)
                .map(f => ({ id: f.id, name: f.name || '', color: f.color || '', icon: f.icon || '' }));
            const quizzes = setSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(q => !q.deleted)
                .map(q => ({ id: q.id, title: q.title || '', questionCount: q.questionCount || 0 }));
            if (st === 'mine') {
                await grant(db, admin, ref, l, me.uid, { f: [folderId, ...subFolders.map(f => f.id)], q: quizzes.map(q => q.id) });
            }
            // "Mở gần nhất" + LƯỢT VÀO (đếm khi mở thư mục gốc) — MỘT lần ghi; tải lại / đi qua lại trong 1 phút thì không ghi.
            // Link cũ một-máy (chưa có claims) thì thôi — lần claim sau tự đổi sang kiểu mới.
            const rec0 = st === 'visitor' ? visitsOf(l)[me.uid] : st === 'mine' ? claimsOf(l)[me.uid] : null;
            const field = st === 'visitor' ? 'visits' : st === 'mine' && l.claims ? 'claims' : '';
            const rec = field ? (field === 'visits' ? visitsOf(l) : l.claims)[me.uid] : null;
            if (rec && Date.now() - (ms(rec.seen) || 0) >= SEEN_GAP_MS) {
                const FP = admin.firestore.FieldPath;
                const args = [new FP(field, me.uid, 'seen'), Timestamp.now()];
                if (folderId === l.targetId) args.push(new FP(field, me.uid, 'n'), admin.firestore.FieldValue.increment(1));
                await ref.update(...args).catch(() => {});
            }
            return send(res, 200, {
                status: st, root: l.targetId, expiresAt: untilMs(l.expiresAt),
                // Trang thư mục hiện đúng kiểu link (riêng / nhóm), tên link và tên đã xác nhận của máy này — không nêu người gửi
                link: { name: l.name || '', group: !!l.group, maxUses: usesOf(l), who: (claimsOf(l)[me.uid] || visitsOf(l)[me.uid])?.who || '',
                    // Máy này từng vào xem trước đây (không phải lần đầu ngay lúc này) mà chưa làm → trang thư mục nhắc "chưa mất suất"
                    back: st === 'visitor' && Date.now() - (ms(visitsOf(l)[me.uid]?.at) || 0) > SEEN_GAP_MS,
                    used: Object.keys(claimsOf(l)).length },
                folder: { id: folderId, name: folder.name || '', color: folder.color || '', icon: folder.icon || '', parentId: folderId === l.targetId ? null : (folder.parentId || null) },
                ownerName: l.ownerName || '', subFolders, quizzes,
                // HỒ SƠ của chính máy này trên link — người mở tự xem đúng những gì chủ link thấy về mình (trang thư mục: bảng "Hồ sơ của bạn")
                me: rec0 ? {
                    who: rec0.who || '', email: rec0.email || '', anon: !rec0.email, label: rec0.label || '',
                    first: ms(rec0.in) || ms(rec0.at), claimed: st === 'mine' ? ms(rec0.at) : null
                } : null,
                done: progSnap?.exists ? doneView(progSnap.data().quizzes) : []
            });
        }

        // Máy ĐANG VÀO XEM (chưa làm bài nào → chưa tốn suất) tự xoá lượt vào của mình: link nhóm xưng nhầm tên → về trang cổng chọn lại.
        // Máy đã giữ suất thì không tự gỡ được (tránh chuyền link 1 máy sang máy khác) — chủ link gỡ bằng 'kick'.
        if (action === 'unvisit') {
            const me = await verifyUser(req);
            const s = await ref.get();
            const l = s.exists ? s.data() : null;
            if (!l || !visitsOf(l)[me.uid] || claimsOf(l)[me.uid]) return send(res, 200, { ok: false });
            await ref.update(new admin.firestore.FieldPath('visits', me.uid), admin.firestore.FieldValue.delete());
            return send(res, 200, { ok: true });
        }

        throw err(400, 'action không hợp lệ');
    } catch (e) {
        return send(res, e.status || 500, { error: e.message || 'Lỗi máy chủ' });
    }
};
