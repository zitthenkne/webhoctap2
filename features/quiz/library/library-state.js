// File: features/quiz/library/library-state.js
// Trạng thái dùng chung của toàn bộ thư viện bộ đề (theo idiom `state` object của quiz-state.js).
// Mọi module trong features/quiz/library/ đọc/ghi qua `S.xxx` để tránh lệch trạng thái giữa các file.

export const S = {
    // Câu hỏi upload từ file (màn tạo bộ đề)
    questions: [],
    currentQuizTitle: '',

    // Cache bộ đề client-side (CHỈ metadata — mảng `questions` được loại bỏ để tiết kiệm RAM)
    userQuizSets: [],

    // Chỉ mục câu hỏi cho tìm kiếm theo nội dung câu hỏi — tải LƯỜI (chỉ khi người dùng thực sự tìm theo câu hỏi)
    questionIndexCache: null,        // mảng phẳng { quizTitle, question, options }
    isQuestionIndexLoaded: false,
    questionIndexLoadingPromise: null,

    // Thư mục
    currentFolderId: null,
    userFolders: [],
    selectedFolderIcon: 'fa-folder',
    selectedFolderColor: 'amber',
    folderModalMode: 'create',
    editingFolderId: null,

    // Chế độ chọn nhiều
    isSelectionMode: false,
    selectedQuizIds: [],
    isBulkMoving: false,
    movingQuizId: null,

    // Phân trang & tải dữ liệu
    currentLibraryPage: 1,
    isLibraryFullyLoaded: false,
    // Thời điểm thư viện được nạp mới nhất từ server, dùng để giới hạn tần suất tự đồng bộ khi quay lại app
    lastLibrarySyncAt: 0,

    // === CUỐN CHIẾU (lazy pagination theo con trỏ Firestore) ===
    // Chỉ áp dụng cho danh sách phẳng (không thư mục, ở gốc, sắp xếp mới nhất, không lọc/tìm kiếm) — xem canUseRollingLibrary().
    libraryCursor: null,          // QueryDocumentSnapshot cuối cùng đã tải (con trỏ startAfter)
    serverHasMore: true,          // còn dữ liệu trên server để tải tiếp không
    chunkLoadingPromise: null,    // promise của cụm đang tải (chống tải chồng + cho phép await cụm đang chạy)

    // Bố cục (lưu cục bộ theo thiết bị)
    libraryLayoutMode: localStorage.getItem('libraryLayoutMode') || 'grid',
    // Số cột lưới do người dùng tự chọn ('auto' = tự co giãn theo màn hình)
    libraryGridCols: localStorage.getItem('libraryGridCols') || 'auto',
    folderGridCols: localStorage.getItem('folderGridCols') || 'auto',

    // Thư mục: phân trang & sắp xếp & tìm kiếm
    currentFolderPage: 1,
    foldersExpanded: false, // false: phân trang 10 thư mục/trang; true: hiện tất cả
    folderSortMode: localStorage.getItem('folderSortMode') || 'manual', // manual | name | newest | count
    folderSearchTerm: '',

    // Sắp xếp, lọc & ghim bộ đề
    librarySortMode: localStorage.getItem('librarySortMode') || 'newest', // newest | oldest | name | count
    libraryFilterMode: localStorage.getItem('libraryFilterMode') || 'all', // all | recent | unattempted | pinned
    pinnedQuizIds: [],

    // === LỊCH SỬ LÀM BÀI (chip tiến độ + lọc "Chưa làm" + khối "Học tiếp") ===
    // quizId -> { s: câu đúng, t: tổng câu, at: ms } — nạp từ cache localStorage, đồng bộ tăng dần từ quiz_results
    attemptMap: {},
    attemptCacheSyncedAt: 0,   // mốc completedAt muộn nhất đã kéo về (0 = chưa từng đồng bộ)
    attemptSyncPromise: null,  // chống đồng bộ chồng
    attemptLastSyncTry: 0      // throttle: lần gọi server gần nhất trong phiên
};

export const LIBRARY_AUTO_SYNC_MIN_INTERVAL = 60 * 1000; // 60s: tránh gọi lại Firestore liên tục khi bật/tắt app nhanh

export const LIB_PAGE_SIZE = 12;
export const LIB_PREFETCH_PAGES = 2;                              // tải sẵn thêm 2 trang
export const LIB_CHUNK = LIB_PAGE_SIZE * (1 + LIB_PREFETCH_PAGES); // mỗi cụm = 36 bộ đề

export const FOLDERS_PER_PAGE = 10;

// === THÙNG RÁC ===
// Xóa thư mục / bộ đề sẽ chuyển vào thùng rác (đánh dấu deleted) và tự xóa vĩnh viễn sau 30 ngày.
// Giao diện xem/khôi phục nằm ở trang riêng features/quiz/trash.html (cho index.html nhẹ hơn).
export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
