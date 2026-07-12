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
// Giao diện: desktop = dropdown neo dưới chuông; mobile (<768px) = bottom sheet
// trượt lên + backdrop (CSS media query trong injectStyles, cùng một markup).
// Panel gồm: hero header (số câu đến hạn + streak + đã ôn hôm nay), danh sách
// bộ đến hạn (nút tạm dừng + hoàn tác), biểu đồ dự báo 7 ngày, mục "Sắp tới",
// và link "Quản lý" mở dashboard trong tab Thống kê.
//
// Gắn vào 2 mount point: #srs-bell-desktop (header) và #srs-bell-mobile (topbar).
// Pattern module tự chạy giống index-user-avatar.js.

import {
    getAllSrsSummaries, getAllSrsDeckDetails, getSrsStreak, setSrsPaused, endOfDay,
    readSrsLog, localDayStr,
    readSrsMap, writeSrsMap, readSrsMeta, srsKeys, mergeSrsMaps
} from './quiz-srs-store.js';
import { syncPullStudy, pushCloudStudy, readLocalStudy } from './quiz-study-store.js';
import { auth, db } from '../../core/firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";

const QUIZ_URL = 'features/quiz/quiz.html';
const DAY_MS = 86400000;

// Icon bộ đề xoay vòng qua các gradient cho danh sách bớt đơn điệu
const ICON_GRADS = [
    'from-[#FF69B4] to-[#FFB6C1]',
    'from-[#D8BFD8] to-[#c7a8e0]',
    'from-[#FFB6C1] to-[#ffd1dc]',
    'from-[#f9a8d4] to-[#e9d5ff]',
];

// Bộ vừa bị tạm dừng từ chuông — hiện hàng "Hoàn tác" cho tới khi đóng panel.
let undoInfo = null;

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function bellHtml(totalDue) {
    const hot = totalDue > 0;
    return `
        <button type="button" aria-label="Thông báo ôn tập" aria-haspopup="true" aria-expanded="false"
            class="srs-bell-btn relative w-10 h-10 rounded-xl flex items-center justify-center text-xl
                   transition active:scale-90 touch-manipulation
                   ${hot ? 'srs-bell-btn-hot text-white' : 'text-gray-400 hover:text-pink-400 hover:bg-gray-50'}">
            ${hot ? '<span class="srs-bell-halo pointer-events-none"></span>' : ''}
            <i class="fas fa-bell pointer-events-none relative ${hot ? 'srs-bell-ring' : ''}"></i>
            ${hot ? `
            <span class="srs-bell-badge absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full
                         bg-red-500 text-white
                         text-[10px] font-extrabold flex items-center justify-center border-2 border-white pointer-events-none">
                ${totalDue > 99 ? '99+' : totalDue}
            </span>` : ''}
        </button>`;
}

// "ngày mai" / "N ngày nữa" cho hạn tương lai (due luôn chốt cuối ngày)
function relDayLabel(dueMs, now = Date.now()) {
    const off = Math.max(1, Math.round((dueMs - endOfDay(now)) / DAY_MS));
    return off === 1 ? 'ngày mai' : `${off} ngày nữa`;
}

function dueItemHtml(s, i) {
    const idAttr = escapeHtml(s.quizId);
    const grad = ICON_GRADS[i % ICON_GRADS.length];
    return `
        <div class="srs-item-in flex items-center gap-1 pr-2 hover:bg-pink-50/70 transition group" style="animation-delay:${i * 40}ms">
            <a href="${QUIZ_URL}?id=${encodeURIComponent(s.quizId)}&srs=1"
                class="flex items-center gap-3 pl-4 pr-1 py-3 flex-1 min-w-0">
                <span class="w-10 h-10 rounded-xl bg-gradient-to-br ${grad} text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                    <i class="fas fa-brain text-sm"></i>
                </span>
                <span class="min-w-0 flex-1">
                    <span class="block text-sm font-bold text-gray-700 truncate group-hover:text-pink-600">${escapeHtml(s.title)}</span>
                    <span class="block text-xs text-gray-400"><b class="text-red-500">${s.due} câu</b> đến hạn${s.total ? ` · ${s.total} câu` : ''}</span>
                </span>
                <span class="flex-shrink-0 px-2.5 py-1 rounded-full bg-pink-100/80 text-pink-600 text-[11px] font-extrabold
                             group-hover:bg-pink-500 group-hover:text-white transition">Ôn ngay</span>
            </a>
            <button type="button" data-srs-pause="${idAttr}" data-srs-title="${escapeHtml(s.title)}"
                title="Tạm dừng thông báo bộ này (lịch vẫn giữ, bật lại trong Thống kê)"
                class="w-9 h-9 rounded-lg text-gray-300 hover:text-amber-500 hover:bg-amber-50 active:scale-95
                       flex items-center justify-center flex-shrink-0 transition touch-manipulation">
                <i class="fas fa-bell-slash text-xs pointer-events-none"></i>
            </button>
        </div>`;
}

