// Kiểm thử bộ "tự chữa lỗi" khi nhập bộ đề (core/quiz-autofix.js) — thuần JS, không cần DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    readVerdict, inferFromOptionExplanations, inferFromExplanationText,
    inferFromOptionMarkers, extractOptionLabels, parseCorrectValue,
    autofixQuestions, summarizeReport
} from '../../../core/quiz-autofix.js';

// --- readVerdict ------------------------------------------------------------
test('readVerdict: bắt đúng/sai kể cả khi gõ không dấu', () => {
    assert.equal(readVerdict('Đúng vì đây là cơ chế chính'), 'correct');
    assert.equal(readVerdict('dung vi day la co che chinh'), 'correct');
    assert.equal(readVerdict('Sai vì thuốc này không qua hàng rào máu não'), 'wrong');
    assert.equal(readVerdict('Đây không phải đáp án'), 'wrong');
    assert.equal(readVerdict(''), 'unknown');
    assert.equal(readVerdict('Insulin là hormone tuyến tụy'), 'unknown');
});

test('readVerdict: "không sai" phải hiểu là ĐÚNG, không dính bẫy từ "sai"', () => {
    assert.equal(readVerdict('Không sai, nhưng chưa đầy đủ bằng phương án kia'), 'correct');
});

test('readVerdict: có cả hai từ thì từ đứng trước thắng', () => {
    assert.equal(readVerdict('Đúng. Nhiều bạn hay nhầm lẫn với phương án B nên chọn sai'), 'correct');
    assert.equal(readVerdict('Sai. Đúng ra phải là cơ chế ức chế bơm proton'), 'wrong');
});

test('readVerdict: ký hiệu ✓ / ❌', () => {
    assert.equal(readVerdict('✓ Cơ chế ức chế COX-2'), 'correct');
    assert.equal(readVerdict('❌ Không liên quan'), 'wrong');
});

// --- suy luận từ giải thích từng phương án ----------------------------------
test('inferFromOptionExplanations: 1 đúng + 3 sai -> chắc chắn', () => {
    const r = inferFromOptionExplanations(
        ['Sai vì ...', 'Sai vì ...', 'Đúng vì ...', 'Sai vì ...'], 4);
    assert.equal(r.index, 2);
    assert.equal(r.confidence, 'high');
});

test('inferFromOptionExplanations: 3 sai + 1 để trống -> ô trống là đáp án', () => {
    const r = inferFromOptionExplanations(['Sai vì ...', '', 'Sai vì ...', 'Sai vì ...'], 4);
    assert.equal(r.index, 1);
    assert.equal(r.confidence, 'high');
});

test('inferFromOptionExplanations: hai ô cùng ghi "đúng" -> không kết luận', () => {
    const r = inferFromOptionExplanations(['Đúng', 'Đúng', 'Sai', 'Sai'], 4);
    assert.equal(r.confidence, 'none');
});

test('inferFromOptionExplanations: không có giải thích nào -> none', () => {
    assert.equal(inferFromOptionExplanations([], 4).confidence, 'none');
    assert.equal(inferFromOptionExplanations(['', '', '', ''], 4).confidence, 'none');
});

// --- suy luận từ giải thích chung -------------------------------------------
test('inferFromExplanationText: bắt "Đáp án đúng là C" / "Chọn 3" / "Key: B"', () => {
    assert.equal(inferFromExplanationText('Đáp án đúng là C vì ...', 4).index, 2);
    assert.equal(inferFromExplanationText('Chọn 3 do cơ chế ...', 4).index, 2);
    assert.equal(inferFromExplanationText('Key: B', 4).index, 1);
    assert.equal(inferFromExplanationText('Không nhắc chữ cái nào cả', 4).confidence, 'none');
});

test('inferFromExplanationText: chữ cái vượt số phương án thì bỏ qua', () => {
    assert.equal(inferFromExplanationText('Đáp án đúng là E', 4).confidence, 'none');
});

// --- dấu đánh trong nội dung phương án --------------------------------------
test('inferFromOptionMarkers: dấu * đánh đúng 1 phương án', () => {
    const r = inferFromOptionMarkers(['Hà Nội', '*Đà Nẵng', 'Huế', 'Cần Thơ']);
    assert.equal(r.index, 1);
    assert.deepEqual(r.cleaned, ['Hà Nội', 'Đà Nẵng', 'Huế', 'Cần Thơ']);
});

