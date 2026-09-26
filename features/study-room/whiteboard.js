// whiteboard.js — BẢNG TRẮNG HỘI CHẨN (bản 2, 2026-09-25). Nạp lười từ study-room-main.js.
// Viết lại hẳn bản cũ (nét vẽ theo pixel màn hình mỗi máy một kiểu, hoàn tác = xoá sạch rồi ghi lại
// cả bảng — xoá luôn nét của người khác). Bản này:
//  · Bảng vô hạn, toạ độ "thế giới" chung: máy nào cũng thấy cùng bố cục · kéo / phóng / Vừa khung.
//  · Khối lưu đồ có chữ (hộp, bo góc, thoi, elip, viên) · mũi tên BÁM KHỐI (thẳng / gấp khúc / cong, có nhãn).
//  · Nút ＋ bốn phía khối đang chọn: bấm = mọc khối mới đã nối sẵn; kéo = nối sang khối khác.
//  · Giấy note ký tên + ♥ đồng ý · chữ tự do · ảnh (dán / kéo thả, qua host ảnh của phòng — khách cũng dùng được).
//  · Mẫu hội chẩn 1 chạm (wb-templates.js) · bút laser · Trình bày (cả phòng đi theo khung nhìn người trình bày).
//  · Hoàn tác / làm lại CHỈ việc của mình · chọn nhiều, căn thẳng hàng tự động, sao chép / dán / nhân bản.
//  · Xuất ảnh PNG · gửi ảnh bảng vào Thảo luận.
// Dữ liệu: study_rooms/{id}/drawings/{objId} — MỖI VẬT MỘT DOC (nhiều người ghi song song không giẫm nhau).
//   ink   {x,y,k,pts:[dx,dy,…],bw,bh,lw,c,hl}   shape {kind,x,y,w,h,txt,f,fs,dash}
//   note  {x,y,w,h,txt,f,fs,bn,votes:{uid:1}}   text  {x,y,w,txt,c,fs}
//   arrow {a:{id,x,y}|{x,y}, b:…, c,lw,hd,rt,dash,txt}   img {x,y,w,h,src}
//   Chung: z (thứ tự chồng), by (uid người tạo).
//   Doc đặc biệt: `_present` (người trình bày: tâm + khổ khung nhìn + con trỏ), `laser_<uid>` (vệt laser).
//   Doc kiểu cũ (stroke / line / rectangle / circle / image) vẫn đọc được, đổi sang kiểu mới lúc vẽ.
import { db } from '../../core/firebase-init.js';
import { doc, collection, onSnapshot, setDoc, writeBatch, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { showToast, showConfirm } from '../../core/utils.js';
import { uploadImage, imageFilesOf, warnIfTemp, safeImgUrl } from './room-media.js';
import { room, refs, myMember } from './room-state.js';

// ---------- Bảng màu (pastel phẳng, đậm dần cho viền) ----------
const FILLS = [
    ['#FFF1B8', '#E2BD3C', 'Vàng bơ'], ['#FFD9E6', '#EE86AE', 'Hồng'], ['#FFE2CC', '#EF9E62', 'Đào'],
    ['#D6F5E8', '#52BE93', 'Bạc hà'], ['#D8ECFF', '#5FA5EC', 'Xanh trời'], ['#E9E0FF', '#9C84E6', 'Oải hương'],
    ['#FFFFFF', '#B9AEC4', 'Trắng'], ['#EFE9E2', '#AE9F8E', 'Kem'],
];
const INKS = [['#4A3B52', 'Mực'], ['#E0528A', 'Hồng đậm'], ['#E5484D', 'Đỏ'], ['#F08A3C', 'Cam'],
    ['#2FB57A', 'Xanh lá'], ['#3D8FE0', 'Xanh dương'], ['#8E6FD8', 'Tím'], ['#8A7A96', 'Xám']];
const HLS = [['#FFE066', 'Vàng'], ['#FFB3CF', 'Hồng'], ['#A8EBC9', 'Bạc hà'], ['#AFD5FF', 'Xanh']];
const TAPES = ['rgba(255,179,207,.75)', 'rgba(168,235,201,.75)', 'rgba(175,213,255,.75)', 'rgba(255,213,138,.75)'];
const INK0 = '#4A3B52', ACC = '#FF8FB8', ACC_D = '#E0528A', LASER = '#FF4D6D';
const FONT = 'Quicksand, "Segoe UI", system-ui, sans-serif';
const FS_STEPS = [12, 14, 16, 18, 22, 26, 32, 40];
const ZMIN = 0.15, ZMAX = 4;
const CLIP = 'zitthenkne-board:';
const PAPERS = [['dots', 'Chấm bi'], ['grid', 'Ô vuông'], ['lines', 'Kẻ dòng'], ['plain', 'Trơn']];
const borderOf = (f) => (FILLS.find(x => x[0].toLowerCase() === String(f || '').toLowerCase()) || [0, '#A49BB0'])[1];

const svg = (inner, fill = 'none') => `<svg viewBox="0 0 24 24" class="wb-svg" aria-hidden="true" fill="${fill}" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">${inner}</svg>`;
const KINDS = {
    rect: ['Hộp — bước xử lý', svg('<rect x="3" y="6" width="18" height="12" rx="1.5"/>'), 'R'],
    round: ['Hộp bo góc', svg('<rect x="3" y="6" width="18" height="12" rx="5"/>'), ''],
    diamond: ['Thoi — câu hỏi rẽ nhánh', svg('<path d="M12 3 21 12 12 21 3 12Z"/>'), 'D'],
    ellipse: ['Elip', svg('<ellipse cx="12" cy="12" rx="9.5" ry="7"/>'), 'O'],
    pill: ['Viên — bắt đầu / kết thúc', svg('<rect x="2" y="7.5" width="20" height="9" rx="4.5"/>'), 'U'],
};
const ROUTES = {
    straight: ['Mũi tên thẳng', svg('<path d="M4 18 20 6"/>')],
    elbow: ['Mũi tên gấp khúc', svg('<path d="M4 18h8V6h8"/>')],
    curve: ['Mũi tên cong', svg('<path d="M4 18C12 18 12 6 20 6"/>')],
};
const HEADS = {
    end: ['Một đầu mũi tên', svg('<path d="M3 12h16M14 7l5 5-5 5"/>')],
    both: ['Hai đầu mũi tên', svg('<path d="M5 12h14M10 7l-5 5 5 5M14 7l5 5-5 5"/>')],
    none: ['Đường nối không mũi tên', svg('<path d="M3 12h18"/>')],
};
const DASH_ICO = svg('<path d="M3 12h4M10 12h4M17 12h4"/>');

const TOOLS = [
    ['select', 'V', '<i class="fas fa-arrow-pointer"></i>', 'Chọn · kéo · bấm đúp để sửa chữ'],
    ['hand', 'H', '<i class="fas fa-hand"></i>', 'Kéo bảng (hoặc giữ Space, hai ngón tay)'],
    '|',
    ['pen', 'P', '<i class="fas fa-pen"></i>', 'Bút'],
    ['hl', 'B', '<i class="fas fa-highlighter"></i>', 'Bút dạ tô sáng'],
    ['eraser', 'E', '<i class="fas fa-eraser"></i>', 'Tẩy — xoá cả nét / khối chạm vào'],
    ['laser', 'L', '<i class="fas fa-wand-magic-sparkles"></i>', 'Bút laser chỉ trỏ — cả phòng thấy vệt sáng, tự tắt'],
    '|',
    ['shape', 'R', '', 'Khối lưu đồ (R hộp · D thoi · O elip · U viên)'],
    ['arrow', 'A', '<i class="fas fa-arrow-right-long"></i>', 'Mũi tên nối khối'],
    ['text', 'T', '<i class="fas fa-font"></i>', 'Chữ'],
    ['note', 'N', '<i class="fas fa-note-sticky"></i>', 'Giấy note (hoặc bấm đúp chỗ trống)'],
    ['image', 'I', '<i class="fas fa-image"></i>', 'Chèn ảnh — hoặc dán Ctrl+V / kéo thả vào bảng'],
];
const HOVER = window.matchMedia('(hover: hover) and (pointer: fine)');
const TOUCH = window.matchMedia('(pointer: coarse)');
const KEY_TOOL = { v: 'select', h: 'hand', p: 'pen', b: 'hl', e: 'eraser', l: 'laser', a: 'arrow', t: 'text', n: 'note', i: 'image' };
const KEY_KIND = { r: 'rect', d: 'diamond', o: 'ellipse', u: 'pill' };

// ---------- Trạng thái ----------
let root, wrap, cv, ctx, ed, ptrEl, fileIn, roomId, me;
let W = 0, H = 0, dpr = 1;
const mctx = document.createElement('canvas').getContext('2d');   // chỉ để đo chữ
const objs = new Map();
let order = [], dirtyOrder = true;
const view = { x: 0, y: 0, z: 1 };
let tool = 'select', kind = 'rect';
const pref = { pen: INK0, penW: 3, hl: '#FFE066', arrow: '#8A7A96', route: 'elbow', text: INK0, fill: '#FFF1B8', note: '#FFF1B8' };
let sel = new Set();
let drag = null, hover = null, guides = [];
const hidden = new Set();     // vật đang bị tẩy, chưa ghi xong
const busy = new Set();       // vật mình đang kéo: bỏ qua bản từ máy chủ tới khi thả tay
const undoS = [], redoS = [];
const lasers = new Map();     // uid -> {pts, bn, seen}
let myLaser = null;
let present = null, presentSeen = 0, presenting = false, following = true;
let editing = null;
let spaceDown = false;
const pointers = new Map();
let pinch = null, lastTap = null, raf = 0, fitted = false, gotSnap = false, selSig = '', sub = '';
let lastPtr = null;

// ---------- Tiện ích ----------
const $ = (s) => root.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = (v) => Math.round(v * 10) / 10;
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const dref = (id) => doc(db, 'study_rooms', roomId, 'drawings', id);
const myName = () => room.user?.displayName || myMember()?.displayName || 'Khách';
const visible = () => !!root && !root.classList.contains('hidden') && W > 0;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const canLink = (o) => !!o && (o.type === 'shape' || o.type === 'note' || o.type === 'img' || o.type === 'text');
const hasText = (o) => !!o && (o.type === 'shape' || o.type === 'note' || o.type === 'text' || o.type === 'arrow');
const isTyping = (t) => !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
const toWorld = (sx, sy) => ({ x: sx / view.z + view.x, y: sy / view.z + view.y });
const toScreen = (wx, wy) => ({ x: (wx - view.x) * view.z, y: (wy - view.y) * view.z });
const font = (fs, wt = 500) => `${wt} ${fs}px ${FONT}`;
const nextZ = () => { let m = Date.now(); for (const o of objs.values()) if (o.z >= m) m = o.z + 1; return m; };
function hexA(hex, a) {
    const h = String(hex).replace('#', '');
    const n = parseInt(h.length === 3 ? h.replace(/./g, c => c + c) : h.slice(0, 6), 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
}
function hashOf(s) { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); }
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function evPt(e) { const r = cv.getBoundingClientRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top }; }

// ---------- Dữ liệu: chuẩn hoá doc (kể cả kiểu cũ) ----------
function norm(id, d) {
    if (!d || !d.type) return null;
    const z = typeof d.z === 'number' ? d.z : (d.timestamp?.toMillis?.() ?? 0);
    let o;
    switch (d.type) {
        case 'ink': case 'shape': case 'note': case 'text': case 'arrow': case 'img':
            o = { ...d, a: d.a && { ...d.a }, b: d.b && { ...d.b } }; break;
        case 'stroke': {                       // kiểu cũ: path [{x,y}] toạ độ màn hình
            if (d.tool === 'eraser' || !d.path?.length) return null;
            const x = Math.min(...d.path.map(p => p.x)), y = Math.min(...d.path.map(p => p.y));
            o = { type: 'ink', x, y, k: 1, pts: d.path.flatMap(p => [p.x - x, p.y - y]), lw: d.width || 4, c: d.color || INK0, hl: d.tool === 'highlight' ? 1 : 0 };
            break;
        }
        case 'line':
            o = { type: 'arrow', a: { x: d.startX, y: d.startY }, b: { x: d.endX, y: d.endY }, c: d.color || INK0, lw: d.width || 3, hd: 'none', rt: 'straight' }; break;
        case 'rectangle': case 'circle': {
            const b = d.bounds || {};
            const w = d.type === 'circle' ? d.radius * 2 : (b.maxX - b.minX);
            const h = d.type === 'circle' ? d.radius * 2 : (b.maxY - b.minY);
            o = { type: 'shape', kind: d.type === 'circle' ? 'ellipse' : 'rect', x: d.x, y: d.y, w: Math.max(24, w || 80), h: Math.max(24, h || 60), f: '', lc: d.color, dash: !!d.dashed };
            break;
        }
        case 'image': o = { type: 'img', x: d.x, y: d.y, w: d.width, h: d.height, src: d.url }; break;
        default: return null;
    }
    o.id = id; o.z = z;
    if (o.type === 'ink' && (o.bw == null || o.bh == null)) inkBox(o);
    return o;
}
function inkBox(o) {
    let bw = 0, bh = 0;
    for (let i = 0; i < o.pts.length; i += 2) { bw = Math.max(bw, o.pts[i]); bh = Math.max(bh, o.pts[i + 1]); }
    o.bw = bw; o.bh = bh;
}
/** Bỏ cache (khoá bắt đầu bằng _) và id -> dữ liệu ghi Firestore. */
function dataOf(o) {
    const out = {};
    for (const [k, v] of Object.entries(o)) if (k !== 'id' && k[0] !== '_' && v !== undefined) out[k] = v;
    return out;
}
const snapOf = (o) => ({ id: o.id, ...JSON.parse(JSON.stringify(dataOf(o))) });
const pick = (o, keys) => JSON.parse(JSON.stringify(Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]))));
function invalidate(o) { delete o._p; delete o._lab; }
function put(o) { objs.set(o.id, o); dirtyOrder = true; }
function drop(id) { objs.delete(id); sel.delete(id); dirtyOrder = true; }
function sorted() {
    if (dirtyOrder) { order = [...objs.values()].sort((a, b) => (a.z - b.z) || (a.id < b.id ? -1 : 1)); dirtyOrder = false; }
    return order;
}

// ---------- Ghi Firestore (theo lô, tối đa 450 thao tác / lô) ----------
function commit(ops) {
    for (let i = 0; i < ops.length; i += 450) {
        const b = writeBatch(db);
        ops.slice(i, i + 450).forEach(([k, id, data]) => {
            if (k === 'set') b.set(dref(id), data);
            else if (k === 'upd') b.update(dref(id), data);
            else b.delete(dref(id));
        });
        b.commit().catch(err => {
            console.error('[bảng trắng] ghi lỗi:', err);
            showToast('Không lưu được thay đổi trên bảng — kiểm tra mạng rồi thử lại.', 'error');
        });
    }
}
function addObjs(list, { record: rec = true } = {}) {
    list.forEach(o => { o.id = o.id || newId(); o.z = o.z ?? nextZ(); o.by = o.by || me; put(o); });
    list.forEach(o => { if (o.type === 'arrow') pinEnds(o); });
    commit(list.map(o => ['set', o.id, dataOf(o)]));
    if (rec) record({ add: list.map(snapOf) });
    paintEmpty(); schedule();
    return list;
}
function updObjs(changes) {        // [{id, before, after}] — `after` đã áp vào vật trong máy
    if (!changes.length) return;
    commit(changes.map(c => ['upd', c.id, c.after]));
    record({ upd: changes });
}

/** Đầu mũi tên bám khối: lưu kèm toạ độ dự phòng (khối mất đi thì mũi tên vẫn có chỗ đứng). */
function pinEnds(o) {
    if (!o.a?.id && !o.b?.id) return;
    const P = route(o);
    if (o.a.id) Object.assign(o.a, { x: r1(P[0].x), y: r1(P[0].y) });
    if (o.b.id) Object.assign(o.b, { x: r1(P.at(-1).x), y: r1(P.at(-1).y) });
}

// ---------- Hoàn tác / làm lại — chỉ thao tác CỦA MÌNH ----------
function record(op) { undoS.push(op); if (undoS.length > 80) undoS.shift(); redoS.length = 0; paintUndo(); }
function runOp(op, back) {
    const ops = [];
    const add = back ? op.del : op.add, del = back ? op.add : op.del;
    (add || []).forEach(s => { const o = norm(s.id, s); if (!o) return; put(o); ops.push(['set', s.id, dataOf(o)]); });
    (del || []).forEach(s => { if (objs.has(s.id)) { drop(s.id); ops.push(['del', s.id]); } });
    let gone = 0;
    (op.upd || []).forEach(u => {
        const o = objs.get(u.id);
        if (!o) { gone++; return; }         // người khác đã xoá vật này -> bỏ qua
        const f = JSON.parse(JSON.stringify(back ? u.before : u.after));
        Object.assign(o, f); invalidate(o);
        if (o.type === 'ink') inkBox(o);
        ops.push(['upd', u.id, f]);
    });
    if (gone) showToast('Có mục đã bị người khác xoá nên không hoàn tác được.', 'info', 2200);
    commit(ops);
    if (add?.length) {       // vật vừa hiện lại -> chọn luôn (mũi tên kéo theo khối thì thôi)
        const back = add.filter(s => objs.has(s.id)), main = back.filter(s => s.type !== 'arrow');
        sel = new Set((main.length ? main : back).map(s => s.id));
    }
    [...sel].forEach(id => { if (!objs.has(id)) sel.delete(id); });
    paintSelBar(true);
    paintEmpty(); schedule();
}
function undo() { if (editing) endEdit(); const op = undoS.pop(); if (!op) return; runOp(op, true); redoS.push(op); paintUndo(); }
function redo() { if (editing) endEdit(); const op = redoS.pop(); if (!op) return; runOp(op, false); undoS.push(op); paintUndo(); }

