// Kiểm tra luật CHIA SẺ RIÊNG trong firestore.rules (sharedWithMe / leavesShare / validShare) trên Firestore emulator.
// Không nằm trong `npm test` (cần emulator + Java). Chạy:
//   npm i -D @firebase/rules-unit-testing firebase     (một lần)
//   npm run test:rules
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, getDocs, query, collection, where, arrayRemove, arrayUnion, getCountFromServer } from 'firebase/firestore';

let env;
const OWNER = { uid: 'owner', email: 'owner@x.test', email_verified: true };
const FRIEND = { uid: 'friend', email: 'friend@x.test', email_verified: true };
const FRIEND_UNVERIFIED = { uid: 'friend', email: 'friend@x.test', email_verified: false };
const OTHER = { uid: 'other', email: 'other@x.test', email_verified: true };

// Mặc định: phiên đăng nhập GOOGLE, auth_time = 1000 (mốc đăng nhập) — luật trustedSession() đòi cả hai + máy có trong danh sách.
const as = (u) => env.authenticatedContext(u.uid, {
    email: u.email, email_verified: u.email_verified,
    firebase: { sign_in_provider: u.provider || 'google.com' }, auth_time: u.authTime ?? 1000,
    approved: u.approved ?? true,         // custom claim do api/signup.js gắn sau khi nhập đúng mật khẩu web
    // quyền tính năng do admin bật (api/devices.js) — các test chia sẻ mặc định cho mở hết; 'default' = chưa chỉnh (không có claim)
    ...(u.feat === 'default' ? {} : { feat: u.feat ?? { quiz: true, create: true, room: true, record: true } })
}).firestore();
// Danh sách máy hợp lệ (máy chủ api/devices.js ghi) — authTimes chứa mốc đăng nhập của phiên được phép
const seedDevices = (db, uid, authTimes = [1000]) => setDoc(doc(db, `users/${uid}/private/devices`), { list: authTimes.map((a, i) => ({ id: 'd' + i, authTime: a })), authTimes });

before(async () => {
    env = await initializeTestEnvironment({
        projectId: 'demo-zitthenkne-rules',
        firestore: { rules: readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8') }
    });
});
after(() => env?.cleanup());
beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, 'quiz_sets/shared'), { userId: 'owner', title: 'Chia sẻ', isPublic: false, sharedWith: ['friend@x.test', 'other2@x.test'], sharedBy: 'Chủ' });
        await setDoc(doc(db, 'quiz_sets/private'), { userId: 'owner', title: 'Riêng', isPublic: false });
        await setDoc(doc(db, 'quiz_sets/edit'), { userId: 'owner', title: 'Sửa chung', isPublic: false, questions: [],
            sharedWith: ['friend@x.test', 'other2@x.test'], editors: ['friend@x.test'] });
        await setDoc(doc(db, 'quiz_folders/f1'), { userId: 'owner', name: 'TM', isPublic: false, sharedWith: ['friend@x.test'] });
        await seedDevices(db, 'friend');
        await seedDevices(db, 'v2');
    });
});

test('người được chia sẻ (email đã xác nhận) đọc được', async () => {
    await assertSucceeds(getDoc(doc(as(FRIEND), 'quiz_sets/shared')));
    await assertSucceeds(getDoc(doc(as(FRIEND), 'quiz_folders/f1')));
});

test('email CHƯA xác nhận thì không đọc được (chống tạo tài khoản mạo danh email)', async () => {
    await assertFails(getDoc(doc(as(FRIEND_UNVERIFIED), 'quiz_sets/shared')));
});

test('người lạ / khách không đọc được bộ riêng tư', async () => {
    await assertFails(getDoc(doc(as(OTHER), 'quiz_sets/shared')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'quiz_sets/shared')));
    await assertFails(getDoc(doc(as(FRIEND), 'quiz_sets/private')));
});

test('truy vấn + đếm "Được chia sẻ với tôi" (array-contains email mình) được phép', async () => {
    const q = query(collection(as(FRIEND), 'quiz_sets'), where('sharedWith', 'array-contains', 'friend@x.test'));
    const snap = await assertSucceeds(getDocs(q));
    assert.equal(snap.size, 1);
    await assertSucceeds(getCountFromServer(q));
});

