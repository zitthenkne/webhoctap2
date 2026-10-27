// File: core/device-limit.js
// GIỚI HẠN 2 THIẾT BỊ cho mỗi tài khoản (chống cho mượn tài khoản). Máy thứ 3 đăng nhập → máy đăng nhập LÂU NHẤT tự bị đăng xuất.
//
// Dữ liệu: users/{uid}/private/devices = { list: [{ id, label, at, authTime, ip, city, country }], authTimes } — DO MÁY CHỦ GHI (api/devices.js).
//   • Mỗi máy (đúng hơn: mỗi kho trình duyệt) có id ngẫu nhiên lưu localStorage 'deviceId'. Lưu ý: trên iPhone/iPad, Safari và ứng dụng
//     "Thêm vào màn hình chính" có kho riêng → tính là 2 máy; xóa dữ liệu trình duyệt → máy mới.
//   • Vừa đăng nhập (markFreshLogin() gọi TRƯỚC signIn…): máy chủ ghi máy này, dư thì bỏ máy cũ nhất.
//   • Mở app với phiên cũ: máy không còn trong danh sách → đăng xuất + báo. Mỗi máy nghe doc danh sách (onSnapshot) nên bị đẩy ra là biết NGAY.
//   • Tài khoản cũ chưa có danh sách: máy nào mở trước được ghi trước (tới khi đủ 2), máy sau bị đăng xuất.
// Thực thi THẬT ở firestore.rules (trustedSession): đề người khác chia sẻ chỉ đọc được khi auth_time của phiên nằm trong `authTimes`
// → máy bị đẩy ra không đọc được dù sửa code. Chỉ phiên đăng nhập Google (core/google-gate.js lo các phiên mật khẩu cũ).
// Mất mạng: không kiểm (đọc offline vẫn dùng được), có mạng lại là kiểm.
// NGOẠI LỆ: admin (ADMIN_EMAILS — khớp isAdmin() trong firestore.rules) và các email admin thêm vào config/access.deviceExempt
// (trang Hồ sơ của admin) dùng tối đa EXEMPT_MAX máy — coi như không giới hạn.
import { auth, db } from './firebase-init.js';
import { doc, getDoc, setDoc, onSnapshot, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

export const MAX_DEVICES = 2;
export const EXEMPT_MAX = 20;                         // khớp EXEMPT_MAX trong api/devices.js
export const ADMIN_EMAILS = ['vietthanhne@gmail.com'];
const accessRef = () => doc(db, 'config', 'access');

const emailOf = (u) => String(u?.email || '').toLowerCase();
/** Tài khoản quản trị (email đã xác nhận nằm trong ADMIN_EMAILS). */
export const isAdminUser = (u) => !!u && !u.isAnonymous && u.emailVerified === true && ADMIN_EMAILS.includes(emailOf(u));

/** Số máy tối đa của một tài khoản: admin / email ngoại lệ → EXEMPT_MAX, còn lại MAX_DEVICES. Lỗi đọc cấu hình → MAX_DEVICES. */
export async function deviceLimitFor(u) {
    if (isAdminUser(u)) return EXEMPT_MAX;
    try {
        const snap = await getDoc(accessRef());
        const list = snap.exists() && Array.isArray(snap.data().deviceExempt) ? snap.data().deviceExempt : [];
        return list.includes(emailOf(u)) ? EXEMPT_MAX : MAX_DEVICES;
    } catch (e) { return MAX_DEVICES; }
}

// ---------- Admin: quản lý danh sách ngoại lệ (luật config/{docId}: chỉ admin ghi) ----------
export function onDeviceExempt(cb) {
    return onSnapshot(accessRef(), (s) => cb(s.exists() && Array.isArray(s.data().deviceExempt) ? s.data().deviceExempt : []), () => cb(null));
}
export async function setDeviceExempt(email, exempt) {
    const e = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('Email không hợp lệ.');
    await setDoc(accessRef(), { deviceExempt: exempt ? arrayUnion(e) : arrayRemove(e) }, { merge: true });
}
const FRESH_KEY = 'freshLogin';
const devRef = (uid) => doc(db, 'users', uid, 'private', 'devices');

export function deviceId() {
    try {
        let id = localStorage.getItem('deviceId');
        if (!id) {
            id = (crypto.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2))).replace(/-/g, '').slice(0, 24);
            localStorage.setItem('deviceId', id);
        }
        return id;
    } catch (e) { return 'nostorage'; }
}

