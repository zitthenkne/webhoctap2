import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMultiAnswer, getCorrectIndexes, isAnswerCorrect, shuffleQuestionOptions } from '../quiz-helpers.js';

test('isMultiAnswer: chỉ true khi có correctAnswerIndexes không rỗng', () => {
    assert.equal(isMultiAnswer({ correctAnswerIndex: 0 }), false);
    assert.equal(isMultiAnswer({ correctAnswerIndexes: [] }), false);
    assert.equal(isMultiAnswer({ correctAnswerIndexes: [0, 2] }), true);
});

test('getCorrectIndexes: gộp cả hai quy ước, luôn sắp xếp', () => {
    assert.deepEqual(getCorrectIndexes({ correctAnswerIndex: 1 }), [1]);
    assert.deepEqual(getCorrectIndexes({ correctAnswerIndexes: [2, 0] }), [0, 2]);
});

test('isAnswerCorrect: 1 đáp án', () => {
    const q = { correctAnswerIndex: 2 };
    assert.equal(isAnswerCorrect(q, 2), true);
    assert.equal(isAnswerCorrect(q, 1), false);
    assert.equal(isAnswerCorrect(q, null), false);
});

test('isAnswerCorrect: nhiều đáp án phải khớp đúng tập (không thừa/thiếu)', () => {
    const q = { correctAnswerIndexes: [0, 2] };
    assert.equal(isAnswerCorrect(q, [2, 0]), true);   // đủ, khác thứ tự vẫn đúng
    assert.equal(isAnswerCorrect(q, [0]), false);      // thiếu
    assert.equal(isAnswerCorrect(q, [0, 1, 2]), false); // thừa
    assert.equal(isAnswerCorrect(q, []), false);
});

test('shuffleQuestionOptions: remap cả correctAnswerIndexes theo vị trí mới', () => {
    const q = { options: ['A', 'B', 'C', 'D'], correctAnswerIndexes: [0, 3] };
    for (let i = 0; i < 30; i++) {
        const s = shuffleQuestionOptions(q);
        const correctTexts = s.correctAnswerIndexes.map(idx => s.options[idx]).sort();
        assert.deepEqual(correctTexts, ['A', 'D'], 'tập đáp án đúng theo NỘI DUNG phải giữ nguyên');
        assert.equal(isAnswerCorrect(s, s.correctAnswerIndexes), true);
    }
});
