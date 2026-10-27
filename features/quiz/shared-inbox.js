// File: features/quiz/shared-inbox.js
// Chấm số trên nút "Được chia sẻ với tôi" (index.html #shared-new-badge) + một thông báo khi có mục MỚI được chia sẻ riêng cho mình.
//
// Rẻ: 2 truy vấn ĐẾM (quiz_sets + quiz_folders có sharedWith chứa email mình) — mỗi truy vấn đếm tính 1 lượt đọc / 1000 doc,
// tối đa một lần mỗi 10 phút mỗi tab (sessionStorage). "Mới" = tổng hiện tại − tổng lúc mở trang "Được chia sẻ với tôi" lần trước
// (localStorage, theo tài khoản). Đếm theo số lượng nên bỏ 1 + thêm 1 cùng lúc sẽ không báo — chấp nhận cho nhẹ.
// Email chưa xác nhận: luật không cho đọc mục chia sẻ riêng → không đếm (trang Hồ sơ nhắc xác nhận).
import { auth } from '../../core/firebase-init.js';
import { onSessionUser } from '../../core/auth-session.js';
import { countRest } from '../../core/firestore-rest.js';
import { syncLocalResults } from './local-shelf.js';

const CHECK_EVERY_MS = 10 * 60 * 1000;
const seenKey = (uid) => 'sharedSeen_' + uid;
const lastKey = (uid) => 'sharedCount_' + uid;

const read = (store, key) => { try { return JSON.parse(store.getItem(key) || 'null'); } catch (e) { return null; } };
const write = (store, key, v) => { try { store.setItem(key, JSON.stringify(v)); } catch (e) { /* hết chỗ / chế độ riêng tư: bỏ qua */ } };

/** Trang "Được chia sẻ với tôi" gọi sau khi tải xong: mọi thứ đang có coi như đã xem. */
export function markSharedSeen(uid, total) {
    if (!uid) return;
    write(localStorage, seenKey(uid), total);
    write(sessionStorage, lastKey(uid), { total, at: Date.now() });
}

async function countShared(email) {
    const where = [['sharedWith', email, 'ARRAY_CONTAINS']];
    const [sets, folders] = await Promise.all([
        countRest({ collection: 'quiz_sets', where, requireUser: true }),
        countRest({ collection: 'quiz_folders', where, requireUser: true })
    ]);
    return sets + folders;
}

function paint(n) {
    const badge = document.getElementById('shared-new-badge');
    if (!badge) return;
    badge.textContent = n > 9 ? '9+' : String(n);
    badge.classList.toggle('hidden', !(n > 0));
    const btn = document.getElementById('open-shared-with-me-btn');
    if (btn) btn.title = n > 0 ? `Được chia sẻ với tôi — ${n} mục mới` : 'Được chia sẻ với tôi';
}

let running = false;
async function check({ force = false } = {}) {
    const u = auth.currentUser;
    if (running || !u || u.isAnonymous || !u.email || !u.emailVerified || navigator.onLine === false) return;
    const uid = u.uid;
    const cached = read(sessionStorage, lastKey(uid));
    let total = cached?.total;
    running = true;
    try {
        if (force || !cached || Date.now() - cached.at > CHECK_EVERY_MS) {
            total = await countShared(u.email.toLowerCase());
            write(sessionStorage, lastKey(uid), { total, at: Date.now() });
        }
    } catch (e) {
        return;     // mạng / luật chưa deploy: im lặng, không phải tính năng chính
    } finally { running = false; }
    let seen = read(localStorage, seenKey(uid));
    if (seen == null || seen > total) {
        // Máy này chưa từng mở trang "Được chia sẻ với tôi" → mọi mục đều là mới với người dùng (seen = 0).
        // Tổng tụt dưới mốc đã xem (bị bỏ chia sẻ / tự rời) → hạ mốc xuống, để lần chia sẻ sau vẫn được báo.
        seen = seen == null ? 0 : total;
        write(localStorage, seenKey(uid), seen);
    }
    const fresh = total - seen;
    paint(fresh);
    // Báo một lần cho mỗi con số mới trong phiên này
    const noticeKey = 'sharedNoticed_' + uid;
    if (fresh > 0 && read(sessionStorage, noticeKey) !== total) {
        write(sessionStorage, noticeKey, total);
        if (document.getElementById('toast-container')) {
            import('../../core/utils.js').then(({ showToast }) =>
                showToast(`Có ${fresh} bộ đề / thư mục mới được chia sẻ cho bạn — bấm nút 👥 cạnh thư viện để xem.`, 'info', 6000)).catch(() => {});
        }
    }
}

/** Chỉ trang chủ gọi (index.html). Trang khác import markSharedSeen thì không kéo theo truy vấn đếm / thông báo. */
export function initSharedInbox() {
    onSessionUser((u) => {
        if (!u || u.offline) return paint(0);
        check();
        // Kết quả làm bài lúc còn là khách (local-shelf.js) → đẩy vào tài khoản vừa đăng nhập
        syncLocalResults(u.uid).then(n => {
            if (n > 0 && document.getElementById('toast-container')) {
                import('../../core/utils.js').then(({ showToast }) => showToast(`Đã đồng bộ ${n} lượt làm bài trên máy này vào tài khoản.`, 'success', 5000));
            }
        }).catch(() => {});
    });
    window.addEventListener('auth:verified', () => check({ force: true }));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
}
