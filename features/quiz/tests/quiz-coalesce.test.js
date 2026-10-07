// Kiểm thử bộ gom lần ghi (quiz-coalesce.js) bằng đồng hồ + hẹn giờ GIẢ — số lần ghi Firestore khi làm bài liên tục.
// Chạy: node --test  (từ thư mục webhoctap2)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCoalescer } from '../quiz-coalesce.js';

// Đồng hồ giả: advance(ms) chạy các hẹn giờ theo thứ tự thời gian
function fakeClock() {
    let t = 0, id = 0;
    const timers = new Map();
    return {
        now: () => t,
        setT: (fn, ms) => { id++; timers.set(id, { at: t + ms, fn }); return id; },
        clearT: (h) => timers.delete(h),
        advance(ms) {
            const end = t + ms;
            for (;;) {
                let next = null;
                for (const [h, x] of timers) if (x.at <= end && (!next || x.at < next[1].at)) next = [h, x];
                if (!next) break;
                timers.delete(next[0]);
                t = next[1].at;
                next[1].fn();
            }
            t = end;
        },
    };
}
const make = (opts) => {
    const clock = fakeClock();
    let runs = 0;
    const co = makeCoalescer(() => { runs++; }, { ...opts, now: clock.now, setT: clock.setT, clearT: clock.clearT });
    return { clock, co, runs: () => runs };
};

test('một lần gọi → chạy đúng một lần sau delay', () => {
    const { clock, co, runs } = make({ delay: 30000, maxWait: 120000 });
    co.call();
    clock.advance(29999); assert.equal(runs(), 0);
    clock.advance(2); assert.equal(runs(), 1);
    clock.advance(200000); assert.equal(runs(), 1);
});

test('gọi dồn dập (mỗi 8s) không bao giờ yên đủ 30s nhưng vẫn chạy mỗi ≤120s', () => {
    const { clock, co, runs } = make({ delay: 30000, maxWait: 120000 });
    for (let k = 0; k < 100; k++) { co.call(); clock.advance(8000); }          // 100 câu trả lời, mỗi 8 giây (~13 phút)
    co.flush();
    // 800s / 120s ≈ 6–7 lần + lần cuối; so với 100 lần của bộ debounce 5s cũ (mỗi lần gọi cách nhau 8s > 5s → mỗi lần gọi là một lần ghi)
    assert.ok(runs() >= 6 && runs() <= 9, `runs=${runs()}`);
});

test('làm chậm (mỗi 45s): mỗi câu vẫn được đẩy sau 30s yên lặng', () => {
    const { clock, co, runs } = make({ delay: 30000, maxWait: 120000 });
    for (let k = 0; k < 20; k++) { co.call(); clock.advance(45000); }
    assert.equal(runs(), 20);
});

test('so với debounce 5s cũ: 100 câu cách nhau 20s', () => {
    const neu = make({ delay: 30000, maxWait: 120000 });
    const cu = make({ delay: 5000, maxWait: Infinity });
    for (let k = 0; k < 100; k++) { neu.co.call(); cu.co.call(); neu.clock.advance(20000); cu.clock.advance(20000); }
    neu.co.flush(); cu.co.flush();
    assert.equal(cu.runs(), 100);
    assert.ok(neu.runs() <= 20, `mới=${neu.runs()}`);       // 2000s / 120s ≈ 17
});

test('flush() chạy ngay khi đang chờ; không chờ thì không làm gì', () => {
    const { clock, co, runs } = make({ delay: 30000, maxWait: 120000 });
    co.flush(); assert.equal(runs(), 0);
    co.call(); co.flush(); assert.equal(runs(), 1);
    clock.advance(500000); assert.equal(runs(), 1);          // hẹn giờ cũ đã bị hủy, không chạy lần hai
    assert.equal(co.pending, false);
});

test('call(d) ghi đè delay cho riêng lần đó và vẫn bị chặn bởi maxWait', () => {
    const { clock, co, runs } = make({ delay: 30000, maxWait: 60000 });
    co.call(500);
    clock.advance(499); assert.equal(runs(), 0);
    clock.advance(2); assert.equal(runs(), 1);
    co.call(); clock.advance(20000); co.call(100000);        // d lớn hơn nhưng maxWait còn 40s
    clock.advance(39999); assert.equal(runs(), 1);
    clock.advance(2); assert.equal(runs(), 2);
});

test('cancel() bỏ lần chờ', () => {
    const { clock, co, runs } = make({ delay: 1000, maxWait: 5000 });
    co.call(); co.cancel(); clock.advance(10000);
    assert.equal(runs(), 0);
    assert.equal(co.pending, false);
});

test('chạy xong thì đợt mới tính lại maxWait từ lần gọi đầu mới', () => {
    const { clock, co, runs } = make({ delay: 30000, maxWait: 120000 });
    co.call(); clock.advance(30000); assert.equal(runs(), 1);
    clock.advance(500000);
    co.call();
    clock.advance(29999); assert.equal(runs(), 1);
    clock.advance(2); assert.equal(runs(), 2);
});
