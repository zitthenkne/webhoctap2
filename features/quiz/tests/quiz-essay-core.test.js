// Kiểm thử lõi câu tự luận (quiz-essay-core.js) + chấm điểm chung (answerCredit) — thuần JS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    isEssay, keyPointsOf, essayMaxPoints, essayCredit, isEssayGraded, isPendingEssay, isLockedByReveal,
    essayPoints, missingCritical, rubricOf, questionWeight, autoMatch, withAutoGrade, needsReview, modelCoverage,
    formatOf, answerDocs, partsText, rubricToText, textToRubric, remapFields,
    sheetOf, unitScore, splitModel, splitChot, studyLayers, answerTextOf
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
    assert.equal(autoMatch(barem, a.text)[5].level, null);      // "KHÔNG dùng nitrat" = tránh đúng lỗi -> không nhắc
    assert.equal(autoMatch(barem, 'NMCT cấp, cho nitrat ngậm')[5].level, 'match');   // mắc lỗi thật: vẫn báo để tự xem (máy không tự trừ)
    assert.deepEqual(withAutoGrade(barem, { text: 'NMCT cấp, cho nitrat ngậm', ticks: null }).ticks, [0]);
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

/* ---------------- Máy chấm bản 3 (2026-10-23): các lỗi đo trên 388 ý OSCE thật ---------------- */
test('chấm bản 3: chép lại đề không ăn điểm, diễn giải số liệu của đề thì vẫn được', () => {
    const q = essay({
        question: 'Thai phụ có tiền căn thai lưu, kinh chót 12/8, Ferritin 145 ng/mL, RDW 14,1%. Trình bày cần hỏi gì và nhận định xét nghiệm.',
        keyPoints: [{ text: 'Tiền căn thai lưu', keywords: ['thai lưu'] }, { text: 'Ferritin bình thường, loại trừ thiếu sắt', keywords: ['ferritin bình thường'] }],
    });
    assert.deepEqual(autoMatch(q, q.question).map(m => m.level === 'match'), [false, false]);
    assert.equal(autoMatch(q, q.question)[0].why, 'given');
    assert.equal(autoMatch(q, 'Ferritin 145 là bình thường, loại trừ thiếu sắt')[1].level, 'match');
    assert.equal(autoMatch(q, 'hỏi kỹ lần thai lưu trước: tuổi thai, xử trí')[0].level, 'match');   // có chữ mới ngoài đề
});

test('chấm bản 3: phủ định ngay trước chữ khớp -> chỉ gần khớp; tên thuốc có "không" vẫn đạt', () => {
    const q = essay({ keyPoints: [{ text: 'Dùng aspirin', keywords: ['aspirin'] }, { text: 'Heparin không phân đoạn' }, { text: 'Không dùng nitrat', keywords: ['không dùng nitrat'] }] });
    const r = autoMatch(q, 'Không dùng aspirin. Heparin không phân đoạn. Không dùng nitrat.');
    assert.deepEqual(r.map(m => m.level), ['near', 'match', 'match']);
    assert.equal(r[0].why, 'neg');
    assert.equal(autoMatch(q, 'không sốt, dùng aspirin')[0].level, 'match');   // dấu phẩy chặn phủ định của vế trước
});

test('chấm bản 3: ý nhiều thành phần phải nêu ≥ ½, thiếu thì nói rõ thiếu gì', () => {
    const q = essay({ keyPoints: [{ text: 'Đau bụng: vị trí, tính chất, thời gian, yếu tố làm tăng giảm', keywords: ['đau bụng', 'đau'] }] });
    const chi1 = autoMatch(q, 'đau bụng')[0];
    assert.equal(chi1.level, 'near');
    assert.equal(chi1.why, 'few');
    assert.deepEqual(chi1.missing, ['vị trí', 'tính chất', 'thời gian', 'yếu tố làm tăng giảm']);
    assert.equal(autoMatch(q, 'đau bụng: vị trí, tính chất, thời gian xuất hiện')[0].level, 'match');
    // "bố và mẹ" là một vế; ngoặc thuộc về vế của nó
    const k = essay({ keyPoints: [{ text: 'Tuổi mẹ lúc sinh em trai và kết quả nhiễm sắc thể đồ (karyotype) của em trai', keywords: ['karyotype'] }] });
    assert.equal(autoMatch(k, 'hỏi tuổi mẹ lúc sinh em trai, em đã làm karyotype chưa')[0].level, 'match');
});

