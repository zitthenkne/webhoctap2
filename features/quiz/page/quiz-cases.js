// File: features/quiz/page/quiz-cases.js
// Nhóm câu hỏi theo ca lâm sàng (caseId): gom khối, gán thứ tự câu trong ca,
// và trạng thái thu gọn khung ca trong phiên làm bài.
// Tách từ quiz-page.js — logic giữ nguyên.

// Trạng thái thu gọn của khung ca lâm sàng, theo caseId, giữ trong phiên làm bài.
// Mặc định ca luôn HIỆN (không có trong map = đang mở); người dùng tự thu gọn nếu muốn.
export const caseCollapseState = {};

// Trả về caseId đã chuẩn hóa của một câu (chuỗi rỗng nếu là câu độc lập, không thuộc ca nào).
export function caseKeyOf(q) {
    return q && q.caseId ? String(q.caseId).trim() : '';
}

// Gom mảng câu hỏi thành mảng các "khối": các câu cùng caseId vào chung một khối
// (theo thứ tự xuất hiện đầu tiên), mỗi câu độc lập là một khối riêng kích thước 1.
export function groupQuestionsByCase(questions) {
    const order = [];
    const map = new Map();
    let soloSeq = 0;
    for (const q of questions) {
        const cid = caseKeyOf(q);
        const key = cid ? 'C:' + cid : 'S:' + (soloSeq++);
        if (!map.has(key)) { map.set(key, []); order.push(key); }
        map.get(key).push(q);
    }
    return order.map(k => map.get(k));
}

// Gán thông tin vị trí trong ca lâm sàng cho từng câu (dựa trên thứ tự cuối cùng,
// các câu cùng caseId được giả định đã đứng liền nhau): __caseSeq (1-based),
// __caseTotal (tổng số câu trong ca), __caseFirst (có phải câu đầu ca không).
export function tagCaseSequence(questions) {
    if (!Array.isArray(questions)) return;
    let i = 0;
    while (i < questions.length) {
        const cid = caseKeyOf(questions[i]);
        if (!cid) {
            delete questions[i].__caseSeq;
            delete questions[i].__caseTotal;
            delete questions[i].__caseFirst;
            i++;
            continue;
        }
        let j = i;
        while (j < questions.length && caseKeyOf(questions[j]) === cid) j++;
        const total = j - i;
        for (let k = i; k < j; k++) {
            questions[k].__caseSeq = k - i + 1;
            questions[k].__caseTotal = total;
            questions[k].__caseFirst = (k === i);
        }
        i = j;
    }
}
