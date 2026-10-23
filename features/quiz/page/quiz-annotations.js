// File: features/quiz/page/quiz-annotations.js
// #9: ghi chú trực quan (bôi vàng / in đậm / in nghiêng) cho từng vùng của câu hỏi.
// Lưu theo từng câu: { qText: [ { scope, text, type, id, start, end } ] }
// scope = "q" (đề), "a<idx>" (đáp án), "oe<idx>" (giải thích đáp án),
//         "note" (ghi chú ghi nhớ), "expand" (mở rộng kiến thức)
// start/end = VỊ TRÍ KÝ TỰ (offset) của đoạn trong phần text của vùng. Nhờ vậy mỗi ghi
// chú khớp ĐÚNG một lần xuất hiện (không còn "bôi lan" mọi chỗ trùng chữ) và chồng
// nhiều định dạng lên cùng một đoạn chữ vẫn khôi phục đúng khi vẽ lại (bọc thẻ inline
// không đổi số ký tự -> offset luôn hợp lệ). Dữ liệu cũ chỉ có `text` vẫn đọc được
// (lui về khớp lần xuất hiện đầu).
// type "note" = ghi chú RIÊNG cho cụm từ: thêm trường `note` (nội dung, dài bao nhiêu cũng được), vẽ bằng <span class="annot-note">
// + HÀNG GHI CHÚ riêng ngay dưới vùng chữ (renderNoteRails); bấm cụm từ / dòng ghi chú mở khung sửa/xóa.
// Mọi item mang `ts` (lần sửa cuối) và xóa thì để "bia mộ" (quiz_annot_del_<id>) -> đồng bộ đúng giữa các máy (quiz-study-store.js).

import { state } from '../quiz-state.js';
import { pushStudyToCloud } from './quiz-study-sync.js';
import { studyKeys } from '../quiz-study-store.js';
import { NOTE_TAGS, noteTagsOf, noteTextHtml, noteCount } from './quiz-notes-panel.js';
import { syncQuizNavPanel } from '../quiz-ui.js';
import { showQuestion } from './quiz-question-view.js';

const quizIdNow = () => (state.quizData && state.quizData.id) || (new URLSearchParams(window.location.search)).get('id') || 'default_quiz';
function annotStorageKey() {
    return studyKeys(quizIdNow()).annot;
}
// Bia mộ cho id vừa xóa: máy khác còn giữ bản cũ thì lúc hợp nhất nó bị bỏ, không "sống lại"
function buryAnnotId(id) {
    if (!id) return;
    const k = studyKeys(quizIdNow()).annotDel;
    try { const m = JSON.parse(localStorage.getItem(k) || '{}'); m[id] = Date.now(); localStorage.setItem(k, JSON.stringify(m)); } catch (e) {}
}
function getAnnotStore() {
    try { return JSON.parse(localStorage.getItem(annotStorageKey()) || '{}'); } catch (e) { return {}; }
}
function saveAnnotStore(store) {
    try { localStorage.setItem(annotStorageKey(), JSON.stringify(store)); } catch (e) {}
}
function getAnnotsFor(qText) {
    const store = getAnnotStore();
    return Array.isArray(store[qText]) ? store[qText] : [];
}
// Khóa lưu ghi chú cho một vùng. Vùng "case" (khung ca lâm sàng) dùng chung cho nhiều
// câu con nên lưu theo caseId ('case:<id>') để ghi chú giữ nguyên khi chuyển câu trong ca;
// các vùng còn lại (đề/đáp án/giải thích/ghi chú/mở rộng) lưu theo nội dung câu hỏi.
function annotKeyFor(question, scope) {
    if (scope === 'case') {
        const cid = question && question.caseId ? String(question.caseId).trim() : '';
        if (cid) return 'case:' + cid;
    }
    return question ? question.question : '';
}
// Vùng này của câu đã có ghi chú/tô chưa — phiếu chấm tự luận giữ nguyên đáp án mẫu liền khối khi đã có
// (ghi chú neo theo vị trí chữ trong vùng, tách theo ô là lệch)
export function hasAnnots(question, scope) {
    return getAnnotsFor(annotKeyFor(question, scope)).some(a => a.scope === scope);
}
function addAnnot(qText, scope, text, type, start, end, note) {
    const store = getAnnotStore();
    const arr = Array.isArray(store[qText]) ? store[qText] : [];
    const hasPos = typeof start === 'number' && typeof end === 'number';
    let id = null;
    // Trùng lặp: xét theo (scope, type, vị trí) khi có offset; lui về (scope, text, type)
    // cho dữ liệu cũ. Nhờ vậy hai đoạn CÙNG chữ ở hai vị trí khác nhau không bị coi là một.
    const dup = arr.some(a => a.scope === scope && a.type === type && (
        hasPos ? (a.start === start && a.end === end) : (a.text === text)
    ));
    if (!dup) {
        // id riêng cho từng ghi chú: gỡ chính xác kể cả khi đoạn bị TÁCH ĐÔI trong DOM
        // do định dạng khác chồng lấn (textContent của mảnh không còn khớp text gốc).
        id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const item = hasPos ? { scope, text, type, id, start, end, ts: Date.now() } : { scope, text, type, id, ts: Date.now() };
        if (note) item.note = note;
        arr.push(item);
    }
    store[qText] = arr;
    saveAnnotStore(store);
    pushStudyToCloud();
    return id;
}
function updateAnnotNote(qText, id, note) {
    const store = getAnnotStore();
    const a = Array.isArray(store[qText]) && store[qText].find(x => x.id === id);
    if (!a) return;
    a.note = note;
    a.ts = Date.now();
    saveAnnotStore(store);
    pushStudyToCloud();
}
function removeAnnot(qText, scope, text, type) {
    const store = getAnnotStore();
    if (Array.isArray(store[qText])) {
        store[qText] = store[qText].filter(a => !(a.scope === scope && a.text === text && a.type === type));
        if (store[qText].length === 0) delete store[qText];
        saveAnnotStore(store);
        pushStudyToCloud();
    }
}
// Gỡ theo id (ghi chú mới đều có); mảnh DOM nào cũng mang data-annot-id nên khớp tuyệt đối
function removeAnnotById(qText, id) {
    const store = getAnnotStore();
    if (Array.isArray(store[qText])) {
        store[qText] = store[qText].filter(a => a.id !== id);
        if (store[qText].length === 0) delete store[qText];
        saveAnnotStore(store);
        buryAnnotId(id);
        pushStudyToCloud();
    }
}
// Gỡ một đoạn ghi chú khỏi cả KHO lẫn DOM (mọi mảnh cùng id biến mất theo);
// dữ liệu cũ không có id thì lui về khớp (scope, text, type).
function removeAnnotEverywhere(qText, scope, mark) {
    const id = mark.getAttribute('data-annot-id');
    const type = mark.getAttribute('data-annot-type') || 'highlight';
    if (id) {
        removeAnnotById(qText, id);
        document.querySelectorAll(`#quizSection [data-annot-id="${id}"]`).forEach(unwrapMark);
    } else {
        removeAnnot(qText, scope, mark.textContent, type);
        unwrapMark(mark);
    }
}
function annotTag(type) {
    if (type === 'bold') return 'strong';
    if (type === 'italic') return 'em';
    if (type === 'underline') return 'u';
    if (type === 'strike') return 's';
    if (type === 'note') return 'span';
    return 'mark';
}
function annotClass(type) {
    // Tái dùng class markdown sẵn có để màu in đậm (hồng) / in nghiêng (xanh) đồng nhất
    // với phần còn lại của web và tự đổi màu theo nền đúng/sai/tối.
    if (type === 'bold') return 'quiz-annot obsidian-bold';
    if (type === 'italic') return 'quiz-annot obsidian-italic';
    if (type === 'underline') return 'quiz-annot annot-underline';
    if (type === 'strike') return 'quiz-annot annot-strike';
    if (type === 'note') return 'quiz-annot annot-note';
    if (type === 'hl-green') return 'quiz-annot quiz-hl quiz-hl-green';
    if (type === 'hl-blue') return 'quiz-annot quiz-hl quiz-hl-blue';
    return 'quiz-annot quiz-hl';
}

