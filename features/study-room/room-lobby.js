// room-lobby.js — SẢNH CHỜ kiểu sảnh game.
//  · Băng-rôn + THANH 3 BƯỚC ai cũng thấy như nhau: 1 Tập hợp (thanh sẵn sàng) → 2 Chọn đề
//    (tên đề chủ trì vừa chọn) → 3 Bắt đầu (giờ hẹn + đếm ngược).
//  · "Đề sắp làm": chủ trì chọn đề là cả phòng thấy ngay tên, số câu, phân bố chủ đề/mức độ
//    (doc phòng: `next`, do room-quiz.js ghi) — thay cho dòng "Đang chờ chủ trì…" trống trơn.
//  · Hẹn giờ bắt đầu (`scheduledAt`, dùng chung với khu Phòng học ở trang chủ) + đồng hồ đếm ngược.
//  · Điểm danh (`rollCall`): ai chưa sẵn sàng thấy hộp "Có mặt!" một chạm.
//  · Ghế ngồi (ghế "Mời bạn" + bong bóng cảm xúc nổi trên đầu người vừa thả), thẻ mời gọn.
//  · Trò chuyện NGAY TRONG SẢNH: tin nhắn chung + thông báo vào/ra/sẵn sàng gộp một dòng thời gian.
//  · Thẻ "Buổi trước" (doc phòng: `live`), gợi ý mục tiêu, phím tắt R / I / Enter.
import { updateDoc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { showToast } from '../../core/utils.js';
import { room, refs, uid, canControl, hasSession } from './room-state.js';
import { avatarHtml, escapeHtml, shortName, changed } from './room-ui.js';
import { isOnline, roleOf, sendReaction, openSheet } from './room-members.js';
import { sendChat, systemMessage, chatMessages } from './room-chat.js';
import { ensureConfetti, beep, haptic } from './room-boost.js';
import { safeImgUrl } from './room-media.js';

const el = (id) => document.getElementById(id);
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
const BUBBLE_MS = 4000;              // bong bóng cảm xúc nổi trên ghế bao lâu
const pad = (n) => String(n).padStart(2, '0');
const hm = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const clock = (sec) => sec >= 3600
    ? `${Math.floor(sec / 3600)}:${pad(Math.floor(sec % 3600 / 60))}:${pad(sec % 60)}`
    : `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
const inLobby = () => room.ready && !hasSession();
const me = () => room.members.find(m => m.uid === uid());
const myName = () => room.user?.displayName || me()?.displayName || 'Một bạn';
const schedAt = () => Number(room.roomDoc?.scheduledAt) || 0;

// ---------- Nhật ký cục bộ (ai rời phòng, ai vừa sẵn sàng) — gộp vào khung trò chuyện ----------
// Tin "đã vào phòng" đã có sẵn trong Firestore (systemMessage lúc vào) nên kind 'join' không hiện lại.
const joinLog = [];
export function pushLobbyLog(text, kind = 'info') {
    joinLog.push({ text, at: Date.now(), kind });
    if (joinLog.length > 30) joinLog.shift();
    renderFeed();
}

// ---------- Khung trò chuyện trong sảnh ----------
const tOf = (m) => m.createdAt?.toMillis?.() || m.createdAt?.toDate?.()?.getTime?.() || Date.now();
const fmt = (t) => escapeHtml(t)
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<i>$2</i>')
    .replace(/\n/g, '<br>');

function renderFeed() {
    const box = el('lobby-log');
    if (!box) return;
    // Sảnh chờ: tin chung (không gắn câu) + thông báo hệ thống. Tin bàn câu của buổi trước ở tab Thảo luận.
    const msgs = chatMessages().filter(m => m.type === 'notice' || typeof m.qIdx !== 'number');
    const items = [
        ...msgs.map(m => ({ at: tOf(m), m })),
        ...joinLog.filter(l => l.kind !== 'join').map(l => ({ at: l.at, l })),
    ].sort((a, b) => a.at - b.at).slice(-40);
    if (!changed('lobbyfeed', [items.map(x => x.m ? [x.m.id, x.m.text] : x.l.at), room.members.map(m => [m.uid, m.displayName, m.emoji])])) return;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    const talk = msgs.filter(m => m.type !== 'notice').length;
    const cnt = el('lobby-feed-count');
    if (cnt) cnt.textContent = talk ? `${talk} tin` : '';
    box.innerHTML = items.map(({ at, m, l }) => {
        if (l) return `<p class="rm-fd-note">${escapeHtml(l.text)} <time>${hm(at)}</time></p>`;
        if (m.type === 'notice') return `<p class="rm-fd-note">${escapeHtml(m.text)} <time>${hm(at)}</time></p>`;
        const who = room.members.find(x => x.uid === m.uid) || { uid: m.uid, displayName: m.displayName };
        const imgs = (m.images || []).map(im => safeImgUrl(im.u)).filter(Boolean);
        const body = m.type === 'doc'
            ? `📚 <b>${escapeHtml(m.title || 'Tài liệu')}</b>${m.src ? ` — ${escapeHtml(m.src)}` : ''}`
            : fmt(m.text || '');
        return `<div class="rm-fd-msg ${m.uid === uid() ? 'me' : ''}">
            ${avatarHtml(who, 'sm')}
            <div class="min-w-0">
                <p class="rm-fd-meta"><b>${escapeHtml(shortName(who.displayName || 'Khách', 14))}</b> <time>${hm(at)}</time></p>
                ${body ? `<p class="rm-fd-text">${body}</p>` : ''}
                ${imgs.length ? `<div class="rm-fd-imgs">${imgs.slice(0, 3).map(u => `<img src="${escapeHtml(u)}" alt="" loading="lazy">`).join('')}</div>` : ''}
            </div>
        </div>`;
    }).join('') || '<p class="rm-fd-empty">Chưa ai nhắn gì. Chào cả phòng một câu đi! 👋</p>';
    if (nearBottom || box.dataset.painted !== '1') box.scrollTop = box.scrollHeight;
    box.dataset.painted = '1';
}

// ---------- "Đề sắp làm" (doc phòng: next) ----------
function nextHtml(n, forHost) {
    const topics = Array.isArray(n.topics) ? n.topics : [];
    const levels = Array.isArray(n.levels) ? n.levels : [];
    const max = Math.max(1, ...topics.map(t => t.c || 0));
    return `<div class="rm-next">
        <div class="rm-next-head">
            <span class="rm-next-ic"><i class="fas fa-book-open"></i></span>
            <div class="min-w-0">
                <p class="rm-label">${forHost ? 'Cả phòng đang thấy đề này' : 'Đề sắp làm'}</p>
                <b>${escapeHtml(n.title || 'Đề trắc nghiệm')}</b>
                <span>${n.qCount || 0} câu${n.cases ? ` · ${n.cases} câu ca lâm sàng` : ''}${n.withExp ? ` · ${n.withExp} câu có giải thích sẵn` : ''}</span>
            </div>
        </div>
        ${topics.length ? `<div class="rm-next-topics">${topics.map(t => `<div class="rm-nt" title="${escapeHtml(t.n)}: ${t.c} câu">
            <span>${escapeHtml(t.n)}</span><i><b style="width:${Math.round(100 * (t.c || 0) / max)}%"></b></i><em>${t.c}</em></div>`).join('')}</div>` : ''}
        ${levels.length ? `<div class="rm-next-levels">${levels.map(l => `<span class="rm-chip">${escapeHtml(l.n)} · ${l.c}</span>`).join('')}</div>` : ''}
    </div>`;
}

// ---------- Hẹn giờ + đếm ngược ----------
let dueFiredFor = 0;
function paintSchedule() {
    const at = schedAt();
    const left = Math.round((at - Date.now()) / 1000);
    const future = at && left > 0;
    const due = at && left <= 0 && left > -1800;         // đã tới giờ (trong nửa tiếng)
    const st = el('step-start-text');
    // Điện thoại: bỏ giờ hẹn, chỉ còn "còn mm:ss" cho khỏi bị cắt chữ
    if (st) st.innerHTML = future ? `<span class="rm-hide-sm">${hm(at)} · </span>còn ${clock(left)}` : due ? 'Đến giờ rồi!' : (canControl() ? 'khi bạn bấm Bắt đầu' : 'khi chủ trì bấm');
    el('step-start')?.classList.toggle('is-due', !!due);
    const wc = el('wait-countdown');
    if (wc) wc.textContent = future ? clock(left) : due ? 'Đến giờ!' : '';
    el('sched-clear')?.classList.toggle('hidden', !at);
    const t = el('sched-time');
    if (t && document.activeElement !== t) t.value = at ? hm(at) : '';
    if (due && inLobby() && dueFiredFor !== at) {
        dueFiredFor = at;
        beep('join');
        showToast(canControl() ? 'Đến giờ hẹn rồi — bấm "Bắt đầu cho cả phòng" thôi!' : 'Đến giờ hẹn rồi — chờ chủ trì mở đề nhé!', 'info', 4000);
    }
}

function setSchedule(ms) {
    updateDoc(refs.room(), { scheduledAt: ms || null })
        .then(() => { if (ms) systemMessage(`⏰ ${myName()} hẹn bắt đầu lúc ${hm(ms)}.`); })
        .catch(() => showToast('Chưa hẹn được giờ — thử lại nhé.', 'error'));
}

// ---------- Điểm danh ----------
let rollAck = 0;
let rollShown = 0;
function paintRollcall() {
    const box = el('rollcall');
    if (!box) return;
    const rc = room.roomDoc?.rollCall;
    const show = inLobby() && rc?.at && Date.now() - rc.at < 120000 && rc.at > rollAck
        && rc.byUid !== uid() && !me()?.lobbyReady;
    box.classList.toggle('hidden', !show);
    if (show && rollShown !== rc.at) {
        rollShown = rc.at;
        el('rollcall-text').textContent = `${rc.by || 'Chủ trì'} đang điểm danh`;
        beep('join');
        haptic([12, 60, 12]);
    }
}

// ---------- Vẽ sảnh ----------
let cheered = false;                 // đã bắn pháo giấy cho lượt "cả phòng sẵn sàng" này chưa
let prevReady = null;                // uid -> sẵn sàng? (để ghi "X đã sẵn sàng" vào khung trò chuyện)
let bubbleTimer = null;

export function renderLobby() {
    const grid = el('lobby-members');
    if (!grid) return;

    const online = room.members.filter(isOnline);
    const ready = room.members.filter(m => m.lobbyReady && isOnline(m));
    const doc = room.roomDoc || {};

    // --- Ai vừa bấm sẵn sàng -> một dòng trong khung trò chuyện ---
    const nowReady = new Map(room.members.map(m => [m.uid, !!m.lobbyReady]));
    if (prevReady && inLobby()) {
        room.members.forEach(m => {
            if (nowReady.get(m.uid) && prevReady.get(m.uid) === false) pushLobbyLog(`✅ ${m.displayName || 'Một bạn'} đã sẵn sàng`);
        });
    }
    prevReady = nowReady;

    // --- Tên phòng (đặt ở trang chủ) lên băng-rôn ---
    const title = el('lobby-title');
    if (title) title.textContent = doc.title ? `${doc.emoji || ''} ${doc.title}`.trim() : 'Cùng nhau đánh đề';
    const code = el('lobby-code');
    if (code) code.textContent = room.roomId || '…';

    // --- Ghế ngồi (+ bong bóng cảm xúc vừa thả) ---
    const list = room.members.slice().sort((a, b) =>
        (isOnline(b) - isOnline(a)) || ((b.lobbyReady ? 1 : 0) - (a.lobbyReady ? 1 : 0)));
    let bubbling = false;
    const seats = list.map(m => {
        const mine = m.uid === uid();
        const role = roleOf(m);
        const bub = m.reaction?.e && Date.now() - (m.reaction.at || 0) < BUBBLE_MS;
        if (bub) bubbling = true;
        return `<div class="rm-seat ${mine ? 'is-me' : ''} ${isOnline(m) ? '' : 'rm-offline'} ${m.lobbyReady ? 'is-ready' : ''}" data-uid="${escapeHtml(m.uid)}">
            ${bub ? `<span class="rm-seat-bubble">${escapeHtml(m.reaction.e)}</span>` : ''}
            <div class="rm-seat-av">
                ${role === 'host' || role === 'owner' ? '<span class="rm-seat-crown">👑</span>' : ''}
                ${avatarHtml(m, 'lg')}
                ${m.hand ? '<span class="rm-seat-hand">✋</span>' : ''}
                <span class="rm-seat-dot" aria-hidden="true"></span>
            </div>
            <p class="rm-seat-name">${escapeHtml(shortName(m.displayName || 'Khách', 12))}${mine ? ' <span class="text-muted">(bạn)</span>' : ''}</p>
            <span class="rm-seat-state">${!isOnline(m) ? 'ngoại tuyến' : m.lobbyReady ? 'sẵn sàng ✓' : 'đang chờ…'}</span>
        </div>`;
    });
    grid.innerHTML = seats.join('');
    clearTimeout(bubbleTimer);
    if (bubbling) bubbleTimer = setTimeout(renderLobby, BUBBLE_MS + 150);

    // --- Đếm & thanh sẵn sàng ---
    const cnt = el('lobby-count');
    if (cnt) cnt.textContent = `${online.length} người`;
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

    // --- Thanh 3 bước ---
    // Chủ trì chọn đề rồi bỏ đi không bắt đầu -> "đề sắp làm" cũ quá 6 tiếng thì thôi không hiện
    const next = doc.next && doc.next.qCount && Date.now() - (doc.next.at || 0) < 6 * 3600000 ? doc.next : null;
    const done1 = online.length > 0 && ready.length === online.length;
    const done2 = !!next;
    const cur = !done1 ? 1 : !done2 ? 2 : 3;
    [['step-gather', done1, 1], ['step-quiz', done2, 2], ['step-start', false, 3]].forEach(([id, done, n]) => {
        const s = el(id);
        if (!s) return;
        s.classList.toggle('is-done', done);
        s.classList.toggle('is-now', n === cur);
    });
    const sq = el('step-quiz-text');
    if (sq) sq.textContent = next ? `${next.title} · ${next.qCount} câu` : (canControl() ? 'Bạn chọn đề ở khối bên dưới' : 'Chủ trì đang chọn…');

    // --- Nút "Tôi sẵn sàng" ---
    const btn = el('lobby-ready-btn');
    if (btn) {
        const my = me();
        btn.classList.toggle('is-off', !!my?.lobbyReady);
        btn.innerHTML = my?.lobbyReady
            ? '<i class="fas fa-check"></i>Đã sẵn sàng'
            : '<i class="fas fa-hand-sparkles"></i>Tôi sẵn sàng';
    }

    // --- Đề sắp làm: thẻ chờ (thành viên) + xem trước trong khối chủ trì ---
    const np = el('next-preview');
    if (np) {
        np.classList.toggle('hidden', !next);
        np.innerHTML = next ? nextHtml(next, false) : '';
    }
    const dp = el('draft-preview');
    if (dp) {
        dp.classList.toggle('hidden', !next || !canControl());
        dp.innerHTML = next && canControl() ? nextHtml(next, true) : '';
    }
    const wt = el('wait-title');
    if (wt) wt.innerHTML = next
        ? `Chủ trì đã chọn đề — sắp bắt đầu!${schedAt() > Date.now() ? ' <span id="wait-countdown" class="rm-wait-cd"></span>' : ''}`
        : 'Đang chờ chủ trì chọn đề…';
    const ws = el('wait-sub');
    if (ws) ws.textContent = next
        ? (me()?.lobbyReady ? 'Bạn đã sẵn sàng. Lướt qua các chủ đề bên dưới để khởi động đầu óc nhé:' : 'Bấm "Tôi sẵn sàng" (phím R) để chủ trì biết bạn đã vào vị trí.')
        : 'Trong lúc chờ, làm gì đó cho vui nhé:';
    const wi = document.querySelector('#lobby-waiting .rm-wait-ic');
    if (wi) wi.textContent = next ? '🚀' : '⏳';

    // --- Gợi ý cho chủ trì ngay cạnh nút bắt đầu ---
    const hint = el('start-ready-hint');
    if (hint && canControl()) {
        const disabled = el('start-quiz-collaboration-btn')?.disabled;
        const roll = doc.rollCall?.at && Date.now() - doc.rollCall.at < 600000 ? ` · điểm danh lúc ${hm(doc.rollCall.at)}` : '';
        hint.textContent = (disabled ? 'Chọn đề để mở nút bắt đầu.'
            : allReady ? `Cả ${online.length} bạn đã sẵn sàng — mở đề thôi!`
            : `${ready.length}/${online.length} bạn đã sẵn sàng.`) + roll;
        hint.classList.toggle('is-go', !disabled && allReady);
        el('start-quiz-collaboration-btn')?.classList.toggle('is-hot', !disabled && (allReady || (schedAt() && schedAt() <= Date.now())));
    }

    // --- Buổi trước ---
    const recap = el('lobby-recap');
    const live = doc.live;
    if (recap) {
        const show = !!(live?.ended && live.title);
        recap.classList.toggle('hidden', !show);
        if (show && changed('recap', [live, canControl()])) {
            const when = live.endedAt ? new Date(live.endedAt) : null;
            recap.innerHTML = `<span class="rm-recap-ic">🗂️</span>
                <div class="min-w-0 flex-1">
                    <p class="rm-label">Buổi trước của phòng</p>
                    <b>${escapeHtml(live.title)}</b>
                    <span>${live.qCount || 0} câu${live.people ? ` · ${live.people} người làm` : ''}${typeof live.avg === 'number' ? ` · đúng TB <b class="${live.avg < 50 ? 'is-low' : 'is-ok'}">${live.avg}%</b>` : ''}${when ? ` · ${pad(when.getDate())}/${pad(when.getMonth() + 1)} ${hm(live.endedAt)}` : ''}</span>
                </div>
                ${canControl() && live.sourceQuizId ? `<button type="button" class="rm-ghost-btn" data-recap-pick="${escapeHtml(live.sourceQuizId)}"><i class="fas fa-rotate-left"></i>Làm lại đề này</button>` : ''}`;
        }
    }

    paintSchedule();
    paintRollcall();
    renderFeed();
}

// ---------- Khởi tạo ----------
export function initLobby() {
    // Băng cảm xúc: bấm là emoji bay lên cho cả phòng thấy (+ nổi trên ghế của mình)
    const bar = el('lobby-emoji');
    if (bar) {
        bar.innerHTML = LOBBY_EMOJIS.map(e => `<button class="rm-emoji-btn" data-emoji="${e}">${e}</button>`).join('');
        bar.addEventListener('click', (e) => {
            const b = e.target.closest('[data-emoji]');
            if (b) sendReaction(b.dataset.emoji);
        });
    }

    // Câu chào nhanh -> gửi thẳng vào khung trò chuyện
    const quick = el('lobby-quick');
    if (quick) {
        quick.innerHTML = QUICK_LINES.map(t => `<button class="rm-quick" data-say="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('');
        quick.addEventListener('click', (e) => {
            const b = e.target.closest('[data-say]');
            if (b) sendChat(b.dataset.say, { withQuestion: false });
        });
    }

    // Cảm xúc + câu chào nằm trên MỘT hàng cuộn ngang -> lăn chuột dọc cũng cuộn được
    document.querySelector('.rm-lobby-bars')?.addEventListener('wheel', (e) => {
        const t = e.currentTarget;
        if (t.scrollWidth <= t.clientWidth || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
        e.preventDefault();
        t.scrollLeft += e.deltaY;
    }, { passive: false });

    // Nhắn ngay trong sảnh
    el('lobby-chat-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = el('lobby-chat-input');
        const t = input.value.trim();
        if (!t) return;
        input.value = '';
        sendChat(t, { withQuestion: false });
    });
    window.addEventListener('room:chat', renderFeed);

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

    const toggleReady = () => {
        const my = me();
        updateDoc(refs.member(), { lobbyReady: !my?.lobbyReady }).catch(() => {});
        if (!my?.lobbyReady) { beep('tap'); haptic(10); }
    };
    el('lobby-ready-btn')?.addEventListener('click', toggleReady);

    // Ghế: bấm người -> bảng thao tác, bấm ghế trống -> hộp mời
    el('lobby-members')?.addEventListener('click', (e) => {
        const seat = e.target.closest('[data-uid]');
        const m = seat && room.members.find(x => x.uid === seat.dataset.uid);
        if (m) openSheet(m);
    });
    el('lobby-qr-btn')?.addEventListener('click', () => el('share-room-btn')?.click());
    el('lobby-copy-link')?.addEventListener('click', () => {
        navigator.clipboard.writeText(location.href)
            .then(() => showToast('Đã chép link phòng — gửi cho bạn bè thôi!', 'success'))
            .catch(() => showToast('Không chép được, bấm QR để mời nhé.', 'warning'));
    });

    // Thẻ chờ chủ trì: mấy việc cho đỡ chán
    el('lobby-waiting')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-wait]');
        if (!b) return;
        const act = b.dataset.wait;
        if (act === 'board') document.querySelector('#stage-tabs [data-stage="board"]')?.click();
        else if (act === 'chat') el('lobby-chat-input')?.focus();
        else if (act === 'poke') {
            systemMessage(`${myName()} hối chủ trì mở đề rồi kìa! 🔔`);
            showToast('Đã nhắc chủ trì!', 'success', 1600);
        }
    });

    // Hẹn giờ bắt đầu (chủ trì)
    el('sched-row')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-sched]');
        if (!b) return;
        const n = Number(b.dataset.sched);
        setSchedule(n ? Date.now() + n * 60000 : 0);
    });
    el('sched-time')?.addEventListener('change', (e) => {
        const [h, m] = String(e.target.value || '').split(':').map(Number);
        if (isNaN(h) || isNaN(m)) return;
        const d = new Date();
        d.setHours(h, m, 0, 0);
        if (d.getTime() < Date.now() - 60000) d.setDate(d.getDate() + 1);   // giờ đã qua -> ngày mai
        setSchedule(d.getTime());
    });

    // Điểm danh
    el('rollcall-btn')?.addEventListener('click', () => {
        updateDoc(refs.room(), { rollCall: { at: Date.now(), by: myName(), byUid: uid() } })
            .then(() => {
                systemMessage(`🔔 ${myName()} điểm danh — ai có mặt bấm "Có mặt" nhé!`);
                showToast('Đã điểm danh — ai chưa sẵn sàng sẽ thấy hộp "Có mặt!".', 'success', 2600);
            }).catch(() => {});
    });
    el('rollcall-yes')?.addEventListener('click', () => {
        rollAck = room.roomDoc?.rollCall?.at || Date.now();
        el('rollcall')?.classList.add('hidden');
        updateDoc(refs.member(), { lobbyReady: true }).catch(() => {});
        sendReaction('🙋');
    });
    el('rollcall-x')?.addEventListener('click', () => {
        rollAck = room.roomDoc?.rollCall?.at || Date.now();
        el('rollcall')?.classList.add('hidden');
    });

    // Thẻ buổi trước: chủ trì mở lại đúng đề đó
    el('lobby-recap')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-recap-pick]');
        if (b) window.dispatchEvent(new CustomEvent('room:pick-quiz', { detail: b.dataset.recapPick }));
    });

    // Phím tắt sảnh: R sẵn sàng · I mời · Enter (chủ trì) bắt đầu
    document.addEventListener('keydown', (e) => {
        if (!inLobby() || e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
        if (document.querySelector('.rm-modal:not(.hidden)')) return;
        const k = e.key.toLowerCase();
        if (k === 'r') toggleReady();
        else if (k === 'i') el('share-room-btn')?.click();
        else if (e.key === 'Enter' && canControl()) {
            const start = el('start-quiz-collaboration-btn');
            if (start && !start.disabled) { e.preventDefault(); start.click(); }
        }
    });

    // Đồng hồ đếm ngược + hết hạn điểm danh: chỉ chạy khi đang ở sảnh
    setInterval(() => {
        if (!inLobby() || document.hidden) return;
        paintSchedule();
        paintRollcall();
    }, 1000);
}
