// File: app.js
// Shell App - Entry point chính của trang Dashboard
// Điều phối SPA tab navigation, quản lý Auth state và kết nối các module chức năng

import { auth, db } from './core/firebase-init.js';
import { onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import { doc, setDoc, collection, query, where, getDocs, getDoc, deleteDoc, serverTimestamp, orderBy } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { showToast, showConfirm } from './core/utils.js';

// Import các Module chức năng
import { parseFile, downloadTemplate } from './core/file-parser.js';
import { loadAndDisplayStats, loadMarkedNotedQuizzes, initGpaCalculator, calculateGPA } from './features/profile/stats-service.js';
import { initDashboardUI } from './core/dashboard-ui.js';
import {
    loadAndDisplayLibrary,
    saveAndStartQuiz,
    saveOnly,
    handleLibrarySearch,
    deleteQuizSet,
    editQuizSetTitle,
    openFolderModal,
    closeFolderModal,
    saveFolder,
    selectFolderIcon,
    setCustomFolderIcon,
    selectFolderColor,
    setCustomFolderColor,
    closeMoveQuizModal,
    confirmMoveQuiz,
    exitSelectionMode,
    selectAllInView,
    deselectAllInView,
    closeShareQuizModal,
    setQuestions,
    setCurrentQuizTitle,
    getIsSelectionMode,
    setIsSelectionMode,
    setSelectedQuizIds,
    setLibraryLayoutMode,
    getLibraryLayoutMode,
    getLibraryGridCols,
    setLibraryGridCols,
    getFolderGridCols,
    setFolderGridCols,
    getFolderSortMode,
    setFolderSortMode,
    setFolderSearchTerm,
    getLibrarySortMode,
    setLibrarySortMode,
    getLibraryFilterMode,
    setLibraryFilterMode,
    updateLayoutButtons,
    renderLibrary,
    getUserQuizSets,
    getCurrentLibraryPage,
    initLibraryAutoSync,
    forceReloadLibrary,
    initDragAndDropBreadcrumb,
    handleBulkMove,
    handleBulkDelete,
    handleBulkShare,
    updateBulkActionsToolbar
} from './features/quiz/quiz-library-controller.js';

// --- Khai báo DOM Elements ---
const menuToggleBtn = document.getElementById('menu-toggle-btn');
const sidebar = document.getElementById('sidebar');
const pageTitle = document.getElementById('pageTitle');
const userMenuButton = document.getElementById('user-menu-button');
const userName = document.getElementById('user-name');
const userAvatar = document.getElementById('user-avatar');
const userNameSidebar = document.getElementById('user-name-sidebar');
const userAvatarSidebar = document.getElementById('user-avatar-sidebar');
const userAvatarMobile = document.getElementById('user-avatar-mobile');
const authModal = document.getElementById('authModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const loginBtn = document.getElementById('loginBtn');
const signupBtn = document.getElementById('signupBtn');
const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileNameElem = document.getElementById('fileName');
const processBtn = document.getElementById('processBtn');
const contentPanels = document.querySelectorAll('.content-panel');
const navLinks = document.querySelectorAll('.nav-link');
const saveBtnPreQuiz = document.getElementById('saveBtn-preQuiz');
const questionCountInfo = document.getElementById('question-count-info');
const selectCreateQuizBtn = document.getElementById('selectCreateQuiz');
const selectGpaCalculatorBtn = document.getElementById('selectGpaCalculator');
const selectStudyRoomBtn = document.getElementById('selectStudyRoom');
const calculateGpaBtn = document.getElementById('calculate-gpa-btn');
const downloadTemplateBtn = document.getElementById('download-template-btn');

// --- HÀM ĐIỀU PHỐI TAB (SPA) ---
function showContent(targetId, title = 'Dashboard') {
    contentPanels.forEach(panel => panel.classList.add('hidden'));
    navLinks.forEach(link => {
        link.classList.remove('bg-pink-100', 'font-bold');
    });
    
    const targetPanel = document.getElementById(targetId);
    if (targetPanel) {
        targetPanel.classList.remove('hidden');
    }
    
    const activeLink = document.querySelector(`.nav-link[data-target="${targetId}"]`);
    if (activeLink) {
        activeLink.classList.add('bg-pink-100', 'font-bold');
    }
    if (pageTitle) {
        pageTitle.textContent = title;
    }
    if (window.innerWidth < 768 && sidebar) {
        // Đóng sidebar bằng cách trượt ra (KHÔNG dùng 'hidden'/display:none,
        // vì khi đó nút hamburger gỡ '-translate-x-full' sẽ không hiện lại được sidebar)
        sidebar.classList.add('-translate-x-full');
        const sidebarOverlay = document.getElementById('sidebar-overlay');
        if (sidebarOverlay) sidebarOverlay.classList.add('hidden', 'opacity-0');
    }
    
    // Điều phối hành động tương ứng cho từng tab
    if (targetId === 'libraryContent') {
        loadAndDisplayLibrary();
    }
    if (targetId === 'statsContent') {
        loadAndDisplayStats();
    }
    if (targetId === 'myStudyRoomsContent') {
        loadAndDisplayMyStudyRooms();
    }
}

// --- QUẢN LÝ THÀNH VIÊN & AUTH STATE ---
onAuthStateChanged(auth, user => {
    if (user) {
        const displayName = user.displayName || user.email.split('@')[0];
        const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=FF69B4&color=fff`;
        // Bấm vào TÊN người dùng -> hỏi đăng xuất; bấm vào AVATAR -> sang trang thông tin cá nhân
        const goProfile = (e) => { if (e) e.stopPropagation(); window.location.href = 'features/profile/profile.html'; };
        const askLogout = (e) => { if (e) e.stopPropagation(); handleLogout(); };
        if (userName) {
            userName.textContent = displayName;
            userName.style.cursor = 'pointer';
            userName.title = 'Bấm để đăng xuất';
            userName.onclick = askLogout;
        }
        if (userAvatar) {
            userAvatar.src = avatarUrl;
            userAvatar.style.cursor = 'pointer';
            userAvatar.title = 'Thông tin cá nhân';
            userAvatar.onclick = goProfile;
        }
        if (userNameSidebar) {
            userNameSidebar.textContent = displayName;
            userNameSidebar.style.cursor = 'pointer';
            userNameSidebar.title = 'Bấm để đăng xuất';
            userNameSidebar.onclick = askLogout;
        }
        if (userAvatarSidebar) {
            userAvatarSidebar.src = avatarUrl;
            userAvatarSidebar.style.cursor = 'pointer';
            userAvatarSidebar.title = 'Thông tin cá nhân';
            userAvatarSidebar.onclick = goProfile;
        }
        if (userAvatarMobile) {
            userAvatarMobile.src = avatarUrl;
            userAvatarMobile.style.cursor = 'pointer';
            userAvatarMobile.title = 'Thông tin cá nhân';
            userAvatarMobile.onclick = goProfile;
        }
        // Phần "khung" còn lại của menu (vùng đệm quanh tên) cũng hỏi đăng xuất
        if (userMenuButton) userMenuButton.onclick = handleLogout;
    } else {
        if (userName) userName.textContent = 'Khách';
        if (userAvatar) userAvatar.src = `https://ui-avatars.com/api/?name=?&background=D8BFD8&color=fff`;
        if (userNameSidebar) userNameSidebar.textContent = 'Khách';
        if (userAvatarSidebar) userAvatarSidebar.src = `https://ui-avatars.com/api/?name=?&background=D8BFD8&color=fff`;
        if (userAvatarMobile) userAvatarMobile.src = `https://ui-avatars.com/api/?name=?&background=D8BFD8&color=fff`;
        if (userMenuButton) userMenuButton.onclick = toggleAuthModal;
    }
});

async function handleLogout() {
    const ok = await showConfirm('Bạn có muốn đăng xuất khỏi tài khoản này không?', {
        title: 'Đăng xuất',
        confirmText: 'Đăng xuất',
        cancelText: 'Ở lại',
        tone: 'danger',
        icon: 'fas fa-right-from-bracket'
    });
    if (ok) {
        await signOut(auth);
        showToast('Đã đăng xuất!', 'info');
    }
}
// Cho phép module khác (index-user-avatar.js) gọi lại đúng một luồng đăng xuất
window.handleLogout = handleLogout;

function toggleAuthModal() { 
    if (authModal) authModal.classList.toggle('hidden'); 
}

async function handleLogin() {
    const identifier = document.getElementById('emailInput').value.trim();
    const password = document.getElementById('passwordInput').value;
    if (!identifier || !password) return showToast('Vui lòng nhập đủ thông tin.', 'warning');
    let email = identifier;
    // Nhập tên người dùng thay vì email: tra Firestore lấy email tương ứng
    if (!identifier.includes('@')) {
        try {
            const snap = await getDocs(query(collection(db, 'users'), where('displayName', '==', identifier)));
            if (snap.empty) {
                return showToast('Không tìm thấy tên người dùng "' + identifier + '". Hãy thử đăng nhập bằng email.', 'error');
            }
            email = snap.docs[0].data().email;
            if (!email) {
                return showToast('Tài khoản này chưa lưu email, vui lòng đăng nhập bằng email.', 'error');
            }
        } catch (error) {
            return showToast('Không tra cứu được tên người dùng: ' + error.message, 'error');
        }
    }
    try {
        await signInWithEmailAndPassword(auth, email, password);
        toggleAuthModal();
        showToast('Đăng nhập thành công!', 'success');
    } catch (error) {
        showToast('Đăng nhập thất bại: ' + error.message, 'error');
    }
}

async function handleSignup() {
    const email = document.getElementById('emailInput').value.trim();
    const password = document.getElementById('passwordInput').value;
    if (!email || !password) return showToast('Vui lòng nhập đủ thông tin.', 'warning');
    if (!email.includes('@')) return showToast('Vui lòng nhập email hợp lệ để đăng ký.', 'warning');
    const signupCodeWrap = document.getElementById('signupCodeWrap');
    const signupCode = (document.getElementById('signupCodeInput')?.value || '').trim();
    if (!signupCode) {
        if (signupCodeWrap) signupCodeWrap.classList.remove('hidden');
        document.getElementById('signupCodeInput')?.focus();
        return showToast('Vui lòng nhập mật khẩu web để tạo tài khoản mới.', 'warning');
    }
    if (signupCode !== '111230322') {
        if (signupCodeWrap) signupCodeWrap.classList.remove('hidden');
        return showToast('Mật khẩu web không đúng. Bạn không thể tạo tài khoản mới.', 'error');
    }
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password); 
        const user = userCredential.user; 
        await setDoc(doc(db, "users", user.uid), { email: user.email, createdAt: new Date(), quizSetsCreated: 0 }); 
        showToast('Đăng ký thành công!', 'success'); 
        toggleAuthModal(); 
    } catch (error) { 
        showToast('Đăng ký thất bại: ' + error.message, 'error'); 
    } 
}

