// room-quiz.js — điều khiển phiên đánh đề chung: nhập đề, bắt đầu, quyền chủ trì
// (chuyển câu / khóa / lộ đáp án / hẹn giờ / lưu / kết thúc) và phím tắt.
import {
    doc, getDoc, getDocs, setDoc, updateDoc, addDoc, collection, query, where, limit, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { db } from '../../core/firebase-init.js';
import { showToast, showConfirm } from '../../core/utils.js';
import { shuffleArray } from '../quiz/quiz-helpers.js';
import {
    room, refs, uid, canControl, hasSession, currentIndex, optsOf, correctIdxOf, refIdxOf,
    noteOf, optNoteOf, chosenOf, questionAt, issueOf, isCoop, isShown, whyOf, dissentOf, talkUntil,
    isEssay, acceptedOf, alsoOkOf, isSplit, acceptedText,
} from './room-state.js';
import { escapeHtml } from './room-ui.js';
import { answerCurrent, effectiveIndex, setViewIndex, followHost } from './room-quiz-stage.js';
import { questionStats, computeScores } from './room-scoreboard.js';
import { systemMessage } from './room-chat.js';
import { renderLobby } from './room-lobby.js';
import { ensureXlsx, openMinutes } from './room-boost.js';
import { reviewIndexes } from './room-game.js';

let draft = null;           // bộ đề vừa nạp, chưa phát cho phòng
const TIMER_STEPS = [0, 15, 30, 45, 60, 90];

// ---------- Công bố "đề sắp làm" cho cả phòng (doc phòng: next) ----------
// Thành viên đang chờ thấy ngay tên đề, số câu, phân bố chủ đề / mức độ thay cho dòng chờ trống.
// Firestore không nhận mảng lồng mảng -> mỗi mục là {n, c}.
function summarize(questions, title) {
    const tally = (key) => {
        const m = new Map();
        questions.forEach(q => {
            const v = String(q?.[key] || '').replace(/<[^>]*>/g, '').trim();
            if (v && v.toLowerCase() !== 'chung') m.set(v, (m.get(v) || 0) + 1);
        });
        return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n, c]) => ({ n: n.slice(0, 60), c }));
    };
    return {
        title: String(title || 'Đề trắc nghiệm').slice(0, 120), qCount: questions.length,
        topics: tally('topic'), levels: tally('level'),
        cases: questions.filter(q => q?.caseText || q?.case).length,
        withExp: questions.filter(q => q?.explanation || q?.explain).length,
        by: hostName(), at: Date.now(),
    };
}
const publishNext = () => draft?.questions?.length
    && updateDoc(refs.room(), { next: summarize(draft.questions, draft.title) }).catch(() => {});

// ---------- Đề dùng gần đây (máy này) — một chạm chọn lại ----------
const RECENT_KEY = 'roomRecentQuizzes';
const readRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') || []; } catch (e) { return []; } };
function rememberQuiz(id, title, n) {
    if (!id) return;
    const list = readRecent().filter(r => r.id !== id);
    list.unshift({ id, title: String(title || '').slice(0, 80), n: n || 0, at: Date.now() });
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 6))); } catch (e) {}
    renderRecent();
}
function renderRecent() {
    const box = el('recent-quizzes');
    if (!box) return;
    const list = readRecent();
    const can = room.user && !room.user.isAnonymous && !room.user.isGuest;
    box.classList.toggle('hidden', !list.length || !can);
    box.innerHTML = `<span class="rm-label"><i class="fas fa-clock-rotate-left"></i> Dùng gần đây</span>` + list.map(r =>
        `<button type="button" class="rm-quick" data-quiz="${escapeHtml(r.id)}" title="${escapeHtml(r.title)}">${escapeHtml(r.title.slice(0, 34))}${r.title.length > 34 ? '…' : ''}${r.n ? ` <b>${r.n}</b>` : ''}</button>`).join('');
}

// ---------- Cấu hình nhanh + nhớ cấu hình lần trước ----------
const PRESETS = {
    light: { ic: '🌿', label: 'Ôn nhẹ', sub: 'Cùng làm · thấy ai chọn gì', mode: 'coop', timer: 0, live: true, roam: true, shuffle: false },
    exam: { ic: '⏱️', label: 'Thi thử', sub: 'Cầm trịch · 45s/câu · giấu phiếu · xáo câu', mode: 'lead', timer: 45, live: false, roam: false, shuffle: true },
    deep: { ic: '🧠', label: 'Bàn sâu', sub: 'Cùng làm · giấu phiếu tới khi chốt', mode: 'coop', timer: 0, live: false, roam: true, shuffle: false },
};
const PREFS_KEY = 'roomSetupPrefs';
function readForm() {
    return {
        mode: document.querySelector('input[name="room-mode"]:checked')?.value || 'coop',
        timer: Number(el('setup-timer')?.value) || 0,
        live: !!el('setup-live-stats')?.checked,
        roam: !!el('setup-free-roam')?.checked,
        shuffle: !!el('setup-shuffle')?.checked,
    };
}
function applyForm(c) {
    const r = document.querySelector(`input[name="room-mode"][value="${c.mode}"]`);
    if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
    if (el('setup-timer') && c.mode === 'lead') el('setup-timer').value = String(c.timer ?? 30);
    if (el('setup-live-stats')) el('setup-live-stats').checked = !!c.live;
    if (el('setup-free-roam')) el('setup-free-roam').checked = !!c.roam;
    if (el('setup-shuffle')) el('setup-shuffle').checked = !!c.shuffle;
    paintPresets();
}
function paintPresets() {
    const box = el('setup-presets');
    if (!box) return;
    const f = readForm();
    const same = (p) => p.mode === f.mode && p.live === f.live && p.shuffle === f.shuffle
        && (p.mode === 'coop' || (p.timer === f.timer && p.roam === f.roam));
    box.innerHTML = Object.entries(PRESETS).map(([k, p]) => `<button type="button" class="rm-preset ${same(p) ? 'on' : ''}" data-preset="${k}" title="${p.label}: ${p.sub}">
        <span class="rm-preset-ic">${p.ic}</span><span class="rm-preset-txt"><b>${p.label}</b><span>${p.sub}</span></span></button>`).join('');
}

