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
import { loadAndDisplayLibrary, ensureFullLibraryLoaded } from './library-data.js';
import {
    toggleFolderPin, openFolderModal, quickSetFolderColor, confirmDeleteFolder,
    reorderFolders, openMoveQuizModal, openShareQuizModal, updateBulkActionsToolbar,
    toggleQuizPublic, toggleFolderPublic, openShareFolderModal, moveAllQuizzesOutOfFolder,
    duplicateQuizSet, moveQuizToFolder
} from './library-actions.js';
import { getLastAttempt, hasAttemptData, markQuizOpened } from './library-attempts.js';
import { countDueNow } from '../quiz-srs-store.js';

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

    const isPublicFolder = folder.isPublic === true;
    const pinBadge = isPinnedFolder
        ? `<span class="folder-pin-badge" title="Đã ghim"><i class="fas fa-thumbtack"></i></span>`
        : '';
    // Thư mục đang chia sẻ công khai → báo ngay trên thẻ để không lỡ để lộ mà không biết
    const publicBadge = isPublicFolder
        ? `<span class="folder-public-badge" title="Đang công khai — ai có link đều xem được"><i class="fas fa-globe"></i></span>`
        : '';

    const swatchHTML = FOLDER_SWATCHES.map(s =>
        `<button type="button" class="folder-color-dot ${s.key === colorVal ? 'is-active' : ''}" data-color="${s.key}" style="background:${s.hex}" title="${s.label}" aria-label="${s.label}"></button>`
    ).join('');

    // Dòng thông tin phụ. Số liệu (bộ đề · câu) nằm chung một hàng KHÔNG xuống dòng;
    // lần mở gần nhất tách xuống hàng riêng và LUÔN render (rỗng thì vẫn giữ chỗ) —
    // nhờ vậy mọi thẻ thư mục cao bằng nhau, cả dải nhìn thẳng hàng.
    const totalQHTML = `<span class="folder-meta-chip"><i class="fas fa-circle-question text-[9px] opacity-70"></i>${totalQuestions} câu</span>`;
    const lastOpenedHTML = `<p class="folder-meta-time">${lastOpenedText ? `<i class="fas fa-clock"></i>${lastOpenedText}` : ''}</p>`;

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
        ${publicBadge}
        ${previewHTML}
        <div class="folder-mini-card-content folder-click-area">
            ${wrapperHTML}
            <div class="min-w-0 flex-1">
                <h4 class="font-bold text-gray-800 text-sm truncate" title="${folder.name}">${folder.name}</h4>
                <div class="folder-meta-row">
                    <span class="folder-count-badge"><i class="fas fa-file-alt text-[9px] opacity-70"></i>${count} bộ đề</span>
                    ${totalQHTML}
                </div>
                ${lastOpenedHTML}
            </div>
        </div>
        <div class="relative flex items-center">
            <button class="folder-menu-btn w-6 h-6 flex items-center justify-center text-gray-400 hover:text-pink-500 rounded-full focus:outline-none" data-id="${folder.id}" title="Tùy chọn thư mục" aria-label="Tùy chọn thư mục" aria-haspopup="true" aria-expanded="false"><i class="fas fa-ellipsis-v text-xs"></i></button>
            <div class="folder-menu hidden absolute right-0 top-7 bg-white rounded-xl shadow-xl border border-pink-100 z-30 min-w-[205px] p-1">
                <button class="block w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-gray-700 hover:bg-pink-50 pin-folder-btn" data-id="${folder.id}"><i class="fas fa-thumbtack mr-2 ${isPinnedFolder ? 'text-pink-500' : 'text-gray-400'}"></i>${isPinnedFolder ? 'Bỏ ghim' : 'Ghim lên đầu'}</button>
                <button class="block w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-gray-700 hover:bg-pink-50 share-folder-btn" data-id="${folder.id}"><i class="fas fa-share-alt mr-2 text-green-500"></i>Chia sẻ thư mục</button>
                <button class="block w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-gray-700 hover:bg-pink-50 toggle-folder-public-btn" data-id="${folder.id}" data-public="${isPublicFolder}" title="${isPublicFolder ? 'Đang công khai — bấm để chuyển cả thư mục về riêng tư' : 'Đang riêng tư — bấm để công khai cả thư mục kèm bộ đề bên trong'}"><i class="fas ${isPublicFolder ? 'fa-globe text-green-500' : 'fa-lock text-gray-400'} mr-2"></i>${isPublicFolder ? 'Đang công khai' : 'Đang riêng tư'}</button>
                <div class="h-px bg-gray-100 my-1"></div>
                <button class="block w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-gray-700 hover:bg-pink-50 rename-folder-btn" data-id="${folder.id}" data-name="${folder.name}"><i class="fas fa-pen mr-2 text-blue-400"></i>Sửa tên, icon &amp; màu</button>
                <div class="px-3 pt-2 pb-1">
                    <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Đổi màu nhanh</p>
                    <div class="folder-color-row">${swatchHTML}</div>
                </div>
                <div class="h-px bg-gray-100 my-1"></div>
                <button class="block w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-gray-700 hover:bg-pink-50 download-folder-btn" data-id="${folder.id}"><i class="fas fa-cloud-arrow-down mr-2 text-sky-500"></i>Tải cả thư mục về máy</button>
                <button class="block w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-gray-700 hover:bg-pink-50 empty-folder-btn" data-id="${folder.id}"><i class="fas fa-box-open mr-2 text-amber-500"></i>Đưa hết bộ đề ra ngoài</button>
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

    card.querySelector('.share-folder-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.add('hidden');
        openShareFolderModal(folder.id, folder.name);
    });

    card.querySelector('.toggle-folder-public-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.add('hidden');
        toggleFolderPublic(folder.id, !isPublicFolder);
    });

    card.querySelector('.download-folder-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.add('hidden');
        handleDownloadFolderOffline(folder.id, folder.name);
    });

    card.querySelector('.empty-folder-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.add('hidden');
        moveAllQuizzesOutOfFolder(folder.id);
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
    // Rê qua phần tử con cũng bắn dragleave → viền nhấp nháy liên tục.
    // Chỉ bỏ đánh dấu khi con trỏ thật sự rời khỏi thẻ.
    card.addEventListener('dragleave', (e) => {
        if (e.relatedTarget && card.contains(e.relatedTarget)) return;
        card.classList.remove('drop-target');
    });
    card.addEventListener('drop', async (e) => {
        e.preventDefault();
        card.classList.remove('drop-target');
        document.body.classList.remove('is-dragging-quiz');

        const draggedFolderId = e.dataTransfer.getData('application/x-folder');
        if (draggedFolderId) {
            await reorderFolders(draggedFolderId, folder.id);
            return;
        }

        const quizId = e.dataTransfer.getData('text/plain');
        if (!quizId) return;
        // Nảy nhẹ để xác nhận "đã nhận" ngay khi nhả chuột, không phải chờ ghi xong
        card.classList.remove('just-received');
        void card.offsetWidth; // ép trình duyệt chạy lại hoạt ảnh
        card.classList.add('just-received');
        setTimeout(() => card.classList.remove('just-received'), 700);
        await moveQuizToFolder(quizId, folder.id, folder.name);
    });

    return card;
}

