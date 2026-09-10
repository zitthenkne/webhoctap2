// CHỈ DÙNG ĐỂ XEM TRƯỚC GIAO DIỆN — giả lập Firestore bằng dữ liệu trong bộ nhớ.
const A = (i, at, guess) => ({ i, at, guess: !!guess });
const now = Date.now();

const store = {
    'study_rooms/demo': { owner: 'u1', banned: [], goal: 'Làm 3 câu Sinh lý tim mạch, câu nào lệch ý thì bàn kỹ.' },
    'study_rooms/demo/members/u1': {
        uid: 'u1', displayName: 'Việt Thành', emoji: '🦊', online: true, lastSeen: now, cursor: 0, lobbyReady: true,
        answers: { q0: A(1, now - 4000) }, marks: {}, flags: {}, ready: {}, unclear: {}, likes: {},
    },
    'study_rooms/demo/members/u2': {
        uid: 'u2', displayName: 'Minh Anh', emoji: '🐼', online: true, lastSeen: now, cursor: 1, hand: now - 2000, lobbyReady: true,
        answers: { q0: A(1, now - 9000), q1: A(0, now - 3000) }, marks: { q0: 'doubt' }, flags: { q0: true }, ready: { q0: true },
    },
    'study_rooms/demo/members/u3': {
        uid: 'u3', displayName: 'Bảo Ngọc', emoji: '🐨', online: true, lastSeen: now, cursor: 0,
        answers: { q0: A(2, now - 12000, true) }, marks: {}, flags: {},
    },
    'study_rooms/demo/members/guest_ab12cd': {
        uid: 'guest_ab12cd', displayName: 'Hoàng Long', emoji: '🦄', online: true, lastSeen: now, cursor: 2,
        answers: { q0: A(1, now - 20000) }, marks: {}, flags: {},
    },
    'study_rooms/demo/quizSession/current': {
        quizTitle: 'Sinh lý học — Hệ tuần hoàn',
        mode: 'coop',
        questions: [
            {
                question: 'Nút xoang nhĩ (SA node) nằm ở đâu?',
                options: ['Vách liên thất', 'Thành sau nhĩ phải, gần lỗ đổ tĩnh mạch chủ trên', 'Đỉnh thất trái', 'Van hai lá'],
                answer: 2,
                explanation: 'Nút xoang nhĩ là chủ nhịp sinh lý, nằm ở thành sau trên của nhĩ phải.',
                optionExplanations: [
                    'Vách liên thất là nơi có bó His, không phải nút xoang.',
                    'Đúng — sát lỗ đổ của tĩnh mạch chủ trên.',
                    'Đỉnh thất trái không có mô nút.',
                    'Van hai lá là cấu trúc van, không dẫn nhịp.',
                ],
                topic: 'Điện sinh lý tim', level: 'Nhận biết', source: 'Guyton & Hall, ch. 10',
                expanded: 'Tần số phát nhịp: nút xoang 60–100/phút > nút nhĩ thất 40–60 > mạng Purkinje 20–40.',
                note: 'Nhớ: "xoang trên, nhĩ thất dưới" theo hướng dẫn truyền.',
            },
            {
                question: 'Cung lượng tim được tính bằng công thức nào?',
                options: ['Tần số tim × thể tích nhát bóp', 'Huyết áp / sức cản', 'Thể tích cuối tâm trương − cuối tâm thu', 'Áp lực × diện tích'],
                answer: 1,
                topic: 'Huyết động', level: 'Thông hiểu',
                caseTitle: 'Ca lâm sàng 1',
                caseText: 'Nam 62 tuổi, khó thở khi gắng sức, phù hai chi dưới, tĩnh mạch cổ nổi.',
            },
            {
                question: 'Pha nào của điện thế hoạt động cơ tim do dòng Ca²⁺ đi vào?',
                options: ['Pha 0', 'Pha 1', 'Pha 2 (bình nguyên)', 'Pha 4'],
                answer: 3,
                source: 'Bài giảng Sinh lý ĐHYD',
            },
        ],
        timerSec: 0, liveStats: true, freeRoam: true,
        hostId: 'u1', hostName: 'Việt Thành', cohosts: ['u2'],
        currentQuestionIndex: 0,
        qStarts: { q0: now - 20000 },
        deadline: null,
        chosen: {}, shown: {}, notes: {}, optNotes: {}, notesBy: {}, editing: {}, edits: {}, issues: {},
        locked: false, ended: false,
        pinnedNote: 'Ai xong câu nào thì giơ tay bàn câu đó nha!',
        sourceQuizId: null,
        startedAtMs: now - 60000,
    },
    'study_rooms/demo/messages/m1': { type: 'notice', text: 'Việt Thành đã mở phiên đánh đề (3 câu).', createdAt: { toDate: () => new Date() } },
    'study_rooms/demo/messages/m2': { type: 'chat', uid: 'u2', displayName: 'Minh Anh', text: 'Câu 1 mình phân vân B với C', qIdx: 0, createdAt: { toDate: () => new Date() } },
    'study_rooms/demo/messages/m3': { type: 'chat', uid: 'u1', displayName: 'Việt Thành', text: 'Ai chọn C giơ tay giải thích thử nha', qIdx: 0, createdAt: { toDate: () => new Date() } },
};

