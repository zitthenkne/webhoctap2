// File: features/quiz/folder.js
// Trang xem một THƯ MỤC ĐƯỢC CHIA SẺ: ai có link cũng mở được, không cần đăng nhập.
//
// Điều kiện để trang này có dữ liệu (do rule Firestore quyết định):
//   - thư mục phải có isPublic == true  → mới đọc được tên/màu/icon
//   - từng bộ đề bên trong cũng phải isPublic == true → mới hiện trong danh sách
// Chủ thư mục bật cả hai bằng một thao tác "Chia sẻ thư mục" ở thư viện.
//
// CHIA SẺ RIÊNG (2026-10-27): thư mục/bộ đề có `sharedWith` chứa email (đã xác nhận) của người đang đăng nhập cũng mở được.
// Khi đó không lọc isPublic được nữa → lấy MỌI thứ chia sẻ cho mình (sharedWith array-contains email) rồi lọc theo thư mục ở máy
// (vài chục doc, khỏi cần chỉ mục ghép). `?shared=me`: trang "Được chia sẻ với tôi" — liệt kê các mục gốc được chia sẻ cho mình.

import { db } from '../../core/firebase-init.js';
import { whenAuthReady, refreshEmailVerified } from '../../core/auth-session.js';
import { runQueryRest } from '../../core/firestore-rest.js';
import { markSharedSeen } from './shared-inbox.js';
import { rememberOpened, listShelf, forgetShelf, togglePinShelf, clearShelf, localStatsFor } from './local-shelf.js';
import { showToast, showConfirm } from '../../core/utils.js';
import {
    doc, getDoc, collection, query, where, getDocs, setDoc, arrayRemove, writeBatch
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

// Giữ khớp với FOLDER_SWATCHES ở library-helpers.js
const FOLDER_COLOR_HEX = {
    amber: '#f59e0b', pink: '#ec4899', red: '#ef4444', green: '#22c55e',
    blue: '#3b82f6', indigo: '#6366f1', purple: '#a855f7'
};

// Bảng màu + icon cho thẻ bộ đề, GIỮ KHỚP library-helpers.js để hai nơi nhìn như một
const QUIZ_ACCENTS = [
    { from: '#f472b6', to: '#f9a8d4', icon: 'fa-layer-group' },   // hồng phấn
    { from: '#b9a2f0', to: '#d8ccf7', icon: 'fa-book-open' },     // oải hương nhạt
    { from: '#5cbcef', to: '#a5dcf7', icon: 'fa-file-lines' },    // xanh trời
    { from: '#4cc79a', to: '#9be3c7', icon: 'fa-flask' },         // bạc hà
    { from: '#f2b53c', to: '#f8d98c', icon: 'fa-lightbulb' },     // vàng bơ
    { from: '#f59a6e', to: '#f9c4a8', icon: 'fa-brain' },         // hồng đào
    { from: '#f2708e', to: '#f8b0c0', icon: 'fa-heart-pulse' },   // hồng san hô
    { from: '#3fc4b4', to: '#93e0d6', icon: 'fa-microscope' },    // ngọc lam
];
function accentFor(seed) {
    const s = String(seed || '');
    let hash = 0;
    for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
    return { ...QUIZ_ACCENTS[hash % QUIZ_ACCENTS.length], paper: ['caro', 'dot', 'lined'][(hash >>> 3) % 3], tilt: (((hash >>> 5) % 7) - 3) * 0.2 };
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Mạng chập chờn (hoặc SDK Firestore kẹt trong vòng thử lại) không được để người xem
// ngồi nhìn khung chờ mãi — quá hạn thì báo rõ và mời tải lại.
function withTimeout(promise, ms = 12000) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Quá thời gian chờ')), ms))
    ]);
}

function showMessage(icon, title, desc) {
    const box = document.getElementById('folder-message');
    document.getElementById('folder-quiz-list').innerHTML = '';
    document.getElementById('folder-message-icon').className = `fas ${icon} text-3xl text-pink-300`;
    document.getElementById('folder-message-title').textContent = title;
    document.getElementById('folder-message-desc').textContent = desc;
    box.classList.remove('hidden');
}

