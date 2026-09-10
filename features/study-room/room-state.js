// room-state.js — kho trạng thái dùng chung cho phòng học (members / session / room doc).
// Mọi module con đọc `room` và đăng ký `subscribe()` thay vì tự nghe Firestore lần nữa.
import { db } from '../../core/firebase-init.js';
import { doc, collection } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";

export const room = {
    roomId: null,
    user: null,
    isOwner: false,      // chủ phòng (owner trong doc study_rooms)
    roomDoc: null,
    members: [],         // [{uid, displayName, online, answers, hand, reaction, ...}]
    session: null,       // study_rooms/{id}/quizSession/current
};

const subs = new Set();
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
export function setState(patch) {
    Object.assign(room, patch);
    subs.forEach(fn => { try { fn(room); } catch (e) { console.error(e); } });
}

export const refs = {
    room: () => doc(db, 'study_rooms', room.roomId),
    members: () => collection(db, 'study_rooms', room.roomId, 'members'),
    member: (uid) => doc(db, 'study_rooms', room.roomId, 'members', uid || room.user.uid),
    messages: () => collection(db, 'study_rooms', room.roomId, 'messages'),
    session: () => doc(db, 'study_rooms', room.roomId, 'quizSession', 'current'),
};

// --- Vai trò ---
export const uid = () => room.user?.uid || null;
export const isHost = () => !!(room.session?.hostId && room.session.hostId === uid());
export const isCohost = () => !!(room.session?.cohosts || []).includes(uid());
// "Chủ trì": người điều khiển phiên. Chủ phòng luôn có quyền để không bị kẹt khi host thoát.
export const canControl = () => isHost() || isCohost() || room.isOwner;

// --- Phiên đánh đề ---
export const hasSession = () => !!(room.session?.questions?.length);
export const myMember = () => room.members.find(m => m.uid === uid()) || null;
export const memberOf = (id) => room.members.find(m => m.uid === id) || null;

// Bộ đề trong dự án có 2 quy ước field (footgun toàn dự án):
// answers/correctAnswerIndex (0-based) hoặc options/answer (1-based, file Excel).
export const optsOf = (q) => Array.isArray(q?.answers) ? q.answers : (Array.isArray(q?.options) ? q.options : []);
export const refIdxOf = (q) => {
    if (typeof q?.correctAnswerIndex === 'number') return q.correctAnswerIndex;
    if (typeof q?.answer === 'number') return q.answer - 1;
    return null;
};
// ĐÁP ÁN TRONG FILE CHỈ LÀ THAM KHẢO: không bao giờ tự hiện.
// Một câu chỉ được "công bố" khi chủ trì CHỐT (session.chosen.q<i>) — lúc đó mới
// chấm điểm, mới hiện giải thích và mới đối chiếu với đáp án tham khảo.
export const qKey = (i) => 'q' + i;
export const chosenOf = (i) => {
    const c = room.session?.chosen?.[qKey(i)];
    return typeof c === 'number' ? c : null;
};
export const isAnnounced = (i) => chosenOf(i) !== null;
export const noteOf = (i) => room.session?.notes?.[qKey(i)] || '';
// Giải thích riêng cho từng phương án (như trang quiz.html): notes riêng theo câu + phương án
export const optNoteOf = (i, k) => room.session?.optNotes?.[qKey(i)]?.['o' + k] || '';
export const correctIdxOf = (q, i) => {
    const c = chosenOf(i);
    if (c !== null) return c;
    if (typeof q?.selected === 'number') return q.selected;   // phiên cũ trước bản nâng cấp
    return null;                                              // KHÔNG lấy đáp án file
};

// --- Chế độ phòng ---
// 'coop' (mặc định): mỗi người tự làm theo tốc độ của mình, chủ trì chỉ đặt câu đang bàn
//                    và chốt đáp án cuối — hợp với kiểu ngồi cạnh nhau, mỗi người một máy.
// 'lead'           : chủ trì cầm trịch (khóa nộp, hẹn giờ, cả phòng bám theo câu của chủ trì).
export const modeOf = () => room.session?.mode || 'coop';
export const isCoop = () => modeOf() === 'coop';
// Ai cũng tự di chuyển được, trừ chế độ cầm trịch mà chủ trì không cho xem tự do
export const canRoam = () => isCoop() || !!room.session?.freeRoam || canControl();

export const currentIndex = () => room.session?.currentQuestionIndex || 0;
export const answerOf = (member, i) => member?.answers?.[qKey(i)] || null;
export const flagOf = (member, i) => !!member?.flags?.[qKey(i)];
export const markOf = (member, i) => member?.marks?.[qKey(i)] || null;
export const readyOf = (member, i) => !!member?.ready?.[qKey(i)];
// Lý do chọn (mỗi người tự ghi) và "bảo lưu ý kiến" khi không đồng tình với đáp án nhóm chốt
export const whyOf = (member, i) => answerOf(member, i)?.why || '';
export const dissentOf = (member, i) => !!member?.dissent?.[qKey(i)];
export const unclearOf = (member, i) => !!member?.unclear?.[qKey(i)];

// --- Hai nấc công bố ---
// 1) "Hiện đáp án": chủ trì cho cả phòng xem đáp án THAM KHẢO trong file (chưa tính điểm).
// 2) "Chốt đáp án": cả phòng thống nhất -> mới chấm điểm.
export const isShown = (i) => !!room.session?.shown?.[qKey(i)] || isAnnounced(i);

// --- Nội dung câu hỏi có thể được CẢ NHÓM sửa ngay trong phòng ---
// Bản sửa nằm ở session.edits.q<i> = { question, options:[…] }, không đụng mảng questions gốc.
export const editOf = (i) => room.session?.edits?.[qKey(i)] || null;
export function questionAt(i) {
    const base = room.session?.questions?.[i] || null;
    if (!base) return null;
    const e = editOf(i);
    if (!e) return base;
    const merged = { ...base };
    if (typeof e.question === 'string' && e.question.trim()) merged.question = e.question;
    if (Array.isArray(e.options) && e.options.length) {
        if (Array.isArray(base.answers)) merged.answers = e.options; else merged.options = e.options;
    }
    return merged;
}
export const issueOf = (i) => room.session?.issues?.[qKey(i)] || '';
// Ai cũng được sửa giải thích / nội dung câu — chủ trì gõ không kịp thì người khác đỡ.
export const canEditContent = () => hasSession();
// Ai đang gõ giải thích câu này (nhịp 4s, quá 9s coi như thôi)
export const editorOf = (i) => {
    const e = room.session?.editing?.[qKey(i)];
    return (e && e.uid !== uid() && Date.now() - (e.at || 0) < 9000) ? e : null;
};
export const noteAuthorOf = (i) => room.session?.notesBy?.[qKey(i)] || null;
// Đồng hồ "bàn luận" của cả nhóm (khác đồng hồ làm bài) + kết quả vòng bầu trước
export const talkUntil = () => room.session?.talkUntil || 0;
export const prevVoteOf = (i) => room.session?.prevVote?.[qKey(i)] || null;
// Khóa dữ liệu học tập cá nhân: dùng chung với trang làm bài nếu đề lấy từ thư viện
export const studyQuizId = () => room.session?.sourceQuizId || `room_${room.roomId}`;
