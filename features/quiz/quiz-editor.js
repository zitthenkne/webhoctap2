// features/quiz/quiz-editor.js
//
// CHỈNH SỬA CÂU HỎI NGAY TRONG GIAO DIỆN LÀM BÀI
// - Cho phép sửa: đáp án (nội dung + đáp án đúng), giải thích từng phương án,
//   giải thích chung, ghi chú ghi nhớ, mở rộng kiến thức.
// - Lưu: nếu là CHỦ bộ đề -> ghi thẳng vào Firestore (mọi người đều thấy);
//        nếu không -> lưu override cục bộ trên thiết bị này (localStorage).
// - Có nút "Hoàn tác" sau khi lưu để khôi phục nguyên trạng (nội dung + kết quả + nơi lưu).
//
// Module tách riêng khỏi quiz-page.js để giảm kích thước file và dễ bảo trì.
// quiz-page.js cung cấp hàm render lại (showQuestion) qua setupQuestionEditor().

import { db, auth } from '../../core/firebase-init.js';
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { showToast } from '../../core/utils.js';
import { state, saveQuizState } from './quiz-state.js';

// Các trường của một câu hỏi mà trình sửa được phép thay đổi (dùng cho cả lưu lẫn hoàn tác).
const EDIT_FIELDS = ['question', 'answers', 'options', 'correctAnswerIndex', 'optionExplanations', 'note', 'explanation', 'expanded'];

// Hàm render lại câu hỏi hiện tại (được tiêm vào từ quiz-page.js).
let _rerender = () => {};

// Bản chụp gần nhất để phục vụ "Hoàn tác".
let _lastEditSnapshot = null;

/* ----------------------------------------------------------------
   Lưu trữ chỉnh sửa cục bộ (localStorage), theo từng bộ đề.
   ---------------------------------------------------------------- */
function qeditsKey() {
    const quizId = (state.quizData && state.quizData.id) || (new URLSearchParams(window.location.search)).get('id') || 'default_quiz';
    return `quiz_qedits_${quizId}`;
}
function getQEdits() {
    try { return JSON.parse(localStorage.getItem(qeditsKey()) || '{}'); } catch (e) { return {}; }
}
function saveQEdits(store) {
    try { localStorage.setItem(qeditsKey(), JSON.stringify(store)); } catch (e) {}
}

// Gộp các chỉnh sửa cục bộ (theo chỉ số gốc) vào dữ liệu câu hỏi vừa tải.
export function applyLocalQuestionEdits() {
    if (!state.quizData || !Array.isArray(state.quizData.questions)) return;
    const edits = getQEdits();
    Object.keys(edits).forEach(k => {
        const idx = parseInt(k, 10);
        if (!isNaN(idx) && state.quizData.questions[idx] && edits[k] && typeof edits[k] === 'object') {
            Object.assign(state.quizData.questions[idx], edits[k]);
        }
    });
}

// Tìm chỉ số của câu hỏi trong dữ liệu gốc (để lưu đúng câu kể cả khi đã trộn).
function getQuestionOrigIdx(q) {
    if (q && typeof q.__origIdx === 'number') return q.__origIdx;
    const arr = (state.quizData && state.quizData.questions) || [];
    let idx = arr.indexOf(q);
    if (idx >= 0) return idx;
    if (q && q.question) idx = arr.findIndex(x => x && x.question === q.question);
    return idx; // có thể là -1 nếu không xác định được
}

// Bỏ các trường nội bộ (tiền tố __) trước khi ghi lên Firestore.
function stripInternalFields(q) {
    const clone = { ...q };
    Object.keys(clone).forEach(k => { if (k.indexOf('__') === 0) delete clone[k]; });
    return clone;
}

// Chụp lại các trường có thể sửa của một câu hỏi (giữ cả khi giá trị là undefined).
function snapshotFields(q) {
    const snap = {};
    EDIT_FIELDS.forEach(f => { snap[f] = q ? q[f] : undefined; });
    return snap;
}
// Khôi phục các trường đã chụp; trường vốn không tồn tại sẽ bị xóa lại cho đúng nguyên trạng.
function restoreFields(q, snap) {
    if (!q || !snap) return;
    EDIT_FIELDS.forEach(f => {
        if (snap[f] === undefined) delete q[f];
        else q[f] = snap[f];
    });
}

/* ----------------------------------------------------------------
   Modal: trạng thái + tiện ích.
   ---------------------------------------------------------------- */
let _qeOptions = []; // [{ text, exp, correct }] trạng thái phương án trong modal

function qeEl(id) { return document.getElementById(id); }

