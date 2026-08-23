// features/flashcard/flashcard.js
//
// Trang luyện tập Flashcard cho một bộ đề (quiz_sets/{id}).
// - Tải dữ liệu ưu tiên bản offline khi mất mạng, ngược lại đọc Firestore.
// - 3 chế độ xem: Học thẻ (lật 3D), Duyệt lưới, Danh sách nhanh.
// - Theo dõi tiến độ "đã thuộc / chưa thuộc" và LƯU LẠI (localStorage) theo nội
//   dung câu hỏi nên không mất khi tải lại trang hay xáo trộn thẻ.
// - Ghi chú cá nhân DÙNG CHUNG kho ghi chú với trang làm bài (quiz_notes_<id>,
//   khóa theo text câu hỏi) và tự đồng bộ lên cloud khi đã đăng nhập.

import { db, auth } from '../../core/firebase-init.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import { showToast, showConfirm } from '../../core/utils.js';
import { parseMarkdown, parseInlineMarkdown, renderMath } from '../quiz/quiz-helpers.js';
import { getOfflineQuiz, autoCacheQuiz } from '../quiz/quiz-offline-store.js';
import { studyKeys, syncPullStudy, scheduleCloudPush } from '../quiz/quiz-study-store.js';

const params = new URLSearchParams(window.location.search);
const quizId = params.get('id');
const container = document.getElementById('flashcard-container');

// ---- Trạng thái ----
const S = {
    deckTitle: 'Flashcard',
    cards: [],        // toàn bộ thẻ đã chuẩn hóa (thứ tự gốc)
    view: 'study',    // 'study' | 'browse' | 'list'
    order: [],        // mảng chỉ số card cho phiên học hiện tại
    pos: 0,           // vị trí trong order
    flipped: false,
    done: false,      // đã đi hết phiên học?
    topic: 'all',
    search: '',
    scope: 'all',     // 'all' | 'unknown' — phạm vi thẻ cho phiên học
    known: {},        // { [qText]: true|false } (true=thuộc, false=chưa thuộc, thiếu=chưa học)
    uid: null,
    hasTopics: false, // bộ đề có điền trường chủ đề không? (ẩn bộ lọc nếu không)
    fontSize: 2,      // 1..4
    autoSpeak: false, // tự đọc khi lật / chuyển thẻ
    vibrate: true,    // rung phản hồi khi đánh dấu
    _celebrated: false,
};

