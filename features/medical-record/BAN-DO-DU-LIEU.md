# Bản đồ dữ liệu — `tao-benh-an.html`

**Đồ thị nằm ở [`BAN-DO-DU-LIEU.codegraph`](BAN-DO-DU-LIEU.codegraph)** — 563 nút,
887 cạnh, sinh tự động bằng `node ban-do-codegraph.mjs`. Đó mới là nguồn tra cứu.
File này chỉ giữ những quy tắc không diễn tả được bằng một cạnh.

**Chạy lại bộ sinh sau mỗi lần thêm/bớt ô nhập liệu.** Nó tự kiểm luôn: ô nào gõ xong
mà chữ không ra được bản bệnh án sẽ hiện thành cạnh `no_route_to_output`. Hiện là **0**.

## Tra nhanh trong codegraph

```
grep '^E|f:vital-weight|'          # ô này đi đâu
grep 'renders_in|s:IV'             # mục IV in ra những gì
grep 'no_route_to_output'          # chỗ đứt (phải rỗng)
grep '^E|.*|mirrors|'              # các cặp ô cùng dữ kiện
grep 'kind=binder'                 # binder nào phải có trong danh sách adopt()
```

## Quy tắc bắt buộc khi thêm ô nhập liệu

Phải đụng đủ **ba** chỗ, thiếu một là mất chữ:

1. HTML — đặt `id`, nằm trong một `<div class="tab-content">`.
2. `FIELDS` trong `tao-benh-an.js` — để `collectRecord()` lưu và `fillForm()` nạp.
3. `buildModel()` trong `benh-an-text.js` — để in ra bệnh án.

Trừ khi nó là **ô con** được `upsertLine`/`bindAuto` ghép xuống một ô chữ lớn đã có
trong `buildModel` — khi đó bỏ qua bước 3, và bộ sinh sẽ thấy đường đi qua
`feeds → composes_into`.

Xong thì chạy `node ban-do-codegraph.mjs` và kiểm `no_route_to_output` vẫn rỗng.

## Footgun

**`bindAuto` đóng băng khi mở lại bệnh án cũ.** `bindAuto` giữ biến `last` = chữ máy
ghi lần trước, chỉ nằm trong bộ nhớ. Nạp lại bệnh án đã lưu thì `last` rỗng còn ô đầy
chữ → máy tưởng người viết tay và im vĩnh viễn; thêm thuốc, thêm mốc diễn tiến sau đó
không chảy xuống ô chữ nữa. `adopt()` ở cuối `loadExisting()` chữa chỗ đó.
**Thêm `bindAuto` mới thì phải thêm vào danh sách adopt đó** — `grep 'kind=binder'`.

**`loadExisting()` chạy đồng bộ.** Là IIFE async, nhưng khi bệnh án có sẵn ở
localStorage thì `!rec && await …` short-circuit nên toàn thân hàm chạy ngay tại chỗ
khai báo. Mọi `const` khai báo *sau* nó mà bị chạm vào trong đó đều lỗi TDZ. Vì vậy
khối `bindAuto` + các binder nằm **trước** `loadExisting()`.

**Đổ sang ô song sinh phải ở `change`, không phải `input`.** Đổ theo từng chữ thì
"Viêm phổi" mới gõ được "Viêm" đã bị chép sang rồi dính cứng. Và chỉ đổ khi ô đích
**còn trống** — sinh viên gõ khác đi là có ý. Lệch nhau thì `clinical-validator.js`
nói ra, **không tự sửa lén**.

**Ô hiện/ẩn: thiếu dữ kiện để xét thì cứ hiện.** `data-spec="ngoai,cc"` theo loại bệnh
án, `data-when="gioi:nu|loai:san|tuoi:<16"` khớp một vế là hiện. Chưa chọn giới tính /
chưa có tuổi mà đã giấu thì sinh viên tưởng trang lỗi. Ô đang ẩn không tính vào thanh
phần trăm; `data-nocount` cũng loại khỏi phép đếm đó.

**`buildModel()` không khóa theo `record-type`.** Khối chuyên khoa nào có dữ liệu là in
ra, để đổi loại bệnh án giữa chừng không nuốt mất phần đã ghi.

**Viết tắt ngắn trong `KY_VONG_THEO_CLS` phải bọc `\b…\b`.** Không thì `cta` khớp luôn
vào chữ "la**cta**te". Thêm hàng xong, đếm lại độ phủ và số nhóm khớp mỗi mục.

**Dò mờ trong `libFor()` chỉ được mượn GỢI Ý, không được mượn tiêu chuẩn.** Tên bệnh
không có mẫu trong `LIBRARY` thì `libFor()` dò sang mẫu gần giống để lấy nguyên nhân /
dấu chứng — thẻ có băng "đang lấy gợi ý theo mẫu X" nên người đọc biết. Nhưng dòng
"Tiêu chuẩn chẩn đoán tối thiểu" nằm ngay dưới tên bệnh sinh viên gõ và đọc như một
khẳng định: mượn của mẫu khác là dạy sai. Tiêu chuẩn luôn lấy theo tên đã gõ, không có
thì để trống.

