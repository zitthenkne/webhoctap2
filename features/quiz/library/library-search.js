// File: features/quiz/library/library-search.js
// Tìm kiếm thư viện: fuzzy theo bộ đề (Fuse.js, không dấu) + tìm SÂU theo nội dung câu hỏi (chỉ mục tải lười).
// Giao diện kết quả câu hỏi (thẻ, xem đầy đủ, nhảy sửa, làm ngay, phím tắt) nằm ở library-qsearch.js.

import { db } from '../../../core/firebase-init.js';
import { sessionUser } from '../../../core/auth-session.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { getDocRest, runQueryRest } from '../../../core/firestore-rest.js';
import { stampOf } from '../quiz-fresh.js';
import { qindexGetAll, qindexApply, slimQuestion, QINDEX_V } from './library-qindex.js';
import { S } from './library-state.js';
import { ensureFullLibraryLoaded } from './library-data.js';
import { renderLibrary } from './library-render.js';
import { fold, renderQuestionResults, renderCrossModeHint, rememberSearch, syncSearchUrl, skeletonHtml } from './library-qsearch.js';

export const currentSearchMode = () => document.querySelector('input[name="search-mode"]:checked')?.value || 'quiz';

// === TÌM KIẾM THƯ VIỆN FUZZY ===
// Tìm theo bộ đề (title/description) — chạy trực tiếp trên cache metadata, không cần `questions`.
// getFn bỏ dấu: gõ "tim mach" vẫn ra "Tim mạch".
export function filterLibraryByMode(keyword, mode) {
    if (!keyword) return S.userQuizSets;
    if (typeof Fuse === 'undefined' || mode !== 'quiz') return S.userQuizSets;
    const fuse = new Fuse(S.userQuizSets, {
        keys: ['title', 'description'],
        threshold: 0.4,
        ignoreLocation: true,
        minMatchCharLength: 2,
        getFn: (obj, path) => fold(String(Fuse.config.getFn(obj, path) || '')),
    });
    return fuse.search(fold(keyword)).map(res => res.item);
}

// Tải LƯỜI chỉ mục câu hỏi khi người dùng thực sự tìm theo câu hỏi. Chỉ mục BỀN trong IndexedDB (library-qindex.js), mỗi bộ đề một bản
// gọn kèm dấu updatedAt — chỉ tải lại những bộ ĐỔI dấu / MỚI / khác phiên bản cấu trúc (QINDEX_V).
// Bộ cũ chưa có updatedAt: tin bản chỉ mục tối đa QINDEX_LEGACY_TTL_MS (không có dấu thì không thể biết có đổi hay không).
const QINDEX_LEGACY_TTL_MS = 24 * 60 * 60 * 1000;
const QINDEX_REST_BATCH_MIN = 20;       // cần tải lại từ chừng này bộ trở lên thì dùng MỘT truy vấn gộp thay vì từng bộ
const QINDEX_CONCURRENCY = 6;

// Bộ đề "tách vỏ – ruột": quiz_sets chỉ còn metadata, câu hỏi nằm ở quiz_payloads (giống editor/quiz-session).
// Trước đây chỉ mục bỏ qua nhánh này → bộ đề lớn KHÔNG BAO GIỜ tìm thấy câu hỏi.
async function fetchPayloadOf(id) {
    try {
        const p = await getDocRest('quiz_payloads', id, ['questions'], { requireUser: true });
        if (p && Array.isArray(p.questions)) return p.questions;
    } catch (e) { /* thử SDK */ }
    try { const s = await getDoc(doc(db, 'quiz_payloads', id)); return s.exists() && Array.isArray(s.data().questions) ? s.data().questions : null; } catch (e) { return null; }
}

async function fetchQuestionsOf(id) {
    let qs = null;
    try {
        const d = await getDocRest('quiz_sets', id, ['questions'], { requireUser: true });
        qs = d ? (Array.isArray(d.questions) ? d.questions : []) : null;
    } catch (e) {
        try { const snap = await getDoc(doc(db, 'quiz_sets', id)); qs = snap.exists() ? (snap.data().questions || []) : null; } catch (e2) { qs = null; }
    }
    if (Array.isArray(qs) && !qs.length) return (await fetchPayloadOf(id)) || qs;
    return qs;
}

