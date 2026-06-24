// Kiểm thử các hàm thuần (không phụ thuộc DOM) trong quiz-helpers.js
// Chạy: node --test  (từ thư mục webhoctap2)
//
// Tập trung vào shuffleQuestionOptions — chỗ dễ vỡ nhất (remap correctAnswerIndex
// + optionExplanations phải đồng bộ; nếu sai sẽ chấm sai hết hoặc lệch 1 ô).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shuffleQuestionOptions, convertScoreToGPA, shuffleArray } from '../quiz-helpers.js';

function makeQuestion() {
    return {
        question: 'Thủ đô của Việt Nam?',
        answers: ['Hà Nội', 'Huế', 'Đà Nẵng', 'TP.HCM'],
        options: ['Hà Nội', 'Huế', 'Đà Nẵng', 'TP.HCM'],
        correctAnswerIndex: 0,
        optionExplanations: ['Đúng: là thủ đô', 'Sai: cố đô', 'Sai: thành phố biển', 'Sai: TP lớn nhất'],
        note: 'ghi nhớ', explanation: 'vì sao', expanded: 'mở rộng'
    };
}

test('shuffleQuestionOptions: không làm thay đổi object gốc', () => {
    const original = makeQuestion();
    const snapshot = JSON.stringify(original);
    shuffleQuestionOptions(original);
    assert.equal(JSON.stringify(original), snapshot, 'object gốc phải bất biến');
});

test('shuffleQuestionOptions: đáp án đúng được remap chính xác qua nhiều lần xáo', () => {
    for (let iter = 0; iter < 50; iter++) {
        const original = makeQuestion();
        const correctText = original.options[original.correctAnswerIndex];
        const correctExp = original.optionExplanations[original.correctAnswerIndex];

        const s = shuffleQuestionOptions(original);

        // Đáp án đúng (theo NỘI DUNG) phải nằm đúng vị trí correctAnswerIndex mới
        assert.equal(s.options[s.correctAnswerIndex], correctText, 'option đúng phải khớp index mới');
        assert.equal(s.answers[s.correctAnswerIndex], correctText, 'answers và options phải đồng bộ');
        // Giải thích của đáp án đúng cũng đi theo
        assert.equal(s.optionExplanations[s.correctAnswerIndex], correctExp, 'optionExplanations phải remap cùng nhịp');
    }
});

test('shuffleQuestionOptions: giữ nguyên cặp (đáp án ↔ giải thích) cho MỌI phương án', () => {
    const original = makeQuestion();
    const pairOf = {};
    original.options.forEach((opt, i) => { pairOf[opt] = original.optionExplanations[i]; });

    for (let iter = 0; iter < 50; iter++) {
        const s = shuffleQuestionOptions(makeQuestion());
        s.options.forEach((opt, i) => {
            assert.equal(s.optionExplanations[i], pairOf[opt], `cặp lệch ở "${opt}"`);
        });
        // Cùng tập phương án, không mất/không thêm
        assert.deepEqual([...s.options].sort(), [...original.options].sort());
    }
});

test('shuffleQuestionOptions: answers và options luôn cùng nội dung', () => {
    for (let iter = 0; iter < 20; iter++) {
        const s = shuffleQuestionOptions(makeQuestion());
        assert.deepEqual(s.answers, s.options);
    }
});

test('shuffleQuestionOptions: 0–1 phương án thì trả về bản sao, không lỗi', () => {
    const one = { question: 'x', options: ['A'], correctAnswerIndex: 0 };
    const r = shuffleQuestionOptions(one);
    assert.deepEqual(r.options, ['A']);
    assert.notEqual(r, one, 'phải là object mới');

    const none = { question: 'y', options: [] };
    assert.deepEqual(shuffleQuestionOptions(none).options, []);
});

test('shuffleArray: giữ nguyên độ dài và tập phần tử, không sửa mảng gốc', () => {
    const arr = [1, 2, 3, 4, 5];
    const copy = [...arr];
    const out = shuffleArray(arr);
    assert.deepEqual(arr, copy, 'mảng gốc bất biến');
    assert.equal(out.length, arr.length);
    assert.deepEqual([...out].sort((a, b) => a - b), copy);
});

test('convertScoreToGPA: các mốc điểm quy đổi đúng', () => {
    assert.deepEqual(
        { s10: convertScoreToGPA(10, 10).score10, g: convertScoreToGPA(10, 10).letterGrade },
        { s10: 10, g: 'A+' }
    );
    assert.equal(convertScoreToGPA(5, 10).score10, 4.0);
    assert.equal(convertScoreToGPA(5, 10).letterGrade, 'D');
    assert.equal(convertScoreToGPA(6, 10).score10, 5.0);
    assert.equal(convertScoreToGPA(0, 10).score10, 0);
    assert.equal(convertScoreToGPA(0, 10).letterGrade, 'F');
});

test('convertScoreToGPA: dữ liệu không hợp lệ trả về F', () => {
    assert.equal(convertScoreToGPA(5, 0).letterGrade, 'F');
    assert.equal(convertScoreToGPA(11, 10).letterGrade, 'F');
    assert.equal(convertScoreToGPA(-1, 10).letterGrade, 'F');
    assert.equal(convertScoreToGPA(NaN, 10).letterGrade, 'F');
});
