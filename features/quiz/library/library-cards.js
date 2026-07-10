// File: features/quiz/library/library-cards.js
// Dựng từng thẻ hiển thị trong thư viện: thẻ thư mục (createFolderCard) và thẻ bộ đề (createQuizCard),
// kèm hai thao tác tải về / xóa bản offline gắn trong menu thẻ.
// Tách từ quiz-library-controller.js — logic giữ nguyên, chỉ đổi truy cập trạng thái sang S.xxx.

import { db } from '../../../core/firebase-init.js';
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { showToast, showConfirm } from '../../../core/utils.js';
import { isOfflineSavedSync, saveOfflineQuiz, deleteOfflineQuiz } from '../quiz-offline-store.js';
import { S } from './library-state.js';
import {
    FOLDER_COLOR_HEX, FOLDER_SWATCHES, escapeHtml, formatRelativeTime,
    getFolderLastOpenedMap, markFolderOpened, positionFolderMenu, resetFolderMenuPosition,
    isPinned, isNewQuiz, getQuizAccent, togglePinData
} from './library-helpers.js';
import { renderLibrary, renderBreadcrumb, rerenderCurrentView } from './library-render.js';
import { loadAndDisplayLibrary } from './library-data.js';
import {
    toggleFolderPin, openFolderModal, quickSetFolderColor, confirmDeleteFolder,
    reorderFolders, openMoveQuizModal, openShareQuizModal, updateBulkActionsToolbar
} from './library-actions.js';
import { getLastAttempt, hasAttemptData, markQuizOpened } from './library-attempts.js';

// Ghi nhận "lần mở bộ đề" ở pha capture trên document (đăng ký một lần khi nạp module).
// Phải đặt ở cấp document vì quiz-launch-transition.js chặn click điều hướng
// (preventDefault + stopPropagation, cũng ở capture trên document) để chạy hoạt ảnh
// — stopPropagation không chặn được listener cùng gắn trên document, nhưng chặn
// mọi listener gắn trên thẻ, nên không thể ghi nhận trong createQuizCard.
document.addEventListener('click', (e) => {
    if (!e.target.closest) return;
    if (S.isSelectionMode) return;
    const card = e.target.closest('.quiz-grid-card, .quiz-list-card');
    if (!card) return;
    // Bấm vào nút điều khiển (ghim, menu, checkbox...) thì không tính là "mở"
    if (e.target.closest('button, .quiz-menu, input')) return;
    const quizId = card.getAttribute('data-id');
    if (quizId) markQuizOpened(quizId);
}, true);

