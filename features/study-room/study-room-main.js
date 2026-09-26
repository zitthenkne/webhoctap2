// study-room-main.js — điểm khởi động phòng đánh đề chung.
// Nhiệm vụ: đăng nhập, vào phòng, lắng nghe Firestore -> đổ vào room-state,
// rồi để các module con (thành viên / chat / đề / bảng trắng) tự vẽ.
import { auth } from '../../core/firebase-init.js';
import { setDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import { showToast } from '../../core/utils.js';
import { room, refs, setState, subscribe, uid, canControl, hasSession } from './room-state.js';
import { AVATAR_EMOJIS, randomEmoji, avatarHtml } from './room-ui.js';
import { initMembers, renderMembers, flushReactions, flushJoins } from './room-members.js';
import { initLobby } from './room-lobby.js';
import { initMobile, paintDock } from './room-mobile.js';
import { initChat, renderChat, clearUnread, isChatOpen, systemMessage } from './room-chat.js';
import { initQuizControl, syncHostBar } from './room-quiz.js';
import { initStage, renderQuiz } from './room-quiz-stage.js';
import { renderRankPanel } from './room-scoreboard.js';
import { initInlineEdit } from './room-editor.js';
import { initBoost, openMinutes } from './room-boost.js';
import { initGame } from './room-game.js';
import { initMedia } from './room-media.js';
import { initPresence } from './room-presence.js';
import { initSparkle } from './room-sparkle.js';

const el = (id) => document.getElementById(id);
const unsubs = [];
let firstMemberSnap = true;

// Chờ snapshot phiên ĐẦU TIÊN rồi mới cho vẽ màn — nếu không, sảnh chờ sẽ hiện
// chớp nhoáng trước khi Firestore kịp trả về phiên đang chạy.
let markReady = () => {};
const firstSession = new Promise(res => { markReady = res; });

// ---------------- Điều hướng giao diện ----------------
// Bảng trắng = whiteboard.js + whiteboard.css (+ wb-templates.js, còn lười hơn: chỉ khi mở hộp Mẫu) và một
// listener Firestore riêng. Đa số buổi học không mở tới -> KHÔNG tải gì cho tới khi người dùng nhấn vào lối
// vào bảng; tải từ lúc ấn xuống (pointerdown) cho kịp, JS và CSS song song.
let wbLib = null, wbReady = null;
function loadCss(href) {
    return new Promise((res) => {
        const l = document.createElement('link');
        l.rel = 'stylesheet'; l.href = href;
        l.onload = l.onerror = () => res();
        document.head.appendChild(l);
    });
}
const loadBoard = () => (wbLib ||= Promise.all([import('./whiteboard.js'), loadCss(new URL('./whiteboard.css', import.meta.url).href)])
    .then(([m]) => m).catch(err => { wbLib = null; throw err; }));
function ensureWhiteboard() {
    if (wbReady) return wbReady;
    wbReady = loadBoard().then(({ initWhiteboard }) => {
        // whiteboard.js tự dựng toàn bộ giao diện bảng bên trong #stage-board
        const un = initWhiteboard({ root: el('stage-board'), roomId: room.roomId, user: room.user });
        if (un) unsubs.push(un);
        requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    }).catch(err => {
        wbReady = null;
        console.error('Không nạp được bảng trắng:', err);
        showToast('Không mở được bảng trắng.', 'error');
    });
    return wbReady;
}

// Thanh soạn thảo (room-richtools.js): chỉ tải khi lần ĐẦU bấm vào một ô sửa — người chỉ xem / chọn đáp án
// thì không bao giờ phải tải.
function lazyRichTools() {
    const first = (e) => {
        const ed = e.target.closest?.('[data-live-edit]');
        if (!ed) return;
        document.removeEventListener('focusin', first, true);
        import('./room-richtools.js').then(m => m.initRichTools(ed)).catch(() => document.addEventListener('focusin', first, true));
    };
    document.addEventListener('focusin', first, true);
}

function showStage(name) {
    el('stage-quiz')?.classList.toggle('hidden', name !== 'quiz');
    el('stage-board')?.classList.toggle('hidden', name !== 'board');
    document.querySelectorAll('#stage-tabs .rm-tab').forEach(b => b.classList.toggle('active', b.dataset.stage === name));
    // Canvas bị ẩn thì kích thước = 0 -> phải báo vẽ lại khi quay lại bảng trắng
    if (name === 'board') {
        ensureWhiteboard();
        requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    }
}

function showPanel(name) {
    ['discuss', 'members', 'rank'].forEach(k => el('panel-' + k)?.classList.toggle('hidden', k !== name));
    document.querySelectorAll('#side-panel .rm-tab').forEach(b => b.classList.toggle('active', b.dataset.panel === name));
    if (name === 'discuss') { clearUnread(); renderChat(); }
    if (name === 'rank') renderRankPanel();
}

// Máy tính: bảng bên thu thành THANH RAY (chỉ 3 biểu tượng) để sân khấu rộng ra.
// Chưa chọn lần nào thì màn < 1600px mặc định thu gọn — bảng bên cũ ăn mất 344px,
// ép cột câu hỏi còn ~600px dù màn 1440px.
const RAIL_KEY = 'roomSideRail';
const isRail = () => document.body.classList.contains('side-rail') && window.matchMedia('(min-width: 768px)').matches;
function setRail(on, remember = true) {
    document.body.classList.toggle('side-rail', on);
    const i = el('side-toggle')?.querySelector('i');
    if (i) i.className = on ? 'fas fa-angles-left' : 'fas fa-angles-right';
    if (remember) { try { localStorage.setItem(RAIL_KEY, on ? '1' : '0'); } catch (e) {} }
    window.dispatchEvent(new Event('resize'));        // canvas bảng trắng vẽ lại theo khổ mới
}

function openPanelMobile(name) {
    if (isRail()) setRail(false);
    showPanel(name);
    const p = el('side-panel');
    p.classList.remove('hidden');
    p.classList.add('flex');
}

function initLayout() {
    let saved = null;
    try { saved = localStorage.getItem(RAIL_KEY); } catch (e) {}
    setRail(saved === null ? window.innerWidth < 1600 : saved === '1', false);
    el('side-toggle')?.addEventListener('click', () => setRail(!document.body.classList.contains('side-rail')));

    el('stage-tabs')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-stage]');
        if (b) showStage(b.dataset.stage);
    });
    // Ấn xuống lối vào bảng trắng (tab / sảnh chờ / khay Thêm) -> bắt đầu tải luôn, nhả tay ra là gần như có sẵn
    document.addEventListener('pointerdown', (e) => {
        if (e.target.closest?.('[data-stage="board"], [data-wait="board"], [data-more="board"]')) loadBoard().catch(() => {});
    }, { passive: true });
    el('side-panel')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-panel]');
        if (!b) return;
        if (isRail()) setRail(false);                  // bấm biểu tượng trên ray = bung đúng tab đó
        showPanel(b.dataset.panel);
    });
    // Điện thoại: đi qua dock để bảng bên thành khay (có lớp mờ, vuốt/Esc đóng được)
    el('online-pill')?.addEventListener('click', () => {
        const dockBtn = document.querySelector('#mobile-nav [data-m="members"]');
        if (dockBtn && window.matchMedia('(max-width: 767px)').matches) dockBtn.click();
        else openPanelMobile('members');
    });
    el('lobby-avatar-btn')?.addEventListener('click', changeIdentity);
    el('close-panel-btn')?.addEventListener('click', () => {
        el('side-panel').classList.add('hidden');
        el('side-panel').classList.remove('flex');
    });
    window.addEventListener('room:panel', (e) => openPanelMobile(e.detail));

    // Trình chiếu: ẩn bảng bên + phóng to chữ (phím F)
    const togglePresent = () => {
        document.body.classList.toggle('present');
        if (document.body.classList.contains('present') && document.fullscreenEnabled) {
            document.documentElement.requestFullscreen?.().catch(() => {});
        } else if (document.fullscreenElement) {
            document.exitFullscreen?.().catch(() => {});
        }
    };
    el('present-btn')?.addEventListener('click', togglePresent);

    // Cỡ chữ: vừa → lớn → rất lớn (nhớ theo máy)
    const SCALES = [1, 1.12, 1.28];
    const applyScale = (v) => {
        document.documentElement.style.setProperty('--rm-scale', v);
        const lb = el('text-size-label');
        if (lb) lb.textContent = ['vừa', 'lớn', 'rất lớn'][Math.max(0, SCALES.indexOf(v))];
        try { localStorage.setItem('roomTextScale', String(v)); } catch (e) {}
    };
    let scaleIdx = SCALES.indexOf(Number(localStorage.getItem('roomTextScale')) || 1);
    if (scaleIdx < 0) scaleIdx = 0;
    applyScale(SCALES[scaleIdx]);
    el('text-size-btn')?.addEventListener('click', () => {
        scaleIdx = (scaleIdx + 1) % SCALES.length;
        applyScale(SCALES[scaleIdx]);
        showToast(['Cỡ chữ vừa', 'Cỡ chữ lớn', 'Cỡ chữ rất lớn'][scaleIdx], 'info', 1200);
    });

    // Sáng / tối — dùng chung khoá 'quiz_theme' với trang làm bài
    const paintThemeBtn = () => {
        const dark = document.documentElement.classList.contains('theme-dark');
        const i = el('theme-btn')?.querySelector('i');
        if (i) i.className = dark ? 'fas fa-sun' : 'fas fa-moon';
    };
    paintThemeBtn();
    el('theme-btn')?.addEventListener('click', () => {
        const dark = document.documentElement.classList.toggle('theme-dark');
        try { localStorage.setItem('quiz_theme', dark ? 'dark' : 'light'); } catch (e) {}
        paintThemeBtn();
    });
    document.addEventListener('keydown', (e) => {
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey) togglePresent();
        if (e.key === 'Escape') document.body.classList.remove('present');
    });

    // Mời / chia sẻ
    const shareModal = el('share-modal');
    const openShare = () => {
        el('share-room-code').textContent = room.roomId || '';
        shareModal.classList.remove('hidden');
        shareModal.classList.add('flex');
        paintQr();
    };
    el('share-room-btn')?.addEventListener('click', openShare);

    // Mã QR: nạp thư viện lần đầu mở hộp mời (không kéo sẵn cho nhẹ trang)
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
    async function paintQr() {
        const box = el('share-qr');
        if (!box) return;
        try {
            await loadQrLib();
            box.innerHTML = '';
            new window.QRCode(box, {
                text: location.href,
                width: 168, height: 168,
                colorDark: '#4a3b52', colorLight: '#ffffff',
                correctLevel: window.QRCode.CorrectLevel.M,
            });
        } catch (e) {
            box.innerHTML = '<p class="text-[11px] text-muted px-2 text-center">Không tải được mã QR (mất mạng) — dùng nút Chép link nhé.</p>';
        }
    }
    shareModal?.addEventListener('click', (e) => {
        if (e.target === shareModal || e.target.closest('[data-close-share]')) {
            shareModal.classList.add('hidden');
            shareModal.classList.remove('flex');
        } else if (e.target.closest('#copy-link-btn')) {
            navigator.clipboard.writeText(location.href)
                .then(() => showToast('Đã chép link phòng!', 'success'))
                .catch(() => showToast('Không chép được, copy thủ công nhé.', 'warning'));
        } else if (e.target.closest('#native-share-btn')) {
            if (navigator.share) navigator.share({ title: 'Vào phòng đánh đề', url: location.href }).catch(() => {});
            else showToast('Thiết bị không hỗ trợ chia sẻ nhanh.', 'info');
        }
    });
    el('room-id-display')?.addEventListener('click', () => {
        navigator.clipboard.writeText(room.roomId || '')
            .then(() => showToast('Đã chép mã phòng!', 'success')).catch(() => {});
    });
    // Kiểu buổi học: "cùng làm" thì không có hẹn giờ / khóa nộp
    const syncModeFields = () => {
        const coop = document.querySelector('input[name="room-mode"]:checked')?.value !== 'lead';
        el('setup-timer-wrap')?.classList.toggle('hidden', coop);
        el('setup-free-roam-wrap')?.classList.toggle('hidden', coop);
    };
    document.querySelectorAll('input[name="room-mode"]').forEach(r => r.addEventListener('change', syncModeFields));
    syncModeFields();
}