function upcomingItemHtml(d) {
    const off = Math.max(1, Math.round((d.nextDue - endOfDay(Date.now())) / DAY_MS));
    const count = (d.byOffset && d.byOffset[off]) || 0;
    return `
        <a href="${QUIZ_URL}?id=${encodeURIComponent(d.quizId)}"
            class="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition group">
            <span class="w-8 h-8 rounded-lg bg-gray-100 text-gray-400 flex items-center justify-center flex-shrink-0">
                <i class="far fa-clock text-xs"></i>
            </span>
            <span class="min-w-0 flex-1">
                <span class="block text-[13px] font-bold text-gray-500 truncate group-hover:text-gray-700">${escapeHtml(d.title)}</span>
                <span class="block text-[11px] text-gray-400">${count ? `${count} câu · ` : ''}đến hạn ${relDayLabel(d.nextDue)}</span>
            </span>
        </a>`;
}

// Dự báo khối lượng ôn: hôm nay + 6 ngày kế (cột "Nay" = câu đang đến hạn,
// các cột sau = tổng byOffset của những bộ đang hoạt động)
function forecastDays(details, dueTotal, now = Date.now()) {
    const active = details.filter(d => !d.paused);
    const names = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const days = [{ label: 'Nay', count: dueTotal, today: true }];
    for (let k = 1; k <= 6; k++) {
        days.push({
            label: names[new Date(now + k * DAY_MS).getDay()],
            count: active.reduce((sum, d) => sum + ((d.byOffset && d.byOffset[k]) | 0), 0),
        });
    }
    return days;
}

function forecastHtml(days) {
    if (!days.some(d => d.count > 0)) return '';
    const max = Math.max(...days.map(d => d.count));
    return `
        <div class="px-4 pt-3 pb-2 border-t border-gray-50">
            <div class="text-[11px] font-extrabold uppercase tracking-wide text-gray-400 mb-1.5">
                <i class="fas fa-chart-simple mr-1 text-pink-300"></i>7 ngày tới
            </div>
            <div class="flex items-end justify-between gap-1.5">
                ${days.map((d, i) => `
                <div class="flex-1 flex flex-col items-center gap-0.5 min-w-0">
                    <span class="text-[9px] font-bold h-3 ${d.count ? (d.today ? 'text-pink-500' : 'text-gray-400') : 'text-transparent'}">${d.count || '·'}</span>
                    <div class="srs-bar w-full max-w-[22px] rounded-t
                                ${d.today ? 'bg-gradient-to-t from-[#FF69B4] to-[#FFB6C1]' : d.count ? 'bg-[#D8BFD8]/70' : 'bg-gray-100'}"
                         style="height:${Math.max(3, Math.round(d.count / max * 36))}px; animation-delay:${i * 45}ms"></div>
                    <span class="text-[9px] font-bold ${d.today ? 'text-pink-500' : 'text-gray-400'}">${d.label}</span>
                </div>`).join('')}
            </div>
        </div>`;
}