// Tự giãn chiều cao textarea theo nội dung cho dễ nhìn.
function autoGrow(el) {
    if (!el) return;
    const fit = () => { el.style.height = 'auto'; el.style.height = Math.max(el.scrollHeight, 34) + 'px'; };
    el.addEventListener('input', fit);
    requestAnimationFrame(fit);
}

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
}

function renderQEOptions() {
    const wrap = qeEl('qe-options');
    if (!wrap) return;
    wrap.innerHTML = _qeOptions.map((o, i) => `
        <div class="qe-opt-row${o.correct ? ' is-correct' : ''}" data-idx="${i}">
            <div class="qe-opt-head">
                <button type="button" class="qe-opt-mark" data-mark="${i}" title="Chọn làm đáp án đúng" aria-pressed="${o.correct ? 'true' : 'false'}">
                    <span class="qe-opt-letter">${String.fromCharCode(65 + i)}</span>
                    <i class="fas fa-check qe-opt-check"></i>
                </button>
                <input type="text" class="qe-opt-text" placeholder="Nội dung phương án ${String.fromCharCode(65 + i)}" value="${escapeAttr(o.text)}">
                <span class="qe-opt-badge"><i class="fas fa-circle-check"></i> Đáp án đúng</span>
                <button type="button" class="qe-opt-remove" data-remove="${i}" title="Xóa phương án"><i class="fas fa-trash-can"></i></button>
            </div>
            <div class="qe-opt-exp-wrap">
                <i class="fas fa-comment-dots qe-opt-exp-ic"></i>
                <textarea class="qe-opt-exp qe-grow" rows="1" placeholder="Giải thích vì sao ${o.correct ? 'đúng' : 'sai'}… (tùy chọn)">${escapeHtml(o.exp)}</textarea>
            </div>
        </div>
    `).join('');

    wrap.querySelectorAll('.qe-opt-mark').forEach(btn => {
        btn.addEventListener('click', () => {
            collectQEOptions();
            const i = parseInt(btn.dataset.mark, 10);
            _qeOptions.forEach((o, j) => o.correct = (j === i));
            renderQEOptions();
        });
    });
    wrap.querySelectorAll('.qe-opt-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            if (_qeOptions.length <= 2) { showToast('Cần giữ ít nhất 2 phương án.', 'error'); return; }
            collectQEOptions();
            const i = parseInt(btn.dataset.remove, 10);
            _qeOptions.splice(i, 1);
            if (!_qeOptions.some(o => o.correct)) _qeOptions[0].correct = true;
            renderQEOptions();
        });
    });
    wrap.querySelectorAll('.qe-grow').forEach(autoGrow);
}

// Đọc giá trị hiện tại từ DOM về mảng _qeOptions (giữ khi thêm/xóa dòng).
function collectQEOptions() {
    const wrap = qeEl('qe-options');
    if (!wrap) return _qeOptions;
    const rows = Array.from(wrap.querySelectorAll('.qe-opt-row'));
    _qeOptions = rows.map(row => ({
        text: row.querySelector('.qe-opt-text').value,
        exp: row.querySelector('.qe-opt-exp').value,
        correct: row.classList.contains('is-correct')
    }));
    return _qeOptions;
}

export function openQuestionEditor() {
    const q = state.questions[state.currentIndex];
    if (!q) return;
    const modal = qeEl('question-editor-modal');
    if (!modal) return;

    const opts = (q.answers || q.options || []);
    _qeOptions = opts.map((t, i) => ({
        text: t == null ? '' : String(t),
        exp: (q.optionExplanations && q.optionExplanations[i] != null) ? String(q.optionExplanations[i]) : '',
        correct: i === q.correctAnswerIndex
    }));
    if (!_qeOptions.some(o => o.correct) && _qeOptions.length) _qeOptions[0].correct = true;

    qeEl('qe-question').value = q.question == null ? '' : String(q.question);
    qeEl('qe-note').value = q.note == null ? '' : String(q.note);
    qeEl('qe-explanation').value = q.explanation == null ? '' : String(q.explanation);
    qeEl('qe-expanded').value = q.expanded == null ? '' : String(q.expanded);

    // Cho biết nơi lưu (đám mây nếu là chủ bộ đề, ngược lại lưu cục bộ)
    const user = auth.currentUser;
    const isOwner = !!(user && state.quizData && state.quizData.userId === user.uid);
    const hint = qeEl('qe-save-hint');
    if (hint) {
        hint.className = 'qe-save-hint ' + (isOwner ? 'is-cloud' : 'is-local');
        hint.innerHTML = isOwner
            ? '<i class="fas fa-cloud-arrow-up"></i> <span>Bạn là chủ bộ đề — chỉnh sửa sẽ lưu vĩnh viễn cho mọi người.</span>'
            : '<i class="fas fa-mobile-screen"></i> <span>Chỉnh sửa sẽ được lưu riêng trên thiết bị này.</span>';
    }

    // Hiện modal TRƯỚC rồi mới render để textarea tính được chiều cao tự giãn
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    renderQEOptions();
    modal.querySelectorAll('.qe-section > .qe-grow').forEach(autoGrow);
    setTimeout(() => { const f = qeEl('qe-question'); if (f) f.focus(); }, 50);
}

