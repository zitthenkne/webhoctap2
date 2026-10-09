// Service Worker for PWA - Offline Support & Caching
// 3 kho cache:
//  - CACHE_NAME (zitthenkne-v2NNN): app shell. Tăng số MỖI LẦN sửa/thêm file trong urlsToCache.
//  - CDN_CACHE: thư viện + phông từ CDN (URL có phiên bản, gần như bất biến) → GIỮ qua các phiên bản.
//  - IMG_CACHE: ảnh tải lúc chạy (nền, avatar, ảnh bệnh án) → giữ qua các phiên bản, tối đa IMG_MAX mục.
const CACHE_NAME = 'zitthenkne-v310';
const CDN_CACHE = 'zitthenkne-cdn';
const IMG_CACHE = 'zitthenkne-img';
const IMG_MAX = 600;
const QUIZ_IMG_CACHE = 'zitthenkne-quiz-img';   // ảnh bộ đề lưu offline (quiz-offline-store.js tự dọn) — không trim theo IMG_MAX
const ZIMG_CACHE = 'zitthenkne-zimg';           // ảnh bộ đề lưu trong Firestore (quiz_images) — core/zimg.js cũng ghi/đọc kho này; ảnh bất biến theo id nên chỉ GIỮ
const FS_PROJECT = 'zitthenkne';                // cấu hình web công khai, trùng core/firebase-init.js và core/zimg.js
const FS_KEY = 'AIzaSyBFNNeJMeDIVRcG2Xj4ZVjr2-0d9RGrURc';
const PIPER_CACHE = 'zitthenkne-piper';         // giọng đọc Piper người dùng đã tải (page/piper-worker.js tự ghi/xóa) — chỉ GIỮ, không đụng

