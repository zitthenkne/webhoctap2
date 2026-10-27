// File: features/quiz/share-access.js
// Khối "CHIA SẺ" kiểu Google Drive trong hộp Chia sẻ (#share-access-section — module tự dựng nội dung, trang chỉ cần thẻ rỗng):
//   • Người có quyền truy cập: chủ sở hữu (bạn) + từng người được mời, mỗi người một vai trò: Người xem / Người chỉnh sửa / Xóa quyền.
//   • Quyền truy cập chung: Hạn chế (chỉ người được thêm) / Bất kỳ ai có đường liên kết.
//   • Cài đặt: người xem được "Lưu bản sao" về thư viện của họ hay không (như Drive "Người xem có thể tải xuống, in và sao chép").
// Dùng chung cho thư viện (bộ đề / thư mục / chọn nhiều — library-actions.js) và trang làm bài (quiz.html, chỉ chủ bộ đề).
//
// Dữ liệu trên từng doc quiz_sets / quiz_folders (firestore.rules: sharedWithMe / editsAsEditor / validShare):
//   sharedWith: email chữ thường được XEM (email phải đã xác nhận) · editors ⊆ sharedWith: được SỬA nội dung bộ đề
//   sharedBy: tên người chia sẻ (hiện "từ ai") · allowTakeout: true = người khác được MANG ĐỀ ĐI (lưu bản sao, mở phòng "Làm cùng nhau",
//   lưu đề từ phòng) — thiếu/false (mặc định) = chỉ làm bài ngay trên web · isPublic: ai có link đều xem.
// Module không biết cache của nơi gọi: ghi lên các doc do `targets()` trả về (theo LÔ), sửa thẳng các object đó rồi gọi `onChange()`.

import { db } from '../../core/firebase-init.js';
import { doc, arrayUnion, arrayRemove, writeBatch } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { queued } from '../../core/offline-write.js';
import { sessionUser } from '../../core/auth-session.js';
import { emailForName } from '../../core/usernames.js';
import { showToast } from '../../core/utils.js';

export const MAX_SHARED = 50;          // khớp validShare() trong firestore.rules
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_LABEL = { viewer: 'Người xem', editor: 'Người chỉnh sửa' };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** publicUntil ở mọi dạng (Timestamp SDK / chuỗi ISO từ REST / Date / {seconds} đã qua cache / null) → mili-giây, null = không hết hạn. */
export function untilMsOf(v) {
    if (v == null || v === '') return null;
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'number') return v;
    if (typeof v === 'string') { const t = Date.parse(v); return Number.isNaN(t) ? null : t; }
    if (typeof v.seconds === 'number') return v.seconds * 1000;
    return null;
}
/** Link công khai còn mở được không (isPublic và chưa quá hạn) — khớp publicAlive() trong firestore.rules. */
export const publicAlive = (d) => !!d && d.isPublic === true && (untilMsOf(d.publicUntil) == null || untilMsOf(d.publicUntil) > Date.now());

/**
 * @typedef {Object} ShareTarget
 * @property {() => {isPublic?: boolean, sharedWith?: string[], editors?: string[], allowTakeout?: boolean, mixed?: boolean}} view
 *           trạng thái để vẽ (đọc lại mỗi lần vẽ); mixed = chọn nhiều bộ đề có chế độ công khai khác nhau
 * @property {() => Promise<Array<{col: string, id: string, obj: object}>>} targets  MỌI doc phải ghi khi đổi người / vai trò / cài đặt
 * @property {(makePublic: boolean, until: Date|null) => Promise<boolean>} setPublic  đổi quyền truy cập chung (until = hạn link công khai,
 *           null = không hết hạn); false = hủy/lỗi (ô chọn tự trả lại)
 * @property {() => void} [onChange]  sau khi ghi xong (lưu cache, vẽ lại thẻ…)
 * @property {string} [scope]  mô tả phạm vi, vd "cả thư mục" — hiện dưới tiêu đề
 * @property {string} [title]  tên bộ đề / thư mục — cho thư mời
 * @property {string} [link]   link mở mục này — cho thư mời
 */
let current = null;

/** Gắn một mục vào khối Chia sẻ và vẽ lại. Gọi mỗi lần mở hộp Chia sẻ. */
export function showShareAccess(target) {
    current = target;
    const section = document.getElementById('share-access-section');
    if (!section) return;
    build(section);
    section.classList.remove('hidden');
    render();
}

