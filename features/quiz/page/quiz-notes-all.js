// File: features/quiz/page/quiz-notes-all.js
// Sổ ghi chú CẢ BỘ ĐỀ (nạp lười từ nút "Tất cả" ở panel ghi chú): danh sách mọi ghi chú theo thứ tự câu trong lượt làm,
// tìm không dấu, lọc theo nhãn (Nhớ / Dễ nhầm / Hỏi lại…), "Đến câu" nhảy thẳng, sao chép Markdown, tải .md.
// Chỉ ĐỌC quiz_notes_<id> (đã gồm bản kéo từ cloud) — không ghi gì, không đổi lược đồ.

import { showToast } from '../../../core/utils.js';
import { state, saveQuizState } from '../quiz-state.js';
import { showQuestion } from './quiz-question-view.js';
import { NOTE_TAGS, noteTagsOf, noteTextHtml, readNotes, quizNotesKey } from './quiz-notes-panel.js';
import { pushStudyToCloud } from './quiz-study-sync.js';
import { syncQuizNavPanel } from '../quiz-ui.js';
import { sfx } from './quiz-page-prefs.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const snippet = (s, n = 90) => {
    const t = String(s || '').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_#>~$]/g, '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n).trim() + '…' : t;
};

let root = null, filterTag = '', query = '', items = [], canJump = false, returnTo = null;

// Gom ghi chú: theo thứ tự câu trong lượt làm; ghi chú của câu không nằm trong lượt này xếp cuối (không nhảy được)
function collect() {
    // Đang làm bài: vị trí theo lượt làm (nhảy được). Ở trang chờ: theo thứ tự gốc của bộ đề (chỉ xem)
    canJump = state.questions.length > 0 && document.body.classList.contains('quiz-active');
    const resultsOpen = !!document.getElementById('resultsSection') && !document.getElementById('resultsSection').classList.contains('hidden');
    const src = (canJump || (resultsOpen && state.questions.length)) ? state.questions : (state.originalQuestions || []);   // màn kết quả: đánh số theo lượt vừa làm (khớp danh sách chi tiết)
    const pos = new Map();
    src.forEach((q, i) => { if (!pos.has(q.question)) pos.set(q.question, i); });
    items = Object.entries(readNotes())
        .filter(([, text]) => String(text).trim())
        .map(([q, text]) => ({ q, text: String(text), idx: pos.has(q) ? pos.get(q) : -1, tags: noteTagsOf(text) }))
        .sort((a, b) => (a.idx < 0) - (b.idx < 0) || a.idx - b.idx);
    items.forEach((it, k) => { it.k = k; });
}

// Ghi thẳng vào bản đồ ghi chú (cùng khóa với ô ghi chú ở cột phải) rồi đẩy lên cloud
function writeNote(q, val) {
    const map = readNotes();
    if (val.trim()) map[q] = val; else delete map[q];
    try { localStorage.setItem(quizNotesKey(), JSON.stringify(map)); } catch (e) { return false; }
    pushStudyToCloud();
    if (canJump) {
        syncQuizNavPanel();
        const cur = state.questions[state.currentIndex], ta = document.getElementById('personal-note-input');
        if (cur && cur.question === q && ta) { ta.value = val; ta.dispatchEvent(new Event('input', { bubbles: true })); }   // ô ghi chú đang mở của câu này cập nhật theo
    }
    return true;
}

