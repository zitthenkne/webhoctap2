// features/quiz/quiz-srs-dashboard.js
//
// Bảng "Ôn tập ngắt quãng" trong mục Thống kê của index.html (mount #srs-dashboard):
//   1. Hôm nay      — các bộ đề có câu đến hạn / câu mới → nút "Ôn ngay";
//                     xong hết thì khen + nhắc lịch ngày mai
//   2. Chuỗi ôn     — streak ngày liên tiếp + dải hoạt động 14 ngày (quiz_srs_log)
//   3. 7 ngày tới   — dự báo số câu đến hạn theo từng ngày (thanh ngang + tên bộ)
//   4. Quản lý      — mọi bộ đề đang ôn: sửa giới hạn câu mới/ngày, tạm dừng
//                     (ẩn khỏi chuông + mục hôm nay), xóa hẳn lịch ôn.
//                     Desktop: hàng nút icon; mobile: nút ⋯ mở bottom sheet.
//
// Dữ liệu đọc từ localStorage — đã được quiz-srs-bell.js hợp nhất từ cloud khi
// đăng nhập. Mọi thay đổi ở đây phát 'srs-data-changed' để chuông vẽ lại (và
// ngược lại: bell sync xong cũng phát event này cho dashboard).
//
// LƯU Ý xóa lịch: chỉ xóa local là KHÔNG đủ — mergeSrsMaps là union nên lần sync
// sau sẽ hồi sinh lịch từ cloud. Phải kéo cloud về (syncPullStudy) rồi đẩy lại
// doc quiz_study với srs rỗng, xong mới gỡ khóa localStorage.

import {
    getAllSrsDeckDetails,
    setSrsPaused,
    deleteSrsLocal,
    setNewPerDay,
    readSrsLog,
    getSrsStreak,
    localDayStr,
    endOfDay,
} from './quiz-srs-store.js';
import { readLocalStudy, syncPullStudy, pushCloudStudy, writeLocalStudy } from './quiz-study-store.js';
import { showToast, showConfirm } from '../../core/utils.js';
import { auth } from '../../core/firebase-init.js';

const QUIZ_URL = 'features/quiz/quiz.html';
const DAYS_AHEAD = 7;
const DAY_MS = 86400000;
const ACTIVITY_DAYS = 14;
const MANAGE_COLLAPSED_COUNT = 5;

let _showAllManage = false;

