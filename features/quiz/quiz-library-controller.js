// File: features/quiz/quiz-library-controller.js
// Module chịu trách nhiệm quản lý thư viện bộ đề, thư mục, trạng thái chọn nhiều, tìm kiếm fuzzy và lưu trữ quiz lên Firestore

import { auth, db } from '../../core/firebase-init.js';
import { 
    doc, setDoc, collection, addDoc, query, where, getDocs, getDoc, 
    orderBy, limit, deleteDoc, updateDoc, runTransaction, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { showToast, showConfirm } from '../../core/utils.js';
import { checkAndAwardAchievement } from '../../core/achievements.js';

// Trạng thái câu hỏi upload từ file
let questions = [];
let currentQuizTitle = '';

// Trạng thái thư viện
let userQuizSets = []; // Cache bộ đề client-side
let currentFolderId = null;
let userFolders = [];
let selectedFolderIcon = 'fa-folder';
let selectedFolderColor = 'amber';
let isSelectionMode = false;
let selectedQuizIds = [];

let currentLibraryPage = 1;
let isLibraryFullyLoaded = false;
let isBulkMoving = false;
let libraryLayoutMode = localStorage.getItem('libraryLayoutMode') || 'grid';
// Số cột lưới do người dùng tự chọn, lưu cục bộ theo thiết bị ('auto' = tự co giãn theo màn hình)
let libraryGridCols = localStorage.getItem('libraryGridCols') || 'auto';
let folderGridCols = localStorage.getItem('folderGridCols') || 'auto';
let currentFolderPage = 1;
let foldersExpanded = false; // false: phân trang 10 thư mục/trang; true: hiện tất cả

// Sắp xếp, lọc & ghim
let librarySortMode = localStorage.getItem('librarySortMode') || 'newest'; // newest | oldest | name | count
let libraryFilterMode = 'all'; // all | recent | pinned
let pinnedQuizIds = [];

const FOLDERS_PER_PAGE = 10;
const FOLDER_COLORS = {
    amber: { bg: 'bg-amber-50/50 hover:bg-amber-50 border-amber-100', iconBg: 'bg-amber-100 text-amber-600' },
    pink: { bg: 'bg-pink-50/50 hover:bg-pink-50 border-pink-100', iconBg: 'bg-pink-100 text-pink-600' },
    blue: { bg: 'bg-blue-50/50 hover:bg-blue-50 border-blue-100', iconBg: 'bg-blue-100 text-blue-600' },
    green: { bg: 'bg-green-50/50 hover:bg-green-50 border-green-100', iconBg: 'bg-green-100 text-green-600' },
    purple: { bg: 'bg-purple-50/50 hover:bg-purple-50 border-purple-100', iconBg: 'bg-purple-100 text-purple-600' },
    red: { bg: 'bg-red-50/50 hover:bg-red-50 border-red-100', iconBg: 'bg-red-100 text-red-600' },
    indigo: { bg: 'bg-indigo-50/50 hover:bg-indigo-50 border-indigo-100', iconBg: 'bg-indigo-100 text-indigo-600' }
};

// Bảng màu rút gọn cho thao tác "đổi màu nhanh" trong menu thư mục
const FOLDER_SWATCHES = [
    { key: 'amber', hex: '#f59e0b', label: 'Hổ phách' },
    { key: 'pink', hex: '#ec4899', label: 'Hồng' },
    { key: 'red', hex: '#ef4444', label: 'Đỏ' },
    { key: 'green', hex: '#22c55e', label: 'Xanh lá' },
    { key: 'blue', hex: '#3b82f6', label: 'Xanh dương' },
    { key: 'indigo', hex: '#6366f1', label: 'Chàm' },
    { key: 'purple', hex: '#a855f7', label: 'Tím' }
];

// Map nhanh từ tên màu sẵn có → mã hex, để tô màu toàn bộ thẻ thư mục theo một code path duy nhất
const FOLDER_COLOR_HEX = Object.fromEntries(FOLDER_SWATCHES.map(s => [s.key, s.hex]));

// === THÙNG RÁC ===
// Xóa thư mục / bộ đề sẽ chuyển vào thùng rác (đánh dấu deleted) và tự xóa vĩnh viễn sau 30 ngày.
// Giao diện xem/khôi phục nằm ở trang riêng features/quiz/trash.html (cho index.html nhẹ hơn).
const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function tsToMillis(ts) {
    if (!ts) return 0;
    if (typeof ts.toDate === 'function') return ts.toDate().getTime();
    const t = new Date(ts).getTime();
    return Number.isNaN(t) ? 0 : t;
}
function isTrashExpired(deletedAt) {
    return (Date.now() - tsToMillis(deletedAt)) > TRASH_RETENTION_MS;
}
// Xóa vĩnh viễn các mục đã quá hạn 30 ngày (chạy ké trên dữ liệu đã tải sẵn nên không tốn thêm lượt đọc)
function purgeExpiredTrash(items, collectionName) {
    const expired = items.filter(it => it.deleted && isTrashExpired(it.deletedAt));
    if (!expired.length) return;
    Promise.allSettled(expired.map(it => deleteDoc(doc(db, collectionName, it.id))))
        .catch(err => console.warn('Lỗi dọn thùng rác quá hạn:', err));
}

// Sắp xếp thư mục: ghim lên đầu → theo thứ tự kéo-thả thủ công → mới nhất trước
function sortUserFolders() {
    userFolders.sort((a, b) => {
        const ap = a.pinned ? 1 : 0;
        const bp = b.pinned ? 1 : 0;
        if (ap !== bp) return bp - ap;
        const ao = (typeof a.order === 'number') ? a.order : Number.MAX_SAFE_INTEGER;
        const bo = (typeof b.order === 'number') ? b.order : Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        return new Date(b.createdAt) - new Date(a.createdAt);
    });
}

// Getters & Setters cho câu hỏi upload
export function getQuestions() { return questions; }
export function setQuestions(qs) { questions = qs; }
export function getCurrentQuizTitle() { return currentQuizTitle; }
export function setCurrentQuizTitle(title) { currentQuizTitle = title; }

// Getters & Setters trạng thái Selection
export function getIsSelectionMode() { return isSelectionMode; }
export function setIsSelectionMode(val) { isSelectionMode = val; }
export function getSelectedQuizIds() { return selectedQuizIds; }
export function setSelectedQuizIds(val) { selectedQuizIds = val; }
export function getUserQuizSets() { return userQuizSets; }
export function getLibraryLayoutMode() { return libraryLayoutMode; }
export function setLibraryLayoutMode(mode) {
    libraryLayoutMode = mode;
    localStorage.setItem('libraryLayoutMode', mode);
}
// Số cột lưới tuỳ chỉnh (lưu cục bộ theo thiết bị) — 'auto' hoặc số dạng chuỗi
export function getLibraryGridCols() { return libraryGridCols; }
export function setLibraryGridCols(cols) {
    libraryGridCols = cols;
    localStorage.setItem('libraryGridCols', cols);
}
export function getFolderGridCols() { return folderGridCols; }
export function setFolderGridCols(cols) {
    folderGridCols = cols;
    localStorage.setItem('folderGridCols', cols);
}

// Áp dụng số cột tuỳ chỉnh cho lưới bộ đề (chỉ ở chế độ lưới; danh sách bỏ qua)
function applyQuizGridColumns(container) {
    if (!container) return;
    if (libraryLayoutMode === 'list' || !libraryGridCols || libraryGridCols === 'auto') {
        container.style.gridTemplateColumns = '';
    } else {
        container.style.gridTemplateColumns = `repeat(${libraryGridCols}, minmax(0, 1fr))`;
    }
}

// Áp dụng số cột tuỳ chỉnh cho lưới thư mục
function applyFolderGridColumns(container) {
    if (!container) return;
    if (!folderGridCols || folderGridCols === 'auto') {
        container.classList.remove('folders-custom-cols');
        container.style.removeProperty('--folder-grid-cols');
    } else {
        container.classList.add('folders-custom-cols');
        container.style.setProperty('--folder-grid-cols', `repeat(${folderGridCols}, minmax(0, 1fr))`);
    }
}

export function getCurrentLibraryPage() { return currentLibraryPage; }

// Getters & Setters cho Sắp xếp / Lọc
export function getLibrarySortMode() { return librarySortMode; }
export function setLibrarySortMode(mode) {
    librarySortMode = mode;
    localStorage.setItem('librarySortMode', mode);
    currentLibraryPage = 1;
    rerenderCurrentView();
}
export function getLibraryFilterMode() { return libraryFilterMode; }
export function setLibraryFilterMode(mode) {
    libraryFilterMode = mode;
    currentLibraryPage = 1;
    rerenderCurrentView();
}

// === GHIM BỘ ĐỀ (PIN) — lưu cục bộ theo từng tài khoản ===
function pinnedStorageKey() {
    const uid = auth.currentUser ? auth.currentUser.uid : 'anon';
    return `pinnedQuizIds_${uid}`;
}
function loadPinnedQuizIds() {
    try {
        pinnedQuizIds = JSON.parse(localStorage.getItem(pinnedStorageKey()) || '[]');
        if (!Array.isArray(pinnedQuizIds)) pinnedQuizIds = [];
    } catch {
        pinnedQuizIds = [];
    }
}
function savePinnedQuizIds() {
    localStorage.setItem(pinnedStorageKey(), JSON.stringify(pinnedQuizIds));
}
function isPinned(quizId) { return pinnedQuizIds.includes(quizId); }
export function togglePin(quizId) {
    const idx = pinnedQuizIds.indexOf(quizId);
    if (idx >= 0) pinnedQuizIds.splice(idx, 1);
    else pinnedQuizIds.push(quizId);
    savePinnedQuizIds();
    rerenderCurrentView();
}

// === HỖ TRỢ SẮP XẾP / LỌC ===
function getQuizTime(q) {
    if (q.createdAt && typeof q.createdAt.toDate === 'function') return q.createdAt.toDate().getTime();
    return q.createdAt ? new Date(q.createdAt).getTime() : 0;
}
function isNewQuiz(q) {
    return (Date.now() - getQuizTime(q)) <= 24 * 60 * 60 * 1000;
}
function applyLibraryFilter(list) {
    if (libraryFilterMode === 'pinned') return list.filter(q => isPinned(q.id));
    if (libraryFilterMode === 'recent') {
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        return list.filter(q => getQuizTime(q) >= weekAgo);
    }
    return list;
}
function sortQuizList(list) {
    const arr = [...list];
    switch (librarySortMode) {
        case 'oldest': arr.sort((a, b) => getQuizTime(a) - getQuizTime(b)); break;
        case 'name': arr.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'vi', { sensitivity: 'base' })); break;
        case 'count': arr.sort((a, b) => (b.questionCount || 0) - (a.questionCount || 0)); break;
        case 'newest':
        default: arr.sort((a, b) => getQuizTime(b) - getQuizTime(a));
    }
    // Bộ đề đã ghim luôn nổi lên đầu (sort ổn định nên giữ nguyên thứ tự còn lại)
    arr.sort((a, b) => (isPinned(b.id) ? 1 : 0) - (isPinned(a.id) ? 1 : 0));
    return arr;
}