// Khung chờ: dùng đúng thẻ chờ của thư viện để hai màn hình đồng bộ
function renderSkeleton(n = 6) {
    document.getElementById('folder-quiz-list').innerHTML = Array.from({ length: n }).map(() => `
        <div class="quiz-skeleton-card">
            <div class="qs-top">
                <div class="skeleton-line qs-icon"></div>
                <div class="qs-lines">
                    <div class="skeleton-line h-3.5 w-4/5"></div>
                    <div class="skeleton-line h-2.5 w-2/5"></div>
                </div>
            </div>
            <div class="skeleton-line h-2 w-full rounded-full"></div>
            <div class="qs-foot">
                <div class="skeleton-line h-9 flex-1 rounded-xl"></div>
            </div>
        </div>`).join('');
}

// Thư mục con: cùng kiểu "bìa hồ sơ giấy" với thư viện (style.css), là link mở folder.html của nó
// `shared`: trang "Được chia sẻ với tôi" — thêm dòng "từ ai" và nút Rời chia sẻ / Lưu bản sao (xử lý ở bindSharedActions).
function renderSubFolders(folders, { shared = false } = {}) {
    const box = document.getElementById('folder-sub-list');
    if (!box) return;
    if (!folders.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.innerHTML = folders.map((f, i) => {
        const hex = (f.color || '').startsWith('#') ? f.color : (FOLDER_COLOR_HEX[f.color] || FOLDER_COLOR_HEX.amber);
        const name = escapeHtml(f.name || 'Thư mục');
        const sub = shared && f.sharedBy ? `từ ${escapeHtml(f.sharedBy)}` : 'Mở thư mục';
        const leave = shared
            ? `<button type="button" class="shared-leave-btn absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/80 text-gray-400 hover:text-red-500 text-xs" data-kind="folder" data-id="${escapeHtml(f.id)}" title="Rời chia sẻ (ẩn thư mục này khỏi danh sách của bạn)" aria-label="Rời chia sẻ"><i class="fas fa-right-from-bracket"></i></button>`
            : '';
        return `
        <a class="folder-mini-card relative" href="folder.html?id=${encodeURIComponent(f.id)}" data-tab="Thư mục" data-fill="2" style="--fc:${hex};--card-index:${Math.min(i, 12)}">
            <span class="fd-papers" aria-hidden="true"><i></i><i></i><i></i></span>
            <div class="folder-mini-card-content">
                <div class="folder-icon-wrapper"><i class="fas ${escapeHtml(f.icon || 'fa-folder')}"></i></div>
                <div class="min-w-0 flex-1"><h4 class="fd-name" title="${name}">${name}</h4><p class="folder-meta-time">${sub}</p></div>
            </div>
            ${leave}
        </a>`;
    }).join('');
    box.classList.remove('hidden');
}

function renderQuizzes(quizzes, { shared = false } = {}) {
    const list = document.getElementById('folder-quiz-list');
    list.innerHTML = quizzes.map((q, i) => {
        const a = accentFor(q.id);
        const title = escapeHtml(q.title || 'Không tên');
        return `
        <div class="quiz-grid-card" data-paper="${a.paper}" style="--qc-from:${a.from};--qc-to:${a.to};--qc-tilt:${a.tilt}deg;--card-index:${Math.min(i, 12)}">
            <span class="qc-rail" aria-hidden="true"></span>
            <div class="qc-top">
                <span class="quiz-card-icon" aria-hidden="true">
                    <i class="fas ${a.icon}"></i>
                </span>
                <div class="qc-head">
                    <h3 class="qc-title" title="${title}"><a href="quiz.html?id=${q.id}">${title}</a></h3>
                    <p class="qc-meta">
                        <span class="qc-meta-item"><i class="fas fa-list-ol"></i><b>${q.questionCount || 0}</b> câu</span>
                        ${shared && q.sharedBy ? `<span class="qc-meta-item"><i class="fas fa-user"></i>từ ${escapeHtml(q.sharedBy)}</span>` : ''}
                        ${shared ? `<span class="qc-meta-item"><i class="fas ${canEdit(q) ? 'fa-pen' : 'fa-eye'}"></i>${canEdit(q) ? 'Người chỉnh sửa' : 'Người xem'}</span>` : ''}
                    </p>
                </div>
            </div>
            <div class="qc-foot">
                <a href="quiz.html?id=${q.id}" class="practice-btn"><i class="fas fa-play"></i><span>Làm bài</span></a>
                ${shared && canEdit(q) ? `
                <a href="../editor/editor.html?id=${encodeURIComponent(q.id)}" class="practice-btn" style="flex:0 0 auto" title="Sửa câu hỏi (bạn là Người chỉnh sửa)"><i class="fas fa-pen"></i></a>` : ''}
                ${shared && (canEdit(q) || q.noCopy !== true) ? `
                <button type="button" class="shared-copy-btn practice-btn" style="flex:0 0 auto" data-id="${escapeHtml(q.id)}" title="Lưu một bản sao vào thư viện của bạn (sửa được, không ảnh hưởng bản gốc)"><i class="fas fa-copy"></i></button>` : ''}
                ${shared ? `
                <button type="button" class="shared-leave-btn practice-btn" style="flex:0 0 auto" data-kind="quiz" data-id="${escapeHtml(q.id)}" title="Rời chia sẻ (ẩn bộ đề này khỏi danh sách của bạn)"><i class="fas fa-right-from-bracket"></i></button>` : ''}
            </div>
        </div>`;
    }).join('');
}

// Trang này chỉ liệt kê bộ đề (tên + số câu) nhưng SDK kéo NGUYÊN mỗi bộ đề kèm mảng câu hỏi (hàng trăm KB × số bộ đề × MỌI người mở link).
// REST có chọn trường chỉ lấy vài trường mô tả; lỗi gì thì lùi về SDK như cũ.
const SET_META = ['title', 'questionCount', 'createdAt', 'folderId', 'isPublic', 'deleted', 'deletedAt'];
async function fetchFolderSets(folderId) {
    try {
        return await runQueryRest({ collection: 'quiz_sets', where: [['folderId', folderId], ['isPublic', true]], select: SET_META });
    } catch (err) {
        console.warn('Tải nhanh danh sách bộ đề thất bại, quay về SDK:', err && err.message);
        const snap = await getDocs(query(
            collection(db, 'quiz_sets'),
            where('folderId', '==', folderId),
            where('isPublic', '==', true)
        ));
        return snap.docs.map(d => { const { questions, ...meta } = d.data(); return { id: d.id, ...meta }; });
    }
}

// Mọi bộ đề + thư mục chia sẻ riêng cho tài khoản đang đăng nhập (chỉ vài trường mô tả). Rule đòi truy vấn có đúng điều kiện này.
async function fetchSharedWithMe(email) {
    const mine = [['sharedWith', email, 'ARRAY_CONTAINS']];
    const [sets, folders] = await Promise.all([
        runQueryRest({ collection: 'quiz_sets', where: mine, select: [...SET_META, 'userId', 'sharedBy', 'editors', 'noCopy'], requireUser: true }),
        runQueryRest({ collection: 'quiz_folders', where: mine, select: ['name', 'color', 'icon', 'parentId', 'deleted', 'userId', 'sharedBy'], requireUser: true })
    ]);
    // total đếm CẢ mục trong thùng rác — khớp truy vấn đếm của shared-inbox.js (chấm "mục mới")
    return { sets: sets.filter(q => !q.deleted), folders: folders.filter(f => !f.deleted), total: sets.length + folders.length };
}

// Người đang đăng nhập có nhận chia sẻ riêng được không. null = chưa đăng nhập; { email, verified, uid }.
// checkVerify: email chưa xác nhận thì hỏi lại máy chủ (1 lượt mạng) — chỉ làm khi thật cần, không làm chậm thư mục công khai.
async function viewer({ checkVerify = true } = {}) {
    const u = await whenAuthReady(4000);
    if (!u || !u.email || u.offline) return null;
    const verified = u.emailVerified || (checkVerify && await refreshEmailVerified({ force: true }));
    return { email: u.email.toLowerCase(), verified: !!verified, uid: u.uid };
}

const byName = (a, b) => (a.name || a.title || '').localeCompare(b.name || b.title || '', 'vi', { sensitivity: 'base' });

// Email (đã xác nhận) của người đang xem — để biết mình là Người chỉnh sửa của bộ đề nào (khớp firestore.rules editsAsEditor).
let viewerEmail = '';
const canEdit = (q) => !!viewerEmail && Array.isArray(q.editors) && q.editors.includes(viewerEmail);

// ---------- Kệ "Trên máy này" (local-shelf.js) — có cả khi chưa đăng nhập ----------
function fmtAgo(ms) {
    const s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 60) return 'vừa xong';
    if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
    if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
    if (s < 86400 * 30) return `${Math.floor(s / 86400)} ngày trước`;
    return new Date(ms).toLocaleDateString('vi-VN');
}
function renderShelf(excludeIds = new Set()) {
    const box = document.getElementById('local-shelf');
    const list = document.getElementById('local-shelf-list');
    if (!box || !list) return;
    const items = listShelf().filter(x => !excludeIds.has(x.id));
    box.classList.remove('hidden');
    if (!items.length) {
        list.innerHTML = `<p class="text-sm text-gray-400 py-4 text-center">Chưa mở bộ đề / thư mục nào của người khác trên máy này. Mở một link chia sẻ là nó hiện ở đây.</p>`;
        return;
    }
    list.innerHTML = items.map(it => {
        const href = it.kind === 'folder' ? `folder.html?id=${encodeURIComponent(it.id)}` : `quiz.html?id=${encodeURIComponent(it.id)}`;
        const st = it.kind === 'quiz' ? localStatsFor(it.id) : null;
        const meta = [
            it.kind === 'folder' ? 'Thư mục' : (it.count ? `${it.count} câu` : 'Bộ đề'),
            it.ownerName ? `từ ${escapeHtml(it.ownerName)}` : '',
            it.access === 'public' ? 'Công khai' : it.access === 'shared' ? 'Chia sẻ riêng' : '',
            `mở ${fmtAgo(it.openedAt || 0)}`,
            st ? `làm ${st.count} lần · gần nhất ${Math.round(st.last.percentage)}% · cao nhất ${Math.round(st.best.percentage)}%` : ''
        ].filter(Boolean).join(' · ');
        return `
        <div class="flex items-center gap-3 bg-white/80 hover:bg-white rounded-2xl px-3 py-2.5 shadow-sm transition">
            <span class="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${it.kind === 'folder' ? 'bg-amber-100 text-amber-500' : 'bg-pink-100 text-pink-500'}">
                <i class="fas ${it.kind === 'folder' ? 'fa-folder-open' : 'fa-file-lines'}"></i></span>
            <a href="${href}" class="min-w-0 flex-1">
                <span class="block text-sm font-bold text-gray-800 truncate">${it.pinned ? '<i class="fas fa-thumbtack text-pink-400 text-xs mr-1"></i>' : ''}${escapeHtml(it.title || 'Không tên')}</span>
                <span class="block text-[11px] text-gray-500 truncate">${meta}</span>
            </a>
            <button type="button" class="shelf-pin-btn w-8 h-8 rounded-full text-gray-400 hover:text-pink-500 hover:bg-pink-50" data-kind="${it.kind}" data-id="${escapeHtml(it.id)}" title="${it.pinned ? 'Bỏ ghim' : 'Ghim lên đầu'}"><i class="fas fa-thumbtack"></i></button>
            <button type="button" class="shelf-forget-btn w-8 h-8 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50" data-kind="${it.kind}" data-id="${escapeHtml(it.id)}" title="Xóa khỏi máy này (không ảnh hưởng bản gốc)"><i class="fas fa-xmark"></i></button>
        </div>`;
    }).join('');
}
let shelfBound = false;
function bindShelf(excludeIds) {
    if (shelfBound) return;
    shelfBound = true;
    document.getElementById('local-shelf')?.addEventListener('click', async (e) => {
        const pin = e.target.closest('.shelf-pin-btn');
        const forget = e.target.closest('.shelf-forget-btn');
        const clear = e.target.closest('#local-shelf-clear');
        if (pin) togglePinShelf(pin.dataset.kind, pin.dataset.id);
        else if (forget) forgetShelf(forget.dataset.kind, forget.dataset.id);
        else if (clear) {
            const ok = await showConfirm('Xóa mọi mục CHƯA GHIM khỏi danh sách trên máy này? (Bản gốc và kết quả làm bài không bị ảnh hưởng.)',
                { title: 'Dọn danh sách?', confirmText: 'Dọn', cancelText: 'Hủy', tone: 'danger' });
            if (!ok) return;
            clearShelf();
        } else return;
        renderShelf(excludeIds);
    });
}

