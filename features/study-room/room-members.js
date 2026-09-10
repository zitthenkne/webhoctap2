// room-members.js — danh sách thành viên, hiện diện (online/offline), vai trò,
// giơ tay, phản ứng emoji và bảng thao tác của chủ trì (trao quyền / mời ra).
import { updateDoc, deleteDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { showToast, showConfirm } from '../../core/utils.js';
import { room, refs, uid, isHost, canControl, currentIndex, answerOf, readyOf, hasSession } from './room-state.js';
import { avatarHtml, escapeHtml, shortName } from './room-ui.js';
import { computeScores } from './room-scoreboard.js';
import { renderLobby, pushLobbyLog } from './room-lobby.js';

const REACTIONS = ['👍', '😂', '❤️', '😮', '🤔', '🎉'];
const STALE_MS = 90000;   // không heartbeat quá 90s coi như offline
const seenReaction = new Map();
let sheetTarget = null;

export const isOnline = (m) => m.online !== false && (Date.now() - (m.lastSeen || 0) < STALE_MS);
export const roleOf = (m) => {
    if (room.session?.hostId === m.uid) return 'host';
    if ((room.session?.cohosts || []).includes(m.uid)) return 'cohost';
    if (room.roomDoc?.owner === m.uid) return 'owner';
    return 'member';
};
const ROLE_CHIP = {
    host: '<span class="rm-chip warn"><i class="fas fa-crown"></i>Chủ trì</span>',
    cohost: '<span class="rm-chip accent"><i class="fas fa-user-shield"></i>Phó</span>',
    owner: '<span class="rm-chip"><i class="fas fa-house"></i>Chủ phòng</span>',
    member: '',
};

// ---------- Ghi dữ liệu ----------
export const sendReaction = (emoji) => updateDoc(refs.member(), { reaction: { e: emoji, at: Date.now() } }).catch(() => {});
export const toggleHand = () => {
    const me = room.members.find(m => m.uid === uid());
    return updateDoc(refs.member(), { hand: me?.hand ? null : Date.now() }).catch(() => {});
};

// ---------- Render ----------
export function renderMembers() {
    const list = document.getElementById('member-list');
    if (!list) return;
    const scores = new Map(computeScores().map(r => [r.uid, r]));
    const qi = currentIndex();
    const sorted = room.members.slice().sort((a, b) => {
        const w = (m) => (roleOf(m) === 'host' ? 0 : roleOf(m) === 'cohost' ? 1 : 2) + (isOnline(m) ? 0 : 10);
        return w(a) - w(b) || String(a.displayName || '').localeCompare(String(b.displayName || ''));
    });

    const totalQ = room.session?.questions?.length || 0;
    list.innerHTML = sorted.map(m => {
        const me = m.uid === uid();
        const done = Object.keys(m.answers || {}).length;
        const cursor = typeof m.cursor === 'number' ? m.cursor + 1 : null;
        const isGuest = String(m.uid || '').startsWith('guest_');
        const sc = scores.get(m.uid);
        const pct = totalQ ? Math.round(100 * done / totalQ) : 0;
        const ready = readyOf(m, qi);
        return `<li data-uid="${escapeHtml(m.uid)}" class="rm-member ${me ? 'me' : ''} ${isOnline(m) ? '' : 'rm-offline'}">
            <div class="relative shrink-0">
                ${avatarHtml(m)}
                <span class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white" style="background:${isOnline(m) ? '#22c55e' : '#c9c4d2'}"></span>
            </div>
            <div class="min-w-0 flex-1">
                <p class="text-[13px] font-bold truncate">${escapeHtml(shortName(m.displayName || 'Khách', 18))}${me ? ' <span class="text-muted font-normal">(bạn)</span>' : ''}</p>
                <div class="flex items-center gap-1.5 mt-1">
                    ${ROLE_CHIP[roleOf(m)]}
                    ${isGuest ? '<span class="rm-chip">khách</span>' : ''}
                    ${hasSession() ? `<div class="rm-mini-progress" title="${done}/${totalQ} câu"><div style="width:${pct}%"></div></div>
                        <span class="text-[10px] text-muted tabular-nums">${done}/${totalQ}</span>
                        ${cursor ? `<span class="text-[10px] text-muted">· câu ${cursor}</span>` : ''}` : ''}
                </div>
            </div>
            ${ready ? '<span class="rm-chip ok" title="Đã báo xong câu này"><i class="fas fa-check"></i></span>' : ''}
            ${m.hand ? '<span class="rm-hand text-base shrink-0">✋</span>' : ''}
            ${sc && sc.points ? `<span class="shrink-0 text-xs font-black tabular-nums" style="color:var(--rm-accent)">${sc.points}</span>` : ''}
        </li>`;
    }).join('') || '<li class="rm-notice py-6">Chưa có ai trong phòng.</li>';

    const online = room.members.filter(isOnline).length;
    const cnt = document.getElementById('online-count');
    if (cnt) cnt.textContent = online;

    renderHandQueue();
    renderLobby();
}

function renderHandQueue() {
    const box = document.getElementById('hand-queue');
    const btn = document.getElementById('host-hands');
    const hands = room.members.filter(m => m.hand).sort((a, b) => a.hand - b.hand);
    if (btn) {
        btn.classList.toggle('hidden', hands.length === 0 || !canControl());
        const c = document.getElementById('host-hands-count');
        if (c) c.textContent = hands.length;
    }
    if (!box) return;
    box.classList.toggle('hidden', hands.length === 0);
    if (!hands.length) return;
    box.innerHTML = `<div class="p-2.5 rounded-xl" style="background:var(--rm-warn-bg)">
        <div class="flex items-center justify-between mb-1.5">
            <p class="rm-label" style="color:var(--rm-warn)"><span class="rm-hand">✋</span> Đang giơ tay (${hands.length})</p>
            ${canControl() ? '<button id="clear-hands-btn" class="text-[11px] font-bold hover:underline" style="color:var(--rm-warn)">Hạ tất cả</button>' : ''}
        </div>
        <div class="flex flex-wrap gap-1">${hands.map((m, i) =>
            `<span class="rm-chip warn">${i + 1}. ${escapeHtml(shortName(m.displayName || 'Khách', 12))}</span>`
        ).join('')}</div>
    </div>`;
}

// ---------- Ai vừa vào / vừa rời phòng ----------
let knownUids = null;
export function flushJoins() {
    const layer = document.getElementById('reaction-layer');
    const now = new Set(room.members.filter(isOnline).map(m => m.uid));
    if (knownUids === null) { knownUids = now; return; }     // lần đầu thì im lặng
    room.members.forEach(m => {
        if (!isOnline(m) || knownUids.has(m.uid) || m.uid === uid()) return;
        pushLobbyLog(`${m.displayName || 'Một bạn'} vừa vào phòng 👋`);
        showToast(`${m.displayName || 'Một bạn'} vừa vào phòng!`, 'success', 2200);
        if (layer) {
            const el = document.createElement('div');
            el.className = 'rm-fly';
            el.innerHTML = avatarHtml(m, 'lg');
            el.style.left = `${12 + Math.random() * 70}%`;
            layer.appendChild(el);
            setTimeout(() => el.remove(), 2600);
        }
    });
    knownUids.forEach(u => {
        if (now.has(u)) return;
        const m = room.members.find(x => x.uid === u);
        pushLobbyLog(`${m?.displayName || 'Một bạn'} đã rời phòng`);
    });
    knownUids = now;
}

// ---------- Phản ứng bay ----------
export function flushReactions(firstRun) {
    const layer = document.getElementById('reaction-layer');
    if (!layer) return;
    room.members.forEach(m => {
        const r = m.reaction;
        if (!r?.at) return;
        const prev = seenReaction.get(m.uid) || 0;
        if (r.at <= prev) return;
        seenReaction.set(m.uid, r.at);
        if (firstRun || Date.now() - r.at > 10000) return;   // không phát lại reaction cũ
        const el = document.createElement('div');
        el.className = 'rm-float';
        el.style.left = `${8 + Math.random() * 74}%`;
        el.textContent = r.e || '👍';
        layer.appendChild(el);
        setTimeout(() => el.remove(), 3400);
    });
}

// ---------- Bảng thao tác ----------
export function openSheet(target) {
    sheetTarget = target;
    const sheet = document.getElementById('member-sheet');
    if (!sheet) return;
    const me = target.uid === uid();
    const role = roleOf(target);
    document.getElementById('sheet-avatar').innerHTML = avatarHtml(target);
    document.getElementById('sheet-name').textContent = target.displayName || 'Khách';
    const sc = computeScores().find(r => r.uid === target.uid);
    document.getElementById('sheet-meta').textContent =
        `${role === 'host' ? 'Chủ trì · ' : role === 'cohost' ? 'Phó chủ trì · ' : role === 'owner' ? 'Chủ phòng · ' : ''}` +
        `${isOnline(target) ? 'đang online' : 'ngoại tuyến'}${sc ? ` · ${sc.points} điểm` : ''}`;

    const btn = (id, cls, icon, label) =>
        `<button data-act="${id}" class="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl font-bold text-sm ${cls}"><i class="fas ${icon} w-4"></i>${label}</button>`;
    let html = '';
    if (me) html += btn('identity', 'bg-pink-50 text-[#FF69B4] hover:bg-pink-100', 'fa-face-smile', 'Đổi mặt đại diện / tên');
    if (canControl() && !me) {
        if (hasSession()) html += btn('makehost', 'bg-amber-50 text-amber-700 hover:bg-amber-100', 'fa-crown', 'Trao quyền chủ trì');
        html += btn('cohost', 'bg-violet-50 text-violet-700 hover:bg-violet-100', 'fa-user-shield',
            role === 'cohost' ? 'Bỏ quyền phó chủ trì' : 'Cho làm phó chủ trì');
        if (target.hand) html += btn('lower', 'bg-gray-50 text-gray-600 hover:bg-gray-100', 'fa-hand', 'Hạ tay giúp');
        if (room.isOwner) html += btn('kick', 'bg-red-50 text-red-600 hover:bg-red-100', 'fa-user-slash', 'Mời ra khỏi phòng');
    }
    if (!html) html = '<p class="text-xs text-gray-400 text-center py-2">Không có thao tác nào.</p>';
    document.getElementById('sheet-actions').innerHTML = html;
    sheet.classList.remove('hidden');
    sheet.classList.add('flex');
}

function closeSheet() {
    const sheet = document.getElementById('member-sheet');
    sheet?.classList.add('hidden');
    sheet?.classList.remove('flex');
    sheetTarget = null;
}

async function runSheetAction(act) {
    const t = sheetTarget;
    if (!t) return;
    try {
        if (act === 'identity') {
            closeSheet();
            window.dispatchEvent(new CustomEvent('room:change-identity'));
            return;
        } else if (act === 'makehost') {
            if (!await showConfirm(`Trao quyền chủ trì cho ${t.displayName || 'thành viên này'}?`)) return;
            await updateDoc(refs.session(), { hostId: t.uid, hostName: t.displayName || 'Chủ trì' });
            showToast('Đã trao quyền chủ trì.', 'success');
        } else if (act === 'cohost') {
            const has = roleOf(t) === 'cohost';
            await updateDoc(refs.session(), { cohosts: has ? arrayRemove(t.uid) : arrayUnion(t.uid) });
            showToast(has ? 'Đã bỏ quyền phó chủ trì.' : 'Đã thêm phó chủ trì.', 'success');
        } else if (act === 'lower') {
            await updateDoc(refs.member(t.uid), { hand: null });
        } else if (act === 'kick') {
            if (!await showConfirm(`Mời ${t.displayName || 'thành viên này'} ra khỏi phòng?`, { confirmText: 'Mời ra', tone: 'danger', title: 'Mời ra khỏi phòng' })) return;
            await updateDoc(refs.room(), { banned: arrayUnion(t.uid) });
            await deleteDoc(refs.member(t.uid));
            showToast('Đã mời ra khỏi phòng.', 'success');
        }
    } catch (err) {
        console.error('Lỗi thao tác thành viên:', err);
        showToast('Không thực hiện được thao tác này.', 'error');
    }
    closeSheet();
}

// ---------- Khởi tạo ----------
export function initMembers() {
    const bar = document.getElementById('reaction-bar');
    if (bar) {
        bar.innerHTML = REACTIONS.map(e =>
            `<button data-emoji="${e}" class="rm-mini" style="width:2.25rem;justify-content:center">${e}</button>`
        ).join('') + '<button id="raise-hand-btn" class="rm-mini">✋ Giơ tay</button>';
        bar.addEventListener('click', (e) => {
            const em = e.target.closest('[data-emoji]');
            if (em) return void sendReaction(em.dataset.emoji);
            if (e.target.closest('#raise-hand-btn')) toggleHand();
        });
    }

    document.getElementById('member-list')?.addEventListener('click', (e) => {
        const row = e.target.closest('.rm-member');
        const m = row && room.members.find(x => x.uid === row.dataset.uid);
        if (m) openSheet(m);
    });
    document.getElementById('hand-queue')?.addEventListener('click', (e) => {
        if (!e.target.closest('#clear-hands-btn')) return;
        room.members.filter(m => m.hand).forEach(m => updateDoc(refs.member(m.uid), { hand: null }).catch(() => {}));
    });
    const sheet = document.getElementById('member-sheet');
    sheet?.addEventListener('click', (e) => {
        if (e.target === sheet || e.target.closest('[data-close-sheet]')) return closeSheet();
        const act = e.target.closest('[data-act]');
        if (act) runSheetAction(act.dataset.act);
    });

    // Chủ trì rời phòng quá lâu -> chủ phòng tự nhận quyền để phiên không bị kẹt.
    setInterval(() => {
        if (!hasSession() || !room.isOwner || isHost()) return;
        const host = room.members.find(m => m.uid === room.session.hostId);
        if (!host || !isOnline(host)) {
            updateDoc(refs.session(), {
                hostId: uid(),
                hostName: room.user?.displayName || 'Chủ phòng',
            }).then(() => showToast('Chủ trì đã rời phòng — bạn nhận quyền điều khiển.', 'info')).catch(() => {});
        }
    }, 45000);
}
