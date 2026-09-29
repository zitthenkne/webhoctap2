// File: features/quiz/page/quiz-essay.js
// Giao diện CÂU TỰ LUẬN ở trang làm bài: ô bài làm, đáp án mẫu, chấm theo barem (máy tick sẵn
// theo từ khóa, người làm xem lại), ca mở dần (caseReveal + khóa câu trước) và khung chấm lại ở
// màn kết quả. Lõi chấm điểm + dò từ khóa (thuần, không DOM) nằm ở ../quiz-essay-core.js.
//
// Chế độ dùng lại công tắc "Xem đáp án ngay" sẵn có (state.quizOptions.showAnswerImmediately):
//   bật  -> mỗi câu có nút "Xong, xem đáp án": chốt bài, máy chấm sơ bộ, hiện đáp án + barem ngay tại câu
//   tắt  -> gõ tự do; nộp bài thì máy chấm sơ bộ, đáp án + barem mở ở màn kết quả (điểm cập nhật tức thì)

import { showToast } from '../../../core/utils.js';
import { state, saveQuizState } from '../quiz-state.js';
import { parseMarkdown, renderMath } from '../quiz-helpers.js';
import {
    rubricOf, essayPoints, essayMaxPoints, essayCredit, questionWeight, isEssayGraded, countWords,
    isLockedByReveal, autoMatch, withAutoGrade, missingCritical, modelCoverage, formatOf, answerDocs, partsText
} from '../quiz-essay-core.js';
import { syncQuizNavPanel, studyExtrasHtml } from '../quiz-ui.js';
import { caseKeyOf } from './quiz-cases.js';
import { updateMobileNav } from './quiz-mobile-nav.js';
import { showQuestion, showNextQuestion } from './quiz-question-view.js';
import { refreshResults } from './quiz-session.js';

const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n) => String(Math.round(n * 100) / 100).replace('.', ',');
const hasText = (ans) => !!(ans && String(ans.text || '').trim());

/* ------------------------------------------------------------------
   Ca mở dần: câu con mang caseReveal -> thông tin đó nối vào khung ca TỪ câu đó trở đi;
   đã xem tới câu có thông tin mới thì các câu TRƯỚC của ca bị khóa (như thi tình huống thật).
   state.caseSeen = { [caseId]: câu xa nhất đã xem (1-based) } — lưu cùng bài làm dở.
   ------------------------------------------------------------------ */
function caseRange(idx) {
    const q = state.questions[idx];
    const key = caseKeyOf(q);
    if (!key || !q.__caseSeq) return null;
    const first = idx - (q.__caseSeq - 1);
    return { key, seq: q.__caseSeq, first, qs: state.questions.slice(first, first + q.__caseTotal) };
}

export function isQuestionLocked(idx) {
    const r = caseRange(idx);
    return !!r && isLockedByReveal(r.qs, r.seq, (state.caseSeen && state.caseSeen[r.key]) || 0);
}

// Gọi mỗi lần hiện câu (TRƯỚC khi vẽ). Chốt luôn bài tự luận của các câu vừa bị khóa.
export function noteCaseProgress(idx) {
    const r = caseRange(idx);
    if (!r) return;
    if (!state.caseSeen) state.caseSeen = {};
    const before = state.caseSeen[r.key] || 0;
    if (r.seq <= before) return;
    state.caseSeen[r.key] = r.seq;
    const newlyLocked = [];
    for (let s = 1; s < r.seq; s++) {
        if (isLockedByReveal(r.qs, s, before) || !isLockedByReveal(r.qs, s, r.seq)) continue;
        newlyLocked.push(s);
        const gi = r.first + s - 1;
        const ans = state.userAnswers[gi];
        if (ans && typeof ans === 'object' && !Array.isArray(ans)) {
            state.userAnswers[gi] = withAutoGrade(state.questions[gi], { ...ans, done: true });
        }
    }
    if (newlyLocked.length) showToast(`Đã mở thông tin bổ sung — khóa câu ${newlyLocked.join(', ')} của ca.`, 'info', 3200);
}

