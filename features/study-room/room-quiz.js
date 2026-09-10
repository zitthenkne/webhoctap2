// room-quiz.js — điều khiển phiên đánh đề chung: nhập đề, bắt đầu, quyền chủ trì
// (chuyển câu / khóa / lộ đáp án / hẹn giờ / lưu / kết thúc) và phím tắt.
import {
    doc, getDoc, getDocs, setDoc, updateDoc, addDoc, collection, query, where, limit, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { db } from '../../core/firebase-init.js';
import { showToast, showConfirm } from '../../core/utils.js';
import { shuffleArray } from '../quiz/quiz-helpers.js';
import { parseFile } from '../../core/file-parser.js';
import {
    room, refs, uid, canControl, hasSession, currentIndex, optsOf, correctIdxOf, refIdxOf,
    noteOf, optNoteOf, chosenOf, questionAt, issueOf, isCoop, isShown, whyOf, dissentOf, talkUntil,
} from './room-state.js';
import { escapeHtml } from './room-ui.js';
import { answerCurrent, effectiveIndex, setViewIndex, followHost } from './room-quiz-stage.js';
import { questionStats } from './room-scoreboard.js';
import { systemMessage } from './room-chat.js';
import { renderLobby } from './room-lobby.js';

let draft = null;           // bộ đề vừa nạp, chưa phát cho phòng
const TIMER_STEPS = [0, 15, 30, 45, 60, 90];

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
        const { questions, report } = await parseFile(file);
        if (!questions.length) {
            el('quiz-question-count-info').textContent = 'Không có câu hợp lệ';
            showToast('Không tìm thấy câu hỏi hợp lệ trong file.', 'warning');
            return;
        }
        const extras = questions.filter(q => q.expanded || q.note).length;
        el('quiz-question-count-info').textContent = `· ${questions.length} câu${extras ? ` · ${extras} câu có mở rộng/ghi nhớ` : ''}`;
        if (report?.applied) showToast('Đã tự chữa vài lỗi soạn file trước khi mở đề.', 'info', 2600);
        draft = { questions, title: file.name.replace(/\.(xlsx|xls|csv)$/i, ''), fromLibrary: false };
        el('start-quiz-collaboration-btn').disabled = false;
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
    const timerSec = mode === 'lead' ? (Number(el('setup-timer').value) || 0) : 0;
    const questions = el('setup-shuffle').checked ? shuffleArray(draft.questions.slice()) : draft.questions;
    el('loading-overlay').classList.remove('hidden');
    try {
        // Xóa đáp án phiên trước của mọi người để bảng điểm bắt đầu từ 0
        await Promise.all(room.members.map(m => updateDoc(refs.member(m.uid),
            { answers: {}, flags: {}, marks: {}, ready: {}, unclear: {}, diff: {}, cursor: 0, hand: null }).catch(() => {})));
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
            locked: false, ended: false,
            pinnedNote: '',
            fromLibrary: !!draft.fromLibrary,
            sourceQuizId: draft.quizId || null,
            savedQuizId: null,
            startedAt: serverTimestamp(),
            startedAtMs: Date.now(),
        });
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
    systemMessage(`Chủ trì đã hiện đáp án tham khảo của câu ${i + 1}.`);
}

// 2) Chốt đáp án cuối — mở menu chọn: A/B/C/D, theo đa số, theo file, bỏ chốt
function chotMenuHtml() {
    const i = effectiveIndex();
    const q = questionAt(i);
    const opts = optsOf(q);
    const st = questionStats(i);
    const top = st.total ? st.counts.reduce((b, n, k) => (n > st.counts[b] ? k : b), 0) : null;
    const ref = refIdxOf(q);
    const cur = chosenOf(i);
    const letter = (k) => String.fromCharCode(65 + k);
    return `
        <p class="rm-label px-2 pt-1 pb-1.5">Chốt đáp án câu ${i + 1}</p>
        ${opts.map((_, k) => `<button data-chot="${k}" class="rm-menu-item ${cur === k ? 'is-active' : ''}">
            <span class="rm-menu-ic" style="background:var(--rm-accent-soft);color:var(--rm-accent)">${letter(k)}</span>
            Chốt ${letter(k)}${st.counts[k] ? ` · ${st.counts[k]} người chọn` : ''}</button>`).join('')}
        ${top !== null ? `<button data-chot="top" class="rm-menu-item"><span class="rm-menu-ic" style="background:#dcfce7;color:#16a34a"><i class="fas fa-users"></i></span>Theo đa số (${letter(top)})</button>` : ''}
        ${ref !== null ? `<button data-chot="ref" class="rm-menu-item"><span class="rm-menu-ic" style="background:#dbeafe;color:#2563eb"><i class="fas fa-file-lines"></i></span>Theo đáp án file (${letter(ref)})</button>` : ''}
        ${cur !== null ? '<button data-chot="none" class="rm-menu-item"><span class="rm-menu-ic" style="background:#fee2e2;color:#ef4444"><i class="fas fa-rotate-left"></i></span>Bỏ chốt câu này</button>' : ''}
        <button data-chot="revote" class="rm-menu-item"><span class="rm-menu-ic" style="background:#FFF3A8;color:#b45309"><i class="fas fa-repeat"></i></span>Bầu lại câu này</button>`;
}

