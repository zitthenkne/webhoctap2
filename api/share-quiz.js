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
        // Gọi REST API của Firestore để lấy tiêu đề bộ đề
        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/zitthenkne/databases/(default)/documents/quiz_sets/${id}`;
        const response = await fetch(firestoreUrl);
        if (response.ok) {
            const data = await response.json();
            // Firestore REST API trả về dữ liệu dạng { fields: { title: { stringValue: '...' } } }
            const quizTitle = data.fields?.title?.stringValue;
            if (quizTitle) {
                title = `${quizTitle}`;
                description = `Hãy cùng làm bài kiểm tra "${quizTitle}" trên ứng dụng học tập thông minh Zitthenkne ngay nhé!`;
            }
        }
    } catch (error) {
        console.error("Lỗi khi lấy dữ liệu bộ đề từ Firestore:", error);
    }

    // Trả về HTML chứa các thẻ Open Graph meta động và script redirect về trang quiz thực tế
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(`
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <!-- Open Graph Meta Tags -->
    <meta property="og:type" content="website">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${imageUrl}">
    <meta property="og:url" content="${protocol}://${host}/features/quiz/quiz.html?id=${id}">
    
    <!-- Twitter Cards -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${imageUrl}">

    <!-- Redirect ngay lập tức về trang quiz thực tế -->
    <script>
        window.location.href = "/features/quiz/quiz.html?id=${id}";
    </script>
    <meta http-equiv="refresh" content="0;url=/features/quiz/quiz.html?id=${id}">
</head>
<body>
    <p style="text-align: center; margin-top: 50px; font-family: sans-serif; color: #ff69b4; font-weight: bold;">
        Đang tải bộ đề kiểm tra... Vui lòng đợi trong giây lát.
    </p>
</body>
</html>
    `);
};
