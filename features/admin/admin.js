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

const RESULTS_MAX = 1500;                         // số lượt nộp tối đa mỗi lần tải báo cáo (mỗi lượt = 1 lượt đọc)
const PURGE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;
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
        const snap = await getDocs(query(collection(db, 'quiz_results'), where('completedAt', '>=', since), orderBy('completedAt', 'desc'), limit(RESULTS_MAX)));
        if (token !== resultsToken) return;
        results = snap.docs.map(d => normResult(d.id, d.data()));
        resultsCapped = snap.size >= RESULTS_MAX;
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
    el.textContent = `Báo cáo ${RANGES[resultsDays]} · ${results.length}${resultsCapped ? '+' : ''} lượt nộp · ${doing} người đang làm · tải lúc ${fmtClock(resultsAt)}`;
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
        <button type="button" class="font-extrabold text-slate-800 hover:text-amber-600 text-left min-w-0 truncate" data-act="open" data-uid="${esc(uid)}">${esc(nameOf(p))}</button>
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
    $('rep-stats').innerHTML =
        stat('Lượt nộp bài', `${all.length}${resultsCapped ? '+' : ''}`, `${people} người · ${RANGES[resultsDays]}`, 'text-pink-600') +
        stat('Đề đã có người làm', quizIds.size, all.length ? `điểm trung bình ${avg}%` : 'chưa có lượt nộp', 'text-violet-600') +
        stat('Đang làm (chưa nộp)', doing.size, runsError ? 'chưa đọc được' : `${doingDevices} máy`, 'text-emerald-600') +
        stat('Cảnh báo 2 máy', clashUids().size, inc.length ? `${inc.length} lần · xem bên dưới` : 'không có', inc.length ? 'text-red-600' : 'text-slate-500');

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
        </div>`).join('<hr class="border-amber-100">')}</div>
    </details>` : '';

    const q = lc($('rep-search').value.trim());
    const onlyClash = $('rep-only-clash').checked;
    const shown = all.filter(r => matchesQ(r, q) && (!onlyClash || r.flags.length));
    let html = '';
    if (!results) html = '';
    else if (repView === 'quiz') html = renderByQuiz(shown);
    else html = renderByUser(shown);
    $('rep-list').innerHTML = html || `<div class="card p-6 text-center text-slate-400 font-bold">${resultsError ? esc(resultsError) : results ? (all.length ? 'Không có lượt nộp nào khớp bộ lọc.' : `Chưa ai nộp bài trong ${RANGES[resultsDays]}.`) : 'Đang tải…'}</div>`;
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

function renderByQuiz(list) {
    const quizzes = [...groupBy(list, 'quizId').entries()]
        .map(([id, rs]) => ({ id, rs, title: rs.find(r => r.title)?.title || '', people: groupBy(rs, 'uid') }))
        .sort((a, b) => b.people.size - a.people.size || b.rs.length - a.rs.length);
    return quizzes.slice(0, 200).map(qz => {
        const flagged = qz.rs.filter(r => r.flags.length).length;
        const avg = Math.round(qz.rs.reduce((s, r) => s + r.pct, 0) / qz.rs.length);
        const rows = [...qz.people.entries()]
            .sort((a, b) => b[1].length - a[1].length)
            .map(([uid, rs]) => `<div class="space-y-1">
                ${personHead(uid, `<span class="chip bg-slate-100 text-slate-600">${rs.length} lượt</span>`)}
                <div class="grid gap-1">${rs.slice(0, 10).map(r => attemptChip(r)).join('')}</div>
                ${rs.length > 10 ? `<p class="text-[11px] text-slate-400 pl-1">… và ${rs.length - 10} lượt cũ hơn</p>` : ''}
            </div>`).join('<hr class="border-amber-100">');
        return `<div class="card p-4 space-y-3">
            <div class="flex flex-wrap items-start gap-2">
                <div class="min-w-0 flex-1">
                    <p class="font-black text-slate-800 leading-snug break-words">${esc(qz.title || 'Đề chưa rõ tên')}</p>
                    <p class="text-[11px] text-slate-400 font-semibold truncate">Mã đề: ${esc(qz.id)}</p>
                </div>
                <span class="chip bg-pink-100 text-pink-700 text-[12px]"><i class="fas fa-user-group"></i>${qz.people.size} người</span>
                <span class="chip bg-violet-100 text-violet-700 text-[12px]">${qz.rs.length} lượt · TB ${avg}%</span>
                ${flagged ? `<span class="chip bg-red-100 text-red-700 text-[12px]"><i class="fas fa-triangle-exclamation"></i>${flagged} lượt 2 máy</span>` : ''}
                <a href="../quiz/quiz.html?id=${encodeURIComponent(qz.id)}" target="_blank" rel="noopener" class="chip bg-slate-100 text-slate-600 hover:bg-slate-200 text-[12px]"><i class="fas fa-up-right-from-square"></i>Mở đề</a>
            </div>
            ${rows}
        </div>`;
    }).join('') + (quizzes.length > 200 ? `<p class="text-[12px] text-slate-400 text-center">Đang hiện 200/${quizzes.length} đề — lọc để thu hẹp.</p>` : '');
}

