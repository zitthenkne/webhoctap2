// File: features/quiz/page/quiz-notes-panel.js
// Panel "Ghi chú cá nhân" (cột phải): markup + logic nạp/tự lưu/tự giãn/đếm ký tự/thu gọn/xóa nhanh.
// Tách từ quiz-page.js — logic giữ nguyên.

import { state } from '../quiz-state.js';
import { pushStudyToCloud } from './quiz-study-sync.js';

// Markup panel ghi chú cá nhân (đặt ở cột phải; logic được nối trong showQuestion)
export function renderPersonalNotePanel() {
    return `
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
                    placeholder="Nhập ghi chú cho câu hỏi này — tự động lưu, hiển thị cả ở chế độ tập trung..."></textarea>
                <div class="quiz-note-footer">
                    <span id="note-char-count" class="quiz-note-count">Chưa có ghi chú</span>
                    <button type="button" id="note-clear-btn" class="quiz-note-clear hidden">
                        <i class="fas fa-eraser mr-1"></i>Xóa ghi chú
                    </button>
                </div>
            </div>
        </div>`;
}

// Nối logic ghi chú cá nhân cho câu hiện tại: nạp nội dung đã lưu, tự lưu, tự giãn,
// đếm ký tự, thu gọn/mở rộng, xóa nhanh. Tách riêng để chạy được trên mọi nhánh render.
export function setupPersonalNote(question) {
    const noteInput = document.getElementById('personal-note-input');
    const noteStatus = document.getElementById('note-save-status');
    if (!noteInput) return;

    const noteBox = document.getElementById('personal-note-box');
    const noteToggle = document.getElementById('note-toggle');
    const noteDot = document.getElementById('note-dot');
    const noteCount = document.getElementById('note-char-count');
    const noteClearBtn = document.getElementById('note-clear-btn');

    const quizIdKey = (state.quizData && state.quizData.id) || (new URLSearchParams(window.location.search)).get('id') || 'default_quiz';
    const storageKey = `quiz_notes_${quizIdKey}`;
    let notesObj = {};
    try {
        notesObj = JSON.parse(localStorage.getItem(storageKey) || '{}');
    } catch(e) {
        console.error("Lỗi đọc ghi chú cá nhân:", e);
    }

    const qText = question.question;
    noteInput.value = notesObj[qText] || '';

    // Tự giãn chiều cao textarea theo nội dung (giới hạn rồi cuộn)
    const autoGrow = () => {
        noteInput.style.height = 'auto';
        noteInput.style.height = Math.min(noteInput.scrollHeight, 260) + 'px';
    };
    // Cập nhật bộ đếm ký tự, chấm báo có ghi chú, nút xóa
    const refreshMeta = () => {
        const len = noteInput.value.length;
        const has = noteInput.value.trim().length > 0;
        if (noteCount) noteCount.textContent = has ? `${len} ký tự` : 'Chưa có ghi chú';
        if (noteDot) noteDot.classList.toggle('hidden', !has);
        if (noteClearBtn) noteClearBtn.classList.toggle('hidden', !has);
    };

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
            pushStudyToCloud();
        } catch(err) {
            console.error("Lỗi lưu ghi chú:", err);
            showError();
        }
    };

    // Khởi tạo hiển thị
    autoGrow();
    refreshMeta();

    // Thu gọn / mở rộng panel (ghi nhớ lựa chọn cho toàn phiên)
    if (noteToggle && noteBox) {
        const collapsed = localStorage.getItem('quiz_note_collapsed') === '1';
        noteBox.classList.toggle('collapsed', collapsed);
        noteToggle.setAttribute('aria-expanded', String(!collapsed));
        noteToggle.addEventListener('click', () => {
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
    // Lưu ngay khi rời ô nhập (không phải chờ debounce)
    noteInput.addEventListener('blur', () => {
        clearTimeout(saveTimeout);
        persist(noteInput.value);
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
