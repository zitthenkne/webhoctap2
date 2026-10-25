import test from 'node:test';
import assert from 'node:assert/strict';
import { writeErrorMessage } from '../../../core/write-errors.js';

test('mã SDK có tiền tố vẫn nhận cùng thông báo', () => {
    for (const code of ['permission-denied', 'unauthenticated', 'not-found', 'unavailable']) {
        assert.equal(writeErrorMessage({ code: 'firestore/' + code }), writeErrorMessage({ code }));
    }
});

test('câu báo nói rõ việc gì chưa lưu, theo từng mã', () => {
    assert.match(writeErrorMessage({ code: 'permission-denied' }), /từ chối|quyền/);
    assert.match(writeErrorMessage({ code: 'unauthenticated' }), /đăng nhập/);
    assert.match(writeErrorMessage({ code: 'resource-exhausted' }), /hạn mức/);
    assert.match(writeErrorMessage({ code: 'invalid-argument' }), /invalid-argument/);   // mã lạ vẫn lộ ra để dò lỗi
    assert.match(writeErrorMessage({ code: 'not-found' }), /không còn.*chưa lưu/);
    for (const code of ['unavailable', 'deadline-exceeded', 'cancelled', 'aborted']) {
        assert.match(writeErrorMessage({ code }), /chưa lưu.*thử lưu lại/);
    }
    assert.match(writeErrorMessage({}), /chưa lưu/);
    assert.match(writeErrorMessage(null), /chưa lưu/);
    assert.match(writeErrorMessage(new Error('local failure')), /chưa lưu/);
});
