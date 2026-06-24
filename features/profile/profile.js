import { auth, db } from '../../core/firebase-init.js';
import { updateProfile, updatePassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import { doc, updateDoc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { showConfirm } from '../../core/utils.js';

const avatarEl = document.getElementById('profile-avatar');
const avatarIconEl = document.getElementById('avatar-icon');
const avatarBgColorInput = document.getElementById('avatar-bgcolor');
const avatarAnimalInput = document.getElementById('avatar-animal');
const animalGrid = document.getElementById('animal-grid');
const colorGrid = document.getElementById('color-grid');
const shuffleBtn = document.getElementById('shuffle-avatar-btn');
const nameInput = document.getElementById('profile-name');
const namePreview = document.getElementById('display-name-preview');
const emailInput = document.getElementById('profile-email');
const passwordInput = document.getElementById('profile-password');
const togglePasswordBtn = document.getElementById('toggle-password-btn');
const togglePwSectionBtn = document.getElementById('toggle-password-section-btn');
const pwSection = document.getElementById('password-section');
const pwChevron = document.getElementById('password-chevron');
const saveBtn = document.getElementById('save-profile-btn');
const logoutBtn = document.getElementById('logout-btn');
const messageEl = document.getElementById('profile-message');
const greetingEl = document.getElementById('greeting');
const unsavedBadge = document.getElementById('unsaved-badge');

// Thẻ thống kê
const statMemberSince = document.getElementById('stat-member-since');
const statQuizSets = document.getElementById('stat-quiz-sets');
const statAttempts = document.getElementById('stat-attempts');
const statAvg = document.getElementById('stat-avg');

const ANIMALS = ['🐱', '🐶', '🐰', '🦊', '🐻', '🐼', '🦁', '🐸', '🐵', '🦉', '🐿️', '🐯', '🐨', '🐧', '🐹', '🐮', '🐷', '🦄', '🐳', '🦋', '🐢'];
const COLORS = ['#FF69B4', '#F472B6', '#D8BFD8', '#A78BFA', '#8B5CF6', '#60A5FA', '#38BDF8', '#34D399', '#10B981', '#FBBF24', '#F59E0B', '#FB7185', '#EF4444', '#F97316'];

let currentUser = null;
let initialState = null; // { name, color, animal } để phát hiện thay đổi chưa lưu

function showMessage(msg, type = 'info') {
    if (!messageEl) return;
    const tones = {
        info: 'bg-blue-50 text-blue-600 border border-blue-100',
        success: 'bg-green-50 text-green-600 border border-green-100',
        error: 'bg-red-50 text-red-600 border border-red-100'
    };
    const icons = { info: 'fa-circle-info', success: 'fa-circle-check', error: 'fa-circle-exclamation' };
    messageEl.className = `mt-4 text-sm font-semibold rounded-xl px-4 py-2.5 text-center ${tones[type] || tones.info}`;
    messageEl.innerHTML = `<i class="fas ${icons[type] || icons.info} mr-1.5"></i>${msg}`;
    messageEl.classList.remove('hidden');
}

// --- Phát hiện thay đổi chưa lưu ---
function isDirty() {
    if (!initialState) return false;
    return nameInput.value.trim() !== initialState.name
        || avatarBgColorInput.value.toLowerCase() !== initialState.color.toLowerCase()
        || avatarAnimalInput.value !== initialState.animal
        || passwordInput.value.length > 0;
}
function refreshDirty() {
    if (unsavedBadge) unsavedBadge.classList.toggle('hidden', !isDirty());
}

// --- Cập nhật xem trước avatar ---
function popAvatar() {
    avatarEl.classList.remove('avatar-pop');
    void avatarEl.offsetWidth; // ép trình duyệt chạy lại animation
    avatarEl.classList.add('avatar-pop');
}
function setAnimal(animal, animate = false) {
    avatarAnimalInput.value = animal;
    avatarIconEl.textContent = animal;
    animalGrid.querySelectorAll('.animal-option').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.animal === animal);
    });
    if (animate) popAvatar();
    refreshDirty();
}
function setColor(color, animate = false) {
    avatarBgColorInput.value = color;
    avatarEl.style.background = color;
    const lc = (color || '').toLowerCase();
    colorGrid.querySelectorAll('.color-swatch').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.color.toLowerCase() === lc);
    });
    if (animate) popAvatar();
    refreshDirty();
}

