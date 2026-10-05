// Ảnh files.catbox.moe tải từ VN rất chậm (~20 KB/s) mà lưu đồ thường là PNG >1 MB → ảnh treo, chỉ thấy chữ mô tả.
// Cho qua wsrv.nl (CDN ảnh miễn phí): nén WebP ≤1600px, ~170 KB, vài giây. Lỗi proxy thì tự quay về link gốc.
// Dữ liệu trong Firestore vẫn là link catbox gốc; chỉ đổi lúc hiện ảnh (parseInlineMarkdown) và lúc nạp offline.
const PROXY = 'https://wsrv.nl/';

export function fastImgUrl(url) {
    try {
        const u = new URL(url);
        // GIF giữ nguyên: proxy chỉ giữ khung đầu, mất ảnh động.
        if (u.hostname !== 'files.catbox.moe' || !/\.(png|jpe?g|webp)$/i.test(u.pathname)) return url;
        return `${PROXY}?url=${encodeURIComponent(u.host + u.pathname)}&w=1600&we&output=webp&q=85`;
    } catch (e) { return url; }
}

function originalImgUrl(src) {
    try {
        const u = new URL(src);
        return u.origin + '/' === PROXY && u.searchParams.get('url') ? 'https://' + u.searchParams.get('url') : '';
    } catch (e) { return ''; }
}

// Sự kiện error của <img> không nổi bọt → nghe ở pha capture, bắt cả ảnh dựng động / lưu trong HTML phòng đánh đề.
if (typeof document !== 'undefined') {
    document.addEventListener('error', (e) => {
        const im = e.target;
        if (!im || im.tagName !== 'IMG') return;
        const orig = originalImgUrl(im.src);
        if (orig) im.src = orig;
    }, true);
}
