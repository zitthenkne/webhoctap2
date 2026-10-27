import { auth, db } from '../../core/firebase-init.js';
import { forgetSession, onSessionUser, sendVerifyMail, refreshEmailVerified, authErrorVi } from '../../core/auth-session.js';
import { updateProfile, updatePassword, signOut, GoogleAuthProvider, linkWithPopup, browserPopupRedirectResolver } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { updateDocQ as updateDoc } from '../../core/offline-write.js';
import { showConfirm } from '../../core/utils.js';
import { claimName } from '../../core/usernames.js';
import { releaseThisDevice, removeDevice, adminRemoveDevices, onDevices, onLogins, placeOf, findAccount, deviceId, MAX_DEVICES, deviceLimitFor,
    isAdminUser, onDeviceExempt, setDeviceExempt, ADMIN_EMAILS } from '../../core/device-limit.js';
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

// XÁC NHẬN EMAIL: hiện trạng thái + nút gửi (lại) mail. Email đã xác nhận mới nhận được bộ đề/thư mục chia sẻ riêng (firestore.rules sharedWithMe).
const verifyRow = document.getElementById('email-verify-row');
const verifyStatus = document.getElementById('email-verify-status');
const sendVerifyBtn = document.getElementById('send-verify-btn');
function renderVerifyState() {
    const u = auth.currentUser;
    if (!verifyRow || !u || u.isAnonymous) return;
    verifyRow.classList.remove('hidden');
    verifyStatus.innerHTML = u.emailVerified
        ? '<span class="text-emerald-500"><i class="fas fa-circle-check mr-1"></i>Email đã xác nhận</span>'
        : '<span class="text-amber-500"><i class="fas fa-triangle-exclamation mr-1"></i>Chưa xác nhận — cần để nhận đề được chia sẻ riêng</span>';
    sendVerifyBtn?.classList.toggle('hidden', u.emailVerified);
}
sendVerifyBtn?.addEventListener('click', async () => {
    sendVerifyBtn.disabled = true;
    try {
        await sendVerifyMail();
        showMessage(`Đã gửi mail xác nhận tới ${auth.currentUser.email}. Bấm link trong mail (xem cả thư rác), rồi quay lại trang này.`, 'success');
        // Đợi 60s rồi mới cho gửi lại (Firebase chặn gửi dồn: auth/too-many-requests)
        setTimeout(() => { sendVerifyBtn.disabled = false; }, 60000);
    } catch (e) {
        showMessage('Không gửi được mail xác nhận: ' + authErrorVi(e), 'error');
        sendVerifyBtn.disabled = false;
    }
});
window.addEventListener('auth:verified', () => { renderVerifyState(); showMessage('Email đã được xác nhận!', 'success'); });

