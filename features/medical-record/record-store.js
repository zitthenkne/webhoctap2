// record-store.js — nguồn dữ liệu duy nhất cho bệnh án.
// localStorage = bản chính (đọc/ghi tức thì, offline OK).
// Firestore    = bản sao lưu để dùng chung nhiều máy; ghi kiểu "best-effort",
//                lỗi mạng chỉ log chứ không chặn thao tác của người dùng.

import { db } from '../../core/firebase-init.js';
// Phiên có nhớ: mất mạng / token hết hạn thì Firebase trả null, auth-session trả
// lại danh tính đã lưu để bệnh án không bị coi là "khách" rồi ngưng ghi cloud.
import { onSessionUser, sessionUser } from '../../core/auth-session.js';
import { collection, query, where, getDocs, doc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
// Ghi không treo khi mất mạng (xem core/offline-write.js)
import { setDocQ as setDoc, deleteDocQ as deleteDoc } from "../../core/offline-write.js";

const KEY = 'medicalRecords';
const COL = 'medical_records';

/* ---------- localStorage ---------- */

export function listLocal() {
    try {
        const arr = JSON.parse(localStorage.getItem(KEY)) || [];
        return Array.isArray(arr) ? arr : [];
    } catch { return []; }
}

function writeLocal(records) {
    try {
        localStorage.setItem(KEY, JSON.stringify(records));
    } catch (e) {
        // Hết dung lượng: báo rõ thay vì im lặng mất dữ liệu
        alert('Không lưu được: bộ nhớ trình duyệt đã đầy. Hãy xóa bớt bệnh án cũ hoặc xuất file sao lưu.');
        throw e;
    }
    return records;
}

export function getRecord(id) {
    return listLocal().find(r => String(r.id) === String(id)) || null;
}

export function sortRecords(records) {
    return records.slice().sort((a, b) =>
        String(b.lastUpdated || '').localeCompare(String(a.lastUpdated || '')));
}

/* ---------- tài khoản ---------- */

let currentUid = null;
const readyWaiters = [];
let authResolved = false;

// Bệnh án đã lưu trong lúc chưa có tài khoản: nhớ lại để đăng nhập xong đẩy lên
// ngay, khỏi phải chờ lần syncFromCloud kế tiếp (người dùng có khi không mở lại
// danh sách bệnh án nữa).
const localOnly = new Set();

onSessionUser(user => {
    currentUid = user ? user.uid : null;
    authResolved = true;
    while (readyWaiters.length) readyWaiters.shift()(currentUid);
    if (currentUid && localOnly.size) {
        const ids = [...localOnly];
        localOnly.clear();
        const byId = new Map(listLocal().map(r => [String(r.id), r]));
        ids.forEach(id => { const rec = byId.get(id); if (rec) writeCloud(currentUid, rec); });
    }
});

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

/* ---------- đồng bộ ---------- */

/**
 * Trộn bệnh án trên cloud vào localStorage: bản nào lastUpdated mới hơn thì thắng.
 * Trả về danh sách đã trộn (đã sắp xếp). Không đăng nhập / lỗi mạng => trả bản local.
 */
export async function syncFromCloud() {
    const uid = await whenAuthReady();
    if (!uid) return sortRecords(listLocal());

    const local = listLocal();
    const byId = new Map(local.map(r => [String(r.id), r]));
    const remoteState = new Map();   // id -> lastUpdated trên cloud

    try {
        const snap = await getDocs(query(collection(db, COL), where('userId', '==', uid)));
        snap.forEach(d => {
            const remote = d.data().record;
            if (!remote || !remote.id) return;
            remoteState.set(String(remote.id), String(remote.lastUpdated || ''));
            const mine = byId.get(String(remote.id));
            if (!mine || String(remote.lastUpdated || '') > String(mine.lastUpdated || '')) {
                byId.set(String(remote.id), remote);
            }
        });
    } catch (e) {
        console.warn('[benh-an] không tải được bản cloud:', e);
        return sortRecords(local);
    }

    const merged = sortRecords([...byId.values()]);
    writeLocal(merged);
    // Chỉ đẩy lên bệnh án cloud chưa có hoặc đang cũ hơn bản ở máy này
    pushMissing(uid, merged, remoteState);
    return merged;
}

async function pushMissing(uid, records, remoteState) {
    for (const rec of records) {
        const onCloud = remoteState.get(String(rec.id));
        if (onCloud !== undefined && onCloud >= String(rec.lastUpdated || '')) continue;
        try {
            await setDoc(doc(db, COL, docIdOf(uid, rec.id)), {
                userId: uid, recordId: String(rec.id),
                lastUpdated: rec.lastUpdated || '', record: rec
            });
        } catch (e) { console.warn('[benh-an] đẩy lên cloud lỗi:', e); }
    }
}

/* ---------- CRUD ---------- */

// Trang viết bệnh án tự động lưu liên tục khi người dùng gõ. localStorage ghi
// ngay mỗi lần, còn Firestore thì gom lại: chỉ ghi sau khi ngừng gõ CLOUD_DELAY ms,
// tránh mỗi giây một lượt ghi lên mạng. Nếu đóng tab trước khi kịp ghi thì lần
// syncFromCloud sau sẽ tự đẩy lên (bản ở máy mới hơn bản trên cloud).
const CLOUD_DELAY = 4000;
const pendingCloud = new Map();   // id -> { timer, record }

async function writeCloud(uid, record) {
    if (!uid) return false;
    try {
        await setDoc(doc(db, COL, docIdOf(uid, record.id)), {
            userId: uid, recordId: String(record.id),
            lastUpdated: record.lastUpdated || '', record
        });
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
    record.lastUpdated = new Date().toISOString();
    const records = listLocal();
    const idx = records.findIndex(r => String(r.id) === String(record.id));
    if (idx >= 0) records[idx] = record; else records.push(record);
    writeLocal(records);

    const uid = await whenAuthReady();
    if (!uid) { localOnly.add(String(record.id)); return { cloud: false }; }
    queueCloud(uid, JSON.parse(JSON.stringify(record)));
    return { cloud: true };
}

export async function deleteRecord(id) {
    // Hủy bản đang chờ ghi, không thì nó ghi lại bệnh án vừa xóa
    const key = String(id);
    clearTimeout(pendingCloud.get(key)?.timer);
    pendingCloud.delete(key);

    localOnly.delete(key);
    writeLocal(listLocal().filter(r => String(r.id) !== key));
    const uid = await whenAuthReady();
    if (!uid) return;
    try { await deleteDoc(doc(db, COL, docIdOf(uid, id))); }
    catch (e) { console.warn('[benh-an] xóa cloud lỗi:', e); }
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

/** Nhập từ file JSON, trộn theo lastUpdated. Trả về số bệnh án thêm/cập nhật. */
export async function importJson(file) {
    const incoming = JSON.parse(await file.text());
    if (!Array.isArray(incoming)) throw new Error('File không đúng định dạng bệnh án.');
    const byId = new Map(listLocal().map(r => [String(r.id), r]));
    let n = 0;
    for (const rec of incoming) {
        if (!rec || !rec.id) continue;
        const mine = byId.get(String(rec.id));
        if (!mine || String(rec.lastUpdated || '') > String(mine.lastUpdated || '')) {
            byId.set(String(rec.id), rec); n++;
        }
    }
    const merged = sortRecords([...byId.values()]);
    writeLocal(merged);
    const uid = await whenAuthReady();
    if (uid) pushMissing(uid, merged, new Map());
    return n;
}
