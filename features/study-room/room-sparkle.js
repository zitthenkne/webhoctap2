// room-sparkle.js — bản 32 "phòng sống": mấy tiện ích nhỏ gắn vào chỗ CÓ SẴN (HUD, dải câu, tab, sảnh),
// không dựng khung mới.
//  1) #hud-opts — ô đáp án cuộn khuất (đang đọc bàn luận / sổ tay) thì HUD hiện 4 viên A B C D mini:
//     thấy ngay mình chọn gì, đúng/sai, % phiếu; bấm = chọn luôn (còn chọn được) hoặc cuộn về ô đó.
//  2) #pip-peek — rê chuột lên dải câu / bản đồ câu: xem trước đề + trạng thái câu đó, khỏi bấm thử.
//  3) #streak-chip — 🔥 chuỗi câu đúng liên tiếp (cùng cách tính với bảng điểm).
//  4) "Trong lúc bạn vắng" — quay lại tab sau ≥20 giây: thẻ tóm tắt (câu vừa chốt, nhóm dời câu, tin mới).
//  5) Tiêu đề tab báo tin khi đang ở tab khác: "(3) Đã chốt C4 · Phòng …".
//  6) Lời chào theo giờ ở băng-rôn sảnh chờ.
import {
    room, subscribe, hasSession, questionAt, optsOf, isEssay, answerOf, myMember, isAnnounced, isAccepted,
    isShown, isBlind, refIdxOf, currentIndex, flagOf, acceptedText, argsOf,
} from './room-state.js';
import { escapeHtml, shortName } from './room-ui.js';
import { effectiveIndex, setViewIndex, answerCurrent, canAnswer } from './room-quiz-stage.js';
import { questionStats } from './room-scoreboard.js';
import { chatMessages, chatCountFor } from './room-chat.js';

const el = (id) => document.getElementById(id);
const L = (k) => String.fromCharCode(65 + k);
const plain = (v) => String(v ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const live = () => hasSession() && !room.session.ended;

// ───────────── 1. Viên A B C D mini trên HUD ─────────────
function paintHudOpts() {
    const box = el('hud-opts');
    if (!box) return;
    const i = live() ? effectiveIndex() : -1;
    const q = i >= 0 ? questionAt(i) : null;
    const n = q && !isEssay(q) ? optsOf(q).length : 0;
    box.classList.toggle('hidden', !n);
    if (!n) return;
    const mine = answerOf(myMember(), i)?.i;
    const ann = isAnnounced(i);
    const st = questionStats(i);
    const stats = (ann || isShown(i) || !!room.session.liveStats) && !isBlind(i);
    const ref = isShown(i) && !ann ? refIdxOf(q) : null;
    const can = canAnswer(i);
    const sig = JSON.stringify([i, n, mine, ann && acceptedText(i), stats && st.counts, ref, can]);
    if (box.dataset.sig === sig) return;
    box.dataset.sig = sig;
    box.innerHTML = Array.from({ length: n }, (_, k) => {
        const cls = ['rm-hopt', 'o' + (k % 4)];
        let say = '';
        if (ann && isAccepted(i, k)) { cls.push('is-ok'); say = ' · đáp án đúng'; }
        else if (ann && mine === k) { cls.push('is-bad'); say = ' · bạn chọn sai'; }
        else if (mine === k) { cls.push('is-pick'); say = ' · bạn đang chọn'; }
        if (ref === k) { cls.push('is-ref'); say += ' · đáp án trong file'; }
        const pct = stats && st.total ? Math.round(100 * st.counts[k] / st.total) : 0;
        const tip = `${L(k)}${say}${pct ? ` · ${pct}% phòng chọn` : ''} — ${can && mine !== k ? 'bấm để chọn' : 'bấm để cuộn tới ô này'}`;
        return `<button type="button" class="${cls.join(' ')}" data-hopt="${k}" title="${tip}" aria-label="${tip}">`
            + `<b>${L(k)}</b>${pct ? `<small>${pct}%</small>` : ''}</button>`;
    }).join('');
}

function initHudOpts() {
    const box = el('hud-opts');
    const area = el('options-area');
    const root = el('stage-quiz');
    if (!box || !area || !root) return;
    box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-hopt]');
        if (!b) return;
        const k = Number(b.dataset.hopt);
        const i = effectiveIndex();
        if (canAnswer(i) && answerOf(myMember(), i)?.i !== k) {
            box.querySelectorAll('.is-pick').forEach(n => n.classList.remove('is-pick'));
            b.classList.add('is-pick', 'is-pop');
            answerCurrent(k);
            return;
        }
        const card = area.querySelector(`[data-card="${k}"]`);
        card?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        card?.classList.add('rm-follow-flash');
        setTimeout(() => card?.classList.remove('rm-follow-flash'), 1500);
    });
    if (!('IntersectionObserver' in window)) return;
    // Khuất = đã cuộn QUA (nằm phía trên HUD) và phần còn thấy < ~110px. Khay dưới ô dài thì ô A–C khuất
    // trước cả khi hết khối, nên đo phần còn thấy chứ không chờ khuất hẳn.
    const io = new IntersectionObserver(([e]) => {
        const top = e.rootBounds ? e.rootBounds.top : 0;
        const away = e.boundingClientRect.top < top && e.intersectionRect.height < 110;
        document.body.classList.toggle('opts-away', away && !area.classList.contains('hidden'));
    }, { root, rootMargin: '-72px 0px 0px 0px', threshold: Array.from({ length: 21 }, (_, k) => k / 20) });
    io.observe(area);
}

