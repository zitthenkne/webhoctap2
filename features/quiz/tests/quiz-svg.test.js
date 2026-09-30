// Hình SVG vẽ bằng mã trong nội dung đề (parseMarkdown / svgFigureHtml) — hiện qua <img data:>, không chèn thẳng.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown, svgFigureHtml } from '../quiz-helpers.js';

const SVG = '<svg viewBox="0 0 400 200"><title>Biểu đồ CTG</title><polyline points="0,100 50,90 100,120" fill="none" stroke="#e98bae"/></svg>';

test('khối ```svg và thẻ <svg> trần -> khung ảnh, có xmlns, rộng theo viewBox', () => {
    for (const src of ['Hình:\n```svg\n' + SVG + '\n```\nHết', 'Hình:\n' + SVG + '\nHết']) {
        const html = parseMarkdown(src);
        assert.match(html, /<div class="svg-fig" data-svg="/);
        assert.match(html, /<img src="data:image\/svg\+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22/);
        assert.match(html, /max-width:400px/);
        assert.match(html, /alt="Biểu đồ CTG"/);
        assert.match(html, /Hết/);
        assert.doesNotMatch(html, /<polyline/);                 // không có thẻ SVG thật nào lọt vào trang
    }
});

test('mã độc trong SVG không lọt ra HTML của trang', () => {
    const bad = '<svg width="10" height="10" onload="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)"><rect/></a></svg>';
    const html = parseMarkdown('```svg\n' + bad + '\n```');
    assert.doesNotMatch(html, /<script|onload=|javascript:/i);   // chỉ còn dạng mã hoá trong data URI / data-svg
    assert.match(html, /max-width:10px/);
    assert.equal(svgFigureHtml('không phải svg'), '');
    assert.match(svgFigureHtml('<svg>' + 'x'.repeat(200001) + '</svg>'), /quá lớn/);
});

test('không đụng khối mermaid', () => {
    const html = parseMarkdown('```mermaid\nflowchart LR\n A --> B\n```');
    assert.match(html, /mermaid-viewer/);
    assert.doesNotMatch(html, /svg-fig/);
});

test('ảnh Markdown: nhận https / data / nội bộ, chặn chèn thuộc tính và javascript:', async () => {
    const { parseInlineMarkdown } = await import('../quiz-helpers.js');
    const ok = parseInlineMarkdown('![Leopold](https://upload.wikimedia.org/wikipedia/commons/e/eb/Handgriffe.JPG)');
    assert.match(ok, /<img src="https:\/\/upload\.wikimedia\.org\/[^"]+" alt="Leopold" loading="lazy"/);
    assert.doesNotMatch(parseInlineMarkdown('![x](javascript:alert(1))'), /<img/);
    assert.doesNotMatch(parseInlineMarkdown('![x](https://a.b/c.png" onerror="alert(1))'), /onerror="/);
    assert.match(parseInlineMarkdown('![x](uploads/a.png)'), /<img src="uploads\/a\.png"/);
});