function closeQuestionEditor() {
    const modal = qeEl('question-editor-modal');
    if (modal) modal.classList.add('hidden');
    document.body.style.overflow = '';
}

async function saveQuestionEditor() {
    collectQEOptions();
    const cleaned = _qeOptions.map(o => ({ text: (o.text || '').trim(), exp: o.exp, correct: o.correct }))
                              .filter(o => o.text !== '');
    if (cleaned.length < 2) { showToast('Cần ít nhất 2 phương án có nội dung.', 'error'); return; }
    let correctIdx = cleaned.findIndex(o => o.correct);
    if (correctIdx < 0) { showToast('Hãy chọn một đáp án đúng.', 'error'); return; }

    const optionTexts = cleaned.map(o => o.text);
    const optionExps = cleaned.map(o => (o.exp == null ? '' : String(o.exp)));

    const edited = {
        question: qeEl('qe-question').value,
        answers: optionTexts.slice(),
        options: optionTexts.slice(),
        correctAnswerIndex: correctIdx,
        optionExplanations: optionExps,
        note: qeEl('qe-note').value,
        explanation: qeEl('qe-explanation').value,
        expanded: qeEl('qe-expanded').value
    };

    const idx = state.currentIndex;
    const dq = state.questions[idx];
    const origIdx = getQuestionOrigIdx(dq);

    // === Chụp lại nguyên trạng TRƯỚC khi sửa để phục vụ Hoàn tác ===
    const prevAns = state.userAnswers[idx];
    const snapshot = {
        idx,
        origIdx,
        prevDisplayed: snapshotFields(dq),
        prevCanonical: (origIdx >= 0 && state.quizData && state.quizData.questions[origIdx])
            ? snapshotFields(state.quizData.questions[origIdx]) : null,
        prevAnswer: prevAns,
        prevScore: state.score,
        prevEliminated: state.eliminatedAnswers[idx],
        prev5050: state.used5050Questions[idx],
        prevLocalOverride: (origIdx >= 0) ? getQEdits()[origIdx] : undefined,
        savedTo: null // 'cloud' | 'local' | 'session' — điền sau khi lưu
    };

    // Nếu trước đó đã trả lời câu này: bỏ kết quả cũ để tránh tô màu/điểm lệch sau khi sửa.
    if (prevAns !== null && prevAns !== undefined) {
        if (prevAns === dq.correctAnswerIndex) state.score = Math.max(0, state.score - 1);
        state.userAnswers[idx] = null;
        delete state.eliminatedAnswers[idx];
        delete state.used5050Questions[idx];
    }

    // Cập nhật câu đang hiển thị + câu trong dữ liệu gốc.
    Object.assign(dq, edited);
    if (origIdx >= 0 && state.quizData && state.quizData.questions[origIdx]) {
        Object.assign(state.quizData.questions[origIdx], edited);
    }

    saveQuizState();
    closeQuestionEditor();
    _rerender();

    // Lưu lâu dài: Firestore nếu là chủ, ngược lại lưu cục bộ.
    const user = auth.currentUser;
    const isOwner = !!(user && state.quizData && state.quizData.userId === user.uid);
    let savedMsg = 'Đã áp dụng cho phiên làm bài này.';
    if (isOwner) {
        try {
            const cleanQuestions = state.quizData.questions.map(stripInternalFields);
            await updateDoc(doc(db, "quiz_sets", state.quizData.id), { questions: cleanQuestions });
            // Chỉnh sửa đã lên đám mây -> không cần override cục bộ cho câu này nữa.
            if (origIdx >= 0) {
                const store = getQEdits();
                if (store[origIdx]) { delete store[origIdx]; saveQEdits(store); }
            }
            snapshot.savedTo = 'cloud';
            savedMsg = 'Đã lưu chỉnh sửa vào bộ đề (đồng bộ đám mây).';
        } catch (e) {
            console.error('Lưu Firestore thất bại, chuyển sang lưu cục bộ:', e);
        }
    }

    if (snapshot.savedTo !== 'cloud') {
        if (origIdx >= 0) {
            const store = getQEdits();
            store[origIdx] = stripInternalFields(edited);
            saveQEdits(store);
            snapshot.savedTo = 'local';
            savedMsg = 'Đã lưu chỉnh sửa trên thiết bị này.';
        } else {
            snapshot.savedTo = 'session';
        }
    }

    _lastEditSnapshot = snapshot;
    showUndoSnackbar(savedMsg);
}

