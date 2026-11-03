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
import { showToast, showConfirm } from '../../core/utils.js';
import { auth } from '../../core/firebase-init.js';
import { apiUrl } from '../../core/device-limit.js';

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
 * @property {{kind: 'quiz'|'folder', id: string}} [oneTime]  có thì hiện khối "Link dùng cho 1 thiết bị" (api/link.js) — không có (chọn nhiều) thì ẩn
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
    loadOnce();
}

/** Ẩn khối (vd. người xem không phải chủ bộ đề ở trang làm bài). */
export function hideShareAccess() {
    current = null;
    document.getElementById('share-access-section')?.classList.add('hidden');
}

// ---------- Giao diện (2026-10-29) ----------
// CSS riêng chèn một lần (lớp .sa-*): chạy giống nhau ở trang chủ (tailwind-index.css đóng băng) và trang làm bài (tailwind-quiz.css +
// bộ icon rút gọn fa-quiz.css) — không phụ thuộc lớp Tailwind nào. Chỉ dùng icon có trong fa-quiz.css: fa-user-plus, fa-user-group,
// fa-lock, fa-share-nodes, fa-xmark, fa-arrow-up-right-from-square.
const CSS = `
.sa{--sa-ink:#3b2230;--sa-mute:#8a6f7c;--sa-line:#f0dbe4;--sa-pink:#ff69b4;--sa-pink-d:#e0559f;--sa-soft:#fff3f8;--sa-ok:#15925f;--sa-bad:#d14343;
  display:flex;flex-direction:column;gap:14px;padding:14px;border-radius:18px;background:#fff;border:1.5px solid var(--sa-line);color:var(--sa-ink);font-size:13px}
.sa.hidden{display:none}
.sa-h{display:flex;align-items:center;gap:7px;margin:0 0 8px;font-size:12px;font-weight:800;color:var(--sa-ink);letter-spacing:.01em}
.sa-h i{width:22px;height:22px;flex:none;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;color:var(--sa-pink-d);background:var(--sa-soft)}
.sa > div + div{padding-top:14px;border-top:1.5px dashed var(--sa-line)}
.sa-person:first-child{background:#fdf6f9}
.sa-person:first-child .sa-owner{padding:2px 8px;border-radius:999px;background:#fff;box-shadow:inset 0 0 0 1.5px var(--sa-line)}
.sa-badge{margin-left:auto;padding:1px 8px;border-radius:999px;background:var(--sa-soft);color:var(--sa-pink-d);font-size:11px;font-weight:800}
.sa-add{display:flex;gap:6px}
.sa-input{flex:1;min-width:0;height:38px;padding:0 11px;border-radius:11px;border:1.5px solid var(--sa-line);background:#fff;font-size:13px;color:var(--sa-ink);outline:0;transition:border-color .15s,box-shadow .15s}
.sa-input:focus{border-color:var(--sa-pink);box-shadow:0 0 0 3px rgba(255,105,180,.16)}
.sa-select{height:38px;padding:0 6px;border-radius:11px;border:1.5px solid var(--sa-line);background:#fff;font-size:12px;font-weight:700;color:#5b4250;outline:0;cursor:pointer}
.sa-btn{height:38px;padding:0 14px;border-radius:11px;border:0;background:var(--sa-pink);color:#fff;font-size:12px;font-weight:800;cursor:pointer;box-shadow:0 2px 0 var(--sa-pink-d);transition:transform .1s,opacity .15s}
.sa-btn:active{transform:translateY(1px);box-shadow:none}.sa-btn:disabled{opacity:.55;cursor:wait}
.sa-list{list-style:none;margin:0;padding:2px;display:flex;flex-direction:column;gap:4px;max-height:220px;overflow-y:auto}
.sa-person{display:flex;align-items:center;gap:9px;padding:7px 8px;border-radius:12px;transition:background .15s}
.sa-person:hover{background:#fdf6f9}
.sa-av{width:30px;height:30px;flex:none;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#fff}
.sa-who{min-width:0;flex:1;display:flex;flex-direction:column}
.sa-name{font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sa-sub{font-size:11px;color:var(--sa-mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sa-owner{font-size:11px;font-weight:800;color:var(--sa-mute);padding-right:4px}
.sa-role{height:30px;padding:0 4px;border-radius:9px;border:1.5px solid transparent;background:transparent;font-size:12px;font-weight:700;color:#5b4250;cursor:pointer;outline:0}
.sa-role:hover,.sa-role:focus{border-color:var(--sa-line);background:#fff}
.sa-icon{width:28px;height:28px;flex:none;border-radius:9px;display:flex;align-items:center;justify-content:center;color:#c7a9b7;text-decoration:none}
.sa-icon:hover{background:var(--sa-soft);color:var(--sa-pink)}
.sa-empty{padding:6px 8px;font-size:12px;color:var(--sa-mute);font-style:italic}
.sa-general{display:flex;align-items:flex-start;gap:10px;padding:11px;border-radius:14px;background:#fcf8fa;border:1.5px solid var(--sa-line)}
.sa-gicon{width:36px;height:36px;flex:none;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:14px;background:#efe6ea;color:#7b6470;transition:background .2s,color .2s}
.sa-gicon.is-public{background:#dcf5ea;color:var(--sa-ok)}
.sa-gmain{min-width:0;flex:1}
.sa-seg{display:flex;gap:3px;padding:3px;border-radius:12px;background:#fff;border:1.5px solid var(--sa-line)}
.sa-seg button{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:0;background:transparent;padding:7px 10px;border-radius:9px;font-size:12px;font-weight:800;color:var(--sa-mute);cursor:pointer;white-space:nowrap;transition:background .15s,color .15s}
.sa-seg button i{font-size:10px}
.sa-seg button:hover:not(.is-on){background:var(--sa-soft);color:var(--sa-pink-d)}
.sa-seg button.is-on{background:var(--sa-ink);color:#fff;box-shadow:0 2px 0 rgba(0,0,0,.18)}
.sa-seg button[data-general="public"].is-on{background:var(--sa-ok)}
.sa-desc{margin:6px 0 0;font-size:11.5px;line-height:1.45;color:var(--sa-mute)}
.sa-expiry{margin-top:10px;padding-top:10px;border-top:1.5px dashed var(--sa-line)}
.sa-expiry.hidden{display:none}
.sa-mini{display:block;margin-bottom:6px;font-size:11px;font-weight:800;color:#5b4250}
.sa-chips{display:flex;flex-wrap:wrap;gap:5px}
.sa-chips button{border:1.5px solid var(--sa-line);background:#fff;padding:5px 10px;border-radius:999px;font-size:11.5px;font-weight:800;color:#5b4250;cursor:pointer;transition:all .15s}
.sa-chips button:hover{border-color:var(--sa-pink)}
.sa-chips button.is-on{background:var(--sa-soft);border-color:var(--sa-pink);color:var(--sa-pink-d)}
.sa-at{margin:7px 0 0;font-size:11.5px;font-weight:700;color:var(--sa-mute)}
.sa-at.is-bad{color:var(--sa-bad)}.sa-at.is-ok{color:var(--sa-ok)}
.sa-switch-row{display:flex;align-items:flex-start;gap:12px;padding:11px;border-radius:14px;background:#fcf8fa;border:1.5px solid var(--sa-line);cursor:pointer}
.sa-switch-row b{display:block;font-size:12.5px;margin-bottom:2px}
.sa-switch-row small{display:block;font-size:11px;line-height:1.45;color:var(--sa-mute)}
.sa-switch{position:relative;flex:none;width:40px;height:24px;margin-top:2px}
.sa-switch input{position:absolute;opacity:0;width:100%;height:100%;margin:0;cursor:pointer}
.sa-switch i{position:absolute;inset:0;border-radius:999px;background:#dccbd3;transition:background .2s;pointer-events:none}
.sa-switch i::after{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:999px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .2s}
.sa-switch input:checked + i{background:var(--sa-pink)}
.sa-switch input:checked + i::after{transform:translateX(16px)}
.sa-switch input:focus-visible + i{box-shadow:0 0 0 3px rgba(255,105,180,.3)}
.sa-note{margin:0;padding:8px 10px;border-radius:11px;background:#fff8e6;color:#9a6a00;font-size:11.5px;font-weight:700;line-height:1.4}
.sa-note.hidden{display:none}
.sa-once.hidden{display:none}
.sa-once-new{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:8px 0}
.sa-once-new .sa-chips{flex:1 1 200px}
.sa-once-new .sa-btn{display:inline-flex;align-items:center;gap:6px}
button.sa-icon{border:0;background:transparent;cursor:pointer;padding:0}
.sa-once-row .sa-av{font-size:12px}
.sa-once-row.is-expired{opacity:.62}
.sa-once-row .sa-name b{font-weight:800}
@media (max-width:420px){.sa{padding:12px}.sa-add{flex-wrap:wrap}.sa-input{flex-basis:100%}.sa-select{flex:1}}
`;
function injectCss() {
    if (document.getElementById('sa-style')) return;
    const s = document.createElement('style');
    s.id = 'sa-style';
    s.textContent = CSS;
    document.head.appendChild(s);
}