/** Ẩn khối (vd. người xem không phải chủ bộ đề ở trang làm bài). */
export function hideShareAccess() {
    current = null;
    document.getElementById('share-access-section')?.classList.add('hidden');
}

// ---------- Dựng khung (một lần) ----------
// Chỉ dùng icon có trong bộ icon rút gọn của trang làm bài (fa-quiz.css): fa-user-plus, fa-user-group, fa-lock, fa-share-nodes,
// fa-xmark, fa-arrow-up-right-from-square.
function build(section) {
    if (section.dataset.built) return;
    section.dataset.built = '1';
    section.className = 'bg-gray-50 rounded-2xl border border-gray-100 p-3 space-y-3';
    section.innerHTML = `
        <div>
            <p class="text-xs font-extrabold text-gray-600 mb-1.5 flex items-center gap-1.5"><i class="fas fa-user-plus text-pink-400"></i> Thêm người</p>
            <div class="flex gap-2">
                <input type="text" id="share-person-input" placeholder="Email / tên (nhiều người: cách nhau dấu phẩy)" autocomplete="off"
                    class="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-300">
                <select id="share-person-role" class="px-2 py-2 border border-gray-200 rounded-xl text-xs font-bold bg-white text-gray-600 focus:outline-none" aria-label="Vai trò người được thêm">
                    <option value="viewer">Người xem</option>
                    <option value="editor">Người chỉnh sửa</option>
                </select>
                <button type="button" id="share-person-add-btn" class="px-3 py-2 bg-[#FF69B4] text-white rounded-xl hover:bg-opacity-90 active:scale-95 transition font-bold text-xs shadow-sm">Thêm</button>
            </div>
        </div>
        <div>
            <p class="text-xs font-extrabold text-gray-600 mb-1.5 flex items-center gap-1.5"><i class="fas fa-user-group text-pink-400"></i> Người có quyền truy cập</p>
            <ul id="share-person-list" class="flex flex-col gap-1 overflow-y-auto" style="max-height:14rem"></ul>
        </div>
        <div>
            <p class="text-xs font-extrabold text-gray-600 mb-1.5">Quyền truy cập chung</p>
            <div class="flex items-start gap-2.5 bg-white border border-gray-100 rounded-xl p-2.5">
                <span id="share-general-icon" class="w-8 h-8 shrink-0 rounded-full flex items-center justify-center"></span>
                <div class="min-w-0 flex-1">
                    <select id="share-general-select" class="w-full text-sm font-bold text-gray-700 focus:outline-none cursor-pointer" style="background:transparent" aria-label="Quyền truy cập chung">
                        <option value="restricted">Hạn chế</option>
                        <option value="public">Bất kỳ ai có đường liên kết</option>
                        <option value="mixed" disabled hidden>Khác nhau giữa các bộ đề</option>
                    </select>
                    <p id="share-general-desc" class="text-[11px] text-gray-400 leading-snug mt-0.5"></p>
                    <div id="share-expiry-row" class="hidden items-center gap-2 mt-1.5" style="display:none">
                        <span class="text-[11px] font-bold text-gray-500">Link hết hạn sau</span>
                        <select id="share-expiry-select" class="text-[11px] font-bold text-gray-700 border border-gray-200 rounded-lg px-1.5 py-1 focus:outline-none" style="background:#fff" aria-label="Thời hạn link công khai">
                            <option value="1">1 giờ</option>
                            <option value="12" selected>12 giờ</option>
                            <option value="24">1 ngày</option>
                            <option value="168">7 ngày</option>
                            <option value="0">Không hết hạn</option>
                        </select>
                    </div>
                    <p id="share-expiry-at" class="text-[11px] font-semibold leading-snug mt-1"></p>
                </div>
            </div>
        </div>
        <label class="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" id="share-allow-copy" class="mt-0.5 w-4 h-4 cursor-pointer" style="accent-color:#ec4899">
            <span class="text-xs text-gray-600 leading-snug"><b>Cho người khác mang đề đi</b>
                <span class="block text-[11px] text-gray-400">Lưu bản sao về thư viện của họ, mở sang phòng "Làm cùng nhau", lưu đề từ phòng. Tắt (mặc định): người được chia sẻ chỉ làm bài ngay trên web, không chuyền trải nghiệm làm bài cho ai khác được.</span></span>
        </label>
        <p id="share-scope-note" class="hidden text-[11px] text-amber-600 font-semibold leading-snug"></p>`;
    bindOnce(section);
}

