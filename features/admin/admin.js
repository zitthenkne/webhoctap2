// File: features/admin/admin.js
// BẢNG QUẢN TRỊ — chỉ admin (isAdminUser, khớp isAdmin() trong firestore.rules và isAdminToken trong api/_lib/admin.js).
//  • Báo cáo đề: đề nào đã có ai làm (quiz_results trong 1 / 7 / 30 ngày — tải một lần, bấm Tải lại mới đọc lại), ai đang làm dở
//    (quiz_runs — core/quiz-run.js ghi lúc bắt đầu / nộp) và CẢNH BÁO cùng một tài khoản làm đề trên 2 máy cùng lúc:
//      – hai lượt nộp của cùng tài khoản, khác máy, chồng giờ nhau;
//      – lượt nộp mà máy làm bài đã tự phát hiện máy kia (quiz_results.clash);
//      – đang làm (chưa nộp) trên ≥ 2 máy.
//  • Tài khoản: toàn bộ tài khoản Firebase Auth (api/devices.js adminListUsers, lật hết các trang) + ngăn chi tiết: quyền, số máy riêng,
//    máy đang đăng nhập, lịch sử đăng nhập, lịch sử làm đề (quiz_results), đá máy / thu hồi phiên, khoá, đổi mật khẩu / tên, xoá.
//  • Cài đặt: số máy mặc định (config/access.defaultLimit), thông báo (config/announce — core/announce.js hiện cho người dùng).
import { auth, db } from '../../core/firebase-init.js';
import { onSessionUser } from '../../core/auth-session.js';
import { collection, query, where, orderBy, limit, onSnapshot, getDocs, getDoc, setDoc, addDoc, doc, writeBatch, Timestamp, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { showToast, showConfirm } from '../../core/utils.js';
import { isAdminUser, onAccessConfig, setDefaultLimit, limitFromConfig, adminListAllUsers, adminLookupUser, adminUpdateUser, adminDeleteUser,
    adminRemoveDevices, adminCreateUser, placeOf, ADMIN_EMAILS, EXEMPT_MAX, MAX_DEVICES } from '../../core/device-limit.js';
import { RUN_MAX_MS } from '../../core/quiz-run.js';
import { FEATURES, FEATURE_KEYS, DEFAULT_FEATURES, FULL_FEATURES, normFeatures } from '../../core/features.js';

const RESULTS_MAX = 1500;                         // số lượt nộp tối đa mỗi lần tải báo cáo (mỗi lượt = 1 lượt đọc)
const PURGE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;
const GUEST_PURGE_MS = 60 * 24 * 60 * 60 * 1000;
const OVERLAP_MIN_MS = 60 * 1000;                 // chồng giờ dưới 1 phút = lệch đồng hồ giữa 2 máy, không tính
const RANGES = { 1: '24 giờ qua', 7: '7 ngày qua', 30: '30 ngày qua' };
const MODES = { practice: 'luyện câu sai', srs: 'ôn lặp lại' };
const CLASH_KINDS = {
    overlap: ['Nộp bài chồng giờ trên 2 máy', 'bg-red-100 text-red-700'],
    seen: ['Máy làm bài phát hiện máy khác', 'bg-red-100 text-red-700'],
    live: ['Đang làm trên 2 máy (chưa nộp)', 'bg-amber-100 text-amber-800']
};

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
let runs = [];               // quiz_runs ghi trong RUN_MAX_MS gần nhất
let runsError = '', runsLoaded = false;
let results = null;          // quiz_results trong khoảng đang chọn (null = chưa tải)
let resultsError = '', resultsAt = 0, resultsCapped = false, resultsDays = 7;
let guests = [];             // quiz_guest (máy CHƯA đăng nhập làm đề công khai) trong cùng khoảng
let guestsError = '';
let incidents = null;        // kết quả analyze(), tính lại khi dữ liệu đổi
let users = null;            // danh sách tài khoản (tải khi mở trang — để có tên / email cho báo cáo)
let userMap = new Map();
let access = { deviceExempt: [], passwordAllowed: [], deviceLimits: {}, defaultLimit: MAX_DEVICES };
let repView = 'quiz';
let openUid = null;
let drawerData = null;       // { user, devices, logins, results }

// ---------------- Khung trang ----------------
const TABS = ['report', 'accounts', 'settings'];
let curTab = 'report';
function switchTab(t) {
    curTab = t;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('is-on', b.dataset.tab === t));
    TABS.forEach(k => $(`tab-${k}`).classList.toggle('hidden', k !== t));
    try { localStorage.setItem('adminTab', t); } catch (e) {}
    if (t === 'report') renderReport();
    if (t === 'accounts') { if (users) renderAccounts(); else loadUsers(); }
    if (t === 'settings') { loadAnnounce(); watchAudit(); }
}

// Gộp các lần vẽ lại trong 0,5 giây và chỉ vẽ phần đang nhìn thấy
let renderTimer = 0;
function queueRender() {
    if (renderTimer) return;
    renderTimer = setTimeout(() => {
        renderTimer = 0;
        if (document.hidden) return;
        renderStatus();
        if (curTab === 'report') renderReport();
        if (curTab === 'accounts' && users) renderAccounts();
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
    let t = 'report';
    try { t = localStorage.getItem('adminTab') || 'report'; } catch (e) {}
    switchTab(TABS.includes(t) ? t : 'report');
    start();
});

function start() {
    document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    document.querySelectorAll('.rep-view').forEach(b => b.addEventListener('click', () => {
        repView = b.dataset.view;
        document.querySelectorAll('.rep-view').forEach(x => x.classList.toggle('is-on', x === b));
        renderReport();
    }));
    ['rep-search', 'rep-only-clash'].forEach(id => $(id).addEventListener('input', renderReport));
    $('rep-range').addEventListener('change', loadResults);
    $('rep-reload').addEventListener('click', loadResults);
    $('rep-export').addEventListener('click', exportReport);
    $('tab-report').addEventListener('click', onReportClick);
    bindAccounts();
    bindSettings();
    bindDrawer();

    onAccessConfig((cfg) => {
        if (!cfg) return;
        access = cfg;
        $('set-default-now').textContent = `Đang áp dụng: ${cfg.defaultLimit} máy`;
        if (document.activeElement !== $('set-default-limit')) $('set-default-limit').value = cfg.defaultLimit;
        queueRender();
    });

    subscribeRuns();
    loadResults();
    if (!users) loadUsers();                          // tên / email cho báo cáo (máy chủ đọc Auth — không tốn lượt đọc Firestore)
    setInterval(() => { if (runsUnsub) subscribeRuns(); }, 30 * 60 * 1000);   // mốc "3 giờ gần nhất" của truy vấn trôi theo giờ
    setInterval(queueRender, 60 * 1000);              // cập nhật "x phút trước" — tab ẩn thì bỏ qua
    document.addEventListener('visibilitychange', onAdminVisibility);
    purgeRuns(false).catch(() => {});
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
        runsLoaded = true;
        runs = snap.docs.map(d => normRun(d.id, d.data({ serverTimestamps: 'estimate' })));
        dataChanged();
    }, (e) => {
        runsLoaded = true;
        runsError = e?.code === 'permission-denied'
            ? 'Chưa đọc được lượt đang làm — luật Firestore mới (quiz_runs) đã deploy chưa?'
            : 'Mất kết nối: ' + (e?.message || e);
        dataChanged();
    });
}

