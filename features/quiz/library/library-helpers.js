// File: features/quiz/library/library-helpers.js
// Hàm tiện ích + hằng số hiển thị (màu thư mục, sắc thái thẻ bộ đề) cho thư viện.
// Tách từ quiz-library-controller.js — logic giữ nguyên, chỉ đổi truy cập trạng thái sang S.xxx.

import { db } from '../../../core/firebase-init.js';
import { doc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { auth } from '../../../core/firebase-init.js';
import { S, TRASH_RETENTION_MS } from './library-state.js';
import { getLastAttempt, getLastTouchedAt } from './library-attempts.js';

export const FOLDER_COLORS = {
    amber: { bg: 'bg-amber-50/50 hover:bg-amber-50 border-amber-100', iconBg: 'bg-amber-100 text-amber-600' },
    pink: { bg: 'bg-pink-50/50 hover:bg-pink-50 border-pink-100', iconBg: 'bg-pink-100 text-pink-600' },
    blue: { bg: 'bg-blue-50/50 hover:bg-blue-50 border-blue-100', iconBg: 'bg-blue-100 text-blue-600' },
    green: { bg: 'bg-green-50/50 hover:bg-green-50 border-green-100', iconBg: 'bg-green-100 text-green-600' },
    purple: { bg: 'bg-purple-50/50 hover:bg-purple-50 border-purple-100', iconBg: 'bg-purple-100 text-purple-600' },
    red: { bg: 'bg-red-50/50 hover:bg-red-50 border-red-100', iconBg: 'bg-red-100 text-red-600' },
    indigo: { bg: 'bg-indigo-50/50 hover:bg-indigo-50 border-indigo-100', iconBg: 'bg-indigo-100 text-indigo-600' }
};

// Bảng màu rút gọn cho thao tác "đổi màu nhanh" trong menu thư mục
export const FOLDER_SWATCHES = [
    { key: 'amber', hex: '#f59e0b', label: 'Hổ phách' },
    { key: 'pink', hex: '#ec4899', label: 'Hồng' },
    { key: 'red', hex: '#ef4444', label: 'Đỏ' },
    { key: 'green', hex: '#22c55e', label: 'Xanh lá' },
    { key: 'blue', hex: '#3b82f6', label: 'Xanh dương' },
    { key: 'indigo', hex: '#6366f1', label: 'Chàm' },
    { key: 'purple', hex: '#a855f7', label: 'Tím' }
];

// Map nhanh từ tên màu sẵn có → mã hex, để tô màu toàn bộ thẻ thư mục theo một code path duy nhất
export const FOLDER_COLOR_HEX = Object.fromEntries(FOLDER_SWATCHES.map(s => [s.key, s.hex]));

export function tsToMillis(ts) {
    if (!ts) return 0;
    if (typeof ts.toDate === 'function') return ts.toDate().getTime();
    const t = new Date(ts).getTime();
    return Number.isNaN(t) ? 0 : t;
}
export function isTrashExpired(deletedAt) {
    return (Date.now() - tsToMillis(deletedAt)) > TRASH_RETENTION_MS;
}
// Xóa vĩnh viễn các mục đã quá hạn 30 ngày (chạy ké trên dữ liệu đã tải sẵn nên không tốn thêm lượt đọc)
export function purgeExpiredTrash(items, collectionName) {
    const expired = items.filter(it => it.deleted && isTrashExpired(it.deletedAt));
    if (!expired.length) return;
    Promise.allSettled(expired.map(it => deleteDoc(doc(db, collectionName, it.id))))
        .catch(err => console.warn('Lỗi dọn thùng rác quá hạn:', err));
}

// Sắp xếp thư mục: ghim lên đầu → theo thứ tự kéo-thả thủ công → mới nhất trước
export function sortUserFolders() {
    S.userFolders.sort((a, b) => {
        const ap = a.pinned ? 1 : 0;
        const bp = b.pinned ? 1 : 0;
        if (ap !== bp) return bp - ap;
        const ao = (typeof a.order === 'number') ? a.order : Number.MAX_SAFE_INTEGER;
        const bo = (typeof b.order === 'number') ? b.order : Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        return new Date(b.createdAt) - new Date(a.createdAt);
    });
}

// === LẦN MỞ THƯ MỤC GẦN NHẤT ===
// Lưu cục bộ (không ghi Firestore) thời điểm người dùng mở từng thư mục, để hiện "mở gần đây".
const FOLDER_LAST_OPENED_KEY = 'folderLastOpened';
export function getFolderLastOpenedMap() {
    try { return JSON.parse(localStorage.getItem(FOLDER_LAST_OPENED_KEY) || '{}'); }
    catch { return {}; }
}
export function markFolderOpened(folderId) {
    if (!folderId) return;
    const map = getFolderLastOpenedMap();
    map[folderId] = Date.now();
    try { localStorage.setItem(FOLDER_LAST_OPENED_KEY, JSON.stringify(map)); } catch {}
}

// Escape HTML để tránh chèn mã khi hiển thị tên bộ đề trong panel xem nhanh
export function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Định dạng "thời gian tương đối" gọn (vd: "2 giờ trước", "3 ngày trước")
export function formatRelativeTime(ms) {
    if (!ms) return '';
    const diff = Date.now() - ms;
    if (diff < 0) return 'vừa xong';
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'vừa xong';
    if (min < 60) return `${min} phút trước`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} giờ trước`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `${day} ngày trước`;
    const month = Math.floor(day / 30);
    if (month < 12) return `${month} tháng trước`;
    return `${Math.floor(month / 12)} năm trước`;
}

// Danh sách thư mục để hiển thị: lọc theo từ khoá tìm kiếm rồi sắp xếp theo chế độ đã chọn.
// Thư mục đã ghim luôn nằm trên đầu ở mọi chế độ (trừ khi đang tìm kiếm).
export function getFoldersForDisplay() {
    let list = S.userFolders.slice();
    const term = S.folderSearchTerm.trim().toLowerCase();
    if (term) {
        list = list.filter(f => (f.name || '').toLowerCase().includes(term));
    }
    if (S.folderSortMode === 'manual') {
        return list; // S.userFolders đã được sortUserFolders() sắp sẵn (ghim → kéo-thả → mới nhất)
    }
    const cmpByMode = (a, b) => {
        switch (S.folderSortMode) {
            case 'name': return (a.name || '').localeCompare(b.name || '', 'vi', { sensitivity: 'base' });
            case 'newest': return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
            case 'count': {
                const ca = S.userQuizSets.filter(q => q.folderId === a.id).length;
                const cb = S.userQuizSets.filter(q => q.folderId === b.id).length;
                return cb - ca;
            }
            default: return 0;
        }
    };
    list.sort((a, b) => {
        const ap = a.pinned ? 1 : 0;
        const bp = b.pinned ? 1 : 0;
        if (ap !== bp) return bp - ap; // ghim vẫn ưu tiên lên đầu
        return cmpByMode(a, b);
    });
    return list;
}

// Áp dụng số cột tuỳ chỉnh cho lưới bộ đề (chỉ ở chế độ lưới; danh sách bỏ qua)
export function applyQuizGridColumns(container) {
    if (!container) return;
    if (S.libraryLayoutMode === 'list' || !S.libraryGridCols || S.libraryGridCols === 'auto') {
        container.style.gridTemplateColumns = '';
    } else {
        container.style.gridTemplateColumns = `repeat(${S.libraryGridCols}, minmax(0, 1fr))`;
    }
}

// Áp dụng số cột tuỳ chỉnh cho lưới thư mục
export function applyFolderGridColumns(container) {
    if (!container) return;
    if (!S.folderGridCols || S.folderGridCols === 'auto') {
        container.classList.remove('folders-custom-cols');
        container.style.removeProperty('--folder-grid-cols');
    } else {
        container.classList.add('folders-custom-cols');
        container.style.setProperty('--folder-grid-cols', `repeat(${S.folderGridCols}, minmax(0, 1fr))`);
    }
}

// === GHIM BỘ ĐỀ (PIN) — lưu cục bộ theo từng tài khoản ===
function pinnedStorageKey() {
    const uid = auth.currentUser ? auth.currentUser.uid : 'anon';
    return `pinnedQuizIds_${uid}`;
}
export function loadPinnedQuizIds() {
    try {
        S.pinnedQuizIds = JSON.parse(localStorage.getItem(pinnedStorageKey()) || '[]');
        if (!Array.isArray(S.pinnedQuizIds)) S.pinnedQuizIds = [];
    } catch {
        S.pinnedQuizIds = [];
    }
}
export function savePinnedQuizIds() {
    localStorage.setItem(pinnedStorageKey(), JSON.stringify(S.pinnedQuizIds));
}
export function isPinned(quizId) { return S.pinnedQuizIds.includes(quizId); }
// Đảo trạng thái ghim trong dữ liệu (KHÔNG render lại — nơi gọi tự quyết định vẽ lại lúc nào)
export function togglePinData(quizId) {
    const idx = S.pinnedQuizIds.indexOf(quizId);
    if (idx >= 0) S.pinnedQuizIds.splice(idx, 1);
    else S.pinnedQuizIds.push(quizId);
    savePinnedQuizIds();
}

// === HỖ TRỢ SẮP XẾP / LỌC ===
export function getQuizTime(q) {
    if (q.createdAt && typeof q.createdAt.toDate === 'function') return q.createdAt.toDate().getTime();
    return q.createdAt ? new Date(q.createdAt).getTime() : 0;
}
export function isNewQuiz(q) {
    return (Date.now() - getQuizTime(q)) <= 24 * 60 * 60 * 1000;
}
export function applyLibraryFilter(list) {
    if (S.libraryFilterMode === 'pinned') return list.filter(q => isPinned(q.id));
    if (S.libraryFilterMode === 'recent') {
        // "Gần đây" = mới tạo HOẶC mới mở/làm bài trong vòng 7 ngày
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        return list.filter(q => getQuizTime(q) >= weekAgo || getLastTouchedAt(q.id) >= weekAgo);
    }
    if (S.libraryFilterMode === 'unattempted') {
        return list.filter(q => !getLastAttempt(q.id));
    }
    return list;
}
export function sortQuizList(list) {
    const arr = [...list];
    switch (S.librarySortMode) {
        case 'oldest': arr.sort((a, b) => getQuizTime(a) - getQuizTime(b)); break;
        case 'name': arr.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'vi', { sensitivity: 'base' })); break;
        case 'count': arr.sort((a, b) => (b.questionCount || 0) - (a.questionCount || 0)); break;
        case 'newest':
        default: arr.sort((a, b) => getQuizTime(b) - getQuizTime(a));
    }
    // Bộ đề đã ghim luôn nổi lên đầu (sort ổn định nên giữ nguyên thứ tự còn lại)
    arr.sort((a, b) => (isPinned(b.id) ? 1 : 0) - (isPinned(a.id) ? 1 : 0));
    return arr;
}

// Bảng màu gradient cho thẻ bộ đề — mỗi bộ đề mang một sắc thái + icon riêng để
// thư viện sinh động, dễ phân biệt và "mời gọi" click hơn (đặc biệt trên điện thoại).
const QUIZ_ACCENTS = [
    { from: '#ec4899', to: '#fb7185', icon: 'fa-layer-group' },
    { from: '#8b5cf6', to: '#c084fc', icon: 'fa-book-open' },
    { from: '#0ea5e9', to: '#38bdf8', icon: 'fa-file-lines' },
    { from: '#10b981', to: '#34d399', icon: 'fa-flask' },
    { from: '#f59e0b', to: '#fbbf24', icon: 'fa-lightbulb' },
    { from: '#6366f1', to: '#818cf8', icon: 'fa-brain' },
    { from: '#f43f5e', to: '#fb7185', icon: 'fa-heart-pulse' },
    { from: '#14b8a6', to: '#2dd4bf', icon: 'fa-microscope' },
];
export function getQuizAccent(seed) {
    const s = String(seed || '');
    let hash = 0;
    for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
    return QUIZ_ACCENTS[hash % QUIZ_ACCENTS.length];
}

// Hiện menu thư mục bằng position:fixed (định vị theo viewport) để menu không bị
// container cuộn ngang hay khung thẻ cắt mất phần dưới.
// Menu thư mục phải được ĐƯA RA THẲNG <body> trước khi định vị.
// Lý do: .folder-mini-card:hover có `transform` — mà phần tử có transform trở thành gốc toạ độ
// cho mọi con `position:fixed` VÀ tạo một tầng xếp chồng riêng. Để menu nằm trong thẻ thì khi
// đang rê chuột (đúng lúc bấm nút "..."), menu vừa nhảy sai chỗ vừa bị các thẻ bộ đề đè lên.
// Ra body là hết cả hai, không phụ thuộc transform/overflow của bất kỳ tổ tiên nào.
export function positionFolderMenu(menu, btn) {
    if (menu.parentElement !== document.body) {
        menu._folderMenuHome = menu.parentElement; // nhớ chỗ cũ để trả về khi đóng
        document.body.appendChild(menu);
    }
    menu.style.position = 'fixed';
    menu.style.zIndex = '60';
    menu.style.right = 'auto';  // huỷ class Tailwind right-0 (nếu không menu sẽ bị kéo giãn)
    menu.style.bottom = 'auto';
    menu.style.top = '-9999px';
    menu.style.left = '-9999px';
    menu.classList.remove('hidden'); // bỏ ẩn để đo được kích thước thật

    const margin = 8;
    const br = btn.getBoundingClientRect();
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;

    let left = br.right - mw; // canh mép phải menu với mép phải nút ⋮
    if (left + mw > window.innerWidth - margin) left = window.innerWidth - margin - mw;
    if (left < margin) left = margin;

    let top = br.bottom + 6; // mặc định thả xuống dưới
    if (top + mh > window.innerHeight - margin) {
        top = br.top - 6 - mh; // không đủ chỗ thì bật lên trên nút
        if (top < margin) top = margin;
    }

    menu.style.top = top + 'px';
    menu.style.left = left + 'px';
}

export function resetFolderMenuPosition(menu) {
    menu.classList.add('hidden');
    // Trả menu về đúng thẻ thư mục của nó, tránh để lại rác trong <body>
    if (menu._folderMenuHome && menu.parentElement === document.body) {
        menu._folderMenuHome.appendChild(menu);
        menu._folderMenuHome = null;
    }
    menu.style.position = '';
    menu.style.zIndex = '';
    menu.style.right = '';
    menu.style.bottom = '';
    menu.style.top = '';
    menu.style.left = '';
}

// Vẽ lại danh sách thư mục trong lúc menu đang mở sẽ bỏ lại menu mồ côi trong <body>.
// Gọi hàm này trước mỗi lần vẽ lại dải thư mục.
export function removeOrphanFolderMenus() {
    document.querySelectorAll('body > .folder-menu').forEach(m => m.remove());
}

// Các token chỉ kiểu dáng (style) của FontAwesome — không phải tên icon
const FA_STYLE_TOKENS = new Set([
    'fa', 'fas', 'far', 'fab', 'fal', 'fat', 'fad', 'fass',
    'fa-solid', 'fa-regular', 'fa-brands', 'fa-light', 'fa-thin', 'fa-duotone', 'fa-sharp'
]);

// Nhận diện tên icon từ bất kỳ định dạng nào người dùng dán vào:
//   "fa-bell"  |  "fas fa-bell"  |  "fa-solid fa-bell"  |  <i class="fa-solid fa-megaphone"></i>
// Trả về tên icon dạng "fa-bell", hoặc null nếu không tìm thấy.
export function parseFontAwesomeIcon(raw) {
    if (!raw) return null;
    let text = String(raw).trim();
    // Nếu dán nguyên thẻ HTML, lấy nội dung trong class="..."
    const classMatch = text.match(/class\s*=\s*["']([^"']+)["']/i);
    if (classMatch) text = classMatch[1];
    text = text.replace(/[<>"']/g, ' '); // bỏ ký tự thẻ còn sót
    const tokens = text.split(/\s+/).filter(Boolean);
    const iconToken = tokens.find(t => t.startsWith('fa-') && !FA_STYLE_TOKENS.has(t));
    return iconToken || null;
}
