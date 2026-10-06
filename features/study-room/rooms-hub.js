// rooms-hub.js — khu "Phòng học của tôi" ở trang chủ (panel #myStudyRoomsContent).
//
// Khác bản cũ (chỉ liệt kê phòng mình tạo + ngày tạo):
//  - THẺ SỐNG: nghe members của từng phòng nên thấy ngay ai đang ở trong, đang làm câu mấy.
//  - Phòng ĐÃ THAM GIA (không phải chủ) cũng hiện, lấy từ localStorage `roomRecents`
//    (ghi ở study-room-main.js lúc vào phòng) — Firestore không truy được "phòng tôi từng vào".
//  - Hẹn giờ buổi học (`scheduledAt`), đếm ngược + tải .ics; tên/emoji/màu phòng; ghim; mời bằng QR.
//
// Field THÊM trong doc `study_rooms/{id}` (đều không bắt buộc, phòng cũ vẫn chạy):
//   title, emoji, theme (0-5), scheduledAt (ms), live { title, qCount, startedAt, ended, endedAt, avg, people }
// `live` do room-quiz.js ghi lúc bắt đầu/kết thúc phiên — để hub khỏi phải tải cả bộ đề về.
import {
    collection, doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, onSnapshot, query, where, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { db } from '../../core/firebase-init.js';
import { onSessionUser } from '../../core/auth-session.js';
import { showToast, showConfirm } from '../../core/utils.js';

const STALE_MS = 90000;          // quá 90s không nhịp tim thì coi như đã rời
const MAX_LIVE = 12;             // trần số phòng được nghe trực tiếp (khỏi mở 40 listener)
const EMOJIS = ['📚', '🩺', '🧠', '💊', '🔬', '🫀', '🦴', '🧬', '☕', '🌙', '🐿️', '🎯'];

const el = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const readLS = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch (e) { return def; } };
const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* đầy bộ nhớ: bỏ qua */ } };

const isOnline = (m) => m.online !== false && (Date.now() - (m.lastSeen || 0) < STALE_MS);
const hashTheme = (id) => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) % 997; return h % 6; };
const linkOf = (id) => new URL('features/study-room/study-room.html?id=' + encodeURIComponent(id), location.href).href;

// ---------------- Trạng thái ----------------
const state = {
    user: null,
    rooms: new Map(),        // id -> { id, data, role:'owner'|'guest' }
    live: new Map(),         // id -> { members: [], at }
    q: '', qRaw: '', filter: 'all', sort: 'active', view: 'grid', day: null,
    collapsed: { older: true },      // nhóm đang gập (lưu cùng prefs)
    flash: new Map(),                // id phòng -> hạn nháy viền khi có bạn vừa vào
    loading: true, error: null, open: false, lastSig: '',
};
let unsubOwned = null, unsubUser = null;
const roomUnsubs = new Map();    // id -> [fn]
let tick = null;

Object.assign(state, readLS('roomHubPrefs', {}));

const pins = () => readLS('roomPins', []);
const isPinned = (id) => pins().includes(id);
const togglePin = (id) => {
    const list = pins();
    writeLS('roomPins', list.includes(id) ? list.filter(x => x !== id) : [id, ...list]);
    render(true);
};
const recents = () => readLS('roomRecents', []).filter(r => r && r.id);
const forgetRecent = (id) => { writeLS('roomRecents', recents().filter(r => r.id !== id)); };

/** Ghi nhớ phòng vừa vào (study-room-main.js gọi bản chép của hàm này). */
export function rememberRoomVisit(id) {
    if (!id) return;
    const list = recents().filter(r => r.id !== id);
    list.unshift({ id, at: Date.now() });
    writeLS('roomRecents', list.slice(0, 24));
}

// ---------------- Vòng đời ----------------
export function openRoomsHub() {
    state.open = true;
    mount();
    render(true);                       // xương cá ngay, đừng chờ Firebase Auth mới có gì để nhìn
    if (!unsubUser) {
        let resolved = false;
        unsubUser = onSessionUser((u) => {
            resolved = true;
            const changed = (u?.uid || null) !== (state.user?.uid || null);
            state.user = u;
            if (changed || state.loading) reload();
        });
        // Auth không trả lời (mất mạng / bị chặn) thì vẫn phải hiện phòng đã vào + lời mời đăng nhập
        setTimeout(() => { if (!resolved && state.loading) reload(); }, 2500);
    } else {
        reload();
    }
    // Đếm ngược giờ hẹn + "x phút trước" tự tươi mỗi 30s
    clearInterval(tick);
    tick = setInterval(() => state.open && render(true), 30000);
}

export function closeRoomsHub() {
    state.open = false;
    clearInterval(tick);
    stopRoomListeners();
    if (unsubOwned) { unsubOwned(); unsubOwned = null; }
    el('rh-note')?.remove();
}

function stopRoomListeners() {
    roomUnsubs.forEach(list => list.forEach(fn => { try { fn(); } catch (e) { /* đã gỡ */ } }));
    roomUnsubs.clear();
}

// ---------------- Khung ----------------
// Mẫu tạo nhanh: chạm là mở hộp Tạo phòng đã điền sẵn tên · biểu tượng · màu (· giờ hẹn). Emoji phải nằm trong EMOJIS.
const PRESETS = [
    { emoji: '🌙', name: 'Cày đề tối nay', theme: 1, label: 'Cày đề tối nay', when: () => tonightAt(20) },
    { emoji: '📚', name: 'Ôn bài trong tuần', theme: 2, label: 'Ôn bài trong tuần' },
    { emoji: '🎯', name: 'Thi thử cuối kỳ', theme: 5, label: 'Thi thử cuối kỳ' },
    { emoji: '☕', name: 'Học nhóm cuối tuần', theme: 4, label: 'Học nhóm cuối tuần' },
];
function tonightAt(h) {
    const d = new Date();
    d.setHours(h, 0, 0, 0);
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
    return d.getTime();
}

function mount() {
    const host = el('rooms-hub');
    if (!host || host.dataset.ready) return;
    host.dataset.ready = '1';
    host.innerHTML = `
        <header class="rh-top">
            <div class="rh-ttl">
                <span class="rh-ttl-ic"><i class="fas fa-chalkboard-user"></i></span>
                <div class="rh-ttl-txt">
                    <h2><span>Phòng học của tôi</span></h2>
                    <div id="rh-sum" class="rh-sum"></div>
                </div>
            </div>
            <div class="rh-hero-act">
                <button type="button" id="rh-join" class="rh-btn rh-btn-ghost"><i class="fas fa-key"></i> Vào bằng mã</button>
                <button type="button" id="rh-create" class="rh-btn rh-btn-main"><i class="fas fa-plus"></i> Tạo phòng mới</button>
            </div>
        </header>
        <div id="rh-today"></div>
        <div class="rh-quick" id="rh-quick">
            <span class="rh-quick-lb"><i class="fas fa-bolt"></i> Tạo nhanh</span>
            ${PRESETS.map((p, i) => `<button type="button" class="rh-qchip" data-preset="${i}"><span>${p.emoji}</span>${esc(p.label)}</button>`).join('')}
        </div>
        <div id="rh-week" class="rh-week" hidden></div>
        <div class="rh-bar">
            <label class="rh-search"><i class="fas fa-magnifying-glass"></i>
                <input type="search" id="rh-q" placeholder="Tìm phòng, hoặc dán mã / link để vào" autocomplete="off">
            </label>
            <div class="rh-chips" id="rh-filters"></div>
            <select id="rh-sort" class="rh-select" title="Sắp xếp">
                <option value="active">Hoạt động gần đây</option>
                <option value="new">Mới tạo nhất</option>
                <option value="name">Tên A → Z</option>
            </select>
            <button type="button" id="rh-view" class="rh-icon-btn" title="Đổi kiểu hiển thị"><i class="fas fa-table-cells-large"></i></button>
        </div>
        <div id="rh-join-row"></div>
        <div id="rh-grid" class="rh-grid"></div>`;

    el('rh-sort').value = state.sort;
    el('rh-q').addEventListener('input', (e) => { state.q = e.target.value.trim().toLowerCase(); state.qRaw = e.target.value.trim(); render(true); });
    el('rh-q').addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const exact = exactRoom(e.target.value);
        if (exact) return void (location.href = linkOf(exact.id));
        if (host.querySelector('.rh-joinrow')) return void joinRoom(e.target.value, { bad: (m) => showToast(m, 'warning') });
        const first = host.querySelector('.rh-card[data-id]');
        if (first) location.href = linkOf(first.dataset.id);
    });
    el('rh-sort').addEventListener('change', (e) => { state.sort = e.target.value; savePrefs(); render(true); });
    el('rh-view').addEventListener('click', () => {
        state.view = state.view === 'grid' ? 'list' : 'grid';
        savePrefs(); render(true);
    });
    el('rh-filters').addEventListener('click', (e) => {
        const chip = e.target.closest('[data-f]');
        if (!chip) return;
        if (chip.dataset.f === 'day-off') state.day = null;
        else { state.filter = chip.dataset.f; }
        savePrefs(); render(true);
    });
    el('rh-week').addEventListener('click', (e) => {
        const d = e.target.closest('[data-day]');
        if (!d || d.disabled) return;
        state.day = state.day === d.dataset.day ? null : d.dataset.day;
        render(true);
    });
    el('rh-quick').addEventListener('click', (e) => {
        const b = e.target.closest('[data-preset]');
        if (b) openCreateModal({ preset: PRESETS[Number(b.dataset.preset)] });
    });
    el('rh-create').addEventListener('click', () => openCreateModal());
    el('rh-join').addEventListener('click', () => openJoinModal());
    el('rh-grid').addEventListener('click', onGridClick);
    el('rh-today').addEventListener('click', onGridClick);
    el('rh-join-row').addEventListener('click', onGridClick);

    document.addEventListener('keydown', (e) => {
        if (!state.open) return;
        const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
        if (typing || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.rh-modal')) return;
        if (e.key === '/') { e.preventDefault(); el('rh-q')?.focus(); }
        if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openCreateModal(); }
    });
}

