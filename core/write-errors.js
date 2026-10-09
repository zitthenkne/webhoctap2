// core/write-errors.js — phân loại lỗi ghi Firestore (thuần, test được bằng node).
//
// Vì sao có: offline-write.js `queued()` từng NUỐT mọi lỗi để UI không treo lúc mất mạng. Hậu quả: luật Firestore từ chối (permission-denied)
// cũng bị nuốt -> giao diện báo "đã xóa / đã lưu" nhưng cloud không đổi (xóa lịch sử làm bài + lưu điểm tự luận từng hỏng im lặng, 2026-10-09).
// HARD = lỗi chắc chắn do bị TỪ CHỐI (không phải mạng) -> phải tới tay người dùng. Lỗi mạng (unavailable, deadline-exceeded, cancelled…) và
// not-found (bản ghi đã bị xóa ở máy khác) vẫn bị nuốt như cũ: ghi sẽ tự gửi lại khi có mạng / không còn gì để ghi.
const HARD = new Set(['permission-denied', 'unauthenticated', 'invalid-argument', 'failed-precondition', 'already-exists', 'resource-exhausted']);

const codeOf = (e) => String((e && e.code) || '').replace(/^firestore\//, '');

export const isHardWriteError = (e) => HARD.has(codeOf(e));

/** Câu báo cho người dùng (tiếng Việt, không đổ lỗi, nói rõ việc gì chưa lưu). */
export function writeErrorMessage(e) {
    const c = codeOf(e);
    if (c === 'resource-exhausted') return 'Đã chạm hạn mức Firebase hôm nay — thay đổi này chưa lưu được lên đám mây.';
    if (c === 'unauthenticated') return 'Phiên đăng nhập đã hết — hãy đăng nhập lại để thay đổi được lưu lên đám mây.';
    if (c === 'permission-denied') return 'Máy chủ từ chối thay đổi này (quyền truy cập) — chưa lưu được lên đám mây. Thử tải lại trang hoặc đăng nhập lại.';
    return 'Thay đổi này chưa lưu được lên đám mây (' + (c || 'lỗi không rõ') + ').';
}
