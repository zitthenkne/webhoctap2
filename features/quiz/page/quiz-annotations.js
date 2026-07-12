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

import { state } from '../quiz-state.js';
import { pushStudyToCloud } from './quiz-study-sync.js';
import { showQuestion } from './quiz-question-view.js';

function annotStorageKey() {
    const quizId = (state.quizData && state.quizData.id) || (new URLSearchParams(window.location.search)).get('id') || 'default_quiz';
    return `quiz_annot_${quizId}`;
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
function addAnnot(qText, scope, text, type, start, end) {
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
        arr.push(hasPos ? { scope, text, type, id, start, end } : { scope, text, type, id });
    }
    store[qText] = arr;
    saveAnnotStore(store);
    pushStudyToCloud();
    return id;
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
    return 'mark';
}
function annotClass(type) {
    // Tái dùng class markdown sẵn có để màu in đậm (hồng) / in nghiêng (xanh) đồng nhất
    // với phần còn lại của web và tự đổi màu theo nền đúng/sai/tối.
    if (type === 'bold') return 'quiz-annot obsidian-bold';
    if (type === 'italic') return 'quiz-annot obsidian-italic';
    if (type === 'underline') return 'quiz-annot annot-underline';
    if (type === 'strike') return 'quiz-annot annot-strike';
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
function wrapRange(range, type, id) {
    const el = document.createElement(annotTag(type));
    el.className = annotClass(type);
    el.setAttribute('data-annot-type', type);
    if (id) el.setAttribute('data-annot-id', id);
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
function wrapOffsetRange(container, from, to, type, id) {
    const nodes = collectTextNodes(container);
    if (!nodes.length) return;
    const start = locateInNodes(nodes, from, false);
    const end = locateInNodes(nodes, to, true);
    if (!start || !end) return;
    try {
        const range = document.createRange();
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
        wrapRange(range, type, id);
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
        if (typeof a.start === 'number' && typeof a.end === 'number' && a.end > a.start) {
            wrapOffsetRange(container, a.start, a.end, a.type, a.id);
            return;
        }
        // Lui về khớp theo chữ (dữ liệu cũ): chỉ lần xuất hiện đầu tiên.
        const phrase = a.text;
        if (!phrase || phrase.length < 1) return;
        const nodes = collectTextNodes(container);
        const pos = nodes.map(n => n.nodeValue).join('').indexOf(phrase);
        if (pos === -1) return;
        wrapOffsetRange(container, pos, pos + phrase.length, a.type, a.id);
    });
}
// Áp dụng ghi chú cho mọi vùng [data-annot] của câu đang hiển thị
export function applyAnnotationsAll() {
    const quizSection = document.getElementById('quizSection');
    if (!quizSection) return;
    const question = state.questions[state.currentIndex];
    if (!question) return;
    const store = getAnnotStore();
    quizSection.querySelectorAll('[data-annot]').forEach(el => {
        const scope = el.getAttribute('data-annot');
        const annots = store[annotKeyFor(question, scope)];
        if (!Array.isArray(annots) || !annots.length) return;
        applyAnnotsToContainer(el, annots.filter(a => a.scope === scope));
        cleanupEmptyAnnots(el);
    });
}
export function setupAnnotations() {
    const toolbar = document.getElementById('annot-toolbar');
    if (!toolbar) return;

    let activeScope = null;    // tên vùng (data-annot) của vùng chọn hiện tại
    let activeScopeEl = null;  // phần tử vùng — để tìm các đoạn định dạng giao với vùng chọn
    const coarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

    const hide = () => { toolbar.classList.remove('show'); activeScope = null; activeScopeEl = null; };
    const scopeOf = (node) => {
        const el = node && node.nodeType === 3 ? node.parentElement : node;
        return el && el.closest ? el.closest('#quizSection [data-annot]') : null;
    };

    // Định vị thông minh: mặc định nổi TRÊN vùng chọn; sát mép trên (hoặc trên máy
    // cảm ứng — nơi menu chọn chữ của hệ điều hành cũng nằm trên) thì lật XUỐNG DƯỚI;
    // luôn kẹp trong mép ngang màn hình để không bị cắt.
    const positionToolbar = (rect) => {
        toolbar.classList.add('show'); // hiện trước để đo được kích thước thật
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
            // Tẩy: gỡ MỌI định dạng giao với vùng chọn. Áp định dạng mới: chỉ gỡ đoạn
            // TRÙNG LOẠI (bôi lại cùng màu = làm mới), các loại khác giữ nguyên để
            // CHỒNG LỚP được — highlight + in đậm + in nghiêng dùng chung một đoạn chữ.
            const overlapped = Array.from(scopeEl.querySelectorAll('.quiz-annot'))
                .filter(m => {
                    try { if (!range.intersectsNode(m)) return false; } catch (e) { return false; }
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
        if (question) {
            // Bấm đoạn lồng nhau: gỡ lớp TRONG CÙNG trước (closest), bấm tiếp gỡ lớp ngoài.
            // Gỡ theo id nên mọi mảnh bị tách đôi của cùng ghi chú biến mất đồng bộ.
            const scope = cont.getAttribute('data-annot');
            removeAnnotEverywhere(annotKeyFor(question, scope), scope, mark);
        }
    }, true);
}
