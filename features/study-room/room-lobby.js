// room-lobby.js — SẢNH CHỜ kiểu sảnh game: ghế ngồi của cả phòng (kèm ghế trống
// mời bạn), thanh "cả phòng sẵn sàng", băng cảm xúc, câu chào nhanh, gợi ý mục tiêu
// và nhật ký ai vào / ai ra.
import { updateDoc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { showToast } from '../../core/utils.js';
import { room, refs, uid, canControl } from './room-state.js';
import { avatarHtml, escapeHtml, shortName } from './room-ui.js';
import { isOnline, roleOf, sendReaction, openSheet } from './room-members.js';
import { sendChat, systemMessage } from './room-chat.js';
import { ensureConfetti } from './room-boost.js';

const el = (id) => document.getElementById(id);
const MIN_SEATS = 6;                 // luôn chừa vài ghế trống cho đỡ trống trải
const LOBBY_EMOJIS = ['👋', '🎉', '🔥', '😴', '🍀', '☕', '💪', '🥺'];
const QUICK_LINES = [
    'Mình sẵn sàng rồi nha!',
    'Chờ mình 2 phút nữa nhé 🙏',
    'Bắt đầu thôi mọi người ơi!',
    'Hôm nay làm nhẹ nhàng thôi 😌',
    'Ai chưa vào thì hú giùm mình',
];
const GOAL_PRESETS = [
    ['🎯', 'Làm hết đề rồi bàn câu sai'],
    ['🩺', 'Ưu tiên câu lâm sàng'],
    ['⏱️', 'Mỗi câu tối đa 1 phút'],
    ['🗣️', 'Ai chọn khác thì phải giải thích'],
];

// ---------- Nhật ký vào / ra (chỉ ở máy này) ----------
const joinLog = [];
export function pushLobbyLog(text) {
    joinLog.unshift({ text, at: Date.now() });
    if (joinLog.length > 8) joinLog.pop();
    renderLog();
}
function renderLog() {
    const box = el('lobby-log');
    if (!box) return;
    box.innerHTML = joinLog.length
        ? joinLog.map(l => `<p class="rm-lobby-logline">${escapeHtml(l.text)}</p>`).join('')
        : '<p class="rm-notice">Chưa có ai ra vào. Rủ thêm bạn cho vui nhé!</p>';
}

// ---------- Vẽ sảnh ----------
let cheered = false;                 // đã bắn pháo giấy cho lượt "cả phòng sẵn sàng" này chưa

export function renderLobby() {
    const grid = el('lobby-members');
    if (!grid) return;

    const online = room.members.filter(isOnline);
    const ready = room.members.filter(m => m.lobbyReady && isOnline(m));

    // --- Ghế ngồi ---
    const list = room.members.slice().sort((a, b) =>
        (isOnline(b) - isOnline(a)) || ((b.lobbyReady ? 1 : 0) - (a.lobbyReady ? 1 : 0)));
    const seats = list.map(m => {
        const me = m.uid === uid();
        const role = roleOf(m);
        return `<div class="rm-seat ${me ? 'is-me' : ''} ${isOnline(m) ? '' : 'rm-offline'} ${m.lobbyReady ? 'is-ready' : ''}" data-uid="${escapeHtml(m.uid)}">
            <div class="rm-seat-av">
                ${role === 'host' || role === 'owner' ? '<span class="rm-seat-crown">👑</span>' : ''}
                ${avatarHtml(m, 'lg')}
                ${m.hand ? '<span class="rm-seat-hand">✋</span>' : ''}
            </div>
            <p class="rm-seat-name">${escapeHtml(shortName(m.displayName || 'Khách', 12))}${me ? ' <span class="text-muted">(bạn)</span>' : ''}</p>
            <span class="rm-seat-state">${!isOnline(m) ? 'ngoại tuyến' : m.lobbyReady ? 'sẵn sàng ✓' : 'đang chờ…'}</span>
        </div>`;
    });
    const empty = Math.max(0, MIN_SEATS - list.length);
    for (let i = 0; i < empty; i++) {
        seats.push(`<button class="rm-seat rm-seat-empty" data-invite="1">
            <i class="fas fa-plus"></i><span>Ghế trống</span></button>`);
    }
    grid.innerHTML = seats.join('');

    // --- Đếm & thanh sẵn sàng ---
    const cnt = el('lobby-count');
    if (cnt) cnt.textContent = `${online.length} người`;
    const rc = el('lobby-ready-count');
    if (rc) {
        rc.classList.toggle('hidden', !ready.length);
        rc.textContent = `${ready.length}/${online.length} sẵn sàng`;
    }
    const pct = online.length ? Math.round(100 * ready.length / online.length) : 0;
    const fill = el('lobby-ready-fill');
    if (fill) fill.style.width = pct + '%';
    const track = fill?.parentElement;
    const allReady = online.length >= 2 && ready.length === online.length;
    track?.classList.toggle('is-full', allReady);
    const label = el('lobby-ready-label');
    if (label) {
        label.textContent = !online.length ? 'Đang chờ mọi người…'
            : allReady ? '🎉 Cả phòng sẵn sàng!'
            : !ready.length ? 'Chưa ai bấm sẵn sàng'
            : `${ready.length}/${online.length} đã sẵn sàng`;
    }
    if (allReady && !cheered) {
        cheered = true;
        ensureConfetti().then(() => window.confetti?.({ particleCount: 90, spread: 70, origin: { y: .35 } }));
    }
    if (!allReady) cheered = false;

    // --- Nút "Tôi sẵn sàng" ---
    const btn = el('lobby-ready-btn');
    if (btn) {
        const me = room.members.find(m => m.uid === uid());
        btn.classList.toggle('is-off', !!me?.lobbyReady);
        btn.innerHTML = me?.lobbyReady
            ? '<i class="fas fa-check"></i>Đã sẵn sàng'
            : '<i class="fas fa-hand-sparkles"></i>Tôi sẵn sàng';
    }

    // --- Gợi ý cho chủ trì ngay cạnh nút bắt đầu ---
    const hint = el('start-ready-hint');
    if (hint && canControl()) {
        const disabled = el('start-quiz-collaboration-btn')?.disabled;
        hint.textContent = disabled ? 'Chọn đề để mở nút bắt đầu.'
            : allReady ? `Cả ${online.length} bạn đã sẵn sàng — mở đề thôi!`
            : `${ready.length}/${online.length} bạn đã sẵn sàng.`;
        hint.classList.toggle('is-go', !disabled && allReady);
        el('start-quiz-collaboration-btn')?.classList.toggle('is-hot', !disabled && allReady);
    }

    renderLog();
}

// ---------- Khởi tạo ----------
export function initLobby() {
    // Băng cảm xúc: bấm là emoji bay lên cho cả phòng thấy
    const bar = el('lobby-emoji');
    if (bar) {
        bar.innerHTML = LOBBY_EMOJIS.map(e => `<button class="rm-emoji-btn" data-emoji="${e}">${e}</button>`).join('');
        bar.addEventListener('click', (e) => {
            const b = e.target.closest('[data-emoji]');
            if (b) sendReaction(b.dataset.emoji);
        });
    }

    // Câu chào nhanh -> gửi thẳng vào tab Thảo luận
    const quick = el('lobby-quick');
    if (quick) {
        quick.innerHTML = QUICK_LINES.map(t => `<button class="rm-quick" data-say="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('');
        quick.addEventListener('click', (e) => {
            const b = e.target.closest('[data-say]');
            if (!b) return;
            sendChat(b.dataset.say);
            showToast('Đã gửi vào Thảo luận!', 'success', 1400);
        });
    }

    // Gợi ý mục tiêu buổi học — chèn vào ô ai cũng sửa được
    const presets = el('goal-presets');
    if (presets) {
        presets.innerHTML = GOAL_PRESETS.map(([ic, t]) =>
            `<button class="rm-quick" data-goal="${escapeHtml(t)}">${ic} ${escapeHtml(t)}</button>`).join('');
        presets.addEventListener('click', (e) => {
            const b = e.target.closest('[data-goal]');
            const box = document.querySelector('[data-live-edit="goal"]');
            if (!b || !box) return;
            const cur = box.textContent.trim();
            box.textContent = cur ? `${cur} · ${b.dataset.goal}` : b.dataset.goal;
            box.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }

    el('lobby-ready-btn')?.addEventListener('click', () => {
        const me = room.members.find(m => m.uid === uid());
        updateDoc(refs.member(), { lobbyReady: !me?.lobbyReady }).catch(() => {});
    });

    // Ghế: bấm người -> bảng thao tác, bấm ghế trống -> hộp mời
    el('lobby-members')?.addEventListener('click', (e) => {
        if (e.target.closest('[data-invite]')) return void el('share-room-btn')?.click();
        const seat = e.target.closest('[data-uid]');
        const m = seat && room.members.find(x => x.uid === seat.dataset.uid);
        if (m) openSheet(m);
    });
    el('lobby-invite-btn')?.addEventListener('click', () => el('share-room-btn')?.click());

    // Thẻ chờ chủ trì: mấy việc cho đỡ chán
    el('lobby-waiting')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-wait]');
        if (!b) return;
        const act = b.dataset.wait;
        if (act === 'board') document.querySelector('#stage-tabs [data-stage="board"]')?.click();
        else if (act === 'chat') window.dispatchEvent(new CustomEvent('room:panel', { detail: 'discuss' }));
        else if (act === 'poke') {
            systemMessage(`${room.user?.displayName || 'Một bạn'} hối chủ trì mở đề rồi kìa! 🔔`);
            showToast('Đã nhắc chủ trì!', 'success', 1600);
        }
    });
}