// ───────────── 2. Xem trước câu khi rê dải câu ─────────────
let peekTimer = 0;
let peekFor = null;
function peekHtml(k) {
    const q = questionAt(k);
    if (!q) return '';
    const a = answerOf(myMember(), k);
    const ann = isAnnounced(k);
    const st = questionStats(k);
    const essay = isEssay(q);
    const picked = typeof a?.i === 'number';
    const verdict = ann && picked ? (isAccepted(k, a.i) ? '<em class="is-ok">✓ đúng</em>' : '<em class="is-bad">✗ sai</em>') : '';
    const flags = room.members.filter(m => flagOf(m, k)).length;
    const talk = chatCountFor(k) + argsOf(k).length;
    const text = plain(q.question);
    const bits = [
        essay ? '✍️ Tự luận' : picked ? `Bạn chọn <b>${L(a.i)}</b> ${verdict}` : '<span class="is-todo">Bạn chưa chọn</span>',
        ann ? `Nhóm chốt <b>${acceptedText(k)}</b>` : essay ? '' : `${st.total}/${room.members.length} người đã chọn`,
        flags ? `🗣 ${flags} muốn bàn` : '',
        talk ? `💬 ${talk}` : '',
    ].filter(Boolean);
    return `<p class="rm-qpeek-no">Câu ${k + 1}${k === currentIndex() ? ' <span>· nhóm đang ở đây</span>' : ''}</p>
        <p class="rm-qpeek-q">${escapeHtml(text.length > 130 ? text.slice(0, 128) + '…' : text) || '<i>(chưa có nội dung)</i>'}</p>
        <p class="rm-qpeek-meta">${bits.join('<i>·</i>')}</p>`;
}
function hidePeek() {
    clearTimeout(peekTimer);
    peekFor = null;
    el('pip-peek')?.classList.remove('is-on');
}
function showPeek(btn) {
    const k = Number(btn.dataset.jump);
    let box = el('pip-peek');
    if (!box) {
        box = document.createElement('div');
        box.id = 'pip-peek';
        box.className = 'rm-qpeek';
        box.setAttribute('role', 'tooltip');
        document.body.appendChild(box);
    }
    box.innerHTML = peekHtml(k);
    const r = btn.getBoundingClientRect();
    const w = box.offsetWidth || 272;
    box.style.left = Math.round(Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2))) + 'px';
    box.style.top = Math.round(r.bottom + 10) + 'px';
    box.classList.add('is-on');
}
function initPeek() {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const SEL = '.rm-pip[data-jump], .rm-mcell[data-jump]';
    document.addEventListener('mouseover', (e) => {
        const b = e.target.closest?.(SEL);
        if (!b || !live()) return;
        if (b === peekFor) return;
        // tooltip gốc của trình duyệt đè lên thẻ xem trước -> cất title (aria-label vẫn giữ)
        if (b.title) b.removeAttribute('title');
        peekFor = b;
        clearTimeout(peekTimer);
        const already = el('pip-peek')?.classList.contains('is-on');
        peekTimer = setTimeout(() => { if (peekFor === b && b.isConnected) showPeek(b); }, already ? 40 : 220);
    });
    document.addEventListener('mouseout', (e) => {
        const b = e.target.closest?.(SEL);
        if (b && !b.contains(e.relatedTarget)) hidePeek();
    });
    document.addEventListener('click', hidePeek, true);
    document.addEventListener('scroll', hidePeek, true);
}

