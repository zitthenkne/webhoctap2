import { auth, db } from '../../core/firebase-init.js';
import { forgetSession, onSessionUser } from '../../core/auth-session.js';
import { updateProfile, updatePassword, signOut } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { updateDocQ as updateDoc } from '../../core/offline-write.js';
import { showConfirm } from '../../core/utils.js';
import { readMetaCache, fetchAllQuizMeta } from '../quiz/library/library-meta.js';
import { readRowsCache, syncRows } from './stats-insights.js';

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
const emailPreview = document.getElementById('user-email-preview');

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

const ANIMAL_NAMES = {
    '🐱': 'Mèo', '🐶': 'Cún', '🐰': 'Thỏ', '🦊': 'Cáo', '🐻': 'Gấu',
    '🐼': 'Gấu trúc', '🦁': 'Sư tử', '🐸': 'Ếch', '🐵': 'Khỉ', '🦉': 'Cú mèo',
    '🐿️': 'Sóc', '🐯': 'Hổ', '🐨': 'Koala', '🐧': 'Cánh cụt', '🐹': 'Hamster',
    '🐮': 'Bò sữa', '🐷': 'Heo', '🦄': 'Kỳ lân', '🐳': 'Cá voi', '🦋': 'Bướm', '🐢': 'Rùa'
};

const COLOR_NAMES = {
    '#FF69B4': 'Hồng phấn',
    '#F472B6': 'Hồng đào',
    '#D8BFD8': 'Tím lavender',
    '#A78BFA': 'Tím nhạt',
    '#8B5CF6': 'Tím thạch anh',
    '#60A5FA': 'Xanh da trời',
    '#38BDF8': 'Xanh thiên thanh',
    '#34D399': 'Xanh bạc hà',
    '#10B981': 'Xanh ngọc',
    '#FBBF24': 'Vàng bơ',
    '#F59E0B': 'Cam đào',
    '#FB7185': 'Hồng san hô',
    '#EF4444': 'Đỏ dâu',
    '#F97316': 'Cam ấm'
};

// --- Dựng lưới linh vật ---
ANIMALS.forEach(animal => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.animal = animal;
    btn.className = 'animal-option';
    btn.textContent = animal;
    btn.title = ANIMAL_NAMES[animal] || animal;
    btn.addEventListener('click', () => setAnimal(animal, true));
    animalGrid.appendChild(btn);
});

