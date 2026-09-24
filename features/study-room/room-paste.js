// room-paste.js — tách ĐỀ DÁN (chữ thuần) thành mảng câu hỏi: trắc nghiệm hoặc tự luận.
// Thuần JS, không đụng DOM/Firebase -> chạy được trong node:test (features/study-room/tests/).
import { autofixQuestions, parseCorrectValue } from '../../core/quiz-autofix.js';

const L = (k) => String.fromCharCode(65 + k);

// Mỗi câu bắt đầu bằng "Câu 1:" (hoặc cách nhau 1 dòng trống). Phương án: dòng bắt đầu bằng
// A. / B) … (chữ IN HOA — "a) b)" chữ thường là ý nhỏ của câu tự luận, giữ nguyên trong đề).
// Không có phương án = câu tự luận. "Đáp án: B" (hoặc "A, C") / "Đáp án: <bài giải>" và
// "Giải thích: …" là tùy chọn. Dấu * / (đúng) đánh ngay trên phương án cũng được (autofix gỡ).
const HEAD_RE = /^\s*(?:câu|cau|question|bài|bai)\s*\d{1,3}\s*[:.)\-–]?\s*/i;
const NUM_RE = /^\s*\d{1,3}\s*[.)]\s+/;
const OPT_RE = /^\s*([A-F])\s*[.)]\s*(.*)$/;
const ANS_RE = /^\s*(?:đáp\s*án(?:\s*đúng)?|dap\s*an(?:\s*dung)?|đ\/a|answer|key)\s*[:：]\s*(.*)$/i;
const EXP_RE = /^\s*(?:giải\s*thích|giai\s*thich|explanation|gợi\s*ý|goi\s*y)\s*[:：]\s*(.*)$/i;

export function parseQuizText(raw) {
    const lines = String(raw || '').replace(/\r/g, '').split('\n');
    const byHead = lines.some(l => HEAD_RE.test(l));
    let blocks = [];
    let cur = [];
    const flush = () => { if (cur.some(l => l.trim())) blocks.push(cur); cur = []; };
    let started = !byHead;               // có "Câu 1:" thì bỏ phần đầu trang (tên đề, hướng dẫn…)
    lines.forEach(l => {
        if (byHead) {
            if (HEAD_RE.test(l)) { flush(); started = true; }
            if (started) cur.push(l);
        } else if (!l.trim()) flush();
        else cur.push(l);
    });
    flush();
    // Tách theo dòng trống: khối bắt đầu bằng phương án / đáp án / giải thích là phần đuôi của câu trước
    if (!byHead) blocks = blocks.reduce((acc, b) => {
        const first = b.find(l => l.trim()) || '';
        if (acc.length && (OPT_RE.test(first) || ANS_RE.test(first) || EXP_RE.test(first))) acc[acc.length - 1].push(...b);
        else acc.push(b);
        return acc;
    }, []);

    const out = blocks.map(block => {
        const q = [];
        const opts = [];
        const exp = [];
        let ans = '';
        let mode = 'q';
        block.forEach((line, idx) => {
            let l = idx === 0 ? line.replace(HEAD_RE, '').replace(NUM_RE, '') : line;
            // "A. x   B. y   C. z" nằm chung một dòng
            const parts = /^\s*A\s*[.)]/.test(l) && /\s[B-F]\s*[.)]\s/.test(l) ? l.split(/\s+(?=[B-F]\s*[.)]\s)/) : [l];
            parts.forEach(p => {
                let m;
                if ((m = p.match(ANS_RE))) { mode = 'ans'; ans = m[1]; return; }
                if ((m = p.match(EXP_RE))) { mode = 'exp'; if (m[1].trim()) exp.push(m[1]); return; }
                if ((mode === 'q' || mode === 'opt') && (m = p.match(OPT_RE)) && m[1].charCodeAt(0) - 65 === opts.length) {
                    mode = 'opt'; opts.push(m[2]); return;
                }
                if (mode === 'opt') { if (p.trim()) opts[opts.length - 1] += ' ' + p.trim(); return; }
                if (mode === 'ans') { ans += '\n' + p; return; }
                if (mode === 'exp') { exp.push(p); return; }
                q.push(p);
            });
        });
        const question = q.join('\n').trim();
        if (!question) return null;
        const explanation = exp.join('\n').trim();
        if (opts.length >= 2) {
            const { indexes } = parseCorrectValue(ans, opts.length);
            return {
                question, answers: opts.map(o => o.trim()), explanation, topic: 'Chung',
                correctAnswerIndex: indexes.length ? indexes[0] : null,
                ...(indexes.length > 1 ? { correctAnswerIndexes: indexes } : {}),
            };
        }
        // Tự luận (một dòng "A." lẻ loi thì coi như một ý của đề)
        return {
            question: [question, ...opts.map((o, k) => `${L(k)}. ${o}`)].join('\n'),
            answers: [], type: 'essay', topic: 'Chung', explanation,
            ...(ans.trim() ? { modelAnswer: ans.trim() } : {}),
        };
    }).filter(Boolean);
    return autofixQuestions(out, { keepEssay: true, keepUnanswered: true }).questions;
}
