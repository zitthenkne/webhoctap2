// File: features/quiz/library/library-actions.js
// Các thao tác của thư viện: xóa/đổi tên bộ đề, modal thư mục (tạo/sửa/icon/màu),
// ghim/đổi màu/sắp xếp/xóa thư mục, di chuyển bộ đề, chọn nhiều & thao tác hàng loạt, chia sẻ.
// Tách từ quiz-library-controller.js — logic giữ nguyên, chỉ đổi truy cập trạng thái sang S.xxx.

import { auth, db } from '../../../core/firebase-init.js';
import { doc, collection, addDoc, query, where, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
// Ghi không treo khi mất mạng (xem core/offline-write.js)
import { updateDocQ as updateDoc } from "../../../core/offline-write.js";
import { showToast, showConfirm } from '../../../core/utils.js';
import { S } from './library-state.js';
import { sortUserFolders, parseFontAwesomeIcon, escapeHtml } from './library-helpers.js';
import { renderLibrary, renderBreadcrumb, rerenderCurrentView, getFilteredQuizzesForView } from './library-render.js';
import { loadAndDisplayLibrary, ensureFullLibraryLoaded, persistLibraryCache } from './library-data.js';

export async function deleteQuizSet(quizId) {
    const ok = await showConfirm(
        'Bộ đề sẽ được chuyển vào thùng rác và tự động xóa vĩnh viễn sau 30 ngày. Bạn có thể khôi phục bất cứ lúc nào trước đó.',
        { title: 'Chuyển bộ đề vào thùng rác?', confirmText: 'Vào thùng rác', cancelText: 'Hủy', tone: 'danger' }
    );
    if (!ok) return;
    try {
        await updateDoc(doc(db, "quiz_sets", quizId), { deleted: true, deletedAt: new Date() });
        S.userQuizSets = S.userQuizSets.filter(q => q.id !== quizId); // cập nhật cache để ẩn ngay
        persistLibraryCache();
        showToast('Đã chuyển bộ đề vào thùng rác.', 'success');
        renderLibrary(S.userQuizSets, S.currentLibraryPage);
    } catch (e) {
        showToast("Không thể chuyển vào thùng rác! Lỗi: " + e.message, 'error');
        console.error("Lỗi khi xóa bộ đề: ", e);
    }
}

export async function editQuizSetTitle(quizId, currentTitle) {
    const newTitle = prompt("Nhập tên mới cho bộ đề:", currentTitle);
    if (newTitle && newTitle.trim() !== '') {
        try {
            const title = newTitle.trim();
            await updateDoc(doc(db, "quiz_sets", quizId), { title });
            const q = S.userQuizSets.find(x => x.id === quizId);
            if (q) q.title = title;          // sửa tại chỗ, khỏi nạp lại cả thư viện
            persistLibraryCache();
            rerenderCurrentView();
            showToast('Đã cập nhật tên bộ đề!', 'success');
        } catch (e) {
            showToast("Đổi tên thất bại: " + e.message, 'error');
        }
    }
}

// Bật/tắt công khai bộ đề. isPublic=true: ai có link đều mở được (rule Firestore cho đọc);
// false/thiếu: chỉ chủ xem được, link "Chia sẻ" sẽ báo lỗi quyền với người khác.
export async function toggleQuizPublic(quizId, makePublic) {
    try {
        await updateDoc(doc(db, "quiz_sets", quizId), { isPublic: makePublic });
        const q = S.userQuizSets.find(x => x.id === quizId);
        if (q) q.isPublic = makePublic; // cập nhật cache để nhãn nút đổi ngay
        persistLibraryCache();
        showToast(makePublic
            ? 'Đã đặt CÔNG KHAI — ai có link đều mở được.'
            : 'Đã đặt RIÊNG TƯ — chỉ mình bạn xem được.', 'success');
        rerenderCurrentView();
    } catch (e) {
        showToast("Đổi chế độ công khai thất bại: " + e.message, 'error');
    }
}

/**
 * Nhân bản một bộ đề: chép nguyên câu hỏi sang một bộ mới cùng thư mục.
 * Dùng khi muốn cắt/sửa một phiên bản khác mà vẫn giữ nguyên bản gốc.
 * Phải đọc lại từ Firestore vì cache trong RAM đã lược bỏ mảng `questions`.
 */
export async function duplicateQuizSet(quizId, quizTitle) {
    const user = auth.currentUser;
    if (!user) { showToast('Vui lòng đăng nhập.', 'info'); return; }
    try {
        showToast('Đang nhân bản…', 'info');
        const snap = await getDoc(doc(db, "quiz_sets", quizId));
        if (!snap.exists()) { showToast('Không tìm thấy bộ đề trên máy chủ.', 'error'); return; }
        const src = snap.data();
        const newTitle = `${src.title || quizTitle || 'Không tên'} (bản sao)`;
        await addDoc(collection(db, "quiz_sets"), {
            userId: user.uid,
            title: newTitle,
            questions: src.questions || [],
            questionCount: src.questionCount || (src.questions ? src.questions.length : 0),
            folderId: src.folderId ?? null,
            isPublic: src.isPublic === true,
            createdAt: new Date()
        });
        showToast(`Đã tạo "${newTitle}".`, 'success');
        S.isLibraryFullyLoaded = false;   // buộc nạp lại để bộ mới xuất hiện
        await loadAndDisplayLibrary();
    } catch (e) {
        console.error('Lỗi nhân bản bộ đề:', e);
        showToast('Nhân bản thất bại: ' + e.message, 'error');
    }
}

/**
 * Chuyển một bộ đề sang thư mục khác (folderId = null nghĩa là về Thư viện gốc).
 *
 * Cập nhật giao diện TRƯỚC rồi mới ghi Firestore. Kéo-thả mà phải chờ mạng xong mới thấy
 * kết quả thì cảm giác như treo máy — nhất là bản cũ còn ép nạp lại toàn bộ thư viện sau
 * mỗi lần thả. Ghi hỏng thì trả lại chỗ cũ và báo rõ.
 *
 * @param {string} quizId
 * @param {string|null} folderId
 * @param {string} [folderName] tên thư mục đích, để hiện trong thông báo
 */
export async function moveQuizToFolder(quizId, folderId, folderName) {
    const where = folderName ? `"${folderName}"` : 'Thư viện gốc';
    const quiz = S.userQuizSets.find(q => q.id === quizId);

    // Không có trong cache (đang cuốn chiếu) → đi đường cũ: ghi xong rồi nạp lại
    if (!quiz) {
        try {
            S.isLibraryFullyLoaded = false;
            await updateDoc(doc(db, "quiz_sets", quizId), { folderId });
            showToast(`Đã chuyển bộ đề vào ${where}.`, 'success');
            await loadAndDisplayLibrary();
        } catch (err) {
            console.error("Lỗi di chuyển bộ đề:", err);
            showToast('Có lỗi xảy ra khi di chuyển bộ đề!', 'error');
        }
        return;
    }

    const prevFolderId = quiz.folderId ?? null;
    if (prevFolderId === folderId) {
        showToast(`Bộ đề đã nằm trong ${where} rồi.`, 'info');
        return;
    }

    quiz.folderId = folderId;
    rerenderCurrentView();          // thấy kết quả ngay lập tức

    try {
        await updateDoc(doc(db, "quiz_sets", quizId), { folderId });
        persistLibraryCache();   // cache phải khớp RAM, nếu không lần mở sau lại thấy chỗ cũ
        showToast(`Đã chuyển "${quiz.title || 'bộ đề'}" vào ${where}.`, 'success');
    } catch (err) {
        console.error("Lỗi di chuyển bộ đề:", err);
        quiz.folderId = prevFolderId; // hoàn tác
        rerenderCurrentView();
        persistLibraryCache();
        showToast('Không chuyển được bộ đề — đã trả về chỗ cũ.', 'error');
    }
}

// === QUẢN LÝ THƯ MỤC MODAL ===
export function openFolderModal(mode = 'create', folderId = null, folderName = '') {
    S.folderModalMode = mode;
    S.editingFolderId = folderId;

    const modal = document.getElementById('folderModal');
    const title = document.getElementById('folderModalTitle');
    const input = document.getElementById('folderNameInput');

    if (!modal || !title || !input) return;

    title.textContent = mode === 'create' ? 'Tạo thư mục mới' : 'Sửa thư mục';
    input.value = folderName;
    input.classList.remove('border-red-400');

    if (mode === 'create') {
        S.selectedFolderIcon = 'fa-folder';
        S.selectedFolderColor = 'amber';
    } else {
        const folder = S.userFolders.find(f => f.id === folderId);
        if (folder) {
            S.selectedFolderIcon = folder.icon || 'fa-folder';
            S.selectedFolderColor = folder.color || 'amber';
        }
    }

    updateFolderModalPickers();
    modal.classList.remove('hidden');
    input.focus();
}

export function closeFolderModal() {
    const modal = document.getElementById('folderModal');
    if (modal) modal.classList.add('hidden');
}

function updateFolderModalPickers() {
    // Icon có khớp với một mẫu sẵn có không? Nếu không thì là icon tùy chọn.
    const isPresetIcon = !!document.querySelector(`.icon-option[data-icon="${S.selectedFolderIcon}"]`);
    document.querySelectorAll('.icon-option').forEach(btn => {
        const active = btn.getAttribute('data-icon') === S.selectedFolderIcon;
        btn.classList.toggle('bg-pink-100', active);
        btn.classList.toggle('text-pink-600', active);
        btn.classList.toggle('ring-2', active);
        btn.classList.toggle('ring-pink-400', active);
    });
    // Ô nhập tùy chọn: chỉ điền khi đang dùng icon ngoài danh sách mẫu
    const iconInput = document.getElementById('folderIconInput');
    if (iconInput) iconInput.value = isPresetIcon ? '' : (S.selectedFolderIcon || '');

    const isCustomColor = typeof S.selectedFolderColor === 'string' && S.selectedFolderColor.startsWith('#');
    document.querySelectorAll('.color-option').forEach(btn => {
        const active = !isCustomColor && btn.getAttribute('data-color') === S.selectedFolderColor;
        btn.classList.toggle('ring-4', active);
        btn.classList.toggle('ring-offset-2', active);
        btn.classList.toggle('ring-pink-400', active);
    });
    const colorInput = document.getElementById('folderColorInput');
    const textSpan = document.getElementById('folderColorText');
    if (isCustomColor) {
        if (colorInput) colorInput.value = S.selectedFolderColor;
        if (textSpan) textSpan.textContent = S.selectedFolderColor.toUpperCase();
    }
}

// Chọn icon mẫu trong lưới
export function selectFolderIcon(icon) {
    S.selectedFolderIcon = icon || 'fa-folder';
    updateFolderModalPickers();
}

// Đặt icon tùy chọn từ ô nhập (chấp nhận dán nguyên thẻ <i>). Trả về tên icon đã nhận hoặc null.
export function setCustomFolderIcon(rawText) {
    const parsed = parseFontAwesomeIcon(rawText);
    if (parsed) {
        S.selectedFolderIcon = parsed;
        // Đang dùng icon tùy chọn nên bỏ chọn các icon mẫu
        document.querySelectorAll('.icon-option').forEach(btn => {
            btn.classList.remove('bg-pink-100', 'text-pink-600', 'ring-2', 'ring-pink-400');
        });
    }
    return parsed;
}

// Chọn màu mẫu
export function selectFolderColor(color) {
    S.selectedFolderColor = color || 'amber';
    updateFolderModalPickers();
}

// Đặt màu tùy chọn từ bảng chọn màu (#hex)
export function setCustomFolderColor(hex) {
    if (!hex) return;
    S.selectedFolderColor = hex;
    const textSpan = document.getElementById('folderColorText');
    if (textSpan) textSpan.textContent = hex.toUpperCase();
    document.querySelectorAll('.color-option').forEach(btn => {
        btn.classList.remove('ring-4', 'ring-offset-2', 'ring-pink-400');
    });
}

export async function saveFolder() {
    const user = auth.currentUser;
    const input = document.getElementById('folderNameInput');
    if (!user || !input) return;

    const name = input.value.trim();
    if (!name) {
        input.classList.add('border-red-400');
        return;
    }

    const saveBtn = document.getElementById('saveFolderBtn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Đang lưu...';
    }

    try {
        if (S.folderModalMode === 'create') {
            const newDoc = await addDoc(collection(db, "quiz_folders"), {
                userId: user.uid,
                name: name,
                icon: S.selectedFolderIcon,
                color: S.selectedFolderColor,
                createdAt: new Date()
            });
            // Cập nhật ngay vào cache để thư mục mới hiện liền, không cần tải lại trang
            S.userFolders.push({
                id: newDoc.id,
                userId: user.uid,
                name: name,
                icon: S.selectedFolderIcon,
                color: S.selectedFolderColor,
                createdAt: new Date()
            });
            showToast('Đã tạo thư mục thành công!', 'success');
        } else {
            const docRef = doc(db, "quiz_folders", S.editingFolderId);
            await updateDoc(docRef, {
                name: name,
                icon: S.selectedFolderIcon,
                color: S.selectedFolderColor
            });
            // Đồng bộ ngay tên/icon/màu mới vào cache để giao diện tự cập nhật tức thì
            const folder = S.userFolders.find(f => f.id === S.editingFolderId);
            if (folder) {
                folder.name = name;
                folder.icon = S.selectedFolderIcon;
                folder.color = S.selectedFolderColor;
            }
            showToast('Đã cập nhật thư mục thành công!', 'success');
        }
        sortUserFolders();
        closeFolderModal();
        await loadAndDisplayLibrary();
    } catch (err) {
        console.error("Lỗi khi lưu thư mục:", err);
        showToast('Lỗi khi lưu thư mục!', 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Lưu';
        }
    }
}

// Ghim / bỏ ghim thư mục — cập nhật lạc quan rồi đồng bộ Firestore
export async function toggleFolderPin(folderId, pinned) {
    const folder = S.userFolders.find(f => f.id === folderId);
    if (!folder) return;
    folder.pinned = pinned;
    sortUserFolders();
    renderLibrary(S.userQuizSets, S.currentLibraryPage);
    try {
        await updateDoc(doc(db, "quiz_folders", folderId), { pinned });
        showToast(pinned ? 'Đã ghim thư mục lên đầu!' : 'Đã bỏ ghim thư mục.', 'success');
    } catch (err) {
        console.error("Lỗi khi ghim thư mục:", err);
        folder.pinned = !pinned; // hoàn tác
        sortUserFolders();
        renderLibrary(S.userQuizSets, S.currentLibraryPage);
        showToast('Không thể cập nhật ghim thư mục!', 'error');
    }
}

// Đổi màu thư mục ngay trong menu (không cần mở modal)
export async function quickSetFolderColor(folderId, color) {
    const folder = S.userFolders.find(f => f.id === folderId);
    if (!folder) return;
    const prevColor = folder.color;
    folder.color = color;
    renderLibrary(S.userQuizSets, S.currentLibraryPage);
    try {
        await updateDoc(doc(db, "quiz_folders", folderId), { color });
    } catch (err) {
        console.error("Lỗi khi đổi màu thư mục:", err);
        folder.color = prevColor; // hoàn tác
        renderLibrary(S.userQuizSets, S.currentLibraryPage);
        showToast('Không thể đổi màu thư mục!', 'error');
    }
}

// Kéo-thả sắp xếp lại thứ tự thư mục: ghi lại trường order tuần tự cho toàn bộ
export async function reorderFolders(draggedId, targetId) {
    if (draggedId === targetId) return;
    const arr = [...S.userFolders];
    const from = arr.findIndex(f => f.id === draggedId);
    const to = arr.findIndex(f => f.id === targetId);
    if (from < 0 || to < 0) return;

    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);

    // Cập nhật lạc quan trên client
    arr.forEach((f, idx) => { f.order = idx; });
    S.userFolders = arr;
    sortUserFolders();
    renderLibrary(S.userQuizSets, S.currentLibraryPage);

    try {
        await Promise.all(arr.map((f, idx) =>
            updateDoc(doc(db, "quiz_folders", f.id), { order: idx })
        ));
    } catch (err) {
        console.error("Lỗi khi sắp xếp lại thư mục:", err);
        showToast('Không thể lưu thứ tự thư mục mới!', 'error');
    }
}

