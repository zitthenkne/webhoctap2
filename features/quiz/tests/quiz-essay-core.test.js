// Kiểm thử lõi câu tự luận (quiz-essay-core.js) + chấm điểm chung (answerCredit) — thuần JS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    isEssay, keyPointsOf, essayMaxPoints, essayCredit, isEssayGraded, isPendingEssay, isLockedByReveal,
    essayPoints, missingCritical, rubricOf, questionWeight, autoMatch, withAutoGrade, needsReview, modelCoverage,
    formatOf, answerDocs, partsText, rubricToText, textToRubric, remapFields
} from '../quiz-essay-core.js';
import { isAnswerCorrect, answerCredit } from '../quiz-helpers.js';

const essay = (extra = {}) => ({ question: 'Chẩn đoán?', answers: [], type: 'essay', ...extra });

test('nhận diện câu tự luận', () => {
    assert.equal(isEssay(essay()), true);
    assert.equal(isEssay({ question: 'x', answers: [] }), true);
    assert.equal(isEssay({ question: 'x', answers: ['a', 'b'], correctAnswerIndex: 0 }), false);
});

test('ý chấm: keyPoints tường minh (object lẫn chuỗi có điểm)', () => {
    const q = essay({ keyPoints: [{ text: 'NMCT', points: 1 }, 'Thành dưới (0,5đ)', { text: '' }] });
    assert.deepEqual(keyPointsOf(q).map(({ text, points }) => ({ text, points })), [{ text: 'NMCT', points: 1 }, { text: 'Thành dưới', points: 0.5 }]);
    assert.equal(essayMaxPoints(q), 1.5);
});

test('ý chấm: tách từ gạch đầu dòng cấp 1 của đáp án mẫu, bỏ ý con', () => {
    const q = essay({ modelAnswer: 'Chẩn đoán:\n- NMCT cấp (1đ)\n  - chi tiết\n2. Killip I [0.5]' });
    assert.deepEqual(keyPointsOf(q).map(({ text, points }) => ({ text, points })), [{ text: 'NMCT cấp', points: 1 }, { text: 'Killip I', points: 0.5 }]);
});

test('chấm theo tỉ lệ ý đã tick; chưa tick = chưa chấm', () => {
    const q = essay({ keyPoints: [{ text: 'A', points: 1 }, { text: 'B', points: 1 }, { text: 'C', points: 2 }] });
    const pending = { text: 'bài', ticks: null };
    assert.equal(isEssayGraded(q, pending), false);
    assert.equal(isPendingEssay(q, pending), true);
    assert.equal(answerCredit(q, pending), 0);
    const half = { text: 'bài', ticks: [2] };
    assert.equal(essayCredit(q, half), 0.5);
    assert.equal(isAnswerCorrect(q, half), true);          // đạt ≥ 50%
    assert.equal(isAnswerCorrect(q, { text: 'bài', ticks: [0] }), false);
    assert.equal(isAnswerCorrect(q, null), false);
});

test('không có ý chấm -> tự chấm cả câu (0 / 0,5 / 1)', () => {
    const q = essay({ modelAnswer: 'Một đoạn văn không gạch đầu dòng.' });
    assert.equal(essayCredit(q, { text: 'x', self: 0.5 }), 0.5);
    assert.equal(isEssayGraded(q, { text: 'x', ticks: null }), false);
});

test('trắc nghiệm vẫn chấm 0/1 như cũ', () => {
    const q = { question: 'x', answers: ['a', 'b'], correctAnswerIndex: 1 };
    assert.equal(answerCredit(q, 1), 1);
    assert.equal(answerCredit(q, 0), 0);
});

test('ca mở dần: câu trước bị khóa khi đã xem tới câu có thông tin mới', () => {
    const qs = [{}, { caseReveal: 'ECG: ST chênh lên' }, {}];
    assert.equal(isLockedByReveal(qs, 1, 1), false);
    assert.equal(isLockedByReveal(qs, 1, 2), true);
    assert.equal(isLockedByReveal(qs, 2, 3), false);   // câu 3 không mở thêm gì
    assert.equal(isLockedByReveal([{}, {}], 1, 2), false);
});

/* ---------------- Barem nâng cao ---------------- */
const barem = essay({
    maxScore: 2,
    keyPoints: [
        { text: 'NMCT cấp', points: 1, critical: true },
        { text: 'Aspirin liều nạp 150–300 mg', points: 0.5, partial: 0.25, keywords: ['aspirin', 'asa'] },
        { group: 'Nêu 2 trong 3 yếu tố nguy cơ', max: 1, items: [
            { text: 'Tăng huyết áp', points: 0.5 }, { text: 'Hút thuốc lá', points: 0.5 }, { text: 'Đái tháo đường', points: 0.5 },
        ] },
        { text: 'Dùng nitrat khi tụt huyết áp', points: -0.5, keywords: ['nitrat'] },
    ],
});