// THIẾT BỊ ĐANG ĐĂNG NHẬP (giới hạn 2 máy — core/device-limit.js): xem danh sách, đăng xuất từ xa máy khác (máy đó tự đăng xuất ngay).
const escH = (s) => String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtWhen = (ms) => ms ? new Date(ms).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const deviceIcon = (label) => /iPhone|Android|Điện thoại/.test(label) ? 'fa-mobile-screen' : /iPad|bảng/.test(label) ? 'fa-tablet-screen-button' : 'fa-laptop';
/** Dòng thiết bị. me = id máy này (không có nút Đăng xuất); null = xem hộ (admin) → máy nào cũng có nút. */
function deviceRowsHtml(list, me) {
    return list.slice().sort((a, b) => (b.at || 0) - (a.at || 0)).map(d => {
        const mine = me && d.id === me;
        const label = escH(d.label || 'Thiết bị');
        const where = [placeOf(d), d.ip].filter(Boolean).map(escH).join(' · ');
        return `<li class="flex items-center gap-3 bg-white rounded-2xl border border-slate-200/60 px-3 py-2">
            <i class="fas ${deviceIcon(d.label || '')} text-slate-400 w-5 text-center"></i>
            <span class="min-w-0 flex-1"><span class="block text-[13px] font-bold text-slate-700 truncate">${label}${mine ? ' <span class="text-emerald-500">(máy này)</span>' : ''}</span>
                <span class="block text-[11px] text-slate-400 truncate">Đăng nhập lúc ${fmtWhen(d.at)}${where ? ' · ' + where : ''}</span></span>
            ${mine ? '' : `<button type="button" class="device-out-btn text-[12px] font-extrabold text-red-500 hover:bg-red-50 px-2.5 py-1 rounded-xl" data-id="${escH(d.id)}">Đăng xuất</button>`}
        </li>`;
    }).join('') || '<li class="text-[12px] text-slate-400 pl-1">Chưa có dữ liệu thiết bị.</li>';
}
function loginRowsHtml(list) {
    return list.map(l => `<li class="flex items-start gap-2 text-[11px] ${l.alert ? 'text-red-600 bg-red-50 rounded-xl px-2 py-1' : 'text-slate-500 px-2'}">
            <i class="fas ${l.alert ? 'fa-triangle-exclamation' : 'fa-right-to-bracket'} mt-0.5"></i>
            <span class="min-w-0 flex-1"><b>${fmtWhen(l.at)}</b> · ${escH(l.label || '')}${placeOf(l) ? ' · ' + escH(placeOf(l)) : ''}${l.ip ? ' · ' + escH(l.ip) : ''}
                ${l.alert ? `<span class="block font-bold">${escH(l.alert)} — có thể tài khoản đang bị dùng chung.</span>` : ''}</span>
        </li>`).join('') || '<li class="text-[11px] text-slate-400 pl-2">Chưa có lịch sử (ghi từ lần đăng nhập tới).</li>';
}
let devicesUnsub = null, devicesUid = null;
function renderDevices() {
    const u = auth.currentUser;
    const box = document.getElementById('devices-box');
    if (!box || !u || u.isAnonymous || devicesUid === u.uid) return;
    devicesUid = u.uid;
    devicesUnsub?.();
    const me = deviceId();
    const listEl = document.getElementById('devices-list');
    let limit = MAX_DEVICES;
    deviceLimitFor(u).then(n => { limit = n; }).catch(() => {});
    devicesUnsub = onDevices(u.uid, (list) => {
        if (!list) return;
        box.classList.remove('hidden');
        document.getElementById('devices-count').textContent = limit > MAX_DEVICES ? `${list.length} máy · không giới hạn` : `${list.length}/${limit} máy`;
        listEl.innerHTML = deviceRowsHtml(list, me);
    });
    // Lịch sử đăng nhập (5 lần gần nhất) — dòng có cảnh báo tô đỏ: hai nơi khác nhau trong 2 giờ
    const logEl = document.getElementById('logins-list');
    if (logEl) onLogins(u.uid, (list) => { if (list) logEl.innerHTML = loginRowsHtml(list.slice(0, 5)); });
    listEl.addEventListener('click', async (e) => {
        const btn = e.target.closest('.device-out-btn');
        if (!btn) return;
        const ok = await showConfirm('Máy này sẽ bị đăng xuất ngay (khi có mạng).', { title: 'Đăng xuất thiết bị?', confirmText: 'Đăng xuất', tone: 'danger' });
        if (!ok) return;
        try { await removeDevice(u.uid, btn.dataset.id); showMessage('Đã đăng xuất thiết bị đó.', 'success'); }
        catch (err) { showMessage('Không đăng xuất được thiết bị: ' + err.message, 'error'); }
    });
}

