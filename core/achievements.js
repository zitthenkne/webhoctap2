// File: achievements.js
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { db } from './firebase-init.js';
import { showToast } from './utils.js';

// Định nghĩa các thành tựu (Achievements) - Nơi duy nhất để quản lý
export const achievements = {
    'COLLECTOR': { name: 'Nhà Sưu Tầm', description: 'Lưu 5 bộ đề.', icon: 'fa-gem', img: 'assets/achievement_collector.png' },
    'GENIUS': { name: 'Siêu Trí Tuệ', description: 'Đạt 100% bài kiểm tra.', icon: 'fa-brain', img: 'assets/achievement_genius.png' },
    'MARATHONER': { name: 'Marathon-er', description: 'Hoàn thành bài trên 30 câu.', icon: 'fa-running', img: 'assets/achievement_marathoner.png' }, // Giữ lại Marathon-er vì nó không liên quan đến tạo bộ đề
    'PIONEER': { name: 'Người Tiên Phong', description: 'Tạo bộ đề đầu tiên của bạn.', icon: 'fa-flag', img: 'assets/achievement_pioneer.png' },
    // Thêm các thành tựu khác tại đây
    'DAILY_STREAK_3': { name: 'Chuỗi 3 ngày', description: 'Đăng nhập 3 ngày liên tiếp.', icon: 'fa-calendar-check', img: 'assets/achievement_streak.png' },
};

// Hàm chung để kiểm tra và trao thành tựu
export async function checkAndAwardAchievement(userId, achievementId) {
    const achievementRef = doc(db, 'users', userId, 'achievements', achievementId);
    const achievementSnap = await getDoc(achievementRef);

    if (!achievementSnap.exists()) {
        await setDoc(achievementRef, { unlockedAt: new Date() });
        const achievement = achievements[achievementId];
        showToast(`Chúc mừng! Bạn đã mở khóa thành tựu: "${achievement.name}"!`, 'success');
        return true; // Trả về true nếu thành tựu mới được trao
    }
    return false; // Trả về false nếu đã có
}