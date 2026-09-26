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
    isEssay, doneOf, doneCount, isAccepted, isSplit, acceptedText, acceptedOf, argsOf,
    caseKeyAt, caseEditAt, caseByAt,
} from './room-state.js';
import { showToast, showConfirm } from '../../core/utils.js';
import { escapeHtml, shortName, toggle, avatarStack, avatarHtml, forget } from './room-ui.js';
import { renderRankPanel, renderResults, questionStats, toggleAllStats } from './room-scoreboard.js';
import { MARK_REASONS, getNote, setNote, getMark, setMark } from './room-study.js';
import { renderRich, currentEditKey, renderRichMath, sanitizeHtml, isBlank } from './room-editor.js';
import { chatCountFor, openDiscussion, questionMsgs } from './room-chat.js';
import { beep, haptic, jumpToUnanswered, autoNextOn, ensureConfetti } from './room-boost.js';
import { renderGameBar, downloadMyNotes } from './room-game.js';
import { renderAnswerHub, initAnswerHub, renderOptionTalk, unreadQs, openAsksOf, renderNotebook, focusHub } from './room-answer.js';

let viewIndex = null;            // câu MÌNH đang xem
let lastFocus = null;
let lastAnnounceKey = '';
let mapFilter = 'all';           // bộ lọc của bản đồ câu
let raceOff = false;             // ẩn đường đua (nhớ theo máy)
const popped = new Set();        // câu nào đã bắn hiệu ứng điểm rồi
const annSeen = new Map();       // câu -> đã chốt chưa ở lần vẽ trước: "vừa chốt" thì đóng dấu ĐÚNG/SAI một lần (bản 32)
const pickSeen = new Map();      // câu -> ô mình chọn ở lần vẽ trước: VỪA chọn thì ô nảy + dán băng keo một lần (bản 34)
let pickFx = null;               // { i, k, until }: giữ hiệu ứng qua lần vẽ lại khi máy chủ xác nhận (tới gần như tức thì)
const voteSeen = new Map();      // `${câu}:${ô}` -> [số phiếu, %] lần vẽ trước: thanh % chạy tiếp từ chỗ cũ, ô có phiếu mới nảy lên
let saveTimers = {};
let lastTypingPing = 0;
let editingOpt = null;      // đang sửa chữ của phương án thứ mấy
let lastScreen = '';        // sảnh chờ / làm bài / tổng kết — để bật hoạt ảnh vào màn
let lastRenderIndex = null; // câu vừa vẽ, dùng để biết trượt sang trái hay phải
let restoredIndex = false;  // đã khôi phục câu đang xem lần vào trước chưa
let firstLive = true;       // lần vẽ đầu: câu đã chốt sẵn thì đừng bắn pháo/âm thanh
let talkNew = new Set();    // câu có bàn luận mới chưa đọc (room-answer.js · unreadQs)

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
/** Vẽ lại ô đáp án ngay (vd. vừa rời ô gõ trong khay — số phiếu có thể đã đổi trong lúc gõ). */
export function repaintOptions() { delete sigs.live; delete sigs.opts; renderLive(); }

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
/** extra.by = { id, n }: đổi phiếu nhờ một lập luận / lý do (nút 🔄 Theo trong khay bàn luận). */
export const answerCurrent = (idx, extra) => submitAnswer(effectiveIndex(), idx, extra);

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
export const canAnswer = (i) => hasSession() && !room.session.ended && !isAnnounced(i) && (isCoop() || !room.session.locked);

