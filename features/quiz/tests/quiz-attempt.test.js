// Hợp đồng lượt làm (quiz-attempt.js): niêm phong revision, dựng lại đề sau khi sửa / đảo phương án, đồng hồ, nhánh offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
    canon, contentRev, questionFp, questionKey, optionIds, sealContent, blueprintEntry,
    rebuildFromBlueprint, restoredRemaining, newTiming, firstDivergence, mergeBranches, sameAttempt
} from '../quiz-attempt.js';
import { applyOptionOrder } from '../quiz-helpers.js';

const require = createRequire(import.meta.url);
const server = require('../../../api/_lib/revision.js');

const quiz = () => ({
    questions: [
        { question: 'Câu 1?', answers: ['A1', 'B1', 'C1'], correctAnswerIndex: 0, explanation: 'vì A1' },
        { question: 'Câu 2?', answers: ['A2', 'B2', 'C2', 'D2'], correctAnswerIndex: 2, optionExplanations: ['x', 'y', 'z', 't'] },
        { question: 'Câu 3?', answers: ['A3', 'B3'], correctAnswerIndex: 1 },
    ]
});

// Lượt làm: xáo câu (3,1,2) và đảo phương án câu 2
function startAttempt(data) {
    sealContent(data);
    const played = [
        { ...data.questions[2], __origIdx: 2 },
        { ...data.questions[0], __origIdx: 0 },
        applyOptionOrder({ ...data.questions[1], __origIdx: 1 }, [3, 2, 1, 0]),
    ];
    return { played, saved: { revisionId: data._rev, questionBlueprint: played.map((q, i) => blueprintEntry(q, i, data)) } };
}

test('máy chủ và máy khách ra cùng revision dù thứ tự khóa khác', () => {
    const a = quiz().questions;
    const b = a.map(q => Object.fromEntries(Object.entries(q).reverse()));
    assert.equal(contentRev(a), contentRev(b));
    assert.equal(server.contentRev(b), contentRev(a));
    assert.equal(canon({ x: 1, _srv: 2, __o: 3 }), '{"x":1}');
});

test('cùng revision: dựng lại đúng thứ tự câu và phương án', () => {
    const data = quiz();
    const { played, saved } = startAttempt(data);
    const r = rebuildFromBlueprint(saved, data, applyOptionOrder);
    assert.ok(r.ok && r.exact);
    assert.deepEqual(r.questions.map(q => q.question), played.map(q => q.question));
    assert.deepEqual(r.questions[2].answers, ['D2', 'C2', 'B2', 'A2']);
    assert.equal(r.questions[2].correctAnswerIndex, 1);
});

test('tác giả chèn câu + đảo phương án giữa lượt: ghép theo khóa, đáp án vẫn chấm đúng', () => {
    const data = quiz();
    const { saved } = startAttempt(data);
    const next = quiz();
    next.questions[1] = applyOptionOrder(next.questions[1], [1, 0, 3, 2]);   // đảo phương án câu 2 trên máy chủ
    delete next.questions[1].__optOrder;
    next.questions.unshift({ question: 'Câu mới?', answers: ['x', 'y'], correctAnswerIndex: 0 });
    sealContent(next);
    assert.notEqual(next._rev, saved.revisionId);
    const r = rebuildFromBlueprint(saved, next, applyOptionOrder);
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.exact, false);
    assert.deepEqual(r.questions.map(q => q.question), ['Câu 3?', 'Câu 1?', 'Câu 2?']);
    assert.deepEqual(r.questions[2].answers, ['D2', 'C2', 'B2', 'A2']);       // đúng thứ tự người học đã thấy
    assert.equal(r.questions[2].answers[r.questions[2].correctAnswerIndex], 'C2');
    assert.equal(r.questions[2].optionExplanations[r.questions[2].correctAnswerIndex], 'z');
});