/**
 * Lưu bộ đề và chuyển sang màn hình làm quiz
 */
export async function saveAndStartQuiz() {
    const user = auth.currentUser;
    const processBtn = document.getElementById('processBtn');
    if (!user) {
        showToast('Vui lòng đăng nhập để lưu bộ đề.', 'info');
        const authModal = document.getElementById('authModal');
        if (authModal) authModal.classList.remove('hidden');
        return;
    }
    if (questions.length === 0) return showToast('Không có câu hỏi để bắt đầu.', 'warning');
    if (processBtn) {
        processBtn.disabled = true;
        processBtn.innerHTML = 'Đang chuẩn bị...';
    }

    try {
        const docRef = await addDoc(collection(db, "quiz_sets"), {
            userId: user.uid,
            title: currentQuizTitle,
            questionCount: questions.length,
            questions: questions,
            createdAt: new Date(),
            isPublic: true,
            folderId: currentFolderId || null
        });
        await checkCreationAchievements(user.uid);
        window.location.href = `features/quiz/quiz.html?id=${docRef.id}`;
    } catch (e) {
        showToast('Lỗi khi lưu bộ đề: ' + e.message, 'error');
        if (processBtn) {
            processBtn.disabled = false;
            processBtn.innerHTML = '<i class="fas fa-play-circle mr-2"></i> Bắt đầu';
        }
        console.error("Lỗi:", e);
    }
}

/**
 * Lưu bộ đề vào thư viện (không bắt đầu làm ngay)
 */
export async function saveOnly() {
    const user = auth.currentUser;
    const saveBtnPreQuiz = document.getElementById('saveBtn-preQuiz');
    if (!user) {
        showToast('Vui lòng đăng nhập để lưu bộ đề.', 'info');
        const authModal = document.getElementById('authModal');
        if (authModal) authModal.classList.remove('hidden');
        return;
    }
    if (questions.length === 0) return showToast('Không có câu hỏi để lưu.', 'warning');
    if (saveBtnPreQuiz) {
        saveBtnPreQuiz.disabled = true;
        saveBtnPreQuiz.innerHTML = 'Đang lưu...';
    }

    try {
        await addDoc(collection(db, "quiz_sets"), {
            userId: user.uid,
            title: currentQuizTitle,
            questionCount: questions.length,
            questions: questions,
            createdAt: new Date(),
            isPublic: true,
            folderId: currentFolderId || null
        });
        await checkCreationAchievements(user.uid);
        showToast(`Đã lưu "${currentQuizTitle}" vào thư viện!`, 'success');
        if (saveBtnPreQuiz) saveBtnPreQuiz.innerHTML = '✓ Đã lưu';
    } catch (e) {
        if (saveBtnPreQuiz) {
            saveBtnPreQuiz.disabled = false;
            saveBtnPreQuiz.innerHTML = 'Lưu';
        }
        showToast('Lỗi khi lưu: ' + e.message, 'error');
        console.error("Lỗi:", e);
    }
}

async function checkCreationAchievements(userId) {
    const userRef = doc(db, "users", userId);
    try {
        await runTransaction(db, async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists()) throw "Tài liệu người dùng không tồn tại!";
            const newCount = (userDoc.data().quizSetsCreated || 0) + 1;
            transaction.update(userRef, { quizSetsCreated: newCount });

            if (newCount === 5) {
                checkAndAwardAchievement(userId, 'COLLECTOR');
            }
        });
    } catch (e) {
        console.error("Lỗi giao dịch khi kiểm tra thành tựu: ", e);
    }
}

