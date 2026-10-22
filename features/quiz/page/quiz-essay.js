// File: features/quiz/page/quiz-essay.js
// Giao diện CÂU TỰ LUẬN ở trang làm bài: ô bài làm, đáp án mẫu, chấm theo barem (máy tick sẵn
// theo từ khóa, người làm xem lại), ca mở dần (caseReveal + khóa câu trước) và khung chấm lại ở
// màn kết quả. Lõi chấm điểm + dò từ khóa (thuần, không DOM) nằm ở ../quiz-essay-core.js.
//
// Chế độ dùng lại công tắc "Xem đáp án ngay" sẵn có (state.quizOptions.showAnswerImmediately):
//   bật  -> mỗi câu có nút "Xong, xem đáp án": chốt bài, máy chấm sơ bộ, hiện đáp án + barem ngay tại câu
//   tắt  -> gõ tự do; nộp bài thì máy chấm sơ bộ, đáp án + barem mở ở màn kết quả (điểm cập nhật tức thì)

import { showToast } from '../../../core/utils.js';
import { SR, toggleDictation } from './quiz-dictation.js';
import { scrollBehaviorFor, sfx } from './quiz-page-prefs.js';
import { state, saveQuizState } from '../quiz-state.js';
import { parseMarkdown, renderMath } from '../quiz-helpers.js';
import {
    rubricOf, essayPoints, essayMaxPoints, essayCredit, questionWeight, isEssayGraded, countWords,
    isLockedByReveal, autoMatch, withAutoGrade, missingCritical, modelCoverage, formatOf, answerDocs, partsText,
    sheetOf, unitScore, splitModel, splitChot, studyLayers, pairOverlap
} from '../quiz-essay-core.js';
import { syncQuizNavPanel } from '../quiz-ui.js';
import { reasoningBodyHtml } from './quiz-reasoning.js';
import { hasAnnots, applyAnnotationsAll } from './quiz-annotations.js';
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
    // Ô tự đặt (formatOf slots): gợi ý trong ô · cỡ 1 dòng / đoạn / dài · đơn vị đứng sau ô
    const ROWS = { line: 1, para: 3, long: 6 };
    const box = (d, placeholder, s = {}) => {
        const ta = `<textarea class="essay-part is-${s.size || 'line'}" data-part="${d}" data-size="${s.size || 'line'}" rows="${ROWS[s.size] || 1}" spellcheck="false" ${ro}
        placeholder="${escHtml(s.hint || placeholder)}">${escHtml(parts[d] || '')}</textarea>`;
        return s.unit ? `<span class="essay-part-wrap">${ta}<span class="essay-unit">${escHtml(s.unit)}</span></span>` : ta;
    };
    if (format.kind === 'list') {
        return `<ol class="essay-list">${format.slots.map((s, d) =>
            `<li>${s.label ? `<span class="essay-field-label">${escHtml(s.label)}</span>` : ''}${box(d, format.placeholder || `Ý ${d + 1}`, s)}</li>`).join('')}</ol>`;
    }
    if (format.kind === 'fields') {
        return `<div class="essay-fields">${format.slots.map((s, d) =>
            `<label class="essay-field">${s.label ? `<span class="essay-field-label">${escHtml(s.label)}</span>` : ''}${box(d, format.placeholder || '…', s)}</label>`).join('')}</div>`;
    }
    return tableHtml(format, (d) => box(d, ''));
}

// Bài làm dạng đọc theo đúng kiểu ô; withMarks = tô chữ máy nhận ra
export function answerReadHtml(q, ans, withMarks) {
    const format = formatOf(q);
    const { docs, marks } = withMarks ? answerMarks(q, ans) : { docs: answerDocs(q, ans), marks: [] };
    const unit = (d) => (format.slots?.[d]?.unit && String(docs[d] || '').trim() ? ` <span class="essay-unit">${escHtml(format.slots[d].unit)}</span>` : '');
    const cell = (d) => (String(docs[d] || '').trim() ? docHtml(docs[d], marks[d]) + unit(d) : '<span class="essay-empty-cell">—</span>');
    if (format.kind === 'list') return `<ol class="essay-read-list">${docs.map((_, d) => `<li>${format.labels[d] ? `<b>${escHtml(format.labels[d])}:</b> ` : ''}${cell(d)}</li>`).join('')}</ol>`;
    if (format.kind === 'fields') {
        return `<dl class="essay-read-fields">${format.labels.map((l, d) => `<dt>${escHtml(l || `Ô ${d + 1}`)}</dt><dd>${cell(d)}</dd>`).join('')}</dl>`;
    }
    if (format.kind === 'table') return tableHtml(format, cell);
    return `<div class="essay-read-text">${docHtml(docs[0], marks[0])}</div>`;
}

