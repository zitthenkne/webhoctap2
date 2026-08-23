// File: core/quiz-autofix.js
// "Tự chữa lỗi" cho bộ đề người dùng tải lên (Excel/CSV/JSON).
//
// Vấn đề thực tế: file soạn tay hay bị sai cột "đáp án đúng" — nhất là khi người soạn
// viết giải thích cho TỪNG phương án ("... đúng vì ...", "... sai vì ...") nhưng cột đáp án
// lại điền nhầm (lệch 1 vị trí, dùng nhãn A/B/C/D trong khi phương án đã bị xáo, hoặc gõ ẩu).
//
// Module này KHÔNG đoán mò: chỉ sửa khi có tín hiệu chắc chắn, và chỉ tự động sửa hàng loạt
// khi số câu lệch vượt ngưỡng (mặc định > 3) — tức là lỗi hệ thống chứ không phải câu cá biệt.
// Dưới ngưỡng thì chỉ báo cáo để người dùng tự quyết.
//
// Thuần JS, không đụng DOM -> chạy được trong node:test (features/quiz/tests/quiz-autofix.test.js).

// Ngưỡng mặc định: nhiều hơn 3 câu lệch thì coi là người dùng set nhầm cả bộ -> tự sửa.
export const AUTOFIX_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Tiện ích chuỗi
// ---------------------------------------------------------------------------
const s = (v) => (v == null ? '' : String(v));
const trim = (v) => s(v).replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();

// Bỏ dấu tiếng Việt để so khớp từ khóa không phụ thuộc cách gõ
function deaccent(str) {
    return s(str).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}
const norm = (str) => deaccent(str).toLowerCase().trim();

// Khóa so sánh nội dung (bỏ dấu câu, khoảng trắng) — dùng để phát hiện trùng lặp
const contentKey = (str) => norm(str).replace(/[^a-z0-9]+/g, '');

// ---------------------------------------------------------------------------
// 1) Đọc "phán quyết" của một câu giải thích cho từng phương án
//    -> 'correct' | 'wrong' | 'unknown'
// ---------------------------------------------------------------------------

// Cụm khẳng định ĐÚNG. Đặt cụm dài trước để không bị cụm ngắn nuốt mất.
const CORRECT_MARKERS = [
    'day la dap an dung', 'dap an dung', 'dap an chinh xac', 'la dap an', 'chon dap an nay',
    'hoan toan dung', 'chinh xac', 'dung nhat', 'dung vi', 'dung roi', 'dung.', 'dung,',
    'correct answer', 'correct', 'y dung', 'cau nay dung', 'phuong an dung', 'lua chon dung'
];
// Cụm phủ định / khẳng định SAI.
const WRONG_MARKERS = [
    'khong phai dap an', 'khong phai la dap an', 'day khong phai', 'khong chinh xac', 'khong dung',
    'chua dung', 'chua chinh xac', 'sai vi', 'sai roi', 'sai.', 'sai,', 'bi sai', 'nham lan', 'nham voi',
    'incorrect', 'wrong', 'loai tru', 'phuong an sai', 'lua chon sai', 'y sai', 'khong hop ly'
];
// Ký hiệu nhanh
const CORRECT_GLYPHS = ['✓', '✔', '☑', '✅'];
const WRONG_GLYPHS = ['✗', '✘', '☒', '❌', '✖'];

/**
 * Phân loại một đoạn giải thích của phương án.
 * Chỉ xét phần ĐẦU (mặc định 90 ký tự) vì người soạn luôn chốt "đúng/sai" ngay đầu câu;
 * phần sau thường có cả hai từ ("đúng vì ... chứ không sai như ..."), xét cả câu sẽ nhiễu.
 * @returns {'correct'|'wrong'|'unknown'}
 */
