// CHỈ DÙNG ĐỂ XEM TRƯỚC GIAO DIỆN — giả lập Firestore bằng dữ liệu trong bộ nhớ.
const A = (i, at, guess) => ({ i, at, guess: !!guess });
const now = Date.now();
const at = (k) => { const t = now - 600000 + k * 1000; return { toDate: () => new Date(t), toMillis: () => t }; };

const store = {
    'study_rooms/demo': { owner: 'u1', banned: [], goal: 'Làm 3 câu Sinh lý tim mạch, câu nào lệch ý thì bàn kỹ.' },
    'study_rooms/demo/members/u1': {
        uid: 'u1', displayName: 'Việt Thành', emoji: '🦊', online: true, lastSeen: now, cursor: 0, lobbyReady: true,
        answers: { q0: { ...A(1, now - 4000), from: 2, n: 1 } }, marks: {}, flags: {}, ready: {}, unclear: {}, likes: {},
        // Nhận xét trong khối đáp án (đã ĐỔI Ý từ C sang B)
        args: { q0: { a1: { t: 'Đỉnh thất trái chỉ có mạng Purkinje, không có mô nút phát nhịp — nên B hợp lý nhất.', o: 1, s: 'pro', at: now - 3000 } },
                q3: { a4: { t: 'Thiếu cơ chế hóa cảm thụ quan khi huyết áp tụt sâu.', qt: 'phản xạ áp cảm thụ quan ở xoang cảnh và quai động mạch chủ', o: null, s: 'cmt', at: now - 1500 } } },
        agree: { a2: true },
    },
    'study_rooms/demo/members/u2': {
        uid: 'u2', displayName: 'Minh Anh', emoji: '🐼', online: true, lastSeen: now, cursor: 1, hand: now - 2000, lobbyReady: true,
        answers: { q0: { ...A(1, now - 9000), why: 'Guyton ch.10: nút xoang nằm ở <b>thành sau trên nhĩ phải</b>, sát lỗ đổ tĩnh mạch chủ trên.' }, q1: A(0, now - 3000) },
        marks: { q0: 'doubt' }, flags: { q0: true }, ready: { q0: true },
        args: { q0: { a2: { t: 'C sai: nếu nút xoang ở đỉnh thất thì sóng P phải đi sau QRS.', o: 2, s: 'con', at: now - 2500 } } },
        agree: { a1: true },
    },
    'study_rooms/demo/members/u3': {
        uid: 'u3', displayName: 'Bảo Ngọc', emoji: '🐨', online: true, lastSeen: now, cursor: 0,
        // Con trỏ đang sửa ô Giải thích (bản 27 — thấy cờ tên + vùng bôi đen); at ở tương lai để bản xem trước khỏi hết hạn
        caret: { q: 0, k: 'explain', s: 4, e: 12, at: now + 36e5 },
        answers: { q0: { ...A(2, now - 12000, true), why: 'Mình nhớ mang máng là ở đỉnh tim, chưa chắc lắm.' } }, marks: {}, flags: {},
        args: { q0: { a3: { t: 'Có tài liệu nào ghi chính xác vị trí nút xoang không mọi người?', o: null, s: 'ask', at: now - 1000 } },
                q3: { a5: { t: 'Nên thêm ý thận điều hòa qua bài niệu áp lực.', o: null, s: 'cmt', at: now - 800 } } },
    },
    'study_rooms/demo/members/guest_ab12cd': {
        uid: 'guest_ab12cd', displayName: 'Hoàng Long', emoji: '🦄', online: true, lastSeen: now, cursor: 2,
        answers: { q0: A(1, now - 20000) }, marks: {}, flags: {}, agree: { a1: true, a2: true },
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
                question: 'Cung lượng tim được tính bằng công thức nào? (gợi ý: $CO = HR \\times SV$, bình thường $K<5$ L/phút là thấp)',
                options: ['Tần số tim × thể tích nhát bóp', 'Huyết áp / sức cản', 'Thể tích cuối tâm trương − cuối tâm thu', 'Áp lực × diện tích'],
                answer: 1,
                // bộ xem trước: công thức inline + khối + \[ \] + sơ đồ Mermaid (và một sơ đồ SAI cú pháp) để soi hiển thị
                explanation: 'Theo định nghĩa: $$CO = HR \\times SV$$ Huyết áp trung bình: \\[MAP \\approx DBP + \\frac{1}{3}(SBP - DBP)\\]\n\n```mermaid\nflowchart LR\n    A[Tiền tải ↑] --> B[Thể tích nhát bóp ↑]\n    C[Tần số tim ↑] --> D{Cung lượng tim}\n    B --> D\n```',
                expanded: 'Sơ đồ lỗi để thử thẻ báo lỗi:\n\n```mermaid\nflowchart LR\n    A[[ --> \n```',
                topic: 'Huyết động', level: 'Thông hiểu',
                caseId: 'ca1', caseTitle: 'Ca lâm sàng 1',
                caseText: 'Nam 62 tuổi, khó thở khi gắng sức, phù hai chi dưới, tĩnh mạch cổ nổi.\n\n| Chỉ số | Kết quả |\n|---|---|\n| HA | 150/95 mmHg |\n| Mạch | 104 l/p |\n| NT-proBNP | 2.400 pg/mL |',
            },
            {
                question: 'Pha nào của điện thế hoạt động cơ tim do dòng Ca²⁺ đi vào?',
                options: ['Pha 0', 'Pha 1', 'Pha 2 (bình nguyên)', 'Pha 4'],
                answer: 3,
                source: 'Bài giảng Sinh lý ĐHYD',
                // cùng chùm với câu trên (câu chùm dùng chung ca) — để thử phiếu ca + chấm nhảy câu
                caseId: 'ca1', caseTitle: 'Ca lâm sàng 1',
                caseText: 'Nam 62 tuổi, khó thở khi gắng sức, phù hai chi dưới, tĩnh mạch cổ nổi.\n\n| Chỉ số | Kết quả |\n|---|---|\n| HA | 150/95 mmHg |\n| Mạch | 104 l/p |\n| NT-proBNP | 2.400 pg/mL |',
            },
            // Câu TỰ LUẬN (không phương án) — MỘT bài làm chung (notes.q3) + nhận xét song song
            {
                question: 'Trình bày cơ chế điều hòa huyết áp:\na) ngắn hạn\nb) dài hạn',
                options: [], type: 'essay', topic: 'Huyết động', level: 'Vận dụng',
                modelAnswer: 'Ngắn hạn: phản xạ áp cảm thụ quan, hóa cảm thụ quan, thiếu máu não. Dài hạn: thận – dịch cơ thể, hệ renin–angiotensin–aldosteron.',
            },
        ],
        timerSec: 0, liveStats: true, freeRoam: true,
        hostId: 'u1', hostName: 'Việt Thành', cohosts: ['u2'],
        currentQuestionIndex: 0,
        qStarts: { q0: now - 20000 },
        deadline: null,
        chosen: {}, shown: {}, optNotes: {}, editing: {}, edits: {}, issues: {},
        notes: { q3: '<p><b>Ngắn hạn:</b> phản xạ áp cảm thụ quan ở xoang cảnh và quai động mạch chủ → hành não → điều chỉnh giao cảm/phó giao cảm.</p><p><b>Dài hạn:</b> thận điều hòa thể tích dịch.</p>' },
        notesBy: { q3: { name: 'Minh Anh', at: now - 5000 } },
        alsoOk: {}, split: {},
        locked: false, ended: false,
        pinnedNote: 'Ai xong câu nào thì giơ tay bàn câu đó nha!',
        sourceQuizId: null,
        startedAtMs: now - 60000,
    },
    // (at(k) = mốc cố định k giây sau 10 phút trước — xem hàm at bên dưới)
    'study_rooms/demo/messages/m1': { type: 'notice', text: 'Việt Thành đã mở phiên đánh đề (3 câu).', createdAt: at(1) },
    'study_rooms/demo/messages/m2': { type: 'chat', uid: 'u2', displayName: 'Minh Anh', text: 'Câu 1 mình phân vân B với C', qIdx: 0, createdAt: at(2) },
    'study_rooms/demo/messages/m3': { type: 'chat', uid: 'u1', displayName: 'Việt Thành', text: 'Ai chọn C giơ tay giải thích thử nha', qIdx: 0, createdAt: at(3) },
    // Tin mẫu cho bản nâng cấp bàn bạc: trả lời + thẻ "chọn B" + ảnh nhúng + thẻ tài liệu
    'study_rooms/demo/messages/m4': { type: 'chat', uid: 'u3', displayName: 'Bảo Ngọc', ans: 1, qIdx: 0,
        text: 'Mình chọn **B** vì nút xoang nằm ở thành sau nhĩ phải, sát lỗ đổ TMC trên.\n> Guyton ch.10: "SA node … near the opening of the superior vena cava"',
        reply: { id: 'm2', name: 'Minh Anh', text: 'Câu 1 mình phân vân B với C' },
        images: [{ u: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAABQCAIAAABd+SbeAAAA2ElEQVR4nO3QMQ2AUBAFQfxLQQAaQBA1eKD4yS2TXL/vZruO+/M9+/n5/tbd/vYw6HgXNOhWFzToVhc06FYXNOhWFzToVhc06FYXNOhWFzToVhf0KuiJoyd2QYNudUGDbnVBg251QYNudUGDbnVBg251QYNudUGDbnVBg251Qa+Cnjh6Yhc06FYXNOhWFzToVhc06FYXNOhWFzToVhc06FYXNOhWFzToVhf0KuiJoyd2QYNudUGDbnVBg251QYNudUGDbnVBg251QYNudUGDbnVBg251QS/qvvb2yxZdnJfUAAAAAElFTkSuQmCC' }], createdAt: at(4) },
    'study_rooms/demo/messages/m5': { type: 'doc', uid: 'u2', displayName: 'Minh Anh', qIdx: 0,
        title: 'Guyton & Hall — Textbook of Medical Physiology', src: 'Chương 10 · trang 123', link: 'https://example.com/guyton-ch10',
        text: 'The sinus node is located in the superior posterolateral wall of the right atrium immediately below and slightly lateral to the opening of the superior vena cava.',
        createdAt: at(5) },
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

    // Đường dẫn nguồn kiểu thật: dài 2-3 dòng, nhiều nhánh `›` — dùng để soi dòng thông tin câu.
    const LONG_SRC = 'Giáo trình(text) › "Chương 2: Tiếp Cận Sốc và Huyết Động" › Bảng Phân Độ Sốc Mất Máu Theo ATLS, dòng Xử trí dịch/máu';
    // Đề dài kiểu ca lâm sàng nhiều dữ kiện — dùng để soi cỡ chữ tự co (`#question-text[data-len]`).
    const LONG_Q = (k) => `Câu ${k + 1}: Bệnh nhân nam ${40 + (k % 30)} tuổi bị đứt gần lìa cổ tay phải sau tai nạn lao động, đã được băng ép và hiện không chảy máu thêm, không có dấu hiệu chấn thương bên ngoài nào khác. Khám thấy da lạnh ẩm, niêm nhạt, mạch quay nhanh nhỏ 118 lần/phút, huyết áp 90/60 mmHg, nhịp thở 25 lần/phút, SpO2 94% khí trời, nước tiểu 20 ml trong giờ vừa rồi. Cận lâm sàng nào sau đây là thích hợp nhất cần thực hiện ngay tại thời điểm này?`;

    sess0.questions = Array.from({ length: N }, (_, k) => ({
        question: k % 7 === 5
            ? LONG_Q(k)
            : k % 7 === 3
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
        source: k % 3 === 0 ? LONG_SRC : (k % 3 === 1 ? 'Guyton & Hall, ch. 10' : ''),
        explanation: 'Giải thích mẫu cho câu ' + (k + 1) + '.',
        ...(k % 4 === 1 ? { expanded: 'Phần mở rộng mẫu cho câu ' + (k + 1) + '.' } : {}),
        ...(k % 5 === 2 ? { note: 'Mẹo ghi nhớ mẫu cho câu ' + (k + 1) + '.' } : {}),
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
// &rich=1 (kèm state=lobby): sảnh chờ đầy đủ — đề sắp làm, hẹn giờ 4 phút nữa, buổi trước, tin nhắn chung
if (view === 'lobby' && new URLSearchParams(location.search).get('rich')) {
    Object.assign(store['study_rooms/demo'], {
        title: 'Nhóm Y4 ôn nội trú', emoji: '🫀',
        scheduledAt: now + 4 * 60000 + 12000,
        next: {
            title: 'Sinh lý tim mạch — đề ôn tập 2', qCount: 40, cases: 6, withExp: 32, by: 'Việt Thành', at: now - 60000,
            topics: [{ n: 'Điện sinh lý tim', c: 12 }, { n: 'Huyết động', c: 9 }, { n: 'Cung lượng tim', c: 7 }, { n: 'Mạch vành', c: 6 }, { n: 'Điều hòa huyết áp', c: 6 }],
            levels: [{ n: 'Nhận biết', c: 14 }, { n: 'Thông hiểu', c: 16 }, { n: 'Vận dụng', c: 10 }],
        },
        live: { title: 'Thận — tiết niệu (đề 1)', qCount: 30, ended: true, endedAt: now - 26 * 3600000, avg: 64, people: 5, sourceQuizId: 'quiz_than_1' },
        rollCall: { at: now - 5000, by: 'Minh Anh', byUid: 'u2' },
    });
    // bộ đề trong "thư viện" để thử nút "Làm lại đề này" ở thẻ Buổi trước
    store['quiz_sets/quiz_than_1'] = {
        title: 'Thận — tiết niệu (đề 1)', userId: 'u1',
        questions: [
            { question: 'Đơn vị chức năng của thận là gì?', answers: ['Nephron', 'Tiểu cầu', 'Ống góp', 'Bể thận'], correct: 0, topic: 'Giải phẫu thận', level: 'Nhận biết' },
            { question: 'GFR bình thường khoảng bao nhiêu?', answers: ['60', '125 mL/phút', '200', '20'], correct: 1, topic: 'Lọc cầu thận', level: 'Thông hiểu' },
            { question: 'ADH tác động chủ yếu ở đâu?', answers: ['Ống lượn gần', 'Quai Henle', 'Ống góp', 'Cầu thận'], correct: 2, topic: 'Lọc cầu thận', level: 'Thông hiểu' },
        ],
    };
    store['study_rooms/demo/messages/l1'] = { type: 'chat', uid: 'u2', displayName: 'Minh Anh', text: 'Mọi người ơi 8h mình bắt đầu nha 🙌', createdAt: at(30) };
    store['study_rooms/demo/messages/l2'] = { type: 'chat', uid: 'u3', displayName: 'Bảo Ngọc', text: 'Ok, mình ôn lại **điện thế hoạt động** trước đã', createdAt: at(40) };
    store['study_rooms/demo/messages/l3'] = { type: 'chat', uid: 'u1', displayName: 'Việt Thành', text: 'Đề 40 câu, có 6 ca lâm sàng nha', createdAt: at(50) };
    // bong bóng cảm xúc trên ghế (mốc ở tương lai để còn hiện lúc chụp ảnh)
    Object.keys(store).filter(k => k.startsWith('study_rooms/demo/members/') && store[k].displayName === 'Hoàng Long')
        .forEach(k => { store[k].reaction = { e: '🔥', at: Date.now() + 60000 }; });
}
// &state=multi: chốt nhiều đáp án (B + C) · &state=split: nhóm chưa thống nhất
if (view === 'multi') { sess.shown = { q0: true }; sess.chosen = { q0: 1 }; sess.alsoOk = { q0: [2] }; }
if (view === 'split') { sess.shown = { q0: true }; sess.split = { q0: { at: now, by: 'Việt Thành' } }; }
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
window.__stubStore = store;   // cho script kiểm thử đọc thẳng dữ liệu giả (vd. đếm vật trên bảng trắng)
const notify = () => listeners.forEach(l => l());
const pathOf = (r) => r.path;

export const doc = (_db, ...p) => ({ path: p.join('/') });
export const collection = (_db, ...p) => ({ path: p.join('/'), isCol: true });
// query/where có lọc thật (chỉ toán tử '=='), đủ để bộ xem trước phân biệt
// "phòng mình tạo" với "phòng chỉ từng vào"; điều kiện lạ thì bỏ qua như trước.
export const query = (ref, ...cs) => ({ ...ref, __w: cs.filter(c => c && c.__w).map(c => c.__w), __o: cs.find(c => c && c.__o)?.__o });
export const where = (field, op, value) => ({ __w: [field, op, value] });
export const orderBy = (field, dir = 'asc') => ({ __o: [field, dir] });
export const limit = () => ({});
export const serverTimestamp = () => { const t = Date.now(); return { toDate: () => new Date(t), toMillis: () => t }; };
export const arrayUnion = (v) => ({ __union: v });
export const arrayRemove = (v) => ({ __remove: v });
export const deleteField = () => ({ __delete: true });
// Lô ghi thật (bảng trắng ghi theo lô): gom thao tác rồi áp một lượt khi commit
export const writeBatch = () => {
    const ops = [];
    return {
        set(ref, data, opts) { ops.push(() => { store[pathOf(ref)] = opts?.merge ? { ...(store[pathOf(ref)] || {}), ...data } : { ...data }; }); },
        update(ref, patch) { ops.push(() => { store[pathOf(ref)] = store[pathOf(ref)] || {}; applyPatch(store[pathOf(ref)], patch); }); },
        delete(ref) { ops.push(() => { delete store[pathOf(ref)]; }); },
        commit: async () => { ops.forEach(f => f()); notify(); },
    };
};

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
// orderBy thật (chỉ cho mốc thời gian / số) để khung Thảo luận xếp tin đúng thứ tự như Firestore
const msOf = (v) => (typeof v === 'number' ? v : v?.toMillis?.() ?? v?.toDate?.()?.getTime?.() ?? 0);
function docsIn(colPath, wheres, order) {
    const list = Object.keys(store)
        .filter(k => k.startsWith(colPath + '/') && k.slice(colPath.length + 1).indexOf('/') === -1)
        .filter(k => (wheres || []).every(([f, op, v]) => op !== '==' || store[k]?.[f] === v));
    if (order) {
        const [f, dir] = order;
        list.sort((a, b) => (msOf(store[a]?.[f]) - msOf(store[b]?.[f])) * (dir === 'desc' ? -1 : 1));
    }
    return list.map(k => ({ id: k.split('/').pop(), data: () => store[k] }));
}
export async function getDocs(q) {
    const docs = docsIn(pathOf(q), q.__w, q.__o);
    return { empty: !docs.length, docs, size: docs.length, forEach: (f) => docs.forEach(f) };
}
export function onSnapshot(refOrQuery, cb) {
    const path = pathOf(refOrQuery);
    const emit = () => {
        if (refOrQuery.isCol) {
            const docs = docsIn(path, refOrQuery.__w, refOrQuery.__o);
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
