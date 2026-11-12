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
    : `quiz.html?id=${encodeURIComponent(id)}${viaLink ? `&link=${encodeURIComponent(token)}` : ''}`;   // &link → báo điểm cho chủ (link-progress.js)

const fmtLeft = (ms) => {
    if (ms == null) return 'Không hết hạn';
    const h = (ms - Date.now()) / 3600000;
    return h < 1 ? `Còn ${Math.max(1, Math.round(h * 60))} phút` : h < 48 ? `Còn ${Math.round(h)} giờ` : `Còn ${Math.round(h / 24)} ngày`;
};

// Màu pastel xoay vòng cho 3 ô thông tin / các chip (bảng màu data-c trong link.html)
const TILE_C = ['pink', 'lilac', 'mint'], CHIP_C = ['sky', 'butter', 'peach'];

/** Vẽ thẻ: tone (pink | ok | warn | bad), icon, tiêu đề, chip, mô tả, ghi chú, nút. Có ô thông tin (ticket) = màn mời nhận → bố cục 2 cột trên màn rộng. */
function paint({ tone = '', icon, kicker, title, chips = [], desc = '', note = '', actions = '', ticket = [] }) {
    const card = $('lk-card');
    card.classList.remove('is-loading');
    card.dataset.layout = ticket.length ? 'split' : 'solo';
    $('lk-ticket').innerHTML = ticket.map((t, i) => `<span class="lk-tk" data-c="${TILE_C[i % 3]}"><i class="fas ${t.icon}"></i><span><small>${esc(t.s)}</small><b>${esc(t.b)}</b></span></span>`).join('');
    $('lk-ticket').classList.toggle('hidden', !ticket.length);
    card.dataset.tone = tone;
    $('lk-icon').className = `fas ${icon}`;
    if (kicker != null) $('lk-kicker').textContent = kicker;
    $('lk-title').textContent = title;
    $('lk-meta').innerHTML = chips.map((c, i) => `<span class="lk-chip" data-c="${CHIP_C[i % 3]}"><i class="fas ${c.icon}"></i>${esc(c.text)}</span>`).join('');
    $('lk-desc').textContent = desc;
    $('lk-note').innerHTML = note ? `<i class="fas fa-circle-info"></i><span>${note}</span>` : '';
    $('lk-note').classList.toggle('hidden', !note);
    $('lk-actions').innerHTML = actions;
    $('lk-request').innerHTML = '';
    $('lk-request').className = '';
    $('lk-inapp').classList.add('hidden');
    $('lk-guide').classList.add('hidden');
}

// Trình duyệt NHÚNG trong app (Zalo, Messenger, Facebook…) có kho dữ liệu riêng: nhận link ở đây rồi sau mở bằng Chrome/Safari
// = 2 máy → bị chặn. Xem trước thì không sao (chưa tốn suất) — chỉ dặn đừng NHẬN / bắt đầu làm bài trong app.
const UA = navigator.userAgent || '';
const IN_APP = /Zalo/i.test(UA) ? 'Zalo' : /messenger/i.test(UA) ? 'Messenger' : /FBAN|FBAV|FB_IAB|FBIOS/.test(UA) ? 'Facebook'
    : /Instagram/.test(UA) ? 'Instagram' : /TikTok|musical_ly|Bytedance/i.test(UA) ? 'TikTok' : /\bLine\//.test(UA) ? 'LINE' : '';
const IOS = /iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
const ANDROID = /Android/.test(UA);
const BROWSER = IOS ? 'Safari' : 'Chrome';