export function readVerdict(text, headLen = 90) {
    const raw = s(text).trim();
    if (!raw) return 'unknown';
    for (const g of WRONG_GLYPHS) if (raw.includes(g)) return 'wrong';
    for (const g of CORRECT_GLYPHS) if (raw.includes(g)) return 'correct';

    const head = norm(raw).slice(0, headLen);
    if (!head) return 'unknown';

    // "không sai" / "chẳng sai" => thực chất là ĐÚNG, phải chặn trước khi bắt "sai"
    if (/\b(khong|chang|chua he)\s+sai\b/.test(head)) return 'correct';

    let wrongAt = -1, correctAt = -1;
    for (const m of WRONG_MARKERS) { const i = head.indexOf(m); if (i >= 0 && (wrongAt < 0 || i < wrongAt)) wrongAt = i; }
    for (const m of CORRECT_MARKERS) { const i = head.indexOf(m); if (i >= 0 && (correctAt < 0 || i < correctAt)) correctAt = i; }

    // Từ "sai"/"đúng" đứng một mình — tín hiệu yếu hơn, chỉ dùng khi chưa bắt được cụm nào
    if (wrongAt < 0 && /\bsai\b/.test(head)) wrongAt = head.search(/\bsai\b/);
    if (correctAt < 0 && /\bdung\b/.test(head)) correctAt = head.search(/\bdung\b/);

    if (wrongAt < 0 && correctAt < 0) return 'unknown';
    if (wrongAt < 0) return 'correct';
    if (correctAt < 0) return 'wrong';
    // Cả hai cùng xuất hiện -> cái nào đứng trước thì thắng ("đúng vì A, không phải B")
    return correctAt < wrongAt ? 'correct' : 'wrong';
}

/**
 * Suy ra đáp án đúng từ mảng giải thích-theo-phương-án.
 * @returns {{index:number, confidence:'high'|'low'|'none', reason:string}}
 */
export function inferFromOptionExplanations(optionExplanations, optionCount) {
    const exps = Array.isArray(optionExplanations) ? optionExplanations : [];
    if (!exps.some(e => s(e).trim())) return { index: -1, confidence: 'none', reason: '' };

    const verdicts = [];
    for (let i = 0; i < optionCount; i++) verdicts.push(readVerdict(exps[i]));
    const corrects = verdicts.reduce((a, v, i) => (v === 'correct' ? a.concat(i) : a), []);
    const wrongs = verdicts.filter(v => v === 'wrong').length;
    const unknowns = verdicts.filter(v => v === 'unknown').length;

    // Trường hợp lý tưởng: đúng 1 ô ghi "đúng", tất cả ô còn lại ghi "sai".
    if (corrects.length === 1 && wrongs === optionCount - 1) {
        return { index: corrects[0], confidence: 'high', reason: 'giải thích ghi rõ 1 phương án đúng, còn lại sai' };
    }
    // Chỉ 1 ô "đúng", vài ô để trống -> vẫn đủ chắc vì không có ô "đúng" nào khác
    if (corrects.length === 1 && wrongs >= 1) {
        return { index: corrects[0], confidence: 'high', reason: 'giải thích ghi 1 phương án đúng' };
    }
    if (corrects.length === 1) {
        return { index: corrects[0], confidence: 'low', reason: 'chỉ 1 phương án được ghi là đúng' };
    }
    // Không ô nào ghi "đúng" nhưng tất-cả-trừ-một ghi "sai" -> ô còn lại chính là đáp án
    if (corrects.length === 0 && wrongs === optionCount - 1 && unknowns === 1) {
        return { index: verdicts.indexOf('unknown'), confidence: 'high', reason: 'các phương án khác đều được ghi là sai' };
    }
    return { index: -1, confidence: 'none', reason: '' };
}

/**
 * Suy ra đáp án từ phần giải thích chung ("Đáp án đúng là C", "Chọn 3", "Key: B").
 */
