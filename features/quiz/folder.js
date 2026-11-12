// File: features/quiz/folder.js
// Trang xem một THƯ MỤC ĐƯỢC CHIA SẺ: ai có link cũng mở được, không cần đăng nhập.
//
// Điều kiện để trang này có dữ liệu:
//   - thư mục phải công khai CÒN HẠN (isPublic + publicUntil — luật Firestore) → mới đọc được tên/màu/icon
//   - danh sách bộ đề / thư mục con công khai lấy qua máy chủ (api/public.js), chỉ những cái còn hạn
// Chủ thư mục bật cả hai bằng một thao tác "Chia sẻ thư mục" ở thư viện.
//
// CHIA SẺ RIÊNG (2026-10-27): thư mục/bộ đề có `sharedWith` chứa email (đã xác nhận) của người đang đăng nhập cũng mở được.
// Khi đó không lọc isPublic được nữa → lấy MỌI thứ chia sẻ cho mình (sharedWith array-contains email) rồi lọc theo thư mục ở máy
// (vài chục doc, khỏi cần chỉ mục ghép). `?shared=me`: trang "Được chia sẻ với tôi" — liệt kê các mục gốc được chia sẻ cho mình.

import { db, auth } from '../../core/firebase-init.js';
import { whenAuthReady, refreshEmailVerified } from '../../core/auth-session.js';
import { runQueryRest } from '../../core/firestore-rest.js';
import { markSharedSeen } from './shared-inbox.js';
import { rememberOpened, listShelf, forgetShelf, togglePinShelf, clearShelf, localStatsFor, listLocalResults, forgetLocalResults, shelfEntry } from './local-shelf.js';
import { showToast, showConfirm } from '../../core/utils.js';
import { requireFeature } from '../../core/features.js';
import { apiUrl, deviceLabel } from '../../core/device-limit.js';
import {
    doc, getDoc, collection, setDoc, arrayRemove, writeBatch
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

// Giữ khớp với FOLDER_SWATCHES ở library-helpers.js
const FOLDER_COLOR_HEX = {
    amber: '#f59e0b', pink: '#ec4899', red: '#ef4444', green: '#22c55e',
    blue: '#3b82f6', indigo: '#6366f1', purple: '#a855f7'
};

// Bảng màu + icon cho thẻ bộ đề, GIỮ KHỚP library-helpers.js để hai nơi nhìn như một
const QUIZ_ACCENTS = [
    { from: '#f472b6', to: '#f9a8d4', icon: 'fa-layer-group' },   // hồng phấn
    { from: '#b9a2f0', to: '#d8ccf7', icon: 'fa-book-open' },     // oải hương nhạt
    { from: '#5cbcef', to: '#a5dcf7', icon: 'fa-file-lines' },    // xanh trời
    { from: '#4cc79a', to: '#9be3c7', icon: 'fa-flask' },         // bạc hà
    { from: '#f2b53c', to: '#f8d98c', icon: 'fa-lightbulb' },     // vàng bơ
    { from: '#f59a6e', to: '#f9c4a8', icon: 'fa-brain' },         // hồng đào
    { from: '#f2708e', to: '#f8b0c0', icon: 'fa-heart-pulse' },   // hồng san hô
    { from: '#3fc4b4', to: '#93e0d6', icon: 'fa-microscope' },    // ngọc lam
];
function accentFor(seed) {
    const s = String(seed || '');
    let hash = 0;
    for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
    return { ...QUIZ_ACCENTS[hash % QUIZ_ACCENTS.length], paper: ['caro', 'dot', 'lined'][(hash >>> 3) % 3], tilt: (((hash >>> 5) % 7) - 3) * 0.2 };
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Mạng chập chờn (hoặc SDK Firestore kẹt trong vòng thử lại) không được để người xem
// ngồi nhìn khung chờ mãi — quá hạn thì báo rõ và mời tải lại.
function withTimeout(promise, ms = 12000) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Quá thời gian chờ')), ms))
    ]);
}

// ---------- Giao diện trang (2026-11-03): bìa hồ sơ đầu trang + các mục có tiêu đề, lớp .fp-* trong folder.html ----------
const $ = (id) => document.getElementById(id);
const fmtNum = (n) => Number(n || 0).toLocaleString('vi-VN');