// Lớp CSS của thẻ bộ đề. Toàn bộ diện mạo nằm ở style.css (.quiz-grid-card / .quiz-list-card)
// nên ở đây chỉ phát ra các "cờ" trạng thái — đổi giao diện không phải đụng vào JS.
function getQuizCardClassName(isSelected = false) {
    const base = S.libraryLayoutMode === 'list' ? 'quiz-list-card' : 'quiz-grid-card';
    if (!S.isSelectionMode) return base;
    return `${base} is-selectable${isSelected ? ' is-selected' : ''}`;
}

// Đổi mốc thời gian (Firestore Timestamp | Date | số | chuỗi) sang mili-giây. 0 nếu không có.
function toMillis(v) {
    if (!v) return 0;
    if (typeof v.toDate === 'function') return v.toDate().getTime();
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? 0 : t;
}

// Số câu đến hạn ôn (SRS) — đọc localStorage, rẻ. Lỗi thì coi như không có lịch ôn.
function dueCountSafe(quizId) {
    try { return countDueNow(quizId); } catch { return 0; }
}

// Khối tiến độ trên thẻ: thanh phần trăm + nhãn. Ba trạng thái, xếp theo độ tin cậy dữ liệu:
//   1) đã có lần làm            → điểm lần gần nhất, tô màu theo mức
//   2) đã đồng bộ, không có lần nào → "Chưa làm lần nào"
//   3) chưa đồng bộ             → nhãn trung tính, KHÔNG khẳng định gì (tránh dán nhãn sai)
function buildProgressBlock(quizId, slim = false) {
    const attempt = getLastAttempt(quizId);
    const barClass = slim ? 'qc-bar qc-bar-slim' : 'qc-bar';
    if (attempt && attempt.t > 0) {
        const pct = Math.max(0, Math.min(100, Math.round((attempt.s / attempt.t) * 100)));
        const tone = pct >= 80 ? 'is-good' : (pct >= 50 ? 'is-mid' : 'is-low');
        const timeText = formatRelativeTime(attempt.at) || 'gần đây';
        const title = `Lần làm gần nhất: đúng ${attempt.s}/${attempt.t} câu (${pct}%) — ${timeText}`;
        return `
            <div class="qc-progress ${tone}" title="${title}">
                <div class="qc-progress-row">
                    <span class="qc-progress-label"><i class="fas fa-rotate-left"></i>${timeText}</span>
                    <span class="qc-progress-value"><b>${pct}%</b><em>${attempt.s}/${attempt.t}</em></span>
                </div>
                <div class="${barClass} ${tone}"><span style="width:${pct}%"></span></div>
            </div>`;
    }
    const known = hasAttemptData();
    const label = known ? 'Chưa làm lần nào' : 'Sẵn sàng luyện tập';
    const icon = known ? 'far fa-circle' : 'fas fa-wand-magic-sparkles';
    return `
        <div class="qc-progress is-empty"${known ? ' title="Bạn chưa làm bộ đề này lần nào"' : ''}>
            <div class="qc-progress-row">
                <span class="qc-progress-label"><i class="${icon}"></i>${label}</span>
                <span class="qc-progress-value qc-start">Bắt đầu <i class="fas fa-arrow-right"></i></span>
            </div>
            <div class="${barClass} is-empty"><span style="width:0%"></span></div>
        </div>`;
}

