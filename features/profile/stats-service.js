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
 * Tính số câu cần đạt ở lần thi tới để đạt điểm hệ 4 mong muốn (Logic nâng cao từ index.html)
 */
export function calculateRequiredCorrectAnswers() {
    const examTypeEl = document.getElementById('exam-type');
    const numAttemptsEl = document.getElementById('num-attempts');
    const desiredGPAInput = document.getElementById('desired-gpa-4');
    const resultArea = document.getElementById('required-correct-result');

    if (!examTypeEl || !desiredGPAInput || !resultArea) return;

    const examType = examTypeEl.value;
    let numAttempts;
    if (examType === 'custom') {
        numAttempts = parseInt(numAttemptsEl.value, 10);
    } else if (examType === 'pretest') {
        numAttempts = 3;
    } else {
        numAttempts = 2;
    }

    const percentInputs = Array.from(document.querySelectorAll('#attempts-table .attempt-percent'));
    const totalInputs = Array.from(document.querySelectorAll('#attempts-table .attempt-total'));
    const correctInputs = Array.from(document.querySelectorAll('#attempts-table .attempt-correct'));

    // Lấy số câu từng lần
    let totals = totalInputs.map(input => parseInt(input.value, 10));
    if (totals.some(v => isNaN(v) || v <= 0)) {
        resultArea.textContent = 'Vui lòng nhập số câu cho từng lần thi.';
        return;
    }
    // Lấy phần trăm từng lần
    let percents = percentInputs.map(input => parseFloat(input.value) || 0);
    let percentSum = percents.reduce((a, b) => a + b, 0);
    if (percentSum !== 100) {
        resultArea.textContent = 'Tổng phần trăm các lần thi phải bằng 100%.';
        return;
    }
    // Lấy số câu đúng từng lần thi
    let scores = [];
    const pretestScoreInput = document.querySelector('#attempts-table .attempt-pretest-score');
    for (let i = 0; i < numAttempts; i++) {
        if (i === 0 && examType === 'pretest') {
            let v = pretestScoreInput ? pretestScoreInput.value.trim() : '';
            if (v === '') scores.push(null);
            else scores.push(parseFloat(v));
        } else {
            let input = examType === 'pretest' ? correctInputs[i - 1] : correctInputs[i];
            let v = input ? input.value.trim() : '';
            scores.push(v === '' ? null : parseInt(v, 10));
        }
    }

    const desiredGPA = parseFloat(desiredGPAInput.value);
    if (isNaN(desiredGPA) || desiredGPA < 0 || desiredGPA > 4) {
        resultArea.textContent = 'Vui lòng nhập điểm hệ 4 mong muốn hợp lệ.';
        return;
    }

    // Chuyển điểm hệ 4 sang hệ 10
    let desiredScore10;
    if (desiredGPA >= 3.8) desiredScore10 = 9.5;
    else if (desiredGPA >= 3.5) desiredScore10 = 8.5;
    else if (desiredGPA >= 3.2) desiredScore10 = 7.0;
    else if (desiredGPA >= 2.5) desiredScore10 = 5.5;
    else if (desiredGPA >= 2.0) desiredScore10 = 4.0;
    else desiredScore10 = 0;

    // Đếm số lần chưa nhập
    let emptyIdx = [];
    let weightedCorrect = 0;
    let totalAll = 0;
    for (let i = 0; i < numAttempts; i++) {
        totalAll += totals[i];
        if (scores[i] === null) emptyIdx.push(i);
        else if (i === 0 && examType === 'pretest') {
            weightedCorrect += (scores[i] / 10) * percents[i];
        } else {
            weightedCorrect += (scores[i] / totals[i]) * percents[i];
        }
    }

    // Tổng điểm cần đạt (theo hệ 10)
    const requiredSum = desiredScore10 * totalAll * 0.1;

    // Nếu chỉ còn 1 lần chưa nhập, giải phương trình cho lần đó
    if (emptyIdx.length === 1) {
        const idx = emptyIdx[0];
        let x;
        if (idx === 0 && examType === 'pretest') {
            x = ((requiredSum - weightedCorrect) * 10) / percents[idx];
            x = Math.ceil(x * 100) / 100;
            if (x < 0) {
                resultArea.textContent = 'Bạn đã đủ điểm mong muốn!';
            } else if (x > 10) {
                resultArea.textContent = `Không thể đạt điểm mong muốn với điểm pretest này.`;
            } else {
                resultArea.textContent = `Bạn cần đạt nhất ${x} điểm hệ 10 ở lần Pretest để đạt điểm mong muốn.`;
            }
        } else {
            x = Math.ceil((requiredSum - weightedCorrect) * totals[idx] / percents[idx]);
            if (x < 0) {
                resultArea.textContent = 'Bạn đã đủ điểm mong muốn!';
            } else if (x > totals[idx]) {
                resultArea.textContent = `Không thể đạt điểm mong muốn với số câu này ở lần thi thứ ${idx + 1}.`;
            } else {
                resultArea.textContent = `Bạn cần đúng ít nhất ${x} câu trong lần thi thứ ${idx + 1} (${totals[idx]} câu) để đạt điểm mong muốn.`;
            }
        }
        return;
    }

    // Nếu còn nhiều hơn 1 lần chưa nhập, đưa ra 3 gợi ý tối ưu
    if (emptyIdx.length > 1) {
        let remainPercent = emptyIdx.map(i => percents[i]);
        let remainTotals = emptyIdx.map(i => totals[i]);
        let remainSum = remainPercent.reduce((a, b) => a + b, 0);
        let remainTotal = emptyIdx.length;
        let minRatio = (requiredSum - weightedCorrect) / remainSum;
        let suggestions = [];

        // Gợi ý 1: chia đều tỉ lệ đúng
        let even = remainPercent.map((p, j) => Math.ceil(minRatio * remainTotals[j]));
        suggestions.push(even);

        // Gợi ý 2: ưu tiên lần phần trăm cao nhất
        let sortedIdx = [...emptyIdx].sort((a, b) => percents[b] - percents[a]);
        let opt1 = Array(remainTotal).fill(0);
        let remain = minRatio * remainSum;
        for (let i = 0; i < remainTotal; i++) {
            let idx2 = emptyIdx.indexOf(sortedIdx[i]);
            let val = i === 0 ? Math.ceil(remain * remainTotals[idx2] / remainTotals.reduce((a, b) => a + b, 0)) : Math.floor(remain * remainTotals[idx2] / remainTotals.reduce((a, b) => a + b, 0));
            opt1[idx2] = val;
            remain -= val / remainTotals[idx2];
        }
        suggestions.push(opt1.map(x => Math.max(0, Math.ceil(x))));

        // Gợi ý 3: ưu tiên lần phần trăm thấp nhất
        let sortedIdx2 = [...emptyIdx].sort((a, b) => percents[a] - percents[b]);
        let opt2 = Array(remainTotal).fill(0);
        remain = minRatio * remainSum;
        for (let i = 0; i < remainTotal; i++) {
            let idx2 = emptyIdx.indexOf(sortedIdx2[i]);
            let val = i === 0 ? Math.ceil(remain * remainTotals[idx2] / remainTotals.reduce((a, b) => a + b, 0)) : Math.floor(remain * remainTotals[idx2] / remainTotals.reduce((a, b) => a + b, 0));
            opt2[idx2] = val;
            remain -= val / remainTotals[idx2];
        }
        suggestions.push(opt2.map(x => Math.max(0, Math.ceil(x))));

        // Hiển thị gợi ý
        let html = '<div class="mb-2">Gợi ý số câu đúng tối thiểu cho các lần còn lại:</div>';
        suggestions.forEach((arr, idx) => {
            html += `<div class="mb-1">Gợi ý ${idx + 1}: ` + arr.map((v, j) => `Lần ${emptyIdx[j] + 1} (${remainTotals[j]} câu): <b>${v}</b> câu`).join(' | ') + '</div>';
        });
        resultArea.innerHTML = html;
        return;
    }

    // Nếu không còn lần nào trống, kiểm tra đã đạt chưa
    if (emptyIdx.length === 0) {
        let totalScore10 = 0;
        for (let i = 0; i < numAttempts; i++) {
            if (i === 0 && examType === 'pretest') {
                totalScore10 += scores[i] * percents[i] / 100;
            } else {
                let score10 = (scores[i] / totals[i]) * 10;
                totalScore10 += score10 * percents[i] / 100;
            }
        }

        let score4, letterGrade;
        if (totalScore10 >= 9.5) { score4 = 4.0; letterGrade = 'A+'; }
        else if (totalScore10 >= 8.5) { score4 = 4.0; letterGrade = 'A'; }
        else if (totalScore10 >= 8.0) { score4 = 3.5; letterGrade = 'B+'; }
        else if (totalScore10 >= 7.0) { score4 = 3.0; letterGrade = 'B'; }
        else if (totalScore10 >= 6.5) { score4 = 2.5; letterGrade = 'C+'; }
        else if (totalScore10 >= 5.5) { score4 = 2.0; letterGrade = 'C'; }
        else if (totalScore10 >= 5.0) { score4 = 1.5; letterGrade = 'D+'; }
        else if (totalScore10 >= 4.0) { score4 = 1.0; letterGrade = 'D'; }
        else { score4 = 0.0; letterGrade = 'F'; }

        resultArea.innerHTML = `<div class='mb-2'>Điểm tổng kết:</div><div>Điểm hệ 10: <b>${totalScore10.toFixed(2)}</b></div><div>Điểm hệ 4: <b>${score4.toFixed(1)}</b></div><div>Điểm chữ: <b>${letterGrade}</b></div>`;
        return;
    }
}