const hostName = () => room.user?.displayName || room.user?.email?.split('@')[0] || 'Chủ trì';
const el = (id) => document.getElementById(id);

// Đọc file bằng bộ đọc chung của web (core/file-parser.js): nhận cột theo TÊN nên giữ được
// mở rộng · ghi nhớ · chủ đề · mức độ · nguồn · ca lâm sàng · giải thích từng phương án,
// và tự chữa lỗi soạn file như trang chủ.
async function handleQuizFile(file) {
    if (!file) return;
    el('quizFileName').textContent = file.name;
    el('quizFileInfo').classList.remove('hidden');
    el('quiz-question-count-info').textContent = 'Đang đọc…';
    el('start-quiz-collaboration-btn').disabled = true;
    renderLobby();
    try {
        // xlsx 269KB + bộ đọc file 20KB + tự chữa lỗi 23KB: chỉ tải lúc thật sự mở đề, tải song song
        const [{ parseFile }] = await Promise.all([import('../../core/file-parser.js'), ensureXlsx()]);
        const { questions, report } = await parseFile(file, { keepEssay: true, keepUnanswered: true });
        if (!questions.length) {
            el('quiz-question-count-info').textContent = 'Không có câu hợp lệ';
            showToast('Không tìm thấy câu hỏi hợp lệ trong file.', 'warning');
            return;
        }
        const extras = questions.filter(q => q.expanded || q.note).length;
        const essays = questions.filter(isEssay).length;
        el('quiz-question-count-info').textContent = `· ${questions.length} câu${essays ? ` · ${essays} tự luận` : ''}${extras ? ` · ${extras} câu có mở rộng/ghi nhớ` : ''}`;
        if (report?.applied) showToast('Đã tự chữa vài lỗi soạn file trước khi mở đề.', 'info', 2600);
        draft = { questions, title: file.name.replace(/\.(xlsx|xls|csv)$/i, ''), fromLibrary: false };
        el('start-quiz-collaboration-btn').disabled = false;
        publishNext();
        renderLobby();
    } catch (err) {
        console.error(err);
        showToast('Lỗi khi đọc file. Kiểm tra lại định dạng nhé.', 'error');
        el('quizFileInfo').classList.add('hidden');
    }
}

// ---------- Thư viện cá nhân ----------
async function toggleLibraryList() {
    const box = el('library-quiz-list');
    if (!box) return;
    if (box.childElementCount) { box.innerHTML = ''; return; }
    if (!room.user || room.user.isAnonymous || room.user.isGuest) return showToast('Đăng nhập để dùng thư viện của bạn.', 'warning');
    box.innerHTML = '<p class="text-sm text-gray-400 py-2"><i class="fas fa-spinner fa-spin mr-2"></i>Đang tải thư viện…</p>';
    try {
        const snap = await getDocs(query(collection(db, 'quiz_sets'), where('userId', '==', uid()), limit(50)));
        if (snap.empty) { box.innerHTML = '<p class="text-sm text-gray-400 py-2">Thư viện của bạn đang trống.</p>'; return; }
        const docs = snap.docs.slice().sort((a, b) => (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0));
        box.innerHTML = `<p class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Chọn đề cho cả phòng</p>
            <div class="space-y-2 max-h-60 overflow-y-auto rm-scroll pr-1">${docs.map(d => {
                const data = d.data();
                return `<button type="button" data-quiz="${d.id}" class="w-full flex items-center gap-3 text-left px-4 py-2.5 bg-white border border-pink-100 rounded-xl hover:border-[#FFB6C1] hover:bg-pink-50/60 transition">
                    <span class="shrink-0 w-8 h-8 rounded-lg bg-pink-50 text-[#FF69B4] grid place-items-center text-xs"><i class="fas fa-file-alt"></i></span>
                    <span class="flex-1 min-w-0 truncate text-sm font-semibold text-gray-700">${escapeHtml(data.title || 'Bài test không tên')}</span>
                    <span class="shrink-0 text-xs font-bold text-gray-400 tabular-nums">${data.questionCount || (data.questions || []).length} câu</span>
                </button>`;
            }).join('')}</div>`;
    } catch (err) {
        console.error('Lỗi tải thư viện:', err);
        box.innerHTML = '<p class="text-sm text-red-500 py-2">Không tải được thư viện.</p>';
    }
}

async function pickFromLibrary(quizId) {
    el('loading-overlay').classList.remove('hidden');
    try {
        const snap = await getDoc(doc(db, 'quiz_sets', quizId));
        if (!snap.exists()) return showToast('Không tìm thấy bộ đề này.', 'error');
        const data = snap.data();
        draft = { questions: data.questions || [], title: data.title || 'Đề trắc nghiệm', fromLibrary: true, quizId };
        el('quizFileInfo').classList.remove('hidden');
        el('quizFileName').textContent = draft.title;
        el('quiz-question-count-info').textContent = `· ${draft.questions.length} câu`;
        el('start-quiz-collaboration-btn').disabled = !draft.questions.length;
        publishNext();
        rememberQuiz(quizId, draft.title, draft.questions.length);
        renderLobby();
        el('library-quiz-list').innerHTML = '';
        showToast('Đã chọn đề. Bấm "Bắt đầu cho cả phòng" nhé!', 'success');
    } catch (err) {
        console.error(err);
        showToast('Có lỗi khi mở bộ đề.', 'error');
    } finally {
        el('loading-overlay').classList.add('hidden');
    }
}