// ---------- Nghe Firestore ----------
function onSnap(snap) {
    const ch = typeof snap.docChanges === 'function' ? snap.docChanges() : null;
    if (ch) ch.forEach(c => ingest(c.doc.id, c.type === 'removed' ? null : c.doc.data()));
    else {                                     // bộ giả dev/: không có docChanges -> dựng lại cả bảng
        const seen = new Set();
        snap.forEach(d => { seen.add(d.id); ingest(d.id, d.data()); });
        for (const id of [...objs.keys()]) if (!seen.has(id) && !objs.get(id)._tmp && !busy.has(id)) drop(id);
    }
    gotSnap = true;
    tryFit();
    paintEmpty(); paintSelBar(); schedule();
}
/** Lần đầu có cả dữ liệu lẫn kích thước khung: về khung nhìn cũ của máy này, không có thì vừa khung. */
function tryFit() {
    if (fitted || !gotSnap || !W) return;
    fitted = true;
    if (present && following) return applyPresentView();
    if (!restoreView()) fitAll(false);
}
function ingest(id, d) {
    if (id === '_present') return onPresent(d);
    if (id.startsWith('laser_')) return onLaser(id.slice(6), d);
    if (busy.has(id)) return;
    if (!d) { drop(id); return; }
    const o = norm(id, d);
    if (!o) return;
    const prev = objs.get(id);
    if (prev) {
        if (prev._img && prev.src === o.src) { o._img = prev._img; o._taint = prev._taint; }
        if (prev._p && o.type === 'ink' && prev.pts.length === o.pts.length && prev.pts[0] === o.pts[0] && prev.pts.at(-1) === o.pts.at(-1)) o._p = prev._p;
        if (editing?.id === id) o.txt = prev.txt;   // đang gõ dở: giữ chữ của mình
    }
    objs.set(id, o);
    dirtyOrder = true;         // vật mới thay vật cũ -> mảng thứ tự vẽ phải dựng lại (giữ bản cũ = không thấy người khác dời)
}

// ---------- Hình học ----------
const ctr = (o) => { const b = box(o); return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; };
function textH(o) { const { fs, lines } = textGeom(mctx, o); return Math.max(fs * 1.3, lines.length * fs * 1.3) + 4; }
function box(o) {
    switch (o.type) {
        case 'ink': { const k = o.k || 1, p = (o.lw || 3) / 2; return { x: o.x - p, y: o.y - p, w: o.bw * k + p * 2, h: o.bh * k + p * 2 }; }
        case 'arrow': {
            const P = route(o);
            const xs = P.map(p => p.x), ys = P.map(p => p.y);
            const x = Math.min(...xs), y = Math.min(...ys);
            return { x, y, w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y) };
        }
        case 'text': return { x: o.x, y: o.y, w: o.w, h: textH(o) };
        default: return { x: o.x, y: o.y, w: o.w, h: o.h };
    }
}
const endObj = (e) => { const o = e?.id ? objs.get(e.id) : null; return o && canLink(o) ? o : null; };
function edgePt(o, p) {
    const b = box(o), c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const dx = p.x - c.x, dy = p.y - c.y, hw = b.w / 2, hh = b.h / 2;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return c;
    let t;
    if (o.kind === 'ellipse') t = 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2);
    else if (o.kind === 'diamond') t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
    else t = Math.min(Math.abs(dx) > 1e-6 ? hw / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? hh / Math.abs(dy) : Infinity);
    const len = Math.hypot(dx, dy);
    return { x: c.x + dx * t + dx / len * 4, y: c.y + dy * t + dy / len * 4 };
}
function sidePt(o, s) {
    const b = box(o), g = 4;
    if (s === 'r') return { x: b.x + b.w + g, y: b.y + b.h / 2 };
    if (s === 'l') return { x: b.x - g, y: b.y + b.h / 2 };
    if (s === 'b') return { x: b.x + b.w / 2, y: b.y + b.h + g };
    return { x: b.x + b.w / 2, y: b.y - g };
}
/** Các điểm của đường nối: thẳng = [a, b]; gấp khúc / cong = [a, c1, c2, b]. */
function route(o) {
    const A = endObj(o.a), B = endObj(o.b);
    const ca = A ? ctr(A) : { x: o.a.x ?? 0, y: o.a.y ?? 0 }, cb = B ? ctr(B) : { x: o.b.x ?? 0, y: o.b.y ?? 0 };
    const rt = (A || B) ? (o.rt || 'straight') : 'straight';
    if (rt === 'straight') return [A ? edgePt(A, cb) : ca, B ? edgePt(B, ca) : cb];
    // Đi ngang hay dọc: theo KHE HỞ giữa hai khối (không theo tâm) — khối lệch chéo nhưng xếp tầng
    // trên dưới thì nối dọc, ra cây gọn thay vì chữ S dựng đứng.
    const ba = A ? box(A) : { x: ca.x, y: ca.y, w: 0, h: 0 }, bb = B ? box(B) : { x: cb.x, y: cb.y, w: 0, h: 0 };
    const gx = Math.max(ba.x, bb.x) - Math.min(ba.x + ba.w, bb.x + bb.w), gy = Math.max(ba.y, bb.y) - Math.min(ba.y + ba.h, bb.y + bb.h);
    const horiz = gx > gy;
    const sa = A ? sidePt(A, horiz ? (cb.x >= ca.x ? 'r' : 'l') : (cb.y >= ca.y ? 'b' : 't')) : ca;
    const sb = B ? sidePt(B, horiz ? (cb.x >= ca.x ? 'l' : 'r') : (cb.y >= ca.y ? 't' : 'b')) : cb;
    if (horiz) { const m = (sa.x + sb.x) / 2; return [sa, { x: m, y: sa.y }, { x: m, y: sb.y }, sb]; }
    const m = (sa.y + sb.y) / 2;
    return [sa, { x: sa.x, y: m }, { x: sb.x, y: m }, sb];
}
function labelPos(o) {
    const P = route(o);
    if (P.length === 2) return { x: (P[0].x + P[1].x) / 2, y: (P[0].y + P[1].y) / 2 };
    if (o.rt === 'curve') return { x: (P[0].x + 3 * P[1].x + 3 * P[2].x + P[3].x) / 8, y: (P[0].y + 3 * P[1].y + 3 * P[2].y + P[3].y) / 8 };
    return { x: (P[1].x + P[2].x) / 2, y: (P[1].y + P[2].y) / 2 };
}
function segDist(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy;
    const t = l ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l, 0, 1) : 0;
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function routeDist(o, p) {
    let P = route(o);
    if (P.length === 4 && o.rt === 'curve') {
        const Q = [];
        for (let i = 0; i <= 16; i++) {
            const t = i / 16, u = 1 - t;
            Q.push({ x: u * u * u * P[0].x + 3 * u * u * t * P[1].x + 3 * u * t * t * P[2].x + t * t * t * P[3].x, y: u * u * u * P[0].y + 3 * u * u * t * P[1].y + 3 * u * t * t * P[2].y + t * t * t * P[3].y });
        }
        P = Q;
    }
    let d = Infinity;
    for (let i = 0; i < P.length - 1; i++) d = Math.min(d, segDist(p, P[i], P[i + 1]));
    return d;
}
function hitObj(o, p, tol) {
    const b = box(o);
    if (p.x < b.x - tol || p.x > b.x + b.w + tol || p.y < b.y - tol || p.y > b.y + b.h + tol) {
        if (o.type !== 'arrow' || !o.txt) return false;
    }
    if (o.type === 'ink') {
        const k = o.k || 1, q = { x: (p.x - o.x) / k, y: (p.y - o.y) / k }, lim = ((o.lw || 3) / 2 + tol) / k, a = o.pts;
        if (a.length < 4) return Math.hypot(q.x - a[0], q.y - a[1]) < lim;
        for (let i = 0; i < a.length - 2; i += 2) if (segDist(q, { x: a[i], y: a[i + 1] }, { x: a[i + 2], y: a[i + 3] }) < lim) return true;
        return false;
    }
    if (o.type === 'arrow') {
        if (o.txt) { const m = labelPos(o); if (Math.abs(p.x - m.x) < 50 && Math.abs(p.y - m.y) < 14) return true; }
        return routeDist(o, p) < tol + (o.lw || 2);
    }
    return true;
}
function topAt(p, filter) {
    const arr = sorted(), tol = 6 / view.z;
    for (let i = arr.length - 1; i >= 0; i--) {
        const o = arr[i];
        if (hidden.has(o.id) || o._tmp || (filter && !filter(o))) continue;
        if (hitObj(o, p, tol)) return o;
    }
    return null;
}
const selObjs = () => [...sel].map(id => objs.get(id)).filter(Boolean);
function unionBox(list) {
    if (!list.length) return null;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    list.forEach(o => { const b = box(o); x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h); });
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

// ---------- Chữ: ngắt dòng + tự thu cỡ cho vừa khối ----------
function layout(c, txt, fs, maxW, wt) {
    c.font = font(fs, wt);
    const out = [], fits = (s) => c.measureText(s).width <= maxW;
    for (const para of String(txt || '').split('\n')) {
        let cur = '';
        for (let word of para.split(' ')) {
            while (word.length > 1 && !fits(word)) {        // từ dài hơn cả khung: bẻ theo ký tự
                if (cur) { out.push(cur); cur = ''; }
                let i = 1;
                while (i < word.length && fits(word.slice(0, i + 1))) i++;
                out.push(word.slice(0, i)); word = word.slice(i);
            }
            const t = cur ? cur + ' ' + word : word;
            if (cur && !fits(t)) { out.push(cur); cur = word; } else cur = t;
        }
        out.push(cur);
    }
    return out;
}
function fitLabel(c, o, ib, base, wt) {
    const key = `${o.txt}|${ib.w | 0}|${ib.h | 0}|${base}|${wt}`;
    if (o._lab?.key === key) return o._lab;
    let fs = base, lines;
    for (;;) {
        lines = layout(c, o.txt, fs, Math.max(8, ib.w), wt);
        if (lines.length * fs * 1.3 <= ib.h || fs <= 10) break;
        fs -= 1;
    }
    return (o._lab = { key, fs, lines });
}
const baseFs = (o) => o.fs || (o.type === 'text' ? 18 : o.type === 'arrow' ? 14 : 16);
/** Bố cục chữ của khối / note / chữ ĐÚNG như lúc vẽ — dùng chung cho vẽ, ô gõ và đặt con trỏ theo điểm bấm. */
function textGeom(c, o) {
    let ib, align = 'left', wt = 500;
    if (o.type === 'shape') { ib = innerBox(o); align = 'center'; wt = 600; }
    else if (o.type === 'note') ib = noteBox(o);
    else ib = { x: o.x, y: o.y + 2, w: o.w, h: 1e6 };
    const { fs, lines } = fitLabel(c, o, ib, baseFs(o), wt);
    const lh = fs * 1.3;
    return { ib, align, wt, fs, lines, lh, top: align === 'center' ? ib.y + ib.h / 2 - lines.length * lh / 2 : ib.y };
}
function drawLabel(c, o, color) {
    const { ib, align, wt, fs, lines, lh, top } = textGeom(c, o);
    c.font = font(fs, wt); c.fillStyle = color; c.textBaseline = 'middle';
    c.textAlign = align === 'center' ? 'center' : 'left';
    const x = align === 'center' ? ib.x + ib.w / 2 : ib.x;
    let y = top + lh / 2;
    // Dòng đầu viết HOA toàn bộ (tiêu đề note trong mẫu) -> đậm + hồng
    lines.forEach((ln, i) => {
        const head = i === 0 && o.type === 'note' && ln.length > 2 && ln === ln.toUpperCase() && /[A-ZÀ-Ỹ]/.test(ln);
        if (head) { c.font = font(fs, 700); c.fillStyle = ACC_D; }
        c.fillText(ln, x, y);
        if (head) { c.font = font(fs, wt); c.fillStyle = color; }
        y += lh;
    });
}
function innerBox(o) {
    const k = o.kind === 'diamond' ? 0.6 : o.kind === 'ellipse' ? 0.74 : o.kind === 'pill' ? 0.86 : 1;
    const w = Math.max(10, o.w * k - 16), h = Math.max(10, o.h * k - 12);
    return { x: o.x + (o.w - w) / 2, y: o.y + (o.h - h) / 2, w, h };
}
const noteBox = (o) => ({ x: o.x + 14, y: o.y + 16, w: o.w - 28, h: o.h - 40 });

// ---------- Vẽ từng vật ----------
function shapePath(c, o) {
    const { x, y, w, h } = o;
    c.beginPath();
    if (o.kind === 'diamond') { c.moveTo(x + w / 2, y); c.lineTo(x + w, y + h / 2); c.lineTo(x + w / 2, y + h); c.lineTo(x, y + h / 2); c.closePath(); }
    else if (o.kind === 'ellipse') c.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    else if (o.kind === 'pill') c.roundRect(x, y, w, h, Math.min(w, h) / 2);
    else if (o.kind === 'round') c.roundRect(x, y, w, h, Math.min(22, h / 2.4, w / 2.4));
    else c.roundRect(x, y, w, h, 7);
}
function hintText(c, o, t, x, y, align) {
    c.save(); c.font = font(Math.min(15, baseFs(o)), 500); c.fillStyle = hexA(INK0, 0.32);
    c.textAlign = align; c.textBaseline = 'middle'; c.fillText(t, x, y); c.restore();
}
function drawShape(c, o, noText, forExport) {
    const line = o.lc || borderOf(o.f);
    c.save();
    shapePath(c, o);
    if (o.f) {
        c.shadowColor = hexA(line, 0.3); c.shadowBlur = 14; c.shadowOffsetY = 4;
        c.fillStyle = o.f; c.fill();
        c.shadowColor = 'transparent';
    }
    c.lineWidth = 2; c.strokeStyle = line; c.lineJoin = 'round';
    if (o.dash) c.setLineDash([7, 6]);
    c.stroke();
    c.setLineDash([]);
    if (!noText && o.txt) drawLabel(c, o, INK0);
    else if (!noText && !forExport && o.w * view.z > 70) hintText(c, o, 'Nhập chữ…', o.x + o.w / 2, o.y + o.h / 2, 'center');
    c.restore();
}
const tiltOf = (o) => ((hashOf(o.id) % 7) - 3) * 0.004;
function drawNote(c, o, noText, forExport) {
    const f = o.f || FILLS[0][0], line = borderOf(f), h = hashOf(o.id);
    c.save();
    c.translate(o.x + o.w / 2, o.y + o.h / 2); c.rotate(tiltOf(o)); c.translate(-o.x - o.w / 2, -o.y - o.h / 2);
    c.shadowColor = hexA(line, 0.38); c.shadowBlur = 18; c.shadowOffsetY = 7;
    c.fillStyle = f; c.beginPath(); c.roundRect(o.x, o.y, o.w, o.h, [3, 3, 16, 3]); c.fill();
    c.shadowColor = 'transparent';
    // băng keo washi giữa mép trên
    c.save(); c.translate(o.x + o.w / 2, o.y); c.rotate(((h % 5) - 2) * 0.03);
    c.fillStyle = TAPES[h % TAPES.length]; c.fillRect(-32, -9, 64, 18);
    c.fillStyle = 'rgba(255,255,255,.35)'; for (let i = -26; i < 32; i += 12) c.fillRect(i, -9, 5, 18);
    c.restore();
    if (!noText && o.txt) drawLabel(c, o, INK0);
    else if (!noText && !forExport) hintText(c, o, 'Bấm để ghi ý kiến…', o.x + 14, o.y + 16 + baseFs(o) * 0.65, 'left');
    c.font = font(11, 600); c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = hexA(INK0, 0.5);
    if (o.bn) c.fillText('— ' + o.bn, o.x + 14, o.y + o.h - 13, o.w - 80);
    const n = Object.keys(o.votes || {}).length;
    if (n) {
        const t = '♥ ' + n; c.font = font(12, 700);
        const tw = c.measureText(t).width + 14;
        c.fillStyle = '#FFFFFF'; c.beginPath(); c.roundRect(o.x + o.w - tw - 8, o.y + o.h - 24, tw, 19, 10); c.fill();
        c.fillStyle = ACC_D; c.textAlign = 'center'; c.fillText(t, o.x + o.w - 8 - tw / 2, o.y + o.h - 14);
    }
    c.restore();
}
function inkPath(o) {
    if (o._p) return o._p;
    const p = new Path2D(), a = o.pts;
    p.moveTo(a[0], a[1]);
    if (a.length < 4) p.lineTo(a[0] + 0.01, a[1]);
    else {
        for (let i = 2; i < a.length - 2; i += 2) p.quadraticCurveTo(a[i], a[i + 1], (a[i] + a[i + 2]) / 2, (a[i + 1] + a[i + 3]) / 2);
        p.lineTo(a[a.length - 2], a[a.length - 1]);
    }
    return (o._p = p);
}
function drawInk(c, o) {
    c.save();
    c.translate(o.x, o.y); c.scale(o.k || 1, o.k || 1);
    c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = o.c || INK0; c.lineWidth = o.lw || 3;
    if (o.hl) { c.globalAlpha = 0.5; c.globalCompositeOperation = 'multiply'; c.lineCap = 'butt'; }
    c.stroke(inkPath(o));
    c.restore();
}
function head(c, p, ang, s) {
    c.save(); c.translate(p.x, p.y); c.rotate(ang);
    c.beginPath(); c.moveTo(0, 0); c.lineTo(-s, -s * 0.55); c.quadraticCurveTo(-s * 0.72, 0, -s, s * 0.55); c.closePath();
    c.fill(); c.lineWidth = 1.2; c.stroke();
    c.restore();
}
function drawArrow(c, o, noText) {
    const P = route(o).map(p => ({ ...p }));
    const col = o.c || '#8A7A96', lw = o.lw || 2, hs = 8 + lw * 2.2, n = P.length;
    const angEnd = Math.atan2(P[n - 1].y - P[n - 2].y, P[n - 1].x - P[n - 2].x);
    const angStart = Math.atan2(P[0].y - P[1].y, P[0].x - P[1].x);
    const tipE = { ...P[n - 1] }, tipS = { ...P[0] };
    const hd = o.hd || 'end';
    if (hd !== 'none') { P[n - 1].x -= Math.cos(angEnd) * hs * 0.6; P[n - 1].y -= Math.sin(angEnd) * hs * 0.6; }
    if (hd === 'both') { P[0].x -= Math.cos(angStart) * hs * 0.6; P[0].y -= Math.sin(angStart) * hs * 0.6; }
    c.save();
    c.strokeStyle = col; c.fillStyle = col; c.lineWidth = lw; c.lineCap = 'round'; c.lineJoin = 'round';
    if (o.dash) c.setLineDash([lw * 3, lw * 2.6]);
    c.beginPath(); c.moveTo(P[0].x, P[0].y);
    if (n === 2) c.lineTo(P[1].x, P[1].y);
    else if (o.rt === 'curve') c.bezierCurveTo(P[1].x, P[1].y, P[2].x, P[2].y, P[3].x, P[3].y);
    else {
        const r = Math.min(14, Math.hypot(P[1].x - P[0].x, P[1].y - P[0].y), Math.hypot(P[2].x - P[1].x, P[2].y - P[1].y) / 2, Math.hypot(P[3].x - P[2].x, P[3].y - P[2].y));
        c.arcTo(P[1].x, P[1].y, P[2].x, P[2].y, r); c.arcTo(P[2].x, P[2].y, P[3].x, P[3].y, r); c.lineTo(P[3].x, P[3].y);
    }
    c.stroke(); c.setLineDash([]);
    if (hd !== 'none') head(c, tipE, angEnd, hs);
    if (hd === 'both') head(c, tipS, angStart, hs);
    if (o.txt && !noText) {
        const m = labelPos(o), fs = o.fs || 14;
        c.font = font(fs, 600);
        const tw = Math.min(260, c.measureText(o.txt).width) + 16;
        c.fillStyle = '#FFFDF8'; c.strokeStyle = hexA(col, 0.55); c.lineWidth = 1.5;
        c.beginPath(); c.roundRect(m.x - tw / 2, m.y - fs * 0.8, tw, fs * 1.6, fs * 0.8); c.fill(); c.stroke();
        c.fillStyle = col === '#8A7A96' ? INK0 : col; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(o.txt, m.x, m.y + 0.5, 260);
    }
    c.restore();
}
function loadImg(o) {
    if (o._img || !o.src) return;
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = schedule;
    // Host không có CORS -> nạp lại không crossOrigin (vẫn xem được, chỉ không xuất PNG được ảnh đó)
    im.onerror = () => {
        if (!o._taint) { o._taint = 1; const j = new Image(); j.onload = schedule; j.onerror = () => { o._bad = 1; schedule(); }; j.src = o.src; o._img = j; }
    };
    im.src = o.src;
    o._img = im;
}
function drawImg(c, o, forExport) {
    c.save();
    c.shadowColor = 'rgba(170,120,150,.35)'; c.shadowBlur = 16; c.shadowOffsetY = 5;
    c.fillStyle = '#FFFFFF'; c.beginPath(); c.roundRect(o.x - 6, o.y - 6, o.w + 12, o.h + 12, 12); c.fill();
    c.shadowColor = 'transparent';
    loadImg(o);
    const im = o._img;
    if (im && im.complete && im.naturalWidth && !(forExport && o._taint)) {
        c.save(); c.beginPath(); c.roundRect(o.x, o.y, o.w, o.h, 8); c.clip();
        c.drawImage(im, o.x, o.y, o.w, o.h); c.restore();
    } else {
        c.fillStyle = '#FDF3F7'; c.beginPath(); c.roundRect(o.x, o.y, o.w, o.h, 8); c.fill();
        c.strokeStyle = '#F4B6CC'; c.setLineDash([6, 5]); c.lineWidth = 1.5; c.stroke(); c.setLineDash([]);
        c.fillStyle = '#C08AA2'; c.font = font(13, 600); c.textAlign = 'center'; c.textBaseline = 'middle';
        const t = o._tmp ? `Đang tải ảnh… ${Math.round((o._prog || 0) * 100)}%` : o._bad ? 'Không mở được ảnh' : forExport ? '(ảnh từ host ngoài)' : 'Đang tải ảnh…';
        c.fillText(t, o.x + o.w / 2, o.y + o.h / 2, o.w - 12);
    }
    c.restore();
}
function drawObj(c, o, noText = false, forExport = false) {
    if (o.type === 'ink') drawInk(c, o);
    else if (o.type === 'shape') drawShape(c, o, noText, forExport);
    else if (o.type === 'note') drawNote(c, o, noText, forExport);
    else if (o.type === 'text') { if (!noText && o.txt) { c.save(); drawLabel(c, o, o.c || INK0); c.restore(); } }
    else if (o.type === 'arrow') drawArrow(c, o, noText);
    else if (o.type === 'img') drawImg(c, o, forExport);
}