// App shell (cùng origin) — nạp sẵn khi cài để mở offline được ngay.
const urlsToCache = [
  '/',
  'index.html',
  'offline.html',
  'style.css',
  'tailwind-index.css',
  'home-shell.css',
  'home-scrapbook.css',
  'core/app-sidebar.css',
  'core/app-sidebar.js',
  'features/checklist/checklist.css',
  'features/quiz/quiz-preview.css',
  'app.js',
  'features/quiz/quiz-page.js',
  'features/quiz/page/quiz-page-prefs.js',
  'features/quiz/page/quiz-cat-meme.js',
  'features/quiz/page/quiz-study-sync.js',
  'features/quiz/page/quiz-annotations.js',
  'features/quiz/page/quiz-marks.js',
  'features/quiz/page/quiz-notes-panel.js',
  'features/quiz/page/quiz-notes-all.js',
  'features/quiz/page/quiz-sound.js',
  'features/quiz/page/quiz-focus.js',
  'features/quiz/page/quiz-find.js',
  'features/quiz/page/quiz-result-card.js',
  'features/quiz/page/quiz-page-setup.js',
  'features/quiz/page/quiz-cases.js',
  'features/quiz/page/quiz-case-peek.js',
  'features/quiz/page/quiz-essay.js',
  'features/quiz/quiz-essay-core.js',
  'features/quiz/essay-format-editor.js',
  'features/quiz/page/quiz-group.js',
  'features/quiz/page/quiz-question-view.js',
  'features/quiz/page/quiz-session.js',
  'features/quiz/page/quiz-mobile-nav.js',
  'features/quiz/page/quiz-tablet-next.js',
  'features/quiz/page/quiz-boost.js',
  'features/quiz/page/quiz-voice.js',
  'features/quiz/page/piper-worker.js',
  'features/quiz/page/quiz-auto-next.js',
  'features/quiz/quiz-library-controller.js',
  'features/quiz/library/library-state.js',
  'features/quiz/library/library-helpers.js',
  'features/quiz/library/library-data.js',
  'features/quiz/library/library-meta.js',
  'features/quiz/library/library-qindex.js',
  'features/quiz/folder.html',
  'features/quiz/folder.js',
  'features/quiz/library/library-search.js',
  'features/quiz/library/library-render.js',
  'features/quiz/library/library-cards.js',
  'features/quiz/library/folder-open-fx.js',
  'features/quiz/library/library-actions.js',
  'features/quiz/quiz-launch-transition.js',
  'features/quiz/quiz-offline-store.js',
  'features/quiz/quiz-fresh.js',
  'features/quiz/quiz-coalesce.js',
  'features/quiz/quiz-helpers.js',
  'features/quiz/img-proxy.js',
  'features/quiz/quiz-ui.js',
  'features/quiz/quiz-export.js',
  'features/quiz/quiz-state.js',
  'features/quiz/quiz-study-store.js',
  'features/quiz/quiz-srs-store.js',
  'features/quiz/quiz-srs-bell.js',
  'features/quiz/quiz-srs-dashboard.js',
  'features/quiz/quiz-editor.js',
  'features/quiz/quiz-enhance.css',
  'features/quiz/quiz-stationery.css',
  'features/quiz/tailwind-quiz.css',
  'features/quiz/quiz-min.css',
  'core/write-errors.js',
  'features/quiz/fa-quiz/fa-quiz.css',
  'features/quiz/fa-quiz/solid.woff2',
  'features/quiz/fa-quiz/regular.woff2',
  'features/quiz/fa-quiz/brands.woff2',
  'features/quiz/web_assets/mascot_stationery_squirrel.webp',
  'features/quiz/web_assets/badge_stationery_exam.webp',
  'features/quiz/web_assets/badge_stationery_study.webp',
  'features/quiz/web_assets/badge_stationery_sprint.webp',
  'features/quiz/web_assets/badge_stationery_srs.webp',
  'features/flashcard/flashcard.js',
  'core/firebase-init.js',
  'core/utils.js',
  'core/offline-write.js',
  'core/auth-session.js',
  'core/firestore-rest.js',
  'core/zimg.js',
  'core/require-login.js',
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
  'features/study-room/study-room.css',
  'features/study-room/room-state.js',
  'features/study-room/room-texts.js',
  'features/study-room/room-texts-core.js',
  'features/study-room/room-ui.js',
  'features/study-room/room-members.js',
  'features/study-room/room-chat.js',
  'features/study-room/room-quiz.js',
  'features/study-room/room-quiz-stage.js',
  'features/study-room/room-scoreboard.js',
  'features/study-room/room-study.js',
  'features/study-room/room-editor.js',
  'features/study-room/room-lobby.js',
  'features/study-room/room-mobile.js',
  'features/study-room/room-boost.js',
  'features/study-room/room-game.js',
  'features/study-room/room-media.js',
  'features/study-room/room-minutes.js',
  'features/study-room/room-answer.js',
  'features/study-room/room-presence.js',
  'features/study-room/room-richtools.js',
  'features/study-room/room-sparkle.js',
  'features/study-room/room-reason.js',
  'features/study-room/room-barem.js',
  'features/study-room/room-paste.js',
  'features/study-room/room-polish.js',
  'features/study-room/rooms-hub.js',
  'features/study-room/rooms-hub.css',
  'features/study-room/tailwind-phong.css',
  'features/study-room/study-room-min.css',
  'features/study-room/fa-phong/fa-phong.css',
  'features/study-room/fa-phong/solid.woff2',
  'features/study-room/fa-phong/regular.woff2',
  'features/study-room/fa-phong/brands.woff2',
  'features/study-room/fonts/quicksand-vi.woff2',
  'features/study-room/fonts/quicksand-latin.woff2',
  'features/study-room/fonts/quicksand-latin-ext.woff2',
  'assets/opt/logo-32.png',
  'assets/opt/logo-96.webp',
  'assets/opt/squirrel_group-256.webp',
  'features/medical-record/dac-thu-khoa.js',
  'features/medical-record/tao-benh-an.css',
  'features/medical-record/tailwind-benh-an.css',
  'features/medical-record/tailwind-xem.css',
  'features/medical-record/gon-giao-dien.css',
  'features/medical-record/mau-hong-dao.css',
  'features/medical-record/bo-cuc-ben.js',
  'features/medical-record/kham-gon.js',
  'features/medical-record/bien-luan-gon.js',
  'features/medical-record/gon-giao-dien.js',
  'features/medical-record/tao-benh-an.html',
  'features/medical-record/tao-benh-an.js',
  'features/medical-record/benh-an-vanxuoi.js',
  'features/medical-record/bien-luan-them.js',
  'features/medical-record/clinical-validator.js',
  'features/medical-record/di-ung-list.js',
  'features/medical-record/gia-dinh-list.js',
  'features/medical-record/goi-y-go.js',
  'features/medical-record/lien-ket-map.js',
  'features/medical-record/lop-noi.js',
  'features/medical-record/mach-benh-an.js',
  'features/medical-record/mot-tay.js',
  'features/medical-record/nhap-lien-ket.js',
  'features/medical-record/ros-editor.js',
  'features/medical-record/tam-tay.js',
  'features/medical-record/tao-benh-an-dt.js',
  'features/medical-record/tao-benh-an-them.js',
  'features/medical-record/tao-benh-an-tungcau.js',
  'features/medical-record/thuan-tay.js',
  'features/medical-record/tim-kiem.js',
  'features/medical-record/toan-canh.js',
  'features/medical-record/tuyen-truoc-list.js',
  'features/medical-record/benh-an-text.js',
  'features/medical-record/record-store.js',
  'features/medical-record/sync-core.js',
  'features/medical-record/benh-an-mau.js',
  'features/medical-record/cls-shared.js',
  'features/medical-record/cls-editor.js',
  'features/medical-record/benh-su-editor.js',
  'features/medical-record/bien-luan-editor.js',
  'features/medical-record/cnv-list.js',
  'features/medical-record/findings-editor.js',
  'features/medical-record/folder-store.js',
  'features/medical-record/ui-fold.js',
  'features/medical-record/theo-doi-editor.js',
  'features/medical-record/image-upload.js',
  'features/medical-record/rx-editor.js',
  'features/medical-record/bien-luan-data.js',
  'features/medical-record/bien-luan-map.js',
  'features/medical-record/bien-luan-phanbiet.js',
  'features/medical-record/bien-luan-diem.js',
  'features/medical-record/bien-luan-thang-diem.js',
  'features/medical-record/trieu-chung-data.js',
  'features/medical-record/symptom-picker.js',
  'features/medical-record/auto-grade.js',
  'features/medical-record/benh-data.js',
  'features/medical-record/list-picker.js',
  'features/medical-record/benh-kem-list.js',
  'features/medical-record/goi-y-nhap.js',
  'features/medical-record/muc-do-benh-kem.js',
  'features/medical-record/chi-so-chuan.js',
  'features/medical-record/doi-list.js',
  'features/medical-record/tien-can-data.js',
  'features/medical-record/thuoc-data.js',
  'features/medical-record/chan-thuong-data.js',
  'features/medical-record/de-nghi-data.js',
  'features/medical-record/cls-de-nghi.js',
  'features/medical-record/ui-ask.js',
  'features/medical-record/ly-do-list.js',
  'features/medical-record/phan-do.js',
  'features/medical-record/am-tinh.js',
  'features/medical-record/kich-ban-benh.js',
  'features/medical-record/body-map.js',
  'features/medical-record/dien-tien-view.js',
  'core/guide.js',
  'features/study-room/waiting-room.html',
  'features/study-room/waiting-room.js',
  'features/study-room/waiting-room.css',
  'features/medical-record/xem-benh-an.html',
  'features/medical-record/xem-benh-an.js',
  'features/medical-record/xem-benh-an.css',
  'features/quiz/quiz-history.html',
  'features/quiz/quiz-history.js',
  'features/quiz/quiz-library-menu.js',
  'features/quiz/library/library-attempts.js',
  'features/quiz/trash.html',
  'features/quiz/trash.js',
  'features/checklist/checklist-run.html',
  'features/checklist/checklist-run.js',
  'features/link-vault/link-vault.html',
  'features/profile/stats-service.js',
  'features/profile/stats-insights.js',
  'features/study-room/whiteboard.js',
  'features/study-room/wb-templates.js',
  'features/study-room/whiteboard.css',
  'features/study-room/room-diagram.js',
  'features/study-room/room-notes.js',
  'features/quiz/diagram-viewer.js',
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

// Thư viện CDN chỉ gọi lúc chạy mà KHÔNG ghi nguyên văn URL trong trang/mã (bộ dò không thấy).
// Mọi URL CDN còn lại được TỰ DÒ từ các file đã nạp sẵn — xem harvestCdnUrls().
const cdnToCache = [
  'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js'
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Chạy fn cho từng phần tử, tối đa `n` việc cùng lúc (điện thoại mạng yếu mở 250 kết nối một lúc dễ rớt).
async function pool(items, n, fn) {
  const queue = items.slice();
  await Promise.all(Array.from({ length: n }, async () => {
    while (queue.length) await fn(queue.shift());
  }));
}

// ---------- CÀI ĐẶT ----------
// Nạp app shell. Hai điều khác bản cũ:
// 1) cache:'no-cache' = hỏi lại máy chủ kèm ETag → file không đổi chỉ tốn một phản hồi 304 vài trăm byte,
//    thay vì tải lại nguyên 12MB mỗi lần lên phiên bản.
// 2) Hỏng một file (mạng chập chờn) thì CÀI THẤT BẠI → trình duyệt giữ nguyên bản cũ đang chạy tốt và thử lại
//    lần sau. Bản cũ nuốt lỗi rồi vẫn kích hoạt → cache mới thiếu file, cache cũ bị xoá → offline mất trắng.
//    (File 404 thật thì bỏ qua, kẻo một dòng gõ sai trong danh sách chặn cập nhật mãi mãi.)
async function precacheShell() {
  const cache = await caches.open(CACHE_NAME);
  const failed = [];
  await pool(urlsToCache, 8, async (u) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(new Request(u, { cache: attempt ? 'reload' : 'no-cache' }));
        if (res.status === 404) { console.warn('SW: bỏ qua file không tồn tại', u); return; }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        await cache.put(u, res);
        return;
      } catch (e) {
        if (attempt < 2) await sleep(800 * (attempt + 1));
      }
    }
    failed.push(u);
  });
  // Không xoá cache dở dang: lỡ quên tăng CACHE_NAME thì nó TRÙNG tên kho đang chạy.
  if (failed.length) {
    throw new Error('SW: chưa tải được ' + failed.length + ' file (' + failed.slice(0, 3).join(', ') + '…) — giữ bản cũ, thử lại sau');
  }
}

