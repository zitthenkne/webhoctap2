// File: features/quiz/quiz-reasoning-core.js
// LÕI "Quét dữ kiện & hướng tư duy" — trường `reasoning` của câu hỏi (skill /up-cau-hoi ghi, xem page/quiz-reasoning.js):
// chuẩn hóa dữ liệu · regex tìm cụm trong đề · HTML thân thẻ · tìm vị trí dữ kiện trong DOM (không sửa DOM).
// Không phụ thuộc trang làm bài (âm thanh, thiết lập…) -> phòng học (study-room/room-thinking.js) dùng chung y nguyên.

import { getCorrectIndexes, isMultiAnswer } from './quiz-helpers.js';

export const KINDS = { key: 'bản lề', neg: 'âm tính', trap: 'mồi nhử' };
export const STEP_TYPES = { then: 'Suy ra', join: 'Tổng hợp', out: 'Loại trừ' };
const L = (i) => String.fromCharCode(65 + i);
const str = (v) => (v == null ? '' : String(v).trim());
const esc = (s) => str(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');   // chỉ **đậm**, không markdown/KaTeX

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

// Text node của một vùng, bỏ công thức / hình / widget (KaTeX có 2 bản chữ, tô vào sẽ lệch)
function textNodes(root) {
    const out = [];
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: n => (n.parentElement && n.parentElement.closest('.katex, svg, .qw, script, style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    while (w.nextNode()) out.push(w.currentNode);
    return out;
}

// Tìm chỗ của một dữ kiện trong các vùng [[phạm vi, phần tử]] (phạm vi: 'case' | 'q' | 'A'…'H') — KHÔNG đụng DOM.
// -> { nodes, start, end } (offset trên chuỗi ghép các text node) | null khi không thấy.
// Dùng chung: trang làm bài bọc <mark> (markCues), phòng học tô bằng CSS Highlight (study-room/room-thinking.js) vì đề ở đó sửa chung được.
export function locateCue(c, regions) {
    const re = cueRegex(c.text);
    if (!re) return null;
    for (const [scope, el] of regions) {
        if (!el || (c.in && c.in.toLowerCase() !== scope.toLowerCase())) continue;
        const nodes = textNodes(el);
        const m = re.exec(nodes.map(n => n.nodeValue).join(''));
        if (m && m[0]) return { nodes, start: m.index, end: m.index + m[0].length };
    }
    return null;
}

// Bản CHỮ (markdown nhẹ, chỉ **đậm**) cho chỗ không vẽ được thẻ: biên bản phòng học, chép sổ tay sang Obsidian / Notion.
// -> { cues: ['“cụm” (bản lề) — gợi ý'], steps: ['B1 · [1 + 2] Suy ra: …  (gạch A, B)'], goal: 'kết luận (đáp án C)' } | null
export function reasoningLines(q) {
    const rs = readReasoning(q);
    if (!rs) return null;
    const ref = (r) => (r.s ? 'B' + r.s : String(r.c));
    const essay = !Array.isArray(q.answers || q.options) || !(q.answers || q.options).length;
    const ans = essay ? '' : (isMultiAnswer(q) ? getCorrectIndexes(q) : [q.correctAnswerIndex]).filter(i => Number.isInteger(i)).map(L).join(', ');
    return {
        cues: rs.cues.map((c, i) => `${i + 1}. “${c.text}” (${KINDS[c.kind]})${c.hint ? ' — ' + c.hint : ''}`),
        steps: rs.steps.map((s, i) => `B${i + 1} · ${s.from.length ? `[${s.from.map(ref).join(' + ')}] ` : ''}${STEP_TYPES[s.type]}: ${s.text}${s.out.length ? ` (gạch ${s.out.join(', ')})` : ''}`),
        goal: [rs.goal, ans && `đáp án ${ans}`].filter(Boolean).join(' — '),
    };
}
