// File: features/profile/stats-service.js
// Module chịu trách nhiệm tính toán thống kê GPA, vẽ biểu đồ Chart.js và quản lý lịch sử làm bài của người dùng

import { auth, db } from '../../core/firebase-init.js';
import { collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { showToast } from '../../core/utils.js';
import { achievements } from '../../core/achievements.js';

let progressChartInstance = null;
let distributionChartInstance = null;

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

function formatDuration(seconds) {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
}

/**
 * Tải và hiển thị toàn bộ trang thống kê học lực của người dùng
 */
export async function loadAndDisplayStats() {
    const user = auth.currentUser;
    const achievementsContainer = document.getElementById('achievements-container');
    const statsContainer = document.getElementById('stats-container');
    const progressChartCanvas = document.getElementById('progressChart');
    const distributionChartCanvas = document.getElementById('distributionChart');
    
    // Reset các thẻ Stats Cards
    const totalAttemptsEl = document.getElementById('stat-total-attempts');
    const avgScore10El = document.getElementById('stat-avg-score10');
    const avgGpaEl = document.getElementById('stat-avg-gpa');
    const passRateEl = document.getElementById('stat-pass-rate');

    if (totalAttemptsEl) totalAttemptsEl.textContent = '0';
    if (avgScore10El) avgScore10El.textContent = '0.0';
    if (avgGpaEl) avgGpaEl.textContent = '0.0';
    if (passRateEl) passRateEl.textContent = '0%';

    // Reset giao diện thành tựu và lịch sử
    if (achievementsContainer) achievementsContainer.innerHTML = '';
    if (statsContainer) statsContainer.innerHTML = '';

    if (!user) {
        if (achievementsContainer) achievementsContainer.innerHTML = '<p class="text-gray-500 col-span-full text-center py-6">Vui lòng đăng nhập để xem thành tựu.</p>';
        if (statsContainer) statsContainer.innerHTML = '<p class="text-gray-500 py-8 text-center w-full col-span-full">Vui lòng đăng nhập để xem lịch sử.</p>';
        if (progressChartInstance) {
            progressChartInstance.destroy();
            progressChartInstance = null;
        }
        if (distributionChartInstance) {
            distributionChartInstance.destroy();
            distributionChartInstance = null;
        }
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
        
        // 2. Tải và hiển thị lịch sử làm bài
        const resultsQuery = query(collection(db, "quiz_results"), where("userId", "==", user.uid), orderBy("completedAt", "asc"));
        const resultsSnapshot = await getDocs(resultsQuery);
        const results = resultsSnapshot.docs.map(docSnap => docSnap.data());

        if (results.length === 0) {
            if (statsContainer) statsContainer.innerHTML = '<p class="text-gray-500 py-8 text-center w-full col-span-full">Bạn chưa hoàn thành bài test nào.</p>';
            if (progressChartInstance) {
                progressChartInstance.destroy();
                progressChartInstance = null;
            }
            if (distributionChartInstance) {
                distributionChartInstance.destroy();
                distributionChartInstance = null;
            }
        } else {
            // Tính toán số liệu thống kê
            const totalAttempts = results.length;
            let totalPercentage = 0;
            let totalGPA = 0;
            let passAttempts = 0;
            const gradesCount = { 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0 };

            const sortedResultsForList = [...results].reverse();

            results.forEach(result => {
                totalPercentage += result.percentage;
                
                const { score4, letterGrade } = calculateGPAFromPercent(result.percentage);
                totalGPA += score4;
                
                if (result.percentage >= 40) passAttempts++;
                
                if (letterGrade.startsWith('A')) gradesCount['A']++;
                else if (letterGrade.startsWith('B')) gradesCount['B']++;
                else if (letterGrade.startsWith('C')) gradesCount['C']++;
                else if (letterGrade.startsWith('D')) gradesCount['D']++;
                else gradesCount['F']++;
            });

            // Vẽ danh sách lịch sử
            if (statsContainer) {
                sortedResultsForList.forEach(result => {
                    const resultEl = document.createElement('div');
                    const isPassed = result.percentage >= 40;
                    const timeStr = formatDuration(result.timeTaken);
                    
                    resultEl.className = 'px-6 py-4 hover:bg-pink-50/20 transition-all flex flex-col sm:flex-row justify-between sm:items-center gap-4';
                    resultEl.innerHTML = `
                        <div class="flex items-center gap-3">
                            <div class="p-2.5 rounded-full ${isPassed ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}">
                                <i class="fas ${isPassed ? 'fa-check' : 'fa-exclamation'} text-sm w-4 text-center"></i>
                            </div>
                            <div>
                                <p class="font-semibold text-gray-800 text-base">${result.quizTitle}</p>
                                <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400 mt-0.5">
                                    <span><i class="far fa-calendar-alt mr-1"></i>${new Date(result.completedAt.toDate()).toLocaleString()}</span>
                                    <span><i class="far fa-clock mr-1"></i>Thời gian: ${timeStr}</span>
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center justify-between sm:justify-end gap-4">
                            <span class="px-2.5 py-1 rounded-full text-xs font-bold ${isPassed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                                ${isPassed ? 'Qua môn' : 'Thi lại'}
                            </span>
                            <div class="text-right">
                                <p class="font-extrabold text-xl text-[#FF69B4]">${result.percentage}%</p>
                                <p class="text-xs text-gray-500 font-medium">${result.score}/${result.totalQuestions} câu</p>
                            </div>
                        </div>
                    `;
                    statsContainer.appendChild(resultEl);
                });
            }

            // Gán dữ liệu Stats Cards vào DOM
            const avgPercentage = totalPercentage / totalAttempts;
            const avgScore10 = (avgPercentage / 10).toFixed(1);
            const avgGPA = (totalGPA / totalAttempts).toFixed(2);
            const passRate = Math.round((passAttempts / totalAttempts) * 100);

            if (totalAttemptsEl) totalAttemptsEl.textContent = totalAttempts;
            if (avgScore10El) avgScore10El.textContent = avgScore10;
            if (avgGpaEl) avgGpaEl.textContent = avgGPA;
            if (passRateEl) passRateEl.textContent = passRate + '%';

            // 3. Vẽ biểu đồ tiến độ Progress Chart (Line)
            if (progressChartCanvas && typeof Chart !== 'undefined') {
                const chartLabels = results.map((r, index) => `Lần ${index + 1}`);
                const chartData = results.map(r => r.percentage);
                
                if (progressChartInstance) {
                    progressChartInstance.destroy();
                }
                
                progressChartInstance = new Chart(progressChartCanvas, {
                    type: 'line',
                    data: {
                        labels: chartLabels,
                        datasets: [{
                            label: 'Tiến độ (%)',
                            data: chartData,
                            fill: true,
                            borderColor: '#FF69B4',
                            backgroundColor: 'rgba(255, 105, 180, 0.1)',
                            borderWidth: 3,
                            pointBackgroundColor: '#FF69B4',
                            pointBorderColor: '#ffffff',
                            pointBorderWidth: 2,
                            pointRadius: 5,
                            pointHoverRadius: 7,
                            tension: 0.35
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                max: 100,
                                grid: { color: 'rgba(0, 0, 0, 0.05)' }
                            },
                            x: {
                                grid: { display: false }
                            }
                        }
                    }
                });
            }

            // 4. Vẽ biểu đồ phân bố học lực Distribution Chart (Doughnut)
            if (distributionChartCanvas && typeof Chart !== 'undefined') {
                if (distributionChartInstance) {
                    distributionChartInstance.destroy();
                }

                distributionChartInstance = new Chart(distributionChartCanvas, {
                    type: 'doughnut',
                    data: {
                        labels: ['Giỏi (A/A+)', 'Khá (B/B+)', 'TB Khá (C/C+)', 'TB (D/D+)', 'Yếu (F)'],
                        datasets: [{
                            data: [gradesCount['A'], gradesCount['B'], gradesCount['C'], gradesCount['D'], gradesCount['F']],
                            backgroundColor: ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#9CA3AF'],
                            borderWidth: 2,
                            borderColor: '#ffffff'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: { boxWidth: 10, font: { size: 11 } }
                            }
                        },
                        cutout: '65%'
                    }
                });
            }
        }
    } catch (e) {
        console.error("Lỗi tải trang thống kê: ", e);
        if (achievementsContainer) achievementsContainer.innerHTML = '<p class="text-red-500 col-span-full py-6">Lỗi tải thành tựu.</p>';
        if (statsContainer) statsContainer.innerHTML = '<p class="text-red-500 p-6 w-full col-span-full">Lỗi tải lịch sử làm bài.</p>';
    }
}

/**
 * Xử lý sự kiện nút bấm tính điểm GPA hệ 4 trên UI
 */
export function calculateGPA() {
    const correctAnswersInput = document.getElementById('correct-answers');
    const totalQuestionsInput = document.getElementById('total-questions');
    const resultArea = document.getElementById('gpa-result-area');

    if (!correctAnswersInput || !totalQuestionsInput || !resultArea) return;

    const x = parseInt(correctAnswersInput.value, 10);
    const y = parseInt(totalQuestionsInput.value, 10);

    if (isNaN(x) || isNaN(y) || y <= 0 || x < 0 || x > y) {
        showToast('Vui lòng nhập số câu hợp lệ!', 'warning');
        correctAnswersInput.classList.add('border-red-400');
        totalQuestionsInput.classList.add('border-red-400');
        return;
    }
    correctAnswersInput.classList.remove('border-red-400');
    totalQuestionsInput.classList.remove('border-red-400');

    const n = x / y;
    let score10;

    if (n < 0.5) {
        score10 = (8 * x) / y;
    } else if (n === 0.5) {
        score10 = 4.0;
    } else if (n > 0.5 && n < 0.6) {
        score10 = 4 + (10 * (x - 0.5 * y)) / y;
    } else if (n === 0.6) {
        score10 = 5.0;
    } else {
        score10 = 5 + (12.5 * (x - 0.6 * y)) / y;
    }

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
        resultArea.innerHTML = `<div class="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm font-medium flex items-start gap-2"><i class="fas fa-circle-exclamation mt-0.5"></i><span>${msg}</span></div>`;
    };
    const card = (cls, icon, body) =>
        `<div class="p-4 rounded-2xl border ${cls} text-sm leading-relaxed"><div class="flex items-start gap-2"><i class="fas ${icon} mt-0.5"></i><div class="flex-1">${body}</div></div></div>`;

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

    const targetNote = `<div class="text-xs text-gray-500 mt-3 pt-2 border-t border-gray-200/70">🎯 Để đạt <b>GPA ${desiredGPA.toFixed(1)}</b>, điểm tổng kết cần <b>≥ ${targetScore10.toFixed(1)}</b> (hệ 10).</div>`;

    // 3a. Đã nhập đủ tất cả -> báo kết quả tổng kết
    if (unknown.length === 0) {
        const finalScore10 = knownPct / 10;
        const { score4, letterGrade } = calculateGPAFromPercent(knownPct);
        const reached = knownPct >= targetPct - 1e-9;
        const summary = `
            <div class="font-bold mb-2">Điểm tổng kết dự kiến</div>
            <div class="flex flex-wrap gap-x-5 gap-y-1">
                <span>Hệ 10: <b>${finalScore10.toFixed(2)}</b></span>
                <span>Hệ 4: <b>${score4.toFixed(1)}</b></span>
                <span>Điểm chữ: <b>${letterGrade}</b></span>
            </div>
            <div class="mt-2 font-semibold ${reached ? 'text-emerald-600' : 'text-amber-600'}">
                ${reached ? '🎉 Bạn đã đạt mục tiêu!' : `Chưa đạt mục tiêu GPA ${desiredGPA.toFixed(1)} (cần hệ 10 ≥ ${targetScore10.toFixed(1)}).`}
            </div>`;
        resultArea.innerHTML = card(
            reached ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800',
            reached ? 'fa-trophy' : 'fa-circle-info',
            summary
        ) + targetNote;
        return;
    }

    // 3b. Đã chắc chắn đạt dù các lần còn lại được 0 điểm
    if (neededPct <= 1e-9) {
        resultArea.innerHTML = card(
            'bg-emerald-50 border-emerald-200 text-emerald-800', 'fa-circle-check',
            `<div class="font-bold mb-1">Bạn đã chắc suất đạt mục tiêu! 🎉</div>
             <div>Kết quả các lần đã thi đủ để đạt <b>GPA ${desiredGPA.toFixed(1)}</b> kể cả khi các lần còn lại được 0 điểm.</div>`
        ) + targetNote;
        return;
    }

    const labelList = (a) => a.label;

    // 3c. Còn đúng 1 lần chưa nhập -> giải chính xác
    if (unknown.length === 1) {
        const a = unknown[0];
        if (a.weight <= 0) {
            resultArea.innerHTML = card('bg-amber-50 border-amber-200 text-amber-800', 'fa-triangle-exclamation',
                `Lần "<b>${labelList(a)}</b>" có trọng số 0% nên không thể bù điểm cho mục tiêu này.`) + targetNote;
            return;
        }
        const neededP = neededPct / a.weight; // hiệu suất cần ở lần này

        if (a.kind === 'score') {
            let needScore = Math.ceil(neededP * 10 * 100) / 100; // điểm hệ 10, làm tròn lên 2 số lẻ
            if (needScore > 10) {
                resultArea.innerHTML = card('bg-red-50 border-red-200 text-red-700', 'fa-triangle-exclamation',
                    `Không thể đạt mục tiêu: lần "<b>${labelList(a)}</b>" cần <b>${needScore.toFixed(2)}</b> điểm hệ 10 (vượt quá 10).`) + targetNote;
            } else {
                resultArea.innerHTML = card('bg-pink-50 border-pink-200 text-pink-800', 'fa-bullseye',
                    `Bạn cần đạt tối thiểu <b>${needScore.toFixed(2)}</b> điểm hệ 10 ở lần "<b>${labelList(a)}</b>".`) + targetNote;
            }
            return;
        }

        let needCorrect = Math.ceil(neededP * a.total - 1e-9);
        if (needCorrect < 0) needCorrect = 0;
        if (needCorrect > a.total) {
            const maxScore10 = (knownPct + a.weight) / 10;
            resultArea.innerHTML = card('bg-red-50 border-red-200 text-red-700', 'fa-triangle-exclamation',
                `<div class="font-bold mb-1">Mục tiêu ngoài tầm với 😢</div>
                 <div>Dù đúng cả <b>${a.total}/${a.total}</b> câu ở lần "<b>${labelList(a)}</b>", điểm tổng kết tối đa chỉ đạt <b>${maxScore10.toFixed(2)}</b> (hệ 10).</div>`) + targetNote;
            return;
        }
        const acc = Math.round((needCorrect / a.total) * 100);
        resultArea.innerHTML = card('bg-pink-50 border-pink-200 text-pink-800', 'fa-bullseye',
            `Bạn cần đúng tối thiểu <b>${needCorrect}/${a.total}</b> câu (≈ ${acc}%) ở lần "<b>${labelList(a)}</b>" để đạt mục tiêu.`) + targetNote;
        return;
    }

    // 3d. Còn nhiều lần chưa nhập -> gợi ý theo mức "đúng đều" giữa các lần
    const unknownWeight = unknown.reduce((s, a) => s + a.weight, 0);
    if (unknownWeight <= 0) {
        resultArea.innerHTML = card('bg-amber-50 border-amber-200 text-amber-800', 'fa-triangle-exclamation',
            'Các lần còn lại có tổng trọng số 0% nên không thể bù điểm cho mục tiêu này.') + targetNote;
        return;
    }
    const reqRatio = neededPct / unknownWeight; // hiệu suất đồng đều cần ở các lần còn lại

    if (reqRatio > 1 + 1e-9) {
        const maxScore10 = (knownPct + unknownWeight) / 10;
        resultArea.innerHTML = card('bg-red-50 border-red-200 text-red-700', 'fa-triangle-exclamation',
            `<div class="font-bold mb-1">Mục tiêu ngoài tầm với 😢</div>
             <div>Dù đạt điểm tuyệt đối ở tất cả các lần còn lại, điểm tổng kết tối đa chỉ đạt <b>${maxScore10.toFixed(2)}</b> (hệ 10).</div>`) + targetNote;
        return;
    }

    const accPct = Math.ceil(reqRatio * 100);
    const items = unknown.map(a => {
        if (a.kind === 'score') {
            const needScore = Math.min(10, Math.ceil(reqRatio * 10 * 100) / 100);
            return `<li>Lần "<b>${a.label}</b>": tối thiểu <b>${needScore.toFixed(2)}</b> điểm hệ 10</li>`;
        }
        const needCorrect = Math.min(a.total, Math.max(0, Math.ceil(reqRatio * a.total - 1e-9)));
        return `<li>Lần "<b>${a.label}</b>": tối thiểu <b>${needCorrect}/${a.total}</b> câu</li>`;
    }).join('');

    resultArea.innerHTML = card('bg-pink-50 border-pink-200 text-pink-800', 'fa-lightbulb',
        `<div class="font-bold mb-1">Gợi ý cho ${unknown.length} lần thi còn lại</div>
         <div class="mb-2">Nếu giữ phong độ <b>đúng đều ≈ ${accPct}%</b> mỗi lần, bạn cần:</div>
         <ul class="list-disc pl-5 space-y-0.5">${items}</ul>
         <div class="text-xs text-gray-500 mt-2">💡 Đây là một phương án cân bằng — nếu lần này làm tốt hơn thì lần sau có thể nhẹ nhàng hơn.</div>`) + targetNote;
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

/**
 * Render bảng các lần thi trong công cụ tính điểm GPA
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

    let html = `<div class="overflow-x-auto rounded-xl border border-pink-100">
        <table class="min-w-full text-center text-sm">
            <thead><tr class="bg-pink-50 text-gray-600">
                <th class="px-2 py-2 font-semibold whitespace-nowrap">Lần thi</th>
                <th class="px-2 py-2 font-semibold whitespace-nowrap">Số câu đúng / Điểm</th>
                <th class="px-2 py-2 font-semibold whitespace-nowrap">Số câu thi</th>
                <th class="px-2 py-2 font-semibold whitespace-nowrap">Trọng số (%)</th>
            </tr></thead><tbody>`;

    rows.forEach(row => {
        const weightInput = `<input type="number" class="attempt-weight w-16 px-2 py-1 border border-pink-200 rounded text-center ${isCustom ? '' : 'bg-gray-100 text-gray-500'}" min="0" max="100" value="${row.weight}" ${isCustom ? '' : 'readonly'}>`;
        if (row.kind === 'score') {
            html += `<tr class="attempt-row border-t border-pink-100" data-kind="score" data-label="${row.label}">
                <td class="px-2 py-2 font-semibold text-gray-800 whitespace-nowrap">${row.label}</td>
                <td class="px-2 py-2"><input type="number" class="attempt-score w-24 px-2 py-1 border border-pink-200 rounded text-center" min="0" max="10" step="0.01" placeholder="Điểm hệ 10"></td>
                <td class="px-2 py-2 text-gray-400 text-xs">dùng điểm hệ 10</td>
                <td class="px-2 py-2">${weightInput}</td>
            </tr>`;
        } else {
            html += `<tr class="attempt-row border-t border-pink-100" data-kind="ratio" data-label="${row.label}">
                <td class="px-2 py-2 font-semibold text-gray-800 whitespace-nowrap">${row.label}</td>
                <td class="px-2 py-2"><input type="number" class="attempt-correct w-20 px-2 py-1 border border-pink-200 rounded text-center" min="0" placeholder="Câu đúng"></td>
                <td class="px-2 py-2"><input type="number" class="attempt-total w-20 px-2 py-1 border border-pink-200 rounded text-center" min="1" placeholder="Tổng câu"></td>
                <td class="px-2 py-2">${weightInput}</td>
            </tr>`;
        }
    });

    const totalWeight = rows.reduce((a, r) => a + r.weight, 0);
    html += `</tbody></table></div>
        <div id="attempts-weight-note" class="text-xs ${totalWeight === 100 ? 'text-gray-400' : 'text-red-500'} mt-2 text-right">Tổng trọng số: <b id="attempts-weight-sum">${totalWeight}</b>%</div>`;
    tableContainer.innerHTML = html;

    // Ở chế độ tùy chỉnh: cập nhật tổng trọng số trực tiếp khi người dùng chỉnh để dễ canh đủ 100%
    if (isCustom) {
        const weightInputs = Array.from(tableContainer.querySelectorAll('.attempt-weight'));
        const note = document.getElementById('attempts-weight-note');
        const sumEl = document.getElementById('attempts-weight-sum');
        const updateSum = () => {
            const sum = weightInputs.reduce((a, el) => a + (parseFloat(el.value) || 0), 0);
            if (sumEl) sumEl.textContent = Math.round(sum * 100) / 100;
            if (note) {
                note.classList.toggle('text-red-500', Math.round(sum) !== 100);
                note.classList.toggle('text-gray-400', Math.round(sum) === 100);
            }
        };
        weightInputs.forEach(el => el.addEventListener('input', updateSum));
    }
}

/**
 * Khởi tạo và thiết lập các Event Listeners cho GPA Calculator
 */
export function initGpaCalculator() {
    const calculateGpaBtn = document.getElementById('calculate-gpa-btn');
    if (calculateGpaBtn && !calculateGpaBtn.dataset.listenerAdded) {
        calculateGpaBtn.addEventListener('click', calculateGPA);
        calculateGpaBtn.dataset.listenerAdded = 'true';
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

