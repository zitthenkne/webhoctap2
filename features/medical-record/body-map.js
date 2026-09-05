// body-map.js — bản đồ giải phẫu SVG phẳng: bấm chọn vùng đau, kéo để vẽ hướng lan.
//
// Sinh viên tả vị trí đau bằng chữ thì mỗi người một kiểu ("bụng dưới bên phải",
// "vùng ruột thừa", "hố chậu (P)"), thầy đọc lại phải đoán. Ở đây vùng là một ô
// bấm được, tên gọi lấy đúng bộ phân khu đang dạy (9 vùng bụng, các khoang ngực,
// hai hố thắt lưng, các khớp lớn), nên câu văn máy ghép ra luôn dùng đúng thuật ngữ.
//
// Module này CHỈ giữ hình và tên vùng, không giữ dữ liệu bệnh án: mốc bệnh sử nào
// đang chọn, đau mấy điểm, lan đi đâu — đều do bên gọi truyền vào.
//
// Dữ liệu gắn vào mỗi mốc bệnh sử (thêm khóa mới, bệnh án cũ mở lên vẫn chạy):
//   m.vung = ['bung-hcp', 'nguc-t']        vùng đang đau
//   m.lan  = [['nguc-giua', 'tay-t']]      [từ vùng, tới vùng]
//   m.dau  = 0–10                          điểm đau, dùng để tô màu
//   m.dh   = [{ z, k, t }]                 dấu KHÁC đau: vùng · loại · ghi chú
//                                          (chấn thương, dấu da, phù, khối, sẹo mổ)
//
// Ngoài hình người toàn thân còn sáu bản đồ phóng to (đầu–mặt, thành ngực và ổ
// nghe tim, ổ bụng kèm các điểm đau, hai bàn tay, hai bàn chân, lưng – cột sống).
// Mỗi cái là một "mặt" trong bảng MAT, dùng chung đúng một hàm vẽ.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* [id, tên đọc lên trong bệnh sử, hình] — hình là ['r',x,y,w,h] hoặc ['e',cx,cy,rx,ry].
   Bên phải / bên trái luôn là của BỆNH NHÂN. Mặt trước thì phải của bệnh nhân nằm
   bên trái người xem; mặt sau thì ngược lại, nên tọa độ mặt sau đã đảo sẵn. */