export function inferFromExplanationText(explanation, optionCount) {
    const raw = s(explanation);
    if (!raw.trim()) return { index: -1, confidence: 'none', reason: '' };
    const flat = norm(raw);
    const pats = [
        /dap an\s*(?:dung|chinh xac|chuan)?\s*(?:la|:|=)?\s*([a-e1-9])\b/,
        /\bchon\s*(?:dap an|phuong an|y)?\s*([a-e1-9])\b/,
        /\bkey\s*[:=]?\s*([a-e1-9])\b/,
        /\banswer\s*[:=]?\s*([a-e1-9])\b/
    ];
    for (const p of pats) {
        const m = flat.match(p);
        if (!m) continue;
        const tok = m[1];
        const idx = /[0-9]/.test(tok) ? parseInt(tok, 10) - 1 : tok.charCodeAt(0) - 97;
        if (idx >= 0 && idx < optionCount) {
            return { index: idx, confidence: 'high', reason: 'giải thích ghi "' + m[0].trim() + '"' };
        }
    }
    return { index: -1, confidence: 'none', reason: '' };
}

/**
 * Suy ra đáp án từ dấu đánh ngay trong nội dung phương án: "*", "★", "(đúng)", "✓".
 * Trả kèm mảng `cleaned` đã gỡ dấu để tầng trên dùng làm nội dung hiển thị.
 */
export function inferFromOptionMarkers(options) {
    const hits = [];
    let touched = false;
    const cleaned = options.map((opt, i) => {
        const before = s(opt);
        let marked = false;
        let t = before
            .replace(/^\s*[*★✓✔]\s*/, () => { marked = true; return ''; })
            .replace(/\s*[*★✓✔]\s*$/, () => { marked = true; return ''; })
            .replace(/\s*[([]\s*(?:đúng|dung|correct)\s*[)\]]\s*$/i, () => { marked = true; return ''; });
        if (!marked) return before;
        if (!t.trim()) return before;      // toàn dấu -> giữ nguyên, không phải marker
        touched = true;
        hits.push(i);
        return t;
    });
    if (hits.length === 1) {
        return { index: hits[0], confidence: 'high', reason: 'phương án được đánh dấu sẵn trong file', cleaned };
    }
    // Nhiều hơn 1 dấu -> không suy được đáp án, nhưng vẫn nên gỡ dấu khỏi nội dung
    return { index: -1, confidence: 'none', reason: '', cleaned: touched ? cleaned : null };
}

// ---------------------------------------------------------------------------
// 2) Dọn dẹp cấu trúc
// ---------------------------------------------------------------------------

const LABEL_RE = /^\s*([A-Ea-e])\s*[.)\-–]\s+/;

/**
 * Nhãn "A." "B)" nằm sẵn trong nội dung phương án.
 * Chỉ gỡ khi >=2 phương án và quá nửa có nhãn (tránh cắt nhầm đáp án bắt đầu bằng "D. gluco").
 * Trả thêm `labels` — chữ cái gốc theo từng vị trí; nếu file đã bị xáo thì cột "đáp án"
 * ghi chữ cái sẽ trỏ theo NHÃN chứ không theo vị trí.
 */
export function extractOptionLabels(options) {
    if (!Array.isArray(options) || options.length < 2) return { stripped: options, labels: null };
    const labels = options.map(o => { const m = s(o).match(LABEL_RE); return m ? m[1].toUpperCase() : null; });
    if (labels.filter(Boolean).length <= options.length / 2) return { stripped: options, labels: null };
    return { stripped: options.map(o => s(o).replace(LABEL_RE, '')), labels };
}

// ---------------------------------------------------------------------------
// 3) Đọc giá trị cột "đáp án đúng" — chấp nhận nhiều đáp án ("1,3" / "A;C" / "AC")
// ---------------------------------------------------------------------------
/**
 * @returns {{indexes:number[], usedLetters:boolean}} indexes 0-based, đã sắp xếp & khử trùng
 */