function heroHtml(totalDue, deckCount, streak, reviewedToday) {
    return `
        <div class="relative px-4 pt-4 pb-3.5 bg-gradient-to-br from-[#FFB6C1]/40 via-pink-50 to-[#D8BFD8]/40 border-b border-pink-100 overflow-hidden">
            <span class="srs-hero-blob absolute -top-8 -right-8 w-28 h-28 rounded-full bg-pink-200/40"></span>
            <span class="srs-hero-blob absolute -bottom-10 left-10 w-24 h-24 rounded-full bg-purple-200/30" style="animation-delay:1.2s"></span>
            <span class="srs-sheet-handle hidden absolute top-1.5 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-pink-200"></span>
            <div class="relative flex items-start justify-between gap-2">
                <div class="min-w-0">
                    <div class="text-[11px] font-bold uppercase tracking-wider text-pink-400">Ôn tập hôm nay</div>
                    <div class="text-3xl font-extrabold leading-tight text-transparent bg-clip-text bg-gradient-to-r from-[#FF69B4] to-[#b48ec9]">${totalDue}<span class="text-base font-bold ml-1.5">câu đến hạn</span></div>
                    <div class="text-[11px] text-gray-400 mt-0.5">
                        ${totalDue > 0 ? `trong ${deckCount} bộ đề` : 'không có gì chờ bạn'}${reviewedToday > 0 ? ` · đã ôn ${reviewedToday} câu hôm nay` : ''}
                    </div>
                </div>
                <div class="flex items-center gap-1.5 flex-shrink-0">
                    ${streak > 0 ? `
                    <span class="px-2 py-1 rounded-full bg-orange-100/90 text-orange-500 text-[11px] font-extrabold flex items-center gap-1"
                          title="Chuỗi ${streak} ngày ôn liên tiếp">
                        <i class="fas fa-fire"></i>${streak} ngày</span>` : ''}
                    <button type="button" data-srs-close="1" aria-label="Đóng"
                        class="md:hidden w-8 h-8 rounded-full text-gray-400 hover:bg-pink-100 flex items-center justify-center active:scale-90">
                        <i class="fas fa-times pointer-events-none"></i>
                    </button>
                </div>
            </div>
        </div>`;
}

function dropdownHtml(summaries, details, upcoming, streak) {
    const totalDue = summaries.reduce((sum, s) => sum + s.due, 0);
    const reviewedToday = (readSrsLog()[localDayStr()] | 0);

    const undoRow = undoInfo ? `
        <div class="flex items-center justify-between gap-2 px-4 py-2.5 bg-amber-50/90 border-b border-amber-100">
            <span class="text-xs font-bold text-amber-700 truncate">Đã tạm dừng "${escapeHtml(undoInfo.title)}"</span>
            <button type="button" data-srs-undo="1"
                class="text-xs font-extrabold text-amber-600 underline flex-shrink-0 px-2 py-1 active:scale-95">Hoàn tác</button>
        </div>` : '';

    const dueSection = summaries.length
        ? summaries.map(dueItemHtml).join('')
        : `<div class="srs-item-in px-6 py-7 text-center">
               ${details.length
                   ? `<div class="w-14 h-14 mx-auto mb-2.5 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white flex items-center justify-center text-2xl shadow-lg shadow-emerald-200"><i class="fas fa-check"></i></div>
                      <div class="text-sm font-extrabold text-gray-700">Đã ôn hết hôm nay! 🎉</div>
                      <div class="text-xs text-gray-400 mt-1">Không còn câu nào đến hạn. Nghỉ ngơi nhé.</div>`
                   : `<div class="w-14 h-14 mx-auto mb-2.5 rounded-full bg-gradient-to-br from-[#FF69B4] to-[#D8BFD8] text-white flex items-center justify-center text-2xl shadow-lg shadow-pink-200"><i class="fas fa-seedling"></i></div>
                      <div class="text-sm font-extrabold text-gray-700">Chưa có lịch ôn nào</div>
                      <div class="text-xs text-gray-400 mt-1">Làm phiên "Ôn ngắt quãng" trong một bộ đề để bắt đầu nhé!</div>`}
           </div>`;

    const upcomingSection = upcoming.length ? `
        <div class="px-4 pt-3 pb-1 text-[11px] font-extrabold uppercase tracking-wide text-gray-400 border-t border-gray-50">
            <i class="far fa-clock mr-1 text-gray-300"></i>Sắp tới
        </div>
        ${upcoming.map(upcomingItemHtml).join('')}` : '';

    return `
        <div class="srs-bell-backdrop hidden"></div>
        <div class="srs-bell-dropdown absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-16px)] bg-white rounded-2xl shadow-2xl
                    border border-pink-100 overflow-hidden hidden" role="dialog" aria-label="Thông báo ôn tập">
            ${heroHtml(totalDue, summaries.length, streak, reviewedToday)}
            ${undoRow}
            <div class="srs-bell-list max-h-80 overflow-y-auto overscroll-contain">
                ${dueSection}
                ${forecastHtml(forecastDays(details, totalDue))}
                ${upcomingSection}
            </div>
            <div class="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 bg-gray-50/60">
                <span class="text-[11px] font-bold text-gray-400">${totalDue > 0 ? `${totalDue} câu · ${summaries.length} bộ đề` : 'Không có câu đến hạn'}</span>
                <button type="button" data-srs-manage="1"
                    class="text-xs font-extrabold text-[#FF69B4] hover:text-pink-600 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-pink-50 active:scale-95 transition">
                    Quản lý<i class="fas fa-chevron-right text-[9px]"></i>
                </button>
            </div>
        </div>`;
}

