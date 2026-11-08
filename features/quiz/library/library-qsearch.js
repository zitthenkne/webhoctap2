// File: features/quiz/library/library-qsearch.js
// TÌM CÂU HỎI kiểu "mở là dùng được ngay" ở thư viện (index.html#libraryContent):
//  - không dấu, nhiều từ không cần đúng thứ tự, "cụm chính xác", -loại trừ
//  - tìm SÂU: câu hỏi · đáp án đúng · phương án · giải thích · ghi chú mở rộng · ca lâm sàng · ghi chú của bạn (chip phạm vi)
//  - xếp hạng liên quan, gom theo bộ đề; thẻ hiện đáp án đúng + đoạn trích chỗ khớp
//  - bấm thẻ → xem ĐẦY ĐỦ (markdown, giải thích từng phương án, ghi chú), ←/→ lướt kết quả
//  - 1 chạm: Làm câu này / Làm N câu khớp (quiz.html?pick=) · Sửa đúng câu (editor.html?q=) · Copy Markdown
//  - phím tắt ↓ ↑ Enter E P C, tìm gần đây, URL giữ từ khoá (?q=&qm=1 — F5 / gửi link vẫn ra đúng kết quả)
// Dữ liệu: mảng phẳng từ library-search.js (ensureQuestionIndex), mỗi phần tử = slimQuestion + { id, quizTitle, i, n, myNote }.

import { S } from './library-state.js';
import { sessionUser } from '../../../core/auth-session.js';
import { showToast } from '../../../core/utils.js';

const PAGE = 40;
const quizUrl = (id, pick) => `features/quiz/quiz.html?id=${encodeURIComponent(id)}${pick !== undefined && pick !== '' ? `&pick=${pick}` : ''}`;
const editUrl = (id, i) => `features/editor/editor.html?id=${encodeURIComponent(id)}${i !== undefined ? `&q=${i}` : ''}`;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const letter = (j) => String.fromCharCode(65 + j);

// ---------- Bỏ dấu tiếng Việt ----------
const COMBINING = /[̀-ͯ]/g;
export const fold = (s) => String(s ?? '').normalize('NFD').replace(COMBINING, '').toLowerCase().replace(/đ/g, 'd');

// Bỏ dấu kèm bảng ánh xạ vị trí (chữ đã bỏ dấu → vị trí trong chữ gốc) để tô đúng chỗ trên chữ CÓ dấu
function foldMap(s) {
    let f = ''; const map = []; let pos = 0;
    for (const ch of s) {
        const g = fold(ch);
        for (let k = 0; k < g.length; k++) { f += g[k]; map.push(pos); }
        pos += ch.length;
    }
    return { f, map };
}

// ---------- Cú pháp truy vấn ----------
export function parseQuery(raw) {
    const q = { terms: [], phrases: [], not: [] };
    const re = /(-?)"([^"]+)"?|(-?)(\S+)/g; let m;
    while ((m = re.exec(String(raw || '')))) {
        if (m[2] != null) { const p = fold(m[2]).trim(); if (p) (m[1] ? q.not : q.phrases).push(p); }
        else { const w = fold(m[4]); if (w) (m[3] ? q.not : q.terms).push(w); }
    }
    return q;
}
const needlesOf = (Q) => {
    const all = [...Q.terms, ...Q.phrases];
    const long = all.filter(n => n.length >= 2);
    return long.length ? long : all;                      // từ 1 ký tự chỉ tô khi chẳng còn gì khác
};

// Khoảng [đầu, cuối) trên chữ GỐC của mọi chỗ khớp (đã gộp chồng lấn)
function findRanges(text, needles) {
    if (!text || !needles.length) return [];
    const { f, map } = foldMap(text);
    const raw = [];
    for (const n of needles) { let p = f.indexOf(n); while (p >= 0) { raw.push([p, p + n.length]); p = f.indexOf(n, p + n.length); } }
    if (!raw.length) return [];
    raw.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const r of raw) { const last = merged[merged.length - 1]; if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push([r[0], r[1]]); }
    return merged.map(([a, b]) => [map[a], b < map.length ? map[b] : text.length]);
}
function hl(text, Q) {
    text = String(text ?? '');
    const ranges = findRanges(text, needlesOf(Q));
    if (!ranges.length) return esc(text);
    let out = '', last = 0;
    for (const [a, b] of ranges) { out += esc(text.slice(last, a)) + '<mark>' + esc(text.slice(a, b)) + '</mark>'; last = b; }
    return out + esc(text.slice(last));
}
// Tô từ khoá ngay trong HTML đã dựng (bảng xem đầy đủ) — chỉ đụng nút chữ, không phá thẻ/công thức
function markInDom(root, Q) {
    const needles = needlesOf(Q);
    if (!needles.length) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: n => n.parentElement && n.parentElement.closest('script,style,mark,svg,code,.katex,.mermaid') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });
    const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    for (const node of nodes) {
        const t = node.nodeValue, ranges = findRanges(t, needles);
        if (!ranges.length) continue;
        const frag = document.createDocumentFragment(); let last = 0;
        for (const [a, b] of ranges) { frag.append(t.slice(last, a)); const mk = document.createElement('mark'); mk.textContent = t.slice(a, b); frag.append(mk); last = b; }
        frag.append(t.slice(last));
        node.replaceWith(frag);
    }
}

// Markdown → chữ thường cho thẻ kết quả (ảnh thành [ảnh], bỏ **, `, #…)
const plainMd = (s) => String(s ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' [ảnh] ')
    .replace(/<img[^>]*>/gi, ' [ảnh] ')
    .replace(/```[\s\S]*?```/g, ' [khối mã] ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]{1,3}|^#+\s*/gm, '')
    .replace(/\s+/g, ' ').trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n).trimEnd() + '…' : s);

// Đoạn trích quanh chỗ khớp đầu tiên
function snippet(text, Q, radius = 70) {
    const plain = plainMd(text);
    const needles = needlesOf(Q);
    const { f, map } = foldMap(plain);
    let pos = -1, len = 0;
    for (const n of needles) { const p = f.indexOf(n); if (p >= 0 && (pos < 0 || p < pos)) { pos = p; len = n.length; } }
    if (pos < 0) return hl(clip(plain, radius * 2), Q);
    const a = map[Math.max(0, pos - radius)] ?? 0;
    const bF = Math.min(f.length, pos + len + radius * 2);
    const b = bF < map.length ? map[bF] : plain.length;
    return (a > 0 ? '…' : '') + hl(plain.slice(a, b), Q) + (b < plain.length ? '…' : '');
}

