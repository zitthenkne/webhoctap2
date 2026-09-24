// room-answer.js — GIẢI THÍCH & BÀN LUẬN NGAY TRÊN ĐỀ: không có khối/cột riêng nào nữa.
//  · Dưới MỖI Ô A/B/C/D một khay (#options-area [data-odisc], renderOptionTalk): giải thích của phương
//    án sửa tại chỗ · lý do của bạn + độ chắc · ai chọn + lý do · nhận xét ✚ đúng vì / ✖ sai vì / 💬.
//  · Ngay sau các ô là KHAY CỦA CÂU HỎI (#answer-block, renderAnswerHub): giải thích chung (lộ đáp án
//    là hiện thẳng, sửa tại chỗ); câu tự luận thì là BÀI LÀM CHUNG — một người gõ, cả phòng xem
//    ("✍️ Lan đang gõ…"), nhận xét song song. Bôi đen một đoạn rồi bấm 💬 để nhận xét đúng đoạn đó.
// Lịch sử: từng có khối "Đáp án & bàn luận" ở cột phải + hàng "Từng phương án" -> lặp y hệt ô ABCD.
// Nhận xét: members/{uid}.args.q<i>.<aid> = { t, o: phương án | null, s: cmt|pro|con|ask|src, qt?: đoạn trích, at }
// Đồng tình: members/{uid}.agree.<aid> = true (xem argsOf trong room-state.js).
import { updateDoc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { showToast } from '../../core/utils.js';
import { renderMath } from '../quiz/quiz-helpers.js';
import {
    room, refs, uid, hasSession, questionAt, answerOf, whyOf, dissentOf, qKey,
    isAccepted, isAnnounced, isShown, isBlind, isEssay, argsOf, agreeCount, myMember, betOf,
    noteOf, noteAuthorOf, optNoteOf, editorOf,
} from './room-state.js';
import { escapeHtml, shortName, avatarHtml, avatarStack, changed } from './room-ui.js';
import { effectiveIndex, repaintOptions } from './room-quiz-stage.js';
import { renderRich, currentEditKey } from './room-editor.js';
import { appendToExplain, questionMsgs, questionMsgsSig, msgTime, chatCmtHtml, chatMsgAction, sendQuestionMessage } from './room-chat.js';
import { uploadImage, imageFilesOf, warnIfTemp } from './room-media.js';

const el = (id) => document.getElementById(id);
const L = (k) => String.fromCharCode(65 + k);
const plain = (v) => String(v ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const nameOf = (m, n = 14) => escapeHtml(shortName(m?.displayName || 'Khách', n));
const text = (t) => escapeHtml(t).replace(/\n/g, '<br>');

// Lập trường của một nhận xét. Hàng phương án xoay vòng 💬 → ✚ → ✖; ô chung xoay 💬 → ❓ → 📚.
const ST = {
    cmt: { ic: '💬', label: 'nhận xét' },
    pro: { ic: '✚', label: 'đúng vì' },
    con: { ic: '✖', label: 'sai vì' },
    ask: { ic: '❓', label: 'hỏi' },
    src: { ic: '📚', label: 'nguồn' },
};
const CYCLE = { row: ['cmt', 'pro', 'con'], box: ['cmt', 'ask', 'src'] };
// Độ chắc của mình: [giá trị, nhãn, giải thích]. 'guess' = chỉ đoán (không cược, vào danh sách ôn lại)
const CONF = [
    ['guess', '🎲 Đoán', 'Chỉ đoán — không cược, được gom vào danh sách cần ôn'],
    ['1', '✓ Chắc', 'Chắc chắn — trúng +điểm thường, trật không mất gì'],
    ['2', '×2', 'Cược ×2: trúng gấp đôi điểm, trật mất 5'],
    ['3', '×3', 'Cược ×3: trúng gấp ba điểm, trật mất 10'],
];

const stance = {};        // `${i}:${slot}` -> lập trường đang chọn (slot = 'g' ô chung | số phương án)
const drafts = {};        // chữ đang gõ dở trong ô nhận xét (giữ lại qua các lần vẽ)
const quotes = {};        // đoạn trích đang gắn kèm (từ nút 💬 khi bôi đen)
const rowPref = {};       // `${i}:${k}` -> người dùng tự mở / gập hàng

// ---------- Vẽ ----------
// KHAY CỦA CÂU HỎI (bản 24): nằm NGAY SAU các ô A/B/C/D, cùng kiểu khay dưới từng ô — không còn là
// một "khối Đáp án & bàn luận" riêng ở cột bên hông (nhìn y hệt khay ABCD -> người dùng thấy lặp).
//  · Giải thích: hiện thẳng khi đã lộ/chốt đáp án (nhóm chưa viết thì là giải thích trong file) hoặc khi
//    nhóm đã viết; bấm vào là sửa (sửa bản file = thành bản của nhóm). Câu tự luận = BÀI LÀM CHUNG.
//  · "💬 n ý kiến về câu này" xổ ra: luồng nhận xét + tin chat/ảnh/tài liệu gắn câu, ô gõ có 🖼 📚.
//  · KHÔNG còn: tiêu đề khối, dòng "đáp án file đang giấu / tham khảo trong file" (chip trạng thái + ô
//    "đáp án trong file" đã nói), khối kết luận "Nhóm chốt B" (ô xanh + chip đã nói; khớp/lệch file
//    nay nằm ở bảng phiếu).
export function renderAnswerHub(i, force = false) {
    const box = el('answer-block');
    const q = questionAt(i);
    if (!box || !q) return;
    const ek = currentEditKey() || '';
    const typingHere = box.contains(document.activeElement)
        && (document.activeElement.matches?.('input, textarea') || ek === 'explain');
    // Đang gõ trong khay -> đừng vẽ lại (mất con trỏ); chỉ cập nhật "ai đang gõ"
    if (!force && box.dataset.qi === String(i) && typingHere) return void paintTyping(i);
    const s = room.session;
    const essay = isEssay(q);
    const revealed = isAnnounced(i) || isShown(i);
    const args = argsOf(i);
    const key = qKey(i);
    if (!force && !changed('hub', [i, essay, revealed, questionMsgsSig(i),
        s.notes?.[key], s.notesBy?.[key], q.explanation, q.modelAnswer, q.expanded, q.note,
        args.filter(a => typeof a.o !== 'number').map(a => [a.id, a.t, a.s, a.qt, a.at, agreeCount(a.id), a.member.displayName, a.member.emoji]),
        Object.keys(myMember()?.agree || {}).filter(k => myMember().agree[k]),
        rowPref[`${i}:g`], stance[`${i}:g`], quotes[`${i}:g`]])) return paintTyping(i);
    box.dataset.qi = String(i);

    const msgs = questionMsgs(i);
    const generalArgs = args.filter(a => typeof a.o !== 'number').sort(byRank);
    const n = generalArgs.length + msgs.length;
    const note = noteOf(i);
    const author = noteAuthorOf(i);
    const fileExp = essay ? (q.modelAnswer || q.explanation || '') : (q.explanation || q.explain || '');
    const fromFile = !essay && !plain(note) && revealed && !!plain(fileExp);
    const shownExp = essay ? note : (plain(note) ? note : (revealed ? fileExp : ''));
    const inlineExp = essay || revealed || !!plain(note);
    const pref = rowPref[`${i}:g`];
    // Luồng ý kiến gập sẵn (trừ bài làm chung): số ý kiến hiện trên thanh, bấm mới xổ — đỡ dài trang
    const talkOpen = !!quotes[`${i}:g`] || (pref !== undefined ? pref : essay);

    const expBox = `<div class="rm-hub-exp" data-live-wrap>
        <div class="rm-hub-boxhead">
            <span class="rm-label">${essay ? '<i class="fas fa-pen-nib"></i> Bài làm chung' : '<i class="fas fa-lightbulb"></i> Giải thích'}</span>
            <span data-live-status></span>
            <span id="typing-hint" class="rm-typing"></span>
            <span class="flex-1"></span>
            ${fromFile ? '<span class="rm-hint">theo file · bấm để sửa</span>'
                : author ? `<span class="rm-hint">${escapeHtml(shortName(author.name || '', 14))} sửa lần cuối</span>` : ''}
        </div>
        <div class="rm-md rm-hub-editor ${essay ? 'is-essay' : ''}" contenteditable="true" data-live-edit="explain"
             data-placeholder="${essay
                ? 'Một người gõ bài làm chung, cả phòng xem cùng lúc… bôi đen một đoạn rồi bấm 💬 để nhận xét đoạn đó'
                : 'Ai cũng gõ được: cách suy luận, mẹo nhớ, dẫn chứng… (Ctrl+V dán ảnh)'}">${renderRich(shownExp)}</div>
    </div>`;

    box.innerHTML = `
        ${essay && isShown(i) && plain(fileExp) ? `<div class="rm-note-callout indigo rm-hub-file"><b><i class="fas fa-file-lines mr-1"></i>Bài giải gợi ý trong file</b><div class="rm-md">${renderRich(fileExp)}</div></div>` : ''}
        ${inlineExp ? expBox : ''}
        ${revealed && q.expanded ? `<div class="rm-note-callout indigo"><b><i class="fas fa-expand mr-1"></i>Mở rộng:</b> <div class="rm-md">${renderRich(q.expanded)}</div></div>` : ''}
        ${revealed && q.note ? `<div class="rm-note-callout"><b><i class="fas fa-thumbtack mr-1"></i>Ghi nhớ:</b> <div class="rm-md">${renderRich(q.note)}</div></div>` : ''}
        <button type="button" class="rm-otalk-tg rm-hub-tg ${talkOpen ? 'is-open' : ''}" data-otalk="g" aria-expanded="${talkOpen}">
            <span>💬 ${n ? `${n} ý kiến về câu này` : (essay ? 'Nhận xét bài làm chung' : 'Bàn về câu này')}</span>
            <i class="fas fa-chevron-down"></i>
        </button>
        ${talkOpen ? `<div class="rm-otalk-body">
            ${inlineExp ? '' : expBox}
            ${threadHtml(generalArgs, msgs)}
            ${composerHtml(i, 'g', essay ? 'Nhận xét bài làm chung…' : 'Ý kiến về câu này… (Ctrl+V dán ảnh)')}
        </div>` : ''}`;
    box.classList.toggle('is-open', inlineExp || talkOpen);
    box.querySelectorAll('[data-live-edit]').forEach(n2 => { n2.dataset.empty = n2.textContent.trim() ? '0' : '1'; });
    box.querySelectorAll('[data-cinput]').forEach(n2 => { n2.value = drafts[`${i}:${n2.dataset.cinput}`] || ''; });
    paintTyping(i);
    renderMath(box);
}

const byRank = (a, b) => agreeCount(b.id) - agreeCount(a.id) || (a.at || 0) - (b.at || 0);

// Luồng chung của câu: nhận xét (args) + tin chat / tài liệu gắn câu (messages.qIdx) trộn theo thời gian.
// Trước đây tin chat theo câu nằm ở tab "Câu N" của bảng Thảo luận -> 2 chỗ bàn cùng một câu.
function threadHtml(argList, msgs) {
    if (!argList.length && !msgs.length) return '';
    const items = [
        ...argList.map(a => ({ at: a.at || 0, html: cmtListHtml([a], true) })),
        ...msgs.map(m => ({ at: msgTime(m), html: chatCmtHtml(m) })),
    ].sort((x, y) => x.at - y.at);
    return `<ul class="rm-cmts">${items.map(x => x.html).join('')}</ul>`;
}

function paintTyping(i) {
    const e = editorOf(i);
    const hint = el('typing-hint');
    if (hint) hint.textContent = e ? `✍️ ${e.name} đang gõ…` : '';
}

// ---------- Khay gắn dưới từng ô A/B/C/D ----------
// Ô đáp án (room-quiz-stage.js · renderOptions) chừa sẵn <div data-odisc="k">; ở đây đổ nội dung vào.
// Thứ tự trong khay: giải thích của phương án (sửa tại chỗ) · lý do của BẠN (ô mình chọn) · thanh
// "ai chọn + lý do · nhận xét" bấm để xổ -> lý do từng người, nhận xét, ô gõ nhận xét.
// Khay trống thì ẩn hẳn: trước khi lộ đáp án, ô không có gì để bàn giữ nguyên gọn như ô trắc nghiệm.
export function renderOptionTalk(i, force = false) {
    const area = el('options-area');
    const q = questionAt(i);
    if (!area || !q || isEssay(q)) return;
    const slots = area.querySelectorAll('[data-odisc]');
    if (!slots.length) return;
    const ek = currentEditKey() || '';
    const typing = area.contains(document.activeElement)
        && (document.activeElement.matches?.('input, textarea') || ek === 'why' || ek.startsWith('optexp:'));
    if (!force && typing) return;
    const s = room.session;
    const key = qKey(i);
    const open = isAnnounced(i) || isShown(i) || (!!s.liveStats && !isBlind(i));
    const revealed = isAnnounced(i) || isShown(i);
    const args = argsOf(i);
    const sig = [i, open, revealed, s.chosen?.[key], s.alsoOk?.[key], s.split?.[key], s.optNotes?.[key], q.optionExplanations,
        args.map(a => [a.id, a.t, a.o, a.s, a.qt, a.at, agreeCount(a.id), a.member.displayName, a.member.emoji]),
        room.members.map(m => [m.uid, m.displayName, m.emoji, answerOf(m, i), m.dissent?.[key]]),
        Object.keys(myMember()?.agree || {}).filter(k => myMember().agree[k]),
        Object.entries(rowPref).filter(([k]) => k.startsWith(i + ':')), JSON.stringify(stance), JSON.stringify(quotes), slots.length];
    if (!changed('otalk', sig) && !force) return;

    const people = room.members.filter(m => typeof answerOf(m, i)?.i === 'number');
    const mineA = answerOf(myMember(), i);
    slots.forEach(slot => {
        const k = Number(slot.dataset.odisc);
        const html = talkHtml(i, q, k, people, args, open, revealed, mineA);
        slot.innerHTML = html;
        slot.classList.toggle('hidden', !html);
        slot.closest('.rm-ocard')?.classList.toggle('has-talk', !!html);
    });
    area.querySelectorAll('[data-live-edit]').forEach(n => { if (n.closest('[data-odisc]')) n.dataset.empty = n.textContent.trim() ? '0' : '1'; });
    area.querySelectorAll('[data-cinput]').forEach(n => { n.value = drafts[`${i}:${n.dataset.cinput}`] || ''; });
    slots.forEach(slot => { if (slot.innerHTML) renderMath(slot); });
}

function talkHtml(i, q, k, people, args, open, revealed, mineA) {
    const who = people.filter(m => answerOf(m, i).i === k);
    const cm = args.filter(a => a.o === k && (open || a.uid === uid())).sort(byRank);
    const hidden = open ? 0 : args.filter(a => a.o === k && a.uid !== uid()).length;
    const note = optNoteOf(i, k);
    const exp = note || (revealed && q.optionExplanations?.[k]) || '';
    const ok = isAccepted(i, k);
    const mine = mineA?.i === k;
    const said = (m) => { const a = answerOf(m, i); return !!plain(whyOf(m, i)) || (typeof a.from === 'number' && a.from !== a.i) || dissentOf(m, i); };
    const lines = open ? who.filter(m => said(m) && m.uid !== uid()) : [];
    const quoted = !!quotes[`${i}:${k}`];
    const talkN = lines.length + cm.length + hidden;
    // Có gì để hiện? Chưa lộ đáp án thì chỉ ô mình chọn + ô đã có giải thích/bàn luận mới có khay
    const inlineExp = revealed || !!plain(note);
    if (!mine && !inlineExp && !talkN && !quoted) return '';

    const pref = rowPref[`${i}:${k}`];
    const isOpen = quoted || (pref !== undefined ? pref : (ok || mine) && talkN > 0);
    const expBox = (inline) => `<div class="rm-otalk-exp ${inline ? 'is-inline' : ''}" data-live-wrap>
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
        ? `<span class="rm-conf" role="group" aria-label="Bạn chắc tới mức nào">${CONF.map(([v, l, t]) =>
            `<button type="button" class="rm-conf-b is-${v} ${conf === v ? 'on' : ''}" data-conf="${v}" title="${t}">${l}</button>`).join('')}</span>`
        : mineA.guess ? '<span class="rm-tagmini">🎲 đoán</span>' : bet > 1 ? `<span class="rm-tagmini">cược ×${bet}</span>` : '';
    return `
        ${inlineExp ? expBox(true) : ''}
        ${mine ? `<div class="rm-otalk-mine" data-live-wrap>
            <span class="rm-otalk-me">${avatarHtml(myMember(), 'xs')}Lý do của bạn${from !== null ? ` <span class="rm-tagmini is-move">đổi từ ${L(from)}</span>` : ''}</span><span data-live-status></span>
            ${confHtml}
            ${differ ? `<button type="button" class="rm-tagmini ${dissentOf(myMember(), i) ? 'is-warn' : ''}" data-dissent-here title="Ý kiến của bạn vẫn được ghi vào biên bản">✋ ${dissentOf(myMember(), i) ? 'Đang bảo lưu' : 'Bảo lưu ' + L(k)}</button>` : ''}
            <div class="rm-md rm-hub-mini" contenteditable="true" data-live-edit="why" data-placeholder="Vì sao bạn chọn ${L(k)}? — hiện kèm tên cho cả nhóm">${renderRich(whyOf(myMember(), i))}</div>
        </div>` : ''}
        <button type="button" class="rm-otalk-tg ${isOpen ? 'is-open' : ''}" data-otalk="${k}" aria-expanded="${isOpen}">
            ${lines.length ? `<span class="rm-otalk-faces">${avatarStack(lines, 3, 'xs')}</span><span>${lines.length} lý do</span>` : ''}
            ${cm.length || hidden ? `<span>💬 ${cm.length + hidden} nhận xét</span>` : ''}
            ${!talkN ? `<span>💬 Bàn về ${L(k)}</span>` : ''}
            <i class="fas fa-chevron-down"></i>
        </button>
        ${isOpen ? `<div class="rm-otalk-body">
            ${lines.length ? `<ul class="rm-camp-people">${lines.map(m => personLine(m, i)).join('')}</ul>` : ''}
            ${inlineExp ? '' : expBox(false)}
            ${cmtListHtml(cm)}
            ${hidden ? `<p class="rm-hint">🙈 ${hidden} nhận xét của người khác hiện khi mở phiếu.</p>` : ''}
            ${composerHtml(i, k, `Nhận xét về ${L(k)}…`)}
        </div>` : ''}`.trim();
}

function personLine(m, i) {
    const a = answerOf(m, i);
    const tags = [];
    if (typeof a.from === 'number' && a.from !== a.i) tags.push(`<span class="rm-tagmini is-move" title="Đổi ý sau khi bàn">đổi từ ${L(a.from)}</span>`);
    if (a.guess) tags.push('<span class="rm-tagmini">đoán</span>');
    if (dissentOf(m, i)) tags.push('<span class="rm-tagmini is-warn">✋ bảo lưu</span>');
    return `<li>${avatarHtml(m, 'sm')}
        <div class="min-w-0 flex-1">
            <p class="rm-camp-name"><b>${nameOf(m)}</b>${tags.join('')}</p>
            ${plain(whyOf(m, i)) ? `<div class="rm-camp-why rm-md">${renderRich(whyOf(m, i))}</div>` : '<p class="rm-hint">chưa ghi lý do</p>'}
        </div>
    </li>`;
}

function cmtListHtml(list, bare = false) {
    if (!list.length) return '';
    const mineAgree = myMember()?.agree || {};
    const lis = list.map(a => {
        const st = ST[a.s] || ST.cmt;
        const n = agreeCount(a.id);
        return `<li class="rm-cmt is-${a.s || 'cmt'}">
            <span class="rm-cmt-ic" title="${st.label}">${st.ic}</span>
            <div class="min-w-0 flex-1">
                ${a.qt ? `<q class="rm-cmt-q">${escapeHtml(String(a.qt).slice(0, 160))}</q>` : ''}
                <p class="rm-cmt-t"><b>${nameOf(a.member)}</b>${a.s === 'pro' || a.s === 'con' ? ` <em>${st.label}</em>` : ''} ${text(a.t)}</p>
            </div>
            <div class="rm-cmt-acts">
                <button type="button" class="rm-like ${mineAgree[a.id] ? 'on' : ''}" data-agree="${a.id}" title="Đồng tình">👍${n ? ' ' + n : ''}</button>
                <button type="button" class="rm-like" data-cmt-exp="${a.id}" title="Đưa vào giải thích chung (ghi tên người viết)"><i class="fas fa-lightbulb"></i></button>
                ${a.uid === uid() ? `<button type="button" class="rm-like" data-cmt-del="${a.id}" title="Xoá nhận xét của bạn"><i class="fas fa-trash-can"></i></button>` : ''}
            </div>
        </li>`;
    }).join('');
    return bare ? lis : `<ul class="rm-cmts">${lis}</ul>`;
}

function composerHtml(i, slot, placeholder) {
    const kind = slot === 'g' ? 'box' : 'row';
    const s = stance[`${i}:${slot}`] || 'cmt';
    const qt = quotes[`${i}:${slot}`];
    return `<form class="rm-cform" data-cform="${slot}" autocomplete="off">
        ${qt ? `<div class="rm-cform-q"><q>${escapeHtml(qt.slice(0, 160))}</q><button type="button" data-quote-x="${slot}" title="Bỏ trích"><i class="fas fa-times"></i></button></div>` : ''}
        <div class="rm-cform-row">
            <button type="button" class="rm-cst is-${s}" data-cycle="${slot}" data-kind="${kind}" title="Đổi loại: ${CYCLE[kind].map(x => ST[x].ic + ' ' + ST[x].label).join(' · ')}">${ST[s].ic}<span>${ST[s].label}</span></button>
            <input class="rm-input rm-cinput" data-cinput="${slot}" maxlength="600" placeholder="${escapeHtml(placeholder)}">
            ${slot === 'g' ? `<button type="button" class="rm-cform-tool" data-hub-img title="Đính ảnh (hoặc Ctrl+V vào ô)"><i class="fas fa-image"></i></button>
            <button type="button" class="rm-cform-tool" data-hub-doc title="Trích tài liệu (sách, bài giảng, link)"><i class="fas fa-book-medical"></i></button>
            <input type="file" accept="image/*" multiple hidden data-hub-file>` : ''}
            <button type="submit" class="rm-cform-send" title="Gửi (Enter)"><i class="fas fa-paper-plane"></i></button>
        </div>
    </form>`;
}

// ---------- Hành động ----------
// Ô gõ nhận xét: 'g' ở khối chung, số phương án ở khay dưới ô đáp án
const inputOf = (slot) => document.querySelector(String(slot) === 'g'
    ? '#answer-block [data-cinput="g"]' : `#options-area [data-cinput="${slot}"]`);
const repaint = (i, slot) => (String(slot) === 'g' ? renderAnswerHub(i, true) : renderOptionTalk(i, true));

async function send(slot) {
    const i = effectiveIndex();
    const k = `${i}:${slot}`;
    const input = inputOf(slot);
    const t = String(input?.value || '').trim();
    if (!t || !hasSession()) return;
    const aid = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const data = { t: t.slice(0, 600), o: slot === 'g' ? null : Number(slot), s: stance[k] || 'cmt', at: Date.now() };
    if (quotes[k]) data.qt = quotes[k].slice(0, 300);
    delete drafts[k];
    delete quotes[k];
    input.value = '';
    await updateDoc(refs.member(), { [`args.q${i}.${aid}`]: data })
        .catch(() => { drafts[k] = t; showToast('Chưa gửi được — thử lại nhé.', 'error'); });
    repaint(i, slot);
    inputOf(slot)?.focus({ preventScroll: true });
}

/** Ảnh vào luồng chung của câu: nén + tải lên host ngoài rồi gửi thành tin gắn câu (kèm chữ đang gõ). */
async function sendImages(files) {
    const list = [...files].filter(f => /^image\//.test(f.type)).slice(0, 4);
    if (!list.length || !hasSession()) return;
    const i = effectiveIndex();
    const input = inputOf('g');
    showToast(`Đang tải ${list.length} ảnh lên…`, 'info', 1600);
    const res = (await Promise.all(list.map(f => uploadImage(f).catch(() => null)))).filter(Boolean);
    if (!res.length) return void showToast('Ảnh chưa tải lên được — thử lại nhé.', 'error');
    res.forEach(warnIfTemp);
    const text = String(input?.value || '').trim();
    try {
        await sendQuestionMessage(i, text, res);
        if (input) input.value = '';
        delete drafts[`${i}:g`];
    } catch (e) { showToast('Chưa gửi được — thử lại nhé.', 'error'); }
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

export function initAnswerHub() {
    const box = el('answer-block');
    if (!box) return;
    // Ghi chú riêng (cột phụ): máy tính nay xếp DƯỚI câu hỏi -> gập sẵn; khay "Ghi chú" điện thoại thì mở
    const notes = document.querySelector('.rm-col-side .rm-notes');
    if (notes) notes.open = window.matchMedia('(max-width: 767px)').matches;
    // Cùng một bộ thao tác cho 2 nơi: khối chung (#answer-block) và khay dưới ô đáp án (#options-area)
    const area = el('options-area');
    const roots = [box, area].filter(Boolean);
    const on = (type, fn, capture) => roots.forEach(r => r.addEventListener(type, fn, capture));
    on('submit', (e) => {
        const f = e.target.closest('[data-cform]');
        if (!f) return;
        e.preventDefault();
        send(f.dataset.cform);
    });
    on('input', (e) => {
        const n = e.target.closest?.('[data-cinput]');
        if (n) drafts[`${effectiveIndex()}:${n.dataset.cinput}`] = n.value;
    });
    // Ảnh vào luồng chung: nút 🖼 (ô chọn file ẩn) hoặc Ctrl+V ảnh vào ô gõ chung
    box.addEventListener('change', (e) => {
        const f = e.target.closest?.('[data-hub-file]');
        if (f) { sendImages(f.files); f.value = ''; }
    });
    box.addEventListener('paste', (e) => {
        if (!e.target.closest?.('[data-cinput="g"]')) return;
        const imgs = imageFilesOf(e.clipboardData);
        if (!imgs.length || e.clipboardData.getData('text/plain').trim()) return;
        e.preventDefault();
        sendImages(imgs);
    });
    // Rời ô nhận xét -> vẽ lại cho kịp những gì người khác vừa gửi trong lúc mình gõ.
    // Khay dưới ô đáp án: vẽ lại CẢ ô (số phiếu có thể đã đổi trong lúc gõ — xem chốt chặn ở renderOptions).
    on('focusout', (e) => {
        const root = e.currentTarget;
        if (!e.target.closest?.('[data-cinput]') && !e.target.closest?.('[data-odisc] [data-live-edit]')) return;
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
        if (b('[data-hub-img]')) return void box.querySelector('[data-hub-file]')?.click();
        if (b('[data-hub-doc]')) return void el('chat-doc-btn')?.click();   // hộp trích tài liệu, gắn vào câu đang xem
        if (b('[data-like], [data-toexp]') && chatMsgAction(e)) return;
        if ((x = b('[data-otalk]'))) {
            const k = x.dataset.otalk === 'g' ? 'g' : Number(x.dataset.otalk);
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
            const slot = x.dataset.cycle;
            const k = `${i}:${slot}`;
            const cyc = CYCLE[x.dataset.kind];
            stance[k] = cyc[(cyc.indexOf(stance[k] || 'cmt') + 1) % cyc.length];
            const s = ST[stance[k]];
            x.className = `rm-cst is-${stance[k]}`;
            x.innerHTML = `${s.ic}<span>${s.label}</span>`;
            return void inputOf(slot)?.focus();
        }
        if ((x = b('[data-quote-x]'))) { delete quotes[`${i}:${x.dataset.quoteX}`]; return repaint(i, x.dataset.quoteX); }
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
            const html = `<p>${st.ic} <b>${escapeHtml(a.member.displayName || 'Khách')}</b>${about}: ${a.qt ? `<i>“${escapeHtml(a.qt)}”</i> — ` : ''}${text(a.t)}</p>`;
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
        const input = inputOf(slot);
        input?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setTimeout(() => input?.focus({ preventScroll: true }), 250);
    });
}
