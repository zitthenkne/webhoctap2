/* =====================================================================
   bien-luan-phanbiet.js — BA NGUỒN DỮ LIỆU MỚI CHO MỤC X

   bien-luan-data.js đã có thư viện theo HỘI CHỨNG (nguyên nhân nên nghĩ,
   cần loại trừ, cận lâm sàng phân định, dấu hiệu then chốt, tiêu chuẩn,
   biến chứng, yếu tố nguy cơ). Còn thiếu ba lớp mà lúc biện luận mới cần:

   1. PHAN_BIET  — đặc điểm phân biệt của TỪNG NGUYÊN NHÂN, kèm dấu:
                   '+' có thì nghĩ nhiều hơn · '-' có thì bớt nghĩ đi.
                   HALLMARKS cũ chỉ có mức hội chứng nên không trả lời được
                   câu "viêm phổi khác lao phổi ở chỗ nào".
   2. DK         — điều kiện dịch tễ của bệnh (tuổi, giới). Nữ 25 tuổi đau
                   hố chậu phải thì thai ngoài tử cung phải nhảy lên đầu,
                   nam 70 tuổi hút thuốc ho ra máu thì ung thư phổi lên trước.
   3. Cầu nối SYMPTOMS — trieu-chung-data.js đã có sẵn `pertinentNegatives`
                   (câu âm tính KÈM nó loại trừ bệnh gì) và `redFlags` cho
                   từng triệu chứng, trước nay chỉ am-tinh.js dùng. Nối sang
                   mục X là có thêm hàng trăm gợi ý mà không viết thêm dữ liệu.

   Không có ô lưu trữ nào ở đây — chỉ là bảng tra.
   ===================================================================== */

import { findSymptom } from './trieu-chung-data.js';
import { fold } from './tim-kiem.js';

const trim = (x) => String(x ?? '').trim();

/* =====================================================================
   1. ĐẶC ĐIỂM PHÂN BIỆT THEO TỪNG NGUYÊN NHÂN
   [regex tên bệnh, [[đặc điểm, '+' | '-', trọng số 1–3]]]
   Trọng số 3 = gần như quyết định · 2 = mạnh · 1 = có thì tốt.
   ===================================================================== */