function render() {
    const t = current;
    const list = document.getElementById('share-person-list');
    const sel = document.getElementById('share-general-select');
    if (!t || !list || !sel) return;
    const v = t.view() || {};
    const people = v.sharedWith || [];
    const editors = new Set(v.editors || []);
    const me = sessionUser();
    const ownerRow = `
        <li class="flex items-center gap-2 px-2.5 py-1.5">
            <span class="w-7 h-7 shrink-0 rounded-full bg-pink-100 text-pink-500 text-xs font-extrabold flex items-center justify-center">${esc((me?.displayName || me?.email || '?').charAt(0).toUpperCase())}</span>
            <span class="min-w-0 flex-1"><span class="block text-xs font-bold text-gray-700 truncate">${esc(me?.displayName || 'Bạn')} (bạn)</span>
                <span class="block text-[11px] text-gray-400 truncate">${esc(me?.email || '')}</span></span>
            <span class="text-[11px] font-bold text-gray-400 pr-1">Chủ sở hữu</span>
        </li>`;
    list.innerHTML = ownerRow + people.map(e => {
        const role = editors.has(e) ? 'editor' : 'viewer';
        return `
        <li class="flex items-center gap-2 bg-white border border-gray-100 rounded-lg px-2.5 py-1.5" data-email="${esc(e)}">
            <span class="w-7 h-7 shrink-0 rounded-full bg-gray-100 text-gray-500 text-xs font-extrabold flex items-center justify-center">${esc(e.charAt(0).toUpperCase())}</span>
            <span class="min-w-0 flex-1 text-xs font-semibold text-gray-700 truncate" title="${esc(e)}">${esc(e)}</span>
            <a class="text-gray-300 hover:text-pink-500 transition px-1" href="${esc(inviteHref(t, e, role))}" title="Gửi thư mời cho ${esc(e)}" aria-label="Gửi thư mời"><i class="fas fa-arrow-up-right-from-square"></i></a>
            <select class="share-person-role text-[11px] font-bold text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-1.5 py-1 focus:outline-none" aria-label="Vai trò của ${esc(e)}">
                <option value="viewer"${role === 'viewer' ? ' selected' : ''}>${ROLE_LABEL.viewer}</option>
                <option value="editor"${role === 'editor' ? ' selected' : ''}>${ROLE_LABEL.editor}</option>
                <option value="remove">Xóa quyền truy cập</option>
            </select>
        </li>`;
    }).join('');

    const general = v.mixed ? 'mixed' : (v.isPublic === true ? 'public' : 'restricted');
    sel.value = general;
    const icon = document.getElementById('share-general-icon');
    const desc = document.getElementById('share-general-desc');
    if (icon) {
        icon.className = `w-8 h-8 shrink-0 rounded-full flex items-center justify-center ${general === 'public' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`;
        icon.innerHTML = `<i class="fas ${general === 'public' ? 'fa-share-nodes' : 'fa-lock'}"></i>`;
    }
    if (desc) desc.textContent = general === 'public'
        ? 'Bất kỳ ai có đường liên kết đều xem và làm bài được — không cần tài khoản (khách lưu kết quả trên máy của họ).'
        : general === 'mixed' ? 'Các bộ đề đã chọn đang khác nhau — chọn một chế độ để áp cho tất cả.'
        : 'Chỉ những người đã thêm ở trên mới mở được bằng đường liên kết (cần đăng nhập Google đúng email).';
    // Hạn link công khai (publicUntil — luật Firestore so với giờ máy chủ)
    const row = document.getElementById('share-expiry-row');
    const at = document.getElementById('share-expiry-at');
    if (row) row.style.display = general === 'public' ? 'flex' : 'none';
    if (at) {
        const until = untilMsOf(v.publicUntil);
        at.style.color = until != null && until <= Date.now() ? '#dc2626' : '#6b7280';
        at.textContent = general !== 'public' ? ''
            : until == null ? 'Link không hết hạn.'
            : until <= Date.now() ? 'Link ĐÃ HẾT HẠN — chọn thời hạn ở trên để gia hạn.'
            : `Link hết hạn lúc ${new Date(until).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })} — đổi thời hạn để gia hạn từ bây giờ.`;
    }
    const allow = document.getElementById('share-allow-copy');
    if (allow) allow.checked = v.allowTakeout === true;
    const note = document.getElementById('share-scope-note');
    if (note) { note.textContent = t.scope || ''; note.classList.toggle('hidden', !t.scope); }
}