**Thêm mặt bệnh vào `TIEU_CHUAN` / `BIEN_CHUNG` phải `unshift`, không `push`.** Dò theo
thứ tự, mẫu khớp đầu tiên thắng, nên mẫu hẹp phải đứng trước mẫu rộng đã có. Nhưng
`unshift` cũng có nghĩa là mẫu mới có thể **cướp** của mẫu cũ: tên vấn đề "Vàng da sau
gan (sỏi ống mật chủ, u đầu tụy)" bị mẫu "sỏi ống mật chủ" cướp mất tiêu chuẩn vàng da
chung. Thêm xong phải chạy phép đối chiếu: với từng tên trong `BENH_NHOM`, `TEN_VAN_DE`,
`LIBRARY` và `TEN_NGUYEN_NHAN`, nếu một mẫu MỚI và một mẫu CŨ cùng khớp thì phải xem lại
xem cái nào đúng hơn. Đợt 3 bắt được 3 chỗ như vậy (Dọa sinh non, Thai kỳ bình thường
theo dõi chuyển dạ, Xơ gan do rượu) — cả ba mẫu cũ đều đúng hơn, đã chặn bằng
negative lookahead `^(?!.*<từ loại trừ>)(?=.*<từ cần khớp>)`.

Còn một phép nữa nên chạy kèm: mẫu nào KHÔNG khớp được bất kỳ tên nào trong 1.325 tên
đó thì gần như chắc là regex hỏng (thiếu biến thể dấu, đặt sai chỗ ranh giới từ). Hiện
chỉ còn đúng một mẫu như vậy và nó hợp lệ — dẫn lưu màng phổi là một thủ thuật chứ
không phải tên bệnh.

Kịch bản đối chiếu để ở scratchpad; muốn chạy lại thì so mảng `TIEU_CHUAN.slice(0, N)`
(N = số mục vừa `unshift`) với phần còn lại, trên hợp của `BENH_NHOM`, `TEN_VAN_DE`,
`LIBRARY[].k` và `TEN_NGUYEN_NHAN` — khoảng 1.325 tên.

**Ba bẫy khi viết regex tiếng Việt trong các kho này.**
Một là lớp ký tự bỏ dấu có thể xóa mất khác biệt nghĩa: `vi[êe]m g[âa]n` khớp luôn vào
**viêm gan** vì `[âa]` nhận cả `a`. Cặp nào chỉ khác nhau đúng cái dấu thì phải giữ dấu,
đừng bỏ dấu cho "dễ khớp".
Hai là lớp ký tự bỏ dấu phải liệt kê ĐỦ biến thể: `l[ưu]{1,2}ng` KHÔNG khớp "lưỡng"
vì `ỡ` không nằm trong lớp — mẫu chết lặng lẽ, chỉ lộ ra khi đếm độ phủ. Chữ có dấu
ngã hoặc hỏi phải viết riêng: `l[ưu][ỡo]ng`, `d[ưu][ỡo]ng ch[ấa]p`.
Ba là `\b` của JavaScript chỉ hiểu chữ ASCII: `\bghẻ\b` KHÔNG khớp "Ghẻ" vì `ẻ` không
phải ký tự từ nên không có ranh giới sau nó. Chỉ đặt `\b` cạnh chữ cái ASCII.

**Phép quét đồng âm — chạy sau mỗi lần thêm mẫu vào bất kỳ kho nào.**
Tiếng Việt bỏ dấu thì rất nhiều từ khác nghĩa trùng nhau (177 cặp chỉ tính riêng trong
tập tên bệnh của dự án này). Cách bắt: với mỗi mẫu, lấy **chính đoạn chữ nó khớp được**
trong từng tên; hai đoạn khớp khác nhau mà bỏ dấu lại giống nhau thì mẫu đó đang gộp hai
từ khác nghĩa. So cả tên thì quá ồn — phải so đoạn khớp.

Phép này đã bắt 7 lỗi mà không lỗi nào tự báo, 4 trong đó có sẵn từ trước: `suy tủy` ăn
"suy tuyến yên", `bỏng` ăn "nhau bong non", `nhiễm trùng tiểu` ăn "nhiễm trùng tiêu hóa",
`lao` ăn "lão suy". Cặp `sảy/sẩy thai` vẫn khớp cả hai và đó là ĐÚNG — hai cách viết của
cùng một từ. Phép quét chỉ nêu nghi vấn, người quyết.

**Guard phải bao cả mẫu, không để riêng một nhánh.** `/a|b|^(?!...)c/` thì nhánh `a` và
`b` vẫn khớp tự do. Phải viết `/^(?!.*loại-trừ)(?=.*(a|b|c))/` mới chặn được cả mẫu.

