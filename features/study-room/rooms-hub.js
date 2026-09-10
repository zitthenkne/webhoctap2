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
    q: '', filter: 'all', sort: 'active', view: 'grid',
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
}

function stopRoomListeners() {
    roomUnsubs.forEach(list => list.forEach(fn => { try { fn(); } catch (e) { /* đã gỡ */ } }));
    roomUnsubs.clear();
}

// ---------------- Khung ----------------
function mount() {
    const host = el('rooms-hub');
    if (!host || host.dataset.ready) return;
    host.dataset.ready = '1';
    host.innerHTML = `
        <section class="rh-hero">
            <div class="rh-hero-txt">
                <h2><i class="fas fa-chalkboard-user" style="color:#7cc0ff"></i> Phòng học của tôi</h2>
                <p>Tạo phòng, gửi mã cho bạn bè rồi cùng nhau cày đề trên một bảng 🐿️</p>
                <div id="rh-pulse" class="rh-pulse is-idle"><span class="rh-dot"></span> Đang xem…</div>
            </div>
            <div class="rh-hero-act">
                <button type="button" id="rh-join" class="rh-btn rh-btn-ghost"><i class="fas fa-key"></i> Vào bằng mã</button>
                <button type="button" id="rh-create" class="rh-btn rh-btn-main"><i class="fas fa-plus"></i> Tạo phòng mới</button>
            </div>
        </section>
        <div class="rh-bar">
            <label class="rh-search"><i class="fas fa-magnifying-glass"></i>
                <input type="search" id="rh-q" placeholder="Tìm phòng theo tên hoặc mã…  ( / )" autocomplete="off">
            </label>
            <div class="rh-chips" id="rh-filters"></div>
            <select id="rh-sort" class="rh-select" title="Sắp xếp">
                <option value="active">Hoạt động gần đây</option>
                <option value="new">Mới tạo nhất</option>
                <option value="name">Tên A → Z</option>
            </select>
            <button type="button" id="rh-view" class="rh-icon-btn" title="Đổi kiểu hiển thị"><i class="fas fa-table-cells-large"></i></button>
        </div>
        <div id="rh-grid" class="rh-grid"></div>`;

    el('rh-sort').value = state.sort;
    el('rh-q').addEventListener('input', (e) => { state.q = e.target.value.trim().toLowerCase(); render(true); });
    el('rh-q').addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const first = host.querySelector('.rh-card');
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
        state.filter = chip.dataset.f;
        savePrefs(); render(true);
    });
    el('rh-create').addEventListener('click', () => openCreateModal());
    el('rh-join').addEventListener('click', () => openJoinModal());
    el('rh-grid').addEventListener('click', onGridClick);

    document.addEventListener('keydown', (e) => {
        if (!state.open) return;
        if (e.key === '/' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName) && !document.activeElement?.isContentEditable) {
            e.preventDefault();
            el('rh-q')?.focus();
        }
    });
}

const savePrefs = () => writeLS('roomHubPrefs', { filter: state.filter, sort: state.sort, view: state.view });

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
            state.live.set(id, { members: snap.docs.map(d => d.data() || {}), at: Date.now() });
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

function countdown(ms) {
    const d = ms - Date.now();
    if (d <= 0) return d > -3600000 ? 'đang tới giờ' : '';
    const h = Math.floor(d / 3600000), m = Math.round((d % 3600000) / 60000);
    if (d > 86400000) return `còn ${Math.round(d / 86400000)} ngày`;
    return h ? `còn ${h}g${String(m).padStart(2, '0')}` : `còn ${m} phút`;
}