export async function confirmDeleteFolder(folderId) {
    const folder = S.userFolders.find(f => f.id === folderId);
    const name = folder ? folder.name : 'thư mục';
    const count = S.userQuizSets.filter(q => q.folderId === folderId).length;

    const msg = count > 0
        ? `Thư mục "${name}" cùng ${count} bộ đề bên trong sẽ được chuyển vào thùng rác và tự động xóa vĩnh viễn sau 30 ngày. Bạn có thể khôi phục cả thư mục lẫn bộ đề trước đó.`
        : `Thư mục "${name}" sẽ được chuyển vào thùng rác và tự động xóa vĩnh viễn sau 30 ngày. Bạn có thể khôi phục bất cứ lúc nào trước đó.`;

    const ok = await showConfirm(msg, {
        title: 'Chuyển thư mục vào thùng rác?', confirmText: 'Vào thùng rác', cancelText: 'Hủy', tone: 'danger'
    });
    if (!ok) return;

    try {
        const user = auth.currentUser;
        if (!user) throw new Error("Người dùng chưa đăng nhập.");
        const now = new Date();

        // 1. Chuyển các bộ đề bên trong vào thùng rác kèm theo (đánh dấu để khôi phục cùng thư mục)
        const q = query(collection(db, "quiz_sets"), where("userId", "==", user.uid), where("folderId", "==", folderId));
        const snapshot = await getDocs(q);
        const toTrash = snapshot.docs.filter(docSnap => !docSnap.data().deleted);
        if (toTrash.length) {
            try {
                await Promise.all(toTrash.map(docSnap =>
                    updateDoc(docSnap.ref, { deleted: true, deletedAt: now, trashedWithFolder: folderId })
                ));
            } catch (updateErr) {
                console.error("Lỗi khi chuyển bộ đề vào thùng rác:", updateErr);
                throw new Error("Không thể chuyển bộ đề vào thùng rác (Lỗi phân quyền quiz_sets).");
            }
        }

        // 2. Chuyển thư mục vào thùng rác
        try {
            await updateDoc(doc(db, "quiz_folders", folderId), { deleted: true, deletedAt: now });
        } catch (deleteErr) {
            console.error("Lỗi khi chuyển thư mục vào thùng rác:", deleteErr);
            throw new Error("Lỗi phân quyền Firestore khi cập nhật thư mục (quiz_folders).");
        }

        // 3. Cập nhật cache để ẩn ngay
        S.userFolders = S.userFolders.filter(f => f.id !== folderId);
        S.userQuizSets = S.userQuizSets.filter(q => q.folderId !== folderId);
        if (S.currentFolderId === folderId) S.currentFolderId = null;

        showToast('Đã chuyển thư mục vào thùng rác.', 'success');
        renderBreadcrumb();
        renderLibrary(S.userQuizSets, S.currentLibraryPage);
    } catch (err) {
        console.error("Lỗi khi xóa thư mục:", err);
        showToast(err.message || 'Chuyển thư mục vào thùng rác thất bại!', 'error');
    }
}