// Chuyển ảnh/CDN đã lưu ở các phiên bản cũ sang kho bền (chỉ chạy lúc lên phiên bản, đọc ghi cục bộ).
async function migrateOldCaches() {
  const names = (await caches.keys()).filter((n) => /^zitthenkne-v1\d+$/.test(n) && n !== CACHE_NAME);
  const shell = new Set(urlsToCache.map((u) => new URL(u, self.location).href));
  const cdn = await caches.open(CDN_CACHE);
  const img = await caches.open(IMG_CACHE);
  for (const name of names) {
    const old = await caches.open(name);
    for (const req of await old.keys()) {
      const url = new URL(req.url);
      if (shell.has(url.origin + url.pathname)) continue;      // đã có trong app shell mới
      const target = isImageUrl(url) ? img : (url.origin !== self.location.origin || isFontUrl(url)) ? cdn : null;
      if (!target || await target.match(req)) continue;
      const res = await old.match(req);
      if (res) await target.put(req, res);
    }
  }
}

// ---------- DÒ & LƯU CDN ----------
// Dò mọi URL CDN ghi trong các trang/mã đã nạp sẵn → trang nào chưa từng mở lúc có mạng thì offline vẫn
// đủ giao diện (trước đây: Tailwind CDN chưa lưu → trang Bệnh án của tôi, Checklist, Hồ sơ… offline trắng trơn).
const CDN_RE = /https:\/\/(?:cdn\.tailwindcss\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com|www\.gstatic\.com\/firebasejs|fonts\.googleapis\.com\/css2?)[^\s"'`<>)\\]*/g;

async function harvestCdnUrls() {
  const shell = await caches.open(CACHE_NAME);
  const found = new Set(cdnToCache);
  for (const u of urlsToCache) {
    if (!/\.(html|js|css)$/.test(u) || u.startsWith('core/libs/')) continue;
    const res = await shell.match(u);
    if (!res) continue;
    const text = await res.text();
    for (const m of text.matchAll(CDN_RE)) {
      const url = m[0].replace(/&amp;/g, '&');
      if (url.includes('${') || /[=&?+]$/.test(url)) continue;         // URL ghép chuỗi lúc chạy
      const p = new URL(url);
      const isFontCss = p.hostname === 'fonts.googleapis.com' && p.search.includes('family=');
      const isFile = /\/[^/]+\.[a-z0-9]+$/i.test(p.pathname);
      if (p.hostname === 'cdn.tailwindcss.com' || isFontCss || isFile) found.add(p.href);
    }
  }
  return [...found];
}

// Lưu 1 URL CDN vào kho bền. Thử CORS trước (đọc được nội dung, dùng được cho module/phông);
// máy chủ không gửi CORS (cdn.tailwindcss.com chuyển hướng 302 không kèm header) thì lưu bản "opaque".
// CSS đọc được (Google Fonts, Font Awesome, KaTeX) → lưu luôn file phông woff2 nó trỏ tới.
async function stashCdn(cdn, url) {
  let res = await cdn.match(url);
  if (!res) {
    try { res = await fetch(url, { mode: 'cors', credentials: 'omit' }); } catch (e) {}
    if (!res || !res.ok) {
      try { res = await fetch(url, { mode: 'no-cors', credentials: 'omit' }); } catch (e) { return; }
    }
    if (!res || !(res.ok || res.type === 'opaque')) return;
    await cdn.put(url, res.clone());
  }
  // CSS đã lưu từ trước vẫn đọc lại (cục bộ, rẻ) để bù file phông lần trước chưa kịp tải
  if (res.type === 'opaque' || !/css/.test(res.headers.get('content-type') || '')) return;

  const css = await res.text();
  const fonts = new Set();
  // Google Fonts ghi chú tên bộ ký tự trước mỗi @font-face → chỉ lấy bộ dùng cho tiếng Việt.
  const blocks = [...css.matchAll(/(?:\/\*\s*([\w-]+)\s*\*\/\s*)?@font-face\s*{([^}]*)}/g)];
  for (const [, subset, body] of blocks) {
    if (subset && !/^(latin|latin-ext|vietnamese)$/.test(subset)) continue;
    for (const f of body.matchAll(/url\(\s*['"]?([^'")]+\.woff2)['"]?\s*\)/g)) fonts.add(new URL(f[1], url).href);
  }
  await pool([...fonts], 4, async (f) => {
    if (await cdn.match(f)) return;
    try {
      const r = await fetch(f, { mode: 'cors', credentials: 'omit' });
      if (r.ok) await cdn.put(f, r);
    } catch (e) {}
  });
}

