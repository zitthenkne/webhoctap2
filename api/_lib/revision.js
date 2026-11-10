// api/_lib/revision.js — băm revision nội dung bộ đề PHÍA MÁY CHỦ. Phải ra đúng như features/quiz/quiz-attempt.js (contentRev):
// features/quiz/tests/quiz-attempt.test.js so hai bản. API Vercel chạy CommonJS nên chép lại thay vì import module ESM của trang.
function canon(v) {
    if (v === null || typeof v !== 'object') return v === undefined ? 'null' : JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    // Timestamp của Admin SDK (hiếm khi nằm trong câu hỏi) → chuỗi ISO giống REST
    if (typeof v.toDate === 'function') return JSON.stringify(v.toDate().toISOString());
    return '{' + Object.keys(v).filter(k => k[0] !== '_' && v[k] !== undefined).sort()
        .map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
}
function hash64(str) {
    let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        a = Math.imul(a ^ c, 0x01000193);
        b = Math.imul(b ^ c, 0x5bd1e995);
        b ^= b >>> 15;
    }
    return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
const contentRev = (questions) => 'r' + hash64(canon(Array.isArray(questions) ? questions : []));

module.exports = { canon, hash64, contentRev };