// === DI CHUYỂN BỘ ĐỀ (MOVE QUIZ) ===
export function openMoveQuizModal(quizId) {
    S.movingQuizId = quizId;
    const modal = document.getElementById('moveQuizModal');
    const select = document.getElementById('folderSelect');

    if (!modal || !select) return;

    select.innerHTML = '<option value="">(Thư viện gốc - không thư mục)</option>';
    S.userFolders.forEach(folder => {
        const option = document.createElement('option');
        option.value = folder.id;
        option.textContent = folder.name;
        select.appendChild(option);
    });

    if (!S.isBulkMoving) {
        const quiz = S.userQuizSets.find(q => q.id === quizId);
        if (quiz) {
            select.value = quiz.folderId || '';
        }
    }

    modal.classList.remove('hidden');
}

export function closeMoveQuizModal() {
    const modal = document.getElementById('moveQuizModal');
    if (modal) modal.classList.add('hidden');
}

export async function confirmMoveQuiz() {
    const select = document.getElementById('folderSelect');
    if (!select) return;
    const targetFolderId = select.value || null;

    const confirmBtn = document.getElementById('confirmMoveQuizBtn');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Đang di chuyển...';
    }

    const targetName = targetFolderId
        ? (S.userFolders.find(f => f.id === targetFolderId) || {}).name
        : null;

    try {
        if (S.isBulkMoving) {
            const ids = [...S.selectedQuizIds];
            await Promise.all(ids.map(id => updateDoc(doc(db, "quiz_sets", id), { folderId: targetFolderId })));
            // Cập nhật thẳng trong RAM thay vì nạp lại cả thư viện từ server
            ids.forEach(id => {
                const q = S.userQuizSets.find(x => x.id === id);
                if (q) q.folderId = targetFolderId;
            });
            persistLibraryCache();
            showToast(`Đã di chuyển ${ids.length} bộ đề!`, 'success');
            exitSelectionMode();   // đã tự vẽ lại từ RAM
        } else {
            await moveQuizToFolder(S.movingQuizId, targetFolderId, targetName);
        }
        closeMoveQuizModal();
    } catch (err) {
        console.error("Lỗi di chuyển bộ đề:", err);
        showToast('Có lỗi xảy ra khi di chuyển!', 'error');
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Xác nhận';
        }
    }
}

