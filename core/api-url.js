// File: core/api-url.js
// Hàm nhỏ KHÔNG phụ thuộc Firestore — trang cổng link riêng (features/quiz/link.html) dùng được mà khỏi kéo device-limit.js + Firestore SDK.
// device-limit.js xuất lại cả hai, nơi khác cứ import từ đó như cũ.

/** URL API Vercel: bản Vercel (chính thức / xem trước) gọi cùng tên miền; nơi khác (localhost, GitHub Pages) gọi bản chính thức. */
export const apiUrl = (path) => new URL(path, (typeof location !== 'undefined' && /\.vercel\.app$/i.test(location.hostname) ? location.origin : 'https://zitthenkne.vercel.app') + '/').href;

/** Tên máy dễ hiểu cho danh sách ở trang Hồ sơ, vd "iPad · Safari", "Điện thoại Android · Chrome". */
export function deviceLabel() {
    const ua = navigator.userAgent || '';
    const iPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);   // iPadOS tự xưng là Mac
    const os = iPad ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? (/Mobile/.test(ua) ? 'Điện thoại Android' : 'Máy tính bảng Android')
        : /Windows/.test(ua) ? 'Máy tính Windows' : /Macintosh/.test(ua) ? 'Máy Mac' : /CrOS/.test(ua) ? 'Chromebook' : /Linux/.test(ua) ? 'Máy Linux' : 'Thiết bị';
    const br = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Trình duyệt';
    const app = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone ? ' (ứng dụng)' : '';
    return `${os} · ${br}${app}`;
}