const savePrefs = () => writeLS('roomHubPrefs', { filter: state.filter, sort: state.sort, view: state.view, collapsed: state.collapsed });

// ---------------- Tải dữ liệu ----------------
async function reload() {
    stopRoomListeners();
    if (unsubOwned) { unsubOwned(); unsubOwned = null; }
    state.rooms.clear();
    state.live.clear();
    state.error = null;
    state.loading = true;
    render(true);

    // Phòng đã tham gia (không phải chủ) — đọc từ nhật ký cục bộ
    const recentIds = recents().map(r => r.id);

    if (!state.user) {
        state.loading = false;
        await hydrateGuestRooms(recentIds);
        render(true);
        return;
    }

    try {
        // Sort ở client: where + orderBy khác field sẽ đòi composite index
        unsubOwned = onSnapshot(query(collection(db, 'study_rooms'), where('owner', '==', state.user.uid)), (snap) => {
            snap.docs.forEach(d => state.rooms.set(d.id, { id: d.id, data: d.data() || {}, role: 'owner' }));
            // Phòng bị xoá ở nơi khác
            const alive = new Set(snap.docs.map(d => d.id));
            [...state.rooms.keys()].forEach(id => {
                if (state.rooms.get(id).role === 'owner' && !alive.has(id)) dropRoom(id);
            });
            state.loading = false;
            watchLiveRooms();
            render();
        }, (err) => {
            console.error('Lỗi tải phòng học:', err);
            state.error = err.message || 'Không tải được danh sách phòng.';
            state.loading = false;
            render(true);
        });
    } catch (err) {
        console.error(err);
        state.error = err.message;
        state.loading = false;
    }

    await hydrateGuestRooms(recentIds.filter(id => !state.rooms.has(id)));
    render(true);
}

/** Nạp doc của những phòng chỉ "từng vào" — bỏ khỏi nhật ký nếu phòng đã bị xoá. */
async function hydrateGuestRooms(ids) {
    await Promise.all(ids.slice(0, MAX_LIVE).map(async (id) => {
        try {
            const snap = await getDoc(doc(db, 'study_rooms', id));
            if (!snap.exists()) return forgetRecent(id);
            const data = snap.data() || {};
            if (data.owner && data.owner === state.user?.uid) return;   // phòng của mình rồi
            state.rooms.set(id, { id, data, role: 'guest' });
        } catch (e) { /* mất mạng: cứ bỏ qua phòng đó */ }
    }));
    watchLiveRooms();
}

function dropRoom(id) {
    state.rooms.delete(id);
    state.live.delete(id);
    (roomUnsubs.get(id) || []).forEach(fn => { try { fn(); } catch (e) { /* đã gỡ */ } });
    roomUnsubs.delete(id);
}

/** Nghe members của các phòng đang hiện — nguồn của "ai đang trong phòng / đang ở câu mấy". */
function watchLiveRooms() {
    const ids = [...state.rooms.keys()].slice(0, MAX_LIVE);
    ids.forEach((id) => {
        if (roomUnsubs.has(id)) return;
        const un = onSnapshot(collection(db, 'study_rooms', id, 'members'), (snap) => {
            const prev = state.live.get(id);
            const members = snap.docs.map(d => ({ ...(d.data() || {}), _id: d.id }));
            state.live.set(id, { members, at: Date.now() });
            if (prev) announceJoins(id, prev.members, members);   // lần đầu (chưa có prev) thì không báo
            render();
        }, () => { /* phòng riêng tư / mất mạng: thẻ vẫn hiện, chỉ không có trạng thái */ });
        roomUnsubs.set(id, [un]);
    });
}

// ---------------- Suy ra trạng thái ----------------
function statusOf(r) {
    const live = state.live.get(r.id);
    const members = live?.members || [];
    const online = members.filter(isOnline);
    const sess = r.data.live || null;
    const running = !!(sess && sess.qCount && !sess.ended);
    const cursor = Math.max(0, ...online.map(m => Number(m.cursor) || 0));
    const lastSeen = Math.max(0, ...members.map(m => Number(m.lastSeen) || 0));
    const createdAt = r.data.createdAt?.toMillis?.() || 0;
    return {
        members, online, sess, running,
        step: running ? Math.min(cursor + 1, sess.qCount) : 0,
        pct: running ? Math.round(Math.min(cursor + 1, sess.qCount) / sess.qCount * 100) : 0,
        isLive: online.length > 0,
        lastActive: Math.max(lastSeen, sess?.startedAt || 0, sess?.endedAt || 0, createdAt),
        createdAt,
    };
}

const nameOf = (r) => r.data.title || r.id;
const themeOf = (r) => (typeof r.data.theme === 'number' ? r.data.theme : hashTheme(r.id));

