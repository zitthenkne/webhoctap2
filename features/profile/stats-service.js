// File: features/profile/stats-service.js
// Module chịu trách nhiệm tính toán thống kê GPA, các chỉ số tổng quan & thành tựu,
// và liệt kê các bộ đề người dùng đã đánh dấu / ghi chú (tải theo yêu cầu).

import { auth, db } from '../../core/firebase-init.js';
import { collection, query, where, getDocs, orderBy, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { showToast } from '../../core/utils.js';
import { achievements } from '../../core/achievements.js';

// Biến giữ trạng thái loại bài thi và các inputs
let examType = 'attempts'; // 'attempts' hoặc 'pretest'
let percentInputs = [];
let correctInputs = [];

/**
 * Tính toán GPA hệ 4 và điểm chữ từ phần trăm điểm số hệ 10
 * @param {number} percentage Phần trăm điểm số (0 - 100)
 * @returns {object} { score4, letterGrade }
 */
export function calculateGPAFromPercent(percentage) {
    const score10 = percentage / 10;
    let score4 = 0.0;
    let letterGrade = 'F';
    
    if (score10 >= 9.5) { score4 = 4.0; letterGrade = 'A+'; }
    else if (score10 >= 8.5) { score4 = 4.0; letterGrade = 'A'; }
    else if (score10 >= 8.0) { score4 = 3.5; letterGrade = 'B+'; }
    else if (score10 >= 7.0) { score4 = 3.0; letterGrade = 'B'; }
    else if (score10 >= 6.5) { score4 = 2.5; letterGrade = 'C+'; }
    else if (score10 >= 5.5) { score4 = 2.0; letterGrade = 'C'; }
    else if (score10 >= 5.0) { score4 = 1.5; letterGrade = 'D+'; }
    else if (score10 >= 4.0) { score4 = 1.0; letterGrade = 'D'; }
    else { score4 = 0.0; letterGrade = 'F'; }
    
    return { score4, letterGrade };
}

/**
 * Quy đổi số câu đúng (x) trên tổng số câu (y) ra điểm hệ 10 theo công thức UMP.
 * Tách riêng để dùng chung cho cả tính điểm lẫn gợi ý "còn mấy câu nữa".
 */
function score10FromCorrect(x, y) {
    const n = x / y;
    if (n < 0.5) return (8 * x) / y;
    if (n === 0.5) return 4.0;
    if (n < 0.6) return 4 + (10 * (x - 0.5 * y)) / y;
    if (n === 0.6) return 5.0;
    return 5 + (12.5 * (x - 0.6 * y)) / y;
}

// Bảng các mốc điểm chữ theo điểm hệ 10 (biên dưới) — dùng cho gợi ý mức tiếp theo.
const GRADE_TIERS = [
    { min10: 4.0, score4: 1.0, letter: 'D' },
    { min10: 5.0, score4: 1.5, letter: 'D+' },
    { min10: 5.5, score4: 2.0, letter: 'C' },
    { min10: 6.5, score4: 2.5, letter: 'C+' },
    { min10: 7.0, score4: 3.0, letter: 'B' },
    { min10: 8.0, score4: 3.5, letter: 'B+' },
    { min10: 8.5, score4: 4.0, letter: 'A' },
];

/**
 * Tính cần đúng thêm bao nhiêu câu để lên mức điểm hệ 4 kế tiếp.
 * @returns {{need:number, atCorrect:number, letter:string, score4:number}|null}
 *          null nếu đã ở mức hệ 4 cao nhất (4.0).
 */
function nextGradeHint(x, y, currentScore4) {
    const next = GRADE_TIERS.find(t => t.score4 > currentScore4 + 1e-9);
    if (!next) return null;
    for (let k = x + 1; k <= y; k++) {
        if (score10FromCorrect(k, y) >= next.min10 - 1e-9) {
            return { need: k - x, atCorrect: k, letter: next.letter, score4: next.score4 };
        }
    }
    return null;
}

/**
 * Định dạng tổng thời gian ôn tập (giây) thành chuỗi ngắn gọn: "45p", "1g 20p", "2g".
 */
function formatStudyTime(totalSeconds) {
    const secs = Math.max(0, Math.round(Number(totalSeconds) || 0));
    const totalMinutes = Math.round(secs / 60);
    if (totalMinutes < 60) return `${totalMinutes}p`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes ? `${hours}g ${minutes}p` : `${hours}g`;
}

/**
 * Tải và hiển thị toàn bộ trang thống kê (hoạt động ôn tập & thành tựu) của người dùng
 */
export async function loadAndDisplayStats() {
    const user = auth.currentUser;
    const achievementsContainer = document.getElementById('achievements-container');

    // Reset các thẻ Stats Cards (tập trung vào hoạt động ôn tập)
    const uniqueQuizzesEl = document.getElementById('stat-unique-quizzes');
    const totalAttemptsEl = document.getElementById('stat-total-attempts');
    const totalQuestionsEl = document.getElementById('stat-total-questions');
    const totalTimeEl = document.getElementById('stat-total-time');

    if (uniqueQuizzesEl) uniqueQuizzesEl.textContent = '0';
    if (totalAttemptsEl) totalAttemptsEl.textContent = '0';
    if (totalQuestionsEl) totalQuestionsEl.textContent = '0';
    if (totalTimeEl) totalTimeEl.textContent = '0p';

    // Reset giao diện thành tựu
    if (achievementsContainer) achievementsContainer.innerHTML = '';

    if (!user) {
        if (achievementsContainer) achievementsContainer.innerHTML = '<p class="text-gray-500 col-span-full text-center py-6">Vui lòng đăng nhập để xem thành tựu.</p>';
        return;
    }

    try {
        // 1. Tải và hiển thị thành tựu
        const allAchievements = Object.values(achievements);
        
        if (achievementsContainer) {
            allAchievements.forEach(ach => {
                const achievementEl = document.createElement('div');
                achievementEl.className = 'flex flex-col items-center gap-2 opacity-40 grayscale transition-all duration-300 hover:scale-105';
                achievementEl.id = `achievement-${ach.name.replace(/\s/g, '-')}`;
                achievementEl.innerHTML = `
                    <div class="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 relative group cursor-help">
                        <img src="${ach.img}" alt="${ach.name}" class="w-20 h-20 object-cover rounded-xl mx-auto">
                        <div class="absolute inset-0 bg-black/60 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2 text-[10px] text-white font-medium text-center">
                            ${ach.description || 'Thành tựu đặc biệt'}
                        </div>
                    </div>
                    <p class="font-bold text-xs text-gray-700 mt-1">${ach.name}</p>
                `;
                achievementsContainer.appendChild(achievementEl);
            });
        }

        // Tải thành tựu người dùng đã mở khóa
        const achievementsQuery = query(collection(db, "users", user.uid, "achievements"));
        const achievementsSnapshot = await getDocs(achievementsQuery);
        
        if (!achievementsSnapshot.empty) {
            achievementsSnapshot.forEach(docSnap => {
                const unlockedAchievement = achievements[docSnap.id];
                if (unlockedAchievement) {
                    const targetEl = document.getElementById(`achievement-${unlockedAchievement.name.replace(/\s/g, '-')}`);
                    if (targetEl) {
                        targetEl.classList.remove('opacity-40', 'grayscale');
                        targetEl.classList.add('fade-in');
                        const imgWrapper = targetEl.querySelector('div');
                        if (imgWrapper) {
                            imgWrapper.classList.add('ring-4', 'ring-amber-400', 'ring-offset-2');
                        }
                    }
                }
            });
        }
        
        // 2. Tải lịch sử làm bài để tính các chỉ số tổng quan (thẻ Stats Cards)
        const resultsQuery = query(collection(db, "quiz_results"), where("userId", "==", user.uid), orderBy("completedAt", "asc"));
        const resultsSnapshot = await getDocs(resultsQuery);
        const results = resultsSnapshot.docs.map(docSnap => docSnap.data());

        if (results.length > 0) {
            const totalAttempts = results.length;
            const uniqueQuizzes = new Set(results.map(r => r.quizId).filter(Boolean)).size;
            let totalQuestions = 0;
            let totalSeconds = 0;

            results.forEach(result => {
                totalQuestions += Number(result.totalQuestions) || 0;
                totalSeconds += Number(result.timeTaken) || 0;
            });

            if (uniqueQuizzesEl) uniqueQuizzesEl.textContent = uniqueQuizzes;
            if (totalAttemptsEl) totalAttemptsEl.textContent = totalAttempts;
            if (totalQuestionsEl) totalQuestionsEl.textContent = totalQuestions.toLocaleString('vi-VN');
            if (totalTimeEl) totalTimeEl.textContent = formatStudyTime(totalSeconds);
        }
    } catch (e) {
        console.error("Lỗi tải trang thống kê: ", e);
        if (achievementsContainer) achievementsContainer.innerHTML = '<p class="text-red-500 col-span-full py-6">Lỗi tải thành tựu.</p>';
    }
}

/**
 * Tải danh sách các bộ đề mà người dùng đã ĐÁNH DẤU hoặc GHI CHÚ cá nhân.
 *
 * Cố ý KHÔNG tự chạy khi mở tab Thống kê — chỉ chạy khi người dùng bấm "Mở danh sách"
 * để không làm chậm việc tải trang. Mỗi bộ đề được hiển thị thành một thẻ riêng;
 * bấm vào sẽ điều hướng sang trang lịch sử/chi tiết của bộ đề đó.
 *
 * Nguồn dữ liệu: gộp localStorage (quiz_notes_/quiz_marks_/quiz_annot_) và
 * collection Firestore `quiz_study` của người dùng.
 */
export async function loadMarkedNotedQuizzes() {
    const container = document.getElementById('marked-quizzes-list');
    if (!container) return;

    // Skeleton trong lúc tải
    container.innerHTML = `
        <div class="space-y-3">
            <div class="h-20 w-full rounded-2xl bg-gray-100 animate-pulse"></div>
            <div class="h-20 w-full rounded-2xl bg-gray-100 animate-pulse"></div>
        </div>`;

    // quizId -> { notes, marks, annots }
    const stats = new Map();
    const bump = (qid, kind, n) => {
        if (!qid || qid === 'default_quiz' || !n || n <= 0) return;
        const cur = stats.get(qid) || { notes: 0, marks: 0, annots: 0 };
        cur[kind] += n;
        stats.set(qid, cur);
    };

    // 1. Quét localStorage
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const m = key && key.match(/^quiz_(notes|marks|annot)_(.+)$/);
            if (!m) continue;
            const kind = m[1];
            const qid = m[2];
            let obj = {};
            try { obj = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { obj = {}; }
            if (kind === 'notes') {
                bump(qid, 'notes', Object.values(obj).filter(v => v && String(v).trim() !== '').length);
            } else if (kind === 'marks') {
                bump(qid, 'marks', Object.values(obj).filter(v => !!v).length);
            } else {
                bump(qid, 'annots', Object.values(obj).filter(v => Array.isArray(v) && v.length > 0).length);
            }
        }
    } catch (e) { /* localStorage không khả dụng */ }

    // 2. Quét cloud (quiz_study của người dùng hiện tại)
    const user = auth.currentUser;
    if (user) {
        try {
            const q = query(collection(db, 'quiz_study'), where('userId', '==', user.uid));
            const snap = await getDocs(q);
            snap.forEach(d => {
                const data = d.data() || {};
                const qid = data.quizId;
                bump(qid, 'notes', (data.notes || []).filter(n => n && String(n.text || '').trim() !== '').length);
                bump(qid, 'marks', (data.marks || []).filter(mk => mk && mk.reason).length);
                bump(qid, 'annots', (data.annotations || []).filter(a => a && Array.isArray(a.items) && a.items.length > 0).length);
            });
        } catch (e) {
            console.warn('Không tải được danh sách bộ đề đã đánh dấu/ghi chú:', e);
        }
    }

    const quizIds = Array.from(stats.keys());
    if (quizIds.length === 0) {
        container.innerHTML = `
            <div class="text-center py-10 text-gray-400">
                <i class="fas fa-inbox text-3xl block mb-3 text-gray-300"></i>
                <p class="text-sm font-medium">Bạn chưa đánh dấu hay ghi chú ở bộ đề nào.</p>
                <p class="text-xs mt-1">Trong lúc làm bài, hãy đánh dấu câu hỏi hoặc thêm ghi chú để chúng xuất hiện ở đây.</p>
            </div>`;
        return;
    }

    // 3. Lấy tiêu đề từng bộ đề (bỏ qua bộ đề đã bị xoá)
    const titles = {};
    await Promise.all(quizIds.map(async qid => {
        try {
            const snap = await getDoc(doc(db, 'quiz_sets', qid));
            titles[qid] = snap.exists() ? (snap.data().title || 'Bộ đề không tên') : null;
        } catch (e) {
            titles[qid] = 'Bộ đề không tên';
        }
    }));

    // 4. Render — mỗi bộ đề một thẻ riêng, bấm vào → trang lịch sử/chi tiết
    const badge = (icon, count, label, color, bg) =>
        `<span class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full" style="color:${color};background:${bg}">
            <i class="fas ${icon}"></i>${count} ${label}
        </span>`;

    const cards = quizIds
        .filter(qid => titles[qid] !== null)
        .sort((a, b) => titles[a].localeCompare(titles[b], 'vi'))
        .map(qid => {
            const s = stats.get(qid);
            const badges = [];
            if (s.marks > 0) badges.push(badge('fa-bookmark', s.marks, 'đánh dấu', '#b91c1c', '#fee2e2'));
            if (s.notes > 0) badges.push(badge('fa-sticky-note', s.notes, 'ghi chú', '#0369a1', '#e0f2fe'));
            if (s.annots > 0) badges.push(badge('fa-highlighter', s.annots, 'bôi vàng', '#a16207', '#fef9c3'));
            return `
                <a href="features/quiz/quiz-history.html?id=${encodeURIComponent(qid)}"
                    class="flex items-center gap-4 p-4 rounded-2xl border border-gray-100 hover:border-purple-200 hover:bg-purple-50/40 transition group">
                    <div class="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 text-purple-500 flex items-center justify-center">
                        <i class="fas fa-book-open"></i>
                    </div>
                    <div class="min-w-0 flex-1">
                        <p class="font-bold text-gray-800 truncate group-hover:text-purple-700">${titles[qid]}</p>
                        <div class="flex flex-wrap items-center gap-1.5 mt-1.5">${badges.join('')}</div>
                    </div>
                    <i class="fas fa-chevron-right text-gray-300 group-hover:text-purple-400 transition"></i>
                </a>`;
        }).join('');

    container.innerHTML = cards
        ? `<div class="space-y-3">${cards}</div>`
        : `<div class="text-center py-10 text-gray-400">
                <i class="fas fa-inbox text-3xl block mb-3 text-gray-300"></i>
                <p class="text-sm font-medium">Các bộ đề đã đánh dấu/ghi chú không còn tồn tại.</p>
           </div>`;
}