test('truy vấn email của NGƯỜI KHÁC bị chặn', async () => {
    await assertFails(getDocs(query(collection(as(FRIEND), 'quiz_sets'), where('sharedWith', 'array-contains', 'other2@x.test'))));
});

test('người nhận tự rời chia sẻ (chỉ gỡ đúng email mình)', async () => {
    await assertSucceeds(updateDoc(doc(as(FRIEND), 'quiz_sets/shared'), { sharedWith: arrayRemove('friend@x.test') }));
});

test('người nhận KHÔNG gỡ người khác, không thêm người, không sửa nội dung', async () => {
    await assertFails(updateDoc(doc(as(FRIEND), 'quiz_sets/shared'), { sharedWith: arrayRemove('other2@x.test') }));
    await assertFails(updateDoc(doc(as(FRIEND), 'quiz_sets/shared'), { sharedWith: arrayUnion('evil@x.test') }));
    await assertFails(updateDoc(doc(as(FRIEND), 'quiz_sets/shared'), { title: 'bị sửa' }));
    await assertFails(updateDoc(doc(as(FRIEND), 'quiz_sets/shared'), { sharedWith: arrayRemove('friend@x.test'), title: 'kèm sửa' }));
});

test('chủ thêm người được; quá 50 người hoặc sharedBy quá dài bị chặn', async () => {
    await assertSucceeds(updateDoc(doc(as(OWNER), 'quiz_sets/private'), { sharedWith: arrayUnion('friend@x.test'), sharedBy: 'Chủ' }));
    const many = Array.from({ length: 51 }, (_, i) => `u${i}@x.test`);
    await assertFails(updateDoc(doc(as(OWNER), 'quiz_sets/private'), { sharedWith: many }));
    await assertFails(updateDoc(doc(as(OWNER), 'quiz_sets/private'), { sharedBy: 'x'.repeat(101) }));
});

test('Người chỉnh sửa sửa được nội dung, KHÔNG đổi được quyền / chủ / công khai', async () => {
    const ref = doc(as(FRIEND), 'quiz_sets/edit');
    await assertSucceeds(updateDoc(ref, { questions: [{ question: 'Q1' }], questionCount: 1, title: 'Tên mới', updatedAt: new Date() }));
    await assertFails(updateDoc(ref, { isPublic: true }));
    await assertFails(updateDoc(ref, { sharedWith: arrayUnion('evil@x.test') }));
    await assertFails(updateDoc(ref, { editors: arrayUnion('other2@x.test') }));
    await assertFails(updateDoc(ref, { userId: 'friend' }));
    await assertFails(updateDoc(ref, { questions: [], folderId: 'x' }));
});

test('Người xem (không trong editors) không sửa được nội dung', async () => {
    const viewer = { uid: 'v2', email: 'other2@x.test', email_verified: true };
    await assertFails(updateDoc(doc(as(viewer), 'quiz_sets/edit'), { questions: [] }));
});

test('Người chỉnh sửa rời chia sẻ: gỡ mình khỏi cả sharedWith lẫn editors', async () => {
    const ref = doc(as(FRIEND), 'quiz_sets/edit');
    await assertFails(updateDoc(ref, { sharedWith: arrayRemove('friend@x.test') }));     // còn sót trong editors → chặn
    await assertSucceeds(updateDoc(ref, { sharedWith: arrayRemove('friend@x.test'), editors: arrayRemove('friend@x.test') }));
});

test('chủ: editors phải nằm trong sharedWith; allowTakeout phải là bool', async () => {
    const ref = doc(as(OWNER), 'quiz_sets/private');
    await assertFails(updateDoc(ref, { editors: ['ghost@x.test'] }));
    await assertSucceeds(updateDoc(ref, { sharedWith: ['a@x.test'], editors: ['a@x.test'], allowTakeout: true }));
    await assertFails(updateDoc(ref, { allowTakeout: 'yes' }));
});

