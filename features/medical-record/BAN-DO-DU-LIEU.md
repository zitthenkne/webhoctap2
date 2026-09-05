# Bản đồ dữ liệu — `tao-benh-an.html`

**Đồ thị nằm ở [`BAN-DO-DU-LIEU.codegraph`](BAN-DO-DU-LIEU.codegraph)** — 564 nút,
890 cạnh, sinh tự động bằng `node ban-do-codegraph.mjs`. Đó mới là nguồn tra cứu.
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

**Ô chỉ để bấm/tìm, không phải nội dung bệnh án** (như `cmdk-q`, các ô do JS dựng ra
lúc chạy) thì khai vào danh sách `control_only` trong `ban-do-codegraph.mjs`, đừng để
nó nằm im thành `no_route_to_output` giả.

## Bốn lớp mã của trang này

| File | Việc | Được phép đụng vào |
|---|---|---|
| `tao-benh-an.js` | mạch nhập liệu, tự lưu, tính toán | tất cả |
| `tao-benh-an-them.js` | lối tắt giao diện (tìm mục, ô trống, tập trung, mục lục nổi, đọc đêm…) | chỉ đọc DOM |
| `nhap-lien-ket.js` | nhập nhanh & liên kết dữ kiện | chỉ đọc DOM + ghi vào ô có sẵn |
| `toan-canh.js` | màn Toàn cảnh: sơ đồ cơ thể · lưới hệ cơ quan · bảng đối chiếu chẩn đoán | chỉ đọc DOM và các editor |

Ba file sau nạp **sau** `tao-benh-an.js` nên mọi nút đã gắn xong sự kiện, và chúng
KHÔNG thêm ô nội dung nào — nên không phải đụng `FIELDS`/`buildModel`. Ghi vào ô thì
phải dispatch **cả `input` lẫn `change`** (`setField()` trong `nhap-lien-ket.js`), thiếu
`change` là `MIRRORS` và `bindAuto` không chạy.

`toan-canh.js` chỉ ĐỌC, không ghi vào ô nào — nó vẽ lại những gì đã nhập. Thêm khung
mới thì lấy dữ liệu qua hàm `export` của các editor (`getSteps`, `docRos`, `getBienLuan`)
chứ đừng đọc thẳng state riêng của chúng.

## Thang lớp nổi (đáy màn hình)

Khai một chỗ duy nhất trong `<style>`, mục "THANG LỚP NỔI". **Thêm lớp nổi mới thì
bám vào biến, đừng đặt `bottom` bằng số.**

```
--dock-h  chỗ thanh Lưu chiếm (đã cộng 10px hở)   82px điện thoại · 94px máy tính
--rail    mép trên thanh đáy = --dock-h + safe-area
--z-rail 45 · --z-badge 55 · --z-flash 58
```

Ba tầng, mỗi tầng **một** thứ:

| Tầng | Ở đâu | Ai đứng |
|---|---|---|
| 0 | đáy | thanh Lưu — hoặc thanh trợ nhập lúc đang gõ (`body.typing`) |
| 1 | `--rail` | khay công cụ **hoặc** thẻ Nhìn nhanh; góc phải: viên đèn logic |
| 2 | `--rail + 56px` | toast và nút hoàn tác (lớp chớp, cố ý nổi lên trên) |

Loại trừ lẫn nhau bằng class trên `<body>`: `typing`, `ba-tools-open`, `nl-peek-on`,
`nl-undo-on`. Mọi thứ ở thang này đều **dưới 60** nên bảng chọn mục (60), xem trước
(65), sơ đồ (70), bảng chọn danh sách (85), tìm nhanh (90) luôn phủ được lên trên.

Đo lại bằng máy chứ đừng nhìn ảnh: dựng `_shot.html` có đoạn đọc
`getBoundingClientRect()` của từng lớp rồi in ra cặp nào chồng nhau, chụp ở 400 / 500 /
768 / 1280 px với các trạng thái nghỉ · đang gõ · mở thẻ · mở khay.

## Footgun

