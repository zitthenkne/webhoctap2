// quiz.js — chế độ "Cùng nhau đánh đề" trong phòng học (features/study-room)
// Host (người bắt đầu phiên) điều khiển: chọn câu, đánh dấu đáp án đúng, ghi giải thích.
// Thành viên theo dõi realtime qua Firestore study_rooms/{roomId}/quizSession/current.
import { db } from '../../core/firebase-init.js';
import { doc, getDoc, setDoc, updateDoc, addDoc, collection, query, where, getDocs, serverTimestamp, onSnapshot, limit } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { showToast } from '../../core/utils.js';
import { parseMarkdown, renderMath } from './quiz-helpers.js';

export function initQuiz(params) {
    const {
        roomId, user, loadingOverlay,
        startCollaborativeQuizBtn, collaborativeQuizModal, closeCollaborativeQuizModalBtn,
        quizUploadArea, quizFileInput, quizFileInfo, quizFileNameSpan, quizQuestionCountInfo,
        startQuizCollaborationBtn, collaborativeQuizDisplay, collaborativeQuizProgressFill,
        currentQuestionText, quizOptionsArea, prevQuestionBtn, nextQuestionBtn,
        questionCounter, finishQuizCollaborationBtn, downloadQuizTemplateBtn, libraryQuizBtn
    } = params;

    const sessionTitleEl = document.getElementById('quiz-session-title');
    const sessionHostEl = document.getElementById('quiz-session-host');
    const explainArea = document.getElementById('quiz-explain-area');
    const uploadDropZone = document.getElementById('upload-quiz-file-area');
    const libraryListDiv = document.getElementById('library-quiz-list');

    let currentQuizData = null;
    let currentQuestionIndex = 0;
    let isHost = false;
    let isRoomOwner = false;

    const sessionRef = () => doc(db, 'study_rooms', roomId, 'quizSession', 'current');
    // Bộ đề có thể theo 2 quy ước field (footgun toàn dự án): answers/correctAnswerIndex
    // (0-based, chuẩn trang quiz) hoặc options/answer (1-based, file Excel).
    const optsOf = (q) => Array.isArray(q.answers) ? q.answers : (Array.isArray(q.options) ? q.options : []);
    // Đáp án gốc từ file/thư viện (không tính lựa chọn của host)
    const refIdxOf = (q) => {
        if (typeof q.correctAnswerIndex === 'number') return q.correctAnswerIndex;
        if (typeof q.answer === 'number') return q.answer - 1;               // Excel 1-based
        return null;
    };
    const correctIdxOf = (q) => {
        if (typeof q.selected === 'number') return q.selected;               // host đánh dấu trong phiên
        return refIdxOf(q);
    };
    // Chế độ đáp án được chọn ở bước nhập đề: self (tự đánh) | reference (hiện đáp án gốc)
    const getAnswerMode = () => {
        const checked = document.querySelector('input[name="quiz-answer-mode"]:checked');
        return checked ? checked.value : 'self';
    };

    // --- Đọc file Excel: cột A câu hỏi, B-E đáp án, F số đáp án đúng (1-4), G giải thích ---
    async function parseQuizFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
                    const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
                    const questions = [];
                    for (let i = 1; i < json.length; i++) {
                        const row = json[i];
                        if (!row || !String(row[0] || '').trim()) continue;
                        const options = [];
                        for (let j = 1; j < 5; j++) {
                            if (String(row[j] || '').trim()) options.push(String(row[j]).trim());
                        }
                        let answer = null;
                        const ansNum = parseInt(row[5]);
                        if (!isNaN(ansNum) && ansNum >= 1 && ansNum <= options.length) answer = ansNum;
                        if (options.length > 0) {
                            questions.push({ question: String(row[0]).trim(), options, answer, explain: String(row[6] || '').trim() });
                        }
                    }
                    resolve(questions);
                } catch (err) { reject(err); }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    // --- Render màn làm bài chung ---
    function renderQuizQuestion() {
        if (!currentQuizData || !currentQuizData.questions || currentQuizData.questions.length === 0) return;
        const totalQuestions = currentQuizData.questions.length;
        if (currentQuestionIndex > totalQuestions - 1) currentQuestionIndex = totalQuestions - 1;
        const currentQ = currentQuizData.questions[currentQuestionIndex];
        const options = optsOf(currentQ);

        if (sessionTitleEl) sessionTitleEl.textContent = currentQuizData.quizTitle || 'Đề trắc nghiệm';
        if (sessionHostEl) {
            const modeLabel = currentQuizData.answerMode === 'reference' ? ' · Chế độ tham khảo đáp án gốc' : ' · Chế độ tự đánh';
            sessionHostEl.textContent = (isHost
                ? 'Bạn là chủ xị — chọn đáp án và điều khiển câu hỏi'
                : `Chủ xị: ${currentQuizData.hostName || 'Ẩn danh'} đang điều khiển`) + modeLabel;
        }
        questionCounter.textContent = `Câu ${currentQuestionIndex + 1} / ${totalQuestions}`;
        collaborativeQuizProgressFill.style.width = `${((currentQuestionIndex + 1) / totalQuestions) * 100}%`;
        // Render markdown như trang quiz.html (đậm/nghiêng/bảng/danh sách/LaTeX/Mermaid)
        currentQuestionText.innerHTML = parseMarkdown(currentQ.question);
        renderMath(currentQuestionText);

        const isRefMode = currentQuizData.answerMode === 'reference';
        const refIdx = isRefMode ? refIdxOf(currentQ) : null;

        quizOptionsArea.innerHTML = '';
        options.forEach((option, idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            const isSelected = currentQ.selected === idx;
            const isRefCorrect = isRefMode && refIdx === idx;
            const isWrongPick = isRefMode && isSelected && refIdx !== null && refIdx !== idx;

            let tone;
            if (isWrongPick) {
                tone = 'bg-red-50 border-red-400 text-red-700 font-semibold';
            } else if (isRefCorrect) {
                tone = 'bg-green-50 border-green-400 text-green-800 font-semibold shadow-sm' +
                    (isSelected ? ' ring-2 ring-green-300' : '');
            } else if (isSelected) {
                tone = 'bg-green-50 border-green-400 text-green-800 font-semibold shadow-sm';
            } else {
                tone = 'bg-white border-pink-100 text-gray-700 hover:border-[#FFB6C1] hover:bg-pink-50/60';
            }
            btn.className = 'flex items-start gap-3 w-full text-left px-4 sm:px-5 py-3.5 rounded-xl border-2 transition text-[15px] sm:text-base ' +
                tone + (isHost ? ' cursor-pointer' : ' cursor-default');

            const letter = document.createElement('span');
            const letterTone = isWrongPick ? 'bg-red-400 text-white'
                : (isRefCorrect || isSelected) ? 'bg-green-400 text-white'
                : 'bg-pink-50 text-[#FF69B4]';
            letter.className = 'shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-extrabold ' + letterTone;
            letter.textContent = String.fromCharCode(65 + idx);
            const text = document.createElement('span');
            text.className = 'leading-relaxed min-w-0 flex-1';
            text.innerHTML = parseMarkdown(option);
            btn.append(letter, text);
            if (isRefCorrect) {
                const check = document.createElement('i');
                check.className = 'fas fa-circle-check text-green-500 ml-auto shrink-0 self-center';
                btn.appendChild(check);
            }

            if (isHost) {
                btn.addEventListener('click', () => {
                    currentQ.selected = (currentQ.selected === idx) ? null : idx; // bấm lại để bỏ chọn
                    renderQuizQuestion();
                    syncSession({ questions: currentQuizData.questions });
                });
            } else {
                btn.disabled = true;
            }
            quizOptionsArea.appendChild(btn);
        });
        renderMath(quizOptionsArea);

        // Giải thích: host soạn (đồng bộ cho cả phòng), thành viên xem
        if (explainArea) {
            explainArea.innerHTML = '';
            if (isHost) {
                const label = document.createElement('label');
                label.className = 'block mt-4 mb-1 text-xs font-bold text-gray-500 uppercase tracking-wide';
                label.textContent = 'Giải thích (cả phòng cùng thấy)';
                const ta = document.createElement('textarea');
                ta.id = 'quiz-explain-input';
                ta.rows = 2;
                ta.placeholder = 'Nhập giải thích cho câu này...';
                ta.className = 'w-full p-3 border border-pink-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-200 text-sm bg-white';
                ta.value = currentQ.userExplain || currentQ.explain || currentQ.explanation || '';
                ta.addEventListener('input', () => { currentQ.userExplain = ta.value; });
                ta.addEventListener('change', () => syncSession({ questions: currentQuizData.questions }));
                explainArea.append(label, ta);
            } else {
                const explain = currentQ.userExplain || currentQ.explain || currentQ.explanation || '';
                if (explain) {
                    const box = document.createElement('div');
                    box.className = 'mt-4 p-4 rounded-xl bg-blue-50 border-l-4 border-blue-400 text-blue-800 text-sm sm:text-base leading-relaxed';
                    box.innerHTML = '<b>Giải thích: </b>' + parseMarkdown(explain);
                    renderMath(box);
                    explainArea.appendChild(box);
                }
            }
        }

        prevQuestionBtn.disabled = !isHost || currentQuestionIndex === 0;
        nextQuestionBtn.disabled = !isHost || currentQuestionIndex >= totalQuestions - 1;
        // Lưu LUÔN tạo bộ đề mới (không đè đề gốc); từ lần 2 chỉ cập nhật bộ mới đó
        finishQuizCollaborationBtn.classList.toggle('hidden', !isHost);
        finishQuizCollaborationBtn.innerHTML = currentQuizData.savedQuizId
            ? '<i class="fas fa-floppy-disk"></i> Cập nhật bộ đã lưu'
            : '<i class="fas fa-check"></i> Lưu bộ đề mới';
    }

    async function syncSession(patch) {
        try {
            await updateDoc(sessionRef(), patch);
        } catch (err) {
            console.error('Lỗi đồng bộ phiên đánh đề:', err);
            showToast('Không đồng bộ được, kiểm tra kết nối mạng.', 'error');
        }
    }

    function listenToQuizSessionChanges() {
        return onSnapshot(sessionRef(), (snap) => {
            const fromSelf = snap.metadata.hasPendingWrites; // echo của chính mình -> đã render optimistic rồi
            if (snap.exists() && snap.data().questions && snap.data().questions.length > 0) {
                const data = snap.data();
                currentQuizData = data;
                currentQuestionIndex = data.currentQuestionIndex || 0;
                isHost = (user && user.uid === data.hostId);
                if (fromSelf) return;
                collaborativeQuizModal.classList.remove('hidden');
                quizUploadArea.classList.add('hidden');
                collaborativeQuizDisplay.classList.remove('hidden');
                renderQuizQuestion();
            } else {
                currentQuizData = null;
                currentQuestionIndex = 0;
                isHost = false;
                collaborativeQuizDisplay.classList.add('hidden');
                quizUploadArea.classList.remove('hidden');
                quizFileInfo.classList.add('hidden');
                startQuizCollaborationBtn.disabled = true;
            }
        });
    }

    async function checkRoomOwner() {
        if (!user || !roomId) return;
        try {
            const snap = await getDoc(doc(db, 'study_rooms', roomId));
            isRoomOwner = snap.exists() && snap.data().owner === user.uid;
        } catch (err) {
            console.error('Lỗi kiểm tra chủ phòng:', err);
        }
    }

    // --- Nhập đề: file Excel ---
    async function handleQuizFile(file) {
        if (!file) return;
        quizFileNameSpan.textContent = file.name;
        quizFileInfo.classList.remove('hidden');
        quizQuestionCountInfo.textContent = 'Đang đọc...';
        startQuizCollaborationBtn.disabled = true;
        try {
            const questions = await parseQuizFile(file);
            if (questions.length === 0) {
                quizQuestionCountInfo.textContent = 'Không có câu hỏi hợp lệ';
                showToast('Không tìm thấy câu hỏi hợp lệ trong file.', 'warning');
                return;
            }
            quizQuestionCountInfo.textContent = `· ${questions.length} câu hỏi`;
            currentQuizData = {
                questions: questions.map(q => ({ ...q, userExplain: q.explain || '' })),
                currentQuestionIndex: 0,
                quizTitle: file.name.replace(/\.(xlsx|xls)$/i, '')
            };
            startQuizCollaborationBtn.disabled = false;
        } catch (err) {
            console.error(err);
            showToast('Lỗi khi đọc file. Vui lòng kiểm tra định dạng.', 'error');
            quizFileInfo.classList.add('hidden');
        }
    }

    // --- Nhập đề: chọn từ thư viện cá nhân ---
    async function toggleLibraryList() {
        if (!libraryListDiv) return;
        if (libraryListDiv.childElementCount > 0) { libraryListDiv.innerHTML = ''; return; }
        if (!user) {
            showToast('Vui lòng đăng nhập để dùng thư viện.', 'warning');
            return;
        }
        libraryListDiv.innerHTML = '<p class="text-sm text-gray-400 py-2"><i class="fas fa-spinner fa-spin mr-2"></i>Đang tải thư viện của bạn...</p>';
        try {
            // Sort phía client để khỏi cần composite index
            const snap = await getDocs(query(collection(db, 'quiz_sets'), where('userId', '==', user.uid), limit(50)));
            libraryListDiv.innerHTML = '';
            if (snap.empty) {
                libraryListDiv.innerHTML = '<p class="text-sm text-gray-400 py-2">Thư viện của bạn đang trống.</p>';
                return;
            }
            const head = document.createElement('p');
            head.className = 'text-xs font-bold text-gray-500 uppercase tracking-wide mb-2';
            head.textContent = isRoomOwner ? 'Chọn đề để cả phòng cùng làm' : 'Bạn không phải chủ phòng — đề sẽ mở ở tab mới để làm riêng';
            libraryListDiv.appendChild(head);
            const wrap = document.createElement('div');
            wrap.className = 'space-y-2 max-h-56 overflow-y-auto pr-1';
            libraryListDiv.appendChild(wrap);
            const docs = snap.docs.slice().sort((a, b) =>
                (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0));
            docs.forEach(docSnap => {
                const data = docSnap.data();
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'w-full flex items-center gap-3 text-left px-4 py-2.5 bg-white border border-pink-100 rounded-xl hover:border-[#FFB6C1] hover:bg-pink-50/60 transition';
                const icon = document.createElement('span');
                icon.className = 'shrink-0 w-8 h-8 rounded-lg bg-pink-50 text-[#FF69B4] flex items-center justify-center text-xs';
                icon.innerHTML = '<i class="fas fa-file-alt"></i>';
                const title = document.createElement('span');
                title.className = 'flex-1 min-w-0 truncate text-sm font-semibold text-gray-700';
                title.textContent = data.title || 'Bài test không tên';
                const count = document.createElement('span');
                count.className = 'shrink-0 text-xs font-bold text-gray-400 tabular-nums';
                count.textContent = `${data.questionCount || (data.questions || []).length} câu`;
                btn.append(icon, title, count);
                btn.addEventListener('click', async () => {
                    if (isRoomOwner) {
                        if (confirm(`Bắt đầu buổi đánh đề chung với "${data.title || 'đề này'}" cho cả phòng?`)) {
                            await startSessionFromLibrary(docSnap.id);
                        }
                    } else {
                        window.open(`../quiz/quiz.html?id=${docSnap.id}`, '_blank');
                    }
                });
                wrap.appendChild(btn);
            });
        } catch (err) {
            console.error('Lỗi tải thư viện:', err);
            libraryListDiv.innerHTML = '<p class="text-sm text-red-500 py-2">Không thể tải thư viện.</p>';
        }
    }

    async function startSessionFromLibrary(quizId) {
        loadingOverlay.classList.remove('hidden');
        try {
            const quizSnap = await getDoc(doc(db, 'quiz_sets', quizId));
            if (!quizSnap.exists()) {
                showToast('Không tìm thấy bộ đề này.', 'error');
                return;
            }
            const quizData = quizSnap.data();
            await setDoc(sessionRef(), {
                questions: quizData.questions,
                currentQuestionIndex: 0,
                quizTitle: quizData.title || 'Đề trắc nghiệm',
                answerMode: getAnswerMode(),
                hostId: user.uid,
                hostName: user.displayName || (user.email ? user.email.split('@')[0] : 'Chủ phòng'),
                fromLibrary: true,
                startedAt: serverTimestamp()
            });
            // onSnapshot sẽ tự chuyển giao diện cho mọi người
        } catch (err) {
            console.error('Lỗi bắt đầu phiên từ thư viện:', err);
            showToast('Đã có lỗi xảy ra. Vui lòng thử lại.', 'error');
        } finally {
            loadingOverlay.classList.add('hidden');
        }
    }

    // --- Event listeners ---
    function isSessionActive() {
        return !!(currentQuizData && currentQuizData.hostId && currentQuizData.questions && currentQuizData.questions.length);
    }

    startCollaborativeQuizBtn.addEventListener('click', () => {
        collaborativeQuizModal.classList.remove('hidden');
        if (isSessionActive()) {
            quizUploadArea.classList.add('hidden');
            collaborativeQuizDisplay.classList.remove('hidden');
            renderQuizQuestion();
        } else {
            quizUploadArea.classList.remove('hidden');
            collaborativeQuizDisplay.classList.add('hidden');
            quizFileInfo.classList.add('hidden');
            startQuizCollaborationBtn.disabled = true;
            quizFileInput.value = '';
            if (libraryListDiv) libraryListDiv.innerHTML = '';
        }
    });

    closeCollaborativeQuizModalBtn.addEventListener('click', () => {
        collaborativeQuizModal.classList.add('hidden');
    });

    if (uploadDropZone) {
        uploadDropZone.addEventListener('click', () => quizFileInput.click());
        uploadDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadDropZone.classList.add('bg-pink-50', 'border-[#FF69B4]');
        });
        uploadDropZone.addEventListener('dragleave', () => {
            uploadDropZone.classList.remove('bg-pink-50', 'border-[#FF69B4]');
        });
        uploadDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadDropZone.classList.remove('bg-pink-50', 'border-[#FF69B4]');
            handleQuizFile(e.dataTransfer.files[0]);
        });
    }

    quizFileInput.addEventListener('change', (e) => handleQuizFile(e.target.files[0]));

    startQuizCollaborationBtn.addEventListener('click', async () => {
        if (!currentQuizData || !roomId) return;
        loadingOverlay.classList.remove('hidden');
        try {
            await setDoc(sessionRef(), {
                ...currentQuizData,
                answerMode: getAnswerMode(),
                hostId: user ? user.uid : null,
                hostName: user ? (user.displayName || (user.email ? user.email.split('@')[0] : 'Chủ xị')) : 'Ẩn danh',
                startedAt: serverTimestamp()
            });
            showToast('Đã bắt đầu phiên đánh đề cho cả phòng!', 'success');
        } catch (err) {
            console.error(err);
            showToast('Lỗi khi bắt đầu phiên. Thử lại nhé.', 'error');
        } finally {
            loadingOverlay.classList.add('hidden');
        }
    });

    prevQuestionBtn.addEventListener('click', () => {
        if (!isHost || currentQuestionIndex <= 0) return;
        currentQuestionIndex--;
        renderQuizQuestion();
        syncSession({ currentQuestionIndex });
    });

    nextQuestionBtn.addEventListener('click', () => {
        if (!isHost || !currentQuizData || currentQuestionIndex >= currentQuizData.questions.length - 1) return;
        currentQuestionIndex++;
        renderQuizQuestion();
        syncSession({ currentQuestionIndex });
    });

    finishQuizCollaborationBtn.addEventListener('click', async () => {
        if (!currentQuizData || !isHost) return;
        if (!user || user.isAnonymous) {
            showToast('Vui lòng đăng nhập để lưu đề vào thư viện.', 'warning');
            return;
        }
        const isUpdate = !!currentQuizData.savedQuizId;
        const unanswered = currentQuizData.questions.filter(q => correctIdxOf(q) === null).length;
        const msg = unanswered > 0
            ? `Còn ${unanswered} câu chưa đánh dấu đáp án đúng. Vẫn lưu chứ?`
            : (isUpdate ? 'Cập nhật bộ đề đã lưu với nội dung hiện tại?' : 'Lưu thành bộ đề MỚI trong thư viện của bạn? (đề gốc không bị thay đổi)');
        if (!confirm(msg)) return;

        loadingOverlay.classList.remove('hidden');
        try {
            // Lưu theo quy ước answers/correctAnswerIndex (0-based) — format trang quiz.html đọc được
            const payload = {
                questionCount: currentQuizData.questions.length,
                questions: currentQuizData.questions.map(q => ({
                    question: q.question,
                    answers: optsOf(q),
                    correctAnswerIndex: correctIdxOf(q),
                    explanation: q.userExplain || q.explain || q.explanation || ''
                })),
                updatedAt: serverTimestamp()
            };
            if (isUpdate) {
                // Đã lưu 1 lần rồi -> mọi thay đổi sau chỉ ghi đè lên BỘ MỚI đó
                await updateDoc(doc(db, 'quiz_sets', currentQuizData.savedQuizId), payload);
                showToast('Đã cập nhật bộ đề đã lưu!', 'success');
            } else {
                // Lần đầu: TẠO BỘ MỚI, tuyệt đối không đè lên đề gốc trong thư viện
                const baseTitle = currentQuizData.quizTitle || 'Đề từ phòng học';
                const newRef = await addDoc(collection(db, 'quiz_sets'), {
                    ...payload,
                    userId: user.uid,
                    title: currentQuizData.fromLibrary ? `${baseTitle} (đánh đề chung)` : baseTitle,
                    createdAt: serverTimestamp(),
                    isPublic: true,
                    folderId: null
                });
                currentQuizData.savedQuizId = newRef.id;
                syncSession({ savedQuizId: newRef.id }); // cả phòng biết đã có bộ mới
                showToast('Đã lưu thành bộ đề mới trong thư viện!', 'success');
                renderQuizQuestion(); // đổi nhãn nút thành "Cập nhật bộ đã lưu"
            }
            // Phiên vẫn tiếp tục — hỏi có muốn kết thúc luôn không
            if (confirm('Kết thúc phiên đánh đề cho cả phòng luôn không?')) {
                await setDoc(sessionRef(), { questions: [] });
                collaborativeQuizModal.classList.add('hidden');
            }
        } catch (err) {
            console.error('Lỗi lưu vào thư viện:', err);
            showToast('Lỗi khi lưu vào thư viện. Thử lại nhé.', 'error');
        } finally {
            loadingOverlay.classList.add('hidden');
        }
    });

    downloadQuizTemplateBtn.addEventListener('click', () => {
        const link = document.createElement('a');
        link.href = '../../assets/quiz-template.xlsx';
        link.download = 'quiz-template.xlsx';
        link.click();
    });

    libraryQuizBtn.addEventListener('click', toggleLibraryList);

    const unsubscribe = listenToQuizSessionChanges();
    checkRoomOwner();
    return unsubscribe;
}