// ---------------- Kéo đổi độ rộng cột (nhớ theo máy) ----------------
// Hai thanh kéo: #split-side (sân khấu ↔ bảng bên) và #split-live (2 cột màn làm bài).
// Bấm đúp để trả về mặc định.
const SPLITS = {
    side: {
        key: 'roomSideW', varName: '--rm-side-w',
        // kéo sang trái thì bảng bên rộng ra
        calc: (e) => `${Math.max(15, Math.min(40, (window.innerWidth - e.clientX) / 16))}rem`,
    },
    live: {
        key: 'roomLiveCols', varName: '--rm-live-cols',
        calc: (e) => {
            const grid = document.querySelector('.rm-live-grid');
            if (!grid) return null;
            const r = grid.getBoundingClientRect();
            const pct = Math.max(34, Math.min(74, ((e.clientX - r.left) / r.width) * 100));
            return `${pct.toFixed(1)}% minmax(0, 1fr)`;
        },
    },
};

function applySplit(name, value) {
    const cfg = SPLITS[name];
    if (value) document.documentElement.style.setProperty(cfg.varName, value);
    else document.documentElement.style.removeProperty(cfg.varName);
    try {
        if (value) localStorage.setItem(cfg.key, value);
        else localStorage.removeItem(cfg.key);
    } catch (e) {}
}