// ---------- Bắt đầu phiên ----------
async function startSession() {
    if (!draft?.questions?.length) return;
    const mode = document.querySelector('input[name="room-mode"]:checked')?.value || 'coop';
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(readForm())); } catch (e) {}
    const timerSec = mode === 'lead' ? (Number(el('setup-timer').value) || 0) : 0;
    const questions = el('setup-shuffle').checked ? shuffleArray(draft.questions.slice()) : draft.questions;
    el('loading-overlay').classList.remove('hidden');
    try {
        // Xóa đáp án phiên trước của mọi người để bảng điểm bắt đầu từ 0
        await Promise.all(room.members.map(m => updateDoc(refs.member(m.uid),
            { answers: {}, flags: {}, marks: {}, ready: {}, unclear: {}, diff: {}, dissent: {}, args: {}, agree: {}, cursor: 0, hand: null, team: null }).catch(() => {})));
        await setDoc(refs.session(), {
            questions,
            quizTitle: draft.title,
            mode,
            timerSec,
            liveStats: el('setup-live-stats').checked,
            freeRoam: mode === 'coop' ? true : el('setup-free-roam').checked,
            hostId: uid(),
            hostName: hostName(),
            cohosts: [],
            currentQuestionIndex: 0,
            qStarts: { q0: Date.now() },
            deadline: timerSec ? Date.now() + timerSec * 1000 : null,
            chosen: {}, shown: {}, notes: {}, optNotes: {}, notesBy: {}, editing: {}, edits: {}, issues: {}, explainer: {},
            alsoOk: {}, split: {},
            teamOn: false, buzzOn: false, buzz: {}, blind: {}, spotlight: {}, thanks: {},
            locked: false, ended: false,
            pinnedNote: '',
            fromLibrary: !!draft.fromLibrary,
            sourceQuizId: draft.quizId || null,
            savedQuizId: null,
            startedAt: serverTimestamp(),
            startedAtMs: Date.now(),
        });
        // Tóm tắt cho khu "Phòng học của tôi" ở trang chủ: thẻ phòng đọc field này nên
        // không phải tải cả bộ đề (doc quizSession có thể vài trăm KB) chỉ để hiện trạng thái.
        updateDoc(refs.room(), {
            live: { title: draft.title, qCount: questions.length, startedAt: Date.now(), ended: false, people: room.members.length, sourceQuizId: draft.quizId || null },
            next: null, scheduledAt: null, rollCall: null,
        }).catch(() => {});
        systemMessage(`${hostName()} đã mở phiên đánh đề "${draft.title}" (${questions.length} câu).`);
        showToast('Đã bắt đầu cho cả phòng!', 'success');
    } catch (err) {
        console.error(err);
        showToast('Không bắt đầu được phiên. Thử lại nhé.', 'error');
    } finally {
        el('loading-overlay').classList.add('hidden');
    }
}

// ---------- Quyền chủ trì ----------
async function gotoQuestion(i) {
    const s = room.session;
    if (!canControl() || !s || i < 0 || i >= s.questions.length) return;
    const patch = {
        currentQuestionIndex: i,
        locked: false,
        deadline: s.timerSec ? Date.now() + s.timerSec * 1000 : null,
    };
    if (!s.qStarts?.['q' + i]) patch[`qStarts.q${i}`] = Date.now();   // giữ mốc cũ khi quay lại câu đã mở
    await updateDoc(refs.session(), patch).catch(err => console.error(err));
}

const setLocked = (v) => updateDoc(refs.session(), { locked: v }).catch(() => {});

// --- 3 quyền của chủ trì: HIỆN đáp án · CHỐT đáp án · CÂU TIẾP ---

// 1) Hiện đáp án tham khảo trong file cho cả nhóm (chưa tính điểm)
async function showAnswer() {
    const i = effectiveIndex();
    await updateDoc(refs.session(), { [`shown.q${i}`]: true }).catch(() => {});
    systemMessage(isEssay(questionAt(i))
        ? `Chủ trì đã hiện bài giải gợi ý trong file của câu ${i + 1} — đối chiếu với bài làm chung nhé.`
        : `Chủ trì đã hiện đáp án tham khảo của câu ${i + 1}.`);
}

// 2) Chốt đáp án cuối — mở menu chọn: A/B/C/D, theo đa số, theo file, bỏ chốt
// Đa số — hoà phiếu thì trả về TẤT CẢ ý đồng hạng (chấp nhận cả hai, đừng chỉ đại một ý)
const topOf = (st) => {
    const max = Math.max(0, ...st.counts);
    return max ? st.counts.map((n, k) => (n === max ? k : -1)).filter(k => k >= 0) : [];
};
// Đáp án file (kể cả câu nhiều đáp án: correctAnswerIndexes)
const refAllOf = (q) => {
    if (Array.isArray(q?.correctAnswerIndexes) && q.correctAnswerIndexes.length) return q.correctAnswerIndexes.slice().sort((a, b) => a - b);
    const r = refIdxOf(q);
    return r === null ? [] : [r];
};