/**
 * Xử lý sự kiện nút bấm tính điểm GPA hệ 4 trên UI
 */
export function calculateGPA(opts) {
    const silent = !!(opts && opts.silent === true);
    const correctAnswersInput = document.getElementById('correct-answers');
    const totalQuestionsInput = document.getElementById('total-questions');
    const resultArea = document.getElementById('gpa-result-area');

    if (!correctAnswersInput || !totalQuestionsInput || !resultArea) return;

    const xRaw = correctAnswersInput.value.trim();
    const yRaw = totalQuestionsInput.value.trim();
    const x = parseInt(xRaw, 10);
    const y = parseInt(yRaw, 10);

    if (isNaN(x) || isNaN(y) || y <= 0 || x < 0 || x > y) {
        // Khi đang gõ (silent): không làm phiền bằng toast/viền đỏ; chỉ ẩn kết quả nếu còn thiếu dữ liệu.
        if (silent) {
            if (xRaw === '' || yRaw === '') resultArea.classList.add('hidden');
            return;
        }
        showToast('Vui lòng nhập số câu hợp lệ!', 'warning');
        correctAnswersInput.classList.add('border-red-400');
        totalQuestionsInput.classList.add('border-red-400');
        return;
    }
    correctAnswersInput.classList.remove('border-red-400');
    totalQuestionsInput.classList.remove('border-red-400');

    const score10 = score10FromCorrect(x, y);

    let score4, letterGrade, motivation, img, gradeBg, gradeColor, gradeBorder, gradeEmoji;
    const { score4: calc4, letterGrade: calcLetter } = calculateGPAFromPercent(score10 * 10);
    score4 = calc4;
    letterGrade = calcLetter;

    if (score10 >= 9.5) {
        img = 'assets/squirrel_A.png';
        motivation = "Ối dồi ôi, ối dồi ôi, trình là j mà là trình ai chấm!!! Anh chỉ biết làm ba mẹ anh tự hào, xây căn nhà thật to ở 1 mình 2 tấm";
        gradeBg = 'from-yellow-50 to-amber-50'; gradeColor = 'text-amber-500'; gradeBorder = 'border-amber-300'; gradeEmoji = '🏆';
    } else if (score10 >= 8.5) {
        img = 'assets/squirrel_A.png';
        motivation = "Dỏi dữ dị bà, trộm vía trộm víaaaaaa, xin vía 4.0 <3";
        gradeBg = 'from-yellow-50 to-orange-50'; gradeColor = 'text-orange-400'; gradeBorder = 'border-orange-300'; gradeEmoji = '🌟';
    } else if (score10 >= 8.0) {
        img = 'assets/squirrel_B.png';
        motivation = "gút chóp bây bề";
        gradeBg = 'from-green-50 to-emerald-50'; gradeColor = 'text-emerald-500'; gradeBorder = 'border-emerald-300'; gradeEmoji = '✨';
    } else if (score10 >= 7.0) {
        img = 'assets/squirrel_B.png';
        motivation = "Quaooooooo, vá là dỏi òiiiiii";
        gradeBg = 'from-green-50 to-teal-50'; gradeColor = 'text-teal-500'; gradeBorder = 'border-teal-300'; gradeEmoji = '💚';
    } else if (score10 >= 6.5) {
        img = 'assets/squirrel_C.png';
        motivation = "Điểm này là cũng cũng ròi á mom, u so gud babi";
        gradeBg = 'from-blue-50 to-sky-50'; gradeColor = 'text-sky-500'; gradeBorder = 'border-sky-300'; gradeEmoji = '💙';
    } else if (score10 >= 5.5) {
        img = 'assets/squirrel_C.png';
        motivation = "Cũn cũn ik, cố gắng lên nhennn";
        gradeBg = 'from-pink-50 to-rose-50'; gradeColor = 'text-rose-400'; gradeBorder = 'border-rose-300'; gradeEmoji = '🌸';
    } else if (score10 >= 5.0) {
        img = 'assets/squirrel_D.png';
        motivation = "Vừa đủ qua. Cần xem lại kiến thức một chút.";
        gradeBg = 'from-purple-50 to-violet-50'; gradeColor = 'text-violet-500'; gradeBorder = 'border-violet-300'; gradeEmoji = '🔮';
    } else if (score10 >= 4.0) {
        img = 'assets/squirrel_D.png';
        motivation = "Qua môn rồi! Chúc mừng nha bàaaaa";
        gradeBg = 'from-orange-50 to-yellow-50'; gradeColor = 'text-yellow-500'; gradeBorder = 'border-yellow-300'; gradeEmoji = '🌻';
    } else {
        img = 'assets/squirrel_F.png';
        motivation = "Hoi mò hoi mò, lần sau sẽ tốt hơn mà!";
        gradeBg = 'from-gray-50 to-slate-50'; gradeColor = 'text-gray-500'; gradeBorder = 'border-gray-300'; gradeEmoji = '🐿️';
    }

    const percentage = Math.round((x / y) * 100);

    // Gợi ý: còn bao nhiêu câu nữa là lên mức điểm hệ 4 kế tiếp
    const hint = nextGradeHint(x, y, score4);
    let hintHtml = '';
    if (hint) {
        hintHtml = `
            <div class="w-full mt-1 text-center text-sm font-semibold text-gray-700 bg-white/70 rounded-xl py-2.5 px-3 shadow-sm">
                <i class="fas fa-arrow-trend-up text-emerald-500 mr-1"></i>
                Cố thêm <b class="text-emerald-600">${hint.need}</b> câu nữa (đúng <b>${hint.atCorrect}/${y}</b>) là lên <b>${hint.letter}</b> · hệ 4 <b>${hint.score4.toFixed(1)}</b> 🎯
            </div>`;
    } else if (score4 >= 4.0) {
        hintHtml = `
            <div class="w-full mt-1 text-center text-sm font-semibold text-amber-600 bg-white/70 rounded-xl py-2.5 px-3 shadow-sm">
                🏆 Bạn đang ở mức điểm hệ 4 cao nhất (4.0) rồi!
            </div>`;
    }

    resultArea.className = `mt-6 p-6 rounded-2xl border-2 bg-gradient-to-br ${gradeBg} ${gradeBorder} transition-all duration-500`;
    resultArea.innerHTML = `
        <div class="flex flex-col items-center gap-4">
            <div class="relative">
                <img src="${img}" alt="Sóc con" class="w-32 h-32 object-contain drop-shadow-lg animate-bounce" style="animation-duration:2s">
                <span class="absolute -top-2 -right-2 text-3xl">${gradeEmoji}</span>
            </div>
            <p class="text-sm sm:text-base font-semibold text-gray-600 text-center italic px-4 leading-relaxed">"${motivation}"</p>
            <div class="flex justify-center gap-4 sm:gap-8 w-full mt-2">
                <div class="flex flex-col items-center bg-white/80 rounded-2xl shadow px-4 py-3 min-w-[72px]">
                    <span class="text-xs text-gray-500 font-medium mb-1">Hệ 10</span>
                    <span class="${gradeColor} text-3xl font-extrabold">${score10.toFixed(2)}</span>
                </div>
                <div class="flex flex-col items-center bg-white/80 rounded-2xl shadow px-4 py-3 min-w-[72px]">
                    <span class="text-xs text-gray-500 font-medium mb-1">Hệ 4</span>
                    <span class="${gradeColor} text-3xl font-extrabold">${score4.toFixed(1)}</span>
                </div>
                <div class="flex flex-col items-center bg-white/80 rounded-2xl shadow px-4 py-3 min-w-[72px]">
                    <span class="text-xs text-gray-500 font-medium mb-1">Điểm chữ</span>
                    <span class="${gradeColor} text-3xl font-extrabold">${letterGrade}</span>
                </div>
            </div>
            <div class="w-full mt-2">
                <div class="flex justify-between text-xs text-gray-500 mb-1 font-medium">
                    <span>Tỉ lệ đúng</span>
                    <span>${x}/${y} câu (${percentage}%)</span>
                </div>
                <div class="w-full h-4 bg-gray-200 rounded-full overflow-hidden shadow-inner">
                    <div class="h-full rounded-full transition-all duration-1000 ${gradeColor.replace('text-', 'bg-')}" style="width:${percentage}%"></div>
                </div>
            </div>
            ${hintHtml}
        </div>
    `;

    resultArea.classList.remove('hidden');
    setTimeout(() => resultArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
}

/**
 * Quy đổi điểm hệ 4 mong muốn -> điểm hệ 10 tối thiểu cần đạt.
 * Lấy đúng các ngưỡng trong bảng chuẩn calculateGPAFromPercent để không bị lệch.
 * @param {number} targetGpa4 Điểm hệ 4 mong muốn (1.0 - 4.0)
 * @returns {number} Điểm hệ 10 tối thiểu để đạt được GPA đó
 */
function minScore10ForGpa4(targetGpa4) {
    // Sắp xếp theo GPA tăng dần; ngưỡng hệ 10 là biên dưới của mỗi mức điểm chữ.
    const table = [
        { min10: 4.0, gpa: 1.0 }, // D
        { min10: 5.0, gpa: 1.5 }, // D+
        { min10: 5.5, gpa: 2.0 }, // C
        { min10: 6.5, gpa: 2.5 }, // C+
        { min10: 7.0, gpa: 3.0 }, // B
        { min10: 8.0, gpa: 3.5 }, // B+
        { min10: 8.5, gpa: 4.0 }, // A
    ];
    for (const row of table) {
        if (row.gpa >= targetGpa4 - 1e-9) return row.min10;
    }
    return 8.5;
}

/**
 * Tính số câu cần đúng ở các lần thi còn lại để đạt điểm hệ 4 mong muốn.
 *
 * Mô hình chuẩn hoá: mỗi lần thi có trọng số w_i (%) và hiệu suất p_i ∈ [0,1]
 * (lần thường: p = câu đúng / tổng câu; pretest: p = điểm hệ 10 / 10).
 * Điểm tổng kết (thang 0–100) = Σ p_i * w_i, với Σ w_i = 100.
 */
export function calculateRequiredCorrectAnswers() {
    const desiredGPAInput = document.getElementById('desired-gpa-4');
    const resultArea = document.getElementById('required-correct-result');
    if (!desiredGPAInput || !resultArea) return;

    const showError = (msg) => {
        resultArea.innerHTML = `
            <div class="rounded-2xl border border-red-200 bg-red-50 overflow-hidden shadow-sm">
                <div class="flex items-center gap-2.5 px-4 py-3 border-b border-red-200">
                    <span class="w-8 h-8 rounded-xl bg-red-100 text-red-600 flex items-center justify-center text-sm shrink-0"><i class="fas fa-circle-exclamation"></i></span>
                    <span class="font-extrabold text-red-700 text-sm">Chưa thể tính</span>
                </div>
                <div class="px-4 py-4 text-sm text-gray-700 leading-relaxed">${msg}</div>
            </div>`;
    };

    // 1. Thu thập dữ liệu từng lần thi từ bảng
    const rowEls = Array.from(document.querySelectorAll('#attempts-table .attempt-row'));
    if (rowEls.length === 0) { showError('Chưa có bảng các lần thi. Vui lòng chọn loại kỳ thi.'); return; }

    const attempts = [];
    let weightSum = 0;
    for (const el of rowEls) {
        const kind = el.dataset.kind;
        const label = el.dataset.label || 'Lần thi';
        const weight = parseFloat(el.querySelector('.attempt-weight')?.value);
        if (isNaN(weight) || weight < 0 || weight > 100) {
            showError(`Trọng số của "<b>${label}</b>" không hợp lệ (0–100%).`);
            return;
        }
        weightSum += weight;

        if (kind === 'score') {
            const raw = (el.querySelector('.attempt-score')?.value || '').trim();
            let p = null;
            if (raw !== '') {
                const s = parseFloat(raw);
                if (isNaN(s) || s < 0 || s > 10) {
                    showError(`Điểm pretest của "<b>${label}</b>" phải trong khoảng 0–10.`);
                    return;
                }
                p = s / 10;
            }
            attempts.push({ label, kind, weight, total: null, p });
        } else {
            const total = parseInt((el.querySelector('.attempt-total')?.value || '').trim(), 10);
            if (isNaN(total) || total <= 0) {
                showError(`Vui lòng nhập <b>tổng số câu</b> của "<b>${label}</b>".`);
                return;
            }
            const correctRaw = (el.querySelector('.attempt-correct')?.value || '').trim();
            let p = null;
            if (correctRaw !== '') {
                const c = parseInt(correctRaw, 10);
                if (isNaN(c) || c < 0 || c > total) {
                    showError(`Số câu đúng của "<b>${label}</b>" phải trong khoảng 0–${total}.`);
                    return;
                }
                p = c / total;
            }
            attempts.push({ label, kind, weight, total, p });
        }
    }

    if (Math.round(weightSum) !== 100) {
        showError(`Tổng trọng số các lần thi phải bằng <b>100%</b> (hiện tại đang là ${Math.round(weightSum * 100) / 100}%).`);
        return;
    }

    const desiredGPA = parseFloat(desiredGPAInput.value);
    if (isNaN(desiredGPA) || desiredGPA <= 0 || desiredGPA > 4) {
        showError('Vui lòng chọn điểm hệ 4 mong muốn hợp lệ.');
        return;
    }

    // 2. Mục tiêu (thang 0–100, = điểm hệ 10 × 10)
    const targetScore10 = minScore10ForGpa4(desiredGPA);
    const targetPct = targetScore10 * 10;

    const knownPct = attempts.filter(a => a.p !== null).reduce((s, a) => s + a.p * a.weight, 0);
    const unknown = attempts.filter(a => a.p === null);
    const neededPct = targetPct - knownPct;

    // Bộ khung hiển thị kết quả: header trạng thái + nội dung + chân nhắc mục tiêu (đồng nhất mọi nhánh)
    const TONES = {
        success: { bg: 'bg-emerald-50', border: 'border-emerald-200', head: 'text-emerald-700', iconBg: 'bg-emerald-100 text-emerald-600' },
        info:    { bg: 'bg-pink-50',    border: 'border-pink-200',    head: 'text-pink-700',    iconBg: 'bg-pink-100 text-pink-600' },
        warn:    { bg: 'bg-amber-50',   border: 'border-amber-200',   head: 'text-amber-700',   iconBg: 'bg-amber-100 text-amber-600' },
        danger:  { bg: 'bg-red-50',     border: 'border-red-200',     head: 'text-red-700',     iconBg: 'bg-red-100 text-red-600' },
    };
    const render = ({ tone, icon, title, body }) => {
        const t = TONES[tone];
        resultArea.innerHTML = `
            <div class="rounded-2xl border ${t.border} ${t.bg} overflow-hidden shadow-sm">
                <div class="flex items-center gap-2.5 px-4 py-3 border-b ${t.border}">
                    <span class="w-8 h-8 rounded-xl ${t.iconBg} flex items-center justify-center text-sm shrink-0"><i class="fas ${icon}"></i></span>
                    <span class="font-extrabold ${t.head} text-sm">${title}</span>
                </div>
                <div class="px-4 py-4 text-sm text-gray-700 leading-relaxed">${body}</div>
                <div class="flex items-center gap-1.5 px-4 py-2.5 bg-white/60 border-t ${t.border} text-xs text-gray-500">
                    <i class="fas fa-bullseye text-pink-400"></i>
                    <span>Mục tiêu <b class="text-gray-700">GPA ${desiredGPA.toFixed(1)}</b> · điểm tổng kết cần <b class="text-gray-700">≥ ${targetScore10.toFixed(1)}</b> (hệ 10)</span>
                </div>
            </div>`;
    };
    // Khối "số to" cho con số cần đạt
    const heroNumber = (big, unit, badge) => `
        <div class="flex items-end gap-2">
            <span class="text-4xl font-extrabold text-pink-500 leading-none">${big}</span>
            <span class="text-base font-bold text-gray-400 mb-0.5">${unit}</span>
            ${badge ? `<span class="ml-auto text-sm font-bold text-pink-600 bg-pink-100 rounded-full px-2.5 py-1">${badge}</span>` : ''}
        </div>`;
    // Ba ô điểm hệ 10 / hệ 4 / điểm chữ
    const statChips = (s10, s4, letter, tone) => {
        const t = TONES[tone];
        const chip = (lbl, val) => `<div class="px-3 py-1.5 rounded-xl bg-white/70 border ${t.border} text-center"><span class="text-[10px] text-gray-400 font-semibold block">${lbl}</span><b class="text-base text-gray-800">${val}</b></div>`;
        return `<div class="flex flex-wrap gap-2">${chip('HỆ 10', s10)}${chip('HỆ 4', s4)}${chip('ĐIỂM CHỮ', letter)}</div>`;
    };

    // 3a. Đã nhập đủ tất cả -> báo kết quả tổng kết
    if (unknown.length === 0) {
        const finalScore10 = knownPct / 10;
        const { score4, letterGrade } = calculateGPAFromPercent(knownPct);
        const reached = knownPct >= targetPct - 1e-9;

        if (reached) {
            render({
                tone: 'success', icon: 'fa-trophy', title: 'Đã đạt mục tiêu! 🎉',
                body: `${statChips(finalScore10.toFixed(2), score4.toFixed(1), letterGrade, 'success')}
                       <p class="mt-3 font-semibold text-emerald-600">Kết quả hiện tại đã đủ để đạt mục tiêu. Tuyệt vời! 🐿️</p>`
            });
            return;
        }

        // Chưa đạt: lấy lần thi có trọng số lớn nhất làm "đòn bẩy", gợi ý số câu cần đúng ở lần đó
        // (giữ nguyên kết quả các lần khác) để biết cụ thể cần làm bao nhiêu câu mới chạm mục tiêu.
        const ratioAttempts = attempts.filter(a => a.kind === 'ratio');
        const pool = ratioAttempts.length ? ratioAttempts : attempts;
        const lever = pool.reduce((best, a) => (a.weight > best.weight ? a : best), pool[0]);
        const otherPct = knownPct - lever.p * lever.weight;            // điểm các lần khác (giữ nguyên)
        const neededFromLever = targetPct - otherPct;                  // phần cần bù từ lần đòn bẩy
        const neededP = lever.weight > 0 ? neededFromLever / lever.weight : Infinity;
        const chips = statChips(finalScore10.toFixed(2), score4.toFixed(1), letterGrade, 'warn');

        if (lever.kind === 'score') {
            const needScore = Math.ceil(neededP * 10 * 100) / 100;
            const cur = lever.p * 10;
            if (needScore > 10) {
                render({ tone: 'danger', icon: 'fa-circle-xmark', title: 'Ngoài tầm với 😢',
                    body: `${chips}<p class="mt-3 text-gray-600">Dù đạt <b>10/10</b> điểm ở lần "<b>${lever.label}</b>", điểm tổng kết vẫn chưa chạm mục tiêu.</p>` });
            } else {
                render({ tone: 'info', icon: 'fa-bullseye', title: 'Để đạt mục tiêu cần',
                    body: `${chips}<div class="mt-3">${heroNumber(needScore.toFixed(2), '/ 10 điểm', null)}</div>
                           <p class="mt-2 text-gray-500">Ở lần <b class="text-gray-700">${lever.label}</b> cần đạt bấy nhiêu điểm (đang ${cur.toFixed(2)}/10), giữ nguyên các lần khác.</p>` });
            }
            return;
        }

        const needCorrect = Math.ceil(neededP * lever.total - 1e-9);
        const cur = Math.round(lever.p * lever.total);
        if (needCorrect > lever.total) {
            render({ tone: 'danger', icon: 'fa-circle-xmark', title: 'Ngoài tầm với 😢',
                body: `${chips}<p class="mt-3 text-gray-600">Dù đúng cả <b>${lever.total}/${lever.total}</b> câu ở lần "<b>${lever.label}</b>", điểm tổng kết vẫn chưa chạm mục tiêu.</p>` });
            return;
        }
        const acc = Math.round((needCorrect / lever.total) * 100);
        render({ tone: 'info', icon: 'fa-bullseye', title: 'Để đạt mục tiêu cần',
            body: `${chips}
                   <div class="mt-3">${heroNumber(needCorrect, `/ ${lever.total} câu`, '≈ ' + acc + '%')}</div>
                   <p class="mt-2 text-gray-500">Số câu đúng tối thiểu ở lần <b class="text-gray-700">${lever.label}</b> (đang ${cur}/${lever.total}), giữ nguyên các lần khác.</p>
                   <div class="mt-3 w-full h-2 bg-white rounded-full overflow-hidden shadow-inner"><div class="h-full bg-pink-400 rounded-full transition-all duration-500" style="width:${acc}%"></div></div>` });
        return;
    }

    // 3b. Đã chắc chắn đạt dù các lần còn lại được 0 điểm
    if (neededPct <= 1e-9) {
        render({
            tone: 'success', icon: 'fa-circle-check', title: 'Chắc suất đạt mục tiêu! 🎉',
            body: `Kết quả các lần đã thi đã đủ để đạt <b>GPA ${desiredGPA.toFixed(1)}</b> — kể cả khi các lần còn lại được 0 điểm. Quá đỉnh! 🐿️`
        });
        return;
    }

    // 3c. Còn đúng 1 lần chưa nhập -> giải chính xác
    if (unknown.length === 1) {
        const a = unknown[0];
        if (a.weight <= 0) {
            render({ tone: 'warn', icon: 'fa-triangle-exclamation', title: 'Không thể bù điểm',
                body: `Lần "<b>${a.label}</b>" có trọng số <b>0%</b> nên không ảnh hưởng tới điểm tổng kết.` });
            return;
        }
        const neededP = neededPct / a.weight; // hiệu suất cần ở lần này

        if (a.kind === 'score') {
            const needScore = Math.ceil(neededP * 10 * 100) / 100; // điểm hệ 10, làm tròn lên 2 số lẻ
            if (needScore > 10) {
                const maxScore10 = (knownPct + a.weight) / 10;
                render({ tone: 'danger', icon: 'fa-circle-xmark', title: 'Ngoài tầm với 😢',
                    body: `Dù đạt <b>10/10</b> điểm ở lần "<b>${a.label}</b>", điểm tổng kết tối đa chỉ đạt <b>${maxScore10.toFixed(2)}</b> (hệ 10).` });
            } else {
                render({ tone: 'info', icon: 'fa-bullseye', title: 'Điểm cần đạt',
                    body: `${heroNumber(needScore.toFixed(2), '/ 10 điểm', null)}
                           <p class="mt-2 text-gray-500">Điểm hệ 10 tối thiểu ở lần <b class="text-gray-700">${a.label}</b> để đạt mục tiêu.</p>` });
            }
            return;
        }

        let needCorrect = Math.ceil(neededP * a.total - 1e-9);
        if (needCorrect < 0) needCorrect = 0;
        if (needCorrect > a.total) {
            const maxScore10 = (knownPct + a.weight) / 10;
            render({ tone: 'danger', icon: 'fa-circle-xmark', title: 'Ngoài tầm với 😢',
                body: `Dù đúng cả <b>${a.total}/${a.total}</b> câu ở lần "<b>${a.label}</b>", điểm tổng kết tối đa chỉ đạt <b>${maxScore10.toFixed(2)}</b> (hệ 10).` });
            return;
        }
        const acc = Math.round((needCorrect / a.total) * 100);
        render({ tone: 'info', icon: 'fa-bullseye', title: 'Số câu cần đạt',
            body: `${heroNumber(needCorrect, `/ ${a.total} câu`, '≈ ' + acc + '%')}
                   <p class="mt-2 text-gray-500">Số câu đúng tối thiểu ở lần <b class="text-gray-700">${a.label}</b> để đạt mục tiêu.</p>
                   <div class="mt-3 w-full h-2 bg-white rounded-full overflow-hidden shadow-inner"><div class="h-full bg-pink-400 rounded-full transition-all duration-500" style="width:${acc}%"></div></div>` });
        return;
    }

    // 3d. Còn nhiều lần chưa nhập -> gợi ý theo mức "đúng đều" giữa các lần
    const unknownWeight = unknown.reduce((s, a) => s + a.weight, 0);
    if (unknownWeight <= 0) {
        render({ tone: 'warn', icon: 'fa-triangle-exclamation', title: 'Không thể bù điểm',
            body: 'Các lần còn lại có tổng trọng số <b>0%</b> nên không ảnh hưởng tới điểm tổng kết.' });
        return;
    }
    const reqRatio = neededPct / unknownWeight; // hiệu suất đồng đều cần ở các lần còn lại

    if (reqRatio > 1 + 1e-9) {
        const maxScore10 = (knownPct + unknownWeight) / 10;
        render({ tone: 'danger', icon: 'fa-circle-xmark', title: 'Ngoài tầm với 😢',
            body: `Dù đạt điểm tuyệt đối ở tất cả các lần còn lại, điểm tổng kết tối đa chỉ đạt <b>${maxScore10.toFixed(2)}</b> (hệ 10).` });
        return;
    }

    const accPct = Math.ceil(reqRatio * 100);
    const rows = unknown.map(a => {
        let val;
        if (a.kind === 'score') {
            val = Math.min(10, Math.ceil(reqRatio * 10 * 100) / 100).toFixed(2) + ' điểm';
        } else {
            const needCorrect = Math.min(a.total, Math.max(0, Math.ceil(reqRatio * a.total - 1e-9)));
            val = `${needCorrect}/${a.total} câu`;
        }
        return `<div class="flex items-center justify-between bg-white/70 rounded-xl px-3 py-2 border border-pink-200">
            <span class="font-semibold text-gray-700"><i class="fas fa-circle-dot text-pink-300 mr-1.5 text-[10px]"></i>${a.label}</span>
            <span class="font-bold text-pink-600">${val}</span>
        </div>`;
    }).join('');

    render({ tone: 'info', icon: 'fa-lightbulb', title: `Gợi ý cho ${unknown.length} lần còn lại`,
        body: `<div class="inline-flex items-center gap-1.5 text-pink-600 bg-pink-100 rounded-full px-3 py-1 text-xs font-bold mb-3"><i class="fas fa-wave-square"></i> Giữ phong độ đúng đều ≈ ${accPct}% mỗi lần</div>
               <div class="space-y-1.5">${rows}</div>
               <p class="text-xs text-gray-400 mt-3">💡 Phương án cân bằng — lần này làm tốt hơn thì lần sau có thể nhẹ nhàng hơn.</p>` });
}

/**
 * Trả về cấu hình các lần thi (nhãn, kiểu nhập, trọng số) theo loại kỳ thi.
 * kind: 'ratio' = nhập câu đúng / tổng câu; 'score' = nhập thẳng điểm hệ 10 (pretest).
 */
function getExamConfig(type, numAttempts) {
    if (type === 'pretest') {
        return [
            { label: 'Pretest', kind: 'score', weight: 10 },
            { label: 'Giữa kỳ', kind: 'ratio', weight: 20 },
            { label: 'Cuối kỳ', kind: 'ratio', weight: 70 },
        ];
    }
    if (type === 'nopretest') {
        return [
            { label: 'Giữa kỳ', kind: 'ratio', weight: 30 },
            { label: 'Cuối kỳ', kind: 'ratio', weight: 70 },
        ];
    }
    // Tùy chỉnh: chia đều trọng số, phần dư dồn vào lần cuối
    const n = Math.max(1, numAttempts || 2);
    const base = Math.floor(100 / n);
    const rows = [];
    for (let i = 0; i < n; i++) {
        const label = i === n - 1 ? 'Cuối kỳ' : (i === 0 ? 'Giữa kỳ' : `Lần ${i + 1}`);
        const weight = i === n - 1 ? 100 - base * (n - 1) : base;
        rows.push({ label, kind: 'ratio', weight });
    }
    return rows;
}

// Icon gợi nhớ cho từng loại bài thi
const ATTEMPT_ICONS = { 'Pretest': 'fa-vial', 'Giữa kỳ': 'fa-pen-fancy', 'Cuối kỳ': 'fa-flag-checkered' };

/**
 * Render các thẻ "lần thi" (dạng card, thân thiện mobile) trong công cụ tính điểm GPA.
 * Mỗi thẻ có thanh trượt (slider) để chọn nhanh số câu đúng / điểm, cập nhật điểm tổng kết tức thì.
 */
export function renderAttemptsTable() {
    const examTypeEl = document.getElementById('exam-type');
    const customRow = document.getElementById('custom-attempts-row');
    const tableContainer = document.getElementById('attempts-table');

    if (!examTypeEl || !tableContainer) return;

    const examType = examTypeEl.value;
    const numAttemptsEl = document.getElementById('num-attempts');
    const isCustom = examType === 'custom';
    if (customRow) customRow.style.display = isCustom ? '' : 'none';

    const numAttempts = isCustom ? parseInt(numAttemptsEl.value, 10) : undefined;
    const rows = getExamConfig(examType, numAttempts);

    const cardsHtml = rows.map(row => {
        const icon = ATTEMPT_ICONS[row.label] || 'fa-layer-group';
        const weightControl = isCustom
            ? `<input type="number" class="attempt-weight w-14 px-1.5 py-1 border border-pink-200 rounded-lg text-center text-sm font-bold text-pink-600 focus:outline-none focus:ring-2 focus:ring-pink-200" min="0" max="100" value="${row.weight}">`
            : `<span class="text-sm font-extrabold text-pink-600">${row.weight}%</span><input type="hidden" class="attempt-weight" value="${row.weight}">`;

        const header = `
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                    <span class="w-7 h-7 rounded-lg bg-gradient-to-br from-pink-100 to-rose-100 text-pink-500 flex items-center justify-center text-xs"><i class="fas ${icon}"></i></span>
                    <span class="font-bold text-gray-800 text-sm">${row.label}</span>
                </div>
                <div class="flex items-center gap-1.5"><span class="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Trọng số</span>${weightControl}</div>
            </div>`;

        if (row.kind === 'score') {
            return `
            <div class="attempt-row bg-white border border-pink-100 rounded-2xl p-3.5 shadow-sm transition hover:shadow-md" data-kind="score" data-label="${row.label}">
                ${header}
                <div class="flex items-center gap-3">
                    <input type="number" class="attempt-score w-24 px-3 py-2 border border-pink-200 rounded-xl text-center font-semibold focus:outline-none focus:ring-2 focus:ring-pink-200" min="0" max="10" step="0.01" placeholder="… /10">
                    <input type="range" class="attempt-slider flex-1 accent-pink-500 cursor-pointer" min="0" max="10" step="0.1" value="0">
                </div>
                <p class="text-[11px] text-gray-400 mt-1.5"><i class="fas fa-circle-info mr-1"></i>Nhập thẳng điểm hệ 10 của bài pretest, hoặc kéo thanh trượt.</p>
            </div>`;
        }
        return `
        <div class="attempt-row bg-white border border-pink-100 rounded-2xl p-3.5 shadow-sm transition hover:shadow-md" data-kind="ratio" data-label="${row.label}">
            ${header}
            <div class="flex items-end gap-2 mb-3">
                <div class="flex-1">
                    <label class="block text-[11px] font-semibold text-gray-500 mb-1">Câu đúng</label>
                    <input type="number" class="attempt-correct w-full px-3 py-2 border border-pink-200 rounded-xl text-center font-semibold focus:outline-none focus:ring-2 focus:ring-pink-200" min="0" placeholder="—">
                </div>
                <span class="text-gray-300 font-bold pb-2">/</span>
                <div class="flex-1">
                    <label class="block text-[11px] font-semibold text-gray-500 mb-1">Tổng câu</label>
                    <input type="number" class="attempt-total w-full px-3 py-2 border border-pink-200 rounded-xl text-center font-semibold focus:outline-none focus:ring-2 focus:ring-pink-200" min="1" placeholder="—">
                </div>
            </div>
            <input type="range" class="attempt-slider w-full accent-pink-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50" min="0" max="100" step="1" value="0" disabled>
            <p class="attempt-hint text-[11px] text-gray-400 mt-1.5"><i class="fas fa-circle-info mr-1"></i>Nhập tổng câu để kéo thanh chọn nhanh số câu đúng.</p>
        </div>`;
    }).join('');

    const totalWeight = rows.reduce((a, r) => a + r.weight, 0);
    tableContainer.innerHTML = `
        <div class="space-y-3">${cardsHtml}</div>
        <div id="attempts-weight-note" class="text-xs ${totalWeight === 100 ? 'text-gray-400' : 'text-red-500'} mt-2.5 text-right">Tổng trọng số: <b id="attempts-weight-sum">${totalWeight}</b>%</div>`;

    wireAttemptInputs(isCustom);
    updateGpaProjection();
}

/**
 * Gắn sự kiện đồng bộ ô nhập ↔ thanh trượt và cập nhật điểm tổng kết tạm tính theo thời gian thực.
 */
function wireAttemptInputs(isCustom) {
    const container = document.getElementById('attempts-table');
    if (!container) return;
    const rows = Array.from(container.querySelectorAll('.attempt-row'));

    rows.forEach(row => {
        const slider = row.querySelector('.attempt-slider');
        if (row.dataset.kind === 'score') {
            const score = row.querySelector('.attempt-score');
            score?.addEventListener('input', () => {
                const v = parseFloat(score.value);
                if (slider && !isNaN(v)) slider.value = Math.max(0, Math.min(10, v));
                updateGpaProjection();
            });
            slider?.addEventListener('input', () => {
                if (score) score.value = slider.value;
                updateGpaProjection();
            });
        } else {
            const correct = row.querySelector('.attempt-correct');
            const total = row.querySelector('.attempt-total');
            const hint = row.querySelector('.attempt-hint');
            const syncRange = () => {
                const t = parseInt(total.value, 10);
                if (!slider) return;
                if (!isNaN(t) && t > 0) {
                    slider.max = t;
                    slider.disabled = false;
                    if (hint) hint.classList.add('hidden');
                } else {
                    slider.disabled = true;
                    slider.value = 0;
                    if (hint) hint.classList.remove('hidden');
                }
            };
            const clampCorrect = () => {
                const t = parseInt(total.value, 10);
                let c = parseInt(correct.value, 10);
                if (!isNaN(t) && !isNaN(c) && c > t) { correct.value = t; c = t; }
                if (slider && correct.value !== '') slider.value = correct.value;
            };
            total?.addEventListener('input', () => { syncRange(); clampCorrect(); updateGpaProjection(); });
            correct?.addEventListener('input', () => { clampCorrect(); updateGpaProjection(); });
            slider?.addEventListener('input', () => {
                if (correct) correct.value = slider.value;
                updateGpaProjection();
            });
            syncRange();
        }
    });

    // Chế độ tùy chỉnh: cập nhật tổng trọng số + điểm tạm tính khi chỉnh trọng số
    if (isCustom) {
        const weightInputs = Array.from(container.querySelectorAll('.attempt-weight'));
        const note = document.getElementById('attempts-weight-note');
        const sumEl = document.getElementById('attempts-weight-sum');
        const updateSum = () => {
            const sum = weightInputs.reduce((a, el) => a + (parseFloat(el.value) || 0), 0);
            if (sumEl) sumEl.textContent = Math.round(sum * 100) / 100;
            if (note) {
                note.classList.toggle('text-red-500', Math.round(sum) !== 100);
                note.classList.toggle('text-gray-400', Math.round(sum) === 100);
            }
            updateGpaProjection();
        };
        weightInputs.forEach(el => el.addEventListener('input', updateSum));
    }
}

/**
 * Cập nhật bảng "Điểm tổng kết tạm tính" theo thời gian thực khi người dùng nhập / kéo thanh trượt.
 * Các lần chưa nhập được tạm tính = 0 điểm; có thanh tiến độ và mốc mục tiêu để dễ hình dung.
 */
function updateGpaProjection() {
    const panel = document.getElementById('gpa-live-projection');
    if (!panel) return;
    const rows = Array.from(document.querySelectorAll('#attempts-table .attempt-row'));
    if (rows.length === 0) { panel.classList.add('hidden'); return; }

    let totalPct = 0, blanks = 0, anyEntered = false;
    for (const el of rows) {
        const weight = parseFloat(el.querySelector('.attempt-weight')?.value) || 0;
        let p = null;
        if (el.dataset.kind === 'score') {
            const raw = (el.querySelector('.attempt-score')?.value || '').trim();
            if (raw !== '') { const s = parseFloat(raw); if (!isNaN(s)) p = Math.max(0, Math.min(10, s)) / 10; }
        } else {
            const total = parseInt(el.querySelector('.attempt-total')?.value, 10);
            const raw = (el.querySelector('.attempt-correct')?.value || '').trim();
            if (!isNaN(total) && total > 0 && raw !== '') {
                const c = parseInt(raw, 10);
                if (!isNaN(c)) p = Math.max(0, Math.min(total, c)) / total;
            }
        }
        if (p === null) blanks++; else { anyEntered = true; totalPct += p * weight; }
    }

    if (!anyEntered) { panel.classList.add('hidden'); return; }

    const score10 = totalPct / 10;
    const { score4, letterGrade } = calculateGPAFromPercent(totalPct);
    const desired = parseFloat(document.getElementById('desired-gpa-4')?.value) || 0;
    const targetScore10 = minScore10ForGpa4(desired);
    const reached = score10 >= targetScore10 - 1e-9;
    const fillPct = Math.max(0, Math.min(100, score10 * 10));
    const targetPct = Math.max(0, Math.min(100, targetScore10 * 10));
    const accent = reached ? 'text-emerald-600' : 'text-pink-500';

    const blankNote = blanks > 0
        ? `<span class="text-[11px] text-gray-400">${blanks} lần chưa nhập = 0đ</span>`
        : '';

    panel.className = 'mt-1 mb-5 p-4 rounded-2xl border ' + (reached ? 'bg-emerald-50 border-emerald-200' : 'bg-pink-50/70 border-pink-200');
    panel.innerHTML = `
        <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><i class="fas fa-gauge-high text-pink-400"></i> Điểm tổng kết tạm tính</span>
            ${blankNote}
        </div>
        <div class="flex items-end gap-4 mb-3 flex-wrap">
            <div class="flex flex-col"><span class="text-[10px] text-gray-400 font-semibold">HỆ 10</span><span class="text-2xl font-extrabold ${accent}">${score10.toFixed(2)}</span></div>
            <div class="flex flex-col"><span class="text-[10px] text-gray-400 font-semibold">HỆ 4</span><span class="text-2xl font-extrabold ${accent}">${score4.toFixed(1)}</span></div>
            <div class="flex flex-col"><span class="text-[10px] text-gray-400 font-semibold">ĐIỂM CHỮ</span><span class="text-2xl font-extrabold ${accent}">${letterGrade}</span></div>
            <div class="ml-auto text-right"><span class="text-[10px] text-gray-400 font-semibold block">MỤC TIÊU</span><span class="text-sm font-bold ${reached ? 'text-emerald-600' : 'text-amber-600'}">${reached ? 'Đã đạt 🎉' : 'GPA ' + desired.toFixed(1)}</span></div>
        </div>
        <div class="relative w-full h-3 bg-white rounded-full overflow-hidden shadow-inner">
            <div class="h-full rounded-full transition-all duration-300 ${reached ? 'bg-emerald-400' : 'bg-pink-400'}" style="width:${fillPct}%"></div>
            <div class="absolute top-0 bottom-0 w-0.5 bg-amber-500" style="left:${targetPct}%"></div>
        </div>
        <div class="flex justify-between text-[10px] text-gray-400 mt-1">
            <span>0</span>
            <span class="text-amber-500 font-semibold">▲ mốc cần đạt ${targetScore10.toFixed(1)}</span>
            <span>10</span>
        </div>`;
    panel.classList.remove('hidden');
}

/**
 * Khởi tạo và thiết lập các Event Listeners cho GPA Calculator
 */
export function initGpaCalculator() {
    const calculateGpaBtn = document.getElementById('calculate-gpa-btn');
    if (calculateGpaBtn && !calculateGpaBtn.dataset.listenerAdded) {
        calculateGpaBtn.addEventListener('click', () => calculateGPA());
        calculateGpaBtn.dataset.listenerAdded = 'true';
    }

    // Card "Quy đổi điểm nhanh": tự quy đổi khi gõ + Enter ở "Số câu đúng" nhảy xuống "Tổng số câu"
    const correctEl = document.getElementById('correct-answers');
    const totalEl = document.getElementById('total-questions');
    if (correctEl && totalEl && !correctEl.dataset.autoAdded) {
        let debounce;
        const autoCalc = () => {
            clearTimeout(debounce);
            debounce = setTimeout(() => calculateGPA({ silent: true }), 250);
        };
        correctEl.addEventListener('input', autoCalc);
        totalEl.addEventListener('input', autoCalc);
        correctEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); totalEl.focus(); totalEl.select(); }
        });
        totalEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); calculateGPA(); totalEl.blur(); }
        });
        correctEl.dataset.autoAdded = 'true';
    }

    const desiredGpaEl = document.getElementById('desired-gpa-4');
    if (desiredGpaEl && !desiredGpaEl.dataset.listenerAdded) {
        desiredGpaEl.addEventListener('change', updateGpaProjection);
        desiredGpaEl.dataset.listenerAdded = 'true';
    }

    const examTypeEl = document.getElementById('exam-type');
    if (examTypeEl && !examTypeEl.dataset.listenerAdded) {
        examTypeEl.addEventListener('change', renderAttemptsTable);
        examTypeEl.dataset.listenerAdded = 'true';
    }

    const numAttemptsEl = document.getElementById('num-attempts');
    if (numAttemptsEl && !numAttemptsEl.dataset.listenerAdded) {
        numAttemptsEl.addEventListener('change', renderAttemptsTable);
        numAttemptsEl.dataset.listenerAdded = 'true';
    }

    const calcRequiredBtn = document.getElementById('calculate-required-btn');
    if (calcRequiredBtn && !calcRequiredBtn.dataset.listenerAdded) {
        calcRequiredBtn.addEventListener('click', calculateRequiredCorrectAnswers);
        calcRequiredBtn.dataset.listenerAdded = 'true';
    }

    renderAttemptsTable();
}