export function handleBulkMove() {
    if (S.selectedQuizIds.length === 0) {
        showToast('Vui lòng chọn ít nhất một bộ đề để di chuyển!', 'warning');
        return;
    }
    S.isBulkMoving = true;
    openMoveQuizModal(null);
}

export async function handleBulkDelete() {
    if (S.selectedQuizIds.length === 0) {
        showToast('Vui lòng chọn ít nhất một bộ đề để xóa!', 'warning');
        return;
    }
    const ok = await showConfirm(
        `${S.selectedQuizIds.length} bộ đề đã chọn sẽ được chuyển vào thùng rác và tự động xóa vĩnh viễn sau 30 ngày. Bạn có thể khôi phục trước đó.`,
        { title: 'Chuyển vào thùng rác?', confirmText: 'Vào thùng rác', cancelText: 'Hủy', tone: 'danger' }
    );
    if (!ok) return;
    try {
        const now = new Date();
        const ids = [...S.selectedQuizIds];
        await Promise.all(ids.map(id => updateDoc(doc(db, "quiz_sets", id), { deleted: true, deletedAt: now })));
        S.userQuizSets = S.userQuizSets.filter(q => !ids.includes(q.id)); // cập nhật cache
        showToast(`Đã chuyển ${ids.length} bộ đề vào thùng rác.`, 'success');
        exitSelectionMode(); // sẽ render lại thư viện
    } catch (e) {
        showToast("Không thể chuyển vào thùng rác! Lỗi: " + e.message, 'error');
        console.error("Lỗi khi xóa hàng loạt bộ đề: ", e);
    }
}

