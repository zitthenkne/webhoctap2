// features/quiz/quiz-srs-bell.js
//
// Chuông thông báo "ôn ngắt quãng" trên index.html: liệt kê các bộ đề đang có
// câu đến hạn, bấm một mục → mở thẳng phiên ôn của bộ đề đó (quiz.html?id=...&srs=1).
//
// Nguồn dữ liệu: render ngay từ localStorage (nhanh, chạy được cả khi là khách),
// rồi khi biết người dùng thì kéo các doc quiz_study của họ từ Firestore về,
// hợp nhất lịch (mergeSrsMaps — entry `last` mới hơn thắng) vào localStorage và
// vẽ lại. Nhờ vậy máy MỚI đăng nhập lần đầu vẫn thấy đủ thông báo đến hạn.
//
// Gắn vào 2 mount point: #srs-bell-desktop (header) và #srs-bell-mobile (topbar).
// Pattern module tự chạy giống index-user-avatar.js.

import { getAllSrsSummaries, readSrsMap, writeSrsMap, readSrsMeta, srsKeys, mergeSrsMaps } from './quiz-srs-store.js';
import { auth, db } from '../../core/firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";

const QUIZ_URL = 'features/quiz/quiz.html';

function bellHtml(totalDue) {
    return `
        <button type="button" aria-label="Thông báo ôn tập" aria-haspopup="true"
            class="srs-bell-btn relative w-10 h-10 rounded-xl flex items-center justify-center text-xl transition
                   ${totalDue > 0 ? 'text-pink-500 hover:bg-pink-50' : 'text-gray-300 hover:bg-gray-50'}">
            <i class="fas fa-bell pointer-events-none ${totalDue > 0 ? 'srs-bell-ring' : ''}"></i>
            ${totalDue > 0 ? `
            <span class="srs-bell-badge absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white
                         text-[10px] font-extrabold flex items-center justify-center border-2 border-white pointer-events-none">
                ${totalDue > 99 ? '99+' : totalDue}
            </span>` : ''}
        </button>`;
}

function dropdownHtml(summaries) {
    const items = summaries.length ? summaries.map(s => `
        <a href="${QUIZ_URL}?id=${encodeURIComponent(s.quizId)}&srs=1"
            class="flex items-center gap-3 px-4 py-3 hover:bg-pink-50/80 transition group">
            <span class="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-400 to-violet-500 text-white flex items-center justify-center flex-shrink-0">
                <i class="fas fa-brain text-sm"></i>
            </span>
            <span class="min-w-0 flex-1">
                <span class="block text-sm font-bold text-gray-700 truncate group-hover:text-pink-600">${escapeHtml(s.title)}</span>
                <span class="block text-xs text-gray-400"><b class="text-red-500">${s.due} câu</b> đến hạn ôn${s.total ? ` · ${s.total} câu` : ''}</span>
            </span>
            <i class="fas fa-chevron-right text-xs text-gray-300 group-hover:text-pink-400 flex-shrink-0"></i>
        </a>`).join('')
        : `<div class="px-4 py-6 text-center text-sm text-gray-400">
               Không có bộ đề nào đến hạn ôn.<br>
               <span class="text-xs">Làm phiên "Ôn ngắt quãng" trong một bộ đề để bắt đầu nhé!</span>
           </div>`;
    return `
        <div class="srs-bell-dropdown absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-16px)] bg-white rounded-2xl shadow-2xl
                    border border-pink-100 overflow-hidden z-50 hidden">
            <div class="px-4 py-3 border-b border-pink-50 bg-gradient-to-r from-pink-50/60 to-purple-50/60">
                <span class="text-sm font-extrabold text-gray-700"><i class="fas fa-calendar-check text-indigo-400 mr-1.5"></i>Đến hạn ôn tập</span>
            </div>
            <div class="max-h-80 overflow-y-auto">${items}</div>
        </div>`;
}

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderBell(mount) {
    const summaries = getAllSrsSummaries();
    const totalDue = summaries.reduce((sum, s) => sum + s.due, 0);
    const wasOpen = !!mount.querySelector('.srs-bell-dropdown:not(.hidden)');
    mount.classList.add('relative');
    mount.innerHTML = bellHtml(totalDue) + dropdownHtml(summaries);

    const btn = mount.querySelector('.srs-bell-btn');
    const dropdown = mount.querySelector('.srs-bell-dropdown');
    if (wasOpen) dropdown.classList.remove('hidden');
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Chỉ mở một dropdown tại một thời điểm (desktop + mobile cùng tồn tại trong DOM)
        document.querySelectorAll('.srs-bell-dropdown').forEach(d => {
            if (d !== dropdown) d.classList.add('hidden');
        });
        dropdown.classList.toggle('hidden');
    });
}

