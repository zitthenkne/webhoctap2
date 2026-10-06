// record-store.js — nguồn dữ liệu duy nhất cho bệnh án.
// localStorage = bản chính (đọc/ghi tức thì, offline OK).
// Firestore    = bản sao lưu để dùng chung nhiều máy; ghi kiểu "best-effort",
//                lỗi mạng chỉ log chứ không chặn thao tác của người dùng.

import { db } from '../../core/firebase-init.js';
// Phiên có nhớ: mất mạng / token hết hạn thì Firebase trả null, auth-session trả
// lại danh tính đã lưu để bệnh án không bị coi là "khách" rồi ngưng ghi cloud.
import { onSessionUser, sessionUser } from '../../core/auth-session.js';
import {
    collection, query, where, getDocs, getDoc, doc, onSnapshot, writeBatch, deleteField,
    setDoc as setDocRaw, deleteDoc as deleteDocRaw
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
// Ghi không treo khi mất mạng (xem core/offline-write.js)
import { queued } from "../../core/offline-write.js";
// Logic "ai thắng" khi trộn nhiều máy (thuần, kiểm thử được trong Node) + thư mục đợt thực hành
import * as S from './sync-core.js';
import { folderSync, applyFolderSync } from './folder-store.js';

const KEY = 'medicalRecords';
const COL = 'medical_records';
/* Id của bệnh án mẫu. Chép chữ thay vì import benh-an-mau.js: file đó nặng 30KB
   dữ liệu, mà record-store thì trang nào cũng nạp — phòng chờ, trang xem, trang
   viết. Đổi id thì đổi ở cả hai nơi. */
const MAU_ID = 'BA-MAU';

/* ---------- localStorage ----------

   Trước đây CẢ KHO bệnh án nằm trong một chuỗi JSON duy nhất, nên mỗi lần tự
   động lưu là stringify + ghi lại toàn bộ. Đo trên Chrome (21KB một bệnh án):

        10 bệnh án -> 3,7ms      30 bệnh án -> 12,7ms      60 bệnh án -> 31,5ms
        ghi RIÊNG một bệnh án -> 0,1-0,4ms, không đổi theo số bệnh án

   Càng viết nhiều bệnh án thì mỗi lần lưu càng lâu, trên điện thoại nhân lên
   vài lần nữa. Nay mỗi bệnh án một khóa `benhAn:<id>`, danh sách id ở
   `benhAnIds`, nên lưu là O(1 bệnh án) — viết bao nhiêu bệnh án cũng vậy.

   Khóa cũ `medicalRecords` KHÔNG xóa: bản trang cũ còn nằm trong cache Service
   Worker vẫn đọc đúng khóa đó, xóa đi là mở trang cũ thấy trống trơn. Nó được
   ghi lại lúc RỜI TRANG (mỗi phiên một lần, không nằm trong đường gõ phím) và
   được trộn ngược vào theo `lastUpdated` lúc đọc — trang cũ ghi gì trang mới
   vẫn thấy, và ngược lại. */

const REC = 'benhAn:';        // benhAn:<id> -> một bệnh án
const IDS = 'benhAnIds';      // ["BA-1","BA-2"…] danh sách id

const HET_CHO = 'Không lưu được: bộ nhớ trình duyệt đã đầy. Hãy xóa bớt bệnh án cũ hoặc xuất file sao lưu.';

/* Bản đã parse, giữ trong RAM: tự động lưu gọi listLocal() liên tục, đọc thẳng
   localStorage là parse lại cả kho mỗi lần. */
let cache = null;

function docJson(k) {
    try { return JSON.parse(localStorage.getItem(k)); } catch { return null; }
}

export function listLocal() {
    if (cache) return cache;
    const ids = docJson(IDS);
    const list = [];
    (Array.isArray(ids) ? ids : []).forEach(id => {
        const r = docJson(REC + id);
        if (r && r.id) list.push(r);
    });

    // Trộn khóa cũ: lần đầu chạy bản này, hoặc trang bản cũ vừa ghi gì đó.
    const cu = docJson(KEY);
    if (Array.isArray(cu) && cu.length) {
        const byId = new Map(list.map(r => [String(r.id), r]));
        let doi = 0;
        cu.forEach(r => {
            if (!r || !r.id) return;
            const co = byId.get(String(r.id));
            if (!co || String(r.lastUpdated || '') > String(co.lastUpdated || '')) {
                byId.set(String(r.id), r); doi++;
            }
        });
        if (doi) return writeLocal([...byId.values()]);
    }
    cache = list;
    return cache;
}

// Tab khác vừa ghi -> bản trong RAM cũ rồi.
addEventListener('storage', e => {
    if (e.key === null || e.key === KEY || e.key === IDS || String(e.key).startsWith(REC)) cache = null;
});

/** Ghi lại TOÀN BỘ kho — chỉ dùng khi trộn cloud / nhập file / xóa. */
function writeLocal(records) {
    const ids = records.map(r => String(r.id));
    try {
        const truoc = docJson(IDS);
        (Array.isArray(truoc) ? truoc : []).forEach(id => {
            if (!ids.includes(id)) localStorage.removeItem(REC + id);
        });
        records.forEach(r => localStorage.setItem(REC + r.id, JSON.stringify(r)));
        localStorage.setItem(IDS, JSON.stringify(ids));
    } catch (e) {
        cache = null;   // không chắc đã ghi được gì -> lần sau đọc lại từ đĩa
        alert(HET_CHO);
        throw e;
    }
    cache = records;
    return records;
}

/** Đường lưu nóng: chỉ đụng đúng bệnh án đang viết. */
function saveOne(record) {
    const list = listLocal();
    const i = list.findIndex(r => String(r.id) === String(record.id));
    try {
        localStorage.setItem(REC + record.id, JSON.stringify(record));
        // Danh sách id chỉ đổi khi có bệnh án MỚI, không phải mỗi lần gõ.
        if (i < 0) localStorage.setItem(IDS, JSON.stringify([...list.map(r => String(r.id)), String(record.id)]));
    } catch (e) {
        cache = null;
        alert(HET_CHO);
        throw e;
    }
    if (i >= 0) list[i] = record; else list.push(record);
    cache = list;
    return record;
}

function deleteLocal(id) {
    const list = listLocal().filter(r => String(r.id) !== String(id));
    localStorage.removeItem(REC + id);
    try { localStorage.setItem(IDS, JSON.stringify(list.map(r => String(r.id)))); }
    catch (e) { cache = null; throw e; }
    cache = list;
    return list;
}

/* Bản cho trang cũ đọc. Chỉ chạy lúc rời trang nên cái giá 30ms không rơi vào
   lúc đang gõ. Hết chỗ thì bỏ luôn bản này — bản chính đã ghi xong rồi, giữ
   thêm một bản sao chỉ tổ làm đầy bộ nhớ. */
function ghiKhoaCu() {
    if (!cache) return;
    try { localStorage.setItem(KEY, JSON.stringify(cache)); }
    catch { try { localStorage.removeItem(KEY); } catch { /* thôi vậy */ } }
}
addEventListener('pagehide', ghiKhoaCu);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') ghiKhoaCu();
});