test('chấm bản 3: từ khóa một chữ không đủ đạt ý dài; ý thiếu liều -> ½ điểm tự động', () => {
    const q = essay({ keyPoints: [
        { text: 'Chỉ định xét nghiệm tổng phân tích tế bào máu ngoại vi (CBC) cho người chồng để kiểm tra MCV và MCH', keywords: ['cbc'] },
        { text: 'Aspirin liều nạp 150–300 mg', points: 0.5, partial: 0.25, keywords: ['aspirin'] },
    ] });
    const r = autoMatch(q, 'CBC; aspirin');
    assert.deepEqual(r.map(m => [m.level, m.why]), [['near', 'kw'], ['near', 'few']]);
    assert.deepEqual(r[1].missing, ['300 mg']);
    const a = withAutoGrade(q, { text: 'CBC; aspirin', ticks: null });
    assert.deepEqual([a.ticks, a.partials], [[], [1]]);
    assert.equal(autoMatch(q, 'aspirin 300 mg nhai')[1].level, 'match');
});

test('không bỏ ý đúng vì dùng lại từ của đề hoặc ca bệnh', () => {
    const q = essay({
        question: 'Nêu các bước sao lưu dữ liệu.',
        caseText: 'Thư mục có bản gốc và bản sao lưu dữ liệu.',
        keyPoints: [{ text: 'Sao lưu dữ liệu', keywords: ['sao lưu'] }],
    });
    assert.equal(autoMatch(q, 'Sao lưu dữ liệu')[0].level, 'match');
    assert.deepEqual(withAutoGrade(q, { text: 'Sao lưu dữ liệu' }).ticks, [0]);
});

test('chọn bằng chứng đúng viết phía sau, không kẹt ở lần nhắc phủ định hoặc chép đề', () => {
    const q = essay({
        question: 'Nếu không sao lưu dữ liệu trước khi sửa tệp thì bản gốc có thể bị mất. Cần làm gì?',
        keyPoints: [{ text: 'Sao lưu dữ liệu', keywords: ['sao lưu'] }],
    });
    for (const text of [
        'Không sao lưu bản lỗi. Sao lưu dữ liệu trước khi sửa.',
        'Không sao lưu bản lỗi, sao lưu dữ liệu trước khi sửa.',
        'Không sao lưu bản lỗi. Sao lưu toàn bộ dữ liệu trước khi sửa.',
        q.question + '\nSao lưu dữ liệu trước khi sửa.',
    ]) {
        const m = autoMatch(q, text)[0];
        assert.equal(m.level, 'match', text);
        assert.ok(m.ranges.every(([, s]) => s > text.toLowerCase().indexOf('sao lưu')), text);
    }
    assert.equal(autoMatch(q, 'Không sao lưu dữ liệu')[0].why, 'neg');
    assert.notEqual(autoMatch(q, q.question)[0].level, 'match');
    const noKeywords = essay({ keyPoints: [{ text: 'Sao lưu dữ liệu' }] });
    assert.equal(autoMatch(noKeywords, 'Không sao lưu bản lỗi. Sao lưu dữ liệu.')[0].level, 'match');
});

test('phủ định trong phần giải thích không đảo nghĩa hành động chính', () => {
    const q = essay({ keyPoints: [{ text: 'Sao lưu dữ liệu để không mất bản gốc', keywords: ['sao lưu'] }] });
    assert.equal(autoMatch(q, 'Sao lưu dữ liệu')[0].level, 'match');
    assert.notEqual(autoMatch(q, 'Không sao lưu dữ liệu')[0].level, 'match');
});

test('chép nguyên ý barem có điều kiện phủ định vẫn nhận đúng toàn bộ ý', () => {
    const text = 'Không đáp ứng yêu cầu: kiểm tra cấu hình (configuration)';
    const q = essay({ keyPoints: [{ text, keywords: ['configuration'] }] });
    assert.equal(autoMatch(q, 'Kiểm tra cấu hình khác.\n' + text)[0].level, 'match');
});

