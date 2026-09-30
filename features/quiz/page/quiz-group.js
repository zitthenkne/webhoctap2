// quiz-group.js — "Làm cùng nhau": mở đề đang làm 1 mình sang phòng đánh đề (features/study-room).
// Một hộp (pickRoom của rooms-hub.js, dùng lại hộp Tạo phòng ở trang chủ): chọn Đánh tiếp / Làm lại từ đầu
// + chọn phòng mình làm chủ hoặc tạo phòng mới với mã tự đặt -> study-room.html?id=&quiz=&start=resume|fresh.
// Đánh tiếp: phòng đọc thẳng bài dở quizState_<id> (cùng máy, room-quiz.js startFromSolo) -> giữ câu
// đang làm, đáp án đã chọn, bài tự luận; ghi chú + đánh dấu vốn dùng chung kho nên tự theo sang.
import { sessionUser } from '../../../core/auth-session.js';
import { showToast } from '../../../core/utils.js';
import { state, saveQuizState, readQuizState } from '../quiz-state.js';

const quizIdOf = () => (state.quizData && state.quizData.id) || new URLSearchParams(location.search).get('id');

function loadHubCss() {
    if (document.getElementById('rooms-hub-css')) return;
    const link = Object.assign(document.createElement('link'), { id: 'rooms-hub-css', rel: 'stylesheet', href: '../study-room/rooms-hub.css?v=2' });
    document.head.appendChild(link);
}

export async function openInRoom() {
    const user = sessionUser();
    if (!user || user.isAnonymous) return showToast('Đăng nhập để mở phòng làm cùng nhau.', 'warning');
    if (!navigator.onLine) return showToast('Cần có mạng để mở phòng làm cùng nhau.', 'warning');
    const quizId = quizIdOf();
    if (!quizId) return;
    const title = String((state.quizData && state.quizData.title) || 'Đề ôn tập').trim();

    // Đang làm bài thì ghi bản mới nhất trước (phòng đọc bản này); ở trang chờ thì dùng bài dở đã lưu
    try { if (sessionStorage.getItem('quizLive') === quizId) saveQuizState(); } catch (e) {}
    const saved = readQuizState(quizId);
    const done = saved && !saved.finished && saved.questions?.length
        ? (saved.userAnswers || []).filter(a => a != null).length : 0;
    const choices = done
        ? [{ v: 'resume', label: `Đánh tiếp · câu ${(saved.currentIndex | 0) + 1}/${saved.questions.length} (đã làm ${done})`, on: true },
            { v: 'fresh', label: 'Làm lại từ đầu' }]
        : [];

    loadHubCss();
    const { pickRoom } = await import('../../study-room/rooms-hub.js');
    const r = await pickRoom({ user, name: title, choices });
    if (!r) return;
    const q = new URLSearchParams({ id: r.id, quiz: quizId, start: r.choice === 'resume' ? 'resume' : 'fresh', title: title.slice(0, 120) });
    location.href = `../study-room/study-room.html?${q}`;
}
