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
import { mountAccessRequest } from './access-request.js';

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
function paint({ tone = '', icon, kicker, title, chips = [], desc = '', note = '', actions = '', ticket = [] }) {
    $('lk-ticket').innerHTML = ticket.map(t => `<span class="lk-tk"><i class="fas ${t.icon}"></i><b>${esc(t.b)}</b><small>${esc(t.s)}</small></span>`).join('');
    $('lk-ticket').classList.toggle('hidden', !ticket.length);
    $('lk-card').dataset.tone = tone;
    $('lk-icon').className = `fas ${icon}`;
    if (kicker != null) $('lk-kicker').textContent = kicker;
    $('lk-title').textContent = title;
    $('lk-meta').innerHTML = chips.map(c => `<span class="lk-chip"><i class="fas ${c.icon}"></i>${esc(c.text)}</span>`).join('');
    $('lk-desc').textContent = desc;
    $('lk-note').innerHTML = note ? `<i class="fas fa-circle-info"></i><span>${note}</span>` : '';
    $('lk-note').classList.toggle('hidden', !note);
    $('lk-actions').innerHTML = actions;
    $('lk-request').innerHTML = '';
    $('lk-request').className = '';
}

const HOME = `<a class="lk-btn lk-btn-ghost" href="../../index.html"><i class="fas fa-house"></i> Về trang chủ</a>`;
const RETRY = `<button type="button" class="lk-btn lk-btn-ghost" onclick="location.reload()"><i class="fas fa-rotate-right"></i> Thử lại</button>`;

function showStatus(status) {
    const map = {
        taken: ['fa-ticket', 'Link này đã có người giữ rồi', 'Link được làm riêng và đã mở trên một thiết bị khác. Nếu bạn cũng muốn vào, nhắn người chia sẻ một câu ở dưới nhé.'],
        blocked: ['fa-ticket', 'Thiết bị này chưa có trong link', 'Người chia sẻ đã cập nhật lại danh sách thiết bị của link này. Bạn có thể nhắn họ ở dưới nhé.'],
        revoked: ['fa-envelope-open', 'Link đã được đóng lại', 'Người chia sẻ đã đóng link này. Nếu bạn vẫn cần, nhắn họ một câu ở dưới nhé.'],
        expired: ['fa-hourglass-end', 'Link đã hết hạn', 'Thời hạn của link đã qua. Bạn có thể nhắn người chia sẻ để xin lại ở dưới nhé.'],
        missing: ['fa-link-slash', 'Không tìm thấy link này', 'Có thể link bị gõ sai, hoặc nội dung đã được người chia sẻ xóa đi.'],
        unclaimed: ['fa-link-slash', 'Không tìm thấy link này', 'Hãy mở lại đúng link được gửi cho bạn nhé.']
    };
    const [icon, title, desc] = map[status] || map.missing;
    paint({ tone: status === 'missing' || status === 'unclaimed' ? 'bad' : 'warn', icon, title, desc, actions: HOME });
    // Mọi trường hợp bị chặn mà link còn đó → cho gửi yêu cầu truy cập (máy chủ biết link trỏ tới đâu)
    if (['taken', 'blocked', 'revoked', 'expired'].includes(status)) mountAccessRequest($('lk-request'), { token });
}

async function claim(btn, who = '') {
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
        const r = await call('claim', { label: deviceLabel(), who });
        // Link nhóm: tên vừa bị máy khác giành / không có trong danh sách → tải lại danh sách, báo ngay trên thẻ
        const WHO_ERR = {
            whoTaken: `Tên “${who}” vừa được một thiết bị khác chọn rồi. Nếu đó không phải bạn, nhắn người chia sẻ giúp nhé.`,
            notMember: `Chưa thấy “${who}” trong danh sách nhóm — bạn chọn lại tên mình nhé.`,
            needWho: 'Bạn chọn hoặc nhập tên mình trước nhé.'
        };
        if (WHO_ERR[r.status]) return main(WHO_ERR[r.status]);
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

/** Link nhóm: chọn tên trong danh sách (có danh sách) hoặc tự gõ tên → nút "Mình là … — mở trên máy này". */
function groupPicker(info, err) {
    const u = auth.currentUser;
    const key = (s) => String(s || '').trim().toLocaleLowerCase('vi');
    const taken = new Set((info.taken || []).map(key));
    const members = info.members || [];
    const left = Math.max(0, (info.maxUses || 1) - (info.used || 0));
    $('lk-actions').innerHTML = `
        ${err ? `<p class="lk-err"><i class="fas fa-triangle-exclamation"></i> ${esc(err)}</p>` : ''}
        <p class="lk-ask">Bạn là ai trong ${esc(info.name || 'nhóm')}?</p>
        ${members.length ? `
            ${members.length > 12 ? '<input id="lk-who-find" class="lk-input" placeholder="Tìm tên…" autocomplete="off">' : ''}
            <div id="lk-who-list" class="lk-who" role="radiogroup">
                ${members.map(m => taken.has(key(m))
                    ? `<button type="button" disabled title="Đã có máy vào bằng tên này"><i class="fas fa-check"></i> ${esc(m)}</button>`
                    : `<button type="button" role="radio" aria-checked="false" data-who="${esc(m)}">${esc(m)}</button>`).join('')}
            </div>`
        : `<input id="lk-who-input" class="lk-input" maxlength="40" placeholder="Họ tên của bạn — vd: Nguyễn Minh" autocomplete="name"
              value="${esc(u && !u.isAnonymous ? (u.displayName || '') : '')}">`}
        <button type="button" id="lk-claim" class="lk-btn lk-btn-main" disabled><i class="fas fa-mobile-screen"></i> Mở trên máy này</button>
        <p class="lk-left">Nhóm còn ${left}/${info.maxUses} chỗ trống</p>`;
    let who = '';
    const btn = $('lk-claim');
    const pick = (name) => {
        who = name.replace(/\s+/g, ' ').trim();
        btn.disabled = !who;
        btn.innerHTML = who ? `<i class="fas fa-check"></i> Mình là ${esc(who)} — mở trên máy này` : '<i class="fas fa-mobile-screen"></i> Mở trên máy này';
    };
    $('lk-who-list')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-who]');
        if (!b) return;
        $('lk-who-list').querySelectorAll('[data-who]').forEach(x => { const on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-checked', on); });
        pick(b.dataset.who);
    });
    $('lk-who-find')?.addEventListener('input', (e) => {
        const q = key(e.target.value);
        $('lk-who-list').querySelectorAll('button').forEach(b => { b.hidden = !!q && !key(b.textContent).includes(q); });
    });
    const input = $('lk-who-input');
    if (input) {
        input.addEventListener('input', () => pick(input.value));
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && who) btn.click(); });
        pick(input.value);
    }
    btn.addEventListener('click', () => claim(btn, who));
}