export const REGIONS = [
    /* ---------- mặt trước: đầu – mặt – cổ ---------- */
    ['tran', 'trán', 'truoc', ['r', 86, 16, 28, 12]],
    ['thai-duong-p', 'thái dương phải', 'truoc', ['r', 80, 30, 12, 12]],
    ['thai-duong-t', 'thái dương trái', 'truoc', ['r', 108, 30, 12, 12]],
    ['goc-ham-p', 'góc hàm phải', 'truoc', ['r', 85, 47.6, 9.1, 7.7]],
    ['goc-ham-t', 'góc hàm trái', 'truoc', ['r', 106, 47.6, 9.1, 7.7]],
    ['co-truoc', 'vùng cổ trước', 'truoc', ['r', 92, 57.3, 16, 10.4]],

    /* ---------- mặt trước: lồng ngực ---------- */
    ['nguc-p', 'ngực phải', 'truoc', ['r', 67, 93, 26, 38]],
    ['nguc-t', 'ngực trái (vùng trước tim)', 'truoc', ['r', 107, 93, 26, 38]],
    ['sau-xuong-uc', 'sau xương ức', 'truoc', ['r', 93, 78, 14, 46]],

    /* ---------- mặt trước: 9 phân khu ổ bụng ---------- */
    ['bung-hsp', 'hạ sườn phải', 'truoc', ['r', 68, 128, 21, 22]],
    ['bung-tv', 'thượng vị', 'truoc', ['r', 89, 128, 21, 22]],
    ['bung-hst', 'hạ sườn trái', 'truoc', ['r', 110, 128, 21, 22]],
    ['bung-hongp', 'hông phải', 'truoc', ['r', 68, 151, 21, 22]],
    ['bung-ron', 'quanh rốn', 'truoc', ['r', 89, 150, 21, 22]],
    ['bung-hongt', 'hông trái', 'truoc', ['r', 110, 150, 21, 22]],
    ['bung-hcp', 'hố chậu phải', 'truoc', ['r', 68, 172, 21, 22]],
    ['bung-hv', 'hạ vị', 'truoc', ['r', 89, 172, 21, 22]],
    ['bung-hct', 'hố chậu trái', 'truoc', ['r', 110, 172, 21, 22]],

    /* ---------- mặt trước: chi và khớp ---------- */
    ['vai-p', 'khớp vai phải', 'truoc', ['e', 62, 94, 5.8, 5.8]],
    ['vai-t', 'khớp vai trái', 'truoc', ['e', 138, 94, 5.8, 5.8]],
    ['tay-p', 'cánh tay phải', 'truoc', ['r', 47, 108, 14, 38]],
    ['tay-t', 'cánh tay trái', 'truoc', ['r', 139, 108, 14, 38]],
    ['khuyu-p', 'khuỷu phải', 'truoc', ['e', 48, 154, 8, 8]],
    ['khuyu-t', 'khuỷu trái', 'truoc', ['e', 152, 154, 8, 8]],
    ['cotay-p', 'cổ tay phải', 'truoc', ['e', 44, 206, 7, 7]],
    ['cotay-t', 'cổ tay trái', 'truoc', ['e', 156, 206, 7, 7]],
    ['ben-p', 'vùng bẹn phải', 'truoc', ['r', 72, 196, 22, 20]],
    ['ben-t', 'vùng bẹn trái', 'truoc', ['r', 106, 196, 22, 20]],
    ['hang-p', 'khớp háng phải', 'truoc', ['e', 76, 220, 10, 9]],
    ['hang-t', 'khớp háng trái', 'truoc', ['e', 124, 220, 10, 9]],
    ['goi-p', 'khớp gối phải', 'truoc', ['e', 78, 302, 8, 9]],
    ['goi-t', 'khớp gối trái', 'truoc', ['e', 122, 302, 8, 9]],
    ['cangchan-p', 'cẳng chân phải', 'truoc', ['r', 72, 322, 14, 54]],
    ['cangchan-t', 'cẳng chân trái', 'truoc', ['r', 114, 322, 14, 54]],
    ['cochan-p', 'cổ chân phải', 'truoc', ['e', 79, 392, 7, 7]],
    ['cochan-t', 'cổ chân trái', 'truoc', ['e', 121, 392, 7, 7]],

    /* ---------- mặt sau (trái / phải đã đảo cho đúng phía bệnh nhân) ---------- */
    ['gay', 'vùng gáy', 'sau', ['r', 92.2, 60.5, 15.6, 9.1]],
    ['cham', 'vùng chẩm', 'sau', ['r', 86, 30, 28, 20]],
    ['lien-ba-vai', 'vùng liên bả vai', 'sau', ['r', 74, 80, 52, 28]],
    ['cs-nguc', 'cột sống ngực', 'sau', ['r', 93, 80, 14, 60]],
    ['cs-tl', 'cột sống thắt lưng', 'sau', ['r', 93, 142, 14, 50]],
    ['ho-tl-p', 'hố thắt lưng phải', 'sau', ['r', 109, 140, 22, 32]],
    ['ho-tl-t', 'hố thắt lưng trái', 'sau', ['r', 69, 140, 22, 32]],
    ['mong-p', 'vùng mông phải', 'sau', ['r', 102, 194, 26, 28]],
    ['mong-t', 'vùng mông trái', 'sau', ['r', 72, 194, 26, 28]],
    ['khoeo-p', 'khoeo chân phải', 'sau', ['e', 122, 302, 8, 9]],
    ['khoeo-t', 'khoeo chân trái', 'sau', ['e', 78, 302, 8, 9]],

    /* ---------- mặt trước: mặt – cổ chi tiết (bổ sung) ---------- */

    /* ---------- mặt trước: thành ngực (bổ sung) ---------- */
    ['ha-don-p', 'vùng hạ đòn phải', 'truoc', ['r', 68, 83, 24, 8]],
    ['ha-don-t', 'vùng hạ đòn trái', 'truoc', ['r', 108, 83, 24, 8]],
    ['nach-p', 'vùng nách phải', 'truoc', ['e', 63, 98, 6, 8]],
    ['nach-t', 'vùng nách trái', 'truoc', ['e', 137, 98, 6, 8]],

    /* ---------- mặt trước: chi trên – chi dưới (bổ sung) ---------- */
    ['cangtay-p', 'cẳng tay phải', 'truoc', ['r', 38, 168, 15, 34]],
    ['cangtay-t', 'cẳng tay trái', 'truoc', ['r', 147, 168, 15, 34]],
    ['bantay-p', 'bàn tay phải', 'truoc', ['r', 35, 212, 17, 22]],
    ['bantay-t', 'bàn tay trái', 'truoc', ['r', 148, 212, 17, 22]],
    ['dui-p', 'đùi phải', 'truoc', ['r', 69, 234, 18, 54]],
    ['dui-t', 'đùi trái', 'truoc', ['r', 113, 234, 18, 54]],
    ['banchan-p', 'bàn chân phải', 'truoc', ['r', 70, 398, 18, 13]],
    ['banchan-t', 'bàn chân trái', 'truoc', ['r', 112, 398, 18, 13]],
    ['sinh-duc', 'vùng sinh dục ngoài', 'truoc', ['r', 94, 200, 12, 16]],

    /* ---------- mặt sau (bổ sung) ---------- */
    ['cs-co', 'cột sống cổ', 'sau', ['r', 93, 50, 14, 8]],
    ['ba-vai-p', 'vùng bả vai phải', 'sau', ['r', 126, 85, 10, 24]],
    ['ba-vai-t', 'vùng bả vai trái', 'sau', ['r', 64, 85, 10, 24]],
    ['canh-tay-sau-p', 'mặt sau cánh tay phải', 'sau', ['r', 139, 108, 14, 38]],
    ['canh-tay-sau-t', 'mặt sau cánh tay trái', 'sau', ['r', 47, 108, 14, 38]],
    ['cung-cut', 'vùng cùng cụt', 'sau', ['r', 96, 194, 8, 26]],
    ['hau-mon', 'vùng hậu môn – tầng sinh môn', 'sau', ['r', 95, 214, 10, 10]],
    ['dui-sau-p', 'mặt sau đùi phải', 'sau', ['r', 113, 234, 18, 54]],
    ['dui-sau-t', 'mặt sau đùi trái', 'sau', ['r', 69, 234, 18, 54]],
    ['bap-chan-p', 'bắp chân phải', 'sau', ['r', 114, 322, 14, 50]],
    ['bap-chan-t', 'bắp chân trái', 'sau', ['r', 72, 322, 14, 50]],
    ['got-chan-p', 'gót chân phải', 'sau', ['e', 121, 400, 7, 7]],
    ['got-chan-t', 'gót chân trái', 'sau', ['e', 79, 400, 7, 7]],

    /* =================================================================
       BẢN ĐỒ KHU — phóng to một phần cơ thể để đánh dấu cho đúng chỗ.
       Hình người toàn thân chỉ đủ để nói "đau hạ sườn phải"; muốn ghi
       "điểm McBurney (+)", "ổ van hai lá", "khớp bàn – ngón cái", "mỏm
       gai L4" thì phải có bản đồ riêng của khu đó.

       Mỗi khu là một "mặt" như `truoc` / `sau`, khai trong bảng MAT bên
       dưới (nền + khung nhìn riêng). Id vùng mang tiền tố khu (dm- nc-
       bu- bt- bc- lu-) cho khỏi đụng id toàn thân, và vì `regionMat()`
       trả về đúng khu nên tia hướng lan không bắc cầu sang khu khác.
       ================================================================= */

    /* ---------- khu ĐẦU – MẶT – CỔ (nhìn thẳng) ---------- */
    ['dm-dinh', 'đỉnh đầu', 'dau-mat', ['r', 74, 21, 52, 16]],
    ['dm-tran', 'trán', 'dau-mat', ['r', 70, 38, 60, 18]],
    ['dm-tduong-p', 'thái dương phải', 'dau-mat', ['r', 61, 46, 20, 20]],
    ['dm-tduong-t', 'thái dương trái', 'dau-mat', ['r', 119, 46, 20, 20]],
    ['dm-may-p', 'cung mày phải', 'dau-mat', ['r', 62, 64, 32, 8]],
    ['dm-may-t', 'cung mày trái', 'dau-mat', ['r', 106, 64, 32, 8]],
    ['dm-mat-p', 'hốc mắt – kết mạc phải', 'dau-mat', ['e', 78, 82, 17, 10]],
    ['dm-mat-t', 'hốc mắt – kết mạc trái', 'dau-mat', ['e', 122, 82, 17, 10]],
    ['dm-mui', 'sống mũi – cánh mũi', 'dau-mat', ['r', 92, 92, 16, 24]],
    ['dm-xoang-p', 'vùng xoang hàm phải', 'dau-mat', ['r', 66, 96, 24, 18]],
    ['dm-xoang-t', 'vùng xoang hàm trái', 'dau-mat', ['r', 110, 96, 24, 18]],
    ['dm-goma-p', 'gò má phải', 'dau-mat', ['r', 68, 116, 24, 14]],
    ['dm-goma-t', 'gò má trái', 'dau-mat', ['r', 108, 116, 24, 14]],
    ['dm-moi', 'môi – quanh miệng', 'dau-mat', ['r', 84, 118, 32, 14]],
    ['dm-mieng', 'khoang miệng – lưỡi – hầu họng', 'dau-mat', ['r', 86, 134, 28, 12]],
    ['dm-cam', 'cằm', 'dau-mat', ['r', 88, 151, 24, 20]],
    ['dm-tai-p', 'vành tai – ống tai phải', 'dau-mat', ['e', 58, 104, 7, 13]],
    ['dm-tai-t', 'vành tai – ống tai trái', 'dau-mat', ['e', 142, 104, 7, 13]],
    ['dm-chum-p', 'xương chũm phải', 'dau-mat', ['e', 76, 126, 8, 9]],
    ['dm-chum-t', 'xương chũm trái', 'dau-mat', ['e', 124, 126, 8, 9]],
    ['dm-ham-p', 'góc hàm – tuyến mang tai phải', 'dau-mat', ['r', 79, 134, 20, 17]],
    ['dm-ham-t', 'góc hàm – tuyến mang tai trái', 'dau-mat', ['r', 101, 134, 20, 17]],
    ['dm-duoiham-p', 'hạch dưới hàm phải', 'dau-mat', ['e', 85, 175, 9, 6]],
    ['dm-duoiham-t', 'hạch dưới hàm trái', 'dau-mat', ['e', 115, 175, 9, 6]],
    ['dm-canh-p', 'máng cảnh – hạch cổ phải', 'dau-mat', ['r', 76, 180, 15, 26]],
    ['dm-canh-t', 'máng cảnh – hạch cổ trái', 'dau-mat', ['r', 109, 180, 15, 26]],
    ['dm-giap', 'tuyến giáp – khí quản', 'dau-mat', ['r', 93, 180, 14, 26]],
    ['dm-tmc', 'tĩnh mạch cổ', 'dau-mat', ['r', 85, 180, 6, 26]],
    ['dm-thuongdon-p', 'hố thượng đòn phải', 'dau-mat', ['r', 48, 218, 28, 13]],
    ['dm-thuongdon-t', 'hố thượng đòn trái', 'dau-mat', ['r', 124, 218, 28, 13]],

    /* ---------- khu THÀNH NGỰC – Ổ NGHE TIM ---------- */
    ['nc-don-p', 'xương đòn phải', 'nguc-ct', ['r', 70.6, 82.2, 22.8, 6.6]],
    ['nc-don-t', 'xương đòn trái', 'nguc-ct', ['r', 106.6, 82.2, 22.8, 6.6]],
    ['nc-hom-uc', 'hõm trên xương ức', 'nguc-ct', ['e', 100.0, 77.2, 5.9, 3.2]],
    ['nc-uc', 'thân xương ức', 'nguc-ct', ['r', 96.4, 83.7, 7.1, 54.1]],
    ['nc-nach-p', 'hố nách phải', 'nguc-ct', ['e', 66.2, 95.3, 4.2, 7.7]],
    ['nc-nach-t', 'hố nách trái', 'nguc-ct', ['e', 133.8, 95.3, 4.2, 7.7]],
    ['nc-dinh-p', 'đỉnh phổi phải', 'nguc-ct', ['r', 72, 88, 20, 10]],
    ['nc-dinh-t', 'đỉnh phổi trái', 'nguc-ct', ['r', 108, 88, 20, 10]],
    ['nc-giua-p', 'trường phổi giữa phải', 'nguc-ct', ['r', 67.9, 92.7, 20.2, 16.7]],
    ['nc-giua-t', 'trường phổi giữa trái', 'nguc-ct', ['r', 113.1, 92.7, 20.2, 16.7]],
    ['nc-day-p', 'đáy phổi phải', 'nguc-ct', ['r', 66.8, 110.7, 21.4, 15.5]],
    ['nc-day-t', 'đáy phổi trái', 'nguc-ct', ['r', 116.6, 110.7, 17.8, 15.5]],
    ['nc-ls2-p', 'ổ van động mạch chủ (LS2 bờ phải xương ức)', 'nguc-ct', ['e', 93.5, 92.7, 5.3, 4.5]],
    ['nc-ls2-t', 'ổ van động mạch phổi (LS2 bờ trái xương ức)', 'nguc-ct', ['e', 106.5, 92.7, 5.3, 4.5]],
    ['nc-erb', 'ổ Erb (LS3 bờ trái xương ức)', 'nguc-ct', ['e', 106.5, 103.0, 5.3, 4.5]],
    ['nc-ls4-t', 'ổ van ba lá (LS4–5 bờ trái xương ức)', 'nguc-ct', ['e', 106.5, 113.3, 5.3, 4.5]],
    ['nc-mom-tim', 'ổ van hai lá – mỏm tim (LS5 đường trung đòn trái)', 'nguc-ct', ['e', 114.2, 131.3, 6.5, 5.2]],
    ['nc-mui-uc', 'mũi ức – vùng thượng vị', 'nguc-ct', ['r', 95.2, 140.3, 9.5, 9.0]],
    ['nc-suon-p', 'bờ sườn phải', 'nguc-ct', ['r', 72.7, 142.9, 22.6, 7.1]],
    ['nc-suon-t', 'bờ sườn trái', 'nguc-ct', ['r', 104.8, 142.9, 22.6, 7.1]],

    /* ---------- khu Ổ BỤNG — 9 phân khu + các điểm đau ---------- */
    ['bu-hsp', 'hạ sườn phải', 'bung-ct', ['r', 66.5, 124.0, 25.4, 21.1]],
    ['bu-tv', 'thượng vị', 'bung-ct', ['r', 91.9, 124.0, 16.2, 21.1]],
    ['bu-hst', 'hạ sườn trái', 'bung-ct', ['r', 108.1, 124.0, 25.4, 21.1]],
    ['bu-hongp', 'hông phải (mạn sườn phải)', 'bung-ct', ['r', 67.5, 144.1, 25.4, 21.1]],
    ['bu-ron', 'quanh rốn', 'bung-ct', ['r', 91.9, 145.1, 16.2, 21.1]],
    ['bu-hongt', 'hông trái (mạn sườn trái)', 'bung-ct', ['r', 107.1, 144.1, 25.4, 21.1]],
    ['bu-hcp', 'hố chậu phải', 'bung-ct', ['r', 68.5, 165.3, 25.4, 21.1]],
    ['bu-hv', 'hạ vị', 'bung-ct', ['r', 91.9, 166.3, 16.2, 21.1]],
    ['bu-hct', 'hố chậu trái', 'bung-ct', ['r', 106.1, 165.3, 25.4, 21.1]],
    ['bu-tui-mat', 'điểm túi mật (dấu Murphy)', 'bung-ct', ['e', 81.7, 137.7, 3.8, 3.7]],
    ['bu-mcburney', 'điểm McBurney', 'bung-ct', ['e', 79.4, 172.6, 3.8, 3.7]],
    ['bu-nq-tren-p', 'điểm niệu quản trên phải', 'bung-ct', ['e', 86.0, 149.4, 3.3, 3.2]],
    ['bu-nq-tren-t', 'điểm niệu quản trên trái', 'bung-ct', ['e', 114.0, 149.4, 3.3, 3.2]],
    ['bu-nq-giua-p', 'điểm niệu quản giữa phải', 'bung-ct', ['e', 82.7, 164.2, 3.3, 3.2]],
    ['bu-nq-giua-t', 'điểm niệu quản giữa trái', 'bung-ct', ['e', 117.3, 164.2, 3.3, 3.2]],
    ['bu-ben-p', 'vùng bẹn – ống bẹn phải', 'bung-ct', ['r', 74.1, 188.5, 16.2, 8.5]],
    ['bu-ben-t', 'vùng bẹn – ống bẹn trái', 'bung-ct', ['r', 109.8, 188.5, 16.2, 8.5]],
    ['bu-mu', 'vùng trên xương mu – cầu bàng quang', 'bung-ct', ['r', 91.4, 189.5, 17.3, 8.5]],

    /* ---------- khu HAI BÀN TAY (nhìn mu tay) ---------- */
    ['bt-p-ngon2', 'ngón trỏ phải', 'ban-tay', ['r', 40, 25, 10, 34]],
    ['bt-p-ngon3', 'ngón giữa phải', 'ban-tay', ['r', 54, 18, 10, 40]],
    ['bt-p-ngon4', 'ngón nhẫn phải', 'ban-tay', ['r', 68, 25, 10, 34]],
    ['bt-p-ngon5', 'ngón út phải', 'ban-tay', ['r', 80, 35, 9, 22]],
    ['bt-p-ngon1', 'ngón cái phải', 'ban-tay', ['e', 22, 80, 7.2, 8]],
    ['bt-p-mcp', 'khớp bàn – ngón phải', 'ban-tay', ['r', 36, 58, 52, 12]],
    ['bt-p-mo-cai', 'mô cái phải', 'ban-tay', ['e', 44, 102, 11, 18]],
    ['bt-p-mo-ut', 'mô út phải', 'ban-tay', ['e', 81, 102, 9, 18]],
    ['bt-p-gan', 'mu bàn tay phải', 'ban-tay', ['r', 56, 80, 24, 40]],
    ['bt-p-hom-lao', 'hõm lào giải phẫu phải', 'ban-tay', ['e', 37, 128, 7, 7]],
    ['bt-p-cotay', 'cổ tay phải', 'ban-tay', ['r', 40, 141, 42, 14]],
    ['bt-t-ngon2', 'ngón trỏ trái', 'ban-tay', ['r', 170, 25, 10, 34]],
    ['bt-t-ngon3', 'ngón giữa trái', 'ban-tay', ['r', 156, 18, 10, 40]],
    ['bt-t-ngon4', 'ngón nhẫn trái', 'ban-tay', ['r', 142, 25, 10, 34]],
    ['bt-t-ngon5', 'ngón út trái', 'ban-tay', ['r', 131, 35, 9, 22]],
    ['bt-t-ngon1', 'ngón cái trái', 'ban-tay', ['e', 198, 80, 7.2, 8]],
    ['bt-t-mcp', 'khớp bàn – ngón trái', 'ban-tay', ['r', 132, 58, 52, 12]],
    ['bt-t-mo-cai', 'mô cái trái', 'ban-tay', ['e', 176, 102, 11, 18]],
    ['bt-t-mo-ut', 'mô út trái', 'ban-tay', ['e', 139, 102, 9, 18]],
    ['bt-t-gan', 'mu bàn tay trái', 'ban-tay', ['r', 140, 80, 24, 40]],
    ['bt-t-hom-lao', 'hõm lào giải phẫu trái', 'ban-tay', ['e', 183, 128, 7, 7]],
    ['bt-t-cotay', 'cổ tay trái', 'ban-tay', ['r', 138, 141, 42, 14]],

    /* ---------- khu HAI BÀN CHÂN (nhìn mu chân) ---------- */
    ['bc-p-ngon1', 'ngón chân cái phải', 'ban-chan', ['e', 82, 30, 8, 9]],
    ['bc-p-ngon-nho', 'các ngón chân II–V phải', 'ban-chan', ['r', 40, 27, 33, 14]],
    ['bc-p-mtp1', 'khớp bàn – ngón cái phải', 'ban-chan', ['e', 82, 44, 10, 8]],
    ['bc-p-mu', 'mu bàn chân phải', 'ban-chan', ['r', 42, 56, 40, 32]],
    ['bc-p-vom', 'vòm – gan bàn chân phải', 'ban-chan', ['r', 40, 90, 44, 24]],
    ['bc-p-mca-trong', 'mắt cá trong phải', 'ban-chan', ['e', 87, 110, 8, 8]],
    ['bc-p-mca-ngoai', 'mắt cá ngoài phải', 'ban-chan', ['e', 39, 110, 8, 8]],
    ['bc-p-got', 'gót chân phải', 'ban-chan', ['e', 63, 132, 24, 16]],
    ['bc-t-ngon1', 'ngón chân cái trái', 'ban-chan', ['e', 138, 30, 8, 9]],
    ['bc-t-ngon-nho', 'các ngón chân II–V trái', 'ban-chan', ['r', 147, 27, 33, 14]],
    ['bc-t-mtp1', 'khớp bàn – ngón cái trái', 'ban-chan', ['e', 138, 44, 10, 8]],
    ['bc-t-mu', 'mu bàn chân trái', 'ban-chan', ['r', 138, 56, 40, 32]],
    ['bc-t-vom', 'vòm – gan bàn chân trái', 'ban-chan', ['r', 136, 90, 44, 24]],
    ['bc-t-mca-trong', 'mắt cá trong trái', 'ban-chan', ['e', 133, 110, 8, 8]],
    ['bc-t-mca-ngoai', 'mắt cá ngoài trái', 'ban-chan', ['e', 181, 110, 8, 8]],
    ['bc-t-got', 'gót chân trái', 'ban-chan', ['e', 157, 132, 24, 16]],
    
    /* ---------- khu LƯNG – CỘT SỐNG (nhìn từ sau, phải bệnh nhân ở bên phải) ---------- */
    ['lu-cs-co', 'cột sống cổ (C1–C7)', 'lung-ct', ['r', 92.9, 52.0, 14.2, 15.6]],
    ['lu-c7', 'mỏm gai C7', 'lung-ct', ['e', 100.0, 71.0, 6.2, 4.3]],
    ['lu-cs-nguc-tren', 'cột sống ngực trên (T1–T4)', 'lung-ct', ['r', 92.9, 76.2, 14.2, 22.5]],
    ['lu-cs-nguc-duoi', 'cột sống ngực dưới (T5–T12)', 'lung-ct', ['r', 92.9, 98.7, 14.2, 39.8]],
    ['lu-cs-tl', 'cột sống thắt lưng (L1–L5)', 'lung-ct', ['r', 92.9, 138.5, 14.2, 39.8]],
    ['lu-cung-cut', 'vùng cùng – cụt (S1–S5)', 'lung-ct', ['r', 92.9, 178.3, 14.2, 24.2]],
    ['lu-bavai-p', 'bả vai phải', 'lung-ct', ['r', 114.3, 84.5, 21.3, 26]],
    ['lu-bavai-t', 'bả vai trái', 'lung-ct', ['r', 64.4, 84.5, 21.3, 26]],
    ['lu-suon-p', 'góc sườn – cột sống phải (rung thận)', 'lung-ct', ['e', 116.0, 142.0, 8.8, 6.9]],
    ['lu-suon-t', 'góc sườn – cột sống trái (rung thận)', 'lung-ct', ['e', 84.0, 142.0, 8.8, 6.9]],
    ['lu-hotl-p', 'hố thắt lưng phải', 'lung-ct', ['r', 107.3, 151.3, 25.3, 24.7]],
    ['lu-hotl-t', 'hố thắt lưng trái', 'lung-ct', ['r', 67.3, 151.3, 25.3, 24.7]],
    ['lu-cs-chau-p', 'khớp cùng – chậu phải', 'lung-ct', ['e', 114.2, 193.9, 8.0, 6.1]],
    ['lu-cs-chau-t', 'khớp cùng – chậu trái', 'lung-ct', ['e', 85.8, 193.9, 8.0, 6.1]],
    ['lu-mong-p', 'vùng mông phải', 'lung-ct', ['r', 104.2, 202, 30.4, 26.5]],
    ['lu-mong-t', 'vùng mông trái', 'lung-ct', ['r', 65.4, 202, 30.4, 26.5]]
];