export const PHAN_BIET = [
    /* ---------------- Hô hấp ---------------- */
    [/vi[êe]m ph[ổo]i/i, [
        ['Sốt cao đột ngột kèm lạnh run', '+', 2],
        ['Ho khạc đàm mủ vàng xanh', '+', 3],
        ['Đau ngực kiểu màng phổi bên tổn thương', '+', 2],
        ['Hội chứng đông đặc khu trú một vùng', '+', 3],
        ['Bạch cầu tăng ưu thế neutrophil', '+', 2],
        ['Diễn tiến kéo dài trên 3 tuần', '-', 2],
        ['Sụt cân nhiều tháng', '-', 2]
    ]],
    [/lao ph[ổo]i/i, [
        ['Ho kéo dài trên 2 tuần', '+', 3],
        ['Sốt nhẹ về chiều', '+', 3],
        ['Đổ mồ hôi trộm ban đêm', '+', 3],
        ['Sụt cân – chán ăn nhiều tuần', '+', 2],
        ['Ho ra máu lượng ít tái đi tái lại', '+', 2],
        ['Tiếp xúc nguồn lao trong nhà', '+', 2],
        ['Tổn thương đỉnh phổi trên X-quang', '+', 3],
        ['Khởi phát rầm rộ trong vài giờ', '-', 3]
    ]],
    [/[đd][ợo]t c[ấa]p copd|copd/i, [
        ['Tiền căn hút thuốc lá nhiều gói-năm', '+', 3],
        ['Khó thở gắng sức tăng dần nhiều năm', '+', 3],
        ['Ho khạc đàm mạn tính', '+', 2],
        ['Lồng ngực hình thùng, gõ vang', '+', 2],
        ['Ran rít ran ngáy lan tỏa hai phế trường', '+', 2],
        ['Thì thở ra kéo dài', '+', 2],
        ['Người trẻ chưa từng hút thuốc', '-', 3]
    ]],
    [/hen ph[ếe] qu[ảa]n|^hen/i, [
        ['Khó thở thành cơn, tự hết hoặc hết khi xịt thuốc', '+', 3],
        ['Khởi phát từ nhỏ, có cơ địa dị ứng', '+', 2],
        ['Cơn về đêm và gần sáng', '+', 2],
        ['Giữa các cơn hoàn toàn bình thường', '+', 3],
        ['Ran rít lan tỏa hai bên', '+', 2],
        ['Khó thở liên tục không dao động', '-', 2]
    ]],
    [/thuy[êe]n t[ắa]c ph[ổo]i|thuy[êe]n t[ắa]c [đd][ộo]ng m[ạa]ch ph[ổo]i/i, [
        ['Khó thở khởi phát đột ngột', '+', 3],
        ['Đau ngực kiểu màng phổi', '+', 2],
        ['Nhịp tim nhanh không tương xứng', '+', 2],
        ['Bất động kéo dài, sau mổ, sau sinh', '+', 3],
        ['Sưng đau bắp chân một bên', '+', 3],
        ['Phổi nghe trong dù khó thở nhiều', '+', 2],
        ['Đang dùng thuốc ngừa thai', '+', 2],
        ['Ran nổ khu trú kèm đông đặc rõ', '-', 2]
    ]],
    [/tr[àa]n kh[íi] m[àa]ng ph[ổo]i/i, [
        ['Đau ngực dữ dội đột ngột kèm khó thở', '+', 3],
        ['Gõ vang một bên', '+', 3],
        ['Rì rào phế nang mất một bên', '+', 3],
        ['Rung thanh giảm cùng bên', '+', 2],
        ['Khí quản lệch sang bên đối diện', '+', 3],
        ['Nam trẻ cao gầy', '+', 1]
    ]],
    [/tr[àa]n d[ịi]ch m[àa]ng ph[ổo]i/i, [
        ['Gõ đục vùng thấp', '+', 3],
        ['Rì rào phế nang giảm vùng thấp', '+', 3],
        ['Rung thanh giảm', '+', 2],
        ['Đường cong Damoiseau', '+', 2],
        ['Khó thở tăng khi nằm nghiêng về bên lành', '+', 1],
        ['Gõ vang', '-', 3]
    ]],
    [/ung th[ưu] ph[ổo]i/i, [
        ['Trên 50 tuổi, hút thuốc lá lâu năm', '+', 3],
        ['Ho ra máu tái phát', '+', 2],
        ['Sụt cân nhanh không giải thích được', '+', 3],
        ['Khàn tiếng kéo dài', '+', 2],
        ['Hạch thượng đòn', '+', 3],
        ['Ngón tay dùi trống', '+', 1],
        ['Đáp ứng nhanh với kháng sinh', '-', 2]
    ]],
    [/ph[ùu] ph[ổo]i c[ấa]p/i, [
        ['Khó thở dữ dội phải ngồi dậy', '+', 3],
        ['Khạc bọt hồng', '+', 3],
        ['Ran ẩm dâng từ đáy lên hai bên', '+', 3],
        ['Vã mồ hôi, da lạnh ẩm', '+', 2],
        ['Tiền căn suy tim hoặc bệnh van tim', '+', 2]
    ]],

    /* ---------------- Tim mạch ---------------- */
    [/v[àa]nh c[ấa]p|nh[ồo]i m[áa]u c[ơo] tim|[đd]au th[ắa]t ng[ựu]c/i, [
        ['Đau sau xương ức kiểu đè nặng', '+', 3],
        ['Lan lên hàm, vai hoặc mặt trong tay trái', '+', 3],
        ['Kéo dài trên 20 phút, không giảm khi nghỉ', '+', 3],
        ['Vã mồ hôi, cảm giác sắp chết', '+', 2],
        ['Có yếu tố nguy cơ mạch vành', '+', 2],
        ['Troponin tăng động học', '+', 3],
        ['Đau tăng khi ấn thành ngực', '-', 3],
        ['Đau thay đổi theo tư thế và hô hấp', '-', 2]
    ]],
    [/b[óo]c t[áa]ch [đd][ộo]ng m[ạa]ch ch[ủu]/i, [
        ['Đau ngực xé dữ dội ngay từ đầu', '+', 3],
        ['Lan ra sau lưng, xuống bụng', '+', 3],
        ['Chênh lệch huyết áp hai tay', '+', 3],
        ['Mạch bẹn yếu hoặc mất một bên', '+', 3],
        ['Tăng huyết áp không kiểm soát', '+', 2],
        ['Trung thất rộng trên X-quang', '+', 2],
        ['Đau tăng dần trong nhiều giờ', '-', 2]
    ]],
    [/vi[êe]m m[àa]ng ngo[àa]i tim/i, [
        ['Đau ngực giảm khi ngồi cúi ra trước', '+', 3],
        ['Đau tăng khi nằm ngửa và hít sâu', '+', 3],
        ['Tiếng cọ màng ngoài tim', '+', 3],
        ['ST chênh lên lan tỏa, PR chênh xuống', '+', 3],
        ['Sau nhiễm siêu vi vài ngày', '+', 2],
        ['Đau lan xuống tay trái kiểu đè nặng', '-', 1]
    ]],
    [/suy tim/i, [
        ['Khó thở khi gắng sức tăng dần', '+', 2],
        ['Khó thở khi nằm, phải kê cao gối', '+', 3],
        ['Cơn khó thở kịch phát về đêm', '+', 3],
        ['Phù chân hai bên, ấn lõm', '+', 2],
        ['Tĩnh mạch cổ nổi', '+', 3],
        ['Gan to, phản hồi gan – tĩnh mạch cổ dương', '+', 3],
        ['Ran ẩm hai đáy phổi', '+', 2],
        ['Tim to trên X-quang ngực', '+', 2],
        ['NT-proBNP tăng', '+', 3],
        ['Phù một bên chân', '-', 2]
    ]],
    [/rung nh[ĩi]/i, [
        ['Hồi hộp không đều', '+', 2],
        ['Mạch loạn nhịp hoàn toàn', '+', 3],
        ['Mạch quay hụt so với nhịp tim', '+', 3],
        ['Mất sóng P, RR không đều trên ECG', '+', 3]
    ]],
    [/t[ăa]ng huy[ếe]t [áa]p/i, [
        ['Huyết áp đo nhiều lần đều cao', '+', 3],
        ['Đau đầu vùng chẩm buổi sáng', '+', 1],
        ['Dày thất trái trên ECG hoặc siêu âm tim', '+', 2],
        ['Tổn thương đáy mắt do tăng huyết áp', '+', 2]
    ]],
    [/huy[ếe]t kh[ốo]i t[ĩi]nh m[ạa]ch s[âa]u|dvt/i, [
        ['Sưng đau bắp chân một bên', '+', 3],
        ['Chênh lệch chu vi hai bắp chân trên 3 cm', '+', 3],
        ['Ấn đau dọc đường tĩnh mạch', '+', 2],
        ['Bất động kéo dài hoặc sau mổ', '+', 2],
        ['Phù hai chân cân đối', '-', 3]
    ]],

    /* ---------------- Tiêu hóa – gan mật ---------------- */
    [/vi[êe]m ru[ộo]t th[ừu]a/i, [
        ['Đau khởi phát quanh rốn rồi chuyển xuống hố chậu phải', '+', 3],
        ['Chán ăn', '+', 2],
        ['Buồn nôn, nôn sau khi đau', '+', 2],
        ['Ấn đau điểm McBurney', '+', 3],
        ['Phản ứng dội hố chậu phải', '+', 3],
        ['Sốt nhẹ 37,5–38,5°C', '+', 2],
        ['Bạch cầu tăng ưu thế neutrophil', '+', 2],
        ['Nôn xuất hiện trước khi đau', '-', 2],
        ['Tiêu chảy nhiều lần phân nước', '-', 2]
    ]],
    [/th[ủu]ng t[ạa]ng r[ỗo]ng|th[ủu]ng d[ạa] d[àa]y/i, [
        ['Đau bụng dữ dội đột ngột như dao đâm', '+', 3],
        ['Bụng cứng như gỗ', '+', 3],
        ['Mất vùng đục trước gan', '+', 3],
        ['Liềm hơi dưới hoành trên X-quang bụng đứng', '+', 3],
        ['Tiền căn loét dạ dày tá tràng', '+', 2],
        ['Đau tăng dần trong nhiều giờ', '-', 2]
    ]],
    [/t[ắa]c ru[ộo]t/i, [
        ['Đau bụng từng cơn quặn', '+', 3],
        ['Nôn ói nhiều, nôn ra dịch mật hoặc dịch phân', '+', 3],
        ['Bí trung đại tiện', '+', 3],
        ['Bụng chướng, quai ruột nổi', '+', 3],
        ['Dấu rắn bò', '+', 3],
        ['Tiền căn mổ bụng cũ', '+', 2],
        ['Mực nước hơi trên X-quang bụng đứng', '+', 3],
        ['Vẫn trung tiện bình thường', '-', 3]
    ]],
    [/vi[êe]m t[ụu]y c[ấa]p/i, [
        ['Đau thượng vị dữ dội lan ra sau lưng', '+', 3],
        ['Đau giảm khi cúi người ra trước', '+', 2],
        ['Nôn nhiều không đỡ đau', '+', 2],
        ['Amylase hoặc lipase tăng trên 3 lần', '+', 3],
        ['Sau bữa rượu hoặc bữa ăn nhiều mỡ', '+', 2],
        ['Tiền căn sỏi mật', '+', 2]
    ]],
    [/vi[êe]m t[úu]i m[ậa]t|s[ỏo]i m[ậa]t/i, [
        ['Đau hạ sườn phải sau bữa ăn nhiều mỡ', '+', 3],
        ['Đau lan lên vai phải', '+', 2],
        ['Dấu Murphy dương', '+', 3],
        ['Sốt kèm lạnh run', '+', 2],
        ['Túi mật to sờ được', '+', 2],
        ['Đau thượng vị lan sau lưng', '-', 1]
    ]],
    [/vi[êe]m [đd][ườơ]{1,2}ng m[ậa]t/i, [
        ['Tam chứng Charcot: đau – sốt lạnh run – vàng da', '+', 3],
        ['Vàng da tăng dần kèm tiểu sậm', '+', 3],
        ['Bilirubin trực tiếp tăng ưu thế', '+', 3],
        ['Giãn đường mật trên siêu âm', '+', 3],
        ['Rối loạn tri giác và tụt huyết áp (ngũ chứng Reynolds)', '+', 2]
    ]],
    [/x[ơo] gan/i, [
        ['Tiền căn viêm gan B, C hoặc nghiện rượu', '+', 3],
        ['Sao mạch, lòng bàn tay son', '+', 3],
        ['Bụng báng, tuần hoàn bàng hệ', '+', 3],
        ['Lách to', '+', 2],
        ['Albumin giảm, INR kéo dài', '+', 3],
        ['Gan bờ sắc, mật độ chắc', '+', 2],
        ['Khởi phát cấp trong vài ngày', '-', 2]
    ]],
    [/vi[êe]m gan si[êe]u vi|vi[êe]m gan c[ấa]p/i, [
        ['Mệt mỏi, chán ăn, sợ mỡ trước khi vàng da', '+', 3],
        ['Vàng da vàng mắt kèm tiểu sậm', '+', 2],
        ['AST – ALT tăng trên 10 lần', '+', 3],
        ['Gan to mềm, ấn tức', '+', 2],
        ['Bụng báng và tuần hoàn bàng hệ', '-', 2]
    ]],
    [/xu[ấa]t huy[ếe]t ti[êe]u h[óo]a tr[êe]n|xhth tr[êe]n/i, [
        ['Nôn ra máu đỏ hoặc bã cà phê', '+', 3],
        ['Đi cầu phân đen như hắc ín', '+', 3],
        ['Tiền căn loét dạ dày hoặc dùng NSAID', '+', 2],
        ['Ure máu tăng không tương xứng creatinin', '+', 2],
        ['Máu đỏ tươi theo phân, không nôn máu', '-', 2]
    ]],
    [/xu[ấa]t huy[ếe]t ti[êe]u h[óo]a d[ướơ]{1,2}i|xhth d[ướơ]{1,2}i/i, [
        ['Đi cầu ra máu đỏ tươi', '+', 3],
        ['Máu bao ngoài phân hoặc nhỏ giọt sau phân', '+', 2],
        ['Thay đổi thói quen đi cầu ở người trên 50 tuổi', '+', 2],
        ['Nôn ra máu', '-', 3]
    ]],
    [/lo[éeẻ]t d[ạa] d[àa]y|lo[éeẻ]t t[áa] tr[àa]ng/i, [
        ['Đau thượng vị có chu kỳ theo bữa ăn', '+', 3],
        ['Đau về đêm làm thức giấc', '+', 2],
        ['Giảm khi ăn hoặc uống thuốc băng dạ dày', '+', 3],
        ['Dùng NSAID hoặc corticoid kéo dài', '+', 2],
        ['Sụt cân nhanh, nuốt nghẹn', '-', 2]
    ]],

    /* ---------------- Thận – tiết niệu ---------------- */
    [/h[ộo]i ch[ứu]ng th[ậa]n h[ưu]/i, [
        ['Phù toàn thân, phù mềm ấn lõm, nặng mặt buổi sáng', '+', 3],
        ['Đạm niệu trên 3,5 g trong 24 giờ', '+', 3],
        ['Albumin máu dưới 30 g/L', '+', 3],
        ['Tăng lipid máu', '+', 2],
        ['Nước tiểu có bọt', '+', 2],
        ['Tiểu máu đại thể kèm tăng huyết áp', '-', 2]
    ]],
    [/vi[êe]m c[ầa]u th[ậa]n c[ấa]p/i, [
        ['Phù mi mắt buổi sáng', '+', 2],
        ['Tiểu ít, nước tiểu màu xá xị', '+', 3],
        ['Tăng huyết áp', '+', 3],
        ['Hồng cầu biến dạng và trụ hồng cầu trong nước tiểu', '+', 3],
        ['Sau viêm họng hoặc nhiễm trùng da 1–3 tuần', '+', 3]
    ]],
    [/suy th[ậa]n c[ấa]p|t[ổo]n th[ươư]{1,2}ng th[ậa]n c[ấa]p/i, [
        ['Creatinin tăng nhanh trong vài ngày', '+', 3],
        ['Tiểu ít dưới 400 mL trong 24 giờ', '+', 2],
        ['Có nguyên nhân cấp: mất nước, sốc, thuốc độc thận', '+', 3],
        ['Thận kích thước bình thường trên siêu âm', '+', 2],
        ['Thiếu máu mạn và thận teo nhỏ', '-', 3]
    ]],
    [/suy th[ậa]n m[ạa]n|b[ệe]nh th[ậa]n m[ạa]n/i, [
        ['Thiếu máu đẳng sắc kéo dài', '+', 3],
        ['Hai thận teo nhỏ, mất phân biệt tủy vỏ', '+', 3],
        ['Tăng huyết áp lâu năm hoặc đái tháo đường', '+', 2],
        ['Ngứa, da xạm, chuột rút về đêm', '+', 2],
        ['Creatinin tăng đã nhiều tháng', '+', 3]
    ]],
    [/nhi[ễe]m tr[ùu]ng ti[ểe]u|vi[êe]m b[àa]ng quang|vi[êe]m [đd][àa]i b[ểe] th[ậa]n/i, [
        ['Tiểu buốt, tiểu gắt, tiểu lắt nhắt', '+', 3],
        ['Nước tiểu đục có mùi hôi', '+', 2],
        ['Đau hông lưng, rung thận đau', '+', 3],
        ['Sốt cao lạnh run', '+', 2],
        ['Bạch cầu và nitrite dương trong nước tiểu', '+', 3]
    ]],
    [/s[ỏo]i ni[ệe]u qu[ảa]n|c[ơo]n [đd]au qu[ặa]n th[ậa]n/i, [
        ['Đau quặn từng cơn vùng hông lưng', '+', 3],
        ['Lan xuống bẹn và cơ quan sinh dục', '+', 3],
        ['Bứt rứt không tìm được tư thế giảm đau', '+', 2],
        ['Tiểu máu vi thể hoặc đại thể', '+', 2],
        ['Bụng mềm dù đau dữ dội', '+', 2],
        ['Nằm im một chỗ vì đau tăng khi cử động', '-', 2]
    ]],

    /* ---------------- Nội tiết – chuyển hóa ---------------- */
    [/nhi[ễe]m ceton|toan ceton|dka/i, [
        ['Khát nhiều, tiểu nhiều, sụt cân nhanh', '+', 3],
        ['Thở nhanh sâu kiểu Kussmaul', '+', 3],
        ['Hơi thở mùi trái cây', '+', 3],
        ['Đường huyết trên 250 mg/dL kèm ceton niệu', '+', 3],
        ['Toan chuyển hóa khoảng trống anion tăng', '+', 3],
        ['Đường huyết rất cao nhưng không toan', '-', 2]
    ]],
    [/c[ườơ]{1,2}ng gi[áa]p|basedow/i, [
        ['Sụt cân dù ăn nhiều', '+', 3],
        ['Hồi hộp, run tay, sợ nóng, ra mồ hôi nhiều', '+', 3],
        ['Bướu giáp lan tỏa có âm thổi', '+', 3],
        ['Lồi mắt', '+', 3],
        ['TSH giảm, FT4 tăng', '+', 3],
        ['Sợ lạnh, chậm chạp, tăng cân', '-', 3]
    ]],
    [/suy gi[áa]p/i, [
        ['Sợ lạnh, chậm chạp, ngủ nhiều', '+', 3],
        ['Tăng cân dù ăn ít', '+', 2],
        ['Da khô, rụng tóc, phù niêm', '+', 3],
        ['Táo bón kéo dài', '+', 2],
        ['TSH tăng, FT4 giảm', '+', 3]
    ]],

    /* ---------------- Huyết học ---------------- */
    [/thi[ếe]u s[ắa]t/i, [
        ['Móng tay khô dễ gãy, lõm hình thìa', '+', 3],
        ['Có nguồn mất máu mạn: rong kinh, trĩ, loét', '+', 3],
        ['Hồng cầu nhỏ nhược sắc', '+', 3],
        ['Ferritin giảm', '+', 3],
        ['Thèm ăn đồ lạ', '+', 2],
        ['Vàng da và lách to', '-', 2]
    ]],
    [/thalassemia/i, [
        ['Thiếu máu từ nhỏ, gia đình có người tương tự', '+', 3],
        ['Vàng da nhẹ kéo dài', '+', 2],
        ['Lách to', '+', 3],
        ['Bộ mặt thalassemia, biến dạng xương sọ', '+', 3],
        ['Hồng cầu nhỏ nhược sắc nhưng ferritin bình thường hoặc tăng', '+', 3],
        ['Khởi phát ở người lớn tuổi mới đây', '-', 2]
    ]],
    [/tan m[áa]u|t[áa]n huy[ếe]t/i, [
        ['Vàng da kèm nước tiểu sậm nhưng phân vẫn vàng', '+', 3],
        ['Lách to', '+', 2],
        ['Hồng cầu lưới tăng', '+', 3],
        ['LDH tăng, haptoglobin giảm', '+', 3],
        ['Bilirubin gián tiếp tăng ưu thế', '+', 3]
    ]],
    [/b[ạa]ch c[ầa]u c[ấa]p/i, [
        ['Sốt kéo dài kèm nhiễm trùng tái đi tái lại', '+', 2],
        ['Xuất huyết da niêm tự nhiên', '+', 3],
        ['Thiếu máu tiến triển nhanh', '+', 2],
        ['Gan lách hạch to', '+', 3],
        ['Đau xương', '+', 2],
        ['Giảm ba dòng hoặc có tế bào non trên phết máu', '+', 3]
    ]],

    /* ---------------- Nhiễm ---------------- */
    [/s[ốo]t xu[ấa]t huy[ếe]t|dengue/i, [
        ['Sốt cao đột ngột liên tục 2–7 ngày', '+', 3],
        ['Nhức đầu, đau sau hố mắt, đau cơ khớp', '+', 3],
        ['Chấm xuất huyết dưới da, dấu dây thắt dương', '+', 3],
        ['Bạch cầu giảm, tiểu cầu giảm, Hct tăng', '+', 3],
        ['Đang mùa dịch, xung quanh có người mắc', '+', 2],
        ['Ho khạc đàm mủ', '-', 2]
    ]],
    [/s[ốo]t r[ée]t/i, [
        ['Cơn sốt có chu kỳ rét run – nóng – vã mồ hôi', '+', 3],
        ['Đi vùng dịch tễ sốt rét trong 1 tháng', '+', 3],
        ['Lách to', '+', 2],
        ['Thiếu máu kèm vàng da nhẹ', '+', 2],
        ['Ký sinh trùng sốt rét trong máu', '+', 3]
    ]],
    [/th[ươư]{1,2}ng h[àa]n/i, [
        ['Sốt tăng dần theo bậc thang', '+', 3],
        ['Mạch nhiệt phân ly', '+', 3],
        ['Lưỡi dơ, bụng chướng, óc ách hố chậu phải', '+', 2],
        ['Hồng ban trên bụng', '+', 2],
        ['Tiêu chảy phân lỏng vàng như nước dưa', '+', 2]
    ]],
    [/nhi[ễe]m tr[ùu]ng huy[ếe]t|sepsis|s[ốo]c nhi[ễe]m tr[ùu]ng/i, [
        ['Sốt cao lạnh run hoặc hạ thân nhiệt', '+', 2],
        ['Mạch nhanh, huyết áp tụt', '+', 3],
        ['Rối loạn tri giác mới xuất hiện', '+', 3],
        ['Thở nhanh trên 22 lần mỗi phút', '+', 2],
        ['Lactat máu tăng', '+', 3],
        ['Tiểu ít, chi lạnh, nổi bông', '+', 3],
        ['Có ổ nhiễm trùng rõ', '+', 2]
    ]],
    [/vi[êe]m m[àa]ng n[ãa]o/i, [
        ['Sốt kèm đau đầu dữ dội', '+', 3],
        ['Nôn vọt không liên quan bữa ăn', '+', 3],
        ['Cổ cứng, Kernig hoặc Brudzinski dương', '+', 3],
        ['Sợ ánh sáng', '+', 2],
        ['Rối loạn tri giác', '+', 2],
        ['Tử ban trên da', '+', 3]
    ]],

    /* ---------------- Thần kinh ---------------- */
    [/nh[ồo]i m[áa]u n[ãa]o|[đd][ộo]t qu[ỵy] thi[ếe]u m[áa]u/i, [
        ['Khởi phát đột ngột, đạt đỉnh ngay từ đầu', '+', 3],
        ['Yếu nửa người kèm méo miệng cùng bên', '+', 3],
        ['Nói khó hoặc thất ngôn', '+', 2],
        ['Tiền căn rung nhĩ, tăng huyết áp, đái tháo đường', '+', 2],
        ['Tri giác thường còn tỉnh lúc đầu', '+', 2],
        ['Đau đầu dữ dội kèm nôn vọt ngay từ đầu', '-', 2]
    ]],
    [/xu[ấa]t huy[ếe]t n[ãa]o/i, [
        ['Đau đầu dữ dội ngay lúc khởi phát', '+', 3],
        ['Nôn vọt sớm', '+', 3],
        ['Rối loạn tri giác nhanh', '+', 3],
        ['Huyết áp rất cao lúc nhập viện', '+', 3],
        ['Đang dùng thuốc kháng đông', '+', 2],
        ['Cổ cứng', '+', 2]
    ]],
    [/[đd][ộo]ng kinh|co gi[ậa]t/i, [
        ['Cơn rập khuôn, lặp lại giống nhau', '+', 3],
        ['Cắn lưỡi, tiêu tiểu không tự chủ', '+', 3],
        ['Lú lẫn sau cơn rồi hồi phục dần', '+', 3],
        ['Mất ý thức đột ngột không báo trước', '+', 2],
        ['Hồi phục tức thì, tỉnh táo hoàn toàn ngay', '-', 2]
    ]],
    [/migraine|[đd]au n[ửu]a [đd][ầa]u/i, [
        ['Đau nửa đầu kiểu mạch đập', '+', 3],
        ['Kèm buồn nôn, sợ ánh sáng, sợ tiếng động', '+', 3],
        ['Có tiền triệu thị giác', '+', 3],
        ['Từng cơn tái phát nhiều năm, giữa các cơn bình thường', '+', 3],
        ['Sốt và cổ cứng', '-', 3]
    ]],
    [/ch[óo]ng m[ặa]t|ti[ềe]n [đd][ìi]nh/i, [
        ['Cảm giác xoay tròn khi thay đổi tư thế đầu', '+', 3],
        ['Kèm buồn nôn, nôn', '+', 2],
        ['Rung giật nhãn cầu', '+', 3],
        ['Không có dấu thần kinh khu trú', '+', 2],
        ['Yếu nửa người kèm theo', '-', 3]
    ]],

    /* ---------------- Cơ xương khớp – tự miễn ---------------- */
    [/gout|g[úu]t/i, [
        ['Sưng đau đột ngột một khớp trong đêm', '+', 3],
        ['Khớp bàn ngón chân cái', '+', 3],
        ['Da trên khớp đỏ bóng, đau dữ dội không dám chạm', '+', 3],
        ['Nam giới, uống bia rượu', '+', 2],
        ['Acid uric máu tăng', '+', 2],
        ['Hạt tophi', '+', 3],
        ['Viêm nhiều khớp nhỏ đối xứng hai bên', '-', 3]
    ]],
    [/vi[êe]m kh[ớo]p d[ạa]ng th[ấa]p/i, [
        ['Viêm nhiều khớp nhỏ đối xứng hai bên', '+', 3],
        ['Cứng khớp buổi sáng trên 1 giờ', '+', 3],
        ['Kéo dài trên 6 tuần', '+', 3],
        ['RF hoặc anti-CCP dương', '+', 3],
        ['Biến dạng bàn tay kiểu cổ thiên nga', '+', 2],
        ['Chỉ một khớp lớn, khởi phát trong đêm', '-', 2]
    ]],
    [/lupus/i, [
        ['Nữ trẻ trong độ tuổi sinh đẻ', '+', 2],
        ['Ban cánh bướm ở mặt', '+', 3],
        ['Nhạy cảm ánh sáng', '+', 2],
        ['Loét miệng không đau', '+', 2],
        ['Đau nhiều khớp không biến dạng', '+', 2],
        ['ANA và anti-dsDNA dương', '+', 3],
        ['Đạm niệu kèm suy thận', '+', 2]
    ]],
    [/vi[êe]m kh[ớo]p nhi[ễe]m tr[ùu]ng/i, [
        ['Một khớp sưng nóng đỏ đau kèm sốt cao', '+', 3],
        ['Hạn chế vận động khớp hoàn toàn', '+', 3],
        ['Dịch khớp đục, bạch cầu rất cao', '+', 3],
        ['Có đường vào: tiêm khớp, vết thương', '+', 2]
    ]],

    /* ---------------- Sản phụ khoa ---------------- */
    [/thai ngo[àa]i t[ửu] cung/i, [
        ['Trễ kinh kèm đau bụng dưới một bên', '+', 3],
        ['Ra huyết âm đạo ít, sậm màu', '+', 3],
        ['Beta-hCG dương nhưng không thấy túi thai trong buồng', '+', 3],
        ['Đau vai do máu kích thích hoành', '+', 3],
        ['Choáng váng, tụt huyết áp', '+', 3],
        ['Kinh nguyệt vẫn đều đặn bình thường', '-', 3]
    ]],
    [/ti[ềe]n s[ảa]n gi[ậa]t/i, [
        ['Thai trên 20 tuần', '+', 3],
        ['Huyết áp từ 140/90 mmHg trở lên', '+', 3],
        ['Đạm niệu dương', '+', 3],
        ['Phù mặt và tay', '+', 2],
        ['Đau đầu, nhìn mờ, đau thượng vị', '+', 3]
    ]],

    /* ---------------- Ngoại – da ---------------- */
    [/vi[êe]m m[ôo] t[ếe] b[àa]o|[áa]p x[ee] ph[ầa]n m[ềe]m/i, [
        ['Vùng da sưng nóng đỏ đau ranh giới không rõ', '+', 3],
        ['Sốt kèm lạnh run', '+', 2],
        ['Có cửa ngõ vào: vết thương, nấm kẽ chân', '+', 2],
        ['Hạch vùng dẫn lưu sưng đau', '+', 2],
        ['Có ổ dịch, ấn lùng nhùng (áp xe)', '+', 3]
    ]],
    [/tho[áa]t v[ịi] [đd][ĩi]a [đd][ệe]m/i, [
        ['Đau lưng lan xuống chân theo đường rễ thần kinh', '+', 3],
        ['Đau tăng khi ho, hắt hơi, rặn', '+', 3],
        ['Dấu Lasègue dương', '+', 3],
        ['Tê hoặc yếu theo khoanh da chi phối', '+', 2],
        ['Bí tiểu và mất cảm giác vùng yên ngựa', '+', 3]
    ]]
];

