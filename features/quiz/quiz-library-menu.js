// quiz-library-menu.js
// Xử lý nút ... và menu cho từng bộ đề trong thư viện

document.addEventListener('DOMContentLoaded', () => {
    // Hạ z-index của mọi thẻ đang được nâng lên (khi đóng menu)
    const lowerAllCards = () => {
        document.querySelectorAll('.quiz-card-menu-open').forEach(c => c.classList.remove('quiz-card-menu-open'));
    };

    // Đóng menu khi click ngoài
    document.body.addEventListener('click', (e) => {
        // Không đóng menu nếu bấm vào một nút trong .quiz-menu
        if (e.target.closest('.quiz-menu')) return;
        document.querySelectorAll('.quiz-menu').forEach(menu => menu.classList.add('hidden'));
        lowerAllCards();
    });

    // Uỷ quyền sự kiện cho quiz-list-container
    const quizListContainer = document.getElementById('quiz-list-container');
    if (!quizListContainer) return;

    quizListContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.quiz-menu-btn');
        if (btn) {
            e.stopPropagation();
            const menu = btn.parentElement.querySelector('.quiz-menu');
            const willOpen = menu && menu.classList.contains('hidden'); // đang ẩn -> sắp mở
            // Đóng tất cả menu khác + hạ mọi thẻ về z-index thường
            document.querySelectorAll('.quiz-menu').forEach(m => m.classList.add('hidden'));
            lowerAllCards();
            // Mở menu của thẻ này và nâng cả thẻ lên TRÊN mọi thẻ khác (tránh bị che)
            if (menu && willOpen) {
                menu.classList.remove('hidden');
                const card = btn.closest('.quiz-grid-card, .quiz-list-card');
                if (card) card.classList.add('quiz-card-menu-open');
            }
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