/* ------------------------------------------------------------------
   PHIẾU CHẤM bản 2 (2026-10-22) — thay lối xếp chồng "bài làm → tư duy → đáp án mẫu → barem → ghi nhớ →
   mở rộng" (một nội dung lặp 2–3 lần, phải cuộn qua lại mới so được bài mình với barem). Bố cục mới:
     ① dải điểm: số điểm + vạch chia theo ý (đạt / ½ / thiếu) + máy chấm sơ bộ
     ② dải Chốt: explanation + dòng "Chốt" của ghi nhớ (splitChot)
     ③ đối chiếu TỪNG Ô: [bạn viết + đáp án tham khảo của đúng ô đó, bật/tắt được] | các ý barem dò trong ô đó
        — ý thiếu hiện "vì sao" (why)
     ④ màn kết quả: thẻ tab Tư duy · Ghi nhớ · Mở rộng — mỗi lớp kiến thức một chỗ, nhớ tab vừa chọn
   Bộ đã nạp tự tách bằng sheetOf / splitModel / studyLayers (quiz-essay-core.js), không sửa dữ liệu.
   ------------------------------------------------------------------ */
function markOf(ans, i) {
    if (!ans) return 0;
    if (Array.isArray(ans.ticks) && ans.ticks.includes(i)) return 'full';
    if (Array.isArray(ans.partials) && ans.partials.includes(i)) return 'half';
    return 0;
}

// Đã có kết luận chấm (tick của người làm / máy, hoặc bỏ trống = 0) -> tô hàng theo điểm
const settled = (ans) => !hasText(ans) || Array.isArray(ans.ticks);

function itemRowHtml(it, i, ans, m, readonly) {
    const mark = markOf(ans, i);
    const cls = ['essay-kp', mark === 'full' && 'is-on', mark === 'half' && 'is-half', it.penalty && 'is-penalty',
        !mark && m && m.level === 'near' && !it.penalty && 'is-near', !mark && !it.penalty && settled(ans) && 'is-miss'].filter(Boolean).join(' ');
    const words = m ? escHtml(m.words.slice(0, 3).join(', ')) : '';
    let tags = it.critical ? '<span class="essay-kp-tag is-crit">Bắt buộc</span>' : '';
    if (m && m.level && !it.penalty) {
        tags += m.level === 'match'
            ? `<span class="essay-kp-tag is-auto" title="Máy nhận ra trong bài của bạn"><i class="fas fa-wand-magic-sparkles"></i> ${words}</span>`
            : `<span class="essay-kp-tag is-near" title="Có vài chữ trùng — tự xem có đúng ý không">gần khớp: ${words}</span>`;
    }
    if (m && m.level && it.penalty) tags += `<span class="essay-kp-tag is-bad">bài có nhắc “${words}” — tự kiểm tra</span>`;
    // Vì sao + viết mẫu: luôn vẽ; CSS giấu ở ý đã đạt trừ khi bật "Xem đáp án đầy đủ" (.er-all) — checklist thay đáp án mẫu
    const why = (it.why ? `<span class="essay-kp-why"><i class="fas fa-circle-info" aria-hidden="true"></i><span>${parseMarkdown(it.why)}</span></span>` : '')
        + (it.example ? `<span class="essay-kp-ex"><i class="fas fa-comment-dots" aria-hidden="true"></i><span><b>Viết mẫu:</b> ${parseMarkdown(it.example)}</span></span>` : '');
    const pts = mark === 'half' ? `${fmt(it.partial)}/${fmt(it.points)}đ` : `${fmt(it.points)}đ`;
    const inner = `<span class="essay-kp-box" aria-hidden="true">${it.penalty ? '<i class="fas fa-minus"></i>' : mark === 'half' ? '½' : '<i class="fas fa-check"></i>'}</span>
        <span class="essay-kp-body"><span class="essay-kp-text">${parseMarkdown(it.text)}</span>${tags ? `<span class="essay-kp-tags">${tags}</span>` : ''}${why}</span>
        <span class="essay-kp-pts">${pts}</span>`;
    if (readonly) return `<li><div class="${cls}">${inner}</div></li>`;
    const half = it.partial
        ? `<button type="button" class="essay-kp-half${mark === 'half' ? ' is-on' : ''}" data-kp-half="${i}" aria-pressed="${mark === 'half'}" title="Nêu chưa đủ ý: ${fmt(it.partial)}đ">½</button>`
        : '';
    return `<li class="essay-kp-row"><button type="button" class="${cls}" data-kp="${i}" aria-pressed="${mark === 'full'}">${inner}</button>${half}</li>`;
}