/** Đang ở trong app → khung vàng: nút mở bằng Chrome (Android) / sao chép link + chỉ cách mở. */
function showInApp(kind) {
    if (!IN_APP) return;
    const el = $('lk-inapp');
    const act = kind === 'folder' ? 'bắt đầu làm bài' : 'bấm mở';
    const chrome = `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(location.href)};end`;
    el.innerHTML = `
        <p class="lk-inapp-h"><i class="fas fa-triangle-exclamation"></i><span><b>Bạn đang mở trong ${IN_APP}</b><small>Chuyển sang ${BROWSER} trước khi ${act}</small></span></p>
        <p>Xem trước thì không sao. Nhưng nếu ${act} ngay trong ${IN_APP}, link sẽ gắn với ${IN_APP} → lần sau mở bằng ${BROWSER} bị tính <b>máy khác</b> và bị chặn.</p>
        <ol>
            <li><span>Bấm <b>${IOS ? '⋯' : '⋮'}</b> ở góc trên màn hình</span></li>
            <li><span>Chọn <b>Mở bằng trình duyệt</b>${ANDROID ? ' — hoặc bấm nút dưới' : ' — hoặc chép link, dán vào Safari'}</span></li>
        </ol>
        <div class="lk-inapp-btns">
            ${ANDROID ? `<a class="lk-btn lk-btn-butter" href="${chrome}"><i class="fab fa-chrome"></i> Mở bằng Chrome</a>` : ''}
            <button type="button" class="lk-btn lk-btn-ghost" id="lk-copy"><i class="fas fa-copy"></i> Sao chép link</button>
        </div>`;
    el.classList.remove('hidden');
    $('lk-copy').addEventListener('click', async (e) => {
        const b = e.currentTarget;
        try { await navigator.clipboard.writeText(location.href); b.innerHTML = `<i class="fas fa-check"></i> Đã chép — dán vào ${BROWSER}`; }
        catch (err) {   // webview chặn clipboard → hiện ô link để tự chép
            if (!$('lk-copy-box')) b.insertAdjacentHTML('afterend', `<input id="lk-copy-box" class="lk-input" readonly value="${esc(location.href)}">`);
            $('lk-copy-box').select();
        }
    });
}

/** Ghi chú thiết bị: 3 bước (xem → gắn máy → vào lại) + 2 lưu ý (cái gì bị tính máy khác / lỡ bị chặn thì làm gì). */
function showGuide(kind) {
    const [s1, s1d] = kind === 'folder' ? ['Xem thư mục', 'Thoải mái, chưa tốn suất'] : ['Xem trang này', 'Chưa tốn suất'];
    const [s2, s2d] = kind === 'folder' ? ['Bắt đầu làm bài', 'Link gắn với máy này'] : ['Bấm mở', 'Link gắn với máy này'];
    $('lk-guide').innerHTML = `
        <p class="lk-guide-h">Link hoạt động thế nào</p>
        <ol class="lk-steps">
            <li class="lk-step" data-c="sky"><b><span>1</span>${s1}</b><small>${s1d}</small></li>
            <li class="lk-step" data-c="pink"><b><span>2</span>${s2}</b><small>${s2d}</small></li>
            <li class="lk-step" data-c="mint"><b><span>3</span>Vào lại</b><small>Cùng trình duyệt: mở lại link, tab mới, tắt máy… vẫn vào được</small></li>
        </ol>
        <div class="lk-alerts">
            <p class="lk-alert" data-c="peach"><i class="fas fa-circle-xmark"></i><span><b>Bị tính máy khác (bị chặn):</b> tab ẩn danh, trình duyệt khác, xóa dữ liệu duyệt web, mở trong Zalo/Messenger rồi sang ${BROWSER}${IOS ? ', Safari ↔ biểu tượng ngoài màn hình chính' : ''}.</span></p>
            <p class="lk-alert" data-c="lilac"><i class="fas fa-rotate-left"></i><span><b>Lỡ bị chặn:</b> mở lại bằng đúng trình duyệt lần đầu; vẫn không được thì bấm <b>Gửi yêu cầu truy cập</b>.</span></p>
        </div>`;
    $('lk-guide').classList.remove('hidden');
}