// --- Dựng lưới linh vật ---
ANIMALS.forEach(animal => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.animal = animal;
    btn.className = 'animal-option aspect-square flex items-center justify-center text-2xl rounded-xl bg-white border-2 border-transparent hover:bg-pink-50 transition focus:outline-none';
    btn.textContent = animal;
    btn.title = animal;
    btn.addEventListener('click', () => setAnimal(animal, true));
    animalGrid.appendChild(btn);
});

// --- Dựng lưới màu sắc ---
COLORS.forEach(color => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.color = color;
    btn.className = 'color-swatch w-8 h-8 rounded-full border-2 border-white shadow-sm hover:scale-110 transition focus:outline-none';
    btn.style.background = color;
    btn.title = color;
    btn.addEventListener('click', () => setColor(color, true));
    colorGrid.appendChild(btn);
});

// Màu tùy chọn từ ô color picker
avatarBgColorInput.oninput = () => setColor(avatarBgColorInput.value);

// Nút ngẫu nhiên hoá avatar
if (shuffleBtn) {
    shuffleBtn.addEventListener('click', () => {
        const a = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
        const c = COLORS[Math.floor(Math.random() * COLORS.length)];
        setAnimal(a);
        setColor(c, true);
    });
}

// Cập nhật tên xem trước
nameInput.addEventListener('input', () => {
    namePreview.textContent = nameInput.value.trim() || 'Bạn';
    refreshDirty();
});
passwordInput.addEventListener('input', refreshDirty);

// Hiện / ẩn mật khẩu
if (togglePasswordBtn) {
    togglePasswordBtn.addEventListener('click', () => {
        const show = passwordInput.type === 'password';
        passwordInput.type = show ? 'text' : 'password';
        const icon = togglePasswordBtn.querySelector('i');
        if (icon) icon.className = show ? 'fas fa-eye-slash' : 'fas fa-eye';
    });
}
// Thu gọn / mở rộng phần đổi mật khẩu
if (togglePwSectionBtn && pwSection) {
    togglePwSectionBtn.addEventListener('click', () => {
        const willOpen = pwSection.classList.contains('hidden');
        pwSection.classList.toggle('hidden');
        if (pwChevron) pwChevron.style.transform = willOpen ? 'rotate(180deg)' : '';
    });
}

// --- Lời chào theo thời điểm trong ngày ---
function setGreeting(name) {
    const h = new Date().getHours();
    let text, emoji;
    if (h < 11) { text = 'Chào buổi sáng'; emoji = '🌅'; }
    else if (h < 14) { text = 'Chào buổi trưa'; emoji = '☀️'; }
    else if (h < 18) { text = 'Chào buổi chiều'; emoji = '🌤️'; }
    else { text = 'Chào buổi tối'; emoji = '🌙'; }
    greetingEl.textContent = `${text}, ${name} ${emoji}`;
}

// --- Định dạng "thành viên từ" ---
function toDate(value) {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    return new Date(value);
}

// --- Tải thống kê nhanh ---
async function loadQuickStats(user, userData) {
    // Thành viên từ
    const created = toDate(userData && userData.createdAt);
    if (created && !isNaN(created)) {
        const days = Math.max(0, Math.floor((Date.now() - created.getTime()) / 86400000));
        statMemberSince.textContent = days <= 0 ? 'Hôm nay' : (days < 30 ? `${days} ngày` : created.toLocaleDateString('vi-VN', { month: '2-digit', year: 'numeric' }));
        statMemberSince.title = created.toLocaleDateString('vi-VN');
    } else {
        statMemberSince.textContent = '—';
    }

    // Bộ đề đã tạo (ưu tiên đếm thực tế, fallback về số đã lưu)
    statQuizSets.textContent = (userData && typeof userData.quizSetsCreated === 'number') ? userData.quizSetsCreated : '0';
    try {
        const qs = await getDocs(query(collection(db, 'quiz_sets'), where('userId', '==', user.uid)));
        statQuizSets.textContent = qs.size;
    } catch {}

    // Lượt thi + điểm trung bình (hệ 10)
    try {
        const rs = await getDocs(query(collection(db, 'quiz_results'), where('userId', '==', user.uid)));
        statAttempts.textContent = rs.size;
        if (rs.size > 0) {
            let sum = 0;
            rs.forEach(d => { sum += (d.data().percentage || 0); });
            statAvg.textContent = (sum / rs.size / 10).toFixed(1);
        } else {
            statAvg.textContent = '0.0';
        }
    } catch {
        statAttempts.textContent = '0';
        statAvg.textContent = '0.0';
    }
}