export function getRecord(id) {
    return listLocal().find(r => String(r.id) === String(id)) || null;
}

export function sortRecords(records) {
    return records.slice().sort((a, b) =>
        String(b.lastUpdated || '').localeCompare(String(a.lastUpdated || '')));
}

/* ---------- trạng thái đồng bộ lưu ở MÁY ---------- */

const LS_DEL = 'benhAnDel';        // bia mộ bệnh án: { kid: ms } — xóa ở máy này, chờ báo cho máy khác
const LS_DIRTY = 'benhAnDirty';    // id bệnh án đã sửa mà chưa chắc đã lên cloud (đóng tab giữa chừng, mất mạng, chưa đăng nhập)
const LS_BASE = 'benhAnBase';      // { kid: lastUpdated trên cloud lần đồng bộ trước } → biết cloud có đổi hay không mà khỏi tải lại
const LS_AT = 'benhAnSyncAt';      // ms lần đồng bộ thành công gần nhất
const LS_FULL = 'benhAnFullAt';    // ms lần đồng bộ ĐẦY ĐỦ (đọc cả collection) gần nhất
const LS_PINS = 'benhAnPins';      // { kid: {on, t} } bệnh án ghim — đi theo tài khoản
const FULL_EVERY = 24 * 3600e3;    // đồng bộ nhẹ chỉ tin doc meta; mỗi ngày soát một lần cả collection (phòng máy chạy bản cũ không cập nhật meta)