// Trạng thái xem trước: ?state=lobby | announced | ended | lead
const view = new URLSearchParams(location.search).get('state') || '';
const sess = store['study_rooms/demo/quizSession/current'];
if (view === 'lobby') sess.questions = [];
if (view === 'lead') { sess.mode = 'lead'; sess.timerSec = 30; sess.deadline = now + 22000; sess.freeRoam = false; }
if (view === 'shown') { sess.shown = { q0: true }; sess.notes = { q0: 'Mình nghĩ B vì nút xoang nằm sát lỗ tĩnh mạch chủ trên.' }; sess.notesBy = { q0: { name: 'Minh Anh', at: now } }; }
if (view === 'announced') {
    sess.shown = { q0: true };
    sess.chosen = { q0: 1 };
    sess.notes = { q0: 'Nút xoang nhĩ là chủ nhịp sinh lý của tim, nằm ở thành sau trên nhĩ phải.' };
    sess.notesBy = { q0: { name: 'Bảo Ngọc', at: now } };
    sess.optNotes = { q0: { o2: 'Đỉnh thất trái không có mô nút.' } };
    sess.issues = { q0: '' };
}
if (view === 'ended') {
    sess.ended = true;
    sess.currentQuestionIndex = 2;
    sess.chosen = { q0: 1, q1: 0, q2: 2 };
    sess.shown = { q0: true, q1: true, q2: true };
    sess.qStarts = { q0: now - 120000, q1: now - 80000, q2: now - 40000 };
    store['study_rooms/demo/members/u1'].answers = { q0: A(1, now - 118000), q1: A(0, now - 75000), q2: A(2, now - 38000) };
    store['study_rooms/demo/members/u2'].answers = { q0: A(1, now - 112000), q1: A(0, now - 70000), q2: A(1, now - 30000) };
    store['study_rooms/demo/members/u3'].answers = { q0: A(2, now - 100000), q1: A(2, now - 60000), q2: A(2, now - 25000) };
    store['study_rooms/demo/members/guest_ab12cd'].answers = { q0: A(1, now - 90000) };
}

const listeners = [];
const notify = () => listeners.forEach(l => l());
const pathOf = (r) => r.path;

export const doc = (_db, ...p) => ({ path: p.join('/') });
export const collection = (_db, ...p) => ({ path: p.join('/'), isCol: true });
export const query = (ref) => ref;
export const where = () => ({});
export const orderBy = () => ({});
export const limit = () => ({});
export const serverTimestamp = () => ({ toDate: () => new Date(), toMillis: () => Date.now() });
export const arrayUnion = (v) => ({ __union: v });
export const arrayRemove = (v) => ({ __remove: v });
export const deleteField = () => ({ __delete: true });
export const writeBatch = () => ({ set() {}, update() {}, delete() {}, commit: async () => {} });

function applyPatch(target, patch) {
    Object.entries(patch).forEach(([k, v]) => {
        if (v && v.__union) { target[k] = [...new Set([...(target[k] || []), v.__union])]; return; }
        if (v && v.__remove) { target[k] = (target[k] || []).filter(x => x !== v.__remove); return; }
        if (k.includes('.')) {
            const [head, ...rest] = k.split('.');
            target[head] = target[head] || {};
            let cur = target[head];
            while (rest.length > 1) { const s = rest.shift(); cur[s] = cur[s] || {}; cur = cur[s]; }
            cur[rest[0]] = v;
            return;
        }
        target[k] = v;
    });
}

export async function setDoc(ref, data, opts) {
    store[pathOf(ref)] = opts?.merge ? { ...(store[pathOf(ref)] || {}), ...data } : { ...data };
    notify();
}
export async function updateDoc(ref, patch) {
    store[pathOf(ref)] = store[pathOf(ref)] || {};
    applyPatch(store[pathOf(ref)], patch);
    notify();
}
export async function addDoc(col, data) {
    const id = 'x' + Math.random().toString(36).slice(2, 8);
    store[`${pathOf(col)}/${id}`] = data;
    notify();
    return { id };
}
export async function deleteDoc(ref) { delete store[pathOf(ref)]; notify(); }
export async function getDoc(ref) {
    const d = store[pathOf(ref)];
    return { exists: () => !!d, data: () => d, id: pathOf(ref).split('/').pop() };
}
function docsIn(colPath) {
    return Object.keys(store)
        .filter(k => k.startsWith(colPath + '/') && k.slice(colPath.length + 1).indexOf('/') === -1)
        .map(k => ({ id: k.split('/').pop(), data: () => store[k] }));
}
export async function getDocs(q) {
    const docs = docsIn(pathOf(q));
    return { empty: !docs.length, docs, size: docs.length, forEach: (f) => docs.forEach(f) };
}
export function onSnapshot(refOrQuery, cb) {
    const path = pathOf(refOrQuery);
    const emit = () => {
        if (refOrQuery.isCol) {
            const docs = docsIn(path);
            cb({ forEach: (f) => docs.forEach(f), size: docs.length, docs, metadata: { hasPendingWrites: false } });
        } else {
            const d = store[path];
            cb({ exists: () => !!d, data: () => d, metadata: { hasPendingWrites: false } });
        }
    };
    listeners.push(emit);
    emit();
    return () => { const i = listeners.indexOf(emit); if (i >= 0) listeners.splice(i, 1); };
}
