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

const as = (u) => env.authenticatedContext(u.uid, { email: u.email, email_verified: u.email_verified }).firestore();

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

test('chủ: editors phải nằm trong sharedWith; noCopy phải là bool', async () => {
    const ref = doc(as(OWNER), 'quiz_sets/private');
    await assertFails(updateDoc(ref, { editors: ['ghost@x.test'] }));
    await assertSucceeds(updateDoc(ref, { sharedWith: ['a@x.test'], editors: ['a@x.test'], noCopy: true }));
    await assertFails(updateDoc(ref, { noCopy: 'yes' }));
});

test('khách (chưa đăng nhập) đọc được bộ đề công khai', async () => {
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'quiz_sets/pub'), { userId: 'owner', title: 'Công khai', isPublic: true }));
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'quiz_sets/pub')));
});

test('người nhận lưu bản sao về thư viện của mình', async () => {
    await assertSucceeds(setDoc(doc(as(FRIEND), 'quiz_sets/copy1'), { userId: 'friend', title: 'Chia sẻ (bản sao)', questions: [], isPublic: false }));
});