// ───────────── 3. 🔥 chuỗi đúng liên tiếp ─────────────
// Giống computeScores: đi theo thứ tự câu, chỉ câu đã chốt; trật hoặc bỏ trống câu đã chốt là đứt chuỗi.
let lastStreak = 0;
function paintStreak() {
    const chip = el('streak-chip');
    if (!chip) return;
    let streak = 0;
    if (live()) {
        const me = myMember();
        room.session.questions.forEach((q, k) => {
            if (!isAnnounced(k) || isEssay(q)) return;
            const a = answerOf(me, k);
            streak = a && isAccepted(k, a.i) ? streak + 1 : 0;
        });
    }
    chip.classList.toggle('hidden', streak < 2);
    if (streak === lastStreak) return;
    if (streak >= 2) {
        chip.innerHTML = `🔥<b>${streak}</b>`;
        chip.title = `Chuỗi ${streak} câu đúng liên tiếp — giữ lửa nhé!`;
        if (streak > lastStreak) {
            chip.classList.remove('is-bump');
            void chip.offsetWidth;
            chip.classList.add('is-bump');
        }
    }
    lastStreak = streak;
}

// ───────────── 4 + 5. Vắng mặt: tiêu đề tab + thẻ tóm tắt khi quay lại ─────────────
let away = null;
let baseTitle = '';
const announcedKeys = () => {
    const s = new Set();
    (room.session?.questions || []).forEach((_, k) => { if (isAnnounced(k)) s.add(k); });
    return s;
};
const msgCount = () => chatMessages().filter(m => m.type !== 'notice').length;
function snapshot() {
    return { at: Date.now(), ann: announcedKeys(), cur: currentIndex(), msgs: msgCount(), ended: !!room.session?.ended, sid: room.session?.startedAtMs || 0, live: hasSession() };
}
function diffSince(was) {
    const now = announcedKeys();
    const fresh = [...now].filter(k => !was.ann.has(k)).sort((a, b) => a - b);
    const newMsgs = Math.max(0, msgCount() - was.msgs);
    const started = !was.live && hasSession();
    const moved = hasSession() && was.live && currentIndex() !== was.cur ? currentIndex() : null;
    const ended = !was.ended && !!room.session?.ended;
    return { fresh, newMsgs, started, moved, ended, n: fresh.length + newMsgs + (started ? 1 : 0) + (ended ? 1 : 0) };
}
function paintTitle() {
    if (!away || !document.hidden) return;
    if (!baseTitle) baseTitle = document.title;
    const d = diffSince(away);
    const what = d.ended ? '🎉 Buổi học kết thúc'
        : d.started ? '▶ Đã bắt đầu'
        : d.fresh.length ? `✅ Đã chốt C${d.fresh[d.fresh.length - 1] + 1}`
        : d.newMsgs ? `💬 ${d.newMsgs} tin mới` : '';
    document.title = d.n ? `(${d.n}) ${what} · ${baseTitle}` : baseTitle;
}
function showBack(was) {
    document.querySelector('.rm-back')?.remove();
    const d = diffSince(was);
    if (!hasSession() || room.session.ended || d.started || !(d.fresh.length || d.newMsgs || d.moved !== null)) return;
    const mins = Math.max(1, Math.round((Date.now() - was.at) / 60000));
    const lines = [];
    if (d.fresh.length) lines.push(`nhóm chốt ${d.fresh.slice(0, 4).map(k => `C${k + 1} (${acceptedText(k)})`).join(', ')}${d.fresh.length > 4 ? '…' : ''}`);
    if (d.moved !== null) lines.push(`đang bàn câu ${d.moved + 1}`);
    if (d.newMsgs) lines.push(`${d.newMsgs} tin nhắn mới`);
    const box = document.createElement('div');
    box.className = 'rm-late rm-back';
    box.setAttribute('role', 'status');
    const firstFresh = d.fresh.find(k => k !== effectiveIndex());
    box.innerHTML = `<span class="rm-late-ic">👋</span>
        <div class="min-w-0 flex-1"><b>Trong ${mins} phút bạn vắng</b><span>${escapeHtml(lines.join(' · '))}</span></div>
        ${d.moved !== null && d.moved !== effectiveIndex() ? `<button type="button" class="rm-cta rm-solid-btn" data-back="${d.moved}">Tới câu ${d.moved + 1}</button>` : ''}
        ${firstFresh !== undefined ? `<button type="button" class="rm-ghost-btn" data-back="${firstFresh}">Xem câu ${firstFresh + 1} vừa chốt</button>` : ''}
        <button type="button" class="rm-icon-btn" data-back="x" title="Đóng"><i class="fas fa-times"></i></button>`;
    box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-back]');
        if (!b) return;
        if (b.dataset.back !== 'x') setViewIndex(Number(b.dataset.back));
        box.remove();
    });
    document.querySelector('#quiz-live .rm-topbar')?.after(box);
    setTimeout(() => box.remove(), 20000);
}
function initAway() {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            if (room.ready) { away = snapshot(); baseTitle = document.title; }
            return;
        }
        const was = away;
        away = null;
        if (baseTitle) document.title = baseTitle;
        if (was && Date.now() - was.at >= 20000 && was.sid === (room.session?.startedAtMs || 0)) showBack(was);
    });
    // rAF không chạy ở tab nền -> 'room:paint' im; nghe thẳng kho state
    subscribe(paintTitle);
}

