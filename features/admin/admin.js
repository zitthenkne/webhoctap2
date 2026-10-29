// File: features/admin/admin.js
// SỔ QUẢN TRỊ — chỉ admin (isAdminUser, khớp isAdmin() trong firestore.rules và isAdminToken trong api/_lib/admin.js).
// Một khoảng thời gian chung (Hôm nay / 7 / 30 ngày — đầu trang) cho mọi tab:
//  • Tổng quan: note số liệu, "Việc cần xem" (bấm là nhảy tới đúng chỗ đã lọc), biểu đồ lượt làm, đề hot, ai được dùng tính năng gì.
//  • Đề & lượt làm: quiz_results (lượt nộp của tài khoản) + quiz_guest (máy khách chưa đăng nhập) — tải một lần, Tải lại mới đọc lại;
//    quiz_runs (đang làm — core/quiz-run.js ghi lúc bắt đầu / nộp) và CẢNH BÁO cùng tài khoản làm trên 2 máy cùng lúc:
//      – hai lượt nộp của cùng tài khoản, khác máy, chồng giờ nhau; – lượt nộp mà máy làm bài tự phát hiện máy kia (quiz_results.clash);
//      – đang làm (chưa nộp) trên ≥ 2 máy.
//  • Quyền tài khoản: bảng ô tài khoản × tính năng (core/features.js) — bấm ô là bật / tắt, tự lưu; tick nhiều dòng để đổi hàng loạt.
//    Ngăn chi tiết (4 tab con): Quyền · Máy · Làm đề · Sửa.
//  • Cài đặt: thông báo (config/announce — core/announce.js), số máy mặc định (config/access.defaultLimit), dọn bản ghi cũ, nhật ký.
import { auth, db } from '../../core/firebase-init.js';
import { onSessionUser } from '../../core/auth-session.js';
import { collection, query, where, orderBy, limit, onSnapshot, getDocs, getDoc, setDoc, addDoc, doc, writeBatch, Timestamp, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { showToast, showConfirm } from '../../core/utils.js';
import { isAdminUser, onAccessConfig, setDefaultLimit, limitFromConfig, adminListAllUsers, adminLookupUser, adminUpdateUser, adminDeleteUser,
    adminRemoveDevices, adminCreateUser, placeOf, ADMIN_EMAILS, EXEMPT_MAX, MAX_DEVICES } from '../../core/device-limit.js';
import { RUN_MAX_MS } from '../../core/quiz-run.js';
import { FEATURES, FEATURE_KEYS, DEFAULT_FEATURES, FULL_FEATURES, normFeatures } from '../../core/features.js';
import * as fx from './admin-fx.js';

const RESULTS_MAX = 1500;                         // số lượt tối đa mỗi lần tải (mỗi lượt = 1 lượt đọc)
const PURGE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;
const GUEST_PURGE_MS = 60 * 24 * 60 * 60 * 1000;
const OVERLAP_MIN_MS = 60 * 1000;                 // chồng giờ dưới 1 phút = lệch đồng hồ giữa 2 máy, không tính
const DAY = 24 * 60 * 60 * 1000;
const RANGES = { 1: 'hôm nay (24 giờ)', 7: '7 ngày qua', 30: '30 ngày qua' };
const MODES = { practice: 'luyện câu sai', srs: 'ôn lặp lại' };
const CLASH_KINDS = {
    overlap: ['Nộp bài chồng giờ trên 2 máy', 'bg-rose-100 text-rose-600'],
    seen: ['Máy làm bài thấy máy khác', 'bg-rose-100 text-rose-600'],
    live: ['Đang làm trên 2 máy', 'bg-amber-100 text-amber-700']
};
const FEAT_EMOJI = { quiz: '📝', create: '🪄', room: '👯', record: '🩺', offline: '✈️' };
const AVA_HUES = ['blossom', 'peach', 'butter', 'mint', 'sky', 'lav'];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
const lc = (s) => String(s || '').toLowerCase();
function ago(ms) {
    if (!ms) return '—';
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return `${s} giây trước`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m} phút trước`;
    const h = Math.round(m / 60);
    return h < 24 ? `${h} giờ trước` : `${Math.round(h / 24)} ngày trước`;
}
function dur(ms) {
    const m = Math.max(0, Math.floor(ms / 60000));
    return m < 60 ? `${m} phút` : `${Math.floor(m / 60)} giờ ${m % 60} phút`;
}
const fmtDate = (ms) => ms ? new Date(ms).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const fmtShort = (ms) => ms ? new Date(ms).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—';
const fmtClock = (ms) => ms ? new Date(ms).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—';
const msOf = (v) => v == null ? 0 : typeof v.toMillis === 'function' ? v.toMillis() : typeof v === 'number' ? v : new Date(v).getTime() || 0;
const nameOf = (x) => x.name || x.displayName || (x.email || '').split('@')[0] || x.uid;
const deviceIcon = (label) => /Android|iPhone|Điện thoại/.test(label) ? 'fa-mobile-screen' : /iPad|bảng/.test(label) ? 'fa-tablet-screen-button' : 'fa-laptop';

// ---------------- Trạng thái ----------------
let rangeDays = 7;
let runs = [];               // quiz_runs ghi trong RUN_MAX_MS gần nhất
let runsError = '';
let results = null;          // quiz_results trong khoảng đang chọn (null = chưa tải)
let resultsError = '', resultsAt = 0, resultsCapped = false;
let guests = [];             // quiz_guest (máy CHƯA đăng nhập làm đề công khai) trong cùng khoảng
let guestsError = '';
let incidents = null;        // kết quả analyze(), tính lại khi dữ liệu đổi
let users = null;            // danh sách tài khoản (máy chủ đọc Auth — không tốn lượt đọc Firestore)
let usersError = '';
let userMap = new Map();
let access = { deviceExempt: [], passwordAllowed: [], deviceLimits: {}, defaultLimit: MAX_DEVICES };
let repView = 'quiz';
let accFilter = 'all';
const selected = new Set();  // tài khoản đang tick (đổi quyền hàng loạt)
let accSort = { key: 'smart', dir: 1 };   // bấm tiêu đề cột để xếp
let openUid = null;
let drawerData = null;       // { user, devices, logins, results }
let drawerTab = 'perm';
let drawerList = [];         // danh sách để lật ‹ › trong ngăn chi tiết (theo bảng đang hiện)

// Ghim ⭐ + ghi chú riêng 📝 của admin — chỉ lưu trên máy này (không ai khác đọc được)
const readLS = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch (e) { return d; } };
const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const pins = new Set(readLS('adminPins', []));
const memos = readLS('adminMemos', {});
const savePins = () => writeLS('adminPins', [...pins]);
let memoTimer = 0;
const saveMemos = () => { clearTimeout(memoTimer); memoTimer = setTimeout(() => writeLS('adminMemos', memos), 400); };

// ---------------- Khung trang ----------------
const TABS = ['home', 'report', 'accounts', 'settings'];
let curTab = 'home';
function switchTab(t) {
    const changed = curTab !== t;
    curTab = t;
    document.querySelectorAll('.tab-btn, .bot-btn').forEach(b => b.classList.toggle('is-on', b.dataset.tab === t));
    TABS.forEach(k => $(`tab-${k}`).classList.toggle('hidden', k !== t));
    // Chuyển tab mượt: trang mới trượt nhẹ lên
    if (changed) { const sec = $(`tab-${t}`); sec.classList.remove('tab-in'); void sec.offsetWidth; sec.classList.add('tab-in'); }
    try { localStorage.setItem('adminTab', t); } catch (e) {}
    renderCurrent();
    if (t === 'accounts' && !users) loadUsers();
    if (t === 'settings') { loadAnnounce(); watchAudit(); }
    paintBulk();
}
function renderCurrent() {
    if (curTab === 'home') renderHome();
    if (curTab === 'report') renderReport();
    if (curTab === 'accounts') renderAccounts();
}
/** Nhảy tới tab khác, đã lọc sẵn (từ "Việc cần xem", đề hot, "Ai được dùng gì"…). */
function goto(tab, o = {}) {
    if (o.filter) accFilter = o.filter;
    if (o.search != null && tab === 'report') $('rep-search').value = o.search;
    if (o.search != null && tab === 'accounts') $('acc-search').value = o.search;
    if (o.clash != null) $('rep-only-clash').checked = o.clash;
    switchTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Gộp các lần vẽ lại trong 0,5 giây và chỉ vẽ phần đang nhìn thấy
let renderTimer = 0;
function queueRender() {
    if (renderTimer) return;
    renderTimer = setTimeout(() => {
        renderTimer = 0;
        if (document.hidden) return;
        renderStatus();
        renderCurrent();
        if (openUid && drawerData) renderDrawer();
    }, 500);
}
const dataChanged = () => { incidents = null; queueRender(); };

// Tab Quản trị bị ẩn quá 1 phút → thôi nghe (mỗi thay đổi nghe được là 1 lượt đọc bị tính tiền); mở lại thì nghe tiếp
const PAUSE_AFTER_MS = 60 * 1000;
let pauseTimer = 0;
function onAdminVisibility() {
    if (!started) return;
    if (document.hidden) {
        clearTimeout(pauseTimer);
        pauseTimer = setTimeout(() => {
            runsUnsub?.(); runsUnsub = null;
            auditUnsub?.(); auditUnsub = null;
        }, PAUSE_AFTER_MS);
        return;
    }
    clearTimeout(pauseTimer);
    if (!runsUnsub) subscribeRuns();
    if (curTab === 'settings') watchAudit();
    queueRender();
}

let started = false;
onSessionUser((u) => {
    if (started) return;
    if (!u || !isAdminUser(u)) {
        $('gate').classList.remove('hidden');
        $('live-status').textContent = u ? 'Không có quyền' : 'Chưa đăng nhập';
        return;
    }
    if (typeof u.getIdToken !== 'function') {           // danh tính lưu máy lúc offline — chưa gọi được máy chủ
        $('live-status').textContent = 'Đang chờ mạng để xác minh tài khoản…';
        return;
    }
    started = true;
    $('gate').classList.add('hidden');
    let t = 'home', r = 7;
    try { t = localStorage.getItem('adminTab') || 'home'; r = Number(localStorage.getItem('adminRange')) || 7; } catch (e) {}
    rangeDays = RANGES[r] ? r : 7;
    document.querySelectorAll('[data-range]').forEach(b => b.classList.toggle('is-on', Number(b.dataset.range) === rangeDays));
    bindAll();
    switchTab(TABS.includes(t) ? t : 'home');
    start();
});

function bindAll() {
    document.querySelectorAll('.tab-btn, .bot-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    $('open-cmdk').addEventListener('click', () => fx.openPalette(paletteSearch));
    $('open-look').addEventListener('click', () => fx.openLook());
    $('open-keys').addEventListener('click', openKeys);
    document.addEventListener('keydown', onShortcut);
    document.querySelectorAll('[data-range]').forEach(b => b.addEventListener('click', () => {
        rangeDays = Number(b.dataset.range);
        try { localStorage.setItem('adminRange', String(rangeDays)); } catch (e) {}
        document.querySelectorAll('[data-range]').forEach(x => x.classList.toggle('is-on', x === b));
        loadResults();
    }));
    document.querySelectorAll('.rep-view').forEach(b => b.addEventListener('click', () => {
        repView = b.dataset.view;
        document.querySelectorAll('.rep-view').forEach(x => x.classList.toggle('is-on', x === b));
        renderReport();
    }));
    ['rep-search', 'rep-only-clash'].forEach(id => $(id).addEventListener('input', renderReport));
    $('rep-reload').addEventListener('click', loadResults);
    $('rep-export').addEventListener('click', exportReport);
    // Mọi nút "đi tới…" / mở chi tiết / đá máy trong Tổng quan + Báo cáo
    ['tab-home', 'tab-report'].forEach(id => $(id).addEventListener('click', onNavClick));
    bindAccounts();
    bindSettings();
    bindDrawer();
}

function start() {
    onAccessConfig((cfg) => {
        if (!cfg) return;
        access = cfg;
        $('set-default-now').textContent = `Đang áp dụng: ${cfg.defaultLimit} máy`;
        if (document.activeElement !== $('set-default-limit')) $('set-default-limit').value = cfg.defaultLimit;
        queueRender();
    });
    subscribeRuns();
    loadResults();
    if (!users) loadUsers();
    setInterval(() => { if (runsUnsub) subscribeRuns(); }, 30 * 60 * 1000);   // mốc "3 giờ gần nhất" của truy vấn trôi theo giờ
    setInterval(queueRender, 60 * 1000);              // cập nhật "x phút trước" — tab ẩn thì bỏ qua
    document.addEventListener('visibilitychange', onAdminVisibility);
    purgeRuns(false).catch(() => {});
}

// ---------------- PHÍM TẮT + TÌM NHANH ----------------
const KEYS = [
    ['Ctrl K', 'Tìm nhanh tài khoản, đề, thao tác'], ['1 2 3 4', 'Chuyển tab Tổng quan · Lượt làm · Quyền · Cài đặt'],
    ['/', 'Nhảy vào ô tìm của tab đang mở'], ['N', 'Tạo tài khoản mới'], ['R', 'Tải lại lượt làm'],
    ['← →', 'Lật tài khoản trước / sau (khi đang mở chi tiết)'], ['Ctrl Z', 'Hoàn tác lần đổi quyền vừa rồi'], ['Esc', 'Đóng hộp / ngăn đang mở'], ['?', 'Mở bảng này']
];
function openKeys() { fx.openSheet(KEYS); }
const typing = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

function onShortcut(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); return fx.isOpen() ? null : fx.openPalette(paletteSearch); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing(e.target)) { if (fx.undoNow()) e.preventDefault(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || fx.isOpen() || !started) return;
    if (openUid && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); return stepDrawer(e.key === 'ArrowLeft' ? -1 : 1); }
    if (openUid) return;
    if (/^[1-4]$/.test(e.key)) return switchTab(TABS[Number(e.key) - 1]);
    if (e.key === '?') return openKeys();
    if (e.key === '/') {
        const box = curTab === 'accounts' ? $('acc-search') : curTab === 'report' ? $('rep-search') : null;
        if (box) { e.preventDefault(); box.focus(); box.select(); }
        return;
    }
    if (e.key.toLowerCase() === 'n') { e.preventDefault(); switchTab('accounts'); $('acc-new').classList.remove('hidden'); $('new-email').focus(); return; }
    if (e.key.toLowerCase() === 'r') { e.preventDefault(); loadResults(); showToast('Đang đọc lại lượt làm… 🔄', 'info', 1400); }
}

/** Kết quả cho Tìm nhanh: tài khoản, đề, đi tới, thao tác. */
function paletteSearch(q) {
    const out = [];
    const has = (...v) => !q || v.some(x => lc(x).includes(q));
    const go = (tab) => () => switchTab(tab);
    [['home', '🏠', 'Tổng quan'], ['report', '📚', 'Đề & lượt làm'], ['accounts', '🎀', 'Quyền tài khoản'], ['settings', '🌿', 'Cài đặt']]
        .forEach(([t, ic, name]) => { if (has(name, 'đi tới', t)) out.push({ group: 'Đi tới', icon: ic, label: name, run: go(t) }); });
    if (q && users) {
        users.filter(u => has(u.displayName, u.email, u.uid, memos[u.uid])).slice(0, 8).forEach(u => out.push({
            group: 'Tài khoản', icon: avatar(u.uid, u.displayName || u.email), label: u.displayName || u.email,
            labelHtml: fx.hl(u.displayName || u.email.split('@')[0], q),
            sub: `${u.email}${memos[u.uid] ? ' · 📝 ' + memos[u.uid].slice(0, 40) : ''}`, run: () => openDrawer(u.uid)
        }));
    }
    if (q) {
        const seen = new Map();
        for (const r of [...(results || []), ...guests]) {
            if (!r.quizId || seen.has(r.quizId) || !has(r.title, r.quizId)) continue;
            seen.set(r.quizId, r.title || r.quizId);
            if (seen.size >= 6) break;
        }
        seen.forEach((title) => out.push({ group: 'Đề', icon: '📚', label: title, labelHtml: fx.hl(title, q), sub: 'Xem ai đã làm đề này',
            run: () => goto('report', { search: title }) }));
    }
    const acts = [
        ['🌱', 'Tạo tài khoản mới', () => { switchTab('accounts'); $('acc-new').classList.remove('hidden'); $('new-email').focus(); }],
        ['🚨', 'Xem lượt làm trên 2 máy', () => goto('report', { clash: true })],
        ['⏳', 'Tài khoản chưa duyệt', () => goto('accounts', { filter: 'unapproved' })],
        ['⭐', 'Tài khoản đã ghim', () => goto('accounts', { filter: 'pinned' })],
        ['📣', 'Gửi thông báo', () => { switchTab('settings'); $('ann-text').focus(); }],
        ['🔄', 'Tải lại lượt làm', loadResults],
        ['📄', 'Xuất CSV lượt làm', exportReport],
        ['📄', 'Xuất CSV tài khoản', exportCsv],
        ['🎨', 'Đổi giao diện sổ (ngày / đêm, màu)', () => fx.openLook()],
        ['⌨️', 'Xem phím tắt', openKeys]
    ];
    acts.forEach(([ic, name, run]) => { if (has(name, 'thao tác')) out.push({ group: 'Thao tác', icon: ic, label: name, run }); });
    return out;
}

function onNavClick(e) {
    const g = e.target.closest('[data-goto]');
    if (g) return goto(g.dataset.goto, { filter: g.dataset.filter, search: g.dataset.search, clash: g.dataset.clash === '1' ? true : undefined });
    const b = e.target.closest('[data-act]');
    if (!b) return;
    // Lật ‹ › theo đúng thứ tự những người đang hiện trên tab này
    if (b.dataset.act === 'open') return openDrawer(b.dataset.uid, [...new Set([...$(`tab-${curTab}`).querySelectorAll('[data-act="open"]')].map(x => x.dataset.uid))]);
    if (b.dataset.act === 'kick-all') return kick(b.dataset.uid, '', '');
}

// ---------------- DỮ LIỆU ----------------
// Doc do MÁY NGƯỜI DÙNG ghi → không tin: chữ ép về chuỗi (luôn esc khi vẽ), số ép về số nguyên, trạng thái chỉ nhận giá trị đã biết
// (trang này chạy bằng quyền admin — chèn nguyên văn là mở đường cho mã độc; khoá lạ như "constructor" còn làm vỡ cả trang).
const own = (obj, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(obj, k);
const str = (v, max = 200) => (typeof v === 'string' ? v : '').slice(0, max);
const int = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);

function normRun(id, x) {
    return {
        id, uid: str(x.uid, 128), email: str(x.email, 200), name: str(x.name, 80), device: str(x.device, 64) || id, label: str(x.label, 80),
        quizId: str(x.quizId, 120), title: str(x.title, 200), mode: own(MODES, x.mode) ? x.mode : '', state: x.state === 'done' ? 'done' : 'doing',
        startedAt: int(x.startedAt) || 0, pct: int(x.pct), atMs: msOf(x.at)
    };
}
function normResult(id, x) {
    const end = msOf(x.completedAt);
    const taken = Math.max(0, int(x.timeTaken) || 0);
    const start = int(x.startedAt) || (end - taken * 1000);
    const total = int(x.totalQuestions) || 0;
    const p = typeof x.percentage === 'number' ? x.percentage : (total ? Number(x.score) / total * 100 : 0);
    return {
        id, uid: str(x.userId, 128), quizId: str(x.quizId, 120), title: str(x.quizTitle, 200), pct: Math.round(p) || 0,
        score: Number(x.score) || 0, total, taken, start: Math.min(start, end), end,
        device: str(x.device, 64), label: str(x.deviceLabel, 80), clash: str(x.clash, 80), flags: []
    };
}
// Máy khách: mỗi máy × mỗi đề một doc (làm lại thì ghi đè lượt cuối + đếm số lượt)
function normGuest(id, x) {
    const end = msOf(x.at);
    return {
        id, device: str(x.device, 64) || id, label: str(x.label, 80), quizId: str(x.quizId, 120), title: str(x.title, 200),
        done: x.state === 'done', pct: int(x.pct), attempts: Math.max(1, int(x.attempts) || 1),
        start: Math.min(int(x.startedAt) || end, end), end
    };
}
const isDoing = (r) => r.state === 'doing' && Date.now() - r.atMs < RUN_MAX_MS;

let runsUnsub = null;
function subscribeRuns() {
    runsUnsub?.();
    const since = Timestamp.fromMillis(Date.now() - RUN_MAX_MS);
    runsUnsub = onSnapshot(query(collection(db, 'quiz_runs'), where('at', '>', since)), (snap) => {
        runsError = '';
        runs = snap.docs.map(d => normRun(d.id, d.data({ serverTimestamps: 'estimate' })));
        dataChanged();
    }, (e) => {
        runsError = e?.code === 'permission-denied'
            ? 'Chưa đọc được lượt đang làm — luật Firestore mới (quiz_runs) đã deploy chưa?'
            : 'Mất kết nối lượt đang làm: ' + (e?.message || e);
        dataChanged();
    });
}

let resultsToken = 0;
async function loadResults() {
    const token = ++resultsToken;
    resultsError = '';
    guestsError = '';
    $('rep-reload').disabled = true;
    renderStatus();
    try {
        const since = Timestamp.fromMillis(Date.now() - rangeDays * DAY);
        const [snap, gsnap] = await Promise.all([
            getDocs(query(collection(db, 'quiz_results'), where('completedAt', '>=', since), orderBy('completedAt', 'desc'), limit(RESULTS_MAX))),
            getDocs(query(collection(db, 'quiz_guest'), where('at', '>=', since), orderBy('at', 'desc'), limit(RESULTS_MAX))).catch((e) => {
                guestsError = e?.code === 'permission-denied' ? 'Chưa đọc được máy khách — luật Firestore mới (quiz_guest) đã deploy chưa?' : 'Không tải được máy khách.';
                return null;
            })
        ]);
        if (token !== resultsToken) return;
        results = snap.docs.map(d => normResult(d.id, d.data()));
        guests = gsnap ? gsnap.docs.map(d => normGuest(d.id, d.data())) : [];
        resultsCapped = snap.size >= RESULTS_MAX || (gsnap?.size || 0) >= RESULTS_MAX;
        resultsAt = Date.now();
    } catch (e) {
        if (token !== resultsToken) return;
        results = results || [];
        resultsError = e?.code === 'permission-denied'
            ? 'Không đọc được kết quả làm bài — luật Firestore mới (admin đọc quiz_results) đã deploy chưa?'
            : 'Không tải được lượt làm: ' + (e?.message || e);
    } finally {
        if (token === resultsToken) $('rep-reload').disabled = false;
    }
    dataChanged();
}

function person(uid) {
    const u = userMap.get(uid);
    const r = runs.find(x => x.uid === uid);
    return { uid, email: u?.email || r?.email || '', name: u?.displayName || r?.name || '' };
}

/** Tìm các lần cùng tài khoản làm đề trên 2 máy cùng lúc. Gắn cờ vào từng lượt nộp (r.flags). */
function analyze() {
    if (incidents) return incidents;
    const list = [];
    const byUid = new Map();
    for (const r of results || []) {
        r.flags = [];
        if (!byUid.has(r.uid)) byUid.set(r.uid, []);
        byUid.get(r.uid).push(r);
    }
    const side = (r) => ({ label: r.label || 'máy chưa rõ', title: r.title || r.quizId, start: r.start, end: r.end });
    for (const [uid, rs] of byUid) {
        const withDev = rs.filter(r => r.device).sort((a, b) => a.start - b.start);
        for (let i = 0; i < withDev.length; i++) {
            const a = withDev[i];
            // đã xếp theo giờ bắt đầu → lượt sau bắt đầu sau khi a kết thúc thì các lượt sau nữa cũng vậy
            for (let j = i + 1; j < withDev.length && withDev[j].start < a.end - OVERLAP_MIN_MS; j++) {
                const b = withDev[j];
                if (a.device === b.device) continue;
                a.flags.push(b.label || 'máy khác');
                b.flags.push(a.label || 'máy khác');
                list.push({ uid, kind: 'overlap', a: side(a), b: side(b), at: Math.max(a.end, b.end) });
            }
        }
        for (const r of rs) {
            if (!r.clash || r.flags.length) continue;
            r.flags.push(r.clash);
            list.push({ uid, kind: 'seen', a: side(r), b: { label: r.clash }, at: r.end });
        }
    }
    for (const [uid, g] of doingByUid()) {
        if (g.devices.size < 2) continue;
        const byDev = [...new Map(g.runs.map(r => [r.device, r])).values()];
        const s = (r) => ({ label: r.label || 'máy chưa rõ', title: r.title || r.quizId, start: r.startedAt || r.atMs, end: 0 });
        list.push({ uid, kind: 'live', a: s(byDev[0]), b: s(byDev[1]), at: Math.max(byDev[0].atMs, byDev[1].atMs) });
    }
    return (incidents = list.sort((x, y) => y.at - x.at));
}
const clashUids = () => new Set(analyze().map(x => x.uid));

function doingByUid() {
    const m = new Map();
    for (const r of runs) {
        if (!isDoing(r)) continue;
        let g = m.get(r.uid);
        if (!g) m.set(r.uid, g = { devices: new Set(), runs: [] });
        g.devices.add(r.device);
        g.runs.push(r);
    }
    return m;
}

function groupBy(list, key) {
    const m = new Map();
    for (const x of list) {
        const k = x[key];
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(x);
    }
    return m;
}

// ---------------- MẢNH GHÉP GIAO DIỆN DÙNG CHUNG ----------------
/** Hình đại diện sticker: chữ cái đầu trên nền màu kẹo (màu cố định theo uid). */
function avatar(uidOrKey, name, size = '') {
    let h = 0;
    for (const c of String(uidOrKey)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const hue = AVA_HUES[h % AVA_HUES.length];
    const ch = (String(name || '?').trim()[0] || '?').toUpperCase();
    return `<span class="ava ${size}" style="--h:var(--hue-${hue});--hi:var(--ink-${hue})">${esc(ch)}</span>`;
}
const scoreClass = (p) => p == null ? 's-none' : p >= 80 ? 's-good' : p >= 50 ? 's-mid' : 's-low';
/** Bong bóng điểm của một lượt làm (rê chuột / chạm để xem giờ, máy, cờ 2 máy). */
function bubble(r, withTitle = false) {
    const flag = r.flags?.length > 0;
    const tip = [withTitle ? (r.title || r.quizId) : '', `${r.pct}%`, fmtShort(r.end), r.taken ? dur(r.taken * 1000) : '', r.label,
        flag ? '🚨 cùng lúc với ' + r.flags.join(', ') : ''].filter(Boolean).join(' · ');
    return `<span class="bub ${scoreClass(r.pct)} ${flag ? 'is-flag' : ''}" title="${esc(tip)}">${r.pct}</span>`;
}
function bubbles(rs, max = 14, withTitle = false) {
    const list = [...rs].sort((a, b) => a.end - b.end);
    const shown = list.slice(-max);
    return `<span class="bubs">${list.length > max ? `<span class="bub-more">+${list.length - max}</span>` : ''}${shown.map(r => bubble(r, withTitle)).join('')}</span>`;
}
function guestBubble(g) {
    const tip = [g.label || 'máy chưa rõ', g.done && g.pct != null ? `${g.pct}%` : 'chưa nộp / bỏ dở', fmtShort(g.end), g.attempts > 1 ? `${g.attempts} lượt` : ''].filter(Boolean).join(' · ');
    return `<span class="bub ${g.done ? scoreClass(g.pct) : 's-none'}" title="${esc(tip)}">${g.done && g.pct != null ? g.pct : '…'}</span>`;
}
function personBtn(uid, extra = '', q = '') {
    const p = person(uid);
    return `<button type="button" class="who" data-act="open" data-uid="${esc(uid)}">${avatar(uid, nameOf(p))}
        <span class="min-w-0"><b>${fx.hl(nameOf(p), q)}${pins.has(uid) ? ' ⭐' : ''}</b><small>${fx.hl(p.email, q)}</small></span>${extra}</button>`;
}
const empty = (text, doodle = 'cloud') => `<div class="card nb-plain p-8 text-center empty"><span class="doodle doodle-${doodle}"></span><p>${text}</p></div>`;

// ---------------- ĐẦU TRANG ----------------
function renderStatus() {
    const el = $('live-status');
    if (!started) return;
    const err = resultsError || usersError;
    if (err) { el.innerHTML = `<span style="color:var(--ink-cherry)">⚠️ ${esc(err)}</span>`; return; }
    if (!results) { el.textContent = 'Đang lật sổ…'; return; }
    el.textContent = `Đang xem ${RANGES[rangeDays]} · cập nhật lúc ${fmtClock(resultsAt)}`;
}

// ---------------- TỔNG QUAN ----------------
// Note dán: số chạy (countUp) + đường xu hướng nhỏ theo các mốc của biểu đồ
function note(key, emoji, label, value, sub, hue, go = '', trend = null) {
    const n = typeof value === 'number' ? value : null;
    return `<button type="button" class="card sticky-note" style="--h:var(--hue-${hue});--hi:var(--ink-${hue})" ${go}>
        <span class="sn-emoji">${emoji}</span>
        <span class="sn-label">${label}</span>
        <span class="sn-value" ${n != null ? `data-count="${key}" data-to="${n}" data-suffix="${key === 'runs' && resultsCapped ? '+' : ''}"` : ''}>${n != null ? '0' : value}</span>
        <span class="sn-sub">${sub}</span>
        ${trend ? `<span class="sn-spark">${fx.spark(trend)}</span>` : ''}
    </button>`;
}

/** Mốc thời gian chung cho biểu đồ + đường xu hướng: hôm nay = 12 mốc 2 giờ, còn lại = theo ngày. */
function timeBuckets() {
    const now = Date.now();
    if (rangeDays === 1) {
        const step = 2 * 3600 * 1000, start = now - 24 * 3600 * 1000;
        return { n: 12, step, start, label: (i) => `${new Date(start + i * step).getHours()}h` };
    }
    const d = new Date(); d.setHours(0, 0, 0, 0);
    const start = d.getTime() - (rangeDays - 1) * DAY;
    return { n: rangeDays, step: DAY, start, label: (i) => { const x = new Date(start + i * DAY); return `${x.getDate()}/${x.getMonth() + 1}`; } };
}
function series(times) {
    const b = timeBuckets();
    const arr = new Array(b.n).fill(0);
    for (const t of times) { const i = Math.floor((t - b.start) / b.step); if (i >= 0 && i < b.n) arr[i]++; }
    return arr;
}

function renderHome() {
    if (!started) return;
    const inc = analyze();
    const all = results || [];
    const doing = doingByUid();
    const guestAttempts = guests.reduce((s, g) => s + g.attempts, 0);
    const accDevices = new Set(all.filter(r => r.device).map(r => r.uid + '|' + r.device)).size;
    const guestDevices = new Set(guests.map(g => g.device)).size;
    const since = Date.now() - rangeDays * DAY;
    const newUsers = users ? users.filter(u => (u.createdAt || 0) >= since).length : 0;
    const unapproved = users ? users.filter(u => !u.approved && !u.disabled).length : 0;
    const locked = users ? users.filter(u => u.disabled).length : 0;
    const clash = clashUids();

    const runTimes = [...all.map(r => r.end), ...guests.map(g => g.end)];
    $('home-notes').innerHTML =
        note('runs', '🍓', 'Lượt làm đề', results ? all.length + guestAttempts : '…', `${all.length} tài khoản · ${guestAttempts} khách`, 'blossom', 'data-goto="report"', results ? series(runTimes) : null) +
        note('devs', '📱', 'Máy đã làm đề', results ? accDevices + guestDevices : '…', guestsError ? 'chưa đọc được máy khách' : `${accDevices} có tài khoản · ${guestDevices} khách`, 'sky', 'data-goto="report"', results ? series(guests.map(g => g.end)) : null) +
        note('doing', '✏️', 'Đang làm ngay', doing.size, runsError ? 'chưa đọc được' : doing.size ? `trên ${[...doing.values()].reduce((s, g) => s + g.devices.size, 0)} máy` : 'chưa ai đang làm', 'mint', 'data-goto="report"') +
        note('users', '🧸', 'Tài khoản', users ? users.length : '…', users ? `+${newUsers} mới · ${unapproved} chờ duyệt` : 'đang tải…', 'lav', 'data-goto="accounts" data-filter="all"', users ? series(users.map(u => u.createdAt || 0)) : null);
    $('home-notes').querySelectorAll('[data-count]').forEach(el => fx.countUp(el, el.dataset.count, Number(el.dataset.to), el.dataset.suffix));

    // Việc cần xem: mỗi dòng một việc, bấm là tới đúng chỗ đã lọc sẵn
    const todo = [];
    if (clash.size) todo.push(['🚨', `<b>${clash.size}</b> tài khoản làm đề trên 2 máy cùng lúc`, `${inc.length} lần · ${RANGES[rangeDays]}`, 'cherry', 'data-goto="report" data-clash="1"', 'Xem lượt']);
    if (doing.size) todo.push(['✏️', `<b>${doing.size}</b> người đang làm đề`, 'chưa nộp bài', 'mint', 'data-goto="report"', 'Xem']);
    if (unapproved) todo.push(['⏳', `<b>${unapproved}</b> tài khoản chưa duyệt`, 'chưa tạo được đề, phòng, bệnh án', 'butter', 'data-goto="accounts" data-filter="unapproved"', 'Duyệt']);
    if (locked) todo.push(['🔒', `<b>${locked}</b> tài khoản đang bị khoá`, 'không đăng nhập được', 'latte', 'data-goto="accounts" data-filter="locked"', 'Xem']);
    for (const err of [resultsError, guestsError, runsError, usersError].filter(Boolean)) todo.push(['⚠️', esc(err), 'kiểm tra lại phần deploy', 'cherry', '', '']);
    $('home-todo').innerHTML = todo.length ? todo.map(([ic, text, sub, hue, go, cta]) => `<li>
        <${go ? 'button type="button"' : 'div'} class="todo" style="--h:var(--hue-${hue});--hi:var(--ink-${hue})" ${go}>
            <span class="todo-ic">${ic}</span><span class="min-w-0 flex-1"><span class="todo-t">${text}</span><small>${sub}</small></span>
            ${cta ? `<span class="todo-go">${cta} ›</span>` : ''}
        </${go ? 'button' : 'div'}></li>`).join('')
        : '<li class="todo-ok">🌈 Không có gì cần lo — mọi thứ đều ổn áp!</li>';

    // Ai được dùng gì
    if (!users) $('home-feats').innerHTML = `<p class="nb-tiny">${usersError ? esc(usersError) : 'Đang tải danh sách tài khoản…'}</p>`;
    else {
        const n = users.length || 1;
        $('home-feats').innerHTML = FEATURE_KEYS.map(k => {
            const [name, , color, bg] = FEATURES[k];
            const on = users.filter(u => featOf(u)[k]).length;
            return `<button type="button" class="frow" data-goto="accounts" data-filter="on-${k}" style="--fc:${color};--fb:${bg}">
                <span class="frow-ic">${FEAT_EMOJI[k]}</span><b>${name}</b>
                <span class="frow-bar"><i style="width:${Math.round(on / n * 100)}%"></i></span>
                <span class="frow-n">${on}<small>/${users.length}</small></span></button>`;
        }).join('') + `<div class="flex flex-wrap gap-2 pt-1">
            <button type="button" class="chip-btn" data-goto="accounts" data-filter="full">✨ Full: ${users.filter(isFull).length}</button>
            <button type="button" class="chip-btn" data-goto="accounts" data-filter="default">🌱 Mặc định: ${users.filter(u => !u.isAdmin && !u.featuresCustom).length}</button>
            <button type="button" class="chip-btn" data-goto="accounts" data-filter="custom">🎀 Tuỳ chỉnh: ${users.filter(u => !u.isAdmin && u.featuresCustom).length}</button></div>`;
    }

    renderChart();
    renderHeat();
    renderHot();
    renderFeed();
}

/** Giờ vàng: 7 ngày trong tuần × 12 khung 2 giờ — ô càng đậm càng nhiều lượt làm. */
function renderHeat() {
    if (!results) { $('home-heat').innerHTML = fx.skeleton(3, 'line'); return; }
    const grid = Array.from({ length: 7 }, () => new Array(12).fill(0));
    const put = (t) => { if (!t) return; const d = new Date(t); grid[(d.getDay() + 6) % 7][Math.floor(d.getHours() / 2)]++; };
    results.forEach(r => put(r.end));
    guests.forEach(g => put(g.end));
    const max = Math.max(1, ...grid.flat());
    const DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
    let best = null;
    grid.forEach((row, di) => row.forEach((v, hi) => { if (v && (!best || v > best.v)) best = { v, di, hi }; }));
    $('home-heat-cap').textContent = best ? `đông nhất: ${DAYS[best.di]}, ${best.hi * 2}–${best.hi * 2 + 2}h` : '';
    $('home-heat').innerHTML = `<span></span>${[0, 2, 4, 6, 8, 10].map(h => `<span class="heat-h" style="grid-column:span 2">${h * 2}h</span>`).join('')}`
        + grid.map((row, di) => `<span class="heat-d">${DAYS[di]}</span>${row.map((v, hi) =>
            `<i class="heat-c" style="--a:${v ? (.18 + .82 * v / max).toFixed(2) : 0}" title="${DAYS[di]} ${hi * 2}–${hi * 2 + 2}h: ${v} lượt"></i>`).join('')}`).join('');
}

/** Bảng tin: 10 lượt nộp mới nhất (tài khoản + máy khách). */
function renderFeed() {
    if (!results) { $('home-feed').innerHTML = fx.skeleton(4, 'line'); return; }
    const items = [
        ...results.map(r => ({ t: r.end, acc: r })),
        ...guests.filter(g => g.done).map(g => ({ t: g.end, g }))
    ].sort((a, b) => b.t - a.t).slice(0, 10);
    $('home-feed').innerHTML = items.length ? items.map(({ acc, g }) => {
        if (acc) {
            const p = person(acc.uid);
            return `<li><button type="button" class="feed-it" data-act="open" data-uid="${esc(acc.uid)}">${avatar(acc.uid, nameOf(p))}
                <span class="min-w-0 flex-1"><b>${esc(nameOf(p))}</b> nộp <i>${esc(acc.title || acc.quizId)}</i><small>${ago(acc.end)}${acc.label ? ' · ' + esc(acc.label) : ''}</small></span>${bubble(acc)}</button></li>`;
        }
        return `<li><button type="button" class="feed-it" data-goto="report" data-search="${esc(g.title || g.quizId)}"><span class="ava ava-guest">🕶️</span>
            <span class="min-w-0 flex-1"><b>Khách</b> nộp <i>${esc(g.title || g.quizId)}</i><small>${ago(g.end)} · ${esc(g.label || 'máy chưa rõ')}</small></span>${guestBubble(g)}</button></li>`;
    }).join('') : `<li class="nb-tiny">Chưa có lượt nộp nào trong ${RANGES[rangeDays]} 🌸</li>`;
}

/** Biểu đồ cột: lượt làm theo ngày (hôm nay: theo 2 giờ), xếp chồng có tài khoản + máy khách. */
function renderChart() {
    const now = Date.now();
    let n, start, step, label;
    if (rangeDays === 1) {
        n = 12; step = 2 * 3600 * 1000; start = now - 24 * 3600 * 1000;
        label = (i) => `${new Date(start + i * step).getHours()}h`;
    } else {
        n = rangeDays; step = DAY;
        const d = new Date(); d.setHours(0, 0, 0, 0);
        start = d.getTime() - (n - 1) * DAY;
        label = (i) => { const x = new Date(start + i * step); return `${x.getDate()}/${x.getMonth() + 1}`; };
    }
    const acc = new Array(n).fill(0), gst = new Array(n).fill(0);
    const put = (arr, t) => { const i = Math.floor((t - start) / step); if (i >= 0 && i < n) arr[i]++; };
    (results || []).forEach(r => put(acc, r.end));
    guests.forEach(g => put(gst, g.end));
    const max = Math.max(1, ...acc.map((v, i) => v + gst[i]));
    const every = n > 14 ? Math.ceil(n / 10) : 1;
    $('home-chart-cap').textContent = `${acc.reduce((a, b) => a + b, 0) + gst.reduce((a, b) => a + b, 0)} lượt · ${RANGES[rangeDays]}`;
    $('home-chart').style.setProperty('--n', n);
    $('home-chart').innerHTML = !results ? '<p class="nb-tiny">Đang tải…</p>' : acc.map((v, i) => {
        const tot = v + gst[i];
        return `<div class="bar-col" title="${label(i)}: ${v} có tài khoản · ${gst[i]} khách">
            <span class="bar-n">${tot || ''}</span>
            <span class="bar-stack" style="height:${Math.round(tot / max * 100)}%">
                <i class="b-guest" style="flex:${gst[i]}"></i><i class="b-acc" style="flex:${v}"></i></span>
            <span class="bar-l">${i % every === 0 || i === n - 1 ? label(i) : ''}</span></div>`;
    }).join('');
}

function renderHot() {
    const byQuiz = new Map();
    const add = (id, title) => { let q = byQuiz.get(id); if (!q) byQuiz.set(id, q = { id, title: '', dev: new Set(), n: 0 }); if (!q.title && title) q.title = title; return q; };
    (results || []).forEach(r => { const q = add(r.quizId, r.title); q.n++; q.dev.add(r.device ? r.uid + '|' + r.device : 'u|' + r.uid); });
    guests.forEach(g => { const q = add(g.quizId, g.title); q.n += g.attempts; q.dev.add('g|' + g.device); });
    const top = [...byQuiz.values()].sort((a, b) => b.dev.size - a.dev.size || b.n - a.n).slice(0, 6);
    const max = Math.max(1, ...top.map(q => q.dev.size));
    const medals = ['🥇', '🥈', '🥉', '🎀', '🎀', '🎀'];
    $('home-hot').innerHTML = !results ? '<li class="nb-tiny">Đang tải…</li>' : top.length ? top.map((q, i) => `<li>
        <button type="button" class="hot" data-goto="report" data-search="${esc(q.title || q.id)}">
            <span class="hot-rank">${medals[i]}</span>
            <span class="min-w-0 flex-1"><b>${esc(q.title || 'Đề chưa rõ tên')}</b>
                <span class="hot-bar"><i style="width:${Math.round(q.dev.size / max * 100)}%"></i></span></span>
            <span class="hot-n">${q.dev.size}<small> máy</small><br><small>${q.n} lượt</small></span>
        </button></li>`).join('') : `<li class="nb-tiny">Chưa ai làm đề trong ${RANGES[rangeDays]} 🌸</li>`;
}

// ---------------- ĐỀ & LƯỢT LÀM ----------------
function matchesQ(r, q) {
    if (!q) return true;
    const p = person(r.uid);
    return [r.title, r.quizId, p.name, p.email, r.label].some(v => lc(v).includes(q));
}
const guestMatches = (g, q) => !q || [g.title, g.quizId, g.label, 'khách', 'chưa đăng nhập'].some(v => lc(v).includes(q));

function renderReport() {
    if (!started) return;
    const inc = analyze();
    const doing = doingByUid();

    $('rep-alerts').innerHTML = inc.length ? `<details class="card nb-alert p-4" ${inc.length <= 6 ? 'open' : ''}>
        <summary class="nb-h" style="color:var(--ink-cherry)">🚨 Cùng tài khoản làm đề trên 2 máy cùng lúc <span class="chip bg-rose-100 text-rose-600">${inc.length}</span></summary>
        <div class="space-y-2 mt-3">${inc.slice(0, 60).map(x => {
            const [kind, tone] = CLASH_KINDS[x.kind];
            const side = (s) => `<span class="clash-side"><i class="fas ${deviceIcon(s.label)}"></i><b>${esc(s.label)}</b>${s.title ? `<small>${esc(s.title)}</small>` : ''}${s.start ? `<small>${fmtShort(s.start)}${s.end ? `–${fmtClock(s.end)}` : ' → đang làm'}</small>` : ''}</span>`;
            return `<div class="nb-alert-item p-3 space-y-2">
                <div class="flex flex-wrap items-center gap-2">${personBtn(x.uid)}<span class="chip ${tone}">${kind}</span>
                    <button type="button" class="btn ml-auto" style="--h:var(--hue-cherry);--hi:var(--ink-cherry)" data-act="kick-all" data-uid="${esc(x.uid)}"><i class="fas fa-power-off mr-1"></i>Đá mọi máy</button></div>
                <div class="clash-pair">${side(x.a)}<span class="clash-vs">⚡</span>${side(x.b)}</div>
            </div>`;
        }).join('')}
        ${inc.length > 60 ? `<p class="nb-tiny">… và ${inc.length - 60} lần khác (tick "Chỉ lượt 2 máy" để xem hết).</p>` : ''}</div>
    </details>` : '';

    $('rep-doing').innerHTML = doing.size ? `<details class="card p-4" style="--h:var(--hue-mint)" ${doing.size <= 6 ? 'open' : ''}>
        <summary class="nb-h" style="color:var(--ink-mint)">✏️ Đang làm, chưa nộp <span class="chip bg-emerald-100 text-emerald-700">${doing.size} người</span>
            <span class="nb-tiny">(bắt đầu trong ${RUN_MAX_MS / 3600000} giờ qua — có thể đã bỏ dở)</span></summary>
        <div class="grid sm:grid-cols-2 gap-2 mt-3">${[...doing.entries()].map(([uid, g]) => `<div class="mini-card ${g.devices.size >= 2 ? 'is-warn' : ''}">
            ${personBtn(uid, g.devices.size >= 2 ? '<span class="chip bg-amber-100 text-amber-700 ml-auto">2 máy</span>' : '')}
            ${g.runs.map(r => `<p class="nb-tiny mt-1"><i class="fas ${deviceIcon(r.label)} mr-1"></i>${esc(r.label || 'Thiết bị')} · <b>${esc(r.title || r.quizId)}</b>${MODES[r.mode] ? ` · ${MODES[r.mode]}` : ''} · ${ago(r.startedAt || r.atMs)}</p>`).join('')}
        </div>`).join('')}</div>
    </details>` : '';

    if (!results) { $('rep-list').innerHTML = fx.skeleton(3, 'card'); return; }
    const q = lc($('rep-search').value.trim());
    const onlyClash = $('rep-only-clash').checked;
    const shown = results.filter(r => matchesQ(r, q) && (!onlyClash || r.flags.length));
    const shownGuests = onlyClash ? [] : guests.filter(g => guestMatches(g, q));
    const html = repView === 'quiz' ? renderByQuiz(shown, shownGuests, q) : renderByUser(shown, shownGuests, q);
    $('rep-list').innerHTML = html || empty(resultsError ? esc(resultsError)
        : results.length || guests.length ? 'Không có lượt nào khớp bộ lọc 🔍' : `Chưa ai làm đề trong ${RANGES[rangeDays]} 🌸`);
}

function renderByQuiz(list, gs = [], q = '') {
    const byQuiz = groupBy(list, 'quizId');
    const guestByQuiz = groupBy(gs, 'quizId');
    const quizzes = [...new Set([...byQuiz.keys(), ...guestByQuiz.keys()])].map(id => {
        const rs = byQuiz.get(id) || [], g = guestByQuiz.get(id) || [];
        return {
            id, rs, gs: g, people: groupBy(rs, 'uid'),
            title: rs.find(r => r.title)?.title || g.find(x => x.title)?.title || '',
            devices: new Set(rs.filter(r => r.device).map(r => r.uid + '|' + r.device)).size + new Set(g.map(x => x.device)).size
        };
    }).sort((a, b) => b.devices - a.devices || b.rs.length - a.rs.length);

    return quizzes.slice(0, 150).map((qz, qi) => {
        const flagged = qz.rs.filter(r => r.flags.length).length;
        const graded = [...qz.rs.map(r => r.pct), ...qz.gs.filter(g => g.done && g.pct != null).map(g => g.pct)];
        const avg = graded.length ? Math.round(graded.reduce((s, p) => s + p, 0) / graded.length) : null;
        const people = [...qz.people.entries()].sort((a, b) => (b[1].some(r => r.flags.length) - a[1].some(r => r.flags.length)) || b[1].length - a[1].length);
        const row = ([uid, rs]) => {
            const labels = [...new Set(rs.map(r => r.label).filter(Boolean))];
            return `<div class="prow ${rs.some(r => r.flags.length) ? 'is-flag' : ''}">${personBtn(uid, '', q)}
                ${bubbles(rs)}
                <span class="prow-meta">${rs.length} lượt${labels.length ? ` · <i class="fas ${deviceIcon(labels[0])}"></i> ${labels.length} máy` : ''}</span></div>`;
        };
        const grow = (g) => `<div class="prow is-guest"><span class="who"><span class="ava ava-guest">🕶️</span>
            <span class="min-w-0"><b>${esc(g.label || 'Máy chưa rõ')}</b><small>khách chưa đăng nhập</small></span></span>
            <span class="bubs">${guestBubble(g)}</span><span class="prow-meta">${g.attempts} lượt</span></div>`;
        const rows = [...people.map(row), ...qz.gs.sort((a, b) => b.end - a.end).map(grow)];
        const SHOW = 6;
        // Bục top 3 (điểm cao nhất của từng người) + thanh phân bố điểm giỏi / khá / cần cố gắng
        const podium = people.map(([uid, rs]) => ({ uid, pct: Math.max(...rs.map(r => r.pct)) })).sort((a, b) => b.pct - a.pct).slice(0, 3);
        const dist = [graded.filter(p => p >= 80).length, graded.filter(p => p >= 50 && p < 80).length, graded.filter(p => p < 50).length];
        const extras = graded.length >= 2 ? `<div class="qextra">
            ${podium.length >= 2 ? `<div class="podium">${podium.map((b, i) => `<button type="button" class="pod pod-${i + 1}" data-act="open" data-uid="${esc(b.uid)}" title="${esc(nameOf(person(b.uid)))} · cao nhất ${b.pct}%">
                <span class="pod-m">${['🥇', '🥈', '🥉'][i]}</span>${avatar(b.uid, nameOf(person(b.uid)))}<b>${esc(nameOf(person(b.uid)))}</b><span class="pod-p">${b.pct}%</span></button>`).join('')}</div>` : ''}
            <div class="dist-wrap"><div class="dist" title="${dist[0]} lượt từ 80% · ${dist[1]} lượt 50–79% · ${dist[2]} lượt dưới 50%">
                ${dist[0] ? `<i class="d-good" style="flex:${dist[0]}">${dist[0]}</i>` : ''}${dist[1] ? `<i class="d-mid" style="flex:${dist[1]}">${dist[1]}</i>` : ''}${dist[2] ? `<i class="d-low" style="flex:${dist[2]}">${dist[2]}</i>` : ''}</div>
                <span class="nb-tiny">giỏi · khá · cần cố gắng</span></div>
        </div>` : '';
        return `<article class="card qcard p-4" style="--h:var(--hue-${AVA_HUES[qi % AVA_HUES.length]})">
            <header class="flex flex-wrap items-start gap-2 mb-3">
                <div class="min-w-0 flex-1">
                    <h3 class="qtitle"><span class="marker">${fx.hl(qz.title || 'Đề chưa rõ tên', q)}</span></h3>
                    <p class="nb-tiny truncate">Mã đề: ${esc(qz.id)}</p>
                </div>
                <a href="../quiz/quiz.html?id=${encodeURIComponent(qz.id)}" target="_blank" rel="noopener" class="btn" title="Mở đề ở tab mới"><i class="fas fa-up-right-from-square"></i></a>
            </header>
            <div class="qstats">
                <span><b>${qz.people.size}</b> người</span>
                <span><b>${qz.devices}</b> máy</span>
                <span><b>${qz.rs.length + qz.gs.reduce((s, g) => s + g.attempts, 0)}</b> lượt</span>
                <span><b>${avg != null ? avg + '%' : '—'}</b> trung bình</span>
                ${flagged ? `<span class="is-flag"><b>${flagged}</b> lượt 2 máy</span>` : ''}
            </div>
            ${extras}
            <div class="space-y-1.5 mt-3">${rows.slice(0, SHOW).join('')}</div>
            ${rows.length > SHOW ? `<details class="more"><summary>Xem thêm ${rows.length - SHOW} dòng</summary><div class="space-y-1.5 mt-1.5">${rows.slice(SHOW).join('')}</div></details>` : ''}
        </article>`;
    }).join('') + (quizzes.length > 150 ? `<p class="nb-tiny text-center">Đang hiện 150/${quizzes.length} đề — gõ vào ô tìm để thu hẹp.</p>` : '');
}

function renderByUser(list, gs = [], q = '') {
    const people = [...groupBy(list, 'uid').entries()]
        .map(([uid, rs]) => ({ uid, rs, flagged: rs.filter(r => r.flags.length).length }))
        .sort((a, b) => b.flagged - a.flagged || b.rs.length - a.rs.length);
    const quizRows = (rs) => [...groupBy(rs, 'quizId').values()].sort((a, b) => b.length - a.length).map(qs =>
        `<div class="prow"><span class="prow-title">${fx.hl(qs[0].title || qs[0].quizId, q)}</span>${bubbles(qs)}<span class="prow-meta">${qs.length} lượt</span></div>`).join('');
    let html = people.slice(0, 150).map(({ uid, rs, flagged }, i) => {
        const labels = [...new Set(rs.map(r => r.label).filter(Boolean))];
        return `<article class="card p-4" style="--h:var(--hue-${AVA_HUES[i % AVA_HUES.length]})">
            <header class="flex flex-wrap items-center gap-2 mb-2">${personBtn(uid, '', q)}
                <span class="flex flex-wrap gap-1 ml-auto">
                    <span class="chip bg-violet-100 text-violet-600">${rs.length} lượt · ${new Set(rs.map(r => r.quizId)).size} đề</span>
                    ${labels.length ? `<span class="chip ${labels.length >= 2 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}" title="${esc(labels.join(', '))}">${labels.length} máy</span>` : ''}
                    ${flagged ? `<span class="chip bg-rose-100 text-rose-600">🚨 ${flagged} lượt 2 máy</span>` : ''}
                </span></header>
            <div class="space-y-1.5">${quizRows(rs)}</div>
        </article>`;
    }).join('');
    if (people.length > 150) html += `<p class="nb-tiny text-center">Đang hiện 150/${people.length} người — gõ vào ô tìm để thu hẹp.</p>`;
    if (gs.length) {
        const byDev = [...groupBy(gs, 'device').values()];
        html += `<article class="card p-4" style="--h:var(--hue-sky)">
            <header class="flex flex-wrap items-center gap-2 mb-2"><span class="who"><span class="ava ava-guest">🕶️</span>
                <span><b>Khách chưa đăng nhập</b><small>${byDev.length} máy · ${new Set(gs.map(g => g.quizId)).size} đề</small></span></span></header>
            <div class="space-y-1.5">${byDev.slice(0, 60).map(ds => `<div class="prow"><span class="prow-title"><i class="fas ${deviceIcon(ds[0].label)} mr-1"></i>${esc(ds[0].label || 'Máy chưa rõ')}</span>
                <span class="bubs">${ds.map(g => guestBubble(g).replace('title="', `title="${esc(g.title || g.quizId)} · `)).join('')}</span>
                <span class="prow-meta">${ds.length} đề</span></div>`).join('')}</div>
        </article>`;
    }
    return html;
}

const csvCell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = "'" + s;                  // chặn Excel hiểu ô là công thức (tên người dùng tự đặt)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function downloadCsv(rows, name) {
    // BOM để Excel đọc đúng tiếng Việt
    const blob = new Blob(['﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function exportReport() {
    if (!results) return showToast('Lượt làm chưa tải xong.', 'warning');
    analyze();
    const q = lc($('rep-search').value.trim());
    const onlyClash = $('rep-only-clash').checked;
    const rows = [['Nộp lúc', 'Bắt đầu', 'Email', 'Tên', 'Đề', 'Mã đề', 'Điểm %', 'Số câu', 'Thời gian làm (phút)', 'Máy', 'Cảnh báo 2 máy']];
    for (const r of results.filter(r => matchesQ(r, q) && (!onlyClash || r.flags.length))) {
        const p = person(r.uid);
        rows.push([fmtDate(r.end), fmtDate(r.start), p.email, p.name, r.title, r.quizId, r.pct, r.total, Math.round(r.taken / 60),
            r.label, r.flags.length ? 'cùng lúc với ' + r.flags.join(', ') : '']);
    }
    // Máy khách: lượt cuối của mỗi máy × đề (cột Số câu ghi số lượt đã làm)
    for (const g of onlyClash ? [] : guests.filter(g => guestMatches(g, q))) {
        rows.push([g.done ? fmtDate(g.end) : '(chưa nộp)', fmtDate(g.start), '(khách chưa đăng nhập)', '', g.title, g.quizId,
            g.done && g.pct != null ? g.pct : '', `${g.attempts} lượt`, '', g.label, '']);
    }
    downloadCsv(rows, 'luot-lam-de');
    showToast(`Đã xuất ${rows.length - 1} dòng 📄`, 'success');
}

async function kick(uid, device, label) {
    const who = nameOf(person(uid));
    const ok = await showConfirm(device
        ? `Máy "${label || device}" của ${who} sẽ bị đăng xuất ngay (khi máy đó có mạng).`
        : `MỌI máy của ${who} sẽ bị đăng xuất ngay. Người đó đăng nhập lại được bình thường.`,
        { title: device ? 'Đá máy này?' : 'Đá mọi máy?', confirmText: 'Đăng xuất', tone: 'danger' });
    if (!ok) return;
    try {
        await adminRemoveDevices(uid, device || '');
        showToast(device ? 'Đã đá máy đó.' : 'Đã đá mọi máy.', 'success');
        if (openUid === uid) refreshDrawer();
    } catch (err) { showToast('Không đá được: ' + err.message, 'error', 5000); }
}

// Doc quiz_runs: mỗi tài khoản × máy một doc nên không phình nhiều; máy đổi id (xoá dữ liệu trình duyệt) thì doc cũ nằm lại → dọn sau 14 ngày.
// quiz_guest (máy khách): giữ 60 ngày để báo cáo 30 ngày còn đủ.
async function purgeRuns(manual) {
    const [a, b] = await Promise.all([
        getDocs(query(collection(db, 'quiz_runs'), where('at', '<', Timestamp.fromMillis(Date.now() - PURGE_AFTER_MS)), limit(400))),
        getDocs(query(collection(db, 'quiz_guest'), where('at', '<', Timestamp.fromMillis(Date.now() - GUEST_PURGE_MS)), limit(400))).catch(() => null)
    ]);
    const docs = [...a.docs, ...(b?.docs || [])];
    if (docs.length) {
        const batch = writeBatch(db);
        docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
    }
    if (manual) showToast(docs.length ? `Đã dọn ${docs.length} bản ghi cũ 🧹` : 'Sạch sẽ rồi, không có gì cần dọn ✨', 'success');
    if (manual && docs.length) logAction('purge-runs', '', { count: docs.length });
}

// ---------------- QUYỀN TÍNH NĂNG (core/features.js) ----------------
// Bấm là đổi NGAY trên màn hình (không chờ máy chủ, không tải lại cả trang); bấm liên tiếp trong 0,7 giây gộp thành MỘT lần gọi máy chủ /
// tài khoản; tối đa 4 tài khoản gửi cùng lúc (đổi hàng loạt không dội máy chủ). Lỗi → trả lại như cũ + báo.
// Máy người đó nhận quyền mới gần như ngay (core/device-limit.js nghe claimsAt).
const featOf = (u) => u.isAdmin ? { ...FULL_FEATURES } : normFeatures(u.features || DEFAULT_FEATURES);
const isFull = (u) => FEATURE_KEYS.every(k => featOf(u)[k]);
const featPending = new Map();       // uid → { timer, before: { features, featuresCustom }, payload, queued, sending }
const saveQueue = [];
let saving = 0;

function setFeatures(u, next) {
    if (!u || u.isAdmin) return;
    let p = featPending.get(u.uid);
    if (!p) featPending.set(u.uid, p = { before: { features: u.features, featuresCustom: u.featuresCustom } });
    if (next === null) { u.features = { ...DEFAULT_FEATURES }; u.featuresCustom = false; p.payload = null; }
    else { u.features = normFeatures(next); u.featuresCustom = true; p.payload = u.features; }
    paintUser(u.uid);
    paintSave();
    clearTimeout(p.timer);
    p.timer = setTimeout(() => { if (!p.queued) { p.queued = true; saveQueue.push(u); pumpSaves(); } }, 700);
}

/** Đổi quyền có HOÀN TÁC: chụp quyền cũ → đổi ngay → thẻ "Hoàn tác" 7 giây (hoặc Ctrl/⌘ Z). Bật thêm quyền thì bung sticker 🎉. */
function changeFeatures(list, fn, label, anchor) {
    list = list.filter(u => u && !u.isAdmin);
    if (!list.length) return;
    const plan = list.map(u => ({ u, before: u.featuresCustom ? { ...featOf(u) } : null, next: fn(u) }));
    const gained = plan.some(({ u, next }) => FEATURE_KEYS.some(k => normFeatures(next || DEFAULT_FEATURES)[k] && !featOf(u)[k]));
    plan.forEach(({ u, next }) => setFeatures(u, next));
    if (gained && anchor) fx.burstAt(anchor);
    fx.undoToast(label, () => { plan.forEach(({ u, before }) => setFeatures(u, before)); showToast('Đã hoàn tác ↶', 'info', 1500); });
}
const flip = (k) => (u) => ({ ...featOf(u), [k]: !featOf(u)[k] });

function pumpSaves() {
    while (saving < 4 && saveQueue.length) {
        const u = saveQueue.shift();
        saving++;
        flushFeatures(u).finally(() => { saving--; pumpSaves(); });
    }
}

async function flushFeatures(u) {
    const p = featPending.get(u.uid);
    if (!p) return;
    p.queued = false;
    p.sending = true;
    const payload = p.payload;
    paintSave();
    try {
        const r = await adminUpdateUser({ uid: u.uid, email: u.email, features: payload });
        if (featPending.get(u.uid) === p && p.payload === payload) {
            featPending.delete(u.uid);
            if (r.user) { u.features = r.user.features; u.featuresCustom = r.user.featuresCustom; u.approved = r.user.approved; }
        } else p.sending = false;                      // bấm tiếp trong lúc đang gửi → lượt hẹn giờ kế tiếp gửi bản mới nhất
    } catch (e) {
        if (featPending.get(u.uid) === p) {
            featPending.delete(u.uid);
            u.features = p.before.features;
            u.featuresCustom = p.before.featuresCustom;
        }
        showToast(`Chưa lưu được quyền của ${nameOf(u)}: ${e.message}`, 'error', 5000);
    }
    paintUser(u.uid);
    paintSave();
    if (curTab === 'home') queueRender();
}

function paintSave() {
    const el = $('save-state');
    const n = featPending.size;
    el.className = 'save-pill ' + (n ? 'is-busy' : 'is-idle');
    el.textContent = n ? `⏳ Đang lưu ${n} tài khoản…` : '💾 Đã lưu hết';
}
window.addEventListener('beforeunload', (e) => { if (featPending.size) { e.preventDefault(); e.returnValue = ''; } });

/** Vẽ lại ĐÚNG phần của một tài khoản (dòng trong bảng + ngăn chi tiết nếu đang mở) — không vẽ lại cả trang. */
function paintUser(uid) {
    const u = userMap.get(uid) || (drawerData?.user?.uid === uid ? drawerData.user : null);
    if (!u) return;
    const row = $('acc-list')?.querySelector(`[data-row="${CSS.escape(uid)}"]`);
    if (row) row.outerHTML = rowHtml(u, doingByUid(), clashUids());
    if (openUid === uid && drawerData) renderDrawer();
    if (curTab === 'accounts') paintHead();
}

// ---------------- QUYỀN TÀI KHOẢN (bảng ô) ----------------
async function loadUsers() {
    usersError = '';
    $('acc-summary').textContent = 'Đang tải danh sách tài khoản…';
    $('acc-reload').disabled = true;
    try {
        const r = await adminListAllUsers();
        users = r.users;
        userMap = new Map(users.map(u => [u.uid, u]));
        for (const uid of [...selected]) if (!userMap.has(uid)) selected.delete(uid);
    } catch (e) {
        usersError = `Không tải được tài khoản: ${e.message} (api/devices đã deploy + có FIREBASE_SERVICE_ACCOUNT chưa?)`;
    } finally { $('acc-reload').disabled = false; }
    renderStatus();
    renderCurrent();
}

function accLimit(u) { return limitFromConfig(access, u.email); }
function customLimit(u) { return access.deviceLimits[lc(u.email)] || null; }
function canPassword(u) {
    const e = lc(u.email);
    return ADMIN_EMAILS.includes(e) || access.passwordAllowed.includes(e) || access.deviceExempt.includes(e);
}

// Bộ lọc dạng nút: [khoá, nhãn, điều kiện] — nút có 0 tài khoản thì ẩn (trừ "Tất cả" và nút đang chọn) cho gọn
function accFilters(doing, clash) {
    return [
        ['all', '🌸 Tất cả', () => true],
        ['pinned', '⭐ Đã ghim', u => pins.has(u.uid)],
        ['memo', '📝 Có ghi chú', u => !!memos[u.uid]],
        ['doing', '✏️ Đang làm đề', u => doing.has(u.uid)],
        ['clash', '🚨 Làm 2 máy', u => clash.has(u.uid)],
        ['unapproved', '⏳ Chưa duyệt', u => !u.approved],
        ['locked', '🔒 Bị khoá', u => u.disabled],
        ['full', '✨ Full tính năng', isFull],
        ['default', '🌱 Mặc định', u => !u.isAdmin && !u.featuresCustom],
        ['custom', '🎀 Tuỳ chỉnh', u => !u.isAdmin && u.featuresCustom],
        ...FEATURE_KEYS.filter(k => !DEFAULT_FEATURES[k]).map(k => [`on-${k}`, `${FEAT_EMOJI[k]} Được ${FEATURES[k][0].toLowerCase()}`, u => featOf(u)[k]]),
        ...FEATURE_KEYS.filter(k => DEFAULT_FEATURES[k]).map(k => [`off-${k}`, `🚫 Tắt ${FEATURES[k][0].toLowerCase()}`, u => !featOf(u)[k]]),
        ...FEATURE_KEYS.filter(k => DEFAULT_FEATURES[k]).map(k => [`on-${k}`, `${FEAT_EMOJI[k]} Được ${FEATURES[k][0].toLowerCase()}`, u => featOf(u)[k]]).map(f => [...f, 'hidden']),
        ['password', '🔑 Đăng nhập thẳng', canPassword],
        ['limit', '📱 Số máy riêng', u => !!customLimit(u)]
    ];
}

/** Tài khoản khớp ô tìm + bộ lọc; ai cần chú ý (2 máy, đang làm) lên đầu. Dùng chung cho bảng và Xuất CSV. */
function filteredUsers(doing, clash) {
    const q = lc($('acc-search').value.trim());
    const f = accFilters(doing, clash).find(x => x[0] === accFilter) || ['all', '', () => true];
    // Xếp "thông minh": ghim ⭐ > làm 2 máy > đang làm > mới đăng nhập. Bấm tiêu đề cột để xếp theo tên / từng tính năng / số máy.
    const rank = (u) => (pins.has(u.uid) ? 4 : 0) + (clash.has(u.uid) ? 2 : 0) + (doing.has(u.uid) ? 1 : 0);
    const byName = (a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email, 'vi');
    const k = accSort.key, d = accSort.dir;
    const cmp = k === 'name' ? (a, b) => d * byName(a, b)
        : k === 'limit' ? (a, b) => d * (accLimit(b) - accLimit(a)) || byName(a, b)
        : k.startsWith('feat-') ? (a, b) => d * (featOf(b)[k.slice(5)] - featOf(a)[k.slice(5)]) || byName(a, b)
        : (a, b) => (rank(b) - rank(a)) || ((b.lastSignInAt || 0) - (a.lastSignInAt || 0));
    return users.filter(u => (!q || [u.email, u.displayName, u.uid, memos[u.uid]].some(v => lc(v).includes(q))) && f[2](u)).sort(cmp);
}
/** Bấm tiêu đề cột: lần 1 xếp, lần 2 đảo chiều, lần 3 về "thông minh". */
function setSort(key) {
    if (accSort.key !== key) accSort = { key, dir: 1 };
    else if (accSort.dir === 1) accSort = { key, dir: -1 };
    else accSort = { key: 'smart', dir: 1 };
    renderAccounts();
}
const sortMark = (key) => accSort.key === key ? (accSort.dir === 1 ? ' ▾' : ' ▴') : '';

let visibleUids = [];
function renderAccounts() {
    if (!started) return;
    if (!users) {
        $('acc-filters').innerHTML = '';
        $('acc-head').innerHTML = '';
        $('acc-list').innerHTML = usersError ? empty(esc(usersError)) : fx.skeleton(6, 'row');
        return;
    }
    const doing = doingByUid();
    const clash = clashUids();
    const filters = accFilters(doing, clash);
    $('acc-filters').innerHTML = filters.map(([k, label, fn, hidden]) => {
        const n = users.filter(fn).length;
        if (k !== accFilter && (hidden || (k !== 'all' && !n))) return '';
        return `<button type="button" class="fchip ${k === accFilter ? 'is-on' : ''}" data-filter="${k}">${label} <span>${n}</span></button>`;
    }).join('');
    const list = filteredUsers(doing, clash);
    visibleUids = list.slice(0, 300).map(u => u.uid);
    paintHead();
    $('acc-list').innerHTML = list.slice(0, 300).map(u => rowHtml(u, doing, clash)).join('')
        || `<div class="mtx-empty"><span class="doodle doodle-cloud"></span> Không có tài khoản nào khớp 🌸</div>`;
    $('acc-summary').textContent = `Đang hiện ${Math.min(list.length, 300)}/${list.length} tài khoản${list.length > 300 ? ' — gõ vào ô tìm để thu hẹp' : ''} · tổng ${users.length}`;
    paintBulk();
}

/** Hàng tiêu đề của bảng: số tài khoản đang bật từng tính năng (trong các dòng đang hiện) + ô chọn tất cả. */
function paintHead() {
    if (!users) return;
    const vis = visibleUids.map(id => userMap.get(id)).filter(Boolean);
    const allSel = vis.length > 0 && vis.every(u => selected.has(u.uid));
    $('acc-head').innerHTML = `<label class="mcheck" title="Chọn tất cả dòng đang hiện"><input type="checkbox" data-selall ${allSel ? 'checked' : ''}></label>
        <button type="button" class="mh-who" data-sort="name" title="Xếp theo tên (bấm lần nữa để đảo, lần ba về thông minh)">Tài khoản${sortMark('name')}${accSort.key === 'smart' ? ' <small>· xếp thông minh</small>' : ''}</button>
        ${FEATURE_KEYS.map(k => {
            const [name, , color, bg] = FEATURES[k];
            const on = vis.filter(u => featOf(u)[k]).length;
            return `<button type="button" class="mh-feat" data-sort="feat-${k}" style="--fc:${color};--fb:${bg}" title="${esc(FEATURES[k][4])} · mặc định ${DEFAULT_FEATURES[k] ? 'bật' : 'tắt'} · bấm để xếp">
                <span class="mh-ic">${FEAT_EMOJI[k]}</span>${name}${sortMark('feat-' + k)}<small>${on}/${vis.length}</small></button>`;
        }).join('')}
        <button type="button" class="mh-dev" data-sort="limit" title="Xếp theo số máy được dùng">Máy${sortMark('limit')}</button><span></span>`;
}

function rowHtml(u, doing, clash) {
    const g = doing.get(u.uid);
    const f = featOf(u);
    const custom = customLimit(u);
    const lim = accLimit(u);
    const pend = featPending.get(u.uid);
    const badges = [
        clash.has(u.uid) ? '<span class="chip bg-rose-100 text-rose-600">🚨 2 máy</span>' : '',
        g ? `<span class="chip bg-emerald-100 text-emerald-700"><span class="pulse"></span>đang làm</span>` : '',
        u.disabled ? '<span class="chip bg-slate-200 text-slate-600">🔒 khoá</span>' : '',
        !u.approved ? '<span class="chip bg-amber-100 text-amber-700">⏳ chưa duyệt</span>' : '',
        u.isAdmin ? '<span class="chip bg-amber-100 text-amber-700">👑 admin</span>' : '',
        !u.isAdmin && !u.featuresCustom ? '<span class="chip bg-emerald-50 text-emerald-600">🌱 mặc định</span>' : '',
        memos[u.uid] ? `<span class="chip bg-yellow-50 text-yellow-700" title="${esc(memos[u.uid])}">📝 ghi chú</span>` : '',
        pend ? `<span class="chip bg-pink-50 text-pink-500"><i class="fas ${pend.sending ? 'fa-spinner fa-spin' : 'fa-clock'}"></i>${pend.sending ? 'đang lưu' : 'sắp lưu'}</span>` : ''
    ].join('');
    const q = lc($('acc-search').value.trim());
    return `<div class="mrow ${selected.has(u.uid) ? 'is-sel' : ''} ${u.disabled ? 'is-off' : ''} ${pins.has(u.uid) ? 'is-pin' : ''}" data-row="${esc(u.uid)}">
        <label class="mcheck"><input type="checkbox" data-sel="${esc(u.uid)}" ${selected.has(u.uid) ? 'checked' : ''} ${u.isAdmin ? 'disabled' : ''}></label>
        <div class="mwho">
            <button type="button" class="mwho-open" data-open="${esc(u.uid)}" title="Mở chi tiết">${avatar(u.uid, u.displayName || u.email)}
                <span class="min-w-0"><b>${fx.hl(u.displayName || u.email.split('@')[0], q)}</b><small>${fx.hl(u.email, q)}</small>
                <span class="mbadges">${badges}</span></span></button>
            <button type="button" class="pin-btn ${pins.has(u.uid) ? 'is-on' : ''}" data-pin="${esc(u.uid)}" title="${pins.has(u.uid) ? 'Bỏ ghim' : 'Ghim lên đầu'}">⭐</button>
        </div>
        ${FEATURE_KEYS.map(k => {
            const [name, , color, bg] = FEATURES[k];
            return `<button type="button" class="tog ${f[k] ? 'is-on' : ''}" data-tog="${k}" data-uid="${esc(u.uid)}" ${u.isAdmin ? 'disabled' : ''}
                style="--fc:${color};--fb:${bg}" aria-pressed="${f[k]}" title="${esc(name)}: ${f[k] ? 'đang bật — bấm để tắt' : 'đang tắt — bấm để bật'}">
                <span class="tog-dot">${f[k] ? '✓' : '✕'}</span><small>${FEAT_EMOJI[k]} ${name}</small></button>`;
        }).join('')}
        <span class="mdev" title="${custom ? 'Số máy riêng' : 'Theo mặc định'}">${lim >= EXEMPT_MAX ? '∞' : lim}<small>${custom ? 'riêng' : 'máy'}</small></span>
        <button type="button" class="mmore" data-open="${esc(u.uid)}" title="Chi tiết"><i class="fas fa-chevron-right"></i></button>
    </div>`;
}

// Thanh đổi quyền hàng loạt
function paintBulk() {
    const show = curTab === 'accounts' && selected.size > 0;
    $('bulk-bar').classList.toggle('hidden', !show);
    if (!show) return;
    $('bulk-count').textContent = selected.size;
    $('bulk-feats').innerHTML = FEATURE_KEYS.map(k => {
        const [name, , color, bg] = FEATURES[k];
        return `<span class="bfeat" style="--fc:${color};--fb:${bg}">${FEAT_EMOJI[k]} ${name}
            <button type="button" data-bulk-feat="${k}" data-v="1" title="Bật ${name} cho các tài khoản đã chọn">bật</button>
            <button type="button" data-bulk-feat="${k}" data-v="0" title="Tắt ${name} cho các tài khoản đã chọn">tắt</button></span>`;
    }).join('');
}

async function applyBulk(fn, label, anchor) {
    const list = [...selected].map(id => userMap.get(id)).filter(u => u && !u.isAdmin);
    if (!list.length) return;
    if (list.length >= 10 && !await showConfirm(`${label} cho ${list.length} tài khoản?`, { title: 'Đổi quyền hàng loạt', confirmText: 'Đổi' })) return;
    changeFeatures(list, fn, `${label} · ${list.length} tài khoản`, anchor);
}

function exportCsv() {
    if (!users) return showToast('Danh sách tài khoản chưa tải xong.', 'warning');
    const doing = doingByUid();
    const clash = clashUids();
    const rows = [['Email', 'Tên', 'UID', ...FEATURE_KEYS.map(k => FEATURES[k][0]), 'Quyền', 'Đang làm đề (số máy)', 'Cảnh báo 2 máy', 'Đăng nhập thẳng',
        'Số máy được dùng', 'Số máy riêng', 'Đã duyệt', 'Bị khoá', 'Cách đăng nhập', 'Ngày tạo', 'Đăng nhập gần nhất']];
    for (const u of filteredUsers(doing, clash)) {
        const f = featOf(u);
        rows.push([u.email, u.displayName, u.uid, ...FEATURE_KEYS.map(k => f[k] ? 'bật' : 'tắt'), u.isAdmin ? 'admin' : u.featuresCustom ? 'tuỳ chỉnh' : 'mặc định',
            doing.get(u.uid)?.devices.size || 0, clash.has(u.uid) ? 'có' : '', canPassword(u) ? 'có' : '', accLimit(u),
            customLimit(u) || '', u.approved ? 'có' : 'chưa', u.disabled ? 'khoá' : '', (u.providers || []).join(' '),
            fmtDate(u.createdAt), fmtDate(u.lastSignInAt)]);
    }
    downloadCsv(rows, 'tai-khoan');
    showToast(`Đã xuất ${rows.length - 1} tài khoản 📄`, 'success');
}

function bindAccounts() {
    $('acc-search').addEventListener('input', renderAccounts);
    $('acc-reload').addEventListener('click', loadUsers);
    $('acc-export').addEventListener('click', exportCsv);
    $('acc-filters').addEventListener('click', (e) => {
        const b = e.target.closest('[data-filter]');
        if (b) { accFilter = b.dataset.filter; renderAccounts(); }
    });
    $('acc-head').addEventListener('click', (e) => { const s = e.target.closest('[data-sort]'); if (s) setSort(s.dataset.sort); });
    $('acc-head').addEventListener('change', (e) => {
        if (!e.target.matches('[data-selall]')) return;
        visibleUids.forEach(id => { const u = userMap.get(id); if (u && !u.isAdmin) e.target.checked ? selected.add(id) : selected.delete(id); });
        renderAccounts();
    });
    $('acc-list').addEventListener('change', (e) => {
        const id = e.target.dataset.sel;
        if (!id) return;
        e.target.checked ? selected.add(id) : selected.delete(id);
        e.target.closest('.mrow')?.classList.toggle('is-sel', e.target.checked);
        paintHead();
        paintBulk();
    });
    $('acc-list').addEventListener('click', (e) => {
        const t = e.target.closest('[data-tog]');
        if (t) {
            const u = userMap.get(t.dataset.uid), k = t.dataset.tog;
            if (u) changeFeatures([u], flip(k), `${featOf(u)[k] ? 'Tắt' : 'Bật'} ${FEATURES[k][0]} · ${nameOf(u)}`, t.querySelector('.tog-dot'));
            return;
        }
        const pin = e.target.closest('[data-pin]');
        if (pin) return togglePin(pin.dataset.pin);
        const o = e.target.closest('[data-open]');
        if (o) openDrawer(o.dataset.open, visibleUids);
    });
    $('bulk-bar').addEventListener('click', (e) => {
        const bf = e.target.closest('[data-bulk-feat]');
        if (bf) {
            const k = bf.dataset.bulkFeat, on = bf.dataset.v === '1';
            return applyBulk(u => ({ ...featOf(u), [k]: on }), `${on ? 'Bật' : 'Tắt'} ${FEATURES[k][0]}`, bf);
        }
        const b = e.target.closest('[data-bulk]');
        if (!b) return;
        const v = b.dataset.bulk;
        if (v === 'clear') { selected.clear(); return renderAccounts(); }
        if (v === 'full') return applyBulk(() => FULL_FEATURES, 'Mở full tính năng', b);
        if (v === 'default') return applyBulk(() => null, 'Đưa về mặc định', b);
        if (v === 'none') return applyBulk(() => Object.fromEntries(FEATURE_KEYS.map(k => [k, false])), 'Tắt hết tính năng', b);
    });
    $('acc-new-toggle').addEventListener('click', () => { $('acc-new').classList.toggle('hidden'); $('new-email').focus(); });
    $('new-create').addEventListener('click', async () => {
        const email = lc($('new-email').value.trim());
        const password = $('new-pass').value;
        const displayName = $('new-name').value.trim();
        const lim = $('new-limit').value ? Number($('new-limit').value) : null;
        if (!email.includes('@')) return showToast('Email không hợp lệ.', 'warning');
        if (password.length < 6) return showToast('Mật khẩu phải từ 6 ký tự.', 'warning');
        if (lim !== null && !(Number.isInteger(lim) && lim >= 1 && lim <= EXEMPT_MAX)) return showToast(`Số máy từ 1 đến ${EXEMPT_MAX}.`, 'warning');
        const btn = $('new-create');
        btn.disabled = true;
        try {
            const r = await adminCreateUser({ email, password, displayName, allowPassword: $('new-allow-pw').checked, unlimitedDevices: false,
                ...($('new-full').checked ? { features: FULL_FEATURES } : {}) });
            if (lim !== null) await adminUpdateUser({ uid: r.user.uid, email, deviceLimit: lim });
            showToast(`${r.created ? 'Đã tạo' : 'Đã cập nhật'} ${email} 🎉`, 'success');
            ['new-email', 'new-pass', 'new-name', 'new-limit'].forEach(id => { $(id).value = ''; });
            $('new-full').checked = false;
            $('acc-new').classList.add('hidden');
            await loadUsers();
            openDrawer(r.user.uid);
        } catch (err) { showToast('Lỗi: ' + err.message, 'error', 5000); }
        finally { btn.disabled = false; }
    });
}

// ---------------- NGĂN CHI TIẾT TÀI KHOẢN ----------------
const DRAWER_TABS = [['perm', '🎀 Quyền'], ['dev', '📱 Máy'], ['quiz', '📚 Làm đề'], ['edit', '✏️ Sửa']];

function bindDrawer() {
    $('acc-drawer').addEventListener('click', (e) => {
        if (e.target.closest('[data-close]')) return closeDrawer();
        const st = e.target.closest('[data-dtab]');
        if (st) { drawerTab = st.dataset.dtab; return renderDrawer(); }
        const u = drawerData?.user;
        const tile = e.target.closest('[data-dfeat]');
        if (tile && u) {
            const k = tile.dataset.dfeat;
            return changeFeatures([u], flip(k), `${featOf(u)[k] ? 'Tắt' : 'Bật'} ${FEATURES[k][0]} · ${nameOf(u)}`, tile.querySelector('.ftile-ic'));
        }
        const all = e.target.closest('[data-dfeat-all]');
        if (all && u) {
            const v = all.dataset.dfeatAll;
            return changeFeatures([u], () => v === 'full' ? FULL_FEATURES : v === 'none' ? Object.fromEntries(FEATURE_KEYS.map(k => [k, false])) : null,
                `${v === 'full' ? 'Mở full' : v === 'none' ? 'Tắt hết' : 'Về mặc định'} · ${nameOf(u)}`, all);
        }
        if (e.target.closest('#dr-prev')) return stepDrawer(-1);
        if (e.target.closest('#dr-next')) return stepDrawer(1);
        const pin = e.target.closest('[data-pin]');
        if (pin) return togglePin(pin.dataset.pin);
        const b = e.target.closest('[data-do]');
        if (b) drawerAction(b.dataset.do, b);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openUid && !fx.isOpen()) closeDrawer(); });
    // Ghi chú riêng: lưu ngay khi gõ (chỉ trên máy này), cập nhật huy hiệu 📝 ở dòng trong bảng
    $('acc-drawer').addEventListener('input', (e) => {
        if (e.target.id !== 'dr-memo' || !openUid) return;
        const v = e.target.value.slice(0, 1000);
        if (v.trim()) memos[openUid] = v; else delete memos[openUid];
        saveMemos();
        const row = $('acc-list')?.querySelector(`[data-row="${CSS.escape(openUid)}"]`);
        const u = userMap.get(openUid);
        if (row && u) row.outerHTML = rowHtml(u, doingByUid(), clashUids());
    });
    fx.onSwipe($('acc-drawer').querySelector('aside'), { right: closeDrawer });
}
function closeDrawer() {
    openUid = null;
    drawerData = null;
    $('acc-drawer').classList.add('hidden');
    document.documentElement.style.overflow = '';
}

/** Mở chi tiết; `list` = thứ tự để lật ‹ › (mặc định: bảng tài khoản đang hiện). keepTab: lật sang người khác vẫn giữ tab con đang xem. */
async function openDrawer(uid, list, keepTab = false) {
    if (!uid) return;
    openUid = uid;
    drawerData = null;
    if (!keepTab) drawerTab = 'perm';
    drawerList = Array.isArray(list) && list.includes(uid) ? [...list]
        : drawerList.includes(uid) ? drawerList : visibleUids.includes(uid) ? [...visibleUids] : [uid];
    const wasOpen = !$('acc-drawer').classList.contains('hidden');
    $('acc-drawer').classList.remove('hidden');
    if (!wasOpen) { const a = $('acc-drawer').querySelector('aside'); a.classList.remove('dr-in'); void a.offsetWidth; a.classList.add('dr-in'); }
    document.documentElement.style.overflow = 'hidden';
    const u = userMap.get(uid);
    $('drawer-title').textContent = u ? (u.displayName || u.email) : 'Đang mở…';
    paintDrawerNav();
    $('drawer-body').innerHTML = fx.skeleton(4, 'card');
    await refreshDrawer();
}
function stepDrawer(d) {
    const i = drawerList.indexOf(openUid);
    const next = drawerList[i + d];
    if (i >= 0 && next) openDrawer(next, drawerList, true);
}
function paintDrawerNav() {
    const i = drawerList.indexOf(openUid), n = drawerList.length;
    $('dr-prev').disabled = i <= 0;
    $('dr-next').disabled = i < 0 || i >= n - 1;
    $('dr-pos').textContent = n > 1 && i >= 0 ? `${i + 1}/${n}` : '';
}
function togglePin(uid) {
    if (pins.has(uid)) pins.delete(uid); else pins.add(uid);
    savePins();
    showToast(pins.has(uid) ? 'Đã ghim ⭐ — lên đầu danh sách' : 'Đã bỏ ghim', 'info', 1400);
    if (curTab === 'accounts') renderAccounts(); else paintUser(uid);
    if (openUid === uid) renderDrawer();
}

async function refreshDrawer() {
    const uid = openUid;
    try {
        const [acc, res] = await Promise.all([
            adminLookupUser(uid),
            getDocs(query(collection(db, 'quiz_results'), where('userId', '==', uid), orderBy('completedAt', 'desc'), limit(30)))
                .then(s => s.docs.map(d => normResult(d.id, d.data()))).catch(() => null)
        ]);
        if (openUid !== uid) return;
        // Đang có thay đổi quyền chưa lưu → giữ bản đang hiện trên màn (máy chủ chưa biết)
        const local = userMap.get(uid);
        if (local && featPending.has(uid)) { acc.user.features = local.features; acc.user.featuresCustom = local.featuresCustom; }
        drawerData = { ...acc, results: res };
        // Lần tải mới (mở / sau khi chỉnh): bỏ chữ đã gõ ở lần trước — renderDrawer chỉ giữ chữ khi vẽ lại do dữ liệu mới về
        ['dr-limit', 'dr-name', 'dr-pass', 'dr-memo'].forEach(id => $(id)?.remove());
        if (local) Object.assign(local, acc.user); else userMap.set(uid, acc.user);
        drawerData.user = userMap.get(uid);
        if (users && !users.includes(drawerData.user)) { const i = users.findIndex(u => u.uid === uid); if (i >= 0) users[i] = drawerData.user; }
        renderDrawer();
        if (curTab === 'accounts') paintUser(uid);
    } catch (e) {
        if (openUid !== uid) return;
        $('drawer-title').textContent = 'Lỗi';
        $('drawer-body').innerHTML = `<p class="font-bold" style="color:var(--ink-cherry)">${esc(e.message)}</p>`;
    }
}

function section(title, body, hue = 'blossom') {
    return `<div class="card p-4 space-y-2.5" style="--h:var(--hue-${hue})"><p class="nb-h">${title}</p>${body}</div>`;
}
/** Dòng công tắc (đăng nhập thẳng / 20 máy / duyệt / khoá). */
function srow(id, on, emoji, label, hint, disabled, hue = 'mint') {
    return `<button type="button" data-do="${id}" ${disabled ? 'disabled' : ''} class="srow ${on ? 'is-on' : ''}" style="--fc:var(--ink-${hue});--fb:color-mix(in srgb, var(--hue-${hue}) 18%, var(--paper))">
        <span class="srow-ic">${emoji}</span><span class="min-w-0 flex-1 text-left"><b>${label}</b><small>${esc(hint)}</small></span>
        <span class="fswitch"><i></i></span></button>`;
}

function featureTiles(u) {
    const f = featOf(u);
    const state = u.isAdmin ? '<span class="chip bg-amber-100 text-amber-700">👑 admin · mở hết</span>'
        : featPending.has(u.uid) ? `<span class="chip bg-pink-50 text-pink-500"><i class="fas fa-spinner fa-spin"></i>đang lưu…</span>`
        : isFull(u) ? '<span class="chip bg-violet-100 text-violet-600">✨ full tính năng</span>'
        : !u.featuresCustom ? '<span class="chip bg-emerald-50 text-emerald-600">🌱 đang theo mặc định</span>' : '<span class="chip bg-pink-50 text-pink-500">🎀 tuỳ chỉnh</span>';
    return section(`✨ Tính năng được dùng ${state}`, `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">${FEATURE_KEYS.map(k => {
            const [name, , color, bg, desc] = FEATURES[k];
            return `<button type="button" class="ftile ${f[k] ? 'is-on' : ''}" data-dfeat="${k}" ${u.isAdmin ? 'disabled' : ''} style="--fc:${color};--fb:${bg}" aria-pressed="${f[k]}">
                <span class="ftile-ic">${FEAT_EMOJI[k]}</span>
                <span class="min-w-0 flex-1 text-left"><b>${name}</b><small>${esc(desc)}</small></span>
                <span class="fswitch"><i></i></span></button>`;
        }).join('')}</div>
        <div class="flex flex-wrap gap-2 ${u.isAdmin ? 'opacity-50 pointer-events-none' : ''}">
            <button type="button" class="btn btn-candy" data-dfeat-all="full">✨ Mở full</button>
            <button type="button" class="btn" style="--h:var(--hue-mint);--hi:var(--ink-mint)" data-dfeat-all="default" title="Làm đề + Học nhóm">🌱 Về mặc định</button>
            <button type="button" class="btn" data-dfeat-all="none">🚫 Tắt hết</button>
        </div>
        <p class="nb-tiny">Không cần tài khoản vẫn dùng được: tính điểm hệ 4, đề công khai, phòng học có link. Đổi quyền thì máy người đó nhận trong vài giây.</p>`, 'lav');
}

function renderDrawer() {
    const d = drawerData;
    if (!d) return;
    const u = d.user;
    const isAdm = !!u.isAdmin;
    const custom = customLimit(u);
    const lim = accLimit(u);
    const limSrc = isAdm ? 'admin' : custom ? 'số riêng' : access.deviceExempt.includes(lc(u.email)) ? 'đặc cách 20 máy' : 'mặc định';
    const doing = doingByUid().get(u.uid);
    const doingDevices = doing ? doing.devices : new Set();
    const myIncidents = analyze().filter(x => x.uid === u.uid);
    const myResults = (results || []).filter(r => r.uid === u.uid).length;
    $('drawer-title').textContent = u.displayName || u.email;
    paintDrawerNav();

    const head = `<div class="card dr-card p-4" style="--h:var(--hue-blossom)">
        <div class="flex items-center gap-3">
            ${avatar(u.uid, u.displayName || u.email, 'ava-lg')}
            <div class="min-w-0 flex-1">
                <p class="dr-name">${esc(u.displayName || u.email.split('@')[0])}</p>
                <p class="nb-tiny break-all">${esc(u.email)} ${u.emailVerified ? '<i class="fas fa-circle-check" style="color:var(--ink-mint)" title="Email đã xác nhận"></i>' : '· chưa xác nhận email'}</p>
            </div>
            <button type="button" class="pin-btn ${pins.has(u.uid) ? 'is-on' : ''}" data-pin="${esc(u.uid)}" title="${pins.has(u.uid) ? 'Bỏ ghim' : 'Ghim lên đầu danh sách'}">⭐</button>
        </div>
        <div class="flex flex-wrap gap-1 mt-2">
            ${isAdm ? '<span class="chip bg-amber-100 text-amber-700">👑 Admin</span>' : ''}
            ${doing ? `<span class="chip bg-emerald-100 text-emerald-700"><span class="pulse"></span>đang làm đề${doing.devices.size >= 2 ? ` · ${doing.devices.size} máy` : ''}</span>` : ''}
            ${myIncidents.length ? `<span class="chip bg-rose-100 text-rose-600">🚨 ${myIncidents.length} lần làm 2 máy</span>` : ''}
            ${u.disabled ? '<span class="chip bg-slate-200 text-slate-600">🔒 Bị khoá</span>' : ''}
            ${!u.approved ? '<span class="chip bg-amber-100 text-amber-700">⏳ Chưa duyệt</span>' : ''}
            ${(u.providers || []).map(p => p === 'google.com' ? '<span class="chip bg-sky-50 text-sky-600"><i class="fab fa-google"></i> Google</span>' : p === 'password' ? '<span class="chip bg-slate-100 text-slate-500">🔑 Mật khẩu</span>' : '').join('')}
        </div>
        <div class="mini-stats mt-3">
            <span><b>${myResults}</b><small>lượt nộp · ${rangeDays === 1 ? 'hôm nay' : rangeDays + ' ngày'}</small></span>
            <span><b>${d.devices.length}/${lim >= EXEMPT_MAX ? '∞' : lim}</b><small>máy đang đăng nhập</small></span>
            <span><b>${ago(u.lastSignInAt).replace(' trước', '')}</b><small>lần đăng nhập cuối</small></span>
        </div>
        <label class="memo mt-3"><span>📝 Ghi chú riêng <small>(chỉ lưu trên máy này)</small></span>
            <textarea id="dr-memo" rows="2" maxlength="1000" placeholder="vd: lớp Y4, nhờ mở tạo đề tới hết tháng…">${esc(memos[u.uid] || '')}</textarea></label>
    </div>`;

    const tabs = `<div class="stabs">${DRAWER_TABS.map(([k, label]) => {
        const badge = k === 'dev' ? d.devices.length : k === 'quiz' && myIncidents.length ? '🚨' : '';
        return `<button type="button" class="${k === drawerTab ? 'is-on' : ''}" data-dtab="${k}">${label}${badge !== '' && badge !== 0 ? `<span>${badge}</span>` : ''}</button>`;
    }).join('')}</div>`;

    let body = '';
    if (drawerTab === 'perm') {
        body = featureTiles(u) + section('🔐 Đăng nhập & duyệt', `<div class="space-y-2">
            ${srow('approved', u.approved, '✅', 'Đã duyệt', 'Tắt: đăng nhập được nhưng không tạo được bộ đề, thư mục, phòng, bệnh án', isAdm, 'mint')}
            ${srow('pw', canPassword(u), '🔑', 'Đăng nhập thẳng (miễn Google)', 'Bật: vào bằng email + mật khẩu, không bắt gắn Google', isAdm, 'sky')}
            ${srow('unlim', isAdm || access.deviceExempt.includes(lc(u.email)), '♾️', 'Đặc cách 20 máy', 'Bật: dùng tối đa 20 máy (số riêng vẫn được ưu tiên)', isAdm, 'lav')}
            ${srow('lock', u.disabled, '⛔', 'Khoá tài khoản', 'Bật: không đăng nhập được, mọi máy bị đá ra', isAdm, 'cherry')}
        </div>`, 'mint') + section('📱 Số máy được dùng', `
            <p class="text-[13px]">Đang áp dụng: <b>${lim >= EXEMPT_MAX ? `${EXEMPT_MAX} (coi như không giới hạn)` : lim} máy</b> <span class="nb-tiny">(${limSrc})</span></p>
            <div class="flex flex-wrap items-center gap-2 ${isAdm ? 'opacity-50 pointer-events-none' : ''}">
                <span class="flex gap-1">${[1, 2, 3, 5].map(n => `<button type="button" data-do="quick-limit" data-n="${n}" class="btn num ${custom === n ? 'btn-candy' : ''}">${n}</button>`).join('')}</span>
                <input id="dr-limit" type="number" min="1" max="${EXEMPT_MAX}" value="${custom || ''}" placeholder="số khác" class="inp w-24">
                <button type="button" data-do="set-limit" class="btn">Đặt</button>
                ${custom ? '<button type="button" data-do="clear-limit" class="btn">↺ Về mặc định</button>' : ''}
            </div>
            <p class="nb-tiny">Hạ số máy thì máy đăng nhập lâu nhất bị đẩy ra ngay.</p>`, 'sky');
    } else if (drawerTab === 'dev') {
        body = section(`📱 Máy đang đăng nhập (${d.devices.length})`, `
            <ul class="space-y-1.5">${d.devices.map(x => `<li class="dev-item">
                <span class="dev-ic"><i class="fas ${deviceIcon(x.label || '')}"></i></span>
                <span class="min-w-0 flex-1"><b>${esc(x.label || 'Thiết bị')}</b>${doingDevices.has(x.id) ? ' <span class="chip bg-emerald-100 text-emerald-700"><span class="pulse"></span>đang làm đề</span>' : ''}
                    <small>từ ${fmtDate(x.at)}${placeOf(x) ? ' · ' + esc(placeOf(x)) : ''}${x.ip ? ' · ' + esc(x.ip) : ''}</small></span>
                <button type="button" data-do="kick" data-device="${esc(x.id)}" data-label="${esc(x.label || '')}" class="btn" style="--h:var(--hue-cherry);--hi:var(--ink-cherry)">Đá</button>
            </li>`).join('') || '<li class="nb-tiny">Chưa có máy nào (đăng nhập lại sẽ ghi).</li>'}</ul>
            <div class="flex flex-wrap gap-2 pt-1">
                <button type="button" data-do="kick-all" class="btn" style="--h:var(--hue-cherry);--hi:var(--ink-cherry)"><i class="fas fa-power-off mr-1"></i>Đá mọi máy</button>
                <button type="button" data-do="revoke" class="btn bg-red-500" title="Đá mọi máy và vô hiệu mọi phiên đăng nhập (token) — kể cả phiên chưa ghi vào danh sách"><i class="fas fa-user-slash mr-1"></i>Thu hồi mọi phiên</button>
            </div>`, 'sky') + section('🕰️ Lịch sử đăng nhập', `<ul class="space-y-1">${(d.logins || []).map(l => `<li class="login-item ${l.alert ? 'is-alert' : ''}">
                <b>${fmtDate(l.at)}</b> · ${esc(l.label || '')}${placeOf(l) ? ' · ' + esc(placeOf(l)) : ''}${l.ip ? ' · ' + esc(l.ip) : ''}
                ${l.alert ? `<span class="block font-bold">⚠️ ${esc(l.alert)}</span>` : ''}</li>`).join('') || '<li class="nb-tiny">Chưa có.</li>'}</ul>`, 'latte');
    } else if (drawerTab === 'quiz') {
        // Cờ 2 máy: lấy từ lượt làm đang tải (có so chồng giờ); lượt cũ hơn khoảng đang xem thì chỉ có cờ máy tự phát hiện
        const flagged = new Map((results || []).filter(r => r.flags.length).map(r => [r.id, r.flags]));
        (d.results || []).forEach(r => { r.flags = flagged.get(r.id) || (r.clash ? [r.clash] : []); });
        body = (doing ? section(`✏️ Đang làm, chưa nộp (${doing.runs.length} máy)`, doing.runs.map(r =>
            `<p class="text-[13px]"><i class="fas ${deviceIcon(r.label)} mr-1"></i><b>${esc(r.label || 'Thiết bị')}</b> · ${esc(r.title || r.quizId)} · bắt đầu ${ago(r.startedAt || r.atMs)}</p>`).join(''), 'mint') : '')
            + (myIncidents.length ? section(`🚨 Làm đề trên 2 máy cùng lúc`, myIncidents.map(x =>
                `<div class="nb-alert-item p-2 text-[12.5px]"><b>${esc(CLASH_KINDS[x.kind][0])}</b> · ${fmtShort(x.a.start || x.at)}
                    <div class="clash-pair mt-1"><span class="clash-side"><b>${esc(x.a.label)}</b><small>${esc(x.a.title || '')}</small></span><span class="clash-vs">⚡</span>
                    <span class="clash-side"><b>${esc(x.b.label)}</b><small>${esc(x.b.title || '')}</small></span></div></div>`).join(''), 'cherry') : '')
            + section('📚 30 lượt nộp gần nhất', d.results === null
                ? '<p class="nb-tiny" style="color:var(--ink-cherry)">Không đọc được — đã deploy luật Firestore mới và chỉ mục quiz_results (userId + completedAt) chưa?</p>'
                : d.results.length ? `<div class="space-y-1.5">${d.results.map(r => `<div class="prow ${r.flags.length ? 'is-flag' : ''}">
                    <span class="prow-title">${esc(r.title || r.quizId)}</span>${bubble(r)}
                    <span class="prow-meta">${fmtShort(r.end)}${r.label ? ` · <i class="fas ${deviceIcon(r.label)}"></i>` : ''}</span></div>`).join('')}</div>`
                : '<p class="nb-tiny">Chưa nộp bài nào 🌱</p>', 'blossom');
    } else {
        body = section('✏️ Đổi tên & mật khẩu', `
            <div class="flex gap-2"><input id="dr-name" class="inp flex-1" value="${esc(u.displayName || '')}" placeholder="Tên hiển thị / username" autocomplete="off">
                <button type="button" data-do="rename" class="btn">Đổi tên</button></div>
            <div class="flex gap-2"><input id="dr-pass" class="inp flex-1" placeholder="Mật khẩu mới (≥ 6 ký tự)" autocomplete="off">
                <button type="button" data-do="setpass" class="btn btn-candy">Đổi mật khẩu</button></div>`, 'peach')
            + section('📣 Nhắn riêng', `<p class="nb-tiny">Mở mục Gửi thông báo, điền sẵn email người này.</p>
                <button type="button" data-do="notify" class="btn" style="--h:var(--hue-sky);--hi:var(--ink-sky)"><i class="fas fa-bullhorn mr-1"></i>Gửi thông báo riêng</button>`, 'sky')
            + section('🗂️ Thông tin', `<p class="nb-tiny break-all">UID: ${esc(u.uid)}</p>
                <p class="nb-tiny">Tạo: ${fmtDate(u.createdAt)} · Đăng nhập gần nhất: ${fmtDate(u.lastSignInAt)}</p>`, 'latte')
            + (isAdm ? '' : section('🗑️ Vùng nguy hiểm', `<p class="nb-tiny">Xoá vĩnh viễn tài khoản khỏi hệ thống — không hoàn tác được.</p>
                <button type="button" data-do="delete" class="btn bg-red-500"><i class="fas fa-trash mr-1"></i>Xoá tài khoản</button>`, 'cherry'));
    }

    // Dữ liệu mới về → vẽ lại ngăn này: giữ chữ đang gõ dở + ô đang chọn + vị trí cuộn
    const keep = ['dr-limit', 'dr-name', 'dr-pass', 'dr-memo'].map(id => [id, $(id)?.value]).filter(([, v]) => v != null);
    const focused = document.activeElement?.id;
    const scroller = $('drawer-body').parentElement;
    const top = scroller.scrollTop;
    $('drawer-body').innerHTML = head + tabs + body;
    keep.forEach(([id, v]) => { if ($(id)) $(id).value = v; });
    if (focused && $(focused)) $(focused).focus();
    scroller.scrollTop = top;
}

async function drawerAction(act, btn) {
    const d = drawerData;
    if (!d) return;
    const u = d.user;
    // Đổi quyền / số máy: hiện kết quả NGAY (optimistic) rồi mới gửi máy chủ; máy chủ trả bản thật thì cập nhật đúng chỗ — không tải lại cả ngăn.
    // Lỗi → trả lại như cũ. `guess(u, access)` = sửa tạm trên máy cho khớp điều sắp xảy ra.
    const run = async (payload, okMsg, guess) => {
        const before = { u: { ...u }, access: { ...access, deviceExempt: [...access.deviceExempt], passwordAllowed: [...access.passwordAllowed], deviceLimits: { ...access.deviceLimits } } };
        if (guess) { guess(u, access); paintUser(u.uid); }
        else btn.disabled = true;
        try {
            const r = await adminUpdateUser({ uid: u.uid, email: u.email, ...payload });
            if (r.user?.uid === u.uid) {
                const keepFeat = featPending.has(u.uid) ? { features: u.features, featuresCustom: u.featuresCustom } : {};
                Object.assign(u, r.user, keepFeat);
            }
            showToast(okMsg, 'success', 2000);
            // Khoá / hạ số máy / thu hồi phiên / đổi tên… làm đổi danh sách máy hoặc dữ liệu khác → tải lại ngăn ở nền (màn hình đã đổi rồi)
            if (!guess || 'disabled' in payload || 'deviceLimit' in payload) refreshDrawer();
        } catch (e) {
            Object.assign(u, before.u);
            access = before.access;
            showToast('Lỗi: ' + e.message, 'error', 5000);
            if (!guess) btn.disabled = false;
        }
        paintUser(u.uid);
    };
    const em = lc(u.email);
    const listSet = (arr, on) => { const i = arr.indexOf(em); if (on && i < 0) arr.push(em); if (!on && i >= 0) arr.splice(i, 1); };
    const nLimit = (v) => Number.isInteger(v) && v >= 1 && v <= EXEMPT_MAX;
    switch (act) {
        case 'pw': {
            const next = !canPassword(u);
            const unlim = next ? access.deviceExempt.includes(em) : false;
            return run({ allowPassword: next, unlimitedDevices: unlim },
                next ? 'Đã cho đăng nhập thẳng 🔑' : 'Đã bắt đăng nhập qua Google.',
                (_, a) => { listSet(a.passwordAllowed, next); listSet(a.deviceExempt, unlim); });
        }
        case 'unlim': {
            // deviceExempt kiêm luôn "đăng nhập thẳng" → bỏ 20 máy thì giữ nguyên quyền đăng nhập thẳng đang có
            const next = !access.deviceExempt.includes(em);
            const pw = next || canPassword(u);
            return run({ unlimitedDevices: next, allowPassword: pw }, next ? 'Đã đặc cách 20 máy ♾️' : 'Đã bỏ đặc cách 20 máy.',
                (_, a) => { listSet(a.deviceExempt, next); listSet(a.passwordAllowed, pw); });
        }
        case 'approved': {
            const next = !u.approved;
            return run({ approved: next }, next ? 'Đã duyệt tài khoản ✅' : 'Đã bỏ duyệt.', (x) => { x.approved = next; });
        }
        case 'lock': {
            if (!u.disabled && !await showConfirm(`Khoá ${u.email}? Mọi máy bị đá ra, không đăng nhập lại được tới khi mở khoá.`, { title: 'Khoá tài khoản?', confirmText: 'Khoá', tone: 'danger' })) return;
            const next = !u.disabled;
            return run({ disabled: next }, next ? 'Đã khoá tài khoản 🔒' : 'Đã mở khoá 🔓', (x) => { x.disabled = next; });
        }
        case 'set-limit': {
            const n = Number($('dr-limit').value);
            if (!nLimit(n)) return showToast(`Nhập số máy từ 1 đến ${EXEMPT_MAX}.`, 'warning');
            return run({ deviceLimit: n }, `Đã đặt ${n} máy cho tài khoản này 📱`, (_, a) => { a.deviceLimits[em] = n; });
        }
        case 'quick-limit': {
            const n = Number(btn.dataset.n);
            return run({ deviceLimit: n }, `Đã đặt ${n} máy cho tài khoản này 📱`, (_, a) => { a.deviceLimits[em] = n; });
        }
        case 'clear-limit': return run({ deviceLimit: null }, 'Đã về số máy mặc định.', (_, a) => { delete a.deviceLimits[em]; });
        case 'kick': return kick(u.uid, btn.dataset.device, btn.dataset.label);
        case 'kick-all': return kick(u.uid, '', '');
        case 'revoke': {
            if (!await showConfirm('Đá mọi máy và vô hiệu mọi phiên đăng nhập của tài khoản này. Người đó phải đăng nhập lại.', { title: 'Thu hồi mọi phiên?', confirmText: 'Thu hồi', tone: 'danger' })) return;
            return run({ revokeSessions: true }, 'Đã thu hồi mọi phiên.');
        }
        case 'rename': {
            const name = $('dr-name').value.trim();
            if (!name) return showToast('Nhập tên mới.', 'warning');
            return run({ displayName: name }, 'Đã đổi tên ✏️');
        }
        case 'setpass': {
            const p = $('dr-pass').value;
            if (p.length < 6) return showToast('Mật khẩu phải từ 6 ký tự.', 'warning');
            return run({ password: p }, 'Đã đổi mật khẩu 🔑');
        }
        case 'notify':
            closeDrawer();
            switchTab('settings');
            $('ann-to').value = u.email;
            $('ann-text').focus();
            return;
        case 'delete': {
            if (!await showConfirm(`Xoá VĨNH VIỄN tài khoản ${u.email}? Không hoàn tác được.`, { title: 'Xoá tài khoản?', confirmText: 'Xoá', tone: 'danger' })) return;
            btn.disabled = true;
            try {
                await adminDeleteUser(u.uid);
                showToast('Đã xoá tài khoản.', 'success');
                users = users?.filter(x => x.uid !== u.uid) || null;
                userMap.delete(u.uid);
                selected.delete(u.uid);
                closeDrawer();
                renderCurrent();
            } catch (e) { showToast('Lỗi: ' + e.message, 'error', 5000); btn.disabled = false; }
        }
    }
}

// ---------------- NHẬT KÝ QUẢN TRỊ (admin_log) ----------------
// Thao tác với tài khoản do máy chủ ghi (api/devices.js audit); thao tác cài đặt ở trang này tự ghi qua logAction.
const ACTIONS = {
    'kick-device': ['👢', 'Đá 1 máy'], 'kick-all': ['👢', 'Đá mọi máy'], 'create-user': ['🌱', 'Tạo tài khoản'], 'reset-user': ['🔁', 'Tạo lại / cập nhật tài khoản'],
    'update-user': ['🎀', 'Chỉnh tài khoản'], 'delete-user': ['🗑️', 'Xoá tài khoản'], 'default-limit': ['📱', 'Đổi số máy mặc định'],
    announce: ['📣', 'Gửi thông báo'], 'announce-off': ['🔕', 'Tắt thông báo'], 'purge-live': ['🧹', 'Dọn dữ liệu trực tiếp'], 'purge-runs': ['🧹', 'Dọn lượt làm cũ']
};
const FIELDS = {
    allowPassword: 'Đăng nhập thẳng', unlimitedDevices: 'Đặc cách 20 máy', approved: 'Duyệt', disabled: 'Khoá', emailVerified: 'Xác nhận email',
    revokeSessions: 'Thu hồi phiên', displayName: 'Tên', deviceLimit: 'Số máy riêng', password: 'Mật khẩu', device: 'Máy', n: 'Số máy',
    text: 'Nội dung', hours: 'Số giờ', count: 'Số bản ghi', features: 'Tính năng'
};
const showVal = (v) => v === true ? 'bật' : v === false ? 'tắt' : v === null ? 'bỏ' : String(v);

function logAction(action, target = '', detail = {}) {
    addDoc(collection(db, 'admin_log'), { at: serverTimestamp(), by: auth.currentUser?.email || '', action, target: String(target).slice(0, 200), detail })
        .catch(() => {});
}

let auditUnsub = null;
function watchAudit() {
    if (auditUnsub) return;
    auditUnsub = onSnapshot(query(collection(db, 'admin_log'), orderBy('at', 'desc'), limit(50)), (snap) => {
        const who = (t) => {
            const p = userMap.has(t) || runs.some(x => x.uid === t) ? person(t) : null;
            return p ? `${p.name} ${p.email ? `(${p.email})` : ''}`.trim() : t;
        };
        $('audit-list').innerHTML = snap.docs.map(d => {
            const x = d.data({ serverTimestamps: 'estimate' });
            const [ic, name] = own(ACTIONS, x.action) ? ACTIONS[x.action] : ['📝', x.action];
            const detail = Object.entries(x.detail && typeof x.detail === 'object' ? x.detail : {})
                .map(([k, v]) => `${esc(FIELDS[k] || k)}: <b>${esc(showVal(v))}</b>`).join(' · ');
            return `<li class="log-item"><span class="log-ic">${ic}</span><span class="min-w-0 flex-1">
                <b>${esc(name)}</b>${x.target ? ` · ${esc(who(x.target))}` : ''}
                ${detail ? `<small class="block">${detail}</small>` : ''}
                <small class="block">${fmtDate(msOf(x.at))} · bởi ${esc(x.by)}</small></span></li>`;
        }).join('') || '<li class="nb-tiny">Chưa có thao tác nào.</li>';
    }, (e) => {
        $('audit-list').innerHTML = `<li class="nb-tiny" style="color:var(--ink-cherry)">Không đọc được nhật ký${e?.code === 'permission-denied' ? ' — luật Firestore mới (admin_log) đã deploy chưa?' : ''}.</li>`;
        auditUnsub = null;
    });
}

// ---------------- CÀI ĐẶT & THÔNG BÁO ----------------
const annRef = () => doc(db, 'config', 'announce');
async function loadAnnounce() {
    try {
        const s = await getDoc(annRef());
        const a = s.exists() ? s.data() : null;
        const until = a?.until ? msOf(a.until) : null;
        const alive = a?.active && (!until || until > Date.now());
        $('ann-current').innerHTML = alive
            ? `<div class="mini-card"><b>📌 Đang hiện</b> (${a.to?.length ? 'gửi riêng ' + esc(a.to.join(', ')) : 'tất cả'}${until ? ` · hết hạn ${fmtDate(until)}` : ' · không hết hạn'}):<br><span class="whitespace-pre-line">${esc(a.text)}</span></div>`
            : 'Hiện không có thông báo nào đang hiện.';
    } catch (e) { $('ann-current').textContent = 'Không đọc được thông báo hiện tại.'; }
}

function bindSettings() {
    $('set-default-save').addEventListener('click', async () => {
        const n = Number($('set-default-limit').value);
        try { await setDefaultLimit(n); showToast(`Mặc định giờ là ${n} máy / tài khoản 📱`, 'success'); logAction('default-limit', '', { n }); }
        catch (e) { showToast(e.message, 'error'); }
    });
    $('ann-send').addEventListener('click', async () => {
        const text = $('ann-text').value.trim();
        if (!text) return showToast('Nhập nội dung thông báo.', 'warning');
        const hours = Number($('ann-until').value);
        const to = $('ann-to').value.split(/[\s,;]+/).map(lc).filter(e => e.includes('@'));
        try {
            await setDoc(annRef(), {
                active: true, id: String(Date.now()), text: text.slice(0, 600), tone: $('ann-tone').value, to,
                until: hours ? Timestamp.fromMillis(Date.now() + hours * 3600 * 1000) : null,
                by: auth.currentUser?.email || '', at: Timestamp.now()
            });
            try { sessionStorage.removeItem('announceCache'); } catch (e) {}
            showToast(to.length ? `Đã gửi riêng cho ${to.length} người 💌` : 'Đã gửi cho tất cả 💌', 'success');
            logAction('announce', to.join(', ') || 'tất cả', { text: text.slice(0, 120), hours });
            $('ann-text').value = '';
            loadAnnounce();
        } catch (e) { showToast('Không gửi được: ' + e.message, 'error', 5000); }
    });
    $('ann-off').addEventListener('click', async () => {
        try { await setDoc(annRef(), { active: false }, { merge: true }); showToast('Đã tắt thông báo.', 'success'); logAction('announce-off'); loadAnnounce(); }
        catch (e) { showToast('Lỗi: ' + e.message, 'error'); }
    });
    $('runs-purge').addEventListener('click', () => purgeRuns(true).catch(e => showToast('Lỗi: ' + e.message, 'error')));
}
