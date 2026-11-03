// File: features/quiz/link.js
// Trang cổng của LINK DÙNG CHO 1 THIẾT BỊ (link.html?t=<mã>) — máy chủ: api/link.js.
//   1. Hỏi máy chủ link còn dùng được không (peek). Máy này đang giữ link → vào thẳng.
//   2. Chưa ai giữ → hiện nút "Mở trên máy này". Phải BẤM mới nhận: trình quét link của Messenger/Zalo không chạy JS / không bấm,
//      nên không bao giờ "chiếm" lượt thay người nhận.
//   3. Bấm: chưa đăng nhập thì đăng nhập ẨN DANH (Firebase Anonymous — phiên lưu trong trình duyệt này = "máy này"), rồi claim →
//      máy chủ ghi máy này là máy DUY NHẤT + cấp quyền đọc (firestore.rules linkGranted) → chuyển tới bộ đề / thư mục.
// Ứng dụng coi người dùng ẩn danh là KHÁCH ở mọi nơi (core/auth-session.js isReal) — kết quả làm bài lưu trên máy như khách.
import { auth } from '../../core/firebase-init.js';
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { apiUrl, deviceLabel } from '../../core/device-limit.js';

const token = (new URLSearchParams(location.search).get('t') || '').replace(/[^\w-]/g, '').slice(0, 64);
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

