// --- Imports ---
// Kết hợp các import từ cả hai file và loại bỏ trùng lặp
import { db, auth, storage } from '../../core/firebase-init.js';
import { doc, getDoc, setDoc, onSnapshot, collection, addDoc, query, where, orderBy, serverTimestamp, deleteDoc, getDocs, updateDoc, writeBatch, limit } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-storage.js";
import { showToast } from '../../core/utils.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements (Hợp nhất từ cả hai file) ---
    // Chat & Members
    const memberList = document.getElementById('member-list');
    const chatMessages = document.getElementById('chat-messages');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const roomNoticeArea = document.getElementById('room-notice-area');
    const inviteMemberBtn = document.getElementById('invite-member-btn'); // Nút mời trong khu vực chat

    // Whiteboard
    const canvas = document.getElementById('whiteboard');
    const ctx = canvas ? canvas.getContext('2d') : null;
    const roomIdDisplay = document.getElementById('room-id-display');
    const shareBtn = document.getElementById('share-room-btn'); // Nút chia sẻ ở thanh công cụ whiteboard
    const colorPicker = document.getElementById('color-picker');
    const lineWidth = document.getElementById('line-width');
    const clearCanvasBtn = document.getElementById('clear-canvas-btn');
    const toolBtns = document.querySelectorAll('.tool-btn');
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    const loadingOverlay = document.getElementById('loading-overlay');
    const uploadImageObjectBtn = document.getElementById('upload-image-object-btn');
    const imageObjectFileInput = document.getElementById('image-object-file-input');

    // Collaborative Quiz
    const startCollaborativeQuizBtn = document.getElementById('start-collaborative-quiz-btn');
    const collaborativeQuizModal = document.getElementById('collaborative-quiz-modal');
    const closeCollaborativeQuizModalBtn = document.getElementById('close-collaborative-quiz-modal-btn');
    const quizUploadArea = document.getElementById('quiz-upload-area');
    const quizFileInput = document.getElementById('quizFileInput');
    const quizFileInfo = document.getElementById('quizFileInfo');
    const quizFileNameSpan = document.getElementById('quizFileName');
    const quizQuestionCountInfo = document.getElementById('quiz-question-count-info');
    const uploadQuizFileArea = document.getElementById('upload-quiz-file-area');
    const startQuizCollaborationBtn = document.getElementById('start-quiz-collaboration-btn');
    const collaborativeQuizDisplay = document.getElementById('collaborative-quiz-display');
    const collaborativeQuizProgressFill = document.getElementById('collaborative-quiz-progress-fill');
    const currentQuestionText = document.getElementById('current-question-text');
    const quizOptionsArea = document.getElementById('quiz-options-area');
    const prevQuestionBtn = document.getElementById('prev-question-btn');
    const nextQuestionBtn = document.getElementById('next-question-btn');
    const questionCounter = document.getElementById('question-counter');
    const finishQuizCollaborationBtn = document.getElementById('finish-quiz-collaboration-btn');

    // Nút tải file mẫu quiz
    const downloadQuizTemplateBtn = document.getElementById('download-quiz-template-btn');
    if (downloadQuizTemplateBtn) {
        downloadQuizTemplateBtn.addEventListener('click', () => {
            const link = document.createElement('a');
            link.href = 'assets/quiz-template.xlsx';
            link.download = 'quiz-template.xlsx';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    // --- State Management (Hợp nhất từ cả hai file) ---
    let roomId = null;
    let user = null; // Biến user toàn cục để dễ truy cập
    let roomUnsubscribe = null;
    let memberUnsubscribe = null; // Listener cho member
    let chatUnsubscribe = null; // Listener cho chat

    // Whiteboard state
    let isDrawing = false;
    let isDragging = false;
    let currentTool = 'pen';
    let canvasObjects = [];
    let currentPath = [];
    let selectedObject = null;
    let dragOffsetX, dragOffsetY;
    let startX, startY;
    let history = [];
    let historyIndex = -1;
    let currentBackgroundUrl = null;
    const backgroundImage = new Image();
    backgroundImage.crossOrigin = "anonymous";
    // NEW: tool options
    let toolOptions = {
        pen: { color: '#000000', width: 2, dashed: false },
        highlight: { color: '#ffff0066', width: 12, dashed: false },
        line: { color: '#000000', width: 2, dashed: false },
        rectangle: { color: '#000000', width: 2, dashed: false, fill: false },
        circle: { color: '#000000', width: 2, dashed: false, fill: false },
        eraser: { width: 16 }
    };
    let currentDashed = false;
    let currentFill = false;

    // Quiz Collaboration State
    let currentQuizData = null;
    let currentQuestionIndex = 0;
    let isHost = false;
    let quizSessionUnsubscribe = null;

    // NEW: Member & Chat Management (Từ file thứ hai) ---

    function listenToMembers() {
        if (memberUnsubscribe) memberUnsubscribe();
        const membersRef = collection(db, 'study_rooms', roomId, 'members');
        memberUnsubscribe = onSnapshot(membersRef, (snapshot) => {
            if (!memberList) return;
            memberList.innerHTML = '';
            let memberCount = 0;
            snapshot.forEach(doc => {
                memberCount++;
                const data = doc.data();
                const li = document.createElement('li');
                li.className = 'flex items-center gap-2 p-2 rounded bg-pink-50 text-sm';
                li.innerHTML = `<i class="fas fa-user-circle text-[#FF69B4]"></i> <span>${data.displayName || 'Khách'}</span>`;
                memberList.appendChild(li);
            });
            if (roomNoticeArea) {
                roomNoticeArea.textContent = `Đang online: ${memberCount} thành viên.`;
            }
        });
    }

    async function joinRoomAsMember() {
        if (!user || !roomId) return;
        const memberRef = doc(db, 'study_rooms', roomId, 'members', user.uid);
        await setDoc(memberRef, {
            uid: user.uid,
            displayName: user.displayName || user.email || `Khách_${user.uid.substring(0, 5)}`,
            joinedAt: serverTimestamp()
        });
        // Thông báo vào phòng
        await addDoc(collection(db, 'study_rooms', roomId, 'messages'), {
            type: 'notice',
            text: `${user.displayName || user.email || 'Khách'} đã vào phòng.`,
            createdAt: serverTimestamp()
        });
    }

    async function leaveRoomAsMember() {
        if (!user || !roomId) return;
        const memberRef = doc(db, 'study_rooms', roomId, 'members', user.uid);
        // Thông báo rời phòng TRƯỚC khi xóa để đảm bảo tin nhắn được gửi
        await addDoc(collection(db, 'study_rooms', roomId, 'messages'), {
            type: 'notice',
            text: `${user.displayName || user.email || 'Khách'} đã rời phòng.`,
            createdAt: serverTimestamp()
        });
        await deleteDoc(memberRef);
    }

    function listenToChat() {
        if (chatUnsubscribe) chatUnsubscribe();
        const chatRef = collection(db, 'study_rooms', roomId, 'messages');
        const q = query(chatRef, orderBy('createdAt'));
        chatUnsubscribe = onSnapshot(q, (snapshot) => {
            if (!chatMessages) return;
            chatMessages.innerHTML = '';
            snapshot.forEach(doc => {
                const data = doc.data();
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
                chatMessages.appendChild(div);
            });
            chatMessages.scrollTop = chatMessages.scrollHeight;
        });
    }
    
    // --- Whiteboard & Quiz Logic (Từ file đầu tiên - cao cấp hơn) ---
    // (Toàn bộ các hàm từ `getEventCoords` đến `finishQuizCollaborationBtn` event listener được giữ lại y nguyên từ file đầu tiên của bạn)
    // --- Helper to get coordinates for mouse and touch events ---
    function getEventCoords(e) {
        let x, y;
        const rect = canvas.getBoundingClientRect();
        if (e.touches && e.touches.length > 0) {
            x = e.touches[0].clientX - rect.left;
            y = e.touches[0].clientY - rect.top;
        } else if (e.changedTouches && e.changedTouches.length > 0) {
            x = e.changedTouches[0].clientX - rect.left;
            y = e.changedTouches[0].clientY - rect.top;
        } else {
            x = e.offsetX;
            y = e.offsetY;
        }
        return { x, y };
    }
    // --- Canvas Setup ---
    function resizeCanvas() {
        if (!canvas) return;
        const container = document.getElementById('canvas-container');
        const dpr = window.devicePixelRatio || 1;
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
        redrawCanvas();
    }

    // --- Drawing & Redrawing ---
    function redrawCanvas() {
        if (!ctx) return;
        const logicalWidth = canvas.width / (window.devicePixelRatio || 1);
        const logicalHeight = canvas.height / (window.devicePixelRatio || 1);
        ctx.clearRect(0, 0, logicalWidth, logicalHeight);
        if (backgroundImage.src && backgroundImage.complete) {
            ctx.drawImage(backgroundImage, 0, 0, logicalWidth, logicalHeight);
        }
        canvasObjects.forEach(obj => drawObject(obj));
        if (selectedObject) {
            drawSelectionBox(selectedObject);
        }
    }

    function drawObject(obj) {
        if (!ctx) return;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = obj.tool === 'highlight' ? 0.4 : 1;
        ctx.globalCompositeOperation = (obj.tool === 'eraser') ? 'destination-out' : 'source-over';
        ctx.strokeStyle = obj.color;
        ctx.lineWidth = obj.width;
        ctx.setLineDash(obj.dashed ? [8, 8] : []);
        ctx.beginPath();
        switch (obj.type) {
            case 'stroke':
                if (obj.path.length === 0) break;
                ctx.moveTo(obj.path[0].x, obj.path[0].y);
                for (let i = 1; i < obj.path.length; i++) {
                    ctx.lineTo(obj.path[i].x, obj.path[i].y);
                }
                break;
            case 'image':
                if (obj.imgElement && obj.imgElement.complete) {
                    ctx.drawImage(obj.imgElement, obj.x, obj.y, obj.width, obj.height);
                }
                break;
            case 'line':
                ctx.moveTo(obj.startX, obj.startY);
                ctx.lineTo(obj.endX, obj.endY);
                break;
            case 'rectangle':
                if (obj.fill) {
                    ctx.fillStyle = obj.color;
                    ctx.globalAlpha = obj.tool === 'highlight' ? 0.3 : 1;
                    ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
                }
                ctx.rect(obj.x, obj.y, obj.width, obj.height);
                break;
            case 'circle':
                ctx.arc(obj.x + obj.radius, obj.y + obj.radius, obj.radius, 0, 2 * Math.PI);
                if (obj.fill) {
                    ctx.fillStyle = obj.color;
                    ctx.globalAlpha = obj.tool === 'highlight' ? 0.3 : 1;
                    ctx.fill();
                }
                break;
        }
        if (obj.type !== 'image' && obj.type !== 'circle') ctx.stroke();
        if (obj.type === 'circle') ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
    }

    function drawSelectionBox(obj) {
        if (!obj.bounds || !ctx) return;
        ctx.strokeStyle = '#FF69B4';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(obj.bounds.minX - 5, obj.bounds.minY - 5, obj.bounds.maxX - obj.bounds.minX + 10, obj.bounds.maxY - obj.bounds.minY + 10);
        ctx.setLineDash([]);
    }

    // --- Action Handlers (Mouse/Touch Events) ---
    function startAction(e) {
        e.preventDefault();
        const { x, y } = getEventCoords(e);
        startX = x;
        startY = y;
        if (currentTool === 'select') {
            selectedObject = getObjectAtPoint(x, y);
            if (selectedObject) {
                isDragging = true;
                dragOffsetX = x - selectedObject.bounds.minX;
                dragOffsetY = y - selectedObject.bounds.minY;
                canvas.style.cursor = 'grabbing';
            }
            redrawCanvas();
            return;
        }
        isDrawing = true;
        if (currentTool === 'pen' || currentTool === 'eraser' || currentTool === 'highlight') {
            currentPath = [{ x, y }];
        }
    }

    function moveAction(e) {
        e.preventDefault();
        if (!isDrawing && !isDragging) return;
        const { x, y } = getEventCoords(e);
        if (isDragging && selectedObject) {
            const deltaX = (x - dragOffsetX) - selectedObject.bounds.minX;
            const deltaY = (y - dragOffsetY) - selectedObject.bounds.minY;
            moveObject(selectedObject, deltaX, deltaY);
            redrawCanvas();
            return;
        }
        if (isDrawing) {
            if (currentTool === 'pen' || currentTool === 'eraser' || currentTool === 'highlight') {
                const lastPoint = currentPath[currentPath.length - 1];
                const tempObj = {
                    type: 'stroke', tool: currentTool, path: [{x: lastPoint.x, y: lastPoint.y}, {x, y}],
                    color: toolOptions[currentTool].color, width: toolOptions[currentTool].width, dashed: toolOptions[currentTool].dashed
                };
                drawObject(tempObj);
                currentPath.push({ x, y });
            } else if (currentTool === 'line') {
                redrawCanvas();
                const tempLine = { type: 'line', startX, startY, endX: x, endY: y, color: toolOptions.line.color, width: toolOptions.line.width, dashed: toolOptions.line.dashed };
                drawObject(tempLine);
            } else if (currentTool === 'rectangle') {
                redrawCanvas();
                const rect = { type: 'rectangle', x: Math.min(startX, x), y: Math.min(startY, y), width: Math.abs(x - startX), height: Math.abs(y - startY), color: toolOptions.rectangle.color, width: toolOptions.rectangle.width, dashed: toolOptions.rectangle.dashed, fill: toolOptions.rectangle.fill, tool: 'rectangle' };
                drawObject(rect);
            } else if (currentTool === 'circle') {
                redrawCanvas();
                const radius = Math.sqrt(Math.pow(x - startX, 2) + Math.pow(y - startY, 2)) / 2;
                const cx = (startX + x) / 2;
                const cy = (startY + y) / 2;
                const circ = { type: 'circle', x: cx - radius, y: cy - radius, radius, color: toolOptions.circle.color, width: toolOptions.circle.width, dashed: toolOptions.circle.dashed, fill: toolOptions.circle.fill, tool: 'circle' };
                drawObject(circ);
            }
        }
    }

    async function endAction(e) {
        e.preventDefault();
        if (isDragging && selectedObject) {
            isDragging = false;
            canvas.style.cursor = 'grab';
            await updateObjectInFirestore(selectedObject);
            saveHistory();
            return;
        }
        if (!isDrawing) return;
        isDrawing = false;
        let newObjectData = null;
        if (currentTool === 'pen' || currentTool === 'eraser' || currentTool === 'highlight') {
            if (currentPath.length < 2) {
                currentPath = []; return;
            }
            newObjectData = { type: 'stroke', tool: currentTool, path: currentPath, color: toolOptions[currentTool].color, width: toolOptions[currentTool].width, dashed: toolOptions[currentTool].dashed };
        } else if (currentTool === 'line') {
            const { x, y } = getEventCoords(e);
            if (x === startX && y === startY) {
                 currentPath = []; return;
            }
            newObjectData = { type: 'line', startX, startY, endX: x, endY: y, color: toolOptions.line.color, width: toolOptions.line.width, dashed: toolOptions.line.dashed };
        } else if (currentTool === 'rectangle') {
            const { x, y } = getEventCoords(e);
            if (x === startX && y === startY) return;
            newObjectData = { type: 'rectangle', x: Math.min(startX, x), y: Math.min(startY, y), width: Math.abs(x - startX), height: Math.abs(y - startY), color: toolOptions.rectangle.color, width: toolOptions.rectangle.width, dashed: toolOptions.rectangle.dashed, fill: toolOptions.rectangle.fill, tool: 'rectangle' };
        } else if (currentTool === 'circle') {
            const { x, y } = getEventCoords(e);
            if (x === startX && y === startY) return;
            const radius = Math.sqrt(Math.pow(x - startX, 2) + Math.pow(y - startY, 2)) / 2;
            const cx = (startX + x) / 2;
            const cy = (startY + y) / 2;
            newObjectData = { type: 'circle', x: cx - radius, y: cy - radius, radius, color: toolOptions.circle.color, width: toolOptions.circle.width, dashed: toolOptions.circle.dashed, fill: toolOptions.circle.fill, tool: 'circle' };
        }
        if (newObjectData) {
            newObjectData.author = user ? user.uid : 'anonymous';
            newObjectData.bounds = calculateBounds(newObjectData);
            const docRef = await sendObjectToFirestore(newObjectData);
            if (docRef) {
                canvasObjects.push({ ...newObjectData, id: docRef.id });
                redrawCanvas();
                saveHistory();
            }
        }
        currentPath = [];
    }

    // --- Object Manipulation ---
    function calculateBounds(obj) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        if (obj.type === 'stroke') {
            obj.path.forEach(p => {
                minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
            });
        } else if (obj.type === 'line') {
            minX = Math.min(obj.startX, obj.endX); minY = Math.min(obj.startY, obj.endY);
            maxX = Math.max(obj.startX, obj.endX); maxY = Math.max(obj.startY, obj.endY);
        } else if (obj.type === 'image') {
            minX = obj.x; minY = obj.y;
            maxX = obj.x + obj.width; maxY = obj.y + obj.height;
        } else if (obj.type === 'rectangle') {
            minX = obj.x; minY = obj.y;
            maxX = obj.x + obj.width; maxY = obj.y + obj.height;
        } else if (obj.type === 'circle') {
            minX = obj.x; minY = obj.y;
            maxX = obj.x + obj.radius * 2; maxY = obj.y + obj.radius * 2;
        }
        return { minX, minY, maxX, maxY };
    }

    function getObjectAtPoint(x, y) {
        for (let i = canvasObjects.length - 1; i >= 0; i--) {
            const obj = canvasObjects[i];
            if (!obj.bounds) { obj.bounds = calculateBounds(obj); }
            if (obj.bounds && x >= obj.bounds.minX && x <= obj.bounds.maxX && y >= obj.bounds.minY && y <= obj.bounds.maxY) {
                return obj;
            }
        }
        return null;
    }

    function moveObject(obj, deltaX, deltaY) {
        if (obj.type === 'stroke') {
            obj.path.forEach(p => { p.x += deltaX; p.y += deltaY; });
        } else if (obj.type === 'line') {
            obj.startX += deltaX; obj.startY += deltaY;
            obj.endX += deltaX; obj.endY += deltaY;
        } else if (obj.type === 'image') {
            obj.x += deltaX; obj.y += deltaY;
        } else if (obj.type === 'rectangle') {
            obj.x += deltaX; obj.y += deltaY;
        } else if (obj.type === 'circle') {
            obj.x += deltaX; obj.y += deltaY;
        }
        obj.bounds.minX += deltaX; obj.bounds.minY += deltaY;
        obj.bounds.maxX += deltaX; obj.bounds.maxY += deltaY;
    }

    // --- History (Undo/Redo) ---
    function saveHistory() {
        if (historyIndex < history.length - 1) {
            history = history.slice(0, historyIndex + 1);
        }
        history.push(JSON.parse(JSON.stringify(canvasObjects)));
        historyIndex++;
        updateUndoRedoButtons();
    }

    function undo() {
        if (historyIndex > 0) {
            historyIndex--;
            canvasObjects = JSON.parse(JSON.stringify(history[historyIndex]));
            // Phải tải lại các đối tượng ảnh sau khi undo
            canvasObjects.forEach(obj => {
                if (obj.type === 'image' && !obj.imgElement) {
                     const img = new Image();
                     img.crossOrigin = "anonymous";
                     img.src = obj.url;
                     obj.imgElement = img;
                     img.onload = () => redrawCanvas();
                }
            });
            redrawCanvas();
            updateUndoRedoButtons();
        }
    }

    function redo() {
        if (historyIndex < history.length - 1) {
            historyIndex++;
            canvasObjects = JSON.parse(JSON.stringify(history[historyIndex]));
            // Tương tự, tải lại ảnh khi redo
             canvasObjects.forEach(obj => {
                if (obj.type === 'image' && !obj.imgElement) {
                     const img = new Image();
                     img.crossOrigin = "anonymous";
                     img.src = obj.url;
                     obj.imgElement = img;
                     img.onload = () => redrawCanvas();
                }
            });
            redrawCanvas();
            updateUndoRedoButtons();
        }
    }

    function updateUndoRedoButtons() {
        if (!undoBtn || !redoBtn) return;
        undoBtn.disabled = historyIndex <= 0;
        redoBtn.disabled = historyIndex >= history.length - 1;
        undoBtn.classList.toggle('opacity-50', undoBtn.disabled);
        redoBtn.classList.toggle('opacity-50', redoBtn.disabled);
    }

    // --- Firestore & Realtime ---
    async function sendObjectToFirestore(data) {
        if (!roomId) return;
        try {
            const roomDrawingsRef = collection(db, 'study_rooms', roomId, 'drawings');
            return await addDoc(roomDrawingsRef, { ...data, timestamp: serverTimestamp() });
        } catch (error) {
            console.error("Error sending object data:", error);
        }
    }

    async function updateObjectInFirestore(obj) {
        if (!roomId || !obj.id) return;
        try {
            const objRef = doc(db, 'study_rooms', roomId, 'drawings', obj.id);
            const dataToUpdate = { bounds: obj.bounds };
            if (obj.type === 'stroke') { dataToUpdate.path = obj.path; }
            else if (obj.type === 'line') {
                dataToUpdate.startX = obj.startX; dataToUpdate.startY = obj.startY;
                dataToUpdate.endX = obj.endX; dataToUpdate.endY = obj.endY;
            } else if (obj.type === 'image') {
                dataToUpdate.x = obj.x; dataToUpdate.y = obj.y;
            }
            await updateDoc(objRef, dataToUpdate);
        } catch (error) {
            console.error("Error updating object in Firestore:", error);
            showToast('Không thể đồng bộ thay đổi vị trí.', 'error');
        }
    }

    function listenToRoomChanges() {
        if (roomUnsubscribe) roomUnsubscribe();
        const roomDrawingsRef = collection(db, 'study_rooms', roomId, 'drawings');
        const q = query(roomDrawingsRef, orderBy("timestamp"));
        roomUnsubscribe = onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.doc.metadata.hasPendingWrites) { return; }
                const data = change.doc.data();
                const id = change.doc.id;
                if (change.type === "added") {
                    if (!canvasObjects.some(obj => obj.id === id)) {
                        canvasObjects.push({ ...data, id });
                        if (data.type === 'image') {
                            const img = new Image();
                            img.crossOrigin = "anonymous";
                            img.src = data.url;
                            img.onload = () => {
                                const loadedObj = canvasObjects.find(o => o.id === id);
                                if (loadedObj) loadedObj.imgElement = img;
                                redrawCanvas();
                            };
                        }
                        redrawCanvas();
                    }
                } else if (change.type === "modified") {
                    const index = canvasObjects.findIndex(obj => obj.id === id);
                    if (index !== -1) {
                        Object.assign(canvasObjects[index], data);
                        if (data.type === 'image' && (!canvasObjects[index].imgElement || canvasObjects[index].imgElement.src !== data.url)) {
                            const img = new Image();
                            img.crossOrigin = "anonymous";
                            img.src = data.url;
                            img.onload = () => {
                                canvasObjects[index].imgElement = img;
                                redrawCanvas();
                            };
                        }
                        canvasObjects[index].id = id;
                        redrawCanvas();
                    }
                } else if (change.type === "removed") {
                    canvasObjects = canvasObjects.filter(obj => obj.id !== id);
                    redrawCanvas();
                }
            });
            // Sau khi nhận thay đổi, lưu lại lịch sử
            // Điều này làm cho undo/redo đồng bộ hơn giữa các client
            saveHistory();
        });
    }

    async function clearAllDrawings() {
        if (!roomId) return;
        if (!confirm('Bạn có chắc muốn xóa toàn bộ bảng? Hành động này sẽ xóa cho tất cả mọi người.')) return;
        canvasObjects = [];
        redrawCanvas(); // Cập nhật ngay lập tức
        const drawingsRef = collection(db, 'study_rooms', roomId, 'drawings');
        const querySnapshot = await getDocs(drawingsRef);
        const batch = writeBatch(db);
        querySnapshot.forEach((doc) => { batch.delete(doc.ref); });
        await batch.commit();
        saveHistory();
    }
    
    // --- Image Object Management ---
    // Giữ nguyên các hàm handleImageObjectUpload, parseQuizFile, renderQuizQuestion, listenToQuizSessionChanges
    async function handleImageObjectUpload(e) {
        const file = e.target.files[0];
        if (!file || !roomId) return;
        if (!file.type.startsWith('image/')) {
            showToast('Vui lòng chọn một file ảnh (PNG, JPG...).', 'warning');
            return;
        }
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            showToast('Kích thước file quá lớn (tối đa 5MB).', 'warning');
            return;
        }
        loadingOverlay.classList.remove('hidden');
        showToast('Đang tải ảnh lên bảng...', 'info');
        try {
            const storagePath = `drawing_images/${roomId}/${Date.now()}-${file.name}`;
            const storageRef = ref(storage, storagePath);
            const uploadResult = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(uploadResult.ref);
            const img = new Image();
            img.src = downloadURL;
            await new Promise(resolve => img.onload = resolve);
            const canvasLogicalWidth = canvas.width / (window.devicePixelRatio || 1);
            const canvasLogicalHeight = canvas.height / (window.devicePixelRatio || 1);
            let displayWidth = img.width;
            let displayHeight = img.height;
            const maxWidth = canvasLogicalWidth * 0.8;
            const maxHeight = canvasLogicalHeight * 0.8;
            if (displayWidth > maxWidth) {
                displayHeight = (displayHeight / displayWidth) * maxWidth;
                displayWidth = maxWidth;
            }
            if (displayHeight > maxHeight) {
                displayWidth = (displayWidth / displayHeight) * maxHeight;
                displayHeight = maxHeight;
            }
            const initialX = (canvasLogicalWidth - displayWidth) / 2;
            const initialY = (canvasLogicalHeight - displayHeight) / 2;
            const newImageObject = {
                type: 'image', url: downloadURL, storagePath: storagePath,
                x: initialX, y: initialY, width: displayWidth, height: displayHeight,
                author: user ? user.uid : 'anonymous',
                timestamp: serverTimestamp()
            };
            newImageObject.bounds = calculateBounds(newImageObject);
            await sendObjectToFirestore(newImageObject);
            showToast('Đã tải ảnh lên bảng!', 'success');
        } catch (error) {
            console.error("Error uploading image object:", error);
            showToast('Tải ảnh lên bảng thất bại.', 'error');
        } finally {
            loadingOverlay.classList.add('hidden');
            if (imageObjectFileInput) imageObjectFileInput.value = '';
        }
    }

    // --- Quiz Collaboration Functions ---
    async function parseQuizFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                const questions = [];
                const startRowIndex = 0;
                for (let i = startRowIndex; i < json.length; i++) {
                    const row = json[i];
                    if (!row || row.length === 0 || !String(row[0]).trim()) { continue; }
                    const questionText = String(row[0]).trim();
                    const options = [];
                    for (let j = 1; j < row.length; j++) {
                        const optionText = String(row[j]).trim();
                        if (optionText) { options.push(optionText); }
                    }
                    if (options.length === 0) continue;
                    questions.push({
                        question: questionText,
                        options: options,
                        hostSelectedAnswerIndex: null
                    });
                }
                resolve(questions);
            };
            reader.onerror = (error) => { reject(error); };
            reader.readAsArrayBuffer(file);
        });
    }

    let isLibraryQuizMode = false; // Thêm biến trạng thái chế độ làm đề thư viện
    let libraryQuizAnswerState = {}; // Lưu trạng thái đã trả lời từng câu khi làm đề thư viện

    function renderQuizQuestion() {
        if (!currentQuizData || !currentQuizData.questions || currentQuizData.questions.length === 0) return;
        const totalQuestions = currentQuizData.questions.length;
        const currentQ = currentQuizData.questions[currentQuestionIndex];
        currentQuestionText.textContent = `${currentQuestionIndex + 1}. ${currentQ.question}`;
        quizOptionsArea.innerHTML = '';
        // Lấy giải thích cá nhân từ localStorage
        let explainKey = null;
        let savedExplain = '';
        if (user && roomId !== null) {
            explainKey = `explain_${roomId}_${user.uid}_${currentQuestionIndex}`;
            savedExplain = localStorage.getItem(explainKey) || '';
        }
        // Nếu là chế độ làm đề thư viện
        if (isLibraryQuizMode) {
            // Hiển thị các đáp án với xác nhận đúng/sai và giải thích
            currentQ.options.forEach((option, index) => {
                const btn = document.createElement('button');
                btn.className = 'w-full text-left p-3 rounded-lg border mb-2 transition font-semibold bg-white hover:bg-pink-50';
                btn.textContent = option;
                btn.disabled = !!libraryQuizAnswerState[currentQuestionIndex];
                if (libraryQuizAnswerState[currentQuestionIndex]) {
                    // Đã trả lời, hiển thị màu sắc
                    if (index === currentQ.answer) {
                        btn.classList.add('bg-green-100', 'border-green-400');
                    }
                    if (libraryQuizAnswerState[currentQuestionIndex].selected === index) {
                        if (index === currentQ.answer) {
                            btn.classList.add('ring-2', 'ring-green-400');
                        } else {
                            btn.classList.add('bg-red-100', 'border-red-400', 'ring-2', 'ring-red-400');
                        }
                    }
                }
                btn.addEventListener('click', () => {
                    if (libraryQuizAnswerState[currentQuestionIndex]) return;
                    libraryQuizAnswerState[currentQuestionIndex] = {
                        selected: index,
                        correct: index === currentQ.answer
                    };
                    renderQuizQuestion();
                });
                quizOptionsArea.appendChild(btn);
            });
            // Hiện textarea giải thích đáp án nếu đã trả lời
            if (libraryQuizAnswerState[currentQuestionIndex]) {
                const explainDiv = document.createElement('div');
                explainDiv.className = 'mt-4';
                explainDiv.innerHTML = `
                    <label for="explain-input" class="block text-sm font-medium text-gray-700 mb-1">Giải thích của bạn (có thể sửa giải thích mặc định):</label>
                    <textarea id="explain-input" class="w-full p-2 border rounded bg-pink-50 text-gray-700" rows="2" placeholder="Nhập giải thích hoặc ghi chú...">${typeof currentQ.explain === 'string' && currentQ.explain.trim() !== '' ? currentQ.explain : (savedExplain || '')}</textarea>
                    <div class="text-xs text-gray-400 mt-1">Bạn có thể chỉnh sửa giải thích mặc định hoặc ghi chú thêm!</div>
                `;
                quizOptionsArea.appendChild(explainDiv);
                setTimeout(() => {
                    const explainInput = document.getElementById('explain-input');
                    if (explainInput && explainKey) {
                        explainInput.addEventListener('input', (e) => {
                            localStorage.setItem(explainKey, e.target.value);
                        });
                    }
                }, 100);
            }
            // Không cho chuyển tiếp nếu chưa trả lời
            prevQuestionBtn.disabled = currentQuestionIndex === 0;
            nextQuestionBtn.disabled = currentQuestionIndex === totalQuestions - 1 || !libraryQuizAnswerState[currentQuestionIndex];
            questionCounter.textContent = `${currentQuestionIndex + 1} / ${totalQuestions}`;
            const progress = ((currentQuestionIndex + 1) / totalQuestions) * 100;
            collaborativeQuizProgressFill.style.width = `${progress}%`;
            finishQuizCollaborationBtn.classList.add('hidden');
        } else {
            currentQ.options.forEach((option, index) => {
                const optionDiv = document.createElement('div');
                optionDiv.className = `p-3 border rounded-lg cursor-pointer transition duration-200 ease-in-out flex items-center gap-2`;
                optionDiv.innerHTML = `<span class="font-bold text-[#FF69B4]">${String.fromCharCode(65 + index)}.</span> <span>${option}</span>`;
                optionDiv.dataset.index = index;
                // Highlight đáp án được chọn luôn xanh lá
                if (currentQ.hostSelectedAnswerIndex === index) {
                    optionDiv.classList.add('bg-green-200', 'border-green-400');
                }
                optionDiv.addEventListener('click', async () => {
                    if (!isHost) return;
                    // ...existing code for selecting answer...
                    // Đảm bảo chỉ highlight xanh lá, không đỏ
                    currentQ.hostSelectedAnswerIndex = index;
                    renderQuizQuestion();
                    // ...existing code for sync to Firestore...
                    // (giữ nguyên logic đồng bộ đáp án)
                });
                quizOptionsArea.appendChild(optionDiv);
            });
            // Thêm textarea giải thích cá nhân
            const explainDiv = document.createElement('div');
            explainDiv.className = 'mt-4';
            explainDiv.innerHTML = `
                <label for="explain-input" class="block text-sm font-medium text-gray-700 mb-1">Giải thích của bạn (chỉ lưu trên thiết bị):</label>
                <textarea id="explain-input" class="w-full p-2 border rounded bg-pink-50 text-gray-700" rows="2" placeholder="Nhập giải thích hoặc ghi chú...">${savedExplain}</textarea>
                <div class="text-xs text-gray-400 mt-1">Bạn có thể ghi chú mẹo nhớ, ví dụ, hoặc bất cứ điều gì!</div>
            `;
            quizOptionsArea.appendChild(explainDiv);
            setTimeout(() => {
                const explainInput = document.getElementById('explain-input');
                if (explainInput && explainKey) {
                    explainInput.addEventListener('input', (e) => {
                        localStorage.setItem(explainKey, e.target.value);
                    });
                }
            }, 100);
            prevQuestionBtn.disabled = currentQuestionIndex === 0 || !isHost;
            nextQuestionBtn.disabled = currentQuestionIndex === totalQuestions - 1 || !isHost;
            questionCounter.textContent = `${currentQuestionIndex + 1} / ${totalQuestions}`;
            const progress = ((currentQuestionIndex + 1) / totalQuestions) * 100;
            collaborativeQuizProgressFill.style.width = `${progress}%`;
            if (isHost && currentQuestionIndex === totalQuestions - 1) {
                finishQuizCollaborationBtn.classList.remove('hidden');
            } else {
                finishQuizCollaborationBtn.classList.add('hidden');
            }
        }
    }

    function listenToQuizSessionChanges() {
        if (quizSessionUnsubscribe) quizSessionUnsubscribe();
        const quizSessionRef = doc(db, 'study_rooms', roomId, 'quizSession', 'current');
        quizSessionUnsubscribe = onSnapshot(quizSessionRef, (docSnapshot) => {
            if (docSnapshot.exists() && docSnapshot.data().questions && docSnapshot.data().questions.length > 0) {
                const quizSessionData = docSnapshot.data();
                currentQuizData = quizSessionData;
                currentQuestionIndex = quizSessionData.currentQuestionIndex || 0;
                isHost = (user && user.uid === quizSessionData.hostId);
                quizUploadArea.classList.add('hidden');
                collaborativeQuizDisplay.classList.remove('hidden');
                collaborativeQuizModal.classList.remove('hidden');
                renderQuizQuestion();
            } else {
                currentQuizData = null;
                currentQuestionIndex = 0;
                isHost = false;
                collaborativeQuizDisplay.classList.add('hidden');
                quizUploadArea.classList.remove('hidden');
                startQuizCollaborationBtn.disabled = true;
                quizFileInfo.classList.add('hidden');
            }
        });
    }

    // Quiz file input change
    if (quizFileInput) {
        quizFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) {
                quizFileInfo.classList.add('hidden');
                startQuizCollaborationBtn.disabled = true;
                return;
            }
            quizFileNameSpan.textContent = file.name;
            quizFileInfo.classList.remove('hidden');
            startQuizCollaborationBtn.disabled = true;
            try {
                const questions = await parseQuizFile(file);
                quizQuestionCountInfo.textContent = `Tìm thấy ${questions.length} câu hỏi.`;
                currentQuizData = {
                    questions: questions,
                    hostId: user ? user.uid : null,
                    hostName: user ? user.displayName || 'Ẩn danh' : 'Ẩn danh',
                    currentQuestionIndex: 0,
                    quizTitle: file.name.split('.').slice(0, -1).join('.')
                };
                startQuizCollaborationBtn.disabled = false;
            } catch (error) {
                showToast('Lỗi khi đọc file. Vui lòng kiểm tra định dạng.', 'error');
                quizFileInfo.classList.add('hidden');
                startQuizCollaborationBtn.disabled = true;
            }
        });
    }

    // Bắt đầu collaborative quiz
    if (startQuizCollaborationBtn) {
        startQuizCollaborationBtn.addEventListener('click', async () => {
            if (!currentQuizData || !roomId) {
                showToast('Không thể bắt đầu. Vui lòng tải file.', 'error');
                return;
            }
            loadingOverlay.classList.remove('hidden');
            try {
                const quizSessionRef = doc(db, 'study_rooms', roomId, 'quizSession', 'current');
                currentQuizData.hostId = user ? user.uid : null;
                currentQuizData.hostName = user ? user.displayName || 'Ẩn danh' : 'Ẩn danh';
                await setDoc(quizSessionRef, currentQuizData);
                showToast('Đã bắt đầu phiên trắc nghiệm!', 'success');
            } catch (error) {
                showToast('Lỗi khi bắt đầu phiên trắc nghiệm.', 'error');
            } finally {
                loadingOverlay.classList.add('hidden');
            }
        });
    }

    // Chuyển câu hỏi
    if (prevQuestionBtn) {
        prevQuestionBtn.addEventListener('click', async () => {
            if (currentQuestionIndex > 0) {
                currentQuestionIndex--;
                renderQuizQuestion();
            }
        });
    }
    if (nextQuestionBtn) {
        nextQuestionBtn.addEventListener('click', async () => {
            if (currentQuizData && currentQuestionIndex < currentQuizData.questions.length - 1) {
                currentQuestionIndex++;
                renderQuizQuestion();
            }
        });
    }
    // Hoàn thành và lưu quiz
    if (finishQuizCollaborationBtn) {
        finishQuizCollaborationBtn.addEventListener('click', async () => {
            if (!currentQuizData || !roomId || !isHost) {
                showToast('Không thể hoàn thành. Vui lòng đảm bảo bạn là chủ phòng và có dữ liệu.', 'error');
                return;
            }
            if (!user || user.isAnonymous) {
                showToast('Vui lòng đăng nhập để lưu bài trắc nghiệm vào thư viện cá nhân của bạn.', 'warning');
                return;
            }
            loadingOverlay.classList.remove('hidden');
            showToast('Đang lưu bài trắc nghiệm vào thư viện...', 'info');
            const userId = user.uid;
            const userName = user.displayName || 'Ẩn danh';
            const finalQuestions = currentQuizData.questions.map(q => ({
                question: q.question,
                answers: q.options, // Đổi 'options' thành 'answers' để nhất quán
                correctAnswerIndex: q.hostSelectedAnswerIndex
            }));
            const quizToSave = {
                title: currentQuizData.quizTitle || 'Trắc nghiệm từ phòng học',
                questions: finalQuestions,
                questionCount: finalQuestions.length, // Thêm số lượng câu hỏi
                createdAt: serverTimestamp(),
                userId: userId, // Sử dụng 'userId' để nhất quán với thư viện
                isPublic: true, // Luôn public để ai cũng xem được
                folderId: null
            };
            try {
                // Luôn thêm isPublic: true khi lưu vào quiz_sets
                await addDoc(collection(db, 'quiz_sets'), quizToSave);
                showToast('Đã lưu bài trắc nghiệm vào thư viện!', 'success');
                await updateDoc(doc(db, 'study_rooms', roomId, 'quizSession', 'current'), {
                    questions: [],
                    currentQuestionIndex: 0,
                    hostId: null,
                    hostName: null
                });
            } catch (error) {
                showToast('Lỗi khi lưu bài trắc nghiệm.', 'error');
            } finally {
                loadingOverlay.classList.add('hidden');
                currentQuizData = null;
                currentQuestionIndex = 0;
                isHost = false;
                startQuizCollaborationBtn.disabled = true;
                quizFileInfo.classList.add('hidden');
                collaborativeQuizDisplay.classList.add('hidden');
                quizUploadArea.classList.remove('hidden');
            }
        });
    }

    // Hiển thị modal collaborative quiz khi bấm nút "Cùng nhau đánh đề"
    if (startCollaborativeQuizBtn && collaborativeQuizModal) {
        startCollaborativeQuizBtn.addEventListener('click', () => {
            collaborativeQuizModal.classList.remove('hidden');
            // Reset modal state mỗi lần mở
            quizUploadArea.classList.remove('hidden');
            collaborativeQuizDisplay.classList.add('hidden');
            quizFileInfo.classList.add('hidden');
            startQuizCollaborationBtn.disabled = true;
            if (quizFileInput) quizFileInput.value = '';
            if (quizQuestionCountInfo) quizQuestionCountInfo.textContent = '';
        });

        // Thêm sự kiện click cho khu vực kéo thả file quiz
        if (quizUploadArea && quizFileInput) {
            quizUploadArea.addEventListener('click', () => quizFileInput.click());
        }
    }
    // Đóng modal khi bấm nút đóng
    if (closeCollaborativeQuizModalBtn && collaborativeQuizModal) {
        closeCollaborativeQuizModalBtn.addEventListener('click', () => {
            collaborativeQuizModal.classList.add('hidden');
        });
    }

    // Lắng nghe quiz session khi vào phòng
    if (roomId) {
        listenToQuizSessionChanges();
    }

    // --- Thêm modal chọn đề từ thư viện ---
    const libraryQuizBtn = document.getElementById('library-quiz-btn');
    let libraryQuizModal = null;
    let libraryQuizList = null;
    let libraryQuizCloseBtn = null;
    let libraryQuizLoading = null;

    // Gán sự kiện click cho nút "Làm đề trong thư viện"
    if (libraryQuizBtn) {
        libraryQuizBtn.onclick = showLibraryQuizModal;
    }

    // Tạo modal chọn đề nếu chưa có
    function createLibraryQuizModal() {
        if (document.getElementById('library-quiz-modal')) return;
        const modal = document.createElement('div');
        modal.id = 'library-quiz-modal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-xl relative">
                <button id="library-quiz-close-btn" class="absolute top-3 right-3 text-gray-400 hover:text-gray-700"><i class="fas fa-times text-2xl"></i></button>
                <h2 class="text-lg font-bold text-pink-500 mb-4 flex items-center gap-2"><i class="fas fa-book"></i> Chọn đề trong thư viện</h2>
                <div id="library-quiz-loading" class="text-center text-gray-400 mb-2">Đang tải danh sách đề...</div>
                <div id="library-quiz-list" class="space-y-2 max-h-80 overflow-y-auto"></div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Hiển thị modal chọn đề
    function showLibraryQuizModal() {
        createLibraryQuizModal();
        libraryQuizModal = document.getElementById('library-quiz-modal');
        libraryQuizList = document.getElementById('library-quiz-list');
        libraryQuizCloseBtn = document.getElementById('library-quiz-close-btn');
        libraryQuizLoading = document.getElementById('library-quiz-loading');
        if (libraryQuizModal) libraryQuizModal.style.display = 'flex';
        if (libraryQuizList) libraryQuizList.innerHTML = '';
        if (libraryQuizLoading) libraryQuizLoading.style.display = '';
        // Lấy danh sách đề từ Firestore
        loadLibraryQuizList();
        if (libraryQuizCloseBtn) {
            libraryQuizCloseBtn.onclick = () => {
                if (libraryQuizModal) libraryQuizModal.style.display = 'none';
            };
        }
    }

    // Lấy danh sách đề từ Firestore
    async function loadLibraryQuizList() {
        if (!libraryQuizList || !libraryQuizLoading) return;
        libraryQuizList.innerHTML = '';
        libraryQuizLoading.style.display = '';
        try {
            // Kiểm tra db và import
            if (!db || typeof collection !== 'function' || typeof getDocs !== 'function' || typeof query !== 'function' || typeof where !== 'function') {
                libraryQuizList.innerHTML = '<div class="text-center text-red-400">Không thể kết nối Firestore. Kiểm tra import và cấu hình.</div>';
                libraryQuizLoading.style.display = 'none';
                return;
            }
            // Lỗi xảy ra ở đây: Cần phải lọc các bộ đề công khai, không được lấy tất cả.
            // Sửa lỗi bằng cách chỉ truy vấn các bộ đề có `isPublic: true`
            const q = query(collection(db, 'quiz_sets'), where("isPublic", "==", true), orderBy("createdAt", "desc"), limit(50));
            const snapshot = await getDocs(q);
            if (snapshot.empty) {
                libraryQuizList.innerHTML = '<div class="text-center text-gray-400">Không có đề nào trong thư viện.</div>';
            } else {
                snapshot.forEach(docSnap => {
                    const data = docSnap.data();
                    const div = document.createElement('div');
                    div.className = 'border rounded-lg p-3 flex flex-col gap-1 hover:bg-pink-50 cursor-pointer';
                    div.innerHTML = `<span class=\"font-semibold text-pink-600\">${data.title || 'Đề không tên'}</span><span class=\"text-xs text-gray-500\">${data.questionCount || (data.questions ? data.questions.length : 0)} câu hỏi</span>`;
                    div.onclick = () => selectLibraryQuiz(docSnap.id, data);
                    libraryQuizList.appendChild(div);
                });
            }
        } catch (err) {
            console.error('Lỗi khi tải đề từ Firestore:', err);
            libraryQuizList.innerHTML = `<div class=\"text-center text-red-400\">Lỗi khi tải đề: ${err && err.message ? err.message : err}</div>`;
        } finally {
            libraryQuizLoading.style.display = 'none';
        }
    }

    // Khi chọn đề trong thư viện
    async function selectLibraryQuiz(docId, data) {
        isLibraryQuizMode = true;
        libraryQuizAnswerState = {};
        // Ensure questions is always an array
        let questions = Array.isArray(data.questions) ? data.questions : [];
        // If the quiz uses 'answers' and 'correctAnswerIndex', convert to the expected format
        if (questions.length > 0 && questions[0].answers && typeof questions[0].correctAnswerIndex !== 'undefined') {
            questions = questions.map(q => ({
                question: q.question,
                options: q.answers,
                answer: q.correctAnswerIndex,
                explain: q.explain || ''
            }));
        }
        currentQuizData = {
            ...data,
            questions
        };
        currentQuestionIndex = 0;
        collaborativeQuizModal.classList.remove('hidden');
        collaborativeQuizDisplay.classList.remove('hidden');
        uploadQuizFileArea?.classList?.add('hidden');
        renderQuizQuestion();
    }

    // --- Room Management ---
    async function initRoom() {
        if(loadingOverlay) loadingOverlay.classList.remove('hidden');
        try {
            // Lấy roomId từ URL, KHÔNG tạo mới nếu không có
            const urlParams = new URLSearchParams(window.location.search);
            roomId = urlParams.get('id');

            if (roomId) {
                const roomRef = doc(db, 'study_rooms', roomId);
                const roomSnap = await getDoc(roomRef);
                if (!roomSnap.exists()) {
                    alert("Phòng không tồn tại!");
                    window.location.href = '../../index.html';
                    return;
                }
                onSnapshot(roomRef, (docSnap) => {
                    const roomData = docSnap.data();
                    if (roomData && roomData.background && roomData.background.url !== currentBackgroundUrl) {
                        currentBackgroundUrl = roomData.background.url;
                        backgroundImage.src = currentBackgroundUrl;
                        backgroundImage.onload = () => redrawCanvas();
                    } else if (!roomData.background && currentBackgroundUrl) {
                        currentBackgroundUrl = null;
                        redrawCanvas();
                    }
                });
            } else {
                // Không tạo phòng mới tự động nữa
                alert("Bạn cần truy cập phòng học qua đường dẫn hợp lệ!");
                window.location.href = '../../index.html';
                return;
            }

            if(roomIdDisplay) roomIdDisplay.textContent = roomId;

            // Fetch initial drawings
            const drawingsRef = collection(db, 'study_rooms', roomId, 'drawings');
            const q = query(drawingsRef, orderBy("timestamp", "asc"));
            const querySnapshot = await getDocs(q);
            canvasObjects = querySnapshot.docs.map(docSnap => {
                const data = docSnap.data();
                const obj = { id: docSnap.id, ...data };
                if (obj.type === 'image') {
                    const img = new Image();
                    img.crossOrigin = "anonymous";
                    img.src = obj.url;
                    obj.imgElement = img;
                    img.onload = () => redrawCanvas();
                }
                return obj;
            });

            saveHistory();
            redrawCanvas();

            // Khởi tạo các listener mới
            listenToRoomChanges();
            listenToQuizSessionChanges();
            listenToMembers();
            listenToChat();
        } catch (err) {
            console.error('Lỗi khi khởi tạo phòng:', err);
            showToast('Lỗi khi tải phòng học.', 'error');
        } finally {
            if(loadingOverlay) loadingOverlay.classList.add('hidden');
        }
    }

    // --- Main Execution Flow (Cập nhật để tích hợp) ---
    function main() {
        if(loadingOverlay) loadingOverlay.classList.remove('hidden');
        onAuthStateChanged(auth, async (authenticatedUser) => {
            if (authenticatedUser) {
                user = authenticatedUser; // Gán người dùng vào biến toàn cục
                console.log("User is authenticated:", user.uid);
                // **INTEGRATION**: Tham gia phòng và đăng ký sự kiện rời phòng
                const urlParams = new URLSearchParams(window.location.search);
                const urlRoomId = urlParams.get('id');
                if (urlRoomId) {
                    roomId = urlRoomId; // chỉ gán roomId từ URL 1 lần duy nhất
                    await joinRoomAsMember();
                    window.addEventListener('beforeunload', leaveRoomAsMember);
                    if (canvas) resizeCanvas();
                    await initRoom();
                } else {
                    alert("Bạn cần truy cập phòng học qua đường dẫn hợp lệ!");
                    window.location.href = '../../index.html';
                }
            } else {
                console.log("No user found, signing in anonymously...");
                signInAnonymously(auth)
                    .catch((error) => {
                        console.error("Anonymous sign-in failed:", error);
                        if(loadingOverlay) loadingOverlay.innerHTML = `<p class=\"text-red-500 text-center\">Lỗi xác thực. Vui lòng tải lại trang.</p>`;
                        showToast('Lỗi xác thực. Không thể tải phòng học.', 'error');
                        if(loadingOverlay) loadingOverlay.classList.add('hidden');
                    });
                // onAuthStateChanged sẽ tự động được gọi lại sau khi đăng nhập ẩn danh thành công
            }
        });
    }

    // --- Đảm bảo chatForm luôn có event listener và không bị gắn trùng ---
    if (chatForm) {
        chatForm.onsubmit = null;
        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!chatInput.value.trim() || !user || !roomId) return;
            try {
                await addDoc(collection(db, 'study_rooms', roomId, 'messages'), {
                    type: 'chat',
                    text: chatInput.value.trim(),
                    uid: user.uid,
                    displayName: user.displayName || user.email || 'Khách',
                    createdAt: serverTimestamp()
                });
                chatInput.value = '';
            } catch (err) {
                showToast('Không gửi được tin nhắn.', 'error');
            }
        });
    }

    // --- Đảm bảo các nút toolbar luôn có event listener ---
    if (undoBtn) {
        undoBtn.onclick = undo;
    }
    if (redoBtn) {
        redoBtn.onclick = redo;
    }
    if (clearCanvasBtn) {
        clearCanvasBtn.onclick = clearAllDrawings;
    }
    if (uploadImageObjectBtn && imageObjectFileInput) {
        uploadImageObjectBtn.onclick = () => imageObjectFileInput.click();
        imageObjectFileInput.onchange = handleImageObjectUpload;
    }
    if (toolBtns && toolBtns.length) {
        toolBtns.forEach(btn => {
            btn.onclick = () => {
                currentTool = btn.dataset.tool;
                toolBtns.forEach(b => b.classList.remove('bg-[#FFB6C1]'));
                btn.classList.add('bg-[#FFB6C1]');
                // Cập nhật tuỳ chọn màu/nét đứt/nét liền cho từng tool
                if (toolOptions[currentTool]) {
                    if (colorPicker) colorPicker.value = toolOptions[currentTool].color || '#000000';
                    if (lineWidth) lineWidth.value = toolOptions[currentTool].width || 2;
                }
                canvas.style.cursor = (currentTool === 'select') ? 'grab' : 'crosshair';
            };
        });
    }
    // Thay đổi màu/nét đứt/nét liền cho từng tool
    if (colorPicker) {
        colorPicker.oninput = (e) => {
            if (toolOptions[currentTool]) {
                toolOptions[currentTool].color = e.target.value;
            }
        };
    }
    if (lineWidth) {
        lineWidth.oninput = (e) => {
            if (toolOptions[currentTool]) {
                toolOptions[currentTool].width = parseInt(e.target.value, 10);
            }
        };
    }

    // --- Đảm bảo các sự kiện chỉ được gán một lần ---
    // (Ví dụ: sự kiện cho chatForm, các nút toolbar đã được đảm bảo ở trên)
    // --- Tránh gán lại sự kiện cho canvas ---
    if (canvas) {
        canvas.onmousedown = startAction;
        canvas.onmousemove = moveAction;
        canvas.onmouseup = endAction;
        canvas.ontouchstart = startAction;
        canvas.ontouchmove = moveAction;
        canvas.ontouchend = endAction;
    }

    main();
});