// --- QUẢN LÝ CHỌN FILE VÀ GỌI PARSER ---
async function handleFileSelect(e) {
    const file = e.target.files[0]; 
    if (!file) return;
    
    if (fileNameElem) fileNameElem.textContent = file.name; 
    const fileInfoIcon = document.getElementById('fileInfoIcon');
    if (fileInfoIcon) {
        fileInfoIcon.className = 'fas fa-file-excel text-[#FF69B4] mr-2 text-2xl';
    }
    if (questionCountInfo) questionCountInfo.textContent = 'Đang phân tích...'; 
    if (fileInfo) fileInfo.classList.remove('hidden'); 
    if (processBtn) processBtn.classList.add('hidden'); 
    if (saveBtnPreQuiz) saveBtnPreQuiz.classList.add('hidden'); 
    
    try { 
        const parsedQuestions = await parseFile(file);
        if (parsedQuestions.length === 0) { 
            if (questionCountInfo) questionCountInfo.textContent = 'Lỗi: Không tìm thấy câu hỏi.'; 
            return; 
        } 
        
        const topics = parsedQuestions.map(q => q.topic); 
        const uniqueTopics = new Set(topics); 
        
        // Cập nhật trạng thái câu hỏi cho Thư viện bộ đề
        setQuestions(parsedQuestions);
        setCurrentQuizTitle(file.name.replace(/\.(xlsx|xls|csv)$/, '')); 
        
        if (questionCountInfo) {
            questionCountInfo.textContent = `✓ Tìm thấy ${parsedQuestions.length} câu hỏi / ${uniqueTopics.size} chủ đề.`; 
        }
        if (processBtn) processBtn.classList.remove('hidden'); 
        if (saveBtnPreQuiz) {
            saveBtnPreQuiz.classList.remove('hidden'); 
            saveBtnPreQuiz.disabled = false; 
            saveBtnPreQuiz.innerHTML = '<i class="fas fa-save mr-2"></i> Lưu vào thư viện'; 
        }
    } catch (error) { 
        if (questionCountInfo) questionCountInfo.textContent = 'Lỗi! Không thể đọc file.'; 
        console.error("Lỗi phân tích file:", error); 
    } 
}

