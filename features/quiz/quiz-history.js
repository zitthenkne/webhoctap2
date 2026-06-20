// quiz-history.js
import { db, auth } from '../../core/firebase-init.js';
import { collection, query, where, orderBy, getDocs, doc, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import { showToast } from '../../core/utils.js';

const urlParams = new URLSearchParams(window.location.search);
const quizId = urlParams.get('id');

// DOM Elements
const quizTitleEl = document.getElementById('quiz-title');
const btnPlayQuiz = document.getElementById('btn-play-quiz');
const btnClearAll = document.getElementById('btn-clear-all');
const historyList = document.getElementById('history-list');
const historyCountEl = document.getElementById('history-count');

// Stats Elements
const statAttempts = document.getElementById('stat-attempts');
const statHighScore = document.getElementById('stat-high-score');
const statHighScoreDetail = document.getElementById('stat-high-score-detail');
const statAvgScore = document.getElementById('stat-avg-score');
const statAvgTime = document.getElementById('stat-avg-time');

// Chart Elements
const chartContainer = document.getElementById('chart-container');
const progressSvg = document.getElementById('progress-svg');
const chartTooltip = document.getElementById('chart-tooltip');

// Modal Elements
const confirmModal = document.getElementById('confirm-modal');
const confirmModalBox = document.getElementById('confirm-modal-box');
const btnConfirmCancel = document.getElementById('btn-confirm-cancel');
const btnConfirmOk = document.getElementById('btn-confirm-ok');
const confirmModalTitle = document.getElementById('confirm-modal-title');
const confirmModalMessage = document.getElementById('confirm-modal-message');

// State Variables
let deleteCallback = null;

if (!quizId) {
    showErrorState('Thiếu thông tin bộ đề. Vui lòng quay lại thư viện.');
} else {
    // Cài đặt nút làm bài
    btnPlayQuiz.href = `quiz.html?id=${quizId}`;
    
    // Kiểm tra trạng thái đăng nhập
    onAuthStateChanged(auth, user => {
        if (!user) {
            showAuthError();
            return;
        }
        initPage(quizId, user.uid);
    });
}

// Khởi chạy trang
async function initPage(quizId, userId) {
    // 1. Tải thông tin bộ đề trước
    await loadQuizDetails(quizId);
    
    // 2. Tải lịch sử làm bài
    await loadQuizHistory(quizId, userId);
    
    // 3. Đăng ký sự kiện
    setupEventListeners(quizId, userId);
}

// Tải thông tin chi tiết bộ đề
async function loadQuizDetails(quizId) {
    try {
        const quizDocRef = doc(db, "quiz_sets", quizId);
        const quizSnap = await getDoc(quizDocRef);
        
        if (quizSnap.exists()) {
            const quizData = quizSnap.data();
            quizTitleEl.innerHTML = `<i class="fas fa-book-open text-pink-400 mr-1"></i> ${quizData.title}`;
            btnPlayQuiz.classList.remove('hidden');
        } else {
            quizTitleEl.innerText = "Lịch sử làm bài";
            btnPlayQuiz.classList.remove('hidden'); // Vẫn cho phép bấm vào làm nếu ID hợp lệ
        }
    } catch (err) {
        console.error("Lỗi khi tải thông tin bộ đề:", err);
        quizTitleEl.innerText = "Lịch sử làm bài";
    }
}

// Tải lịch sử làm bài của người dùng
async function loadQuizHistory(quizId, userId) {
    showLoadingState();
    
    try {
        const q = query(
            collection(db, "quiz_results"),
            where("quizId", "==", quizId),
            where("userId", "==", userId),
            orderBy("completedAt", "desc")
        );
        const querySnapshot = await getDocs(q);
        const history = [];
        
        querySnapshot.forEach(doc => {
            const data = doc.data();
            history.push({
                id: doc.id,
                time: data.completedAt && data.completedAt.toDate ? formatDate(data.completedAt.toDate()) : "Chưa rõ thời gian",
                rawDate: data.completedAt && data.completedAt.toDate ? data.completedAt.toDate() : new Date(0),
                score: data.score,
                total: data.totalQuestions,
                percentage: data.percentage,
                timeTaken: data.timeTaken || 0,
                quizTitle: data.quizTitle || ""
            });
        });
        
        // Cập nhật tiêu đề dự phòng nếu bước loadQuizDetails thất bại hoặc bộ đề đã bị xóa
        if (history.length > 0 && quizTitleEl.innerText.includes('skeleton')) {
            quizTitleEl.innerHTML = `<i class="fas fa-book-open text-pink-400 mr-1"></i> ${history[0].quizTitle}`;
        }
        
        if (history.length === 0) {
            showEmptyState();
        } else {
            // Hiển thị nút xóa tất cả
            btnClearAll.classList.remove('hidden');
            
            // Tính toán thống kê và cập nhật Dashboard
            calculateAndDisplayStats(history);
            
            // Vẽ biểu đồ tiến trình
            drawProgressChart(history);
            
            // Render danh sách
            renderHistoryList(history);
        }
    } catch (err) {
        console.error('Lỗi khi tải lịch sử:', err);
        showErrorState('Đã xảy ra lỗi khi tải lịch sử làm bài. Vui lòng thử lại.');
    }
}

// Tính toán và hiển thị thông số thống kê
function calculateAndDisplayStats(history) {
    const totalAttempts = history.length;
    statAttempts.innerText = totalAttempts;
    historyCountEl.innerText = `${totalAttempts} lượt làm`;
    
    // Tìm điểm cao nhất
    let maxPercent = -1;
    let highScoreRecord = null;
    history.forEach(h => {
        if (h.percentage > maxPercent) {
            maxPercent = h.percentage;
            highScoreRecord = h;
        }
    });
    
    if (highScoreRecord) {
        statHighScore.innerText = `${highScoreRecord.percentage}%`;
        statHighScoreDetail.innerText = `Lần tốt nhất: ${highScoreRecord.score}/${highScoreRecord.total} câu`;
    }
    
    // Tính điểm trung bình
    const sumPercentage = history.reduce((sum, h) => sum + h.percentage, 0);
    const avgScore = Math.round(sumPercentage / totalAttempts);
    statAvgScore.innerText = `${avgScore}%`;
    
    // Tính thời gian làm bài trung bình (chỉ tính những lần có timeTaken > 0)
    const validTimes = history.filter(h => h.timeTaken > 0);
    if (validTimes.length > 0) {
        const sumTime = validTimes.reduce((sum, h) => sum + h.timeTaken, 0);
        const avgSeconds = Math.round(sumTime / validTimes.length);
        statAvgTime.innerText = formatTimeBrief(avgSeconds);
    } else {
        statAvgTime.innerText = "--";
    }
}

// Vẽ biểu đồ tiến trình dạng SVG
function drawProgressChart(history) {
    // Cần ít nhất 1 điểm để vẽ, nhưng vẽ đường thẳng thì cần từ 2 điểm trở lên.
    // Nếu có 1 điểm, ta vẫn có thể vẽ 1 chấm tròn duy nhất.
    chartContainer.classList.remove('hidden');
    
    // Sắp xếp lịch sử từ cũ đến mới để vẽ biểu đồ tiến trình thời gian
    const sortedHistory = [...history].sort((a, b) => a.rawDate - b.rawDate);
    const pointsCount = sortedHistory.length;
    
    const width = 800;
    const height = 200;
    const paddingLeft = 60;
    const paddingRight = 40;
    const paddingTop = 30;
    const paddingBottom = 30;
    
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;
    
    // Xóa nội dung SVG cũ
    progressSvg.innerHTML = '';
    
    // 1. Tạo các đường lưới ngang (Grid lines) và nhãn Y
    const yTicks = [0, 25, 50, 75, 100];
    yTicks.forEach(tick => {
        const y = paddingTop + chartHeight - (tick / 100) * chartHeight;
        
        // Nhãn Y
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", paddingLeft - 10);
        text.setAttribute("y", y + 4);
        text.setAttribute("text-anchor", "end");
        text.setAttribute("fill", "#9ca3af");
        text.setAttribute("font-size", "10px");
        text.setAttribute("class", "outfit-font font-semibold");
        text.textContent = `${tick}%`;
        progressSvg.appendChild(text);
        
        // Đường lưới nét đứt
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", paddingLeft);
        line.setAttribute("y1", y);
        line.setAttribute("x2", width - paddingRight);
        line.setAttribute("y2", y);
        line.setAttribute("stroke", "#fbcfe8"); // Pink light
        line.setAttribute("stroke-dasharray", "4,4");
        line.setAttribute("stroke-width", "0.8");
        progressSvg.appendChild(line);
    });
    
    // Tính toán tọa độ các điểm
    const coordinates = [];
    sortedHistory.forEach((h, index) => {
        // Tọa độ X: chia đều khoảng cách
        let x = paddingLeft;
        if (pointsCount > 1) {
            x = paddingLeft + (index / (pointsCount - 1)) * chartWidth;
        } else {
            x = paddingLeft + chartWidth / 2; // Căn giữa nếu chỉ có 1 điểm
        }
        
        // Tọa độ Y: tỉ lệ ngược với Y-axis SVG (0 ở trên cùng, height ở dưới cùng)
        const y = paddingTop + chartHeight - (h.percentage / 100) * chartHeight;
        coordinates.push({ x, y, data: h, index: index + 1 });
    });
    
    // 2. Tạo Gradient cho vùng dưới đường đồ thị
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const gradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
    gradient.setAttribute("id", "chart-grad");
    gradient.setAttribute("x1", "0");
    gradient.setAttribute("y1", "0");
    gradient.setAttribute("x2", "0");
    gradient.setAttribute("y2", "1");
    
    const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    stop1.setAttribute("offset", "0%");
    stop1.setAttribute("stop-color", "#ff69b4");
    stop1.setAttribute("stop-opacity", "0.3");
    
    const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    stop2.setAttribute("offset", "100%");
    stop2.setAttribute("stop-color", "#ff69b4");
    stop2.setAttribute("stop-opacity", "0.0");
    
    gradient.appendChild(stop1);
    gradient.appendChild(stop2);
    defs.appendChild(gradient);
    progressSvg.appendChild(defs);
    
    // 3. Vẽ vùng Gradient (Area chart)
    if (pointsCount > 1) {
        let areaPathD = `M ${coordinates[0].x} ${paddingTop + chartHeight}`;
        coordinates.forEach(coord => {
            areaPathD += ` L ${coord.x} ${coord.y}`;
        });
        areaPathD += ` L ${coordinates[pointsCount - 1].x} ${paddingTop + chartHeight} Z`;
        
        const areaPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        areaPath.setAttribute("d", areaPathD);
        areaPath.setAttribute("fill", "url(#chart-grad)");
        progressSvg.appendChild(areaPath);
    }
    
    // 4. Vẽ đường nối chính (Line chart)
    if (pointsCount > 1) {
        let linePathD = `M ${coordinates[0].x} ${coordinates[0].y}`;
        for (let i = 1; i < coordinates.length; i++) {
            linePathD += ` L ${coordinates[i].x} ${coordinates[i].y}`;
        }
        
        const linePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        linePath.setAttribute("d", linePathD);
        linePath.setAttribute("fill", "none");
        linePath.setAttribute("stroke", "#ff69b4"); // Pink main
        linePath.setAttribute("stroke-width", "3");
        linePath.setAttribute("stroke-linecap", "round");
        linePath.setAttribute("stroke-linejoin", "round");
        progressSvg.appendChild(linePath);
    }
    
    // 5. Vẽ các nhãn trục X (Chỉ hiển thị nhãn nếu số điểm hợp lý, hoặc hiển thị "Lần 1", "Lần 2"...)
    coordinates.forEach(coord => {
        // Nhãn X
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", coord.x);
        text.setAttribute("y", height - 8);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("fill", "#9ca3af");
        text.setAttribute("font-size", "9px");
        text.setAttribute("class", "outfit-font font-medium");
        text.textContent = `Lần ${coord.index}`;
        progressSvg.appendChild(text);
        
        // Vẽ chấm tròn tương tác
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", coord.x);
        circle.setAttribute("cy", coord.y);
        circle.setAttribute("r", "5");
        circle.setAttribute("fill", "#ffffff");
        circle.setAttribute("stroke", "#ff69b4");
        circle.setAttribute("stroke-width", "3");
        circle.setAttribute("style", "cursor: pointer; transition: r 0.1s ease;");
        progressSvg.appendChild(circle);
        
        // Sự kiện Hover hiển thị Tooltip
        circle.addEventListener('mouseenter', (e) => {
            circle.setAttribute("r", "8");
            
            const rect = progressSvg.getBoundingClientRect();
            // Tính toán vị trí tooltip tương đối với SVG container
            const tooltipX = e.clientX - rect.left;
            const tooltipY = e.clientY - rect.top - 45;
            
            chartTooltip.innerHTML = `
                <div class="font-bold">Lần ${coord.index}: ${coord.data.percentage}%</div>
                <div class="text-[9px] text-pink-200">${coord.data.score}/${coord.data.total} câu - ${coord.data.time.split(' ')[0]}</div>
            `;
            chartTooltip.style.left = `${tooltipX}px`;
            chartTooltip.style.top = `${tooltipY}px`;
            chartTooltip.style.opacity = '1';
        });
        
        circle.addEventListener('mouseleave', () => {
            circle.setAttribute("r", "5");
            chartTooltip.style.opacity = '0';
        });
    });
}

// Render danh sách lịch sử ra HTML
function renderHistoryList(history) {
    historyList.innerHTML = history.map((h, i) => {
        // Thứ tự lần làm bài (Lượt thứ x)
        const attemptIndex = history.length - i;
        
        // Xác định badge đánh giá dựa trên tỷ lệ điểm số
        let badgeColor = "";
        let badgeText = "";
        
        if (h.percentage >= 90) {
            badgeColor = "bg-green-50 text-green-600 border border-green-200";
            badgeText = "Xuất sắc";
        } else if (h.percentage >= 50) {
            badgeColor = "bg-blue-50 text-blue-600 border border-blue-200";
            badgeText = "Đạt";
        } else {
            badgeColor = "bg-orange-50 text-orange-600 border border-orange-200";
            badgeText = "Cần cố gắng";
        }
        
        const timeTakenFormatted = h.timeTaken > 0 ? formatTimeDetailed(h.timeTaken) : "N/A";
        
        return `
            <div class="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100 hover:border-pink-200 hover:shadow-sm transition-all duration-300 group">
                <div class="flex items-center gap-3">
                    <!-- Icon chỉ số lượt làm -->
                    <div class="w-10 h-10 rounded-full bg-pink-50 flex flex-col items-center justify-center text-[#FF69B4] border border-pink-100">
                        <span class="text-[10px] font-bold uppercase leading-none text-pink-400">Lần</span>
                        <span class="text-sm font-extrabold outfit-font leading-none mt-0.5">${attemptIndex}</span>
                    </div>
                    <!-- Thông tin lượt làm -->
                    <div class="flex flex-col">
                        <span class="font-bold text-gray-700 text-sm md:text-base">${h.time}</span>
                        <div class="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs text-gray-400">
                            <span class="flex items-center gap-1">
                                <i class="fas fa-check-circle text-gray-300"></i> Đúng: <strong>${h.score}/${h.total}</strong>
                            </span>
                            <span class="text-gray-300">|</span>
                            <span class="flex items-center gap-1">
                                <i class="fas fa-clock text-gray-300"></i> Thời gian: <strong>${timeTakenFormatted}</strong>
                            </span>
                        </div>
                    </div>
                </div>
                
                <!-- Kết quả & Nút xóa -->
                <div class="flex items-center gap-4">
                    <div class="flex flex-col items-end">
                        <span class="text-lg md:text-xl font-black text-[#FF69B4] outfit-font leading-none">${h.percentage}%</span>
                        <span class="text-[9px] px-2 py-0.5 mt-1 rounded-full font-bold uppercase tracking-wider ${badgeColor}">${badgeText}</span>
                    </div>
                    <!-- Nút xóa (chỉ hiện đầy đủ khi hover ở desktop, hoặc hiện sẵn ở mobile) -->
                    <button class="btn-delete-result w-8 h-8 rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-all opacity-100 md:opacity-0 group-hover:opacity-100 duration-200" 
                            data-id="${h.id}" 
                            title="Xóa lượt làm này">
                        <i class="fas fa-trash-alt text-xs"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Thiết lập các sự kiện tương tác
function setupEventListeners(quizId, userId) {
    // Bắt sự kiện click nút xóa từng dòng (dùng Event Delegation)
    historyList.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.btn-delete-result');
        if (!deleteBtn) return;
        
        const resultId = deleteBtn.getAttribute('data-id');
        
        showConfirmModal(
            'Xóa kết quả làm bài',
            'Bạn có chắc chắn muốn xóa lượt làm bài này khỏi lịch sử của mình?',
            async () => {
                try {
                    await deleteDoc(doc(db, "quiz_results", resultId));
                    showToast('Đã xóa lượt làm bài thành công!', 'success');
                    // Tải lại dữ liệu
                    await loadQuizHistory(quizId, userId);
                } catch (error) {
                    console.error("Lỗi khi xóa kết quả:", error);
                    showToast('Xóa thất bại. Vui lòng thử lại sau.', 'error');
                }
            }
        );
    });
    
    // Bắt sự kiện click nút xóa tất cả lịch sử bộ đề này
    btnClearAll.onclick = () => {
        showConfirmModal(
            'Xóa TOÀN BỘ lịch sử',
            'Bạn có chắc chắn muốn xóa tất cả các lượt làm bài của bộ đề này? Thao tác này sẽ dọn sạch toàn bộ kết quả của bạn.',
            async () => {
                try {
                    // Truy vấn tất cả document
                    const q = query(
                        collection(db, "quiz_results"),
                        where("quizId", "==", quizId),
                        where("userId", "==", userId)
                    );
                    const snapshot = await getDocs(q);
                    
                    if (snapshot.empty) return;
                    
                    // Thực hiện xóa song song
                    const deletePromises = [];
                    snapshot.forEach(docSnap => {
                        deletePromises.push(deleteDoc(doc(db, "quiz_results", docSnap.id)));
                    });
                    
                    await Promise.all(deletePromises);
                    showToast('Đã xóa sạch lịch sử làm bài!', 'success');
                    
                    // Cập nhật lại UI
                    await loadQuizHistory(quizId, userId);
                } catch (error) {
                    console.error("Lỗi khi xóa toàn bộ lịch sử:", error);
                    showToast('Xóa toàn bộ thất bại. Vui lòng thử lại.', 'error');
                }
            }
        );
    };
    
    // Đăng ký các sự kiện cho modal xác nhận
    btnConfirmCancel.onclick = closeConfirmModal;
    btnConfirmOk.onclick = () => {
        if (deleteCallback) deleteCallback();
        closeConfirmModal();
    };
}

// === CÁC HÀM TIỆN ÍCH TRẠNG THÁI GIAO DIỆN ===

function showLoadingState() {
    btnClearAll.classList.add('hidden');
    chartContainer.classList.add('hidden');
    historyList.innerHTML = `
        <div class="skeleton-list space-y-4">
            <div class="h-16 w-full skeleton rounded-xl"></div>
            <div class="h-16 w-full skeleton rounded-xl"></div>
            <div class="h-16 w-full skeleton rounded-xl"></div>
        </div>
    `;
    
    statAttempts.innerText = "--";
    statHighScore.innerText = "--";
    statHighScoreDetail.innerText = "Đang tải...";
    statAvgScore.innerText = "--";
    statAvgTime.innerText = "--";
}

function showEmptyState() {
    btnClearAll.classList.add('hidden');
    chartContainer.classList.add('hidden');
    
    historyList.innerHTML = `
        <div class="text-center py-10 px-4 bg-pink-50/50 rounded-2xl border border-pink-100 flex flex-col items-center justify-center">
            <div class="w-16 h-16 rounded-full bg-white flex items-center justify-center text-pink-300 shadow-sm border border-pink-100 mb-4 animate-bounce">
                <i class="fas fa-folder-open text-2xl"></i>
            </div>
            <h3 class="font-bold text-gray-700 text-lg mb-1">Chưa có lịch sử làm bài</h3>
            <p class="text-sm text-gray-400 max-w-sm mb-6 leading-relaxed">Bộ đề này vẫn chưa được thực hiện lần nào. Hãy nhấn làm bài để lưu lại kết quả và theo dõi tiến độ của bạn nhé!</p>
            <a href="quiz.html?id=${quizId}" class="cute-btn">
                <i class="fas fa-play"></i> Làm bài ngay
            </a>
        </div>
    `;
    
    statAttempts.innerText = "0";
    statHighScore.innerText = "0%";
    statHighScoreDetail.innerText = "Chưa có điểm";
    statAvgScore.innerText = "0%";
    statAvgTime.innerText = "--";
}

function showAuthError() {
    historyList.innerHTML = `
        <div class="text-center py-10 px-4 bg-red-50/50 rounded-2xl border border-red-100 flex flex-col items-center justify-center">
            <div class="w-16 h-16 rounded-full bg-white flex items-center justify-center text-red-400 shadow-sm border border-red-100 mb-4">
                <i class="fas fa-lock text-2xl"></i>
            </div>
            <h3 class="font-bold text-gray-700 text-lg mb-1">Yêu cầu đăng nhập</h3>
            <p class="text-sm text-gray-400 max-w-sm mb-6 leading-relaxed">Bạn cần đăng nhập tài khoản học tập để xem được lịch sử và quá trình ôn luyện bộ đề này.</p>
            <a href="index.html" class="cute-btn bg-gradient-to-r from-red-400 to-pink-500 shadow-red-200">
                <i class="fas fa-sign-in-alt"></i> Đăng nhập ngay
            </a>
        </div>
    `;
}

function showErrorState(message) {
    historyList.innerHTML = `
        <div class="text-center py-10 px-4 bg-red-50/50 rounded-2xl border border-red-100 flex flex-col items-center justify-center">
            <div class="w-16 h-16 rounded-full bg-white flex items-center justify-center text-red-400 shadow-sm border border-red-100 mb-4">
                <i class="fas fa-exclamation-circle text-2xl"></i>
            </div>
            <h3 class="font-bold text-gray-700 text-lg mb-1">Có lỗi xảy ra</h3>
            <p class="text-sm text-gray-400 max-w-sm leading-relaxed">${message}</p>
        </div>
    `;
}

// Hiển thị modal xác nhận xóa
function showConfirmModal(title, message, onOk) {
    confirmModalTitle.innerText = title;
    confirmModalMessage.innerText = message;
    deleteCallback = onOk;
    
    confirmModal.classList.remove('hidden');
    confirmModal.classList.add('flex');
    
    // Zoom anim entry
    setTimeout(() => {
        confirmModalBox.classList.remove('scale-95', 'opacity-0');
        confirmModalBox.classList.add('scale-100', 'opacity-100');
    }, 50);
}

// Đóng modal xác nhận
function closeConfirmModal() {
    confirmModalBox.classList.remove('scale-100', 'opacity-100');
    confirmModalBox.classList.add('scale-95', 'opacity-0');
    
    setTimeout(() => {
        confirmModal.classList.remove('flex');
        confirmModal.classList.add('hidden');
        deleteCallback = null;
    }, 200);
}

// === CÁC HÀM ĐỊNH DẠNG HỖ TRỢ ===

function formatDate(date) {
    const d = new Date(date);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    const hour = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    return `${day}/${month}/${year} ${hour}:${min}`;
}

// Format ngắn gọn: e.g. 2m 15s hoặc 45s
function formatTimeBrief(seconds) {
    if (seconds < 60) {
        return `${seconds}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

// Format chi tiết: e.g. 2 phút 15 giây
function formatTimeDetailed(seconds) {
    if (seconds < 60) {
        return `${seconds} giây`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins} phút ${secs} giây` : `${mins} phút`;
}