test('barem: làm phẳng ý, nhóm có trần điểm, lỗi trừ điểm không tính vào điểm tối đa', () => {
    const { items, groups } = rubricOf(barem);
    assert.equal(items.length, 6);
    assert.deepEqual(groups, [{ label: 'Nêu 2 trong 3 yếu tố nguy cơ', max: 1, idxs: [2, 3, 4] }]);
    assert.equal(items[5].penalty, true);
    assert.equal(essayMaxPoints(barem), 2.5);   // 1 + 0.5 + nhóm 1
    assert.equal(questionWeight(barem), 2);
    assert.equal(questionWeight({}), 1);
});

test('barem: nhóm không vượt trần, một phần, trừ điểm, không âm', () => {
    assert.equal(essayPoints(barem, { text: 'x', ticks: [0, 2, 3, 4] }), 2);          // nhóm 1.5 -> trần 1
    assert.equal(essayPoints(barem, { text: 'x', ticks: [0], partials: [1] }), 1.25);  // aspirin thiếu liều
    assert.equal(essayPoints(barem, { text: 'x', ticks: [0, 5] }), 0.5);               // trừ 0.5
    assert.equal(essayPoints(barem, { text: 'x', ticks: [0, 5], partials: [] }) >= 0, true);
});

test('barem: thiếu ý bắt buộc -> cả câu 0 điểm', () => {
    const ans = { text: 'x', ticks: [1, 2, 3] };
    assert.deepEqual(missingCritical(barem, ans), [0]);
    assert.equal(essayPoints(barem, ans), 0);
});

test('barem từ đáp án mẫu: gạch đầu dòng có điểm âm = lỗi trừ điểm', () => {
    const q = essay({ modelAnswer: '- Truyền dịch (1đ)\n- Dùng nitrat (-0,5đ)' });
    const items = keyPointsOf(q);
    assert.equal(items[1].penalty, true);
    assert.equal(essayMaxPoints(q), 1);
});

/* ---------------- Máy nhận diện từ khóa ---------------- */
const levels = (q, text) => autoMatch(q, text).map(m => m.level);

test('dò: từ khóa tác giả cho sẵn, bài gõ có dấu', () => {
    const r = autoMatch(barem, 'Nhồi máu cơ tim cấp, cho aspirin 300mg nhai');
    assert.equal(r[0].level, 'match');                 // NMCT bung viết tắt ở barem
    assert.equal(r[1].level, 'match');
    assert.deepEqual(r[1].words, ['aspirin']);
    assert.equal(r[2].level, null);
});

test('dò: bài gõ KHÔNG dấu và viết tắt vẫn nhận', () => {
    const r = levels(barem, 'nmct cap, yeu to nguy co: tang huyet ap, hut thuoc la');
    assert.equal(r[0], 'match');
    assert.equal(r[2], 'match');
    assert.equal(r[3], 'match');
    assert.equal(r[4], null);
});

test('dò: bài gõ CÓ dấu thì không gộp nhầm dấu (gan ≠ gân)', () => {
    const q = essay({ keyPoints: [{ text: 'Gan to' }] });
    assert.notEqual(levels(q, 'gân to')[0], 'match');   // cùng lắm là "gần khớp" nhờ chữ "to"
    assert.equal(levels(q, 'gan to')[0], 'match');
});

test('máy chấm sơ bộ: tick ý khớp, KHÔNG tự tick lỗi trừ điểm, đánh dấu auto', () => {
    const a = withAutoGrade(barem, { text: 'NMCT cấp, không dùng nitrat vì tụt huyết áp', ticks: null });
    assert.deepEqual(a.ticks, [0]);
    assert.equal(a.auto, true);
    assert.equal(needsReview(barem, a), true);
    assert.equal(autoMatch(barem, a.text)[5].level, 'match');   // vẫn báo để người làm tự xem
    // đã chấm rồi thì không đè
    assert.deepEqual(withAutoGrade(barem, { text: 'aspirin', ticks: [] }).ticks, []);
});

test('câu không barem: đếm thuật ngữ đáp án mẫu có trong bài', () => {
    const q = essay({ modelAnswer: 'Tăng thải natri và glucose qua nước tiểu' });
    const c = modelCoverage(q, 'thải natri');
    assert.equal(c.hit, 2);
    assert.ok(c.total >= 6);
});

