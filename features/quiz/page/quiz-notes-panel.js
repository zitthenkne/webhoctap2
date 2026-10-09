// File: features/quiz/page/quiz-notes-panel.js
// Panel "Ghi chú cá nhân" (cột phải): markup + logic nạp/tự lưu/tự giãn/đếm ký tự/thu gọn/xóa nhanh.
// Nâng cấp 2026-10-07: 8 chip nhãn (Nhớ / Dễ nhầm / Hỏi lại / Nguồn / Cơ chế / Chẩn đoán / Điều trị / Việc cần làm),
// gõ danh sách thông minh (Enter nối tiếp "- " "1." "☐"; Ctrl+Space tích ☐/☑; Ctrl+Enter hoặc Esc về phím tắt),
// đọc để ghi (SpeechRecognition vi-VN), nút "Tất cả" mở sổ ghi chú cả bộ đề (quiz-notes-all.js), phím Q ghi nhanh,
// chấm ghi chú trên bảng số câu. Dữ liệu vẫn là MỘT bản đồ quiz_notes_<id>[nội dung câu] = chữ → không đổi lược đồ đồng bộ.

import { state } from '../quiz-state.js';
import { showToast } from '../../../core/utils.js';
import { pushStudyToCloud } from './quiz-study-sync.js';
import { sfx, scrollBehaviorFor } from './quiz-page-prefs.js';
import { syncQuizNavPanel } from '../quiz-ui.js';
import { applyMark, renderMarkControl, setupMarkControl, refreshMarkedPanel } from './quiz-marks.js';

// Nhãn chèn nhanh + biểu thức nhận ra nhãn ở đầu dòng (để lọc theo nhãn ở sổ ghi chú)
export const NOTE_TAGS = [
    { label: 'Quan trọng', snip: '⭐ ', icon: 'fa-star', re: /^⭐/ },
    { label: 'Nhớ', snip: 'Nhớ: ', icon: 'fa-lightbulb', re: /^nhớ\s*:/ },
    { label: 'Dễ nhầm', snip: 'Dễ nhầm với: ', icon: 'fa-triangle-exclamation', re: /^dễ nhầm(?: với)?\s*:/ },
    { label: 'Hỏi lại', snip: 'Hỏi lại: ', icon: 'fa-circle-question', re: /^hỏi lại\s*:/ },
    { label: 'Nguồn', snip: 'Nguồn: ', icon: 'fa-book-bookmark', re: /^nguồn\s*:/ },
    { label: 'Cơ chế', snip: 'Cơ chế: ', icon: 'fa-brain', re: /^cơ chế\s*:/ },
    { label: 'Chẩn đoán', snip: 'Chẩn đoán: ', icon: 'fa-magnifying-glass', re: /^chẩn đoán\s*:/ },
    { label: 'Điều trị', snip: 'Điều trị: ', icon: 'fa-notes-medical', re: /^điều trị\s*:/ },
    { label: 'Việc cần làm', snip: '☐ ', icon: 'fa-list-check', re: /^☐/ }
];
// Nhãn có trong một ghi chú (mỗi nhãn tính một lần, không phân biệt hoa thường / dấu đầu dòng)
export function noteTagsOf(text) {
    const found = new Set();
    String(text || '').normalize('NFC').split('\n').forEach((raw) => {
        const line = raw.trim().replace(/^[-•*]\s*/, '').toLowerCase();
        NOTE_TAGS.forEach(t => { if (t.re.test(line)) found.add(t.label); });
    });
    return found;
}