// ---------- Laser ----------
function drawLaserPath(c, pts, alpha) {
    if (pts.length < 2 || alpha <= 0) return;
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.shadowColor = LASER; c.shadowBlur = 14 / view.z;
    c.strokeStyle = hexA(LASER, alpha); c.lineWidth = 5 / view.z;
    c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    c.stroke();
    c.shadowBlur = 0; c.strokeStyle = hexA('#FFFFFF', alpha * 0.9); c.lineWidth = 1.8 / view.z; c.stroke();
    c.restore();
}
function drawLasers(c) {
    const now = performance.now();
    let alive = false;
    if (myLaser) {
        myLaser.pts = myLaser.pts.filter(p => now - p.t < 900);
        if (myLaser.pts.length > 1) { drawLaserPath(c, myLaser.pts, 1); alive = true; }
        else if (myLaser.done) myLaser = null;
        else alive = true;
    }
    for (const [uid, L] of lasers) {
        const age = now - L.seen, a = 1 - clamp((age - 500) / 1100, 0, 1);
        if (a <= 0) { lasers.delete(uid); continue; }
        drawLaserPath(c, L.pts, a); alive = true;
        const tip = L.pts.at(-1);
        if (tip && L.bn) {
            c.save(); c.globalAlpha = a; c.font = font(12 / view.z, 600); c.textBaseline = 'middle';
            const tw = c.measureText(L.bn).width + 12 / view.z;
            c.fillStyle = LASER; c.beginPath(); c.roundRect(tip.x + 8 / view.z, tip.y - 9 / view.z, tw, 18 / view.z, 9 / view.z); c.fill();
            c.fillStyle = '#fff'; c.fillText(L.bn, tip.x + 14 / view.z, tip.y); c.restore();
        }
    }
    return alive;
}
let laserT = 0, laserLast = 0;
function sendLaser(force) {
    if (!myLaser) return;
    const go = () => {
        laserT = 0; laserLast = Date.now();
        const pts = myLaser?.pts.slice(-60) || [];
        setDoc(dref('laser_' + me), { type: 'laser', pts: pts.map(p => ({ x: r1(p.x), y: r1(p.y) })), bn: myName(), at: Date.now() }).catch(() => {});
    };
    if (force) { clearTimeout(laserT); return go(); }
    if (!laserT) laserT = setTimeout(go, Math.max(0, 180 - (Date.now() - laserLast)));
}
function onLaser(uid, d) {
    if (uid === me) return;
    if (!d || !d.pts?.length) { lasers.delete(uid); return; }
    lasers.set(uid, { pts: d.pts, bn: d.bn || '', seen: performance.now() });
    schedule();
}

// ---------- Trình bày: cả phòng đi theo khung nhìn ----------
let presT = 0, presLast = 0;
function sendPresent(force) {
    if (!presenting) return;
    const go = () => {
        presT = 0; presLast = Date.now();
        const c = toWorld(W / 2, H / 2);
        setDoc(dref('_present'), {
            type: 'present', on: 1, by: me, bn: myName(), cx: r1(c.x), cy: r1(c.y), vw: r1(W / view.z), vh: r1(H / view.z),
            px: lastPtr ? r1(lastPtr.x) : null, py: lastPtr ? r1(lastPtr.y) : null, at: Date.now(),
        }).catch(() => {});
    };
    if (force) { clearTimeout(presT); return go(); }
    if (!presT) presT = setTimeout(go, Math.max(0, 200 - (Date.now() - presLast)));
}
function togglePresent() {
    presenting = !presenting;
    if (presenting) {
        following = false; present = null;
        sendPresent(true);
        addDoc(refs.messages(), { type: 'chat', text: '📽 Mình đang trình bày trên Bảng trắng — mở tab Bảng trắng để xem theo.', uid: me, displayName: myName(), createdAt: serverTimestamp() }).catch(() => {});
        showToast('Đang trình bày: mọi người mở Bảng trắng sẽ xem theo khung nhìn và con trỏ của bạn.', 'success', 3200);
    } else {
        setDoc(dref('_present'), { type: 'present', on: 0, by: me, at: Date.now() }).catch(() => {});
    }
    paintFollow();
}
function onPresent(d) {
    const live = d && d.on && d.by !== me ? d : null;
    if (live && presenting) { presenting = false; showToast(`${live.bn || 'Một bạn'} vừa bắt đầu trình bày — bạn chuyển sang xem theo.`, 'info', 3000); following = true; }
    if (live && !present) following = true;           // phiên trình bày mới -> mặc định xem theo
    present = live; presentSeen = performance.now();
    if (present && following) applyPresentView();
    paintFollow(); schedule();
}
function applyPresentView() {
    if (!present || !W) return;
    const z = clamp(Math.min(W / present.vw, H / present.vh), ZMIN, ZMAX);
    view.z = z; view.x = present.cx - W / 2 / z; view.y = present.cy - H / 2 / z;
    viewChanged(false);
}
function userMovedView() { if (present && following) { following = false; paintFollow(); } }

// ---------- Khung nhìn ----------
const VIEW_KEY = () => 'wbView_' + roomId;
let saveViewT = 0;
function viewChanged(byUser = true) {
    let s = 24 * view.z;
    while (s < 12) s *= 2;
    while (s > 48) s /= 2;
    const ox = ((-view.x * view.z) % s + s) % s, oy = ((-view.y * view.z) % s + s) % s;
    wrap.style.setProperty('--wb-s', s + 'px');
    wrap.style.setProperty('--wb-ox', ox + 'px');
    wrap.style.setProperty('--wb-oy', oy + 'px');
    const pct = $('.wb-zpct'); if (pct) pct.textContent = Math.round(view.z * 100) + '%';
    if (byUser) { userMovedView(); sendPresent(); }
    clearTimeout(saveViewT);
    saveViewT = setTimeout(() => { try { localStorage.setItem(VIEW_KEY(), JSON.stringify(view)); } catch (e) {} }, 500);
    schedule();
}
function restoreView() {
    try {
        const v = JSON.parse(localStorage.getItem(VIEW_KEY()) || 'null');
        if (v && isFinite(v.x) && isFinite(v.y) && v.z > 0) { Object.assign(view, v); viewChanged(false); return true; }
    } catch (e) {}
    return false;
}
function zoomAt(sx, sy, f) {
    const p = toWorld(sx, sy);
    view.z = clamp(view.z * f, ZMIN, ZMAX);
    view.x = p.x - sx / view.z; view.y = p.y - sy / view.z;
    viewChanged();
}
let tween = 0;
function animateTo(t, byUser = true) {
    cancelAnimationFrame(tween);
    const s = { ...view }, t0 = performance.now(), dur = 320;
    const step = (now) => {
        const k = clamp((now - t0) / dur, 0, 1), e = 1 - (1 - k) ** 3;
        view.x = s.x + (t.x - s.x) * e; view.y = s.y + (t.y - s.y) * e; view.z = s.z + (t.z - s.z) * e;
        viewChanged(byUser && k === 1);
        if (k < 1) tween = requestAnimationFrame(step);
    };
    tween = requestAnimationFrame(step);
}
function fitBox(b, anim = true, maxZ = 1) {
    if (!W || !H) return;
    if (!b) { const t = { z: 1, x: -W / 2, y: -H / 2 }; anim ? animateTo(t) : (Object.assign(view, t), viewChanged(false)); return; }
    const phone = W < 640, padX = phone ? 24 : 110, padY = phone ? 90 : 70;
    const z = clamp(Math.min((W - padX * 2) / Math.max(b.w, 1), (H - padY * 2) / Math.max(b.h, 1)), ZMIN, maxZ);
    const t = { z, x: b.x + b.w / 2 - W / 2 / z, y: b.y + b.h / 2 - H / 2 / z };
    if (anim) animateTo(t); else { Object.assign(view, t); viewChanged(false); }
}
const fitAll = (anim = true) => fitBox(unionBox(sorted().filter(o => !o._tmp)), anim);

