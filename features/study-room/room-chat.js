// room-chat.js — bảng "Chat": chat CẢ PHÒNG + "Tài liệu", đồng tình 👍, ghim ý hay, đếm tin chưa đọc.
// Tin GẮN VỚI MỘT CÂU (qIdx) không còn tab "Câu N" riêng ở đây (từng là hệ bàn luận thứ hai song song
// với khối "Đáp án & bàn luận"): chúng hiện ngay trong luồng nhận xét của khối đó — chatCmtHtml() —
// và khối đó có nút 🖼 / 📚 gửi ảnh, tài liệu vào câu (sendQuestionMessage, nút #chat-doc-btn).
//
// Bản nâng cấp bàn bạc (2026-09-23):
//  · Ô soạn nhiều dòng (Enter gửi, Shift+Enter xuống dòng), **đậm** *nghiêng* `mã` $công thức$, link tự bấm được.
//  · ẢNH: Ctrl+V ảnh trong bộ nhớ tạm, kéo thả, hoặc nút 🖼 — ảnh được nén rồi đẩy lên host ngoài
//    (room-media.js), tin nhắn chỉ giữ link -> Firestore nhẹ.
//  · TÀI LIỆU: tin kiểu 'doc' {title, src, link, text, images} = thẻ trích dẫn sách / bài giảng / link.
//  · Trả lời một tin (reply), thẻ "chọn B" cho biết người nói đang đứng ở phương án nào (ans).
//  · Một chạm đưa ý kiến / tài liệu vào GIẢI THÍCH CHUNG của câu hoặc GHI CHÚ RIÊNG của mình.
import { addDoc, updateDoc, onSnapshot, query, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { showToast } from '../../core/utils.js';
import { renderMath } from '../quiz/quiz-helpers.js';
import { room, refs, uid, canControl, hasSession, myMember, answerOf, chosenOf, noteOf, questionAt, isAccepted } from './room-state.js';
// Mỗi người đang ở một câu khác nhau -> gắn thẻ theo câu NGƯỜI GỬI đang xem
import { effectiveIndex, renderQuiz } from './room-quiz-stage.js';
import { avatarHtml, escapeHtml, shortName, changed, agoText } from './room-ui.js';
import { uploadImage, imageFilesOf, safeImgUrl, warnIfTemp } from './room-media.js';
import { sanitizeHtml, renderRich } from './room-editor.js';
import { getNote, setNote } from './room-study.js';

let messages = [];
let unread = 0;
let scope = 'all';      // 'all' = cả phòng | 'doc' = tài liệu & ảnh (tin theo câu: xem khối đáp án)
let replyTo = null;     // tin đang được trả lời
const MAX_IMAGES = 4;   // mỗi tin tối đa 4 ảnh (ảnh nhúng dự phòng còn ≤160KB/tấm -> dưới 1MB/tin)
const L = (k) => String.fromCharCode(65 + k);
const el = (id) => document.getElementById(id);
const myName = () => room.user?.displayName || myMember()?.displayName || 'Khách';

export const isChatOpen = () =>
    !document.getElementById('panel-discuss')?.classList.contains('hidden') &&
    !document.getElementById('side-panel')?.classList.contains('hidden') &&
    // bảng bên đang thu thành thanh ray (máy tính) thì coi như đóng -> vẫn đếm tin chưa đọc
    !(document.body.classList.contains('side-rail') && window.matchMedia('(min-width: 768px)').matches);

export function clearUnread() {
    unread = 0;
    document.getElementById('tab-chat-badge')?.classList.remove('on');
    document.getElementById('nav-chat-dot')?.classList.add('hidden');
}

/** Toàn bộ tin đã nạp (120 tin gần nhất) — biên bản tự tải đủ bằng getDocs. */
export const chatMessages = () => messages;
/** Số ý kiến (không tính thông báo hệ thống) đang gắn với câu i. */
export const chatCountFor = (i) => messages.filter(m => m.type !== 'notice' && m.qIdx === i).length;

/** Gửi một câu vào tab Thảo luận (dùng cho câu chào nhanh ở sảnh chờ). */
export function sendChat(text, { withQuestion = true } = {}) {
    const t = String(text || '').trim();
    if (!t) return Promise.resolve();
    return addDoc(refs.messages(), {
        type: 'chat', text: t, uid: uid(), displayName: myName(),
        ...(withQuestion && hasSession() && scope !== 'all' ? { qIdx: effectiveIndex() } : {}),
        createdAt: serverTimestamp(),
    }).catch(() => showToast('Không gửi được tin nhắn.', 'error'));
}

/** Gửi một tin GẮN CÂU i (ảnh / chữ) — từ luồng nhận xét của khối "Đáp án & bàn luận". */
export function sendQuestionMessage(i, text, images = [], reply = null) {
    const my = answerOf(myMember(), i);
    return addDoc(refs.messages(), {
        type: 'chat', text: String(text || '').slice(0, 2000), uid: uid(), displayName: myName(), qIdx: i,
        ...(my && typeof my.i === 'number' ? { ans: my.i } : {}),
        ...(images.length ? { images } : {}),
        ...(reply ? { reply: { id: reply.id, name: reply.name, text: String(reply.text || '').slice(0, 140) } } : {}),
        createdAt: serverTimestamp(),
    });
}

/** Tin chat / tài liệu đang gắn với câu i (không tính thông báo hệ thống). */
export const questionMsgs = (i) => messages.filter(m => m.type !== 'notice' && m.qIdx === i);
/** Chữ ký để khối đáp án biết lúc nào phải vẽ lại luồng (tin mới, sửa, 👍). */
export const questionMsgsSig = (i) => questionMsgs(i).map(m => [m.id, m.text, m.title, (m.images || []).length, likesOf(m.id), iLiked(m.id)]);
/** Mốc thời gian (ms) của một tin — để trộn với nhận xét theo thứ tự thời gian. */
export const msgTime = (m) => m.createdAt?.toMillis?.() ?? (m.createdAt?.seconds ? m.createdAt.seconds * 1000 : Date.now());

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

// ---------- Định dạng chữ: THOÁT HTML trước rồi mới thêm vài cú pháp an toàn ----------
const safeLink = (u) => /^https?:\/\/[^\s"'<>]+$/i.test(u || '') ? u : '';
const shortUrl = (u) => String(u).replace(/^https?:\/\/(www\.)?/, '').slice(0, 42) + (String(u).length > 50 ? '…' : '');
function fmtBasic(text) {
    return escapeHtml(text)
        .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
        .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<i>$2</i>')
        .replace(/`([^`\n]+)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
}
function fmt(text) {
    return fmtBasic(text)
        .replace(/(^|<br>)&gt; ?([^<]*)/g, '$1<span class="rm-quote-line">$2</span>')
        .replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (u) => {
            const raw = u.replace(/&amp;/g, '&');
            return `<a href="${u}" target="_blank" rel="noopener noreferrer">${escapeHtml(shortUrl(raw))}</a>`;
        });
}
const imagesHtml = (list) => {
    const imgs = (list || []).map(im => ({ ...im, u: safeImgUrl(im.u) })).filter(im => im.u);
    if (!imgs.length) return '';
    return `<div class="rm-mimgs n${Math.min(imgs.length, 4)}">${imgs.map(im => `<span class="rm-mimg">
        <img src="${escapeHtml(im.u)}" alt="Ảnh thảo luận" loading="lazy" decoding="async">
        ${im.t ? '<em title="Host chính lỗi lúc tải — ảnh chỉ giữ 72 giờ">tạm 72h</em>' : ''}</span>`).join('')}</div>`;
};