// Các khối "Thông tin bổ sung" của ca tính tới câu đang xem (nối vào cuối #case-body)
export function caseRevealsHtml(idx) {
    const r = caseRange(idx);
    if (!r) return '';
    let html = '';
    for (let s = 1; s <= r.seq; s++) {
        const rev = String(r.qs[s - 1]?.caseReveal || '').trim();
        if (!rev) continue;
        html += `<div class="case-reveal${s === r.seq ? ' is-new' : ''}">
            <div class="case-reveal-tag"><i class="fas fa-circle-plus"></i> Thông tin bổ sung · câu ${s}</div>
            ${parseMarkdown(rev)}
        </div>`;
    }
    return html;
}

// Câu trắc nghiệm CHƯA trả lời mà đã bị khóa: khóa ô đáp án + ghi chú. Trả true nếu đã khóa.
export function lockMcqIfNeeded(idx) {
    if (!isQuestionLocked(idx)) return false;
    document.querySelectorAll('.answer-btn').forEach(btn => {
        btn.classList.add('answer-locked');
        btn.setAttribute('aria-disabled', 'true');
    });
    document.getElementById('answers-container')?.insertAdjacentHTML('beforebegin', lockNoteHtml());
    return true;
}

function lockNoteHtml() {
    return `<p class="essay-lock"><i class="fas fa-lock"></i> Đã khóa: bạn đã xem thông tin bổ sung ở câu sau của ca.</p>`;
}

/* ------------------------------------------------------------------
   Ô nhập theo kiểu đề (answerFormat) + bài làm dạng đọc có tô chữ máy nhận ra
   (xanh = khớp một ý, vàng = gần khớp, đỏ = dính lỗi trừ điểm). Tô chỉ khi ĐÃ mở đáp án.
   ------------------------------------------------------------------ */
function answerMarks(q, ans) {
    const items = rubricOf(q).items;
    const docs = answerDocs(q, ans);
    const marks = docs.map(() => []);
    autoMatch(q, ans).forEach((m, i) => {
        if (!m.level) return;
        const kind = items[i].penalty ? 'bad' : m.level;
        m.ranges.forEach(([d, s, e]) => { if (marks[d]) marks[d].push([s, e, kind]); });
    });
    return { docs, marks };
}

function docHtml(text, marks = []) {
    const src = String(text || '').normalize('NFC');
    const ranges = marks.slice().sort((a, b) => a[0] - b[0] || (a[2] === 'match' ? -1 : 1));
    let out = '', pos = 0;
    ranges.forEach(([s, e, kind]) => {
        if (s < pos) return;
        out += escHtml(src.slice(pos, s)) + `<mark class="essay-hit is-${kind}">${escHtml(src.slice(s, e))}</mark>`;
        pos = e;
    });
    return out + escHtml(src.slice(pos));
}

// Bảng dùng chung cho ô nhập và bài đọc; cột đầu = nhãn hàng hoặc số hàng
function tableHtml(format, cellFn) {
    const cols = format.columns.length;
    return `<div class="essay-table-wrap"><table class="essay-table">
        <thead><tr><th class="is-rowhead"></th>${format.columns.map(c => `<th>${escHtml(c)}</th>`).join('')}</tr></thead>
        <tbody>${Array.from({ length: format.rows }, (_, r) => `<tr>
            <th scope="row" class="is-rowhead">${format.rowLabels[r] ? escHtml(format.rowLabels[r]) : r + 1}</th>
            ${format.columns.map((c, j) => `<td data-col="${escHtml(c)}">${cellFn(r * cols + j)}</td>`).join('')}
        </tr>`).join('')}</tbody>
    </table></div>`;
}