// ───────────── 6. Lời chào theo giờ (sảnh chờ) ─────────────
function paintGreet() {
    const tag = document.querySelector('#quiz-lobby .rm-hero-tag');
    if (!tag || el('quiz-lobby')?.classList.contains('hidden')) return;
    const h = new Date().getHours();
    const [ic, say] = h < 5 ? ['🦉', 'Cú đêm ơi, ôn xong nhớ ngủ nha']
        : h < 11 ? ['☀️', 'Chào buổi sáng']
        : h < 14 ? ['🍱', 'Trưa rồi, ôn nhẹ thôi']
        : h < 18 ? ['🧋', 'Chiều học vui nha']
        : h < 23 ? ['🌙', 'Chào buổi tối'] : ['🦉', 'Khuya rồi, cố thêm chút'];
    const name = shortName(String(myMember()?.displayName || room.user?.displayName || '').trim().split(/\s+/).pop() || '', 12);
    const text = `${ic} ${say}${name ? ', ' + name : ''}`;
    let g = tag.querySelector('.rm-greet');
    if (!g) { g = document.createElement('span'); g.className = 'rm-greet'; tag.appendChild(g); }
    if (g.textContent !== text) g.textContent = text;
}

function paint() {
    paintHudOpts();
    paintStreak();
    paintGreet();
}

export function initSparkle() {
    initHudOpts();
    initPeek();
    initAway();
    window.addEventListener('room:paint', paint);
    paint();
}