/** Nội dung một tin, dạng HTML đã lọc — để đưa vào giải thích chung / ghi chú riêng. */
function msgToHtml(m) {
    const parts = [];
    const who = escapeHtml(m.displayName || 'Khách');
    if (m.type === 'doc') {
        parts.push(`<p>📚 <b>${escapeHtml(m.title || 'Tài liệu')}</b>${m.src ? ' — ' + escapeHtml(m.src) : ''} <i>(${who} chia sẻ)</i></p>`);
        if (m.text) parts.push(`<p><i>${fmtBasic(m.text)}</i></p>`);
        if (safeLink(m.link)) parts.push(`<p><a href="${escapeHtml(m.link)}">${escapeHtml(shortUrl(m.link))}</a></p>`);
    } else if (m.text) {
        parts.push(`<p><b>${who}:</b> ${fmtBasic(m.text)}</p>`);
    }
    (m.images || []).forEach(im => { const u = safeImgUrl(im.u); if (u) parts.push(`<p><img src="${escapeHtml(u)}"></p>`); });
    return parts.join('');
}

// ---------- Vẽ ----------
/** Một tin gắn câu, vẽ đúng kiểu dòng nhận xét (.rm-cmt) để trộn vào luồng của khối đáp án.
 *  cls/acts: lớp + nút thêm của luồng (mới, ↩ trả lời, ✅); nested: đã lồng dưới tin gốc -> bỏ dòng trích "↩". */