test('danh sách không nhãn chấp nhận đổi thứ tự và chấm bài chỉ có parts', () => {
    const q = essay({
        answerFormat: { kind: 'list', count: 2 },
        keyPoints: [{ text: 'Màu xanh', field: 1 }, { text: 'Màu vàng', field: 2 }],
    });
    const ans = { parts: ['Màu vàng', 'Màu xanh'], ticks: null };
    assert.deepEqual(autoMatch(q, ans).map(m => m.level), ['match', 'match']);
    assert.deepEqual(withAutoGrade(q, ans).ticks, [0, 1]);
    assert.equal(essayPoints(q, withAutoGrade(q, ans)), 2);
    assert.deepEqual(withAutoGrade(q, { ...ans, ticks: [], auto: true }).ticks, [0, 1]);
    const manual = { ...ans, ticks: [0], auto: false };
    assert.strictEqual(withAutoGrade(q, manual), manual);
    const named = { ...q, answerFormat: { kind: 'list', labels: [{ hint: 'Màu xanh' }, { hint: 'Màu vàng' }] } };
    assert.deepEqual(withAutoGrade(named, ans).ticks, []);
    for (const answerFormat of [
        { kind: 'list', count: 1 },
        { kind: 'fields', labels: ['Tác vụ'] },
        { kind: 'table', columns: ['Tác vụ'], rows: 1 },
    ]) {
        const single = essay({ answerFormat, keyPoints: [{ text: 'Sao lưu dữ liệu', field: 1 }] });
        assert.deepEqual(withAutoGrade(single, { parts: ['Sao lưu dữ liệu'] }).ticks, [0]);
    }
});

