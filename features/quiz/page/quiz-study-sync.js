// File: features/quiz/page/quiz-study-sync.js
// Đồng bộ "dữ liệu học tập" (ghi chú / đánh dấu / bôi vàng) giữa localStorage và cloud.
// Tách từ quiz-page.js — logic giữ nguyên.

import { auth } from '../../../core/firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import { studyKeys, syncPullStudy, scheduleCloudPush } from '../quiz-study-store.js';
import { state } from '../quiz-state.js';
import { showQuestion } from './quiz-question-view.js';

export function currentQuizId() {
    return (state.quizData && state.quizData.id) || (new URLSearchParams(window.location.search)).get('id') || 'default_quiz';
}
// Gọi sau mỗi lần ghi chú / đánh dấu / annotation thay đổi localStorage.
export function pushStudyToCloud() {
    const uid = auth.currentUser && auth.currentUser.uid;
    if (uid) scheduleCloudPush(uid, currentQuizId());
}
// Lưu/bỏ đánh dấu BỀN theo nội dung câu hỏi (để trang Lịch sử đọc lại được).
// Khác với state.markedReasons (theo chỉ số phiên, bị xóa khi nộp bài).
export function persistMarkByText(qText, reason) {
    if (!qText) return;
    const key = studyKeys(currentQuizId()).marks;
    let store = {};
    try { store = JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) {}
    if (reason === '__unmark' || !reason) delete store[qText];
    else store[qText] = reason;
    try { localStorage.setItem(key, JSON.stringify(store)); } catch (e) {}
    pushStudyToCloud();
}

// Kéo dữ liệu học tập từ cloud về máy này (chạy 1 lần khi đã biết người dùng).
// Gọi ngay nếu đã đăng nhập; nếu auth resolve muộn thì chờ qua onAuthStateChanged.
let _studyPulled = false;
let _studyPullPromise = null;

// Chờ tới khi bản kéo cloud đầu tiên hoàn tất (hoặc hết timeout — mạng chậm/offline
// thì dùng dữ liệu local, không treo). Dùng trước khi build hàng đợi ôn ngắt quãng
// để lịch ôn trên máy mới lấy đúng từ Firestore thay vì coi tất cả là câu mới.
export function whenStudyPulled(timeoutMs = 4000) {
    if (!_studyPullPromise) {
        // Chưa có phiên kéo nào (khách / auth chưa resolve) → chờ ngắn cho auth kịp
        // khởi động phiên kéo, hết thời gian thì thôi.
        return new Promise((resolve) => {
            const t0 = Date.now();
            const tick = () => {
                if (_studyPullPromise) {
                    Promise.race([
                        _studyPullPromise,
                        new Promise(r => setTimeout(r, Math.max(0, timeoutMs - (Date.now() - t0)))),
                    ]).then(resolve);
                } else if (Date.now() - t0 >= Math.min(1500, timeoutMs) || !navigator.onLine) {
                    resolve(); // khách hoặc offline — đi tiếp với local
                } else {
                    setTimeout(tick, 100);
                }
            };
            tick();
        });
    }
    return Promise.race([_studyPullPromise, new Promise(r => setTimeout(r, timeoutMs))]);
}

export function pullStudyFromCloud(quizId) {
    const run = (uid) => {
        if (_studyPulled || !uid) return;
        _studyPulled = true;
        _studyPullPromise = syncPullStudy(uid, quizId, { preferCloud: false }).then(() => {
            // Sao lưu ngay bản đã hợp nhất (đề phòng ghi chú cũ chỉ có ở máy này)
            scheduleCloudPush(uid, quizId, 800);
            // Nếu đang hiển thị một câu hỏi, vẽ lại để áp dụng ghi chú/annotation mới kéo về
            const sec = document.getElementById('quizSection');
            if (state.questions && state.questions.length && sec && !sec.classList.contains('hidden')) {
                try { showQuestion(); } catch (e) {}
            }
            // Báo cho các UI đọc dữ liệu học tập (card Ôn ngắt quãng...) vẽ lại
            document.dispatchEvent(new CustomEvent('quiz-study-pulled'));
        });
    };
    if (auth.currentUser) run(auth.currentUser.uid);
    else onAuthStateChanged(auth, (u) => { if (u) run(u.uid); });
}