// Gom MỌI text node bên trong container theo đúng thứ tự tài liệu.
// (Trước đây phải loại phần đã bọc cùng loại để né lỗi tìm-theo-chữ; nay dùng offset
// tuyệt đối nên không cần loại gì — bọc thẻ inline không đổi tổng số ký tự.)
function collectTextNodes(container) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
}

// Vị trí ký tự của một điểm (node, offset) tính từ đầu phần text của container.
// Dùng Range.toString().length: đếm đúng số ký tự text đứng trước điểm, chịu được cả
// khi điểm nằm trong thẻ lồng nhau (mark/strong/em) hay ở ranh giới phần tử.
function offsetInContainer(container, node, offset) {
    try {
        const r = document.createRange();
        r.selectNodeContents(container);
        r.setEnd(node, offset);
        return r.toString().length;
    } catch (e) { return -1; }
}

// Đổi vị trí trong chuỗi ghép toàn bộ text -> (node, offset) để dựng Range.
// Ở ranh giới giữa hai node: điểm ĐẦU (preferEnd=false) nhảy sang đầu node kế,
// điểm CUỐI (preferEnd=true) bám cuối node trước — nhờ vậy range không "liếm" phần
// rỗng ở đầu/cuối node lân cận, tránh cắt ngang thẻ khác -> không sinh mảnh rỗng.
function locateInNodes(nodes, globalPos, preferEnd) {
    let acc = 0;
    for (let i = 0; i < nodes.length; i++) {
        const len = nodes[i].nodeValue.length;
        if (globalPos < acc + len || (globalPos === acc + len && (preferEnd || i === nodes.length - 1))) {
            return { node: nodes[i], offset: globalPos - acc };
        }
        acc += len;
    }
    const last = nodes[nodes.length - 1];
    return last ? { node: last, offset: last.nodeValue.length } : null;
}

// Bọc một Range trong thẻ định dạng. surroundContents chỉ chịu range nằm gọn trong
// một node; range vắt qua nhiều thẻ (chữ đậm/nghiêng có sẵn của markdown) thì dùng
// extractContents — DOM tự tách đôi các thẻ bị cắt ngang nên vẫn an toàn.
function wrapRange(range, type, id, note) {
    const el = document.createElement(annotTag(type));
    el.className = annotClass(type);
    el.setAttribute('data-annot-type', type);
    if (id) el.setAttribute('data-annot-id', id);
    if (note) el.setAttribute('data-note', note);
    try {
        range.surroundContents(el);
    } catch (e) {
        const frag = range.extractContents();
        el.appendChild(frag);
        range.insertNode(el);
    }
    return el;
}

// Gỡ một đoạn ghi chú tại chỗ: trả các con về vị trí cũ, không cần vẽ lại cả câu
function unwrapMark(mark) {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
}

// Dọn các thẻ ghi chú rỗng (do range chồng lấn cắt ngang một thẻ khác sinh ra) rồi
// gộp lại các text node kề nhau. Chạy sau mỗi lần thêm/gỡ để DOM luôn sạch.
function cleanupEmptyAnnots(scopeEl) {
    if (!scopeEl) return;
    scopeEl.querySelectorAll('.quiz-annot').forEach(m => {
        if (!m.textContent) m.parentNode && m.parentNode.removeChild(m);
    });
    try { scopeEl.normalize(); } catch (e) {}
}

