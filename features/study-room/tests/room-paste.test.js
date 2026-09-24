// Kiểm thử bộ tách "Dán đề" của phòng đánh đề (room-paste.js) — thuần JS: node --test features/study-room/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuizText } from '../room-paste.js';

test('trắc nghiệm có "Câu N:", đáp án chữ cái, bỏ phần đầu trang', () => {
    const qs = parseQuizText(`ĐỀ ÔN SINH LÝ — 2 câu

Câu 1: Nút xoang nhĩ nằm ở đâu?
A. Vách liên thất
B. Thành sau nhĩ phải
C. Đỉnh thất trái
D. Van hai lá
Đáp án: B
Giải thích: sát lỗ đổ tĩnh mạch chủ trên

Câu 2: Pha bình nguyên do ion nào?
A. Na+  B. Ca2+  C. K+  D. Cl-
Đáp án: B`);
    assert.equal(qs.length, 2);
    assert.equal(qs[0].question, 'Nút xoang nhĩ nằm ở đâu?');
    assert.deepEqual(qs[0].answers, ['Vách liên thất', 'Thành sau nhĩ phải', 'Đỉnh thất trái', 'Van hai lá']);
    assert.equal(qs[0].correctAnswerIndex, 1);
    assert.match(qs[0].explanation, /tĩnh mạch chủ/);
    assert.deepEqual(qs[1].answers, ['Na+', 'Ca2+', 'K+', 'Cl-'], 'phương án cùng một dòng được tách ra');
    assert.equal(qs[1].correctAnswerIndex, 1);
});

test('câu KHÔNG phương án thành tự luận; "a) b)" chữ thường giữ trong đề; đáp án chữ = bài giải gợi ý', () => {
    const qs = parseQuizText(`Câu 1: Trình bày cơ chế điều hòa huyết áp:
a) ngắn hạn
b) dài hạn
Đáp án: Phản xạ áp cảm thụ quan; hệ RAA.`);
    assert.equal(qs.length, 1);
    assert.equal(qs[0].type, 'essay');
    assert.deepEqual(qs[0].answers, []);
    assert.match(qs[0].question, /a\) ngắn hạn/);
    assert.match(qs[0].modelAnswer, /áp cảm thụ quan/);
});

test('không đánh số: tách theo dòng trống, khối phương án rời vẫn thuộc câu trước', () => {
    const qs = parseQuizText(`1. Cung lượng tim bằng?

A. Tần số × thể tích nhát bóp
B. Huyết áp / sức cản
Đáp án: A

2. Giải thích vì sao suy tim phải gây phù chi dưới.`);
    assert.equal(qs.length, 2);
    assert.equal(qs[0].question, 'Cung lượng tim bằng?');
    assert.equal(qs[0].answers.length, 2);
    assert.equal(qs[0].correctAnswerIndex, 0);
    assert.equal(qs[1].type, 'essay');
});

test('nhiều đáp án "A, C" và câu chưa có đáp án vẫn được giữ (đáp án chỉ là tham khảo)', () => {
    const qs = parseQuizText(`Câu 1: Chọn các thuốc lợi tiểu quai?
A. Furosemide
B. Spironolactone
C. Bumetanide
Đáp án: A, C

Câu 2: Thuốc nào chẹn beta?
A. Metoprolol
B. Amlodipine`);
    assert.equal(qs.length, 2);
    assert.deepEqual(qs[0].correctAnswerIndexes, [0, 2]);
    assert.equal(qs[1].correctAnswerIndex, null);
});

test('chuỗi rỗng / rác không sinh câu', () => {
    assert.deepEqual(parseQuizText(''), []);
    assert.deepEqual(parseQuizText('\n\n   \n'), []);
});
