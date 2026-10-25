// core/write-errors.js — thông báo lỗi ghi Firestore (thuần, test được bằng node).
//
// Vì sao có: offline-write.js `queued()` từng NUỐT mọi lỗi để UI không treo lúc mất mạng. Hậu quả: luật Firestore từ chối (permission-denied)
// cũng bị nuốt -> giao diện báo "đã xóa / đã lưu" nhưng cloud không đổi (xóa lịch sử làm bài + lưu điểm tự luận từng hỏng im lặng, 2026-10-09).
// Mọi Promise ghi bị reject đều phải được báo; SDK chỉ tự thử lại khi Promise vẫn còn pending.

const codeOf = (e) => String((e && e.code) || '').replace(/^firestore\//, '');

/** Câu báo cho người dùng (tiếng Việt, không đổ lỗi, nói rõ việc gì chưa lưu). */
export function writeErrorMessage(e) {
    const c = codeOf(e);
    if (c === 'resource-exhausted') return 'Đã chạm hạn mức Firebase — thay đổi này chưa lưu được lên đám mây. Hãy thử lưu lại sau.';
    if (c === 'unauthenticated') return 'Phiên đăng nhập đã hết — hãy đăng nhập lại để thay đổi được lưu lên đám mây.';
    if (c === 'permission-denied') return 'Máy chủ từ chối thay đổi này (quyền truy cập) — chưa lưu được lên đám mây. Thử tải lại trang hoặc đăng nhập lại.';
    if (c === 'not-found') return 'Bản ghi không còn trên máy chủ — thay đổi này chưa lưu được lên đám mây. Hãy tải lại dữ liệu trước khi sửa tiếp.';
    if (['unavailable', 'deadline-exceeded', 'cancelled', 'aborted'].includes(c)) return 'Kết nối đồng bộ bị gián đoạn — thay đổi này chưa lưu được lên đám mây. Hãy thử lưu lại khi mạng ổn định.';
    return 'Thay đổi này chưa lưu được lên đám mây (' + (c || 'lỗi không rõ') + ').';
}