// Thư mời qua ứng dụng mail của máy (mailto:) — web không có máy chủ gửi mail; người nhận cũng thấy mục ở "Được chia sẻ với tôi".
function inviteHref(t, email, role) {
    const who = sessionUser()?.displayName || 'Mình';
    const what = t.title || 'bộ đề';
    const subject = `${who} chia sẻ "${what}" với bạn trên Zitthenkne`;
    const body = `Chào bạn,\n\n${who} vừa chia sẻ "${what}" với bạn trên Zitthenkne (vai trò: ${ROLE_LABEL[role] || ROLE_LABEL.viewer}).\n\n`
        + `Mở link: ${t.link || location.origin}\n\n`
        + `Đăng nhập bằng đúng email ${email} (đăng nhập Google, hoặc email đã xác nhận) là mở được. `
        + `Mục này cũng nằm ở nút "Được chia sẻ với tôi" trong thư viện.`;
    return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function bindOnce(section) {
    const input = section.querySelector('#share-person-input');
    section.querySelector('#share-person-add-btn').addEventListener('click', addPerson);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addPerson(); } });
    section.querySelector('#share-person-list').addEventListener('change', (e) => {
        const sel = e.target.closest('.share-person-role');
        if (!sel) return;
        const email = sel.closest('li')?.dataset.email;
        if (email) changeRole(email, sel.value);
    });
    const general = section.querySelector('#share-general-select');
    const expiry = section.querySelector('#share-expiry-select');
    // Hạn tính TỪ BÂY GIỜ theo ô "Link hết hạn sau" (mặc định 12 giờ); "Không hết hạn" → null
    const chosenUntil = () => { const h = Number(expiry.value) || 0; return h ? new Date(Date.now() + h * 3600 * 1000) : null; };
    general.addEventListener('change', async () => {
        const t = current;
        if (!t || general.value === 'mixed') return;
        general.disabled = true;
        try { await t.setPublic(general.value === 'public', general.value === 'public' ? chosenUntil() : null); }
        finally { general.disabled = false; render(); }
    });
    // Đổi thời hạn khi đang công khai = gia hạn (tính lại từ bây giờ)
    expiry.addEventListener('change', async () => {
        const t = current;
        if (!t || general.value !== 'public') return;
        expiry.disabled = true;
        try { await t.setPublic(true, chosenUntil()); }
        finally { expiry.disabled = false; render(); }
    });
    const allow = section.querySelector('#share-allow-copy');
    allow.addEventListener('change', async () => {
        allow.disabled = true;
        const ok = await writeAll({ allowTakeout: allow.checked }, (o) => { o.allowTakeout = allow.checked; },
            allow.checked ? 'Đã cho người khác mang đề đi (lưu bản sao, mở phòng làm cùng).'
                : 'Đã khóa: người được chia sẻ chỉ làm bài ngay trên web, không mang đề đi được.');
        if (!ok) allow.checked = !allow.checked;
        allow.disabled = false;
    });
}

// ---------- Ghi ----------
// Thư mục lớn = hàng trăm doc: ghi theo LÔ (writeBatch, ≤ 450 thao tác/lô — giới hạn Firestore 500) thay vì từng updateDoc:
// mỗi lô là MỘT lượt mạng và nguyên tử (không có chuyện nửa nhánh đã chia sẻ, nửa chưa). Mất mạng: lô xếp hàng như mọi lệnh ghi (queued).
const BATCH_MAX = 450;
export async function commitInBatches(docs, patch) {
    for (let i = 0; i < docs.length; i += BATCH_MAX) {
        const batch = writeBatch(db);
        docs.slice(i, i + BATCH_MAX).forEach(d => batch.update(doc(db, d.col, d.id), patch));
        await queued(batch.commit());
    }
}

/** Ghi một patch lên mọi doc của mục đang mở + sửa object trong cache. Trả true khi xong. */
async function writeAll(patch, applyLocal, okMsg) {
    const t = current;
    if (!t) return false;
    try {
        const docs = await t.targets();
        await commitInBatches(docs, patch);
        docs.forEach(({ obj }) => applyLocal(obj));
        t.onChange?.();
        if (okMsg) showToast(okMsg, 'success', okMsg.length > 80 ? 6000 : 3000);
        render();
        return true;
    } catch (e) {
        console.error('Lỗi cập nhật chia sẻ:', e);
        showToast('Không cập nhật được quyền chia sẻ: ' + e.message, 'error');
        render();
        return false;
    }
}