function inputsHtml(q, ans, readonly) {
    const format = formatOf(q);
    const ro = readonly ? 'readonly' : '';
    const parts = ans && Array.isArray(ans.parts) ? ans.parts : [];
    const ph = (s) => escHtml(format.placeholder || s);
    if (format.kind === 'text' || format.kind === 'short') {
        const short = format.kind === 'short';
        return `<textarea id="essay-input" class="essay-input${short ? ' is-short' : ''}" rows="${short ? 1 : 5}" spellcheck="false" ${ro}
            placeholder="${ph(short ? 'Trả lời ngắn…' : 'Gõ câu trả lời… mỗi ý một dòng cho dễ đối chiếu')}">${escHtml((ans && ans.text) || '')}</textarea>`;
    }
    const box = (d, placeholder) => `<textarea class="essay-part" data-part="${d}" rows="1" spellcheck="false" ${ro}
        placeholder="${escHtml(placeholder)}">${escHtml(parts[d] || '')}</textarea>`;
    if (format.kind === 'list') {
        return `<ol class="essay-list">${Array.from({ length: format.count }, (_, d) =>
            `<li>${box(d, format.labels[d] || format.placeholder || `Ý ${d + 1}`)}</li>`).join('')}</ol>`;
    }
    if (format.kind === 'fields') {
        return `<div class="essay-fields">${format.labels.map((l, d) =>
            `<label class="essay-field"><span class="essay-field-label">${escHtml(l)}</span>${box(d, format.placeholder || '…')}</label>`).join('')}</div>`;
    }
    return tableHtml(format, (d) => box(d, ''));
}

// Bài làm dạng đọc theo đúng kiểu ô; withMarks = tô chữ máy nhận ra
export function answerReadHtml(q, ans, withMarks) {
    const format = formatOf(q);
    const { docs, marks } = withMarks ? answerMarks(q, ans) : { docs: answerDocs(q, ans), marks: [] };
    const cell = (d) => (String(docs[d] || '').trim() ? docHtml(docs[d], marks[d]) : '<span class="essay-empty-cell">—</span>');
    if (format.kind === 'list') return `<ol class="essay-read-list">${docs.map((_, d) => `<li>${cell(d)}</li>`).join('')}</ol>`;
    if (format.kind === 'fields') {
        return `<dl class="essay-read-fields">${format.labels.map((l, d) => `<dt>${escHtml(l)}</dt><dd>${cell(d)}</dd>`).join('')}</dl>`;
    }
    if (format.kind === 'table') return tableHtml(format, cell);
    return `<div class="essay-read-text">${docHtml(docs[0], marks[0])}</div>`;
}

// Ý gắn vào một ô -> nhãn ngắn của ô đó (hiện trên barem để biết máy dò ở đâu)
function fieldLabel(format, field) {
    if (!field) return '';
    if (format.kind === 'fields') return format.labels[field - 1] || '';
    if (format.kind === 'list') return `ý ${field}`;
    if (format.kind === 'table') return format.rowLabels[field - 1] || `hàng ${field}`;
    return '';
}

/* ------------------------------------------------------------------
   Đáp án mẫu + khung chấm theo barem (dùng chung cho màn làm bài và màn kết quả)
   ------------------------------------------------------------------ */
function modelHtml(q) {
    const model = String(q.modelAnswer || '').trim();
    if (!model) return '';
    const explicit = Array.isArray(q.keyPoints) && q.keyPoints.length > 0;
    const kps = rubricOf(q).items;
    if (!explicit && kps.length) {
        // Ý chấm được tách từ chính đáp án mẫu -> danh sách tick đã là đáp án; chỉ mở bản đầy đủ
        // khi đáp án mẫu còn phần khác ngoài các gạch đầu dòng (ý con, đoạn văn).
        const lines = model.split('\n').filter(l => l.trim()).length;
        if (lines <= kps.length) return '';
        return `<details class="essay-model is-fold"><summary><i class="fas fa-book-open"></i> Đáp án mẫu đầy đủ</summary>
            <div class="essay-model-body" data-annot="model">${parseMarkdown(model)}</div></details>`;
    }
    return `<div class="essay-model">
        <div class="essay-model-head"><i class="fas fa-book-open"></i> Đáp án mẫu</div>
        <div class="essay-model-body" data-annot="model">${parseMarkdown(model)}</div>
    </div>`;
}

function markOf(ans, i) {
    if (!ans) return 0;
    if (Array.isArray(ans.ticks) && ans.ticks.includes(i)) return 'full';
    if (Array.isArray(ans.partials) && ans.partials.includes(i)) return 'half';
    return 0;
}