// QUẢN TRỊ (chỉ admin — isAdminUser, khớp isAdmin() của firestore.rules): danh sách email KHÔNG giới hạn số máy đăng nhập.
let adminBound = false;
function renderAdmin() {
    const u = auth.currentUser;
    const box = document.getElementById('admin-box');
    if (!box || !isAdminUser(u) || adminBound) return;
    adminBound = true;
    box.classList.remove('hidden');
    const listEl = document.getElementById('admin-exempt-list');
    const input = document.getElementById('admin-exempt-input');
    const esc = (s) => String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
    onDeviceExempt((list) => {
        if (!list) { listEl.innerHTML = '<li class="text-[12px] text-red-400 pl-1">Không đọc được cấu hình (luật Firestore đã deploy chưa?).</li>'; return; }
        const rows = [
            ...ADMIN_EMAILS.map(e => `<li class="flex items-center gap-2 bg-white rounded-xl border border-slate-200/60 px-3 py-1.5">
                <span class="flex-1 min-w-0 truncate text-[13px] font-bold text-slate-700">${esc(e)}</span><span class="text-[11px] font-bold text-amber-500">Admin</span></li>`),
            ...list.filter(e => !ADMIN_EMAILS.includes(e)).map(e => `<li class="flex items-center gap-2 bg-white rounded-xl border border-slate-200/60 px-3 py-1.5">
                <span class="flex-1 min-w-0 truncate text-[13px] font-semibold text-slate-700">${esc(e)}</span>
                <button type="button" class="admin-exempt-remove text-[12px] font-extrabold text-red-500 hover:bg-red-50 px-2 py-0.5 rounded-lg" data-email="${esc(e)}">Bỏ</button></li>`)
        ];
        listEl.innerHTML = rows.join('');
    });
    const add = async () => {
        try { await setDeviceExempt(input.value, true); input.value = ''; showMessage('Đã thêm tài khoản ngoại lệ (áp dụng từ lần mở app tới của họ).', 'success'); }
        catch (e) { showMessage('Không thêm được: ' + e.message, 'error'); }
    };
    document.getElementById('admin-exempt-add').addEventListener('click', add);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    listEl.addEventListener('click', async (e) => {
        const btn = e.target.closest('.admin-exempt-remove');
        if (!btn) return;
        try { await setDeviceExempt(btn.dataset.email, false); showMessage(`Đã bỏ ngoại lệ cho ${btn.dataset.email}.`, 'success'); }
        catch (err) { showMessage('Không bỏ được: ' + err.message, 'error'); }
    });

    // TRA CỨU TÀI KHOẢN: email / tên → máy đang đăng nhập (kèm vị trí) + lịch sử đăng nhập; đăng xuất từ xa từng máy hoặc tất cả.
    const qInput = document.getElementById('admin-lookup-input');
    const out = document.getElementById('admin-lookup-result');
    let stop = [];
    let target = null;
    const lookup = async () => {
        stop.forEach(f => f?.()); stop = [];
        target = null;
        out.innerHTML = '<p class="text-[12px] text-slate-400">Đang tìm…</p>';
        let acc;
        try { acc = await findAccount(qInput.value); }
        catch (e) { out.innerHTML = `<p class="text-[12px] text-red-500">Lỗi tra cứu: ${escH(e.message)}</p>`; return; }
        if (!acc) {
            out.innerHTML = '<p class="text-[12px] text-slate-500">Không tìm thấy. (Tài khoản chưa đăng nhập lại kể từ bản cập nhật này thì chưa tra được theo email — thử theo tên người dùng.)</p>';
            return;
        }
        target = acc;
        out.innerHTML = `
            <div class="flex items-center justify-between gap-2 mb-1.5">
                <p class="text-[13px] font-extrabold text-slate-700 truncate">${escH(acc.email || acc.uid)}</p>
                <button type="button" id="admin-out-all" class="shrink-0 text-[12px] font-extrabold text-red-500 hover:bg-red-50 px-2.5 py-1 rounded-xl">Đăng xuất tất cả</button>
            </div>
            <ul id="admin-dev-list" class="space-y-1.5 mb-2"></ul>
            <p class="text-[12px] font-bold text-slate-600 mb-1">Lịch sử đăng nhập</p>
            <ul id="admin-log-list" class="space-y-1"></ul>`;
        stop.push(onDevices(acc.uid, (list) => { const el = document.getElementById('admin-dev-list'); if (el) el.innerHTML = list ? deviceRowsHtml(list, null) : '<li class="text-[12px] text-red-400">Không đọc được (luật đã deploy chưa?).</li>'; }));
        stop.push(onLogins(acc.uid, (list) => { const el = document.getElementById('admin-log-list'); if (el) el.innerHTML = list ? loginRowsHtml(list) : ''; }));
    };
    document.getElementById('admin-lookup-btn').addEventListener('click', lookup);
    qInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); lookup(); } });
    out.addEventListener('click', async (e) => {
        if (!target) return;
        const one = e.target.closest('.device-out-btn');
        const all = e.target.closest('#admin-out-all');
        if (!one && !all) return;
        const ok = await showConfirm(all ? `Đăng xuất MỌI máy của ${target.email}?` : 'Đăng xuất máy này của người dùng?', { title: 'Đăng xuất từ xa', confirmText: 'Đăng xuất', tone: 'danger' });
        if (!ok) return;
        try {
            await adminRemoveDevices(target.uid, all ? '' : one.dataset.id);
            showMessage('Đã đăng xuất từ xa (máy đó tự đăng xuất khi có mạng).', 'success');
        } catch (err) { showMessage('Không đăng xuất được: ' + err.message, 'error'); }
    });
}