// ---------- Chấm điểm ----------
const FIELD = {
    q:    { label: 'Câu hỏi', w: 10 },
    ok:   { label: 'Đáp án đúng', w: 7 },
    opt:  { label: 'Phương án', w: 4 },
    exp:  { label: 'Giải thích', w: 3 },
    note: { label: 'Ghi chú', w: 2.5 },
    case: { label: 'Ca lâm sàng', w: 2 },
    my:   { label: 'Ghi chú của bạn', w: 3 },
};
const SCOPES = [
    ['all', 'Tất cả', 'fa-layer-group', ['q', 'ok', 'opt', 'exp', 'note', 'case', 'my']],
    ['question', 'Câu hỏi', 'fa-circle-question', ['q', 'case']],
    ['answer', 'Đáp án', 'fa-list-check', ['ok', 'opt']],
    ['explain', 'Giải thích', 'fa-lightbulb', ['exp']],
    ['note', 'Ghi chú', 'fa-sticky-note', ['note', 'my']],
];
const SCOPE_KEY = 'libQSearchScope';
const getScope = () => { try { const s = localStorage.getItem(SCOPE_KEY); return SCOPES.some(x => x[0] === s) ? s : 'all'; } catch (e) { return 'all'; } };
const scopeKeys = (s) => (SCOPES.find(x => x[0] === s) || SCOPES[0])[3];

function fieldsOf(it) {
    if (it._f) return it._f;
    const ok = new Set(it.correct || []);
    const opts = it.options || [];
    return (it._f = {
        q: fold(it.question),
        ok: fold(opts.filter((_, k) => ok.has(k)).join('\n') + '\n' + (it.modelAnswer || '')),
        opt: fold(opts.filter((_, k) => !ok.has(k)).join('\n')),
        exp: fold([it.exp, ...(it.optExp || []), ...(it.keyPoints || [])].filter(Boolean).join('\n')),
        note: fold([it.note, it.expanded].filter(Boolean).join('\n')),
        case: fold([it.caseTitle, it.caseText].filter(Boolean).join('\n')),
        my: fold(it.myNote),
    });
}
const isWordStart = (s, p) => p === 0 || !/[a-z0-9]/.test(s[p - 1]);

function scoreItem(it, Q, keys) {
    const F = fieldsOf(it);
    for (const n of Q.not) for (const k of keys) if (F[k].includes(n)) return null;
    let score = 0; const hit = new Set();
    const pos = [...Q.terms.map(t => [t, 1]), ...Q.phrases.map(p => [p, 2])];
    for (const [needle, mul] of pos) {
        let best = 0;
        for (const k of keys) {
            const p = F[k].indexOf(needle);
            if (p < 0) continue;
            hit.add(k);
            const w = FIELD[k].w * (isWordStart(F[k], p) ? 1.5 : 1);
            if (w > best) best = w;
        }
        if (!best) return null;                            // AND: từ nào cũng phải có mặt
        score += best * mul;
    }
    if (keys.includes('q') && pos.every(([n]) => F.q.includes(n))) score += 8 + Math.max(0, 6 - F.q.length / 80);  // đủ từ ngay trong câu hỏi, câu ngắn hơn lên trước
    return { score, hit };
}

export function searchQuestions(index, keyword, scope = getScope()) {
    const Q = parseQuery(keyword);
    const keys = scopeKeys(scope);
    const results = [];
    if (Q.terms.length || Q.phrases.length) {
        for (const it of index || []) { const r = scoreItem(it, Q, keys); if (r) results.push({ it, ...r }); }
        results.sort((a, b) => b.score - a.score || a.it.quizTitle.localeCompare(b.it.quizTitle, 'vi') || a.it.i - b.it.i);
    }
    const groups = new Map();
    for (const r of results) { if (!groups.has(r.it.id)) groups.set(r.it.id, []); groups.get(r.it.id).push(r); }
    return { Q, results, groups };
}
// Chỉ đếm (cho số trên chip phạm vi) — không sắp xếp, không gom
function countScope(index, Q, scope) {
    if (!Q.terms.length && !Q.phrases.length) return 0;
    const keys = scopeKeys(scope);
    let n = 0;
    for (const it of index || []) if (scoreItem(it, Q, keys)) n++;
    return n;
}

// ---------- Tuỳ chọn hiển thị (lưu theo máy) ----------
const pref = (k) => { try { return localStorage.getItem(k) === '1'; } catch (e) { return false; } };
const setPref = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch (e) {} };
const HIDE_KEY = 'libQHideAns', DENSE_KEY = 'libQDense';
// Màu pastel riêng cho từng bộ đề (cùng tên → cùng màu) để mắt nhận ra nhóm nhanh
const hueOf = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return (h % 12) * 30 + 5; };
const reduceMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Vẽ kết quả ----------
let st = { index: [], keyword: '', Q: parseQuery(''), results: [], groups: new Map(), order: [], limit: PAGE, collapsed: new Set(), helpOpen: false, counts: {} };

export function renderQuestionResults(index, keyword) {
    const container = document.getElementById('quiz-list-container');
    if (!container) return;
    const t0 = performance.now();
    const scope = getScope();
    const r = searchQuestions(index, keyword, scope);
    const counts = {};
    for (const [s] of SCOPES) counts[s] = s === scope ? r.results.length : countScope(index, r.Q, s);
    const same = st.keyword === keyword;
    st = { ...st, index, keyword, scope, ...r, counts, order: [], limit: same ? st.limit : PAGE, collapsed: same ? st.collapsed : new Set(), ms: performance.now() - t0, animate: !same };
    draw(container);
}