// Chỉ tải những gì CHƯA có (kho bền giữ qua các phiên bản) → sau lần đầu gần như không tốn gì.
// Có giới hạn thời gian để không kéo dài cài đặt; phần còn thiếu trang sẽ gọi 'warm' bù sau.
async function warmCdn(maxMs = 25000) {
  try {
    const cdn = await caches.open(CDN_CACHE);
    const urls = await harvestCdnUrls();
    await Promise.race([pool(urls, 4, (u) => stashCdn(cdn, u).catch(() => {})), sleep(maxMs)]);
  } catch (e) {
    console.warn('SW: lưu CDN chưa trọn', e);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await precacheShell();          // hỏng → ném lỗi → giữ bản cũ
    await migrateOldCaches().catch(() => {});
    await warmCdn();
  })());
  self.skipWaiting();
});

// Kích hoạt: xoá app shell phiên bản cũ; GIỮ kho CDN + ảnh.
// Kho CDN được GIỮ qua mọi phiên bản nên bản SDK Firebase cũ (đổi phiên bản = URL khác) nằm lại mãi (~1,6MB/bản).
// Phiên bản hiện hành lấy từ chính danh sách cdnToCache ở trên (firebase-nang-cap.mjs đổi cả danh sách này).
async function purgeOldFirebase() {
  const cur = /firebasejs\/([\d.]+)\//.exec(cdnToCache[0]);
  if (!cur) return;
  const cache = await caches.open(CDN_CACHE);
  for (const req of await cache.keys()) {
    const v = /gstatic\.com\/firebasejs\/([\d.]+)\//.exec(req.url);
    if (v && v[1] !== cur[1]) await cache.delete(req);
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((names) => Promise.all(names.map((name) => {
      if (name !== CACHE_NAME && name !== CDN_CACHE && name !== IMG_CACHE && name !== QUIZ_IMG_CACHE && name !== ZIMG_CACHE && name !== PIPER_CACHE) {
        console.log('SW: xoá cache cũ:', name);
        return caches.delete(name);
      }
    }))),
    purgeOldFirebase().catch(() => {})
  ]));
  self.clients.claim();
});