test('tác giả sửa nội dung câu đang làm: không dựng lẫn bản mới', () => {
    const data = quiz();
    const { saved } = startAttempt(data);
    const next = quiz();
    next.questions[1].correctAnswerIndex = 3;
    sealContent(next);
    const r = rebuildFromBlueprint(saved, next, applyOptionOrder);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'changed');
    assert.deepEqual(r.changed, [2]);
    // bản đề đúng revision cũ (vd còn trong máy) → khôi phục chính xác
    const old = sealContent(quiz());
    assert.ok(rebuildFromBlueprint(saved, old, applyOptionOrder).exact);
    // chế độ nới: các câu khác giữ nguyên, câu bị sửa lấy bản mới và phải trả lời lại
    const r2 = rebuildFromBlueprint(saved, next, applyOptionOrder, { lenient: true });
    assert.ok(r2.ok);
    assert.deepEqual(r2.reset, [2]);
    assert.deepEqual(r2.questions.map(q => q.question), ['Câu 3?', 'Câu 1?', 'Câu 2?']);
    assert.equal(r2.questions[2].correctAnswerIndex, 3);      // theo bản mới
    // câu của lượt bị XÓA khỏi đề → không dựng được
    const gone = quiz(); gone.questions.splice(1, 1); sealContent(gone);
    assert.equal(rebuildFromBlueprint(saved, gone, applyOptionOrder, { lenient: true }).ok, false);
});

test('bản lưu đời cũ không revision: không chuyển đổi khi không nhận diện được nguồn', () => {
    const data = sealContent(quiz());
    const r = rebuildFromBlueprint({ questionBlueprint: [{ origIdx: 0 }, { origIdx: 1 }] }, data, applyOptionOrder);
    assert.deepEqual(r, { ok: false, reason: 'legacy' });
});

test('khóa câu bền khi sửa phương án; ID phương án bền khi đảo', () => {
    const q = quiz().questions[1];
    const moved = applyOptionOrder(q, [2, 0, 1, 3]);
    assert.equal(questionKey(q), questionKey(moved));
    assert.equal(questionFp(q), questionFp(moved));
    assert.deepEqual([...optionIds(q)].sort(), [...optionIds(moved)].sort());
    assert.notEqual(questionFp(q), questionFp({ ...q, correctAnswerIndex: 0 }));
    assert.equal(questionKey({ qid: 'abc', question: 'x' }), 'iabc');
});

test('đồng hồ: 0 là hết giờ, tạm dừng giữ số giây, deadline theo giờ thật', () => {
    assert.equal(restoredRemaining({ timing: { policy: 'pausable', remaining: 0 } }), 0);
    assert.equal(restoredRemaining({ timeLeft: 0 }), 0);                       // bản lưu cũ cũng vậy
    assert.equal(restoredRemaining({ timing: { policy: 'pausable', remaining: 125, paused: true } }), 125);
    const t = newTiming(600, 'deadline', 1_000_000);
    assert.equal(restoredRemaining({ timing: t }, 1_000_000 + 30_000), 570);
    assert.equal(restoredRemaining({ timing: t }, 1_000_000 + 700_000), 0);
    assert.equal(restoredRemaining({}), null);
});

test('nhánh offline: tìm câu khác đầu tiên, gộp phần không xung đột', () => {
    const bp = [{ fp: 'a' }, { fp: 'b' }, { fp: 'c' }, { fp: 'd' }];
    const ipad = { attemptId: 'X', questionBlueprint: bp, userAnswers: [0, 1, null, 2], questionTimes: [5, 6, 0, 3] };
    const phone = { attemptId: 'X', questionBlueprint: bp, userAnswers: [0, 3, 1, null], questionTimes: [4, 9, 2, 0] };
    assert.ok(sameAttempt(ipad, phone));
    assert.equal(firstDivergence(ipad, phone), 1);
    const m = mergeBranches(phone, ipad);
    assert.deepEqual(m.userAnswers, [0, 3, 1, 2]);
    assert.deepEqual(m.questionTimes, [5, 9, 2, 3]);
    assert.equal(firstDivergence(ipad, { ...ipad, userAnswers: [0, 1, 1, null] }), -1);
    assert.equal(sameAttempt(ipad, { ...phone, attemptId: 'Y' }), false);
});