/** Đặc điểm phân biệt của một nguyên nhân → [{t, huong:'+'|'-', w}] */
export function phanBietFor(ten) {
    const t = trim(ten);
    if (!t) return [];
    const hit = PHAN_BIET.find(([re]) => re.test(t));
    return hit ? hit[1].map(([x, huong, w]) => ({ t: x, huong, w })) : [];
}

/* =====================================================================
   2. ĐIỀU KIỆN DỊCH TỄ — TUỔI / GIỚI
   [regex, { tuoi:[min,max], gioi:'nu'|'nam', vi:'nói vì sao' }]
   Chỉ khai những bệnh mà tuổi / giới thật sự đổi thứ tự nghĩ.
   ===================================================================== */
export const DK = [
    [/thai ngo[àa]i t[ửu] cung|d[ọo]a s[ẩa]y|s[ẩa]y thai|ti[ềe]n s[ảa]n gi[ậa]t|vi[êe]m ph[ầa]n ph[ụu]|u nang bu[ồo]ng tr[ứu]ng xo[ắa]n/i,
        { gioi: 'nu', tuoi: [12, 50], vi: 'chỉ gặp ở nữ trong tuổi sinh đẻ' }],
    [/ung th[ưu] c[ổo] t[ửu] cung|ung th[ưu] v[úu]|ung th[ưu] bu[ồo]ng tr[ứu]ng|ung th[ưu] n[ộo]i m[ạa]c/i,
        { gioi: 'nu', vi: 'bệnh của nữ' }],
    [/xo[ắa]n tinh ho[àa]n/i, { gioi: 'nam', tuoi: [10, 30], vi: 'đỉnh tuổi thiếu niên' }],
    [/ph[ìi] [đd][ạa]i ti[ềe]n li[ệe]t tuy[ếe]n|ung th[ưu] ti[ềe]n li[ệe]t tuy[ếe]n/i,
        { gioi: 'nam', tuoi: [50, 120], vi: 'bệnh của nam lớn tuổi' }],
    [/ung th[ưu]|[áa]c t[íi]nh|di c[ăa]n|lymphoma/i, { tuoi: [45, 120], vi: 'xác suất tăng rõ theo tuổi' }],
    [/v[àa]nh c[ấa]p|nh[ồo]i m[áa]u c[ơo] tim|[đd][ộo]t qu[ỵy]|nh[ồo]i m[áa]u n[ãa]o|xu[ấa]t huy[ếe]t n[ãa]o/i,
        { tuoi: [45, 120], vi: 'bệnh lý mạch máu tăng theo tuổi' }],
    [/copd/i, { tuoi: [40, 120], vi: 'cần đủ số gói-năm tích lũy' }],
    [/vi[êe]m ti[ểe]u ph[ếe] qu[ảa]n|tay ch[âa]n mi[ệe]ng|s[ởo]i/i,
        { tuoi: [0, 15], vi: 'bệnh của trẻ em' }],
    [/hen ph[ếe] qu[ảa]n/i, { tuoi: [0, 40], vi: 'thường khởi phát sớm' }],
    [/thalassemia|b[ệe]nh tim b[ẩa]m sinh/i, { tuoi: [0, 40], vi: 'bệnh bẩm sinh, biểu hiện sớm' }],
    [/vi[êe]m ru[ộo]t th[ừu]a/i, { tuoi: [5, 45], vi: 'đỉnh tuổi 10–30' }],
    [/lo[ãa]ng x[ươư]{1,2}ng|g[ãa]y c[ổo] x[ươư]{1,2}ng [đd][ùu]i/i, { tuoi: [55, 120], vi: 'bệnh của người lớn tuổi' }],
    [/gout|g[úu]t/i, { gioi: 'nam', tuoi: [30, 120], vi: 'ưu thế nam trung niên' }],
    [/lupus/i, { gioi: 'nu', tuoi: [15, 45], vi: 'ưu thế nữ trẻ' }],
    [/tr[àa]n kh[íi] m[àa]ng ph[ổo]i t[ựu] ph[áa]t/i, { gioi: 'nam', tuoi: [15, 35], vi: 'nam trẻ cao gầy' }]
];