async function main(err = '') {
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
            desc: 'Đây là link riêng do chính bạn tạo. Bạn mở thử không tốn chỗ nào — người nhận vẫn dùng được.',
            chips: [{ icon: 'fa-clock', text: fmtLeft(info.expiresAt) }],
            actions: `<a class="lk-btn lk-btn-main" href="${targetUrl(info.kind, info.targetId, { viaLink: false })}"><i class="fas fa-eye"></i> Xem ${what.toLowerCase()}</a>` + HOME
        });
        return;
    }
    if (info.status !== 'ok') return showStatus(info.status);

    const u = auth.currentUser;
    const uses = info.maxUses || 1;
    const chips = [
        info.kind === 'quiz' && info.count ? { icon: 'fa-list-ol', text: `${info.count} câu` } : null,
        info.ownerName ? { icon: 'fa-user', text: `Từ ${info.ownerName}` } : null,
        { icon: 'fa-clock', text: fmtLeft(info.expiresAt) }
    ].filter(Boolean);
    // Giọng nhẹ nhàng: link là "vé mời riêng" — nói rõ gắn với 1 thiết bị nhưng như một lời dặn, không phải lời cấm.
    const verb = info.kind === 'folder' ? 'thư mục' : 'bộ đề';
    const from = info.ownerName || 'Một người bạn';
    const TIP = 'Mẹo nhỏ: mở bằng trình duyệt bạn hay dùng để học (không phải tab ẩn danh), lần sau quay lại là vào thẳng luôn.';
    const UNLIMITED = { icon: 'fa-infinity', b: 'Thoải mái', s: 'làm bao nhiêu lần cũng được' };
    if (info.group) {
        paint({
            icon: 'fa-users',
            kicker: info.name ? `Thiệp mời · ${info.name}` : 'Thiệp mời của nhóm',
            title: info.title || what,
            chips,
            desc: `${from} gửi ${verb} này cho cả ${info.name || 'nhóm'}. Mỗi bạn chọn tên mình — thiết bị bạn đang dùng sẽ được giữ chỗ cho riêng bạn.`,
            ticket: [
                { icon: 'fa-users', b: info.name || 'Cả nhóm', s: 'link chung của nhóm' },
                { icon: 'fa-mobile-screen', b: 'Mỗi bạn 1 máy', s: 'chọn tên là giữ chỗ' },
                UNLIMITED
            ],
            note: TIP
        });
        return groupPicker(info, err);
    }
    const ticket = [
        { icon: 'fa-heart', b: info.name ? `Riêng ${info.name}` : 'Riêng bạn', s: 'link làm riêng cho bạn' },
        { icon: 'fa-mobile-screen', b: uses === 1 ? '1 thiết bị' : `${uses} thiết bị`, s: uses === 1 ? 'gắn với máy mở đầu tiên' : 'gắn với các máy mở đầu tiên' },
        UNLIMITED
    ];
    paint({
        icon: info.kind === 'folder' ? 'fa-folder-open' : 'fa-envelope-open-text',
        kicker: info.name ? `Thiệp mời riêng · gửi ${info.name}` : 'Thiệp mời riêng',
        title: info.title || what,
        chips,
        desc: `${info.name ? `Chào ${info.name}! ` : ''}${from} gửi riêng ${verb} này cho bạn. `
            + (uses === 1 ? 'Link sẽ ở lại với thiết bị bạn mở đầu tiên, nên bạn giữ nó cho riêng mình nhé.'
                : `Link mở được trên ${uses} thiết bị, nên bạn giữ nó cho riêng mình nhé.`),
        ticket,
        note: u && !u.isAnonymous
            ? `Bạn đang đăng nhập <b>${esc(u.email || u.displayName || 'tài khoản')}</b> — link sẽ gắn với tài khoản này.`
            : TIP,
        actions: `<button type="button" id="lk-claim" class="lk-btn lk-btn-main"><i class="fas fa-envelope-open"></i> Mở trên máy này</button>`
    });
    $('lk-claim').addEventListener('click', (e) => claim(e.currentTarget));
}

main();