// Kiểm tra người dùng có bật "giảm chuyển động" (accessibility) không → nếu có thì bỏ hoạt ảnh.
function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Làm sáng/tối một mã màu hex (amt: -100..100). Dùng để tạo màu bìa & thân thư mục hài hoà.
function shadeHex(hex, amt) {
    let h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return hex;
    const num = parseInt(h, 16);
    const f = amt / 100;
    const adj = (c) => Math.max(0, Math.min(255, Math.round(c + (f < 0 ? c * f : (255 - c) * f))));
    const r = adj((num >> 16) & 255), g = adj((num >> 8) & 255), b = adj(num & 255);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// Hoạt ảnh "mở thư mục" 3D: dựng một chiếc thư mục thật ngay tại vị trí thẻ vừa bấm —
// bìa trước lật mở (bản lề ở đáy), xấp giấy (bộ đề) bên trong trồi lên & xoè ra, rồi cả
// khối phóng to tiến về phía người xem và tan dần vào nội dung → cảm giác "bước vào" thư mục.
// Chạy trên lớp phủ position:fixed gắn ở body nên không bị việc render lại thư viện xoá mất.
function playFolderOpenBurst(cardEl, hex, quizCount) {
    if (prefersReducedMotion()) return;
    const rect = cardEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // Scene có cỡ nội bộ cố định (150px); scale ban đầu để khớp bề rộng thẻ thư mục → liền mạch
    const startScale = Math.max(0.8, Math.min(rect.width / 150, 1.5));

    const stage = document.createElement('div');
    stage.className = 'folder-open-stage';

    const scene = document.createElement('div');
    scene.className = 'folder-open-scene';
    scene.style.left = cx + 'px';
    scene.style.top = cy + 'px';
    scene.style.setProperty('--fo-start-scale', startScale.toFixed(3));
    scene.style.setProperty('--fo-color', hex);
    scene.style.setProperty('--fo-color-d', shadeHex(hex, -22));
    scene.style.setProperty('--fo-color-l', shadeHex(hex, 14));

    // Xấp giấy bên trong: số tờ theo số bộ đề (3–5), xoè đối xứng
    const n = Math.max(3, Math.min(5, quizCount || 4));
    const mid = (n - 1) / 2;
    let papers = '';
    for (let i = 0; i < n; i++) {
        const off = i - mid;
        papers += `<span class="fo-paper" style="--fo-i:${i}; --fo-dx:${(off * 17).toFixed(1)}px; --fo-rot:${(off * 8).toFixed(1)}deg; z-index:${20 - Math.abs(off)}">`
            + `<span class="fo-paper-bar"></span><span class="fo-paper-line"></span><span class="fo-paper-line short"></span></span>`;
    }

    scene.innerHTML = `
        <span class="fo-glow"></span>
        <span class="fo-back"></span>
        ${papers}
        <span class="fo-flap"><span class="fo-tab"></span></span>
    `;
    stage.appendChild(scene);
    document.body.appendChild(stage);

    // Thẻ thư mục "nảy" nhẹ như vừa được mở ra
    cardEl.classList.add('folder-ejecting');

    setTimeout(() => stage.remove(), 1850);
}

// Dựng một thẻ thư mục hoàn chỉnh (markup + toàn bộ listener: mở, menu, ghim, đổi màu, xóa, kéo-thả)
export function createFolderCard(folder) {
    const card = document.createElement('div');
    const colorVal = folder.color || 'amber';
    const iconClass = folder.icon || 'fa-folder';
    const folderQuizzes = S.userQuizSets.filter(q => q.folderId === folder.id);
    const count = folderQuizzes.length;
    const totalQuestions = folderQuizzes.reduce((sum, q) => sum + (q.questionCount || 0), 0);
    const lastOpenedTs = getFolderLastOpenedMap()[folder.id];
    const lastOpenedText = formatRelativeTime(lastOpenedTs);
    const isPinnedFolder = !!folder.pinned;

    card.className = 'folder-mini-card';
    card.setAttribute('data-id', folder.id);
    card.setAttribute('draggable', 'true');
    if (isPinnedFolder) card.classList.add('is-pinned');

    // Tô màu nguyên cả thẻ thư mục theo màu đã chọn (thay vì chỉ ô icon nhỏ)
    const hex = colorVal.startsWith('#')
        ? colorVal
        : (FOLDER_COLOR_HEX[colorVal] || FOLDER_COLOR_HEX.amber);
    // Nền kính mờ: lớp màu nhạt phủ trên nền trắng gần đặc → đậm & dễ đọc trên mọi ảnh nền
    card.style.background = `linear-gradient(145deg, ${hex}3d, ${hex}1f), linear-gradient(0deg, rgba(255,255,255,0.9), rgba(255,255,255,0.9))`;
    card.style.borderColor = `${hex}80`;
    card.style.setProperty('--folder-shadow', `${hex}40`);
    card.style.setProperty('--folder-accent', hex);

    // Icon nổi bật: chip màu đặc + icon trắng để tương phản trên nền đã tô màu
    const wrapperHTML = `<div class="folder-icon-wrapper" style="background-color: ${hex}; color: #fff;"><i class="fas ${iconClass}"></i></div>`;

    const pinBadge = isPinnedFolder
        ? `<span class="folder-pin-badge" title="Đã ghim"><i class="fas fa-thumbtack"></i></span>`
        : '';

    const swatchHTML = FOLDER_SWATCHES.map(s =>
        `<button type="button" class="folder-color-dot ${s.key === colorVal ? 'is-active' : ''}" data-color="${s.key}" style="background:${s.hex}" title="${s.label}" aria-label="${s.label}"></button>`
    ).join('');

    // Dòng thông tin phụ: số câu hỏi + lần mở gần nhất (nếu có)
    const totalQHTML = `<span class="folder-meta-chip"><i class="fas fa-circle-question text-[9px] opacity-70"></i>${totalQuestions} câu</span>`;
    const lastOpenedHTML = lastOpenedText
        ? `<span class="folder-meta-chip folder-meta-time"><i class="fas fa-clock text-[9px] opacity-70"></i>${lastOpenedText}</span>`
        : '';

    // Xem nhanh khi hover: liệt kê tối đa 5 bộ đề trong thư mục
    const previewItems = folderQuizzes.slice(0, 5)
        .map(q => `<li><i class="fas fa-file-alt"></i><span class="truncate">${escapeHtml(q.title || 'Không tên')}</span></li>`)
        .join('');
    const previewMore = count > 5 ? `<li class="folder-preview-more">… và ${count - 5} bộ đề khác</li>` : '';
    const previewHTML = count > 0
        ? `<div class="folder-preview-pop"><p class="folder-preview-title"><i class="fas fa-layer-group"></i> ${count} bộ đề${totalQuestions ? ` · ${totalQuestions} câu` : ''}</p><ul>${previewItems}${previewMore}</ul></div>`
        : '';

    card.innerHTML = `
        ${pinBadge}
        ${previewHTML}
        <div class="folder-mini-card-content folder-click-area">
            ${wrapperHTML}
            <div class="min-w-0 flex-1">
                <h4 class="font-bold text-gray-800 text-sm truncate" title="${folder.name}">${folder.name}</h4>
                <div class="folder-meta-row">
                    <span class="folder-count-badge"><i class="fas fa-file-alt text-[9px] opacity-70"></i>${count} bộ đề</span>
                    ${totalQHTML}
                    ${lastOpenedHTML}
                </div>
            </div>
        </div>
        <div class="relative flex items-center">
            <button class="folder-menu-btn w-6 h-6 flex items-center justify-center text-gray-400 hover:text-pink-500 rounded-full focus:outline-none" data-id="${folder.id}" title="Tùy chọn thư mục" aria-label="Tùy chọn thư mục" aria-haspopup="true" aria-expanded="false"><i class="fas fa-ellipsis-v text-xs"></i></button>
            <div class="folder-menu hidden absolute right-0 top-7 bg-white rounded-xl shadow-xl border border-pink-100 z-30 min-w-[180px] p-1">
                <button class="block w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-gray-700 hover:bg-pink-50 pin-folder-btn" data-id="${folder.id}"><i class="fas fa-thumbtack mr-2 ${isPinnedFolder ? 'text-pink-500' : 'text-gray-400'}"></i>${isPinnedFolder ? 'Bỏ ghim' : 'Ghim lên đầu'}</button>
                <button class="block w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-gray-700 hover:bg-pink-50 rename-folder-btn" data-id="${folder.id}" data-name="${folder.name}"><i class="fas fa-pen mr-2 text-blue-400"></i>Sửa tên, icon &amp; màu</button>
                <div class="px-3 pt-2 pb-1">
                    <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Đổi màu nhanh</p>
                    <div class="folder-color-row">${swatchHTML}</div>
                </div>
                <div class="h-px bg-gray-100 my-1"></div>
                <button class="block w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 delete-folder-btn" data-id="${folder.id}"><i class="fas fa-trash-alt mr-2 text-red-400"></i>Xóa thư mục</button>
            </div>
        </div>
    `;

    card.querySelector('.folder-click-area').addEventListener('click', () => {
        markFolderOpened(folder.id); // ghi nhận lần mở gần nhất (cục bộ)
        playFolderOpenBurst(card, hex, count); // giấy bung ra từ thư mục
        S.currentFolderId = folder.id;
        renderBreadcrumb();
        // Trễ nhẹ để xấp giấy kịp xoè lên từ thư mục trước khi danh sách đổi sang nội dung bên trong
        if (prefersReducedMotion()) {
            loadAndDisplayLibrary(1);
        } else {
            setTimeout(() => loadAndDisplayLibrary(1), 900);
        }
    });

    const menuBtn = card.querySelector('.folder-menu-btn');
    const menu = card.querySelector('.folder-menu');
    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = menu.classList.contains('hidden');
        document.querySelectorAll('.quiz-menu, .folder-menu').forEach(m => {
            if (m !== menu) m.classList.add('hidden');
        });
        document.querySelectorAll('.folder-menu-btn[aria-expanded="true"]').forEach(b => {
            if (b !== menuBtn) b.setAttribute('aria-expanded', 'false');
        });
        if (isHidden) {
            positionFolderMenu(menu, menuBtn); // dùng position:fixed để không bị khung thư mục cắt
        } else {
            resetFolderMenuPosition(menu);
        }
        menuBtn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
    });
    // Ngăn click bên trong menu làm điều hướng vào thư mục
    menu.addEventListener('click', (e) => e.stopPropagation());

    card.querySelector('.pin-folder-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.add('hidden');
        toggleFolderPin(folder.id, !isPinnedFolder);
    });

    card.querySelector('.rename-folder-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.add('hidden');
        openFolderModal('edit', folder.id, folder.name);
    });

    card.querySelectorAll('.folder-color-dot').forEach(dot => {
        dot.addEventListener('click', (e) => {
            e.stopPropagation();
            const newColor = dot.getAttribute('data-color');
            if (newColor === colorVal) { menu.classList.add('hidden'); return; }
            menu.classList.add('hidden');
            quickSetFolderColor(folder.id, newColor);
        });
    });

    card.querySelector('.delete-folder-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.add('hidden');
        confirmDeleteFolder(folder.id);
    });

    // Kéo thư mục để sắp xếp lại thứ tự
    card.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/x-folder', folder.id);
        card.classList.add('folder-dragging');
    });
    card.addEventListener('dragend', () => {
        card.classList.remove('folder-dragging');
        document.querySelectorAll('.folder-mini-card.drop-target')
            .forEach(c => c.classList.remove('drop-target'));
    });

    // Drag & Drop: nhận bộ đề (di chuyển) hoặc thư mục (sắp xếp lại)
    card.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    });
    card.addEventListener('dragenter', (e) => {
        e.preventDefault();
        card.classList.add('drop-target');
    });
    card.addEventListener('dragleave', () => {
        card.classList.remove('drop-target');
    });
    card.addEventListener('drop', async (e) => {
        e.preventDefault();
        card.classList.remove('drop-target');

        const draggedFolderId = e.dataTransfer.getData('application/x-folder');
        if (draggedFolderId) {
            await reorderFolders(draggedFolderId, folder.id);
            return;
        }

        const quizId = e.dataTransfer.getData('text/plain');
        if (!quizId) return;
        try {
            S.isLibraryFullyLoaded = false;
            const quizDocRef = doc(db, "quiz_sets", quizId);
            await updateDoc(quizDocRef, { folderId: folder.id });
            showToast(`Đã chuyển bộ đề vào thư mục "${folder.name}"!`, 'success');
            await loadAndDisplayLibrary();
        } catch (err) {
            console.error("Lỗi kéo thả di chuyển bộ đề:", err);
            showToast('Có lỗi xảy ra khi di chuyển bộ đề!', 'error');
        }
    });

    return card;
}

