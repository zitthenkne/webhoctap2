// File: features/quiz/link.js
// Trang cổng của LINK DÙNG CHO 1 THIẾT BỊ (link.html?t=<mã>) — máy chủ: api/link.js.
//   1. Hỏi máy chủ link còn dùng được không (peek). Máy này đang giữ link → vào thẳng.
//   2. Chưa ai giữ → hiện nút "Mở trên máy này". Phải BẤM mới nhận: trình quét link của Messenger/Zalo không chạy JS / không bấm,
//      nên không bao giờ "chiếm" lượt thay người nhận.
//   3. Bấm: chưa đăng nhập thì đăng nhập ẨN DANH (Firebase Anonymous — phiên lưu trong trình duyệt này = "máy này"), rồi claim →
//      máy chủ ghi máy này là máy DUY NHẤT + cấp quyền đọc (firestore.rules linkGranted) → chuyển tới bộ đề / thư mục.
// Ứng dụng coi người dùng ẩn danh là KHÁCH ở mọi nơi (core/auth-session.js isReal) — kết quả làm bài lưu trên máy như khách.
// Chỉ auth, KHÔNG Firestore (firebase-auth.js / api-url.js): đỡ tải + khởi tạo Firestore SDK trước khi hỏi máy chủ
import { auth } from '../../core/firebase-auth.js';
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { apiUrl, deviceLabel } from '../../core/api-url.js';
import { mountAccessRequest } from './access-request.js';

const token = (new URLSearchParams(location.search).get('t') || '').replace(/[^\w-]/g, '').slice(0, 64);
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