let resultsToken = 0;
async function loadResults() {
    const days = own(RANGES, $('rep-range').value) ? Number($('rep-range').value) : 7;
    const token = ++resultsToken;
    resultsDays = days;
    resultsError = '';
    $('rep-reload').disabled = true;
    renderStatus();
    try {
        const since = Timestamp.fromMillis(Date.now() - days * 24 * 60 * 60 * 1000);
        guestsError = '';
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
            : 'Không tải được báo cáo: ' + (e?.message || e);
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
    const doing = doingByUid();
    for (const [uid, g] of doing) {
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

// ---------------- BÁO CÁO ĐỀ ----------------
function renderStatus() {
    const el = $('live-status');
    if (!started) return;
    if (resultsError) { el.innerHTML = `<span class="text-red-500">${esc(resultsError)}</span>`; return; }
    if (!results) { el.textContent = 'Đang tải báo cáo…'; return; }
    const doing = doingByUid().size;
    el.textContent = `Báo cáo ${RANGES[resultsDays]} · ${results.length}${resultsCapped ? '+' : ''} lượt nộp · ${new Set(guests.map(g => g.device)).size} máy khách · ${doing} người đang làm · tải lúc ${fmtClock(resultsAt)}`;
}

function stat(label, value, sub, tone) {
    return `<div class="card p-3.5">
        <p class="text-[11.5px] font-extrabold uppercase tracking-wide ${tone}">${label}</p>
        <p class="text-[28px] font-black text-slate-800 leading-tight">${value}</p>
        <p class="text-[11.5px] font-bold text-slate-400">${sub}</p></div>`;
}

function personHead(uid, extra = '') {
    const p = person(uid);
    return `<div class="flex flex-wrap items-center gap-2 min-w-0">
        <button type="button" class="font-extrabold text-slate-800 hover:text-pink-500 text-left min-w-0 truncate" data-act="open" data-uid="${esc(uid)}">${esc(nameOf(p))}</button>
        <span class="text-[11.5px] text-slate-400 truncate min-w-0">${esc(p.email)}</span>${extra}
    </div>`;
}

function attemptChip(r, { withTitle = false } = {}) {
    const tone = r.pct >= 80 ? 'text-emerald-700' : r.pct >= 50 ? 'text-amber-700' : 'text-red-600';
    const flagged = r.flags.length > 0;
    return `<div class="rounded-xl px-3 py-1.5 text-[12px] flex flex-wrap items-center gap-x-2 gap-y-0.5 ${flagged ? 'bg-red-50 border border-red-200' : 'bg-slate-50/80 border border-slate-100'}">
        <span class="font-black ${tone}">${r.pct}%</span>
        ${withTitle ? `<span class="font-bold text-slate-700 min-w-0 truncate">${esc(r.title || r.quizId)}</span>` : ''}
        <span class="text-slate-500">${fmtShort(r.end)}${r.taken ? ` · ${dur(r.taken * 1000)}` : ''}</span>
        ${r.label ? `<span class="text-slate-400"><i class="fas ${deviceIcon(r.label)} mr-0.5"></i>${esc(r.label)}</span>` : ''}
        ${flagged ? `<span class="chip bg-red-500 text-white" title="Cùng lúc với: ${esc(r.flags.join(', '))}"><i class="fas fa-triangle-exclamation"></i>2 máy</span>` : ''}
    </div>`;
}

function matchesQ(r, q) {
    if (!q) return true;
    const p = person(r.uid);
    return [r.title, r.quizId, p.name, p.email, r.label].some(v => lc(v).includes(q));
}

function renderReport() {
    if (!started) return;
    const inc = analyze();
    const doing = doingByUid();
    const all = results || [];
    const people = new Set(all.map(r => r.uid)).size;
    const quizIds = new Set(all.map(r => r.quizId));
    const avg = all.length ? Math.round(all.reduce((s, r) => s + r.pct, 0) / all.length) : 0;
    const doingDevices = [...doing.values()].reduce((s, g) => s + g.devices.size, 0);
    const accDevices = new Set(all.filter(r => r.device).map(r => r.uid + '|' + r.device)).size;
    const guestDevices = new Set(guests.map(g => g.device)).size;
    guests.forEach(g => quizIds.add(g.quizId));
    $('rep-stats').innerHTML =
        stat('🍓 Lượt nộp bài', `${all.length}${resultsCapped ? '+' : ''}`, `${people} người · ${RANGES[resultsDays]}`, 'text-pink-500') +
        stat('📱 Máy đã làm đề', accDevices + guestDevices, guestsError ? esc(guestsError) : `${accDevices} có tài khoản · ${guestDevices} máy khách`, 'text-sky-500') +
        stat('📚 Đề đã có người làm', quizIds.size, all.length ? `điểm trung bình ${avg}%` : 'chưa có lượt nộp', 'text-violet-500') +
        stat('✏️ Đang làm (chưa nộp)', doing.size, runsError ? 'chưa đọc được' : `${doingDevices} máy`, 'text-emerald-500') +
        stat('⚠️ Cảnh báo 2 máy', clashUids().size, inc.length ? `${inc.length} lần · xem bên dưới` : 'không có', inc.length ? 'text-rose-500' : 'text-slate-400');

    $('rep-alerts').innerHTML = inc.length ? `<div class="card p-4 space-y-3 border-red-200" style="border-color:#FECACA">
        <p class="font-black text-red-700"><i class="fas fa-triangle-exclamation mr-1.5"></i>Cùng một tài khoản làm đề trên 2 máy cùng lúc <span class="chip bg-red-100 text-red-700">${inc.length}</span></p>
        ${inc.slice(0, 60).map(x => {
            const [kind, tone] = CLASH_KINDS[x.kind];
            const line = (s) => `<div class="text-[12px] text-slate-600"><i class="fas ${deviceIcon(s.label)} mr-1 text-slate-400"></i><b>${esc(s.label)}</b>${s.title ? ` · ${esc(s.title)}` : ''}${s.start ? ` · ${fmtShort(s.start)}${s.end ? `–${fmtClock(s.end)}` : ' → đang làm'}` : ''}</div>`;
            return `<div class="rounded-xl bg-red-50/60 border border-red-100 px-3 py-2 space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                    <div class="min-w-0 flex-1">${personHead(x.uid, `<span class="chip ${tone}">${kind}</span>`)}</div>
                    <button type="button" class="btn bg-red-50 hover:bg-red-100 text-red-600" data-act="kick-all" data-uid="${esc(x.uid)}"><i class="fas fa-power-off mr-1"></i>Đá mọi máy</button>
                </div>
                ${line(x.a)}${line(x.b)}
            </div>`;
        }).join('')}
        ${inc.length > 60 ? `<p class="text-[11.5px] text-slate-400">… và ${inc.length - 60} lần khác (lọc "Chỉ lượt bị cảnh báo" để xem hết).</p>` : ''}
    </div>` : '';

    $('rep-doing').innerHTML = doing.size ? `<details class="card p-3" ${doing.size <= 8 ? 'open' : ''}>
        <summary class="cursor-pointer text-[13px] font-extrabold text-emerald-700">Đang làm, chưa nộp <span class="chip bg-emerald-100 text-emerald-700 ml-1">${doing.size} người</span>
            <span class="text-[11px] font-semibold text-slate-400">(bắt đầu trong ${RUN_MAX_MS / 3600000} giờ qua, có thể đã bỏ dở)</span></summary>
        <div class="mt-2 space-y-2">${[...doing.entries()].map(([uid, g]) => `<div class="space-y-1">
            ${personHead(uid, g.devices.size >= 2 ? '<span class="chip bg-amber-100 text-amber-800">2 máy</span>' : '')}
            ${g.runs.map(r => `<div class="text-[12px] text-slate-600 pl-1"><i class="fas ${deviceIcon(r.label)} mr-1 text-slate-400"></i><b>${esc(r.label || 'Thiết bị')}</b> · ${esc(r.title || r.quizId)}${MODES[r.mode] ? ` · ${MODES[r.mode]}` : ''} · bắt đầu ${ago(r.startedAt || r.atMs)}</div>`).join('')}
        </div>`).join('<hr class="border-pink-100">')}</div>
    </details>` : '';

    const q = lc($('rep-search').value.trim());
    const onlyClash = $('rep-only-clash').checked;
    const shown = all.filter(r => matchesQ(r, q) && (!onlyClash || r.flags.length));
    const shownGuests = onlyClash ? [] : guests.filter(g => guestMatches(g, q));
    let html = '';
    if (!results) html = '';
    else if (repView === 'quiz') html = renderByQuiz(shown, shownGuests);
    else html = renderByUser(shown, shownGuests);
    $('rep-list').innerHTML = html || `<div class="card p-6 text-center text-slate-400 font-bold">${resultsError ? esc(resultsError) : results ? (all.length || guests.length ? 'Không có lượt nào khớp bộ lọc.' : `Chưa ai làm đề trong ${RANGES[resultsDays]} 🌸`) : 'Đang tải…'}</div>`;
}

const guestMatches = (g, q) => !q || [g.title, g.quizId, g.label, 'khách', 'chưa đăng nhập'].some(v => lc(v).includes(q));

function guestRow(g, { withTitle = false } = {}) {
    const tone = g.pct == null ? 'text-slate-400' : g.pct >= 80 ? 'text-emerald-600' : g.pct >= 50 ? 'text-amber-600' : 'text-rose-500';
    return `<div class="rounded-2xl px-3 py-1.5 text-[12px] flex flex-wrap items-center gap-x-2 gap-y-0.5 bg-sky-50/70 border border-sky-100">
        <span class="font-black ${tone}">${g.done && g.pct != null ? g.pct + '%' : 'đang làm / bỏ dở'}</span>
        ${withTitle ? `<span class="font-bold text-slate-700 min-w-0 truncate">${esc(g.title || g.quizId)}</span>` : ''}
        <span class="text-slate-400"><i class="fas ${deviceIcon(g.label)} mr-0.5"></i>${esc(g.label || 'Máy chưa rõ')}</span>
        <span class="text-slate-500">${fmtShort(g.end)}</span>
        ${g.attempts > 1 ? `<span class="chip bg-white text-sky-600 border border-sky-100">${g.attempts} lượt</span>` : ''}
    </div>`;
}
function guestBlock(gs, { withTitle = false, head = true } = {}) {
    if (!gs.length) return '';
    const n = new Set(gs.map(g => g.device)).size;
    const max = head ? 12 : 40;
    return `<div class="space-y-1">
        ${head ? `<p class="text-[12.5px] font-extrabold text-sky-700"><i class="fas fa-user-secret mr-1"></i>Khách chưa đăng nhập <span class="chip bg-sky-100 text-sky-700">${n} máy</span></p>` : ''}
        <div class="grid gap-1">${gs.slice(0, max).map(g => guestRow(g, { withTitle })).join('')}</div>
        ${gs.length > max ? `<p class="text-[11px] text-slate-400 pl-1">… và ${gs.length - max} lượt khác</p>` : ''}
    </div>`;
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

function renderByQuiz(list, gs = []) {
    const byQuiz = groupBy(list, 'quizId');
    const guestByQuiz = groupBy(gs, 'quizId');
    const ids = new Set([...byQuiz.keys(), ...guestByQuiz.keys()]);
    const quizzes = [...ids]
        .map(id => {
            const rs = byQuiz.get(id) || [], g = guestByQuiz.get(id) || [];
            const devices = new Set(rs.filter(r => r.device).map(r => r.uid + '|' + r.device)).size + new Set(g.map(x => x.device)).size;
            return { id, rs, gs: g, devices, title: rs.find(r => r.title)?.title || g.find(x => x.title)?.title || '', people: groupBy(rs, 'uid') };
        })
        .sort((a, b) => (b.people.size + b.gs.length) - (a.people.size + a.gs.length) || b.rs.length - a.rs.length);
    return quizzes.slice(0, 200).map(qz => {
        const flagged = qz.rs.filter(r => r.flags.length).length;
        const graded = [...qz.rs.map(r => r.pct), ...qz.gs.filter(g => g.done && g.pct != null).map(g => g.pct)];
        const avg = graded.length ? Math.round(graded.reduce((s, p) => s + p, 0) / graded.length) : null;
        const rows = [...qz.people.entries()]
            .sort((a, b) => b[1].length - a[1].length)
            .map(([uid, rs]) => `<div class="space-y-1">
                ${personHead(uid, `<span class="chip bg-slate-100 text-slate-600">${rs.length} lượt</span>`)}
                <div class="grid gap-1">${rs.slice(0, 10).map(r => attemptChip(r)).join('')}</div>
                ${rs.length > 10 ? `<p class="text-[11px] text-slate-400 pl-1">… và ${rs.length - 10} lượt cũ hơn</p>` : ''}
            </div>`).join('<hr class="border-pink-100">');
        return `<div class="card p-4 space-y-3">
            <div class="flex flex-wrap items-start gap-2">
                <div class="min-w-0 flex-1">
                    <p class="font-black text-slate-800 leading-snug break-words">${esc(qz.title || 'Đề chưa rõ tên')}</p>
                    <p class="text-[11px] text-slate-400 font-semibold truncate">Mã đề: ${esc(qz.id)}</p>
                </div>
                <span class="chip bg-pink-100 text-pink-700 text-[12px]"><i class="fas fa-user-group"></i>${qz.people.size} người</span>
                <span class="chip bg-sky-100 text-sky-700 text-[12px]" title="Số máy đã làm đề này (có tài khoản + khách)"><i class="fas fa-mobile-screen"></i>${qz.devices} máy</span>
                <span class="chip bg-violet-100 text-violet-700 text-[12px]">${qz.rs.length} lượt nộp${avg != null ? ` · TB ${avg}%` : ''}</span>
                ${flagged ? `<span class="chip bg-red-100 text-red-700 text-[12px]"><i class="fas fa-triangle-exclamation"></i>${flagged} lượt 2 máy</span>` : ''}
                <a href="../quiz/quiz.html?id=${encodeURIComponent(qz.id)}" target="_blank" rel="noopener" class="chip bg-white text-slate-600 border border-pink-100 hover:bg-pink-50 text-[12px]"><i class="fas fa-up-right-from-square"></i>Mở đề</a>
            </div>
            ${rows}
            ${rows && qz.gs.length ? '<hr class="border-pink-100">' : ''}
            ${guestBlock(qz.gs)}
        </div>`;
    }).join('') + (quizzes.length > 200 ? `<p class="text-[12px] text-slate-400 text-center">Đang hiện 200/${quizzes.length} đề — lọc để thu hẹp.</p>` : '');
}

function renderByUser(list, gs = []) {
    const guestCard = gs.length ? `<div class="card p-4 space-y-2" style="background:linear-gradient(160deg,#fff,#f0f9ff)">
        <p class="font-black text-sky-800"><i class="fas fa-user-secret mr-1.5"></i>Khách chưa đăng nhập
            <span class="chip bg-sky-100 text-sky-700">${new Set(gs.map(g => g.device)).size} máy</span>
            <span class="chip bg-white text-sky-600 border border-sky-100">${new Set(gs.map(g => g.quizId)).size} đề</span></p>
        ${guestBlock(gs, { withTitle: true, head: false })}
    </div>` : '';
    const people = [...groupBy(list, 'uid').entries()]
        .map(([uid, rs]) => ({ uid, rs, flagged: rs.filter(r => r.flags.length).length }))
        .sort((a, b) => b.flagged - a.flagged || b.rs.length - a.rs.length);
    return people.slice(0, 200).map(({ uid, rs, flagged }) => {
        const labels = [...new Set(rs.map(r => r.label).filter(Boolean))];
        return `<div class="card p-4 space-y-2">
            <div class="flex flex-wrap items-center gap-2">
                <div class="min-w-0 flex-1">${personHead(uid)}</div>
                <span class="chip bg-violet-100 text-violet-700">${rs.length} lượt · ${new Set(rs.map(r => r.quizId)).size} đề</span>
                ${labels.length ? `<span class="chip ${labels.length >= 2 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}" title="${esc(labels.join(', '))}">làm trên ${labels.length} máy</span>` : ''}
                ${flagged ? `<span class="chip bg-red-100 text-red-700"><i class="fas fa-triangle-exclamation"></i>${flagged} lượt 2 máy</span>` : ''}
                <button type="button" class="btn bg-violet-50 hover:bg-violet-100 text-violet-700" data-act="open" data-uid="${esc(uid)}"><i class="fas fa-id-card mr-1"></i>Chi tiết</button>
            </div>
            <div class="grid gap-1">${rs.slice(0, 20).map(r => attemptChip(r, { withTitle: true })).join('')}</div>
            ${rs.length > 20 ? `<p class="text-[11px] text-slate-400 pl-1">… và ${rs.length - 20} lượt cũ hơn</p>` : ''}
        </div>`;
    }).join('') + (people.length > 200 ? `<p class="text-[12px] text-slate-400 text-center">Đang hiện 200/${people.length} người — lọc để thu hẹp.</p>` : '') + guestCard;
}

async function onReportClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const uid = b.dataset.uid;
    if (b.dataset.act === 'open') return openDrawer(uid);
    if (b.dataset.act === 'kick-all') return kick(uid, '', '');
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
    if (!results) return showToast('Báo cáo chưa tải xong.', 'warning');
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
    downloadCsv(rows, 'bao-cao-de');
    showToast(`Đã xuất ${rows.length - 1} dòng.`, 'success');
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
    if (manual) showToast(docs.length ? `Đã dọn ${docs.length} bản ghi cũ.` : 'Không có gì cần dọn.', 'success');
    if (manual && docs.length) logAction('purge-runs', '', { count: docs.length });
}

// ---------------- QUYỀN TÍNH NĂNG (core/features.js) ----------------
// Bấm là đổi NGAY trên màn hình (không chờ máy chủ, không tải lại cả ngăn); bấm liên tiếp trong 0,7 giây gộp thành MỘT lần gọi máy chủ.
// Lỗi → trả lại như cũ + báo. Máy người đó nhận quyền mới gần như ngay (core/device-limit.js nghe claimsAt).
const featOf = (u) => u.isAdmin ? { ...FULL_FEATURES } : normFeatures(u.features || DEFAULT_FEATURES);
const isFull = (u) => FEATURE_KEYS.every(k => featOf(u)[k]);
const featPending = new Map();       // uid → { timer, before: { features, featuresCustom }, payload }

function setFeatures(u, next) {
    if (!u || u.isAdmin) return;
    let p = featPending.get(u.uid);
    if (!p) featPending.set(u.uid, p = { before: { features: u.features, featuresCustom: u.featuresCustom } });
    if (next === null) { u.features = { ...DEFAULT_FEATURES }; u.featuresCustom = false; p.payload = null; }
    else { u.features = normFeatures(next); u.featuresCustom = true; p.payload = u.features; }
    paintUser(u.uid);
    clearTimeout(p.timer);
    p.timer = setTimeout(() => flushFeatures(u), 700);
}

async function flushFeatures(u) {
    const p = featPending.get(u.uid);
    if (!p) return;
    p.sending = true;
    const payload = p.payload;
    paintUser(u.uid);
    try {
        const r = await adminUpdateUser({ uid: u.uid, email: u.email, features: payload });
        if (featPending.get(u.uid) === p && p.payload === payload) {
            featPending.delete(u.uid);
            if (r.user) { u.features = r.user.features; u.featuresCustom = r.user.featuresCustom; u.approved = r.user.approved; }
        } else p.sending = false;                       // bấm tiếp trong lúc đang gửi → lượt sau gửi bản mới nhất
        showToast(`Đã lưu quyền cho ${nameOf(u)} 🌷`, 'success', 1800);
    } catch (e) {
        if (featPending.get(u.uid) === p) {
            featPending.delete(u.uid);
            u.features = p.before.features;
            u.featuresCustom = p.before.featuresCustom;
        }
        showToast('Chưa lưu được quyền: ' + e.message, 'error', 5000);
    }
    paintUser(u.uid);
}

/** Vẽ lại ĐÚNG phần của một tài khoản (dòng trong danh sách + mục quyền trong ngăn chi tiết) — không vẽ lại cả trang. */
function paintUser(uid) {
    const u = userMap.get(uid) || (drawerData?.user?.uid === uid ? drawerData.user : null);
    if (!u) return;
    const row = $('acc-list')?.querySelector(`[data-row="${CSS.escape(uid)}"]`);
    if (row) row.outerHTML = rowHtml(u, doingByUid(), clashUids());
    if (openUid === uid && $('dr-feat')) $('dr-feat').outerHTML = featureSection(u);
}

function featurePills(u) {
    const f = featOf(u);
    return `<span class="flex flex-wrap gap-1" title="Bấm để bật / tắt nhanh">${FEATURE_KEYS.map(k => {
        const [name, icon, color, bg] = FEATURES[k];
        return `<button type="button" class="fpill ${f[k] ? 'is-on' : ''}" data-feat="${k}" data-uid="${esc(u.uid)}" ${u.isAdmin ? 'disabled' : ''}
            style="--fc:${color};--fb:${bg}" aria-pressed="${f[k]}" title="${esc(name)}: ${f[k] ? 'đang mở' : 'đang tắt'}"><i class="fas ${icon}"></i><span>${name}</span></button>`;
    }).join('')}</span>`;
}

function featureSection(u) {
    const f = featOf(u);
    const p = featPending.get(u.uid);
    const state = u.isAdmin ? '<span class="chip bg-amber-100 text-amber-700">admin · mở hết</span>'
        : p ? `<span class="chip bg-white text-pink-500 border border-pink-100"><i class="fas ${p.sending ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'}"></i>${p.sending ? 'đang lưu…' : 'sắp lưu'}</span>`
        : isFull(u) ? '<span class="chip bg-gradient-to-r from-pink-200 to-violet-200 text-violet-800">✨ full tính năng</span>'
        : !u.featuresCustom ? '<span class="chip bg-emerald-50 text-emerald-700">🌱 mặc định</span>' : '<span class="chip bg-violet-50 text-violet-700">🎀 tuỳ chỉnh</span>';
    return `<div id="dr-feat" class="card p-4 space-y-3 feat-card">
        <div class="flex flex-wrap items-center gap-2">
            <p class="text-[13.5px] font-extrabold text-pink-700 flex-1"><i class="fas fa-wand-magic-sparkles mr-1.5"></i>Tính năng được dùng</p>${state}
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">${FEATURE_KEYS.map(k => {
            const [name, icon, color, bg, desc] = FEATURES[k];
            return `<button type="button" class="ftile ${f[k] ? 'is-on' : ''}" data-dfeat="${k}" ${u.isAdmin ? 'disabled' : ''} style="--fc:${color};--fb:${bg}" aria-pressed="${f[k]}">
                <span class="ftile-ic"><i class="fas ${icon}"></i></span>
                <span class="min-w-0 flex-1 text-left"><b>${name}</b><small>${esc(desc)}</small></span>
                <span class="fswitch"><i></i></span>
            </button>`;
        }).join('')}</div>
        <div class="flex flex-wrap gap-2 ${u.isAdmin ? 'opacity-50 pointer-events-none' : ''}">
            <button type="button" class="btn btn-candy" data-dfeat-all="full">✨ Mở full</button>
            <button type="button" class="btn bg-emerald-50 hover:bg-emerald-100 text-emerald-700" data-dfeat-all="default" title="Làm đề + Học nhóm">🌱 Về mặc định</button>
            <button type="button" class="btn bg-slate-50 hover:bg-slate-100 text-slate-500" data-dfeat-all="none">Tắt hết</button>
        </div>
        <p class="text-[11px] text-slate-400 leading-snug">Không cần tài khoản: Tính điểm hệ 4, làm đề công khai, vào phòng học bằng link. Đổi quyền thì máy người đó nhận ngay trong vài giây.</p>
    </div>`;
}

// ---------------- TÀI KHOẢN ----------------
async function loadUsers() {
    $('acc-summary').textContent = 'Đang tải danh sách tài khoản…';
    $('acc-reload').disabled = true;
    try {
        const r = await adminListAllUsers();
        users = r.users;
        userMap = new Map(users.map(u => [u.uid, u]));
        renderAccounts();
        queueRender();
    } catch (e) {
        $('acc-summary').innerHTML = `<span class="text-red-500">Không tải được danh sách: ${esc(e.message)} (api/devices đã deploy và có FIREBASE_SERVICE_ACCOUNT chưa?)</span>`;
    } finally { $('acc-reload').disabled = false; }
}

function accLimit(u) { return limitFromConfig(access, u.email); }
function customLimit(u) { return access.deviceLimits[lc(u.email)] || null; }
function canPassword(u) {
    const e = lc(u.email);
    return ADMIN_EMAILS.includes(e) || access.passwordAllowed.includes(e) || access.deviceExempt.includes(e);
}

/** Tài khoản khớp ô tìm + bộ lọc, đang làm đề / bị cảnh báo lên đầu (dùng chung cho danh sách và Xuất CSV). */
function filteredUsers(doing, clash) {
    const q = lc($('acc-search').value.trim());
    const f = $('acc-filter').value;
    const rank = (u) => (clash.has(u.uid) ? 2 : 0) + (doing.has(u.uid) ? 1 : 0);
    return users.filter(u => {
        if (q && ![u.email, u.displayName, u.uid].some(v => lc(v).includes(q))) return false;
        if (f === 'doing') return doing.has(u.uid);
        if (f === 'clash') return clash.has(u.uid);
        if (f === 'locked') return u.disabled;
        if (f === 'unapproved') return !u.approved;
        if (f === 'password') return canPassword(u);
        if (f === 'custom') return !!customLimit(u);
        if (f === 'feat-full') return isFull(u);
        if (f === 'feat-default') return !u.isAdmin && !u.featuresCustom;
        if (f.startsWith('feat-on-')) return featOf(u)[f.slice(8)] === true;
        if (f.startsWith('feat-off-')) return featOf(u)[f.slice(9)] === false;
        return true;
    }).sort((a, b) => (rank(b) - rank(a)) || ((b.lastSignInAt || 0) - (a.lastSignInAt || 0)));
}

function exportCsv() {
    if (!users) return showToast('Danh sách tài khoản chưa tải xong.', 'warning');
    const doing = doingByUid();
    const clash = clashUids();
    const rows = [['Email', 'Tên', 'UID', 'Tính năng', 'Đang làm đề (số máy)', 'Cảnh báo 2 máy', 'Đăng nhập thẳng', 'Số máy được dùng', 'Số máy riêng', 'Đã duyệt', 'Bị khoá',
        'Cách đăng nhập', 'Ngày tạo', 'Đăng nhập gần nhất']];
    for (const u of filteredUsers(doing, clash)) {
        const feats = FEATURE_KEYS.filter(k => featOf(u)[k]).map(k => FEATURES[k][0]).join(', ') || 'tắt hết';
        rows.push([u.email, u.displayName, u.uid, feats + (u.featuresCustom ? '' : ' (mặc định)'), doing.get(u.uid)?.devices.size || 0, clash.has(u.uid) ? 'có' : '', canPassword(u) ? 'có' : '', accLimit(u),
            customLimit(u) || '', u.approved ? 'có' : 'chưa', u.disabled ? 'khoá' : '', (u.providers || []).join(' '),
            fmtDate(u.createdAt), fmtDate(u.lastSignInAt)]);
    }
    downloadCsv(rows, 'tai-khoan');
    showToast(`Đã xuất ${rows.length - 1} tài khoản.`, 'success');
}

function renderAccounts() {
    if (!users) return;
    const doing = doingByUid();
    const clash = clashUids();
    const list = filteredUsers(doing, clash);
    $('acc-summary').textContent = `${users.length} tài khoản · ${doing.size} đang làm đề · ${clash.size} bị cảnh báo 2 máy · đang hiện ${Math.min(list.length, 300)}/${list.length}`;
    $('acc-list').innerHTML = list.slice(0, 300).map(u => rowHtml(u, doing, clash)).join('')
        || '<div class="card p-6 text-center text-slate-400 font-bold">Không có tài khoản khớp 🌸</div>';
}

// Một dòng tài khoản: bấm vào dòng = mở chi tiết; bấm viên tính năng = bật / tắt ngay tại chỗ
function rowHtml(u, doing, clash) {
    const g = doing.get(u.uid);
    const custom = customLimit(u);
    return `<div role="button" tabindex="0" class="card acc-row w-full text-left px-3.5 py-2.5 transition flex flex-wrap items-center gap-x-3 gap-y-1.5 cursor-pointer" data-row="${esc(u.uid)}">
        <span class="w-2.5 h-2.5 rounded-full ${g ? 'bg-emerald-400' : 'bg-pink-100'} shrink-0" title="${g ? 'Đang làm đề' : 'Không làm đề'}"></span>
        <span class="min-w-0 flex-1">
            <span class="block font-extrabold text-slate-700 truncate">${esc(u.displayName || u.email.split('@')[0])}${u.isAdmin ? ' <i class="fas fa-crown text-amber-400 text-[11px]"></i>' : ''}</span>
            <span class="block text-[11.5px] text-slate-400 truncate">${esc(u.email)}</span>
        </span>
        <span class="flex flex-wrap gap-1">
            ${clash.has(u.uid) ? '<span class="chip bg-rose-100 text-rose-600"><i class="fas fa-triangle-exclamation"></i>2 máy cùng lúc</span>' : ''}
            ${g ? `<span class="chip ${g.devices.size >= 2 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-600'}">đang làm đề${g.devices.size >= 2 ? ` · ${g.devices.size} máy` : ''}</span>` : ''}
            ${u.disabled ? '<span class="chip bg-rose-100 text-rose-600">Bị khoá</span>' : ''}
            ${!u.approved ? '<span class="chip bg-slate-100 text-slate-500">Chưa duyệt</span>' : ''}
            ${canPassword(u) ? '<span class="chip bg-emerald-50 text-emerald-600">🔑 thẳng</span>' : ''}
            <span class="chip ${custom ? 'bg-violet-100 text-violet-600' : 'bg-slate-50 text-slate-400'}">${accLimit(u) >= EXEMPT_MAX ? '∞' : accLimit(u)} máy${custom ? ' (riêng)' : ''}</span>
            ${u.providers?.includes('google.com') ? '<span class="chip bg-sky-50 text-sky-600"><i class="fab fa-google"></i></span>' : ''}
        </span>
        <span class="w-full flex flex-wrap items-center gap-2">
            ${featurePills(u)}
            ${featPending.has(u.uid) ? '<i class="fas fa-spinner fa-spin text-pink-300 text-[11px]" title="Đang lưu"></i>' : ''}
            <span class="ml-auto text-[11px] text-slate-400 font-semibold">đăng nhập ${ago(u.lastSignInAt)}</span>
        </span>
    </div>`;
}

function bindAccounts() {
    $('acc-search').addEventListener('input', renderAccounts);
    $('acc-filter').addEventListener('change', renderAccounts);
    $('acc-reload').addEventListener('click', loadUsers);
    $('acc-export').addEventListener('click', exportCsv);
    $('acc-list').addEventListener('click', (e) => {
        const pill = e.target.closest('[data-feat]');
        if (pill) {
            const u = userMap.get(pill.dataset.uid);
            if (u) setFeatures(u, { ...featOf(u), [pill.dataset.feat]: !featOf(u)[pill.dataset.feat] });
            return;
        }
        const row = e.target.closest('[data-row]');
        if (row) openDrawer(row.dataset.row);
    });
    $('acc-list').addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.target.closest('[data-feat]')) return;
        const row = e.target.closest('[data-row]');
        if (row) openDrawer(row.dataset.row);
    });
    $('acc-new-toggle').addEventListener('click', () => $('acc-new').classList.toggle('hidden'));
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
                ...($('new-full')?.checked ? { features: FULL_FEATURES } : {}) });
            if (lim !== null) await adminUpdateUser({ uid: r.user.uid, email, deviceLimit: lim });
            showToast(`${r.created ? 'Đã tạo' : 'Đã cập nhật'} ${email}.`, 'success');
            ['new-email', 'new-pass', 'new-name', 'new-limit'].forEach(id => { $(id).value = ''; });
            if ($('new-full')) $('new-full').checked = false;
            await loadUsers();
            openDrawer(r.user.uid);
        } catch (err) { showToast('Lỗi: ' + err.message, 'error', 5000); }
        finally { btn.disabled = false; }
    });
}