// ----- Mở / đóng panel -----
function closeAllPanels() {
    undoInfo = null;
    document.querySelectorAll('.srs-bell-dropdown, .srs-bell-backdrop').forEach(d => d.classList.add('hidden'));
    document.querySelectorAll('.srs-bell-btn').forEach(b => b.setAttribute('aria-expanded', 'false'));
}

function togglePanel(mount) {
    const dropdown = mount.querySelector('.srs-bell-dropdown');
    const backdrop = mount.querySelector('.srs-bell-backdrop');
    const btn = mount.querySelector('.srs-bell-btn');
    const willOpen = dropdown.classList.contains('hidden');
    closeAllPanels();
    if (willOpen) {
        dropdown.classList.remove('hidden');
        backdrop.classList.remove('hidden');
        btn.setAttribute('aria-expanded', 'true');
    }
}

// ----- Tạm dừng / hoàn tác từ chuông (đẩy cloud best-effort như dashboard) -----
async function pushPauseToCloud(quizId) {
    const user = auth.currentUser;
    if (!user) return;
    try {
        await syncPullStudy(user.uid, quizId);
        await pushCloudStudy(user.uid, quizId, readLocalStudy(quizId));
    } catch (e) { /* offline / rules — trạng thái local vẫn đúng */ }
}

function pauseFromBell(quizId, title) {
    setSrsPaused(quizId, true);
    undoInfo = { quizId, title };
    document.dispatchEvent(new CustomEvent('srs-data-changed'));
    pushPauseToCloud(quizId);
}

function undoPause() {
    if (!undoInfo) return;
    const { quizId } = undoInfo;
    setSrsPaused(quizId, false);
    undoInfo = null;
    document.dispatchEvent(new CustomEvent('srs-data-changed'));
    pushPauseToCloud(quizId);
}

