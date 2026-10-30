// File: core/quiz-run.js
// LƯỢT LÀM ĐỀ — cho trang Quản trị (báo cáo đề nào ai làm) + CẢNH BÁO một tài khoản làm đề trên 2 máy cùng lúc.
// Mỗi tài khoản × mỗi máy MỘT doc quiz_runs/{uid}_{deviceId} (số doc không phình — tối đa bằng số máy):
//   { uid, email, name, device, label, quizId, title, mode, state: 'doing'|'done', startedAt (ms), pct, at (giờ máy chủ), expireAt }
// Chi phí: 2 lượt ghi / lượt làm (bắt đầu — kể cả làm tiếp sau F5 — và nộp bài). Không có nhịp giữ chỗ.
// Trong lúc đang làm, máy nghe các doc CÙNG tài khoản (vài doc — mỗi thay đổi 1 lượt đọc):
//   • máy khác ghi (bắt đầu / nộp) SAU lúc máy này bắt đầu = hai máy làm bài chồng giờ nhau → hiện cảnh báo + ghi vào kết quả
//     (quiz_results.clash, quiz-session.js lấy qua quizRunEnd) → trang Quản trị gắn cờ.
//   • máy khác còn "đang làm" từ TRƯỚC lúc máy này bắt đầu (có thể chỉ là bài bỏ dở) → nhắc nhẹ, không ghi.
// KHÁCH (chưa đăng nhập, làm đề công khai): quiz_guest/{deviceId}_{quizId} = { device, label, quizId, title, mode, state, startedAt, pct,
//   attempts, at, expireAt, + chi tiết máy: os, model, screen, tz, src (deviceInfo), ip (đã che), city, region, country (api/public?kind=geo
//   — theo IP, gần đúng), firstAt (lần đầu làm đề này), hist: 10 lượt gần nhất [{ s: bắt đầu, e: nộp (0 = chưa / bỏ dở), p: điểm % }] }
//   — mỗi máy × mỗi đề một doc (làm lại thì ghi đè + đếm lượt), cũng 2 lượt ghi / lượt làm. Lịch sử giữ ở localStorage của chính máy đó
//   (khách không đọc được doc). Luật chỉ cho ghi khi bộ đề đang công khai → báo cáo của admin đếm được cả máy chưa đăng nhập.
// Nhẹ để trang làm đề import tĩnh: device-limit.js chỉ nạp lúc bắt đầu lượt làm.
import { db, auth } from './firebase-init.js';
import { doc, setDoc, collection, query, where, onSnapshot, serverTimestamp, Timestamp, increment } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

/** "Đang làm" quá mốc này mà không nộp = coi như đã bỏ dở (trang Quản trị dùng chung). */
export const RUN_MAX_MS = 3 * 60 * 60 * 1000;
const KEEP_MS = 14 * 24 * 60 * 60 * 1000;
const GUEST_KEEP_MS = 60 * 24 * 60 * 60 * 1000;   // khách: giữ đủ cho báo cáo 30 ngày
const SKEW_MS = 60 * 1000;          // giờ máy người dùng lệch giờ máy chủ chút ít → chừa 1 phút cho khỏi báo oan

let run = null;     // { uid, device, label, ref, startMs, unsub, clash, shown }
let authHooked = false;
const msOf = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : 0);

/** Bắt đầu (hoặc làm tiếp) một lượt làm đề trên máy này. */
export async function quizRunStart({ quizId, title, mode, startedAt }) {
    quizRunStop();
    guest = null;
    // F5 giữa bài: trang vào thẳng câu đang làm có thể trước khi Firebase khôi phục phiên → chờ, đừng tưởng người đăng nhập là khách
    try { await auth.authStateReady?.(); } catch (e) {}
    const u = auth.currentUser;
    if (!quizId || u?.isAnonymous) return;
    let dl;
    try { dl = await import('./device-limit.js'); } catch (e) { return; }
    if (!u) return guestStart(dl, { quizId, title, mode, startedAt });
    if (auth.currentUser?.uid !== u.uid || run) return;
    const device = dl.deviceId();
    const me = run = { uid: u.uid, device, label: dl.deviceLabel().slice(0, 80), startMs: Date.now(), unsub: null, clash: null, shown: '' };
    me.ref = doc(db, 'quiz_runs', `${u.uid}_${device}`);
    setDoc(me.ref, {
        uid: u.uid, email: (u.email || '').toLowerCase(), name: (u.displayName || '').slice(0, 80), device, label: me.label,
        quizId: String(quizId).slice(0, 120), title: String(title || '').slice(0, 200), mode: String(mode || '').slice(0, 20),
        state: 'doing', startedAt: Math.round(Number(startedAt) || Date.now()), at: serverTimestamp(), expireAt: Timestamp.fromMillis(Date.now() + KEEP_MS)
    }).catch(() => {});
    me.unsub = onSnapshot(query(collection(db, 'quiz_runs'), where('uid', '==', u.uid)), (snap) => check(me, snap), () => {});
    if (!authHooked) {
        authHooked = true;
        auth.onAuthStateChanged((x) => { if (run && x?.uid !== run.uid) quizRunStop(); });
    }
}