async function call(action, extra = {}) {
    const u = auth.currentUser;
    const headers = { 'Content-Type': 'application/json' };
    if (u) headers.Authorization = `Bearer ${await u.getIdToken()}`;
    const r = await fetch(apiUrl('api/link'), { method: 'POST', headers, body: JSON.stringify({ action, token, ...extra }), cache: 'no-store' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok && !data.status) throw Object.assign(new Error(data.error || `HTTP ${r.status}`), { status: r.status });
    return data;
}

const targetUrl = (kind, id, { viaLink = true } = {}) => kind === 'folder'
    ? `folder.html?id=${encodeURIComponent(id)}${viaLink ? `&link=${encodeURIComponent(token)}` : ''}`
    : `quiz.html?id=${encodeURIComponent(id)}`;

const fmtLeft = (ms) => {
    if (ms == null) return 'Không hết hạn';
    const h = (ms - Date.now()) / 3600000;
    return h < 1 ? `Còn ${Math.max(1, Math.round(h * 60))} phút` : h < 48 ? `Còn ${Math.round(h)} giờ` : `Còn ${Math.round(h / 24)} ngày`;
};

/** Vẽ thẻ: tone (pink | ok | warn | bad), icon, tiêu đề, chip, mô tả, ghi chú, nút. */
function paint({ tone = '', icon, kicker, title, chips = [], desc = '', note = '', actions = '' }) {
    $('lk-card').dataset.tone = tone;
    $('lk-icon').className = `fas ${icon}`;
    if (kicker != null) $('lk-kicker').textContent = kicker;
    $('lk-title').textContent = title;
    $('lk-meta').innerHTML = chips.map(c => `<span class="lk-chip"><i class="fas ${c.icon}"></i>${esc(c.text)}</span>`).join('');
    $('lk-desc').textContent = desc;
    $('lk-note').innerHTML = note ? `<i class="fas fa-circle-info"></i><span>${note}</span>` : '';
    $('lk-note').classList.toggle('hidden', !note);
    $('lk-actions').innerHTML = actions;
}

const HOME = `<a class="lk-btn lk-btn-ghost" href="../../index.html"><i class="fas fa-house"></i> Về trang chủ</a>`;
const RETRY = `<button type="button" class="lk-btn lk-btn-ghost" onclick="location.reload()"><i class="fas fa-rotate-right"></i> Thử lại</button>`;

function showStatus(status) {
    const map = {
        taken: ['fa-lock', 'Link đã được dùng trên thiết bị khác', 'Link này chỉ mở được trên MỘT thiết bị và đã có máy khác nhận trước. Nếu đó không phải bạn, hãy nhờ người chia sẻ thu hồi và gửi link mới.'],
        expired: ['fa-clock', 'Link đã hết hạn', 'Thời hạn của link đã qua nên không mở được nữa. Nhờ người chia sẻ gửi link mới nhé.'],
        missing: ['fa-link-slash', 'Link không còn hiệu lực', 'Link sai, đã bị thu hồi, hoặc bộ đề / thư mục đã bị xóa.'],
        unclaimed: ['fa-link-slash', 'Link không còn hiệu lực', 'Hãy mở lại đúng link được gửi cho bạn.']
    };
    const [icon, title, desc] = map[status] || map.missing;
    paint({ tone: status === 'expired' ? 'warn' : 'bad', icon, title, desc, actions: HOME });
}

async function claim(btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Đang mở…';
    try {
        if (!auth.currentUser) {
            try { await signInAnonymously(auth); }
            catch (e) {
                const off = ['auth/operation-not-allowed', 'auth/admin-restricted-operation'].includes(e?.code);
                paint({ tone: 'bad', icon: 'fa-triangle-exclamation', title: off ? 'Trang chưa sẵn sàng cho link 1 thiết bị' : 'Không mở được',
                    desc: off ? 'Chủ trang cần bật đăng nhập ẩn danh (Firebase → Authentication → Anonymous). Báo người chia sẻ giúp mình nhé.'
                        : 'Trình duyệt chặn lưu phiên (chế độ riêng tư / chặn cookie?). Thử trình duyệt thường rồi mở lại link.',
                    actions: RETRY + HOME });
                return;
            }
        }
        const r = await call('claim', { label: deviceLabel() });
        if (r.status === 'mine' || r.status === 'owner') {
            paint({ tone: 'ok', icon: 'fa-check', title: 'Đã mở trên máy này', desc: 'Đang chuyển tới nội dung…' });
            location.replace(targetUrl(r.kind, r.targetId, { viaLink: r.status === 'mine' }));
            return;
        }
        showStatus(r.status);
    } catch (e) {
        paint({ tone: 'bad', icon: 'fa-wifi', title: 'Chưa kết nối được máy chủ', desc: 'Kiểm tra mạng rồi thử lại. Link chưa bị dùng.', actions: RETRY + HOME });
    }
}

async function main() {
    if (!token) return showStatus('missing');
    try { await auth.authStateReady(); } catch (e) { /* vẫn hỏi được không kèm danh tính */ }
    let info;
    try { info = await call('peek'); }
    catch (e) {
        paint({ tone: 'bad', icon: 'fa-wifi', title: 'Chưa kết nối được máy chủ', desc: 'Kiểm tra mạng rồi thử lại.', actions: RETRY + HOME });
        return;
    }
    const what = info.kind === 'folder' ? 'Thư mục' : 'Bộ đề';
    // Máy này đang giữ link (mở lại) → vào thẳng (claim lại để làm mới quyền)
    if (info.status === 'mine') {
        paint({ tone: 'ok', icon: 'fa-check', kicker: `${what} · máy này đang giữ link`, title: info.title || what, desc: 'Đang mở…' });
        const btn = document.createElement('button');
        return claim(btn);
    }
    if (info.status === 'owner') {
        paint({
            icon: 'fa-crown', kicker: 'Link của bạn', title: info.title || what,
            desc: 'Đây là link 1 thiết bị do chính bạn tạo. Bạn mở thử sẽ KHÔNG tốn lượt — người nhận vẫn dùng được.',
            chips: [{ icon: 'fa-clock', text: fmtLeft(info.expiresAt) }],
            actions: `<a class="lk-btn lk-btn-main" href="${targetUrl(info.kind, info.targetId, { viaLink: false })}"><i class="fas fa-eye"></i> Xem ${what.toLowerCase()}</a>` + HOME
        });
        return;
    }
    if (info.status !== 'ok') return showStatus(info.status);

    const u = auth.currentUser;
    const chips = [
        info.kind === 'quiz' && info.count ? { icon: 'fa-list-ol', text: `${info.count} câu` } : null,
        info.ownerName ? { icon: 'fa-user', text: `Từ ${info.ownerName}` } : null,
        { icon: 'fa-clock', text: fmtLeft(info.expiresAt) }
    ].filter(Boolean);
    paint({
        icon: info.kind === 'folder' ? 'fa-folder-open' : 'fa-file-lines',
        kicker: `${what} được chia sẻ · link 1 thiết bị`,
        title: info.title || what,
        chips,
        desc: 'Link này chỉ mở được trên MỘT thiết bị. Bấm nút dưới để giữ link cho máy (trình duyệt) bạn đang dùng — sau đó máy khác sẽ không mở được nữa.',
        note: u && !u.isAnonymous
            ? `Bạn đang đăng nhập <b>${esc(u.email || u.displayName || 'tài khoản')}</b> — link sẽ gắn với tài khoản này.`
            : 'Hãy mở bằng trình duyệt bạn sẽ dùng để học. Không dùng tab ẩn danh và đừng xóa dữ liệu trình duyệt, không thì chính bạn cũng mất quyền vào.',
        actions: `<button type="button" id="lk-claim" class="lk-btn lk-btn-main"><i class="fas fa-mobile-screen"></i> Mở trên máy này</button>`
    });
    $('lk-claim').addEventListener('click', (e) => claim(e.currentTarget));
}

main();
