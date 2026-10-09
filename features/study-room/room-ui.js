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
/** Quên chữ ký của một khối (khối đó bị module khác vẽ đè, lần sau phải vẽ lại). */
export const forget = (key) => { delete sigs[key]; };

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
    return `<div class="rm-avatar ${extra}" style="background:${colorOf(member?.uid)}" title="${title}">${escapeHtml(initialsOf(name))}</div>`;
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

/** "vừa xong" · "5 phút" · "2 giờ" · "24/9" — mốc ms của một ý kiến trong luồng bàn luận. */
export function agoText(ms) {
    const d = (Date.now() - (Number(ms) || 0)) / 60000;
    if (!ms || d < 1) return 'vừa xong';
    if (d < 60) return `${Math.floor(d)} phút`;
    if (d < 1440) return `${Math.floor(d / 60)} giờ`;
    const t = new Date(ms);
    return `${t.getDate()}/${t.getMonth() + 1}`;
}

export function fmtClock(sec) {
    const s = Math.max(0, Math.round(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Gán chữ chỉ khi KHÁC: textContent = cùng giá trị vẫn thay nút chữ -> kéo theo style/dàn trang (đo: hàng trăm lần/giây vô ích khi cả phòng hoạt động).
export function setText(node, v) {
    if (node && node.textContent !== v) node.textContent = v;
}

// Đặt biến CSS chỉ khi KHÁC: custom property tự kế thừa xuống con cháu nên gán lại cùng giá trị vẫn bắt trình duyệt tính lại style
// của cả cây con (đo: dải 60 đoạn #q-rail bị tính lại 60 phần tử x mỗi lần vẽ).
export function setVar(node, name, value) {
    const v = String(value);
    if (node && node.style.getPropertyValue(name) !== v) node.style.setProperty(name, v);
}

// Gán innerHTML chỉ khi chuỗi KHÁC lần gán trước (trả true nếu có gán). Mỗi lần snapshot về, renderLive dựng lại hàng chục khối HTML
// giống hệt lần trước (dải 60 viên câu, đường đua, chip…) -> trình duyệt phân tích + dàn trang lại vô ích (đo: ~40% thời gian vẽ).
// Ô contenteditable: lúc được focus coi như đã bị người dùng sửa tay -> lần vẽ kế buộc gán lại (huỷ sửa dở vẫn trả về đúng dữ liệu).
export function setHtml(node, html) {
    if (!node || node.__h === html) return false;
    node.__h = html;
    node.innerHTML = html;
    return true;
}
if (typeof document !== 'undefined') {
    document.addEventListener('focusin', (e) => {
        const n = e.target?.closest?.('[contenteditable]');
        if (n) n.__h = null;
    }, true);
}

// Bật/tắt phần tử theo cờ, giữ đúng display flex/grid gốc trong class Tailwind.
export function toggle(el, show) {
    if (el) el.classList.toggle('hidden', !show);
}

/** Thanh "Hoàn tác" nhỏ ở giữa phía trên, tự tắt sau `ms`. Dùng cho việc làm xong NGAY một chạm mà cả phòng thấy (chốt nhanh…). */
let undoTimer = 0;
export function showUndo(text, onUndo, ms = 5500) {
    let n = document.getElementById('rm-undo');
    if (!n) {
        n = document.createElement('div');
        n.id = 'rm-undo';
        n.className = 'rm-undo';
        n.setAttribute('role', 'status');
        n.innerHTML = '<span></span><button type="button">Hoàn tác</button>';
        document.body.appendChild(n);
    }
    const hide = () => { clearTimeout(undoTimer); n.classList.remove('is-on'); };
    n.firstChild.textContent = text;
    n.lastChild.onclick = () => { hide(); onUndo?.(); };
    n.classList.add('is-on');
    clearTimeout(undoTimer);
    undoTimer = setTimeout(hide, ms);
}