export function handleBulkShare() {
    if (S.selectedQuizIds.length === 0) {
        showToast('Vui lòng chọn ít nhất một bộ đề để chia sẻ!', 'warning');
        return;
    }

    const links = S.selectedQuizIds.map(id => {
        const quiz = S.userQuizSets.find(q => q.id === id);
        const title = quiz ? quiz.title : 'Bộ đề';
        const quizUrl = new URL(`api/share-quiz?id=${id}&t=${Date.now()}`, window.location.origin).href;
        return `${title}: ${quizUrl}`;
    }).join('\n');

    navigator.clipboard.writeText(links)
        .then(() => {
            showToast(`Đã copy link của ${S.selectedQuizIds.length} bộ đề vào clipboard!`, 'success');
            exitSelectionMode();
        })
        .catch(() => showToast('Không thể sao chép liên kết!', 'error'));
}

// === CHẾ ĐỘ CHỌN NHIỀU (SELECTION MODE) ===

/**
 * Chọn tất cả bộ đề trong khung nhìn hiện tại (mọi trang của thư mục/tìm kiếm).
 */
export async function selectAllInView() {
    if (!S.isSelectionMode) S.isSelectionMode = true;
    // "Chọn tất cả" cần toàn bộ dữ liệu (chọn xuyên trang) → nạp đầy đủ nếu đang cuốn chiếu
    if (!S.isLibraryFullyLoaded) await ensureFullLibraryLoaded();
    const ids = getFilteredQuizzesForView().map(q => q.id);
    S.selectedQuizIds = Array.from(new Set(ids));
    rerenderCurrentView();
    updateBulkActionsToolbar();
}

/**
 * Bỏ chọn toàn bộ nhưng vẫn ở trong chế độ chọn nhiều.
 */
