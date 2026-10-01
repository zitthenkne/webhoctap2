// File: features/quiz/folder.js
// Trang xem một THƯ MỤC ĐƯỢC CHIA SẺ: ai có link cũng mở được, không cần đăng nhập.
//
// Điều kiện để trang này có dữ liệu (do rule Firestore quyết định):
//   - thư mục phải có isPublic == true  → mới đọc được tên/màu/icon
//   - từng bộ đề bên trong cũng phải isPublic == true → mới hiện trong danh sách
// Chủ thư mục bật cả hai bằng một thao tác "Chia sẻ thư mục" ở thư viện.

import { db } from '../../core/firebase-init.js';
import {
    doc, getDoc, collection, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";

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
function renderSubFolders(folders) {
    const box = document.getElementById('folder-sub-list');
    if (!box || !folders.length) return;
    box.innerHTML = folders.map((f, i) => {
        const hex = (f.color || '').startsWith('#') ? f.color : (FOLDER_COLOR_HEX[f.color] || FOLDER_COLOR_HEX.amber);
        const name = escapeHtml(f.name || 'Thư mục');
        return `
        <a class="folder-mini-card" href="folder.html?id=${encodeURIComponent(f.id)}" data-tab="Thư mục" data-fill="2" style="--fc:${hex};--card-index:${Math.min(i, 12)}">
            <span class="fd-papers" aria-hidden="true"><i></i><i></i><i></i></span>
            <div class="folder-mini-card-content">
                <div class="folder-icon-wrapper"><i class="fas ${escapeHtml(f.icon || 'fa-folder')}"></i></div>
                <div class="min-w-0 flex-1"><h4 class="fd-name" title="${name}">${name}</h4><p class="folder-meta-time">Mở thư mục</p></div>
            </div>
        </a>`;
    }).join('');
    box.classList.remove('hidden');
}

function renderQuizzes(quizzes) {
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
                    </p>
                </div>
            </div>
            <div class="qc-foot">
                <a href="quiz.html?id=${q.id}" class="practice-btn"><i class="fas fa-play"></i><span>Làm bài</span></a>
            </div>
        </div>`;
    }).join('');
}

async function main() {
    const folderId = new URLSearchParams(location.search).get('id');
    if (!folderId) {
        showMessage('fa-link-slash', 'Thiếu mã thư mục', 'Đường dẫn không hợp lệ. Hãy xin lại link chia sẻ nhé.');
        return;
    }

    renderSkeleton();

    let folder = null;
    try {
        const snap = await withTimeout(getDoc(doc(db, 'quiz_folders', folderId)));
        if (snap.exists()) folder = { id: snap.id, ...snap.data() };
    } catch (err) {
        // Rule chặn đọc = thư mục chưa công khai (xử lý chung ở dưới); quá hạn thì báo riêng
        if (err && err.message === 'Quá thời gian chờ') {
            showMessage('fa-wifi', 'Mạng đang chậm', 'Chưa tải được thư mục. Kiểm tra kết nối rồi tải lại trang giúp mình nhé.');
            return;
        }
    }

    if (!folder || folder.deleted) {
        showMessage('fa-lock', 'Không mở được thư mục này',
            'Thư mục không tồn tại, đã bị xóa, hoặc chủ sở hữu chưa bật chia sẻ công khai.');
        return;
    }

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

    // Thư mục con công khai (bắt buộc lọc isPublic == true, như bộ đề). Lỗi thì bỏ qua, không chặn trang.
    let subFolders = [];
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

    let quizzes = [];
    try {
        // Bắt buộc lọc isPublic == true: rule Firestore chỉ cho đọc bộ đề công khai,
        // truy vấn thiếu điều kiện này sẽ bị từ chối toàn bộ.
        const snap = await withTimeout(getDocs(query(
            collection(db, 'quiz_sets'),
            where('folderId', '==', folderId),
            where('isPublic', '==', true)
        )));
        quizzes = snap.docs
            .map(d => {
                const { questions, ...meta } = d.data();
                return { id: d.id, ...meta };
            })
            .filter(q => !q.deleted);
    } catch (err) {
        console.error('Lỗi tải bộ đề trong thư mục:', err);
        showMessage('fa-triangle-exclamation', 'Không tải được danh sách bộ đề',
            'Thử tải lại trang. Nếu vẫn lỗi, nhờ chủ thư mục chia sẻ lại link.');
        return;
    }

    quizzes.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'vi', { sensitivity: 'base' }));

    const totalQuestions = quizzes.reduce((sum, q) => sum + (q.questionCount || 0), 0);
    document.getElementById('folder-meta').textContent =
        `${subFolders.length ? `${subFolders.length} thư mục con · ` : ''}${quizzes.length} bộ đề · ${totalQuestions} câu hỏi · thư mục được chia sẻ`;

    renderSubFolders(subFolders);
    if (!quizzes.length && subFolders.length) {
        document.getElementById('folder-quiz-list').innerHTML = '';
        return;
    }
    if (!quizzes.length) {
        showMessage('fa-folder-open', 'Thư mục này chưa có bộ đề công khai',
            'Chủ thư mục cần bật công khai cho các bộ đề bên trong thì người khác mới xem được.');
        return;
    }

    renderQuizzes(quizzes);
}

main();