/** Nộp bài: ghi "đã nộp" và trả thông tin máy + cờ 2 máy để lưu kèm kết quả (null nếu không có lượt nào đang chạy). */
export function quizRunEnd({ pct } = {}) {
    const me = run;
    if (guest) {
        const p = Math.round(Number(pct));
        const score = Number.isFinite(p) ? Math.min(100, Math.max(0, p)) : null;
        const hist = readHist(guest.key);
        const last = hist[hist.length - 1];
        if (last && !last.e) { last.e = Date.now(); last.p = score; writeHist(guest.key, hist); }
        setDoc(guest.ref, { state: 'done', at: serverTimestamp(), ...(score != null ? { pct: score } : {}), ...(last ? { hist } : {}) }, { merge: true }).catch(() => {});
        guest = null;
    }
    if (!me) return null;
    quizRunStop();
    const p = Math.round(Number(pct));
    setDoc(me.ref, { state: 'done', at: serverTimestamp(), ...(Number.isFinite(p) ? { pct: p } : {}) }, { merge: true }).catch(() => {});
    return { device: me.device, deviceLabel: me.label, clash: me.clash };
}

// Khách: không có tài khoản → không so 2 máy, chỉ ghi để admin đếm máy đã làm đề. Luật từ chối nếu đề không công khai (bỏ qua lỗi).
let guest = null;            // { ref, key } — lượt làm của khách đang chạy
const HIST_MAX = 10;
const readHist = (key) => { try { const h = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(h) ? h.slice(-HIST_MAX) : []; } catch (e) { return []; } };
const writeHist = (key, h) => { try { localStorage.setItem(key, JSON.stringify(h.slice(-HIST_MAX))); } catch (e) {} };

/** Vị trí gần đúng theo IP (api/public?kind=geo) — nhớ 1 giờ trong phiên tab; chậm quá 2 giây hoặc lỗi thì bỏ qua (không chặn ghi). */
async function guestGeo(dl) {
    try { const c = JSON.parse(sessionStorage.getItem('guestGeo') || 'null'); if (c && Date.now() - c.t < 3600000) return c.g; } catch (e) {}
    try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 2000);
        const r = await fetch(dl.apiUrl('api/public?kind=geo'), { signal: ctl.signal, cache: 'no-store' });
        clearTimeout(timer);
        const j = r.ok ? await r.json() : null;
        const g = j ? { ip: String(j.ip || '').slice(0, 60), city: String(j.city || '').slice(0, 60), region: String(j.region || '').slice(0, 10), country: String(j.country || '').slice(0, 4) } : {};
        try { sessionStorage.setItem('guestGeo', JSON.stringify({ t: Date.now(), g })); } catch (e) {}
        return g;
    } catch (e) { return {}; }
}