// === TÌM KIẾM THƯ VIỆN FUZZY ===
export function filterLibraryByMode(keyword, mode) {
    if (!keyword) return userQuizSets;
    if (typeof Fuse === 'undefined') return userQuizSets;
    keyword = keyword.toLowerCase();
    
    if (mode === 'quiz') {
        const fuse = new Fuse(userQuizSets, {
            keys: ['title', 'description'],
            threshold: 0.4,
            ignoreLocation: true,
            minMatchCharLength: 2,
        });
        return fuse.search(keyword).map(res => res.item);
    } else if (mode === 'question') {
        let allQuestions = [];
        userQuizSets.forEach(qz => {
            if (Array.isArray(qz.questions)) {
                qz.questions.forEach(q => {
                    allQuestions.push({
                        quizTitle: qz.title || 'Không tên',
                        question: q.question,
                        options: q.answers || q.options || [] // Tương thích cả dạng cũ/mới
                    });
                });
            }
        });
        const fuse = new Fuse(allQuestions, {
            keys: ['question'],
            threshold: 0.4,
            ignoreLocation: true,
            minMatchCharLength: 2,
        });
        return fuse.search(keyword).map(res => res.item);
    }
    return userQuizSets;
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

export function handleLibrarySearch() {
    const librarySearchInput = document.getElementById('library-search-input');
    if (!librarySearchInput) return;
    const keyword = librarySearchInput.value.trim();
    const mode = document.querySelector('input[name="search-mode"]:checked')?.value || 'quiz';
    
    if (mode === 'quiz') {
        const filtered = filterLibraryByMode(keyword, 'quiz');
        renderLibrary(filtered);
    } else {
        let results = [];
        if (keyword) {
            userQuizSets.forEach(qz => {
                if (Array.isArray(qz.questions)) {
                    qz.questions.forEach(q => {
                        if ((q.question || '').toLowerCase().includes(keyword.toLowerCase())) {
                            results.push({
                                quizTitle: qz.title || 'Không tên',
                                question: q.question,
                                options: q.answers || q.options || []
                            });
                        }
                    });
                }
            });
        }
        renderQuestionSearchResults(results);
    }
}

// === TẢI VÀ RENDER THƯ VIỆN ===
export async function loadAndDisplayLibrary(page = 1) {
    if (typeof page !== 'number') page = 1;
    const user = auth.currentUser;
    const quizListContainer = document.getElementById('quiz-list-container');
    if (!quizListContainer) return;

    if (!user) {
        quizListContainer.innerHTML = '<p>Vui lòng <a href="#" id="login-link" class="text-[#FF69B4] underline">đăng nhập</a>.</p>';
        const loginLink = document.getElementById('login-link');
        if (loginLink) {
            loginLink.onclick = (e) => {
                e.preventDefault();
                const authModal = document.getElementById('authModal');
                if (authModal) authModal.classList.remove('hidden');
            };
        }
        return;
    }

    currentLibraryPage = page;
    loadPinnedQuizIds();

    if (isLibraryFullyLoaded) {
        renderBreadcrumb();
        renderLibrary(userQuizSets, currentLibraryPage);
        return;
    }

    if (page === 1) {
        renderLibrarySkeleton(quizListContainer);
    }

    try {
        const qFolders = query(collection(db, "quiz_folders"), where("userId", "==", user.uid));
        const querySnapshotFolders = await getDocs(qFolders);
        const allFolders = querySnapshotFolders.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
        purgeExpiredTrash(allFolders, "quiz_folders"); // dọn thư mục quá hạn 30 ngày
        userFolders = allFolders.filter(f => !f.deleted); // ẩn thư mục đang trong thùng rác
        sortUserFolders();

        const q = query(
            collection(db, "quiz_sets"),
            where("userId", "==", user.uid),
            orderBy("createdAt", "desc"),
            limit(13)
        );

        const querySnapshot = await getDocs(q);
        const pageQuizzes = querySnapshot.docs
            .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
            .filter(q => !q.deleted); // ẩn bộ đề đang trong thùng rác

        renderBreadcrumb();
        renderLibrary(pageQuizzes, 1);

        loadAllLibraryInBackground(user.uid);
    } catch (e) {
        console.error("Lỗi tải thư viện: ", e);
        quizListContainer.innerHTML = '<p class="text-red-500">Lỗi tải thư viện: ' + e.message + '</p>';
    }
}

async function loadAllLibraryInBackground(userId) {
    try {
        const q = query(collection(db, "quiz_sets"), where("userId", "==", userId));
        const querySnapshot = await getDocs(q);
        const allQuizzes = querySnapshot.docs.map(docSnap => {
            const data = docSnap.data();
            if (data.folderId === undefined) {
                updateDoc(docSnap.ref, { folderId: null }).catch(err => {
                    console.warn(`Lỗi tự động cập nhật folderId cho bộ đề ${docSnap.id}:`, err);
                });
                return { id: docSnap.id, ...data, folderId: null };
            }
            return { id: docSnap.id, ...data };
        });
        purgeExpiredTrash(allQuizzes, "quiz_sets"); // dọn bộ đề quá hạn 30 ngày
        userQuizSets = allQuizzes.filter(q => !q.deleted); // ẩn bộ đề đang trong thùng rác

        userQuizSets.sort((a, b) => {
            const timeA = a.createdAt && typeof a.createdAt.toDate === 'function' ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
            const timeB = b.createdAt && typeof b.createdAt.toDate === 'function' ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
            return timeB - timeA;
        });

        isLibraryFullyLoaded = true;
        renderLibrary(userQuizSets, currentLibraryPage);
    } catch (err) {
        console.error("Lỗi tải thư viện chạy ngầm: ", err);
    }
}

function getQuizCardClassName(isSelected = false) {
    if (libraryLayoutMode === 'list') {
        if (isSelectionMode) {
            return isSelected 
                ? 'bg-pink-50/20 rounded-xl border-2 border-pink-500 p-4 shadow-md flex items-center justify-between gap-4 cursor-pointer transition-all duration-200 relative'
                : 'bg-white rounded-xl border border-pink-100 p-4 shadow-sm flex items-center justify-between gap-4 cursor-pointer hover:border-pink-300 transition-all duration-200 relative';
        } else {
            return 'bg-white rounded-xl border border-gray-100 p-4 shadow-sm hover:shadow-md hover:border-pink-200 cursor-pointer transition-all duration-200 flex items-center justify-between gap-4 relative';
        }
    } else {
        if (isSelectionMode) {
            return isSelected 
                ? 'bg-pink-50/20 rounded-2xl border-2 border-pink-500 p-5 shadow-md flex flex-col cursor-pointer transition-all duration-300 relative'
                : 'bg-white rounded-2xl border border-pink-100 p-5 shadow-sm flex flex-col cursor-pointer hover:border-pink-300 transition-all duration-300 relative';
        } else {
            return 'bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:-translate-y-1 hover:shadow-md hover:border-pink-200 cursor-pointer transition-all duration-300 flex flex-col relative';
        }
    }
}

export function updateLayoutButtons() {
    const gridBtn = document.getElementById('library-layout-grid-btn');
    const listBtn = document.getElementById('library-layout-list-btn');
    if (!gridBtn || !listBtn) return;
    
    if (libraryLayoutMode === 'list') {
        listBtn.classList.remove('text-gray-500');
        listBtn.classList.add('bg-white', 'text-pink-600', 'shadow-sm');
        gridBtn.classList.remove('bg-white', 'text-pink-600', 'shadow-sm');
        gridBtn.classList.add('text-gray-500');
    } else {
        gridBtn.classList.remove('text-gray-500');
        gridBtn.classList.add('bg-white', 'text-pink-600', 'shadow-sm');
        listBtn.classList.remove('bg-white', 'text-pink-600', 'shadow-sm');
        listBtn.classList.add('text-gray-500');
    }
}

// === THANH TỔNG QUAN NHANH ===
function updateLibraryOverview() {
    const elQuizzes = document.getElementById('lib-stat-quizzes');
    const elQuestions = document.getElementById('lib-stat-questions');
    const elFolders = document.getElementById('lib-stat-folders');
    if (!elQuizzes && !elQuestions && !elFolders) return;

    if (!isLibraryFullyLoaded) {
        if (elQuizzes) elQuizzes.textContent = '…';
        if (elQuestions) elQuestions.textContent = '…';
        if (elFolders) elFolders.textContent = userFolders.length || '…';
        return;
    }
    const totalQuestions = userQuizSets.reduce((sum, q) => sum + (q.questionCount || 0), 0);
    const fmt = (n) => n.toLocaleString('vi-VN');
    if (elQuizzes) elQuizzes.textContent = fmt(userQuizSets.length);
    if (elQuestions) elQuestions.textContent = fmt(totalQuestions);
    if (elFolders) elFolders.textContent = fmt(userFolders.length);
}

// === SKELETON LOADING ===
function renderLibrarySkeleton(container, count = 8) {
    if (!container) return;
    container.className = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6';
    applyQuizGridColumns(container);
    let html = '';
    for (let i = 0; i < count; i++) {
        html += `
            <div class="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex flex-col">
                <div class="skeleton-line h-4 w-3/4 mb-3"></div>
                <div class="skeleton-line h-4 w-1/2 mb-4"></div>
                <div class="flex gap-2 mb-4">
                    <div class="skeleton-line h-6 w-20 rounded-full"></div>
                    <div class="skeleton-line h-6 w-24 rounded-full"></div>
                </div>
                <div class="mt-auto pt-3 border-t border-gray-50 flex justify-between items-center">
                    <div class="skeleton-line h-7 w-24 rounded-lg"></div>
                    <div class="skeleton-line h-8 w-24 rounded-xl"></div>
                </div>
            </div>`;
    }
    container.innerHTML = html;
}

// === TRẠNG THÁI RỖNG ===
function renderEmptyState(container, type) {
    if (!container) return;
    let icon, title, desc, ctaHTML = '';
    if (type === 'search') {
        icon = 'fa-magnifying-glass';
        title = 'Không tìm thấy kết quả';
        desc = 'Thử từ khoá khác hoặc kiểm tra lại chính tả nhé.';
    } else if (type === 'folder') {
        icon = 'fa-folder-open';
        title = 'Thư mục này đang trống';
        desc = 'Kéo-thả bộ đề vào đây, hoặc dùng nút “Di chuyển” trên mỗi bộ đề.';
    } else if (type === 'filter') {
        icon = 'fa-filter';
        title = 'Không có bộ đề nào khớp bộ lọc';
        desc = 'Thử đổi sang “Tất cả” để xem toàn bộ thư viện.';
    } else {
        icon = 'fa-book-open';
        title = 'Thư viện của bạn đang trống';
        desc = 'Tạo bộ đề đầu tiên để bắt đầu ôn luyện thôi nào!';
        ctaHTML = `
            <button type="button" id="empty-create-quiz-btn"
                class="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-pink-500 to-rose-400 hover:from-pink-600 hover:to-rose-500 text-white rounded-xl font-bold text-sm shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all">
                <i class="fas fa-plus"></i> Tạo bộ đề đầu tiên
            </button>`;
    }
    const wrap = document.createElement('div');
    wrap.className = 'col-span-full flex flex-col items-center justify-center text-center py-14 px-4';
    wrap.innerHTML = `
        <div class="w-20 h-20 rounded-full bg-pink-50 flex items-center justify-center mb-4">
            <i class="fas ${icon} text-3xl text-pink-300"></i>
        </div>
        <h3 class="text-lg font-bold text-gray-700">${title}</h3>
        <p class="text-sm text-gray-400 mt-1 max-w-xs">${desc}</p>
        ${ctaHTML}
    `;
    container.appendChild(wrap);
    const ctaBtn = wrap.querySelector('#empty-create-quiz-btn');
    if (ctaBtn) {
        ctaBtn.addEventListener('click', () => {
            const navLink = document.querySelector('.nav-link[data-target="createQuizContent"]');
            if (navLink) navLink.click();
        });
    }
}

export function renderLibrary(quizzesToDisplay, page = 1) {
    if (typeof page !== 'number') page = 1;
    const quizListContainer = document.getElementById('quiz-list-container');
    if (quizListContainer) {
        if (libraryLayoutMode === 'list') {
            quizListContainer.className = 'flex flex-col gap-3 w-full';
        } else {
            quizListContainer.className = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6';
        }
        applyQuizGridColumns(quizListContainer);
        quizListContainer.innerHTML = '';
    }

    const librarySearchInput = document.getElementById('library-search-input');
    const isSearching = librarySearchInput && librarySearchInput.value.trim() !== '';

    updateLibraryOverview();

    let filteredQuizzes = quizzesToDisplay;
    if (!isSearching) {
        filteredQuizzes = quizzesToDisplay.filter(quiz =>
            currentFolderId === null ? (!quiz.folderId) : (quiz.folderId === currentFolderId)
        );
        // Áp dụng bộ lọc nhanh (Tất cả / Gần đây / Đã ghim)
        filteredQuizzes = applyLibraryFilter(filteredQuizzes);
    }

    // Sắp xếp theo lựa chọn người dùng (ghim luôn lên đầu); khi tìm kiếm giữ thứ tự liên quan
    filteredQuizzes = isSearching ? [...filteredQuizzes] : sortQuizList(filteredQuizzes);

    // Cập nhật bộ đếm kết quả
    const resultCountEl = document.getElementById('library-result-count');
    if (resultCountEl) {
        if (isSearching || libraryFilterMode !== 'all') {
            resultCountEl.textContent = `${filteredQuizzes.length} bộ đề`;
            resultCountEl.classList.remove('hidden');
        } else {
            resultCountEl.classList.add('hidden');
        }
    }

    const foldersSection = document.getElementById('folders-section');
    const foldersContainer = document.getElementById('folders-container');
    const quizzesSectionTitle = document.getElementById('quizzes-section-title');

    const showFolders = !isSearching && currentFolderId === null && userFolders.length > 0;
    if (foldersSection) {
        if (showFolders) foldersSection.classList.remove('hidden');
        else foldersSection.classList.add('hidden');
    }
    if (quizzesSectionTitle) {
        if (showFolders) quizzesSectionTitle.classList.remove('hidden');
        else quizzesSectionTitle.classList.add('hidden');
    }

    if (foldersContainer) {
        foldersContainer.innerHTML = '';
        applyFolderGridColumns(foldersContainer);
        if (!isSearching && currentFolderId === null) {
            const totalFolders = userFolders.length;
            const showAll = foldersExpanded || totalFolders <= FOLDERS_PER_PAGE;
            const totalFolderPages = Math.ceil(totalFolders / FOLDERS_PER_PAGE) || 1;

            let foldersToDisplay;
            if (showAll) {
                foldersToDisplay = userFolders;
                currentFolderPage = 1;
            } else {
                if (currentFolderPage > totalFolderPages) currentFolderPage = totalFolderPages;
                if (currentFolderPage < 1) currentFolderPage = 1;
                const startIdx = (currentFolderPage - 1) * FOLDERS_PER_PAGE;
                foldersToDisplay = userFolders.slice(startIdx, startIdx + FOLDERS_PER_PAGE);
            }

            foldersToDisplay.forEach((folder) => {
                const card = document.createElement('div');
                const colorVal = folder.color || 'amber';
                const iconClass = folder.icon || 'fa-folder';
                const count = userQuizSets.filter(q => q.folderId === folder.id).length;
                const isPinnedFolder = !!folder.pinned;

                card.className = 'folder-mini-card';
                card.setAttribute('data-id', folder.id);
                card.setAttribute('draggable', 'true');
                if (isPinnedFolder) card.classList.add('is-pinned');

                // Tô màu nguyên cả thẻ thư mục theo màu đã chọn (thay vì chỉ ô icon nhỏ)
                const hex = colorVal.startsWith('#')
                    ? colorVal
                    : (FOLDER_COLOR_HEX[colorVal] || FOLDER_COLOR_HEX.amber);
                card.style.background = `linear-gradient(145deg, ${hex}33, ${hex}14)`;
                card.style.borderColor = `${hex}66`;
                card.style.setProperty('--folder-shadow', `${hex}40`);

                // Icon nổi bật: chip màu đặc + icon trắng để tương phản trên nền đã tô màu
                const wrapperHTML = `<div class="folder-icon-wrapper" style="background-color: ${hex}; color: #fff;"><i class="fas ${iconClass}"></i></div>`;

                const pinBadge = isPinnedFolder
                    ? `<span class="folder-pin-badge" title="Đã ghim"><i class="fas fa-thumbtack"></i></span>`
                    : '';

                const swatchHTML = FOLDER_SWATCHES.map(s =>
                    `<button type="button" class="folder-color-dot ${s.key === colorVal ? 'is-active' : ''}" data-color="${s.key}" style="background:${s.hex}" title="${s.label}" aria-label="${s.label}"></button>`
                ).join('');

                card.innerHTML = `
                    ${pinBadge}
                    <div class="folder-mini-card-content folder-click-area">
                        ${wrapperHTML}
                        <div class="min-w-0">
                            <h4 class="font-bold text-gray-800 text-sm truncate" title="${folder.name}">${folder.name}</h4>
                            <span class="folder-count-badge" style="background:rgba(255,255,255,0.78); color:#4b5563;"><i class="fas fa-file-alt text-[9px] opacity-70"></i>${count} bộ đề</span>
                        </div>
                    </div>
                    <div class="relative flex items-center">
                        <button class="folder-menu-btn w-6 h-6 flex items-center justify-center text-gray-400 hover:text-pink-500 rounded-full focus:outline-none" data-id="${folder.id}"><i class="fas fa-ellipsis-v text-xs"></i></button>
                        <div class="folder-menu hidden absolute right-0 top-7 bg-white rounded-xl shadow-xl border border-pink-100 z-30 min-w-[180px] p-1">
                            <button class="block w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-gray-700 hover:bg-pink-50 pin-folder-btn" data-id="${folder.id}"><i class="fas fa-thumbtack mr-2 ${isPinnedFolder ? 'text-pink-500' : 'text-gray-400'}"></i>${isPinnedFolder ? 'Bỏ ghim' : 'Ghim lên đầu'}</button>
                            <button class="block w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-gray-700 hover:bg-pink-50 rename-folder-btn" data-id="${folder.id}" data-name="${folder.name}"><i class="fas fa-pen mr-2 text-blue-400"></i>Sửa tên, icon &amp; màu</button>
                            <div class="px-3 pt-2 pb-1">
                                <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Đổi màu nhanh</p>
                                <div class="folder-color-row">${swatchHTML}</div>
                            </div>
                            <div class="h-px bg-gray-100 my-1"></div>
                            <button class="block w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 delete-folder-btn" data-id="${folder.id}"><i class="fas fa-trash-alt mr-2 text-red-400"></i>Xóa thư mục</button>
                        </div>
                    </div>
                `;

                card.querySelector('.folder-click-area').addEventListener('click', () => {
                    currentFolderId = folder.id;
                    renderBreadcrumb();
                    loadAndDisplayLibrary(1);
                });

                const menuBtn = card.querySelector('.folder-menu-btn');
                const menu = card.querySelector('.folder-menu');
                menuBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isHidden = menu.classList.contains('hidden');
                    document.querySelectorAll('.quiz-menu, .folder-menu').forEach(m => {
                        if (m !== menu) m.classList.add('hidden');
                    });
                    if (isHidden) {
                        positionFolderMenu(menu, menuBtn); // dùng position:fixed để không bị khung thư mục cắt
                    } else {
                        resetFolderMenuPosition(menu);
                    }
                });
                // Ngăn click bên trong menu làm điều hướng vào thư mục
                menu.addEventListener('click', (e) => e.stopPropagation());

                card.querySelector('.pin-folder-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    menu.classList.add('hidden');
                    toggleFolderPin(folder.id, !isPinnedFolder);
                });

                card.querySelector('.rename-folder-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    menu.classList.add('hidden');
                    openFolderModal('edit', folder.id, folder.name);
                });

                card.querySelectorAll('.folder-color-dot').forEach(dot => {
                    dot.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const newColor = dot.getAttribute('data-color');
                        if (newColor === colorVal) { menu.classList.add('hidden'); return; }
                        menu.classList.add('hidden');
                        quickSetFolderColor(folder.id, newColor);
                    });
                });

                card.querySelector('.delete-folder-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    menu.classList.add('hidden');
                    confirmDeleteFolder(folder.id);
                });

                // Kéo thư mục để sắp xếp lại thứ tự
                card.addEventListener('dragstart', (e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('application/x-folder', folder.id);
                    card.classList.add('folder-dragging');
                });
                card.addEventListener('dragend', () => {
                    card.classList.remove('folder-dragging');
                    document.querySelectorAll('.folder-mini-card.drop-target')
                        .forEach(c => c.classList.remove('drop-target'));
                });

                // Drag & Drop: nhận bộ đề (di chuyển) hoặc thư mục (sắp xếp lại)
                card.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                });
                card.addEventListener('dragenter', (e) => {
                    e.preventDefault();
                    card.classList.add('drop-target');
                });
                card.addEventListener('dragleave', () => {
                    card.classList.remove('drop-target');
                });
                card.addEventListener('drop', async (e) => {
                    e.preventDefault();
                    card.classList.remove('drop-target');

                    const draggedFolderId = e.dataTransfer.getData('application/x-folder');
                    if (draggedFolderId) {
                        await reorderFolders(draggedFolderId, folder.id);
                        return;
                    }

                    const quizId = e.dataTransfer.getData('text/plain');
                    if (!quizId) return;
                    try {
                        isLibraryFullyLoaded = false;
                        const quizDocRef = doc(db, "quiz_sets", quizId);
                        await updateDoc(quizDocRef, { folderId: folder.id });
                        showToast(`Đã chuyển bộ đề vào thư mục "${folder.name}"!`, 'success');
                        await loadAndDisplayLibrary();
                    } catch (err) {
                        console.error("Lỗi kéo thả di chuyển bộ đề:", err);
                        showToast('Có lỗi xảy ra khi di chuyển bộ đề!', 'error');
                    }
                });

                foldersContainer.appendChild(card);
            });

            if (!showAll) {
                renderFoldersPagination(totalFolders, currentFolderPage, totalFolderPages);
            } else {
                clearFoldersPagination();
            }
            renderFoldersToggle(totalFolders);
        } else {
            clearFoldersPagination();
            renderFoldersToggle(0);
        }
    }

    if (filteredQuizzes.length === 0 && (!userFolders.length || currentFolderId !== null || isSearching || libraryFilterMode !== 'all')) {
        let emptyType = 'root';
        if (isSearching) emptyType = 'search';
        else if (libraryFilterMode !== 'all') emptyType = 'filter';
        else if (currentFolderId !== null) emptyType = 'folder';
        renderEmptyState(quizListContainer, emptyType);
        renderLibraryPagination([], 1, 1);
        return;
    }

    const ITEMS_PER_PAGE = 12;
    let totalPages = 1;
    let currentPage = page;

    if (isLibraryFullyLoaded || isSearching) {
        totalPages = Math.ceil(filteredQuizzes.length / ITEMS_PER_PAGE) || 1;
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        filteredQuizzes = filteredQuizzes.slice(startIndex, endIndex);
    } else {
        totalPages = 1;
        currentPage = 1;
        filteredQuizzes = filteredQuizzes.slice(0, ITEMS_PER_PAGE);
    }

    if (quizListContainer) {
        filteredQuizzes.forEach((quizSet) => {
            const card = document.createElement('div');
            const isSelected = selectedQuizIds.includes(quizSet.id);
            const pinned = isPinned(quizSet.id);
            const isNew = isNewQuiz(quizSet);
            const newBadge = isNew
                ? `<span class="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center">Mới</span>`
                : '';
            const pinBtnSm = `<button class="pin-quiz-btn w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${pinned ? 'text-pink-500 bg-pink-50' : 'text-gray-400 hover:text-pink-500 hover:bg-pink-50'}" data-id="${quizSet.id}" title="${pinned ? 'Bỏ ghim' : 'Ghim lên đầu'}"><i class="fas fa-thumbtack text-xs"></i></button>`;
            const pinBtnMd = `<button class="pin-quiz-btn w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${pinned ? 'text-pink-500 bg-pink-50' : 'text-gray-400 hover:text-pink-500 hover:bg-pink-50'}" data-id="${quizSet.id}" title="${pinned ? 'Bỏ ghim' : 'Ghim lên đầu'}"><i class="fas fa-thumbtack text-sm"></i></button>`;

            card.className = getQuizCardClassName(isSelected);
            card.setAttribute('data-id', quizSet.id);

            let dateStr = 'N/A';
            if (quizSet.createdAt) {
                const dateObj = typeof quizSet.createdAt.toDate === 'function' ? quizSet.createdAt.toDate() : new Date(quizSet.createdAt);
                const hours = String(dateObj.getHours()).padStart(2, '0');
                const minutes = String(dateObj.getMinutes()).padStart(2, '0');
                const day = String(dateObj.getDate()).padStart(2, '0');
                const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                const year = dateObj.getFullYear();
                dateStr = `${hours}:${minutes} ${day}/${month}/${year}`;
            }
            
            if (libraryLayoutMode === 'list') {
                let checkboxHTML = '';
                if (isSelectionMode) {
                    checkboxHTML = `
                        <div class="flex-shrink-0 z-10 mr-1">
                            <input type="checkbox" class="bulk-quiz-checkbox w-5 h-5 rounded-full border-pink-300 text-[#FF69B4] focus:ring-pink-300 cursor-pointer pointer-events-none" ${isSelected ? 'checked' : ''} />
                        </div>
                    `;
                }
                
                let menuHTML = '';
                if (!isSelectionMode) {
                    menuHTML = `
                        <div class="relative flex-shrink-0">
                            <button class="quiz-menu-btn w-8 h-8 flex items-center justify-center text-gray-400 hover:text-pink-500 hover:bg-pink-50 rounded-full focus:outline-none transition-colors" data-id="${quizSet.id}" title="Tùy chọn"><i class="fas fa-ellipsis-v text-xs"></i></button>
                            <div class="quiz-menu hidden absolute right-0 top-9 bg-white rounded-xl shadow-xl border border-gray-100 z-20 min-w-[175px] py-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                                <button class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-pink-50 quiz-history-btn" data-id="${quizSet.id}"><i class="fas fa-history mr-2.5 text-pink-400"></i>Xem lịch sử làm bài</button>
                                <button class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-pink-50 move-quiz-btn" data-id="${quizSet.id}"><i class="fas fa-folder-open mr-2.5 text-yellow-500"></i>Di chuyển</button>
                                <div class="border-t border-gray-100 my-1"></div>
                                <button class="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 delete-quiz-btn" data-id="${quizSet.id}"><i class="fas fa-trash-alt mr-2.5 text-red-500"></i>Xóa bộ đề</button>
                            </div>
                        </div>
                    `;
                }

                card.innerHTML = `
                    ${checkboxHTML}
                    <div class="flex-grow min-w-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
                        <div class="min-w-0 flex-1">
                            <h3 class="text-sm sm:text-base font-bold text-gray-800 truncate" title="${quizSet.title}">
                                <a href="features/quiz/quiz.html?id=${quizSet.id}" class="hover:text-pink-600 focus:text-pink-600 transition-colors duration-150 block mr-2">
                                    ${quizSet.title}
                                </a>
                            </h3>
                            <div class="flex flex-wrap gap-2 mt-1 items-center">
                                ${newBadge}
                                <span class="bg-pink-50 text-pink-600 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold inline-flex items-center gap-1">
                                    <i class="fas fa-question-circle text-[10px] opacity-80"></i>
                                    ${quizSet.questionCount} câu hỏi
                                </span>
                                <span class="text-gray-400 text-[10px] sm:text-xs hidden sm:inline-flex items-center gap-1">
                                    <i class="far fa-calendar-alt text-[10px] opacity-80"></i>
                                    ${dateStr}
                                </span>
                            </div>
                        </div>
                        <div class="flex items-center gap-2 mt-1 sm:mt-0 justify-between sm:justify-end ${isSelectionMode ? 'opacity-40 pointer-events-none' : ''}">
                            <div class="flex items-center gap-0.5">
                                ${pinBtnSm}
                                <button class="edit-quiz-content-btn w-7 h-7 flex items-center justify-center text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" data-id="${quizSet.id}" title="Sửa câu hỏi">
                                    <i class="fas fa-pen-alt text-xs"></i>
                                </button>
                                <button class="edit-quiz-btn w-7 h-7 flex items-center justify-center text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors" data-id="${quizSet.id}" data-title="${quizSet.title}" title="Sửa tên">
                                    <i class="fas fa-edit text-xs"></i>
                                </button>
                                <button class="share-quiz-btn w-7 h-7 flex items-center justify-center text-gray-400 hover:text-green-500 hover:bg-green-50 rounded-lg transition-colors" data-id="${quizSet.id}" title="Chia sẻ">
                                    <i class="fas fa-share-alt text-xs"></i>
                                </button>
                            </div>
                            <a href="features/quiz/quiz.html?id=${quizSet.id}" class="practice-btn inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-gradient-to-r from-pink-500 to-rose-400 hover:from-pink-600 hover:to-rose-500 text-white rounded-xl shadow-md shadow-pink-200/60 hover:shadow-lg hover:shadow-pink-300/70 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 text-sm font-extrabold tracking-wide flex-shrink-0">
                                <span class="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center"><i class="fas fa-play text-[8px] ml-0.5"></i></span>
                                Luyện tập
                            </a>
                        </div>
                    </div>
                    ${menuHTML}
                `;
            } else {
                let checkboxHTML = '';
                let menuHTML = '';
                if (isSelectionMode) {
                    checkboxHTML = `
                        <div class="absolute top-4 left-4 z-10">
                            <input type="checkbox" class="bulk-quiz-checkbox w-5 h-5 rounded-full border-pink-300 text-[#FF69B4] focus:ring-pink-300 cursor-pointer pointer-events-none" ${isSelected ? 'checked' : ''} />
                        </div>
                    `;
                } else {
                    menuHTML = `
                        <div class="absolute top-4 right-4">
                            <button class="quiz-menu-btn w-8 h-8 flex items-center justify-center text-gray-400 hover:text-pink-500 hover:bg-pink-50 rounded-full focus:outline-none transition-colors" data-id="${quizSet.id}" title="Tùy chọn"><i class="fas fa-ellipsis-v"></i></button>
                            <div class="quiz-menu hidden absolute right-0 top-9 bg-white rounded-xl shadow-xl border border-gray-100 z-20 min-w-[175px] py-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                                <button class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-pink-50 quiz-history-btn" data-id="${quizSet.id}"><i class="fas fa-history mr-2.5 text-pink-400"></i>Xem lịch sử làm bài</button>
                                <button class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-pink-50 move-quiz-btn" data-id="${quizSet.id}"><i class="fas fa-folder-open mr-2.5 text-yellow-500"></i>Di chuyển</button>
                                <div class="border-t border-gray-100 my-1"></div>
                                <button class="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 delete-quiz-btn" data-id="${quizSet.id}"><i class="fas fa-trash-alt mr-2.5 text-red-500"></i>Xóa bộ đề</button>
                            </div>
                        </div>
                    `;
                }

                const pinnedRibbon = (pinned && !isSelectionMode)
                    ? `<div class="absolute top-4 left-4 text-pink-500" title="Đã ghim"><i class="fas fa-thumbtack text-xs"></i></div>`
                    : '';

                card.innerHTML = `
                    ${checkboxHTML}
                    ${pinnedRibbon}
                    <div class="flex-grow ${(isSelectionMode || (pinned && !isSelectionMode)) ? 'pl-8' : ''}">
                        <h3 class="text-sm sm:text-base font-bold text-gray-800 line-clamp-2 pr-8 mb-3" title="${quizSet.title}">
                            <a href="features/quiz/quiz.html?id=${quizSet.id}" class="hover:text-pink-600 focus:text-pink-600 transition-colors duration-150 block">
                                ${quizSet.title}
                            </a>
                        </h3>
                        <div class="flex flex-wrap gap-2 mb-4">
                            ${newBadge}
                            <span class="bg-pink-50 text-pink-600 px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1.5">
                                <i class="fas fa-question-circle text-xs opacity-80"></i>
                                ${quizSet.questionCount} câu hỏi
                            </span>
                            <span class="bg-gray-50 text-gray-500 px-2.5 py-1 rounded-full text-xs inline-flex items-center gap-1.5">
                                <i class="far fa-calendar-alt text-xs opacity-80"></i>
                                ${dateStr}
                            </span>
                        </div>
                        ${menuHTML}
                    </div>
                    <div class="mt-auto pt-3 border-t border-gray-50 flex justify-between items-center ${isSelectionMode ? 'opacity-40 pointer-events-none' : ''}">
                        <div class="flex items-center gap-1">
                            ${pinBtnMd}
                            <button class="edit-quiz-content-btn w-8 h-8 flex items-center justify-center text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" data-id="${quizSet.id}" title="Sửa câu hỏi">
                                <i class="fas fa-pen-alt text-sm"></i>
                            </button>
                            <button class="edit-quiz-btn w-8 h-8 flex items-center justify-center text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors" data-id="${quizSet.id}" data-title="${quizSet.title}" title="Sửa tên">
                                <i class="fas fa-edit text-sm"></i>
                            </button>
                            <button class="share-quiz-btn w-8 h-8 flex items-center justify-center text-gray-400 hover:text-green-500 hover:bg-green-50 rounded-lg transition-colors" data-id="${quizSet.id}" title="Chia sẻ">
                                <i class="fas fa-share-alt text-sm"></i>
                            </button>
                        </div>
                        <a href="features/quiz/quiz.html?id=${quizSet.id}" class="practice-btn inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-pink-500 to-rose-400 hover:from-pink-600 hover:to-rose-500 text-white rounded-xl shadow-md shadow-pink-200/60 hover:shadow-lg hover:shadow-pink-300/70 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 text-sm font-extrabold tracking-wide">
                            <span class="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center"><i class="fas fa-play text-[9px] ml-0.5"></i></span>
                            Luyện tập
                        </a>
                    </div>
                `;
            }

            if (!isSelectionMode) {
                card.setAttribute('draggable', 'true');
                card.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', quizSet.id);
                    e.dataTransfer.effectAllowed = 'move';
                    setTimeout(() => card.classList.add('opacity-40'), 0);
                });
                card.addEventListener('dragend', () => {
                    card.classList.remove('opacity-40');
                });
            }
            
            quizListContainer.appendChild(card);

            // Selection Mode and card click handler
            card.addEventListener('click', function(e) {
                if (isSelectionMode) {
                    // Block navigation and toggle selection
                    e.preventDefault();
                    e.stopPropagation();

                    const checkbox = card.querySelector('.bulk-quiz-checkbox');
                    const hasId = selectedQuizIds.includes(quizSet.id);
                    
                    if (hasId) {
                        selectedQuizIds = selectedQuizIds.filter(id => id !== quizSet.id);
                        card.className = getQuizCardClassName(false);
                        if (checkbox) checkbox.checked = false;
                    } else {
                        selectedQuizIds.push(quizSet.id);
                        card.className = getQuizCardClassName(true);
                        if (checkbox) checkbox.checked = true;
                    }
                    updateBulkActionsToolbar();
                    return;
                }

                // If not in Selection Mode:
                // Let custom button clicks/actions handle themselves
                if (e.target.closest('button') || e.target.closest('.quiz-menu') || e.target.closest('.quiz-menu-btn')) {
                    return;
                }

                // Let standard links like title link or practice button behave normally
                if (e.target.closest('a')) {
                    return;
                }

                // Redirect to quiz page if clicking anywhere else on the card (blank spaces)
                e.preventDefault();
                window.location.href = `features/quiz/quiz.html?id=${quizSet.id}`;
            });

            // Long Press detection
            let longPressTimer = null;
            let isLongPressTriggered = false;

            const startPress = (e) => {
                if (isSelectionMode || e.target.closest('a') || e.target.closest('.quiz-menu-btn') || e.target.closest('.quiz-menu')) return;
                isLongPressTriggered = false;
                longPressTimer = setTimeout(() => {
                    isLongPressTriggered = true;
                    isSelectionMode = true;
                    selectedQuizIds = [quizSet.id];
                    if (navigator.vibrate) navigator.vibrate(50);
                    renderLibrary(quizzesToDisplay, currentPage);
                    updateBulkActionsToolbar();
                }, 600);
            };

            const cancelPress = () => {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            };

            card.addEventListener('mousedown', startPress);
            card.addEventListener('touchstart', startPress, { passive: true });
            
            card.addEventListener('mouseup', (e) => {
                cancelPress();
                if (isLongPressTriggered) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            });
            card.addEventListener('touchend', (e) => {
                cancelPress();
                if (isLongPressTriggered) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            });

            card.addEventListener('mouseleave', cancelPress);
            card.addEventListener('touchmove', cancelPress, { passive: true });
            card.addEventListener('touchcancel', cancelPress);

            // Gán listener phụ
            setTimeout(() => {
                const pinBtn = card.querySelector('.pin-quiz-btn');
                if (pinBtn) {
                    pinBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        togglePin(this.getAttribute('data-id'));
                    });
                }

                const shareBtn = card.querySelector('.share-quiz-btn');
                if (shareBtn) {
                    shareBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const quizId = this.getAttribute('data-id');
                        openShareQuizModal(quizId, quizSet.title);
                    });
                }

                const moveBtn = card.querySelector('.move-quiz-btn');
                if (moveBtn) {
                    moveBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const quizId = this.getAttribute('data-id');
                        isBulkMoving = false;
                        openMoveQuizModal(quizId);
                    });
                }
                
                const editContentBtn = card.querySelector('.edit-quiz-content-btn');
                if (editContentBtn) {
                    editContentBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const qId = this.getAttribute('data-id');
                        window.location.href = `features/editor/editor.html?id=${qId}`;
                    });
                }
                
                const historyBtn = card.querySelector('.quiz-history-btn');
                if (historyBtn) {
                    historyBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const qId = this.getAttribute('data-id');
                        window.location.href = `features/quiz/quiz-history.html?id=${qId}`;
                    });
                }
            }, 0);
        });
    }

    renderLibraryPagination(isSearching ? quizzesToDisplay : (isLibraryFullyLoaded ? quizzesToDisplay : filteredQuizzes), currentPage, totalPages);
}

