const axios = require('axios');

// Escape các ký tự đặc biệt để không làm vỡ thuộc tính HTML (vd: dấu " trong tên đề)
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

module.exports = async function handler(req, res) {
    const { id } = req.query;

    if (!id) {
        return res.redirect('/features/quiz/quiz.html');
    }

    let title = "Zitthenkne - Ôn luyện trắc nghiệm hiệu quả";
    let description = "Thử thách bản thân với các bộ đề trắc nghiệm thú vị và nâng cao kiến thức mỗi ngày cùng Zitthenkne!";
    
    // Danh sách 10 ảnh sóc dễ thương
    const images = [
        'og_squirrel_close.png',
        'og_squirrel_jump.png',
        'og_squirrel_study.png',
        'og_squirrel_drink.png',
        'og_squirrel_fly.png',
        'og_squirrel_sleep.png',
        'og_squirrel_garden.png',
        'og_squirrel_picnic.png',
        'og_squirrel_paint.png',
        'og_squirrel_stars.png'
    ];
    const randomImg = images[Math.floor(Math.random() * images.length)];
    
    // Lấy host từ request để sinh đường dẫn tuyệt đối
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'zitthenkne.vercel.app';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const imageUrl = `${protocol}://${host}/assets/${randomImg}`;

    try {
        // Sử dụng axios lấy dữ liệu bộ đề từ Firestore REST API (tránh lỗi fetch undefined trên Node.js cũ)
        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/zitthenkne/databases/(default)/documents/quiz_sets/${id}`;
        const response = await axios.get(firestoreUrl);
        if (response.status === 200) {
            const data = response.data;
            const quizTitle = data.fields?.title?.stringValue;
            if (quizTitle) {
                title = `${quizTitle}`;
                description = `Hãy cùng làm bài kiểm tra "${quizTitle}" trên ứng dụng học tập thông minh Zitthenkne ngay nhé!`;
            }
        }
    } catch (error) {
        console.error("Lỗi khi lấy dữ liệu bộ đề từ Firestore:", error.message);
    }

    // Escape nội dung động trước khi nhúng vào HTML để tránh vỡ thẻ meta
    const safeTitle = escapeHtml(title);
    const safeDescription = escapeHtml(description);
    const targetUrl = `/features/quiz/quiz.html?id=${encodeURIComponent(id)}&img=${encodeURIComponent(randomImg)}`;
    const canonicalUrl = `${protocol}://${host}${targetUrl}`;

    // Trả về HTML chứa các thẻ Open Graph meta động.
    // Trình quét link (Zalo/Messenger/Facebook) KHÔNG chạy JavaScript: chúng chỉ đọc
    // các thẻ <meta> tĩnh dưới đây rồi dừng -> luôn lấy đúng ảnh + tên đề.
    // Người dùng thật (trình duyệt) sẽ chạy script và được chuyển sang trang làm bài.
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(`
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <title>${safeTitle}</title>
    <!-- Open Graph Meta Tags -->
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Zitthenkne">
    <meta property="og:locale" content="vi_VN">
    <meta property="og:title" content="${safeTitle}">
    <meta property="og:description" content="${safeDescription}">
    <meta property="og:url" content="${canonicalUrl}">
    <meta property="og:image" content="${imageUrl}">
    <meta property="og:image:secure_url" content="${imageUrl}">
    <meta property="og:image:width" content="1024">
    <meta property="og:image:height" content="1024">
    <meta property="og:image:alt" content="${safeTitle}">

    <!-- Twitter Cards -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${safeTitle}">
    <meta name="twitter:description" content="${safeDescription}">
    <meta name="twitter:image" content="${imageUrl}">

    <!-- Chỉ redirect bằng JavaScript: trình quét không chạy JS nên sẽ đọc trọn meta ở trên.
         (Đã bỏ <meta http-equiv="refresh"> vì một số crawler đi theo nó sang trang khác và mất preview.) -->
    <script>
        window.location.href = "${targetUrl}";
    </script>
</head>
<body>
    <p style="text-align: center; margin-top: 50px; font-family: sans-serif; color: #ff69b4; font-weight: bold;">
        Đang tải bộ đề kiểm tra... Vui lòng đợi trong giây lát.
    </p>
    <noscript>
        <p style="text-align:center;"><a href="${targetUrl}">Bấm vào đây để mở bộ đề</a></p>
    </noscript>
</body>
</html>
    `);
};