export function deselectAllInView() {
    S.selectedQuizIds = [];
    rerenderCurrentView();
    updateBulkActionsToolbar();
}

export function exitSelectionMode() {
    S.isSelectionMode = false;
    S.selectedQuizIds = [];
    updateBulkActionsToolbar();
    loadAndDisplayLibrary();
}

export function updateBulkActionsToolbar() {
    const toolbar = document.getElementById('bulk-actions-toolbar');
    const countLabel = document.getElementById('bulk-select-count');
    const toggleBtn = document.getElementById('bulk-select-toggle-btn');
    const count = S.selectedQuizIds.length;

    // Đồng bộ nút "Chọn nhiều" cho cả 2 lối vào: bấm nút và nhấn giữ (long-press)
    if (toggleBtn) {
        if (S.isSelectionMode) {
            toggleBtn.classList.remove('bg-gray-100', 'text-gray-700');
            toggleBtn.classList.add('bg-pink-100', 'text-pink-700', 'border', 'border-pink-300');
            toggleBtn.innerHTML = '<i class="fas fa-check-circle text-xs"></i> <span>Xong</span>';
            toggleBtn.setAttribute('title', 'Thoát chế độ chọn nhiều');
        } else {
            toggleBtn.classList.remove('bg-pink-100', 'text-pink-700', 'border', 'border-pink-300');
            toggleBtn.classList.add('bg-gray-100', 'text-gray-700');
            toggleBtn.innerHTML = '<i class="fas fa-tasks text-xs"></i> <span>Chọn nhiều</span>';
            toggleBtn.setAttribute('title', 'Chọn nhiều bộ đề để thao tác đồng loạt');
        }
    }

    if (!toolbar) return;

    // Hiện thanh tác vụ ngay khi vào chế độ chọn (kể cả khi chưa chọn gì)
    if (S.isSelectionMode) {
        toolbar.classList.remove('translate-y-28', 'opacity-0', 'pointer-events-none');
        toolbar.classList.add('translate-y-0', 'opacity-100');
    } else {
        toolbar.classList.remove('translate-y-0', 'opacity-100');
        toolbar.classList.add('translate-y-28', 'opacity-0', 'pointer-events-none');
    }

    if (countLabel) {
        countLabel.innerHTML = `<i class="fas fa-check-square mr-1.5"></i> Đã chọn: ${count} bộ đề`;
    }

    // Vô hiệu hoá các nút thao tác khi chưa chọn bộ đề nào
    ['bulk-move-btn', 'bulk-share-btn', 'bulk-delete-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.disabled = count === 0;
        btn.classList.toggle('opacity-50', count === 0);
        btn.classList.toggle('cursor-not-allowed', count === 0);
    });
}

