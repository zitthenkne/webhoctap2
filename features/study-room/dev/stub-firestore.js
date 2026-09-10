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

// ---- Phòng ĐÔNG + đề DÀI: ?big=1 (mặc định 60 câu, 14 người) hoặc ?big=<số câu> ----
// Dùng để soi các thành phần chỉ vỡ khi nhiều dữ liệu: đường đua, dải viên kẹo,
// bản đồ câu, bảng phiếu, danh sách thành viên.
const bigParam = new URLSearchParams(location.search).get('big');
if (bigParam) {
    const N = Math.max(10, Number(bigParam) === 1 ? 60 : (Number(bigParam) || 60));
    const M = Math.max(4, Number(new URLSearchParams(location.search).get('people')) || 14);
    const sess0 = store['study_rooms/demo/quizSession/current'];
    const FACES = ['🦊','🐼','🐨','🦄','🐯','🦁','🐸','🐵','🐰','🐻','🐧','🐙','🦖','🐳','🦉','🦋','🐢','🐝'];
    const NAMES = ['Việt Thành','Minh Anh','Bảo Ngọc','Hoàng Long','Thu Hà','Gia Bảo','Khánh Vy','Đức Duy',
                   'Phương Linh','Tuấn Kiệt','Hải Yến','Quang Huy','Ngọc Trâm','Bá Lộc','Thùy Dương','Nhật Nam'];
    const TOPICS = ['Điện sinh lý tim', 'Huyết động', 'Hô hấp', 'Thận – tiết niệu', 'Nội tiết'];
    const LEVELS = ['Nhận biết', 'Thông hiểu', 'Vận dụng'];

    sess0.questions = Array.from({ length: N }, (_, k) => ({
        question: k % 7 === 3
            ? `Câu ${k + 1}: Một bệnh nhân nam ${40 + (k % 30)} tuổi vào viện vì khó thở tăng dần ba ngày nay, kèm phù hai chi dưới và tĩnh mạch cổ nổi. Cơ chế nào sau đây giải thích tốt nhất tình trạng ứ dịch của bệnh nhân này?`
            : `Câu ${k + 1}: ${['Nút xoang nhĩ nằm ở đâu', 'Cung lượng tim tính bằng công thức nào', 'Pha bình nguyên do dòng ion nào', 'Yếu tố nào làm tăng tiền gánh', 'Thuốc nào giảm hậu gánh mạnh nhất'][k % 5]}?`,
        options: [
            'Phương án A ngắn',
            'Phương án B dài hơn một chút để thử xuống dòng trong ô hẹp',
            'Phương án C',
            'Phương án D dài nhất, cố tình viết dài để xem ô phương án có bị vỡ khung hay chữ tràn ra ngoài hay không',
        ],
        answer: (k % 4) + 1,
        topic: TOPICS[k % TOPICS.length],
        level: LEVELS[k % LEVELS.length],
        source: k % 3 === 0 ? 'Guyton & Hall, ch. 10' : '',
        explanation: 'Giải thích mẫu cho câu ' + (k + 1) + '.',
        ...(k % 7 === 3 ? { caseTitle: 'Ca lâm sàng ' + (1 + Math.floor(k / 7)), caseText: 'Nam ' + (40 + (k % 30)) + ' tuổi, khó thở khi gắng sức, phù hai chi dưới, tĩnh mạch cổ nổi.' } : {}),
    }));
    sess0.currentQuestionIndex = Math.floor(N / 3);
    sess0.qStarts = { ['q' + sess0.currentQuestionIndex]: now - 25000 };
    sess0.chosen = {};
    sess0.shown = {};
    for (let k = 0; k < Math.floor(N / 3); k++) { sess0.chosen['q' + k] = k % 4; sess0.shown['q' + k] = true; }

    Object.keys(store).filter(k => k.startsWith('study_rooms/demo/members/')).forEach(k => delete store[k]);
    for (let m = 0; m < M; m++) {
        const uid = m === 0 ? 'u1' : 'u' + (m + 1);
        const done = Math.max(1, Math.round(N * (0.25 + (m % 5) * 0.16)));
        const answers = {};
        for (let k = 0; k < Math.min(done, N); k++) answers['q' + k] = A((k + m) % 4, now - (N - k) * 900, m % 3 === 0);
        store['study_rooms/demo/members/' + uid] = {
            uid, displayName: NAMES[m % NAMES.length], emoji: FACES[m % FACES.length],
            online: m % 6 !== 5, lastSeen: now, cursor: Math.min(N - 1, done),
            lobbyReady: m % 3 !== 2, hand: m === 2 ? now - 3000 : null,
            answers, marks: m % 4 === 0 ? { q0: 'doubt' } : {}, flags: m % 5 === 0 ? { ['q' + sess0.currentQuestionIndex]: true } : {},
            ready: {}, unclear: {}, dissent: {}, diff: {}, likes: {},
        };
    }
}

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
    sess.currentQuestionIndex = Math.max(0, sess.questions.length - 1);
    sess.chosen = { q0: 1, q1: 0, q2: 2 };
    sess.shown = { q0: true, q1: true, q2: true };
    sess.qStarts = { q0: now - 120000, q1: now - 80000, q2: now - 40000 };
    const setAns = (id, v) => { const m = store['study_rooms/demo/members/' + id]; if (m) m.answers = v; };
    setAns('u1', { q0: A(1, now - 118000), q1: A(0, now - 75000), q2: A(2, now - 38000) });
    setAns('u2', { q0: A(1, now - 112000), q1: A(0, now - 70000), q2: A(1, now - 30000) });
    setAns('u3', { q0: A(2, now - 100000), q1: A(2, now - 60000), q2: A(2, now - 25000) });
    setAns('guest_ab12cd', { q0: A(1, now - 90000) });
    // Đề dài (?big) thì chốt hết cho khớp, giữ nguyên đáp án từng người
    if (sess.questions.length > 3) {
        for (let k = 0; k < sess.questions.length; k++) { sess.chosen['q' + k] = k % 4; sess.shown['q' + k] = true; }
        Object.keys(store).filter(k => k.startsWith('study_rooms/demo/members/')).forEach((k, idx) => {
            const m = store[k];
            const ans = {};
            const upto = Math.max(3, Math.round(sess.questions.length * (0.4 + (idx % 5) * 0.15)));
            for (let q = 0; q < Math.min(upto, sess.questions.length); q++) ans['q' + q] = A((q + idx) % 4, now - (sess.questions.length - q) * 900, idx % 3 === 0);
            m.answers = ans;
        });
    }
}