// ============================================================
//  Tiện ích
// ============================================================
function esc(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function stripToText(str) {
    // Rút nội dung câu hỏi/markdown về chữ thuần để hiển thị xem nhanh (lưới / danh sách)
    return String(str || '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')     // ảnh
        .replace(/```[\s\S]*?```/g, ' ')           // khối mã / mermaid
        .replace(/[#>*_`~$]/g, '')                 // ký tự markdown
        .replace(/\s+/g, ' ').trim();
}
function shuffleArr(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ============================================================
//  Chuẩn hóa dữ liệu câu hỏi
// ============================================================
function normalize(questions) {
    return (questions || []).map((q, idx) => {
        const options = Array.isArray(q.answers) ? q.answers
            : (Array.isArray(q.options) ? q.options : []);
        let ci = q.correctAnswerIndex;
        if (ci === undefined || ci === null) {
            // Bộ đề tạo từ phòng cộng tác lưu đáp án 1-based ở `answer`
            if (typeof q.answer === 'number') ci = q.answer - 1;
        }
        return {
            idx,
            qText: (q.question || '').trim(),
            question: q.question || '',
            options,
            correctIndex: (typeof ci === 'number' && ci >= 0 && ci < options.length) ? ci : null,
            optionExplanations: Array.isArray(q.optionExplanations) ? q.optionExplanations : [],
            explanation: q.explanation || q.explain || '',
            note: q.note || '',
            expanded: q.expanded || q.expandedKnowledge || '',
            topic: (q.topic && String(q.topic).trim()) || '', // '' = không có chủ đề
            caseText: q.caseText || '',
            caseTitle: q.caseTitle || '',
        };
    });
}
function correctText(c) {
    if (c.correctIndex == null) return c.options[0] || '';
    return c.options[c.correctIndex] || c.options[0] || '';
}

// ============================================================
//  Lưu trạng thái "đã thuộc" + ghi chú (dùng chung với trang làm bài)
// ============================================================
const knownKey = `flashcard_known_${quizId}`;
function loadKnown() { try { return JSON.parse(localStorage.getItem(knownKey) || '{}') || {}; } catch (e) { return {}; } }
function saveKnown() { try { localStorage.setItem(knownKey, JSON.stringify(S.known)); } catch (e) {} }

function noteMapKey() { return studyKeys(quizId).notes; }
function readNotes() { try { return JSON.parse(localStorage.getItem(noteMapKey()) || '{}') || {}; } catch (e) { return {}; } }
function getNote(qText) { return readNotes()[qText] || ''; }
function setNote(qText, val) {
    const m = readNotes();
    if (val && val.trim()) m[qText] = val; else delete m[qText];
    try { localStorage.setItem(noteMapKey(), JSON.stringify(m)); } catch (e) {}
    if (S.uid) scheduleCloudPush(S.uid, quizId);
}

// ============================================================
//  Bộ lọc & phiên học
// ============================================================
function matchesFilter(c) {
    if (S.topic !== 'all' && c.topic !== S.topic) return false;
    if (S.search.trim()) {
        const kw = S.search.trim().toLowerCase();
        const hay = (c.question + ' ' + c.options.join(' ') + ' ' + c.explanation).toLowerCase();
        if (!hay.includes(kw)) return false;
    }
    return true;
}
function filteredCards() { return S.cards.filter(matchesFilter); }
function studyPool() {
    let pool = filteredCards();
    if (S.scope === 'unknown') pool = pool.filter(c => S.known[c.qText] !== true);
    return pool;
}
function buildOrder(shuffle = false) {
    S.order = studyPool().map(c => c.idx);
    if (shuffle) shuffleArr(S.order);
    S.pos = 0;
    S.flipped = false;
    S.done = false;
    S._celebrated = false;
}
function getTopics() {
    return Array.from(new Set(S.cards.map(c => c.topic).filter(Boolean)));
}

// ============================================================
//  Tải dữ liệu
// ============================================================
async function loadData() {
    if (!quizId) {
        renderFatal('fa-link-slash', 'Thiếu ID bộ đề', 'Đường dẫn không kèm mã bộ đề. Hãy mở Flashcard từ thư viện hoặc trang làm bài nhé.');
        return;
    }
    renderLoading();
    let data = null;
    try {
        if (!navigator.onLine) data = await getOfflineQuiz(quizId);
        if (!data) {
            const snap = await getDoc(doc(db, 'quiz_sets', quizId));
            if (snap.exists()) { data = snap.data(); autoCacheQuiz(quizId, data); }
        }
        if (!data) data = await getOfflineQuiz(quizId); // dự phòng: server không có nhưng máy đã tải
    } catch (e) {
        console.warn('Lỗi tải bộ đề, thử bản offline:', e);
        data = await getOfflineQuiz(quizId);
    }

    if (!data) {
        renderFatal('fa-cloud-slash', 'Không tải được bộ thẻ', 'Kiểm tra kết nối mạng rồi thử lại. Nếu bạn đã tải bộ đề về máy, hãy mở lại khi có mạng để đồng bộ.');
        return;
    }

    S.deckTitle = data.title || data.name || 'Bộ thẻ';
    S.cards = normalize(data.questions);
    if (!S.cards.length) {
        renderFatal('fa-inbox', 'Bộ đề trống', 'Bộ đề này chưa có câu hỏi nào để tạo flashcard.');
        return;
    }
    S.known = loadKnown();
    S.hasTopics = getTopics().length >= 2; // chỉ coi là "có chủ đề" khi phân loại thực sự có ý nghĩa
    updateHeader();
    buildOrder(false);
    // Tiếp tục ở thẻ đang xem dở lần trước (nếu còn trong phiên hiện tại)
    try {
        const savedIdx = parseInt(localStorage.getItem(`flashcard_last_${quizId}`), 10);
        if (!isNaN(savedIdx)) {
            const p = S.order.indexOf(savedIdx);
            if (p > 0) S.pos = p;
        }
    } catch (e) {}
    render();
}

// ============================================================
//  Header
// ============================================================
function updateHeader() {
    const t = document.getElementById('fc-deck-title');
    const s = document.getElementById('fc-deck-sub');
    const back = document.getElementById('fc-back-btn');
    if (t) t.textContent = S.deckTitle;
    if (s) {
        const total = S.cards.length;
        const known = S.cards.filter(c => S.known[c.qText] === true).length;
        s.textContent = total ? `${total} thẻ • ${known} đã thuộc` : 'Đang tải…';
    }
    if (back && quizId) back.href = `../quiz/quiz.html?id=${quizId}`;
    document.title = `Flashcard · ${S.deckTitle}`;
}

// ============================================================
//  Render — bộ khung chung
// ============================================================
function render() {
    updateHeader();
    if (S.view === 'study') renderStudy();
    else if (S.view === 'browse') renderBrowse();
    else renderList();
    renderMath(container);
}

function tabsHtml() {
    const tab = (id, icon, label) =>
        `<button data-view="${id}" class="fc-chip ${S.view === id ? 'is-active' : ''}"><i class="fas ${icon}"></i> ${label}</button>`;
    return `<div class="flex items-center justify-center gap-2 mb-4 flex-wrap">
        ${tab('study', 'fa-layer-group', 'Học thẻ')}
        ${tab('browse', 'fa-table-cells-large', 'Duyệt lưới')}
        ${tab('list', 'fa-list-ul', 'Danh sách')}
    </div>`;
}

function filterBarHtml() {
    // Ẩn hẳn ô lọc chủ đề nếu bộ đề không phân loại chủ đề (theo yêu cầu)
    let topicSelect = '';
    if (S.hasTopics) {
        const topics = getTopics();
        const opts = ['<option value="all">Tất cả chủ đề</option>']
            .concat(topics.map(t => `<option value="${esc(t)}" ${S.topic === t ? 'selected' : ''}>${esc(t)}</option>`))
            .join('');
        topicSelect = `<div class="relative">
            <i class="fas fa-tag absolute left-3 top-1/2 -translate-y-1/2 text-xs" style="color:var(--fc-muted)"></i>
            <select id="fc-topic" class="fc-input pl-8 pr-3 cursor-pointer">${opts}</select>
        </div>`;
    }
    return `<div class="flex flex-wrap items-center gap-2 justify-center mb-4">
        ${topicSelect}
        <div class="relative">
            <i class="fas fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-xs" style="color:var(--fc-muted)"></i>
            <input id="fc-search" class="fc-input pl-8 w-44 sm:w-56" placeholder="Tìm trong thẻ…" value="${esc(S.search)}">
        </div>
    </div>`;
}

// ============================================================
//  Chế độ HỌC THẺ
// ============================================================
function statsBar() {
    const pool = filteredCards();
    const total = pool.length;
    const known = pool.filter(c => S.known[c.qText] === true).length;
    const unknown = pool.filter(c => S.known[c.qText] === false).length;
    const fresh = total - known - unknown;
    const pct = total ? Math.round((known / total) * 100) : 0;
    return `<div class="fc-glass rounded-2xl p-3 sm:p-3.5 mb-4">
        <div class="flex items-center justify-between text-[11px] sm:text-xs font-semibold mb-2">
            <span class="flex items-center gap-1.5" style="color:#16a34a"><i class="fas fa-circle-check"></i> Thuộc: ${known}</span>
            <span class="flex items-center gap-1.5" style="color:#ef4444"><i class="fas fa-circle-xmark"></i> Chưa: ${unknown}</span>
            <span class="flex items-center gap-1.5" style="color:var(--fc-muted)"><i class="far fa-circle"></i> Mới: ${fresh}</span>
            <span class="ml-auto font-bold" style="color:var(--fc-pink-600)">${pct}%</span>
        </div>
        <div class="fc-progress-track"><div class="fc-progress-fill" style="width:${pct}%"></div></div>
    </div>`;
}

function scopeControlsHtml() {
    const chip = (val, label) => `<button data-scope="${val}" class="fc-chip ${S.scope === val ? 'is-active' : ''} !py-1.5 !px-3 !text-xs">${label}</button>`;
    return `<div class="flex flex-wrap items-center justify-center gap-2 mt-4">
        ${chip('all', 'Tất cả thẻ')}
        ${chip('unknown', 'Chỉ thẻ chưa thuộc')}
        <button id="fc-shuffle" class="fc-chip !py-1.5 !px-3 !text-xs"><i class="fas fa-shuffle"></i> Xáo trộn</button>
        <button id="fc-reset" class="fc-chip !py-1.5 !px-3 !text-xs"><i class="fas fa-rotate-left"></i> Đặt lại tiến độ</button>
    </div>`;
}

// Cỡ chữ câu hỏi tự co theo độ dài (em, so với cỡ nền mặt thẻ) để câu dài không tràn,
// câu ngắn thì to đẹp lấp đầy thẻ. Có cộng thêm chút khi có ca lâm sàng (nội dung dài hơn).
function questionScale(c) {
    let n = stripToText(c.question).length;
    if (c.caseText) n += Math.round(stripToText(c.caseText).length * 0.6) + 40;
    let em;
    if (n <= 30) em = 2.2;
    else if (n <= 55) em = 2.0;
    else if (n <= 90) em = 1.78;
    else if (n <= 140) em = 1.56;
    else if (n <= 210) em = 1.36;
    else if (n <= 320) em = 1.18;
    else em = 1.04;
    // Màn hình rộng nới thêm một chút cho thoáng
    if (window.matchMedia && window.matchMedia('(min-width: 640px)').matches) em *= 1.06;
    return em.toFixed(3);
}

function faceQuestionHtml(c) {
    let badge = '';
    if (c.caseText) badge = `<span class="fc-chip !py-1 !px-2.5 !text-[11px] mb-2"><i class="fas fa-notes-medical"></i> ${esc(c.caseTitle || 'Ca lâm sàng')}</span>`;
    else if (c.topic) badge = `<span class="fc-chip !py-1 !px-2.5 !text-[11px] mb-2"><i class="fas fa-tag"></i> ${esc(c.topic)}</span>`;
    return `<span class="fc-face-tag fc-tag-q">Câu hỏi</span>
        <button type="button" class="fc-face-speak" data-side="q" title="Đọc câu hỏi" aria-label="Đọc câu hỏi"><i class="fas fa-volume-high text-xs"></i></button>
        <div class="flashcard-face-scroll fc-scroll-thin">
            ${badge}
            ${c.caseText ? `<div class="fc-body w-full text-left rounded-xl p-2.5 mb-2" style="background:var(--fc-surface);color:var(--fc-muted);font-size:.82em">${parseMarkdown(c.caseText)}</div>` : ''}
            <div class="fc-q-text" style="font-size:${questionScale(c)}em">${parseMarkdown(c.question) || '<span class="opacity-50">(Không có nội dung)</span>'}</div>
        </div>
        <div class="fc-face-hint">
            <i class="fas fa-hand-pointer"></i> Nhấn thẻ hoặc <span class="fc-kbd">Space</span> để xem đáp án
        </div>`;
}

function faceAnswerHtml(c) {
    const ans = correctText(c);
    const correctExp = (c.optionExplanations[c.correctIndex] && c.optionExplanations[c.correctIndex].trim())
        ? c.optionExplanations[c.correctIndex] : '';
    const explain = correctExp || c.explanation;
    const note = getNote(c.qText);

    // Danh sách phương án (thu gọn) — làm nổi đáp án đúng
    let optionsBlock = '';
    if (c.options.length > 1) {
        const items = c.options.map((o, i) => {
            const ok = i === c.correctIndex;
            const letter = String.fromCharCode(65 + i);
            return `<li class="flex items-start gap-2 rounded-lg px-2.5 py-1.5 ${ok ? 'font-bold' : ''}" style="${ok ? 'background:rgba(16,185,129,.12)' : ''}">
                <span class="shrink-0 ${ok ? 'text-green-600' : ''}" style="${ok ? '' : 'color:var(--fc-muted)'}">${ok ? '<i class=\'fas fa-check\'></i>' : letter + '.'}</span>
                <span>${parseInlineMarkdown(o)}</span>
            </li>`;
        }).join('');
        optionsBlock = `<details class="fc-expand w-full mt-3">
            <summary class="fc-chip !text-xs !py-1.5 w-full justify-center"><i class="fas fa-list-check"></i> Xem tất cả phương án</summary>
            <ul class="mt-2 space-y-1 text-sm">${items}</ul>
        </details>`;
    }

    const expandBlock = (c.expanded && c.expanded.trim())
        ? `<details class="fc-expand w-full mt-3">
            <summary class="fc-chip !text-xs !py-1.5 w-full justify-center" style="border-color:rgba(99,102,241,.4)"><i class="fas fa-lightbulb"></i> Mở rộng kiến thức</summary>
            <div class="mt-2 text-sm leading-relaxed rounded-xl p-3" style="background:var(--fc-surface)">${parseMarkdown(c.expanded)}</div>
        </details>` : '';

    return `<span class="fc-face-tag fc-tag-a">Đáp án</span>
        <button type="button" class="fc-face-speak" data-side="a" title="Đọc đáp án" aria-label="Đọc đáp án"><i class="fas fa-volume-high text-xs"></i></button>
        <div class="flashcard-face-scroll fc-scroll-thin">
            <div class="fc-answer-box fc-fade-up">
                <div class="text-[11px] font-bold uppercase tracking-wider mb-1" style="color:#059669"><i class="fas fa-circle-check mr-1"></i>Đáp án đúng</div>
                <div class="fc-a-text">${parseInlineMarkdown(ans) || 'N/A'}</div>
            </div>
            ${explain ? `<div class="fc-body w-full mt-3">${parseMarkdown(explain)}</div>` : `<div class="w-full mt-3 text-sm italic" style="color:var(--fc-muted)">Chưa có giải thích cho câu này.</div>`}
            ${optionsBlock}
            ${expandBlock}
            <div class="w-full mt-4">
                <label class="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 mb-1.5" style="color:var(--fc-muted)"><i class="fas fa-pen-nib"></i> Ghi chú của bạn</label>
                <textarea id="fc-note" class="fc-note-area" rows="2" placeholder="Mẹo nhớ, ví dụ, liên hệ… (đồng bộ với trang làm bài)">${esc(note)}</textarea>
            </div>
        </div>`;
}

function completionHtml() {
    const pool = filteredCards();
    const known = pool.filter(c => S.known[c.qText] === true).length;
    const unknown = pool.filter(c => S.known[c.qText] === false).length;
    const hasUnknown = pool.some(c => S.known[c.qText] !== true);
    const perfect = pool.length > 0 && known === pool.length;
    return `<div class="fc-glass rounded-3xl p-8 text-center fc-fade-up max-w-lg mx-auto">
        <div class="text-5xl mb-3">${perfect ? '🎉' : '💪'}</div>
        <h2 class="text-2xl font-extrabold mb-1">${perfect ? 'Tuyệt vời, thuộc hết rồi!' : 'Hoàn thành lượt học!'}</h2>
        <p class="text-sm mb-5" style="color:var(--fc-muted)">Bạn đã xem hết ${S.order.length} thẻ trong lượt này.</p>
        <div class="grid grid-cols-2 gap-3 mb-6 text-center">
            <div class="rounded-2xl p-3" style="background:rgba(16,185,129,.12)">
                <div class="text-2xl font-extrabold text-green-600">${known}</div>
                <div class="text-xs" style="color:var(--fc-muted)">Đã thuộc</div>
            </div>
            <div class="rounded-2xl p-3" style="background:rgba(239,68,68,.1)">
                <div class="text-2xl font-extrabold text-red-500">${unknown}</div>
                <div class="text-xs" style="color:var(--fc-muted)">Chưa thuộc</div>
            </div>
        </div>
        <div class="flex flex-col gap-2.5">
            ${hasUnknown ? `<button id="fc-review-unknown" class="fc-btn fc-btn-primary py-3"><i class="fas fa-bolt"></i> Ôn lại thẻ chưa thuộc</button>` : ''}
            <button id="fc-restart" class="fc-btn fc-btn-ghost py-3"><i class="fas fa-rotate-right"></i> Học lại từ đầu</button>
            <button id="fc-restart-shuffle" class="fc-btn fc-btn-ghost py-3"><i class="fas fa-shuffle"></i> Xáo trộn & học lại</button>
            <a href="../quiz/quiz.html${quizId ? `?id=${quizId}` : ''}" class="fc-btn fc-btn-ghost py-3"><i class="fas fa-pen-to-square"></i> Chuyển sang làm bài</a>
        </div>
    </div>`;
}

function emptyStudyHtml() {
    return `<div class="fc-glass rounded-3xl p-8 text-center max-w-lg mx-auto">
        <div class="text-4xl mb-3">🗂️</div>
        <h2 class="text-xl font-extrabold mb-1">Không có thẻ phù hợp</h2>
        <p class="text-sm mb-5" style="color:var(--fc-muted)">${S.scope === 'unknown' ? 'Bạn đã thuộc hết các thẻ trong bộ lọc này rồi!' : 'Thử đổi chủ đề hoặc xóa từ khóa tìm kiếm.'}</p>
        <button id="fc-scope-all" class="fc-btn fc-btn-primary py-2.5 px-5"><i class="fas fa-layer-group"></i> Xem tất cả thẻ</button>
    </div>`;
}

function renderStudy() {
    if (!S.order.length) {
        container.innerHTML = tabsHtml() + filterBarHtml() + emptyStudyHtml();
        bindTabs(); bindFilter();
        const b = document.getElementById('fc-scope-all');
        if (b) b.onclick = () => { S.scope = 'all'; S.search = ''; S.topic = 'all'; buildOrder(false); render(); };
        return;
    }
    if (S.done) {
        container.innerHTML = tabsHtml() + statsBar() + completionHtml();
        bindTabs();
        bindCompletion();
        const pool = filteredCards();
        if (pool.length > 0 && pool.every(c => S.known[c.qText] === true) && !S._celebrated) {
            S._celebrated = true;
            fireConfetti();
        }
        return;
    }

    const c = S.cards[S.order[S.pos]];
    try { localStorage.setItem(`flashcard_last_${quizId}`, String(c.idx)); } catch (e) {}
    container.innerHTML = tabsHtml() + filterBarHtml() + statsBar() + `
        <div class="max-w-2xl mx-auto">
            <div id="fc-scene" class="flashcard-scene">
                <div class="fc-swipe-badge left"><i class="fas fa-xmark"></i> Chưa thuộc</div>
                <div class="fc-swipe-badge right"><i class="fas fa-check"></i> Thuộc</div>
                <div class="flashcard-tilt">
                    <div class="flashcard-inner ${S.flipped ? 'is-flipped' : ''}">
                        <div class="flashcard-face flashcard-front"><div class="fc-glare"></div>${faceQuestionHtml(c)}</div>
                        <div class="flashcard-face flashcard-back"><div class="fc-glare"></div>${faceAnswerHtml(c)}</div>
                    </div>
                </div>
            </div>

            <div class="flex items-center justify-between gap-3 mt-4 sm:mt-5">
                <button id="fc-prev" class="fc-btn fc-btn-ghost w-11 h-11 sm:w-12 sm:h-12 ${S.pos === 0 ? 'opacity-40 pointer-events-none' : ''}" title="Thẻ trước (←)"><i class="fas fa-arrow-left"></i></button>
                <div class="text-center">
                    <div class="font-bold text-base sm:text-lg">${S.pos + 1} <span class="font-medium" style="color:var(--fc-muted)">/ ${S.order.length}</span></div>
                    <div class="text-[11px] mt-0.5" style="color:var(--fc-muted)">${S.known[c.qText] === true ? '✅ đã thuộc' : (S.known[c.qText] === false ? '🔁 cần ôn' : 'thẻ mới')}</div>
                </div>
                <button id="fc-next" class="fc-btn fc-btn-ghost w-11 h-11 sm:w-12 sm:h-12" title="Thẻ sau (→)"><i class="fas fa-arrow-right"></i></button>
            </div>

            <div id="fc-mark-row" class="grid grid-cols-2 gap-2.5 sm:gap-3 mt-3.5 sm:mt-4 transition-opacity duration-200 ${S.flipped ? '' : 'opacity-40 pointer-events-none'}">
                <button id="fc-mark-unknown" class="fc-btn py-2.5 sm:py-3 text-white text-sm sm:text-base" style="background:linear-gradient(135deg,#fb8585,#ef4444)" title="Phím U / ↓"><i class="fas fa-xmark"></i> Chưa thuộc</button>
                <button id="fc-mark-known" class="fc-btn py-2.5 sm:py-3 text-white text-sm sm:text-base" style="background:linear-gradient(135deg,#4ade80,#10b981)" title="Phím Enter / ↑"><i class="fas fa-check"></i> Đã thuộc</button>
            </div>

            ${scopeControlsHtml()}

            <div class="mt-5 hidden sm:flex items-center justify-center gap-2 flex-wrap text-[11px]" style="color:var(--fc-muted)">
                <span class="fc-kbd">←</span><span class="fc-kbd">→</span> chuyển
                <span class="fc-kbd">Space</span> lật
                <span class="fc-kbd">Enter</span> thuộc
                <span class="fc-kbd">U</span> chưa thuộc
            </div>
            <div class="mt-4 flex sm:hidden items-center justify-center gap-3 text-[11px]" style="color:var(--fc-muted)">
                <span class="flex items-center gap-1"><i class="fas fa-hand-pointer"></i> Chạm: lật</span>
                <span class="flex items-center gap-1"><i class="fas fa-arrow-left" style="color:#ef4444"></i> Chưa thuộc</span>
                <span class="flex items-center gap-1">Thuộc <i class="fas fa-arrow-right" style="color:#10b981"></i></span>
            </div>
        </div>`;

    bindTabs();
    bindFilter();
    bindStudyControls();
}

function bindStudyControls() {
    const scene = document.getElementById('fc-scene');
    if (scene) {
        scene.addEventListener('click', (e) => {
            if (e.target.closest('.fc-face-speak') || e.target.closest('#fc-note') || e.target.closest('summary') || e.target.closest('a')) return;
            if (scene._swipeHandled) { scene._swipeHandled = false; return; }
            flip();
        });
        attachCardGestures(scene);
        setupCardTilt(scene);
    }
    // Nút đọc to trên mỗi mặt thẻ
    container.querySelectorAll('.fc-face-speak').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            speakCurrent(btn.dataset.side, btn);
        });
    });
    const prev = document.getElementById('fc-prev');
    const next = document.getElementById('fc-next');
    if (prev) prev.onclick = goPrev;
    if (next) next.onclick = goNext;
    const mk = document.getElementById('fc-mark-known');
    const mu = document.getElementById('fc-mark-unknown');
    if (mk) mk.onclick = () => markCurrent(true);
    if (mu) mu.onclick = () => markCurrent(false);

    const note = document.getElementById('fc-note');
    if (note) {
        const c = S.cards[S.order[S.pos]];
        note.addEventListener('input', (e) => setNote(c.qText, e.target.value));
    }

    // Chip phạm vi + xáo trộn + đặt lại
    container.querySelectorAll('[data-scope]').forEach(btn => {
        btn.onclick = () => { S.scope = btn.dataset.scope; buildOrder(false); render(); };
    });
    const sh = document.getElementById('fc-shuffle');
    if (sh) sh.onclick = () => { buildOrder(true); showToast('Đã xáo trộn thứ tự thẻ!', 'info'); render(); };
    const rs = document.getElementById('fc-reset');
    if (rs) rs.onclick = async () => {
        const ok = await showConfirm('Xóa toàn bộ trạng thái "đã thuộc / chưa thuộc" của bộ thẻ này?', {
            title: 'Đặt lại tiến độ?', confirmText: 'Đặt lại', cancelText: 'Hủy', tone: 'warning'
        });
        if (!ok) return;
        S.known = {};
        saveKnown();
        buildOrder(false);
        render();
        showToast('Đã đặt lại tiến độ.', 'success');
    };
}

