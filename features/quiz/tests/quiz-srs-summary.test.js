// Chuông ôn theo BẢN TÓM TẮT (srsSum) phải ra y hệt phép quét cả mảng srs cũ — kể cả đổi múi giờ, tạm dừng, đồng bộ muộn.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
    get length() { return store.size; },
    key: (i) => [...store.keys()][i] ?? null,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
};
const srs = await import('../quiz-srs-store.js');
const DAY = 86400000;

function deck(now) {
    // hạn luôn chốt cuối ngày (endOfDay) như lịch thật; có quá hạn, hôm nay, vài ngày tới, xa
    const m = {};
    [-3, -1, 0, 0, 1, 1, 2, 5, 6, 9, 30].forEach((k, i) => {
        m['Câu ' + i] = { n: i % 5, ivl: k, due: srs.endOfDay(now + k * DAY), lapses: i % 4, last: now - 1000 * i };
    });
    m['đến hạn trong ngày'] = { n: 1, ivl: 0, due: now - 5, lapses: 0, last: now - 50 };
    return m;
}

test('tóm tắt == quét: số đến hạn, dự báo 7 ngày, học / thuộc / khó', () => {
    store.clear();
    const now = Date.UTC(2026, 10, 10, 9, 30);
    const map = deck(now);
    srs.writeSrsMap('A', map);
    localStorage.setItem('quiz_srs_meta_A', JSON.stringify({ title: 'Bộ A', total: 40 }));
    const scan = srs.getAllSrsDeckDetails(7, now);
    const scanBell = srs.getAllSrsSummaries(now);

    // máy MỚI: chưa có lịch trong máy, chỉ có bản tóm tắt kéo từ cloud
    store.clear();
    localStorage.setItem('quiz_srs_meta_A', JSON.stringify({ title: 'Bộ A', total: 40 }));
    srs.writeSrsSummary('A', JSON.parse(JSON.stringify(srs.summarizeSrs(map))));
    assert.deepEqual(srs.getAllSrsDeckDetails(7, now), scan);
    assert.deepEqual(srs.getAllSrsSummaries(now), scanBell);
    // vài giờ sau (qua mốc hạn) vẫn khớp — tóm tắt giữ ĐÚNG giá trị due, không làm tròn ở máy đọc
    for (const later of [now + 3 * 3600e3, now + DAY + 60e3, now + 6 * DAY]) {
        store.clear(); srs.writeSrsMap('A', map); localStorage.setItem('quiz_srs_meta_A', JSON.stringify({ title: 'Bộ A', total: 40 }));
        const s1 = srs.getAllSrsDeckDetails(7, later);
        store.clear(); srs.writeSrsSummary('A', srs.summarizeSrs(map)); localStorage.setItem('quiz_srs_meta_A', JSON.stringify({ title: 'Bộ A', total: 40 }));
        assert.deepEqual(srs.getAllSrsDeckDetails(7, later), s1);
    }
});

test('tạm dừng: bộ không vào chuông nhưng vẫn ở bảng điều khiển', () => {
    store.clear();
    const now = Date.UTC(2026, 10, 10, 9, 30);
    srs.writeSrsSummary('B', srs.summarizeSrs(deck(now)));
    localStorage.setItem('quiz_srs_meta_B', JSON.stringify({ title: 'Bộ B', paused: true, pausedAt: now }));
    assert.equal(srs.getAllSrsSummaries(now).length, 0);
    assert.equal(srs.getAllSrsDeckDetails(7, now)[0].paused, true);
});

test('đồng bộ muộn: lịch trong máy mới hơn thì dùng lịch trong máy, tóm tắt cloud mới hơn thì dùng tóm tắt', () => {
    store.clear();
    const now = Date.UTC(2026, 10, 10, 9, 30);
    const cloudMap = deck(now);
    const localMap = { 'Câu 0': { n: 4, ivl: 9, due: srs.endOfDay(now + 9 * DAY), lapses: 0, last: now + 5000 } };
    srs.writeSrsMap('C', localMap);
    srs.writeSrsSummary('C', srs.summarizeSrs(cloudMap));                 // tóm tắt cũ hơn lần ôn trong máy
    assert.equal(srs.getAllSrsDeckDetails(7, now)[0].learned, 1);
    srs.writeSrsSummary('C', { ...srs.summarizeSrs(cloudMap), last: now + 9000 });   // máy khác vừa ôn sau đó
    assert.equal(srs.getAllSrsDeckDetails(7, now)[0].learned, Object.keys(cloudMap).length);
});