const BY_ID = new Map(REGIONS.map(r => [r[0], r]));

/* Vùng cũ đã gộp về bản đồ khu. Giữ bảng này để bệnh án đã chấm bằng id cũ vẫn
   đọc ra đúng tên và vẫn vẽ được — chỉ đổi chỗ hiện, không mất dữ kiện. */
const THAY_THE = {
    'hoc-mat-p': 'dm-mat-p', 'hoc-mat-t': 'dm-mat-t',
    'mui-xoang': 'dm-mui', 'mieng-moi': 'dm-moi',
    'tai-p': 'dm-tai-p', 'tai-t': 'dm-tai-t',
    'co-ben-p': 'dm-canh-p', 'co-ben-t': 'dm-canh-t',
    'hom-uc': 'dm-giap'
};
const traId = (id) => THAY_THE[id] || id;


/* =====================================================================
   LOẠI DẤU — không phải chỗ nào trên người cũng chỉ có đau.

   Trước đây chạm một vùng chỉ ghi được "đau ở đó". Nhưng cùng một hình
   người còn phải nói được: vết thương nằm đâu, ban da mọc tới đâu, phù
   tới ngang nào, sờ được khối ở chỗ nào, sẹo mổ cũ ở đâu. Mỗi loại một
   màu riêng nên nhìn hình là đọc ra ngay, khỏi phải bấm từng vùng.

   Đau vẫn đi đường cũ (`m.vung` + `m.dau`) để bệnh án cũ mở lên không
   mất gì; năm loại còn lại nằm ở `m.dh`.
   ===================================================================== */