export function chatCmtHtml(m, { cls = '', acts = '', nested = false } = {}) {
    const member = room.members.find(x => x.uid === m.uid) || { uid: m.uid, displayName: m.displayName };
    const id = escapeHtml(m.id);
    const likes = likesOf(m.id);
    const doc = m.type === 'doc';
    const name = escapeHtml(shortName(member.displayName || m.displayName || 'Khách', 16));
    const docBody = doc ? `<div class="rm-cmt-doc"><b>${escapeHtml(m.title || 'Tài liệu')}</b>${m.src ? ` · <span>${escapeHtml(m.src)}</span>` : ''}
        ${m.text ? `<div class="rm-cmt-q">${fmt(m.text)}</div>` : ''}
        ${safeLink(m.link) ? `<a class="rm-doc-link" href="${escapeHtml(m.link)}" target="_blank" rel="noopener noreferrer"><i class="fas fa-link"></i>${escapeHtml(shortUrl(m.link))}</a>` : ''}</div>` : '';
    // Bong bóng chat (bản 26): mặt người + huy hiệu loại ở góc, tên · thời gian trên đầu bong bóng
    return `<li class="rm-cmt is-${doc ? 'src' : 'cmt'} is-chat ${cls}" data-mid="${id}">
        <span class="rm-cmt-av">${avatarHtml(member, 'xs')}<i class="rm-cmt-st" title="${doc ? 'tài liệu' : 'ý kiến'}">${doc ? '📚' : '💬'}</i></span>
        <div class="rm-cmt-body min-w-0 flex-1">
            ${m.reply && !nested ? `<div class="rm-cmt-q">↩ <b>${escapeHtml(shortName(m.reply.name || 'Khách', 14))}</b>: ${escapeHtml(String(m.reply.text || '').slice(0, 90))}</div>` : ''}
            <p class="rm-cmt-head"><b>${name}</b>${typeof m.ans === 'number' ? ` <em class="rm-st">chọn ${L(m.ans)}</em>` : ''}${doc ? ' <em class="rm-st is-src">📚 tài liệu</em>' : ''}${likes ? `<span class="rm-cmt-n">👍 ${likes}</span>` : ''}<time class="rm-cmt-time">${agoText(msgTime(m))}</time></p>
            ${!doc && m.text ? `<p class="rm-cmt-t">${fmt(m.text)}</p>` : ''}
            ${docBody}
            ${imagesHtml(m.images)}
        </div>
        <div class="rm-cmt-acts">
            <button type="button" data-like="${id}" class="rm-like ${iLiked(m.id) ? 'on' : ''} ${likes ? 'has-n' : ''}" title="Đồng tình">👍${likes ? ' ' + likes : ''}</button>
            ${acts}
            <button type="button" data-toexp="${id}" class="rm-like" title="Đưa vào giải thích chung (ghi tên người viết)"><i class="fas fa-lightbulb"></i></button>
        </div>
    </li>`;
}