// LIÊN KẾT GOOGLE: tài khoản email/mật khẩu gắn thêm Google → lần sau bấm "Tiếp tục với Google" là vào đúng tài khoản này (cùng uid, cùng dữ liệu).
// Resolver popup chỉ truyền lúc gọi (xem firebase-init.js). Liên kết xong Firebase coi email là đã xác nhận nếu trùng Gmail.
const googleRow = document.getElementById('google-link-row');
const googleStatus = document.getElementById('google-link-status');
const linkGoogleBtn = document.getElementById('link-google-btn');
function renderProviders() {
    const u = auth.currentUser;
    if (!googleRow || !u || u.isAnonymous) return;
    const g = u.providerData.find(p => p.providerId === 'google.com');
    googleRow.classList.remove('hidden');
    googleStatus.innerHTML = g
        ? `<i class="fab fa-google text-[#4285F4] mr-1"></i>Đã liên kết Google${g.email && g.email !== u.email ? ` (${g.email})` : ''}`
        : '<i class="fas fa-key mr-1"></i>Đăng nhập bằng email + mật khẩu';
    linkGoogleBtn?.classList.toggle('hidden', !!g);
}
linkGoogleBtn?.addEventListener('click', async () => {
    const u = auth.currentUser;
    if (!u) return;
    linkGoogleBtn.disabled = true;
    try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await linkWithPopup(u, provider, browserPopupRedirectResolver);
        await u.reload();
        renderProviders();
        renderVerifyState();
        showMessage('Đã liên kết Google — lần sau bấm "Tiếp tục với Google" là vào tài khoản này.', 'success');
    } catch (e) {
        if (e?.code === 'auth/popup-closed-by-user' || e?.code === 'auth/cancelled-popup-request') return;
        const msg = e?.code === 'auth/credential-already-in-use'
            ? 'Tài khoản Google này đã gắn với một tài khoản Zitthenkne khác.'
            : e?.code === 'auth/popup-blocked' ? 'Trình duyệt chặn cửa sổ đăng nhập — cho phép popup rồi bấm lại.'
            : authErrorVi(e);
        showMessage('Không liên kết được Google: ' + msg, 'error');
    } finally { linkGoogleBtn.disabled = false; }
});
window.addEventListener('focus', () => { refreshEmailVerified(); });

// onSessionUser: mất mạng mà phiên hết hạn thì Firebase trả null — trước đây trang đá ngay về trang chủ
// onSessionUser báo HAI lần mỗi lần mở trang (danh tính lưu máy trước, bản Firebase thật sau) — lần hai chỉ đổi currentUser sang bản thật (cần getIdToken để lưu),
// KHÔNG đọc lại users/{uid} + quét quiz_results lần nữa (C6: trước đây mỗi lần mở hồ sơ = 2 getDoc + 2 truy vấn lịch sử).
let _loadedUid = null;
onSessionUser(async user => {
    if (user && _loadedUid === user.uid) { currentUser = user; renderVerifyState(); renderProviders(); renderDevices(); renderAdmin(); return; }
    if (user) { renderVerifyState(); renderProviders(); renderDevices(); renderAdmin(); }
    if (user) {
        _loadedUid = user.uid;
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
        // Bản C3: trang chủ giữ cache hồ sơ 10 phút (index-user-avatar.js) → ghi lại ngay để đổi avatar / tên thấy liền khi quay về
        try { localStorage.setItem('userAvatarPrefs_' + currentUser.uid, JSON.stringify({ avatarBgColor: avatarBgColorInput.value, avatarAnimal: avatarAnimalInput.value, displayName: newName, at: Date.now() })); } catch (_) {}
        // Bản nhớ offline không phải đối tượng Firebase → bỏ qua; tên chính vẫn nằm ở users/{uid}
        if (navigator.onLine) { try { await updateProfile(currentUser, { displayName: newName }); } catch {} }
        // Ô đăng nhập gõ tên mới là vào được (bảng tra usernames, bỏ bản tra tên cũ). Không chờ: tên đã có người giữ thì thôi.
        if (newName !== initialState.name) claimName(currentUser, newName, initialState.name);

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
    await releaseThisDevice();   // nhả chỗ trong giới hạn 2 máy cho máy khác dùng
    forgetSession();            // TRƯỚC signOut: để auth-session biết đây là đăng xuất chủ động, không báo "phiên hết hạn"
    await signOut(auth);
    window.location.href = '../../index.html';
};
