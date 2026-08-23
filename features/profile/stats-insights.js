// File: features/profile/stats-insights.js
//
// Phần "trực quan" của trang Thống kê (mount #stats-insights trong index.html):
//   1. Chuỗi ngày học  — streak hiện tại / kỷ lục + bản đồ nhiệt 12 tuần
//   2. Độ chính xác    — cột trung bình % theo tuần (8 tuần gần nhất)
//   3. Cần ôn lại      — 5 bộ đề có điểm LẦN GẦN NHẤT thấp nhất, bấm vào là làm luôn
//
// Dữ liệu: cache localStorage `statsRowsCache_{uid}` + đồng bộ TĂNG DẦN từ
// `quiz_results` (cùng kiểu với features/quiz/library/library-attempts.js).
// Nhờ vậy mở tab Thống kê là thấy ngay (vẽ từ cache), server chỉ trả về các lượt
// làm MỚI kể từ lần đồng bộ trước thay vì tải lại toàn bộ lịch sử mỗi lần.

import { auth, db } from '../../core/firebase-init.js';
import { collection, query, where, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";

const DAY_MS = 86400000;
const HEATMAP_WEEKS = 26;      // ~6 tháng, ô nhỏ kiểu lịch đóng góp GitHub
const CHART_WEEKS = 8;
const WEAK_LIMIT = 5;
const WEAK_THRESHOLD = 80;      // % — dưới mức này coi là "cần ôn lại"
const MAX_ROWS = 800;           // giữ localStorage gọn: chỉ nhớ 800 lượt gần nhất
const QUIZ_URL = 'features/quiz/quiz.html';

// ---------- Cache ----------
// Mỗi lượt lưu dạng ngắn cho nhẹ: q=quizId, ti=title, s=đúng, t=tổng, d=giây, at=ms
function cacheKey() {
    const uid = auth.currentUser ? auth.currentUser.uid : 'anon';
    return `statsRowsCache_${uid}`;
}

export function readRowsCache() {
    try {
        const raw = JSON.parse(localStorage.getItem(cacheKey()) || 'null');
        if (!raw || !Array.isArray(raw.rows)) return { rows: [], lastSync: 0 };
        return { rows: raw.rows, lastSync: raw.lastSync || 0 };
    } catch { return { rows: [], lastSync: 0 }; }
}

function writeRowsCache(rows, lastSync) {
    try {
        localStorage.setItem(cacheKey(), JSON.stringify({ lastSync, rows: rows.slice(-MAX_ROWS) }));
    } catch {}
}

/**
 * Kéo các lượt làm bài mới hơn lần đồng bộ trước rồi ghi vào cache.
 * @returns {Promise<{rows:Array, lastSync:number, changed:boolean}>}
 */
export async function syncRows() {
    const user = auth.currentUser;
    const cached = readRowsCache();
    if (!user) return { ...cached, changed: false };

    const constraints = [where('userId', '==', user.uid)];
    if (cached.lastSync > 0) constraints.push(where('completedAt', '>', new Date(cached.lastSync)));
    constraints.push(orderBy('completedAt', 'asc'));

    const snap = await getDocs(query(collection(db, 'quiz_results'), ...constraints));
    let lastSync = cached.lastSync;
    const fresh = [];
    snap.forEach(d => {
        const r = d.data();
        const at = r.completedAt && typeof r.completedAt.toDate === 'function' ? r.completedAt.toDate().getTime() : 0;
        if (!at) return;
        fresh.push({
            q: r.quizId || '',
            ti: r.quizTitle || 'Bộ đề',
            s: Number(r.score) || 0,
            t: Number(r.totalQuestions) || 0,
            d: Number(r.timeTaken) || 0,
            at
        });
        if (at > lastSync) lastSync = at;
    });
    // Lần đầu mà chưa có lượt nào: vẫn ghi mốc để lần sau không quét lại từ đầu
    if (lastSync === 0) lastSync = Date.now();

    const rows = fresh.length ? cached.rows.concat(fresh).slice(-MAX_ROWS) : cached.rows;
    writeRowsCache(rows, lastSync);
    return { rows, lastSync, changed: fresh.length > 0 };
}

/** Xóa cache để nút "Tải lại" kéo lại toàn bộ lịch sử từ đầu. */
export function clearRowsCache() {
    try { localStorage.removeItem(cacheKey()); } catch {}
}

// ---------- Tiện ích ----------
const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const dayStart = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const pct = (r) => (r.t > 0 ? Math.round((r.s / r.t) * 100) : 0);
const dm = (ms) => `${new Date(ms).getDate()}/${new Date(ms).getMonth() + 1}`;

// Màu theo mức điểm — dùng chung cho cột biểu đồ và nhãn "cần ôn lại"
function scoreTone(p) {
    if (p >= 80) return { bar: 'bg-emerald-400', text: 'text-emerald-600', chip: 'bg-emerald-50' };
    if (p >= 60) return { bar: 'bg-amber-400', text: 'text-amber-600', chip: 'bg-amber-50' };
    return { bar: 'bg-rose-400', text: 'text-rose-600', chip: 'bg-rose-50' };
}

/** Tổng hợp mọi con số cần cho các khối bên dưới. */
export function computeInsights(rows) {
    const today = dayStart(Date.now());
    const perDay = new Map();       // dayStart -> { n: số lượt, q: số câu }
    const lastByQuiz = new Map();   // quizId -> lượt mới nhất của bộ đó

    rows.forEach(r => {
        const k = dayStart(r.at);
        const cur = perDay.get(k) || { n: 0, q: 0 };
        cur.n += 1; cur.q += r.t;
        perDay.set(k, cur);
        if (r.q) {
            const prev = lastByQuiz.get(r.q);
            if (!prev || r.at > prev.at) lastByQuiz.set(r.q, r);
        }
    });

    // Chuỗi ngày liên tiếp — tính lùi từ hôm nay (chưa học hôm nay thì tính từ hôm qua)
    let streak = 0;
    let cursor = perDay.has(today) ? today : today - DAY_MS;
    while (perDay.has(cursor)) { streak++; cursor -= DAY_MS; }

    let best = 0, run = 0, prevDay = null;
    [...perDay.keys()].sort((a, b) => a - b).forEach(k => {
        run = (prevDay !== null && k - prevDay === DAY_MS) ? run + 1 : 1;
        if (run > best) best = run;
        prevDay = k;
    });

    const activeDays30 = [...perDay.keys()].filter(k => k > today - 30 * DAY_MS).length;

    // 7 ngày qua vs 7 ngày trước đó — cho chip "so với tuần trước"
    const now = Date.now();
    const countIn = (from, to) => rows.reduce((s, r) => s + (r.at >= from && r.at < to ? 1 : 0), 0);
    const thisWeekAttempts = countIn(now - 7 * DAY_MS, Infinity);
    const weekDelta = thisWeekAttempts - countIn(now - 14 * DAY_MS, now - 7 * DAY_MS);

    // Trung bình % theo tuần (8 cửa sổ 7 ngày, cũ → mới, cửa sổ cuối gồm hôm nay)
    const endExclusive = today + DAY_MS;
    const weekly = [];
    for (let i = CHART_WEEKS - 1; i >= 0; i--) {
        const to = endExclusive - i * 7 * DAY_MS;
        const from = to - 7 * DAY_MS;
        const inWeek = rows.filter(r => r.at >= from && r.at < to && r.t > 0);
        weekly.push({
            from,
            n: inWeek.length,
            avg: inWeek.length ? Math.round(inWeek.reduce((s, r) => s + pct(r), 0) / inWeek.length) : null
        });
    }

    const weak = [...lastByQuiz.values()]
        .filter(r => r.t > 0 && pct(r) < WEAK_THRESHOLD)
        .sort((a, b) => pct(a) - pct(b))
        .slice(0, WEAK_LIMIT);

    return { perDay, today, streak, best, activeDays30, weekly, weak, thisWeekAttempts, weekDelta };
}

// ---------- Khối 1: chuỗi ngày + bản đồ nhiệt ----------
function heatmapHtml(ins) {
    // Lưới 7 hàng (CN→T7) × 12 cột tuần, đọc theo cột như lịch; hôm nay ở cột cuối
    const today = ins.today;
    const lastColStart = today - new Date(today).getDay() * DAY_MS;   // Chủ nhật tuần này
    const start = lastColStart - (HEATMAP_WEEKS - 1) * 7 * DAY_MS;

    const levelBg = ['bg-gray-100', 'bg-pink-200', 'bg-pink-300', 'bg-pink-400', 'bg-pink-500'];
    const cells = [];
    const monthLabels = [];
    let lastMonth = -1;

    for (let w = 0; w < HEATMAP_WEEKS; w++) {
        const colStart = start + w * 7 * DAY_MS;
        const m = new Date(colStart).getMonth();
        monthLabels.push(m !== lastMonth ? `T${m + 1}` : '');
        lastMonth = m;
        for (let dow = 0; dow < 7; dow++) {
            const day = colStart + dow * DAY_MS;
            if (day > today) { cells.push('<i class="block w-full aspect-square"></i>'); continue; }
            const info = ins.perDay.get(day);
            const n = info ? info.n : 0;
            const lv = n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4;
            const tip = `${new Date(day).toLocaleDateString('vi-VN')}: ${n ? n + ' lượt · ' + info.q + ' câu' : 'nghỉ'}`;
            cells.push(`<i title="${tip}" class="block w-full aspect-square rounded-[2px] ${levelBg[lv]}${day === today ? ' ring-2 ring-pink-500' : ''}"></i>`);
        }
    }

    // Chốt bề rộng tối đa để ô không phình to trên desktop (ô ~18px, như lịch GitHub)
    return `
    <div class="mt-4 mx-auto w-full" style="max-width:${HEATMAP_WEEKS * 20}px">
        <div class="grid gap-[2px]" style="grid-auto-flow:column;grid-template-rows:repeat(7,minmax(0,1fr));grid-auto-columns:minmax(0,1fr)">${cells.join('')}</div>
        <div class="grid gap-[2px] mt-1" style="grid-template-columns:repeat(${HEATMAP_WEEKS},minmax(0,1fr))">
            ${monthLabels.map(l => `<span class="text-[9px] text-gray-400 leading-none">${l}</span>`).join('')}
        </div>
        <div class="flex items-center justify-end gap-1 mt-2 text-[10px] text-gray-400">
            <span>Ít</span>
            ${levelBg.map(c => `<i class="w-2.5 h-2.5 rounded-[2px] ${c} inline-block"></i>`).join('')}
            <span>Nhiều</span>
        </div>
    </div>`;
}

function streakBlockHtml(ins) {
    const fire = ins.streak > 0;
    return `
    <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div class="flex items-start justify-between gap-3 flex-wrap">
            <div class="flex items-center gap-3">
                <span class="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-sm
                    ${fire ? 'bg-gradient-to-br from-orange-400 to-rose-500' : 'bg-gray-300'}">
                    <i class="fas fa-fire text-xl"></i>
                </span>
                <div>
                    <div class="text-2xl font-extrabold text-gray-800 leading-none">
                        ${ins.streak}<span class="text-sm font-bold text-gray-400 ml-1">ngày liên tiếp</span>
                    </div>
                    <p class="text-[11px] text-gray-400 mt-1">
                        Kỷ lục <b class="text-gray-600">${ins.best} ngày</b>
                        <span class="mx-1 text-gray-200">·</span>
                        30 ngày qua học <b class="text-gray-600">${ins.activeDays30} ngày</b>
                    </p>
                </div>
            </div>
            <div class="text-right">
                <span class="text-[10px] font-bold uppercase text-gray-400 block">7 ngày qua</span>
                <span class="text-lg font-extrabold text-gray-700">${ins.thisWeekAttempts} lượt</span>
                ${ins.weekDelta !== 0 ? `<span class="ml-1 text-[11px] font-bold ${ins.weekDelta > 0 ? 'text-emerald-500' : 'text-rose-400'}">${ins.weekDelta > 0 ? '▲' : '▼'} ${Math.abs(ins.weekDelta)}</span>` : ''}
            </div>
        </div>
        ${heatmapHtml(ins)}
    </div>`;
}

// ---------- Khối 2: độ chính xác theo tuần ----------
function chartHtml(ins) {
    const has = ins.weekly.some(w => w.avg !== null);
    const bars = ins.weekly.map(w => {
        const label = dm(w.from);
        if (w.avg === null) {
            return `<div class="flex flex-col items-center gap-1 flex-1 min-w-0" title="Tuần ${label}: chưa làm bài">
                <span class="text-[9px] leading-none text-transparent">·</span>
                <div class="w-full flex-1 flex items-end"><div class="w-full rounded-t-md bg-gray-100 h-1"></div></div>
                <span class="text-[9px] text-gray-300 truncate w-full text-center">${label}</span>
            </div>`;
        }
        const tone = scoreTone(w.avg);
        return `<div class="flex flex-col items-center gap-1 flex-1 min-w-0" title="Tuần ${label}: ${w.n} lượt · trung bình ${w.avg}%">
            <span class="text-[9px] font-bold ${tone.text} leading-none">${w.avg}</span>
            <div class="w-full flex-1 flex items-end">
                <div class="w-full rounded-t-md ${tone.bar} transition-all duration-500" style="height:${Math.max(6, w.avg)}%"></div>
            </div>
            <span class="text-[9px] text-gray-400 truncate w-full text-center">${label}</span>
        </div>`;
    }).join('');

    return `
    <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col">
        <h3 class="text-sm font-bold text-gray-700 flex items-center gap-2">
            <i class="fas fa-chart-simple text-pink-400"></i> Độ chính xác theo tuần
            <span class="text-[10px] font-semibold text-gray-400">% đúng trung bình</span>
        </h3>
        ${has
            ? `<div class="flex items-stretch gap-1.5 mt-4 flex-1 min-h-[140px]">${bars}</div>`
            : '<p class="text-xs text-gray-400 py-10 text-center">Chưa đủ dữ liệu — làm vài bộ đề để xem xu hướng nhé 🐿️</p>'}
    </div>`;
}

// ---------- Khối 3: cần ôn lại ----------
function weakBlockHtml(ins) {
    if (!ins.weak.length) {
        return `
        <div class="bg-white rounded-2xl px-5 py-4 shadow-sm border border-gray-100 flex items-center gap-3">
            <i class="fas fa-circle-check text-emerald-400 text-lg"></i>
            <div class="min-w-0">
                <h3 class="text-sm font-bold text-gray-700">Cần ôn lại</h3>
                <p class="text-xs text-gray-400">Không bộ đề nào dưới ${WEAK_THRESHOLD}% ở lần làm gần nhất — giỏi quá!</p>
            </div>
        </div>`;
    }
    const items = ins.weak.map(r => {
        const p = pct(r);
        const tone = scoreTone(p);
        return `
        <a href="${QUIZ_URL}?id=${encodeURIComponent(r.q)}"
           class="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition group">
            <span class="w-11 h-11 rounded-xl ${tone.chip} ${tone.text} flex items-center justify-center font-extrabold text-sm shrink-0">${p}%</span>
            <span class="min-w-0 flex-1">
                <span class="block text-sm font-bold text-gray-700 truncate">${esc(r.ti)}</span>
                <span class="block text-[11px] text-gray-400">${r.s}/${r.t} câu · ${new Date(r.at).toLocaleDateString('vi-VN')}</span>
            </span>
            <i class="fas fa-play text-gray-300 group-hover:text-pink-500 transition shrink-0"></i>
        </a>`;
    }).join('');

    return `
    <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <h3 class="text-sm font-bold text-gray-700 flex items-center gap-2 mb-2">
            <i class="fas fa-crosshairs text-rose-400"></i> Cần ôn lại
            <span class="text-[10px] font-semibold text-gray-400">lần gần nhất &lt; ${WEAK_THRESHOLD}%</span>
        </h3>
        <div class="space-y-0.5 -mx-1">${items}</div>
    </div>`;
}

// ---------- Vẽ ----------
export function renderInsights(rows) {
    const mount = document.getElementById('stats-insights');
    if (!mount) return;

    if (!rows.length) {
        mount.innerHTML = `
        <div class="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center">
            <i class="fas fa-seedling text-3xl text-emerald-300 block mb-3"></i>
            <p class="text-sm font-bold text-gray-600">Chưa có dữ liệu ôn tập</p>
            <p class="text-xs text-gray-400 mt-1">Làm thử một bộ đề, chuỗi ngày và biểu đồ sẽ hiện ngay tại đây.</p>
        </div>`;
        return;
    }

    const ins = computeInsights(rows);
    mount.innerHTML = `
        <div class="space-y-4">
            <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
                ${streakBlockHtml(ins)}
                ${chartHtml(ins)}
            </div>
            ${weakBlockHtml(ins)}
        </div>`;
}

export function renderInsightsSkeleton() {
    const mount = document.getElementById('stats-insights');
    if (!mount) return;
    mount.innerHTML = `
        <div class="space-y-4 animate-pulse">
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 h-44"></div>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div class="bg-white rounded-2xl shadow-sm border border-gray-100 h-52"></div>
                <div class="bg-white rounded-2xl shadow-sm border border-gray-100 h-52"></div>
            </div>
        </div>`;
}
