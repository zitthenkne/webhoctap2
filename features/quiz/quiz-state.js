// features/quiz/quiz-state.js

import { db, auth } from '../../core/firebase-init.js';
import { doc, getDoc, collection, addDoc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { checkAndAwardAchievement } from '../../core/achievements.js';
import { showToast } from '../../core/utils.js';

export const state = {
    quizData: null,          // Dữ liệu bộ đề từ Firestore
    questions: [],           // Các câu hỏi cho phiên làm bài hiện tại
    originalQuestions: [],   // Toàn bộ câu hỏi gốc
    currentIndex: 0,         // Vị trí câu hỏi hiện tại (CHO QUIZ)
    userAnswers: [],         // Mảng lưu câu trả lời của người dùng
    score: 0,                // Điểm số
    quizStartTime: null,     // Thời điểm bắt đầu
    quizTimerInterval: null, // Biến cho đồng hồ đếm giờ
    quizMode: 'normal',      // 'normal' hoặc 'practice'
    quizOptions: { isTimed: false, showAnswerImmediately: true, timedMinutes: 30 }, // To store session options
    markedQuestions: [],
    currentFontSize: localStorage.getItem('quiz_font_size') || 'normal',
    streak: 0,
    used5050Questions: {},
    focusMode: false
};

export function resetState() {
    state.currentIndex = 0;
    state.userAnswers = new Array(state.questions.length).fill(null);
    state.score = 0;
    state.quizStartTime = new Date();
    state.markedQuestions = [];
    state.streak = 0;
    state.used5050Questions = {};
}

export function saveQuizState() {
    const quizId = (state.quizData && state.quizData.id) || (new URLSearchParams(window.location.search)).get('id');
    const stateObj = {
        quizId,
        currentIndex: state.currentIndex,
        userAnswers: state.userAnswers,
        score: state.score,
        markedQuestions: state.markedQuestions,
        quizStartTime: state.quizStartTime ? state.quizStartTime.toISOString() : null,
        questionsLength: state.questions.length
    };
    localStorage.setItem('quizState', JSON.stringify(stateObj));
}

export function clearQuizState() {
    localStorage.removeItem('quizState');
}

export async function saveQuizResult(finalScore, totalQuestions, percentage, timeTaken) {
    const user = auth.currentUser;
    if (!user) return; // Không lưu kết quả cho khách

    try {
        const quizId = new URLSearchParams(window.location.search).get('id');
        await addDoc(collection(db, "quiz_results"), {
            userId: user.uid,
            quizId: quizId,
            quizTitle: state.quizData.title, // Use the stored title
            score: finalScore,
            totalQuestions: totalQuestions,
            timeTaken: timeTaken,
            percentage: percentage,
            completedAt: new Date()
        });
        // Kiểm tra thành tựu
        if (percentage === 100) await checkAndAwardAchievement(user.uid, 'GENIUS');
        if (totalQuestions >= 30) await checkAndAwardAchievement(user.uid, 'MARATHONER');
    } catch (error) {
        console.error("Lỗi khi lưu kết quả:", error);
        showToast('Không thể lưu kết quả của bạn.', 'error');
    }
}