test('không cộng điểm một phần cho ý ngược nghĩa hoặc chép nguyên đề', () => {
    const q = essay({
        question: 'Hãy sao lưu dữ liệu: bản gốc, bản phụ trước khi thực hiện sửa nội dung.',
        keyPoints: [{ text: 'Sao lưu dữ liệu: bản gốc, bản phụ', points: 1, partial: 0.5, keywords: ['sao lưu'] }],
    });
    for (const text of ['Không sao lưu dữ liệu', q.question]) {
        const ans = withAutoGrade(q, { text });
        assert.deepEqual([ans.ticks, ans.partials], [[], []], text);
    }
    assert.deepEqual(withAutoGrade(q, { text: 'Sao lưu bản gốc' }).partials, [0]);
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
    const w = autoMatch(q, wrong);
    assert.deepEqual(w.map(m => m.level), ['near', 'match']);           // ghi nhầm ô: chỉ gợi ý, không tính
    assert.deepEqual([w[0].why, w[0].at], ['elsewhere', 2]);
    assert.deepEqual(withAutoGrade(q, { ...wrong, ticks: null }).ticks, [1]);
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
    assert.deepEqual(autoMatch(q, a).map(m => [m.level, m.why]), [['near', 'elsewhere'], ['near', 'elsewhere']]);    // đổi hàng -> chỉ gợi ý
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
    assert.equal(autoMatch(q, { parts: ['110', '', ''] })[0].why, 'elsewhere');  // ghi ở ô khác -> chỉ gợi ý, không tính
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

// ---- Phiếu chấm bản 2: tách tự động bộ đã nạp (không sửa dữ liệu, không mất chữ) ----
test('why: chuẩn hóa + khứ hồi dạng dòng chữ', () => {
    const kp = [{ text: 'MgSO4', points: 0.5, keywords: ['magnesium'], why: 'Giảm 50% sản giật' }];
    assert.equal(rubricOf(essay({ keyPoints: kp })).items[0].why, 'Giảm 50% sản giật');
    const txt = rubricToText(kp);
    assert.match(txt, /\{vì sao: Giảm 50% sản giật\}$/);
    assert.deepEqual(textToRubric(txt), kp);
    // có cả thứ tự lẫn vì sao, viết mẫu
    const ord = [{ text: 'Đúng thứ tự', points: 1, order: ['A', 'B'], why: 'Sai thứ tự 0 điểm', example: 'Khám A rồi mới B' }];
    assert.deepEqual(textToRubric(rubricToText(ord)), ord);
    assert.deepEqual(textToRubric('- Trấn an (1đ) {viết mẫu: Chị bình tĩnh, kết quả này chưa phải chẩn đoán}'),
        [{ text: 'Trấn an', points: 1, example: 'Chị bình tĩnh, kết quả này chưa phải chẩn đoán' }]);
});

test('answerTextOf: đáp án mẫu nếu có, không thì dựng từ checklist (bỏ lỗi trừ điểm, kèm viết mẫu)', () => {
    assert.equal(answerTextOf(essay({ modelAnswer: 'Mẫu', keyPoints: [{ text: 'A' }] })), 'Mẫu');
    assert.equal(answerTextOf(essay({ keyPoints: [{ text: 'A', example: 'Viết A' }, { text: 'B' }, { text: 'Lỗi', points: -1 }] })),
        '- A — viết mẫu: Viết A\n- B');
});

test('sheetOf: barem gắn ô -> mỗi ô một hàng (+ hàng "cả bài"); không gắn ô -> một hàng', () => {
    const fmt = { kind: 'fields', labels: ['Chẩn đoán', 'Xử trí'] };
    const s = sheetOf(essay({
        answerFormat: fmt,
        keyPoints: [{ text: 'A', field: 1 }, { text: 'B', field: 2 }, { text: 'C' }, { group: 'Nhóm', items: [{ text: 'D', field: 2 }, { text: 'E', field: 2 }] }, { text: 'Lỗi', points: -0.5 }],
    }));
    assert.equal(s.split, true);
    assert.deepEqual(s.rows.map(r => [r.field, r.units.length]), [[1, 1], [2, 2], [0, 1]]);
    assert.deepEqual(s.pens, [5]);
    const one = sheetOf(essay({ answerFormat: fmt, keyPoints: [{ text: 'A' }, { text: 'B' }] }));
    assert.equal(one.split, false);
    assert.equal(one.rows.length, 1);
    // điểm theo unit: nhóm có trần
    const q = essay({ keyPoints: [{ group: 'g', max: 1, items: [{ text: 'x', points: 1 }, { text: 'y', points: 1 }] }] });
    assert.deepEqual(unitScore(q, sheetOf(q).rows[0].units[0], { ticks: [0, 1] }), { got: 1, max: 1 });
});

test('splitModel: tách theo mục khi số mục = số ô, giữ đoạn mở đầu, không nhận nhầm dòng nội dung', () => {
    const q = essay({ modelAnswer: 'Mở đầu:\n\n1. **Bản chất NT:**\n- lớp dịch\n\n2. **Ý nghĩa:**\n- sàng lọc\n- không chẩn đoán' });
    const p = splitModel(q, 2);
    assert.deepEqual(p.map(x => x.title), ['Bản chất NT', 'Ý nghĩa']);
    assert.match(p[0].body, /^Mở đầu:/);
    assert.match(p[0].body, /lớp dịch$/);
    assert.equal(p[1].body, '- sàng lọc\n- không chẩn đoán');
    assert.equal(splitModel(q, 3), null);                                     // số mục lệch -> không tách
    assert.deepEqual(splitModel(essay({ modelAnswer: 'a. Diễn biến:\n- x\nb. Lỗi chủ quan:\n- y' }), 2).map(x => x.title), ['Diễn biến', 'Lỗi chủ quan']);
    assert.equal(splitModel(essay({ modelAnswer: '1. Kháng sinh: ceftriaxone\n2. Dịch truyền: NaCl' }), 2), null);   // nội dung, không phải tiêu đề
    // Tiêu đề CON vô tình đủ số mục (bộ APP 4.6 thật): tên mục không chung tiếng nào với tên ô -> không tách
    const fmt = { kind: 'fields', labels: ['Quyết định can thiệp', 'Lí giải & Kế hoạch theo dõi'] };
    assert.equal(splitModel(essay({ answerFormat: fmt, modelAnswer: 'Chọn b.\n3. **Quản lý chặt chẽ giai đoạn 2:**\n- x\n4. **Quản lý giai đoạn 3 và hậu sản:**\n- y' }), 2), null);
    // Đoạn mở đầu dài (cả bài viết liền trước mục 1) -> không tách
    assert.equal(splitModel(essay({ modelAnswer: 'x '.repeat(200) + '\n1. **A:**\n- a\n2. **B:**\n- b' }), 2), null);
    // Tên mục chung tiếng với tên ô -> tách
    const ok = { kind: 'fields', labels: ['a. Phân tích yếu tố khách quan', 'b. Phân tích lỗi chủ quan'] };
    assert.ok(splitModel(essay({ answerFormat: ok, modelAnswer: 'a. Diễn biến khách quan:\n- x\nb. Yếu tố lỗi chủ quan:\n- y' }), 2));
});

test('splitChot: dòng Chốt của ghi nhớ lên dải Chốt, trùng explanation thì giữ một', () => {
    const a = splitChot(essay({ explanation: 'X là sàng lọc', note: '📌 Chốt: NT dày chưa phải Down.\n⚠️ Bẫy: quên trấn an' }));
    assert.deepEqual(a.chot, ['X là sàng lọc', 'NT dày chưa phải Down.']);
    assert.equal(a.note, '⚠️ Bẫy: quên trấn an');
    const b = splitChot(essay({ explanation: 'MgSO4 trước hạ áp sau', note: '**🎯 Chốt & Phản xạ:** MgSO4 trước hạ áp sau' }));
    assert.deepEqual(b.chot, ['MgSO4 trước hạ áp sau']);
    assert.equal(b.note, '');
    const c = splitChot(essay({ note: '- Nhớ nhanh: 4T' }));                  // không có dòng Chốt -> note nguyên vẹn
    assert.deepEqual(c, { chot: [], note: '- Nhớ nhanh: 4T' });
});

test('studyLayers: tách thẻ ghi nhớ, khúc bẫy của Mở rộng dời sang Ghi nhớ, không mất chữ', () => {
    const q = essay({
        note: '⚠️ Bẫy trạm thi: quên trấn an\n- ý con\n💡 Lời dặn: siêu âm tim thai\n- **Nhớ nhanh:** NT < 3 mm\nDòng tự do',
        expanded: '⚙️ **Tinh hoa 80/20 & Cơ chế lõi:**\nBảng A\n\n⚠️ **Radar cạm bẫy (Error Simulator):**\n- NIPT khi NT dày\n\n🔀 **What-if:**\n- Nếu NT 1,8 mm',
    });
    const L = studyLayers(q);
    assert.deepEqual(L.memo.map(c => [c.label, c.trap]), [['Bẫy trạm thi', true], ['Lời dặn', false], ['Nhớ nhanh', false]]);
    assert.equal(L.memo[0].body, 'quên trấn an\n- ý con');
    assert.equal(L.memo[2].body, 'NT < 3 mm\nDòng tự do');
    assert.deepEqual(L.traps.map(s => s.title), ['Radar cạm bẫy (Error Simulator)']);
    assert.deepEqual(L.more.map(s => s.title), ['Tinh hoa 80/20 & Cơ chế lõi', 'What-if']);
    // Tiêu đề dính nội dung cùng dòng (bộ cũ): vẫn tách khúc, nội dung giữ nguyên
    const inl = studyLayers(essay({ expanded: '⚙️ **Bản chất 80/20:** Nhau thai tiết hPL.\n\n⚠️ **Radar cạm bẫy (Error Simulator):** Dùng thuốc ngay.\n\n🔀 **Tập trận What-if:**\n- Nếu thất bại' }));
    assert.deepEqual(inl.more.map(s => [s.title, s.body]), [['Bản chất 80/20', 'Nhau thai tiết hPL.'], ['Tập trận What-if', '- Nếu thất bại']]);
    assert.deepEqual(inl.traps.map(s => [s.title, s.body]), [['Radar cạm bẫy (Error Simulator)', 'Dùng thuốc ngay.']]);
    // Mở rộng không có khung tiêu đề -> giữ nguyên khối
    const plain = studyLayers(essay({ expanded: '| a | b |\n|---|---|\n| 1 | 2 |' }));
    assert.deepEqual(plain.traps, []);
    assert.equal(plain.more[0].body, '| a | b |\n|---|---|\n| 1 | 2 |');
    // chữ nào của note/expanded cũng còn ở đâu đó
    const all = [...L.chot, ...L.memo.map(c => c.label + ' ' + c.body), ...[...L.traps, ...L.more].map(s => s.title + ' ' + s.body)].join('\n');
    ['quên trấn an', 'ý con', 'siêu âm tim thai', 'NT < 3 mm', 'Dòng tự do', 'Bảng A', 'NIPT khi NT dày', 'Nếu NT 1,8 mm'].forEach(w => assert.ok(all.includes(w), w));
});