**Kho thuốc có hai ràng buộc riêng.**
Một là mọi tên trong `THUOC_THEO_BENH[].thuoc` phải có trong `THUOC_NHOM` — tên lạ thì
chip vẫn thêm được dòng vào y lệnh nhưng `fillFrom()` không tìm ra liều, để lại một dòng
trống. Thêm phác đồ xong phải đếm lại số tên không khớp, phải bằng 0.
Hai là thêm mặt bệnh mới thì `push` chứ KHÔNG `unshift` — `thuocTheoBenh()` lấy mẫu khớp
đầu tiên, thêm vào cuối thì các phác đồ cũ giữ nguyên thứ tự ưu tiên.

Nên chạy thêm một phép quét: với mỗi tên bệnh, so tập từ của nó với tập từ của tên phác
đồ được gán; không chung từ nào thì soi tay. Phép này đã bắt được hai lỗi thật (xem bảng
dưới) mà không lỗi nào tự báo.

**Luật mới trong `clinical-validator.js`** phải mang `targetTab` khớp một `data-tab` có
thật và `targetField` khớp một `id` có thật — sai là bấm "đi tới" không nhảy đi đâu cả.

## Đã sửa

| Ngày | Chỗ đứt | Đã làm |
|---|---|---|
| 2026-08-28 | `bindAuto` đóng băng sau khi mở lại bệnh án | thêm `adopt()`, dời binder lên trước `loadExisting()` |
| 2026-08-28 | `ob-lmp`/`ob-cycle` lưu được nhưng không ra bản xuất | `applyObstetric()` → `history-obgyne` |
| 2026-08-28 | `asa-out` hứa xếp ASA nhưng không có code | `calcAsa()` → ô ẩn `sx-asa` → mục "Cần hỏi trước mổ" |
| 2026-08-28 | `qsofa-out` không vào tóm tắt như GCS/CURB | gom ba thang điểm qua cùng hàm `diem()` |
| 2026-08-28 | `patient-name-error`, `reason-error` là ô báo lỗi chết | xóa |
| 2026-08-28 | cân nặng / chẩn đoán trước–sau mổ / giờ cấp cứu / ngày chấn thương / tuổi tháng phải gõ tay hai lần | `MIRRORS` + `fillDerived` + 3 luật báo lệch |
| 2026-08-28 | `cd-ky-list` là datalist rỗng không ai đổ dữ liệu | `KY_VONG_THEO_CLS`, phủ 119/119 cận lâm sàng |
| 2026-08-28 | gõ bệnh không có mẫu trong `LIBRARY` thì thẻ biện luận dán **tiêu chuẩn của bệnh cảnh khác** dưới tên đó (Viêm màng ngoài tim → tiêu chuẩn Đau ngực) | `libFor()` giữ tiêu chuẩn theo tên đã gõ |
| 2026-08-28 | 142/387 mặt bệnh không có tiêu chuẩn, biến chứng, biện luận hay phác đồ nào | 5 đợt: 15 + 19 + 32 + 39 + 31 tiêu chuẩn và 6 + 4 + 5 + 4 + 4 nhóm biến chứng → **387/387 mặt bệnh đều có ít nhất một thứ hỗ trợ** |
| 2026-08-28 | `bien-luan-data.js` dòng 1711 có ký tự backspace thay cho `\b`, nhánh `cpb` của regex chết | sửa, quét sạch cả thư mục |
| 2026-08-28 | phép quét đồng âm bắt 7 mẫu gộp hai từ khác nghĩa: `suy tủy`→"suy tuyến yên", `bỏng`→"nhau bong non", `nhiễm trùng tiểu`→"nhiễm trùng tiêu hóa", `lao`→"lão suy", `trĩ`→"trí tuệ / tri giác / điều trị", `nhọt`→"phổi bị nhốt", `chốc`→"chọc dò" | chặn từng mẫu bằng lookahead; 4 lỗi đầu là lỗi có sẵn |
| 2026-08-28 | `\bhap\b` (viết tắt HAP) khớp luôn vào "hô hấp" sau khi bỏ dấu, nên **mọi ca suy hô hấp đều được gợi ý Meropenem + Vancomycin** của viêm phổi bệnh viện; "Đợt cấp COPD có suy hô hấp" cũng bị cướp | thêm chặn `^(?!.*ho hap)` |
| 2026-08-28 | 9 thuốc được `THUOC_THEO_BENH` gợi ý nhưng `THUOC_NHOM` chưa định nghĩa → chip chèn vào y lệnh thành dòng trống không có liều | bổ sung 9 thuốc + Acyclovir; ràng buộc nay về 0 |
| 2026-08-28 | kho phác đồ chỉ phủ 90/387 mặt bệnh | thêm 54 bộ y lệnh mẫu → **174/387** |
| 2026-08-28 | mục XV Tiên lượng chỉ có 2 chip gợi ý | mở thành 14 chip: tiên lượng gần / xa / yếu tố làm nặng / dự phòng, và cho nối tiếp thay vì đè |