// Khung xương lấp lánh trong lúc tải chỉ mục lần đầu (thay vòng quay trơ trọi)
export function skeletonHtml() {
    const card = `<div class="qs-skel-card"><i style="width:34%"></i><i style="width:92%"></i><i style="width:78%"></i><i style="width:60%"></i><i style="width:66%"></i></div>`;
    return `<div class="qs-skel">
        <div class="qs-skel-head"><span class="qs-skel-mascot">🐥</span><div><b>Đang lật từng trang đề…</b><small>Lần đầu hơi lâu, lần sau đọc thẳng từ máy nên nhanh như chớp ⚡</small></div></div>
        <div class="qs-skel-grid">${card.repeat(3)}</div>
    </div>`;
}

function badgesOf(it) {
    const b = [];
    if (it.caseText) b.push(`<span class="qs-badge is-case" title="Thuộc ca lâm sàng"><i class="fas fa-notes-medical"></i> Ca LS</span>`);
    if (it.exp || (it.optExp && it.optExp.some(Boolean))) b.push(`<span class="qs-badge is-exp" title="Có giải thích"><i class="fas fa-lightbulb"></i></span>`);
    if (it.note || it.expanded) b.push(`<span class="qs-badge is-note" title="Có ghi chú mở rộng"><i class="fas fa-book-medical"></i></span>`);
    if (it.myNote) b.push(`<span class="qs-badge is-my" title="Bạn có ghi chú cho câu này"><i class="fas fa-sticky-note"></i> Của bạn</span>`);
    if (it.type === 'essay') b.push(`<span class="qs-badge" title="Câu tự luận"><i class="fas fa-pen-nib"></i> Tự luận</span>`);
    return b.join('');
}
function heartsOf(score) {
    const top = st.results[0] ? st.results[0].score : score;
    const ratio = top ? score / top : 1;
    const n = ratio > 0.75 ? 3 : ratio > 0.45 ? 2 : 1;
    const label = ['', 'khớp ít', 'khớp khá', 'khớp rất sát'][n];
    return `<span class="qs-rel" title="Độ khớp: ${label}" aria-label="Độ khớp: ${label}">${[0, 1, 2].map(x => `<i class="${x < n ? 'fas' : 'far'} fa-heart"></i>`).join('')}</span>`;
}

function cardHtml(r, k) {
    const it = r.it, Q = st.Q;
    const ok = new Set(it.correct || []);
    const where = [...r.hit].filter(h => h !== 'q').map(h => FIELD[h].label);
    const opts = (it.options || []).slice(0, 8).map((o, j) =>
        `<li class="${ok.has(j) ? 'is-ok' : ''}"><b>${letter(j)}</b><span>${hl(clip(plainMd(o), 220), Q)}</span>${ok.has(j) ? '<em class="qs-stamp" aria-label="Đáp án đúng"><i class="fas fa-check"></i></em>' : ''}</li>`).join('');
    const snipSrc = r.hit.has('exp') ? [it.exp, ...(it.optExp || []), ...(it.keyPoints || [])].filter(Boolean).join(' · ')
        : r.hit.has('my') ? it.myNote
        : r.hit.has('note') ? [it.note, it.expanded].filter(Boolean).join(' · ')
        : (r.hit.has('case') && !r.hit.has('q')) ? it.caseText : '';
    const snipIcon = r.hit.has('exp') ? 'fa-lightbulb' : r.hit.has('my') ? 'fa-sticky-note' : r.hit.has('note') ? 'fa-book-medical' : 'fa-notes-medical';
    const essay = it.type === 'essay' || (!(it.options || []).length && it.modelAnswer);
    const ans = essay
        ? (it.modelAnswer ? `<div class="qs-model"><i class="fas fa-pen-nib"></i> ${hl(clip(plainMd(it.modelAnswer), 260), Q)}</div>` : '')
        : `<ol class="qs-opts">${opts}</ol>`;
    return `
    <article class="qs-card${st.animate ? ' is-in' : ''}" tabindex="0" data-k="${k}" style="--i:${Math.min(k % PAGE, 12)}" aria-label="Câu ${it.i + 1} trong ${esc(it.quizTitle)}">
        <div class="qs-chead"><span class="qs-num">Câu ${it.i + 1}</span>${badgesOf(it)}${heartsOf(r.score)}</div>
        ${where.length ? `<div class="qs-where"><i class="fas fa-location-crosshairs"></i> khớp ở <b>${esc(where.join(' · '))}</b></div>` : ''}
        <div class="qs-q">${hl(clip(plainMd(it.question), 420), Q)}</div>
        ${ans ? `<div class="qs-ans">${ans}<button type="button" class="qs-reveal" data-act="reveal"><i class="fas fa-eye"></i> Chạm để xem đáp án</button></div>` : ''}
        ${snipSrc ? `<div class="qs-snip"><i class="fas ${snipIcon}"></i><span>${snippet(snipSrc, Q)}</span></div>` : ''}
        <div class="qs-acts">
            <button type="button" class="qs-act is-view" data-act="view" title="Xem đầy đủ (Enter)"><i class="fas fa-expand"></i><span>Xem đủ</span></button>
            <a class="qs-act is-play" href="${quizUrl(it.id, it.i)}" title="Làm riêng câu này (P)"><i class="fas fa-bolt"></i><span>Làm</span></a>
            <a class="qs-act is-edit" href="${editUrl(it.id, it.i)}" title="Mở trang sửa, nhảy thẳng tới câu này (E)"><i class="fas fa-pen"></i><span>Sửa</span></a>
            <button type="button" class="qs-act is-copy" data-act="copy" title="Copy câu + đáp án dạng Markdown (C)"><i class="far fa-copy"></i><span>Copy</span></button>
        </div>
    </article>`;
}

const HELP = [
    ['<kbd>tim mach</kbd>', 'không cần gõ dấu'],
    ['<kbd>"st chênh"</kbd>', 'khớp nguyên cụm'],
    ['<kbd>-trẻ em</kbd>', 'loại câu có từ này'],
    ['<kbd>↓</kbd> <kbd>↑</kbd>', 'chọn thẻ (từ ô tìm bấm ↓)'],
    ['<kbd>Enter</kbd>', 'xem đầy đủ'],
    ['<kbd>E</kbd> / <kbd>P</kbd>', 'sửa / làm câu đang chọn'],
    ['<kbd>C</kbd>', 'copy kèm đáp án'],
    ['<kbd>H</kbd>', 'lộ đáp án (chế độ tự kiểm tra)'],
    ['<kbd>←</kbd> <kbd>→</kbd>', 'lướt câu trong bảng xem'],
];