// ---------------- NGĂN CHI TIẾT TÀI KHOẢN ----------------
function bindDrawer() {
    $('acc-drawer').addEventListener('click', (e) => {
        if (e.target.closest('[data-close]')) return closeDrawer();
        const u = drawerData?.user;
        const tile = e.target.closest('[data-dfeat]');
        if (tile && u) return setFeatures(u, { ...featOf(u), [tile.dataset.dfeat]: !featOf(u)[tile.dataset.dfeat] });
        const all = e.target.closest('[data-dfeat-all]');
        if (all && u) {
            const v = all.dataset.dfeatAll;
            return setFeatures(u, v === 'full' ? FULL_FEATURES : v === 'none' ? Object.fromEntries(FEATURE_KEYS.map(k => [k, false])) : null);
        }
        const b = e.target.closest('[data-do]');
        if (b) drawerAction(b.dataset.do, b);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openUid) closeDrawer(); });
}
function closeDrawer() {
    openUid = null;
    drawerData = null;
    $('acc-drawer').classList.add('hidden');
    document.documentElement.style.overflow = '';
}

async function openDrawer(uid) {
    if (!uid) return;
    openUid = uid;
    drawerData = null;
    $('acc-drawer').classList.remove('hidden');
    document.documentElement.style.overflow = 'hidden';
    $('drawer-title').textContent = 'Đang tải…';
    $('drawer-body').innerHTML = '<p class="text-center text-slate-400 font-bold py-10"><i class="fas fa-spinner fa-spin mr-1"></i>Đang tải tài khoản…</p>';
    await refreshDrawer();
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
        drawerData = { ...acc, results: res };
        // Lần tải mới (mở / sau khi chỉnh): bỏ chữ đã gõ ở lần trước — renderDrawer chỉ giữ chữ khi vẽ lại do dữ liệu mới về
        ['dr-limit', 'dr-name', 'dr-pass'].forEach(id => $(id)?.remove());
        // Danh sách tài khoản dùng bản mới nhất
        userMap.set(uid, acc.user);
        if (users) { const i = users.findIndex(u => u.uid === uid); if (i >= 0) users[i] = acc.user; renderAccounts(); }
        renderDrawer();
    } catch (e) {
        if (openUid !== uid) return;
        $('drawer-title').textContent = 'Lỗi';
        $('drawer-body').innerHTML = `<p class="text-red-500 font-bold">${esc(e.message)}</p>`;
    }
}

