// study-room-main.js
import { db, auth } from '../../core/firebase-init.js';
import { doc, setDoc, onSnapshot, collection, addDoc, query, orderBy, serverTimestamp, deleteDoc, limit } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import { showToast } from '../../core/utils.js';

// IMPORT CÁC MODULES CON
import { initWhiteboard } from './whiteboard.js';
import { initQuiz } from './quiz.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- Lấy tất cả các DOM Elements ở một nơi ---
    const dom = {
        // General
        loadingOverlay: document.getElementById('loading-overlay'),
        roomIdDisplay: document.getElementById('room-id-display'),
        shareBtn: document.getElementById('share-room-btn'),
        // Chat & Members
        memberList: document.getElementById('member-list'),
        chatMessages: document.getElementById('chat-messages'),
        chatForm: document.getElementById('chat-form'),
        chatInput: document.getElementById('chat-input'),
        roomNoticeArea: document.getElementById('room-notice-area'),
        // Whiteboard
        canvas: document.getElementById('whiteboard'),
        toolBtns: document.querySelectorAll('.tool-btn'),
        colorPicker: document.getElementById('color-picker'),
        lineWidth: document.getElementById('line-width'),
        clearCanvasBtn: document.getElementById('clear-canvas-btn'),
        undoBtn: document.getElementById('undo-btn'),
        redoBtn: document.getElementById('redo-btn'),
        uploadImageObjectBtn: document.getElementById('upload-image-object-btn'),
        imageObjectFileInput: document.getElementById('image-object-file-input'),
        // Collaborative Quiz
        startCollaborativeQuizBtn: document.getElementById('start-collaborative-quiz-btn'),
        collaborativeQuizModal: document.getElementById('collaborative-quiz-modal'),
        closeCollaborativeQuizModalBtn: document.getElementById('close-collaborative-quiz-modal-btn'),
        quizUploadArea: document.getElementById('quiz-upload-area'),
        quizFileInput: document.getElementById('quizFileInput'),
        quizFileInfo: document.getElementById('quizFileInfo'),
        quizFileNameSpan: document.getElementById('quizFileName'),
        quizQuestionCountInfo: document.getElementById('quiz-question-count-info'),
        startQuizCollaborationBtn: document.getElementById('start-quiz-collaboration-btn'),
        collaborativeQuizDisplay: document.getElementById('collaborative-quiz-display'),
        collaborativeQuizProgressFill: document.getElementById('collaborative-quiz-progress-fill'),
        currentQuestionText: document.getElementById('current-question-text'),
        quizOptionsArea: document.getElementById('quiz-options-area'),
        prevQuestionBtn: document.getElementById('prev-question-btn'),
        nextQuestionBtn: document.getElementById('next-question-btn'),
        questionCounter: document.getElementById('question-counter'),
        finishQuizCollaborationBtn: document.getElementById('finish-quiz-collaboration-btn'),
        downloadQuizTemplateBtn: document.getElementById('download-quiz-template-btn'),
        libraryQuizBtn: document.getElementById('library-quiz-btn'),
    };
    dom.ctx = dom.canvas ? dom.canvas.getContext('2d') : null;

    // --- State Management ---
    let roomId = null;
    let user = null;
    let unsubscribeFunctions = []; // Mảng để lưu các hàm huỷ lắng nghe

    // --- Member & Chat Management ---
    function listenToMembers() {
        const membersRef = collection(db, 'study_rooms', roomId, 'members');
        const unsubscribe = onSnapshot(membersRef, (snapshot) => {
            dom.memberList.innerHTML = '';
            snapshot.forEach(doc => {
                const data = doc.data();
                const li = document.createElement('li');
                li.className = 'flex items-center gap-2 p-2 rounded bg-pink-50 text-sm';
                li.innerHTML = `<i class="fas fa-user-circle text-[#FF69B4]"></i> <span>${data.displayName || 'Khách'}</span>`;
                dom.memberList.appendChild(li);
            });
            dom.roomNoticeArea.textContent = `Online: ${snapshot.size} thành viên.`;
        });
        unsubscribeFunctions.push(unsubscribe);
    }

    async function joinRoomAsMember() {
        if (!user || !roomId) return;
        const memberRef = doc(db, 'study_rooms', roomId, 'members', user.uid);
        await setDoc(memberRef, {
            uid: user.uid,
            displayName: user.displayName || user.email || `Khách_${user.uid.substring(0, 5)}`,
            joinedAt: serverTimestamp()
        });
        await addDoc(collection(db, 'study_rooms', roomId, 'messages'), {
            type: 'notice', text: `${user.displayName || 'Khách'} đã vào phòng.`, createdAt: serverTimestamp()
        });
    }

    async function leaveRoom() {
        if (!user || !roomId) return;
        // Hủy tất cả các listener
        unsubscribeFunctions.forEach(unsub => unsub());
        unsubscribeFunctions = [];
        
        const memberRef = doc(db, 'study_rooms', roomId, 'members', user.uid);
        await deleteDoc(memberRef);
        
        await addDoc(collection(db, 'study_rooms', roomId, 'messages'), {
            type: 'notice', text: `${user.displayName || 'Khách'} đã rời phòng.`, createdAt: serverTimestamp()
        });
    }

    function listenToChat() {
        const chatRef = collection(db, 'study_rooms', roomId, 'messages');
        const q = query(chatRef, orderBy('createdAt', 'desc'), limit(50));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            dom.chatMessages.innerHTML = '';
            const messages = [];
            snapshot.forEach(doc => messages.push(doc.data()));
            messages.reverse().forEach(data => {
                const div = document.createElement('div');
                if (data.type === 'notice') {
                    div.className = 'text-center text-xs text-gray-400 my-2 italic';
                    div.textContent = data.text;
                } else {
                    const isMe = data.uid === user?.uid;
                    div.className = `flex flex-col mb-2 ${isMe ? 'items-end' : 'items-start'}`;
                    div.innerHTML = `
                        <div class="text-xs text-gray-500 ${isMe ? 'mr-2' : 'ml-2'}">${data.displayName || 'Khách'}</div>
                        <div class="max-w-xs p-2 rounded-lg ${isMe ? 'bg-[#FFB6C1] text-black' : 'bg-gray-200'}">
                           ${data.text}
                        </div>`;
                }
                dom.chatMessages.appendChild(div);
            });
            dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
        });
        unsubscribeFunctions.push(unsubscribe);
    }
    
    // --- Room Initialization ---
    async function initRoom() {
        dom.loadingOverlay.classList.remove('hidden');
        try {
            const urlParams = new URLSearchParams(window.location.search);
            roomId = urlParams.get('id');

            if (!roomId) {
                alert("Mã phòng không hợp lệ!");
                window.location.href = '../../index.html';
                return;
            }
            
            dom.roomIdDisplay.textContent = `ID: ${roomId}`;
            await joinRoomAsMember();
            
            // Lắng nghe các sự kiện của phòng
            listenToMembers();
            listenToChat();
            
            // KHỞI TẠO CÁC MODULES CON VÀ TRUYỀN THAM SỐ
            const whiteboardUnsub = initWhiteboard({ ...dom, roomId, user });
            const quizUnsub = initQuiz({ ...dom, roomId, user });
            unsubscribeFunctions.push(whiteboardUnsub, quizUnsub);
            
        } catch (err) {
            console.error('Lỗi khi khởi tạo phòng:', err);
            showToast('Lỗi khi tải phòng học.', 'error');
        } finally {
            dom.loadingOverlay.classList.add('hidden');
        }
    }

    // --- Main Execution Flow ---
    onAuthStateChanged(auth, async (authenticatedUser) => {
        if (authenticatedUser) {
            user = authenticatedUser;
            await initRoom();
        } else {
            await signInAnonymously(auth).catch((error) => {
                console.error("Lỗi đăng nhập ẩn danh:", error);
                showToast('Lỗi xác thực. Vui lòng tải lại trang.', 'error');
            });
        }
    });

    // --- Event Listeners chung ---
    window.addEventListener('beforeunload', leaveRoom);

    dom.chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = dom.chatInput.value.trim();
        if (!text || !user || !roomId) return;
        dom.chatInput.value = '';
        try {
            await addDoc(collection(db, 'study_rooms', roomId, 'messages'), {
                type: 'chat', text, uid: user.uid,
                displayName: user.displayName || 'Khách',
                createdAt: serverTimestamp()
            });
        } catch (err) {
            showToast('Không gửi được tin nhắn.', 'error');
            dom.chatInput.value = text; // Trả lại tin nhắn nếu gửi lỗi
        }
    });
    
    dom.shareBtn.addEventListener('click', () => {
        const roomUrl = window.location.href;
        navigator.clipboard.writeText(roomUrl).then(() => {
            showToast('Đã sao chép link phòng!', 'success');
        }).catch(() => {
            showToast('Sao chép thất bại.', 'error');
        });
    });
});