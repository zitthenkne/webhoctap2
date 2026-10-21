// File: features/quiz/page/quiz-reasoning.js
// Quét dữ kiện & hướng tư duy (2026-10-21) — trường `reasoning` của câu hỏi (skill /up-cau-hoi ghi):
//   { cues:  [{ text, kind?: 'key'|'neg'|'trap', hint?, in?: 'case'|'q'|'A'…'H' }],   // text = chép NGUYÊN VĂN từ đề
//     steps: [{ from: [1, 2, 'b1'], text, out?: 'BD', kind?: 'then'|'join'|'out' }],   // số = dữ kiện, 'b1' = kết luận bước 1
//     goal }
//     (chữ cái ở cues[].in / steps[].out là thứ tự GỐC — xáo đáp án thì applyOptionOrder đổi theo; câu tự luận dùng kind:'out')
// Bấm ra đáp án: tô từng dữ kiện ngay trong đề (khung ca / thân câu / phương án, kèm số) + thẻ riêng
// dữ kiện ➜ chuỗi suy luận (suy ra · tổng hợp · loại trừ) ➜ chốt. Bấm dữ kiện ở thẻ = nhảy tới chỗ đó trong đề và ngược lại.
// Tô bằng <mark> bọc TỪNG text node (không extractContents) -> tổng số ký tự không đổi, offset ghi chú cá nhân vẫn đúng.
// Bản 2: hiệu ứng quét (mỗi câu một lần), rê / chạm để soi liên kết dữ kiện ⇄ bước, chế độ mở từng bước (phím G),
// gập thẻ, 3 công tắc trong bảng "Ngựa thì chỉnh" (quiz_reason_marks / _step / _fx).

import { getCorrectIndexes, isMultiAnswer } from '../quiz-helpers.js';
import { scrollBehaviorFor } from './quiz-page-prefs.js';

const KINDS = { key: 'bản lề', neg: 'âm tính', trap: 'mồi nhử' };
const STEP_TYPES = { then: 'Suy ra', join: 'Tổng hợp', out: 'Loại trừ' };
const L = (i) => String.fromCharCode(65 + i);
const str = (v) => (v == null ? '' : String(v).trim());
const esc = (s) => str(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');   // chỉ **đậm**, không markdown/KaTeX

const LS = { marks: 'quiz_reason_marks', step: 'quiz_reason_step', fx: 'quiz_reason_fx', fold: 'quiz_reason_folded' };
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };
export const reasonPrefs = {
    marks: () => lsGet(LS.marks) !== '0',    // tô dữ kiện trong đề — mặc định bật
    step: () => lsGet(LS.step) === '1',      // mở chuỗi suy luận từng bước — mặc định tắt
    fx: () => lsGet(LS.fx) !== '0',          // hiệu ứng quét — mặc định bật
    folded: () => lsGet(LS.fold) === '1',
};
const seen = new Set();        // câu đã chạy hiệu ứng quét trong phiên (mỗi câu một lần, vẽ lại không chạy lại)
const stepShown = new Map();   // câu -> số bước đã mở (chế độ từng bước), giữ qua các lần vẽ lại
let cur = null;                // { key, rs } câu đang hiện thẻ
let io = null, litTimer = 0, litKey = '';

// 'BD' / 'B, D' / ['B','D'] -> ['B','D']; lẫn chữ khác thì bỏ (skill phải ghi đúng khuôn)
function letters(v) {
    const s = (Array.isArray(v) ? v.join(',') : str(v)).toUpperCase().replace(/[\s,;·/]+/g, '');
    return /^[A-H]+$/.test(s) ? [...new Set(s)].sort() : [];
}