test('dò: viết tắt bung tại chỗ, tên thuốc kiểu Việt, ý dạng "Tên: giải thích"', () => {
    const q = essay({ keyPoints: [
        { text: 'Suy tim EF giảm', keywords: ['EF giảm', 'HFrEF'] },
        { text: 'Kháng aldosteron', keywords: ['spironolactone'] },
    ], });
    const r = autoMatch(q, 'suy tim EF giảm, dùng spironolacton');
    assert.equal(r[0].level, 'match');
    assert.deepEqual(r[0].words, ['EF giảm']);          // gộp thành cụm, không rời "EF", "giảm"
    assert.equal(r[1].level, 'match');
    const d = essay({ modelAnswer: '- Bảo vệ thận: giảm áp lực lọc cầu thận nhờ phục hồi phản hồi ống-cầu thận\n- Nguyên nhân: tăng huyết áp lâu năm' });
    const m = autoMatch(d, 'bảo vệ thận; nguyên nhân khác');
    assert.equal(m[0].level, 'match');
    assert.equal(m[1].level, null);                     // "Nguyên nhân:" là tiêu đề chung, không tính là một ý
});

/* ---------------- Kiểu ô nhập ---------------- */
test('kiểu ô: chuẩn hóa + gộp chữ', () => {
    assert.equal(formatOf(essay()).kind, 'text');
    assert.equal(formatOf(essay({ answerFormat: { kind: 'fields' } })).kind, 'text');   // thiếu nhãn -> ô thường
    const list = formatOf(essay({ answerFormat: { kind: 'list', count: 3 } }));
    assert.deepEqual([list.kind, list.parts], ['list', 3]);
    const tb = formatOf(essay({ answerFormat: { kind: 'table', columns: ['Thuốc', 'Liều'], rows: ['Kháng kết tập', 'Kháng đông'] } }));
    assert.deepEqual([tb.rows, tb.parts], [2, 4]);
    assert.equal(partsText(list, ['A', '', 'C']), '1. A\n3. C');
    assert.equal(partsText(tb, ['aspirin', '300 mg', '', '']), 'Kháng kết tập: Thuốc: aspirin · Liều: 300 mg');
});

test('dò theo ô: ý gắn field chỉ tính trong đúng ô', () => {
    const q = essay({
        answerFormat: { kind: 'fields', labels: ['Chẩn đoán chính', 'Chẩn đoán phân biệt'] },
        keyPoints: [{ text: 'NMCT cấp', field: 1, keywords: ['NMCT'] }, { text: 'Bóc tách ĐMC', field: 2, keywords: ['bóc tách'] }],
    });
    const wrong = { parts: ['đau thắt ngực ổn định', 'NMCT, bóc tách ĐMC'], text: 'x' };
    assert.deepEqual(autoMatch(q, wrong).map(m => m.level), [null, 'match']);
    const right = { parts: ['NMCT cấp', 'bóc tách ĐMC'], text: 'x' };
    const r = autoMatch(q, right);
    assert.deepEqual(r.map(m => m.level), ['match', 'match']);
    assert.deepEqual(r[1].ranges[0].slice(0, 1), [1]);          // vị trí chữ khớp mang số ô
    assert.deepEqual(answerDocs(q, right), ['NMCT cấp', 'bóc tách ĐMC']);
});

test('dò theo ô: bảng — field = số hàng', () => {
    const q = essay({
        answerFormat: { kind: 'table', columns: ['Thuốc', 'Liều'], rows: 2 },
        keyPoints: [{ text: 'Aspirin', field: 1, keywords: ['aspirin'] }, { text: 'Heparin', field: 2, keywords: ['heparin'] }],
    });
    const a = { parts: ['heparin', '5000 UI', 'aspirin', '300 mg'], text: 'x' };
    assert.deepEqual(autoMatch(q, a).map(m => m.level), [null, null]);    // đổi hàng -> không tính
});

test('barem <-> dạng dòng chữ: khứ hồi không mất dữ liệu', () => {
    const kp = [
        { text: 'NMCT cấp', points: 1, critical: true, field: 1, keywords: ['NMCT', 'nhồi máu cơ tim'] },
        { text: 'Ức chế P2Y12 (ticagrelor hoặc clopidogrel)', points: 0.5, partial: 0.25, keywords: ['ticagrelor'] },
        { group: 'Nêu 2 trong 3 yếu tố nguy cơ', max: 1, items: [
            { text: 'Tăng huyết áp', points: 0.5, keywords: ['THA'] }, { text: 'Hút thuốc lá', points: 0.5 }] },
        { text: 'Truyền NaCl 0,9%', points: 0.5, keywords: ['NaCl 0,9', 'bù dịch'] },
        { text: 'Dùng nitrat', points: -0.5, keywords: ['nitrat'] },
    ];
    const txt = rubricToText(kp);
    assert.match(txt, /^- NMCT cấp \(1đ, bắt buộc, ô 1\) \[NMCT; nhồi máu cơ tim\]$/m);
    assert.deepEqual(textToRubric(txt), kp);
    // ngoặc là nội dung (không phải thông số) thì giữ trong chữ, điểm mặc định 1
    assert.deepEqual(textToRubric('- Ức chế P2Y12 (ticagrelor hoặc clopidogrel)'), [{ text: 'Ức chế P2Y12 (ticagrelor hoặc clopidogrel)', points: 1 }]);
});

