// room-answer.js — GIẢI THÍCH & BÀN LUẬN NGAY TRÊN ĐỀ: không có khối/cột riêng nào nữa.
//  · Dưới MỖI Ô A/B/C/D một khay (#options-area [data-odisc], renderOptionTalk): giải thích của phương
//    án sửa tại chỗ · lý do của bạn + độ chắc · ai chọn + lý do · nhận xét ✚ đúng vì / ✖ sai vì / ❓ / 💬.
//  · Ngay sau các ô là KHAY CỦA CÂU HỎI (#answer-block, renderAnswerHub): giải thích chung (lộ đáp án
//    là hiện thẳng, sửa tại chỗ) + 📖 Mở rộng + 📌 Ghi nhớ (sửa / thêm tại chỗ); câu tự luận thì là BÀI
//    LÀM CHUNG — một người gõ, cả phòng xem, nhận xét song song. Bôi đen một đoạn rồi bấm 💬 để nhận xét.
// Bản 25 — bàn luận thành HỘI THOẠI thật: ↩ trả lời lồng · ❓ có trạng thái + ✅ giải đáp · 🔄 Theo (đổi
//    phiếu từ lập luận, ghi công) · cán cân ✚✖❓ + ý kiến được đồng tình nhất · chấm "mới" · gõ tắt + - ?
// Bản 26 — ẢNH & DỄ THƯƠNG: lý do của bạn dán ảnh (Ctrl+V / 🖼 / kéo thả) + mẫu câu 🔬🧩📖💡 · mọi ô nhận
//    xét đính ảnh (khay xem trước, gửi cùng chữ) · bong bóng chat có mặt người + giờ · viên chọn lập trường.
// Nhận xét: members/{uid}.args.q<i>.<aid> = { t, o: phương án | null, s: cmt|pro|con|ask|src, qt?: đoạn trích,
//           re?: id ý kiến được trả lời, ok?: true | id câu trả lời (thắc mắc đã giải đáp), im?: [{u, t?}] ảnh, at }
// Đồng tình: members/{uid}.agree.<aid> = true (xem argsOf trong room-state.js).
// Bị thuyết phục: members/{uid}.answers.q<i>.by = { id: aid | 'w:'+uid (lý do của người đó), n: tên }
import { updateDoc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { showToast } from '../../core/utils.js';
import { renderMath } from '../quiz/quiz-helpers.js';
import {
    room, refs, uid, hasSession, questionAt, answerOf, whyOf, dissentOf, qKey, canControl, memberOf,
    isAccepted, isAnnounced, isShown, isBlind, isEssay, argsOf, myMember, betOf,
    noteOf, noteAuthorOf, optNoteOf, editorOf, extraOf, extraByOf,
} from './room-state.js';
import { escapeHtml, shortName, avatarHtml, avatarStack, changed, agoText } from './room-ui.js';
import { effectiveIndex, repaintOptions, answerCurrent, canAnswer } from './room-quiz-stage.js';
import { renderRich, currentEditKey, isBlank, insertImagesInto, insertHtmlInto, sanitizeHtml } from './room-editor.js';
import { getNote, setNote } from './room-study.js';
import { appendToExplain, questionMsgs, questionMsgsSig, msgTime, chatCmtHtml, chatMsgAction, sendQuestionMessage, chatMessages } from './room-chat.js';
import { uploadImage, imageFilesOf, warnIfTemp, safeImgUrl } from './room-media.js';

const el = (id) => document.getElementById(id);
const L = (k) => String.fromCharCode(65 + k);
const plain = (v) => String(v ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
// Có nội dung = có chữ HOẶC có ảnh (lý do chỉ là một tấm ảnh chụp sách vẫn là lý do)
const hasRich = (v) => !!plain(v) || /<img/i.test(String(v || ''));
const nameOf = (m, n = 14) => escapeHtml(shortName(m?.displayName || 'Khách', n));
const text = (t) => escapeHtml(t).replace(/\n/g, '<br>');

// Lập trường của một nhận xét. Hàng phương án xoay vòng 💬 → ✚ → ✖ → ❓; ô chung xoay 💬 → ❓ → 📚.
const ST = {
    cmt: { ic: '💬', label: 'nhận xét' },
    pro: { ic: '✚', label: 'đúng vì' },
    con: { ic: '✖', label: 'sai vì' },
    ask: { ic: '❓', label: 'hỏi' },
    src: { ic: '📚', label: 'nguồn' },
};
const CYCLE = { row: ['cmt', 'pro', 'con', 'ask'], box: ['cmt', 'ask', 'src'] };
const kindOf = (slot) => (String(slot) === 'g' ? 'box' : 'row');
// Gõ tắt lập trường ở đầu câu: "+ vì…" = đúng vì · "- vì…" = sai vì · "? …" hoặc kết thúc bằng "?" = hỏi
const PFX = { '+': 'pro', '-': 'con', '−': 'con', '–': 'con', '?': 'ask' };
function readStance(t, kind, cur = 'cmt') {
    const m = /^([+\-−–?])\s*/.exec(t);
    const s = m && PFX[m[1]];
    if (s && CYCLE[kind].includes(s)) return { s, t: t.slice(m[0].length).trim() };
    if (cur === 'cmt' && /\?\s*$/.test(t)) return { s: 'ask', t };
    return { s: cur, t };
}
// Độ chắc của mình: [giá trị, nhãn, giải thích]. 'guess' = chỉ đoán (không cược, vào danh sách ôn lại)
const CONF = [
    ['guess', '🎲 Đoán', 'Chỉ đoán — không cược, được gom vào danh sách cần ôn'],
    ['1', '✓ Chắc', 'Chắc chắn — trúng +điểm thường, trật không mất gì'],
    ['2', '×2', 'Cược ×2: trúng gấp đôi điểm, trật mất 5'],
    ['3', '×3', 'Cược ×3: trúng gấp ba điểm, trật mất 10'],
];
// Mẫu câu lập luận: bấm là chèn đầu dòng in đậm vào "Lý do của bạn" — lý do có khung, đọc lướt là hiểu
const WHY_TPL = [
    ['🔬', 'Cơ chế', 'Giải thích bằng cơ chế sinh lý / bệnh sinh'],
    ['🧩', 'Loại trừ', 'Vì sao các phương án khác sai'],
    ['📖', 'Theo', 'Trích sách / bài giảng / guideline'],
    ['💡', 'Mẹo nhớ', 'Câu vần, sơ đồ, mẹo nhớ nhanh'],
];
// Mở rộng / Ghi nhớ (bản 26): cả nhóm sửa hoặc thêm mới — session.extra.q<i>.<f>
const XF = {
    expanded: { ic: '📖', label: 'Mở rộng', ph: 'Kiến thức mở rộng: bảng so sánh, cơ chế sâu hơn, ca kinh điển… (Ctrl+V dán ảnh)' },
    note: { ic: '📌', label: 'Ghi nhớ', ph: 'Một câu chốt / mẹo nhớ ngắn gọn cho cả nhóm…' },
};

const stance = {};        // `${i}:${slot}` -> lập trường đang chọn (slot = 'g' ô chung | số phương án)
const drafts = {};        // chữ đang gõ dở trong ô nhận xét (giữ lại qua các lần vẽ)
const quotes = {};        // đoạn trích đang gắn kèm (từ nút 💬 khi bôi đen)
const replyTo = {};       // `${i}:${slot}` -> { id, name, text } đang trả lời ý kiến nào
const pending = {};       // `${i}:${slot}` -> [{ pid, prev (blob:), u, t, busy }] ảnh chờ gửi kèm nhận xét
const adding = {};        // `${i}:${f}` -> vừa bấm "＋ Mở rộng / ＋ Ghi nhớ" (hiện ô trống để gõ)
const rowPref = {};       // `${i}:${k}` -> người dùng tự mở / gập hàng
const expOpen = {};       // `${i}:${k}` -> vừa bấm "✏️ Viết giải thích X" (ô trống thì chỉ là 1 nút gọn)
const MAX_IMG = 4;

// ---------- Đã đọc tới đâu (theo máy) ----------
// seen.q<i> = lần cuối mình ở câu i; base.q<i> = mốc lúc VỪA VÀO câu -> ý kiến của người khác mới hơn
// mốc này là "mới" (tô vạch trái). Câu chưa từng mở: mọi ý kiến đều chưa đọc -> chấm trên dải câu.
let seenKey = '';
let seen = {};
const base = {};
let seenQ = null;
let seenTimer = 0;
function markSeen(i) {
    const key = 'roomSeen_' + room.roomId;
    if (seenKey !== key) {
        seenKey = key;
        try { seen = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { seen = {}; }
    }
    const qk = qKey(i);
    // Lần đầu mở câu thì lấy mốc vào câu: ý kiến có sẵn không tô "mới" hết lượt (vô nghĩa), chỉ cái tới sau
    if (seenQ !== i) { seenQ = i; base[qk] = seen[qk] || Date.now(); }
    seen[qk] = Date.now();
    clearTimeout(seenTimer);
    seenTimer = setTimeout(() => { try { localStorage.setItem(seenKey, JSON.stringify(seen)); } catch (e) {} }, 1500);
}
const isNew = (i, x) => x.uid !== uid() && x.at > (base[qKey(i)] || Infinity);

/** Các câu (khác câu đang xem) có ý kiến của người khác mình chưa đọc — dải câu chấm một chấm. */
export function unreadQs(cur) {
    const out = new Set();
    const me = uid();
    if (seenKey !== 'roomSeen_' + room.roomId) markSeen(cur);
    room.members.forEach(m => {
        if (m.uid === me) return;
        Object.entries(m.args || {}).forEach(([qk, list]) => {
            const i = Number(qk.slice(1));
            if (i === cur || out.has(i)) return;
            if (Object.values(list || {}).some(a => a && (String(a.t || '').trim() || a.im?.length) && (a.at || 0) > (seen[qk] || 0))) out.add(i);
        });
    });
    chatMessages().forEach(m => {
        if (typeof m.qIdx !== 'number' || m.qIdx === cur || m.type === 'notice' || m.uid === me) return;
        if (m.createdAt && msgTime(m) > (seen[qKey(m.qIdx)] || 0)) out.add(m.qIdx);
    });
    return out;
}

// ---------- Ai phiếu nhiều, ai thuyết phục được ai ----------
// Đếm một lượt cho cả khay (trước: agreeCount() quét cả phòng cho TỪNG nhận xét, mấy lần mỗi lần vẽ).
function tallyOf(i) {
    const agree = {};
    const conv = {};
    room.members.forEach(m => {
        for (const k in m.agree || {}) if (m.agree[k]) agree[k] = (agree[k] || 0) + 1;
        for (const k in m.likes || {}) if (m.likes[k]) agree[k.slice(1)] = (agree[k.slice(1)] || 0) + 1;   // 👍 tin chat: likes.m<id>
        const a = answerOf(m, i);
        if (a?.by?.id && typeof a.i === 'number') (conv[a.by.id] = conv[a.by.id] || []).push(m);
    });
    // Làm người khác đổi phiếu nặng ký hơn một cái 👍
    return { agree, conv, score: (id) => (agree[id] || 0) + 2 * (conv[id]?.length || 0) };
}

// Trước khi mở phiếu, nhận xét về phương án của người khác bị giấu (khỏi dắt mũi) — mọi chỗ đếm theo đúng luật này
const talkOpen = (i) => isAnnounced(i) || isShown(i) || (!!room.session?.liveStats && !isBlind(i));
const visible = (i, a) => typeof a.o !== 'number' || talkOpen(i) || a.uid === uid();
/** Thắc mắc ❓ chưa ai giải đáp (bảng phiếu hiện chip, bấm là tới). */
export const openAsksOf = (i) => argsOf(i).filter(a => a.s === 'ask' && !a.ok && visible(i, a));
const canResolve = (a) => a.uid === uid() || canControl();

// Một "ý kiến" trong luồng: nhận xét (args) hoặc tin chat / tài liệu gắn câu — chung một khuôn để lồng trả lời
const argItem = (a) => ({ id: a.id, at: a.at || 0, uid: a.uid, re: a.re || null, s: a.s || 'cmt', a });
const msgItem = (m) => ({ id: m.id, at: msgTime(m), uid: m.uid, re: m.reply?.id || null, s: m.type === 'doc' ? 'src' : 'cmt', m });

// Ảnh đính kèm nhận xét — cùng khuôn lưới ảnh của tin chat (.rm-mimgs), bấm là phóng to
function imgsHtml(list) {
    const imgs = (list || []).map(x => ({ ...x, u: safeImgUrl(x.u) })).filter(x => x.u);
    if (!imgs.length) return '';
    return `<div class="rm-mimgs n${Math.min(imgs.length, 4)}">${imgs.map(x => `<span class="rm-mimg">
        <img src="${escapeHtml(x.u)}" alt="Ảnh bàn luận" loading="lazy" decoding="async">
        ${x.t ? '<em title="Host chính lỗi lúc tải — ảnh chỉ giữ 72 giờ">tạm 72h</em>' : ''}</span>`).join('')}</div>`;
}

// ---------- Vẽ ----------
// LUỒNG BÀN LUẬN CỦA CÂU (#answer-block, cột chính): "💬 n ý kiến về câu này" xổ ra luồng nhận xét +
// tin chat/ảnh/tài liệu gắn câu, ô gõ có 🖼 📚. Câu tự luận: BÀI LÀM CHUNG nằm ở đây (là phần làm bài).
// Giải thích · Mở rộng · Ghi nhớ (bản 27) nằm ở SỔ TAY (#notebook, renderNotebook) — cột phải khi màn rộng.
export function renderAnswerHub(i, force = false) {
    const box = el('answer-block');
    const q = questionAt(i);
    if (!box || !q) return;
    markSeen(i);
    const ek = currentEditKey() || '';
    const typingHere = box.contains(document.activeElement)
        && (document.activeElement.matches?.('input, textarea') || ek === 'explain');
    // Đang gõ trong khay -> đừng vẽ lại (mất con trỏ); chỉ cập nhật "ai đang gõ"
    if (!force && box.dataset.qi === String(i) && typingHere) return void paintTyping(i);
    const s = room.session;
    const essay = isEssay(q);
    const args = argsOf(i).filter(a => typeof a.o !== 'number');
    const key = qKey(i);
    const t = tallyOf(i);
    if (!force && !changed('hub', [i, essay, questionMsgsSig(i), base[key], canControl(), Math.floor(Date.now() / 60000),
        essay ? [s.notes?.[key], s.notesBy?.[key]] : 0,
        args.map(a => [a.id, a.t, a.s, a.qt, a.re, a.ok, a.im, a.at, t.agree[a.id], a.member.displayName, a.member.emoji]),
        Object.keys(myMember()?.agree || {}).filter(k => myMember().agree[k]),
        rowPref[`${i}:g`], stance[`${i}:g`], quotes[`${i}:g`], replyTo[`${i}:g`]])) return paintTyping(i);
    box.dataset.qi = String(i);

    const items = [...args.map(argItem), ...questionMsgs(i).map(msgItem)];
    const n = items.length;
    const newN = items.filter(x => isNew(i, x)).length;
    const asks = args.filter(a => a.s === 'ask' && !a.ok).length;
    const pref = rowPref[`${i}:g`];
    // Luồng ý kiến gập sẵn (trừ bài làm chung): số ý kiến hiện trên thanh, bấm mới xổ — đỡ dài trang
    const open = !!quotes[`${i}:g`] || !!replyTo[`${i}:g`] || (pref !== undefined ? pref : essay);
    const author = noteAuthorOf(i);
    const essayBox = !essay ? '' : `<div class="rm-hub-exp is-essay" data-live-wrap>
        <div class="rm-hub-boxhead">
            <span class="rm-xlabel"><span class="rm-xic">✍️</span>Bài làm chung</span>
            <span data-live-status></span>
            <span id="typing-hint" class="rm-typing"></span>
            <span class="flex-1"></span>
            ${author ? `<span class="rm-hint">${escapeHtml(shortName(author.name || '', 14))} · ${agoText(author.at)}</span>` : ''}
        </div>
        <div class="rm-md rm-hub-editor is-essay" contenteditable="true" data-live-edit="explain"
             data-placeholder="Một người gõ bài làm chung, cả phòng xem cùng lúc… bôi đen một đoạn rồi bấm 💬 để nhận xét đoạn đó">${renderRich(noteOf(i))}</div>
    </div>`;

    box.innerHTML = `
        ${essayBox}
        <button type="button" class="rm-otalk-tg rm-hub-tg ${open ? 'is-open' : ''}" data-otalk="g" aria-expanded="${open}">
            <span>💬 ${n ? `${n} ý kiến về câu này` : (essay ? 'Nhận xét bài làm chung' : 'Bàn về câu này')}</span>
            ${asks ? `<span class="rm-tally"><b class="is-ask is-open" title="Thắc mắc chưa ai giải đáp">❓${asks} chưa giải đáp</b></span>` : ''}
            ${newN && !open ? `<span class="rm-new-pill">${newN} mới</span>` : ''}
            <i class="fas fa-chevron-down"></i>
        </button>
        ${open ? `<div class="rm-otalk-body">
            ${threadHtml(i, items, { t, rank: false })}
            ${composerHtml(i, 'g', essay ? 'Nhận xét bài làm chung…' : 'Ý kiến về câu này… (Ctrl+V dán ảnh)')}
        </div>` : peekHtml('g', items, t)}`;
    box.classList.toggle('is-open', essay || open);
    box.querySelectorAll('[data-live-edit]').forEach(n2 => { n2.dataset.empty = isBlank(n2) ? '1' : '0'; });
    box.querySelectorAll('[data-cinput]').forEach(n2 => { n2.value = drafts[`${i}:${n2.dataset.cinput}`] || ''; paintStance(n2); });
    paintTyping(i);
    renderMath(box);
}

// ---------- SỔ TAY CÂU NÀY (bản 27) ----------
// Giải thích · 📖 Mở rộng · 📌 Ghi nhớ (+ 📝 ghi chú của tôi ngay dưới). Máy tính rộng: cột phải, DÍNH theo
// khi cuộn và tự cuộn riêng -> vừa làm bài vừa đọc giải thích, khỏi kéo lên kéo xuống. Màn hẹp: nằm trong
// cột chính ngay trước luồng bàn luận (chưa có gì thì gập thành 1 dòng). placeNotebook() tự dời.
//  · Đầu sổ: "Câu 3 · …đề…" (bấm = cuộn về đề) · ai đang xem câu này · 📋 chép Markdown · 🔖 lưu về ghi chú của tôi.
//  · Mục lục có đèn: ● có nội dung · ＋ trống (bấm là viết) · 🔒 file có nhưng chờ chủ trì hiện đáp án.
//  · Chủ trì vừa hiện/chốt -> phần mới mở sáng lên "✨ vừa mở" vài giây.
const nbPref = {};      // `${i}` -> mở sổ gọn (màn hẹp) · `${i}:${sec}` -> đã bấm "Xem thêm"
const lastRev = {};     // i -> lần vẽ trước đã lộ đáp án chưa
const freshUntil = {};  // i -> tới lúc này thì còn tô "vừa mở"
const NB_SEC = { exp: { ic: '💡', label: 'Giải thích' }, expanded: XF.expanded, note: XF.note, mine: { ic: '📝', label: 'Của tôi' } };

// Nội dung đang HIỂN THỊ của sổ tay (đúng luật chống lộ đáp án) — dùng chung cho vẽ, chép, lưu
function nbState(i) {
    const q = questionAt(i);
    const s = room.session;
    const fileQ = s.questions?.[i] || {};
    const essay = isEssay(q);
    const revealed = isAnnounced(i) || isShown(i);
    const note = noteOf(i);
    const fileExp = q.explanation || q.explain || '';
    const ex = extraOf(i) || {};
    const own = (f) => typeof ex[f] === 'string';
    const x = {};
    Object.keys(XF).forEach(f => {
        const shown = adding[`${i}:${f}`] || (own(f) ? hasRich(ex[f]) : revealed && hasRich(fileQ[f]));
        x[f] = { shown, own: own(f), lock: !shown && !own(f) && hasRich(fileQ[f]), html: q[f] || '' };
    });
    const expHtml = essay ? '' : (hasRich(note) ? note : (revealed ? fileExp : ''));
    return {
        q, essay, revealed, x,
        exp: { html: expHtml, fromFile: !essay && !hasRich(note) && revealed && hasRich(fileExp), lock: !essay && !revealed && !hasRich(note) && hasRich(fileExp) },
        model: essay && isShown(i) ? (q.modelAnswer || q.explanation || '') : '',
    };
}

export function renderNotebook(i, force = false) {
    const nb = el('notebook');
    const q = questionAt(i);
    if (!nb || !q) return;
    renderAllNotes();                       // số trên thẻ "Cả đề" (+ danh sách nếu đang mở) — câu khác đổi cũng cập nhật
    const ek = currentEditKey() || '';
    if (!force && nb.dataset.qi === String(i) && nb.contains(document.activeElement) && (ek === 'explain' || ek.startsWith('extra:'))) return;
    const s = room.session;
    const key = qKey(i);
    const st = nbState(i);
    if (lastRev[i] === false && st.revealed) freshUntil[i] = Date.now() + 4500;
    lastRev[i] = st.revealed;
    const fresh = Date.now() < (freshUntil[i] || 0);
    const inline = nb.classList.contains('is-inline');
    const mineOn = hasRich(getNote(q.question));
    if (!force && !changed('nb', [i, inline, st.revealed, fresh, st.essay, s.notes?.[key], s.notesBy?.[key], s.extra?.[key], s.extraBy?.[key],
        adding[`${i}:expanded`], adding[`${i}:note`], nbPref[i], q.question, q.explanation, q.modelAnswer, q.expanded, q.note,
        s.questions?.[i]?.expanded, s.questions?.[i]?.note, mineOn, Math.floor(Date.now() / 60000),
        Object.keys(nbPref).filter(k => k.startsWith(i + ':'))])) return;
    nb.dataset.qi = String(i);
    if (fresh) setTimeout(() => renderNotebook(effectiveIndex()), Math.max(0, freshUntil[i] - Date.now()) + 60);

    const has = !!hasRich(st.exp.html) || Object.values(st.x).some(v => v.shown) || !!hasRich(st.model);
    const locks = [st.exp.lock, ...Object.values(st.x).map(v => v.lock)].filter(Boolean).length;
    // Màn hẹp, chưa có gì để đọc: gập thành 1 dòng (khỏi chèn một khung trống giữa đề và bàn luận)
    if (inline && !has && !nbPref[i]) {
        nb.classList.add('is-mini');
        nb.innerHTML = `<button type="button" class="rm-nb-mini" data-nb-open>
            <span class="rm-xic">📒</span><b>Sổ tay câu này</b><span class="rm-nb-mini-sub">giải thích · mở rộng · ghi nhớ</span>
            ${locks ? `<em title="Có trong file — tự mở khi chủ trì bấm Hiện đáp án">🔒 ${locks} phần chờ lộ đáp án</em>` : ''}
            <i class="fas fa-chevron-down"></i></button>`;
        return;
    }
    nb.classList.remove('is-mini');

    const secState = (sec) => {
        if (sec === 'exp') return st.essay ? (hasRich(noteOf(i)) ? 'on' : 'off') : hasRich(st.exp.html) ? 'on' : st.exp.lock ? 'lock' : 'off';
        if (sec === 'mine') return mineOn ? 'on' : 'off';
        return st.x[sec].shown ? 'on' : st.x[sec].lock ? 'lock' : 'off';
    };
    const toc = Object.keys(NB_SEC).map(sec => {
        const v = secState(sec);
        const label = sec === 'exp' && st.essay ? 'Bài làm chung' : NB_SEC[sec].label;
        const tip = v === 'lock' ? 'File có sẵn — tự mở khi chủ trì bấm Hiện đáp án' : v === 'off' ? `Chưa có — bấm để viết ${label.toLowerCase()}` : `Tới phần ${label}`;
        return `<button type="button" class="rm-toc is-${v} ${sec === 'mine' ? 'is-mine' : ''}" data-nb-go="${sec}" ${v === 'off' && (sec === 'expanded' || sec === 'note') ? `data-xadd="${sec}"` : ''} title="${tip}">
            <span>${NB_SEC[sec].ic}</span>${label}${v === 'lock' ? ' 🔒' : v === 'off' ? ' ＋' : ''}</button>`;
    }).join('');

    const author = noteAuthorOf(i);
    const more = (sec) => `<button type="button" class="rm-nb-more hidden" data-nb-more="${sec}">Xem thêm <i class="fas fa-chevron-down"></i></button>`;
    // Mẫu viết nhanh (dùng chung với "Lý do của bạn"): hiện khi ô trống hoặc đang gõ
    const tools = (into) => `<div class="rm-why-tools">
        ${WHY_TPL.map(([ic, lb, tt], x) => `<button type="button" class="rm-why-tpl" data-tpl="${x}" title="${tt}">${ic} ${lb}</button>`).join('')}
    </div>`;   // ảnh / bảng / danh sách: thanh soạn thảo nổi khi đang gõ (room-richtools.js)
    const expBox = st.essay ? '' : `<div class="rm-hub-exp ${hasRich(st.exp.html) ? '' : 'is-empty'} ${fresh && st.exp.fromFile ? 'is-fresh' : ''}" data-live-wrap data-nb-sec="exp">
        <div class="rm-hub-boxhead">
            <span class="rm-xlabel"><span class="rm-xic">💡</span>Giải thích</span>
            <span data-live-status></span>
            <span class="flex-1"></span>
            ${st.exp.fromFile ? '<span class="rm-hint">theo file · bấm để sửa</span>'
                : author ? `<span class="rm-hint">${escapeHtml(shortName(author.name || '', 14))} · ${agoText(author.at)}</span>` : ''}
        </div>
        ${st.exp.lock ? '<p class="rm-nb-lock">🔒 File có sẵn lời giải — tự mở khi chủ trì bấm <b>Hiện đáp án</b>. Nhóm vẫn viết trước được.</p>' : ''}
        <div class="rm-md rm-hub-editor" contenteditable="true" data-live-edit="explain"
             data-placeholder="Ai cũng gõ được: cách suy luận, mẹo nhớ, dẫn chứng… (Ctrl+V dán ảnh)">${renderRich(st.exp.html)}</div>
        ${tools('explain')}
        ${more('exp')}
    </div>`;
    const xBox = (f) => {
        const by = extraByOf(i, f);
        const v = st.x[f];
        return `<div class="rm-xbox is-${f} ${fresh && !v.own ? 'is-fresh' : ''}" data-live-wrap data-nb-sec="${f}">
            <div class="rm-hub-boxhead">
                <span class="rm-xlabel"><span class="rm-xic">${XF[f].ic}</span>${XF[f].label}</span>
                <span data-live-status></span>
                <span class="flex-1"></span>
                <span class="rm-hint">${!v.own ? 'theo file · bấm để sửa' : by ? `${escapeHtml(shortName(by.name || '', 14))} · ${agoText(by.at)}` : ''}</span>
            </div>
            <div class="rm-md rm-xedit" contenteditable="true" data-live-edit="extra:${f}" data-placeholder="${XF[f].ph}">${renderRich(v.html)}</div>
            ${more(f)}
        </div>`;
    };

    nb.innerHTML = `
        <div class="rm-nb-head">
            <button type="button" class="rm-nb-q" data-nb-toq title="Cuộn về đề câu này">
                <span class="rm-xic">📒</span><b>Câu ${i + 1}</b><span class="rm-nb-qtext">${escapeHtml(plain(q.question).slice(0, 90))}</span>
            </button>
            <span class="rm-nb-viewers" aria-live="polite"></span>
            <span class="rm-nb-acts">
                <button type="button" data-nb-copy title="Chép sổ tay câu này (Markdown — dán vào Obsidian / Notion)">📋</button>
                <button type="button" data-nb-save title="Lưu vào ghi chú của tôi (đồng bộ với trang làm bài)">🔖</button>
                ${inline && nbPref[i] && !has ? '<button type="button" data-nb-fold title="Gập sổ tay">▴</button>' : ''}
            </span>
        </div>
        <nav class="rm-nb-toc" aria-label="Mục lục sổ tay">${toc}</nav>
        ${fresh ? '<p class="rm-nb-fresh">✨ Chủ trì vừa hiện đáp án — phần trong file đã mở</p>' : ''}
        ${hasRich(st.model) ? `<div class="rm-xbox is-file ${fresh ? 'is-fresh' : ''}" data-nb-sec="model"><div class="rm-hub-boxhead"><span class="rm-xlabel"><span class="rm-xic">📄</span>Bài giải gợi ý trong file</span></div><div class="rm-md">${renderRich(st.model)}</div></div>` : ''}
        ${expBox}
        ${Object.keys(XF).filter(f => st.x[f].shown).map(xBox).join('')}`;
    nb.querySelectorAll('[data-live-edit]').forEach(n2 => { n2.dataset.empty = isBlank(n2) ? '1' : '0'; });
    renderMath(nb);
    // Nội dung dài: gập bớt kèm "Xem thêm" (đỡ phải cuộn cả cột) — bấm vào ô để sửa thì tự bung
    requestAnimationFrame(() => nb.querySelectorAll('[data-nb-sec]').forEach(sec => {
        const body = sec.querySelector('.rm-md');
        const btn = sec.querySelector('[data-nb-more]');
        if (!body || !btn || nbPref[`${i}:${sec.dataset.nbSec}`]) return;
        const long = body.scrollHeight > 300;
        sec.classList.toggle('is-clamped', long);
        btn.classList.toggle('hidden', !long);
    }));
    window.dispatchEvent(new Event('room:notebook'));   // room-presence vẽ lại mặt người xem + con trỏ
}

// HTML (giàu định dạng) -> Markdown gọn để dán Obsidian / Notion: đậm, gạch đầu dòng, ảnh https
function toMd(html) {
    const box = document.createElement('div');
    box.innerHTML = renderRich(html);
    // Bảng -> bảng Markdown (| a | b |), tiêu đề nhỏ -> ####, đường kẻ -> ---
    box.querySelectorAll('table').forEach(t => {
        const rows = [...t.querySelectorAll('tr')].map(tr => [...tr.children].map(c => c.textContent.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim() || ' '));
        if (!rows.length) return void t.remove();
        const w = Math.max(...rows.map(r => r.length));
        rows.forEach(r => { while (r.length < w) r.push(' '); });
        t.replaceWith(`\n${[rows[0], Array(w).fill('---'), ...rows.slice(1)].map(r => `| ${r.join(' | ')} |`).join('\n')}\n`);
    });
    box.querySelectorAll('h4').forEach(h => h.replaceWith(`\n#### ${h.textContent.trim()}\n`));
    box.querySelectorAll('hr').forEach(h => h.replaceWith('\n---\n'));
    box.querySelectorAll('img').forEach(im => im.replaceWith(/^https:/.test(im.getAttribute('src') || '') ? `![](${im.getAttribute('src')})` : '[ảnh]'));
    box.querySelectorAll('b, strong').forEach(b => b.replaceWith(`**${b.textContent.trim()}**`));
    box.querySelectorAll('mark').forEach(m => m.replaceWith(`==${m.textContent}==`));
    box.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
    box.querySelectorAll('li').forEach(li => { li.prepend('- '); li.append('\n'); });
    box.querySelectorAll('p, div').forEach(p => p.append('\n'));
    return box.textContent.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function nbSections(i) {
    const st = nbState(i);
    const out = [];
    if (hasRich(st.model)) out.push(['📄 Bài giải gợi ý', st.model]);
    if (st.essay && hasRich(noteOf(i))) out.push(['✍️ Bài làm chung', noteOf(i)]);
    if (hasRich(st.exp.html)) out.push(['💡 Giải thích', st.exp.html]);
    Object.keys(XF).forEach(f => { if (st.x[f].shown && hasRich(st.x[f].html)) out.push([`${XF[f].ic} ${XF[f].label}`, st.x[f].html]); });
    return out;
}
async function copyNotebook(i) {
    const q = questionAt(i);
    const secs = nbSections(i);
    if (!secs.length) return void showToast('Sổ tay câu này đang trống.', 'info', 1600);
    const md = `### Câu ${i + 1}. ${plain(q.question)}\n\n${secs.map(([lb, h]) => `**${lb}:**\n${toMd(h)}`).join('\n\n')}\n`;
    try { await navigator.clipboard.writeText(md); }
    catch (e) {
        const ta = Object.assign(document.createElement('textarea'), { value: md });
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch (err) {}
        ta.remove();
    }
    showToast(`📋 Đã chép sổ tay câu ${i + 1} (Markdown) — dán vào Obsidian / Notion là giữ định dạng.`, 'success', 2400);
}
function saveNotebookToMine(i) {
    const q = questionAt(i);
    const secs = nbSections(i);
    if (!secs.length) return void showToast('Sổ tay câu này đang trống.', 'info', 1600);
    const cur = getNote(q.question);
    const add = `<p><b>📒 Sổ tay nhóm · câu ${i + 1}</b></p>${secs.map(([lb, h]) => `<p><b>${lb}:</b></p>${renderRich(h)}`).join('')}`;
    setNote(q.question, sanitizeHtml((hasRich(cur) ? renderRich(cur) : '') + add));
    repaintOptions();                       // vẽ lại khối ghi chú của tôi (chữ ký live không có ghi chú riêng)
    renderNotebook(i, true);
    showToast('🔖 Đã lưu sổ tay vào ghi chú của bạn (đồng bộ trang làm bài).', 'success', 2200);
}

/** Tới một phần của sổ tay (mục lục / phím E): cuộn tới, trống thì mở ô để viết luôn. */
export function gotoNotebook(sec = 'exp', focus = true) {
    const i = effectiveIndex();
    const q = questionAt(i);
    const nb = el('notebook');
    if (!nb || !q) return;
    if (document.body.classList.contains('nb-rail')) toggleNotebookRail(false);
    if (sec === 'exp' && isEssay(q)) {
        const n = document.querySelector('#answer-block [data-live-edit="explain"]');
        n?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return void (focus && n?.focus());
    }
    if (sideTab !== 'q') setSideTab('q');
    if (sec === 'mine') {
        const d = el('my-notes');
        if (d) d.open = true;
        const dock = document.querySelector('[data-m="tools"]');
        if (nb.classList.contains('is-inline') && dock?.offsetParent) return void dock.click();   // điện thoại: khay Ghi chú
        d?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        return void (focus && setTimeout(() => d?.querySelector('[data-live-edit="note"]')?.focus(), 200));
    }
    const st = nbState(i);
    if (sec !== 'exp' && st.x[sec]?.lock) {
        return void showToast('🔒 Phần này có trong file — tự mở khi chủ trì bấm Hiện đáp án.', 'info', 2000);
    }
    if (sec !== 'exp' && !st.x[sec]?.shown) adding[`${i}:${sec}`] = true;
    nbPref[i] = true;
    renderNotebook(i, true);
    const box = nb.querySelector(`[data-nb-sec="${sec}"]`);
    box?.scrollIntoView({ block: nb.classList.contains('is-inline') ? 'center' : 'start', behavior: 'smooth' });
    box?.classList.add('is-flash');
    setTimeout(() => box?.classList.remove('is-flash'), 1400);
    if (focus) box?.querySelector('[data-live-edit]')?.focus({ preventScroll: true });
}

/** Thu sổ tay thành thanh ray mảnh / mở lại (nút ⇥, phím O) — nhớ theo máy. */
export function toggleNotebookRail(force) {
    const on = force === undefined ? !document.body.classList.contains('nb-rail') : !!force;
    document.body.classList.toggle('nb-rail', on);
    try { localStorage.setItem('roomNbRail', on ? '1' : '0'); } catch (e) {}
    if (!on) renderNotebook(effectiveIndex(), true);
}

// Máy tính rộng (cột phải đứng CẠNH cột chính) -> sổ tay ở cột phải; còn lại (màn hẹp, điện thoại, tập trung,
// trình chiếu) -> vào cột chính ngay trước luồng bàn luận. Chỉ dời khi bố cục đổi (ResizeObserver).
function placeNotebook() {
    const nb = el('notebook');
    const side = document.querySelector('.rm-col-side');
    const pane = document.querySelector('.rm-side-pane[data-pane="q"]');
    const main = document.querySelector('.rm-col-main');
    const hub = el('answer-block');
    if (!nb || !side || !pane || !main || !hub) return;
    const mr = main.getBoundingClientRect();
    if (!mr.width) return;                                         // màn làm bài đang ẩn — chờ lần sau
    const sr = side.getBoundingClientRect();
    const wide = getComputedStyle(side).display !== 'none' && sr.width > 0 && sr.left >= mr.right - 4
        && !document.body.classList.contains('present');
    const was = !nb.classList.contains('is-inline') && nb.parentElement === pane;
    if (wide && nb.parentElement !== pane) pane.prepend(nb);
    if (!wide && nb.nextElementSibling !== hub) hub.before(nb);
    nb.classList.toggle('is-inline', !wide);
    document.body.classList.toggle('nb-wide', wide);
    // Bản 28: cột sổ tay CAO HẾT MÀN (từ dưới thanh HUD tới đáy khung làm bài), không chừa chỗ thanh chủ trì nữa…
    const stage = el('stage-quiz');
    if (wide && stage) {
        const top = parseFloat(getComputedStyle(side).top) || 0;
        // Trừ cả phần đệm ĐÁY dưới lưới (chừa thanh chủ trì…): cột cao hơn khoảng còn lại thì cuộn tới cuối
        // nó bị lưới đẩy ngược lên, chui ra sau thanh HUD (đã cắn ở bản 29)
        const grid = document.querySelector('.rm-live-grid');
        const sb = stage.getBoundingClientRect();
        const below = grid ? stage.scrollHeight - (grid.getBoundingClientRect().bottom - sb.top + stage.scrollTop) : 0;
        side.style.setProperty('--rm-side-h', `${Math.max(320, stage.clientHeight - top - Math.max(0, below) - 8)}px`);
    }
    // …vì thanh chủ trì (viên nổi) nay canh giữa CỘT LÀM BÀI thay vì giữa cả khung -> không đè lên sổ tay
    const hb = el('host-bar');
    if (hb) {
        const op = hb.offsetParent;
        if (wide && op && window.matchMedia('(min-width: 768px)').matches) {
            const or = op.getBoundingClientRect();
            hb.style.left = `${mr.left + mr.width / 2 - or.left}px`;
            hb.style.maxWidth = `${mr.width - 16}px`;
        } else { hb.style.left = ''; hb.style.maxWidth = ''; }
    }
    if (was !== wide && hasSession()) renderNotebook(effectiveIndex(), true);
}

// ---------- Thẻ "📚 Cả đề" (bản 28): mục lục sổ tay của CẢ ĐỀ trong cột bên ----------
// Mỗi câu một dòng: số câu · đề · một dòng giải thích/ghi nhớ/ghi chú · đèn 💡📖📌📝 (🔒 = chờ lộ đáp án).
// Tìm (không dấu cũng được) + lọc: có ghi chú của tôi · nhóm đã viết · đã lộ mà chưa có giải thích.
let sideTab = 'q';
let allFilter = 'all';
let allQuery = '';
const fold = (v) => plain(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
const ALL_FILTERS = [['all', 'Tất cả'], ['group', '👥 Nhóm đã viết'], ['mine', '📝 Có ghi chú của tôi'], ['todo', '✏ Đã lộ mà chưa giải thích']];
function allRows() {
    return (room.session?.questions || []).map((_, k) => {
        const st = nbState(k);
        const mine = getNote(st.q.question);
        const expHtml = st.essay ? noteOf(k) : st.exp.html;
        const has = {
            exp: hasRich(expHtml),
            expanded: st.x.expanded.shown && hasRich(st.x.expanded.html),
            note: st.x.note.shown && hasRich(st.x.note.html),
            mine: hasRich(mine),
        };
        const group = hasRich(noteOf(k)) || st.x.expanded.own || st.x.note.own;
        const snippet = plain(expHtml) || plain(st.x.note.html && st.x.note.shown ? st.x.note.html : '') || plain(mine);
        return {
            k, q: st.q, has, group, snippet, revealed: st.revealed,
            lock: st.exp.lock || st.x.expanded.lock || st.x.note.lock,
            hay: fold([st.q.question, expHtml, st.x.expanded.shown ? st.x.expanded.html : '', st.x.note.shown ? st.x.note.html : '', mine].join(' ')),
        };
    });
}
export function renderAllNotes() {
    const box = el('nb-all');
    if (!box || !hasSession()) return;
    const rows = allRows();
    const cnt = el('nb-all-count');
    const filled = rows.filter(r => r.has.exp || r.has.expanded || r.has.note || r.has.mine).length;
    if (cnt) cnt.textContent = filled ? String(filled) : '';
    if (box.classList.contains('hidden')) return;
    if (!box.firstElementChild) {
        box.innerHTML = `<div class="rm-all-head">
            <label class="rm-all-search"><i class="fas fa-magnifying-glass"></i><input type="search" data-all-q placeholder="Tìm trong giải thích, ghi nhớ, ghi chú… (không dấu cũng được)"></label>
            <div class="rm-all-filters">${ALL_FILTERS.map(([v, lb]) => `<button type="button" class="rm-all-f ${v === allFilter ? 'on' : ''}" data-all-f="${v}">${lb}</button>`).join('')}</div>
        </div><div class="rm-all-list" data-all-list></div>`;
    }
    box.querySelectorAll('[data-all-f]').forEach(b => b.classList.toggle('on', b.dataset.allF === allFilter));
    const needle = fold(allQuery);
    const cur = effectiveIndex();
    const shown = rows.filter(r => (!needle || r.hay.includes(needle))
        && (allFilter === 'all' || (allFilter === 'group' && r.group) || (allFilter === 'mine' && r.has.mine)
            || (allFilter === 'todo' && r.revealed && !r.has.exp)));
    const dot = (on, ic, tip) => `<i class="${on ? 'on' : ''}" title="${tip}${on ? '' : ' — chưa có'}">${ic}</i>`;
    const html = shown.length ? shown.map(r => `<button type="button" class="rm-allrow ${r.k === cur ? 'is-now' : ''}" data-all-go="${r.k}">
            <b class="rm-allrow-no">${r.k + 1}</b>
            <span class="rm-allrow-main">
                <span class="rm-allrow-q">${escapeHtml(plain(r.q.question).slice(0, 80))}</span>
                ${r.snippet ? `<span class="rm-allrow-s">${escapeHtml(r.snippet.slice(0, 110))}</span>` : ''}
            </span>
            <span class="rm-allrow-dots">${dot(r.has.exp, '💡', 'Giải thích')}${dot(r.has.expanded, '📖', 'Mở rộng')}${dot(r.has.note, '📌', 'Ghi nhớ')}${dot(r.has.mine, '📝', 'Ghi chú của tôi')}${r.lock ? '<i class="lock" title="Có phần trong file chờ lộ đáp án">🔒</i>' : ''}</span>
        </button>`).join('')
        : `<p class="rm-all-empty">${needle ? 'Không thấy câu nào khớp — thử từ khác nhé.' : 'Chưa có câu nào khớp bộ lọc này.'}</p>`;
    const list = box.querySelector('[data-all-list]');
    if (list.dataset.sig !== html) { list.dataset.sig = html; list.innerHTML = html; }
}
function setSideTab(t) {
    sideTab = t;
    document.querySelectorAll('[data-side-tab]').forEach(b => b.classList.toggle('on', b.dataset.sideTab === t));
    document.querySelectorAll('.rm-side-pane').forEach(p => p.classList.toggle('hidden', p.dataset.pane !== t));
    if (t === 'all') renderAllNotes();
    else if (hasSession()) renderNotebook(effectiveIndex(), true);
}
// ⤢ Nới rộng cột sổ tay (nửa màn) / trả về mặc định — dùng chung khóa với thanh kéo (study-room-main.js)
const WIDE_COLS = 'minmax(0, 1fr) minmax(0, 1fr)';
function toggleWideNotebook() {
    let v = null;
    try { v = localStorage.getItem('roomLiveCols'); } catch (e) {}
    const on = v !== WIDE_COLS;
    if (on) document.documentElement.style.setProperty('--rm-live-cols', WIDE_COLS);
    else document.documentElement.style.removeProperty('--rm-live-cols');
    try { if (on) localStorage.setItem('roomLiveCols', WIDE_COLS); else localStorage.removeItem('roomLiveCols'); } catch (e) {}
    document.querySelector('[data-nb-wide]')?.classList.toggle('on', on);
    window.dispatchEvent(new Event('resize'));
}

// Luồng của một chỗ bàn: ý kiến gốc (khay phương án xếp theo độ được đồng tình, ô chung theo thời gian)
// + trả lời lồng ngay dưới (1 tầng; trả lời của trả lời vẫn về chung gốc). Câu trả lời được người hỏi
// chọn là giải đáp thì đứng đầu nhánh.
function threadHtml(i, items, ctx) {
    if (!items.length) return '';
    const byId = new Map(items.map(x => [x.id, x]));
    const rootOf = (x) => { let r = x; for (let n = 0; r.re && byId.has(r.re) && n < 6; n++) r = byId.get(r.re); return r; };
    const kids = new Map();
    const tops = [];
    items.forEach(x => {
        const r = rootOf(x);
        if (r === x) tops.push(x);
        else { if (!kids.has(r.id)) kids.set(r.id, []); kids.get(r.id).push(x); }
    });
    tops.sort(ctx.rank ? (x, y) => ctx.t.score(y.id) - ctx.t.score(x.id) || x.at - y.at : (x, y) => x.at - y.at);
    return `<ul class="rm-cmts">${tops.map(x => {
        const ok = x.a?.ok;
        const ks = (kids.get(x.id) || []).sort((p, q) => (q.id === ok) - (p.id === ok) || p.at - q.at);
        return itemHtml(i, x, ctx, null)
            + (ks.length ? `<li class="rm-cmt-kids"><ul class="rm-cmts">${ks.map(k => itemHtml(i, k, ctx, x)).join('')}</ul></li>` : '');
    }).join('')}</ul>`;
}

function itemHtml(i, x, ctx, parent) {
    const cls = [isNew(i, x) ? 'is-new' : '', parent?.a?.ok === x.id ? 'is-answer' : '', x.uid === uid() ? 'is-me' : ''].filter(Boolean).join(' ');
    // Dưới một thắc mắc: người hỏi (hoặc chủ trì) chọn câu trả lời nào giải đáp được
    const accept = parent?.a?.s === 'ask' && canResolve(parent.a)
        ? `<button type="button" class="rm-like ${parent.a.ok === x.id ? 'on' : ''}" data-accept="${escapeHtml(parent.id)}:${escapeHtml(x.id)}" title="Câu trả lời này giải đáp được thắc mắc">✅</button>` : '';
    const reply = `<button type="button" class="rm-like" data-reply-to="${escapeHtml(x.id)}" title="Trả lời ý kiến này"><i class="fas fa-reply"></i></button>`;
    if (x.m) return chatCmtHtml(x.m, { cls, acts: accept + reply, nested: !!parent });
    return argLi(i, x.a, ctx, { cls, acts: accept + reply, answer: parent?.a?.ok === x.id });
}

// Một nhận xét = BONG BÓNG CHAT (bản 26): mặt người + huy hiệu lập trường ở góc · tên · nhãn lập trường ·
// giờ · chữ · ảnh. Màu bong bóng theo lập trường (✚ bạc hà · ✖ hồng · ❓ oải hương · 📚 đào · 💬 kem).
function argLi(i, a, ctx, { cls = '', acts = '', answer = false } = {}) {
    const st = ST[a.s] || ST.cmt;
    const n = ctx.t.agree[a.id] || 0;
    const conv = ctx.t.conv[a.id] || [];
    const me = uid();
    const mine = answerOf(myMember(), i);
    const tags = [];
    if (answer) tags.push('<span class="rm-ask-st is-done">✅ giải đáp</span>');
    if (a.s === 'ask') {
        const lb = a.ok ? '✅ đã giải đáp' : '⏳ chưa giải đáp';
        tags.push(canResolve(a)
            ? `<button type="button" class="rm-ask-st ${a.ok ? 'is-done' : 'is-open'}" data-resolve="${a.id}" title="${a.ok ? 'Mở lại thắc mắc' : 'Bấm khi đã rõ (hoặc bấm ✅ ở câu trả lời giải đáp được)'}">${lb}</button>`
            : `<span class="rm-ask-st ${a.ok ? 'is-done' : 'is-open'}">${lb}</span>`);
    }
    // Sau khi chốt: lập luận ✚/✖ về một phương án có đi đúng hướng kết luận không — học từ cách nghĩ
    if (typeof a.o === 'number' && isAnnounced(i) && (a.s === 'pro' || a.s === 'con')) {
        tags.push((a.s === 'pro') === isAccepted(i, a.o)
            ? '<span class="rm-held is-ok" title="Lập luận khớp đáp án nhóm chốt">✓ đúng hướng</span>'
            : '<span class="rm-held is-bad" title="Lập luận ngược đáp án nhóm chốt">✗ lệch hướng</span>');
    }
    if (conv.length) tags.push(`<span class="rm-conv" title="Đổi phiếu theo ý này: ${escapeHtml(conv.map(m => m.displayName || 'Khách').join(', '))}">🔄 ${conv.length} người đổi theo</span>`);
    // 🔄 Theo: lập luận ủng hộ một phương án khác phương án mình đang chọn -> một chạm là đổi phiếu, ghi công
    // (nằm trong bong bóng, luôn thấy — thanh thao tác chỉ nổi lên khi rê chuột)
    if (typeof a.o === 'number' && a.uid !== me && (a.s === 'pro' || a.s === 'cmt') && mine?.i !== a.o && canAnswer(i)) {
        tags.push(`<button type="button" class="rm-theo" data-theo="${a.id}" title="Ý này thuyết phục bạn -> chọn ${L(a.o)}">🔄 Theo ${L(a.o)}</button>`);
    }
    return `<li class="rm-cmt is-${a.s || 'cmt'} ${cls}" data-aid="${a.id}">
        <span class="rm-cmt-av">${avatarHtml(a.member, 'xs')}<i class="rm-cmt-st" title="${st.label}">${st.ic}</i></span>
        <div class="rm-cmt-body min-w-0 flex-1">
            <p class="rm-cmt-head"><b>${nameOf(a.member)}</b>${a.s !== 'cmt' ? ` <em class="rm-st is-${a.s}">${st.ic} ${st.label}</em>` : ''}${n ? `<span class="rm-cmt-n">👍 ${n}</span>` : ''}<time class="rm-cmt-time">${agoText(a.at)}</time></p>
            ${a.qt ? `<q class="rm-cmt-q">${escapeHtml(String(a.qt).slice(0, 160))}</q>` : ''}
            ${String(a.t || '').trim() ? `<p class="rm-cmt-t">${text(a.t)}</p>` : ''}
            ${imgsHtml(a.im)}
            ${tags.length ? `<p class="rm-cmt-tags">${tags.join('')}</p>` : ''}
        </div>
        <div class="rm-cmt-acts">
            <button type="button" class="rm-like ${myMember()?.agree?.[a.id] ? 'on' : ''} ${n ? 'has-n' : ''}" data-agree="${a.id}" title="Đồng tình">👍${n ? ' ' + n : ''}</button>
            ${acts}
            <button type="button" class="rm-like" data-cmt-exp="${a.id}" title="Đưa vào giải thích chung (ghi tên người viết)"><i class="fas fa-lightbulb"></i></button>
            ${a.uid === me ? `<button type="button" class="rm-like" data-cmt-del="${a.id}" title="Xoá nhận xét của bạn"><i class="fas fa-trash-can"></i></button>` : ''}
        </div>
    </li>`;
}

// Luồng đang gập: hiện sẵn MỘT ý kiến được đồng tình nhất (👍 / có người đổi phiếu theo) — khỏi mở
// từng khay mới biết lập luận nào đang thắng. Chưa ai đồng tình thì thôi, giữ khay gọn.
function peekHtml(slot, items, t) {
    let best = null;
    let top = 0;
    items.forEach(x => { const s = t.score(x.id); if (s > top) { top = s; best = x; } });
    if (!best) return '';
    const who = best.a ? best.a.member : (memberOf(best.m.uid) || { displayName: best.m.displayName });
    const body = best.a ? best.a.t : (best.m.type === 'doc' ? best.m.title : best.m.text);
    const hasImg = !!(best.a?.im?.length || best.m?.images?.length);
    const n = t.agree[best.id] || 0;
    const c = t.conv[best.id]?.length || 0;
    return `<button type="button" class="rm-peek is-${best.s}" data-otalk="${slot}" title="Ý kiến được đồng tình nhất — bấm để xem cả luồng">
        <span class="rm-peek-ic">${avatarHtml(who, 'xs')}</span>
        <span class="rm-peek-t"><b>${nameOf(who)}</b> ${escapeHtml(plain(body).slice(0, 140))}${hasImg ? ' 🖼' : ''}</span>
        <span class="rm-peek-n">${n ? `👍${n}` : ''}${c ? ` 🔄${c}` : ''}</span>
    </button>`;
}

function paintTyping(i) {
    const e = editorOf(i);
    const hint = el('typing-hint');
    if (hint) hint.textContent = e ? `✍️ ${e.name} đang gõ…` : '';
}

// ---------- Khay gắn dưới từng ô A/B/C/D ----------
// Ô đáp án (room-quiz-stage.js · renderOptions) chừa sẵn <div data-odisc="k">; ở đây đổ nội dung vào.
// Thứ tự trong khay: giải thích của phương án (sửa tại chỗ) · bong bóng "Lý do của bạn" (ô mình chọn) ·
// thanh "ai chọn + lý do · ✚ ✖ ❓" bấm để xổ -> lý do từng người, luồng nhận xét, ô gõ nhận xét.
// Khay trống thì ẩn hẳn: trước khi lộ đáp án, ô không có gì để bàn giữ nguyên gọn như ô trắc nghiệm.
export function renderOptionTalk(i, force = false) {
    const area = el('options-area');
    const q = questionAt(i);
    if (!area || !q || isEssay(q)) return;
    const slots = area.querySelectorAll('[data-odisc]');
    if (!slots.length) return;
    markSeen(i);
    const ek = currentEditKey() || '';
    const typing = area.contains(document.activeElement)
        && (document.activeElement.matches?.('input, textarea') || ek === 'why' || ek.startsWith('optexp:'));
    if (!force && typing) return;
    const s = room.session;
    const key = qKey(i);
    const open = talkOpen(i);
    const revealed = isAnnounced(i) || isShown(i);
    const args = argsOf(i);
    const t = tallyOf(i);
    const sig = [i, open, revealed, s.chosen?.[key], s.alsoOk?.[key], s.split?.[key], s.optNotes?.[key], q.optionExplanations,
        base[key], canAnswer(i), canControl(), Math.floor(Date.now() / 60000),
        args.map(a => [a.id, a.t, a.o, a.s, a.qt, a.re, a.ok, a.im, a.at, t.agree[a.id], a.member.displayName, a.member.emoji]),
        room.members.map(m => [m.uid, m.displayName, m.emoji, answerOf(m, i), m.dissent?.[key]]),
        Object.keys(myMember()?.agree || {}).filter(k => myMember().agree[k]),
        Object.entries(rowPref).filter(([k]) => k.startsWith(i + ':')),
        JSON.stringify(stance), JSON.stringify(quotes), JSON.stringify(replyTo), JSON.stringify(expOpen), slots.length];
    if (!changed('otalk', sig) && !force) return;

    const people = room.members.filter(m => typeof answerOf(m, i)?.i === 'number');
    const mineA = answerOf(myMember(), i);
    slots.forEach(slot => {
        const k = Number(slot.dataset.odisc);
        const html = talkHtml(i, q, k, people, args, open, revealed, mineA, t);
        slot.innerHTML = html;
        slot.classList.toggle('hidden', !html);
        slot.closest('.rm-ocard')?.classList.toggle('has-talk', !!html);
    });
    area.querySelectorAll('[data-live-edit]').forEach(n => { if (n.closest('[data-odisc]')) n.dataset.empty = isBlank(n) ? '1' : '0'; });
    area.querySelectorAll('[data-cinput]').forEach(n => { n.value = drafts[`${i}:${n.dataset.cinput}`] || ''; paintStance(n); });
    slots.forEach(slot => { if (slot.innerHTML) renderMath(slot); });
}

function talkHtml(i, q, k, people, args, open, revealed, mineA, t) {
    const who = people.filter(m => answerOf(m, i).i === k);
    const cm = args.filter(a => a.o === k && visible(i, a));
    const hidden = open ? 0 : args.filter(a => a.o === k && a.uid !== uid()).length;
    const note = optNoteOf(i, k);
    const exp = note || (revealed && q.optionExplanations?.[k]) || '';
    const ok = isAccepted(i, k);
    const mine = mineA?.i === k;
    const said = (m) => { const a = answerOf(m, i); return hasRich(whyOf(m, i)) || (typeof a.from === 'number' && a.from !== a.i) || dissentOf(m, i); };
    const lines = open ? who.filter(m => said(m) && m.uid !== uid()) : [];
    const quoted = !!quotes[`${i}:${k}`] || !!replyTo[`${i}:${k}`] || !!pending[`${i}:${k}`]?.length;
    const talkN = lines.length + cm.length + hidden;
    // Có gì để hiện? Chưa lộ đáp án thì chỉ ô mình chọn + ô đã có giải thích/bàn luận mới có khay
    const inlineExp = revealed || hasRich(note);
    if (!mine && !inlineExp && !talkN && !quoted) return '';

    const items = cm.map(argItem);
    const newN = items.filter(x => isNew(i, x)).length;
    const pref = rowPref[`${i}:${k}`];
    const isOpen = quoted || (pref !== undefined ? pref : (ok || mine) && talkN > 0);
    // Chưa ai viết giải thích X: 1 nút gọn "✏️ Viết giải thích X" thay cho cả dòng chữ mờ nghiêng (nhìn như bỏ dở)
    const expBox = (inline) => !hasRich(exp) && !expOpen[`${i}:${k}`]
        ? `<button type="button" class="rm-oexp-add" data-oexp-add="${k}" title="Ai cũng viết được — cả nhóm cùng thấy">✏️ Viết giải thích ${L(k)}</button>`
        : `<div class="rm-otalk-exp ${inline ? 'is-inline' : ''}" data-live-wrap>
        ${inline ? '' : `<span class="rm-label">Giải thích ${L(k)}</span>`}<span data-live-status></span>
        <div class="rm-md rm-hub-mini" contenteditable="true" data-live-edit="optexp:${k}"
             data-placeholder="${inline ? `✏ Vì sao ${L(k)} đúng / sai — ai cũng sửa được` : `Vì sao ${L(k)} đúng / sai — ai cũng sửa được`}">${renderRich(exp)}</div>
    </div>`;
    const from = mine && typeof mineA.from === 'number' && mineA.from !== mineA.i ? mineA.from : null;
    const differ = mine && isAnnounced(i) && !ok;
    // Độ chắc: gộp "Chắc chắn / Chỉ đoán" (thanh cá nhân cũ) + "cược ×1 ×2 ×3" (thanh trò chơi cũ)
    // thành MỘT dãy ngay trên ô mình chọn — hai nút cũ cùng nói một chuyện: mình tự tin tới đâu.
    const bet = mine ? betOf(myMember(), i) : 1;
    const conf = mine ? (mineA.guess ? 'guess' : String(bet)) : '';
    const confHtml = !mine ? '' : !isAnnounced(i)
        ? `<span class="rm-conf" role="group" aria-label="Bạn chắc tới mức nào">${CONF.map(([v, l, tt]) =>
            `<button type="button" class="rm-conf-b is-${v} ${conf === v ? 'on' : ''}" data-conf="${v}" title="${tt}">${l}</button>`).join('')}</span>`
        : mineA.guess ? '<span class="rm-tagmini">🎲 đoán</span>' : bet > 1 ? `<span class="rm-tagmini">cược ×${bet}</span>` : '';
    // Cán cân lập luận ngay trên thanh xổ: ✚ n · ✖ n · ❓ n (vàng = còn thắc mắc chưa giải đáp) · 💬 n
    const c = { pro: 0, con: 0, ask: 0, cmt: 0 };
    cm.forEach(a => { c[a.s in c ? a.s : 'cmt']++; });
    const askOpen = cm.filter(a => a.s === 'ask' && !a.ok).length;
    const tally = ['pro', 'con', 'ask', 'cmt'].filter(x => c[x]).map(x =>
        `<b class="is-${x} ${x === 'ask' && askOpen ? 'is-open' : ''}" title="${c[x]} ${ST[x].label}${x === 'ask' && askOpen ? ` · ${askOpen} chưa giải đáp` : ''}">${ST[x].ic}${c[x]}</b>`).join('');
    // Bong bóng suy nghĩ "Lý do của bạn": gõ, Ctrl+V / kéo thả / 🖼 ảnh, mẫu câu lập luận một chạm
    const myWhy = whyOf(myMember(), i);
    const mineBox = !mine ? '' : `<div class="rm-otalk-mine ${hasRich(myWhy) ? '' : 'is-empty'}" data-live-wrap>
        <span class="rm-otalk-me">${avatarHtml(myMember(), 'xs')}💭 Lý do của bạn${from !== null ? ` <span class="rm-tagmini is-move">đổi từ ${L(from)}${mineA.by?.n ? ` · nhờ ${escapeHtml(shortName(mineA.by.n, 10))}` : ''}</span>` : ''}</span><span data-live-status></span>
        ${confHtml}
        ${differ ? `<button type="button" class="rm-tagmini ${dissentOf(myMember(), i) ? 'is-warn' : ''}" data-dissent-here title="Ý kiến của bạn vẫn được ghi vào biên bản">✋ ${dissentOf(myMember(), i) ? 'Đang bảo lưu' : 'Bảo lưu ' + L(k)}</button>` : ''}
        <div class="rm-md rm-hub-mini rm-why" contenteditable="true" data-live-edit="why" data-placeholder="Vì sao bạn chọn ${L(k)}? Gõ, hoặc Ctrl+V dán ảnh chụp sách / sơ đồ — cả nhóm thấy kèm tên">${renderRich(myWhy)}</div>
        <div class="rm-why-tools">
            ${WHY_TPL.map(([ic, lb, tt], x) => `<button type="button" class="rm-why-tpl" data-tpl="${x}" title="${tt}">${ic} ${lb}</button>`).join('')}
        </div>
    </div>`;
    return `
        ${inlineExp ? expBox(true) : ''}
        ${mineBox}
        <button type="button" class="rm-otalk-tg ${isOpen ? 'is-open' : ''}" data-otalk="${k}" aria-expanded="${isOpen}">
            ${lines.length ? `<span class="rm-otalk-faces">${avatarStack(lines, 3, 'xs')}</span><span>${lines.length} lý do</span>` : ''}
            ${tally ? `<span class="rm-tally">${tally}</span>` : ''}
            ${hidden ? `<span>🙈 ${hidden} nhận xét</span>` : ''}
            ${!talkN ? `<span>💬 Bàn về ${L(k)}</span>` : ''}
            ${newN && !isOpen ? `<span class="rm-new-pill">${newN} mới</span>` : ''}
            <i class="fas fa-chevron-down"></i>
        </button>
        ${isOpen ? `<div class="rm-otalk-body">
            ${lines.length ? `<ul class="rm-camp-people">${lines.map(m => personLine(m, i, t, mineA)).join('')}</ul>` : ''}
            ${inlineExp ? '' : expBox(false)}
            ${threadHtml(i, items, { t, rank: true })}
            ${hidden ? `<p class="rm-hint">🙈 ${hidden} nhận xét của người khác hiện khi mở phiếu.</p>` : ''}
            ${composerHtml(i, k, `Nhận xét về ${L(k)}…`)}
        </div>` : peekHtml(k, items, t)}`.trim();
}

function personLine(m, i, t, mineA) {
    const a = answerOf(m, i);
    const tags = [];
    if (typeof a.from === 'number' && a.from !== a.i) {
        tags.push(`<span class="rm-tagmini is-move" title="Đổi ý sau khi bàn">đổi từ ${L(a.from)}${a.by?.n ? ` · nhờ ${escapeHtml(shortName(a.by.n, 10))}` : ''}</span>`);
    }
    if (a.guess) tags.push('<span class="rm-tagmini">đoán</span>');
    if (dissentOf(m, i)) tags.push('<span class="rm-tagmini is-warn">✋ bảo lưu</span>');
    const conv = t.conv['w:' + m.uid] || [];
    if (conv.length) tags.push(`<span class="rm-conv" title="${escapeHtml(conv.map(x => x.displayName || 'Khách').join(', '))}">🔄 thuyết phục ${conv.length}</span>`);
    const why = hasRich(whyOf(m, i));
    const theo = why && mineA?.i !== a.i && canAnswer(i)
        ? `<button type="button" class="rm-theo" data-theo-why="${escapeHtml(m.uid)}" title="Lý do này thuyết phục bạn -> chọn ${L(a.i)}">🔄 Theo</button>` : '';
    return `<li>${avatarHtml(m, 'sm')}
        <div class="rm-camp-bub min-w-0 flex-1">
            <p class="rm-camp-name"><b>${nameOf(m)}</b>${tags.join('')}</p>
            ${why ? `<div class="rm-camp-why rm-md">${renderRich(whyOf(m, i))}</div>` : '<p class="rm-hint">chưa ghi lý do</p>'}
        </div>
        ${theo}
    </li>`;
}

// Ảnh chờ gửi trong ô gõ: xem trước, ✕ bỏ, đang tải thì quay vòng — gửi là đi cùng chữ đang gõ
const trayHtml = (list) => list.map(p => `<span class="rm-cform-img ${p.busy ? 'is-busy' : ''}" data-pid="${p.pid}">
    <img src="${escapeHtml(p.u || p.prev)}" alt="Ảnh chờ gửi">
    ${p.busy ? '<i class="fas fa-circle-notch fa-spin"></i>' : ''}
    <button type="button" data-pend-x="${p.pid}" title="Bỏ ảnh này"><i class="fas fa-times"></i></button></span>`).join('');

function composerHtml(i, slot, placeholder) {
    const kind = kindOf(slot);
    const s = stance[`${i}:${slot}`] || 'cmt';
    const qt = quotes[`${i}:${slot}`];
    const rp = replyTo[`${i}:${slot}`];
    const imgs = pending[`${i}:${slot}`] || [];
    return `<form class="rm-cform" data-cform="${slot}" autocomplete="off">
        ${rp ? `<div class="rm-cform-q is-reply"><span class="rm-cform-re">↩ Trả lời <b>${escapeHtml(shortName(rp.name, 14))}</b></span><q>${escapeHtml(rp.text.slice(0, 120))}</q><button type="button" data-reply-x="${slot}" title="Bỏ trả lời (Esc)"><i class="fas fa-times"></i></button></div>` : ''}
        ${qt ? `<div class="rm-cform-q"><q>${escapeHtml(qt.slice(0, 160))}</q><button type="button" data-quote-x="${slot}" title="Bỏ trích"><i class="fas fa-times"></i></button></div>` : ''}
        <div class="rm-cform-imgs ${imgs.length ? '' : 'hidden'}">${trayHtml(imgs)}</div>
        <div class="rm-cform-row">
            <button type="button" class="rm-cst is-${s}" data-cycle="${slot}" data-kind="${kind}" title="Đổi loại: ${CYCLE[kind].map(x => ST[x].ic + ' ' + ST[x].label).join(' · ')}">${ST[s].ic}<span>${ST[s].label}</span></button>
            <input class="rm-input rm-cinput" data-cinput="${slot}" maxlength="600" placeholder="${escapeHtml(rp ? `Trả lời ${shortName(rp.name, 14)}…` : placeholder)}">
            <button type="button" class="rm-cform-tool" data-cimg="${slot}" title="Đính ảnh (hoặc Ctrl+V vào ô)"><i class="fas fa-image"></i></button>
            ${slot === 'g' ? '<button type="button" class="rm-cform-tool" data-hub-doc title="Trích tài liệu (sách, bài giảng, link)"><i class="fas fa-book-medical"></i></button>' : ''}
            <input type="file" accept="image/*" multiple hidden data-cfile="${slot}">
            <button type="submit" class="rm-cform-send" title="Gửi (Enter)"><i class="fas fa-paper-plane"></i></button>
        </div>
        <div class="rm-cform-hint">
            ${CYCLE[kind].map(x => `<button type="button" class="rm-stp is-${x} ${x === s ? 'on' : ''}" data-setst="${x}">${ST[x].ic} ${ST[x].label}</button>`).join('')}
            <span>gõ tắt: ${kind === 'row' ? '<b>+</b> <b>-</b> ' : ''}<b>?</b>${rp || qt ? ' · <b>Esc</b> bỏ trả lời/trích' : ''}</span>
        </div>
    </form>`;
}

// Nút lập trường + viên kẹo đi theo chữ đang gõ ("+ …" -> ✚ đúng vì) — chưa ghi vào stance, gửi mới tính
function paintStance(input) {
    const slot = input.dataset.cinput;
    const form = input.closest('.rm-cform');
    const btn = form?.querySelector('[data-cycle]');
    if (!btn) return;
    const s = readStance(input.value.trim(), kindOf(slot), stance[`${effectiveIndex()}:${slot}`] || 'cmt').s;
    form.querySelectorAll('[data-setst]').forEach(b => b.classList.toggle('on', b.dataset.setst === s));
    if (btn.classList.contains('is-' + s)) return;
    btn.className = `rm-cst is-${s}`;
    btn.innerHTML = `${ST[s].ic}<span>${ST[s].label}</span>`;
}
function setStance(slot, s) {
    const k = `${effectiveIndex()}:${slot}`;
    stance[k] = s;
    const input = inputOf(slot);
    if (!input) return;
    input.value = input.value.replace(/^[+\-−–?]\s*/, '');   // bỏ ký tự gõ tắt, kẻo nó đè lựa chọn
    drafts[k] = input.value;
    paintStance(input);
}

// ---------- Hành động ----------
// Ô gõ nhận xét: 'g' ở khối chung, số phương án ở khay dưới ô đáp án
const inputOf = (slot) => document.querySelector(String(slot) === 'g'
    ? '#answer-block [data-cinput="g"]' : `#options-area [data-cinput="${slot}"]`);
const repaint = (i, slot) => (String(slot) === 'g' ? renderAnswerHub(i, true) : renderOptionTalk(i, true));
const slotOf = (node) => { const d = node.closest('[data-odisc]'); return d ? Number(d.dataset.odisc) : 'g'; };
const slotKey = (v) => (v === 'g' ? 'g' : Number(v));

function paintTray(i, slot) {
    const root = String(slot) === 'g' ? el('answer-block') : el('options-area');
    const tray = root?.querySelector(`[data-cform="${slot}"] .rm-cform-imgs`);
    if (!tray || effectiveIndex() !== i) return;
    const list = pending[`${i}:${slot}`] || [];
    tray.innerHTML = trayHtml(list);
    tray.classList.toggle('hidden', !list.length);
}
function dropPending(k) { (pending[k] || []).forEach(p => p.prev && URL.revokeObjectURL(p.prev)); delete pending[k]; }

/** Ảnh vào ô gõ nhận xét (Ctrl+V / 🖼): tải lên ngay, hiện xem trước; gửi thì đi cùng chữ. */
function addImages(slot, files) {
    if (!hasSession()) return;
    const i = effectiveIndex();
    const k = `${i}:${slot}`;
    const list = pending[k] = pending[k] || [];
    const pick = [...files].filter(f => /^image\//.test(f.type)).slice(0, Math.max(0, MAX_IMG - list.length));
    if (!pick.length) return void showToast(`Mỗi lần gửi tối đa ${MAX_IMG} ảnh.`, 'info', 1600);
    pick.forEach(f => {
        const p = { pid: 'p' + Math.random().toString(36).slice(2, 8), prev: URL.createObjectURL(f), busy: true };
        list.push(p);
        uploadImage(f).then(res => { warnIfTemp(res); p.u = res.u; if (res.t) p.t = 1; })
            .catch(() => { list.splice(list.indexOf(p), 1); showToast('Ảnh chưa tải lên được — thử lại nhé.', 'error'); })
            .finally(() => { p.busy = false; paintTray(i, slot); });
    });
    paintTray(i, slot);
    inputOf(slot)?.focus({ preventScroll: true });
}

async function send(slot) {
    const i = effectiveIndex();
    const k = `${i}:${slot}`;
    const input = inputOf(slot);
    const raw = String(input?.value || '').trim();
    const list = pending[k] || [];
    if (list.some(p => p.busy)) return void showToast('Ảnh đang tải lên — đợi một chút rồi gửi nhé.', 'info', 1600);
    const imgs = list.filter(p => p.u).map(p => (p.t ? { u: p.u, t: 1 } : { u: p.u }));
    const { s, t } = readStance(raw, kindOf(slot), stance[k] || 'cmt');
    if ((!t && !imgs.length) || !hasSession()) return;
    const undo = { q: quotes[k], r: replyTo[k] };
    const clear = () => { delete drafts[k]; delete quotes[k]; delete replyTo[k]; dropPending(k); if (input) input.value = ''; };
    // Ô chung có ảnh -> thành TIN gắn câu như trước (bảng "Tài liệu & ảnh" cũng thấy)
    if (slot === 'g' && imgs.length) {
        try { await sendQuestionMessage(i, t, imgs, replyTo[k] || null); clear(); }
        catch (e) { return void showToast('Chưa gửi được — thử lại nhé.', 'error'); }
        repaint(i, slot);
        return void inputOf(slot)?.focus({ preventScroll: true });
    }
    const aid = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const data = { t: t.slice(0, 600), o: slot === 'g' ? null : Number(slot), s, at: Date.now() };
    if (quotes[k]) data.qt = quotes[k].slice(0, 300);
    if (replyTo[k]) data.re = replyTo[k].id;
    if (imgs.length) data.im = imgs;
    const keep = list;
    delete pending[k];
    clear();
    await updateDoc(refs.member(), { [`args.q${i}.${aid}`]: data })
        .then(() => keep.forEach(p => p.prev && URL.revokeObjectURL(p.prev)))
        .catch(() => {
            drafts[k] = raw; pending[k] = keep;
            if (undo.q) quotes[k] = undo.q;
            if (undo.r) replyTo[k] = undo.r;
            showToast('Chưa gửi được — thử lại nhé.', 'error');
        });
    repaint(i, slot);
    inputOf(slot)?.focus({ preventScroll: true });
}

/** Mở khay bàn luận dưới ô phương án k (và đưa ô đó vào tầm mắt). */
export function openOptionTalk(k, focusInput = true) {
    const i = effectiveIndex();
    rowPref[`${i}:${k}`] = true;
    renderOptionTalk(i, true);
    const card = document.querySelector(`#options-area [data-card="${k}"]`);
    card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (focusInput) setTimeout(() => inputOf(k)?.focus({ preventScroll: true }), 280);
}

/** Tới khối đáp án & bàn luận (dock "Bàn luận", phím D). k = số phương án thì mở khay dưới ô đó. */
export function focusHub(k) {
    if (typeof k === 'number') { openOptionTalk(k); return true; }
    const box = el('answer-block');
    if (!box || box.offsetParent === null) return false;
    const i = effectiveIndex();
    if (!inputOf('g')) { rowPref[`${i}:g`] = true; renderAnswerHub(i, true); }
    box.scrollIntoView({ block: 'start', behavior: 'smooth' });
    setTimeout(() => inputOf('g')?.focus({ preventScroll: true }), 300);
    return true;
}

/** Chip "❓ n chưa giải đáp" ở bảng phiếu: mở đúng khay và nháy thắc mắc cũ nhất. */
export function gotoOpenAsk() {
    const i = effectiveIndex();
    const a = openAsksOf(i).sort((x, y) => (x.at || 0) - (y.at || 0))[0];
    if (!a) return;
    const slot = typeof a.o === 'number' && !isEssay(questionAt(i)) ? a.o : 'g';
    rowPref[`${i}:${slot}`] = true;
    repaint(i, slot);
    const li = document.querySelector(`[data-aid="${a.id}"]`);
    (li || el('answer-block'))?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    li?.classList.add('is-flash');
    setTimeout(() => li?.classList.remove('is-flash'), 1800);
}

// Ý kiến (nhận xét hoặc tin chat) theo id -> { tên, chữ } để hiện "↩ Trả lời Lan: …"
function itemRef(i, id) {
    const a = argsOf(i).find(x => x.id === id);
    if (a) return { id, name: a.member.displayName || 'Khách', text: plain(a.t) || '🖼 ảnh' };
    const m = questionMsgs(i).find(x => x.id === id);
    if (m) return { id, name: m.displayName || 'Khách', text: plain(m.type === 'doc' ? m.title : m.text) || '🖼 ảnh' };
    return null;
}
// Ô sửa đi kèm một nút mẫu câu / ảnh: cùng khung [data-live-wrap] (lý do của bạn · giải thích sổ tay)
const editorNear = (n) => n.closest('[data-live-wrap]')?.querySelector('[data-live-edit]');

export function initAnswerHub() {
    const box = el('answer-block');
    if (!box) return;
    // Ghi chú của tôi: nằm trong cột sổ tay (bản 27) -> mở sẵn
    const notes = el('my-notes');
    if (notes) notes.open = true;
    // Cùng một bộ thao tác cho 3 nơi: luồng bàn luận (#answer-block), khay dưới ô đáp án (#options-area), sổ tay
    const area = el('options-area');
    const nbk = el('notebook');
    const roots = [box, area, nbk].filter(Boolean);
    try { document.body.classList.toggle('nb-rail', localStorage.getItem('roomNbRail') === '1'); } catch (e) {}
    const ro = new ResizeObserver(() => requestAnimationFrame(placeNotebook));
    [el('quiz-live'), document.querySelector('.rm-col-side')].forEach(n => n && ro.observe(n));
    window.addEventListener('resize', () => requestAnimationFrame(placeNotebook));   // cao cửa sổ đổi -> cột cao theo
    // Khung cột bên (ngoài #notebook): thanh ray · thẻ Câu này / Cả đề · ⤢ nới rộng · ⇥ thu gọn · mục lục cả đề
    const side = document.querySelector('.rm-col-side');
    try { side?.querySelector('[data-nb-wide]')?.classList.toggle('on', localStorage.getItem('roomLiveCols') === WIDE_COLS); } catch (e) {}
    side?.addEventListener('click', (e) => {
        const b = (sel) => e.target.closest(sel);
        let x;
        if (b('.rm-nb-railbtn')) return void toggleNotebookRail(false);
        if ((x = b('[data-side-tab]'))) return void setSideTab(x.dataset.sideTab);
        if (b('[data-nb-wide]')) return void toggleWideNotebook();
        if (b('.rm-side-tabs [data-nb-rail]')) return void toggleNotebookRail(true);
        if ((x = b('[data-all-f]'))) { allFilter = x.dataset.allF; return void renderAllNotes(); }
        if ((x = b('[data-all-go]'))) {
            const k = Number(x.dataset.allGo);
            setSideTab('q');
            if (k !== effectiveIndex()) window.dispatchEvent(new CustomEvent('room:view', { detail: k }));
            return;
        }
    });
    side?.addEventListener('input', (e) => {
        if (!e.target.matches?.('[data-all-q]')) return;
        allQuery = e.target.value;
        renderAllNotes();
    });
    const on = (type, fn, capture) => roots.forEach(r => r.addEventListener(type, fn, capture));
    el('consensus-bar')?.addEventListener('click', (e) => { if (e.target.closest('[data-open-ask]')) gotoOpenAsk(); });
    on('submit', (e) => {
        const f = e.target.closest('[data-cform]');
        if (!f) return;
        e.preventDefault();
        send(slotKey(f.dataset.cform));
    });
    on('input', (e) => {
        const n = e.target.closest?.('[data-cinput]');
        if (!n) return;
        drafts[`${effectiveIndex()}:${n.dataset.cinput}`] = n.value;
        paintStance(n);
    });
    // Esc trong ô gõ: bỏ trả lời / trích trước (giữ chữ đang gõ), không còn gì thì rời ô
    on('keydown', (e) => {
        const n = e.target.closest?.('[data-cinput]');
        if (!n || e.key !== 'Escape') return;
        const slot = slotKey(n.dataset.cinput);
        const k = `${effectiveIndex()}:${slot}`;
        e.stopPropagation();
        if (!replyTo[k] && !quotes[k]) return void n.blur();
        delete replyTo[k];
        delete quotes[k];
        repaint(effectiveIndex(), slot);
        inputOf(slot)?.focus({ preventScroll: true });
    });
    // Giữ con trỏ trong ô đang gõ khi bấm viên lập trường / mẫu câu / nút ảnh của lý do
    on('mousedown', (e) => {
        const b = (sel) => e.target.closest(sel);
        let x;
        if ((x = b('[data-setst]'))) { e.preventDefault(); return void setStance(slotKey(x.closest('[data-cform]').dataset.cform), x.dataset.setst); }
        if ((x = b('[data-tpl]'))) {
            e.preventDefault();
            const [ic, lb] = WHY_TPL[Number(x.dataset.tpl)] || [];
            if (ic) insertHtmlInto(editorNear(x), `<b>${ic} ${lb}:</b>&nbsp;`);
            return;
        }
        if (b('[data-imgbtn]')) e.preventDefault();
    });
    // Ảnh: Ctrl+V vào bất kỳ ô gõ nhận xét nào (có chữ trong bộ nhớ tạm thì dán chữ như thường)
    on('paste', (e) => {
        const n = e.target.closest?.('[data-cinput]');
        if (!n) return;
        const imgs = imageFilesOf(e.clipboardData);
        if (!imgs.length || e.clipboardData.getData('text/plain').trim()) return;
        e.preventDefault();
        addImages(slotKey(n.dataset.cinput), imgs);
    });
    on('change', (e) => {
        const f = e.target.closest?.('[data-cfile]');
        if (f) { addImages(slotKey(f.dataset.cfile), f.files); f.value = ''; return; }
        const w = e.target.closest?.('[data-imgfile]');
        if (w) { insertImagesInto(editorNear(w), w.files); w.value = ''; }
    });
    // Rời ô nhận xét -> vẽ lại cho kịp những gì người khác vừa gửi trong lúc mình gõ.
    // Khay dưới ô đáp án: vẽ lại CẢ ô (số phiếu có thể đã đổi trong lúc gõ — xem chốt chặn ở renderOptions).
    on('focusout', (e) => {
        const root = e.currentTarget;
        if (!e.target.closest?.('[data-cinput]') && !e.target.closest?.('[data-odisc] [data-live-edit]')) return;
        // Bấm ✏️ rồi bỏ đó không viết gì -> về lại nút gọn
        const ox = /^optexp:(\d+)$/.exec(e.target.dataset?.liveEdit || '');
        if (ox && isBlank(e.target)) delete expOpen[`${effectiveIndex()}:${ox[1]}`];
        setTimeout(() => {
            if (root.contains(document.activeElement)) return;
            if (root === box) renderAnswerHub(effectiveIndex(), true);
            else repaintOptions();
        }, 150);
    });
    on('click', (e) => {
        const i = effectiveIndex();
        const b = (sel) => e.target.closest(sel);
        let x;
        if ((x = b('[data-cimg]'))) return void x.closest('form')?.querySelector('[data-cfile]')?.click();
        if ((x = b('[data-imgbtn]'))) return void x.parentElement.querySelector('[data-imgfile]')?.click();
        if ((x = b('[data-pend-x]'))) {
            const slot = slotOf(x);
            const list = pending[`${i}:${slot}`] || [];
            const p = list.find(v => v.pid === x.dataset.pendX);
            if (p) { list.splice(list.indexOf(p), 1); if (p.prev) URL.revokeObjectURL(p.prev); }
            paintTray(i, slot);
            return void inputOf(slot)?.focus({ preventScroll: true });
        }
        if ((x = b('[data-oexp-add]'))) {
            const k = Number(x.dataset.oexpAdd);
            expOpen[`${i}:${k}`] = true;
            renderOptionTalk(i, true);
            return void document.querySelector(`#options-area [data-live-edit="optexp:${k}"]`)?.focus();
        }
        // --- Sổ tay ---
        if ((x = b('[data-nb-go]'))) return void gotoNotebook(x.dataset.nbGo);
        if (b('[data-nb-open]')) { nbPref[i] = true; return void renderNotebook(i, true); }
        if (b('[data-nb-fold]')) { nbPref[i] = false; return void renderNotebook(i, true); }
        if (b('[data-nb-toq]')) return void document.querySelector('.rm-question')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        if (b('[data-nb-copy]')) return void copyNotebook(i);
        if (b('[data-nb-save]')) return void saveNotebookToMine(i);
        if (b('[data-nb-rail]')) return void toggleNotebookRail(true);
        if ((x = b('[data-nb-more]'))) {
            nbPref[`${i}:${x.dataset.nbMore}`] = true;
            x.closest('[data-nb-sec]')?.classList.remove('is-clamped');
            return void x.classList.add('hidden');
        }
        if ((x = b('[data-xadd]'))) return void gotoNotebook(x.dataset.xadd);
        if (b('[data-hub-doc]')) return void el('chat-doc-btn')?.click();   // hộp trích tài liệu, gắn vào câu đang xem
        if (b('[data-like], [data-toexp]') && chatMsgAction(e)) return;
        if ((x = b('[data-otalk]'))) {
            const k = slotKey(x.dataset.otalk);
            rowPref[`${i}:${k}`] = !x.classList.contains('is-open');
            return void repaint(i, k);
        }
        if ((x = b('[data-goto-opt]'))) return void openOptionTalk(Number(x.dataset.gotoOpt), false);
        if ((x = b('[data-conf]'))) {
            const v = x.dataset.conf;
            if (!answerOf(myMember(), i)) return;
            return void updateDoc(refs.member(), {
                [`answers.q${i}.guess`]: v === 'guess',
                [`answers.q${i}.bet`]: v === 'guess' ? 1 : Number(v),
            }).catch(() => {});
        }
        if (b('[data-dissent-here]')) {
            return void updateDoc(refs.member(), { [`dissent.q${i}`]: !dissentOf(myMember(), i) }).catch(() => {});
        }
        if ((x = b('[data-cycle]'))) {
            const cyc = CYCLE[x.dataset.kind];
            // Đang gõ tắt "+ …" thì nút đang hiện lập trường của chữ — xoay tiếp từ cái đang hiện
            const shown = cyc.find(s => x.classList.contains('is-' + s)) || 'cmt';
            setStance(slotKey(x.dataset.cycle), cyc[(cyc.indexOf(shown) + 1) % cyc.length]);
            return void inputOf(slotKey(x.dataset.cycle))?.focus();
        }
        if ((x = b('[data-quote-x]'))) { delete quotes[`${i}:${x.dataset.quoteX}`]; return repaint(i, slotKey(x.dataset.quoteX)); }
        if ((x = b('[data-reply-x]'))) { delete replyTo[`${i}:${x.dataset.replyX}`]; return repaint(i, slotKey(x.dataset.replyX)); }
        if ((x = b('[data-reply-to]'))) {
            const ref = itemRef(i, x.dataset.replyTo);
            if (!ref) return;
            const slot = slotOf(x);
            replyTo[`${i}:${slot}`] = ref;
            rowPref[`${i}:${slot}`] = true;
            repaint(i, slot);
            inputOf(slot)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            // Tìm lại ô gõ lúc focus: rời ô cũ -> focusout vẽ lại cả khay sau 150ms, giữ node cũ là focus hụt
            return void setTimeout(() => inputOf(slot)?.focus({ preventScroll: true }), 200);
        }
        if ((x = b('[data-resolve]'))) {
            const a = argsOf(i).find(v => v.id === x.dataset.resolve);
            if (!a || !canResolve(a)) return;
            return void updateDoc(refs.member(a.uid), { [`args.q${i}.${a.id}.ok`]: a.ok ? null : true }).catch(() => {});
        }
        if ((x = b('[data-accept]'))) {
            const [pid, kid] = x.dataset.accept.split(':');
            const a = argsOf(i).find(v => v.id === pid);
            if (!a || !canResolve(a)) return;
            const on2 = a.ok !== kid;
            return void updateDoc(refs.member(a.uid), { [`args.q${i}.${a.id}.ok`]: on2 ? kid : null })
                .then(() => on2 && showToast('✅ Đã đánh dấu: thắc mắc được giải đáp.', 'success', 1800))
                .catch(() => {});
        }
        if ((x = b('[data-theo]'))) {
            const a = argsOf(i).find(v => v.id === x.dataset.theo);
            if (!a || typeof a.o !== 'number') return;
            answerCurrent(a.o, { by: { id: a.id, n: a.member.displayName || 'Khách' } });
            return void showToast(`🔄 Đã chọn ${L(a.o)} — theo ý của ${shortName(a.member.displayName || 'Khách', 14)}.`, 'success', 2000);
        }
        if ((x = b('[data-theo-why]'))) {
            const m = memberOf(x.dataset.theoWhy);
            const k = answerOf(m, i)?.i;
            if (!m || typeof k !== 'number') return;
            answerCurrent(k, { by: { id: 'w:' + m.uid, n: m.displayName || 'Khách' } });
            return void showToast(`🔄 Đã chọn ${L(k)} — theo lý do của ${shortName(m.displayName || 'Khách', 14)}.`, 'success', 2000);
        }
        if ((x = b('[data-agree]'))) {
            const id = x.dataset.agree;
            return void updateDoc(refs.member(), { [`agree.${id}`]: !myMember()?.agree?.[id] }).catch(() => {});
        }
        if ((x = b('[data-cmt-del]'))) {
            return void updateDoc(refs.member(), { [`args.q${i}.${x.dataset.cmtDel}`]: null }).catch(() => {});
        }
        if ((x = b('[data-cmt-exp]'))) {
            const a = argsOf(i).find(v => v.id === x.dataset.cmtExp);
            if (!a) return;
            const st = ST[a.s] || ST.cmt;
            const about = typeof a.o === 'number' ? ` (${st.label} ${L(a.o)})` : '';
            const pics = (a.im || []).map(v => safeImgUrl(v.u)).filter(Boolean).map(u => `<img src="${escapeHtml(u)}" alt="Ảnh minh họa">`).join('');
            const html = `<p>${st.ic} <b>${escapeHtml(a.member.displayName || 'Khách')}</b>${about}: ${a.qt ? `<i>“${escapeHtml(a.qt)}”</i> — ` : ''}${text(a.t || '')}</p>${pics ? `<p>${pics}</p>` : ''}`;
            return void appendToExplain(i, html)
                .then(() => showToast(`Đã đưa vào giải thích chung của câu ${i + 1}.`, 'success'))
                .catch(() => showToast('Chưa đưa vào được — thử lại nhé.', 'error'));
        }
    });

    // Bôi đen một đoạn trong đề / ô chung / giải thích phương án rồi bấm 💬 (room-editor.js)
    // -> gắn đoạn đó vào ô nhận xét đúng chỗ: phương án k thì hàng k, còn lại ô chung.
    window.addEventListener('room:quote', (e) => {
        const { text: t, key } = e.detail || {};
        if (!t || !hasSession()) return;
        const i = effectiveIndex();
        const m = /^(?:optexp|opttext):(\d+)$/.exec(key || '');
        const slot = m && !isEssay(questionAt(i)) ? Number(m[1]) : 'g';
        quotes[`${i}:${slot}`] = t;
        if (slot !== 'g') rowPref[`${i}:${slot}`] = true;
        document.activeElement?.blur?.();
        repaint(i, slot);
        inputOf(slot)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setTimeout(() => inputOf(slot)?.focus({ preventScroll: true }), 250);
    });
}