function initSplitters() {
    Object.keys(SPLITS).forEach(name => {
        const cfg = SPLITS[name];
        let saved = null;
        try { saved = localStorage.getItem(cfg.key); } catch (e) {}
        if (saved) document.documentElement.style.setProperty(cfg.varName, saved);

        const bar = el('split-' + name);
        if (!bar) return;
        bar.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            try { bar.setPointerCapture(e.pointerId); } catch (err) {}
            bar.classList.add('is-drag');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });
        bar.addEventListener('pointermove', (e) => {
            if (!bar.classList.contains('is-drag')) return;
            const v = cfg.calc(e);
            if (v) applySplit(name, v);
            // canvas bảng trắng phải vẽ lại theo khổ mới
            if (name === 'side') window.dispatchEvent(new Event('resize'));
        });
        const stop = (e) => {
            if (!bar.classList.contains('is-drag')) return;
            bar.classList.remove('is-drag');
            try { bar.releasePointerCapture?.(e.pointerId); } catch (err) {}
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            window.dispatchEvent(new Event('resize'));
        };
        bar.addEventListener('pointerup', stop);
        bar.addEventListener('pointercancel', stop);
        bar.addEventListener('dblclick', () => {
            applySplit(name, null);
            showToast('Đã trả độ rộng về mặc định.', 'info', 1400);
            window.dispatchEvent(new Event('resize'));
        });
    });
}

