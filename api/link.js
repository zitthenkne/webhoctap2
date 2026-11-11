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
//   folder    { token, folderId }             — người giữ link mở một thư mục trong nhánh: { status, folder, subFolders, quizzes }
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
const takenWho = (l) => Object.values(claimsOf(l)).map(x => x.who).filter(Boolean);

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

function view(token, l) {
    const claims = Object.entries(claimsOf(l)).map(([uid, x]) => ({
        uid, at: ms(x.at), seen: ms(x.seen), label: x.label || '', city: x.city || '', country: x.country || '',
        anon: !!x.anon, email: x.email || '', name: x.name || '', who: x.who || '', via: x.via || ''
    })).sort((a, b) => (a.at || 0) - (b.at || 0));
    return {
        token, kind: l.kind, targetId: l.targetId, status: statusOf(l, null), name: l.name || '', maxUses: usesOf(l),
        group: !!l.group, members: l.members || [],
        createdAt: ms(l.createdAt), expiresAt: ms(l.expiresAt), claims
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
    await Promise.all(pairs.map(([, l]) => ungrant(db, admin, l)));
    const entries = pairs.map(([token, l]) => ({
        token, name: l.name || '', maxUses: usesOf(l), group: !!l.group, createdAt: l.createdAt || null, expiresAt: l.expiresAt || null,
        endedAt: Timestamp.now(), reason,
        opens: Object.values(claimsOf(l)).map(x => ({
            who: x.who || x.email || x.name || '', label: x.label || '', place: [x.city, x.country].filter(Boolean).join(', '),
            at: x.at || null, seen: x.seen || null, via: x.via || ''
        }))
    }));
    const tokens = new Set(entries.map(e => e.token));
    const href = db.doc(`link_history/${histIdOf(l0.kind, l0.targetId)}`);
    return db.runTransaction(async (tx) => {
        const s = await tx.get(href);
        const h = s.exists ? s.data() : {};
        const items = [...entries, ...(h.items || []).filter(x => !tokens.has(x.token))].slice(0, HIST_MAX);
        tx.set(href, { kind: l0.kind, targetId: l0.targetId, ownerUid: l0.ownerUid, title: l0.title || h.title || '', items, tokens: items.map(x => x.token) });
        tokens.forEach(t => tx.delete(db.doc(`share_links/${t}`)));
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
        opens: (e.opens || []).map(o => ({ who: o.who || '', label: o.label || '', place: o.place || '', at: ms(o.at), seen: ms(o.seen), via: o.via || '' }))
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
        if (l.group) {
            title = `${l.name ? `Gửi ${l.name}: các bạn` : 'Các bạn'} được mời ${verb} ${what} trên Zitthenkne`.replace(/\s+/g, ' ');
            desc = 'Link truy cập nhóm — mỗi thành viên xác nhận tên và sử dụng trên 1 thiết bị.';
        } else {
            title = `${l.name ? `Gửi bạn ${l.name}, bạn` : 'Bạn'} được mời ${verb} ${what} trên Zitthenkne`.replace(/\s+/g, ' ');
            desc = `Link truy cập riêng, sử dụng được trên ${uses} thiết bị.`;
        }
    } else if (l) {
        desc = st === 'expired' ? 'Link này đã hết hạn.' : 'Link này không còn hiệu lực.';
    }
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'zitthenkne.vercel.app';
    const origin = `${String(host).includes('localhost') ? 'http' : 'https'}://${host}`;
    const target = `/features/quiz/link.html?t=${encodeURIComponent(token)}`;
    const T = escHtml(title), D = escHtml(desc), img = `${origin}/assets/og_squirrel_study.jpg`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(`<!DOCTYPE html>
<html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${T}</title>
<meta property="og:type" content="website"><meta property="og:site_name" content="Zitthenkne"><meta property="og:locale" content="vi_VN">
<meta property="og:title" content="${T}"><meta property="og:description" content="${D}">
<meta property="og:url" content="${escHtml(origin + req.url)}"><meta property="og:image" content="${img}"><meta property="og:image:alt" content="${T}">
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
            const [t, snap, rs, hs] = await Promise.all([
                targetOf(db, kind, id, me.uid),
                db.collection('share_links').where('targetId', '==', id).get(),
                isList ? db.collection('access_requests').where('targetId', '==', id).where('status', '==', 'pending').get() : null,
                isList ? db.doc(`link_history/${histIdOf(kind, id)}`).get() : null
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
                const links = mine.map(d => view(d.id, d.data())).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
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
                    const blocked = [...new Set([...(x.blocked || []), uid])].slice(-200);
                    tx.update(ref, { ...claimsPatch(admin, c), blocked });
                    return { ...x, claims: c, blocked };
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
                    // Link nhóm: người được duyệt mang tên tài khoản làm "tên trong nhóm"
                    if (!c[r.uid]) c[r.uid] = x.group ? { ...entry, who: cleanName(r.name || (r.email || '').split('@')[0]).slice(0, 40) } : entry;
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
            const l = s.exists ? s.data() : null;
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
                name: l.name || '', maxUses: usesOf(l), used: Object.keys(claimsOf(l)).length,
                ...(l.group ? { group: true, members: l.members || [], taken: takenWho(l) } : {}),
                expiresAt: untilMs(l.expiresAt), ...(status === 'mine' || status === 'owner' ? { targetId: l.targetId } : {})
            });
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
                // Link nhóm: máy mới phải xưng tên; có danh sách thì tên phải nằm trong đó; mỗi tên một máy
                let who = '';
                if (st === 'ok' && l.group) {
                    who = cleanName(body.who).slice(0, 40);
                    if (!who) return { st: 'needWho', l };
                    const members = l.members || [];
                    if (members.length) {
                        who = members.find(m => whoKey(m) === whoKey(who)) || '';
                        if (!who) return { st: 'notMember', l };
                    }
                    if (takenWho(l).some(x => whoKey(x) === whoKey(who))) return { st: 'whoTaken', l };
                }
                c[me.uid] = st === 'mine' ? { ...c[me.uid], seen: now }
                    : { at: now, seen: now, label, city: geo.city || '', country: geo.country || '', anon: isAnon(me),
                        email: isAnon(me) ? '' : String(me.email || '').slice(0, 120), name: isAnon(me) ? '' : String(me.name || '').slice(0, 80),
                        ...(who ? { who } : {}), via: 'link' };
                tx.update(ref, claimsPatch(admin, c));
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
                // Link kiểu mới: ghi "mở gần nhất" thẳng vào claims.<uid>.seen (link cũ một-máy thì thôi — lần claim sau tự đổi sang kiểu mới)
                if (l.claims) await ref.update(new admin.firestore.FieldPath('claims', me.uid, 'seen'), Timestamp.now()).catch(() => {});
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