// Một ý lẻ, hoặc cả nhóm "nêu k trong n" (khung có trần điểm)
function unitHtml(q, sheet, u, ans, matches, readonly) {
    const row = (k) => itemRowHtml(sheet.items[k], k, ans, matches && matches[k], readonly);
    if (u.group < 0) return row(u.idxs[0]);
    const g = sheet.groups[u.group];
    const { got } = unitScore(q, u, ans);
    const sum = u.idxs.reduce((a, k) => a + sheet.items[k].points, 0);
    return `<li class="essay-kp-group">
        <div class="essay-kp-group-head"><span>${escHtml(g.label || 'Nhóm ý')}</span><b>${fmt(got)}/${fmt(g.max)}đ${g.max < sum ? ' <em>(tối đa)</em>' : ''}</b></div>
        <ul class="essay-kps">${u.idxs.map(row).join('')}</ul>
    </li>`;
}

// Tên ô của một hàng đối chiếu
function fieldName(format, f) {
    if (format.kind === 'table') return format.rowLabels[f - 1] || `Hàng ${f}`;
    return format.slots[f - 1]?.label || (format.kind === 'list' ? `Ý ${f}` : `Ô ${f}`);
}

// Phần bài làm của một ô (bảng: cả hàng, mỗi cột một dòng), chữ máy nhận ra được tô
function fieldMineHtml(format, f, docs, marks) {
    const cell = (d) => (String(docs[d] || '').trim()
        ? docHtml(docs[d], marks[d]) + (format.slots?.[d]?.unit ? ` <span class="essay-unit">${escHtml(format.slots[d].unit)}</span>` : '')
        : '<span class="essay-empty-cell">— bỏ trống</span>');
    if (format.kind !== 'table') return `<div class="er-text is-pre">${cell(f - 1)}</div>`;
    const cols = format.columns.length;
    const ds = format.columns.map((_, j) => (f - 1) * cols + j);
    if (!ds.some(d => String(docs[d] || '').trim())) return '<span class="essay-empty-cell">— bỏ trống</span>';
    return `<dl class="er-cells">${format.columns.map((c, j) => `<dt>${escHtml(c)}</dt><dd>${cell(ds[j])}</dd>`).join('')}</dl>`;
}

// Đáp án mẫu (markdown). scope = vùng tô/ghi chú cá nhân ở màn làm bài ('' = không cho tô, màn kết quả)
function modelBodyHtml(md, scope = '') {
    return `<div class="essay-model-body"${scope ? ` data-annot="${scope}"` : ''}>${parseMarkdown(md)}</div>`;
}

// Đáp án mẫu có cần hiện riêng không: barem tách từ chính gạch đầu dòng của nó thì danh sách ý ĐÃ là đáp án
function modelExtra(q) {
    const model = String(q.modelAnswer || '').trim();
    if (!model) return '';
    const kps = rubricOf(q).items;
    const explicit = Array.isArray(q.keyPoints) && q.keyPoints.length > 0;
    if (!explicit && kps.length && model.split('\n').filter(l => l.trim()).length <= kps.length) return '';
    return model;
}

