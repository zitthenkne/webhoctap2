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
// + HÀNG GHI CHÚ ngay dưới DÒNG có cụm từ (renderNoteLines); bấm cụm từ / hàng ghi chú mở bóng thoại đọc (Sửa / Xóa).
// Mọi item mang `ts` (lần sửa cuối) và xóa thì để "bia mộ" (quiz_annot_del_<id>) -> đồng bộ đúng giữa các máy (quiz-study-store.js).

import { state } from '../quiz-state.js';
import { pushStudyToCloud } from './quiz-study-sync.js';
import { studyKeys } from '../quiz-study-store.js';
import { NOTE_TAGS, noteTagsOf, noteTextHtml, noteCount } from './quiz-notes-panel.js';
import { syncQuizNavPanel } from '../quiz-ui.js';
import { showQuestion } from './quiz-question-view.js';
import { showToast } from '../../../core/utils.js';

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
    try {
        localStorage.setItem(annotStorageKey(), JSON.stringify(store));
        return true;
    } catch (e) {
        showToast('Chưa lưu được ghi chú trên máy. Phần đang nhập vẫn được giữ; hãy kiểm tra dung lượng trống rồi bấm Lưu lại.', 'error', 6000);
        return false;
    }
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
const noteColor = (value) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : '';
function setNoteColors(el, colors = {}) {
    [['color', '--nt'], ['inkColor', '--nt-ink']].forEach(([key, prop]) => {
        const value = noteColor(colors[key]);
        if (value) el.style.setProperty(prop, value); else el.style.removeProperty(prop);
    });
}
function addAnnot(qText, scope, text, type, start, end, note, colors = {}) {
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
        if (noteColor(colors.color)) item.color = noteColor(colors.color);
        if (noteColor(colors.inkColor)) item.inkColor = noteColor(colors.inkColor);
        arr.push(item);
    }
    store[qText] = arr;
    if (!saveAnnotStore(store)) return null;
    pushStudyToCloud();
    return id;
}
function updateAnnotNote(qText, id, note, colors) {
    const store = getAnnotStore();
    const a = Array.isArray(store[qText]) && store[qText].find(x => x.id === id);
    if (!a) return false;
    a.note = note;
    if (colors) ['color', 'inkColor'].forEach(key => {
        if (noteColor(colors[key])) a[key] = noteColor(colors[key]); else delete a[key];
    });
    a.ts = Date.now();
    if (!saveAnnotStore(store)) return false;
    pushStudyToCloud();
    return true;
}
function removeAnnot(qText, scope, text, type) {
    const store = getAnnotStore();
    if (Array.isArray(store[qText])) {
        store[qText] = store[qText].filter(a => !(a.scope === scope && a.text === text && a.type === type));
        if (store[qText].length === 0) delete store[qText];
        if (!saveAnnotStore(store)) return false;
        pushStudyToCloud();
    }
    return true;
}
// Gỡ theo id (ghi chú mới đều có); mảnh DOM nào cũng mang data-annot-id nên khớp tuyệt đối
function removeAnnotById(qText, id) {
    const store = getAnnotStore();
    if (Array.isArray(store[qText])) {
        store[qText] = store[qText].filter(a => a.id !== id);
        if (store[qText].length === 0) delete store[qText];
        if (!saveAnnotStore(store)) return false;
        buryAnnotId(id);
        pushStudyToCloud();
    }
    return true;
}
// Gỡ một đoạn ghi chú khỏi cả KHO lẫn DOM (mọi mảnh cùng id biến mất theo);
// dữ liệu cũ không có id thì lui về khớp (scope, text, type).
function removeAnnotEverywhere(qText, scope, mark) {
    const id = mark.getAttribute('data-annot-id');
    const type = mark.getAttribute('data-annot-type') || 'highlight';
    if (id) {
        if (!removeAnnotById(qText, id)) return;
        document.querySelectorAll(`#quizSection [data-annot-id="${id}"]`).forEach(unwrapMark);
    } else {
        if (!removeAnnot(qText, scope, mark.textContent, type)) return;
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
    root.querySelectorAll('.annot-note[data-annot-id]').forEach(el => {
        el.onclick = () => {}; // WebKit cảm ứng cần listener trực tiếp để phát click cho span; xử lý ở document.
        el.classList.add('an-dup'); last.set(el.getAttribute('data-annot-id'), el);
    });
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
    renderNoteLines(document.getElementById('quizSection') || quizSection);   // vẽ lại một khối (phiếu chấm) vẫn đánh số theo cả câu
    relayNoteLines(350);   // dấu quét dữ kiện / ảnh / phông vừa chèn có thể đổi chỗ xuống dòng
}
// ---- Ghi chú hiện NGAY DƯỚI DÒNG có cụm từ (bản 5, 2026-10-23) ----
// Người dùng: hàng riêng nhưng phải ở đúng chỗ bôi đen, không gom một đống cuối khối. Mỗi ghi chú = một hàng .an-line chèn vào
// đúng CHỖ DÒNG ĐÓ VỐN XUỐNG DÒNG (ký tự đầu của dòng kế) -> dòng chứa cụm từ giữ nguyên, câu chữ không bị cắt giữa dòng; mũi nhọn
// mỗi chỗ xuống dòng là một dải .an-band, layoutBand xếp ghi chú dưới đúng cụm theo bề ngang thật — kiểu chú thích viết tay.
// Hàng là inline-flex rộng (100% - thụt) (ăn trọn một dòng; KHÔNG nhận vạch text-decoration của thẻ cha) và
// KHÔNG chứa chữ thật: số + lời ghi chú vẽ bằng ::before/::after content: attr() -> offset ghi chú, Range.toString, đọc to,
// quét dữ kiện, sao chép chữ đều không thấy nó. Bố cục đổi (cỡ khung, phông, dấu quét dữ kiện) thì vẽ lại.
// Ghi chú tĩnh của phòng đánh đề (<span data-note> trong nội dung đề) cũng có hàng, chỉ để đọc.
// Nhãn đầu dòng (CHUNG hệ nhãn ghi chú cá nhân: "⭐ ", "Dễ nhầm với: ", "Hỏi lại: "…) -> màu + ký hiệu trong bong bóng.
// Không nhãn thì màu theo nền (--nt). Nhãn đầu tiên theo thứ tự NOTE_TAGS thắng.
const TAG_LOOK = { 'Quan trọng': ['star', '★'], 'Dễ nhầm': ['trap', '≠'], 'Hỏi lại': ['ask', '?'] };   // "!" trong Quicksand đọc thành "1"
const tagLook = (note) => { const t = [...noteTagsOf(note)].find(x => TAG_LOOK[x]); return t ? TAG_LOOK[t] : null; };
const isInline = (el) => /^inline/.test(getComputedStyle(el).display) || el.tagName === 'BR';
// Khối chứa (đoạn / mục danh sách / ô bảng…) gần nhất của một nút, không vượt khỏi vùng
function blockOf(node, scope) {
    let el = node.nodeType === 3 ? node.parentElement : node;
    while (el && el !== scope && isInline(el)) el = el.parentElement;
    return el || scope;
}
// Chỗ chèn hàng cho cụm kết thúc ở `frag`: ký tự có nghĩa ĐẦU TIÊN nằm ở dòng dưới dòng chứa đuôi cụm (cùng khối);
// cụm ở cuối khối -> chèn cuối khối; vùng đang ẩn (không đo được) -> cuối khối.
function lineEndAfter(frag, scope) {
    const block = blockOf(frag, scope);
    const rs = frag.getClientRects();
    if (!rs.length) return { append: block };
    const line = rs[rs.length - 1];
    // Duyệt cả THẺ lẫn chữ sau cụm: ngắt dòng cứng <br> / thẻ khối (khoảng cách đoạn .quiz-md-gap, bảng, danh sách…) cũng là chỗ dòng kết thúc
    // — bỏ qua chúng thì dải ghi chú bị đẩy xuống sau cả khoảng trống giữa hai đoạn.
    const w = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    w.currentNode = frag;
    const r = document.createRange();
    let n;
    while ((n = w.nextNode())) {
        if (frag.contains(n)) continue;
        if (!block.contains(n)) break;
        if (n.nodeType === 1) {
            // hàng ghi chú của cụm trước CÙNG dòng đã nằm ở đây -> đứng ngay sau (các hàng liền nhau = một dải, giữ thứ tự)
            if (n.classList.contains('an-line')) {
                let lastRow = n;
                while (lastRow.nextSibling && lastRow.nextSibling.nodeType === 1 && lastRow.nextSibling.classList.contains('an-line')) lastRow = lastRow.nextSibling;
                return { after: lastRow };
            }
            if (n.tagName === 'BR') {
                let tail = n;
                while (tail.nextSibling?.nodeType === 1 && tail.nextSibling.classList.contains('an-line')) tail = tail.nextSibling;
                return { after: tail };
            }
            if (!isInline(n)) return { before: n };
            continue;
        }
        if (!n.nodeValue) continue;
        r.selectNodeContents(n);
        const all = r.getClientRects();
        if (all.length && all[all.length - 1].top < line.bottom - 2) continue;   // cả nút còn trên dòng này
        const v = n.nodeValue;
        for (let i = 0; i < v.length; i++) {
            if (/\s/.test(v[i])) continue;
            r.setStart(n, i); r.setEnd(n, i + 1);
            const c = r.getClientRects()[0];
            if (c && c.top >= line.bottom - 2) return { node: n, offset: i };
        }
    }
    return { append: block };
}
function liftSplit(text, offset, block) {
    let node = offset > 0 ? text.splitText(offset) : text, el = node.parentNode;
    while (el && el !== block) {
        // chỗ xuống dòng ngay ĐẦU thẻ -> đứng trước cả thẻ, khỏi tách
        let prev = node.previousSibling;
        while (prev && prev.nodeType === 3 && !prev.nodeValue) prev = prev.previousSibling;
        if (!prev) { node = el; el = el.parentNode; continue; }
        const right = el.cloneNode(false);
        right.setAttribute('data-an-split', '');
        right.removeAttribute('id');
        for (let cur = node; cur;) { const nx = cur.nextSibling; right.appendChild(cur); cur = nx; }
        el.after(right);
        node = right; el = right.parentNode;
    }
    return node;
}
function unsplit(row) {
    let a = row.previousSibling, b = row.nextSibling;
    const parent = row.parentNode;
    row.remove();
    while (a && b && a.nodeType === 1 && b.nodeType === 1 && b.hasAttribute('data-an-split') && a.tagName === b.tagName) {
        const aLast = a.lastChild, bFirst = b.firstChild;
        while (b.firstChild) a.appendChild(b.firstChild);
        b.remove();
        a = aLast; b = bFirst;
    }
    if (b && b.nodeType === 1 && b.hasAttribute('data-an-split') && !a) b.removeAttribute('data-an-split');   // nửa trước đã rỗng bị bỏ
    if (parent) try { parent.normalize(); } catch (e) {}
}
let _scopeRO = null;
const _scopeH = new WeakMap();
function clearNoteLines(root) {
    root.querySelectorAll('.an-band').forEach(unsplit);
    root.querySelectorAll('.an-line').forEach(unsplit);   // phòng hờ hàng lẻ ngoài dải
}
function renderNoteLines(root) {
    if (!root) return;
    clearNoteLines(root);
    markLastNoteFragments(root);
    const colors = new Map(Object.values(getAnnotStore()).flatMap(a => Array.isArray(a) ? a : []).map(a => [a.id, a]));
    root.querySelectorAll('.annot-note[data-annot-id]').forEach(sp => setNoteColors(sp, colors.get(sp.getAttribute('data-annot-id'))));
    if (!document.body.classList.contains('qz-notes-inline')) {
        // tắt hàng ghi chú: không chèn gì, chỉ đánh số bong bóng sau cụm (rê chuột / chạm để xem)
        let m = 0;
        const seen = new Map();
        root.querySelectorAll('[data-annot] span[data-note]').forEach(sp => {
            const k = sp.getAttribute('data-annot-id') || sp;
            if (!seen.has(k)) { const look = tagLook(sp.getAttribute('data-note') || ''); seen.set(k, [(look ? look[1] : '') + (++m), look]); }
            const [mark, look] = seen.get(k);
            sp.setAttribute('data-an', mark);
            if (look) sp.dataset.tag = look[0]; else delete sp.dataset.tag;
        });
        return;
    }
    // Chữ trong vùng xuống dòng khác đi mà bề ngang khung không đổi (nhãn "Bạn chọn" chen vào ô đáp án, ảnh tải xong, dấu quét
    // dữ kiện) -> theo dõi CHIỀU CAO từng vùng có ghi chú, đổi thì vẽ lại hàng (lần vẽ lại cho ra cùng chiều cao nên không lặp)
    if (window.ResizeObserver) {
        _scopeRO = _scopeRO || new ResizeObserver(ens => {
            if (ens.some(en => { const h = Math.round(en.contentRect.height), o = _scopeH.get(en.target); _scopeH.set(en.target, h); return o !== undefined && o !== h; })) relayNoteLines();
        });
        _scopeRO.disconnect();
        root.querySelectorAll('[data-annot]').forEach(sc => { if (sc.querySelector('span[data-note]')) _scopeRO.observe(sc); });
    }
    let n = 0;   // số liên tục cả câu (bong bóng khi TẮT hàng); khi hiện hàng chỉ dùng số nhỏ cho các cụm CHUNG một dòng
    root.querySelectorAll('[data-mk]').forEach(x => x.removeAttribute('data-mk'));
    root.querySelectorAll('[data-annot]').forEach(scope => {
        const keys = [];   // id (hoặc chính phần tử với ghi chú tĩnh), theo thứ tự tài liệu
        scope.querySelectorAll('span[data-note]').forEach(sp => { const k = sp.getAttribute('data-annot-id') || sp; if (!keys.includes(k)) keys.push(k); });
        // lấy mảnh NGAY LÚC xử lý: chèn hàng trước đó có thể đã tách một thẻ thành hai nửa
        const fragsOf = (k) => (typeof k === 'string' ? [...scope.querySelectorAll(`span[data-annot-id="${k}"]`)] : [k]);
        const placed = [];
        keys.forEach(k => {
            n++;
            const frags = fragsOf(k);
            if (!frags.length) return;
            const last = frags[frags.length - 1];
            const note = last.getAttribute('data-note') || '';
            const look = tagLook(note);
            const mark = (look ? look[1] : '') + n;
            frags.forEach(f => { f.setAttribute('data-an', mark); if (look) f.dataset.tag = look[0]; else delete f.dataset.tag; });
            const row = document.createElement('span');
            row.className = 'an-line';
            setNoteColors(row, colors.get(k));
            row.setAttribute('data-txt', note.replace(/->/g, '-\u2060>')); // giữ nguyên mũi tên văn bản khi cân dòng; không đổi nội dung lưu
            row.setAttribute('role', 'note');
            row.setAttribute('aria-label', 'Ghi chú cho “' + frags.map(f => f.textContent).join('').trim() + '”: ' + note);
            if (look) row.dataset.tag = look[0];
            if (typeof k === 'string') { row.dataset.id = k; row.tabIndex = 0; row.title = 'Bấm để xem / sửa ghi chú'; }
            else row.classList.add('is-static');
            const at = lineEndAfter(last, scope);
            if (at.node) { const tail = liftSplit(at.node, at.offset, blockOf(at.node, scope)); tail.parentNode.insertBefore(row, tail); }
            else if (at.before) at.before.before(row);
            else if (at.after) at.after.after(row);
            else at.append.appendChild(row);
            placed.push({ row, last });
        });
        // Gom các hàng đứng LIỀN nhau (chung một chỗ xuống dòng = cụm chung một dòng chữ) thành một DẢI .an-band
        const runs = [];
        placed.forEach(pl => {
            let prev = pl.row.previousSibling;
            while (prev && prev.nodeType === 3 && !prev.nodeValue.trim()) prev = prev.previousSibling;
            const run = runs[runs.length - 1];
            if (run && prev === run[run.length - 1].row) run.push(pl); else runs.push([pl]);
        });
        runs.forEach(run => {
            const band = makeBand();
            run[0].row.before(band);
            run.forEach(({ row, last }) => { row._last = last; row._dir = 'below'; band.appendChild(row); });
        });
    });
    // Lượt 1: xếp mọi dải; ghi chú không vừa ngay dưới cụm (làn đầu) -> thử khoảng trống NGAY TRÊN dòng của nó.
    // Lượt 2: xếp lại các dải bị đổi; ai không lên được thì mới xếp tầng (lúc đó có số ¹ ²).
    const fails = [];
    root.querySelectorAll('.an-band').forEach(b => fails.push(...layoutBand(b, true)));
    const dirty = new Set();
    fails.forEach(it => {
        const g = gutterAbove(it);
        if (g) { g.appendChild(it.row); it.row._dir = 'above'; dirty.add(g); }
        else it.row._force = true;
        dirty.add(it.band);
    });
    dirty.forEach(b => { if (!b.querySelector('.an-line')) unsplit(b); else layoutBand(b, false); });
    // Các dải phía trên có thể đổi chiều cao: đo đường nối sau khi toàn bộ bố cục đã ổn định.
    root.querySelectorAll('.an-band').forEach(drawNoteLinks);
}
const makeBand = () => { const b = document.createElement('span'); b.className = 'an-band'; return b; };
// Ký tự đầu của DÒNG chữ chứa rect (dòng có đuôi cụm) trong khối
function lineStartOf(rect, block) {
    const mid = (rect.top + rect.bottom) / 2;
    const w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const r = document.createRange();
    let n;
    while ((n = w.nextNode())) {
        if (!n.nodeValue.trim()) continue;
        r.selectNodeContents(n);
        const rs = r.getClientRects();
        if (!rs.length || rs[rs.length - 1].bottom < mid) continue;   // cả nút ở các dòng phía trên
        for (let i = 0; i < n.nodeValue.length; i++) {
            if (/\s/.test(n.nodeValue[i])) continue;
            r.setStart(n, i); r.setEnd(n, i + 1);
            const c = r.getClientRects()[0];
            if (c && c.bottom >= mid) return c.top <= mid ? { node: n, offset: i } : null;
        }
    }
    return null;
}
// Khoảng trống ngay TRÊN dòng có cụm = dải ở chỗ dòng đó bắt đầu (dùng chung với dải "dưới" của dòng phía trên nếu có).
// Dòng phía trên đã có ghi chú chiếm đúng khoảng ngang đó -> thôi (mũi tên lên / xuống chen nhau sẽ rối).
function gutterAbove(it) {
    if (!it.rect || !it.last) return null;
    const rects = it.last.getClientRects();
    if (!rects.length) return null;
    it.rect = rects[rects.length - 1]; // dải khác vừa đổi chiều cao có thể đã đẩy dòng nguồn xuống
    const scope = it.last.closest('[data-annot]');
    if (!scope) return null;
    const block = blockOf(it.last, scope);
    const st = lineStartOf(it.rect, block);
    if (!st) return null;
    const head = liftSplit(st.node, st.offset, block);
    const prevOf = (x) => { let q = x.previousSibling; while (q && q.nodeType === 3 && !q.nodeValue.trim()) q = q.previousSibling; return q; };
    let prev = prevOf(head), at = head;
    // Dòng ĐẦU của một mục danh sách (<li> hoặc div.quiz-li = [dấu • | .quiz-li-body] của parseMarkdown): chèn khối vào đầu
    // phần thân đẩy chữ tách khỏi dấu • -> đặt dải NGAY TRƯỚC cả mục (giữa hai mục)
    const item = !prev && block.closest('.quiz-li, li');
    if (item && scope.contains(item) && item !== scope) { at = item; prev = prevOf(item); }
    if (prev && prev.nodeType === 1 && prev.classList.contains('an-band')) {
        const rows = [...prev.querySelectorAll('.an-line:not(.is-side)')];
        const used = rows.reduce((sum, r) => sum + noteMinWidth(r._nat || r.offsetWidth, prev.clientWidth) + BAND_GAP, 0);
        return used + noteMinWidth(it.nat, prev.clientWidth) <= prev.clientWidth ? prev : null;
    }
    const g = makeBand();
    at.before(g);
    return g;
}
// Xếp ngang trước, tận dụng cả hai phía của điểm neo; hết chỗ mới thử dải trên rồi thêm tầng.
const BAND_GAP = 16;
const NOTE_LAYOUT_RULES = { shortLead: 24, breathingRoom: 40 };
const noteMinWidth = (nat, width) => Math.min(width, nat, Math.max(88, nat / 2 + 8));
// So sánh lần lượt, không cộng điểm khiến ưu tiên thấp lấn ưu tiên cao:
// 1. Không tràn / chồng, giữ bề rộng chữ tối đa (ràng buộc khi chia làn và chọn khoảng đặt).
// 2. Đường nối gần cụm: tránh phần kéo ngang vượt 24px ngoài vùng highlight.
// 3. Chừa 40px giữa các ghi chú nếu còn chỗ, thay vì dồn sát mức tối thiểu 16px.
// 4. Cùng đạt các điều kiện trên: ưu tiên đọc sang phải.
// 5. Cuối cùng mới chọn đường nối ngắn nhất trong các phương án tương đương.
function noteLanePriority(placed) {
    const excess = placed.map(p => Math.max(0, p.distance - NOTE_LAYOUT_RULES.shortLead));
    const ordered = [...placed].sort((a, b) => a.left - b.left);
    const crowded = ordered.slice(1).reduce((sum, p, i) => sum + Math.max(0,
        NOTE_LAYOUT_RULES.breathingRoom - (p.left - ordered[i].left - ordered[i].it.width)), 0);
    return [Math.max(0, ...excess), excess.reduce((sum, v) => sum + v, 0), crowded,
        placed.filter(p => p.trailing).length, placed.reduce((sum, p) => sum + p.distance, 0)];
}
function compareNotePriority(a, b) {
    for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > .01) return a[i] - b[i];
    return 0;
}
function packNoteLane(items, width) {
    if (!items.length) return;
    const total = items.reduce((sum, it) => sum + it.nat, 0);
    const minimum = items.reduce((sum, it) => sum + noteMinWidth(it.nat, width), 0);
    const available = Math.max(0, width - BAND_GAP * (items.length - 1));
    const shrink = total > minimum ? Math.min(1, Math.max(0, (total - available) / (total - minimum))) : 0;
    items.forEach(it => {
        it.width = Math.floor(it.nat - shrink * (it.nat - noteMinWidth(it.nat, width)));
    });
    // Thử cả hai chiều xếp, và cả hai mép nối của từng ghi chú. Ghi chú sau có thể nhường chỗ cho ghi chú trước.
    const sweep = (reverse, seed) => {
        const order = reverse ? [...items].reverse() : items;
        let edge = reverse ? width : 0;
        let remaining = items.reduce((sum, it) => sum + it.width, 0) + BAND_GAP * (items.length - 1);
        const placed = [];
        for (const it of order) {
            remaining -= it.width;
            const lo = reverse ? remaining : edge, hi = reverse ? edge - it.width : width - remaining - it.width;
            const choices = [false, true].flatMap(trailing => {
                const lead = it.lead || 26;
                const offset = trailing ? it.width - lead + 16 : lead - 16;
                const positions = [it.x - offset, (it.x0 ?? it.x) - offset, (it.x1 ?? it.x) - offset];
                const neighbor = placed[placed.length - 1];
                if (neighbor) positions.push(reverse ? neighbor.left - NOTE_LAYOUT_RULES.breathingRoom - it.width
                    : neighbor.left + neighbor.it.width + NOTE_LAYOUT_RULES.breathingRoom);
                return positions.map(position => {
                    const left = Math.max(lo, Math.min(hi, position)), turn = left + offset;
                    const distance = Math.max((it.x0 ?? it.x) - turn, 0, turn - (it.x1 ?? it.x));
                    const candidate = { it, left, trailing, distance };
                    return { ...candidate, priority: noteLanePriority([...placed, candidate]) };
                });
            });
            const best = placed.length ? choices.reduce((a, b) => compareNotePriority(b.priority, a.priority) < 0 ? b : a) : choices[seed];
            placed.push(best);
            edge = reverse ? best.left - BAND_GAP : best.left + it.width + BAND_GAP;
            remaining -= BAND_GAP;
        }
        return { placed, priority: noteLanePriority(placed) };
    };
    // Giữ cả điểm neo đầu / giữa / cuối cho ghi chú đầu tiên, để nó có thể dịch nhường chỗ cho hàng xóm.
    let best = null;
    for (const reverse of [false, true]) for (let seed = 0; seed < 6; seed++) {
        const candidate = sweep(reverse, seed);
        if (!best || compareNotePriority(candidate.priority, best.priority) < 0) best = candidate;
    }
    best.placed.forEach(({ it, left, trailing, distance }) => Object.assign(it, { left, trailing, leaderDistance: distance }));
}
function measureBalancedNoteWidth(row, limit) {
    const style = getComputedStyle(row, '::after'), box = getComputedStyle(row);
    const padding = parseFloat(box.paddingLeft) + parseFloat(box.paddingRight);
    const probe = document.createElement('span');
    Object.assign(probe.style, {
        position: 'fixed', left: '-10000px', top: '0', visibility: 'hidden', pointerEvents: 'none', display: 'block',
        width: Math.max(1, limit - padding) + 'px', font: style.font, letterSpacing: style.letterSpacing,
        lineHeight: style.lineHeight, whiteSpace: style.whiteSpace, overflowWrap: style.overflowWrap, textWrap: style.textWrap
    });
    probe.textContent = row.getAttribute('data-txt');
    document.body.appendChild(probe);
    const range = document.createRange();
    range.selectNodeContents(probe);
    const lines = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0);
    probe.remove();
    // Balance chỉ đổi chỗ ngắt, không thu khung. Thu theo dòng THẬT để phần trống bên phải được dùng khi định vị lại.
    // Chỉ thu khi đủ toàn bộ nội dung trong tối đa hai dòng; không làm tăng số dòng / thay đổi phần bị clamp.
    return lines.length && lines.length <= 2 ? Math.min(limit, Math.ceil(Math.max(...lines.map(r => r.width)) + padding) + 2) : limit;
}
function layoutBand(band, allowFail) {
    const W = band.clientWidth;
    if (!W) return [];
    band.classList.add('is-laid');
    const br = band.getBoundingClientRect(), bl = br.left;
    const items = [...band.querySelectorAll('.an-line')].map(row => {
        row.classList.remove('is-side', 'is-above', 'is-trailing');
        row.removeAttribute('data-mk');
        if (row._last) row._last.removeAttribute('data-mk');
        row.style.left = row.style.top = '';
        row.style.width = 'max-content';
        const singleLineNat = Math.ceil(row.getBoundingClientRect().width) + 2;
        const singleLine = row.offsetHeight <= parseFloat(getComputedStyle(row).lineHeight) + 1;
        const nat = singleLineNat > W ? measureBalancedNoteWidth(row, W) : singleLineNat;
        row._nat = nat;
        row.style.width = '';
        const lr = row._last ? row._last.getClientRects() : [];
        const rect = lr.length ? lr[lr.length - 1] : null;
        const inset = rect ? Math.min(6, rect.width / 2) : 0;
        return { row, band, last: row._last, rect, nat, singleLineNat, singleLine, lead: parseFloat(getComputedStyle(row).paddingLeft), up: row._dir === 'above',
            x: rect ? (rect.left + rect.right) / 2 - bl : W / 2,
            x0: rect ? rect.left - bl + inset : 0, x1: rect ? rect.right - bl - inset : W };
    });
    const below = items.filter(i => !i.up && i.rect);
    // Khoảng trống cùng dòng ở hai mép: chỉ dùng nếu đủ nguyên một dòng ghi chú.
    const extremes = [below.reduce((a, i) => !a || i.rect.left < a.rect.left ? i : a, null),
        below.reduce((a, i) => !a || i.rect.right > a.rect.right ? i : a, null)];
    [1, 0].forEach(side => {
        const it = extremes[side]; // hai mép cùng phù hợp thì ưu tiên đọc sang phải
        if (!it || it.side) return;
        const scope = it.last.closest('[data-annot]');
        const r = document.createRange();
        r.selectNodeContents(blockOf(it.last, scope));
        const mid = (it.rect.top + it.rect.bottom) / 2;
        const rs = [...r.getClientRects()].filter(c => c.width && c.top <= mid && c.bottom >= mid);
        const edge = side ? Math.max(it.rect.right, ...rs.map(c => c.right)) - bl : Math.min(it.rect.left, ...rs.map(c => c.left)) - bl;
        const distance = side ? edge - (it.rect.right - bl) : it.rect.left - bl - edge;
        const sideWidth = it.singleLineNat - it.lead;
        if (it.singleLine && distance <= 32 && sideWidth + 24 <= (side ? W - edge : edge)) {
            Object.assign(it, { side: true, width: sideWidth, left: side ? edge + 24 : edge - 24 - sideWidth });
            it.row.classList.add('is-side');
        }
    });
    const lanes = [], fails = [];
    // Giữ thứ tự ngang của cụm từ để các đường nối cùng dải không bắt chéo nhau.
    items.filter(i => !i.side).sort((a, b) => a.x - b.x).forEach(it => {
        const lane = lanes.find(group => group.reduce((sum, x) => sum + noteMinWidth(x.nat, W) + BAND_GAP, 0) + noteMinWidth(it.nat, W) <= W);
        if (lane) lane.push(it);
        else if (lanes.length && allowFail && !it.up && !it.row._force) { it.skip = true; fails.push(it); }
        else lanes.push([it]);
    });
    // Hết cả hai hướng gần cụm trên làn hiện tại: thử khoảng trống TRÊN dòng trước khi buộc nối xa / thêm tầng dưới.
    lanes.forEach(group => {
        packNoteLane(group, W);
        while (allowFail && group.length > 1) {
            const blocked = group.filter(it => !it.up && !it.row._force && it.leaderDistance > NOTE_LAYOUT_RULES.shortLead)
                .sort((a, b) => b.leaderDistance - a.leaderDistance)[0];
            if (!blocked) break;
            blocked.skip = true;
            fails.push(blocked);
            group.splice(group.indexOf(blocked), 1);
            packNoteLane(group, W);
        }
    });
    // Đánh số trước khi đo chiều cao: số cũng chiếm bề ngang, có thể làm lời ghi chú xuống dòng.
    if (lanes.length > 1) lanes.flat().forEach((it, j) => {
        it.row.setAttribute('data-mk', j + 1);
        if (it.last) it.last.setAttribute('data-mk', j + 1);
    });
    let top = lanes.length ? 4 : 0;
    lanes.forEach(group => {
        group.sort((a, b) => a.x - b.x);
        group.forEach(it => {
            it.row.classList.toggle('is-above', it.up);
            it.row.classList.toggle('is-trailing', it.trailing);
            Object.assign(it.row.style, { left: it.left + 'px', width: it.width + 'px', top: top + 'px' });
        });
        top += Math.max(...group.map(it => it.row.offsetHeight)) + 8;
    });
    items.filter(i => i.side).forEach(it => Object.assign(it.row.style, {
        left: it.left + 'px', width: it.width + 'px', top: Math.round(it.rect.top - br.top + (it.rect.height - it.row.offsetHeight) / 2) + 'px'
    }));
    band.style.height = top + 'px';
    band.classList.toggle('is-flat', !top);
    return fails;
}
function drawNoteLinks(band) {
    band.querySelector('.an-links')?.remove();
    if (!band.classList.contains('is-laid')) return;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.classList.add('an-links');
    svg.setAttribute('aria-hidden', 'true');
    const br = band.getBoundingClientRect();
    band.querySelectorAll('.an-line').forEach(row => {
        const rs = row._last ? [...row._last.getClientRects()] : [];
        if (!rs.length) return;
        const rect = rs[rs.length - 1], rr = row.getBoundingClientRect();
        const up = row._dir === 'above', side = row.classList.contains('is-side'), trailing = row.classList.contains('is-trailing');
        const flow = trailing ? -1 : 1;
        const style = getComputedStyle(row), firstLine = Math.min(parseFloat(style.lineHeight), rr.height);
        const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        let sx, sy, ex, ey;
        if (side) {
            const right = rr.left >= rect.right;
            sx = right ? rect.right + 3 : rect.left - 3;
            ex = right ? rr.left - 4 : rr.right + 4;
            sy = (rect.top + rect.bottom) / 2; ey = rr.top + firstLine / 2;
        } else {
            ex = trailing ? rr.right - parseFloat(style.paddingRight) + 4 : rr.left + parseFloat(style.paddingLeft) - 4;
            ey = rr.top + firstLine / 2;
            sx = clamp(ex - flow * 12, rect.left + Math.min(6, rect.width / 2), rect.right - Math.min(6, rect.width / 2));
            sy = up ? rect.top - 2 : rect.bottom + 2;
        }
        sx -= br.left; ex -= br.left; sy -= br.top; ey -= br.top;
        const path = document.createElementNS(ns, 'path');
        let curve, angle;
        if (side) {
            const bend = (sx + ex) / 2;
            curve = `M${sx},${sy} C${bend},${sy - 3} ${bend},${ey + 3} ${ex},${ey}`;
            angle = Math.atan2(-3, ex - bend);
            path.dataset.shape = 'side';
        } else {
            // Móc cong ở mép trái hoặc phải gần cụm từ nhất; đầu tên luôn sát chữ trên cùng hàng.
            const turnX = ex - flow * 12, railY = (up ? rr.bottom + 3 : rr.top - 3) - br.top;
            const turnY = ey + (up ? 9 : -9);
            curve = `M${sx},${sy} C${sx},${railY} ${turnX},${railY} ${turnX},${turnY} Q${turnX},${ey} ${ex},${ey}`;
            angle = trailing ? Math.PI : 0;
            path.dataset.shape = Math.abs(sx - turnX) < 14 ? 'hook' : 'curve';
        }
        // Đuôi ở cụm highlight, đầu nhọn kết thúc ngay trước chữ ghi chú.
        const wing = (a) => `${ex - 4 * Math.cos(a)},${ey - 4 * Math.sin(a)}`;
        path.setAttribute('d', `${curve} M${wing(angle - .55)} L${ex},${ey} L${wing(angle + .55)}`);
        path.dataset.pointsTo = 'note';
        // Giữ biến CSS sống để mũi tên đổi cùng chữ khi đổi nền / sáng tối, kể cả màu nhãn và màu tự chọn.
        if (row.dataset.tag) path.dataset.tag = row.dataset.tag;
        setNoteColors(path, { color: row.style.getPropertyValue('--nt'), inkColor: row.style.getPropertyValue('--nt-ink') });
        path.style.stroke = 'var(--nt-ink)';
        svg.appendChild(path);
    });
    band.prepend(svg);
}
// Bố cục đổi (xoay máy, kéo khung, phông Quicksand tải xong, dấu quét dữ kiện chèn vào đề) -> dòng xuống chỗ khác -> vẽ lại hàng
let _relayT = 0;
function relayNoteLines(delay = 120) {
    clearTimeout(_relayT);
    _relayT = setTimeout(() => {
        const sec = document.getElementById('quizSection');
        if (sec && sec.querySelector('span[data-note]')) renderNoteLines(sec);
    }, delay);
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
    if (!(note ? updateAnnotNote(qText, id, note) : removeAnnotById(qText, id))) return;
    const frags = document.querySelectorAll(`#quizSection [data-annot-id="${id}"]`);
    if (frags.length) {
        frags.forEach(f => (note ? f.setAttribute('data-note', note) : unwrapMark(f)));
        renderNoteLines(document.getElementById('quizSection'));
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
const noteEls = (id) => document.querySelectorAll(`#quizSection [data-annot-id="${id}"], #quizSection .an-line[data-id="${id}"]`);
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
// Rời ô viết / chuyển câu: giữ nội dung đã nhập. Hủy và Escape vẫn bỏ phần sửa.
export function dismissNoteEditor() {
    if (noteEd?.ta && tidyNote(noteEd.ta.value)) return saveNoteEditor();
    closeNoteEditor();
    return true;
}
// ctx.mode: 'view' (bấm cụm từ: bóng thoại ĐỌC, không bật bàn phím điện thoại) · 'edit' · 'new'
function openNoteEditor(ctx) {
    if (!dismissNoteEditor()) return;
    const view = ctx.mode === 'view';
    const saved = ctx.id ? getAnnotsFor(ctx.qText).find(a => a.id === ctx.id) : null;
    const colors = { color: noteColor(saved?.color), inkColor: noteColor(saved?.inkColor) };
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
            + '</div>'
            + '<div class="anp-colors" role="group" aria-label="Màu ghi chú">'
            + '<div class="anp-palette">'
            + [['#B9A2F0', '#6A4FB8', 'Tím'], ['#FF8FB8', '#C8487A', 'Hồng'], ['#6FD1AE', '#23805F', 'Xanh lá'], ['#7EC0EE', '#2D6FA3', 'Xanh dương'], ['#F2BE2E', '#8C6500', 'Vàng'], ['#F79A5E', '#B0551C', 'Cam']]
                .map(([color, ink, name]) => `<button type="button" data-note-color="${color}" data-note-ink="${ink}" style="--swatch:${color}" aria-label="Màu ${name.toLowerCase()}" title="${name}"></button>`).join('')
            + '<button type="button" class="anp-auto" data-anp="auto-color">Tự động</button></div>'
            + '<div class="anp-color-fields"><label>Vạch nhấn <input type="color" data-note-field="color" aria-label="Màu vạch nhấn"></label>'
            + '<label>Chữ & mũi tên <input type="color" data-note-field="inkColor" aria-label="Màu chữ và mũi tên"></label></div></div>')
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
    const fit = () => { box.style.overflowY = ''; if (box.scrollHeight > box.clientHeight + 1) box.style.overflowY = 'auto'; };
    const grow = () => {
        if (!ta) return;
        ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 4, window.innerHeight * 0.4) + 'px';
        const on = noteTagsOf(ta.value);
        box.querySelectorAll('[data-anp-tag]').forEach(b => b.classList.toggle('is-on', on.has(QUICK_TAGS[+b.dataset.anpTag].label)));
        fit();
    };
    if (ta) { ta.addEventListener('input', grow); grow(); } else fit();
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
    noteEd = { box, ta, ctx, colors };
    const previewColors = () => {
        setNoteColors(box, colors);
        if (colors.color) box.style.setProperty('--hue-lav', colors.color); else box.style.removeProperty('--hue-lav');
        if (colors.inkColor) box.style.setProperty('--ink-lav', colors.inkColor); else box.style.removeProperty('--ink-lav');
        box.querySelectorAll('[data-note-field]').forEach(input => { input.value = colors[input.dataset.noteField] || (input.dataset.noteField === 'color' ? '#b9a2f0' : '#6a4fb8'); });
        box.querySelectorAll('[data-note-color]').forEach(b => b.setAttribute('aria-pressed', String(noteColor(b.dataset.noteColor) === colors.color && noteColor(b.dataset.noteInk) === colors.inkColor)));
        box.querySelector('[data-anp="auto-color"]')?.setAttribute('aria-pressed', String(!colors.color && !colors.inkColor));
    };
    previewColors();
    box.querySelectorAll('[data-note-field]').forEach(input => input.addEventListener('input', () => { colors[input.dataset.noteField] = input.value; previewColors(); }));
    if (ta) setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 30);
    else setTimeout(() => box.querySelector('[data-anp="edit"]')?.focus({ preventScroll: true }), 30);
    box.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        if (e.target.closest('[data-anp-tag], [data-note-color]')) e.preventDefault();   // giữ con trỏ khi bấm nhãn / bảng màu
    });
    box.addEventListener('click', (e) => {
        const swatch = e.target.closest('[data-note-color]');
        if (swatch) { colors.color = noteColor(swatch.dataset.noteColor); colors.inkColor = noteColor(swatch.dataset.noteInk); previewColors(); return; }
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
        else if (act === 'auto-color') { colors.color = colors.inkColor = ''; previewColors(); }
        else if (act === 'save') saveNoteEditor();
        else if (act === 'del') deleteNoteEditor();
        else if (act === 'edit') openNoteEditor({ ...ctx, mode: 'edit' });
        else if (act === 'all') { closeNoteEditor(); import('./quiz-notes-all.js').then(m => m.openAllNotes({ filter: 'phrase' })); }
    });
    box.addEventListener('keydown', (e) => {
        e.stopPropagation(); // đừng kích hoạt phím tắt A–D / mũi tên của trang làm bài
        if (e.key === 'Escape') closeNoteEditor();
        else if (ta && e.target === ta && e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); saveNoteEditor(); }   // Enter chốt chữ đang ghép (Telex / VNI) thì chưa lưu; Shift+Enter = xuống dòng
    });
}
function saveNoteEditor() {
    if (!noteEd) return true;
    const { ta, ctx, colors } = noteEd;
    if (!ta) return true;
    const note = tidyNote(ta.value);
    if (ctx.mode === 'edit' && !note) return deleteNoteEditor();
    const sec = document.getElementById('quizSection');
    if (ctx.mode === 'edit') {
        if (!updateAnnotNote(ctx.qText, ctx.id, note, colors)) return false;
        closeNoteEditor(); // chỉ đóng sau khi lưu thành công, trước khi vẽ lại câu
        document.querySelectorAll(`#quizSection [data-annot-id="${ctx.id}"]`).forEach(el => el.setAttribute('data-note', note));
        renderNoteLines(sec);
        popIn(noteEls(ctx.id));
    } else if (note) {
        const id = addAnnot(ctx.qText, ctx.scope, ctx.text, 'note', ctx.start, ctx.end, note, colors);
        if (!id) return false;
        closeNoteEditor();
        if (ctx.scopeEl && ctx.scopeEl.isConnected) {
            clearNoteLines(ctx.scopeEl);
            wrapOffsetRange(ctx.scopeEl, ctx.start, ctx.end, 'note', id, note);
            cleanupEmptyAnnots(ctx.scopeEl);
            markLastNoteFragments(ctx.scopeEl);
            renderNoteLines(sec);
            popIn(noteEls(id));
        } else showQuestion();
    } else closeNoteEditor();
    afterNoteChange();
    return true;
}
function deleteNoteEditor() {
    if (!noteEd) return true;
    const { ctx } = noteEd;
    if (ctx.mode !== 'new') {
        if (!removeAnnotById(ctx.qText, ctx.id)) return false;
        document.querySelectorAll(`#quizSection [data-annot-id="${ctx.id}"]`).forEach(unwrapMark);
        renderNoteLines(document.getElementById('quizSection'));
        afterNoteChange();
    }
    closeNoteEditor();
    return true;
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

    // Bấm hàng ghi chú -> bóng thoại đọc (đủ chữ, Sửa / Xóa). Capture: hàng nằm trong ô đáp án thì không tính là chọn đáp án;
    // nhấn giữ trên hàng cũng không được thành "gạch đáp án" (pointerdown / contextmenu chặn từ document).
    const rowOf = (e) => e.target && e.target.closest && e.target.closest('#quizSection .an-line');
    ['pointerdown', 'contextmenu'].forEach(t => document.addEventListener(t, (e) => { if (rowOf(e)) e.stopPropagation(); }, true));
    document.addEventListener('click', (e) => {
        const row = rowOf(e);
        if (!row) return;
        e.preventDefault();
        e.stopPropagation();
        const scopeEl = row.closest('[data-annot]');
        const id = row.dataset.id, question = state.questions[state.currentIndex];
        const frags = id && scopeEl ? [...scopeEl.querySelectorAll(`[data-annot-id="${id}"]`)] : [];
        if (!frags.length || !question) return;   // ghi chú tĩnh của phòng: chỉ đọc
        const scope = scopeEl.getAttribute('data-annot');
        openNoteEditor({ mode: 'view', qText: annotKeyFor(question, scope), scope, id, text: frags.map(f => f.textContent).join(''), note: frags[frags.length - 1].getAttribute('data-note') || '', rect: row.getBoundingClientRect() });
        popIn(frags);
    }, true);
    document.addEventListener('keydown', (e) => {
        const row = rowOf(e);
        if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); row.click(); }
    }, true);
    // Bố cục đổi -> chỗ xuống dòng đổi -> vẽ lại hàng ghi chú
    const secEl = document.getElementById('quizSection');
    if (secEl && window.ResizeObserver) {
        let w0 = 0;
        new ResizeObserver(([en]) => { const w = Math.round(en.contentRect.width); if (w !== w0) { w0 = w; relayNoteLines(); } }).observe(secEl);
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => relayNoteLines(0));
    // phông viết tay chỉ được tải khi hàng ghi chú đầu tiên xuất hiện -> đo lại bề rộng chữ khi nó tải xong
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => relayNoteLines(0));
    // bật / tắt "Hiện ghi chú cụm từ" (body.qz-notes-inline) -> chèn / gỡ hàng
    let inl = document.body.classList.contains('qz-notes-inline');
    new MutationObserver(() => {
        const now = document.body.classList.contains('qz-notes-inline');
        if (now !== inl) { inl = now; const sec = document.getElementById('quizSection'); if (sec) renderNoteLines(sec); }
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    // Rê chuột lên cụm từ <-> hàng ghi chú: cả hai cùng sáng để biết hàng nào của cụm nào
    let litId = null;
    document.addEventListener('mouseover', (e) => {
        const t = e.target.closest && e.target.closest('#quizSection :is(.an-line[data-id], .annot-note[data-annot-id])');
        const id = t ? (t.dataset.id || t.getAttribute('data-annot-id')) : null;
        if (id === litId) return;
        if (litId) noteEls(litId).forEach(x => x.classList.remove('is-lit'));
        litId = id;
        if (id) noteEls(id).forEach(x => x.classList.add('is-lit'));
    });

    // Bấm vào một đoạn đã ghi chú để gỡ nhanh (capture để không kích hoạt chọn đáp án)
    document.addEventListener('click', (e) => {
        const mark = e.target.closest && e.target.closest('.quiz-annot');
        if (!mark || e.target.closest('.an-line')) return;   // hàng ghi chú có thể nằm TRONG một đoạn tô (dòng kế bắt đầu giữa đoạn đó)
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
            popIn([...noteEls(id)].filter(x => x.classList.contains('an-line')));
            return;
        }
        // Đang bật bút: chạm đoạn tô = hiện thanh đổi nhanh (màu / ghi chú / gỡ) — chạm nhầm bằng bút không làm mất đoạn tô
        if (question && showPenQuick && document.body.classList.contains('qz-pen-on') && mark.getAttribute('data-annot-id')) {
            showPenQuick(cont, mark.getAttribute('data-annot-id'));
            return;
        }
        if (question) {
            // Bấm đoạn lồng nhau: gỡ lớp TRONG CÙNG trước (closest), bấm tiếp gỡ lớp ngoài.
            // Gỡ theo id nên mọi mảnh bị tách đôi của cùng ghi chú biến mất đồng bộ.
            const scope = cont.getAttribute('data-annot');
            removeAnnotEverywhere(annotKeyFor(question, scope), scope, mark);
        }
    }, true);
    document.addEventListener('mousedown', (e) => { if (noteEd && !noteEd.box.contains(e.target)) dismissNoteEditor(); });
    document.addEventListener('touchstart', (e) => { if (noteEd && !noteEd.box.contains(e.target)) dismissNoteEditor(); }, { passive: true });
    setupPenMode();
}