test('KHÓA MANG ĐI: người được chia sẻ không chép được bộ đề chưa cho mang đi (kể cả Người chỉnh sửa)', async () => {
    await assertFails(setDoc(doc(as(FRIEND), 'quiz_sets/c1'), { userId: 'friend', title: 'chép', questions: [], copiedFrom: 'shared' }));
    await assertFails(setDoc(doc(as(FRIEND), 'quiz_sets/c2'), { userId: 'friend', title: 'chép', questions: [], copiedFrom: 'edit' }));
});

test('chủ bật "cho mang đề đi" thì chép được; chủ tự nhân bản luôn được', async () => {
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'quiz_sets/shared'), { allowTakeout: true }));
    await assertSucceeds(setDoc(doc(as(FRIEND), 'quiz_sets/c3'), { userId: 'friend', title: 'chép', questions: [], copiedFrom: 'shared' }));
    await assertSucceeds(setDoc(doc(as(OWNER), 'quiz_sets/c4'), { userId: 'owner', title: 'nhân bản', questions: [], copiedFrom: 'private' }));
});

test('khách (chưa đăng nhập) đọc được bộ đề công khai', async () => {
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'quiz_sets/pub'), { userId: 'owner', title: 'Công khai', isPublic: true }));
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'quiz_sets/pub')));
});

test('ADMIN: chỉ vietthanhne@gmail.com (đã xác nhận) sửa được config/access; ai đăng nhập cũng đọc được', async () => {
    const ADMIN = { uid: 'admin', email: 'vietthanhne@gmail.com', email_verified: true };
    const FAKE_ADMIN = { uid: 'fake', email: 'vietthanhne@gmail.com', email_verified: false };
    await assertSucceeds(setDoc(doc(as(ADMIN), 'config/access'), { deviceExempt: ['friend@x.test'] }));
    await assertFails(setDoc(doc(as(FAKE_ADMIN), 'config/access'), { deviceExempt: ['evil@x.test'] }));
    await assertFails(setDoc(doc(as(FRIEND), 'config/access'), { deviceExempt: ['friend@x.test'] }));
    await assertSucceeds(getDoc(doc(as(FRIEND), 'config/access')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'config/access')));
});

test('danh sách thiết bị: chủ tài khoản ĐỌC được nhưng KHÔNG ghi được (chỉ máy chủ ghi); người khác không đọc', async () => {
    await assertSucceeds(getDoc(doc(as(FRIEND), 'users/friend/private/devices')));
    await assertFails(setDoc(doc(as(FRIEND), 'users/friend/private/devices'), { list: [], authTimes: [1000, 2000, 3000] }));
    await assertFails(getDoc(doc(as(OTHER), 'users/friend/private/devices')));
});

test('PHIÊN TIN CẬY: phiên mật khẩu thường không đọc được đề chia sẻ; nhưng tài khoản đặc biệt (deviceExempt) thì đọc được', async () => {
    await assertFails(getDoc(doc(as({ ...FRIEND, provider: 'password' }), 'quiz_sets/shared')));
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'config/access'), { deviceExempt: ['friend@x.test'] }));
    await assertSucceeds(getDoc(doc(as({ ...FRIEND, provider: 'password' }), 'quiz_sets/shared')));
});

test('PHIÊN TIN CẬY: máy bị đẩy ra (auth_time không còn trong danh sách) không đọc được đề chia sẻ', async () => {
    await assertFails(getDoc(doc(as({ ...FRIEND, authTime: 999 }), 'quiz_sets/shared')));
    await assertFails(getDocs(query(collection(as({ ...FRIEND, authTime: 999 }), 'quiz_sets'), where('sharedWith', 'array-contains', 'friend@x.test'))));
});

test('LINK CÓ HẠN: còn hạn thì khách mở được, quá hạn thì không; không ai liệt kê được đề công khai', async () => {
    const { Timestamp } = await import('firebase/firestore');
    await env.withSecurityRulesDisabled(async ctx => {
        const db = ctx.firestore();
        await setDoc(doc(db, 'quiz_sets/alive'), { userId: 'owner', title: 'Còn hạn', isPublic: true, publicUntil: Timestamp.fromMillis(Date.now() + 3600e3) });
        await setDoc(doc(db, 'quiz_sets/dead'), { userId: 'owner', title: 'Hết hạn', isPublic: true, publicUntil: Timestamp.fromMillis(Date.now() - 1000) });
    });
    const guest = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(guest, 'quiz_sets/alive')));
    await assertFails(getDoc(doc(guest, 'quiz_sets/dead')));
    await assertFails(getDocs(query(collection(guest, 'quiz_sets'), where('isPublic', '==', true))));
    await assertFails(getDocs(query(collection(as(OTHER), 'quiz_sets'), where('isPublic', '==', true))));
});

