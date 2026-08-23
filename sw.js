// Service Worker for PWA - Offline Support & Caching
const CACHE_NAME = 'zitthenkne-v31';

// App shell (cùng origin) — nạp sẵn khi cài để mở offline được ngay.
const urlsToCache = [
  '/',
  'index.html',
  'style.css',
  'features/checklist/checklist.css',
  'features/quiz/quiz-preview.css',
  'app.js',
  'features/quiz/quiz.js',
  'features/quiz/quiz-page.js',
  'features/quiz/page/quiz-page-prefs.js',
  'features/quiz/page/quiz-cat-meme.js',
  'features/quiz/page/quiz-study-sync.js',
  'features/quiz/page/quiz-annotations.js',
  'features/quiz/page/quiz-marks.js',
  'features/quiz/page/quiz-notes-panel.js',
  'features/quiz/page/quiz-page-setup.js',
  'features/quiz/page/quiz-cases.js',
  'features/quiz/page/quiz-question-view.js',
  'features/quiz/page/quiz-session.js',
  'features/quiz/page/quiz-mobile-nav.js',
  'features/quiz/page/quiz-auto-next.js',
  'features/quiz/quiz-library-controller.js',
  'features/quiz/library/library-state.js',
  'features/quiz/library/library-helpers.js',
  'features/quiz/library/library-data.js',
  'features/quiz/library/library-meta.js',
  'features/quiz/folder.html',
  'features/quiz/folder.js',
  'features/quiz/library/library-search.js',
  'features/quiz/library/library-render.js',
  'features/quiz/library/library-cards.js',
  'features/quiz/library/library-actions.js',
  'features/quiz/quiz-launch-transition.js',
  'features/quiz/quiz-offline-store.js',
  'features/quiz/quiz-helpers.js',
  'features/quiz/quiz-ui.js',
  'features/quiz/quiz-state.js',
  'features/quiz/quiz-study-store.js',
  'features/quiz/quiz-srs-store.js',
  'features/quiz/quiz-srs-bell.js',
  'features/quiz/quiz-srs-dashboard.js',
  'features/quiz/quiz-editor.js',
  'features/quiz/quiz-enhance.css',
  'features/study-room/study-room.js',
  'features/flashcard/flashcard.js',
  'core/firebase-init.js',
  'core/utils.js',
  'core/offline-write.js',
  'core/achievements.js',
  'core/file-parser.js',
  'core/quiz-autofix.js',
  'core/quiz-autofix-report.js',
  'features/checklist/checklist.html',
  'features/checklist/checklist.js',
  'features/editor/editor.html',
  'features/editor/editor.js',
  'features/flashcard/flashcard.html',
  'features/quiz/manual-quiz.html',
  'features/quiz/manual-quiz.js',
  'features/profile/profile.html',
  'features/profile/profile.js',
  'features/quiz/quiz.html',
  'features/study-room/study-room.html',
  'features/study-room/study-room-main.js',
  'features/medical-record/tao-benh-an.html',
  'features/medical-record/tao-benh-an.js',
  'features/medical-record/record-store.js',
  'features/medical-record/cls-shared.js',
  'features/medical-record/cls-editor.js',
  'features/study-room/waiting-room.html',
  'features/study-room/waiting-room.js',
  'features/medical-record/xem-benh-an.html',
  'features/medical-record/xem-benh-an.js',
  'features/quiz/quiz-history.html',
  'features/quiz/quiz-history.js',
  'features/quiz/quiz-library-menu.js',
  'features/quiz/library/library-attempts.js',
  'features/quiz/trash.html',
  'features/quiz/trash.js',
  'features/quiz/quiz-ceramic.html',
  'features/quiz/quiz-ceramic.js',
  'features/quiz/quiz-ceramic.css',
  'features/checklist/checklist-run.html',
  'features/checklist/checklist-run.js',
  'features/link-vault/link-vault.html',
  'features/profile/stats-service.js',
  'features/profile/stats-insights.js',
  'features/study-room/whiteboard.js',
  'core/dashboard-ui.js',
  'core/libs/mermaid.min.js',
  'index-user-avatar.js',
  'bg-random.js',
  'offline.html',
  'pwa-install.js',
  'manifest.json',
  'assets/logo.png',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/maskable-192.png',
  'assets/maskable-512.png',
  'assets/apple-touch-icon.png',
  'assets/squirrel-pixel.png',
  'assets/hero-image.png'
];