function renderLibraryPagination(quizzesToDisplay, currentPage, totalPages) {
    let paginationContainer = document.getElementById('library-pagination');
    if (!paginationContainer) {
        paginationContainer = document.createElement('div');
        paginationContainer.id = 'library-pagination';
        paginationContainer.className = 'flex justify-center items-center gap-4 mt-6 col-span-full w-full';
        const quizListContainer = document.getElementById('quiz-list-container');
        if (quizListContainer && quizListContainer.parentNode) {
            quizListContainer.parentNode.insertBefore(paginationContainer, quizListContainer.nextSibling);
        }
    }

    const librarySearchInput = document.getElementById('library-search-input');
    const isSearching = librarySearchInput && librarySearchInput.value.trim() !== '';

    if (!isLibraryFullyLoaded && !isSearching) {
        paginationContainer.innerHTML = '';
        return;
    }

    if (totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }

    paginationContainer.innerHTML = `
        <button id="lib-prev-page" class="px-4 py-2 bg-pink-100 text-pink-700 rounded-lg hover:bg-pink-200 transition disabled:opacity-50 disabled:cursor-not-allowed" ${currentPage === 1 ? 'disabled' : ''}>
            <i class="fas fa-chevron-left mr-1"></i> Trang trước
        </button>
        <span class="text-gray-700 font-medium">Trang ${currentPage} / ${totalPages}</span>
        <button id="lib-next-page" class="px-4 py-2 bg-pink-100 text-pink-700 rounded-lg hover:bg-pink-200 transition disabled:opacity-50 disabled:cursor-not-allowed" ${currentPage === totalPages ? 'disabled' : ''}>
            Trang sau <i class="fas fa-chevron-right ml-1"></i>
        </button>
    `;

    document.getElementById('lib-prev-page').addEventListener('click', () => {
        if (currentPage > 1) {
            renderLibrary(quizzesToDisplay, currentPage - 1);
        }
    });

    document.getElementById('lib-next-page').addEventListener('click', () => {
        if (currentPage < totalPages) {
            renderLibrary(quizzesToDisplay, currentPage + 1);
        }
    });
}