function chotMenuHtml() {
    const i = effectiveIndex();
    const q = questionAt(i);
    const opts = optsOf(q);
    const st = questionStats(i);
    const top = topOf(st);
    const ref = refAllOf(q);
    const cur = chosenOf(i);
    const also = alsoOkOf(i);
    const letter = (k) => String.fromCharCode(65 + k);
    const ic = (bg, fg, inner) => `<span class="rm-menu-ic" style="background:${bg};color:${fg}">${inner}</span>`;
    return `
        <p class="rm-label px-2 pt-1 pb-1.5">Kết luận câu ${i + 1}</p>
        ${opts.map((_, k) => `<button data-chot="${k}" class="rm-menu-item ${cur === k ? 'is-active' : ''}">
            ${ic('var(--rm-accent-soft)', 'var(--rm-accent-deep)', letter(k))}
            ${cur === k ? 'Đáp án chính' : 'Chốt'} ${letter(k)}${st.counts[k] ? ` · ${st.counts[k]} người` : ''}</button>`).join('')}
        ${cur !== null ? `<p class="rm-menu-cap">Nhiều đáp án cùng đúng</p>
            <div class="rm-menu-also">${opts.map((_, k) => k === cur ? '' : `<button data-chot="also:${k}" class="rm-also ${also.includes(k) ? 'on' : ''}" title="Chấp nhận thêm ${letter(k)} (chọn ${letter(k)} cũng tính đúng)">${also.includes(k) ? '<i class="fas fa-check"></i>' : '+'} ${letter(k)}</button>`).join('')}</div>` : ''}
        <p class="rm-menu-cap">Nhanh</p>
        ${top.length ? `<button data-chot="top" class="rm-menu-item">${ic('var(--rm-ok-bg)', 'var(--rm-ok)', '<i class="fas fa-users"></i>')}Theo đa số (${top.map(letter).join(' + ')})${top.length > 1 ? ' — hoà, chấp nhận cả' : ''}</button>` : ''}
        ${ref.length ? `<button data-chot="ref" class="rm-menu-item">${ic('var(--rm-lav-soft)', '#7B61C4', '<i class="fas fa-file-lines"></i>')}Theo đáp án file (${ref.map(letter).join(' + ')})</button>` : ''}
        <button data-chot="split" class="rm-menu-item ${isSplit(i) ? 'is-active' : ''}">${ic('var(--rm-warn-bg)', 'var(--rm-warn)', '🤝')}Chưa thống nhất — ghi nhận các quan điểm</button>
        ${cur !== null || isSplit(i) ? `<button data-chot="none" class="rm-menu-item">${ic('var(--rm-bad-bg)', 'var(--rm-bad)', '<i class="fas fa-rotate-left"></i>')}Bỏ kết luận câu này</button>` : ''}
        <button data-chot="revote" class="rm-menu-item">${ic('var(--rm-peach-soft)', 'var(--rm-warn)', '<i class="fas fa-repeat"></i>')}Bầu lại câu này</button>`;
}

async function chot(value) {
    if (value === 'revote') return revote();
    const i = effectiveIndex();
    const q = questionAt(i);
    const st = questionStats(i);
    const letter = (k) => String.fromCharCode(65 + k);
    // Thêm / bớt một đáp án "cũng đúng" (giữ đáp án chính)
    if (value.startsWith('also:')) {
        const k = Number(value.slice(5));
        const cur = alsoOkOf(i);
        const next = cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k].sort((a, b) => a - b);
        await updateDoc(refs.session(), { [`alsoOk.q${i}`]: next }).catch(() => {});
        return systemMessage(`Câu ${i + 1}: nhóm ${cur.includes(k) ? 'bỏ' : 'chấp nhận thêm'} đáp án ${letter(k)}.`);
    }
    if (value === 'split') {
        await updateDoc(refs.session(), {
            [`chosen.q${i}`]: null, [`alsoOk.q${i}`]: [], [`shown.q${i}`]: true,
            [`split.q${i}`]: { at: Date.now(), by: hostName() },
        }).catch(() => {});
        return systemMessage(`Câu ${i + 1}: nhóm chưa thống nhất — mọi quan điểm được ghi nhận vào biên bản.`);
    }
    let picks = [];
    if (value === 'top') picks = topOf(st);
    else if (value === 'ref') picks = refAllOf(q);
    else if (value !== 'none') picks = [Number(value)];
    if (value !== 'none' && (!picks.length || picks.some(k => isNaN(k)))) {
        showToast('Chưa có gì để chốt — chọn tay một phương án nhé.', 'warning');
        return;
    }
    await updateDoc(refs.session(), {
        [`chosen.q${i}`]: picks.length ? picks[0] : null,
        [`alsoOk.q${i}`]: picks.slice(1),
        [`split.q${i}`]: null,
        [`shown.q${i}`]: true,
    }).catch(() => {});
    if (picks.length) systemMessage(`Nhóm chốt câu ${i + 1}: ${picks.map(letter).join(' + ')}.`);
}

// Bầu lại: giữ lại kết quả vòng trước để so, xóa lựa chọn của mọi người rồi bầu lượt mới
async function revote() {
    const i = effectiveIndex();
    const st = questionStats(i);
    if (!await showConfirm(`Bầu lại câu ${i + 1}? Lựa chọn hiện tại của mọi người sẽ được lưu làm "vòng trước" rồi xóa đi.`,
        { confirmText: 'Bầu lại', tone: 'warning' })) return;
    await updateDoc(refs.session(), {
        [`prevVote.q${i}`]: st.counts,
        [`chosen.q${i}`]: null, [`alsoOk.q${i}`]: [], [`split.q${i}`]: null,
    }).catch(() => {});
    await Promise.all(room.members.map(m => updateDoc(refs.member(m.uid), {
        [`answers.q${i}`]: null, [`ready.q${i}`]: null, [`dissent.q${i}`]: null,
    }).catch(() => {})));
    systemMessage(`Bầu lại câu ${i + 1} — mọi người chọn lại nhé!`);
}

// Hẹn giờ BÀN LUẬN cho cả nhóm (khác đồng hồ làm bài): 2' → 3' → 5' → tắt
const TALK_STEPS = [120, 180, 300, 0];
async function cycleTalk() {
    const left = Math.max(0, Math.round((talkUntil() - Date.now()) / 1000));
    const cur = TALK_STEPS.findIndex(v => v && Math.abs(v - left) < 15);
    const next = TALK_STEPS[(cur + 1) % TALK_STEPS.length];
    await updateDoc(refs.session(), { talkUntil: next ? Date.now() + next * 1000 : 0 }).catch(() => {});
    const lbl = el('host-talk-label');
    if (lbl) lbl.textContent = next ? `Bàn ${Math.round(next / 60)}'` : 'Bàn';
    showToast(next ? `Cả nhóm bàn trong ${Math.round(next / 60)} phút.` : 'Đã tắt đồng hồ bàn luận.', 'info');
    if (next) systemMessage(`Cùng bàn câu ${effectiveIndex() + 1} trong ${Math.round(next / 60)} phút nha!`);
}

