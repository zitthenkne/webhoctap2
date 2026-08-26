// guide.js — chế độ hướng dẫn dùng chung cho cả app.
//
// Trang viết bệnh án có rất nhiều câu chỉ dẫn ("Chọn tên thuốc là máy điền sẵn
// liều…", "Hỏi ngược để loại trừ…"). Lần đầu thì quý, quen tay rồi thì chỉ tổ
// làm trang dài. Một công tắc duy nhất ở trang chờ bật / tắt toàn bộ, áp dụng
// cho mọi bệnh án — không lưu theo từng bệnh án.

const KEY = 'benhAnHuongDan';

/** Mặc định là BẬT — người mới cần hướng dẫn hơn là người quen */
export function guideOn() {
    try { return localStorage.getItem(KEY) !== '0'; } catch { return true; }
}

export function setGuide(on) {
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { }
    applyGuide();
    return on;
}

/** Gắn cờ lên <html> để CSS tự ẩn / hiện mọi câu hướng dẫn */
export function applyGuide() {
    document.documentElement.classList.toggle('no-guide', !guideOn());
}