function barHtml() {
    const { results, groups, scope, counts } = st;
    const hide = pref(HIDE_KEY), dense = pref(DENSE_KEY);
    const n = results.length;
    const mascot = !n ? '🙈' : n > 50 ? '🤩' : n > 10 ? '🥳' : '🐥';
    const toc = groups.size > 1 ? `
        <div class="qs-toc" role="navigation" aria-label="Nhảy tới bộ đề">
            ${[...groups].slice(0, 24).map(([id, arr]) => `<button type="button" class="qs-toc-chip" data-goto="${esc(id)}" style="--qh:${hueOf(arr[0].it.quizTitle)}"><i></i>${esc(clip(arr[0].it.quizTitle, 28))}<em>${arr.length}</em></button>`).join('')}
            <button type="button" class="qs-toc-all" data-collapse-all>${st.collapsed.size ? '<i class="fas fa-angles-down"></i> Mở hết' : '<i class="fas fa-angles-up"></i> Thu gọn hết'}</button>
        </div>` : '';
    return `
    <div class="qs-bar">
        <div class="qs-hero">
            <span class="qs-mascot" aria-hidden="true">${mascot}</span>
            <div class="qs-hero-text">
                <div class="qs-hero-big"><b class="qs-countup" data-to="${n}">${n}</b> câu khớp</div>
                <div class="qs-hero-sub">trong <b>${groups.size}</b> bộ đề · ${Math.max(1, Math.round(st.ms))} ms</div>
            </div>
            <div class="qs-tools">
                <button type="button" class="qs-tool${hide ? ' is-on' : ''}" data-pref="hide" aria-pressed="${hide}" title="Ẩn đáp án để tự kiểm tra — chạm thẻ để lộ"><i class="fas fa-${hide ? 'eye-slash' : 'eye'}"></i><span>Tự kiểm tra</span></button>
                <button type="button" class="qs-tool${dense ? ' is-on' : ''}" data-pref="dense" aria-pressed="${dense}" title="Gọn: chỉ hiện câu hỏi, lướt nhanh"><i class="fas fa-${dense ? 'list' : 'grip'}"></i><span>${dense ? 'Gọn' : 'Thoáng'}</span></button>
                <button type="button" class="qs-tool is-round${st.helpOpen ? ' is-on' : ''}" data-help aria-expanded="${st.helpOpen}" title="Mẹo tìm & phím tắt"><i class="fas fa-question"></i></button>
            </div>
        </div>
        <div class="qs-help"${st.helpOpen ? '' : ' hidden'}>${HELP.map(([k, v]) => `<div><span>${k}</span>${v}</div>`).join('')}</div>
        <div class="qs-scopes" role="group" aria-label="Tìm trong">${SCOPES.map(([k, l, ic]) =>
            `<button type="button" class="qs-scope${k === scope ? ' is-on' : ''}${!counts[k] ? ' is-zero' : ''}" data-scope="${k}" aria-pressed="${k === scope}"><i class="fas ${ic}"></i>${l}<em>${counts[k] ?? 0}</em></button>`).join('')}</div>
        ${toc}
    </div>`;
}

function emptyHtml() {
    const Q = st.Q, scope = st.scope;
    const onlyNot = !Q.terms.length && !Q.phrases.length;
    const sugg = [];
    if (scope !== 'all' && st.counts.all) sugg.push(`<button type="button" data-scope="all"><i class="fas fa-layer-group"></i> Tìm trong Tất cả <em>${st.counts.all}</em></button>`);
    const pos = [...Q.terms, ...Q.phrases];
    if (pos.length > 1) pos.slice(0, 4).forEach(t => sugg.push(`<button type="button" data-kw="${esc(t)}"><i class="fas fa-magnifying-glass"></i> Chỉ “${esc(t)}”</button>`));
    if (Q.not.length && pos.length) sugg.push(`<button type="button" data-kw="${esc(pos.map(p => p.includes(' ') ? `"${p}"` : p).join(' '))}"><i class="fas fa-eraser"></i> Bỏ từ loại trừ</button>`);
    readRecent().filter(k => k !== st.keyword).slice(0, 3).forEach(k => sugg.push(`<button type="button" data-kw="${esc(k)}"><i class="fas fa-clock-rotate-left"></i> ${esc(k)}</button>`));
    return `
    <div class="qs-emptybox">
        <div class="qs-empty-art" aria-hidden="true">🙈<span>?</span></div>
        <h4>${onlyNot ? 'Cần ít nhất một từ để tìm nè' : 'Chưa thấy câu nào khớp'}</h4>
        <p>${onlyNot ? 'Từ có dấu <b>-</b> phía trước chỉ để loại trừ thôi.' : 'Thử bỏ bớt từ, gõ không dấu, hoặc bấm một gợi ý bên dưới.'}</p>
        ${sugg.length ? `<div class="qs-sugg">${sugg.join('')}</div>` : ''}
    </div>`;
}