// Hiện menu thư mục bằng position:fixed (định vị theo viewport) để menu không bị
// container cuộn ngang hay khung thẻ cắt mất phần dưới.
function positionFolderMenu(menu, btn) {
    menu.style.position = 'fixed';
    menu.style.zIndex = '60';
    menu.style.right = 'auto';  // huỷ class Tailwind right-0 (nếu không menu sẽ bị kéo giãn)
    menu.style.bottom = 'auto';
    menu.style.top = '-9999px';
    menu.style.left = '-9999px';
    menu.classList.remove('hidden'); // bỏ ẩn để đo được kích thước thật

    const margin = 8;
    const br = btn.getBoundingClientRect();
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;

    let left = br.right - mw; // canh mép phải menu với mép phải nút ⋮
    if (left + mw > window.innerWidth - margin) left = window.innerWidth - margin - mw;
    if (left < margin) left = margin;

    let top = br.bottom + 6; // mặc định thả xuống dưới
    if (top + mh > window.innerHeight - margin) {
        top = br.top - 6 - mh; // không đủ chỗ thì bật lên trên nút
        if (top < margin) top = margin;
    }

    menu.style.top = top + 'px';
    menu.style.left = left + 'px';
}

function resetFolderMenuPosition(menu) {
    menu.classList.add('hidden');
    menu.style.position = '';
    menu.style.zIndex = '';
    menu.style.right = '';
    menu.style.bottom = '';
    menu.style.top = '';
    menu.style.left = '';
}