/** Tuổi / giới đang ghi ở mục hành chính */
export function benhNhan() {
    const el = (id) => document.getElementById(id);
    const tuoi = parseInt(el('patient-age')?.value, 10);
    const g = fold(el('patient-gender')?.value || '');
    return {
        tuoi: Number.isFinite(tuoi) ? tuoi : null,
        gioi: /^nu/.test(g) ? 'nu' : /^nam/.test(g) ? 'nam' : null
    };
}

/**
 * Bệnh này có hợp với bệnh nhân đang làm không?
 * @returns {null | {hop:boolean, vi:string}} null = thư viện chưa có điều kiện
 */
export function hopBenhNhan(ten, bn = benhNhan()) {
    const t = trim(ten);
    if (!t) return null;
    const hit = DK.find(([re]) => re.test(t));
    if (!hit) return null;
    const d = hit[1];
    if (d.gioi && bn.gioi && d.gioi !== bn.gioi) {
        return { hop: false, vi: `${d.vi} — bệnh nhân là ${bn.gioi === 'nu' ? 'nữ' : 'nam'}` };
    }
    if (d.tuoi && bn.tuoi != null && (bn.tuoi < d.tuoi[0] || bn.tuoi > d.tuoi[1])) {
        return { hop: false, vi: `${d.vi} (${d.tuoi[0]}–${d.tuoi[1]} tuổi) — bệnh nhân ${bn.tuoi} tuổi` };
    }
    const khopGioi = d.gioi && bn.gioi === d.gioi;
    const khopTuoi = d.tuoi && bn.tuoi != null && bn.tuoi >= d.tuoi[0] && bn.tuoi <= d.tuoi[1];
    return (khopGioi || khopTuoi) ? { hop: true, vi: d.vi } : null;
}