const rj = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const wj = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* đầy bộ nhớ: bỏ qua, lần sau đồng bộ lại */ } };

const readDirty = () => new Set((rj(LS_DIRTY, []) || []).map(String));
const markDirty = (id) => { const d = readDirty(); d.add(String(id)); wj(LS_DIRTY, [...d]); };
const clearDirty = (ids) => { const d = readDirty(); ids.forEach(i => d.delete(String(i))); wj(LS_DIRTY, [...d]); };

/** Số bệnh án chưa lên cloud, lần đồng bộ cuối, đang online không — để trang hiện "N bản chưa lên mây" cho người dùng yên tâm */
export function syncInfo() {
    return {
        signedIn: !!currentUid,
        online: navigator.onLine !== false,
        pending: readDirty().size,
        lastSync: Number(localStorage.getItem(LS_AT)) || 0,
    };
}

/* ---------- tài khoản ---------- */

let currentUid = null;
const readyWaiters = [];
let authResolved = false;

function whenAuthReady() {
    if (authResolved) return Promise.resolve(currentUid);
    return new Promise(res => {
        readyWaiters.push(res);
        // Mạng trường/wifi chặn Firebase thì onAuthStateChanged không bao giờ chạy.
        // Sau 6 giây thôi chờ để giao diện không kẹt ở "Đang tải…" — nhưng lấy phiên
        // đã nhớ (chỉ có khi đang offline) chứ đừng vội kết luận là chưa đăng nhập.
        setTimeout(() => { if (!authResolved) res(sessionUser()?.uid || null); }, 6000);
    });
}

export function isSignedIn() { return !!currentUid; }
/** Chờ Firebase xác định xong trạng thái đăng nhập. Trả về uid hoặc null. */
export const authReady = whenAuthReady;

const docIdOf = (uid, id) => `${uid}__${String(id).replace(/\//g, '_')}`;
/* Doc "meta" của người dùng nằm CHUNG collection medical_records (có userId + kind:'meta') nên qua đúng
   luật Firestore hiện có — không phải deploy rules. Bản trang cũ đọc collection chỉ bỏ qua doc này
   (nó không có `record`). Nội dung:
     idx     { kid: lastUpdated }   mục lục bệnh án trên cloud → đồng bộ nhẹ chỉ đọc 1 doc thay vì cả kho
     del     { kid: ms }            bia mộ bệnh án đã xóa
     folders { id: thư mục+_t }  fdel { id: ms }   thư mục đợt thực hành + bia mộ
     pins    { kid: {on,t} }        bệnh án ghim */
const metaId = (uid) => `${uid}__meta`;
const metaRef = (uid) => doc(db, COL, metaId(uid));

function parseMeta(x) {
    const o = (v) => (v && typeof v === 'object' ? { ...v } : {});
    x = x || {};
    return { idx: o(x.idx), del: o(x.del), folders: o(x.folders), fdel: o(x.fdel), pins: o(x.pins) };
}

async function pool(items, n, fn) {
    const queue = [...items];
    await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => {
        while (queue.length) await fn(queue.shift());
    }));
}

/* ---------- đồng bộ ---------- */

/** Đọc CẢ collection (bệnh án + meta). Doc bệnh án mới là sự thật; idx trong meta chỉ là bản chép. */
async function readAll(uid) {
    const docs = new Map();
    let remote = parseMeta(null);
    let metaIdx = {};
    const snap = await getDocs(query(collection(db, COL), where('userId', '==', uid)));
    snap.forEach(d => {
        const x = d.data() || {};
        if (x.kind === 'meta') { remote = parseMeta(x); metaIdx = { ...(x.idx || {}) }; }
        else if (x.record && x.record.id) docs.set(S.kid(x.record.id), x.record);
    });
    const truth = {};
    docs.forEach((r, k) => { truth[k] = String(r.lastUpdated || ''); });
    remote.idx = truth;
    return { remote, docs, metaIdx };
}

let chain = Promise.resolve();
let inflightPush = null;