function clearFoldersPagination() {
    const paginationContainer = document.getElementById('folders-pagination');
    if (paginationContainer) {
        paginationContainer.innerHTML = '';
        paginationContainer.classList.add('hidden');
    }
}

// Nút "Xem tất cả / Thu gọn" thư mục — chỉ hiện khi có nhiều hơn 1 trang
function renderFoldersToggle(totalFolders) {
    const toggle = document.getElementById('folders-toggle');
    if (!toggle) return;

    if (totalFolders <= FOLDERS_PER_PAGE) {
        toggle.innerHTML = '';
        toggle.classList.add('hidden');
        return;
    }

    toggle.classList.remove('hidden');
    toggle.innerHTML = '';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'folders-toggle-btn';
    btn.innerHTML = foldersExpanded
        ? '<i class="fas fa-chevron-up text-[10px]"></i> Thu gọn'
        : `<i class="fas fa-layer-group text-[10px]"></i> Xem tất cả (${totalFolders})`;
    btn.addEventListener('click', () => {
        foldersExpanded = !foldersExpanded;
        currentFolderPage = 1;
        renderLibrary(userQuizSets, currentLibraryPage);
    });
    toggle.appendChild(btn);
}

function renderFoldersPagination(totalFolders, currentPage, totalPages) {
    const paginationContainer = document.getElementById('folders-pagination');
    if (!paginationContainer) return;

    if (totalPages <= 1) {
        paginationContainer.innerHTML = '';
        paginationContainer.classList.add('hidden');
        return;
    }

    paginationContainer.classList.remove('hidden');
    paginationContainer.innerHTML = '';

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'folder-page-btn';
    prevBtn.innerHTML = '<i class="fas fa-chevron-left text-[10px]"></i>';
    if (currentPage === 1) prevBtn.disabled = true;
    prevBtn.addEventListener('click', () => {
        if (currentFolderPage > 1) {
            currentFolderPage--;
            renderLibrary(userQuizSets, currentLibraryPage);
        }
    });
    paginationContainer.appendChild(prevBtn);

    for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.type = 'button';
        pageBtn.className = `folder-page-btn ${i === currentPage ? 'active' : ''}`;
        pageBtn.textContent = i;
        pageBtn.addEventListener('click', () => {
            if (currentFolderPage !== i) {
                currentFolderPage = i;
                renderLibrary(userQuizSets, currentLibraryPage);
            }
        });
        paginationContainer.appendChild(pageBtn);
    }

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'folder-page-btn';
    nextBtn.innerHTML = '<i class="fas fa-chevron-right text-[10px]"></i>';
    if (currentPage === totalPages) nextBtn.disabled = true;
    nextBtn.addEventListener('click', () => {
        if (currentFolderPage < totalPages) {
            currentFolderPage++;
            renderLibrary(userQuizSets, currentLibraryPage);
        }
    });
    paginationContainer.appendChild(nextBtn);
}

export async function deleteQuizSet(quizId) {
    const ok = await showConfirm(
        'Bộ đề sẽ được chuyển vào thùng rác và tự động xóa vĩnh viễn sau 30 ngày. Bạn có thể khôi phục bất cứ lúc nào trước đó.',
        { title: 'Chuyển bộ đề vào thùng rác?', confirmText: 'Vào thùng rác', cancelText: 'Hủy', tone: 'danger' }
    );
    if (!ok) return;
    try {
        await updateDoc(doc(db, "quiz_sets", quizId), { deleted: true, deletedAt: new Date() });
        userQuizSets = userQuizSets.filter(q => q.id !== quizId); // cập nhật cache để ẩn ngay
        showToast('Đã chuyển bộ đề vào thùng rác.', 'success');
        renderLibrary(userQuizSets, currentLibraryPage);
    } catch (e) {
        showToast("Không thể chuyển vào thùng rác! Lỗi: " + e.message, 'error');
        console.error("Lỗi khi xóa bộ đề: ", e);
    }
}

export async function editQuizSetTitle(quizId, currentTitle) {
    const newTitle = prompt("Nhập tên mới cho bộ đề:", currentTitle);
    if (newTitle && newTitle.trim() !== '') {
        try {
            const docRef = doc(db, "quiz_sets", quizId);
            isLibraryFullyLoaded = false;
            await updateDoc(docRef, { title: newTitle.trim() });
            showToast('Đã cập nhật tên bộ đề!', 'success');
            loadAndDisplayLibrary();
        } catch (e) {
            showToast("Đổi tên thất bại: " + e.message, 'error');
        }
    }
}

export function renderBreadcrumb() {
    const breadcrumb = document.getElementById('folder-breadcrumb');
    if (!breadcrumb) return;

    if (currentFolderId === null) {
        // Ở thư viện gốc thì ẩn breadcrumb cho gọn (đã có tiêu đề trang)
        breadcrumb.classList.add('hidden');
        breadcrumb.classList.remove('flex');
        breadcrumb.innerHTML = `<span class="font-semibold text-pink-500"><i class="fas fa-home mr-1"></i>Thư viện gốc</span>`;
    } else {
        breadcrumb.classList.remove('hidden');
        breadcrumb.classList.add('flex');
        const currentFolder = userFolders.find(f => f.id === currentFolderId);
        const folderName = currentFolder ? currentFolder.name : 'Thư mục không tên';
        const iconClass = currentFolder && currentFolder.icon ? currentFolder.icon : 'fa-folder';
        const colorName = currentFolder && currentFolder.color ? currentFolder.color : 'amber';
        
        let breadcrumbItemHTML = '';
        if (colorName.startsWith('#')) {
            breadcrumbItemHTML = `<span class="font-semibold" style="color: ${colorName};"><i class="fas ${iconClass} mr-1"></i>${folderName}</span>`;
        } else {
            const textColors = {
                amber: 'text-amber-600', pink: 'text-pink-600', blue: 'text-blue-600',
                green: 'text-green-600', purple: 'text-purple-600', red: 'text-red-600', indigo: 'text-indigo-600'
            };
            const textClass = textColors[colorName] || 'text-amber-600';
            breadcrumbItemHTML = `<span class="font-semibold ${textClass}"><i class="fas ${iconClass} mr-1"></i>${folderName}</span>`;
        }

        breadcrumb.innerHTML = `
            <span class="cursor-pointer hover:text-pink-500 transition" id="breadcrumb-root-btn"><i class="fas fa-home mr-1"></i>Thư viện gốc</span>
            <i class="fas fa-chevron-right text-xs text-gray-300 mx-1"></i>
            ${breadcrumbItemHTML}
        `;
        const rootBtn = document.getElementById('breadcrumb-root-btn');
        if (rootBtn) {
            rootBtn.addEventListener('click', () => {
                currentFolderId = null;
                renderBreadcrumb();
                renderLibrary(userQuizSets);
            });
        }
    }
}

// === QUẢN LÝ THƯ MỤC MODAL ===
let folderModalMode = 'create';
let editingFolderId = null;

export function openFolderModal(mode = 'create', folderId = null, folderName = '') {
    folderModalMode = mode;
    editingFolderId = folderId;
    
    const modal = document.getElementById('folderModal');
    const title = document.getElementById('folderModalTitle');
    const input = document.getElementById('folderNameInput');
    
    if (!modal || !title || !input) return;
    
    title.textContent = mode === 'create' ? 'Tạo thư mục mới' : 'Sửa thư mục';
    input.value = folderName;
    input.classList.remove('border-red-400');
    
    if (mode === 'create') {
        selectedFolderIcon = 'fa-folder';
        selectedFolderColor = 'amber';
    } else {
        const folder = userFolders.find(f => f.id === folderId);
        if (folder) {
            selectedFolderIcon = folder.icon || 'fa-folder';
            selectedFolderColor = folder.color || 'amber';
        }
    }
    
    updateFolderModalPickers();
    modal.classList.remove('hidden');
    input.focus();
}

export function closeFolderModal() {
    const modal = document.getElementById('folderModal');
    if (modal) modal.classList.add('hidden');
}

function updateFolderModalPickers() {
    // Icon có khớp với một mẫu sẵn có không? Nếu không thì là icon tùy chọn.
    const isPresetIcon = !!document.querySelector(`.icon-option[data-icon="${selectedFolderIcon}"]`);
    document.querySelectorAll('.icon-option').forEach(btn => {
        const active = btn.getAttribute('data-icon') === selectedFolderIcon;
        btn.classList.toggle('bg-pink-100', active);
        btn.classList.toggle('text-pink-600', active);
        btn.classList.toggle('ring-2', active);
        btn.classList.toggle('ring-pink-400', active);
    });
    // Ô nhập tùy chọn: chỉ điền khi đang dùng icon ngoài danh sách mẫu
    const iconInput = document.getElementById('folderIconInput');
    if (iconInput) iconInput.value = isPresetIcon ? '' : (selectedFolderIcon || '');

    const isCustomColor = typeof selectedFolderColor === 'string' && selectedFolderColor.startsWith('#');
    document.querySelectorAll('.color-option').forEach(btn => {
        const active = !isCustomColor && btn.getAttribute('data-color') === selectedFolderColor;
        btn.classList.toggle('ring-4', active);
        btn.classList.toggle('ring-offset-2', active);
        btn.classList.toggle('ring-pink-400', active);
    });
    const colorInput = document.getElementById('folderColorInput');
    const textSpan = document.getElementById('folderColorText');
    if (isCustomColor) {
        if (colorInput) colorInput.value = selectedFolderColor;
        if (textSpan) textSpan.textContent = selectedFolderColor.toUpperCase();
    }
}

// Các token chỉ kiểu dáng (style) của FontAwesome — không phải tên icon
const FA_STYLE_TOKENS = new Set([
    'fa', 'fas', 'far', 'fab', 'fal', 'fat', 'fad', 'fass',
    'fa-solid', 'fa-regular', 'fa-brands', 'fa-light', 'fa-thin', 'fa-duotone', 'fa-sharp'
]);