// Chuẩn hóa: bỏ mục rỗng, `from` nhận số / "1" / "b2" (kết luận bước 2, chỉ trỏ LÙI), kiểu bước tự suy
export function readReasoning(q) {
    const r = q && q.reasoning;
    if (!r || typeof r !== 'object') return null;
    const cues = (Array.isArray(r.cues) ? r.cues : [])
        .map(c => (typeof c === 'string' ? { text: c } : c))
        .filter(c => c && str(c.text))
        .map(c => ({ text: str(c.text), kind: KINDS[c.kind] ? c.kind : 'key', hint: str(c.hint), in: str(c.in) }));
    const steps = [];
    (Array.isArray(r.steps) ? r.steps : []).forEach(s => {
        if (!s || !str(s.text)) return;
        const from = (Array.isArray(s.from) ? s.from : s.from == null ? [] : [s.from]).map(x => {
            const m = /^(b?)(\d+)$/i.exec(str(x));
            if (!m) return null;
            const n = +m[2];
            if (m[1]) return n >= 1 && n <= steps.length ? { s: n } : null;
            return n >= 1 && n <= cues.length ? { c: n } : null;
        }).filter(Boolean);
        const out = letters(s.out);
        // `kind` ghi rõ thì theo đó (tự luận loại trừ chẩn đoán không có chữ cái phương án); không thì tự suy
        const type = STEP_TYPES[s.kind] ? s.kind : out.length ? 'out' : from.length > 1 ? 'join' : 'then';
        steps.push({ from, text: str(s.text), out, type });
    });
    const goal = str(r.goal);
    return cues.length || steps.length || goal ? { cues, steps, goal } : null;
}

// Cụm từ -> regex: khoảng trắng co giãn, không phân biệt hoa thường, không khớp giữa chừng một từ
export function cueRegex(text) {
    const body = str(text).split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
    if (!body) return null;
    try {
        const pre = /^[\p{L}\p{N}]/u.test(text.trim()) ? '(?<![\\p{L}\\p{N}])' : '';
        const post = /[\p{L}\p{N}]$/u.test(text.trim()) ? '(?![\\p{L}\\p{N}])' : '';
        return new RegExp(pre + body + post, 'iu');
    } catch (e) {
        return new RegExp(body, 'i');   // trình duyệt cũ chưa có lookbehind
    }
}

function refHtml(ref, rs, live) {
    const tag = live ? 'button' : 'span', btn = live ? ' type="button"' : '';
    if (ref.s) return `<${tag}${btn} class="qr-ref is-step" data-goto-step="${ref.s}" title="Kết luận bước ${ref.s}">B${ref.s}</${tag}>`;
    const c = rs.cues[ref.c - 1];
    return `<${tag}${btn} class="qr-ref is-${c.kind}" data-cue="${ref.c}" title="${esc(c.text)}">${ref.c}</${tag}>`;
}

// Phần thân (dùng chung: thẻ trong trang làm bài + khối ở màn kết quả). live = có nút bấm nhảy tới đề.
// extra = chèn ngay dưới danh sách bước (thanh "Mở bước tiếp" của chế độ từng bước).
export function reasoningBodyHtml(q, live = true, extra = '') {
    const rs = readReasoning(q);
    if (!rs) return '';
    const cueTag = live ? 'button' : 'div';
    const cues = rs.cues.map((c, i) => `
        <li><${cueTag}${live ? ' type="button"' : ''} class="qr-cue is-${c.kind}" data-cue="${i + 1}">
            <span class="qr-n">${i + 1}</span>
            <span class="qr-cue-main"><span class="qr-q">${esc(c.text)}</span><span class="qr-kind">${KINDS[c.kind]}</span></span>
            ${c.hint ? `<span class="qr-hint">${rich(c.hint)}</span>` : ''}
        </${cueTag}></li>`).join('');
    const steps = rs.steps.map((s, i) => `
        <li class="qr-step is-${s.type}" data-step="${i + 1}">
            <span class="qr-node" aria-hidden="true">B${i + 1}</span>
            <div class="qr-step-main">
                <div class="qr-from">${s.from.map(r => refHtml(r, rs, live)).join('<span class="qr-plus">+</span>')}<span class="qr-type">${STEP_TYPES[s.type]}</span></div>
                <div class="qr-to">${rich(s.text)}</div>
                ${s.out.length ? `<div class="qr-out">gạch ${s.out.map(x => `<s class="qr-opt">${x}</s>`).join('')}</div>` : ''}
            </div>
        </li>`).join('');
    const essay = !Array.isArray(q.answers || q.options) || !(q.answers || q.options).length;
    const ans = essay ? '' : (isMultiAnswer(q) ? getCorrectIndexes(q) : [q.correctAnswerIndex]).filter(i => Number.isInteger(i)).map(L).join(' · ');
    return (cues ? `<div class="qr-sec"><div class="qr-lb"><span>①</span> Dữ kiện trong đề${live ? '<em>bấm để xem trong đề</em>' : ''}</div><ol class="qr-cues">${cues}</ol></div>` : '')
        + (steps ? `<div class="qr-sec"><div class="qr-lb"><span>②</span> Chuỗi suy luận</div><ol class="qr-steps">${steps}</ol>${extra}</div>` : '')
        + (rs.goal || ans ? `<div class="qr-goal"><span class="qr-goal-k">Chốt</span><span class="qr-goal-t">${rich(rs.goal)}</span>${ans ? `<span class="qr-ans" title="Đáp án đúng">${ans}</span>` : ''}</div>` : '');
}

