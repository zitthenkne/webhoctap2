// File: features/editor/editor.js
// Trình sửa bộ đề (editor.html?id=…[&q=N]). Bố cục "cuốn sổ mở" (2026-11-09):
//  - Trang trái (rail): bìa bộ đề · tìm (không dấu) · lọc Tất cả / Cần bổ sung / Chưa giải thích · DANH SÁCH câu (dòng 2 dòng + trạng thái)
//  - Gáy lò xo ở giữa · Trang phải (stage): chế độ "Từng câu" (sửa 1 câu, ‹ › chuyển câu, xem trước bên cạnh) hoặc "Tất cả" (cuộn dài)
//  - Điện thoại: 2 màn — danh sách → chạm câu để sửa (thanh dưới: ‹ Danh sách › Lưu)
//  - Sửa được ghi chú, mở rộng, ca lâm sàng, đáp án mẫu, câu NHIỀU đáp án đúng; mọi trường lạ của câu giữ nguyên khi lưu
//  - Dán nhanh nhiều câu · Xóa có Hoàn tác · Chèn câu · Xem trước Markdown
//  - Phím tắt: Ctrl+S lưu · Alt+↑/↓ câu trước/sau · Ctrl+Enter thêm câu sau câu đang sửa · Enter ở đáp án → đáp án kế
//    Backspace ở đáp án trống → xóa · Alt+1…9 chọn đáp án đúng · / tìm câu
import { db } from '../../core/firebase-init.js';
import { doc, getDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { setDocQ as setDoc, updateDocQ as updateDoc } from '../../core/offline-write.js';
import { onSessionUser, sessionUser } from '../../core/auth-session.js';
import { getOfflineQuiz, autoCacheQuiz, isOfflineSavedSync } from '../quiz/quiz-offline-store.js';
import { stampLocal } from '../quiz/quiz-fresh.js';
import { showToast, showConfirm } from '../../core/utils.js';

document.addEventListener('DOMContentLoaded', () => {
    const editorContainer = document.getElementById('editor-container');
    const saveBtn = document.getElementById('save-quiz-btn');
    const fabSave = document.getElementById('fab-save');
    const saveStatusEl = document.getElementById('save-status');
    const playBtn = document.getElementById('ed-play-btn');
    const previewBtn = document.getElementById('ed-preview-btn');

    const pref = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (_) { return d; } };
    const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };

    let quizId = null;
    let isDirty = false;
    let isSaving = false;
    let autosaveTimer = null;
    let searchTerm = '';
    let filterMode = 'all';                 // all | todo | noexp
    let viewMode = pref('edView', 'focus') === 'all' ? 'all' : 'focus';
    let currentIdx = 0;                     // câu đang sửa (chế độ Từng câu) / đang sáng (chế độ Tất cả)
    let lastSavedAt = 0;
    let previewOn = pref('edPreview', '1') === '1';

    let quizData = { title: '', description: '', questions: [] };

    // ---------- Tiện ích ----------
    const esc = (s) => String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/đ/g, 'd');
    const letterOf = (i) => String.fromCharCode(65 + i);
    const draftKey = () => `editor-draft-${quizId || 'new'}`;
    const cardEl = (idx) => document.querySelector(`.ed-qcard[data-idx="${idx}"]`);
    const rowEl = (idx) => document.querySelector(`.ed-row[data-goto="${idx}"]`);
    const reduceMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isNarrow = () => window.innerWidth < 1024;
    const smooth = () => (reduceMotion() ? 'auto' : 'smooth');

    // Đọc chỉ số đáp án đúng (0-based) từ mọi quy ước dữ liệu cũ
    function readCorrectIndex(q) {
        if (typeof q.correctAnswerIndex === 'number') return q.correctAnswerIndex;
        if (typeof q.answer === 'number') return q.answer - 1;        // 1-based (collab)
        if (typeof q.correctAnswer === 'number') return q.correctAnswer - 1;
        return 0;
    }
    function readCorrectList(q, n) {
        const raw = Array.isArray(q.correctAnswerIndexes) && q.correctAnswerIndexes.length ? q.correctAnswerIndexes : [readCorrectIndex(q)];
        const arr = [...new Set(raw.map(Number))].filter(i => Number.isInteger(i) && i >= 0 && i < n).sort((a, b) => a - b);
        return arr.length ? arr : (n ? [0] : []);
    }

    // Trường editor tự quản — mọi trường KHÁC của câu (ảnh, thẻ, nguồn, mức độ…) mang nguyên theo khi lưu
    const KNOWN = new Set(['question', 'options', 'answers', 'optionExplanations', 'explanation', 'explain', 'correctAnswerIndex', 'correctAnswerIndexes',
        'answer', 'correctAnswer', 'caseId', 'caseText', 'caseTitle', 'caseReveal', 'maxScore', 'type', 'modelAnswer', 'keyPoints', 'answerFormat',
        'note', 'expanded', 'correct', 'multi']);
    function normalizeQuestion(q) {
        q = q || {};
        let options = Array.isArray(q.options) ? q.options.slice()
            : Array.isArray(q.answers) ? q.answers.slice() : [];
        options = options.map(o => (o == null ? '' : typeof o === 'string' ? o : String(o.text ?? o.content ?? o)));
        // Câu tự luận: không đệm phương án rỗng (thêm phương án thì thành câu trắc nghiệm)
        const essay = q.type === 'essay' && options.length === 0;
        if (options.length === 0 && !essay) options = ['', '', '', ''];

        const optionExplanations = Array.isArray(q.optionExplanations) ? q.optionExplanations.map(s => s || '') : [];
        while (optionExplanations.length < options.length) optionExplanations.push('');

        const correct = readCorrectList(q, options.length);
        const keep = q._keep ? { ...q._keep } : {};
        for (const [k, v] of Object.entries(q)) if (!KNOWN.has(k) && !k.startsWith('_') && v != null) keep[k] = v;

        return {
            question: q.question || '',
            options,
            optionExplanations,
            explanation: q.explanation || q.explain || '',
            correct,
            multi: typeof q.multi === 'boolean' ? q.multi : correct.length > 1,
            note: typeof q.note === 'string' ? q.note : (q.note ? String(q.note) : ''),
            expanded: typeof q.expanded === 'string' ? q.expanded : (q.expanded ? String(q.expanded) : ''),
            caseId: q.caseId || '',
            caseText: q.caseText || '',
            caseTitle: q.caseTitle || '',
            ...(q.caseReveal ? { caseReveal: q.caseReveal } : {}),
            ...(Number(q.maxScore) > 0 ? { maxScore: Number(q.maxScore) } : {}),
            ...(essay ? { type: 'essay', modelAnswer: q.modelAnswer || '', keyPoints: q.keyPoints || null, answerFormat: q.answerFormat || null } : {}),
            _keep: keep,
            _collapsed: !!q._collapsed
        };
    }
    const blankQuestion = () => normalizeQuestion({ options: ['', '', '', ''], correctAnswerIndex: 0 });

    function normalizeAll() {
        if (!Array.isArray(quizData.questions)) quizData.questions = [];
        quizData.questions = quizData.questions.map(normalizeQuestion);
    }

    const isEssay = (q) => q.type === 'essay' && q.options.length === 0;
    // "Hoàn chỉnh" = có đề và mọi đáp án đều có chữ
    function isComplete(q) {
        if (!q.question.trim()) return false;
        if (isEssay(q)) return true;
        if (!q.options.length) return false;
        return q.options.every(o => o.trim() !== '');
    }
    const hasExp = (q) => !!(q.explanation.trim() || q.optionExplanations.some(s => s && s.trim()) || (isEssay(q) && (q.modelAnswer || '').trim()));
    function issuesOf(q) {
        const out = [];
        if (!q.question.trim()) out.push(['warn', 'fa-circle-exclamation', 'Thiếu đề']);
        if (!isEssay(q)) { const blank = q.options.filter(o => !o.trim()).length; if (blank) out.push(['warn', 'fa-circle-exclamation', `${blank} đáp án trống`]); }
        if (!hasExp(q)) out.push(['soft', 'fa-lightbulb', 'Chưa giải thích']);
        if (!out.length) out.push(['ok', 'fa-circle-check', 'Hoàn chỉnh']);
        if (!isEssay(q) && q.correct.length) out.unshift(['key', 'fa-check', `Đúng: ${q.correct.map(letterOf).join(', ')}`]);
        return out;
    }
    // Bản đồ chấm (thanh trên trang phải): mỗi câu một chấm màu theo trạng thái, bấm để nhảy
    const miniHtml = (q, i) => `<button type="button" class="ed-mini is-${statusOf(q)}${i === currentIdx ? ' is-active' : ''}" data-goto="${i}" title="Câu ${i + 1}" aria-label="Câu ${i + 1}"></button>`;
    const issuesHtml = (q) => issuesOf(q).map(([t, ic, l]) => `<span class="ed-issue is-${t}"><i class="fas ${ic}"></i>${l}</span>`).join('');
    const statusOf = (q) => (!isComplete(q) ? 'warn' : !hasExp(q) ? 'soft' : 'ok');

    // ---------- Trạng thái lưu ----------
    function setStatus(state) {
        if (!saveStatusEl) return;
        saveStatusEl.classList.remove('saved', 'dirty', 'saving');
        const label = saveStatusEl.querySelector('.label');
        const hhmm = (t) => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        if (state === 'saving') { saveStatusEl.classList.add('saving'); if (label) label.textContent = 'Đang lưu…'; }
        else if (state === 'dirty') { saveStatusEl.classList.add('dirty'); if (label) label.textContent = 'Chưa lưu · nháp giữ trên máy'; }
        else { saveStatusEl.classList.add('saved'); if (label) label.textContent = lastSavedAt ? `Đã lưu lúc ${hhmm(lastSavedAt)}` : 'Đã lưu'; }
        saveBtn?.classList.toggle('is-dirty', state === 'dirty');
        fabSave?.classList.toggle('is-dirty', state === 'dirty');
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
                localStorage.setItem(draftKey(), JSON.stringify({ savedAt: Date.now(), data: serializeForSave() }));
            } catch (_) { /* localStorage đầy hoặc bị chặn — bỏ qua */ }
        }, 800);
    }

    // ---------- Khởi tạo ----------
    let editorStarted = false;
    onSessionUser(user => {
        if (user) {
            if (editorStarted) return;       // bản nhớ offline → bản thật của Firebase: chỉ khởi tạo 1 lần
            editorStarted = true;
            initEditor();
        } else {
            editorContainer.innerHTML = emptyBox('🔒', 'Cần đăng nhập', 'Vui lòng <a href="../../index.html">đăng nhập</a> để sửa bộ đề.');
            saveBtn.disabled = true;
            if (fabSave) fabSave.disabled = true;
        }
    });

    function emptyBox(emoji, title, html) {
        return `<div class="ed-emptybox"><div class="ed-empty-art">${emoji}</div><h3>${title}</h3><p>${html}</p></div>`;
    }

    async function initEditor() {
        const urlParams = new URLSearchParams(window.location.search);
        quizId = urlParams.get('id');

        if (quizId) {
            try {
                const docSnap = await getDoc(doc(db, "quiz_sets", quizId));
                if (docSnap.exists()) {
                    quizData = docSnap.data();
                    if (!Array.isArray(quizData.questions) || quizData.questions.length === 0) {
                        try {
                            const pSnap = await getDoc(doc(db, "quiz_payloads", quizId));
                            if (pSnap.exists() && Array.isArray(pSnap.data().questions)) quizData.questions = pSnap.data().questions;
                        } catch (_) {}
                    }
                } else {
                    editorContainer.innerHTML = emptyBox('😢', 'Không tìm thấy bộ đề', 'Có thể bộ đề đã bị xóa hoặc đường dẫn sai. <a href="../../index.html#libraryContent">Về thư viện</a>');
                    return;
                }
            } catch (e) {
                // Mất mạng: sửa trên bản đã tải về máy (lưu xong tự đồng bộ khi có mạng)
                const offline = await getOfflineQuiz(quizId);
                if (!offline) {
                    editorContainer.innerHTML = emptyBox('⚠️', 'Chưa mở được', navigator.onLine ? 'Lỗi tải bộ đề. Vui lòng thử lại.' : 'Đang ngoại tuyến và bộ đề này chưa tải về máy.');
                    return;
                }
                const { id: _id, _offlineSavedAt, _auto, ...rest } = offline;
                quizData = rest;
                showToast('Đang sửa bản đã tải về máy — lưu xong sẽ tự đồng bộ khi có mạng.', 'info');
            }
        }

        normalizeAll();
        if (!quizId && !quizData.questions.length) quizData.questions.push(blankQuestion());
        await maybeRestoreDraft();
        updatePlayLink();
        updatePreviewDebounced();
        const raw = urlParams.get('q');
        const jump = raw === null ? NaN : Number(raw);
        if (Number.isInteger(jump) && jump >= 0 && jump < quizData.questions.length) currentIdx = jump;
        render();
        setStatus(isDirty ? 'dirty' : 'saved');
        // Bộ đề mới tinh / mở từ kết quả tìm (?q=N) → vào thẳng màn sửa câu
        if (!Number.isNaN(jump) || !quizId) goToQuestion(currentIdx, true);
    }

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
            quizData = { ...quizData, ...parsed.data };
            normalizeAll();
            isDirty = true;
        } else {
            try { localStorage.removeItem(draftKey()); } catch (_) {}
        }
    }

    function updatePlayLink() {
        if (!playBtn) return;
        playBtn.hidden = !quizId;
        if (quizId) playBtn.href = `../quiz/quiz.html?id=${encodeURIComponent(quizId)}`;
    }

    // ---------- Vẽ: khung 2 trang ----------
    function counts() {
        const qs = quizData.questions || [];
        let done = 0, noexp = 0;
        for (const q of qs) { if (isComplete(q)) done++; if (!hasExp(q)) noexp++; }
        return { total: qs.length, done, todo: qs.length - done, noexp };
    }
    const pctOf = (c) => (c.total ? Math.round(c.done / c.total * 100) : 0);

    function render() {
        const qs = quizData.questions || [];
        if (currentIdx >= qs.length) currentIdx = Math.max(0, qs.length - 1);
        const c = counts();
        document.body.classList.toggle('ed-preview-on', previewOn);
        document.body.classList.toggle('ed-view-all', viewMode === 'all');
        previewBtn?.setAttribute('aria-pressed', String(previewOn));
        previewBtn?.classList.toggle('is-on', previewOn);

        editorContainer.innerHTML = `
            <div class="ed-app">
                <aside class="ed-rail" aria-label="Danh sách câu">
                    <section class="ed-meta">
                        <textarea id="quiz-title-input" class="ed-title-input" rows="1" placeholder="Tên bộ đề ✨" aria-label="Tên bộ đề">${esc(quizData.title)}</textarea>
                        <textarea id="quiz-desc-input" class="ed-desc-input" rows="1" placeholder="Thêm mô tả ngắn…" aria-label="Mô tả">${esc(quizData.description)}</textarea>
                        <div class="ed-progress" id="ed-progress">${progressHtml(c)}</div>
                    </section>
                    <div class="ed-railtools">
                        <div class="ed-search">
                            <i class="fas fa-search"></i>
                            <input id="q-search" type="text" placeholder="Tìm câu (không cần dấu)…" value="${esc(searchTerm)}" autocomplete="off" />
                            <span id="q-search-count" class="ed-search-count"></span>
                            <kbd class="ed-kbd-hint">/</kbd>
                        </div>
                        <div class="ed-filters" role="group" aria-label="Lọc câu" id="ed-filters">${filtersHtml(c)}</div>
                    </div>
                    <div class="ed-qlist" id="ed-qlist" role="list">${qs.map(rowHtml).join('')}<div class="ed-qlist-empty" hidden>🙈 Không thấy câu nào khớp. <button type="button" data-clear-filter>Xem tất cả</button></div></div>
                    <div class="ed-rail-foot">
                        <button type="button" class="ed-add-q" id="add-question-btn"><i class="fas fa-circle-plus"></i> Câu mới</button>
                        <button type="button" class="ed-add-paste" id="add-paste-btn"><i class="fas fa-paste"></i> Dán nhanh</button>
                    </div>
                </aside>
                <div class="ed-binding" aria-hidden="true"></div>
                <section class="ed-stage" id="ed-stage" aria-live="polite"></section>
            </div>`;
        const growMeta = () => { autoGrow(document.getElementById('quiz-desc-input')); autoGrow(document.getElementById('quiz-title-input')); };
        growMeta();
        renderStage();
        // Font Quicksand tải xong sau → chữ rộng ra, đo lại chiều cao các ô kẻo mất dòng cuối
        document.fonts?.ready.then(() => { growMeta(); autoGrowAll(); });
    }

    const progressHtml = (c) => {
        const pct = pctOf(c);
        return `<div class="ed-progress-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
            <div class="ed-progress-text"><b>${c.done}/${c.total}</b> câu hoàn chỉnh${c.total && pct === 100 ? ' 🎉' : ''}</div>`;
    };
    const filtersHtml = (c) => [
        ['all', 'Tất cả', 'fa-layer-group', c.total],
        ['todo', 'Thiếu', 'fa-circle-exclamation', c.todo],
        ['noexp', 'Chưa giải thích', 'fa-lightbulb', c.noexp],
    ].map(([k, l, , n]) => `<button type="button" class="ed-filter is-${k}${filterMode === k ? ' is-on' : ''}${!n && k !== 'all' ? ' is-zero' : ''}" data-filter="${k}" title="${l}"><span>${l}</span><em>${n}</em></button>`).join('');

    function rowHtml(q, i) {
        const st = statusOf(q);
        const icons = [
            q.caseText ? '<i class="fas fa-notes-medical" title="Ca lâm sàng"></i>' : '',
            q.multi ? '<i class="fas fa-check-double" title="Nhiều đáp án đúng"></i>' : '',
            isEssay(q) ? '<i class="fas fa-pen-nib" title="Tự luận"></i>' : '',
        ].join('');
        const stIcon = st === 'warn' ? '<i class="fas fa-circle-exclamation is-warn" title="Còn thiếu"></i>'
            : st === 'soft' ? '<i class="far fa-lightbulb is-soft" title="Chưa giải thích"></i>' : '<i class="fas fa-circle-check is-ok" title="Đủ"></i>';
        return `<button type="button" class="ed-row is-${st}${i === currentIdx ? ' is-active' : ''}" data-goto="${i}" role="listitem">
            <span class="ed-row-num">${i + 1}</span>
            <span class="ed-row-text">${esc(q.question.trim() || 'Câu chưa có nội dung…')}</span>
            <span class="ed-row-icons">${icons}${stIcon}</span>
        </button>`;
    }

    const insertHtml = (at) => `<div class="ed-insert"><button type="button" data-insert="${at}" title="Chèn một câu mới vào vị trí này"><i class="fas fa-plus"></i> Chèn câu ${at + 1}</button></div>`;

    function stageToolsHtml() {
        return `
            <div class="ed-stage-tools">
                <div class="ed-viewswitch" role="group" aria-label="Kiểu xem">
                    <button type="button" data-view="focus" class="${viewMode === 'focus' ? 'is-on' : ''}" title="Sửa từng câu"><i class="fas fa-square-pen"></i><span>Từng câu</span></button>
                    <button type="button" data-view="all" class="${viewMode === 'all' ? 'is-on' : ''}" title="Cuộn xem tất cả"><i class="fas fa-bars-staggered"></i><span>Tất cả</span></button>
                </div>
                ${viewMode === 'all' ? `<button type="button" data-collapse="0" class="ed-tool-btn" title="Mở rộng tất cả"><i class="fas fa-angles-down"></i></button>
                <button type="button" data-collapse="1" class="ed-tool-btn" title="Thu gọn tất cả"><i class="fas fa-angles-up"></i></button>` : ''}
                <button type="button" data-keys class="ed-tool-btn" title="Phím tắt" aria-expanded="false"><i class="fas fa-keyboard"></i></button>
            </div>`;
    }
    const KEYS_HTML = `<div class="ed-keys" id="ed-keys" hidden>
            <div><kbd>Ctrl</kbd>+<kbd>S</kbd> lưu</div>
            <div><kbd>Alt</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd> câu trước / sau</div>
            <div><kbd>Ctrl</kbd>+<kbd>Enter</kbd> thêm câu ngay sau</div>
            <div><kbd>Enter</kbd> ở đáp án → đáp án kế</div>
            <div><kbd>Backspace</kbd> ở đáp án trống → xóa</div>
            <div><kbd>Alt</kbd>+<kbd>1</kbd>…<kbd>9</kbd> chọn đáp án đúng</div>
            <div><kbd>/</kbd> tìm câu · <kbd>Esc</kbd> xóa tìm</div>
        </div>`;

    function renderStage() {
        const stage = document.getElementById('ed-stage');
        if (!stage) return;
        const qs = quizData.questions || [];
        const n = qs.length;
        if (!n) {
            stage.innerHTML = `<div class="ed-stage-top"><div class="ed-stage-pos"><b>Chưa có câu</b></div>${stageToolsHtml()}</div>${KEYS_HTML}${renderEmpty()}`;
        } else if (viewMode === 'focus') {
            const i = currentIdx;
            stage.innerHTML = `
                <div class="ed-stage-top">
                    <button type="button" class="ed-nav-btn is-list" data-nav="list" title="Về danh sách câu"><i class="fas fa-list-ul"></i></button>
                    <button type="button" class="ed-nav-btn" data-nav="-1" ${i === 0 ? 'disabled' : ''} title="Câu trước (Alt+↑)" aria-label="Câu trước"><i class="fas fa-chevron-left"></i></button>
                    <div class="ed-stage-pos"><b>Câu ${i + 1}</b><span>/ ${n}</span></div>
                    <button type="button" class="ed-nav-btn" data-nav="1" ${i === n - 1 ? 'disabled' : ''} title="Câu sau (Alt+↓)" aria-label="Câu sau"><i class="fas fa-chevron-right"></i></button>
                    ${n <= 80 ? `<div class="ed-minimap" aria-label="Bản đồ câu">${qs.map(miniHtml).join('')}</div>` : '<div class="ed-minimap-spacer"></div>'}
                    ${stageToolsHtml()}
                </div>
                ${KEYS_HTML}
                <div id="questions-list" class="is-focus">${renderQuestion(qs[i], i)}</div>
                <div class="ed-stage-foot">
                    <button type="button" class="ed-foot-btn" data-insert="${i + 1}"><i class="fas fa-plus"></i> Chèn câu mới sau câu ${i + 1}</button>
                    ${i < n - 1
                        ? `<button type="button" class="ed-foot-next" data-nav="1">Câu ${i + 2} <i class="fas fa-arrow-right"></i></button>`
                        : `<button type="button" class="ed-foot-next" data-insert="${n}"><i class="fas fa-plus"></i> Thêm câu ${n + 1}</button>`}
                </div>`;
        } else {
            stage.innerHTML = `
                <div class="ed-stage-top is-all">
                    <button type="button" class="ed-nav-btn is-list" data-nav="list" title="Về danh sách câu"><i class="fas fa-list-ul"></i></button>
                    <div class="ed-stage-pos"><b>Tất cả</b><span>${n} câu</span></div>
                    ${stageToolsHtml()}
                </div>
                ${KEYS_HTML}
                <div id="questions-list">${qs.map((q, i) => renderQuestion(q, i) + insertHtml(i + 1)).join('')}</div>`;
        }
        const list = document.getElementById('questions-list');
        if (list) setupDragAndDrop(list);
        applySearch();
        autoGrowAll();
        observeCards();
        if (previewOn) (viewMode === 'focus' ? [currentIdx] : qs.map((_, i) => i)).forEach(i => { if (qs[i] && (viewMode === 'focus' || !qs[i]._collapsed)) renderPreview(i); });
    }

    function renderEmpty() {
        return `<div class="ed-emptybox" id="empty-state"><div class="ed-empty-art">📝</div><h3>Chưa có câu hỏi nào</h3>
            <p>Bấm <b>Câu mới</b>, hoặc <b>Dán nhanh</b> cả loạt câu từ Word / ghi chú.</p></div>`;
    }

    function optionHtml(q, opt, i) {
        const ok = q.correct.includes(i);
        const exp = q.optionExplanations[i] || '';
        const L = letterOf(i);
        return `
            <div class="ed-option ${ok ? 'is-correct' : ''}" data-opt="${i}">
                <div class="ed-option-row">
                    <button type="button" class="ed-letter" data-action="set-correct" title="${q.multi ? 'Bật/tắt' : 'Chọn'} đáp án đúng${i < 9 ? ` (Alt+${i + 1})` : ''}" aria-pressed="${ok}">${L}</button>
                    <input type="text" class="ed-opt-input" data-field="option" value="${esc(opt)}" placeholder="Đáp án ${L}" />
                    <span class="ed-correct-tag"><i class="fas fa-check"></i> Đúng</span>
                    <button type="button" class="ed-icon-btn ghost${exp ? ' has-exp' : ''}" data-action="toggle-exp" title="Giải thích riêng cho đáp án ${L}" tabindex="-1"><i class="fas fa-comment-dots"></i></button>
                    <button type="button" class="ed-icon-btn ghost danger" data-action="del-option" title="Xóa đáp án ${L}" tabindex="-1"><i class="fas fa-xmark"></i></button>
                </div>
                <input type="text" class="ed-exp-input" data-field="exp" value="${esc(exp)}" placeholder="Vì sao đáp án ${L} ${ok ? 'đúng' : 'sai'}?"${exp ? '' : ' hidden'} />
            </div>`;
    }

    function renderQuestion(q, idx) {
        const incomplete = !isComplete(q);
        const preview = q.question.trim() || 'Câu hỏi chưa có nội dung…';
        const essay = isEssay(q);
        const advCount = [q.note, q.expanded, q.caseText].filter(s => s && s.trim()).length + (q.multi ? 1 : 0);
        const total = quizData.questions.length;
        const collapsed = viewMode === 'all' && q._collapsed;
        return `
            <article class="ed-qcard ${collapsed ? 'collapsed' : ''} ${incomplete ? 'is-incomplete' : ''}${idx === currentIdx ? ' is-active' : ''}" data-idx="${idx}" draggable="false">
                <div class="ed-qhead">
                    <span class="ed-drag-handle" data-action="drag" title="Kéo để sắp xếp"><i class="fas fa-grip-vertical"></i></span>
                    <span class="ed-qnum">${idx + 1}</span>
                    <button type="button" class="ed-qpreview" data-action="toggle" title="${viewMode === 'all' ? 'Bấm để thu gọn / mở' : ''}">${esc(preview)}</button>
                    <span class="ed-issues">${issuesHtml(q)}</span>
                    <div class="ed-qactions">
                        <button type="button" class="ed-icon-btn" data-action="move-up" title="Đưa lên" tabindex="-1" ${idx === 0 ? 'disabled' : ''}><i class="fas fa-arrow-up"></i><span>Đưa lên</span></button>
                        <button type="button" class="ed-icon-btn" data-action="move-down" title="Đưa xuống" tabindex="-1" ${idx === total - 1 ? 'disabled' : ''}><i class="fas fa-arrow-down"></i><span>Đưa xuống</span></button>
                        <button type="button" class="ed-icon-btn" data-action="duplicate" title="Nhân bản" tabindex="-1"><i class="fas fa-clone"></i><span>Nhân bản</span></button>
                        <button type="button" class="ed-icon-btn danger" data-action="del-question" title="Xóa câu (có hoàn tác)" tabindex="-1"><i class="fas fa-trash"></i><span>Xóa câu</span></button>
                    </div>
                    <button type="button" class="ed-icon-btn ed-more" data-action="menu" title="Thao tác" aria-expanded="false"><i class="fas fa-ellipsis"></i></button>
                    <button type="button" class="ed-icon-btn ed-collapse-btn" data-action="toggle" title="Thu gọn / mở" tabindex="-1"><i class="fas fa-chevron-${collapsed ? 'down' : 'up'}"></i></button>
                </div>
                <div class="ed-qbody">
                    <div class="ed-fields">
                        ${q.caseText ? `<div class="ed-case-chip"><i class="fas fa-notes-medical"></i> ${esc(q.caseTitle || 'Ca lâm sàng')} <span>— sửa ở mục Nâng cao</span></div>` : ''}
                        <label class="ed-field-label"><i class="fas fa-circle-question"></i> Nội dung câu hỏi</label>
                        <textarea class="ed-textarea is-question" data-field="question" rows="2" placeholder="Nhập nội dung câu hỏi…">${esc(q.question)}</textarea>

                        ${essay ? `
                        <label class="ed-field-label mt"><i class="fas fa-pen-nib"></i> Đáp án mẫu <small>câu tự luận</small></label>
                        <textarea class="ed-textarea" data-field="modelAnswer" rows="3" placeholder="Đáp án mẫu / ý chính…">${esc(q.modelAnswer)}</textarea>
                        <button class="ed-add-opt" data-action="add-option" type="button"><i class="fas fa-list-ol"></i> Chuyển thành trắc nghiệm (thêm đáp án)</button>` : `
                        <label class="ed-field-label mt"><i class="fas fa-list-check"></i> Đáp án <small>${q.multi ? 'bấm chữ cái để bật/tắt các đáp án đúng' : 'bấm chữ cái để chọn đáp án đúng'}</small></label>
                        <div class="ed-options">${q.options.map((o, i) => optionHtml(q, o, i)).join('')}</div>
                        <button class="ed-add-opt" data-action="add-option" type="button"><i class="fas fa-plus"></i> Thêm đáp án <kbd>Enter</kbd></button>`}

                        <label class="ed-field-label mt"><i class="fas fa-lightbulb"></i> Giải thích chung <small>không bắt buộc</small></label>
                        <textarea class="ed-textarea is-exp" data-field="explanation" rows="2" placeholder="Giải thích chung cho câu hỏi…">${esc(q.explanation)}</textarea>

                        <details class="ed-adv"${advCount ? ' open' : ''}>
                            <summary><i class="fas fa-sliders"></i> Nâng cao <span>ghi chú · mở rộng · ca lâm sàng${essay ? '' : ' · nhiều đáp án'}</span>${advCount ? `<em>${advCount}</em>` : ''}</summary>
                            <div class="ed-adv-body">
                                ${essay ? '' : `<label class="ed-switch"><input type="checkbox" data-field="multi"${q.multi ? ' checked' : ''}><span></span> Câu có <b>nhiều đáp án đúng</b></label>`}
                                <label class="ed-field-label"><i class="fas fa-book-medical"></i> Ghi chú</label>
                                <textarea class="ed-textarea is-note" data-field="note" rows="2" placeholder="Mẹo nhớ, lưu ý khi làm…">${esc(q.note)}</textarea>
                                <label class="ed-field-label mt"><i class="fas fa-layer-group"></i> Mở rộng</label>
                                <textarea class="ed-textarea is-note" data-field="expanded" rows="2" placeholder="Kiến thức mở rộng liên quan…">${esc(q.expanded)}</textarea>
                                <label class="ed-field-label mt"><i class="fas fa-notes-medical"></i> Ca lâm sàng <small>các câu cùng ca nên trùng tiêu đề</small></label>
                                <input type="text" class="ed-input" data-field="caseTitle" value="${esc(q.caseTitle)}" placeholder="Tiêu đề ca (vd: Ca 1 — Đau ngực)" />
                                <textarea class="ed-textarea is-case" data-field="caseText" rows="2" placeholder="Tình huống lâm sàng…">${esc(q.caseText)}</textarea>
                            </div>
                        </details>
                        <p class="ed-markdown-hint"><i class="fas fa-wand-magic-sparkles"></i> Hỗ trợ Markdown: **đậm**, *nghiêng*, \`code\`, bảng, công thức toán, ảnh <code>![](link)</code>.</p>
                    </div>
                    <div class="ed-preview" aria-label="Xem trước"><div class="ed-preview-label"><i class="fas fa-eye"></i> Xem trước như lúc làm bài</div><div class="ed-preview-body"></div></div>
                </div>
            </article>`;
    }

    // Cập nhật trạng thái 1 câu + số liệu chung mà KHÔNG vẽ lại (giữ con trỏ khi gõ)
    function updateStatus(idx) {
        const q = quizData.questions[idx];
        const card = cardEl(idx);
        if (q && card) {
            card.classList.toggle('is-incomplete', !isComplete(q));
            const iss = card.querySelector('.ed-issues');
            if (iss) iss.innerHTML = issuesHtml(q);
        }
        const row = rowEl(idx);
        if (row && q) {
            const tmp = document.createElement('div');
            tmp.innerHTML = rowHtml(q, idx);
            const fresh = tmp.firstElementChild;
            if (row.classList.contains('is-hidden')) fresh.classList.add('is-hidden');
            row.replaceWith(fresh);
        }
        const mini = document.querySelector(`.ed-mini[data-goto="${idx}"]`);
        if (mini && q) mini.className = `ed-mini is-${statusOf(q)}${idx === currentIdx ? ' is-active' : ''}`;
        const c = counts();
        const p = document.getElementById('ed-progress');
        if (p) p.innerHTML = progressHtml(c);
        const f = document.getElementById('ed-filters');
        if (f) f.innerHTML = filtersHtml(c);
    }

    function setActive(idx) {
        if (viewMode === 'all') {
            document.querySelector('.ed-qcard.is-active')?.classList.remove('is-active');
            cardEl(idx)?.classList.add('is-active');
        }
        currentIdx = idx;
        document.querySelector('.ed-row.is-active')?.classList.remove('is-active');
        const r = rowEl(idx);
        if (r) {
            r.classList.add('is-active');
            // Cuộn RIÊNG khung danh sách (scrollIntoView sẽ kéo cả trang theo)
            const box = r.parentElement;
            if (box && box.scrollHeight > box.clientHeight) {
                const top = r.offsetTop, bottom = top + r.offsetHeight;
                if (top < box.scrollTop || bottom > box.scrollTop + box.clientHeight) box.scrollTop = top - box.clientHeight / 2;
            }
        }
    }

    // Chế độ Tất cả: câu đang ở giữa màn hình → sáng trên danh sách
    let io = null;
    function observeCards() {
        io?.disconnect();
        if (viewMode !== 'all' || !('IntersectionObserver' in window)) return;
        io = new IntersectionObserver((entries) => {
            const hit = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
            if (hit && !document.getElementById('ed-stage')?.contains(document.activeElement)) setActive(Number(hit.target.dataset.idx));
        }, { rootMargin: '-35% 0px -55% 0px' });
        document.querySelectorAll('.ed-qcard').forEach(c => io.observe(c));
    }

    // Mở 1 câu: Từng câu → vẽ câu đó lên trang phải; Tất cả → cuộn tới. Điện thoại: chuyển sang màn sửa.
    function goToQuestion(idx, focus = false) {
        const qs = quizData.questions || [];
        if (!Number.isInteger(idx) || idx < 0 || idx >= qs.length) return;
        if (isNarrow() && !document.body.classList.contains('m-detail')) {
            document.body.classList.add('m-detail');
            try { history.pushState({ edDetail: 1 }, ''); } catch (_) {}      // Back của điện thoại → về danh sách
        }
        if (viewMode === 'focus') {
            const dir = idx - currentIdx;
            currentIdx = idx;
            renderStage();
            setActive(idx);
            const stage = document.getElementById('ed-stage');
            const card = cardEl(idx);
            if (card && dir) { card.classList.add(dir > 0 ? 'slide-l' : 'slide-r'); }
            if (stage) {
                const top = stage.getBoundingClientRect().top + window.scrollY - (isNarrow() ? 70 : 84);
                if (window.scrollY > top || isNarrow()) window.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
            }
            if (focus) setTimeout(() => cardEl(idx)?.querySelector('textarea[data-field="question"]')?.focus({ preventScroll: true }), 60);
            return;
        }
        let card = cardEl(idx);
        if (card && card.classList.contains('is-hidden')) { searchTerm = ''; filterMode = 'all'; render(); card = cardEl(idx); }
        if (qs[idx]._collapsed) { qs[idx]._collapsed = false; card?.classList.remove('collapsed'); syncToggleIcon(idx); renderPreview(idx); }
        requestAnimationFrame(() => {
            const c = cardEl(idx);
            if (!c) return;
            c.scrollIntoView({ behavior: smooth(), block: 'center' });
            c.classList.remove('ed-flash'); void c.offsetWidth; c.classList.add('ed-flash');
            setTimeout(() => c.classList.remove('ed-flash'), 2600);
            setActive(idx);
            if (focus) { const ta = c.querySelector('textarea[data-field="question"]'); if (ta) setTimeout(() => ta.focus({ preventScroll: true }), 420); }
        });
    }
    function step(dir) {
        const n = quizData.questions.length;
        const to = currentIdx + dir;
        if (to >= 0 && to < n) goToQuestion(to);
    }
    function backToList() {
        if (history.state && history.state.edDetail) { history.back(); return; }      // popstate lo phần còn lại
        showList();
    }
    function showList() {
        document.body.classList.remove('m-detail');
        setTimeout(() => rowEl(currentIdx)?.scrollIntoView({ block: 'center' }), 0);
    }
    window.addEventListener('popstate', () => { if (document.body.classList.contains('m-detail')) showList(); });

    // ---------- Xem trước Markdown ----------
    let _md = null;
    async function getMd() {
        if (_md) return _md;
        try { const m = await import('../quiz/quiz-helpers.js'); _md = (s) => m.parseMarkdown(s); }
        catch (_) { _md = (s) => esc(s).replace(/\n/g, '<br>'); }
        return _md;
    }
    const previewTimers = new Map();
    function renderPreviewSoon(idx) {
        if (!previewOn) return;
        clearTimeout(previewTimers.get(idx));
        previewTimers.set(idx, setTimeout(() => renderPreview(idx), 250));
    }
    async function renderPreview(idx) {
        if (!previewOn) return;
        const q = quizData.questions[idx];
        const box = cardEl(idx)?.querySelector('.ed-preview-body');
        if (!q || !box) return;
        const md = await getMd();
        const opts = isEssay(q) ? '' : `<ol class="ed-pv-opts">${q.options.map((o, i) => `<li class="${q.correct.includes(i) ? 'is-ok' : ''}"><b>${letterOf(i)}</b><div>${o.trim() ? md(o) : '<i class="ed-pv-empty">trống</i>'}${q.optionExplanations[i] ? `<div class="ed-pv-optexp">${md(q.optionExplanations[i])}</div>` : ''}</div></li>`).join('')}</ol>`;
        box.innerHTML = `
            ${q.caseText ? `<div class="ed-pv-case"><b><i class="fas fa-notes-medical"></i> ${esc(q.caseTitle || 'Ca lâm sàng')}</b>${md(q.caseText)}</div>` : ''}
            <div class="ed-pv-q">${q.question.trim() ? md(q.question) : '<i class="ed-pv-empty">Chưa có nội dung câu hỏi</i>'}</div>
            ${opts}
            ${isEssay(q) && q.modelAnswer ? `<div class="ed-pv-sec is-ok"><b>Đáp án mẫu</b>${md(q.modelAnswer)}</div>` : ''}
            ${q.explanation.trim() ? `<div class="ed-pv-sec is-exp"><b>Giải thích</b>${md(q.explanation)}</div>` : ''}
            ${q.note.trim() ? `<div class="ed-pv-sec is-note"><b>Ghi chú</b>${md(q.note)}</div>` : ''}
            ${q.expanded.trim() ? `<div class="ed-pv-sec is-note"><b>Mở rộng</b>${md(q.expanded)}</div>` : ''}`;
        try { if (window.renderMathInElement) window.renderMathInElement(box, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }], throwOnError: false }); } catch (_) {}
    }

    // Tự động giãn chiều cao textarea theo nội dung
    function autoGrow(el) {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = (el.scrollHeight + 2) + 'px';
    }
    function autoGrowAll() { document.getElementById('ed-stage')?.querySelectorAll('textarea').forEach(autoGrow); }

    // ---------- Lọc / tìm kiếm (danh sách trái; chế độ Tất cả lọc cả thẻ) ----------
    function matches(q) {
        const term = fold(searchTerm.trim());
        const okFilter = filterMode === 'all' || (filterMode === 'todo' && !isComplete(q)) || (filterMode === 'noexp' && !hasExp(q));
        if (!okFilter) return false;
        if (!term) return true;
        const hay = fold([q.question, ...q.options, q.explanation, ...q.optionExplanations, q.note, q.expanded, q.caseTitle, q.caseText, q.modelAnswer].filter(Boolean).join(' '));
        return term.split(/\s+/).every(w => hay.includes(w));
    }
    function applySearch() {
        const qs = quizData.questions || [];
        let visible = 0;
        qs.forEach((q, i) => {
            const show = matches(q);
            if (show) visible++;
            rowEl(i)?.classList.toggle('is-hidden', !show);
            if (viewMode === 'all') {
                const card = cardEl(i);
                card?.classList.toggle('is-hidden', !show);
                card?.nextElementSibling?.classList.toggle('is-hidden', !show);       // ô "Chèn câu" đi kèm
            }
        });
        const active = searchTerm.trim() || filterMode !== 'all';
        const countEl = document.getElementById('q-search-count');
        if (countEl) countEl.textContent = active ? `${visible}/${qs.length}` : '';
        const empty = document.querySelector('.ed-qlist-empty');
        if (empty) empty.hidden = !(active && visible === 0 && qs.length);
    }

    // ---------- Sự kiện (ủy quyền MỘT lần trên #editor-container — nội dung bên trong vẽ lại thoải mái) ----------
    function getIdx(el) { const card = el.closest('.ed-qcard'); return card ? Number(card.dataset.idx) : -1; }
    function getOptIdx(el) { const opt = el.closest('.ed-option'); return opt ? Number(opt.dataset.opt) : -1; }
    function syncToggleIcon(idx) {
        const icon = cardEl(idx)?.querySelector('.ed-collapse-btn i');
        if (icon) icon.className = `fas fa-chevron-${quizData.questions[idx]._collapsed ? 'down' : 'up'}`;
    }
    function focusOpt(idx, oi) {
        const el = cardEl(idx)?.querySelector(`.ed-option[data-opt="${oi}"] .ed-opt-input`);
        if (el) { el.focus(); const n = el.value.length; try { el.setSelectionRange(n, n); } catch (_) {} }
    }

    editorContainer.addEventListener('input', (e) => {
        const t = e.target;
        if (t.id === 'quiz-title-input') { quizData.title = t.value.replace(/\n/g, ' '); autoGrow(t); markDirty(); updatePreviewDebounced(); return; }
        if (t.id === 'quiz-desc-input') { quizData.description = t.value; autoGrow(t); markDirty(); return; }
        if (t.id === 'q-search') { searchTerm = t.value; applySearch(); return; }
        const idx = getIdx(t);
        if (idx < 0) return;
        const q = quizData.questions[idx];
        const field = t.dataset.field;
        if (t.tagName === 'TEXTAREA') autoGrow(t);
        if (field === 'question') {
            q.question = t.value;
            const prev = t.closest('.ed-qcard').querySelector('.ed-qpreview');
            if (prev) prev.textContent = t.value.trim() || 'Câu hỏi chưa có nội dung…';
        } else if (field === 'option') q.options[getOptIdx(t)] = t.value;
        else if (field === 'exp') {
            q.optionExplanations[getOptIdx(t)] = t.value;
            t.closest('.ed-option')?.querySelector('[data-action="toggle-exp"]')?.classList.toggle('has-exp', !!t.value.trim());
        } else if (field === 'multi') {
            q.multi = t.checked;
            if (!q.multi && q.correct.length > 1) q.correct = [q.correct[0]];
            markDirty(); rerenderCard(idx); return;
        } else if (['explanation', 'note', 'expanded', 'caseTitle', 'caseText', 'modelAnswer'].includes(field)) q[field] = t.value;
        else return;
        markDirty();
        updateStatus(idx);
        renderPreviewSoon(idx);
    });

    editorContainer.addEventListener('keydown', (e) => {
        const t = e.target;
        if (t.id === 'quiz-title-input' && e.key === 'Enter') { e.preventDefault(); document.getElementById('quiz-desc-input')?.focus(); return; }
        if (t.id === 'q-search' && e.key === 'Escape') { e.stopPropagation(); t.value = ''; searchTerm = ''; applySearch(); t.blur(); return; }
        if (t.id === 'q-search' && e.key === 'Enter') {
            e.preventDefault();
            const first = quizData.questions.findIndex(matches);
            if (first >= 0) goToQuestion(first);
            return;
        }
        if (t.classList?.contains('ed-row') && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            const rows = [...document.querySelectorAll('.ed-row:not(.is-hidden)')];
            const k = rows.indexOf(t) + (e.key === 'ArrowDown' ? 1 : -1);
            rows[k]?.focus();
            return;
        }
        if (t.dataset.field !== 'option') return;
        const idx = getIdx(t), oi = getOptIdx(t), q = quizData.questions[idx];
        if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            if (oi < q.options.length - 1) focusOpt(idx, oi + 1);
            else if (addOption(idx)) focusOpt(idx, oi + 1);
        } else if (e.key === 'Backspace' && !t.value && q.options.length > 2) {
            e.preventDefault();
            deleteOption(idx, oi);
            focusOpt(idx, Math.max(0, oi - 1));
        }
    });

    editorContainer.addEventListener('focusin', (e) => {
        const idx = getIdx(e.target);
        if (idx >= 0 && viewMode === 'all') setActive(idx);
    });

    editorContainer.addEventListener('click', (e) => {
        const t = e.target;
        if (t.closest('#add-question-btn')) { addQuestion(); return; }
        if (t.closest('#add-paste-btn')) { openPasteModal(); return; }
        if (t.closest('[data-clear-filter]')) { filterMode = 'all'; searchTerm = ''; render(); return; }
        const fb = t.closest('[data-filter]');
        if (fb) {
            filterMode = fb.dataset.filter;
            document.querySelectorAll('#ed-filters .ed-filter').forEach(x => x.classList.toggle('is-on', x === fb));
            applySearch();
            return;
        }
        const row = t.closest('[data-goto]');
        if (row) { goToQuestion(Number(row.dataset.goto)); return; }
        const nav = t.closest('[data-nav]');
        if (nav) { const v = nav.dataset.nav; if (v === 'list') backToList(); else step(Number(v)); return; }
        const vw = t.closest('[data-view]');
        if (vw) { setView(vw.dataset.view); return; }
        const col = t.closest('[data-collapse]');
        if (col) { setAllCollapsed(col.dataset.collapse === '1'); return; }
        if (t.closest('[data-keys]')) {
            const box = document.getElementById('ed-keys');
            if (box) box.hidden = !box.hidden;
            t.closest('[data-keys]').classList.toggle('is-on', box && !box.hidden);
            return;
        }
        const ins = t.closest('[data-insert]');
        if (ins) { addQuestion(Number(ins.dataset.insert)); return; }
        const actionEl = t.closest('[data-action]');
        if (!actionEl) return;
        const action = actionEl.dataset.action;
        const idx = getIdx(actionEl);
        if (idx < 0) return;
        if (action !== 'menu') closeMenus();
        switch (action) {
            case 'set-correct':   setCorrect(idx, getOptIdx(actionEl)); break;
            case 'del-option':    deleteOption(idx, getOptIdx(actionEl)); break;
            case 'add-option':    if (addOption(idx)) focusOpt(idx, quizData.questions[idx].options.length - 1); break;
            case 'toggle-exp': {
                const inp = actionEl.closest('.ed-option')?.querySelector('.ed-exp-input');
                if (inp) { inp.hidden = !inp.hidden; if (!inp.hidden) inp.focus(); }
                break;
            }
            case 'del-question':  deleteQuestion(idx); break;
            case 'duplicate':     duplicateQuestion(idx); break;
            case 'move-up':       moveQuestion(idx, -1); break;
            case 'move-down':     moveQuestion(idx, 1); break;
            case 'toggle':        if (viewMode === 'all') toggleCollapse(idx); break;
            case 'menu': {
                const card = actionEl.closest('.ed-qcard');
                const open = !card.classList.contains('menu-open');
                closeMenus();
                card.classList.toggle('menu-open', open);
                actionEl.setAttribute('aria-expanded', String(open));
                break;
            }
        }
    });

    function closeMenus() {
        document.querySelectorAll('.ed-qcard.menu-open').forEach(c => { c.classList.remove('menu-open'); c.querySelector('[data-action="menu"]')?.setAttribute('aria-expanded', 'false'); });
    }
    document.addEventListener('click', (e) => { if (!e.target.closest('.ed-qactions, [data-action="menu"]')) closeMenus(); });

    function setView(v) {
        if (v === viewMode) return;
        viewMode = v;
        setPref('edView', v);
        document.body.classList.toggle('ed-view-all', v === 'all');
        renderStage();
        if (v === 'all') goToQuestion(currentIdx);
    }

    // Đầu trang + thanh dưới (điện thoại)
    document.getElementById('dock-add')?.addEventListener('click', () => addQuestion());
    document.getElementById('dock-paste')?.addEventListener('click', openPasteModal);
    document.getElementById('dock-list')?.addEventListener('click', backToList);
    document.getElementById('dock-prev')?.addEventListener('click', () => step(-1));
    document.getElementById('dock-next')?.addEventListener('click', () => step(1));
    document.getElementById('ed-paste-btn')?.addEventListener('click', openPasteModal);
    previewBtn?.addEventListener('click', () => {
        previewOn = !previewOn;
        setPref('edPreview', previewOn ? '1' : '0');
        document.body.classList.toggle('ed-preview-on', previewOn);
        previewBtn.setAttribute('aria-pressed', String(previewOn));
        previewBtn.classList.toggle('is-on', previewOn);
        if (previewOn) quizData.questions.forEach((q, i) => { if (cardEl(i)) renderPreview(i); });
    });
    playBtn?.addEventListener('click', async (e) => {
        if (!isDirty) return;
        e.preventDefault();
        await saveQuiz();
        if (!isDirty) location.href = playBtn.href;
    });
    // Kéo cửa sổ rộng ra thành máy tính → bỏ chế độ 2 màn
    window.addEventListener('resize', () => { if (!isNarrow()) document.body.classList.remove('m-detail'); });

    // Nút "lên đầu"
    const topBtn = document.getElementById('ed-top');
    topBtn?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: smooth() }));
    let ticking = false;
    window.addEventListener('scroll', () => {
        if (ticking) return; ticking = true;
        requestAnimationFrame(() => { topBtn?.classList.toggle('is-show', window.scrollY > 700); ticking = false; });
    }, { passive: true });

    let previewTimer = null;
    function updatePreviewDebounced() {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(() => { document.title = (quizData.title?.trim() || 'Bộ đề mới') + ' • Sửa bộ đề'; }, 300);
    }

    // Vẽ lại MỘT thẻ (đổi đáp án, bật nhiều đáp án…) thay vì cả trang
    function rerenderCard(idx) {
        const old = cardEl(idx);
        if (!old) return renderStage();
        const wrap = document.createElement('div');
        wrap.innerHTML = renderQuestion(quizData.questions[idx], idx);
        const fresh = wrap.firstElementChild;
        old.replaceWith(fresh);
        fresh.querySelectorAll('textarea').forEach(autoGrow);
        io?.observe(fresh);
        updateStatus(idx);
        renderPreview(idx);
    }

    // ---------- Hành động câu hỏi ----------
    function addQuestion(at = null, q = blankQuestion()) {
        quizData.questions = quizData.questions || [];
        if (at === null) at = quizData.questions.length;
        at = Math.max(0, Math.min(quizData.questions.length, at));
        quizData.questions.splice(at, 0, q);
        markDirty();
        currentIdx = at;
        render();
        goToQuestion(at, true);
    }

    // Xóa ngay, có Hoàn tác 6 giây (thay hộp hỏi "Bạn có chắc…")
    function deleteQuestion(idx) {
        const [removed] = quizData.questions.splice(idx, 1);
        markDirty();
        currentIdx = Math.min(idx, Math.max(0, quizData.questions.length - 1));
        render();
        if (isNarrow() && quizData.questions.length) goToQuestion(currentIdx);
        showSnack(`Đã xóa câu ${idx + 1}`, 'Hoàn tác', () => {
            quizData.questions.splice(idx, 0, removed);
            markDirty(); currentIdx = idx; render(); goToQuestion(idx);
        });
    }

    function duplicateQuestion(idx) {
        const copy = JSON.parse(JSON.stringify(quizData.questions[idx]));
        copy._collapsed = false;
        quizData.questions.splice(idx + 1, 0, copy);
        markDirty();
        currentIdx = idx + 1;
        render();
        goToQuestion(idx + 1);
        showToast('Đã nhân bản câu hỏi!', 'success', 1500);
    }

    function moveQuestion(idx, dir) {
        const target = idx + dir;
        if (target < 0 || target >= quizData.questions.length) return;
        const [item] = quizData.questions.splice(idx, 1);
        quizData.questions.splice(target, 0, item);
        markDirty();
        currentIdx = target;
        render();
        goToQuestion(target);
    }

    function setCorrect(idx, optIdx) {
        const q = quizData.questions[idx];
        if (!q || optIdx < 0 || optIdx >= q.options.length) return;
        if (q.multi) {
            const has = q.correct.includes(optIdx);
            if (has && q.correct.length === 1) { showToast('Cần ít nhất một đáp án đúng.', 'warning', 1600); return; }
            q.correct = has ? q.correct.filter(i => i !== optIdx) : [...q.correct, optIdx].sort((a, b) => a - b);
        } else q.correct = [optIdx];
        markDirty();
        cardEl(idx)?.querySelectorAll('.ed-option').forEach((opt) => {
            const i = Number(opt.dataset.opt);
            const ok = q.correct.includes(i);
            opt.classList.toggle('is-correct', ok);
            opt.querySelector('.ed-letter')?.setAttribute('aria-pressed', String(ok));
            const expInput = opt.querySelector('.ed-exp-input');
            if (expInput) expInput.placeholder = `Vì sao đáp án ${letterOf(i)} ${ok ? 'đúng' : 'sai'}?`;
            if (ok && i === optIdx) { opt.classList.remove('just-set'); void opt.offsetWidth; opt.classList.add('just-set'); }
        });
        updateStatus(idx);
        renderPreview(idx);
    }

    function addOption(idx) {
        const q = quizData.questions[idx];
        if (q.options.length >= 26) { showToast('Tối đa 26 đáp án mỗi câu.', 'warning'); return false; }
        q.options.push('');
        q.optionExplanations.push('');
        if (q.type === 'essay') delete q.type;           // thêm phương án → thành câu trắc nghiệm
        if (!q.correct.length) q.correct = [0];
        markDirty();
        rerenderCard(idx);
        return true;
    }

    function deleteOption(idx, optIdx) {
        const q = quizData.questions[idx];
        if (q.options.length <= 2) { showToast('Mỗi câu hỏi cần ít nhất 2 đáp án.', 'warning'); return; }
        q.options.splice(optIdx, 1);
        q.optionExplanations.splice(optIdx, 1);
        q.correct = q.correct.filter(i => i !== optIdx).map(i => (i > optIdx ? i - 1 : i));
        if (!q.correct.length) q.correct = [0];
        markDirty();
        rerenderCard(idx);
    }

    function toggleCollapse(idx) {
        const q = quizData.questions[idx];
        q._collapsed = !q._collapsed;
        cardEl(idx)?.classList.toggle('collapsed', q._collapsed);
        syncToggleIcon(idx);
        if (!q._collapsed) { cardEl(idx)?.querySelectorAll('textarea').forEach(autoGrow); renderPreview(idx); }
    }

    function setAllCollapsed(state) {
        quizData.questions.forEach(q => q._collapsed = state);
        renderStage();
    }

    // ---------- Thanh báo có "Hoàn tác" ----------
    let snackTimer = 0;
    function showSnack(msg, actionLabel, onAction) {
        const el = document.getElementById('ed-snack');
        if (!el) return;
        el.innerHTML = `<i class="fas fa-trash-can"></i><span>${esc(msg)}</span>${actionLabel ? `<button type="button">${esc(actionLabel)}</button>` : ''}<i class="ed-snack-timer"></i>`;
        el.hidden = false;
        el.classList.remove('is-show'); void el.offsetWidth; el.classList.add('is-show');
        el.querySelector('button')?.addEventListener('click', () => { hideSnack(); onAction(); }, { once: true });
        clearTimeout(snackTimer);
        snackTimer = setTimeout(hideSnack, 6000);
    }
    function hideSnack() { const el = document.getElementById('ed-snack'); if (el) { el.classList.remove('is-show'); el.hidden = true; } }

    // ---------- Dán nhanh nhiều câu ----------
    // Định dạng dễ dãi: "1. Câu hỏi" / dòng "A. …" là đáp án / "*" đầu hoặc cuối đáp án = đúng / "Đáp án: C" / "Giải thích: …"
    function parseBulk(text) {
        const out = [];
        let cur = null, mode = 'q';
        const finish = () => { if (cur && cur.question.trim() && (cur.options.length >= 2)) out.push(cur); cur = null; mode = 'q'; };
        const start = (t) => { finish(); cur = { question: t, options: [], correct: [], explanation: '' }; mode = 'q'; };
        for (const rawLine of String(text || '').replace(/\r/g, '').split('\n')) {
            const line = rawLine.trim();
            if (!line) { if (cur && cur.options.length >= 2 && mode !== 'q') mode = 'gap'; continue; }
            let m;
            if ((m = line.match(/^(?:đáp án|dap an|đa|answer|ans)\s*(?:đúng)?\s*[:：]\s*([A-Za-z](?:\s*[,;&]\s*[A-Za-z])*)/i)) && cur) {
                cur.correct = m[1].split(/[\s,;&]+/).filter(Boolean).map(L => L.toUpperCase().charCodeAt(0) - 65);
                mode = 'after'; continue;
            }
            if ((m = line.match(/^(?:giải thích|giai thich|gt|explain|explanation)\s*[:：]\s*(.*)$/i)) && cur) { cur.explanation = m[1]; mode = 'exp'; continue; }
            if ((m = line.match(/^(\*?)\s*([A-Za-z])\s*[.)]\s+(.+?)\s*(\*|\(đúng\)|\(dung\))?$/i)) && cur && (mode === 'q' || mode === 'opt') && m[2].toUpperCase().charCodeAt(0) - 65 === cur.options.length) {
                if (m[1] || m[4]) cur.correct.push(cur.options.length);
                cur.options.push(m[3]); mode = 'opt'; continue;
            }
            if ((m = line.match(/^(?:câu|cau|question|q)?\s*\d+\s*[.):]\s*(.+)$/i))) { start(m[1]); continue; }
            if (mode === 'exp') { cur.explanation += '\n' + line; continue; }
            if (!cur || mode === 'gap' || mode === 'after' || mode === 'opt') { start(line); continue; }
            cur.question += '\n' + line;
        }
        finish();
        return out.map(q => normalizeQuestion({ question: q.question, options: q.options, correctAnswerIndexes: q.correct.length ? q.correct : [0], explanation: q.explanation }));
    }

    let pasteModal = null;
    function openPasteModal() {
        if (!pasteModal) {
            pasteModal = document.createElement('div');
            pasteModal.className = 'ed-modal';
            pasteModal.innerHTML = `
                <div class="ed-modal-panel" role="dialog" aria-modal="true" aria-label="Dán nhanh nhiều câu">
                    <header><span class="ed-modal-ic">📋</span><div><h3>Dán nhanh nhiều câu</h3><p>Dán từ Word, ghi chú, ChatGPT… — mình tự tách câu & đáp án.</p></div>
                        <button type="button" class="ed-icon-btn" data-close aria-label="Đóng"><i class="fas fa-xmark"></i></button></header>
                    <div class="ed-modal-body">
                        <textarea class="ed-paste-area" placeholder="1. Thuốc đầu tay tăng huyết áp ở người đái tháo đường?&#10;A. Chẹn beta&#10;B. Ức chế men chuyển *&#10;C. Lợi tiểu quai&#10;D. Chẹn kênh canxi&#10;Giải thích: Bảo vệ thận.&#10;&#10;2. …&#10;Đáp án: C"></textarea>
                        <div class="ed-paste-tips">
                            <span><code>1.</code> hoặc <code>Câu 1:</code> mở đầu câu</span><span><code>A.</code> <code>B)</code> là đáp án</span>
                            <span><code>*</code> đầu/cuối đáp án = đúng</span><span><code>Đáp án: B</code> (nhiều: <code>B, D</code>)</span><span><code>Giải thích: …</code></span>
                        </div>
                        <div class="ed-paste-result" aria-live="polite"></div>
                    </div>
                    <footer><button type="button" class="ed-btn" data-close>Hủy</button><button type="button" class="ed-btn is-main" data-apply disabled><i class="fas fa-wand-magic-sparkles"></i> Thêm câu</button></footer>
                </div>`;
            document.body.appendChild(pasteModal);
            const area = pasteModal.querySelector('textarea');
            const result = pasteModal.querySelector('.ed-paste-result');
            const apply = pasteModal.querySelector('[data-apply]');
            let parsed = [];
            area.addEventListener('input', () => {
                parsed = parseBulk(area.value);
                apply.disabled = !parsed.length;
                apply.innerHTML = `<i class="fas fa-wand-magic-sparkles"></i> Thêm ${parsed.length || ''} câu`;
                result.innerHTML = !area.value.trim() ? '' : parsed.length
                    ? `<b>Nhận ra ${parsed.length} câu</b><ol>${parsed.slice(0, 6).map(q => `<li>${esc(q.question.slice(0, 90))} <em>${q.options.length} đáp án · đúng ${q.correct.map(letterOf).join(', ')}</em></li>`).join('')}</ol>${parsed.length > 6 ? `<small>…và ${parsed.length - 6} câu nữa</small>` : ''}`
                    : '<span class="is-warn">Chưa nhận ra câu nào — mỗi câu cần ít nhất 2 dòng đáp án A., B.…</span>';
            });
            pasteModal.addEventListener('click', (e) => {
                if (e.target === pasteModal || e.target.closest('[data-close]')) closePaste();
                else if (e.target.closest('[data-apply]') && parsed.length) {
                    const qs = quizData.questions;
                    // Bộ đề chỉ có đúng một câu trống (mới tạo) → thay luôn câu trống đó
                    if (qs.length === 1 && !qs[0].question.trim() && qs[0].options.every(o => !o.trim())) qs.length = 0;
                    const at = qs.length;
                    qs.push(...parsed);
                    markDirty(); closePaste(); currentIdx = at; render(); goToQuestion(at);
                    showToast(`Đã thêm ${parsed.length} câu từ văn bản dán!`, 'success');
                    area.value = ''; area.dispatchEvent(new Event('input'));
                }
            });
            pasteModal.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePaste(); });
        }
        pasteModal.classList.add('is-open');
        document.documentElement.classList.add('ed-lock');
        setTimeout(() => pasteModal.querySelector('textarea').focus(), 50);
    }
    function closePaste() { pasteModal?.classList.remove('is-open'); document.documentElement.classList.remove('ed-lock'); }

    // ---------- Kéo-thả sắp xếp (chế độ Tất cả) ----------
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
            document.body.classList.add('ed-dragging');
            e.dataTransfer.effectAllowed = 'move';
            try { e.dataTransfer.setData('text/plain', String(dragIdx)); } catch (_) {}
        });
        list.addEventListener('dragover', (e) => {
            e.preventDefault();
            const card = e.target.closest('.ed-qcard');
            list.querySelectorAll('.ed-qcard').forEach(c => c.classList.remove('drop-above', 'drop-below'));
            if (!card || Number(card.dataset.idx) === dragIdx) return;
            const rect = card.getBoundingClientRect();
            card.classList.add(e.clientY > rect.top + rect.height / 2 ? 'drop-below' : 'drop-above');
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
            currentIdx = targetIdx;
            render();
            goToQuestion(targetIdx);
        });
        list.addEventListener('dragend', () => {
            document.body.classList.remove('ed-dragging');
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
            let correct = (q.correct || []).filter(i => i >= 0 && i < options.length);
            if (!correct.length) correct = [0];
            const first = correct[0];
            const optionExplanations = Array.isArray(q.optionExplanations) ? q.optionExplanations.slice(0, options.length) : [];
            while (optionExplanations.length < options.length) optionExplanations.push('');
            const out = {
                ...(q._keep || {}),                // trường lạ (ảnh, thẻ, nguồn…) giữ nguyên — trường chuẩn bên dưới ghi đè
                question: q.question,
                options,
                answers: options.slice(),       // engine single-player đọc answers||options
                optionExplanations,
                explanation: q.explanation || '',
                correctAnswerIndex: first,      // canonical 0-based
                answer: first + 1               // tương thích đường collab (1-based)
            };
            if (q.multi && correct.length > 1) out.correctAnswerIndexes = correct;
            if (q.note && q.note.trim()) out.note = q.note;
            if (q.expanded && q.expanded.trim()) out.expanded = q.expanded;
            if (q.caseId && String(q.caseId).trim()) out.caseId = String(q.caseId).trim();
            if (q.caseText && String(q.caseText).trim()) out.caseText = String(q.caseText).trim();
            if (q.caseTitle && String(q.caseTitle).trim()) out.caseTitle = String(q.caseTitle).trim();
            if (q.caseReveal && String(q.caseReveal).trim()) out.caseReveal = String(q.caseReveal).trim();
            if (Number(q.maxScore) > 0) out.maxScore = Number(q.maxScore);
            // Câu tự luận (thêm phương án trong editor thì thành câu trắc nghiệm bình thường)
            if (q.type === 'essay' && options.length === 0) {
                delete out.correctAnswerIndex; delete out.answer;
                out.type = 'essay';
                if (q.modelAnswer) out.modelAnswer = q.modelAnswer;
                if (Array.isArray(q.keyPoints) && q.keyPoints.length) out.keyPoints = q.keyPoints;
                if (q.answerFormat) out.answerFormat = q.answerFormat;
            }
            return out;
        });
        return {
            title: quizData.title?.trim() || 'Bộ đề mới không tiêu đề',
            description: quizData.description || '',
            questions
        };
    }

    function validateBeforeSave() {
        const qs = quizData.questions || [];
        if (qs.length === 0) { showToast('Hãy thêm ít nhất một câu hỏi trước khi lưu.', 'warning'); return false; }
        const blank = qs.findIndex(q => !q.question.trim());
        if (blank !== -1) { showToast(`Câu ${blank + 1} chưa có nội dung.`, 'warning'); goToQuestion(blank, true); return false; }
        return true;
    }

    async function saveQuiz() {
        if (isSaving) return;
        const user = sessionUser();
        if (!user) { showToast('Bạn cần đăng nhập để lưu.', 'error'); return; }
        if (!validateBeforeSave()) return;

        isSaving = true;
        setStatus('saving');
        saveBtn.disabled = true;
        if (fabSave) fabSave.disabled = true;

        const payload = serializeForSave();
        try {
            if (quizId && quizData.userId && quizData.userId !== user.uid) {
                // "Người chỉnh sửa" được chia sẻ: luật editsAsEditor CHỈ cho ghi nội dung — không đụng userId, quyền chia sẻ, thư mục…
                await updateDoc(doc(db, "quiz_sets", quizId), {
                    title: payload.title, description: payload.description, questions: payload.questions,
                    questionCount: payload.questions.length, updatedAt: serverTimestamp()
                });
                if (isOfflineSavedSync(quizId)) autoCacheQuiz(quizId, { ...quizData, ...payload }).then(() => stampLocal(quizId));
            } else if (quizId) {
                await setDoc(doc(db, "quiz_sets", quizId), { ...quizData, ...payload, questionCount: payload.questions.length, userId: user.uid, updatedAt: serverTimestamp() }, { merge: true });
                // Bản tải về máy phải theo kịp, không thì làm bài offline vẫn ra câu hỏi cũ
                if (isOfflineSavedSync(quizId)) autoCacheQuiz(quizId, { ...quizData, ...payload, userId: user.uid }).then(() => stampLocal(quizId));
            } else {
                // Tạo id ngay trên máy (thay addDoc) → lưu được cả khi mất mạng, Firestore tự đẩy lên sau
                const ref = doc(collection(db, "quiz_sets"));
                await setDoc(ref, { ...payload, userId: user.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), folderId: null });
                quizId = ref.id;
                const url = new URL(window.location.href);
                url.searchParams.set('id', quizId);
                history.replaceState(null, '', url);
                updatePlayLink();
            }
            isDirty = false;
            lastSavedAt = Date.now();
            try { localStorage.removeItem(draftKey()); } catch (_) {}
            setStatus('saved');
            [saveBtn, fabSave].forEach(b => { if (!b) return; b.classList.remove('just-saved'); void b.offsetWidth; b.classList.add('just-saved'); });
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

    // Phím tắt toàn trang
    document.addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();
        const typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]');
        if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); saveQuiz(); return; }
        if (pasteModal?.classList.contains('is-open')) return;
        if ((e.ctrlKey || e.metaKey) && k === 'enter') { e.preventDefault(); addQuestion(currentIdx + 1); return; }
        if (e.altKey && (k === 'arrowdown' || k === 'arrowup')) { e.preventDefault(); step(k === 'arrowdown' ? 1 : -1); return; }
        if (e.altKey && /^[1-9]$/.test(e.key)) { e.preventDefault(); setCorrect(currentIdx, Number(e.key) - 1); return; }
        if (k === '/' && !typing) { e.preventDefault(); document.getElementById('q-search')?.focus(); return; }
        if (k === 'escape') closeMenus();
    });

    // Cảnh báo khi rời trang lúc còn thay đổi chưa lưu
    window.addEventListener('beforeunload', (e) => {
        if (isDirty) { e.preventDefault(); e.returnValue = ''; }
    });
});