**Bản đồ cơ thể có HAI đường dữ liệu, đừng gộp.** Đau đi đường cũ `m.vung` + `m.dau`
(một mốc một điểm đau chung); năm loại còn lại — chấn thương, dấu da – niêm, phù,
khối – hạch, sẹo mổ – dẫn lưu — đi `m.dh = [{z, k, t}]`. Tách ra để bệnh án đã lưu mở
lên không mất chỗ đau nào. Thêm loại mới thì thêm hàng vào `LOAI_DAU`, thêm luật màu
`.bm-z.is-on.is-k-<id>` và `.bm-k-<id>` trong `<style>`, và thêm cụm mở đầu câu vào
`MO_DAU` của `dauHieuProse()` — thiếu cái cuối là dấu không ra được bệnh án.

**Mỗi khu chi tiết là một "mặt", không phải một hàm vẽ riêng.** `MAT` giữ nền + khung
nhìn; `REGIONS` cột 3 mang tên mặt. Thêm khu = thêm một hàng `MAT` + các hàng `REGIONS`
mang tên mặt đó, `bodyMapSvg()` không phải sửa. Id vùng của khu phải có tiền tố riêng
(`dm- nc- bu- bt- bc- lu-`): trùng id với vùng toàn thân thì `BY_ID` lấy hàng sau cùng,
và `regionMat()` trả sai khu nên tia hướng lan bắc cầu sang khu khác.

**`doiXung()` trong `body-map.js` đòi nửa đường viền kết thúc trên trục x = 100.** Nhánh
quay về bắt đầu ngay từ điểm cuối; lệch trục là nó nhảy sang toạ độ đã lật và vẽ ra một
cái nêm to bằng nửa hình — hỏng hẳn chứ không phải xấu.

**Ba khu ngực / bụng / lưng là PHÓNG TO của hình người, không có hình riêng.** `nen:
NGUOI` + `vb` cắt vào đúng khu, và vùng của chúng dùng hệ toạ độ TOÀN THÂN (không phải
0–200 như các khu khác). Vẽ tay ba hình đó chỉ ra mấy quả trứng; cắt hình người thì vừa
đúng giải phẫu vừa luôn khớp với bản toàn thân.

**Ô lớn khai SAU sẽ phủ lên ô nhỏ và cướp cú chạm.** Thứ tự trong `REGIONS` là thứ tự
vẽ, sau = nằm trên. `nc-uc` (thân xương ức) từng khai sau 5 ổ van nên hai ổ LS2 bấm
không trúng. Mảng nền rộng phải khai TRƯỚC các điểm nhỏ nằm trên nó; kiểm bằng
`document.elementFromPoint(tâm ô)`.

**Cửa sổ bản đồ dời nguyên `#hx-dt` ra `<body>`, không dựng bản sao.** Sự kiện gắn trên
chính `host` nên dời node đi vẫn còn nguyên; và `.page-card` có `backdrop-filter` nên
`position:fixed` để yên trong đó sẽ neo vào thẻ chứ không vào màn hình. Đóng thì
`neoCu` (một comment node để lại đúng chỗ) đưa khối về nguyên vị.

**Vùng mới vẽ xong phải soi bằng ảnh, đừng tin toạ độ.** Dựng một trang tạm render mọi
`MAT_LIST` với tất cả vùng bật sáng rồi chụp — đợt này bắt được 22 vùng thò ra ngoài
bóng nền (bờ sườn, mông, mắt cá, hố thượng đòn…), không cái nào tự báo lỗi.

**Bảng đối chiếu chẩn đoán (`toan-canh.js`) so chữ CÓ DẤU, khác mọi chỗ khác.** Cả trang
dùng `fold()` bỏ dấu cho dễ khớp, riêng bảng này thì không được: bỏ dấu xong "đau" và
"đầu" thành một, nên vế "không đau đầu" biến dấu chứng "Gan to đau" thành *đã ghi âm
tính* — sai hẳn nghĩa, mà lại nằm ngay dưới tên chẩn đoán nên đọc như một khẳng định.
Luật khớp cũng phải đòi **đủ mọi từ chính**, không phải "trùng vài từ": lỏng hơn thì
"khó thở khi gắng sức" tick xanh vào ô "Khó thở khi nằm". Thà để *chưa hỏi tới*.

**`display:flex` trong media query thắng thuộc tính `[hidden]`.** `[hidden]{display:none}`
chỉ nằm trong UA sheet nên thua bất kỳ luật lớp nào. Dải mục lục nổi `.ol-rail` từng hiện
ra một khối rỗng ở mục không có tiêu đề nào; phải viết thêm `.ol-rail[hidden]{display:none
!important}`.

