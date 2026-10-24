import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Chạy đúng helper của module trình duyệt, thay các import giao diện / cloud bằng stub.
const source = readFileSync(new URL('../page/quiz-annotations.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?$/gm, '').replace(/^export /gm, '');
const storage = new Map();
const ctx = vm.createContext({
    NOTE_TAGS: [], state: { quizData: { id: 'test' } },
    studyKeys: () => ({ annot: 'annotations' }), pushStudyToCloud() {},
    localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) }
});
vm.runInContext(source, ctx);
const { packNoteLane, noteMinWidth, addAnnot, updateAnnotNote, setNoteColors, noteColor } =
    vm.runInContext('({ packNoteLane, noteMinWidth, addAnnot, updateAnnotNote, setNoteColors, noteColor })', ctx);

test('cụm sát nhau: chia khoảng trống hai phía, không chồng / tràn ở 240–1024px', () => {
    for (const width of [240, 280, 320, 375, 480, 768, 1024]) {
        for (const anchor of [0, width / 2, width - 8]) {
            const items = [{ nat: Math.min(208, width), x: anchor }, { nat: 76, x: anchor + 12 }];
            packNoteLane(items, width);
            assert.ok(items[0].left >= -0.01);
            assert.ok(items[1].left + items[1].width <= width + 0.01);
            assert.ok(items[1].left - items[0].left - items[0].width >= 15.99);
            items.forEach(it => assert.ok(it.width >= Math.floor(noteMinWidth(it.nat, width))));
        }
    }
    const single = [{ nat: 200, x: 710 }];
    packNoteLane(single, 768);
    assert.equal(single[0].left, 520);
    assert.equal(single[0].trailing, true); // gần mép phải: ghi chú sang trái, mũi tên nối vào mép phải
});

test('ưu tiên gần cụm: ghi chú dài sang trái khi xếp cả hai sang phải sẽ phải nối quá xa', () => {
    const items = [
        { nat: 380, x: 360, x0: 355, x1: 365, lead: 26 },
        { nat: 180, x: 720, x0: 680, x1: 750, lead: 26 }
    ];
    packNoteLane(items, 940);
    assert.equal(items[0].trailing, true);
    assert.equal(items[1].trailing, false);
    assert.ok(items[0].left + items[0].width + 40 <= items[1].left);
    items.forEach(it => {
        const turn = it.left + (it.trailing ? it.width - it.lead + 16 : it.lead - 16);
        assert.ok(Math.max(it.x0 - turn, 0, turn - it.x1) <= 24);
    });
});

test('dịch nhẹ để đủ khoảng thở và giữ hướng đọc phải nếu mũi tên vẫn gần cụm', () => {
    const items = [
        { nat: 380, x: 360, x0: 305, x1: 415, lead: 26 },
        { nat: 180, x: 720, x0: 680, x1: 750, lead: 26 }
    ];
    packNoteLane(items, 940);
    assert.equal(items[0].trailing, false);
    assert.equal(items[1].trailing, false);
    assert.ok(items[1].left - items[0].left - items[0].width >= 40);
});

test('ưu tiên hướng đọc sang phải sau khi đã bảo đảm gần cụm và không chật', () => {
    const roomy = [{ nat: 180, x: 720, x0: 680, x1: 750, lead: 26 }];
    packNoteLane(roomy, 940);
    assert.equal(roomy[0].trailing, false);
    const edge = [{ nat: 180, x: 900, x0: 880, x1: 920, lead: 26 }];
    packNoteLane(edge, 940);
    assert.equal(edge[0].trailing, true); // gần cụm có ưu tiên cao hơn hướng đọc khi sát mép màn hình
    assert.ok(edge[0].left + edge[0].width <= 940);
});

test('điểm neo được dịch tới mép highlight để cả hai ghi chú có khoảng thở mà không kéo mũi tên xa', () => {
    const items = [
        { nat: 370, x: 288.63, x0: 242.39, x1: 334.88, lead: 26.24 },
        { nat: 196, x: 607.61, x0: 584.70, x1: 630.52, lead: 26.24 }
    ];
    packNoteLane(items, 964);
    assert.ok(items[1].left - items[0].left - items[0].width >= 39.99);
    items.forEach(it => assert.ok(it.leaderDistance <= 24));
    assert.equal(items[1].trailing, false);
});

test('màu tự chọn lưu cùng ghi chú; sửa nội dung giữ màu, Tự động gỡ màu, bỏ giá trị CSS lạ', () => {
    storage.clear();
    const id = addAnnot('q', 'q', 'cụm từ', 'note', 0, 6, 'ghi chú', { color: '#AABBCC', inkColor: '#123456' });
    const item = () => JSON.parse(storage.get('annotations')).q[0];
    assert.equal(item().color, '#aabbcc');
    assert.equal(item().inkColor, '#123456');
    updateAnnotNote('q', id, 'nội dung mới');
    assert.equal(item().inkColor, '#123456');
    const css = new Map();
    const el = { style: { setProperty: (k, v) => css.set(k, v), removeProperty: k => css.delete(k) } };
    setNoteColors(el, item());
    assert.equal(css.get('--nt'), '#aabbcc');
    assert.equal(css.get('--nt-ink'), '#123456');
    updateAnnotNote('q', id, 'nội dung mới', {});
    assert.equal(item().color, undefined);
    assert.equal(item().inkColor, undefined);
    setNoteColors(el, item());
    assert.equal(css.size, 0);
    for (const invalid of ['red', '#fff', 'url(x)', '#123456;display:none', {}, null]) assert.equal(noteColor(invalid), '');
});
