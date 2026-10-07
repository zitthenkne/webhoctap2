// File: features/quiz/library/library-search.js
// Tìm kiếm thư viện: fuzzy theo bộ đề (Fuse.js) + tìm theo nội dung câu hỏi (chỉ mục tải lười).
// Tách từ quiz-library-controller.js — logic giữ nguyên, chỉ đổi truy cập trạng thái sang S.xxx.

import { auth, db } from '../../../core/firebase-init.js';
import { sessionUser } from '../../../core/auth-session.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { getDocRest, runQueryRest } from '../../../core/firestore-rest.js';
import { stampOf } from '../quiz-fresh.js';
import { qindexGetAll, qindexApply, slimQuestion } from './library-qindex.js';
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

// Tải LƯỜI chỉ mục câu hỏi khi người dùng thực sự tìm theo câu hỏi. Bản C4: chỉ mục BỀN trong IndexedDB (library-qindex.js), mỗi bộ đề một bản
// gọn kèm dấu updatedAt — chỉ tải lại những bộ ĐỔI dấu / MỚI; trước đây MỖI lần mở trang kéo cả bộ câu hỏi của MỌI bộ đề (N × hàng trăm KB).
// Bộ cũ chưa có updatedAt: tin bản chỉ mục tối đa QINDEX_LEGACY_TTL_MS (không có dấu thì không thể biết có đổi hay không).
const QINDEX_LEGACY_TTL_MS = 24 * 60 * 60 * 1000;
const QINDEX_REST_BATCH_MIN = 20;       // cần tải lại từ chừng này bộ trở lên thì dùng MỘT truy vấn gộp thay vì từng bộ
const QINDEX_CONCURRENCY = 6;

async function fetchQuestionsOf(id) {
    try {
        const d = await getDocRest('quiz_sets', id, ['questions'], { requireUser: true });
        return d ? (Array.isArray(d.questions) ? d.questions : []) : null;
    } catch (e) {
        try { const snap = await getDoc(doc(db, 'quiz_sets', id)); return snap.exists() ? (snap.data().questions || []) : null; } catch (e2) { return null; }
    }
}

async function buildQuestionIndex(user) {
    await ensureFullLibraryLoaded();                         // cần metadata đủ (kèm updatedAt, questionCount) — nhẹ, qua REST
    const metas = (S.userQuizSets || []).filter(m => !m.deleted);
    const stored = await qindexGetAll(user.uid);
    const now = Date.now();
    const entries = new Map();
    const stale = [];
    for (const m of metas) {
        const e = stored.get(m.id);
        const stamp = stampOf(m.updatedAt);
        const sameCount = m.questionCount == null || e?.n === m.questionCount;
        const fresh = e && sameCount && (stamp ? e.stamp === stamp : (e.stamp === 0 && now - (e.at || 0) < QINDEX_LEGACY_TTL_MS));
        if (fresh) entries.set(m.id, e); else stale.push({ m, stamp });
    }
    const toPut = [];
    const keep = (m, stamp, qs) => {
        const rec = { id: m.id, uid: user.uid, stamp, n: qs.length, at: now, title: m.title || 'Không tên', qs: qs.map(slimQuestion) };
        entries.set(m.id, rec); toPut.push(rec);
    };
    if (stale.length >= QINDEX_REST_BATCH_MIN) {
        // nhiều bộ cần tải (lần đầu): MỘT truy vấn REST kéo câu hỏi của tất cả (cùng số byte như trước nhưng một yêu cầu, không dư trường)
        let rows = null;
        try { rows = await runQueryRest({ collection: 'quiz_sets', where: [['userId', user.uid]], select: ['questions'], requireUser: true }); } catch (e) { rows = null; }
        const byId = rows ? new Map(rows.map(r => [r.id, r.questions])) : null;
        for (const { m, stamp } of stale) { const qs = byId ? byId.get(m.id) : await fetchQuestionsOf(m.id); if (Array.isArray(qs)) keep(m, stamp, qs); }
    } else {
        let next = 0;
        await Promise.all(Array.from({ length: Math.min(QINDEX_CONCURRENCY, stale.length) }, async () => {
            while (next < stale.length) {
                const { m, stamp } = stale[next++];
                const qs = await fetchQuestionsOf(m.id);
                if (Array.isArray(qs)) keep(m, stamp, qs);
            }
        }));
    }
    const live = new Set(metas.map(m => m.id));
    const del = [...stored.keys()].filter(id => !live.has(id));      // bộ đã xóa / vào thùng rác → bỏ khỏi chỉ mục
    qindexApply({ put: toPut, del });
    const flat = [];
    for (const m of metas) {
        const e = entries.get(m.id);
        if (!e) continue;
        e.qs.forEach(qq => flat.push({ quizTitle: m.title || e.title || 'Không tên', question: qq.question, options: qq.options || [] }));
    }
    return flat;
}

function ensureQuestionIndex() {
    if (S.isQuestionIndexLoaded) return Promise.resolve(S.questionIndexCache);
    if (S.questionIndexLoadingPromise) return S.questionIndexLoadingPromise;
    const user = sessionUser();
    if (!user) return Promise.resolve([]);

    S.questionIndexLoadingPromise = (async () => {
        const flat = await buildQuestionIndex(user);
        S.questionIndexCache = flat;
        S.isQuestionIndexLoaded = true;
        S.questionIndexLoadingPromise = null;
        return flat;
    })().catch((e) => { S.questionIndexLoadingPromise = null; throw e; });
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