// ---------- Vòng vẽ ----------
function schedule() { if (!raf) raf = requestAnimationFrame(draw); }
function draw() {
    raf = 0;
    if (!W || !H) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const s = dpr * view.z;
    ctx.setTransform(s, 0, 0, s, -view.x * s, -view.y * s);
    const m = 80 / view.z, vb = { x: view.x - m, y: view.y - m, w: W / view.z + m * 2, h: H / view.z + m * 2 };
    for (const o of sorted()) {
        if (hidden.has(o.id) || (o.type === 'arrow' && (hidden.has(o.a?.id) || hidden.has(o.b?.id)))) continue;
        if (!overlap(vb, box(o))) continue;                 // ngoài khung nhìn -> bỏ qua
        drawObj(ctx, o, editing?.id === o.id);
    }
    if (drag?.ghost) { ctx.save(); ctx.globalAlpha = drag.ghost.type === 'ink' ? 1 : 0.75; drawObj(ctx, drag.ghost); ctx.restore(); }
    const alive = drawLasers(ctx);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawOverlay(ctx);
    placeEditor(); placeSelBar(); placePtr();
    if (alive) schedule();
}
function screenBox(o, pad = 5) {
    const b = box(o), p = toScreen(b.x, b.y);
    return { x: p.x - pad, y: p.y - pad, w: b.w * view.z + pad * 2, h: b.h * view.z + pad * 2 };
}
function outline(c, o, col, lw) {
    c.save(); c.strokeStyle = col; c.lineWidth = lw;
    if (o.type === 'arrow') {
        const P = route(o).map(p => toScreen(p.x, p.y));
        c.globalAlpha = 0.35; c.lineWidth = (o.lw || 2) * view.z + 8; c.lineCap = 'round'; c.lineJoin = 'round';
        c.beginPath(); c.moveTo(P[0].x, P[0].y); P.slice(1).forEach(p => c.lineTo(p.x, p.y)); c.stroke();
    } else {
        const b = screenBox(o);
        c.beginPath(); c.roundRect(b.x, b.y, b.w, b.h, 8); c.stroke();
    }
    c.restore();
}
/** Tay nắm của vật đang chọn (toạ độ màn hình). Màn cảm ứng: to hơn, xa hơn cho vừa ngón tay. */
function handlesOf(o) {
    const out = [];
    if (o.type === 'arrow') {
        const P = route(o), a = toScreen(P[0].x, P[0].y), b = toScreen(P.at(-1).x, P.at(-1).y);
        out.push({ k: 'end', which: 'a', x: a.x, y: a.y }, { k: 'end', which: 'b', x: b.x, y: b.y });
        return out;
    }
    const b = screenBox(o, 5);
    // ⠿ tay nắm DỜI giữa mép trên — kéo được cả lúc đang gõ (ô chữ phủ kín giữa khối)
    out.push({ k: 'grip', x: b.x + b.w / 2, y: b.y });
    [['nw', b.x, b.y], ['ne', b.x + b.w, b.y], ['sw', b.x, b.y + b.h], ['se', b.x + b.w, b.y + b.h]]
        .forEach(([c, x, y]) => out.push({ k: 'corner', c, x, y }));
    // Nút ＋ chỉ hiện ở phía còn trống: rơi lên khối bên cạnh thì bỏ (không thì chạm vào khối đó lại mọc khối mới),
    // khối quá nhỏ trên màn (phóng xa) cũng bỏ cho đỡ rối.
    if (canLink(o) && tool === 'select' && !editing && b.w > 44 && b.h > 26) {
        const g = TOUCH.matches ? 34 : 26, pad = (TOUCH.matches ? 14 : 10) / view.z;
        [['r', b.x + b.w + g, b.y + b.h / 2], ['l', b.x - g, b.y + b.h / 2], ['b', b.x + b.w / 2, b.y + b.h + g], ['t', b.x + b.w / 2, b.y - g]]
            .forEach(([dir, x, y]) => {
                const wp = toWorld(x, y), hitBox = { x: wp.x - pad, y: wp.y - pad, w: pad * 2, h: pad * 2 };
                if (sorted().some(x2 => x2.id !== o.id && x2.type !== 'arrow' && x2.type !== 'ink' && !x2._tmp && overlap(hitBox, box(x2)))) return;
                out.push({ k: 'plus', dir, x, y });
            });
    }
    return out;
}
/** Bán kính BẤM TRÚNG của tay nắm (rộng hơn hình vẽ; ngón tay rộng hơn nữa). */
const HIT = { corner: [10, 20], end: [11, 20], plus: [13, 22], grip: [14, 22] };
function handleAt(sx, sy) {
    const S = selObjs();
    if (S.length !== 1 || drag) return null;
    const k = TOUCH.matches ? 1 : 0;
    return handlesOf(S[0])
        .map(h => ({ h, d: Math.hypot(h.x - sx, h.y - sy) }))
        .filter(({ h, d }) => d <= HIT[h.k][k])
        .sort((a, b) => a.d - b.d)[0]?.h || null;       // hai tay nắm chồng nhau (khối nhỏ) -> lấy cái gần nhất
}
function drawHandles(c, o) {
    const big = TOUCH.matches;
    handlesOf(o).forEach(h => {
        c.save();
        if (h.k === 'plus') {
            const r = big ? 13 : 10, a = big ? 5.5 : 4.5;
            c.fillStyle = '#FFFFFF'; c.strokeStyle = hexA(ACC, 0.9); c.lineWidth = 1.5;
            c.shadowColor = hexA(ACC, 0.45); c.shadowBlur = 8;
            c.beginPath(); c.arc(h.x, h.y, r, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0; c.stroke();
            c.strokeStyle = ACC_D; c.lineWidth = 2; c.lineCap = 'round';
            c.beginPath(); c.moveTo(h.x - a, h.y); c.lineTo(h.x + a, h.y); c.moveTo(h.x, h.y - a); c.lineTo(h.x, h.y + a); c.stroke();
        } else if (h.k === 'grip') {
            const w = big ? 42 : 32, hh = big ? 16 : 13;
            c.fillStyle = '#FFFFFF'; c.strokeStyle = ACC; c.lineWidth = 1.5;
            c.shadowColor = hexA(ACC, 0.4); c.shadowBlur = 6;
            c.beginPath(); c.roundRect(h.x - w / 2, h.y - hh / 2, w, hh, hh / 2); c.fill(); c.shadowBlur = 0; c.stroke();
            c.fillStyle = ACC_D;
            for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j += 2) { c.beginPath(); c.arc(h.x + i * (big ? 6 : 5), h.y + j * 2.2, 1.3, 0, Math.PI * 2); c.fill(); }
        } else {
            const bound = h.k === 'end' && o[h.which]?.id;
            const r = h.k === 'end' ? (big ? 8 : 6.5) : (big ? 7 : 5.5);
            c.fillStyle = bound ? ACC : '#FFFFFF'; c.strokeStyle = ACC_D; c.lineWidth = 1.5;
            c.beginPath(); c.arc(h.x, h.y, r, 0, Math.PI * 2); c.fill(); c.stroke();
        }
        c.restore();
    });
}
function drawOverlay(c) {
    if (hover && !sel.has(hover.id) && !drag && (tool === 'select' || tool === 'eraser')) outline(c, hover, tool === 'eraser' ? hexA('#E5484D', 0.6) : hexA(ACC, 0.5), 1.5);
    if (drag?.target) { c.save(); c.shadowColor = ACC; c.shadowBlur = 12; outline(c, drag.target, ACC_D, 2.5); c.restore(); }
    const S = selObjs();
    S.forEach(o => outline(c, o, ACC, 1.5));
    if (S.length > 1) {
        const u = unionBox(S), p = toScreen(u.x, u.y);
        c.save(); c.setLineDash([5, 4]); c.strokeStyle = hexA(ACC_D, 0.7); c.lineWidth = 1;
        c.strokeRect(p.x - 9, p.y - 9, u.w * view.z + 18, u.h * view.z + 18); c.restore();
    }
    if (S.length === 1 && (!drag || drag.k === 'plus')) drawHandles(c, S[0]);
    // nhấn giữ trên điện thoại vừa "nhấc" khối lên: viền sáng báo hiệu kéo được rồi
    if (drag?.lifted) drag.ids.forEach(id => { const o = objs.get(id); if (o) { c.save(); c.shadowColor = ACC; c.shadowBlur = 16; outline(c, o, ACC_D, 2.5); c.restore(); } });
    if (drag?.k === 'marquee' && drag.moved) {
        const a = toScreen(Math.min(drag.x0, drag.x1), Math.min(drag.y0, drag.y1));
        const w = Math.abs(drag.x1 - drag.x0) * view.z, h = Math.abs(drag.y1 - drag.y0) * view.z;
        c.save(); c.fillStyle = hexA(ACC, 0.08); c.strokeStyle = hexA(ACC_D, 0.7); c.setLineDash([5, 4]); c.lineWidth = 1;
        c.beginPath(); c.roundRect(a.x, a.y, w, h, 6); c.fill(); c.stroke(); c.restore();
    }
    if (guides.length) {
        c.save(); c.strokeStyle = ACC_D; c.lineWidth = 1; c.setLineDash([4, 4]);
        guides.forEach(g => {
            c.beginPath();
            if (g.x != null) { const x = toScreen(g.x, 0).x; c.moveTo(x, 0); c.lineTo(x, H); }
            else { const y = toScreen(0, g.y).y; c.moveTo(0, y); c.lineTo(W, y); }
            c.stroke();
        });
        c.restore();
    }
    if (tool === 'eraser' && lastPtr && !pointers.size) {
        const p = toScreen(lastPtr.x, lastPtr.y);
        c.save(); c.strokeStyle = hexA('#E5484D', 0.6); c.lineWidth = 1.5; c.beginPath(); c.arc(p.x, p.y, 10, 0, Math.PI * 2); c.stroke(); c.restore();
    }
}

// ---------- Sửa chữ tại chỗ ----------
// Bấm MỘT lần vào khối / note / chữ là gõ được ngay, con trỏ đặt đúng chỗ bấm; kéo thì vẫn là dời khối.
// Ô gõ dùng đúng cỡ chữ đang hiện trên bảng (kể cả khi chữ đã tự thu nhỏ) -> vào / ra chế độ gõ không nhảy chữ.
/** Chỉ số ký tự trong chuỗi gốc ứng với điểm bấm p (toạ độ thế giới). */
function caretAt(o, p) {
    const t = o.txt || '';
    if (!t || o.type === 'arrow') return t.length;
    const g = textGeom(mctx, o);
    const starts = [];
    let pos = 0;
    for (const ln of g.lines) {                 // dấu cách / xuống dòng ở chỗ ngắt dòng bị bỏ khi dựng dòng
        const s = ln ? t.indexOf(ln, pos) : pos;
        const st = s < 0 ? pos : s;
        starts.push(st);
        pos = st + ln.length;
        if (t[pos] === ' ' || t[pos] === '\n') pos++;
    }
    const i = clamp(Math.floor((p.y - g.top) / g.lh), 0, g.lines.length - 1);
    const ln = g.lines[i];
    mctx.font = font(g.fs, g.wt);
    const x0 = g.align === 'center' ? g.ib.x + g.ib.w / 2 - mctx.measureText(ln).width / 2 : g.ib.x;
    let k = 0, best = Infinity;
    for (let j = 0; j <= ln.length; j++) {
        const d = Math.abs(mctx.measureText(ln.slice(0, j)).width - (p.x - x0));
        if (d < best) { best = d; k = j; }
    }
    return starts[i] + k;
}
/** caret: số = đặt con trỏ ở đó · 'all' = bôi đen hết · bỏ trống = cuối chữ. */
function startEdit(o, initial, caret) {
    if (!hasText(o)) return;
    if (editing && editing.id !== o.id) endEdit();
    if (!editing) editing = { id: o.id, before: o.txt || '', h0: o.h };
    sel = new Set([o.id]);
    ed.hidden = false;
    ed.dataset.kind = o.type;
    ed.value = initial != null ? initial : (o.txt || '');
    o.txt = ed.value; invalidate(o);
    ed.placeholder = o.type === 'arrow' ? 'Nhãn (vd. Có / Không)' : o.type === 'note' ? 'Ghi ý kiến…' : 'Nhập chữ…';
    placeEditor();
    ed.focus({ preventScroll: true });
    const n = ed.value.length;
    if (caret === 'all') ed.select();
    else { const c = typeof caret === 'number' ? clamp(caret, 0, n) : n; ed.setSelectionRange(c, c); }
    root.classList.add('is-typing'); document.body.classList.add('wb-typing');
    // Điện thoại: chữ trên màn < 13px thì phóng bảng lên cho đọc được (vẫn giữ cả khối trong bề ngang)
    if (TOUCH.matches && baseFs(o) * view.z < 13) {
        const b = box(o), z = clamp(Math.min(15 / baseFs(o), (W - 32) / Math.max(b.w, 1)), view.z, ZMAX);
        if (z > view.z * 1.05) animateTo({ z, x: b.x + b.w / 2 - W / 2 / z, y: b.y + b.h / 2 - H * 0.35 / z }, false);
    }
    paintSelBar(true); schedule();
    setTimeout(keepInView, 400);                 // điện thoại: đợi bàn phím bật lên rồi kéo khối ra chỗ thấy
}
function placeEditor() {
    if (!editing) return;
    const o = objs.get(editing.id);
    if (!o) { editing = null; ed.hidden = true; return; }
    const z = view.z;
    let ib, fs, wt, align, pad = 0;
    if (o.type === 'arrow') {
        const m = labelPos(o);
        fs = baseFs(o); wt = 600; align = 'center';
        ib = { x: m.x - 90, y: m.y - fs * 0.95, w: 180, h: fs * 1.9 };
    } else {
        const g = textGeom(mctx, o);
        ({ fs, wt, align } = g);
        ib = o.type === 'text' ? { ...g.ib, h: Math.max(1, g.lines.length) * g.lh } : g.ib;
        if (align === 'center') pad = Math.max(0, g.top - g.ib.y);
    }
    const p = toScreen(ib.x, ib.y), lh = fs * 1.3 * z, fpx = fs * z;
    // iPhone tự phóng CẢ TRANG khi ô nhập có chữ < 16px -> máy cảm ứng: đặt 16px rồi thu lại bằng transform
    const k = TOUCH.matches && fpx < 16 ? fpx / 16 : 1;
    const rot = o.type === 'note' ? `rotate(${tiltOf(o)}rad)` : '';
    Object.assign(ed.style, {
        left: p.x + 'px', top: p.y + 'px', width: ib.w * z / k + 'px', height: Math.max(ib.h * z, lh + 2) / k + 'px',
        fontSize: fpx / k + 'px', lineHeight: lh / k + 'px', fontWeight: wt, textAlign: align, paddingTop: pad * z / k + 'px',
        transformOrigin: '0 0', transform: [rot, k !== 1 ? `scale(${k})` : ''].filter(Boolean).join(' '),
    });
}
/** Note dài ra theo chữ (không thu chữ nhỏ lại như khối lưu đồ); xoá bớt thì co về cỡ lúc đầu. */
function growNote(o) {
    if (o.type !== 'note' || !editing) return;
    const fs = baseFs(o), n = layout(mctx, o.txt, fs, o.w - 28, 500).length;
    const need = Math.ceil(n * fs * 1.3 + 44);
    const h = Math.max(editing.h0 || 0, need);
    if (h !== o.h) { o.h = h; invalidate(o); }
}
/** Khối đang gõ bị bàn phím điện thoại / mép khung che -> dời bảng cho thấy. */
function keepInView() {
    if (!editing || !W) return;
    const o = objs.get(editing.id);
    if (!o) return;
    const r = wrap.getBoundingClientRect(), vv = window.visualViewport;
    let bottom = vv ? Math.min(r.bottom, vv.offsetTop + vv.height) - r.top : H;
    const bar = $('.wb-selbar');
    if (W < 640 && bar && !bar.hidden) bottom -= bar.offsetHeight + 16;     // thanh thao tác neo đáy
    const b = screenBox(o, 14);
    let dy = 0;
    if (b.y + b.h > bottom) dy = b.y + b.h - bottom;
    if (b.y - dy < 8) dy = b.y - 8;
    if (Math.abs(dy) > 1) { view.y += dy / view.z; viewChanged(false); }
}
let liveT = 0;
function endEdit(save = true) {
    if (!editing) return;
    const { id, before, h0 } = editing;
    editing = null; clearTimeout(liveT);
    ed.hidden = true;
    root.classList.remove('is-typing'); document.body.classList.remove('wb-typing');
    if (document.activeElement === ed) ed.blur();
    const o = objs.get(id);
    if (!o) return schedule();
    const txt = save ? ed.value.replace(/\s+$/, '') : before;
    o.txt = txt;
    if (!save && h0 != null) o.h = h0;
    invalidate(o);
    const grew = o.type === 'note' && h0 != null && o.h !== h0;
    if (o.type === 'text' && !txt.trim()) {          // khung chữ bỏ trống -> gỡ luôn
        drop(id); commit([['del', id]]);
        const last = undoS.at(-1);
        if (last?.add?.length === 1 && last.add[0].id === id) { undoS.pop(); paintUndo(); }
        else record({ del: [{ ...pick(o, Object.keys(dataOf(o))), id, txt: before }] });
    } else if (txt !== before || grew) {
        const after = { txt, ...(grew ? { h: o.h } : {}) }, prev = { txt: before, ...(grew ? { h: h0 } : {}) };
        commit([['upd', id, after]]);
        const last = undoS.at(-1), fresh = last?.add?.find(s => s.id === id);
        if (fresh && !before) Object.assign(fresh, after);      // vừa tạo: gộp vào 1 lần hoàn tác
        else record({ upd: [{ id, before: prev, after }] });
    }
    paintEmpty(); paintSelBar(true); schedule();
}

// ---------- Tạo nhanh: nút ＋ và Tab ----------
function occupied(r) {
    const m = 14;
    return sorted().some(o => o.type !== 'arrow' && o.type !== 'ink' && !o._tmp && overlap({ x: r.x - m, y: r.y - m, w: r.w + m * 2, h: r.h + m * 2 }, box(o)));
}
function nextOf(src) {
    const b = box(src);
    if (src.type === 'note') return { type: 'note', w: src.w, h: src.h, f: src.f, fs: src.fs, bn: myName(), txt: '' };
    if (src.type === 'shape') return { type: 'shape', kind: src.kind === 'diamond' || src.kind === 'pill' ? 'rect' : src.kind, w: src.kind === 'diamond' ? Math.max(170, b.w * 0.9) : b.w, h: src.kind === 'diamond' ? 80 : b.h, f: src.f, fs: src.fs, txt: '' };
    return { type: 'shape', kind: 'round', w: 180, h: 76, f: pref.fill, fs: 16, txt: '' };
}
function spawnAt(src, dir, at) {
    const n = nextOf(src), b = box(src), GAP = 70;
    let x, y;
    if (at) { x = at.x - n.w / 2; y = at.y - n.h / 2; }
    else {
        if (dir === 'r') { x = b.x + b.w + GAP; y = b.y + b.h / 2 - n.h / 2; }
        else if (dir === 'l') { x = b.x - GAP - n.w; y = b.y + b.h / 2 - n.h / 2; }
        else if (dir === 'b') { x = b.x + b.w / 2 - n.w / 2; y = b.y + b.h + GAP; }
        else { x = b.x + b.w / 2 - n.w / 2; y = b.y - GAP - n.h; }
        for (let i = 0; i < 8 && occupied({ x, y, w: n.w, h: n.h }); i++) {    // chỗ đã có khối -> dịch sang bên
            if (dir === 'r' || dir === 'l') y += n.h + 30; else x += n.w + 30;
        }
    }
    Object.assign(n, { id: newId(), x, y });
    // Từ khối THOI: nhánh đầu ghi sẵn "Có", nhánh thứ hai "Không"
    let txt = '';
    if (src.kind === 'diamond') {
        const k = sorted().filter(o => o.type === 'arrow' && o.a?.id === src.id).length;
        txt = k === 0 ? 'Có' : k === 1 ? 'Không' : '';
    }
    const arrow = { type: 'arrow', a: { id: src.id }, b: { id: n.id }, rt: src.type === 'note' ? 'curve' : pref.route, hd: 'end', c: pref.arrow, lw: 2, txt };
    addObjs([n, arrow]);
    sel = new Set([n.id]);
    startEdit(n);
}

// ---------- Công cụ ----------
function setTool(t, k) {
    if (t === 'image') { fileIn.click(); return; }
    if (editing) endEdit();
    tool = t;
    if (k) kind = k;
    if (t !== 'select') { sel.clear(); hover = null; }
    root.querySelectorAll('.wb-tool').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
    const sh = $('.wb-tool[data-tool="shape"]');
    if (sh) sh.innerHTML = KINDS[kind][1] + '<kbd>R</kbd>';
    setCursor(); paintOpts(); paintSelBar(true); schedule();
}
// ---------- Vùng bấm trên một khối ----------
// 'text' = ô chữ ở giữa: bấm là gõ (con trỏ gõ I). 'move' = viền / phần ngoài chữ / băng keo note: kéo là
// dời, bấm chỉ chọn (con trỏ ✥). Kéo từ vùng chữ cũng dời được — chỉ có "bấm mà không kéo" mới vào gõ.
function textZone(o) {
    if (o.type === 'text') return box(o);
    const ib = o.type === 'shape' ? innerBox(o) : noteBox(o), band = 10 / view.z;
    const x1 = Math.max(ib.x, o.x + band), y1 = Math.max(ib.y, o.y + band);
    const x2 = Math.min(ib.x + ib.w, o.x + o.w - band), y2 = Math.min(ib.y + ib.h, o.y + o.h - band);
    return { x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) };
}
function zoneAt(o, p) {
    if (!o || o.type === 'arrow' || !hasText(o)) return 'move';
    const t = textZone(o);
    return p.x >= t.x && p.x <= t.x + t.w && p.y >= t.y && p.y <= t.y + t.h ? 'text' : 'move';
}
function setCursor(sx, sy) {
    let c = 'default';
    if (spaceDown || tool === 'hand') c = drag?.k === 'pan' ? 'grabbing' : 'grab';
    else if (drag?.k === 'move' && drag.moved) c = 'grabbing';
    else if (tool === 'text') c = 'text';
    else if (tool !== 'select') c = 'crosshair';
    else if (sx != null) {
        const h = handleAt(sx, sy);
        if (h?.k === 'corner') c = (h.c === 'nw' || h.c === 'se') ? 'nwse-resize' : 'nesw-resize';
        else if (h?.k === 'grip') c = 'grab';
        else if (h) c = 'pointer';
        else if (hover) c = hover.type === 'arrow' ? 'pointer' : zoneAt(hover, toWorld(sx, sy)) === 'text' ? 'text' : 'move';
    }
    cv.style.cursor = c;
}