/** Tô đầu trang: màu (--fc), icon, tên, tai hồ sơ, dòng phụ (HTML đã escape), các viên số liệu. */
function setHero({ hex, icon, name, tab, metaHTML, stats } = {}) {
    const hero = $('folder-header');
    if (hex) hero.style.setProperty('--fc', hex);
    if (tab) hero.dataset.tab = tab;
    if (icon) $('folder-icon').innerHTML = `<i class="fas ${escapeHtml(icon)}"></i>`;
    if (name != null) { $('folder-name').textContent = name; hero.dataset.ready = '1'; }
    if (metaHTML != null) $('folder-meta').innerHTML = metaHTML;
    if (stats) {
        $('folder-stats').innerHTML = stats.filter(s => s && s.n != null).map(s =>
            `<span class="fp-stat"><i class="fas ${s.icon}"></i><b data-n="${Number(s.n) || 0}">0</b> ${s.label}</span>`).join('');
        countUp($('folder-stats'));
    }
}
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// Số liệu đầu trang đếm tăng dần (~0,7 giây)
function countUp(root) {
    const els = [...root.querySelectorAll('b[data-n]')];
    if (reduceMotion()) { els.forEach(b => { b.textContent = fmtNum(b.dataset.n); }); return; }
    const t0 = performance.now();
    const step = (t) => {
        const k = Math.min(1, (t - t0) / 700), e = 1 - (1 - k) ** 3;
        els.forEach(b => { b.textContent = fmtNum(Math.round(b.dataset.n * e)); });
        if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}
const accessBadge = (kind) => kind === 'public'
    ? '<span class="fp-access is-public"><i class="fas fa-globe"></i> Công khai</span>'
    : kind === 'link' ? '<span class="fp-access is-once"><i class="fas fa-lock"></i> Link truy cập riêng</span>'
    : kind === 'owner' ? '<span class="fp-access is-owner"><i class="fas fa-crown"></i> Thư mục của bạn</span>'
    : '<span class="fp-access is-shared"><i class="fas fa-user-lock"></i> Chia sẻ riêng</span>';

// Nút "Sao chép link" (thanh trên) — CHỈ hiện cho chủ thư mục; người được chia sẻ và trang "Được chia sẻ với tôi" không có
function bindCopyLink() {
    const btn = $('fp-copy-link');
    if (!btn) return;
    btn.classList.remove('hidden');
    btn.addEventListener('click', async () => {
        const url = location.href;
        try {
            if (navigator.share && matchMedia('(pointer: coarse)').matches) {
                await navigator.share({ title: document.title, url });
                return;
            }
            await navigator.clipboard.writeText(url);
            btn.classList.add('is-done');
            btn.innerHTML = '<i class="fas fa-check"></i><span class="fp-btn-text">Đã sao chép</span>';
            setTimeout(() => {
                btn.classList.remove('is-done');
                btn.innerHTML = '<i class="fas fa-link"></i><span class="fp-btn-text">Sao chép link</span>';
            }, 1800);
        } catch (e) {
            if (e?.name !== 'AbortError') showToast('Không sao chép được — hãy copy đường dẫn trên thanh địa chỉ.', 'warning');
        }
    });
}

function showMessage(icon, title, desc) {
    const box = $('folder-message');
    // Lỗi trước khi biết thư mục là gì → đầu trang về dạng trung tính thay vì treo "Đang mở thư mục…"
    if (!$('folder-header').dataset.ready) {
        setHero({ hex: '#c9a2b5', icon: 'fa-folder-closed', name: 'Thư mục chia sẻ', metaHTML: 'Zitthenkne' });
    }
    $('folder-quiz-list').innerHTML = '';
    $('fp-quiz-head')?.classList.add('hidden');
    $('fp-no-match')?.classList.add('hidden');
    $('fp-more')?.classList.add('hidden');
    $('folder-message-icon').className = `fas ${icon}`;
    $('folder-message-title').textContent = title;
    $('folder-message-desc').textContent = desc;
    const req = $('folder-access-request');
    if (req) { req.innerHTML = ''; req.className = ''; }
    box.classList.remove('hidden');
}

// Bị chặn vì quyền (riêng tư / link công khai hết hạn) → khối "Gửi yêu cầu truy cập" (access-request.js)
function offerAccessRequest(folderId) {
    if (!folderId) return;
    import('./access-request.js').then(m => m.mountAccessRequest($('folder-access-request'), { kind: 'folder', id: folderId })).catch(() => {});
}

// Khung chờ: dùng đúng thẻ chờ của thư viện để hai màn hình đồng bộ
function renderSkeleton(n = 6) {
    document.getElementById('folder-quiz-list').innerHTML = Array.from({ length: n }).map(() => `
        <div class="quiz-skeleton-card">
            <div class="qs-top">
                <div class="skeleton-line qs-icon"></div>
                <div class="qs-lines">
                    <div class="skeleton-line h-3.5 w-4/5"></div>
                    <div class="skeleton-line h-2.5 w-2/5"></div>
                </div>
            </div>
            <div class="skeleton-line h-2 w-full rounded-full"></div>
            <div class="qs-foot">
                <div class="skeleton-line h-9 flex-1 rounded-xl"></div>
            </div>
        </div>`).join('');
}

// Thư mục con: cùng kiểu "bìa hồ sơ giấy" với thư viện (style.css), là link mở folder.html của nó
// `shared`: trang "Được chia sẻ với tôi" — thêm dòng "từ ai" và nút Rời chia sẻ / Lưu bản sao (xử lý ở bindSharedActions).
function renderSubFolders(folders, { shared = false, link = '' } = {}) {
    const box = document.getElementById('folder-sub-list');
    const section = $('fp-sub-section');
    if (!box) return;
    $('fp-sub-label').textContent = shared ? 'Thư mục được chia sẻ' : 'Thư mục con';
    $('fp-sub-count').textContent = folders.length || '';
    if (!folders.length) { section?.classList.add('hidden'); box.innerHTML = ''; return; }
    box.innerHTML = folders.map((f, i) => {
        const hex = (f.color || '').startsWith('#') ? f.color : (FOLDER_COLOR_HEX[f.color] || FOLDER_COLOR_HEX.amber);
        const name = escapeHtml(f.name || 'Thư mục');
        const sub = shared && f.sharedBy ? `từ ${escapeHtml(f.sharedBy)}` : 'Mở thư mục';
        const leave = shared
            ? `<button type="button" class="shared-leave-btn absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/80 text-gray-400 hover:text-red-500 text-xs" data-kind="folder" data-id="${escapeHtml(f.id)}" title="Rời chia sẻ (ẩn thư mục này khỏi danh sách của bạn)" aria-label="Rời chia sẻ"><i class="fas fa-right-from-bracket"></i></button>`
            : '';
        return `
        <a class="folder-mini-card relative" href="folder.html?id=${encodeURIComponent(f.id)}${link ? `&link=${encodeURIComponent(link)}` : ''}" data-tab="Thư mục" data-fill="2" style="--fc:${hex};--card-index:${Math.min(i, 12)}">
            <span class="fd-papers" aria-hidden="true"><i></i><i></i><i></i></span>
            <div class="folder-mini-card-content">
                <div class="folder-icon-wrapper"><i class="fas ${escapeHtml(f.icon || 'fa-folder')}"></i></div>
                <div class="min-w-0 flex-1"><h4 class="fd-name" title="${name}">${name}</h4><p class="folder-meta-time">${sub}</p></div>
            </div>
            ${leave}
        </a>`;
    }).join('');
    section?.classList.remove('hidden');
}

// ---------- Danh sách bộ đề = trang tem: tìm (bỏ dấu, tô sáng chữ khớp) + sắp xếp + lọc theo tiến độ + bốc thăm + tải dần ----------
const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
let quizView = { items: [], shared: false, link: '' };
let toolsBound = false;
let quizFilter = 'all';          // all | todo | done | weak
let viewList = [];               // danh sách sau tìm/lọc/sắp xếp
let shown = 0;                   // số tem đã vẽ (tải dần theo QUIZ_PAGE)
const QUIZ_PAGE = 24;

// Tiến độ làm bài — KHÔNG tốn lượt mạng: khách = kết quả lưu trên máy (local-shelf.js); đã đăng nhập = cache lịch sử mà
// thư viện đã đồng bộ (library-attempts.js, localStorage quizAttemptCache_<uid>). Máy chưa từng mở thư viện thì chưa có dấu.
let progMap = new Map();          // quizId -> { last, best, at, first, count }
let linkDone = new Map();         // link 1 thiết bị: nhật ký làm bài máy chủ ghi cho máy này (api/link.js 'folder' → done)
function buildProgress(items) {
    const uid = auth.currentUser?.uid;
    let att = {};
    try { att = (uid && JSON.parse(localStorage.getItem(`quizAttemptCache_${uid}`) || 'null')?.map) || {}; } catch (e) { /* hỏng cache → coi như chưa có */ }
    const guest = {};
    for (const r of listLocalResults()) {                 // mới nhất trước → lượt cuối vòng lặp là lượt đầu tiên
        const g = guest[r.quizId] || (guest[r.quizId] = { last: r, best: r, count: 0 });
        g.count++;
        g.first = r.completedAt || 0;
        if (r.percentage > g.best.percentage) g.best = r;
    }
    progMap = new Map();
    for (const q of items) {
        const g = guest[q.id], a = att[q.id], s = linkDone.get(q.id);
        let e = null;
        if (g || a) {
            const aPct = a && a.t ? Math.round(a.s / a.t * 100) : null;
            const gAt = g ? (g.last.completedAt || 0) : 0;
            const last = aPct != null && (!g || (a.at || 0) >= gAt) ? aPct : g ? Math.round(g.last.percentage) : 0;
            e = { last, best: Math.max(last, g ? Math.round(g.best.percentage) : 0), at: Math.max(gAt, a?.at || 0), first: g?.first || 0, count: g ? g.count : 0 };
        }
        if (s) {
            const sl = Math.round(s.last ?? 0), sb = Math.round(s.best ?? sl);
            e = !e ? { last: sl, best: sb, at: s.at || 0, first: s.first || 0, count: s.n || 0 }
                : { last: (s.at || 0) >= e.at ? sl : e.last, best: Math.max(e.best, sb), at: Math.max(e.at, s.at || 0),
                    first: Math.min(...[e.first, s.first].filter(Boolean)) || 0, count: Math.max(e.count, s.n || 0) };
        }
        if (e) progMap.set(q.id, e);
    }
}
const FILTERS = [
    ['all', 'Tất cả', 'fa-border-all', () => true],
    ['todo', 'Chưa làm', 'fa-envelope', (q) => !progMap.has(q.id)],
    ['done', 'Đã đóng dấu', 'fa-stamp', (q) => progMap.has(q.id)],
    ['weak', 'Cần ôn lại', 'fa-rotate-left', (q) => (progMap.get(q.id)?.last ?? 100) < 50]
];

function setQuizList(items, { shared = false, label, link = '' } = {}) {
    quizView = { items, shared, link };
    buildProgress(items);
    $('fp-quiz-label').textContent = label || (shared ? 'Bộ đề được chia sẻ' : 'Bộ đề');
    $('fp-quiz-head').classList.toggle('hidden', !items.length);
    $('fp-tools').classList.toggle('hidden', items.length <= 4);
    $('fp-bar').classList.toggle('hidden', items.length < 2);
    if (!FILTERS.some(f => f[0] === quizFilter && items.some(f[3]))) quizFilter = 'all';
    if (!toolsBound) bindQuizTools();
    applyView();
    drawAlbum(items);
    drawContinue(items);
    drawQuizList();
}

function bindQuizTools() {
    toolsBound = true;
    let t = 0;
    const search = $('fp-search');
    search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(drawQuizList, 120); });
    search.addEventListener('keydown', (e) => { if (e.key === 'Escape' && search.value) { search.value = ''; drawQuizList(); } });
    $('fp-sort').addEventListener('change', drawQuizList);
    // Phím "/" = nhảy vào ô tìm (như GitHub/YouTube)
    document.addEventListener('keydown', (e) => {
        if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || $('fp-tools').classList.contains('hidden')) return;
        if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
        e.preventDefault();
        search.focus();
    });
    $('fp-chips').addEventListener('click', (e) => {
        const b = e.target.closest('[data-filter]');
        if (!b || b.dataset.filter === quizFilter) return;
        quizFilter = b.dataset.filter;
        drawQuizList();
    });
    $('fp-view').addEventListener('click', (e) => {
        const b = e.target.closest('[data-view]');
        if (!b) return;
        try { localStorage.setItem('fpQuizView', b.dataset.view); } catch (err) { /* chế độ riêng tư */ }
        applyView();
    });
    $('fp-lucky').addEventListener('click', pickLucky);
    $('fp-root').addEventListener('click', (e) => {
        const c = e.target.closest('#fp-continue');
        if (c) revealQuiz(c.dataset.qid)?.querySelector('a.practice-btn')?.click();   // qua đúng đường bấm thẻ (link 1 thiết bị: chiếm suất trước)
    });
    $('fp-more-btn').addEventListener('click', () => moreQuizzes());
    if ('IntersectionObserver' in window) {
        new IntersectionObserver((es) => { if (es[0].isIntersecting) moreQuizzes(); }, { rootMargin: '700px 0px' }).observe($('fp-more'));
    }
}