/** Thao tác trên một tin (👍 · đưa vào giải thích · lưu ghi chú) — dùng chung cho bảng Chat lẫn khối đáp án. */
export function chatMsgAction(e) {
    const byId = (id) => messages.find(x => x.id === id);
    const like = e.target.closest('[data-like]');
    if (like) {
        const id = like.dataset.like;
        updateDoc(refs.member(), { [`likes.${likeKey(id)}`]: !iLiked(id) }).catch(() => {});
        return true;
    }
    const ex = e.target.closest('[data-toexp]');
    if (ex) { const m = byId(ex.dataset.toexp); if (m) toExplain(m); return true; }
    const nt = e.target.closest('[data-tonote]');
    if (nt) { const m = byId(nt.dataset.tonote); if (m) toMyNote(m); return true; }
    return false;
}

function msgHtml(m, prev) {
    if (m.type === 'notice') return `<p class="rm-notice">${escapeHtml(m.text)}</p>`;
    const me = m.uid === uid();
    const grouped = prev && prev.uid === m.uid && prev.type !== 'notice' && !m.reply && m.type !== 'doc';
    const member = room.members.find(x => x.uid === m.uid) || { uid: m.uid, displayName: m.displayName };
    const likes = likesOf(m.id);
    const q = typeof m.qIdx === 'number' ? m.qIdx : null;
    const chosen = q !== null ? chosenOf(q) : null;
    const stance = typeof m.ans === 'number'
        ? `<span class="rm-stance ${chosen !== null ? (isAccepted(q, m.ans) ? 'is-ok' : 'is-off') : ''}" title="Lúc nói, người này đang chọn ${L(m.ans)}">chọn ${L(m.ans)}</span>` : '';
    const reply = m.reply ? `<button type="button" class="rm-replyq" data-goto="${escapeHtml(m.reply.id || '')}">
        <b>${escapeHtml(shortName(m.reply.name || 'Khách', 14))}</b><span>${escapeHtml(String(m.reply.text || '').slice(0, 90))}</span></button>` : '';
    const body = m.type === 'doc'
        ? `<div class="rm-doc">
            <div class="rm-doc-head"><i class="fas fa-book-medical"></i>
                <div class="min-w-0"><b>${escapeHtml(m.title || 'Tài liệu')}</b>${m.src ? `<span>${escapeHtml(m.src)}</span>` : ''}</div></div>
            ${m.text ? `<div class="rm-doc-quote">${fmt(m.text)}</div>` : ''}
            ${imagesHtml(m.images)}
            ${safeLink(m.link) ? `<a class="rm-doc-link" href="${escapeHtml(m.link)}" target="_blank" rel="noopener noreferrer"><i class="fas fa-link"></i>${escapeHtml(shortUrl(m.link))}</a>` : ''}
           </div>`
        : `<div class="rm-bubble">${m.text ? `<div class="rm-btext">${fmt(m.text)}</div>` : ''}${imagesHtml(m.images)}</div>`;
    const canUse = hasSession() && m.type !== 'notice';
    return `<div class="rm-msg ${me ? 'me' : ''} ${grouped ? 'is-grouped' : ''}" data-mid="${escapeHtml(m.id)}">
        <div class="shrink-0 w-7">${grouped ? '' : avatarHtml(member, 'sm')}</div>
        <div class="rm-msg-body ${me ? 'items-end' : ''}">
            ${grouped ? '' : `<span class="rm-msg-meta">${escapeHtml(shortName(member.displayName || 'Khách', 16))} · ${timeOf(m)}${
                q !== null ? ` · <button type="button" class="rm-qlink" data-goq="${q}">câu ${q + 1}</button>` : ''} ${stance}</span>`}
            ${reply}
            ${body}
            <div class="rm-msg-acts ${likes ? 'has-likes' : ''}">
                <button type="button" data-like="${escapeHtml(m.id)}" class="rm-like ${iLiked(m.id) ? 'on' : ''}" title="Đồng tình">👍 ${likes || ''}</button>
                <button type="button" data-reply="${escapeHtml(m.id)}" class="rm-like" title="Trả lời tin này"><i class="fas fa-reply"></i></button>
                ${canUse ? `<button type="button" data-toexp="${escapeHtml(m.id)}" class="rm-like" title="Đưa vào GIẢI THÍCH CHUNG của câu (cả nhóm thấy)"><i class="fas fa-lightbulb"></i></button>
                <button type="button" data-tonote="${escapeHtml(m.id)}" class="rm-like" title="Lưu vào GHI CHÚ RIÊNG của bạn"><i class="fas fa-bookmark"></i></button>` : ''}
                ${canControl() && m.type !== 'doc' && m.text ? `<button type="button" data-pin="${escapeHtml(m.id)}" class="rm-like" title="Ghim lên đầu phòng"><i class="fas fa-thumbtack"></i></button>` : ''}
            </div>
        </div>
    </div>`;
}