**Thêm span vào `.cmdk-item` phải cho nó xuống hàng riêng.** `.cmdk-item span` có sẵn
`flex:none`; một span rộng 100% sẽ chiếm trọn hàng và bóp `<b>` tên ô còn 0px. Dùng
`flex: 1 0 100%` + `flex-wrap: wrap` trên thẻ cha.

**Nhãn cắt bằng ellipsis phải đặt trên chính THẺ CHỮ.** Đặt `text-overflow: ellipsis` lên
một khối `display:flex` (như `.ol-item`) thì chữ tràn ra ngoài chứ không cắt — phải bọc
chữ trong `<span>` riêng.

**Lớp nổi phải neo vào THẺ NỘI DUNG, không neo vào mép màn hình.** Dùng `--page-in`
(khai cùng chỗ với thang lớp). Màn 1280px thì thẻ chỉ rộng 1152px và nằm giữa — neo
`right: 14px` là thanh thò ra ngoài thẻ 33px, nhìn đúng như bị kéo lệch sang phải.
`--page-in` viết bằng `%` chứ không `vw`: phần trăm của khối `fixed` tính theo bề ngang
đã trừ thanh cuộn, còn `100vw` tính cả (lệch thêm ~16px).

**Chỗ tràn ngang gần như luôn là một trong ba thứ này.** Đã bắt được cả ba trên trang
này, không cái nào tự báo lỗi:
1. **Ô con của flex/grid không co được.** Mặc định `min-width: auto` = rộng bằng nội
   dung nhỏ nhất, nên một dải chip dài không cuộn bên trong mà đội nguyên cái hộp ra
   ngoài thẻ (hộp "Đủ ý n/8" thừa 82px). Chữa: `min-width: 0` cho ô con; lưới thì
   `repeat(3, minmax(0, 1fr))` chứ `1fr` vẫn không hẹp hơn chữ dài nhất được.
   **Dải cuộn ngang chỉ cuộn được khi CẢ chuỗi tổ tiên chịu co.**