function draw(container) {
    const hide = pref(HIDE_KEY), dense = pref(DENSE_KEY);
    container.className = 'qs-results' + (hide ? ' qs-hideans' : '') + (dense ? ' qs-dense' : '');
    const { results, groups } = st;
    const countEl = document.getElementById('library-result-count');
    if (countEl) { countEl.textContent = `${results.length} câu hỏi`; countEl.classList.remove('hidden'); }
    if (!results.length) {
        st.order = [];
        container.innerHTML = barHtml() + emptyHtml();
        bindContainer(container);
        return;
    }
    let left = st.limit, html = '';
    const order = [];
    for (const [id, arr] of groups) {
        if (left <= 0) break;
        const shown = arr.slice(0, left); left -= shown.length;
        const it0 = arr[0].it;
        const picks = arr.map(r => r.it.i).sort((a, b) => a - b).slice(0, 300).join(',');
        const pct = Math.max(4, Math.round(arr.length / Math.max(1, it0.n) * 100));
        const collapsed = st.collapsed.has(id);
        html += `
        <section class="qs-group${collapsed ? ' is-collapsed' : ''}" data-gid="${esc(id)}" style="--qh:${hueOf(it0.quizTitle)}">
            <header class="qs-ghead">
                <button type="button" class="qs-gtoggle" data-gtoggle aria-expanded="${!collapsed}" title="Thu gọn / mở nhóm"><i class="fas fa-chevron-down"></i></button>
                <span class="qs-gicon" aria-hidden="true"><i class="fas fa-book-open"></i></span>
                <div class="qs-ginfo">
                    <a class="qs-gtitle" href="${quizUrl(id)}" title="Mở bộ đề">${hl(it0.quizTitle, st.Q)}</a>
                    <div class="qs-gmeta"><span class="qs-gmeter" title="${arr.length}/${it0.n} câu của bộ đề khớp"><span style="width:${pct}%"></span></span><span class="qs-gcount"><b>${arr.length}</b>/${it0.n} câu khớp</span></div>
                </div>
                <div class="qs-gacts">
                    <a class="qs-btn is-main" href="${quizUrl(id, picks)}" title="Luyện ngay đúng các câu khớp, hiện đáp án sau mỗi câu"><i class="fas fa-bolt"></i>Làm ${arr.length} câu</a>
                    <a class="qs-btn" href="${quizUrl(id)}" title="Mở trang làm cả bộ đề"><i class="fas fa-play"></i><span class="qs-hide-sm">Mở đề</span></a>
                    <a class="qs-btn" href="${editUrl(id)}" title="Sửa bộ đề"><i class="fas fa-pen"></i><span class="qs-hide-sm">Sửa đề</span></a>
                </div>
            </header>
            <div class="qs-cards">${shown.map(r => { order.push(r); return cardHtml(r, order.length - 1); }).join('')}</div>
        </section>`;
    }
    st.order = order;
    const rest = results.length - order.length;
    if (rest > 0) html += `<button type="button" class="qs-more" data-more><i class="fas fa-wand-sparkles"></i> Hiện thêm ${Math.min(PAGE, rest)} câu <span>còn ${rest}</span></button>`;
    else if (results.length > 6) html += `<div class="qs-end">🎀 Hết rồi — đủ ${results.length} câu</div>`;
    container.innerHTML = barHtml() + html;
    bindContainer(container);
    if (st.animate) countUp(container.querySelector('.qs-countup'));
    st.animate = false;
}

function countUp(el) {
    const to = el ? +el.dataset.to : 0;
    if (!el || to < 5 || reduceMotion()) return;
    const t0 = performance.now(), dur = 520;
    const step = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
    };
    el.textContent = '0';
    requestAnimationFrame(step);
}

// ---------- Hành động ----------
function copyText(it) {
    const ok = new Set(it.correct || []);
    const lines = [`**Câu ${it.i + 1}** — ${it.quizTitle}`, ''];
    if (it.caseText) lines.push(`> ${it.caseTitle || 'Ca lâm sàng'}: ${it.caseText.replace(/\n/g, '\n> ')}`, '');
    lines.push(it.question, '');
    (it.options || []).forEach((o, j) => {
        lines.push(`${letter(j)}. ${o}${ok.has(j) ? ' ✅' : ''}`);
        if (it.optExp && it.optExp[j]) lines.push(`   ↳ ${it.optExp[j]}`);
    });
    if (it.modelAnswer) lines.push('', `**Đáp án mẫu:** ${it.modelAnswer}`);
    if (it.keyPoints) lines.push(...it.keyPoints.map(p => `- ${p}`));
    if (it.exp) lines.push('', `**Giải thích:** ${it.exp}`);
    if (it.note) lines.push('', `**Ghi chú:** ${it.note}`);
    if (it.expanded) lines.push('', `**Mở rộng:** ${it.expanded}`);
    if (it.myNote) lines.push('', `**Ghi chú của tôi:** ${it.myNote}`);
    return lines.join('\n');
}
async function copyItem(it, btn) {
    try {
        await navigator.clipboard.writeText(copyText(it));
        if (btn) {                                         // nút tự đổi thành "✓ Đã copy" một nhịp — khỏi phải tìm toast
            const old = btn.innerHTML;
            btn.classList.add('is-done');
            btn.innerHTML = '<i class="fas fa-check"></i><span>Đã copy</span>';
            setTimeout(() => { btn.classList.remove('is-done'); btn.innerHTML = old; }, 1400);
        } else showToast(`Đã copy câu ${it.i + 1} kèm đáp án`, 'success', 1800);
    } catch (e) { showToast('Trình duyệt chặn copy.', 'error'); }
}
const go = (url) => { location.href = url; };

function setScope(s) {
    try { localStorage.setItem(SCOPE_KEY, s); } catch (e) {}
    const input = document.getElementById('library-search-input');
    renderQuestionResults(st.index, input ? input.value.trim() : st.keyword);
}
function searchFor(kw) {
    const input = document.getElementById('library-search-input');
    if (!input) return;
    input.value = kw;
    input.dispatchEvent(new Event('input'));
}

function focusCard(k) {
    const el = document.querySelector(`#quiz-list-container .qs-card[data-k="${k}"]`);
    if (!el) return false;
    const g = el.closest('.qs-group');
    if (g && g.classList.contains('is-collapsed')) toggleGroup(g, false);
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
    return true;
}
function toggleGroup(g, collapse = !g.classList.contains('is-collapsed')) {
    const id = g.dataset.gid;
    g.classList.toggle('is-collapsed', collapse);
    g.querySelector('[data-gtoggle]')?.setAttribute('aria-expanded', String(!collapse));
    if (collapse) st.collapsed.add(id); else st.collapsed.delete(id);
}

