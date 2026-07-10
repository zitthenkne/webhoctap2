// File: features/quiz/library/library-data.js
// Tải dữ liệu thư viện từ Firestore: cuốn chiếu (rolling cursor), tải-đầy-đủ chạy nền,
// tự đồng bộ khi quay lại app, và lưu bộ đề mới lên Firestore.
// Tách từ quiz-library-controller.js — logic giữ nguyên, chỉ đổi truy cập trạng thái sang S.xxx.

import { auth, db } from '../../../core/firebase-init.js';
import {
    doc, collection, addDoc, query, where, getDocs,
    orderBy, limit, startAfter, updateDoc, runTransaction
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import { showToast } from '../../../core/utils.js';
import { checkAndAwardAchievement } from '../../../core/achievements.js';
import { S, LIB_CHUNK, LIBRARY_AUTO_SYNC_MIN_INTERVAL } from './library-state.js';
import { purgeExpiredTrash, sortUserFolders, loadPinnedQuizIds } from './library-helpers.js';
import { renderLibrary, renderLibrarySkeleton, renderBreadcrumb, rerenderCurrentView } from './library-render.js';
import { loadAttemptCache, syncAttemptsFromServer } from './library-attempts.js';
import { invalidateQuestionIndex } from './library-search.js';

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
    if (S.questions.length === 0) return showToast('Không có câu hỏi để bắt đầu.', 'warning');
    if (processBtn) {
        processBtn.disabled = true;
        processBtn.innerHTML = 'Đang chuẩn bị...';
    }

    try {
        const docRef = await addDoc(collection(db, "quiz_sets"), {
            userId: user.uid,
            title: S.currentQuizTitle,
            questionCount: S.questions.length,
            questions: S.questions,
            createdAt: new Date(),
            isPublic: true,
            folderId: S.currentFolderId || null
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
    if (S.questions.length === 0) return showToast('Không có câu hỏi để lưu.', 'warning');
    if (saveBtnPreQuiz) {
        saveBtnPreQuiz.disabled = true;
        saveBtnPreQuiz.innerHTML = 'Đang lưu...';
    }

    try {
        await addDoc(collection(db, "quiz_sets"), {
            userId: user.uid,
            title: S.currentQuizTitle,
            questionCount: S.questions.length,
            questions: S.questions,
            createdAt: new Date(),
            isPublic: true,
            folderId: S.currentFolderId || null
        });
        await checkCreationAchievements(user.uid);
        showToast(`Đã lưu "${S.currentQuizTitle}" vào thư viện!`, 'success');
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

// === CHỜ FIREBASE KHÔI PHỤC PHIÊN ĐĂNG NHẬP ===
// Lúc mới tải trang, auth.currentUser là null cho tới khi Firebase khôi phục xong phiên (~1-2s).
// Nếu mở tab Thư viện trong khoảng đó mà hiện ngay "Vui lòng đăng nhập" thì vừa sai vừa xấu —
// thay vào đó giữ skeleton và chờ auth resolve lần đầu rồi mới quyết định.
let authResolved = false;
const authReadyPromise = new Promise(resolve => {
    const unsubscribe = onAuthStateChanged(auth, () => {
        authResolved = true;
        unsubscribe();
        resolve();
    });
});

// === TẢI VÀ RENDER THƯ VIỆN ===
export async function loadAndDisplayLibrary(page = 1) {
    if (typeof page !== 'number') page = 1;
    let user = auth.currentUser;
    const quizListContainer = document.getElementById('quiz-list-container');
    if (!quizListContainer) return;

    if (!user && !authResolved) {
        // Auth chưa xác định xong → hiện skeleton trong lúc chờ, rồi kiểm tra lại
        renderLibrarySkeleton(quizListContainer);
        await authReadyPromise;
        user = auth.currentUser;
    }

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

    S.currentLibraryPage = page;
    loadPinnedQuizIds();
    loadAttemptCache();
    // Đồng bộ lịch sử làm bài ở nền (tăng dần, có throttle); có dữ liệu mới thì vẽ lại chip tiến độ
    syncAttemptsFromServer().then(changed => {
        if (changed) rerenderCurrentView();
    });

    if (S.isLibraryFullyLoaded) {
        renderBreadcrumb();
        renderLibrary(S.userQuizSets, S.currentLibraryPage);
        return;
    }

    // Đây là một lần nạp lại thật sự (lần đầu hoặc sau khi dữ liệu đổi) → chỉ mục câu hỏi có thể đã cũ
    invalidateQuestionIndex();

    if (page === 1) {
        renderLibrarySkeleton(quizListContainer);
    }

    try {
        const qFolders = query(collection(db, "quiz_folders"), where("userId", "==", user.uid));
        const querySnapshotFolders = await getDocs(qFolders);
        const allFolders = querySnapshotFolders.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
        purgeExpiredTrash(allFolders, "quiz_folders"); // dọn thư mục quá hạn 30 ngày
        S.userFolders = allFolders.filter(f => !f.deleted); // ẩn thư mục đang trong thùng rác
        sortUserFolders();

        if (canUseRollingLibrary()) {
            // CUỐN CHIẾU: chỉ tải cụm đầu (36 = 12 hiển thị + prefetch 2 trang), tải thêm khi sang trang.
            S.libraryCursor = null;
            S.serverHasMore = true;
            S.userQuizSets = [];
            await loadLibraryChunk(user.uid);
            renderBreadcrumb();
            renderLibrary(S.userQuizSets, page);
        } else {
            // Đường tải-đầy-đủ (có thư mục / sắp xếp khác / lọc / tìm kiếm): hiển thị nhanh trang đầu rồi nạp toàn bộ ở nền.
            const q = query(
                collection(db, "quiz_sets"),
                where("userId", "==", user.uid),
                orderBy("createdAt", "desc"),
                limit(13)
            );

            const querySnapshot = await getDocs(q);
            const pageQuizzes = querySnapshot.docs
                .map(docSnap => {
                    const { questions, ...meta } = docSnap.data(); // không giữ câu hỏi trong RAM
                    return { id: docSnap.id, ...meta };
                })
                .filter(q => !q.deleted); // ẩn bộ đề đang trong thùng rác

            S.lastLibrarySyncAt = Date.now(); // đánh dấu vừa nạp tươi từ server
            renderBreadcrumb();
            renderLibrary(pageQuizzes, 1);

            loadAllLibraryInBackground(user.uid);
        }
    } catch (e) {
        console.error("Lỗi tải thư viện: ", e);
        quizListContainer.innerHTML = '<p class="text-red-500">Lỗi tải thư viện: ' + e.message + '</p>';
    }
}

export async function loadAllLibraryInBackground(userId) {
    try {
        const q = query(collection(db, "quiz_sets"), where("userId", "==", userId));
        const querySnapshot = await getDocs(q);
        const allQuizzes = querySnapshot.docs.map(docSnap => {
            // Loại bỏ mảng `questions` (chiếm ~99% dung lượng) khỏi cache để giảm mạnh RAM.
            // Thư viện chỉ cần metadata; nội dung câu hỏi được tải riêng khi mở bộ đề hoặc khi tìm theo câu hỏi.
            const { questions, ...meta } = docSnap.data();
            if (meta.folderId === undefined) {
                updateDoc(docSnap.ref, { folderId: null }).catch(err => {
                    console.warn(`Lỗi tự động cập nhật folderId cho bộ đề ${docSnap.id}:`, err);
                });
                return { id: docSnap.id, ...meta, folderId: null };
            }
            return { id: docSnap.id, ...meta };
        });
        purgeExpiredTrash(allQuizzes, "quiz_sets"); // dọn bộ đề quá hạn 30 ngày
        S.userQuizSets = allQuizzes.filter(q => !q.deleted); // ẩn bộ đề đang trong thùng rác

        S.userQuizSets.sort((a, b) => {
            const timeA = a.createdAt && typeof a.createdAt.toDate === 'function' ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
            const timeB = b.createdAt && typeof b.createdAt.toDate === 'function' ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
            return timeB - timeA;
        });

        S.isLibraryFullyLoaded = true;
        S.serverHasMore = false;          // đã có toàn bộ; cuốn chiếu không cần tải thêm
        S.lastLibrarySyncAt = Date.now(); // toàn bộ thư viện đã đồng bộ xong
        renderLibrary(S.userQuizSets, S.currentLibraryPage);
    } catch (err) {
        console.error("Lỗi tải thư viện chạy ngầm: ", err);
    }
}

// Có nên dùng chế độ cuốn chiếu không? Chỉ khi danh sách phẳng & không có thao tác cần toàn bộ dữ liệu.
// (Có thư mục → cần đếm số bộ/thư mục & lọc theo thư mục; sắp xếp khác/lọc/tìm kiếm → cần toàn bộ.)
export function isLibrarySearchActive() {
    const input = document.getElementById('library-search-input');
    return !!(input && input.value.trim());
}
export function canUseRollingLibrary() {
    return S.currentFolderId === null
        && S.userFolders.length === 0
        && S.librarySortMode === 'newest'
        && S.libraryFilterMode === 'all'
        && !S.isSelectionMode
        && !isLibrarySearchActive();
}

// Tải một cụm bộ đề kế tiếp theo con trỏ Firestore (startAfter). Bổ sung vào S.userQuizSets, không tải lại từ đầu.
// Nếu đang có cụm chạy dở, trả về chính promise đó để nơi gọi await đúng (tránh hiển thị trang trống do race).
export function loadLibraryChunk(userId) {
    if (!S.serverHasMore) return Promise.resolve();
    if (S.chunkLoadingPromise) return S.chunkLoadingPromise;

    S.chunkLoadingPromise = (async () => {
        try {
            const constraints = [
                where("userId", "==", userId),
                orderBy("createdAt", "desc")
            ];
            if (S.libraryCursor) constraints.push(startAfter(S.libraryCursor));
            constraints.push(limit(LIB_CHUNK));

            const snap = await getDocs(query(collection(db, "quiz_sets"), ...constraints));
            if (!snap.empty) S.libraryCursor = snap.docs[snap.docs.length - 1];
            // Dựa trên SỐ DOC THÔ trả về (không tính lọc deleted) để biết server còn dữ liệu không
            S.serverHasMore = snap.docs.length === LIB_CHUNK;

            const existingIds = new Set(S.userQuizSets.map(q => q.id));
            snap.docs.forEach(docSnap => {
                const { questions, ...meta } = docSnap.data(); // bỏ mảng câu hỏi nặng khỏi cache
                if (meta.deleted) return;                       // ẩn bộ đề trong thùng rác
                if (existingIds.has(docSnap.id)) return;        // tránh trùng nếu nạp chồng
                if (meta.folderId === undefined) {
                    updateDoc(docSnap.ref, { folderId: null }).catch(() => {});
                    meta.folderId = null;
                }
                S.userQuizSets.push({ id: docSnap.id, ...meta });
            });

            S.lastLibrarySyncAt = Date.now();
            if (!S.serverHasMore) S.isLibraryFullyLoaded = true; // hết dữ liệu → coi như đã tải đầy đủ
        } catch (err) {
            console.error("Lỗi tải cụm thư viện (cuốn chiếu): ", err);
        } finally {
            S.chunkLoadingPromise = null;
        }
    })();
    return S.chunkLoadingPromise;
}

// Đảm bảo toàn bộ thư viện đã nằm trong cache (dùng trước khi sắp xếp/lọc/tìm kiếm/chọn-tất-cả —
// những thao tác cần dữ liệu đầy đủ trong khi cuốn chiếu mới chỉ tải vài cụm).
export async function ensureFullLibraryLoaded() {
    if (S.isLibraryFullyLoaded) return;
    const user = auth.currentUser;
    if (!user) return;
    await loadAllLibraryInBackground(user.uid); // tải toàn bộ metadata + set cờ + render lại
}

// === TỰ ĐỘNG ĐỒNG BỘ KHI QUAY LẠI APP ===
// Trên iPad/iOS, PWA bị tạm dừng rồi khôi phục chứ KHÔNG tải lại trang, nên cache `isLibraryFullyLoaded`
// trong RAM giữ dữ liệu cũ nhiều ngày → bộ đề tạo ở thiết bị khác không xuất hiện. Khi app hiển thị trở lại
// (visibilitychange) hoặc trang được khôi phục từ bfcache (pageshow), ta vô hiệu hoá cache và nạp lại từ server.
function refreshLibraryOnResume() {
    if (document.visibilityState !== 'visible') return;
    if (!auth.currentUser) return;
    // Giới hạn tần suất: nếu vừa đồng bộ trong vòng 60s thì bỏ qua để khỏi tốn lượt đọc Firestore
    if (Date.now() - S.lastLibrarySyncAt < LIBRARY_AUTO_SYNC_MIN_INTERVAL) return;
    // Đang chọn nhiều bộ đề: đừng nạp lại kẻo mất lựa chọn của người dùng
    if (S.isSelectionMode) return;
    // Đang tìm kiếm: giữ nguyên kết quả, không phá thao tác của người dùng
    const searchInput = document.getElementById('library-search-input');
    if (searchInput && searchInput.value.trim()) return;

    S.isLibraryFullyLoaded = false; // buộc lần nạp tới lấy dữ liệu mới từ server
    const libraryPanel = document.getElementById('libraryContent');
    const isLibraryTabVisible = libraryPanel && !libraryPanel.classList.contains('hidden');
    // Chỉ nạp ngay nếu đang mở tab Thư viện; nếu không, để dành tới khi người dùng mở tab (tiết kiệm lượt đọc)
    if (isLibraryTabVisible) {
        loadAndDisplayLibrary(S.currentLibraryPage);
    }
}

// Tải lại thủ công từ server khi người dùng bấm nút "Tải lại".
// Khác với loadAndDisplayLibrary() (chỉ vẽ lại từ cache RAM khi đã nạp đầy đủ),
// hàm này bỏ cache để BUỘC lấy dữ liệu mới từ server. Trả về Promise để UI hiện trạng thái đang tải.
export async function forceReloadLibrary() {
    if (!auth.currentUser) return;
    S.isLibraryFullyLoaded = false; // bỏ cache RAM → lần nạp tới lấy dữ liệu mới từ server
    await loadAndDisplayLibrary(S.currentLibraryPage);
}

// Gắn listener tự đồng bộ. Gọi một lần khi khởi tạo app.
export function initLibraryAutoSync() {
    document.addEventListener('visibilitychange', refreshLibraryOnResume);
    // pageshow với persisted=true: trang được khôi phục từ bfcache (Safari/iOS khi quay lại app)
    window.addEventListener('pageshow', (e) => {
        if (e.persisted) refreshLibraryOnResume();
    });
}
