import { auth, db } from '../../core/firebase-init.js';
import { forgetSession, onSessionUser, sendVerifyMail, refreshEmailVerified, authErrorVi } from '../../core/auth-session.js';
import { updateProfile, updatePassword, signOut, GoogleAuthProvider, linkWithPopup, browserPopupRedirectResolver } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { updateDocQ as updateDoc } from '../../core/offline-write.js';
import { showConfirm } from '../../core/utils.js';
import { claimName } from '../../core/usernames.js';
import { releaseThisDevice, removeDevice, adminRemoveDevices, onDevices, onLogins, placeOf, findAccount, deviceId, MAX_DEVICES, deviceLimitFor,
    isAdminUser, onAccessConfig, setAccountAccess, ADMIN_EMAILS,
    adminCreateUser, adminLookupUser, adminListUsers, adminUpdateUser, adminDeleteUser } from '../../core/device-limit.js';
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

// QUẢN TRỊ TOÀN QUYỀN (chỉ admin — isAdminUser, khớp isAdmin() của firestore.rules + api/_lib/admin.js)
let adminBound = false;
function renderAdmin() {
    const u = auth.currentUser;
    const box = document.getElementById('admin-box');
    if (!box || !isAdminUser(u) || adminBound) return;
    adminBound = true;
    box.classList.remove('hidden');

    const esc = (s) => String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));

    // --- 1. TẠO TÀI KHOẢN MỚI / CẬP NHẬT NHANH ---
    const cEmail = document.getElementById('admin-create-email');
    const cPass = document.getElementById('admin-create-password');
    const cName = document.getElementById('admin-create-name');
    const cAllowPw = document.getElementById('admin-create-allow-pw');
    const cUnlimited = document.getElementById('admin-create-unlimited');
    const cBtn = document.getElementById('admin-create-btn');

    cBtn?.addEventListener('click', async () => {
        const email = cEmail.value.trim().toLowerCase();
        const password = cPass.value;
        const displayName = cName.value.trim();
        const allowPassword = !!cAllowPw.checked;
        const unlimitedDevices = !!cUnlimited.checked;
        if (!email || !email.includes('@')) return showMessage('Vui lòng nhập email hợp lệ.', 'error');
        if (!password || password.length < 6) return showMessage('Mật khẩu phải từ 6 ký tự trở lên.', 'error');
        cBtn.disabled = true;
        const oldHtml = cBtn.innerHTML;
        cBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Đang xử lý...';
        try {
            const res = await adminCreateUser({ email, password, displayName, allowPassword, unlimitedDevices, approved: true });
            const modeTxt = allowPassword ? 'Đăng nhập thẳng (miễn Google)' : 'Bắt buộc qua Google';
            const devTxt = unlimitedDevices ? '20 máy' : '2 máy';
            showMessage(`${res.existed ? 'Đã cập nhật' : 'Đã tạo mới'} tài khoản ${res.email} · ${modeTxt} · ${devTxt}.`, 'success');
            cEmail.value = '';
            cPass.value = '';
            cName.value = '';
            if (qInput && qInput.value.trim().toLowerCase() === email) lookup();
        } catch (err) {
            showMessage('Lỗi tạo/cập nhật tài khoản: ' + err.message, 'error');
        } finally {
            cBtn.disabled = false;
            cBtn.innerHTML = oldHtml;
        }
    });

    // --- 2. DANH SÁCH ĐẶC CÁCH (onAccessConfig: độc lập giữa passwordAllowed & deviceExempt) ---
    const listEl = document.getElementById('admin-exempt-list');
    const input = document.getElementById('admin-exempt-input');
    let latestCfg = { deviceExempt: [], passwordAllowed: [] };

    onAccessConfig((cfg) => {
        if (!cfg) {
            listEl.innerHTML = '<li class="text-[12px] text-red-400 pl-1">Không đọc được cấu hình (luật Firestore đã deploy chưa?).</li>';
            return;
        }
        latestCfg = cfg;
        const devSet = new Set(cfg.deviceExempt || []);
        const pwSet = new Set([...(cfg.passwordAllowed || []), ...(cfg.deviceExempt || [])]);
        const allEmails = Array.from(new Set([...ADMIN_EMAILS, ...pwSet, ...devSet]));

        const rows = allEmails.map(e => {
            const isAdm = ADMIN_EMAILS.includes(e);
            if (isAdm) {
                return `<li class="flex flex-wrap items-center justify-between gap-2 bg-amber-50/70 rounded-xl border border-amber-200 px-3 py-1.5">
                    <span class="min-w-0 truncate text-[12.5px] font-extrabold text-amber-900">${esc(e)}</span>
                    <div class="flex items-center gap-1.5">
                        <span class="text-[10.5px] font-extrabold bg-amber-200 text-amber-900 px-2 py-0.5 rounded-lg">👑 Admin mặc định</span>
                        <span class="text-[10.5px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-lg">🔑 Đăng nhập thẳng</span>
                        <span class="text-[10.5px] font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-lg">♾️ 20 máy</span>
                    </div>
                </li>`;
            }
            const hasPw = pwSet.has(e);
            const hasUnlim = devSet.has(e);
            return `<li class="flex flex-wrap items-center justify-between gap-2 bg-white rounded-xl border border-slate-200/70 px-3 py-1.5">
                <button type="button" class="admin-quick-inspect min-w-0 truncate text-left text-[12.5px] font-bold text-slate-700 hover:text-amber-600" data-email="${esc(e)}" title="Bấm để tra cứu chi tiết">${esc(e)}</button>
                <div class="flex flex-wrap items-center gap-1.5">
                    <button type="button" class="admin-toggle-pw text-[10.5px] font-extrabold px-2 py-0.5 rounded-lg transition ${hasPw ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}"
                        data-email="${esc(e)}" data-pw="${hasPw ? '1' : '0'}" data-dev="${hasUnlim ? '1' : '0'}"
                        title="Bấm để chuyển đổi: Cho đăng nhập thẳng bằng mật khẩu vs Bắt qua Google">
                        ${hasPw ? '🔑 Đăng nhập thẳng' : '🌐 Bắt qua Google'}
                    </button>
                    <button type="button" class="admin-toggle-dev text-[10.5px] font-extrabold px-2 py-0.5 rounded-lg transition ${hasUnlim ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}"
                        data-email="${esc(e)}" data-pw="${hasPw ? '1' : '0'}" data-dev="${hasUnlim ? '1' : '0'}"
                        title="Bấm để chuyển đổi: Không giới hạn (20 máy) vs Giới hạn 2 máy">
                        ${hasUnlim ? '♾️ 20 máy' : '🔒 2 máy'}
                    </button>
                    <button type="button" class="admin-exempt-remove text-[11px] font-extrabold text-red-500 hover:bg-red-50 px-2 py-0.5 rounded-lg" data-email="${esc(e)}" title="Xoá mọi đặc cách (về mặc định: bắt Google + 2 máy)">Bỏ</button>
                </div>
            </li>`;
        });
        listEl.innerHTML = rows.join('');
    });

    const addExempt = async (allowPw, unlimDev) => {
        const email = input.value.trim().toLowerCase();
        if (!email) return;
        try {
            await setAccountAccess(email, { allowPassword: allowPw, unlimitedDevices: unlimDev });
            input.value = '';
            showMessage(`Đã cấp quyền cho ${email}: ${allowPw ? 'Đăng nhập thẳng' : 'Qua Google'} · ${unlimDev ? '20 máy' : '2 máy'}.`, 'success');
        } catch (e) {
            showMessage('Không thêm được: ' + e.message, 'error');
        }
    };
    document.getElementById('admin-exempt-add')?.addEventListener('click', () => addExempt(true, true));
    document.getElementById('admin-exempt-add-pw')?.addEventListener('click', () => addExempt(true, false));
    input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addExempt(true, true); } });

    listEl?.addEventListener('click', async (e) => {
        const inspectBtn = e.target.closest('.admin-quick-inspect');
        if (inspectBtn) {
            qInput.value = inspectBtn.dataset.email;
            lookup();
            return;
        }
        const pwBtn = e.target.closest('.admin-toggle-pw');
        if (pwBtn) {
            const email = pwBtn.dataset.email;
            const curPw = pwBtn.dataset.pw === '1';
            const curDev = pwBtn.dataset.dev === '1';
            const nextPw = !curPw;
            // Nếu tắt đăng nhập thẳng thì cũng tắt deviceExempt (vì deviceExempt hàm ý đặc cách)
            const nextDev = nextPw ? curDev : false;
            try {
                await setAccountAccess(email, { allowPassword: nextPw, unlimitedDevices: nextDev });
                showMessage(`Đã cập nhật ${email}: ${nextPw ? 'Cho đăng nhập thẳng (miễn Google)' : 'Bắt đăng nhập qua Google'}.`, 'success');
            } catch (err) { showMessage('Lỗi cập nhật: ' + err.message, 'error'); }
            return;
        }
        const devBtn = e.target.closest('.admin-toggle-dev');
        if (devBtn) {
            const email = devBtn.dataset.email;
            const curPw = devBtn.dataset.pw === '1';
            const curDev = devBtn.dataset.dev === '1';
            const nextDev = !curDev;
            const nextPw = nextDev ? true : curPw;
            try {
                await setAccountAccess(email, { allowPassword: nextPw, unlimitedDevices: nextDev });
                showMessage(`Đã cập nhật ${email}: ${nextDev ? 'Mở 20 thiết bị' : 'Giới hạn 2 thiết bị'}.`, 'success');
            } catch (err) { showMessage('Lỗi cập nhật: ' + err.message, 'error'); }
            return;
        }
        const rmBtn = e.target.closest('.admin-exempt-remove');
        if (rmBtn) {
            try {
                await setAccountAccess(rmBtn.dataset.email, { allowPassword: false, unlimitedDevices: false });
                showMessage(`Đã gỡ đặc cách của ${rmBtn.dataset.email} (về mặc định: qua Google + 2 máy).`, 'success');
            } catch (err) { showMessage('Không bỏ được: ' + err.message, 'error'); }
        }
    });

    // --- 3. TRA CỨU SÂU & ĐIỀU KHIỂN TÀI KHOẢN (kết hợp Firebase Auth Admin + Firestore) ---
    const qInput = document.getElementById('admin-lookup-input');
    const out = document.getElementById('admin-lookup-result');
    const usersWrap = document.getElementById('admin-users-list-wrap');
    let stop = [];
    let target = null;

    function renderTargetCard(acc) {
        target = acc;
        const isTargetAdmin = ADMIN_EMAILS.includes((acc.email || '').toLowerCase());
        const allowPw = isTargetAdmin || !!acc.allowPassword || !!acc.unlimitedDevices;
        const unlimDev = isTargetAdmin || !!acc.unlimitedDevices;
        const approved = isTargetAdmin || acc.approved !== false;
        const disabled = !!acc.disabled;
        const providers = (acc.providers || []).map(p => p === 'google.com' ? 'Google' : p === 'password' ? 'Mật khẩu' : p).join(', ') || 'Chưa rõ';

        out.innerHTML = `
            <div class="bg-amber-50/50 rounded-2xl border border-amber-200/80 p-3 space-y-3">
                <div class="flex flex-wrap items-start justify-between gap-2">
                    <div class="min-w-0">
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <p class="text-[13.5px] font-black text-slate-800 truncate">${escH(acc.displayName || '(Chưa đặt tên)')}</p>
                            ${isTargetAdmin ? '<span class="text-[10px] font-extrabold bg-amber-200 text-amber-900 px-2 py-0.5 rounded-md">ADMIN</span>' : ''}
                            ${disabled ? '<span class="text-[10px] font-extrabold bg-red-100 text-red-700 px-2 py-0.5 rounded-md">ĐANG KHOÁ</span>' : '<span class="text-[10px] font-extrabold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md">HOẠT ĐỘNG</span>'}
                        </div>
                        <p class="text-[12px] font-bold text-slate-600 truncate">${escH(acc.email || '(Không có email)')} · <span class="text-[11px] text-slate-400 font-mono">UID: ${escH(acc.uid)}</span></p>
                        <p class="text-[11px] text-slate-500">Phương thức: <b>${escH(providers)}</b> · Email xác thực: <b>${acc.emailVerified ? 'Rồi' : 'Chưa'}</b></p>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <button type="button" id="admin-out-all" class="text-[11px] font-extrabold text-amber-700 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-xl">Đá mọi thiết bị</button>
                        ${isTargetAdmin ? '' : `<button type="button" id="admin-delete-user" class="text-[11px] font-extrabold text-red-600 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-xl">Xoá TK</button>`}
                    </div>
                </div>

                <!-- Công tắc phân quyền 1-chạm -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
                    <button type="button" id="admin-card-toggle-pw" ${isTargetAdmin ? 'disabled' : ''}
                        class="px-2.5 py-2 rounded-xl border text-left transition ${allowPw ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-600'}">
                        <span class="block text-[10px] font-bold uppercase opacity-75">Cổng đăng nhập</span>
                        <span class="block text-[11.5px] font-extrabold mt-0.5">${allowPw ? '🔑 Đăng nhập thẳng' : '🌐 Bắt qua Google'}</span>
                    </button>
                    <button type="button" id="admin-card-toggle-dev" ${isTargetAdmin ? 'disabled' : ''}
                        class="px-2.5 py-2 rounded-xl border text-left transition ${unlimDev ? 'bg-purple-50 border-purple-200 text-purple-800' : 'bg-slate-50 border-slate-200 text-slate-600'}">
                        <span class="block text-[10px] font-bold uppercase opacity-75">Giới hạn thiết bị</span>
                        <span class="block text-[11.5px] font-extrabold mt-0.5">${unlimDev ? '♾️ 20 thiết bị' : '🔒 2 thiết bị'}</span>
                    </button>
                    <button type="button" id="admin-card-toggle-approved" ${isTargetAdmin ? 'disabled' : ''}
                        class="px-2.5 py-2 rounded-xl border text-left transition ${approved ? 'bg-sky-50 border-sky-200 text-sky-800' : 'bg-rose-50 border-rose-200 text-rose-700'}">
                        <span class="block text-[10px] font-bold uppercase opacity-75">Quyền tạo đề / phòng</span>
                        <span class="block text-[11.5px] font-extrabold mt-0.5">${approved ? '✅ Đã duyệt' : '⏳ Chưa duyệt'}</span>
                    </button>
                    <button type="button" id="admin-card-toggle-lock" ${isTargetAdmin ? 'disabled' : ''}
                        class="px-2.5 py-2 rounded-xl border text-left transition ${disabled ? 'bg-red-50 border-red-200 text-red-700' : 'bg-slate-50 border-slate-200 text-slate-700'}">
                        <span class="block text-[10px] font-bold uppercase opacity-75">Trạng thái TK</span>
                        <span class="block text-[11.5px] font-extrabold mt-0.5">${disabled ? '🚫 Đang bị khoá' : '🟢 Đang mở'}</span>
                    </button>
                </div>

                <!-- Đổi mật khẩu & Đổi tên trực tiếp -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <div class="flex gap-1.5">
                        <input type="text" id="admin-card-newpass" placeholder="Đặt mật khẩu mới (>=6 ký tự)" autocomplete="off"
                            class="flex-1 min-w-0 px-2.5 py-1.5 rounded-xl border border-amber-200 bg-white text-xs font-semibold">
                        <button type="button" id="admin-card-setpass-btn" class="shrink-0 px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-extrabold">Đổi MK</button>
                    </div>
                    <div class="flex gap-1.5">
                        <input type="text" id="admin-card-newname" value="${escH(acc.displayName || '')}" placeholder="Đổi tên hiển thị / username" autocomplete="off"
                            class="flex-1 min-w-0 px-2.5 py-1.5 rounded-xl border border-amber-200 bg-white text-xs font-semibold">
                        <button type="button" id="admin-card-setname-btn" class="shrink-0 px-2.5 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-[11px] font-extrabold">Đổi tên</button>
                    </div>
                </div>

                <div>
                    <p class="text-[11.5px] font-extrabold text-slate-600 mb-1">Thiết bị đang đăng nhập</p>
                    <ul id="admin-dev-list" class="space-y-1.5 mb-2"></ul>
                    <p class="text-[11.5px] font-extrabold text-slate-600 mb-1">Lịch sử đăng nhập</p>
                    <ul id="admin-log-list" class="space-y-1"></ul>
                </div>
            </div>`;

        stop.forEach(f => f?.()); stop = [];
        stop.push(onDevices(acc.uid, (list) => {
            const el = document.getElementById('admin-dev-list');
            if (el) el.innerHTML = list ? deviceRowsHtml(list, null) : '<li class="text-[12px] text-red-400">Không đọc được thiết bị.</li>';
        }));
        stop.push(onLogins(acc.uid, (list) => {
            const el = document.getElementById('admin-log-list');
            if (el) el.innerHTML = list ? loginRowsHtml(list) : '';
        }));
    }

    const lookup = async () => {
        const q = qInput.value.trim();
        if (!q) return;
        stop.forEach(f => f?.()); stop = [];
        target = null;
        out.innerHTML = '<p class="text-[12px] text-slate-400"><i class="fas fa-spinner fa-spin mr-1"></i>Đang tra cứu từ hệ thống…</p>';
        let acc = null;
        try {
            acc = await adminLookupUser(q);
        } catch {
            // Fallback client lookup nếu offline/lỗi mạng tạm thời
            try { acc = await findAccount(q); } catch {}
        }
        if (!acc) {
            out.innerHTML = '<p class="text-[12px] text-slate-500">Không tìm thấy tài khoản nào khớp. Bạn có thể tạo mới tài khoản này ở khung bên trên.</p>';
            return;
        }
        renderTargetCard(acc);
    };

    document.getElementById('admin-lookup-btn')?.addEventListener('click', lookup);
    qInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); lookup(); } });

    // Sự kiện bên trong thẻ điều khiển tài khoản
    out?.addEventListener('click', async (e) => {
        if (!target) return;

        // 1. Đá 1 thiết bị hoặc toàn bộ thiết bị
        const one = e.target.closest('.device-out-btn');
        const all = e.target.closest('#admin-out-all');
        if (one || all) {
            const ok = await showConfirm(all ? `Đăng xuất MỌI máy của ${target.email || target.uid}?` : 'Đăng xuất máy này của người dùng?', { title: 'Đăng xuất từ xa', confirmText: 'Đăng xuất', tone: 'danger' });
            if (!ok) return;
            try {
                await adminRemoveDevices(target.uid, all ? '' : one.dataset.id);
                showMessage('Đã đá thiết bị từ xa thành công.', 'success');
            } catch (err) { showMessage('Không đăng xuất được: ' + err.message, 'error'); }
            return;
        }

        // 2. Bật/tắt Đăng nhập thẳng (miễn Google)
        if (e.target.closest('#admin-card-toggle-pw')) {
            const nextPw = !target.allowPassword;
            const nextDev = nextPw ? !!target.unlimitedDevices : false;
            try {
                await adminUpdateUser({ uid: target.uid, email: target.email, allowPassword: nextPw, unlimitedDevices: nextDev });
                target.allowPassword = nextPw;
                target.unlimitedDevices = nextDev;
                renderTargetCard(target);
                showMessage(`Đã chỉnh ${target.email}: ${nextPw ? 'Cho phép đăng nhập thẳng (miễn Google)' : 'Bắt buộc đăng nhập qua Google'}.`, 'success');
            } catch (err) { showMessage('Lỗi: ' + err.message, 'error'); }
            return;
        }

        // 3. Bật/tắt Không giới hạn thiết bị (20 máy)
        if (e.target.closest('#admin-card-toggle-dev')) {
            const nextDev = !target.unlimitedDevices;
            const nextPw = nextDev ? true : !!target.allowPassword;
            try {
                await adminUpdateUser({ uid: target.uid, email: target.email, allowPassword: nextPw, unlimitedDevices: nextDev });
                target.unlimitedDevices = nextDev;
                target.allowPassword = nextPw;
                renderTargetCard(target);
                showMessage(`Đã chỉnh ${target.email}: ${nextDev ? 'Mở giới hạn 20 thiết bị' : 'Giới hạn 2 thiết bị'}.`, 'success');
            } catch (err) { showMessage('Lỗi: ' + err.message, 'error'); }
            return;
        }

        // 4. Bật/tắt quyền tạo đề (approved claim)
        if (e.target.closest('#admin-card-toggle-approved')) {
            const nextApp = !(target.approved !== false);
            try {
                await adminUpdateUser({ uid: target.uid, approved: nextApp });
                target.approved = nextApp;
                renderTargetCard(target);
                showMessage(`Đã ${nextApp ? 'cấp quyền' : 'thu hồi quyền'} tạo bộ đề cho ${target.email || target.uid}.`, 'success');
            } catch (err) { showMessage('Lỗi: ' + err.message, 'error'); }
            return;
        }

        // 5. Khoá / Mở khoá tài khoản
        if (e.target.closest('#admin-card-toggle-lock')) {
            const nextDis = !target.disabled;
            const ok = await showConfirm(nextDis ? `Khoá tài khoản ${target.email || target.uid} và đá toàn bộ thiết bị đang đăng nhập?` : `Mở khoá cho tài khoản ${target.email || target.uid}?`, {
                title: nextDis ? 'Khoá tài khoản?' : 'Mở khoá tài khoản?',
                confirmText: nextDis ? 'Khoá ngay' : 'Mở khoá',
                tone: nextDis ? 'danger' : 'info'
            });
            if (!ok) return;
            try {
                await adminUpdateUser({ uid: target.uid, disabled: nextDis });
                target.disabled = nextDis;
                renderTargetCard(target);
                showMessage(nextDis ? 'Đã khoá tài khoản và thu hồi mọi phiên đăng nhập.' : 'Đã mở khoá tài khoản.', 'success');
            } catch (err) { showMessage('Lỗi: ' + err.message, 'error'); }
            return;
        }

        // 6. Đặt lại mật khẩu trực tiếp
        if (e.target.closest('#admin-card-setpass-btn')) {
            const pwEl = document.getElementById('admin-card-newpass');
            const newPassword = pwEl?.value || '';
            if (newPassword.length < 6) return showMessage('Mật khẩu mới phải từ 6 ký tự trở lên.', 'error');
            try {
                await adminUpdateUser({ uid: target.uid, password: newPassword });
                if (pwEl) pwEl.value = '';
                showMessage(`Đã đặt mật khẩu mới cho ${target.email || target.uid}.`, 'success');
            } catch (err) { showMessage('Lỗi đổi mật khẩu: ' + err.message, 'error'); }
            return;
        }

        // 7. Đổi tên hiển thị / username trực tiếp
        if (e.target.closest('#admin-card-setname-btn')) {
            const nameEl = document.getElementById('admin-card-newname');
            const newName = (nameEl?.value || '').trim();
            if (!newName) return showMessage('Vui lòng nhập tên hiển thị.', 'error');
            try {
                await adminUpdateUser({ uid: target.uid, displayName: newName });
                target.displayName = newName;
                renderTargetCard(target);
                showMessage(`Đã đổi tên thành "${newName}".`, 'success');
            } catch (err) { showMessage('Lỗi đổi tên: ' + err.message, 'error'); }
            return;
        }

        // 8. Xoá vĩnh viễn tài khoản
        if (e.target.closest('#admin-delete-user')) {
            const ok = await showConfirm(`Xoá vĩnh viễn tài khoản ${target.email || target.uid}? Thao tác này không thể hoàn tác.`, {
                title: 'Xoá tài khoản?',
                confirmText: 'Xoá vĩnh viễn',
                tone: 'danger'
            });
            if (!ok) return;
            try {
                await adminDeleteUser(target.uid);
                stop.forEach(f => f?.()); stop = [];
                out.innerHTML = '<p class="text-[12px] text-emerald-600 font-bold">Đã xoá tài khoản.</p>';
                target = null;
                showMessage('Đã xoá tài khoản thành công.', 'success');
            } catch (err) { showMessage('Lỗi xoá tài khoản: ' + err.message, 'error'); }
        }
    });

    // --- 4. DANH SÁCH TOÀN BỘ TÀI KHOẢN TRÊN HỆ THỐNG ---
    const listUsersBtn = document.getElementById('admin-list-users-btn');
    listUsersBtn?.addEventListener('click', async () => {
        if (!usersWrap) return;
        const isHidden = usersWrap.classList.contains('hidden');
        if (!isHidden) {
            usersWrap.classList.add('hidden');
            return;
        }
        usersWrap.classList.remove('hidden');
        usersWrap.innerHTML = '<p class="text-[12px] text-slate-400"><i class="fas fa-spinner fa-spin mr-1"></i>Đang tải danh sách tài khoản…</p>';
        try {
            const users = await adminListUsers();
            usersWrap.innerHTML = `
                <div class="flex items-center justify-between mb-1.5">
                    <span class="text-[11.5px] font-extrabold text-amber-800">Tổng cộng: ${users.length} tài khoản (bấm vào bất kỳ dòng nào để điều khiển)</span>
                    <button type="button" id="admin-close-users-list" class="text-[11px] font-bold text-slate-400 hover:text-slate-600">Thu gọn</button>
                </div>
                <div class="max-h-64 overflow-y-auto space-y-1 pr-1">
                    ${users.map(uItem => `
                        <button type="button" class="admin-pick-user w-full text-left flex flex-wrap items-center justify-between gap-2 bg-slate-50/80 hover:bg-amber-50 rounded-xl border border-slate-200/70 px-3 py-1.5 transition" data-q="${esc(uItem.email || uItem.uid)}">
                            <span class="min-w-0 truncate text-[12px] font-bold text-slate-700">
                                ${esc(uItem.displayName || '(Chưa tên)')}
                                <span class="text-slate-400 font-normal">· ${esc(uItem.email || uItem.uid)}</span>
                            </span>
                            <span class="flex items-center gap-1 shrink-0 text-[10px] font-extrabold">
                                ${uItem.disabled ? '<span class="bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Khoá</span>' : ''}
                                ${uItem.allowPassword ? '<span class="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">🔑 Thẳng</span>' : '<span class="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">🌐 Google</span>'}
                                ${uItem.unlimitedDevices ? '<span class="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">♾️ 20 máy</span>' : '<span class="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">2 máy</span>'}
                            </span>
                        </button>
                    `).join('')}
                </div>
            `;
        } catch (err) {
            usersWrap.innerHTML = `<p class="text-[12px] text-red-500">Không tải được danh sách: ${escH(err.message)}</p>`;
        }
    });

    usersWrap?.addEventListener('click', (e) => {
        if (e.target.closest('#admin-close-users-list')) {
            usersWrap.classList.add('hidden');
            return;
        }
        const pick = e.target.closest('.admin-pick-user');
        if (pick) {
            qInput.value = pick.dataset.q;
            lookup();
        }
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
