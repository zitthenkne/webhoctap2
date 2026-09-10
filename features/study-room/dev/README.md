# dev/ — xem trước phòng đánh đề KHÔNG cần Firebase

`preview.html` là bản sao `study-room.html` + import map trỏ Firebase sang các file `stub-*.js`
(dữ liệu giả trong `stub-firestore.js`: 4 thành viên, 3 câu hỏi, chủ trì là bạn).

Chạy: mở một static server ở thư mục `webhoctap2/` rồi vào
`/features/study-room/dev/preview.html?id=demo`

Xem các trạng thái khác bằng `&state=`: `lobby` (chưa có phiên), `revealed` (đã lộ đáp án),
`ended` (màn tổng kết). Chế độ tối: đặt `localStorage.quiz_theme = 'dark'`.

Chỉ dùng để chỉnh giao diện — KHÔNG deploy, không nằm trong danh sách cache của `sw.js`.