/**
 * Đồng bộ HAI CHIỀU, trộn THEO TỪNG TRƯỜNG (xem sync-core.js), có bia mộ cho xóa.
 *   - Mặc định ("nhẹ"): chỉ đọc 1 doc meta; chỉ tải về bệnh án mà cloud đã đổi kể từ lần trước (so `benhAnBase`),
 *     chỉ đẩy bệnh án mà máy này đã đổi. Mở trang tốn 1 lượt đọc thay vì đọc cả kho như bản cũ.
 *   - `full`: đọc cả collection, dựng lại mục lục từ doc thật. Tự chạy mỗi 24 giờ và khi bấm "Đồng bộ ngay".
 *   - `snap`: snapshot doc meta do watchCloud đưa vào (khỏi đọc lại).
 * `wait` = chờ đẩy xong mới trả về; không thì đẩy chạy ngầm cho trang hiện nhanh.
 *
 * @returns {{merged:Array, pulled:number, pushed:number, removed:number, foldersChanged:boolean, signedIn:boolean, error:any}}
 */
export function syncNow(opts = {}) {
    const p = chain.then(() => doSync(opts));
    chain = p.catch(() => {});
    return p;
}

async function doSync({ wait = false, full = false, snap = null } = {}) {
    const empty = (signedIn, error = null) => ({ merged: sortRecords(listLocal()), pulled: 0, pushed: 0, removed: 0, foldersChanged: false, signedIn, error });
    const uid = await whenAuthReady();
    if (!uid) return empty(false);
    if (inflightPush) await inflightPush.catch(() => {});

    const wantFull = full || (!snap && Date.now() - (Number(localStorage.getItem(LS_FULL)) || 0) > FULL_EVERY);
    let remote, docs = null, metaIdx = null;
    try {
        if (wantFull) ({ remote, docs, metaIdx } = await readAll(uid));
        else {
            const m = snap || await getDoc(metaRef(uid));
            if (m.exists()) remote = parseMeta(m.data());
            else ({ remote, docs, metaIdx } = await readAll(uid));      // tài khoản chưa có meta: lần đầu → đọc đủ rồi tạo meta
        }
    } catch (e) {
        console.warn('[benh-an] không tải được bản cloud:', e);
        return empty(true, e);
    }
    const isFull = !!docs;

    const local = listLocal();
    const byK = new Map(local.map(r => [S.kid(r.id), r]));
    const delLocal = S.pruneDel(rj(LS_DEL, {}));
    const delRemote = S.pruneDel(remote.del);
    const base = rj(LS_BASE, {});
    const patch = { idx: {}, del: {}, folders: {}, fdel: {}, pins: {} };
    const stats = { pulled: 0, pushed: 0, removed: 0 };
    const pushMap = new Map();               // kid -> bản cần ghi lên cloud
    const toDisk = new Map();                // kid -> bản cần ghi về máy
    const goneLocal = new Set();             // kid cần xóa ở máy
    const goneRemote = [];                   // kid cần xóa doc trên cloud

    // 1. Bia mộ: xóa thật chỉ khi KHÔNG ai sửa sau lúc xóa — sửa sau thì bệnh án sống lại
    for (const k of new Set([...Object.keys(delLocal), ...Object.keys(delRemote)])) {
        const t = Math.max(delLocal[k] || 0, delRemote[k] || 0);
        const lrec = byK.get(k);
        const lT = lrec ? S.maxTs(lrec) : 0;
        const rT = remote.idx[k] !== undefined ? S.ms(remote.idx[k]) : 0;
        if (lT > t || rT > t) {
            delete delLocal[k];
            if (delRemote[k]) { patch.del[k] = deleteField(); delete delRemote[k]; }
        } else {
            if (lrec) { byK.delete(k); goneLocal.add(k); stats.removed++; }
            if (remote.idx[k] !== undefined) { goneRemote.push(k); delete remote.idx[k]; patch.idx[k] = deleteField(); }
            if ((delRemote[k] || 0) < t) patch.del[k] = t;
            delLocal[k] = t; delRemote[k] = t;
        }
    }

    // 2. Kéo về / trộn: chỉ bệnh án mà cloud đã đổi kể từ lần đồng bộ trước (hoặc máy này chưa có)
    const need = [];
    for (const [k, rts] of Object.entries(remote.idx)) {
        const lrec = byK.get(k);
        if (!lrec) { need.push(k); continue; }
        if (String(lrec.lastUpdated || '') === rts) { base[k] = rts; continue; }
        if (base[k] === rts) { pushMap.set(k, lrec); continue; }          // cloud không đổi, chỉ máy này đổi
        need.push(k);
    }
    const got = new Map();
    try {
        if (docs) need.forEach(k => { if (docs.get(k)) got.set(k, docs.get(k)); });
        else await pool(need, 6, async (k) => {
            const d = await getDoc(doc(db, COL, docIdOf(uid, byK.get(k)?.id ?? k)));
            const r = d.exists() ? d.data().record : null;
            if (r && r.id) got.set(k, r);
        });
    } catch (e) {
        console.warn('[benh-an] không tải được bệnh án từ cloud:', e);
        return empty(true, e);
    }
    for (const k of need) {
        const R = got.get(k);
        if (!R) continue;
        const lrec = byK.get(k);
        if (!lrec) { byK.set(k, R); toDisk.set(k, R); stats.pulled++; base[k] = String(R.lastUpdated || ''); continue; }
        const m = S.mergeRecord(lrec, R);
        if (m.useB) { byK.set(k, m.record); toDisk.set(k, m.record); stats.pulled++; }
        if (m.useA) pushMap.set(k, m.record); else base[k] = String(R.lastUpdated || '');
    }
    // máy này có mà cloud chưa có (và chưa bị xóa) → đẩy lên
    for (const [k, lrec] of byK) {
        if (remote.idx[k] === undefined && !delLocal[k] && !delRemote[k]) pushMap.set(k, lrec);
    }

    // 3. Thư mục đợt thực hành + ghim: trộn LWW có bia mộ
    const fl = folderSync();
    const fDelLocal = S.pruneDel(fl.del);
    const mf = S.mergeSet(fl.items, fDelLocal, remote.folders, S.pruneDel(remote.fdel), '_t');
    const foldersChanged = mf.toLocal.set.length + mf.toLocal.remove.length > 0 || !S.same(mf.del, fDelLocal);
    if (foldersChanged) applyFolderSync(mf.items, mf.del);
    mf.toRemote.set.forEach(id => { patch.folders[id] = mf.items[id]; });
    mf.toRemote.remove.forEach(id => { patch.folders[id] = deleteField(); });
    mf.toRemote.tomb.forEach(id => { patch.fdel[id] = mf.del[id]; });
    mf.toRemote.undel.forEach(id => { patch.fdel[id] = deleteField(); });
    const mp = S.mergeSet(readPins(), {}, remote.pins, {}, 't');
    if (mp.toLocal.set.length) wj(LS_PINS, mp.items);
    mp.toRemote.set.forEach(id => { patch.pins[id] = mp.items[id]; });

    // 4. Ghi về máy (chỉ phần đổi, không ghi lại cả kho)
    goneLocal.forEach(k => { const r = local.find(x => S.kid(x.id) === k); if (r) deleteLocal(r.id); });
    toDisk.forEach(rec => saveOne(rec));
    wj(LS_DEL, delLocal);

    // 5. Ghi lên cloud
    const writes = async () => {
        if (isFull && metaIdx) {      // mục lục trong meta lệch với doc thật (máy bản cũ ghi mà không cập nhật meta) → sửa lại
            Object.keys(metaIdx).forEach(k => { if (remote.idx[k] === undefined && patch.idx[k] === undefined) patch.idx[k] = deleteField(); });
            Object.entries(remote.idx).forEach(([k, v]) => { if (metaIdx[k] !== v && patch.idx[k] === undefined) patch.idx[k] = v; });
        }
        let pushed = 0;
        const done = [];
        await pool([...pushMap.values()], 5, async (rec) => {
            try {
                await queued(setDocRaw(doc(db, COL, docIdOf(uid, rec.id)), {
                    userId: uid, recordId: String(rec.id), lastUpdated: rec.lastUpdated || '', record: JSON.parse(JSON.stringify(rec))
                }));
                const k = S.kid(rec.id);
                patch.idx[k] = String(rec.lastUpdated || '');
                base[k] = String(rec.lastUpdated || '');
                done.push(rec.id);
                pushed++;
            } catch (e) { console.warn('[benh-an] đẩy lên cloud lỗi:', e); }
        });
        await pool(goneRemote, 5, async (k) => {
            try { await queued(deleteDocRaw(doc(db, COL, docIdOf(uid, local.find(x => S.kid(x.id) === k)?.id ?? k)))); }
            catch (e) { console.warn('[benh-an] xóa cloud lỗi:', e); }
        });
        const body = {};
        for (const [name, v] of Object.entries(patch)) if (Object.keys(v).length) body[name] = v;
        if (Object.keys(body).length) {
            try { await queued(setDocRaw(metaRef(uid), { userId: uid, kind: 'meta', v: 2, at: Date.now(), ...body }, { merge: true })); }
            catch (e) { console.warn('[benh-an] ghi meta lỗi:', e); }
        }
        wj(LS_BASE, base);
        clearDirty(done);
        localStorage.setItem(LS_AT, String(Date.now()));
        if (isFull) localStorage.setItem(LS_FULL, String(Date.now()));
        return pushed;
    };
    let pushed = 0;
    if (wait) pushed = await writes();
    else { inflightPush = writes().finally(() => { inflightPush = null; }); }
    stats.pushed = pushed;

    return { merged: sortRecords(listLocal()), pulled: stats.pulled, pushed, removed: stats.removed, foldersChanged, signedIn: true, error: null };
}