export const LOAI_DAU = [
    ['dau', 'Đau', 'fa-bolt', '#ef4444', 'chạm vào vùng đau — điểm đau lấy theo thanh trượt của mốc'],
    ['ct', 'Chấn thương', 'fa-user-injured', '#b45309', 'xây xát, bầm, vết rách, gãy xương, bỏng'],
    ['da', 'Dấu da – niêm', 'fa-hand-dots', '#ec4899', 'ban, mụn nước, loét, xuất huyết, sạm da'],
    ['phu', 'Phù', 'fa-water', '#06b6d4', 'phù ấn lõm / không lõm, tới ngang đâu'],
    ['khoi', 'Khối – hạch', 'fa-circle-dot', '#8b5cf6', 'sờ được khối, hạch to, gan lách to'],
    ['seo', 'Sẹo mổ – dẫn lưu', 'fa-bandage', '#64748b', 'sẹo mổ cũ, ống dẫn lưu, catheter, hậu môn nhân tạo']
];
const LOAI_BY = new Map(LOAI_DAU.map(l => [l[0], l]));
export const loaiTen = (k) => LOAI_BY.get(k)?.[1] || k;
export const loaiIcon = (k) => LOAI_BY.get(k)?.[2] || 'fa-thumbtack';
export const loaiMau = (k) => LOAI_BY.get(k)?.[3] || '#8b8496';

