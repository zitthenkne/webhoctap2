# dev/ — xem trước phòng đánh đề KHÔNG cần Firebase

`preview.html` là bản sao `study-room.html` + import map trỏ Firebase sang các file `stub-*.js`
(dữ liệu giả trong `stub-firestore.js`: 4 thành viên, 3 câu hỏi, chủ trì là bạn).

Chạy: mở một static server ở thư mục `webhoctap2/` rồi vào
`/features/study-room/dev/preview.html?id=demo`

Xem các trạng thái khác bằng `&state=`: `lobby` (chưa có phiên), `revealed` (đã lộ đáp án),
`ended` (màn tổng kết). Chế độ tối: đặt `localStorage.quiz_theme = 'dark'`.

Thêm **`&big=1`** để dựng phòng ĐÔNG + đề DÀI (60 câu, 14 người; đổi bằng `&big=<số câu>` và
`&people=<số người>`) — bắt buộc dùng khi chỉnh dải câu, bản đồ câu, dải tiến độ, bảng phiếu:
mấy thứ đó chỉ vỡ khi nhiều dữ liệu.

Thêm **`&slow=<ms>`** để hoãn snapshot phiên đầu tiên — dùng để thử MÀN CHỜ xương cá (`#quiz-boot`)
và kiểm tra không còn cảnh "nháy sảnh chờ" trước khi vào màn làm bài.

## `hub-preview.html` — khu "Phòng học của tôi" ở trang chủ

Xem trước panel `#rooms-hub` (do `rooms-hub.js` dựng, nhúng trong `index.html`) với 4 phòng giả:
đang có phiên chạy · buổi đã xong có điểm TB · phòng hẹn giờ · phòng người khác mà mình từng vào.

`/features/study-room/dev/hub-preview.html` — thêm `?open=create|join|invite|menu` để bật sẵn lớp nổi,
`?view=list` xem kiểu danh sách, `?w=390` bó chiều rộng thử bố cục điện thoại.

`where()` trong `stub-firestore.js` nay lọc thật (chỉ toán tử `==`) để phân biệt phòng mình tạo
với phòng chỉ từng vào — điều kiện khác `==` vẫn bị bỏ qua như trước.

Chỉ dùng để chỉnh giao diện — KHÔNG deploy, không nằm trong danh sách cache của `sw.js`.
