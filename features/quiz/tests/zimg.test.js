// Ảnh bộ đề lưu thẳng trong Firestore: ![mô tả](zimg:<id>) — tham chiếu, URL, hiện ảnh, lưu offline, nạp từ REST.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseZimgRef, zimgIdsIn, zimgUrl, idFromUrl, isZimgUrl, isZimgId, loadZimg, ZIMG_CACHE } from '../../../core/zimg.js';
import { parseInlineMarkdown, parseMarkdown } from '../quiz-helpers.js';
import { extractQuizImageUrls, cacheQuizImages } from '../quiz-offline-store.js';

const ID = '0123456789abcdef0123456789abcdef';
const ID2 = 'fedcba9876543210fedcba9876543210';

test('tham chiếu zimg:<id>: chỉ nhận đúng 32 hex', () => {
    assert.equal(parseZimgRef(`zimg:${ID}`), ID);
    assert.equal(parseZimgRef(` zimg:${ID.toUpperCase()} `), ID);
    for (const bad of ['zimg:abc', `zimg:${ID}0`, `zimg:${'g'.repeat(32)}`, `https://x/zimg:${ID}`, '', null, undefined]) assert.equal(parseZimgRef(bad), null, String(bad));
    assert.ok(isZimgId(ID));
    assert.ok(!isZimgId(ID.toUpperCase()));
    assert.deepEqual(zimgIdsIn(`a ![x](zimg:${ID}) b ![y](zimg:${ID2}) c ![z](zimg:${ID})`).sort(), [ID, ID2].sort());
});

test('URL ảnh ↔ id', () => {
    const u = zimgUrl(ID);
    assert.match(u, new RegExp(`/zimg/${ID}\.webp$`));
    assert.equal(idFromUrl(u), ID);
    assert.equal(idFromUrl(u + '?v=1'), ID);
    assert.equal(idFromUrl('https://files.catbox.moe/abc.png'), null);
    assert.ok(isZimgUrl(u));
    assert.ok(!isZimgUrl(`https://evil.example/zimg/${ID}.webp`), 'chỉ nhận URL cùng gốc với trang');
});

test('![mô tả](zimg:id) → <img src=…/zimg/id.webp data-zimg> (không qua proxy)', () => {
    const html = parseInlineMarkdown(`Hình: ![Lưu đồ sốc](zimg:${ID}) hết`);
    assert.match(html, new RegExp(`<img src="[^"]*/zimg/${ID}\.webp" data-zimg="${ID}" alt="Lưu đồ sốc"`));
    assert.doesNotMatch(html, /wsrv/);
    assert.match(html, /^Hình: <img /);
    // đi qua cả bộ dựng Markdown khối
    assert.match(parseMarkdown(`Đoạn 1\n\n![Hình](zimg:${ID})\n\nĐoạn 2`), new RegExp(`data-zimg="${ID}"`));
});

test('id sai độ dài KHÔNG thành ảnh (giữ nguyên chữ đã thoát)', () => {
    const html = parseInlineMarkdown('![x](zimg:abc123)');
    assert.doesNotMatch(html, /<img/);
});

test('ảnh catbox cũ vẫn đi qua proxy như trước (không hồi quy)', () => {
    assert.match(parseInlineMarkdown('![x](https://files.catbox.moe/m61iw1.png)'), /wsrv\.nl/);
});

test('quét ảnh offline thấy cả zimg ở mọi trường chữ', () => {
    const urls = extractQuizImageUrls([{ question: `Hỏi ![](zimg:${ID})`, options: ['a', 'b'], option_explanations: [`![](zimg:${ID2})`], note: { text: `![x](zimg:${ID})` } }]);
    assert.deepEqual(new Set(urls), new Set([zimgUrl(ID), zimgUrl(ID2)]));
});

function fakeEnv({ status = 200, bytes = 'AQIDBA==' } = {}) {
    const store = new Map(); let fetched = 0;
    globalThis.caches = { open: async () => ({ match: async (u) => store.get(u), put: async (u, r) => void store.set(u, r) }) };
    globalThis.window = { caches: globalThis.caches };
    globalThis.fetch = async (url) => { fetched++; return { ok: status === 200, status, json: async () => ({ fields: { data: { bytesValue: bytes }, mime: { stringValue: 'image/webp' } } }) }; };
    return { store, fetched: () => fetched };
}

test('loadZimg: lấy từ Firestore REST một lần rồi cất vào kho; lần sau 0 mạng', async () => {
    const env = fakeEnv();
    const b1 = await loadZimg(ID);
    assert.equal(b1.type, 'image/webp');
    assert.equal(b1.size, 4);
    assert.equal(env.fetched(), 1);
    assert.ok(env.store.has(zimgUrl(ID)));
    const b2 = await loadZimg(ID);
    assert.equal(b2.size, 4);
    assert.equal(env.fetched(), 1, 'lần hai lấy từ kho, không gọi mạng');
    assert.equal(ZIMG_CACHE, 'zitthenkne-zimg');
});

test('loadZimg: id sai / không có ảnh (404) → lỗi', async () => {
    fakeEnv();
    await assert.rejects(loadZimg('abc'));
    fakeEnv({ status: 404 });
    await assert.rejects(loadZimg(ID2));
});

test('cacheQuizImages: ảnh zimg lấy qua loadZimg, ảnh thiếu tính là lỗi', async () => {
    const env = fakeEnv();
    const ok = await cacheQuizImages([{ note: `![](zimg:${ID})` }]);
    assert.deepEqual(ok, { total: 1, cached: 1, failed: 0 });
    fakeEnv({ status: 404 });
    const bad = await cacheQuizImages([{ note: `![](zimg:${ID2})` }]);
    assert.deepEqual(bad, { total: 1, cached: 0, failed: 1 });
    assert.ok(env.fetched() >= 1);
});