const STEPPER = `<div class="qr-stepper">
        <button type="button" class="qr-next" data-qr="next"><i class="fas fa-forward-step"></i> Mở bước tiếp <kbd class="kbd-key">G</kbd></button>
        <span class="qr-prog" aria-live="polite"></span>
        <button type="button" class="qr-link" data-qr="all">Hiện hết</button>
        <button type="button" class="qr-link" data-qr="reset" hidden><i class="fas fa-rotate-left"></i> Tự suy lại từ đầu</button>
    </div>`;

export function reasoningCardHtml(q) {
    const rs = readReasoning(q);
    if (!rs) return '';
    const folded = reasonPrefs.folded(), step = reasonPrefs.step() && rs.steps.length > 0;
    const count = [rs.cues.length && `${rs.cues.length} dữ kiện`, rs.steps.length && `${rs.steps.length} bước`].filter(Boolean).join(' · ');
    return `
        <div id="reason-area" class="kb-card kb-reason hidden${folded ? ' is-folded' : ''}"${step ? ' data-step-mode="1"' : ''}>
            <button type="button" class="kb-head qr-fold" aria-expanded="${!folded}" title="Gập / mở thẻ (nhớ cho các câu sau)">
                <span class="kb-ic" aria-hidden="true"><i class="fas fa-brain"></i></span>
                <span class="kb-title">Quét dữ kiện & hướng tư duy</span>
                ${count ? `<span class="qr-count">${count}</span>` : ''}
                <span class="kb-fold-txt">${folded ? 'Mở' : 'Thu gọn'}</span>
                <i class="fas fa-chevron-down kb-chev" aria-hidden="true"></i>
            </button>
            <div class="kb-body qr">${reasoningBodyHtml(q, reasonPrefs.marks(), step ? STEPPER : '')}</div>
        </div>`;
}