/* =====================================================================
   KHUNG NHÌN — mỗi "mặt" là một hình nền + một khung viewBox riêng.

   `truoc` / `sau` là cả người; sáu cái còn lại là bản đồ phóng to của
   một khu. Cùng một hàm vẽ dùng chung cho tất cả: REGIONS đã mang sẵn
   tên mặt ở cột 3 nên chỉ cần lọc, không phải viết thêm hàm nào.
   ===================================================================== */

/* ------------------------------------------------------------------ */
/* BÓNG NGƯỜI                                                          */
/*                                                                     */
/* Chỉ khai NỬA BÊN PHẢI người xem rồi lấy đối xứng qua trục x = 100.  */
/* Gõ tay cả hai nửa thì không đời nào cân, mà lệch vài pixel ở vai hay */
/* hông là nhìn ra ngay. Nửa còn lại dựng bằng cách chạy ngược mảng và  */
/* lật toạ độ x, nên hình luôn đối xứng tuyệt đối.                      */
/*                                                                     */
/* Đường viền đi liền một mạch: đỉnh đầu → má → cổ → vai → mặt ngoài    */
/* tay → bàn tay → mặt trong tay → hõm nách → sườn → eo → hông → mặt    */
/* ngoài chân → bàn chân → mặt trong chân → đáy chậu, rồi lật.          */
/* Khe hở giữa cánh tay và thân là CÓ THẬT chứ không phải lỗi: mặt      */
/* trong tay và sườn là hai đoạn khác nhau của cùng đường viền.         */
/* ------------------------------------------------------------------ */
/**
 * Dựng một hình đối xứng từ nửa bên phải.
 * @param dau    [x, y] điểm bắt đầu, phải nằm trên trục x = 100
 * @param doan   [[x1,y1, x2,y2, x,y]] các đoạn cong bậc ba của nửa phải
 *
 * CẢ HAI ĐẦU phải nằm trên trục x = 100. Nhánh quay về bắt đầu ngay từ điểm
 * cuối; điểm cuối mà lệch khỏi trục thì nó nhảy sang toạ độ đã lật và vẽ ra
 * một cái nêm to bằng nửa hình. Kết thúc lệch trục là hỏng, không phải xấu.
 */
