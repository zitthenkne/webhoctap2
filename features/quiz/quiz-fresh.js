// File: features/quiz/quiz-fresh.js
// "Bản bộ đề trong máy còn dùng được không?" — dùng chung cho trang làm bài, flashcard, lịch sử.
//
// Mỗi lần mở bộ đề, SDK web `getDoc` kéo NGUYÊN doc (mảng câu hỏi hàng trăm KB) dù chẳng có gì đổi. Quy tắc (bản 2026-10-09):
//   1. Bản máy (IndexedDB) mới được xác nhận chưa tới LOCAL_FRESH_MS (20s) → dùng thẳng, không hỏi máy chủ.
//   2. Quá hạn "tươi" → hỏi MỘT lượt REST chỉ lấy `updateTime` (+ vài trường nhỏ), ~1 KB. `updateTime` là giờ ghi cuối do CHÍNH Firestore
//      đóng dấu cho mọi cách ghi — kể cả MCP / script tải đề không biết cập nhật `updatedAt` (trước đây sửa bằng MCP, số câu không đổi,
//      thì máy đã mở bộ đề đó KHÔNG thấy bản mới cho tới 24 giờ). Khớp `_srvStamp` lưu cùng bản máy → vẫn dùng, chỉ làm mới mốc.
//   3. Lệch / bản máy chưa có `_srvStamp` (bản lưu kiểu cũ, hoặc vừa sửa tại máy) / lỗi / không thấy doc → coi là CŨ, nơi gọi tải cả bộ
//      như trước (fetchQuizFull: nội dung + dấu cùng một phản hồi) rồi gắn `_srvStamp` mới.
//      (2026-10-12: trường này đổi tên từ `_srvTime` có CHỦ ĐÍCH — bản máy do code cũ đóng dấu có thể là nội dung cache cũ + dấu mới, tin dấu đó thì kẹt bản cũ mãi;
//       đổi tên khiến mọi bản cũ bị coi là "chưa có dấu" → tải đủ MỘT lần rồi tự lành. Đừng đổi tên lại về `_srvTime`.)
import { getOfflineQuiz, touchOfflineQuiz, setOfflineStamp, patchOfflineQuiz, deleteOfflineQuiz } from './quiz-offline-store.js';
import { getDocRest } from '../../core/firestore-rest.js';
import { whenAuthReady } from '../../core/auth-session.js';
import { db, auth } from '../../core/firebase-init.js';
import { doc, getDocFromServer, deleteField } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { contentRev } from './quiz-attempt.js';

export const LOCAL_FRESH_MS = 20 * 1000;                     // bản bộ đề trong máy còn "tươi" bao lâu thì khỏi hỏi lại Firestore (trước: 5 phút)

/** Đổi mọi kiểu dấu thời gian (Timestamp SDK / {seconds} đã qua IndexedDB / chuỗi ISO REST / Date / số) về mili-giây; không có → 0. */
export function stampOf(v) {
    if (!v) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') { const t = Date.parse(v); return Number.isNaN(t) ? 0 : t; }
    if (v instanceof Date) return v.getTime();
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (typeof v.seconds === 'number') return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
    return 0;
}

export const isLocalFresh = (local) => !!local && Date.now() - (Number(local._offlineSavedAt) || 0) < LOCAL_FRESH_MS;

// ---- TÁCH PHIÊN BẢN NỘI DUNG KHỎI QUYỀN + METADATA (2026-11-10) ----
// `contentRevision` trên quiz_sets = revision NỘI DUNG câu hỏi (băm, xem quiz-attempt.js contentRev) do máy chủ đánh dấu (api/publish-rev.js).
// Mọi lần GHI câu hỏi phải bỏ trường này (questionsWritten() — luật bắt buộc với app; MCP / upload.py tự bỏ) → con trỏ không bao giờ trỏ
// nội dung cũ. Nhờ vậy: đổi tiêu đề / chia sẻ (updateTime đổi, revision giữ) → chỉ vá metadata, DÙNG LẠI câu hỏi trong máy; sửa một phương án
// → revision mất / đổi → tải lại. Lượt hỏi đầu (~1–2 KB) mang luôn trường quyền → bị thu hồi quyền thì biết ngay (403) trước khi dùng bản đệm.
export const META_FIELDS = ['questionCount', 'contentRevision', 'title', 'description', 'userId', 'isPublic', 'publicUntil', 'sharedWith',
    'editors', 'sharedBy', 'allowTakeout', 'allowOffline', 'folderId', 'deleted', 'updatedAt'];
