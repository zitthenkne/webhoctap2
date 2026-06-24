// trash.js — Trang Thùng rác độc lập (tách khỏi index.html cho nhẹ)
// Hiển thị thư mục / bộ đề đã xóa, cho khôi phục hoặc xóa vĩnh viễn; tự dọn mục quá hạn 30 ngày.

import { db, auth } from '../../core/firebase-init.js';
import {
    collection, query, where, getDocs, doc, deleteDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import { showToast, showConfirm } from '../../core/utils.js';

const TRASH_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * DAY_MS;

let trashedFolders = [];
let trashedQuizzes = [];
let activeFolderIds = new Set(); // thư mục còn hoạt động (để khôi phục bộ đề không bị "mồ côi")

const listEl = document.getElementById('trash-list');
const countEl = document.getElementById('trash-count');
const emptyBtn = document.getElementById('empty-trash-btn');

// === HELPERS ===
function tsToMillis(ts) {
    if (!ts) return 0;
    if (typeof ts.toDate === 'function') return ts.toDate().getTime();
    const t = new Date(ts).getTime();
    return Number.isNaN(t) ? 0 : t;
}
function isTrashExpired(deletedAt) {
    return (Date.now() - tsToMillis(deletedAt)) > TRASH_RETENTION_MS;
}
function trashDaysLeft(deletedAt) {
    const left = TRASH_RETENTION_MS - (Date.now() - tsToMillis(deletedAt));
    return Math.max(0, Math.ceil(left / DAY_MS));
}
function purgeExpiredTrash(items, collectionName) {
    const expired = items.filter(it => it.deleted && isTrashExpired(it.deletedAt));
    if (!expired.length) return;
    Promise.allSettled(expired.map(it => deleteDoc(doc(db, collectionName, it.id))))
        .catch(err => console.warn('Lỗi dọn thùng rác quá hạn:', err));
}

// === TẢI DỮ LIỆU ===
async function loadTrashItems(userId) {
    const [fSnap, qSnap] = await Promise.all([
        getDocs(query(collection(db, "quiz_folders"), where("userId", "==", userId))),
        getDocs(query(collection(db, "quiz_sets"), where("userId", "==", userId)))
    ]);
    const allFolders = fSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const allQuizzes = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Dọn mục quá hạn 30 ngày rồi mới hiển thị
    purgeExpiredTrash(allFolders, "quiz_folders");
    purgeExpiredTrash(allQuizzes, "quiz_sets");

    activeFolderIds = new Set(allFolders.filter(f => !f.deleted).map(f => f.id));
    trashedFolders = allFolders.filter(f => f.deleted && !isTrashExpired(f.deletedAt))
        .sort((a, b) => tsToMillis(b.deletedAt) - tsToMillis(a.deletedAt));
    trashedQuizzes = allQuizzes.filter(q => q.deleted && !isTrashExpired(q.deletedAt))
        .sort((a, b) => tsToMillis(b.deletedAt) - tsToMillis(a.deletedAt));
}

// === RENDER ===
function renderTrash() {
    if (!listEl) return;
    const total = trashedFolders.length + trashedQuizzes.length;
    if (countEl) countEl.textContent = total ? `${total} mục` : '';

    if (total === 0) {
        listEl.innerHTML = `
            <div class="flex flex-col items-center justify-center text-center py-16 px-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div class="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                    <i class="fas fa-trash-can text-2xl text-gray-300"></i>
                </div>
                <h4 class="font-bold text-gray-600">Thùng rác trống</h4>
                <p class="text-xs text-gray-400 mt-1">Thư mục và bộ đề đã xóa sẽ xuất hiện ở đây.</p>
            </div>`;
        if (emptyBtn) emptyBtn.classList.add('hidden');
        return;
    }
    if (emptyBtn) emptyBtn.classList.remove('hidden');

    const folderRows = trashedFolders.map(f => trashRowHTML({
        kind: 'folder', id: f.id, title: f.name || 'Thư mục không tên',
        meta: 'Thư mục', icon: f.icon || 'fa-folder', deletedAt: f.deletedAt
    })).join('');
    const quizRows = trashedQuizzes.map(q => trashRowHTML({
        kind: 'quiz', id: q.id, title: q.title || 'Bộ đề không tên',
        meta: `${q.questionCount || 0} câu hỏi`, icon: 'fa-file-alt', deletedAt: q.deletedAt
    })).join('');

    listEl.innerHTML = folderRows + quizRows;

    listEl.querySelectorAll('.trash-restore-btn').forEach(btn => {
        btn.addEventListener('click', () => restoreTrashItem(btn.dataset.kind, btn.dataset.id));
    });
    listEl.querySelectorAll('.trash-delete-btn').forEach(btn => {
        btn.addEventListener('click', () => permanentlyDeleteTrashItem(btn.dataset.kind, btn.dataset.id));
    });
}

function trashRowHTML({ kind, id, title, meta, icon, deletedAt }) {
    const left = trashDaysLeft(deletedAt);
    const urgent = left <= 3;
    return `
        <div class="flex items-center gap-3 p-3.5 rounded-xl border border-gray-100 bg-white shadow-sm hover:border-pink-200 transition">
            <div class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${kind === 'folder' ? 'bg-amber-50 text-amber-500' : 'bg-pink-50 text-pink-500'}">
                <i class="fas ${icon}"></i>
            </div>
            <div class="min-w-0 flex-1">
                <h4 class="text-sm font-bold text-gray-800 truncate" title="${title}">${title}</h4>
                <div class="flex items-center gap-2 mt-0.5">
                    <span class="text-[11px] text-gray-400">${meta}</span>
                    <span class="text-[11px] font-semibold ${urgent ? 'text-red-500' : 'text-gray-400'}"><i class="far fa-clock mr-1"></i>Còn ${left} ngày</span>
                </div>
            </div>
            <button class="trash-restore-btn w-9 h-9 flex items-center justify-center text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition" data-kind="${kind}" data-id="${id}" title="Khôi phục"><i class="fas fa-rotate-left"></i></button>
            <button class="trash-delete-btn w-9 h-9 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" data-kind="${kind}" data-id="${id}" title="Xóa vĩnh viễn"><i class="fas fa-trash-alt"></i></button>
        </div>`;
}

// === THAO TÁC ===
async function refresh() {
    const user = auth.currentUser;
    if (!user) return;
    await loadTrashItems(user.uid);
    renderTrash();
}

async function restoreTrashItem(kind, id) {
    const user = auth.currentUser;
    if (!user) return;
    try {
        if (kind === 'folder') {
            await updateDoc(doc(db, "quiz_folders", id), { deleted: false, deletedAt: null });
            // Khôi phục các bộ đề đã vào thùng rác cùng thư mục
            const cascaded = trashedQuizzes.filter(q => q.trashedWithFolder === id);
            await Promise.all(cascaded.map(q =>
                updateDoc(doc(db, "quiz_sets", q.id), { deleted: false, deletedAt: null, trashedWithFolder: null })
            ));
            showToast('Đã khôi phục thư mục.', 'success');
        } else {
            const quiz = trashedQuizzes.find(q => q.id === id);
            const updates = { deleted: false, deletedAt: null, trashedWithFolder: null };
            // Nếu thư mục cha không còn hoạt động → đưa bộ đề về thư viện gốc để không bị "mồ côi"
            if (quiz && quiz.folderId && !activeFolderIds.has(quiz.folderId)) {
                updates.folderId = null;
            }
            await updateDoc(doc(db, "quiz_sets", id), updates);
            showToast('Đã khôi phục bộ đề.', 'success');
        }
        await refresh();
    } catch (err) {
        console.error('Lỗi khôi phục:', err);
        showToast('Khôi phục thất bại!', 'error');
    }
}

async function permanentlyDeleteTrashItem(kind, id) {
    const ok = await showConfirm(
        'Mục này sẽ bị xóa vĩnh viễn và KHÔNG THỂ khôi phục. Bạn có chắc chắn?',
        { title: 'Xóa vĩnh viễn?', confirmText: 'Xóa vĩnh viễn', cancelText: 'Hủy', tone: 'danger' }
    );
    if (!ok) return;
    const user = auth.currentUser;
    if (!user) return;
    try {
        if (kind === 'folder') {
            const cascaded = trashedQuizzes.filter(q => q.trashedWithFolder === id);
            await Promise.all(cascaded.map(q => deleteDoc(doc(db, "quiz_sets", q.id))));
            await deleteDoc(doc(db, "quiz_folders", id));
        } else {
            await deleteDoc(doc(db, "quiz_sets", id));
        }
        showToast('Đã xóa vĩnh viễn.', 'success');
        await refresh();
    } catch (err) {
        console.error('Lỗi xóa vĩnh viễn:', err);
        showToast('Xóa vĩnh viễn thất bại!', 'error');
    }
}

async function emptyTrash() {
    const total = trashedFolders.length + trashedQuizzes.length;
    if (total === 0) return;
    const ok = await showConfirm(
        `Tất cả ${total} mục trong thùng rác sẽ bị xóa vĩnh viễn và KHÔNG THỂ khôi phục. Bạn có chắc chắn?`,
        { title: 'Dọn sạch thùng rác?', confirmText: 'Xóa tất cả', cancelText: 'Hủy', tone: 'danger' }
    );
    if (!ok) return;
    const user = auth.currentUser;
    if (!user) return;
    try {
        const ops = [];
        trashedQuizzes.forEach(q => ops.push(deleteDoc(doc(db, "quiz_sets", q.id))));
        trashedFolders.forEach(f => ops.push(deleteDoc(doc(db, "quiz_folders", f.id))));
        await Promise.all(ops);
        showToast('Đã dọn sạch thùng rác.', 'success');
        await refresh();
    } catch (err) {
        console.error('Lỗi dọn thùng rác:', err);
        showToast('Dọn thùng rác thất bại!', 'error');
    }
}

if (emptyBtn) emptyBtn.addEventListener('click', emptyTrash);

// === KHỞI TẠO: chờ trạng thái đăng nhập ===
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        if (listEl) {
            listEl.innerHTML = `
                <div class="flex flex-col items-center justify-center text-center py-16 px-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                    <div class="w-16 h-16 rounded-full bg-pink-50 flex items-center justify-center mb-3">
                        <i class="fas fa-user-lock text-2xl text-pink-300"></i>
                    </div>
                    <h4 class="font-bold text-gray-600">Cần đăng nhập</h4>
                    <p class="text-xs text-gray-400 mt-1 mb-4">Vui lòng đăng nhập để xem thùng rác của bạn.</p>
                    <a href="../../index.html" class="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-pink-500 to-rose-400 text-white rounded-xl font-bold text-sm shadow-md">
                        <i class="fas fa-arrow-right-to-bracket"></i> Về trang chủ để đăng nhập
                    </a>
                </div>`;
        }
        if (countEl) countEl.textContent = '';
        if (emptyBtn) emptyBtn.classList.add('hidden');
        return;
    }
    try {
        await loadTrashItems(user.uid);
        renderTrash();
    } catch (err) {
        console.error('Lỗi tải thùng rác:', err);
        if (listEl) listEl.innerHTML = '<p class="text-center text-red-500 py-12">Không thể tải thùng rác: ' + err.message + '</p>';
    }
});