// ---------------- Khách vào bằng link (không cần đăng nhập) ----------------
const GUEST_ID_KEY = 'roomGuestId';
const GUEST_NAME_KEY = 'roomGuestName';
const GUEST_EMOJI_KEY = 'roomGuestEmoji';

function guestIdentity() {
    let id = null;
    try { id = localStorage.getItem(GUEST_ID_KEY); } catch (e) {}
    if (!id) {
        id = 'guest_' + Math.random().toString(36).slice(2, 10);
        try { localStorage.setItem(GUEST_ID_KEY, id); } catch (e) {}
    }
    let name = '', emoji = '';
    try {
        name = localStorage.getItem(GUEST_NAME_KEY) || '';
        emoji = localStorage.getItem(GUEST_EMOJI_KEY) || '';
    } catch (e) {}
    return { uid: id, displayName: name, emoji: emoji || null, photoURL: null, isGuest: true };
}

// Màn "vào phòng": chọn mặt đại diện + nhập tên. Dùng cả khi muốn đổi mặt/tên sau này.
let pickedEmoji = null;

function paintJoinPreview() {
    const box = el('join-preview');
    if (!box) return;
    const name = (el('guest-name-input')?.value || '').trim() || 'Khách';
    box.innerHTML = avatarHtml({ uid: uid() || 'me', displayName: name, emoji: pickedEmoji }, 'lg');
    document.querySelectorAll('#emoji-grid [data-emoji]').forEach(b =>
        b.classList.toggle('on', b.dataset.emoji === pickedEmoji));
}