// Hai mức xem phiếu (một nút trên dải điểm, nhớ ở quiz_essay_full — mặc định "ý thiếu"):
//   ý thiếu  -> "vì sao" + "viết mẫu" chỉ hiện ở ý chưa đạt; đáp án tham khảo (bộ cũ có đáp án mẫu viết liền) gập lại
//   đầy đủ   -> hiện ở MỌI ý (.er-all) + mở đáp án tham khảo — checklist kỹ đọc như một bài đáp án hoàn chỉnh
// Đáp án tham khảo (nếu có) đặt dưới cặp "Bạn viết | Barem" của đúng ô đó; vẫn gập/mở riêng từng ô được.
const FULL_KEY = 'quiz_essay_full';
const fullOn = () => { try { return localStorage.getItem(FULL_KEY) === '1'; } catch (e) { return false; } };
const fullBtnInner = (on) => `<i class="fas ${on ? 'fa-eye-slash' : 'fa-eye'}" aria-hidden="true"></i><span>${on ? 'Chỉ hiện ý thiếu' : 'Xem đáp án đầy đủ'}</span>`;
// note = phụ đề sau nhãn: "(cả bài)" hoặc tên mục của đáp án mẫu khi khác tên ô
function refHtml(md, scope, note = '', whole = false) {
    return `<details class="er-ref${whole ? ' is-whole' : ''}"${fullOn() ? ' open' : ''}>
        <summary><i class="fas fa-book-open" aria-hidden="true"></i> Đáp án tham khảo${note ? `<span class="er-ref-sub">· ${escHtml(note)}</span>` : ''}</summary>
        ${modelBodyHtml(md, scope)}
    </details>`;
}
function toggleFull(btn) {
    const on = btn.getAttribute('aria-pressed') !== 'true';
    try { localStorage.setItem(FULL_KEY, on ? '1' : '0'); } catch (e) { }
    document.querySelectorAll('.er').forEach(el => el.classList.toggle('er-all', on));
    document.querySelectorAll('.er-ref').forEach(d => { d.open = on; });
    document.querySelectorAll('[data-er-full]').forEach(b => { b.setAttribute('aria-pressed', String(on)); b.innerHTML = fullBtnInner(on); });
    sfx(on ? 'toggleOn' : 'toggleOff');
}

function scoreHtml(q, idx, ans, sheet, hasDetail) {
    const max = essayMaxPoints(q);
    // Điểm câu trong bài — chỉ ghi khi khác thang barem (OSCE thường barem = max_score, ghi nữa là lặp)
    const w = Number(q.maxScore) > 0 && Math.abs(questionWeight(q) - (sheet.items.length ? max : 1)) > 1e-9 ? questionWeight(q) : 0;
    const weightTxt = (credit) => (w ? ` · <span class="er-weight">câu ${fmt(credit * w)}/${fmt(w)}đ</span>` : '');
    const has = hasText(ans);
    const refBtn = hasDetail ? `<button type="button" class="er-full-btn" data-er-full aria-pressed="${fullOn()}">${fullBtnInner(fullOn())}</button>` : '';
    if (!sheet.items.length) {
        const graded = has && typeof ans.self === 'number';
        const c = has ? modelCoverage(q, ans.text) : { total: 0 };
        return `<div class="er-score">
            <div class="er-score-top">
                <b class="er-pts${graded ? '' : ' is-pending'}">${graded ? `${fmt(ans.self)}<small>/1</small>` : has ? 'Chưa chấm' : `0<small>/1</small>`}</b>
                <span class="er-score-sub">${has ? 'Tự chấm cả câu (câu không có barem ý)' : 'Bỏ trống'}${graded ? weightTxt(ans.self) : ''}</span>
            </div>
            ${has && c.total ? `<p class="er-hint">Bài bạn nhắc ${c.hit}/${c.total} thuật ngữ có trong đáp án mẫu (chỉ để tham khảo).</p>` : ''}
            ${has ? `<div class="essay-self" role="group" aria-label="Tự chấm cả câu">${[[0, 'Chưa đạt'], [0.5, 'Một phần'], [1, 'Đạt']].map(([v, label]) =>
                `<button type="button" class="essay-self-btn${ans.self === v ? ' is-on' : ''}" data-self="${v}" aria-pressed="${ans.self === v}">${label}</button>`).join('')}</div>` : ''}
        </div>`;
    }
    const graded = has && Array.isArray(ans.ticks);
    const got = has ? essayPoints(q, ans) : 0;
    // Vạch chia theo ý, đúng thứ tự hàng đối chiếu; mỗi đoạn dài theo điểm của ý
    const segs = sheet.rows.flatMap(r => r.units).map(u => {
        const s = unitScore(q, u, ans);
        const cls = !graded && has ? '' : s.got >= s.max - 1e-9 ? 'is-full' : s.got > 0 ? 'is-part' : '';
        return `<span class="er-seg ${cls}" style="flex:${s.max} 1 0"><i style="width:${Math.round(100 * Math.min(1, s.got / s.max))}%"></i></span>`;
    }).join('');
    const pos = sheet.items.map((it, i) => (it.penalty ? -1 : i)).filter(i => i >= 0);
    const full = pos.filter(i => markOf(ans, i) === 'full').length;
    const half = pos.filter(i => markOf(ans, i) === 'half').length;
    const missing = graded ? missingCritical(q, ans) : [];
    const status = !has ? '<span class="er-chip">Bỏ trống</span>'
        : ans.auto ? '<span class="er-chip is-auto"><i class="fas fa-wand-magic-sparkles"></i> Máy chấm sơ bộ</span>'
            : graded ? '<span class="er-chip is-ok"><i class="fas fa-check"></i> Đã chấm</span>' : '<span class="er-chip is-auto">Chưa chấm</span>';
    return `<div class="er-score">
        <div class="er-score-top">
            <b class="er-pts${graded && !ans.auto ? '' : has ? ' is-pending' : ''}">${fmt(got)}<small>/${fmt(max)}đ</small></b>
            <span class="er-score-sub">${graded || !has ? `Đạt <b>${full}</b>${half ? ` · ½ <b>${half}</b>` : ''} · thiếu <b>${pos.length - full - half}</b> / ${pos.length} ý` : `${pos.length} ý chấm`}${graded || !has ? weightTxt(essayCredit(q, ans)) : ''}</span>
            ${status}
        </div>
        <div class="er-bar" aria-hidden="true">${segs}</div>
        ${missing.length ? '<p class="essay-crit-note"><i class="fas fa-circle-exclamation"></i> Thiếu ý bắt buộc → cả câu 0 điểm.</p>' : ''}
        ${!has ? '<p class="er-hint">Bạn bỏ trống câu này — barem dưới cho biết cần nêu những gì.</p>'
            : ans.auto ? `<div class="essay-auto-note">
                <span>Máy đã tick các ý có từ khóa khớp (chữ tô xanh trong bài). Máy không hiểu phủ định hay cách nói khác — bấm vào ý để sửa.</span>
                <button type="button" class="essay-ok-btn" data-grade-ok><i class="fas fa-check"></i> Đã xem lại</button>
            </div>`
                : `<p class="er-hint">Bấm vào ý để tick / bỏ tick (diễn đạt khác mà cùng nghĩa vẫn tính) · ½ = nêu chưa đủ.</p>`}
        ${has && !graded || refBtn ? `<div class="er-score-act">${has && !graded ? '<button type="button" class="essay-none" data-kp-none>Không nêu được ý nào</button>' : ''}${refBtn}</div>` : ''}
    </div>`;
}