function bindCompletion() {
    const ru = document.getElementById('fc-review-unknown');
    if (ru) ru.onclick = () => { S.scope = 'unknown'; buildOrder(false); render(); };
    const r = document.getElementById('fc-restart');
    if (r) r.onclick = () => { buildOrder(false); render(); };
    const rsh = document.getElementById('fc-restart-shuffle');
    if (rsh) rsh.onclick = () => { buildOrder(true); render(); };
}

function flip() {
    S.flipped = !S.flipped;
    const inner = container.querySelector('.flashcard-inner');
    const markRow = document.getElementById('fc-mark-row');
    if (inner) inner.classList.toggle('is-flipped', S.flipped);
    if (markRow) {
        markRow.classList.toggle('opacity-40', !S.flipped);
        markRow.classList.toggle('pointer-events-none', !S.flipped);
    }
    if (S.autoSpeak) { if (S.flipped) speakCurrent('a'); else stopSpeak(); }
}
function goNext() {
    stopSpeak();
    if (S.pos < S.order.length - 1) { S.pos++; S.flipped = false; render(); afterNavSpeak(); }
    else { S.done = true; render(); }
}
function goPrev() {
    if (S.pos > 0) { stopSpeak(); S.pos--; S.flipped = false; render(); afterNavSpeak(); }
}
function afterNavSpeak() {
    if (S.autoSpeak) speakCurrent('q');
}
function markCurrent(isKnown) {
    const c = S.cards[S.order[S.pos]];
    if (!c) return;
    S.known[c.qText] = isKnown;
    saveKnown();
    buzz(isKnown ? 18 : [10, 40, 10]);
    const inner = container.querySelector('.flashcard-inner');
    if (inner) {
        inner.classList.add(isKnown ? 'fc-anim-known' : 'fc-anim-unknown');
        setTimeout(() => inner.classList.remove('fc-anim-known', 'fc-anim-unknown'), 500);
    }
    updateHeader();
    setTimeout(goNext, 200);
}