/* ----------------------------------------------------------------
   Hoàn tác (Undo) chỉnh sửa gần nhất.
   ---------------------------------------------------------------- */
async function undoLastEdit() {
    const snap = _lastEditSnapshot;
    if (!snap) return;
    _lastEditSnapshot = null;
    hideUndoSnackbar();

    // 1) Khôi phục nội dung câu hỏi (hiển thị + dữ liệu gốc)
    const dq = state.questions[snap.idx];
    restoreFields(dq, snap.prevDisplayed);
    if (snap.origIdx >= 0 && state.quizData && state.quizData.questions[snap.origIdx]) {
        restoreFields(state.quizData.questions[snap.origIdx], snap.prevCanonical);
    }

    // 2) Khôi phục kết quả/điểm/trạng thái trả lời của câu
    state.userAnswers[snap.idx] = snap.prevAnswer;
    state.score = snap.prevScore;
    if (snap.prevEliminated === undefined) delete state.eliminatedAnswers[snap.idx];
    else state.eliminatedAnswers[snap.idx] = snap.prevEliminated;
    if (snap.prev5050 === undefined) delete state.used5050Questions[snap.idx];
    else state.used5050Questions[snap.idx] = snap.prev5050;

    saveQuizState();

    // 3) Khôi phục override cục bộ (nếu trước đó có)
    if (snap.origIdx >= 0) {
        const store = getQEdits();
        if (snap.prevLocalOverride === undefined) delete store[snap.origIdx];
        else store[snap.origIdx] = snap.prevLocalOverride;
        saveQEdits(store);
    }

    // 4) Nếu đã lưu lên đám mây thì ghi lại bản trước đó
    if (snap.savedTo === 'cloud' && state.quizData) {
        try {
            const cleanQuestions = state.quizData.questions.map(stripInternalFields);
            await updateDoc(doc(db, "quiz_sets", state.quizData.id), { questions: cleanQuestions });
        } catch (e) {
            console.error('Hoàn tác trên đám mây thất bại:', e);
            showToast('Không thể hoàn tác trên đám mây. Vui lòng thử lại.', 'error');
        }
    }

    _rerender();
    showToast('Đã hoàn tác chỉnh sửa.', 'info');
}

let _undoTimer = null;
function hideUndoSnackbar() {
    const bar = document.getElementById('qe-undo-snackbar');
    if (bar) bar.remove();
    if (_undoTimer) { clearTimeout(_undoTimer); _undoTimer = null; }
}
function showUndoSnackbar(message) {
    hideUndoSnackbar();
    const bar = document.createElement('div');
    bar.id = 'qe-undo-snackbar';
    bar.className = 'qe-undo-snackbar';
    bar.innerHTML = `
        <span class="qe-undo-msg"><i class="fas fa-check-circle"></i> ${escapeHtml(message)}</span>
        <button type="button" class="qe-undo-btn"><i class="fas fa-rotate-left"></i> Hoàn tác</button>
    `;
    document.body.appendChild(bar);
    requestAnimationFrame(() => bar.classList.add('show'));
    bar.querySelector('.qe-undo-btn').addEventListener('click', undoLastEdit);
    _undoTimer = setTimeout(hideUndoSnackbar, 7000);
}

// Nối các nút của modal chỉnh sửa (gọi một lần khi tải trang).
// rerenderFn: hàm vẽ lại câu hỏi hiện tại (showQuestion từ quiz-page.js).
export function setupQuestionEditor(rerenderFn) {
    if (typeof rerenderFn === 'function') _rerender = rerenderFn;
    const modal = qeEl('question-editor-modal');
    if (!modal) return;
    const closeBtn = qeEl('qe-close-btn');
    const cancelBtn = qeEl('qe-cancel-btn');
    const saveBtn = qeEl('qe-save-btn');
    const addBtn = qeEl('qe-add-option');
    if (closeBtn) closeBtn.addEventListener('click', closeQuestionEditor);
    if (cancelBtn) cancelBtn.addEventListener('click', closeQuestionEditor);
    if (saveBtn) saveBtn.addEventListener('click', saveQuestionEditor);
    if (addBtn) addBtn.addEventListener('click', () => {
        collectQEOptions();
        if (_qeOptions.length >= 8) { showToast('Tối đa 8 phương án.', 'error'); return; }
        _qeOptions.push({ text: '', exp: '', correct: _qeOptions.length === 0 });
        renderQEOptions();
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) closeQuestionEditor(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeQuestionEditor();
    });
}
