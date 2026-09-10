// room-chat.js — bảng "Thảo luận": tin nhắn gắn theo câu đang xem (lọc "Câu N" / "Cả phòng"),
// thả tim/đồng tình cho từng ý kiến, ghim ý hay lên đầu phòng, đếm tin chưa đọc.
import { addDoc, updateDoc, onSnapshot, query, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { showToast } from '../../core/utils.js';
import { room, refs, uid, canControl, hasSession } from './room-state.js';
// Mỗi người đang ở một câu khác nhau -> gắn thẻ theo câu NGƯỜI GỬI đang xem
import { effectiveIndex } from './room-quiz-stage.js';
import { avatarHtml, escapeHtml, shortName, changed } from './room-ui.js';

let messages = [];
let unread = 0;
let scope = 'q';        // 'q' = chỉ câu đang xem | 'all' = cả phòng

export const isChatOpen = () =>
    !document.getElementById('panel-discuss')?.classList.contains('hidden') &&
    !document.getElementById('side-panel')?.classList.contains('hidden');

export function clearUnread() {
    unread = 0;
    document.getElementById('tab-chat-badge')?.classList.remove('on');
    document.getElementById('nav-chat-dot')?.classList.add('hidden');
}

/** Gửi một câu vào tab Thảo luận (dùng cho câu chào nhanh ở sảnh chờ). */
export function sendChat(text, { withQuestion = true } = {}) {
    const t = String(text || '').trim();
    if (!t) return Promise.resolve();
    return addDoc(refs.messages(), {
        type: 'chat', text: t, uid: uid(),
        displayName: room.user?.displayName || room.members.find(m => m.uid === uid())?.displayName || 'Khách',
        ...(withQuestion && hasSession() && scope === 'q' ? { qIdx: effectiveIndex() } : {}),
        createdAt: serverTimestamp(),
    }).catch(() => showToast('Không gửi được tin nhắn.', 'error'));
}

/** Thông báo hệ thống (vào phòng, mở đề, chốt đáp án…) */
export function systemMessage(text) {
    return addDoc(refs.messages(), { type: 'notice', text, createdAt: serverTimestamp() }).catch(() => {});
}

const timeOf = (m) => {
    const d = m.createdAt?.toDate?.();
    return d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';
};
// Đồng tình được lưu ở doc của từng người (messages chỉ cho tạo, không cho sửa)
const likeKey = (id) => 'm' + id;                 // tránh field path bắt đầu bằng số
const likesOf = (id) => room.members.filter(m => m.likes?.[likeKey(id)]).length;
const iLiked = (id) => !!room.members.find(m => m.uid === uid())?.likes?.[likeKey(id)];

export function renderChat() {
    const box = document.getElementById('chat-messages');
    if (!box) return;
    const qi = effectiveIndex();
    if (!changed('chat', [qi, scope, messages.map(m => [m.id, m.text, m.likes, m.pinned])])) return;
    const num = document.getElementById('chat-scope-num');
    if (num) num.textContent = hasSession() ? qi + 1 : '–';
    const list = scope === 'q' && hasSession()
        ? messages.filter(m => m.type === 'notice' || m.qIdx === qi)
        : messages;
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;

    box.innerHTML = list.map((m, idx) => {
        if (m.type === 'notice') return `<p class="rm-notice">${escapeHtml(m.text)}</p>`;
        const me = m.uid === uid();
        const prev = list[idx - 1];
        const grouped = prev && prev.uid === m.uid && prev.type !== 'notice';
        const member = room.members.find(x => x.uid === m.uid) || { uid: m.uid, displayName: m.displayName };
        const likes = likesOf(m.id);
        return `<div class="rm-msg ${me ? 'me' : ''}">
            <div class="shrink-0 w-7">${grouped ? '' : avatarHtml(member, 'sm')}</div>
            <div class="min-w-0 max-w-[80%] flex flex-col ${me ? 'items-end' : ''}">
                ${grouped ? '' : `<span class="rm-msg-meta">${escapeHtml(shortName(member.displayName || 'Khách', 16))} · ${timeOf(m)}${
                    scope === 'all' && typeof m.qIdx === 'number' ? ` · câu ${m.qIdx + 1}` : ''}</span>`}
                <div class="rm-bubble">${escapeHtml(m.text)}</div>
                <div class="flex gap-1">
                    <button data-like="${escapeHtml(m.id)}" class="rm-like ${iLiked(m.id) ? 'on' : ''}">👍 ${likes || ''}</button>
                    ${canControl() ? `<button data-pin="${escapeHtml(m.text).slice(0, 120)}" class="rm-like"><i class="fas fa-thumbtack"></i></button>` : ''}
                </div>
            </div>
        </div>`;
    }).join('') || `<p class="rm-notice py-8">${scope === 'q' ? 'Chưa ai nói gì về câu này. Nêu ý kiến trước đi!' : 'Chưa có tin nhắn nào.'}</p>`;

    if (atBottom) box.scrollTop = box.scrollHeight;
}

export function initChat() {
    const form = document.getElementById('chat-form');
    const input = document.getElementById('chat-input');

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        try {
            await addDoc(refs.messages(), {
                type: 'chat', text, uid: uid(),
                displayName: room.user?.displayName || room.members.find(m => m.uid === uid())?.displayName || 'Khách',
                ...(hasSession() && scope === 'q' ? { qIdx: effectiveIndex() } : {}),
                createdAt: serverTimestamp(),
            });
        } catch (err) {
            showToast('Không gửi được tin nhắn.', 'error');
            input.value = text;
        }
    });

    // Lọc: ý kiến về câu đang xem / cả phòng
    document.querySelector('.rm-filter')?.addEventListener('click', (e) => {
        const seg = e.target.closest('[data-scope]');
        if (!seg) return;
        scope = seg.dataset.scope;
        document.querySelectorAll('.rm-filter [data-scope]').forEach(b => b.classList.toggle('active', b === seg));
        if (input) input.placeholder = scope === 'q' ? 'Nêu ý kiến về câu này…' : 'Nhắn cho cả phòng…';
        renderChat();
    });

    document.getElementById('chat-messages')?.addEventListener('click', (e) => {
        const like = e.target.closest('[data-like]');
        if (like) {
            const id = like.dataset.like;
            return void updateDoc(refs.member(), { [`likes.${likeKey(id)}`]: !iLiked(id) }).catch(() => {});
        }
        const pin = e.target.closest('[data-pin]');
        if (pin && canControl()) {
            updateDoc(refs.session(), { pinnedNote: pin.dataset.pin })
                .then(() => showToast('Đã ghim lên đầu phòng.', 'success'))
                .catch(() => showToast('Chỉ ghim được khi đang có phiên đánh đề.', 'warning'));
        }
    });

    const q = query(refs.messages(), orderBy('createdAt', 'desc'), limit(120));
    return onSnapshot(q, (snap) => {
        const next = [];
        snap.forEach(d => next.push({ id: d.id, ...d.data() }));
        next.reverse();
        const grew = next.length - messages.length;
        messages = next;
        if (grew > 0 && !isChatOpen()) {
            unread += grew;
            const badge = document.getElementById('tab-chat-badge');
            if (badge) { badge.textContent = unread > 99 ? '99+' : unread; badge.classList.add('on'); }
            document.getElementById('nav-chat-dot')?.classList.remove('hidden');
        }
        renderChat();
        const hint = document.getElementById('chat-hint');
        if (hint) hint.textContent = hasSession() ? `${messages.filter(m => m.type !== 'notice').length} tin` : '';
    });
}