// Cập nhật ô ghi chú đang hiển thị sau khi kéo dữ liệu từ cloud về
function refreshVisibleNote() {
    const note = document.getElementById('fc-note');
    if (!note || S.view !== 'study' || S.done || !S.order.length) return;
    const c = S.cards[S.order[S.pos]];
    const cloudVal = getNote(c.qText);
    if (cloudVal && !note.value.trim()) note.value = cloudVal;
}

// ============================================================
//  Chế độ DUYỆT LƯỚI
// ============================================================
function renderBrowse() {
    const cards = filteredCards();
    const grid = cards.map((c) => {
        const state = S.known[c.qText];
        const badge = state === true ? '<span class="fc-grid-known text-green-500"><i class="fas fa-circle-check"></i></span>'
            : state === false ? '<span class="fc-grid-known text-red-400"><i class="fas fa-circle-xmark"></i></span>' : '';
        return `<div class="fc-grid-card" data-open="${c.idx}">
            ${badge}
            <div class="text-[10px] font-bold uppercase tracking-wide mb-1.5" style="color:var(--fc-pink-600)">${esc(c.topic)}</div>
            <div class="font-bold text-sm leading-snug line-clamp-3">${esc(stripToText(c.question)) || '(trống)'}</div>
            <div class="mt-auto pt-2 text-[11px] flex items-center gap-1" style="color:var(--fc-muted)"><i class="fas fa-eye"></i> Mở thẻ</div>
        </div>`;
    }).join('');

    container.innerHTML = tabsHtml() + filterBarHtml() +
        (cards.length
            ? `<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">${grid}</div>`
            : `<div class="text-center py-16" style="color:var(--fc-muted)"><div class="text-3xl mb-2">🔍</div>Không tìm thấy thẻ nào.</div>`);

    bindTabs();
    bindFilter();
    container.querySelectorAll('[data-open]').forEach(el => {
        el.onclick = () => openSingle(parseInt(el.dataset.open, 10));
    });
}