// Nhận diện tên icon từ bất kỳ định dạng nào người dùng dán vào:
//   "fa-bell"  |  "fas fa-bell"  |  "fa-solid fa-bell"  |  <i class="fa-solid fa-megaphone"></i>
// Trả về tên icon dạng "fa-bell", hoặc null nếu không tìm thấy.
function parseFontAwesomeIcon(raw) {
    if (!raw) return null;
    let text = String(raw).trim();
    // Nếu dán nguyên thẻ HTML, lấy nội dung trong class="..."
    const classMatch = text.match(/class\s*=\s*["']([^"']+)["']/i);
    if (classMatch) text = classMatch[1];
    text = text.replace(/[<>"']/g, ' '); // bỏ ký tự thẻ còn sót
    const tokens = text.split(/\s+/).filter(Boolean);
    const iconToken = tokens.find(t => t.startsWith('fa-') && !FA_STYLE_TOKENS.has(t));
    return iconToken || null;
}

// Chọn icon mẫu trong lưới
export function selectFolderIcon(icon) {
    selectedFolderIcon = icon || 'fa-folder';
    updateFolderModalPickers();
}

// Đặt icon tùy chọn từ ô nhập (chấp nhận dán nguyên thẻ <i>). Trả về tên icon đã nhận hoặc null.
export function setCustomFolderIcon(rawText) {
    const parsed = parseFontAwesomeIcon(rawText);
    if (parsed) {
        selectedFolderIcon = parsed;
        // Đang dùng icon tùy chọn nên bỏ chọn các icon mẫu
        document.querySelectorAll('.icon-option').forEach(btn => {
            btn.classList.remove('bg-pink-100', 'text-pink-600', 'ring-2', 'ring-pink-400');
        });
    }
    return parsed;
}

// Chọn màu mẫu
export function selectFolderColor(color) {
    selectedFolderColor = color || 'amber';
    updateFolderModalPickers();
}

// Đặt màu tùy chọn từ bảng chọn màu (#hex)
export function setCustomFolderColor(hex) {
    if (!hex) return;
    selectedFolderColor = hex;
    const textSpan = document.getElementById('folderColorText');
    if (textSpan) textSpan.textContent = hex.toUpperCase();
    document.querySelectorAll('.color-option').forEach(btn => {
        btn.classList.remove('ring-4', 'ring-offset-2', 'ring-pink-400');
    });
}

export async function saveFolder() {
    const user = auth.currentUser;
    const input = document.getElementById('folderNameInput');
    if (!user || !input) return;
    
    const name = input.value.trim();
    if (!name) {
        input.classList.add('border-red-400');
        return;
    }
    
    const saveBtn = document.getElementById('saveFolderBtn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Đang lưu...';
    }

    try {
        if (folderModalMode === 'create') {
            const newDoc = await addDoc(collection(db, "quiz_folders"), {
                userId: user.uid,
                name: name,
                icon: selectedFolderIcon,
                color: selectedFolderColor,
                createdAt: new Date()
            });
            // Cập nhật ngay vào cache để thư mục mới hiện liền, không cần tải lại trang
            userFolders.push({
                id: newDoc.id,
                userId: user.uid,
                name: name,
                icon: selectedFolderIcon,
                color: selectedFolderColor,
                createdAt: new Date()
            });
            showToast('Đã tạo thư mục thành công!', 'success');
        } else {
            const docRef = doc(db, "quiz_folders", editingFolderId);
            await updateDoc(docRef, {
                name: name,
                icon: selectedFolderIcon,
                color: selectedFolderColor
            });
            // Đồng bộ ngay tên/icon/màu mới vào cache để giao diện tự cập nhật tức thì
            const folder = userFolders.find(f => f.id === editingFolderId);
            if (folder) {
                folder.name = name;
                folder.icon = selectedFolderIcon;
                folder.color = selectedFolderColor;
            }
            showToast('Đã cập nhật thư mục thành công!', 'success');
        }
        sortUserFolders();
        closeFolderModal();
        await loadAndDisplayLibrary();
    } catch (err) {
        console.error("Lỗi khi lưu thư mục:", err);
        showToast('Lỗi khi lưu thư mục!', 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Lưu';
        }
    }
}

// Ghim / bỏ ghim thư mục — cập nhật lạc quan rồi đồng bộ Firestore
async function toggleFolderPin(folderId, pinned) {
    const folder = userFolders.find(f => f.id === folderId);
    if (!folder) return;
    folder.pinned = pinned;
    sortUserFolders();
    renderLibrary(userQuizSets, currentLibraryPage);
    try {
        await updateDoc(doc(db, "quiz_folders", folderId), { pinned });
        showToast(pinned ? 'Đã ghim thư mục lên đầu!' : 'Đã bỏ ghim thư mục.', 'success');
    } catch (err) {
        console.error("Lỗi khi ghim thư mục:", err);
        folder.pinned = !pinned; // hoàn tác
        sortUserFolders();
        renderLibrary(userQuizSets, currentLibraryPage);
        showToast('Không thể cập nhật ghim thư mục!', 'error');
    }
}

// Đổi màu thư mục ngay trong menu (không cần mở modal)
async function quickSetFolderColor(folderId, color) {
    const folder = userFolders.find(f => f.id === folderId);
    if (!folder) return;
    const prevColor = folder.color;
    folder.color = color;
    renderLibrary(userQuizSets, currentLibraryPage);
    try {
        await updateDoc(doc(db, "quiz_folders", folderId), { color });
    } catch (err) {
        console.error("Lỗi khi đổi màu thư mục:", err);
        folder.color = prevColor; // hoàn tác
        renderLibrary(userQuizSets, currentLibraryPage);
        showToast('Không thể đổi màu thư mục!', 'error');
    }
}

// Kéo-thả sắp xếp lại thứ tự thư mục: ghi lại trường order tuần tự cho toàn bộ
async function reorderFolders(draggedId, targetId) {
    if (draggedId === targetId) return;
    const arr = [...userFolders];
    const from = arr.findIndex(f => f.id === draggedId);
    const to = arr.findIndex(f => f.id === targetId);
    if (from < 0 || to < 0) return;

    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);

    // Cập nhật lạc quan trên client
    arr.forEach((f, idx) => { f.order = idx; });
    userFolders = arr;
    sortUserFolders();
    renderLibrary(userQuizSets, currentLibraryPage);

    try {
        await Promise.all(arr.map((f, idx) =>
            updateDoc(doc(db, "quiz_folders", f.id), { order: idx })
        ));
    } catch (err) {
        console.error("Lỗi khi sắp xếp lại thư mục:", err);
        showToast('Không thể lưu thứ tự thư mục mới!', 'error');
    }
}

async function confirmDeleteFolder(folderId) {
    const folder = userFolders.find(f => f.id === folderId);
    const name = folder ? folder.name : 'thư mục';
    const count = userQuizSets.filter(q => q.folderId === folderId).length;

    const msg = count > 0
        ? `Thư mục "${name}" cùng ${count} bộ đề bên trong sẽ được chuyển vào thùng rác và tự động xóa vĩnh viễn sau 30 ngày. Bạn có thể khôi phục cả thư mục lẫn bộ đề trước đó.`
        : `Thư mục "${name}" sẽ được chuyển vào thùng rác và tự động xóa vĩnh viễn sau 30 ngày. Bạn có thể khôi phục bất cứ lúc nào trước đó.`;

    const ok = await showConfirm(msg, {
        title: 'Chuyển thư mục vào thùng rác?', confirmText: 'Vào thùng rác', cancelText: 'Hủy', tone: 'danger'
    });
    if (!ok) return;

    try {
        const user = auth.currentUser;
        if (!user) throw new Error("Người dùng chưa đăng nhập.");
        const now = new Date();

        // 1. Chuyển các bộ đề bên trong vào thùng rác kèm theo (đánh dấu để khôi phục cùng thư mục)
        const q = query(collection(db, "quiz_sets"), where("userId", "==", user.uid), where("folderId", "==", folderId));
        const snapshot = await getDocs(q);
        const toTrash = snapshot.docs.filter(docSnap => !docSnap.data().deleted);
        if (toTrash.length) {
            try {
                await Promise.all(toTrash.map(docSnap =>
                    updateDoc(docSnap.ref, { deleted: true, deletedAt: now, trashedWithFolder: folderId })
                ));
            } catch (updateErr) {
                console.error("Lỗi khi chuyển bộ đề vào thùng rác:", updateErr);
                throw new Error("Không thể chuyển bộ đề vào thùng rác (Lỗi phân quyền quiz_sets).");
            }
        }

        // 2. Chuyển thư mục vào thùng rác
        try {
            await updateDoc(doc(db, "quiz_folders", folderId), { deleted: true, deletedAt: now });
        } catch (deleteErr) {
            console.error("Lỗi khi chuyển thư mục vào thùng rác:", deleteErr);
            throw new Error("Lỗi phân quyền Firestore khi cập nhật thư mục (quiz_folders).");
        }

        // 3. Cập nhật cache để ẩn ngay
        userFolders = userFolders.filter(f => f.id !== folderId);
        userQuizSets = userQuizSets.filter(q => q.folderId !== folderId);
        if (currentFolderId === folderId) currentFolderId = null;

        showToast('Đã chuyển thư mục vào thùng rác.', 'success');
        renderBreadcrumb();
        renderLibrary(userQuizSets, currentLibraryPage);
    } catch (err) {
        console.error("Lỗi khi xóa thư mục:", err);
        showToast(err.message || 'Chuyển thư mục vào thùng rác thất bại!', 'error');
    }
}

// === DI CHUYỂN BỘ ĐỀ (MOVE QUIZ) ===
let movingQuizId = null;

export function openMoveQuizModal(quizId) {
    movingQuizId = quizId;
    const modal = document.getElementById('moveQuizModal');
    const select = document.getElementById('folderSelect');
    
    if (!modal || !select) return;
    
    select.innerHTML = '<option value="">(Thư viện gốc - không thư mục)</option>';
    userFolders.forEach(folder => {
        const option = document.createElement('option');
        option.value = folder.id;
        option.textContent = folder.name;
        select.appendChild(option);
    });
    
    if (!isBulkMoving) {
        const quiz = userQuizSets.find(q => q.id === quizId);
        if (quiz) {
            select.value = quiz.folderId || '';
        }
    }
    
    modal.classList.remove('hidden');
}

export function closeMoveQuizModal() {
    const modal = document.getElementById('moveQuizModal');
    if (modal) modal.classList.add('hidden');
}

export async function confirmMoveQuiz() {
    const select = document.getElementById('folderSelect');
    if (!select) return;
    const targetFolderId = select.value || null;
    
    const confirmBtn = document.getElementById('confirmMoveQuizBtn');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Đang di chuyển...';
    }

    try {
        isLibraryFullyLoaded = false;
        if (isBulkMoving) {
            const promises = selectedQuizIds.map(id => updateDoc(doc(db, "quiz_sets", id), { folderId: targetFolderId }));
            await Promise.all(promises);
            showToast(`Đã di chuyển ${selectedQuizIds.length} bộ đề!`, 'success');
            exitSelectionMode();
        } else {
            await updateDoc(doc(db, "quiz_sets", movingQuizId), { folderId: targetFolderId });
            showToast('Đã di chuyển bộ đề thành công!', 'success');
        }
        closeMoveQuizModal();
        await loadAndDisplayLibrary();
    } catch (err) {
        console.error("Lỗi di chuyển bộ đề:", err);
        showToast('Có lỗi xảy ra khi di chuyển!', 'error');
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Xác nhận';
        }
    }
}

