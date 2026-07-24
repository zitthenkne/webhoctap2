// manual-quiz.js — Trình tạo trắc nghiệm thủ công (Claymorphism Toyland)
// State machine: render từ quizData, event delegation, validation debounce 150ms,
// undo stack 5s cho mọi thao tác xóa, keyboard ninja controller.

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('manualQuizForm');
    const questionsContainer = document.getElementById('questionsContainer');
    const titleInput = document.getElementById('quizTitle');
    const countBadge = document.getElementById('question-count-badge');
    const healthStatus = document.getElementById('health-status-text');
    const warningsList = document.getElementById('validation-warnings-list');
    const toastContainer = document.getElementById('toast-container');

    const quizData = { title: '', questions: [] };
    const undoStack = [];
    let enterIdx = -1; // câu vừa thêm -> animation card-enter

    const motionOK = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scrollBehavior = motionOK ? 'smooth' : 'auto';

    const esc = s => String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    function blankQuestion() {
        return { question: '', options: ['', ''], optionExplanations: ['', ''], answer: 0, explanation: '' };
    }

    // ===== Render =====

    function optionHTML(q, idx, oidx) {
        const isCorrect = q.answer === oidx;
        const optExp = q.optionExplanations[oidx] || '';
        const letter = String.fromCharCode(65 + oidx);
        const expPlaceholder = isCorrect
            ? 'Giải thích tại sao đáp án này ĐÚNG (tùy chọn)'
            : 'Giải thích tại sao đáp án này SAI / Phương án nhiễu (tùy chọn)';
        return `
        <div class="option-clay-item flex flex-col gap-2 p-3.5 bg-white/80 rounded-2xl border border-pink-100 shadow-sm transition-[border-color,box-shadow] duration-200 focus-within:border-[var(--accent-primary)] focus-within:shadow-md" data-oidx="${oidx}">
            <div class="flex items-center gap-3">
                <span class="relative flex items-center justify-center shrink-0">
                    <input type="radio" id="correct-${idx}-${oidx}" name="correct-${idx}" class="correct-radio sr-only" ${isCorrect ? 'checked' : ''} title="Chọn là đáp án đúng" />
                    <label for="correct-${idx}-${oidx}" class="clay-radio" title="Chọn là đáp án đúng" aria-label="Chọn là đáp án đúng">
                        <i class="fas fa-check" aria-hidden="true"></i>
                    </label>
                </span>
                <span class="answer-wrap relative flex flex-1 min-w-0">
                    <input type="text" class="answer-input clay-input flex-1 min-w-0 px-3.5 py-2.5 text-sm font-semibold" placeholder="Đáp án ${letter}" value="${esc(q.options[oidx])}" required />
                </span>
                <button type="button" class="delete-answer-btn clay-btn-secondary clay-icon-btn p-2 text-xs text-[var(--accent-danger)] rounded-lg flex items-center justify-center shrink-0" title="Xóa đáp án này" aria-label="Xóa đáp án này">
                    <i class="fas fa-times" aria-hidden="true"></i>
                </button>
            </div>
            <div class="pl-10 pr-2 pt-1">
                <div class="relative flex items-center">
                    <i class="fas fa-lightbulb absolute left-3 text-xs pointer-events-none ${isCorrect ? 'text-[var(--accent-success)]' : 'text-[var(--text-secondary)]/50'}" aria-hidden="true"></i>
                    <input type="text" class="option-exp-input clay-input w-full pl-8 pr-3 py-2 text-xs font-medium bg-pink-50/40" value="${esc(optExp)}" placeholder="${expPlaceholder}" />
                </div>
            </div>
        </div>`;
    }

    function questionHTML(q, idx) {
        const last = quizData.questions.length - 1;
        return `
        <header class="flex items-center justify-between gap-2 pb-3 border-b border-pink-100">
            <div class="flex items-center gap-3 flex-wrap min-w-0">
                <span id="q-title-label-${idx}" class="q-number font-display font-extrabold text-[var(--accent-primary)] bg-pink-100 px-3.5 py-1 rounded-full border border-pink-200 whitespace-nowrap">Câu hỏi ${idx + 1}</span>
                <div class="question-warning-container flex items-center gap-1.5 flex-wrap"></div>
            </div>
            <div role="group" aria-label="Điều hướng và thao tác câu hỏi" class="flex items-center gap-1.5 shrink-0">
                <button type="button" class="move-up-btn clay-btn-secondary clay-icon-btn p-2 text-xs text-[var(--text-secondary)] rounded-lg flex items-center justify-center" title="Di chuyển câu hỏi lên trên (Alt + Up)" aria-label="Di chuyển câu hỏi lên trên (Alt + Up)" ${idx === 0 ? 'disabled' : ''}>
                    <i class="fas fa-arrow-up" aria-hidden="true"></i>
                </button>
                <button type="button" class="move-down-btn clay-btn-secondary clay-icon-btn p-2 text-xs text-[var(--text-secondary)] rounded-lg flex items-center justify-center" title="Di chuyển câu hỏi xuống dưới (Alt + Down)" aria-label="Di chuyển câu hỏi xuống dưới (Alt + Down)" ${idx === last ? 'disabled' : ''}>
                    <i class="fas fa-arrow-down" aria-hidden="true"></i>
                </button>
                <button type="button" class="delete-question-btn clay-btn-secondary clay-icon-btn p-2 text-xs text-[var(--accent-danger)] rounded-lg flex items-center justify-center ml-1" title="Xóa câu hỏi này" aria-label="Xóa câu hỏi này">
                    <i class="fas fa-trash" aria-hidden="true"></i>
                </button>
            </div>
        </header>
        <div class="flex flex-col gap-1.5">
            <label for="q-input-${idx}" class="sr-only">Nội dung câu hỏi ${idx + 1}</label>
            <input type="text" id="q-input-${idx}" class="question-title clay-input w-full px-4 py-3 text-base font-bold placeholder-[var(--text-secondary)]/50" placeholder="Nhập nội dung câu hỏi hoặc tình huống lâm sàng..." value="${esc(q.question)}" required />
        </div>
        <fieldset class="options-fieldset flex flex-col gap-3.5 mt-1 border-0 p-0 m-0">
            <legend class="sr-only">Danh sách các đáp án cho câu hỏi ${idx + 1}</legend>
            ${q.options.map((_, oidx) => optionHTML(q, idx, oidx)).join('')}
        </fieldset>
        <footer class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-pink-100/60 mt-1">
            <button type="button" class="add-answer-btn clay-btn-secondary clay-icon-btn px-4 py-2.5 bg-pink-50 text-[var(--accent-primary)] font-bold text-xs rounded-xl flex items-center justify-center gap-2 self-start">
                <i class="fas fa-plus" aria-hidden="true"></i> <span>Thêm đáp án</span>
            </button>
            <div class="flex-1 sm:max-w-md">
                <textarea class="explanation-input clay-input w-full px-3.5 py-2 text-xs font-medium rounded-xl resize-y min-h-[44px]" rows="1" placeholder="Giải thích chi tiết cho toàn bộ câu hỏi (không bắt buộc - gợi ý lâm sàng/giáo trình)...">${esc(q.explanation)}</textarea>
            </div>
        </footer>`;
    }

    function renderQuestions() {
        // đảm bảo optionExplanations luôn song song với options
        quizData.questions.forEach(q => {
            if (!Array.isArray(q.optionExplanations)) q.optionExplanations = [];
            while (q.optionExplanations.length < q.options.length) q.optionExplanations.push('');
        });

        const frag = document.createDocumentFragment();
        quizData.questions.forEach((q, idx) => {
            const card = document.createElement('article');
            card.className = 'question-clay-card clay-card p-6 flex flex-col gap-5 transition-[box-shadow,border-color] duration-300'
                + (idx === enterIdx ? ' card-enter' : '');
            card.setAttribute('role', 'listitem');
            card.setAttribute('aria-labelledby', `q-title-label-${idx}`);
            card.dataset.idx = idx;
            card.innerHTML = questionHTML(q, idx);
            frag.appendChild(card);
        });
        questionsContainer.replaceChildren(frag);
        enterIdx = -1;
        countBadge.textContent = `Tổng số câu: ${quizData.questions.length}`;
        validateQuizHealth();
    }

    // ===== Focus helpers =====

    function cardEl(idx) {
        return questionsContainer.querySelector(`[data-idx="${idx}"]`);
    }

    function describeActiveField() {
        const el = document.activeElement;
        const card = el && el.closest ? el.closest('.question-clay-card') : null;
        if (!card) return null;
        const kinds = ['question-title', 'answer-input', 'option-exp-input', 'explanation-input', 'correct-radio'];
        const kind = kinds.find(k => el.classList.contains(k));
        if (!kind) return null;
        const row = el.closest('[data-oidx]');
        return {
            idx: Number(card.dataset.idx),
            kind,
            oidx: row ? Number(row.dataset.oidx) : 0,
            selStart: el.selectionStart, selEnd: el.selectionEnd
        };
    }

    function focusField(desc) {
        if (!desc) return;
        const card = cardEl(desc.idx);
        if (!card) return;
        let el;
        if (desc.kind === 'question-title' || desc.kind === 'explanation-input') {
            el = card.querySelector('.' + desc.kind);
        } else {
            const row = card.querySelector(`[data-oidx="${desc.oidx}"]`);
            el = row && row.querySelector('.' + desc.kind);
        }
        if (!el) return;
        el.focus();
        if (typeof desc.selStart === 'number' && el.setSelectionRange) {
            try { el.setSelectionRange(desc.selStart, desc.selEnd); } catch (e) { /* radio */ }
        }
    }

    // Bàn phím ảo mobile che input: cuộn thẻ vào giữa màn hình
    form.addEventListener('focusin', e => {
        if (!window.matchMedia('(max-width: 1023px)').matches) return;
        if (!e.target.matches('input[type="text"], textarea')) return;
        const card = e.target.closest('.question-clay-card');
        if (card) card.scrollIntoView({ behavior: scrollBehavior, block: 'center' });
    });

    // ===== Toast system =====

    function showToast(message, { type = 'success', actionLabel = null, onAction = null, duration = 5000 } = {}) {
        const toast = document.createElement('output');
        toast.className = `clay-toast toast-${type} flex items-center gap-3 px-4 py-3 text-sm font-semibold text-[var(--text-primary)]`;
        const msg = document.createElement('span');
        msg.className = 'flex-1 min-w-0';
        msg.textContent = message;
        toast.appendChild(msg);

        let timer;
        const dismiss = () => {
            clearTimeout(timer);
            toast.classList.add('toast-leave');
            toast.addEventListener('animationend', () => toast.remove(), { once: true });
            if (!motionOK) toast.remove();
        };

        if (actionLabel) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'clay-undo-btn clay-btn-primary shrink-0 px-4 py-2 text-xs font-bold text-white';
            btn.textContent = actionLabel;
            btn.addEventListener('click', () => { onAction && onAction(); dismiss(); });
            toast.appendChild(btn);
        }

        toastContainer.appendChild(toast);
        timer = setTimeout(() => { toast.dispatchEvent(new CustomEvent('toast-expire')); dismiss(); }, duration);
        return { el: toast, dismiss };
    }

    // ===== Undo Recovery Engine =====

    function pushUndo(entry, toastMessage, undoLabel) {
        const toast = showToast(toastMessage, {
            type: 'danger',
            actionLabel: undoLabel,
            onAction: () => restoreEntry(entry)
        });
        entry.toast = toast;
        undoStack.push(entry);
        toast.el.addEventListener('toast-expire', () => {
            const i = undoStack.indexOf(entry);
            if (i !== -1) undoStack.splice(i, 1); // hết 5s -> xóa vĩnh viễn
        });
    }

    function restoreEntry(entry) {
        const i = undoStack.indexOf(entry);
        if (i === -1) return;
        undoStack.splice(i, 1);
        let flashIdx;
        if (entry.type === 'question') {
            quizData.questions.splice(entry.idx, 0, entry.question);
            flashIdx = entry.idx;
        } else {
            const q = quizData.questions[entry.qIdx];
            if (!q) return;
            q.options = entry.snapshot.options;
            q.optionExplanations = entry.snapshot.optionExplanations;
            q.answer = entry.snapshot.answer;
            flashIdx = entry.qIdx;
        }
        renderQuestions();
        const card = cardEl(flashIdx);
        if (card) {
            card.classList.add('flash-restored');
            card.addEventListener('animationend', () => card.classList.remove('flash-restored'), { once: true });
            card.scrollIntoView({ behavior: scrollBehavior, block: 'center' });
        }
    }

    function undoLast() {
        const entry = undoStack[undoStack.length - 1];
        if (!entry) return false;
        entry.toast.dismiss();
        restoreEntry(entry);
        return true;
    }

    // ===== Mutations =====

    function addQuestion() {
        quizData.questions.push(blankQuestion());
        enterIdx = quizData.questions.length - 1;
        const newIdx = enterIdx;
        renderQuestions();
        const card = cardEl(newIdx);
        if (card) {
            card.scrollIntoView({ behavior: scrollBehavior, block: 'center' });
            card.querySelector('.question-title').focus();
        }
    }

    function moveQuestion(idx, dir) {
        const to = idx + dir;
        if (to < 0 || to >= quizData.questions.length) return;
        const desc = describeActiveField();
        [quizData.questions[idx], quizData.questions[to]] = [quizData.questions[to], quizData.questions[idx]];
        renderQuestions();
        if (desc && desc.idx === idx) { desc.idx = to; focusField(desc); }
        const card = cardEl(to);
        if (card) card.scrollIntoView({ behavior: scrollBehavior, block: 'nearest' });
    }

    function deleteQuestion(idx) {
        const [removed] = quizData.questions.splice(idx, 1);
        renderQuestions();
        pushUndo(
            { type: 'question', idx, question: removed },
            `🗑️ Đã xóa Câu hỏi ${idx + 1}.`,
            'Hoàn tác (Undo)'
        );
    }

    function deleteOption(qIdx, oidx) {
        const q = quizData.questions[qIdx];
        if (q.options.length <= 2) {
            showToast('Mỗi câu hỏi cần ít nhất 2 đáp án!', { type: 'warning', duration: 3000 });
            return;
        }
        const snapshot = {
            options: q.options.slice(),
            optionExplanations: q.optionExplanations.slice(),
            answer: q.answer
        };
        q.options.splice(oidx, 1);
        q.optionExplanations.splice(oidx, 1);
        if (q.answer === oidx) q.answer = 0;
        else if (q.answer > oidx) q.answer -= 1;
        renderQuestions();
        pushUndo(
            { type: 'option', qIdx, snapshot },
            `🗑️ Đã xóa Đáp án ${String.fromCharCode(65 + oidx)}.`,
            'Hoàn tác'
        );
    }

    function addOption(qIdx) {
        const q = quizData.questions[qIdx];
        q.options.push('');
        q.optionExplanations.push('');
        renderQuestions();
        focusField({ idx: qIdx, kind: 'answer-input', oidx: q.options.length - 1 });
    }

    // ===== Event delegation =====

    questionsContainer.addEventListener('click', e => {
        const card = e.target.closest('.question-clay-card');
        if (!card) return;
        const idx = Number(card.dataset.idx);
        const btn = e.target.closest('button');
        if (!btn || btn.disabled) return;
        if (btn.classList.contains('move-up-btn')) {
            moveQuestion(idx, -1);
            const c = cardEl(idx - 1); if (c) c.querySelector('.move-up-btn').focus();
        }
        else if (btn.classList.contains('move-down-btn')) {
            moveQuestion(idx, 1);
            const c = cardEl(idx + 1); if (c) c.querySelector('.move-down-btn').focus();
        }
        else if (btn.classList.contains('delete-question-btn')) deleteQuestion(idx);
        else if (btn.classList.contains('add-answer-btn')) addOption(idx);
        else if (btn.classList.contains('delete-answer-btn')) {
            const row = e.target.closest('[data-oidx]');
            if (row) deleteOption(idx, Number(row.dataset.oidx));
        }
    });

    questionsContainer.addEventListener('input', e => {
        const card = e.target.closest('.question-clay-card');
        if (!card) return;
        const q = quizData.questions[Number(card.dataset.idx)];
        const row = e.target.closest('[data-oidx]');
        const oidx = row ? Number(row.dataset.oidx) : -1;
        if (e.target.classList.contains('question-title')) q.question = e.target.value;
        else if (e.target.classList.contains('answer-input')) q.options[oidx] = e.target.value;
        else if (e.target.classList.contains('option-exp-input')) q.optionExplanations[oidx] = e.target.value;
        else if (e.target.classList.contains('explanation-input')) q.explanation = e.target.value;
        validateSoon();
    });

    questionsContainer.addEventListener('change', e => {
        if (!e.target.classList.contains('correct-radio')) return;
        const card = e.target.closest('.question-clay-card');
        const row = e.target.closest('[data-oidx]');
        if (!card || !row) return;
        const idx = Number(card.dataset.idx);
        const oidx = Number(row.dataset.oidx);
        quizData.questions[idx].answer = oidx;
        renderQuestions(); // cập nhật placeholder giải thích + icon
        const radio = document.getElementById(`correct-${idx}-${oidx}`);
        if (radio) radio.focus();
    });

    titleInput.addEventListener('input', e => {
        quizData.title = e.target.value;
        e.target.classList.remove('input-error');
    });

    // ===== Smart Validation Engine =====

    let validateTimer;
    function validateSoon() {
        clearTimeout(validateTimer);
        validateTimer = setTimeout(validateQuizHealth, 150);
    }

    function questionWarnings(q) {
        const warnings = [];
        const emptyOids = [];
        const dupOids = new Set();

        if (q.options.length < 2) warnings.push('Mỗi câu hỏi cần ít nhất 2 đáp án!');

        q.options.forEach((opt, oidx) => { if (!opt.trim()) emptyOids.push(oidx); });
        if (emptyOids.length) warnings.push('⚠️ Có đáp án bị bỏ trống');

        const seen = new Map();
        q.options.forEach((opt, oidx) => {
            const key = opt.trim().toLowerCase();
            if (!key) return;
            if (seen.has(key)) { dupOids.add(seen.get(key)); dupOids.add(oidx); }
            else seen.set(key, oidx);
        });
        if (dupOids.size) warnings.push('⚠️ Đáp án bị trùng lặp');

        const correctExp = (q.optionExplanations[q.answer] || '').trim();
        if (correctExp.length < 5) warnings.push('⚠️ Chưa có giải thích cho đáp án đúng');

        return { warnings, emptyOids, dupOids };
    }

    function validateQuizHealth() {
        let totalWarnings = 0;
        warningsList.replaceChildren();

        quizData.questions.forEach((q, idx) => {
            const { warnings, emptyOids, dupOids } = questionWarnings(q);
            totalWarnings += warnings.length;
            const card = cardEl(idx);
            if (!card) return;

            // badges trên thẻ câu hỏi
            const badgeBox = card.querySelector('.question-warning-container');
            badgeBox.replaceChildren();
            if (warnings.length === 0) {
                const ok = document.createElement('span');
                ok.className = 'clay-badge clay-badge-ok font-mono text-[10px] font-bold px-2.5 py-1';
                ok.textContent = '✓ Câu hỏi hợp lệ';
                badgeBox.appendChild(ok);
            } else {
                warnings.forEach(w => {
                    const pill = document.createElement('span');
                    pill.className = 'clay-badge clay-badge-warn font-mono text-[10px] font-bold px-2.5 py-1';
                    pill.textContent = w;
                    badgeBox.appendChild(pill);
                });
            }

            // trạng thái lỗi trên từng ô đáp án
            card.querySelectorAll('[data-oidx]').forEach(row => {
                const oidx = Number(row.dataset.oidx);
                const input = row.querySelector('.answer-input');
                const bad = emptyOids.includes(oidx) || dupOids.has(oidx);
                input.classList.toggle('input-error', bad);
                input.closest('.answer-wrap').classList.toggle('input-error-wrap', bad);
            });

            // sidebar: link nhảy nhanh tới câu lỗi
            warnings.forEach(w => {
                const li = document.createElement('li');
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'w-full text-left px-2.5 py-2 rounded-lg bg-white border border-pink-100 text-[var(--text-secondary)] font-medium hover:border-[var(--accent-warning)] transition-[border-color] duration-150';
                btn.innerHTML = `<span class="font-mono font-bold text-[var(--accent-primary)]">Câu ${idx + 1}</span> · ${w}`;
                btn.addEventListener('click', () => {
                    card.scrollIntoView({ behavior: scrollBehavior, block: 'center' });
                    card.querySelector('.question-title').focus({ preventScroll: true });
                });
                li.appendChild(btn);
                warningsList.appendChild(li);
            });
        });

        if (quizData.questions.length && totalWarnings === 0) {
            healthStatus.textContent = '✓ Bộ đề hoàn hảo';
            healthStatus.classList.remove('text-[var(--accent-warning)]');
            healthStatus.classList.add('text-[var(--accent-success)]');
        } else {
            healthStatus.textContent = `Cần hoàn thiện (${totalWarnings} cảnh báo)`;
            healthStatus.classList.add('text-[var(--accent-warning)]');
            healthStatus.classList.remove('text-[var(--accent-success)]');
        }
    }

    // ===== Save workflow =====

    function saveQuiz() {
        quizData.title = titleInput.value.trim();
        if (!quizData.title) {
            titleInput.classList.add('input-error');
            titleInput.focus();
            showToast('⚠️ Vui lòng nhập tên bộ trắc nghiệm trước khi lưu!', { type: 'warning' });
            return;
        }
        if (!quizData.questions.length) {
            showToast('⚠️ Hãy thêm ít nhất một câu hỏi vào bộ đề!', { type: 'warning' });
            return;
        }
        for (const [i, q] of quizData.questions.entries()) {
            if (!q.question.trim() || q.options.length < 2 || q.options.some(opt => !opt.trim())) {
                showToast(`⚠️ Vui lòng điền đầy đủ thông tin cho câu hỏi số ${i + 1}!`, { type: 'warning' });
                const card = cardEl(i);
                if (card) {
                    card.scrollIntoView({ behavior: scrollBehavior, block: 'center' });
                    card.querySelector('.question-title').focus({ preventScroll: true });
                }
                return;
            }
        }
        localStorage.setItem('manualQuizDraft', JSON.stringify(quizData));
        showToast('🎉 Bộ đề đã được lưu thành công vào bộ nhớ!', { type: 'success' });
    }

    document.getElementById('save-quiz-btn').addEventListener('click', saveQuiz);
    document.getElementById('addQuestionBtn').addEventListener('click', addQuestion);
    form.addEventListener('submit', e => { e.preventDefault(); saveQuiz(); });

    // ===== Ninja keyboard controller =====

    function textInputsInOrder() {
        return [...form.querySelectorAll('#quizTitle, .question-title, .answer-input, .option-exp-input')];
    }

    document.addEventListener('keydown', e => {
        const mod = e.ctrlKey || e.metaKey;

        // Ctrl/Cmd + Enter: thêm câu hỏi, focus vào thẻ mới
        if (mod && !e.shiftKey && e.key === 'Enter') {
            e.preventDefault();
            addQuestion();
            return;
        }
        // Ctrl/Cmd + Shift + S: lưu (chặn dialog save của trình duyệt)
        if (mod && e.shiftKey && (e.key === 'S' || e.key === 's')) {
            e.preventDefault();
            saveQuiz();
            return;
        }
        // Ctrl/Cmd + Z: hoàn tác xóa (chỉ khi còn undo trong cửa sổ 5s)
        if (mod && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
            if (undoStack.length && undoLast()) e.preventDefault();
            return;
        }
        // Alt + Up/Down: di chuyển câu hỏi đang chứa focus, giữ nguyên focus tương đối
        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            const desc = describeActiveField();
            if (desc) {
                e.preventDefault();
                moveQuestion(desc.idx, e.key === 'ArrowUp' ? -1 : 1);
            }
            return;
        }
        // Up/Down: điều hướng giữa các ô nhập liệu
        if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.altKey && !mod && !e.shiftKey) {
            const el = document.activeElement;
            if (!el || el.tagName !== 'INPUT' || el.type !== 'text' || !form.contains(el)) return;
            const inputs = textInputsInOrder();
            const i = inputs.indexOf(el);
            if (i === -1) return;
            const next = inputs[i + (e.key === 'ArrowDown' ? 1 : -1)];
            if (next) {
                e.preventDefault();
                next.focus();
                if (next.setSelectionRange) next.setSelectionRange(next.value.length, next.value.length);
            }
            return;
        }
        // Tab từ ô giải thích của đáp án cuối -> textarea giải thích chung
        if (e.key === 'Tab' && !e.shiftKey && document.activeElement.classList.contains('option-exp-input')) {
            const card = document.activeElement.closest('.question-clay-card');
            const rows = card.querySelectorAll('[data-oidx]');
            const row = document.activeElement.closest('[data-oidx]');
            if (row === rows[rows.length - 1]) {
                e.preventDefault();
                card.querySelector('.explanation-input').focus();
            }
        }
    });

    // ===== Init: đúng một câu hỏi trống =====
    quizData.questions.push(blankQuestion());
    renderQuestions();
});