export function renderChat() {
    const box = document.getElementById('chat-messages');
    if (!box) return;
    const qi = effectiveIndex();
    if (!changed('chat', [qi, scope, canControl(), hasSession(), room.session?.chosen, room.session?.alsoOk,
        messages.map(m => [m.id, m.text, m.images, m.reply, m.title, m.ans]),
        room.members.map(x => [x.uid, x.likes, x.displayName, x.emoji])])) return;
    const list = scope === 'doc'
        ? messages.filter(m => m.type === 'doc' || (m.images || []).length)
        : messages;
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;

    box.innerHTML = list.map((m, idx) => msgHtml(m, list[idx - 1])).join('')
        || `<div class="rm-chat-empty">${scope === 'doc'
            ? '<i class="fas fa-book-medical"></i><p>Chưa ai chia sẻ tài liệu hay ảnh.</p><span>Bấm 📚 để trích sách / bài giảng, hoặc Ctrl+V dán ảnh chụp trang sách.</span>'
            : '<i class="fas fa-comments"></i><p>Chưa có tin nhắn nào.</p><span>Bàn riêng từng câu thì gõ ngay dưới câu đó (khối "Đáp án & bàn luận").</span>'}</div>`;
    renderMath(box);
    if (atBottom) box.scrollTop = box.scrollHeight;
}

// ---------- Khay ảnh đang đính (dùng cho ô soạn và hộp tài liệu) ----------
function makeTray(host) {
    let items = [];
    const paint = () => {
        host.classList.toggle('hidden', !items.length);
        host.innerHTML = items.map((it, k) => `<div class="rm-att ${it.status === 'up' ? 'is-up' : ''} ${it.status === 'err' ? 'is-err' : ''}">
            <img src="${it.preview}" alt="">
            ${it.status === 'up' ? `<span class="rm-att-bar"><i style="width:${Math.round(it.pct * 100)}%"></i></span>` : ''}
            ${it.status === 'err' ? '<span class="rm-att-err">lỗi</span>' : ''}
            ${it.res?.t ? '<span class="rm-att-err">tạm 72h</span>' : ''}
            <button type="button" data-att-x="${k}" title="Bỏ ảnh"><i class="fas fa-times"></i></button>
        </div>`).join('');
    };
    host.addEventListener('click', (e) => {
        const x = e.target.closest('[data-att-x]');
        if (!x) return;
        const it = items[+x.dataset.attX];
        if (it) URL.revokeObjectURL(it.preview);
        items.splice(+x.dataset.attX, 1);
        paint();
    });
    return {
        add(files) {
            const room_ = MAX_IMAGES - items.length;
            if (room_ <= 0) return showToast(`Mỗi tin tối đa ${MAX_IMAGES} ảnh.`, 'warning');
            [...files].slice(0, room_).forEach(file => {
                const it = { preview: URL.createObjectURL(file), status: 'up', pct: 0, res: null };
                it.done = uploadImage(file, (x) => { it.pct = x; paint(); })
                    .then(res => { it.res = res; it.status = 'ok'; warnIfTemp(res); })
                    .catch(() => { it.status = 'err'; showToast('Một ảnh tải lên không được — bấm × bỏ nó rồi thử lại.', 'error'); })
                    .finally(paint);
                items.push(it);
            });
            paint();
        },
        busy: () => items.some(it => it.status === 'up'),
        wait: () => Promise.all(items.map(it => it.done)),
        images: () => items.filter(it => it.status === 'ok' && it.res).map(it => it.res),
        clear() { items.forEach(it => URL.revokeObjectURL(it.preview)); items = []; paint(); },
    };
}

