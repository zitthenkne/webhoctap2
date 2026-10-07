// Tiêu đề markdown (#–####) trong parseMarkdown — giai đoạn D · D3.
// Chạy: node --test  (từ thư mục webhoctap2)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown } from '../quiz-helpers.js';

test('"### Mở rộng" thành tiêu đề cấp 3, không còn nguyên chữ ###', () => {
    const html = parseMarkdown('### Mở rộng\n- ý một');
    assert.match(html, /<div class="quiz-md-h quiz-md-h3">Mở rộng<\/div>/);
    assert.ok(!html.includes('###'));
    assert.match(html, /quiz-li/);   // danh sách phía dưới vẫn dựng bình thường
});

test('cấp 1–4 đều nhận; cấp 5 trở lên và "#HTA" (không có khoảng trắng) vẫn là chữ thường', () => {
    for (let n = 1; n <= 4; n++) {
        assert.match(parseMarkdown('#'.repeat(n) + ' Tiêu đề'), new RegExp(`quiz-md-h${n}">`));
    }
    assert.ok(!parseMarkdown('##### Quá sâu').includes('quiz-md-h'));
    assert.ok(!parseMarkdown('#HTA cần điều trị sớm').includes('quiz-md-h'));
    assert.ok(!parseMarkdown('Kết luận: nhóm #1 là ưu tiên').includes('quiz-md-h'));
});

test('dấu # đóng cuối dòng bị bỏ; chữ in đậm bên trong tiêu đề vẫn được xử lý', () => {
    const html = parseMarkdown('## **Cờ đỏ** cấp cứu ##');
    assert.match(html, /quiz-md-h2/);
    assert.ok(!html.includes('##'));
    assert.match(html, /Cờ đỏ/);
});

test('dòng thường, danh sách, bảng không bị ảnh hưởng', () => {
    const text = 'Đoạn một\n\n- mục A\n- mục B\n\n| Cột 1 | Cột 2 |\n|---|---|\n| a | b |';
    const html = parseMarkdown(text);
    assert.ok(!html.includes('quiz-md-h'));
    assert.match(html, /quiz-li/);
    assert.match(html, /cute-table/);
});

test('# bên trong khối mermaid không thành tiêu đề', () => {
    const html = parseMarkdown('```mermaid\nflowchart LR\n  A --> B\n# ghi chú\n```');
    assert.ok(!html.includes('quiz-md-h'));
    assert.match(html, /mermaid-viewer/);
});