// --- Dựng lưới màu sắc ---
COLORS.forEach(color => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.color = color;
    btn.className = 'color-swatch w-8 h-8 rounded-full';
    btn.style.background = color;
    btn.title = COLOR_NAMES[color] || color;
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

// Tiện ích đo độ mạnh mật khẩu trực quan
const pwStrengthBar = document.getElementById('pw-strength-bar');
const pwStrengthText = document.getElementById('pw-strength-text');
function updatePasswordStrength(val) {
    if (!pwStrengthBar || !pwStrengthText) return;
    if (!val) {
        pwStrengthBar.style.width = '0%';
        pwStrengthBar.className = 'h-1.5 rounded-full transition-all duration-300 bg-slate-200';
        pwStrengthText.textContent = '';
        return;
    }
    if (val.length < 6) {
        pwStrengthBar.style.width = '33%';
        pwStrengthBar.className = 'h-1.5 rounded-full transition-all duration-300 bg-rose-400';
        pwStrengthText.innerHTML = '<span class="text-rose-500 font-semibold text-[11px]"><i class="fas fa-circle-exclamation mr-1"></i>Tối thiểu 6 ký tự</span>';
    } else if (val.length < 10) {
        pwStrengthBar.style.width = '66%';
        pwStrengthBar.className = 'h-1.5 rounded-full transition-all duration-300 bg-amber-400';
        pwStrengthText.innerHTML = '<span class="text-amber-600 font-semibold text-[11px]"><i class="fas fa-shield mr-1"></i>Độ bảo mật: Khá</span>';
    } else {
        pwStrengthBar.style.width = '100%';
        pwStrengthBar.className = 'h-1.5 rounded-full transition-all duration-300 bg-emerald-400';
        pwStrengthText.innerHTML = '<span class="text-emerald-600 font-semibold text-[11px]"><i class="fas fa-shield-halved mr-1"></i>Độ bảo mật: Tốt</span>';
    }
}
passwordInput.addEventListener('input', () => {
    updatePasswordStrength(passwordInput.value);
    refreshDirty();
});

// Tiện ích 1-chạm sao chép email
const copyEmailBtn = document.getElementById('copy-email-btn');
if (copyEmailBtn) {
    copyEmailBtn.addEventListener('click', () => {
        if (!emailInput.value) return;
        navigator.clipboard.writeText(emailInput.value);
        const icon = document.getElementById('copy-email-icon');
        const text = document.getElementById('user-email-preview');
        const originalText = text ? text.textContent : '';
        if (text) text.textContent = 'Đã sao chép';
        if (icon) icon.className = 'fas fa-check text-emerald-500';
        setTimeout(() => {
            if (text) text.textContent = originalText;
            if (icon) icon.className = 'fas fa-copy text-pink-400 group-hover:scale-115 transition-transform';
        }, 1800);
    });
}

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

    if (!user) return;

    // 1. BỘ ĐỀ ĐÃ TẠO: Đọc từ cache metadata (0 reads Firestore, không kéo mảng questions)
    let metaCount = null;
    const metaCached = readMetaCache(user.uid);
    if (Array.isArray(metaCached)) {
        metaCount = metaCached.filter(q => !q.deleted).length;
        statQuizSets.textContent = metaCount;
    } else if (userData && typeof userData.quizSetsCreated === 'number') {
        statQuizSets.textContent = userData.quizSetsCreated;
    } else {
        statQuizSets.textContent = '0';
    }

    // 2. LƯỢT THI + ĐIỂM TRUNG BÌNH: Đọc từ rowsCache (0 reads Firestore, tức thì)
    const computeRowsStats = (rows) => {
        if (!Array.isArray(rows) || rows.length === 0) {
            statAttempts.textContent = '0';
            statAvg.textContent = '0.0';
            return;
        }
        statAttempts.textContent = rows.length;
        let sumP = 0;
        let count = 0;
        rows.forEach(r => {
            if (r.t > 0) {
                sumP += (r.s / r.t) * 10;
                count++;
            }
        });
        statAvg.textContent = count > 0 ? (sumP / count).toFixed(1) : '0.0';
    };

    const cachedData = readRowsCache();
    computeRowsStats(cachedData.rows);

    // Ngoại tuyến: dừng tại đây, số liệu trên cache máy đã đủ
    if (!navigator.onLine) return;

    // Kéo ngầm ở background nếu có lượt làm mới mà không chặn UI
    syncRows().then(res => {
        if (res && res.changed) computeRowsStats(res.rows);
    }).catch(() => {});

    // Kéo nhẹ metadata nếu máy chưa có cache (dùng REST projection, không tải questions)
    if (metaCount === null) {
        fetchAllQuizMeta(user.uid).then(list => {
            if (Array.isArray(list)) {
                statQuizSets.textContent = list.filter(q => !q.deleted).length;
            }
        }).catch(() => {});
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

// onSessionUser: mất mạng mà phiên hết hạn thì Firebase trả null — trước đây trang đá ngay về trang chủ
onSessionUser(async user => {
    if (user) {
        currentUser = user;
        let name = user.displayName || (user.email || '').split('@')[0];
        emailInput.value = user.email;
        if (emailPreview) emailPreview.textContent = user.email;
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
    if (newPassword && !navigator.onLine) {
        return showMessage('Đổi mật khẩu cần có mạng. Tên và avatar thì lưu được ngay cả khi ngoại tuyến.', 'error');
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
        // Bản nhớ offline không phải đối tượng Firebase → bỏ qua; tên chính vẫn nằm ở users/{uid}
        if (navigator.onLine) { try { await updateProfile(currentUser, { displayName: newName }); } catch {} }

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
    forgetSession();
    window.location.href = '../../index.html';
};