const FULL_MAX_AGE = 24 * 3600 * 1000;      // sửa thẳng trên Firebase console (không qua luật / MCP) → quá 24h vẫn tải đủ một lần
/** Mọi chỗ ghi `questions` của quiz_sets trộn thêm cái này (firestore.rules bắt buộc khi câu hỏi đổi). */
export const questionsWritten = () => ({ contentRevision: deleteField() });

// Nhờ máy chủ đánh dấu revision hiện tại (api/publish-rev.js) — gọi lười khi thấy con trỏ thiếu / lệch nội dung, mỗi bộ đề một lần mỗi trang.
// Không bao giờ ném.
const _asked = new Set();
export async function requestPublish(quizId) {
    if (!quizId || _asked.has(quizId) || navigator.onLine === false) return null;
    _asked.add(quizId);
    try {
        await whenAuthReady(1500);
        const base = /\.vercel\.app$/i.test(location.hostname) ? location.origin : 'https://zitthenkne.vercel.app';
        const headers = { 'Content-Type': 'application/json' };
        if (auth.currentUser) headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
        const r = await fetch(new URL('api/publish-rev', base + '/').href, { method: 'POST', headers, body: JSON.stringify({ quizId }), cache: 'no-store' });
        return r.ok ? await r.json() : null;
    } catch (e) { return null; }
}

/** Một lượt REST nhỏ: `updateTime` + trường nhẹ (số câu, revision, tiêu đề, quyền) của bộ đề. Doc không tồn tại → null; lỗi → ném (403 mang code). */
export async function fetchHead(quizId) {
    await whenAuthReady(1500);      // đã đăng nhập thì gửi kèm token (bộ riêng tư của chính mình), không thì đọc công khai
    return getDocRest('quiz_sets', quizId, META_FIELDS);
}

/**
 * So bản máy với máy chủ bằng MỘT lượt hỏi nhẹ.
 * @returns {Promise<{verdict:'same'|'meta'|'stale'|'denied'|'missing'|'error', head?:object, data?:object}>}
 *   same  — y hệt (updateTime khớp)          meta — chỉ metadata đổi: `data` = bản máy đã vá (đã lưu lại), dùng lại câu hỏi
 *   stale — nội dung đổi / không chắc → tải đủ  denied — máy chủ từ chối quyền (403)   missing — doc không còn
 */
export async function checkLocal(quizId, localData) {
    if (!localData) return { verdict: 'stale' };
    let head;
    try { head = await fetchHead(quizId); }
    catch (e) { return { verdict: e && e.code === 'permission-denied' ? 'denied' : 'error' }; }
    if (!head) return { verdict: 'missing' };
    const n = Array.isArray(localData.questions) ? localData.questions.length : -1;
    const countOk = head.questionCount == null || head.questionCount === n;
    if (localData._srvStamp && head._updateTime === localData._srvStamp && countOk) return { verdict: 'same', head };
    const fullAge = Date.now() - (Number(localData._fullAt) || 0);
    if (head.contentRevision && countOk && fullAge < FULL_MAX_AGE
        && head.contentRevision === (localData._rev || contentRev(localData.questions))) {
        const patch = { _srvStamp: head._updateTime || null };
        const drop = [];
        META_FIELDS.forEach(k => { if (k in head) patch[k] = head[k]; else drop.push(k); });
        const data = { ...localData, ...patch };
        drop.forEach(k => { delete data[k]; });
        await patchOfflineQuiz(quizId, patch, drop).catch(() => {});
        return { verdict: 'meta', head, data };
    }
    return { verdict: 'stale', head };
}

/** Hỏi dấu riêng (~1 KB). Trả Promise<dấu|null>, không bao giờ ném. */
export function stampBeforeFetch(quizId) {
    return fetchHead(quizId).then(h => (h && h._updateTime) || null).catch(() => null);
}

