/* =====================================================================
   quiz-ceramic.js — lớp trang trí RIÊNG cho giao diện Ceramic Kintsugi.
   Core (tải đề, chấm điểm, timer...) vẫn do quiz-page.js lo. File này chỉ:
     1. Đổi giao diện (Theme Switcher) sang bản Gốc/Classic.
     2. Gắn các asset PNG gốm (badge chế độ, não SRS) vào đúng chỗ.
   Không thao tác gì lên logic làm bài → không đụng file classic.
   ===================================================================== */
(function () {
  'use strict';

  // --- Theme Switcher: chuyển qua lại giữa Ceramic <-> Classic, giữ query param ---
  function switchQuizTheme(targetMode) {
    try { localStorage.setItem('quiz_theme_mode', targetMode); } catch (e) {}
    var params = window.location.search || '';
    var target = targetMode === 'ceramic' ? 'quiz-ceramic.html' : 'quiz.html';
    window.location.href = target + params;
  }
  window.switchQuizTheme = switchQuizTheme;

  document.addEventListener('DOMContentLoaded', function () {
    // Nút "Giao diện: Gốc (Classic)" đã có sẵn trong HTML
    var switchBtn = document.getElementById('ceramic-theme-switch-btn');
    if (switchBtn) switchBtn.addEventListener('click', function () { switchQuizTheme('classic'); });

    // Gắn badge gốm 3D vào 3 tile chế độ (thay emoji — DESIGN cấm emoji làm icon)
    var BADGE = {
      exam: 'web_assets/badge_ceramic_exam.png',
      study: 'web_assets/badge_ceramic_study.png',
      sprint: 'web_assets/badge_ceramic_sprint.png'
    };
    var LABEL = { exam: 'Thi thử', study: 'Ôn tập', sprint: 'Học nhanh' };
    document.querySelectorAll('#quiz-mode-presets .mode-preset').forEach(function (tile) {
      var mode = tile.getAttribute('data-mode');
      var ic = tile.querySelector('.mp-ic');
      if (ic && BADGE[mode]) {
        ic.textContent = '';
        var img = document.createElement('img');
        img.src = BADGE[mode];
        img.alt = 'Biểu tượng gốm ' + (LABEL[mode] || mode);
        ic.appendChild(img);
      }
    });

    // Não gốm SRS: gắn cạnh tiêu đề mục "Ôn ngắt quãng"
    var srsCount = document.getElementById('srs-due-count');
    var srsHeader = srsCount ? srsCount.closest('div') : null;
    if (srsHeader && !srsHeader.querySelector('.ceramic-srs-badge')) {
      var brain = document.createElement('img');
      brain.src = 'web_assets/brain_ceramic_srs.png';
      brain.alt = 'Kho câu hỏi Spaced Repetition (SRS)';
      brain.className = 'ceramic-srs-badge mr-2';
      srsHeader.insertBefore(brain, srsHeader.firstChild);
    }
  });
})();