const HOME = `<a class="lk-btn lk-btn-ghost" href="../../index.html"><i class="fas fa-house"></i> Về trang chủ</a>`;
const RETRY = `<button type="button" class="lk-btn lk-btn-ghost" onclick="location.reload()"><i class="fas fa-rotate-right"></i> Thử lại</button>`;

function showStatus(status) {
    const map = {
        taken: ['fa-ticket', 'Link đã được sử dụng', 'Link này đã được kích hoạt trên thiết bị khác. Bạn có thể gửi yêu cầu truy cập bên dưới.'],
        blocked: ['fa-ticket', 'Thiết bị chưa được cấp quyền', 'Thiết bị này không còn trong danh sách truy cập của link. Bạn có thể gửi yêu cầu truy cập bên dưới.'],
        revoked: ['fa-link-slash', 'Link đã được đóng', 'Link này không còn hiệu lực. Bạn có thể gửi yêu cầu truy cập bên dưới.'],
        expired: ['fa-hourglass-end', 'Link đã hết hạn', 'Thời hạn truy cập của link đã kết thúc. Bạn có thể gửi yêu cầu truy cập bên dưới.'],
        missing: ['fa-link-slash', 'Không tìm thấy link', 'Link không đúng hoặc nội dung đã bị xóa.'],
        unclaimed: ['fa-link-slash', 'Không tìm thấy link', 'Vui lòng mở lại đúng link được gửi cho bạn.']
    };
    const [icon, title, desc] = map[status] || map.missing;
    // taken/blocked: thường do đổi trình duyệt (Zalo/Messenger → Chrome, ẩn danh…) → nói thẳng cách thử trước khi xin quyền
    const note = ['taken', 'blocked'].includes(status)
        ? `Nếu đây là máy của bạn: thường do mở bằng <b>trình duyệt khác lần đầu</b> (Zalo/Messenger, Chrome, Safari, tab ẩn danh). Thử mở link bằng đúng trình duyệt đó.`
        : '';
    paint({ tone: status === 'missing' || status === 'unclaimed' ? 'bad' : 'warn', icon, title, desc, note, actions: HOME });
    // Mọi trường hợp bị chặn mà link còn đó → cho gửi yêu cầu truy cập (máy chủ biết link trỏ tới đâu)
    if (['taken', 'blocked', 'revoked', 'expired'].includes(status)) mountAccessRequest($('lk-request'), { token });
}