async function guestStart(dl, { quizId, title, mode, startedAt }) {
    if (auth.currentUser) return;
    const device = dl.deviceId();
    const id = String(quizId).slice(0, 120);
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return;
    const me = guest = { ref: doc(db, 'quiz_guest', `${device}_${id}`), key: `guestHist:${id}` };
    const start = Math.round(Number(startedAt) || Date.now());
    // F5 giữa bài = làm tiếp lượt cũ (cùng mốc bắt đầu, chưa nộp) → không đếm thêm lượt
    const hist = readHist(me.key);
    const resume = hist.length > 0 && hist[hist.length - 1].s === start && !hist[hist.length - 1].e;
    if (!resume) { hist.push({ s: start, e: 0, p: null }); writeHist(me.key, hist); }
    let firstAt = start;
    try { firstAt = Number(localStorage.getItem(me.key + ':first')) || start; localStorage.setItem(me.key + ':first', String(firstAt)); } catch (e) {}
    const [info, geo] = await Promise.all([dl.deviceInfo().catch(() => ({})), guestGeo(dl)]);
    if (guest !== me || auth.currentUser) return;      // đã nộp / bắt đầu lượt khác / vừa đăng nhập trong lúc chờ
    setDoc(me.ref, {
        device, label: dl.deviceLabel().slice(0, 80), quizId: id, title: String(title || '').slice(0, 200), mode: String(mode || '').slice(0, 20),
        state: 'doing', startedAt: start, ...(resume ? {} : { attempts: increment(1) }), firstAt, hist,
        ...info, ...geo,
        at: serverTimestamp(), expireAt: Timestamp.fromMillis(Date.now() + GUEST_KEEP_MS)
    }, { merge: true }).catch(() => {});
}

/** Thôi nghe (đăng xuất / bắt đầu lượt mới). Không ghi gì. */
export function quizRunStop() {
    if (!run) return;
    run.unsub?.();
    run = null;
}

function check(me, snap) {
    if (run !== me) return;
    let hard = null, soft = null;
    snap.forEach((d) => {
        const x = d.data({ serverTimestamps: 'estimate' });
        if (!x || x.device === me.device) return;
        const at = msOf(x.at);
        if (at > me.startMs + SKEW_MS) hard = hard || x;
        else if (x.state === 'doing' && Date.now() - at < RUN_MAX_MS) soft = soft || x;
    });
    const other = hard || soft;
    if (!other) return;
    const label = String(other.label || 'máy khác').slice(0, 80);
    const title = String(other.title || '').slice(0, 120);
    if (hard && !me.clash) me.clash = label;
    const kind = hard ? 'hard' : 'soft';
    if (me.shown === 'hard' || me.shown === kind) return;
    me.shown = kind;
    const when = new Date(Number(other.startedAt) || msOf(other.at)).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    showBanner(hard
        ? `Tài khoản của bạn đang làm đề trên máy khác cùng lúc (${label}${title ? ` · đề "${title}"` : ''}). Mỗi tài khoản chỉ được làm bài trên 1 máy một lúc — lượt làm này đã được ghi lại để admin kiểm tra.`
        : `Tài khoản của bạn còn một bài đang làm dở trên máy khác (${label}${title ? ` · đề "${title}"` : ''}, bắt đầu lúc ${when}). Nếu máy đó vẫn đang được dùng, lượt làm sẽ bị ghi nhận là làm trên 2 máy cùng lúc.`,
    hard);
}

function showBanner(text, hard) {
    document.getElementById('quiz-run-warn')?.remove();
    const el = document.createElement('div');
    el.id = 'quiz-run-warn';
    el.setAttribute('role', 'alert');
    const [bg, border, color] = hard ? ['#FEF2F2', '#FCA5A5', '#7F1D1D'] : ['#FFFBEB', '#FCD34D', '#78350F'];
    el.style.cssText = `position:fixed;left:12px;right:12px;top:calc(12px + env(safe-area-inset-top));margin:0 auto;max-width:540px;z-index:2147483000;background:${bg};border:1.5px solid ${border};color:${color};border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.18);padding:12px 14px;display:flex;gap:10px;align-items:flex-start;font:600 14px/1.5 Quicksand,Nunito,system-ui,-apple-system,"Segoe UI",sans-serif`;
    const ic = document.createElement('span');
    ic.textContent = hard ? '⛔' : '⚠️';
    ic.style.cssText = 'font-size:18px;line-height:1.3';
    const msg = document.createElement('div');
    msg.style.cssText = 'flex:1;min-width:0;overflow-wrap:anywhere';
    msg.textContent = text;
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.textContent = 'Đã hiểu';
    ok.style.cssText = `flex-shrink:0;border:0;border-radius:12px;padding:6px 10px;background:${border};color:${color};font:800 12.5px Quicksand,Nunito,system-ui,sans-serif;cursor:pointer`;
    ok.addEventListener('click', () => el.remove());
    el.append(ic, msg, ok);
    document.body.appendChild(el);
    if (hard && navigator.vibrate) { try { navigator.vibrate([60, 60, 60]); } catch (e) {} }
}
