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
//
// ADMIN PHỤ: claim `admin: true` (admin nào cũng cấp được; chỉ admin gốc gỡ được). Admin phụ không đụng được tài khoản admin khác
// (đổi mật khẩu, khoá, đá máy, xoá, xem mật khẩu) — chỉ admin gốc làm được (canManage).
const { init, verifyUser, isAdminEmail, isAdminToken, isRootToken, isAdminRecord, geoOf, send, readJson, setApproved, autoApprove } = require('./_lib/admin');

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

// QUYỀN DÙNG TÍNH NĂNG — custom claim `feat` = { quiz, create, room, record, offline } (khớp can() trong firestore.rules và core/features.js).
// Thiếu claim = mặc định: làm đề + học nhóm mở, tạo đề + bệnh án + làm offline tắt. Admin luôn mở hết.
// `offline` chỉ app kiểm (features/quiz/quiz-offline-store.js) — làm offline thì không có máy chủ nào để chặn.
const FEATURE_KEYS = ['quiz', 'create', 'room', 'record', 'offline'];
const DEFAULT_FEATURES = { quiz: true, create: false, room: true, record: false, offline: false };
const FULL_FEATURES = Object.fromEntries(FEATURE_KEYS.map(k => [k, true]));
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

// KHO MẬT KHẨU — Firebase Auth chỉ giữ bản băm, không đọc lại được. Mật khẩu ADMIN ĐẶT (tạo / đổi ở trang Quản trị) được giữ ở
// admin_vault/{uid} = { password, setAt, setBy, validAfter } — CHỈ máy chủ đọc / ghi (firestore.rules chặn mọi lệnh từ app), trả cho admin qua API.
// Mật khẩu người dùng TỰ đặt (đăng ký, tự đổi) không bao giờ được lưu. `validAfter` = tokensValidAfterTime lúc đặt: người dùng tự đổi
// mật khẩu sau đó thì Firebase dời mốc này → báo "có thể đã đổi" thay vì hiện một mật khẩu đã sai.
const validAfterOf = (u) => Date.parse(u?.tokensValidAfterTime || '') || 0;
async function saveVault(db, admin, record, password, by) {
    await db.doc(`admin_vault/${record.uid}`).set({ password, setAt: admin.firestore.Timestamp.now(), setBy: by, validAfter: validAfterOf(record) });
}
/** Máy chủ vừa tự dời mốc (thu hồi phiên, khoá): dời mốc trong kho theo — trừ khi trước đó người dùng đã tự đổi mật khẩu (`before` = mốc trước thao tác). */
async function touchVault(db, auth, uid, before) {
    const ref = db.doc(`admin_vault/${uid}`);
    const [s, u] = await Promise.all([ref.get(), auth.getUser(uid)]);
    if (s.exists && (Number(s.data().validAfter) || 0) + 1500 >= before) await ref.update({ validAfter: validAfterOf(u) });
}
function vaultView(d, record) {
    if (!d || typeof d.password !== 'string') return null;
    return { password: d.password, setAt: d.setAt?.toMillis?.() || null, setBy: d.setBy || '', stale: validAfterOf(record) > (Number(d.validAfter) || 0) + 1500 };
}
/** Người gọi được đụng tài khoản này không: tài khoản thường → mọi admin; tài khoản admin → chỉ admin gốc (hoặc chính mình). */
const canManage = (token, record) => !isAdminRecord(record) || isRootToken(token) || record.uid === token.uid;

async function removeFrom(db, uid, pred) {
    const ref = db.doc(`users/${uid}/private/devices`);
    await db.runTransaction(async (tx) => {
        const s = await tx.get(ref);
        const list = s.exists && Array.isArray(s.data().list) ? s.data().list : [];
        tx.set(ref, pack(list.filter(d => !pred(d))), { merge: true });
    });
}