function chotHtml(lines) {
    if (!lines.length) return '';
    return `<div class="er-chot"><span class="er-chot-tag"><i class="fas fa-thumbtack"></i> Chốt</span>
        <div class="er-chot-body">${lines.map(l => `<div class="er-chot-line">${parseMarkdown(l)}</div>`).join('')}</div></div>`;
}

// Khối đối chiếu (dải điểm + Chốt + từng ô). ctx.inQuiz: đang làm bài -> Chốt chỉ lấy explanation (ghi nhớ đã có
// thẻ riêng ngay dưới) và đáp án tham khảo mở cho tô/ghi chú cá nhân (vùng model-<ô>, hoặc 'model' liền khối).
export function sheetHtml(q, idx, ans, ctx = {}) {
    const sheet = sheetOf(q);
    const readonly = !hasText(ans);
    const matches = readonly ? null : autoMatch(q, ans);
    const { docs, marks } = readonly ? { docs: [], marks: [] } : answerMarks(q, ans);
    const model = modelExtra(q);
    const ref = sheet.items.length ? model : '';            // không barem: đáp án mẫu nằm ở cột phải rồi
    // Tách theo ô; câu đã có ghi chú trên đáp án mẫu liền khối (bản cũ) thì giữ liền khối cho khỏi lệch
    const parts = ref && sheet.split && !(ctx.inQuiz && hasAnnots(q, 'model')) ? splitModel(q, sheet.format.parts) : null;
    const scope = (k) => (ctx.inQuiz ? (k ? `model-${k}` : 'model') : '');
    const chot = ctx.inQuiz ? [String(q.explanation || '').trim()].filter(Boolean) : splitChot(q).chot;
    const rows = sheet.rows.map(row => {
        const sc = row.units.reduce((a, u) => { const s = unitScore(q, u, ans); return { got: a.got + s.got, max: a.max + s.max }; }, { got: 0, max: 0 });
        const tone = !row.units.length || !settled(ans) ? '' : sc.got >= sc.max - 1e-9 ? ' is-full' : sc.got > 0 ? ' is-part' : ' is-zero';
        const mine = sheet.split
            ? (row.field ? fieldMineHtml(sheet.format, row.field, docs, marks) : '')
            : (readonly ? '<span class="essay-empty-cell">— bỏ trống</span>' : `<div class="er-text">${answerReadHtml(q, ans, true)}</div>`);
        const lb = row.field ? fieldName(sheet.format, row.field) : 'Ý chấm trên cả bài';
        const part = parts && row.field ? parts[row.field - 1] : null;
        // Tên mục của đáp án mẫu trùng tên ô thì thôi nhắc lại (đã có ở đầu hàng)
        const rowRef = !sheet.split ? (ref ? refHtml(ref, scope(0)) : '')
            : part ? refHtml(part.body, scope(row.field), pairOverlap(part.title, lb) >= 0.5 ? '' : part.title) : '';
        const right = row.units.length
            ? `<ul class="essay-kps">${row.units.map(u => unitHtml(q, sheet, u, ans, matches, readonly)).join('')}</ul>`
            : !sheet.items.length && model ? modelBodyHtml(model, scope(0))
                : '<p class="er-hint">Ô này không có ý chấm riêng.</p>';
        const head = sheet.split
            ? `<div class="er-row-head"><span class="er-row-lb">${row.field && !/^\s*[a-z0-9]{1,2}[.)]\s/i.test(lb) ? `<span class="er-row-no">${row.field}</span>` : ''}${escHtml(lb)}</span>${row.units.length ? `<b class="er-row-pts">${fmt(sc.got)}/${fmt(sc.max)}đ</b>` : ''}</div>` : '';
        return `<section class="er-row${tone}${mine ? '' : ' is-solo'}">
            ${head}
            <div class="er-grid">
                ${mine ? `<div class="er-mine"><span class="er-cap"><i class="fas fa-pen"></i> Bạn viết</span>${mine}</div>` : ''}
                <div class="er-want"><span class="er-cap"><i class="fas fa-list-check"></i> ${sheet.items.length ? 'Barem cần có' : 'Đáp án mẫu'}</span>${right}</div>
                ${rowRef}
            </div>
        </section>`;
    }).join('');
    const pens = sheet.pens.length
        ? `<div class="essay-pen"><div class="essay-pen-head"><i class="fas fa-triangle-exclamation"></i> Lỗi trừ điểm${readonly ? '' : ' — tick nếu bài bạn mắc'}</div>
            <ul class="essay-kps">${sheet.pens.map(i => itemRowHtml(sheet.items[i], i, ans, matches && matches[i], readonly)).join('')}</ul></div>` : '';
    // Chia theo ô mà đáp án mẫu không tách được theo ô -> một khối "cả bài" dưới các hàng (vẫn chung công tắc)
    const whole = ref && sheet.split && !parts ? refHtml(ref, scope(0), 'cả bài', true) : '';
    const hasDetail = !!ref || sheet.items.some(it => it.why || it.example);
    return `<div class="er${sheet.split ? ' is-split' : ''}${fullOn() ? ' er-all' : ''}" data-essay-grade="${idx}">
        ${scoreHtml(q, idx, ans, sheet, hasDetail)}
        ${chotHtml(chot)}
        <div class="er-rows">${rows}</div>
        ${whole}
        ${pens}
    </div>`;
}