// Text node của một vùng, bỏ công thức / hình / widget (KaTeX có 2 bản chữ, tô vào sẽ lệch)
function textNodes(root) {
    const out = [];
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: n => (n.parentElement && n.parentElement.closest('.katex, svg, .qw, script, style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    while (w.nextNode()) out.push(w.currentNode);
    return out;
}

// Bọc [from, to) của chuỗi ghép các text node: mỗi node một <mark> riêng (vắt qua chữ đậm vẫn an toàn)
function wrapSpan(nodes, from, to, make) {
    const out = [];
    let acc = 0;
    for (const n of nodes) {
        const len = n.nodeValue.length, s = Math.max(from, acc), e = Math.min(to, acc + len);
        if (s < e) {
            let t = n;
            if (s > acc) t = t.splitText(s - acc);
            if (e < acc + len) t.splitText(e - s);
            const m = make();
            t.parentNode.insertBefore(m, t);
            m.appendChild(t);
            out.push(m);
        }
        acc += len;
    }
    return out;
}

function markCues(rs) {
    const sec = document.getElementById('quizSection');
    if (!sec || sec.querySelector('.qr-hit')) return;
    const regions = [['case', sec.querySelector('[data-annot="case"]')], ['q', sec.querySelector('[data-annot="q"]')]];
    sec.querySelectorAll('.answer-content[data-annot^="a"]').forEach(el => regions.push([L(+el.getAttribute('data-annot').slice(1)), el]));
    rs.cues.forEach((c, i) => {
        const re = cueRegex(c.text);
        if (!re) return;
        for (const [scope, el] of regions) {
            if (!el || (c.in && c.in.toLowerCase() !== scope.toLowerCase())) continue;
            const nodes = textNodes(el);
            const m = re.exec(nodes.map(n => n.nodeValue).join(''));
            if (!m || !m[0]) continue;
            const marks = wrapSpan(nodes, m.index, m.index + m[0].length, () => {
                const k = document.createElement('mark');
                k.className = `qr-hit is-${c.kind}`;
                k.setAttribute('data-cue', String(i + 1));
                if (c.hint) k.title = c.hint;
                return k;
            });
            if (marks.length) marks[marks.length - 1].setAttribute('data-n', String(i + 1));
            return;
        }
        sec.querySelectorAll(`#reason-area .qr-cue[data-cue="${i + 1}"]`).forEach(b => { b.classList.add('is-miss'); b.title = 'Không tìm thấy cụm này trong đề'; });
    });
}

function ping(els) {
    els.forEach(el => { el.classList.remove('is-ping'); void el.offsetWidth; el.classList.add('is-ping'); });
    setTimeout(() => els.forEach(el => el.classList.remove('is-ping')), 1700);
}
function bring(el, block = 'center') {
    const r = el.getBoundingClientRect();
    if (r.top < 72 || r.bottom > window.innerHeight - 72) el.scrollIntoView({ block, behavior: scrollBehaviorFor() });
}

// ---- Soi liên kết: rê (chuột) / chạm (cảm ứng) một dữ kiện hay một bước -> sáng phần liên quan, phần khác mờ đi
function linksOf(el) {
    const cues = new Set(), steps = new Set();
    if (!el) return { cues, steps };
    const step = el.closest('.qr-step');
    const n = el.getAttribute('data-cue');
    if (n && !step) {   // một dữ kiện: chính nó + các bước dùng nó
        cues.add(n);
        document.querySelectorAll(`#reason-area .qr-step .qr-ref[data-cue="${n}"]`).forEach(r => steps.add(r.closest('.qr-step').getAttribute('data-step')));
    } else if (step) {  // một bước: chính nó + dữ kiện / bước nó dựa vào
        steps.add(step.getAttribute('data-step'));
        step.querySelectorAll('.qr-ref[data-cue]').forEach(r => cues.add(r.getAttribute('data-cue')));
        step.querySelectorAll('.qr-ref[data-goto-step]').forEach(r => steps.add(r.getAttribute('data-goto-step')));
    }
    return { cues, steps };
}
function setLit({ cues, steps }) {
    const card = document.querySelector('#quizSection .quiz-card');
    const key = [...cues].join() + '|' + [...steps].join();
    if (!card || (key === litKey && card.classList.contains('qr-focus') === (key !== '|'))) return;   // rê trong cùng một mục: khỏi dựng lại
    litKey = key;
    card.querySelectorAll('.is-lit').forEach(el => el.classList.remove('is-lit'));
    card.classList.toggle('qr-focus', cues.size + steps.size > 0);
    cues.forEach(n => card.querySelectorAll(`.qr-hit[data-cue="${n}"], #reason-area .qr-cue[data-cue="${n}"]`).forEach(el => el.classList.add('is-lit')));
    steps.forEach(n => card.querySelector(`#reason-area .qr-step[data-step="${n}"]`)?.classList.add('is-lit'));
}
const NONE = { cues: new Set(), steps: new Set() };
function lightFor(links, ms = 1600) {
    clearTimeout(litTimer);
    setLit(links);
    litTimer = setTimeout(() => setLit(NONE), ms);
}

// ---- Chế độ từng bước: tự đoán bước kế rồi mới mở (G = bước tiếp, Shift+G = hiện hết)
function applySteps(area) {
    if (!area || !area.dataset.stepMode || !cur) return;
    const steps = [...area.querySelectorAll('.qr-step')];
    const n = steps.length, k = Math.min(stepShown.get(cur.key) || 0, n);
    steps.forEach((el, j) => { el.hidden = j >= k; });
    const goal = area.querySelector('.qr-goal');
    if (goal) goal.hidden = k < n;
    area.querySelector('.qr-prog').textContent = k ? `${k}/${n} bước` : `${n} bước — tự đoán trước rồi mở`;
    area.querySelector('[data-qr="next"]').hidden = k >= n;
    area.querySelector('[data-qr="all"]').hidden = k >= n;
    area.querySelector('[data-qr="reset"]').hidden = k < n;
}
function openStep(all) {
    const area = document.getElementById('reason-area');
    if (!area || !area.dataset.stepMode || !cur || area.classList.contains('hidden')) return false;
    const n = cur.rs.steps.length, k = stepShown.get(cur.key) || 0;
    if (k >= n) return false;
    area.classList.remove('is-folded');
    const to = all ? n : k + 1;
    stepShown.set(cur.key, to);
    applySteps(area);
    const fresh = [...area.querySelectorAll('.qr-step')].slice(k, to);
    const goal = to >= n && area.querySelector('.qr-goal');
    if (goal) fresh.push(goal);
    fresh.forEach(el => { el.classList.remove('is-new'); void el.offsetWidth; el.classList.add('is-new'); });
    if (!all) lightFor(linksOf(fresh[0]));   // bước vừa mở: nháy các dữ kiện nó dựa vào (cả trong đề)
    bring(fresh[fresh.length - 1], 'nearest');
    return true;
}
function resetSteps() {
    const area = document.getElementById('reason-area');
    if (!cur || !area) return;
    stepShown.set(cur.key, 0);
    applySteps(area);
    area.querySelector('[data-qr="next"]')?.focus({ preventScroll: true });
}

function toggleFold(area) {
    const folded = !area.classList.contains('is-folded');
    area.classList.toggle('is-folded', folded);
    const head = area.querySelector('.qr-fold');
    head.setAttribute('aria-expanded', String(!folded));
    head.querySelector('.kb-fold-txt').textContent = folded ? 'Mở' : 'Thu gọn';
    lsSet(LS.fold, folded ? '1' : '0');
}

let _wired = false;
function wire() {
    if (_wired) return;
    const sec = document.getElementById('quizSection');
    if (!sec) return;
    _wired = true;
    sec.addEventListener('click', (e) => {
        if (String(window.getSelection() || '').trim()) return;   // đang bôi đen để ghi chú
        const area = e.target.closest('#reason-area');
        if (area) {
            if (e.target.closest('.qr-fold')) { toggleFold(area); return; }
            const act = e.target.closest('[data-qr]');
            if (act) { const a = act.getAttribute('data-qr'); if (a === 'reset') resetSteps(); else openStep(a === 'all'); return; }
            const stepRef = e.target.closest('[data-goto-step]');
            if (stepRef) {
                const row = area.querySelector(`.qr-step[data-step="${stepRef.getAttribute('data-goto-step')}"]`);
                if (row && !row.hidden) { bring(row); ping([row]); }
                return;
            }
            const fromCard = e.target.closest('[data-cue]');
            if (fromCard) {
                const n = fromCard.getAttribute('data-cue');
                const caseBody = document.getElementById('case-body');
                if (caseBody && caseBody.classList.contains('hidden') && caseBody.querySelector(`.qr-hit[data-cue="${n}"]`)) document.getElementById('case-toggle-btn')?.click();
                const marks = [...sec.querySelectorAll(`.qr-hit[data-cue="${n}"]`)];
                if (!marks.length) return;
                bring(marks[0]);
                ping(marks);
                return;
            }
            const step = e.target.closest('.qr-step');
            if (step) lightFor(linksOf(step));   // chạm một bước: sáng các dữ kiện nó dùng
            return;
        }
        const mark = e.target.closest('.qr-hit');
        if (mark) {
            const row = sec.querySelector(`#reason-area .qr-cue[data-cue="${mark.getAttribute('data-cue')}"]`);
            if (!row) return;
            bring(row);
            ping([row]);
        }
    });
    // Chuột: rê qua dữ kiện / bước / chữ tô trong đề -> soi liên kết (cảm ứng dùng chạm ở trên)
    sec.addEventListener('pointerover', (e) => {
        if (e.pointerType !== 'mouse') return;
        const t = e.target.closest && e.target.closest('#reason-area [data-cue], #reason-area .qr-step, mark.qr-hit');
        clearTimeout(litTimer);
        setLit(t ? linksOf(t) : NONE);
    });
    sec.addEventListener('pointerleave', () => setLit(NONE));
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.altKey || e.metaKey || e.repeat || e.isComposing || (e.key || '').toLowerCase() !== 'g') return;
        const t = e.target;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
        if (openStep(e.shiftKey)) e.preventDefault();
    });
}

