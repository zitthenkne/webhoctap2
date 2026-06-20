import { auth, db } from '../../core/firebase-init.js';
import { updateProfile, updatePassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";

const avatarEl = document.getElementById('profile-avatar');
const avatarIconEl = document.getElementById('avatar-icon');
const avatarBgColorInput = document.getElementById('avatar-bgcolor');
const avatarAnimalInput = document.getElementById('avatar-animal');
const nameInput = document.getElementById('profile-name');
const emailInput = document.getElementById('profile-email');
const passwordInput = document.getElementById('profile-password');
const saveBtn = document.getElementById('save-profile-btn');
const logoutBtn = document.getElementById('logout-btn');
const messageEl = document.getElementById('profile-message');

let currentUser = null;

function showMessage(msg, type = 'info') {
    messageEl.textContent = msg;
    messageEl.className = 'mt-4 text-center text-sm ' + (type === 'error' ? 'text-red-500' : 'text-green-600');
}

onAuthStateChanged(auth, async user => {
    if (user) {
        currentUser = user;
        nameInput.value = user.displayName || user.email.split('@')[0];
        emailInput.value = user.email;
        // Lấy thông tin avatar từ Firestore
        try {
            const userDoc = await (await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js')).getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
                const data = userDoc.data();
                if (data.avatarBgColor) {
                    avatarEl.style.background = data.avatarBgColor;
                    avatarBgColorInput.value = data.avatarBgColor;
                }
                if (data.avatarAnimal) {
                    avatarIconEl.textContent = data.avatarAnimal;
                    avatarAnimalInput.value = data.avatarAnimal;
                }
            }
        } catch {}
    } else {
        window.location.href = '../../index.html';
    }
});

saveBtn.onclick = async () => {
    if (!currentUser) return;
    showMessage('Đang lưu...', 'info');
    const newName = nameInput.value.trim();
    const avatarBgColor = avatarBgColorInput.value;
    const avatarAnimal = avatarAnimalInput.value;
    try {
        await updateDoc(doc(db, 'users', currentUser.uid), {
            displayName: newName,
            avatarBgColor,
            avatarAnimal
        });
        showMessage('Lưu thay đổi thành công!');
    } catch (e) {
        let msg = 'Lỗi: ' + (e.message || 'Không xác định');
        if (e.code) msg += `\nCode: ${e.code}`;
        if (e.details) msg += `\nDetails: ${JSON.stringify(e.details)}`;
        showMessage(msg, 'error');
    }
};

// Thay đổi avatar preview khi chọn màu hoặc icon
avatarBgColorInput.oninput = () => {
    avatarEl.style.background = avatarBgColorInput.value;
};
avatarAnimalInput.oninput = () => {
    avatarIconEl.textContent = avatarAnimalInput.value;
};

logoutBtn.onclick = async () => {
    await signOut(auth);
    window.location.href = '../../index.html';
};
