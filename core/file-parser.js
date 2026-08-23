// File: core/file-parser.js
// Module chịu trách nhiệm phân tích và xử lý định dạng file Excel/CSV (sử dụng thư viện XLSX CDN)
//
// Sau khi đọc thô, dữ liệu được đưa qua core/quiz-autofix.js để tự chữa các lỗi soạn file
// thường gặp (đáp án đúng set nhầm, ô trống, nhãn A./B. thừa, câu trùng…). parseFile() vì vậy
// trả về { questions, report } chứ không còn trả thẳng mảng câu hỏi.

import { autofixQuestions, parseCorrectValue } from './quiz-autofix.js';

const COLUMN_ALIASES = {
    question: ['question', 'câu hỏi', 'nội dung câu hỏi', 'nội dung', 'nội dung đề bài', 'đề bài', 'câu hỏi kiểm tra', 'câu hỏi quiz', 'question content', 'question text', 'question body', 'đề kiểm tra', 'đề quiz', 'question title', 'question name'],
    option1: ['option1', 'phương án 1', 'đáp án 1', 'lựa chọn 1', 'a', 'answer1', 'option a', 'A', 'đáp án a', 'ĐÁP ÁN A', 'lựa chọn a', 'phương án a', 'đáp án thứ nhất', 'đáp án đầu tiên'],
    option2: ['option2', 'phương án 2', 'đáp án 2', 'lựa chọn 2', 'b', 'answer2', 'option b', 'B', 'đáp án b', 'ĐÁP ÁN B', 'lựa chọn b', 'phương án b', 'đáp án thứ hai'],
    option3: ['option3', 'phương án 3', 'đáp án 3', 'lựa chọn 3', 'c', 'answer3', 'option c', 'C', 'đáp án c', 'ĐÁP ÁN C', 'lựa chọn c', 'phương án c', 'đáp án thứ ba'],
    option4: ['option4', 'phương án 4', 'đáp án 4', 'lựa chọn 4', 'd', 'answer4', 'option d', 'D', 'đáp án d', 'ĐÁP ÁN D', 'lựa chọn d', 'phương án d', 'đáp án thứ tư'],
    correct: ['correct', 'đáp án đúng', 'đáp án', 'answer', 'đúng', 'correctanswer', 'đáp án số', 'correct answer', 'đáp án chính xác', 'đáp án chuẩn', 'đáp án trúng', 'đáp án được chọn', 'đáp án đúng nhất', 'đáp án xác nhận'],
    topic: ['topic', 'chủ đề', 'môn học', 'phân loại', 'subject', 'category', 'lĩnh vực', 'topic name', 'topic title', 'lĩnh vực kiến thức', 'lĩnh vực học tập', 'lĩnh vực chủ đề'],
    explanation: ['explanation', 'giải thích', 'lý giải', 'giải nghĩa', 'explain', 'giải thích đáp án', 'giải thích lý do', 'diễn giải', 'phân tích đáp án', 'phân tích', 'chi tiết đáp án'],
    source: ['source', 'nguồn', 'tài liệu', 'reference', 'nguon', 'nguồn tham khảo', 'nguồn gốc', 'nguồn đề', 'nguồn câu hỏi', 'tài liệu tham khảo'],
    level: ['level', 'mức độ', 'độ khó', 'difficulty', 'độ khó khăn', 'muc do', 'cấp độ', 'trình độ', 'bậc', 'độ phức tạp'],
    note: ['note', 'ghi chú', 'ghi chu', 'chú thích', 'comment', 'remark', 'lưu ý', 'nhận xét', 'bổ sung', 'chú giải', 'chú ý'],
    expanded: ['expanded', 'mở rộng', 'mo rong', 'chi tiết mở rộng', 'extended content', 'nội dung mở rộng', 'phần mở rộng'],
    caseId: ['case id', 'caseid', 'mã ca', 'mã case', 'ma ca', 'ma case', 'nhóm ca', 'nhom ca', 'case group', 'mã ca lâm sàng', 'id ca', 'nhóm case'],
    caseText: ['case', 'ca lâm sàng', 'ca lam sang', 'tình huống', 'tinh huong', 'tình huống lâm sàng', 'tinh huong lam sang', 'bệnh án', 'benh an', 'vignette', 'nội dung ca', 'noi dung ca'],
    caseTitle: ['case title', 'casetitle', 'tiêu đề ca', 'tieu de ca', 'tên ca', 'ten ca', 'tiêu đề case'],
    // Phương án 5–6 (tùy chọn) — nhiều bộ đề y khoa có 5 lựa chọn
    option5: ['option5', 'phương án 5', 'đáp án 5', 'lựa chọn 5', 'e', 'answer5', 'option e', 'đáp án e', 'phương án e', 'lựa chọn e'],
    option6: ['option6', 'phương án 6', 'đáp án 6', 'lựa chọn 6', 'f', 'answer6', 'option f', 'đáp án f', 'phương án f', 'lựa chọn f']
};