// --- QUẢN LÝ NHẬP VÀ PHÂN TÍCH JSON TRẮC NGHIỆM ---
function handleJsonInput() {
    const jsonQuizTitleInput = document.getElementById('jsonQuizTitle');
    const jsonTextInput = document.getElementById('jsonTextInput');
    const fileInfoIcon = document.getElementById('fileInfoIcon');

    if (!jsonTextInput) return;
    const jsonText = jsonTextInput.value.trim();
    if (!jsonText) {
        showToast('Vui lòng nhập đoạn văn bản JSON câu hỏi.', 'warning');
        return;
    }

    try {
        let raw = JSON.parse(jsonText);
        if (!Array.isArray(raw)) {
            raw = [raw];
        }

        const parsedQuestions = raw.map((item, idx) => {
            if (!item.question) {
                throw new Error(`Câu hỏi thứ ${idx + 1} thiếu trường "question".`);
            }

            // options hoặc answers
            const rawOptions = item.options || item.answers || [];
            if (!Array.isArray(rawOptions) || rawOptions.length === 0) {
                throw new Error(`Câu hỏi thứ ${idx + 1} phải có mảng "options" hoặc "answers".`);
            }

            // Tìm correctAnswerIndex (0-based) hoặc từ answer (1-based)
            let correctIdx = null;
            if (typeof item.correctAnswerIndex === 'number') {
                correctIdx = item.correctAnswerIndex;
            } else if (typeof item.answer === 'number') {
                correctIdx = item.answer - 1; // Chuyển từ 1-based sang 0-based
            } else if (typeof item.answer === 'string') {
                let val = item.answer.trim();
                if (/^[1-4]$/.test(val)) {
                    correctIdx = parseInt(val, 10) - 1;
                } else if (/^[a-dA-D]$/.test(val)) {
                    correctIdx = val.toUpperCase().charCodeAt(0) - 65;
                }
            }

            if (correctIdx === null || correctIdx < 0 || correctIdx >= rawOptions.length) {
                throw new Error(`Câu hỏi thứ ${idx + 1} thiếu hoặc sai chỉ mục đáp án đúng.`);
            }

            return {
                question: String(item.question),
                answers: rawOptions.map(opt => String(opt)),
                correctAnswerIndex: correctIdx,
                explanation: String(item.explanation || ''),
                topic: item.topic ? String(item.topic) : '',
                source: String(item.source || ''),
                level: String(item.level || ''),
                note: String(item.note || ''),
                expanded: String(item.expanded || ''),
                optionExplanations: Array.isArray(item.optionExplanations) ? item.optionExplanations.map(exp => String(exp || '')) : []
            };
        });

        if (parsedQuestions.length === 0) {
            showToast('Không tìm thấy câu hỏi nào trong JSON.', 'warning');
            return;
        }

        // Tạo tiêu đề bộ đề
        let title = (jsonQuizTitleInput ? jsonQuizTitleInput.value.trim() : '') || 'Bộ đề JSON';
        if (!jsonQuizTitleInput || !jsonQuizTitleInput.value.trim()) {
            const now = new Date();
            title += ` (${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()})`;
        }

        // Cập nhật trạng thái bộ đề và tiêu đề
        setQuestions(parsedQuestions);
        setCurrentQuizTitle(title);

        // Hiển thị thông tin xem trước bộ đề
        if (fileNameElem) fileNameElem.textContent = `[JSON] ${title}`;
        if (fileInfoIcon) {
            fileInfoIcon.className = 'fas fa-code text-[#FF69B4] mr-2 text-2xl';
        }
        if (questionCountInfo) {
            const uniqueTopics = new Set(parsedQuestions.map(q => q.topic));
            questionCountInfo.textContent = `✓ Tìm thấy ${parsedQuestions.length} câu hỏi / ${uniqueTopics.size} chủ đề.`;
        }

        if (fileInfo) fileInfo.classList.remove('hidden');
        if (processBtn) processBtn.classList.remove('hidden');
        if (saveBtnPreQuiz) {
            saveBtnPreQuiz.classList.remove('hidden');
            saveBtnPreQuiz.disabled = false;
            saveBtnPreQuiz.innerHTML = '<i class="fas fa-save mr-2"></i> Lưu vào thư viện';
        }

        showToast(`✓ Đã phân tích thành công ${parsedQuestions.length} câu hỏi!`, 'success');
    } catch (e) {
        showToast('Lỗi phân tích JSON: ' + e.message, 'error');
        console.error("Lỗi phân tích JSON trắc nghiệm:", e);
    }
}