function askIdentity({ name = '', emoji = null, title = '' } = {}) {
    return new Promise((resolve) => {
        const modal = el('name-modal');
        const input = el('guest-name-input');
        const btn = el('guest-join-btn');
        if (!modal || !input || !btn) return resolve({ name: name || 'Khách', emoji });
        pickedEmoji = emoji || randomEmoji();
        el('name-modal-room').textContent = title || room.roomId || '';
        el('emoji-grid').innerHTML = AVATAR_EMOJIS.map(e =>
            `<button type="button" data-emoji="${e}" class="rm-emoji">${e}</button>`).join('');
        input.value = name;
        modal.classList.remove('hidden');
        paintJoinPreview();
        setTimeout(() => input.focus(), 80);

        const onGrid = (e) => {
            const b = e.target.closest('[data-emoji]');
            if (!b) return;
            pickedEmoji = b.dataset.emoji;
            paintJoinPreview();
        };
        const onRandom = () => { pickedEmoji = randomEmoji(); paintJoinPreview(); };
        const onNone = () => { pickedEmoji = null; paintJoinPreview(); };
        const onType = () => paintJoinPreview();
        const onKey = (e) => { if (e.key === 'Enter') done(); };

        function done() {
            const finalName = (input.value || '').trim().slice(0, 40) || 'Khách';
            try {
                localStorage.setItem(GUEST_NAME_KEY, finalName);
                localStorage.setItem(GUEST_EMOJI_KEY, pickedEmoji || '');
            } catch (e) {}
            el('emoji-grid').removeEventListener('click', onGrid);
            el('emoji-random').removeEventListener('click', onRandom);
            el('emoji-none').removeEventListener('click', onNone);
            input.removeEventListener('input', onType);
            input.removeEventListener('keydown', onKey);
            btn.removeEventListener('click', done);
            modal.classList.add('hidden');
            resolve({ name: finalName, emoji: pickedEmoji });
        }
        el('emoji-grid').addEventListener('click', onGrid);
        el('emoji-random').addEventListener('click', onRandom);
        el('emoji-none').addEventListener('click', onNone);
        input.addEventListener('input', onType);
        input.addEventListener('keydown', onKey);
        btn.addEventListener('click', done);
    });
}

// Đổi mặt / tên giữa chừng (nút ở sảnh chờ và trong bảng thao tác thành viên)
async function changeIdentity() {
    const me = room.members.find(m => m.uid === uid());
    const { name, emoji } = await askIdentity({
        name: me?.displayName || room.user?.displayName || '',
        emoji: me?.emoji || null,
        title: room.roomId,
    });
    setState({ user: { ...room.user, displayName: name } });
    await updateDoc(refs.member(), { displayName: name, emoji: emoji || null }).catch(() => {});
    showToast('Đã đổi mặt đại diện!', 'success');
}
window.addEventListener('room:change-identity', changeIdentity);

// ---------------- Chặn người bị mời ra ----------------
function showBlocked(title, desc) {
    const o = document.createElement('div');
    o.className = 'fixed inset-0 z-[90] bg-white/95 backdrop-blur flex items-center justify-center p-6 text-center';
    o.innerHTML = `<div class="max-w-sm">
        <img src="../../assets/opt/squirrel_group-256.webp" alt="" class="w-24 h-24 mx-auto mb-4 rounded-2xl shadow-md ring-4 ring-pink-100/70 bg-white">
        <h2 class="text-xl font-extrabold text-gray-800 mb-2">${title}</h2>
        <p class="text-sm text-gray-500 mb-5">${desc}</p>
        <a href="../../index.html" class="inline-flex items-center gap-2 px-6 py-2.5 bg-[#FF69B4] text-white rounded-xl font-bold text-sm shadow-md hover:bg-pink-400 transition">
            <i class="fas fa-house"></i> Về trang chủ</a></div>`;
    document.body.appendChild(o);
}

// ---------------- Vào phòng ----------------
/** Nhật ký "phòng tôi từng vào" cho khu Phòng học ở trang chủ (rooms-hub.js đọc khóa này).
 *  Firestore không truy ngược được "phòng nào có member là tôi" nếu không mở collectionGroup index,
 *  nên ghi thẳng ở máy — chạy cho cả khách chưa đăng nhập. */
function rememberRoomVisit(id) {
    if (!id) return;
    try {
        const list = (JSON.parse(localStorage.getItem('roomRecents') || '[]') || []).filter(r => r && r.id !== id);
        list.unshift({ id, at: Date.now() });
        localStorage.setItem('roomRecents', JSON.stringify(list.slice(0, 24)));
    } catch (e) { /* hết dung lượng: chỉ mất tiện lợi */ }
}

