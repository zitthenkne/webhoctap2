// api/_lib/admin.js — Firebase Admin dùng chung cho các API Vercel (thư mục bắt đầu bằng "_" không thành endpoint).
// Cần biến môi trường FIREBASE_SERVICE_ACCOUNT trên Vercel = NỘI DUNG file JSON service account (dán nguyên JSON, hoặc base64 của nó).
// Admin SDK bỏ qua firestore.rules → mọi kiểm tra quyền phải làm ở đây (verifyUser / isAdminEmail).
const admin = require('firebase-admin');

let ready = null;
function init() {
    if (ready) return ready;
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT || '';
    if (!raw) throw Object.assign(new Error('Máy chủ chưa cấu hình FIREBASE_SERVICE_ACCOUNT'), { status: 503 });
    const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const cred = JSON.parse(json);
    if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id });
    ready = { admin, db: admin.firestore(), auth: admin.auth() };
    return ready;
}

// Khớp isAdmin() trong firestore.rules và ADMIN_EMAILS trong core/device-limit.js
const ADMIN_EMAILS = ['vietthanhne@gmail.com'];
const isAdminEmail = (email) => ADMIN_EMAILS.includes(String(email || '').toLowerCase());
const isAdminToken = (t) => !!t && isAdminEmail(t.email) && (t.email_verified === true || t.uid === 'qZ5dzmJzrjdpN9l4n9x5UGPwHE43');

/** Xác minh ID token Firebase ở header Authorization: Bearer <token>. Trả token đã giải mã hoặc ném lỗi 401. */
async function verifyUser(req) {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    if (!m) throw Object.assign(new Error('Thiếu token đăng nhập'), { status: 401 });
    const { auth } = init();
    try { return await auth.verifyIdToken(m[1]); }
    catch (e) { throw Object.assign(new Error('Token không hợp lệ hoặc đã hết hạn'), { status: 401 }); }
}

/** IP thật của người gọi (Vercel) → bản đã che bớt để lưu. */
function maskedIp(req) {
    const ip = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim();
    if (!ip) return '';
    if (ip.includes('.') && !ip.includes(':')) { const p = ip.split('.'); return p.length === 4 ? `${p[0]}.${p[1]}.${p[2]}.x` : ''; }
    const g = ip.replace(/^::ffff:/, '').split(':').filter(Boolean);
    return g.length ? `${g.slice(0, 3).join(':')}:…` : '';
}
const dec = (v) => { try { return decodeURIComponent(String(v || '')); } catch (e) { return String(v || ''); } };
/** Vị trí gần đúng theo IP do Vercel gắn sẵn (miễn phí). */
function geoOf(req) {
    return { ip: maskedIp(req), city: dec(req.headers['x-vercel-ip-city']).slice(0, 60), country: dec(req.headers['x-vercel-ip-country']).slice(0, 4) };
}

function send(res, status, body) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(status).send(JSON.stringify(body));
}
async function readJson(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
    return {};
}

// ---------- Duyệt tài khoản (custom claim `approved` — firestore.rules approved()) ----------
// Tài khoản TẠO TRƯỚC mốc này có từ thời chưa có cổng máy chủ (đã qua mật khẩu web ở app) → duyệt tự động khi mở app.
const APPROVE_CUTOFF_MS = Date.parse('2026-10-29T00:00:00Z');

/** Gắn claim approved (giữ các claim khác). */
async function setApproved(uid) {
    const { auth } = init();
    const u = await auth.getUser(uid);
    await auth.setCustomUserClaims(uid, { ...(u.customClaims || {}), approved: true });
}

/** Token chưa có approved: tài khoản cũ (trước APPROVE_CUTOFF_MS) hoặc admin → duyệt luôn. Trả true nếu vừa gắn (app phải làm mới token). */
async function autoApprove(token) {
    if (!token || token.approved === true) return false;
    const { auth } = init();
    const u = await auth.getUser(token.uid);
    const created = Date.parse(u.metadata.creationTime || '') || Date.now();
    if (created >= APPROVE_CUTOFF_MS && !isAdminToken(token)) return false;
    await auth.setCustomUserClaims(token.uid, { ...(u.customClaims || {}), approved: true });
    return true;
}

/** Mốc hết hạn (Timestamp Firestore / Date / null) → mili-giây, null = không hết hạn. */
const untilMs = (v) => (v == null ? null : typeof v.toMillis === 'function' ? v.toMillis() : new Date(v).getTime());
/** Doc công khai còn hiệu lực: isPublic và chưa quá publicUntil (thiếu publicUntil = không hết hạn — link cũ). */
const publicAlive = (d) => !!d && d.isPublic === true && (untilMs(d.publicUntil) == null || untilMs(d.publicUntil) > Date.now());

module.exports = { init, verifyUser, isAdminEmail, isAdminToken, ADMIN_EMAILS, geoOf, send, readJson, untilMs, publicAlive, setApproved, autoApprove };
