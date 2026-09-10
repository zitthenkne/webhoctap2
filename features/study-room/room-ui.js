// room-ui.js — mẩu giao diện dùng chung cho các module của phòng học.
const PALETTE = ['#FF8FB8', '#C9B6F5', '#93DFC4', '#FFC49B', '#A5D8FF', '#F7A8C4', '#B8E986', '#FFD36E', '#9AD0F5', '#E0A9F5'];

// Bộ mặt cho người vào phòng bằng link (không cần đăng nhập)
export const AVATAR_EMOJIS = [
    '🦊', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐰',
    '🐻', '🐧', '🦄', '🐙', '🦖', '🐳', '🦉', '🦋', '🐢', '🦕',
    '🐝', '🐬', '🐤', '🦔', '🐺', '🦥', '🦦', '🐹', '🦩', '🐲',
];
export const randomEmoji = () => AVATAR_EMOJIS[Math.floor(Math.random() * AVATAR_EMOJIS.length)];

// Chữ ký dữ liệu: bỏ vẽ lại khi phần dữ liệu liên quan không đổi.
// (Firestore bắn snapshot cho cả nhịp tim / chat / reaction — vẽ lại hết thì giật.)
const sigs = Object.create(null);
export function changed(key, value) {
    const sig = JSON.stringify(value);
    if (sigs[key] === sig) return false;
    sigs[key] = sig;
    return true;
}

export function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

export function colorOf(uid) {
    let h = 0;
    for (const ch of String(uid || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return PALETTE[h % PALETTE.length];
}

export function initialsOf(name) {
    const parts = String(name || 'K').trim().split(/\s+/);
    const last = parts[parts.length - 1] || '';
    return (parts.length > 1 ? parts[0][0] + last[0] : last.slice(0, 2)).toUpperCase();
}

/**
 * Avatar tròn. Thứ tự ưu tiên: mặt emoji tự chọn > ảnh tài khoản > chữ cái đầu tên.
 * @param {object} member  doc thành viên
 * @param {string} extra   thêm class: 'sm' (nhỏ) | 'lg' (to, dùng ở sảnh chờ)
 */
export function avatarHtml(member, extra = '') {
    const name = member?.displayName || 'Khách';
    const title = escapeHtml(name);
    if (member?.emoji) {
        return `<div class="rm-avatar rm-avatar-emoji ${extra}" style="background:${colorOf(member?.uid)}22;border-color:${colorOf(member?.uid)}" title="${title}">${member.emoji}</div>`;
    }
    if (member?.photoURL) {
        return `<img src="${escapeHtml(member.photoURL)}" alt="" class="rm-avatar ${extra}" style="object-fit:cover" referrerpolicy="no-referrer" title="${title}">`;
    }
    return `<div class="rm-avatar ${extra}" style="background:linear-gradient(140deg, ${colorOf(member?.uid)}, ${colorOf((member?.uid || '') + 'x')})" title="${title}">${escapeHtml(initialsOf(name))}</div>`;
}

/** Dãy avatar chồng lên nhau (dùng chỗ "ai chọn phương án này"). */
export function avatarStack(members, max = 10, extra = 'sm') {
    const shown = members.slice(0, max);
    const more = members.length - shown.length;
    return `<span class="rm-stack">${shown.map(m => avatarHtml(m, extra)).join('')}${
        more > 0 ? `<span class="rm-avatar ${extra} rm-more">+${more}</span>` : ''}</span>`;
}

export function shortName(name, max = 16) {
    const s = String(name || 'Khách');
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

export function fmtClock(sec) {
    const s = Math.max(0, Math.round(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Bật/tắt phần tử theo cờ, giữ đúng display flex/grid gốc trong class Tailwind.
export function toggle(el, show) {
    if (el) el.classList.toggle('hidden', !show);
}