// Mở một thẻ cụ thể trong chế độ Học thẻ
function openSingle(idx) {
    S.view = 'study';
    S.scope = 'all';
    S.topic = 'all';
    S.search = '';
    buildOrder(false);
    const p = S.order.indexOf(idx);
    S.pos = p >= 0 ? p : 0;
    S.flipped = false;
    S.done = false;
    render();
    afterNavSpeak();
}

// ============================================================
//  Chế độ DANH SÁCH
// ============================================================
function renderList() {
    const cards = filteredCards();
    const rows = cards.map((c) => {
        const ans = correctText(c);
        return `<div class="fc-glass rounded-2xl p-4" data-open="${c.idx}">
            <div class="flex items-start gap-2">
                <div class="flex-1 min-w-0">
                    <div class="text-[10px] font-bold uppercase tracking-wide mb-1" style="color:var(--fc-pink-600)">${esc(c.topic)}</div>
                    <div class="font-bold leading-snug mb-1.5">${esc(stripToText(c.question)) || '(trống)'}</div>
                    <div class="text-sm flex items-start gap-1.5" style="color:#059669"><i class="fas fa-arrow-right-long mt-1"></i><span class="font-semibold">${esc(stripToText(ans)) || 'N/A'}</span></div>
                </div>
                <button class="fc-btn fc-btn-ghost w-9 h-9 shrink-0" title="Mở thẻ"><i class="fas fa-up-right-and-down-left-from-center text-xs"></i></button>
            </div>
        </div>`;
    }).join('');

    container.innerHTML = tabsHtml() + filterBarHtml() +
        (cards.length
            ? `<div class="flex flex-col gap-3 max-w-2xl mx-auto">${rows}</div>`
            : `<div class="text-center py-16" style="color:var(--fc-muted)"><div class="text-3xl mb-2">🔍</div>Không tìm thấy thẻ nào.</div>`);

    bindTabs();
    bindFilter();
    container.querySelectorAll('[data-open]').forEach(el => {
        el.onclick = () => openSingle(parseInt(el.dataset.open, 10));
    });
}

