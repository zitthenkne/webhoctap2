// File: features/quiz/library/library-render.js
// Vẽ thư viện: điều phối renderLibrary, skeleton, trạng thái rỗng, tổng quan nhanh,
// phân trang bộ đề/thư mục và breadcrumb. Phần dựng từng thẻ nằm ở library-cards.js.
// Tách từ quiz-library-controller.js — logic giữ nguyên, chỉ đổi truy cập trạng thái sang S.xxx.

import { auth } from '../../../core/firebase-init.js';
import { sessionUser } from '../../../core/auth-session.js';
import { S, FOLDERS_PER_PAGE, LIB_PREFETCH_PAGES } from './library-state.js';
import {
    applyQuizGridColumns, applyFolderGridColumns,
    applyLibraryFilter, sortQuizList, getFoldersForDisplay,
    removeOrphanFolderMenus
} from './library-helpers.js';
import { createFolderCard, createQuizCard } from './library-cards.js';
import { canUseRollingLibrary, loadLibraryChunk, loadAllLibraryInBackground } from './library-data.js';
import { filterLibraryByMode } from './library-search.js';

export function updateLayoutButtons() {
    const gridBtn = document.getElementById('library-layout-grid-btn');
    const listBtn = document.getElementById('library-layout-list-btn');
    if (!gridBtn || !listBtn) return;

    if (S.libraryLayoutMode === 'list') {
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

    if (!S.isLibraryFullyLoaded) {
        if (elQuizzes) elQuizzes.textContent = '…';
        if (elQuestions) elQuestions.textContent = '…';
        if (elFolders) elFolders.textContent = S.userFolders.length || '…';
        return;
    }
    const totalQuestions = S.userQuizSets.reduce((sum, q) => sum + (q.questionCount || 0), 0);
    const fmt = (n) => n.toLocaleString('vi-VN');
    if (elQuizzes) elQuizzes.textContent = fmt(S.userQuizSets.length);
    if (elQuestions) elQuestions.textContent = fmt(totalQuestions);
    if (elFolders) elFolders.textContent = fmt(S.userFolders.length);
}

// === SKELETON LOADING ===
export function renderLibrarySkeleton(container, count = 8) {
    if (!container) return;
    container.className = 'quiz-grid';
    applyQuizGridColumns(container);
    let html = '';
    for (let i = 0; i < count; i++) {
        html += `
            <div class="quiz-skeleton-card">
                <div class="qs-top">
                    <div class="skeleton-line qs-icon"></div>
                    <div class="qs-lines">
                        <div class="skeleton-line h-3.5 w-4/5"></div>
                        <div class="skeleton-line h-2.5 w-2/5"></div>
                    </div>
                </div>
                <div class="skeleton-line h-2 w-full rounded-full"></div>
                <div class="qs-foot">
                    <div class="skeleton-line h-8 w-8 rounded-xl"></div>
                    <div class="skeleton-line h-9 flex-1 rounded-xl"></div>
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
        quizListContainer.className = S.libraryLayoutMode === 'list' ? 'quiz-grid is-list' : 'quiz-grid';
        applyQuizGridColumns(quizListContainer);
        quizListContainer.innerHTML = '';
    }

    const librarySearchInput = document.getElementById('library-search-input');
    const isSearching = librarySearchInput && librarySearchInput.value.trim() !== '';

    updateLibraryOverview();

    let filteredQuizzes = quizzesToDisplay;
    if (!isSearching) {
        filteredQuizzes = quizzesToDisplay.filter(quiz =>
            S.currentFolderId === null ? (!quiz.folderId) : (quiz.folderId === S.currentFolderId)
        );
        // Áp dụng bộ lọc nhanh (Tất cả / Gần đây / Đã ghim)
        filteredQuizzes = applyLibraryFilter(filteredQuizzes);
    }

    // Sắp xếp theo lựa chọn người dùng (ghim luôn lên đầu); khi tìm kiếm giữ thứ tự liên quan
    filteredQuizzes = isSearching ? [...filteredQuizzes] : sortQuizList(filteredQuizzes);

    // Cập nhật bộ đếm kết quả
    const resultCountEl = document.getElementById('library-result-count');
    if (resultCountEl) {
        if (isSearching || S.libraryFilterMode !== 'all') {
            resultCountEl.textContent = `${filteredQuizzes.length} bộ đề`;
            resultCountEl.classList.remove('hidden');
        } else {
            resultCountEl.classList.add('hidden');
        }
    }

    const foldersSection = document.getElementById('folders-section');
    const foldersContainer = document.getElementById('folders-container');
    const quizzesSectionTitle = document.getElementById('quizzes-section-title');
    const foldersHeader = document.getElementById('folders-header');
    const folderToolsGroup = document.getElementById('folder-tools-group');

    const atRoot = !isSearching && S.currentFolderId === null;
    const hasFolders = S.userFolders.length > 0;
    const showFolders = atRoot && hasFolders;

    // Header (tiêu đề + nút Tạo thư mục + tìm kiếm + sắp xếp) hiển thị ở gốc thư viện,
    // kể cả khi chưa có thư mục nào (để người dùng mới vẫn thấy nút "Tạo thư mục").
    if (foldersHeader) {
        if (atRoot) foldersHeader.classList.remove('hidden');
        else foldersHeader.classList.add('hidden');
    }
    // Ô tìm kiếm & sắp xếp chỉ có ý nghĩa khi đã có thư mục.
    if (folderToolsGroup) {
        if (hasFolders) folderToolsGroup.classList.remove('hidden');
        else folderToolsGroup.classList.add('hidden');
    }
    if (foldersSection) {
        if (showFolders) foldersSection.classList.remove('hidden');
        else foldersSection.classList.add('hidden');
    }
    if (quizzesSectionTitle) {
        if (showFolders) quizzesSectionTitle.classList.remove('hidden');
        else quizzesSectionTitle.classList.add('hidden');
    }

    if (foldersContainer) {
        removeOrphanFolderMenus(); // menu đang mở đã được đưa ra <body>, xoá kẻo thành rác
        foldersContainer.innerHTML = '';
        applyFolderGridColumns(foldersContainer);
        if (!isSearching && S.currentFolderId === null) {
            const visibleFolders = getFoldersForDisplay(); // đã lọc theo tìm kiếm + sắp xếp
            const totalFolders = visibleFolders.length;
            const showAll = S.foldersExpanded || S.folderSearchTerm.trim() !== '' || totalFolders <= FOLDERS_PER_PAGE;
            const totalFolderPages = Math.ceil(totalFolders / FOLDERS_PER_PAGE) || 1;

            // Không có thư mục nào khớp từ khoá tìm kiếm → báo "không tìm thấy"
            if (totalFolders === 0 && S.folderSearchTerm.trim() !== '') {
                foldersContainer.innerHTML = `<div class="col-span-full text-center py-6 text-sm text-gray-400"><i class="fas fa-folder-open text-2xl mb-2 block opacity-50"></i>Không tìm thấy thư mục khớp "${S.folderSearchTerm.trim()}"</div>`;
            }

            let foldersToDisplay;
            if (showAll) {
                foldersToDisplay = visibleFolders;
                if (S.folderSearchTerm.trim() === '') S.currentFolderPage = 1;
            } else {
                if (S.currentFolderPage > totalFolderPages) S.currentFolderPage = totalFolderPages;
                if (S.currentFolderPage < 1) S.currentFolderPage = 1;
                const startIdx = (S.currentFolderPage - 1) * FOLDERS_PER_PAGE;
                foldersToDisplay = visibleFolders.slice(startIdx, startIdx + FOLDERS_PER_PAGE);
            }

            foldersToDisplay.forEach((folder, idx) => {
                const folderCard = createFolderCard(folder);
                // Chỉ số dùng cho hoạt ảnh xuất hiện so le (stagger); giới hạn để thẻ cuối không trễ quá lâu
                folderCard.style.setProperty('--card-index', Math.min(idx, 12));
                foldersContainer.appendChild(folderCard);
            });

            if (!showAll) {
                renderFoldersPagination(totalFolders, S.currentFolderPage, totalFolderPages);
            } else {
                clearFoldersPagination();
            }
            // Khi đang tìm kiếm thì luôn hiện hết kết quả → ẩn nút "Xem tất cả / Thu gọn"
            renderFoldersToggle(S.folderSearchTerm.trim() !== '' ? 0 : totalFolders);
        } else {
            clearFoldersPagination();
            renderFoldersToggle(0);
        }
    }

    if (filteredQuizzes.length === 0 && (!S.userFolders.length || S.currentFolderId !== null || isSearching || S.libraryFilterMode !== 'all')) {
        let emptyType = 'root';
        if (isSearching) emptyType = 'search';
        else if (S.libraryFilterMode !== 'all') emptyType = 'filter';
        else if (S.currentFolderId !== null) emptyType = 'folder';
        renderEmptyState(quizListContainer, emptyType);
        renderLibraryPagination([], 1, 1);
        return;
    }

    const ITEMS_PER_PAGE = 12;
    let totalPages = 1;
    let currentPage = page;
    const rollingActive = !S.isLibraryFullyLoaded && !isSearching && canUseRollingLibrary();

    if (S.isLibraryFullyLoaded || isSearching) {
        totalPages = Math.ceil(filteredQuizzes.length / ITEMS_PER_PAGE) || 1;
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        filteredQuizzes = filteredQuizzes.slice(startIndex, endIndex);
    } else if (rollingActive) {
        // Phân trang trên phần dữ liệu ĐÃ tải; nút "Trang sau" sẽ tải thêm cụm khi cần.
        totalPages = Math.ceil(filteredQuizzes.length / ITEMS_PER_PAGE) || 1;
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        filteredQuizzes = filteredQuizzes.slice(startIndex, startIndex + ITEMS_PER_PAGE);

        // Prefetch: sắp chạm cuối phần đã tải mà server còn dữ liệu → tải sẵn cụm kế (làm ấm cache, không re-render)
        if (S.serverHasMore && !S.chunkLoadingPromise && sessionUser() && (totalPages - currentPage) < LIB_PREFETCH_PAGES) {
            loadLibraryChunk(sessionUser().uid);
        }
    } else {
        totalPages = 1;
        currentPage = 1;
        filteredQuizzes = filteredQuizzes.slice(0, ITEMS_PER_PAGE);
    }

    if (quizListContainer) {
        filteredQuizzes.forEach((quizSet, idx) => {
            const card = createQuizCard(quizSet, quizzesToDisplay, currentPage);
            // Chỉ số cho hoạt ảnh xuất hiện so le (stagger); giới hạn để thẻ cuối không trễ quá lâu
            card.style.setProperty('--card-index', Math.min(idx, 12));
            quizListContainer.appendChild(card);
        });
    }

    // Cuốn chiếu cần danh sách đầy đủ (chưa cắt) để nút phân trang chuyển trang đúng
    const paginationList = (isSearching || S.isLibraryFullyLoaded || rollingActive) ? quizzesToDisplay : filteredQuizzes;
    renderLibraryPagination(paginationList, currentPage, totalPages);
}

function renderLibraryPagination(quizzesToDisplay, currentPage, totalPages) {
    let paginationContainer = document.getElementById('library-pagination');
    if (!paginationContainer) {
        paginationContainer = document.createElement('div');
        paginationContainer.id = 'library-pagination';
        paginationContainer.className = 'flex justify-center items-center mt-6 col-span-full w-full';
        const quizListContainer = document.getElementById('quiz-list-container');
        if (quizListContainer && quizListContainer.parentNode) {
            quizListContainer.parentNode.insertBefore(paginationContainer, quizListContainer.nextSibling);
        }
    }

    const librarySearchInput = document.getElementById('library-search-input');
    const isSearching = librarySearchInput && librarySearchInput.value.trim() !== '';
    const rolling = !S.isLibraryFullyLoaded && !isSearching && canUseRollingLibrary();
    const hasMore = rolling && S.serverHasMore; // còn cụm để tải tiếp trên server

    if (!S.isLibraryFullyLoaded && !isSearching && !rolling) {
        paginationContainer.innerHTML = '';
        return;
    }

    // Ẩn thanh phân trang khi chỉ có 1 trang VÀ không còn dữ liệu để tải thêm
    if (totalPages <= 1 && !hasMore) {
        paginationContainer.innerHTML = '';
        return;
    }

    const nextDisabled = currentPage >= totalPages && !hasMore;
    const totalLabel = hasMore ? `${totalPages}+` : totalPages; // "+" báo hiệu còn trang chưa tải

    paginationContainer.innerHTML = `
        <nav class="lib-pager" aria-label="Phân trang bộ đề">
            <button id="lib-prev-page" class="lib-pager-btn" aria-label="Trang trước" ${currentPage === 1 ? 'disabled' : ''}>
                <i class="fas fa-chevron-left"></i><span>Trước</span>
            </button>
            <span class="lib-pager-info">Trang <b>${currentPage}</b> / ${totalLabel}</span>
            <button id="lib-next-page" class="lib-pager-btn" aria-label="Trang sau" ${nextDisabled ? 'disabled' : ''}>
                <span>Sau</span><i class="fas fa-chevron-right"></i>
            </button>
        </nav>
    `;

    document.getElementById('lib-prev-page').addEventListener('click', () => {
        if (currentPage > 1) {
            renderLibrary(quizzesToDisplay, currentPage - 1);
            scrollToQuizzesTop();
        }
    });

    document.getElementById('lib-next-page').addEventListener('click', async () => {
        if (currentPage < totalPages) {
            renderLibrary(quizzesToDisplay, currentPage + 1);
            scrollToQuizzesTop();
        } else if (hasMore && sessionUser()) {
            // Đang ở cuối phần đã tải nhưng server còn dữ liệu → tải cụm kế rồi sang trang
            const nextBtn = document.getElementById('lib-next-page');
            if (nextBtn) {
                nextBtn.disabled = true;
                nextBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
            }
            await loadLibraryChunk(sessionUser().uid);
            renderLibrary(S.userQuizSets, currentPage + 1);
            scrollToQuizzesTop();
        }
    });
}

// Sang trang xong mà vẫn đứng ở cuối danh sách thì phải tự cuộn lên tìm đầu trang mới.
// Trừ hao ~84px cho bảng công cụ dính ở mép trên, nếu không tiêu đề khu vực bị nó che.
function scrollToQuizzesTop() {
    const section = document.getElementById('quizzes-section');
    if (!section) return;
    const top = section.getBoundingClientRect().top + window.scrollY - 84;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
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
    btn.innerHTML = S.foldersExpanded
        ? '<i class="fas fa-chevron-up text-[10px]"></i> Thu gọn'
        : `<i class="fas fa-layer-group text-[10px]"></i> Xem tất cả (${totalFolders})`;
    btn.addEventListener('click', () => {
        S.foldersExpanded = !S.foldersExpanded;
        S.currentFolderPage = 1;
        renderLibrary(S.userQuizSets, S.currentLibraryPage);
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
        if (S.currentFolderPage > 1) {
            S.currentFolderPage--;
            renderLibrary(S.userQuizSets, S.currentLibraryPage);
        }
    });
    paginationContainer.appendChild(prevBtn);

    for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.type = 'button';
        pageBtn.className = `folder-page-btn ${i === currentPage ? 'active' : ''}`;
        pageBtn.textContent = i;
        pageBtn.addEventListener('click', () => {
            if (S.currentFolderPage !== i) {
                S.currentFolderPage = i;
                renderLibrary(S.userQuizSets, S.currentLibraryPage);
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
        if (S.currentFolderPage < totalPages) {
            S.currentFolderPage++;
            renderLibrary(S.userQuizSets, S.currentLibraryPage);
        }
    });
    paginationContainer.appendChild(nextBtn);
}

export function renderBreadcrumb() {
    const breadcrumb = document.getElementById('folder-breadcrumb');
    if (!breadcrumb) return;

    if (S.currentFolderId === null) {
        // Ở thư viện gốc thì ẩn breadcrumb cho gọn (đã có tiêu đề trang)
        breadcrumb.classList.add('hidden');
        breadcrumb.classList.remove('flex');
        breadcrumb.innerHTML = `<span class="font-semibold text-pink-500"><i class="fas fa-home mr-1"></i>Thư viện gốc</span>`;
    } else {
        breadcrumb.classList.remove('hidden');
        breadcrumb.classList.add('flex');
        const currentFolder = S.userFolders.find(f => f.id === S.currentFolderId);
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
                S.currentFolderId = null;
                renderBreadcrumb();
                renderLibrary(S.userQuizSets);
            });
        }
    }
}

/**
 * Lấy danh sách bộ đề đang hiển thị trong khung nhìn hiện tại
 * (theo thư mục đang mở hoặc theo kết quả tìm kiếm).
 */
export function getFilteredQuizzesForView() {
    const librarySearchInput = document.getElementById('library-search-input');
    const keyword = librarySearchInput ? librarySearchInput.value.trim() : '';
    if (keyword) {
        return filterLibraryByMode(keyword, 'quiz');
    }
    return S.userQuizSets.filter(quiz =>
        S.currentFolderId === null ? (!quiz.folderId) : (quiz.folderId === S.currentFolderId)
    );
}

/**
 * Vẽ lại danh sách hiện tại, tự nhận biết đang tìm kiếm hay đang duyệt thư mục.
 */
export function rerenderCurrentView() {
    const librarySearchInput = document.getElementById('library-search-input');
    const keyword = librarySearchInput ? librarySearchInput.value.trim() : '';
    // Chế độ hiện tại cần toàn bộ dữ liệu (sắp xếp khác/lọc/chọn nhiều) nhưng đang cuốn chiếu chưa tải hết
    // → nạp đầy đủ rồi tự render; tránh sắp xếp/lọc sai trên phần dữ liệu mới tải một phần.
    if (!S.isLibraryFullyLoaded && !keyword && !canUseRollingLibrary() && sessionUser()) {
        loadAllLibraryInBackground(sessionUser().uid);
        return;
    }
    if (keyword) {
        renderLibrary(getFilteredQuizzesForView(), S.currentLibraryPage);
    } else {
        renderLibrary(S.userQuizSets, S.currentLibraryPage);
    }
}