async function chot(value) {
    if (value === 'revote') return revote();
    const i = effectiveIndex();
    const q = questionAt(i);
    const st = questionStats(i);
    let pick = null;
    if (value === 'top') pick = st.total ? st.counts.reduce((b, n, k) => (n > st.counts[b] ? k : b), 0) : null;
    else if (value === 'ref') pick = refIdxOf(q);
    else if (value === 'none') pick = null;
    else pick = Number(value);
    if (value !== 'none' && (pick === null || pick === undefined || isNaN(pick))) {
        showToast('Chưa có gì để chốt — chọn tay một phương án nhé.', 'warning');
        return;
    }
    await updateDoc(refs.session(), { [`chosen.q${i}`]: value === 'none' ? null : pick, [`shown.q${i}`]: true }).catch(() => {});
    if (value !== 'none') systemMessage(`Nhóm chốt câu ${i + 1}: ${String.fromCharCode(65 + pick)}.`);
}

// Bầu lại: giữ lại kết quả vòng trước để so, xóa lựa chọn của mọi người rồi bầu lượt mới
async function revote() {
    const i = effectiveIndex();
    const st = questionStats(i);
    if (!await showConfirm(`Bầu lại câu ${i + 1}? Lựa chọn hiện tại của mọi người sẽ được lưu làm "vòng trước" rồi xóa đi.`,
        { confirmText: 'Bầu lại', tone: 'warning' })) return;
    await updateDoc(refs.session(), {
        [`prevVote.q${i}`]: st.counts,
        [`chosen.q${i}`]: null,
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

// --- Biên bản buổi học: tải file .md để dán vào nhóm chat / lưu lại ---
function downloadMinutes() {
    const s = room.session;
    if (!s) return;
    const L = (k) => String.fromCharCode(65 + k);
    const lines = [`# Biên bản: ${s.quizTitle || 'Phiên đánh đề'}`,
        `Phòng \`${room.roomId}\` · ${new Date().toLocaleString('vi-VN')} · ${room.members.length} người`, ''];
    s.questions.forEach((_, i) => {
        const q = questionAt(i);
        const opts = optsOf(q);
        const chosen = chosenOf(i);
        const ref = refIdxOf(q);
        const st = questionStats(i);
        lines.push(`## Câu ${i + 1}. ${q.question || ''}`);
        opts.forEach((o, k) => {
            const people = room.members.filter(m => (m.answers?.['q' + i] || {}).i === k);
            const who = people.map(m => {
                const why = whyOf(m, i).replace(/<[^>]*>/g, '').trim();
                return (m.displayName || 'Khách') + (why ? ` (${why})` : '') + (dissentOf(m, i) ? ' [bảo lưu]' : '');
            });
            lines.push(`- ${L(k)}. ${String(o).replace(/<[^>]*>/g, '')}${chosen === k ? '  **(nhóm chốt)**' : ''}${ref === k ? '  *(đáp án file)*' : ''}${who.length ? `  — ${who.join(', ')}` : ''}`);
        });
        if (chosen !== null && ref !== null && chosen !== ref) lines.push(`> ⚠ Nhóm chốt ${L(chosen)} khác đáp án file ${L(ref)}.`);
        const exp = noteOf(i) || q.explanation || q.explain || '';
        if (exp) lines.push('', `**Giải thích:** ${exp}`);
        opts.forEach((_, k) => { const t = optNoteOf(i, k); if (t) lines.push(`- ${L(k)}: ${t}`); });
        const issue = issueOf(i);
        if (issue) lines.push('', `**Báo lỗi đề:** ${issue}`);
        const flagged = room.members.filter(m => m.flags?.['q' + i]).map(m => m.displayName || 'Khách');
        const unclear = room.members.filter(m => m.unclear?.['q' + i]).map(m => m.displayName || 'Khách');
        const keep = room.members.filter(m => m.dissent?.['q' + i]).map(m => m.displayName || 'Khách');
        if (keep.length) lines.push(`- ✋ Bảo lưu ý kiến: ${keep.join(', ')}`);
        if (flagged.length) lines.push(`- 🗣 Cần bàn thêm: ${flagged.join(', ')}`);
        if (unclear.length) lines.push(`- 🤔 Chưa hiểu: ${unclear.join(', ')}`);
        if (st.total) lines.push(`- Tỉ lệ chọn: ${st.counts.map((n, k) => `${L(k)} ${n}`).join(' · ')}`);
        const hard = room.members.filter(m => m.diff?.['q' + i] === 'hard').length;
        const easy = room.members.filter(m => m.diff?.['q' + i] === 'easy').length;
        if (hard || easy) lines.push(`- Nhóm chấm độ khó: 😵 khó ${hard} · 😌 dễ ${easy}`);
        const ex = s.explainer?.['q' + i];
        if (ex?.name) lines.push(`- 🎙 Người nhận giảng: ${ex.name}`);
        lines.push('');
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bien-ban-${room.roomId}-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    showToast('Đã tải biên bản buổi học.', 'success');
}

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
    systemMessage('Phiên đánh đề đã kết thúc — xem tổng kết nhé!');
}

async function restartSession() {
    if (!await showConfirm('Làm lại từ câu 1? Đáp án của mọi người sẽ được xóa.', { confirmText: 'Làm lại' })) return;
    await Promise.all(room.members.map(m => updateDoc(refs.member(m.uid), { answers: {}, flags: {} }).catch(() => {})));
    await updateDoc(refs.session(), {
        currentQuestionIndex: 0, ended: false, locked: false, chosen: {},
        qStarts: { q0: Date.now() },
        deadline: room.session?.timerSec ? Date.now() + room.session.timerSec * 1000 : null,
        startedAtMs: Date.now(),
    }).catch(() => {});
}

async function closeSession() {
    if (!await showConfirm('Đóng phiên và quay về màn chọn đề?', { confirmText: 'Đóng phiên' })) return;
    await setDoc(refs.session(), { questions: [] });
}

async function saveToLibrary() {
    const s = room.session;
    if (!s || !room.user || room.user.isAnonymous || room.user.isGuest) return showToast('Đăng nhập để lưu đề vào thư viện.', 'warning');
    const missing = s.questions.filter((q, i) => correctIdxOf(q, i) === null && refIdxOf(q) === null).length;
    const msg = missing
        ? `Còn ${missing} câu chưa có đáp án đúng. Vẫn lưu thành bộ đề MỚI chứ?`
        : 'Lưu thành bộ đề MỚI trong thư viện của bạn? (không đụng vào bộ đề gốc)';
    if (!await showConfirm(msg, { confirmText: 'Lưu bản mới' })) return;

    el('loading-overlay').classList.remove('hidden');
    try {
        // Quy ước answers/correctAnswerIndex (0-based) để trang quiz.html đọc được
        const payload = {
            questionCount: s.questions.length,
            questions: s.questions.map((_, i) => {
                const q = questionAt(i);            // bản đã được nhóm sửa (nếu có)
                const opts = optsOf(q);
                const optExp = opts.map((_, k) => optNoteOf(i, k) || (q.optionExplanations && q.optionExplanations[k]) || '');
                return {
                    ...q,
                    question: q.question,
                    answers: opts,
                    correctAnswerIndex: correctIdxOf(q, i) ?? refIdxOf(q),
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

// ---------- Phím tắt ----------
function onKey(e) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (!hasSession()) return;
    const s = room.session;
    if (/^[1-9]$/.test(e.key)) { answerCurrent(Number(e.key) - 1); return; }
    if (/^[a-dA-D]$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
        const idx = e.key.toLowerCase().charCodeAt(0) - 97;
        if (canControl() && e.shiftKey) updateDoc(refs.session(), { [`chosen.q${effectiveIndex()}`]: idx }).catch(() => {});
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
    el('start-quiz-collaboration-btn')?.addEventListener('click', startSession);
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
    el('host-minutes')?.addEventListener('click', downloadMinutes);
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
        if (e.target.closest('#result-minutes-btn')) downloadMinutes();
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

    const show = el('host-show');
    if (show) {
        show.classList.toggle('done', shown);
        show.querySelector('span').textContent = shown ? 'Đã hiện đáp án' : 'Hiện đáp án';
    }
    const lockBtn = el('host-lock-answer');
    if (lockBtn) lockBtn.querySelector('span').textContent =
        chosen !== null ? `Đã chốt ${String.fromCharCode(65 + chosen)}` : 'Chốt đáp án';

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