function bindContainer(container) {
    if (container._qsBound) return;
    container._qsBound = true;
    container.addEventListener('click', (e) => {
        if (!container.classList.contains('qs-results')) return;
        const t = e.target;
        const sc = t.closest('[data-scope]');
        if (sc) { setScope(sc.dataset.scope); return; }
        const kw = t.closest('[data-kw]');
        if (kw) { searchFor(kw.dataset.kw); return; }
        const pf = t.closest('[data-pref]');
        if (pf) {
            const k = pf.dataset.pref === 'hide' ? HIDE_KEY : DENSE_KEY;
            setPref(k, !pref(k)); draw(container);
            showToast(pf.dataset.pref === 'hide' ? (pref(k) ? 'Đã ẩn đáp án — chạm từng thẻ (hoặc phím H) để lộ' : 'Hiện lại đáp án') : (pref(k) ? 'Chế độ gọn: chỉ câu hỏi' : 'Chế độ thoáng: đủ đáp án'), 'info', 1600);
            return;
        }
        if (t.closest('[data-help]')) { st.helpOpen = !st.helpOpen; draw(container); return; }
        const goto = t.closest('[data-goto]');
        if (goto) {
            const g = container.querySelector(`.qs-group[data-gid="${CSS.escape(goto.dataset.goto)}"]`);
            if (g) {
                toggleGroup(g, false);
                g.scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' });
                g.classList.remove('is-pulse'); void g.offsetWidth; g.classList.add('is-pulse');
            } else { st.limit = st.results.length; draw(container); }       // nhóm chưa vẽ (quá giới hạn) → vẽ hết rồi bấm lại
            return;
        }
        if (t.closest('[data-collapse-all]')) {
            const groups = [...container.querySelectorAll('.qs-group')];
            const collapse = st.collapsed.size === 0;
            groups.forEach(g => toggleGroup(g, collapse));
            const b = t.closest('[data-collapse-all]');
            b.innerHTML = collapse ? '<i class="fas fa-angles-down"></i> Mở hết' : '<i class="fas fa-angles-up"></i> Thu gọn hết';
            return;
        }
        const gt = t.closest('[data-gtoggle]');
        if (gt) { toggleGroup(gt.closest('.qs-group')); return; }
        if (t.closest('[data-more]')) {
            const keep = st.order.length;
            st.limit += PAGE; draw(container); focusCard(keep);
            return;
        }
        const card = t.closest('.qs-card');
        if (!card) return;
        const r = st.order[+card.dataset.k];
        if (!r) return;
        const act = t.closest('[data-act]')?.dataset.act;
        if (act === 'copy') { copyItem(r.it, t.closest('[data-act]')); return; }
        if (act === 'reveal') { card.classList.add('is-revealed'); return; }
        if (t.closest('a')) return;                        // link (làm / sửa) tự đi
        if (window.getSelection && String(window.getSelection()).length > 2) return;   // đang bôi đen để copy thì thôi
        openViewer(+card.dataset.k);
    });
    container.addEventListener('keydown', (e) => {
        const card = e.target.closest && e.target.closest('.qs-card');
        if (!card || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.target !== card) return;                     // phím trên nút con (Tab vào nút) để nút tự xử lý
        const k = +card.dataset.k, r = st.order[k];
        const key = e.key.toLowerCase();
        if (key === 'arrowdown' || key === 'j') { e.preventDefault(); focusCard(k + 1); }
        else if (key === 'arrowup' || key === 'k') { e.preventDefault(); if (!focusCard(k - 1)) document.getElementById('library-search-input')?.focus(); }
        else if (key === 'enter' || key === ' ') { e.preventDefault(); openViewer(k); }
        else if (key === 'h') { e.preventDefault(); card.classList.toggle('is-revealed'); }
        else if (key === 'e' && r) { e.preventDefault(); go(editUrl(r.it.id, r.it.i)); }
        else if (key === 'p' && r) { e.preventDefault(); go(quizUrl(r.it.id, r.it.i)); }
        else if (key === 'c' && r) { e.preventDefault(); copyItem(r.it, card.querySelector('[data-act="copy"]')); }
    });
}

// ---------- Bảng xem đầy đủ ----------
let _md = null;
async function getMd() {
    if (_md) return _md;
    try { const m = await import('../quiz-helpers.js'); _md = (s) => m.parseMarkdown(s); }
    catch (e) { _md = (s) => esc(s).replace(/\n/g, '<br>'); }
    return _md;
}
let viewer = null, viewK = -1, lastFocus = null, viewReveal = false;

function setReveal(on) {
    viewReveal = on;
    const p = viewer && viewer.firstElementChild;
    if (!p) return;
    p.classList.toggle('is-hidden-ans', pref(HIDE_KEY) && !on);
    const b = p.querySelector('[data-qv="reveal"]');
    if (b) b.innerHTML = on ? '<i class="fas fa-eye-slash"></i> Che đáp án <kbd>H</kbd>' : '<i class="fas fa-eye"></i> Hiện đáp án & giải thích <kbd>H</kbd>';
}

