// File: features/quiz/library/library-actions.js
// Các thao tác của thư viện: xóa/đổi tên bộ đề, modal thư mục (tạo/sửa/icon/màu),
// ghim/đổi màu/sắp xếp/xóa thư mục, di chuyển bộ đề, chọn nhiều & thao tác hàng loạt, chia sẻ.
// Tách từ quiz-library-controller.js — logic giữ nguyên, chỉ đổi truy cập trạng thái sang S.xxx.

import { auth, db } from '../../../core/firebase-init.js';
import { doc, collection, query, where, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
// Ghi không treo khi mất mạng (xem core/offline-write.js)
import { updateDocQ as updateDoc, setDocQ } from "../../../core/offline-write.js";
import { sessionUser } from '../../../core/auth-session.js';
import { showToast, showConfirm } from '../../../core/utils.js';
import { S } from './library-state.js';
import {
    sortUserFolders, parseFontAwesomeIcon, escapeHtml, FOLDER_COLOR_HEX,
    folderById, folderHex, parentIdOf, quizFolderOf, childFolders, subtreeIds, folderPath,
    folderStats, canMoveFolderInto
} from './library-helpers.js';
import { renderLibrary, renderBreadcrumb, rerenderCurrentView, getFilteredQuizzesForView } from './library-render.js';
import { loadAndDisplayLibrary, ensureFullLibraryLoaded, persistLibraryCache, persistFoldersCache } from './library-data.js';

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
    const user = sessionUser();
    if (!user) { showToast('Vui lòng đăng nhập.', 'info'); return; }
    try {
        showToast('Đang nhân bản…', 'info');
        const snap = await getDoc(doc(db, "quiz_sets", quizId));
        if (!snap.exists()) { showToast('Không tìm thấy bộ đề trên máy chủ.', 'error'); return; }
        const src = snap.data();
        let questions = src.questions || [];
        if (!Array.isArray(questions) || questions.length === 0) {
            try {
                const pSnap = await getDoc(doc(db, "quiz_payloads", quizId));
                if (pSnap.exists() && Array.isArray(pSnap.data().questions)) {
                    questions = pSnap.data().questions;
                }
            } catch (_) {}
        }
        const newTitle = `${src.title || quizTitle || 'Không tên'} (bản sao)`;
        // Bản C9: id tạo ngay trên máy + ghi xếp hàng (addDoc treo tới khi có mạng → nhân đôi lúc mất mạng đứng ở "Đang nhân bản…" mãi)
        const newDocRef = doc(collection(db, "quiz_sets"));
        await setDocQ(newDocRef, {
            userId: user.uid,
            title: newTitle,
            questions: questions,
            questionCount: src.questionCount || (questions ? questions.length : 0),
            folderId: src.folderId ?? null,
            isPublic: src.isPublic === true,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        setDocQ(doc(db, "quiz_payloads", newDocRef.id), {
            userId: user.uid,
            isPublic: src.isPublic === true,
            questions: questions,
            updatedAt: new Date()
        }).catch(() => {});
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
    if (quizFolderOf(quiz) === folderId) {
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
export function openFolderModal(mode = 'create', folderId = null, folderName = '', parentId) {
    S.folderModalMode = mode;
    S.editingFolderId = folderId;
    // Thư mục mới nằm trong đâu: chỉ định rõ (menu "Tạo thư mục con") hoặc ngay cấp đang mở
    S.newFolderParentId = mode === 'create' ? (parentId !== undefined ? parentId : S.currentFolderId) || null : null;

    const modal = document.getElementById('folderModal');
    const title = document.getElementById('folderModalTitle');
    const input = document.getElementById('folderNameInput');

    if (!modal || !title || !input) return;

    const parentFolder = folderById(S.newFolderParentId);
    title.textContent = mode === 'create'
        ? (parentFolder ? `Tạo thư mục trong "${parentFolder.name}"` : 'Tạo thư mục mới')
        : 'Sửa thư mục';
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

    // Xem trước: tai ghi số bộ đề THẬT của thư mục (tạo mới = trống), gõ tên là cập nhật ngay
    const preview = document.getElementById('folder-modal-preview');
    if (preview) {
        const n = mode === 'edit' ? folderStats(folderId).quizCount : 0;
        preview.dataset.tab = n ? `${n} bộ đề` : 'Trống';
        preview.dataset.fill = n === 0 ? '0' : n === 1 ? '1' : n < 5 ? '2' : '3';
        const folder = mode === 'edit' ? S.userFolders.find(f => f.id === folderId) : null;
        preview.classList.toggle('is-pinned', !!(folder && folder.pinned));
    }
    if (!input.dataset.previewBound) {
        input.addEventListener('input', updateFolderPreview);
        input.dataset.previewBound = '1';
    }

    updateFolderModalPickers();
    modal.classList.remove('hidden');
    input.focus();
}

// Vẽ lại thẻ xem trước trong hộp Tạo/Sửa thư mục theo tên / icon / màu đang chọn
function updateFolderPreview() {
    const card = document.getElementById('folder-modal-preview');
    if (!card) return;
    const c = S.selectedFolderColor || 'amber';
    card.style.setProperty('--fc', c.startsWith('#') ? c : (FOLDER_COLOR_HEX[c] || FOLDER_COLOR_HEX.amber));
    const icon = card.querySelector('.folder-icon-wrapper i');
    if (icon) icon.className = `fas ${S.selectedFolderIcon || 'fa-folder'}`;
    const name = card.querySelector('.fd-name');
    const typed = (document.getElementById('folderNameInput') || {}).value;
    if (name) name.textContent = (typed || '').trim() || 'Tên thư mục';
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
    updateFolderPreview();
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
        updateFolderPreview();
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
    updateFolderPreview();
}

export async function saveFolder() {
    const user = sessionUser();
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
            const parentId = S.newFolderParentId || null;
            const newDoc = doc(collection(db, "quiz_folders"));
            await setDocQ(newDoc, {
                userId: user.uid,
                name: name,
                icon: S.selectedFolderIcon,
                color: S.selectedFolderColor,
                parentId,
                createdAt: new Date()
            });
            // Cập nhật ngay vào cache để thư mục mới hiện liền, không cần tải lại trang
            S.userFolders.push({
                id: newDoc.id,
                userId: user.uid,
                name: name,
                icon: S.selectedFolderIcon,
                color: S.selectedFolderColor,
                parentId,
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
        persistFoldersCache();
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
        persistFoldersCache();
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
        persistFoldersCache();
    } catch (err) {
        console.error("Lỗi khi đổi màu thư mục:", err);
        folder.color = prevColor; // hoàn tác
        renderLibrary(S.userQuizSets, S.currentLibraryPage);
        showToast('Không thể đổi màu thư mục!', 'error');
    }
}

// Kéo-thả sắp xếp lại thứ tự thư mục: đặt `draggedId` ngay TRƯỚC/SAU `targetId`.
// Thư mục đích ở cấp khác thì thư mục kéo theo vào đúng cấp đó. Chỉ ghi những thư mục đổi thứ tự.
export async function reorderFolders(draggedId, targetId, place = 'before') {
    if (draggedId === targetId) return;
    const moved = folderById(draggedId);
    const targetParent = parentIdOf(folderById(targetId));
    if (!moved || !folderById(targetId)) return;
    const parentChanged = parentIdOf(moved) !== targetParent;
    if (parentChanged && !canMoveFolderInto(draggedId, targetParent)) {
        showToast('Không thể chuyển thư mục vào chính nó hoặc thư mục con của nó.', 'warning');
        return;
    }
    const arr = S.userFolders.filter(f => f.id !== draggedId);
    const t = arr.findIndex(f => f.id === targetId);
    arr.splice(place === 'after' ? t + 1 : t, 0, moved);

    // Cập nhật lạc quan trên client
    const writes = [];
    arr.forEach((f, idx) => {
        const patch = {};
        if (f.order !== idx) { f.order = idx; patch.order = idx; }
        if (parentChanged && f.id === draggedId) { f.parentId = targetParent; patch.parentId = targetParent; }
        if (Object.keys(patch).length) writes.push(updateDoc(doc(db, "quiz_folders", f.id), patch));
    });
    S.userFolders = arr;
    sortUserFolders();
    persistFoldersCache();
    renderLibrary(S.userQuizSets, S.currentLibraryPage);

    try {
        await Promise.all(writes);
    } catch (err) {
        console.error("Lỗi khi sắp xếp lại thư mục:", err);
        showToast('Không thể lưu thứ tự thư mục mới!', 'error');
    }
}

export async function confirmDeleteFolder(folderId) {
    const folder = folderById(folderId);
    const name = folder ? folder.name : 'thư mục';
    if (!S.isLibraryFullyLoaded) await ensureFullLibraryLoaded();   // đủ dữ liệu mới đếm/xoá đúng
    const ids = subtreeIds(folderId);
    const subIds = [...ids].filter(id => id !== folderId);
    const inside = S.userQuizSets.filter(q => ids.has(quizFolderOf(q)));
    const parts = [];
    if (subIds.length) parts.push(`${subIds.length} thư mục con`);
    if (inside.length) parts.push(`${inside.length} bộ đề`);

    const msg = parts.length
        ? `Thư mục "${name}" cùng ${parts.join(' và ')} bên trong sẽ được chuyển vào thùng rác và tự động xóa vĩnh viễn sau 30 ngày. Khôi phục thư mục là khôi phục lại tất cả.`
        : `Thư mục "${name}" sẽ được chuyển vào thùng rác và tự động xóa vĩnh viễn sau 30 ngày. Bạn có thể khôi phục bất cứ lúc nào trước đó.`;

    const ok = await showConfirm(msg, {
        title: 'Chuyển thư mục vào thùng rác?', confirmText: 'Vào thùng rác', cancelText: 'Hủy', tone: 'danger'
    });
    if (!ok) return;

    try {
        const user = sessionUser();
        if (!user) throw new Error("Người dùng chưa đăng nhập.");
        const now = new Date();

        // 1. Bộ đề + thư mục con trong cả nhánh vào thùng rác kèm theo (đánh dấu để khôi phục cùng thư mục)
        try {
            await Promise.all([
                ...inside.map(q => updateDoc(doc(db, "quiz_sets", q.id), { deleted: true, deletedAt: now, trashedWithFolder: folderId })),
                ...subIds.map(id => updateDoc(doc(db, "quiz_folders", id), { deleted: true, deletedAt: now, trashedWithFolder: folderId }))
            ]);
        } catch (updateErr) {
            console.error("Lỗi khi chuyển nội dung thư mục vào thùng rác:", updateErr);
            throw new Error("Không thể chuyển nội dung thư mục vào thùng rác.");
        }

        // 2. Chuyển thư mục vào thùng rác
        try {
            await updateDoc(doc(db, "quiz_folders", folderId), { deleted: true, deletedAt: now });
        } catch (deleteErr) {
            console.error("Lỗi khi chuyển thư mục vào thùng rác:", deleteErr);
            throw new Error("Lỗi phân quyền Firestore khi cập nhật thư mục (quiz_folders).");
        }

        // 3. Cập nhật cache để ẩn ngay; đang đứng trong nhánh vừa xoá thì lùi về thư mục cha của nó
        const parent = parentIdOf(folder);
        const trashedQuizIds = new Set(inside.map(q => q.id));
        S.userFolders = S.userFolders.filter(f => !ids.has(f.id));
        S.userQuizSets = S.userQuizSets.filter(q => !trashedQuizIds.has(q.id));
        if (ids.has(S.currentFolderId)) S.currentFolderId = parent;
        persistFoldersCache();
        persistLibraryCache();

        showToast('Đã chuyển thư mục vào thùng rác.', 'success');
        renderBreadcrumb();
        renderLibrary(S.userQuizSets, S.currentLibraryPage);
    } catch (err) {
        console.error("Lỗi khi xóa thư mục:", err);
        showToast(err.message || 'Chuyển thư mục vào thùng rác thất bại!', 'error');
    }
}

// === CHUYỂN ĐẾN… (bộ đề lẻ / nhiều bộ đề / cả thư mục) ===
// Một hộp dùng chung: cây thư mục thụt lề theo cấp, CHẠM MỘT LẦN là chuyển (bỏ bước "Xác nhận").
// Bản cũ hỏng hẳn: markup đã đổi sang #folder-list-choices nhưng JS vẫn tìm <select id="folderSelect">
// → nút "Di chuyển" (lẻ lẫn hàng loạt) bấm không có phản ứng gì.
let moveCtx = null; // { kind: 'quiz' | 'bulk' | 'folder', ids: string[] }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && moveCtx) closeMoveQuizModal(); });

export function openMoveQuizModal(quizId) {
    openMoveDialog({ kind: 'quiz', ids: [quizId] });
}

export function handleBulkMove() {
    if (S.selectedQuizIds.length === 0) {
        showToast('Vui lòng chọn ít nhất một bộ đề để di chuyển!', 'warning');
        return;
    }
    openMoveDialog({ kind: 'bulk', ids: [...S.selectedQuizIds] });
}

export function openMoveFolderModal(folderId) {
    openMoveDialog({ kind: 'folder', ids: [folderId] });
}

export function closeMoveQuizModal() {
    const modal = document.getElementById('moveQuizModal');
    if (modal) modal.classList.add('hidden');
    moveCtx = null;
}

function openMoveDialog(ctx) {
    const modal = document.getElementById('moveQuizModal');
    if (!modal || !document.getElementById('folder-list-choices')) return;
    moveCtx = ctx;
    const titleEl = document.getElementById('move-modal-title');
    const subEl = document.getElementById('move-modal-sub');
    if (ctx.kind === 'folder') {
        const f = folderById(ctx.ids[0]);
        if (titleEl) titleEl.textContent = 'Chuyển thư mục';
        if (subEl) subEl.textContent = `"${(f && f.name) || 'Thư mục'}" — chạm vào nơi muốn chuyển đến.`;
    } else if (ctx.kind === 'bulk') {
        if (titleEl) titleEl.textContent = `Chuyển ${ctx.ids.length} bộ đề`;
        if (subEl) subEl.textContent = 'Chạm vào nơi muốn chuyển đến.';
    } else {
        const q = S.userQuizSets.find(x => x.id === ctx.ids[0]);
        if (titleEl) titleEl.textContent = 'Chuyển bộ đề';
        if (subEl) subEl.textContent = `"${(q && q.title) || 'Bộ đề'}" — chạm vào nơi muốn chuyển đến.`;
    }
    const search = document.getElementById('move-modal-search');
    if (search) {
        search.value = '';
        search.classList.toggle('hidden', S.userFolders.length < 7); // ít thư mục thì khỏi ô tìm
        search.oninput = () => renderMoveTree(search.value);
    }
    renderMoveTree('');
    modal.onclick = (e) => { if (e.target === modal) closeMoveQuizModal(); };
    modal.classList.remove('hidden');
}

// Nơi đang ở để đánh dấu "Đang ở đây" (undefined khi chọn nhiều bộ đề nằm rải rác nhiều nơi)
function moveCurrentLocation() {
    if (!moveCtx) return undefined;
    if (moveCtx.kind === 'folder') return parentIdOf(folderById(moveCtx.ids[0]));
    const locs = new Set(moveCtx.ids.map(id => quizFolderOf(S.userQuizSets.find(q => q.id === id))));
    return locs.size === 1 ? [...locs][0] : undefined;
}

function renderMoveTree(term) {
    const list = document.getElementById('folder-list-choices');
    if (!list || !moveCtx) return;
    const here = moveCurrentLocation();
    const blocked = moveCtx.kind === 'folder' ? subtreeIds(moveCtx.ids[0]) : new Set();
    const rootCount = S.userQuizSets.filter(q => quizFolderOf(q) === null).length;
    const rows = [];
    const row = (f, depth, note = '') => {
        const id = f ? f.id : null;
        const isHere = here !== undefined && id === here;
        const isBlocked = !!f && blocked.has(f.id);
        const right = isHere ? '<span class="mv-tag">Đang ở đây</span>'
            : isBlocked ? '<span class="mv-tag is-muted">Chính nó</span>'
            : `<span class="mv-meta">${f ? folderStats(f.id).quizCount : rootCount} bộ đề</span>`;
        rows.push(`<button type="button" class="mv-row" data-target="${id || ''}" style="--depth:${depth};--fc:${f ? folderHex(f) : '#ec4899'}"${isHere || isBlocked ? ' disabled' : ''}>
            <span class="mv-ico"><i class="fas ${f ? (f.icon || 'fa-folder') : 'fa-house'}"></i></span>
            <span class="mv-name">${f ? escapeHtml(f.name || 'Thư mục') : 'Thư viện gốc'}${note ? `<small>${escapeHtml(note)}</small>` : ''}</span>
            ${right}
        </button>`);
    };
    const q = (term || '').trim().toLowerCase();
    if (q) {
        S.userFolders.filter(f => (f.name || '').toLowerCase().includes(q)).forEach(f => {
            const path = folderPath(f.id).slice(0, -1).map(p => p.name).join(' › ');
            row(f, 0, path ? `trong ${path}` : 'ở Thư viện gốc');
        });
        if (!rows.length) rows.push('<p class="mv-empty">Không có thư mục nào khớp tên này.</p>');
    } else {
        row(null, 0);
        const seen = new Set();
        const walk = (parentId, depth) => childFolders(parentId).forEach(f => {
            if (seen.has(f.id)) return;
            seen.add(f.id);
            row(f, depth);
            walk(f.id, depth + 1);
        });
        walk(null, 1);
        if (!S.userFolders.length) rows.push('<p class="mv-empty">Chưa có thư mục nào. Bấm “Tạo thư mục” trong Thư viện để tạo.</p>');
    }
    list.innerHTML = rows.join('');
    list.querySelectorAll('.mv-row:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => performMove(btn.dataset.target || null));
    });
}

async function performMove(targetId) {
    const ctx = moveCtx;
    closeMoveQuizModal();
    if (!ctx) return;
    if (ctx.kind === 'folder') return moveFolder(ctx.ids[0], targetId);
    if (ctx.kind === 'quiz') {
        const target = folderById(targetId);
        return moveQuizToFolder(ctx.ids[0], targetId, target ? target.name : null);
    }
    // Hàng loạt: thoát chế độ chọn ngay để thấy kết quả, ghi nền sau
    S.isSelectionMode = false;
    S.selectedQuizIds = [];
    updateBulkActionsToolbar();
    return moveQuizzesBulk(ctx.ids, targetId);
}

/**
 * Chuyển nhiều bộ đề cùng lúc: cập nhật giao diện trước, ghi Firestore sau; bộ nào ghi hỏng thì
 * trả riêng bộ đó về chỗ cũ (bản cũ: một bộ lỗi là cả mẻ báo lỗi mà RAM vẫn lệch).
 */
async function moveQuizzesBulk(ids, targetId) {
    const target = folderById(targetId);
    const where = target ? `"${target.name}"` : 'Thư viện gốc';
    const moving = ids.map(id => S.userQuizSets.find(q => q.id === id)).filter(q => q && quizFolderOf(q) !== targetId);
    if (!moving.length) {
        showToast(`Các bộ đề đã nằm trong ${where} rồi.`, 'info');
        rerenderCurrentView();
        return;
    }
    const prev = new Map(moving.map(q => [q.id, q.folderId ?? null]));
    moving.forEach(q => { q.folderId = targetId; });
    rerenderCurrentView();
    const results = await Promise.allSettled(moving.map(q => updateDoc(doc(db, "quiz_sets", q.id), { folderId: targetId })));
    const failed = moving.filter((q, i) => results[i].status === 'rejected');
    failed.forEach(q => { q.folderId = prev.get(q.id); });
    persistLibraryCache();
    if (failed.length) {
        rerenderCurrentView();
        showToast(`Đã chuyển ${moving.length - failed.length}/${moving.length} bộ đề vào ${where}; ${failed.length} bộ lỗi đã trả về chỗ cũ.`, 'warning');
    } else {
        showToast(`Đã chuyển ${moving.length} bộ đề vào ${where}.`, 'success');
    }
}

/** "Đưa ra ngoài": chuyển bộ đề lên thư mục cha của thư mục đang chứa nó (hoặc ra gốc). */
export function moveQuizOut(quizId) {
    const quiz = S.userQuizSets.find(q => q.id === quizId);
    const from = quizFolderOf(quiz);
    if (!from) return;
    const parent = parentIdOf(folderById(from));
    moveQuizToFolder(quizId, parent, parent ? folderById(parent).name : null);
}

/**
 * Chuyển một thư mục (kèm mọi thứ bên trong) vào thư mục khác; null = ra Thư viện gốc.
 * Chặn chuyển vào chính nó / con cháu của nó (sẽ tạo vòng lặp làm cả nhánh biến mất).
 */
export async function moveFolder(folderId, targetParentId) {
    const folder = folderById(folderId);
    if (!folder) return;
    const target = targetParentId || null;
    const targetFolder = folderById(target);
    const where = targetFolder ? `"${targetFolder.name}"` : 'Thư viện gốc';
    if (!canMoveFolderInto(folderId, target)) {
        showToast('Không thể chuyển thư mục vào chính nó hoặc thư mục con của nó.', 'warning');
        return;
    }
    const prev = parentIdOf(folder);
    if (prev === target) {
        showToast(`Thư mục đã nằm trong ${where} rồi.`, 'info');
        return;
    }
    folder.parentId = target;
    persistFoldersCache();
    renderBreadcrumb();          // thư mục vừa chuyển có thể nằm trên đường đang đứng
    rerenderCurrentView();
    try {
        await updateDoc(doc(db, "quiz_folders", folderId), { parentId: target });
        showToast(`Đã chuyển thư mục "${folder.name}" vào ${where}.`, 'success');
    } catch (err) {
        console.error("Lỗi chuyển thư mục:", err);
        folder.parentId = prev;
        persistFoldersCache();
        renderBreadcrumb();
        rerenderCurrentView();
        showToast('Không chuyển được thư mục — đã trả về chỗ cũ.', 'error');
    }
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
    // Chỗ thả trên breadcrumb giờ gắn cho TỪNG nấc lúc vẽ (library-render.js bindMoveDropZone)
    initFolderStripAutoScroll();
    initPageAutoScrollWhileDragging();
}

// === THAO TÁC TRÊN CẢ THƯ MỤC (chia sẻ / công khai / dọn thư mục) ===

// Lấy toàn bộ bộ đề thuộc một thư mục. Thư viện có thể đang tải cuốn chiếu nên phải
// bảo đảm đã nạp đủ, nếu không sẽ thao tác thiếu bộ đề mà người dùng không hay biết.
async function getQuizzesInFolder(folderId, deep = true) {
    if (!S.isLibraryFullyLoaded) await ensureFullLibraryLoaded();
    const ids = deep ? subtreeIds(folderId) : new Set([folderId]);
    return S.userQuizSets.filter(q => ids.has(quizFolderOf(q)));
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
    // Cả nhánh: thư mục con cũng phải công khai thì người nhận mới mở vào được
    const subFolders = S.userFolders.filter(f => f.id !== folderId && subtreeIds(folderId).has(f.id));
    const what = `${subFolders.length ? `${subFolders.length} thư mục con, ` : ''}${quizzes.length} bộ đề bên trong`;

    if (!skipConfirm) {
        const ok = await showConfirm(
            makePublic
                ? `Thư mục "${name}" và ${what} sẽ CÔNG KHAI: ai có link đều mở và làm được.`
                : `Thư mục "${name}" và ${what} sẽ về RIÊNG TƯ: link đã chia sẻ trước đó sẽ không mở được nữa.`,
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
        const subNeed = subFolders.filter(f => (f.isPublic === true) !== makePublic);
        await Promise.all(subNeed.map(f => updateDoc(doc(db, "quiz_folders", f.id), { isPublic: makePublic })));
        subNeed.forEach(f => { f.isPublic = makePublic; });
        persistFoldersCache();

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
    const folder = folderById(folderId);
    const name = folder ? folder.name : 'thư mục';
    const quizzes = await getQuizzesInFolder(folderId, false);   // chỉ bộ đề nằm TRỰC TIẾP trong thư mục
    if (!quizzes.length) {
        showToast(`Thư mục "${name}" không có bộ đề nào nằm trực tiếp bên trong.`, 'info');
        return;
    }
    const parent = parentIdOf(folder);
    const where = parent ? `"${folderById(parent).name}"` : 'Thư viện gốc';

    const ok = await showConfirm(
        `${quizzes.length} bộ đề trong "${name}" sẽ chuyển ra ${where}. Thư mục (và thư mục con) vẫn giữ nguyên.`,
        { title: 'Đưa hết bộ đề ra ngoài?', confirmText: 'Đưa ra ngoài', cancelText: 'Hủy' }
    );
    if (!ok) return;
    await moveQuizzesBulk(quizzes.map(q => q.id), parent);
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
