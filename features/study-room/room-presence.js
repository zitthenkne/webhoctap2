// room-presence.js — "AI ĐANG Ở ĐÂU" kiểu Google Docs (bản 27).
//  1) Thanh hiện diện đầu trang (#presence): mặt những người đang online · số trên mặt = câu họ đang xem
//     (✍️ = đang sửa) · viền màu riêng từng người · rê chuột: "đang sửa Giải thích · câu 3" · bấm = tới chỗ họ.
//  2) Con trỏ người khác trong ô sửa CHUNG: vạch màu + cờ tên, vùng họ đang bôi đen tô cùng màu, khung ô
//     đang có người sửa viền màu người đó. Ô riêng tư (lý do của bạn, ghi chú của tôi) KHÔNG phát.
//  3) Sổ tay: "👀" mặt những người đang xem cùng câu.
// Dữ liệu: members/{uid}.caret = { q, k: khóa ô sửa (data-live-edit), s, e: vị trí theo số ký tự, at } | null
//   — phát tối đa ~1 lần / 0,7s khi con trỏ đổi chỗ, nhắc lại mỗi 10s khi đứng yên; quá 15s coi như đã rời.
//   members/{uid}.cursor = câu đang xem (có sẵn từ trước).
import { updateDoc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { room, refs, uid, hasSession, subscribe, memberOf, answerOf, readyOf, isEssay, questionAt } from './room-state.js';
import { avatarHtml, avatarStack, escapeHtml, shortName, colorOf } from './room-ui.js';
import { isOnline } from './room-members.js';
import { effectiveIndex, setViewIndex } from './room-quiz-stage.js';
import { toggleNotebookRail } from './room-answer.js';

const el = (id) => document.getElementById(id);
const L = (k) => String.fromCharCode(65 + k);
const PRIVATE = new Set(['why', 'note']);
const FRESH = 15000;
const SEND_GAP = 700;

const keyName = (k = '') => {
    if (k === 'explain') return 'giải thích';
    if (k === 'question') return 'câu hỏi';
    if (k === 'issue') return 'báo lỗi đề';
    if (k === 'extra:expanded') return 'mở rộng';
    if (k === 'extra:note') return 'ghi nhớ';
    const m = /^(optexp|opttext):(\d+)$/.exec(k);
    if (m) return `${m[1] === 'optexp' ? 'giải thích' : 'phương án'} ${L(Number(m[2]))}`;
    return 'nội dung';
};
/** Con trỏ còn "sống" của một người khác (online, mới trong 15s), không thì null. */
const liveCaret = (m) => (m && m.uid !== uid() && m.caret && isOnline(m) && Date.now() - (m.caret.at || 0) < FRESH ? m.caret : null);

// ---------- 1. Phát con trỏ của mình ----------
let sentSig = 'null';
let sentAt = 0;
let timer = 0;
const editNodeOf = (n) => { const e = n?.nodeType === 3 ? n.parentElement : n; return e?.closest?.('[data-live-edit]') || null; };
function textOffset(ed, node, off) {
    const r = document.createRange();
    r.selectNodeContents(ed);
    try { r.setEnd(node, off); } catch (e) { return 0; }
    return r.toString().length;
}
function readMine() {
    if (!hasSession()) return null;
    const sel = window.getSelection();
    if (!sel?.rangeCount) return null;
    const r = sel.getRangeAt(0);
    const ed = editNodeOf(r.startContainer);
    if (!ed || !ed.contains(document.activeElement) && document.activeElement !== ed) return null;
    const k = ed.dataset.liveEdit;
    if (!k || PRIVATE.has(k)) return null;
    const s = textOffset(ed, r.startContainer, r.startOffset);
    const e = ed.contains(r.endContainer) ? textOffset(ed, r.endContainer, r.endOffset) : s;
    return { q: effectiveIndex(), k, s, e };
}
function send(force = false) {
    const want = readMine();
    const sig = JSON.stringify(want);
    const now = Date.now();
    if (sig === sentSig && (!want || now - sentAt < 10000)) return;   // không đổi (đứng yên thì 10s nhắc lại)
    const wait = SEND_GAP - (now - sentAt);
    if (want && wait > 0 && !force) { clearTimeout(timer); timer = setTimeout(() => send(true), wait); return; }
    clearTimeout(timer);
    sentSig = sig;
    sentAt = now;
    updateDoc(refs.member(), { caret: want ? { ...want, at: now } : null }).catch(() => {});
}

// ---------- 2. Vẽ con trỏ người khác ----------
let raf = 0;
let mo = null;
const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); };
// Vị trí thứ `off` (tính theo ký tự chữ) trong ô sửa -> [text node, offset]
function pointAt(ed, off) {
    const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    let n;
    let acc = 0;
    let last = null;
    while ((n = w.nextNode())) {
        if (acc + n.data.length >= off) return [n, Math.max(0, off - acc)];
        acc += n.data.length;
        last = n;
    }
    return last ? [last, last.data.length] : [ed, 0];
}
function paintCarets() {
    document.querySelectorAll('.rm-rc-layer').forEach(n => n.remove());
    document.querySelectorAll('[data-live-edit].has-remote').forEach(n => { n.classList.remove('has-remote'); n.style.removeProperty('--rc'); });
    if (!hasSession()) return;
    const i = effectiveIndex();
    room.members.forEach(m => {
        const c = liveCaret(m);
        if (!c || c.q !== i || PRIVATE.has(c.k)) return;
        const ed = document.querySelector(`#quiz-live [data-live-edit="${CSS.escape(c.k)}"]`);
        if (!ed || !ed.getClientRects().length) return;
        const color = colorOf(m.uid);
        ed.classList.add('has-remote');
        ed.style.setProperty('--rc', color);
        const host = ed.parentElement;
        host.classList.add('rm-rc-host');
        let layer = host.querySelector(':scope > .rm-rc-layer');
        if (!layer) {
            layer = document.createElement('div');
            layer.className = 'rm-rc-layer';
            layer.setAttribute('aria-hidden', 'true');
            host.appendChild(layer);
        }
        const hr = host.getBoundingClientRect();
        const [sn, so] = pointAt(ed, Math.min(c.s, c.e));
        const [en, eo] = pointAt(ed, Math.max(c.s, c.e));
        const r = document.createRange();
        try { r.setStart(sn, so); r.setEnd(en, eo); } catch (e) { return; }
        let html = '';
        if (c.s !== c.e) {
            [...r.getClientRects()].forEach(b => {
                if (b.width < 1) return;
                html += `<i class="rm-rc-sel" style="left:${b.left - hr.left}px;top:${b.top - hr.top}px;width:${b.width}px;height:${b.height}px;--rc:${color}"></i>`;
            });
        }
        r.collapse(c.e < c.s);
        let b = r.getClientRects()[0] || r.getBoundingClientRect();
        if (!b || !b.height) { const er = ed.getBoundingClientRect(); b = { left: er.left + 10, top: er.top + 6, height: 18 }; }
        html += `<span class="rm-rc" style="left:${b.left - hr.left}px;top:${b.top - hr.top}px;height:${b.height}px;--rc:${color}"><b>${escapeHtml(shortName(m.displayName || 'Khách', 12))}</b></span>`;
        layer.insertAdjacentHTML('beforeend', html);
    });
}