// Bọc một khoảng [from, to) ký tự của container trong thẻ định dạng.
// Text node được gom LẠI mỗi lần gọi vì lần bọc trước có thể đã tách đôi node — nhưng
// tổng số ký tự không đổi nên offset tuyệt đối vẫn trỏ đúng chỗ.
function wrapOffsetRange(container, from, to, type, id, note) {
    const nodes = collectTextNodes(container);
    if (!nodes.length) return;
    const start = locateInNodes(nodes, from, false);
    const end = locateInNodes(nodes, to, true);
    if (!start || !end) return;
    try {
        const range = document.createRange();
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
        wrapRange(range, type, id, note);
    } catch (e) {}
}

// Bọc các đoạn đã ghi chú trong một vùng cụ thể.
// - Bản mới lưu start/end (offset ký tự) -> khớp ĐÚNG một lần xuất hiện, chồng nhiều
//   lớp định dạng lên cùng đoạn chữ vẫn khôi phục đúng.
// - Dữ liệu cũ chỉ có `text` -> lui về khớp lần xuất hiện ĐẦU TIÊN (không còn bôi lan
//   ra mọi chỗ trùng chữ như trước).
function applyAnnotsToContainer(container, annots) {
    if (!container || !annots || !annots.length) return;
    annots.forEach(a => {
        if (a.id && container.querySelector(`[data-annot-id="${a.id}"]`)) return;   // đã vẽ (applyAnnotationsAll gọi lại sau khi trả lời) -> khỏi bọc lồng
        if (typeof a.start === 'number' && typeof a.end === 'number' && a.end > a.start) {
            wrapOffsetRange(container, a.start, a.end, a.type, a.id, a.note);
            return;
        }
        // Lui về khớp theo chữ (dữ liệu cũ): chỉ lần xuất hiện đầu tiên.
        const phrase = a.text;
        if (!phrase || phrase.length < 1) return;
        const nodes = collectTextNodes(container);
        const pos = nodes.map(n => n.nodeValue).join('').indexOf(phrase);
        if (pos === -1) return;
        wrapOffsetRange(container, pos, pos + phrase.length, a.type, a.id, a.note);
    });
}
// Áp dụng ghi chú cho mọi vùng [data-annot] của câu đang hiển thị
// Ghi chú bị tách thành nhiều mảnh (định dạng khác chồng cắt ngang) -> chỉ mảnh cuối hiện nhãn, tránh lặp
function markLastNoteFragments(root) {
    const last = new Map();
    root.querySelectorAll('.annot-note[data-annot-id]').forEach(el => { el.classList.add('an-dup'); last.set(el.getAttribute('data-annot-id'), el); });
    last.forEach(el => el.classList.remove('an-dup'));
}
// root: chỉ áp trong một khối vừa vẽ lại (phiếu chấm tự luận sau khi tick) — mặc định cả câu
export function applyAnnotationsAll(root) {
    const quizSection = root || document.getElementById('quizSection');
    if (!quizSection) return;
    const question = state.questions[state.currentIndex];
    if (!question) return;
    const store = getAnnotStore();
    const els = [...quizSection.querySelectorAll('[data-annot]')];
    // Đáp án bị xáo thứ tự giữa các phiên: "a2" lưu hôm qua giờ có thể là ô khác -> đưa item về ô (cùng loại a/oe)
    // có chữ khớp đúng chỗ; không ô nào khớp thì giữ ô cũ như trước.
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const texts = new Map();
    const textOf = (el) => { if (!texts.has(el)) texts.set(el, collectTextNodes(el).map(n => n.nodeValue).join('')); return texts.get(el); };
    const fits = (el, a) => typeof a.start === 'number' ? norm(textOf(el).slice(a.start, a.end)) === norm(a.text) : textOf(el).includes(a.text);
    const home = (a, el) => {
        const m = /^(a|oe)\d+$/.exec(a.scope);
        if (!m || fits(el, a)) return el;
        return els.find(e => (e.getAttribute('data-annot') || '').replace(/\d+$/, '') === m[1] && fits(e, a)) || el;
    };
    const byEl = new Map();
    els.forEach(el => {
        const scope = el.getAttribute('data-annot');
        const annots = store[annotKeyFor(question, scope)];
        if (!Array.isArray(annots)) return;
        annots.filter(a => a.scope === scope).forEach(a => {
            const t = home(a, el);
            if (!byEl.has(t)) byEl.set(t, []);
            byEl.get(t).push(a);
        });
    });
    byEl.forEach((annots, el) => { applyAnnotsToContainer(el, annots); cleanupEmptyAnnots(el); });
    markLastNoteFragments(quizSection);
    renderNoteRails(document.getElementById('quizSection') || quizSection);   // vẽ lại một khối (phiếu chấm) vẫn đánh số theo cả câu
}
// ---- Hàng ghi chú riêng dưới mỗi vùng chữ ----
// Ghi chú dài ngắn tùy ý nên không nhét cạnh chữ nữa: cụm từ chỉ còn vạch bút dạ + số trong bong bóng nhỏ, nội dung nằm ở
// .an-rail = anh em KẾ TIẾP của [data-annot] (KHÔNG nằm trong vùng -> offset chữ, đọc to, quét dữ kiện, chọn chữ không đụng tới).
// Ghi chú tĩnh của phòng đánh đề (<span data-note> trong nội dung đề) cũng lên hàng, chỉ để đọc.
const QUOTE_MAX = 48;
// Nhãn đầu dòng (CHUNG hệ nhãn ghi chú cá nhân: "⭐ ", "Dễ nhầm với: ", "Hỏi lại: "…) -> màu + ký hiệu trong bong bóng.
// Không nhãn thì màu theo nền (--nt). Nhãn đầu tiên theo thứ tự NOTE_TAGS thắng.
const TAG_LOOK = { 'Quan trọng': ['star', '★'], 'Dễ nhầm': ['trap', '≠'], 'Hỏi lại': ['ask', '?'] };   // "!" trong Quicksand đọc thành "1"
const tagLook = (note) => { const t = [...noteTagsOf(note)].find(x => TAG_LOOK[x]); return t ? TAG_LOOK[t] : null; };
function renderNoteRails(root) {
    if (!root) return;
    let n = 0;   // đánh số LIÊN TỤC cả câu (ca lâm sàng -> đề -> đáp án -> giải thích -> ghi nhớ -> mở rộng): mỗi số chỉ một cụm
    root.querySelectorAll('[data-annot]').forEach(el => {
        const old = el.nextElementSibling;
        if (old && old.classList.contains('an-rail')) old.remove();
        const groups = new Map();   // id (hoặc chính phần tử với ghi chú tĩnh) -> các mảnh
        el.querySelectorAll('span[data-note]').forEach(s => {
            const k = s.getAttribute('data-annot-id') || s;
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k).push(s);
        });
        if (!groups.size) return;
        const rail = document.createElement('div');
        rail.className = 'an-rail';
        groups.forEach((frags, k) => {
            n++;
            const note = frags[frags.length - 1].getAttribute('data-note') || '';
            const look = tagLook(note);
            const mark = (look ? look[1] : '') + n;
            frags.forEach(f => { f.setAttribute('data-an', mark); if (look) f.dataset.tag = look[0]; else delete f.dataset.tag; });
            const it = document.createElement('div');
            it.className = 'an-ri';
            if (look) it.dataset.tag = look[0];
            if (typeof k === 'string') { it.dataset.id = k; it.tabIndex = 0; it.setAttribute('role', 'button'); it.title = 'Bấm để sửa ghi chú'; }
            else it.classList.add('is-static');
            it.innerHTML = '<span class="an-no" aria-hidden="true"></span><div class="an-body"><div class="an-tx"><span class="an-q"></span><span class="an-nt"></span></div></div>';
            const q = frags.map(f => f.textContent).join('').trim();
            it.querySelector('.an-no').textContent = mark;
            it.querySelector('.an-q').textContent = q.length > QUOTE_MAX ? q.slice(0, QUOTE_MAX).trim() + '…' : q;
            it.querySelector('.an-nt').innerHTML = noteTextHtml(note);   // nhãn đầu dòng in đậm, ☐ thành ô tích, **đậm** — chữ đã thoát HTML
            rail.appendChild(it);
        });
        // Hàng nằm trong ô đáp án: chạm/giữ ở đây không được tính là chọn / gạch đáp án; phím Enter/Space trên dòng = sửa
        ['pointerdown', 'contextmenu'].forEach(t => rail.addEventListener(t, e => e.stopPropagation()));
        rail.addEventListener('keydown', (e) => {
            const ri = e.target.closest('.an-ri[data-id]');
            if (ri && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); ri.click(); }
        });
        el.after(rail);
        // Ghi chú dài gập còn 4 dòng (.is-clamp = line-clamp) -> chỉ giữ gập khi ĐO được là tràn, kèm nút "Xem hết".
        // Hàng đang ẩn (công tắc tắt, giải thích chưa mở) đo ra 0 -> để nguyên văn, không bao giờ bị cắt mà thiếu nút.
        rail.querySelectorAll('.an-tx').forEach(tx => {
            tx.classList.add('is-clamp');
            if (!tx.clientHeight || tx.scrollHeight <= tx.clientHeight + 2) { tx.classList.remove('is-clamp'); return; }
            const more = document.createElement('span');
            more.className = 'an-more';
            more.setAttribute('role', 'button');
            more.textContent = 'Xem hết';
            tx.after(more);
        });
    });
}
// Vừa lưu / vừa nhảy tới: bút dạ quét lại cụm từ + dòng ghi chú bật ra (CSS .an-new, ~0.8s)
const popIn = (els) => els.forEach(el => { el.classList.remove('an-new'); void el.offsetWidth; el.classList.add('an-new'); setTimeout(() => el.classList.remove('an-new'), 1000); });
const tidyNote = (v) => String(v || '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();   // giữ xuống dòng (tối đa 1 dòng trống)
// Sau mỗi lần thêm/sửa/xóa ghi chú cụm từ: chấm "có ghi chú" ở bảng số câu + số đếm nút "Tất cả" theo kịp
function afterNoteChange() {
    try { syncQuizNavPanel(); } catch (e) {}
    const c = document.getElementById('note-all-count');
    if (c) c.textContent = String(noteCount());
}
// Sổ ghi chú cả bộ đề (quiz-notes-all.js) sửa / xóa ghi chú cụm từ của câu bất kỳ, không cần đang mở câu đó
export function setPhraseNote(qText, id, value) {
    const note = tidyNote(value);
    if (note) updateAnnotNote(qText, id, note); else removeAnnotById(qText, id);
    const frags = document.querySelectorAll(`#quizSection [data-annot-id="${id}"]`);
    if (frags.length) {
        frags.forEach(f => (note ? f.setAttribute('data-note', note) : unwrapMark(f)));
        renderNoteRails(document.getElementById('quizSection'));
    }
    afterNoteChange();
}
// Nhảy từ sổ ghi chú tới câu: cuộn tới cụm từ rồi quét sáng
export function flashPhraseNote(id) {
    const f = document.querySelector(`#quizSection [data-annot-id="${id}"]`);
    if (!f) return;
    try { f.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { f.scrollIntoView(); }
    setTimeout(() => popIn(noteEls(id)), 350);
}
const noteEls = (id) => document.querySelectorAll(`#quizSection [data-annot-id="${id}"], #quizSection .an-ri[data-id="${id}"]`);
// ---- Khung viết ghi chú cho một cụm từ (mới / sửa) ----
// Không giới hạn số từ (hàng riêng chứa được ghi chú dài); maxlength chỉ chặn dán nhầm cả trang làm phình doc quiz_study.
const NOTE_MAX_CHARS = 4000;
// Nhãn chèn nhanh trong khung viết (cùng nhãn với ô Ghi chú cá nhân -> sổ "Tất cả" lọc chung được)
const QUICK_TAGS = ['Quan trọng', 'Nhớ', 'Dễ nhầm', 'Hỏi lại', 'Cơ chế', 'Việc cần làm'].map(l => NOTE_TAGS.find(t => t.label === l)).filter(Boolean);
const TAG_SHORT = { 'Quan trọng': 'Quan trọng', 'Việc cần làm': 'Việc cần làm' };
let noteEd = null;   // { box, ta, ctx }
function closeNoteEditor() {
    if (!noteEd) return;
    noteEd.box.remove();
    noteEd = null;
}
// ctx.mode: 'view' (bấm cụm từ: bóng thoại ĐỌC, không bật bàn phím điện thoại) · 'edit' · 'new'
function openNoteEditor(ctx) {
    closeNoteEditor();
    const view = ctx.mode === 'view';
    const box = document.createElement('div');
    box.id = 'annot-note-pop';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Ghi chú cho cụm từ');
    const quote = (ctx.text || '').length > 70 ? ctx.text.slice(0, 70) + '…' : (ctx.text || '');
    const look = view ? tagLook(ctx.note || '') : null;
    if (look) box.dataset.tag = look[0];
    box.classList.toggle('anp-view', view);
    box.innerHTML = (view ? '' : '<span class="washi-tape washi-lav anp-tape" aria-hidden="true"></span>')
        + '<div class="anp-head"><span class="anp-ic" aria-hidden="true"></span><div class="anp-quote">“<span></span>”</div></div>'
        + (view
            ? '<div class="anp-read"></div>'
            : '<div class="anp-field">'
            + `<textarea class="anp-ta" rows="2" maxlength="${NOTE_MAX_CHARS}" enterkeyhint="done" autocomplete="off" placeholder="Viết ghi chú cho cụm từ này…"></textarea></div>`
            + '<div class="anp-tags" role="group" aria-label="Chèn nhãn">'
            + QUICK_TAGS.map((t, i) => `<button type="button" data-anp-tag="${i}" title="Chèn “${t.snip.trim()}” đầu dòng"><i class="fas ${t.icon}"></i> ${TAG_SHORT[t.label] || t.label}</button>`).join('')
            + '</div>')
        + '<div class="anp-row">'
        + (view ? ''
            : '<span class="anp-hint">Enter lưu · Shift+Enter xuống dòng</span>')
        + (ctx.mode !== 'new' ? '<button type="button" class="anp-del" data-anp="del"><i class="fas fa-trash-can"></i> Xóa</button>' : '')
        + '<span class="anp-sp"></span>'
        + (view
            ? '<button type="button" class="anp-all" data-anp="all" title="Sổ ghi chú cả bộ đề (Shift+Q)"><i class="fas fa-list-ul"></i> Tất cả</button>'
            + '<button type="button" class="anp-ok" data-anp="edit"><i class="fas fa-pen"></i> Sửa</button>'
            : '<button type="button" data-anp="cancel">Hủy</button>'
            + '<button type="button" class="anp-ok" data-anp="save"><i class="fas fa-check"></i> Lưu</button>')
        + '</div>';
    box.querySelector('.anp-quote span').textContent = quote;
    const ta = box.querySelector('.anp-ta');
    if (view) box.querySelector('.anp-read').innerHTML = noteTextHtml(ctx.note || '');
    else ta.value = ctx.note || '';
    document.body.appendChild(box);
    // Ô tự cao theo chữ (tới 40vh thì cuộn trong ô); nhãn đang có trong ghi chú sáng lên
    const grow = () => {
        if (!ta) return;
        ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 4, window.innerHeight * 0.4) + 'px';
        const on = noteTagsOf(ta.value);
        box.querySelectorAll('[data-anp-tag]').forEach(b => b.classList.toggle('is-on', on.has(QUICK_TAGS[+b.dataset.anpTag].label)));
    };
    if (ta) { ta.addEventListener('input', grow); grow(); }
    // Bóng thoại cạnh cụm từ, đuôi chỉ đúng vào chữ (--tail). Cảm ứng lúc VIẾT thì ghim trên màn hình (bàn phím ảo che nửa dưới).
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if ((!coarse || view) && ctx.rect) {
        const w = box.offsetWidth, h = box.offsetHeight;
        const left = Math.max(8, Math.min(window.innerWidth - w - 8, ctx.rect.left + ctx.rect.width / 2 - w / 2));
        let top = ctx.rect.bottom + 12, below = true;
        if (top + h > window.innerHeight - 8) { top = Math.max(8, ctx.rect.top - h - 12); below = false; }
        box.style.left = left + 'px';
        box.style.top = top + 'px';
        box.style.setProperty('--tail', Math.max(22, Math.min(w - 22, ctx.rect.left + ctx.rect.width / 2 - left)) + 'px');
        box.classList.add('anp-near', below ? 'anp-below' : 'anp-above');
    }
    noteEd = { box, ta, ctx };
    if (ta) setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 30);
    else setTimeout(() => box.querySelector('[data-anp="edit"]')?.focus({ preventScroll: true }), 30);
    box.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        if (e.target.closest('[data-anp-tag]')) e.preventDefault();   // bấm nhãn: giữ con trỏ (và bàn phím ảo) trong ô gõ
    });
    box.addEventListener('click', (e) => {
        const tg = e.target.closest('[data-anp-tag]');
        if (tg && ta) {
            // chèn nhãn ở ĐẦU dòng đang gõ; dòng đã có đúng nhãn đó thì bấm lại = gỡ
            const snip = QUICK_TAGS[+tg.dataset.anpTag].snip;
            const v = ta.value, pos = ta.selectionStart == null ? v.length : ta.selectionStart;
            const ls = v.lastIndexOf('\n', pos - 1) + 1;
            const had = v.slice(ls).startsWith(snip);
            ta.value = had ? v.slice(0, ls) + v.slice(ls + snip.length) : v.slice(0, ls) + snip + v.slice(ls);
            const c = Math.max(ls, pos + (had ? -snip.length : snip.length));
            ta.focus(); ta.setSelectionRange(c, c);
            grow();
            return;
        }
        const b = e.target.closest('[data-anp]');
        if (!b) return;
        const act = b.getAttribute('data-anp');
        if (act === 'cancel') closeNoteEditor();
        else if (act === 'save') saveNoteEditor();
        else if (act === 'del') deleteNoteEditor();
        else if (act === 'edit') openNoteEditor({ ...ctx, mode: 'edit' });
        else if (act === 'all') { closeNoteEditor(); import('./quiz-notes-all.js').then(m => m.openAllNotes({ filter: 'phrase' })); }
    });
    (ta || box).addEventListener('keydown', (e) => {
        e.stopPropagation(); // đừng kích hoạt phím tắt A–D / mũi tên của trang làm bài
        if (e.key === 'Escape') closeNoteEditor();
        else if (ta && e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); saveNoteEditor(); }   // Enter chốt chữ đang ghép (Telex / VNI) thì chưa lưu; Shift+Enter = xuống dòng
    });
}
function saveNoteEditor() {
    if (!noteEd) return;
    const { ta, ctx } = noteEd;
    if (!ta) return;
    const note = tidyNote(ta.value);
    const sec = document.getElementById('quizSection');
    if (ctx.mode === 'edit') {
        if (!note) { deleteNoteEditor(); return; }
        updateAnnotNote(ctx.qText, ctx.id, note);
        document.querySelectorAll(`#quizSection [data-annot-id="${ctx.id}"]`).forEach(el => el.setAttribute('data-note', note));
        renderNoteRails(sec);
        popIn(noteEls(ctx.id));
    } else if (note) {
        const id = addAnnot(ctx.qText, ctx.scope, ctx.text, 'note', ctx.start, ctx.end, note);
        if (ctx.scopeEl && ctx.scopeEl.isConnected) {
            wrapOffsetRange(ctx.scopeEl, ctx.start, ctx.end, 'note', id, note);
            cleanupEmptyAnnots(ctx.scopeEl);
            markLastNoteFragments(ctx.scopeEl);
            renderNoteRails(sec);
            popIn(noteEls(id));
        } else showQuestion();
    }
    afterNoteChange();
    closeNoteEditor();
}
function deleteNoteEditor() {
    if (!noteEd) return;
    const { ctx } = noteEd;
    if (ctx.mode !== 'new') {
        removeAnnotById(ctx.qText, ctx.id);
        document.querySelectorAll(`#quizSection [data-annot-id="${ctx.id}"]`).forEach(unwrapMark);
        renderNoteRails(document.getElementById('quizSection'));
        afterNoteChange();
    }
    closeNoteEditor();
}