// Thư mục: 'visit' = ghi nhận đã vào, KHÔNG tốn suất (bấm làm một bộ đề trong thư mục mới chiếm suất — folder.js startLinkQuiz).
// Bộ đề: 'claim' chiếm suất ngay (mở bộ đề là đọc được câu hỏi).
async function claim(btn, who = '', kind = 'quiz') {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Đang mở…';
    try {
        if (!auth.currentUser) {
            try { await signInAnonymously(auth); }
            catch (e) {
                const off = ['auth/operation-not-allowed', 'auth/admin-restricted-operation'].includes(e?.code);
                paint({ tone: 'bad', icon: 'fa-triangle-exclamation', title: off ? 'Trang chưa sẵn sàng cho link 1 thiết bị' : 'Không mở được',
                    desc: off ? 'Chủ trang cần bật đăng nhập ẩn danh (Firebase → Authentication → Anonymous). Vui lòng báo cho người chia sẻ.'
                        : 'Trình duyệt chặn lưu phiên (chế độ riêng tư / chặn cookie?). Thử trình duyệt thường rồi mở lại link.',
                    actions: RETRY + HOME });
                return;
            }
        }
        const r = await call(kind === 'folder' ? 'visit' : 'claim', { label: deviceLabel(), who });
        // Link nhóm: tên vừa bị máy khác giành / không có trong danh sách → tải lại danh sách, báo ngay trên thẻ
        const WHO_ERR = {
            whoTaken: `Tên “${who}” đã được xác nhận trên một thiết bị khác. Nếu có nhầm lẫn, vui lòng liên hệ người chia sẻ.`,
            notMember: `“${who}” không có trong danh sách nhóm. Vui lòng chọn đúng tên.`,
            needWho: 'Vui lòng chọn hoặc nhập tên trước khi tiếp tục.'
        };
        if (WHO_ERR[r.status]) return main(WHO_ERR[r.status]);
        if (['mine', 'owner', 'visitor'].includes(r.status)) {
            if (who) try { localStorage.setItem('linkWho', who); } catch (e) {}   // quiz-run.js ghi tên này cho trang Quản trị
            paint({ tone: 'ok', icon: 'fa-check', title: 'Đã mở trên máy này', desc: 'Đang chuyển tới nội dung…' });
            location.replace(targetUrl(r.kind, r.targetId, { viaLink: r.status !== 'owner' }));
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
        <p class="lk-ask">Chọn tên của bạn trong ${esc(info.name || 'nhóm')}</p>
        ${members.length ? `
            ${members.length > 12 ? '<input id="lk-who-find" class="lk-input" placeholder="Tìm tên…" autocomplete="off">' : ''}
            <div id="lk-who-list" class="lk-who" role="radiogroup">
                ${members.map(m => taken.has(key(m))
                    ? `<button type="button" disabled title="Đã có máy vào bằng tên này"><i class="fas fa-check"></i> ${esc(m)}</button>`
                    : `<button type="button" role="radio" aria-checked="false" data-who="${esc(m)}">${esc(m)}</button>`).join('')}
            </div>`
        : `<input id="lk-who-input" class="lk-input" maxlength="40" placeholder="Họ tên của bạn — vd: Nguyễn Minh" autocomplete="name"
              value="${esc(u && !u.isAnonymous ? (u.displayName || '') : '')}">`}
        <button type="button" id="lk-claim" class="lk-btn lk-btn-main" disabled><i class="fas fa-mobile-screen"></i> Mở trên thiết bị này</button>
        <p class="lk-left">Còn ${left}/${info.maxUses} chỗ trống</p>`;
    let who = '';
    const btn = $('lk-claim');
    const pick = (name) => {
        who = name.replace(/\s+/g, ' ').trim();
        btn.disabled = !who;
        btn.innerHTML = who ? `<i class="fas fa-check"></i> Xác nhận ${esc(who)} và mở` : '<i class="fas fa-mobile-screen"></i> Mở trên thiết bị này';
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
    btn.addEventListener('click', () => claim(btn, who, info.kind));
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
    // Máy này đã vào xem thư mục (chưa làm bài) → vào thẳng, vẫn chưa tốn suất
    if (info.status === 'mine' || (info.status === 'ok' && info.visitor)) {
        paint({ tone: 'ok', icon: 'fa-check', kicker: `${what} · thiết bị đã được xác nhận`, title: info.title || what, desc: 'Đang mở…' });
        const btn = document.createElement('button');
        return claim(btn, '', info.kind);
    }
    if (info.status === 'owner') {
        paint({
            icon: 'fa-crown', kicker: 'Link của bạn', title: info.title || what,
            desc: 'Đây là link do bạn tạo. Lượt mở của bạn không tính vào số thiết bị của link.',
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
        { icon: 'fa-clock', text: fmtLeft(info.expiresAt) }
    ].filter(Boolean);
    // Văn phong trung tính, không nêu người gửi: nói rõ link gắn với thiết bị như một thông tin, không phải lời cấm.
    const verb = info.kind === 'folder' ? 'Thư mục' : 'Bộ đề';
    // Thư mục: đã có máy khác vào xem nhưng chưa làm bài → báo rõ là CHƯA mất suất nào
    const seenNote = info.viewers
        ? `<b>Lưu ý:</b> link này đã từng được mở xem trên ${info.viewers > 1 ? `${info.viewers} thiết bị khác` : 'một thiết bị khác'} nhưng chưa làm bài, nên <b>chưa mất suất nào</b> (còn ${Math.max(0, uses - (info.used || 0))}/${uses} suất).`
        : '';
    const signedIn = !!u && !u.isAnonymous;   // đã đăng nhập thật → link gắn với tài khoản, không theo trình duyệt
    const UNLIMITED = { icon: 'fa-rotate-right', b: 'Không giới hạn', s: 'Số lần làm bài' };
    if (info.group) {
        paint({
            icon: 'fa-users',
            kicker: info.name ? `Link truy cập nhóm · ${info.name}` : 'Link truy cập nhóm',
            title: info.title || what,
            chips,
            desc: `${verb} này được chia sẻ cho ${info.name || 'nhóm'}. Vui lòng chọn tên của bạn để xác nhận; mỗi thành viên sử dụng trên 1 thiết bị.`,
            ticket: [
                info.name ? { icon: 'fa-users', b: info.name, s: 'Đối tượng' } : { icon: 'fa-users', b: 'Link nhóm', s: 'Loại link' },
                { icon: 'fa-mobile-screen', b: '1 thiết bị / người', s: 'Giới hạn truy cập' },
                UNLIMITED
            ],
            note: seenNote
        });
        if (!u || u.isAnonymous) { showInApp(info.kind); showGuide(info.kind); }
        return groupPicker(info, err);
    }
    paint({
        icon: info.kind === 'folder' ? 'fa-folder-open' : 'fa-file-lines',
        kicker: info.name ? `Link truy cập riêng · ${info.name}` : 'Link truy cập riêng',
        title: info.title || what,
        chips,
        desc: `${verb} này được chia sẻ riêng cho ${info.name || 'bạn'}. `
            + (info.kind === 'folder'
                ? `Xem thư mục thoải mái; khi bắt đầu làm một bộ đề, link mới được gắn với thiết bị này (tối đa ${uses} thiết bị).`
                : uses === 1 ? 'Link được gắn với thiết bị mở đầu tiên và chỉ sử dụng được trên thiết bị đó.'
                : `Link được gắn với ${uses} thiết bị mở đầu tiên và chỉ sử dụng được trên các thiết bị đó.`),
        ticket: [
            info.name ? { icon: 'fa-user', b: info.name, s: 'Người nhận' } : { icon: 'fa-lock', b: 'Riêng tư', s: 'Loại link' },
            { icon: 'fa-mobile-screen', b: `${uses} thiết bị`, s: 'Giới hạn truy cập' },
            UNLIMITED
        ],
        note: seenNote || (signedIn
            ? `Bạn đang đăng nhập <b>${esc(u.email || u.displayName || 'tài khoản')}</b> — link sẽ được gắn với tài khoản này.`
            : ''),
        // Trong app: nút nhận lùi xuống thành nút phụ — nút chính là "Mở bằng Chrome" trong khung vàng
        actions: !signedIn && IN_APP
            ? `<button type="button" id="lk-claim" class="lk-btn lk-btn-ghost"><i class="fas fa-mobile-screen"></i> Vẫn mở trong ${IN_APP}</button>`
            : `<button type="button" id="lk-claim" class="lk-btn lk-btn-main lk-btn-xl"><i class="fas fa-mobile-screen"></i>
                   <span class="lk-btn-txt">Mở trên thiết bị này<small>${info.kind === 'folder' ? 'Xem thư mục trước — chưa tốn suất' : 'Link sẽ gắn với máy này'}</small></span></button>
               ${signedIn ? '' : '<p class="lk-micro"><span><i class="fas fa-user-slash"></i>Không cần tài khoản</span><span><i class="fas fa-bolt"></i>Mở ngay, không cài đặt</span></p>'}`
    });
    if (!signedIn) { showInApp(info.kind); showGuide(info.kind); }
    $('lk-claim').addEventListener('click', (e) => claim(e.currentTarget, '', info.kind));
}

main();