// --- Pháo giấy ăn mừng ---
function celebrate() {
    const colors = ['#FF69B4', '#FBBF24', '#34D399', '#60A5FA', '#A78BFA', '#FB7185'];
    for (let i = 0; i < 40; i++) {
        const p = document.createElement('div');
        p.className = 'confetti-piece';
        p.style.left = Math.random() * 100 + 'vw';
        p.style.background = colors[Math.floor(Math.random() * colors.length)];
        p.style.animationDuration = (1.6 + Math.random() * 1.4) + 's';
        p.style.animationDelay = Math.random() * 0.25 + 's';
        p.style.transform = `rotate(${Math.random() * 360}deg)`;
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 3400);
    }
}

onAuthStateChanged(auth, async user => {
    if (user) {
        currentUser = user;
        let name = user.displayName || user.email.split('@')[0];
        emailInput.value = user.email;
        setAnimal('🐱');
        setColor('#FF69B4');

        let userData = null;
        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
                userData = userDoc.data();
                if (userData.avatarBgColor) setColor(userData.avatarBgColor);
                if (userData.avatarAnimal) setAnimal(userData.avatarAnimal);
                if (userData.displayName) name = userData.displayName;
            }
        } catch {}

        nameInput.value = name;
        namePreview.textContent = name;
        setGreeting(name);
        loadQuickStats(user, userData);

        // Lưu trạng thái ban đầu để phát hiện thay đổi
        initialState = {
            name: nameInput.value.trim(),
            color: avatarBgColorInput.value,
            animal: avatarAnimalInput.value
        };
        refreshDirty();
    } else {
        window.location.href = '../../index.html';
    }
});

saveBtn.onclick = async () => {
    if (!currentUser) return;
    const newName = nameInput.value.trim();
    if (!newName) return showMessage('Vui lòng nhập tên người dùng.', 'error');

    const newPassword = passwordInput.value;
    if (newPassword && newPassword.length < 6) {
        return showMessage('Mật khẩu mới phải có ít nhất 6 ký tự.', 'error');
    }

    saveBtn.disabled = true;
    const oldBtnHtml = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';
    showMessage('Đang lưu thay đổi...', 'info');

    try {
        await updateDoc(doc(db, 'users', currentUser.uid), {
            displayName: newName,
            avatarBgColor: avatarBgColorInput.value,
            avatarAnimal: avatarAnimalInput.value
        });
        try { await updateProfile(currentUser, { displayName: newName }); } catch {}

        if (newPassword) {
            try {
                await updatePassword(currentUser, newPassword);
                passwordInput.value = '';
            } catch (e) {
                if (e.code === 'auth/requires-recent-login') {
                    showMessage('Đã lưu hồ sơ. Để đổi mật khẩu, vui lòng đăng xuất rồi đăng nhập lại và thử lại nhé.', 'error');
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = oldBtnHtml;
                    return;
                }
                throw e;
            }
        }

        // Cập nhật trạng thái "đã lưu"
        initialState = { name: newName, color: avatarBgColorInput.value, animal: avatarAnimalInput.value };
        refreshDirty();
        setGreeting(newName);
        showMessage('Đã lưu thay đổi thành công! 🎉', 'success');
        celebrate();
    } catch (e) {
        showMessage('Lỗi: ' + (e.message || 'Không xác định'), 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = oldBtnHtml;
    }
};

logoutBtn.onclick = async () => {
    const ok = await showConfirm('Bạn có muốn đăng xuất khỏi tài khoản này không?', {
        title: 'Đăng xuất',
        confirmText: 'Đăng xuất',
        cancelText: 'Ở lại',
        tone: 'danger',
        icon: 'fas fa-right-from-bracket'
    });
    if (!ok) return;
    await signOut(auth);
    window.location.href = '../../index.html';
};
