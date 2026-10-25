import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function source(name) {
    return readFileSync(new URL('../library/' + name, import.meta.url), 'utf8')
        .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];\r?$/gm, '')
        .replace(/^export /gm, '');
}
const copy = value => JSON.parse(JSON.stringify(value));
const flush = () => new Promise(setImmediate);
const initialFolders = [{ id: 'a', name: 'A', parentId: null }, { id: 'b', name: 'B', parentId: 'a' }];

function setup({ folders = initialFolders, quizzes = [{ id: 'q', folderId: null }] } = {}) {
    let cache = copy(folders), readFolders = async () => copy(folders), nextId = 0;
    const writes = [], notices = [];
    const classList = { add() {}, remove() {}, toggle() {} };
    const elements = {
        'quiz-list-container': { innerHTML: '' },
        folderModal: { classList }, folderModalTitle: {},
        folderNameInput: { value: '', classList, dataset: {}, addEventListener() {}, focus() {} },
        saveFolderBtn: {}
    };
    const context = vm.createContext({
        console, setTimeout, clearTimeout, history: { state: null },
        localStorage: { getItem: () => null, setItem() {} }, navigator: { onLine: true },
        document: { getElementById: id => elements[id] || null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
        auth: {}, db: {}, sessionUser: () => ({ uid: 'user' }), onAuthStateChanged: () => () => {},
        collection: (_, name) => ({ name }), doc: () => ({ id: 'new-' + (++nextId) }),
        setDocQ: async (ref, data) => writes.push({ id: ref.id, ...data }), updateDoc: async () => {},
        readMetaCache: () => copy(quizzes), writeMetaCache() {},
        readFoldersCache: () => copy(cache), writeFoldersCache: (_, list) => { cache = copy(list); },
        libraryCacheAge: () => 0, fetchAllQuizMeta: async () => copy(quizzes),
        fetchAllFolders: () => readFolders(),
        loadPinnedQuizIds() {}, loadAttemptCache() {}, syncAttemptsFromServer: async () => false,
        invalidateQuestionIndex() {}, purgeExpiredTrash() {},
        renderLibrary() {}, renderLibrarySkeleton() {}, renderBreadcrumb() {}, rerenderCurrentView() {},
        showToast: (...args) => notices.push(args)
    });
    for (const name of ['library-state.js', 'library-helpers.js', 'library-data.js', 'library-actions.js']) {
        vm.runInContext(source(name), context, { filename: name });
    }
    const api = vm.runInContext('({ S, openFolderModal, saveFolder, loadAndDisplayLibrary, moveFolder, folderPath, childFolders })', context);
    api.S.userFolders = copy(folders);
    return { ...api, writes, notices, cache: () => cache,
        setRead: fn => { readFolders = fn; },
        async create(name, parentId) {
            api.openFolderModal('create', null, '', parentId);
            elements.folderNameInput.value = name;
            await api.saveFolder();
            return writes.at(-1);
        }
    };
}

test('tạo ở cấp đang mở và menu thư mục con đều giữ đúng cha qua nhiều cấp', async () => {
    const env = setup();
    env.S.isLibraryFullyLoaded = true;
    env.S.currentFolderId = 'b';
    const c = await env.create('C');
    assert.equal(c.parentId, 'b');
    // Menu có thể tạo trong C dù màn hình vẫn đang đứng tại B.
    const d = await env.create('D', c.id);
    assert.equal(d.parentId, c.id);
    assert.deepEqual(Array.from(env.folderPath(d.id), f => f.name), ['A', 'B', 'C', 'D']);
    const root = await env.create('Gốc', null);
    assert.equal(root.parentId, null);
});

test('thư viện chưa tải đủ không đọc đè thư mục vừa tạo bằng snapshot chưa có lần ghi mới', async () => {
    const env = setup({ quizzes: [] });
    env.S.currentFolderId = 'b';
    const c = await env.create('C');
    assert.equal(env.S.userFolders.find(f => f.id === c.id)?.parentId, 'b');
    assert.equal(env.cache().find(f => f.id === c.id)?.parentId, 'b');
});

test('lượt tải cũ về sau khi tạo hai cấp con không được xóa nhánh mới khỏi RAM và cache', async () => {
    const env = setup();
    let finish;
    env.setRead(() => new Promise(resolve => { finish = resolve; }));
    const loading = env.loadAndDisplayLibrary(1, { fresh: true });
    await flush();
    env.S.currentFolderId = 'b';
    const c = await env.create('C');
    env.S.currentFolderId = c.id;
    const d = await env.create('D');
    finish(copy(initialFolders));
    await loading;
    assert.deepEqual(Array.from(env.folderPath(d.id), f => f.name), ['A', 'B', 'C', 'D']);
    assert.equal(env.cache().find(f => f.id === d.id)?.parentId, c.id);
});

test('lượt tải cũ không hoàn tác thư mục vừa chuyển sang cha mới', async () => {
    const folders = [...initialFolders, { id: 'c', name: 'C', parentId: 'a' }];
    const env = setup({ folders });
    let finish;
    env.setRead(() => new Promise(resolve => { finish = resolve; }));
    const loading = env.loadAndDisplayLibrary(1, { fresh: true });
    await flush();
    await env.moveFolder('c', 'b');
    finish(copy(folders));
    await loading;
    assert.equal(env.S.userFolders.find(f => f.id === 'c').parentId, 'b');
    assert.equal(env.cache().find(f => f.id === 'c').parentId, 'b');
});

test('không có sửa đổi tại chỗ thì lượt tải mới vẫn cập nhật cây thư mục', async () => {
    const env = setup();
    const folders = [...initialFolders, { id: 'remote', name: 'Từ máy khác', parentId: 'b' }];
    env.setRead(async () => copy(folders));
    await env.loadAndDisplayLibrary(1, { fresh: true });
    assert.equal(env.S.userFolders.find(f => f.id === 'remote')?.parentId, 'b');
    assert.equal(env.cache().find(f => f.id === 'remote')?.parentId, 'b');
});