const whenText = (ms) => {
    const d = new Date(ms);
    return `${d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })} · ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
};

// ---------------- Vẽ ----------------
function render(force = false) {
    const host = el('rooms-hub');
    if (!host || !host.dataset.ready) return;
    const grid = el('rh-grid');

    const list = visibleRooms();
    // Chữ ký: chặn vẽ lại vô ích (nhịp tim 30s của mỗi thành viên đều bắn snapshot)
    const sig = JSON.stringify([state.loading, state.error, state.q, state.filter, state.sort, state.view, !!state.user,
        list.map(r => {
            const s = statusOf(r);
            return [r.id, nameOf(r), r.data.emoji, themeOf(r), r.data.scheduledAt, s.online.length, s.step, s.running,
                s.sess?.title, s.sess?.avg, isPinned(r.id)].join('|');
        })]);
    if (!force && sig === state.lastSig) return;
    state.lastSig = sig;

    grid.className = 'rh-grid' + (state.view === 'list' ? ' is-list' : '');
    el('rh-view').innerHTML = `<i class="fas ${state.view === 'list' ? 'fa-list' : 'fa-table-cells-large'}"></i>`;
    renderFilters();
    renderPulse();

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

    const owned = list.filter(r => r.role === 'owner');
    const guest = list.filter(r => r.role === 'guest');
    const both = owned.length && guest.length && state.filter === 'all';
    grid.innerHTML = [
        both ? '<div class="rh-sec">Phòng của tôi</div>' : '',
        owned.map(cardHtml).join(''),
        both ? '<div class="rh-sec">Phòng tôi đã vào</div>' : '',
        guest.map(cardHtml).join(''),
    ].join('');
}

function visibleRooms() {
    let list = [...state.rooms.values()];
    if (state.q) list = list.filter(r => (nameOf(r) + ' ' + r.id).toLowerCase().includes(state.q));
    if (state.filter === 'live') list = list.filter(r => statusOf(r).isLive);
    if (state.filter === 'mine') list = list.filter(r => r.role === 'owner');
    if (state.filter === 'guest') list = list.filter(r => r.role === 'guest');
    if (state.filter === 'pin') list = list.filter(r => isPinned(r.id));

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
    el('rh-filters').innerHTML = defs.map(([k, label, icon]) => `
        <button type="button" class="rh-chip ${state.filter === k ? 'is-on' : ''}" data-f="${k}">
            <i class="fas ${icon}"></i>${label}<span class="rh-n">${n[k]}</span>
        </button>`).join('');
}

function renderPulse() {
    const box = el('rh-pulse');
    if (!box) return;
    const rooms = [...state.rooms.values()];
    const liveRooms = rooms.filter(r => statusOf(r).isLive);
    const people = liveRooms.reduce((a, r) => a + statusOf(r).online.length, 0);
    const soon = rooms.filter(r => r.data.scheduledAt > Date.now()).sort((a, b) => a.data.scheduledAt - b.data.scheduledAt)[0];
    if (liveRooms.length) {
        box.className = 'rh-pulse';
        box.innerHTML = `<span class="rh-dot"></span> ${people} bạn đang học ở ${liveRooms.length} phòng — vào cùng nhé!`;
    } else if (soon) {
        box.className = 'rh-pulse is-idle';
        box.innerHTML = `<i class="fas fa-clock"></i> Buổi tới: <b>${esc(nameOf(soon))}</b> · ${whenText(soon.data.scheduledAt)} (${countdown(soon.data.scheduledAt)})`;
    } else {
        box.className = 'rh-pulse is-idle';
        box.innerHTML = `<span class="rh-dot"></span> ${rooms.length ? 'Chưa có ai trong phòng — rủ bạn bè vào thôi' : 'Chưa có phòng nào'}`;
    }
}

function faceHtml(m) {
    if (m.emoji) return `<span class="rh-face">${esc(m.emoji)}</span>`;
    if (m.photoURL) return `<img class="rh-face" src="${esc(m.photoURL)}" alt="">`;
    return `<span class="rh-face">${esc((m.displayName || 'K').trim().charAt(0).toUpperCase())}</span>`;
}

function cardHtml(r) {
    const s = statusOf(r);
    const pinned = isPinned(r.id);
    const sched = Number(r.data.scheduledAt) || 0;
    const faces = s.online.slice(0, 5).map(faceHtml).join('')
        + (s.online.length > 5 ? `<span class="rh-face more">+${s.online.length - 5}</span>` : '');

    let liveTop, bar = '';
    if (s.running && s.isLive) {
        liveTop = `<span class="rh-dot"></span> ${s.online.length} đang học · <b>câu ${s.step}/${s.sess.qCount}</b>`;
        bar = `<div class="rh-bar-track"><div class="rh-bar-fill" style="width:${s.pct}%"></div></div>`;
    } else if (s.isLive) {
        liveTop = `<span class="rh-dot"></span> ${s.online.length} bạn đang ở trong phòng · sảnh chờ`;
    } else if (s.sess?.ended) {
        liveTop = `<span class="rh-quiet"><i class="far fa-circle-check"></i> Buổi gần nhất: <b>${esc(s.sess.title || 'bộ đề')}</b>${s.sess.qCount ? ` · ${s.sess.qCount} câu` : ''}${typeof s.sess.avg === 'number' ? ` · TB ${s.sess.avg}%` : ''}</span>`;
    } else if (s.running) {
        liveTop = `<span class="rh-quiet"><i class="fas fa-pause"></i> Phiên "${esc(s.sess.title || 'bộ đề')}" đang bỏ dở · ${s.sess.qCount} câu</span>`;
    } else {
        liveTop = `<span class="rh-quiet"><i class="far fa-moon"></i> Phòng đang yên tĩnh</span>`;
    }

    const pills = [
        s.lastActive ? `<span class="rh-pill"><i class="far fa-clock"></i>${timeAgo(s.lastActive)}</span>` : '',
        s.members.length ? `<span class="rh-pill"><i class="fas fa-user-group"></i>${s.members.length} thành viên</span>` : '',
        sched && countdown(sched) ? `<span class="rh-pill soon"><i class="fas fa-calendar-day"></i>${whenText(sched)} · ${countdown(sched)}</span>` : '',
    ].filter(Boolean).join('');

    return `
    <article class="rh-card rh-t${themeOf(r)} ${s.isLive ? 'is-live' : ''}" data-id="${esc(r.id)}">
        <div class="rh-head">
            <div class="rh-emoji">${esc(r.data.emoji || '📚')}</div>
            <div class="rh-name">
                <h3 title="${esc(nameOf(r))}">${esc(nameOf(r))}</h3>
                <div class="rh-code">${esc(r.id)}
                    <span class="rh-tag ${r.role === 'guest' ? 'guest' : ''}">${r.role === 'guest' ? 'đã vào' : 'chủ phòng'}</span>
                </div>
            </div>
            <button type="button" class="rh-star ${pinned ? 'is-on' : ''}" data-act="pin" title="${pinned ? 'Bỏ ghim' : 'Ghim lên đầu'}">
                <i class="${pinned ? 'fas' : 'far'} fa-star"></i></button>
            <button type="button" class="rh-star" data-act="menu" title="Tùy chọn"><i class="fas fa-ellipsis-vertical"></i></button>
        </div>
        <div class="rh-live">
            <div class="rh-live-top">${liveTop}</div>
            ${bar}
            ${faces ? `<div class="rh-faces">${faces}</div>` : ''}
        </div>
        ${pills ? `<div class="rh-meta">${pills}</div>` : ''}
        <div class="rh-foot">
            <a class="rh-go" href="${esc(linkOf(r.id))}"><i class="fas fa-door-open"></i> ${s.isLive ? 'Vào cùng' : 'Vào phòng'}</a>
            <button type="button" class="rh-mini" data-act="invite" title="Mời bạn bè"><i class="fas fa-user-plus"></i></button>
        </div>
    </article>`;
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
    if (state.q || state.filter !== 'all') {
        return `<div class="rh-empty">
            <b>Không có phòng nào khớp</b>
            <span>Thử xoá từ khoá hoặc chọn lại bộ lọc "Tất cả".</span>
            <button type="button" class="rh-btn rh-btn-ghost" data-act="clear"><i class="fas fa-eraser"></i> Xoá bộ lọc</button></div>`;
    }
    return `<div class="rh-empty">
        <img src="assets/squirrel_group.png" alt="">
        <b>Bạn chưa có phòng học nào</b>
        <span>Tạo phòng, gửi mã (hoặc mã QR) cho nhóm — cả nhóm cùng làm một bộ đề, thấy nhau chọn gì và bàn ngay tại chỗ.</span>
        <button type="button" class="rh-btn rh-btn-main" data-act="create"><i class="fas fa-plus-circle"></i> Tạo phòng đầu tiên</button></div>`;
}

// ---------------- Tương tác trên lưới ----------------
function onGridClick(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const card = e.target.closest('.rh-card');
    const r = card ? state.rooms.get(card.dataset.id) : null;

    if (act === 'retry') return void reload();
    if (act === 'clear') { state.q = ''; state.filter = 'all'; el('rh-q').value = ''; savePrefs(); return void render(true); }
    if (act === 'create') return void openCreateModal();
    if (act === 'join') return void openJoinModal();
    if (act === 'login') return void window.toggleAuthModal?.();

    if (!r) return;
    if (act === 'pin') return void togglePin(r.id);
    if (act === 'invite') return void openInviteModal(r);
    if (act === 'menu') return void openMenu(r, e.target.closest('[data-act]'));
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
function modal(html, onReady) {
    const wrap = document.createElement('div');
    wrap.className = 'rh-modal';
    wrap.innerHTML = `<div class="rh-sheet"><button type="button" class="rh-x" data-close><i class="fas fa-times"></i></button>${html}</div>`;
    document.body.appendChild(wrap);
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
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

function openCreateModal() {
    if (!state.user) {
        showToast('Đăng nhập để tạo phòng nhé!', 'warning');
        window.toggleAuthModal?.();
        return;
    }
    const pick = { emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)], theme: Math.floor(Math.random() * 6) };
    modal(`
        <h3><i class="fas fa-plus-circle" style="color:#ff69b4"></i> Tạo phòng học mới</h3>
        <p class="rh-sub">Đặt tên cho dễ nhớ, mã phòng là thứ bạn gửi cho nhóm.</p>
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
        wrap.querySelector('#rh-c-dice').onclick = () => { code.value = suggestCode(); code.classList.remove('bad'); };
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
                close();
                location.href = linkOf(id);
            } catch (err) {
                showToast('Không tạo được phòng: ' + err.message, 'error');
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-door-open"></i> Tạo & vào phòng';
            }
        };
    });
}

// ---------------- Vào bằng mã ----------------
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

        async function go() {
            const raw = input.value.trim();
            const id = (raw.match(/[?&]id=([^&#\s]+)/)?.[1] || raw.split(/[?#\s]/)[0] || '').trim();
            if (!id) {
                input.classList.add('bad');
                hint.className = 'rh-hint bad';
                hint.textContent = 'Nhập mã phòng đã nhé.';
                return;
            }
            hint.className = 'rh-hint';
            hint.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tìm phòng…';
            try {
                const snap = await getDoc(doc(db, 'study_rooms', decodeURIComponent(id)));
                if (!snap.exists()) {
                    input.classList.add('bad');
                    hint.className = 'rh-hint bad';
                    hint.textContent = 'Không tìm thấy phòng này — kiểm tra lại mã giúp mình.';
                    return;
                }
            } catch (e) { /* mất mạng thì cứ cho vào, trang phòng sẽ báo tiếp */ }
            rememberRoomVisit(decodeURIComponent(id));
            close();
            location.href = linkOf(decodeURIComponent(id));
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