function getQuizCardClassName(isSelected = false) {
    if (S.libraryLayoutMode === 'list') {
        if (S.isSelectionMode) {
            return isSelected
                ? 'quiz-list-card bg-pink-50/20 rounded-xl border-2 border-pink-500 p-3 sm:p-4 shadow-md flex items-center justify-between gap-3 sm:gap-4 cursor-pointer transition-all duration-200 relative'
                : 'quiz-list-card bg-white rounded-xl border border-pink-100 p-3 sm:p-4 shadow-sm flex items-center justify-between gap-3 sm:gap-4 cursor-pointer hover:border-pink-300 transition-all duration-200 relative';
        } else {
            return 'quiz-list-card bg-white rounded-xl border border-gray-100 p-3 sm:p-4 shadow-sm hover:shadow-md hover:border-pink-200 cursor-pointer transition-all duration-200 flex items-center justify-between gap-3 sm:gap-4 relative';
        }
    } else {
        if (S.isSelectionMode) {
            return isSelected
                ? 'quiz-grid-card bg-pink-50/20 rounded-2xl border-2 border-pink-500 p-4 sm:p-5 shadow-md flex flex-col cursor-pointer transition-all duration-300 relative'
                : 'quiz-grid-card bg-white rounded-2xl border border-pink-100 p-4 sm:p-5 shadow-sm flex flex-col cursor-pointer hover:border-pink-300 transition-all duration-300 relative';
        } else {
            return 'quiz-grid-card bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 shadow-sm hover:-translate-y-1 hover:shadow-md hover:border-pink-200 cursor-pointer transition-all duration-300 flex flex-col relative';
        }
    }
}