// 3) Câu tiếp: dời câu cả nhóm đang bàn và kéo màn hình chủ trì theo
async function nextQuestion() {
    await gotoQuestion(currentIndex() + 1);
    followHost();
}

// Đặt "câu cả phòng đang bàn" = câu chủ trì đang xem
async function setFocusHere() {
    const i = effectiveIndex();
    await gotoQuestion(i);
    systemMessage(`Cả nhóm cùng bàn câu ${i + 1} nhé.`);
}

// Thêm câu vào CUỐI phiên đang chạy (dán từ hộp "Dán đề"). Dữ liệu mỗi người khoá theo số câu
// q<i> nên nối vào cuối không làm lệch câu cũ.
async function appendQuestions(list) {
    const s = room.session;
    const start = s.questions.length;
    await updateDoc(refs.session(), { questions: [...s.questions, ...list] }).catch(() => showToast('Chưa thêm được câu.', 'error'));
    systemMessage(`${hostName()} thêm ${list.length} câu mới (câu ${start + 1}${list.length > 1 ? `–${start + list.length}` : ''}).`);
    setViewIndex(start);
}

// Biên bản buổi học: xem room-minutes.js (PDF đẹp + Markdown)

async function cycleTimer() {
    const s = room.session;
    const next = TIMER_STEPS[(TIMER_STEPS.indexOf(s?.timerSec || 0) + 1) % TIMER_STEPS.length];
    await updateDoc(refs.session(), {
        timerSec: next,
        deadline: next ? Date.now() + next * 1000 : null,
        ...(next ? { locked: false } : {}),
    }).catch(() => {});
    showToast(next ? `Hẹn giờ ${next}s mỗi câu.` : 'Đã tắt hẹn giờ.', 'info');
}

async function endSession() {
    if (!await showConfirm('Kết thúc phiên và xem tổng kết cho cả phòng?', { confirmText: 'Kết thúc', tone: 'warning' })) return;
    await updateDoc(refs.session(), { ended: true, locked: true }).catch(() => {});
    // Chốt tóm tắt buổi học cho thẻ phòng ở trang chủ (độ chính xác tính lại từ dữ liệu, không lưu sẵn)
    const rows = computeScores().filter(r => r.answered > 0);
    const avg = rows.length ? Math.round(rows.reduce((a, r) => a + r.correct / r.answered * 100, 0) / rows.length) : null;
    updateDoc(refs.room(), {
        'live.ended': true, 'live.endedAt': Date.now(), 'live.people': rows.length,
        ...(avg === null ? {} : { 'live.avg': avg }),
    }).catch(() => {});
    systemMessage('Phiên đánh đề đã kết thúc — xem tổng kết nhé!');
}

async function restartSession() {
    if (!await showConfirm('Làm lại từ câu 1? Đáp án của mọi người sẽ được xóa.', { confirmText: 'Làm lại' })) return;
    await Promise.all(room.members.map(m => updateDoc(refs.member(m.uid), { answers: {}, flags: {} }).catch(() => {})));
    await updateDoc(refs.session(), {
        currentQuestionIndex: 0, ended: false, locked: false, chosen: {}, alsoOk: {}, split: {},
        qStarts: { q0: Date.now() },
        deadline: room.session?.timerSec ? Date.now() + room.session.timerSec * 1000 : null,
        startedAtMs: Date.now(),
    }).catch(() => {});
}

async function closeSession() {
    if (!await showConfirm('Đóng phiên và quay về màn chọn đề?', { confirmText: 'Đóng phiên' })) return;
    await setDoc(refs.session(), { questions: [] });
}

/** Gom những câu đáng ôn (mình chọn trật / bỏ trống / nhóm bấm cần bàn / mình đánh dấu)
 *  thành MỘT BỘ ĐỀ MỚI trong thư viện — học lại đúng chỗ mình hổng. */