// ---------- Con trỏ / cảm ứng ----------
// Máy tính: bấm vùng chữ = gõ · bấm viền = chọn · kéo bất kỳ đâu trên khối = dời · kéo chỗ trống = khoanh vùng chọn.
// Điện thoại: một ngón kéo = CUỘN bảng (kể cả khi đặt lên khối — bảng đầy khối vẫn cuộn được, không lỡ tay dời) ·
//   nhấn giữ khối ~0,4s = nhấc lên (rung nhẹ) rồi kéo đi · chạm lần 1 = chọn, chạm lần 2 = gõ (khối trống: chạm là gõ) ·
//   khối đã chọn thì kéo thẳng được · nhấn giữ chỗ trống = dán giấy note · hai ngón = phóng / cuộn.
function onDown(e) {
    if (e.button === 2) return;
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    const pt = evPt(e);
    pointers.set(e.pointerId, { ...pt, touch: e.pointerType === 'touch' });
    if (pointers.size === 2) { startPinch(); return; }
    if (pointers.size > 2) return;
    closePops();
    const { sx, sy } = pt, w = toWorld(sx, sy);
    if (editing) {
        // Khối đang gõ: tay nắm ⠿, góc co giãn, phần viền vẫn dùng được mà KHÔNG thoát chế độ gõ
        const eo = objs.get(editing.id), h = tool === 'select' ? handleAt(sx, sy) : null;
        const own = eo && eo.type !== 'arrow' && e.button === 0 && !spaceDown && tool === 'select'
            && (h ? (h.k === 'grip' || h.k === 'corner') : topAt(w) === eo);
        if (!own) endEdit();
    }
    if (e.button === 1 || tool === 'hand' || spaceDown) { drag = { k: 'pan', sx, sy, vx: view.x, vy: view.y }; setCursor(); return; }
    if (tool === 'select') return downSelect(e, sx, sy, w);
    if (tool === 'pen' || tool === 'hl') {
        const hl = tool === 'hl';
        drag = { k: 'ink', pts: [w.x, w.y], ghost: { type: 'ink', id: '_g', x: 0, y: 0, k: 1, pts: [w.x, w.y], lw: hl ? 18 : pref.penW, c: hl ? pref.hl : pref.pen, hl: hl ? 1 : 0 } };
    } else if (tool === 'eraser') { drag = { k: 'erase' }; eraseAt(w); }
    else if (tool === 'laser') { myLaser = { pts: [{ ...w, t: performance.now() }] }; drag = { k: 'laser' }; }
    else if (tool === 'shape' || tool === 'note' || tool === 'text') drag = { k: 'create', x0: w.x, y0: w.y, x1: w.x, y1: w.y };
    else if (tool === 'arrow') {
        const t = topAt(w, canLink);
        drag = { k: 'arrow', a: t ? { id: t.id } : { x: w.x, y: w.y } };
        drag.ghost = { type: 'arrow', id: '_g', a: drag.a, b: { x: w.x, y: w.y }, rt: pref.route, hd: 'end', c: pref.arrow, lw: 2 };
    }
    schedule();
}
/** Khung các khối khác gần khung nhìn — mốc cho căn thẳng hàng khi kéo. */
function othersFor(skip) {
    const near = { x: view.x - 400, y: view.y - 400, w: W / view.z + 800, h: H / view.z + 800 };
    return sorted().filter(x => !skip.has(x.id) && x.type !== 'arrow' && x.type !== 'ink' && !x._tmp).map(box).filter(b => overlap(b, near));
}
/** Bắt đầu kéo dời một nhóm vật (chụp vị trí gốc để hoàn tác + mốc căn thẳng hàng). */
function moveDrag(ids, w, sx, sy, extra) {
    const start = new Map(ids.map(id => [id, pick(objs.get(id), ['x', 'y', 'a', 'b'])]));
    ids.forEach(id => busy.add(id));
    return { k: 'move', ids, start, others: othersFor(new Set(ids)), bb: unionBox(ids.map(id => objs.get(id)).filter(Boolean)), w0: w, sx, sy, moved: false, ...extra };
}
/** Điện thoại: nhấn giữ đủ lâu trên khối -> "nhấc" khối lên, kéo tiếp là dời. */
function lift(d) {
    if (drag !== d) return;
    const o = objs.get(d.id);
    if (!o) return;
    sel = new Set([o.id]);
    drag = moveDrag([o.id], d.w0, d.sx, d.sy, { tapId: o.id, lifted: true, thr: 2 });
    navigator.vibrate?.(12);
    paintSelBar(true); schedule();
}
function downSelect(e, sx, sy, w) {
    const touch = e.pointerType === 'touch';
    const h = handleAt(sx, sy);
    const o0 = selObjs()[0];
    const keepEdit = !!editing && editing.id === o0?.id;
    if (h?.k === 'plus') { drag = { k: 'plus', dir: h.dir, from: o0.id, sx, sy }; return; }
    if (h?.k === 'corner') {
        drag = { k: 'resize', id: o0.id, c: h.c, b0: box(o0), before: pick(o0, ['x', 'y', 'w', 'h', 'k']), keepEdit };
        busy.add(o0.id); return;
    }
    if (h?.k === 'end') {
        drag = { k: 'end', id: o0.id, which: h.which, before: pick(o0, ['a', 'b']) };
        busy.add(o0.id); return;
    }
    if (h?.k === 'grip') { drag = moveDrag([o0.id], w, sx, sy, { tapId: o0.id, keepEdit, grip: true, thr: 2 }); return; }
    const o = topAt(w);
    if (o && editing?.id === o.id) { drag = moveDrag([o.id], w, sx, sy, { tapId: o.id, keepEdit: true }); return; }
    const now = performance.now();
    const dbl = lastTap && now - lastTap.t < 380 && Math.hypot(lastTap.sx - sx, lastTap.sy - sy) < (touch ? 24 : 14);
    if (o) {
        const zone = zoneAt(o, w);
        // bấm đúp (lần 2 thả tay mà không kéo) -> gõ; bấm rồi kéo ngay thì vẫn là dời
        const dblHit = !!dbl && lastTap.id === o.id && hasText(o);
        const wasSel = sel.has(o.id), wasOnly = sel.size === 1 && wasSel;
        if (touch && !wasSel && !e.shiftKey) {
            const d = { k: 'pend', id: o.id, sx, sy, vx: view.x, vy: view.y, w0: w };
            d.t = setTimeout(() => lift(d), 400);
            drag = d;
            return;
        }
        if (e.shiftKey) { sel.has(o.id) ? sel.delete(o.id) : sel.add(o.id); }
        else if (!wasSel) sel = new Set([o.id]);
        const onLabel = o.type === 'arrow' && !!o.txt && (() => { const m = labelPos(o); return Math.abs(w.x - m.x) < 50 && Math.abs(w.y - m.y) < 14; })();
        drag = moveDrag([...sel], w, sx, sy, { tapId: o.id, wasOnly, onLabel, zone, dblHit, thr: touch ? 7 : zone === 'text' ? 5 : 3 });
    } else {
        if (touch) {
            if (!e.shiftKey) sel.clear();
            const d = { k: 'pan', sx, sy, vx: view.x, vy: view.y, tap: true };
            d.t = setTimeout(() => {         // nhấn giữ chỗ trống = dán giấy note ngay chỗ đó
                if (drag !== d || !d.tap) return;
                drag = null; navigator.vibrate?.(12);
                createAt('note', w);
            }, 550);
            drag = d;
        } else {
            if (!e.shiftKey) sel.clear();
            drag = { k: 'marquee', x0: w.x, y0: w.y, x1: w.x, y1: w.y, base: new Set(sel), sx, sy, moved: false };
        }
    }
    paintSelBar(true);
    schedule();
}
function onMove(e) {
    const pt = evPt(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { ...pt, touch: e.pointerType === 'touch' });
    if (pinch) return movePinch();
    const { sx, sy } = pt, w = toWorld(sx, sy);
    lastPtr = w;
    if (presenting) sendPresent();
    if (!drag) {
        if (e.pointerType !== 'touch') {
            const h = tool === 'select' || tool === 'eraser' ? topAt(w) : null;
            if (h !== hover) { hover = h; schedule(); }
            if (tool === 'eraser') schedule();
            setCursor(sx, sy);
        }
        return;
    }
    const d = drag;
    switch (d.k) {
        case 'pend':                          // ngón tay trượt trước khi kịp nhấc khối -> là cuộn bảng
            if (Math.hypot(sx - d.sx, sy - d.sy) < 8) return;
            clearTimeout(d.t);
            drag = { k: 'pan', sx: d.sx, sy: d.sy, vx: d.vx, vy: d.vy };
            view.x = d.vx - (sx - d.sx) / view.z; view.y = d.vy - (sy - d.sy) / view.z;
            viewChanged(); break;
        case 'pan':
            view.x = d.vx - (sx - d.sx) / view.z; view.y = d.vy - (sy - d.sy) / view.z;
            if (d.tap && Math.hypot(sx - d.sx, sy - d.sy) > 6) { d.tap = false; clearTimeout(d.t); }
            viewChanged(); break;
        case 'ink': {
            const a = d.pts, lx = a[a.length - 2], ly = a[a.length - 1];
            if (Math.hypot(w.x - lx, w.y - ly) * view.z < 1.5) return;
            a.push(w.x, w.y); d.ghost.pts = a; d.ghost._p = null; break;
        }
        case 'erase': eraseAt(w); break;
        case 'laser': myLaser?.pts.push({ ...w, t: performance.now() }); sendLaser(); break;
        case 'create': {
            d.x1 = w.x; d.y1 = w.y;
            const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1), ww = Math.abs(d.x1 - d.x0), hh = Math.abs(d.y1 - d.y0);
            d.ghost = tool === 'note' ? { type: 'note', id: '_g', x, y, w: ww, h: hh, f: pref.note, txt: '' }
                : tool === 'text' ? { type: 'shape', id: '_g', kind: 'rect', x, y, w: ww, h: hh, f: '', lc: ACC, dash: true }
                : { type: 'shape', id: '_g', kind, x, y, w: ww, h: hh, f: pref.fill, txt: '' };
            break;
        }
        case 'arrow': {
            d.target = topAt(w, o => canLink(o) && o.id !== d.a.id);
            d.ghost.b = d.target ? { id: d.target.id } : { x: w.x, y: w.y };
            break;
        }
        case 'plus':
            if (Math.hypot(sx - d.sx, sy - d.sy) > 8) {       // kéo từ nút ＋ = kéo một mũi tên ra
                drag = { k: 'arrow', a: { id: d.from }, fromPlus: d.dir };
                drag.ghost = { type: 'arrow', id: '_g', a: drag.a, b: { x: w.x, y: w.y }, rt: pref.route, hd: 'end', c: pref.arrow, lw: 2 };
            }
            break;
        case 'move': moveSel(d, w, e.altKey); if (d.moved) setCursor(); break;
        case 'resize': resizeTo(d, w, e.shiftKey); break;
        case 'end': {
            const o = objs.get(d.id); if (!o) break;
            const other = o[d.which === 'a' ? 'b' : 'a'];
            d.target = topAt(w, x => canLink(x) && x.id !== other?.id);
            o[d.which] = d.target ? { id: d.target.id } : { x: w.x, y: w.y };
            break;
        }
        case 'marquee': {
            d.x1 = w.x; d.y1 = w.y;
            if (Math.hypot(sx - d.sx, sy - d.sy) > 4) d.moved = true;
            const r = { x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0) };
            sel = new Set(d.base);
            sorted().forEach(o => { if (!o._tmp) { const b = box(o); if (b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h) sel.add(o.id); } });
            break;
        }
    }
    schedule();
}
function onUp(e) {
    const wasPinch = !!pinch;
    pointers.delete(e.pointerId);
    if (pinch) { if (pointers.size < 2) pinch = null; return; }
    if (wasPinch || !drag) return;
    const d = drag;
    drag = null; guides = [];
    clearTimeout(d.t);
    const { sx, sy } = evPt(e), w = toWorld(sx, sy);
    const touch = e.pointerType === 'touch';
    switch (d.k) {
        case 'pan':
            setCursor();
            if (d.tap) {           // chạm nhẹ chỗ trống (điện thoại): bỏ chọn + đếm chạm đúp
                const now = performance.now();
                if (lastTap && lastTap.id === null && now - lastTap.t < 380 && Math.hypot(lastTap.sx - sx, lastTap.sy - sy) < 24) { lastTap = null; createAt('note', w); }
                else lastTap = { id: null, t: now, sx, sy };
            }
            break;
        case 'pend': {             // điện thoại: chạm khối chưa chọn -> chọn; khối trống thì gõ luôn
            const o = objs.get(d.id);
            if (!o) break;
            lastTap = { id: o.id, t: performance.now(), sx, sy };
            sel = new Set([o.id]);
            if (hasText(o) && o.type !== 'arrow' && !o.txt) startEdit(o);
            break;
        }
        case 'ink': commitInk(d); break;
        case 'erase': {
            const ids = [...hidden];
            hidden.clear();
            if (ids.length) removeIds(ids);
            break;
        }
        case 'laser': if (myLaser) { myLaser.done = true; sendLaser(true); } break;
        case 'create': {
            const small = Math.abs(d.x1 - d.x0) * view.z < 10 && Math.abs(d.y1 - d.y0) * view.z < 10;
            if (small) createAt(tool, { x: d.x0, y: d.y0 });
            else createAt(tool, null, { x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0) });
            break;
        }
        case 'arrow': {
            const tgt = topAt(w, o => canLink(o) && o.id !== d.a.id);
            const src = d.a.id ? objs.get(d.a.id) : null;
            if (!tgt && d.fromPlus && src) { spawnAt(src, d.fromPlus, w); break; }
            const b = tgt ? { id: tgt.id } : { x: w.x, y: w.y };
            const A = src ? ctr(src) : d.a, B = tgt ? ctr(tgt) : b;
            if (!tgt && Math.hypot(A.x - B.x, A.y - B.y) * view.z < 14) {
                if (tool === 'arrow') showToast('Kéo từ một khối sang khối khác để nối mũi tên.', 'info', 1800);
                break;
            }
            const [o] = addObjs([{ type: 'arrow', a: d.a, b, rt: pref.route, hd: 'end', c: pref.arrow, lw: 2, txt: '' }]);
            setTool('select');
            sel = new Set([o.id]);
            break;
        }
        case 'plus': { const src = objs.get(d.from); if (src) spawnAt(src, d.dir); break; }
        case 'move': {
            d.ids.forEach(id => busy.delete(id));
            const tapped = objs.get(d.tapId);
            if (!d.moved) {
                if (d.keepEdit) {                   // đang gõ khối này: chạm viền = dời con trỏ, không thoát
                    if (tapped && editing?.id === tapped.id) {
                        if (!d.grip) { const c = caretAt(tapped, w); ed.setSelectionRange(c, c); }
                        ed.focus({ preventScroll: true });
                    }
                    break;
                }
                if (d.lifted || d.grip) break;      // nhấn giữ / tay nắm rồi thả mà không kéo: chỉ chọn
                lastTap = d.dblHit ? null : { id: d.tapId, t: performance.now(), sx, sy };
                if (e.shiftKey || !tapped) break;
                sel = new Set([tapped.id]);
                if (d.dblHit) { startEdit(tapped, null, d.zone === 'text' ? caretAt(tapped, w) : undefined); break; }
                // Mũi tên: bấm lần đầu chỉ chọn (hay trúng nhầm đường kẻ); bấm nhãn / bấm lần hai mới sửa nhãn.
                if (tapped.type === 'arrow') { if (d.wasOnly || d.onLabel) startEdit(tapped); }
                // Khối có chữ: máy tính bấm VÙNG CHỮ = gõ (bấm viền chỉ chọn); điện thoại chạm lần hai = gõ.
                else if (hasText(tapped) && (touch || d.zone === 'text')) startEdit(tapped, null, d.zone === 'text' ? caretAt(tapped, w) : undefined);
                break;
            }
            const ch = [];
            d.ids.forEach(id => {
                const o = objs.get(id); if (!o) return;
                const keys = o.type === 'arrow' ? ['a', 'b'] : ['x', 'y'];
                const before = pick(d.start.get(id), keys), after = pick(o, keys);
                if (JSON.stringify(before) !== JSON.stringify(after)) ch.push({ id, before, after });
            });
            updObjs(ch);
            if (d.keepEdit && editing) ed.focus({ preventScroll: true });
            setCursor(sx, sy);
            break;
        }
        case 'resize': {
            busy.delete(d.id);
            const o = objs.get(d.id); if (!o) break;
            const after = pick(o, ['x', 'y', 'w', 'h', 'k']);
            if (JSON.stringify(after) !== JSON.stringify(d.before)) updObjs([{ id: d.id, before: d.before, after }]);
            if (d.keepEdit && editing) ed.focus({ preventScroll: true });
            break;
        }
        case 'end': {
            busy.delete(d.id);
            const o = objs.get(d.id); if (!o) break;
            pinEnds(o);
            updObjs([{ id: d.id, before: d.before, after: pick(o, ['a', 'b']) }]);
            break;
        }
        case 'marquee':
            if (!d.moved) {
                const now = performance.now();
                if (lastTap && lastTap.id === null && now - lastTap.t < 380 && Math.hypot(lastTap.sx - sx, lastTap.sy - sy) < 14) { lastTap = null; createAt('note', w); }
                else lastTap = { id: null, t: now, sx, sy };
            }
            break;
    }
    paintSelBar(true);
    schedule();
}
function startPinch() {
    if (drag) {           // ngón thứ hai chạm xuống: huỷ thao tác dở của ngón đầu
        clearTimeout(drag.t);
        if (drag.k === 'move') { drag.ids.forEach(id => { busy.delete(id); const o = objs.get(id), s = drag.start.get(id); if (o && s) Object.assign(o, s); }); }
        if (drag.k === 'resize' || drag.k === 'end') { busy.delete(drag.id); const o = objs.get(drag.id); if (o) Object.assign(o, drag.before); }
        if (drag.k === 'erase') hidden.clear();
        drag = null;
    }
    const [a, b] = [...pointers.values()];
    const mid = { x: (a.sx + b.sx) / 2, y: (a.sy + b.sy) / 2 };
    pinch = { d0: Math.hypot(a.sx - b.sx, a.sy - b.sy) || 1, z0: view.z, w0: toWorld(mid.x, mid.y) };
    schedule();
}
function movePinch() {
    const [a, b] = [...pointers.values()];
    if (!a || !b) return;
    const mid = { x: (a.sx + b.sx) / 2, y: (a.sy + b.sy) / 2 };
    view.z = clamp(pinch.z0 * Math.hypot(a.sx - b.sx, a.sy - b.sy) / pinch.d0, ZMIN, ZMAX);
    view.x = pinch.w0.x - mid.x / view.z; view.y = pinch.w0.y - mid.y / view.z;
    viewChanged();
}
function onWheel(e) {
    e.preventDefault();
    const { sx, sy } = evPt(e);
    const k = e.deltaMode === 1 ? 16 : 1;
    if (e.ctrlKey || e.metaKey) zoomAt(sx, sy, Math.pow(1.0018, -clamp(e.deltaY * k, -120, 120)));
    else {
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX, dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
        view.x += dx * k / view.z; view.y += dy * k / view.z;
        viewChanged();
    }
}