/* ---- Thẻ tab kiến thức (màn kết quả): Tư duy · Ghi nhớ · Mở rộng (đáp án tham khảo đã nằm trong phiếu, theo ô) ---- */
const TAB_KEY = 'quiz_essay_tab';
const tabPick = new Map();   // câu -> tab đang mở, giữ qua lần vẽ lại sau khi tick (refreshResults)
const readTab = () => { try { return localStorage.getItem(TAB_KEY) || ''; } catch (e) { return ''; } };

function memoCardHtml(c) {
    return `<div class="er-memo${c.trap ? ' is-trap' : ''}">
        ${c.label ? `<span class="er-memo-lb">${c.icon ? `<span aria-hidden="true">${escHtml(c.icon)}</span> ` : ''}${escHtml(c.label)}</span>` : ''}
        <div class="er-memo-body">${parseMarkdown(c.body)}</div></div>`;
}
function secHtml(s) {
    return `<section class="er-sec">${s.title ? `<h4 class="er-sec-h">${s.icon ? `<span aria-hidden="true">${escHtml(s.icon)}</span> ` : ''}${escHtml(s.title)}</h4>` : ''}
        <div class="er-sec-body">${parseMarkdown(s.body)}</div></section>`;
}

function tabsHtml(q, idx) {
    const L = studyLayers(q);
    const reason = reasoningBodyHtml(q, false);
    const memo = L.memo.map(memoCardHtml).join('')
        + L.traps.map(s => memoCardHtml({ icon: s.icon, label: s.title, body: s.body, trap: true })).join('');
    const tabs = [
        reason && ['reason', 'fa-brain', 'Tư duy', `<div class="qr">${reason}</div>`],
        memo && ['note', 'fa-lightbulb', 'Ghi nhớ', `<div class="er-memos">${memo}</div>`],
        L.more.length && ['more', 'fa-layer-group', 'Mở rộng', L.more.map(secHtml).join('')],
    ].filter(Boolean);
    if (!tabs.length) return '';
    let cur = tabPick.get(idx) || readTab();
    if (!tabs.some(t => t[0] === cur)) cur = (tabs.find(t => t[0] === 'note') || tabs[0])[0];
    return `<div class="er-tabs" data-er-tabs="${idx}">
        <div class="er-tablist" role="tablist" aria-label="Kiến thức của câu">${tabs.map(([k, ic, lb]) =>
            `<button type="button" role="tab" class="er-tab" data-er-tab="${k}" aria-selected="${k === cur}"><i class="fas ${ic}" aria-hidden="true"></i> ${lb}</button>`).join('')}</div>
        ${tabs.map(([k, , , html]) => `<div class="er-panel is-${k}" role="tabpanel" data-er-panel="${k}"${k === cur ? '' : ' hidden'}>${html}</div>`).join('')}
    </div>`;
}

