// Lưu bộ đề offline kèm ảnh: quét đủ trường, cất đúng URL proxy, đếm trung thực ảnh lỗi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractQuizImageUrls, cacheQuizImages } from '../quiz-offline-store.js';

const A = 'https://files.catbox.moe/m61iw1.png';
const B = 'https://files.catbox.moe/vycijd.png';
const C = 'https://upload.wikimedia.org/x/y.jpg';

test('quét ảnh ở mọi trường chữ, kể cả trường lồng nhau và <img>', () => {
    const urls = extractQuizImageUrls([{
        question: 'Hỏi', options: ['a', `b ![](${A})`],
        option_explanations: [`![](${B})`], caseText: `<img src="${C}">`,
        note: { text: 'x' }, image: 'https://example.com/q.png',
    }]);
    assert.deepEqual(new Set(urls), new Set([A, B, C, 'https://example.com/q.png']));
});

test('cacheQuizImages: cất URL proxy, ảnh 404 không cất và tính là lỗi', async () => {
    const store = new Map();
    globalThis.caches = { open: async () => ({ match: async (u) => store.get(u), put: async (u, r) => void store.set(u, r) }) };
    globalThis.window = { caches: globalThis.caches };
    globalThis.fetch = async (u) => ({ ok: !u.includes('vycijd'), type: 'cors', status: u.includes('vycijd') ? 404 : 200 });

    const r = await cacheQuizImages([{ note: `![](${A}) ![](${B})` }]);
    assert.deepEqual(r, { total: 2, cached: 1, failed: 1 });
    assert.equal([...store.keys()].length, 1);
    assert.match([...store.keys()][0], /^https:\/\/wsrv\.nl\/\?url=files\.catbox\.moe%2Fm61iw1\.png/);
});