test('ADMIN tra cứu: đọc users + thiết bị + lịch sử của người khác; người thường thì không', async () => {
    const ADMIN = { uid: 'admin', email: 'vietthanhne@gmail.com', email_verified: true };
    await env.withSecurityRulesDisabled(async ctx => {
        const db = ctx.firestore();
        await setDoc(doc(db, 'users/friend'), { email: 'friend@x.test' });
        await setDoc(doc(db, 'users/friend/private/devices'), { list: [{ id: 'a', at: 1 }] });
        await setDoc(doc(db, 'users/friend/private/logins'), { list: [{ at: 1, city: 'Hanoi' }] });
    });
    await assertSucceeds(getDocs(query(collection(as(ADMIN), 'users'), where('email', '==', 'friend@x.test'))));
    await assertSucceeds(getDoc(doc(as(ADMIN), 'users/friend/private/logins')));
    // Ghi danh sách máy / lịch sử: chỉ máy chủ (api/devices.js adminRemove) — kể cả admin cũng không ghi thẳng từ app
    await assertFails(setDoc(doc(as(ADMIN), 'users/friend/private/devices'), { list: [] }));
    await assertFails(setDoc(doc(as(ADMIN), 'users/friend/private/logins'), { list: [] }));
    await assertFails(getDocs(query(collection(as(OTHER), 'users'), where('email', '==', 'friend@x.test'))));
});

test('users/{uid}.email: không ghi được email của người khác', async () => {
    await assertSucceeds(setDoc(doc(as(FRIEND), 'users/friend'), { email: 'friend@x.test' }));
    await assertFails(setDoc(doc(as(FRIEND), 'users/friend'), { email: 'vietthanhne@gmail.com' }));
    await assertSucceeds(updateDoc(doc(as(FRIEND), 'users/friend'), { avatarAnimal: '🐱' }));
});

test('TÀI KHOẢN CHƯA DUYỆT (chưa nhập đúng mật khẩu web): không tạo được bộ đề / thư mục / ảnh / bệnh án / phòng', async () => {
    const NEW = { uid: 'newbie', email: 'newbie@x.test', email_verified: true, approved: false };
    const db = as(NEW);
    await assertFails(setDoc(doc(db, 'quiz_sets/n1'), { userId: 'newbie', title: 'x', questions: [], isPublic: false }));
    await assertFails(setDoc(doc(db, 'quiz_folders/n1'), { userId: 'newbie', name: 'x' }));
    await assertFails(setDoc(doc(db, 'medical_records/n1'), { userId: 'newbie' }));
    await assertFails(setDoc(doc(db, 'study_rooms/n1'), { owner: 'newbie' }));
    // nhưng vẫn đọc được đề công khai và hồ sơ của chính mình
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'quiz_sets/pub2'), { userId: 'owner', title: 'Công khai', isPublic: true }));
    await assertSucceeds(getDoc(doc(db, 'quiz_sets/pub2')));
    await assertSucceeds(setDoc(doc(db, 'users/newbie'), { email: 'newbie@x.test' }));
});

test('QUYỀN TÍNH NĂNG mặc định: làm đề + học nhóm mở; tạo đề + bệnh án tắt', async () => {
    const DEF = { uid: 'friend', email: 'friend@x.test', email_verified: true, feat: 'default' };
    const db = as(DEF);
    await assertFails(setDoc(doc(db, 'quiz_sets/d1'), { userId: 'friend', title: 'x', questions: [], isPublic: false }));
    await assertFails(setDoc(doc(db, 'quiz_folders/d1'), { userId: 'friend', name: 'x' }));
    await assertFails(setDoc(doc(db, 'medical_records/d1'), { userId: 'friend' }));
    await assertSucceeds(setDoc(doc(db, 'study_rooms/d1'), { owner: 'friend' }));
    await assertSucceeds(getDoc(doc(db, 'quiz_sets/shared')));                   // đề chia sẻ riêng: cần "làm đề" (mặc định mở)
});

