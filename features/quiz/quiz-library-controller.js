// File: features/quiz/quiz-library-controller.js
// Module chịu trách nhiệm quản lý thư viện bộ đề, thư mục, trạng thái chọn nhiều, tìm kiếm fuzzy và lưu trữ quiz lên Firestore

import { auth, db } from '../../core/firebase-init.js';
import { 
    doc, setDoc, collection, addDoc, query, where, getDocs, getDoc, 
    orderBy, limit, deleteDoc, updateDoc, runTransaction, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { showToast } from '../../core/utils.js';
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
let currentFolderPage = 1;

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
export function getCurrentLibraryPage() { return currentLibraryPage; }

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

    if (isLibraryFullyLoaded) {
        renderBreadcrumb();
        renderLibrary(userQuizSets, currentLibraryPage);
        return;
    }

    if (page === 1) {
        quizListContainer.innerHTML = `<div class="text-gray-500 col-span-full text-center py-6"><i class="fas fa-spinner fa-spin mr-2"></i>Đang tải thư viện...</div>`;
    }

    try {
        const qFolders = query(collection(db, "quiz_folders"), where("userId", "==", user.uid));
        const querySnapshotFolders = await getDocs(qFolders);
        userFolders = querySnapshotFolders.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
        userFolders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const q = query(
            collection(db, "quiz_sets"),
            where("userId", "==", user.uid),
            orderBy("createdAt", "desc"),
            limit(13)
        );

        const querySnapshot = await getDocs(q);
        const pageQuizzes = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));

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
        userQuizSets = querySnapshot.docs.map(docSnap => {
            const data = docSnap.data();
            if (data.folderId === undefined) {
                updateDoc(docSnap.ref, { folderId: null }).catch(err => {
                    console.warn(`Lỗi tự động cập nhật folderId cho bộ đề ${docSnap.id}:`, err);
                });
                return { id: docSnap.id, ...data, folderId: null };
            }
            return { id: docSnap.id, ...data };
        });

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