/** Bản cũ chỉ cần danh sách đã trộn — giữ nguyên cho các trang đang gọi. */
export async function syncFromCloud() {
    return (await syncNow({ wait: true })).merged;
}

/**
 * Nghe doc meta: máy khác vừa lưu / xóa / đổi đợt / ghim thì ĐỒNG BỘ NGAY (không cần F5).
 * Chỉ 1 listener, và snapshot được đưa thẳng vào syncNow nên không tốn thêm lượt đọc.
 * Lượt ghi của chính máy này (hasPendingWrites) bị bỏ qua. Trả về hàm hủy.
 */
export function watchCloud(onChange) {
    let off = null, dead = false, first = true, timer = 0;
    (async () => {
        const uid = await whenAuthReady();
        if (!uid || dead) return;
        off = onSnapshot(metaRef(uid), (snap) => {
            if (first) { first = false; return; }          // lượt đầu = trạng thái hiện có, trang đã đồng bộ lúc mở
            if (snap.metadata.hasPendingWrites) return;
            clearTimeout(timer);
            timer = setTimeout(async () => {
                if (dead) return;
                const r = await syncNow({ snap, wait: true });
                if (!r.error) onChange?.(r);
            }, 350);
        }, () => { /* mất quyền / mất mạng: thôi, đã có nút Đồng bộ ngay */ });
    })();
    return () => { dead = true; clearTimeout(timer); try { off?.(); } catch { /* đã gỡ */ } };
}