function itemRowHtml(it, i, ans, m, readonly, format) {
    const mark = markOf(ans, i);
    const cls = ['essay-kp', mark === 'full' && 'is-on', mark === 'half' && 'is-half', it.penalty && 'is-penalty',
        !mark && m && m.level === 'near' && !it.penalty && 'is-near'].filter(Boolean).join(' ');
    const words = m ? escHtml(m.words.slice(0, 3).join(', ')) : '';
    let tags = it.critical ? '<span class="essay-kp-tag is-crit">Bắt buộc</span>' : '';
    const where = format ? fieldLabel(format, it.field) : '';
    if (where) tags += `<span class="essay-kp-tag is-field" title="Máy chỉ dò ý này trong ô này">ô: ${escHtml(where)}</span>`;
    if (m && m.level && !it.penalty) {
        tags += m.level === 'match'
            ? `<span class="essay-kp-tag is-auto" title="Máy nhận ra trong bài của bạn"><i class="fas fa-wand-magic-sparkles"></i> ${words}</span>`
            : `<span class="essay-kp-tag is-near" title="Có vài chữ trùng — tự xem có đúng ý không">gần khớp: ${words}</span>`;
    }
    if (m && m.level && it.penalty) tags += `<span class="essay-kp-tag is-bad">bài có nhắc “${words}” — tự kiểm tra</span>`;
    const pts = mark === 'half' ? `${fmt(it.partial)}/${fmt(it.points)}đ` : `${fmt(it.points)}đ`;
    const inner = `<span class="essay-kp-box" aria-hidden="true">${it.penalty ? '<i class="fas fa-minus"></i>' : mark === 'half' ? '½' : '<i class="fas fa-check"></i>'}</span>
        <span class="essay-kp-body"><span class="essay-kp-text">${parseMarkdown(it.text)}</span>${tags ? `<span class="essay-kp-tags">${tags}</span>` : ''}</span>
        <span class="essay-kp-pts">${pts}</span>`;
    if (readonly) return `<li><div class="${cls}">${inner}</div></li>`;
    const half = it.partial
        ? `<button type="button" class="essay-kp-half${mark === 'half' ? ' is-on' : ''}" data-kp-half="${i}" aria-pressed="${mark === 'half'}" title="Nêu chưa đủ ý: ${fmt(it.partial)}đ">½</button>`
        : '';
    return `<li class="essay-kp-row"><button type="button" class="${cls}" data-kp="${i}" aria-pressed="${mark === 'full'}">${inner}</button>${half}</li>`;
}

// Danh sách ý theo đúng thứ tự tác giả; nhóm "nêu k trong n" gom thành khung có trần điểm;
// lỗi trừ điểm tách xuống khung riêng.
function rubricListHtml(q, ans, matches, readonly) {
    const { items, groups } = rubricOf(q);
    const format = formatOf(q);
    const val = (i) => { const k = markOf(ans, i); return k === 'full' ? items[i].points : k === 'half' ? items[i].partial : 0; };
    let main = '';
    let pens = '';
    items.forEach((it, i) => {
        const m = matches && matches[i];
        if (it.penalty) { pens += itemRowHtml(it, i, ans, m, readonly, format); return; }
        if (it.group < 0) { main += itemRowHtml(it, i, ans, m, readonly, format); return; }
        const g = groups[it.group];
        if (g.idxs[0] !== i) return;           // cả nhóm vẽ một lần ở ý đầu tiên
        const got = Math.min(g.max, g.idxs.reduce((a, k) => a + val(k), 0));
        const sum = g.idxs.reduce((a, k) => a + items[k].points, 0);
        main += `<li class="essay-kp-group">
            <div class="essay-kp-group-head">
                <span>${escHtml(g.label || 'Nhóm ý')}</span>
                <b>${fmt(got)}/${fmt(g.max)}đ${g.max < sum ? ' <em>(tối đa)</em>' : ''}</b>
            </div>
            <ul class="essay-kps">${g.idxs.map(k => itemRowHtml(items[k], k, ans, matches && matches[k], readonly, format)).join('')}</ul>
        </li>`;
    });
    return `<ul class="essay-kps">${main}</ul>`
        + (pens ? `<div class="essay-pen"><div class="essay-pen-head"><i class="fas fa-triangle-exclamation"></i> Lỗi trừ điểm${readonly ? '' : ' — tick nếu bài bạn mắc'}</div><ul class="essay-kps">${pens}</ul></div>` : '');
}