function ensureViewer() {
    if (viewer) return viewer;
    viewer = document.createElement('div');
    viewer.className = 'qv-overlay';
    viewer.hidden = true;
    viewer.innerHTML = '<div class="qv-panel" role="dialog" aria-modal="true" aria-label="Xem câu hỏi" tabindex="-1"></div>';
    document.body.appendChild(viewer);
    viewer.addEventListener('click', (e) => {
        if (e.target === viewer) return closeViewer();
        const b = e.target.closest('[data-qv]');
        if (!b) return;
        const a = b.dataset.qv;
        if (a === 'close') closeViewer();
        else if (a === 'prev') openViewer(viewK - 1, -1);
        else if (a === 'next') openViewer(viewK + 1, 1);
        else if (a === 'reveal') setReveal(!viewReveal);
        else if (a === 'copy' && st.order[viewK]) copyItem(st.order[viewK].it, b);
    });
    // Vuốt ngang trên điện thoại để lướt câu; vuốt xuống ở thanh kéo để đóng
    let sx = 0, sy = 0, fromGrab = false;
    viewer.addEventListener('touchstart', (e) => {
        const t = e.touches[0]; sx = t.clientX; sy = t.clientY;
        fromGrab = !!e.target.closest('.qv-grab, .qv-head');
    }, { passive: true });
    viewer.addEventListener('touchend', (e) => {
        const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
        if (fromGrab && dy > 70 && Math.abs(dx) < 60) { closeViewer(); return; }
        if (Math.abs(dx) > 70 && Math.abs(dy) < 45) openViewer(viewK + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    }, { passive: true });
    document.addEventListener('keydown', (e) => {
        if (viewer.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
        const r = st.order[viewK];
        const key = e.key.toLowerCase();
        if (key === 'escape') { e.preventDefault(); e.stopPropagation(); closeViewer(); }
        else if (key === 'arrowleft') { e.preventDefault(); openViewer(viewK - 1, -1); }
        else if (key === 'arrowright') { e.preventDefault(); openViewer(viewK + 1, 1); }
        else if (key === 'h') { e.preventDefault(); setReveal(!viewReveal); }
        else if (key === 'e' && r) go(editUrl(r.it.id, r.it.i));
        else if (key === 'p' && r) go(quizUrl(r.it.id, r.it.i));
        else if (key === 'c' && r) copyItem(r.it, viewer.querySelector('[data-qv="copy"]'));
    }, true);
    return viewer;
}

function closeViewer() {
    if (!viewer || viewer.hidden) return;
    viewer.hidden = true;
    document.documentElement.classList.remove('qv-lock');
    if (viewK >= 0) focusCard(viewK); else lastFocus?.focus?.();
}

async function openViewer(k, dir = 0) {
    // Lướt tới kết quả chưa vẽ (quá giới hạn "Hiện thêm") → vẽ thêm danh sách phía sau rồi mở
    if (k >= st.order.length && k < st.results.length) {
        const c = document.getElementById('quiz-list-container');
        st.limit = k + PAGE;
        if (c) draw(c);
    }
    const r = st.order[k];
    if (!r) return;
    const md = await getMd();
    const v = ensureViewer();
    if (v.hidden) lastFocus = document.activeElement;
    if (k !== viewK) viewReveal = false;
    viewK = k;
    const it = r.it, ok = new Set(it.correct || []);
    const sec = (icon, title, html, cls = '') => `<section class="qv-sec ${cls}"><h4><i class="fas ${icon}"></i>${title}</h4><div class="md">${html}</div></section>`;
    const opts = (it.options || []).map((o, j) => `
        <li class="${ok.has(j) ? 'is-ok' : ''}">
            <span class="qv-letter">${letter(j)}</span>
            <div class="qv-opt"><div class="md">${md(o)}</div>${it.optExp && it.optExp[j] ? `<div class="qv-optexp md">${md(it.optExp[j])}</div>` : ''}</div>
            ${ok.has(j) ? '<span class="qv-ok"><i class="fas fa-check"></i> Đúng</span>' : ''}
        </li>`).join('');
    const total = st.results.length;
    const hasAnswerStuff = opts || it.modelAnswer || it.exp || it.note || it.expanded;
    const panel = v.firstElementChild;
    panel.style.setProperty('--qh', hueOf(it.quizTitle));
    panel.innerHTML = `
        <div class="qv-grab" aria-hidden="true"></div>
        <header class="qv-head">
            <span class="qv-bignum" aria-hidden="true">${it.i + 1}</span>
            <div class="qv-crumb">
                <a href="${quizUrl(it.id)}" title="Mở bộ đề">${esc(it.quizTitle)}</a>
                <span>Câu ${it.i + 1} / ${it.n}${it.caseText ? ' · <i class="fas fa-notes-medical"></i> Ca lâm sàng' : ''}</span>
            </div>
            <div class="qv-nav">
                <button type="button" data-qv="prev" ${k <= 0 ? 'disabled' : ''} title="Kết quả trước (←)" aria-label="Kết quả trước"><i class="fas fa-chevron-left"></i></button>
                <span>${k + 1}<small>/${total}</small></span>
                <button type="button" data-qv="next" ${k >= total - 1 ? 'disabled' : ''} title="Kết quả sau (→)" aria-label="Kết quả sau"><i class="fas fa-chevron-right"></i></button>
                <button type="button" data-qv="close" class="is-close" title="Đóng (Esc)" aria-label="Đóng"><i class="fas fa-xmark"></i></button>
            </div>
        </header>
        <div class="qv-progress" aria-hidden="true"><span style="width:${Math.round((k + 1) / Math.max(1, total) * 100)}%"></span></div>
        <div class="qv-body${dir ? (dir > 0 ? ' slide-l' : ' slide-r') : ''}">
            ${it.caseText ? `<details class="qv-case" open><summary><i class="fas fa-notes-medical"></i> ${esc(it.caseTitle || 'Ca lâm sàng')}</summary><div class="md">${md(it.caseText)}</div></details>` : ''}
            <div class="qv-q md">${md(it.question)}</div>
            ${opts ? `<ol class="qv-opts">${opts}</ol>` : ''}
            ${pref(HIDE_KEY) && hasAnswerStuff ? `<button type="button" class="qv-reveal" data-qv="reveal"></button>` : ''}
            <div class="qv-extra">
                ${it.modelAnswer ? sec('fa-pen-nib', 'Đáp án mẫu', md(it.modelAnswer), 'is-ok') : ''}
                ${it.keyPoints ? sec('fa-list-ul', 'Ý chính', `<ul>${it.keyPoints.map(p => `<li>${md(p)}</li>`).join('')}</ul>`, 'is-ok') : ''}
                ${it.exp ? sec('fa-lightbulb', 'Giải thích', md(it.exp), 'is-exp') : ''}
                ${it.note ? sec('fa-book-medical', 'Ghi chú', md(it.note), 'is-note') : ''}
                ${it.expanded ? sec('fa-layer-group', 'Mở rộng', md(it.expanded), 'is-note') : ''}
            </div>
            ${it.myNote ? sec('fa-sticky-note', 'Ghi chú của bạn', `<p class="qv-my">${esc(it.myNote)}</p>`, 'is-my') : ''}
            ${!it.exp && !it.note && !it.expanded && !(it.optExp && it.optExp.some(Boolean)) && !it.modelAnswer ? '<p class="qv-none"><span>✏️</span> Câu này chưa có giải thích — bấm <b>Sửa câu này</b> để bổ sung nha.</p>' : ''}
        </div>
        <footer class="qv-foot">
            <a class="qs-btn is-main" href="${quizUrl(it.id, it.i)}"><i class="fas fa-bolt"></i>Làm câu này<kbd>P</kbd></a>
            <a class="qs-btn is-edit" href="${editUrl(it.id, it.i)}"><i class="fas fa-pen"></i>Sửa câu này<kbd>E</kbd></a>
            <a class="qs-btn" href="${quizUrl(it.id)}"><i class="fas fa-play"></i>Mở cả đề</a>
            <button type="button" class="qs-btn" data-qv="copy"><i class="far fa-copy"></i><span>Copy</span><kbd>C</kbd></button>
        </footer>`;
    setReveal(viewReveal);
    const body = panel.querySelector('.qv-body');
    markInDom(body, st.Q);
    try { if (window.renderMathInElement) window.renderMathInElement(body, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }], throwOnError: false }); } catch (e) {}
    body.scrollTop = 0;
    v.hidden = false;
    document.documentElement.classList.add('qv-lock');
    panel.focus({ preventScroll: true });
}