/* ---------- ghi nhỏ vào meta (ghim, thư mục): gom lại vài giây rồi ghi một lần ---------- */
let metaPatch = null, metaTimer = 0;
function pushMetaSoon(part) {
    metaPatch = metaPatch || { pins: {}, folders: {}, fdel: {} };
    for (const [name, v] of Object.entries(part)) Object.assign(metaPatch[name], v);
    clearTimeout(metaTimer);
    metaTimer = setTimeout(flushMeta, 1500);
}
async function flushMeta() {
    clearTimeout(metaTimer);
    const part = metaPatch; metaPatch = null;
    if (!part) return;
    const uid = await whenAuthReady();
    if (!uid) return;                     // chưa đăng nhập: lần đồng bộ đầu sẽ trộn lên (ghim/thư mục đã nằm ở máy)
    const body = {};
    for (const [name, v] of Object.entries(part)) if (Object.keys(v).length) body[name] = v;
    if (!Object.keys(body).length) return;
    try { await queued(setDocRaw(metaRef(uid), { userId: uid, kind: 'meta', v: 2, at: Date.now(), ...body }, { merge: true })); }
    catch (e) { console.warn('[benh-an] ghi meta lỗi:', e); }
}
addEventListener('pagehide', () => { if (metaPatch) flushMeta(); });

// Sửa / xóa thư mục ở máy này → báo cloud ngay đúng thư mục đó (folder-store phát sự kiện)
addEventListener('benhan:folders', (e) => {
    const id = e.detail?.id;
    if (!id) return;
    if (e.detail.deleted) {
        const t = folderSync().del[id] || Date.now();
        pushMetaSoon({ folders: { [id]: deleteField() }, fdel: { [id]: t } });
    } else {
        const f = folderSync().items[id];
        if (f) pushMetaSoon({ folders: { [id]: f }, fdel: { [id]: deleteField() } });
    }
});

