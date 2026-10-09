import test from 'node:test';
import assert from 'node:assert/strict';
import { isHardWriteError, writeErrorMessage } from '../../../core/write-errors.js';

test('lỗi bị từ chối là HARD (phải báo người dùng)', () => {
    for (const code of ['permission-denied', 'unauthenticated', 'invalid-argument', 'failed-precondition', 'already-exists', 'resource-exhausted']) {
        assert.equal(isHardWriteError({ code }), true, code);
        assert.equal(isHardWriteError({ code: 'firestore/' + code }), true, 'firestore/' + code);   // SDK bản cũ gắn tiền tố
    }
});

test('lỗi mạng / bản ghi biến mất KHÔNG phải HARD (vẫn bị nuốt, ghi sẽ tự gửi lại)', () => {
    for (const code of ['unavailable', 'deadline-exceeded', 'cancelled', 'not-found', 'aborted', 'internal', 'unknown']) {
        assert.equal(isHardWriteError({ code }), false, code);
    }
    assert.equal(isHardWriteError(null), false);
    assert.equal(isHardWriteError(undefined), false);
    assert.equal(isHardWriteError(new Error('Failed to get document because the client is offline.')), false);
});

test('câu báo nói rõ việc gì chưa lưu, theo từng mã', () => {
    assert.match(writeErrorMessage({ code: 'permission-denied' }), /từ chối|quyền/);
    assert.match(writeErrorMessage({ code: 'unauthenticated' }), /đăng nhập/);
    assert.match(writeErrorMessage({ code: 'resource-exhausted' }), /hạn mức/);
    assert.match(writeErrorMessage({ code: 'invalid-argument' }), /invalid-argument/);   // mã lạ vẫn lộ ra để dò lỗi
    assert.match(writeErrorMessage({}), /chưa lưu/);
});