// --- PHÒNG HỌC CHUNG (STUDY ROOMS) ---
async function loadAndDisplayMyStudyRooms() {
    const user = auth.currentUser;
    const myStudyRoomsListContainer = document.getElementById('my-study-rooms-list');
    if (!myStudyRoomsListContainer) return;

    // Skeleton loading thay cho dòng chữ "Đang tải..."
    myStudyRoomsListContainer.innerHTML = Array(3).fill(`
        <div class="bg-white rounded-2xl border border-pink-100 shadow-sm p-5 animate-pulse">
            <div class="flex items-center gap-3 mb-4">
                <div class="w-11 h-11 rounded-xl bg-pink-100"></div>
                <div class="flex-1 space-y-2"><div class="h-4 bg-gray-100 rounded w-2/3"></div><div class="h-3 bg-gray-100 rounded w-1/2"></div></div>
            </div>
            <div class="h-9 bg-pink-50 rounded-xl"></div>
        </div>`).join('');

    if (!user) {
        myStudyRoomsListContainer.innerHTML = `
            <div class="col-span-full flex flex-col items-center text-center py-10 gap-3">
                <img src="assets/squirrel_group.png" alt="" class="w-28 h-28 rounded-2xl shadow-md ring-4 ring-blue-100/70 bg-white">
                <p class="text-gray-600 font-semibold">Đăng nhập để xem và tạo phòng học của bạn</p>
                <a href="#" id="login-link-study-room" class="px-5 py-2.5 bg-[#FF69B4] text-white rounded-xl font-bold text-sm shadow-md hover:bg-pink-400 transition"><i class="fas fa-sign-in-alt mr-1.5"></i>Đăng nhập</a>
            </div>`;
        const loginLink = document.getElementById('login-link-study-room');
        if (loginLink) {
            loginLink.onclick = (e) => { e.preventDefault(); toggleAuthModal(); };
        }
        return;
    }

    try {
        // Sort phía client: where + orderBy khác field đòi composite index Firestore
        const q = query(collection(db, "study_rooms"), where("owner", "==", user.uid));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            myStudyRoomsListContainer.innerHTML = `
                <div class="col-span-full flex flex-col items-center text-center py-10 gap-3">
                    <img src="assets/squirrel_group.png" alt="" class="w-28 h-28 rounded-2xl shadow-md ring-4 ring-blue-100/70 bg-white">
                    <p class="text-gray-600 font-semibold">Bạn chưa có phòng học nào</p>
                    <p class="text-sm text-gray-400 -mt-2">Tạo phòng mới rồi gửi mã cho bạn bè để học cùng nhau nhé!</p>
                    <button type="button" class="create-study-room-trigger px-5 py-2.5 bg-[#FF69B4] text-white rounded-xl font-bold text-sm shadow-md hover:bg-pink-400 transition"><i class="fas fa-plus-circle mr-1.5"></i>Tạo phòng đầu tiên</button>
                </div>`;
            return;
        }

        myStudyRoomsListContainer.innerHTML = '';
        const sortedDocs = querySnapshot.docs.slice().sort((a, b) =>
            (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0));
        sortedDocs.forEach((docSnap) => {
            const roomData = docSnap.data();
            const roomId = docSnap.id;
            const createdAt = roomData.createdAt
                ? new Date(roomData.createdAt.toDate()).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                : 'N/A';
            const card = document.createElement('div');
            card.className = 'study-room-card group bg-white rounded-2xl border-2 border-pink-100 hover:border-[#FFB6C1] shadow-md hover:shadow-xl hover:shadow-pink-100/60 hover:-translate-y-1 transition-all duration-300 p-5 flex flex-col cursor-pointer';
            card.dataset.id = roomId;
            card.innerHTML = `
                <div class="flex items-start gap-3 mb-3">
                    <div class="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-300 to-[#D8BFD8] flex items-center justify-center text-white shadow shrink-0">
                        <i class="fas fa-chalkboard-user"></i>
                    </div>
                    <div class="min-w-0 flex-1">
                        <h3 class="text-base font-bold text-gray-800 truncate" title="${roomId}">${roomId}</h3>
                        <p class="text-xs text-gray-400 mt-0.5"><i class="far fa-clock mr-1"></i>${createdAt}</p>
                    </div>
                    <button type="button" data-id="${roomId}" title="Xóa phòng"
                        class="delete-study-room-btn w-8 h-8 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition shrink-0 opacity-70 group-hover:opacity-100">
                        <i class="fas fa-trash-alt text-sm"></i>
                    </button>
                </div>
                <div class="mt-auto flex gap-2">
                    <a href="features/study-room/study-room.html?id=${encodeURIComponent(roomId)}"
                        class="flex-1 text-center px-4 py-2 bg-[#FF69B4] text-white rounded-xl hover:bg-pink-400 transition text-sm font-bold shadow-sm">
                        <i class="fas fa-door-open mr-1.5"></i>Vào phòng
                    </a>
                    <button type="button" data-id="${roomId}" title="Sao chép mã phòng"
                        class="copy-room-code-btn px-3 py-2 bg-blue-50 text-blue-600 border border-blue-100 rounded-xl hover:bg-blue-100 transition text-sm font-bold">
                        <i class="far fa-copy"></i>
                    </button>
                </div>
            `;
            myStudyRoomsListContainer.appendChild(card);
        });
    } catch (e) {
        console.error("Lỗi tải phòng học của người dùng: ", e);
        myStudyRoomsListContainer.innerHTML = `
            <div class="col-span-full text-center py-8">
                <p class="text-red-500 font-semibold mb-3"><i class="fas fa-triangle-exclamation mr-1.5"></i>Lỗi tải phòng học của bạn.</p>
                <button type="button" onclick="location.reload()" class="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-200 transition"><i class="fas fa-rotate-right mr-1.5"></i>Thử lại</button>
            </div>`;
    }
}

async function deleteStudyRoom(roomIdToDelete) {
    if (!confirm(`Bạn có chắc muốn xóa phòng học "${roomIdToDelete}"? Hành động này sẽ xóa tất cả dữ liệu trong phòng và không thể hoàn tác.`)) {
        return;
    }
    try {
        const drawingsRef = collection(db, 'study_rooms', roomIdToDelete, 'drawings');
        const drawingsSnapshot = await getDocs(drawingsRef);
        const deletePromises = drawingsSnapshot.docs.map(docSnap => deleteDoc(docSnap.ref));
        await Promise.all(deletePromises);
        await deleteDoc(doc(db, "study_rooms", roomIdToDelete));
        showToast("Đã xóa phòng học thành công!", 'success');
        loadAndDisplayMyStudyRooms();
    } catch (e) {
        showToast("Xóa phòng học thất bại! Lỗi: " + e.message, 'error');
        console.error("Lỗi khi xóa phòng học: ", e);
    }
}