function section(title, body, icon = 'fa-circle') {
    return `<div class="card p-4 space-y-2"><p class="text-[13px] font-extrabold text-pink-600"><i class="fas ${icon} mr-1.5"></i>${title}</p>${body}</div>`;
}
function toggle(id, on, label, hint, disabled) {
    return `<button type="button" data-do="${id}" ${disabled ? 'disabled' : ''} class="btn w-full text-left flex items-center justify-between gap-2 ${on ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-slate-50 text-slate-600 border border-slate-200'}" title="${esc(hint)}">
        <span>${label}</span><span class="chip ${on ? 'bg-emerald-500 text-white' : 'bg-slate-300 text-white'}">${on ? 'BẬT' : 'TẮT'}</span></button>`;
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
    $('drawer-title').textContent = u.displayName || u.email;

    const head = `<div class="card p-4 space-y-1.5">
        <div class="flex flex-wrap items-center gap-2">
            <p class="font-black text-lg text-slate-800 min-w-0 break-words">${esc(u.displayName || u.email.split('@')[0])}</p>
            ${isAdm ? '<span class="chip bg-amber-200 text-amber-900"><i class="fas fa-crown"></i>Admin</span>' : ''}
            ${doing ? `<span class="chip bg-emerald-100 text-emerald-700"><span class="pulse"></span>đang làm đề${doing.devices.size >= 2 ? ` · ${doing.devices.size} máy` : ''}</span>` : ''}
            ${myIncidents.length ? `<span class="chip bg-red-100 text-red-700"><i class="fas fa-triangle-exclamation"></i>${myIncidents.length} lần làm trên 2 máy</span>` : ''}
            ${u.disabled ? '<span class="chip bg-red-100 text-red-700">Bị khoá</span>' : ''}
        </div>
        <p class="text-[12.5px] text-slate-600 break-all">${esc(u.email)} ${u.emailVerified ? '<i class="fas fa-circle-check text-emerald-500" title="Email đã xác nhận"></i>' : '<span class="chip bg-slate-100 text-slate-500">chưa xác nhận email</span>'}</p>
        <p class="text-[11.5px] text-slate-400 break-all">UID: ${esc(u.uid)}</p>
        <p class="text-[11.5px] text-slate-500">Tạo: ${fmtDate(u.createdAt)} · Đăng nhập gần nhất: ${fmtDate(u.lastSignInAt)}</p>
        <p class="text-[11.5px] text-slate-500">Cách đăng nhập: ${(u.providers || []).map(p => p === 'google.com' ? '<i class="fab fa-google text-sky-600"></i> Google' : p === 'password' ? '🔑 Mật khẩu' : esc(p)).join(' · ') || '—'}</p>
    </div>`;

    const perms = section('Quyền', `<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        ${toggle('pw', canPassword(u), '🔑 Đăng nhập thẳng (miễn Google)', 'Bật: vào bằng email + mật khẩu, không bắt gắn Google', isAdm)}
        ${toggle('unlim', isAdm || access.deviceExempt.includes(lc(u.email)), '♾️ Đặc cách 20 máy', 'Bật: dùng tối đa 20 máy (số riêng vẫn được ưu tiên nếu có)', isAdm)}
        ${toggle('approved', u.approved, '✅ Đã duyệt (được tạo đề / phòng)', 'Tắt: đăng nhập được nhưng không tạo được bộ đề, thư mục, phòng…', isAdm)}
        ${toggle('lock', u.disabled, '⛔ Khoá tài khoản', 'Bật: không đăng nhập được, mọi máy bị đá ra', isAdm)}
    </div>`, 'fa-shield-halved');

    const limits = section('Số máy được dùng', `
        <p class="text-[12.5px] text-slate-600">Đang áp dụng: <b>${lim >= EXEMPT_MAX ? `${EXEMPT_MAX} (coi như không giới hạn)` : lim} máy</b> <span class="text-slate-400">(${limSrc})</span> · đang đăng nhập <b>${d.devices.length}</b> máy</p>
        <div class="flex flex-wrap items-center gap-2 ${isAdm ? 'opacity-50 pointer-events-none' : ''}">
            <input id="dr-limit" type="number" min="1" max="${EXEMPT_MAX}" value="${custom || ''}" placeholder="${lim}" class="inp w-24">
            <button type="button" data-do="set-limit" class="btn btn-candy">Đặt số riêng</button>
            ${custom ? '<button type="button" data-do="clear-limit" class="btn bg-slate-100 hover:bg-slate-200 text-slate-600">Bỏ số riêng</button>' : ''}
            <span class="flex gap-1">${[1, 2, 3, 5].map(n => `<button type="button" data-do="quick-limit" data-n="${n}" class="btn bg-violet-50 hover:bg-violet-100 text-violet-700">${n}</button>`).join('')}</span>
        </div>
        <p class="text-[11px] text-slate-400">Hạ số máy thì máy đăng nhập lâu nhất bị đẩy ra ngay.</p>`, 'fa-mobile-screen');

    const devs = section(`Máy đang đăng nhập (${d.devices.length})`, `
        <ul class="space-y-1.5">${d.devices.map(x => `<li class="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-[12px] flex flex-wrap items-center gap-2">
            <span class="w-2 h-2 rounded-full ${doingDevices.has(x.id) ? 'bg-emerald-500' : 'bg-slate-300'}" title="${doingDevices.has(x.id) ? 'Đang làm đề' : 'Không làm đề'}"></span>
            <span class="font-bold text-slate-700">${esc(x.label || 'Thiết bị')}</span>
            <span class="text-slate-400">từ ${fmtDate(x.at)}${placeOf(x) ? ' · ' + esc(placeOf(x)) : ''}${x.ip ? ' · ' + esc(x.ip) : ''}</span>
            <button type="button" data-do="kick" data-device="${esc(x.id)}" data-label="${esc(x.label || '')}" class="ml-auto text-[11px] font-extrabold text-red-500 hover:bg-red-50 px-2 py-0.5 rounded-lg">Đá</button>
        </li>`).join('') || '<li class="text-[12px] text-slate-400">Chưa có máy nào (đăng nhập lại sẽ ghi).</li>'}</ul>
        <div class="flex flex-wrap gap-2 pt-1">
            <button type="button" data-do="kick-all" class="btn bg-red-50 hover:bg-red-100 text-red-600"><i class="fas fa-power-off mr-1"></i>Đá mọi máy</button>
            <button type="button" data-do="revoke" class="btn bg-red-500 hover:bg-red-600 text-white" title="Đá mọi máy và vô hiệu mọi phiên đăng nhập (token) — kể cả phiên chưa ghi vào danh sách"><i class="fas fa-user-slash mr-1"></i>Thu hồi mọi phiên</button>
        </div>`, 'fa-laptop');

    const nowDoing = doing ? section(`Đang làm, chưa nộp (${doing.runs.length} máy)`, doing.runs.map(r =>
        `<div class="text-[12px] text-slate-600"><i class="fas ${deviceIcon(r.label)} mr-1 text-slate-400"></i><b>${esc(r.label || 'Thiết bị')}</b> · ${esc(r.title || r.quizId)} · bắt đầu ${ago(r.startedAt || r.atMs)}</div>`).join(''), 'fa-pen-to-square') : '';

    const clashes = myIncidents.length ? section(`Làm đề trên 2 máy cùng lúc (${RANGES[resultsDays]})`, myIncidents.map(x =>
        `<div class="text-[12px] rounded-lg bg-red-50 px-2 py-1 text-red-800"><b>${esc(CLASH_KINDS[x.kind][0])}</b> · ${esc(x.a.label)}${x.a.title ? ` (${esc(x.a.title)})` : ''} ↔ ${esc(x.b.label)}${x.b.title ? ` (${esc(x.b.title)})` : ''} · ${fmtShort(x.a.start || x.at)}</div>`).join(''), 'fa-triangle-exclamation') : '';

    // Cờ 2 máy: lấy từ báo cáo đang tải (có so chồng giờ), lượt cũ hơn khoảng báo cáo thì chỉ có cờ máy tự phát hiện
    const flagged = new Map((results || []).filter(r => r.flags.length).map(r => [r.id, r.flags]));
    const resultsHtml = section('Lịch sử làm đề (30 lần gần nhất)', d.results === null
        ? '<p class="text-[12px] text-red-500">Không đọc được — đã deploy luật Firestore mới (admin đọc quiz_results) và chỉ mục quiz_results (userId + completedAt) chưa?</p>'
        : `<div class="grid gap-1">${d.results.map(r => {
            r.flags = flagged.get(r.id) || (r.clash ? [r.clash] : []);
            return attemptChip(r, { withTitle: true });
        }).join('') || '<p class="text-[12px] text-slate-400">Chưa nộp bài nào.</p>'}</div>`, 'fa-list-check');

    const logins = section('Lịch sử đăng nhập', `<ul class="space-y-1">${(d.logins || []).map(l => `<li class="text-[12px] rounded-lg px-2 py-1 ${l.alert ? 'bg-red-50 text-red-700' : 'text-slate-600'}">
        <b>${fmtDate(l.at)}</b> · ${esc(l.label || '')}${placeOf(l) ? ' · ' + esc(placeOf(l)) : ''}${l.ip ? ' · ' + esc(l.ip) : ''}
        ${l.alert ? `<span class="block font-bold">${esc(l.alert)}</span>` : ''}</li>`).join('') || '<li class="text-[12px] text-slate-400">Chưa có.</li>'}</ul>`, 'fa-right-to-bracket');

    const edit = section('Chỉnh sửa', `
        <div class="flex gap-2"><input id="dr-name" class="inp flex-1" value="${esc(u.displayName || '')}" placeholder="Tên hiển thị / username" autocomplete="off">
            <button type="button" data-do="rename" class="btn bg-slate-700 hover:bg-slate-800 text-white">Đổi tên</button></div>
        <div class="flex gap-2"><input id="dr-pass" class="inp flex-1" placeholder="Mật khẩu mới (≥ 6 ký tự)" autocomplete="off">
            <button type="button" data-do="setpass" class="btn btn-candy">Đổi mật khẩu</button></div>
        <div class="flex flex-wrap gap-2 pt-1">
            <button type="button" data-do="notify" class="btn bg-sky-50 hover:bg-sky-100 text-sky-700"><i class="fas fa-bullhorn mr-1"></i>Gửi thông báo riêng</button>
            ${isAdm ? '' : '<button type="button" data-do="delete" class="btn bg-red-50 hover:bg-red-100 text-red-600 ml-auto"><i class="fas fa-trash mr-1"></i>Xoá tài khoản</button>'}
        </div>`, 'fa-pen');

    // Dữ liệu mới về → vẽ lại ngăn này: giữ chữ đang gõ dở + ô đang chọn + vị trí cuộn
    const keep = ['dr-limit', 'dr-name', 'dr-pass'].map(id => [id, $(id)?.value]).filter(([, v]) => v != null);
    const focused = document.activeElement?.id;
    const scroller = $('drawer-body').parentElement;
    const top = scroller.scrollTop;
    $('drawer-body').innerHTML = head + clashes + nowDoing + featureSection(u) + perms + limits + devs + resultsHtml + logins + edit;
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
        if (guess) { guess(u, access); renderDrawer(); paintUser(u.uid); }
        else btn.disabled = true;
        try {
            const r = await adminUpdateUser({ uid: u.uid, email: u.email, ...payload });
            if (r.user?.uid === u.uid) Object.assign(u, r.user);
            showToast(okMsg, 'success', 2000);
            // Khoá / hạ số máy / thu hồi phiên / đổi tên… làm đổi danh sách máy hoặc dữ liệu khác → tải lại ngăn ở nền (màn hình đã đổi rồi)
            if (!guess || 'disabled' in payload || 'deviceLimit' in payload) refreshDrawer();
        } catch (e) {
            Object.assign(u, before.u);
            access = before.access;
            showToast('Lỗi: ' + e.message, 'error', 5000);
        }
        if (openUid === u.uid) renderDrawer();
        paintUser(u.uid);
    };
    const e = lc(u.email);
    const listSet = (arr, on) => { const i = arr.indexOf(e); if (on && i < 0) arr.push(e); if (!on && i >= 0) arr.splice(i, 1); };
    const nLimit = (v) => Number.isInteger(v) && v >= 1 && v <= EXEMPT_MAX;
    switch (act) {
        case 'pw': {
            const next = !canPassword(u);
            const unlim = next ? access.deviceExempt.includes(e) : false;
            return run({ allowPassword: next, unlimitedDevices: unlim },
                next ? 'Đã cho đăng nhập thẳng.' : 'Đã bắt đăng nhập qua Google.',
                (_, a) => { listSet(a.passwordAllowed, next); listSet(a.deviceExempt, unlim); });
        }
        case 'unlim': {
            // deviceExempt kiêm luôn "đăng nhập thẳng" → bỏ 20 máy thì giữ nguyên quyền đăng nhập thẳng đang có
            const next = !access.deviceExempt.includes(e);
            const pw = next || canPassword(u);
            return run({ unlimitedDevices: next, allowPassword: pw }, next ? 'Đã đặc cách 20 máy.' : 'Đã bỏ đặc cách 20 máy.',
                (_, a) => { listSet(a.deviceExempt, next); listSet(a.passwordAllowed, pw); });
        }
        case 'approved': {
            const next = !u.approved;
            return run({ approved: next }, next ? 'Đã duyệt tài khoản.' : 'Đã bỏ duyệt.', (x) => { x.approved = next; });
        }
        case 'lock': {
            if (!u.disabled && !await showConfirm(`Khoá ${u.email}? Mọi máy bị đá ra, không đăng nhập lại được tới khi mở khoá.`, { title: 'Khoá tài khoản?', confirmText: 'Khoá', tone: 'danger' })) return;
            const next = !u.disabled;
            return run({ disabled: next }, next ? 'Đã khoá tài khoản.' : 'Đã mở khoá.', (x) => { x.disabled = next; });
        }
        case 'set-limit': {
            const n = Number($('dr-limit').value);
            if (!nLimit(n)) return showToast(`Nhập số máy từ 1 đến ${EXEMPT_MAX}.`, 'warning');
            return run({ deviceLimit: n }, `Đã đặt ${n} máy cho tài khoản này.`, (_, a) => { a.deviceLimits[e] = n; });
        }
        case 'quick-limit': {
            const n = Number(btn.dataset.n);
            return run({ deviceLimit: n }, `Đã đặt ${n} máy cho tài khoản này.`, (_, a) => { a.deviceLimits[e] = n; });
        }
        case 'clear-limit': return run({ deviceLimit: null }, 'Đã bỏ số máy riêng.', (_, a) => { delete a.deviceLimits[e]; });
        case 'kick': return kick(u.uid, btn.dataset.device, btn.dataset.label);
        case 'kick-all': return kick(u.uid, '', '');
        case 'revoke': {
            if (!await showConfirm('Đá mọi máy và vô hiệu mọi phiên đăng nhập của tài khoản này. Người đó phải đăng nhập lại.', { title: 'Thu hồi mọi phiên?', confirmText: 'Thu hồi', tone: 'danger' })) return;
            return run({ revokeSessions: true }, 'Đã thu hồi mọi phiên.');
        }
        case 'rename': {
            const name = $('dr-name').value.trim();
            if (!name) return showToast('Nhập tên mới.', 'warning');
            return run({ displayName: name }, 'Đã đổi tên.');
        }
        case 'setpass': {
            const p = $('dr-pass').value;
            if (p.length < 6) return showToast('Mật khẩu phải từ 6 ký tự.', 'warning');
            return run({ password: p }, 'Đã đổi mật khẩu.');
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
                closeDrawer();
                renderAccounts();
            } catch (e) { showToast('Lỗi: ' + e.message, 'error', 5000); btn.disabled = false; }
        }
    }
}