// ---------- Gợi ý chéo: đang tìm BỘ ĐỀ → báo có bao nhiêu CÂU HỎI khớp ----------
export function renderCrossModeHint(keyword) {
    const container = document.getElementById('quiz-list-container');
    const btn = document.getElementById('search-mode-question-btn');
    if (!container || !btn) return;
    let text;
    if (S.isQuestionIndexLoaded) {
        const { results, groups } = searchQuestions(S.questionIndexCache, keyword, 'all');
        if (!results.length) return;
        text = `Có <b>${results.length}</b> câu hỏi chứa “${esc(keyword)}” trong <b>${groups.size}</b> bộ đề`;
    } else {
        text = `Tìm “${esc(keyword)}” sâu trong câu hỏi, đáp án, giải thích & ghi chú`;
    }
    const hint = document.createElement('button');
    hint.type = 'button';
    hint.className = 'qs-hint';
    hint.innerHTML = `<span class="qs-hint-ic" aria-hidden="true">✨</span><span>${text}</span><b>Xem câu hỏi <i class="fas fa-arrow-right"></i></b>`;
    hint.addEventListener('click', () => btn.click());
    container.prepend(hint);
}

// ---------- Tìm gần đây ----------
const RECENT_KEY = 'libSearchRecent';
const readRecent = () => { try { const a = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(a) ? a.filter(x => typeof x === 'string') : []; } catch (e) { return []; } };
const saveRecent = (a) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(a.slice(0, 8))); } catch (e) {} };
let _recentT = 0;
export function rememberSearch(kw) {
    clearTimeout(_recentT);
    if (kw.length < 2) return;
    _recentT = setTimeout(() => {
        const input = document.getElementById('library-search-input');
        if (!input || input.value.trim() !== kw) return;
        saveRecent([kw, ...readRecent().filter(x => x !== kw && !kw.startsWith(x))]);   // "tim" rồi gõ tiếp "tim mach" → chỉ giữ cụm đầy đủ
    }, 1500);
}

function setupRecent(input) {
    const toolbar = input.closest('.lib-toolbar');
    if (!toolbar) return;
    const box = document.createElement('div');
    box.id = 'lib-recent';
    box.className = 'lib-recent';
    box.hidden = true;
    toolbar.after(box);
    const paint = () => {
        const list = readRecent();
        if (!list.length || input.value.trim() || document.activeElement !== input) { box.hidden = true; return; }
        box.innerHTML = `<span class="lib-recent-label"><i class="fas fa-clock-rotate-left"></i> Tìm gần đây</span>` +
            list.map(k => `<span class="lib-recent-chip"><button type="button" data-kw="${esc(k)}"><i class="fas fa-magnifying-glass"></i>${esc(k)}</button><button type="button" data-del="${esc(k)}" aria-label="Xóa “${esc(k)}”"><i class="fas fa-xmark"></i></button></span>`).join('') +
            `<button type="button" class="lib-recent-clear" data-clear>Xóa hết</button>`;
        box.hidden = false;
    };
    input.addEventListener('focus', paint);
    input.addEventListener('input', paint);
    input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input && !box.contains(document.activeElement)) box.hidden = true; }, 180));
    box.addEventListener('mousedown', (e) => e.preventDefault());       // bấm chip không làm ô tìm mất focus
    box.addEventListener('click', (e) => {
        const kw = e.target.closest('[data-kw]')?.dataset.kw;
        const del = e.target.closest('[data-del]')?.dataset.del;
        if (kw) { input.value = kw; input.dispatchEvent(new Event('input')); input.focus(); }
        else if (del) { saveRecent(readRecent().filter(x => x !== del)); paint(); }
        else if (e.target.closest('[data-clear]')) { saveRecent([]); paint(); }
    });
}

// ---------- URL giữ từ khoá (?q=…&qm=1) ----------
export function syncSearchUrl(kw, mode) {
    try {
        const u = new URL(location.href);
        if (kw) { u.searchParams.set('q', kw); if (mode === 'question') u.searchParams.set('qm', '1'); else u.searchParams.delete('qm'); }
        else { u.searchParams.delete('q'); u.searchParams.delete('qm'); }
        if (u.href !== location.href) history.replaceState(history.state, '', u.href);
    } catch (e) {}
}

function setupUrlRestore(input) {
    let params;
    try { params = new URL(location.href).searchParams; } catch (e) { return; }
    const kw = (params.get('q') || '').trim();
    if (!kw) return;
    const wantQuestion = params.get('qm') === '1';
    const apply = () => {
        if (!sessionUser()) return;                        // chưa đăng nhập xong: chờ lượt vẽ sau
        document.removeEventListener('library:render', apply);
        setTimeout(() => {
            input.value = kw;
            const qBtn = document.getElementById(wantQuestion ? 'search-mode-question-btn' : 'search-mode-quiz-btn');
            const isQ = document.querySelector('input[name="search-mode"]:checked')?.value === 'question';
            if (qBtn && isQ !== wantQuestion) qBtn.click();
            input.dispatchEvent(new Event('input'));
        }, 0);
    };
    document.addEventListener('library:render', apply);
}

// ---------- Khởi tạo ----------
function init() {
    const input = document.getElementById('library-search-input');
    if (!input) return;
    setupRecent(input);
    setupUrlRestore(input);
    // ↓ trong ô tìm → nhảy vào kết quả đầu tiên; Enter → mở kết quả đầu
    input.addEventListener('keydown', (e) => {
        const container = document.getElementById('quiz-list-container');
        if (!container || !container.classList.contains('qs-results') || !st.order.length) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); focusCard(0); }
        else if (e.key === 'Enter') { e.preventDefault(); openViewer(0); }
    });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
