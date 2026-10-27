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
    firebase: { sign_in_provider: u.provider || 'google.com' }, auth_time: u.authTime ?? 1000
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

test('PHIÊN TIN CẬY: phiên mật khẩu (không phải Google) không đọc được đề chia sẻ', async () => {
    await assertFails(getDoc(doc(as({ ...FRIEND, provider: 'password' }), 'quiz_sets/shared')));
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

test('tạo bộ đề MỚI của mình (không chép từ đâu) luôn được', async () => {
    await assertSucceeds(setDoc(doc(as(FRIEND), 'quiz_sets/copy1'), { userId: 'friend', title: 'Chia sẻ (bản sao)', questions: [], isPublic: false }));
});