// ---------------- NHẬT KÝ QUẢN TRỊ (admin_log) ----------------
// Thao tác với tài khoản do máy chủ ghi (api/devices.js audit); thao tác cài đặt ở trang này tự ghi qua logAction.
const ACTIONS = {
    'kick-device': 'Đá 1 máy', 'kick-all': 'Đá mọi máy', 'create-user': 'Tạo tài khoản', 'reset-user': 'Tạo lại / cập nhật tài khoản',
    'update-user': 'Chỉnh tài khoản', 'delete-user': 'Xoá tài khoản', 'default-limit': 'Đổi số máy mặc định',
    announce: 'Gửi thông báo', 'announce-off': 'Tắt thông báo', 'purge-live': 'Dọn dữ liệu trực tiếp', 'purge-runs': 'Dọn lượt làm cũ'
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
            const detail = Object.entries(x.detail && typeof x.detail === 'object' ? x.detail : {})
                .map(([k, v]) => `${esc(FIELDS[k] || k)}: <b>${esc(showVal(v))}</b>`).join(' · ');
            return `<li class="text-[12px] rounded-lg px-2 py-1.5 bg-slate-50/80 border border-slate-100">
                <span class="font-bold text-slate-700">${esc(own(ACTIONS, x.action) ? ACTIONS[x.action] : x.action)}</span>
                ${x.target ? `<span class="text-slate-600">· ${esc(who(x.target))}</span>` : ''}
                <span class="text-slate-400 float-right">${fmtDate(msOf(x.at))}</span>
                ${detail ? `<span class="block text-slate-500">${detail}</span>` : ''}
                <span class="block text-[10.5px] text-slate-400">bởi ${esc(x.by)}</span></li>`;
        }).join('') || '<li class="text-[12px] text-slate-400">Chưa có thao tác nào.</li>';
    }, (e) => {
        $('audit-list').innerHTML = `<li class="text-[12px] text-red-500">Không đọc được nhật ký${e?.code === 'permission-denied' ? ' — luật Firestore mới (admin_log) đã deploy chưa?' : ''}.</li>`;
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
            ? `<div class="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2"><b>Đang hiện</b> (${a.to?.length ? 'gửi riêng ' + esc(a.to.join(', ')) : 'tất cả'}${until ? ` · hết hạn ${fmtDate(until)}` : ' · không hết hạn'}):<br><span class="whitespace-pre-line">${esc(a.text)}</span></div>`
            : 'Hiện không có thông báo nào đang hiện.';
    } catch (e) { $('ann-current').textContent = 'Không đọc được thông báo hiện tại.'; }
}

function bindSettings() {
    $('set-default-save').addEventListener('click', async () => {
        const n = Number($('set-default-limit').value);
        try { await setDefaultLimit(n); showToast(`Mặc định giờ là ${n} máy / tài khoản.`, 'success'); logAction('default-limit', '', { n }); }
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
            showToast(to.length ? `Đã gửi riêng cho ${to.length} người.` : 'Đã gửi cho tất cả.', 'success');
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
