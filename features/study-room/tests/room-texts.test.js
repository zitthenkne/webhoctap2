// Kiểm thử phần thuần của "tách chữ ra khỏi doc phiên" (room-texts-core.js): node --test features/study-room/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shardOfPath, splitPatch, nest, hasPath, mergeTexts, sidOf, shardDocId, BLOCK } from '../room-texts-core.js';

test('đường chấm -> khối 10 câu; ca lâm sàng -> tc; trường khác không bị tách', () => {
    assert.equal(shardOfPath('notes.q0').id, 't0');
    assert.equal(shardOfPath('notes.q9').id, 't0');
    assert.equal(shardOfPath('notes.q10').id, 't1');
    assert.equal(shardOfPath('edits.q57.question').id, 't5');
    assert.equal(shardOfPath('optNotes.q3.o2').id, 't0');
    assert.equal(shardOfPath('caseEdits.c1xyz.text').id, 'tc');
    assert.equal(shardOfPath('caseBy.c1xyz').id, 'tc');
    for (const k of ['chosen.q1', 'shown.q1', 'locked', 'pinnedNote', 'editing.q3', 'grades.q3', 'notes', 'notes.x', 'qStarts.q1']) assert.equal(shardOfPath(k), null, k);
    assert.equal(BLOCK, 10);
    assert.equal(shardDocId('t0'), 't_0');
    assert.equal(shardDocId('tc'), 't_c');
});

test('splitPatch: tách chữ theo khối, phần còn lại ở doc phiên', () => {
    const { cur, shards } = splitPatch({ 'notes.q2': 'a', 'notesBy.q2': { name: 'x' }, 'notes.q14': 'b', 'caseBy.ck': null, locked: true, 'editing.q2': { uid: 'u' } });
    assert.deepEqual(Object.keys(shards).sort(), ['t0', 't1', 'tc']);
    assert.deepEqual(shards.t0, { 'notes.q2': 'a', 'notesBy.q2': { name: 'x' } });
    assert.deepEqual(shards.t1, { 'notes.q14': 'b' });
    assert.deepEqual(shards.tc, { 'caseBy.ck': null });
    assert.deepEqual(cur, { locked: true, 'editing.q2': { uid: 'u' } });
    assert.deepEqual(splitPatch({ locked: false }).shards, {});
});

test('nest + hasPath', () => {
    assert.deepEqual(nest({ 'edits.q5.question': 'q', 'edits.q5.options': ['a'], 'notes.q5': 'n' }), { edits: { q5: { question: 'q', options: ['a'] } }, notes: { q5: 'n' } });
    const o = { notes: { q1: null, q2: 'x' }, edits: { q3: { question: 'z' } } };
    assert.equal(hasPath(o, 'notes.q1'), true, 'null vẫn là có');
    assert.equal(hasPath(o, 'notes.q9'), false);
    assert.equal(hasPath(o, 'edits.q3.question'), true);
    assert.equal(hasPath(o, 'edits.q3.options'), false);
    assert.equal(hasPath(o, 'edits.q3.question.x'), false);
    assert.equal(hasPath(null, 'a'), false);
});

const SID = sidOf({ qid: 7, startedAtMs: 100 });
test('sidOf', () => { assert.equal(SID, '7:100'); assert.equal(sidOf(null), ''); assert.equal(sidOf({}), '0:0'); });

test('mergeTexts: không có doc chữ hợp lệ -> trả NGUYÊN doc phiên (cùng tham chiếu)', () => {
    const cur = { notes: { q1: 'x' }, locked: false };
    assert.equal(mergeTexts(cur, {}, SID), cur);
    assert.equal(mergeTexts(cur, { t_0: { sid: 'cũ', notes: { q1: 'old' } } }, SID), cur, 'doc phiên cũ bị bỏ qua');
    assert.equal(mergeTexts(null, { t_0: { sid: SID } }, SID), null);
});

test('mergeTexts: doc chữ thắng doc phiên; gộp hai tầng; null = đã xóa', () => {
    const cur = { quizTitle: 'T', notes: { q1: 'cũ1', q2: 'cũ2' }, edits: { q3: { options: ['a', 'b'] }, q4: { question: 'cũ' } }, optNotes: { q1: { o0: 'x' } } };
    const shards = {
        t_0: { sid: SID, kind: 'texts', notes: { q1: 'mới1', q5: 'mới5' }, edits: { q3: { question: 'sửa' }, q4: null }, optNotes: { q1: { o1: 'y' } }, notesBy: { q1: { name: 'A' } } },
        t_c: { sid: SID, caseEdits: { ck: { text: 'ca' } } },
    };
    const m = mergeTexts(cur, shards, SID);
    assert.equal(m.quizTitle, 'T');
    assert.deepEqual(m.notes, { q1: 'mới1', q2: 'cũ2', q5: 'mới5' });
    assert.deepEqual(m.edits.q3, { options: ['a', 'b'], question: 'sửa' }, 'gộp trường trong câu');
    assert.equal(m.edits.q4, null, 'null đè chữ cũ');
    assert.deepEqual(m.optNotes.q1, { o0: 'x', o1: 'y' });
    assert.deepEqual(m.notesBy, { q1: { name: 'A' } }, 'trường chỉ có ở doc chữ');
    assert.deepEqual(m.caseEdits, { ck: { text: 'ca' } });
    assert.deepEqual(cur.notes, { q1: 'cũ1', q2: 'cũ2' }, 'không sửa đối tượng gốc');
});