export function handleBulkMove() {
    if (selectedQuizIds.length === 0) {
        showToast('Vui lòng chọn ít nhất một bộ đề để di chuyển!', 'warning');
        return;
    }
    isBulkMoving = true;
    openMoveQuizModal(null);
}

export async function handleBulkDelete() {
    if (selectedQuizIds.length === 0) {
        showToast('Vui lòng chọn ít nhất một bộ đề để xóa!', 'warning');
        return;
    }
    const ok = await showConfirm(
        `${selectedQuizIds.length} bộ đề đã chọn sẽ được chuyển vào thùng rác và tự động xóa vĩnh viễn sau 30 ngày. Bạn có thể khôi phục trước đó.`,
        { title: 'Chuyển vào thùng rác?', confirmText: 'Vào thùng rác', cancelText: 'Hủy', tone: 'danger' }
    );
    if (!ok) return;
    try {
        const now = new Date();
        const ids = [...selectedQuizIds];
        await Promise.all(ids.map(id => updateDoc(doc(db, "quiz_sets", id), { deleted: true, deletedAt: now })));
        userQuizSets = userQuizSets.filter(q => !ids.includes(q.id)); // cập nhật cache
        showToast(`Đã chuyển ${ids.length} bộ đề vào thùng rác.`, 'success');
        exitSelectionMode(); // sẽ render lại thư viện
    } catch (e) {
        showToast("Không thể chuyển vào thùng rác! Lỗi: " + e.message, 'error');
        console.error("Lỗi khi xóa hàng loạt bộ đề: ", e);
    }
}

export function handleBulkShare() {
    if (selectedQuizIds.length === 0) {
        showToast('Vui lòng chọn ít nhất một bộ đề để chia sẻ!', 'warning');
        return;
    }
    
    const links = selectedQuizIds.map(id => {
        const quiz = userQuizSets.find(q => q.id === id);
        const title = quiz ? quiz.title : 'Bộ đề';
        const quizUrl = new URL(`api/share-quiz?id=${id}&t=${Date.now()}`, window.location.origin).href;
        return `${title}: ${quizUrl}`;
    }).join('\n');

    navigator.clipboard.writeText(links)
        .then(() => {
            showToast(`Đã copy link của ${selectedQuizIds.length} bộ đề vào clipboard!`, 'success');
            exitSelectionMode();
        })
        .catch(() => showToast('Không thể sao chép liên kết!', 'error'));
}

// === CHẾ ĐỘ CHỌN NHIỀU (SELECTION MODE) ===

/**
 * Lấy danh sách bộ đề đang hiển thị trong khung nhìn hiện tại
 * (theo thư mục đang mở hoặc theo kết quả tìm kiếm).
 */
function getFilteredQuizzesForView() {
    const librarySearchInput = document.getElementById('library-search-input');
    const keyword = librarySearchInput ? librarySearchInput.value.trim() : '';
    if (keyword) {
        return filterLibraryByMode(keyword, 'quiz');
    }
    return userQuizSets.filter(quiz =>
        currentFolderId === null ? (!quiz.folderId) : (quiz.folderId === currentFolderId)
    );
}

/**
 * Vẽ lại danh sách hiện tại, tự nhận biết đang tìm kiếm hay đang duyệt thư mục.
 */
function rerenderCurrentView() {
    const librarySearchInput = document.getElementById('library-search-input');
    const keyword = librarySearchInput ? librarySearchInput.value.trim() : '';
    if (keyword) {
        renderLibrary(getFilteredQuizzesForView(), currentLibraryPage);
    } else {
        renderLibrary(userQuizSets, currentLibraryPage);
    }
}

/**
 * Chọn tất cả bộ đề trong khung nhìn hiện tại (mọi trang của thư mục/tìm kiếm).
 */
export function selectAllInView() {
    if (!isSelectionMode) isSelectionMode = true;
    const ids = getFilteredQuizzesForView().map(q => q.id);
    selectedQuizIds = Array.from(new Set(ids));
    rerenderCurrentView();
    updateBulkActionsToolbar();
}

/**
 * Bỏ chọn toàn bộ nhưng vẫn ở trong chế độ chọn nhiều.
 */
export function deselectAllInView() {
    selectedQuizIds = [];
    rerenderCurrentView();
    updateBulkActionsToolbar();
}

export function exitSelectionMode() {
    isSelectionMode = false;
    selectedQuizIds = [];
    updateBulkActionsToolbar();
    loadAndDisplayLibrary();
}

export function updateBulkActionsToolbar() {
    const toolbar = document.getElementById('bulk-actions-toolbar');
    const countLabel = document.getElementById('bulk-select-count');
    const toggleBtn = document.getElementById('bulk-select-toggle-btn');
    const count = selectedQuizIds.length;

    // Đồng bộ nút "Chọn nhiều" cho cả 2 lối vào: bấm nút và nhấn giữ (long-press)
    if (toggleBtn) {
        if (isSelectionMode) {
            toggleBtn.classList.remove('bg-gray-100', 'text-gray-700');
            toggleBtn.classList.add('bg-pink-100', 'text-pink-700', 'border', 'border-pink-300');
            toggleBtn.innerHTML = '<i class="fas fa-check-circle text-xs"></i> <span>Xong</span>';
            toggleBtn.setAttribute('title', 'Thoát chế độ chọn nhiều');
        } else {
            toggleBtn.classList.remove('bg-pink-100', 'text-pink-700', 'border', 'border-pink-300');
            toggleBtn.classList.add('bg-gray-100', 'text-gray-700');
            toggleBtn.innerHTML = '<i class="fas fa-tasks text-xs"></i> <span>Chọn nhiều</span>';
            toggleBtn.setAttribute('title', 'Chọn nhiều bộ đề để thao tác đồng loạt');
        }
    }

    if (!toolbar) return;

    // Hiện thanh tác vụ ngay khi vào chế độ chọn (kể cả khi chưa chọn gì)
    if (isSelectionMode) {
        toolbar.classList.remove('translate-y-28', 'opacity-0', 'pointer-events-none');
        toolbar.classList.add('translate-y-0', 'opacity-100');
    } else {
        toolbar.classList.remove('translate-y-0', 'opacity-100');
        toolbar.classList.add('translate-y-28', 'opacity-0', 'pointer-events-none');
    }

    if (countLabel) {
        countLabel.innerHTML = `<i class="fas fa-check-square mr-1.5"></i> Đã chọn: ${count} bộ đề`;
    }

    // Vô hiệu hoá các nút thao tác khi chưa chọn bộ đề nào
    ['bulk-move-btn', 'bulk-share-btn', 'bulk-delete-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.disabled = count === 0;
        btn.classList.toggle('opacity-50', count === 0);
        btn.classList.toggle('cursor-not-allowed', count === 0);
    });
}

// === CHIA SẺ BỘ ĐỀ (SHARE QUIZ) ===
export function openShareQuizModal(quizId, quizTitle) {
    const modal = document.getElementById('shareQuizModal');
    const titleEl = document.getElementById('share-quiz-title');
    const linkInput = document.getElementById('share-link-input');
    const embedInput = document.getElementById('share-embed-input');
    
    if (!modal || !titleEl || !linkInput || !embedInput) return;
    
    titleEl.textContent = quizTitle;
    
    const quizUrl = new URL(`api/share-quiz?id=${quizId}&t=${Date.now()}`, window.location.origin).href;
    linkInput.value = quizUrl;
    embedInput.value = `<iframe src="${quizUrl}" width="100%" height="600px" style="border:none; border-radius:12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);"></iframe>`;
    
    // Tạo và hiển thị mã QR động
    const qrImg = document.getElementById('share-qr-img');
    if (qrImg) {
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(quizUrl)}`;
    }

    // Gán sự kiện click cho các nút chia sẻ nhanh
    const messengerBtn = document.getElementById('share-messenger-btn');
    const facebookBtn = document.getElementById('share-facebook-btn');
    const systemBtn = document.getElementById('share-system-btn');
    
    if (messengerBtn) {
        messengerBtn.onclick = () => {
            const fbSendUrl = `https://www.facebook.com/dialog/send?app_id=966242223397117&link=${encodeURIComponent(quizUrl)}&redirect_uri=${encodeURIComponent(quizUrl)}`;
            window.open(fbSendUrl, '_blank', 'width=600,height=500');
        };
    }
    
    if (facebookBtn) {
        facebookBtn.onclick = () => {
            const fbShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(quizUrl)}`;
            window.open(fbShareUrl, '_blank', 'width=600,height=500');
        };
    }
    
    if (systemBtn) {
        if (navigator.share) {
            systemBtn.classList.remove('hidden');
            systemBtn.onclick = () => {
                navigator.share({
                    title: quizTitle,
                    text: `Hãy cùng làm bài kiểm tra "${quizTitle}" trên Zitthenkne nhé!`,
                    url: quizUrl
                }).catch(err => console.error('Lỗi chia sẻ hệ thống:', err));
            };
        } else {
            systemBtn.classList.add('hidden');
        }
    }
    
    modal.classList.remove('hidden');
}

export function closeShareQuizModal() {
    const modal = document.getElementById('shareQuizModal');
    if (modal) modal.classList.add('hidden');
}

export function initDragAndDropBreadcrumb() {
    const folderBreadcrumb = document.getElementById('folder-breadcrumb');
    if (folderBreadcrumb) {
        folderBreadcrumb.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });
        folderBreadcrumb.addEventListener('dragenter', (e) => {
            e.preventDefault();
            folderBreadcrumb.classList.add('border-pink-500', 'bg-pink-50/50');
        });
        folderBreadcrumb.addEventListener('dragleave', () => {
            folderBreadcrumb.classList.remove('border-pink-500', 'bg-pink-50/50');
        });
        folderBreadcrumb.addEventListener('drop', async (e) => {
            e.preventDefault();
            folderBreadcrumb.classList.remove('border-pink-500', 'bg-pink-50/50');
            const quizId = e.dataTransfer.getData('text/plain');
            if (!quizId) return;
            
            try {
                isLibraryFullyLoaded = false;
                const quizDocRef = doc(db, "quiz_sets", quizId);
                await updateDoc(quizDocRef, { folderId: null });
                showToast('Đã chuyển bộ đề về Thư viện gốc!', 'success');
                await loadAndDisplayLibrary();
            } catch (err) {
                console.error("Lỗi kéo thả di chuyển bộ đề về gốc:", err);
                showToast('Có lỗi xảy ra khi di chuyển về gốc!', 'error');
            }
        });
    }
}