// Dựng một thẻ bộ đề hoàn chỉnh (markup theo bố cục lưới/danh sách + toàn bộ listener).
// quizzesToDisplay/currentPage: danh sách & trang đang vẽ — cần cho long-press re-render đúng ngữ cảnh.
export function createQuizCard(quizSet, quizzesToDisplay, currentPage) {
    const card = document.createElement('div');
    const isSelected = S.selectedQuizIds.includes(quizSet.id);
    const pinned = isPinned(quizSet.id);
    const isNew = isNewQuiz(quizSet);
    const newBadge = isNew
        ? `<span class="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center">Mới</span>`
        : '';
    const offlineSaved = isOfflineSavedSync(quizSet.id);
    // Huy hiệu "Đã tải" hiển thị cạnh số câu hỏi khi bộ đề đã được lưu để làm offline
    const offlineBadge = offlineSaved
        ? `<span class="offline-badge bg-sky-50 text-sky-600 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold inline-flex items-center gap-1" title="Đã tải về máy — làm được khi không có mạng"><i class="fas fa-circle-check text-[10px]"></i>Đã tải</span>`
        : '';
    // Mục trong menu "..." để tải về / xóa bản offline
    const offlineMenuItem = offlineSaved
        ? `<button class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-pink-50 remove-offline-btn" data-id="${quizSet.id}"><i class="fas fa-trash-can mr-2.5 text-sky-400"></i>Xóa bản offline</button>`
        : `<button class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-pink-50 download-offline-btn" data-id="${quizSet.id}"><i class="fas fa-cloud-arrow-down mr-2.5 text-sky-500"></i>Tải về máy (offline)</button>`;
    const pinBtnSm = `<button class="pin-quiz-btn w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${pinned ? 'text-pink-500 bg-pink-50' : 'text-gray-400 hover:text-pink-500 hover:bg-pink-50'}" data-id="${quizSet.id}" title="${pinned ? 'Bỏ ghim' : 'Ghim lên đầu'}" aria-label="${pinned ? 'Bỏ ghim bộ đề' : 'Ghim bộ đề lên đầu'}" aria-pressed="${pinned}"><i class="fas fa-thumbtack text-xs"></i></button>`;
    const pinBtnMd = `<button class="pin-quiz-btn w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${pinned ? 'text-pink-500 bg-pink-50' : 'text-gray-400 hover:text-pink-500 hover:bg-pink-50'}" data-id="${quizSet.id}" title="${pinned ? 'Bỏ ghim' : 'Ghim lên đầu'}" aria-label="${pinned ? 'Bỏ ghim bộ đề' : 'Ghim bộ đề lên đầu'}" aria-pressed="${pinned}"><i class="fas fa-thumbtack text-sm"></i></button>`;

    // Chip tiến độ: kết quả lần làm gần nhất (tô màu theo mức điểm) hoặc "Chưa làm".
    // Chỉ gắn nhãn "Chưa làm" khi đã đồng bộ lịch sử ít nhất một lần, tránh dán nhãn sai.
    const attempt = getLastAttempt(quizSet.id);
    let attemptChip = '';
    if (attempt && attempt.t > 0) {
        const pct = Math.round((attempt.s / attempt.t) * 100);
        const tone = pct >= 80 ? 'quiz-chip-attempt-good' : (pct >= 50 ? 'quiz-chip-attempt-mid' : 'quiz-chip-attempt-low');
        const timeText = formatRelativeTime(attempt.at);
        attemptChip = `<span class="quiz-chip ${tone}" title="Lần làm gần nhất: đúng ${attempt.s}/${attempt.t} câu (${pct}%)"><i class="fas fa-circle-check"></i>${attempt.s}/${attempt.t}${timeText ? ` · ${timeText}` : ''}</span>`;
    } else if (hasAttemptData()) {
        attemptChip = `<span class="quiz-chip quiz-chip-unattempted" title="Bạn chưa làm bộ đề này lần nào"><i class="far fa-circle"></i>Chưa làm</span>`;
    }

    // Menu "..." gom TOÀN BỘ thao tác phụ (sửa/chia sẻ/di chuyển/offline/xóa) để mặt thẻ gọn gàng:
    // trên thẻ chỉ còn Ghim + Làm bài. Dùng chung cho cả bố cục lưới và danh sách.
    const quizMenuInnerHTML = `
        <button class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-pink-50 edit-quiz-content-btn" data-id="${quizSet.id}"><i class="fas fa-pen-alt mr-2.5 text-blue-400"></i>Sửa câu hỏi</button>
        <button class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-pink-50 edit-quiz-btn" data-id="${quizSet.id}" data-title="${quizSet.title}"><i class="fas fa-edit mr-2.5 text-amber-400"></i>Sửa tên</button>
        <button class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-pink-50 share-quiz-btn" data-id="${quizSet.id}"><i class="fas fa-share-alt mr-2.5 text-green-500"></i>Chia sẻ</button>
        <div class="border-t border-gray-100 my-1"></div>
        <button class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-pink-50 quiz-history-btn" data-id="${quizSet.id}"><i class="fas fa-history mr-2.5 text-pink-400"></i>Xem lịch sử làm bài</button>
        <button class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-pink-50 move-quiz-btn" data-id="${quizSet.id}"><i class="fas fa-folder-open mr-2.5 text-yellow-500"></i>Di chuyển</button>
        ${offlineMenuItem}
        <div class="border-t border-gray-100 my-1"></div>
        <button class="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 delete-quiz-btn" data-id="${quizSet.id}"><i class="fas fa-trash-alt mr-2.5 text-red-500"></i>Xóa bộ đề</button>`;

    card.className = getQuizCardClassName(isSelected);
    card.setAttribute('data-id', quizSet.id);

    let dateStr = 'N/A';
    if (quizSet.createdAt) {
        const dateObj = typeof quizSet.createdAt.toDate === 'function' ? quizSet.createdAt.toDate() : new Date(quizSet.createdAt);
        const hours = String(dateObj.getHours()).padStart(2, '0');
        const minutes = String(dateObj.getMinutes()).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const year = dateObj.getFullYear();
        dateStr = `${hours}:${minutes} ${day}/${month}/${year}`;
    }

    // Sắc thái màu + icon riêng cho từng bộ đề (ổn định theo id)
    const accent = getQuizAccent(quizSet.id || quizSet.title);
    const accentStyle = `background-image:linear-gradient(135deg, ${accent.from}, ${accent.to});`;

    if (S.libraryLayoutMode === 'list') {
        let checkboxHTML = '';
        if (S.isSelectionMode) {
            checkboxHTML = `
                <div class="flex-shrink-0 z-10 mr-1">
                    <input type="checkbox" class="bulk-quiz-checkbox w-5 h-5 rounded-full border-pink-300 text-[#FF69B4] focus:ring-pink-300 cursor-pointer pointer-events-none" ${isSelected ? 'checked' : ''} />
                </div>
            `;
        }

        let menuHTML = '';
        if (!S.isSelectionMode) {
            menuHTML = `
                <div class="relative flex-shrink-0">
                    <button class="quiz-menu-btn w-8 h-8 flex items-center justify-center text-gray-400 hover:text-pink-500 hover:bg-pink-50 rounded-full focus:outline-none transition-colors" data-id="${quizSet.id}" title="Tùy chọn" aria-label="Tùy chọn bộ đề" aria-haspopup="true" aria-expanded="false"><i class="fas fa-ellipsis-v text-xs"></i></button>
                    <div class="quiz-menu hidden absolute right-0 top-9 bg-white rounded-xl shadow-xl border border-gray-100 z-20 min-w-[175px] py-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                        ${quizMenuInnerHTML}
                    </div>
                </div>
            `;
        }

        card.innerHTML = `
            ${checkboxHTML}
            <span class="quiz-card-icon quiz-card-icon-sm flex-shrink-0" style="${accentStyle}" aria-hidden="true">
                <i class="fas ${accent.icon}"></i>
            </span>
            <div class="flex-grow min-w-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
                <div class="min-w-0 flex-1">
                    <h3 class="text-sm sm:text-base font-bold text-gray-800 truncate" title="${quizSet.title}">
                        <a href="features/quiz/quiz.html?id=${quizSet.id}" class="hover:text-pink-600 focus:text-pink-600 transition-colors duration-150 block mr-2">
                            ${quizSet.title}
                        </a>
                    </h3>
                    <div class="flex flex-wrap gap-1.5 mt-1 items-center">
                        ${newBadge}${offlineBadge}
                        <span class="quiz-chip quiz-chip-count">
                            <i class="fas fa-circle-question"></i>${quizSet.questionCount} câu
                        </span>
                        ${attemptChip}
                        <span class="quiz-chip quiz-chip-date hidden sm:inline-flex">
                            <i class="far fa-clock"></i>${dateStr}
                        </span>
                    </div>
                </div>
                <div class="flex items-center gap-2 mt-1 sm:mt-0 justify-between sm:justify-end ${S.isSelectionMode ? 'opacity-40 pointer-events-none' : ''}">
                    ${pinBtnSm}
                    <a href="features/quiz/quiz.html?id=${quizSet.id}" class="practice-btn inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-pink-50 text-pink-600 border border-pink-200 hover:bg-pink-500 hover:border-pink-500 hover:text-white hover:-translate-y-0.5 active:translate-y-0 rounded-xl transition-all duration-200 text-sm font-extrabold tracking-wide flex-shrink-0">
                        <i class="fas fa-play text-[10px]"></i>
                        Làm bài
                    </a>
                </div>
            </div>
            ${menuHTML}
        `;
    } else {
        let checkboxHTML = '';
        let menuHTML = '';
        if (S.isSelectionMode) {
            checkboxHTML = `
                <div class="absolute top-4 left-4 z-10">
                    <input type="checkbox" class="bulk-quiz-checkbox w-5 h-5 rounded-full border-pink-300 text-[#FF69B4] focus:ring-pink-300 cursor-pointer pointer-events-none" ${isSelected ? 'checked' : ''} />
                </div>
            `;
        } else {
            menuHTML = `
                <div class="absolute top-4 right-4">
                    <button class="quiz-menu-btn w-8 h-8 flex items-center justify-center text-gray-400 hover:text-pink-500 hover:bg-pink-50 rounded-full focus:outline-none transition-colors" data-id="${quizSet.id}" title="Tùy chọn" aria-label="Tùy chọn bộ đề" aria-haspopup="true" aria-expanded="false"><i class="fas fa-ellipsis-v"></i></button>
                    <div class="quiz-menu hidden absolute right-0 top-9 bg-white rounded-xl shadow-xl border border-gray-100 z-20 min-w-[175px] py-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                        ${quizMenuInnerHTML}
                    </div>
                </div>
            `;
        }

        card.innerHTML = `
            ${checkboxHTML}
            <div class="flex-grow ${S.isSelectionMode ? 'pl-8' : ''}">
                <div class="flex items-start gap-3 mb-3 pr-8">
                    <span class="quiz-card-icon flex-shrink-0" style="${accentStyle}" aria-hidden="true">
                        <i class="fas ${accent.icon}"></i>
                    </span>
                    <div class="min-w-0 flex-1">
                        <h3 class="text-sm sm:text-base font-bold text-gray-800 line-clamp-2 leading-snug" title="${quizSet.title}">
                            <a href="features/quiz/quiz.html?id=${quizSet.id}" class="hover:text-pink-600 focus:text-pink-600 transition-colors duration-150 block">
                                ${quizSet.title}
                            </a>
                        </h3>
                        <div class="flex flex-wrap gap-1.5 mt-2">
                            ${newBadge}${offlineBadge}
                            <span class="quiz-chip quiz-chip-count">
                                <i class="fas fa-circle-question"></i>${quizSet.questionCount} câu
                            </span>
                            ${attemptChip}
                            <span class="quiz-chip quiz-chip-date hidden sm:inline-flex">
                                <i class="far fa-clock"></i>${dateStr}
                            </span>
                        </div>
                    </div>
                </div>
                ${menuHTML}
            </div>
            <div class="mt-auto pt-3 border-t border-gray-50 flex justify-between items-center gap-2 ${S.isSelectionMode ? 'opacity-40 pointer-events-none' : ''}">
                ${pinBtnMd}
                <a href="features/quiz/quiz.html?id=${quizSet.id}" class="practice-btn inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-pink-50 text-pink-600 border border-pink-200 hover:bg-pink-500 hover:border-pink-500 hover:text-white hover:-translate-y-0.5 active:translate-y-0 rounded-xl transition-all duration-200 text-sm font-extrabold tracking-wide">
                    <i class="fas fa-play text-[10px]"></i>
                    Làm bài
                </a>
            </div>
        `;
    }

    if (!S.isSelectionMode) {
        card.setAttribute('draggable', 'true');
        card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', quizSet.id);
            e.dataTransfer.effectAllowed = 'move';
            setTimeout(() => card.classList.add('opacity-40'), 0);
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('opacity-40');
        });
    }

    // Selection Mode and card click handler
    card.addEventListener('click', function(e) {
        if (S.isSelectionMode) {
            // Block navigation and toggle selection
            e.preventDefault();
            e.stopPropagation();

            const checkbox = card.querySelector('.bulk-quiz-checkbox');
            const hasId = S.selectedQuizIds.includes(quizSet.id);

            if (hasId) {
                S.selectedQuizIds = S.selectedQuizIds.filter(id => id !== quizSet.id);
                card.className = getQuizCardClassName(false);
                if (checkbox) checkbox.checked = false;
            } else {
                S.selectedQuizIds.push(quizSet.id);
                card.className = getQuizCardClassName(true);
                if (checkbox) checkbox.checked = true;
            }
            updateBulkActionsToolbar();
            return;
        }

        // If not in Selection Mode:
        // Let custom button clicks/actions handle themselves
        if (e.target.closest('button') || e.target.closest('.quiz-menu') || e.target.closest('.quiz-menu-btn')) {
            return;
        }

        // Let standard links like title link or practice button behave normally
        if (e.target.closest('a')) {
            return;
        }

        // Redirect to quiz page if clicking anywhere else on the card (blank spaces)
        e.preventDefault();
        window.location.href = `features/quiz/quiz.html?id=${quizSet.id}`;
    });

    // Long Press detection
    let longPressTimer = null;
    let isLongPressTriggered = false;

    const startPress = (e) => {
        if (S.isSelectionMode || e.target.closest('a') || e.target.closest('.quiz-menu-btn') || e.target.closest('.quiz-menu')) return;
        isLongPressTriggered = false;
        longPressTimer = setTimeout(() => {
            isLongPressTriggered = true;
            S.isSelectionMode = true;
            S.selectedQuizIds = [quizSet.id];
            if (navigator.vibrate) navigator.vibrate(50);
            // Chọn nhiều cần toàn bộ dữ liệu (chọn xuyên trang). Nếu đang cuốn chiếu chưa tải hết
            // thì nạp đầy đủ (đã ở selection mode nên đi đường non-rolling); ngược lại re-render tại chỗ.
            if (!S.isLibraryFullyLoaded) {
                loadAndDisplayLibrary();
            } else {
                renderLibrary(quizzesToDisplay, currentPage);
            }
            updateBulkActionsToolbar();
        }, 600);
    };

    const cancelPress = () => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    };

    card.addEventListener('mousedown', startPress);
    card.addEventListener('touchstart', startPress, { passive: true });

    card.addEventListener('mouseup', (e) => {
        cancelPress();
        if (isLongPressTriggered) {
            e.preventDefault();
            e.stopPropagation();
        }
    });
    card.addEventListener('touchend', (e) => {
        cancelPress();
        if (isLongPressTriggered) {
            e.preventDefault();
            e.stopPropagation();
        }
    });

    card.addEventListener('mouseleave', cancelPress);
    card.addEventListener('touchmove', cancelPress, { passive: true });
    card.addEventListener('touchcancel', cancelPress);

    // Gán listener phụ
    setTimeout(() => {
        // Chọn một mục trong menu "..." thì tự đóng menu (dùng capture để chạy được cả khi
        // listener của nút gọi stopPropagation). Trừ nút tải offline — nó hiện "Đang tải..." tại chỗ.
        const menuEl = card.querySelector('.quiz-menu');
        if (menuEl) {
            menuEl.addEventListener('click', (e) => {
                const item = e.target.closest('button');
                if (!item || item.classList.contains('download-offline-btn')) return;
                menuEl.classList.add('hidden');
                card.classList.remove('quiz-card-menu-open');
                const mBtn = card.querySelector('.quiz-menu-btn');
                if (mBtn) mBtn.setAttribute('aria-expanded', 'false');
            }, true);
        }

        const pinBtn = card.querySelector('.pin-quiz-btn');
        if (pinBtn) {
            pinBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                togglePinData(this.getAttribute('data-id'));
                rerenderCurrentView();
            });
        }

        const shareBtn = card.querySelector('.share-quiz-btn');
        if (shareBtn) {
            shareBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                const quizId = this.getAttribute('data-id');
                openShareQuizModal(quizId, quizSet.title);
            });
        }

        const moveBtn = card.querySelector('.move-quiz-btn');
        if (moveBtn) {
            moveBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                const quizId = this.getAttribute('data-id');
                S.isBulkMoving = false;
                openMoveQuizModal(quizId);
            });
        }

        const editContentBtn = card.querySelector('.edit-quiz-content-btn');
        if (editContentBtn) {
            editContentBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                const qId = this.getAttribute('data-id');
                window.location.href = `features/editor/editor.html?id=${qId}`;
            });
        }

        const historyBtn = card.querySelector('.quiz-history-btn');
        if (historyBtn) {
            historyBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                const qId = this.getAttribute('data-id');
                window.location.href = `features/quiz/quiz-history.html?id=${qId}`;
            });
        }

        const downloadOfflineBtn = card.querySelector('.download-offline-btn');
        if (downloadOfflineBtn) {
            downloadOfflineBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                handleDownloadOffline(this.getAttribute('data-id'), quizSet.title, this);
            });
        }

        const removeOfflineBtn = card.querySelector('.remove-offline-btn');
        if (removeOfflineBtn) {
            removeOfflineBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                handleRemoveOffline(this.getAttribute('data-id'), quizSet.title);
            });
        }
    }, 0);

    return card;
}