test('inferFromOptionMarkers: hậu tố "(đúng)"', () => {
    const r = inferFromOptionMarkers(['A rồi', 'B nữa', 'C nè (đúng)']);
    assert.equal(r.index, 2);
    assert.equal(r.cleaned[2], 'C nè');
});

test('inferFromOptionMarkers: không có dấu -> giữ nguyên, không đụng nội dung', () => {
    const r = inferFromOptionMarkers(['Hà Nội', 'Đà Nẵng']);
    assert.equal(r.index, -1);
    assert.equal(r.cleaned, null);
});

// --- nhãn A./B. lẫn trong nội dung ------------------------------------------
test('extractOptionLabels: gỡ nhãn khi quá nửa phương án có nhãn', () => {
    const r = extractOptionLabels(['A. Hà Nội', 'B. Huế', 'C. Đà Nẵng', 'D. Cần Thơ']);
    assert.deepEqual(r.stripped, ['Hà Nội', 'Huế', 'Đà Nẵng', 'Cần Thơ']);
    assert.deepEqual(r.labels, ['A', 'B', 'C', 'D']);
});

test('extractOptionLabels: không cắt nhầm đáp án tình cờ bắt đầu bằng "D. "', () => {
    const r = extractOptionLabels(['Vitamin A', 'D. melanogaster', 'Vitamin C', 'Vitamin K']);
    assert.deepEqual(r.stripped, ['Vitamin A', 'D. melanogaster', 'Vitamin C', 'Vitamin K']);
    assert.equal(r.labels, null);
});

// --- đọc cột đáp án đúng -----------------------------------------------------
test('parseCorrectValue: số, chữ, nhiều đáp án', () => {
    assert.deepEqual(parseCorrectValue('3', 4).indexes, [2]);
    assert.deepEqual(parseCorrectValue('C', 4).indexes, [2]);
    assert.deepEqual(parseCorrectValue('1,3', 4).indexes, [0, 2]);
    assert.deepEqual(parseCorrectValue('A; C', 4).indexes, [0, 2]);
    assert.deepEqual(parseCorrectValue('AC', 4).indexes, [0, 2]);
    assert.deepEqual(parseCorrectValue('', 4).indexes, []);
    assert.deepEqual(parseCorrectValue('7', 4).indexes, []);
});

// --- bộ máy chính ------------------------------------------------------------
const makeQ = (n, correct, correctExpAt) => ({
    question: 'Câu hỏi số ' + n,
    answers: ['P1-' + n, 'P2-' + n, 'P3-' + n, 'P4-' + n],
    correctAnswerIndex: correct,
    optionExplanations: [0, 1, 2, 3].map(i => (i === correctExpAt ? 'Đúng vì đây là cơ chế chính' : 'Sai vì không liên quan'))
});

test('autofixQuestions: >3 câu lệch -> tự sửa cả bộ', () => {
    // 5 câu đều bị set lệch 1 vị trí so với giải thích
    const qs = [1, 2, 3, 4, 5].map(n => makeQ(n, 0, 1));
    const { questions, report } = autofixQuestions(qs);
    assert.equal(report.applied, true);
    assert.equal(report.answerFixes.length, 5);
    assert.equal(report.systematicShift, 1, 'nhận ra cả bộ lệch +1');
    assert.equal(report.suspects.length, 0);
    questions.forEach(q => assert.equal(q.correctAnswerIndex, 1));
});

test('autofixQuestions: <=3 câu lệch -> KHÔNG tự sửa, chỉ cảnh báo', () => {
    const qs = [makeQ(1, 0, 1), makeQ(2, 2, 2), makeQ(3, 3, 3)];
    const { questions, report } = autofixQuestions(qs);
    assert.equal(report.applied, false);
    assert.equal(report.answerFixes.length, 0);
    assert.equal(report.suspects.length, 1);
    assert.equal(questions[0].correctAnswerIndex, 0, 'giữ nguyên lựa chọn của người dùng');
    assert.equal(report.suspects[0].suggested, 1);
});

