// whiteboard.js
import { db, storage } from '../../core/firebase-init.js';
import { doc, onSnapshot, collection, addDoc, query, orderBy, serverTimestamp, deleteDoc, getDocs, updateDoc, writeBatch } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-storage.js";
import { showToast } from '../../core/utils.js';

// Hàm khởi tạo, nhận các phần tử DOM và trạng thái cần thiết từ file chính
export function initWhiteboard(params) {
    // --- Destructuring parameters ---
    const {
        canvas, ctx, roomId, user, loadingOverlay,
        toolBtns, colorPicker, lineWidth, clearCanvasBtn,
        undoBtn, redoBtn, uploadImageObjectBtn, imageObjectFileInput
    } = params;

    if (!canvas) return;

    // --- Whiteboard state ---
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
    let toolOptions = {
        pen: { color: '#FF69B4', width: 5, dashed: false },
        highlight: { color: '#ffff0066', width: 20, dashed: false },
        line: { color: '#FF69B4', width: 5, dashed: false },
        rectangle: { color: '#FF69B4', width: 5, dashed: false, fill: false },
        circle: { color: '#FF69B4', width: 5, dashed: false, fill: false },
        eraser: { width: 20 }
    };
    
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
        // ... (Giữ nguyên toàn bộ hàm drawObject)
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
        // ... (Giữ nguyên toàn bộ hàm drawSelectionBox)
        if (!obj.bounds || !ctx) return;
        ctx.strokeStyle = '#FF69B4';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(obj.bounds.minX - 5, obj.bounds.minY - 5, obj.bounds.maxX - obj.bounds.minX + 10, obj.bounds.maxY - obj.bounds.minY + 10);
        ctx.setLineDash([]);
    }

    // --- Action Handlers (Mouse/Touch Events) ---
    function startAction(e) {
        // ... (Giữ nguyên toàn bộ hàm startAction)
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
        // ... (Giữ nguyên toàn bộ hàm moveAction)
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
            } else if (currentTool === 'line' || currentTool === 'rectangle' || currentTool === 'circle') {
                redrawCanvas(); // Redraw all committed objects
                let tempShape;
                if (currentTool === 'line') {
                    tempShape = { type: 'line', startX, startY, endX: x, endY: y, color: toolOptions.line.color, width: toolOptions.line.width, dashed: toolOptions.line.dashed };
                } else if (currentTool === 'rectangle') {
                    tempShape = { type: 'rectangle', x: Math.min(startX, x), y: Math.min(startY, y), width: Math.abs(x - startX), height: Math.abs(y - startY), color: toolOptions.rectangle.color, width: toolOptions.rectangle.width, dashed: toolOptions.rectangle.dashed, fill: toolOptions.rectangle.fill, tool: 'rectangle' };
                } else if (currentTool === 'circle') {
                    const radius = Math.sqrt(Math.pow(x - startX, 2) + Math.pow(y - startY, 2)) / 2;
                    const cx = (startX + x) / 2;
                    const cy = (startY + y) / 2;
                    tempShape = { type: 'circle', x: cx - radius, y: cy - radius, radius, color: toolOptions.circle.color, width: toolOptions.circle.width, dashed: toolOptions.circle.dashed, fill: toolOptions.circle.fill, tool: 'circle' };
                }
                drawObject(tempShape);
            }
        }
    }

    async function endAction(e) {
        // ... (Giữ nguyên toàn bộ hàm endAction)
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
        const { x, y } = getEventCoords(e);

        switch(currentTool) {
            case 'pen':
            case 'eraser':
            case 'highlight':
                if (currentPath.length < 2) { currentPath = []; return; }
                newObjectData = { type: 'stroke', tool: currentTool, path: currentPath, color: toolOptions[currentTool].color, width: toolOptions[currentTool].width, dashed: toolOptions[currentTool].dashed };
                break;
            case 'line':
                 if (x === startX && y === startY) return;
                 newObjectData = { type: 'line', startX, startY, endX: x, endY: y, color: toolOptions.line.color, width: toolOptions.line.width, dashed: toolOptions.line.dashed };
                 break;
            case 'rectangle':
                 if (x === startX && y === startY) return;
                 newObjectData = { type: 'rectangle', x: Math.min(startX, x), y: Math.min(startY, y), width: Math.abs(x - startX), height: Math.abs(y - startY), color: toolOptions.rectangle.color, width: toolOptions.rectangle.width, dashed: toolOptions.rectangle.dashed, fill: toolOptions.rectangle.fill, tool: 'rectangle' };
                 break;
            case 'circle':
                if (x === startX && y === startY) return;
                const radius = Math.sqrt(Math.pow(x - startX, 2) + Math.pow(y - startY, 2)) / 2;
                const cx = (startX + x) / 2;
                const cy = (startY + y) / 2;
                newObjectData = { type: 'circle', x: cx - radius, y: cy - radius, radius, color: toolOptions.circle.color, width: toolOptions.circle.width, dashed: toolOptions.circle.dashed, fill: toolOptions.circle.fill, tool: 'circle' };
                break;
        }

        if (newObjectData) {
            newObjectData.author = user ? user.uid : 'anonymous';
            newObjectData.bounds = calculateBounds(newObjectData);
            const docRef = await sendObjectToFirestore(newObjectData);
            if (docRef) {
                // Add the object locally immediately for responsiveness
                canvasObjects.push({ ...newObjectData, id: docRef.id });
                redrawCanvas();
                saveHistory();
            }
        }
        currentPath = [];
    }

    // --- Object Manipulation ---
    function calculateBounds(obj) {
        // ... (Giữ nguyên toàn bộ hàm calculateBounds)
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        if (obj.type === 'stroke') {
            obj.path.forEach(p => {
                minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
            });
        } else if (obj.type === 'line') {
            minX = Math.min(obj.startX, obj.endX); minY = Math.min(obj.startY, obj.endY);
            maxX = Math.max(obj.startX, obj.endX); maxY = Math.max(obj.startY, obj.endY);
        } else if (obj.type === 'image' || obj.type === 'rectangle') {
            minX = obj.x; minY = obj.y;
            maxX = obj.x + obj.width; maxY = obj.y + obj.height;
        } else if (obj.type === 'circle') {
            minX = obj.x; minY = obj.y;
            maxX = obj.x + obj.radius * 2; maxY = obj.y + obj.radius * 2;
        }
        return { minX, minY, maxX, maxY };
    }

    function getObjectAtPoint(x, y) {
        // ... (Giữ nguyên toàn bộ hàm getObjectAtPoint)
        for (let i = canvasObjects.length - 1; i >= 0; i--) {
            const obj = canvasObjects[i];
            if (obj.tool === 'eraser') continue; // Cannot select eraser strokes
            if (!obj.bounds) { obj.bounds = calculateBounds(obj); }
            if (obj.bounds && x >= obj.bounds.minX && x <= obj.bounds.maxX && y >= obj.bounds.minY && y <= obj.bounds.maxY) {
                return obj;
            }
        }
        return null;
    }

    function moveObject(obj, deltaX, deltaY) {
        // ... (Giữ nguyên toàn bộ hàm moveObject)
        if (obj.type === 'stroke') {
            obj.path.forEach(p => { p.x += deltaX; p.y += deltaY; });
        } else if (obj.type === 'line') {
            obj.startX += deltaX; obj.startY += deltaY;
            obj.endX += deltaX; obj.endY += deltaY;
        } else if (obj.type === 'image' || obj.type === 'rectangle' || obj.type === 'circle') {
            obj.x += deltaX; obj.y += deltaY;
        }
        obj.bounds.minX += deltaX; obj.bounds.minY += deltaY;
        obj.bounds.maxX += deltaX; obj.bounds.maxY += deltaY;
    }

    // --- History (Undo/Redo) ---
    function saveHistory() {
        // ... (Giữ nguyên toàn bộ hàm saveHistory)
        if (historyIndex < history.length - 1) {
            history = history.slice(0, historyIndex + 1);
        }
        // Deep copy objects, but keep image elements as references
        const snapshot = canvasObjects.map(obj => {
            const newObj = {...obj};
            if (obj.imgElement) {
                newObj.imgElement = obj.imgElement; // Keep reference
            }
            return JSON.parse(JSON.stringify(newObj, (k, v) => k === 'imgElement' ? undefined : v));
        });
        history.push(snapshot);
        historyIndex++;
        updateUndoRedoButtons();
    }

    function undo() {
        // ... (Giữ nguyên toàn bộ hàm undo)
        if (historyIndex > 0) {
            historyIndex--;
            const previousState = JSON.parse(JSON.stringify(history[historyIndex]));
            syncFirestoreFromHistory(previousState);
        }
    }

    function redo() {
        // ... (Giữ nguyên toàn bộ hàm redo)
        if (historyIndex < history.length - 1) {
            historyIndex++;
            const nextState = JSON.parse(JSON.stringify(history[historyIndex]));
            syncFirestoreFromHistory(nextState);
        }
    }

    // New function to sync state from history to Firestore
    async function syncFirestoreFromHistory(state) {
        // This is a simplified approach: clear and re-add.
        // For very large canvases, a diffing approach would be more efficient.
        await clearAllDrawings(false); // clear without confirmation
        const drawingsRef = collection(db, 'study_rooms', roomId, 'drawings');
        const batch = writeBatch(db);
        state.forEach(obj => {
            const { id, ...data } = obj; // Don't write the 'id' field back into the document
            const newDocRef = doc(drawingsRef); // Generate a new ID
            batch.set(newDocRef, { ...data, timestamp: serverTimestamp() });
        });
        await batch.commit();
        // The listener will pick up these changes and rebuild the canvasObjects array
    }


    function updateUndoRedoButtons() {
        // ... (Giữ nguyên toàn bộ hàm updateUndoRedoButtons)
        undoBtn.disabled = historyIndex <= 0;
        redoBtn.disabled = historyIndex >= history.length - 1;
        undoBtn.classList.toggle('opacity-50', undoBtn.disabled);
        redoBtn.classList.toggle('opacity-50', redoBtn.disabled);
    }
    
    // --- Firestore & Realtime ---
    async function sendObjectToFirestore(data) {
        // ... (Giữ nguyên toàn bộ hàm sendObjectToFirestore)
        if (!roomId) return;
        try {
            const roomDrawingsRef = collection(db, 'study_rooms', roomId, 'drawings');
            return await addDoc(roomDrawingsRef, { ...data, timestamp: serverTimestamp() });
        } catch (error) {
            console.error("Error sending object data:", error);
            showToast('Lỗi đồng bộ nét vẽ.', 'error');
        }
    }
    
    async function updateObjectInFirestore(obj) {
        // ... (Giữ nguyên toàn bộ hàm updateObjectInFirestore)
        if (!roomId || !obj.id) return;
        try {
            const objRef = doc(db, 'study_rooms', roomId, 'drawings', obj.id);
            const dataToUpdate = { bounds: obj.bounds };
            if (obj.type === 'stroke') { dataToUpdate.path = obj.path; }
            else if (obj.type === 'line') {
                dataToUpdate.startX = obj.startX; dataToUpdate.startY = obj.startY;
                dataToUpdate.endX = obj.endX; dataToUpdate.endY = obj.endY;
            } else if (obj.type === 'image' || obj.type === 'rectangle' || obj.type === 'circle') {
                dataToUpdate.x = obj.x; dataToUpdate.y = obj.y;
            }
            await updateDoc(objRef, dataToUpdate);
        } catch (error) {
            console.error("Error updating object in Firestore:", error);
            showToast('Không thể đồng bộ thay đổi vị trí.', 'error');
        }
    }

    function listenToRoomChanges() {
        // ... (Giữ nguyên toàn bộ hàm listenToRoomChanges)
        const roomDrawingsRef = collection(db, 'study_rooms', roomId, 'drawings');
        const q = query(roomDrawingsRef, orderBy("timestamp"));
        
        return onSnapshot(q, (snapshot) => {
            canvasObjects = []; // Clear local objects and rebuild from scratch
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                const obj = { id: docSnap.id, ...data };
                if (obj.type === 'image' && !obj.imgElement) {
                    const img = new Image();
                    img.crossOrigin = "anonymous";
                    img.src = obj.url;
                    obj.imgElement = img;
                    img.onload = () => redrawCanvas();
                }
                canvasObjects.push(obj);
            });

            redrawCanvas();
            saveHistory(); // Save the new state to history
            updateUndoRedoButtons();
        }, (error) => {
            console.error("Lỗi lắng nghe thay đổi phòng vẽ:", error);
            showToast("Mất kết nối với bảng vẽ.", "error");
        });
    }

    async function clearAllDrawings(confirmFirst = true) {
        // ... (Giữ nguyên toàn bộ hàm clearAllDrawings)
        if (confirmFirst && !confirm('Bạn có chắc muốn xóa toàn bộ bảng? Hành động này sẽ xóa cho tất cả mọi người.')) return;
        
        const drawingsRef = collection(db, 'study_rooms', roomId, 'drawings');
        const querySnapshot = await getDocs(drawingsRef);
        
        if(querySnapshot.empty) return;

        const batch = writeBatch(db);
        querySnapshot.forEach((doc) => { batch.delete(doc.ref); });
        
        try {
            await batch.commit();
            // The listener will automatically clear the canvas
            showToast('Đã dọn dẹp bảng!', 'success');
        } catch(error) {
            console.error("Lỗi khi xoá bảng:", error);
            showToast('Không thể xoá bảng.', 'error');
        }
    }
    
    // --- Image Object Management ---
    async function handleImageObjectUpload(e) {
        // ... (Giữ nguyên toàn bộ hàm handleImageObjectUpload)
        const file = e.target.files[0];
        if (!file || !roomId) return;
        // ... (Validation code)
        loadingOverlay.classList.remove('hidden');
        try {
            // ... (Image upload and object creation logic)
            const storagePath = `drawing_images/${roomId}/${Date.now()}-${file.name}`;
            const storageRef = ref(storage, storagePath);
            await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(storageRef);

            const img = new Image();
            img.src = downloadURL;
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });

            // Calculate display size
            const canvasLogicalWidth = canvas.width / (window.devicePixelRatio || 1);
            const scale = Math.min(1, (canvasLogicalWidth * 0.5) / img.width);
            const displayWidth = img.width * scale;
            const displayHeight = img.height * scale;

            const newImageObject = {
                type: 'image',
                url: downloadURL,
                storagePath: storagePath,
                x: (canvasLogicalWidth - displayWidth) / 2,
                y: 50,
                width: displayWidth,
                height: displayHeight,
                author: user ? user.uid : 'anonymous',
            };
            await sendObjectToFirestore(newImageObject);
            showToast('Đã chèn ảnh vào bảng!', 'success');
        } catch (error) {
            console.error("Error uploading image:", error);
            showToast('Tải ảnh lên thất bại.', 'error');
        } finally {
            loadingOverlay.classList.add('hidden');
            e.target.value = ''; // Reset input
        }
    }
    
    // --- Initial setup and event listeners for this module ---
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Gán sự kiện cho các nút toolbar
    toolBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            currentTool = btn.dataset.tool;
            toolBtns.forEach(b => b.classList.remove('bg-pink-300', 'text-white'));
            btn.classList.add('bg-pink-300', 'text-white');
            if (toolOptions[currentTool]) {
                colorPicker.value = toolOptions[currentTool].color || '#FF69B4';
                lineWidth.value = toolOptions[currentTool].width || 5;
            }
            canvas.style.cursor = (currentTool === 'select') ? 'grab' : 'crosshair';
            selectedObject = null;
            redrawCanvas();
        });
    });

    colorPicker.addEventListener('input', (e) => {
        if (toolOptions[currentTool]) toolOptions[currentTool].color = e.target.value;
    });

    lineWidth.addEventListener('input', (e) => {
        if (toolOptions[currentTool]) toolOptions[currentTool].width = parseInt(e.target.value, 10);
    });

    clearCanvasBtn.addEventListener('click', () => clearAllDrawings(true));
    undoBtn.addEventListener('click', undo);
    redoBtn.addEventListener('click', redo);
    uploadImageObjectBtn.addEventListener('click', () => imageObjectFileInput.click());
    imageObjectFileInput.addEventListener('change', handleImageObjectUpload);

    // Gán sự kiện cho canvas
    canvas.addEventListener('mousedown', startAction);
    canvas.addEventListener('mousemove', moveAction);
    canvas.addEventListener('mouseup', endAction);
    canvas.addEventListener('mouseleave', endAction); // Important to stop drawing if mouse leaves
    canvas.addEventListener('touchstart', startAction, { passive: false });
    canvas.addEventListener('touchmove', moveAction, { passive: false });
    canvas.addEventListener('touchend', endAction);
    
    // Bắt đầu lắng nghe thay đổi từ Firestore
    const unsubscribe = listenToRoomChanges();

    // Lắng nghe thay đổi background của phòng (từ file chính)
    const roomRef = doc(db, 'study_rooms', roomId);
    onSnapshot(roomRef, (docSnap) => {
        const roomData = docSnap.data();
        if (roomData && roomData.background && roomData.background.url !== currentBackgroundUrl) {
            currentBackgroundUrl = roomData.background.url;
            backgroundImage.src = currentBackgroundUrl;
            backgroundImage.onload = () => redrawCanvas();
        } else if ((!roomData || !roomData.background) && currentBackgroundUrl) {
            currentBackgroundUrl = null;
            backgroundImage.src = ''; // Clear the image source
            redrawCanvas();
        }
    });

    return unsubscribe; // Trả về hàm huỷ lắng nghe để file chính có thể quản lý
}