async function saveReviewQuiz() {
    const s = room.session;
    if (!s?.questions?.length) return;
    if (!room.user || room.user.isAnonymous || room.user.isGuest) {
        return showToast('Đăng nhập để lưu đề ôn vào thư viện của bạn.', 'warning');
    }
    const idx = reviewIndexes().filter(i => !isEssay(questionAt(i)));
    if (!idx.length) return showToast('Không có câu trắc nghiệm nào cần ôn — bạn làm tốt quá!', 'success');
    if (!await showConfirm(`Tạo bộ đề ôn gồm ${idx.length} câu (sai / bỏ trống / cần bàn)?`, { confirmText: 'Tạo đề ôn' })) return;

    el('loading-overlay').classList.remove('hidden');
    try {
        const questions = idx.map(i => {
            const q = questionAt(i);
            const opts = optsOf(q);
            const optExp = opts.map((_, k) => optNoteOf(i, k) || (q.optionExplanations && q.optionExplanations[k]) || '');
            return {
                ...q,
                question: q.question,
                answers: opts,
                correctAnswerIndex: correctIdxOf(q, i) ?? refIdxOf(q),
                ...(acceptedOf(i).length > 1 ? { correctAnswerIndexes: acceptedOf(i) } : {}),
                explanation: noteOf(i) || q.explanation || q.explain || '',
                ...(optExp.some(t => t) ? { optionExplanations: optExp } : {}),
            };
        });
        const d = new Date();
        const stamp = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        const title = `${s.quizTitle || 'Đề nhóm'} — ôn câu sai ${stamp}`;
        const ref = await addDoc(collection(db, 'quiz_sets'), {
            title,
            questionCount: questions.length,
            questions,
            userId: uid(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            isPublic: false,
            folderId: null,
        });
        showToast(`Đã tạo "${title}" — mở ở thư viện để ôn lại.`, 'success', 3600);
        window.open(`../quiz/quiz.html?id=${ref.id}`, '_blank', 'noopener');
    } catch (err) {
        console.error('Lỗi tạo đề ôn:', err);
        showToast('Không tạo được đề ôn. Thử lại nhé.', 'error');
    } finally {
        el('loading-overlay').classList.add('hidden');
    }
}
window.addEventListener('room:save-review', saveReviewQuiz);

async function saveToLibrary() {
    const s = room.session;
    if (!s || !room.user || room.user.isAnonymous || room.user.isGuest) return showToast('Đăng nhập để lưu đề vào thư viện.', 'warning');
    const keep = s.questions.map((_, i) => i).filter(i => !isEssay(questionAt(i)));
    if (!keep.length) return showToast('Đề toàn câu tự luận — trang làm bài chưa hỗ trợ. Xuất biên bản để lưu bài giải nhé.', 'info', 3600);
    const essays = s.questions.length - keep.length;
    const missing = keep.filter(i => correctIdxOf(questionAt(i), i) === null && refIdxOf(questionAt(i)) === null).length;
    const msg = (missing ? `Còn ${missing} câu chưa có đáp án đúng. ` : '')
        + (essays ? `${essays} câu tự luận sẽ không lưu (trang làm bài chưa hỗ trợ — có trong biên bản). ` : '')
        + 'Lưu thành bộ đề MỚI trong thư viện của bạn? (không đụng vào bộ đề gốc)';
    if (!await showConfirm(msg, { confirmText: 'Lưu bản mới' })) return;

    el('loading-overlay').classList.remove('hidden');
    try {
        // Quy ước answers/correctAnswerIndex (0-based) để trang quiz.html đọc được
        const payload = {
            questionCount: keep.length,
            questions: keep.map((i) => {
                const q = questionAt(i);            // bản đã được nhóm sửa (nếu có)
                const opts = optsOf(q);
                const optExp = opts.map((_, k) => optNoteOf(i, k) || (q.optionExplanations && q.optionExplanations[k]) || '');
                return {
                    ...q,
                    question: q.question,
                    answers: opts,
                    correctAnswerIndex: correctIdxOf(q, i) ?? refIdxOf(q),
                    ...(acceptedOf(i).length > 1 ? { correctAnswerIndexes: acceptedOf(i) } : {}),
                    explanation: noteOf(i) || q.explanation || q.explain || '',
                    ...(optExp.some(t => t) ? { optionExplanations: optExp } : {}),
                    ...(issueOf(i) ? { note: [q.note, '⚠ ' + issueOf(i)].filter(Boolean).join(' — ') } : {}),
                };
            }),
            updatedAt: serverTimestamp(),
        };
        // LUÔN tạo bản mới: bộ đề gốc trong thư viện không bao giờ bị ghi đè.
        const base = s.quizTitle || 'Đề từ phòng học';
        const d = new Date();
        const stamp = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        const title = `${base} (nhóm ${stamp})`;
        const ref = await addDoc(collection(db, 'quiz_sets'), {
            ...payload,
            userId: uid(),
            title,
            createdAt: serverTimestamp(),
            isPublic: true,
            folderId: null,
        });
        await updateDoc(refs.session(), { savedQuizId: ref.id }).catch(() => {});
        showToast(`Đã lưu bản mới: "${title}"`, 'success', 3200);
    } catch (err) {
        console.error('Lỗi lưu thư viện:', err);
        showToast('Không lưu được. Thử lại nhé.', 'error');
    } finally {
        el('loading-overlay').classList.add('hidden');
    }
}

// ---------- Dán đề (trắc nghiệm / tự luận) — không cần file Excel ----------
// mode 'lobby' = dùng làm đề mới cho phòng · 'append' = nối vào cuối phiên đang chạy
let pasteMode = 'lobby';
let pasted = [];
// Bộ đọc đề dán (room-paste.js + quiz-autofix.js ~28KB) chỉ nạp khi mở hộp
let parseQuizText = null, pasteLib = null;
const loadPaste = () => (pasteLib ||= import('./room-paste.js').then(m => { parseQuizText = m.parseQuizText; })
    .catch((e) => { pasteLib = null; throw e; }));
function openPaste(mode = 'lobby') {
    pasteMode = mode;
    el('paste-head').textContent = mode === 'append' ? 'Thêm câu vào phiên đang làm' : 'Dán đề trắc nghiệm / tự luận';
    el('paste-go').innerHTML = mode === 'append' ? '<i class="fas fa-plus"></i>Thêm vào cuối đề' : '<i class="fas fa-check"></i>Dùng đề này';
    el('paste-name-row')?.classList.toggle('hidden', mode === 'append');
    el('paste-modal').classList.remove('hidden');
    loadPaste().then(paintPaste).catch(() => showToast('Không tải được bộ đọc đề — kiểm tra mạng.', 'error'));
    setTimeout(() => el('paste-text')?.focus(), 60);
}
function paintPaste() {
    if (!parseQuizText) return;
    pasted = parseQuizText(el('paste-text')?.value || '');
    const box = el('paste-preview');
    el('paste-go').disabled = !pasted.length;
    if (!pasted.length) { box.innerHTML = '<p class="rm-hint">Chưa nhận ra câu nào — dán đề vào ô trên.</p>'; return; }
    const letter = (k) => String.fromCharCode(65 + k);
    const essays = pasted.filter(isEssay).length;
    box.innerHTML = `<p class="rm-paste-sum"><b>${pasted.length} câu</b> · ${pasted.length - essays} trắc nghiệm · ${essays} tự luận</p>
        <ol class="rm-paste-list">${pasted.slice(0, 30).map((q, k) => `<li>
            <span class="rm-chip ${isEssay(q) ? 'lav' : ''}">${isEssay(q) ? 'tự luận' : `${q.answers.length} phương án${typeof q.correctAnswerIndex === 'number' ? ' · ĐA ' + (q.correctAnswerIndexes || [q.correctAnswerIndex]).map(letter).join(',') : ''}`}</span>
            <span class="truncate">${k + 1}. ${escapeHtml(String(q.question).replace(/<[^>]*>/g, ' ').slice(0, 110))}</span></li>`).join('')}</ol>
        ${pasted.length > 30 ? `<p class="rm-hint">… và ${pasted.length - 30} câu nữa</p>` : ''}`;
}
function usePasted() {
    const questions = pasted;
    if (!canControl() || !questions.length) return;
    el('paste-modal').classList.add('hidden');
    el('paste-text').value = '';
    if (pasteMode === 'append' && hasSession()) return void appendQuestions(questions);
    const d = new Date();
    const title = String(el('paste-name')?.value || '').trim() || `Đề dán ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')} ${d.toLocaleDateString('vi-VN')}`;
    el('paste-name').value = '';
    draft = { questions, title, fromLibrary: false };
    el('quizFileInfo').classList.remove('hidden');
    el('quizFileName').textContent = title;
    const essays = questions.filter(isEssay).length;
    el('quiz-question-count-info').textContent = `· ${questions.length} câu${essays ? ` · ${essays} tự luận` : ''}`;
    el('start-quiz-collaboration-btn').disabled = false;
    publishNext();
    renderLobby();
    showToast(`Đã nhận ${questions.length} câu. Bấm "Bắt đầu cho cả phòng" nhé!`, 'success');
}

// ---------- Phím tắt ----------
function onKey(e) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (!hasSession()) return;
    const s = room.session;
    if (/^[1-9]$/.test(e.key)) { answerCurrent(Number(e.key) - 1); return; }
    if (/^[a-dA-D]$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
        const idx = e.key.toLowerCase().charCodeAt(0) - 97;
        if (canControl() && e.shiftKey) chot(String(idx));
        else answerCurrent(idx);
        return;
    }
    // Mũi tên: đi câu của RIÊNG mình. Shift + mũi tên (chủ trì): dời câu cả phòng đang bàn.
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const step = e.key === 'ArrowRight' ? 1 : -1;
        if (e.shiftKey && canControl()) gotoQuestion(currentIndex() + step);
        else setViewIndex(effectiveIndex() + step);
        return;
    }
    if (!canControl()) return;
    if (e.key === ' ') { e.preventDefault(); chot('top'); }
    else if (e.key.toLowerCase() === 's') showAnswer();
    else if (e.key.toLowerCase() === 'n') nextQuestion();
    else if (e.key.toLowerCase() === 'g') setFocusHere();
    else if (e.key.toLowerCase() === 'l' && !isCoop()) setLocked(!s.locked);
    else if (e.key.toLowerCase() === 't' && !isCoop()) cycleTimer();
}