// ---------- Kéo / co giãn ----------
function moveSel(d, w, noSnap) {
    let dx = w.x - d.w0.x, dy = w.y - d.w0.y;
    if (!d.moved && Math.hypot(dx, dy) * view.z < (d.thr || 3)) return;
    d.moved = true;
    guides = [];
    if (!noSnap && d.bb && d.others.length) {
        // Căn thẳng hàng tự động: mép / tâm của cụm đang kéo bắt vào mép / tâm khối khác (lệch < 6px màn hình)
        const tol = 6 / view.z, bb = d.bb;
        const mx = [bb.x, bb.x + bb.w / 2, bb.x + bb.w].map(v => v + dx), my = [bb.y, bb.y + bb.h / 2, bb.y + bb.h].map(v => v + dy);
        let bx = null, by = null;
        for (const b of d.others) {
            const ox = [b.x, b.x + b.w / 2, b.x + b.w], oy = [b.y, b.y + b.h / 2, b.y + b.h];
            for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
                const ex = ox[j] - mx[i], ey = oy[j] - my[i];
                if (Math.abs(ex) < tol && (!bx || Math.abs(ex) < Math.abs(bx.e))) bx = { e: ex, v: ox[j] };
                if (Math.abs(ey) < tol && (!by || Math.abs(ey) < Math.abs(by.e))) by = { e: ey, v: oy[j] };
            }
        }
        if (bx) { dx += bx.e; guides.push({ x: bx.v }); }
        if (by) { dy += by.e; guides.push({ y: by.v }); }
    }
    for (const [id, s] of d.start) {
        const o = objs.get(id); if (!o) continue;
        if (o.type === 'arrow') {
            if (s.a?.x != null && !endObj(s.a)) o.a = { x: r1(s.a.x + dx), y: r1(s.a.y + dy) };
            if (s.b?.x != null && !endObj(s.b)) o.b = { x: r1(s.b.x + dx), y: r1(s.b.y + dy) };
        } else { o.x = r1(s.x + dx); o.y = r1(s.y + dy); }
    }
}
function resizeTo(d, w, shift) {
    const o = objs.get(d.id); if (!o) return;
    const b = d.b0, MIN = 24;
    const ax = d.c.includes('w') ? b.x + b.w : b.x, ay = d.c.includes('n') ? b.y + b.h : b.y;
    let nw = Math.max(MIN, Math.abs(w.x - ax)), nh = Math.max(MIN, Math.abs(w.y - ay));
    const keep = (o.type === 'img' || o.type === 'ink') ? !shift : shift;
    if (keep) { const r = b.w / b.h; if (nw / nh > r) nw = nh * r; else nh = nw / r; }
    const x1 = d.c.includes('w') ? ax - nw : ax, y1 = d.c.includes('n') ? ay - nh : ay;
    if (o.type === 'ink') {
        const s = nw / b.w, p = (o.lw || 3) / 2;
        o.k = r1((d.before.k || 1) * s * 100) / 100 || 0.1; o.x = r1(x1 + p); o.y = r1(y1 + p);
    } else if (o.type === 'text') { o.x = r1(x1); o.w = r1(Math.max(60, nw)); }
    else { o.x = r1(x1); o.y = r1(y1); o.w = r1(nw); o.h = r1(nh); }
    invalidate(o);
}

// ---------- Tạo / xoá ----------
function createAt(t, at, rect) {
    let o;
    const def = t === 'note' ? [200, 150] : t === 'text' ? [240, 30] : kind === 'diamond' ? [180, 120] : kind === 'ellipse' ? [160, 100] : [180, 76];
    const r = rect ? { ...rect, w: Math.max(rect.w, 40), h: Math.max(rect.h, 30) } : { x: at.x - def[0] / 2, y: at.y - def[1] / 2, w: def[0], h: def[1] };
    if (t === 'note') o = { type: 'note', ...r, txt: '', f: pref.note, fs: 16, bn: myName() };
    else if (t === 'text') o = { type: 'text', x: r.x, y: rect ? r.y : at.y - 14, w: Math.max(r.w, 140), txt: '', c: pref.text, fs: 18 };
    else o = { type: 'shape', kind, ...r, txt: '', f: pref.fill, fs: 16 };
    ['x', 'y', 'w', 'h'].forEach(k => { if (o[k] != null) o[k] = r1(o[k]); });
    addObjs([o]);
    setTool('select');
    sel = new Set([o.id]);
    startEdit(o);
}
function simplify(a, eps) {      // Ramer–Douglas–Peucker trên mảng phẳng [x,y,x,y…]
    const n = a.length / 2;
    if (n < 3) return a;
    const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
    const st = [[0, n - 1]];
    while (st.length) {
        const [i, j] = st.pop();
        let md = 0, mi = -1;
        const A = { x: a[i * 2], y: a[i * 2 + 1] }, B = { x: a[j * 2], y: a[j * 2 + 1] };
        for (let k = i + 1; k < j; k++) { const dd = segDist({ x: a[k * 2], y: a[k * 2 + 1] }, A, B); if (dd > md) { md = dd; mi = k; } }
        if (md > eps && mi > 0) { keep[mi] = 1; st.push([i, mi], [mi, j]); }
    }
    const out = [];
    for (let k = 0; k < n; k++) if (keep[k]) out.push(a[k * 2], a[k * 2 + 1]);
    return out;
}
function commitInk(d) {
    const a = simplify(d.pts, 0.7 / view.z);
    let x = Infinity, y = Infinity;
    for (let i = 0; i < a.length; i += 2) { x = Math.min(x, a[i]); y = Math.min(y, a[i + 1]); }
    const pts = a.map((v, i) => r1(v - (i % 2 ? y : x)));
    const g = d.ghost;
    const o = { type: 'ink', x: r1(x), y: r1(y), k: 1, pts, lw: g.lw, c: g.c, hl: g.hl };
    inkBox(o);
    addObjs([o]);
}
function eraseAt(w) {
    const tol = 10 / view.z;
    for (const o of sorted()) if (!hidden.has(o.id) && !o._tmp && hitObj(o, w, tol)) hidden.add(o.id);
    schedule();
}
function removeIds(ids) {
    const all = new Set(ids);
    // kéo theo mũi tên đang bám vào vật bị xoá
    for (const o of objs.values()) if (o.type === 'arrow' && (all.has(o.a?.id) || all.has(o.b?.id))) all.add(o.id);
    const gone = [...all].map(id => objs.get(id)).filter(o => o && !o._tmp).map(snapOf);
    if (!gone.length) return;
    gone.forEach(o => drop(o.id));
    commit(gone.map(o => ['del', o.id]));
    record({ del: gone });
    paintEmpty(); paintSelBar(true); schedule();
}
const delSel = () => removeIds([...sel]);

// ---------- Sao chép / dán / nhân bản ----------
function clipOf(list) {
    const ids = new Set(list.map(o => o.id));
    return list.map(o => {
        const s = snapOf(o);
        if (o.type === 'arrow') {           // đầu bám khối ngoài vùng chép -> đổi thành điểm tự do
            const P = route(o);
            if (s.a.id && !ids.has(s.a.id)) s.a = { x: r1(P[0].x), y: r1(P[0].y) };
            if (s.b.id && !ids.has(s.b.id)) s.b = { x: r1(P.at(-1).x), y: r1(P.at(-1).y) };
        }
        return s;
    });
}
function pasteList(list, off = 28) {
    if (!list?.length) return;
    const map = new Map(list.map(o => [o.id, newId()]));
    const tmp = list.map(o => norm('p', JSON.parse(JSON.stringify(o)))).filter(Boolean);
    // Vùng dán nằm ngoài khung nhìn (chép từ phòng khác / chỗ khác) -> dán vào giữa màn hình
    const u = unionBox(tmp.filter(o => o.type !== 'arrow')) || unionBox(tmp);
    const view0 = { x: view.x, y: view.y, w: W / view.z, h: H / view.z };
    let dx = off, dy = off;
    if (u && !overlap(u, view0)) { const c = toWorld(W / 2, H / 2); dx = c.x - (u.x + u.w / 2); dy = c.y - (u.y + u.h / 2); }
    const z0 = nextZ();
    const out = list.map((s, i) => {
        const n = JSON.parse(JSON.stringify(s));
        n.id = map.get(s.id); n.z = z0 + i; n.by = me;
        if (n.type === 'arrow') ['a', 'b'].forEach(k => {
            const e = n[k];
            if (e.id) { if (map.has(e.id)) e.id = map.get(e.id); else delete e.id; }
            if (e.x != null) { e.x = r1(e.x + dx); e.y = r1(e.y + dy); }
        });
        else { n.x = r1(n.x + dx); n.y = r1(n.y + dy); }
        if (n.type === 'note') { n.bn = myName(); n.votes = {}; }
        return n;
    }).filter(n => n.type !== 'arrow' || ((n.a.id || n.a.x != null) && (n.b.id || n.b.x != null)));
    const made = addObjs(out.map(n => norm(n.id, n)).filter(Boolean));
    sel = new Set(made.map(o => o.id));
    paintSelBar(true);
}
const duplicate = () => { const S = selObjs(); if (S.length) pasteList(clipOf(S)); };
function pasteText(text) {
    const c = toWorld(W / 2, H / 2), t = text.trim().slice(0, 2000);
    const lines = t.split('\n').length, h = clamp(60 + lines * 22 + t.length * 0.35, 150, 420);
    const [o] = addObjs([{ type: 'note', x: r1(c.x - 130), y: r1(c.y - h / 2), w: 260, h: r1(h), txt: t, f: pref.note, fs: 15, bn: myName() }]);
    sel = new Set([o.id]); paintSelBar(true);
}

// ---------- Ảnh ----------
async function insertImages(files, at) {
    let p = at || toWorld(W / 2, H / 2);
    for (const f of files.slice(0, 6)) {
        const tmp = { id: 'tmp' + newId(), type: 'img', x: p.x - 130, y: p.y - 95, w: 260, h: 190, src: '', _tmp: 1, _prog: 0, z: nextZ() };
        put(tmp); paintEmpty(); schedule();
        try {
            const res = await uploadImage(f, (x) => { tmp._prog = x; schedule(); });
            warnIfTemp(res);
            const src = safeImgUrl(res.u);
            if (!src) throw new Error('bad-url');
            let nw = res.w, nh = res.h;
            if (!nw || !nh) {
                const im = new Image(); im.src = src;
                await new Promise(r => { im.onload = r; im.onerror = r; });
                nw = im.naturalWidth || 400; nh = im.naturalHeight || 300;
            }
            const s = Math.min(1, 460 / Math.max(nw, nh));
            drop(tmp.id);
            addObjs([{ type: 'img', x: r1(p.x - nw * s / 2), y: r1(p.y - nh * s / 2), w: r1(nw * s), h: r1(nh * s), src }]);
        } catch (err) {
            console.warn('[bảng trắng] ảnh lỗi', err);
            drop(tmp.id); paintEmpty(); schedule();
            showToast('Không tải được ảnh lên — thử lại, hoặc dùng ảnh nhỏ hơn.', 'error');
        }
        p = { x: p.x + 40, y: p.y + 40 };
    }
}

// ---------- Mẫu (wb-templates.js chỉ tải khi mở hộp Mẫu / bấm chèn mẫu) ----------
let tplMod = null;
const loadTpl = () => (tplMod ||= import('./wb-templates.js').catch(err => { tplMod = null; throw err; }));
function paintTplPop() {
    const box = $('.wb-tpls');
    if (box.dataset.ready) return;
    loadTpl().then(({ TEMPLATES }) => {
        box.dataset.ready = '1';
        box.innerHTML = TEMPLATES.map((t, i) => `<button type="button" class="wb-tplc" data-tpl="${t.key}" style="--tc:${t.tint};--tr:${[-0.8, 0.6, -0.4, 0.9, -0.6, 0.5, -0.9, 0.4][i % 8]}deg"><i class="fas ${t.icon}"></i><b>${esc(t.name)}</b><span>${esc(t.desc)}</span></button>`).join('');
    }).catch(() => { box.innerHTML = '<p class="wb-tpl-wait">Không mở được mẫu — kiểm tra mạng rồi thử lại.</p>'; });
}
async function insertTemplate(key) {
    let mod;
    try { mod = await loadTpl(); } catch (e) { return showToast('Không mở được mẫu — kiểm tra mạng rồi thử lại.', 'error'); }
    const { TEMPLATES, buildTemplate } = mod;
    const list = buildTemplate(key);
    if (!list.length) return;
    closePops();
    const tmp = list.map(o => norm(o.id, o)).filter(Boolean);
    // dựng tạm vào bảng để đo khung (mũi tên cần khối thật)
    const map = new Map(tmp.map(o => [o.id, newId()]));
    const u = unionBox(tmp.filter(o => o.type !== 'arrow'));
    // Bảng trống: đặt giữa khung nhìn. Đã có đồ: đặt sang BÊN PHẢI toàn bộ nội dung (không bao giờ đè).
    const all = unionBox(sorted().filter(o => !o._tmp));
    const c = toWorld(W / 2, H / 2);
    const dx = all ? all.x + all.w + 160 - u.x : c.x - (u.x + u.w / 2), dy = all ? all.y - u.y : c.y - (u.y + u.h / 2);
    const z0 = nextZ();
    const out = tmp.map((o, i) => {
        o.id = map.get(o.id); o.z = z0 + i;
        if (o.type === 'arrow') ['a', 'b'].forEach(k => {
            if (o[k].id) o[k].id = map.get(o[k].id);
            else { o[k].x = r1(o[k].x + dx); o[k].y = r1(o[k].y + dy); }
        });
        else { o.x = r1(o.x + dx); o.y = r1(o.y + dy); }
        if (o.type === 'note') o.bn = myName();
        return o;
    });
    addObjs(out);
    sel.clear();
    fitBox(unionBox(out));
    const t = TEMPLATES.find(x => x.key === key);
    showToast(`Đã thêm mẫu "${t?.name || ''}" — bấm đúp vào khối để điền. Ctrl+Z để gỡ.`, 'success', 3200);
}