// ---- BÚT TÔ NHANH (2026-10-24, làm lại giao diện 2026-10-25) ----
// Người dùng: "bật một nút, rồi lấy Apple Pencil di ngang qua chữ là tô luôn / ghi chú luôn cho cụm đó".
// Bật bằng nút #pen-btn ở hàng công cụ đầu thẻ (cạnh Nháp, Máy tính) hoặc phím J. ĐANG BẬT mới hiện thanh ngang giữa đáy màn hình
// (#annot-pen-dock, kiểu Markup của iPad): xòe công cụ, nút chính ghi rõ bút đang làm gì ("Tô vàng", "Tẩy"…). 2026-10-26: bỏ viên
// "Bút tô" nổi thường trực lúc tắt (người dùng: "lơ lửng, chiếm chỗ"). 2026-10-26 (lần 2): dời về GÓC DƯỚI TRÁI (cạnh nút Ngựa thì
// chỉnh) vì giữa đáy đè chữ / nút Câu tiếp; nút chính bấm = thu gọn / xòe hộp bút (tắt bằng ×), đang vuốt thì hộp bút mờ đi. Vuốt BÚT (Apple Pencil / bút cảm ứng) hoặc kéo CHUỘT qua chữ trong vùng [data-annot]:
// - tô vàng / xanh lá / xanh dương / gạch chân: thả bút là lưu (cùng kho, cùng đồng bộ với thanh bôi đen). Vuốt nối vào đoạn đã
//   tô cùng màu -> GỘP thành một đoạn.
// - vuốt xong GIỮ YÊN bút một nhịp (~0,55 s) = tô + mở luôn khung ghi chú cho cụm đó (xem trước đổi sang màu ghi chú).
// - ghi chú: thả bút mở khung viết ghi chú cho đúng cụm vừa vuốt (cụm đã có ghi chú -> mở sửa).
// - tẩy: vuốt qua là gỡ ĐÚNG phần bị vuốt (đoạn tô dài bị tẩy giữa -> còn lại hai đầu). Không đụng ghi chú cụm từ.
// Sau mỗi nét / khi chạm đoạn đã tô: HÀNG THAO TÁC ngay trên thanh đáy (ghi chú, đổi màu, gỡ) — nằm ở đáy, không nổi đè lên chữ.
// Ngón tay mặc định vẫn CUỘN trang như thường (chống tì tay); bật "Ngón tay cũng tô" cho máy không có bút.
// Vuốt bám theo DÒNG đang tô (lệch tới gần một dòng vẫn ở dòng cũ, vuốt lố ra lề dừng ở cuối dòng), tự nới tới trọn từ ở hai đầu;
// đặt bút hơi lệch ra lề sát chữ vẫn ăn. Chạm bút (không vuốt) = bấm như thường (chọn đáp án…).
// Hoàn tác từng nét: nút ↶, Ctrl/⌘+Z, hoặc chạm 2 ngón.
const PEN_KEY = 'quiz_pen_mode';
const PEN_TOOLS = ['highlight', 'hl-green', 'hl-blue', 'underline', 'note', 'erase'];
const PEN_LABEL = { highlight: 'Tô vàng', 'hl-green': 'Tô xanh lá', 'hl-blue': 'Tô xanh dương', underline: 'Gạch chân', note: 'Ghi chú', erase: 'Tẩy' };
const isWordCh = (c) => !!c && /[\p{L}\p{M}\p{N}]/u.test(c);
function scopeTextOf(scopeEl) { return collectTextNodes(scopeEl).map(n => n.nodeValue).join(''); }
// Nới [s, e) ra trọn từ ở hai đầu rồi bỏ khoảng trắng thừa
function snapToWords(txt, s, e) {
    if (s > e) [s, e] = [e, s];
    while (s > 0 && isWordCh(txt[s - 1]) && isWordCh(txt[s])) s--;
    while (e < txt.length && isWordCh(txt[e]) && isWordCh(txt[e - 1])) e++;
    if (s === e && isWordCh(txt[s])) { while (e < txt.length && isWordCh(txt[e])) e++; while (s > 0 && isWordCh(txt[s - 1])) s--; }
    while (s < e && /\s/.test(txt[s])) s++;
    while (e > s && /\s/.test(txt[e - 1])) e--;
    return [s, e];
}
function rangeFromOffsets(scopeEl, from, to) {
    const nodes = collectTextNodes(scopeEl);
    const a = locateInNodes(nodes, from, false), b = locateInNodes(nodes, to, true);
    if (!a || !b) return null;
    try { const r = document.createRange(); r.setStart(a.node, a.offset); r.setEnd(b.node, b.offset); return r; } catch (e) { return null; }
}
// Điểm (x, y) trên màn hình -> (node, offset) của con trỏ chữ gần nhất
function caretAtPoint(x, y) {
    try {
        if (document.caretPositionFromPoint) {
            const p = document.caretPositionFromPoint(x, y);
            if (p && p.offsetNode) return { node: p.offsetNode, offset: p.offset, rect: p.getClientRect ? p.getClientRect() : null };
        }
        if (document.caretRangeFromPoint) {
            const r = document.caretRangeFromPoint(x, y);
            if (r) return { node: r.startContainer, offset: r.startOffset, rect: r.getBoundingClientRect() };
        }
    } catch (e) {}
    return null;
}
// Các đoạn định dạng (theo id) giao với [s, e) trong vùng — vị trí đo trên DOM hiện tại (đúng cả khi đáp án bị xáo)
function marksInRange(scopeEl, s, e) {
    const groups = new Map();
    scopeEl.querySelectorAll('.quiz-annot:not(.annot-note)').forEach(m => {
        const from = offsetInContainer(scopeEl, m, 0);
        if (from < 0) return;
        const to = from + m.textContent.length;
        const key = m.getAttribute('data-annot-id') || m;
        const g = groups.get(key) || { id: m.getAttribute('data-annot-id'), type: m.getAttribute('data-annot-type') || 'highlight', start: from, end: to, els: [] };
        g.start = Math.min(g.start, from); g.end = Math.max(g.end, to); g.els.push(m);
        groups.set(key, g);
    });
    return [...groups.values()].filter(g => g.start < e && g.end > s);
}
const penUndo = [];
function penRemoveGroup(qText, scope, scopeEl, g, op) {
    if (g.id) {
        const item = getAnnotsFor(qText).find(a => a.id === g.id);
        if (!removeAnnotById(qText, g.id)) return false;
        if (item) op.removed.push({ ...item });
        scopeEl.querySelectorAll(`[data-annot-id="${g.id}"]`).forEach(unwrapMark);
    } else g.els.forEach(m => removeAnnotEverywhere(qText, scope, m));
    return true;
}
function penAdd(qText, scope, scopeEl, txt, s, e, type, op) {
    while (s < e && /\s/.test(txt[s])) s++;
    while (e > s && /\s/.test(txt[e - 1])) e--;
    if (e <= s) return null;
    const id = addAnnot(qText, scope, txt.slice(s, e), type, s, e);
    if (!id) return null;
    op.added.push(id);
    wrapOffsetRange(scopeEl, s, e, type, id);
    return id;
}
// Một lượt sửa bằng bút trên một vùng: gom mọi thêm / gỡ thành MỘT bước hoàn tác, xong thì vẽ lại hàng ghi chú
function withPenOp(scopeEl, work) {
    const question = state.questions[state.currentIndex];
    if (!question || !scopeEl || !scopeEl.isConnected) return null;
    const scope = scopeEl.getAttribute('data-annot');
    const ctx = { qText: annotKeyFor(question, scope), scope, txt: scopeTextOf(scopeEl), op: null, result: null };
    ctx.op = { qText: ctx.qText, added: [], removed: [] };
    try {
        clearNoteLines(scopeEl);
        ctx.result = work(ctx);
        cleanupEmptyAnnots(scopeEl);
    } catch (x) {
        showQuestion();
    }
    const { op } = ctx;
    if (op.added.length || op.removed.length) { penUndo.push(op); if (penUndo.length > 40) penUndo.shift(); }
    renderNoteLines(document.getElementById('quizSection'));
    syncPenUndo();
    return ctx.result;
}
// Mở khung ghi chú cho đoạn [s, e): đoạn đã có ghi chú cụm từ -> mở sửa cái đó
function openNoteForRange(scopeEl, s, e) {
    const question = state.questions[state.currentIndex];
    const range = question && rangeFromOffsets(scopeEl, s, e);
    if (!range) return;
    const scope = scopeEl.getAttribute('data-annot');
    const qText = annotKeyFor(question, scope);
    const existing = [...scopeEl.querySelectorAll('.annot-note')].find(m => { try { return range.intersectsNode(m); } catch (x) { return false; } });
    if (existing) openNoteEditor({ mode: 'edit', qText, scope, id: existing.getAttribute('data-annot-id'), text: existing.textContent, note: existing.getAttribute('data-note') || '', rect: existing.getBoundingClientRect() });
    else openNoteEditor({ mode: 'new', qText, scope, scopeEl, start: s, end: e, text: scopeTextOf(scopeEl).slice(s, e), rect: range.getBoundingClientRect() });
}
// Đoạn định dạng theo id (mọi mảnh) -> vị trí trong vùng
function penGroupById(scopeEl, id) {
    const els = id ? [...scopeEl.querySelectorAll(`[data-annot-id="${id}"]`)] : [];
    if (!els.length) return null;
    let start = Infinity, end = -1;
    els.forEach(m => { const f = offsetInContainer(scopeEl, m, 0); if (f >= 0) { start = Math.min(start, f); end = Math.max(end, f + m.textContent.length); } });
    return end > start ? { id, type: els[0].getAttribute('data-annot-type') || 'highlight', start, end, els } : null;
}
// Áp một nét bút [s, e) (đã nới trọn từ) lên vùng. Trả id đoạn vừa tô (để hiện thanh đổi nhanh), không có thì null.
function applyPenStroke(scopeEl, s, e, tool) {
    if (e <= s) return null;
    if (tool === 'note') { openNoteForRange(scopeEl, s, e); return null; }
    return withPenOp(scopeEl, ({ qText, scope, txt, op }) => {
        const hits = marksInRange(scopeEl, s, e);
        if (tool === 'erase') {
            hits.forEach(g => {
                if (!penRemoveGroup(qText, scope, scopeEl, g, op)) return;
                if (g.start < s) penAdd(qText, scope, scopeEl, txt, g.start, s, g.type, op);
                if (g.end > e) penAdd(qText, scope, scopeEl, txt, e, g.end, g.type, op);
            });
            return null;
        }
        const same = hits.filter(g => g.type === tool);
        const cover = same.find(g => g.start <= s && g.end >= e);
        if (cover) return cover.id;   // đã tô kín: khỏi làm gì, vẫn hiện thanh đổi nhanh cho đoạn đó
        let ns = s, ne = e;
        same.forEach(g => { if (penRemoveGroup(qText, scope, scopeEl, g, op)) { ns = Math.min(ns, g.start); ne = Math.max(ne, g.end); } });
        return penAdd(qText, scope, scopeEl, txt, ns, ne, tool, op);
    });
}
// Thanh đổi nhanh: đổi kiểu (màu / gạch chân) hoặc gỡ một đoạn đã tô — cũng là một bước hoàn tác
function retypePenMark(scopeEl, id, type) {
    return withPenOp(scopeEl, ({ qText, scope, txt, op }) => {
        const g = penGroupById(scopeEl, id);
        if (!g) return null;
        if (g.type === type) return id;
        if (!penRemoveGroup(qText, scope, scopeEl, g, op)) return id;
        return type ? penAdd(qText, scope, scopeEl, txt, g.start, g.end, type, op) : null;
    });
}
function undoPenStroke() {
    const op = penUndo.pop();
    syncPenUndo();
    if (!op) { showToast('Chưa có nét bút nào để hoàn tác.', 'info', 1600); return; }
    const sec = document.getElementById('quizSection');
    if (sec) clearNoteLines(sec);
    op.added.forEach(id => { if (removeAnnotById(op.qText, id)) document.querySelectorAll(`#quizSection [data-annot-id="${id}"]`).forEach(unwrapMark); });
    if (op.removed.length) {
        // id cũ đã có "bia mộ" (đồng bộ sẽ bỏ) -> khôi phục với id mới
        const store = getAnnotStore();
        const arr = Array.isArray(store[op.qText]) ? store[op.qText] : (store[op.qText] = []);
        op.removed.forEach(a => {
            const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            arr.push({ ...a, id, ts: Date.now() });
            penUndo.forEach(o => { o.added = o.added.map(x => (x === a.id ? id : x)); });   // các bước hoàn tác cũ hơn trỏ sang id mới
        });
        if (saveAnnotStore(store)) pushStudyToCloud();
    }
    if (sec) { sec.querySelectorAll('[data-annot]').forEach(cleanupEmptyAnnots); applyAnnotationsAll(); }
}
let syncPenUndo = () => {};
let showPenQuick = null;   // (scopeEl, id) -> hàng thao tác cho đoạn tô trên thanh bút; setupPenMode gán