const HOUR_CHOICES = [[1, '1 giờ'], [12, '12 giờ'], [24, '1 ngày'], [168, '7 ngày'], [0, 'Không hết hạn']];
let expiryHours = 12;          // thời hạn đang chọn cho link công khai (mặc định 12 giờ như web)
const ONCE_HOURS = [[24, '1 ngày'], [168, '7 ngày'], [720, '30 ngày'], [0, 'Không hạn']];   // khớp HOUR_CHOICES trong api/link.js
let onceHours = 168;
const AV_COLORS = ['#f472b6', '#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#fb923c', '#f87171', '#2dd4bf'];
const avColor = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AV_COLORS[h % AV_COLORS.length]; };
const fmtUntil = (ms) => new Date(ms).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
const leftText = (ms) => {
    const h = (ms - Date.now()) / 3600000;
    return h < 1 ? `còn ${Math.max(1, Math.round(h * 60))} phút` : h < 48 ? `còn ${Math.round(h)} giờ` : `còn ${Math.round(h / 24)} ngày`;
};

function build(section) {
    if (section.dataset.built) return;
    section.dataset.built = '1';
    injectCss();
    section.className = 'sa';
    section.innerHTML = `
        <div>
            <p class="sa-h"><i class="fas fa-user-plus"></i> Thêm người</p>
            <div class="sa-add">
                <input type="text" id="share-person-input" class="sa-input" placeholder="Email hoặc tên — nhiều người cách nhau dấu phẩy" autocomplete="off" spellcheck="false">
                <select id="share-person-role" class="sa-select" aria-label="Vai trò người được thêm">
                    <option value="viewer">Người xem</option>
                    <option value="editor">Người chỉnh sửa</option>
                </select>
                <button type="button" id="share-person-add-btn" class="sa-btn">Thêm</button>
            </div>
        </div>
        <div>
            <p class="sa-h"><i class="fas fa-user-group"></i> Người có quyền truy cập <span id="share-count" class="sa-badge"></span></p>
            <ul id="share-person-list" class="sa-list"></ul>
        </div>
        <div>
            <p class="sa-h"><i class="fas fa-share-nodes"></i> Quyền truy cập chung</p>
            <div class="sa-general">
                <span id="share-general-icon" class="sa-gicon"><i class="fas fa-lock"></i></span>
                <div class="sa-gmain">
                    <div class="sa-seg" role="radiogroup" aria-label="Quyền truy cập chung">
                        <button type="button" data-general="restricted" role="radio"><i class="fas fa-lock"></i> Hạn chế</button>
                        <button type="button" data-general="public" role="radio"><i class="fas fa-share-nodes"></i> Ai có link</button>
                    </div>
                    <p id="share-general-desc" class="sa-desc"></p>
                    <div id="share-expiry-row" class="sa-expiry hidden">
                        <span class="sa-mini">Link tự hết hạn sau</span>
                        <div class="sa-chips" role="radiogroup" aria-label="Thời hạn link công khai">
                            ${HOUR_CHOICES.map(([h, l]) => `<button type="button" data-hours="${h}" role="radio">${l}</button>`).join('')}
                        </div>
                        <p id="share-expiry-at" class="sa-at"></p>
                    </div>
                </div>
            </div>
        </div>
        <div id="sa-once" class="sa-once hidden">
            <p class="sa-h"><i class="fas fa-mobile-screen"></i> Link dùng cho 1 thiết bị <span id="sa-once-count" class="sa-badge"></span></p>
            <p class="sa-desc" style="margin:0">Không cần tài khoản: máy đầu tiên bấm mở sẽ giữ link, máy khác mở bị chặn. Hết hạn là đóng. Mỗi người một link.</p>
            <div class="sa-once-new">
                <div class="sa-chips" role="radiogroup" aria-label="Thời hạn link 1 thiết bị">
                    ${ONCE_HOURS.map(([h, l]) => `<button type="button" data-once-hours="${h}" role="radio">${l}</button>`).join('')}
                </div>
                <button type="button" id="sa-once-create" class="sa-btn"><i class="fas fa-mobile-screen"></i> Tạo link</button>
            </div>
            <ul id="sa-once-list" class="sa-list"></ul>
        </div>
        <label class="sa-switch-row">
            <span class="sa-switch"><input type="checkbox" id="share-allow-copy"><i></i></span>
            <span><b>Cho người khác mang đề đi</b>
                <small>Lưu bản sao về thư viện của họ, mở sang phòng "Làm cùng nhau". Tắt (mặc định): chỉ làm bài ngay trên web của bạn.</small></span>
        </label>
        <p id="share-scope-note" class="sa-note hidden"></p>`;
    bindOnce(section);
}