// ---------- Xuất ảnh ----------
async function renderPng() {
    const list = sorted().filter(o => !o._tmp && !hidden.has(o.id));
    if (!list.length) { showToast('Bảng đang trống.', 'info'); return null; }
    const u = unionBox(list), pad = 48;
    const s = clamp(Math.min(2, 4096 / Math.max(u.w + pad * 2, u.h + pad * 2)), 0.3, 2);
    const c = document.createElement('canvas');
    c.width = Math.ceil((u.w + pad * 2) * s); c.height = Math.ceil((u.h + pad * 2) * s + 30 * s);
    const x = c.getContext('2d');
    x.fillStyle = '#FFFDF8'; x.fillRect(0, 0, c.width, c.height);
    x.setTransform(s, 0, 0, s, (pad - u.x) * s, (pad - u.y) * s);
    list.forEach(o => drawObj(x, o, false, true));
    x.setTransform(s, 0, 0, s, 0, 0);
    x.font = font(12, 600); x.fillStyle = 'rgba(74,59,82,.45)'; x.textAlign = 'right'; x.textBaseline = 'middle';
    x.fillText(`Zitthenkne · Bảng trắng phòng ${roomId} · ${new Date().toLocaleString('vi-VN')}`, c.width / s - 16, c.height / s - 18);
    if (list.some(o => o.type === 'img' && o._taint)) showToast('Có ảnh nằm trên host không cho chép — ảnh đó hiện khung trống trong bản xuất.', 'info', 3600);
    return new Promise(r => c.toBlob(r, 'image/png'));
}
async function exportPng() {
    const blob = await renderPng();
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bang-trang-${roomId}-${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function sendToChat() {
    const blob = await renderPng();
    if (!blob) return;
    showToast('Đang gửi ảnh bảng vào Thảo luận…', 'info', 1800);
    try {
        const res = await uploadImage(new File([blob], 'bang-trang.png', { type: 'image/png' }));
        warnIfTemp(res);
        await addDoc(refs.messages(), { type: 'chat', text: '🖼 Ảnh chụp bảng trắng', uid: me, displayName: myName(), images: [res], createdAt: serverTimestamp() });
        showToast('Đã gửi ảnh bảng vào Thảo luận.', 'success');
    } catch (err) {
        console.warn(err);
        showToast('Không gửi được ảnh bảng — thử "Tải ảnh PNG" rồi dán vào chat.', 'error');
    }
}
async function clearBoard() {
    const all = sorted().filter(o => !o._tmp);
    if (!all.length) return;
    if (!await showConfirm(`Xoá cả ${all.length} mục trên bảng cho MỌI NGƯỜI? Ngay sau đó bạn vẫn hoàn tác được (Ctrl+Z).`, { title: 'Xoá cả bảng', confirmText: 'Xoá bảng', tone: 'danger' })) return;
    removeIds(all.map(o => o.id));
}

// ---------- Giao diện: dựng khung ----------
function buildUI() {
    root.classList.add('wb');
    const tools = TOOLS.map(t => t === '|' ? '<span class="wb-sep" aria-hidden="true"></span>'
        : `<button type="button" class="wb-tool${t[0] === 'select' ? ' on' : ''}" data-tool="${t[0]}" title="${esc(t[3])} (${t[1]})" aria-label="${esc(t[3])}">${t[0] === 'shape' ? KINDS.rect[1] : t[2]}<kbd>${t[1]}</kbd></button>`).join('');
    root.innerHTML = `
        <div id="canvas-container" class="wb-wrap" data-paper="dots">
            <canvas id="whiteboard" class="wb-cv" aria-label="Bảng trắng vẽ chung — dùng chuột hoặc ngón tay"></canvas>
            <textarea class="wb-edit" hidden spellcheck="false" aria-label="Sửa chữ trên bảng"></textarea>
            <div class="wb-ptr" hidden><i class="fas fa-location-arrow"></i><span></span></div>
        </div>
        <div class="wb-empty" hidden>
            <div class="wb-empty-card">
                <svg class="wb-empty-art" viewBox="0 0 120 64" aria-hidden="true"><rect x="4" y="22" width="30" height="20" rx="5" fill="#D6F5E8" stroke="#52BE93" stroke-width="2"/><path d="M60 14 76 32 60 50 44 32Z" fill="#FFE2CC" stroke="#EF9E62" stroke-width="2" stroke-linejoin="round"/><rect x="88" y="22" width="28" height="20" rx="10" fill="#D8ECFF" stroke="#5FA5EC" stroke-width="2"/><path d="M35 32h7M77 32h9" stroke="#8A7A96" stroke-width="2" stroke-linecap="round"/></svg>
                <b>Bảng đang trống</b>
                <p>Chọn một mẫu để hội chẩn ngay, hoặc bấm đúp vào bảng để dán giấy note.</p>
                <div class="wb-empty-acts">
                    <button type="button" data-tpl="case"><i class="fas fa-stethoscope"></i>Hội chẩn ca bệnh</button>
                    <button type="button" data-tpl="algo"><i class="fas fa-diagram-project"></i>Lưu đồ chẩn đoán</button>
                    <button type="button" data-act="tpl" class="is-soft">Mẫu khác…</button>
                </div>
            </div>
        </div>
        <nav class="wb-dock" aria-label="Công cụ bảng trắng">${tools}</nav>
        <div class="wb-opts" hidden></div>
        <div class="wb-top">
            <button type="button" class="wb-pill" data-act="tpl" title="Mẫu dựng sẵn: hội chẩn, lưu đồ, chẩn đoán phân biệt…"><i class="fas fa-shapes"></i><span>Mẫu</span></button>
            <button type="button" class="wb-pill" data-act="present" title="Cả phòng xem theo khung nhìn và con trỏ của bạn"><i class="fas fa-person-chalkboard"></i><span>Trình bày</span></button>
            <button type="button" class="wb-ibtn" data-act="more" title="Thêm: nền giấy, xuất ảnh, phím tắt…" aria-label="Thêm"><i class="fas fa-ellipsis"></i></button>
        </div>
        <div class="wb-pop wb-tpl" data-pop="tpl" hidden>
            <div class="wb-pop-h"><b>Mẫu dựng sẵn</b><span>Không đè lên nội dung đang có · bấm đúp vào khối để điền · Ctrl+Z để gỡ</span></div>
            <div class="wb-tpls"><p class="wb-tpl-wait">Đang mở mẫu…</p></div>
        </div>
        <div class="wb-pop wb-more" data-pop="more" hidden>
            <div class="wb-pop-h"><b>Nền giấy</b></div>
            <div class="wb-papers">${PAPERS.map(([k, n]) => `<button type="button" data-paper="${k}"><span class="wb-paper-sw" data-p="${k}"></span>${n}</button>`).join('')}</div>
            <div class="wb-menu">
                <button type="button" data-act="fit"><i class="fas fa-expand"></i>Vừa khung toàn bảng<kbd>Shift 1</kbd></button>
                <button type="button" data-act="png"><i class="fas fa-download"></i>Tải ảnh PNG của bảng</button>
                <button type="button" data-act="chat"><i class="fas fa-paper-plane"></i>Gửi ảnh bảng vào Thảo luận</button>
                <button type="button" data-act="help"><i class="fas fa-keyboard"></i>Phím tắt bảng trắng</button>
                <button type="button" data-act="clear" class="is-danger"><i class="fas fa-trash"></i>Xoá cả bảng</button>
            </div>
        </div>
        <div class="wb-pop wb-help" data-pop="help" hidden>
            <div class="wb-pop-h"><b>Phím tắt bảng trắng</b></div>
            <dl>
                <dt>V · H</dt><dd>Chọn · kéo bảng (hoặc giữ Space)</dd>
                <dt>P · B · E · L</dt><dd>Bút · bút dạ · tẩy · laser</dd>
                <dt>R · D · O · U</dt><dd>Hộp · thoi · elip · viên</dd>
                <dt>A · T · N · I</dt><dd>Mũi tên · chữ · giấy note · ảnh</dd>
                <dt>Bấm đúp · Enter</dt><dd>Sửa chữ trong khối / note / nhãn mũi tên</dd>
                <dt>Tab (khi đang gõ)</dt><dd>Xong khối này, mọc khối kế tiếp đã nối sẵn</dd>
                <dt>Ctrl Z · Ctrl Y</dt><dd>Hoàn tác · làm lại (chỉ việc của bạn)</dd>
                <dt>Ctrl C · V · D</dt><dd>Sao chép · dán (cả ảnh, chữ) · nhân bản</dd>
                <dt>Ctrl + lăn chuột</dt><dd>Phóng to / thu nhỏ · Shift 1 vừa khung</dd>
                <dt>Alt khi kéo</dt><dd>Tắt căn thẳng hàng tự động</dd>
                <dt>Delete · mũi tên</dt><dd>Xoá · dịch từng chút (Shift = 10)</dd>
            </dl>
        </div>
        <div class="wb-zoom">
            <button type="button" data-act="undo" title="Hoàn tác việc của bạn (Ctrl+Z)" aria-label="Hoàn tác" disabled><i class="fas fa-rotate-left"></i></button>
            <button type="button" data-act="redo" title="Làm lại (Ctrl+Y)" aria-label="Làm lại" disabled><i class="fas fa-rotate-right"></i></button>
            <span class="wb-zsep" aria-hidden="true"></span>
            <button type="button" data-act="zout" title="Thu nhỏ (Ctrl −)" aria-label="Thu nhỏ" class="wb-zbtn"><i class="fas fa-minus"></i></button>
            <button type="button" data-act="z100" class="wb-zpct" title="Về 100%">100%</button>
            <button type="button" data-act="zin" title="Phóng to (Ctrl +)" aria-label="Phóng to" class="wb-zbtn"><i class="fas fa-plus"></i></button>
            <button type="button" data-act="fit" title="Vừa khung toàn bảng (Shift+1)" aria-label="Vừa khung"><i class="fas fa-expand"></i></button>
        </div>
        <div class="wb-selbar" hidden></div>
        <div class="wb-follow" hidden></div>
        <input type="file" accept="image/*" multiple hidden class="wb-file">`;
    wrap = $('.wb-wrap'); cv = $('.wb-cv'); ctx = cv.getContext('2d'); ed = $('.wb-edit'); ptrEl = $('.wb-ptr'); fileIn = $('.wb-file');
    let paper = 'dots';
    try { paper = localStorage.getItem('wbPaper') || 'dots'; } catch (e) {}
    setPaper(paper);
}
function setPaper(p) {
    if (!PAPERS.some(x => x[0] === p)) p = 'dots';
    wrap.dataset.paper = p;
    root.querySelectorAll('[data-paper]').forEach(b => { if (b !== wrap) b.classList.toggle('on', b.dataset.paper === p); });
    try { localStorage.setItem('wbPaper', p); } catch (e) {}
}
function closePops(except) {
    root.querySelectorAll('.wb-pop').forEach(p => { if (p.dataset.pop !== except) p.hidden = true; });
    root.querySelectorAll('[data-act="tpl"],[data-act="more"]').forEach(b => b.classList.remove('on'));
}
function togglePop(name) {
    const p = $(`.wb-pop[data-pop="${name}"]`);
    const open = p.hidden;
    closePops();
    p.hidden = !open;
    if (open) root.querySelectorAll(`.wb-top [data-act="${name}"]`).forEach(b => b.classList.add('on'));
}
function paintEmpty() {
    const e = $('.wb-empty');
    if (e) e.hidden = sorted().length > 0 || !!drag;
}
function paintUndo() {
    const u = $('[data-act="undo"]'), r = $('[data-act="redo"]');
    if (u) u.disabled = !undoS.length;
    if (r) r.disabled = !redoS.length;
}
function paintFollow() {
    const f = $('.wb-follow');
    const btn = $('.wb-top [data-act="present"]');
    btn?.classList.toggle('is-live', presenting);
    if (btn) btn.querySelector('span').textContent = presenting ? 'Đang trình bày' : 'Trình bày';
    if (presenting) {
        f.hidden = false;
        f.innerHTML = `<i class="fas fa-person-chalkboard"></i><span>Bạn đang trình bày — cả phòng xem theo khung nhìn của bạn</span><button type="button" data-act="present">Dừng</button>`;
    } else if (present) {
        f.hidden = false;
        f.innerHTML = following
            ? `<i class="fas fa-eye"></i><span>Đang xem theo <b>${esc(present.bn || 'người trình bày')}</b></span><button type="button" data-act="unfollow">Xem tự do</button>`
            : `<i class="fas fa-person-chalkboard"></i><span><b>${esc(present.bn || 'Một bạn')}</b> đang trình bày</span><button type="button" data-act="follow">Xem theo</button>`;
    } else f.hidden = true;
    root.classList.toggle('is-follow', !!present && following);
    placePtr();
}
function placePtr() {
    if (!ptrEl) return;
    const show = present && present.px != null && present.by !== me;
    ptrEl.hidden = !show;
    if (!show) return;
    const p = toScreen(present.px, present.py);
    ptrEl.style.left = p.x + 'px'; ptrEl.style.top = p.y + 'px';
    ptrEl.querySelector('span').textContent = present.bn || '';
}
/** Bảng tuỳ chọn của công cụ đang cầm (màu, nét, kiểu khối…). */
function paintOpts() {
    const box = $('.wb-opts');
    const dots = (list, cur, attr) => `<div class="wb-sw">${list.map(([c, , n]) => `<button type="button" class="wb-dot${String(cur).toLowerCase() === c.toLowerCase() ? ' on' : ''}" data-${attr}="${c}" style="--c:${c}" title="${esc(n || '')}" aria-label="${esc(n || c)}"></button>`).join('')}</div>`;
    const inks = INKS.map(([c, n]) => [c, 0, n]), hls = HLS.map(([c, n]) => [c, 0, n]);
    let h = '';
    if (tool === 'pen') h = dots(inks, pref.pen, 'o-pen') + `<div class="wb-seg">${[[2, 'Mảnh'], [3, 'Vừa'], [6, 'Đậm']].map(([w, n]) => `<button type="button" data-o-penw="${w}" class="${pref.penW === w ? 'on' : ''}" title="${n}"><span style="--w:${w + 1}px"></span></button>`).join('')}</div>`;
    else if (tool === 'hl') h = dots(hls, pref.hl, 'o-hl');
    else if (tool === 'shape') h = `<div class="wb-seg">${Object.entries(KINDS).map(([k, [n, ic]]) => `<button type="button" data-o-kind="${k}" class="${kind === k ? 'on' : ''}" title="${esc(n)}">${ic}</button>`).join('')}</div>` + dots(FILLS, pref.fill, 'o-fill');
    else if (tool === 'note') h = dots(FILLS.slice(0, 6), pref.note, 'o-note');
    else if (tool === 'arrow') h = `<div class="wb-seg">${Object.entries(ROUTES).map(([k, [n, ic]]) => `<button type="button" data-o-route="${k}" class="${pref.route === k ? 'on' : ''}" title="${esc(n)}">${ic}</button>`).join('')}</div>` + dots(inks, pref.arrow, 'o-arrow');
    else if (tool === 'text') h = dots(inks, pref.text, 'o-text');
    box.hidden = !h;
    box.innerHTML = h;
    if (!h) return;
    const btn = $(`.wb-tool[data-tool="${tool}"]`);
    if (btn && window.matchMedia('(min-width: 768px)').matches) {
        const rb = btn.getBoundingClientRect(), rr = root.getBoundingClientRect();
        box.style.top = Math.max(8, Math.min(rb.top - rr.top - 6, rr.height - box.offsetHeight - 8)) + 'px';
    } else box.style.top = '';
}
/** Thanh thao tác nổi trên vật đang chọn. */
function paintSelBar(force) {
    const bar = $('.wb-selbar');
    const S = selObjs().filter(o => !o._tmp);
    if (!S.length || tool !== 'select' || (drag && drag.k !== 'plus')) { bar.hidden = true; selSig = ''; sub = ''; return; }
    const one = S.length === 1 ? S[0] : null;
    const sig = JSON.stringify([sub, !!editing, S.map(o => [o.id, o.f, o.c, o.kind, o.fs, o.rt, o.hd, o.dash, Object.keys(o.votes || {}).length])]);
    if (!force && sig === selSig && !bar.hidden) return;
    selSig = sig;
    const fillable = S.filter(o => o.type === 'shape' || o.type === 'note');
    const inky = S.filter(o => o.type === 'ink' || o.type === 'arrow' || o.type === 'text');
    const sized = S.filter(o => o.type === 'shape' || o.type === 'note' || o.type === 'text' || o.type === 'arrow');
    const arrows = S.filter(o => o.type === 'arrow');
    const dashy = S.filter(o => o.type === 'shape' || o.type === 'arrow');
    const b = [];
    // Việc hay làm nhất đứng ĐẦU hàng (điện thoại hàng dài phải vuốt): Sửa chữ khi đang chọn, Kế tiếp khi đang gõ
    if (one && hasText(one) && !editing) b.push(`<button type="button" data-edit class="wb-editbtn" title="Sửa chữ (Enter, hoặc bấm vào chữ)"><i class="fas fa-pen"></i><span>Sửa chữ</span></button>`);
    if (editing && one && canLink(one)) b.push(`<button type="button" data-next class="wb-next" title="Xong khối này, thêm cái kế tiếp đã nối sẵn (Tab)"><i class="fas fa-plus"></i>Kế tiếp</button>`);
    const cur = fillable[0]?.f || inky[0]?.c || '#FFFFFF';
    if (fillable.length || inky.length) b.push(`<button type="button" data-sub="color" class="${sub === 'color' ? 'on' : ''}" title="Màu"><span class="wb-cdot" style="--c:${esc(cur)}"></span></button>`);
    if (one?.type === 'shape') b.push(`<button type="button" data-sub="kind" class="${sub === 'kind' ? 'on' : ''}" title="Đổi kiểu khối">${KINDS[one.kind]?.[1] || KINDS.rect[1]}</button>`);
    if (sized.length) b.push(`<button type="button" data-fs="-1" title="Chữ nhỏ lại">A<small>−</small></button><button type="button" data-fs="1" title="Chữ to lên">A<small>+</small></button>`);
    if (arrows.length) {
        const a0 = arrows[0];
        b.push(`<button type="button" data-cycle="rt" title="${esc(ROUTES[a0.rt || 'straight'][0])} — bấm để đổi">${ROUTES[a0.rt || 'straight'][1]}</button>`);
        b.push(`<button type="button" data-cycle="hd" title="${esc(HEADS[a0.hd || 'end'][0])} — bấm để đổi">${HEADS[a0.hd || 'end'][1]}</button>`);
    }
    if (dashy.length) b.push(`<button type="button" data-dash class="${dashy.every(o => o.dash) ? 'on' : ''}" title="Nét đứt">${DASH_ICO}</button>`);
    if (one?.type === 'note') {
        const n = Object.keys(one.votes || {}).length, mine = !!one.votes?.[me];
        b.push(`<button type="button" data-vote class="wb-vote${mine ? ' on' : ''}" title="${mine ? 'Bỏ đồng ý' : 'Đồng ý với ý này'}"><i class="fas fa-heart"></i>${n || ''}</button>`);
    }
    b.push('<span class="wb-bsep"></span>');
    b.push(`<button type="button" data-front title="Đưa lên trên cùng"><i class="fas fa-layer-group"></i></button>`);
    b.push(`<button type="button" data-dup title="Nhân bản (Ctrl+D)"><i class="fas fa-clone"></i></button>`);
    b.push(`<button type="button" data-del class="is-danger" title="Xoá (Delete)"><i class="fas fa-trash"></i></button>`);
    // Đang gõ: nút Xong cuối hàng (dính mép phải trên điện thoại) — điện thoại không có phím Esc
    if (editing && one) b.push(`<button type="button" data-done class="wb-done" title="Xong (${one.type === 'shape' || one.type === 'arrow' ? 'Enter' : 'Esc'})"><i class="fas fa-check"></i>Xong</button>`);
    let row = '';
    if (sub === 'color') {
        const both = fillable.length && inky.length;
        if (fillable.length) row += FILLS.map(([c, , n]) => `<button type="button" class="wb-dot${cur === c ? ' on' : ''}" data-fill="${c}" style="--c:${c}" title="${esc(n)}"></button>`).join('');
        if (both) row += '<span class="wb-bsep"></span>';
        if (inky.length) row += INKS.map(([c, n]) => `<button type="button" class="wb-dot${(inky[0].c || INK0) === c ? ' on' : ''}" data-ink="${c}" style="--c:${c}" title="${esc(n)}"></button>`).join('');
    } else if (sub === 'kind' && one?.type === 'shape') {
        row = Object.entries(KINDS).map(([k, [n, ic]]) => `<button type="button" data-kind="${k}" class="${one.kind === k ? 'on' : ''}" title="${esc(n)}">${ic}</button>`).join('');
    }
    bar.innerHTML = `<div class="wb-bmain">${b.join('')}</div>${row ? `<div class="wb-brow">${row}</div>` : ''}`;
    bar.hidden = false;
    placeSelBar();
}
function placeSelBar() {
    const bar = $('.wb-selbar');
    if (!bar || bar.hidden) return;
    const S = selObjs();
    if (!S.length) { bar.hidden = true; return; }
    const vv = window.visualViewport, r = wrap.getBoundingClientRect();
    const bottom = vv ? Math.min(H, vv.offsetTop + vv.height - r.top) : H;     // chừa phần bàn phím điện thoại che
    // Điện thoại: thanh là MỘT HÀNG neo đáy bảng (trên dock công cụ; đang gõ thì sát trên bàn phím) — không đè lên
    // khối đang sửa như kiểu nổi trên đầu khối, và ngón cái với tới dễ.
    const phone = W < 640;
    bar.classList.toggle('is-dock', phone);
    if (phone) {
        const dock = $('.wb-dock'), dh = dock?.offsetParent ? dock.offsetHeight + 10 : 0;
        bar.style.left = W / 2 + 'px';
        bar.style.top = Math.max(8, bottom - bar.offsetHeight - 8 - dh) + 'px';
        return;
    }
    const u = unionBox(S), a = toScreen(u.x, u.y), bw = bar.offsetWidth, bh = bar.offsetHeight;
    let x = a.x + u.w * view.z / 2, y = a.y - bh - 18;
    if (S.length === 1 && canLink(S[0]) && !editing) y -= 20;           // chừa chỗ cho nút ＋ phía trên
    if (y < 56) y = a.y + u.h * view.z + (S.length === 1 && canLink(S[0]) ? 42 : 16);
    x = clamp(x, bw / 2 + 8, W - bw / 2 - 8);
    y = clamp(y, 8, Math.max(8, bottom - bh - 8));
    bar.style.left = x + 'px'; bar.style.top = y + 'px';
}

// ---------- Thanh thao tác: áp thay đổi cho vật đang chọn ----------
function applyToSel(fn, keys) {
    const ch = [];
    selObjs().forEach(o => {
        const before = pick(o, keys);
        if (fn(o) === false) return;
        invalidate(o);
        const after = pick(o, keys);
        if (JSON.stringify(before) !== JSON.stringify(after)) ch.push({ id: o.id, before, after });
    });
    updObjs(ch);
    paintSelBar(true); schedule();
}
function onSelBar(e) {
    const t = e.target.closest('button');
    if (!t) return;
    e.preventDefault();
    if (t.dataset.sub) { sub = sub === t.dataset.sub ? '' : t.dataset.sub; return paintSelBar(true); }
    if (t.dataset.fill) {
        const f = t.dataset.fill;
        pref.fill = f;
        return applyToSel(o => { if (o.type !== 'shape' && o.type !== 'note') return false; o.f = f; delete o.lc; }, ['f', 'lc']);
    }
    if (t.dataset.ink) {
        const c = t.dataset.ink;
        return applyToSel(o => { if (o.type !== 'ink' && o.type !== 'arrow' && o.type !== 'text') return false; o.c = c; }, ['c']);
    }
    if (t.dataset.kind) { const k = t.dataset.kind; return applyToSel(o => { if (o.type !== 'shape') return false; o.kind = k; }, ['kind']); }
    if (t.dataset.fs) {
        const dir = Number(t.dataset.fs);
        return applyToSel(o => {
            if (!hasText(o)) return false;
            const base = o.fs || (o.type === 'text' ? 18 : o.type === 'arrow' ? 14 : 16);
            const i = FS_STEPS.findIndex(v => v >= base);
            o.fs = FS_STEPS[clamp((i < 0 ? FS_STEPS.length - 1 : i) + dir, 0, FS_STEPS.length - 1)];
        }, ['fs']);
    }
    if (t.dataset.cycle === 'rt') {
        const ks = Object.keys(ROUTES), a0 = selObjs().find(o => o.type === 'arrow');
        const nx = ks[(ks.indexOf(a0?.rt || 'straight') + 1) % ks.length];
        pref.route = nx;
        return applyToSel(o => { if (o.type !== 'arrow') return false; o.rt = nx; }, ['rt']);
    }
    if (t.dataset.cycle === 'hd') {
        const ks = Object.keys(HEADS), a0 = selObjs().find(o => o.type === 'arrow');
        const nx = ks[(ks.indexOf(a0?.hd || 'end') + 1) % ks.length];
        return applyToSel(o => { if (o.type !== 'arrow') return false; o.hd = nx; }, ['hd']);
    }
    if (t.hasAttribute('data-dash')) {
        const on = !selObjs().filter(o => o.type === 'shape' || o.type === 'arrow').every(o => o.dash);
        return applyToSel(o => { if (o.type !== 'shape' && o.type !== 'arrow') return false; o.dash = on; }, ['dash']);
    }
    if (t.hasAttribute('data-vote')) {
        const o = selObjs()[0];
        if (!o) return;
        const v = { ...(o.votes || {}) };
        if (v[me]) delete v[me]; else v[me] = 1;
        o.votes = v;
        commit([['upd', o.id, { votes: v }]]);         // bình chọn là của riêng mỗi người -> không vào hoàn tác
        paintSelBar(true); return schedule();
    }
    if (t.hasAttribute('data-edit')) { const o = selObjs()[0]; if (o) startEdit(o); return; }
    if (t.hasAttribute('data-done')) { endEdit(); return; }
    if (t.hasAttribute('data-next')) {
        const o = objs.get(editing?.id) || selObjs()[0];
        if (!o) return;
        endEdit();
        return spawnAt(o, W < 640 ? 'b' : 'r');       // điện thoại dọc: mọc xuống dưới cho vừa màn
    }
    if (t.hasAttribute('data-front')) { let z = nextZ(); return applyToSel(o => { o.z = z++; dirtyOrder = true; }, ['z']); }
    if (t.hasAttribute('data-dup')) return duplicate();
    if (t.hasAttribute('data-del')) return delSel();
}
function onOpts(e) {
    const t = e.target.closest('button');
    if (!t) return;
    const d = t.dataset;
    if (d.oPen) pref.pen = d.oPen;
    else if (d.oPenw) pref.penW = Number(d.oPenw);
    else if (d.oHl) pref.hl = d.oHl;
    else if (d.oKind) setTool('shape', d.oKind);
    else if (d.oFill) pref.fill = d.oFill;
    else if (d.oNote) pref.note = d.oNote;
    else if (d.oRoute) pref.route = d.oRoute;
    else if (d.oArrow) pref.arrow = d.oArrow;
    else if (d.oText) pref.text = d.oText;
    try { localStorage.setItem('wbPref', JSON.stringify(pref)); } catch (err) {}
    paintOpts();
}
function onAct(act) {
    if (act === 'tpl') { togglePop('tpl'); return paintTplPop(); }
    if (act === 'more') return togglePop('more');
    if (act === 'help') return togglePop('help');
    closePops();
    if (act === 'present') return togglePresent();
    if (act === 'follow') { following = true; applyPresentView(); return paintFollow(); }
    if (act === 'unfollow') { following = false; return paintFollow(); }
    if (act === 'undo') return undo();
    if (act === 'redo') return redo();
    if (act === 'zin') return zoomAt(W / 2, H / 2, 1.25);
    if (act === 'zout') return zoomAt(W / 2, H / 2, 0.8);
    if (act === 'z100') return zoomAt(W / 2, H / 2, 1 / view.z);
    if (act === 'fit') { userMovedView(); return fitAll(); }
    if (act === 'png') return exportPng();
    if (act === 'chat') return sendToChat();
    if (act === 'clear') return clearBoard();
}

// ---------- Bàn phím ----------
function onKey(e) {
    if (!visible()) return;
    const t = e.target;
    if (isTyping(t)) return;
    if (t !== document.body && t !== document.documentElement && !root.contains(t)) return;
    if (document.querySelector('.rm-modal:not(.hidden), #rm-lightbox.on')) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (e.key === '?' || (mod && k === 'k')) return;               // bảng phím tắt / tìm câu của phòng
    // Từ đây: nuốt phím để phím tắt của màn làm đề (1-9, A-D, N, S, mũi tên…) không chạy khi đang ở bảng
    e.stopPropagation();
    let handled = true;
    if (mod && k === 'z') e.shiftKey ? redo() : undo();
    else if (mod && k === 'y') redo();
    else if (mod && k === 'a') { setTool('select'); sel = new Set(sorted().filter(o => !o._tmp).map(o => o.id)); paintSelBar(true); }
    else if (mod && k === 'd') duplicate();
    else if (mod && (k === '=' || k === '+')) zoomAt(W / 2, H / 2, 1.25);
    else if (mod && k === '-') zoomAt(W / 2, H / 2, 0.8);
    else if (mod && k === '0') zoomAt(W / 2, H / 2, 1 / view.z);
    else if (mod || e.altKey) handled = false;                      // Ctrl C / X / V: để sự kiện copy / paste chạy
    else if (e.key === '!' || (e.shiftKey && e.code === 'Digit1')) { userMovedView(); fitAll(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') delSel();
    else if (e.key === 'Escape') { if (sel.size) sel.clear(); else setTool('select'); closePops(); }
    else if (e.key === 'Enter' && sel.size === 1) { const o = selObjs()[0]; if (hasText(o)) startEdit(o); }
    else if (e.key.startsWith('Arrow') && sel.size) {
        const s = e.shiftKey ? 10 : 1, dx = e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0, dy = e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0;
        applyToSel(o => { if (o.type === 'arrow') return false; o.x = r1(o.x + dx); o.y = r1(o.y + dy); }, ['x', 'y']);
    } else if (e.key === ' ') { if (!spaceDown) { spaceDown = true; setCursor(); } }
    // Khối / note còn TRỐNG đang chọn: gõ luôn là điền chữ. Đã có chữ thì phải Enter / bấm đúp — kẻo lỡ tay thay mất.
    else if (sel.size === 1 && e.key.length === 1 && hasText(selObjs()[0]) && !selObjs()[0].txt) startEdit(selObjs()[0], e.key);
    else if (KEY_KIND[k]) setTool('shape', KEY_KIND[k]);
    else if (KEY_TOOL[k]) setTool(KEY_TOOL[k]);
    else handled = false;
    if (handled) e.preventDefault();
    paintSelBar();
}

// ---------- Khởi tạo ----------
export function initWhiteboard({ root: el, roomId: rid, user }) {
    if (!el || !rid) return null;
    root = el; roomId = rid; me = user?.uid || room.user?.uid || 'anon';
    try { Object.assign(pref, JSON.parse(localStorage.getItem('wbPref') || '{}')); } catch (e) {}
    buildUI();
    paintUndo(); paintOpts();

    const ro = new ResizeObserver(() => {
        const r = wrap.getBoundingClientRect();
        const nw = Math.round(r.width), nh = Math.round(r.height);
        dpr = window.devicePixelRatio || 1;
        if (!nw || !nh) { W = H = 0; return; }
        if (W && H && (nw !== W || nh !== H)) {            // giữ nguyên tâm khung nhìn khi đổi khổ
            const c = toWorld(W / 2, H / 2);
            view.x = c.x - nw / 2 / view.z; view.y = c.y - nh / 2 / view.z;
        }
        W = nw; H = nh;
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        tryFit();
        if (present && following) applyPresentView();
        viewChanged(false);
        paintOpts();
        draw();
        if (editing) keepInView();
    });
    ro.observe(wrap);

    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    cv.addEventListener('pointerleave', () => { if (!drag && hover) { hover = null; schedule(); } });
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    wrap.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); wrap.classList.add('is-drop'); } });
    wrap.addEventListener('dragleave', () => wrap.classList.remove('is-drop'));
    wrap.addEventListener('drop', (e) => {
        wrap.classList.remove('is-drop');
        const files = imageFilesOf(e.dataTransfer);
        if (!files.length) return;
        e.preventDefault(); e.stopPropagation();
        const { sx, sy } = evPt(e);
        insertImages(files, toWorld(sx, sy));
    });

    ed.addEventListener('keydown', (e) => {
        e.stopPropagation();
        const o = objs.get(editing?.id);
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); endEdit(); return; }
        if (e.key === 'Enter' && !e.shiftKey && o && (o.type === 'shape' || o.type === 'arrow')) { e.preventDefault(); endEdit(); return; }
        if (e.key === 'Tab' && o && canLink(o)) { e.preventDefault(); endEdit(); spawnAt(o, e.shiftKey ? 'b' : 'r'); }
    });
    ed.addEventListener('input', () => {
        const o = objs.get(editing?.id);
        if (!o) return;
        o.txt = ed.value; invalidate(o);
        growNote(o);
        placeEditor(); paintSelBar(); schedule();
        // người khác thấy chữ hiện dần (ghi thưa, không vào hoàn tác)
        clearTimeout(liveT);
        liveT = setTimeout(() => { if (editing?.id === o.id) commit([['upd', o.id, { txt: ed.value, ...(o.type === 'note' ? { h: o.h } : {}) }]]); }, 900);
    });
    ed.addEventListener('blur', () => setTimeout(() => { if (editing && document.activeElement !== ed) endEdit(); }, 0));
    // Đang gõ mà bấm lên bảng: giữ tiêu điểm ở ô gõ (onDown tự quyết định gõ tiếp hay kết thúc)
    cv.addEventListener('mousedown', (e) => { if (editing) e.preventDefault(); });
    window.visualViewport?.addEventListener('resize', () => { if (editing) keepInView(); });

    root.addEventListener('click', (e) => {
        const tb = e.target.closest('.wb-tool');
        if (tb) return setTool(tb.dataset.tool);
        const tp = e.target.closest('[data-tpl]');
        if (tp) return insertTemplate(tp.dataset.tpl);
        const pp = e.target.closest('button[data-paper]');
        if (pp) return setPaper(pp.dataset.paper);
        if (e.target.closest('.wb-selbar')) return onSelBar(e);
        if (e.target.closest('.wb-opts')) return onOpts(e);
        const a = e.target.closest('[data-act]');
        if (a) return onAct(a.dataset.act);
    });
    // thanh chọn: giữ tiêu điểm ô đang gõ khi bấm nút (đổi màu lúc đang sửa chữ)
    $('.wb-selbar').addEventListener('pointerdown', (e) => { if (editing) e.preventDefault(); });
    document.addEventListener('pointerdown', (e) => { if (visible() && !e.target.closest?.('.wb-pop, .wb-top')) closePops(); }, true);
    fileIn.addEventListener('change', () => { const f = [...fileIn.files]; fileIn.value = ''; if (f.length) insertImages(f); });

    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', (e) => { if (e.key === ' ' && spaceDown) { spaceDown = false; setCursor(); } }, true);
    window.addEventListener('blur', () => { spaceDown = false; });
    window.addEventListener('copy', (e) => {
        if (!visible() || isTyping(e.target) || !sel.size) return;
        e.preventDefault();
        e.clipboardData.setData('text/plain', CLIP + JSON.stringify(clipOf(selObjs())));
        showToast(`Đã chép ${sel.size} mục.`, 'info', 1200);
    });
    window.addEventListener('cut', (e) => {
        if (!visible() || isTyping(e.target) || !sel.size) return;
        e.preventDefault();
        e.clipboardData.setData('text/plain', CLIP + JSON.stringify(clipOf(selObjs())));
        delSel();
    });
    window.addEventListener('paste', (e) => {
        if (!visible() || isTyping(e.target) || document.querySelector('.rm-modal:not(.hidden)')) return;
        const cd = e.clipboardData;
        const text = cd?.getData('text/plain') || '';
        if (text.startsWith(CLIP)) { e.preventDefault(); try { pasteList(JSON.parse(text.slice(CLIP.length))); } catch (err) {} return; }
        const imgs = imageFilesOf(cd);
        if (imgs.length) { e.preventDefault(); insertImages(imgs); return; }
        if (text.trim()) { e.preventDefault(); pasteText(text); }
    });
    // người trình bày: nhắc máy chủ mỗi 10s kẻo bị coi là đã rời; người xem: 35s không tin -> thôi theo
    const hb = setInterval(() => {
        if (presenting) sendPresent(true);
        if (present && performance.now() - presentSeen > 35000) { present = null; paintFollow(); }
    }, 10000);
    window.addEventListener('pagehide', () => { if (presenting) setDoc(dref('_present'), { type: 'present', on: 0, by: me, at: Date.now() }).catch(() => {}); });

    if (document.fonts?.ready) document.fonts.ready.then(() => { objs.forEach(invalidate); schedule(); });
    setTool('select');
    paintEmpty();

    const un = onSnapshot(collection(db, 'study_rooms', roomId, 'drawings'), onSnap, (err) => {
        console.error('[bảng trắng] mất kết nối:', err);
        showToast('Mất kết nối với bảng trắng.', 'error');
    });
    return () => { un(); clearInterval(hb); ro.disconnect(); window.removeEventListener('keydown', onKey, true); };
}