function renderByUser(list) {
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
                <button type="button" class="btn bg-amber-50 hover:bg-amber-100 text-amber-800" data-act="open" data-uid="${esc(uid)}"><i class="fas fa-id-card mr-1"></i>Chi tiết</button>
            </div>
            <div class="grid gap-1">${rs.slice(0, 20).map(r => attemptChip(r, { withTitle: true })).join('')}</div>
            ${rs.length > 20 ? `<p class="text-[11px] text-slate-400 pl-1">… và ${rs.length - 20} lượt cũ hơn</p>` : ''}
        </div>`;
    }).join('') + (people.length > 200 ? `<p class="text-[12px] text-slate-400 text-center">Đang hiện 200/${people.length} người — lọc để thu hẹp.</p>` : '');
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
    downloadCsv(rows, 'bao-cao-de');
    showToast(`Đã xuất ${rows.length - 1} lượt nộp.`, 'success');
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

// Doc quiz_runs: mỗi tài khoản × máy một doc nên không phình nhiều; máy đổi id (xoá dữ liệu trình duyệt) thì doc cũ nằm lại → dọn sau 14 ngày
async function purgeRuns(manual) {
    const snap = await getDocs(query(collection(db, 'quiz_runs'), where('at', '<', Timestamp.fromMillis(Date.now() - PURGE_AFTER_MS)), limit(400)));
    if (!snap.empty) {
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
    }
    if (manual) showToast(snap.empty ? 'Không có gì cần dọn.' : `Đã dọn ${snap.size} bản ghi cũ.`, 'success');
    if (manual && !snap.empty) logAction('purge-runs', '', { count: snap.size });
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
        return true;
    }).sort((a, b) => (rank(b) - rank(a)) || ((b.lastSignInAt || 0) - (a.lastSignInAt || 0)));
}

function exportCsv() {
    if (!users) return showToast('Danh sách tài khoản chưa tải xong.', 'warning');
    const doing = doingByUid();
    const clash = clashUids();
    const rows = [['Email', 'Tên', 'UID', 'Đang làm đề (số máy)', 'Cảnh báo 2 máy', 'Đăng nhập thẳng', 'Số máy được dùng', 'Số máy riêng', 'Đã duyệt', 'Bị khoá',
        'Cách đăng nhập', 'Ngày tạo', 'Đăng nhập gần nhất']];
    for (const u of filteredUsers(doing, clash)) {
        rows.push([u.email, u.displayName, u.uid, doing.get(u.uid)?.devices.size || 0, clash.has(u.uid) ? 'có' : '', canPassword(u) ? 'có' : '', accLimit(u),
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
    $('acc-list').innerHTML = list.slice(0, 300).map(u => {
        const g = doing.get(u.uid);
        const custom = customLimit(u);
        return `<button type="button" class="card w-full text-left px-3.5 py-2.5 hover:border-amber-300 transition flex flex-wrap items-center gap-x-3 gap-y-1" data-uid="${esc(u.uid)}">
            <span class="w-2.5 h-2.5 rounded-full ${g ? 'bg-emerald-500' : 'bg-slate-200'} shrink-0" title="${g ? 'Đang làm đề' : 'Không làm đề'}"></span>
            <span class="min-w-0 flex-1">
                <span class="block font-extrabold text-slate-800 truncate">${esc(u.displayName || u.email.split('@')[0])}${u.isAdmin ? ' <i class="fas fa-crown text-amber-500 text-[11px]"></i>' : ''}</span>
                <span class="block text-[11.5px] text-slate-400 truncate">${esc(u.email)}</span>
            </span>
            <span class="flex flex-wrap gap-1">
                ${clash.has(u.uid) ? '<span class="chip bg-red-100 text-red-700"><i class="fas fa-triangle-exclamation"></i>2 máy cùng lúc</span>' : ''}
                ${g ? `<span class="chip ${g.devices.size >= 2 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'}">đang làm đề${g.devices.size >= 2 ? ` · ${g.devices.size} máy` : ''}</span>` : ''}
                ${u.disabled ? '<span class="chip bg-red-100 text-red-700">Bị khoá</span>' : ''}
                ${!u.approved ? '<span class="chip bg-slate-200 text-slate-600">Chưa duyệt</span>' : ''}
                ${canPassword(u) ? '<span class="chip bg-emerald-100 text-emerald-700">🔑 thẳng</span>' : ''}
                <span class="chip ${custom ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500'}">${accLimit(u) >= EXEMPT_MAX ? '∞' : accLimit(u)} máy${custom ? ' (riêng)' : ''}</span>
                ${u.providers?.includes('google.com') ? '<span class="chip bg-sky-50 text-sky-700"><i class="fab fa-google"></i></span>' : ''}
            </span>
            <span class="text-[11px] text-slate-400 font-semibold w-full sm:w-auto">đăng nhập ${ago(u.lastSignInAt)}</span>
        </button>`;
    }).join('') || '<div class="card p-6 text-center text-slate-400 font-bold">Không có tài khoản khớp.</div>';
}

function bindAccounts() {
    $('acc-search').addEventListener('input', renderAccounts);
    $('acc-filter').addEventListener('change', renderAccounts);
    $('acc-reload').addEventListener('click', loadUsers);
    $('acc-export').addEventListener('click', exportCsv);
    $('acc-list').addEventListener('click', (e) => {
        const b = e.target.closest('[data-uid]');
        if (b) openDrawer(b.dataset.uid);
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
            const r = await adminCreateUser({ email, password, displayName, allowPassword: $('new-allow-pw').checked, unlimitedDevices: false });
            if (lim !== null) await adminUpdateUser({ uid: r.user.uid, email, deviceLimit: lim });
            showToast(`${r.created ? 'Đã tạo' : 'Đã cập nhật'} ${email}.`, 'success');
            ['new-email', 'new-pass', 'new-name', 'new-limit'].forEach(id => { $(id).value = ''; });
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
    return `<div class="card p-4 space-y-2"><p class="text-[13px] font-extrabold text-amber-800"><i class="fas ${icon} mr-1.5"></i>${title}</p>${body}</div>`;
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
            <button type="button" data-do="set-limit" class="btn bg-amber-500 hover:bg-amber-600 text-white">Đặt số riêng</button>
            ${custom ? '<button type="button" data-do="clear-limit" class="btn bg-slate-100 hover:bg-slate-200 text-slate-600">Bỏ số riêng</button>' : ''}
            <span class="flex gap-1">${[1, 2, 3, 5].map(n => `<button type="button" data-do="quick-limit" data-n="${n}" class="btn bg-amber-50 hover:bg-amber-100 text-amber-800">${n}</button>`).join('')}</span>
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
            <button type="button" data-do="setpass" class="btn bg-amber-500 hover:bg-amber-600 text-white">Đổi mật khẩu</button></div>
        <div class="flex flex-wrap gap-2 pt-1">
            <button type="button" data-do="notify" class="btn bg-sky-50 hover:bg-sky-100 text-sky-700"><i class="fas fa-bullhorn mr-1"></i>Gửi thông báo riêng</button>
            ${isAdm ? '' : '<button type="button" data-do="delete" class="btn bg-red-50 hover:bg-red-100 text-red-600 ml-auto"><i class="fas fa-trash mr-1"></i>Xoá tài khoản</button>'}
        </div>`, 'fa-pen');

    // Dữ liệu mới về → vẽ lại ngăn này: giữ chữ đang gõ dở + ô đang chọn + vị trí cuộn
    const keep = ['dr-limit', 'dr-name', 'dr-pass'].map(id => [id, $(id)?.value]).filter(([, v]) => v != null);
    const focused = document.activeElement?.id;
    const scroller = $('drawer-body').parentElement;
    const top = scroller.scrollTop;
    $('drawer-body').innerHTML = head + clashes + nowDoing + perms + limits + devs + resultsHtml + logins + edit;
    keep.forEach(([id, v]) => { if ($(id)) $(id).value = v; });
    if (focused && $(focused)) $(focused).focus();
    scroller.scrollTop = top;
}