export function parseCorrectValue(value, optionCount = 4) {
    const raw = trim(value);
    if (!raw) return { indexes: [], usedLetters: false };
    let usedLetters = false;
    const out = new Set();
    let tokens = raw.split(/[,;/|+&\s]+/).filter(Boolean);
    // "AC" viết liền -> tách từng ký tự
    if (tokens.length === 1 && /^[a-eA-E]{2,5}$/.test(tokens[0])) tokens = tokens[0].split('');
    for (const tk of tokens) {
        const t = tk.trim();
        if (/^[1-9]$/.test(t)) out.add(parseInt(t, 10) - 1);
        else if (/^[a-eA-E]$/.test(t)) { usedLetters = true; out.add(t.toUpperCase().charCodeAt(0) - 65); }
    }
    const indexes = [...out].filter(i => i >= 0 && i < optionCount).sort((a, b) => a - b);
    return { indexes, usedLetters };
}

// ---------------------------------------------------------------------------
// 4) Bộ máy chính
// ---------------------------------------------------------------------------

/**
 * Kiểm tra & chữa một bộ câu hỏi đã parse.
 *
 * @param {Array} questions mảng { question, answers, correctAnswerIndex, explanation, optionExplanations, ... }
 * @param {{threshold?:number}} [opts]
 * @returns {{questions:Array, report:Object}}
 */
