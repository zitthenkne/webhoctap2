// File: features/quiz/page/quiz-annotations.js
// #9: ghi chú trực quan (bôi vàng / in đậm / in nghiêng) cho từng vùng của câu hỏi.
// Lưu theo từng câu: { qText: [ { scope, text, type } ] }
// scope = "q" (đề), "a<idx>" (đáp án), "oe<idx>" (giải thích đáp án),
//         "note" (ghi chú ghi nhớ), "expand" (mở rộng kiến thức)
// Tách từ quiz-page.js — logic giữ nguyên.

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
function addAnnot(qText, scope, text, type) {
    const store = getAnnotStore();
    const arr = Array.isArray(store[qText]) ? store[qText] : [];
    if (!arr.some(a => a.scope === scope && a.text === text && a.type === type)) {
        arr.push({ scope, text, type });
    }
    store[qText] = arr;
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
function annotTag(type) { return type === 'bold' ? 'strong' : type === 'italic' ? 'em' : 'mark'; }
function annotClass(type) {
    // Tái dùng class markdown sẵn có để màu in đậm (hồng) / in nghiêng (xanh) đồng nhất
    // với phần còn lại của web và tự đổi màu theo nền đúng/sai/tối.
    if (type === 'bold') return 'quiz-annot obsidian-bold';
    if (type === 'italic') return 'quiz-annot obsidian-italic';
    return 'quiz-annot quiz-hl';
}
// Bọc các đoạn đã ghi chú trong một vùng cụ thể (bỏ qua phần đã bọc sẵn để chạy lại an toàn)
function applyAnnotsToContainer(container, annots) {
    if (!container || !annots || !annots.length) return;
    annots.forEach(a => {
        const phrase = a.text;
        if (!phrase || phrase.length < 1) return;
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
            acceptNode: (n) => {
                if (!n.nodeValue.includes(phrase)) return NodeFilter.FILTER_REJECT;
                let p = n.parentNode;
                while (p && p !== container) {
                    if (p.classList && p.classList.contains('quiz-annot')) return NodeFilter.FILTER_REJECT;
                    p = p.parentNode;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        const targets = [];
        while (walker.nextNode()) targets.push(walker.currentNode);
        targets.forEach(node => {
            const pos = node.nodeValue.indexOf(phrase);
            if (pos === -1) return;
            try {
                const range = document.createRange();
                range.setStart(node, pos);
                range.setEnd(node, pos + phrase.length);
                const el = document.createElement(annotTag(a.type));
                el.className = annotClass(a.type);
                el.setAttribute('data-annot-type', a.type);
                range.surroundContents(el);
            } catch (e) { /* vùng chọn trải qua nhiều thẻ -> bỏ qua đoạn này */ }
        });
    });
}
// Áp dụng ghi chú cho mọi vùng [data-annot] của câu đang hiển thị
export function applyAnnotationsAll() {
    const quizSection = document.getElementById('quizSection');
    if (!quizSection) return;
    const question = state.questions[state.currentIndex];
    if (!question) return;
    const annots = getAnnotsFor(question.question);
    if (!annots.length) return;
    quizSection.querySelectorAll('[data-annot]').forEach(el => {
        const scope = el.getAttribute('data-annot');
        applyAnnotsToContainer(el, annots.filter(a => a.scope === scope));
    });
}
export function setupAnnotations() {
    const toolbar = document.getElementById('annot-toolbar');
    if (!toolbar) return;

    let activeScope = null;
    const hide = () => { toolbar.classList.remove('show'); activeScope = null; };
    const scopeOf = (node) => {
        const el = node && node.nodeType === 3 ? node.parentElement : node;
        return el && el.closest ? el.closest('#quizSection [data-annot]') : null;
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
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        toolbar.style.left = (rect.left + rect.width / 2) + 'px';
        toolbar.style.top = (rect.top - 8) + 'px';
        toolbar.classList.add('show');
    };
    document.addEventListener('mouseup', () => setTimeout(onSelect, 10));
    document.addEventListener('touchend', () => setTimeout(onSelect, 10));
    // Giữ vùng chọn khi nhấn nút công cụ (đừng để mousedown xóa selection)
    toolbar.addEventListener('mousedown', (e) => e.preventDefault());
    toolbar.querySelectorAll('[data-annot-action]').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.getAttribute('data-annot-action');
            const sel = window.getSelection();
            const text = sel ? sel.toString().trim() : '';
            const question = state.questions[state.currentIndex];
            if (text.length >= 1 && question && activeScope) {
                addAnnot(question.question, activeScope, text, type);
                sel.removeAllRanges();
                hide();
                showQuestion(); // vẽ lại để áp dụng định dạng
            }
        });
    });
    // Bấm vào một đoạn đã ghi chú để gỡ (capture để không kích hoạt chọn đáp án)
    document.addEventListener('click', (e) => {
        const mark = e.target.closest && e.target.closest('.quiz-annot');
        if (!mark) return;
        const cont = mark.closest('#quizSection [data-annot]');
        if (!cont) return;
        e.preventDefault();
        e.stopPropagation();
        const question = state.questions[state.currentIndex];
        if (question) {
            const scope = cont.getAttribute('data-annot');
            const type = mark.getAttribute('data-annot-type') || 'highlight';
            removeAnnot(question.question, scope, mark.textContent, type);
            showQuestion();
        }
    }, true);
}
