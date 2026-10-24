// Quét dữ kiện & hướng tư duy (trường `reasoning`): chuẩn hóa dữ liệu skill ghi + regex tìm cụm trong đề + HTML thẻ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readReasoning, cueRegex, reasoningBodyHtml } from '../page/quiz-reasoning.js';

const Q = {
    question: 'Bệnh nhân nam, mạch 120 l/p, HA tụt 80/50 mmHg sau tai nạn, còn tiếp xúc được. Phân độ sốc?',
    answers: ['Độ 1', 'Độ 2', 'Độ 3', 'Độ 4'], correctAnswerIndex: 2,
    reasoning: {
        cues: [
            { text: 'HA tụt 80/50 mmHg', kind: 'key', hint: 'bù trừ co mạch đã **cạn**' },
            { text: 'mạch 120 l/p' },
            { text: 'còn tiếp xúc được', kind: 'trap', hint: 'dễ tưởng sốc nhẹ' },
            { text: '   ' },
        ],
        steps: [
            { from: [1, '2'], text: 'Sốc mất bù' },
            { from: ['b1'], out: 'A, B', text: 'Độ 1–2 HA còn bình thường' },
            { from: [3, 'b9', 'b3', 7], out: 'DD', text: 'Độ 4 phải li bì' },
            { from: [1], text: '' },
        ],
        goal: 'Sốc mất máu **độ 3**',
    },
};

test('readReasoning: bỏ mục rỗng, vai mặc định bản lề, kiểu bước tự suy, tham chiếu sai/trỏ tới bị bỏ', () => {
    const r = readReasoning(Q);
    assert.equal(r.cues.length, 3);
    assert.deepEqual(r.cues.map(c => c.kind), ['key', 'key', 'trap']);
    assert.equal(r.steps.length, 3);
    assert.deepEqual(r.steps.map(s => s.type), ['join', 'out', 'out']);
    assert.deepEqual(r.steps[0].from, [{ c: 1 }, { c: 2 }]);
    assert.deepEqual(r.steps[1].from, [{ s: 1 }]);
    assert.deepEqual(r.steps[1].out, ['A', 'B']);
    assert.deepEqual(r.steps[2].from, [{ c: 3 }]);          // b9 (chưa có), b3 (chính nó), 7 (ngoài số dữ kiện) bị bỏ
    assert.deepEqual(r.steps[2].out, ['D']);
    assert.deepEqual(readReasoning({ reasoning: { steps: [{ text: 'x', out: 'gạch B' }] } }).steps[0].out, []);
    assert.equal(readReasoning({ question: 'x' }), null);
    assert.equal(readReasoning({ reasoning: { cues: [], steps: [] } }), null);
});

test('cueRegex: co giãn khoảng trắng, không phân biệt hoa thường tiếng Việt, không khớp giữa chừng một từ', () => {
    assert.ok(cueRegex('HA tụt  80/50').test('… ha   TỤT 80/50 mmHg'));
    assert.ok(cueRegex('Không sốt').test('bệnh nhân KHÔNG SỐT, ho khan'));
    assert.equal(cueRegex('sốt').test('cơn sốtrét'), false);
    assert.equal(cueRegex('HA').test('THAI 12 tuần'), false);
    assert.ok(cueRegex('(+)').test('Troponin (+) lúc vào'));   // ký tự đặc biệt được thoát
    assert.equal(cueRegex('  '), null);
});

test('reasoningBodyHtml: thoát HTML, chỉ **đậm**, có ô đáp án đúng + phương án bị gạch', () => {
    const html = reasoningBodyHtml({ ...Q, reasoning: { ...Q.reasoning, cues: [{ text: '<img src=x onerror=1>' }, ...Q.reasoning.cues] } });
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /&lt;img/);
    assert.match(html, /<b>cạn<\/b>/);
    assert.match(html, /class="qr-ans"[^>]*>C</);
    assert.match(html, /<s class="qr-opt">A<\/s><s class="qr-opt">B<\/s>/);
    assert.match(html, /data-cue="2"/);
    assert.match(html, /<button type="button" class="qr-cue is-key"/);
    assert.doesNotMatch(reasoningBodyHtml(Q, false), /<button/);    // màn kết quả: không nút
    assert.equal(reasoningBodyHtml({ question: 'x' }), '');
});

