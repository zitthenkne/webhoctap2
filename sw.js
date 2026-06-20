// Service Worker for PWA - Offline Support & Caching
const CACHE_NAME = 'zitthenkne-v5';
const urlsToCache = [
  '/',
  'index.html',
  'style.css',
  '/features/checklist/checklist.css',
  '/features/quiz/quiz-preview.css',
  'app.js',
  '/features/quiz/quiz.js',
  '/features/quiz/quiz-page.js',
  '/features/study-room/study-room.js',
  '/features/flashcard/flashcard.js',
  '/features/auth/auth.js',
  '/core/firebase-init.js',
  '/core/utils.js',
  '/features/auth/auth.html',
  '/features/checklist/checklist.html',
  '/features/checklist/checklist.js',
  '/features/editor/editor.html',
  '/features/editor/editor.js',
  '/features/flashcard/flashcard.html',
  '/features/quiz/manual-quiz.html',
  '/features/quiz/manual-quiz.js',
  '/features/profile/profile.html',
  '/features/profile/profile.js',
  '/features/quiz/quiz.html',
  '/features/study-room/study-room.html',
  '/features/study-room/study-room-main.js',
  '/features/medical-record/tao-benh-an.html',
  '/features/medical-record/tao-benh-an.js',
  '/features/study-room/waiting-room.html',
  '/features/study-room/waiting-room.js',
  '/features/medical-record/xem-benh-an.html',
  'offline.html',
  'pwa-install.js',
  '/assets/logo.png',
  '/assets/squirrel-pixel.png',
  '/assets/hero-image.png'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Service Worker: Caching app shell');
      return cache.addAll(urlsToCache).catch((err) => {
        console.log('Service Worker: Some resources failed to cache', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache or network depending on asset type
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);
  // Kiểm tra xem có phải là tài nguyên tĩnh ít thay đổi (ảnh, font) không
  const isStaticAsset = url.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i);

  if (isStaticAsset) {
    // Chiến lược Cache-First cho ảnh và font
    event.respondWith(
      caches.match(event.request).then((response) => {
        if (response) {
          return response;
        }

        return fetch(event.request)
          .then((networkResponse) => {
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }

            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });

            return networkResponse;
          })
          .catch(() => {
            // Trả về ảnh mặc định hoặc offline nếu lỗi mạng
            return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
          });
      })
    );
  } else {
    // Chiến lược Network-First cho HTML, JS, CSS, API requests để luôn nhận bản mới nhất
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // Chỉ lưu cache nếu phản hồi thành công và thuộc kiểu basic (cùng origin)
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Khi mất mạng hoặc không kết nối được server, lấy từ cache
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }

            // Nếu không có trong cache và là request điều hướng trang (HTML), trả về offline.html
            if (event.request.mode === 'navigate' || (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html'))) {
              return caches.match('offline.html');
            }
          });
        })
    );
  }
});

// Background Sync (optional - for future use)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-quizzes') {
    event.waitUntil(syncQuizzes());
  }
});

async function syncQuizzes() {
  try {
    // Sync quiz data when connection is restored
    console.log('Service Worker: Syncing quiz data');
  } catch (error) {
    console.log('Service Worker: Sync failed', error);
  }
}

// Lắng nghe tin nhắn từ trang web để kích hoạt SW mới lập tức
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});