/** Tên máy dễ hiểu cho danh sách ở trang Hồ sơ, vd "iPad · Safari", "Điện thoại Android · Chrome". */
export function deviceLabel() {
    const ua = navigator.userAgent || '';
    const iPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);   // iPadOS tự xưng là Mac
    const os = iPad ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? (/Mobile/.test(ua) ? 'Điện thoại Android' : 'Máy tính bảng Android')
        : /Windows/.test(ua) ? 'Máy tính Windows' : /Macintosh/.test(ua) ? 'Máy Mac' : /CrOS/.test(ua) ? 'Chromebook' : /Linux/.test(ua) ? 'Máy Linux' : 'Thiết bị';
    const br = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Trình duyệt';
    const app = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone ? ' (ứng dụng)' : '';
    return `${os} · ${br}${app}`;
}

/** Gọi NGAY TRƯỚC signInWith… / createUser…: lần báo đăng nhập kế tiếp là "đăng nhập mới" → được ghi vào danh sách (đẩy máy cũ nhất ra). */
export function markFreshLogin() { try { sessionStorage.setItem(FRESH_KEY, String(Date.now())); } catch (e) {} }
export function clearFreshLogin() { try { sessionStorage.removeItem(FRESH_KEY); } catch (e) {} }
function takeFresh() {
    try {
        const t = Number(sessionStorage.getItem(FRESH_KEY)) || 0;
        sessionStorage.removeItem(FRESH_KEY);
        return Date.now() - t < 5 * 60 * 1000;          // cờ quá cũ (đăng nhập hỏng giữa chừng…) thì bỏ
    } catch (e) { return false; }
}