async function call(action, extra = {}) {
    const u = auth.currentUser;
    const headers = { 'Content-Type': 'application/json' };
    if (u) headers.Authorization = `Bearer ${await u.getIdToken()}`;
    const r = await fetch(apiUrl('api/link'), { method: 'POST', headers, body: JSON.stringify({ action, token, ...extra }), cache: 'no-store', keepalive: true });   // keepalive: claim nền vẫn tới máy chủ sau khi trang đã chuyển
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

// Kết quả peek (link gửi ai, mấy suất…) + trạng thái hiện tại → dòng "Gửi đến" vẽ ở MỌI màn, kể cả đã dùng / bị chặn / hết hạn.
let LINK = null, PILL = null;
const nameOf = () => LINK?.name || '';
const isGroup = () => !!LINK?.group;

/** Huy hiệu trạng thái cạnh tên người nhận: [kiểu màu, icon, chữ]. */
function pillOf(st, l = LINK || {}) {
    const uses = l.maxUses || 1, used = l.used || 0;
    if (st === 'ok' && l.visitor) st = 'visitor';
    return {
        ok: used ? ['part', 'fa-hourglass-half', `Đã dùng ${used}/${uses} thiết bị`]
            : ['new', 'fa-envelope', 'Chưa thiết bị nào nhận'],
        mine: ['mine', 'fa-circle-check', 'Đã xác nhận trên máy này'],
        visitor: ['mine', 'fa-eye', 'Máy này đã vào xem'],
        owner: ['own', 'fa-crown', `Đã dùng ${used}/${uses} thiết bị`],
        taken: ['used', 'fa-lock', uses > 1 ? `Đã đủ ${uses}/${uses} thiết bị` : 'Đã mở trên máy khác'],
        blocked: ['off', 'fa-ban', 'Máy này đã bị gỡ'],
        revoked: ['off', 'fa-link-slash', 'Link đã đóng'],
        expired: ['off', 'fa-hourglass-end', 'Link đã hết hạn']
    }[st] || null;
}

/** Nhãn "Gửi đến": loại link + tên người nhận / nhóm + quy mô + trạng thái. Không biết link (missing) → ẩn. */
function renderTo() {
    const el = $('lk-to');
    if (!LINK?.kind) { el.classList.add('hidden'); return; }
    const g = isGroup(), nm = nameOf();
    // Loại link đã có ở huy hiệu góc trên, số suất ở tấm vé → ở đây chỉ tên + trạng thái
    const sub = g && LINK.members?.length ? `${LINK.members.length} thành viên` : '';
    el.innerHTML = `<i class="fas ${g ? 'fa-users' : 'fa-envelope-open-text'}"></i>
        <span class="lk-to-txt"><small>Gửi đến</small>
            <b class="${nm ? '' : 'is-none'}">${esc(nm || (g ? 'Nhóm được chia sẻ' : 'Người nhận không ghi tên'))}</b>${sub ? `<em>${sub}</em>` : ''}</span>
        ${PILL ? `<span class="lk-to-pill" data-s="${PILL[0]}"><i class="fas ${PILL[1]}"></i>${esc(PILL[2])}</span>` : ''}`;
    el.classList.remove('hidden');
    $('lk-secure').innerHTML = `<i class="fas ${g ? 'fa-users' : 'fa-shield-heart'}"></i> ${g ? 'Link nhóm' : 'Link riêng'}`;
    document.querySelector('.lk-postmark small').textContent = g ? 'gửi nhóm' : 'gửi riêng';
}

/** Vẽ thẻ: tone (pink | ok | warn | bad), icon, tiêu đề, chip, mô tả, ghi chú, nút. Có ô thông tin (ticket) = màn mời nhận → bố cục 2 cột trên màn rộng.
 *  note: chuỗi HTML hoặc mảng; phần tử mảng có thể là [icon, html, lớp] (vd lớp 'is-warn'). */
function paint({ tone = '', icon, kicker, title, chips = [], desc = '', note = '', actions = '', ticket = [] }) {
    const card = $('lk-card');
    card.classList.remove('is-loading');
    card.dataset.layout = ticket.length ? 'split' : 'solo';
    renderTo();
    $('lk-ticket').innerHTML = ticket.map((t, i) => `<span class="lk-tk" data-c="${TILE_C[i % 3]}"><i class="fas ${t.icon}"></i><span><small>${esc(t.s)}</small><b>${esc(t.b)}</b></span></span>`).join('');
    $('lk-ticket').classList.toggle('hidden', !ticket.length);
    card.dataset.tone = tone;
    $('lk-icon').className = `fas ${icon}`;
    if (kicker != null) $('lk-kicker').textContent = kicker;
    $('lk-title').textContent = title;
    $('lk-meta').innerHTML = chips.map((c, i) => `<span class="lk-chip" data-c="${CHIP_C[i % 3]}"><i class="fas ${c.icon}"></i>${esc(c.text)}</span>`).join('');
    $('lk-desc').textContent = desc;
    $('lk-notes').innerHTML = [].concat(note).filter(Boolean).map(n => Array.isArray(n) ? n : ['fa-circle-info', n])
        .map(([ic, h, c = '']) => `<p class="lk-note ${c}"><i class="fas ${ic}"></i><span>${h}</span></p>`).join('');
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
        <p>${act[0].toUpperCase() + act.slice(1)} trong ${IN_APP} rồi sau mở bằng ${BROWSER} sẽ bị tính <b>máy khác</b> và bị chặn.</p>
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
    const [s1, s1d] = kind === 'folder' ? ['Xem thư mục', 'Chưa tốn suất'] : ['Xem trang này', 'Chưa tốn suất'];
    // Đã nhận là chốt: người nhận không tự gỡ / xoá lượt (máy chủ chặn unvisit khi đã giữ suất) — chỉ người gửi gỡ được
    const [s2, s2d] = kind === 'folder' ? ['Làm bài', 'Gắn với máy này, không tự gỡ'] : ['Bấm mở', 'Gắn với máy này, không tự gỡ'];
    $('lk-guide').innerHTML = `
        <p class="lk-guide-h">Cách dùng</p>
        <ol class="lk-steps">
            <li class="lk-step" data-c="sky"><b><span>1</span>${s1}</b><small>${s1d}</small></li>
            <li class="lk-step" data-c="pink"><b><span>2</span>${s2}</b><small>${s2d}</small></li>
            <li class="lk-step" data-c="mint"><b><span>3</span>Vào lại</b><small>Cùng trình duyệt là vào được</small></li>
        </ol>
        <div class="lk-alerts">
            <p class="lk-alert" data-c="peach"><i class="fas fa-circle-xmark"></i><span><b>Bị tính máy khác:</b> tab ẩn danh, trình duyệt khác, xoá dữ liệu duyệt web${IOS ? ', Safari ↔ biểu tượng màn hình chính' : ''}.</span></p>
            <p class="lk-alert" data-c="lilac"><i class="fas fa-rotate-left"></i><span><b>Lỡ bị chặn:</b> mở lại bằng trình duyệt lần đầu, hoặc gửi yêu cầu truy cập.</span></p>
        </div>`;
    $('lk-guide').classList.remove('hidden');
}

const HOME = `<a class="lk-btn lk-btn-ghost" href="../../index.html"><i class="fas fa-house"></i> Về trang chủ</a>`;
const RETRY = `<button type="button" class="lk-btn lk-btn-ghost" onclick="location.reload()"><i class="fas fa-rotate-right"></i> Thử lại</button>`;

/** visitor: máy này từng VÀO XEM thư mục (peek trả info.visitor) — hết suất lúc chưa kịp làm bài thì báo đúng lý do. */
function showStatus(status, visitor = false) {
    PILL = pillOf(status);
    const g = isGroup(), nm = nameOf();
    // Tên người nhận + trạng thái đã hiện ở ô "Gửi đến" → mô tả chỉ nói việc cần làm
    const ask = 'Cần vào thì gửi yêu cầu truy cập bên dưới.';
    const map = {
        taken: ['fa-ticket', 'Link đã được dùng', ask],
        blocked: ['fa-ban', 'Máy này đã bị gỡ', `Người gửi đã gỡ máy này khỏi link. ${ask}`],
        revoked: ['fa-link-slash', 'Link đã đóng', `Người gửi đã đóng link. ${ask}`],
        expired: ['fa-hourglass-end', 'Link đã hết hạn', ask],
        missing: ['fa-link-slash', 'Không tìm thấy link', 'Link sai hoặc nội dung đã bị xoá.'],
        unclaimed: ['fa-link-slash', 'Không tìm thấy link', 'Mở lại đúng link được gửi cho bạn.']
    };
    let [icon, title, desc] = map[status] || map.missing;
    if (status === 'taken' && visitor) { title = 'Link đã hết suất'; desc = `Máy này mới xem, chưa làm bài thì suất đã hết. ${ask}`; }
    // taken (máy lạ): thường do đổi trình duyệt (Zalo/Messenger → Chrome, ẩn danh…) → nói thẳng cách thử trước khi xin quyền.
    // blocked thì KHÔNG: máy được nhận ra đúng, chỉ là người chia sẻ đã gỡ.
    const note = status === 'taken' && !visitor
        ? `<b>${nm && !g ? `Là ${esc(nm)}?` : 'Máy của bạn?'}</b> Mở lại bằng đúng trình duyệt lần đầu (Zalo, Messenger, Chrome, Safari…).`
        : '';
    const chips = LINK?.title ? [{ icon: LINK.kind === 'folder' ? 'fa-folder' : 'fa-file-lines', text: LINK.title }] : [];
    const kicker = LINK?.kind === 'folder' ? 'Thư mục' : 'Bộ đề';
    paint({ tone: status === 'missing' || status === 'unclaimed' ? 'bad' : 'warn', icon, kicker, title, chips, desc, note, actions: HOME });
    // Mọi trường hợp bị chặn mà link còn đó → cho gửi yêu cầu truy cập (máy chủ biết link trỏ tới đâu)
    if (['taken', 'blocked', 'revoked', 'expired'].includes(status)) mountAccessRequest($('lk-request'), { token });
}

// Thư mục: 'visit' = ghi nhận đã vào, KHÔNG tốn suất (bấm làm một bộ đề trong thư mục mới chiếm suất — folder.js startLinkQuiz).
// Bộ đề: 'claim' chiếm suất ngay (mở bộ đề là đọc được câu hỏi).
// Phiên ẩn danh tạo SẴN lúc trang hiện nút (người nhận còn đang đọc / chọn tên) → bấm là gọi máy chủ luôn, khỏi chờ thêm ~0,5–1s.
// Chỉ tạo phiên, KHÔNG nhận link (nhận vẫn phải bấm). Lỗi thì quên promise để lúc bấm thử lại và báo lỗi.
let anonP = null;
const ensureAnon = () => auth.currentUser ? Promise.resolve()
    : (anonP ||= signInAnonymously(auth).catch((e) => { anonP = null; throw e; }));

async function claim(btn, who = '', kind = 'quiz') {
    btn.disabled = true;
    const step = (t) => { btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> ${t}`; };
    step(auth.currentUser ? 'Đang xác nhận thiết bị…' : 'Đang chuẩn bị thiết bị…');
    try {
        if (!auth.currentUser) {
            try { await ensureAnon(); step('Đang xác nhận thiết bị…'); }
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
            whoTaken: `Tên “${who}” đã được dùng để làm bài trên một thiết bị khác. Nếu có nhầm lẫn, vui lòng liên hệ người chia sẻ.`,
            notMember: `“${who}” không có trong danh sách nhóm. Vui lòng chọn đúng tên.`,
            needWho: 'Vui lòng chọn hoặc nhập tên trước khi tiếp tục.'
        };
        if (WHO_ERR[r.status]) return main(WHO_ERR[r.status]);
        if (['mine', 'owner', 'visitor'].includes(r.status)) {
            if (who) try { localStorage.setItem('linkWho', who); } catch (e) {}   // quiz-run.js ghi tên này cho trang Quản trị
            PILL = pillOf(r.status);
            if (who && PILL) PILL = [PILL[0], PILL[1], `Đã xác nhận: ${who}`];
            paint({ tone: 'ok', icon: 'fa-check', kicker: r.status === 'owner' ? 'Link của bạn' : 'Thiết bị đã được xác nhận',
                title: LINK?.title || 'Đã mở trên máy này', desc: r.kind === 'folder' ? 'Đang mở thư mục…' : 'Đang mở bộ đề…' });
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
                    ? `<button type="button" disabled title="Đã có máy làm bài bằng tên này"><i class="fas fa-check"></i> ${esc(m)}</button>`
                    : `<button type="button" role="radio" aria-checked="false" data-who="${esc(m)}">${esc(m)}</button>`).join('')}
            </div>`
        : `<input id="lk-who-input" class="lk-input" maxlength="40" placeholder="Họ tên của bạn — vd: Nguyễn Minh" autocomplete="name"
              value="${esc(u && !u.isAnonymous ? (u.displayName || '') : '')}">`}
        <button type="button" id="lk-claim" class="lk-btn lk-btn-main" disabled><i class="fas fa-mobile-screen"></i> Mở trên thiết bị này</button>
        <p class="lk-left">Còn ${left}/${info.maxUses} chỗ trống${members.length && taken.size ? ' · tên gạch = đã có người nhận' : ''}</p>`;
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
    LINK = info;
    PILL = pillOf(info.status);
    if (info.title) document.title = `${info.name ? `Gửi ${info.name} · ` : ''}${info.title} - Zitthenkne`;
    const what = info.kind === 'folder' ? 'Thư mục' : 'Bộ đề';
    const nm = info.name || '', g = !!info.group;
    // Máy này đang giữ link / đã vào xem thư mục → vào thẳng
    if (info.status === 'mine' || (info.status === 'ok' && info.visitor)) {
        paint({ tone: 'ok', icon: 'fa-check', kicker: 'Chào mừng quay lại', title: info.title || what, desc: 'Đang mở…' });
        // Thư mục: chuyển thẳng — trang thư mục tự kiểm + cấp quyền (action 'folder')
        if (info.kind === 'folder' && info.targetId) return location.replace(targetUrl('folder', info.targetId));
        // Bộ đề: quyền đọc đã cấp từ lần nhận đầu (gia hạn / gỡ thì máy chủ tự ghi lại) → chuyển NGAY, claim chạy nền (keepalive)
        // chỉ để đếm lượt vào cho chủ. Đỡ một lượt đi-về VN ↔ máy chủ Mỹ (~0,5–1s).
        if (info.status === 'mine' && info.targetId) {
            call('claim', { label: deviceLabel() }).catch(() => {});
            return location.replace(targetUrl('quiz', info.targetId));
        }
        return claim(document.createElement('button'), '', info.kind);
    }
    if (info.status === 'owner') {
        paint({
            icon: 'fa-crown', kicker: 'Link của bạn', title: info.title || what,
            desc: 'Bạn mở thì không tốn suất.',
            chips: [{ icon: 'fa-clock', text: fmtLeft(info.expiresAt) }],
            actions: `<a class="lk-btn lk-btn-main" href="${targetUrl(info.kind, info.targetId, { viaLink: false })}"><i class="fas fa-eye"></i> Xem ${what.toLowerCase()}</a>` + HOME
        });
        return;
    }
    if (info.status !== 'ok') return showStatus(info.status, info.visitor);
    if (!auth.currentUser) ensureAnon().catch(() => {});   // tạo sẵn phiên trong lúc người nhận đọc / chọn tên

    const u = auth.currentUser;
    const uses = info.maxUses || 1, left = Math.max(0, uses - (info.used || 0));
    const folder = info.kind === 'folder';
    const chips = info.kind === 'quiz' && info.count ? [{ icon: 'fa-list-ol', text: `${info.count} câu` }] : [];
    // Văn phong trung tính, không nêu người gửi: nói rõ link gắn với thiết bị như một thông tin, không phải lời cấm.
    // Thư mục: đã có máy khác vào xem nhưng chưa làm bài → báo rõ là CHƯA mất suất nào
    const seenNote = info.viewers ? `${info.viewers} máy khác đã mở xem nhưng chưa làm bài — <b>chưa mất suất</b>.` : '';
    const signedIn = !!u && !u.isAnonymous;   // đã đăng nhập thật → link gắn với tài khoản, không theo trình duyệt
    const EXPIRES = { icon: 'fa-clock', b: fmtLeft(info.expiresAt).replace(/^Còn /, ''), s: info.expiresAt == null ? 'Thời hạn' : 'Còn hạn' };
    const UNLIMITED = { icon: 'fa-rotate-right', b: 'Không giới hạn', s: 'Số lần làm bài' };
    if (g) {
        paint({
            icon: 'fa-users',
            kicker: what,
            title: info.title || what,
            chips,
            ticket: [
                { icon: 'fa-user-check', b: `${left}/${uses}`, s: 'Chỗ còn trống' },
                EXPIRES,
                UNLIMITED
            ],
            note: seenNote
        });
        if (!u || u.isAnonymous) { showInApp(info.kind); showGuide(info.kind); }
        return groupPicker(info, err);
    }
    paint({
        icon: folder ? 'fa-folder-open' : 'fa-file-lines',
        kicker: what,
        title: info.title || what,
        chips,
        // Cách link gắn máy đã có ở nút + "Cách dùng" → không lặp lại ở đây
        ticket: [
            { icon: 'fa-mobile-screen', b: `${left}/${uses}`, s: 'Suất còn trống' },
            EXPIRES,
            UNLIMITED
        ],
        note: [
            seenNote,
            signedIn ? `Link sẽ gắn với tài khoản <b>${esc(u.email || u.displayName || 'này')}</b>.` : ''
        ],
        // Trong app: nút nhận lùi xuống thành nút phụ — nút chính là "Mở bằng Chrome" trong khung vàng
        actions: !signedIn && IN_APP
            ? `<button type="button" id="lk-claim" class="lk-btn lk-btn-ghost"><i class="fas fa-mobile-screen"></i> Vẫn mở trong ${IN_APP}</button>`
            : `<button type="button" id="lk-claim" class="lk-btn lk-btn-main lk-btn-xl"><i class="fas fa-mobile-screen"></i>
                   <span class="lk-btn-txt">${nm ? `Tôi là ${esc(nm)} · mở` : 'Mở trên máy này'}<small>${folder ? 'Xem trước, chưa tốn suất' : 'Link gắn với máy này'}</small></span></button>
               ${signedIn ? '' : '<p class="lk-micro"><span><i class="fas fa-user-slash"></i>Không cần tài khoản</span><span><i class="fas fa-bolt"></i>Không cài đặt</span></p>'}`
    });
    if (!signedIn) { showInApp(info.kind); showGuide(info.kind); }
    $('lk-claim').addEventListener('click', (e) => claim(e.currentTarget, '', info.kind));
}

// folder.js gửi về kèm ?why=… khi tên đã xưng lúc xem không dùng được để làm bài → báo ngay trên danh sách chọn tên
const WHY = {
    whoTaken: 'Tên bạn chọn lúc xem đã được dùng để làm bài trên thiết bị khác. Vui lòng chọn lại đúng tên của bạn.',
    notMember: 'Tên bạn chọn lúc xem không còn trong danh sách nhóm. Vui lòng chọn lại.'
};
const why = new URLSearchParams(location.search).get('why');
if (why) try { history.replaceState(null, '', location.pathname + `?t=${encodeURIComponent(token)}`); } catch (e) {}   // tải lại không báo lỗi cũ
main(WHY[why] || '');