async function sharedWithMePage() {
    document.getElementById('folder-name').textContent = 'Được chia sẻ với tôi';
    document.title = 'Được chia sẻ với tôi - Zitthenkne';
    const iconEl = document.getElementById('folder-icon');
    iconEl.innerHTML = '<i class="fas fa-user-group"></i>';
    renderSkeleton();
    const me = await viewer();
    // Không có tài khoản / chưa xác nhận email: vẫn quản lý được những gì đã mở trên máy này (kệ cục bộ)
    if (!me || !me.verified) {
        document.getElementById('folder-quiz-list').innerHTML = '';
        document.getElementById('folder-meta').textContent = me ? me.email : 'Chưa đăng nhập · dữ liệu lưu trên trình duyệt này';
        const note = document.getElementById('shared-account-note');
        if (note) {
            note.innerHTML = !me
                ? `<i class="fas fa-circle-info mr-1"></i>Đăng nhập để xem bộ đề / thư mục được <b>chia sẻ riêng</b> cho email của bạn và đồng bộ kết quả làm bài. <a href="../../index.html?next=${encodeURIComponent(location.href)}" class="font-bold text-pink-600 underline">Đăng nhập</a>`
                : `<i class="fas fa-circle-info mr-1"></i>Xác nhận email <b>${escapeHtml(me.email)}</b> (trang <a href="../profile/profile.html" class="font-bold text-pink-600 underline">Hồ sơ</a> → Gửi mail xác nhận) để thấy mục được chia sẻ riêng cho bạn.`;
            note.classList.remove('hidden');
        }
        renderShelf();
        bindShelf(new Set());
        return;
    }
    viewerEmail = me.email;
    let data;
    try { data = await withTimeout(fetchSharedWithMe(me.email)); }
    catch (err) {
        console.error('Lỗi tải mục được chia sẻ:', err);
        showMessage('fa-triangle-exclamation', 'Không tải được', 'Thử tải lại trang giúp mình nhé.');
        return;
    }
    const draw = () => {
        // Chỉ hiện mục GỐC: thư mục có cha cũng được chia sẻ cho mình thì nằm bên trong cha, không lặp ra ngoài.
        const folderIds = new Set(data.folders.map(f => f.id));
        const topFolders = data.folders.filter(f => !folderIds.has(f.parentId)).sort(byName);
        const looseSets = data.sets.filter(q => !folderIds.has(q.folderId)).sort(byName);
        document.getElementById('folder-meta').textContent = `${topFolders.length} thư mục · ${looseSets.length} bộ đề · ${me.email}`;
        document.getElementById('folder-message').classList.add('hidden');
        renderSubFolders(topFolders, { shared: true });
        if (!topFolders.length && !looseSets.length) {
            showMessage('fa-inbox', 'Chưa có gì được chia sẻ', `Khi ai đó chia sẻ riêng bộ đề/thư mục cho ${me.email}, chúng sẽ hiện ở đây.`);
            return;
        }
        if (looseSets.length) renderQuizzes(looseSets, { shared: true });
        else document.getElementById('folder-quiz-list').innerHTML = '';
    };
    draw();
    markSharedSeen(me.uid, data.total);
    bindSharedActions(me, data, draw);
    // Kệ "Trên máy này": chỉ những gì CHƯA nằm trong danh sách chia sẻ riêng ở trên (vd. link công khai đã mở)
    const listed = new Set([...data.sets.map(q => q.id), ...data.folders.map(f => f.id)]);
    renderShelf(listed);
    bindShelf(listed);
}

