// Xuất câu sai (Markdown + CSV Anki) — giai đoạn D · D4. Chạy: node --test (từ thư mục webhoctap2)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrongItemsMarkdown, wrongItemsCsv } from '../quiz-export.js';

const mcq = {
    n: 5, question: 'Chẩn đoán phù hợp nhất?', caseText: '',
    options: ['Viêm phổi', 'Suy tim', 'Hen phế quản', 'Thuyên tắc phổi'],
    correct: [1], picked: [2], explanation: 'Khó thở + phù + TM cổ nổi.', note: 'Nhớ Framingham.', expanded: '',
};
const blank = { n: 9, question: 'Câu bỏ trống', options: ['A1', 'B1'], correct: [0], picked: null, explanation: '', note: '', expanded: '' };
const essay = { n: 12, question: 'Trình bày xử trí NMCT.', options: [], correct: [], picked: null, modelAnswer: 'ECG 10 phút; aspirin.', explanation: '', note: '', expanded: '' };

test('Markdown: tiêu đề có số câu, mỗi câu có đáp án đúng và lựa chọn của bạn', () => {
    const md = wrongItemsMarkdown([mcq, blank], 'Tim mạch');
    assert.match(md, /^# Tim mạch — 2 câu sai hoặc bỏ trống/);
    assert.match(md, /## Câu 5/);
    assert.match(md, /✔ Đáp án đúng: B\. Suy tim/);
    assert.match(md, /✘ Bạn chọn: C\. Hen phế quản/);
    assert.match(md, /Giải thích: Khó thở \+ phù/);
    assert.match(md, /Ghi nhớ: Nhớ Framingham\./);
    assert.match(md, /✘ Bạn chưa trả lời/);          // câu bỏ trống
    assert.ok(!md.includes('Mở rộng:'));             // trường rỗng không in
    assert.ok(!/\n{3,}/.test(md));
});

test('Markdown: nhiều đáp án đúng nối bằng " | "; tự luận in đáp án mẫu, không in lựa chọn', () => {
    const multi = { ...mcq, correct: [0, 2], picked: [1] };
    assert.match(wrongItemsMarkdown([multi]), /✔ Đáp án đúng: A\. Viêm phổi \| C\. Hen phế quản/);
    const md = wrongItemsMarkdown([essay]);
    assert.match(md, /✔ Đáp án mẫu: ECG 10 phút; aspirin\./);
    assert.ok(!md.includes('- A.'));
});

test('CSV Anki: ; ngăn cột, có BOM, nháy kép được nhân đôi, xuống dòng thành <br>, thẻ không khoảng trắng', () => {
    const q = { ...mcq, question: 'Dấu "ran ẩm" gợi ý?\nDòng hai', note: '' };
    const csv = wrongItemsCsv([q, blank], 'Tim mạch tổng hợp');
    assert.ok(csv.startsWith('﻿'));
    const rows = csv.replace('﻿', '').trim().split('\r\n');
    assert.equal(rows.length, 2);
    assert.match(rows[0], /^"Dấu ""ran ẩm"" gợi ý\?<br>Dòng hai<br>A\. Viêm phổi<br>B\. Suy tim/);
    assert.match(rows[0], /";"Đáp án đúng: B\. Suy tim<br>Giải thích: Khó thở \+ phù \+ TM cổ nổi\."/);
    assert.ok(rows[0].endsWith(';"Tim_mạch_tổng_hợp"'));
    assert.ok(!/\n/.test(rows[0]));                  // mỗi thẻ đúng một dòng
});

test('rỗng: không có câu nào vẫn trả chuỗi hợp lệ', () => {
    assert.match(wrongItemsMarkdown([]), /^# 0 câu sai hoặc bỏ trống/);
    assert.equal(wrongItemsCsv([]), '﻿\r\n');
});