// ---------- Đưa ý kiến vào giải thích / ghi chú ----------
function targetIndex(m) { return typeof m.qIdx === 'number' ? m.qIdx : effectiveIndex(); }

/** Nối một đoạn HTML vào GIẢI THÍCH CHUNG của câu i (dùng cả ở bàn tròn, bài tự luận). */
export async function appendToExplain(i, html) {
    const cur = noteOf(i);
    const next = sanitizeHtml((cur ? renderRich(cur) : '') + html);
    await updateDoc(refs.session(), {
        [`notes.q${i}`]: next,
        [`notesBy.q${i}`]: { name: myName(), at: Date.now() },
    });
}

async function toExplain(m) {
    if (!hasSession()) return;
    const i = targetIndex(m);
    try {
        await appendToExplain(i, msgToHtml(m));
        showToast(`Đã đưa vào giải thích chung của câu ${i + 1}.`, 'success');
    } catch (e) { showToast('Chưa đưa vào được — thử lại nhé.', 'error'); }
}

function toMyNote(m) {
    if (!hasSession()) return;
    const i = targetIndex(m);
    const q = questionAt(i);
    if (!q?.question) return;
    const cur = getNote(q.question);
    setNote(q.question, sanitizeHtml((cur ? renderRich(cur) : '') + msgToHtml(m)));
    renderQuiz();
    showToast(`Đã lưu vào ghi chú riêng của câu ${i + 1}.`, 'success');
}

/** Mở bảng Chat cả phòng (bàn riêng từng câu nay nằm ngay trong khối đáp án của câu đó). */
export function openDiscussion() {
    setScope('all');
    const phone = window.matchMedia('(max-width: 767px)').matches;
    // Điện thoại: nút dock "Bàn luận" nay dẫn tới Bàn tròn trong đề -> mở khay chat qua sự kiện riêng
    if (phone) window.dispatchEvent(new Event('room:chat-sheet'));
    else {
        window.dispatchEvent(new CustomEvent('room:panel', { detail: 'discuss' }));
        setTimeout(() => el('chat-input')?.focus(), 80);
    }
}

function setScope(next) {
    scope = next;
    document.querySelectorAll('.rm-filter [data-scope]').forEach(b => b.classList.toggle('active', b.dataset.scope === scope));
    const input = el('chat-input');
    if (input) input.placeholder = 'Nhắn cho cả phòng…';
    renderChat();
}

function paintReply() {
    const bar = el('chat-reply');
    if (!bar) return;
    bar.classList.toggle('hidden', !replyTo);
    bar.innerHTML = replyTo ? `<i class="fas fa-reply"></i><span>Trả lời <b>${escapeHtml(shortName(replyTo.name, 14))}</b>: ${escapeHtml(replyTo.text.slice(0, 70))}</span>
        <button type="button" data-reply-x title="Bỏ trả lời"><i class="fas fa-times"></i></button>` : '';
}

const autoGrow = (t) => { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 150) + 'px'; };

