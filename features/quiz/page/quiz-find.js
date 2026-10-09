// File: features/quiz/page/quiz-find.js
// Tìm / nhảy câu trong lượt đang làm (Ctrl+K, hoặc "/" khi không gõ chữ): gõ chữ không dấu (đề, ca lâm sàng, phương án) hoặc gõ số câu;
// lọc nhanh Chưa làm / Đánh dấu / Có ghi chú; ↑ ↓ chọn, Enter nhảy, Esc đóng. Chỉ đọc state — không ghi gì ngoài việc đổi câu hiện tại.

import { state, saveQuizState } from '../quiz-state.js';
import { showQuestion } from './quiz-question-view.js';
import { readNotes } from './quiz-notes-panel.js';
import { sfx } from './quiz-page-prefs.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const plain = (s) => String(s || '').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_#>~$|]/g, ' ').replace(/\s+/g, ' ').trim();
const MAX_ROWS = 40;
const FILTERS = [['all', 'Tất cả'], ['todo', 'Chưa làm'], ['mark', 'Đánh dấu'], ['note', 'Có ghi chú']];

let root = null, input = null, list = null, filter = 'all', rows = [], active = 0, haystack = [], noteFold = [], returnTo = null;

const inQuiz = () => document.body.classList.contains('quiz-active') && state.questions.length > 0;   // quiz-active được gỡ khi nộp bài