// ============================================================
//  Trạng thái tải / lỗi
// ============================================================
function renderLoading() {
    container.innerHTML = `<div class="fc-glass rounded-3xl p-10 text-center max-w-lg mx-auto">
        <div class="inline-block w-10 h-10 border-4 rounded-full animate-spin mb-4" style="border-color:rgba(255,105,180,.25); border-top-color:var(--fc-pink)"></div>
        <p class="font-bold" style="color:var(--fc-muted)">Đang tải bộ thẻ…</p>
    </div>`;
}
function renderFatal(icon, title, msg) {
    if (document.getElementById('fc-deck-sub')) document.getElementById('fc-deck-sub').textContent = title;
    container.innerHTML = `<div class="fc-glass rounded-3xl p-8 text-center max-w-lg mx-auto">
        <div class="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-2xl" style="background:rgba(255,105,180,.12); color:var(--fc-pink-600)"><i class="fas ${icon}"></i></div>
        <h2 class="text-xl font-extrabold mb-2">${esc(title)}</h2>
        <p class="text-sm mb-6" style="color:var(--fc-muted)">${esc(msg)}</p>
        <div class="flex flex-col sm:flex-row gap-2.5 justify-center">
            <button onclick="location.reload()" class="fc-btn fc-btn-primary py-2.5 px-5"><i class="fas fa-rotate-right"></i> Thử lại</button>
            <a href="../../index.html#libraryContent" class="fc-btn fc-btn-ghost py-2.5 px-5"><i class="fas fa-book"></i> Về thư viện</a>
        </div>
    </div>`;
}

// ============================================================
//  Ràng buộc sự kiện dùng chung
// ============================================================
function bindTabs() {
    container.querySelectorAll('[data-view]').forEach(btn => {
        btn.onclick = () => {
            const v = btn.dataset.view;
            if (v === S.view) return;
            S.view = v;
            if (v === 'study') buildOrder(false);
            render();
        };
    });
}
function bindFilter() {
    const topic = document.getElementById('fc-topic');
    if (topic) topic.onchange = (e) => {
        S.topic = e.target.value;
        if (S.view === 'study') buildOrder(false);
        render();
    };
    const search = document.getElementById('fc-search');
    if (search) {
        let t;
        search.oninput = (e) => {
            S.search = e.target.value;
            clearTimeout(t);
            t = setTimeout(() => {
                if (S.view === 'study') buildOrder(false);
                render();
                const s = document.getElementById('fc-search');
                if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
            }, 260);
        };
    }
}