// Hàng huy hiệu trạng thái: chỉ hiện cái nào ĐANG đúng; không có cái nào thì cả hàng biến mất.
function buildBadges(quizSet, offlineSaved, due, isNew = false) {
    const out = [];
    if (isNew) {
        out.push(`<span class="qc-badge qc-badge-new" title="Vừa thêm vào thư viện trong 24 giờ qua"><i class="fas fa-star"></i>MỚI</span>`);
    }
    if (due > 0) {
        out.push(`<span class="qc-badge qc-badge-due" title="Ôn ngắt quãng: ${due} câu đã đến hạn ôn lại"><i class="fas fa-bell"></i>${due} câu đến hạn</span>`);
    }
    if (offlineSaved) {
        out.push(`<span class="qc-badge qc-badge-offline" title="Đã tải về máy — làm được khi không có mạng"><i class="fas fa-circle-down"></i>Đã tải</span>`);
    }
    if (quizSet.isPublic === true) {
        out.push(`<span class="qc-badge qc-badge-public" title="Đang công khai — ai có link đều mở được"><i class="fas fa-globe"></i>Công khai</span>`);
    }
    return out.length ? `<div class="qc-badges">${out.join('')}</div>` : '';
}

// Dựng một thẻ bộ đề hoàn chỉnh (markup theo bố cục lưới/danh sách + toàn bộ listener).
// Thông tin trên thẻ đi theo đúng thứ tự người dùng cần: "bộ đề gì" → "to cỡ nào, mới cũ ra sao"
// → "đang học tới đâu" → "có gì đặc biệt" → "làm gì tiếp":
//   icon + tên  →  số câu · tạo lúc nào  →  thanh tiến độ  →  huy hiệu  →  nút Làm bài
// quizzesToDisplay/currentPage: danh sách & trang đang vẽ — cần cho long-press re-render đúng ngữ cảnh.
export function createQuizCard(quizSet, quizzesToDisplay, currentPage) {
    const card = document.createElement('div');
    const isSelected = S.selectedQuizIds.includes(quizSet.id);
    const pinned = isPinned(quizSet.id);
    const isNew = isNewQuiz(quizSet);
    const safeTitle = escapeHtml(quizSet.title || 'Không tên');
    const quizHref = `features/quiz/quiz.html?id=${quizSet.id}`;
    const offlineSaved = isOfflineSavedSync(quizSet.id);
    // Mục trong menu "..." để tải về / xóa bản offline
    const offlineMenuItem = offlineSaved
        ? `<button class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-pink-50 remove-offline-btn" data-id="${quizSet.id}"><i class="fas fa-trash-can mr-2.5 text-sky-400"></i>Xóa bản offline</button>`
        : `<button class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-pink-50 download-offline-btn" data-id="${quizSet.id}"><i class="fas fa-cloud-arrow-down mr-2.5 text-sky-500"></i>Tải về máy (offline)</button>`;
    const pinBtn = (size) => `<button class="pin-quiz-btn${pinned ? ' is-pinned' : ''}${size === 'sm' ? ' pin-quiz-btn-sm' : ''}" data-id="${quizSet.id}" title="${pinned ? 'Bỏ ghim' : 'Ghim lên đầu'}" aria-label="${pinned ? 'Bỏ ghim bộ đề' : 'Ghim bộ đề lên đầu'}" aria-pressed="${pinned}"><i class="fas fa-thumbtack"></i></button>`;

    // "MỚI" là một huy hiệu như mọi trạng thái khác — cùng hàng, cùng hình dáng viên thuốc,
    // chỉ khác là được tô đặc bằng đúng màu danh tính của thẻ nên nổi nhất trong hàng.
    // (Trước đây là cờ bookmark treo góc: lạc kiểu so với phần còn lại và tranh chỗ với nút "...".)
    const due = dueCountSafe(quizSet.id);
    const badgesHTML = buildBadges(quizSet, offlineSaved, due, isNew && !S.isSelectionMode);

    // Menu "..." gom TOÀN BỘ thao tác phụ (sửa/chia sẻ/di chuyển/offline/xóa) để mặt thẻ gọn gàng:
    // trên thẻ chỉ còn Ghim + Làm bài. Dùng chung cho cả bố cục lưới và danh sách.
    const quizMenuInnerHTML = `
        <button class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-pink-50 edit-quiz-content-btn" data-id="${quizSet.id}"><i class="fas fa-pen-alt mr-2.5 text-blue-400"></i>Sửa câu hỏi</button>
        <button class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-pink-50 edit-quiz-btn" data-id="${quizSet.id}" data-title="${safeTitle}"><i class="fas fa-edit mr-2.5 text-amber-400"></i>Sửa tên</button>
        <button class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-pink-50 duplicate-quiz-btn" data-id="${quizSet.id}"><i class="fas fa-copy mr-2.5 text-indigo-400"></i>Nhân bản</button>
        <button class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-pink-50 share-quiz-btn" data-id="${quizSet.id}"><i class="fas fa-share-alt mr-2.5 text-green-500"></i>Chia sẻ</button>
        <button class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-pink-50 toggle-public-btn" data-id="${quizSet.id}" data-public="${quizSet.isPublic === true}" title="${quizSet.isPublic === true ? 'Đang công khai — bấm để chuyển riêng tư (chỉ mình bạn xem)' : 'Đang riêng tư — bấm để công khai (ai có link đều mở được)'}"><i class="fas ${quizSet.isPublic === true ? 'fa-globe text-green-500' : 'fa-lock text-gray-400'} mr-2.5"></i>${quizSet.isPublic === true ? 'Công khai' : 'Riêng tư'}</button>
        <div class="border-t border-gray-100 my-1"></div>
        <button class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-pink-50 quiz-history-btn" data-id="${quizSet.id}"><i class="fas fa-history mr-2.5 text-pink-400"></i>Xem lịch sử làm bài</button>
        <button class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-pink-50 move-quiz-btn" data-id="${quizSet.id}"><i class="fas fa-folder-open mr-2.5 text-yellow-500"></i>Di chuyển</button>
        ${offlineMenuItem}
        <div class="border-t border-gray-100 my-1"></div>
        <button class="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 delete-quiz-btn" data-id="${quizSet.id}"><i class="fas fa-trash-alt mr-2.5 text-red-500"></i>Xóa bộ đề</button>`;

    card.className = getQuizCardClassName(isSelected);
    card.setAttribute('data-id', quizSet.id);

    // Ngày tạo: hiện dạng "3 ngày trước" cho dễ hình dung, giữ giờ/ngày đầy đủ ở tooltip.
    const createdMs = toMillis(quizSet.createdAt);
    let dateStr = 'Không rõ ngày tạo';
    let dateRel = 'Không rõ';
    if (createdMs) {
        const d = new Date(createdMs);
        const p2 = (n) => String(n).padStart(2, '0');
        dateStr = `Tạo lúc ${p2(d.getHours())}:${p2(d.getMinutes())} ${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
        dateRel = formatRelativeTime(createdMs) || 'vừa xong';
    }

    // Sắc thái màu + icon riêng cho từng bộ đề (ổn định theo id): dùng cho ô icon, vạch màu
    // bên mép thẻ và quầng sáng khi rê chuột → mỗi bộ đề có "danh tính" riêng, dễ nhận ra.
    const accent = getQuizAccent(quizSet.id || quizSet.title);
    const accentStyle = `background-image:linear-gradient(135deg, ${accent.from}, ${accent.to});`;
    card.style.setProperty('--qc-from', accent.from);
    card.style.setProperty('--qc-to', accent.to);

    const metaHTML = `
        <p class="qc-meta">
            <span class="qc-meta-item" title="${quizSet.questionCount} câu hỏi"><i class="fas fa-list-ol"></i><b>${quizSet.questionCount}</b> câu</span>
            <span class="qc-meta-dot" aria-hidden="true"></span>
            <span class="qc-meta-item qc-meta-time" title="${dateStr}"><i class="far fa-clock"></i>${dateRel}</span>
        </p>`;

    if (S.libraryLayoutMode === 'list') {
        const progressHTML = buildProgressBlock(quizSet.id, true);
        let checkboxHTML = '';
        if (S.isSelectionMode) {
            checkboxHTML = `
                <div class="qc-check">
                    <input type="checkbox" class="bulk-quiz-checkbox" ${isSelected ? 'checked' : ''} />
                </div>
            `;
        }

        let menuHTML = '';
        if (!S.isSelectionMode) {
            menuHTML = `
                <div class="relative flex-shrink-0 quiz-list-menu-wrap">
                    <button class="quiz-menu-btn" data-id="${quizSet.id}" title="Tùy chọn" aria-label="Tùy chọn bộ đề" aria-haspopup="true" aria-expanded="false"><i class="fas fa-ellipsis-v"></i></button>
                    <div class="quiz-menu hidden absolute right-0 top-9 bg-white rounded-xl shadow-xl border border-gray-100 z-20 min-w-[175px] py-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                        ${quizMenuInnerHTML}
                    </div>
                </div>
            `;
        }

        card.innerHTML = `
            <span class="qc-rail" aria-hidden="true"></span>
            ${checkboxHTML}
            <span class="quiz-card-icon quiz-card-icon-sm" style="${accentStyle}" aria-hidden="true">
                <i class="fas ${accent.icon}"></i>
            </span>
            <div class="qcl-body">
                <h3 class="qc-title" title="${safeTitle}">
                    <a href="${quizHref}">${safeTitle}</a>
                </h3>
                ${metaHTML}
                ${badgesHTML}
            </div>
            ${progressHTML}
            <div class="qcl-actions${S.isSelectionMode ? ' is-disabled' : ''}">
                ${pinBtn('sm')}
                <a href="${quizHref}" class="practice-btn practice-btn-sm" title="Làm bài" aria-label="Làm bài: ${safeTitle}">
                    <i class="fas fa-play"></i><span>Làm bài</span>
                </a>
            </div>
            ${menuHTML}
        `;
    } else {
        const progressHTML = buildProgressBlock(quizSet.id, false);
        let checkboxHTML = '';
        let menuHTML = '';
        if (S.isSelectionMode) {
            checkboxHTML = `
                <div class="qc-check qc-check-grid">
                    <input type="checkbox" class="bulk-quiz-checkbox" ${isSelected ? 'checked' : ''} />
                </div>
            `;
        } else {
            menuHTML = `
                <div class="qc-menu-wrap">
                    <button class="quiz-menu-btn" data-id="${quizSet.id}" title="Tùy chọn" aria-label="Tùy chọn bộ đề" aria-haspopup="true" aria-expanded="false"><i class="fas fa-ellipsis-v"></i></button>
                    <div class="quiz-menu hidden absolute right-0 top-9 bg-white rounded-xl shadow-xl border border-gray-100 z-20 min-w-[175px] py-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                        ${quizMenuInnerHTML}
                    </div>
                </div>
            `;
        }

        card.innerHTML = `
            <span class="qc-rail" aria-hidden="true"></span>
            ${checkboxHTML}
            ${menuHTML}
            <div class="qc-top${S.isSelectionMode ? ' is-shifted' : ''}">
                <span class="quiz-card-icon" style="${accentStyle}" aria-hidden="true">
                    <i class="fas ${accent.icon}"></i>
                </span>
                <div class="qc-head">
                    <h3 class="qc-title" title="${safeTitle}">
                        <a href="${quizHref}">${safeTitle}</a>
                    </h3>
                    ${metaHTML}
                </div>
            </div>
            ${badgesHTML}
            ${progressHTML}
            <div class="qc-foot${S.isSelectionMode ? ' is-disabled' : ''}">
                ${pinBtn('md')}
                <a href="${quizHref}" class="practice-btn">
                    <i class="fas fa-play"></i><span>Làm bài</span>
                </a>
            </div>
        `;
    }

    if (!S.isSelectionMode) {
        card.setAttribute('draggable', 'true');
        card.addEventListener('dragstart', (e) => {
            cancelPress(); // BẮT BUỘC: xem ghi chú ở cancelPress
            e.dataTransfer.setData('text/plain', quizSet.id);
            e.dataTransfer.effectAllowed = 'move';
            // Cờ trên <body>: CSS dựa vào đó làm nổi dải thư mục lên thành đích thả rõ ràng
            document.body.classList.add('is-dragging-quiz');
            setTimeout(() => card.classList.add('is-dragging'), 0);
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('is-dragging');
            document.body.classList.remove('is-dragging-quiz');
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

    // Nhấn giữ để vào chế độ chọn nhiều. Thêm phản hồi thị giác (thẻ lún + vòng tiến trình 600ms)
    // để cảm giác chủ đích, và dung sai di chuyển ~10px để rung tay/lướt nhẹ không huỷ oan.
    let longPressTimer = null;
    let isLongPressTriggered = false;
    let pressStartX = 0, pressStartY = 0;
    const MOVE_TOLERANCE = 10;

    const startPress = (e) => {
        // Bỏ qua khi bấm vào link hoặc bất kỳ nút nào trên thẻ (ghim, "...") — giữ nút
        // để chờ nó phản hồi mà bị nhảy vào chế độ chọn nhiều thì rất khó chịu.
        if (S.isSelectionMode || e.target.closest('a') || e.target.closest('button') || e.target.closest('.quiz-menu')) return;
        const pt = e.touches ? e.touches[0] : e;
        pressStartX = pt.clientX;
        pressStartY = pt.clientY;
        isLongPressTriggered = false;
        card.classList.add('is-holding');
        longPressTimer = setTimeout(() => {
            isLongPressTriggered = true;
            card.classList.remove('is-holding');
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

    // Gọi cả từ dragstart: trong lúc kéo native, mouseup/mousemove KHÔNG bắn ra nên đây là
    // chỗ duy nhất chặn được đồng hồ nhấn-giữ trước khi nó vẽ lại thư viện và làm hỏng cú kéo.
    const cancelPress = () => {
        card.classList.remove('is-holding');
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    };

    // Chỉ huỷ khi ngón tay đi quá ngưỡng (thực sự cuộn/kéo), không huỷ vì rung tay vài px.
    const onMove = (e) => {
        if (!longPressTimer) return;
        const pt = e.touches ? e.touches[0] : e;
        if (Math.abs(pt.clientX - pressStartX) > MOVE_TOLERANCE ||
            Math.abs(pt.clientY - pressStartY) > MOVE_TOLERANCE) {
            cancelPress();
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
    card.addEventListener('mousemove', onMove);
    card.addEventListener('touchmove', onMove, { passive: true });
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

        const duplicateBtn = card.querySelector('.duplicate-quiz-btn');
        if (duplicateBtn) {
            duplicateBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                duplicateQuizSet(this.getAttribute('data-id'), quizSet.title);
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

        const publicBtn = card.querySelector('.toggle-public-btn');
        if (publicBtn) {
            publicBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                const qId = this.getAttribute('data-id');
                const makePublic = this.getAttribute('data-public') !== 'true';
                toggleQuizPublic(qId, makePublic);
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

/**
 * Tải HÀNG LOẠT bộ đề về máy để làm offline (vd: trước khi lên máy bay / vào ca trực).
 * Dùng chung cho "tải cả thư mục" và "tải cả thư viện".
 * Tải tuần tự cho nhẹ máy và đếm được tiến độ; bộ đề đã có sẵn thì bỏ qua.
 * @param {(q:object)=>boolean} pick  lọc bộ đề nào cần tải
 * @param {{scope:string, title:string}} label  chữ hiển thị trong hộp thoại/thông báo
 */
export async function downloadQuizzesOffline(pick, label) {
    if (!navigator.onLine) {
        showToast('Cần có mạng để tải bộ đề về máy lần đầu.', 'warning');
        return;
    }
    if (!S.isLibraryFullyLoaded) await ensureFullLibraryLoaded();
    const quizzes = S.userQuizSets.filter(pick);
    const pending = quizzes.filter(q => !isOfflineSavedSync(q.id));

    if (!quizzes.length) { showToast(`${label.scope} đang trống.`, 'info'); return; }
    if (!pending.length) { showToast(`Cả ${quizzes.length} bộ đề của ${label.scope} đã có sẵn trên máy.`, 'info'); return; }

    const ok = await showConfirm(
        `Sẽ tải ${pending.length} bộ đề của ${label.scope} về máy để làm được khi không có mạng.`,
        { title: label.title, confirmText: 'Tải về', cancelText: 'Hủy' }
    );
    if (!ok) return;

    let done = 0, failed = 0;
    showToast(`Đang tải ${pending.length} bộ đề…`, 'info');
    for (const q of pending) {
        try {
            const snap = await getDoc(doc(db, 'quiz_sets', q.id));
            if (!snap.exists()) { failed++; continue; }
            await saveOfflineQuiz(q.id, snap.data());
            done++;
        } catch (e) {
            console.error('Lỗi tải bộ đề offline:', q.id, e);
            failed++;
        }
    }
    showToast(failed
        ? `Đã tải ${done}/${pending.length} bộ đề, ${failed} bộ lỗi.`
        : `Đã tải xong ${done} bộ đề của ${label.scope} về máy.`, failed ? 'warning' : 'success');
    rerenderCurrentView();
}

function handleDownloadFolderOffline(folderId, folderName) {
    return downloadQuizzesOffline(
        q => q.folderId === folderId,
        { scope: `thư mục "${folderName}"`, title: 'Tải cả thư mục về máy?' }
    );
}

/** Tải toàn bộ thư viện về máy — gắn với mục trong menu "..." của trang Thư viện. */
export function downloadWholeLibraryOffline() {
    return downloadQuizzesOffline(
        () => true,
        { scope: 'cả thư viện', title: 'Tải toàn bộ thư viện về máy?' }
    );
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