// Mở tab Thống kê và cuộn tới dashboard "Ôn tập ngắt quãng"
function openSrsDashboard() {
    closeAllPanels();
    const nav = document.querySelector('.nav-link[data-target="statsContent"]');
    if (nav) nav.click();
    setTimeout(() => {
        const dash = document.getElementById('srs-dashboard');
        if (dash) dash.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
}

function renderBell(mount) {
    const summaries = getAllSrsSummaries();
    const totalDue = summaries.reduce((sum, s) => sum + s.due, 0);
    const details = getAllSrsDeckDetails(7);
    const upcoming = details
        .filter(d => !d.paused && d.due === 0 && d.nextDue > 0)
        .sort((a, b) => a.nextDue - b.nextDue)
        .slice(0, 3);
    const wasOpen = !!mount.querySelector('.srs-bell-dropdown:not(.hidden)');

    mount.classList.add('relative');
    mount.innerHTML = bellHtml(totalDue) + dropdownHtml(summaries, details, upcoming, getSrsStreak());

    const btn = mount.querySelector('.srs-bell-btn');
    const dropdown = mount.querySelector('.srs-bell-dropdown');
    const backdrop = mount.querySelector('.srs-bell-backdrop');
    if (wasOpen) {
        dropdown.classList.remove('hidden');
        backdrop.classList.remove('hidden');
        btn.setAttribute('aria-expanded', 'true');
    }

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePanel(mount);
    });
    backdrop.addEventListener('click', closeAllPanels);

    // Delegation cho các nút trong panel (pause / undo / close / manage)
    dropdown.addEventListener('click', (e) => {
        const pauseBtn = e.target.closest('[data-srs-pause]');
        if (pauseBtn) {
            e.preventDefault();
            pauseFromBell(pauseBtn.getAttribute('data-srs-pause'), pauseBtn.getAttribute('data-srs-title') || '');
            return;
        }
        if (e.target.closest('[data-srs-undo]')) { undoPause(); return; }
        if (e.target.closest('[data-srs-close]')) { closeAllPanels(); return; }
        if (e.target.closest('[data-srs-manage]')) { openSrsDashboard(); return; }
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

        .srs-bell-btn-hot {
            background: linear-gradient(135deg, #FF69B4, #FFB6C1);
            box-shadow: 0 4px 14px rgba(255, 105, 180, .4);
        }
        @keyframes srs-halo { 0% { transform: scale(1); opacity: .55; } 100% { transform: scale(1.55); opacity: 0; } }
        .srs-bell-halo {
            position: absolute; inset: 0; border-radius: 12px;
            background: linear-gradient(135deg, #FF69B4, #FFB6C1);
            animation: srs-halo 1.6s ease-out 0.6s 3;
        }
        @keyframes srs-badge-pop { 0% { transform: scale(0); } 70% { transform: scale(1.25); } 100% { transform: scale(1); } }
        .srs-bell-badge { animation: srs-badge-pop .3s ease-out; }

        @keyframes srs-item-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .srs-item-in { animation: srs-item-in .3s ease-out both; }
        @keyframes srs-bar-grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        .srs-bar { transform-origin: bottom; animation: srs-bar-grow .4s ease-out both; }
        @keyframes srs-blob { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(6px) scale(1.08); } }
        .srs-hero-blob { animation: srs-blob 5s ease-in-out infinite; }

        @keyframes srs-pop { from { opacity: 0; transform: translateY(-6px) scale(.97); } to { opacity: 1; transform: none; } }
        @keyframes srs-sheet-up { from { transform: translateY(100%); } to { transform: none; } }
        @keyframes srs-fade { from { opacity: 0; } to { opacity: 1; } }
        .srs-bell-dropdown { z-index: 50; }
        @media (min-width: 768px) {
            .srs-bell-dropdown:not(.hidden) { animation: srs-pop .16s ease-out; }
            .srs-bell-backdrop { display: none !important; }
        }
        @media (max-width: 767px) {
            .srs-bell-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 70; animation: srs-fade .2s ease-out; }
            .srs-bell-dropdown {
                position: fixed; left: 0; right: 0; bottom: 0; top: auto; margin: 0;
                width: 100%; max-width: 100%; z-index: 71;
                border-radius: 24px 24px 0 0; border: none;
                box-shadow: 0 -8px 40px rgba(0,0,0,.18);
                padding-bottom: env(safe-area-inset-bottom);
            }
            .srs-bell-dropdown:not(.hidden) { animation: srs-sheet-up .28s cubic-bezier(.2, .9, .3, 1); }
            .srs-bell-dropdown .srs-sheet-handle { display: block; }
            .srs-bell-dropdown .srs-bell-list { max-height: 52vh; }
        }
        @media (prefers-reduced-motion: reduce) {
            .srs-bell-ring, .srs-bell-halo, .srs-bell-badge, .srs-item-in, .srs-bar, .srs-hero-blob,
            .srs-bell-dropdown:not(.hidden) { animation: none !important; }
        }
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
            const meta = readSrsMeta(quizId);
            let metaDirty = false;
            // Bổ sung title/total cho meta nếu máy này chưa có (máy mới)
            if (!meta.title && (data.srsTitle || data.srsTotal)) {
                meta.title = data.srsTitle || meta.title;
                meta.total = data.srsTotal || meta.total;
                metaDirty = true;
            }
            // Trạng thái tạm dừng: last-write-wins theo srsPausedAt (đẩy lên ở
            // pushCloudStudy — quiz-study-store.js)
            if ((Number(data.srsPausedAt) || 0) > (Number(meta.pausedAt) || 0)) {
                meta.paused = !!data.srsPaused;
                meta.pausedAt = Number(data.srsPausedAt) || 0;
                metaDirty = true;
            }
            if (metaDirty) {
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

    // Firestore là nguồn chính: có người dùng → kéo lịch từ cloud rồi báo cho
    // cả chuông lẫn dashboard thống kê (cùng lắng nghe 'srs-data-changed') vẽ lại
    onAuthStateChanged(auth, (u) => {
        if (u) syncSrsFromCloud(u.uid).then((changed) => {
            if (changed) document.dispatchEvent(new CustomEvent('srs-data-changed'));
        });
    });

    // Dashboard (quiz-srs-dashboard.js) sửa/xóa/tạm dừng lịch → vẽ lại chuông
    document.addEventListener('srs-data-changed', renderAll);

    // Đóng panel khi click ra ngoài / nhấn Esc
    document.addEventListener('click', (e) => {
        if (e.target.closest && e.target.closest('.srs-bell-dropdown, .srs-bell-btn, .srs-bell-backdrop')) return;
        closeAllPanels();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAllPanels();
    });

    // Cập nhật khi quay lại tab / khi tab khác (phiên ôn) ghi localStorage
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) renderAll();
    });
    window.addEventListener('storage', (e) => {
        if (e.key && e.key.startsWith('quiz_srs_')) renderAll();
    });
});
