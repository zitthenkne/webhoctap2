// Đường kẻ ---, ==tô==, ~~gạch~~, `mã` trong parseMarkdown (2026-11-03).
// Chạy: node --test  (từ thư mục webhoctap2)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown, parseInlineMarkdown } from '../quiz-helpers.js';

test('"---" / "***" / "- - -" đứng riêng một dòng thành đường kẻ, không thành mục danh sách', () => {
    for (const hr of ['---', '***', '___', '- - -', '* * *']) {
        const html = parseMarkdown(`Đoạn một\n${hr}\nĐoạn hai`);
        assert.match(html, /<hr class="quiz-md-hr">/, hr);
        assert.ok(!html.includes('quiz-li'), hr);
    }
    assert.match(parseMarkdown('| a | b |\n|---|---|\n| 1 | 2 |'), /cute-table/);   // dòng kẻ bảng không bị đụng
    assert.ok(!parseMarkdown('-- chưa đủ ba').includes('quiz-md-hr'));
});

test('==tô== và ~~gạch~~; mũi tên "==>" và "a == b" giữ nguyên', () => {
    assert.equal(parseInlineMarkdown('siêu âm ==ngả âm đạo=='), 'siêu âm <mark class="quiz-mark">ngả âm đạo</mark>');
    assert.equal(parseInlineMarkdown('~~bỏ~~ thuốc'), '<s class="quiz-strike">bỏ</s> thuốc');
    assert.ok(!parseInlineMarkdown('A ==> B ==> C').includes('<mark'));
    assert.ok(!parseInlineMarkdown('nếu a == b thì').includes('<mark'));
});

test('`mã` inline dùng lớp .quiz-code', () => {
    assert.equal(parseInlineMarkdown('gõ `npm test`'), 'gõ <code class="quiz-code">npm test</code>');
});

test('công thức $HbA_2$ không bị luật _nghiêng_ / ==tô== làm hỏng', () => {
    const html = parseMarkdown('tỷ lệ $HbA_2$ bình thường và $\\alpha_2\\beta_2$');
    assert.match(html, /\$HbA_2\$/);
    assert.match(html, /\$\\alpha_2\\beta_2\$/);
});