// ---------- Hộp "Trích dẫn tài liệu" ----------
function initDocModal() {
    const modal = el('doc-modal');
    const form = el('doc-form');
    if (!modal || !form) return;
    const tray = makeTray(el('doc-attach'));
    const close = () => { modal.classList.add('hidden'); };
    const open = () => {
        el('doc-target').textContent = hasSession() ? `câu ${effectiveIndex() + 1}` : 'cả phòng';
        el('doc-explain-row')?.classList.toggle('hidden', !hasSession());
        modal.classList.remove('hidden');
        setTimeout(() => el('doc-title')?.focus(), 60);
    };
    el('chat-doc-btn')?.addEventListener('click', open);
    modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.closest('[data-close-doc]')) close();
    });
    el('doc-img-btn')?.addEventListener('click', () => el('doc-file')?.click());
    el('doc-file')?.addEventListener('change', (e) => { tray.add(e.target.files); e.target.value = ''; });
    form.addEventListener('paste', (e) => {
        const imgs = imageFilesOf(e.clipboardData);
        if (!imgs.length || e.clipboardData.getData('text/plain').trim()) return;
        e.preventDefault();
        tray.add(imgs);
    });
    form.addEventListener('dragover', (e) => e.preventDefault());
    form.addEventListener('drop', (e) => {
        const imgs = imageFilesOf(e.dataTransfer);
        if (!imgs.length) return;
        e.preventDefault();
        tray.add(imgs);
    });
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = el('doc-title').value.trim();
        const text = el('doc-text').value.trim();
        const link = el('doc-link').value.trim();
        if (!title) return showToast('Ghi tên tài liệu trước đã.', 'warning');
        if (link && !safeLink(link)) return showToast('Link phải bắt đầu bằng http:// hoặc https://', 'warning');
        const btn = form.querySelector('[type="submit"]');
        btn.disabled = true;
        try {
            if (tray.busy()) { showToast('Đợi ảnh tải xong…', 'info', 1500); await tray.wait(); }
            const msg = {
                type: 'doc', title: title.slice(0, 160), src: el('doc-src').value.trim().slice(0, 160),
                link: link.slice(0, 500), text: text.slice(0, 3000), uid: uid(), displayName: myName(),
                ...(tray.images().length ? { images: tray.images() } : {}),
                ...(hasSession() ? { qIdx: effectiveIndex() } : {}),
                createdAt: serverTimestamp(),
            };
            await addDoc(refs.messages(), msg);
            if (el('doc-to-explain')?.checked && hasSession()) await appendToExplain(effectiveIndex(), msgToHtml(msg)).catch(() => {});
            ['doc-title', 'doc-src', 'doc-link', 'doc-text'].forEach(id => { el(id).value = ''; });
            tray.clear();
            close();
            showToast('Đã chia sẻ tài liệu với cả nhóm.', 'success');
        } catch (err) {
            showToast('Không gửi được tài liệu.', 'error');
        } finally { btn.disabled = false; }
    });
}