function readMyNotes(id) {
    try { return JSON.parse(localStorage.getItem(`quiz_notes_${id}`) || '{}') || {}; } catch (e) { return {}; }
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
        const fresh = e && e.v === QINDEX_V && sameCount && (stamp ? e.stamp === stamp : (e.stamp === 0 && now - (e.at || 0) < QINDEX_LEGACY_TTL_MS));
        if (fresh) entries.set(m.id, e); else stale.push({ m, stamp });
    }
    const toPut = [];
    const keep = (m, stamp, qs) => {
        const rec = { id: m.id, uid: user.uid, v: QINDEX_V, stamp, n: qs.length, at: now, title: m.title || 'Không tên', qs: qs.map(slimQuestion) };
        entries.set(m.id, rec); toPut.push(rec);
    };
    if (stale.length >= QINDEX_REST_BATCH_MIN) {
        // nhiều bộ cần tải (lần đầu): MỘT truy vấn REST kéo câu hỏi của tất cả (cùng số byte như trước nhưng một yêu cầu, không dư trường)
        let rows = null;
        try { rows = await runQueryRest({ collection: 'quiz_sets', where: [['userId', user.uid]], select: ['questions'], requireUser: true }); } catch (e) { rows = null; }
        const byId = rows ? new Map(rows.map(r => [r.id, r.questions])) : null;
        for (const { m, stamp } of stale) {
            let qs = byId ? byId.get(m.id) : undefined;
            if (!Array.isArray(qs) || !qs.length) qs = await fetchQuestionsOf(m.id);   // bộ được chia sẻ (không thuộc truy vấn) / tách payload
            if (Array.isArray(qs)) keep(m, stamp, qs);
        }
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
        const notes = readMyNotes(m.id);
        const title = m.title || e.title || 'Không tên';
        e.qs.forEach((qq, i) => flat.push({ ...qq, id: m.id, quizTitle: title, i, n: e.qs.length, myNote: String(notes[qq.question] || '').trim() }));
    }
    return flat;
}

export function ensureQuestionIndex() {
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

let _debounce = 0;
export function handleLibrarySearch() {
    // Tìm câu hỏi quét hàng nghìn câu → chờ gõ xong 140ms; tìm bộ đề rẻ → chạy ngay như cũ
    clearTimeout(_debounce);
    if (currentSearchMode() === 'question') { _debounce = setTimeout(runLibrarySearch, 140); return Promise.resolve(); }
    return runLibrarySearch();
}

async function runLibrarySearch() {
    const librarySearchInput = document.getElementById('library-search-input');
    if (!librarySearchInput) return;
    const keyword = librarySearchInput.value.trim();
    const mode = currentSearchMode();
    syncSearchUrl(keyword, mode);
    if (keyword) rememberSearch(keyword);

    if (mode === 'quiz') {
        // Tìm theo bộ đề phải quét toàn thư viện → nạp đầy đủ trước nếu đang cuốn chiếu
        if (keyword && !S.isLibraryFullyLoaded) {
            await ensureFullLibraryLoaded();
            // Người dùng có thể đã xoá từ khoá trong lúc chờ → kiểm tra lại
            if (librarySearchInput.value.trim() !== keyword) return;
        }
        renderLibrary(filterLibraryByMode(keyword, 'quiz'));
        if (keyword.length >= 2) renderCrossModeHint(keyword);
        return;
    }

    // Từ khoá trống ở chế độ câu hỏi → hiện thư viện bình thường (trước đây ra màn "Không tìm thấy" trống trơn)
    if (!keyword) { renderLibrary(S.userQuizSets); return; }

    if (!S.isQuestionIndexLoaded) {
        renderLibrary([]);                                  // đặt bố cục "đang tìm" (ẩn thư mục, làm gần đây, phân trang)
        const container = document.getElementById('quiz-list-container');
        if (container) {
            container.className = 'qs-results';
            container.innerHTML = skeletonHtml();
        }
    }

    let index;
    try { index = await ensureQuestionIndex(); } catch (e) { index = []; }

    // Người dùng có thể đã đổi từ khoá/chế độ trong lúc chờ tải — bỏ qua kết quả cũ
    if (currentSearchMode() !== 'question' || librarySearchInput.value.trim() !== keyword) return;
    renderLibrary([]);
    renderQuestionResults(index, keyword);
}
