// Gạch đầu dòng bên trong ô bảng markdown ("- ý 1<br>- ý 2") trong parseMarkdown.
// Chạy: node --test  (từ thư mục webhoctap2)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown } from '../quiz-helpers.js';

const table = (cell) => parseMarkdown(`| Nhóm | Ý |\n|---|---|\n| A | ${cell} |`);

test('"- ý 1<br>- ý 2" trong ô thành danh sách .cell-ul, không còn dấu gạch trần', () => {
    const html = table('- Aspirin<br>- Heparin');
    assert.match(html, /<ul class="cell-ul"><li>Aspirin<\/li><li>Heparin<\/li><\/ul>/);
    assert.ok(!html.includes('- Aspirin'));
});

test('dấu • và <br/> cũng nhận; dòng không dấu thành đoạn dẫn .cell-p', () => {
    const html = table('Dùng sớm<br/>• Aspirin<br />• Heparin');
    assert.match(html, /<div class="cell-p">Dùng sớm<\/div><ul class="cell-ul"><li>Aspirin<\/li><li>Heparin<\/li><\/ul>/);
});

test('in đậm / nghiêng bên trong mục vẫn được xử lý', () => {
    assert.match(table('- **Cấp cứu** ngay<br>- *theo dõi*'), /<li><strong[^>]*>Cấp cứu<\/strong> ngay<\/li><li><em[^>]*>theo dõi<\/em><\/li>/);
});

test('ô thường, ô có "+", số âm, gạch đơn "-" giữ nguyên, không thành danh sách', () => {
    for (const cell of ['Nitrate khi đau', '+ ho khan', '-5 mmHg', '-', 'a<br>b']) {
        assert.ok(!table(cell).includes('cell-ul'), cell);
    }
});

test('danh sách thường ngoài bảng không đổi', () => {
    const html = parseMarkdown('- mục A\n- mục B');
    assert.match(html, /quiz-li/);
    assert.ok(!html.includes('cell-ul'));
});