// Các host DỮ LIỆU động (Firestore/Auth/Analytics): KHÔNG đụng vào để SDK Firebase
// tự lo (có cache offline IndexedDB riêng). Cache tay các request này sẽ hỏng dữ liệu.
function isDynamicData(url) {
  const h = url.hostname;
  return /(firestore|identitytoolkit|securetoken|firebaseinstallations|firebasedatabase|firebaseio|fcm|firebaseremoteconfig)/.test(h) ||
    h === 'www.googleapis.com' ||
    h === 'huggingface.co' || h.endsWith('.hf.co') ||   // model giọng Piper 28–63MB: worker tự lưu, SW mà cache nữa là nhân đôi dung lượng
    h.includes('google-analytics') ||
    h.includes('analytics.google') ||
    h.includes('googletagmanager');
}

function isImageUrl(url) {
  return /\.(png|jpe?g|gif|svg|webp|avif|ico)$/i.test(url.pathname) ||
    url.hostname === 'ui-avatars.com' ||
    url.hostname.includes('catbox.moe') ||
    url.hostname.includes('litterbox');
}
function isFontUrl(url) { return /\.(woff2?|ttf|eot|otf)$/i.test(url.pathname); }

// Giữ kho ảnh không phình mãi: quá IMG_MAX thì bỏ những mục cũ nhất (keys() theo thứ tự thêm vào).
let trimming = false;
async function trimImages() {
  if (trimming) return;
  trimming = true;
  try {
    const cache = await caches.open(IMG_CACHE);
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - IMG_MAX; i++) await cache.delete(keys[i]);
  } finally { trimming = false; }
}

