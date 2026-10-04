// features/quiz/quiz-state.js

import { db, auth } from '../../core/firebase-init.js';
import { sessionUser } from '../../core/auth-session.js';
import { doc, getDoc, collection, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
// Ghi không treo khi mất mạng (xem core/offline-write.js)
import { queued } from "../../core/offline-write.js";
import { checkAndAwardAchievement } from '../../core/achievements.js';
import { showToast } from '../../core/utils.js';
import { scheduleCloudProgressPush, clearCloudProgress } from './quiz-study-store.js';

// Các loại lý do đánh dấu câu hỏi (dùng chung cho lúc làm bài và màn tổng kết).
// Thứ tự khai báo cũng là thứ tự hiển thị trong menu / bộ lọc.
export const MARK_REASONS = {
    // Tông pastel KHÔNG trùng nghĩa đúng/sai/đang chọn (đỏ/xanh lá/xanh dương) của trang làm bài
    hard:        { label: 'Khó, quay lại làm sau', short: 'Khó',       icon: 'fa-dumbbell',        color: '#F08A4B', bg: '#FFE8D9', text: '#A34A12' },
    doubt:       { label: 'Tranh cãi đáp án',       short: 'Tranh cãi', icon: 'fa-scale-balanced',  color: '#E0A91A', bg: '#FFF3CC', text: '#8C6500' },
    interesting: { label: 'Hay, để dành xem lại',   short: 'Hay',       icon: 'fa-star',            color: '#9D7FE8', bg: '#EFE9FD', text: '#6A4FB8' },
    review:      { label: 'Cần ôn lại',             short: 'Ôn lại',    icon: 'fa-rotate',          color: '#F27BA8', bg: '#FFE3EE', text: '#B23A6C' },
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

export function writeQuizState(quizId, stateObj) {
    if (!stateObj) return;
    const key = stateKey(quizId);
    try {
        localStorage.setItem(key, JSON.stringify(stateObj));
    } catch (e) {
        try {
            pruneSavedStates(key);
            localStorage.setItem(key, JSON.stringify(stateObj));
        } catch (_) {
            const compact = { ...stateObj };
            delete compact.questions;
            try { localStorage.setItem(key, JSON.stringify(compact)); } catch (_) {}
        }
    }
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
    // Tạo blueprint nhẹ (chỉ số câu gốc + thứ tự đáp án đã xáo)
    // Blueprint này chỉ nặng ~1-2KB, hoàn toàn không sợ đầy bộ nhớ hay giới hạn Firestore
    const questionBlueprint = (state.questions || []).map((q, idx) => ({
        origIdx: (typeof q.__origIdx === 'number') ? q.__origIdx : idx,
        optOrder: Array.isArray(q.__optOrder) ? q.__optOrder : null,
        caseId: q.caseId || null
    }));

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
        caseSeen: state.caseSeen,     // ca mở dần: câu xa nhất đã xem của từng ca (quiz-essay.js)
        questionTimes: state.questionTimes,
        quizStartTime: state.quizStartTime ? state.quizStartTime.toISOString() : null,
        questionsLength: state.questions.length,
        questionBlueprint,
        // Lưu nguyên bộ câu hỏi đang làm nếu vừa bộ nhớ, kèm blueprint để khôi phục chắc chắn
        questions: state.questions,
        quizMode: state.quizMode,
        quizOptions: state.quizOptions,
        // Giây còn lại của đồng hồ đếm ngược (null = không tính giờ)
        timeLeft: state.quizTimerInterval ? state.timeLeft : null
    };

    writeQuizState(quizId, stateObj);

    // Tự động đồng bộ tiến trình lên Cloud nếu đã đăng nhập (chạy debounce nền)
    try {
        const u = sessionUser();
        if (u && u.uid && !stateObj.finished) {
            scheduleCloudProgressPush(u.uid, quizId, () => readQuizState(quizId));
        }
    } catch (_) {}
}

// Đánh dấu bài đã nộp để lần sau không hỏi "làm tiếp?" nữa (cả local và cloud).
export function markQuizStateFinished(quizId) {
    const id = quizId || stateQuizId();
    const saved = readQuizState(id);
    if (saved) {
        saved.finished = true;
        saved.savedAt = Date.now();
        writeQuizState(id, saved);
    }
    try {
        const u = sessionUser();
        if (u && u.uid) clearCloudProgress(u.uid, id);
    } catch (_) {}
}

export function clearQuizState(quizId) {
    const id = quizId || stateQuizId();
    localStorage.removeItem(stateKey(id));
    try {
        const u = sessionUser();
        if (u && u.uid) clearCloudProgress(u.uid, id);
    } catch (_) {}
}

let lastResultRef = null;
let resultUpdateTimer = null;
// Điểm đổi sau khi đã lưu (tự chấm tự luận) -> ghi đè điểm của bản vừa lưu, gom nhiều lần tick thành 1 lần ghi
export function updateQuizResultScore(score, totalQuestions, percentage) {
    if (!lastResultRef) return;
    const ref = lastResultRef;
    clearTimeout(resultUpdateTimer);
    resultUpdateTimer = setTimeout(() => {
        queued(updateDoc(ref, { score, totalQuestions, percentage }))
            .catch(err => console.error('Lỗi cập nhật điểm tự luận:', err));
    }, 1200);
}

export async function saveQuizResult(finalScore, totalQuestions, percentage, timeTaken) {
    const user = sessionUser();
    if (!user) return; // Không lưu kết quả cho khách

    try {
        const quizId = new URLSearchParams(window.location.search).get('id');
        // Tạo sẵn id để tự chấm tự luận ở màn kết quả còn cập nhật được đúng bản này
        const ref = doc(collection(db, "quiz_results"));
        lastResultRef = ref;
        await queued(setDoc(ref, {
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