export function gradeHtml(q, idx, ans) {
    const { items } = rubricOf(q);
    const max = essayMaxPoints(q);
    const w = Number(q.maxScore) > 0 ? questionWeight(q) : 0;
    const weightTxt = (credit) => (w ? ` · câu ${fmt(credit * w)}/${fmt(w)}đ` : '');
    if (!hasText(ans)) {
        if (!items.length) return '';
        // Bỏ trống: vẫn cho xem barem (không có gì để tick)
        return `<div class="essay-grade is-readonly">
            <div class="essay-grade-head"><span><i class="fas fa-list-check"></i> Barem</span><b class="essay-score">0/${fmt(max)} điểm</b></div>
            ${rubricListHtml(q, null, null, true)}
        </div>`;
    }
    const graded = isEssayGraded(q, ans);
    if (!items.length) {
        const c = modelCoverage(q, ans.text);
        return `<div class="essay-grade" data-essay-grade="${idx}">
            <div class="essay-grade-head"><span><i class="fas fa-list-check"></i> Tự chấm cả câu</span>
                <b class="essay-score${graded ? '' : ' is-pending'}">${graded ? `${fmt(ans.self)}/1${weightTxt(ans.self)}` : 'Chưa chấm'}</b></div>
            ${c.total ? `<p class="essay-grade-hint">Câu này không có barem ý. Bài bạn nhắc ${c.hit}/${c.total} thuật ngữ có trong đáp án mẫu (chỉ để tham khảo).</p>` : ''}
            <div class="essay-self" role="group" aria-label="Tự chấm cả câu">${[[0, 'Chưa đạt'], [0.5, 'Một phần'], [1, 'Đạt']].map(([v, label]) =>
                `<button type="button" class="essay-self-btn${ans.self === v ? ' is-on' : ''}" data-self="${v}" aria-pressed="${ans.self === v}">${label}</button>`).join('')}</div>
        </div>`;
    }
    const matches = autoMatch(q, ans);
    const got = essayPoints(q, ans);
    const missing = graded ? missingCritical(q, ans) : [];
    const score = graded ? `${fmt(got)}/${fmt(max)} điểm${weightTxt(essayCredit(q, ans))}` : 'Chưa chấm';
    return `<div class="essay-grade" data-essay-grade="${idx}">
        <div class="essay-grade-head">
            <span><i class="fas fa-list-check"></i> Chấm theo barem</span>
            <b class="essay-score${graded && !ans.auto ? '' : ' is-pending'}">${score}</b>
        </div>
        ${ans.auto ? `<div class="essay-auto-note">
            <span><i class="fas fa-wand-magic-sparkles"></i> <b>Máy chấm sơ bộ:</b> đã tick các ý có từ khóa khớp (chữ tô xanh trong bài). Máy không hiểu câu phủ định hay cách nói khác — hãy xem lại, tick thêm ý bạn đã nêu.</span>
            <button type="button" class="essay-ok-btn" data-grade-ok><i class="fas fa-check"></i> Đã xem lại</button>
        </div>` : '<p class="essay-grade-hint">Tick ý bài bạn đã nêu (diễn đạt khác mà cùng nghĩa vẫn tính). Nút ½ = nêu chưa đủ.</p>'}
        ${missing.length ? `<p class="essay-crit-note"><i class="fas fa-circle-exclamation"></i> Thiếu ý bắt buộc → cả câu 0 điểm.</p>` : ''}
        ${rubricListHtml(q, ans, matches, false)}
        ${graded ? '' : '<button type="button" class="essay-none" data-kp-none>Không nêu được ý nào</button>'}
    </div>`;
}

