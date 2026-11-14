// File: features/quiz/link-progress.js
// Người mở LINK RIÊNG / NHÓM (api/link.js) làm bài → báo cho chủ link xem "ai đang làm / đã làm đề nào".
//   • Mở bộ đề từ link (quiz.html?id=…&link=<mã>, do link.html / folder.html gắn vào) → nhớ mã link của bộ đề đó trên máy.
//   • Bắt đầu (MỌI chế độ) → 'start'; nộp → 'progress'. Chế độ ôn (practice / srs) gửi kèm mode: máy chủ chỉ đếm lượt ôn, không tính điểm.
//   • Chờ phiên đăng nhập khôi phục xong rồi mới gửi (trước đây gọi sớm lúc auth chưa sẵn → mất báo cáo).
//   • Nộp bài mà mất mạng / máy chủ lỗi → xếp hàng trên máy, gửi lại khi có mạng hoặc lần mở trang sau.
// Đây chỉ là thống kê cho chủ, không ảnh hưởng kết quả làm bài của người học.
import { auth } from '../../core/firebase-auth.js';
import { apiUrl } from '../../core/api-url.js';
import { quizOfflineOk } from './quiz-offline-store.js';

const KEY = (quizId) => `zlink:${quizId}`;
const QKEY = 'zlinkq';                    // hàng chờ báo điểm chưa gửi được
const DEAD = ['missing', 'expired', 'revoked', 'blocked', 'taken'];
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };

/** Gọi khi mở trang làm bài: có ?link= thì nhớ mã link cho bộ đề này. */
export function rememberLinkToken(quizId) {
    const t = (new URLSearchParams(location.search).get('link') || '').replace(/[^\w-]/g, '').slice(0, 64);
    if (quizId && t) lsSet(KEY(quizId), t);
}

/** Gọi sau khi nộp bài: { pct, total } + tên bộ đề + chế độ. */
export function reportLinkProgress(quizId, { pct, total }, title = '', mode = 'normal') {
    return post(quizId, { action: 'progress', quizId, pct, total, mode, title: String(title).slice(0, 200) }, true);
}

/** Gọi khi bấm bắt đầu làm / ôn: chủ link thấy "đang làm / đang ôn đề này từ lúc…". Không mở từ link → không gọi gì. */
export function reportLinkStart(quizId, title = '', at = Date.now(), mode = 'normal') {
    return post(quizId, { action: 'start', quizId, at, mode, title: String(title).slice(0, 120) });
}

async function post(quizId, body, retry = false) {
    const token = quizId && lsGet(KEY(quizId));
    if (!token) return;
    const job = { ...body, token };
    if (!(await send(job)) && retry) enqueue(job);
}

/** true = máy chủ đã xử lý (kể cả từ chối); false = mất mạng / máy chủ lỗi → đáng gửi lại. */
async function send(job) {
    try { await auth.authStateReady(); } catch (e) {}
    const u = auth.currentUser;
    if (!u) return false;
    try {
        const r = await fetch(apiUrl('api/link'), {
            method: 'POST', keepalive: true, cache: 'no-store',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await u.getIdToken()}` },
            body: JSON.stringify(job)
        });
        if (r.status >= 500) return false;
        const d = await r.json().catch(() => ({}));
        if (DEAD.includes(d.status)) lsSet(KEY(job.quizId), null);   // link đã đóng / máy bị gỡ → quên mã, lần sau khỏi gọi
        return true;
    } catch (e) { return false; }
}

const readQ = () => { try { return JSON.parse(lsGet(QKEY) || '[]'); } catch (e) { return []; } };
function enqueue(job) {
    lsSet(QKEY, JSON.stringify([...readQ(), { ...job, qAt: Date.now() }].slice(-20)));
}
let flushing = false;
async function flush() {
    if (flushing || navigator.onLine === false) return;
    const jobs = readQ().filter(j => Date.now() - (j.qAt || 0) < 14 * 864e5);   // quá 2 tuần thì bỏ
    if (!jobs.length) return lsSet(QKEY, null);
    flushing = true;
    lsSet(QKEY, null);
    const left = [];
    for (const j of jobs) if (!(await send(j))) left.push(j);
    if (left.length) lsSet(QKEY, JSON.stringify([...left, ...readQ()].slice(-20)));
    flushing = false;
}
flush();
addEventListener('online', flush);

// ---------- Mất mạng giữa lúc làm bộ đề mở qua link → KHÔNG cho làm tiếp ----------
// Trừ khi chủ bộ đề bật "Cho tải về làm offline" (allowOffline — hộp Chia sẻ). Lý do: làm qua link phải có mạng để chủ theo dõi được.
// Khoá bằng màn che + chặn phím; có mạng lại thì mở. Đồng hồ vẫn chạy (tắt mạng không thành cách "dừng giờ").
/** Bộ đề này mở qua link và chủ chưa cho làm offline? */
export function linkNeedsNet(data) {
    return !!data?.id && !!lsGet(KEY(data.id)) && !quizOfflineOk(data);
}
let guardData = null, veil = null;
const blocked = () => !!veil;
function blockKeys(e) { if (blocked()) { e.stopImmediatePropagation(); e.preventDefault(); } }
function checkNet() {
    const block = navigator.onLine === false && !!guardData && linkNeedsNet(guardData) && document.body.classList.contains('quiz-active');
    if (block && !veil) {
        veil = document.createElement('div');
        veil.setAttribute('role', 'alertdialog');
        veil.setAttribute('aria-label', 'Mất kết nối mạng');
        veil.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:24px;background:rgba(255,240,246,.82);'
            + '-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);font-family:inherit;text-align:center';
        veil.innerHTML = `<div style="max-width:340px;padding:24px 22px;border-radius:24px;background:#fff;box-shadow:0 20px 40px -20px rgba(160,70,105,.5);color:#4F3646">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#E06B6B" stroke-width="2" stroke-linecap="round" aria-hidden="true" style="display:block;margin:0 auto 6px">
                <path d="M2 8.8a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1" fill="#E06B6B"/><path d="M3 3l18 18"/></svg>
            <b style="display:block;font-size:1.1rem;color:#6E3A55">Mất mạng</b>
            <p style="margin:8px 0 0;font-size:.9rem;line-height:1.55">Bộ đề này cần có mạng. Kết nối lại để làm tiếp — bài đang làm vẫn giữ nguyên.</p></div>`;
        document.documentElement.appendChild(veil);   // ngoài body → body inert được mà màn che vẫn hiện
        document.body.inert = true;
    } else if (!block && veil) {
        veil.remove(); veil = null;
        document.body.inert = false;
    }
}
/** Gọi lúc bắt đầu / khôi phục bài làm. Trả false nếu đang mất mạng mà bộ đề cần mạng (khỏi bắt đầu). */
export function guardLinkOffline(data) {
    if (!guardData) {
        addEventListener('offline', checkNet);
        addEventListener('online', checkNet);
        addEventListener('keydown', blockKeys, true);
    }
    guardData = data;
    return !(navigator.onLine === false && linkNeedsNet(data));
}
