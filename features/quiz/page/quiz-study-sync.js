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
export function pullStudyFromCloud(quizId) {
    const run = (uid) => {
        if (_studyPulled || !uid) return;
        _studyPulled = true;
        syncPullStudy(uid, quizId, { preferCloud: false }).then(() => {
            // Sao lưu ngay bản đã hợp nhất (đề phòng ghi chú cũ chỉ có ở máy này)
            scheduleCloudPush(uid, quizId, 800);
            // Nếu đang hiển thị một câu hỏi, vẽ lại để áp dụng ghi chú/annotation mới kéo về
            const sec = document.getElementById('quizSection');
            if (state.questions && state.questions.length && sec && !sec.classList.contains('hidden')) {
                try { showQuestion(); } catch (e) {}
            }
        });
    };
    if (auth.currentUser) run(auth.currentUser.uid);
    else onAuthStateChanged(auth, (u) => { if (u) run(u.uid); });
}
