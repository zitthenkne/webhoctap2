// File: features/quiz/link-progress.js
// Người mở LINK RIÊNG / NHÓM (api/link.js) làm bài xong → báo điểm cho chủ link xem "ai đã làm đề nào".
//   • Mở bộ đề từ link (quiz.html?id=…&link=<mã>, do link.html / folder.html gắn vào) → nhớ mã link của bộ đề đó trên máy.
//   • Nộp bài (chế độ thường) → POST action 'progress'. Máy chủ chỉ nhận khi máy này đang giữ link và bộ đề nằm trong phạm vi link.
// Lỗi / mất mạng thì thôi — đây chỉ là thống kê cho chủ, không ảnh hưởng kết quả làm bài của người học.
import { auth } from '../../core/firebase-init.js';
import { apiUrl } from '../../core/device-limit.js';

const KEY = (quizId) => `zlink:${quizId}`;
const DEAD = ['missing', 'expired', 'revoked', 'blocked', 'taken'];

/** Gọi khi mở trang làm bài: có ?link= thì nhớ mã link cho bộ đề này. */
export function rememberLinkToken(quizId) {
    const t = (new URLSearchParams(location.search).get('link') || '').replace(/[^\w-]/g, '').slice(0, 64);
    if (!quizId || !t) return;
    try { localStorage.setItem(KEY(quizId), t); } catch (e) { /* chế độ riêng tư → thôi */ }
}

/** Gọi sau khi nộp bài: { pct, total } + tên bộ đề. */
export function reportLinkProgress(quizId, { pct, total }, title = '') {
    return post(quizId, { action: 'progress', quizId, pct, total, title: String(title).slice(0, 200) });
}

/** Gọi khi bấm bắt đầu làm (chế độ thường): chủ link thấy "đang làm đề này từ lúc…". Không mở từ link → không gọi gì. */
export function reportLinkStart(quizId, title = '', at = Date.now()) {
    return post(quizId, { action: 'start', quizId, at, title: String(title).slice(0, 120) });
}

async function post(quizId, body) {
    let token = null;
    try { token = localStorage.getItem(KEY(quizId)); } catch (e) {}
    const u = auth.currentUser;
    if (!token || !u) return;
    try {
        const r = await fetch(apiUrl('api/link'), {
            method: 'POST', keepalive: true, cache: 'no-store',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await u.getIdToken()}` },
            body: JSON.stringify({ ...body, token })
        });
        const d = await r.json().catch(() => ({}));
        // Link đã đóng / máy bị gỡ → quên mã, lần sau khỏi gọi
        if (DEAD.includes(d.status)) { try { localStorage.removeItem(KEY(quizId)); } catch (e) {} }
    } catch (e) { /* mất mạng → thôi */ }
}
