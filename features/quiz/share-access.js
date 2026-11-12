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
    tabTouched = false;
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
.sa-pane{display:flex;flex-direction:column;gap:14px}
.sa-pane[hidden]{display:none}
.sa-pane > div + div{padding-top:14px;border-top:1.5px dashed var(--sa-line)}
.sa-tabs{position:sticky;top:0;z-index:3;display:flex;gap:3px;padding:4px;border-radius:14px;background:#fcf8fa;border:1.5px solid var(--sa-line)}
.sa-tabs button{flex:1;min-width:0;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 6px;border:0;border-radius:10px;background:transparent;font-size:12px;font-weight:800;color:var(--sa-mute);cursor:pointer;white-space:nowrap;transition:background .15s,color .15s}
.sa-tabs button i{font-size:11px}
.sa-tabs button.is-on{background:#fff;color:var(--sa-ink);box-shadow:0 1px 0 var(--sa-line),0 2px 6px rgba(59,34,48,.08)}
.sa-tabs button.is-on i{color:var(--sa-pink-d)}
.sa-tabs button.hidden{display:none}
.sa-dot{min-width:17px;height:17px;padding:0 5px;border-radius:999px;background:var(--sa-bad);color:#fff;font-size:10px;line-height:17px;font-style:normal;animation:sa-pop .3s ease}
.sa-dot.hidden{display:none}
@keyframes sa-pop{from{transform:scale(.4)}to{transform:scale(1)}}
@keyframes sa-in{from{opacity:0;transform:translateY(4px)}}
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
.sa-once{display:flex;flex-direction:column;gap:12px}
.sa-once.hidden,#sa-req-box.hidden{display:none}
.sa-once .sa-h{margin:0}
.sa-once-new{display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:14px;background:#fcf8fa;border:1.5px solid var(--sa-line)}
.sa-once-new .sa-btn,.sa-detail .sa-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px}
.sa-line{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.sa-tags{flex:1 1 170px;min-width:0;min-height:38px;display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:4px 6px;border-radius:11px;border:1.5px solid var(--sa-line);background:#fff;cursor:text;transition:border-color .15s,box-shadow .15s}
.sa-tags:focus-within{border-color:var(--sa-pink);box-shadow:0 0 0 3px rgba(255,105,180,.16)}
.sa-once-new > .sa-tags{flex:none}
.sa-tags.hidden,.sa-input.hidden{display:none}
.sa-tag{display:inline-flex;align-items:center;gap:2px;max-width:100%;padding:3px 3px 3px 9px;border-radius:999px;background:var(--sa-soft);color:var(--sa-pink-d);font-size:12px;font-weight:800;animation:sa-pop .18s ease}
.sa-tag button{width:18px;height:18px;border:0;border-radius:999px;background:transparent;color:inherit;font-size:13px;line-height:1;cursor:pointer;padding:0}
.sa-tag button:hover{background:#fff}
.sa-tag-in{flex:1;min-width:90px;height:28px;border:0;outline:0;background:transparent;font-size:13px;color:var(--sa-ink);padding:0 4px}
.sa-area{height:auto;min-height:84px;padding:9px 11px;line-height:1.45;resize:vertical;font-family:inherit}
.sa-area.hidden{display:none}
.sa-roster{display:flex;flex-wrap:wrap;gap:5px}
.sa-roster span{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;font-size:11.5px;font-weight:700;background:#fff;color:#a08b95;border:1.5px dashed #e8d6df}
.sa-roster span.is-in{background:#dcf5ea;color:#11734b;border:1.5px solid #dcf5ea}
.sa-roster i{font-size:9.5px}
.sa-line .sa-input{flex:1 1 150px}
.sa-step{display:inline-flex;align-items:center;height:36px;border-radius:11px;border:1.5px solid var(--sa-line);background:#fff;overflow:hidden}
.sa-step button{width:30px;height:100%;border:0;background:transparent;color:var(--sa-pink-d);cursor:pointer;font-size:10px}
.sa-step button:hover{background:var(--sa-soft)}
.sa-step b{min-width:22px;text-align:center;font-size:13px}
.sa-step small{padding-right:9px;font-size:11px;font-weight:700;color:var(--sa-mute)}
.sa-preview{margin:0;display:flex;flex-direction:column;gap:5px}
.sa-pv-tag{font-size:10.5px;font-weight:800;color:var(--sa-mute);text-transform:uppercase;letter-spacing:.04em}
.sa-pv-card{align-self:flex-start;max-width:100%;display:flex;flex-direction:column;gap:3px;padding:9px 11px;border-radius:4px 14px 14px 14px;background:#fff;border:1.5px solid var(--sa-line);border-left:4px solid var(--sa-pink);font-size:11.5px;line-height:1.45;color:var(--sa-mute)}
.sa-pv-card b{font-size:12.5px;color:var(--sa-ink)}
.sa-pv-card small{font-size:10.5px;color:#b394a3}
button.sa-icon{border:0;background:transparent;cursor:pointer;padding:0}
#sa-once-list,#sa-req-list{max-height:none;overflow:visible;gap:10px}
/* Ô số liệu (2026-11-12): nền pastel riêng từng ô + icon tròn trắng */
.sa-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.sa-stats div{--c:#ec5f95;--b:#ffeef5;display:grid;grid-template-columns:auto 1fr;align-items:center;column-gap:8px;padding:10px;border-radius:16px;background:var(--b);min-width:0}
.sa-stats small{grid-column:1/-1;margin-top:6px}
.sa-stats i{width:30px;height:30px;border-radius:11px;display:flex;align-items:center;justify-content:center;background:#fff;color:var(--c);font-size:12px;box-shadow:0 3px 8px -5px var(--c)}
.sa-stats b{font-size:19px;line-height:1;color:var(--c)}
.sa-stats small{font-size:10px;font-weight:700;line-height:1.2;color:#7d6872}
.sa-stats .is-blue{--c:#3b82f6;--b:#eaf2ff}.sa-stats .is-amber{--c:#d08a00;--b:#fff4d9}.sa-stats .is-zero{--c:#b8a5ae;--b:#f6f1f3}
/* Thẻ link: không viền cứng, bóng mềm; màu trạng thái qua --st / --stb */
.sa-card{--st:#3b82f6;--stb:#e6f0ff;display:flex;flex-direction:column;gap:10px;padding:12px;border-radius:18px;background:#fff;box-shadow:0 0 0 1.5px #f6e6ed,0 10px 24px -18px rgba(160,70,105,.5);transition:box-shadow .2s}
.sa-card.is-open{box-shadow:0 0 0 2px var(--sa-pink),0 14px 30px -18px rgba(236,95,149,.55)}
.sa-card.is-expired{opacity:.6}
.sa-top{display:flex;align-items:center;gap:10px}
.sa-st-ic{width:38px;height:38px;flex:none;border-radius:13px;display:flex;align-items:center;justify-content:center;background:var(--stb);color:var(--st);font-size:15px;rotate:-4deg}
.sa-card .sa-top .sa-name{font-size:14px}
.sa-pill{flex:none;display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;font-size:10.5px;font-weight:800;white-space:nowrap;background:var(--stb);color:var(--st)}
.sa-pill::before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor}
.sa-mid{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:13px;background:#fbf7f9}
.sa-seats{flex:1;display:flex;flex-wrap:wrap;gap:3px;min-width:40px}
.sa-seats i{font-size:15px;color:#e8d9e0}
.sa-seats i.on{color:var(--st)}
.sa-seats.is-bar{flex-wrap:nowrap;height:8px;border-radius:99px;background:#efe3e9;overflow:hidden}
.sa-seats.is-bar u{display:block;height:100%;border-radius:99px;background:var(--st)}
.sa-seat-n{flex:none;font-size:11.5px;font-weight:800;color:#6f5a64}
.sa-faces{display:flex;flex:none}
.sa-faces span{width:24px;height:24px;margin-left:-7px;border-radius:999px;border:2px solid #fbf7f9;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#fff}
.sa-faces span:first-child{margin-left:0}
.sa-faces .is-more{background:#efe3e9;color:#5b4250}
.sa-ttl{display:inline-flex;align-items:center;gap:4px}
.sa-ttl.is-soon{color:#c26a00;font-weight:800}
.sa-sum{display:flex;align-items:center;gap:8px;padding:0 2px;font-size:11.5px;font-weight:700;color:#6f5a64}
.sa-sum > i{color:var(--sa-pink-d)}
.sa-sum-bar{flex:1;max-width:110px;height:6px;border-radius:99px;background:#f3e6ec;overflow:hidden}
.sa-sum-bar u{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#ff9cc6,#ec5f95)}
.sa-sum small{margin-left:auto;font-size:11px;font-weight:700;color:var(--sa-mute)}
.sa-acts{display:flex;gap:6px}
.sa-acts .sa-btn{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:5px;min-width:0;padding:0 8px;border-radius:999px;white-space:nowrap}
.sa-btn-danger{color:var(--sa-bad)!important;background:#fff1f1!important}
.sa-req-card{background:#fffaf0;border-color:#f6dc9b}
.sa-msg{margin:0;padding:7px 10px;border-radius:4px 12px 12px 12px;background:#fff;border:1.5px solid #f6dc9b;font-size:12px;line-height:1.45;color:#7a5b12;white-space:pre-wrap;word-break:break-word}
.sa-hist-btn{width:100%;display:flex;align-items:center;justify-content:center;gap:6px;height:34px;border:1.5px dashed var(--sa-line);border-radius:11px;background:transparent;font-size:11.5px;font-weight:800;color:var(--sa-mute);cursor:pointer}
.sa-hist-btn:hover{border-color:var(--sa-pink);color:var(--sa-pink-d)}
.sa-hist{list-style:none;margin:2px 0 0 10px;padding:0 0 0 14px;border-left:2px solid var(--sa-line);display:flex;flex-direction:column;gap:10px}
.sa-hist li{position:relative;display:flex;flex-direction:column;gap:2px}
.sa-hist li::before{content:'';position:absolute;left:-20px;top:4px;width:10px;height:10px;border-radius:999px;background:#fff;border:2px solid #c4b5bd}
.sa-hist li.is-revoked::before{border-color:var(--sa-bad)}
.sa-hist .sa-sub{white-space:normal}
/* Chi tiết link: các khối nền hồng nhạt — Thành viên · Kết quả làm bài · Chỉnh sửa (gập) */
.sa-detail{display:flex;flex-direction:column;gap:10px;animation:sa-in .2s ease}
.sa-detail .sa-mini{margin:0}
.sa-sec{display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:15px;background:#fcf8fa}
.sa-sec h5{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin:0;font-size:12px;font-weight:800;color:var(--sa-ink)}
.sa-sec h5 > i{width:24px;height:24px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;background:#fff;color:var(--sa-pink-d);font-size:10.5px;box-shadow:0 2px 6px -4px var(--sa-pink-d)}
.sa-sec h5 small{font-size:11px;font-weight:700;color:var(--sa-mute)}
.sa-sec h5 .sa-mini-seg{margin-left:auto}
.sa-empty-row{margin:0;padding:6px 2px;font-size:11.5px;color:var(--sa-mute)}
/* Người đã mở: thẻ trắng nhỏ, huy hiệu điểm bên phải, các viên điểm có thanh tô theo % */
.sa-pr{display:flex;flex-direction:column;gap:7px;padding:9px;border-radius:13px;background:#fff}
.sa-pr-top{display:flex;align-items:center;gap:9px}
.sa-av-soft{width:32px;height:32px;flex:none;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800}
.sa-grade{flex:none;display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:800;white-space:nowrap}
.sa-grade.is-good{background:#dcf5ea;color:#11734b}.sa-grade.is-mid{background:#fff1cc;color:#946200}.sa-grade.is-low{background:#ffe4e4;color:#b42318}.sa-grade.is-none{background:#f3eef1;color:#9b8a93}
.sa-kick{width:26px;height:26px;flex:none;border:0;border-radius:9px;background:transparent;color:#cdb6c1;cursor:pointer}
.sa-kick:hover{background:#fff1f1;color:var(--sa-bad)}
.sa-done{display:flex;flex-wrap:wrap;gap:5px}
.sa-score{--fill:#c8efdb;--track:#effaf4;--ink:#11734b;display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:4px 10px;border-radius:10px;font-size:11.5px;color:var(--ink);background:linear-gradient(90deg,var(--fill) var(--p),var(--track) var(--p))}
.sa-score.is-mid{--fill:#ffe5a3;--track:#fff8e6;--ink:#8a5a00}.sa-score.is-low{--fill:#ffcaca;--track:#fff2f2;--ink:#a8261b}
.sa-score b{font-weight:700;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sa-score em{font-style:normal;font-weight:800}
.sa-score small{font-size:10px;font-weight:800;opacity:.65}
/* Theo đề: mỗi đề một thẻ, mỗi người một thanh */
.sa-qcard{display:flex;flex-direction:column;gap:7px;padding:10px;border-radius:13px;background:#fff}
.sa-qcard-h{display:flex;align-items:center;gap:7px;font-size:12.5px}
.sa-qcard-h i{color:var(--sa-pink-d);font-size:11px}
.sa-qcard-h b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sa-qcard-h small{flex:none;font-size:11px;font-weight:700;color:var(--sa-mute)}
.sa-bar{--fill:#34c38f;display:grid;grid-template-columns:70px 1fr 50px;align-items:center;gap:8px;font-size:11.5px}
.sa-bar.is-mid{--fill:#f5b52e}.sa-bar.is-low{--fill:#f26d6d}
.sa-bar span{font-weight:700;color:#5b4250;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sa-bar i{height:9px;border-radius:99px;background:#f3e9ee;overflow:hidden}
.sa-bar u{display:block;height:100%;border-radius:99px;background:var(--fill)}
.sa-bar b{text-align:right;font-weight:800;color:#3b2230;white-space:nowrap}
.sa-bar small{margin-left:2px;font-size:10px;color:var(--sa-mute)}
.sa-mini-seg{display:inline-flex;gap:2px;padding:3px;border-radius:999px;background:#fff;box-shadow:inset 0 0 0 1.5px var(--sa-line)}
.sa-mini-seg button{border:0;background:transparent;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:800;color:var(--sa-mute);cursor:pointer}
.sa-mini-seg button.is-on{background:var(--sa-pink);color:#fff}
.sa-edit-toggle{display:flex;align-items:center;gap:8px;width:100%;padding:10px 12px;border:1.5px dashed var(--sa-line);border-radius:13px;background:transparent;font-size:12px;font-weight:800;color:#6f5a64;cursor:pointer}
.sa-edit-toggle:hover{border-color:var(--sa-pink);color:var(--sa-pink-d)}
.sa-edit-toggle .sa-chev{margin-left:auto;font-size:10px}
.sa-field{display:flex;flex-direction:column;gap:5px}
.sa-field > span:first-child{font-size:11px;font-weight:800;color:#6f5a64}
.sa-field .sa-step{align-self:flex-start;background:#fff}
.sa-sec .sa-btn-ghost{background:#fff;box-shadow:inset 0 0 0 1.5px var(--sa-line)}
.sa-btn-sm{height:32px;padding:0 12px;font-size:11.5px;border-radius:10px}
.sa-btn-ghost{background:#fff4f8;color:#6b4a5b;box-shadow:none}
.sa-btn-ghost:hover{background:#ffe8f1}
@media (max-width:420px){.sa{padding:12px}.sa-add{flex-wrap:wrap}.sa-input{flex-basis:100%}.sa-select{flex:1}}
.sa-once-side,.sa-once-main{display:flex;flex-direction:column;gap:12px;min-width:0}
/* ===================== LỚP DA "SỔ CẮT DÁN" (2026-11-12) =====================
   Đồng bộ home-scrapbook.css: giấy kem kẻ caro, băng washi mép răng cưa (--tape-mask), đường may nét đứt,
   bóng in cứng (0 3px 0), nghiêng nhẹ. Chỉ CSS — chạy giống nhau ở trang chủ và trang làm bài (không cần icon thêm). */
.sa{--tape-mask:conic-gradient(from 45deg at left,#000 90deg,#0000 0) left/51% 6px repeat-y,conic-gradient(from 225deg at right,#000 90deg,#0000 0) right/51% 6px repeat-y;
  --stripes:repeating-linear-gradient(45deg,rgba(255,255,255,.45) 0 4px,transparent 4px 8px);
  background-color:#FFFCF8;background-image:linear-gradient(rgba(236,110,155,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(236,110,155,.08) 1px,transparent 1px);
  background-size:22px 22px;border:1.5px dashed #F4BCD0;box-shadow:0 3px 0 #F9D9E4}
/* Tab = mục lục sổ: tab đang mở là tờ giấy trắng có mẩu washi */
.sa-tabs{background:#FFF1F6;border:1.5px dashed #F4BCD0;border-radius:16px}
.sa-tabs button{position:relative}
.sa-tabs button.is-on{box-shadow:0 2px 0 #F6D2DE;rotate:-1deg}
.sa-tabs button.is-on::before{content:'';position:absolute;top:-6px;left:50%;width:34px;height:11px;translate:-50% 0;rotate:-4deg;background-color:color-mix(in srgb,#F7B2CB 85%,transparent);background-image:var(--stripes);-webkit-mask:var(--tape-mask);mask:var(--tape-mask)}
/* Tiêu đề khối = chữ trên mẩu băng keo */
.sa-h{--tape:#FBD3C4;position:relative;isolation:isolate;width:fit-content;padding:3px 12px 3px 2px}
.sa-h::before{content:'';position:absolute;z-index:-1;inset:3px -6px 1px 14px;background-color:color-mix(in srgb,var(--tape) 72%,transparent);-webkit-mask:var(--tape-mask);mask:var(--tape-mask);rotate:-1.2deg}
.sa-h i{background:#fff;box-shadow:0 0 0 2px #fff,0 2px 5px rgba(150,80,110,.18)}
.sa-h .sa-badge{margin-left:6px;background:#fff}
.sa-pane > div:nth-child(2) .sa-h,.sa-once-main .sa-h{--tape:#CFE6F6}
.sa-pane > div:nth-child(3) .sa-h,.sa-once-new .sa-h{--tape:#BDE6CD}
#sa-req-box .sa-h{--tape:#F6DD92}
/* Ô số liệu = giấy note dán băng keo, nghiêng lệch nhau */
.sa-stats{padding-top:6px}
.sa-stats div{position:relative;border-radius:3px 3px 14px 3px;box-shadow:0 3px 0 color-mix(in srgb,var(--c) 22%,#fff),0 10px 18px -14px rgba(120,60,90,.5);rotate:-1.2deg}
.sa-stats div:nth-child(2){rotate:.9deg}.sa-stats div:nth-child(3){rotate:-.5deg}
.sa-stats div::before{content:'';position:absolute;top:-8px;left:50%;width:40px;height:14px;translate:-50% 0;rotate:3deg;background-color:color-mix(in srgb,var(--c) 32%,#fff);background-image:var(--stripes);-webkit-mask:var(--tape-mask);mask:var(--tape-mask)}
.sa-stats i{box-shadow:0 0 0 2px #fff,0 3px 6px -2px color-mix(in srgb,var(--c) 45%,transparent)}
/* Khung tạo link = tờ giấy caro có mẩu washi xanh bạc hà */
.sa-once-new{position:relative;background-color:#FFF9FB;background-image:linear-gradient(rgba(236,110,155,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(236,110,155,.08) 1px,transparent 1px);background-size:18px 18px;border:1.5px solid #F6CFDD;box-shadow:0 3px 0 #F6D7E2;margin-top:6px}
.sa-once-new::before{content:'';position:absolute;top:-10px;right:22px;width:64px;height:18px;rotate:5deg;background-color:color-mix(in srgb,#BDE6CD 88%,transparent);background-image:var(--stripes);-webkit-mask:var(--tape-mask);mask:var(--tape-mask)}
/* Tên người nhận / thành viên = nhãn washi nhỏ */
.sa-tag{border-radius:3px;background-color:#FFE1EC;background-image:var(--stripes);rotate:-1.5deg}
.sa-tag:nth-child(even){rotate:1.2deg;background-color:#E3F0FB;color:#3f74a6}
/* Thẻ link = tờ giấy kẻ dòng, đường may nét đứt, mẩu washi theo màu trạng thái, bóng in */
.sa-card{position:relative;background-color:#fff;background-image:linear-gradient(rgba(236,110,155,.06) 1px,transparent 1px);background-size:100% 22px;
  border:1.5px solid color-mix(in srgb,var(--st) 28%,#fff);border-radius:5px 16px 16px 16px;
  box-shadow:0 3px 0 color-mix(in srgb,var(--st) 20%,#fff),0 14px 24px -18px rgba(120,60,90,.55);
  outline:1.5px dashed color-mix(in srgb,var(--st) 32%,transparent);outline-offset:-7px;rotate:-.35deg;margin-top:6px}
#sa-once-list > .sa-card:nth-child(even){rotate:.35deg}
.sa-card::before{content:'';position:absolute;top:-9px;left:20px;width:58px;height:18px;rotate:-6deg;background-color:color-mix(in srgb,var(--st) 35%,#fff);background-image:var(--stripes);-webkit-mask:var(--tape-mask);mask:var(--tape-mask);pointer-events:none}
.sa-card.is-open{rotate:0deg;border-color:#F7A8C6;outline-color:rgba(236,95,149,.45);box-shadow:0 3px 0 #F6C3D6,0 18px 32px -18px rgba(236,95,149,.55)}
.sa-st-ic{box-shadow:0 0 0 2.5px #fff,0 3px 7px -2px color-mix(in srgb,var(--st) 50%,transparent)}
.sa-pill{box-shadow:0 0 0 2px #fff,0 2px 4px rgba(120,60,90,.12);rotate:2deg}
.sa-mid{background:#FFF8FB;border:1.5px dashed #F4D6E1}
.sa-btn{box-shadow:0 3px 0 var(--sa-pink-d)}
.sa-btn-ghost,.sa-sec .sa-btn-ghost{background:#fff;border:1.5px dashed #F2C3D4;box-shadow:0 2px 0 #F8DDE7}
.sa-btn-danger{border-color:#F5B9B9!important;background:#FFF5F5!important}
/* Khối chi tiết = phiếu giấy kẻ dòng; người / đề = thẻ trắng viền in */
.sa-sec{background-color:#FFFEFA;background-image:linear-gradient(rgba(130,170,220,.12) 1px,transparent 1px);background-size:100% 22px;border:1.5px dashed #F2CFDC;border-radius:12px}
.sa-sec h5 > i{box-shadow:0 0 0 2px #fff,0 2px 5px rgba(150,80,110,.2)}
.sa-pr,.sa-qcard{border:1.5px solid #F6E2EA;box-shadow:0 2px 0 #F6E2EA}
.sa-av-soft{box-shadow:0 0 0 2px #fff;rotate:-3deg}
.sa-grade{box-shadow:0 0 0 1.5px #fff}
.sa-roster span.is-in{background-image:var(--stripes);border-radius:3px;rotate:-1deg}
.sa-roster span.is-in:nth-child(even){rotate:1deg}
/* Yêu cầu truy cập = giấy note vàng dán băng keo */
.sa-req-card{position:relative;background-color:#FFF8DC;background-image:linear-gradient(rgba(215,170,60,.14) 1px,transparent 1px);background-size:100% 22px;border:1.5px solid #F2DFA6;box-shadow:0 3px 0 #F2DFA6;rotate:-.6deg;margin-top:6px}
.sa-req-card::before{content:'';position:absolute;top:-9px;left:50%;width:56px;height:17px;translate:-50% 0;rotate:-3deg;background-color:color-mix(in srgb,#F6DD92 90%,transparent);background-image:var(--stripes);-webkit-mask:var(--tape-mask);mask:var(--tape-mask)}
/* Mã QR từng link: ảnh polaroid dán băng keo + nút Phóng to / Tải ảnh; màn phóng to nằm ngoài .sa (gắn vào body) */
.sa-acts .sa-qr-btn{flex:none;width:38px;padding:0}
.sa-acts .sa-qr-btn.is-on{background:var(--sa-pink);color:#fff;border-color:var(--sa-pink);box-shadow:0 2px 0 var(--sa-pink-d)}
.sa-qr{display:flex;align-items:center;flex-wrap:wrap;gap:14px;padding:14px 12px 10px;border-radius:14px;background:#FFF8FB;border:1.5px dashed #F4D6E1;animation:sa-in .2s ease}
.sa-qr-full{--sa-pink:#ff69b4;--sa-pink-d:#e0559f;--tape-mask:conic-gradient(from 45deg at left,#000 90deg,#0000 0) left/51% 6px repeat-y,conic-gradient(from 225deg at right,#000 90deg,#0000 0) right/51% 6px repeat-y;
  --stripes:repeating-linear-gradient(45deg,rgba(255,255,255,.45) 0 4px,transparent 4px 8px)}
.sa-polaroid{position:relative;flex:none;width:150px;margin:0;padding:8px 8px 6px;border-radius:4px;background:#fff;box-shadow:0 2px 0 #F1DCE5,0 12px 20px -12px rgba(120,60,90,.55);rotate:-2deg}
.sa-polaroid::before{content:'';position:absolute;top:-9px;left:50%;width:56px;height:17px;translate:-50% 0;rotate:3deg;background-color:color-mix(in srgb,#F7B2CB 85%,transparent);background-image:var(--stripes);-webkit-mask:var(--tape-mask);mask:var(--tape-mask)}
.sa-qr-img{width:100%;aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:11px;color:#9b8a93;text-align:center}
.sa-qr-img svg{display:block;width:100%;height:100%}
.sa-polaroid figcaption{margin-top:5px;font-size:12.5px;font-weight:800;color:#6E3A55;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sa-polaroid figcaption small{display:block;margin-top:4px;font-size:13px;font-weight:600;color:#A07086}
.sa-qr-side{flex:1;min-width:150px;display:flex;flex-direction:column;gap:7px}
.sa-qr-side p{margin:0;font-size:11.5px;line-height:1.45;color:#6f5a64}
.sa-qr-side .sa-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border-radius:999px;text-decoration:none}
.sa-qr-full{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;padding:20px;background:rgba(60,25,42,.62);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);animation:sa-in .2s ease}
.sa-polaroid.is-big{width:min(80vw,64vh,520px);padding:16px 16px 12px;rotate:-1.5deg}
.sa-polaroid.is-big::before{width:110px;height:30px;top:-15px}
.sa-polaroid.is-big figcaption{margin-top:10px;font-size:24px}
.sa-qr-full .sa-btn{height:44px;padding:0 28px;font-size:14px;border-radius:999px}
/* Ghi chú tab Link riêng: dòng chế độ hiện tại (xanh = Hạn chế, vàng = Ai có link) + mục gập giải thích */
.sa-once-info{display:flex;flex-direction:column;gap:8px;min-width:0}
.sa-modebar{display:flex;align-items:flex-start;flex-wrap:wrap;gap:8px;margin:0;padding:9px 11px;border-radius:12px;font-size:11.5px;line-height:1.5}
.sa-modebar > i{margin-top:3px}
.sa-modebar > span{flex:1;min-width:180px}
.sa-modebar.is-ok{background:#EAF8F0;color:#24704b;border:1.5px dashed #BFE5CD}
.sa-modebar.is-warn{background:#FFF6DC;color:#7a5b12;border:1.5px dashed #F2D58A}
.sa-modebar button{margin-left:auto;align-self:center;padding:5px 11px;border:0;border-radius:999px;background:#fff;color:#946200;font-size:11px;font-weight:800;cursor:pointer;box-shadow:0 2px 0 #F2D58A}
.sa-help{border-radius:12px;background:#fff;border:1.5px dashed #F2CFDC}
.sa-help > summary{display:flex;align-items:center;gap:7px;padding:8px 11px;font-size:11.5px;font-weight:800;color:#6f5a64;cursor:pointer;list-style:none}
.sa-help > summary::-webkit-details-marker{display:none}
.sa-help > summary::after{content:'▾';margin-left:auto;color:#C99BB0;transition:transform .15s}
.sa-help[open] > summary::after{transform:rotate(180deg)}
.sa-help > summary i{color:var(--sa-pink-d)}
.sa-help ul{margin:0;padding:0 12px 10px 28px;display:flex;flex-direction:column;gap:5px;font-size:11.5px;line-height:1.5;color:#6f5a64}
.sa-help b{color:var(--sa-ink)}
/* Tab Mọi người / Cài đặt: các ô = giấy trắng viền may */
.sa-general,.sa-switch-row{background:#fff;border:1.5px dashed #F2C3D4;box-shadow:0 2px 0 #F8DDE7}
.sa-person:first-child{background:#FFF1F6}
/* MÁY TÍNH: tab Link riêng — hộp Chia sẻ (index.html .sm-card / quiz.html) giãn rộng, chia 2 cột:
   trái = yêu cầu + tạo link (dính khi cuộn), phải = danh sách link. Trình duyệt chưa có :has() thì giữ hộp hẹp như cũ. */
@media (min-width:900px){
  #shareQuizModal > div:has(.sa[data-tab="links"]){max-width:min(940px,calc(100vw - 64px))!important}
  #shareQuizModal > div{transition:max-width .25s ease}
  .sa[data-tab="links"] .sa-once:not(.hidden){display:grid;grid-template-columns:minmax(0,350px) minmax(0,1fr);gap:14px 18px;align-items:start}
  .sa[data-tab="links"] #sa-once-stats,.sa[data-tab="links"] .sa-once-info{grid-column:1/-1}
  .sa[data-tab="links"] .sa-once-side{position:sticky;top:56px}
  .sa[data-tab="links"] .sa-stats div{grid-template-columns:auto auto 1fr}
  .sa[data-tab="links"] .sa-stats small{grid-column:auto;margin:0}
}
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

// Ba tab: Mọi người (thêm người + quyền chung) · Link riêng · Cài đặt. Nhớ tab lần trước trên máy; có yêu cầu chờ duyệt mà chưa bấm tab nào
// thì tự nhảy sang Link riêng. Chọn nhiều bộ đề (không có oneTime) thì ẩn tab Link riêng.
let tab = (() => { try { return localStorage.getItem('sa-tab') || 'people'; } catch (e) { return 'people'; } })();
let tabTouched = false;
function applyTab() {
    const sec = document.getElementById('share-access-section');
    if (!sec) return;
    const hasLinks = !!current?.oneTime;
    const want = !tabTouched && hasLinks && once.requests.length ? 'links' : tab;
    const t = want === 'links' && !hasLinks ? 'people' : want;
    sec.querySelector('.sa-tabs [data-tab="links"]')?.classList.toggle('hidden', !hasLinks);
    sec.querySelectorAll('.sa-tabs [data-tab]').forEach(b => {
        const on = b.dataset.tab === t;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    sec.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== t; });
    sec.dataset.tab = t;             // máy tính: tab Link riêng giãn hộp + chia 2 cột (CSS @media min-width 900px)
}

function build(section) {
    if (section.dataset.built) return;
    section.dataset.built = '1';
    injectCss();
    section.className = 'sa';
    section.innerHTML = `
        <div class="sa-tabs" role="tablist" aria-label="Chia sẻ">
            <button type="button" role="tab" data-tab="people"><i class="fas fa-user-group"></i> Mọi người</button>
            <button type="button" role="tab" data-tab="links"><i class="fas fa-key"></i> Link riêng <em id="sa-tab-dot" class="sa-dot hidden"></em></button>
            <button type="button" role="tab" data-tab="settings"><i class="fas fa-sliders"></i> Cài đặt</button>
        </div>
        <div class="sa-pane" data-pane="people">
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
        </div>
        <div class="sa-pane" data-pane="links" hidden>
        <div id="sa-once" class="sa-once hidden">
            <div id="sa-once-stats" class="sa-stats"></div>
            <div class="sa-once-info">
                <p id="sa-once-mode" class="sa-modebar"></p>
                <details class="sa-help">
                    <summary><i class="fas fa-circle-info"></i> Cách link riêng hoạt động</summary>
                    <ul id="sa-help-list"></ul>
                </details>
            </div>
            <div class="sa-once-side">
            <div id="sa-req-box" class="hidden">
                <p class="sa-h" style="margin-bottom:8px"><i class="fas fa-hand"></i> Yêu cầu truy cập <span id="sa-req-count" class="sa-badge"></span></p>
                <ul id="sa-req-list" class="sa-list"></ul>
            </div>
            <div class="sa-once-new">
                <p class="sa-h"><i class="fas fa-plus"></i> Tạo link mới</p>
                <div class="sa-seg" role="radiogroup" aria-label="Kiểu link">
                    <button type="button" role="radio" data-once-mode="one"><i class="fas fa-user-plus"></i> Một người</button>
                    <button type="button" role="radio" data-once-mode="group"><i class="fas fa-users"></i> Cả nhóm</button>
                </div>
                <p id="sa-once-mode-desc" class="sa-desc" style="margin:0"></p>
                <div class="sa-line">
                    <div class="sa-tags" data-tags="names"><input type="text" class="sa-tag-in" maxlength="60" placeholder="Tên người nhận, cách nhau dấu phẩy" autocomplete="off" aria-label="Tên người nhận"></div>
                    <input type="text" id="sa-once-name" class="sa-input hidden" maxlength="60" placeholder="Tên nhóm — vd: Tổ 17" autocomplete="off">
                    <span class="sa-step" aria-label="Số thiết bị mở được"><button type="button" data-once-uses="-1" aria-label="Bớt"><i class="fas fa-minus"></i></button><b id="sa-once-uses">1</b><button type="button" data-once-uses="1" aria-label="Thêm"><i class="fas fa-plus"></i></button><small>thiết bị</small></span>
                </div>
                <div class="sa-tags hidden" data-tags="members"><input type="text" class="sa-tag-in" maxlength="60" placeholder="Thành viên (không bắt buộc) — Minh, Hoa, Khang…" autocomplete="off" aria-label="Thành viên nhóm"></div>
                <p id="sa-tags-hint" class="sa-desc" style="margin:-2px 0 0"></p>
                <div class="sa-chips" role="radiogroup" aria-label="Thời hạn link">
                    ${ONCE_HOURS.map(([h, l]) => `<button type="button" data-once-hours="${h}" role="radio">${l}</button>`).join('')}
                </div>
                <p id="sa-once-preview" class="sa-preview"></p>
                <button type="button" id="sa-once-create" class="sa-btn"><i class="fas fa-copy"></i> Tạo link &amp; sao chép</button>
            </div>
            </div>
            <div class="sa-once-main">
            <p class="sa-h"><i class="fas fa-mobile-screen"></i> Link đã tạo <span id="sa-once-count" class="sa-badge"></span></p>
            <ul id="sa-once-list" class="sa-list"></ul>
            </div>
        </div>
        </div>
        <div class="sa-pane" data-pane="settings" hidden>
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
        </div>
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
    // Link riêng (tab Link riêng) chạy độc lập với chế độ này — ghi rõ để khỏi tưởng "Hạn chế" là chặn cả link riêng
    const linkNote = t.oneTime ? (general === 'public' ? ' Lúc này không cần link riêng.' : ' Người có link riêng vẫn vào được.') : '';
    if (desc) desc.textContent = (general === 'public'
        ? 'Ai có đường liên kết đều xem và làm bài được, không cần tài khoản (khách lưu kết quả trên máy của họ).'
        : general === 'mixed' ? 'Các bộ đề đã chọn đang khác nhau — chọn một chế độ để áp cho tất cả.'
        : 'Chỉ những người trong danh sách trên mở được — đăng nhập Google đúng email, tối đa 2 máy.') + (general === 'mixed' ? '' : linkNote);

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
let onceGroup = false;               // LINK NHÓM: "Gửi Tổ 17…", người mở chọn / gõ tên mình (api/link.js claim.who)
// Ô nhập tên kiểu THẺ: gõ dấu phẩy / Enter / dán cả danh sách là tách thành từng tên.
//   names: người nhận (Một người — nhiều tên = tạo nhiều link riêng một lượt) · members: thành viên link nhóm
const tags = { names: [], members: [] };
const openRows = new Set();          // link đang mở phần chi tiết
let historyOpen = false;
const onceUrl = (token) => apiUrl(`api/link?t=${encodeURIComponent(token)}`);
const ONCE_MAX_USES = 200;           // khớp MAX_USES trong api/link.js
/** Ô danh sách thành viên → mảng tên (mỗi dòng / dấu phẩy một tên, bỏ trùng). */
const membersOf = (text) => [...new Map(String(text || '').split(/[\n,;]+/).map(s => s.replace(/\s+/g, ' ').trim().slice(0, 40))
    .filter(Boolean).map(s => [s.toLocaleLowerCase('vi'), s])).values()];
const linkTitle = (l) => l.name ? `${l.group ? 'Nhóm' : 'Gửi'} <b>${esc(l.name)}</b>` : `<i>${l.group ? 'Nhóm chưa đặt tên' : 'Chưa đặt tên'}</i>`;

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
// Chỉ 'list' kèm kết quả làm bài (claims[].done) — link trả về từ sửa / gỡ / duyệt thì giữ lại kết quả đang có
const putLink = (l) => {
    const i = once.links.findIndex(x => x.token === l.token);
    if (i < 0) return once.links.unshift(l);
    const old = once.links[i];
    (l.claims || []).forEach(c => { if (!c.done?.length) c.done = old.claims?.find(o => o.uid === c.uid)?.done || []; });
    once.links[i] = l;
};
const resByQuiz = new Set();          // link đang xem kết quả "Theo đề" (mặc định "Theo người")

/** Bản xem trước khớp thẻ Open Graph máy chủ vẽ (api/link.js previewPage). */
function previewOf(name, uses, group) {
    const verb = current?.oneTime?.kind === 'folder' ? 'học thư mục' : 'làm bộ đề';
    const what = current?.title ? `“${current.title}”` : '';
    if (group) return {
        title: `${name ? `Gửi ${name}: các bạn` : 'Các bạn'} được mời ${verb} ${what} trên Zitthenkne`.replace(/\s+/g, ' '),
        desc: 'Link truy cập nhóm — mỗi thành viên xác nhận tên và sử dụng trên 1 thiết bị.'
    };
    return {
        title: `${name ? `Gửi bạn ${name}, bạn` : 'Bạn'} được mời ${verb} ${what} trên Zitthenkne`.replace(/\s+/g, ' '),
        desc: `Link truy cập riêng, sử dụng được trên ${uses} thiết bị.`
    };
}
/** Tên trong ô thẻ + chữ đang gõ dở (chưa bấm phẩy). */
function tagsOf(kind) {
    const pending = document.querySelector(`#sa-once [data-tags="${kind}"] .sa-tag-in`)?.value || '';
    return membersOf([...tags[kind], pending].join('\n'));
}
function addTags(kind, text) {
    tags[kind] = membersOf([...tags[kind], text].join('\n'));
    renderTags(kind);
}
function renderTags(kind) {
    const box = document.querySelector(`#sa-once [data-tags="${kind}"]`);
    if (!box) return;
    box.querySelectorAll('.sa-tag').forEach(x => x.remove());
    box.querySelector('.sa-tag-in').insertAdjacentHTML('beforebegin', tags[kind].map((n, i) =>
        `<span class="sa-tag">${esc(n)}<button type="button" data-untag="${kind}" data-i="${i}" aria-label="Bỏ ${esc(n)}">×</button></span>`).join(''));
    if (kind === 'members' && tags.members.length) onceUses = Math.min(ONCE_MAX_USES, tags.members.length);
    renderPreview();
}
function renderPreview() {
    const el = document.getElementById('sa-once-preview');
    if (!el) return;
    const names = onceGroup ? [] : tagsOf('names');
    const p = previewOf(onceGroup ? (document.getElementById('sa-once-name')?.value || '').replace(/\s+/g, ' ').trim() : (names[0] || ''), onceUses, onceGroup);
    el.innerHTML = `<span class="sa-pv-tag">Xem trước khi dán vào Messenger / Zalo</span>
        <span class="sa-pv-card"><b>${esc(p.title)}</b>${esc(p.desc)}<small>${esc(location.host)} · ${onceGroup ? 'link nhóm' : 'link riêng'}</small></span>`;
    const n = document.getElementById('sa-once-uses');
    if (n) n.textContent = onceUses;
    // Kiểu link: Một người / Cả nhóm
    document.querySelectorAll('#sa-once [data-once-mode]').forEach(b => {
        const on = (b.dataset.onceMode === 'group') === onceGroup;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    document.getElementById('sa-once-name')?.classList.toggle('hidden', !onceGroup);
    document.querySelector('#sa-once [data-tags="names"]')?.classList.toggle('hidden', onceGroup);
    document.querySelector('#sa-once [data-tags="members"]')?.classList.toggle('hidden', !onceGroup);
    const md = document.getElementById('sa-once-mode-desc');
    if (md) md.textContent = onceGroup ? 'Một link cho cả nhóm, mỗi người chọn tên mình.' : 'Mỗi người một link, mỗi máy 1 suất.';
    const members = onceGroup ? tagsOf('members') : [];
    const hint = document.getElementById('sa-tags-hint');
    if (hint) hint.textContent = onceGroup
        ? (members.length ? `${members.length} thành viên.` : 'Bỏ trống thì người mở tự gõ tên.')
        : names.length > 1 ? `Tạo ${names.length} link, sao chép cả danh sách.` : 'Gõ dấu phẩy để thêm người.';
    const btn = document.getElementById('sa-once-create');
    if (btn && !btn.disabled) btn.innerHTML = `<i class="fas fa-copy"></i> ${names.length > 1 ? `Tạo ${names.length} link &amp; sao chép` : 'Tạo link &amp; sao chép'}`;
}

const stepper = (attrs, n) => `<span class="sa-step"><button type="button" ${attrs} data-d="-1" aria-label="Bớt"><i class="fas fa-minus"></i></button><b>${n}</b><button type="button" ${attrs} data-d="1" aria-label="Thêm"><i class="fas fa-plus"></i></button><small>thiết bị</small></span>`;

const whoOf = (c) => c.who || c.email || c.name || c.label || 'Một thiết bị';
// Kết quả làm bài qua link (api/link.js 'progress'): viên điểm cao nhất, màu theo mức; ×n = số lần nộp
const pctClass = (p) => p >= 80 ? 'is-good' : p >= 50 ? 'is-mid' : 'is-low';
const pctOf = (x) => Math.round(x.best ?? 0);
const scoreTip = (label, x) => `${label}: cao nhất ${x.best}% · gần nhất ${x.last}% · ${x.n} lần nộp${x.at ? ` · ${fmtUntil(x.at)}` : ''}`;
// Viên điểm có nền tô theo % (nhìn là biết cao / thấp); ×n = số lần nộp
const scoreChip = (label, x) => `<span class="sa-score ${pctClass(pctOf(x))}" style="--p:${pctOf(x)}%" title="${esc(scoreTip(label, x))}"><b>${esc(label)}</b><em>${pctOf(x)}%</em>${x.n > 1 ? `<small>×${x.n}</small>` : ''}</span>`;
// Ô đại diện người / máy: chữ cái đầu trên nền màu nhạt (máy ẩn danh chưa xưng tên → icon điện thoại)
function softAv(c) {
    const who = whoOf(c), anon = c.anon && !c.who;
    const col = anon ? '#3b82f6' : avColor(who);
    return `<span class="sa-av-soft" style="background:${col}22;color:${col}">${anon ? '<i class="fas fa-mobile-screen"></i>' : esc(who.charAt(0).toUpperCase())}</span>`;
}
/** Theo đề: mỗi bộ đề một thẻ, mỗi người một thanh điểm */
function resultsByQuiz(l) {
    const m = new Map();
    (l.claims || []).forEach(c => (c.done || []).forEach(x => {
        const e = m.get(x.quizId) || { title: x.title, rows: [] };
        e.rows.push([whoOf(c), x]);
        m.set(x.quizId, e);
    }));
    if (!m.size) return '<p class="sa-empty-row">Chưa ai nộp bài.</p>';
    return [...m.values()].sort((a, b) => b.rows.length - a.rows.length || (a.title || '').localeCompare(b.title || '', 'vi')).map(e => `
        <div class="sa-qcard">
            <div class="sa-qcard-h"><i class="fas fa-book-open"></i><b title="${esc(e.title)}">${esc(e.title || 'Bộ đề')}</b><small>${e.rows.length} người</small></div>
            ${e.rows.sort((a, b) => pctOf(b[1]) - pctOf(a[1])).map(([w, x]) => `
            <div class="sa-bar ${pctClass(pctOf(x))}" title="${esc(scoreTip(w, x))}"><span>${esc(w)}</span><i><u style="width:${pctOf(x)}%"></u></i><b>${pctOf(x)}%${x.n > 1 ? `<small>×${x.n}</small>` : ''}</b></div>`).join('')}
        </div>`).join('');
}
/** Theo người: thẻ nhỏ — ai, máy gì, mở lúc nào · huy hiệu điểm · các viên điểm từng đề */
function claimRow(token, c, live, kind = 'quiz') {
    const who = whoOf(c), done = c.done || [];
    const meta = [c.who ? c.email : '', c.who || c.email || c.name ? c.label : '', [c.city, c.country].filter(Boolean).join(', '),
        c.at ? `mở ${fmtUntil(c.at)}` : '', c.via === 'request' ? 'được duyệt yêu cầu' : ''].filter(Boolean).join(' · ');
    const avg = done.length ? Math.round(done.reduce((s, x) => s + pctOf(x), 0) / done.length) : null;
    const grade = !done.length ? '<span class="sa-grade is-none"><i class="fas fa-clock"></i> Chưa làm</span>'
        : kind === 'quiz' ? `<span class="sa-grade ${pctClass(avg)}"><i class="fas fa-trophy"></i> ${avg}%</span>`
        : `<span class="sa-grade ${pctClass(avg)}" title="Điểm cao nhất trung bình">${done.length} đề · TB ${avg}%</span>`;
    return `
        <div class="sa-pr">
            <div class="sa-pr-top">
                ${softAv(c)}
                <span class="sa-who"><span class="sa-name" title="${esc(who)}">${esc(who)}</span><span class="sa-sub" title="${esc(meta)}">${esc(meta)}</span></span>
                ${grade}
                ${live ? `<button type="button" class="sa-kick" data-kick="${esc(token)}" data-uid="${esc(c.uid)}" title="Gỡ và chặn máy này" aria-label="Gỡ máy này"><i class="fas fa-xmark"></i></button>` : ''}
            </div>
            ${kind !== 'quiz' && done.length ? `<div class="sa-done">${done.map(x => scoreChip(x.title || 'Bộ đề', x)).join('')}</div>`
                : kind === 'quiz' && done[0]?.n > 1 ? `<div class="sa-done">${scoreChip('Gần nhất', { ...done[0], best: done[0].last })}<span class="sa-sub">${done[0].n} lần nộp</span></div>` : ''}
        </div>`;
}

// Suất máy: mỗi máy một icon điện thoại (≤ 12), nhiều hơn thì một thanh liền
const seatBar = (used, max) => max <= 12
    ? `<span class="sa-seats" aria-hidden="true">${Array.from({ length: max }, (_, i) => `<i class="fas fa-mobile-screen${i < used ? ' on' : ''}"></i>`).join('')}</span>`
    : `<span class="sa-seats is-bar"><u style="width:${Math.round(used / max * 100)}%"></u></span>`;
// Mặt những người / máy đã mở (tối đa 4, còn lại "+n")
function faces(claims) {
    const show = claims.slice(0, 4).map(c => {
        const who = whoOf(c), icon = c.anon && !c.who;
        return `<span title="${esc(who)}" style="background:${icon ? '#60a5fa' : avColor(who)}">${icon ? '<i class="fas fa-mobile-screen"></i>' : esc(who.charAt(0).toUpperCase())}</span>`;
    }).join('');
    return claims.length ? `<span class="sa-faces">${show}${claims.length > 4 ? `<span class="is-more">+${claims.length - 4}</span>` : ''}</span>` : '';
}
// [màu chữ, màu nền nhạt, icon, nhãn]
const ONCE_STATE = {
    free: ['#3b82f6', '#e6f0ff', 'fa-share-nodes', 'Chưa ai mở'], used: ['#16a36a', '#ddf6ea', 'fa-check', 'Đang dùng'],
    full: ['#7c5ce0', '#efe9ff', 'fa-lock', 'Đã đủ máy'], expired: ['#9b8a93', '#f1ebee', 'fa-clock', 'Hết hạn']
};
const editRows = new Set();          // link đang mở khối "Chỉnh sửa link"
// MÃ QR từng link (core/qr.js — tạo trên máy, không gửi link ra ngoài; mỗi link một bảng màu). qrCache: token → { svg, png } để vẽ lại không nháy.
const qrRows = new Set();
const qrCache = new Map();
const qrMod = () => import('../../core/qr.js');
const qrCaption = (l) => l ? `${l.group ? 'Nhóm' : 'Gửi'} ${l.name || (l.group ? 'chưa đặt tên' : 'bạn')}` : '';
async function qrOf(token) {
    if (!qrCache.has(token)) {
        const m = await qrMod();
        const url = onceUrl(token);
        const [svg, png] = await Promise.all([m.qrSvg(url, { seed: token }), m.qrPng(url, { seed: token })]);
        qrCache.set(token, { svg, png });
    }
    return qrCache.get(token);
}
/** Điền mã vào các khung QR đang hiện (sau mỗi lần vẽ lại danh sách). */
function fillQrs() {
    document.querySelectorAll('#sa-once [data-qr-box]').forEach(async (box) => {
        const token = box.dataset.qrBox;
        if (box.dataset.done) return;
        try {
            const q = await qrOf(token);
            box.innerHTML = q.svg; box.dataset.done = '1';
            const dl = box.closest('.sa-qr')?.querySelector('[data-qr-dl]');
            if (dl) dl.href = q.png;
        } catch (e) { box.innerHTML = '<span>Không tạo được mã QR — kiểm tra mạng.</span>'; }
    });
}
/** Phóng to toàn màn hình — chiếu lên cho cả lớp quét. Bấm nền / Esc / nút Đóng để tắt. */
async function showQrFull(token) {
    const l = once.links.find(x => x.token === token);
    let q;
    try { q = await qrOf(token); } catch (e) { return showToast('Không tạo được mã QR — kiểm tra mạng.', 'error'); }
    const ov = document.createElement('div');
    ov.className = 'sa-qr-full';
    ov.innerHTML = `<figure class="sa-polaroid is-big"><div class="sa-qr-img">${q.svg}</div>
        <figcaption>${esc(qrCaption(l))}<small>Quét bằng camera điện thoại · mỗi máy 1 suất</small></figcaption></figure>
        <button type="button" class="sa-btn">Đóng</button>`;
    const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('button')) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(ov);
}

function linkRow(l) {
    const st = onceState(l), used = linkUsed(l), claims = l.claims || [];
    const S = ONCE_STATE[st];
    const live = st !== 'expired';
    const last = claims.reduce((m, c) => Math.max(m, c.seen || c.at || 0), 0);
    const soon = live && l.expiresAt != null && l.expiresAt - Date.now() < 24 * 3600000;
    const ttl = !live ? 'sẽ tự chuyển vào lịch sử' : l.expiresAt == null ? 'không hết hạn' : leftText(l.expiresAt);
    const sub = `<span class="sa-ttl${soon ? ' is-soon' : ''}"><i class="fas fa-clock"></i> ${esc(ttl)}</span> · ${esc(last ? `mở gần nhất ${fmtUntil(last)}` : `tạo ${fmtUntil(l.createdAt)}`)}`;
    const open = openRows.has(l.token);
    // Kết quả làm bài: bao nhiêu máy đã nộp, tổng lượt nộp
    const nDone = claims.filter(c => c.done?.length).length;
    const nSubmit = claims.reduce((n, c) => n + (c.done || []).reduce((k, x) => k + (x.n || 0), 0), 0);
    const byQuiz = resByQuiz.has(l.token);
    // Link nhóm có danh sách: ai đã vào (xanh) / chưa vào
    const members = l.members || [];
    const inKeys = new Set(claims.map(c => (c.who || '').toLocaleLowerCase('vi')).filter(Boolean));
    const nIn = members.filter(m => inKeys.has(m.toLocaleLowerCase('vi'))).length;
    const roster = !l.group || !members.length ? '' : `
            <section class="sa-sec">
                <h5><i class="fas fa-users"></i> Thành viên <small>${nIn}/${members.length} đã vào</small></h5>
                <div class="sa-roster">${members.map(m => inKeys.has(m.toLocaleLowerCase('vi'))
                    ? `<span class="is-in"><i class="fas fa-check"></i>${esc(m)}</span>` : `<span><i class="fas fa-clock"></i>${esc(m)}</span>`).join('')}</div>
            </section>`;
    // Chi tiết: thành viên → ai đã mở & kết quả → (gập) chỉnh sửa link
    const results = `
            <section class="sa-sec">
                <h5><i class="fas fa-trophy"></i> Kết quả làm bài <small>${used}/${l.maxUses} máy</small>
                    ${l.kind === 'folder' && nDone ? `<span class="sa-mini-seg">
                        <button type="button" data-resview="${esc(l.token)}" data-v="person" class="${byQuiz ? '' : 'is-on'}">Theo người</button>
                        <button type="button" data-resview="${esc(l.token)}" data-v="quiz" class="${byQuiz ? 'is-on' : ''}">Theo đề</button></span>` : ''}</h5>
                ${!used ? '<p class="sa-empty-row">Chưa có máy nào mở link.</p>'
                    : byQuiz && l.kind === 'folder' ? resultsByQuiz(l)
                    : claims.map(c => claimRow(l.token, c, live, l.kind)).join('')}
            </section>`;
    const editing = editRows.has(l.token);
    const edit = !live ? '' : `
            <button type="button" class="sa-edit-toggle" data-edit-toggle="${esc(l.token)}" aria-expanded="${editing}">
                <i class="fas fa-sliders"></i> Chỉnh sửa link <i class="fas fa-chevron-${editing ? 'up' : 'down'} sa-chev"></i></button>
            ${editing ? `
            <section class="sa-sec">
                <label class="sa-field"><span>${l.group ? 'Tên nhóm' : 'Tên người nhận'}</span>
                    <span class="sa-line"><input type="text" class="sa-input" data-rename-input="${esc(l.token)}" value="${esc(l.name)}" maxlength="60" placeholder="${l.group ? 'vd: Tổ 17' : 'vd: An'}">
                    <button type="button" class="sa-btn sa-btn-sm" data-rename="${esc(l.token)}">Lưu</button></span></label>
                ${l.group ? `
                <label class="sa-field"><span>Danh sách thành viên</span>
                    <textarea class="sa-input sa-area" data-members-input="${esc(l.token)}" rows="3" placeholder="Minh, Hoa, Khang… (dấu phẩy hoặc xuống dòng) — bỏ trống: người mở tự gõ tên">${esc(members.join('\n'))}</textarea>
                    <button type="button" class="sa-btn sa-btn-sm sa-btn-ghost" data-members="${esc(l.token)}"><i class="fas fa-users"></i> Lưu danh sách</button></label>` : ''}
                <div class="sa-field"><span>Số thiết bị mở được</span>${stepper(`data-seat="${esc(l.token)}"`, l.maxUses)}</div>
                <div class="sa-field"><span>Gia hạn tính từ bây giờ</span>
                    <div class="sa-chips">${ONCE_HOURS.map(([h, t]) => `<button type="button" data-extend="${esc(l.token)}" data-h="${h}">${t}</button>`).join('')}</div></div>
            </section>` : ''}`;
    const detail = !open ? '' : `<div class="sa-detail">${roster}${results}${edit}</div>`;
    // Mã QR: ảnh polaroid dán băng keo + Phóng to / Tải ảnh
    const qrOpen = live && qrRows.has(l.token);
    const cached = qrCache.get(l.token);
    const qr = !qrOpen ? '' : `
            <div class="sa-qr">
                <figure class="sa-polaroid"><div class="sa-qr-img" data-qr-box="${esc(l.token)}"${cached ? ' data-done="1"' : ''}>${cached ? cached.svg : '<span>Đang tạo mã…</span>'}</div>
                    <figcaption>${esc(qrCaption(l))}</figcaption></figure>
                <div class="sa-qr-side">
                    <p>Quét bằng camera điện thoại để mở. ${l.group ? 'Chiếu lên màn hình cho cả nhóm quét.' : 'Mỗi máy quét = 1 suất.'}</p>
                    <button type="button" class="sa-btn sa-btn-sm" data-qr-full="${esc(l.token)}"><i class="fas fa-expand"></i> Phóng to</button>
                    <a class="sa-btn sa-btn-sm sa-btn-ghost" data-qr-dl="${esc(l.token)}" ${cached ? `href="${cached.png}"` : ''} download="ma-qr-${esc((l.name || 'link').replace(/[^\p{L}\p{N}]+/gu, '-'))}.png"><i class="fas fa-download"></i> Tải ảnh</a>
                </div>
            </div>`;
    const icon = l.group && (st === 'free' || st === 'used') ? 'fa-users' : S[2];
    return `
        <li class="sa-card is-${st}${open ? ' is-open' : ''}" style="--st:${S[0]};--stb:${S[1]}">
            <div class="sa-top">
                <span class="sa-st-ic"><i class="fas ${icon}"></i></span>
                <span class="sa-who"><span class="sa-name">${linkTitle(l)}</span><span class="sa-sub">${sub}</span></span>
                <span class="sa-pill">${S[3]}</span>
            </div>
            <div class="sa-mid">${seatBar(used, l.maxUses)}<span class="sa-seat-n">${used}/${l.maxUses} máy</span>${faces(claims)}</div>
            ${used ? `<div class="sa-sum"><i class="fas fa-list-check"></i>
                <span class="sa-sum-bar"><u style="width:${Math.round(nDone / used * 100)}%"></u></span>
                <span>${nDone}/${used} đã làm bài</span>${nSubmit ? `<small>${nSubmit} lượt nộp</small>` : ''}</div>` : ''}
            <div class="sa-acts">
                ${live ? `<button type="button" class="sa-btn sa-btn-sm" data-once-copy="${esc(l.token)}"><i class="fas fa-copy"></i> Sao chép</button>
                <button type="button" class="sa-btn sa-btn-sm sa-btn-ghost sa-qr-btn${qrOpen ? ' is-on' : ''}" data-once-qr="${esc(l.token)}" title="Mã QR" aria-label="Mã QR" aria-expanded="${qrOpen}"><i class="fas fa-qrcode"></i></button>` : ''}
                <button type="button" class="sa-btn sa-btn-sm sa-btn-ghost" data-once-edit="${esc(l.token)}" aria-expanded="${open}"><i class="fas ${open ? 'fa-chevron-up' : 'fa-chart-pie'}"></i> ${open ? 'Thu gọn' : 'Chi tiết'}</button>
                ${live ? `<button type="button" class="sa-btn sa-btn-sm sa-btn-ghost sa-btn-danger" data-once-revoke="${esc(l.token)}"><i class="fas fa-xmark"></i> Thu hồi</button>` : ''}
            </div>${qr}${detail}
        </li>`;
}

function reqRow(r) {
    const who = r.name || r.email || 'Ai đó';
    const from = r.viaLink ? `qua link “${r.linkName || 'chưa đặt tên'}”` : (r.kind === 'folder' ? 'từ trang thư mục' : 'từ trang bộ đề');
    const sub = [r.name ? r.email : '', from, r.label, [r.city, r.country].filter(Boolean).join(', '), r.updatedAt ? fmtUntil(r.updatedAt) : ''].filter(Boolean).join(' · ');
    return `
        <li class="sa-card sa-req-card">
            <div class="sa-top">
                <span class="sa-av" style="background:${avColor(r.email || who)}">${esc(who.charAt(0).toUpperCase())}</span>
                <span class="sa-who"><span class="sa-name" title="${esc(r.email)}">${esc(who)}</span><span class="sa-sub" title="${esc(sub)}">${esc(sub)}</span></span>
            </div>
            ${r.message ? `<p class="sa-msg">${esc(r.message)}</p>` : ''}
            <div class="sa-acts">
                <button type="button" class="sa-btn sa-btn-sm" data-req-ok="${esc(r.id)}"><i class="fas fa-check"></i> Duyệt</button>
                <button type="button" class="sa-btn sa-btn-sm sa-btn-ghost" data-req-no="${esc(r.id)}"><i class="fas fa-xmark"></i> Từ chối</button>
            </div>
        </li>`;
}

function histRow(h) {
    const opens = h.opens || [];
    const head = `${h.reason === 'revoked' ? 'Thu hồi' : 'Hết hạn'} ${fmtUntil(h.endedAt)} · tạo ${fmtUntil(h.createdAt)} · ${opens.length}/${h.maxUses} máy đã mở`;
    const list = opens.map(o => [o.who || o.label || 'Một thiết bị', o.who ? o.label : '', o.place, o.at ? `mở ${fmtUntil(o.at)}` : '',
        o.seen && o.seen !== o.at ? `gần nhất ${fmtUntil(o.seen)}` : '',
        o.done?.length ? `làm ${o.done.length} đề: ${o.done.slice(0, 4).map(d => `${d.t || 'Bộ đề'} ${Math.round(d.b ?? 0)}%`).join(', ')}${o.done.length > 4 ? '…' : ''}` : ''
    ].filter(Boolean).join(' · '));
    return `
        <li class="is-${h.reason === 'revoked' ? 'revoked' : 'expired'}">
            <span class="sa-name">${linkTitle(h)}</span>
            <span class="sa-sub">${esc(head)}</span>
            ${list.length ? list.map(t => `<span class="sa-sub">• ${esc(t)}</span>`).join('') : '<span class="sa-sub">• Không ai mở</span>'}
        </li>`;
}

// Ghi chú trong tab Link riêng: link riêng chạy ĐỘC LẬP với "Quyền truy cập chung" (firestore.rules linkGranted) —
// dòng trạng thái theo chế độ hiện tại + mục gập giải thích các trường hợp.
function renderOnceInfo() {
    const v = current?.view?.() || {};
    const isFolder = current?.oneTime?.kind === 'folder';
    const what = isFolder ? 'thư mục' : 'bộ đề';
    const mode = document.getElementById('sa-once-mode');
    if (mode) {
        const pub = v.isPublic === true && !v.mixed;
        mode.className = 'sa-modebar ' + (pub ? 'is-warn' : 'is-ok');
        mode.innerHTML = pub
            ? `<i class="fas fa-share-nodes"></i><span><b>Ai có link:</b> ai cầm link thường cũng vào được.</span><button type="button" data-tab-go="people">Chuyển Hạn chế</button>`
            : `<i class="fas fa-lock"></i><span><b>Hạn chế:</b> chỉ người có link riêng hoặc được thêm email mới vào được.</span>`;
    }
    const list = document.getElementById('sa-help-list');
    if (list) list.innerHTML = [
        'Mỗi máy mở link = <b>1 suất</b>. Làm bài không giới hạn.',
        'Đổi Hạn chế / Ai có link không ảnh hưởng link riêng.',
        'Hết hạn, thu hồi, gỡ máy → <b>mất quyền ngay</b>.',
        'Bảng kết quả chỉ tính người mở bằng link riêng.',
        isFolder ? `Mở được cả thư mục con và đề thêm sau.` : ''
    ].filter(Boolean).map(t => `<li>${t}</li>`).join('');
}

function renderOnce() {
    const box = document.getElementById('sa-once');
    if (!box) return;
    const on = !!current?.oneTime;
    box.classList.toggle('hidden', !on);
    applyTab();
    const dot = document.getElementById('sa-tab-dot');
    if (dot) { dot.textContent = on ? once.requests.length : ''; dot.classList.toggle('hidden', !on || !once.requests.length); }
    if (!on) return;
    box.querySelectorAll('[data-once-hours]').forEach(b => {
        const sel = Number(b.dataset.onceHours) === onceHours;
        b.classList.toggle('is-on', sel);
        b.setAttribute('aria-checked', sel ? 'true' : 'false');
    });
    renderPreview();
    writeOnceCache();
    renderOnceInfo();
    const liveLinks = once.links.filter(l => onceState(l) !== 'expired');
    const live = liveLinks.length;
    const count = document.getElementById('sa-once-count');
    if (count) count.innerHTML = once.loading && once.links.length ? '<i class="fas fa-spinner fa-spin"></i> đang cập nhật' : live ? `${live} link` : '';
    const stats = document.getElementById('sa-once-stats');
    if (stats) stats.innerHTML = `
        <div><i class="fas fa-share-nodes"></i><b>${live}</b><small>link đang mở</small></div>
        <div class="is-blue"><i class="fas fa-mobile-screen"></i><b>${liveLinks.reduce((n, l) => n + linkUsed(l), 0)}</b><small>máy đã vào</small></div>
        <div class="${once.requests.length ? 'is-amber' : 'is-zero'}"><i class="fas fa-hand"></i><b>${once.requests.length}</b><small>chờ duyệt</small></div>`;

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
        <li><button type="button" class="sa-hist-btn" data-hist-toggle aria-expanded="${historyOpen}">
            <i class="fas fa-clock-rotate-left"></i> ${historyOpen ? 'Ẩn' : 'Xem'} lịch sử link đã hết hạn / thu hồi (${once.history.length})</button>
            ${historyOpen ? `<ul class="sa-hist">${once.history.map(histRow).join('')}</ul>` : ''}</li>` : '';
    if (!once.links.length) {
        list.innerHTML = `<li class="sa-empty">${once.loading ? 'Đang tải danh sách link…' : once.error ? esc('Không tải được: ' + once.error) : 'Chưa có link nào — đặt tên người nhận rồi bấm Tạo link.'}</li>${hist}`;
        return;
    }
    list.innerHTML = once.links.map(linkRow).join('') + hist;
    fillQrs();
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
    // Ô thẻ: phẩy / chấm phẩy / Enter = chốt một tên · dán cả danh sách = tách hết · Backspace khi trống = bỏ tên cuối.
    // Danh sách nhóm → số suất tự bằng số thành viên (vẫn chỉnh tay được).
    section.querySelectorAll('#sa-once [data-tags]').forEach(tbox => {
        const kind = tbox.dataset.tags;
        const inp = tbox.querySelector('.sa-tag-in');
        tbox.addEventListener('click', (e) => { if (e.target === tbox) inp.focus(); });
        inp.addEventListener('keydown', (e) => {
            if (e.key === ',' || e.key === ';' || (e.key === 'Enter' && inp.value.trim())) {
                e.preventDefault();
                addTags(kind, inp.value); inp.value = '';
            } else if (e.key === 'Enter') {
                e.preventDefault(); section.querySelector('#sa-once-create').click();
            } else if (e.key === 'Backspace' && !inp.value && tags[kind].length) {
                tags[kind].pop(); renderTags(kind);
            }
        });
        // Bàn phím điện thoại không phải lúc nào cũng báo phím ',' → bắt cả lúc chữ đã vào ô
        inp.addEventListener('input', () => {
            const parts = inp.value.split(/[,;\n]/);
            if (parts.length > 1) { inp.value = parts.pop(); addTags(kind, parts.join('\n')); }
            else renderPreview();
        });
        inp.addEventListener('paste', (e) => {
            const text = e.clipboardData?.getData('text') || '';
            if (!/[,;\n]/.test(text)) return;
            e.preventDefault();
            addTags(kind, inp.value + text); inp.value = '';
        });
        inp.addEventListener('blur', () => { if (inp.value.trim()) { addTags(kind, inp.value); inp.value = ''; } });
    });
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
        if (d.tabGo) { section.querySelector(`.sa-tabs [data-tab="${d.tabGo}"]`)?.click(); return; }
        if (d.resview) { d.v === 'quiz' ? resByQuiz.add(d.resview) : resByQuiz.delete(d.resview); return renderOnce(); }
        if (d.onceQr) { qrRows.has(d.onceQr) ? qrRows.delete(d.onceQr) : qrRows.add(d.onceQr); return renderOnce(); }
        if (d.qrFull) return showQrFull(d.qrFull);
        if (d.editToggle) { editRows.has(d.editToggle) ? editRows.delete(d.editToggle) : editRows.add(d.editToggle); return renderOnce(); }
        if (d.untag) { tags[d.untag].splice(Number(d.i), 1); return renderTags(d.untag); }
        if (d.onceMode) {
            const g = d.onceMode === 'group';
            if (g === onceGroup) return;
            onceGroup = g;
            onceUses = g ? Math.max(tags.members.length, 10) : 1;
            return renderPreview();
        }
        if (t.id === 'sa-once-create') {
            if (!o) return;
            const sameItem = () => once.key === `${o.kind}:${o.id}`;
            const clearTags = (kind) => {
                tags[kind] = [];
                const inp = box.querySelector(`[data-tags="${kind}"] .sa-tag-in`);
                if (inp) inp.value = '';
                renderTags(kind);
            };
            if (onceGroup) {
                const members = tagsOf('members');
                if (members.length > onceUses
                    && !await showConfirm(`Danh sách có ${members.length} người nhưng link chỉ mở được trên ${onceUses} máy — ${members.length - onceUses} người sẽ không vào được.`,
                        { title: 'Ít suất hơn số thành viên', confirmText: 'Vẫn tạo', cancelText: 'Sửa lại' })) return;
                return run(t, async () => {
                    const name = nameInput.value.replace(/\s+/g, ' ').trim();
                    const r = await onceApi('create', { kind: o.kind, id: o.id, hours: onceHours, name, maxUses: onceUses, group: true, members });
                    if (sameItem()) putLink(r.link);
                    nameInput.value = ''; onceUses = 10; t.disabled = false; clearTags('members');
                    if (await copyText(onceUrl(r.link.token))) showToast(`Đã tạo và sao chép link nhóm${name ? ` ${name}` : ''} — dán vào nhóm chat sẽ hiện lời mời.`, 'success', 5000);
                }, 'Không tạo được link');
            }
            // Một người — nhiều tên = nhiều link riêng (song song), sao chép "Tên: link" từng dòng
            const names = tagsOf('names');
            return run(t, async () => {
                const list = names.length ? names : [''];
                const res = await Promise.allSettled(list.map(name => onceApi('create', { kind: o.kind, id: o.id, hours: onceHours, name, maxUses: onceUses })));
                const made = res.filter(x => x.status === 'fulfilled').map(x => x.value.link);
                const failed = res.find(x => x.status === 'rejected');
                if (!made.length) throw failed.reason;
                if (sameItem()) made.slice().reverse().forEach(putLink);
                onceUses = 1; t.disabled = false; clearTags('names');
                const text = made.length === 1 ? onceUrl(made[0].token) : made.map(l => `${l.name}: ${onceUrl(l.token)}`).join('\n');
                if (await copyText(text)) showToast(made.length === 1
                    ? `Đã tạo và sao chép link${made[0].name ? ` cho ${made[0].name}` : ''} — dán vào Messenger/Zalo sẽ hiện lời mời riêng.`
                    : `Đã tạo ${made.length} link và sao chép cả danh sách (mỗi dòng “Tên: link”).`, 'success', 5000);
                if (failed) showToast(`${list.length - made.length} link chưa tạo được: ${failed.reason.message}`, 'error', 6000);
            }, 'Không tạo được link');
        }
        if (d.members) {
            const v = box.querySelector(`[data-members-input="${d.members}"]`)?.value || '';
            return run(t, async () => {
                putLink((await onceApi('update', { token: d.members, members: membersOf(v) })).link);
                showToast('Đã lưu danh sách thành viên.', 'success');
            }, 'Không lưu được danh sách');
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
    section.querySelector('.sa-tabs').addEventListener('click', (e) => {
        const b = e.target.closest('[data-tab]');
        if (!b) return;
        tab = b.dataset.tab; tabTouched = true;
        try { localStorage.setItem('sa-tab', tab); } catch (err) {}
        applyTab();
    });
    section.addEventListener('focusin', () => { tabTouched = true; });   // đang gõ thì đừng tự nhảy tab
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