// === CHIA SẺ BỘ ĐỀ (SHARE QUIZ) ===
export function openShareQuizModal(quizId, quizTitle) {
    const modal = document.getElementById('shareQuizModal');
    const heading = document.querySelector('#share-modal-heading span');
    const titleEl = document.getElementById('share-quiz-title');
    const linkInput = document.getElementById('share-link-input');
    const embedInput = document.getElementById('share-embed-input');
    const embedSection = document.getElementById('share-embed-section');

    if (!modal || !titleEl || !linkInput || !embedInput) return;

    // Modal dùng chung với chia sẻ thư mục → trả lại nguyên trạng cho chế độ bộ đề
    if (heading) heading.textContent = 'Chia sẻ bộ đề';
    if (embedSection) embedSection.classList.remove('hidden');
    titleEl.textContent = quizTitle;

    const quizUrl = new URL(`api/share-quiz?id=${quizId}&t=${Date.now()}`, window.location.origin).href;
    linkInput.value = quizUrl;
    embedInput.value = `<iframe src="${quizUrl}" width="100%" height="600px" style="border:none; border-radius:12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);"></iframe>`;

    // Tạo và hiển thị mã QR động
    const qrImg = document.getElementById('share-qr-img');
    if (qrImg) {
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(quizUrl)}`;
    }

    bindQuickShareButtons(quizUrl, quizTitle, `Hãy cùng làm bài kiểm tra "${quizTitle}" trên Zitthenkne nhé!`);
    modal.classList.remove('hidden');
}

export function closeShareQuizModal() {
    const modal = document.getElementById('shareQuizModal');
    if (modal) modal.classList.add('hidden');
}

// Dải thư mục cuộn ngang: đang kéo bộ đề mà đích nằm ngoài khung nhìn thì không thả tới được.
// Rê con trỏ sát mép trái/phải của dải → tự cuộn để với tới thư mục ở xa.
function initFolderStripAutoScroll() {
    const strip = document.getElementById('folders-container');
    if (!strip || strip.dataset.autoscrollBound) return;
    strip.dataset.autoscrollBound = '1';

    const EDGE = 70;   // vùng nhạy ở mỗi mép (px)
    const SPEED = 18;  // px mỗi lần dragover bắn ra

    strip.addEventListener('dragover', (e) => {
        e.preventDefault();
        const r = strip.getBoundingClientRect();
        if (e.clientX < r.left + EDGE) strip.scrollLeft -= SPEED;
        else if (e.clientX > r.right - EDGE) strip.scrollLeft += SPEED;
    });
}

// Dải thư mục nằm ở ĐẦU trang, còn bộ đề trải dài xuống dưới: cầm một thẻ ở cuối danh sách
// thì đích thả nằm ngoài khung nhìn. Kéo native không tự cuộn trang trên mọi trình duyệt,
// nên tự cuộn khi con trỏ áp sát mép trên/dưới.
function initPageAutoScrollWhileDragging() {
    if (document.body.dataset.pageAutoscrollBound) return;
    document.body.dataset.pageAutoscrollBound = '1';

    const EDGE = 90;
    const SPEED = 22;

    document.addEventListener('dragover', (e) => {
        if (!document.body.classList.contains('is-dragging-quiz')) return;
        if (e.clientY < EDGE) window.scrollBy(0, -SPEED);
        else if (e.clientY > window.innerHeight - EDGE) window.scrollBy(0, SPEED);
    });

    // Thả ra ngoài vùng hợp lệ (hoặc bấm Esc) vẫn phải tắt trạng thái "đang kéo"
    document.addEventListener('dragend', () => document.body.classList.remove('is-dragging-quiz'));
    document.addEventListener('drop', () => document.body.classList.remove('is-dragging-quiz'));
}

export function initDragAndDropBreadcrumb() {
    initFolderStripAutoScroll();
    initPageAutoScrollWhileDragging();
    const folderBreadcrumb = document.getElementById('folder-breadcrumb');
    if (folderBreadcrumb) {
        folderBreadcrumb.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });
        folderBreadcrumb.addEventListener('dragenter', (e) => {
            e.preventDefault();
            folderBreadcrumb.classList.add('border-pink-500', 'bg-pink-50/50');
        });
        folderBreadcrumb.addEventListener('dragleave', () => {
            folderBreadcrumb.classList.remove('border-pink-500', 'bg-pink-50/50');
        });
        folderBreadcrumb.addEventListener('drop', async (e) => {
            e.preventDefault();
            folderBreadcrumb.classList.remove('border-pink-500', 'bg-pink-50/50');
            document.body.classList.remove('is-dragging-quiz');
            const quizId = e.dataTransfer.getData('text/plain');
            if (!quizId) return;
            await moveQuizToFolder(quizId, null);
        });
    }
}

// === THAO TÁC TRÊN CẢ THƯ MỤC (chia sẻ / công khai / dọn thư mục) ===

// Lấy toàn bộ bộ đề thuộc một thư mục. Thư viện có thể đang tải cuốn chiếu nên phải
// bảo đảm đã nạp đủ, nếu không sẽ thao tác thiếu bộ đề mà người dùng không hay biết.
async function getQuizzesInFolder(folderId) {
    if (!S.isLibraryFullyLoaded) await ensureFullLibraryLoaded();
    return S.userQuizSets.filter(q => q.folderId === folderId);
}

// Đường dẫn chia sẻ của một thư mục
function folderShareUrl(folderId) {
    return new URL(`features/quiz/folder.html?id=${folderId}`, window.location.origin).href;
}

/**
 * Công khai / riêng tư CẢ THƯ MỤC.
 * Đặt cờ isPublic lên chính thư mục VÀ lên mọi bộ đề bên trong — link thư mục sẽ vô nghĩa
 * nếu bộ đề bên trong vẫn riêng tư (người nhận mở ra chỉ thấy thư mục trống).
 */
export async function toggleFolderPublic(folderId, makePublic, { skipConfirm = false } = {}) {
    const folder = S.userFolders.find(f => f.id === folderId);
    const name = folder ? folder.name : 'thư mục';
    const quizzes = await getQuizzesInFolder(folderId);

    if (!skipConfirm) {
        const ok = await showConfirm(
            makePublic
                ? `Thư mục "${name}" và ${quizzes.length} bộ đề bên trong sẽ CÔNG KHAI: ai có link đều mở và làm được.`
                : `Thư mục "${name}" và ${quizzes.length} bộ đề bên trong sẽ về RIÊNG TƯ: link đã chia sẻ trước đó sẽ không mở được nữa.`,
            {
                title: makePublic ? 'Công khai cả thư mục?' : 'Chuyển về riêng tư?',
                confirmText: makePublic ? 'Công khai' : 'Riêng tư',
                cancelText: 'Hủy',
                tone: makePublic ? 'primary' : 'danger'
            }
        );
        if (!ok) return false;
    }

    try {
        await updateDoc(doc(db, "quiz_folders", folderId), { isPublic: makePublic });
        if (folder) folder.isPublic = makePublic;

        // Đồng bộ trạng thái cho từng bộ đề bên trong (bỏ qua cái đã đúng trạng thái)
        const needUpdate = quizzes.filter(q => (q.isPublic === true) !== makePublic);
        await Promise.all(needUpdate.map(q => updateDoc(doc(db, "quiz_sets", q.id), { isPublic: makePublic })));
        needUpdate.forEach(q => { q.isPublic = makePublic; });
        persistLibraryCache();

        showToast(makePublic
            ? `Đã công khai "${name}" cùng ${quizzes.length} bộ đề bên trong.`
            : `Đã chuyển "${name}" về riêng tư.`, 'success');
        rerenderCurrentView();
        return true;
    } catch (e) {
        console.error("Lỗi đổi chế độ công khai thư mục:", e);
        showToast("Đổi chế độ công khai thất bại: " + e.message, 'error');
        return false;
    }
}

/**
 * Mở hộp chia sẻ cho CẢ THƯ MỤC (dùng chung modal với chia sẻ bộ đề).
 * Thư mục còn riêng tư thì hỏi công khai trước — chia sẻ link của thư mục riêng tư
 * chỉ làm người nhận thấy trang báo lỗi.
 */
export async function openShareFolderModal(folderId, folderName) {
    const folder = S.userFolders.find(f => f.id === folderId);
    if (folder && folder.isPublic !== true) {
        const ok = await toggleFolderPublic(folderId, true);
        if (!ok) return;
    }

    const modal = document.getElementById('shareQuizModal');
    const heading = document.querySelector('#share-modal-heading span');
    const titleEl = document.getElementById('share-quiz-title');
    const linkInput = document.getElementById('share-link-input');
    const embedSection = document.getElementById('share-embed-section');
    if (!modal || !titleEl || !linkInput) return;

    const quizzes = await getQuizzesInFolder(folderId);
    const url = folderShareUrl(folderId);

    if (heading) heading.textContent = 'Chia sẻ thư mục';
    titleEl.innerHTML = `<i class="fas fa-folder-open text-amber-400 mr-1.5"></i>${escapeHtml(folderName)}
        <span class="block text-[11px] font-semibold text-gray-400 mt-0.5">${quizzes.length} bộ đề bên trong</span>`;
    linkInput.value = url;
    if (embedSection) embedSection.classList.add('hidden'); // nhúng iframe chỉ hợp với bộ đề

    const qrImg = document.getElementById('share-qr-img');
    if (qrImg) qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(url)}`;

    bindQuickShareButtons(url, folderName, `Mình chia sẻ thư mục đề "${folderName}" trên Zitthenkne nhé!`);
    modal.classList.remove('hidden');
}

