// File: achievements.js
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
// Ghi không treo khi mất mạng (xem core/offline-write.js)
import { setDocQ as setDoc } from "./offline-write.js";
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

// Thành tựu đã có được nhớ trong máy: trước đây MỖI lần nộp bài ≥30 câu (hoặc 100%) là một getDoc dù đã mở khóa từ lâu.
const knownKey = (uid) => `achvKnown_${uid}`;
const readKnown = (uid) => { try { return JSON.parse(localStorage.getItem(knownKey(uid)) || '{}') || {}; } catch (e) { return {}; } };
const rememberKnown = (uid, id) => { try { const k = readKnown(uid); k[id] = 1; localStorage.setItem(knownKey(uid), JSON.stringify(k)); } catch (e) { /* hết dung lượng: chịu */ } };

// Hàm chung để kiểm tra và trao thành tựu
export async function checkAndAwardAchievement(userId, achievementId) {
    if (readKnown(userId)[achievementId]) return false;
    if (!navigator.onLine) return false;      // không đọc được thành tựu khi mất mạng (getDoc ném lỗi) — điều kiện còn nguyên nên lần nộp/tạo sau có mạng sẽ trao
    const achievementRef = doc(db, 'users', userId, 'achievements', achievementId);
    const achievementSnap = await getDoc(achievementRef);

    if (!achievementSnap.exists()) {
        await setDoc(achievementRef, { unlockedAt: new Date() });
        rememberKnown(userId, achievementId);
        const achievement = achievements[achievementId];
        showToast(`Chúc mừng! Bạn đã mở khóa thành tựu: "${achievement.name}"!`, 'success');
        return true; // Trả về true nếu thành tựu mới được trao
    }
    rememberKnown(userId, achievementId);
    return false; // Trả về false nếu đã có
}