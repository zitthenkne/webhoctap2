// room-game.js — bộ tiện ích "chơi mà học" cho phòng đánh đề chung.
// Gồm: chia đội · chuông giành lượt · cược tự tin · phiếu kín rồi lật bài ·
// bánh xe chọn người giảng · cảm ơn người giảng · vài tiện ích cuối buổi.
// Tất cả đều dựa trên doc sẵn có (members + quizSession), không thêm collection mới.
import { updateDoc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { showToast } from '../../core/utils.js';
import {
    room, refs, uid, canControl, hasSession, isAnnounced, currentIndex, answerOf,
    teamOn, teamOf, buzzOn, buzzOf, betOf, isBlind, spotlightOf, thanksOf, explainerOf,
    questionAt, optsOf, chosenOf, noteOf, markOf, flagOf, qKey,
} from './room-state.js';
import { escapeHtml, shortName, avatarHtml, changed } from './room-ui.js';
import { effectiveIndex } from './room-quiz-stage.js';
import { beep, haptic, ensureConfetti } from './room-boost.js';
import { getNote } from './room-study.js';

const el = (id) => document.getElementById(id);
const me = () => room.members.find(m => m.uid === uid()) || null;
const sess = () => refs.session();
export const TEAM_NAMES = { A: 'Đội Hồng', B: 'Đội Tím' };

// ───────────────────────── Thanh trò chơi của người chơi ─────────────────────────
export function renderGameBar(i) {
    const bar = el('game-bar');
    if (!bar || !hasSession()) return;
    const mine = answerOf(me(), i);
    const announced = isAnnounced(i);
    const blind = isBlind(i);
    const buzz = buzzOf(i);
    const ex = explainerOf(i);
    const team = teamOf(me());
    const thanks = thanksOf(i);
    const spot = spotlightOf(i);

    // Không bật gì thì giấu luôn cho gọn
    const active = teamOn() || buzzOn() || blind || (mine && !announced) || (ex && ex.uid !== uid()) || spot;
    bar.classList.toggle('hidden', !active);
    if (!active) return;
    if (!changed('gamebar', [i, team, teamOn(), buzzOn(), buzz, blind, announced, ex, spot,
        mine ? [mine.i, mine.bet] : null, thanks.length, thanks.includes(uid())])) return;

    const bits = [];

    if (teamOn()) {
        bits.push(`<div class="rm-grow">
            <span class="rm-label"><i class="fas fa-people-group"></i> Đội của bạn</span>
            <div class="rm-gline">
                ${['A', 'B'].map(t => `<button class="rm-team-chip t${t} ${team === t ? 'on' : ''}" data-team="${t}">
                    ${TEAM_NAMES[t]}${team === t ? ' · bạn' : ''}</button>`).join('')}
            </div>
        </div>`);
    }

    if (buzzOn() && !announced) {
        bits.push(`<div class="rm-grow">
            <span class="rm-label"><i class="fas fa-bell"></i> Chuông giành lượt</span>
            <div class="rm-gline">
                ${buzz
                    ? `<span class="rm-buzz-win">🔔 <b>${escapeHtml(shortName(buzz.name || 'Ai đó', 14))}</b> nhanh tay nhất</span>
                       ${canControl() ? '<button class="rm-mini" data-buzz-clear>Mở chuông lại</button>' : ''}`
                    : '<button class="rm-buzz-btn" data-buzz>🔔 Giành lượt trả lời</button>'}
            </div>
        </div>`);
    }

    if (mine && !announced) {
        bits.push(`<div class="rm-grow">
            <span class="rm-label"><i class="fas fa-coins"></i> Bạn chắc tới mức nào?</span>
            <div class="rm-gline">
                ${[1, 2, 3].map(b => `<button class="rm-bet b${b} ${betOf(me(), i) === b ? 'on' : ''}" data-bet="${b}"
                    title="${b === 1 ? 'Trúng +điểm thường, trật không mất gì' : `Trúng ×${b} điểm, trật mất ${5 * (b - 1)}`}">×${b}</button>`).join('')}
                <span class="rm-hint">${betOf(me(), i) > 1 ? `mạo hiểm — trật mất ${5 * (betOf(me(), i) - 1)} điểm` : 'an toàn'}</span>
            </div>
        </div>`);
    }

    if (blind) {
        bits.push(`<div class="rm-grow rm-blind">
            <span class="rm-label">🙈 Phiếu kín</span>
            <div class="rm-gline">
                <span class="rm-hint">Cả phòng chọn xong mới lật — khỏi nhìn nhau.</span>
                ${canControl() ? '<button class="rm-mini is-on" data-reveal><i class="fas fa-eye"></i> Lật bài</button>' : ''}
            </div>
        </div>`);
    }

    if (ex && ex.uid !== uid()) {
        const done = thanks.includes(uid());
        bits.push(`<div class="rm-grow">
            <span class="rm-label"><i class="fas fa-microphone-lines"></i> ${escapeHtml(shortName(ex.name || 'Ai đó', 12))} đang giảng</span>
            <div class="rm-gline">
                <button class="rm-thank ${done ? 'on' : ''}" data-thank>${done ? '💖 Đã cảm ơn' : '🤍 Cảm ơn'}${thanks.length ? ` · ${thanks.length}` : ''}</button>
            </div>
        </div>`);
    }

    if (spot && !ex) {
        bits.push(`<div class="rm-grow"><span class="rm-label">🎯 Bánh xe chọn</span>
            <div class="rm-gline"><span class="rm-buzz-win">${escapeHtml(shortName(spot.name || 'Ai đó', 14))} được mời giảng câu này</span></div></div>`);
    }

    bar.innerHTML = bits.join('');
}

// ───────────────────────── Hành động của người chơi ─────────────────────────
async function pressBuzz(i) {
    if (buzzOf(i)) return;                       // đã có người giành
    haptic(18);
    beep('lock');
    await updateDoc(sess(), {
        [`buzz.${qKey(i)}`]: { uid: uid(), name: me()?.displayName || 'Khách', at: Date.now() },
    }).catch(() => {});
}

const setBet = (i, b) => updateDoc(refs.member(), { [`answers.${qKey(i)}.bet`]: b }).catch(() => {});

async function sayThanks(i) {
    const has = thanksOf(i).includes(uid());
    await updateDoc(sess(), { [`thanks.${qKey(i)}.${uid()}`]: has ? null : true }).catch(() => {});
    if (!has) { beep('good'); haptic(10); }
}

const joinTeam = (t) => updateDoc(refs.member(), { team: t }).catch(() => {});

// ───────────────────────── Quyền chủ trì ─────────────────────────
async function shuffleTeams() {
    const list = room.members.filter(m => m.online !== false);
    const bag = list.slice().sort(() => Math.random() - 0.5);
    await Promise.all(bag.map((m, k) => updateDoc(refs.member(m.uid), { team: k % 2 ? 'B' : 'A' }).catch(() => {})));
    await updateDoc(sess(), { teamOn: true }).catch(() => {});
    showToast(`Đã chia ${bag.length} bạn thành 2 đội!`, 'success');
    ensureConfetti().then(() => window.confetti?.({ particleCount: 70, spread: 70, origin: { y: .3 } }));
}

const setTeams = (on) => updateDoc(sess(), { teamOn: on }).catch(() => {});
const setBuzz = (on) => updateDoc(sess(), { buzzOn: on, ...(on ? {} : { buzz: {} }) }).catch(() => {});
const clearBuzz = (i) => updateDoc(sess(), { [`buzz.${qKey(i)}`]: null }).catch(() => {});
const setBlind = (i, on) => updateDoc(sess(), { [`blind.${qKey(i)}`]: on ? true : null }).catch(() => {});

/** Bánh xe quay chọn người giảng — chạy ở máy chủ trì rồi ghi kết quả cho cả phòng. */
async function spinWheel(i) {
    const pool = room.members.filter(m => m.online !== false);
    if (pool.length < 2) return showToast('Cần ít nhất 2 người đang online.', 'warning');
    const box = el('wheel-overlay');
    const face = el('wheel-face');
    const nameEl = el('wheel-name');
    box?.classList.remove('hidden');
    const winner = pool[Math.floor(Math.random() * pool.length)];
    let n = 0;
    const timer = setInterval(() => {
        const m = pool[n++ % pool.length];
        if (face) face.textContent = m.emoji || '🙂';
        if (nameEl) nameEl.textContent = m.displayName || 'Khách';
        beep('tap');
    }, 110);
    setTimeout(async () => {
        clearInterval(timer);
        if (face) face.textContent = winner.emoji || '🎉';
        if (nameEl) nameEl.textContent = winner.displayName || 'Khách';
        beep('good');
        ensureConfetti().then(() => window.confetti?.({ particleCount: 60, spread: 55, origin: { y: .4 } }));
        await updateDoc(sess(), {
            [`spotlight.${qKey(i)}`]: { uid: winner.uid, name: winner.displayName || 'Khách' },
        }).catch(() => {});
        setTimeout(() => box?.classList.add('hidden'), 1100);
    }, 1900);
}

// ───────────────────────── Menu trò chơi (chủ trì) ─────────────────────────
function gameMenuHtml(i) {
    const item = (act, icon, label, note = '') =>
        `<button class="rm-menu-item" data-game="${act}">
            <span class="rm-menu-ic" style="background:var(--rm-accent-soft);color:var(--rm-accent-deep)"><i class="fas ${icon}"></i></span>
            <span class="min-w-0"><b>${label}</b>${note ? `<br><span class="rm-hint">${note}</span>` : ''}</span>
        </button>`;
    return [
        teamOn()
            ? item('teams-off', 'fa-people-group', 'Tắt chia đội', 'quay lại tính điểm cá nhân')
            : item('teams-on', 'fa-people-group', 'Chia đội ngẫu nhiên', 'điểm cộng theo 2 đội'),
        teamOn() ? item('teams-shuffle', 'fa-shuffle', 'Chia lại đội', '') : '',
        buzzOn()
            ? item('buzz-off', 'fa-bell-slash', 'Tắt chuông giành lượt', '')
            : item('buzz-on', 'fa-bell', 'Bật chuông giành lượt', 'ai bấm trước được nói trước'),
        isBlind(i)
            ? item('reveal', 'fa-eye', 'Lật bài câu này', 'cho cả phòng thấy phiếu')
            : item('blind', 'fa-eye-slash', 'Phiếu kín câu này', 'giấu lựa chọn tới khi lật'),
        item('wheel', 'fa-dice', 'Quay chọn người giảng', 'bốc ngẫu nhiên một bạn'),
        item('review', 'fa-rotate-left', 'Tạo đề ôn từ câu sai', 'lưu vào thư viện của bạn'),
        item('report', 'fa-chart-simple', 'Báo cáo tham gia', 'ai chưa chọn, ai hay đoán'),
        item('mynotes', 'fa-file-arrow-down', 'Tải ghi chú của tôi', 'file .md gồm câu sai + ghi chú'),
    ].filter(Boolean).join('');
}

function openGameMenu() {
    const menu = el('game-menu');
    const btn = el('host-game');
    if (!menu || !btn) return;
    menu.innerHTML = gameMenuHtml(effectiveIndex());
    menu.classList.remove('hidden');
    const r = btn.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, r.left)) + 'px';
    menu.style.top = (r.top - menu.offsetHeight - 10) + 'px';
    menu.style.bottom = 'auto';
}