const listeners = [];
const notify = () => listeners.forEach(l => l());
const pathOf = (r) => r.path;

export const doc = (_db, ...p) => ({ path: p.join('/') });
export const collection = (_db, ...p) => ({ path: p.join('/'), isCol: true });
// query/where có lọc thật (chỉ toán tử '=='), đủ để bộ xem trước phân biệt
// "phòng mình tạo" với "phòng chỉ từng vào"; điều kiện lạ thì bỏ qua như trước.
export const query = (ref, ...cs) => ({ ...ref, __w: cs.filter(c => c && c.__w).map(c => c.__w) });
export const where = (field, op, value) => ({ __w: [field, op, value] });
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
function docsIn(colPath, wheres) {
    return Object.keys(store)
        .filter(k => k.startsWith(colPath + '/') && k.slice(colPath.length + 1).indexOf('/') === -1)
        .filter(k => (wheres || []).every(([f, op, v]) => op !== '==' || store[k]?.[f] === v))
        .map(k => ({ id: k.split('/').pop(), data: () => store[k] }));
}
export async function getDocs(q) {
    const docs = docsIn(pathOf(q), q.__w);
    return { empty: !docs.length, docs, size: docs.length, forEach: (f) => docs.forEach(f) };
}
export function onSnapshot(refOrQuery, cb) {
    const path = pathOf(refOrQuery);
    const emit = () => {
        if (refOrQuery.isCol) {
            const docs = docsIn(path, refOrQuery.__w);
            cb({ forEach: (f) => docs.forEach(f), size: docs.length, docs, metadata: { hasPendingWrites: false } });
        } else {
            const d = store[path];
            cb({ exists: () => !!d, data: () => d, metadata: { hasPendingWrites: false } });
        }
    };
    listeners.push(emit);
    // ?slow=<ms>: hoan snapshot PHIEN dau tien de thu man cho (bay "nhay sanh cho")
    const slow = Number(new URLSearchParams(location.search).get('slow')) || 0;
    if (slow && path.includes('quizSession')) setTimeout(emit, slow); else emit();
    return () => { const i = listeners.indexOf(emit); if (i >= 0) listeners.splice(i, 1); };
}