/** Xếp lại danh sách gợi ý: hợp dịch tễ lên trước, lệch dịch tễ xuống cuối */
export function xepTheoBenhNhan(list) {
    const bn = benhNhan();
    if (bn.tuoi == null && !bn.gioi) return list;
    const diem = (t) => {
        const r = hopBenhNhan(t, bn);
        return r ? (r.hop ? 1 : -1) : 0;
    };
    return [...list].sort((a, b) => diem(b) - diem(a));
}

/* =====================================================================
   3. CẦU NỐI SANG trieu-chung-data.js
   Tên vấn đề ở mục X thường CHÍNH LÀ một triệu chứng ("Khó thở", "Đau bụng",
   "Vàng da"). Triệu chứng đó đã có sẵn câu âm tính có giá trị và bệnh cảnh
   nguy hiểm — lấy sang dùng luôn.
   ===================================================================== */

/** [{cau, loaiTru}] — câu âm tính kèm nó dùng để loại trừ bệnh gì */
export function amTinhTheoTrieuChung(ten) {
    const s = findSymptom(trim(ten));
    return (s?.pertinentNegatives || []).map(([cau, loaiTru]) => ({ cau, loaiTru }));
}

/** Bệnh cảnh nguy hiểm của triệu chứng này — đổ thẳng vào nhánh 🚨 */
export function redFlagTheoTrieuChung(ten) {
    const s = findSymptom(trim(ten));
    return s?.redFlags || [];
}

/** Triệu chứng hay đi kèm — gợi thêm dấu chứng ủng hộ chưa hỏi tới */
export function keoTheoTrieuChung(ten) {
    const s = findSymptom(trim(ten));
    return s?.coOccurring || [];
}

/** Khám gì cho trúng, gom theo đúng ô khám ở mục VI */
export function khamTheoTrieuChung(ten) {
    const s = findSymptom(trim(ten));
    return s?.examTargets || null;
}