function switchTab(btn) {
    const wrap = btn.closest('[data-er-tabs]');
    const k = btn.getAttribute('data-er-tab');
    wrap.querySelectorAll('[data-er-tab]').forEach(b => b.setAttribute('aria-selected', String(b === btn)));
    wrap.querySelectorAll('[data-er-panel]').forEach(p => { p.hidden = p.getAttribute('data-er-panel') !== k; });
    tabPick.set(Number(wrap.getAttribute('data-er-tabs')), k);
    try { localStorage.setItem(TAB_KEY, k); } catch (e) { }
    sfx('ui');
}

// Màn kết quả: phiếu chấm + thẻ tab kiến thức
export function essayReviewHtml(q, idx, ans) {
    wireGrading();
    return `<div class="essay-review">
        ${sheetHtml(q, idx, ans)}
        ${tabsHtml(q, idx)}
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
    // Đã mở đáp án: tờ bài làm nhường chỗ cho phiếu chấm (bài làm nằm TRONG phiếu, cạnh barem từng ô, chữ máy
    // nhận ra được tô — tô trước khi mở = lộ đáp án nên không làm), đáp án tham khảo ngay dưới bài của từng ô.
    if (revealed) {
        return `
    <div id="essay-area" class="essay-area is-revealed">
        ${locked ? lockNoteHtml() : ''}
        ${sheetHtml(q, idx, ans, { inQuiz: true })}
    </div>`;
    }
    const sheetBody = inputsHtml(q, ans, done);
    const kind = formatOf(q).kind;
    // Nói để viết (page/quiz-dictation.js) — chỉ khi còn làm được và trình duyệt có nhận giọng nói
    const mic = !done && SR ? '<button type="button" id="essay-mic" class="essay-mic" aria-pressed="false" title="Nói để viết vào bài làm (tiếng Việt). Nói “xuống dòng”, “gạch đầu dòng”, “dấu chấm”, “dấu phẩy” để chấm câu"><i class="fas fa-microphone"></i><span>Nói để viết</span></button>' : '';
    return `
    <div id="essay-area" class="essay-area">
        <div class="essay-sheet is-${kind}${done ? ' is-done' : ''}">
            <div class="essay-sheet-head">
                <label ${kind === 'text' || kind === 'short' ? 'for="essay-input" ' : ''}class="essay-sheet-lb"><i class="fas fa-pen"></i> Bài làm của bạn</label>
                <span class="essay-head-r">${mic}<span id="essay-wc" class="essay-wc">${countWords(text)} từ</span></span>
            </div>
            ${mic ? '<div id="essay-listen" class="essay-listen" hidden aria-live="polite"></div>' : ''}
            ${sheetBody}
            ${locked ? lockNoteHtml() : ''}
        </div>
        ${done ? '' : `
        <div class="essay-actions">
            <span class="essay-kbd">${immediate ? '' : 'Đáp án mở sau khi nộp bài · '}<kbd class="kbd-key">Ctrl</kbd>+<kbd class="kbd-key">Enter</kbd>${immediate ? '' : ' câu tiếp'}</span>
            ${immediate ? '<button type="button" id="essay-done-btn" class="essay-done-btn"><i class="fas fa-check"></i> Xong, xem đáp án</button>' : ''}
        </div>`}
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
    // Nói để viết: chữ vào ô chạm gần nhất (chưa chạm ô nào: ô đầu), chèn đúng chỗ con trỏ
    const mic = document.getElementById('essay-mic'), listen = document.getElementById('essay-listen');
    if (mic && listen) {
        let target = inputs[0];
        inputs.forEach(el => el.addEventListener('focus', () => { target = el; }));
        const HINT = 'Đang nghe… nói “xuống dòng”, “gạch đầu dòng”, “dấu chấm”, “dấu phẩy” để chấm câu';
        const lab = mic.querySelector('span');
        const ui = {
            on() { mic.classList.add('is-live'); mic.setAttribute('aria-pressed', 'true'); lab.textContent = 'Dừng nghe'; listen.hidden = false; listen.textContent = HINT; },
            off() { mic.classList.remove('is-live'); mic.setAttribute('aria-pressed', 'false'); lab.textContent = 'Nói để viết'; listen.hidden = true; },
            interim(t) { listen.textContent = t ? `… ${t}` : HINT; },
        };
        mic.addEventListener('click', () => toggleDictation(() => target, ui));
    }
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
            // Ô 1 dòng / bảng / trả lời ngắn: Enter sang ô kế (Shift+Enter vẫn xuống dòng trong ô); ô đoạn/dài thì Enter xuống dòng
            const oneLine = el.dataset.size ? el.dataset.size === 'line' : (format.kind === 'table' || format.kind === 'short');
            if (e.key === 'Enter' && !e.shiftKey && oneLine) {
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
    sfx('pick');
    // Chưa gõ gì mà vẫn muốn xem đáp án -> tính là bỏ trống, 0 điểm
    state.userAnswers[idx] = ans
        ? withAutoGrade(q, { ...ans, done: true })
        : { text: '', done: true, ...(rubricOf(q).items.length ? { ticks: [] } : { ticks: null, self: 0 }) };
    clearTimeout(saveTimer);
    saveQuizState();
    showQuestion();   // vẽ lại cùng câu -> hiện đáp án mẫu + barem (máy đã tick sẵn)
    syncQuizNavPanel();
    document.querySelector('#quizSection .er')?.scrollIntoView({ behavior: scrollBehaviorFor(), block: 'start' });
}

// Tick ý / ½ / tự chấm / xác nhận — một listener ủy quyền cho cả màn làm bài lẫn màn kết quả.
// Người làm đụng vào barem = đã xem lại -> bỏ nhãn "máy chấm sơ bộ".
let gradingWired = false;
function wireGrading() {
    if (gradingWired) return;
    gradingWired = true;
    document.addEventListener('click', (e) => {
        const tab = e.target.closest('[data-er-tab]');
        if (tab) { switchTab(tab); return; }
        const fullBtn = e.target.closest('[data-er-full]');
        if (fullBtn) { toggleFull(fullBtn); return; }
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
        sfx(btn.hasAttribute('data-kp') ? (next.ticks.length > ticks.length ? 'toggleOn' : 'toggleOff') : 'ui');   // tick ý barem = tiếng bật/tắt, các nút chấm khác = tiếng nhẹ
        if (box.closest('#resultsSection')) { refreshResults(); return; }
        box.outerHTML = sheetHtml(q, idx, next, { inQuiz: true });
        const fresh = document.querySelector(`#quizSection [data-essay-grade="${idx}"]`);
        renderMath(fresh);
        applyAnnotationsAll(fresh);   // đáp án tham khảo nằm trong phiếu -> tô / ghi chú cá nhân vẽ lại
        syncQuizNavPanel();
        updateMobileNav();
    });
}