function getDefaultConfig(type) {
    if (type === 'pretest') return { num: 3, percents: [10, 20, 70] };
    if (type === 'nopretest') return { num: 2, percents: [30, 70] };
    return { num: 3, percents: [0, 0, 0] };
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
    let numAttempts;
    let percents;

    if (examType === 'custom') {
        if (customRow) customRow.style.display = '';
        numAttempts = parseInt(numAttemptsEl.value, 10);
        percents = [];
        for (let i = 0; i < numAttempts; i++) percents.push(0);
    } else {
        if (customRow) customRow.style.display = 'none';
        const conf = getDefaultConfig(examType);
        numAttempts = conf.num;
        percents = conf.percents;
    }

    let html = '';
    if (examType === 'pretest') {
        html += `<div class="overflow-x-auto mb-4"><table class="min-w-full border text-center"><thead><tr><th class="border px-2 py-1">Pretest</th><th class="border px-2 py-1">Điểm pretest (hệ 10)</th></tr></thead><tbody>`;
        html += `<tr>
            <td class="border px-2 py-1">Pretest</td>
            <td class="border px-2 py-1"><input type="number" class="attempt-pretest-score w-20 px-2 py-1 border rounded" min="0" max="10" step="0.01" placeholder="Điểm pretest"></td>
        </tr>`;
        html += '</tbody></table></div>';
    }

    html += `<div class="overflow-x-auto"><table class="min-w-full border text-center text-sm text-gray-500"><thead><tr class="bg-pink-50/50"><th class="border px-2 py-1">Lần thi</th><th class="border px-2 py-1">Số câu đúng</th><th class="border px-2 py-1">Số câu thi</th><th class="border px-2 py-1">Phần trăm (%)</th></tr></thead><tbody>`;
    
    if (examType === 'pretest') {
        for (let i = 0; i < 2; i++) {
            const label = i === 0 ? 'Giữa kỳ' : 'Cuối kỳ';
            html += `<tr>
                <td class="border px-2 py-1 font-semibold text-gray-800">${label}</td>
                <td class="border px-2 py-1"><input type="number" class="attempt-correct w-20 px-2 py-1 border rounded" min="0" placeholder="Số câu đúng"></td>
                <td class="border px-2 py-1"><input type="number" class="attempt-total w-20 px-2 py-1 border rounded" min="1" placeholder="Số câu thi"></td>
                <td class="border px-2 py-1"><input type="number" class="attempt-percent w-20 px-2 py-1 border rounded" min="1" max="100" value="${percents[i + 1] || ''}" ${examType === 'custom' ? '' : 'readonly'}></td>
            </tr>`;
        }
    } else {
        for (let i = 0; i < numAttempts; i++) {
            let label;
            if (examType === 'nopretest') {
                label = i === 0 ? 'Giữa kỳ' : 'Cuối kỳ';
            } else {
                label = i === 0 ? 'Lần 1' : (i === numAttempts - 1 ? 'Cuối kỳ' : `Lần ${i + 1}`);
            }
            html += `<tr>
                <td class="border px-2 py-1 font-semibold text-gray-800">${label}</td>
                <td class="border px-2 py-1"><input type="number" class="attempt-correct w-20 px-2 py-1 border rounded" min="0" placeholder="Số câu đúng"></td>
                <td class="border px-2 py-1"><input type="number" class="attempt-total w-20 px-2 py-1 border rounded" min="1" placeholder="Số câu thi"></td>
                <td class="border px-2 py-1"><input type="number" class="attempt-percent w-20 px-2 py-1 border rounded" min="1" max="100" value="${percents[i] || ''}" ${examType === 'custom' ? '' : 'readonly'}></td>
            </tr>`;
        }
    }
    html += '</tbody></table></div>';
    tableContainer.innerHTML = html;
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