async function joinRoom() {
    // setDoc merge: vào lại phòng KHÔNG xóa đáp án/điểm đã có
    await setDoc(refs.member(), {
        uid: uid(),
        displayName: room.user.displayName || room.user.email?.split('@')[0] || `Khách_${uid().slice(0, 5)}`,
        photoURL: room.user.photoURL || null,
        ...(room.user.emoji ? { emoji: room.user.emoji } : {}),
        online: true,
        lastSeen: Date.now(),
        joinedAt: Date.now(),
    }, { merge: true });
    systemMessage(`${room.user.displayName || 'Một bạn'} đã vào phòng.`);
    rememberRoomVisit(room.roomId);

    // Nhịp tim: 30s/lần để cả phòng biết ai còn online
    const beat = setInterval(() => updateDoc(refs.member(), { lastSeen: Date.now(), online: true }).catch(() => {}), 30000);
    unsubs.push(() => clearInterval(beat));

    const goOffline = () => { updateDoc(refs.member(), { online: false, lastSeen: Date.now(), hand: null }).catch(() => {}); };
    window.addEventListener('pagehide', goOffline);
    window.addEventListener('beforeunload', goOffline);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') updateDoc(refs.member(), { online: true, lastSeen: Date.now() }).catch(() => {});
    });
}

function listenAll() {
    unsubs.push(onSnapshot(refs.room(), (snap) => {
        const data = snap.data() || {};
        if ((data.banned || []).includes(uid())) {
            unsubs.forEach(f => f());
            showBlocked('Bạn đã được mời ra khỏi phòng', 'Liên hệ chủ phòng nếu bạn nghĩ đây là nhầm lẫn.');
            return;
        }
        setState({ roomDoc: data, isOwner: data.owner === uid() });
        // Tên + biểu tượng phòng đặt ở trang chủ (rooms-hub.js) — hiện luôn trên đầu phòng.
        // Mã phòng lùi vào tooltip; bấm chip vẫn chép MÃ chứ không chép tên.
        const chip = el('room-id-text');
        if (chip && data.title) {
            chip.textContent = `${data.emoji || ''} ${data.title}`.trim();
            el('room-id-display')?.setAttribute('title', `Mã phòng: ${room.roomId} — bấm để sao chép`);
        }
    }));

    unsubs.push(onSnapshot(refs.members(), (snap) => {
        const members = [];
        snap.forEach(d => members.push(d.data()));
        setState({ members });
        flushJoins();
        flushReactions(firstMemberSnap);
        firstMemberSnap = false;
    }));

    unsubs.push(onSnapshot(refs.session(), (snap) => {
        const data = snap.exists() ? snap.data() : null;
        setState({ session: data?.questions?.length ? data : null, ready: true });
        markReady();
    }));

    unsubs.push(initChat());
}

// Đề vừa được mở -> cả phòng cùng đếm ngược 3-2-1 cho có khí thế
let countdownShownFor = 0;
function maybeCountdown() {
    const s = room.session;
    if (!s?.startedAtMs || s.ended) return;
    const age = Date.now() - s.startedAtMs;
    if (age > 3200 || countdownShownFor === s.startedAtMs) return;
    countdownShownFor = s.startedAtMs;
    const box = el('countdown-overlay');
    const num = el('countdown-num');
    if (!box || !num) return;
    box.classList.remove('hidden');
    let n = 3;
    num.textContent = n;
    num.classList.remove('rm-kick');
    void num.offsetWidth;
    num.classList.add('rm-kick');
    const t = setInterval(() => {
        n -= 1;
        if (n <= 0) {
            clearInterval(t);
            num.textContent = 'GO!';
            setTimeout(() => box.classList.add('hidden'), 600);
            return;
        }
        num.textContent = n;
        num.classList.remove('rm-kick');
        void num.offsetWidth;
        num.classList.add('rm-kick');
    }, 800);
}