function setupPenMode() {
    const dock = document.getElementById('annot-pen-dock');
    if (!dock) return;
    const toggleBtn = dock.querySelector('[data-pen-act="toggle"]');
    const label = dock.querySelector('.apd-label');
    const swatchIco = dock.querySelector('.apd-swatch i');
    const ctxRow = dock.querySelector('.apd-ctx');
    const PEN_ICON = { highlight: 'fa-highlighter', 'hl-green': 'fa-highlighter', 'hl-blue': 'fa-highlighter', underline: 'fa-underline', note: 'fa-comment-dots', erase: 'fa-eraser' };
    let cfg = { on: false, tool: 'highlight', finger: false, mini: false };   // mini = hộp bút thu gọn (chỉ còn bút đang cầm + hoàn tác + tắt)
    try { cfg = { ...cfg, ...JSON.parse(localStorage.getItem(PEN_KEY) || '{}') }; } catch (e) {}
    if (!PEN_TOOLS.includes(cfg.tool)) cfg.tool = 'highlight';
    const save = () => { try { localStorage.setItem(PEN_KEY, JSON.stringify(cfg)); } catch (e) {} };
    const sync = () => {
        dock.classList.toggle('is-on', !!cfg.on);
        dock.classList.toggle('is-mini', !!cfg.mini);
        dock.dataset.tool = cfg.tool;
        document.body.classList.toggle('qz-pen-on', !!cfg.on);
        document.body.dataset.qzPen = cfg.tool;   // KHÔNG đặt data-pen-tool lên body: closest("[data-pen-tool]") của nút thanh bút sẽ khớp nhầm
        // Nút chính = bút đang cầm: chấm màu + biểu tượng + tên ("Tô vàng", "Tẩy"…) -> liếc là biết; bấm = thu gọn / xòe hộp bút
        if (label) label.textContent = PEN_LABEL[cfg.tool];
        if (swatchIco) swatchIco.className = 'fas ' + PEN_ICON[cfg.tool];
        document.getElementById('pen-btn')?.setAttribute('aria-pressed', String(!!cfg.on));
        toggleBtn.setAttribute('aria-expanded', String(!cfg.mini));
        toggleBtn.setAttribute('aria-label', `Đang cầm: ${PEN_LABEL[cfg.tool]}. Bấm để ${cfg.mini ? 'mở hộp bút' : 'thu gọn hộp bút'}`);
        toggleBtn.title = `Đang cầm: ${PEN_LABEL[cfg.tool]} — bấm để ${cfg.mini ? 'mở hộp bút' : 'thu gọn'}`;
        dock.querySelectorAll('[data-pen-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.penTool === cfg.tool)));
        dock.querySelector('[data-pen-act="finger"]')?.setAttribute('aria-pressed', String(!!cfg.finger));
    };
    syncPenUndo = () => { const b = dock.querySelector('[data-pen-act="undo"]'); if (b) b.disabled = !penUndo.length; };

    // ---- Hàng ngữ cảnh phía trên thanh (KHÔNG nổi đè lên chữ): mẹo dùng lần đầu, hoặc thao tác cho đoạn vừa tô / vừa chạm ----
    let ctx = null;   // { kind: 'tip' } | { kind: 'mark', scopeEl, id }
    const TIP_KEY = PEN_KEY + '_tip';
    const hideCtx = () => { ctx = null; ctxRow.hidden = true; ctxRow.innerHTML = ''; dock.classList.remove('has-ctx'); };
    const showCtx = (html, next) => {
        ctx = next;
        ctxRow.innerHTML = html;
        ctxRow.hidden = false;
        dock.classList.add('has-ctx');
        ctxRow.classList.remove('apd-in'); void ctxRow.offsetWidth; ctxRow.classList.add('apd-in');
    };
    const showTip = () => showCtx('<div class="apd-tip"><b><i class="fas fa-highlighter"></i> Cách dùng bút tô</b>'
        + '<span><i class="fas fa-pen"></i> Vuốt bút qua chữ là tô — nhấc bút lên là lưu</span>'
        + '<span><i class="fas fa-hand"></i> Vuốt xong <b>giữ yên bút</b> một nhịp = tô + mở ghi chú luôn</span>'
        + '<span><i class="fas fa-hand-pointer"></i> Chạm đoạn đã tô: đổi màu, thêm ghi chú, gỡ</span>'
        + '<span><i class="fas fa-rotate-left"></i> Chạm 2 ngón lên bài = hoàn tác</span>'
        + '<button type="button" data-ctx="tip-ok">Đã hiểu</button></div>', { kind: 'tip' });
    const showMarkCtx = (scopeEl, id) => {
        const g = scopeEl && scopeEl.isConnected ? penGroupById(scopeEl, id) : null;
        if (!g) { hideCtx(); return; }
        const text = g.els.map(m => m.textContent).join('').replace(/\s+/g, ' ').trim();
        const DOT = { highlight: 'yellow', 'hl-green': 'green', 'hl-blue': 'blue' };
        showCtx('<span class="apd-quote">“<span></span>”</span>'
            + '<button type="button" data-ctx="note" class="apd-ctx-note"><i class="fas fa-comment-dots"></i> Ghi chú</button>'
            + '<span class="apd-sep" aria-hidden="true"></span>'
            + Object.keys(DOT).map(t => `<button type="button" data-ctx="${t}" class="apd-dot apd-${DOT[t]}" title="${PEN_LABEL[t]}" aria-label="Đổi thành ${PEN_LABEL[t].toLowerCase()}" aria-pressed="${g.type === t}"></button>`).join('')
            + `<button type="button" data-ctx="underline" title="Gạch chân" aria-label="Đổi thành gạch chân" aria-pressed="${g.type === 'underline'}"><i class="fas fa-underline"></i></button>`
            + '<button type="button" data-ctx="del" class="apd-ctx-del" title="Gỡ đoạn tô" aria-label="Gỡ đoạn tô"><i class="fas fa-trash-can"></i></button>'
            + '<button type="button" data-ctx="close" class="apd-ctx-x" title="Đóng" aria-label="Đóng"><i class="fas fa-xmark"></i></button>', { kind: 'mark', scopeEl, id });
        ctxRow.querySelector('.apd-quote span').textContent = text.length > 38 ? text.slice(0, 38) + '…' : text;
    };
    showPenQuick = showMarkCtx;
    ctxRow.addEventListener('click', (e) => {
        const b = e.target.closest('[data-ctx]');
        if (!b) return;
        const act = b.dataset.ctx;
        if (act === 'tip-ok') { try { localStorage.setItem(TIP_KEY, '1'); } catch (x) {} hideCtx(); return; }
        if (act === 'close' || !ctx || ctx.kind !== 'mark') { hideCtx(); return; }
        const { scopeEl, id } = ctx;
        if (act === 'note') { const g = penGroupById(scopeEl, id); hideCtx(); if (g) openNoteForRange(scopeEl, g.start, g.end); return; }
        if (act === 'del') { retypePenMark(scopeEl, id, null); hideCtx(); return; }
        const nid = retypePenMark(scopeEl, id, act);
        if (nid) showMarkCtx(scopeEl, nid); else hideCtx();
    });
    // chạm ra chỗ khác (không phải nét tô mới) -> thu hàng thao tác; mẹo dùng thì giữ tới khi bấm "Đã hiểu"
    document.addEventListener('pointerdown', (e) => { if (ctx && ctx.kind === 'mark' && !dock.contains(e.target)) hideCtx(); }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ctx) hideCtx(); });

    const setOn = (on) => {
        cfg.on = on; save(); sync();
        if (!on) { hideCtx(); return; }
        let seen = false;
        try { seen = localStorage.getItem(TIP_KEY) === '1'; } catch (e) {}
        if (!seen) showTip();
    };
    sync(); syncPenUndo();
    dock.addEventListener('mousedown', (e) => e.preventDefault());   // giữ vùng chọn / không cướp focus
    dock.addEventListener('click', (e) => {
        const t = e.target.closest('[data-pen-tool]');
        if (t) {
            cfg.tool = t.dataset.penTool;
            if (!cfg.on) setOn(true); else { save(); sync(); }
            if (ctx && ctx.kind === 'mark') hideCtx();
            return;
        }
        const b = e.target.closest('[data-pen-act]');
        if (!b) return;
        const act = b.dataset.penAct;
        if (act === 'toggle') { cfg.mini = !cfg.mini; save(); sync(); }
        else if (act === 'off') setOn(false);
        else if (act === 'undo') undoPenStroke();
        else if (act === 'help') { if (ctx && ctx.kind === 'tip') hideCtx(); else showTip(); }
        else if (act === 'finger') {
            cfg.finger = !cfg.finger; save(); sync();
            showToast(cfg.finger ? 'Ngón tay cũng tô: vuốt trên chữ là tô (cuộn bằng vùng trống / lề).' : 'Chỉ bút & chuột tô — ngón tay cuộn trang như thường.', 'info', 2600);
        }
    });
    // Nút bật bút nằm ở hàng công cụ đầu thẻ (vẽ lại mỗi câu -> bắt bằng ủy quyền); thanh nổi chỉ hiện khi bút đang bật
    document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('#pen-btn')) setOn(!cfg.on); });
    // Phím J bật / tắt bút (A–H chọn đáp án, các chữ khác đã có việc)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing || e.repeat) return;
        if ((e.key || '').toLowerCase() !== 'j') return;
        const t = e.target;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
        const sec = document.getElementById('quizSection');
        if (!sec || sec.classList.contains('hidden') || !sec.offsetParent) return;
        e.preventDefault();
        setOn(!cfg.on);
    });
    // Hoàn tác nét bút: Ctrl/⌘+Z (đang bật bút, không gõ chữ) · chạm 2 ngón lên bài (như các app ghi chú trên iPad)
    document.addEventListener('keydown', (e) => {
        if (!cfg.on || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || (e.key || '').toLowerCase() !== 'z') return;
        const t = e.target;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
        if (!penUndo.length) return;
        e.preventDefault();
        undoPenStroke(); hideCtx();
    });
    let tf = null;   // chạm 2 ngón: { t, pts: [[id, x, y]], bad }
    window.addEventListener('touchstart', (e) => {
        if (!cfg.on || e.touches.length !== 2) { tf = null; return; }
        if ([...e.touches].some(t => t.touchType === 'stylus') || !(e.target.closest && e.target.closest('#quizSection'))) { tf = null; return; }
        tf = { t: performance.now(), pts: [...e.touches].map(t => [t.identifier, t.clientX, t.clientY]), bad: false };
    }, { capture: true, passive: true });
    window.addEventListener('touchmove', (e) => {
        if (!tf) return;
        [...e.touches].forEach(t => { const p = tf.pts.find(q => q[0] === t.identifier); if (p && Math.hypot(t.clientX - p[1], t.clientY - p[2]) > 14) tf.bad = true; });
    }, { capture: true, passive: true });
    window.addEventListener('touchend', (e) => {
        if (!tf || e.touches.length) return;
        const ok = !tf.bad && performance.now() - tf.t < 380;
        tf = null;
        if (ok && penUndo.length) { undoPenStroke(); hideCtx(); showToast('Đã hoàn tác nét vừa tô', 'info', 1000); }
    }, { capture: true, passive: true });
    window.addEventListener('touchcancel', () => { tf = null; }, { capture: true, passive: true });

    let stroke = null;          // { id, type, scopeEl, a, b, x0, y0, lineY, lh, locked, moved, hold, target, touchBlocked }
    let swallowClickUntil = 0;
    const hl = window.CSS && CSS.highlights && window.Highlight ? CSS.highlights : null;
    const clearPreview = () => { if (hl) hl.delete('qz-pen'); };
    // Khung chữ tại con trỏ: range rỗng của Safari hay trả khung 0×0 -> đo một ký tự cạnh đó
    const caretBox = (c) => {
        if (c.rect && c.rect.height) return c.rect;
        try {
            const n = c.node;
            if (n.nodeType !== 3 || !n.nodeValue.length) return null;
            const i = Math.min(c.offset, n.nodeValue.length - 1);
            const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1);
            const b = r.getClientRects()[0];
            return b && b.height ? b : null;
        } catch (e) { return null; }
    };
    const offsetFromPoint = (x, y) => {
        if (!stroke) return null;
        const sc = stroke.scopeEl;
        // Đang bám dòng: kẹp ngang trong vùng -> vuốt lố ra lề phải / trái vẫn dừng ở cuối / đầu dòng, không văng sang chỗ khác
        if (stroke.locked) { const r = sc.getBoundingClientRect(); x = Math.max(r.left + 1, Math.min(r.right - 1, x)); }
        const c = caretAtPoint(x, y);
        if (!c) return null;
        if (sc.contains(c.node)) return { pos: offsetInContainer(sc, c.node, c.offset), rect: caretBox(c) };
        const rel = sc.compareDocumentPosition(c.node);
        if (rel & Node.DOCUMENT_POSITION_FOLLOWING) return { pos: scopeTextOf(sc).length };
        if (rel & Node.DOCUMENT_POSITION_PRECEDING) return { pos: 0 };
        return null;
    };
    const wants = (e) => {
        if (!cfg.on || !e.isPrimary) return false;
        if (e.pointerType === 'mouse') return e.button === 0;
        return e.pointerType === 'pen' || (e.pointerType === 'touch' && cfg.finger);
    };
    let raf = 0;
    const paint = () => {
        raf = 0;
        if (!stroke || !stroke.moved) return;
        const txt = scopeTextOf(stroke.scopeEl);
        const [s, e] = snapToWords(txt, stroke.a, stroke.b);
        stroke.s = s; stroke.e = e;
        if (!hl) return;
        const r = e > s ? rangeFromOffsets(stroke.scopeEl, s, e) : null;
        if (r) hl.set('qz-pen', new Highlight(r)); else clearPreview();
    };
    // Giữ yên bút ở cuối nét ~0,55 s = "tô + ghi chú": xem trước đổi sang màu ghi chú để biết đã ăn
    const HOLD_MS = 550;
    const armHold = (x, y) => {
        if (!stroke) return;
        clearTimeout(stroke.holdT);
        stroke.hx = x; stroke.hy = y;
        if (cfg.tool === 'erase' || cfg.tool === 'note') return;
        stroke.holdT = setTimeout(() => {
            if (!stroke || !stroke.moved) return;
            stroke.hold = true;
            document.body.classList.add('qz-pen-hold');
            if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) {}
        }, HOLD_MS);
    };
    const endVisuals = () => {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        clearPreview();
        document.body.classList.remove('qz-pen-drawing', 'qz-pen-hold');
    };
    const abortStroke = () => {
        if (!stroke) return;
        clearTimeout(stroke.holdT);
        stroke = null;
        endVisuals();
    };
    // Nét "treo": mất pointerup (chữ dưới bút bị vẽ lại giữa chừng...) thì stroke kẹt mãi -> mọi cú chạm bị chặn cuộn.
    // Nét thật luôn có pointermove liên tục; im quá 1,5 s mà có cú chạm mới = nét sót, bỏ đi.
    const dropStaleStroke = () => { if (stroke && stroke.type !== 'mouse' && performance.now() - stroke.last > 1500) abortStroke(); };
    document.addEventListener('pointerdown', (e) => {
        swallowClickUntil = 0;   // lần chạm mới: click "kèm theo nét trước" (nếu có) đã qua rồi -> đừng nuốt nhầm cú bấm này
        dropStaleStroke();
        // ngón thứ hai chạm vào khi đang tô bằng ngón tay = cử chỉ 2 ngón (hoàn tác / thu phóng), không phải nét tô
        if (stroke && stroke.type === 'touch' && e.pointerType === 'touch' && e.pointerId !== stroke.id) { abortStroke(); return; }
        if (stroke || !wants(e)) return;
        const t = e.target;
        if (!t || !t.closest || t.closest('.qi-wrap, img, video, canvas, input, textarea, select, a[href], .an-line, #annot-pen-dock, #annot-note-pop, #annot-toolbar')) return;
        let scopeEl = t.closest('#quizSection [data-annot]');
        if (!scopeEl) {
            // Đặt bút hơi lệch ra lề / khoảng trống sát chữ vẫn bắt đầu tô được (đừng bắt "đặt trúng chữ" mới ăn)
            if (!t.closest('#quizSection') || t.closest('button:not(.answer-btn), [role="button"], summary, label')) return;
            const c = caretAtPoint(e.clientX, e.clientY);
            const el = c && (c.node.nodeType === 3 ? c.node.parentElement : c.node);
            const sc = el && el.closest && el.closest('#quizSection [data-annot]');
            if (!sc) return;
            const r = sc.getBoundingClientRect();
            if (e.clientX < r.left - 28 || e.clientX > r.right + 28 || e.clientY < r.top - 8 || e.clientY > r.bottom + 8) return;
            scopeEl = sc;
        }
        if (scopeEl.closest('.hidden')) return;
        stroke = { id: e.pointerId, type: e.pointerType, scopeEl, x0: e.clientX, y0: e.clientY, moved: false, locked: false, target: t, last: performance.now(),
            touchBlocked: performance.now() - stylusBlockedAt < 300 };
        const p = offsetFromPoint(e.clientX, e.clientY);
        if (!p || p.pos < 0) { stroke = null; return; }
        stroke.a = stroke.b = p.pos;
        // Dòng đang tô: tâm dòng + chiều cao dòng để vuốt lệch lên / xuống không nhảy sang dòng khác
        const rect = p.rect;
        const lhCss = parseFloat(getComputedStyle(t.nodeType === 1 ? t : scopeEl).lineHeight);
        stroke.lh = rect ? rect.height : (lhCss || 24);
        stroke.lineY = rect ? rect.top + rect.height / 2 : e.clientY;
        stroke.locked = true;
        if (noteEd) dismissNoteEditor();
        if (e.pointerType === 'mouse') {
            e.preventDefault();   // không bôi đen kiểu thường
            try { scopeEl.setPointerCapture(e.pointerId); } catch (x) {}   // kéo ra ngoài cửa sổ vẫn nhận lúc thả
        }
        e.stopPropagation();   // không bắt đầu "giữ để gạch đáp án"
    }, true);
    document.addEventListener('pointermove', (e) => {
        if (!stroke || e.pointerId !== stroke.id) return;
        stroke.last = performance.now();
        const dx = e.clientX - stroke.x0, dy = e.clientY - stroke.y0;
        if (!stroke.moved && Math.hypot(dx, dy) < (stroke.type === 'mouse' ? 4 : 6)) return;
        if (!stroke.moved) {
            stroke.moved = true;
            document.body.classList.add('qz-pen-drawing');
            try { window.getSelection()?.removeAllRanges(); } catch (x) {}
            armHold(e.clientX, e.clientY);
        }
        // đã "giữ để ghi chú" mà vẫn vuốt tiếp -> bỏ chế độ đó, vuốt bình thường
        if (Math.hypot(e.clientX - stroke.hx, e.clientY - stroke.hy) > 5) {
            if (stroke.hold) { stroke.hold = false; document.body.classList.remove('qz-pen-hold'); }
            armHold(e.clientX, e.clientY);
        }
        // Rời dòng chỉ khi lệch hẳn một dòng (đè lên chữ / gạch dưới chữ / lệch tay đều vẫn ở dòng cũ)
        if (stroke.locked && Math.abs(e.clientY - stroke.lineY) > stroke.lh * 1.05) stroke.locked = false;
        const p = offsetFromPoint(e.clientX, stroke.locked ? stroke.lineY : e.clientY);
        if (p && p.pos >= 0) stroke.b = p.pos;
        if (!raf) raf = requestAnimationFrame(paint);
        e.preventDefault();
    }, { capture: true, passive: false });
    const finish = (e, cancel) => {
        if (!stroke || e.pointerId !== stroke.id) return;
        const st = stroke;
        clearTimeout(st.holdT);
        stroke = null;
        endVisuals();
        if (cancel) return;
        if (!st.moved) {
            // Chạm bút, không vuốt: touchstart đã bị chặn (không cuộn) nên tự phát click như một cú bấm thường
            if (st.touchBlocked) {
                const el = document.elementFromPoint(e.clientX, e.clientY) || st.target;
                el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: e.clientX, clientY: e.clientY }));
            }
            return;
        }
        swallowClickUntil = performance.now() + 450;
        stroke = st; paint(); stroke = null;
        clearPreview();
        if (!(st.e > st.s) || !st.scopeEl.isConnected) return;
        const id = applyPenStroke(st.scopeEl, st.s, st.e, cfg.tool);
        if (id || cfg.tool === 'erase') { const sw = dock.querySelector('.apd-swatch'); if (sw) { sw.classList.remove('apd-pop'); void sw.offsetWidth; sw.classList.add('apd-pop'); } }   // chấm màu nảy = đã lưu
        if (st.hold) { hideCtx(); openNoteForRange(st.scopeEl, st.s, st.e); }   // giữ yên bút cuối nét: tô xong mở luôn khung ghi chú
        else if (id) showMarkCtx(st.scopeEl, id);
    };
    document.addEventListener('pointerup', (e) => finish(e, false), true);
    document.addEventListener('pointercancel', (e) => finish(e, true), true);
    // Bút / ngón (khi bật) đặt lên chữ: không cuộn, không kính lúp / menu chọn chữ, không vuốt chuyển câu
    // (Safari phát pointerdown trước touchstart; phòng khi thứ tự ngược: bút chạm lên chữ thì chặn luôn, pointerdown tới sau nhận cờ)
    let stylusBlockedAt = -1e9;
    ['touchstart', 'touchmove'].forEach(type => document.addEventListener(type, (e) => {
        if (type === 'touchstart') dropStaleStroke();
        if (!stroke && type === 'touchstart' && cfg.on && [...(e.changedTouches || [])].some(t => t.touchType === 'stylus')
            && e.target.closest && e.target.closest('#quizSection [data-annot]') && !e.target.closest('.qi-wrap, img, video, canvas, input, textarea, select, a[href], .an-line')) {
            if (e.cancelable) { e.preventDefault(); stylusBlockedAt = performance.now(); }
            return;
        }
        if (!stroke || stroke.type === 'mouse') return;
        if (e.cancelable) e.preventDefault();
        if (type === 'touchstart') stroke.touchBlocked = true;
        e.stopPropagation();
    }, { capture: true, passive: false }));
    document.addEventListener('selectstart', (e) => { if (stroke) e.preventDefault(); }, true);
    // Sau một nét: nuốt click kèm theo (không chọn đáp án / không gỡ đoạn tô dưới đầu bút)
    window.addEventListener('click', (e) => {
        if (performance.now() >= swallowClickUntil) return;
        swallowClickUntil = 0;
        // chỉ click rơi vào bài (nét vừa vẽ) — bấm ngay nút trên thanh bút / chỗ khác vẫn ăn
        if (e.target && e.target.closest && e.target.closest('#quizSection')) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
    window.addEventListener('contextmenu', (e) => { if (stroke || performance.now() < swallowClickUntil) e.preventDefault(); }, true);
}