// ---------- Khởi tạo ----------
export function initQuizControl() {
    const drop = el('upload-quiz-file-area');
    drop?.addEventListener('click', () => el('quizFileInput').click());
    drop?.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('bg-pink-50', 'border-[#FF69B4]'); });
    drop?.addEventListener('dragleave', () => drop.classList.remove('bg-pink-50', 'border-[#FF69B4]'));
    drop?.addEventListener('drop', (e) => {
        e.preventDefault();
        drop.classList.remove('bg-pink-50', 'border-[#FF69B4]');
        handleQuizFile(e.dataTransfer.files[0]);
    });
    el('quizFileInput')?.addEventListener('change', (e) => handleQuizFile(e.target.files[0]));
    el('library-quiz-btn')?.addEventListener('click', toggleLibraryList);
    el('library-quiz-list')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-quiz]');
        if (b) pickFromLibrary(b.dataset.quiz);
    });
    el('recent-quizzes')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-quiz]');
        if (b) pickFromLibrary(b.dataset.quiz);
    });
    window.addEventListener('room:pick-quiz', (e) => { if (canControl() && e.detail) pickFromLibrary(e.detail); });
    renderRecent();

    // Cấu hình nhanh + khôi phục cấu hình của lần trước
    try { const pr = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'); if (pr) applyForm(pr); } catch (e) {}
    paintPresets();
    el('setup-presets')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-preset]');
        if (!b) return;
        applyForm(PRESETS[b.dataset.preset]);
        showToast(`Đã chọn "${PRESETS[b.dataset.preset].label}" — vẫn chỉnh tay được ở dưới.`, 'info', 1800);
    });
    el('lobby-host-setup')?.addEventListener('change', paintPresets);

    // Kéo file đề thả vào BẤT KỲ đâu trên sảnh (chủ trì, chưa có phiên)
    const dropAll = el('drop-all');
    const isQuizFile = (dt) => [...(dt?.items || [])].some(it => it.kind === 'file' && !String(it.type).startsWith('image/'));
    let dragDepth = 0;
    const canDrop = () => canControl() && !hasSession() && !el('stage-quiz')?.classList.contains('hidden');
    document.addEventListener('dragenter', (e) => {
        if (!canDrop() || !isQuizFile(e.dataTransfer)) return;
        dragDepth++;
        dropAll?.classList.remove('hidden');
    });
    document.addEventListener('dragleave', () => {
        if (dragDepth && --dragDepth === 0) dropAll?.classList.add('hidden');
    });
    document.addEventListener('dragover', (e) => { if (!dropAll?.classList.contains('hidden')) e.preventDefault(); });
    document.addEventListener('drop', (e) => {
        if (dropAll?.classList.contains('hidden')) return;
        e.preventDefault();
        dragDepth = 0;
        dropAll.classList.add('hidden');
        const f = [...(e.dataTransfer?.files || [])].find(x => /\.(xlsx|xls|csv)$/i.test(x.name));
        if (f) handleQuizFile(f);
        else showToast('Chỉ nhận file đề Excel / CSV.', 'warning');
    });
    el('start-quiz-collaboration-btn')?.addEventListener('click', startSession);
    el('paste-quiz-btn')?.addEventListener('click', () => openPaste('lobby'));
    el('host-add')?.addEventListener('click', () => openPaste('append'));
    const pm = el('paste-modal');
    pm?.addEventListener('click', (e) => { if (e.target === pm || e.target.closest('[data-close-paste]')) pm.classList.add('hidden'); });
    pm?.addEventListener('keydown', (e) => { if (e.key === 'Escape') pm.classList.add('hidden'); });
    let pasteTimer = null;
    el('paste-text')?.addEventListener('input', () => { clearTimeout(pasteTimer); pasteTimer = setTimeout(paintPaste, 220); });
    el('paste-go')?.addEventListener('click', usePasted);
    el('download-quiz-template-btn')?.addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = '../../assets/quiz-template.xlsx';
        a.download = 'quiz-template.xlsx';
        a.click();
    });

    // 3 quyền của chủ trì + vài nút phụ
    el('host-show')?.addEventListener('click', showAnswer);
    el('host-next')?.addEventListener('click', nextQuestion);
    el('host-focus')?.addEventListener('click', setFocusHere);
    el('host-lock')?.addEventListener('click', () => setLocked(!room.session?.locked));
    el('host-minutes')?.addEventListener('click', openMinutes);
    el('host-talk')?.addEventListener('click', cycleTalk);
    el('host-lock-answer')?.addEventListener('click', () => {
        const menu = el('chot-menu');
        const btn = el('host-lock-answer');
        if (!menu) return;
        if (!menu.classList.contains('hidden')) { menu.classList.add('hidden'); return; }
        menu.innerHTML = chotMenuHtml();
        menu.classList.remove('hidden');
        // Thanh chủ trì cuộn ngang -> menu đặt absolute sẽ bị cắt. Neo theo màn hình.
        const r = btn.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 240))}px`;
        menu.style.bottom = `${Math.max(8, window.innerHeight - r.top + 8)}px`;
        menu.style.zIndex = '70';
    });
    el('chot-menu')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-chot]');
        if (!b) return;
        // Bật/tắt "cũng chấp nhận" thì giữ menu mở để tích tiếp ý khác. Chặn nổi bọt: menu vẽ lại
        // (microtask) trước bộ "bấm ra ngoài thì đóng" -> nút vừa bấm đã rời DOM, tưởng bấm ngoài.
        if (b.dataset.chot.startsWith('also:')) {
            e.stopPropagation();
            return void chot(b.dataset.chot).then(() => { el('chot-menu').innerHTML = chotMenuHtml(); });
        }
        el('chot-menu').classList.add('hidden');
        chot(b.dataset.chot);
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#chot-menu') && !e.target.closest('#host-lock-answer')) el('chot-menu')?.classList.add('hidden');
    });
    el('host-timer')?.addEventListener('click', cycleTimer);
    el('host-save')?.addEventListener('click', saveToLibrary);
    el('host-end')?.addEventListener('click', endSession);
    el('host-hands')?.addEventListener('click', () => window.dispatchEvent(new CustomEvent('room:panel', { detail: 'members' })));
    el('host-mode-btn')?.addEventListener('click', async () => {
        const next = isCoop() ? 'lead' : 'coop';
        await updateDoc(refs.session(), {
            mode: next,
            locked: false,
            ...(next === 'coop' ? { deadline: null, timerSec: 0, freeRoam: true } : {}),
        }).catch(() => {});
        showToast(next === 'coop'
            ? 'Chuyển sang "Cùng làm": mỗi người tự đi một nhịp, bạn chỉ chốt đáp án.'
            : 'Chuyển sang "Cầm trịch": cả phòng bám theo câu của bạn.', 'info');
    });

    el('quiz-result')?.addEventListener('click', (e) => {
        if (e.target.closest('#result-minutes-btn')) openMinutes();
        else if (e.target.closest('#result-save-btn')) saveToLibrary();
        else if (e.target.closest('#result-again-btn')) restartSession();
        else if (e.target.closest('#result-close-btn')) closeSession();
    });

    window.addEventListener('room:goto', (e) => gotoQuestion(e.detail));
    document.addEventListener('keydown', onKey);
}

/** Cập nhật nhãn/nút của thanh chủ trì theo trạng thái phiên. */
export function syncHostBar() {
    const s = room.session;
    if (!s) return;
    const coop = isCoop();
    const i = effectiveIndex();
    const shown = isShown(i);
    const chosen = chosenOf(i);

    // Chế độ "cùng làm": chủ trì KHÔNG khóa nộp, KHÔNG hẹn giờ — chỉ 3 nút chính.
    el('host-lock')?.classList.toggle('hidden', coop);
    el('host-timer')?.classList.toggle('hidden', coop);

    const essay = isEssay(questionAt(i));
    const show = el('host-show');
    if (show) {
        show.classList.toggle('done', shown);
        show.querySelector('span').textContent = essay
            ? (shown ? 'Đã hiện bài giải' : 'Hiện bài giải file')
            : (shown ? 'Đã hiện đáp án' : 'Hiện đáp án');
        show.title = essay ? 'Cho cả phòng xem bài giải gợi ý trong file để đối chiếu với bài làm chung (phím S)' : 'Hiện đáp án tham khảo trong file (phím S)';
    }
    const lockBtn = el('host-lock-answer');
    if (lockBtn) {
        lockBtn.classList.toggle('hidden', essay);
        lockBtn.querySelector('span').textContent = chosen !== null ? `Đã chốt ${acceptedText(i)}`
            : isSplit(i) ? 'Chưa thống nhất' : 'Chốt đáp án';
    }

    const lock = el('host-lock');
    if (lock) {
        lock.innerHTML = s.locked
            ? '<i class="fas fa-lock-open"></i><span class="hidden lg:inline">Mở lại</span>'
            : '<i class="fas fa-lock"></i><span class="hidden lg:inline">Khóa</span>';
    }
    const tl = el('host-timer-label');
    if (tl) tl.textContent = s.timerSec ? `${s.timerSec}s` : 'Tắt';

    const mode = el('host-mode');
    if (mode) mode.textContent = coop ? 'Cùng làm' : 'Cầm trịch';
    const next = el('host-next');
    if (next) next.disabled = currentIndex() >= (s.questions?.length || 1) - 1;
    const focus = el('host-focus');
    if (focus) focus.classList.toggle('hidden', i === currentIndex());
}