async function drawerAction(act, btn) {
    const d = drawerData;
    if (!d) return;
    const u = d.user;
    const run = async (payload, okMsg) => {
        btn.disabled = true;
        try {
            await adminUpdateUser({ uid: u.uid, email: u.email, ...payload });
            showToast(okMsg, 'success');
            await refreshDrawer();
        } catch (e) { showToast('Lỗi: ' + e.message, 'error', 5000); btn.disabled = false; }
    };
    const nLimit = (v) => Number.isInteger(v) && v >= 1 && v <= EXEMPT_MAX;
    switch (act) {
        case 'pw': {
            const next = !canPassword(u);
            return run({ allowPassword: next, unlimitedDevices: next ? access.deviceExempt.includes(lc(u.email)) : false },
                next ? 'Đã cho đăng nhập thẳng.' : 'Đã bắt đăng nhập qua Google.');
        }
        case 'unlim': {
            // deviceExempt kiêm luôn "đăng nhập thẳng" → bỏ 20 máy thì giữ nguyên quyền đăng nhập thẳng đang có
            const next = !access.deviceExempt.includes(lc(u.email));
            return run({ unlimitedDevices: next, allowPassword: next || canPassword(u) }, next ? 'Đã đặc cách 20 máy.' : 'Đã bỏ đặc cách 20 máy.');
        }
        case 'approved': return run({ approved: !u.approved }, u.approved ? 'Đã bỏ duyệt.' : 'Đã duyệt tài khoản.');
        case 'lock': {
            if (!u.disabled && !await showConfirm(`Khoá ${u.email}? Mọi máy bị đá ra, không đăng nhập lại được tới khi mở khoá.`, { title: 'Khoá tài khoản?', confirmText: 'Khoá', tone: 'danger' })) return;
            return run({ disabled: !u.disabled }, u.disabled ? 'Đã mở khoá.' : 'Đã khoá tài khoản.');
        }
        case 'set-limit': {
            const n = Number($('dr-limit').value);
            if (!nLimit(n)) return showToast(`Nhập số máy từ 1 đến ${EXEMPT_MAX}.`, 'warning');
            return run({ deviceLimit: n }, `Đã đặt ${n} máy cho tài khoản này.`);
        }
        case 'quick-limit': return run({ deviceLimit: Number(btn.dataset.n) }, `Đã đặt ${btn.dataset.n} máy cho tài khoản này.`);
        case 'clear-limit': return run({ deviceLimit: null }, 'Đã bỏ số máy riêng.');
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
    text: 'Nội dung', hours: 'Số giờ', count: 'Số bản ghi'
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
