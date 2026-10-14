// Widget tương tác trong Ghi nhớ / Mở rộng (```widget … ```): parseMarkdown chỉ để lại khung giữ chỗ .qw, mã nằm mã hoá
// trong data-w (dựng iframe sandbox lúc cuộn tới) — không thẻ / script nào của widget lọt thẳng vào trang.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown, widgetBoxHtml, stripWidgets } from '../quiz-helpers.js';
import { wrongItemsMarkdown } from '../quiz-export.js';

const W = '<svg viewBox="0 0 200 80"><circle cx="40" cy="40" r="20" fill="var(--blossom)"/></svg>\n'
    + '<style>@keyframes t{to{transform:translateX(100px)}}circle{animation:t 2s infinite alternate}</style>\n'
    + '<script>const n = 2; document.title = `x${n}`; if (a < b && $ok) {}</script>';

test('khối ```widget -> khung .qw giữ chỗ, mã chỉ nằm mã hoá trong data-w', () => {
    const html = parseMarkdown('## ⚙️ Cơ chế\n```widget 260\n' + W + '\n```\nSau widget có **chữ đậm**.');
    assert.match(html, /<div class="qw" data-w="/);
    assert.match(html, /--qw-h:260px/);
    assert.doesNotMatch(html, /<script|<style|<circle|<svg/i);           // không thẻ nào của widget vào thẳng trang
    assert.doesNotMatch(html, /svg-fig|MATHINLINE|katex/i);              // <svg> trong widget không bị coi là hình SVG, `$` không thành công thức
    const enc = html.match(/data-w="([^"]+)"/)[1];
    assert.equal(decodeURIComponent(enc), W);                            // mã giữ nguyên từng ký tự (cả `${n}`, <, &&, $)
    assert.match(html, /<strong[^>]*>chữ đậm<\/strong>|chữ đậm/);         // phần chữ sau widget vẫn xử lý bình thường
});

test('chiều cao mặc định 240, kẹp 80–900; quá 20 KB -> báo lỗi thay vì chạy', () => {
    assert.match(widgetBoxHtml('<b>x</b>'), /--qw-h:240px/);
    assert.match(widgetBoxHtml('<b>x</b>', 'h=40'), /--qw-h:80px/);
    assert.match(widgetBoxHtml('<b>x</b>', '999'), /--qw-h:900px/);
    assert.match(widgetBoxHtml('x'.repeat(20001)), /quá lớn/);
    assert.equal(widgetBoxHtml('   '), '');
});

test('xuất file / biên bản: thay widget bằng một dòng nhắc', () => {
    const t = 'Trước\n```widget\n' + W + '\n```\nSau';
    assert.equal(stripWidgets(t), 'Trước\n[Minh họa động — xem trên web]\nSau');
    const md = wrongItemsMarkdown([{ n: 1, question: 'Q', options: ['a', 'b'], correct: [0], picked: [1], explanation: '', note: t, expanded: '' }]);
    assert.doesNotMatch(md, /<script|<svg/);
    assert.match(md, /Minh họa động/);
});
