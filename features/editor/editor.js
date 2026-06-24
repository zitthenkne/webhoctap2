// File: editor.js
import { db, auth } from '../../core/firebase-init.js';
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import { showToast, showConfirm } from '../../core/utils.js';

document.addEventListener('DOMContentLoaded', () => {
    const editorContainer = document.getElementById('editor-container');
    const saveBtn = document.getElementById('save-quiz-btn');
    const fabSave = document.getElementById('fab-save');
    const saveStatusEl = document.getElementById('save-status');

    let quizId = null;
    let isDirty = false;
    let isSaving = false;
    let autosaveTimer = null;
    let searchTerm = '';

    let quizData = {
        title: '',
        description: '',
        questions: []
    };

    // ---------- Tiện ích ----------
    const esc = (s) => String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const draftKey = () => `editor-draft-${quizId || 'new'}`;

    // Đọc chỉ số đáp án đúng (0-based) từ mọi quy ước dữ liệu cũ
    function readCorrectIndex(q) {
        if (typeof q.correctAnswerIndex === 'number') return q.correctAnswerIndex;
        if (typeof q.answer === 'number') return q.answer - 1;        // 1-based (collab)
        if (typeof q.correctAnswer === 'number') return q.correctAnswer - 1;
        return 0;
    }

    // Chuẩn hóa 1 câu hỏi về shape nội bộ thống nhất
    function normalizeQuestion(q) {
        q = q || {};
        let options = Array.isArray(q.options) ? q.options.slice()
            : Array.isArray(q.answers) ? q.answers.slice() : [];
        if (options.length === 0) options = ['', '', '', ''];

        const optionExplanations = Array.isArray(q.optionExplanations) ? q.optionExplanations.slice() : [];
        while (optionExplanations.length < options.length) optionExplanations.push('');

        let correct = readCorrectIndex(q);
        if (correct < 0 || correct >= options.length) correct = 0;

        return {
            question: q.question || '',
            options,
            optionExplanations,
            explanation: q.explanation || q.explain || '',
            correctAnswerIndex: correct,
            _collapsed: false
        };
    }

    function normalizeAll() {
        if (!Array.isArray(quizData.questions)) quizData.questions = [];
        quizData.questions = quizData.questions.map(normalizeQuestion);
    }

    // Một câu hỏi được xem là "hoàn chỉnh" khi có nội dung và mọi đáp án đều có chữ
    function isComplete(q) {
        if (!q.question.trim()) return false;
        if (!q.options.length) return false;
        return q.options.every(o => o.trim() !== '');
    }

    // ---------- Trạng thái lưu ----------
    function setStatus(state) {
        if (!saveStatusEl) return;
        saveStatusEl.classList.remove('saved', 'dirty', 'saving');
        const label = saveStatusEl.querySelector('.label');
        if (state === 'saving') {
            saveStatusEl.classList.add('saving');
            if (label) label.textContent = 'Đang lưu…';
        } else if (state === 'dirty') {
            saveStatusEl.classList.add('dirty');
            if (label) label.textContent = 'Chưa lưu';
        } else {
            saveStatusEl.classList.add('saved');
            if (label) label.textContent = 'Đã lưu';
        }
    }

    function markDirty() {
        isDirty = true;
        if (!isSaving) setStatus('dirty');
        scheduleAutosave();
    }

    function scheduleAutosave() {
        clearTimeout(autosaveTimer);
        autosaveTimer = setTimeout(() => {
            try {
                localStorage.setItem(draftKey(), JSON.stringify({
                    savedAt: Date.now(),
                    data: serializeForSave()
                }));
            } catch (_) { /* localStorage đầy hoặc bị chặn — bỏ qua */ }
        }, 800);
    }

    // ---------- Khởi tạo ----------
    onAuthStateChanged(auth, user => {
        if (user) {
            initEditor();
        } else {
            editorContainer.innerHTML = `
                <div class="ed-empty">
                    <div class="ed-empty-emoji">🔒</div>
                    <p class="text-gray-500 font-semibold">Vui lòng <a href="../../index.html" class="text-pink-500 underline">đăng nhập</a> để sử dụng tính năng này.</p>
                </div>`;
            saveBtn.disabled = true;
            if (fabSave) fabSave.style.display = 'none';
        }
    });

    async function initEditor() {
        const urlParams = new URLSearchParams(window.location.search);
        quizId = urlParams.get('id');

        if (quizId) {
            try {
                const docRef = doc(db, "quiz_sets", quizId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    quizData = docSnap.data();
                } else {
                    editorContainer.innerHTML = `
                        <div class="ed-empty">
                            <div class="ed-empty-emoji">😢</div>
                            <p class="text-red-500 font-semibold">Không tìm thấy bộ đề với ID này.</p>
                        </div>`;
                    return;
                }
            } catch (e) {
                editorContainer.innerHTML = `
                    <div class="ed-empty">
                        <div class="ed-empty-emoji">⚠️</div>
                        <p class="text-red-500 font-semibold">Lỗi tải bộ đề. Vui lòng thử lại.</p>
                    </div>`;
                return;
            }
        }

        normalizeAll();
        await maybeRestoreDraft();
        render();
        setStatus(isDirty ? 'dirty' : 'saved');
    }

    // Hỏi khôi phục bản nháp tự động nếu có
    async function maybeRestoreDraft() {
        let raw;
        try { raw = localStorage.getItem(draftKey()); } catch (_) { return; }
        if (!raw) return;
        let parsed;
        try { parsed = JSON.parse(raw); } catch (_) { localStorage.removeItem(draftKey()); return; }
        if (!parsed?.data?.questions?.length && !parsed?.data?.title) return;

        const when = parsed.savedAt ? new Date(parsed.savedAt).toLocaleString('vi-VN') : '';
        const ok = await showConfirm(
            `Tìm thấy một bản nháp chưa lưu${when ? ' (' + when + ')' : ''}. Bạn có muốn khôi phục không?`,
            { title: 'Khôi phục bản nháp', confirmText: 'Khôi phục', cancelText: 'Bỏ qua', tone: 'primary' }
        );
        if (ok) {
            quizData = parsed.data;
            normalizeAll();
            isDirty = true;
        } else {
            try { localStorage.removeItem(draftKey()); } catch (_) {}
        }
    }

    // ---------- Render ----------
    function render() {
        const qs = quizData.questions || [];
        const completed = qs.filter(isComplete).length;
        const incomplete = qs.length - completed;

        editorContainer.innerHTML = `
            <div class="ed-meta-card mb-3">
                <input id="quiz-title-input" type="text" class="ed-title-input"
                    value="${esc(quizData.title)}" placeholder="Tên bộ đề của bạn ✨" />
                <textarea id="quiz-desc-input" class="ed-desc-input" rows="1"
                    placeholder="Thêm mô tả ngắn (không bắt buộc)…">${esc(quizData.description)}</textarea>
                <div class="ed-stats">
                    <span class="ed-chip"><i class="fas fa-layer-group"></i> ${qs.length} câu hỏi</span>
                    <span class="ed-chip ok"><i class="fas fa-circle-check"></i> ${completed} hoàn chỉnh</span>
                    ${incomplete > 0 ? `<span class="ed-chip warn"><i class="fas fa-triangle-exclamation"></i> ${incomplete} cần bổ sung</span>` : ''}
                </div>
            </div>

            <div class="ed-toolbar">
                <div class="ed-search">
                    <i class="fas fa-search"></i>
                    <input id="q-search" type="text" placeholder="Tìm câu hỏi…" value="${esc(searchTerm)}" />
                </div>
                <button id="expand-all" class="ed-tool-btn" title="Mở rộng tất cả"><i class="fas fa-chevron-down"></i><span class="hidden sm:inline">Mở rộng</span></button>
                <button id="collapse-all" class="ed-tool-btn" title="Thu gọn tất cả"><i class="fas fa-chevron-up"></i><span class="hidden sm:inline">Thu gọn</span></button>
            </div>

            <div id="questions-list">
                ${qs.length ? qs.map((q, i) => renderQuestion(q, i)).join('') : renderEmpty()}
            </div>

            <button class="ed-add-q mt-1" id="add-question-btn">
                <i class="fas fa-circle-plus"></i> Thêm câu hỏi mới
            </button>
        `;

        attachListeners();
        applySearch();
        autoGrowAll();
    }

    function renderEmpty() {
        return `
            <div class="ed-empty" id="empty-state">
                <div class="ed-empty-emoji">📝</div>
                <p class="text-gray-500 font-semibold mb-1">Chưa có câu hỏi nào</p>
                <p class="text-gray-400 text-xs">Nhấn “Thêm câu hỏi mới” để bắt đầu tạo bộ đề của bạn!</p>
            </div>`;
    }

    function renderQuestion(q, idx) {
        const incomplete = !isComplete(q);
        const preview = q.question.trim() || 'Câu hỏi chưa có nội dung…';
        const optionsHtml = q.options.map((opt, i) => {
            const isCorrect = q.correctAnswerIndex === i;
            const exp = (q.optionExplanations && q.optionExplanations[i]) || '';
            const letter = String.fromCharCode(65 + i);
            const expPlaceholder = isCorrect ? 'Vì sao đáp án này đúng? (tùy chọn)' : 'Vì sao đáp án này sai? (tùy chọn)';
            return `
                <div class="ed-option ${isCorrect ? 'is-correct' : ''}" data-opt="${i}">
                    <div class="ed-option-row">
                        <span class="ed-letter" data-action="set-correct" title="Đánh dấu là đáp án đúng">${letter}</span>
                        <input type="text" class="ed-opt-input" data-field="option" value="${esc(opt)}" placeholder="Nội dung đáp án ${letter}" />
                        <span class="ed-correct-tag"><i class="fas fa-check"></i> Đúng</span>
                        <button class="ed-icon-btn danger" data-action="del-option" title="Xóa đáp án" tabindex="-1"><i class="fas fa-times"></i></button>
                    </div>
                    <input type="text" class="ed-exp-input" data-field="exp" value="${esc(exp)}" placeholder="${expPlaceholder}" />
                </div>`;
        }).join('');

        return `
            <div class="ed-qcard ${q._collapsed ? 'collapsed' : ''} ${incomplete ? 'is-incomplete' : ''}" data-idx="${idx}" draggable="false">
                <div class="ed-qhead">
                    <span class="ed-drag-handle" data-action="drag" title="Kéo để sắp xếp"><i class="fas fa-grip-vertical"></i></span>
                    <span class="ed-qnum">${idx + 1}</span>
                    <span class="ed-qpreview">${esc(preview)}</span>
                    <span class="ed-qbadge"><i class="fas fa-triangle-exclamation"></i> Thiếu</span>
                    <button class="ed-icon-btn" data-action="move-up" title="Lên" tabindex="-1" ${idx === 0 ? 'disabled' : ''}><i class="fas fa-arrow-up"></i></button>
                    <button class="ed-icon-btn" data-action="move-down" title="Xuống" tabindex="-1" ${idx === quizData.questions.length - 1 ? 'disabled' : ''}><i class="fas fa-arrow-down"></i></button>
                    <button class="ed-icon-btn" data-action="duplicate" title="Nhân bản" tabindex="-1"><i class="fas fa-clone"></i></button>
                    <button class="ed-icon-btn" data-action="toggle" title="Thu gọn/Mở rộng" tabindex="-1"><i class="fas fa-chevron-${q._collapsed ? 'down' : 'up'}"></i></button>
                    <button class="ed-icon-btn danger" data-action="del-question" title="Xóa câu hỏi" tabindex="-1"><i class="fas fa-trash"></i></button>
                </div>
                <div class="ed-qbody">
                    <label class="ed-field-label"><i class="fas fa-circle-question"></i> Nội dung câu hỏi</label>
                    <textarea class="ed-textarea" data-field="question" rows="2" placeholder="Nhập nội dung câu hỏi…">${esc(q.question)}</textarea>

                    <label class="ed-field-label mt-3"><i class="fas fa-list-check"></i> Đáp án <span class="text-gray-400 font-normal normal-case ml-1" style="text-transform:none;font-size:0.62rem;">— nhấn chữ cái để chọn đáp án đúng</span></label>
                    <div class="ed-options">${optionsHtml}</div>
                    <button class="ed-add-opt" data-action="add-option" type="button"><i class="fas fa-plus"></i> Thêm đáp án</button>

                    <label class="ed-field-label mt-3"><i class="fas fa-lightbulb"></i> Giải thích chung (không bắt buộc)</label>
                    <textarea class="ed-textarea" data-field="explanation" rows="2" placeholder="Giải thích chung cho câu hỏi…">${esc(q.explanation)}</textarea>
                    <p class="ed-markdown-hint"><i class="fas fa-info-circle"></i> Hỗ trợ Markdown: **đậm**, *nghiêng*, \`code\`, bảng, công thức toán.</p>
                </div>
            </div>`;
    }

    // Tự động giãn chiều cao textarea theo nội dung
    function autoGrow(el) {
        el.style.height = 'auto';
        el.style.height = (el.scrollHeight + 2) + 'px';
    }
    function autoGrowAll() {
        editorContainer.querySelectorAll('textarea').forEach(autoGrow);
    }

    // ---------- Lọc/Tìm kiếm ----------
    function applySearch() {
        const term = searchTerm.trim().toLowerCase();
        const list = document.getElementById('questions-list');
        if (!list) return;
        const cards = list.querySelectorAll('.ed-qcard');
        let visible = 0;
        cards.forEach(card => {
            const idx = Number(card.dataset.idx);
            const q = quizData.questions[idx];
            const hay = (q.question + ' ' + q.options.join(' ')).toLowerCase();
            const show = !term || hay.includes(term);
            card.classList.toggle('is-hidden', !show);
            if (show) visible++;
        });
        let nores = list.querySelector('.ed-no-results');
        if (term && visible === 0) {
            if (!nores) {
                nores = document.createElement('div');
                nores.className = 'ed-no-results';
                nores.innerHTML = '<i class="fas fa-magnifying-glass mr-1"></i> Không tìm thấy câu hỏi phù hợp.';
                list.appendChild(nores);
            }
        } else if (nores) {
            nores.remove();
        }
    }

    // ---------- Event listeners ----------
    function getIdx(el) {
        const card = el.closest('.ed-qcard');
        return card ? Number(card.dataset.idx) : -1;
    }
    function getOptIdx(el) {
        const opt = el.closest('.ed-option');
        return opt ? Number(opt.dataset.opt) : -1;
    }

    function attachListeners() {
        // Tiêu đề & mô tả
        const titleInput = document.getElementById('quiz-title-input');
        titleInput.addEventListener('input', (e) => { quizData.title = e.target.value; markDirty(); updatePreviewDebounced(); });

        const descInput = document.getElementById('quiz-desc-input');
        descInput.addEventListener('input', (e) => { quizData.description = e.target.value; autoGrow(e.target); markDirty(); });

        // Thêm câu hỏi
        document.getElementById('add-question-btn').addEventListener('click', addQuestion);

        // Tìm kiếm
        document.getElementById('q-search').addEventListener('input', (e) => {
            searchTerm = e.target.value;
            applySearch();
        });

        // Mở rộng / thu gọn tất cả
        document.getElementById('expand-all').addEventListener('click', () => setAllCollapsed(false));
        document.getElementById('collapse-all').addEventListener('click', () => setAllCollapsed(true));

        const list = document.getElementById('questions-list');
        if (!list) return;

        // Nhập liệu (delegation) — cập nhật state mà không re-render để giữ con trỏ
        list.addEventListener('input', (e) => {
            const t = e.target;
            const idx = getIdx(t);
            if (idx < 0) return;
            const q = quizData.questions[idx];
            const field = t.dataset.field;

            if (field === 'question') {
                q.question = t.value;
                autoGrow(t);
                // cập nhật preview tiêu đề trên đầu thẻ
                const card = t.closest('.ed-qcard');
                const prev = card.querySelector('.ed-qpreview');
                if (prev) prev.textContent = t.value.trim() || 'Câu hỏi chưa có nội dung…';
            } else if (field === 'explanation') {
                q.explanation = t.value;
                autoGrow(t);
            } else if (field === 'option') {
                q.options[getOptIdx(t)] = t.value;
            } else if (field === 'exp') {
                if (!Array.isArray(q.optionExplanations)) q.optionExplanations = [];
                q.optionExplanations[getOptIdx(t)] = t.value;
            }
            markDirty();
        });

        // Click các nút (delegation)
        list.addEventListener('click', (e) => {
            const actionEl = e.target.closest('[data-action]');
            if (!actionEl) return;
            const action = actionEl.dataset.action;
            const idx = getIdx(actionEl);
            if (idx < 0) return;

            switch (action) {
                case 'set-correct':   setCorrect(idx, getOptIdx(actionEl)); break;
                case 'del-option':    deleteOption(idx, getOptIdx(actionEl)); break;
                case 'add-option':    addOption(idx); break;
                case 'del-question':  deleteQuestion(idx); break;
                case 'duplicate':     duplicateQuestion(idx); break;
                case 'move-up':       moveQuestion(idx, -1); break;
                case 'move-down':     moveQuestion(idx, 1); break;
                case 'toggle':        toggleCollapse(idx); break;
            }
        });

        setupDragAndDrop(list);
    }

    // Cập nhật preview tiêu đề trang khi gõ tên bộ đề
    let previewTimer = null;
    function updatePreviewDebounced() {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(() => {
            document.title = (quizData.title?.trim() || 'Bộ đề mới') + ' • Trình chỉnh sửa';
        }, 300);
    }

    // ---------- Hành động câu hỏi ----------
    function addQuestion() {
        quizData.questions = quizData.questions || [];
        quizData.questions.push(normalizeQuestion({ options: ['', '', '', ''], correctAnswerIndex: 0 }));
        markDirty();
        render();
        // cuộn tới và focus câu hỏi mới
        requestAnimationFrame(() => {
            const cards = document.querySelectorAll('.ed-qcard');
            const last = cards[cards.length - 1];
            if (last) {
                last.scrollIntoView({ behavior: 'smooth', block: 'center' });
                const ta = last.querySelector('textarea[data-field="question"]');
                if (ta) ta.focus();
            }
        });
    }

    async function deleteQuestion(idx) {
        const ok = await showConfirm('Bạn có chắc muốn xóa câu hỏi này không?', {
            title: 'Xóa câu hỏi', confirmText: 'Xóa', cancelText: 'Giữ lại', tone: 'danger'
        });
        if (!ok) return;
        quizData.questions.splice(idx, 1);
        markDirty();
        render();
    }

    function duplicateQuestion(idx) {
        const copy = JSON.parse(JSON.stringify(quizData.questions[idx]));
        copy._collapsed = false;
        quizData.questions.splice(idx + 1, 0, copy);
        markDirty();
        render();
        showToast('Đã nhân bản câu hỏi!', 'success', 1500);
    }

    function moveQuestion(idx, dir) {
        const target = idx + dir;
        if (target < 0 || target >= quizData.questions.length) return;
        const [item] = quizData.questions.splice(idx, 1);
        quizData.questions.splice(target, 0, item);
        markDirty();
        render();
    }

    function setCorrect(idx, optIdx) {
        if (optIdx < 0) return;
        quizData.questions[idx].correctAnswerIndex = optIdx;
        markDirty();
        // cập nhật giao diện thẻ này tại chỗ (không re-render toàn bộ)
        const card = document.querySelector(`.ed-qcard[data-idx="${idx}"]`);
        if (!card) return;
        card.querySelectorAll('.ed-option').forEach((opt) => {
            const i = Number(opt.dataset.opt);
            const correct = i === optIdx;
            opt.classList.toggle('is-correct', correct);
            const expInput = opt.querySelector('.ed-exp-input');
            if (expInput) expInput.placeholder = correct ? 'Vì sao đáp án này đúng? (tùy chọn)' : 'Vì sao đáp án này sai? (tùy chọn)';
        });
    }

    function addOption(idx) {
        const q = quizData.questions[idx];
        if (q.options.length >= 26) { showToast('Tối đa 26 đáp án mỗi câu.', 'warning'); return; }
        q.options.push('');
        if (!Array.isArray(q.optionExplanations)) q.optionExplanations = [];
        q.optionExplanations.push('');
        markDirty();
        render();
    }

    function deleteOption(idx, optIdx) {
        const q = quizData.questions[idx];
        if (q.options.length <= 2) { showToast('Mỗi câu hỏi cần ít nhất 2 đáp án.', 'warning'); return; }
        q.options.splice(optIdx, 1);
        if (Array.isArray(q.optionExplanations)) q.optionExplanations.splice(optIdx, 1);
        // điều chỉnh đáp án đúng
        if (q.correctAnswerIndex === optIdx) q.correctAnswerIndex = 0;
        else if (q.correctAnswerIndex > optIdx) q.correctAnswerIndex--;
        markDirty();
        render();
    }

    function toggleCollapse(idx) {
        quizData.questions[idx]._collapsed = !quizData.questions[idx]._collapsed;
        const card = document.querySelector(`.ed-qcard[data-idx="${idx}"]`);
        if (card) {
            card.classList.toggle('collapsed', quizData.questions[idx]._collapsed);
            const icon = card.querySelector('[data-action="toggle"] i');
            if (icon) icon.className = `fas fa-chevron-${quizData.questions[idx]._collapsed ? 'down' : 'up'}`;
        }
    }

    function setAllCollapsed(state) {
        quizData.questions.forEach(q => q._collapsed = state);
        render();
    }

    // ---------- Kéo-thả sắp xếp ----------
    function setupDragAndDrop(list) {
        let dragIdx = -1;

        list.querySelectorAll('.ed-drag-handle').forEach(handle => {
            const card = handle.closest('.ed-qcard');
            handle.addEventListener('mousedown', () => card.setAttribute('draggable', 'true'));
            handle.addEventListener('touchstart', () => card.setAttribute('draggable', 'true'), { passive: true });
        });

        list.addEventListener('dragstart', (e) => {
            const card = e.target.closest('.ed-qcard');
            if (!card) return;
            dragIdx = Number(card.dataset.idx);
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            try { e.dataTransfer.setData('text/plain', String(dragIdx)); } catch (_) {}
        });

        list.addEventListener('dragover', (e) => {
            e.preventDefault();
            const card = e.target.closest('.ed-qcard');
            list.querySelectorAll('.ed-qcard').forEach(c => c.classList.remove('drop-above', 'drop-below'));
            if (!card || Number(card.dataset.idx) === dragIdx) return;
            const rect = card.getBoundingClientRect();
            const after = e.clientY > rect.top + rect.height / 2;
            card.classList.add(after ? 'drop-below' : 'drop-above');
        });

        list.addEventListener('drop', (e) => {
            e.preventDefault();
            const card = e.target.closest('.ed-qcard');
            if (!card || dragIdx < 0) return;
            let targetIdx = Number(card.dataset.idx);
            const rect = card.getBoundingClientRect();
            const after = e.clientY > rect.top + rect.height / 2;

            const [item] = quizData.questions.splice(dragIdx, 1);
            if (dragIdx < targetIdx) targetIdx--;
            if (after) targetIdx++;
            targetIdx = Math.max(0, Math.min(quizData.questions.length, targetIdx));
            quizData.questions.splice(targetIdx, 0, item);
            dragIdx = -1;
            markDirty();
            render();
        });

        list.addEventListener('dragend', () => {
            list.querySelectorAll('.ed-qcard').forEach(c => {
                c.classList.remove('dragging', 'drop-above', 'drop-below');
                c.setAttribute('draggable', 'false');
            });
            dragIdx = -1;
        });
    }

    // ---------- Lưu ----------
    // Xuất dữ liệu ra shape tương thích với mọi đường đọc (single-player + collab)
    function serializeForSave() {
        const questions = (quizData.questions || []).map(q => {
            const options = q.options.map(o => o);
            const correct = (q.correctAnswerIndex >= 0 && q.correctAnswerIndex < options.length) ? q.correctAnswerIndex : 0;
            const optionExplanations = Array.isArray(q.optionExplanations) ? q.optionExplanations.slice() : [];
            while (optionExplanations.length < options.length) optionExplanations.push('');
            return {
                question: q.question,
                options,
                answers: options.slice(),       // engine single-player đọc answers||options
                optionExplanations,
                explanation: q.explanation || '',
                correctAnswerIndex: correct,    // canonical 0-based
                answer: correct + 1             // tương thích đường collab (1-based)
            };
        });
        return {
            title: quizData.title?.trim() || 'Bộ đề mới không tiêu đề',
            description: quizData.description || '',
            questions
        };
    }

    function validateBeforeSave() {
        const qs = quizData.questions || [];
        if (qs.length === 0) {
            showToast('Hãy thêm ít nhất một câu hỏi trước khi lưu.', 'warning');
            return false;
        }
        const blank = qs.findIndex(q => !q.question.trim());
        if (blank !== -1) {
            showToast(`Câu ${blank + 1} chưa có nội dung.`, 'warning');
            const card = document.querySelector(`.ed-qcard[data-idx="${blank}"]`);
            if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.querySelector('textarea')?.focus(); }
            return false;
        }
        return true;
    }

    async function saveQuiz() {
        if (isSaving) return;
        const user = auth.currentUser;
        if (!user) { showToast('Bạn cần đăng nhập để lưu.', 'error'); return; }
        if (!validateBeforeSave()) return;

        isSaving = true;
        setStatus('saving');
        saveBtn.disabled = true;
        if (fabSave) fabSave.disabled = true;

        const payload = serializeForSave();
        try {
            if (quizId) {
                await setDoc(doc(db, "quiz_sets", quizId), { ...quizData, ...payload, userId: user.uid }, { merge: true });
            } else {
                const ref = await addDoc(collection(db, "quiz_sets"), {
                    ...payload, userId: user.uid, createdAt: serverTimestamp(), folderId: null
                });
                quizId = ref.id;
                // cập nhật URL để các lần lưu sau là chỉnh sửa, không tạo mới
                const url = new URL(window.location.href);
                url.searchParams.set('id', quizId);
                history.replaceState(null, '', url);
            }
            isDirty = false;
            try { localStorage.removeItem(draftKey()); } catch (_) {}
            setStatus('saved');
            showToast('Bộ đề đã được lưu thành công!', 'success');
        } catch (e) {
            setStatus('dirty');
            showToast('Lưu thất bại. Vui lòng thử lại.', 'error');
        } finally {
            isSaving = false;
            saveBtn.disabled = false;
            if (fabSave) fabSave.disabled = false;
        }
    }

    saveBtn.addEventListener('click', saveQuiz);
    if (fabSave) fabSave.addEventListener('click', saveQuiz);

    // Phím tắt: Ctrl/Cmd+S để lưu
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            saveQuiz();
        }
    });

    // Cảnh báo khi rời trang lúc còn thay đổi chưa lưu
    window.addEventListener('beforeunload', (e) => {
        if (isDirty) { e.preventDefault(); e.returnValue = ''; }
    });
});