// Ảnh NỀN offline: ảnh bốc ngẫu nhiên chưa từng tải thì lấy tạm ảnh khác CÙNG thư mục nền đã có trong máy
// (trước đây: offline là mất nền, chỉ còn màu hồng trơn). Chỉ áp cho thư mục nền, không đổi nhầm ảnh nội dung.
async function sameFolderBackground(url) {
  const path = decodeURIComponent(url.pathname);
  if (!/\/bg( |-|\/)/.test(path)) return undefined;
  const folder = url.origin + url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1);
  for (const name of [IMG_CACHE, CACHE_NAME]) {
    const cache = await caches.open(name);
    const hit = (await cache.keys()).find((r) => r.url.startsWith(folder));
    if (hit) return cache.match(hit);
  }
  return undefined;
}

// Avatar ui-avatars.com chưa từng tải (offline): tự vẽ lại bằng SVG từ chính tham số trong URL
// (name/background/color) thay vì hiện ô ảnh vỡ.
function avatarSvg(url) {
  const p = url.searchParams;
  const hex = (v, d) => (/^[0-9a-f]{3,8}$/i.test(v || '') ? '#' + v : d);
  const words = (p.get('name') || '?').trim().split(/\s+/);
  const initials = (words.map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?')
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="' +
    hex(p.get('background'), '#D8BFD8') + '"/><text x="32" y="32" dy=".35em" text-anchor="middle" font-family="sans-serif" font-size="26" font-weight="600" fill="' +
    hex(p.get('color'), '#fff') + '">' + initials + '</text></svg>';
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } });
}

