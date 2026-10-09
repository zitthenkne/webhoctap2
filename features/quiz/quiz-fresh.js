// File: features/quiz/quiz-fresh.js
// "Bản bộ đề trong máy còn dùng được không?" — dùng chung cho trang làm bài, flashcard, lịch sử.
//
// Mỗi lần mở bộ đề, SDK web `getDoc` kéo NGUYÊN doc (mảng câu hỏi hàng trăm KB) dù chẳng có gì đổi. Quy tắc (bản 2026-10-09):
//   1. Bản máy (IndexedDB) mới được xác nhận chưa tới LOCAL_FRESH_MS (20s) → dùng thẳng, không hỏi máy chủ.
//   2. Quá hạn "tươi" → hỏi MỘT lượt REST chỉ lấy `updateTime` (+ vài trường nhỏ), ~1 KB. `updateTime` là giờ ghi cuối do CHÍNH Firestore
//      đóng dấu cho mọi cách ghi — kể cả MCP / script tải đề không biết cập nhật `updatedAt` (trước đây sửa bằng MCP, số câu không đổi,
//      thì máy đã mở bộ đề đó KHÔNG thấy bản mới cho tới 24 giờ). Khớp `_srvTime` lưu cùng bản máy → vẫn dùng, chỉ làm mới mốc.
//   3. Lệch / bản máy chưa có `_srvTime` (bản lưu kiểu cũ, hoặc vừa sửa tại máy) / lỗi / không thấy doc → coi là CŨ, nơi gọi tải cả bộ
//      như trước rồi gắn `_srvTime` mới (xem takeStamp / stampBeforeFetch).
import { getOfflineQuiz, touchOfflineQuiz, setOfflineStamp } from './quiz-offline-store.js';
import { getDocRest } from '../../core/firestore-rest.js';
import { whenAuthReady } from '../../core/auth-session.js';

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

/** Một lượt REST nhỏ: `updateTime` + số câu của bộ đề trên máy chủ. Doc không tồn tại → null; lỗi → ném. */
export async function fetchHead(quizId) {
    await whenAuthReady(1500);      // đã đăng nhập thì gửi kèm token (bộ riêng tư của chính mình), không thì đọc công khai
    return getDocRest('quiz_sets', quizId, ['questionCount']);
}

// Dấu máy chủ của lần hỏi gần nhất theo bộ đề — để nơi tải cả bộ gắn vào bản máy mà khỏi hỏi lần nữa.
const lastStamp = new Map();
export const takeStamp = (quizId) => { const s = lastStamp.get(quizId) || null; lastStamp.delete(quizId); return s; };

/** Bắt đầu hỏi dấu NGAY (song song với việc tải cả bộ — gửi TRƯỚC để dấu không bao giờ mới hơn nội dung). Trả Promise<dấu|null>, không bao giờ ném. */
export function stampBeforeFetch(quizId) {
    return fetchHead(quizId).then(h => (h && h._updateTime) || null).catch(() => null);
}

/** Bản máy còn khớp bản trên máy chủ không? Mọi lỗi → false (tải cả bộ như cũ). */
export async function localStillCurrent(quizId, localData) {
    if (!localData || !localData._srvTime) return false;      // chưa từng xác nhận bằng dấu máy chủ → không tin
    try {
        const head = await fetchHead(quizId);
        if (!head || !head._updateTime) return false;
        lastStamp.set(quizId, head._updateTime);
        const n = Array.isArray(localData.questions) ? localData.questions.length : -1;
        return head._updateTime === localData._srvTime && (head.questionCount == null || head.questionCount === n);
    } catch (e) { return false; }
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
        const verdict = await Promise.race([localStillCurrent(quizId, local), new Promise(r => setTimeout(() => r('slow'), 1500))]);
        if (verdict === 'slow') return navigator.onLine === false || local._srvTime ? local : null;
        if (verdict) { touchOfflineQuiz(quizId); return local; }
    } catch (e) { /* kho máy lỗi → tải như cũ */ }
    return null;
}

/** Sau khi MÌNH vừa ghi bộ đề lên Firestore xong (bản máy đã là bản vừa ghi): hỏi dấu mới và gắn vào bản máy để lần mở sau khỏi tải lại. Không bao giờ ném. */
export async function stampLocal(quizId) {
    try { await setOfflineStamp(quizId, await stampBeforeFetch(quizId)); } catch (e) { /* lần sau tải lại là được */ }
}
