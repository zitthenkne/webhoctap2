import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { hash64 } from '../quiz-attempt.js';

// Dùng module thật; chỉ thay I/O Firestore để giữ lượt đọc đang chờ một cách xác định.
const source = readFileSync(new URL('../quiz-study-store.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?$/gm, '').replace(/^export /gm, '');

// Một "cloud" giả: doc quiz_study trong bộ nhớ, setDoc merge gộp sâu như Firestore (deleteField xóa khóa).
function makeCloud() {
    const DEL = { __del: true };
    let data = null;
    const mergeDeep = (dst, src) => {
        Object.entries(src).forEach(([k, v]) => {
            if (v === DEL) delete dst[k];
            else if (v && typeof v === 'object' && !Array.isArray(v) && !(v.__ts)) { dst[k] = dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k]) ? dst[k] : {}; mergeDeep(dst[k], v); }
            else dst[k] = v;
        });
    };
    return {
        DEL,
        get: () => Promise.resolve({ exists: () => !!data, data: () => JSON.parse(JSON.stringify(data)) }),
        set: (_ref, v) => { data = data || {}; mergeDeep(data, JSON.parse(JSON.stringify(v, (k, x) => (x === DEL ? '__DEL__' : x)), (k, x) => (x === '__DEL__' ? DEL : x))); return Promise.resolve(); },
        seed: (v) => { data = v; },
        raw: () => data,
    };
}
// Một "máy": localStorage riêng + module riêng, cùng nói chuyện với một cloud
function makeDevice(cloud) {
    const storage = new Map();
    const ctx = vm.createContext({
        srsKeys: id => ({ map: 'srs_' + id }), mergeSrsMaps: (a, b) => ({ ...a, ...b }), readSrsMeta: () => ({}), summarizeSrs: () => ({}),
        hash64, deleteField: () => cloud.DEL, serverTimestamp: () => ({ __ts: 1 }),
        makeCoalescer: () => ({ call() {}, flush() {}, cancel() {} }),
        db: {}, doc: () => ({}), getDoc: () => cloud.get(), setDoc: (ref, v) => cloud.set(ref, v),
        localStorage: { getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
        console,
    });
    vm.runInContext(source, ctx);
    return vm.runInContext('({ syncPullStudy, writeLocalStudy, readLocalStudy, pushCloudStudy })', ctx);
}

test('cloud trả chậm không ghi đè ghi chú, màu và bia mộ vừa lưu trong lúc chờ', async () => {
    const storage = new Map();
    let finishRead;
    const pending = new Promise(resolve => { finishRead = resolve; });
    const ctx = vm.createContext({
        srsKeys: id => ({ map: 'srs_' + id }), mergeSrsMaps: (a, b) => ({ ...a, ...b }), hash64,
        db: {}, doc: () => ({}), getDoc: () => pending,
        localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) }
    });
    vm.runInContext(source, ctx);
    const { syncPullStudy, writeLocalStudy, readLocalStudy } = vm.runInContext('({ syncPullStudy, writeLocalStudy, readLocalStudy })', ctx);
    const old = { id: 'existing', scope: 'q', type: 'note', text: 'cụm từ', start: 0, end: 6, note: 'bản cũ', ts: 1 };
    const deleted = { ...old, id: 'deleted', start: 8, end: 10 };
    writeLocalStudy('test', { annotations: { q: [old, deleted] } });
    const pulling = syncPullStudy('user', 'test');
    const edited = { ...old, note: 'bản vừa sửa', color: '#aabbcc', inkColor: '#13579b', ts: 3 };
    const added = { ...old, id: 'new', start: 12, end: 18, note: 'ghi chú mới', ts: 4 };
    writeLocalStudy('test', { annotations: { q: [edited, added] }, annotDel: { deleted: Date.now() } });
    finishRead({ exists: () => true, data: () => ({ annotations: [{ q: 'q', items: [old, deleted] }] }) });
    await pulling;
    const actual = JSON.parse(JSON.stringify(readLocalStudy('test')));
    assert.deepEqual(actual.annotations.q, [edited, added]);
    assert.ok(actual.annotDel.deleted);
    assert.ok(storage.get('quiz_study_base_test'), 'đã ghi bản gốc sau khi kéo');
});

test('A xóa một ghi chú lúc offline, B sửa ghi chú khác — có mạng lại (thứ tự nào cũng được) giữ cả hai thao tác', async () => {
    for (const order of ['A trước', 'B trước']) {
        const cloud = makeCloud();
        cloud.seed({ userId: 'u', quizId: 'z', notes: [{ q: 'Câu X', text: 'ghi X' }, { q: 'Câu Y', text: 'ghi Y' }], marks: [{ q: 'Câu X', reason: 'hard' }] });
        const A = makeDevice(cloud), B = makeDevice(cloud);
        await A.syncPullStudy('u', 'z');
        await B.syncPullStudy('u', 'z');
        // offline: A xóa X (ghi chú + đánh dấu), B sửa Y
        const a = A.readLocalStudy('z'); delete a.notes['Câu X']; delete a.marks['Câu X']; A.writeLocalStudy('z', a);
        const b = B.readLocalStudy('z'); b.notes['Câu Y'] = 'ghi Y — đã sửa'; B.writeLocalStudy('z', b);
        const first = order === 'A trước' ? A : B, second = order === 'A trước' ? B : A;
        await first.pushCloudStudy('u', 'z', first.readLocalStudy('z'));
        await second.syncPullStudy('u', 'z');
        await second.pushCloudStudy('u', 'z', second.readLocalStudy('z'));
        await first.syncPullStudy('u', 'z');
        for (const dev of [A, B]) {
            const s = JSON.parse(JSON.stringify(dev.readLocalStudy('z')));
            assert.deepEqual(s.notes, { 'Câu Y': 'ghi Y — đã sửa' }, order);
            assert.deepEqual(s.marks, {}, order);
        }
        const raw = cloud.raw();
        assert.equal(raw.notes, undefined, 'mảng đời cũ đã gỡ sau lần đẩy đầu');
        assert.ok(raw.nx && Object.values(raw.nx).some(e => e.q === 'Câu X' && e.t === null), 'giữ dấu xóa của X');
    }
});

test('lần đẩy chỉ gửi bản ghi vừa đổi', async () => {
    const cloud = makeCloud();
    const A = makeDevice(cloud);
    const sent = [];
    const orig = cloud.set;
    cloud.set = (ref, v) => { sent.push(v); return orig(ref, v); };
    A.writeLocalStudy('z', { notes: { q1: 'một', q2: 'hai' } });
    await A.pushCloudStudy('u', 'z', A.readLocalStudy('z'));
    const s = A.readLocalStudy('z'); s.notes.q2 = 'hai sửa'; A.writeLocalStudy('z', s);
    await A.pushCloudStudy('u', 'z', A.readLocalStudy('z'));
    assert.equal(Object.keys(sent[1].nx).length, 1);
    assert.equal(Object.values(sent[1].nx)[0].t, 'hai sửa');
    await A.pushCloudStudy('u', 'z', A.readLocalStudy('z'));
    assert.equal(sent.length, 2, 'không đổi gì thì không ghi');
});