// Mỗi lần state đổi -> vẽ lại các phần phụ thuộc.
// Gộp theo KHUNG HÌNH: một loạt snapshot về cùng lúc (phòng · thành viên · phiên · chat)
// trước đây vẽ lại 4 lần liên tiếp trong một nhịp -> nhìn như giật.
let paintPending = false;
// Sảnh chờ đã có ghế (= tab Nhóm) và khung trò chuyện (= tab Chat) -> bảng bên máy tính chỉ lặp lại.
// Vào sảnh thì thu thành ray (KHÔNG ghi nhớ); vào phiên thì trả lại đúng lựa chọn đã lưu của người dùng.
// Chỉ đổi lúc chuyển sảnh <-> phiên, nên người dùng tự mở bảng trong sảnh vẫn được tôn trọng.
let lastLobby = null;
function syncLobbyRail() {
    if (!room.ready) return;
    const lobby = !hasSession();
    if (lobby === lastLobby) return;
    lastLobby = lobby;
    if (!window.matchMedia('(min-width: 768px)').matches) return;
    if (lobby) return setRail(true, false);
    let saved = null;
    try { saved = localStorage.getItem(RAIL_KEY); } catch (e) {}
    setRail(saved === null ? window.innerWidth < 1600 : saved === '1', false);
}

function paintAll() {
    paintPending = false;
    syncLobbyRail();
    maybeCountdown();
    renderQuiz();
    paintDock();
    renderMembers();
    if (canControl()) syncHostBar();
    if (isChatOpen()) renderChat();
    window.dispatchEvent(new Event('room:paint'));
}
subscribe(() => {
    if (paintPending) return;
    paintPending = true;
    requestAnimationFrame(paintAll);
});

async function initRoom() {
    el('loading-overlay').classList.remove('hidden');
    try {
        const roomId = new URLSearchParams(location.search).get('id');
        if (!roomId) {
            showBlocked('Thiếu mã phòng', 'Link phòng phải có dạng study-room.html?id=MÃ_PHÒNG.');
            return;
        }
        setState({ roomId });
        el('room-id-text').textContent = roomId;
        document.title = `Phòng ${roomId} — Đánh đề chung`;

        // Chưa có tên (khách / tài khoản ẩn danh) -> chọn mặt + nhập tên trước khi vào
        if (!room.user.displayName) {
            el('loading-overlay').classList.add('hidden');
            const { name, emoji } = await askIdentity({ emoji: room.user.emoji || null });
            setState({ user: { ...room.user, displayName: name, emoji } });
            el('loading-overlay').classList.remove('hidden');
        }

        await joinRoom();
        listenAll();

        initLayout();
        initSplitters();
        initMobile();
        initMembers();
        initLobby();
        initQuizControl();
        initStage();
        initBoost();
        initGame();
        initInlineEdit();
        initMedia();
        lazyRichTools();                                         // thanh soạn thảo: ảnh · bảng · danh sách · tiêu đề (tải lúc cần)
        initPresence();                                          // thanh ai-đang-xem + con trỏ người khác
        initSparkle();                                           // bản 32: ABCD mini trên HUD · xem trước câu · 🔥 chuỗi · vắng mặt
        window.addEventListener('room:minutes', openMinutes);   // room-minutes.js nạp lười ở lần mở đầu
        showPanel('discuss');

        // Đợi phiên đầu tiên (hoặc 4 giây) rồi mới bỏ màn chờ -> không còn nháy sảnh chờ
        el('loading-overlay').classList.add('hidden');   // màn chờ xương cá lo phần chờ, khỏi phủ trắng cho đục
        await Promise.race([firstSession, new Promise(r => setTimeout(r, 4000))]);
        setState({ ready: true });
        renderQuiz();
        renderMembers();
    } catch (err) {
        console.error('Lỗi khởi tạo phòng:', err);
        showToast('Lỗi khi tải phòng học.', 'error');
    } finally {
        el('loading-overlay').classList.add('hidden');
    }
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        if (room.user) return;                 // đã khởi tạo rồi thì thôi
        setState({ user });
        await initRoom();
    } else {
        // Chưa đăng nhập: thử tài khoản ẩn danh của Firebase; nếu console tắt tính năng đó
        // thì vẫn vào được bằng danh tính khách lưu trên máy (rules cho phép khách).
        signInAnonymously(auth).catch(async (error) => {
            console.warn('Không dùng được đăng nhập ẩn danh, chuyển sang khách cục bộ:', error?.code);
            if (room.user) return;
            setState({ user: guestIdentity() });
            await initRoom();
        });
    }
});
