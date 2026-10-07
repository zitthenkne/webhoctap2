// File: features/quiz/quiz-fresh.js
// "Bản bộ đề trong máy còn dùng được không?" — dùng chung cho trang làm bài, flashcard, lịch sử.
//
// Mỗi lần mở bộ đề, SDK web `getDoc` kéo NGUYÊN doc (mảng câu hỏi hàng trăm KB) dù chẳng có gì đổi. Quy tắc:
//   1. Bản máy (IndexedDB) mới lưu/xác nhận chưa tới LOCAL_FRESH_MS → dùng thẳng, không hỏi máy chủ.
//   2. Quá hạn "tươi" → hỏi MỘT lượt REST chỉ lấy `updatedAt` + `questionCount` (~1 KB); khớp bản máy → vẫn dùng, chỉ làm mới mốc.
//   3. Lệch / thiếu dấu / lỗi / không thấy doc → trả null, nơi gọi tải cả bộ như trước.
// Chỉ tin dấu khi bản máy CÓ `updatedAt` và lần TẢI ĐỦ gần nhất (`_fullAt`) chưa quá LOCAL_HARD_TTL_MS — phòng khi một máy chạy bản cũ
// sửa bộ đề mà không ghi dấu.
import { getOfflineQuiz, touchOfflineQuiz } from './quiz-offline-store.js';
import { getDocRest } from '../../core/firestore-rest.js';
import { whenAuthReady } from '../../core/auth-session.js';

export const LOCAL_FRESH_MS = 5 * 60 * 1000;                 // bản bộ đề trong máy còn "tươi" bao lâu thì khỏi hỏi lại Firestore
export const LOCAL_HARD_TTL_MS = 24 * 60 * 60 * 1000;        // quá hạn này kể từ lần tải đủ → không tin dấu updatedAt nữa

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

/** Hỏi máy chủ (REST, vài trăm byte) xem bản máy có còn khớp không. Mọi lỗi → false (tải cả bộ như cũ). */
export async function localStillCurrent(quizId, localData) {
    const mine = stampOf(localData && localData.updatedAt);
    if (!mine || Date.now() - (Number(localData._fullAt) || 0) > LOCAL_HARD_TTL_MS) return false;
    try {
        await whenAuthReady(1500);      // đã đăng nhập thì gửi kèm token (bộ riêng tư của chính mình), không thì đọc công khai
        const head = await getDocRest('quiz_sets', quizId, ['updatedAt', 'questionCount']);
        if (!head) return false;
        const n = Array.isArray(localData.questions) ? localData.questions.length : -1;
        return stampOf(head.updatedAt) === mine && (head.questionCount == null || head.questionCount === n);
    } catch (e) { return false; }
}

/**
 * Bản bộ đề trong máy nếu còn dùng được (tươi hoặc dấu khớp), không thì null.
 * Cho các trang CHỈ ĐỌC (flashcard, lịch sử): trả về bản máy để khỏi tải cả bộ.
 */
export async function usableLocalQuiz(quizId) {
    try {
        const local = await getOfflineQuiz(quizId);
        if (!local || !Array.isArray(local.questions) || !local.questions.length) return null;
        if (isLocalFresh(local)) return local;
        if (await localStillCurrent(quizId, local)) { touchOfflineQuiz(quizId); return local; }
    } catch (e) { /* kho máy lỗi → tải như cũ */ }
    return null;
}