test('ý kiểm tra thứ tự: đúng trình tự mới tính, viết tắt vẫn nhận', () => {
    const q = essay({
        answerFormat: { kind: 'list', count: 4 },
        keyPoints: [{ text: 'Đúng thứ tự khám', order: ['bề cao tử cung|BCTC', 'Leopold', 'tim thai', 'khám trong'] }],
    });
    const ok = { parts: ['Đo BCTC', 'Khám Leopold', 'Nghe tim thai', 'Khám trong'], text: 'x' };
    const sai = { parts: ['Đo bề cao tử cung', 'Nghe tim thai', 'Khám Leopold', 'Khám trong'], text: 'x' };
    const thieu = { parts: ['Đo bề cao tử cung', 'Khám Leopold', 'Khám trong', ''], text: 'x' };
    assert.equal(autoMatch(q, ok)[0].level, 'match');
    assert.equal(autoMatch(q, sai)[0].level, null);
    assert.equal(autoMatch(q, thieu)[0].level, null);
    // khứ hồi qua dạng dòng chữ của modal sửa câu
    const kp = [{ text: 'Đúng thứ tự khám', points: 0.5, critical: true, order: ['bề cao tử cung|BCTC', 'Leopold', 'khám trong'] }];
    assert.match(rubricToText(kp), /\{thứ tự: bề cao tử cung\|BCTC > Leopold > khám trong\}$/);
    assert.deepEqual(textToRubric(rubricToText(kp)), kp);
});

test('ô tự đặt: nhãn · gợi ý · cỡ · đơn vị, chuỗi cũ vẫn chạy, dò đúng ô', () => {
    const q = essay({
        answerFormat: { kind: 'fields', labels: ['Chẩn đoán', { label: 'Mạch', hint: '60–100', size: 'line', unit: 'lần/phút' }, { hint: 'Ghi thêm' }] },
        keyPoints: [{ text: 'Mạch nhanh', points: 1, keywords: ['110'], field: 2 }],
    });
    const f = formatOf(q);
    assert.equal(f.parts, 3);
    assert.deepEqual(f.labels, ['Chẩn đoán', 'Mạch', '']);
    assert.deepEqual(f.slots[0], { label: 'Chẩn đoán', hint: '', size: 'para', unit: '' });   // ô có nhãn mặc định là đoạn
    assert.deepEqual(f.slots[1], { label: 'Mạch', hint: '60–100', size: 'line', unit: 'lần/phút' });
    assert.equal(partsText(f, ['Tiền sản giật', '110', 'x']), 'Chẩn đoán: Tiền sản giật\nMạch: 110 lần/phút\nx');
    assert.equal(autoMatch(q, { parts: ['110', '', ''] })[0].level, null);       // ghi ở ô khác -> không tính
    assert.equal(autoMatch(q, { parts: ['', '110', ''] })[0].level, 'match');
    // danh sách: nhãn giữ đúng vị trí (không dồn khi có ô trống)
    const l = formatOf(essay({ answerFormat: { kind: 'list', labels: ['', { label: 'Thuốc 2', unit: 'mg' }] } }));
    assert.equal(l.count, 2);
    assert.deepEqual(l.labels, ['', 'Thuốc 2']);
    assert.equal(partsText(l, ['a', '5']), '1. a\n2. 5 mg');
});

test('remapFields: ý barem gắn ô đi theo ô khi chèn / xóa / đổi thứ tự', () => {
    const kp = [
        { text: 'Mạch nhanh', points: 1, field: 1 },
        { text: 'Tăng huyết áp', points: 1, field: 2 },
        { group: 'Nêu 1 trong 2', max: 1, items: [{ text: 'a', points: 1, field: 3 }, { text: 'b', points: 1 }] },
    ];
    // Chèn ô mới lên đầu: ô cũ 0,1,2 -> 1,2,3
    const r = remapFields(kp, [null, 0, 1, 2]);
    assert.deepEqual(r.map(x => x.field ?? null), [2, 3, null]);
    assert.equal(r[2].items[0].field, 4);
    assert.equal('field' in r[2].items[1], false);
    // Xóa ô cũ số 2 (field 2): ý đó thôi gắn ô
    const d = remapFields(kp, [0, 2]);
    assert.equal(d[0].field, 1);
    assert.equal('field' in d[1], false);
    assert.equal(d[2].items[0].field, 2);
    assert.equal(remapFields(kp, undefined), kp);                    // không có order -> giữ nguyên
});