function build() {
    root = document.createElement('div');
    root.id = 'qfind';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Tìm câu hỏi');
    root.innerHTML = `
        <div class="qf-backdrop" data-qf-close></div>
        <div class="qf-card">
            <div class="qf-search"><i class="fas fa-magnifying-glass" aria-hidden="true"></i>
                <input type="search" id="qf-q" placeholder="Tìm câu: gõ chữ (không cần dấu) hoặc số câu…" autocomplete="off" aria-label="Tìm câu hỏi" aria-controls="qf-list">
                <kbd class="kbd-key">Esc</kbd></div>
            <div class="qf-chips" role="group" aria-label="Lọc nhanh">${FILTERS.map(([k, l]) => `<button type="button" data-qf-filter="${k}" class="qf-chip">${l}</button>`).join('')}</div>
            <div id="qf-list" class="qf-list" role="listbox"></div>
            <div class="qf-hint"><span><kbd class="kbd-key">↑</kbd><kbd class="kbd-key">↓</kbd> chọn</span><span><kbd class="kbd-key">Enter ⏎</kbd> tới câu</span></div>
        </div>`;
    document.body.appendChild(root);
    input = root.querySelector('#qf-q');
    list = root.querySelector('#qf-list');
    root.addEventListener('click', (e) => {
        if (e.target.closest('[data-qf-close]')) { close(); return; }
        const chip = e.target.closest('[data-qf-filter]');
        if (chip) { filter = chip.dataset.qfFilter; render(); input.focus(); return; }
        const row = e.target.closest('[data-qf-i]');
        if (row) go(+row.dataset.qfI);
    });
    input.addEventListener('input', () => { active = 0; render(); });
    input.addEventListener('keydown', (e) => {
        if (e.isComposing) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
        else if (e.key === 'Enter') { e.preventDefault(); if (rows[active]) go(rows[active].i); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    });
}

function statusOf(i) {
    const a = state.userAnswers[i];
    return a === null || a === undefined ? 'todo' : 'done';
}

function render() {
    const notes = readNotes();
    const q = fold(input.value.trim());
    const num = /^\d{1,4}$/.test(q) ? parseInt(q, 10) : 0;
    rows = [];
    haystack.forEach((h, i) => {
        if (filter === 'todo' && statusOf(i) !== 'todo') return;
        if (filter === 'mark' && !state.markedQuestions.includes(i)) return;
        if (filter === 'note' && !String(notes[state.questions[i].question] || '').trim()) return;
        let score = 0, noteHit = false;
        const nf = noteFold[i] || '';
        if (!q) score = 1;
        else if (num && i + 1 === num) score = 3;
        else if (h.includes(q)) score = h.indexOf(q) < 80 ? 2 : 1;
        if (q && nf.includes(q)) { noteHit = true; if (!score) score = 0.5; }   // khớp ghi chú của mình: xếp sau khớp đề
        if (score) rows.push({ i, score, noteHit });
    });
    rows.sort((a, b) => b.score - a.score || a.i - b.i);
    const total = rows.length;
    rows = rows.slice(0, MAX_ROWS);
    if (active >= rows.length) active = Math.max(0, rows.length - 1);
    root.querySelectorAll('[data-qf-filter]').forEach(b => b.classList.toggle('is-on', b.dataset.qfFilter === filter));
    if (!rows.length) { list.innerHTML = '<p class="qf-empty">Không có câu nào khớp.</p>'; return; }
    list.innerHTML = rows.map((r, k) => {
        const qq = state.questions[r.i];
        const st = statusOf(r.i), here = r.i === state.currentIndex;
        const marked = state.markedQuestions.includes(r.i), noted = !!String(notes[qq.question] || '').trim();
        const txt = plain(qq.question);
        const nt = r.noteHit ? plain(notes[qq.question]) : '';
        return `<button type="button" role="option" class="qf-row${k === active ? ' is-active' : ''}" data-qf-i="${r.i}" aria-selected="${k === active}">
            <span class="qf-no">Câu ${r.i + 1}</span>
            <span class="qf-main"><span class="qf-txt">${esc(txt.length > 110 ? txt.slice(0, 110) + '…' : txt)}</span>${nt ? `<span class="qf-note"><i class="fas fa-sticky-note" aria-hidden="true"></i> ${esc(nt.length > 90 ? nt.slice(0, 90) + '…' : nt)}</span>` : ''}</span>
            <span class="qf-tags">${here ? '<i class="qf-dot is-here" title="Đang ở câu này"></i>' : ''}${st === 'done' ? '<i class="qf-dot is-done" title="Đã làm"></i>' : ''}${marked ? '<i class="qf-dot is-mark" title="Đã đánh dấu"></i>' : ''}${noted ? '<i class="qf-dot is-note" title="Có ghi chú"></i>' : ''}</span>
        </button>`;
    }).join('') + (total > rows.length ? `<p class="qf-empty">Còn ${total - rows.length} câu nữa — gõ thêm để thu hẹp.</p>` : '');
    list.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
}

function move(d) {
    if (!rows.length) return;
    active = (active + d + rows.length) % rows.length;
    list.querySelectorAll('.qf-row').forEach((el, k) => { el.classList.toggle('is-active', k === active); el.setAttribute('aria-selected', String(k === active)); });
    list.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
}

function go(i) {
    close();
    if (i >= 0 && i < state.questions.length && i !== state.currentIndex) {
        state.currentIndex = i;
        saveQuizState();
        showQuestion();
    }
}

function close() {
    if (!root) return;
    root.classList.remove('is-open');
    try { if (returnTo && returnTo.isConnected && returnTo !== document.body) returnTo.focus({ preventScroll: true }); } catch (e) { }
    returnTo = null;
}
const isOpen = () => !!root && root.classList.contains('is-open');

export function openFind() {
    if (!inQuiz()) return;
    if (!root) build();
    returnTo = document.activeElement;
    // chuỗi tìm kiếm dựng một lần mỗi lần mở: đề + ca lâm sàng + các phương án
    const myNotes = readNotes();
    noteFold = state.questions.map(q => fold(plain(myNotes[q.question] || '')));
    haystack = state.questions.map(q => fold([q.question, q.caseText, ...(q.answers || q.options || [])].map(plain).join(' ')));
    filter = 'all'; active = 0; input.value = '';
    render();
    root.classList.add('is-open');
    sfx('ui');
    input.focus();
}

export function setupFind() {
    document.addEventListener('keydown', (e) => {
        if (e.isComposing) return;
        const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName) || (document.activeElement && document.activeElement.isContentEditable);
        const ctrlK = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k';
        const slash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !typing;
        if (!ctrlK && !slash) return;
        if (document.body.classList.contains('quiz-paused') || document.querySelector('#kbd-sheet:not(.hidden), .zt-confirm-overlay, #notes-all.is-open')) return;
        if (!inQuiz()) return;
        e.preventDefault();
        if (isOpen()) close(); else openFind();
    }, true);
}
