// File: features/quiz/library/library-search.js
// Tìm kiếm thư viện: fuzzy theo bộ đề (Fuse.js) + tìm theo nội dung câu hỏi (chỉ mục tải lười).
// Tách từ quiz-library-controller.js — logic giữ nguyên, chỉ đổi truy cập trạng thái sang S.xxx.

import { auth, db } from '../../../core/firebase-init.js';
import { sessionUser } from '../../../core/auth-session.js';
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { S } from './library-state.js';
import { ensureFullLibraryLoaded } from './library-data.js';
import { renderLibrary } from './library-render.js';

// === TÌM KIẾM THƯ VIỆN FUZZY ===
// Tìm theo bộ đề (title/description) — chạy trực tiếp trên cache metadata, không cần `questions`.
export function filterLibraryByMode(keyword, mode) {
    if (!keyword) return S.userQuizSets;
    if (typeof Fuse === 'undefined') return S.userQuizSets;
    keyword = keyword.toLowerCase();

    if (mode === 'quiz') {
        const fuse = new Fuse(S.userQuizSets, {
            keys: ['title', 'description'],
            threshold: 0.4,
            ignoreLocation: true,
            minMatchCharLength: 2,
        });
        return fuse.search(keyword).map(res => res.item);
    } else if (mode === 'question') {
        // Dùng chỉ mục câu hỏi đã tải lười; nếu chưa có thì trả rỗng (handleLibrarySearch lo việc tải)
        const fuse = new Fuse(S.questionIndexCache || [], {
            keys: ['question'],
            threshold: 0.4,
            ignoreLocation: true,
            minMatchCharLength: 2,
        });
        return fuse.search(keyword).map(res => res.item);
    }
    return S.userQuizSets;
}

// Tải LƯỜI chỉ mục câu hỏi: chỉ kéo nội dung `questions` của toàn bộ bộ đề khi người dùng thực sự
// tìm kiếm theo câu hỏi. Kết quả được cache để các lần gõ sau không phải tải lại.
function ensureQuestionIndex() {
    if (S.isQuestionIndexLoaded) return Promise.resolve(S.questionIndexCache);
    if (S.questionIndexLoadingPromise) return S.questionIndexLoadingPromise;
    const user = sessionUser();
    if (!user) return Promise.resolve([]);

    S.questionIndexLoadingPromise = (async () => {
        const q = query(collection(db, "quiz_sets"), where("userId", "==", user.uid));
        const snap = await getDocs(q);
        const flat = [];
        snap.docs.forEach(docSnap => {
            const data = docSnap.data();
            if (data.deleted) return; // ẩn bộ đề đang trong thùng rác
            if (Array.isArray(data.questions)) {
                data.questions.forEach(qq => {
                    flat.push({
                        quizTitle: data.title || 'Không tên',
                        question: qq.question,
                        options: qq.answers || qq.options || [] // Tương thích cả dạng cũ/mới
                    });
                });
            }
        });
        S.questionIndexCache = flat;
        S.isQuestionIndexLoaded = true;
        S.questionIndexLoadingPromise = null;
        return flat;
    })();
    return S.questionIndexLoadingPromise;
}

// Vô hiệu hoá chỉ mục câu hỏi khi thư viện thay đổi (tạo/sửa/xoá/di chuyển bộ đề) để lần tìm sau tải lại bản mới.
export function invalidateQuestionIndex() {
    S.questionIndexCache = null;
    S.isQuestionIndexLoaded = false;
    S.questionIndexLoadingPromise = null;
}

function highlightKeyword(text, keyword) {
    if (!keyword) return text;
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const words = escaped.split(/\s+/).filter(Boolean);
    if (!words.length) return text;
    const re = new RegExp(`(${words.join('|')})`, 'gi');
    return text.replace(re, '<mark class="bg-yellow-200">$1</mark>');
}

function renderQuestionSearchResults(results) {
    const container = document.getElementById('quiz-list-container');
    if (!container) return;
    const librarySearchInput = document.getElementById('library-search-input');
    const keyword = librarySearchInput ? librarySearchInput.value.trim() : '';

    if (!results.length) {
        container.innerHTML = '<div class="text-gray-400 text-center col-span-full">Không tìm thấy câu hỏi nào phù hợp.</div>';
        return;
    }
    container.innerHTML = results.map(item => `
        <div class="bg-white rounded-xl shadow p-4 border border-pink-100 flex flex-col gap-2">
            <div class="text-pink-600 font-semibold text-base mb-1"><i class="fas fa-book mr-1"></i>${highlightKeyword(item.quizTitle, keyword)}</div>
            <div class="font-bold text-gray-800 mb-2">${highlightKeyword(item.question, keyword)}</div>
            ${item.options && item.options.length ? `<ul class="list-disc ml-5 text-gray-700 mb-2">${item.options.map(opt => `<li>${highlightKeyword(opt, keyword)}</li>`).join('')}</ul>` : ''}
        </div>
    `).join('');
}

export async function handleLibrarySearch() {
    const librarySearchInput = document.getElementById('library-search-input');
    if (!librarySearchInput) return;
    const keyword = librarySearchInput.value.trim();
    const mode = document.querySelector('input[name="search-mode"]:checked')?.value || 'quiz';

    if (mode === 'quiz') {
        // Tìm theo bộ đề phải quét toàn thư viện → nạp đầy đủ trước nếu đang cuốn chiếu
        if (keyword && !S.isLibraryFullyLoaded) {
            await ensureFullLibraryLoaded();
            // Người dùng có thể đã xoá từ khoá trong lúc chờ → kiểm tra lại
            if (librarySearchInput.value.trim() !== keyword) return;
        }
        const filtered = filterLibraryByMode(keyword, 'quiz');
        renderLibrary(filtered);
        return;
    }

    // Tìm theo câu hỏi: cần nội dung `questions` (không có trong cache metadata) → tải lười chỉ mục.
    if (!keyword) {
        renderQuestionSearchResults([]);
        return;
    }

    if (!S.isQuestionIndexLoaded) {
        const container = document.getElementById('quiz-list-container');
        if (container) {
            container.innerHTML = '<div class="text-gray-400 text-center col-span-full py-6"><i class="fas fa-circle-notch fa-spin mr-2"></i>Đang tải nội dung câu hỏi…</div>';
        }
    }

    const index = await ensureQuestionIndex();

    // Người dùng có thể đã đổi từ khoá/chế độ trong lúc chờ tải — bỏ qua kết quả cũ
    const latestKeyword = librarySearchInput.value.trim();
    const latestMode = document.querySelector('input[name="search-mode"]:checked')?.value || 'quiz';
    if (latestMode !== 'question' || latestKeyword !== keyword) return;

    const kw = keyword.toLowerCase();
    const results = index.filter(item => (item.question || '').toLowerCase().includes(kw));
    renderQuestionSearchResults(results);
}
