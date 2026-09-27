// room-reason.js — LẬP LUẬN CÓ KHUÔN (bản 44). 4 chip 🔬 Cơ chế · 🧩 Loại trừ · 📖 Theo · 💡 Mẹo nhớ dưới
// "Lý do của bạn" và "Giải thích" (sổ tay) không còn chèn một dòng chữ đậm trống nữa: bấm là mở FORM ngay
// dưới ô gõ, điền xong thành một khối gọn trong ô đó. Bấm lại chip (có ✓) = sửa khối cũ, không chèn trùng.
//  · Loại trừ: mỗi phương án còn lại một dòng "X sai vì…" + chip lý do nhanh + dùng lại lý do của bạn khác;
//    lưu có cấu trúc ở members/{uid}.rf.q<i>.elim = { o: { o<k>: 'chữ' }, pub, at } -> khay của ô X hiện
//    "✖ Lý do loại X" (room-answer.js), Lưu đề + biên bản gộp vào giải thích phương án (optExpFull).
//  · Cơ chế: chuỗi bước có mũi tên + kết luận, tùy chọn tự vẽ sơ đồ Mermaid.
//  · Theo: nguồn (gợi ý nguồn của câu + nguồn vừa dùng) · chương/trang · trích nguyên văn · link.
//  · Mẹo nhớ: ý cần nhớ -> tự ghép chữ cái đầu; tùy chọn đưa vào 📌 Ghi nhớ chung của câu.
// Dữ liệu form: members/{uid}.rf.q<i>.<mech|elim|src|tip> (điền sẵn khi mở lại). Khối trong ô gõ là một
// <div> cấp 1 bắt đầu bằng nhãn "🔬 Cơ chế" … -> tìm đúng khối đó để thay.
import { updateDoc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { showToast } from '../../core/utils.js';
import { stripOptionLabels } from '../quiz/quiz-helpers.js';
import {
    room, refs, uid, qKey, questionAt, optsOf, myMember, answerOf, whyOf, noteOf, optNoteOf,
    isShown, isAnnounced, acceptedOf, extraOf, talkOpen,
} from './room-state.js';
import { escapeHtml, shortName, avatarHtml } from './room-ui.js';
import { renderRich, sanitizeHtml, renderRichMath, saveNode, isBlank } from './room-editor.js';

const L = (k) => String.fromCharCode(65 + k);
const esc = escapeHtml;
const plain = (v) => String(v ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const hasText = (v) => !!plain(v) || /<img/i.test(String(v || ''));

export const RF = {
    mech: { ic: '🔬', lb: 'Cơ chế', sub: 'chuỗi nguyên nhân → biểu hiện', tip: 'Viết cơ chế thành chuỗi bước (có thể tự vẽ sơ đồ)' },
    elim: { ic: '🧩', lb: 'Loại trừ', sub: 'vì sao các phương án còn lại sai', tip: 'Từng phương án còn lại sai vì đâu — tự ghi vào giải thích của ô đó' },
    src: { ic: '📖', lb: 'Theo', sub: 'dẫn nguồn có trang, có trích', tip: 'Sách / bài giảng / guideline — kèm trang và câu trích' },
    tip: { ic: '💡', lb: 'Mẹo nhớ', sub: 'ý cần nhớ + chữ cái đầu', tip: 'Liệt kê ý cần nhớ, tự ghép chữ cái đầu thành mẹo' },
};
const ORDER = ['mech', 'elim', 'src', 'tip'];
const markOf = (t) => `${RF[t].ic} ${RF[t].lb}`;
const ELIM_CHIPS = ['Sai vị trí / giải phẫu', 'Sai cơ chế', 'Không phải hay gặp nhất', 'Đúng nhưng chưa phải ý tốt nhất',
    'Ngược lại mới đúng', 'Chống chỉ định', 'Không liên quan câu hỏi'];
const SRC_DEFAULT = ['Guyton & Hall', 'Harrison', 'Robbins', 'Bài giảng bộ môn', 'Phác đồ Bộ Y tế', 'Dược thư Quốc gia'];
const MECH_PH = ['Nguyên nhân / yếu tố khởi phát', 'Cơ chế trung gian', 'Hậu quả / biểu hiện'];

const open = {};     // `${i}:${key}` -> loại form đang mở (key = 'why' | 'explain')
const lastIn = {};   // `${i}:${key}` -> ô vừa gõ trong form Loại trừ (chip lý do nhanh điền vào đây)
const draft = {};    // `${i}:${loại}` -> dữ liệu đang điền, sống qua các lần vẽ lại khay / sổ tay
let repaintFn = () => {};

/** Chữ ký trạng thái form của câu i — room-answer nhét vào changed('otalk' / 'nb'). */
export const reasonSig = (i) => Object.entries(open).filter(([k]) => k.startsWith(i + ':'));

// ---------- Dữ liệu dùng chung ----------
export const rfOf = (m, i, t) => m?.rf?.[qKey(i)]?.[t] || null;
/** Lý do loại phương án k của cả phòng (chỉ người để "ghi vào giải thích"). */
export function elimsOf(i, k) {
    return room.members.map(m => {
        const e = rfOf(m, i, 'elim');
        const t = e && e.pub !== false ? String(e.o?.['o' + k] || '').trim() : '';
        return t ? { member: m, uid: m.uid, t } : null;
    }).filter(Boolean);
}
/** Phương án chính mình đã loại (kể cả không công khai) -> ô đó mờ + gạch. */
export const myElimSet = (i) => new Set(Object.entries(rfOf(myMember(), i, 'elim')?.o || {})
    .filter(([, t]) => String(t || '').trim()).map(([ok]) => Number(ok.slice(1))));

/** Lập luận có những mảnh nào (theo nhãn khối trong nội dung). */
export const piecesOf = (html) => { const t = plain(html); return ORDER.filter(x => t.includes(markOf(x))); };
export const badgesHtml = (html) => {
    const p = piecesOf(html);
    return p.length ? `<span class="rm-rf-badges" title="Lập luận có: ${p.map(x => RF[x].lb.toLowerCase()).join(', ')}">${p.map(x => RF[x].ic).join('')}</span>` : '';
};

/** Giải thích của nhóm + lời giải trong file: nhóm viết TRƯỚC khi lộ đáp án thì lời giải file không được mất. */
export function mergeExp(note, file) {
    if (!hasText(note)) return file || '';
    if (!hasText(file)) return note;
    const head = plain(renderRich(file)).slice(0, 60);
    return plain(renderRich(note)).includes(head) ? note : renderRich(note) + '<hr>' + renderRich(file);
}
/** Lời giải trong file có còn nằm trong giải thích nhóm không (để hiện khối "📄 Lời giải trong file"). */
export const fileLost = (note, file) => hasText(note) && hasText(file) && !plain(renderRich(note)).includes(plain(renderRich(file)).slice(0, 60));
/** Giải thích 1 phương án khi LƯU ĐỀ / BIÊN BẢN = giải thích (nhóm ⊕ file) + lý do loại trừ của cả nhóm. */
export function optExpFull(i, k, file) {
    const base = mergeExp(optNoteOf(i, k), file || '');
    const list = elimsOf(i, k);
    if (!list.length) return base;
    return (hasText(base) ? renderRich(base) : '') + `<p><b>✖ Loại trừ ${L(k)}:</b></p><ul>`
        + list.map(x => `<li><b>${esc(shortName(x.member.displayName || 'Khách', 18))}:</b> ${esc(x.t)}</li>`).join('') + '</ul>';
}

/** Khối "✖ Lý do loại X" trong khay của ô X (người khác chỉ hiện khi đã mở phiếu — như nhận xét). */
export function elimListHtml(i, k) {
    const list = elimsOf(i, k).filter(x => x.uid === uid() || talkOpen(i));
    if (!list.length) return '';
    return `<div class="rm-elim">
        <p class="rm-elim-h">✖ Lý do loại ${L(k)}<b>${list.length}</b></p>
        <ul>${list.map(x => `<li>${avatarHtml(x.member, 'xs')}<b>${x.uid === uid() ? 'Bạn' : esc(shortName(x.member.displayName || 'Khách', 12))}</b><span>${esc(x.t)}</span></li>`).join('')}</ul>
    </div>`;
}

// ---------- Hàng chip + form ----------
/** Hàng chip dưới ô gõ `key` của câu i (html = nội dung đang lưu, để biết mảnh nào đã có). */
export function reasonToolsHtml(i, key, html, extra = '') {
    const have = piecesOf(html);
    const cur = open[`${i}:${key}`];
    return `<div class="rm-why-tools rm-rf-tools" data-rf-i="${i}">
        ${ORDER.map(t => `<button type="button" class="rm-why-tpl ${have.includes(t) ? 'is-have' : ''} ${cur === t ? 'on' : ''}" data-rf-open="${t}" data-rf-key="${key}"
            title="${have.includes(t) ? 'Đã có — bấm để sửa khối này' : RF[t].tip}" aria-expanded="${cur === t}">${RF[t].ic} ${RF[t].lb}${have.includes(t) ? '<i class="rm-rf-ok">✓</i>' : ''}</button>`).join('')}
        <span class="rm-rf-meter is-${have.length}" title="Lập luận chặt = đủ 4 mảnh: cơ chế · loại trừ · nguồn · mẹo nhớ">${have.length}/4</span>
        ${extra}
    </div>${cur ? formHtml(i, key, cur) : ''}`;
}

function draftOf(i, t) {
    const dk = `${i}:${t}`;
    if (!draft[dk]) {
        const old = rfOf(myMember(), i, t);
        draft[dk] = old ? JSON.parse(JSON.stringify(old)) : {};
        const d = draft[dk];
        if (t === 'elim') { d.o = d.o || {}; if (d.pub === undefined) d.pub = true; }
        if (t === 'mech') d.steps = Array.isArray(d.steps) && d.steps.length >= 2 ? d.steps : ['', '', ''];
    }
    return draft[dk];
}

/** Phương án cần giải thích vì sao sai: ô lý do = mọi ô trừ ô mình chọn; ô giải thích = trừ đáp án đã chốt. */
function elimTargets(i, key) {
    const n = optsOf(questionAt(i)).length;
    const mine = answerOf(myMember(), i)?.i;
    const acc = acceptedOf(i);
    const skip = key === 'why' ? [mine] : acc.length ? acc : [mine];
    return [...Array(n).keys()].filter(k => !skip.includes(k));
}

const field = (path, value, ph, cls = '', tag = 'input') => tag === 'textarea'
    ? `<textarea class="rm-input rm-rf-in ${cls}" data-rf-f="${path}" rows="2" placeholder="${esc(ph)}">${esc(value || '')}</textarea>`
    : `<input class="rm-input rm-rf-in ${cls}" data-rf-f="${path}" value="${esc(value || '')}" placeholder="${esc(ph)}" autocomplete="off">`;

const mechChain = (d) => (d.steps || []).map(s => String(s || '').trim()).filter(Boolean);

const BODY = {
    elim(i, key, d) {
        const q = questionAt(i);
        const opts = stripOptionLabels(optsOf(q));
        const ks = elimTargets(i, key);
        if (!ks.length) return '<p class="rm-hint">Câu này không còn phương án nào để loại.</p>';
        // MỘT hàng lý do nhanh cho cả form (điền vào ô đang chọn) — 7 chip lặp dưới mỗi phương án thì rối mắt
        return `<div class="rm-rf-chips is-quick"><span>Lý do nhanh →</span>${ELIM_CHIPS.map(c => `<button type="button" data-rf-chip data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>
        <div class="rm-rf-rows">${ks.map(k => {
            const peers = talkOpen(i) ? elimsOf(i, k).filter(x => x.uid !== uid()).slice(0, 3) : [];
            return `<div class="rm-rf-opt">
                <span class="rm-rf-letter">${L(k)}</span>
                <div class="rm-rf-obody">
                    <p class="rm-rf-otext">${esc(plain(renderRich(opts[k])).slice(0, 110))}</p>
                    ${field('o' + k, d.o?.['o' + k], `${L(k)} sai vì…`)}
                    ${peers.length ? `<div class="rm-rf-peers">${peers.map(x => `<button type="button" data-rf-use="o${k}" data-v="${esc(x.t)}" title="Dùng lại lý do này">
                        ${avatarHtml(x.member, 'xs')}<b>${esc(shortName(x.member.displayName || 'Khách', 10))}:</b> ${esc(x.t.slice(0, 80))}</button>`).join('')}</div>` : ''}
                </div>
            </div>`;
        }).join('')}</div>
        <label class="rm-rf-check"><input type="checkbox" data-rf-f="pub" ${d.pub !== false ? 'checked' : ''}> Ghi vào giải thích của từng phương án bị loại (cả nhóm thấy · có trong Lưu đề + biên bản)</label>`;
    },
    mech(i, key, d) {
        const mine = answerOf(myMember(), i)?.i;
        const chain = mechChain(d);
        return `<ol class="rm-rf-steps">${d.steps.map((s, x) => `<li>
                ${field('steps.' + x, s, MECH_PH[x] || 'Bước tiếp theo')}
                ${d.steps.length > 2 ? `<button type="button" class="rm-rf-del" data-rf-del-step="${x}" title="Bỏ bước này">✕</button>` : ''}
            </li>`).join('')}</ol>
        <button type="button" class="rm-rf-add" data-rf-add-step>＋ Thêm bước</button>
        ${field('end', d.end, `Vì vậy… (vd. chọn ${typeof mine === 'number' ? L(mine) : 'đáp án'} vì…)`)}
        <p class="rm-rf-prev" data-rf-prev>${chain.length ? chain.map(esc).join(' <i>→</i> ') : 'Xem trước: bước 1 → bước 2 → …'}</p>
        <label class="rm-rf-check"><input type="checkbox" data-rf-f="dia" ${d.dia ? 'checked' : ''}> Vẽ luôn thành sơ đồ (sửa / phóng to được như sơ đồ thường)</label>`;
    },
    src(i, key, d) {
        const q = questionAt(i);
        let recent = [];
        try { recent = JSON.parse(localStorage.getItem('roomSrcRecent') || '[]'); } catch (e) {}
        const own = q.source ? [String(q.source).split(/\s*[›>]\s*/).pop()] : [];
        const sug = [...new Set([...own, ...recent, ...SRC_DEFAULT].map(s => String(s).trim()).filter(Boolean))].slice(0, 7);
        return `<div class="rm-rf-grid">
            ${field('book', d.book, 'Sách / bài giảng / guideline', 'is-book')}
            ${field('page', d.page, 'Chương · trang', 'is-page')}
        </div>
        <div class="rm-rf-chips">${sug.map(s => `<button type="button" data-rf-sug="book" data-v="${esc(s)}">${esc(s)}</button>`).join('')}</div>
        ${field('quote', d.quote, 'Trích nguyên văn (dán đoạn trong sách vào đây)', '', 'textarea')}
        ${field('link', d.link, 'Link (không bắt buộc) — https://…')}`;
    },
    tip(i, key, d) {
        const fileNote = room.session?.questions?.[i]?.note;
        const canNote = !hasText(fileNote) || isShown(i) || typeof extraOf(i)?.note === 'string';
        return `${field('items', d.items, 'Ý cần nhớ — mỗi dòng một ý (vd. Nút xoang / Nhĩ phải / Tĩnh mạch chủ trên)', '', 'textarea')}
        <div class="rm-rf-grid">
            ${field('tip', d.tip, 'Mẹo: câu vần, chữ cái đầu, hình ảnh…', 'is-book')}
            <button type="button" class="rm-rf-add" data-rf-acr title="Ghép chữ cái đầu của từng ý">✨ Chữ cái đầu</button>
        </div>
        <label class="rm-rf-check ${canNote ? '' : 'is-off'}"><input type="checkbox" data-rf-f="toNote" ${d.toNote && canNote ? 'checked' : ''} ${canNote ? '' : 'disabled'}>
            Đưa vào 📌 Ghi nhớ chung của câu${canNote ? '' : ' (mở được sau khi lộ đáp án — file có sẵn ghi nhớ)'}</label>`;
    },
};

function formHtml(i, key, t) {
    const d = draftOf(i, t);
    return `<div class="rm-rf is-${t}" data-rf="${t}" data-rf-key="${key}" data-rf-i="${i}">
        <div class="rm-rf-head"><span class="rm-rf-ic">${RF[t].ic}</span><b>${RF[t].lb}</b><span class="rm-rf-sub">${RF[t].sub}</span>
            <button type="button" class="rm-rf-x" data-rf-close title="Đóng (Esc)">✕</button></div>
        ${BODY[t](i, key, d)}
        <div class="rm-rf-foot">
            <span class="rm-rf-keys">Enter sang ô kế · Ctrl+Enter lưu · Esc đóng</span>
            ${rfOf(myMember(), i, t) ? '<button type="button" class="rm-rf-cancel" data-rf-clear title="Gỡ khối này khỏi ô">Gỡ khối</button>' : ''}
            <button type="button" class="rm-rf-cancel" data-rf-close>Huỷ</button>
            <button type="button" class="rm-rf-save" data-rf-save>${key === 'why' ? 'Lưu vào lý do' : 'Lưu vào giải thích'}</button>
        </div>
    </div>`;
}

// ---------- Khối kết quả ----------
function blockHtml(t, d, i) {
    const E = (v) => esc(String(v || '').trim());
    if (t === 'elim') {
        const rows = Object.entries(d.o || {}).filter(([, v]) => String(v || '').trim()).sort();
        return rows.length ? `<div><b>${markOf(t)}:</b><ul>${rows.map(([ok, v]) => `<li><b>${L(Number(ok.slice(1)))}</b> — ${E(v)}</li>`).join('')}</ul></div>` : '';
    }
    if (t === 'mech') {
        const chain = mechChain(d);
        if (!chain.length && !String(d.end || '').trim()) return '';
        const lab = (s) => String(s).replace(/"/g, '#quot;').replace(/[\r\n]+/g, ' ').slice(0, 90);
        const nodes = [...chain.map((s, x) => `n${x}["${lab(s)}"]`), ...(String(d.end || '').trim() ? [`nE(["${lab(d.end)}"])`] : [])];
        const dia = d.dia && nodes.length >= 2 ? `<div data-mermaid="${encodeURIComponent('flowchart LR\n    ' + nodes.join(' --> '))}"></div>` : '';
        return `<div><b>${markOf(t)}:</b> ${chain.map(E).join(' → ')}${String(d.end || '').trim() ? `${chain.length ? '<br>' : ''}⇒ <i>${E(d.end)}</i>` : ''}${dia}</div>`;
    }
    if (t === 'src') {
        if (!String(d.book || '').trim() && !String(d.quote || '').trim()) return '';
        const link = /^https?:\/\/\S+$/i.test(String(d.link || '').trim()) ? ` <a href="${E(d.link)}">🔗 mở nguồn</a>` : '';
        return `<div><b>${markOf(t)}</b> <u>${E(d.book) || 'tài liệu'}</u>${String(d.page || '').trim() ? `, ${E(d.page)}` : ''}${String(d.quote || '').trim() ? `: <i>“${E(d.quote)}”</i>` : ''}${link}</div>`;
    }
    if (t === 'tip') {
        const items = String(d.items || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
        if (!items.length && !String(d.tip || '').trim()) return '';
        return `<div><b>${markOf(t)}:</b> ${E(d.tip)}${items.length ? `<ul>${items.map(s => `<li><b>${esc(s.charAt(0))}</b>${esc(s.slice(1))}</li>`).join('')}</ul>` : ''}</div>`;
    }
    return '';
}

/** Nội dung ĐANG LƯU của ô (khi ô không còn trên màn). */
function storedOf(key, i) {
    const q = questionAt(i);
    if (key === 'why') return whyOf(myMember(), i);
    if (key === 'explain') return noteOf(i) || (isShown(i) ? (q?.explanation || q?.explain || '') : '');
    return '';
}
const editorOf = (key) => document.querySelector(`${key === 'why' ? '#options-area' : '#notebook'} [data-live-edit="${key}"]`);

/** Thay (hoặc thêm / gỡ) khối cấp 1 bắt đầu bằng `mark` trong ô `key` của câu i, rồi lưu. */
function putBlock(i, key, mark, html) {
    const node = editorOf(key);
    const box = node || document.createElement('div');
    if (!node) box.innerHTML = renderRich(storedOf(key, i));
    const old = [...box.children].find(c => /^(DIV|P)$/.test(c.tagName) && c.textContent.trim().startsWith(mark));
    if (html) {
        const tmp = document.createElement('div');
        tmp.innerHTML = renderRich(html);                    // nở <div data-mermaid> thành khung sơ đồ
        const blk = tmp.firstElementChild;
        if (!blk) return;
        if (old) old.replaceWith(blk); else box.append(blk);
    } else if (old) old.remove();
    if (node) {
        node.dataset.empty = isBlank(node) ? '1' : '0';
        renderRichMath(node);
        saveNode(node);
    } else {
        window.dispatchEvent(new CustomEvent('room:edit', { detail: { key, qi: i, html: sanitizeHtml(box.innerHTML) } }));
    }
}

async function save(i, key, t, clear = false) {
    const d = draftOf(i, t);
    if (key === 'why' && !answerOf(myMember(), i)) return showToast('Chọn một đáp án trước đã nhé.', 'info');
    const html = clear ? '' : blockHtml(t, d, i);
    if (!clear && !html) return showToast('Form còn trống — điền ít nhất một ô.', 'info');
    putBlock(i, key, markOf(t), html);
    const data = clear ? null : { ...d, at: Date.now() };
    if (data && t === 'elim') data.o = Object.fromEntries(Object.entries(d.o || {}).filter(([, v]) => String(v || '').trim()));
    updateDoc(refs.member(), { [`rf.q${i}.${t}`]: data }).catch(() => {});
    if (!clear && t === 'src' && String(d.book || '').trim()) {
        try {
            const r = JSON.parse(localStorage.getItem('roomSrcRecent') || '[]').filter(s => s !== d.book.trim());
            localStorage.setItem('roomSrcRecent', JSON.stringify([d.book.trim(), ...r].slice(0, 8)));
        } catch (e) {}
    }
    // Ghi nhớ chung (sổ tay): ô có trên màn thì thay đúng khối; không thì nối vào bản đang lưu (stage lo phần trộn file)
    if (!clear && t === 'tip' && d.toNote) {
        if (editorOf('extra:note')) putBlock(i, 'extra:note', markOf(t), html);
        else window.dispatchEvent(new CustomEvent('room:edit', { detail: { key: 'extra:note', qi: i, appendHtml: html } }));
    }
    delete open[`${i}:${key}`];
    delete draft[`${i}:${t}`];
    repaintFn(key, i);
    if (!clear) showToast(t === 'elim' && d.pub !== false ? `Đã lưu ${markOf(t)} — ghi vào giải thích từng phương án bị loại.` : `Đã lưu ${markOf(t)}.`, 'success', 2200);
}
/** "📤 Góp vào giải thích chung": lý do của mình thành một khối có tên trong giải thích nhóm (bấm lại = cập nhật). */
function shareWhy(i) {
    const why = whyOf(myMember(), i);
    if (!hasText(why)) return showToast('Ghi lý do trước rồi góp nhé.', 'info');
    const name = shortName(myMember()?.displayName || 'Bạn', 18);
    putBlock(i, 'explain', `💭 ${name}:`, `<div><b>💭 ${esc(name)}:</b> ${renderRich(why)}</div>`);
    showToast('Đã góp lý do của bạn vào giải thích chung (kèm tên).', 'success', 2200);
}

// ---------- Thao tác ----------
function setPath(d, path, v) {
    const [a, b] = path.split('.');
    if (b !== undefined) (d[a] ||= [])[Number(b)] = v;
    else if (/^o\d+$/.test(a)) (d.o ||= {})[a] = v;
    else d[a] = v;
}
const formOf = (n) => n.closest('.rm-rf');
const ctxOf = (f) => ({ i: Number(f.dataset.rfI), key: f.dataset.rfKey, t: f.dataset.rf });
function focusForm(key, sel = '[data-rf-f]') {
    requestAnimationFrame(() => {
        const n = document.querySelector(`.rm-rf[data-rf-key="${key}"] ${sel}`);
        if (!n) return;
        n.focus({ preventScroll: true });
        n.closest('.rm-rf')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        if (n.setSelectionRange && n.value) n.setSelectionRange(n.value.length, n.value.length);
    });
}
function paintPreview(f) {
    const p = f.querySelector('[data-rf-prev]');
    if (!p) return;
    const chain = mechChain(draftOf(Number(f.dataset.rfI), 'mech'));
    p.innerHTML = chain.length ? chain.map(esc).join(' <i>→</i> ') : 'Xem trước: bước 1 → bước 2 → …';
}
const acronym = (items) => String(items || '').split(/\n+/).map(s => s.trim().charAt(0).toUpperCase()).filter(Boolean).join('');

/** Gắn thao tác lên các vùng có form (khay ô đáp án, sổ tay). repaint(key, i) vẽ lại vùng chứa ô `key`. */
export function initReason(roots, repaint) {
    repaintFn = repaint;
    const on = (type, fn) => roots.forEach(r => r.addEventListener(type, fn));
    // Chip / gợi ý: giữ con trỏ trong ô đang gõ (mousedown + preventDefault), điền thẳng vào ô tương ứng
    on('mousedown', (e) => {
        // Nút trong form không cướp tiêu điểm của ô đang gõ (khỏi xô bố cục giữa mousedown và click)
        if (e.target.closest('.rm-rf button')) e.preventDefault();
        const x = e.target.closest('[data-rf-chip], [data-rf-use], [data-rf-sug]');
        if (!x) return;
        const f = formOf(x);
        const { i, key } = ctxOf(f);
        const rows = [...f.querySelectorAll('[data-rf-f^="o"]')];
        const path = x.dataset.rfUse || x.dataset.rfSug
            || lastIn[`${i}:${key}`] && f.querySelector(`[data-rf-f="${lastIn[`${i}:${key}`]}"]`) && lastIn[`${i}:${key}`]
            || (rows.find(n => !n.value.trim()) || rows[0])?.dataset.rfF;
        const inp = path && f.querySelector(`[data-rf-f="${path}"]`);
        if (!inp) return;
        const v = x.dataset.v;
        const cur = inp.value.trim();
        const chip = x.hasAttribute('data-rf-chip');
        inp.value = chip && cur ? `${cur}; ${v.charAt(0).toLowerCase() + v.slice(1)}` : chip ? `${v} — ` : v;
        setPath(draftOf(ctxOf(f).i, ctxOf(f).t), path, inp.value);
        inp.focus({ preventScroll: true });
        inp.setSelectionRange(inp.value.length, inp.value.length);
    });
    on('click', (e) => {
        let x;
        if ((x = e.target.closest('[data-rf-open]'))) {
            const i = Number(x.closest('[data-rf-i]').dataset.rfI);
            const key = x.dataset.rfKey;
            const t = x.dataset.rfOpen;
            const k = `${i}:${key}`;
            open[k] = open[k] === t ? undefined : t;
            if (!open[k]) delete open[k];
            repaint(key, i);
            if (open[k]) focusForm(key);
            return;
        }
        if ((x = e.target.closest('[data-rf-share]'))) return void shareWhy(Number(x.closest('[data-rf-i]').dataset.rfI));
        const f = formOf(e.target);
        if (!f) return;
        const { i, key, t } = ctxOf(f);
        const d = draftOf(i, t);
        if (e.target.closest('[data-rf-close]')) { delete open[`${i}:${key}`]; return void repaint(key, i); }
        if (e.target.closest('[data-rf-save]')) return void save(i, key, t);
        if (e.target.closest('[data-rf-clear]')) return void save(i, key, t, true);
        if (e.target.closest('[data-rf-add-step]')) { d.steps.push(''); repaint(key, i); return void focusForm(key, `[data-rf-f="steps.${d.steps.length - 1}"]`); }
        if ((x = e.target.closest('[data-rf-del-step]'))) { d.steps.splice(Number(x.dataset.rfDelStep), 1); return void repaint(key, i); }
        if (e.target.closest('[data-rf-acr]')) {
            const a = acronym(d.items);
            if (!a) return void showToast('Gõ vài ý cần nhớ (mỗi dòng một ý) trước.', 'info');
            d.tip = String(d.tip || '').trim() ? `${a} — ${d.tip.replace(/^[A-ZÀ-Ỹ]+ — /, '')}` : `${a}`;
            const inp = f.querySelector('[data-rf-f="tip"]');
            if (inp) { inp.value = d.tip; inp.focus(); }
        }
    });
    const onField = (e) => {
        const n = e.target.closest?.('[data-rf-f]');
        if (!n) return;
        const f = formOf(n);
        const { i, t } = ctxOf(f);
        setPath(draftOf(i, t), n.dataset.rfF, n.type === 'checkbox' ? n.checked : n.value);
        if (t === 'mech') paintPreview(f);
    };
    on('input', onField);
    on('change', onField);
    on('focusin', (e) => {
        const n = e.target.closest?.('.rm-rf [data-rf-f^="o"]');
        if (n) { const { i, key } = ctxOf(formOf(n)); lastIn[`${i}:${key}`] = n.dataset.rfF; }
    });
    on('keydown', (e) => {
        const f = e.target.closest?.('.rm-rf');
        if (!f) return;
        const { i, key, t } = ctxOf(f);
        if (e.key === 'Escape') { e.stopPropagation(); delete open[`${i}:${key}`]; repaint(key, i); return; }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); return void save(i, key, t); }
        // Enter trong ô 1 dòng = sang ô kế (bước cuối của Cơ chế thì thêm bước mới)
        if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && !e.isComposing && e.keyCode !== 229) {
            e.preventDefault();
            const list = [...f.querySelectorAll('.rm-rf-in')];
            const nx = list[list.indexOf(e.target) + 1];
            if (t === 'mech' && /^steps\.\d+$/.test(e.target.dataset.rfF) && !nx?.dataset.rfF?.startsWith('steps.')) {
                draftOf(i, t).steps.push('');
                repaint(key, i);
                return void focusForm(key, `[data-rf-f="steps.${draftOf(i, t).steps.length - 1}"]`);
            }
            (nx || f.querySelector('[data-rf-save]'))?.focus();
        }
    });
}