/**
 * Đưa toàn bộ bộ đề trong thư mục ra Thư viện gốc (thư mục vẫn còn, chỉ trống đi).
 * Khác với xóa thư mục: không có gì vào thùng rác.
 */
export async function moveAllQuizzesOutOfFolder(folderId) {
    const folder = S.userFolders.find(f => f.id === folderId);
    const name = folder ? folder.name : 'thư mục';
    const quizzes = await getQuizzesInFolder(folderId);
    if (!quizzes.length) {
        showToast(`Thư mục "${name}" đang trống.`, 'info');
        return;
    }

    const ok = await showConfirm(
        `${quizzes.length} bộ đề trong "${name}" sẽ chuyển ra Thư viện gốc. Thư mục vẫn giữ nguyên, chỉ trống đi.`,
        { title: 'Đưa hết bộ đề ra ngoài?', confirmText: 'Đưa ra ngoài', cancelText: 'Hủy' }
    );
    if (!ok) return;

    try {
        await Promise.all(quizzes.map(q => updateDoc(doc(db, "quiz_sets", q.id), { folderId: null })));
        quizzes.forEach(q => { q.folderId = null; });
        persistLibraryCache();
        showToast(`Đã đưa ${quizzes.length} bộ đề ra Thư viện gốc.`, 'success');
        rerenderCurrentView();
    } catch (e) {
        console.error("Lỗi đưa bộ đề ra khỏi thư mục:", e);
        showToast("Không thể đưa bộ đề ra ngoài: " + e.message, 'error');
    }
}

// Gán 3 nút chia sẻ nhanh (Messenger / Facebook / app hệ thống) cho một đường dẫn bất kỳ.
// Tách riêng để chia sẻ bộ đề và chia sẻ thư mục dùng chung.
function bindQuickShareButtons(url, title, text) {
    const messengerBtn = document.getElementById('share-messenger-btn');
    const facebookBtn = document.getElementById('share-facebook-btn');
    const systemBtn = document.getElementById('share-system-btn');

    if (messengerBtn) {
        messengerBtn.onclick = () => {
            const fbSendUrl = `https://www.facebook.com/dialog/send?app_id=966242223397117&link=${encodeURIComponent(url)}&redirect_uri=${encodeURIComponent(url)}`;
            window.open(fbSendUrl, '_blank', 'width=600,height=500');
        };
    }
    if (facebookBtn) {
        facebookBtn.onclick = () => {
            window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank', 'width=600,height=500');
        };
    }
    if (systemBtn) {
        if (navigator.share) {
            systemBtn.classList.remove('hidden');
            systemBtn.onclick = () => {
                navigator.share({ title, text, url }).catch(err => console.error('Lỗi chia sẻ hệ thống:', err));
            };
        } else {
            systemBtn.classList.add('hidden');
        }
    }
}
