// room-barem.js — CÂU TỰ LUẬN trong phòng, đồng bộ với trang làm đề (quiz.html): dùng lại lõi thuần
// features/quiz/quiz-essay-core.js nên barem / máy dò từ khóa / điểm tính y hệt trang làm đề.
//  · Bài làm chung nhiều ô (session.parts, room-state partsOf): máy dò ĐÚNG ô như trang làm đề (ý có field).
//  · Chấm theo barem (chỉ hiện khi chủ trì đã "Hiện bài giải" — barem là đáp án): máy dò bài làm chung rồi
//    tick sẵn; ai trong phòng cũng bấm tick / ½ / bỏ được -> session.grades.q<i> = { ticks, partials, by, at }.
//    Chưa ai chấm tay thì điểm là của máy (tự tính lại khi bài làm chung đổi). ↺ = trả về máy chấm.
import { updateDoc, deleteField } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { rubricOf, autoMatch, essayPoints, essayMaxPoints, missingCritical, formatOf } from '../quiz/quiz-essay-core.js';
import { room, refs, qKey, questionAt, noteOf, myMember, partsOf } from './room-state.js';
import { escapeHtml, shortName } from './room-ui.js';

const num = (n) => String(Math.round(n * 100) / 100).replace('.', ',');

// Bài làm chung (HTML) -> chữ để dò: xuống dòng theo khối, bỏ nhãn khung (kẻo "Chẩn đoán" của nhãn khớp nhầm ý)
function textOf(q, html) {
    const src = String(html || '').replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d)\b[^>]*>/gi, '\n$&').replace(/<\/t[dh]>/gi, ' ; $&');
    let t = new DOMParser().parseFromString(src, 'text/html').body.textContent || '';
    const f = formatOf(q);
    [...(f.labels || []), ...(f.columns || []), ...(f.rowLabels || [])].forEach(l => { t = t.split(l).join(' '); });
    return t;
}

/** Điểm + trạng thái barem của câu i (máy chấm nếu nhóm chưa chấm tay). */
export function gradeOf(i) {
    const q = questionAt(i);
    const items = rubricOf(q).items;
    if (!q || !items.length) return null;
    const p = partsOf(i);
    const input = p ? { parts: Array.from({ length: formatOf(q).parts }, (_, k) => textOf(q, p['p' + k])) } : textOf(q, noteOf(i));
    const m = (p ? input.parts.join('') : input).trim() ? autoMatch(q, input) : items.map(() => ({ level: null, words: [] }));
    const g = room.session?.grades?.[qKey(i)];
    const manual = !!g && Array.isArray(g.ticks);
    const ans = manual
        ? { ticks: g.ticks, partials: g.partials || [] }
        : { ticks: m.map((x, k) => (x.level === 'match' && !items[k].penalty ? k : -1)).filter(k => k >= 0), partials: [] };
    return { q, items, m, ans, auto: !manual, by: g?.by, pts: essayPoints(q, ans), max: essayMaxPoints(q), missing: missingCritical(q, ans) };
}

/** Chữ ký cho changed(): đổi bài làm chung hoặc bảng chấm là vẽ lại. */
export const baremSig = (i) => [noteOf(i), room.session?.grades?.[qKey(i)]];