function applyView() {
    let v = 'grid';
    try { v = localStorage.getItem('fpQuizView') === 'list' ? 'list' : 'grid'; } catch (e) { /* mặc định lưới */ }
    $('folder-quiz-list').classList.toggle('fp-compact', v === 'list');
    $('fp-view').querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
}

function drawQuizList() {
    const { items } = quizView;
    const raw = ($('fp-search').value || '').trim();
    const q = fold(raw);
    const sort = $('fp-sort').value;
    const pass = FILTERS.find(f => f[0] === quizFilter)[3];
    let list = items.filter(x => pass(x) && (!q || fold(x.title).includes(q)));
    const byTitle = (a, b) => (a.title || '').localeCompare(b.title || '', 'vi', { sensitivity: 'base' });
    if (sort === 'count') list.sort((a, b) => (b.questionCount || 0) - (a.questionCount || 0) || byTitle(a, b));
    else if (sort === 'few') list.sort((a, b) => (a.questionCount || 0) - (b.questionCount || 0) || byTitle(a, b));
    else list.sort(byTitle);
    const narrowed = q || quizFilter !== 'all';
    $('fp-quiz-count').textContent = items.length ? (narrowed ? `${list.length}/${items.length}` : items.length) : '';
    // Chip lọc chỉ có nghĩa khi đã có ít nhất một tem được đóng dấu
    const chips = $('fp-chips');
    chips.classList.toggle('hidden', !progMap.size);
    chips.innerHTML = FILTERS.map(([key, text, icon, fn]) => {
        const n = items.filter(fn).length;
        if (key !== 'all' && !n) return '';
        return `<button type="button" class="fp-chip${key === quizFilter ? ' is-on' : ''}" data-filter="${key}" aria-pressed="${key === quizFilter}"><i class="fas ${icon}"></i>${text}<b>${n}</b></button>`;
    }).join('');
    const none = $('fp-no-match');
    none.classList.toggle('hidden', !(narrowed && !list.length));
    if (narrowed && !list.length) none.textContent = q ? `Không có bộ đề nào khớp “${raw}”.` : 'Không có bộ đề nào trong mục này.';
    viewList = list;
    shown = 0;
    $('folder-quiz-list').innerHTML = '';
    moreQuizzes();
}

// Vẽ thêm một đợt tem (hoặc tới khi đủ `n` tem nữa). Vẽ nối đuôi → tem cũ không "nở" lại.
function moreQuizzes(n = QUIZ_PAGE) {
    if (shown >= viewList.length) return;
    const { shared, link } = quizView;
    const q = fold(($('fp-search').value || '').trim());
    const chunk = viewList.slice(shown, shown + Math.max(n, QUIZ_PAGE));
    $('folder-quiz-list').insertAdjacentHTML('beforeend', chunk.map((x, i) => quizCardHTML(x, i, { shared, link, q })).join(''));
    shown += chunk.length;
    const left = viewList.length - shown;
    $('fp-more').classList.toggle('hidden', left <= 0);
    $('fp-more-count').textContent = left;
}

const findCard = (qid) => [...$('folder-quiz-list').children].find(el => el.dataset.qid === qid);
// Đảm bảo tem của bộ đề đang nằm trên trang (bỏ lọc / tìm nếu nó bị ẩn, vẽ thêm nếu chưa tới lượt)
function revealQuiz(qid) {
    if (!viewList.some(x => x.id === qid)) { quizFilter = 'all'; $('fp-search').value = ''; drawQuizList(); }
    const idx = viewList.findIndex(x => x.id === qid);
    if (idx >= shown) moreQuizzes(idx + 1 - shown);
    return findCard(qid);
}

// "Bốc thăm 1 tem": ưu tiên bộ CHƯA làm trong danh sách đang xem → cuộn tới, tem lắc nhẹ + viền vàng
function pickLucky() {
    const todo = viewList.filter(x => !progMap.has(x.id));
    const pool = todo.length ? todo : viewList;
    if (!pool.length) return;
    const prev = $('folder-quiz-list').querySelector('.is-picked');
    let q = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1 && prev && prev.dataset.qid === q.id) q = pool[(pool.indexOf(q) + 1) % pool.length];
    const card = revealQuiz(q.id);
    if (card) spotlight(card, '★ Bốc trúng');
}
// Cuộn tới một tem, lắc nhẹ + viền vàng + nhãn nhỏ (bốc thăm / bấm từ nhật ký làm bài)
function spotlight(card, tag) {
    $('folder-quiz-list').querySelector('.is-picked')?.classList.remove('is-picked');
    card.classList.remove('is-picked');
    void card.offsetWidth;                 // trúng lại đúng tem đó vẫn lắc lại
    card.dataset.tag = tag;
    card.classList.add('is-picked');
    card.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' });
    setTimeout(() => card.querySelector('a.practice-btn')?.focus({ preventScroll: true }), 450);
}

// Sổ tem ở đầu trang: X/Y tem đã đóng dấu + thanh tiến độ răng cưa
function drawAlbum(items) {
    const box = $('fp-album');
    if (!items.length) { box.classList.add('hidden'); return; }
    const done = items.filter(q => progMap.has(q.id));
    const pct = Math.round(done.length / items.length * 100);
    const avg = done.length ? Math.round(done.reduce((s, q) => s + progMap.get(q.id).best, 0) / done.length) : null;
    box.innerHTML = `
        <div class="fp-album-row">
            <span><i class="fas fa-book-bookmark"></i> Sổ tem của bạn: <b>${done.length}</b>/${items.length} tem đã đóng dấu</span>
            ${avg != null ? `<span class="fp-score ${scoreClass(avg)}">điểm cao nhất TB ${avg}%</span>` : ''}
        </div>
        <div class="fp-album-bar" role="progressbar" aria-label="Tiến độ sưu tầm tem" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="--w:${pct}%"></span></div>
        ${done.length ? '' : '<p class="fp-album-hint">Làm xong một bộ đề là con tem đó được đóng dấu bưu điện kèm điểm.</p>'}`;
    box.classList.remove('hidden');
}

// Nút "Làm tiếp" ở đầu trang: bộ đề trong thư mục này được mở / làm gần nhất trên máy này
function drawContinue(items) {
    $('fp-continue')?.remove();
    let opened = {};
    try { opened = JSON.parse(localStorage.getItem('quizLastOpened') || '{}') || {}; } catch (e) { /* bỏ qua */ }
    let pick = null, latest = 0;
    for (const q of items) {
        const t = Math.max(opened[q.id] || 0, progMap.get(q.id)?.at || 0);
        if (t > latest) { latest = t; pick = q; }
    }
    if (!pick) return;
    const done = progMap.has(pick.id);
    const title = escapeHtml(pick.title || 'Không tên');
    $('fp-hero-actions').insertAdjacentHTML('beforeend', `
        <button type="button" id="fp-continue" class="fp-btn fp-btn-main fp-continue" data-qid="${escapeHtml(pick.id)}" title="${title}">
            <i class="fas ${done ? 'fa-rotate-right' : 'fa-play'}"></i>
            <span class="fp-continue-text"><small>${done ? 'Làm lại bộ gần nhất' : 'Làm tiếp bộ đang dở'}</small><span>${title}</span></span>
        </button>`);
}

