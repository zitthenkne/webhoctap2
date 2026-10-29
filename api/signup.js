// POST /api/signup — DUYỆT TÀI KHOẢN MỚI bằng mật khẩu web (2026-10-29). Header: Authorization: Bearer <ID token Firebase>.
// Body { code } (mật khẩu web) hoặc { keys } (phím tắt bí mật của chủ web, chuỗi 3 phím nối bằng dấu phẩy — như app.js).
//
// Vì sao ở máy chủ: trước đây mã băm mật khẩu web + biến `signupUnlocked` nằm trong app.js → mở DevTools là lách. Nay máy chủ kiểm rồi
// gắn custom claim `approved: true` vào tài khoản; firestore.rules (approved()) chỉ cho tài khoản đã duyệt TẠO bộ đề / thư mục / ảnh /
// bệnh án / phòng. Sai quá MAX_FAILS lần / giờ thì khóa tạm (chống dò mật khẩu web). Duyệt xong app phải getIdToken(true) để nhận claim.
const crypto = require('crypto');
const { init, verifyUser, send, readJson, setApproved } = require('./_lib/admin');

// SHA-256 của mật khẩu web / phím tắt bí mật (giữ khớp app.js — plaintext không nằm trong code)
const CODE_HASH = '5e0d128731e26b9befa3ea41f7b40422e916c87b6cac4c542af1adf331875be2';
const KEYS_HASH = '955bcbc1a840e0548bf80d0b679629c84619310a8147235bbda1e3eb2fe2bc10';
const MAX_FAILS = 8;
const WINDOW_MS = 60 * 60 * 1000;
const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');

module.exports = async function handler(req, res) {
    if (req.method === 'OPTIONS') return send(res, 200, { ok: true });
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
    try {
        const token = await verifyUser(req);
        if (token.approved === true) return send(res, 200, { ok: true, approved: true });
        const { db } = init();
        const body = await readJson(req);
        const lockRef = db.doc(`users/${token.uid}/private/signup`);
        const lock = (await lockRef.get()).data() || {};
        const recent = Date.now() - (lock.firstAt || 0) < WINDOW_MS ? (lock.fails || 0) : 0;
        if (recent >= MAX_FAILS) return send(res, 429, { error: 'Nhập sai quá nhiều lần — thử lại sau 1 giờ.' });

        const code = String(body.code || '').trim();
        const keys = String(body.keys || '');
        const ok = (code && sha(code) === CODE_HASH) || (keys && sha(keys) === KEYS_HASH);
        if (!ok) {
            await lockRef.set({ fails: recent + 1, firstAt: recent ? lock.firstAt : Date.now() });
            return send(res, 403, { error: 'Mật khẩu web không đúng.', left: MAX_FAILS - recent - 1 });
        }
        await setApproved(token.uid);
        await lockRef.delete().catch(() => {});
        return send(res, 200, { ok: true, approved: true });
    } catch (e) {
        return send(res, e.status || 500, { error: e.message || 'Lỗi máy chủ' });
    }
};
