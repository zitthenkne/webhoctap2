// quiz.js
import { db } from '../../core/firebase-init.js';
import { doc, getDoc, setDoc, onSnapshot, collection, addDoc, query, where, getDocs, serverTimestamp, orderBy, limit } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { showToast } from '../../core/utils.js';

export function initQuiz(params) {
    // --- Destructuring parameters ---
    const {
        roomId, user, loadingOverlay,
        startCollaborativeQuizBtn, collaborativeQuizModal, closeCollaborativeQuizModalBtn,
        quizUploadArea, quizFileInput, quizFileInfo, quizFileNameSpan, quizQuestionCountInfo,
        startQuizCollaborationBtn, collaborativeQuizDisplay, collaborativeQuizProgressFill,
        currentQuestionText, quizOptionsArea, prevQuestionBtn, nextQuestionBtn,
        questionCounter, finishQuizCollaborationBtn, downloadQuizTemplateBtn, libraryQuizBtn
    } = params;

    // --- Quiz Collaboration State ---
    let currentQuizData = null;
    let currentQuestionIndex = 0;
    let isHost = false;
    let isLibraryQuizMode = false;
    let libraryQuizAnswerState = {};

    // BIẾN MỚI: Dùng để xác định người dùng có phải là chủ phòng không
    let isCurrentUserRoomOwner = false;

    // --- Core Quiz Functions ---
    async function parseQuizFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    const questions = [];
                    for (let i = 1; i < json.length; i++) {
                        const row = json[i];
                        if (!row || row.length === 0 || !String(row[0] || '').trim()) continue;
                        const questionText = String(row[0]).trim();
                        const options = [];
                        for (let j = 1; j < 5; j++) {
                            if(String(row[j] || '').trim()) options.push(String(row[j]).trim());
                        }
                        // Đáp án đúng là số 1,2,3,4 ở cột F (giữ nguyên, không trừ đi 1)
                        let answer = null;
                        if (row[5] !== undefined && row[5] !== null && row[5] !== '') {
                            const ansNum = parseInt(row[5]);
                            if (!isNaN(ansNum) && ansNum >= 1 && ansNum <= 4) answer = ansNum;
                        }
                        const explain = String(row[6] || '').trim();
                        if (options.length > 0) {
                            questions.push({ question: questionText, options, answer, explain });
                        }
                    }
                    resolve(questions);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = (error) => reject(error);
            reader.readAsArrayBuffer(file);
        });
    }

    function renderQuizQuestion() {
        if (!currentQuizData || !currentQuizData.questions || currentQuizData.questions.length === 0) return;
        const totalQuestions = currentQuizData.questions.length;
        const currentQ = currentQuizData.questions[currentQuestionIndex];
        currentQuestionText.textContent = `${currentQuestionIndex + 1}. ${currentQ.question}`;
        quizOptionsArea.innerHTML = '';
        // Đảm bảo options luôn là mảng
        if (!Array.isArray(currentQ.options)) currentQ.options = [];
        // Render đáp án
        currentQ.options.forEach((option, idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'quiz-option-btn px-4 py-2 bg-white border border-pink-200 rounded-lg shadow hover:bg-pink-50 transition flex items-center gap-2 w-full text-left';
            btn.textContent = String.fromCharCode(65 + idx) + '. ' + option; // Hiển thị A, B, C, D
            // Hiệu ứng khi được chọn (host hoặc chế độ thư viện)
            if ((isHost && currentQ.selected === idx) || (isLibraryQuizMode && currentQ.selected === idx)) {
                btn.classList.add('bg-green-200', 'border-green-500', 'text-green-800');
            }
            // Chế độ làm đề trong thư viện: cho chọn đáp án, hiện đúng/sai
            if (isLibraryQuizMode) {
                if (typeof currentQ.selected === 'number') {
                    if (currentQ.selected === idx && currentQ.answer === (idx + 1)) {
                        btn.classList.add('bg-green-200', 'border-green-500', 'text-green-800');
                    } else if (currentQ.selected === idx && currentQ.answer !== (idx + 1)) {
                        btn.classList.add('bg-red-200', 'border-red-500', 'text-red-800');
                    } else if (currentQ.answer === (idx + 1)) {
                        btn.classList.add('bg-green-100', 'border-green-300');
                    }
                    btn.disabled = true;
                } else {
                    btn.addEventListener('click', () => {
                        currentQ.selected = idx;
                        renderQuizQuestion();
                    });
                }
            } else if (isHost) {
                // Chế độ chủ phòng chọn đáp án
                btn.disabled = false;
                btn.addEventListener('click', () => {
                    currentQ.selected = idx;
                    renderQuizQuestion();
                });
            } else {
                btn.disabled = true;
                btn.classList.add('opacity-60', 'cursor-not-allowed');
            }
            quizOptionsArea.appendChild(btn);
        });
        // Hiện giải thích nếu đã chọn đáp án ở chế độ thư viện hoặc là host
        let explainDiv = document.getElementById('quiz-explain-area');
        if (!explainDiv) {
            explainDiv = document.createElement('div');
            explainDiv.id = 'quiz-explain-area';
            quizOptionsArea.parentNode.appendChild(explainDiv);
        }
        if (isLibraryQuizMode && typeof currentQ.selected === 'number' && currentQ.explain) {
            explainDiv.innerHTML = `<div class='mt-4 p-3 rounded bg-blue-50 border-l-4 border-blue-400 text-blue-700'><b>Giải thích:</b> ${currentQ.explain}</div>`;
        } else {
            explainDiv.innerHTML = `<label class="block mt-4 mb-1 text-sm text-gray-600">Giải thích của bạn (tùy chọn):</label><textarea id="quiz-explain-input" class="w-full p-2 border border-pink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-200" rows="2" placeholder="Nhập giải thích..." ${isHost ? '' : 'disabled style=\"background:#f3f3f3;opacity:0.7;cursor:not-allowed\"'}></textarea>`;
            const explainInput = document.getElementById('quiz-explain-input');
            explainInput.value = currentQ.userExplain || '';
            if (isHost) {
                explainInput.addEventListener('input', (e) => {
                    currentQ.userExplain = e.target.value;
                });
            }
        }
        // Cập nhật thanh progress và các nút
        prevQuestionBtn.disabled = currentQuestionIndex === 0;
        nextQuestionBtn.disabled = currentQuestionIndex >= totalQuestions - 1;
        // Hiển thị nút Hoàn thành cho Host hoặc khi đang làm bài từ thư viện
        if (isHost || isLibraryQuizMode) {
            finishQuizCollaborationBtn.classList.remove('hidden');
            // Đổi tên nút cho phù hợp ngữ cảnh
            finishQuizCollaborationBtn.textContent = isLibraryQuizMode ? 'Nộp bài và xem kết quả' : 'Lưu vào thư viện';
        } else {
            finishQuizCollaborationBtn.classList.add('hidden');
        }
        // ... (phần còn lại của logic nút)
    }

    function listenToQuizSessionChanges() {
        // ... (Giữ nguyên toàn bộ hàm listenToQuizSessionChanges)
        const quizSessionRef = doc(db, 'study_rooms', roomId, 'quizSession', 'current');
        return onSnapshot(quizSessionRef, (docSnapshot) => {
            if (docSnapshot.exists() && docSnapshot.data().questions && docSnapshot.data().questions.length > 0) {
                const quizSessionData = docSnapshot.data();
                currentQuizData = quizSessionData;
                currentQuestionIndex = quizSessionData.currentQuestionIndex || 0;
                isHost = (user && user.uid === quizSessionData.hostId);
                isLibraryQuizMode = false; // Luôn là chế độ cộng tác khi có session

                collaborativeQuizModal.classList.remove('hidden');
                quizUploadArea.classList.add('hidden');
                collaborativeQuizDisplay.classList.remove('hidden');
                
                renderQuizQuestion();
            } else {
                // Reset to initial state if session ends
                currentQuizData = null;
                isHost = false;
                collaborativeQuizDisplay.classList.add('hidden');
                quizUploadArea.classList.remove('hidden');
                quizFileInfo.classList.add('hidden');
                startQuizCollaborationBtn.disabled = true;
            }
        });
    }
    
    // --- Library Quiz Functions ---
    function createLibraryQuizModal() {
        // ... (Giữ nguyên toàn bộ hàm createLibraryQuizModal)
    }

    async function checkRoomOwner() {
        if (user && roomId) {
            try {
                const roomDocRef = doc(db, 'study_rooms', roomId);
                const roomDocSnap = await getDoc(roomDocRef);
                if (roomDocSnap.exists() && roomDocSnap.data().owner === user.uid) {
                    isCurrentUserRoomOwner = true;
                }
            } catch (error) {
                console.error("Lỗi khi kiểm tra chủ phòng:", error);
            }
        }
    }

    async function startPublicLibrarySession(quizId) {
        loadingOverlay.classList.remove('hidden');
        collaborativeQuizModal.classList.add('hidden'); // Đóng modal lại

        try {
            const quizDocRef = doc(db, 'quiz_sets', quizId);
            const quizDocSnap = await getDoc(quizDocRef);

            if (!quizDocSnap.exists()) {
                showToast('Không tìm thấy bộ đề này.', 'error');
                return;
            }
            const quizData = quizDocSnap.data();

            const sessionData = {
                questions: quizData.questions,
                currentQuestionIndex: 0,
                quizTitle: quizData.title,
                hostId: user.uid,
                hostName: user.displayName || user.email.split('@')[0] || 'Chủ phòng',
                startedAt: serverTimestamp()
            };

            const quizSessionRef = doc(db, 'study_rooms', roomId, 'quizSession', 'current');
            await setDoc(quizSessionRef, sessionData);

        } catch (error) {
            console.error("Lỗi bắt đầu phiên học công khai từ thư viện:", error);
            showToast('Đã có lỗi xảy ra. Vui lòng thử lại.', 'error');
        } finally {
            loadingOverlay.classList.add('hidden');
        }
    }

    function showLibraryQuizModal() {
        collaborativeQuizModal.classList.remove('hidden');
        quizUploadArea.classList.add('hidden');
        collaborativeQuizDisplay.classList.add('hidden');
        // Hiển thị danh sách bài test trong thư viện cá nhân
        let libraryListDiv = document.getElementById('library-quiz-list');
        if (!libraryListDiv) {
            libraryListDiv = document.createElement('div');
            libraryListDiv.id = 'library-quiz-list';
            libraryListDiv.className = 'mt-4';
            collaborativeQuizModal.querySelector('.bg-white').appendChild(libraryListDiv);
        }
        libraryListDiv.innerHTML = '<div class="text-gray-500">Đang tải thư viện...</div>';
        // Lấy danh sách quiz_sets của user
        getDocs(query(collection(db, 'quiz_sets'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'), limit(20)))
            .then(snapshot => {
                if (snapshot.empty) {
                    libraryListDiv.innerHTML = '<div class="text-gray-500">Chưa có bài test nào trong thư viện.</div>';
                    return;
                }
                let html = '<div class="mb-2 font-semibold text-pink-600">Chọn bài test để làm:</div>';
                snapshot.forEach(docSnap => {
                    const data = docSnap.data();
                    html += `<button class="w-full text-left px-4 py-2 mb-2 bg-pink-50 border border-pink-200 rounded-lg hover:bg-pink-100 transition" data-quiz-id="${docSnap.id}">${data.title || 'Bài test'} (${data.questionCount || 0} câu)</button>`;
                });
                libraryListDiv.innerHTML = html;
                // Gán sự kiện chọn bài test với logic phân luồng mới
                libraryListDiv.querySelectorAll('button[data-quiz-id]').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const quizId = btn.getAttribute('data-quiz-id');

                        // KIỂM TRA: Người dùng có phải là chủ phòng không?
                        if (isCurrentUserRoomOwner) {
                            // NẾU LÀ CHỦ PHÒNG: Bắt đầu phiên học chung
                            if (confirm(`Bạn là chủ phòng. Bạn có muốn bắt đầu buổi học chung với bộ đề này cho tất cả mọi người không?`)) {
                                await startPublicLibrarySession(quizId);
                            }
                        } else {
                            // NẾU LÀ THÀNH VIÊN: Bắt đầu phiên học riêng tư như cũ
                            const quizDoc = await getDocs(query(collection(db, 'quiz_sets'), where('__name__', '==', quizId)));
                            if (!quizDoc.empty) {
                                const quizData = quizDoc.docs[0].data();
                                isLibraryQuizMode = true;
                                currentQuizData = {
                                    ...quizData,
                                    questions: quizData.questions.map(q => ({ ...q, selected: null, userExplain: '' }))
                                };
                                currentQuestionIndex = 0;
                                libraryQuizAnswerState = {};
                                libraryListDiv.innerHTML = '';
                                collaborativeQuizDisplay.classList.remove('hidden');
                                // Ẩn modal chính đi
                                collaborativeQuizModal.classList.add('hidden');
                                renderQuizQuestion();
                            }
                        }
                    });
                });
            });
    }

    async function loadLibraryQuizList() {
        // ... (Giữ nguyên toàn bộ hàm loadLibraryQuizList)
    }
    
    async function selectLibraryQuiz(docId, data) {
        // ... (Giữ nguyên toàn bộ hàm selectLibraryQuiz)
        isLibraryQuizMode = true;
        libraryQuizAnswerState = {}; // Reset state
        // ...
        renderQuizQuestion();
    }

    async function loadLibraryForCollaboration(container) {
        if (!user) {
            container.innerHTML = '<p class="text-sm text-red-500">Bạn cần đăng nhập để sử dụng tính năng này.</p>';
            return;
        }
        container.innerHTML = '<p class="text-sm text-gray-500">Đang tải thư viện của bạn...</p>';

        try {
            const q = query(collection(db, 'quiz_sets'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'), limit(50));
            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                container.innerHTML = '<p class="text-sm text-gray-500">Thư viện của bạn trống.</p>';
                return;
            }

            let html = '<div class="space-y-2 max-h-48 overflow-y-auto">';
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                html += `
                    <button class="w-full text-left px-3 py-2 bg-pink-50 border border-pink-200 rounded-lg hover:bg-pink-100 transition text-sm truncate" data-quiz-id="${docSnap.id}" title="${data.title}">
                        ${data.title || 'Bài test không tên'} (${data.questionCount || 0} câu)
                    </button>
                `;
            });
            html += '</div>';
            container.innerHTML = html;

            // Gán sự kiện cho từng nút để bắt đầu phiên làm bài chung
            container.querySelectorAll('button[data-quiz-id]').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const quizId = e.currentTarget.getAttribute('data-quiz-id');
                    if (confirm(`Bạn có chắc muốn bắt đầu buổi học chung với bộ đề này không?`)) {
                        await startCollaborativeQuizFromLibrary(quizId);
                    }
                });
            });

        } catch (error) {
            console.error("Lỗi tải thư viện cho buổi học chung:", error);
            container.innerHTML = '<p class="text-sm text-red-500">Không thể tải thư viện.</p>';
        }
    }

    async function startCollaborativeQuizFromLibrary(quizId) {
        loadingOverlay.classList.remove('hidden');
        collaborativeQuizModal.classList.add('hidden');

        try {
            // Lấy dữ liệu của bộ đề được chọn từ collection 'quiz_sets'
            const quizDocRef = doc(db, 'quiz_sets', quizId);
            const quizDocSnap = await getDoc(quizDocRef);

            if (!quizDocSnap.exists()) {
                showToast('Không tìm thấy bộ đề này.', 'error');
                return;
            }

            const quizData = quizDocSnap.data();

            // Chuẩn bị dữ liệu để ghi vào session chung
            const sessionData = {
                questions: quizData.questions,
                currentQuestionIndex: 0,
                quizTitle: quizData.title,
                hostId: user.uid,
                hostName: user.displayName || user.email.split('@')[0] || 'Chủ phòng',
                startedAt: serverTimestamp()
            };

            // Ghi dữ liệu vào quizSession để mọi người cùng thấy
            const quizSessionRef = doc(db, 'study_rooms', roomId, 'quizSession', 'current');
            await setDoc(quizSessionRef, sessionData);

            // onSnapshot sẽ tự động xử lý việc hiển thị giao diện cho mọi người

        } catch (error) {
            console.error("Lỗi bắt đầu phiên học từ thư viện:", error);
            showToast('Đã có lỗi xảy ra. Vui lòng thử lại.', 'error');
        } finally {
            loadingOverlay.classList.add('hidden');
        }
    }

    // --- Event Listeners ---
    startCollaborativeQuizBtn.addEventListener('click', () => {
        // Reset giao diện modal về trạng thái tải file ban đầu
        collaborativeQuizModal.classList.remove('hidden');
        quizUploadArea.classList.remove('hidden');
        collaborativeQuizDisplay.classList.add('hidden');
        quizFileInfo.classList.add('hidden');
        startQuizCollaborationBtn.disabled = true;
        quizFileInput.value = '';

        // DÒNG MÃ MỚI - Dọn dẹp danh sách thư viện nếu nó tồn tại
        const libraryListDiv = document.getElementById('library-quiz-list');
        if (libraryListDiv) {
            libraryListDiv.innerHTML = ''; // Xóa nội dung bên trong
            libraryListDiv.remove();      // Xóa chính phần tử đó khỏi DOM
        }
    });

    closeCollaborativeQuizModalBtn.addEventListener('click', () => {
        collaborativeQuizModal.classList.add('hidden');
    });

    quizUploadArea.addEventListener('click', () => quizFileInput.click());

    quizFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        quizFileNameSpan.textContent = file.name;
        quizFileInfo.classList.remove('hidden');
        startQuizCollaborationBtn.disabled = true;
        try {
            const questions = await parseQuizFile(file);
            if(questions.length === 0) {
                showToast('Không tìm thấy câu hỏi hợp lệ trong file.', 'warning');
                return;
            }
            quizQuestionCountInfo.textContent = `Tìm thấy ${questions.length} câu hỏi.`;
            currentQuizData = {
                // Gán luôn phần giải thích từ file excel vào userExplain để có thể chỉnh sửa và lưu lại
                questions: questions.map(q => ({ ...q, userExplain: q.explain || '' })),
                currentQuestionIndex: 0,
                quizTitle: file.name.replace(/\.(xlsx|xls)$/, '')
            };
            startQuizCollaborationBtn.disabled = false;
        } catch (error) {
            console.error(error);
            showToast('Lỗi khi đọc file. Vui lòng kiểm tra định dạng.', 'error');
            quizFileInfo.classList.add('hidden');
        }
    });

    startQuizCollaborationBtn.addEventListener('click', async () => {
        // ... (Giữ nguyên logic của nút Start)
        if (!currentQuizData) return;
        const sessionData = {
            ...currentQuizData,
            hostId: user.uid,
            hostName: user.displayName || 'Chủ phòng',
            startedAt: serverTimestamp()
        };
        const quizSessionRef = doc(db, 'study_rooms', roomId, 'quizSession', 'current');
        await setDoc(quizSessionRef, sessionData);
    });

    nextQuestionBtn.addEventListener('click', async () => { /* ... */ });
    prevQuestionBtn.addEventListener('click', async () => { /* ... */ });
    finishQuizCollaborationBtn.addEventListener('click', async () => {
        // PHÂN LUỒNG LOGIC: LÀM BÀI THƯ VIỆN vs LÀM BÀI NHÓM (HOST)
        
        if (isLibraryQuizMode) {
            // --- LOGIC MỚI: NỘP BÀI VÀ XEM KẾT QUẢ ---
            const unanswered = currentQuizData.questions.filter(q => q.selected === null || q.selected === undefined).length;
            if (unanswered > 0) {
                if (!confirm(`Bạn còn ${unanswered} câu chưa trả lời. Bạn có chắc muốn nộp bài không?`)) {
                    return;
                }
            } else {
                 if (!confirm(`Bạn có chắc muốn nộp bài không?`)) {
                    return;
                }
            }
            displayLibraryQuizResults();

        } else if (isHost) {
            // --- LOGIC CŨ: HOST LƯU BÀI VÀO THƯ VIỆN ---
            const unansweredQuestionsCount = currentQuizData.questions.filter(
                q => q.selected === null || q.selected === undefined
            ).length;

            let confirmationMessage = 'Bạn có chắc muốn hoàn thành và lưu bộ đề này vào thư viện không?';
            if (unansweredQuestionsCount > 0) {
                confirmationMessage = `Có ${unansweredQuestionsCount} câu hỏi chưa được chọn đáp án. Bạn vẫn muốn lưu bộ đề chưa hoàn chỉnh này chứ?`;
            }

            if (!confirm(confirmationMessage)) {
                return; 
            }

            loadingOverlay.classList.remove('hidden'); 

            try {
                // --- BƯỚC 2: CHUẨN BỊ DỮ LIỆU ĐỂ LƯU ---
                const quizToSave = {
                    userId: user.uid,
                    title: currentQuizData.quizTitle || `Quiz_${Date.now()}`,
                    questionCount: currentQuizData.questions.length,
                    questions: currentQuizData.questions.map(q => ({
                        question: q.question,
                        options: q.options,
                        answer: (q.selected !== null && q.selected !== undefined) ? (q.selected + 1) : null,
                        explain: q.userExplain || ''
                    })),
                    createdAt: serverTimestamp(),
                    isPublic: true,
                    folderId: null
                };

                // --- BƯỚC 3: LƯU VÀ DỌN DẸP ---
                await addDoc(collection(db, 'quiz_sets'), quizToSave);
                showToast('Đã tạo và lưu bài test mới vào thư viện!', 'success');

                // Xóa session làm bài trong phòng học để người khác không thấy nữa
                const quizSessionRef = doc(db, 'study_rooms', roomId, 'quizSession', 'current');
                await setDoc(quizSessionRef, { questions: [] }); 

                // Reset giao diện về trạng thái ban đầu
                collaborativeQuizDisplay.classList.add('hidden');
                collaborativeQuizModal.classList.add('hidden');
                quizUploadArea.classList.remove('hidden');
                quizFileInfo.classList.add('hidden');
                startQuizCollaborationBtn.disabled = true;
                currentQuizData = null;

            } catch (err) {
                console.error("Lỗi khi lưu vào thư viện: ", err);
                showToast('Lỗi khi lưu vào thư viện. Vui lòng thử lại.', 'error');
            } finally {
                loadingOverlay.classList.add('hidden'); // Luôn ẩn loading khi xong
            }
        }
    });
    downloadQuizTemplateBtn.addEventListener('click', () => { /* ... */ });
    libraryQuizBtn.addEventListener('click', showLibraryQuizModal);

    // Bắt đầu lắng nghe
    const unsubscribe = listenToQuizSessionChanges();

    // GỌI HÀM KIỂM TRA CHỦ PHÒNG
    checkRoomOwner();

    return unsubscribe;
}