async function cacheFirst(request, url, store) {
  const sameOrigin = url.origin === self.location.origin;
  const cached = await caches.match(request) ||
    await caches.match(url.href) ||
    (sameOrigin ? await caches.match(request, { ignoreSearch: true }) : undefined);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    // Lưu cả phản hồi 'cors' (CDN) lẫn 'opaque' (no-cors) để offline vẫn có.
    if (res && (res.ok || res.type === 'opaque')) {
      const clone = res.clone();
      caches.open(store).then((c) => c.put(request, clone)).then(() => { if (store === IMG_CACHE) trimImages(); });
    }
    return res;
  } catch (e) {
    if (url.hostname === 'ui-avatars.com') return avatarSvg(url);
    const fallback = await caches.match(url.href);
    if (fallback) return fallback;
    return (store === IMG_CACHE && await sameFolderBackground(url)) || Response.error();
  }
}

// Stale-While-Revalidate: trả cache TỨC THÌ (mở app mượt như native), đồng thời
// ngầm tải bản mới về cache cho lần sau. Không có cache thì chờ mạng; hỏng thì
// rơi về offline.html cho điều hướng trang.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  // Điều hướng thường kèm query (quiz.html?id=...): cache chỉ có bản không query,
  // nên phải bỏ qua query khi dò, không thì offline sẽ rơi oan vào offline.html.
  // Tài nguyên cùng nguồn hay kèm đuôi phá cache (xem-benh-an.css?v=2) trong khi danh sách
  // nạp sẵn ghi tên trơn -> không bỏ query khi dò thì offline hụt, trang mất định dạng.
  const cached = await cache.match(request) || await cache.match(request, { ignoreSearch: true });
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
  return Response.error();
}

// Ảnh bộ đề trong Firestore: <img src=".../zimg/<id>.webp"> (xem core/zimg.js) → cache trước, không có thì lấy quiz_images/<id> qua REST (đọc công khai).
const ZIMG_RE = /\/zimg\/([a-f0-9]{32})\.[a-z0-9]+$/i;
async function zimgResponse(url, id) {
  const cache = await caches.open(ZIMG_CACHE);
  const hit = await cache.match(url.href);
  if (hit) return hit;
  try {
    const res = await fetch(`https://firestore.googleapis.com/v1/projects/${FS_PROJECT}/databases/(default)/documents/quiz_images/${id}?mask.fieldPaths=data&mask.fieldPaths=mime&key=${FS_KEY}`);
    if (res.status === 404 || res.status === 403) return new Response('Không có ảnh này', { status: 404 });
    if (!res.ok) return Response.error();
    const f = (await res.json()).fields || {};
    const bin = atob(String((f.data && f.data.bytesValue) || '').replace(/\s+/g, ''));
    if (!bin.length) return new Response('Ảnh rỗng', { status: 404 });
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const mime = (f.mime && f.mime.stringValue) || 'image/webp';
    const out = new Response(bytes, { headers: { 'Content-Type': mime, 'Cache-Control': 'public, max-age=31536000, immutable' } });
    cache.put(url.href, out.clone()).catch(() => {});
    return out;
  } catch (e) {
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    const z = ZIMG_RE.exec(url.pathname);
    if (z) return void event.respondWith(zimgResponse(url, z[1].toLowerCase()));
  }
  if (!/^https?:$/.test(url.protocol) || isDynamicData(url)) return; // SDK Firebase tự lo offline

  if (request.destination === 'image' || isImageUrl(url)) {
    event.respondWith(cacheFirst(request, url, IMG_CACHE));        // ảnh
  } else if (url.origin !== self.location.origin || isFontUrl(url)) {
    event.respondWith(cacheFirst(request, url, CDN_CACHE));        // CDN + phông
  } else {
    event.respondWith(staleWhileRevalidate(request));              // app shell cùng origin
  }
});

// Lệnh từ trang: kích hoạt SW mới ngay / lưu bù CDN còn thiếu (pwa-install.js gọi khi có mạng).
self.addEventListener('message', (event) => {
  const action = event.data && event.data.action;
  if (action === 'skipWaiting') self.skipWaiting();
  if (action === 'warm') event.waitUntil(warmCdn(60000));
});