export function setupAnnotations() {
    const toolbar = document.getElementById('annot-toolbar');
    if (!toolbar) return;

    let activeScope = null;    // tên vùng (data-annot) của vùng chọn hiện tại
    let activeScopeEl = null;  // phần tử vùng — để tìm các đoạn định dạng giao với vùng chọn
    const coarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

    let dockSide = null;       // cảm ứng: thanh ghim 'top' | 'bottom' (đối diện vùng chọn)
    const hide = () => { toolbar.classList.remove('show', 'annot-dock'); activeScope = null; activeScopeEl = null; dockSide = null; };
    const scopeOf = (node) => {
        const el = node && node.nodeType === 3 ? node.parentElement : node;
        return el && el.closest ? el.closest('#quizSection [data-annot]') : null;
    };

    // Định vị thông minh: mặc định nổi TRÊN vùng chọn; sát mép trên (hoặc trên máy
    // cảm ứng — nơi menu chọn chữ của hệ điều hành cũng nằm trên) thì lật XUỐNG DƯỚI;
    // luôn kẹp trong mép ngang màn hình để không bị cắt.
    const positionToolbar = (rect) => {
        toolbar.classList.add('show'); // hiện trước để đo được kích thước thật
        // Máy cảm ứng: menu Sao chép/Tra cứu của hệ điều hành hiện SÁT vùng chọn nên dễ che thanh nổi.
        // -> đặt thanh NGAY CẠNH vùng chọn nhưng lệch khỏi chỗ menu đó: menu thường nằm TRÊN vùng chọn (lật xuống dưới khi
        // vùng chọn sát mép trên) -> thanh nằm DƯỚI, cách ~44px để chừa chấm kéo chọn; vùng chọn sát đáy thì thanh nhảy lên
        // TRÊN menu. Không còn chỗ nào hợp lý mới ghim ở nửa màn hình đối diện (dock) như phương án cuối.
        if (coarsePointer) {
            const tw0 = toolbar.offsetWidth, th0 = toolbar.offsetHeight, m0 = 8;
            const bottomLimit = window.innerHeight - (document.body.classList.contains('has-mobile-nav') ? 112 : m0);
            const osAbove = rect.top >= 90;
            let top0 = null, below0 = true;
            if (osAbove && rect.bottom + 44 + th0 < bottomLimit) top0 = rect.bottom + 44;
            else if (!osAbove && rect.bottom + 100 + th0 < bottomLimit) top0 = rect.bottom + 100;
            else if (rect.top - 70 - th0 > 58) { top0 = rect.top - 70; below0 = false; }
            if (top0 !== null) {
                const x0 = Math.max(tw0 / 2 + m0, Math.min(window.innerWidth - tw0 / 2 - m0, rect.left + rect.width / 2));
                toolbar.classList.remove('annot-dock');
                toolbar.classList.toggle('annot-below', below0);
                toolbar.style.left = x0 + 'px';
                toolbar.style.top = top0 + 'px';
                return;
            }
            const mid = (rect.top + rect.bottom) / 2;
            if (!dockSide || (dockSide === 'bottom' && rect.bottom > window.innerHeight - 190) || (dockSide === 'top' && rect.top < 190)) {
                dockSide = mid < window.innerHeight / 2 ? 'bottom' : 'top';
            }
            toolbar.classList.remove('annot-below');
            toolbar.classList.add('annot-dock');
            toolbar.dataset.dock = dockSide;
            toolbar.style.left = '50%';
            toolbar.style.top = '';
            return;
        }
        toolbar.classList.remove('annot-dock');
        const tw = toolbar.offsetWidth, th = toolbar.offsetHeight;
        const margin = 8;
        let x = rect.left + rect.width / 2;
        x = Math.max(tw / 2 + margin, Math.min(window.innerWidth - tw / 2 - margin, x));
        const noRoomAbove = rect.top - th - 10 < margin;
        const roomBelow = rect.bottom + th + 10 < window.innerHeight - margin;
        const below = (coarsePointer && roomBelow) || (noRoomAbove && roomBelow);
        toolbar.classList.toggle('annot-below', below);
        toolbar.style.left = x + 'px';
        toolbar.style.top = below ? (rect.bottom + 10) + 'px' : (rect.top - 8) + 'px';
    };

    const onSelect = () => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) { hide(); return; }
        const text = sel.toString().trim();
        if (text.length < 1) { hide(); return; }
        // Vùng chọn phải nằm gọn trong MỘT vùng cho phép ghi chú
        const a = scopeOf(sel.anchorNode);
        const b = scopeOf(sel.focusNode);
        if (!a || a !== b) { hide(); return; }
        activeScope = a.getAttribute('data-annot');
        activeScopeEl = a;
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (!rect || (!rect.width && !rect.height)) { hide(); return; }
        positionToolbar(rect);
    };

    document.addEventListener('mouseup', () => setTimeout(onSelect, 10));
    document.addEventListener('touchend', () => setTimeout(onSelect, 10));
    // Chỉnh vùng chọn bằng bàn phím (Shift+mũi tên) / kéo chấm chọn trên mobile:
    // mouseup không bắn -> theo dõi selectionchange (debounce cho nhẹ máy)
    let selDebounce = 0;
    document.addEventListener('selectionchange', () => {
        clearTimeout(selDebounce);
        selDebounce = setTimeout(onSelect, 140);
    });
    // Cuộn trang khi thanh đang mở -> bám theo vị trí mới của vùng chọn
    window.addEventListener('scroll', () => {
        if (toolbar.classList.contains('show')) onSelect();
    }, true);

    // Giữ vùng chọn khi nhấn nút công cụ (đừng để mousedown xóa selection)
    toolbar.addEventListener('mousedown', (e) => e.preventDefault());

    toolbar.querySelectorAll('[data-annot-action]').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.getAttribute('data-annot-action');
            const sel = window.getSelection();
            const text = sel ? sel.toString().trim() : '';
            const question = state.questions[state.currentIndex];
            if (!sel || sel.rangeCount === 0 || !question || !activeScope || !activeScopeEl) return;
            const range = sel.getRangeAt(0);
            const scope = activeScope;
            const qText = annotKeyFor(question, scope);
            const scopeEl = activeScopeEl;

            // Vị trí (offset ký tự) của vùng chọn — TÍNH TRƯỚC khi đụng vào DOM để lưu
            // chuẩn xác. Gỡ/bọc thẻ inline không đổi số ký tự nên offset vẫn hợp lệ sau đó.
            const selStart = offsetInContainer(scopeEl, range.startContainer, range.startOffset);
            const selEnd = offsetInContainer(scopeEl, range.endContainer, range.endOffset);

            const isErase = type === 'erase';
            if (type === 'note') {
                // Đã có ghi chú giao với vùng chọn -> mở sửa cái đó; chưa có -> viết mới cho cụm từ đang bôi đen
                const rectSel = range.getBoundingClientRect();
                const existing = Array.from(scopeEl.querySelectorAll('.annot-note')).find(m => { try { return range.intersectsNode(m); } catch (e) { return false; } });
                sel.removeAllRanges();
                hide();
                if (existing) {
                    openNoteEditor({ mode: 'edit', qText, scope, id: existing.getAttribute('data-annot-id'), text: existing.textContent, note: existing.getAttribute('data-note') || '', rect: existing.getBoundingClientRect() });
                } else if (selStart >= 0 && selEnd > selStart && text) {
                    openNoteEditor({ mode: 'new', qText, scope, scopeEl, start: selStart, end: selEnd, text, rect: rectSel });
                }
                return;
            }
            // Tẩy: gỡ MỌI định dạng giao với vùng chọn. Áp định dạng mới: chỉ gỡ đoạn
            // TRÙNG LOẠI (bôi lại cùng màu = làm mới), các loại khác giữ nguyên để
            // CHỒNG LỚP được — highlight + in đậm + in nghiêng dùng chung một đoạn chữ.
            const overlapped = Array.from(scopeEl.querySelectorAll('.quiz-annot'))
                .filter(m => {
                    try { if (!range.intersectsNode(m)) return false; } catch (e) { return false; }
                    if (m.classList.contains('annot-note')) return false; // tẩy KHÔNG xóa ghi chú riêng (xóa trong khung ghi chú)
                    return isErase || (m.getAttribute('data-annot-type') || 'highlight') === type;
                });
            if (isErase && !overlapped.length) { hide(); return; } // tẩy vào vùng trắng: thôi

            // Kho cập nhật trước (nguồn sự thật), DOM sửa tại chỗ sau; DOM lỗi thì
            // vẽ lại cả câu — kho đã đúng nên render lại vẫn ra kết quả chuẩn.
            try {
                overlapped.forEach(m => removeAnnotEverywhere(qText, scope, m));
                if (!isErase && text.length >= 1) {
                    const hasPos = selStart >= 0 && selEnd > selStart;
                    const newId = hasPos
                        ? addAnnot(qText, scope, text, type, selStart, selEnd)
                        : addAnnot(qText, scope, text, type);
                    wrapRange(range, type, newId);
                }
                cleanupEmptyAnnots(scopeEl); // dọn mảnh rỗng do range chồng lấn cắt ngang
            } catch (e) {
                showQuestion(); // phương án lui: vẽ lại từ kho
            }
            sel.removeAllRanges();
            hide();
        });
    });

    // Bấm một dòng trên hàng ghi chú -> mở sửa (capture: dòng nằm trong ô đáp án thì không tính là chọn đáp án)
    document.addEventListener('click', (e) => {
        const ri = e.target.closest && e.target.closest('#quizSection .an-ri');
        if (!ri) return;
        e.preventDefault();
        e.stopPropagation();
        const more = e.target.closest('.an-more');
        if (more) { const open = !ri.querySelector('.an-tx').classList.toggle('is-clamp'); more.textContent = open ? 'Thu gọn' : 'Xem hết'; return; }
        const scopeEl = ri.parentElement.previousElementSibling;
        const id = ri.dataset.id, question = state.questions[state.currentIndex];
        const frags = id && scopeEl ? [...scopeEl.querySelectorAll(`[data-annot-id="${id}"]`)] : [];
        if (!frags.length || !question) return;   // ghi chú tĩnh của phòng: chỉ đọc
        const scope = scopeEl.getAttribute('data-annot');
        openNoteEditor({ mode: 'edit', qText: annotKeyFor(question, scope), scope, id, text: frags.map(f => f.textContent).join(''), note: frags[frags.length - 1].getAttribute('data-note') || '', rect: ri.getBoundingClientRect() });
    }, true);
    // Rê chuột lên cụm từ <-> dòng ghi chú: cả hai cùng sáng để biết dòng nào của cụm nào
    let litId = null;
    document.addEventListener('mouseover', (e) => {
        const t = e.target.closest && e.target.closest('#quizSection :is(.an-ri[data-id], .annot-note[data-annot-id])');
        const id = t ? (t.dataset.id || t.getAttribute('data-annot-id')) : null;
        if (id === litId) return;
        if (litId) noteEls(litId).forEach(x => x.classList.remove('is-lit'));
        litId = id;
        if (id) noteEls(id).forEach(x => x.classList.add('is-lit'));
    });

    // Bấm vào một đoạn đã ghi chú để gỡ nhanh (capture để không kích hoạt chọn đáp án)
    document.addEventListener('click', (e) => {
        const mark = e.target.closest && e.target.closest('.quiz-annot');
        if (!mark) return;
        const cont = mark.closest('#quizSection [data-annot]');
        if (!cont) return;
        // Đang bôi đen chữ (kết thúc kéo chọn trên chính đoạn ghi chú) -> đừng gỡ nhầm
        const curSel = window.getSelection();
        if (curSel && !curSel.isCollapsed && curSel.toString().trim()) return;
        e.preventDefault();
        e.stopPropagation();
        const question = state.questions[state.currentIndex];
        if (question && mark.classList.contains('annot-note')) {
            // Bấm cụm từ = ĐỌC trước (bóng thoại, đuôi chỉ vào đúng dòng vừa bấm), muốn sửa thì bấm Sửa
            const scope = cont.getAttribute('data-annot');
            const id = mark.getAttribute('data-annot-id');
            const frags = id ? [...cont.querySelectorAll(`[data-annot-id="${id}"]`)] : [mark];
            const rect = [...mark.getClientRects()].find(r => e.clientY >= r.top - 2 && e.clientY <= r.bottom + 2) || mark.getBoundingClientRect();
            openNoteEditor({ mode: 'view', qText: annotKeyFor(question, scope), scope, id, text: frags.map(f => f.textContent).join(''), note: mark.getAttribute('data-note') || '', rect });
            popIn([...noteEls(id)].filter(x => x.classList.contains('an-ri')));
            return;
        }
        if (question) {
            // Bấm đoạn lồng nhau: gỡ lớp TRONG CÙNG trước (closest), bấm tiếp gỡ lớp ngoài.
            // Gỡ theo id nên mọi mảnh bị tách đôi của cùng ghi chú biến mất đồng bộ.
            const scope = cont.getAttribute('data-annot');
            removeAnnotEverywhere(annotKeyFor(question, scope), scope, mark);
        }
    }, true);
    document.addEventListener('mousedown', (e) => { if (noteEd && !noteEd.box.contains(e.target)) closeNoteEditor(); });
    document.addEventListener('touchstart', (e) => { if (noteEd && !noteEd.box.contains(e.target)) closeNoteEditor(); }, { passive: true });
}