export function renderLibrary(quizzesToDisplay, page = 1) {
    if (typeof page !== 'number') page = 1;
    const quizListContainer = document.getElementById('quiz-list-container');
    if (quizListContainer) {
        if (libraryLayoutMode === 'list') {
            quizListContainer.className = 'flex flex-col gap-3 w-full';
        } else {
            quizListContainer.className = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6';
        }
        quizListContainer.innerHTML = '';
    }

    const librarySearchInput = document.getElementById('library-search-input');
    const isSearching = librarySearchInput && librarySearchInput.value.trim() !== '';

    let filteredQuizzes = quizzesToDisplay;
    if (!isSearching) {
        filteredQuizzes = quizzesToDisplay.filter(quiz => 
            currentFolderId === null ? (!quiz.folderId) : (quiz.folderId === currentFolderId)
        );
    }

    filteredQuizzes.sort((a, b) => {
        const timeA = a.createdAt && typeof a.createdAt.toDate === 'function' ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const timeB = b.createdAt && typeof b.createdAt.toDate === 'function' ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return timeB - timeA;
    });

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
        if (!isSearching && currentFolderId === null) {
            const totalFolderPages = Math.ceil(userFolders.length / FOLDERS_PER_PAGE) || 1;
            if (currentFolderPage > totalFolderPages) currentFolderPage = totalFolderPages;
            if (currentFolderPage < 1) currentFolderPage = 1;
            
            const startIdx = (currentFolderPage - 1) * FOLDERS_PER_PAGE;
            const endIdx = startIdx + FOLDERS_PER_PAGE;
            const foldersToDisplay = userFolders.slice(startIdx, endIdx);

            foldersToDisplay.forEach((folder) => {
                const card = document.createElement('div');
                const colorVal = folder.color || 'amber';
                const iconClass = folder.icon || 'fa-folder';
                const count = userQuizSets.filter(q => q.folderId === folder.id).length;

                card.className = 'folder-mini-card w-[200px] flex-shrink-0 md:w-auto md:flex-initial';
                card.setAttribute('data-id', folder.id);

                let iconStyle = '';
                if (colorVal.startsWith('#')) {
                    card.style.borderColor = `${colorVal}33`;
                    card.style.backgroundColor = `${colorVal}08`;
                    iconStyle = `style="background-color: ${colorVal}1a; color: ${colorVal};"`;
                } else {
                    const theme = FOLDER_COLORS[colorVal] || FOLDER_COLORS['amber'];
                    card.classList.add(`border-${colorVal}-100`);
                    iconStyle = `class="folder-icon-wrapper ${theme.iconBg}"`;
                }

                const wrapperHTML = colorVal.startsWith('#') 
                    ? `<div class="folder-icon-wrapper" ${iconStyle}><i class="fas ${iconClass}"></i></div>`
                    : `<div ${iconStyle}><i class="fas ${iconClass}"></i></div>`;

                card.innerHTML = `
                    <div class="folder-mini-card-content folder-click-area">
                        ${wrapperHTML}
                        <div class="min-w-0">
                            <h4 class="font-bold text-gray-800 text-sm truncate" title="${folder.name}">${folder.name}</h4>
                            <p class="text-xs text-gray-500 mt-0.5">${count} bộ đề</p>
                        </div>
                    </div>
                    <div class="relative flex items-center">
                        <button class="folder-menu-btn w-6 h-6 flex items-center justify-center text-gray-400 hover:text-pink-500 rounded-full focus:outline-none" data-id="${folder.id}"><i class="fas fa-ellipsis-v text-xs"></i></button>
                        <div class="folder-menu hidden absolute right-0 top-7 bg-white rounded-lg shadow-lg border border-pink-100 z-30 min-w-[120px]">
                            <button class="block w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-pink-50 rename-folder-btn" data-id="${folder.id}" data-name="${folder.name}"><i class="fas fa-edit mr-2 text-blue-400"></i>Đổi tên</button>
                            <button class="block w-full text-left px-4 py-2 text-xs text-red-700 hover:bg-pink-50 delete-folder-btn" data-id="${folder.id}"><i class="fas fa-trash-alt mr-2 text-red-400"></i>Xóa</button>
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
                    document.querySelectorAll('.quiz-menu, .folder-menu').forEach(m => {
                        if (m !== menu) m.classList.add('hidden');
                    });
                    menu.classList.toggle('hidden');
                });

                card.querySelector('.rename-folder-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    menu.classList.add('hidden');
                    openFolderModal('edit', folder.id, folder.name);
                });

                card.querySelector('.delete-folder-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    menu.classList.add('hidden');
                    confirmDeleteFolder(folder.id);
                });

                // Drag & Drop Folder
                card.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                });
                card.addEventListener('dragenter', (e) => {
                    e.preventDefault();
                    card.classList.add('border-pink-500', 'bg-pink-50/20');
                });
                card.addEventListener('dragleave', () => {
                    card.classList.remove('border-pink-500', 'bg-pink-50/20');
                });
                card.addEventListener('drop', async (e) => {
                    e.preventDefault();
                    card.classList.remove('border-pink-500', 'bg-pink-50/20');
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
            renderFoldersPagination(userFolders.length, currentFolderPage, totalFolderPages);
        } else {
            const folderPaginationContainer = document.getElementById('folders-pagination');
            if (folderPaginationContainer) {
                folderPaginationContainer.innerHTML = '';
                folderPaginationContainer.classList.add('hidden');
            }
        }
    }

    if (filteredQuizzes.length === 0 && (!userFolders.length || currentFolderId !== null || isSearching)) {
        const emptyMsg = document.createElement('p');
        emptyMsg.className = 'text-gray-500 col-span-full text-center py-6';
        emptyMsg.textContent = isSearching ? 'Không tìm thấy bộ đề nào khớp.' : 'Chưa có bộ đề nào trong thư mục này.';
        if (quizListContainer) quizListContainer.appendChild(emptyMsg);
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
                            <a href="features/quiz/quiz.html?id=${quizSet.id}" class="inline-flex items-center justify-center px-3 py-1.5 bg-gradient-to-r from-pink-500 to-rose-400 hover:from-pink-600 hover:to-rose-500 text-white rounded-lg hover:shadow-md hover:shadow-pink-100 active:translate-y-0 transition-all duration-200 text-xs font-bold gap-1 flex-shrink-0">
                                Luyện tập <i class="fas fa-play text-[9px]"></i>
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

                card.innerHTML = `
                    ${checkboxHTML}
                    <div class="flex-grow ${isSelectionMode ? 'pl-8' : ''}">
                        <h3 class="text-sm sm:text-base font-bold text-gray-800 line-clamp-2 pr-8 mb-3" title="${quizSet.title}">
                            <a href="features/quiz/quiz.html?id=${quizSet.id}" class="hover:text-pink-600 focus:text-pink-600 transition-colors duration-150 block">
                                ${quizSet.title}
                            </a>
                        </h3>
                        <div class="flex flex-wrap gap-2 mb-4">
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
                        <a href="features/quiz/quiz.html?id=${quizSet.id}" class="inline-flex items-center justify-center px-4 py-2 bg-gradient-to-r from-pink-500 to-rose-400 hover:from-pink-600 hover:to-rose-500 text-white rounded-xl hover:shadow-lg hover:shadow-pink-100 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 text-xs font-bold gap-1.5">
                            Luyện tập <i class="fas fa-play text-[10px]"></i>
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
    if (confirm("Bạn có chắc muốn xóa bộ đề này? Hành động này không thể hoàn tác.")) {
        try {
            isLibraryFullyLoaded = false;
            await deleteDoc(doc(db, "quiz_sets", quizId));
            showToast("Đã xóa bộ đề thành công!", 'success');
            loadAndDisplayLibrary();
        } catch (e) {
            showToast("Xóa thất bại! Lỗi: " + e.message, 'error');
            console.error("Lỗi khi xóa bộ đề: ", e);
        }
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
        breadcrumb.innerHTML = `<span class="font-semibold text-pink-500"><i class="fas fa-home mr-1"></i>Thư viện gốc</span>`;
    } else {
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
    
    title.textContent = mode === 'create' ? 'Tạo thư mục mới' : 'Đổi tên thư mục';
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
    // Cập nhật các trạng thái chọn Icon & Màu trong DOM Modal
    document.querySelectorAll('.icon-option').forEach(btn => {
        const icon = btn.getAttribute('data-icon');
        if (icon === selectedFolderIcon) {
            btn.classList.add('bg-pink-100', 'text-pink-600', 'ring-2', 'ring-pink-400');
        } else {
            btn.classList.remove('bg-pink-100', 'text-pink-600', 'ring-2', 'ring-pink-400');
        }
    });

    document.querySelectorAll('.color-option').forEach(btn => {
        const color = btn.getAttribute('data-color');
        if (color === selectedFolderColor) {
            btn.classList.add('ring-4', 'ring-offset-2', 'ring-pink-400');
        } else {
            btn.classList.remove('ring-4', 'ring-offset-2', 'ring-pink-400');
        }
    });

    // custom picker
    const colorInput = document.getElementById('folderColorInput');
    if (colorInput && selectedFolderColor.startsWith('#')) {
        colorInput.value = selectedFolderColor;
        const textSpan = document.getElementById('folderColorText');
        if (textSpan) textSpan.textContent = selectedFolderColor.toUpperCase();
    }
    
    const iconInput = document.getElementById('folderIconInput');
    if (iconInput && selectedFolderIcon && !['fa-folder', 'fa-book', 'fa-graduation-cap', 'fa-heartbeat', 'fa-stethoscope'].includes(selectedFolderIcon)) {
        iconInput.value = selectedFolderIcon;
    }
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
            await addDoc(collection(db, "quiz_folders"), {
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
            showToast('Đã đổi tên thư mục thành công!', 'success');
        }
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

async function confirmDeleteFolder(folderId) {
    const folder = userFolders.find(f => f.id === folderId);
    const name = folder ? folder.name : 'thư mục';
    
    const msg = `Bạn có chắc muốn xóa thư mục "${name}"?\nCác bộ đề bên trong thư mục này sẽ ĐƯỢC CHUYỂN VỀ THƯ VIỆN GỐC (không bị xóa).`;
    
    if (confirm(msg)) {
        try {
            isLibraryFullyLoaded = false;
            const user = auth.currentUser;
            if (!user) {
                throw new Error("Người dùng chưa đăng nhập.");
            }
            // 1. Tìm các bộ đề trong thư mục
            const q = query(collection(db, "quiz_sets"), where("userId", "==", user.uid), where("folderId", "==", folderId));
            const snapshot = await getDocs(q);
            
            // 2. Chuyển chúng về null
            if (!snapshot.empty) {
                try {
                    const promises = snapshot.docs.map(docSnap => updateDoc(docSnap.ref, { folderId: null }));
                    await Promise.all(promises);
                } catch (updateErr) {
                    console.error("Lỗi khi cập nhật bộ đề về thư viện gốc:", updateErr);
                    throw new Error("Không thể chuyển bộ đề về thư viện gốc (Lỗi phân quyền quiz_sets).");
                }
            }
            
            // 3. Xóa thư mục
            try {
                await deleteDoc(doc(db, "quiz_folders", folderId));
            } catch (deleteErr) {
                console.error("Lỗi khi xóa thư mục khỏi Firestore:", deleteErr);
                throw new Error("Lỗi phân quyền Firestore khi xóa thư mục (quiz_folders delete).");
            }
            
            showToast('Đã xóa thư mục thành công!', 'success');
            await loadAndDisplayLibrary();
        } catch (err) {
            console.error("Lỗi khi xóa thư mục:", err);
            showToast(err.message || 'Xóa thư mục thất bại!', 'error');
        }
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
    if (confirm(`Bạn có chắc chắn muốn xóa ${selectedQuizIds.length} bộ đề đã chọn? Thao tác này không thể hoàn tác.`)) {
        try {
            isLibraryFullyLoaded = false;
            const promises = selectedQuizIds.map(id => deleteDoc(doc(db, "quiz_sets", id)));
            await Promise.all(promises);
            showToast(`Đã xóa thành công ${selectedQuizIds.length} bộ đề!`, 'success');
            exitSelectionMode();
        } catch (e) {
            showToast("Xóa thất bại! Lỗi: " + e.message, 'error');
            console.error("Lỗi khi xóa hàng loạt bộ đề: ", e);
        }
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
        const quizUrl = new URL(`api/share-quiz?id=${id}`, window.location.origin).href;
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
export function exitSelectionMode() {
    isSelectionMode = false;
    selectedQuizIds = [];
    
    const bulkSelectToggleBtn = document.getElementById('bulk-select-toggle-btn');
    if (bulkSelectToggleBtn) {
        bulkSelectToggleBtn.className = 'px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-xs font-semibold flex items-center gap-1.5 focus:outline-none';
        bulkSelectToggleBtn.innerHTML = '<i class="fas fa-tasks"></i> Chọn nhiều';
    }
    
    updateBulkActionsToolbar();
    loadAndDisplayLibrary();
}

export function updateBulkActionsToolbar() {
    const toolbar = document.getElementById('bulk-actions-toolbar');
    const countLabel = document.getElementById('bulk-selected-count');
    
    if (!toolbar) return;
    
    if (isSelectionMode && selectedQuizIds.length > 0) {
        toolbar.classList.remove('translate-y-28', 'opacity-0', 'pointer-events-none');
        toolbar.classList.add('translate-y-0', 'opacity-100');
        if (countLabel) countLabel.textContent = `Đã chọn: ${selectedQuizIds.length} bộ đề`;
    } else {
        toolbar.classList.remove('translate-y-0', 'opacity-100');
        toolbar.classList.add('translate-y-28', 'opacity-0', 'pointer-events-none');
    }
}

// === CHIA SẺ BỘ ĐỀ (SHARE QUIZ) ===
export function openShareQuizModal(quizId, quizTitle) {
    const modal = document.getElementById('shareQuizModal');
    const titleEl = document.getElementById('share-quiz-title');
    const linkInput = document.getElementById('share-link-input');
    const embedInput = document.getElementById('share-embed-input');
    
    if (!modal || !titleEl || !linkInput || !embedInput) return;
    
    titleEl.textContent = quizTitle;
    
    const quizUrl = new URL(`api/share-quiz?id=${quizId}`, window.location.origin).href;
    linkInput.value = quizUrl;
    embedInput.value = `<iframe src="${quizUrl}" width="100%" height="600px" style="border:none; border-radius:12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);"></iframe>`;
    
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
