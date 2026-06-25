// File: core/file-parser.js
// Module chịu trách nhiệm phân tích và xử lý định dạng file Excel/CSV (sử dụng thư viện XLSX CDN)

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
    caseTitle: ['case title', 'casetitle', 'tiêu đề ca', 'tieu de ca', 'tên ca', 'ten ca', 'tiêu đề case']
};

// Hàm tìm index cột theo alias
function findColumnIdx(headers, aliases) {
    return headers.findIndex(h => {
        const norm = (h || '').toString().trim().toLowerCase();
        return aliases.some(alias => norm === alias.trim().toLowerCase());
    });
}

/**
 * Phân tích file Excel/CSV tải lên thành mảng câu hỏi chuẩn hóa
 * @param {File} file 
 * @returns {Promise<Array>}
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
                if (!jsonData || jsonData.length < 2) return resolve([]);
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
                const parsedQuestions = jsonData.slice(1).map(row => {
                    const questionIdx = colIdx['question'];
                    if (!row || questionIdx === undefined || !row[questionIdx] || String(row[questionIdx]).trim() === '') return null;
                    const option1Idx = colIdx['option1'];
                    const option2Idx = colIdx['option2'];
                    const option3Idx = colIdx['option3'];
                    const option4Idx = colIdx['option4'];
                    const correctIdx = colIdx['correct'];
                    const topicIdx = colIdx['topic'];
                    const explanationIdx = colIdx['explanation'];
                    let correctAnswerIndex = null;
                    if (correctIdx !== undefined && row[correctIdx] != null) {
                        let val = row[correctIdx].toString().trim();
                        if (/^[1-4]$/.test(val)) {
                            correctAnswerIndex = parseInt(val, 10) - 1;
                        } else if (/^[a-dA-D]$/.test(val)) {
                            correctAnswerIndex = val.toUpperCase().charCodeAt(0) - 65;
                        }
                    }
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
                        answers: [option1Idx, option2Idx, option3Idx, option4Idx]
                            .map(idx => idx !== undefined ? row[idx] : undefined)
                            .filter(ans => ans != null && String(ans).trim() !== ''),
                        correctAnswerIndex: correctAnswerIndex,
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
                resolve(normalizeCaseGroups(parsedQuestions));
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
        'Mã ca lâm sàng (Case ID)',
        'Tình huống lâm sàng (Case)',
        'Tiêu đề ca (Case title)'
      ],
      [
        'Lưu ý: Các cột có dấu ★ là bắt buộc phải nhập. Các cột còn lại có thể bỏ trống.', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
      ],
      [
        'Mẹo ca lâm sàng: các câu cùng "Mã ca lâm sàng" sẽ dùng chung một tình huống. Chỉ cần ghi nội dung ca ở dòng đầu, các dòng sau cùng mã sẽ tự kế thừa.', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
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
      {wch: 18}, {wch: 60}, {wch: 25}
    ];
    XLSX.writeFile(workbook, "File mẫu nè.xlsx");
}