// Một ghi chú → HTML (dùng ở sổ ghi chú + màn kết quả): nhãn đầu dòng in đậm, ☐/☑ thành ô tích; mọi chữ đều được thoát HTML
const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// **đậm** và *nghiêng* trong ghi chú (áp lên chuỗi ĐÃ thoát HTML nên không chèn được thẻ lạ)
function inlineMd(h) {
    return h.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*\w])\*([^\s*][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
}
function noteLineHtml(raw, ln, interactive) {
    const line = String(raw);
    const lead = /^(\s*(?:[-•*]\s*)?)/.exec(line)[1];
    const body = line.slice(lead.length);
    const low = body.normalize('NFC').toLowerCase();
    const tag = NOTE_TAGS.find(t => t.label !== 'Việc cần làm' && t.label !== 'Quan trọng' && t.re.test(low));
    if (tag) {
        const c = body.indexOf(':') + 1;
        return escHtml(lead) + `<b class="na-tag">${escHtml(body.slice(0, c))}</b>` + inlineMd(escHtml(body.slice(c)));
    }
    if (body[0] === '☐' || body[0] === '☑') {
        const done = body[0] === '☑';
        // interactive (khung xem trong panel ghi chú): ô tích bấm được, bấm là đảo ☐/☑ ngay trong ô gõ (data-ln = số dòng)
        const box = interactive
            ? `<span class="na-todo is-click${done ? ' is-done' : ''}" role="checkbox" aria-checked="${done}" aria-label="${escHtml(body.slice(1).trim().slice(0, 60) || 'Việc cần làm')}" tabindex="0" data-ln="${ln}"></span>`
            : `<span class="na-todo${done ? ' is-done' : ''}" aria-hidden="true"></span>`;
        return escHtml(lead) + box + inlineMd(escHtml(body.slice(1)));
    }
    return inlineMd(escHtml(line));
}
export function noteTextHtml(text, interactive = false) { return String(text).split('\n').map((l, i) => noteLineHtml(l, i, interactive)).join('\n'); }

// Mẫu ghi chú theo kiểu học y: chèn khung nhiều dòng tại con trỏ
export const NOTE_TEMPLATES = [
    { label: 'SOAP', text: 'S (cơ năng): \nO (thực thể): \nA (chẩn đoán): \nP (kế hoạch): ' },
    { label: '5 bước biện luận', text: '1. Hội chứng: \n2. Chẩn đoán sơ bộ: \n3. Chẩn đoán phân biệt: \n4. Cận lâm sàng: \n5. Xử trí: ' },
    { label: 'Cơ chế – Chẩn đoán – Điều trị', text: 'Cơ chế: \nChẩn đoán: \nĐiều trị: ' },
    { label: 'So sánh A và B', text: 'A: \nB: \nKhác nhau chính: ' },
    { label: 'Hỏi – đáp', text: 'Hỏi: \nĐáp: ' }
];

export function quizNotesKey() {
    const id = (state.quizData && state.quizData.id) || (new URLSearchParams(window.location.search)).get('id') || 'default_quiz';
    return `quiz_notes_${id}`;
}
export function readNotes() {
    try { return JSON.parse(localStorage.getItem(quizNotesKey()) || '{}') || {}; } catch (e) { return {}; }
}
export function noteCount() {
    return Object.values(readNotes()).filter(v => String(v).trim()).length;
}

// Markup panel ghi chú cá nhân (đặt ở cột phải; logic được nối trong showQuestion)
export function renderPersonalNotePanel() {
    const chips = NOTE_TAGS.map(t => `<button type="button" data-note-snip="${t.snip}"><i class="fas ${t.icon}"></i> ${t.label}</button>`).join('');
    return `
        <div class="quiz-panel-drag focus-hide" data-panel="note" role="separator" aria-label="Kéo để xích bảng ghi chú lên/xuống" title="Kéo để xích bảng lên/xuống • bấm đúp để trả về"><i class="fas fa-grip-lines"></i></div>
        <div id="personal-note-box" class="quiz-note-box">
            <button type="button" id="note-toggle" class="quiz-note-header" aria-expanded="true" aria-controls="note-body">
                <span class="quiz-note-title">
                    <i class="fas fa-sticky-note"></i> Ghi chú cá nhân
                    <span id="note-dot" class="quiz-note-dot hidden" title="Câu này đã có ghi chú"></span>
                </span>
                <span class="quiz-note-meta">
                    <span id="note-save-status" class="text-xs font-medium opacity-0 transition-opacity duration-300">
                        <i class="fas fa-check-circle mr-1"></i>Đã lưu
                    </span>
                    <i id="note-chevron" class="fas fa-chevron-up quiz-note-chevron"></i>
                </span>
            </button>
            <div id="note-body" class="quiz-note-body">
                <textarea id="personal-note-input"
                    class="quiz-note-input"
                    rows="2"
                    placeholder="Ghi chú cho câu này — tự động lưu"
                    title="Gõ “- ” hoặc “1. ” để lập danh sách (Enter nối tiếp) · Ctrl+Space tích ☐/☑ · Ctrl+Enter hoặc Esc để về phím tắt"></textarea>
                <div id="note-preview" class="quiz-note-preview hidden" aria-label="Xem ghi chú đã định dạng"></div>
                <div id="note-listen" class="quiz-note-listen hidden" aria-live="polite"></div>
                <!-- Chèn nhanh nhãn đầu dòng hay dùng khi ghi chú ôn thi -->
                <div class="quiz-note-snips" role="group" aria-label="Chèn nhanh">${chips}</div>
                <div id="note-tpls" class="quiz-note-snips quiz-note-tpls hidden" role="group" aria-label="Mẫu ghi chú">${NOTE_TEMPLATES.map((t, i) => `<button type="button" data-note-tpl="${i}">${t.label}</button>`).join('')}</div>
                <div class="quiz-note-footer">
                    <span id="note-char-count" class="quiz-note-count">Chưa có ghi chú</span>
                    <span class="quiz-note-actions">
                        <button type="button" id="note-b-btn" class="quiz-note-act is-fmt" title="In đậm (Ctrl+B): **chữ**" aria-label="In đậm"><b>B</b></button>
                        <button type="button" id="note-i-btn" class="quiz-note-act is-fmt" title="In nghiêng (Ctrl+I): *chữ*" aria-label="In nghiêng"><em>I</em></button>
                        <button type="button" id="note-view-btn" class="quiz-note-act" title="Xem ghi chú đã định dạng (đậm, nghiêng, ô tích bấm được)" aria-pressed="false"><i class="fas fa-eye"></i> Xem</button>
                        <button type="button" id="note-tpl-btn" class="quiz-note-act" title="Mẫu ghi chú: SOAP, 5 bước biện luận, so sánh…" aria-expanded="false"><i class="fas fa-list-ol"></i> Mẫu</button>
                        <button type="button" id="note-mic-btn" class="quiz-note-act hidden" title="Đọc để ghi (tiếng Việt) — bấm lần nữa để dừng" aria-pressed="false"><i class="fas fa-microphone"></i> Đọc</button>
                        <button type="button" id="note-all-btn" class="quiz-note-act" title="Sổ ghi chú cả bộ đề: tìm, lọc theo nhãn, nhảy tới câu (Shift+Q)"><i class="fas fa-list-ul"></i> Tất cả <b id="note-all-count">0</b></button>
                        <button type="button" id="note-clear-btn" class="quiz-note-clear hidden">
                            <i class="fas fa-eraser mr-1"></i>Xóa ghi chú
                        </button>
                    </span>
                </div>
            </div>
        </div>`;
}

// Đánh dấu "Cần ôn lại" tại chỗ khi ghi chú có nhãn Hỏi lại: chỉ thay nút đánh dấu (KHÔNG vẽ lại cả câu — sẽ mất con trỏ ô đang gõ)
const askAuto = new Set();
function autoMarkAsk(idx) {
    applyMark(idx, 'review');
    if (state.currentIndex === idx) {
        const ctl = document.getElementById('mark-control');
        if (ctl) { ctl.outerHTML = renderMarkControl(); setupMarkControl(); }
    }
    refreshMarkedPanel();
    syncQuizNavPanel();
}

/* ---------------------------------------------------------------- Đọc để ghi */
const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
let rec = null, recOn = false;
function stopDictation() {
    recOn = false;
    if (rec) { try { rec.onend = null; rec.stop(); } catch (e) { } rec = null; }
}
function toggleDictation(input, ui) {
    if (recOn) { stopDictation(); ui.off(); return; }
    const r = new SR();
    r.lang = 'vi-VN'; r.continuous = true; r.interimResults = true;
    r.onresult = (ev) => {
        let fin = '', interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
            const t = ev.results[i][0].transcript;
            if (ev.results[i].isFinal) fin += t; else interim += t;
        }
        if (fin.trim()) {
            const v = input.value;
            input.value = v + (v && !/\s$/.test(v) ? ' ' : '') + fin.trim();
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        ui.interim(interim);
    };
    r.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
            recOn = false; ui.off();
            showToast('Chưa được cấp quyền micro cho trang này.', 'error');
        } else if (e.error === 'network') {
            recOn = false; ui.off();
            showToast('Nhận giọng nói cần có mạng.', 'error');
        }
    };
    // Trình duyệt tự ngắt sau một quãng lặng -> nối lại nếu người dùng chưa bấm dừng
    r.onend = () => {
        if (!recOn) { ui.off(); return; }
        try { r.start(); } catch (e) { recOn = false; ui.off(); }
    };
    try { recOn = true; rec = r; r.start(); ui.on(); } catch (e) { recOn = false; rec = null; ui.off(); }
}

