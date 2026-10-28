// POST /api/devices — GIỚI HẠN THIẾT BỊ phía máy chủ (core/device-limit.js gọi). Header: Authorization: Bearer <ID token Firebase>.
//
// Doc users/{uid}/private/devices = { list: [{ id, label, at, authTime, ip, city, country }], authTimes: [số] } — CHỈ máy chủ ghi
// (firestore.rules chặn mọi lệnh ghi từ app). `authTime` = auth_time trong token đã xác minh: mỗi lần đăng nhập trên một máy có mốc riêng,
// không giả được. Luật sharedWithMe() đòi auth_time của phiên nằm trong `authTimes` → máy bị đẩy ra KHÔNG đọc được đề chia sẻ nữa,
// kể cả khi sửa code app. Chỉ phiên đăng nhập bằng Google mới được ghi (chống cho mượn tài khoản mật khẩu).
//
// Body { action, ... }:
//   register  { deviceId, label, fresh }  — ghi / cập nhật máy này; fresh=true (vừa đăng nhập) thì đẩy máy cũ nhất ra nếu quá giới hạn
//   release   { deviceId }                — đăng xuất máy này (nhả chỗ)
//   remove    { deviceId }                — đăng xuất từ xa một máy khác của CHÍNH MÌNH
//   adminRemove { uid, deviceId? }        — admin đăng xuất một máy (hoặc mọi máy) của người khác
const { init, verifyUser, isAdminEmail, isAdminToken, geoOf, send, readJson, autoApprove } = require('./_lib/admin');

const MAX_DEVICES = 2;
const EXEMPT_MAX = 20;
const LOGIN_KEEP = 15;
const ALERT_WINDOW_MS = 2 * 60 * 60 * 1000;
const cleanId = (s) => String(s || '').replace(/[^\w-]/g, '').slice(0, 40);
const placeOf = (e) => [e?.city, e?.country].filter(Boolean).join(', ');

async function isExemptToken(db, token) {
    if (isAdminToken(token) || isAdminEmail(token?.email)) return true;
    try {
        const s = await db.doc('config/access').get();
        const list = s.exists && Array.isArray(s.data().deviceExempt) ? s.data().deviceExempt : [];
        return list.includes(String(token?.email || '').toLowerCase());
    } catch (e) { return false; }
}

async function limitFor(db, token) {
    return (await isExemptToken(db, token)) ? EXEMPT_MAX : MAX_DEVICES;
}

const pack = (list) => ({ list, authTimes: list.map(d => d.authTime).filter(n => typeof n === 'number') });

async function removeFrom(db, uid, pred) {
    const ref = db.doc(`users/${uid}/private/devices`);
    await db.runTransaction(async (tx) => {
        const s = await tx.get(ref);
        const list = s.exists && Array.isArray(s.data().list) ? s.data().list : [];
        tx.set(ref, pack(list.filter(d => !pred(d))));
    });
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
    try {
        const token = await verifyUser(req);
        const { db, admin } = init();
        const body = await readJson(req);
        const uid = token.uid;

        if (body.action === 'adminRemove') {
            if (!isAdminToken(token)) return send(res, 403, { error: 'Chỉ admin' });
            const target = cleanId(body.uid);
            if (!target) return send(res, 400, { error: 'Thiếu uid' });
            const dev = cleanId(body.deviceId);
            await removeFrom(db, target, d => !dev || d.id === dev);
            return send(res, 200, { ok: true });
        }
        if (body.action === 'release' || body.action === 'remove') {
            const dev = cleanId(body.deviceId);
            if (!dev) return send(res, 400, { error: 'Thiếu deviceId' });
            await removeFrom(db, uid, d => d.id === dev);
            return send(res, 200, { ok: true });
        }
        if (body.action !== 'register') return send(res, 400, { error: 'action không hợp lệ' });

        const exempt = await isExemptToken(db, token);
        if (token.firebase?.sign_in_provider !== 'google.com' && !exempt) return send(res, 403, { error: 'google-required' });
        if (exempt && !token.email_verified) {
            try { await init().auth.updateUser(uid, { emailVerified: true }); } catch (e) {}
        }
        const me = cleanId(body.deviceId);
        if (!me) return send(res, 400, { error: 'Thiếu deviceId' });
        const label = String(body.label || 'Thiết bị').slice(0, 80);
        const authTime = Number(token.auth_time) || 0;
        const geo = geoOf(req);
        const limit = exempt ? EXEMPT_MAX : MAX_DEVICES;
        const now = Date.now();
        const devRef = db.doc(`users/${uid}/private/devices`);
        const logRef = db.doc(`users/${uid}/private/logins`);

        const out = await db.runTransaction(async (tx) => {
            const ds = await tx.get(devRef);
            const ls = await tx.get(logRef);
            let list = ds.exists && Array.isArray(ds.data().list) ? ds.data().list.filter(d => d && d.id) : [];
            const idx = list.findIndex(d => d.id === me);
            let newLogin = false;
            if (idx >= 0) {
                newLogin = list[idx].authTime !== authTime;          // đăng nhập lại trên cùng máy
                list[idx] = { ...list[idx], label, authTime, ...(newLogin ? geo : {}) };
            } else {
                if (!body.fresh && list.length >= limit) return { list, present: false };   // mở app với phiên cũ mà đã đủ máy
                list = [...list, { id: me, label, at: now, authTime, ...geo }].sort((a, b) => (a.at || 0) - (b.at || 0)).slice(-limit);
                newLogin = true;
            }
            tx.set(devRef, pack(list));
            if (newLogin) {
                const prev = ls.exists && Array.isArray(ls.data().list) ? ls.data().list : [];
                const odd = prev.find(p => p.device !== me && now - (p.at || 0) < ALERT_WINDOW_MS
                    && ((p.country && geo.country && p.country !== geo.country) || (p.city && geo.city && p.city !== geo.city)));
                const entry = { at: now, device: me, label, ...geo,
                    ...(odd ? { alert: `Trong 2 giờ có đăng nhập ở ${placeOf(odd) || 'nơi khác'} và ${placeOf(geo) || 'nơi khác'}` } : {}) };
                tx.set(logRef, { list: [entry, ...prev].slice(0, LOGIN_KEEP) });
                // users/{uid}.email: để admin tra cứu theo email
                tx.set(db.doc(`users/${uid}`), { email: String(token.email || '').toLowerCase(), lastLoginAt: admin.firestore.Timestamp.fromMillis(now) }, { merge: true });
            }
            return { list, present: list.some(d => d.id === me) };
        });
        // Tài khoản có từ trước cổng duyệt (api/signup.js) → duyệt tự động; app thấy claimsChanged thì làm mới token
        let claimsChanged = false;
        try { claimsChanged = await autoApprove(token); } catch (e) { /* lần sau thử lại */ }
        return send(res, 200, { ok: true, limit, present: out.present, list: out.list, claimsChanged, approved: token.approved === true || claimsChanged });
    } catch (e) {
        return send(res, e.status || 500, { error: e.message || 'Lỗi máy chủ' });
    }
};