// ---------- 3. Thanh hiện diện + "ai đang xem câu này" ----------
function paintBar() {
    const bar = el('presence');
    if (!bar) return;
    const live = hasSession();
    const i = live ? effectiveIndex() : -1;
    const others = room.members.filter(m => m.uid !== uid() && isOnline(m))
        // người đang ở cùng câu với mình lên trước, rồi tới người đang sửa
        .sort((a, b) => ((b.cursor === i) - (a.cursor === i)) || (!!liveCaret(b) - !!liveCaret(a)));
    // Trạng thái ở câu họ đang xem (bản 32): 💭 đang nghĩ · ✓ đã chọn · 🏁 báo xong — liếc là biết ai cần đợi
    const stOf = (m) => {
        const q = typeof m.cursor === 'number' ? m.cursor : null;
        if (!live || q === null || liveCaret(m)) return '';
        if (readyOf(m, q)) return 'ready';
        if (typeof answerOf(m, q)?.i === 'number') return 'ok';
        return isEssay(questionAt(q)) ? '' : 'think';
    };
    const sig = JSON.stringify([i, live, others.map(m => [m.uid, m.displayName, m.emoji, m.cursor, liveCaret(m)?.k, liveCaret(m)?.q, stOf(m)])]);
    if (bar.dataset.sig === sig) return;
    bar.dataset.sig = sig;
    const max = window.matchMedia('(max-width: 640px)').matches ? 3 : 5;
    bar.innerHTML = others.slice(0, max).map(m => {
        const c = liveCaret(m);
        const q = typeof m.cursor === 'number' ? m.cursor : null;
        const st = stOf(m);
        const where = (!live ? 'đang ở sảnh' : c ? `đang sửa ${keyName(c.k)} · câu ${c.q + 1}` : q !== null ? `đang xem câu ${q + 1}` : 'đang trong phòng')
            + ({ ready: ' · đã báo xong', ok: ' · đã chọn', think: ' · đang nghĩ…' }[st] || '');
        return `<button type="button" class="rm-pres ${c ? 'is-editing' : ''} ${live && q === i ? 'is-here' : ''}" data-follow="${escapeHtml(m.uid)}"
            style="--rc:${colorOf(m.uid)}" title="${escapeHtml(m.displayName || 'Khách')} · ${where}${live ? ' — bấm để tới chỗ bạn ấy' : ''}">
            ${avatarHtml(m, 'sm')}${live && (c || q !== null) ? `<i>${c ? '✍️' : q + 1}</i>` : ''}${
                st === 'think' ? '<em class="rm-pres-st is-think" aria-hidden="true"><b></b><b></b><b></b></em>'
                : st ? `<em class="rm-pres-st is-${st}" aria-hidden="true">${st === 'ready' ? '🏁' : '✓'}</em>` : ''}</button>`;
    }).join('') + (others.length > max ? `<span class="rm-pres-more" title="${escapeHtml(others.slice(max).map(m => m.displayName || 'Khách').join(', '))}">+${others.length - max}</span>` : '');
    bar.classList.toggle('hidden', !others.length);
}
function paintViewers() {
    const box = document.querySelector('#notebook .rm-nb-viewers');
    if (!box || !hasSession()) return;
    const i = effectiveIndex();
    const here = room.members.filter(m => m.uid !== uid() && isOnline(m) && m.cursor === i);
    box.innerHTML = here.length ? `<span title="Đang xem câu này: ${escapeHtml(here.map(m => m.displayName || 'Khách').join(', '))}">👀</span>${avatarStack(here, 4, 'xs')}` : '';
}