async function submitAnswer(i, idx, extra = {}) {
    if (!canAnswer(i) || isEssay(questionAt(i))) return;
    const cur = myAnswer(i);
    if (cur?.i === idx) return;
    // Đổi ý: giữ dấu vết "từ ý nào sang" (bàn tròn hiện "đổi từ B") — ai thuyết phục được ai.
    // Lý do cũ viết cho ý cũ nên không mang sang.
    const moved = typeof cur?.i === 'number' ? { from: cur.i, n: (cur.n || 0) + 1 } : {};
    // Sơn ngay tại máy mình rồi mới gửi Firestore — không đợi mạng quay về nữa.
    optimistic['q' + i] = { i: idx, at: Date.now(), guess: !!cur?.guess, why: '', ...moved, ...extra };
    haptic(8);
    beep('tap');
    renderQuiz();
    await updateDoc(refs.member(), {
        [`answers.q${i}`]: { i: idx, at: Date.now(), guess: !!cur?.guess, ...moved, ...extra },
        cursor: i,
    }).catch(err => console.error('Lỗi gửi đáp án:', err));

    // Tự nhảy tới câu chưa chọn (chỉ khi bạn được tự đi câu và câu này chưa chốt).
    // Đổi phiếu từ khay bàn luận (🔄 Theo) thì đứng yên — đang đọc dở luồng.
    if (!extra.by && autoNextOn() && canRoam() && !isAnnounced(i) && i === effectiveIndex()) {
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
        // Đã bấm ✕ với ĐÚNG lời ghim này thì thôi; chủ trì ghim câu khác là hiện lại
        pin.classList.toggle('hidden', !s?.pinnedNote || s.pinnedNote === pinDismissed());
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

    // Câu khác có bàn luận mình chưa đọc -> chấm trên dải câu (tin chat câu khác cũng bắn room:chat tới đây)
    talkNew = unreadQs(i);

    // Không có gì liên quan đổi thì thôi, khỏi vẽ. (Nhịp tim / chat / reaction của
    // người khác vẫn bắn snapshot liên tục.)
    if (!changed('live', [
        i, editingOpt, raceOff, currentEditKey(), chatCountFor(i), [...talkNew],
        s.currentQuestionIndex, s.chosen, s.shown, s.notes, s.notesBy, s.optNotes, s.edits, s.issues,
        s.explainer, s.locked, s.mode, s.liveStats, s.freeRoam, s.qStarts, s.prevVote,
        s.teamOn, s.buzzOn, s.buzz, s.blind, s.spotlight, s.thanks,   // bộ tiện ích trò chơi
        s.alsoOk, s.split,                                            // kết luận nhiều đáp án / chưa thống nhất
        s.extra, s.extraBy,                                           // Mở rộng / Ghi nhớ nhóm sửa
        s.caseEdits, s.caseBy,                                        // ca lâm sàng nhóm sửa (chung cả chùm)
        s.quizTitle, s.hostId, s.hostName, s.cohosts, s.questions.length, s.ended,
        editorOf(i) ? Math.floor(Date.now() / 2000) : 0,
        Object.entries(optimistic).map(([k, v]) => k + ':' + v.i),
        room.members.map(m => [m.uid, m.displayName, m.emoji, m.online, m.answers, m.flags,
            m.marks, m.ready, m.unclear, m.dissent, m.diff, m.cursor, m.team,
            m.args, m.agree]),                                        // nhận xét trong khối đáp án
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
    // Tên đề nằm ở huy hiệu đầu trang (#session-badge-text); dòng phụ ngay dưới nó
    el('quiz-session-host').textContent =
        (isCoop() ? 'Cùng làm' : 'Chủ trì cầm trịch') +
        ` · chủ trì: ${canControl() ? 'bạn' : (s.hostName || 'ẩn danh')}`;
    // Đang xem câu khác câu cả nhóm bàn -> chip bấm một phát là về
    const fc = el('focus-chip');
    if (fc) {
        fc.classList.toggle('hidden', i === currentIndex());
        el('focus-text').innerHTML = `<span class="rm-hide-sm">Nhóm ở </span>câu ${currentIndex() + 1}`;
    }

    const essay = isEssay(q);
    const chip = el('phase-chip');
    if (chip) {
        const split = isSplit(i);
        chip.className = 'rm-state' + (announced ? ' is-locked' : split ? ' is-split' : shown ? ' is-shown' : '');
        chip.textContent = essay
            ? (shown ? 'Tự luận · đã hiện bài giải' : doneOf(null, i) ? 'Tự luận · đang viết chung' : 'Tự luận · chưa có bài')
            : announced ? `Đã chốt ${acceptedText(i)}`
            : split ? 'Chưa thống nhất'
            : shown ? 'Đã hiện đáp án'
            : (!isCoop() && s.locked) ? 'Đã khóa nộp' : 'Chưa chốt';
    }
    const lc = el('left-chip');
    if (lc) {
        const meNow = myMember();
        let left = 0;
        for (let k = 0; k < total; k++) if (!doneOf(meNow, k) && !optimistic['q' + k]) left++;
        lc.classList.remove('hidden');
        lc.classList.toggle('is-done', left === 0);
        // điện thoại chỉ còn "Còn N" cho dải câu cùng hàng khỏi xuống dòng
        el('left-text').innerHTML = left ? `Còn ${left}<span class="rm-hide-sm"> câu</span>` : 'Xong hết';
        // Vạch tiến độ dưới chân viên "Câu x/y" (HUD + dock điện thoại): mình làm được bao nhiêu phần đề
        const done = ((total - left) / total).toFixed(3);
        [el('question-pill'), document.querySelector('.rm-dock-count')].forEach(n => {
            if (!n) return;
            n.style.setProperty('--done', done);
            n.classList.toggle('is-full', left === 0);
        });
    }

    el('q-track').innerHTML = questionTrackHtml(i);
    renderRace();
    renderExplainer(i);

    const map = el('question-map');
    if (map && !map.classList.contains('hidden')) map.innerHTML = questionMapHtml(i);

    // --- Dòng thông tin câu ---
    // Trước đây tất cả nối bằng dấu `·` thành một dải chữ xám dài 3 dòng: đường dẫn nguồn
    // (thứ ít cần nhất) nuốt mất mấy chip thật sự đáng liếc (có người muốn bàn, đề bị báo lỗi).
    // Nay tách 2 tầng: chip có nghĩa ở trên, nguồn thu về 1 dòng mờ bấm mới xổ.
    const meta = el('q-meta');
    const chips = [];
    const addChip = (cls, html) => chips.push(`<span class="rm-qchip${cls ? ' ' + cls : ''}">${html}</span>`);
    const marked = room.members.filter(m => m.marks?.['q' + i]).length;
    const flagged = room.members.filter(m => flagOf(m, i)).length;
    if (flagged) addChip('is-warn', `🗣 ${flagged} người muốn bàn`);
    if (issueOf(i)) addChip('is-warn', `⚠ ${escapeHtml(issueOf(i))}`);
    if (editOf(i)) addChip('is-edit', '✏ nhóm đã sửa');
    if (marked) addChip('', `🔖 ${marked} người đánh dấu`);
    if (q.topic && String(q.topic).trim().toLowerCase() !== 'chung') addChip('', escapeHtml(q.topic));
    if (q.level) addChip('', escapeHtml(q.level));
    if (q.expanded) addChip('is-info', '📖 mở rộng');
    if (q.note) addChip('is-info', '📌 ghi nhớ');
    let metaHtml = chips.length ? `<span class="rm-qchips">${chips.join('')}</span>` : '';
    if (q.source) {
        const full = String(q.source).trim();
        // Chỉ hiện NHÁNH CUỐI (phần cụ thể nhất); cắt theo `›`/`>` thôi — đừng cắt theo `/`
        // kẻo "Xử trí dịch/máu" bị xén mất một nửa.
        const leaf = full.split(/\s*[›>]\s*/).filter(Boolean).pop() || full;
        metaHtml += `<button type="button" class="rm-qsrc" data-qsrc title="${escapeHtml(full)}">`
            + `<i class="fas fa-book-open"></i>`
            + `<span class="rm-qsrc-short">${escapeHtml(leaf)}</span>`
            + `<span class="rm-qsrc-full">${escapeHtml(full)}</span></button>`;
    }
    meta.innerHTML = metaHtml;
    meta.classList.toggle('hidden', !metaHtml);

    renderCase(i, q);

    // --- Câu hỏi: bấm vào là sửa được ngay, cả nhóm thấy liền ---
    // Tem kẹo "Câu N" dán ở góc thẻ đề (bản 29) — CSS vẽ từ data-qno
    const qcard = document.querySelector('.rm-question');
    if (qcard) qcard.dataset.qno = `Câu ${i + 1}${essay ? ' · tự luận' : ''}`;
    const qt = el('question-text');
    qt.setAttribute('contenteditable', 'true');
    qt.dataset.liveEdit = 'question';
    qt.dataset.placeholder = 'Nhập nội dung câu hỏi…';
    qt.title = 'Bấm để sửa câu hỏi — bôi đen để in đậm/nghiêng';
    if (currentEditKey() !== 'question') {
        qt.innerHTML = renderRich(q.question || '');
        renderMath(qt);
    }
    // Đề dài (ca lâm sàng nhiều dữ kiện) thì tự thu chữ lại theo bậc, kẻo riêng câu hỏi
    // đã chiếm hết màn và phương án bị đẩy xuống dưới. Cỡ chữ thật nằm ở CSS `[data-len]`.
    const qLen = (qt.textContent || '').trim().length;
    qt.dataset.len = qLen > 340 ? 'xl' : qLen > 200 ? 'lg' : qLen > 110 ? 'md' : 'sm';

    // Câu tự luận: không có phương án / bảng phiếu — bài làm chung nằm ngay ô chung của khối đáp án
    el('options-area').classList.toggle('hidden', essay);
    el('consensus-bar')?.classList.toggle('hidden', essay);
    if (essay) { el('options-area').innerHTML = ''; delete sigs.opts; }
    else {
        renderOptions(i, q, opts, mine, chosen, announced, shown, refIdx, stats, showStats);
        renderOptionTalk(i);                 // khay dưới từng ô: tự chặn khi không có gì đổi
        renderConsensus(i, stats, mine, chosen, announced);
    }
    renderGameBar(i);
    renderSelfBar(i, mine, q);
    renderAnswerHub(i);
    renderNotebook(i);                       // sổ tay: giải thích · mở rộng · ghi nhớ (cột phải khi màn rộng)
    renderMyBlock(i, q, opts);
    tickTalk();

    if (firstLive) maybeLateJoin();

    const key = `${i}:${acceptedText(i)}`;
    if (announced && mine && lastAnnounceKey !== key && !popped.has(key)) {
        lastAnnounceKey = key;
        if (firstLive) {
            // vừa vào phòng, câu này đã chốt từ trước -> im lặng
        } else if (isAccepted(i, mine.i)) {
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

// ---------- Vào giữa buổi: nói rõ nhóm đang ở đâu + 2 lối tắt ----------
// Chỉ hiện 1 lần cho mỗi phiên (localStorage), và chỉ khi mình chưa làm câu nào mà nhóm đã đi xa.
function maybeLateJoin() {
    const s = room.session;
    const answered = doneCount(myMember());
    const chosenN = s.questions.filter((_, k) => chosenOf(k) !== null).length;
    const cur = currentIndex();
    if (answered || (!chosenN && cur === 0) || s.ended) return;
    const key = `roomLate_${room.roomId}_${s.startedAtMs || 0}`;
    try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch (e) { /* vẫn hiện */ }
    const firstOpen = s.questions.findIndex((_, k) => chosenOf(k) === null);
    const box = document.createElement('div');
    box.className = 'rm-late';
    box.innerHTML = `<span class="rm-late-ic">👋</span>
        <div class="min-w-0 flex-1"><b>Bạn vào giữa buổi</b>
            <span>Nhóm đã chốt ${chosenN}/${s.questions.length} câu và đang bàn câu ${cur + 1}.</span></div>
        <button type="button" class="rm-cta rm-solid-btn" data-late="focus"><i class="fas fa-location-arrow"></i>Tới câu ${cur + 1}</button>
        ${firstOpen >= 0 && firstOpen !== cur ? `<button type="button" class="rm-ghost-btn" data-late="open">Câu chưa chốt đầu tiên (${firstOpen + 1})</button>` : ''}
        <button type="button" class="rm-icon-btn" data-late="x" title="Đóng"><i class="fas fa-times"></i></button>`;
    box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-late]');
        if (!b) return;
        if (b.dataset.late === 'focus') followHost();
        if (b.dataset.late === 'open') setViewIndex(firstOpen);
        box.remove();
    });
    document.querySelector('#quiz-live .rm-topbar')?.after(box);
}

// Trạng thái một câu, dùng chung cho dải câu và bản đồ câu
function qStateOf(k) {
    const a = myAnswer(k);
    const c = chosenOf(k);
    const done = !!optimistic['q' + k] || doneOf(myMember(), k);
    if (done && c !== null) return isAccepted(k, a.i) ? 'good' : 'bad';
    if (done) return 'done';
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
    area.classList.remove('is-essay');
    // Chưa chọn thì có dòng gợi ý "👇 Chạm để chọn" (CSS ::before) — chọn rồi / đã khoá thì thôi
    area.classList.toggle('need-pick', !mine && canAnswer(i));
    // Phương án ngắn thì xếp 2 cột cho đỡ dài; phương án dài luôn 1 cột cho dễ đọc
    area.classList.toggle('is-short', opts.every(o => String(o).replace(/<[^>]*>/g, '').trim().length <= 46));
    const ek = currentEditKey() || '';
    // Đang gõ (chữ phương án · giải thích · lý do · ô nhận xét trong khay) thì đừng vẽ lại, kẻo mất con trỏ.
    // Rời ô là khay tự gọi repaintOptions().
    if (ek.startsWith('opttext:') || ek.startsWith('optexp:') || ek === 'why') return;
    if (area.contains(document.activeElement) && document.activeElement.matches?.('input, textarea')) return;
    const voters = (k) => room.members.filter(m => answerOf(m, i)?.i === k);
    const topN = Math.max(0, ...stats.counts);      // ý đang dẫn đầu, để đánh dấu ngay trên ô
    const soloLead = topN > 0 && stats.counts.filter(n => n === topN).length === 1;
    // Vẽ lại phương án là phần tốn nhất (innerHTML + KaTeX) -> chỉ vẽ khi thật sự đổi
    if (!changed('opts', [
        i, opts, mine, chosen, announced, shown, refIdx, editingOpt, canAnswer(i), ek,
        showStats ? [stats, room.members.map(m => [m.uid, m.displayName, m.emoji, answerOf(m, i)?.i])] : 0,
        optimistic['q' + i] ? optimistic['q' + i].i : null,
        room.session?.optNotes?.['q' + i], q.optionExplanations, room.session?.alsoOk?.['q' + i],
    ])) return;
    // Đang xem mà câu VỪA chốt (lần vẽ trước chưa chốt) -> ô đúng / ô mình sai đóng dấu một lần
    const justAnn = announced && annSeen.get(i) === false;
    annSeen.set(i, announced);
    const myPick = typeof mine?.i === 'number' ? mine.i : null;
    if (myPick !== null && pickSeen.has(i) && pickSeen.get(i) !== myPick) pickFx = { i, k: myPick, until: Date.now() + 700 };
    pickSeen.set(i, myPick);
    const justPick = !!pickFx && pickFx.i === i && pickFx.k === myPick && Date.now() < pickFx.until;
    area.innerHTML = opts.map((opt, idx) => {
        const picked = mine?.i === idx;
        const isCorrect = announced && isAccepted(i, idx);
        const isWrong = announced && picked && !isAccepted(i, idx);
        const isRef = shown && !announced && refIdx === idx;
        const pct = stats.total ? Math.round(100 * stats.counts[idx] / stats.total) : 0;
        // Phiếu sống: thanh % chạy tiếp từ mức cũ (không nhảy cóc), ô vừa có thêm người chọn thì số nảy lên
        const vk = i + ':' + idx;
        const [was, wasPct] = voteSeen.get(vk) || [null, 0];
        if (showStats) voteSeen.set(vk, [stats.counts[idx], pct]);
        const bump = showStats && was !== null && stats.counts[idx] > was;
        const cls = ['rm-option'];
        if (isCorrect) cls.push('correct');
        else if (isWrong) cls.push('wrong');
        else if (picked) cls.push('picked');
        if (isRef) cls.push('shown-ref');
        if (!canAnswer(i)) cls.push('rm-locked');
        if (editingOpt === idx) cls.push('is-editing');
        if (optimistic['q' + i] && optimistic['q' + i].i === idx) cls.push('is-sending');
        const names = showStats ? voters(idx) : [];
        const textHtml = editingOpt === idx
            ? `<span class="rm-md" contenteditable="true" data-live-edit="opttext:${idx}" data-placeholder="Nội dung phương án ${L(idx)}…">${renderRich(opt)}</span>`
            : renderRich(opt);
        // Số phiếu + mặt người chọn dồn về MỘT cột bên phải (trước đây avatar chiếm
        // riêng một dòng dưới chữ -> mỗi ô cao thêm ~30px, điện thoại chỉ thấy 2-3 ô).
        // 0 phiếu thì khỏi ghi "0 · 0%" — 4 ô cùng lặp số 0 chỉ làm rối mắt
        const side = showStats && stats.counts[idx]
            ? `<span class="rm-oside">
                <span class="rm-pct ${soloLead && stats.counts[idx] === topN && !announced ? 'is-lead' : ''} ${bump ? 'is-bump' : ''}"
                      title="${stats.counts[idx]}/${stats.total} người trong phòng chọn ý này">${stats.counts[idx]} · ${pct}%</span>
                ${names.length ? `<span class="rm-voters">${avatarStack(names, 3)}</span>` : ''}
               </span>`
            : '';
        // Thẻ = ô chọn + KHAY gắn ngay dưới (giải thích · lý do · ai chọn gì · nhận xét, do
        // room-answer.js · renderOptionTalk đổ vào). Khay nằm NGOÀI <button> vì có ô gõ bên trong.
        const card = ['rm-ocard', 'o' + (idx % 4)];
        if (isCorrect) card.push('is-correct'); else if (isWrong) card.push('is-wrong'); else if (picked) card.push('is-picked');
        // Đã chốt: ô không đúng mà mình cũng không chọn -> mờ đi, mắt dồn vào ô xanh (đúng) / đỏ (mình sai)
        if (announced && !isCorrect && !isWrong) card.push('is-dim');
        if (picked) card.push('is-mine');          // ô mình chọn (kể cả khi đã thành xanh / đỏ) -> dấu ✓ / ✗ ở chữ cái
        if (justAnn && (isCorrect || isWrong)) card.push('is-stamp');
        if (justPick && picked) card.push('is-justpicked');
        return `<div class="${card.join(' ')}" data-card="${idx}"><button type="button" data-opt="${idx}" class="${cls.join(' ')}" title="${canAnswer(i) ? `Chọn ${L(idx)} (phím ${L(idx)})` : ''}">
            ${showStats ? `<span class="rm-fill ${wasPct !== pct ? 'is-grow' : ''}" style="--p:${pct / 100};--from:${wasPct / 100}"></span>` : ''}
            <span class="rm-opt-edit" data-edit-opt-text="${idx}" title="Sửa nội dung phương án ${L(idx)}"><i class="fas fa-pen"></i></span>
            <span class="rm-letter">${L(idx)}</span>
            <span class="rm-otext">
                ${textHtml}
                ${isRef ? '<span class="rm-chip warn">đáp án trong file</span>' : ''}
                ${isCorrect ? `<span class="rm-chip ok rm-verdict">${picked ? '✓ Bạn chọn đúng' : '✓ Đáp án đúng'}</span>` : ''}
                ${isWrong ? '<span class="rm-chip bad rm-verdict">✗ Bạn chọn sai</span>' : ''}
            </span>
            ${side}
        </button><div class="rm-odisc hidden" data-odisc="${idx}"></div></div>`;
    }).join('');
    renderMath(area);
    renderOptionTalk(i, true);
    if (editingOpt !== null) {
        const node = area.querySelector(`[data-live-edit="opttext:${editingOpt}"]`);
        if (node) { node.focus(); document.getSelection()?.selectAllChildren(node); }
    }
}

// ---------- Ca lâm sàng: MỘT phiếu dùng chung cho cả chùm, sửa tại chỗ như đề ----------
// Khung chỉ dựng lại khi SANG CA KHÁC; đi giữa các câu cùng ca chỉ đổi chấm/nhãn -> giữ nguyên
// trạng thái gập, con trỏ, chỗ bôi đen. Ruột chữ không bị vẽ đè lúc chính mình đang gõ.
// Sửa ca = sửa cho MỌI câu trong chùm (session.caseEdits theo khóa ca — room-state.js).
const caseFold = new Map();                    // khóa ca -> true khi mình gập (nhớ khi đi qua lại)
const caseShown = { text: null, title: null }; // bản đang hiện, để khỏi vẽ lại khi không đổi
const plainOf = (h) => String(h || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

function caseRange(i) {
    const k = caseKeyAt(i);
    const n = room.session?.questions?.length || 0;
    let a = i, b = i;
    while (a > 0 && caseKeyAt(a - 1) === k) a--;
    while (b < n - 1 && caseKeyAt(b + 1) === k) b++;
    return [a, b];
}

function renderCase(i, q) {
    const box = el('case-box');
    if (!box) return;
    const text = q.caseText || q.case || '';
    const ck = caseKeyAt(i);
    box.classList.toggle('hidden', !text);
    if (!text) { box.dataset.ck = ''; return; }
    if (box.dataset.ck !== ck) {
        box.dataset.ck = ck;
        caseShown.text = caseShown.title = null;
        box.innerHTML = `<div class="rm-case-head">
            <span class="rm-case-ic" aria-hidden="true"><i class="fas fa-notes-medical"></i></span>
            <b class="rm-case-title" contenteditable="true" spellcheck="false" data-live-edit="casetitle" title="Bấm để đổi tên ca"></b>
            <span class="rm-case-dots"></span>
            <span class="rm-case-by"></span>
            <button type="button" class="rm-case-btn" data-case-reset title="Trả ca về bản gốc trong file"><i class="fas fa-rotate-left"></i></button>
            <button type="button" class="rm-case-btn" data-case-fold aria-expanded="true" title="Gập / mở ca"><i class="fas fa-chevron-up"></i></button>
        </div>
        <button type="button" class="rm-case-peek" data-case-fold title="Mở lại ca"></button>
        <div class="rm-case-body rm-md" contenteditable="true" data-live-edit="case" data-placeholder="Nội dung ca lâm sàng…"
             title="Bấm để sửa ca — cả nhóm thấy ngay, đổi cho mọi câu trong chùm"></div>`;
    }
    const body = box.querySelector('[data-live-edit="case"]');
    if (currentEditKey() !== 'case' && caseShown.text !== text) {
        caseShown.text = text;
        body.innerHTML = renderRich(text);
        renderMath(body);
    }
    const title = plainOf(q.caseTitle) || 'Ca lâm sàng';
    if (currentEditKey() !== 'casetitle' && caseShown.title !== title) {
        caseShown.title = title;
        box.querySelector('[data-live-edit="casetitle"]').textContent = title;
    }
    // Chấm các câu dùng chung ca: bấm là nhảy, tô câu đang xem / câu mình đã làm
    const [a, b] = caseRange(i);
    const me = myMember();
    box.querySelector('.rm-case-dots').innerHTML = b > a
        ? `<span class="rm-case-seq">câu ${i - a + 1}/${b - a + 1}</span>` + Array.from({ length: b - a + 1 }, (_, d) => a + d).map(k =>
            `<button type="button" class="rm-case-dot${k === i ? ' is-now' : ''}${doneOf(me, k) ? ' is-done' : ''}" data-case-jump="${k}" title="Câu ${k + 1}${k === i ? ' · đang xem' : doneOf(me, k) ? ' · đã làm' : ''}">${k + 1}</button>`).join('')
        : '';
    const edited = !!caseEditAt(i);
    const by = caseByAt(i);
    box.querySelector('.rm-case-by').innerHTML = edited && by?.name ? `<i class="fas fa-pen"></i>${escapeHtml(shortName(by.name))}` : '';
    box.querySelector('[data-case-reset]').hidden = !edited;
    const folded = !!caseFold.get(ck);
    box.classList.toggle('is-folded', folded);
    box.querySelector('.rm-case-head [data-case-fold]').setAttribute('aria-expanded', String(!folded));
    // tách theo thẻ (ô bảng không dính nhau) rồi bỏ khoảng trắng trước dấu câu (</b>, -> ",")
    box.querySelector('.rm-case-peek').textContent = folded ? plainOf(body.innerHTML).replace(/\s+([,.;:!?)])/g, '$1').slice(0, 200) : '';
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
        const st = qStateOf(k);
        const a = st !== 'todo' && st !== 'miss';
        const c = chosenOf(k);
        let cls = 'rm-pip';
        if (st !== 'todo') cls += ' ' + st;             // miss = nhóm chốt rồi mà mình chưa chọn
        if (isEssay(questionAt(k))) cls += ' essay';
        if (flagOf(me, k)) cls += ' flag';
        if (k === cur) cls += ' now';
        if (k === currentIndex()) cls += ' focus';
        // Câu chùm: gạch nối trên đầu các viên cùng ca -> nhìn dải là biết ca nào gồm những câu nào
        const ck = caseKeyAt(k);
        const inCase = !!ck && (caseKeyAt(k - 1) === ck || caseKeyAt(k + 1) === ck);
        if (inCase) cls += ' in-case' + (caseKeyAt(k - 1) !== ck ? ' case-a' : '') + (caseKeyAt(k + 1) !== ck ? ' case-z' : '');
        const fresh = talkNew.has(k);
        const tip = `Câu ${k + 1}` + (c !== null ? ' · nhóm đã chốt' : a ? ' · bạn đã chọn' : ' · chưa chọn')
            + (flagOf(me, k) ? ' · cần bàn' : '') + (fresh ? ' · có bàn luận mới' : '') + (inCase ? ' · câu chùm' : '');
        out += `<button class="${cls}" data-jump="${k}" title="${tip}" aria-label="${tip}">${k + 1}${fresh ? '<i class="rm-pip-new" aria-hidden="true"></i>' : ''}${inCase ? '<i class="rm-pip-case" aria-hidden="true"></i>' : ''}</button>`;
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
    const chip = el('race-chip');
    chip?.classList.toggle('hidden', raceOff);
    if (raceOff) return;
    const total = room.session?.questions?.length || 1;
    const done = (m) => doneCount(m);
    const runners = room.members.filter(m => m.online !== false).sort((a, b) => done(b) - done(a));
    if (!runners.length) { box.innerHTML = ''; return; }
    const best = done(runners[0]);
    const leader = best > 0 ? runners[0] : null;
    const meNow = myMember();
    // Chip trên thanh HUD: chỉ người dẫn đầu (tiến độ của MÌNH đã có ở chip "Còn N" + dải câu)
    if (chip) chip.innerHTML = leader
        ? `<span class="rm-rcrown-sm">👑</span><span class="rm-hide-sm">${escapeHtml(shortName(leader.displayName || 'Khách', 10))}</span> <b>${best}/${total}</b>`
        : `🏁 <span class="rm-hide-sm">Cả nhóm </span><b>0/${total}</b>`;

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
        <div class="rm-race-top" title="Bấm để xem / gập đường đua">
            <span class="rm-race-label">🏁 Cả nhóm tới đâu rồi</span>
            <span class="flex-1"></span>
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
        if (!isAccepted(k, a.i)) break;
        streak++;
    }
    const st = questionStats(i);
    const all = st.total >= 2 && st.correctCount === st.total;
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
    const asks = openAsksOf(i);        // thắc mắc ❓ chưa ai giải đáp — chủ trì nhìn là biết chốt được chưa
    const showWho = announced || isShown(i) || !!room.session?.liveStats;

    // Đáp án nhóm chốt có khớp đáp án trong file không (trước ở khối kết luận — đã bỏ vì lặp ô xanh + chip)
    const fileNote = () => {
        const ref = refIdxOf(questionAt(i));
        if (ref === null) return '';
        if (isSplit(i)) return ` · file ghi <b>${L(ref)}</b>`;
        return acceptedOf(i).includes(ref) ? ' · <span class="rm-vok">✓ khớp đáp án file</span>'
            : ` · <span class="rm-vwarn">file ghi <b>${L(ref)}</b> — nên kiểm lại nguồn</span>`;
    };

    // Số phiếu từng phương án nằm NGAY TRONG ô phương án (xem renderOptions),
    // ở đây chỉ còn thứ ô phương án không nói được: tóm tắt, trạng thái nhóm, huy hiệu, độ khó.

    // --- huy hiệu vui sau khi chốt ---
    const badges = [];
    if (announced) {
        const start = startOf(i);
        const winners = room.members.filter(m => isAccepted(i, answerOf(m, i)?.i));
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
            ${(() => {
                // Chỉ nói điều Ô ĐÁP ÁN chưa nói: "đang nghiêng về B 75%" thì ô B đã tô sẵn "3 · 75%",
                // "nhóm chốt B" thì chip trạng thái + ô xanh + kết luận đã nói -> bỏ, tránh lặp.
                const note = isBlind(i) ? '🙈 Đang giấu phiếu — chờ chủ trì lật bài'
                    : !answered ? ''
                    : announced ? `<b>${Math.round(100 * stats.correctCount / answered)}%</b> chọn trúng${fileNote()}`
                    : isSplit(i) ? `🤝 Nhóm <b>chưa thống nhất</b> — không tính điểm, mọi quan điểm được ghi nhận${fileNote()}`
                    : unanimous ? `Cả nhóm cùng chọn <b>${L(top)}</b>`
                    : tied.length > 1 ? `Đang hoà <b>${tied.map(L).join(' / ')}</b>` : '';
                return note ? `<span>·</span><span>${note}</span>` : '';
            })()}
            <div class="flex-1"></div>
            ${answered >= 2 && answered === totalMembers && !announced ? '<span class="rm-chip ok">🎉 Đủ cả nhóm</span>' : ''}
            ${ready ? `<span class="rm-chip ok"><i class="fas fa-check"></i>${ready} báo xong</span>` : ''}
            ${dissent.length ? `<span class="rm-chip warn" title="${escapeHtml(dissent.map(m => m.displayName || '').join(', '))}">✋ ${dissent.length} bảo lưu</span>` : ''}
            ${unclear.length ? `<span class="rm-chip warn" title="${escapeHtml(unclear.map(m => m.displayName || '').join(', '))}">🤔 ${unclear.length} chưa hiểu</span>` : ''}
            ${asks.length ? `<button type="button" class="rm-chip warn" data-open-ask title="Bấm để tới thắc mắc: ${escapeHtml(asks.map(a => a.member.displayName || 'Khách').join(', '))}">❓ ${asks.length} chưa giải đáp</button>` : ''}
            ${!mine && !announced ? '<span class="rm-chip warn">bạn chưa chọn</span>' : ''}
        </div>

        ${badges.length ? `<div class="rm-vote-badges">${badges.map(b => `<span class="rm-badge-chip">${b}</span>`).join('')}</div>` : ''}
        ${diffBar}`;
}

// ---------- "Việc của tôi": MỘT hàng chip ngay dưới phương án ----------
// Trước đây là thẻ 2 hàng có nhãn nằm ở cột phụ -> trên điện thoại bị giấu trong khay
// "Ghi chú", muốn bấm "Cần bàn" phải mở khay. Nay luôn thấy, và ô "Vì sao" chỉ bung
// khi bấm chip 💬 (hoặc khi đã có lý do).
function renderSelfBar(i, mine, q) {
    const bar = el('self-bar');
    const me = myMember();
    const mark = getMark(q.question);
    const r = mark ? MARK_REASONS[mark] : null;
    const announced = isAnnounced(i);
    const ex = explainerOf(i);
    const iExplain = ex?.uid === uid();
    // "Việc của bạn ở câu này" (bản 29): các bước có dấu ✓, bước kế tiếp nhấp nháy nhẹ, bấm là tới đúng chỗ.
    // Bước cuối (🏁 Báo xong) chính là nút "Xong" cũ (giữ data-ready).
    const hasText = (v) => !!String(v || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() || /<img/i.test(String(v || ''));
    const talked = argsOf(i).some(a => a.uid === uid()) || questionMsgs(i).some(m => m.uid === uid());
    const essay = isEssay(q);
    const steps = essay
        ? [['write', '✍️', 'Viết bài chung', doneOf(me, i)], ['talk', '💬', 'Nhận xét', talked], ['ready', '🏁', 'Báo xong', readyOf(me, i)]]
        : [['pick', '👆', 'Chọn đáp án', !!mine, !mine && !canAnswer(i)], ['why', '💭', 'Ghi lý do', hasText(mine?.why || whyOf(me, i))],
            ['talk', '💬', 'Góp ý', talked], ['ready', '🏁', 'Báo xong', readyOf(me, i)]];
    const next = steps.findIndex(s => !s[3] && !s[4]);
    const TIP = { pick: 'Chạm một ô A/B/C/D (hoặc phím A–D)', why: 'Viết vì sao bạn chọn — có thể dán ảnh (phím R)', write: 'Gõ vào bài làm chung (phím W)',
        talk: 'Góp ý / hỏi / trả lời trong luồng bàn luận (phím D)', ready: 'Báo cho chủ trì là bạn xong câu này' };
    bar.innerHTML = `
        <ol class="rm-steps4" aria-label="Việc của bạn ở câu này">${steps.map(([k, ic, lb, done, skip], n) => `<li>
            <button type="button" class="rm-step4 ${done ? 'is-done' : ''} ${skip ? 'is-skip' : ''} ${n === next ? 'is-next' : ''}"
                data-step="${k}" ${k === 'ready' ? 'data-ready' : ''} title="${TIP[k]}${skip ? ' — câu đã khoá' : ''}">
                <b>${done ? '✓' : skip ? '–' : n + 1}</b><span>${ic} ${k === 'ready' && done ? 'Đã báo xong' : lb}</span>
            </button></li>`).join('')}</ol>
        <div class="rm-selfchips">
            <button data-flag class="rm-mini ${flagOf(me, i) ? 'is-flag' : ''}" title="Báo cho cả nhóm: câu này cần bàn thêm">🗣 Cần bàn</button>
            ${announced ? `<button data-unclear class="rm-mini ${unclearOf(me, i) ? 'is-flag' : ''}" title="Chốt rồi mà vẫn chưa hiểu">🤔 Chưa hiểu</button>` : ''}
            <button data-explain-me class="rm-mini ${iExplain ? 'is-on' : ''}" title="Nhận giảng câu này cho cả nhóm">
                🎙 ${iExplain ? 'Mình giảng' : ex ? `${escapeHtml(shortName(ex.name || 'Ai đó', 8))} giảng` : 'Giảng'}
            </button>
            <div class="relative">
                <button data-mark-toggle class="rm-mini ${r ? 'is-on' : ''}" title="Đánh dấu để ôn lại"><i class="fas ${r ? r.icon : 'fa-bookmark'}"></i>${r ? r.short : 'Đánh dấu'}</button>
                <div id="mark-menu" class="rm-menu hidden">
                    ${Object.entries(MARK_REASONS).map(([k, m]) => `
                        <button data-mark="${k}" class="rm-menu-item ${mark === k ? 'is-active' : ''}">
                            <span class="rm-menu-ic" style="background:${m.bg};color:${m.color}"><i class="fas ${m.icon}"></i></span>${m.label}</button>`).join('')}
                    ${mark ? '<button data-mark="__unmark" class="rm-menu-item"><span class="rm-menu-ic" style="background:#fee2e2;color:#ef4444"><i class="fas fa-flag-checkered"></i></span>Bỏ đánh dấu</button>' : ''}
                </div>
            </div>
        </div>`;
}

// Ô trống thì hiện chữ gợi ý mờ
function markEmpty(root) {
    root.querySelectorAll('[data-live-edit]').forEach(n => {
        n.dataset.empty = isBlank(n) ? '1' : '0';
    });
}

// ---------- Khối "Ghi chú của tôi & sửa đề" ----------
function renderMyBlock(i, q, opts) {
    const box = el('my-block');
    const ek = currentEditKey() || '';
    if (box.dataset.qi === String(i) && (ek === 'note' || ek === 'issue')) return;
    box.dataset.qi = String(i);
    const edited = editOf(i);
    const note = getNote(q.question);
    if (!changed('my', [i, ek, note, getMark(q.question), issueOf(i), edited, opts])) return;
    const issue = issueOf(i);
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
                 data-placeholder="Ghi lại điều cần nhớ ở câu này… (Ctrl+V dán ảnh)">${renderRich(note)}</div>

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
// Lời ghim đã ẩn (theo phòng, chỉ trong phiên trình duyệt này)
const pinKey = () => 'roomPinX_' + room.roomId;
const pinDismissed = () => { try { return sessionStorage.getItem(pinKey()) || ''; } catch (e) { return ''; } };

export function initStage() {
    initAnswerHub();
    el('pinned-note-x')?.addEventListener('click', () => {
        try { sessionStorage.setItem(pinKey(), room.session?.pinnedNote || ''); } catch (e) {}
        el('pinned-note')?.classList.add('hidden');
    });
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
        if (e.target.closest('#left-chip')) return jumpToUnanswered();
        if (e.target.closest('[data-race-toggle]')) return toggleRace(true);
        const src = e.target.closest('[data-qsrc]');
        if (src) return void src.classList.toggle('is-open');
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#question-pill') && !e.target.closest('#question-map')) el('question-map')?.classList.add('hidden');
        if (!e.target.closest('[data-mark-toggle]') && !e.target.closest('#mark-menu')) el('mark-menu')?.classList.add('hidden');
    });

    const bar = el('self-bar');
    bar?.addEventListener('click', (e) => {
        const i = effectiveIndex();
        const me = myMember();
        if (e.target.closest('[data-mark-toggle]')) return void el('mark-menu')?.classList.toggle('hidden');
        // Các bước "việc của bạn" (bước 🏁 có data-ready -> rơi xuống nhánh báo xong bên dưới)
        const step = e.target.closest('[data-step]')?.dataset.step;
        const go = (node) => { node?.scrollIntoView({ block: 'center', behavior: 'smooth' }); node?.focus?.({ preventScroll: true }); };
        if (step === 'pick') return void el('options-area')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        if (step === 'why') {
            const w = document.querySelector('#options-area [data-live-edit="why"]');
            if (!w) { showToast('Chọn một đáp án trước đã nhé 👆', 'info', 1600); return void el('options-area')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
            return void go(w);
        }
        if (step === 'write') return void go(document.querySelector('#answer-block [data-live-edit="explain"]'));
        if (step === 'talk') return void focusHub();
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

    // Nội dung ĐANG LƯU của một ô sửa ở câu i — để nối ảnh vào cuối khi ô đó không còn trên màn
    const storedOf = (key, i) => {
        const q = questionAt(i);
        if (key === 'goal') return room.roomDoc?.goal || '';
        if (key === 'explain') return noteOf(i);
        if (key === 'note') return q ? getNote(q.question) : '';
        if (key === 'issue') return issueOf(i);
        if (key === 'why') return whyOf(myMember(), i);
        if (key.startsWith('extra:')) return q?.[key.slice(6)] || '';
        if (key === 'question') return q?.question || '';
        if (key === 'case') return q?.caseText || q?.case || '';
        if (key.startsWith('optexp:')) return optNoteOf(i, Number(key.split(':')[1]));
        return null;                                   // chữ phương án: không nối ảnh kiểu này
    };

    window.addEventListener('room:edit', (e) => {
        let { key, html, qi, appendHtml } = e.detail || {};
        const i = typeof qi === 'number' ? qi : effectiveIndex();
        if (appendHtml) {
            const cur = storedOf(key, i);
            if (cur === null) return;
            html = sanitizeHtml((cur ? renderRich(cur) : '') + appendHtml);
        }
        if (key === 'goal') return void updateDoc(refs.room(), { goal: html }).catch(() => {});
        const q = questionAt(i);
        if (!q || !hasSession()) return;
        pingTyping(i);
        if (key === 'why') {
            if (!myAnswer(i)) return;
            return void updateDoc(refs.member(), { [`answers.q${i}.why`]: html }).catch(() => {});
        }
        if (key === 'explain') return void saveNote(i, html);
        // Mở rộng / Ghi nhớ của nhóm (bản 26) — đè bản file, ghi tên người sửa
        if (key === 'extra:expanded' || key === 'extra:note') {
            const f = key.slice(6);
            return void updateDoc(refs.session(), {
                [`extra.q${i}.${f}`]: html,
                [`extraBy.q${i}.${f}`]: { name: myMember()?.displayName || 'Ai đó', at: Date.now() },
            }).catch(() => {});
        }
        if (key === 'note') { setNote(q.question, html); return void renderNotebook(i); }   // đèn 📝 ở mục lục sổ tay
        if (key === 'issue') return void updateDoc(refs.session(), { [`issues.q${i}`]: html }).catch(() => {});
        if (key === 'question') return void updateDoc(refs.session(), { [`edits.q${i}.question`]: html }).catch(() => {});
        // Ca lâm sàng: lưu theo CA -> mọi câu trong chùm đổi theo (tên ca giữ chữ trơn)
        if (key === 'case' || key === 'casetitle') {
            const ck = caseKeyAt(i);
            if (!ck) return;
            return void updateDoc(refs.session(), {
                [`caseEdits.${ck}.${key === 'case' ? 'text' : 'title'}`]: key === 'case' ? html : plainOf(html).slice(0, 120),
                [`caseBy.${ck}`]: { name: myMember()?.displayName || 'Ai đó', at: Date.now() },
            }).catch(() => {});
        }
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

    // Phiếu ca lâm sàng: chấm nhảy câu trong chùm · gập/mở (nhớ theo ca) · trả về bản gốc
    el('case-box')?.addEventListener('click', async (e) => {
        const jump = e.target.closest('[data-case-jump]');
        if (jump) return void setViewIndex(Number(jump.dataset.caseJump));
        const i = effectiveIndex();
        if (e.target.closest('[data-case-fold]')) {
            const ck = caseKeyAt(i);
            caseFold.set(ck, !caseFold.get(ck));
            return void renderCase(i, questionAt(i));
        }
        if (e.target.closest('[data-case-reset]')) {
            const ck = caseKeyAt(i);
            if (!ck || !await showConfirm('Trả ca lâm sàng về bản gốc trong file? Chỗ nhóm đã sửa ở ca này sẽ mất (mọi câu trong chùm).',
                { confirmText: 'Trả về bản gốc', tone: 'warning' })) return;
            caseShown.text = caseShown.title = null;
            updateDoc(refs.session(), { [`caseEdits.${ck}`]: null, [`caseBy.${ck}`]: null }).catch(() => {});
        }
    });
    // Tên ca một dòng: Enter = xong
    el('case-box')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.closest?.('[data-live-edit="casetitle"]')) { e.preventDefault(); e.target.blur(); }
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
        if (e.target.closest('[data-open-chat]')) return void openDiscussion();
        if (e.target.closest('[data-reset-edit]')) return void updateDoc(refs.session(), { [`edits.q${i}`]: null }).catch(() => {});
    };
    el('answer-block')?.addEventListener('click', blockClicks);
    el('my-block')?.addEventListener('click', blockClicks);
    window.addEventListener('room:view', (e) => { if (hasSession()) setViewIndex(Number(e.detail) || 0); });
    window.addEventListener('room:chat', () => { if (hasSession()) renderQuiz(); });
    el('race')?.addEventListener('click', (e) => {
        const av = e.target.closest('[title]');
        // dòng tóm tắt là nút gập/xổ (room-mobile.js), chỉ mặt người trên đường đua mới mở bảng Nhóm
        if (av && !e.target.closest('[data-race-toggle]') && !e.target.closest('.rm-race-top')) window.dispatchEvent(new CustomEvent('room:panel', { detail: 'members' }));
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
