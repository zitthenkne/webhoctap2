// room-study.js — ghi chú cá nhân + đánh dấu câu hỏi NGAY TRONG PHÒNG,
// dùng chung kho với trang làm bài (quiz.html) và flashcard:
//   localStorage quiz_notes_<quizId> / quiz_marks_<quizId>  (map theo nội dung câu hỏi)
//   Firestore quiz_study/{uid}__{quizId}                    (khi đã đăng nhập)
// Nhờ vậy ghi chú viết lúc đánh đề chung sẽ có sẵn khi tự ôn lại một mình.
import { studyKeys, scheduleCloudPush, syncPullStudy } from '../quiz/quiz-study-store.js';
import { room, uid, studyQuizId } from './room-state.js';

// Bản sao gọn của MARK_REASONS trong features/quiz/quiz-state.js (nguồn gốc ở đó).
export const MARK_REASONS = {
    hard: { label: 'Khó, quay lại sau', short: 'Khó', icon: 'fa-dumbbell', color: '#ef4444', bg: '#fee2e2', text: '#b91c1c' },
    doubt: { label: 'Tranh cãi đáp án', short: 'Tranh cãi', icon: 'fa-scale-balanced', color: '#f59e0b', bg: '#fef3c7', text: '#b45309' },
    interesting: { label: 'Hay, để dành xem lại', short: 'Hay', icon: 'fa-star', color: '#a855f7', bg: '#f3e8ff', text: '#7e22ce' },
    review: { label: 'Cần ôn lại', short: 'Ôn lại', icon: 'fa-rotate', color: '#3b82f6', bg: '#dbeafe', text: '#1d4ed8' },
};

const readMap = (key) => { try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { return {}; } };
const writeMap = (key, obj) => { try { localStorage.setItem(key, JSON.stringify(obj || {})); } catch (e) {} };
const keys = () => studyKeys(studyQuizId());

// Khách (chưa đăng nhập) chỉ lưu máy mình — không có uid thật để đẩy lên cloud.
const cloudUid = () => (room.user && !room.user.isGuest && !room.user.isAnonymous) ? uid() : null;
function push() {
    const u = cloudUid();
    if (u) scheduleCloudPush(u, studyQuizId());
}

export const getNote = (qText) => readMap(keys().notes)[qText] || '';
export function setNote(qText, text) {
    if (!qText) return;
    const k = keys().notes;
    const map = readMap(k);
    if (text && text.trim()) map[qText] = text; else delete map[qText];
    writeMap(k, map);
    push();
}

export const getMark = (qText) => readMap(keys().marks)[qText] || null;
export function setMark(qText, reason) {
    if (!qText) return;
    const k = keys().marks;
    const map = readMap(k);
    if (!reason || reason === '__unmark') delete map[qText]; else map[qText] = reason;
    writeMap(k, map);
    push();
}

// Kéo ghi chú/đánh dấu đã có trên cloud về máy này — 1 lần cho mỗi bộ đề.
let pulledFor = null;
export function pullStudyOnce() {
    const u = cloudUid();
    const id = studyQuizId();
    if (!u || pulledFor === id) return;
    pulledFor = id;
    syncPullStudy(u, id, { preferCloud: false })
        .then(() => document.dispatchEvent(new CustomEvent('room-study-pulled')))
        .catch(() => {});
}