// ---------- Tiện ích nhỏ ----------
function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fmtDM(ms) {
    const d = new Date(ms);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const WEEKDAYS = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
function dayLabel(offset, now) {
    if (offset === 1) return 'Ngày mai';
    return WEEKDAYS[new Date(now + offset * DAY_MS).getDay()];
}
// "hôm nay" / "ngày mai" / "3 ngày nữa · 14/07" cho hạn kế tiếp của một bộ
function nextDueLabel(deck, now) {
    if (deck.due > 0) return '<b class="text-red-500">hôm nay</b>';
    if (!deck.nextDue) return '—';
    const k = Math.max(1, Math.round((deck.nextDue - endOfDay(now)) / DAY_MS));
    if (k === 1) return 'ngày mai';
    return `${k} ngày nữa · ${fmtDM(deck.nextDue)}`;
}
function srsLink(quizId) {
    return `${QUIZ_URL}?id=${encodeURIComponent(quizId)}&srs=1`;
}
function plural(n, unit) { return `${n} ${unit}`; }

// CSS riêng (bottom sheet trượt lên, clamp 2 dòng, nhịp xuất hiện) — nạp 1 lần
function injectStyles() {
    if (document.getElementById('srs-dash-style')) return;
    const style = document.createElement('style');
    style.id = 'srs-dash-style';
    style.textContent = `
        @keyframes srs-sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes srs-sheet-down { from { transform: translateY(0); } to { transform: translateY(100%); } }
        @keyframes srs-fade-in { from { opacity: 0; } to { opacity: 1; } }
        .srs-sheet-panel { animation: srs-sheet-up .28s cubic-bezier(.32,.72,.35,1); }
        .srs-sheet-closing .srs-sheet-panel { animation: srs-sheet-down .2s ease-in forwards; }
        .srs-sheet-backdrop { animation: srs-fade-in .2s ease; }
        .srs-sheet-closing .srs-sheet-backdrop { opacity: 0; transition: opacity .2s ease; }
        .srs-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        #srs-dashboard .srs-appear { animation: srs-fade-in .25s ease; }
        @media (hover: hover) {
            #srs-dashboard [data-srs-action]:hover, #srs-dashboard a:hover { filter: brightness(.985); }
        }
    `;
    document.head.appendChild(style);
}

// ---------- Khối: Hôm nay ----------
function chipHtml(deck) {
    const parts = [];
    if (deck.due > 0) parts.push(`<b class="text-red-500">${deck.due} câu đến hạn</b>`);
    if (deck.newToday > 0) parts.push(`<b class="text-indigo-500">+${deck.newToday} câu mới</b>`);
    if (deck.total > 0) parts.push(`đã học ${deck.learned}/${deck.total}`);
    return parts.join('<span class="mx-1 text-gray-200">·</span>');
}

function todayBlockHtml(todayDecks, activeDecks, reviewedToday, now) {
    const totalToday = todayDecks.reduce((s, d) => s + d.due + d.newToday, 0);
    const tomorrowTotal = activeDecks.reduce((s, d) => s + (d.byOffset[1] || 0), 0);

    let body;
    if (todayDecks.length) {
        body = `<div class="space-y-2">${todayDecks.map(d => `
        <div class="flex items-center gap-3 p-3 rounded-2xl border border-pink-100 bg-pink-50/40 active:bg-pink-50 transition">
            <span class="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-400 to-rose-400 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                <i class="fas fa-fire"></i>
            </span>
            <div class="min-w-0 flex-1">
                <div class="text-sm font-bold text-gray-700 truncate">${esc(d.title)}</div>
                <div class="text-[11px] sm:text-xs text-gray-400 mt-0.5">${chipHtml(d)}</div>
            </div>
            <a href="${srsLink(d.quizId)}"
                class="px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-400 text-white text-xs sm:text-sm font-bold
                       shadow-sm active:scale-95 hover:shadow-md transition flex-shrink-0 whitespace-nowrap">
                <i class="fas fa-play mr-1"></i>Ôn ngay
            </a>
        </div>`).join('')}</div>`;
    } else if (reviewedToday > 0) {
        body = `
        <div class="p-4 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 flex items-center gap-3">
            <span class="text-2xl">🎉</span>
            <div class="text-sm text-emerald-700">
                <b>Hoàn thành hôm nay!</b> Bạn đã ôn ${reviewedToday} câu.
                ${tomorrowTotal > 0 ? `Ngày mai có <b>${tomorrowTotal} câu</b> chờ bạn.` : 'Ngày mai chưa có lịch — cứ thư giãn nhé.'}
            </div>
        </div>`;
    } else {
        body = `
        <div class="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-100 flex items-center gap-3 text-sm text-emerald-700">
            <i class="fas fa-circle-check text-emerald-500 text-lg"></i>
            <span>Không có câu nào đến hạn hôm nay.${tomorrowTotal > 0 ? ` Ngày mai có <b>${tomorrowTotal} câu</b> — hẹn gặp lại!` : ''}</span>
        </div>`;
    }

    return `
        <div class="srs-appear">
            <h4 class="text-xs font-extrabold text-gray-500 uppercase tracking-wider flex items-center gap-2 mb-3">
                <i class="fas fa-calendar-day text-pink-400"></i> Hôm nay cần ôn
                ${totalToday > 0 ? `<span class="normal-case tracking-normal px-2 py-0.5 rounded-full bg-pink-100 text-pink-600 text-[10px] font-extrabold">${totalToday} câu · ${todayDecks.length} bộ</span>` : ''}
            </h4>
            ${body}
        </div>`;
}

// ---------- Khối: Chuỗi ôn + dải hoạt động 14 ngày ----------
function activityBlockHtml(now) {
    const log = readSrsLog();
    const streak = getSrsStreak(now);
    const days = [];
    for (let i = ACTIVITY_DAYS - 1; i >= 0; i--) {
        const t = now - i * DAY_MS;
        days.push({ t, count: log[localDayStr(t)] | 0, isToday: i === 0 });
    }
    const total = days.reduce((s, d) => s + d.count, 0);
    if (total === 0 && streak === 0) return ''; // chưa từng ôn → không chiếm chỗ

    const max = Math.max(1, ...days.map(d => d.count));
    const bars = days.map(d => {
        const h = d.count > 0 ? Math.max(5, Math.round(d.count / max * 30)) : 3;
        const color = d.count > 0
            ? (d.isToday ? 'background:linear-gradient(to top,#ec4899,#f472b6)' : 'background:linear-gradient(to top,#34d399,#6ee7b7)')
            : 'background:#e5e7eb';
        return `<div class="w-2 sm:w-2.5 rounded-full ${d.isToday ? 'ring-2 ring-pink-200' : ''}"
                     style="height:${h}px;${color}" title="${fmtDM(d.t)}: ${d.count} câu"></div>`;
    }).join('');

    const todayCount = days[days.length - 1].count;
    return `
        <div class="srs-appear flex items-center justify-between gap-4 p-3.5 rounded-2xl bg-gray-50/80 border border-gray-100">
            <div class="min-w-0">
                <div class="text-sm font-extrabold text-gray-700">
                    ${streak > 0 ? `🔥 Chuỗi ${streak} ngày` : 'Hoạt động ôn tập'}
                </div>
                <div class="text-[11px] text-gray-400 mt-0.5">
                    ${todayCount > 0 ? `Hôm nay: <b class="text-pink-500">${todayCount} câu</b> · ` : ''}14 ngày qua: ${total} câu
                </div>
            </div>
            <div class="flex items-end gap-[3px] h-9 flex-shrink-0" aria-hidden="true">${bars}</div>
        </div>`;
}

// ---------- Khối: 7 ngày tới ----------
function forecastBlockHtml(activeDecks, now) {
    let anyUpcoming = false;
    const days = [];
    for (let k = 1; k <= DAYS_AHEAD; k++) {
        const items = [];
        activeDecks.forEach(d => {
            const c = d.byOffset[k] || 0;
            if (c > 0) items.push({ title: d.title, count: c });
        });
        const count = items.reduce((s, it) => s + it.count, 0);
        if (count > 0) anyUpcoming = true;
        days.push({ offset: k, count, items });
    }
    const laterTotal = activeDecks.reduce((s, d) => s + d.later, 0);

    const head = `
        <h4 class="text-xs font-extrabold text-gray-500 uppercase tracking-wider flex items-center gap-2 mb-3">
            <i class="fas fa-calendar-week text-indigo-400"></i> 7 ngày tới
        </h4>`;

    if (!anyUpcoming && laterTotal <= 0) {
        return `
        <div class="srs-appear">${head}
            <p class="text-sm text-gray-400 p-3">Chưa có lịch hẹn sắp tới — mỗi câu trả lời đúng trong phiên ôn sẽ tự động được hẹn ngày ôn lại.</p>
        </div>`;
    }

    const maxCount = Math.max(1, ...days.map(d => d.count));
    const rows = days.map(d => {
        const pct = d.count > 0 ? Math.max(8, Math.round(d.count / maxCount * 100)) : 0;
        const deckLine = d.items.length
            ? `<div class="text-[11px] text-gray-400 leading-snug mt-0.5 srs-clamp-2">${d.items.map(it => `${esc(it.title)} <b class="text-gray-500">(${it.count})</b>`).join(' · ')}</div>`
            : '';
        return `
        <div class="py-1.5 flex items-start gap-2.5 sm:gap-3">
            <div class="w-14 sm:w-20 flex-shrink-0 text-right pt-0.5">
                <div class="text-[11px] sm:text-xs font-bold ${d.count > 0 ? 'text-gray-600' : 'text-gray-300'}">${dayLabel(d.offset, now)}</div>
                <div class="text-[10px] ${d.count > 0 ? 'text-gray-400' : 'text-gray-300'}">${fmtDM(now + d.offset * DAY_MS)}</div>
            </div>
            <div class="flex-1 min-w-0">
                <div class="h-5 bg-gray-50 rounded-md overflow-hidden flex items-center">
                    ${d.count > 0 ? `<div class="h-full rounded-md bg-gradient-to-r from-indigo-300 to-violet-400 flex-shrink-0" style="width:${pct}%"></div>` : ''}
                    <span class="text-[11px] font-bold ${d.count > 0 ? 'text-gray-500' : 'text-gray-300'} pl-2 whitespace-nowrap">${d.count > 0 ? plural(d.count, 'câu') : '—'}</span>
                </div>
                ${deckLine}
            </div>
        </div>`;
    }).join('');

    return `
        <div class="srs-appear">${head}
            <div>${rows}</div>
            ${laterTotal > 0 ? `<p class="text-[11px] text-gray-400 mt-2 pl-1"><i class="fas fa-hourglass-half mr-1"></i>Sau 7 ngày: còn ${laterTotal} câu đã được hẹn xa hơn.</p>` : ''}
        </div>`;
}

// ---------- Khối: Quản lý ----------
function manageRowHtml(d, now) {
    const qAttr = esc(d.quizId);
    const pct = d.total > 0 ? Math.min(100, Math.round(d.learned / d.total * 100)) : 0;
    const facts = [
        `<span title="Số câu đã vào lịch ôn"><i class="fas fa-seedling text-emerald-400 mr-1"></i>${d.learned}${d.total > 0 ? `/${d.total}` : ''} câu</span>`,
        `<span title="Đúng từ 3 lần liên tiếp trở lên"><i class="fas fa-medal text-amber-400 mr-1"></i>vững ${d.strong}</span>`,
        d.hard > 0 ? `<span title="Sai từ 3 lần trở lên — nên ôn kỹ"><i class="fas fa-bolt text-rose-400 mr-1"></i>hay sai ${d.hard}</span>` : '',
        `<span title="Lần ôn kế tiếp"><i class="fas fa-calendar-check text-indigo-300 mr-1"></i>${nextDueLabel(d, now)}</span>`,
        `<span title="Giới hạn câu mới đưa vào mỗi ngày"><i class="fas fa-plus text-gray-300 mr-1"></i>mới/ngày: ${d.newPerDay == null ? '∞' : d.newPerDay}</span>`,
    ].filter(Boolean).join('');

    const desktopActions = `
        <div class="hidden sm:flex items-center gap-1.5 flex-shrink-0">
            <a href="${srsLink(d.quizId)}" title="Ôn ngay"
                class="w-8 h-8 rounded-lg bg-pink-50 text-pink-500 hover:bg-pink-100 active:scale-95 flex items-center justify-center transition">
                <i class="fas fa-play text-xs"></i>
            </a>
            <button type="button" data-srs-action="edit" data-quiz="${qAttr}" title="Giới hạn câu mới mỗi ngày"
                class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-500 hover:bg-indigo-100 active:scale-95 flex items-center justify-center transition">
                <i class="fas fa-sliders-h text-xs pointer-events-none"></i>
            </button>
            <button type="button" data-srs-action="toggle-pause" data-quiz="${qAttr}"
                title="${d.paused ? 'Ôn lại bộ này (hiện lại trong chuông thông báo)' : 'Tạm dừng ôn (ẩn khỏi chuông thông báo)'}"
                class="w-8 h-8 rounded-lg ${d.paused ? 'bg-emerald-50 text-emerald-500 hover:bg-emerald-100' : 'bg-amber-50 text-amber-500 hover:bg-amber-100'} active:scale-95 flex items-center justify-center transition">
                <i class="fas ${d.paused ? 'fa-bell' : 'fa-bell-slash'} text-xs pointer-events-none"></i>
            </button>
            <button type="button" data-srs-action="delete" data-quiz="${qAttr}" title="Xóa lịch ôn của bộ này"
                class="w-8 h-8 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 active:scale-95 flex items-center justify-center transition">
                <i class="fas fa-trash-alt text-xs pointer-events-none"></i>
            </button>
        </div>`;
    // Mobile: một nút ⋯ mở bottom sheet cho gọn
    const mobileActions = `
        <button type="button" data-srs-action="sheet" data-quiz="${qAttr}" title="Tùy chọn" aria-haspopup="true"
            class="sm:hidden w-9 h-9 rounded-xl bg-gray-50 text-gray-400 active:bg-gray-100 active:scale-95 flex items-center justify-center transition flex-shrink-0">
            <i class="fas fa-ellipsis-vertical pointer-events-none"></i>
        </button>`;

    return `
        <div class="p-3 sm:px-4 flex items-center gap-2.5 sm:gap-3 ${d.paused ? 'opacity-60 bg-gray-50/60' : 'bg-white'}">
            <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 min-w-0">
                    <span class="text-sm font-bold text-gray-700 truncate">${esc(d.title)}</span>
                    ${d.paused ? '<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 text-[10px] font-extrabold flex-shrink-0"><i class="fas fa-bell-slash mr-1"></i>Tạm dừng</span>' : ''}
                </div>
                <div class="text-[11px] text-gray-400 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">${facts}</div>
                ${d.total > 0 ? `
                <div class="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div class="h-full rounded-full bg-gradient-to-r from-emerald-300 to-teal-400" style="width:${pct}%"></div>
                </div>` : ''}
            </div>
            ${desktopActions}
            ${mobileActions}
        </div>`;
}

function manageBlockHtml(decks, now) {
    const shown = _showAllManage ? decks : decks.slice(0, MANAGE_COLLAPSED_COUNT);
    const hidden = decks.length - shown.length;
    return `
        <div class="srs-appear">
            <h4 class="text-xs font-extrabold text-gray-500 uppercase tracking-wider flex items-center gap-2 mb-3">
                <i class="fas fa-gear text-purple-400"></i> Quản lý bộ đề đang ôn
                <span class="normal-case tracking-normal px-2 py-0.5 rounded-full bg-purple-50 text-purple-500 text-[10px] font-extrabold">${decks.length}</span>
            </h4>
            <div class="rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
                ${shown.map(d => manageRowHtml(d, now)).join('')}
            </div>
            ${hidden > 0 || (_showAllManage && decks.length > MANAGE_COLLAPSED_COUNT) ? `
            <button type="button" data-srs-action="toggle-more"
                class="mt-2 w-full py-2.5 rounded-xl bg-gray-50 text-gray-500 text-xs font-bold hover:bg-gray-100 active:scale-[.99] transition">
                ${_showAllManage ? '<i class="fas fa-chevron-up mr-1"></i>Thu gọn' : `<i class="fas fa-chevron-down mr-1"></i>Xem thêm ${hidden} bộ`}
            </button>` : ''}
        </div>`;
}

function emptyHtml() {
    return `
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left srs-appear">
            <span class="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-400 to-violet-500 text-white flex items-center justify-center flex-shrink-0">
                <i class="fas fa-brain text-xl"></i>
            </span>
            <div class="min-w-0">
                <h3 class="text-base font-bold text-gray-700">Ôn tập ngắt quãng</h3>
                <p class="text-xs text-gray-400 mt-1">
                    Bạn chưa có bộ đề nào trong lịch ôn. Mở một bộ đề rồi chọn
                    <b class="text-indigo-500">"Ôn ngắt quãng"</b> — hệ thống sẽ tự hẹn ngày ôn lại từng câu
                    (đúng thì giãn xa dần, sai thì học lại ngay) và nhắc bạn ở đây cùng chuông thông báo.
                </p>
            </div>
            <button type="button" data-srs-action="goto-library"
                class="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-sm font-bold shadow-sm active:scale-95 hover:shadow-md transition flex-shrink-0">
                <i class="fas fa-book-open mr-1.5"></i>Mở thư viện
            </button>
        </div>`;
}

// ---------- Render ----------
function render() {
    const mount = document.getElementById('srs-dashboard');
    if (!mount) return;
    injectStyles();
    const now = Date.now();
    const decks = getAllSrsDeckDetails(DAYS_AHEAD, now);
    if (!decks.length) {
        mount.innerHTML = emptyHtml();
        return;
    }

    const active = decks.filter(d => !d.paused);
    const todayDecks = active.filter(d => d.due > 0 || d.newToday > 0);
    const totalDue = active.reduce((s, d) => s + d.due, 0);
    const streak = getSrsStreak(now);
    const reviewedToday = readSrsLog()[localDayStr(now)] | 0;

    mount.innerHTML = `
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div class="p-4 sm:p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div class="min-w-0">
                    <h3 class="text-lg font-bold text-gray-700 flex items-center gap-2">
                        <span class="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-400 to-violet-500 text-white flex items-center justify-center flex-shrink-0">
                            <i class="fas fa-brain text-sm"></i>
                        </span>
                        Ôn tập ngắt quãng
                    </h3>
                    <p class="text-gray-400 text-xs mt-1">Lịch ôn tự giãn cách kiểu Anki — đúng thì hẹn xa hơn, sai thì học lại ngay trong ngày</p>
                </div>
                <div class="flex items-center gap-2 flex-wrap flex-shrink-0">
                    <span class="px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-600 text-xs font-extrabold">
                        ${active.length} bộ đang ôn${decks.length > active.length ? ` · ${decks.length - active.length} tạm dừng` : ''}
                    </span>
                    ${totalDue > 0 ? `
                    <span class="px-3 py-1.5 rounded-full bg-red-50 text-red-500 text-xs font-extrabold">
                        <i class="fas fa-fire mr-1"></i>${totalDue} câu đến hạn
                    </span>` : ''}
                    ${streak > 0 ? `
                    <span class="px-3 py-1.5 rounded-full bg-amber-50 text-amber-600 text-xs font-extrabold" title="Số ngày ôn liên tiếp">
                        🔥 ${streak} ngày
                    </span>` : ''}
                </div>
            </div>
            <div class="p-4 sm:p-6 space-y-6 sm:space-y-7">
                ${todayBlockHtml(todayDecks, active, reviewedToday, now)}
                ${activityBlockHtml(now)}
                ${forecastBlockHtml(active, now)}
                ${manageBlockHtml(decks, now)}
            </div>
        </div>`;
}

// Vẽ lại chính mình + báo cho chuông (bell chỉ nghe event, không phát lại → không lặp)
function rerenderAndNotify() {
    render();
    document.dispatchEvent(new CustomEvent('srs-data-changed', { detail: { from: 'dashboard' } }));
}

// ---------- Hành động ----------
// Kéo cloud về trước rồi mới đẩy — pushCloudStudy setDoc ghi đè TOÀN doc, đẩy
// thẳng local cũ có thể xóa ghi chú/đánh dấu vừa tạo trên máy khác.
async function pushStudyWithPull(uid, quizId) {
    await syncPullStudy(uid, quizId);
    return pushCloudStudy(uid, quizId, readLocalStudy(quizId));
}

async function togglePause(deck) {
    setSrsPaused(deck.quizId, !deck.paused);
    rerenderAndNotify();
    showToast(deck.paused
        ? `Đã bật ôn lại "${deck.title}" — bộ đề sẽ hiện trong chuông thông báo.`
        : `Đã tạm dừng "${deck.title}" — lịch vẫn được giữ, bật lại bất cứ lúc nào.`, 'success');
    const user = auth.currentUser;
    if (user) { try { await pushStudyWithPull(user.uid, deck.quizId); } catch (e) {} }
}

async function deleteDeck(deck) {
    const ok = await showConfirm(
        `Xóa toàn bộ lịch ôn ngắt quãng của "${deck.title}"? Tiến độ giãn cách của ${deck.learned} câu sẽ mất (ghi chú, đánh dấu và bộ đề KHÔNG bị ảnh hưởng).`,
        { title: 'Xóa lịch ôn', confirmText: 'Xóa lịch', cancelText: 'Giữ lại', tone: 'danger' }
    );
    if (!ok) return;

    let cloudOk = true;
    const user = auth.currentUser;
    if (user) {
        // Hợp nhất cloud về trước, rồi đẩy lại doc với srs rỗng để lần sync sau
        // không hồi sinh lịch; notes/marks/annotations giữ nguyên trong doc.
        await syncPullStudy(user.uid, deck.quizId);
        const data = readLocalStudy(deck.quizId);
        data.srs = {};
        writeLocalStudy(deck.quizId, data);
        cloudOk = await pushCloudStudy(user.uid, deck.quizId, data);
    }
    deleteSrsLocal(deck.quizId);
    rerenderAndNotify();
    showToast(cloudOk
        ? `Đã xóa lịch ôn của "${deck.title}".`
        : `Đã xóa trên máy này, nhưng chưa xóa được trên cloud (mất mạng?) — lịch có thể xuất hiện lại.`,
        cloudOk ? 'success' : 'warning');
}

// Hộp thoại chỉnh giới hạn câu mới mỗi ngày (meta lưu theo thiết bị)
function openLimitModal(deck) {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[100000] flex items-center justify-center px-4';
    overlay.style.cssText = 'background:rgba(17,24,39,.45);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);';
    overlay.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm relative">
            <button type="button" data-limit-close class="absolute top-3.5 right-4 text-gray-400 hover:text-gray-700">
                <i class="fas fa-times text-xl pointer-events-none"></i>
            </button>
            <h3 class="text-base font-extrabold text-gray-700 flex items-center gap-2">
                <i class="fas fa-sliders-h text-indigo-400"></i> Giới hạn câu mới mỗi ngày
            </h3>
            <p class="text-xs text-gray-400 mt-1 mb-4 truncate">${esc(deck.title)}</p>
            <input type="number" min="0" max="999" inputmode="numeric" data-limit-input
                value="${deck.newPerDay == null ? '' : deck.newPerDay}"
                placeholder="Để trống = không giới hạn"
                class="w-full px-4 py-2.5 border border-indigo-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm font-semibold">
            <div class="flex gap-1.5 mt-2.5 flex-wrap">
                ${[5, 10, 20, 50].map(n => `
                <button type="button" data-limit-preset="${n}"
                    class="px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-500 text-xs font-bold active:scale-95 hover:bg-indigo-100 transition">${n} câu</button>`).join('')}
                <button type="button" data-limit-preset=""
                    class="px-3 py-1.5 rounded-full bg-gray-50 text-gray-500 text-xs font-bold active:scale-95 hover:bg-gray-100 transition">∞ Không giới hạn</button>
            </div>
            <p class="text-[11px] text-gray-400 mt-3 leading-relaxed">
                Câu <b>đến hạn</b> luôn được ôn đủ; giới hạn chỉ áp cho số câu <b>mới</b> đưa thêm vào mỗi ngày.
                Cài đặt này lưu trên thiết bị hiện tại.
            </p>
            <div class="flex gap-2 mt-4">
                <button type="button" data-limit-close
                    class="flex-1 px-4 py-2.5 rounded-xl bg-gray-100 text-gray-500 text-sm font-bold hover:bg-gray-200 active:scale-[.98] transition">Hủy</button>
                <button type="button" data-limit-save
                    class="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-sm font-bold hover:opacity-90 active:scale-[.98] transition">Lưu</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('[data-limit-input]');
    input.focus();
    const close = () => overlay.remove();
    const save = () => {
        const applied = setNewPerDay(deck.quizId, input.value);
        close();
        rerenderAndNotify();
        showToast(applied == null
            ? 'Đã bỏ giới hạn — mỗi phiên sẽ gồm đủ câu đến hạn + toàn bộ câu mới.'
            : `Đã đặt tối đa ${applied} câu mới mỗi ngày.`, 'success');
    };
    overlay.addEventListener('click', (e) => {
        const preset = e.target.closest('[data-limit-preset]');
        if (preset) { input.value = preset.dataset.limitPreset; input.focus(); return; }
        if (e.target === overlay || e.target.closest('[data-limit-close]')) close();
        else if (e.target.closest('[data-limit-save]')) save();
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') close();
    });
}

// Bottom sheet thao tác trên mobile — mọi hành động của một bộ đề trong một tấm
function openDeckSheet(deck, now) {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[100000]';
    overlay.innerHTML = `
        <div class="srs-sheet-backdrop absolute inset-0" style="background:rgba(17,24,39,.45);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);"></div>
        <div class="srs-sheet-panel absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl px-4 pt-3"
             style="padding-bottom:calc(1rem + env(safe-area-inset-bottom, 0px));" role="dialog" aria-modal="true">
            <div class="w-10 h-1.5 bg-gray-200 rounded-full mx-auto mb-3"></div>
            <div class="px-1 mb-3">
                <div class="text-sm font-extrabold text-gray-700 leading-snug srs-clamp-2">${esc(deck.title)}</div>
                <div class="text-[11px] text-gray-400 mt-1">
                    ${deck.due > 0 ? `<b class="text-red-500">${deck.due} câu đến hạn</b> · ` : ''}đã học ${deck.learned}${deck.total > 0 ? `/${deck.total}` : ''} · vững ${deck.strong}${deck.hard > 0 ? ` · hay sai ${deck.hard}` : ''} · hạn kế tiếp: ${nextDueLabel(deck, now)}
                </div>
            </div>
            <div class="space-y-2">
                <a href="${srsLink(deck.quizId)}"
                    class="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-400 text-white font-bold text-sm active:scale-[.98] transition">
                    <i class="fas fa-play w-5 text-center"></i>Ôn ngay${deck.due + deck.newToday > 0 ? ` (${deck.due + deck.newToday} câu)` : ''}
                </a>
                <button type="button" data-sheet-action="edit"
                    class="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-indigo-50 text-indigo-600 font-bold text-sm active:scale-[.98] transition">
                    <i class="fas fa-sliders-h w-5 text-center pointer-events-none"></i>
                    <span class="pointer-events-none">Giới hạn câu mới <span class="font-normal text-indigo-400">(hiện tại: ${deck.newPerDay == null ? '∞' : deck.newPerDay}/ngày)</span></span>
                </button>
                <button type="button" data-sheet-action="toggle-pause"
                    class="w-full flex items-center gap-3 p-3.5 rounded-2xl ${deck.paused ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'} font-bold text-sm active:scale-[.98] transition">
                    <i class="fas ${deck.paused ? 'fa-bell' : 'fa-bell-slash'} w-5 text-center pointer-events-none"></i>
                    <span class="pointer-events-none">${deck.paused ? 'Ôn lại bộ này' : 'Tạm dừng thông báo'}</span>
                </button>
                <button type="button" data-sheet-action="delete"
                    class="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-red-50 text-red-500 font-bold text-sm active:scale-[.98] transition">
                    <i class="fas fa-trash-alt w-5 text-center pointer-events-none"></i>
                    <span class="pointer-events-none">Xóa lịch ôn</span>
                </button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    let closed = false;
    const close = () => {
        if (closed) return;
        closed = true;
        overlay.classList.add('srs-sheet-closing');
        setTimeout(() => overlay.remove(), 200);
    };
    overlay.addEventListener('click', async (e) => {
        const actBtn = e.target.closest('[data-sheet-action]');
        if (actBtn) {
            close();
            const action = actBtn.dataset.sheetAction;
            if (action === 'edit') openLimitModal(deck);
            else if (action === 'toggle-pause') await togglePause(deck);
            else if (action === 'delete') await deleteDeck(deck);
            return;
        }
        if (!e.target.closest('.srs-sheet-panel')) close(); // chạm nền → đóng
    });
}

let _busy = false;
async function onMountClick(e) {
    const btn = e.target.closest('[data-srs-action]');
    if (!btn || _busy) return;
    const action = btn.dataset.srsAction;

    if (action === 'toggle-more') {
        _showAllManage = !_showAllManage;
        render();
        return;
    }
    if (action === 'goto-library') {
        // Chuyển sang tab Thư viện của trang chủ (nav do app.js quản)
        const navLink = document.querySelector('[data-target="libraryContent"]');
        if (navLink) navLink.click();
        return;
    }

    const now = Date.now();
    const deck = getAllSrsDeckDetails(DAYS_AHEAD, now).find(d => d.quizId === btn.dataset.quiz);
    if (!deck) return;
    _busy = true;
    try {
        if (action === 'sheet') openDeckSheet(deck, now);
        else if (action === 'edit') openLimitModal(deck);
        else if (action === 'toggle-pause') await togglePause(deck);
        else if (action === 'delete') await deleteDeck(deck);
    } finally {
        _busy = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const mount = document.getElementById('srs-dashboard');
    if (!mount) return;
    render();
    mount.addEventListener('click', onMountClick);

    // Bell sync cloud xong / tab khác ghi localStorage → vẽ lại
    document.addEventListener('srs-data-changed', (e) => {
        if (!e.detail || e.detail.from !== 'dashboard') render();
    });
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) render();
    });
    window.addEventListener('storage', (e) => {
        if (e.key && e.key.startsWith('quiz_srs')) render();
    });
});