export function initChat() {
    const form = document.getElementById('chat-form');
    const input = document.getElementById('chat-input');
    const tray = makeTray(el('chat-attach'));
    let sending = false;

    async function send() {
        if (sending) return;
        const text = input.value.trim();
        if (!text && !tray.images().length && !tray.busy()) return;
        sending = true;
        try {
            if (tray.busy()) { showToast('Đợi ảnh tải xong rồi gửi…', 'info', 1500); await tray.wait(); }
            const images = tray.images();
            if (!text && !images.length) return;
            const qi = hasSession() && scope !== 'all' ? effectiveIndex() : null;
            const my = qi !== null ? answerOf(myMember(), qi) : null;
            const msg = {
                type: 'chat', text: text.slice(0, 2000), uid: uid(), displayName: myName(),
                ...(qi !== null ? { qIdx: qi } : {}),
                ...(my && typeof my.i === 'number' ? { ans: my.i } : {}),
                ...(images.length ? { images } : {}),
                ...(replyTo ? { reply: { id: replyTo.id, name: replyTo.name, text: replyTo.text.slice(0, 120) } } : {}),
                createdAt: serverTimestamp(),
            };
            input.value = '';
            autoGrow(input);
            tray.clear();
            replyTo = null;
            paintReply();
            await addDoc(refs.messages(), msg).catch((err) => {
                showToast('Không gửi được tin nhắn.', 'error');
                input.value = text;
                throw err;
            });
        } catch (e) { /* đã báo */ } finally { sending = false; }
    }

    form?.addEventListener('submit', (e) => { e.preventDefault(); send(); });
    input?.addEventListener('keydown', (e) => {
        // Bộ gõ tiếng Việt / IME đang ghép chữ thì Enter là chốt chữ, đừng gửi
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); send(); }
    });
    input?.addEventListener('input', () => autoGrow(input));
    // Ctrl+V ảnh: chỉ khi bộ nhớ tạm KHÔNG có chữ (copy từ Word/Excel có cả ảnh lẫn chữ -> dán chữ)
    input?.addEventListener('paste', (e) => {
        const imgs = imageFilesOf(e.clipboardData);
        if (!imgs.length || e.clipboardData.getData('text/plain').trim()) return;
        e.preventDefault();
        tray.add(imgs);
    });
    el('chat-img-btn')?.addEventListener('click', () => el('chat-file')?.click());
    el('chat-file')?.addEventListener('change', (e) => { tray.add(e.target.files); e.target.value = ''; });
    // Kéo ảnh thả vào cả vùng thảo luận
    const pane = el('panel-discuss');
    pane?.addEventListener('dragover', (e) => {
        if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
        e.preventDefault();
        pane.classList.add('is-drop');
    });
    pane?.addEventListener('dragleave', (e) => { if (!pane.contains(e.relatedTarget)) pane.classList.remove('is-drop'); });
    pane?.addEventListener('drop', (e) => {
        pane.classList.remove('is-drop');
        const imgs = imageFilesOf(e.dataTransfer);
        if (!imgs.length) return;
        e.preventDefault();
        tray.add(imgs);
    });
    el('chat-reply')?.addEventListener('click', (e) => {
        if (e.target.closest('[data-reply-x]')) { replyTo = null; paintReply(); }
    });

    // Lọc: câu đang xem / cả phòng / tài liệu
    document.querySelector('.rm-filter')?.addEventListener('click', (e) => {
        const seg = e.target.closest('[data-scope]');
        if (seg) setScope(seg.dataset.scope);
    });

    document.getElementById('chat-messages')?.addEventListener('click', (e) => {
        const byId = (id) => messages.find(x => x.id === id);
        if (chatMsgAction(e)) return;
        const rp = e.target.closest('[data-reply]');
        if (rp) {
            const m = byId(rp.dataset.reply);
            if (!m) return;
            replyTo = { id: m.id, name: m.displayName || 'Khách', text: m.type === 'doc' ? `📚 ${m.title || ''}` : (m.text || (m.images?.length ? '[ảnh]' : '')) };
            paintReply();
            return void input?.focus();
        }
        const go = e.target.closest('[data-goto]');
        if (go) {
            const node = document.querySelector(`#chat-messages [data-mid="${CSS.escape(go.dataset.goto)}"]`);
            if (!node) return showToast('Tin gốc không nằm trong bộ lọc này — thử "Cả phòng".', 'info', 2200);
            node.scrollIntoView({ block: 'center', behavior: 'smooth' });
            node.classList.remove('is-flash'); void node.offsetWidth; node.classList.add('is-flash');
            return;
        }
        const gq = e.target.closest('[data-goq]');
        if (gq) return void window.dispatchEvent(new CustomEvent('room:view', { detail: Number(gq.dataset.goq) }));
        const pin = e.target.closest('[data-pin]');
        if (pin && canControl()) {
            const m = byId(pin.dataset.pin);
            updateDoc(refs.session(), { pinnedNote: String(m?.text || '').slice(0, 120) })
                .then(() => showToast('Đã ghim lên đầu phòng.', 'success'))
                .catch(() => showToast('Chỉ ghim được khi đang có phiên đánh đề.', 'warning'));
        }
    });

    initDocModal();

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
        window.dispatchEvent(new Event('room:chat'));      // khối giải thích cập nhật số ý kiến
        const hint = document.getElementById('chat-hint');
        if (hint) hint.textContent = hasSession() ? `${messages.filter(m => m.type !== 'notice').length} tin` : '';
    });
}