/** Hộp "Chấm theo barem" trong sổ tay (gọi khi đã hiện bài giải). */
export function baremHtml(i) {
    const G = gradeOf(i);
    if (!G) return '';
    const { items, m, ans } = G;
    const groups = rubricOf(G.q).groups;
    const row = (it, k) => {
        const on = ans.ticks.includes(k), half = ans.partials.includes(k);
        const hit = m[k]?.level ? `<small class="rm-bm-hit" title="Máy thấy trong bài làm chung">${m[k].level === 'match' ? '🔎' : '≈'} ${escapeHtml(m[k].words.slice(0, 3).join(', '))}</small>` : '';
        return `<li class="rm-bm-it${on ? ' is-on' : half ? ' is-half' : ''}${it.penalty ? ' is-pen' : ''}${it.critical ? ' is-crit' : ''}">
            <button type="button" class="rm-bm-tick" data-bm="${k}" aria-pressed="${on}" title="${it.penalty ? 'Bài làm mắc lỗi này' : 'Bài làm có ý này'}">${on ? (it.penalty ? '!' : '✓') : half ? '½' : ''}</button>
            <span class="rm-bm-txt">${escapeHtml(it.text)}${it.critical ? ' <em>bắt buộc</em>' : ''} ${hit}</span>
            ${it.partial ? `<button type="button" class="rm-bm-half" data-bm-half="${k}" aria-pressed="${half}" title="Nêu chưa đủ: ${num(it.partial)}đ">½</button>` : ''}
            <b class="rm-bm-pt">${it.penalty ? '−' + num(-it.points) : num(half ? it.partial : it.points)}đ</b>
        </li>`;
    };
    const inGroup = new Set(groups.flatMap(g => g.idxs));
    const list = items.map((it, k) => (inGroup.has(k) ? '' : row(it, k))).join('')
        + groups.map(g => `<li class="rm-bm-grp"><b>${escapeHtml(g.label || 'Nhóm ý')}</b> <small>tối đa ${num(g.max)}đ</small><ul>${g.idxs.map(k => row(items[k], k)).join('')}</ul></li>`).join('');
    const who = G.auto
        ? '🤖 Máy dò từ khóa trong bài làm chung — bấm ô để tick / bỏ (diễn đạt khác mà cùng ý vẫn tính)'
        : `✍️ ${escapeHtml(shortName(G.by?.name || 'Nhóm', 14))} đã chấm tay · <button type="button" class="rm-bm-reset" data-bm-reset>↺ máy chấm lại</button>`;
    return `<div class="rm-xbox is-barem" data-nb-sec="barem">
        <div class="rm-hub-boxhead">
            <span class="rm-xlabel"><span class="rm-xic">✅</span>Chấm theo barem</span>
            <span class="flex-1"></span>
            <b class="rm-bm-score${G.missing.length ? ' is-zero' : ''}">${num(G.pts)}/${num(G.max)}đ</b>
        </div>
        <p class="rm-hint rm-bm-who">${who}</p>
        ${G.missing.length ? '<p class="rm-bm-crit">Thiếu ý bắt buộc → cả câu 0 điểm.</p>' : ''}
        <ul class="rm-bm">${list}</ul>
    </div>`;
}

const saveGrade = (i, ticks, partials) => updateDoc(refs.session(), {
    [`grades.${qKey(i)}`]: { ticks, partials, by: { name: myMember()?.displayName || 'Ai đó' }, at: Date.now() },
}).catch(() => {});

let wired = false;
/** Bấm tick / ½ / ↺ (ủy quyền trên document, gắn một lần). curIndex = câu đang xem. */
export function initBarem(curIndex) {
    if (wired) return;
    wired = true;
    document.addEventListener('click', (e) => {
        const t = e.target.closest('[data-bm], [data-bm-half], [data-bm-reset]');
        if (!t) return;
        const i = curIndex();
        if (t.hasAttribute('data-bm-reset')) return void updateDoc(refs.session(), { [`grades.${qKey(i)}`]: deleteField() }).catch(() => {});
        const G = gradeOf(i);
        if (!G) return;
        const ticks = new Set(G.ans.ticks), partials = new Set(G.ans.partials);
        const k = Number(t.dataset.bm ?? t.dataset.bmHalf);
        const [a, b] = t.hasAttribute('data-bm') ? [ticks, partials] : [partials, ticks];
        if (a.has(k)) a.delete(k); else { a.add(k); b.delete(k); }
        saveGrade(i, [...ticks].sort((x, y) => x - y), [...partials].sort((x, y) => x - y));
    });
}