test('QUYỀN TÍNH NĂNG admin chỉnh: tắt làm đề → không mở được đề chia sẻ riêng; bật tạo đề / bệnh án → tạo được', async () => {
    const off = as({ ...FRIEND, feat: { quiz: false, create: true, room: false, record: true } });
    await assertFails(getDoc(doc(off, 'quiz_sets/shared')));
    await assertFails(setDoc(doc(off, 'study_rooms/f1'), { owner: 'friend' }));
    await assertSucceeds(setDoc(doc(off, 'quiz_sets/f1'), { userId: 'friend', title: 'x', questions: [], isPublic: false }));
    await assertSucceeds(setDoc(doc(off, 'medical_records/f1'), { userId: 'friend' }));
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'quiz_sets/pub3'), { userId: 'owner', title: 'Công khai', isPublic: true }));
    await assertSucceeds(getDoc(doc(off, 'quiz_sets/pub3')));                    // đề công khai: ai cũng làm được
});

test('tạo bộ đề MỚI của mình (không chép từ đâu) luôn được', async () => {
    await assertSucceeds(setDoc(doc(as(FRIEND), 'quiz_sets/copy1'), { userId: 'friend', title: 'Chia sẻ (bản sao)', questions: [], isPublic: false }));
});

test('QUIZ_RUNS: chỉ ghi doc {uid}_{máy} của mình (at = giờ máy chủ); chủ đọc được doc của mình, admin đọc hết', async () => {
    const ADMIN = { uid: 'admin', email: 'vietthanhne@gmail.com', email_verified: true };
    const { serverTimestamp, deleteDoc, query, where } = await import('firebase/firestore');
    const run = (extra = {}) => ({ uid: 'friend', email: 'friend@x.test', name: 'Bạn', device: 'dev1abc', label: 'iPhone · Safari',
        quizId: 'q1', title: 'Đề 1', mode: 'normal', state: 'doing', startedAt: Date.now(), at: serverTimestamp(), ...extra });
    await assertSucceeds(setDoc(doc(as(FRIEND), 'quiz_runs/friend_dev1abc'), run()));
    await assertSucceeds(setDoc(doc(as(FRIEND), 'quiz_runs/friend_dev1abc'), { state: 'done', pct: 80, at: serverTimestamp() }, { merge: true }));
    await assertFails(setDoc(doc(as(FRIEND), 'quiz_runs/other_dev1abc'), run()));               // doc của người khác
    await assertFails(setDoc(doc(as(FRIEND), 'quiz_runs/friend_dev2xyz'), run()));              // id không khớp máy
    await assertFails(setDoc(doc(as(FRIEND), 'quiz_runs/friend_dev1abc'), run({ uid: 'other' })));
    await assertFails(setDoc(doc(as(FRIEND), 'quiz_runs/friend_dev1abc'), run({ at: new Date(0) })));   // giả giờ
    await assertFails(setDoc(doc(as(FRIEND), 'quiz_runs/friend_dev1abc'), run({ hack: 1 })));          // trường lạ
    await assertFails(setDoc(doc(as(FRIEND), 'quiz_runs/friend_dev1abc'), run({ state: 'x' })));
    await assertFails(setDoc(doc(as(FRIEND), 'quiz_runs/friend_dev1abc'), run({ email: 'vietthanhne@gmail.com' })));   // mạo danh email
    await assertSucceeds(getDocs(query(collection(as(FRIEND), 'quiz_runs'), where('uid', '==', 'friend'))));
    await assertFails(getDocs(collection(as(OTHER), 'quiz_runs')));
    await assertSucceeds(getDocs(collection(as(ADMIN), 'quiz_runs')));
    await assertSucceeds(deleteDoc(doc(as(FRIEND), 'quiz_runs/friend_dev1abc')));
});