function build() {
    root = document.createElement('div');
    root.id = 'notes-all';
    root.className = 'na-root';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'na-title');
    root.innerHTML = `
        <div class="na-backdrop" data-na-close></div>
        <div class="na-card">
            <div class="na-head">
                <h3 id="na-title"><i class="fas fa-sticky-note"></i> Sổ ghi chú <span id="na-total"></span></h3>
                <button type="button" class="na-x" data-na-close aria-label="Đóng"><i class="fas fa-times"></i></button>
            </div>
            <div class="na-tools">
                <input type="search" id="na-q" placeholder="Tìm ghi chú, câu hỏi (không cần dấu)…" autocomplete="off" aria-label="Tìm ghi chú">
                <div class="na-chips" id="na-chips" role="group" aria-label="Lọc theo nhãn"></div>
            </div>
            <div class="na-list" id="na-list"></div>
            <div class="na-foot">
                <button type="button" id="na-copy"><i class="fas fa-copy"></i> Sao chép</button>
                <button type="button" id="na-dl"><i class="fas fa-download"></i> Tải .md</button>
            </div>
        </div>`;
    document.body.appendChild(root);

    root.addEventListener('click', (e) => {
        if (e.target.closest('[data-na-close]')) { close(); return; }
        const chip = e.target.closest('[data-na-tag]');
        if (chip) { filterTag = chip.dataset.naTag === filterTag ? '' : chip.dataset.naTag; render(); return; }
        const go = e.target.closest('[data-na-go]');
        if (go) { jump(parseInt(go.dataset.naGo, 10)); return; }
        const ed = e.target.closest('[data-na-edit]');
        if (ed) { startEdit(+ed.dataset.naEdit); return; }
        const sv = e.target.closest('[data-na-save]');
        if (sv) { finishEdit(+sv.dataset.naSave, true); return; }
        const cn = e.target.closest('[data-na-cancel]');
        if (cn) finishEdit(+cn.dataset.naCancel, false);
    });
    root.querySelector('#na-q').addEventListener('input', (e) => { query = fold(e.target.value.trim()); renderList(); });
    root.querySelector('#na-copy').addEventListener('click', copyAll);
    root.querySelector('#na-dl').addEventListener('click', downloadAll);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && root.classList.contains('is-open')) { e.stopPropagation(); close(); }
    }, true);
}

function visible() {
    return items.filter(it => (!filterTag || it.tags.has(filterTag))
        && (!query || fold(it.text).includes(query) || fold(it.q).includes(query)));
}

function renderChips() {
    const counts = {};
    items.forEach(it => it.tags.forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
    const chip = (key, label, n, icon) =>
        `<button type="button" data-na-tag="${esc(key)}" class="na-chip${filterTag === key ? ' is-on' : ''}" aria-pressed="${filterTag === key}">${icon ? `<i class="fas ${icon}"></i> ` : ''}${esc(label)} <b>${n}</b></button>`;
    root.querySelector('#na-chips').innerHTML = NOTE_TAGS.filter(t => counts[t.label]).map(t => chip(t.label, t.label, counts[t.label], t.icon)).join('');
}

function renderList() {
    const list = root.querySelector('#na-list');
    const rows = visible();
    if (!items.length) {
        list.innerHTML = '<p class="na-empty">Bộ đề này chưa có ghi chú nào. Gõ vào ô “Ghi chú cá nhân” khi làm bài (phím Q) — chúng sẽ hiện ở đây.</p>';
        return;
    }
    if (!rows.length) { list.innerHTML = '<p class="na-empty">Không có ghi chú khớp bộ lọc.</p>'; return; }
    list.innerHTML = rows.map((it) => `
        <article class="na-item${canJump && it.idx === state.currentIndex ? ' is-here' : ''}${it.tags.has('Quan trọng') ? ' is-star' : ''}" data-k="${it.k}">
            <header>
                <span class="na-no">${it.idx >= 0 ? 'Câu ' + (it.idx + 1) : 'Lượt khác'}</span>
                <span class="na-qs">${esc(snippet(it.q))}</span>
            </header>
            <div class="na-text">${noteTextHtml(it.text)}</div>
            <div class="na-actions">
                ${it.idx >= 0 && canJump ? `<button type="button" class="na-go" data-na-go="${it.idx}"><i class="fas fa-arrow-right"></i> ${it.idx === state.currentIndex ? 'Đang ở câu này' : 'Đến câu'}</button>` : ''}
                <button type="button" class="na-go na-edit" data-na-edit="${it.k}"><i class="fas fa-pen"></i> Sửa</button>
            </div>
        </article>`).join('');
}

// Sửa một ghi chú ngay trong sổ: ô gõ thay chữ; Ctrl+Enter lưu, Esc hủy; lưu rỗng = xóa ghi chú
function startEdit(k) {
    const it = items[k];
    const art = list_().querySelector(`.na-item[data-k="${k}"]`);
    if (!it || !art || art.querySelector('.na-ta')) return;
    art.querySelector('.na-text').outerHTML = `<textarea class="na-ta" rows="4" aria-label="Sửa ghi chú">${esc(it.text)}</textarea>`;
    art.querySelector('.na-actions').innerHTML = `<button type="button" class="na-go" data-na-save="${k}"><i class="fas fa-check"></i> Lưu</button><button type="button" class="na-go" data-na-cancel="${k}"><i class="fas fa-xmark"></i> Hủy</button>`;
    const ta = art.querySelector('.na-ta');
    ta.addEventListener('keydown', (e) => {
        if (e.isComposing) return;
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finishEdit(k, true); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishEdit(k, false); }
    });
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
}
function finishEdit(k, save) {
    const it = items[k], art = list_().querySelector(`.na-item[data-k="${k}"]`);
    if (!it || !art) return;
    if (save) {
        const val = art.querySelector('.na-ta')?.value ?? it.text;
        if (val !== it.text && writeNote(it.q, val)) { sfx('noteSave'); showToast(val.trim() ? 'Đã lưu ghi chú' : 'Đã xóa ghi chú', 'success', 1500); }
        collect();
    }
    render();
}
const list_ = () => root.querySelector('#na-list');