// Giải thích riêng cho TỪNG phương án. Đây chính là tín hiệu để quiz-autofix suy ra đáp án đúng
// khi cột "đáp án đúng" bị set nhầm, nên nhận diện càng nhiều cách đặt tên càng tốt.
const OPTION_EXP_ALIASES = ['a', 'b', 'c', 'd', 'e', 'f'].map((letter, i) => {
    const n = i + 1;
    const bases = ['giải thích', 'giai thich', 'lý do', 'ly do', 'nhận xét', 'phân tích', 'explanation', 'explain', 'exp', 'why'];
    const targets = [
        String(n), letter, letter.toUpperCase(),
        'đáp án ' + n, 'đáp án ' + letter, 'dap an ' + n, 'dap an ' + letter,
        'phương án ' + n, 'phương án ' + letter, 'phuong an ' + n, 'phuong an ' + letter,
        'lựa chọn ' + n, 'lựa chọn ' + letter, 'option ' + n, 'option ' + letter, 'ý ' + letter
    ];
    const out = [];
    for (const b of bases) for (const t of targets) out.push(b + ' ' + t);
    return out;
});

// Hàm tìm index cột theo alias
function findColumnIdx(headers, aliases) {
    return headers.findIndex(h => {
        const norm = (h || '').toString().trim().toLowerCase();
        return aliases.some(alias => norm === alias.trim().toLowerCase());
    });
}

/**
 * Phân tích file Excel/CSV tải lên thành mảng câu hỏi chuẩn hóa, đã qua bước tự chữa lỗi.
 * @param {File} file
 * @returns {Promise<{questions: Array, report: Object|null}>}
 */