// Nút trên trang "Được chia sẻ với tôi". Ghi bằng SDK (cần mạng): rời chia sẻ = gỡ email mình khỏi sharedWith (firestore.rules leavesShare);
// rời một thư mục = gỡ khỏi cả nhánh đang chia sẻ cho mình, không thì bộ đề bên trong vẫn hiện lẻ ra ngoài.
let actionsBound = false;
function bindSharedActions(me, data, redraw) {
    if (actionsBound) return;
    actionsBound = true;
    const root = document.querySelector('.max-w-5xl') || document.body;
    root.addEventListener('click', async (e) => {
        const leaveBtn = e.target.closest('.shared-leave-btn');
        const copyBtn = e.target.closest('.shared-copy-btn');
        if (!leaveBtn && !copyBtn) return;
        e.preventDefault();
        e.stopPropagation();
        const btn = leaveBtn || copyBtn;
        if (btn.disabled) return;
        if (leaveBtn) {
            const { kind, id } = leaveBtn.dataset;
            const item = kind === 'folder' ? data.folders.find(f => f.id === id) : data.sets.find(q => q.id === id);
            const name = item?.name || item?.title || 'mục này';
            const ok = await showConfirm(`"${name}" sẽ biến khỏi danh sách của bạn và bạn không mở được nữa (trừ khi được chia sẻ lại).`,
                { title: 'Rời chia sẻ?', confirmText: 'Rời', cancelText: 'Hủy', tone: 'danger' });
            if (!ok) return;
            btn.disabled = true;
            let folderIds = new Set(), setIds = new Set([id]);
            if (kind === 'folder') {
                folderIds = new Set([id]);
                let grew = true;
                while (grew) {                       // gom cả nhánh trong những gì đang chia sẻ cho mình
                    grew = false;
                    data.folders.forEach(f => { if (folderIds.has(f.parentId) && !folderIds.has(f.id)) { folderIds.add(f.id); grew = true; } });
                }
                setIds = new Set(data.sets.filter(q => folderIds.has(q.folderId)).map(q => q.id));
            }
            // Một lô (nguyên tử, một lượt mạng; ≤ 450 thao tác mỗi lô)
            // Gỡ khỏi cả editors: luật leavesShare đòi editors mới == editors cũ trừ đúng mình (không có trường thì arrayRemove tạo [] — vẫn khớp)
            const patch = { sharedWith: arrayRemove(me.email), editors: arrayRemove(me.email) };
            const refs = [...[...folderIds].map(fid => doc(db, 'quiz_folders', fid)), ...[...setIds].map(sid => doc(db, 'quiz_sets', sid))];
            try {
                for (let i = 0; i < refs.length; i += 450) {
                    const batch = writeBatch(db);
                    refs.slice(i, i + 450).forEach(r => batch.update(r, patch));
                    await withTimeout(batch.commit());
                }
            } catch (err) {
                console.error('Lỗi rời chia sẻ:', err);
                btn.disabled = false;
                showToast('Không rời được: ' + (err.code === 'permission-denied' ? 'máy chủ chưa cho phép (cần cập nhật luật Firestore).' : err.message), 'error');
                return;
            }
            data.folders = data.folders.filter(f => !folderIds.has(f.id));
            data.sets = data.sets.filter(q => !setIds.has(q.id));
            if (Number.isFinite(data.total)) {
                data.total -= folderIds.size + setIds.size;
                markSharedSeen(me.uid, Math.max(0, data.total));
            }
            forgetShelf(kind, id);
            redraw();
            showToast(`Đã rời chia sẻ "${name}".`, 'success');
            return;
        }
        // Lưu bản sao: chép câu hỏi sang một bộ đề MỚI của mình (riêng tư, ở Thư viện gốc) — bản gốc không bị đụng tới.
        btn.disabled = true;
        try {
            const snap = await getDoc(doc(db, 'quiz_sets', copyBtn.dataset.id));
            if (!snap.exists()) throw new Error('Không tìm thấy bộ đề.');
            const src = snap.data();
            const questions = Array.isArray(src.questions) ? src.questions : [];
            const ref = doc(collection(db, 'quiz_sets'));
            await setDoc(ref, {
                userId: me.uid,
                title: `${src.title || 'Không tên'} (bản sao)`,
                questions,
                questionCount: questions.length,
                folderId: null,
                isPublic: false,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            showToast(`Đã lưu "${src.title || 'bộ đề'}" vào thư viện của bạn.`, 'success', 4000);
        } catch (err) {
            console.error('Lỗi lưu bản sao:', err);
            showToast('Không lưu được bản sao: ' + err.message, 'error');
        } finally { btn.disabled = false; }
    });
}

async function main() {
    const params = new URLSearchParams(location.search);
    if (params.get('shared') === 'me') return sharedWithMePage();
    const folderId = params.get('id');
    if (!folderId) {
        showMessage('fa-link-slash', 'Thiếu mã thư mục', 'Đường dẫn không hợp lệ. Hãy xin lại link chia sẻ nhé.');
        return;
    }

    renderSkeleton();

    // Đọc thư mục SONG SONG với việc khôi phục phiên: SDK Firestore tự đợi Auth sẵn sàng rồi mới gửi kèm token (thư mục chia sẻ riêng
    // cần token của người được mời), còn thư mục công khai thì không phải chờ thêm bước kiểm tra email nào.
    const meP = viewer({ checkVerify: false }).catch(() => null);
    const readFolder = async () => {
        try {
            const snap = await withTimeout(getDoc(doc(db, 'quiz_folders', folderId)));
            return snap.exists() ? { id: snap.id, ...snap.data() } : null;
        } catch (err) {
            // Rule chặn đọc = chưa công khai / chưa chia sẻ cho mình (xử lý chung ở dưới); quá hạn thì báo riêng
            if (err && err.message === 'Quá thời gian chờ') throw err;
            return null;
        }
    };
    let folder, me;
    try { [folder, me] = await Promise.all([readFolder(), meP]); }
    catch (err) {
        showMessage('fa-wifi', 'Mạng đang chậm', 'Chưa tải được thư mục. Kiểm tra kết nối rồi tải lại trang giúp mình nhé.');
        return;
    }
    // Không đọc được mà email chưa xác nhận: có thể vừa bấm link xác nhận ở tab khác → hỏi lại máy chủ, xác nhận rồi thì thử đọc lại một lần
    if (!folder && me && !me.verified && await refreshEmailVerified({ force: true })) {
        me.verified = true;
        folder = await readFolder().catch(() => null);
    }

    if (!folder || folder.deleted) {
        showMessage('fa-lock', 'Không mở được thư mục này',
            !me ? 'Thư mục không tồn tại, đã bị xóa, hoặc chỉ chia sẻ riêng — nếu được mời, hãy đăng nhập đúng email được chia sẻ ở trang chủ rồi mở lại link.'
                : !me.verified ? `Nếu thư mục được chia sẻ riêng cho ${me.email}, bạn cần xác nhận email trước (trang Hồ sơ → Gửi mail xác nhận), rồi tải lại trang.`
                : `Thư mục không tồn tại, đã bị xóa, hoặc chưa được chia sẻ cho ${me.email}.`);
        return;
    }
    // Đọc được mà không công khai = mình là chủ hoặc được chia sẻ riêng → lấy nội dung theo đường tương ứng (lọc isPublic sẽ ra rỗng).
    const privateMode = folder.isPublic !== true;

    // Tô đầu trang theo màu & icon thật của thư mục
    const hex = (folder.color || '').startsWith('#')
        ? folder.color
        : (FOLDER_COLOR_HEX[folder.color] || FOLDER_COLOR_HEX.amber);
    const iconEl = document.getElementById('folder-icon');
    iconEl.style.backgroundImage = 'none';   // màu phẳng (không gradient)
    iconEl.style.backgroundColor = hex;
    iconEl.innerHTML = `<i class="fas ${folder.icon || 'fa-folder-open'}"></i>`;
    document.getElementById('folder-name').textContent = folder.name || 'Thư mục';
    document.title = `${folder.name || 'Thư mục'} - Zitthenkne`;

    const isOwner = !!me && folder.userId === me.uid;
    if (me?.verified) viewerEmail = me.email;
    // Thư mục của người khác (công khai hoặc chia sẻ riêng) → lên kệ "Trên máy này", kể cả khi chưa đăng nhập
    if (!isOwner) rememberOpened({ kind: 'folder', id: folderId, title: folder.name, ownerName: folder.sharedBy || '', access: privateMode ? 'shared' : 'public' });

    let subFolders = [];
    let quizzes = [];
    if (privateMode && me) {
        try {
            let sets, folders;
            if (folder.userId === me.uid) {
                // Chủ thư mục tự mở link của mình
                [sets, folders] = await withTimeout(Promise.all([
                    runQueryRest({ collection: 'quiz_sets', where: [['userId', me.uid], ['folderId', folderId]], select: SET_META, requireUser: true }),
                    runQueryRest({ collection: 'quiz_folders', where: [['userId', me.uid], ['parentId', folderId]], requireUser: true })
                ]));
            } else {
                ({ sets, folders } = await withTimeout(fetchSharedWithMe(me.email)));
            }
            subFolders = folders.filter(f => f.parentId === folderId && !f.deleted).sort(byName);
            quizzes = sets.filter(q => q.folderId === folderId && !q.deleted);
        } catch (err) {
            console.error('Lỗi tải thư mục được chia sẻ:', err);
            showMessage('fa-triangle-exclamation', 'Không tải được danh sách bộ đề', 'Thử tải lại trang giúp mình nhé.');
            return;
        }
        if (isOwner) return finishFolderPage(subFolders, quizzes);
        // Người được chia sẻ: thẻ có vai trò, nút Sửa (Người chỉnh sửa), Lưu bản sao, Rời chia sẻ — như trang "Được chia sẻ với tôi"
        const data = { folders: subFolders, sets: quizzes, total: NaN };
        const draw = () => finishFolderPage(data.folders, data.sets, { shared: true });
        draw();
        bindSharedActions(me, data, draw);
        return;
    }
    // Thư mục con công khai (bắt buộc lọc isPublic == true, như bộ đề). Lỗi thì bỏ qua, không chặn trang.
    try {
        const fsnap = await withTimeout(getDocs(query(
            collection(db, 'quiz_folders'),
            where('parentId', '==', folderId),
            where('isPublic', '==', true)
        )));
        subFolders = fsnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(f => !f.deleted)
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi', { sensitivity: 'base' }));
    } catch (err) {
        console.warn('Không tải được thư mục con:', err);
    }

    try {
        // Bắt buộc lọc isPublic == true: rule Firestore chỉ cho đọc bộ đề công khai,
        // truy vấn thiếu điều kiện này sẽ bị từ chối toàn bộ.
        quizzes = (await withTimeout(fetchFolderSets(folderId))).filter(q => !q.deleted);
    } catch (err) {
        console.error('Lỗi tải bộ đề trong thư mục:', err);
        showMessage('fa-triangle-exclamation', 'Không tải được danh sách bộ đề',
            'Thử tải lại trang. Nếu vẫn lỗi, nhờ chủ thư mục chia sẻ lại link.');
        return;
    }
    finishFolderPage(subFolders, quizzes);
}

function finishFolderPage(subFolders, quizzes, { shared = false } = {}) {
    quizzes.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'vi', { sensitivity: 'base' }));

    const totalQuestions = quizzes.reduce((sum, q) => sum + (q.questionCount || 0), 0);
    document.getElementById('folder-meta').textContent =
        `${subFolders.length ? `${subFolders.length} thư mục con · ` : ''}${quizzes.length} bộ đề · ${totalQuestions} câu hỏi · thư mục được chia sẻ`;

    // Thư mục con trong thư mục được chia sẻ: không có nút "Rời" riêng (rời ở cấp thư mục cha / trang "Được chia sẻ với tôi")
    renderSubFolders(subFolders);
    if (!quizzes.length && subFolders.length) {
        document.getElementById('folder-quiz-list').innerHTML = '';
        return;
    }
    if (!quizzes.length) {
        showMessage('fa-folder-open', 'Thư mục này chưa có bộ đề nào bạn xem được',
            'Chủ thư mục cần bật công khai hoặc chia sẻ cho bạn các bộ đề bên trong.');
        return;
    }
    document.getElementById('folder-message').classList.add('hidden');
    renderQuizzes(quizzes, { shared });
}

main();