// ---- Hiệu ứng quét (mỗi câu một lần): vạch quét chạy dọc đề -> bút dạ tô lần lượt từng dữ kiện + số bật ra;
// thẻ chỉ chạy khi cuộn tới: dữ kiện hiện dần -> đường chỉ nối các bước kéo xuống -> con dấu Chốt.
function canFx() {
    if (!reasonPrefs.fx() || document.documentElement.classList.contains('ui-min')) return false;
    try { return !window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return true; }
}
function playIntro(sec, area, rs) {
    const card = sec.querySelector('.quiz-card');
    const marks = [...sec.querySelectorAll('mark.qr-hit')];
    if (card && marks.length) {
        const scan = [sec.querySelector('#case-body:not(.hidden)'), sec.querySelector('.question-text')].filter(Boolean);
        scan.forEach(el => el.classList.add('qr-scan'));
        marks.forEach(m => m.style.setProperty('--qr-d', (300 + (+m.dataset.cue - 1) * 120) + 'ms'));
        card.classList.add('qr-anim-text');
        setTimeout(() => { card.classList.remove('qr-anim-text'); scan.forEach(el => el.classList.remove('qr-scan')); }, 300 + rs.cues.length * 120 + 1300);
    }
    const go = () => {
        if (!area.isConnected) return;
        let t = 120;
        area.querySelectorAll('.qr-cue').forEach(el => { el.style.setProperty('--qr-d', t + 'ms'); t += 70; });
        t += 120;
        const steps = [...area.querySelectorAll('.qr-step:not([hidden])')];
        area.style.setProperty('--qr-rail-d', t + 'ms');
        area.style.setProperty('--qr-rail-t', Math.max(300, steps.length * 170) + 'ms');
        steps.forEach(el => { el.style.setProperty('--qr-d', t + 'ms'); t += 170; });
        area.querySelector('.qr-goal:not([hidden])')?.style.setProperty('--qr-d', (t + 80) + 'ms');
        area.classList.remove('qr-pre');
        area.classList.add('qr-anim');
        setTimeout(() => area.classList.remove('qr-anim'), t + 1400);
    };
    if (!('IntersectionObserver' in window)) return go();
    area.classList.add('qr-pre');   // giữ ẩn tới khi cuộn tới, khỏi lóe nội dung tĩnh rồi mới chạy
    const obs = new IntersectionObserver((ents) => { if (ents.some(x => x.isIntersecting)) { obs.disconnect(); go(); } }, { threshold: 0.12 });
    obs.observe(area);
    io = obs;
}