function doiXung(dau, doan) {
    const lat = (x) => 200 - x;
    let d = `M${dau[0]},${dau[1]}`;
    const diem = [dau];
    doan.forEach(s => {
        d += ` C${s[0]},${s[1]} ${s[2]},${s[3]} ${s[4]},${s[5]}`;
        diem.push([s[4], s[5]]);
    });
    // Chạy ngược: điểm điều khiển của đoạn đảo chiều cũng phải đổi chỗ cho nhau
    for (let i = doan.length - 1; i >= 0; i--) {
        const s = doan[i], p = diem[i];
        d += ` C${lat(s[2])},${s[3]} ${lat(s[0])},${s[1]} ${lat(p[0])},${p[1]}`;
    }
    return d + ' Z';
}

const NUA_NGUOI = [
    /* đầu */
    [111, 10, 120, 21, 120, 36],
    [120, 48, 115, 57, 109, 61],
    /* cổ */
    [108, 64, 107, 67, 107, 74],
    /* cơ thang → mỏm vai */
    [116, 77, 128, 81, 136, 86],
    /* cơ delta → mặt ngoài cánh tay */
    [145, 90, 152, 98, 154, 110],
    [156, 124, 158, 138, 159, 152],
    /* khuỷu → mặt ngoài cẳng tay */
    [161, 164, 162, 172, 162, 180],
    [163, 192, 164, 200, 164, 208],
    /* bàn tay */
    [168, 214, 168, 228, 163, 236],
    [157, 243, 149, 241, 147, 233],
    /* mặt trong bàn tay → cổ tay → cẳng tay */
    [145, 226, 146, 216, 147, 208],
    [147, 196, 146, 180, 145, 166],
    /* mặt trong cánh tay → hõm nách */
    [144, 148, 143, 128, 142, 112],
    [141, 102, 140, 94, 138, 90],
    /* lồng ngực → eo */
    [140, 104, 141, 124, 140, 144],
    [139, 154, 133, 160, 130, 168],
    /* cánh chậu → nếp bẹn */
    [133, 178, 136, 188, 136, 198],
    [136, 210, 134, 218, 134, 228],
    /* mặt ngoài đùi → gối */
    [133, 248, 132, 272, 131, 292],
    [130, 300, 130, 308, 130, 316],
    /* bắp chân → cổ chân */
    [131, 336, 130, 360, 130, 380],
    [130, 388, 129, 394, 130, 398],
    /* bàn chân */
    [134, 410, 130, 416, 120, 416],
    [114, 416, 112, 412, 112, 404],
    /* mặt trong cổ chân → bắp chân */
    [112, 396, 113, 388, 113, 378],
    [114, 356, 115, 332, 114, 312],
    /* mặt trong đùi → đáy chậu */
    [113, 292, 112, 262, 110, 238],
    [108, 230, 104, 224, 100, 224]
];

const NGUOI = `<path class="bm-body" d="${doiXung([100, 9], NUA_NGUOI)}"/>`;

/* Đầu – mặt – cổ nhìn thẳng. Ghép bốn mảnh, vẽ từ sau ra trước: hai vai →
   cổ → sọ (vòm rộng, thuôn dần xuống góc hàm và cằm) → hai vành tai. */
const HINH_DAU = `
  <path class="bm-body" d="M10,250 Q14,220 46,212 Q76,205 100,204 Q124,205 154,212 Q186,220 190,250 Z"/>
  <path class="bm-body" d="M74,206 L74,164 Q100,178 126,164 L126,206 Z"/>
  <path class="bm-body" d="M100,14 Q140,14 142,66 Q143,96 136,116 Q128,142 112,162
        Q106,171 100,171 Q94,171 88,162 Q72,142 64,116 Q57,96 58,66 Q60,14 100,14 Z"/>
  <ellipse class="bm-body" cx="58" cy="104" rx="7" ry="13"/>
  <ellipse class="bm-body" cx="142" cy="104" rx="7" ry="13"/>`;

/* Một bàn tay nhìn từ mu: lòng bàn tay, bốn ngón, ngón cái, cổ tay.
   Bàn bên kia phải LẬT chứ không phải dịch ngang: chỉ dịch thì ngón trỏ vẫn
   nằm cạnh mép ngoài, thành ra ngón út vẽ một nơi mà vùng bấm một nẻo (bàn tay
   trái từng lệch nguyên một bàn vì lỗi này). */
