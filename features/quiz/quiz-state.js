// features/quiz/quiz-state.js

import { db, auth } from '../../core/firebase-init.js';
import { sessionUser } from '../../core/auth-session.js';
import { doc, getDoc, collection, addDoc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
// Ghi không treo khi mất mạng (xem core/offline-write.js)
import { queued } from "../../core/offline-write.js";
import { checkAndAwardAchievement } from '../../core/achievements.js';
import { showToast } from '../../core/utils.js';

// Các loại lý do đánh dấu câu hỏi (dùng chung cho lúc làm bài và màn tổng kết).
// Thứ tự khai báo cũng là thứ tự hiển thị trong menu / bộ lọc.
export const MARK_REASONS = {
    hard:        { label: 'Khó, quay lại làm sau', short: 'Khó',       icon: 'fa-dumbbell',        color: '#ef4444', bg: '#fee2e2', text: '#b91c1c' },
    doubt:       { label: 'Tranh cãi đáp án',       short: 'Tranh cãi', icon: 'fa-scale-balanced',  color: '#f59e0b', bg: '#fef3c7', text: '#b45309' },
    interesting: { label: 'Hay, để dành xem lại',   short: 'Hay',       icon: 'fa-star',            color: '#a855f7', bg: '#f3e8ff', text: '#7e22ce' },
    review:      { label: 'Cần ôn lại',             short: 'Ôn lại',    icon: 'fa-rotate',          color: '#3b82f6', bg: '#dbeafe', text: '#1d4ed8' },
};

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
    markedReasons: {},       // { [qIndex]: 'hard' | 'doubt' | 'interesting' | 'review' } lý do đánh dấu
    currentFontSize: localStorage.getItem('quiz_font_size') || 'normal',
    streak: 0,
    used5050Questions: {},
    focusMode: false,
    eliminatedAnswers: {},   // #4: { [qIndex]: [optIdx,...] } các đáp án bị gạch bỏ
    multiSelections: {},     // câu nhiều đáp án: { [qIndex]: [optIdx,...] } lựa chọn tạm CHƯA xác nhận
    confidence: {},          // #7: { [qIndex]: 'guess' } khi người dùng đánh dấu là đoán
    questionTimes: [],       // #11: số giây đã dùng cho từng câu
    _timingIndex: null,      // câu đang được tính giờ (runtime)
    _timingEnterAt: 0        // mốc thời gian vào câu hiện tại (runtime)
};

export function resetState() {
    state.currentIndex = 0;
    state.userAnswers = new Array(state.questions.length).fill(null);
    state.score = 0;
    state.quizStartTime = new Date();
    state.markedQuestions = [];
    state.markedReasons = {};
    state.streak = 0;
    state.used5050Questions = {};
    state.eliminatedAnswers = {};
    state.multiSelections = {};
    state.confidence = {};
    state.questionTimes = new Array(state.questions.length).fill(0);
    state._timingIndex = null;
    state._timingEnterAt = 0;
}

// Bài làm dở lưu THEO TỪNG BỘ ĐỀ. Trước đây mọi đề dùng chung một khóa 'quizState',
// nên chỉ cần mở đề khác là mất điểm dừng của đề đang làm.
const QUIZ_STATE_PREFIX = 'quizState_';

function stateQuizId() {
    return (state.quizData && state.quizData.id)
        || (new URLSearchParams(window.location.search)).get('id')
        || 'unknown';
}
function stateKey(quizId) { return QUIZ_STATE_PREFIX + (quizId || stateQuizId()); }

// Chuyển bản lưu kiểu cũ sang khóa theo đề — chạy một lần khi nạp module.
try {
    const legacy = localStorage.getItem('quizState');
    if (legacy) {
        const obj = JSON.parse(legacy);
        if (obj && obj.quizId) localStorage.setItem(stateKey(obj.quizId), legacy);
        localStorage.removeItem('quizState');
    }
} catch (_) { localStorage.removeItem('quizState'); }

export function readQuizState(quizId) {
    try { return JSON.parse(localStorage.getItem(stateKey(quizId)) || 'null'); }
    catch (_) { return null; }
}

// Chỉ dọn khi localStorage đầy: giữ 4 bài dở mới nhất, bỏ phần còn lại.
function pruneSavedStates(keepKey) {
    const rows = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || k === keepKey || !k.startsWith(QUIZ_STATE_PREFIX)) continue;
        let at = 0;
        try { at = JSON.parse(localStorage.getItem(k)).savedAt || 0; } catch (_) {}
        rows.push([k, at]);
    }
    rows.sort((a, b) => b[1] - a[1]).slice(3).forEach(([k]) => localStorage.removeItem(k));
}

export function saveQuizState() {
    const quizId = stateQuizId();
    const stateObj = {
        quizId,
        savedAt: Date.now(),
        currentIndex: state.currentIndex,
        userAnswers: state.userAnswers,
        score: state.score,
        streak: state.streak,
        markedQuestions: state.markedQuestions,
        markedReasons: state.markedReasons,
        eliminatedAnswers: state.eliminatedAnswers,
        used5050Questions: state.used5050Questions,
        multiSelections: state.multiSelections,
        confidence: state.confidence,
        questionTimes: state.questionTimes,
        quizStartTime: state.quizStartTime ? state.quizStartTime.toISOString() : null,
        questionsLength: state.questions.length,
        // Lưu nguyên bộ câu hỏi đang làm (đã trộn câu/đáp án) để khôi phục chính xác
        questions: state.questions,
        quizMode: state.quizMode,
        quizOptions: state.quizOptions
    };
    const key = stateKey(quizId);
    const write = () => localStorage.setItem(key, JSON.stringify(stateObj));
    try {
        write();
    } catch (e) {
        // Hết dung lượng: dọn bài dở cũ rồi thử lại, hết cách mới bỏ bộ câu hỏi
        try { pruneSavedStates(key); write(); return; } catch (_) {}
        console.warn('Không lưu được đầy đủ trạng thái quiz, lưu bản rút gọn:', e);
        delete stateObj.questions;
        try { write(); } catch (_) {}
    }
}

// Đánh dấu bài đã nộp để lần sau không hỏi "làm tiếp?" nữa.
export function markQuizStateFinished(quizId) {
    const saved = readQuizState(quizId);
    if (!saved) return;
    saved.finished = true;
    try { localStorage.setItem(stateKey(quizId), JSON.stringify(saved)); } catch (_) {}
}

export function clearQuizState(quizId) {
    localStorage.removeItem(stateKey(quizId));
}

export async function saveQuizResult(finalScore, totalQuestions, percentage, timeTaken) {
    const user = sessionUser();
    if (!user) return; // Không lưu kết quả cho khách

    try {
        const quizId = new URLSearchParams(window.location.search).get('id');
        await queued(addDoc(collection(db, "quiz_results"), {
            userId: user.uid,
            quizId: quizId,
            quizTitle: state.quizData.title, // Use the stored title
            score: finalScore,
            totalQuestions: totalQuestions,
            timeTaken: timeTaken,
            percentage: percentage,
            completedAt: new Date()
        }));
        // Kiểm tra thành tựu
        if (percentage === 100) await checkAndAwardAchievement(user.uid, 'GENIUS');
        if (totalQuestions >= 30) await checkAndAwardAchievement(user.uid, 'MARATHONER');
    } catch (error) {
        console.error("Lỗi khi lưu kết quả:", error);
        showToast('Không thể lưu kết quả của bạn.', 'error');
    }
}