export function autofixQuestions(questions, opts = {}) {
    const threshold = opts.threshold == null ? AUTOFIX_THRESHOLD : opts.threshold;
    const list = Array.isArray(questions) ? questions.map(q => ({ ...q })) : [];

    const report = {
        total: list.length,
        kept: 0,
        cleaned: [],       // các thao tác dọn dẹp đã áp dụng (luôn an toàn)
        answerFixes: [],   // { row, question, from, to, reason }
        suspects: [],      // lệch nhưng chưa đủ chắc / dưới ngưỡng -> chỉ cảnh báo
        dropped: [],       // câu bị loại
        duplicates: [],    // câu trùng đã gộp
        applied: false,
        systematicShift: null
    };
    const addClean = (label) => { if (!report.cleaned.includes(label)) report.cleaned.push(label); };

    // --- A. Dọn dẹp từng câu -------------------------------------------------
    const kept = [];
    const seen = new Map();
    list.forEach((q, i) => {
        q.__row = i + 1;
        q.question = trim(q.question);

        let options = (q.answers || q.options || []).map(o => trim(o));
        let optExps = Array.isArray(q.optionExplanations) ? q.optionExplanations.map(e => s(e).trim()) : [];
        while (optExps.length < options.length) optExps.push('');

        // A1. Bỏ phương án rỗng (giữ optionExplanations song song, dời correctAnswerIndex)
        if (options.some(o => o === '')) {
            const nextOpts = [], nextExps = [];
            let shiftBefore = 0;
            options.forEach((opt, idx) => {
                if (opt !== '') { nextOpts.push(opt); nextExps.push(optExps[idx] || ''); }
                else if (q.correctAnswerIndex != null && idx < q.correctAnswerIndex) shiftBefore++;
            });
            if (q.correctAnswerIndex != null) q.correctAnswerIndex -= shiftBefore;
            options = nextOpts; optExps = nextExps;
            addClean('bỏ ô đáp án để trống');
        }

        // A2. Gỡ nhãn "A." "B)" lẫn trong nội dung
        const { stripped, labels } = extractOptionLabels(options);
        if (labels) {
            options = stripped;
            addClean('gỡ nhãn A./B./C. thừa trong nội dung đáp án');
        }

        // A3. Dấu đánh đáp án ngay trong nội dung ("*", "(đúng)")
        const marker = inferFromOptionMarkers(options);
        if (marker.cleaned) { options = marker.cleaned.map(trim); addClean('gỡ dấu đánh đáp án (*, (đúng)) khỏi nội dung'); }
        q.__markerIndex = marker.index;

        q.answers = options;
        q.options = options;
        q.optionExplanations = optExps;

        // A4. Loại câu không dùng được
        if (!q.question || options.length < 2) {
            report.dropped.push({
                row: q.__row, question: q.question.slice(0, 60),
                why: !q.question ? 'thiếu nội dung câu hỏi' : 'có ít hơn 2 phương án'
            });
            return;
        }

        // A5. Trùng lặp (cùng đề + cùng tập đáp án).
        // Bản nào ĐẦY ĐỦ hơn thì thắng: một dòng ghi thiếu đáp án không được phép hất
        // dòng sau vốn có đủ dữ liệu (nếu không sẽ mất câu một cách vô lý).
        const key = contentKey(q.question) + '|' + options.map(contentKey).sort().join('~');
        if (seen.has(key)) {
            const prev = seen.get(key);
            const richer = (a, b) => {
                const score = (x) => (x.correctAnswerIndex != null ? 2 : 0)
                    + (x.optionExplanations && x.optionExplanations.some(e => e) ? 1 : 0)
                    + (String(x.explanation || '').trim() ? 1 : 0);
                return score(a) > score(b);
            };
            if (richer(q, prev.q)) {
                // Thay bản cũ tại chỗ, giữ nguyên vị trí câu trong bộ đề
                report.duplicates.push({ row: prev.q.__row, question: prev.q.question.slice(0, 60), sameAs: q.__row });
                kept[prev.at] = q;
                seen.set(key, { q, at: prev.at });
            } else {
                report.duplicates.push({ row: q.__row, question: q.question.slice(0, 60), sameAs: prev.q.__row });
            }
            return;
        }
        seen.set(key, { q, at: kept.length });

        // A6. correctAnswerIndex ngoài phạm vi -> bỏ, để bước suy luận cứu
        if (q.correctAnswerIndex != null && (q.correctAnswerIndex < 0 || q.correctAnswerIndex >= options.length)) {
            addClean('bỏ chỉ mục đáp án nằm ngoài số phương án');
            q.correctAnswerIndex = null;
        }
        kept.push(q);
    });

    // --- B. Suy luận đáp án đúng cho từng câu -------------------------------
    // Ưu tiên: dấu đánh trong file > giải thích từng phương án > giải thích chung
    const inferred = kept.map(q => {
        const n = q.answers.length;
        // Câu "chọn nhiều đáp án" — mọi suy luận dưới đây đều giả định 1 đáp án nên bỏ qua
        if (Array.isArray(q.correctAnswerIndexes) && q.correctAnswerIndexes.length > 1) {
            return { index: -1, confidence: 'none', reason: '' };
        }
        if (q.__markerIndex >= 0) {
            return { index: q.__markerIndex, confidence: 'high', reason: 'phương án được đánh dấu sẵn trong file' };
        }
        const byOpt = inferFromOptionExplanations(q.optionExplanations, n);
        if (byOpt.confidence === 'high') return byOpt;
        const byText = inferFromExplanationText(q.explanation, n);
        if (byText.confidence === 'high') return byText;
        return byOpt.confidence !== 'none' ? byOpt : byText;
    });

    // --- C. Vá câu THIẾU đáp án (luôn làm — không có gì để mất) --------------
    kept.forEach((q, i) => {
        if (q.correctAnswerIndex != null) return;
        const inf = inferred[i];
        if (inf && inf.index >= 0 && inf.confidence === 'high') {
            q.correctAnswerIndex = inf.index;
            report.answerFixes.push({
                row: q.__row, question: q.question.slice(0, 70),
                from: null, to: inf.index, reason: inf.reason
            });
        } else {
            report.dropped.push({ row: q.__row, question: q.question.slice(0, 60), why: 'không xác định được đáp án đúng' });
            q.__drop = true;
        }
    });

    // --- D. Câu ĐÃ có đáp án nhưng lệch với suy luận -------------------------
    const conflicts = [];
    kept.forEach((q, i) => {
        if (q.__drop || q.correctAnswerIndex == null) return;
        const inf = inferred[i];
        if (!inf || inf.index < 0 || inf.index === q.correctAnswerIndex) return;
        conflicts.push({ q, inf });
    });
    const strong = conflicts.filter(c => c.inf.confidence === 'high');

    if (strong.length > threshold) {
        // Vượt ngưỡng -> lỗi hệ thống, sửa hàng loạt
        report.applied = true;
        const deltas = strong.map(c => c.inf.index - c.q.correctAnswerIndex);
        if (deltas.every(d => d === deltas[0])) report.systematicShift = deltas[0];
        strong.forEach(({ q, inf }) => {
            report.answerFixes.push({
                row: q.__row, question: q.question.slice(0, 70),
                from: q.correctAnswerIndex, to: inf.index, reason: inf.reason
            });
            q.correctAnswerIndex = inf.index;
        });
    } else {
        // Dưới ngưỡng -> không tự ý sửa, chỉ nêu để người dùng xem lại
        strong.forEach(({ q, inf }) => {
            report.suspects.push({
                row: q.__row, question: q.question.slice(0, 70),
                current: q.correctAnswerIndex, suggested: inf.index, reason: inf.reason
            });
        });
    }
    // Tín hiệu yếu thì luôn chỉ cảnh báo
    conflicts.filter(c => c.inf.confidence !== 'high').forEach(({ q, inf }) => {
        report.suspects.push({
            row: q.__row, question: q.question.slice(0, 70),
            current: q.correctAnswerIndex, suggested: inf.index, reason: inf.reason + ' (chưa chắc chắn)'
        });
    });

    // --- E. Dọn field tạm & trả về ------------------------------------------
    const out = kept.filter(q => !q.__drop).map(q => {
        delete q.__row; delete q.__markerIndex; delete q.__drop;
        if (!q.optionExplanations.some(e => e)) delete q.optionExplanations;
        // Chỉ giữ correctAnswerIndexes khi thực sự là câu nhiều đáp án (xem quiz-helpers.isMultiAnswer)
        if (!Array.isArray(q.correctAnswerIndexes) || q.correctAnswerIndexes.length < 2) delete q.correctAnswerIndexes;
        return q;
    });
    report.kept = out.length;
    return { questions: out, report };
}