/**
 * Tải CẢ bộ đề từ máy chủ → { data, stamp } (doc không có → null; lỗi → ném).
 * Đường chính là REST: nội dung và `updateTime` nằm CÙNG một phản hồi nên dấu luôn đúng với nội dung, và không đợi SDK mở kênh WebChannel (chậm lúc nguội).
 * KHÔNG dùng `getDoc` của SDK ở đây: khi SDK tưởng mình offline (mạng chập chờn, vừa mở lại app) nó trả bản CACHE CŨ trong IndexedDB; ghép bản cũ đó với dấu
 * mới hỏi qua REST thì bản máy bị đóng dấu "đang mới" mãi mãi — đúng lỗi "sửa đề trên Firebase mà web không bao giờ cập nhật".
 * REST lỗi thì lùi `getDocFromServer` (chỉ nhận bản máy chủ, không có thì ném lỗi chứ không trả cache).
 */
export async function fetchQuizFull(quizId) {
    await whenAuthReady(1500);
    try {
        const d = await getDocRest('quiz_sets', quizId);
        if (!d) return null;
        const { _updateTime, ...data } = d;
        return { data, stamp: _updateTime || null };
    } catch (e) {
        const stampP = stampBeforeFetch(quizId);       // hỏi TRƯỚC khi tải: dấu không bao giờ mới hơn nội dung
        const snap = await getDocFromServer(doc(db, 'quiz_sets', quizId));
        // dấu chậm quá 3s thì bỏ (không đóng dấu → lần mở sau tải đủ một lần), đừng giữ nội dung đã tới tay
        return snap.exists() ? { data: snap.data(), stamp: await Promise.race([stampP, new Promise(r => setTimeout(() => r(null), 3000))]) } : null;
    }
}

/**
 * Máy chủ từ chối quyền với bộ đề đang có bản trong máy (chia sẻ bị gỡ, link 1 thiết bị bị thu hồi, hết hạn công khai…).
 * Hỏi lại MỘT lần với token mới (vừa đăng nhập / vừa xác nhận email / máy vừa đăng ký xong có thể còn mang token cũ); vẫn bị từ chối
 * thì xóa bản máy để bản cũ hết mở được. Chủ bộ đề không bao giờ bị thu hồi. Trả true nếu đã thu hồi.
 */
export async function revokeLocal(quizId, localData) {
    try {
        const u = auth.currentUser;
        if (localData && u && localData.userId === u.uid) return false;
        if (u) await u.getIdToken(true).catch(() => {});
        await new Promise(r => setTimeout(r, 1200));
        try { await fetchHead(quizId); return false; }                       // lần hai đọc được → chỉ là lỗi tạm
        catch (e) { if (!(e && e.code === 'permission-denied')) return false; }
        await deleteOfflineQuiz(quizId);
        return true;
    } catch (e) { return false; }
}

/** Bản máy còn dùng được không (y hệt, hoặc chỉ metadata đổi — đã vá)? Mọi lỗi / bị từ chối → false (nơi gọi tải cả bộ / tự xử lý quyền). */
export async function localStillCurrent(quizId, localData) {
    const { verdict } = await checkLocal(quizId, localData);
    return verdict === 'same' || verdict === 'meta';
}

/**
 * Bản bộ đề trong máy nếu còn dùng được (tươi hoặc dấu khớp), không thì null.
 * Cho các trang CHỈ ĐỌC (flashcard, lịch sử): trả về bản máy để khỏi tải cả bộ. Mạng chậm (hỏi dấu quá 1,5s) → dùng bản máy luôn, lần sau hỏi lại.
 */
export async function usableLocalQuiz(quizId) {
    try {
        const local = await getOfflineQuiz(quizId);
        if (!local || !Array.isArray(local.questions) || !local.questions.length) return null;
        if (isLocalFresh(local)) return local;
        const r = await Promise.race([checkLocal(quizId, local), new Promise(res => setTimeout(() => res({ verdict: 'slow' }), 1500))]);
        if (r.verdict === 'slow') return navigator.onLine === false || local._srvStamp ? local : null;
        if (r.verdict === 'same') { touchOfflineQuiz(quizId); return local; }
        if (r.verdict === 'meta') return r.data;
        if (r.verdict === 'denied') { await revokeLocal(quizId); return null; }
    } catch (e) { /* kho máy lỗi → tải như cũ */ }
    return null;
}

/** Sau khi MÌNH vừa ghi bộ đề lên Firestore xong (bản máy đã là bản vừa ghi): hỏi dấu mới và gắn vào bản máy để lần mở sau khỏi tải lại. Không bao giờ ném. */
export async function stampLocal(quizId) {
    try { await setOfflineStamp(quizId, await stampBeforeFetch(quizId)); } catch (e) { /* lần sau tải lại là được */ }
}