// --- SETUP EVENT LISTENERS ---
function setupEventListeners() {
    if (closeModalBtn) closeModalBtn.addEventListener('click', toggleAuthModal);
    if (loginBtn) loginBtn.addEventListener('click', handleLogin);
    if (signupBtn) signupBtn.addEventListener('click', handleSignup);
    if (uploadArea) uploadArea.addEventListener('click', () => fileInput.click());
    if (fileInput) fileInput.addEventListener('change', handleFileSelect);
    if (processBtn) processBtn.addEventListener('click', saveAndStartQuiz);
    if (saveBtnPreQuiz) saveBtnPreQuiz.addEventListener('click', saveOnly);
    if (selectCreateQuizBtn) selectCreateQuizBtn.addEventListener('click', () => showContent('createQuizContent', 'Tạo trắc nghiệm'));

    // Chuyển đổi tab tạo trắc nghiệm (Tải file / Nhập JSON)
    const tabUploadFile = document.getElementById('tab-upload-file');
    const tabPasteJson = document.getElementById('tab-paste-json');
    const uploadFilePane = document.getElementById('upload-file-pane');
    const pasteJsonPane = document.getElementById('paste-json-pane');
    
    if (tabUploadFile && tabPasteJson && uploadFilePane && pasteJsonPane) {
        tabUploadFile.addEventListener('click', () => {
            tabUploadFile.classList.add('border-[#FF69B4]', 'text-[#FF69B4]', 'font-bold');
            tabUploadFile.classList.remove('border-transparent', 'text-gray-500', 'font-medium');
            tabPasteJson.classList.add('border-transparent', 'text-gray-500', 'font-medium');
            tabPasteJson.classList.remove('border-[#FF69B4]', 'text-[#FF69B4]', 'font-bold');
            uploadFilePane.classList.remove('hidden');
            pasteJsonPane.classList.add('hidden');
            if (fileInfo) fileInfo.classList.add('hidden');
        });
        
        tabPasteJson.addEventListener('click', () => {
            tabPasteJson.classList.add('border-[#FF69B4]', 'text-[#FF69B4]', 'font-bold');
            tabPasteJson.classList.remove('border-transparent', 'text-gray-500', 'font-medium');
            tabUploadFile.classList.add('border-transparent', 'text-gray-500', 'font-medium');
            tabUploadFile.classList.remove('border-[#FF69B4]', 'text-[#FF69B4]', 'font-bold');
            pasteJsonPane.classList.remove('hidden');
            uploadFilePane.classList.add('hidden');
            if (fileInfo) fileInfo.classList.add('hidden');
        });
    }

    const parseJsonBtn = document.getElementById('parseJsonBtn');
    if (parseJsonBtn) {
        parseJsonBtn.addEventListener('click', handleJsonInput);
    }

    // Chế độ hiển thị thư viện
    const gridLayoutBtn = document.getElementById('library-layout-grid-btn');
    const listLayoutBtn = document.getElementById('library-layout-list-btn');
    
    if (gridLayoutBtn) {
        gridLayoutBtn.addEventListener('click', () => {
            if (getLibraryLayoutMode() !== 'grid') {
                setLibraryLayoutMode('grid');
                updateLayoutButtons();
                renderLibrary(getUserQuizSets(), getCurrentLibraryPage());
            }
        });
    }
    
    if (listLayoutBtn) {
        listLayoutBtn.addEventListener('click', () => {
            if (getLibraryLayoutMode() !== 'list') {
                setLibraryLayoutMode('list');
                updateLayoutButtons();
                renderLibrary(getUserQuizSets(), getCurrentLibraryPage());
            }
        });
    }

    updateLayoutButtons();

    // Số cột lưới tuỳ chỉnh (lưu cục bộ theo thiết bị) — bộ đề & thư mục độc lập
    const quizColsSelect = document.getElementById('quiz-grid-cols-select');
    if (quizColsSelect) {
        quizColsSelect.value = getLibraryGridCols();
        quizColsSelect.addEventListener('change', () => {
            setLibraryGridCols(quizColsSelect.value);
            renderLibrary(getUserQuizSets(), getCurrentLibraryPage());
        });
    }
    const folderColsSelect = document.getElementById('folder-grid-cols-select');
    if (folderColsSelect) {
        folderColsSelect.value = getFolderGridCols();
        folderColsSelect.addEventListener('change', () => {
            setFolderGridCols(folderColsSelect.value);
            renderLibrary(getUserQuizSets(), getCurrentLibraryPage());
        });
    }

    // Sắp xếp thư mục
    const folderSortSelect = document.getElementById('folder-sort-select');
    if (folderSortSelect) {
        folderSortSelect.value = getFolderSortMode();
        folderSortSelect.addEventListener('change', () => {
            setFolderSortMode(folderSortSelect.value);
        });
    }

    // Tìm kiếm thư mục (lọc tức thì theo tên)
    const folderSearchInput = document.getElementById('folder-search-input');
    const folderSearchClear = document.getElementById('folder-search-clear');
    if (folderSearchInput) {
        folderSearchInput.addEventListener('input', () => {
            const val = folderSearchInput.value;
            if (folderSearchClear) folderSearchClear.classList.toggle('hidden', val.trim() === '');
            setFolderSearchTerm(val);
        });
    }
    if (folderSearchClear) {
        folderSearchClear.addEventListener('click', () => {
            if (folderSearchInput) folderSearchInput.value = '';
            folderSearchClear.classList.add('hidden');
            setFolderSearchTerm('');
            if (folderSearchInput) folderSearchInput.focus();
        });
    }

    // Sắp xếp thư viện
    const librarySortSelect = document.getElementById('library-sort-select');
    if (librarySortSelect) {
        librarySortSelect.value = getLibrarySortMode();
        librarySortSelect.addEventListener('change', () => {
            setLibrarySortMode(librarySortSelect.value);
        });
    }

    // Chip lọc nhanh (Tất cả / Gần đây / Chưa làm / Đã ghim)
    const filterChips = document.querySelectorAll('.library-filter-chip');
    filterChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const mode = chip.getAttribute('data-filter') || 'all';
            filterChips.forEach(c => c.classList.toggle('is-active', c === chip));
            setLibraryFilterMode(mode);
        });
    });
    // Khôi phục bộ lọc đã lưu từ phiên trước (state đã đọc localStorage, chỉ cần đồng bộ UI chip)
    const savedFilterMode = getLibraryFilterMode();
    if (savedFilterMode !== 'all') {
        filterChips.forEach(c => c.classList.toggle('is-active', c.getAttribute('data-filter') === savedFilterMode));
    }

    // Gợi ý "còn thư mục phía sau" trên mobile: làm mờ mép của dải cuộn ngang khi còn cuộn được
    const foldersScrollEl = document.getElementById('folders-container');
    if (foldersScrollEl) {
        const updateFolderFade = () => {
            const canScroll = foldersScrollEl.scrollWidth - foldersScrollEl.clientWidth > 8;
            const atEnd = foldersScrollEl.scrollLeft + foldersScrollEl.clientWidth >= foldersScrollEl.scrollWidth - 8;
            foldersScrollEl.classList.toggle('has-overflow-right', canScroll && !atEnd);
            foldersScrollEl.classList.toggle('has-overflow-left', canScroll && foldersScrollEl.scrollLeft > 8);
        };
        foldersScrollEl.addEventListener('scroll', updateFolderFade, { passive: true });
        window.addEventListener('resize', updateFolderFade);
        // Thư mục được render lại nhiều lần → theo dõi thay đổi con để cập nhật fade
        new MutationObserver(updateFolderFade).observe(foldersScrollEl, { childList: true });
    }
    
    if (selectStudyRoomBtn) {
        selectStudyRoomBtn.addEventListener('click', (event) => {
            event.preventDefault();
            showContent('myStudyRoomsContent', 'Phòng học của tôi');
        });
    }
    if (selectGpaCalculatorBtn) {
        selectGpaCalculatorBtn.addEventListener('click', () => {
            showContent('gpaCalculatorContent', 'Tính Điểm Hệ 4');
            initGpaCalculator();
        });
    }
    if (calculateGpaBtn) calculateGpaBtn.addEventListener('click', calculateGPA);
    if (downloadTemplateBtn) downloadTemplateBtn.addEventListener('click', downloadTemplate);
    
    navLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            const targetId = link.getAttribute('data-target');
            if (targetId) {
                event.preventDefault();
                const title = link.querySelector('span').textContent;
                showContent(targetId, title);
            }
        });
    });

    // Event delegation cho Study Room
    document.body.addEventListener('click', (event) => {
        // closest: bấm trúng icon/chữ bên trong nút vẫn phải ăn
        if (event.target.closest && event.target.closest('#create-new-study-room-btn, .create-study-room-trigger')) {
            let modal = document.getElementById('createRoomIdModal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'createRoomIdModal';
                modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-2';
                modal.innerHTML = `
                    <div class="bg-white rounded-2xl shadow-2xl p-4 sm:p-8 w-full max-w-md relative">
                        <button type="button" id="closeCreateRoomIdModalBtn" class="absolute top-4 right-4 text-gray-400 hover:text-gray-700"><i class="fas fa-times text-2xl"></i></button>
                        <h2 class="text-2xl font-bold text-center mb-6 text-[#FF69B4]">Tạo phòng học mới</h2>
                        <input type="text" id="createRoomIdInput" placeholder="Nhập mã phòng (chỉ chữ/số, không dấu cách)" class="w-full px-4 py-2 border border-pink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF69B4] mb-4 transition-all duration-200">
                        <button type="button" id="saveCreateRoomIdBtn" class="w-full px-6 py-2 bg-[#FF69B4] text-white rounded-lg hover:bg-opacity-80 transition">Tạo phòng</button>
                    </div>
                `;
                document.body.appendChild(modal);
            }
            modal.classList.remove('hidden');
            const input = document.getElementById('createRoomIdInput');
            input.value = '';
            input.focus();
            document.getElementById('closeCreateRoomIdModalBtn').onclick = () => modal.classList.add('hidden');
            document.getElementById('saveCreateRoomIdBtn').onclick = async () => {
                const user = auth.currentUser;
                const newId = input.value.trim();
                if (!user) {
                    showToast('Vui lòng đăng nhập để tạo phòng!', 'warning');
                    toggleAuthModal();
                    return;
                }
                if (!newId || !/^[a-zA-Z0-9_-]+$/.test(newId)) {
                    input.classList.add('border-red-400');
                    return;
                }
                const checkDoc = await getDoc(doc(db, 'study_rooms', newId));
                if (checkDoc.exists()) {
                    showToast('ID phòng đã tồn tại, hãy chọn ID khác!', 'error');
                    input.classList.add('border-red-400');
                    return;
                }
                await setDoc(doc(db, 'study_rooms', newId), {
                    owner: user.uid,
                    createdAt: serverTimestamp(),
                    background: null
                });
                modal.classList.add('hidden');
                window.location.href = `features/study-room/study-room.html?id=${newId}`;
            };
            input.oninput = function() {
                this.classList.remove('border-red-400');
            };
            return;
        }
        
        const deleteBtn = event.target.closest && event.target.closest('.delete-study-room-btn');
        if (deleteBtn) {
            deleteStudyRoom(deleteBtn.dataset.id);
            return;
        }

        const copyBtn = event.target.closest && event.target.closest('.copy-room-code-btn');
        if (copyBtn) {
            navigator.clipboard.writeText(copyBtn.dataset.id)
                .then(() => showToast('Đã sao chép mã phòng!', 'success'))
                .catch(() => showToast('Không sao chép được, hãy copy thủ công: ' + copyBtn.dataset.id, 'warning'));
            return;
        }

        // Bấm vùng trống của thẻ phòng cũng vào phòng (trừ khi bấm nút)
        const roomCard = event.target.closest && event.target.closest('.study-room-card');
        if (roomCard && !event.target.closest('a, button')) {
            window.location.href = `features/study-room/study-room.html?id=${encodeURIComponent(roomCard.dataset.id)}`;
        }
    });

    // Event delegation cho Library & Folders
    const libraryContainer = document.getElementById('libraryContent');
    if (libraryContainer) {
        libraryContainer.addEventListener('click', (event) => {
            const target = event.target.closest('button');
            if (!target) return;
            const quizId = target.getAttribute('data-id');
            
            if (target.classList.contains('edit-quiz-btn')) {
                const currentTitle = target.getAttribute('data-title');
                editQuizSetTitle(quizId, currentTitle);
            } else if (target.classList.contains('delete-quiz-btn')) {
                deleteQuizSet(quizId);
            }
        });
    }
    
    const refreshLibraryBtn = document.getElementById('refresh-library-btn');
    if (refreshLibraryBtn) {
        refreshLibraryBtn.addEventListener('click', async () => {
            if (refreshLibraryBtn.disabled) return;
            const icon = refreshLibraryBtn.querySelector('i');
            refreshLibraryBtn.disabled = true;
            refreshLibraryBtn.classList.add('opacity-60', 'cursor-not-allowed');
            if (icon) icon.classList.add('fa-spin');
            try {
                await forceReloadLibrary(); // bỏ cache, lấy dữ liệu mới từ server
            } finally {
                if (icon) icon.classList.remove('fa-spin');
                refreshLibraryBtn.disabled = false;
                refreshLibraryBtn.classList.remove('opacity-60', 'cursor-not-allowed');
            }
        });
    }
    // Tự đồng bộ thư viện khi quay lại app (đặc biệt cho PWA trên iPad/iOS)
    initLibraryAutoSync();
    // Thùng rác giờ là trang riêng (features/quiz/trash.html) — nút "#open-trash-btn" là thẻ <a> điều hướng trực tiếp
    
    const refreshStatsBtn = document.getElementById('refresh-stats-btn');
    if (refreshStatsBtn) refreshStatsBtn.addEventListener('click', loadAndDisplayStats);

    // Danh sách "Bộ đề đã đánh dấu & ghi chú" chỉ tải khi người dùng bấm (không tự tải để trang nhẹ hơn)
    const loadMarkedQuizzesBtn = document.getElementById('load-marked-quizzes-btn');
    if (loadMarkedQuizzesBtn) {
        loadMarkedQuizzesBtn.addEventListener('click', () => {
            loadMarkedQuizzesBtn.innerHTML = '<i class="fas fa-rotate"></i> Tải lại';
            loadMarkedNotedQuizzes();
        });
    }

    // Sự kiện Folder Modal
    const createFolderBtn = document.getElementById('create-folder-btn');
    if (createFolderBtn) createFolderBtn.addEventListener('click', () => openFolderModal('create'));

    const closeFolderModalBtn = document.getElementById('closeFolderModalBtn');
    if (closeFolderModalBtn) closeFolderModalBtn.addEventListener('click', closeFolderModal);

    const saveFolderBtn = document.getElementById('saveFolderBtn');
    if (saveFolderBtn) saveFolderBtn.addEventListener('click', saveFolder);

    const closeMoveQuizModalBtn = document.getElementById('closeMoveQuizModalBtn');
    if (closeMoveQuizModalBtn) closeMoveQuizModalBtn.addEventListener('click', closeMoveQuizModal);

    const confirmMoveQuizBtn = document.getElementById('confirmMoveQuizBtn');
    if (confirmMoveQuizBtn) confirmMoveQuizBtn.addEventListener('click', confirmMoveQuiz);

    // Chọn nhiều bộ đề (Bulk operations)
    const bulkSelectToggleBtn = document.getElementById('bulk-select-toggle-btn');
    if (bulkSelectToggleBtn) {
        bulkSelectToggleBtn.addEventListener('click', () => {
            if (!getIsSelectionMode()) {
                setIsSelectionMode(true);
                setSelectedQuizIds([]);
                loadAndDisplayLibrary();
                updateBulkActionsToolbar();
            } else {
                exitSelectionMode();
            }
        });
    }

    const bulkSelectAllBtn = document.getElementById('bulk-select-all-btn');
    if (bulkSelectAllBtn) {
        bulkSelectAllBtn.addEventListener('click', () => selectAllInView());
    }

    const bulkDeselectAllBtn = document.getElementById('bulk-deselect-all-btn');
    if (bulkDeselectAllBtn) {
        bulkDeselectAllBtn.addEventListener('click', () => deselectAllInView());
    }

    const bulkCancelBtn = document.getElementById('bulk-cancel-btn');
    if (bulkCancelBtn) bulkCancelBtn.addEventListener('click', exitSelectionMode);

    // Nhấn phím Esc để thoát nhanh chế độ chọn nhiều
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && getIsSelectionMode()) {
            exitSelectionMode();
        }
    });

    const bulkMoveBtn = document.getElementById('bulk-move-btn');
    if (bulkMoveBtn) bulkMoveBtn.addEventListener('click', handleBulkMove);

    const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
    if (bulkDeleteBtn) bulkDeleteBtn.addEventListener('click', handleBulkDelete);

    const bulkShareBtn = document.getElementById('bulk-share-btn');
    if (bulkShareBtn) bulkShareBtn.addEventListener('click', handleBulkShare);

    const folderNameInput = document.getElementById('folderNameInput');
    if (folderNameInput) {
        folderNameInput.addEventListener('input', function() {
            this.classList.remove('border-red-400');
        });
    }

    // Sự kiện Folder Modal Icon & Color Pickers
    document.querySelectorAll('.icon-option').forEach(btn => {
        btn.addEventListener('click', function() {
            selectFolderIcon(this.getAttribute('data-icon') || 'fa-folder');
            const iconInput = document.getElementById('folderIconInput');
            if (iconInput) iconInput.value = '';
        });
    });

    document.querySelectorAll('.color-option').forEach(btn => {
        btn.addEventListener('click', function() {
            selectFolderColor(this.getAttribute('data-color') || 'amber');
        });
    });

    // Nhập icon FontAwesome tùy chọn (chấp nhận dán nguyên thẻ <i ...>)
    const folderIconInput = document.getElementById('folderIconInput');
    if (folderIconInput) {
        folderIconInput.addEventListener('input', function() {
            setCustomFolderIcon(this.value);
        });
    }

    // Chọn màu tùy chọn từ bảng màu
    const folderColorInput = document.getElementById('folderColorInput');
    if (folderColorInput) {
        folderColorInput.addEventListener('input', function() {
            setCustomFolderColor(this.value);
        });
    }

    // Close folder/quiz menus when clicking outside
    document.body.addEventListener('click', (e) => {
        if (e.target.closest('.quiz-menu') || e.target.closest('.folder-menu') || e.target.closest('.quiz-menu-btn') || e.target.closest('.folder-menu-btn')) return;
        document.querySelectorAll('.quiz-menu, .folder-menu').forEach(menu => menu.classList.add('hidden'));
    });

    initDragAndDropBreadcrumb();

    const closeShareQuizModalBtn = document.getElementById('closeShareQuizModalBtn');
    if (closeShareQuizModalBtn) closeShareQuizModalBtn.addEventListener('click', closeShareQuizModal);
    
    const shareQuizModal = document.getElementById('shareQuizModal');
    if (shareQuizModal) {
        shareQuizModal.addEventListener('click', (e) => {
            if (e.target === shareQuizModal) closeShareQuizModal();
        });
    }

    const copyShareLinkBtn = document.getElementById('copy-share-link-btn');
    if (copyShareLinkBtn) {
        copyShareLinkBtn.addEventListener('click', () => {
            const input = document.getElementById('share-link-input');
            if (input && input.value) {
                navigator.clipboard.writeText(input.value)
                    .then(() => showToast('Đã copy link bộ đề!', 'success'))
                    .catch(() => showToast('Không thể sao chép!', 'error'));
            }
        });
    }

    const copyShareEmbedBtn = document.getElementById('copy-share-embed-btn');
    if (copyShareEmbedBtn) {
        copyShareEmbedBtn.addEventListener('click', () => {
            const input = document.getElementById('share-embed-input');
            if (input && input.value) {
                navigator.clipboard.writeText(input.value)
                    .then(() => showToast('Đã copy mã nhúng!', 'success'))
                    .catch(() => showToast('Không thể sao chép!', 'error'));
            }
        });
    }

    // Gắn sự kiện tìm kiếm
    const librarySearchInput = document.getElementById('library-search-input');
    if (librarySearchInput) {
        librarySearchInput.addEventListener('input', handleLibrarySearch);

        // Nút xóa nhanh từ khóa (×) — chỉ hiện khi có chữ
        const librarySearchClear = document.getElementById('library-search-clear');
        const updateSearchClear = () => {
            if (librarySearchClear) librarySearchClear.classList.toggle('hidden', librarySearchInput.value.trim() === '');
        };
        librarySearchInput.addEventListener('input', updateSearchClear);
        if (librarySearchClear) {
            librarySearchClear.addEventListener('click', () => {
                librarySearchInput.value = '';
                librarySearchInput.dispatchEvent(new Event('input')); // chạy lại handleLibrarySearch + ẩn nút ×
                librarySearchInput.focus();
            });
        }
        // Esc trong ô tìm kiếm: có chữ thì xóa, trống thì bỏ focus
        librarySearchInput.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            if (librarySearchInput.value) {
                librarySearchInput.value = '';
                librarySearchInput.dispatchEvent(new Event('input'));
            } else {
                librarySearchInput.blur();
            }
        });
        // Phím "/" focus nhanh ô tìm kiếm khi đang mở tab Thư viện (và không gõ ở ô khác)
        document.addEventListener('keydown', (e) => {
            if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
            const ae = document.activeElement;
            if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable)) return;
            const libraryPanel = document.getElementById('libraryContent');
            if (!libraryPanel || libraryPanel.classList.contains('hidden')) return;
            e.preventDefault();
            // Ô tìm kiếm giờ luôn hiện; nếu panel đang bị tự ẩn khi cuộn thì hiện lại cho dễ thấy
            document.getElementById('library-panel')?.classList.remove('lib-panel-hidden');
            librarySearchInput.focus();
        });

        const searchModeQuiz = document.getElementById('search-mode-quiz');
        const searchModeQuestion = document.getElementById('search-mode-question');
        if (searchModeQuiz) searchModeQuiz.addEventListener('change', handleLibrarySearch);
        if (searchModeQuestion) searchModeQuestion.addEventListener('change', handleLibrarySearch);

        // Segmented Control Mobile
        const modeQuizBtn = document.getElementById('search-mode-quiz-btn');
        const modeQuestionBtn = document.getElementById('search-mode-question-btn');
        
        if (modeQuizBtn && modeQuestionBtn) {
            // Chỉ bật/tắt các class trạng thái, giữ nguyên class bố cục để không làm vỡ giao diện
            const setSegmentActive = (btn, active) => {
                if (active) {
                    btn.classList.add('bg-white', 'text-pink-600', 'shadow-sm');
                    btn.classList.remove('text-gray-500', 'hover:text-gray-700');
                } else {
                    btn.classList.remove('bg-white', 'text-pink-600', 'shadow-sm');
                    btn.classList.add('text-gray-500', 'hover:text-gray-700');
                }
            };
            const updateSegmentedUI = (activeMode) => {
                const isQuiz = activeMode === 'quiz';
                setSegmentActive(modeQuizBtn, isQuiz);
                setSegmentActive(modeQuestionBtn, !isQuiz);
                librarySearchInput.placeholder = isQuiz ? 'Tìm kiếm bộ đề...' : 'Tìm kiếm câu hỏi...';
            };

            modeQuizBtn.addEventListener('click', () => {
                if (searchModeQuiz) {
                    searchModeQuiz.checked = true;
                    searchModeQuiz.dispatchEvent(new Event('change'));
                    updateSegmentedUI('quiz');
                    localStorage.setItem('librarySearchMode', 'quiz');
                }
            });
            modeQuestionBtn.addEventListener('click', () => {
                if (searchModeQuestion) {
                    searchModeQuestion.checked = true;
                    searchModeQuestion.dispatchEvent(new Event('change'));
                    updateSegmentedUI('question');
                    localStorage.setItem('librarySearchMode', 'question');
                }
            });

            // Khôi phục chế độ tìm (bộ đề / câu hỏi) đã chọn ở phiên trước
            if (localStorage.getItem('librarySearchMode') === 'question' && searchModeQuestion) {
                searchModeQuestion.checked = true;
                updateSegmentedUI('question');
            }
        }
    }
}

// --- KHỞI CHẠY ỨNG DỤNG ---
document.addEventListener('DOMContentLoaded', () => {
    // Tự động chuyển tab nếu URL có hash (#libraryContent)
    const hash = window.location.hash.replace('#', '');
    if (hash) {
        const navLink = document.querySelector(`.nav-link[data-target="${hash}"]`);
        if (navLink) navLink.click();
    }
    
    setupEventListeners();
    initDashboardUI();
});