const HINH_TAY_1 = (fl) => {
    const X = fl ? (x) => 220 - x : (x) => x;
    const R = (x, y, w, h, r) =>
        `<rect class="bm-body" x="${fl ? 220 - x - w : x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`;
    return `<path class="bm-body" d="M${X(30)},74 Q${X(28)},60 ${X(40)},57 L${X(78)},57
        Q${X(90)},60 ${X(89)},74 L${X(90)},126 Q${X(90)},140 ${X(76)},142
        L${X(42)},142 Q${X(28)},140 ${X(29)},126 Z"/>
      ${R(39, 20, 11, 40, 5.5)}${R(53, 14, 11, 46, 5.5)}${R(67, 20, 11, 40, 5.5)}${R(79, 32, 10, 28, 5)}
      <ellipse class="bm-body" cx="${X(26)}" cy="80" rx="13" ry="8.5"
        transform="rotate(${fl ? 42 : -42} ${X(26)} 80)"/>
      ${R(38, 138, 46, 20, 8)}`;
};
const HINH_TAY = HINH_TAY_1(false) + HINH_TAY_1(true);

/* Một bàn chân nhìn từ mu: năm ngón, mu chân, hai mắt cá, gót */
const HINH_CHAN_1 = (fl) => {
    const X = fl ? (x) => 220 - x : (x) => x;
    const ngon = [[82, 9.5, 11], [71, 7, 9], [61, 6.5, 8.5], [52, 6, 8], [45, 5.5, 7.5]];
    return `<path class="bm-body" d="M${X(34)},46 Q${X(32)},34 ${X(44)},32 L${X(84)},32
        Q${X(94)},36 ${X(92)},50 L${X(95)},108 Q${X(95)},146 ${X(63)},152
        Q${X(31)},146 ${X(31)},108 Z"/>
      ${ngon.map(([cx, rx, ry]) =>
        `<ellipse class="bm-body" cx="${X(cx)}" cy="${40 - ry}" rx="${rx}" ry="${ry}"/>`).join('')}
      <rect class="bm-body" x="${fl ? 148 : 54}" y="148" width="18" height="20" rx="7"/>`;
};
const HINH_CHAN = HINH_CHAN_1(false) + HINH_CHAN_1(true);


/**
 * Khung nhìn: nền + tỉ lệ + tên đọc lên. `khu: true` = bản đồ phóng to
 * của một phần cơ thể (hiện trong dải chọn khu), `false` = cả người.
 */
export const MAT = {
    truoc: { ten: 'Toàn thân — mặt trước', nhan: 'Toàn thân trước', icon: 'fa-person', vb: '0 0 200 430', nen: NGUOI, khu: false },
    sau: { ten: 'Toàn thân — mặt sau', nhan: 'Toàn thân sau', icon: 'fa-person-walking', vb: '0 0 200 430', nen: NGUOI, khu: false },
    'dau-mat': { ten: 'Đầu – mặt – cổ', nhan: 'Đầu – mặt – cổ', icon: 'fa-head-side-mask', vb: '4 6 192 250', nen: HINH_DAU, khu: true },
    'nguc-ct': { ten: 'Thành ngực – ổ nghe tim', nhan: 'Ngực & ổ nghe tim', icon: 'fa-heart-pulse', vb: '50 62 100 100', nen: NGUOI, khu: true },
    'bung-ct': { ten: 'Ổ bụng – điểm đau', nhan: 'Bụng & điểm đau', icon: 'fa-bowl-food', vb: '52 112 96 98', nen: NGUOI, khu: true },
    'ban-tay': { ten: 'Hai bàn tay', nhan: 'Hai bàn tay', icon: 'fa-hand', vb: '0 0 220 166', nen: HINH_TAY, khu: true },
    'ban-chan': { ten: 'Hai bàn chân', nhan: 'Hai bàn chân', icon: 'fa-shoe-prints', vb: '0 0 220 180', nen: HINH_CHAN, khu: true },
    'lung-ct': { ten: 'Lưng – cột sống', nhan: 'Lưng – cột sống', icon: 'fa-bone', vb: '46 40 108 208', nen: NGUOI, khu: true }
};

/** Dải chọn khung nhìn: [id, nhãn ngắn trên chip, icon, có phải khu chi tiết không, tên đầy đủ] */
export const MAT_LIST = Object.entries(MAT).map(([id, v]) => [id, v.nhan || v.ten, v.icon, v.khu, v.ten]);

/** Tên vùng để đọc lên trong bệnh sử — id lạ thì trả về chính id, khỏi mất dữ liệu */
export const regionTen = (id) => BY_ID.get(traId(id))?.[1] || String(id || '');

/** Tâm của một vùng, dùng để bắn tia hướng lan */
export function regionTam(id) {
    const s = BY_ID.get(traId(id))?.[3];
    if (!s) return null;
    return s[0] === 'e' ? [s[1], s[2]] : [s[1] + s[3] / 2, s[2] + s[4] / 2];
}

/** Khung nhìn (toàn thân trước/sau hay một khu) chứa vùng này */
export const regionMat = (id) => BY_ID.get(traId(id))?.[2] || 'truoc';

/** Tên khung nhìn, để dòng liệt kê dấu nói rõ dấu này nằm ở bản đồ nào */
export const matTen = (id) => MAT[id]?.ten || id;

/* Màu theo thang điểm đau — cùng bộ màu với các mức độ khác trong bệnh án */
export function mucDau(d) {
    const n = parseFloat(d);
    if (!isFinite(n) || n <= 0) return 'none';
    if (n <= 3) return 'nhe';
    if (n <= 6) return 'vua';
    return 'nang';
}

function shapeHtml(s, cls, attrs = '', inner = '') {
    const tag = s[0] === 'e' ? 'ellipse' : 'rect';
    const geo = s[0] === 'e'
        ? `cx="${s[1]}" cy="${s[2]}" rx="${s[3]}" ry="${s[4]}"`
        : `x="${s[1]}" y="${s[2]}" width="${s[3]}" height="${s[4]}" rx="3"`;
    return `<${tag} class="${cls}" ${geo} ${attrs}>${inner}</${tag}>`;
}

/**
 * Một khung nhìn của bản đồ.
 * @param mat    khóa trong MAT: 'truoc' | 'sau' | id một khu chi tiết
 * @param vung   [id] vùng đang đau
 * @param lan    [[từ, tới]] hướng lan
 * @param dau    điểm đau 0–10 (quyết định màu)
 * @param keo    id vùng đang giữ để kéo tia (vẽ viền nhấp nháy)
 * @param heat   { id: 'nhe'|'vua'|'nang' } — tô mỗi vùng một mức riêng thay vì
 *               dùng chung một điểm đau. Màn "Toàn cảnh" gom đau của MỌI mốc lên
 *               cùng một hình nên mỗi vùng có mức của riêng nó; chỗ nhập từng mốc
 *               vẫn truyền `dau` như cũ.
 * @param nhan   { id: 'chữ' } — chú thích hiện khi rê chuột, nối sau tên vùng
 * @param marks  [{ z, k, t }] dấu khác ngoài đau: z = vùng, k = loại, t = ghi chú.
 *               Vùng nào có dấu mà không có đau thì tô theo màu của loại đầu tiên;
 *               mọi loại có mặt đều được điểm thêm một chấm nhỏ dưới đáy vùng, nên
 *               một vùng vừa đau vừa có vết thương vẫn đọc ra được cả hai.
 */