// Gọi ở MỌI chỗ mở đáp án (trả lời, xem lại câu đã làm, chấm nhiều đáp án, tự luận đã mở): hiện thẻ + tô dữ kiện trong đề
export function revealReasoning(q) {
    const area = document.getElementById('reason-area');
    const rs = readReasoning(q);
    if (!area || !rs) return;
    const sec = document.getElementById('quizSection');
    if (io) { io.disconnect(); io = null; }
    cur = { key: str(q.question), rs };
    area.classList.remove('hidden');
    wire();
    if (reasonPrefs.marks()) markCues(rs);
    applySteps(area);
    if (!seen.has(cur.key)) {
        seen.add(cur.key);
        if (canFx()) playIntro(sec, area, rs);
    }
}

// Ba công tắc trong bảng "Ngựa thì chỉnh" (nhóm Hướng tư duy). rerender = vẽ lại câu đang xem cho áp dụng ngay.
export function setupReasoningSettings(rerender) {
    const rows = [
        ['qs-reason-marks', LS.marks, true, true, (on) => (on ? '' : 'Đã tắt tô dữ kiện trong đề — thẻ Hướng tư duy vẫn giữ')],
        ['qs-reason-step', LS.step, false, true, (on) => (on ? 'Chuỗi suy luận mở từng bước: tự đoán trước, phím G mở bước tiếp' : '')],
        ['qs-reason-fx', LS.fx, true, false, () => ''],
    ];
    const get = (k, def) => { const v = lsGet(k); return v === null ? def : v === '1'; };
    const sync = () => rows.forEach(([id, k, def]) => document.getElementById(id)?.setAttribute('aria-checked', String(get(k, def))));
    sync();
    rows.forEach(([id, k, def, redraw, msg]) => {
        const row = document.getElementById(id);
        if (!row) return;
        const go = () => {
            const on = !get(k, def);
            lsSet(k, on ? '1' : '0');
            sync();
            if (redraw && document.body.classList.contains('quiz-active')) rerender();
            const m = msg(on);
            if (m) import('../../../core/utils.js').then(u => u.showToast(m, 'info', 2200));   // nạp lười: utils đụng window lúc nạp (test Node)
        };
        row.addEventListener('click', go);
        row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    document.getElementById('quiz-settings-fab')?.addEventListener('click', sync);
}
