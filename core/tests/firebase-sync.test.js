import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Chạy mã thật, chỉ thay SDK/network/storage để tái hiện race và lỗi mà không ghi vào dự án thật.
function load(file, globals, names) {
    const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8')
        .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];\r?$/gm, '')
        .replace(/^export /gm, '')
        .replace("import('./utils.js')", 'Promise.resolve({ showToast })');
    const context = vm.createContext({
        setTimeout, clearTimeout, navigator: { onLine: true },
        console: { warn() {} }, ...globals
    });
    return vm.runInContext(source + '\n;({' + names.join(',') + '})', context);
}

function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
const flush = () => new Promise(setImmediate);
const cachedUser = { uid: 'old-user', email: 'old@example.test' };

function authEnv(t, { offline = false } = {}) {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const ready = deferred(), listeners = new Set();
    const auth = { currentUser: null, authStateReady: () => ready.promise };
    const api = load('auth-session.js', {
        auth, navigator: { onLine: !offline },
        localStorage: { getItem: () => JSON.stringify(cachedUser) },
        onAuthStateChanged: (_, cb) => { listeners.add(cb); return () => listeners.delete(cb); }
    }, ['whenAuthReady']);
    return { ...api, auth, settle(user = null) {
        auth.currentUser = user;
        for (const listener of [...listeners]) listener(user);
        ready.resolve();
    } };
}

test('Auth: hết thời gian chờ khi online không được trả danh tính cũ', async t => {
    const env = authEnv(t);
    const result = env.whenAuthReady(100);
    t.mock.timers.tick(100);
    assert.equal(await result, null);
});

test('Auth: lần chờ ngắn hết hạn không làm lần chờ dài kết thúc sớm', async t => {
    const env = authEnv(t);
    const short = env.whenAuthReady(100);
    let finished = false;
    const long = env.whenAuthReady(1000).then(user => { finished = true; return user; });
    t.mock.timers.tick(100);
    await short;
    await flush();
    assert.equal(finished, false);
    const user = { uid: 'new-user', isAnonymous: true };
    env.settle(user);
    assert.equal(await long, user);
});

test('Auth: đăng xuất xong không dùng lại người dùng của lần khôi phục trước', async t => {
    const env = authEnv(t);
    const initial = env.whenAuthReady();
    const user = { uid: 'user', isAnonymous: true };
    env.settle(user);
    assert.equal(await initial, user);
    env.auth.currentUser = null;
    assert.equal(await env.whenAuthReady(), null);
});

test('Auth: offline vẫn có thể đọc bằng danh tính đã lưu', async t => {
    const env = authEnv(t, { offline: true });
    const result = env.whenAuthReady(100);
    t.mock.timers.tick(100);
    assert.deepEqual(JSON.parse(JSON.stringify(await result)), { ...cachedUser, offline: true });
});

function writeEnv(t, offline = false) {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const toasts = [], cleared = [];
    const api = load('offline-write.js', {
        navigator: { onLine: !offline },
        clearTimeout: id => { cleared.push(id); clearTimeout(id); },
        writeErrorMessage: e => 'Chưa lưu: ' + e.code,
        showToast: (...args) => toasts.push(args)
    }, ['queued']);
    return { ...api, toasts, cleared };
}

test('Ghi: mọi Promise bị reject đều tới caller, kể cả not-found và lỗi mạng', async t => {
    const env = writeEnv(t);
    for (const code of ['permission-denied', 'not-found', 'unavailable', 'cancelled', 'internal']) {
        const error = Object.assign(new Error(code), { code });
        await assert.rejects(env.queued(Promise.reject(error)), e => e === error);
    }
    const error = new Error('lỗi lưu cục bộ');
    await assert.rejects(env.queued(Promise.reject(error)), e => e === error);
    assert.equal(env.toasts.length, 0, 'caller nhận lỗi sớm, không báo toast trùng');
});

