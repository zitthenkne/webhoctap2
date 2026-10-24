import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Dùng module thật; chỉ thay I/O Firestore để giữ lượt đọc đang chờ một cách xác định.
const source = readFileSync(new URL('../quiz-study-store.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?$/gm, '').replace(/^export /gm, '');

test('cloud trả chậm không ghi đè ghi chú, màu và bia mộ vừa lưu trong lúc chờ', async () => {
    const storage = new Map();
    let finishRead;
    const pending = new Promise(resolve => { finishRead = resolve; });
    const ctx = vm.createContext({
        srsKeys: id => ({ map: 'srs_' + id }), mergeSrsMaps: (a, b) => ({ ...a, ...b }),
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
});