// Kéo thẻ kiểu "quẹt" (Tinder) trên cảm ứng: kéo phải = Thuộc, kéo trái = Chưa thuộc.
// Thẻ đi theo ngón tay (nghiêng nhẹ) + nhãn màu hiện dần; thả qua ngưỡng thì thẻ bay đi
// và tự sang câu kế. Kéo dọc vẫn cuộn nội dung bình thường; chạm (tap) để lật.
function attachCardGestures(scene) {
    const badgeR = scene.querySelector('.fc-swipe-badge.right');
    const badgeL = scene.querySelector('.fc-swipe-badge.left');
    const inner = scene.querySelector('.flashcard-inner');
    const tilt = scene.querySelector('.flashcard-tilt');
    let startX = 0, startY = 0, dx = 0, dy = 0;
    let dragging = false, decided = false, horizontal = false;
    let raf = 0;

    const cardW = () => scene.offsetWidth || 320;
    const thresh = () => Math.min(130, Math.max(72, cardW() * 0.28));
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    const setBadges = () => {
        const p = Math.min(1, Math.abs(dx) / thresh());
        if (dx > 0) { if (badgeR) badgeR.style.opacity = p; if (badgeL) badgeL.style.opacity = 0; }
        else if (dx < 0) { if (badgeL) badgeL.style.opacity = p; if (badgeR) badgeR.style.opacity = 0; }
        else { if (badgeR) badgeR.style.opacity = 0; if (badgeL) badgeL.style.opacity = 0; }
    };
    // Vẽ khung hình theo rAF (gom nhiều touchmove thành 1 lần cập nhật → mượt, không giật)
    const paint = () => {
        raf = 0;
        const rot = clamp(dx * 0.04, -10, 10);
        scene.style.transform = `translateX(${dx.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(1.04)`;
        // Nghiêng 3D theo hướng kéo cho cảm giác cầm thẻ thật (thẻ "ngả" theo lực kéo)
        if (tilt) {
            const ry = clamp(dx * 0.07, -15, 15);
            const rx = clamp(-dy * 0.05, -8, 8);
            tilt.style.transform = `rotateY(${ry.toFixed(2)}deg) rotateX(${rx.toFixed(2)}deg)`;
        }
        setBadges();
    };
    const reset = (animate) => {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        const tr = animate ? 'transform .32s cubic-bezier(.34,1.32,.44,1)' : 'none';
        scene.style.transition = tr;
        scene.style.transform = '';
        if (tilt) { tilt.style.transition = tr; tilt.style.transform = ''; }
        if (badgeR) badgeR.style.opacity = 0;
        if (badgeL) badgeL.style.opacity = 0;
        if (inner) inner.classList.remove('dragging');
        scene.classList.remove('grabbing');
    };

    const onStart = (e) => {
        // Bỏ qua khi chạm vào phần tương tác bên trong (loa, ghi chú, nút mở rộng, liên kết)
        if (e.target.closest('.fc-face-speak') || e.target.closest('#fc-note') ||
            e.target.closest('summary') || e.target.closest('details') || e.target.closest('a')) {
            dragging = false; return;
        }
        const t = e.touches ? e.touches[0] : e;
        startX = t.clientX; startY = t.clientY; dx = 0; dy = 0;
        dragging = true; decided = false; horizontal = false;
        // Tắt animation vào (nếu còn chạy) — CSS animation đè inline transform khiến kéo bị "đơ" lúc đầu
        scene.style.animation = 'none';
        scene.style.transition = 'none';
        if (tilt) tilt.style.transition = 'none';
    };
    const onMove = (e) => {
        if (!dragging) return;
        const t = e.touches ? e.touches[0] : e;
        dx = t.clientX - startX; dy = t.clientY - startY;
        if (!decided) {
            if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
                decided = true;
                horizontal = Math.abs(dx) > Math.abs(dy);
                if (horizontal) {
                    if (inner) inner.classList.add('dragging');
                    scene.classList.add('grabbing'); // nhấc thẻ + bóng đổ đậm hơn
                }
            } else return;
        }
        if (!horizontal) return; // để cảm ứng cuộn nội dung theo chiều dọc
        if (e.cancelable) e.preventDefault(); // chặn cuộn khi đang quẹt ngang
        if (!raf) raf = requestAnimationFrame(paint); // gom cập nhật theo khung hình
    };
    const onEnd = () => {
        if (!dragging) return;
        dragging = false;
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        // Bất kỳ thao tác kéo thực sự nào (ngang hay dọc) đều chặn cú click lật thẻ theo sau
        if (decided && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) scene._swipeHandled = true;
        if (decided && horizontal && Math.abs(dx) > thresh()) {
            flyOffAndMark(scene, dx > 0);
        } else {
            reset(true);
        }
    };

    scene.addEventListener('touchstart', onStart, { passive: true });
    scene.addEventListener('touchmove', onMove, { passive: false });
    scene.addEventListener('touchend', onEnd);
    scene.addEventListener('touchcancel', onEnd);
}

// Cho thẻ bay ra khỏi màn hình theo hướng quẹt rồi đánh dấu + sang câu kế
function flyOffAndMark(scene, known) {
    const dir = known ? 1 : -1;
    const badge = scene.querySelector(known ? '.fc-swipe-badge.right' : '.fc-swipe-badge.left');
    if (badge) badge.style.opacity = 1;
    scene.style.transition = 'transform .26s ease-in, opacity .26s ease-in';
    scene.style.transform = `translateX(${dir * 145}%) rotate(${dir * 14}deg)`;
    scene.style.opacity = '0';
    const c = currentCard();
    if (c) {
        S.known[c.qText] = known;
        saveKnown();
        buzz(known ? 18 : [10, 40, 10]);
        updateHeader();
    }
    setTimeout(goNext, 250); // render() tạo lại scene mới nên style cũ tự mất
}

// Nghiêng thẻ 3D theo con trỏ chuột (chỉ trên thiết bị có chuột) + ánh sáng lướt theo.
function setupCardTilt(scene) {
    if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const tilt = scene.querySelector('.flashcard-tilt');
    if (!tilt) return;
    const MAX = 9; // độ nghiêng tối đa (deg)
    let raf = 0;
    const onMove = (e) => {
        const r = scene.getBoundingClientRect();
        const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
        scene.style.setProperty('--gx', (px * 100) + '%');
        scene.style.setProperty('--gy', (py * 100) + '%');
        const ry = (px - 0.5) * MAX * 2;
        const rx = (0.5 - py) * MAX * 2;
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
            tilt.style.transition = 'none';
            tilt.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
        });
        scene.classList.add('tilting');
    };
    const onLeave = () => {
        if (raf) cancelAnimationFrame(raf);
        tilt.style.transition = 'transform .45s cubic-bezier(.2,.7,.2,1)';
        tilt.style.transform = '';
        scene.classList.remove('tilting');
    };
    scene.addEventListener('mousemove', onMove);
    scene.addEventListener('mouseleave', onLeave);
}

