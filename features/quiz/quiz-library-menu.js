// quiz-library-menu.js
// Xử lý nút ... và menu cho từng bộ đề trong thư viện

document.addEventListener('DOMContentLoaded', () => {
    // Đóng menu khi click ngoài
    document.body.addEventListener('click', (e) => {
        // Không đóng menu nếu bấm vào một nút trong .quiz-menu
        if (e.target.closest('.quiz-menu')) return;
        document.querySelectorAll('.quiz-menu').forEach(menu => menu.classList.add('hidden'));
    });

    // Uỷ quyền sự kiện cho quiz-list-container
    const quizListContainer = document.getElementById('quiz-list-container');
    if (!quizListContainer) return;

    quizListContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.quiz-menu-btn');
        if (btn) {
            e.stopPropagation();
            // Đóng tất cả menu khác trước
            document.querySelectorAll('.quiz-menu').forEach(menu => menu.classList.add('hidden'));
            // Hiện menu của card này
            const menu = btn.parentElement.querySelector('.quiz-menu');
            if (menu) menu.classList.toggle('hidden');
            return;
        }
        // Xem lịch sử làm bài
        const editContentBtn = e.target.closest('.edit-quiz-content-btn');
        if (editContentBtn) {
            const quizId = editContentBtn.getAttribute('data-id');
            window.location.href = `editor.html?id=${quizId}`;
            return;
        }
        const historyBtn = e.target.closest('.quiz-history-btn');
        if (historyBtn) {
            const quizId = historyBtn.getAttribute('data-id');
            window.location.href = `quiz-history.html?id=${quizId}`;
            return;
        }
    });
});