test('autofixQuestions: bộ đề đúng sẵn -> không đụng gì', () => {
    const qs = [makeQ(1, 1, 1), makeQ(2, 2, 2)];
    const { report } = autofixQuestions(qs);
    assert.equal(report.answerFixes.length, 0);
    assert.equal(report.suspects.length, 0);
    assert.equal(report.dropped.length, 0);
});

test('autofixQuestions: câu THIẾU đáp án luôn được vá nếu suy được', () => {
    const q = makeQ(1, null, 2);
    const { questions, report } = autofixQuestions([q]);
    assert.equal(questions[0].correctAnswerIndex, 2);
    assert.equal(report.answerFixes.length, 1);
    assert.equal(report.answerFixes[0].from, null);
});

test('autofixQuestions: câu không suy được đáp án thì bị loại, có ghi lý do', () => {
    const { questions, report } = autofixQuestions([
        { question: 'Mơ hồ', answers: ['a', 'b', 'c', 'd'], correctAnswerIndex: null }
    ]);
    assert.equal(questions.length, 0);
    assert.equal(report.dropped[0].why, 'không xác định được đáp án đúng');
});

test('autofixQuestions: bỏ ô trống và dời chỉ mục đáp án theo', () => {
    const { questions, report } = autofixQuestions([
        { question: 'Câu A', answers: ['x', '', 'y', 'z'], correctAnswerIndex: 2 }
    ]);
    assert.deepEqual(questions[0].answers, ['x', 'y', 'z']);
    assert.equal(questions[0].correctAnswerIndex, 1, 'đáp án vẫn trỏ đúng nội dung "y"');
    assert.ok(report.cleaned.includes('bỏ ô đáp án để trống'));
});

test('autofixQuestions: gộp câu trùng lặp', () => {
    const a = { question: 'Thủ đô Việt Nam?', answers: ['Hà Nội', 'Huế'], correctAnswerIndex: 0 };
    const b = { question: 'Thủ đô  Việt Nam? ', answers: ['Huế', 'Hà Nội'], correctAnswerIndex: 1 };
    const { questions, report } = autofixQuestions([a, b]);
    assert.equal(questions.length, 1);
    assert.equal(report.duplicates.length, 1);
});

test('autofixQuestions: câu trùng thì giữ bản ĐẦY ĐỦ hơn, không giữ bản thiếu đáp án', () => {
    const thieu = { question: 'Thủ đô Việt Nam?', answers: ['Hà Nội', 'Huế'], correctAnswerIndex: null };
    const du = { question: 'Thủ đô Việt Nam?', answers: ['Hà Nội', 'Huế'], correctAnswerIndex: 0, explanation: 'Hà Nội.' };
    const { questions, report } = autofixQuestions([thieu, du]);
    assert.equal(questions.length, 1);
    assert.equal(questions[0].correctAnswerIndex, 0, 'bản có đáp án phải thắng');
    assert.equal(report.dropped.length, 0, 'không được báo "không xác định được đáp án"');
    assert.equal(report.duplicates.length, 1);
});

test('autofixQuestions: chỉ mục ngoài phạm vi được cứu bằng giải thích', () => {
    const q = makeQ(1, null, 0);
    q.correctAnswerIndex = 9;
    const { questions } = autofixQuestions([q]);
    assert.equal(questions[0].correctAnswerIndex, 0);
});

test('autofixQuestions: dấu * trong nội dung thắng cột đáp án sai', () => {
    const qs = [1, 2, 3, 4].map(n => ({
        question: 'Câu ' + n,
        answers: ['a' + n, '*b' + n, 'c' + n, 'd' + n],
        correctAnswerIndex: 0
    }));
    const { questions, report } = autofixQuestions(qs);
    assert.equal(report.applied, true);
    questions.forEach((q, i) => {
        assert.equal(q.correctAnswerIndex, 1);
        assert.equal(q.answers[1], 'b' + (i + 1), 'dấu * đã được gỡ khỏi nội dung');
    });
});

test('summarizeReport: bộ đề sạch cho ra tone info', () => {
    const { report } = autofixQuestions([makeQ(1, 1, 1)]);
    const sum = summarizeReport(report);
    assert.equal(sum.tone, 'info');
    assert.equal(sum.lines.length, 0);
});