test('Ghi: xác nhận sớm phải dọn timer', async t => {
    const env = writeEnv(t);
    await env.queued(Promise.resolve());
    assert.equal(env.cleared.length, 1);
});

test('Ghi: mạng treo vẫn nhả giao diện, lỗi đến muộn được báo', async t => {
    const env = writeEnv(t), write = deferred();
    const result = env.queued(write.promise, 100);
    t.mock.timers.tick(100);
    await result;
    write.reject({ code: 'not-found' });
    await flush();
    assert.equal(env.toasts.length, 1);
    assert.match(env.toasts[0][0], /not-found/);
});

test('Ghi: offline không treo; lỗi đồng bộ muộn được báo và gom thông báo', async t => {
    const env = writeEnv(t, true), first = deferred(), second = deferred();
    await env.queued(first.promise);
    await env.queued(second.promise);
    first.reject({ code: 'unavailable' });
    second.reject({ code: 'permission-denied' });
    await flush();
    assert.equal(env.toasts.length, 1);
});

function restEnv(t, fetch, user = null) {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    return load('firestore-rest.js', {
        auth: { currentUser: user },
        db: { app: { options: { projectId: 'test-project', apiKey: 'test-key' } } },
        whenAuthReady: async () => {}, fetch, AbortController
    }, ['call', 'runQueryRest', 'countRest', 'getDocRest']);
}

test('REST: timeout phải bao trùm tải body sau khi đã nhận headers', async t => {
    let signal;
    const env = restEnv(t, async (_, init) => {
        signal = init.signal;
        return { ok: true, status: 200, json: () => new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(new Error('body aborted')));
        }) };
    });
    const result = env.runQueryRest({ collection: 'quiz_sets' });
    const rejected = assert.rejects(result);
    await flush();
    t.mock.timers.tick(15000);
    assert.equal(signal.aborted, true);
    await rejected;
});

test('REST: chờ token quá lâu phải timeout và không gửi request muộn', async t => {
    const token = deferred();
    let fetched = 0;
    const env = restEnv(t, async () => { fetched++; }, { getIdToken: () => token.promise });
    const result = env.getDocRest('quiz_sets', 'id');
    let settled = false;
    const rejected = assert.rejects(result).then(() => { settled = true; });
    t.mock.timers.tick(15000);
    await flush();
    assert.equal(settled, true);
    token.resolve('late-token');
    await flush();
    assert.equal(fetched, 0);
    await rejected;
});

test('REST: projection, bộ lọc và API key vẫn được giữ khi đọc công khai', async t => {
    let request;
    const env = restEnv(t, async (url, init) => {
        request = { url, init };
        return { ok: true, status: 200, json: async () => [{ document: {
            name: 'projects/test-project/databases/(default)/documents/quiz_sets/quiz1',
            fields: { title: { stringValue: 'Bộ đề' } }
        } }] };
    });
    const rows = await env.runQueryRest({ collection: 'quiz_sets', where: [['isPublic', true]], select: ['title'] });
    assert.equal(rows[0].title, 'Bộ đề');
    assert.equal(rows[0].id, 'quiz1');
    assert.match(request.url, /key=test-key/);
    assert.equal(request.init.cache, 'no-store');
    const query = JSON.parse(request.init.body).structuredQuery;
    assert.deepEqual(query.select.fields, [{ fieldPath: 'title' }]);
    assert.deepEqual(query.where.fieldFilter.value, { booleanValue: true });
});

test('REST: phiên thật gửi Bearer token; 404 trả null; 403 phải báo lỗi', async t => {
    let status = 404, headers;
    const env = restEnv(t, async (_, init) => {
        headers = init.headers;
        return { ok: false, status, json: async () => { throw new Error('không đọc body lỗi'); } };
    }, { getIdToken: async () => 'real-token' });
    assert.equal(await env.getDocRest('quiz_sets', 'missing'), null);
    assert.equal(headers.Authorization, 'Bearer real-token');
    status = 403;
    await assert.rejects(env.getDocRest('quiz_sets', 'private'), /403/);
});