2. **`white-space: nowrap` trên nút nhãn dài** (`.hx-mini` với "Mốc này có đi khám /
   nhập viện ở đâu không?"). Máy hẹp phải cho `white-space: normal` + `max-width: 100%`.
3. **`<select>` lấy bề ngang theo dòng option dài nhất** — phải chặn `max-width: 100%`.

**Thanh đáy phải co được.** Ba nút biểu tượng + Xem trước + "Lưu bệnh án" (nowrap) cộng
lại rộng hơn máy 390px, mà không món nào co nên cả hàng đội ra ngoài mép phải. Chữa:
bỏ thanh đệm `.flex-1`, cho nút Lưu `flex: 1 1 auto; min-width: 0`, và ≤480px bỏ hai nút
đã có đường khác (đổi mục = dải chip dính đầu trang, tìm mục = trong khay ⋯).

**Vuốt ngang đổi mục phải nhường mọi dải cuộn ngang.** Trang có ~91 dải chip; liệt kê
tên lớp trong `NO_SWIPE` thì chắc chắn sót, sót cái nào là kéo chip cái đó lại nhảy sang
mục khác. Phải dò bằng khả năng cuộn thật (`scrollWidth > clientWidth` + `overflow-x`
auto/scroll trên cả chuỗi tổ tiên), và chặn luôn cú vuốt bắt đầu từ một `button`.

**Cách đo máy hẹp khi headless kẹp ở 500px:** bơm `.page-card{max-width:374px}` (giả lập
máy 390px) hay `304px` (máy 320px) rồi liệt kê phần tử nào có mép phải vượt mép thẻ.
Media query `≤640` vẫn đúng, chỉ chỗ trống hẹp lại — đủ để bắt cả ba loại tràn ở trên.
Muốn kiểm luật `≤480` thì bơm thêm chính khai báo đó vào.

**Chrome headless KHÔNG giả lập được `hover: none`** — nó luôn báo `hover: hover`, nên
mọi luật `@media (hover: none)` không bao giờ chạy khi chụp ảnh kiểm tra. Luật bố cục
điện thoại vì vậy viết theo `max-width: 640px`; chỉ để `hover` cho thứ thật sự phụ
thuộc con trỏ.

**Đặt `style.bottom` bằng JS là đè chết cả thang lớp trong CSS.** `placeAssist()` từng
ghim `bottom = 0px` mỗi lần `visualViewport` báo về, kể cả trên máy tính — thanh trợ
nhập nằm chồng lên thanh Lưu. Chỉ đặt inline khi bàn phím thật sự đang che
(`innerHeight - (vv.height + vv.offsetTop) > 40`), còn lại phải **xóa** (`= ''`) để trả
quyền cho CSS.

**Tên ô đọc được (`labelOf` trong `tao-benh-an-them.js`) phải dò tới thẻ đứng NGAY
TRƯỚC.** Nhiều ô ở đây có nhãn là anh em chứ không bọc ngoài (ô sinh hiệu) hoặc nằm
trong `<details>` (ô lý do vào viện). Chỉ dò `closest('label')` + `label[for]` là rơi
xuống `placeholder`, bảng dán thông tin hiện ra những cái tên như "Nhập mạch" hay
nguyên câu hướng dẫn dài. Thứ tự đúng: nhãn bọc ngoài → `label[for]` → anh em ngay
trước (`label, summary, .hx-sub, .calc-title`) → placeholder → aria-label → id.

**Thanh trợ nhập / bảng dán phải `preventDefault` ở `mousedown`.** Bấm một nút trên
thanh nổi mà không chặn `mousedown` là ô đang gõ mất con trỏ trước khi `click` chạy —
chèn chữ vào không còn biết chèn ở đâu.

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
| 2026-09-04 | nhập liệu vẫn là gõ tay từng ô; dữ kiện đã khám ra không ai kiểm có được dùng lại không | thêm `nhap-lien-ket.js`: đọc chính tả, dán khối chữ, gõ cả dòng sinh hiệu, gõ tắt, kho chữ đã gõ, hoàn tác cả loạt; chèn dữ kiện bằng `@`, thẻ Nhìn nhanh, soi dữ kiện chưa dùng và số chép lệch |
| 2026-09-04 | `cmdk-q` (ô tìm Ctrl+K của bản pastel) chưa khai, bộ sinh báo `no_route_to_output` giả | thêm vào danh sách `control_only` |
| 2026-09-04 | `/\bn[ữu]\b/` không khớp "Nữ" nên dán "Tuổi: 47 — Giới: Nữ" mất vế giới tính | bỏ dấu trước rồi mới dò (`fold(v)` + `\bnu\b`) — lại đúng bẫy `\b` chỉ hiểu ASCII |
| 2026-09-05 | đáy màn hình điện thoại có 6 lớp tự neo trong dải 40px (thanh lưu 8, thẻ Nhìn nhanh 78, khay công cụ 80, đèn logic 88, toast 92, hoàn tác 118) — lúc nghỉ đã chồng 2 cặp, mở khay là 5 cặp | gom về thang 3 tầng theo `--rail`, loại trừ nhau bằng class trên body; đo lại 4 bề ngang × 4 trạng thái: chỉ còn lớp chớp cố ý đè lên bảng |
| 2026-09-05 | `placeAssist()` ghim `style.bottom=0` nên thanh trợ nhập đè lên thanh Lưu ở máy tính | chỉ đặt inline khi bàn phím thật sự che, còn lại xóa style |
| 2026-09-05 | máy 390px: nút "Lưu bệnh án" và nút "Mốc này có đi khám…" đội ra ngoài mép thẻ; hộp "Đủ ý n/8" thừa 82px | thanh đáy cho co + bỏ 2 nút trùng ở ≤480px; `min-width:0` cho ô con flex; `minmax(0,1fr)` cho lưới; nút nhãn dài được xuống dòng — quét lại 7 mục × 2 bề ngang: 0 chỗ tràn |
| 2026-09-05 | lớp nổi neo vào mép màn hình nên thò ra ngoài thẻ nội dung 33px ở màn rộng | thêm `--page-in`, mọi lớp nổi neo theo thẻ |
| 2026-09-05 | kéo dải chip gợi ý là bị nhảy sang mục khác | `NO_SWIPE` dò khả năng cuộn thật thay vì liệt kê tên lớp, chặn cả cú vuốt bắt đầu từ `button` |