function renderAll() {
    ['srs-bell-desktop', 'srs-bell-mobile'].forEach(id => {
        const mount = document.getElementById(id);
        if (mount) renderBell(mount);
    });
}

function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes srs-bell-ring {
            0%, 100% { transform: rotate(0); }
            10% { transform: rotate(14deg); } 20% { transform: rotate(-12deg); }
            30% { transform: rotate(9deg); }  40% { transform: rotate(-7deg); }
            50% { transform: rotate(4deg); }  60% { transform: rotate(0); }
        }
        .srs-bell-ring { animation: srs-bell-ring 2.4s ease-in-out 0.6s 2; transform-origin: top center; display: inline-block; }
    `;
    document.head.appendChild(style);
}

// Kéo lịch SRS của người dùng từ Firestore (mọi doc quiz_study của họ) và hợp
// nhất vào localStorage. Throttle 5 phút/phiên để không quét lại vô ích.
let _cloudSyncedAt = 0;
async function syncSrsFromCloud(uid) {
    if (!uid || Date.now() - _cloudSyncedAt < 5 * 60 * 1000) return false;
    _cloudSyncedAt = Date.now();
    try {
        const snap = await getDocs(query(collection(db, 'quiz_study'), where('userId', '==', uid)));
        let changed = false;
        snap.forEach(docSnap => {
            const data = docSnap.data() || {};
            const quizId = data.quizId;
            if (!quizId || !Array.isArray(data.srs) || !data.srs.length) return;
            const cloudMap = {};
            data.srs.forEach(e => { if (e && e.q != null) cloudMap[e.q] = { n: e.n, ivl: e.ivl, due: e.due, lapses: e.lapses, last: e.last }; });
            const merged = mergeSrsMaps(readSrsMap(quizId), cloudMap);
            writeSrsMap(quizId, merged);
            // Bổ sung title/total cho meta nếu máy này chưa có (máy mới)
            const meta = readSrsMeta(quizId);
            if (!meta.title && (data.srsTitle || data.srsTotal)) {
                meta.title = data.srsTitle || meta.title;
                meta.total = data.srsTotal || meta.total;
                try { localStorage.setItem(srsKeys(quizId).meta, JSON.stringify(meta)); } catch (e) {}
            }
            changed = true;
        });
        return changed;
    } catch (e) {
        // Rules không cho query / offline — chuông vẫn chạy bằng dữ liệu local
        console.warn('Không kéo được lịch ôn từ cloud:', e);
        return false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    injectStyles();
    renderAll();

    // Firestore là nguồn chính: có người dùng → kéo lịch từ cloud rồi vẽ lại
    onAuthStateChanged(auth, (u) => {
        if (u) syncSrsFromCloud(u.uid).then((changed) => { if (changed) renderAll(); });
    });

    // Đóng dropdown khi click ra ngoài
    document.addEventListener('click', (e) => {
        if (e.target.closest && e.target.closest('.srs-bell-dropdown, .srs-bell-btn')) return;
        document.querySelectorAll('.srs-bell-dropdown').forEach(d => d.classList.add('hidden'));
    });

    // Cập nhật khi quay lại tab / khi tab khác (phiên ôn) ghi localStorage
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) renderAll();
    });
    window.addEventListener('storage', (e) => {
        if (e.key && e.key.startsWith('quiz_srs_')) renderAll();
    });
});