/* ---------- ghim bệnh án (đi theo tài khoản) ---------- */

function readPins() {
    let m = rj(LS_PINS, null);
    if (m) return m;
    // lần đầu: nhập danh sách ghim cũ (chỉ lưu theo máy, bản 2026-10-06 sáng)
    m = {};
    (rj('waitingRoomPins_v1', []) || []).forEach(id => { m[S.kid(id)] = { on: 1, t: 1 }; });
    wj(LS_PINS, m);
    return m;
}
export const isPinned = (id) => !!readPins()[S.kid(id)]?.on;
export function setPinned(id, on) {
    const k = S.kid(id);
    const m = readPins();
    m[k] = { on: on ? 1 : 0, t: S.stamp(m[k]?.t || 0) };
    wj(LS_PINS, m);
    pushMetaSoon({ pins: { [k]: m[k] } });
    return !!m[k].on;
}

/* ---------- CRUD ---------- */

// Trang viết bệnh án tự động lưu liên tục khi người dùng gõ. localStorage ghi
// ngay mỗi lần, còn Firestore thì gom lại: chỉ ghi sau khi ngừng gõ CLOUD_DELAY ms,
// tránh mỗi giây một lượt ghi lên mạng. Đóng tab trước khi kịp ghi thì id vẫn nằm trong
// `benhAnDirty`, lần đồng bộ sau tự đẩy lên.
const CLOUD_DELAY = 4000;
const pendingCloud = new Map();   // id -> { timer, record }

/** Ghi MỘT bệnh án + cập nhật mục lục trong meta trong cùng một mẻ (atomic, một vòng mạng) */
async function writeCloud(uid, record) {
    if (!uid) return false;
    try {
        const k = S.kid(record.id);
        const b = writeBatch(db);
        b.set(doc(db, COL, docIdOf(uid, record.id)), {
            userId: uid, recordId: String(record.id), lastUpdated: record.lastUpdated || '', record: JSON.parse(JSON.stringify(record))
        });
        // sửa sau khi từng bị xóa ở máy khác → gỡ bia mộ
        b.set(metaRef(uid), { userId: uid, kind: 'meta', v: 2, at: Date.now(), idx: { [k]: record.lastUpdated || '' }, del: { [k]: deleteField() } }, { merge: true });
        await queued(b.commit());
        const base = rj(LS_BASE, {});
        base[k] = String(record.lastUpdated || '');
        wj(LS_BASE, base);
        clearDirty([record.id]);
        localStorage.setItem(LS_AT, String(Date.now()));
        return true;
    } catch (e) {
        console.warn('[benh-an] lưu cloud lỗi:', e);
        return false;
    }
}

function queueCloud(uid, record) {
    const key = String(record.id);
    clearTimeout(pendingCloud.get(key)?.timer);
    pendingCloud.set(key, {
        record,
        timer: setTimeout(() => { pendingCloud.delete(key); writeCloud(uid, record); }, CLOUD_DELAY)
    });
}

/** Ghi ngay mọi bản đang chờ (gọi khi rời trang). */
export function flushCloud() {
    for (const [key, entry] of pendingCloud) {
        clearTimeout(entry.timer);
        writeCloud(currentUid, entry.record);
        pendingCloud.delete(key);
    }
}
window.addEventListener('pagehide', flushCloud);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushCloud();
});

