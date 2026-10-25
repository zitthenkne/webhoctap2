import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Chạy script thật trong <head>: mức đã lưu phải có hiệu lực trước khi CSS vẽ.
const html = readFileSync(new URL('../study-room.html', import.meta.url), 'utf8');
const boot = html.match(/<script>([\s\S]*?)<\/script>/)[1];
for (const [saved, expected] of [
    ['0', []], ['1', ['ui-min']], ['2', ['ui-min', 'ui-min-max']],
    ['3', ['ui-min', 'ui-min-max', 'ui-min-core']], ['99', []], [null, []],
]) {
    test(`mức tinh gọn đã lưu ${saved}: khôi phục trước khi vẽ`, () => {
        const classes = new Set();
        runInNewContext(boot, {
            localStorage: { getItem: key => key === 'roomMinimal' ? saved : 'light' },
            document: { documentElement: { classList: { add: c => classes.add(c) } } },
            matchMedia: () => ({ matches: false }),
        });
        assert.deepEqual([...classes], expected);
    });
}
test('storage bị chặn vẫn mở được trang', () => {
    assert.doesNotThrow(() => runInNewContext(boot, {
        localStorage: { getItem() { throw new Error('Storage blocked'); } },
    }));
});