function render() {
    const t = current;
    const list = document.getElementById('share-person-list');
    if (!t || !list) return;
    const v = t.view() || {};
    const people = v.sharedWith || [];
    const editors = new Set(v.editors || []);
    const me = sessionUser();
    const meName = me?.displayName || (me?.email || 'Bạn').split('@')[0];
    const ownerRow = `
        <li class="sa-person">
            <span class="sa-av" style="background:${avColor(me?.email || 'me')}">${esc(meName.charAt(0).toUpperCase())}</span>
            <span class="sa-who"><span class="sa-name">${esc(meName)} (bạn)</span><span class="sa-sub">${esc(me?.email || '')}</span></span>
            <span class="sa-owner">Chủ sở hữu</span>
        </li>`;
    list.innerHTML = ownerRow + (people.length ? people.map(e => {
        const role = editors.has(e) ? 'editor' : 'viewer';
        return `
        <li class="sa-person" data-email="${esc(e)}">
            <span class="sa-av" style="background:${avColor(e)}">${esc(e.charAt(0).toUpperCase())}</span>
            <span class="sa-who"><span class="sa-name" title="${esc(e)}">${esc(e.split('@')[0])}</span><span class="sa-sub">${esc(e)}</span></span>
            <a class="sa-icon" href="${esc(inviteHref(t, e, role))}" title="Gửi thư mời qua email" aria-label="Gửi thư mời cho ${esc(e)}"><i class="fas fa-arrow-up-right-from-square"></i></a>
            <select class="share-person-role sa-role" aria-label="Vai trò của ${esc(e)}">
                <option value="viewer"${role === 'viewer' ? ' selected' : ''}>${ROLE_LABEL.viewer}</option>
                <option value="editor"${role === 'editor' ? ' selected' : ''}>${ROLE_LABEL.editor}</option>
                <option value="remove">Xóa quyền truy cập</option>
            </select>
        </li>`;
    }).join('') : `<li class="sa-empty">Chưa chia sẻ riêng cho ai — thêm email ở trên.</li>`);
    const count = document.getElementById('share-count');
    if (count) count.textContent = people.length ? `${people.length} người` : '';

    const general = v.mixed ? 'mixed' : (v.isPublic === true ? 'public' : 'restricted');
    document.querySelectorAll('#share-access-section [data-general]').forEach(b => {
        const on = b.dataset.general === general;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    const icon = document.getElementById('share-general-icon');
    if (icon) {
        icon.classList.toggle('is-public', general === 'public');
        icon.innerHTML = `<i class="fas ${general === 'public' ? 'fa-share-nodes' : 'fa-lock'}"></i>`;
    }
    const desc = document.getElementById('share-general-desc');
    if (desc) desc.textContent = general === 'public'
        ? 'Ai có đường liên kết đều xem và làm bài được, không cần tài khoản (khách lưu kết quả trên máy của họ).'
        : general === 'mixed' ? 'Các bộ đề đã chọn đang khác nhau — chọn một chế độ để áp cho tất cả.'
        : 'Chỉ những người trong danh sách trên mở được — đăng nhập Google đúng email, tối đa 2 máy.';

    // Hạn link công khai (publicUntil — luật Firestore so với giờ máy chủ)
    document.getElementById('share-expiry-row')?.classList.toggle('hidden', general !== 'public');
    document.querySelectorAll('#share-access-section [data-hours]').forEach(b => {
        const on = Number(b.dataset.hours) === expiryHours;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    const until = untilMsOf(v.publicUntil);
    const dead = until != null && until <= Date.now();
    // Viên trạng thái ở đầu hộp (index.html #share-status-pill — trang làm bài không có thì thôi)
    const pill = document.getElementById('share-status-pill');
    if (pill) {
        const who = people.length ? ` · ${people.length} người` : '';
        pill.className = 'sm-status' + (general === 'public' ? (dead ? ' is-expired' : ' is-public') : '');
        pill.innerHTML = general === 'public'
            ? `<i class="fas fa-share-nodes"></i> Ai có link · ${dead ? 'đã hết hạn' : until == null ? 'không hết hạn' : leftText(until)}${who}`
            : general === 'mixed' ? `<i class="fas fa-layer-group"></i> Chế độ đang khác nhau${who}`
            : `<i class="fas fa-lock"></i> Hạn chế${who || ' · chỉ mình bạn'}`;
    }
    const at = document.getElementById('share-expiry-at');
    if (at) {
        at.className = 'sa-at' + (dead ? ' is-bad' : general === 'public' ? ' is-ok' : '');
        at.textContent = general !== 'public' ? ''
            : until == null ? 'Đang mở: không hết hạn.'
            : dead ? 'Link ĐÃ HẾT HẠN — chọn một thời hạn ở trên để mở lại.'
            : `Đang mở tới ${fmtUntil(until)} (${leftText(until)}) — chọn thời hạn để gia hạn từ bây giờ.`;
    }
    const allow = document.getElementById('share-allow-copy');
    if (allow) allow.checked = v.allowTakeout === true;
    const note = document.getElementById('share-scope-note');
    if (note) { note.textContent = t.scope || ''; note.classList.toggle('hidden', !t.scope); }
    renderOnce();
}

// ---------- LINK DÙNG CHO 1 THIẾT BỊ (api/link.js; trang người nhận: features/quiz/link.html) ----------
// Mục vẫn RIÊNG TƯ. Mỗi link có mã ngẫu nhiên; máy (trình duyệt) đầu tiên bấm mở giữ link, máy khác bị chặn; hết hạn là đóng.
let once = { key: '', links: [], loading: false, error: '' };
const onceUrl = (token) => new URL(`features/quiz/link.html?t=${encodeURIComponent(token)}`, location.origin).href;

async function onceApi(action, extra = {}) {
    const u = auth.currentUser;
    if (!u || u.isAnonymous) throw new Error('Cần đăng nhập để quản lý link.');
    const r = await fetch(apiUrl('api/link'), {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await u.getIdToken()}` },
        body: JSON.stringify({ action, ...extra })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    return d;
}

async function loadOnce() {
    const o = current?.oneTime;
    if (!o) { once = { key: '', links: [], loading: false, error: '' }; return renderOnce(); }
    const key = `${o.kind}:${o.id}`;
    once = { key, links: once.key === key ? once.links : [], loading: true, error: '' };
    renderOnce();
    try {
        const d = await onceApi('list', { kind: o.kind, id: o.id });
        if (once.key === key) once.links = d.links || [];
    } catch (e) { if (once.key === key) once.error = e.message; }
    if (once.key === key) { once.loading = false; renderOnce(); }
}

const onceState = (l) => (l.expiresAt != null && l.expiresAt <= Date.now()) ? 'expired' : l.claimed ? 'used' : 'free';

function renderOnce() {
    const box = document.getElementById('sa-once');
    if (!box) return;
    const on = !!current?.oneTime;
    box.classList.toggle('hidden', !on);
    if (!on) return;
    box.querySelectorAll('[data-once-hours]').forEach(b => {
        const sel = Number(b.dataset.onceHours) === onceHours;
        b.classList.toggle('is-on', sel);
        b.setAttribute('aria-checked', sel ? 'true' : 'false');
    });
    const live = once.links.filter(l => onceState(l) !== 'expired').length;
    const count = document.getElementById('sa-once-count');
    if (count) count.textContent = live ? `${live} link` : '';
    const list = document.getElementById('sa-once-list');
    if (!list) return;
    if (!once.links.length) {
        list.innerHTML = `<li class="sa-empty">${once.loading ? 'Đang tải danh sách link…' : once.error ? esc('Không tải được: ' + once.error) : 'Chưa có link nào — chọn thời hạn rồi bấm Tạo link.'}</li>`;
        return;
    }
    const STYLE = {
        free: { c: '#60a5fa', i: 'fa-mobile-screen' },
        used: { c: '#34c38f', i: 'fa-check' },
        expired: { c: '#c4b5bd', i: 'fa-clock' }
    };
    list.innerHTML = once.links.map(l => {
        const st = onceState(l), s = STYLE[st];
        const place = [l.claimCity, l.claimCountry].filter(Boolean).join(', ');
        const left = l.expiresAt == null ? 'không hết hạn' : leftText(l.expiresAt);
        const name = st === 'used' ? `Đã mở · <b>${esc(l.claimLabel || 'một thiết bị')}</b>` : st === 'expired' ? 'Đã hết hạn' : 'Chưa ai mở';
        const sub = st === 'used'
            ? [place, l.claimedAt ? `nhận ${fmtUntil(l.claimedAt)}` : '', l.lastSeenAt && l.lastSeenAt !== l.claimedAt ? `mở gần nhất ${fmtUntil(l.lastSeenAt)}` : '', left].filter(Boolean).join(' · ')
            : st === 'expired' ? `Tạo ${fmtUntil(l.createdAt)}` : `Tạo ${fmtUntil(l.createdAt)} · ${left}`;
        return `
        <li class="sa-person sa-once-row is-${st}">
            <span class="sa-av" style="background:${s.c}"><i class="fas ${s.i}"></i></span>
            <span class="sa-who"><span class="sa-name">${name}</span><span class="sa-sub" title="${esc(sub)}">${esc(sub)}</span></span>
            ${st === 'expired' ? '' : `<button type="button" class="sa-icon" data-once-copy="${esc(l.token)}" title="Sao chép link" aria-label="Sao chép link"><i class="fas fa-copy"></i></button>`}
            <button type="button" class="sa-icon" data-once-revoke="${esc(l.token)}" title="${st === 'expired' ? 'Xóa khỏi danh sách' : 'Thu hồi link'}" aria-label="Thu hồi link"><i class="fas fa-xmark"></i></button>
        </li>`;
    }).join('');
}

async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) { window.prompt('Sao chép link này:', text); return false; }
}

function bindOnceBlock(section) {
    section.querySelectorAll('[data-once-hours]').forEach(b => b.addEventListener('click', () => {
        onceHours = Number(b.dataset.onceHours) || 0;
        renderOnce();
    }));
    const createBtn = section.querySelector('#sa-once-create');
    createBtn.addEventListener('click', async () => {
        const o = current?.oneTime;
        if (!o || createBtn.disabled) return;
        createBtn.disabled = true;
        try {
            const d = await onceApi('create', { kind: o.kind, id: o.id, hours: onceHours });
            if (once.key === `${o.kind}:${o.id}`) once.links = [d.link, ...once.links];
            renderOnce();
            if (await copyText(onceUrl(d.link.token))) showToast('Đã tạo và sao chép link 1 thiết bị — gửi cho đúng MỘT người nhé.', 'success', 5000);
        } catch (e) {
            showToast('Không tạo được link: ' + e.message, 'error');
        } finally { createBtn.disabled = false; }
    });
    section.querySelector('#sa-once-list').addEventListener('click', async (e) => {
        const copy = e.target.closest('[data-once-copy]');
        const revoke = e.target.closest('[data-once-revoke]');
        if (copy) {
            if (await copyText(onceUrl(copy.dataset.onceCopy))) showToast('Đã sao chép link.', 'success');
            return;
        }
        if (!revoke || revoke.disabled) return;
        const token = revoke.dataset.onceRevoke;
        const l = once.links.find(x => x.token === token);
        const st = l ? onceState(l) : 'expired';
        if (st !== 'expired') {
            const ok = await showConfirm(st === 'used'
                ? `Thiết bị đang giữ link (${l.claimLabel || 'một thiết bị'}) sẽ mất quyền vào NGAY.`
                : 'Link này sẽ không mở được nữa.', { title: 'Thu hồi link?', confirmText: 'Thu hồi', cancelText: 'Hủy', tone: 'danger' });
            if (!ok) return;
        }
        revoke.disabled = true;
        try {
            await onceApi('revoke', { token });
            once.links = once.links.filter(x => x.token !== token);
            renderOnce();
            if (st !== 'expired') showToast('Đã thu hồi link.', 'success');
        } catch (err) {
            revoke.disabled = false;
            showToast('Không thu hồi được: ' + err.message, 'error');
        }
    });
}

// Thư mời qua ứng dụng mail của máy (mailto:) — web không có máy chủ gửi mail; người nhận cũng thấy mục ở "Được chia sẻ với tôi".
function inviteHref(t, email, role) {
    const who = sessionUser()?.displayName || 'Mình';
    const what = t.title || 'bộ đề';
    const subject = `${who} chia sẻ "${what}" với bạn trên Zitthenkne`;
    const body = `Chào bạn,\n\n${who} vừa chia sẻ "${what}" với bạn trên Zitthenkne (vai trò: ${ROLE_LABEL[role] || ROLE_LABEL.viewer}).\n\n`
        + `Mở link: ${t.link || location.origin}\n\n`
        + `Đăng nhập bằng Google đúng email ${email} là mở được. `
        + `Mục này cũng nằm ở nút "Được chia sẻ với tôi" trong thư viện.`;
    return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function bindOnce(section) {
    bindOnceBlock(section);
    const input = section.querySelector('#share-person-input');
    section.querySelector('#share-person-add-btn').addEventListener('click', addPerson);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addPerson(); } });
    section.querySelector('#share-person-list').addEventListener('change', (e) => {
        const sel = e.target.closest('.share-person-role');
        if (!sel) return;
        const email = sel.closest('li')?.dataset.email;
        if (email) changeRole(email, sel.value);
    });
    // Hạn tính TỪ BÂY GIỜ theo thời hạn đang chọn (mặc định 12 giờ); 0 = không hết hạn → null
    const chosenUntil = () => (expiryHours ? new Date(Date.now() + expiryHours * 3600 * 1000) : null);
    let busy = false;
    const setPublic = async (makePublic) => {
        const t = current;
        if (!t || busy) return;
        busy = true;
        section.style.opacity = '.7';
        try { await t.setPublic(makePublic, makePublic ? chosenUntil() : null); }
        finally { busy = false; section.style.opacity = ''; render(); }
    };
    section.querySelectorAll('[data-general]').forEach(b => b.addEventListener('click', () => {
        const want = b.dataset.general === 'public';
        const v = current?.view() || {};
        // Đang đúng chế độ thì thôi — trừ khi chọn nhiều bộ đề đang lẫn lộn (mixed): khi đó bấm gì cũng áp cho tất cả
        if (!v.mixed && want === (v.isPublic === true)) return;
        setPublic(want);
    }));
    // Bấm một thời hạn khi đang công khai = gia hạn (tính lại từ bây giờ); khi đang hạn chế thì chỉ chọn trước
    section.querySelectorAll('[data-hours]').forEach(b => b.addEventListener('click', () => {
        expiryHours = Number(b.dataset.hours) || 0;
        const isPublicNow = section.querySelector('[data-general="public"]').classList.contains('is-on');
        if (isPublicNow) setPublic(true); else render();
    }));
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