test('câu nhiều đáp án: ô Chốt liệt kê đủ các đáp án đúng', () => {
    const html = reasoningBodyHtml({ ...Q, correctAnswerIndex: 0, correctAnswerIndexes: [0, 2] });
    assert.match(html, /class="qr-ans"[^>]*>A · C</);
});

test('xáo đáp án: chữ cái ở cues[].in / steps[].out đi theo phương án (không gạch nhầm đáp án đúng)', async () => {
    const { applyOptionOrder } = await import('../quiz-helpers.js');
    const s = applyOptionOrder(Q, [3, 2, 1, 0]);                         // D C B A
    assert.equal(s.correctAnswerIndex, 1);
    const r = readReasoning({ ...s, reasoning: { ...s.reasoning, cues: [{ text: 'Độ 3', in: 'C' }] } });
    assert.equal(applyOptionOrder({ ...Q, reasoning: { cues: [{ text: 'x', in: 'C' }, { text: 'y', in: 'case' }] } }, [3, 2, 1, 0]).reasoning.cues.map(c => c.in).join(), 'B,case');
    assert.deepEqual(readReasoning(s).steps[1].out, ['C', 'D']);       // A,B gốc -> D,C mới (sắp xếp)
    assert.ok(!readReasoning(s).steps.some(st => st.out.includes('B')));   // đáp án đúng (B mới) không bị gạch
    assert.equal(r.cues[0].in, 'C');
});

test('tự luận: bước loại trừ ghi kind:"out" không cần chữ cái phương án, Chốt không có ô đáp án', () => {
    const essay = { type: 'essay', question: 'Thai phụ 32 tuần, HA 150/100 mmHg, đạm niệu 2+. Chẩn đoán và hướng xử trí?', answers: [],
        reasoning: { cues: [{ text: 'HA 150/100 mmHg' }, { text: 'đạm niệu 2+' }], steps: [{ from: [1, 2], text: 'Tiền sản giật' }, { from: [1], kind: 'out', text: 'Loại tăng HA mạn: khởi phát sau 20 tuần' }], goal: 'Tiền sản giật' } };
    const r = readReasoning(essay);
    assert.deepEqual(r.steps.map(s => s.type), ['join', 'out']);
    const html = reasoningBodyHtml(essay);
    assert.match(html, /qr-step is-out/);
    assert.doesNotMatch(html, /qr-ans|qr-opt/);
});

test('thẻ: đầu thẻ đếm dữ kiện/bước + nút gập; thanh từng bước chèn ngay dưới danh sách bước', async () => {
    const { reasoningCardHtml } = await import('../page/quiz-reasoning.js');
    const card = reasoningCardHtml(Q);
    assert.match(card, /id="reason-area"[^>]*class="kb-card kb-reason hidden"/);
    assert.match(card, /class="qr-count">3 dữ kiện · 3 bước</);
    assert.match(card, /class="kb-head qr-fold" aria-expanded="true"/);
    assert.doesNotMatch(card, /data-step-mode/);                     // mặc định hiện hết
    const body = reasoningBodyHtml(Q, true, '<div class="X"></div>');
    assert.match(body, /<\/ol><div class="X"><\/div><\/div>/);       // ngay sau <ol class="qr-steps">, trước Chốt
    assert.equal(reasoningCardHtml({ question: 'x' }), '');
});

test('reasoningLines: bản chữ cho biên bản phòng học / chép sổ tay — đủ dữ kiện, bước, chốt + đáp án', async () => {
    const { reasoningLines } = await import('../quiz-reasoning-core.js');
    const r = reasoningLines(Q);
    assert.deepEqual(r.cues, [
        '1. “HA tụt 80/50 mmHg” (bản lề) — bù trừ co mạch đã **cạn**',
        '2. “mạch 120 l/p” (bản lề)',
        '3. “còn tiếp xúc được” (mồi nhử) — dễ tưởng sốc nhẹ',
    ]);
    assert.equal(r.steps[0], 'B1 · [1 + 2] Tổng hợp: Sốc mất bù');
    assert.equal(r.steps[1], 'B2 · [B1] Loại trừ: Độ 1–2 HA còn bình thường (gạch A, B)');
    assert.match(r.goal, /đáp án C$/);
    assert.equal(reasoningLines({ question: 'x', answers: ['a'] }), null);
});