export function parseFile(file) {
    return new Promise((resolve, reject) => {
        if (typeof XLSX === 'undefined') {
            return reject(new Error('Thư viện XLSX chưa được tải!'));
        }
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                if (!jsonData || jsonData.length < 2) return resolve({ questions: [], report: null });
                const headers = jsonData[0].map(h => (h || '').toString().trim().toLowerCase());
                
                const noteIndexes = [];
                headers.forEach((h, idx) => {
                    const norm = (h || '').toLowerCase();
                    if (COLUMN_ALIASES.note.some(alias => norm === alias.trim().toLowerCase()) ||
                        norm.includes('ghi chú') || norm.includes('note')) {
                        noteIndexes.push(idx);
                        let next = idx + 1;
                        while (next < headers.length && (!headers[next] || headers[next].trim() === '')) {
                            noteIndexes.push(next);
                            next++;
                        }
                    }
                });
                
                const uniqueNoteIndexes = [...new Set(noteIndexes)];
                const colIdx = {};
                for (const key in COLUMN_ALIASES) {
                    colIdx[key] = findColumnIdx(headers, COLUMN_ALIASES[key]);
                }
                // Cột giải thích riêng từng phương án (nếu có) — nguồn tín hiệu chính cho autofix
                const optExpIdx = OPTION_EXP_ALIASES.map(aliases => findColumnIdx(headers, aliases));
                const optionCols = ['option1', 'option2', 'option3', 'option4', 'option5', 'option6']
                    .map(k => colIdx[k]);
                const parsedQuestions = jsonData.slice(1).map(row => {
                    const questionIdx = colIdx['question'];
                    if (!row || questionIdx === undefined || !row[questionIdx] || String(row[questionIdx]).trim() === '') return null;
                    const correctIdx = colIdx['correct'];
                    const topicIdx = colIdx['topic'];
                    const explanationIdx = colIdx['explanation'];
                    // Giữ NGUYÊN vị trí các ô đáp án (kể cả ô trống) để chỉ mục đáp án đúng
                    // không bị lệch; quiz-autofix mới là chỗ dọn ô trống và dời chỉ mục theo.
                    const answers = optionCols.map(idx => (idx >= 0 ? row[idx] : undefined))
                        .map(v => (v == null ? '' : String(v)));
                    while (answers.length && answers[answers.length - 1].trim() === '') answers.pop();

                    // Đáp án đúng: chấp nhận 1 hoặc NHIỀU giá trị ("1,3" / "A;C" / "AC")
                    const { indexes: correctIndexes } = parseCorrectValue(
                        correctIdx >= 0 ? row[correctIdx] : '', Math.max(answers.length, 6));
                    const correctAnswerIndex = correctIndexes.length ? correctIndexes[0] : null;
                    const correctAnswerIndexes = correctIndexes.length > 1 ? correctIndexes : null;
                    const sourceIdx = colIdx['source'];
                    const levelIdx = colIdx['level'];
                    const noteIdx = colIdx['note'];
                    const expandedIdx = colIdx['expanded'];
                    const caseIdIdx = colIdx['caseId'];
                    const caseTextIdx = colIdx['caseText'];
                    const caseTitleIdx = colIdx['caseTitle'];
                    
                    let noteValue = '';
                    if (uniqueNoteIndexes.length > 0) {
                        noteValue = uniqueNoteIndexes.map(idx => row[idx] || '').filter(val => val && String(val).trim() !== '').join('\n');
                    } else if (noteIdx !== undefined) {
                        noteValue = row[noteIdx] || '';
                    }
                    return {
                        question: row[questionIdx],
                        answers,
                        correctAnswerIndex: correctAnswerIndex,
                        correctAnswerIndexes: correctAnswerIndexes,
                        optionExplanations: optExpIdx.slice(0, answers.length)
                            .map(idx => (idx >= 0 && row[idx] != null ? String(row[idx]) : '')),
                        explanation: explanationIdx !== undefined ? (row[explanationIdx] || '') : '',
                        topic: topicIdx !== undefined ? (row[topicIdx] || 'Chung') : 'Chung',
                        source: sourceIdx !== undefined ? (row[sourceIdx] || '') : '',
                        level: levelIdx !== undefined ? (row[levelIdx] || '') : '',
                        note: noteValue,
                        expanded: expandedIdx !== undefined ? (row[expandedIdx] || '') : '',
                        caseId: caseIdIdx !== undefined && caseIdIdx >= 0 ? String(row[caseIdIdx] || '').trim() : '',
                        caseText: caseTextIdx !== undefined && caseTextIdx >= 0 ? String(row[caseTextIdx] || '').trim() : '',
                        caseTitle: caseTitleIdx !== undefined && caseTitleIdx >= 0 ? String(row[caseTitleIdx] || '').trim() : ''
                    };
                }).filter(q => q !== null);
                // Tự chữa lỗi TRƯỚC khi gom nhóm ca lâm sàng (autofix có thể loại/gộp câu)
                const { questions, report } = autofixQuestions(parsedQuestions);
                resolve({ questions: normalizeCaseGroups(questions), report });
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Chuẩn hóa các câu hỏi thuộc cùng một ca lâm sàng (clinical case):
 * - Forward-fill: nếu chỉ dòng đầu nhóm ghi nội dung ca, các dòng cùng caseId kế thừa caseText/caseTitle.
 * - Gom nhóm liền nhau theo caseId (giữ thứ tự xuất hiện đầu tiên), kể cả khi các dòng cùng caseId không liền nhau trong file.
 * Câu không có caseId được giữ nguyên vị trí như câu độc lập.
 * @param {Array} questions
 * @returns {Array}
 */
function normalizeCaseGroups(questions) {
    // 1) Forward-fill nội dung/tiêu đề ca theo caseId (lấy giá trị non-empty đầu tiên)
    const meta = {};
    for (const q of questions) {
        if (!q.caseId) continue;
        if (!meta[q.caseId]) meta[q.caseId] = { text: '', title: '' };
        if (q.caseText && !meta[q.caseId].text) meta[q.caseId].text = q.caseText;
        if (q.caseTitle && !meta[q.caseId].title) meta[q.caseId].title = q.caseTitle;
    }
    for (const q of questions) {
        if (!q.caseId) continue;
        if (!q.caseText) q.caseText = meta[q.caseId].text;
        if (!q.caseTitle) q.caseTitle = meta[q.caseId].title;
    }

    // 2) Gom nhóm liền nhau theo caseId, giữ thứ tự xuất hiện đầu tiên
    const order = [];
    const groups = new Map();
    let standaloneSeq = 0;
    for (const q of questions) {
        const key = q.caseId ? 'C:' + q.caseId : 'S:' + (standaloneSeq++);
        if (!groups.has(key)) { groups.set(key, []); order.push(key); }
        groups.get(key).push(q);
    }
    const result = [];
    for (const key of order) {
        for (const q of groups.get(key)) result.push(q);
    }
    return result;
}

/**
 * Tải file Excel mẫu về máy người dùng
 */
export function downloadTemplate() {
    if (typeof XLSX === 'undefined') {
        alert('Thư viện XLSX chưa được tải!');
        return;
    }
    const sampleData = [
      [
        '★ Nội dung câu hỏi',
        '★ Đáp án 1',
        '★ Đáp án 2',
        'Đáp án 3',
        'Đáp án 4',
        '★ Đáp án đúng (1,2,3,4 hoặc A,B,C,D)',
        'Chủ đề',
        'Giải thích',
        'Nguồn (Source)',
        'Mức độ (Level)',
        'Ghi chú (Note)',
        'Mở rộng',
        'Giải thích đáp án 1',
        'Giải thích đáp án 2',
        'Giải thích đáp án 3',
        'Giải thích đáp án 4',
        'Mã ca lâm sàng (Case ID)',
        'Tình huống lâm sàng (Case)',
        'Tiêu đề ca (Case title)'
      ],
      [
        'Lưu ý: Các cột có dấu ★ là bắt buộc phải nhập. Các cột còn lại có thể bỏ trống.', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
      ],
      [
        'Mẹo tự chữa lỗi: nếu bạn điền "Giải thích đáp án 1..4" (ghi rõ đúng/sai cho từng phương án), web sẽ tự dò và sửa lại cột "Đáp án đúng" khi bạn set nhầm.', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
      ],
      [
        'Thủ đô của Việt Nam là gì?',
        'TP. Hồ Chí Minh',
        'Đà Nẵng',
        'Hà Nội',
        'Hải Phòng',
        '3',
        'Địa lý',
        'Hà Nội là thủ đô của nước CHXHCN Việt Nam.',
        'SGK Địa lý 4',
        'Nhận biết',
        'Câu hỏi cơ bản',
        'Hà Nội có diện tích khoảng 3.344 km², với dân số hơn 8 triệu người.',
        'Sai — TP. Hồ Chí Minh là đô thị lớn nhất nhưng không phải thủ đô.',
        'Sai — Đà Nẵng là thành phố trực thuộc trung ương.',
        'Đúng — Hà Nội là thủ đô từ năm 1945.',
        'Sai — Hải Phòng là thành phố cảng.',
        '', '', ''
      ],
      [
        'Vitamin nào tan trong nước?',
        'A',
        'B',
        'D',
        'K',
        '2',
        'Sinh học',
        'Vitamin nhóm B tan trong nước, A/D/K tan trong dầu.',
        'Sách Sinh học nâng cao',
        'Vận dụng',
        'Có thể gây nhầm lẫn cho học sinh',
        'Vitamin B gồm: B1 (thiamine), B2 (riboflavin), B3 (niacin), B5 (pantothenic acid), B6 (pyridoxine), B7 (biotin), B9 (folate), B12 (cobalamine).',
        'Sai — vitamin A tan trong dầu.',
        'Đúng — nhóm B tan trong nước.',
        'Sai — vitamin D tan trong dầu.',
        'Sai — vitamin K tan trong dầu.',
        '', '', ''
      ],
      [
        'Chẩn đoán sơ bộ phù hợp nhất ở bệnh nhân này là gì?',
        'Nhồi máu cơ tim cấp ST chênh lên',
        'Viêm màng ngoài tim cấp',
        'Bóc tách động mạch chủ',
        'Cơn đau thắt ngực ổn định',
        '1',
        'Tim mạch',
        'Đau ngực sau xương ức lan tay trái + ST chênh lên ở DII, DIII, aVF gợi ý NMCT cấp thành dưới.',
        'Harrison 21e',
        'Vận dụng',
        '',
        '',
        '', '', '', '',
        'CA01',
        'Nam 65 tuổi, tiền sử THA và hút thuốc lá 30 gói-năm, vào viện vì đau ngực sau xương ức dữ dội lan tay trái 2 giờ, vã mồ hôi. ECG: ST chênh lên ở DII, DIII, aVF.',
        'Ca 1 – Đau ngực cấp'
      ],
      [
        'Xét nghiệm men tim nào đặc hiệu nhất để khẳng định chẩn đoán?',
        'Troponin I/T',
        'CK toàn phần',
        'AST',
        'LDH',
        '1',
        'Tim mạch',
        'Troponin tim (I hoặc T) có độ nhạy và đặc hiệu cao nhất cho hoại tử cơ tim.',
        'Harrison 21e',
        'Vận dụng',
        '',
        '',
        '', '', '', '',
        'CA01',
        '',
        ''
      ],
      [
        'Xử trí tái tưới máu ưu tiên nếu có thể can thiệp trong vòng 90 phút là gì?',
        'Can thiệp mạch vành qua da (PCI) thì đầu',
        'Tiêu sợi huyết',
        'Chỉ điều trị nội khoa',
        'Phẫu thuật bắc cầu cấp cứu',
        '1',
        'Tim mạch',
        'PCI thì đầu là lựa chọn tái tưới máu ưu tiên khi thực hiện kịp trong cửa sổ thời gian.',
        'Harrison 21e',
        'Vận dụng',
        '',
        '',
        '', '', '', '',
        'CA01',
        '',
        ''
      ]
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Zitthenkne Mau");
    worksheet['!cols'] = [
      {wch: 50}, {wch: 25}, {wch: 25}, {wch: 25}, {wch: 25},
      {wch: 30}, {wch: 25}, {wch: 50}, {wch: 30}, {wch: 20}, {wch: 30}, {wch: 50},
      {wch: 34}, {wch: 34}, {wch: 34}, {wch: 34},
      {wch: 18}, {wch: 60}, {wch: 25}
    ];
    XLSX.writeFile(workbook, "File mẫu nè.xlsx");
}