/**
 * Tóm tắt báo cáo thành vài dòng tiếng Việt để hiện lên giao diện.
 * @returns {{headline:string, lines:string[], tone:'success'|'warning'|'info'}}
 */
export function summarizeReport(report) {
    const lines = [];
    if (report.answerFixes.length) {
        const shift = report.systematicShift;
        lines.push('✔ Sửa đáp án đúng cho ' + report.answerFixes.length + ' câu' +
            (shift ? ' (cả bộ lệch ' + (shift > 0 ? '+' : '') + shift + ' vị trí)' : ''));
    }
    if (report.cleaned.length) lines.push('✔ Dọn dữ liệu: ' + report.cleaned.join('; '));
    if (report.duplicates.length) lines.push('✔ Gộp ' + report.duplicates.length + ' câu trùng lặp');
    if (report.dropped.length) lines.push('⚠ Bỏ qua ' + report.dropped.length + ' câu không dùng được');
    if (report.suspects.length) lines.push('⚠ ' + report.suspects.length + ' câu đáng ngờ — nên xem lại');
    const tone = (report.dropped.length || report.suspects.length) ? 'warning' : (lines.length ? 'success' : 'info');
    const headline = lines.length
        ? 'Đã kiểm tra ' + report.total + ' câu, giữ lại ' + report.kept
        : 'Bộ đề sạch — ' + report.total + ' câu, không phát hiện lỗi';
    return { headline, lines, tone };
}