// Màn kết quả: bài của mình (tô chữ khớp) -> đáp án mẫu -> barem, xếp dọc
export function essayReviewHtml(q, idx, ans) {
    wireGrading();
    return `<div class="essay-review">
        <div class="essay-mine">
            <div class="essay-mine-head"><i class="fas fa-pen"></i> Bài làm của bạn</div>
            <div class="essay-mine-text">${hasText(ans) ? answerReadHtml(q, ans, true) : '<i>Bỏ trống</i>'}</div>
        </div>
        ${modelHtml(q)}
        ${gradeHtml(q, idx, ans)}
        ${studyExtrasHtml(q)}
    </div>`;
}


/* ------------------------------------------------------------------
   Màn làm bài
   ------------------------------------------------------------------ */
export function isEssayRevealed(idx) {
    const ans = state.userAnswers[idx];
    return !!state.quizOptions.showAnswerImmediately && (!!(ans && ans.done) || isQuestionLocked(idx));
}

export function essayCardHtml(q, idx) {
    const ans = state.userAnswers[idx];
    const locked = isQuestionLocked(idx);
    const done = !!(ans && ans.done) || locked;
    const immediate = !!state.quizOptions.showAnswerImmediately;
    const revealed = isEssayRevealed(idx);
    const text = (ans && ans.text) || '';
    const exp = q.explanation && String(q.explanation).trim();
    // Đã mở đáp án: bài làm hiện dạng đọc, tô chữ máy nhận ra (tô trước khi mở = lộ đáp án nên không làm)
    const sheetBody = revealed && text.trim()
        ? `<div id="essay-read" class="essay-read">${answerReadHtml(q, ans, true)}</div>`
        : inputsHtml(q, ans, done);
    const kind = formatOf(q).kind;
    return `
    <div id="essay-area" class="essay-area">
        <div class="essay-sheet is-${kind}${done ? ' is-done' : ''}">
            <label ${kind === 'text' || kind === 'short' ? 'for="essay-input" ' : ''}class="essay-sheet-head">
                <span><i class="fas fa-pen"></i> Bài làm của bạn</span>
                <span id="essay-wc" class="essay-wc">${countWords(text)} từ</span>
            </label>
            ${sheetBody}
            ${locked ? lockNoteHtml() : ''}
        </div>
        ${done ? '' : `
        <div class="essay-actions">
            <span class="essay-kbd">${immediate ? '' : 'Đáp án mở sau khi nộp bài · '}<kbd class="kbd-key">Ctrl</kbd>+<kbd class="kbd-key">Enter</kbd>${immediate ? '' : ' câu tiếp'}</span>
            ${immediate ? '<button type="button" id="essay-done-btn" class="essay-done-btn"><i class="fas fa-check"></i> Xong, xem đáp án</button>' : ''}
        </div>`}
        ${revealed ? `
        <div class="essay-reveal">
            ${modelHtml(q)}
            ${gradeHtml(q, idx, ans)}
            ${exp ? `<div class="essay-exp"><b><i class="fas fa-lightbulb"></i> Giải thích:</b> ${parseMarkdown(exp)}</div>` : ''}
        </div>` : ''}
    </div>`;
}

function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight + 2, window.innerHeight * 0.7) + 'px';
}

let saveTimer = null;
export function setupEssay(idx) {
    wireGrading();
    document.getElementById('essay-done-btn')?.addEventListener('click', () => finishEssay(idx));
    const format = formatOf(state.questions[idx]);
    // Ô nhập theo thứ tự DOM = thứ tự ô (bảng: theo hàng, trái -> phải)
    const inputs = [...document.querySelectorAll('#essay-area #essay-input, #essay-area .essay-part')];
    inputs.forEach(autoGrow);
    if (!inputs.length || inputs[0].readOnly) return;
    const onChange = () => {
        const had = state.userAnswers[idx] != null;
        const cur = state.userAnswers[idx];
        const parts = format.parts > 1 ? inputs.map(el => el.value) : null;
        const text = parts ? partsText(format, parts) : inputs[0].value;
        // Chỉ tính là "đã làm" khi có chữ thật; xóa trắng = trở về chưa làm
        state.userAnswers[idx] = text.trim()
            ? { ticks: null, ...(cur || {}), text, ...(parts ? { parts } : {}), done: false }
            : null;
        const wc = document.getElementById('essay-wc');
        if (wc) wc.textContent = `${countWords(text)} từ`;
        if (had !== (state.userAnswers[idx] != null)) { syncQuizNavPanel(); updateMobileNav(); }
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveQuizState, 500);
    };
    inputs.forEach((el, k) => {
        el.addEventListener('input', () => { autoGrow(el); onChange(); });
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finishEssay(idx); return; }
            if (e.key === 'Escape') { el.blur(); return; }   // nhả ô gõ để dùng lại phím tắt
            // Danh sách / bảng / trả lời ngắn: Enter sang ô kế (Shift+Enter vẫn xuống dòng trong ô)
            if (e.key === 'Enter' && !e.shiftKey && (format.kind === 'list' || format.kind === 'table' || format.kind === 'short')) {
                e.preventDefault();
                if (inputs[k + 1]) inputs[k + 1].focus();
                else finishEssay(idx);
            }
        });
    });
}

