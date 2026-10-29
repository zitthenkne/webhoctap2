// POST /api/devices — GIỚI HẠN THIẾT BỊ & QUẢN TRỊ TÀI KHOẢN phía máy chủ (core/device-limit.js, features/profile/profile.js gọi).
// Header: Authorization: Bearer <ID token Firebase>.
//
// Doc users/{uid}/private/devices = { list: [{ id, label, at, authTime, ip, city, country }], authTimes: [số] } — CHỈ máy chủ ghi
// (firestore.rules chặn mọi lệnh ghi từ app). `authTime` = auth_time trong token đã xác minh: mỗi lần đăng nhập trên một máy có mốc riêng,
// không giả được. Luật sharedWithMe() đòi auth_time của phiên nằm trong `authTimes` → máy bị đẩy ra KHÔNG đọc được đề chia sẻ nữa,
// kể cả khi sửa code app.
//
// Quyền đặc biệt trong doc `config/access`:
//   • passwordAllowed: [email] — được đăng nhập thẳng bằng Email + Mật khẩu (không bắt qua Google), vẫn giữ giới hạn 2 máy nếu không có trong deviceExempt.
//   • deviceExempt:    [email] — được dùng tối đa EXEMPT_MAX (20) máy (kiêm miễn Google nếu chưa bật riêng).
//   • deviceLimits:    { email: n } — số máy RIÊNG của từng tài khoản (1..20), admin chỉnh ở trang Quản trị; ưu tiên hơn deviceExempt.
//   • defaultLimit:    n — số máy mặc định cho mọi tài khoản còn lại (thiếu = MAX_DEVICES).
const { init, verifyUser, isAdminEmail, isAdminToken, ADMIN_EMAILS, geoOf, send, readJson, setApproved, autoApprove } = require('./_lib/admin');