// Thư viện từ CDN — không cache thì offline app MẤT style/icon/font (trông vỡ).
// Nạp sẵn để offline vẫn dựng đủ giao diện; nếu 1 cái lỗi cũng không chặn cài đặt.
const cdnToCache = [
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css',
  'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js',
  'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js',
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js',
  'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@500;600;700;800&display=swap',
  'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@600;700;800&family=Cormorant+Upright:wght@500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Quicksand:wght@400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap',
  'https://www.gstatic.com/firebasejs/9.6.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/9.6.0/firebase-storage.js'
];

// Install: nạp sẵn app shell (bắt buộc) + CDN (cố gắng, lỗi cũng bỏ qua).
// {cache:'reload'} để không lấy bản cũ từ HTTP cache của trình duyệt khi lên version mới.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      const shell = cache.addAll(urlsToCache.map((u) => new Request(u, { cache: 'reload' })))
        .catch((err) => console.log('SW: một số tài nguyên app shell không cache được', err));
      // CDN: cache từng cái riêng để một cái lỗi không kéo đổ cả mẻ.
      const cdn = Promise.all(cdnToCache.map((u) =>
        cache.add(new Request(u, { cache: 'reload' })).catch(() => {})
      ));
      return Promise.all([shell, cdn]);
    })
  );
  self.skipWaiting();
});

// Activate: dọn cache phiên bản cũ.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(cacheNames.map((name) => {
        if (name !== CACHE_NAME) {
          console.log('SW: xoá cache cũ:', name);
          return caches.delete(name);
        }
      }))
    )
  );
  self.clients.claim();
});

// Các host DỮ LIỆU động (Firestore/Auth/Analytics): KHÔNG đụng vào để SDK Firebase
// tự lo (có cache offline IndexedDB riêng). Cache tay các request này sẽ hỏng dữ liệu.
function isDynamicData(url) {
  const h = url.hostname;
  return /(firestore|identitytoolkit|securetoken|firebaseinstallations|firebasedatabase|firebaseio|fcm|firebaseremoteconfig)/.test(h) ||
    h === 'www.googleapis.com' ||
    h.includes('google-analytics') ||
    h.includes('analytics.google') ||
    h.includes('googletagmanager');
}

// Cache-First: có trong cache thì trả ngay; không thì lấy mạng rồi lưu lại.
// Dùng cho ảnh/font + tài nguyên CDN (bản có version, gần như bất biến) -> nhanh & bền offline.
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    // Lưu cả phản hồi 'cors' (CDN) lẫn 'opaque' (no-cors) để offline vẫn có.
    if (res && (res.ok || res.type === 'opaque')) {
      const clone = res.clone();
      caches.open(CACHE_NAME).then((c) => c.put(request, clone));
    }
    return res;
  } catch (e) {
    return caches.match(request); // undefined nếu không có -> để trình duyệt xử lý
  }
}

// Stale-While-Revalidate: trả cache TỨC THÌ (mở app mượt như native), đồng thời
// ngầm tải bản mới về cache cho lần sau. Không có cache thì chờ mạng; hỏng thì
// rơi về offline.html cho điều hướng trang.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  // Điều hướng thường kèm query (quiz.html?id=...): cache chỉ có bản không query,
  // nên phải bỏ qua query khi dò, không thì offline sẽ rơi oan vào offline.html.
  const cached = await cache.match(request) ||
    (request.mode === 'navigate' ? await cache.match(request, { ignoreSearch: true }) : undefined);
  const network = fetch(request).then((res) => {
    if (res && res.status === 200 && res.type === 'basic') {
      // Lưu theo URL đã bỏ query để mỗi id không đẻ ra một bản HTML riêng trong cache.
      const key = request.mode === 'navigate' ? new Request(new URL(request.url).origin + new URL(request.url).pathname) : request;
      cache.put(key, res.clone());
    }
    return res;
  }).catch(() => undefined);

  if (cached) return cached;                 // có cache -> trả ngay, cập nhật chạy nền
  const res = await network;
  if (res) return res;
  if (request.mode === 'navigate') return cache.match('offline.html');
  return undefined;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (isDynamicData(url)) return; // để mặc định (SDK Firebase tự lo offline)

  const isStaticAsset = /\.(png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|eot)$/i.test(url.pathname);
  const isCrossOrigin = url.origin !== self.location.origin;

  if (isStaticAsset || isCrossOrigin) {
    event.respondWith(cacheFirst(event.request));  // ảnh/font + CDN
  } else {
    event.respondWith(staleWhileRevalidate(event.request)); // app shell cùng origin
  }
});

// Lắng nghe lệnh từ trang để kích hoạt SW mới ngay lập tức.
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