function finishEssay(idx) {
    if (!state.quizOptions.showAnswerImmediately) {
        if (idx < state.questions.length - 1) showNextQuestion();
        return;
    }
    const q = state.questions[idx];
    const ans = state.userAnswers[idx];
    // Chưa gõ gì mà vẫn muốn xem đáp án -> tính là bỏ trống, 0 điểm
    state.userAnswers[idx] = ans
        ? withAutoGrade(q, { ...ans, done: true })
        : { text: '', done: true, ...(rubricOf(q).items.length ? { ticks: [] } : { ticks: null, self: 0 }) };
    clearTimeout(saveTimer);
    saveQuizState();
    showQuestion();   // vẽ lại cùng câu -> hiện đáp án mẫu + barem (máy đã tick sẵn)
    syncQuizNavPanel();
    document.querySelector('#quizSection .essay-reveal')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Tick ý / ½ / tự chấm / xác nhận — một listener ủy quyền cho cả màn làm bài lẫn màn kết quả.
// Người làm đụng vào barem = đã xem lại -> bỏ nhãn "máy chấm sơ bộ".
let gradingWired = false;
function wireGrading() {
    if (gradingWired) return;
    gradingWired = true;
    document.addEventListener('click', (e) => {
        const box = e.target.closest('[data-essay-grade]');
        const btn = box && e.target.closest('[data-kp],[data-kp-half],[data-self],[data-kp-none],[data-grade-ok]');
        if (!btn) return;
        const idx = Number(box.getAttribute('data-essay-grade'));
        const q = state.questions[idx];
        const ans = state.userAnswers[idx];
        if (!q || !ans) return;
        const next = { ...ans, auto: false };
        const ticks = Array.isArray(ans.ticks) ? ans.ticks : [];
        const partials = Array.isArray(ans.partials) ? ans.partials : [];
        const sorted = (arr) => arr.slice().sort((a, b) => a - b);
        if (btn.hasAttribute('data-kp')) {
            const k = Number(btn.getAttribute('data-kp'));
            next.ticks = ticks.includes(k) ? ticks.filter(x => x !== k) : sorted([...ticks, k]);
            next.partials = partials.filter(x => x !== k);
        } else if (btn.hasAttribute('data-kp-half')) {
            const k = Number(btn.getAttribute('data-kp-half'));
            next.partials = partials.includes(k) ? partials.filter(x => x !== k) : sorted([...partials, k]);
            next.ticks = ticks.filter(x => x !== k);
        } else if (btn.hasAttribute('data-kp-none')) {
            next.ticks = [];
            next.partials = [];
        } else if (btn.hasAttribute('data-self')) {
            next.self = Number(btn.getAttribute('data-self'));
        } else {
            next.ticks = ticks;   // "Đã xem lại": giữ nguyên các tick của máy
        }
        state.userAnswers[idx] = next;
        saveQuizState();
        if (box.closest('#resultsSection')) { refreshResults(); return; }
        box.outerHTML = gradeHtml(q, idx, next);
        renderMath(document.querySelector(`#quizSection [data-essay-grade="${idx}"]`));
        syncQuizNavPanel();
        updateMobileNav();
    });
}