// ---------- Gọi máy chủ (api/devices.js) ----------
// Danh sách máy + lịch sử đăng nhập do MÁY CHỦ ghi (luật chặn app ghi) — máy chủ xác minh token thật, lấy auth_time + IP/vị trí thật.
async function callDevices(body) {
    const u = auth.currentUser;
    if (!u) throw new Error('Chưa đăng nhập');
    const res = await fetch(new URL('api/devices', location.origin + '/').href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await u.getIdToken()}` },
        body: JSON.stringify(body),
        cache: 'no-store'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, code: data.error });
    return data;
}

export const placeOf = (e) => [e?.city, e?.country].filter(Boolean).join(', ');

let kicked = false;
async function kickOut(reason) {
    if (kicked) return;
    kicked = true;
    try {
        const { forgetSession } = await import('./auth-session.js');
        forgetSession();                 // đăng xuất chủ động: không báo nhầm "phiên hết hạn"
    } catch (e) {}
    try { await signOut(auth); } catch (e) {}
    alert(reason);
    location.reload();
}

let serverWarned = false;
function warnServer(e) {
    console.warn('Máy chủ thiết bị chưa sẵn sàng:', e);
    if (serverWarned || e?.status === 401) return;
    serverWarned = true;
    // 503 = chưa cấu hình FIREBASE_SERVICE_ACCOUNT trên Vercel; 404 = API chưa deploy (chạy localhost…)
    import('./utils.js').then(({ showToast }) => {
        if (document.getElementById('toast-container')) {
            showToast('Chưa xác nhận được thiết bị với máy chủ — đề người khác chia sẻ riêng có thể chưa mở được. Thử tải lại sau.', 'warning', 6000);
        }
    }).catch(() => {});
}

let unsub = null, watchingUid = null;
/**
 * auth-session.js gọi mỗi khi có người dùng thật. Chỉ phiên đăng nhập GOOGLE (phiên khác: core/google-gate.js bắt liên kết Google trước).
 * Máy này chưa có trong danh sách, hoặc mốc đăng nhập (auth_time) đổi → nhờ máy chủ ghi. Rồi nghe danh sách: bị đẩy ra → đăng xuất ngay.
 */
export async function watchDevices(user) {
    if (!user || user.isAnonymous || watchingUid === user.uid) return;
    let claims;
    try { claims = (await user.getIdTokenResult()).claims; } catch (e) { return; }
    if (claims.firebase?.sign_in_provider !== 'google.com') return;
    watchingUid = user.uid;
    unsub?.();
    const me = deviceId();
    const authTime = Number(claims.auth_time) || 0;
    const fresh = takeFresh();

    let settled = false;      // đã xác nhận với máy chủ chưa — chưa thì chưa xét "bị đẩy ra" (tránh đăng xuất oan lúc doc còn cũ)
    const ensure = async () => {
        try {
            const r = await callDevices({ action: 'register', deviceId: me, label: deviceLabel(), fresh });
            settled = true;
            if (!r.present) {
                kickOut(`Tài khoản này đang đăng nhập trên đủ ${r.limit || MAX_DEVICES} máy khác. Máy này đã được đăng xuất — đăng nhập lại sẽ đẩy máy cũ nhất ra.`);
            }
        } catch (e) { warnServer(e); }
    };
    if (navigator.onLine !== false) {
        // Đọc danh sách trước: máy này đã có mặt với đúng mốc đăng nhập thì khỏi gọi máy chủ (đỡ 1 lượt gọi mỗi lần mở trang)
        let ok = false;
        try {
            const snap = await getDoc(devRef(user.uid));
            ok = !fresh && snap.exists() && (snap.data().list || []).some(d => d.id === me && d.authTime === authTime);
        } catch (e) { /* mạng chập chờn: để máy chủ xử lý */ }
        if (ok) settled = true; else await ensure();
    }
    unsub = onSnapshot(devRef(user.uid), (snap) => {
        if (snap.metadata.fromCache || !settled) return;           // chỉ tin dữ liệu máy chủ, sau khi đã đăng ký
        const list = snap.exists() && Array.isArray(snap.data().list) ? snap.data().list : [];
        if (!list.some(d => d.id === me)) {
            kickOut('Tài khoản vừa đăng nhập trên máy khác (vượt số máy cho phép) hoặc máy này bị đăng xuất từ xa. Máy này đã được đăng xuất.');
        }
    }, () => {});
}

export function stopWatchingDevices() { unsub?.(); unsub = null; watchingUid = null; }

/** Đăng xuất chủ động trên máy này: nhả chỗ trong danh sách để máy khác dùng. Lỗi mạng → bỏ qua. */
export async function releaseThisDevice() {
    stopWatchingDevices();
    try { await callDevices({ action: 'release', deviceId: deviceId() }); } catch (e) { /* chỗ này được nhả khi máy khác đăng nhập */ }
}

/** Trang Hồ sơ: đăng xuất từ xa một máy khác của chính mình (máy đó nghe được và tự đăng xuất). */
export async function removeDevice(_uid, id) {
    await callDevices({ action: 'remove', deviceId: id });
}

/** Admin: đăng xuất một máy (deviceId) hoặc MỌI máy (bỏ trống) của tài khoản khác. */
export async function adminRemoveDevices(uid, id) {
    await callDevices({ action: 'adminRemove', uid, deviceId: id || '' });
}

/** Trang Hồ sơ: nghe danh sách máy để vẽ. */
export function onDevices(uid, cb) {
    return onSnapshot(devRef(uid), (snap) => cb(snap.exists() && Array.isArray(snap.data().list) ? snap.data().list : []), () => cb(null));
}

/** Lịch sử đăng nhập (mới nhất trước). */
export function onLogins(uid, cb) {
    return onSnapshot(doc(db, 'users', uid, 'private', 'logins'),
        (snap) => cb(snap.exists() && Array.isArray(snap.data().list) ? snap.data().list : []), () => cb(null));
}

// ---------- Admin: tra cứu tài khoản (luật: admin đọc được users/* và users/*/private/*) ----------
/**
 * Email (hoặc tên người dùng) → { uid, email } | null. Tìm users.email (máy chủ ghi ở mỗi lần đăng nhập), không thấy thì thử bảng tra tên.
 * Tài khoản chưa đăng nhập lại kể từ bản này có thể chưa có users.email → không tìm thấy theo email.
 */
export async function findAccount(q) {
    const s = String(q || '').trim();
    if (!s) return null;
    if (s.includes('@')) {
        const { collection, query, where, getDocs, limit } = await import("https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js");
        const snap = await getDocs(query(collection(db, 'users'), where('email', '==', s.toLowerCase()), limit(1)));
        if (!snap.empty) return { uid: snap.docs[0].id, email: snap.docs[0].data().email };
    }
    const { nameKey } = await import('./usernames.js');
    const nk = await getDoc(doc(db, 'usernames', nameKey(s))).catch(() => null);
    if (nk?.exists()) return { uid: nk.data().uid, email: nk.data().email };
    return null;
}