const MAX_DEVICES = 2;
const EXEMPT_MAX = 20;
const LOGIN_KEEP = 15;
const ALERT_WINDOW_MS = 2 * 60 * 60 * 1000;
const cleanId = (s) => String(s || '').replace(/[^\w-]/g, '').slice(0, 40);
const normEmail = (s) => String(s || '').trim().toLowerCase();
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normEmail(s));
const nameKey = (name) => encodeURIComponent(String(name || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase());
const placeOf = (e) => [e?.city, e?.country].filter(Boolean).join(', ');

const okLimit = (n) => Number.isInteger(n) && n >= 1 && n <= EXEMPT_MAX;

// QUYỀN DÙNG TÍNH NĂNG — custom claim `feat` = { quiz, create, room, record } (khớp can() trong firestore.rules và core/features.js).
// Thiếu claim = mặc định: làm đề + học nhóm mở, tạo đề + bệnh án tắt. Admin luôn mở hết.
const FEATURE_KEYS = ['quiz', 'create', 'room', 'record'];
const DEFAULT_FEATURES = { quiz: true, create: false, room: true, record: false };
const normFeatures = (f) => {
    const src = f && typeof f === 'object' ? f : DEFAULT_FEATURES;
    return Object.fromEntries(FEATURE_KEYS.map(k => [k, src[k] === true]));
};

async function getAccessConfig(db) {
    try {
        const s = await db.doc('config/access').get();
        const d = s.exists ? s.data() || {} : {};
        const limits = {};
        for (const [k, v] of Object.entries(d.deviceLimits && typeof d.deviceLimits === 'object' ? d.deviceLimits : {})) {
            if (okLimit(v)) limits[normEmail(k)] = v;
        }
        return {
            deviceExempt: Array.isArray(d.deviceExempt) ? d.deviceExempt.map(normEmail) : [],
            passwordAllowed: Array.isArray(d.passwordAllowed) ? d.passwordAllowed.map(normEmail) : [],
            deviceLimits: limits,
            defaultLimit: okLimit(d.defaultLimit) ? d.defaultLimit : MAX_DEVICES
        };
    } catch (e) {
        return { deviceExempt: [], passwordAllowed: [], deviceLimits: {}, defaultLimit: MAX_DEVICES };
    }
}

function canUsePassword(cfg, emailOrToken) {
    const email = typeof emailOrToken === 'string' ? normEmail(emailOrToken) : normEmail(emailOrToken?.email);
    if (!email) return false;
    if (isAdminEmail(email) || (typeof emailOrToken === 'object' && isAdminToken(emailOrToken))) return true;
    return cfg.passwordAllowed.includes(email) || cfg.deviceExempt.includes(email);
}

function hasUnlimitedDevices(cfg, emailOrToken) {
    const email = typeof emailOrToken === 'string' ? normEmail(emailOrToken) : normEmail(emailOrToken?.email);
    if (!email) return false;
    if (isAdminEmail(email) || (typeof emailOrToken === 'object' && isAdminToken(emailOrToken))) return true;
    return cfg.deviceExempt.includes(email);
}

/** Số máy được dùng: admin → EXEMPT_MAX; số riêng (deviceLimits) → số đó; deviceExempt → EXEMPT_MAX; còn lại defaultLimit. */
function limitFor(cfg, emailOrToken) {
    const email = typeof emailOrToken === 'string' ? normEmail(emailOrToken) : normEmail(emailOrToken?.email);
    if (isAdminEmail(email) || (typeof emailOrToken === 'object' && isAdminToken(emailOrToken))) return EXEMPT_MAX;
    if (okLimit(cfg.deviceLimits[email])) return cfg.deviceLimits[email];
    return hasUnlimitedDevices(cfg, emailOrToken) ? EXEMPT_MAX : cfg.defaultLimit;
}

const pack = (list) => ({ list, authTimes: list.map(d => d.authTime).filter(n => typeof n === 'number') });

/** Nhật ký quản trị (admin_log — trang Quản trị đọc): ai làm gì với tài khoản nào. Không bao giờ ghi mật khẩu. Lỗi ghi log không chặn thao tác. */
async function audit(db, admin, token, action, target, detail = {}) {
    try {
        await db.collection('admin_log').add({
            at: admin.firestore.Timestamp.now(), by: normEmail(token.email), action,
            target: String(target || '').slice(0, 200), detail
        });
    } catch (e) {}
}

/** Hạ giới hạn máy: chỉ giữ `n` máy đăng nhập GẦN NHẤT, máy cũ hơn bị đẩy ra ngay (máy đó đang nghe danh sách nên tự đăng xuất). */
async function trimTo(db, uid, n) {
    const ref = db.doc(`users/${uid}/private/devices`);
    await db.runTransaction(async (tx) => {
        const s = await tx.get(ref);
        const list = s.exists && Array.isArray(s.data().list) ? s.data().list : [];
        if (list.length <= n) return;
        tx.set(ref, pack([...list].sort((a, b) => (a.at || 0) - (b.at || 0)).slice(-n)), { merge: true });
    });
}

/** Đổi quyền (claim) của tài khoản: ghi mốc vào doc danh sách máy — máy người đó đang nghe doc này (core/device-limit.js) nên xin token mới NGAY,
 *  không phải đợi token hết hạn (≤ 1 giờ). merge để không đụng danh sách máy. */
async function markClaims(db, uid) {
    await db.doc(`users/${uid}/private/devices`).set({ claimsAt: Date.now() }, { merge: true }).catch(() => {});
}

async function removeFrom(db, uid, pred) {
    const ref = db.doc(`users/${uid}/private/devices`);
    await db.runTransaction(async (tx) => {
        const s = await tx.get(ref);
        const list = s.exists && Array.isArray(s.data().list) ? s.data().list : [];
        tx.set(ref, pack(list.filter(d => !pred(d))), { merge: true });
    });
}

function serializeUserRecord(u, cfg) {
    const email = normEmail(u.email);
    const isAdmin = isAdminEmail(email);
    return {
        uid: u.uid,
        email,
        displayName: u.displayName || '',
        emailVerified: !!u.emailVerified,
        approved: isAdmin || u.customClaims?.approved === true,
        features: isAdmin ? normFeatures({ quiz: true, create: true, room: true, record: true }) : normFeatures(u.customClaims?.feat),
        featuresCustom: !isAdmin && !!u.customClaims?.feat,
        disabled: !!u.disabled,
        isAdmin,
        providers: (u.providerData || []).map(p => p.providerId),
        allowPassword: isAdmin || cfg.passwordAllowed.includes(email) || cfg.deviceExempt.includes(email),
        unlimitedDevices: isAdmin || cfg.deviceExempt.includes(email),
        deviceLimit: limitFor(cfg, email),
        customLimit: okLimit(cfg.deviceLimits[email]) ? cfg.deviceLimits[email] : null,
        createdAt: u.metadata?.creationTime ? new Date(u.metadata.creationTime).getTime() : null,
        lastSignInAt: u.metadata?.lastSignInTime ? new Date(u.metadata.lastSignInTime).getTime() : null
    };
}

async function updateAccessLists(db, admin, email, { allowPassword, unlimitedDevices }) {
    const e = normEmail(email);
    if (!isEmail(e)) return;
    const patch = {};
    if (typeof allowPassword === 'boolean') {
        patch.passwordAllowed = allowPassword
            ? admin.firestore.FieldValue.arrayUnion(e)
            : admin.firestore.FieldValue.arrayRemove(e);
    }
    if (typeof unlimitedDevices === 'boolean') {
        patch.deviceExempt = unlimitedDevices
            ? admin.firestore.FieldValue.arrayUnion(e)
            : admin.firestore.FieldValue.arrayRemove(e);
    }
    if (Object.keys(patch).length > 0) {
        await db.doc('config/access').set(patch, { merge: true });
    }
}

module.exports = async function handler(req, res) {
    if (req.method === 'OPTIONS') return send(res, 200, { ok: true });
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
    try {
        const token = await verifyUser(req);
        const { db, auth, admin } = init();
        const body = await readJson(req);
        const uid = token.uid;

        // ==================== CÁC TÁC VỤ QUẢN TRỊ (ADMIN ONLY) ====================
        if (String(body.action || '').startsWith('admin')) {
            if (!isAdminToken(token)) return send(res, 403, { error: 'Chỉ admin mới thực hiện được thao tác này' });

            // 1. Đăng xuất thiết bị từ xa
            if (body.action === 'adminRemove') {
                const target = cleanId(body.uid);
                if (!target) return send(res, 400, { error: 'Thiếu uid' });
                const dev = cleanId(body.deviceId);
                await removeFrom(db, target, d => !dev || d.id === dev);
                await audit(db, admin, token, dev ? 'kick-device' : 'kick-all', target, dev ? { device: dev } : {});
                return send(res, 200, { ok: true });
            }

            // 2. Tạo tài khoản mới (hoặc cập nhật nếu email đã tồn tại)
            if (body.action === 'adminCreateUser') {
                const email = normEmail(body.email);
                const password = String(body.password || '');
                const displayName = String(body.displayName || '').trim().slice(0, 40);
                const allowPassword = body.allowPassword !== false; // mặc định tạo từ Admin là cho đăng nhập thẳng
                const unlimitedDevices = !!body.unlimitedDevices;

                if (!isEmail(email)) return send(res, 400, { error: 'Email không hợp lệ.' });
                if (password.length < 6) return send(res, 400, { error: 'Mật khẩu phải có ít nhất 6 ký tự.' });

                let userRecord = null;
                let created = false;
                try {
                    userRecord = await auth.getUserByEmail(email);
                    userRecord = await auth.updateUser(userRecord.uid, {
                        password,
                        ...(displayName ? { displayName } : {}),
                        emailVerified: true,
                        disabled: false
                    });
                } catch (e) {
                    if (e?.code === 'auth/user-not-found') {
                        userRecord = await auth.createUser({
                            email,
                            password,
                            displayName: displayName || email.split('@')[0],
                            emailVerified: true,
                            disabled: false
                        });
                        created = true;
                    } else {
                        throw e;
                    }
                }

                // Tự động gắn custom claim approved: true để tạo bộ đề / thư mục / phòng ngay
                await setApproved(userRecord.uid);
                // Admin chọn sẵn quyền tính năng lúc tạo (vd "Full tính năng") — không chọn thì theo mặc định
                if (body.features && typeof body.features === 'object') {
                    const cur = (await auth.getUser(userRecord.uid)).customClaims || {};
                    await auth.setCustomUserClaims(userRecord.uid, { ...cur, feat: normFeatures(body.features) });
                    await markClaims(db, userRecord.uid);
                }
                userRecord = await auth.getUser(userRecord.uid);

                const finalName = displayName || userRecord.displayName || email.split('@')[0];
                await db.doc(`users/${userRecord.uid}`).set({
                    email,
                    displayName: finalName,
                    updatedAt: admin.firestore.Timestamp.now(),
                    ...(created ? { createdAt: admin.firestore.Timestamp.now() } : {})
                }, { merge: true });

                const nk = nameKey(finalName);
                if (nk) {
                    await db.doc(`usernames/${nk}`).set({ uid: userRecord.uid, email });
                }

                await updateAccessLists(db, admin, email, { allowPassword, unlimitedDevices });
                const cfg = await getAccessConfig(db);
                await audit(db, admin, token, created ? 'create-user' : 'reset-user', email, { allowPassword, unlimitedDevices });
                return send(res, 200, { ok: true, created, user: serializeUserRecord(userRecord, cfg) });
            }

            // 3. Tra cứu chi tiết 1 tài khoản (theo email, tên đăng nhập hoặc uid) trực tiếp từ Firebase Auth
            if (body.action === 'adminLookup') {
                const q = String(body.query || '').trim();
                if (!q) return send(res, 400, { error: 'Nhập email, tên người dùng hoặc UID' });

                let userRecord = null;
                if (q.includes('@')) {
                    try { userRecord = await auth.getUserByEmail(normEmail(q)); } catch (e) {}
                }
                if (!userRecord) {
                    const nk = nameKey(q);
                    if (nk) {
                        const ns = await db.doc(`usernames/${nk}`).get();
                        if (ns.exists && ns.data()?.uid) {
                            try { userRecord = await auth.getUser(ns.data().uid); } catch (e) {}
                        }
                    }
                }
                if (!userRecord) {
                    try { userRecord = await auth.getUser(q); } catch (e) {}
                }
                if (!userRecord) {
                    return send(res, 404, { error: 'Không tìm thấy tài khoản này trong Firebase Authentication.' });
                }

                const [cfg, devSnap, logSnap] = await Promise.all([
                    getAccessConfig(db),
                    db.doc(`users/${userRecord.uid}/private/devices`).get(),
                    db.doc(`users/${userRecord.uid}/private/logins`).get()
                ]);
                return send(res, 200, {
                    ok: true,
                    user: serializeUserRecord(userRecord, cfg),
                    devices: devSnap.exists && Array.isArray(devSnap.data().list) ? devSnap.data().list : [],
                    logins: logSnap.exists && Array.isArray(logSnap.data().list) ? logSnap.data().list : []
                });
            }

            // 4. Liệt kê danh sách tài khoản trên hệ thống
            // Có pageToken → trang kế tiếp (Firebase Auth trả tối đa 1000 / trang). Trang Quản trị gọi tới hết để có đủ danh sách.
            if (body.action === 'adminListUsers') {
                const max = Math.min(Math.max(Number(body.limit) || 50, 1), 1000);
                const pageToken = typeof body.pageToken === 'string' && body.pageToken ? body.pageToken : undefined;
                const [listRes, cfg] = await Promise.all([
                    auth.listUsers(max, pageToken),
                    getAccessConfig(db)
                ]);
                const users = (listRes.users || [])
                    .map(u => serializeUserRecord(u, cfg))
                    .sort((a, b) => (b.lastSignInAt || b.createdAt || 0) - (a.lastSignInAt || a.createdAt || 0));
                return send(res, 200, { ok: true, users, access: cfg, nextPageToken: listRes.pageToken || null });
            }

            // 5. Cập nhật quyền / mật khẩu / tên / duyệt / khóa tài khoản
            if (body.action === 'adminUpdateUser') {
                let targetUid = cleanId(body.uid);
                let targetEmail = normEmail(body.email);
                let userRecord = null;

                if (targetUid) {
                    try { userRecord = await auth.getUser(targetUid); } catch (e) {}
                } else if (isEmail(targetEmail)) {
                    try { userRecord = await auth.getUserByEmail(targetEmail); } catch (e) {}
                }

                if (userRecord) {
                    targetUid = userRecord.uid;
                    targetEmail = normEmail(userRecord.email || targetEmail);
                    const authPatch = {};
                    if (typeof body.password === 'string' && body.password.length > 0) {
                        if (body.password.length < 6) return send(res, 400, { error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
                        authPatch.password = body.password;
                        authPatch.emailVerified = true;
                    }
                    if (typeof body.displayName === 'string' && body.displayName.trim()) {
                        authPatch.displayName = body.displayName.trim().slice(0, 40);
                    }
                    if (typeof body.emailVerified === 'boolean') {
                        authPatch.emailVerified = body.emailVerified;
                    }
                    if (typeof body.disabled === 'boolean') {
                        if (isAdminEmail(targetEmail) && body.disabled) {
                            return send(res, 400, { error: 'Không thể khóa tài khoản Admin.' });
                        }
                        authPatch.disabled = body.disabled;
                    }
                    if (body.allowPassword === true && !userRecord.emailVerified) {
                        authPatch.emailVerified = true;
                    }
                    if (Object.keys(authPatch).length > 0) {
                        userRecord = await auth.updateUser(targetUid, authPatch);
                    }
                    // Claim: duyệt + quyền tính năng — gộp MỘT lần ghi. features: null = về mặc định, object = bật/tắt từng tính năng
                    const claims = { ...(userRecord.customClaims || {}) };
                    let claimsDirty = false;
                    if (typeof body.approved === 'boolean') { claims.approved = body.approved; claimsDirty = true; }
                    else if (body.allowPassword === true && claims.approved !== true) { claims.approved = true; claimsDirty = true; }
                    if ('features' in body) {
                        if (body.features === null) delete claims.feat;
                        else if (body.features && typeof body.features === 'object') {
                            claims.feat = normFeatures({ ...normFeatures(claims.feat), ...body.features });
                            // Tạo đề / phòng / bệnh án còn cần "đã duyệt" (approved() trong luật) → admin mở tính năng = tin tài khoản này, duyệt luôn
                            if (['create', 'room', 'record'].some(k => claims.feat[k]) && typeof body.approved !== 'boolean') claims.approved = true;
                        }
                        else return send(res, 400, { error: 'Quyền tính năng không hợp lệ.' });
                        claimsDirty = true;
                    }
                    if (claimsDirty) {
                        await auth.setCustomUserClaims(targetUid, claims);
                        userRecord = await auth.getUser(targetUid);
                        await markClaims(db, targetUid);
                    }
                    if (authPatch.displayName) {
                        await db.doc(`users/${targetUid}`).set({ email: targetEmail, displayName: authPatch.displayName }, { merge: true });
                        const nk = nameKey(authPatch.displayName);
                        if (nk) await db.doc(`usernames/${nk}`).set({ uid: targetUid, email: targetEmail });
                    }
                    if (body.disabled === true || body.revokeSessions === true) {
                        await auth.revokeRefreshTokens(targetUid).catch(() => {});
                        await removeFrom(db, targetUid, () => true);
                    }
                }

                if (isEmail(targetEmail)) {
                    const allowPw = typeof body.allowPassword === 'boolean' ? body.allowPassword : undefined;
                    const unlim = typeof body.unlimitedDevices === 'boolean'
                        ? body.unlimitedDevices
                        : (allowPw === false ? false : undefined);
                    await updateAccessLists(db, admin, targetEmail, {
                        allowPassword: allowPw,
                        unlimitedDevices: unlim
                    });
                    // Số máy riêng: số 1..20 = đặt, null = bỏ (về mặc định / theo "20 máy")
                    if ('deviceLimit' in body) {
                        const n = body.deviceLimit === null ? null : Number(body.deviceLimit);
                        if (n !== null && !okLimit(n)) return send(res, 400, { error: `Số máy phải từ 1 đến ${EXEMPT_MAX}.` });
                        await db.doc('config/access').set({
                            deviceLimits: { [targetEmail]: n === null ? admin.firestore.FieldValue.delete() : n }
                        }, { merge: true });
                    }
                }

                const cfg = await getAccessConfig(db);
                // Giới hạn mới thấp hơn số máy đang đăng nhập → đẩy bớt máy cũ nhất ra ngay
                if (targetUid && isEmail(targetEmail) && ('deviceLimit' in body || body.unlimitedDevices === false || body.allowPassword === false)) {
                    await trimTo(db, targetUid, limitFor(cfg, targetEmail));
                }
                // Ghi lại các trường đã đổi (mật khẩu chỉ ghi "đã đổi", không ghi giá trị)
                const changed = {};
                for (const k of ['allowPassword', 'unlimitedDevices', 'approved', 'disabled', 'emailVerified', 'revokeSessions', 'displayName', 'deviceLimit']) {
                    if (k in body) changed[k] = body[k];
                }
                if ('features' in body) {
                    const f = body.features === null ? null : normFeatures(userRecord?.customClaims?.feat);
                    changed.features = f ? FEATURE_KEYS.filter(k => f[k]).join(', ') || 'tắt hết' : 'mặc định';
                }
                if (typeof body.password === 'string' && body.password) changed.password = 'đã đổi';
                await audit(db, admin, token, 'update-user', targetEmail || targetUid, changed);
                return send(res, 200, {
                    ok: true,
                    user: userRecord ? serializeUserRecord(userRecord, cfg) : { email: targetEmail },
                    access: cfg
                });
            }

            // 6. Xóa hẳn một tài khoản
            if (body.action === 'adminDeleteUser') {
                const targetUid = cleanId(body.uid);
                if (!targetUid) return send(res, 400, { error: 'Thiếu uid' });
                const u = await auth.getUser(targetUid);
                const email = normEmail(u.email);
                if (isAdminEmail(email)) return send(res, 400, { error: 'Không thể xóa tài khoản Admin.' });
                await auth.deleteUser(targetUid);
                await db.doc(`users/${targetUid}/private/devices`).delete().catch(() => {});
                if (isEmail(email)) {
                    await updateAccessLists(db, admin, email, { allowPassword: false, unlimitedDevices: false });
                    await db.doc('config/access').set({ deviceLimits: { [email]: admin.firestore.FieldValue.delete() } }, { merge: true }).catch(() => {});
                }
                await audit(db, admin, token, 'delete-user', email || targetUid);
                return send(res, 200, { ok: true });
            }

            return send(res, 400, { error: 'Tác vụ admin không hợp lệ' });
        }

        // ==================== CÁC TÁC VỤ THIẾT BỊ THÔNG THƯỜNG ====================
        if (body.action === 'release' || body.action === 'remove') {
            const dev = cleanId(body.deviceId);
            if (!dev) return send(res, 400, { error: 'Thiếu deviceId' });
            await removeFrom(db, uid, d => d.id === dev);
            return send(res, 200, { ok: true });
        }
        if (body.action !== 'register') return send(res, 400, { error: 'action không hợp lệ' });

        const cfg = await getAccessConfig(db);
        const passwordOk = canUsePassword(cfg, token);

        if (token.firebase?.sign_in_provider !== 'google.com' && !passwordOk) {
            return send(res, 403, { error: 'google-required' });
        }
        if (passwordOk && !token.email_verified) {
            try { await auth.updateUser(uid, { emailVerified: true }); } catch (e) {}
        }

        const me = cleanId(body.deviceId);
        if (!me) return send(res, 400, { error: 'Thiếu deviceId' });
        const label = String(body.label || 'Thiết bị').slice(0, 80);
        const authTime = Number(token.auth_time) || 0;
        const geo = geoOf(req);
        const limit = limitFor(cfg, token);
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
                newLogin = list[idx].authTime !== authTime;
                list[idx] = { ...list[idx], label, authTime, ...(newLogin ? geo : {}) };
            } else {
                if (!body.fresh && list.length >= limit) return { list, present: false };
                list = [...list, { id: me, label, at: now, authTime, ...geo }].sort((a, b) => (a.at || 0) - (b.at || 0)).slice(-limit);
                newLogin = true;
            }
            tx.set(devRef, pack(list), { merge: true });
            if (newLogin) {
                const prev = ls.exists && Array.isArray(ls.data().list) ? ls.data().list : [];
                const odd = prev.find(p => p.device !== me && now - (p.at || 0) < ALERT_WINDOW_MS
                    && ((p.country && geo.country && p.country !== geo.country) || (p.city && geo.city && p.city !== geo.city)));
                const entry = { at: now, device: me, label, ...geo,
                    ...(odd ? { alert: `Trong 2 giờ có đăng nhập ở ${placeOf(odd) || 'nơi khác'} và ${placeOf(geo) || 'nơi khác'}` } : {}) };
                tx.set(logRef, { list: [entry, ...prev].slice(0, LOGIN_KEEP) });
                tx.set(db.doc(`users/${uid}`), { email: normEmail(token.email), lastLoginAt: admin.firestore.Timestamp.fromMillis(now) }, { merge: true });
            }
            return { list, present: list.some(d => d.id === me) };
        });

        let claimsChanged = false;
        try {
            if (passwordOk && token.approved !== true) {
                await setApproved(uid);
                claimsChanged = true;
            } else {
                claimsChanged = await autoApprove(token);
            }
        } catch (e) {}

        return send(res, 200, { ok: true, limit, present: out.present, list: out.list, claimsChanged, approved: token.approved === true || claimsChanged });
    } catch (e) {
        return send(res, e.status || 500, { error: e.message || 'Lỗi máy chủ' });
    }
};
