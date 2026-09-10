// room-quiz-stage.js — sân khấu câu hỏi.
// Tinh thần: một nhóm bạn cùng làm đề, mỗi người một máy.
//  · Ai cũng tự đi câu của mình, tự chọn đáp án, và AI CŨNG SỬA ĐƯỢC giải thích /
//    nội dung câu hỏi (chủ trì gõ không kịp thì người khác đỡ).
//  · Chủ trì chỉ hơn ở 3 nút: Hiện đáp án · Chốt đáp án · Câu tiếp (+ lưu đề, kết thúc).
//  · Đáp án trong file chỉ là THAM KHẢO: chỉ hiện khi chủ trì bấm "Hiện đáp án".
import { updateDoc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { parseMarkdown, renderMath, stripOptionLabels, triggerConfetti } from '../quiz/quiz-helpers.js';
import {
    room, refs, uid, canControl, hasSession, optsOf, refIdxOf, chosenOf, isAnnounced, isShown, isBlind,
    noteOf, optNoteOf, answerOf, flagOf, readyOf, unclearOf, currentIndex, isCoop, canRoam,
    questionAt, editOf, issueOf, editorOf, noteAuthorOf, whyOf, dissentOf, talkUntil, prevVoteOf,
} from './room-state.js';
import { escapeHtml, shortName, toggle, avatarStack, avatarHtml } from './room-ui.js';
import { renderRankPanel, renderResults, questionStats, toggleAllStats } from './room-scoreboard.js';
import { MARK_REASONS, getNote, setNote, getMark, setMark } from './room-study.js';
import { renderRich, currentEditKey, renderRichMath } from './room-editor.js';
import { beep, haptic, jumpToUnanswered, autoNextOn, ensureConfetti } from './room-boost.js';
import { renderGameBar, downloadMyNotes } from './room-game.js';

let viewIndex = null;            // câu MÌNH đang xem
let lastFocus = null;
let lastAnnounceKey = '';
let studyTab = 'answer';         // tab đang mở ở khối kiến thức
let mapFilter = 'all';           // bộ lọc của bản đồ câu
let raceOff = false;             // ẩn đường đua (nhớ theo máy)
const popped = new Set();        // câu nào đã bắn hiệu ứng điểm rồi
let saveTimers = {};
let lastTypingPing = 0;
let editingOpt = null;      // đang sửa chữ của phương án thứ mấy
let lastScreen = '';        // sảnh chờ / làm bài / tổng kết — để bật hoạt ảnh vào màn
let lastRenderIndex = null; // câu vừa vẽ, dùng để biết trượt sang trái hay phải
let restoredIndex = false;  // đã khôi phục câu đang xem lần vào trước chưa
let firstLive = true;       // lần vẽ đầu: câu đã chốt sẵn thì đừng bắn pháo/âm thanh

// Đáp án vừa bấm, chưa thấy máy chủ xác nhận -> sơn ngay tại máy mình cho khỏi trễ.
const optimistic = Object.create(null);

// Chống vẽ lại vô ích: nhịp tim 30s, chat, reaction... đều bắn snapshot, trước đây
// mỗi snapshot là vẽ lại CẢ màn (kể cả KaTeX) nên bấm gì cũng thấy khựng.
const sigs = Object.create(null);
function changed(key, value) {
    const sig = JSON.stringify(value);
    if (sigs[key] === sig) return false;
    sigs[key] = sig;
    return true;
}
export function resetRenderCache() { for (const k in sigs) delete sigs[k]; }

const el = (id) => document.getElementById(id);
const debounce = (key, fn, ms = 600) => { clearTimeout(saveTimers[key]); saveTimers[key] = setTimeout(fn, ms); };
const L = (k) => String.fromCharCode(65 + k);

export const effectiveIndex = () => {
    const total = room.session?.questions?.length || 1;
    if (viewIndex !== null) return Math.max(0, Math.min(viewIndex, total - 1));
    return currentIndex();
};
export const setViewIndex = (i) => {
    const total = room.session?.questions?.length || 1;
    viewIndex = Math.max(0, Math.min(i, total - 1));
    try { localStorage.setItem('roomQ_' + room.roomId, String(viewIndex)); } catch (e) {}
    updateDoc(refs.member(), { cursor: viewIndex }).catch(() => {});
    renderQuiz();
};
export const followHost = () => { viewIndex = null; renderQuiz(); };

/** Bật/tắt dải tiến độ nhóm. Phải đi qua đây, vì renderRace() vẽ lại theo biến raceOff. */
export function toggleRace(force) {
    raceOff = force === undefined ? !raceOff : !!force;
    try { localStorage.setItem('roomRaceOff', raceOff ? '1' : '0'); } catch (e) {}
    renderRace();
}
export const answerCurrent = (idx) => submitAnswer(effectiveIndex(), idx);

const myMember = () => room.members.find(m => m.uid === uid());
const explainerOf = (i) => room.session?.explainer?.['q' + i] || null;
const diffOf = (m, i) => m?.diff?.['q' + i] || null;
const startOf = (i) => room.session?.qStarts?.['q' + i] || 0;
const myAnswer = (i) => {
    const server = answerOf(myMember(), i);
    const local = optimistic['q' + i];
    if (!local) return server;
    if (server && server.i === local.i) { delete optimistic['q' + i]; return server; }
    return { ...server, ...local };
};
const canAnswer = (i) => hasSession() && !room.session.ended && !isAnnounced(i) && (isCoop() || !room.session.locked);

async function submitAnswer(i, idx) {
    if (!canAnswer(i)) return;
    const cur = myAnswer(i);
    // Sơn ngay tại máy mình rồi mới gửi Firestore — không đợi mạng quay về nữa.
    optimistic['q' + i] = { i: idx, at: Date.now(), guess: !!cur?.guess, why: cur?.why || '' };
    haptic(8);
    beep('tap');
    renderQuiz();
    await updateDoc(refs.member(), {
        [`answers.q${i}`]: { i: idx, at: Date.now(), guess: !!cur?.guess },
        cursor: i,
    }).catch(err => console.error('Lỗi gửi đáp án:', err));

    // Tự nhảy tới câu chưa chọn (chỉ khi bạn được tự đi câu và câu này chưa chốt)
    if (autoNextOn() && canRoam() && !isAnnounced(i) && i === effectiveIndex()) {
        setTimeout(() => { if (!isAnnounced(i)) jumpToUnanswered(); }, 550);
    }
}

// Báo "tôi đang gõ giải thích câu này" — tối đa 4 giây một lần cho đỡ tốn lượt ghi
function pingTyping(i) {
    if (Date.now() - lastTypingPing < 4000) return;
    lastTypingPing = Date.now();
    updateDoc(refs.session(), {
        [`editing.q${i}`]: { uid: uid(), name: myMember()?.displayName || 'Ai đó', at: Date.now() },
    }).catch(() => {});
}

// ---------- Vẽ chính ----------
export function renderQuiz() {
    const s = room.session;
    const active = hasSession();
    const ended = !!(active && s.ended);

    // Firestore chưa trả phiên đầu tiên -> giữ màn chờ xương cá. Trước đây chỗ này
    // vẽ sảnh chờ trước rồi snapshot về mới đổi sang màn làm bài => nháy một cái.
    if (!room.ready) {
        toggle(el('quiz-boot'), true);
        toggle(el('quiz-lobby'), false);
        toggle(el('quiz-live'), false);
        toggle(el('quiz-result'), false);
        return;
    }
    toggle(el('quiz-boot'), false);

    // Khôi phục đúng câu đang xem của lần vào trước (chỉ ở kiểu "cùng làm")
    if (active && !restoredIndex) {
        restoredIndex = true;
        if (isCoop()) {
            let saved = null;
            try { saved = Number(localStorage.getItem('roomQ_' + room.roomId)); } catch (e) {}
            if (saved > 0 && saved < s.questions.length) viewIndex = saved;
        }
    }

    // Hoạt ảnh vào màn: che nốt phần khựng khi đổi giữa sảnh chờ / làm bài / tổng kết
    const screen = ended ? 'result' : active ? 'live' : 'lobby';
    if (screen !== lastScreen) {
        lastScreen = screen;
        const node = el(screen === 'result' ? 'quiz-result' : screen === 'live' ? 'quiz-live' : 'quiz-lobby');
        node?.classList.remove('rm-fade-in');
        void node?.offsetWidth;
        node?.classList.add('rm-fade-in');
        if (screen !== 'live') lastRenderIndex = null;
    }

    toggle(el('quiz-lobby'), !active);
    toggle(el('quiz-live'), active && !ended);
    toggle(el('quiz-result'), ended);
    toggle(el('host-bar'), active && !ended && canControl());
    toggle(el('lobby-host-setup'), !active && canControl());
    toggle(el('lobby-waiting'), !active && !canControl());

    const badge = el('session-badge');
    badge?.classList.toggle('sm:flex', active);
    const bt = el('session-badge-text');
    if (bt && active) bt.textContent = s.quizTitle || 'Phiên đánh đề';

    const pin = el('pinned-note');
    if (pin) {
        pin.classList.toggle('hidden', !s?.pinnedNote);
        const pt = el('pinned-note-text');
        if (pt) pt.textContent = s?.pinnedNote || '';
    }

    if (active && lastFocus !== s.currentQuestionIndex) {
        if (!isCoop() && !canRoam()) viewIndex = null;   // chế độ cầm trịch: bám theo chủ trì
        lastFocus = s.currentQuestionIndex;
    }
    if (!active) { viewIndex = null; lastFocus = null; }

    // Mục tiêu buổi học ở sảnh chờ — lấy từ doc phòng, ai cũng sửa được
    const goal = document.querySelector('[data-live-edit="goal"]');
    if (goal && currentEditKey() !== 'goal') {
        goal.innerHTML = renderRich(room.roomDoc?.goal || '');
        goal.dataset.empty = goal.textContent.trim() ? '0' : '1';
    }

    renderRankPanel();
    if (ended) return renderResults();
    if (active) renderLive();
}

function renderLive() {
    const s = room.session;
    const i = effectiveIndex();
    const q = questionAt(i);
    if (!q) return;

    // Không có gì liên quan đổi thì thôi, khỏi vẽ. (Nhịp tim / chat / reaction của
    // người khác vẫn bắn snapshot liên tục.)
    if (!changed('live', [
        i, studyTab, editingOpt, raceOff, currentEditKey(),
        s.currentQuestionIndex, s.chosen, s.shown, s.notes, s.notesBy, s.optNotes, s.edits, s.issues,
        s.explainer, s.locked, s.mode, s.liveStats, s.freeRoam, s.qStarts, s.prevVote,
        s.teamOn, s.buzzOn, s.buzz, s.blind, s.spotlight, s.thanks,   // bộ tiện ích trò chơi
        s.quizTitle, s.hostId, s.hostName, s.cohosts, s.questions.length, s.ended,
        editorOf(i) ? Math.floor(Date.now() / 2000) : 0,
        Object.entries(optimistic).map(([k, v]) => k + ':' + v.i),
        room.members.map(m => [m.uid, m.displayName, m.emoji, m.online, m.answers, m.flags,
            m.marks, m.ready, m.unclear, m.dissent, m.diff, m.cursor, m.team]),
    ])) return;

    // Đổi câu -> trượt theo hướng đi + cho phép phương án chạy hoạt ảnh vào một lần
    if (lastRenderIndex !== i) {
        const main = document.querySelector('.rm-col-main');
        const area = el('options-area');
        const dir = lastRenderIndex !== null && i < lastRenderIndex ? 'rm-slide-prev' : 'rm-slide-next';
        if (main) {
            main.classList.remove('rm-slide-next', 'rm-slide-prev');
            void main.offsetWidth;
            main.classList.add(dir);
        }
        area?.classList.add('is-new');
        setTimeout(() => area?.classList.remove('is-new'), 600);
        const firstPaint = lastRenderIndex === null;
        lastRenderIndex = i;
        requestAnimationFrame(() => centerTrack(!firstPaint));
    }

    const total = s.questions.length;
    const opts = stripOptionLabels(optsOf(q));
    const mine = myAnswer(i);
    const chosen = chosenOf(i);
    const announced = isAnnounced(i);
    const shown = isShown(i);
    const refIdx = refIdxOf(q);
    const stats = questionStats(i);
    // Phiếu kín: giấu hết lựa chọn của cả phòng cho tới khi chủ trì lật bài
    const showStats = (announced || shown || !!s.liveStats) && !isBlind(i);

    // --- Thanh điều hướng ---
    el('question-counter').textContent = `Câu ${i + 1}/${total}`;
    const dc = el('dock-counter');
    if (dc) dc.textContent = `Câu ${i + 1}/${total}`;
    el('quiz-session-title').textContent = s.quizTitle || 'Đề trắc nghiệm';
    el('quiz-session-host').textContent =
        (isCoop() ? 'Cùng làm · ai cũng sửa được giải thích' : 'Chủ trì cầm trịch') +
        ` · chủ trì: ${canControl() ? 'bạn' : (s.hostName || 'ẩn danh')}` +
        (i !== currentIndex() ? ` · nhóm đang bàn câu ${currentIndex() + 1}` : '');

    const chip = el('phase-chip');
    if (chip) {
        chip.className = 'rm-state' + (announced ? ' is-locked' : shown ? ' is-shown' : '');
        chip.textContent = announced ? `Đã chốt ${L(chosen)}`
            : shown ? 'Đã hiện đáp án'
            : (!isCoop() && s.locked) ? 'Đã khóa nộp' : 'Chưa chốt';
    }
    const lc = el('left-chip');
    if (lc) {
        const meNow = myMember();
        let left = 0;
        for (let k = 0; k < total; k++) if (!meNow?.answers?.['q' + k] && !optimistic['q' + k]) left++;
        lc.classList.remove('hidden');
        lc.classList.toggle('is-done', left === 0);
        el('left-text').textContent = left ? `Còn ${left} câu` : 'Xong hết';
    }

    el('q-track').innerHTML = questionTrackHtml(i);
    renderRace();
    renderExplainer(i);

    const map = el('question-map');
    if (map && !map.classList.contains('hidden')) map.innerHTML = questionMapHtml(i);

    // --- Dòng thông tin câu: một dòng chữ xám, không chip màu loạn ---
    const meta = el('q-meta');
    const bits = [];
    if (q.topic && String(q.topic).trim().toLowerCase() !== 'chung') bits.push(escapeHtml(q.topic));
    if (q.level) bits.push(escapeHtml(q.level));
    if (q.source) bits.push('Nguồn: ' + escapeHtml(q.source));
    const marked = room.members.filter(m => m.marks?.['q' + i]).length;
    const flagged = room.members.filter(m => flagOf(m, i)).length;
    if (marked) bits.push(`${marked} người đánh dấu`);
    if (flagged) bits.push(`<span class="warn">🗣 ${flagged} người muốn bàn</span>`);
    if (issueOf(i)) bits.push(`<span class="warn">⚠ ${escapeHtml(issueOf(i))}</span>`);
    if (editOf(i)) bits.push('nội dung đã được nhóm sửa');
    if (q.expanded) bits.push('📖 có phần mở rộng');
    if (q.note) bits.push('📌 có ghi nhớ');
    meta.innerHTML = bits.join('<span class="sep">·</span>');
    meta.classList.toggle('hidden', !bits.length);

    // --- Ca lâm sàng ---
    const caseBox = el('case-box');
    const caseText = q.caseText || q.case || '';
    caseBox.classList.toggle('hidden', !caseText);
    if (caseText) {
        caseBox.innerHTML = `<b><i class="fas fa-notes-medical mr-1"></i>${escapeHtml(q.caseTitle || 'Ca lâm sàng')}</b><br>` + parseMarkdown(caseText);
        renderMath(caseBox);
    }

    // --- Câu hỏi: bấm vào là sửa được ngay, cả nhóm thấy liền ---
    const qt = el('question-text');
    qt.setAttribute('contenteditable', 'true');
    qt.dataset.liveEdit = 'question';
    qt.dataset.placeholder = 'Nhập nội dung câu hỏi…';
    qt.title = 'Bấm để sửa câu hỏi — bôi đen để in đậm/nghiêng';
    if (currentEditKey() !== 'question') {
        qt.innerHTML = renderRich(q.question || '');
        renderMath(qt);
    }

    renderOptions(i, q, opts, mine, chosen, announced, shown, refIdx, stats, showStats);
    renderConsensus(i, stats, mine, chosen, announced);
    renderGameBar(i);
    renderSelfBar(i, mine, q);
    renderAnswerBlock(i, q, opts, chosen, announced, shown, refIdx);
    renderMyBlock(i, q, opts);
    renderOpinionBoard(i, opts, chosen, announced);
    paintStudyTabs(i, q);
    tickTalk();

    const key = `${i}:${chosen}`;
    if (announced && mine && lastAnnounceKey !== key && !popped.has(key)) {
        lastAnnounceKey = key;
        if (firstLive) {
            // vừa vào phòng, câu này đã chốt từ trước -> im lặng
        } else if (mine.i === chosen) {
            ensureConfetti().then(() => { try { triggerConfetti(); } catch (e) {} });
            popScore(i);
            beep('good');
            haptic(14);
        } else {
            popped.add(key);
            beep('bad');
            haptic([8, 40, 8]);
        }
    }
    firstLive = false;
}

// Trạng thái một câu, dùng chung cho dải câu và bản đồ câu
function qStateOf(k) {
    const a = myAnswer(k);
    const c = chosenOf(k);
    if (a && c !== null) return a.i === c ? 'good' : 'bad';
    if (a) return 'done';
    if (c !== null) return 'miss';
    return 'todo';
}

function questionMapHtml(cur) {
    const s = room.session;
    const me = myMember();
    const total = s.questions.length;
    const count = { todo: 0, done: 0, good: 0, bad: 0, miss: 0 };
    let flags = 0, marks = 0;
    for (let k = 0; k < total; k++) {
        count[qStateOf(k)]++;
        if (flagOf(me, k)) flags++;
        if (me?.marks?.['q' + k]) marks++;
    }
    const left = count.todo + count.miss;
    const keep = (k) => {
        if (mapFilter === 'todo') return qStateOf(k) === 'todo' || qStateOf(k) === 'miss';
        if (mapFilter === 'flag') return flagOf(me, k);
        if (mapFilter === 'mark') return !!me?.marks?.['q' + k];
        if (mapFilter === 'wrong') return qStateOf(k) === 'bad';
        return true;
    };
    const shown = [];
    for (let k = 0; k < total; k++) if (keep(k)) shown.push(k);

    const chip = (id, label, n) =>
        `<button class="rm-mchip ${mapFilter === id ? 'on' : ''}" data-mapfilter="${id}" ${n === 0 && id !== 'all' ? 'disabled' : ''}>${label}${n !== undefined ? ` <b>${n}</b>` : ''}</button>`;

    const cells = shown.map(k => {
        const st = qStateOf(k);
        const f = flagOf(me, k);
        const mk = me?.marks?.['q' + k];
        const tip = `Câu ${k + 1} · ` + ({ todo: 'chưa chọn', done: 'bạn đã chọn', good: 'bạn chọn trúng', bad: 'bạn chọn trật', miss: 'nhóm đã chốt, bạn chưa chọn' }[st]);
        return `<button class="rm-mcell is-${st} ${k === cur ? 'now' : ''} ${k === currentIndex() ? 'focus' : ''}"
                        data-jump="${k}" title="${tip}" aria-label="${tip}">
            <span>${k + 1}</span>
            ${f ? '<i class="rm-mflag">🗣</i>' : ''}${mk ? '<i class="rm-mmark"></i>' : ''}
        </button>`;
    }).join('');

    return `
        <div class="rm-mhead">
            <div class="rm-mstat">
                <b>${total - left}/${total}</b> câu bạn đã chọn
                ${count.bad ? `<span class="rm-chip bad">${count.bad} trật</span>` : ''}
                ${count.miss ? `<span class="rm-chip warn">${count.miss} chốt rồi mà bạn bỏ trống</span>` : ''}
            </div>
            <button class="rm-mjump" data-mapjump><i class="fas fa-forward"></i>Tới câu chưa chọn</button>
        </div>
        <div class="rm-mfilters">
            ${chip('all', 'Tất cả', total)}
            ${chip('todo', 'Chưa chọn', left)}
            ${chip('wrong', 'Chọn trật', count.bad)}
            ${chip('flag', '🗣 Cần bàn', flags)}
            ${chip('mark', '🔖 Đánh dấu', marks)}
        </div>
        <div class="rm-mgrid">${cells || '<p class="rm-mempty">Không có câu nào trong nhóm này — mừng quá!</p>'}</div>
        <div class="rm-mlegend">
            <span><i class="rm-lg is-todo"></i>chưa chọn</span>
            <span><i class="rm-lg is-done"></i>đã chọn</span>
            <span><i class="rm-lg is-good"></i>trúng</span>
            <span><i class="rm-lg is-bad"></i>trật</span>
            <span><i class="rm-lg is-miss"></i>bỏ trống</span>
        </div>`;
}

function renderOptions(i, q, opts, mine, chosen, announced, shown, refIdx, stats, showStats) {
    const area = el('options-area');
    // Phương án ngắn thì xếp 2 cột cho đỡ dài; phương án dài luôn 1 cột cho dễ đọc
    area.classList.toggle('is-short', opts.every(o => String(o).replace(/<[^>]*>/g, '').trim().length <= 46));
    const ek = currentEditKey() || '';
    if (ek.startsWith('opttext:') || ek.startsWith('optexp:')) return;   // đang gõ thì đừng vẽ lại
    const voters = (k) => room.members.filter(m => answerOf(m, i)?.i === k);
    const topN = Math.max(0, ...stats.counts);      // ý đang dẫn đầu, để đánh dấu ngay trên ô
    const soloLead = topN > 0 && stats.counts.filter(n => n === topN).length === 1;
    // Vẽ lại phương án là phần tốn nhất (innerHTML + KaTeX) -> chỉ vẽ khi thật sự đổi
    if (!changed('opts', [
        i, opts, mine, chosen, announced, shown, refIdx, editingOpt, canAnswer(i), ek,
        showStats ? [stats, room.members.map(m => [m.uid, m.displayName, m.emoji, answerOf(m, i)?.i])] : 0,
        optimistic['q' + i] ? optimistic['q' + i].i : null,
        room.session?.optNotes?.['q' + i], q.optionExplanations,
    ])) return;
    area.innerHTML = opts.map((opt, idx) => {
        const picked = mine?.i === idx;
        const isCorrect = announced && chosen === idx;
        const isWrong = announced && picked && chosen !== idx;
        const isRef = shown && !announced && refIdx === idx;
        const pct = stats.total ? Math.round(100 * stats.counts[idx] / stats.total) : 0;
        const cls = ['rm-option'];
        if (isCorrect) cls.push('correct');
        else if (isWrong) cls.push('wrong');
        else if (picked) cls.push('picked');
        if (isRef) cls.push('shown-ref');
        if (!canAnswer(i)) cls.push('rm-locked');
        if (editingOpt === idx) cls.push('is-editing');
        if (optimistic['q' + i] && optimistic['q' + i].i === idx) cls.push('is-sending');
        const names = showStats ? voters(idx) : [];
        const exp = (announced || shown) ? (optNoteOf(i, idx) || (q.optionExplanations && q.optionExplanations[idx]) || '') : '';
        const textHtml = editingOpt === idx
            ? `<span class="rm-md" contenteditable="true" data-live-edit="opttext:${idx}" data-placeholder="Nội dung phương án ${L(idx)}…">${renderRich(opt)}</span>`
            : renderRich(opt);
        return `<button type="button" data-opt="${idx}" class="${cls.join(' ')}">
            ${showStats ? `<span class="rm-fill" style="width:${pct}%"></span>` : ''}
            <span class="rm-opt-edit" data-edit-opt-text="${idx}" title="Sửa nội dung phương án ${L(idx)}"><i class="fas fa-pen"></i></span>
            <span class="rm-letter">${L(idx)}</span>
            <span class="rm-otext">
                ${textHtml}
                ${isRef ? '<span class="rm-chip warn">đáp án trong file</span>' : ''}
                ${names.length ? `<span class="rm-voters">${avatarStack(names, 8)}</span>` : ''}
                ${exp ? `<span class="rm-oexp">${renderRich(exp)}</span>` : ''}
            </span>
            ${showStats && stats.total
            ? `<span class="rm-pct ${soloLead && stats.counts[idx] === topN && !announced ? 'is-lead' : ''}"
                     title="${stats.counts[idx]}/${stats.total} người trong phòng chọn ý này">${stats.counts[idx]} · ${pct}%</span>`
            : ''}
        </button>`;
    }).join('');
    renderMath(area);
    if (editingOpt !== null) {
        const node = area.querySelector(`[data-live-edit="opttext:${editingOpt}"]`);
        if (node) { node.focus(); document.getSelection()?.selectAllChildren(node); }
    }
}

// ---------- Dải viên kẹo: mỗi câu một viên, luôn nhìn thấy ----------
function questionTrackHtml(cur) {
    const s = room.session;
    const me = myMember();
    const total = s.questions.length;
    const track = el('q-track');
    track.classList.toggle('is-long', total > 20);
    let out = '';
    for (let k = 0; k < total; k++) {
        if (k && k % 10 === 0) out += `<span class="rm-pip-sep"><i>${k}</i></span>`;
        const a = myAnswer(k);
        const c = chosenOf(k);
        let cls = 'rm-pip';
        if (a && c !== null) cls += a.i === c ? ' good' : ' bad';
        else if (a) cls += ' done';
        else if (c !== null) cls += ' miss';           // nhóm chốt rồi mà mình chưa chọn
        if (flagOf(me, k)) cls += ' flag';
        if (k === cur) cls += ' now';
        if (k === currentIndex()) cls += ' focus';
        const tip = `Câu ${k + 1}` + (c !== null ? ' · nhóm đã chốt' : a ? ' · bạn đã chọn' : ' · chưa chọn')
            + (flagOf(me, k) ? ' · cần bàn' : '');
        out += `<button class="${cls}" data-jump="${k}" title="${tip}" aria-label="${tip}">${k + 1}</button>`;
    }
    return out;
}

/** Kéo viên kẹo của câu đang xem vào giữa tầm mắt (đề dài mới cần). */
function centerTrack(smooth = true) {
    const t = el('q-track');
    const now = t?.querySelector('.rm-pip.now');
    if (!t || !now) return;
    const target = now.offsetLeft - (t.clientWidth - now.offsetWidth) / 2;
    t.scrollTo({ left: Math.max(0, target), behavior: smooth ? 'smooth' : 'auto' });
}

// ---------- Đường đua: ai đang làm tới đâu ----------
function renderRace() {
    const box = el('race');
    if (!box) return;
    box.classList.toggle('is-off', raceOff);
    if (raceOff) return;
    const total = room.session?.questions?.length || 1;
    const done = (m) => Object.keys(m.answers || {}).length;
    const runners = room.members.filter(m => m.online !== false).sort((a, b) => done(b) - done(a));
    if (!runners.length) { box.innerHTML = ''; return; }
    const best = done(runners[0]);
    const leader = best > 0 ? runners[0] : null;
    const meNow = myMember();

    // Gom người đứng gần nhau vào cùng một mốc -> hết cảnh avatar chồng thành đống
    const STEP = 5;                                   // mỗi mốc rộng 5%
    const groups = new Map();
    runners.forEach(m => {
        const pct = Math.min(100, Math.round(100 * done(m) / total));
        const key = Math.round(pct / STEP) * STEP;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(m);
    });

    const marks = [...groups.entries()].map(([pct, list]) => {
        const mine = list.some(m => m.uid === uid());
        const head = list.slice(0, mine ? 1 : 2);
        const rest = list.length - head.length;
        const names = list.map(m => `${escapeHtml(shortName(m.displayName || 'Khách', 12))} ${done(m)}/${total}`).join(' · ');
        return `<div class="rm-rmark ${mine ? 'is-me' : ''}" style="left:${pct}%" title="${names}">
            <div class="rm-rfaces">
                ${head.map(m => `${done(m) === best && best > 0 ? '<span class="rm-rcrown">👑</span>' : ''}${avatarHtml(m, 'sm')}`).join('')}
                ${rest > 0 ? `<span class="rm-rmore">+${rest}</span>` : ''}
            </div>
            ${mine ? `<span class="rm-rtag">Bạn · ${done(meNow || {})}/${total}</span>` : ''}
        </div>`;
    }).join('');

    box.innerHTML = `
        <div class="rm-race-top">
            <span class="rm-race-label">🏁 Cả nhóm tới đâu rồi</span>
            ${leader ? `<span class="rm-rlead">👑 ${escapeHtml(shortName(leader.displayName || 'Khách', 10))} · ${best}/${total}</span>` : ''}
            <span class="rm-rcount">${runners.length} người đang làm</span>
            <button class="rm-icon-btn rm-race-toggle" data-race-toggle title="Ẩn dải tiến độ"><i class="fas fa-eye-slash"></i></button>
        </div>
        <div class="rm-race-lane">
            <div class="rm-rticks">
                ${[0, 25, 50, 75, 100].map(p => `<span style="left:${p}%"><i></i><b>${Math.round(total * p / 100)}</b></span>`).join('')}
            </div>
            ${marks}
        </div>`;
}

// ---------- Ai đang nhận giảng câu này ----------
function renderExplainer(i) {
    const chip = el('explainer-chip');
    if (!chip) return;
    const ex = explainerOf(i);
    chip.classList.toggle('hidden', !ex);
    if (ex) chip.innerHTML = `🎙 <b>${escapeHtml(shortName(ex.name || 'Ai đó', 10))}</b> nhận giảng`;
}

// ---------- Điểm bay lên khi chốt trúng ----------
function popScore(i) {
    const key = `${i}:${chosenOf(i)}`;
    if (popped.has(key)) return;
    popped.add(key);
    const layer = el('reaction-layer');
    if (!layer) return;
    // chuỗi: đếm ngược từ câu này về trước, bao lâu còn chốt trúng liên tiếp
    let streak = 0;
    for (let k = i; k >= 0; k--) {
        const c = chosenOf(k);
        const a = myAnswer(k);
        if (c === null || !a) break;
        if (a.i !== c) break;
        streak++;
    }
    const st = questionStats(i);
    const all = st.total >= 2 && st.counts[chosenOf(i)] === st.total;
    const node = document.createElement('div');
    node.className = 'rm-pop';
    node.innerHTML = `<b>+10</b><span>${all ? '🎯 Cả phòng ăn trọn!' : streak >= 2 ? `🔥 Chuỗi ${streak} câu` : '✨ Chuẩn luôn!'}</span>`;
    layer.appendChild(node);
    setTimeout(() => node.remove(), 2000);
}

// ---------- Bảng phiếu: nhóm đang nghiêng về đâu ----------
function renderConsensus(i, stats, mine, chosen, announced) {
    const box = el('consensus-bar');
    const opts = stripOptionLabels(optsOf(questionAt(i)));
    const totalMembers = room.members.length || 1;
    const answered = stats.total;
    const ready = room.members.filter(m => readyOf(m, i)).length;
    const top = stats.counts.length ? stats.counts.reduce((b, n, k) => (n > stats.counts[b] ? k : b), 0) : 0;
    const pct = answered ? Math.round(100 * stats.counts[top] / answered) : 0;
    const unanimous = answered >= 2 && pct === 100;
    // Hoà phiếu thì phải nói là hoà, đừng chỉ đại một ý
    const tied = stats.counts.map((n, k) => (n === stats.counts[top] && n > 0 ? k : -1)).filter(k => k >= 0);
    const unclear = room.members.filter(m => unclearOf(m, i));
    const dissent = room.members.filter(m => dissentOf(m, i));
    const showWho = announced || isShown(i) || !!room.session?.liveStats;

    // Số phiếu từng phương án nằm NGAY TRONG ô phương án (xem renderOptions),
    // ở đây chỉ còn thứ ô phương án không nói được: tóm tắt, trạng thái nhóm, huy hiệu, độ khó.

    // --- huy hiệu vui sau khi chốt ---
    const badges = [];
    if (announced) {
        const start = startOf(i);
        const winners = room.members.filter(m => answerOf(m, i)?.i === chosen);
        if (start) {
            const fast = winners.filter(m => answerOf(m, i)?.at > start)
                .sort((a, b) => answerOf(a, i).at - answerOf(b, i).at)[0];
            if (fast) badges.push(`⚡ Nhanh nhất: ${escapeHtml(shortName(fast.displayName || 'Khách', 10))} · ${((answerOf(fast, i).at - start) / 1000).toFixed(1)}s`);
        }
        if (answered >= 3 && winners.length && winners.length / answered <= .4) {
            badges.push(`🦸 Cứu tinh: ${winners.map(m => escapeHtml(shortName(m.displayName || 'Khách', 10))).join(', ')}`);
        }
        const author = noteAuthorOf(i);
        if (author?.name) badges.push(`🧠 Người viết giải thích: ${escapeHtml(shortName(author.name, 10))}`);
        if (answered >= 2 && winners.length === answered) badges.push('🎯 Cả phòng cùng trúng!');
    }

    // --- bình chọn độ khó (sau khi chốt) ---
    const DIFFS = [['easy', '😌', 'Dễ'], ['ok', '😐', 'Vừa'], ['hard', '😵', 'Khó']];
    const myDiff = diffOf(myMember(), i);
    const diffCount = (v) => room.members.filter(m => diffOf(m, i) === v).length;
    const voted = DIFFS.reduce((n, [v]) => n + diffCount(v), 0);
    const diffBar = announced ? `
        <div class="rm-diffbar">
            <span class="rm-label">Câu này khó không?</span>
            ${DIFFS.map(([v, e, lb]) => `<button class="rm-diff-btn ${myDiff === v ? 'on' : ''}" data-diff="${v}">${e} ${lb}${diffCount(v) ? ` ${diffCount(v)}` : ''}</button>`).join('')}
            ${voted && diffCount('hard') >= Math.ceil(voted / 2) ? '<span class="rm-chip warn">nhóm thấy khó — nên ôn lại</span>' : ''}
        </div>` : '';

    box.innerHTML = `
        <div class="rm-vprog" title="${answered}/${totalMembers} người đã chọn"><span style="width:${Math.round(100 * answered / totalMembers)}%"></span></div>
        <div class="rm-vote-head">
            <span><b>${answered}</b>/${totalMembers} đã chọn</span>
            <span>·</span>
            ${isBlind(i)
                ? '<span>🙈 Đang giấu phiếu — chờ chủ trì lật bài</span>'
                : answered
                ? (announced
                    ? `<span>Nhóm chốt <b>${L(chosen)}</b>${stats.counts[chosen] ? ` · ${Math.round(100 * stats.counts[chosen] / answered)}% chọn trúng` : ''}</span>`
                    : tied.length > 1
                        ? `<span>Đang chia đều <b>${tied.map(L).join(' / ')}</b> · ${pct}% mỗi ý</span>`
                        : `<span>${unanimous ? 'Cả nhóm cùng chọn' : 'Đang nghiêng về'} <b>${L(top)}</b> · ${pct}%</span>`)
                : '<span>Chưa ai chọn</span>'}
            <div class="flex-1"></div>
            ${ready ? `<span class="rm-chip ok"><i class="fas fa-check"></i>${ready} báo xong</span>` : ''}
            ${dissent.length ? `<span class="rm-chip warn" title="${escapeHtml(dissent.map(m => m.displayName || '').join(', '))}">✋ ${dissent.length} bảo lưu</span>` : ''}
            ${unclear.length ? `<span class="rm-chip warn" title="${escapeHtml(unclear.map(m => m.displayName || '').join(', '))}">🤔 ${unclear.length} chưa hiểu</span>` : ''}
            ${!mine && !announced ? '<span class="rm-chip warn">bạn chưa chọn</span>' : ''}
        </div>

        ${badges.length ? `<div class="rm-vote-badges">${badges.map(b => `<span class="rm-badge-chip">${b}</span>`).join('')}</div>` : ''}
        ${diffBar}`;
}

// ---------- Thẻ "Việc của tôi": gom nút theo nhóm cho dễ hiểu ----------
function renderSelfBar(i, mine, q) {
    const bar = el('self-bar');
    const ek = currentEditKey() || '';
    if (ek === 'why') return;                       // đang gõ lý do thì đừng vẽ lại
    const me = myMember();
    const mark = getMark(q.question);
    const r = mark ? MARK_REASONS[mark] : null;
    const announced = isAnnounced(i);
    const differ = announced && mine && mine.i !== chosenOf(i);
    const ex = explainerOf(i);
    const iExplain = ex?.uid === uid();
    bar.innerHTML = `
        <div class="rm-selfrow">
            <span class="rm-label"><i class="fas fa-user-check"></i> Câu trả lời của tôi</span>
            <button data-guess class="rm-mini ${mine?.guess ? 'is-guess' : ''}" ${mine ? '' : 'disabled'} title="Đánh dấu là bạn chỉ đoán">
                <i class="fas ${mine?.guess ? 'fa-dice' : 'fa-circle-check'}"></i>${mine?.guess ? 'Chỉ đoán' : 'Chắc chắn'}
            </button>
            <button data-ready class="rm-mini ${readyOf(me, i) ? 'is-ready' : ''}" title="Báo cho chủ trì là bạn xong câu này">
                <i class="fas fa-flag-checkered"></i>${readyOf(me, i) ? 'Đã báo xong' : 'Tôi xong rồi'}
            </button>
            ${i !== currentIndex() ? `<button data-nav="focus" class="rm-mini is-on"><i class="fas fa-location-arrow"></i>Về câu nhóm đang bàn (${currentIndex() + 1})</button>` : ''}
        </div>

        <div class="rm-selfrow">
            <span class="rm-label"><i class="fas fa-hand-sparkles"></i> Nhờ cả nhóm</span>
            <button data-flag class="rm-mini ${flagOf(me, i) ? 'is-flag' : ''}" title="Báo cho cả nhóm: câu này cần bàn thêm">🗣 Cần bàn</button>
            ${announced ? `<button data-unclear class="rm-mini ${unclearOf(me, i) ? 'is-flag' : ''}">🤔 Chưa hiểu</button>` : ''}
            <button data-explain-me class="rm-mini ${iExplain ? 'is-on' : ''}" title="Nhận giảng câu này cho cả nhóm">
                🎙 ${iExplain ? 'Mình đang nhận giảng' : ex ? `${escapeHtml(shortName(ex.name || 'Ai đó', 8))} đang giảng` : 'Mình giảng câu này'}
            </button>
            ${differ ? `<button data-dissent class="rm-mini ${dissentOf(me, i) ? 'is-flag' : ''}" title="Ý kiến của bạn vẫn được ghi vào biên bản">
                ✋ ${dissentOf(me, i) ? 'Đang bảo lưu' : 'Vẫn giữ ' + L(mine.i)}</button>` : ''}
            <div class="relative">
                <button data-mark-toggle class="rm-mini ${r ? 'is-on' : ''}"><i class="fas ${r ? r.icon : 'fa-flag'}"></i>${r ? r.short : 'Đánh dấu'}</button>
                <div id="mark-menu" class="rm-menu hidden">
                    ${Object.entries(MARK_REASONS).map(([k, m]) => `
                        <button data-mark="${k}" class="rm-menu-item ${mark === k ? 'is-active' : ''}">
                            <span class="rm-menu-ic" style="background:${m.bg};color:${m.color}"><i class="fas ${m.icon}"></i></span>${m.label}</button>`).join('')}
                    ${mark ? '<button data-mark="__unmark" class="rm-menu-item"><span class="rm-menu-ic" style="background:#fee2e2;color:#ef4444"><i class="fas fa-flag-checkered"></i></span>Bỏ đánh dấu</button>' : ''}
                </div>
            </div>
        </div>

        <div class="rm-whywrap" data-live-wrap>
            <div class="rm-whyhead">
                <span class="rm-label"><i class="fas fa-comment-dots"></i> Vì sao bạn chọn${mine ? ' ' + L(mine.i) : ''}?</span>
                <span data-live-status></span>
                <div class="flex-1"></div>
                <span class="rm-live-hint">cả nhóm sẽ thấy khi bàn</span>
            </div>
            <div class="rm-md rm-why" contenteditable="true" data-live-edit="why"
                 data-placeholder="${mine ? 'Ghi ngắn gọn lý do…' : 'Chọn một phương án trước đã…'}">${renderRich(whyOf(me, i))}</div>
        </div>`;
    markEmpty(bar);
}

// ---------- Khối "Đáp án & giải thích" — CẢ NHÓM cùng viết ----------
function renderAnswerBlock(i, q, opts, chosen, announced, shown, refIdx) {
    const box = el('answer-block');
    const ek = currentEditKey() || '';
    if (box.dataset.qi === String(i) && (ek === 'explain' || ek.startsWith('optexp:'))) {
        updateTypingHint(i);
        return;                                   // đang gõ thì giữ nguyên, khỏi nhảy con trỏ
    }
    box.dataset.qi = String(i);
    if (!changed('answer', [i, chosen, announced, shown, refIdx, studyTab, ek,
        noteOf(i), noteAuthorOf(i), room.session?.optNotes?.['q' + i],
        q.explanation || q.explain || '', q.expanded || '', q.note || '', opts])) {
        return updateTypingHint(i);
    }

    const author = noteAuthorOf(i);
    const fileExp = q.explanation || q.explain || '';
    const note = noteOf(i);
    const state = announced
        ? `<div class="rm-verdict ${refIdx !== null && refIdx !== chosen ? 'diff' : ''}">
                <span><i class="fas fa-gavel"></i> Nhóm chốt: <b>${L(chosen)}</b></span>
                ${refIdx !== null
                    ? `<span>·</span><span><i class="fas fa-file-lines"></i> File: <b>${L(refIdx)}</b></span>
                       ${refIdx === chosen ? '<span class="rm-chip ok">khớp</span>' : '<span class="rm-chip warn">khác file — nên kiểm lại</span>'}`
                    : '<span class="rm-chip">file không có đáp án</span>'}
           </div>`
        : shown
            ? `<div class="rm-verdict diff"><i class="fas fa-eye"></i> Đáp án tham khảo trong file: <b>${refIdx !== null ? L(refIdx) : 'không có'}</b> — bàn xong rồi chủ trì mới chốt.</div>`
            : '<p class="text-xs text-muted mb-1"><i class="fas fa-lock mr-1"></i>Đáp án trong file đang giấu. Cả nhóm cứ ghi lý lẽ vào đây trước.</p>';

    box.className = 'rm-spane' + (studyTab === 'answer' ? '' : ' hidden');
    box.innerHTML = `
        <div data-live-wrap>
            <div class="flex items-center gap-2 mb-2 flex-wrap">
                ${announced ? '<span class="rm-chip ok">đã chốt</span>' : shown ? '<span class="rm-chip warn">đã hiện đáp án file</span>' : '<span class="rm-chip">chưa chốt</span>'}
                <span id="typing-hint" class="rm-typing"></span>
            </div>
            ${state}
            <div class="flex items-center gap-2 mt-3 mb-1.5 flex-wrap">
                <span class="rm-label">Giải thích chung</span>
                <span class="rm-live-hint"><i class="fas fa-pen"></i>bấm vào là sửa · bôi đen để in đậm</span>
                <span data-live-status></span>
                ${author ? `<span class="text-[11px] text-muted">${escapeHtml(author.name || '')} sửa lần cuối</span>` : ''}
                <div class="flex-1"></div>
                ${fileExp && !note && (announced || shown) ? '<button data-usefileexp class="rm-chip accent"><i class="fas fa-file-import"></i>Lấy giải thích trong file</button>' : ''}
            </div>
            <div class="rm-md" contenteditable="true" data-live-edit="explain"
                 data-placeholder="Ghi cách suy luận, mẹo nhớ, dẫn chứng… (cả nhóm cùng thấy)">${renderRich(note)}</div>

            <details class="mt-3" ${opts.some((_, k) => optNoteOf(i, k)) ? 'open' : ''}>
                <summary class="rm-label cursor-pointer">Giải thích riêng từng phương án</summary>
                <div class="mt-2 space-y-2">
                    ${opts.map((_, k) => {
                        const t = optNoteOf(i, k) || ((announced || shown) && q.optionExplanations && q.optionExplanations[k]) || '';
                        return `<div class="flex items-start gap-2">
                            <span class="rm-letter mt-1">${L(k)}</span>
                            <div class="rm-md flex-1" contenteditable="true" data-live-edit="optexp:${k}"
                                 data-placeholder="Vì sao ${L(k)} đúng/sai…">${renderRich(t)}</div>
                        </div>`;
                    }).join('')}
                </div>
            </details>
            ${(announced || shown) && q.expanded ? `<div class="rm-note-callout indigo mt-3"><b><i class="fas fa-expand mr-1"></i>Mở rộng:</b> <div class="rm-md">${renderRich(q.expanded)}</div></div>` : ''}
            ${(announced || shown) && q.note ? `<div class="rm-note-callout mt-2"><b><i class="fas fa-thumbtack mr-1"></i>Ghi nhớ:</b> <div class="rm-md">${renderRich(q.note)}</div></div>` : ''}
        </div>`;
    updateTypingHint(i);
    markEmpty(box);
    renderMath(box);
}

// Ô trống thì hiện chữ gợi ý mờ
function markEmpty(root) {
    root.querySelectorAll('[data-live-edit]').forEach(n => {
        n.dataset.empty = n.textContent.trim() ? '0' : '1';
    });
}

function updateTypingHint(i) {
    const e = editorOf(i);
    const hint = el('typing-hint');
    if (hint) hint.textContent = e ? `✍️ ${e.name} đang gõ…` : '';
}

// ---------- Khối "Ghi chú của tôi & sửa đề" ----------
function renderMyBlock(i, q, opts) {
    const box = el('my-block');
    const ek = currentEditKey() || '';
    if (box.dataset.qi === String(i) && (ek === 'note' || ek === 'issue')) return;
    box.dataset.qi = String(i);
    const edited = editOf(i);
    const note = getNote(q.question);
    if (!changed('my', [i, studyTab, ek, note, getMark(q.question), issueOf(i), edited, opts])) return;
    const issue = issueOf(i);
    box.className = 'rm-spane' + (studyTab === 'my' ? '' : ' hidden');
    box.innerHTML = `
        <div data-live-wrap>
            ${edited || issue ? `<div class="flex items-center gap-2 mb-2 flex-wrap">
                ${edited ? '<span class="rm-chip warn">đề đã được nhóm sửa</span>' : ''}
                ${issue ? '<span class="rm-chip bad">có báo lỗi</span>' : ''}
            </div>` : ''}
            <div class="flex items-center gap-2 mb-1.5 flex-wrap">
                <span class="rm-label">Ghi chú riêng — chỉ mình bạn thấy</span>
                <span data-live-status></span>
                <div class="flex-1"></div>
                <span class="text-[10px] text-muted">đồng bộ với trang làm bài</span>
            </div>
            <div class="rm-md" contenteditable="true" data-live-edit="note"
                 data-placeholder="Ghi lại điều cần nhớ ở câu này…">${renderRich(note)}</div>

            <div class="flex items-center gap-2 mt-4 mb-1.5 flex-wrap">
                <span class="rm-label">Báo lỗi đề — cả nhóm cùng thấy</span>
                <div class="flex-1"></div>
                ${edited ? '<button data-reset-edit class="rm-chip bad"><i class="fas fa-rotate-left"></i>Trả câu về bản gốc</button>' : ''}
            </div>
            <div class="rm-md" contenteditable="true" data-live-edit="issue"
                 data-placeholder="Ví dụ: thiếu dữ kiện, 2 đáp án cùng đúng…">${renderRich(issue)}</div>
            <p class="text-[11px] text-muted mt-3">
                <i class="fas fa-circle-info mr-1"></i>Sửa nội dung câu hỏi: bấm thẳng vào câu hỏi ở trên.
                Sửa phương án: rê chuột vào phương án rồi bấm nút bút chì.
            </p>
        </div>`;
    markEmpty(box);
    renderMath(box);
}

// ---------- Bảng ý kiến: ai chọn gì, vì sao ----------
function renderOpinionBoard(i, opts, chosen, announced) {
    const box = el('opinion-board');
    if (!box) return;
    const rows = opts.map((opt, k) => {
        const people = room.members.filter(m => answerOf(m, i)?.i === k);
        return { k, opt, people };
    }).filter(r => r.people.length);
    box.className = 'rm-spane' + (studyTab === 'who' ? '' : ' hidden');
    if (!rows.length) {
        box.innerHTML = '<p class="rm-notice py-4">Chưa ai chọn phương án nào ở câu này.</p>';
        return;
    }
    box.innerHTML = `
        <p class="rm-label mb-1.5"><i class="fas fa-people-arrows"></i> Ai chọn gì · câu ${i + 1}</p>
        <div class="space-y-1.5 mb-2">
            ${rows.map(r => `
                <div class="rm-opinion ${announced && chosen === r.k ? 'is-chosen' : ''}">
                    <span class="rm-letter">${L(r.k)}</span>
                    <div class="min-w-0 flex-1">
                        <p class="text-[11px] font-bold truncate">${escapeHtml(String(r.opt).replace(/<[^>]*>/g, '').slice(0, 60))}</p>
                        ${r.people.map(m => {
                            const why = whyOf(m, i);
                            return `<p class="text-[11px] text-muted mt-0.5">
                                <b>${escapeHtml(shortName(m.displayName || 'Khách', 12))}</b>${dissentOf(m, i) ? ' <span class="rm-chip warn">bảo lưu</span>' : ''}${why ? ': ' + why.replace(/<[^>]*>/g, '') : ''}</p>`;
                        }).join('')}
                    </div>
                    <span class="rm-chip">${r.people.length}</span>
                </div>`).join('')}
        </div>`;
}

// ---------- Nhãn 3 tab kiến thức: chấm hồng khi có nội dung ----------
function paintStudyTabs(i, q) {
    const flags = {
        answer: !!noteOf(i),
        my: !!getNote(q.question) || !!issueOf(i),
        who: room.members.some(m => answerOf(m, i)),
    };
    document.querySelectorAll('#quiz-live [data-study]').forEach(b => {
        const k = b.dataset.study;
        b.classList.toggle('active', studyTab === k);
        b.querySelector('.rm-dotmark-tab')?.remove();
        if (flags[k] && studyTab !== k) {
            const d = document.createElement('span');
            d.className = 'rm-dotmark-tab';
            b.appendChild(d);
        }
    });
}

// ---------- Đồng hồ bàn luận của cả nhóm ----------
export function tickTalk() {
    const chip = el('talk-chip');
    if (!chip) return;
    const until = talkUntil();
    const left = Math.round((until - Date.now()) / 1000);
    if (!until || left < 0) { chip.classList.add('hidden'); return; }
    chip.classList.remove('hidden');
    el('talk-left').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    chip.classList.toggle('urgent', left <= 10);
}

// ---------- Đồng hồ (chỉ chế độ cầm trịch) ----------
export function tickTimer() {
    const ring = el('timer-ring');
    const s = room.session;
    if (!ring) return;
    const i = currentIndex();
    if (!hasSession() || s.ended || isCoop() || !s.deadline || isAnnounced(i)) { ring.classList.add('hidden'); return; }
    const left = (s.deadline - Date.now()) / 1000;
    ring.classList.remove('hidden');
    ring.style.setProperty('--p', Math.max(0, Math.min(100, (left / (s.timerSec || 30)) * 100)));
    ring.querySelector('span').textContent = left > 0 ? Math.ceil(left) : '0';
    ring.classList.toggle('urgent', left <= 5 && left > 0);
    if (left <= 0 && !s.locked && canControl()) updateDoc(refs.session(), { locked: true }).catch(() => {});
}

// ---------- Sự kiện ----------
export function initStage() {
    el('options-area')?.addEventListener('click', (e) => {
        if (e.target.closest('[contenteditable]') || e.target.closest('[data-edit-opt-text]')) return;
        const btn = e.target.closest('[data-opt]');
        if (btn) submitAnswer(effectiveIndex(), Number(btn.dataset.opt));
    });

    // Điều hướng + gập khối (uỷ quyền trên cả vùng làm bài)
    el('quiz-live')?.addEventListener('click', (e) => {
        const nav = e.target.closest('[data-nav]');
        if (nav) {
            const d = nav.dataset.nav;
            if (d === 'focus') return followHost();
            if (d === 'prev' || d === 'next') return setViewIndex(effectiveIndex() + (d === 'next' ? 1 : -1));
        }
        if (e.target.closest('#question-pill')) {
            const map = el('question-map');
            const opening = map.classList.contains('hidden');
            if (opening) mapFilter = 'all';
            map.innerHTML = questionMapHtml(effectiveIndex());
            map.classList.toggle('hidden');
            if (opening) map.querySelector('.rm-mcell.now')?.scrollIntoView({ block: 'center' });
            return;
        }
        const mf = e.target.closest('[data-mapfilter]');
        if (mf) {
            mapFilter = mf.dataset.mapfilter;
            el('question-map').innerHTML = questionMapHtml(effectiveIndex());
            return;
        }
        if (e.target.closest('[data-mapjump]')) {
            el('question-map').classList.add('hidden');
            return jumpToUnanswered();
        }
        const jump = e.target.closest('[data-jump]');
        if (jump) {
            el('question-map').classList.add('hidden');
            return setViewIndex(Number(jump.dataset.jump));
        }
        const tab = e.target.closest('[data-study]');
        if (tab) {
            studyTab = tab.dataset.study;
            return renderQuiz();
        }
        if (e.target.closest('#left-chip')) return jumpToUnanswered();
        if (e.target.closest('[data-race-toggle]')) return toggleRace(true);
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#question-pill') && !e.target.closest('#question-map')) el('question-map')?.classList.add('hidden');
        if (!e.target.closest('[data-mark-toggle]') && !e.target.closest('#mark-menu')) el('mark-menu')?.classList.add('hidden');
    });

    el('self-bar')?.addEventListener('click', (e) => {
        const i = effectiveIndex();
        const me = myMember();
        if (e.target.closest('[data-guess]')) {
            const mine = myAnswer(i);
            if (mine) updateDoc(refs.member(), { [`answers.q${i}.guess`]: !mine.guess }).catch(() => {});
            return;
        }
        if (e.target.closest('[data-mark-toggle]')) return void el('mark-menu')?.classList.toggle('hidden');
        const mk = e.target.closest('[data-mark]');
        if (mk) {
            const reason = mk.dataset.mark;
            setMark(questionAt(i).question, reason);
            updateDoc(refs.member(), { [`marks.q${i}`]: reason === '__unmark' ? null : reason }).catch(() => {});
            el('mark-menu')?.classList.add('hidden');
            return renderQuiz();
        }
        if (e.target.closest('[data-flag]')) return void updateDoc(refs.member(), { [`flags.q${i}`]: !flagOf(me, i) }).catch(() => {});
        if (e.target.closest('[data-ready]')) return void updateDoc(refs.member(), { [`ready.q${i}`]: !readyOf(me, i) }).catch(() => {});
        if (e.target.closest('[data-unclear]')) return void updateDoc(refs.member(), { [`unclear.q${i}`]: !unclearOf(me, i) }).catch(() => {});
        if (e.target.closest('[data-dissent]')) return void updateDoc(refs.member(), { [`dissent.q${i}`]: !dissentOf(me, i) }).catch(() => {});
        if (e.target.closest('[data-explain-me]')) {
            const ex = explainerOf(i);
            const mineNow = ex?.uid === uid();
            return void updateDoc(refs.session(), {
                [`explainer.q${i}`]: mineNow ? null : { uid: uid(), name: me?.displayName || 'Ai đó' },
            }).catch(() => {});
        }
    });

    // Bình chọn độ khó (trong bảng phiếu, sau khi chốt)
    el('consensus-bar')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-diff]');
        if (!b) return;
        const i = effectiveIndex();
        const cur = diffOf(myMember(), i);
        updateDoc(refs.member(), { [`diff.q${i}`]: cur === b.dataset.diff ? null : b.dataset.diff }).catch(() => {});
    });

    // Dải viên kẹo: bấm là nhảy tới câu đó
    el('quiz-result')?.addEventListener('click', (e) => {
        if (e.target.closest('#result-allstats')) { toggleAllStats(); renderResults(); }
        if (e.target.closest('#result-notes-btn')) downloadMyNotes();
        if (e.target.closest('#result-review-btn')) window.dispatchEvent(new Event('room:save-review'));
    });

    el('q-track')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-jump]');
        if (b) setViewIndex(Number(b.dataset.jump));
    });

    // Lăn chuột dọc = cuộn dải câu ngang (đề dài mới cần)
    el('q-track')?.addEventListener('wheel', (e) => {
        const t = e.currentTarget;
        if (t.scrollWidth <= t.clientWidth || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
        e.preventDefault();
        t.scrollLeft += e.deltaY;
    }, { passive: false });

    try { raceOff = localStorage.getItem('roomRaceOff') === '1'; } catch (e) {}

    // --- Sửa tại chỗ: nhận nội dung từ room-editor rồi ghi lên Firestore ---
    const saveNote = (i, v) => updateDoc(refs.session(), {
        [`notes.q${i}`]: v,
        [`notesBy.q${i}`]: { name: myMember()?.displayName || 'Ai đó', at: Date.now() },
    }).catch(() => {});

    window.addEventListener('room:edit', (e) => {
        const { key, html } = e.detail || {};
        if (key === 'goal') return void updateDoc(refs.room(), { goal: html }).catch(() => {});
        const i = effectiveIndex();
        const q = questionAt(i);
        if (!q || !hasSession()) return;
        pingTyping(i);
        if (key === 'why') {
            if (!myAnswer(i)) return;
            return void updateDoc(refs.member(), { [`answers.q${i}.why`]: html }).catch(() => {});
        }
        if (key === 'explain') return void saveNote(i, html);
        if (key === 'note') return void setNote(q.question, html);
        if (key === 'issue') return void updateDoc(refs.session(), { [`issues.q${i}`]: html }).catch(() => {});
        if (key === 'question') return void updateDoc(refs.session(), { [`edits.q${i}.question`]: html }).catch(() => {});
        if (key.startsWith('optexp:')) {
            const k = key.split(':')[1];
            return void updateDoc(refs.session(), { [`optNotes.q${i}.o${k}`]: html }).catch(() => {});
        }
        if (key.startsWith('opttext:')) {
            const k = Number(key.split(':')[1]);
            const list = stripOptionLabels(optsOf(q)).slice();
            list[k] = html;
            return void updateDoc(refs.session(), { [`edits.q${i}.options`]: list }).catch(() => {});
        }
    });

    // Bút chì trên phương án -> biến chữ của phương án đó thành ô gõ
    el('options-area')?.addEventListener('click', (e) => {
        const pen = e.target.closest('[data-edit-opt-text]');
        if (pen) {
            e.stopPropagation();
            editingOpt = Number(pen.dataset.editOptText);
            return renderQuiz();
        }
    }, true);
    document.addEventListener('focusout', (e) => {
        if (e.target.closest?.('[data-live-edit^="opttext:"]')) {
            editingOpt = null;
            setTimeout(renderQuiz, 250);
        }
    });

    const blockClicks = (e) => {
        const i = effectiveIndex();
        const q = questionAt(i);
        if (!q) return;
        if (e.target.closest('[data-usefileexp]')) return void saveNote(i, q.explanation || q.explain || '');
        if (e.target.closest('[data-reset-edit]')) return void updateDoc(refs.session(), { [`edits.q${i}`]: null }).catch(() => {});
    };
    el('answer-block')?.addEventListener('click', blockClicks);
    el('my-block')?.addEventListener('click', blockClicks);
    el('race')?.addEventListener('click', (e) => {
        const av = e.target.closest('[title]');
        if (av && !e.target.closest('[data-race-toggle]')) window.dispatchEvent(new CustomEvent('room:panel', { detail: 'members' }));
    });

    // Một vòng duy nhất, tự co giãn: 250ms khi đang có đồng hồ chạy, 1s lúc bình
    // thường, 2s khi tab bị ẩn — thay cho 2 setInterval chạy suốt cả buổi.
    (function tickLoop() {
        tickTimer();
        tickTalk();
        const s = room.session;
        const dangChay = !!(s && !s.ended && ((!isCoop() && s.deadline) || talkUntil() > Date.now()));
        setTimeout(tickLoop, document.hidden ? 2000 : dangChay ? 250 : 1000);
    })();
}
