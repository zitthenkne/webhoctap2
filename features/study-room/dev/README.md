# dev/ — xem trước phòng đánh đề KHÔNG cần Firebase

`preview.html` là bản sao `study-room.html` + import map trỏ Firebase sang các file `stub-*.js`
(dữ liệu giả trong `stub-firestore.js`: 4 thành viên, 3 câu hỏi, chủ trì là bạn).

**Đừng sửa tay `preview.html`** — sửa `study-room.html` rồi chạy `node dev/sinh-preview.mjs`
(chép nguyên trang thật, chỉ chèn import map + bỏ modulepreload của Firebase thật).

Chạy: mở một static server ở thư mục `webhoctap2/` rồi vào
`/features/study-room/dev/preview.html?id=demo`

Xem các trạng thái khác bằng `&state=`: `lobby` (chưa có phiên), `revealed` (đã lộ đáp án),
`ended` (màn tổng kết). Chế độ tối: đặt `localStorage.quiz_theme = 'dark'`.

Thêm **`&big=1`** để dựng phòng ĐÔNG + đề DÀI (60 câu, 14 người; đổi bằng `&big=<số câu>` và
`&people=<số người>`) — bắt buộc dùng khi chỉnh dải câu, bản đồ câu, dải tiến độ, bảng phiếu:
mấy thứ đó chỉ vỡ khi nhiều dữ liệu.

Bộ đề giả của `big` cố tình gài 2 ca xấu nhất của **dòng thông tin câu + cỡ chữ đề**: cứ 3 câu
có 1 câu mang đường dẫn nguồn dài 3 nhánh `›` (soi `.rm-qsrc` cắt còn nhánh cuối, bấm xổ hết),
và cứ 7 câu có 1 câu dài ~420 ký tự (soi `#question-text[data-len="xl"]` tự thu cỡ chữ).
Vài câu có `expanded` / `note` để thấy chip 📖 mở rộng · 📌 ghi nhớ.

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

## Thảo luận có ảnh / tài liệu + biên bản

`stub-firestore.js` gài sẵn ở câu 1: một tin trả lời có thẻ "chọn B" + ảnh nhúng, một thẻ 📚 tài liệu.
`orderBy` của bộ giả nay sắp thật theo `createdAt` (trước đây tin mới nằm trên cùng).
Bộ xem trước KHÔNG tải ảnh lên mạng thật chỉ khi bạn không dán ảnh — dán ảnh sẽ gọi sxcu.net thật.
Muốn thử mà không đẩy ảnh đi đâu: chặn request bằng Playwright `context.route('https://sxcu.net/api/files/create', …)`.

## Khối "Đáp án & bàn luận" · câu tự luận (bản 19b)

Câu 1 có sẵn lý do có tên, nhận xét ✚/✖/❓ gắn từng phương án, đồng tình, và bạn đã **đổi ý** từ C sang B.
**Câu 4 là câu tự luận**: một bài làm chung (Minh Anh gõ, nằm ở `notes.q3`) + 2 nhận xét bên dưới
(một cái có trích đoạn). Màn ≥1040px khối nằm cột phải; hẹp hơn nằm ngay dưới phương án.

- `&state=multi` — câu 1 chốt nhiều đáp án (B + C, `alsoOk`)
- `&state=split` — câu 1 "chưa thống nhất" (`split`)

Kiểm thử thao tác: `e2e2.mjs` (Playwright, 48 mục) trong scratchpad phiên 2026-09-24;
bộ tách "Dán đề" có test thuần Node: `npm test` (features/study-room/tests/room-paste.test.js).

## Bảng trắng (bản 39)

`whiteboard.js` tự dựng cả giao diện trong `#stage-board`; mẫu nằm ở `wb-templates.js`.
Bộ giả nay có `writeBatch` THẬT (bảng ghi theo lô) và lộ `window.__stubStore` để script kiểm thử đếm vật
(`study_rooms/demo/drawings/*`). Giả lập người khác trình bày / chiếu laser: `import('dev/stub-firestore.js')`
rồi `setDoc` vào doc `_present` / `laser_<uid>` — cùng một bản module với trang nên bảng nhận ngay.