/** `extra` (trang Quản trị): { pw: vaultView | null, canManage } — chỉ gửi khi người gọi là admin. */
function serializeUserRecord(u, cfg, extra = {}) {
    const email = normEmail(u.email);
    const isAdmin = isAdminRecord(u);
    return {
        ...extra,
        isRoot: isAdminEmail(email),
        uid: u.uid,
        email,
        displayName: u.displayName || '',
        emailVerified: !!u.emailVerified,
        approved: isAdmin || u.customClaims?.approved === true,
        features: isAdmin ? normFeatures(Object.fromEntries(FEATURE_KEYS.map(k => [k, true]))) : normFeatures(u.customClaims?.feat),
        featuresCustom: !isAdmin && !!u.customClaims?.feat,
        disabled: !!u.disabled,
        isAdmin,
        providers: (u.providerData || []).map(p => p.providerId),
        allowPassword: isAdmin || cfg.passwordAllowed.includes(email) || cfg.deviceExempt.includes(email),
        unlimitedDevices: isAdmin || cfg.deviceExempt.includes(email),
        deviceLimit: isAdmin ? EXEMPT_MAX : limitFor(cfg, email),
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
            const by = normEmail(token.email);
            const NOT_ROOT = 'Chỉ admin gốc mới chỉnh được tài khoản admin khác.';

            // 1. Đăng xuất thiết bị từ xa
            if (body.action === 'adminRemove') {
                const target = cleanId(body.uid);
                if (!target) return send(res, 400, { error: 'Thiếu uid' });
                const rec = await auth.getUser(target).catch(() => null);
                if (rec && !canManage(token, rec)) return send(res, 403, { error: NOT_ROOT });
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
                    if (!canManage(token, userRecord)) return send(res, 403, { error: NOT_ROOT });
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
                // Admin chọn sẵn quyền tính năng lúc tạo (vd "Full tính năng") — không chọn thì theo mặc định; tick "Admin" = cấp luôn quyền admin
                const makeAdmin = body.admin === true && !isAdminEmail(email);
                if ((body.features && typeof body.features === 'object') || makeAdmin) {
                    const cur = (await auth.getUser(userRecord.uid)).customClaims || {};
                    const feat = makeAdmin ? FULL_FEATURES : normFeatures(body.features);
                    await auth.setCustomUserClaims(userRecord.uid, { ...cur, feat, ...(makeAdmin ? { admin: true } : {}) });
                    await markClaims(db, userRecord.uid);
                }
                userRecord = await auth.getUser(userRecord.uid);
                await saveVault(db, admin, userRecord, password, by);

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
                await audit(db, admin, token, created ? 'create-user' : 'reset-user', email, { allowPassword, unlimitedDevices, ...(makeAdmin ? { admin: true } : {}) });
                return send(res, 200, { ok: true, created, user: serializeUserRecord(userRecord, cfg, { canManage: true, pw: { password, setAt: Date.now(), setBy: by, stale: false } }) });
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

                const manage = canManage(token, userRecord);
                const [cfg, devSnap, logSnap, vSnap] = await Promise.all([
                    getAccessConfig(db),
                    db.doc(`users/${userRecord.uid}/private/devices`).get(),
                    db.doc(`users/${userRecord.uid}/private/logins`).get(),
                    manage ? db.doc(`admin_vault/${userRecord.uid}`).get() : null
                ]);
                return send(res, 200, {
                    ok: true,
                    user: serializeUserRecord(userRecord, cfg, { canManage: manage, pw: vSnap?.exists ? vaultView(vSnap.data(), userRecord) : null }),
                    devices: devSnap.exists && Array.isArray(devSnap.data().list) ? devSnap.data().list : [],
                    logins: logSnap.exists && Array.isArray(logSnap.data().list) ? logSnap.data().list : []
                });
            }

            // 4. Liệt kê danh sách tài khoản trên hệ thống
            // Có pageToken → trang kế tiếp (Firebase Auth trả tối đa 1000 / trang). Trang Quản trị gọi tới hết để có đủ danh sách.
            if (body.action === 'adminListUsers') {
                const max = Math.min(Math.max(Number(body.limit) || 50, 1), 1000);
                const pageToken = typeof body.pageToken === 'string' && body.pageToken ? body.pageToken : undefined;
                const [listRes, cfg, vaultSnap] = await Promise.all([
                    auth.listUsers(max, pageToken),
                    getAccessConfig(db),
                    db.collection('admin_vault').get()
                ]);
                const vault = new Map(vaultSnap.docs.map(d => [d.id, d.data()]));
                const users = (listRes.users || [])
                    .map(u => {
                        const manage = canManage(token, u);
                        return serializeUserRecord(u, cfg, { canManage: manage, pw: manage ? vaultView(vault.get(u.uid), u) : null });
                    })
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
                    if (!canManage(token, userRecord)) return send(res, 403, { error: NOT_ROOT });
                    if (typeof body.admin === 'boolean') {
                        if (isAdminEmail(targetEmail)) return send(res, 400, { error: 'Admin gốc luôn là admin.' });
                        if (!body.admin && isAdminRecord(userRecord) && !isRootToken(token)) return send(res, 403, { error: 'Chỉ admin gốc mới gỡ được quyền admin.' });
                    }
                    const validBefore = validAfterOf(userRecord);
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
                    if (authPatch.password) await saveVault(db, admin, userRecord, authPatch.password, by);
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
                    // Cấp admin = duyệt + mở hết tính năng; gỡ admin thì giữ nguyên tính năng đang có (admin gốc chỉnh lại sau nếu muốn)
                    if (typeof body.admin === 'boolean' && body.admin !== (claims.admin === true)) {
                        if (body.admin) Object.assign(claims, { admin: true, approved: true, feat: { ...FULL_FEATURES } });
                        else delete claims.admin;
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
                    if (typeof body.disabled === 'boolean' || body.revokeSessions === true) {
                        await touchVault(db, auth, targetUid, validBefore).catch(() => {});
                        userRecord = await auth.getUser(targetUid);
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
                for (const k of ['allowPassword', 'unlimitedDevices', 'approved', 'disabled', 'emailVerified', 'revokeSessions', 'displayName', 'deviceLimit', 'admin']) {
                    if (k in body) changed[k] = body[k];
                }
                if ('features' in body) {
                    const f = body.features === null ? null : normFeatures(userRecord?.customClaims?.feat);
                    changed.features = f ? FEATURE_KEYS.filter(k => f[k]).join(', ') || 'tắt hết' : 'mặc định';
                }
                if (typeof body.password === 'string' && body.password) changed.password = 'đã đổi';
                await audit(db, admin, token, 'update-user', targetEmail || targetUid, changed);
                let pw;
                if (userRecord) {
                    const v = await db.doc(`admin_vault/${targetUid}`).get().catch(() => null);
                    pw = v?.exists ? vaultView(v.data(), userRecord) : null;
                }
                return send(res, 200, {
                    ok: true,
                    user: userRecord ? serializeUserRecord(userRecord, cfg, { canManage: canManage(token, userRecord), pw }) : { email: targetEmail },
                    access: cfg
                });
            }

            // 6. Xóa hẳn một tài khoản
            if (body.action === 'adminDeleteUser') {
                const targetUid = cleanId(body.uid);
                if (!targetUid) return send(res, 400, { error: 'Thiếu uid' });
                const u = await auth.getUser(targetUid);
                const email = normEmail(u.email);
                if (isAdminEmail(email)) return send(res, 400, { error: 'Không thể xóa tài khoản admin gốc.' });
                if (!canManage(token, u)) return send(res, 403, { error: NOT_ROOT });
                await auth.deleteUser(targetUid);
                await db.doc(`users/${targetUid}/private/devices`).delete().catch(() => {});
                await db.doc(`admin_vault/${targetUid}`).delete().catch(() => {});
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