const setOf = (arr) => new Set(arr || []);

/** Email / tên người dùng / nhiều mục cách nhau bởi dấu phẩy, chấm phẩy hoặc khoảng trắng → danh sách email hợp lệ (đã tra tên). */
async function resolveEmails(raw) {
    const parts = raw.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
    const out = [], bad = [];
    for (const p of parts) {
        let email = p;
        if (!p.includes('@')) {
            try { email = await emailForName(p); } catch (e) { email = null; }
            if (!email) { bad.push(p); continue; }
        }
        email = email.toLowerCase();
        if (EMAIL_RE.test(email)) out.push(email); else bad.push(p);
    }
    return { emails: [...new Set(out)], bad };
}

// Tên hiện cho người nhận ("từ …"): tên hiển thị, không có thì phần trước @ của email.
function ownerLabel() {
    const u = sessionUser();
    return (u?.displayName || (u?.email || '').split('@')[0] || '').slice(0, 80);
}

async function addPerson() {
    const input = document.getElementById('share-person-input');
    const btn = document.getElementById('share-person-add-btn');
    const role = document.getElementById('share-person-role')?.value === 'editor' ? 'editor' : 'viewer';
    const raw = (input?.value || '').trim();
    if (!raw) return input?.focus();
    if (btn) btn.disabled = true;
    try {
        const { emails, bad } = await resolveEmails(raw);
        if (bad.length) showToast(`Không nhận ra: ${bad.join(', ')} (tên chưa có ai dùng hoặc email sai).`, 'warning', 5000);
        const mine = (sessionUser()?.email || '').toLowerCase();
        const v = current?.view() || {};
        const have = setOf(v.sharedWith);
        const fresh = emails.filter(e => e !== mine && !have.has(e));
        if (!fresh.length) {
            if (!bad.length) showToast(emails.includes(mine) ? 'Đây là tài khoản của chính bạn.' : 'Những người này đã có quyền truy cập — đổi vai trò ở danh sách bên dưới.', 'info');
            return;
        }
        if (have.size + fresh.length > MAX_SHARED) return showToast(`Tối đa ${MAX_SHARED} người cho một bộ đề / thư mục.`, 'warning');
        const patch = { sharedWith: arrayUnion(...fresh), sharedBy: ownerLabel() };
        if (role === 'editor') patch.editors = arrayUnion(...fresh);
        const who = fresh.length === 1 ? fresh[0] : `${fresh.length} người`;
        const ok = await writeAll(patch, (o) => {
            o.sharedWith = [...new Set([...(o.sharedWith || []), ...fresh])];
            if (role === 'editor') o.editors = [...new Set([...(o.editors || []), ...fresh])];
            o.sharedBy = patch.sharedBy;
        }, `Đã chia sẻ với ${who} (${ROLE_LABEL[role]}). Bấm ↗ cạnh email để gửi thư mời — họ đăng nhập đúng email là mở được.`);
        if (ok && input) input.value = '';
    } finally { if (btn) btn.disabled = false; }
}

async function changeRole(email, role) {
    if (role === 'remove') {
        return writeAll({ sharedWith: arrayRemove(email), editors: arrayRemove(email) }, (o) => {
            o.sharedWith = (o.sharedWith || []).filter(x => x !== email);
            o.editors = (o.editors || []).filter(x => x !== email);
        }, `Đã xóa quyền truy cập của ${email}.`);
    }
    const toEditor = role === 'editor';
    // Lên "Người chỉnh sửa": thêm luôn vào sharedWith — luật đòi editors ⊆ sharedWith trên TỪNG doc, và trong thư mục có thể có bộ đề
    // chưa mang email này (thêm vào trước khi chia sẻ thư mục…) → thiếu một doc là cả lô ghi bị từ chối.
    const patch = toEditor ? { editors: arrayUnion(email), sharedWith: arrayUnion(email) } : { editors: arrayRemove(email) };
    return writeAll(patch, (o) => {
        const s = setOf(o.editors);
        toEditor ? s.add(email) : s.delete(email);
        o.editors = [...s];
        if (toEditor) o.sharedWith = [...new Set([...(o.sharedWith || []), email])];
    }, `${email} giờ là ${ROLE_LABEL[role]}.`);
}