export function bodyMapSvg({ mat = 'truoc', vung = [], lan = [], dau = '', keo = '',
    heat = null, nhan = null, marks = null } = {}) {
    const khung = MAT[mat] || MAT.truoc;
    const on = new Set((vung || []).map(traId));
    const muc = mucDau(dau);

    // vùng -> các loại dấu đang có ở đó (giữ thứ tự người dùng đánh vào)
    const theoVung = new Map();
    (marks || []).forEach(d => {
        if (!d?.z || !d?.k) return;
        const z = traId(d.z);
        if (!theoVung.has(z)) theoVung.set(z, []);
        const ds = theoVung.get(z);
        if (!ds.includes(d.k)) ds.push(d.k);
    });

    const items = REGIONS.filter(r => r[2] === mat).map(([id, ten, , s]) => {
        const loai = theoVung.get(id) || [];
        const m = heat?.[id] ?? heat?.[traId(id)] ?? (on.has(id) ? muc : '');
        const cls = ['bm-z',
            m ? 'is-on is-' + m : (loai.length ? 'is-on is-k-' + loai[0] : ''),
            keo === id ? 'is-keo' : ''].filter(Boolean).join(' ');
        const phu = loai.map(k => loaiTen(k)).join(', ');
        const tip = [ten, nhan?.[id], phu].filter(Boolean).join(' — ');
        return shapeHtml(s, cls, `data-z="${id}"`, `<title>${esc(tip)}</title>`);
    }).join('');

    /* Chấm loại dấu: xếp thành hàng ngang dưới đáy vùng. Vẽ SAU mọi ô vùng để
       không bị ô vẽ sau phủ mất, và cho `pointer-events:none` ở CSS để chạm vào
       chấm vẫn tính là chạm vào vùng bên dưới. */
    const cham = [...theoVung.entries()].flatMap(([id, ds]) => {
        if (regionMat(id) !== mat) return [];
        const s = BY_ID.get(id)?.[3];
        const p = regionTam(id);
        if (!s || !p) return [];
        const day = s[0] === 'e' ? s[2] + s[4] : s[2] + s[4];
        const y = Math.min(day - 2, p[1] + 6);
        const x0 = p[0] - (ds.length - 1) * 3;
        return ds.map((k, i) =>
            `<circle class="bm-cham bm-k-${k}" cx="${x0 + i * 6}" cy="${y}" r="2.4"/>`);
    }).join('');

    // Tia hướng lan: chỉ vẽ khi cả hai đầu cùng nằm trên khung nhìn đang xem
    const tia = lan.map(([a, b]) => {
        if (regionMat(a) !== mat || regionMat(b) !== mat) return '';
        const p = regionTam(a), q = regionTam(b);
        if (!p || !q) return '';
        // Cong nhẹ cho dễ nhìn khi hai vùng nằm cùng cột
        const mx = (p[0] + q[0]) / 2 + (q[1] - p[1]) * 0.18;
        const my = (p[1] + q[1]) / 2 - (q[0] - p[0]) * 0.18;
        return `<path class="bm-tia" d="M${p[0]},${p[1]} Q${mx},${my} ${q[0]},${q[1]}"
            marker-end="url(#bm-arrow)"><title>${esc(regionTen(a))} → ${esc(regionTen(b))}</title></path>`;
    }).join('');

    return `<svg class="bm-svg" viewBox="${khung.vb}" role="img"
        aria-label="Bản đồ cơ thể — ${esc(khung.ten)}">
        <defs>
            <marker id="bm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" class="bm-arrowhead"/>
            </marker>
        </defs>
        ${khung.nen}
        ${items}
        ${cham}
        ${tia}
    </svg>`;
}

/** "đau ở hố chậu phải" · "đau sau xương ức, lan lên góc hàm trái và mặt trong cánh tay trái" */
const noiTen = (xs) => xs.length < 2 ? (xs[0] || '')
    : xs.slice(0, -1).join(', ') + ' và ' + xs.at(-1);

/**
 * Câu văn cho các dấu KHÁC đau, gom theo loại:
 *   "vết thương ở ngực phải (rách 3 cm); ban da ở hai cẳng chân"
 * Dấu nào có ghi chú thì chép nguyên ghi chú vào ngoặc — đó là chỗ sinh viên tả
 * chi tiết, không được nuốt mất.
 */
export function dauHieuProse(dh = []) {
    const MO_DAU = {
        ct: 'thương tích', da: 'dấu da – niêm', phu: 'phù',
        khoi: 'sờ được khối', seo: 'sẹo mổ – dẫn lưu'
    };
    const nhom = new Map();
    dh.filter(d => d?.z && d?.k && d.k !== 'dau').forEach(d => {
        if (!nhom.has(d.k)) nhom.set(d.k, []);
        const t = String(d.t || '').trim();
        nhom.get(d.k).push(regionTen(d.z) + (t ? ` (${t})` : ''));
    });
    return [...nhom.entries()]
        .map(([k, xs]) => `${MO_DAU[k] || loaiTen(k)} ở ${noiTen(xs)}`)
        .join('; ');
}

export function vungProse(vung = [], lan = [], dh = []) {
    const oVung = vung.filter(Boolean).map(regionTen);
    const tia = lan.filter(x => x?.[0] && x?.[1]);
    const cau = [];
    if (oVung.length) cau.push('đau ở ' + noiTen(oVung));
    // Tia xuất phát từ vùng đã kể rồi thì chỉ cần nói lan tới đâu
    const daKe = new Set(vung);
    const nhom = new Map();
    tia.forEach(([a, b]) => {
        const key = daKe.has(a) ? '' : regionTen(a);
        if (!nhom.has(key)) nhom.set(key, []);
        nhom.get(key).push(regionTen(b));
    });
    nhom.forEach((toi, tu) => {
        cau.push((tu ? `đau ở ${tu}, ` : '') + 'lan tới ' + noiTen(toi));
    });
    const khac = dauHieuProse(dh);
    if (khac) cau.push(khac);
    return cau.join(', ');
}
