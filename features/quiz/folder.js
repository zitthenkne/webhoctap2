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

// Bảng màu + icon cho thẻ bộ đề, giữ giống thư viện để hai nơi nhìn như một
const QUIZ_ACCENTS = [
    { from: '#ec4899', to: '#fb7185', icon: 'fa-layer-group' },
    { from: '#8b5cf6', to: '#c084fc', icon: 'fa-book-open' },
    { from: '#0ea5e9', to: '#38bdf8', icon: 'fa-file-lines' },
    { from: '#10b981', to: '#34d399', icon: 'fa-flask' },
    { from: '#f59e0b', to: '#fbbf24', icon: 'fa-lightbulb' },
    { from: '#6366f1', to: '#818cf8', icon: 'fa-brain' },
    { from: '#f43f5e', to: '#fb7185', icon: 'fa-heart-pulse' },
    { from: '#14b8a6', to: '#2dd4bf', icon: 'fa-microscope' }
];
function accentFor(seed) {
    const s = String(seed || '');
    let hash = 0;
    for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
    return QUIZ_ACCENTS[hash % QUIZ_ACCENTS.length];
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

function renderQuizzes(quizzes) {
    const list = document.getElementById('folder-quiz-list');
    list.innerHTML = quizzes.map((q, i) => {
        const a = accentFor(q.id);
        const title = escapeHtml(q.title || 'Không tên');
        return `
        <div class="quiz-grid-card" style="--qc-from:${a.from};--qc-to:${a.to};--card-index:${Math.min(i, 12)}">
            <span class="qc-rail" aria-hidden="true"></span>
            <div class="qc-top">
                <span class="quiz-card-icon" style="background-image:linear-gradient(135deg,${a.from},${a.to})" aria-hidden="true">
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
    iconEl.style.backgroundImage = `linear-gradient(135deg, ${hex}, ${hex}bb)`;
    iconEl.innerHTML = `<i class="fas ${folder.icon || 'fa-folder-open'}"></i>`;
    document.getElementById('folder-name').textContent = folder.name || 'Thư mục';
    document.title = `${folder.name || 'Thư mục'} - Zitthenkne`;

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
        `${quizzes.length} bộ đề · ${totalQuestions} câu hỏi · thư mục được chia sẻ`;

    if (!quizzes.length) {
        showMessage('fa-folder-open', 'Thư mục này chưa có bộ đề công khai',
            'Chủ thư mục cần bật công khai cho các bộ đề bên trong thì người khác mới xem được.');
        return;
    }

    renderQuizzes(quizzes);
}

main();