export async function saveRecord(record) {
    // Bệnh án mẫu là hằng số trong mã nguồn (benh-an-mau.js): người dùng gõ thử
    // lên đó bao nhiêu cũng được, nhưng không được rơi vào kho bệnh án thật —
    // chặn ở đây một lần thay vì rải điều kiện ra từng nơi gọi saveRecord.
    if (String(record?.id) === MAU_ID) return { cloud: false, mau: true };

    // So với bản ĐÃ LƯU TRÊN ĐĨA (không phải bản trong RAM: nhiều nơi sửa thẳng đối tượng lấy từ listLocal rồi mới
    // gọi saveRecord, nên bản RAM luôn trùng với `record`). Chỉ trường thật sự đổi mới nhận dấu thời gian mới.
    const prev = docJson(REC + record.id);
    const st = S.stamp(S.maxTs(prev));
    const ts = S.touchTs(prev, record, st);
    const touched = !prev || Object.values(ts).some(v => v === st);
    if (touched) {
        record._ts = ts;
        record.lastUpdated = S.iso(st);
    } else {
        record._ts = prev._ts || ts;
        if (prev.lastUpdated) record.lastUpdated = prev.lastUpdated;
    }
    saveOne(record);
    if (!touched) return { cloud: !!currentUid, unchanged: true };
    markDirty(record.id);
    // sửa lại bệnh án đã xóa → bỏ bia mộ ở máy
    const del = rj(LS_DEL, {});
    if (del[S.kid(record.id)]) { delete del[S.kid(record.id)]; wj(LS_DEL, del); }

    const uid = await whenAuthReady();
    if (!uid) return { cloud: false };
    queueCloud(uid, JSON.parse(JSON.stringify(record)));
    return { cloud: true };
}

export async function deleteRecord(id) {
    // Hủy bản đang chờ ghi, không thì nó ghi lại bệnh án vừa xóa
    const key = String(id);
    clearTimeout(pendingCloud.get(key)?.timer);
    pendingCloud.delete(key);
    clearDirty([key]);

    // Bia mộ ở máy TRƯỚC (bền qua tắt trang / mất mạng): không có nó thì máy khác đẩy bản cũ lên lại, bệnh án "sống lại"
    const k = S.kid(id);
    const t = Date.now();
    const del = rj(LS_DEL, {});
    del[k] = t;
    wj(LS_DEL, del);
    const base = rj(LS_BASE, {});
    delete base[k];
    wj(LS_BASE, base);

    deleteLocal(key);
    const uid = await whenAuthReady();
    if (!uid) return;
    try {
        const b = writeBatch(db);
        b.delete(doc(db, COL, docIdOf(uid, id)));
        b.set(metaRef(uid), { userId: uid, kind: 'meta', v: 2, at: t, del: { [k]: t }, idx: { [k]: deleteField() } }, { merge: true });
        await queued(b.commit());
    } catch (e) { console.warn('[benh-an] xóa cloud lỗi:', e); }
}

/* ---------- sao lưu / phục hồi ---------- */

export function exportJson() {
    const records = sortRecords(listLocal());
    if (!records.length) return 0;
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `benh-an-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return records.length;
}

/** Nhập từ file JSON, trộn theo từng trường. Trả về số bệnh án thêm/cập nhật. */
export async function importJson(file) {
    const incoming = JSON.parse(await file.text());
    if (!Array.isArray(incoming)) throw new Error('File không đúng định dạng bệnh án.');
    const del = rj(LS_DEL, {});
    let n = 0;
    for (const rec of incoming) {
        if (!rec || !rec.id || String(rec.id) === MAU_ID) continue;
        const k = S.kid(rec.id);
        // File nhập vào một bệnh án đã xóa: người dùng chủ động muốn nó về → đóng dấu như vừa sửa, không thì bia mộ xóa lại
        if (del[k]) {
            const st = S.stamp(Math.max(del[k], S.maxTs(rec)));
            rec._ts = S.touchTs(null, rec, st);
            rec.lastUpdated = S.iso(st);
            delete del[k];
        }
        const mine = getRecord(rec.id);
        if (!mine) { saveOne(rec); markDirty(rec.id); n++; continue; }
        const m = S.mergeRecord(mine, rec);
        if (m.useB) { saveOne(m.record); markDirty(rec.id); n++; }
    }
    wj(LS_DEL, del);
    if (await whenAuthReady()) syncNow().catch(() => {});
    return n;
}

/* ---------- khởi động ---------- */
onSessionUser(user => {
    currentUid = user ? user.uid : null;
    authResolved = true;
    while (readyWaiters.length) readyWaiters.shift()(currentUid);
    // Đã có thay đổi làm lúc chưa đăng nhập / mất mạng → đẩy lên ngay khi có tài khoản, khỏi chờ ai mở danh sách
    if (currentUid && (readDirty().size || Object.keys(rj(LS_DEL, {})).length)) syncNow().catch(() => {});
});
// Có mạng lại: thay đổi còn treo thì đẩy luôn
addEventListener('online', () => { if (currentUid && readDirty().size) syncNow().catch(() => {}); });