function paint() {
    mo?.disconnect();                        // tự vẽ lớp con trỏ thì đừng tự kích lại chính mình
    try { paintCarets(); paintBar(); paintViewers(); } finally { observe(); }
}
function observe() {
    const root = el('quiz-live');
    if (!root) return;
    mo = mo || new MutationObserver(schedule);
    mo.observe(root, { childList: true, subtree: true, characterData: true });
}

/** Bấm mặt một người trên thanh hiện diện: tới câu họ đang xem, đang sửa ô nào thì cuộn tới ô đó. */
function follow(id) {
    const m = memberOf(id);
    if (!m || !hasSession()) return;
    const c = liveCaret(m);
    const q = c ? c.q : m.cursor;
    if (typeof q !== 'number') return;
    if (c && (c.k === 'explain' || c.k.startsWith('extra:')) && document.body.classList.contains('nb-rail')) toggleNotebookRail(false);
    if (q !== effectiveIndex()) setViewIndex(q);
    setTimeout(() => {
        const target = (c && document.querySelector(`#quiz-live [data-live-edit="${CSS.escape(c.k)}"]`)) || document.querySelector('.rm-question');
        target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        target?.classList.add('rm-follow-flash');
        setTimeout(() => target?.classList.remove('rm-follow-flash'), 1500);
    }, 300);
}

export function initPresence() {
    document.addEventListener('selectionchange', () => send());
    document.addEventListener('focusout', (e) => { if (editNodeOf(e.target)) setTimeout(() => send(true), 0); });
    setInterval(() => { if (sentSig !== 'null') send(); }, 5000);   // đứng yên lâu vẫn nhắc "còn ở đây"
    el('presence')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-follow]');
        if (b) follow(b.dataset.follow);
    });
    subscribe(schedule);
    window.addEventListener('resize', schedule);
    window.addEventListener('room:notebook', schedule);
    setInterval(schedule, 5000);                                   // con trỏ quá 15s tự tắt dù không có snapshot mới
    observe();
    schedule();
}