function render() {
    root.querySelector('#na-total').textContent = items.length ? `(${items.length})` : '';
    renderChips();
    renderList();
}

function markdown() {
    const title = (state.quizData && state.quizData.title) || 'Bộ đề';
    const rows = visible();
    return `# Ghi chú — ${title}\n\n` + rows.map(it =>
        `## ${it.idx >= 0 ? 'Câu ' + (it.idx + 1) : 'Câu khác'} — ${snippet(it.q, 140)}\n\n${it.text.trim()}\n`).join('\n');
}
async function copyAll() {
    const text = markdown();
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch (_) { }
        ta.remove();
    }
    showToast(`Đã sao chép ${visible().length} ghi chú`, 'success', 1800);
}
function downloadAll() {
    const title = (state.quizData && state.quizData.title) || 'bo-de';
    const slug = fold(title).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'bo-de';
    const url = URL.createObjectURL(new Blob(['﻿' + markdown()], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `ghi-chu-${slug}.md`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function jump(idx) {
    if (!canJump || isNaN(idx) || idx < 0 || idx >= state.questions.length) return;
    close();
    if (idx !== state.currentIndex) {
        state.currentIndex = idx;
        saveQuizState();
        showQuestion();
    }
}

function close() {
    if (!root) return;
    root.classList.remove('is-open');
    document.body.classList.remove('na-open');
    try { if (returnTo && returnTo.isConnected && returnTo !== document.body) returnTo.focus({ preventScroll: true }); } catch (e) { }   // trả focus về chỗ đã bấm mở (bàn phím/đọc màn hình khỏi lạc)
    returnTo = null;
}

export function openAllNotes() {
    if (!root) build();
    returnTo = document.activeElement;
    collect();
    filterTag = ''; query = '';
    root.querySelector('#na-q').value = '';
    render();
    root.classList.add('is-open');
    document.body.classList.add('na-open');
    sfx('ui');
    // Máy cảm ứng: đừng bật bàn phím ảo ngay khi mở
    if (!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) root.querySelector('#na-q').focus();
}
export function toggleAllNotes() {
    if (root && root.classList.contains('is-open')) close(); else openAllNotes();
}