// === TẢI BỘ ĐỀ VỀ MÁY ĐỂ LÀM OFFLINE ===
// Tải đầy đủ doc (kèm mảng `questions`) từ Firestore và lưu vào IndexedDB,
// để sau này mở bài làm được kể cả khi không có mạng.
async function handleDownloadOffline(quizId, quizTitle, btnEl) {
    if (!navigator.onLine) {
        showToast('Cần có mạng để tải bộ đề về máy lần đầu.', 'warning');
        return;
    }
    const originalHTML = btnEl ? btnEl.innerHTML : '';
    if (btnEl) {
        btnEl.disabled = true;
        btnEl.innerHTML = `<i class="fas fa-spinner fa-spin mr-2.5 text-sky-500"></i>Đang tải...`;
    }
    try {
        const snap = await getDoc(doc(db, 'quiz_sets', quizId));
        if (!snap.exists()) {
            showToast('Không tìm thấy bộ đề trên máy chủ.', 'error');
            return;
        }
        await saveOfflineQuiz(quizId, snap.data());
        showToast(`Đã tải "${quizTitle}" về máy. Làm được khi không có mạng!`, 'success');
        rerenderCurrentView();
    } catch (e) {
        console.error('Lỗi tải bộ đề offline:', e);
        showToast('Lỗi khi tải bộ đề: ' + (e && e.message ? e.message : e), 'error');
        if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = originalHTML; }
    }
}

async function handleRemoveOffline(quizId, quizTitle) {
    const ok = await showConfirm('Bộ đề vẫn còn trên máy chủ, chỉ xóa bản tải về máy này.', {
        title: `Xóa bản offline của "${quizTitle}"?`, confirmText: 'Xóa bản offline', cancelText: 'Hủy', tone: 'danger'
    });
    if (!ok) return;
    try {
        await deleteOfflineQuiz(quizId);
        showToast('Đã xóa bản offline.', 'success');
        rerenderCurrentView();
    } catch (e) {
        console.error('Lỗi xóa bản offline:', e);
        showToast('Lỗi khi xóa bản offline.', 'error');
    }
}
