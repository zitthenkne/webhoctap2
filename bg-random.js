/*
 * Nền ngẫu nhiên cho trang chủ.
 *
 * CÁCH THÊM ẢNH MỚI:
 *   1. Bỏ ảnh (.jpeg/.jpg/.png/.webp) vào thư mục:  assets/bg index/
 *   2. Thêm đúng TÊN FILE (kèm đuôi) vào mảng BG_IMAGES bên dưới — mỗi ảnh 1 dòng.
 *   Vậy là xong, mỗi lần tải trang sẽ chọn ngẫu nhiên 1 ảnh trong danh sách.
 *
 * Muốn nền rõ hơn -> giảm BG_OVERLAY (vd 0.45). Muốn mờ hơn -> tăng (vd 0.75).
 * Muốn đổi tông nền -> sửa BG_TINT (mã màu RGB của lớp phủ hồng phấn).
 */
(function () {
    "use strict";

    var BG_FOLDER = "assets/bg index/";
    var BG_OVERLAY = 0.55; // độ phủ của lớp hồng (0 = ảnh rõ nhất, 1 = phủ kín)
    var BG_TINT = "255, 214, 224"; // màu lớp phủ (hồng phấn #FFD6E0) -> mọi ảnh đều ánh hồng

    var BG_IMAGES = [
        "Candy_wonderland_with_squirrel_202606240130.jpeg",
        "Chibi_squirrel_stirring_potion_202606240129.jpeg",
        "Chibi_squirrel_tea_party_lotus_202606240130.jpeg",
        "Fairy-tale_valley_with_crystal_c…_202606240117.jpeg",
        "Floating_island_with_windmill_202606240131.jpeg",
        "Flower-cart_bookstore_with_squirrel_202606240131.jpeg",
        "Hot_air_balloon_floats_among_202606240129.jpeg",
        "Squirrel_building_acorn_sandcastle_202606240133.jpeg",
        "Squirrel_riding_soap_bubble_202606240133.jpeg",
        "Squirrel_rows_maple_leaf_boat_202606240132.jpeg",
        "Wishing_well_with_squirrel_202606240132.jpeg",
        // Thêm tên file ảnh mới ở đây, ví dụ:
        // "Ten_anh_moi.jpeg",
    ];

    if (!BG_IMAGES.length) return;

    var name = BG_IMAGES[Math.floor(Math.random() * BG_IMAGES.length)];
    var url = encodeURI(BG_FOLDER + name); // mã hoá khoảng trắng & ký tự đặc biệt
    var overlay = "rgba(" + BG_TINT + ", " + BG_OVERLAY + ")";

    function apply() {
        document.body.style.backgroundImage =
            "linear-gradient(" + overlay + ", " + overlay + "), url('" + url + "')";
    }

    if (document.body) {
        apply();
    } else {
        document.addEventListener("DOMContentLoaded", apply);
    }
})();