// ---------- "HỒ SƠ CỦA BẠN": một dải ngắn — bạn là ai với thư mục này + vào khi nào ----------
// (thời điểm làm từng đề nằm ngay trên con tem; số đề đã làm nằm ở sổ tem đầu trang → không lặp lại ở đây)
// ctx = { chips: [[icon, HTML đã escape, title?]], token?, visitor?, group?, guest? }
// KHÔNG ghi chú kiểu "chủ link thấy…" / không hiện khu vực: chủ không muốn người mở biết mức dữ liệu được ghi.
const fmtDate = (t) => {
    const d = new Date(t), p = (n) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}${d.getFullYear() !== new Date().getFullYear() ? `/${d.getFullYear()}` : ''}`;
};
let meCtx = null;

function drawMe(ctx) {
    meCtx = ctx;
    const box = $('fp-me');
    if (!box) return;
    const hasGuest = ctx.guest && listLocalResults().some(r => quizView.items.some(q => q.id === r.quizId));
    const actions = [
        ctx.visitor ? `<button type="button" class="fp-me-act" data-act="unvisit"><i class="fas fa-user-pen"></i>${ctx.group ? 'Chọn lại tên' : 'Xoá lượt vào'}</button>` : '',
        ctx.guest ? `<a class="fp-me-act" href="../../index.html?next=${encodeURIComponent(location.href)}"><i class="fas fa-right-to-bracket"></i>Đăng nhập để lưu</a>` : '',
        hasGuest ? '<button type="button" class="fp-me-act is-danger" data-act="forget"><i class="fas fa-eraser"></i>Xoá kết quả trên máy</button>' : ''
    ].join('');
    box.innerHTML = `
        <span class="fp-me-badge fp-perf" aria-hidden="true"><i class="fas fa-id-card"></i></span>
        <div class="fp-me-chips">${ctx.chips.filter(c => c && c[1]).map(([icon, html, title]) =>
            `<span class="fp-me-chip"${title ? ` title="${escapeHtml(title)}"` : ''}><i class="fas ${icon}"></i>${html}</span>`).join('')}
            ${actions}</div>`;
    box.classList.remove('hidden');
    if (!box.dataset.bound) { box.dataset.bound = '1'; box.addEventListener('click', onMeClick); }
}

async function onMeClick(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act || !meCtx) return;
    if (act === 'unvisit') {
        const ok = await showConfirm(meCtx.group
            ? 'Xoá tên đã xưng trên máy này để chọn lại? Bạn chưa làm bài nên chưa mất suất nào.'
            : 'Xoá lượt vào xem của máy này? Bạn chưa làm bài nên chưa mất suất nào; mở lại link là vào lại được.',
            { title: meCtx.group ? 'Chọn lại tên?' : 'Xoá lượt vào?', confirmText: meCtx.group ? 'Chọn lại' : 'Xoá', cancelText: 'Hủy' });
        if (!ok) return;
        try {
            const r = await linkApi('unvisit', { token: meCtx.token });
            if (!r.ok) { showToast('Máy này đã làm bài (đã giữ suất) — muốn đổi tên hãy nhờ chủ link.', 'warning'); return; }
            location.replace(`link.html?t=${encodeURIComponent(meCtx.token)}`);
        } catch (err) { showToast('Mạng đang chậm, thử lại nhé.', 'error'); }
        return;
    }
    if (act === 'forget') {
        const ok = await showConfirm('Xoá kết quả làm bài các bộ đề trong thư mục này đang lưu trên trình duyệt này? (Không ảnh hưởng bộ đề gốc.)',
            { title: 'Xoá kết quả trên máy?', confirmText: 'Xoá', cancelText: 'Hủy', tone: 'danger' });
        if (!ok) return;
        const n = forgetLocalResults(quizView.items.map(q => q.id));
        setQuizList(quizView.items, { shared: quizView.shared, link: quizView.link, label: $('fp-quiz-label').textContent });
        drawMe(meCtx);
        showToast(`Đã xoá ${n} lượt làm bài trên máy này.`, 'success');
    }
}
function scoreClass(p) { return p >= 80 ? 'is-good' : p >= 50 ? 'is-mid' : 'is-low'; }

// Tô sáng phần tên khớp ô tìm (so khớp bỏ dấu → đổi vị trí về chuỗi gốc)
function markTitle(title, q) {
    if (!q) return escapeHtml(title);
    let f = '';
    const map = [];
    for (let i = 0; i < title.length; i++) for (const c of fold(title[i])) { f += c; map.push(i); }
    const at = f.indexOf(q);
    if (at < 0) return escapeHtml(title);
    const s = map[at], e = map[at + q.length - 1] + 1;
    return `${escapeHtml(title.slice(0, s))}<mark class="fp-mark">${escapeHtml(title.slice(s, e))}</mark>${escapeHtml(title.slice(e))}`;
}

function quizCardHTML(q, i, { shared = false, link = '', q: query = '' } = {}) {
        // Mở từ link riêng / nhóm: gắn &link để nộp bài báo điểm cho chủ link (link-progress.js)
        const lq = link ? `&link=${encodeURIComponent(link)}` : '';
        const a = accentFor(q.id);
        const rawTitle = q.title || 'Không tên';
        const title = escapeHtml(rawTitle);
        const n = q.questionCount || 0;
        // Đã làm (trên máy này / lịch sử tài khoản) → tem bị đóng dấu bưu điện kèm điểm, nút thành "Làm lại"
        const p = progMap.get(q.id);
        const tip = p ? `${p.count ? `Đã làm ${p.count} lần · ` : ''}gần nhất ${p.last}% · cao nhất ${p.best}%` : '';
        return `
        <div class="quiz-grid-card${p ? ' is-stamped' : ''}" data-qid="${escapeHtml(q.id)}" data-paper="${a.paper}" style="--qc-from:${a.from};--qc-to:${a.to};--qc-tilt:${a.tilt}deg;--card-index:${Math.min(i, 12)}">
            <span class="qc-rail" aria-hidden="true"></span>
            <span class="fp-sheen" aria-hidden="true"></span>
            <span class="fp-denom" title="${n} câu hỏi"><b>${n}</b>câu</span>
            ${p ? `<span class="fp-cancel ${scoreClass(p.best)}" title="${tip}"><b>${p.best}%</b><small>đã làm</small></span>` : ''}
            <div class="qc-top">
                <span class="quiz-card-icon" aria-hidden="true">
                    <i class="fas ${a.icon}"></i>
                </span>
                <div class="qc-head">
                    <h3 class="qc-title" title="${title}"><a href="quiz.html?id=${q.id}${lq}">${markTitle(rawTitle, query)}</a></h3>
                    <p class="qc-meta">
                        ${p ? `<span class="fp-score ${scoreClass(p.last)}" title="${tip}"><i class="fas fa-clock-rotate-left"></i>${p.last}%${p.at ? ` · ${fmtAgo(p.at)}` : ''}</span>`
                            : '<span class="fp-fresh"><i class="fas fa-wand-magic-sparkles"></i>Tem mới</span>'}
                        ${shared && q.sharedBy ? `<span class="qc-meta-item"><i class="fas fa-user"></i>từ ${escapeHtml(q.sharedBy)}</span>` : ''}
                        ${shared ? `<span class="qc-meta-item"><i class="fas ${canEdit(q) ? 'fa-pen' : 'fa-eye'}"></i>${canEdit(q) ? 'Người chỉnh sửa' : 'Người xem'}</span>` : ''}
                    </p>
                </div>
            </div>
            <div class="qc-foot">
                <a href="quiz.html?id=${q.id}${lq}" class="practice-btn"><i class="fas ${p ? 'fa-rotate-right' : 'fa-play'}"></i><span>${p ? 'Làm lại' : 'Làm bài'}</span></a>
                ${shared && canEdit(q) ? `
                <a href="../editor/editor.html?id=${encodeURIComponent(q.id)}" class="practice-btn" style="flex:0 0 auto" title="Sửa câu hỏi (bạn là Người chỉnh sửa)"><i class="fas fa-pen"></i></a>` : ''}
                ${shared && q.allowTakeout === true ? `
                <button type="button" class="shared-copy-btn practice-btn" style="flex:0 0 auto" data-id="${escapeHtml(q.id)}" title="Lưu một bản sao vào thư viện của bạn (sửa được, không ảnh hưởng bản gốc)"><i class="fas fa-copy"></i></button>` : ''}
                ${shared ? `
                <button type="button" class="shared-leave-btn practice-btn" style="flex:0 0 auto" data-kind="quiz" data-id="${escapeHtml(q.id)}" title="Rời chia sẻ (ẩn bộ đề này khỏi danh sách của bạn)"><i class="fas fa-right-from-bracket"></i></button>` : ''}
            </div>
        </div>`;
}

// Trang này chỉ liệt kê bộ đề (tên + số câu) → REST có chọn trường (SDK kéo NGUYÊN mỗi bộ đề kèm mảng câu hỏi).
const SET_META = ['title', 'questionCount', 'createdAt', 'folderId', 'isPublic', 'deleted', 'deletedAt'];

/** Thư mục công khai còn hạn: { status, folder, subFolders, quizzes } từ máy chủ (api/public.js). 410 = hết hạn, 404 = không có / riêng tư. */
async function fetchPublicFolder(folderId) {
    const r = await fetch(apiUrl(`api/public?kind=folder&id=${encodeURIComponent(folderId)}`), { cache: 'no-store' });
    const data = await r.json().catch(() => ({}));
    if (r.status === 410) return { status: 'expired' };
    if (!r.ok) throw new Error(data.error || data.status || `HTTP ${r.status}`);
    return data;
}

function showExpired() {
    showMessage('fa-clock', 'Link đã hết hạn',
        'Link công khai của thư mục này đã hết hạn. Nhờ chủ thư mục mở Chia sẻ để gia hạn (hoặc chia sẻ riêng cho email của bạn).');
}

// Mọi bộ đề + thư mục chia sẻ riêng cho tài khoản đang đăng nhập (chỉ vài trường mô tả). Rule đòi truy vấn có đúng điều kiện này.
async function fetchSharedWithMe(email) {
    const mine = [['sharedWith', email, 'ARRAY_CONTAINS']];
    const [sets, folders] = await Promise.all([
        runQueryRest({ collection: 'quiz_sets', where: mine, select: [...SET_META, 'userId', 'sharedBy', 'editors', 'allowTakeout'], requireUser: true }),
        runQueryRest({ collection: 'quiz_folders', where: mine, select: ['name', 'color', 'icon', 'parentId', 'deleted', 'userId', 'sharedBy'], requireUser: true })
    ]);
    // total đếm CẢ mục trong thùng rác — khớp truy vấn đếm của shared-inbox.js (chấm "mục mới")
    return { sets: sets.filter(q => !q.deleted), folders: folders.filter(f => !f.deleted), total: sets.length + folders.length };
}

// Người đang đăng nhập có nhận chia sẻ riêng được không. null = chưa đăng nhập; { email, verified, uid }.
// checkVerify: email chưa xác nhận thì hỏi lại máy chủ (1 lượt mạng) — chỉ làm khi thật cần, không làm chậm thư mục công khai.
async function viewer({ checkVerify = true } = {}) {
    const u = await whenAuthReady(4000);
    if (!u || !u.email || u.offline) return null;
    const verified = u.emailVerified || (checkVerify && await refreshEmailVerified({ force: true }));
    return { email: u.email.toLowerCase(), verified: !!verified, uid: u.uid };
}

const byName = (a, b) => (a.name || a.title || '').localeCompare(b.name || b.title || '', 'vi', { sensitivity: 'base' });

// Email (đã xác nhận) của người đang xem — để biết mình là Người chỉnh sửa của bộ đề nào (khớp firestore.rules editsAsEditor).
let viewerEmail = '';
const canEdit = (q) => !!viewerEmail && Array.isArray(q.editors) && q.editors.includes(viewerEmail);

// ---------- Kệ "Trên máy này" (local-shelf.js) — có cả khi chưa đăng nhập ----------
function fmtAgo(ms) {
    const s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 60) return 'vừa xong';
    if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
    if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
    if (s < 86400 * 30) return `${Math.floor(s / 86400)} ngày trước`;
    return new Date(ms).toLocaleDateString('vi-VN');
}
function renderShelf(excludeIds = new Set()) {
    const box = document.getElementById('local-shelf');
    const list = document.getElementById('local-shelf-list');
    if (!box || !list) return;
    const items = listShelf().filter(x => !excludeIds.has(x.id));
    box.classList.remove('hidden');
    $('local-shelf-clear')?.classList.toggle('hidden', !items.some(x => !x.pinned));
    if (!items.length) {
        list.innerHTML = `<p class="fp-shelf-empty" style="grid-column:1/-1"><i class="fas fa-inbox mr-1.5"></i>Chưa mở bộ đề / thư mục nào của người khác trên máy này. Mở một link chia sẻ là nó hiện ở đây.</p>`;
        return;
    }
    list.innerHTML = items.map(it => {
        const href = it.kind === 'folder'
            ? `folder.html?id=${encodeURIComponent(it.id)}${it.link ? `&link=${encodeURIComponent(it.link)}` : ''}`
            : `quiz.html?id=${encodeURIComponent(it.id)}`;
        const st = it.kind === 'quiz' ? localStatsFor(it.id) : null;
        const meta = [
            it.kind === 'folder' ? 'Thư mục' : (it.count ? `${it.count} câu` : 'Bộ đề'),
            it.ownerName ? `từ ${escapeHtml(it.ownerName)}` : '',
            it.access === 'public' ? 'Công khai' : it.access === 'shared' ? 'Chia sẻ riêng' : it.access === 'link' ? 'Link truy cập riêng' : '',
            `mở ${fmtAgo(it.openedAt || 0)}`,
            st ? `làm ${st.count} lần · gần nhất ${Math.round(st.last.percentage)}% · cao nhất ${Math.round(st.best.percentage)}%` : ''
        ].filter(Boolean).join(' · ');
        const isFolder = it.kind === 'folder';
        return `
        <div class="fp-shelf-item">
            <span class="fp-shelf-ic ${isFolder ? 'is-folder' : 'is-quiz'}"><i class="fas ${isFolder ? 'fa-folder-open' : 'fa-file-lines'}"></i></span>
            <a href="${href}" class="fp-shelf-main">
                <span class="fp-shelf-title">${it.pinned ? '<i class="fas fa-thumbtack"></i>' : ''}${escapeHtml(it.title || 'Không tên')}</span>
                <span class="fp-shelf-meta" title="${meta}">${meta}</span>
            </a>
            <button type="button" class="shelf-pin-btn fp-icon-btn${it.pinned ? ' is-on' : ''}" data-kind="${it.kind}" data-id="${escapeHtml(it.id)}" title="${it.pinned ? 'Bỏ ghim' : 'Ghim lên đầu'}" aria-label="${it.pinned ? 'Bỏ ghim' : 'Ghim lên đầu'}"><i class="fas fa-thumbtack"></i></button>
            <button type="button" class="shelf-forget-btn fp-icon-btn is-danger" data-kind="${it.kind}" data-id="${escapeHtml(it.id)}" title="Xóa khỏi máy này (không ảnh hưởng bản gốc)" aria-label="Xóa khỏi máy này"><i class="fas fa-xmark"></i></button>
        </div>`;
    }).join('');
}
let shelfBound = false;
function bindShelf(excludeIds) {
    if (shelfBound) return;
    shelfBound = true;
    document.getElementById('local-shelf')?.addEventListener('click', async (e) => {
        const pin = e.target.closest('.shelf-pin-btn');
        const forget = e.target.closest('.shelf-forget-btn');
        const clear = e.target.closest('#local-shelf-clear');
        if (pin) togglePinShelf(pin.dataset.kind, pin.dataset.id);
        else if (forget) forgetShelf(forget.dataset.kind, forget.dataset.id);
        else if (clear) {
            const ok = await showConfirm('Xóa mọi mục CHƯA GHIM khỏi danh sách trên máy này? (Bản gốc và kết quả làm bài không bị ảnh hưởng.)',
                { title: 'Dọn danh sách?', confirmText: 'Dọn', cancelText: 'Hủy', tone: 'danger' });
            if (!ok) return;
            clearShelf();
        } else return;
        renderShelf(excludeIds);
    });
}

async function sharedWithMePage() {
    document.title = 'Được chia sẻ với tôi - Zitthenkne';
    setHero({ hex: '#ec5f95', icon: 'fa-user-group', name: 'Được chia sẻ với tôi', tab: 'Hộp thư chia sẻ',
        metaHTML: '<i class="fas fa-circle-notch fa-spin"></i> Đang kiểm tra tài khoản…' });
    renderSkeleton();
    const me = await viewer();
    // Không có tài khoản / chưa xác nhận email: vẫn quản lý được những gì đã mở trên máy này (kệ cục bộ)
    if (!me || !me.verified) {
        document.getElementById('folder-quiz-list').innerHTML = '';
        setHero({ metaHTML: me ? `<i class="fas fa-envelope"></i> ${escapeHtml(me.email)} · chưa xác nhận email`
            : '<i class="fas fa-laptop"></i> Chưa đăng nhập · dữ liệu lưu trên trình duyệt này' });
        const note = document.getElementById('shared-account-note');
        if (note) {
            note.innerHTML = !me
                ? `<i class="fas fa-circle-info"></i><span>Đăng nhập để xem bộ đề / thư mục được <b>chia sẻ riêng</b> cho email của bạn và đồng bộ kết quả làm bài. <a href="../../index.html?next=${encodeURIComponent(location.href)}">Đăng nhập ngay</a></span>`
                : `<i class="fas fa-circle-info"></i><span>Xác nhận email <b>${escapeHtml(me.email)}</b> (trang <a href="../profile/profile.html">Hồ sơ</a> → Gửi mail xác nhận) để thấy mục được chia sẻ riêng cho bạn.</span>`;
            note.classList.remove('hidden');
        }
        renderShelf();
        bindShelf(new Set());
        return;
    }
    viewerEmail = me.email;
    let data;
    try { data = await withTimeout(fetchSharedWithMe(me.email)); }
    catch (err) {
        console.error('Lỗi tải mục được chia sẻ:', err);
        showMessage('fa-triangle-exclamation', 'Không tải được', 'Thử tải lại trang giúp mình nhé.');
        return;
    }
    const draw = () => {
        // Chỉ hiện mục GỐC: thư mục có cha cũng được chia sẻ cho mình thì nằm bên trong cha, không lặp ra ngoài.
        const folderIds = new Set(data.folders.map(f => f.id));
        const topFolders = data.folders.filter(f => !folderIds.has(f.parentId)).sort(byName);
        const looseSets = data.sets.filter(q => !folderIds.has(q.folderId)).sort(byName);
        setHero({
            metaHTML: `<i class="fas fa-envelope"></i> ${escapeHtml(me.email)}`,
            stats: [
                { icon: 'fa-folder', n: topFolders.length, label: 'thư mục' },
                { icon: 'fa-file-lines', n: looseSets.length, label: 'bộ đề' }
            ]
        });
        document.getElementById('folder-message').classList.add('hidden');
        renderSubFolders(topFolders, { shared: true });
        if (!topFolders.length && !looseSets.length) {
            setQuizList([], { shared: true });
            showMessage('fa-inbox', 'Chưa có gì được chia sẻ', `Khi ai đó chia sẻ riêng bộ đề/thư mục cho ${me.email}, chúng sẽ hiện ở đây.`);
            return;
        }
        setQuizList(looseSets, { shared: true });
    };
    draw();
    markSharedSeen(me.uid, data.total);
    bindSharedActions(me, data, draw);
    // Kệ "Trên máy này": chỉ những gì CHƯA nằm trong danh sách chia sẻ riêng ở trên (vd. link công khai đã mở)
    const listed = new Set([...data.sets.map(q => q.id), ...data.folders.map(f => f.id)]);
    renderShelf(listed);
    bindShelf(listed);
}

// Nút trên trang "Được chia sẻ với tôi". Ghi bằng SDK (cần mạng): rời chia sẻ = gỡ email mình khỏi sharedWith (firestore.rules leavesShare);
// rời một thư mục = gỡ khỏi cả nhánh đang chia sẻ cho mình, không thì bộ đề bên trong vẫn hiện lẻ ra ngoài.
let actionsBound = false;
function bindSharedActions(me, data, redraw) {
    if (actionsBound) return;
    actionsBound = true;
    const root = document.getElementById('fp-root') || document.body;
    root.addEventListener('click', async (e) => {
        const leaveBtn = e.target.closest('.shared-leave-btn');
        const copyBtn = e.target.closest('.shared-copy-btn');
        if (!leaveBtn && !copyBtn) return;
        e.preventDefault();
        e.stopPropagation();
        const btn = leaveBtn || copyBtn;
        if (btn.disabled) return;
        if (leaveBtn) {
            const { kind, id } = leaveBtn.dataset;
            const item = kind === 'folder' ? data.folders.find(f => f.id === id) : data.sets.find(q => q.id === id);
            const name = item?.name || item?.title || 'mục này';
            const ok = await showConfirm(`"${name}" sẽ biến khỏi danh sách của bạn và bạn không mở được nữa (trừ khi được chia sẻ lại).`,
                { title: 'Rời chia sẻ?', confirmText: 'Rời', cancelText: 'Hủy', tone: 'danger' });
            if (!ok) return;
            btn.disabled = true;
            let folderIds = new Set(), setIds = new Set([id]);
            if (kind === 'folder') {
                folderIds = new Set([id]);
                let grew = true;
                while (grew) {                       // gom cả nhánh trong những gì đang chia sẻ cho mình
                    grew = false;
                    data.folders.forEach(f => { if (folderIds.has(f.parentId) && !folderIds.has(f.id)) { folderIds.add(f.id); grew = true; } });
                }
                setIds = new Set(data.sets.filter(q => folderIds.has(q.folderId)).map(q => q.id));
            }
            // Một lô (nguyên tử, một lượt mạng; ≤ 450 thao tác mỗi lô)
            // Gỡ khỏi cả editors: luật leavesShare đòi editors mới == editors cũ trừ đúng mình (không có trường thì arrayRemove tạo [] — vẫn khớp)
            const patch = { sharedWith: arrayRemove(me.email), editors: arrayRemove(me.email) };
            const refs = [...[...folderIds].map(fid => doc(db, 'quiz_folders', fid)), ...[...setIds].map(sid => doc(db, 'quiz_sets', sid))];
            try {
                for (let i = 0; i < refs.length; i += 450) {
                    const batch = writeBatch(db);
                    refs.slice(i, i + 450).forEach(r => batch.update(r, patch));
                    await withTimeout(batch.commit());
                }
            } catch (err) {
                console.error('Lỗi rời chia sẻ:', err);
                btn.disabled = false;
                showToast('Không rời được: ' + (err.code === 'permission-denied' ? 'máy chủ chưa cho phép (cần cập nhật luật Firestore).' : err.message), 'error');
                return;
            }
            data.folders = data.folders.filter(f => !folderIds.has(f.id));
            data.sets = data.sets.filter(q => !setIds.has(q.id));
            if (Number.isFinite(data.total)) {
                data.total -= folderIds.size + setIds.size;
                markSharedSeen(me.uid, Math.max(0, data.total));
            }
            forgetShelf(kind, id);
            redraw();
            showToast(`Đã rời chia sẻ "${name}".`, 'success');
            return;
        }
        // Lưu bản sao: chép câu hỏi sang một bộ đề MỚI của mình (riêng tư, ở Thư viện gốc) — bản gốc không bị đụng tới.
        if (!await requireFeature('create', { label: 'Lưu bản sao' })) return;      // bộ đề mới cần tính năng "Tạo đề" (core/features.js)
        btn.disabled = true;
        try {
            const snap = await getDoc(doc(db, 'quiz_sets', copyBtn.dataset.id));
            if (!snap.exists()) throw new Error('Không tìm thấy bộ đề.');
            const src = snap.data();
            const questions = Array.isArray(src.questions) ? src.questions : [];
            const ref = doc(collection(db, 'quiz_sets'));
            await setDoc(ref, {
                userId: me.uid,
                title: `${src.title || 'Không tên'} (bản sao)`,
                questions,
                questionCount: questions.length,
                folderId: null,
                isPublic: false,
                copiedFrom: copyBtn.dataset.id,     // luật copyAllowed: gốc phải cho "mang đề đi"
                createdAt: new Date(),
                updatedAt: new Date()
            });
            showToast(`Đã lưu "${src.title || 'bộ đề'}" vào thư viện của bạn.`, 'success', 4000);
        } catch (err) {
            console.error('Lỗi lưu bản sao:', err);
            showToast('Không lưu được bản sao: ' + err.message, 'error');
        } finally { btn.disabled = false; }
    });
}

// ---------- LINK DÙNG CHO 1 THIẾT BỊ (folder.html?id=…&link=<mã>, api/link.js) ----------
// Thư mục vẫn riêng tư: máy chủ kiểm máy này đang giữ link, trả nội dung + cấp quyền đọc các bộ đề bên trong (firestore.rules linkGranted).
// Máy mới chỉ VÀO XEM (status 'visitor'): duyệt thư mục không tốn suất; bấm làm một bộ đề → startLinkQuiz chiếm suất rồi mới mở đề.
async function linkApi(action, extra) {
    const u = auth.currentUser;
    const r = await withTimeout(fetch(apiUrl('api/link'), {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await u.getIdToken()}` },
        body: JSON.stringify({ action, ...extra })
    }));
    return r.json().catch(() => ({}));
}
async function startLinkQuiz(token, folderId, href, btn) {
    if (btn) btn.style.pointerEvents = 'none';
    try {
        const c = await linkApi('claim', { token, label: deviceLabel() });
        // Tên đã xưng lúc vào xem vừa bị máy khác làm bài trước (whoTaken…) → về trang cổng chọn lại tên, kèm lý do
        const why = ['whoTaken', 'notMember'].includes(c.status) ? `&why=${c.status}` : '';
        if (c.status !== 'mine' && c.status !== 'owner') { location.replace(`link.html?t=${encodeURIComponent(token)}${why}`); return; }
        await linkApi('folder', { token, folderId });          // giờ đã giữ suất → cấp quyền đọc các bộ đề của thư mục này
        location.href = href;
    } catch (e) {
        showToast('Mạng đang chậm, chưa mở được bộ đề. Thử lại nhé.', 'error');
        if (btn) btn.style.pointerEvents = '';
    }
}
async function linkFolderPage(token, folderId) {
    renderSkeleton();
    try { await auth.authStateReady(); } catch (e) {}
    const u = auth.currentUser;
    // Trình duyệt này chưa nhận link → về trang cổng (nhận lần đầu / báo link đã dùng ở máy khác)
    if (!u) { location.replace(`link.html?t=${encodeURIComponent(token)}`); return; }
    let data;
    try {
        const r = await withTimeout(fetch(apiUrl('api/link'), {
            method: 'POST', cache: 'no-store',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await u.getIdToken()}` },
            body: JSON.stringify({ action: 'folder', token, folderId })
        }));
        data = await r.json().catch(() => ({}));
    } catch (err) {
        showMessage('fa-wifi', 'Mạng đang chậm', 'Chưa tải được thư mục. Kiểm tra kết nối rồi tải lại trang giúp mình nhé.');
        return;
    }
    const st = data.status;
    // Chưa nhận / hết suất / hết hạn / thu hồi / bị gỡ → trang cổng (báo đúng lý do + nút Gửi yêu cầu truy cập)
    if (['unclaimed', 'taken', 'expired', 'revoked', 'blocked'].includes(st)) { location.replace(`link.html?t=${encodeURIComponent(token)}`); return; }
    if (!['mine', 'owner', 'visitor'].includes(st)) {
        showMessage('fa-link-slash', 'Link không còn hiệu lực', data.error || 'Link đã bị xóa, hoặc thư mục đã bị xóa.');
        return;
    }
    const f = data.folder || {};
    const hex = (f.color || '').startsWith('#') ? f.color : (FOLDER_COLOR_HEX[f.color] || FOLDER_COLOR_HEX.amber);
    // Link riêng / nhóm: nêu kiểu link + tên link + giới hạn thiết bị, KHÔNG nêu người gửi
    pageAccess = 'link';
    pageOwner = '';
    const L = data.link || {};
    const kindLabel = L.group ? 'Link truy cập nhóm' : 'Link truy cập riêng';
    const left = data.expiresAt ? Math.max(0, data.expiresAt - Date.now()) / 3600000 : null;
    const span = (icon, html) => `<span><i class="fas ${icon} mr-1"></i>${html}</span>`;
    setHero({
        hex, icon: f.icon || 'fa-folder-open', name: f.name || 'Thư mục', tab: kindLabel,
        metaHTML: `<span class="fp-access is-once"><i class="fas ${L.group ? 'fa-users' : 'fa-lock'}"></i> ${kindLabel}${L.name ? ` · ${escapeHtml(L.name)}` : ''}</span>`
            + (L.who && !data.me ? span('fa-user-check', `Đã xác nhận: <b>${escapeHtml(L.who)}</b>`) : '')
            + (st === 'mine' ? span('fa-mobile-screen', L.group ? '1 thiết bị / người' : `${L.maxUses || 1} thiết bị`) : '')
            + (st === 'visitor' ? span('fa-eye', 'Đang xem · bắt đầu làm bài mới gắn link với thiết bị này') : '')
            + (left == null ? '' : span('fa-clock', left < 48 ? `còn ${Math.max(1, Math.round(left))} giờ` : `còn ${Math.round(left / 24)} ngày`))
    });
    document.title = `${f.name || 'Thư mục'} - Zitthenkne`;
    // Thư mục con: nút quay lên thư mục cha (vẫn trong nhánh của link)
    if (f.parentId) {
        $('fp-hero-actions').innerHTML = `<a class="fp-btn" href="folder.html?id=${encodeURIComponent(f.parentId)}&link=${encodeURIComponent(token)}"><i class="fas fa-arrow-up"></i> Thư mục cha</a>`;
    }
    if (st !== 'owner' && (folderId || data.root) === data.root) {
        rememberOpened({ kind: 'folder', id: f.id, title: f.name, ownerName: '', access: 'link', link: token });
    }
    linkDone = new Map((data.done || []).map(d => [d.quizId, d]));
    finishFolderPage(data.subFolders || [], data.quizzes || [], { link: token });
    const m = data.me;
    if (m) drawMe({
        token, visitor: st === 'visitor', group: !!L.group,
        chips: [
            ['fa-user-check', `<b>${escapeHtml(m.who || (m.anon ? 'Máy ẩn danh' : m.email))}</b>`, m.who ? (m.anon ? 'Chưa đăng nhập' : m.email) : ''],
            ['fa-laptop', escapeHtml(m.label)],
            ['fa-door-open', m.first ? `Vào ${fmtDate(m.first)}` : ''],
            st === 'mine' ? ['fa-ticket', m.claimed ? `Giữ suất từ ${fmtDate(m.claimed)}` : ''] : null
        ]
    });    // Mới vào xem: bấm làm bộ đề → chiếm suất trước (chưa giữ suất thì chưa có quyền đọc đề)
    if (st === 'visitor') {
        if (L.back && (folderId || data.root) === data.root) {
            const max = L.maxUses || 1;
            showToast(`Thiết bị này đã từng vào link nhưng chưa làm bài, nên chưa mất suất nào (còn ${Math.max(0, max - (L.used || 0))}/${max} suất). Bắt đầu làm một bộ đề mới tính 1 suất.`, 'info', 7000);
        }
        $('folder-quiz-list')?.addEventListener('click', (e) => {
            const a = e.target.closest('a[href^="quiz.html"]');
            if (!a) return;
            e.preventDefault();
            startLinkQuiz(token, f.id, a.getAttribute('href'), a);
        });
    }
}

async function main() {
    const params = new URLSearchParams(location.search);
    if (params.get('shared') === 'me') return sharedWithMePage();
    const folderId = params.get('id');
    const linkToken = (params.get('link') || '').replace(/[^\w-]/g, '').slice(0, 64);
    if (linkToken) return linkFolderPage(linkToken, folderId);
    if (!folderId) {
        showMessage('fa-link-slash', 'Thiếu mã thư mục', 'Đường dẫn không hợp lệ. Hãy xin lại link chia sẻ nhé.');
        return;
    }

    renderSkeleton();

    // Đọc thư mục SONG SONG với việc khôi phục phiên: SDK Firestore tự đợi Auth sẵn sàng rồi mới gửi kèm token (thư mục chia sẻ riêng
    // cần token của người được mời), còn thư mục công khai thì không phải chờ thêm bước kiểm tra email nào.
    const meP = viewer({ checkVerify: false }).catch(() => null);
    const readFolder = async () => {
        try {
            const snap = await withTimeout(getDoc(doc(db, 'quiz_folders', folderId)));
            return snap.exists() ? { id: snap.id, ...snap.data() } : null;
        } catch (err) {
            // Rule chặn đọc = chưa công khai / chưa chia sẻ cho mình (xử lý chung ở dưới); quá hạn thì báo riêng
            if (err && err.message === 'Quá thời gian chờ') throw err;
            return null;
        }
    };
    let folder, me;
    try { [folder, me] = await Promise.all([readFolder(), meP]); }
    catch (err) {
        showMessage('fa-wifi', 'Mạng đang chậm', 'Chưa tải được thư mục. Kiểm tra kết nối rồi tải lại trang giúp mình nhé.');
        return;
    }
    // Không đọc được mà email chưa xác nhận: có thể vừa bấm link xác nhận ở tab khác → hỏi lại máy chủ, xác nhận rồi thì thử đọc lại một lần
    if (!folder && me && !me.verified && await refreshEmailVerified({ force: true })) {
        me.verified = true;
        folder = await readFolder().catch(() => null);
    }

    if (!folder || folder.deleted) {
        // Link công khai hết hạn? (luật chỉ báo "không có quyền" — máy chủ phân biệt được)
        if (!folder) {
            try { if ((await fetchPublicFolder(folderId)).status === 'expired') { showExpired(); return offerAccessRequest(folderId); } } catch (e) { /* không rõ → báo chung */ }
        }
        showMessage('fa-lock', 'Không mở được thư mục này',
            !me ? 'Thư mục không tồn tại, đã bị xóa, hoặc chỉ chia sẻ riêng — nếu được mời, hãy đăng nhập đúng email được chia sẻ ở trang chủ rồi mở lại link.'
                : !me.verified ? `Nếu thư mục được chia sẻ riêng cho ${me.email}, bạn cần xác nhận email trước (trang Hồ sơ → Gửi mail xác nhận), rồi tải lại trang.`
                : `Thư mục không tồn tại, đã bị xóa, hoặc chưa được chia sẻ cho ${me.email}.`);
        if (!folder) offerAccessRequest(folderId);
        return;
    }
    // Đọc được mà không công khai = mình là chủ hoặc được chia sẻ riêng → lấy nội dung theo đường tương ứng (lọc isPublic sẽ ra rỗng).
    const privateMode = folder.isPublic !== true;

    // Tô đầu trang theo màu & icon thật của thư mục
    const hex = (folder.color || '').startsWith('#')
        ? folder.color
        : (FOLDER_COLOR_HEX[folder.color] || FOLDER_COLOR_HEX.amber);
    const isOwner = !!me && folder.userId === me.uid;
    pageAccess = isOwner ? 'owner' : privateMode ? 'shared' : 'public';
    pageOwner = isOwner ? '' : (folder.sharedBy || '');
    setHero({ hex, icon: folder.icon || 'fa-folder-open', name: folder.name || 'Thư mục',
        tab: isOwner ? 'Thư mục của bạn' : 'Thư mục chia sẻ', metaHTML: heroMeta() });
    document.title = `${folder.name || 'Thư mục'} - Zitthenkne`;
    // Chỉ CHỦ thư mục có nút sao chép link — người được chia sẻ không có lối phát tán link ra tiếp từ giao diện
    if (isOwner) bindCopyLink();

    if (me?.verified) viewerEmail = me.email;
    // Thư mục của người khác (công khai hoặc chia sẻ riêng) → lên kệ "Trên máy này", kể cả khi chưa đăng nhập
    if (!isOwner) rememberOpened({ kind: 'folder', id: folderId, title: folder.name, ownerName: folder.sharedBy || '', access: privateMode ? 'shared' : 'public' });

    let subFolders = [];
    let quizzes = [];
    if (privateMode && me) {
        try {
            let sets, folders;
            if (folder.userId === me.uid) {
                // Chủ thư mục tự mở link của mình
                [sets, folders] = await withTimeout(Promise.all([
                    runQueryRest({ collection: 'quiz_sets', where: [['userId', me.uid], ['folderId', folderId]], select: SET_META, requireUser: true }),
                    runQueryRest({ collection: 'quiz_folders', where: [['userId', me.uid], ['parentId', folderId]], requireUser: true })
                ]));
            } else {
                ({ sets, folders } = await withTimeout(fetchSharedWithMe(me.email)));
            }
            subFolders = folders.filter(f => f.parentId === folderId && !f.deleted).sort(byName);
            quizzes = sets.filter(q => q.folderId === folderId && !q.deleted);
        } catch (err) {
            console.error('Lỗi tải thư mục được chia sẻ:', err);
            showMessage('fa-triangle-exclamation', 'Không tải được danh sách bộ đề', 'Thử tải lại trang giúp mình nhé.');
            return;
        }
        if (isOwner) return finishFolderPage(subFolders, quizzes);
        // Người được chia sẻ: thẻ có vai trò, nút Sửa (Người chỉnh sửa), Lưu bản sao, Rời chia sẻ — như trang "Được chia sẻ với tôi"
        const data = { folders: subFolders, sets: quizzes, total: NaN };
        const draw = () => { finishFolderPage(data.folders, data.sets, { shared: true }); drawLocalMe(folderId, me); };
        draw();
        bindSharedActions(me, data, draw);
        return;
    }
    // THƯ MỤC CÔNG KHAI: danh sách lấy qua máy chủ (api/public.js) — luật Firestore không cho app liệt kê đề công khai nữa (link có hạn,
    // luật chỉ kiểm hạn được khi đọc từng doc). Máy chủ chỉ trả thư mục con / bộ đề công khai CÒN HẠN.
    try {
        const data = await withTimeout(fetchPublicFolder(folderId));
        if (data.status === 'expired') return showExpired();
        subFolders = (data.subFolders || []).sort(byName);
        quizzes = data.quizzes || [];
    } catch (err) {
        console.error('Lỗi tải bộ đề trong thư mục:', err);
        showMessage('fa-triangle-exclamation', 'Không tải được danh sách bộ đề',
            'Thử tải lại trang. Nếu vẫn lỗi, nhờ chủ thư mục chia sẻ lại link.');
        return;
    }
    finishFolderPage(subFolders, quizzes);
    if (!isOwner) drawLocalMe(folderId, me);
}

// Hồ sơ cho thư mục công khai / chia sẻ riêng (dữ liệu trên máy — quyền xem & người chia sẻ đã có ở bìa)
function drawLocalMe(folderId, me) {
    const sh = shelfEntry('folder', folderId);
    drawMe({
        guest: !me,
        chips: [
            ['fa-user-check', me ? `<b>${escapeHtml(me.email)}</b>` : 'Khách — kết quả chỉ lưu trên máy này'],
            ['fa-door-open', sh ? `Mở lần đầu ${fmtDate(sh.firstAt || sh.openedAt)}` : '']
        ]
    });
}
// Dòng phụ dưới tên thư mục: nhãn quyền truy cập + "từ ai"
let pageAccess = 'public';
let pageOwner = '';
function heroMeta() {
    return `${accessBadge(pageAccess)}${pageOwner ? `<span><i class="fas fa-user mr-1"></i>Chia sẻ bởi <b>${escapeHtml(pageOwner)}</b></span>` : ''}`;
}

function finishFolderPage(subFolders, quizzes, { shared = false, link = '' } = {}) {
    const totalQuestions = quizzes.reduce((sum, q) => sum + (q.questionCount || 0), 0);
    setHero({
        stats: [
            subFolders.length ? { icon: 'fa-folder', n: subFolders.length, label: 'thư mục con' } : null,
            { icon: 'fa-file-lines', n: quizzes.length, label: 'bộ đề' },
            { icon: 'fa-circle-question', n: totalQuestions, label: 'câu hỏi' }
        ]
    });

    // Thư mục con trong thư mục được chia sẻ: không có nút "Rời" riêng (rời ở cấp thư mục cha / trang "Được chia sẻ với tôi")
    renderSubFolders(subFolders, { link });
    setQuizList(quizzes, { shared, link });
    if (!quizzes.length && subFolders.length) return;
    if (!quizzes.length) {
        showMessage('fa-folder-open', 'Thư mục này chưa có bộ đề nào bạn xem được',
            'Chủ thư mục cần bật công khai hoặc chia sẻ cho bạn các bộ đề bên trong.');
        return;
    }
    document.getElementById('folder-message').classList.add('hidden');
}

// Nút tem "Lên đầu trang": hiện khi bìa đầu trang đã cuộn khuất
function bindToTop() {
    const btn = $('fp-totop');
    if (!btn || !('IntersectionObserver' in window)) return;
    new IntersectionObserver(([e]) => btn.classList.toggle('is-on', !e.isIntersecting)).observe($('folder-header'));
    btn.addEventListener('click', () => scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' }));
}

bindToTop();
main();