// ============================================================
//  Phím tắt toàn cục
// ============================================================
function setupGlobalKeys() {
    document.addEventListener('keydown', (e) => {
        if (S.view !== 'study' || S.done || !S.order.length) return;
        const tag = document.activeElement && document.activeElement.tagName;
        if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;
        if (e.ctrlKey || e.altKey || e.metaKey) return;

        if (e.code === 'Space') { e.preventDefault(); flip(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
        else if (e.key === 'Enter' || e.key === 'ArrowUp') {
            if (S.flipped) { e.preventDefault(); markCurrent(true); }
        }
        else if (e.key.toLowerCase() === 'u' || e.key === 'ArrowDown') {
            if (S.flipped) { e.preventDefault(); markCurrent(false); }
        }
    });
}

// ============================================================
//  Đọc to (Text-to-Speech)
// ============================================================
let _voices = [];
function loadVoices() {
    if ('speechSynthesis' in window) {
        try { _voices = window.speechSynthesis.getVoices() || []; } catch (e) { _voices = []; }
    }
}
function stopSpeak() {
    if ('speechSynthesis' in window) { try { window.speechSynthesis.cancel(); } catch (e) {} }
    document.querySelectorAll('.fc-face-speak.speaking').forEach(b => b.classList.remove('speaking'));
}
function speak(text, btn) {
    if (!('speechSynthesis' in window)) { showToast('Trình duyệt không hỗ trợ đọc to.', 'error'); return; }
    const t = stripToText(text);
    if (!t) return;
    stopSpeak();
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'vi-VN';
    const v = _voices.find(vo => /vi/i.test(vo.lang));
    if (v) u.voice = v;
    if (btn) {
        btn.classList.add('speaking');
        u.onend = u.onerror = () => btn.classList.remove('speaking');
    }
    try { window.speechSynthesis.speak(u); } catch (e) {}
}
function currentCard() {
    return (S.view === 'study' && !S.done && S.order.length) ? S.cards[S.order[S.pos]] : null;
}
function speakCurrent(side, btn) {
    const c = currentCard();
    if (!c) return;
    const target = btn || container.querySelector(`.fc-face-speak[data-side="${side}"]`);
    if (side === 'q') speak(c.question, target);
    else speak(correctText(c) + '. ' + (c.explanation || ''), target);
}

// ============================================================
//  Rung phản hồi & pháo giấy
// ============================================================
function buzz(pattern) {
    if (S.vibrate && navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) {} }
}
function fireConfetti() {
    const run = () => { if (window.confetti) window.confetti({ particleCount: 130, spread: 75, origin: { y: 0.65 } }); };
    if (window.confetti) { run(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js';
    s.onload = run;
    document.head.appendChild(s);
}

// ============================================================
//  Bảng thiết lập (cỡ chữ / tự đọc / rung)
// ============================================================
function applyFontClass() {
    container.classList.remove('fc-font-1', 'fc-font-2', 'fc-font-3', 'fc-font-4');
    container.classList.add('fc-font-' + S.fontSize);
}
function getPref(k, def) {
    try { const v = localStorage.getItem(k); return v == null ? def : v; } catch (e) { return def; }
}
function loadPrefs() {
    S.fontSize = Math.min(4, Math.max(1, parseInt(getPref('flashcard_fontsize', '2'), 10) || 2));
    S.autoSpeak = getPref('flashcard_autospeak', '0') === '1';
    S.vibrate = getPref('flashcard_vibrate', '1') === '1';
}
function refreshSettingsUI() {
    document.querySelectorAll('#fc-fontsize-seg button').forEach(b => {
        b.classList.toggle('is-active', parseInt(b.dataset.size, 10) === S.fontSize);
    });
    const as = document.getElementById('fc-autospeak-toggle');
    if (as) { as.classList.toggle('on', S.autoSpeak); as.setAttribute('aria-checked', String(S.autoSpeak)); }
    const vb = document.getElementById('fc-vibrate-toggle');
    if (vb) { vb.classList.toggle('on', S.vibrate); vb.setAttribute('aria-checked', String(S.vibrate)); }
}
function setupSettings() {
    loadPrefs();
    applyFontClass();
    refreshSettingsUI();

    const btn = document.getElementById('fc-settings-btn');
    const pop = document.getElementById('fc-settings-pop');
    if (btn && pop) {
        btn.addEventListener('click', (e) => { e.stopPropagation(); pop.classList.toggle('hidden-pop'); });
        document.addEventListener('click', (e) => {
            if (!pop.classList.contains('hidden-pop') && !pop.contains(e.target) && e.target !== btn) {
                pop.classList.add('hidden-pop');
            }
        });
    }
    document.querySelectorAll('#fc-fontsize-seg button').forEach(b => {
        b.addEventListener('click', () => {
            S.fontSize = parseInt(b.dataset.size, 10) || 2;
            try { localStorage.setItem('flashcard_fontsize', String(S.fontSize)); } catch (e) {}
            applyFontClass();
            refreshSettingsUI();
        });
    });
    const as = document.getElementById('fc-autospeak-toggle');
    if (as) {
        const toggle = () => {
            S.autoSpeak = !S.autoSpeak;
            try { localStorage.setItem('flashcard_autospeak', S.autoSpeak ? '1' : '0'); } catch (e) {}
            if (!S.autoSpeak) stopSpeak();
            refreshSettingsUI();
        };
        as.addEventListener('click', toggle);
        as.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    }
    const vb = document.getElementById('fc-vibrate-toggle');
    if (vb) {
        const toggle = () => {
            S.vibrate = !S.vibrate;
            try { localStorage.setItem('flashcard_vibrate', S.vibrate ? '1' : '0'); } catch (e) {}
            if (S.vibrate) buzz(15);
            refreshSettingsUI();
        };
        vb.addEventListener('click', toggle);
        vb.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    }
}

// ============================================================
//  Chế độ sáng / tối
// ============================================================
function setupThemeToggle() {
    const btn = document.getElementById('fc-theme-btn');
    const syncIcon = () => {
        const dark = document.documentElement.classList.contains('theme-dark');
        if (btn) btn.innerHTML = dark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    };
    syncIcon();
    if (btn) btn.onclick = () => {
        const dark = document.documentElement.classList.toggle('theme-dark');
        try { localStorage.setItem('quiz_theme', dark ? 'dark' : 'light'); } catch (e) {}
        syncIcon();
    };
}

// ============================================================
//  Khởi tạo
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    loadVoices();
    if ('speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    setupThemeToggle();
    setupSettings();
    setupGlobalKeys();
    loadData();

    // Dừng đọc khi rời trang / ẩn tab
    window.addEventListener('pagehide', stopSpeak);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopSpeak(); });

    onAuthStateChanged(auth, async (user) => {
        S.uid = user ? user.uid : null;
        if (S.uid && quizId) {
            try { await syncPullStudy(S.uid, quizId, { preferCloud: false }); } catch (e) {}
            refreshVisibleNote();
        }
    });
});