function timeAgo(ms) {
    if (!ms) return '';
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return 'vừa xong';
    if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
    if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
    if (s < 604800) return `${Math.floor(s / 86400)} ngày trước`;
    return new Date(ms).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

const whenText = (ms) => {
    const d = new Date(ms);
    return `${d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })} · ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
};

// ---------------- Vẽ ----------------
const DAY_MS = 86400000;
const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const firstName = (n) => { const p = String(n || '').trim().split(/\s+/); return p[p.length - 1] || 'Bạn'; };
const schedOf = (r) => Number(r.data.scheduledAt) || 0;
const upcoming = (r) => schedOf(r) > Date.now() - 3600000;       // hẹn chưa qua quá 1 giờ
const parseRoomId = (raw) => (String(raw || '').match(/[?&]id=([^&#\s]+)/)?.[1] || String(raw || '').split(/[?#\s]/)[0] || '').trim();
const exactRoom = (raw) => {
    const id = parseRoomId(raw).toLowerCase();
    return id ? [...state.rooms.values()].find(r => r.id.toLowerCase() === id) : null;
};

/** Trạng thái hiển thị của một phòng: quyết định màu "đèn", nhãn, và phòng nằm ở nhóm nào. */
function kindOf(r, s) {
    if (s.isLive && s.running) return { k: 'live', label: 'Đang học', icon: 'fa-tower-broadcast' };
    if (s.isLive) return { k: 'lobby', label: 'Sảnh chờ', icon: 'fa-mug-hot' };
    if (upcoming(r)) return { k: 'soon', label: 'Sắp tới', icon: 'fa-calendar-day' };
    if (s.running) return { k: 'paused', label: 'Bỏ dở', icon: 'fa-pause' };
    if (s.sess?.ended) return { k: 'done', label: 'Đã xong', icon: 'fa-circle-check' };
    return { k: 'idle', label: 'Yên tĩnh', icon: 'fa-moon' };
}

/** Đếm ngược tách số lớn + đơn vị cho cuống vé. */
function stubParts(ms) {
    const d = ms - Date.now();
    if (d <= 0) return { big: 'Đến giờ', small: 'bắt đầu thôi', urgent: true };
    if (d > DAY_MS) return { big: String(Math.round(d / DAY_MS)), small: 'ngày nữa', urgent: false };
    const h = Math.floor(d / 3600000), m = Math.round((d % 3600000) / 60000);
    if (h) return { big: `${h}g${String(m).padStart(2, '0')}`, small: 'nữa bắt đầu', urgent: false };
    return { big: String(Math.max(1, m)), small: 'phút nữa', urgent: true };
}

function render(force = false) {
    const host = el('rooms-hub');
    if (!host || !host.dataset.ready) return;
    const grid = el('rh-grid');

    const all = [...state.rooms.values()];
    const list = visibleRooms();
    // Chữ ký: chặn vẽ lại vô ích (nhịp tim 30s của mỗi thành viên đều bắn snapshot).
    // Mọi thứ hero / lịch tuần / thẻ đọc phải nằm trong đây.
    const sig = JSON.stringify([state.loading, state.error, state.q, state.qRaw, state.filter, state.sort, state.view, state.day,
        state.collapsed, !!state.user, [...state.flash].filter(([, t]) => t > Date.now()).map(([id]) => id),
        all.map(r => {
            const s = statusOf(r);
            return [r.id, nameOf(r), r.data.emoji, themeOf(r), r.data.scheduledAt, s.online.map(m => (m.uid || m._id) + ':' + (m.cursor || 0)).join(','),
                s.step, s.running, s.sess?.title, s.sess?.avg, s.sess?.qCount, s.sess?.ended, s.members.length, r.role, isPinned(r.id)].join('|');
        })]);
    if (!force && sig === state.lastSig) return;
    state.lastSig = sig;

    // Chưa có phòng nào (hoặc chưa đăng nhập): bỏ thanh tìm/lọc/lịch cho khỏi rối, chỉ còn lời mời tạo phòng
    host.classList.toggle('is-bare', !state.rooms.size);
    host.classList.toggle('is-guest', !state.user);
    grid.className = 'rh-grid' + (state.view === 'list' ? ' is-list' : '');
    el('rh-view').innerHTML = `<i class="fas ${state.view === 'list' ? 'fa-list' : 'fa-table-cells-large'}"></i>`;
    renderSummary();
    renderToday();
    renderWeek();
    renderFilters();
    renderJoinRow(list);

    if (state.loading && !state.rooms.size) {
        grid.innerHTML = Array(3).fill('<div class="rh-sk"></div>').join('');
        return;
    }
    if (state.error) {
        grid.innerHTML = `<div class="rh-empty">
            <b><i class="fas fa-triangle-exclamation" style="color:#f87171"></i> Không tải được phòng học</b>
            <span>${esc(state.error)}</span>
            <button type="button" class="rh-btn rh-btn-ghost" data-act="retry"><i class="fas fa-rotate-right"></i> Thử lại</button></div>`;
        return;
    }
    if (!list.length) return void (grid.innerHTML = emptyHtml());

    // Nhóm theo THỜI ĐIỂM (đang diễn ra · sắp tới · gần đây · lâu rồi) — chủ phòng/khách chỉ là huy hiệu trên thẻ.
    // Có tìm kiếm / bộ lọc / sắp xếp khác thì phẳng, đừng chia nhóm.
    const grouped = state.sort === 'active' && state.filter === 'all' && !state.q && !state.day;
    let html;
    if (grouped) {
        const shown = groupRooms(list).filter(g => g.rooms.length);
        const heads = shown.length > 1 || shown.some(g => g.k === 'older');
        // Thẻ "Phòng mới" nằm cuối nhóm cuối cùng KHÔNG phải "Lâu rồi chưa vào" (nhóm đó hay gập sẵn)
        const ghostIn = [...shown].reverse().find(g => g.k !== 'older') || shown[shown.length - 1];
        html = shown.map(g => {
            const closed = heads && !!state.collapsed[g.k];
            return (heads ? secHtml(g, closed) : '') + (closed ? '' : g.rooms.map(cardHtml).join('')) + (g === ghostIn && !closed ? ghostHtml() : '');
        }).join('');
    } else {
        html = list.map(cardHtml).join('') + (state.filter === 'all' && !state.q && !state.day ? ghostHtml() : '');
    }
    grid.innerHTML = html;
}

function visibleRooms() {
    let list = [...state.rooms.values()];
    if (state.q) list = list.filter(r => (nameOf(r) + ' ' + r.id).toLowerCase().includes(state.q));
    if (state.filter === 'live') list = list.filter(r => statusOf(r).isLive);
    if (state.filter === 'mine') list = list.filter(r => r.role === 'owner');
    if (state.filter === 'guest') list = list.filter(r => r.role === 'guest');
    if (state.filter === 'pin') list = list.filter(r => isPinned(r.id));
    if (state.day) list = list.filter(r => schedOf(r) && dayKey(new Date(schedOf(r))) === state.day);

    const key = (r) => {
        const s = statusOf(r);
        if (state.sort === 'new') return -s.createdAt;
        if (state.sort === 'name') return null;              // xử lý riêng bên dưới
        return -(s.isLive ? Date.now() + s.online.length : s.lastActive);
    };
    list.sort((a, b) => {
        const pa = isPinned(a.id) ? 0 : 1, pb = isPinned(b.id) ? 0 : 1;
        if (pa !== pb) return pa - pb;
        if (state.sort === 'name') return nameOf(a).localeCompare(nameOf(b), 'vi');
        return key(a) - key(b);
    });
    return list;
}

function groupRooms(list) {
    const now = Date.now();
    const g = {
        live: { k: 'live', title: 'Đang diễn ra', icon: 'fa-tower-broadcast', rooms: [] },
        soon: { k: 'soon', title: 'Sắp tới', icon: 'fa-calendar-day', rooms: [] },
        recent: { k: 'recent', title: 'Gần đây', icon: 'fa-clock-rotate-left', rooms: [] },
        older: { k: 'older', title: 'Lâu rồi chưa vào', icon: 'fa-box-archive', rooms: [] },
    };
    list.forEach((r) => {
        const s = statusOf(r);
        if (s.isLive) g.live.rooms.push(r);
        else if (upcoming(r)) g.soon.rooms.push(r);
        else if (isPinned(r.id) || now - s.lastActive < 14 * DAY_MS) g.recent.rooms.push(r);
        else g.older.rooms.push(r);
    });
    g.soon.rooms.sort((a, b) => schedOf(a) - schedOf(b));
    return [g.live, g.soon, g.recent, g.older];
}

const secHtml = (g, closed) => `
    <button type="button" class="rh-sec ${closed ? 'is-closed' : ''}" data-sec="${g.k}" aria-expanded="${!closed}">
        <span class="rh-sec-ic"><i class="fas ${g.icon}"></i></span>${g.title}<span class="rh-n">${g.rooms.length}</span>
        <i class="fas fa-chevron-down rh-sec-chev"></i>
    </button>`;

function renderFilters() {
    const all = [...state.rooms.values()];
    const n = {
        all: all.length,
        live: all.filter(r => statusOf(r).isLive).length,
        mine: all.filter(r => r.role === 'owner').length,
        guest: all.filter(r => r.role === 'guest').length,
        pin: all.filter(r => isPinned(r.id)).length,
    };
    const defs = [
        ['all', 'Tất cả', 'fa-layer-group'],
        ['live', 'Đang có người', 'fa-tower-broadcast'],
        ['mine', 'Tôi tạo', 'fa-crown'],
        ['guest', 'Đã vào', 'fa-user-group'],
        ['pin', 'Ghim', 'fa-thumbtack'],
    ];
    const dayChip = state.day
        ? `<button type="button" class="rh-chip is-on is-day" data-f="day-off" title="Bỏ lọc theo ngày"><i class="fas fa-calendar-day"></i>${state.day.slice(8)}/${state.day.slice(5, 7)}<i class="fas fa-xmark"></i></button>` : '';
    el('rh-filters').innerHTML = dayChip + defs.map(([k, label, icon]) => `
        <button type="button" class="rh-chip ${state.filter === k ? 'is-on' : ''}" data-f="${k}">
            <i class="fas ${icon}"></i>${label}<span class="rh-n">${n[k]}</span>
        </button>`).join('');
}

/** Dòng tóm tắt dưới tiêu đề: bao nhiêu phòng · bao nhiêu bạn đang học · bao nhiêu buổi sắp tới. */
function renderSummary() {
    const box = el('rh-sum');
    if (!box) return;
    const rooms = [...state.rooms.values()];
    if (state.loading && !rooms.length) return void (box.innerHTML = '<span class="rh-sumchip">Đang tải phòng…</span>');
    if (!rooms.length) return void (box.innerHTML = `<span class="rh-sumchip">${state.user ? 'Chưa có phòng nào' : 'Đăng nhập để tạo và giữ phòng của bạn'}</span>`);
    const lives = rooms.filter(r => statusOf(r).isLive);
    const people = lives.reduce((a, r) => a + statusOf(r).online.length, 0);
    const soon = rooms.filter(upcoming).length;
    box.innerHTML = [
        `<span class="rh-sumchip"><i class="fas fa-door-open"></i>${rooms.length} phòng</span>`,
        people ? `<span class="rh-sumchip is-live"><span class="rh-dot"></span>${people} bạn đang học · ${lives.length} phòng</span>` : '',
        soon ? `<span class="rh-sumchip is-soon"><i class="fas fa-calendar-day"></i>${soon} buổi sắp tới</span>` : '',
    ].join('');
}

function faceHtml(m) {
    if (m.emoji) return `<span class="rh-face">${esc(m.emoji)}</span>`;
    if (m.photoURL) return `<img class="rh-face" src="${esc(m.photoURL)}" alt="">`;
    return `<span class="rh-face">${esc((m.displayName || 'K').trim().charAt(0).toUpperCase())}</span>`;
}

/** Sticker emoji dán lên giấy (viền trắng bế); đang có phiên chạy thì có vòng tiến độ ôm quanh. */
function stickerHtml(r, s) {
    const ring = s.running && s.isLive
        ? `<svg class="rh-ring" viewBox="0 0 44 44" aria-hidden="true"><rect class="rh-ring-bg" x="2" y="2" width="40" height="40" rx="14"/><rect class="rh-ring-fg" x="2" y="2" width="40" height="40" rx="14" pathLength="100" stroke-dasharray="${s.pct} 100"/></svg>` : '';
    return `<div class="rh-sticker">${ring}<span class="rh-sticker-em">${esc(r.data.emoji || '📚')}</span></div>`;
}

/** Ai đang ngồi trong phòng: tên + đang ở câu mấy (không có ghế trống — chỉ người thật). */
function seatsHtml(s) {
    if (!s.online.length) return '';
    const list = s.online.slice().sort((a, b) => (Number(b.cursor) || 0) - (Number(a.cursor) || 0));
    const chips = list.slice(0, 3).map(m => `
        <span class="rh-seat">${faceHtml(m)}<b>${esc(firstName(m.displayName))}</b>${s.running ? `<i>câu ${Math.min((Number(m.cursor) || 0) + 1, s.sess.qCount)}</i>` : ''}</span>`).join('');
    return `<div class="rh-seats">${chips}${list.length > 3 ? `<span class="rh-seat more">+${list.length - 3}</span>` : ''}</div>`;
}

/** Dòng mô tả + (nếu có) thanh tiến độ phẳng — dùng chung thẻ và hero. */
function infoOf(r, s, k) {
    const title = esc(s.sess?.title || 'bộ đề');
    if (k.k === 'live') return { text: `<b>câu ${s.step}/${s.sess.qCount}</b> · ${title}`, prog: `<div class="rh-prog"><i style="width:${s.pct}%"></i></div>` };
    if (k.k === 'lobby') return { text: `${s.online.length} bạn đang ở trong phòng · chưa bắt đầu đề` };
    if (k.k === 'soon') return { text: 'Đã hẹn giờ buổi học' + (s.sess?.ended ? ` · lần trước: ${title}` : '') };
    if (k.k === 'paused') return { text: `Phiên "${title}" đang bỏ dở · ${s.sess.qCount} câu` };
    if (k.k === 'done') return { text: `Buổi gần nhất: <b>${title}</b>${s.sess.qCount ? ` · ${s.sess.qCount} câu` : ''}` };
    return { text: 'Chưa có buổi nào — vào phòng để bắt đầu' };
}

/** Cuống vé hẹn giờ (có đường xé) / con dấu điểm trung bình buổi gần nhất. */
function sideHtml(r, s, k) {
    const sched = schedOf(r);
    if (sched && upcoming(r)) {
        const p = stubParts(sched);
        const d = new Date(sched);
        return `<div class="rh-stub ${p.urgent ? 'is-urgent' : ''}">
            <div class="rh-stub-n"><b>${p.big}</b><small>${p.small}</small></div>
            <div class="rh-stub-d"><span>${WEEKDAY[d.getDay()]} · ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}</span><b>${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</b></div>
        </div>`;
    }
    if (s.sess?.ended) {
        const avg = typeof s.sess.avg === 'number' ? s.sess.avg : null;
        return `<div class="rh-stamp" title="Điểm trung bình của cả phòng ở buổi gần nhất">
            <b>${avg === null ? '<i class="fas fa-check"></i>' : avg + '%'}</b><small>${avg === null ? 'đã xong' : 'TB'}${s.sess.people ? ` · ${s.sess.people} bạn` : ''}</small></div>`;
    }
    return '';
}

function cardHtml(r) {
    const s = statusOf(r), k = kindOf(r, s), info = infoOf(r, s, k);
    const pinned = isPinned(r.id), owner = r.role === 'owner';
    const fresh = (state.flash.get(r.id) || 0) > Date.now();
    const sched = schedOf(r);
    const side = sideHtml(r, s, k);
    const metaBits = [
        s.lastActive ? `<span><i class="far fa-clock"></i>${timeAgo(s.lastActive)}</span>` : '',
        s.members.length ? `<span><i class="fas fa-user-group"></i>${s.members.length} thành viên</span>` : '',
    ].filter(Boolean).join('');

    return `
    <article class="rh-card rh-t${themeOf(r)} is-${k.k} ${fresh ? 'is-fresh' : ''}" data-id="${esc(r.id)}">
        <div class="rh-head">
            ${stickerHtml(r, s)}
            <div class="rh-name">
                <h3 title="${esc(nameOf(r))}">${esc(nameOf(r))}</h3>
                <div class="rh-sub2">
                    <button type="button" class="rh-code" data-act="copy" title="Chép mã phòng"><span>${esc(r.id)}</span><i class="far fa-copy"></i></button>
                    ${owner ? '<i class="fas fa-crown rh-crown" title="Bạn là chủ phòng"></i>' : '<span class="rh-tag guest">đã vào</span>'}
                </div>
            </div>
            <div class="rh-acts">
                <button type="button" class="rh-star ${pinned ? 'is-on' : ''}" data-act="pin" title="${pinned ? 'Bỏ ghim' : 'Ghim lên đầu'}"><i class="${pinned ? 'fas' : 'far'} fa-star"></i></button>
                <button type="button" class="rh-star" data-act="menu" title="Tùy chọn"><i class="fas fa-ellipsis-vertical"></i></button>
            </div>
        </div>
        <div class="rh-body">
            <div class="rh-state"><span class="rh-badge is-${k.k}">${k.k === 'live' || k.k === 'lobby' ? '<span class="rh-dot"></span>' : `<i class="fas ${k.icon}"></i>`}${k.label}</span></div>
            <p class="rh-info">${info.text}</p>
            ${info.prog || ''}
            ${seatsHtml(s)}
        </div>
        ${side}
        ${metaBits ? `<div class="rh-meta">${metaBits}</div>` : ''}
        <div class="rh-foot">
            <a class="rh-go" href="${esc(linkOf(r.id))}"><i class="fas fa-door-open"></i> ${s.isLive ? 'Vào cùng' : 'Vào phòng'}</a>
            <button type="button" class="rh-mini" data-act="invite" title="Mời bạn bè / mã QR"><i class="fas fa-user-plus"></i></button>
            ${owner && !(sched && upcoming(r)) ? '<button type="button" class="rh-mini" data-act="sched" title="Hẹn giờ buổi học"><i class="far fa-calendar-plus"></i></button>' : ''}
        </div>
    </article>`;
}

/** Hero "Hôm nay": MỘT phòng đáng vào nhất ngay lúc này — đang diễn ra > sắp tới > gần nhất. */
function renderToday() {
    const box = el('rh-today');
    if (!box) return;
    const rooms = [...state.rooms.values()];
    if (!rooms.length) return void (box.innerHTML = '');

    const pairs = rooms.map(r => [r, statusOf(r)]);
    const live = pairs.filter(([, s]) => s.isLive).sort((a, b) => (Number(b[1].running) - Number(a[1].running)) || (b[1].online.length - a[1].online.length));
    const soon = pairs.filter(([r]) => upcoming(r)).sort((a, b) => schedOf(a[0]) - schedOf(b[0]));
    const last = pairs.slice().sort((a, b) => b[1].lastActive - a[1].lastActive);
    const kind = live.length ? 'live' : soon.length ? 'soon' : 'last';
    const [r, s] = (live[0] || soon[0] || last[0]);
    const k = kindOf(r, s), info = infoOf(r, s, k);
    const eyebrow = { live: 'Đang diễn ra', soon: 'Buổi sắp tới', last: 'Vào lại phòng gần nhất' }[kind];
    const more = kind === 'live' ? live.length - 1 : 0;
    const side = sideHtml(r, s, k);
    const cta = kind === 'live' ? 'Vào cùng' : kind === 'soon' ? 'Mở phòng' : 'Vào lại';

    box.innerHTML = `
    <article class="rh-today rh-t${themeOf(r)} is-${kind === 'last' ? k.k : kind}" data-id="${esc(r.id)}">
        <div class="rh-today-sticker">${stickerHtml(r, s)}</div>
        <div class="rh-today-body">
            <span class="rh-eyebrow ${kind === 'live' ? 'is-live' : ''}">${kind === 'live' ? '<span class="rh-dot"></span>' : `<i class="fas ${kind === 'soon' ? 'fa-calendar-day' : 'fa-clock-rotate-left'}"></i>`}${eyebrow}</span>
            <h3>${esc(nameOf(r))}</h3>
            <p class="rh-info">${info.text}</p>
            ${info.prog || ''}
            ${seatsHtml(s)}
        </div>
        ${side ? `<div class="rh-today-side">${side}</div>` : ''}
        <div class="rh-today-cta">
            <a class="rh-go rh-go-big" href="${esc(linkOf(r.id))}"><i class="fas fa-door-open"></i> ${cta}</a>
            ${more > 0 ? `<button type="button" class="rh-linkbtn" data-act="show-live">+${more} phòng khác đang có người</button>` : ''}
            ${kind === 'soon' && r.role === 'owner' ? '<button type="button" class="rh-linkbtn" data-act="invite"><i class="fas fa-user-plus"></i> Mời bạn bè</button>' : ''}
        </div>
    </article>`;
}

/** Dải lịch 7 ngày: chỉ hiện khi có buổi hẹn trong tuần; bấm một ngày để lọc phòng hẹn ngày đó. */
function renderWeek() {
    const box = el('rh-week');
    if (!box) return;
    const byDay = new Map();
    [...state.rooms.values()].filter(upcoming).forEach((r) => {
        const k = dayKey(new Date(schedOf(r)));
        if (!byDay.has(k)) byDay.set(k, []);
        byDay.get(k).push(r);
    });
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
    if (!days.some(d => byDay.has(dayKey(d)))) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML = `<div class="rh-week-ttl"><i class="fas fa-calendar-week"></i> Lịch 7 ngày tới</div>
        <div class="rh-days">${days.map((d, i) => {
        const k = dayKey(d), rs = byDay.get(k) || [];
        return `<button type="button" class="rh-day ${i === 0 ? 'is-today' : ''} ${rs.length ? 'has' : ''} ${state.day === k ? 'is-on' : ''}" data-day="${k}" ${rs.length ? '' : 'disabled'}
            title="${rs.length ? rs.map(nameOf).join(', ') : 'Chưa có buổi hẹn'}">
            <small>${i === 0 ? 'Nay' : WEEKDAY[d.getDay()]}</small><b>${d.getDate()}</b>
            <span class="rh-day-em">${rs.slice(0, 2).map(r => esc(r.data.emoji || '📚')).join('')}${rs.length > 2 ? `<em>+${rs.length - 2}</em>` : ''}</span>
        </button>`;
    }).join('')}</div>`;
}

/** Ô tìm cũng là ô vào phòng: gõ/dán mã hoặc link mà không có phòng nào khớp → hiện dòng "Vào phòng …". */
function renderJoinRow(list) {
    const box = el('rh-join-row');
    if (!box) return;
    const raw = state.qRaw || '';
    const id = parseRoomId(raw);
    const looksCode = /^[a-zA-Z0-9_-]{2,40}$/.test(id) && (/[-_0-9]/.test(id) || /[?&]id=/.test(raw));
    if (!raw || !looksCode || exactRoom(raw) || (list.length && !/[?&]id=/.test(raw))) return void (box.innerHTML = '');
    box.innerHTML = `<button type="button" class="rh-joinrow" data-act="join-code" data-code="${esc(raw)}">
        <i class="fas fa-door-open"></i> Vào phòng <b>${esc(id)}</b> bằng mã này <kbd>Enter</kbd></button>`;
}

function ghostHtml() {
    return `<button type="button" class="rh-card rh-ghost" data-act="create">
        <span class="rh-ghost-plus"><i class="fas fa-plus"></i></span>
        <b>Phòng mới</b>
        <small>Đặt tên, gửi mã cho nhóm — phím tắt <kbd>N</kbd></small>
    </button>`;
}

function emptyHtml() {
    if (!state.user && !state.rooms.size) {
        return `<div class="rh-empty">
            <img src="assets/squirrel_group.png" alt="">
            <b>Đăng nhập để tạo và quản lý phòng học</b>
            <span>Chưa có tài khoản vẫn vào phòng bằng mã được — nhưng phòng bạn tạo thì cần đăng nhập để giữ lại.</span>
            <div style="display:flex;gap:.5rem;flex-wrap:wrap;justify-content:center">
                <button type="button" class="rh-btn rh-btn-main" data-act="login"><i class="fas fa-right-to-bracket"></i> Đăng nhập</button>
                <button type="button" class="rh-btn rh-btn-ghost" data-act="join"><i class="fas fa-key"></i> Vào bằng mã</button>
            </div></div>`;
    }
    if (state.q || state.filter !== 'all' || state.day) {
        return `<div class="rh-empty">
            <b>Không có phòng nào khớp</b>
            <span>Thử xoá từ khoá hoặc chọn lại bộ lọc "Tất cả".</span>
            <button type="button" class="rh-btn rh-btn-ghost" data-act="clear"><i class="fas fa-eraser"></i> Xoá bộ lọc</button></div>`;
    }
    return `<div class="rh-empty rh-onboard">
        <img src="assets/squirrel_group.png" alt="">
        <b>Bạn chưa có phòng học nào</b>
        <ol class="rh-steps">
            <li><i>1</i><span>Tạo phòng</span><small>đặt tên, chọn biểu tượng</small></li>
            <li><i>2</i><span>Gửi mã hoặc QR</span><small>bạn bè không cần tài khoản</small></li>
            <li><i>3</i><span>Cùng làm một bộ đề</span><small>thấy nhau chọn gì, bàn ngay tại chỗ</small></li>
        </ol>
        <button type="button" class="rh-btn rh-btn-main" data-act="create"><i class="fas fa-plus-circle"></i> Tạo phòng đầu tiên</button></div>`;
}

// ---------------- Báo "bạn X vừa vào phòng Y" ngay trên trang chủ ----------------
function announceJoins(id, before, after) {
    const r = state.rooms.get(id);
    if (!r || !state.open) return;
    const key = (m) => m.uid || m._id;
    const was = new Set(before.filter(isOnline).map(key));
    const fresh = after.filter(m => isOnline(m) && !was.has(key(m)) && key(m) !== state.user?.uid && Date.now() - (Number(m.lastSeen) || 0) < 20000);
    if (!fresh.length) return;
    state.flash.set(id, Date.now() + 4500);
    setTimeout(() => state.open && render(true), 4600);       // gỡ viền nháy
    el('rh-note')?.remove();
    const box = document.createElement('div');
    box.id = 'rh-note';
    box.className = `rh-note rh-t${themeOf(r)}`;
    box.innerHTML = `${faceHtml(fresh[0])}
        <span class="rh-note-t"><b>${esc(firstName(fresh[0].displayName))}</b>${fresh.length > 1 ? ` và ${fresh.length - 1} bạn nữa` : ''} vừa vào <b>${esc(nameOf(r))}</b></span>
        <a class="rh-go" href="${esc(linkOf(r.id))}">Vào cùng</a>
        <button type="button" class="rh-note-x" aria-label="Đóng"><i class="fas fa-times"></i></button>`;
    document.body.appendChild(box);
    box.querySelector('.rh-note-x').onclick = () => box.remove();
    setTimeout(() => box.remove(), 8000);
}

// ---------------- Tương tác trên lưới ----------------
function onGridClick(e) {
    const sec = e.target.closest('[data-sec]');
    if (sec) {
        state.collapsed = { ...state.collapsed, [sec.dataset.sec]: !state.collapsed[sec.dataset.sec] };
        savePrefs();
        return void render(true);
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    const card = e.target.closest('[data-id]');
    const r = card ? state.rooms.get(card.dataset.id) : null;

    if (act === 'retry') return void reload();
    if (act === 'clear') { state.q = ''; state.qRaw = ''; state.filter = 'all'; state.day = null; el('rh-q').value = ''; savePrefs(); return void render(true); }
    if (act === 'create') return void openCreateModal();
    if (act === 'join') return void openJoinModal();
    if (act === 'login') return void window.toggleAuthModal?.();
    if (act === 'show-live') { state.filter = 'live'; savePrefs(); return void render(true); }
    if (act === 'join-code') {
        return void joinRoom(e.target.closest('[data-code]').dataset.code, { bad: (m) => showToast(m, 'warning') });
    }

    if (!r) return;
    if (act === 'pin') return void togglePin(r.id);
    if (act === 'invite') return void openInviteModal(r);
    if (act === 'sched') return void openScheduleModal(r);
    if (act === 'menu') return void openMenu(r, e.target.closest('[data-act]'));
    if (act === 'copy') {
        const b = e.target.closest('[data-act="copy"]');
        copyText(r.id, 'Đã chép mã phòng!');
        b.classList.add('is-copied');
        b.querySelector('i').className = 'fas fa-check';
        return void setTimeout(() => { b.classList.remove('is-copied'); b.querySelector('i').className = 'far fa-copy'; }, 1400);
    }
    if (!e.target.closest('a, button')) location.href = linkOf(r.id);
}

function openMenu(r, anchor) {
    closeMenu();
    const owner = r.role === 'owner';
    const box = document.createElement('div');
    box.className = 'rh-menu';
    box.id = 'rh-menu';
    box.innerHTML = `
        <button type="button" data-m="edit"><i class="fas fa-palette"></i> Đổi tên, emoji &amp; màu</button>
        <button type="button" data-m="sched"><i class="fas fa-calendar-plus"></i> ${r.data.scheduledAt ? 'Sửa giờ hẹn' : 'Hẹn giờ buổi học'}</button>
        <button type="button" data-m="invite"><i class="fas fa-qrcode"></i> Mời bạn bè / mã QR</button>
        <button type="button" data-m="copy"><i class="far fa-copy"></i> Chép mã phòng</button>
        <button type="button" data-m="new-tab"><i class="fas fa-arrow-up-right-from-square"></i> Mở ở tab mới</button>
        <hr>
        <button type="button" class="danger" data-m="${owner ? 'delete' : 'forget'}">
            <i class="fas ${owner ? 'fa-trash-alt' : 'fa-eye-slash'}"></i> ${owner ? 'Xoá phòng' : 'Gỡ khỏi danh sách'}</button>`;
    document.body.appendChild(box);

    const rect = anchor.getBoundingClientRect();
    box.style.top = Math.min(rect.bottom + 6, window.innerHeight - box.offsetHeight - 10) + 'px';
    box.style.left = Math.max(10, Math.min(rect.right - box.offsetWidth, window.innerWidth - box.offsetWidth - 10)) + 'px';

    box.addEventListener('click', async (e) => {
        const m = e.target.closest('[data-m]')?.dataset.m;
        if (!m) return;
        closeMenu();
        if (m === 'edit') openEditModal(r);
        if (m === 'sched') openScheduleModal(r);
        if (m === 'invite') openInviteModal(r);
        if (m === 'copy') copyText(r.id, 'Đã chép mã phòng!');
        if (m === 'new-tab') window.open(linkOf(r.id), '_blank', 'noopener');
        if (m === 'forget') { forgetRecent(r.id); dropRoom(r.id); render(true); showToast('Đã gỡ khỏi danh sách.', 'info'); }
        if (m === 'delete') deleteRoom(r);
    });
    setTimeout(() => document.addEventListener('click', closeMenu, { once: true }), 0);
}
const closeMenu = () => el('rh-menu')?.remove();

async function deleteRoom(r) {
    const ok = await showConfirm(`Xoá phòng "${nameOf(r)}"? Toàn bộ dữ liệu trong phòng sẽ mất và không khôi phục được.`,
        { confirmText: 'Xoá phòng', tone: 'danger', title: 'Xoá phòng học' });
    if (!ok) return;
    try {
        // Dọn các subcollection hay có dữ liệu; phần còn lại Firestore để lại cũng vô hại
        for (const sub of ['drawings', 'members', 'quizSession']) {
            const snap = await getDocs(collection(db, 'study_rooms', r.id, sub));
            await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
        }
        await deleteDoc(doc(db, 'study_rooms', r.id));
        forgetRecent(r.id);
        dropRoom(r.id);
        render(true);
        showToast('Đã xoá phòng học.', 'success');
    } catch (e) {
        showToast('Xoá phòng thất bại: ' + e.message, 'error');
    }
}

// ---------------- Lớp nổi dùng chung ----------------
function modal(html, onReady, onClose) {
    const wrap = document.createElement('div');
    wrap.className = 'rh-modal';
    wrap.innerHTML = `<div class="rh-sheet"><button type="button" class="rh-x" data-close><i class="fas fa-times"></i></button>${html}</div>`;
    document.body.appendChild(wrap);
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); onClose?.(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
    onReady?.(wrap, close);
    return close;
}

const copyText = (text, msg) => navigator.clipboard.writeText(text)
    .then(() => showToast(msg, 'success'))
    .catch(() => showToast('Không chép được, copy thủ công: ' + text, 'warning'));

const pickerHtml = (emoji, theme) => `
    <label class="rh-label">Biểu tượng</label>
    <div class="rh-picks" data-picks="emoji">
        ${EMOJIS.map(e => `<button type="button" class="rh-pick ${e === emoji ? 'is-on' : ''}" data-v="${e}">${e}</button>`).join('')}
    </div>
    <label class="rh-label">Màu phòng</label>
    <div class="rh-picks" data-picks="theme">
        ${[0, 1, 2, 3, 4, 5].map(i => `<button type="button" class="rh-pick rh-swatch rh-t${i} ${i === theme ? 'is-on' : ''}" data-v="${i}"></button>`).join('')}
    </div>`;

function wirePickers(wrap, out) {
    wrap.querySelectorAll('[data-picks]').forEach(group => {
        group.addEventListener('click', (e) => {
            const b = e.target.closest('.rh-pick');
            if (!b) return;
            group.querySelectorAll('.rh-pick').forEach(x => x.classList.remove('is-on'));
            b.classList.add('is-on');
            out[group.dataset.picks] = group.dataset.picks === 'theme' ? Number(b.dataset.v) : b.dataset.v;
        });
    });
}

// ---------------- Tạo phòng ----------------
const WORDS = ['hong', 'soc', 'deo', 'mint', 'tim', 'nang', 'mua', 'sao', 'bien', 'gio'];
const suggestCode = () => `${WORDS[Math.floor(Math.random() * WORDS.length)]}-${Math.floor(100 + Math.random() * 900)}`;

// opts (pickRoom dùng): name = tên gợi ý sẵn · onCreated(id) thay cho việc chuyển trang · onCancel()
function openCreateModal(opts = {}) {
    if (!state.user) {
        showToast('Đăng nhập để tạo phòng nhé!', 'warning');
        window.toggleAuthModal?.();
        return opts.onCancel?.();
    }
    const pre = opts.preset || {};
    const pick = {
        emoji: pre.emoji || EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
        theme: typeof pre.theme === 'number' ? pre.theme : Math.floor(Math.random() * 6),
    };
    let created = false;
    modal(`
        <h3><i class="fas fa-plus-circle" style="color:#ff69b4"></i> Tạo phòng học mới</h3>
        <p class="rh-sub">Đặt tên cho dễ nhớ, mã phòng là thứ bạn gửi cho nhóm.</p>
        <div class="rh-presets" id="rh-c-presets">
            ${PRESETS.map((p, i) => `<button type="button" class="rh-qchip" data-preset="${i}"><span>${p.emoji}</span>${esc(p.label)}</button>`).join('')}
        </div>
        <label class="rh-label" for="rh-c-name">Tên phòng</label>
        <input id="rh-c-name" class="rh-input" placeholder="VD: Ôn Sinh lý tuần 3" maxlength="60">
        <label class="rh-label" for="rh-c-code">Mã phòng (chỉ chữ, số, - và _)</label>
        <div style="display:flex;gap:.4rem">
            <input id="rh-c-code" class="rh-input" placeholder="vd: sinhly-203" maxlength="40">
            <button type="button" class="rh-btn rh-btn-ghost" id="rh-c-dice" title="Gợi ý mã khác"><i class="fas fa-dice"></i></button>
        </div>
        <p class="rh-hint" id="rh-c-hint">Mã này sẽ nằm trong link mời.</p>
        ${pickerHtml(pick.emoji, pick.theme)}
        <label class="rh-label" for="rh-c-when">Hẹn giờ (không bắt buộc)</label>
        <input id="rh-c-when" type="datetime-local" class="rh-input">
        <div class="rh-row">
            <button type="button" class="rh-btn rh-btn-ghost" data-close>Huỷ</button>
            <button type="button" class="rh-btn rh-btn-main" id="rh-c-go"><i class="fas fa-door-open"></i> Tạo &amp; vào phòng</button>
        </div>`, (wrap, close) => {
        const name = wrap.querySelector('#rh-c-name');
        const code = wrap.querySelector('#rh-c-code');
        const hint = wrap.querySelector('#rh-c-hint');
        code.value = suggestCode();
        wirePickers(wrap, pick);
        name.focus();
        const preName = opts.name || pre.name;
        if (preName) { name.value = String(preName).slice(0, 60); setTimeout(() => name.dispatchEvent(new Event('input'))); }
        if (pre.when) {
            const d = new Date(pre.when() - new Date().getTimezoneOffset() * 60000);
            wrap.querySelector('#rh-c-when').value = d.toISOString().slice(0, 16);
        }
        wrap.querySelector('#rh-c-dice').onclick = () => { code.value = suggestCode(); code.classList.remove('bad'); };
        // Chạm một mẫu → điền tên + biểu tượng + màu (+ giờ hẹn) một lượt
        wrap.querySelector('#rh-c-presets').addEventListener('click', (e) => {
            const b = e.target.closest('[data-preset]');
            if (!b) return;
            const p = PRESETS[Number(b.dataset.preset)];
            name.value = p.name;
            name.dispatchEvent(new Event('input'));
            wrap.querySelector(`[data-picks="emoji"] [data-v="${p.emoji}"]`)?.click();
            wrap.querySelector(`[data-picks="theme"] [data-v="${p.theme}"]`)?.click();
            wrap.querySelector('#rh-c-when').value = p.when
                ? new Date(p.when() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
        });
        // Gõ tên -> gợi ý mã theo tên (chỉ khi người dùng chưa tự sửa mã)
        let codeTouched = false;
        code.addEventListener('input', () => { codeTouched = true; code.classList.remove('bad'); });
        name.addEventListener('input', () => {
            if (codeTouched) return;
            const slug = name.value.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd')
                .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 22);
            if (slug) code.value = `${slug}-${String(Date.now()).slice(-3)}`;
        });

        wrap.querySelector('#rh-c-go').onclick = async (e) => {
            const btn = e.currentTarget;
            const id = code.value.trim();
            if (!/^[a-zA-Z0-9_-]{2,40}$/.test(id)) {
                code.classList.add('bad');
                hint.className = 'rh-hint bad';
                hint.textContent = 'Mã chỉ gồm chữ không dấu, số, dấu - hoặc _ (2–40 ký tự).';
                return;
            }
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tạo…';
            try {
                if ((await getDoc(doc(db, 'study_rooms', id))).exists()) {
                    code.classList.add('bad');
                    hint.className = 'rh-hint bad';
                    hint.textContent = 'Mã này có người dùng rồi — thử mã khác nhé.';
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-door-open"></i> Tạo & vào phòng';
                    return;
                }
                const when = wrap.querySelector('#rh-c-when').value;
                await setDoc(doc(db, 'study_rooms', id), {
                    owner: state.user.uid,
                    createdAt: serverTimestamp(),
                    background: null,
                    title: name.value.trim() || id,
                    emoji: pick.emoji,
                    theme: pick.theme,
                    ...(when ? { scheduledAt: new Date(when).getTime() } : {}),
                });
                rememberRoomVisit(id);
                created = true;
                close();
                if (opts.onCreated) return void opts.onCreated(id);
                location.href = linkOf(id);
            } catch (err) {
                showToast('Không tạo được phòng: ' + err.message, 'error');
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-door-open"></i> Tạo & vào phòng';
            }
        };
    }, () => { if (!created) opts.onCancel?.(); });
}

// ---------------- Chọn phòng để mở đề (quiz.html "Làm cùng nhau") ----------------
// Phòng mình làm chủ (chỉ chủ phòng mới mở đề cho cả phòng được) hoặc tạo phòng mới với mã tự đặt
// (dùng lại hộp Tạo phòng ở trên). choices = [{ v, label, on? }] -> một hàng chip chọn cách mở đề.
// Trả Promise<{ id, choice } | null>. Trang ngoài trang chủ phải tự nạp rooms-hub.css.
export function pickRoom({ user, name = '', choices = [] }) {
    state.user = state.user || user;
    let choice = (choices.find(c => c.on) || choices[0])?.v;
    return new Promise((resolve) => {
        let next = null;             // đóng hộp này để mở hộp Tạo phòng -> chưa trả kết quả
        modal(`
            <h3><i class="fas fa-users" style="color:#ff69b4"></i> Làm cùng nhau</h3>
            <p class="rh-sub">Mở đề ở phòng có sẵn của bạn, hoặc tạo phòng mới với mã tự đặt.</p>
            ${choices.length > 1 ? `<div class="rh-picks" data-choice>${choices.map(c => `<button type="button" class="rh-chip ${c.v === choice ? 'is-on' : ''}" data-v="${esc(c.v)}">${esc(c.label)}</button>`).join('')}</div>` : ''}
            <label class="rh-label">Phòng của bạn</label>
            <div class="rh-plist" id="rh-p-list"><p class="rh-hint">Đang tải phòng của bạn…</p></div>
            <div class="rh-row">
                <button type="button" class="rh-btn rh-btn-ghost" data-close>Huỷ</button>
                <button type="button" class="rh-btn rh-btn-main" id="rh-p-new"><i class="fas fa-plus"></i> Tạo phòng mới</button>
            </div>`, (wrap, close) => {
            wrap.querySelector('[data-choice]')?.addEventListener('click', (e) => {
                const b = e.target.closest('[data-v]');
                if (!b) return;
                choice = b.dataset.v;
                wrap.querySelectorAll('[data-choice] .rh-chip').forEach(x => x.classList.toggle('is-on', x === b));
            });
            wrap.querySelector('#rh-p-new').onclick = () => {
                next = () => openCreateModal({ name, onCreated: (id) => resolve({ id, choice }), onCancel: () => resolve(null) });
                close();
            };
            wrap.querySelector('#rh-p-list').addEventListener('click', (e) => {
                const b = e.target.closest('[data-room]');
                if (!b) return;
                rememberRoomVisit(b.dataset.room);
                next = () => resolve({ id: b.dataset.room, choice });
                close();
            });
            getDocs(query(collection(db, 'study_rooms'), where('owner', '==', state.user.uid))).then((snap) => {
                const act = (d) => Math.max(d.live?.startedAt || 0, d.live?.endedAt || 0, d.createdAt?.toMillis?.() || 0);
                const rows = snap.docs.map(d => ({ id: d.id, data: d.data() || {} })).sort((a, b) => act(b.data) - act(a.data));
                wrap.querySelector('#rh-p-list').innerHTML = rows.length ? rows.map(r => {
                    const busy = r.data.live?.qCount && !r.data.live.ended;
                    return `<button type="button" class="rh-proom rh-t${themeOf(r)}" data-room="${esc(r.id)}">
                        <span class="rh-proom-ic">${esc(r.data.emoji || '📚')}</span>
                        <span class="rh-proom-txt"><b>${esc(nameOf(r))}</b><small>${esc(r.id)}${busy ? ` · đang làm "${esc(r.data.live.title || 'đề')}" — sẽ hỏi trước khi thay` : ''}</small></span>
                        <i class="fas fa-arrow-right"></i></button>`;
                }).join('') : '<p class="rh-hint">Bạn chưa có phòng nào — bấm <b>Tạo phòng mới</b>.</p>';
            }).catch(() => { wrap.querySelector('#rh-p-list').innerHTML = '<p class="rh-hint bad">Không tải được danh sách phòng — vẫn tạo phòng mới được.</p>'; });
        }, () => (next ? next() : resolve(null)));
    });
}

// ---------------- Vào bằng mã ----------------
/** Tách mã từ link/mã dán vào, kiểm tra phòng có thật rồi chuyển trang. ui = { bad(msg), busy(), done() }. */
async function joinRoom(raw, ui = {}) {
    const id = parseRoomId(raw);
    if (!id) { ui.bad?.('Nhập mã phòng đã nhé.'); return false; }
    ui.busy?.();
    let real = id;
    try { real = decodeURIComponent(id); } catch (e) { /* mã có % lạ: giữ nguyên */ }
    try {
        const snap = await getDoc(doc(db, 'study_rooms', real));
        if (!snap.exists()) { ui.bad?.('Không tìm thấy phòng này — kiểm tra lại mã giúp mình.'); return false; }
    } catch (e) { /* mất mạng thì cứ cho vào, trang phòng sẽ báo tiếp */ }
    rememberRoomVisit(real);
    ui.done?.();
    location.href = linkOf(real);
    return true;
}


function openJoinModal() {
    const last = recents().slice(0, 6);
    modal(`
        <h3><i class="fas fa-key" style="color:#ff69b4"></i> Vào phòng bằng mã</h3>
        <p class="rh-sub">Dán mã phòng <b>hoặc cả đường link</b> bạn bè gửi — mình tự tách mã ra.</p>
        <input id="rh-j-code" class="rh-input" placeholder="vd: sinhly-203 hoặc https://…?id=sinhly-203" autocomplete="off">
        <p class="rh-hint" id="rh-j-hint">Không cần đăng nhập vẫn vào được (sẽ hỏi tên khi vào phòng).</p>
        ${last.length ? `<label class="rh-label">Vào lại phòng gần đây</label>
            <div class="rh-picks" style="gap:.3rem">
                ${last.map(x => `<button type="button" class="rh-chip" data-code="${esc(x.id)}"><i class="fas fa-clock-rotate-left"></i>${esc(x.id)}</button>`).join('')}
            </div>` : ''}
        <div class="rh-row">
            <button type="button" class="rh-btn rh-btn-ghost" data-close>Huỷ</button>
            <button type="button" class="rh-btn rh-btn-main" id="rh-j-go"><i class="fas fa-door-open"></i> Vào phòng</button>
        </div>`, (wrap, close) => {
        const input = wrap.querySelector('#rh-j-code');
        const hint = wrap.querySelector('#rh-j-hint');
        input.focus();
        wrap.querySelectorAll('[data-code]').forEach(b => b.onclick = () => { input.value = b.dataset.code; go(); });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });

        function go() {
            joinRoom(input.value, {
                bad: (m) => { input.classList.add('bad'); hint.className = 'rh-hint bad'; hint.textContent = m; },
                busy: () => { hint.className = 'rh-hint'; hint.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tìm phòng…'; },
                done: close,
            });
        }
        wrap.querySelector('#rh-j-go').onclick = go;
    });
}

// ---------------- Mời bạn bè ----------------
function openInviteModal(r) {
    const url = linkOf(r.id);
    const sched = Number(r.data.scheduledAt) || 0;
    const invite = `Vào phòng học "${nameOf(r)}" với mình nhé!\n`
        + (sched ? `⏰ ${whenText(sched)}\n` : '')
        + `Mã phòng: ${r.id}\n${url}`;
    modal(`
        <h3><i class="fas fa-user-plus" style="color:#ff69b4"></i> Mời vào "${esc(nameOf(r))}"</h3>
        <p class="rh-sub">Quét mã QR, hoặc gửi link cho nhóm — người nhận không cần tài khoản.</p>
        <div class="rh-qr" id="rh-qr"><i class="fas fa-spinner fa-spin" style="color:#c9c2d1"></i></div>
        <div class="rh-link"><span>${esc(url)}</span>
            <button type="button" class="rh-mini" data-i="link" title="Chép link"><i class="far fa-copy"></i></button></div>
        <div class="rh-row" style="margin-top:.6rem">
            <button type="button" class="rh-btn rh-btn-ghost" data-i="text"><i class="fas fa-comment-dots"></i> Chép lời mời</button>
            <button type="button" class="rh-btn rh-btn-main" data-i="share"><i class="fas fa-share-nodes"></i> Chia sẻ</button>
        </div>
        ${sched ? `<div class="rh-row" style="margin-top:.5rem"><button type="button" class="rh-btn rh-btn-ghost" data-i="ics"><i class="far fa-calendar-plus"></i> Thêm vào lịch (.ics)</button></div>` : ''}
    `, (wrap) => {
        paintQr(wrap.querySelector('#rh-qr'), url);
        wrap.addEventListener('click', (e) => {
            const i = e.target.closest('[data-i]')?.dataset.i;
            if (i === 'link') copyText(url, 'Đã chép link phòng!');
            if (i === 'text') copyText(invite, 'Đã chép lời mời — dán vào nhóm chat thôi!');
            if (i === 'ics') downloadIcs(r);
            if (i === 'share') {
                if (navigator.share) navigator.share({ title: nameOf(r), text: invite, url }).catch(() => {});
                else copyText(invite, 'Máy không hỗ trợ chia sẻ nhanh — đã chép lời mời!');
            }
        });
    });
}

function loadQrLib() {
    if (window.QRCode) return Promise.resolve();
    if (window.__qrLoading) return window.__qrLoading;
    window.__qrLoading = new Promise((res, rej) => {
        const sc = document.createElement('script');
        sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
        sc.onload = res;
        sc.onerror = rej;
        document.head.appendChild(sc);
    });
    return window.__qrLoading;
}

async function paintQr(box, text) {
    if (!box) return;
    try {
        await loadQrLib();
        box.innerHTML = '';
        new window.QRCode(box, { text, width: 150, height: 150, colorDark: '#4a3b52', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M });
    } catch (e) {
        box.innerHTML = '<span style="font-size:.72rem;color:#8b8494;text-align:center;padding:.5rem">Mất mạng nên chưa tải được mã QR — dùng nút chép link nhé.</span>';
    }
}

// ---------------- Hẹn giờ buổi học ----------------
function openScheduleModal(r) {
    const cur = Number(r.data.scheduledAt) || 0;
    const local = (ms) => {
        const d = new Date(ms - new Date().getTimezoneOffset() * 60000);
        return d.toISOString().slice(0, 16);
    };
    modal(`
        <h3><i class="fas fa-calendar-day" style="color:#ff69b4"></i> Hẹn giờ buổi học</h3>
        <p class="rh-sub">Cả nhóm sẽ thấy đồng hồ đếm ngược ngay trên thẻ phòng.</p>
        <label class="rh-label" for="rh-s-when">Bắt đầu lúc</label>
        <input id="rh-s-when" type="datetime-local" class="rh-input" value="${cur ? local(cur) : local(Date.now() + 3600000)}">
        <p class="rh-hint">Mẹo: đặt xong bấm "Mời bạn bè" để gửi kèm giờ hẹn và file lịch .ics.</p>
        <div class="rh-row">
            ${cur ? '<button type="button" class="rh-btn rh-btn-ghost" data-s="off"><i class="fas fa-xmark"></i> Bỏ hẹn</button>' : ''}
            <button type="button" class="rh-btn rh-btn-main" data-s="save"><i class="fas fa-check"></i> Lưu</button>
        </div>`, (wrap, close) => {
        wrap.addEventListener('click', async (e) => {
            const s = e.target.closest('[data-s]')?.dataset.s;
            if (!s) return;
            const when = s === 'off' ? null : new Date(wrap.querySelector('#rh-s-when').value).getTime();
            if (s === 'save' && !when) return showToast('Chọn thời điểm đã nhé.', 'warning');
            try {
                await updateDoc(doc(db, 'study_rooms', r.id), { scheduledAt: when });
                r.data.scheduledAt = when;
                close();
                render(true);
                showToast(when ? 'Đã hẹn giờ buổi học!' : 'Đã bỏ giờ hẹn.', 'success');
            } catch (err) { showToast('Không lưu được: ' + err.message, 'error'); }
        });
    });
}

function downloadIcs(r) {
    const start = Number(r.data.scheduledAt) || 0;
    if (!start) return;
    const z = (t) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const clean = (s) => String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Zitthenkne//Phong hoc//VI', 'BEGIN:VEVENT',
        `UID:${r.id}-${start}@zitthenkne`, `DTSTAMP:${z(Date.now())}`, `DTSTART:${z(start)}`, `DTEND:${z(start + 3600000)}`,
        `SUMMARY:${clean('Học nhóm: ' + nameOf(r))}`, `DESCRIPTION:${clean('Vào phòng: ' + linkOf(r.id))}`,
        `URL:${linkOf(r.id)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = `phong-hoc-${r.id}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    showToast('Đã tải file lịch — mở lên để thêm vào Google/Apple Calendar.', 'success');
}

// ---------------- Đổi tên / emoji / màu ----------------
function openEditModal(r) {
    const pick = { emoji: r.data.emoji || '📚', theme: themeOf(r) };
    modal(`
        <h3><i class="fas fa-palette" style="color:#ff69b4"></i> Trang trí phòng</h3>
        <p class="rh-sub">Mã phòng <b>${esc(r.id)}</b> giữ nguyên (link đã gửi vẫn dùng được).</p>
        <label class="rh-label" for="rh-e-name">Tên phòng</label>
        <input id="rh-e-name" class="rh-input" maxlength="60" value="${esc(r.data.title || '')}" placeholder="${esc(r.id)}">
        ${pickerHtml(pick.emoji, pick.theme)}
        <div class="rh-row">
            <button type="button" class="rh-btn rh-btn-ghost" data-close>Huỷ</button>
            <button type="button" class="rh-btn rh-btn-main" id="rh-e-save"><i class="fas fa-check"></i> Lưu</button>
        </div>`, (wrap, close) => {
        wirePickers(wrap, pick);
        wrap.querySelector('#rh-e-save').onclick = async () => {
            const title = wrap.querySelector('#rh-e-name').value.trim() || r.id;
            try {
                await updateDoc(doc(db, 'study_rooms', r.id), { title, emoji: pick.emoji, theme: pick.theme });
                Object.assign(r.data, { title, emoji: pick.emoji, theme: pick.theme });
                close();
                render(true);
                showToast('Đã cập nhật phòng!', 'success');
            } catch (e) { showToast('Không lưu được: ' + e.message, 'error'); }
        };
    });
}
