// Ảnh catbox chậm từ VN -> hiện qua proxy nén WebP (img-proxy.js), parseInlineMarkdown dùng nó.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fastImgUrl } from '../img-proxy.js';
import { parseInlineMarkdown } from '../quiz-helpers.js';

const CB = 'https://files.catbox.moe/m61iw1.png';

test('ảnh png/jpg/webp catbox -> wsrv.nl, link gốc mã hoá trong ?url=', () => {
    const u = new URL(fastImgUrl(CB));
    assert.equal(u.origin, 'https://wsrv.nl');
    assert.equal(u.searchParams.get('url'), 'files.catbox.moe/m61iw1.png');
    assert.equal(u.searchParams.get('output'), 'webp');
    assert.ok(fastImgUrl('https://files.catbox.moe/a.JPG').startsWith('https://wsrv.nl/'));
});

test('host khác, GIF, link hỏng: giữ nguyên', () => {
    for (const s of ['https://upload.wikimedia.org/a.png', 'https://files.catbox.moe/a.gif', 'uploads/a.png', 'không phải url'])
        assert.equal(fastImgUrl(s), s);
});

test('![mô tả](catbox) trong ghi chú/mở rộng ra <img> qua proxy', () => {
    const html = parseInlineMarkdown(`![Lưu đồ](${CB})`);
    assert.match(html, /<img src="https:\/\/wsrv\.nl\/\?url=files\.catbox\.moe%2Fm61iw1\.png&amp;w=1600/);
    assert.match(html, /alt="Lưu đồ"/);
});
