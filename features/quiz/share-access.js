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
//   allowOffline: true = người KHÁC chủ được tải đề về làm offline (thiếu/false = chỉ chủ — features/quiz/quiz-offline-store.js).
// Module không biết cache của nơi gọi: ghi lên các doc do `targets()` trả về (theo LÔ), sửa thẳng các object đó rồi gọi `onChange()`.

import { db } from '../../core/firebase-init.js';
import { doc, arrayUnion, arrayRemove, writeBatch } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { queued } from '../../core/offline-write.js';
import { sessionUser, whenAuthReady } from '../../core/auth-session.js';
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
.sa-once.hidden,#sa-req-box.hidden{display:none}
.sa-once-new{display:flex;flex-direction:column;gap:8px;margin:8px 0;padding:10px;border-radius:14px;background:#fcf8fa;border:1.5px solid var(--sa-line)}
.sa-once-new .sa-btn,.sa-detail .sa-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px}
.sa-line{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.sa-line .sa-input{flex:1 1 150px}
.sa-step{display:inline-flex;align-items:center;height:36px;border-radius:11px;border:1.5px solid var(--sa-line);background:#fff;overflow:hidden}
.sa-step button{width:30px;height:100%;border:0;background:transparent;color:var(--sa-pink-d);cursor:pointer;font-size:10px}
.sa-step button:hover{background:var(--sa-soft)}
.sa-step b{min-width:22px;text-align:center;font-size:13px}
.sa-step small{padding-right:9px;font-size:11px;font-weight:700;color:var(--sa-mute)}
.sa-preview{margin:0;padding:8px 10px;border-radius:11px;background:#fff;border:1.5px dashed var(--sa-line);font-size:11.5px;line-height:1.45;color:var(--sa-mute)}
.sa-preview b{display:block;margin-bottom:2px;font-size:12px;color:var(--sa-ink)}
button.sa-icon{border:0;background:transparent;cursor:pointer;padding:0}
.sa-once-item>.sa-person{background:transparent}
.sa-once-item>.sa-person:hover{background:#fdf6f9}
.sa-once-row .sa-av{font-size:12px}
.sa-once-item.is-expired,.sa-once-item.is-revoked{opacity:.62}
.sa-seat{flex:none;margin-left:6px;padding:1px 7px;border-radius:999px;background:var(--sa-soft);color:var(--sa-pink-d);font-size:10.5px;font-weight:800}
#sa-once-list{max-height:360px}
.sa-detail{margin:2px 0 8px 39px;padding:10px;border-radius:12px;background:#fdf6f9;display:flex;flex-direction:column;gap:9px}
.sa-detail .sa-mini{margin:0}
.sa-claim{display:flex;align-items:center;gap:8px}
.sa-claim .sa-av{width:24px;height:24px;font-size:10px}
.sa-req{background:#fff8e6!important}
.sa-req .sa-sub.is-msg{white-space:normal;color:#7a5b12}
.sa-req-btns{display:flex;flex-direction:column;gap:4px}
.sa-btn-sm{height:30px;padding:0 10px;font-size:11.5px;border-radius:9px}
.sa-btn-ghost{background:#fff;color:#5b4250;box-shadow:inset 0 0 0 1.5px var(--sa-line)}
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
            <div id="sa-req-box" class="hidden">
                <p class="sa-h"><i class="fas fa-hand"></i> Yêu cầu truy cập <span id="sa-req-count" class="sa-badge"></span></p>
                <ul id="sa-req-list" class="sa-list"></ul>
            </div>
            <p class="sa-h"><i class="fas fa-mobile-screen"></i> Link riêng theo người nhận <span id="sa-once-count" class="sa-badge"></span></p>
            <p class="sa-desc" style="margin:0">Mỗi người một link có tên. Không cần tài khoản: mỗi máy bấm mở chiếm 1 suất, hết suất thì máy khác bị chặn và chỉ gửi được yêu cầu truy cập (phải đăng nhập).</p>
            <div class="sa-once-new">
                <div class="sa-line">
                    <input type="text" id="sa-once-name" class="sa-input" maxlength="60" placeholder="Tên người nhận — vd: An" autocomplete="off">
                    <span class="sa-step" aria-label="Số thiết bị mở được"><button type="button" data-once-uses="-1" aria-label="Bớt"><i class="fas fa-minus"></i></button><b id="sa-once-uses">1</b><button type="button" data-once-uses="1" aria-label="Thêm"><i class="fas fa-plus"></i></button><small>thiết bị</small></span>
                </div>
                <div class="sa-chips" role="radiogroup" aria-label="Thời hạn link">
                    ${ONCE_HOURS.map(([h, l]) => `<button type="button" data-once-hours="${h}" role="radio">${l}</button>`).join('')}
                </div>
                <p id="sa-once-preview" class="sa-preview"></p>
                <button type="button" id="sa-once-create" class="sa-btn"><i class="fas fa-plus"></i> Tạo link &amp; sao chép</button>
            </div>
            <ul id="sa-once-list" class="sa-list"></ul>
        </div>
        <label class="sa-switch-row">
            <span class="sa-switch"><input type="checkbox" id="share-allow-copy"><i></i></span>
            <span><b>Cho người khác mang đề đi</b>
                <small>Lưu bản sao về thư viện của họ, mở sang phòng "Làm cùng nhau". Tắt (mặc định): chỉ làm bài ngay trên web của bạn.</small></span>
        </label>
        <label class="sa-switch-row">
            <span class="sa-switch"><input type="checkbox" id="share-allow-offline"><i></i></span>
            <span><b>Cho tải về làm offline</b>
                <small>Người được chia sẻ có nút "Tải offline" và máy họ tự lưu đề để làm khi mất mạng. Tắt (mặc định): họ chỉ làm khi có mạng, bản đã tải trước đó tự xóa.</small></span>
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
    const allowOff = document.getElementById('share-allow-offline');
    if (allowOff) allowOff.checked = v.allowOffline === true;
    const note = document.getElementById('share-scope-note');
    if (note) { note.textContent = t.scope || ''; note.classList.toggle('hidden', !t.scope); }
    renderOnce();
}

// ---------- LINK RIÊNG THEO NGƯỜI NHẬN (api/link.js; trang người nhận: features/quiz/link.html) ----------
// Mục vẫn RIÊNG TƯ. Mỗi link: mã ngẫu nhiên + TÊN người nhận (hiện trong bản xem trước Messenger/Zalo: "Gửi bạn ABC…") + số SUẤT
// (mặc định 1 = dùng 1 lần). Mỗi máy bấm mở chiếm 1 suất; hết suất → máy khác chỉ gửi được yêu cầu truy cập (khối "Yêu cầu truy cập" ở đây).
// Link hết hạn / thu hồi: máy chủ xóa và chỉ giữ LỊCH SỬ gọn (tên, ai mở lúc nào) — khối "Lịch sử link".
let once = { key: '', links: [], requests: [], history: [], loading: false, error: '' };
let onceUses = 1;
const openRows = new Set();          // link đang mở phần chi tiết
let historyOpen = false;
const onceUrl = (token) => apiUrl(`api/link?t=${encodeURIComponent(token)}`);
const ONCE_MAX_USES = 50;            // khớp MAX_USES trong api/link.js

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

// Bản lưu trên máy của danh sách link từng mục: mở hộp Chia sẻ là hiện NGAY bản lần trước, máy chủ trả về thì thay (gọi máy chủ mất 1–3 giây
// trên điện thoại, nhất là lúc hàm Vercel "nguội"). Chỉ là tiện ích hiển thị — lỗi / chế độ riêng tư thì thôi.
const ONCE_CACHE = 'sa-once:';
function readOnceCache(key) {
    try { const d = JSON.parse(localStorage.getItem(ONCE_CACHE + key) || 'null'); return d && Array.isArray(d.links) ? d : null; } catch (e) { return null; }
}
function writeOnceCache() {
    if (!once.key || once.loading || once.error) return;
    try { localStorage.setItem(ONCE_CACHE + once.key, JSON.stringify({ links: once.links, requests: once.requests, history: once.history })); } catch (e) {}
}

async function loadOnce() {
    const o = current?.oneTime;
    if (!o) { once = { key: '', links: [], requests: [], history: [], loading: false, error: '' }; return renderOnce(); }
    const key = `${o.kind}:${o.id}`;
    const cached = once.key === key ? null : readOnceCache(key);
    once = once.key === key ? { ...once, loading: true, error: '' }
        : { key, links: cached?.links || [], requests: cached?.requests || [], history: cached?.history || [], loading: true, error: '' };
    renderOnce();
    try {
        const d = await onceApi('list', { kind: o.kind, id: o.id });
        if (once.key === key) Object.assign(once, { links: d.links || [], requests: d.requests || [], history: d.history || [] });
    } catch (e) { if (once.key === key) once.error = e.message; }
    if (once.key === key) { once.loading = false; renderOnce(); }
}

/** Chủ mở thư viện / trang làm bài: có yêu cầu truy cập đang chờ thì báo (mỗi phiên trình duyệt một lần). */
async function notifyAccessRequests() {
    try { if (sessionStorage.getItem('arInboxSeen')) return; } catch (e) {}
    try {
        const d = await onceApi('inbox');
        try { sessionStorage.setItem('arInboxSeen', '1'); } catch (e) {}
        const reqs = d.requests || [];
        if (!reqs.length) return;
        const what = [...new Set(reqs.map(r => `“${r.title || 'không tên'}”`))].slice(0, 3).join(', ');
        showToast(`Có ${reqs.length} yêu cầu truy cập đang chờ (${what}). Mở Chia sẻ của mục đó để duyệt.`, 'info', 9000);
    } catch (e) { /* chưa đăng nhập / mất mạng → thôi */ }
}
whenAuthReady(6000).then(u => { if (u && !u.isAnonymous && !u.offline) notifyAccessRequests(); }).catch(() => {});

const linkUsed = (l) => (l.claims || []).length;
const onceState = (l) => (l.expiresAt != null && l.expiresAt <= Date.now()) ? 'expired' : linkUsed(l) >= l.maxUses ? 'full' : linkUsed(l) ? 'used' : 'free';
const putLink = (l) => { const i = once.links.findIndex(x => x.token === l.token); if (i >= 0) once.links[i] = l; else once.links.unshift(l); };

/** Bản xem trước khớp thẻ Open Graph máy chủ vẽ (api/link.js previewPage). */
function previewOf(name, uses) {
    const verb = current?.oneTime?.kind === 'folder' ? 'học thư mục' : 'làm bộ đề';
    const what = current?.title ? `“${current.title}”` : '';
    return {
        title: `${name ? `Gửi bạn ${name}, bạn` : 'Bạn'} được mời ${verb} ${what} trên Zitthenkne`.replace(/\s+/g, ' '),
        desc: uses === 1 ? 'Đây là link dùng 1 lần nên đừng chia sẻ cho người khác.' : `Link riêng chỉ mở được trên ${uses} thiết bị — đừng chia sẻ cho người khác.`
    };
}
function renderPreview() {
    const el = document.getElementById('sa-once-preview');
    if (!el) return;
    const p = previewOf((document.getElementById('sa-once-name')?.value || '').replace(/\s+/g, ' ').trim(), onceUses);
    el.innerHTML = `<b>${esc(p.title)}</b>${esc(p.desc)}`;
    const n = document.getElementById('sa-once-uses');
    if (n) n.textContent = onceUses;
}

const stepper = (attrs, n) => `<span class="sa-step"><button type="button" ${attrs} data-d="-1" aria-label="Bớt"><i class="fas fa-minus"></i></button><b>${n}</b><button type="button" ${attrs} data-d="1" aria-label="Thêm"><i class="fas fa-plus"></i></button><small>thiết bị</small></span>`;

function claimRow(token, c, live) {
    const who = c.email || c.name || c.label || 'Một thiết bị';
    const sub = [c.email || c.name ? c.label : '', [c.city, c.country].filter(Boolean).join(', '),
        c.at ? `mở ${fmtUntil(c.at)}` : '', c.seen && c.seen !== c.at ? `gần nhất ${fmtUntil(c.seen)}` : '',
        c.via === 'request' ? 'được duyệt yêu cầu' : ''].filter(Boolean).join(' · ');
    return `
        <div class="sa-claim">
            <span class="sa-av" style="background:${c.anon ? '#60a5fa' : avColor(who)}">${c.anon ? '<i class="fas fa-mobile-screen"></i>' : esc(who.charAt(0).toUpperCase())}</span>
            <span class="sa-who"><span class="sa-name" title="${esc(who)}">${esc(who)}</span><span class="sa-sub" title="${esc(sub)}">${esc(sub)}</span></span>
            ${live ? `<button type="button" class="sa-icon" data-kick="${esc(token)}" data-uid="${esc(c.uid)}" title="Gỡ và chặn máy này" aria-label="Gỡ máy này"><i class="fas fa-xmark"></i></button>` : ''}
        </div>`;
}

function linkRow(l) {
    const st = onceState(l), used = linkUsed(l);
    const S = { free: ['#60a5fa', 'fa-mobile-screen'], used: ['#34c38f', 'fa-check'], full: ['#34c38f', 'fa-lock'], expired: ['#c4b5bd', 'fa-clock'] }[st];
    const live = st !== 'expired';
    const last = (l.claims || []).reduce((m, c) => Math.max(m, c.seen || c.at || 0), 0);
    const sub = !live ? 'Đã hết hạn — sẽ tự chuyển vào lịch sử'
        : [used ? `${used} máy đã mở` : 'Chưa ai mở', last ? `gần nhất ${fmtUntil(last)}` : `tạo ${fmtUntil(l.createdAt)}`,
            l.expiresAt == null ? 'không hết hạn' : leftText(l.expiresAt)].join(' · ');
    const open = openRows.has(l.token);
    const detail = !open ? '' : `
        <div class="sa-detail">
            ${live ? `
            <div class="sa-line">
                <input type="text" class="sa-input" data-rename-input="${esc(l.token)}" value="${esc(l.name)}" maxlength="60" placeholder="Tên người nhận">
                <button type="button" class="sa-btn sa-btn-sm" data-rename="${esc(l.token)}">Lưu tên</button>
            </div>
            <div class="sa-line"><span class="sa-mini">Mở được trên</span>${stepper(`data-seat="${esc(l.token)}"`, l.maxUses)}</div>
            <div><span class="sa-mini">Gia hạn tính từ bây giờ</span>
                <div class="sa-chips">${ONCE_HOURS.map(([h, t]) => `<button type="button" data-extend="${esc(l.token)}" data-h="${h}">${t}</button>`).join('')}</div></div>` : ''}
            <span class="sa-mini">Ai đã mở (${used}/${l.maxUses})</span>
            ${used ? (l.claims || []).map(c => claimRow(l.token, c, live)).join('') : '<span class="sa-sub">Chưa có máy nào.</span>'}
        </div>`;
    return `
        <li class="sa-once-item is-${st}">
            <div class="sa-person sa-once-row">
                <span class="sa-av" style="background:${S[0]}"><i class="fas ${S[1]}"></i></span>
                <span class="sa-who"><span class="sa-name">${l.name ? `<b>${esc(l.name)}</b>` : '<i>Chưa đặt tên</i>'}<span class="sa-seat">${used}/${l.maxUses}</span></span><span class="sa-sub" title="${esc(sub)}">${esc(sub)}</span></span>
                ${live ? `<button type="button" class="sa-icon" data-once-copy="${esc(l.token)}" title="Sao chép link" aria-label="Sao chép link"><i class="fas fa-copy"></i></button>` : ''}
                <button type="button" class="sa-icon" data-once-edit="${esc(l.token)}" title="${open ? 'Thu gọn' : 'Chi tiết / chỉnh sửa'}" aria-label="Chi tiết"><i class="fas ${open ? 'fa-minus' : 'fa-pen'}"></i></button>
                ${live ? `<button type="button" class="sa-icon" data-once-revoke="${esc(l.token)}" title="Thu hồi link" aria-label="Thu hồi link"><i class="fas fa-xmark"></i></button>` : ''}
            </div>${detail}
        </li>`;
}

function reqRow(r) {
    const who = r.name || r.email || 'Ai đó';
    const from = r.viaLink ? `qua link “${r.linkName || 'chưa đặt tên'}”` : (r.kind === 'folder' ? 'từ trang thư mục' : 'từ trang bộ đề');
    const sub = [r.name ? r.email : '', from, r.label, [r.city, r.country].filter(Boolean).join(', '), r.updatedAt ? fmtUntil(r.updatedAt) : ''].filter(Boolean).join(' · ');
    return `
        <li class="sa-person sa-req">
            <span class="sa-av" style="background:${avColor(r.email || who)}">${esc(who.charAt(0).toUpperCase())}</span>
            <span class="sa-who"><span class="sa-name" title="${esc(r.email)}">${esc(who)}</span><span class="sa-sub" title="${esc(sub)}">${esc(sub)}</span>
                ${r.message ? `<span class="sa-sub is-msg">“${esc(r.message)}”</span>` : ''}</span>
            <span class="sa-req-btns">
                <button type="button" class="sa-btn sa-btn-sm" data-req-ok="${esc(r.id)}">Duyệt</button>
                <button type="button" class="sa-btn sa-btn-sm sa-btn-ghost" data-req-no="${esc(r.id)}">Từ chối</button>
            </span>
        </li>`;
}

function histRow(h) {
    const opens = h.opens || [];
    const head = `${h.reason === 'revoked' ? 'Thu hồi' : 'Hết hạn'} ${fmtUntil(h.endedAt)} · tạo ${fmtUntil(h.createdAt)} · ${opens.length}/${h.maxUses} máy đã mở`;
    const list = opens.map(o => [o.who || o.label || 'Một thiết bị', o.who ? o.label : '', o.place, o.at ? `mở ${fmtUntil(o.at)}` : '',
        o.seen && o.seen !== o.at ? `gần nhất ${fmtUntil(o.seen)}` : ''].filter(Boolean).join(' · '));
    return `
        <li class="sa-person sa-once-item is-expired" style="align-items:flex-start">
            <span class="sa-av" style="background:#c4b5bd"><i class="fas fa-clock"></i></span>
            <span class="sa-who"><span class="sa-name">${h.name ? `<b>${esc(h.name)}</b>` : '<i>Chưa đặt tên</i>'}</span>
                <span class="sa-sub" title="${esc(head)}">${esc(head)}</span>
                ${list.map(t => `<span class="sa-sub" title="${esc(t)}">• ${esc(t)}</span>`).join('')}</span>
        </li>`;
}

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
    renderPreview();
    writeOnceCache();
    const live = once.links.filter(l => onceState(l) !== 'expired').length;
    const count = document.getElementById('sa-once-count');
    if (count) count.textContent = once.loading && once.links.length ? 'đang cập nhật…' : live ? `${live} link` : '';

    // Yêu cầu truy cập đang chờ
    const reqBox = document.getElementById('sa-req-box');
    reqBox?.classList.toggle('hidden', !once.requests.length);
    const reqCount = document.getElementById('sa-req-count');
    if (reqCount) reqCount.textContent = once.requests.length ? `${once.requests.length} chờ duyệt` : '';
    const reqList = document.getElementById('sa-req-list');
    if (reqList) reqList.innerHTML = once.requests.map(reqRow).join('');

    const list = document.getElementById('sa-once-list');
    if (!list) return;
    const hist = once.history.length ? `
        <li><button type="button" class="sa-icon" data-hist-toggle style="width:auto;padding:4px 8px;font-size:11.5px;font-weight:800">
            <i class="fas ${historyOpen ? 'fa-minus' : 'fa-plus'}"></i>&nbsp;Lịch sử link (${once.history.length})</button></li>
        ${historyOpen ? once.history.map(histRow).join('') : ''}` : '';
    if (!once.links.length) {
        list.innerHTML = `<li class="sa-empty">${once.loading ? 'Đang tải danh sách link…' : once.error ? esc('Không tải được: ' + once.error) : 'Chưa có link nào — đặt tên người nhận rồi bấm Tạo link.'}</li>${hist}`;
        return;
    }
    list.innerHTML = once.links.map(linkRow).join('') + hist;
}

async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) { window.prompt('Sao chép link này:', text); return false; }
}

function bindOnceBlock(section) {
    const box = section.querySelector('#sa-once');
    const nameInput = section.querySelector('#sa-once-name');
    nameInput.addEventListener('input', renderPreview);
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); section.querySelector('#sa-once-create').click(); } });
    // Một lượt gọi máy chủ cho một nút: khóa nút, lỗi thì báo, xong vẽ lại
    const run = async (btn, fn, failMsg) => {
        if (btn.disabled) return;
        btn.disabled = true;
        try { await fn(); renderOnce(); }
        catch (e) { showToast(`${failMsg}: ${e.message}`, 'error'); btn.disabled = false; }
    };
    const linkOf = (token) => once.links.find(x => x.token === token);

    box.addEventListener('click', async (e) => {
        const t = e.target.closest('button');
        if (!t || !box.contains(t)) return;
        const d = t.dataset;
        const o = current?.oneTime;

        if (d.onceHours !== undefined) { onceHours = Number(d.onceHours) || 0; return renderOnce(); }
        if (d.onceUses !== undefined) { onceUses = Math.min(ONCE_MAX_USES, Math.max(1, onceUses + Number(d.onceUses))); return renderPreview(); }
        if (d.histToggle !== undefined) { historyOpen = !historyOpen; return renderOnce(); }
        if (t.id === 'sa-once-create') {
            if (!o) return;
            return run(t, async () => {
                const name = nameInput.value.replace(/\s+/g, ' ').trim();
                const r = await onceApi('create', { kind: o.kind, id: o.id, hours: onceHours, name, maxUses: onceUses });
                if (once.key === `${o.kind}:${o.id}`) putLink(r.link);
                nameInput.value = ''; onceUses = 1; t.disabled = false;
                const copied = await copyText(onceUrl(r.link.token));
                if (copied) showToast(`Đã tạo và sao chép link${name ? ` cho ${name}` : ''} — dán vào Messenger/Zalo sẽ hiện lời mời riêng.`, 'success', 5000);
            }, 'Không tạo được link');
        }
        if (d.onceCopy) { if (await copyText(onceUrl(d.onceCopy))) showToast('Đã sao chép link.', 'success'); return; }
        if (d.onceEdit) { openRows.has(d.onceEdit) ? openRows.delete(d.onceEdit) : openRows.add(d.onceEdit); return renderOnce(); }
        if (d.onceRevoke) {
            const l = linkOf(d.onceRevoke);
            const n = l ? linkUsed(l) : 0;
            const ok = await showConfirm(n ? `${n} máy đang giữ link${l.name ? ` “${l.name}”` : ''} sẽ mất quyền vào NGAY. Link chuyển vào lịch sử.`
                : 'Link này sẽ không mở được nữa (chuyển vào lịch sử).', { title: 'Thu hồi link?', confirmText: 'Thu hồi', cancelText: 'Hủy', tone: 'danger' });
            if (!ok) return;
            return run(t, async () => {
                const r = await onceApi('revoke', { token: d.onceRevoke });
                once.links = once.links.filter(x => x.token !== d.onceRevoke);
                if (r.history) once.history = r.history;
                showToast('Đã thu hồi link.', 'success');
            }, 'Không thu hồi được');
        }
        if (d.rename) {
            const v = box.querySelector(`[data-rename-input="${d.rename}"]`)?.value || '';
            return run(t, async () => {
                putLink((await onceApi('update', { token: d.rename, name: v })).link);
                showToast('Đã đổi tên link. (Tin đã gửi trước đó vẫn giữ bản xem trước cũ.)', 'success', 4500);
            }, 'Không đổi được tên');
        }
        if (d.seat) {
            const l = linkOf(d.seat);
            if (!l) return;
            const next = Math.min(ONCE_MAX_USES, Math.max(1, linkUsed(l), l.maxUses + Number(d.d)));
            if (next === l.maxUses) return showToast(next === ONCE_MAX_USES ? `Tối đa ${ONCE_MAX_USES} thiết bị.` : 'Không bớt dưới số máy đã mở — gỡ bớt máy ở danh sách bên dưới trước.', 'info');
            return run(t, async () => { putLink((await onceApi('update', { token: d.seat, maxUses: next })).link); }, 'Không đổi được số thiết bị');
        }
        if (d.extend) {
            return run(t, async () => {
                putLink((await onceApi('update', { token: d.extend, hours: Number(d.h) || 0 })).link);
                showToast('Đã gia hạn link.', 'success');
            }, 'Không gia hạn được');
        }
        if (d.kick) {
            const ok = await showConfirm('Máy / tài khoản này mất quyền vào NGAY và không mở lại link này được nữa (họ vẫn gửi yêu cầu truy cập được). Suất được trả lại cho người khác.',
                { title: 'Gỡ máy khỏi link?', confirmText: 'Gỡ', cancelText: 'Hủy', tone: 'danger' });
            if (!ok) return;
            return run(t, async () => { putLink((await onceApi('kick', { token: d.kick, uid: d.uid })).link); showToast('Đã gỡ máy khỏi link.', 'success'); }, 'Không gỡ được');
        }
        if (d.reqOk) {
            const r = once.requests.find(x => x.id === d.reqOk);
            return run(t, async () => {
                const res = await onceApi('approve', { id: d.reqOk, hours: onceHours || 168 });
                putLink(res.link);
                once.requests = once.requests.filter(x => x.id !== d.reqOk);
                showToast(`Đã duyệt ${r?.email || ''} — cấp 1 suất trên link “${res.link.name || 'chưa đặt tên'}”. Họ quay lại trang là vào được.`, 'success', 6000);
            }, 'Không duyệt được');
        }
        if (d.reqNo) {
            return run(t, async () => {
                await onceApi('deny', { id: d.reqNo });
                once.requests = once.requests.filter(x => x.id !== d.reqNo);
                showToast('Đã từ chối yêu cầu.', 'success');
            }, 'Không từ chối được');
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
    // Tải offline: chỉ CHỦ bộ đề luôn được; người khác (chia sẻ riêng, link công khai, link 1 thiết bị) chỉ khi bật cái này (quiz-offline-store.js)
    const allowOff = section.querySelector('#share-allow-offline');
    allowOff.addEventListener('change', async () => {
        allowOff.disabled = true;
        const ok = await writeAll({ allowOffline: allowOff.checked }, (o) => { o.allowOffline = allowOff.checked; },
            allowOff.checked ? 'Đã cho người được chia sẻ tải đề về làm offline.'
                : 'Đã khóa offline: người được chia sẻ chỉ làm khi có mạng, bản đã tải sẽ tự xóa.');
        if (!ok) allowOff.checked = !allowOff.checked;
        allowOff.disabled = false;
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