test('QUIZ_GUEST: khách chưa đăng nhập ghi lượt làm đề CÔNG KHAI; đề riêng / người đăng nhập / đọc thì không', async () => {
    const ADMIN = { uid: 'admin', email: 'vietthanhne@gmail.com', email_verified: true };
    const { serverTimestamp } = await import('firebase/firestore');
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'quiz_sets/pubg'), { userId: 'owner', title: 'Công khai', isPublic: true }));
    const guest = env.unauthenticatedContext().firestore();
    const g = (extra = {}) => ({ device: 'dev1abc', label: 'iPhone · Safari', quizId: 'pubg', title: 'Công khai', mode: 'normal', state: 'doing',
        startedAt: Date.now(), attempts: 1, at: serverTimestamp(), ...extra });
    await assertSucceeds(setDoc(doc(guest, 'quiz_guest/dev1abc_pubg'), g()));
    await assertSucceeds(setDoc(doc(guest, 'quiz_guest/dev1abc_pubg'), { state: 'done', pct: 70, at: serverTimestamp() }, { merge: true }));
    await assertFails(setDoc(doc(guest, 'quiz_guest/dev1abc_private'), g({ quizId: 'private' })));     // đề không công khai
    await assertFails(setDoc(doc(guest, 'quiz_guest/xxx_pubg'), g()));                                // id không khớp máy
    await assertFails(setDoc(doc(guest, 'quiz_guest/dev1abc_pubg'), g({ hack: 1 })));
    await assertFails(setDoc(doc(as(FRIEND), 'quiz_guest/dev1abc_pubg'), g()));                       // người đăng nhập dùng quiz_runs
    await assertFails(getDoc(doc(guest, 'quiz_guest/dev1abc_pubg')));
    await assertSucceeds(getDoc(doc(as(ADMIN), 'quiz_guest/dev1abc_pubg')));
});

test('ADMIN: đọc lịch sử làm đề (quiz_results) của người khác; người thường thì không; defaultLimit 1..20', async () => {
    const ADMIN = { uid: 'admin', email: 'vietthanhne@gmail.com', email_verified: true };
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'quiz_results/r1'), { userId: 'friend', quizId: 'q1', score: 1, totalQuestions: 2 }));
    await assertSucceeds(getDoc(doc(as(ADMIN), 'quiz_results/r1')));
    await assertFails(getDoc(doc(as(OTHER), 'quiz_results/r1')));
    await assertSucceeds(setDoc(doc(as(ADMIN), 'config/access'), { defaultLimit: 3 }, { merge: true }));
    await assertFails(setDoc(doc(as(ADMIN), 'config/access'), { defaultLimit: 50 }, { merge: true }));
    await assertSucceeds(setDoc(doc(as(ADMIN), 'config/announce'), { active: true, id: '1', text: 'Chào', to: [] }));
    await assertFails(setDoc(doc(as(FRIEND), 'config/announce'), { active: true, id: '2', text: 'Giả admin' }));
});

test('NHẬT KÝ QUẢN TRỊ: admin thêm / đọc được, KHÔNG sửa / xoá được; người thường không đụng tới', async () => {
    const ADMIN = { uid: 'admin', email: 'vietthanhne@gmail.com', email_verified: true };
    const { serverTimestamp, deleteDoc, updateDoc: upd } = await import('firebase/firestore');
    const entry = (by = 'vietthanhne@gmail.com') => ({ at: serverTimestamp(), by, action: 'default-limit', target: '', detail: { n: 3 } });
    await assertSucceeds(setDoc(doc(as(ADMIN), 'admin_log/a1'), entry()));
    await assertFails(setDoc(doc(as(ADMIN), 'admin_log/a2'), entry('khac@x.test')));             // ghi tên người khác
    await assertSucceeds(getDoc(doc(as(ADMIN), 'admin_log/a1')));
    await assertFails(upd(doc(as(ADMIN), 'admin_log/a1'), { action: 'sửa dấu vết' }));
    await assertFails(deleteDoc(doc(as(ADMIN), 'admin_log/a1')));
    await assertFails(getDoc(doc(as(FRIEND), 'admin_log/a1')));
    await assertFails(setDoc(doc(as(FRIEND), 'admin_log/a3'), entry('friend@x.test')));
});