/* ---------------------------------------------------------------- Gõ danh sách thông minh */
function lineBounds(v, pos) {
    return { start: v.lastIndexOf('\n', pos - 1) + 1 };
}
// Enter trên dòng có dấu đầu dòng → dòng mới cùng kiểu (số tự tăng); dòng chỉ có dấu → kết thúc danh sách
function continueList(input, e) {
    const v = input.value, a = input.selectionStart;
    if (a !== input.selectionEnd) return;
    const { start } = lineBounds(v, a);
    const m = /^(\s*)([-•*]|\d{1,3}[.)]|[☐☑])\s+(.*)$/.exec(v.slice(start, a));
    if (!m) return;
    e.preventDefault();
    const [, indent, mark, rest] = m;
    if (!rest.trim()) {
        input.setRangeText('', start, a, 'end');
    } else {
        const next = /^\d/.test(mark) ? (parseInt(mark, 10) + 1) + mark.replace(/^\d+/, '') : (mark === '☑' ? '☐' : mark);
        input.setRangeText('\n' + indent + next + ' ', a, a, 'end');
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
}
// Ctrl+B / Ctrl+I (hoặc nút B / I): bọc vùng chọn bằng ** hoặc *; đã bọc rồi thì bỏ; không chọn gì thì chèn cặp dấu và đặt con trỏ giữa
function wrapSelection(input, mark) {
    const v = input.value, a = input.selectionStart, b = input.selectionEnd, m = mark.length;
    if (a !== b && v.slice(a - m, a) === mark && v.slice(b, b + m) === mark) {
        input.setRangeText(v.slice(a, b), a - m, b + m, 'end');
        input.setSelectionRange(a - m, b - m);
    } else if (a !== b) {
        input.setRangeText(mark + v.slice(a, b) + mark, a, b, 'end');
        input.setSelectionRange(a + m, b + m);
    } else {
        input.setRangeText(mark + mark, a, a, 'end');
        input.setSelectionRange(a + m, a + m);
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

// Ctrl+Space: ☐ → ☑ → ☐; dòng thường → thêm ☐ đầu dòng
function toggleTodo(input) {
    const v = input.value, a = input.selectionStart;
    const { start } = lineBounds(v, a);
    const c = v[start];
    if (c === '☐' || c === '☑') input.setRangeText(c === '☐' ? '☑' : '☐', start, start + 1, 'preserve');
    else input.setRangeText('☐ ', start, start, 'preserve');
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

/* ---------------------------------------------------------------- Ghi nhanh (phím Q) */
// Màn rộng: nhảy vào ô ghi chú ở cột phải. Chế độ tập trung: sổ ghi chú trượt lên từ đáy (CSS: body.fm-note-open).
export function openQuickNote() {
    const input = document.getElementById('personal-note-input');
    if (!input) return;
    const box = document.getElementById('personal-note-box');
    document.body.classList.add('fm-note-open');
    if (box && box.classList.contains('collapsed')) {
        box.classList.remove('collapsed');
        document.getElementById('note-toggle')?.setAttribute('aria-expanded', 'true');
        try { localStorage.setItem('quiz_note_collapsed', '0'); } catch (e) { }
    }
    input.focus({ preventScroll: true });
    const v = input.value.length;
    input.setSelectionRange(v, v);
    if (window.innerWidth < 1024 && !document.body.classList.contains('focus-mode-active')) {
        input.scrollIntoView({ block: 'center', behavior: scrollBehaviorFor() });
    }
}
export function closeQuickNote() {
    document.body.classList.remove('fm-note-open');
    const a = document.activeElement;
    if (a && a.id === 'personal-note-input') a.blur();
}

// Nối logic ghi chú cá nhân cho câu hiện tại: nạp nội dung đã lưu, tự lưu, tự giãn,
// đếm ký tự, thu gọn/mở rộng, xóa nhanh. Tách riêng để chạy được trên mọi nhánh render.
export function setupPersonalNote(question) {
    const noteInput = document.getElementById('personal-note-input');
    const noteStatus = document.getElementById('note-save-status');
    if (!noteInput) return;
    stopDictation();   // vẽ lại câu = ô nhập mới, phiên đọc cũ không còn ô để ghi

    const noteBox = document.getElementById('personal-note-box');
    const noteToggle = document.getElementById('note-toggle');
    const noteDot = document.getElementById('note-dot');
    const charCountEl = document.getElementById('note-char-count');
    const noteClearBtn = document.getElementById('note-clear-btn');
    const allCount = document.getElementById('note-all-count');
    const micBtn = document.getElementById('note-mic-btn');
    const listenEl = document.getElementById('note-listen');

    const storageKey = quizNotesKey();
    const notesObj = readNotes();

    const qText = question.question;
    noteInput.value = notesObj[qText] || '';
    let valueAtFocus = noteInput.value;

    // Tự giãn chiều cao textarea theo nội dung (giới hạn rồi cuộn)
    const autoGrow = () => {
        noteInput.style.height = 'auto';
        noteInput.style.height = Math.min(noteInput.scrollHeight, 260) + 'px';
    };
    // Cập nhật bộ đếm ký tự, chấm báo có ghi chú, nút xóa, số ghi chú cả bộ
    const refreshMeta = () => {
        const len = noteInput.value.length;
        const has = noteInput.value.trim().length > 0;
        if (charCountEl) charCountEl.textContent = has ? `${len} ký tự` : 'Chưa có ghi chú';
        if (noteDot) noteDot.classList.toggle('hidden', !has);
        if (noteClearBtn) noteClearBtn.classList.toggle('hidden', !has);
    };
    const refreshAll = () => { if (allCount) allCount.textContent = String(noteCount()); };

    // Trạng thái lưu (đang lưu / đã lưu / lỗi)
    const showSaving = () => {
        if (!noteStatus) return;
        noteStatus.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Đang lưu...';
        noteStatus.classList.remove('opacity-0', 'text-green-600', 'text-red-500');
        noteStatus.classList.add('opacity-100', 'text-gray-500');
    };
    const showSaved = () => {
        if (!noteStatus) return;
        noteStatus.innerHTML = '<i class="fas fa-check-circle mr-1"></i>Đã lưu';
        noteStatus.classList.remove('text-gray-500', 'text-red-500', 'opacity-0');
        noteStatus.classList.add('text-green-600', 'opacity-100');
        clearTimeout(noteStatus._hideT);
        noteStatus._hideT = setTimeout(() => {
            noteStatus.classList.add('opacity-0');
            noteStatus.classList.remove('opacity-100');
        }, 1500);
    };
    const showError = () => {
        if (!noteStatus) return;
        noteStatus.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i>Lỗi khi lưu';
        noteStatus.classList.remove('text-gray-500', 'text-green-600', 'opacity-0');
        noteStatus.classList.add('text-red-500', 'opacity-100');
    };

    const idxAtSetup = state.currentIndex;   // câu của ô ghi chú này (persist có thể chạy sau khi đã chuyển câu)
    const persist = (val) => {
        try {
            const currentNotes = JSON.parse(localStorage.getItem(storageKey) || '{}');
            if (val.trim() === '') {
                delete currentNotes[qText];
            } else {
                currentNotes[qText] = val;
            }
            localStorage.setItem(storageKey, JSON.stringify(currentNotes));
            showSaved();
            refreshAll();
            syncQuizNavPanel();   // chấm ghi chú trên ô số câu
            pushStudyToCloud();
            // Ghi "Hỏi lại: …" = muốn quay lại câu này → tự đánh dấu "Cần ôn lại" (một lần cho mỗi câu; bỏ đánh dấu rồi không tự gắn lại)
            if (val.trim() && !askAuto.has(qText) && noteTagsOf(val).has('Hỏi lại') && !state.markedQuestions.includes(idxAtSetup)) {
                askAuto.add(qText);
                autoMarkAsk(idxAtSetup);
            }
        } catch(err) {
            console.error("Lỗi lưu ghi chú:", err);
            showError();
        }
    };

    // Khởi tạo hiển thị
    autoGrow();
    refreshMeta();
    refreshAll();

    // Thu gọn / mở rộng panel (ghi nhớ lựa chọn cho toàn phiên). Chế độ tập trung: bấm tiêu đề = đóng sổ trượt.
    if (noteToggle && noteBox) {
        const collapsed = localStorage.getItem('quiz_note_collapsed') === '1';
        noteBox.classList.toggle('collapsed', collapsed);
        noteToggle.setAttribute('aria-expanded', String(!collapsed));
        noteToggle.addEventListener('click', () => {
            if (document.body.classList.contains('focus-mode-active')) { closeQuickNote(); return; }
            const nowCollapsed = !noteBox.classList.contains('collapsed');
            noteBox.classList.toggle('collapsed', nowCollapsed);
            noteToggle.setAttribute('aria-expanded', String(!nowCollapsed));
            localStorage.setItem('quiz_note_collapsed', nowCollapsed ? '1' : '0');
            if (!nowCollapsed) autoGrow();
        });
    }

    let saveTimeout;
    noteInput.addEventListener('input', () => {
        autoGrow();
        refreshMeta();
        clearTimeout(saveTimeout);
        showSaving();
        saveTimeout = setTimeout(() => persist(noteInput.value), 600);
    });
    noteInput.addEventListener('focus', () => { valueAtFocus = noteInput.value; });
    // Lưu ngay khi rời ô nhập (không phải chờ debounce); có thay đổi thật thì "tách" một tiếng
    noteInput.addEventListener('blur', () => {
        clearTimeout(saveTimeout);
        persist(noteInput.value);
        if (noteInput.value.trim() !== valueAtFocus.trim()) sfx('noteSave');
    });
    noteInput.addEventListener('keydown', (e) => {
        if (e.isComposing) return;   // đang gõ Telex/VNI: Enter chỉ chốt chữ
        if (e.key === 'Escape') { e.stopPropagation(); closeQuickNote(); return; }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); closeQuickNote(); return; }
        if (e.key === ' ' && e.ctrlKey) { e.preventDefault(); toggleTodo(noteInput); return; }
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); wrapSelection(noteInput, '**'); return; }
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); wrapSelection(noteInput, '*'); return; }
        if (e.key === 'Enter' && !e.shiftKey && !e.altKey) continueList(noteInput, e);
    });
    // Chèn nhanh: thêm đầu dòng tại con trỏ (xuống dòng mới nếu ô đã có chữ) rồi đi qua luồng tự lưu
    noteBox && noteBox.querySelectorAll('[data-note-snip]').forEach((b) => {
        b.addEventListener('click', () => {
            const snip = b.getAttribute('data-note-snip');
            const v = noteInput.value;
            const pos = typeof noteInput.selectionStart === 'number' ? noteInput.selectionStart : v.length;
            const before = v.slice(0, pos), after = v.slice(pos);
            const lead = before && !before.endsWith('\n') ? '\n' : '';
            noteInput.value = before + lead + snip + after;
            const caret = (before + lead + snip).length;
            noteInput.focus();
            noteInput.setSelectionRange(caret, caret);
            noteInput.dispatchEvent(new Event('input', { bubbles: true }));
        });
    });

    // Khung "Xem": ghi chú đã định dạng ngay dưới ô gõ; ô tích ☐/☑ bấm được (đảo ký tự ở đúng dòng trong ô gõ). Nhớ trạng thái mở.
    const viewBtn = document.getElementById('note-view-btn'), preview = document.getElementById('note-preview');
    if (viewBtn && preview) {
        const paint = () => {
            const v = noteInput.value;
            preview.innerHTML = v.trim() ? noteTextHtml(v, true) : '<span class="qnp-empty">Chưa có gì để xem.</span>';
        };
        const open0 = localStorage.getItem('quiz_note_preview') === '1';
        preview.classList.toggle('hidden', !open0);
        viewBtn.setAttribute('aria-pressed', String(open0));
        if (open0) paint();
        viewBtn.addEventListener('click', () => {
            const open = preview.classList.toggle('hidden') === false;
            viewBtn.setAttribute('aria-pressed', String(open));
            try { localStorage.setItem('quiz_note_preview', open ? '1' : '0'); } catch (e) { }
            if (open) paint();
        });
        noteInput.addEventListener('input', () => { if (!preview.classList.contains('hidden')) paint(); });
        const flip = (box) => {
            const lines = noteInput.value.split('\n'), i = +box.dataset.ln;
            if (!(i in lines)) return;
            lines[i] = lines[i].replace(/[☐☑]/, (m) => (m === '☐' ? '☑' : '☐'));
            noteInput.value = lines.join('\n');
            noteInput.dispatchEvent(new Event('input', { bubbles: true }));
            sfx('toggleOn');
        };
        preview.addEventListener('click', (e) => { const b = e.target.closest('.na-todo[data-ln]'); if (b) flip(b); });
        preview.addEventListener('keydown', (e) => {
            if (e.key !== ' ' && e.key !== 'Enter') return;
            const b = e.target.closest('.na-todo[data-ln]');
            if (b) { e.preventDefault(); flip(b); }
        });
    }

    // Nút B / I: giữ nguyên vùng chọn trong ô gõ (mousedown không cướp focus)
    [['note-b-btn', '**'], ['note-i-btn', '*']].forEach(([id, mark]) => {
        const b = document.getElementById(id);
        if (!b) return;
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('click', () => { noteInput.focus(); wrapSelection(noteInput, mark); });
    });

    // Mẫu ghi chú: bấm "Mẫu" mở hàng chip; chọn một mẫu → chèn khung tại con trỏ, đặt con trỏ sau nhãn đầu tiên
    const tplBtn = document.getElementById('note-tpl-btn'), tplRow = document.getElementById('note-tpls');
    if (tplBtn && tplRow) {
        tplBtn.addEventListener('click', () => {
            const open = tplRow.classList.toggle('hidden') === false;
            tplBtn.setAttribute('aria-expanded', String(open));
        });
        tplRow.querySelectorAll('[data-note-tpl]').forEach((b) => {
            b.addEventListener('click', () => {
                const t = NOTE_TEMPLATES[+b.dataset.noteTpl].text;
                const v = noteInput.value, pos = noteInput.selectionStart ?? v.length;
                const before = v.slice(0, pos), after = v.slice(pos);
                const lead = before && !before.endsWith('\n') ? '\n' : '';
                noteInput.value = before + lead + t + (after && !after.startsWith('\n') ? '\n' : '') + after;
                const caret = (before + lead).length + t.indexOf('\n');
                noteInput.focus();
                noteInput.setSelectionRange(caret, caret);
                tplRow.classList.add('hidden'); tplBtn.setAttribute('aria-expanded', 'false');
                noteInput.dispatchEvent(new Event('input', { bubbles: true }));
            });
        });
    }

    // Đọc để ghi (chỉ hiện khi trình duyệt có SpeechRecognition)
    if (micBtn && SR) {
        micBtn.classList.remove('hidden');
        const ui = {
            on() { micBtn.classList.add('is-live'); micBtn.setAttribute('aria-pressed', 'true'); listenEl.classList.remove('hidden'); listenEl.textContent = 'Đang nghe… cứ nói, chữ sẽ nối vào ghi chú'; },
            off() { micBtn.classList.remove('is-live'); micBtn.setAttribute('aria-pressed', 'false'); listenEl.classList.add('hidden'); },
            interim(t) { listenEl.textContent = t ? 'Đang nghe… ' + t : 'Đang nghe… cứ nói, chữ sẽ nối vào ghi chú'; }
        };
        micBtn.addEventListener('click', () => toggleDictation(noteInput, ui));
    }

    // Sổ ghi chú cả bộ đề (nạp lười: chỉ tốn khi bấm)
    document.getElementById('note-all-btn')?.addEventListener('click', () => {
        import('./quiz-notes-all.js').then(m => m.openAllNotes()).catch(() => showToast('Không mở được sổ ghi chú.', 'error'));
    });

    // Nút xóa nhanh ghi chú của câu hiện tại
    if (noteClearBtn) {
        noteClearBtn.addEventListener('click', () => {
            noteInput.value = '';
            autoGrow();
            refreshMeta();
            clearTimeout(saveTimeout);
            persist('');
            noteInput.focus();
        });
    }
}