// ───────────────────────── Tiện ích cuối buổi ─────────────────────────
/** Những câu đáng ôn lại: nhóm chốt mà bạn chọn trật, hoặc có người bấm "cần bàn". */
export function reviewIndexes() {
    const s = room.session;
    if (!s?.questions?.length) return [];
    const my = me();
    const out = [];
    s.questions.forEach((_, i) => {
        const c = chosenOf(i);
        const a = answerOf(my, i);
        const sai = c !== null && a && a.i !== c;
        const bo = c !== null && !a;
        const canBan = room.members.some(m => flagOf(m, i));
        const danhDau = !!markOf(my, i);
        if (sai || bo || canBan || danhDau) out.push(i);
    });
    return out;
}

/** Tải ghi chú cá nhân của buổi học (.md) — câu sai, ghi chú, lời giải của nhóm. */
export function downloadMyNotes() {
    const s = room.session;
    if (!s?.questions?.length) return;
    const my = me();
    const idx = reviewIndexes();
    const L = (k) => String.fromCharCode(65 + k);
    const lines = [
        `# Ghi chú buổi học — ${s.quizTitle || 'Đề trắc nghiệm'}`,
        `_${new Date().toLocaleString('vi-VN')} · phòng ${room.roomId} · ${idx.length}/${s.questions.length} câu cần xem lại_`,
        '',
    ];
    idx.forEach(i => {
        const q = questionAt(i);
        const opts = optsOf(q);
        const c = chosenOf(i);
        const a = answerOf(my, i);
        lines.push(`## Câu ${i + 1}. ${String(q.question || '').replace(/<[^>]*>/g, ' ').trim()}`);
        opts.forEach((o, k) => lines.push(`- ${L(k)}. ${String(o).replace(/<[^>]*>/g, ' ').trim()}${c === k ? '  ← nhóm chốt' : ''}${a?.i === k ? '  ← bạn chọn' : ''}`));
        const note = noteOf(i);
        if (note) lines.push('', `**Giải thích của nhóm:** ${String(note).replace(/<[^>]*>/g, ' ').trim()}`);
        const mine = getNote(q.question);
        if (mine) lines.push('', `**Ghi chú của bạn:** ${String(mine).replace(/<[^>]*>/g, ' ').trim()}`);
        lines.push('');
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ghi-chu-${room.roomId}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    showToast(`Đã tải ${idx.length} câu cần ôn.`, 'success');
}

/** Báo cáo tham gia: ai im lặng, ai hay đoán, ai chăm viết giải thích. */
export function participationHtml() {
    const s = room.session;
    if (!s?.questions?.length) return '';
    const total = s.questions.length;
    const rows = room.members.map(m => {
        const ans = Object.values(m.answers || {});
        const guess = ans.filter(a => a?.guess).length;
        const why = ans.filter(a => a?.why).length;
        const flags = Object.keys(m.flags || {}).length;
        const giang = Object.values(s.explainer || {}).filter(e => e?.uid === m.uid).length;
        const camOn = Object.entries(s.thanks || {})
            .filter(([k]) => s.explainer?.[k]?.uid === m.uid)
            .reduce((n, [, v]) => n + Object.keys(v || {}).length, 0);
        return { m, done: ans.length, guess, why, flags, giang, camOn };
    }).sort((a, b) => b.done - a.done);

    return `<div class="rm-report">
        <p class="rm-label mb-2"><i class="fas fa-chart-simple"></i> Ai tham gia thế nào</p>
        <div class="rm-report-grid">
            ${rows.map(r => `<div class="rm-report-row">
                ${avatarHtml(r.m, 'sm')}
                <div class="min-w-0 flex-1">
                    <p class="text-xs font-bold truncate">${escapeHtml(shortName(r.m.displayName || 'Khách', 16))}</p>
                    <p class="rm-hint">${r.done}/${total} câu${r.guess ? ` · ${r.guess} câu đoán` : ''}${r.why ? ` · ${r.why} lần ghi lý do` : ''}</p>
                </div>
                ${r.giang ? `<span class="rm-chip">🎙 ${r.giang}</span>` : ''}
                ${r.camOn ? `<span class="rm-chip ok">💖 ${r.camOn}</span>` : ''}
                ${r.flags ? `<span class="rm-chip warn">🗣 ${r.flags}</span>` : ''}
                ${!r.done ? '<span class="rm-chip warn">chưa làm câu nào</span>' : ''}
            </div>`).join('')}
        </div>
    </div>`;
}

/** Hộp báo cáo tham gia (dựng tại chỗ, đóng là bỏ luôn). */
function openReport() {
    const old = document.getElementById('report-modal');
    if (old) old.remove();
    const box = document.createElement('div');
    box.id = 'report-modal';
    box.className = 'rm-modal';
    box.innerHTML = `<div class="rm-modal-box" style="max-width:32rem">
        <button class="rm-modal-x" data-close><i class="fas fa-times"></i></button>
        <h3 class="text-lg font-extrabold mb-3">Buổi học này ai làm gì</h3>
        ${participationHtml()}
    </div>`;
    box.addEventListener('click', (e) => {
        if (e.target === box || e.target.closest('[data-close]')) box.remove();
    });
    document.body.appendChild(box);
}

// ───────────────────────── Khởi tạo ─────────────────────────
export function initGame() {
    // Thanh của người chơi
    el('game-bar')?.addEventListener('click', (e) => {
        const i = effectiveIndex();
        const t = e.target.closest('[data-team]');
        if (t) return joinTeam(t.dataset.team);
        if (e.target.closest('[data-buzz]')) return pressBuzz(i);
        if (e.target.closest('[data-buzz-clear]')) return clearBuzz(i);
        const b = e.target.closest('[data-bet]');
        if (b) return setBet(i, Number(b.dataset.bet));
        if (e.target.closest('[data-reveal]')) return setBlind(i, false);
        if (e.target.closest('[data-thank]')) return sayThanks(i);
    });

    // Menu chủ trì
    el('host-game')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = el('game-menu');
        if (!menu.classList.contains('hidden')) return menu.classList.add('hidden');
        openGameMenu();
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#game-menu') && !e.target.closest('#host-game')) el('game-menu')?.classList.add('hidden');
    });
    el('game-menu')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-game]');
        if (!b) return;
        el('game-menu').classList.add('hidden');
        const i = effectiveIndex();
        const act = b.dataset.game;
        if (act === 'teams-on') return void shuffleTeams();
        if (act === 'teams-shuffle') return void shuffleTeams();
        if (act === 'teams-off') return void setTeams(false);
        if (act === 'buzz-on') { setBuzz(true); return void showToast('Đã bật chuông — ai bấm trước được nói trước.', 'info'); }
        if (act === 'buzz-off') return void setBuzz(false);
        if (act === 'blind') { setBlind(i, true); return void showToast('Câu này chọn kín — bấm "Lật bài" khi xong.', 'info'); }
        if (act === 'reveal') return void setBlind(i, false);
        if (act === 'wheel') return void spinWheel(i);
        if (act === 'mynotes') return downloadMyNotes();
        if (act === 'review') return void window.dispatchEvent(new Event('room:save-review'));
        if (act === 'report') return openReport();
    });

    // Có người giành chuông -> báo cho cả phòng biết
    let lastBuzz = '';
    window.addEventListener('room:paint', () => {
        const b = buzzOf(currentIndex());
        const key = b ? `${currentIndex()}:${b.uid}` : '';
        if (key && key !== lastBuzz) {
            lastBuzz = key;
            if (b.uid !== uid()) beep('lock');
        }
        if (!key) lastBuzz = '';
    });
}
