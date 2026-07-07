// File: features/quiz/quiz-library-controller.js
// API công khai của thư viện bộ đề. Phần ruột đã được tách thành các module nhỏ trong
// features/quiz/library/ (state, helpers, data, search, render, cards, actions);
// file này chỉ còn giữ các getter/setter trạng thái + re-export để nơi khác (app.js)
// import theo đường dẫn cũ mà không phải sửa gì.
//
// Sơ đồ module:
//   library-state.js   — object `S` chứa toàn bộ trạng thái dùng chung + hằng số
//   library-helpers.js — hàm thuần túy, màu sắc, ghim, sắp xếp/lọc
//   library-data.js    — tải Firestore (cuốn chiếu / tải-đầy-đủ), auto-sync, lưu bộ đề
//   library-search.js  — tìm kiếm fuzzy + chỉ mục câu hỏi tải lười
//   library-render.js  — renderLibrary, phân trang, breadcrumb, skeleton, trạng thái rỗng
//   library-cards.js   — dựng thẻ thư mục / thẻ bộ đề + thao tác offline
//   library-actions.js — CRUD thư mục, di chuyển, chọn nhiều, chia sẻ, thùng rác

import { S } from './library/library-state.js';
import { togglePinData } from './library/library-helpers.js';
import { renderLibrary, rerenderCurrentView } from './library/library-render.js';

// Tải dữ liệu & lưu bộ đề
export {
    saveAndStartQuiz,
    saveOnly,
    loadAndDisplayLibrary,
    forceReloadLibrary,
    initLibraryAutoSync
} from './library/library-data.js';

// Tìm kiếm
export {
    filterLibraryByMode,
    handleLibrarySearch
} from './library/library-search.js';

// Render
export {
    renderLibrary,
    renderBreadcrumb,
    updateLayoutButtons
} from './library/library-render.js';

// Thao tác (thư mục, di chuyển, chọn nhiều, chia sẻ...)
export {
    deleteQuizSet,
    editQuizSetTitle,
    openFolderModal,
    closeFolderModal,
    selectFolderIcon,
    setCustomFolderIcon,
    selectFolderColor,
    setCustomFolderColor,
    saveFolder,
    openMoveQuizModal,
    closeMoveQuizModal,
    confirmMoveQuiz,
    handleBulkMove,
    handleBulkDelete,
    handleBulkShare,
    selectAllInView,
    deselectAllInView,
    exitSelectionMode,
    updateBulkActionsToolbar,
    openShareQuizModal,
    closeShareQuizModal,
    initDragAndDropBreadcrumb
} from './library/library-actions.js';

// Getters & Setters sắp xếp / tìm kiếm thư mục
export function getFolderSortMode() { return S.folderSortMode; }
export function setFolderSortMode(mode) {
    S.folderSortMode = mode;
    localStorage.setItem('folderSortMode', mode);
    renderLibrary(S.userQuizSets, S.currentLibraryPage);
}
export function setFolderSearchTerm(term) {
    S.folderSearchTerm = term || '';
    S.currentFolderPage = 1; // về trang đầu khi đổi từ khoá
    renderLibrary(S.userQuizSets, S.currentLibraryPage);
}

// Getters & Setters cho câu hỏi upload
export function getQuestions() { return S.questions; }
export function setQuestions(qs) { S.questions = qs; }
export function getCurrentQuizTitle() { return S.currentQuizTitle; }
export function setCurrentQuizTitle(title) { S.currentQuizTitle = title; }

// Getters & Setters trạng thái Selection
export function getIsSelectionMode() { return S.isSelectionMode; }
export function setIsSelectionMode(val) { S.isSelectionMode = val; }
export function getSelectedQuizIds() { return S.selectedQuizIds; }
export function setSelectedQuizIds(val) { S.selectedQuizIds = val; }
export function getUserQuizSets() { return S.userQuizSets; }
export function getLibraryLayoutMode() { return S.libraryLayoutMode; }
export function setLibraryLayoutMode(mode) {
    S.libraryLayoutMode = mode;
    localStorage.setItem('libraryLayoutMode', mode);
}
// Số cột lưới tuỳ chỉnh (lưu cục bộ theo thiết bị) — 'auto' hoặc số dạng chuỗi
export function getLibraryGridCols() { return S.libraryGridCols; }
export function setLibraryGridCols(cols) {
    S.libraryGridCols = cols;
    localStorage.setItem('libraryGridCols', cols);
}
export function getFolderGridCols() { return S.folderGridCols; }
export function setFolderGridCols(cols) {
    S.folderGridCols = cols;
    localStorage.setItem('folderGridCols', cols);
}

export function getCurrentLibraryPage() { return S.currentLibraryPage; }

// Getters & Setters cho Sắp xếp / Lọc
export function getLibrarySortMode() { return S.librarySortMode; }
export function setLibrarySortMode(mode) {
    S.librarySortMode = mode;
    localStorage.setItem('librarySortMode', mode);
    S.currentLibraryPage = 1;
    rerenderCurrentView();
}
export function getLibraryFilterMode() { return S.libraryFilterMode; }
export function setLibraryFilterMode(mode) {
    S.libraryFilterMode = mode;
    localStorage.setItem('libraryFilterMode', mode);
    S.currentLibraryPage = 1;
    rerenderCurrentView();
}

// Ghim / bỏ ghim bộ đề rồi vẽ lại khung nhìn hiện tại
export function togglePin(quizId) {
    togglePinData(quizId);
    rerenderCurrentView();
}