test('mergeTexts: nhiều khối cùng map; mảng thay nguyên', () => {
    const shards = { t_0: { sid: SID, edits: { q1: { options: ['a'] } } }, t_1: { sid: SID, edits: { q12: { options: ['z'] } } } };
    const m = mergeTexts({ edits: { q1: { options: ['cũ', 'cũ2'] } } }, shards, SID);
    assert.deepEqual(m.edits.q1.options, ['a']);
    assert.deepEqual(m.edits.q12, { options: ['z'] });
});

// ---------- Bản 74c: doc thành viên theo khối câu ----------
import { memberShardOfPath, splitMemberPatch, mergeMember, groupMemberShards, mshardDocId, MEMBER_ROOTS, CAP, TEXTS_CAP, MEMBER_CAP } from '../room-texts-core.js';

test('memberShardOfPath: bản đồ khóa theo câu -> khối; cả map / trường khác -> null', () => {
    assert.equal(memberShardOfPath('answers.q0').id, 'b0');
    assert.equal(memberShardOfPath('answers.q27.why').id, 'b2');
    assert.equal(memberShardOfPath('args.q41.abc.ok').id, 'b4');
    assert.equal(memberShardOfPath('rf.q3.elim').id, 'b0');
    for (const k of ['answers', 'agree.xyz', 'likes.k', 'hand', 'slow', 'reaction', 'team', 'displayName', 'answers.x']) assert.equal(memberShardOfPath(k), null, k);
    assert.deepEqual(MEMBER_ROOTS.slice().sort(), ['answers', 'args', 'diff', 'dissent', 'flags', 'marks', 'ready', 'rf', 'unclear']);
    assert.equal(mshardDocId('guest_a1', 'b3'), 'm_guest_a1_b3');
    assert.ok(CAP >= MEMBER_CAP && MEMBER_CAP > TEXTS_CAP);
});

test('splitMemberPatch: khối theo câu, phần còn lại ở doc thành viên, ghi cả map được báo riêng', () => {
    const r = splitMemberPatch({ 'answers.q2': { i: 1 }, 'ready.q15': true, hand: 5, 'agree.z': true });
    assert.deepEqual(Object.keys(r.shards).sort(), ['b0', 'b1']);
    assert.deepEqual(r.base, { hand: 5, 'agree.z': true });
    assert.deepEqual(r.whole, []);
    const w = splitMemberPatch({ answers: {}, flags: {} });
    assert.deepEqual(w.whole, ['answers', 'flags']);
    assert.deepEqual(w.shards, {});
});

const MS = '5:900';
test('mergeMember: gộp sâu — sửa MỘT trường trong bình luận cũ ở doc thành viên không làm mất bình luận', () => {
    const base = { uid: 'u1', displayName: 'A', args: { q5: { c1: { t: 'bình luận gốc', at: 1 } } }, answers: { q1: { i: 2, at: 5 } } };
    const docs = [{ sid: MS, uid: 'u1', b: 'b0', args: { q5: { c1: { ok: true } } }, answers: { q2: { i: 0 } } }];
    const m = mergeMember(base, docs, MS);
    assert.deepEqual(m.args.q5.c1, { t: 'bình luận gốc', at: 1, ok: true });
    assert.deepEqual(m.answers, { q1: { i: 2, at: 5 }, q2: { i: 0 } });
    assert.equal(m.displayName, 'A');
    assert.deepEqual(base.args.q5.c1, { t: 'bình luận gốc', at: 1 }, 'không sửa bản gốc');
});

test('mergeMember: doc khối phiên cũ bị bỏ qua; null đè; không có doc -> trả nguyên', () => {
    const base = { uid: 'u1', flags: { q3: true } };
    assert.equal(mergeMember(base, [], MS), base);
    assert.equal(mergeMember(base, [{ sid: 'cũ', flags: { q3: false } }], MS), base);
    const m = mergeMember(base, [{ sid: MS, flags: { q3: null }, marks: { q1: 'hard' } }], MS);
    assert.equal(m.flags.q3, null);
    assert.deepEqual(m.marks, { q1: 'hard' });
});

test('groupMemberShards: nhóm theo uid, chỉ doc đúng phiên', () => {
    const by = groupMemberShards({
        m_a_b0: { sid: MS, uid: 'a' }, m_a_b1: { sid: MS, uid: 'a' }, m_b_b0: { sid: MS, uid: 'b' }, m_c_b0: { sid: 'cũ', uid: 'c' }, bad: { sid: MS },
    }, MS);
    assert.equal(by.get('a').length, 2);
    assert.equal(by.get('b').length, 1);
    assert.equal(by.has('c'), false);
    assert.equal(by.size, 2);
});
