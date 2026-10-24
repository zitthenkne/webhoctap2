// File: features/quiz/quiz-essay-core.js
// Lõi CÂU TỰ LUẬN — thuần JS, không DOM/Firebase (chạy được trong node:test).
// Giao diện nằm ở page/quiz-essay.js.
//
// Mô hình dữ liệu một câu tự luận (lưu trong quiz_sets.questions[]):
//   type: 'essay', answers: []          -> câu KHÔNG phương án = tự luận (cùng quy ước phòng đánh đề)
//   modelAnswer  (markdown, tùy chọn)   -> đáp án mẫu
//   keyPoints    (barem, xem rubricOf)  -> không có thì tách từ gạch đầu dòng của modelAnswer
//   maxScore     (số, tùy chọn)         -> điểm tối đa của câu trong bài (trọng số, mặc định 1) — dùng cho cả trắc nghiệm
//   caseReveal   (markdown, tùy chọn)   -> thông tin bổ sung của ca, mở ra TỪ câu này (dùng được cho cả trắc nghiệm)
//
// Barem (keyPoints) — mỗi phần tử là MỘT trong:
//   ý       { text, points=1, keywords?: [..], partial?: số, critical?: true }
//             points < 0  -> LỖI TRỪ ĐIỂM (tick = bài mắc lỗi này)
//             partial     -> điểm khi nêu CHƯA ĐỦ (vd. có tên thuốc, thiếu liều)
//             critical    -> Ý BẮT BUỘC: thiếu thì cả câu 0 điểm (điểm liệt)
//             keywords    -> từ khóa / đồng nghĩa / viết tắt để máy tự nhận diện
//   nhóm    { group: 'Nêu 3 trong 5 nguyên nhân', max?: số, items: [ý…] } -> điểm nhóm không vượt max
//
// Bài làm (state.userAnswers[i]) của câu tự luận là object:
//   { text, done, ticks: number[] | null, partials?: number[], self?: 0 | 0.5 | 1, auto?: true }
//   done     = đã chốt (xem đáp án / nộp bài / bị khóa do ca mở dần) -> không sửa chữ nữa
//   ticks    = chỉ số (theo thứ tự phẳng của rubricOf().items) các ý đạt ĐỦ điểm; null = chưa chấm
//   partials = các ý đạt MỘT PHẦN điểm
//   self     = tự chấm cả câu khi câu không có ý chấm nào
//   auto     = ticks do máy nhận diện theo từ khóa, người làm chưa xem lại

export function isEssay(q) {
    if (!q) return false;
    if (q.type === 'essay') return true;
    const opts = [q.answers, q.options].find(Array.isArray);
    if (opts) return opts.length === 0;
    // Không có mảng phương án: chỉ coi là tự luận khi cũng không có đáp án đúng nào
    return typeof q.correctAnswerIndex !== 'number' && !Array.isArray(q.correctAnswerIndexes);
}

// Trọng số câu trong bài (cả trắc nghiệm lẫn tự luận)
export function questionWeight(q) {
    const w = Number(q && q.maxScore);
    return w > 0 ? w : 1;
}

/* ------------------------------------------------------------------
   Barem
   ------------------------------------------------------------------ */
// "(1đ)" "(0,5 điểm)" "[0.5]" "(-0,5đ)" ở CUỐI ý -> điểm của ý
const POINTS_RE = /\s*[([]\s*(-?\d+(?:[.,]\d+)?)\s*(?:đ|điểm|diem|d|pts?)?\s*[)\]]\s*$/i;
const BULLET_RE = /^(?:[-*+•]|\d{1,2}[.)])\s+(.+)$/;

function splitPoints(text) {
    const m = String(text).match(POINTS_RE);
    if (!m) return { text: String(text).trim(), points: 1 };
    return { text: String(text).slice(0, m.index).trim(), points: parseFloat(m[1].replace(',', '.')) || 1 };
}

function normItem(kp, group) {
    const base = typeof kp === 'string' ? splitPoints(kp) : {
        text: String((kp && kp.text) || '').trim(),
        points: Number(kp && kp.points) || 1,
    };
    const points = base.points;
    const partial = Number(kp && kp.partial);
    const kw = kp && kp.keywords;
    return {
        text: base.text,
        points,
        keywords: (Array.isArray(kw) ? kw : typeof kw === 'string' ? kw.split(/[|;]/) : [])
            .map(s => String(s).trim()).filter(Boolean),
        partial: points > 0 && partial > 0 && partial < points ? partial : 0,
        critical: !!(kp && kp.critical) && points > 0,
        penalty: points < 0,
        field: kp && Number.isInteger(Number(kp.field)) && Number(kp.field) >= 1 ? Number(kp.field) : null,
        // Ý kiểm tra THỨ TỰ (trạm thủ thuật): các bước phải xuất hiện đúng trình tự; mỗi bước "a|b" = cách viết tương đương
        order: kp && Array.isArray(kp.order) && kp.order.length >= 2
            ? kp.order.map(s => String(s).split('|').map(x => x.trim()).filter(Boolean)).filter(a => a.length) : null,
        // Bản 2: một câu "vì sao ý này có điểm / thiếu thì sao" + câu VIẾT MẪU (ghi trong bài thi / nói với người bệnh thế nào)
        // — phiếu chấm hiện dưới ý bị THIẾU; checklist đủ 3 lớp thì không cần đáp án mẫu viết liền
        why: String((kp && kp.why) || '').trim(),
        example: String((kp && kp.example) || '').trim(),
        group,
    };
}

// Barem đã chuẩn hóa: items = danh sách PHẲNG (chỉ số của ticks theo thứ tự này),
// groups = [{ label, max, idxs }] cho các nhóm "nêu k trong n".
export function rubricOf(q) {
    const items = [];
    const groups = [];
    if (!q) return { items, groups };
    if (Array.isArray(q.keyPoints) && q.keyPoints.length) {
        q.keyPoints.forEach(kp => {
            if (kp && Array.isArray(kp.items)) {
                const gi = groups.length;
                const idxs = [];
                kp.items.forEach(it => {
                    const n = normItem(it, gi);
                    if (n.text && !n.penalty) { idxs.push(items.length); items.push(n); }
                });
                if (!idxs.length) return;
                const sumPos = idxs.reduce((a, i) => a + items[i].points, 0);
                const max = Number(kp.max) > 0 ? Math.min(Number(kp.max), sumPos) : sumPos;
                groups.push({ label: String(kp.group || '').trim(), max, idxs });
            } else {
                const n = normItem(kp, -1);
                if (n.text) items.push(n);
            }
        });
        return { items, groups };
    }
    // Không có barem: gạch đầu dòng CẤP 1 của đáp án mẫu, bỏ ý con thụt lề
    String(q.modelAnswer || '').split('\n')
        .filter(line => !/^\s{2,}|^\t/.test(line))
        .map(line => line.trim().match(BULLET_RE))
        .filter(Boolean)
        .forEach(m => { const n = normItem(m[1], -1); if (n.text) items.push(n); });
    return { items, groups };
}

export function keyPointsOf(q) {
    return rubricOf(q).items;
}

// Đáp án dạng chữ cho câu: đáp án mẫu nếu có, không thì dựng từ checklist (bộ bản 2 chỉ viết barem kỹ:
// ý + vì sao + viết mẫu) — dùng cho sao chép câu sai, CSV Anki, flashcard
export function answerTextOf(q) {
    const model = String((q && q.modelAnswer) || '').trim();
    if (model) return model;
    return keyPointsOf(q).filter(it => !it.penalty)
        .map(it => `- ${it.text}${it.example ? ` — viết mẫu: ${it.example}` : ''}`).join('\n');
}

const round2 = (n) => Math.round(n * 100) / 100;

// Điểm ý thứ i theo bài làm: đủ / một phần / 0
function itemValue(it, ans, i) {
    if (Array.isArray(ans.ticks) && ans.ticks.includes(i)) return it.points;
    if (Array.isArray(ans.partials) && ans.partials.includes(i)) return it.partial;
    return 0;
}

// Các ý bắt buộc chưa đạt (kể cả một phần cũng tính là đã nêu)
export function missingCritical(q, ans) {
    const { items } = rubricOf(q);
    if (!ans || typeof ans !== 'object' || !Array.isArray(ans.ticks)) return [];
    return items.map((it, i) => (it.critical && !itemValue(it, ans, i) ? i : -1)).filter(i => i >= 0);
}

export function essayMaxPoints(q) {
    const { items, groups } = rubricOf(q);
    if (!items.length) return 1;
    return round2(items.filter(it => it.group < 0 && !it.penalty).reduce((a, it) => a + it.points, 0)
        + groups.reduce((a, g) => a + g.max, 0));
}

// Điểm đạt được của bài làm (theo thang essayMaxPoints), không âm
export function essayPoints(q, ans) {
    if (!ans || typeof ans !== 'object') return 0;
    const { items, groups } = rubricOf(q);
    if (!items.length) return typeof ans.self === 'number' ? ans.self : 0;
    if (missingCritical(q, ans).length) return 0;          // điểm liệt
    let got = 0;
    items.forEach((it, i) => { if (it.group < 0) got += itemValue(it, ans, i); });   // gồm cả lỗi trừ điểm (âm)
    groups.forEach(g => { got += Math.min(g.max, g.idxs.reduce((a, i) => a + itemValue(items[i], ans, i), 0)); });
    return Math.max(0, round2(got));
}

// Tỉ lệ 0..1 của câu; nhân questionWeight ra điểm câu trong bài
export function essayCredit(q, ans) {
    const max = essayMaxPoints(q);
    return max > 0 ? Math.min(1, essayPoints(q, ans) / max) : 0;
}

export function isEssayGraded(q, ans) {
    if (!ans || typeof ans !== 'object') return false;
    return keyPointsOf(q).length ? Array.isArray(ans.ticks) : typeof ans.self === 'number';
}

// Đã trả lời mà chưa tự chấm -> ô số câu tô "đã làm" (xanh dương) chứ không tô đỏ oan
export function isPendingEssay(q, ans) {
    return isEssay(q) && ans != null && !isEssayGraded(q, ans);
}

// Cần người làm xem lại: chưa chấm, hoặc máy chấm sơ bộ mà chưa xác nhận
export function needsReview(q, ans) {
    return isPendingEssay(q, ans) || (isEssay(q) && !!(ans && ans.auto));
}

// Đạt từ một nửa số điểm trở lên = "đúng" (bộ lọc Câu sai / Làm lại câu sai / màu ô số câu).
// Điểm tổng vẫn cộng theo tỉ lệ thật (essayCredit), không làm tròn.
export function isEssayPassed(q, ans) {
    return isEssayGraded(q, ans) && essayCredit(q, ans) >= 0.5;
}

export function countWords(text) {
    const t = String(text || '').trim();
    return t ? t.split(/\s+/).length : 0;
}

/* ------------------------------------------------------------------
   Máy nhận diện ý theo từ khóa
   So từng "tiếng": bài gõ CÓ dấu phải khớp đúng dấu (tránh gộp nhầm gan/gân, sởi/sỏi);
   tiếng gõ KHÔNG dấu thì so với bản bỏ dấu của barem. Viết tắt y khoa được bung ra.
   ------------------------------------------------------------------ */
const ABBR = {
    nmct: 'nhồi máu cơ tim', hcvc: 'hội chứng vành cấp', dmv: 'động mạch vành', dmc: 'động mạch chủ',
    tha: 'tăng huyết áp', ha: 'huyết áp', dtd: ['đái tháo đường', 'điện tâm đồ'], ecg: 'điện tâm đồ', ekg: 'điện tâm đồ',
    tbmmn: 'tai biến mạch máu não', dqn: 'đột quỵ não', copd: 'bệnh phổi tắc nghẽn mạn tính', bptnmt: 'bệnh phổi tắc nghẽn mạn tính',
    tdmp: 'tràn dịch màng phổi', tkmp: 'tràn khí màng phổi', tdmt: 'tràn dịch màng tim', xhth: 'xuất huyết tiêu hóa',
    xn: 'xét nghiệm', cls: 'cận lâm sàng', ls: 'lâm sàng', tc: ['tiểu cầu', 'triệu chứng'], hc: ['hồng cầu', 'hội chứng'],
    bc: 'bạch cầu', pci: 'can thiệp mạch vành qua da', cabg: 'bắc cầu động mạch vành', ucmc: 'ức chế men chuyển',
    acei: 'ức chế men chuyển', ctta: 'chẹn thụ thể angiotensin', arb: 'chẹn thụ thể angiotensin', mra: 'kháng aldosteron',
    bb: 'chẹn beta', nsaids: 'kháng viêm không steroid', ks: 'kháng sinh', vk: 'vi khuẩn', kst: 'ký sinh trùng',
    tm: 'tĩnh mạch', dm: 'động mạch', ttm: ['tiêm tĩnh mạch', 'truyền tĩnh mạch'], bn: 'bệnh nhân', ef: 'phân suất tống máu',
    hfref: 'suy tim phân suất tống máu giảm', hfpef: 'suy tim phân suất tống máu bảo tồn', sxh: 'sốt xuất huyết',
    btm: 'bệnh thận mạn', ckd: 'bệnh thận mạn', ttta: 'tổn thương thận cấp', aki: 'tổn thương thận cấp', tmcb: 'thiếu máu cục bộ',
    // Sản khoa (OSCE Sản, 2026-10-23). KHÔNG thêm "sa" (sa dây rốn, sa sinh dục) hay "tc" thứ 3 — barem cũng bung viết tắt.
    bctc: 'bề cao tử cung', ctc: 'cổ tử cung', tntc: 'thai ngoài tử cung', tsg: 'tiền sản giật', dtdtk: 'đái tháo đường thai kỳ',
    mlt: 'mổ lấy thai', vmc: 'vết mổ cũ', kc: 'kinh chót', bhss: 'băng huyết sau sinh', ctm: 'công thức máu',
    lmwh: 'heparin trọng lượng phân tử thấp', ufh: 'heparin không phân đoạn', ppi: 'ức chế bơm proton', tdf: 'tenofovir',
};
const STOP = new Set(('và của các là có với trong cho khi do được bị thì một những để theo từ hoặc hay nên cần này đó ra vào '
    + 'như nếu mà sau trước tại về bằng rất đã đang sẽ vì nhưng cũng thể nào gì ở trên dưới lại nữa đến tới hơn kèm gồm mỗi mọi '
    + 'không chưa phải nhiều ít').split(' '));

const MARKS = /[̀-ͯ]/;
const hasMarks = (w) => MARKS.test(w.normalize('NFD')) || /đ/.test(w);
export const stripMarks = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
const TOKEN_RE = /\p{N}+|\p{L}[\p{L}\p{N}]*/gu;

// Tiếng của chuỗi, kèm vị trí trong chuỗi gốc
function tokenize(s) {
    const text = String(s || '').normalize('NFC');
    return [...text.matchAll(TOKEN_RE)].map(m => ({
        t: m[0].toLowerCase(), raw: m[0], s: m.index, e: m.index + m[0].length,
    }));
}

function abbrOf(t) {
    const x = ABBR[stripMarks(t)];
    return x ? (Array.isArray(x) ? x : [x]) : null;
}

// Bài làm -> các đoạn tiếng để dò: đoạn chính + bản sao có viết tắt bung NGAY TẠI CHỖ (để "EF giảm"
// thành "phân suất tống máu giảm" liền mạch); tiếng bung mang vị trí của chữ viết tắt gốc để tô đúng chỗ.
function answerSegments(text, d = 0) {
    const main = tokenize(text).map(tk => ({ ...tk, d, plain: !hasMarks(tk.t) }));
    const segs = [main];
    const abbrs = main.map(tk => abbrOf(tk.t));
    const variants = Math.max(0, ...abbrs.map(a => (a ? a.length : 0)));
    for (let v = 0; v < variants; v++) {
        segs.push(main.flatMap((tk, i) => {
            const a = abbrs[i];
            return a ? tokenize(a[Math.min(v, a.length - 1)]).map(x => ({ t: x.t, plain: false, d, s: tk.s, e: tk.e })) : [tk];
        }));
    }
    return segs;
}

// Tên thuốc / thuật ngữ Latin viết kiểu Việt: spironolacton ≈ spironolactone, furosemid ≈ furosemide
const nearLatin = (a, b) => a.length >= 6 && b.length >= 6 && /^[a-z]+$/.test(a) && /^[a-z]+$/.test(b)
    && Math.abs(a.length - b.length) <= 2 && (a.startsWith(b) || b.startsWith(a));

// loose (chỉ cho từ khóa tác giả ghi): từ khóa viết KHÔNG dấu thì khớp mọi cách bỏ dấu của bài
const tokEq = (want, got, loose) => got.t === want || (got.plain && got.t === stripMarks(want))
    || nearLatin(want, got.t) || (loose && !hasMarks(want) && stripMarks(got.t) === want);

// Chuỗi tiếng của barem (bung viết tắt thành đầy đủ)
function phraseTokens(s) {
    return tokenize(s).flatMap(tk => {
        const ex = abbrOf(tk.t);
        return ex && !/\p{N}/u.test(tk.t) ? tokenize(ex[0]).map(x => ({ ...x, src: tk })) : [{ ...tk, src: tk }];
    });
}

function findSeq(segs, words, accept = () => true, loose = true) {
    for (const seg of segs) {
        for (let i = 0; i + words.length <= seg.length; i++) {
            if (words.every((w, k) => tokEq(w, seg[i + k], loose))) {
                const hits = seg.slice(i, i + words.length);
                if (accept(hits)) return hits;
            }
        }
    }
    return null;
}

// Tiêu đề chung chung trước dấu ":" — đứng một mình không phải là một ý
const GENERIC_HEAD = new Set(['nguyên nhân', 'điều trị', 'chẩn đoán', 'triệu chứng', 'biến chứng', 'cơ chế', 'xử trí',
    'tiên lượng', 'phân loại', 'dịch tễ', 'cận lâm sàng', 'lâm sàng', 'mục tiêu', 'ví dụ', 'thuốc', 'yếu tố nguy cơ']);

// Ý viết liền có thể chứa nhiều cách nói: "A / B", "A hoặc B", "(ví dụ trong ngoặc)",
// "Tên ý: giải thích", "Tên ý — giải thích", "A → B" — lấy cách nói khớp nhất.
function altsOf(text) {
    const par = [];
    const main = String(text).replace(/\(([^)]*)\)/g, (_, x) => { par.push(x); return ' '; });
    const out = [];
    [main, ...par].forEach(s => {
        out.push(s);
        // KHÔNG tách theo dấu phẩy ("tránh nitrat, lợi tiểu, morphin" là MỘT ý) hay chữ "hay" ("hay gặp")
        s.split(/\s+\/\s+|;|\s+hoặc\s+|\s+[—–-]\s+|\s*→\s*|:\s+/).forEach(p => {
            if (p !== s && !GENERIC_HEAD.has(p.trim().toLowerCase())) out.push(p);
        });
    });
    return out.map(s => s.trim()).filter(Boolean);
}

// Tiếng có nghĩa để chấm: bỏ hư từ; giữ số và chữ cái IN HOA đứng một mình ("giai đoạn C", "viêm gan B", "type 2")
const isContent = (tk) => !STOP.has(tk.t) && (tk.t.length > 1 || /\d/.test(tk.t) || /^[A-Z]$/.test((tk.src || tk).raw || ''));

// Điểm khớp của một cách nói = trung bình của
//   (1) tỉ lệ tiếng có mặt (tiếng "mạnh" nặng gấp đôi) và
//   (2) tỉ lệ CẶP tiếng liền nhau có mặt đúng thứ tự (cách nhau tối đa 1 tiếng) —
// thiếu (2) thì "tụt huyết áp" khớp nhầm "tăng huyết áp" (2/3 tiếng trùng).
function altScore(segs, alt, accept = () => true) {
    const toks = phraseTokens(alt).filter(isContent);
    if (!toks.length) return { score: 0, hits: [] };
    // Ưu tiên cụm đầy đủ đúng ngữ cảnh; không ghép tiếng ở lần nhắc phủ định đầu bài với ý đúng ở cuối bài.
    const exact = findSeq(segs, phraseTokens(alt).map(tk => tk.t), accept, false);
    if (exact) return { score: 1, hits: exact };
    let total = 0, got = 0;
    const hits = [];
    toks.forEach(tk => {
        // Tiếng "mạnh": có số, tên thuốc/thuật ngữ gốc Latin (≥4 chữ không dấu), hoặc từ viết tắt IN HOA
        const strong = /\d/.test(tk.t) || (/^[a-z]{4,}$/.test(tk.t) && !hasMarks(tk.t)) || /^[A-ZĐ]{2,}$/.test(tk.src.raw);
        const w = strong ? 2 : 1;
        total += w;
        const matches = segs.flatMap(seg => seg.filter(g => tokEq(tk.t, g)));
        const m = matches.find(g => accept([g])) || matches[0];
        if (m) { got += w; hits.push(m); }
    });
    const uni = got / total;
    if (toks.length < 2) return { score: uni, hits };
    let pairs = 0;
    for (let k = 0; k + 1 < toks.length; k++) {
        const a = toks[k].t, b = toks[k + 1].t;
        if (segs.some(seg => seg.some((g, i) => tokEq(a, g) && seg.slice(i + 1, i + 3).some(h => tokEq(b, h))))) pairs++;
    }
    return { score: (uni + pairs / (toks.length - 1)) / 2, hits };
}

// Kết quả dò cho từng ý (cùng thứ tự rubricOf().items):
//   { level: 'match' | 'near' | null, ranges: [[ô, s, e],…] (vị trí trong ô bài làm), words: [chữ khớp],
//     why?: 'few' | 'kw' | 'neg' | 'given' | 'elsewhere' | 'weak' (vì sao chỉ gần khớp), missing?: [thành phần còn thiếu], at?: số ô }
// input = chuỗi bài làm, hoặc object bài làm { text, parts } (bài nhiều ô).
// Ý có field (số ô, đếm từ 1; bảng = số hàng) chỉ CHẤM trong ô đó -> "NMCT" ghi ở ô chẩn đoán phân biệt
// không được tính cho ý chẩn đoán chính (chỉ gợi ý "ghi ở ô khác").
/* ---- Máy chấm bản 3 (2026-10-23) — đo trên 104 câu / 388 ý OSCE thật (bộ đo: scratchpad eval-grader.mjs) ----
   Bản cũ: 1 từ khóa có mặt là tick cả ý (ghi "đau" = đạt "Đau bụng: vị trí, tính chất, thời gian…"), chép lại đề vẫn ăn
   18% số ý, "không dùng X" vẫn tính là "dùng X", ghi đúng ý nhưng nhầm ô thì im lặng bỏ qua. Nay:
   ① chỉ chặn bằng chứng nằm hoàn toàn trong đoạn chép nguyên đề / ca đủ dài — 'given'
   ② phủ định (không / chưa / tránh / cấm / chống chỉ định) đứng ngay trước chữ khớp, không qua dấu câu, mà ý thì không
      phủ định (hoặc ngược lại) -> chỉ "gần khớp" — 'neg'
   ③ ý nhiều thành phần ("Tên: a, b, c" / "a, b và c") phải nêu ≥ ½ thành phần (2 thành phần thì đủ cả 2); thiếu -> gần khớp
      kèm danh sách thành phần còn thiếu — 'few'. Ý có con số (liều, ngưỡng) mà bài không ghi số nào -> 'few'
   ④ từ khóa chỉ đủ để đạt ý NGẮN (≤ 8 tiếng có nghĩa) hoặc khi bài còn khớp thêm nội dung ý; ý dài chỉ có từ khóa -> 'kw'
   ⑤ ý gắn ô mà bài ghi ở ô khác -> gần khớp 'elsewhere' + số ô (at) để người làm tự quyết
   Kết quả mỗi ý: { level, ranges, words, why?, missing?, at? } — level/ranges/words như cũ (phòng đánh đề dùng chung). */
const NEG_MARKED = new Set(['không', 'chưa', 'chẳng', 'tránh', 'cấm', 'đừng']);
const NEG_PLAIN = new Set(['khong', 'chua', 'ko', 'tranh']);   // gõ không dấu: bỏ "dung" (dùng ≠ đừng), "cam" (cảm)
const isNegTok = (tk) => NEG_MARKED.has(tk.t) || (!hasMarks(tk.t) && NEG_PLAIN.has(tk.t));
const isCCD = (toks, i) => toks[i] && toks[i].t === 'định' && toks[i - 1] && toks[i - 1].t === 'chỉ' && toks[i - 2] && toks[i - 2].t === 'chống';
// Cụm chữ của barem / từ khóa có mang nghĩa phủ định không ("không" đứng CUỐI là hỏi: "có giống trước không")
function phraseNeg(s) {
    const t = tokenize(String(s).split(/\s+(?:để|nhằm)\s+/i)[0]);
    return t.some((tk, i) => (isNegTok(tk) && i < t.length - 1) || isCCD(t, i));
}
const contentToks = (s) => phraseTokens(s).filter(isContent);
// Thành phần của ý: "Tên: a, b, c" -> head + [a, b, c]; "a, b và c" -> [a, b, c]. Ngoặc = ví dụ / chi tiết, bỏ.
// Có "hoặc" / " / " là các cách nói thay thế (altsOf lo) -> không chia.
// Mỗi thành phần giữ ngoặc của nó ở `full` ("xét nghiệm NST đồ (Karyotype)": viết "karyotype" vẫn tính cho vế này),
// `core` = bỏ ngoặc để đo độ phủ. Không tách dấu phẩy thập phân ("NaCl 0,9%"); chỉ tách "và" khi hai bên đều ≥ 2 tiếng
// có nghĩa ("từ bố và mẹ" là một vế).
function partsOf(text) {
    const par = [];
    const prot = String(text).replace(/\([^)]*\)/g, (x) => { par.push(x); return ` \u0001${par.length - 1}\u0001 `; });
    const back = (s) => s.replace(/\u0001(\d+)\u0001/g, (_, k) => par[k]).replace(/\s+/g, ' ').trim();
    const strip = (s) => s.replace(/\u0001\d+\u0001/g, ' ').replace(/\s+/g, ' ').trim();
    const main = strip(prot);
    const m = prot.match(/^([^:]{2,90}):\s+([\s\S]+)$/);
    const head = m && !GENERIC_HEAD.has(strip(m[1]).toLowerCase()) ? strip(m[1]) : '';
    const body = m ? m[2] : prot;
    if (/\s(?:hoặc)\s|\s\/\s/i.test(strip(body))) return { head, list: [], main };
    const pieces = body.split(/(?<!\d)[,;](?!\d)/).flatMap(piece => {
        const out = [];
        piece.split(/\s+và\s+/).forEach(x => {
            if (out.length && (contentToks(strip(out[out.length - 1])).length < 2 || contentToks(strip(x)).length < 2)) out[out.length - 1] += ' và ' + x;
            else out.push(x);
        });
        return out;
    });
    const list = pieces.map(x => ({ core: strip(x), full: back(x) })).filter(x => contentToks(x.core).length);
    return { head, list: list.length >= 2 ? list : [], main };
}
// Số đi kèm đơn vị (liều, ngưỡng, tỉ lệ) — "3 tháng đầu" không tính, "300 mg", "≥ 27 pg", "25%" thì tính
const UNIT_RE = /^(?:mg|mcg|µg|g|kg|ml|l|ui|iu|đv|đơn|mmhg|cmh2o|mmol|meq|mg\/dl|fl|pg|ng|ml\/h|giọt|nhát|lần|tuần|ngày|giờ|phút|mm|cm|bpm|nhịp)$/i;
const tokSet = (s) => new Set(contentToks(s).map(tk => stripMarks(tk.t)));

export function autoMatch(q, input) {
    const docs = answerDocs(q, input).map(t => String(t).normalize('NFC'));
    const fmt = formatOf(q);
    const segsByDoc = docs.map((t, d) => answerSegments(t, d));
    const mains = segsByDoc.map(s => s[0]);
    // ponytail: chỉ nhận đoạn chép nguyên đề / ca ≥ 12 tiếng; dùng lại thuật ngữ vẫn được tính.
    const sources = [q?.question, q?.caseText, typeof q?.caseReveal === 'string' ? q.caseReveal : '']
        .filter(Boolean).map(tokenize).filter(t => t.length >= 12);
    const copied = mains.map(main => sources.flatMap(src => {
        const spans = [];
        for (let i = 0; i + src.length <= main.length; i++) {
            if (src.every((tk, k) => tokEq(tk.t, main[i + k]))) spans.push([main[i].s, main[i + src.length - 1].e]);
        }
        return spans;
    }));
    const isCopied = (hits) => hits.length > 0 && hits.every(h => copied[h.d].some(([s, e]) => h.s >= s && h.e <= e));
    const first = (hits) => hits.reduce((a, h) => (!a || h.d < a.d || (h.d === a.d && h.s < a.s) ? h : a), null);
    const negBefore = (h) => {
        if (!h) return false;
        const main = mains[h.d], k = main.findIndex(t => t.s === h.s);
        for (let j = k - 1, n = 0; k > 0 && j >= 0 && n < 3; j--, n++) {
            if (/[.,;:!?\n()[\]]/.test(docs[h.d].slice(main[j].e, main[j + 1].s))) return false;   // dấu câu chặn: "không sốt, đau bụng"
            if (isNegTok(main[j]) || isCCD(main, j)) return true;
        }
        return false;
    };
    // Nghĩa phủ định của bài khớp với của cụm barem? Bài "phủ định" khi có MỘT chữ khớp đứng ngay sau không/chưa/tránh…
    // (≤ 3 tiếng, không qua dấu câu) — "heparin không phân đoạn" là tên thuốc: barem có "không" thì bài cũng phải có.
    // Không xét cả khoảng giữa các chữ khớp: chúng là lần gặp đầu của từng tiếng, có thể rải khắp bài.
    const negOk = (hits, phrase) => hits.some(negBefore) === phraseNeg(phrase);
    const scoreAlt = (segs, phrase) => altScore(segs, phrase, hits => negOk(hits, phrase) && !isCopied(hits));

    function evalItem(it, segs) {
        const r = evalCore(it, segs);
        if (r.level && !r.ev) r.ev = (r.hits || []).concat(r.more || []);
        return r;
    }
    function evalCore(it, segs) {
        const none = { level: null, hits: [] };
        if (!segs.length) return none;
        // 0) Ý thứ tự: mọi bước phải có mặt và lần xuất hiện ĐẦU của chúng tăng dần (theo ô rồi theo vị trí)
        if (it.order) {
            const firsts = it.order.map(alts => {
                let best = null;
                alts.forEach(a => {
                    const seq = findSeq(segs, phraseTokens(a).map(x => x.t));
                    if (seq && (!best || seq[0].d < best[0].d || (seq[0].d === best[0].d && seq[0].s < best[0].s))) best = seq;
                });
                return best;
            });
            const inOrder = firsts.every(Boolean) && firsts.every((f, k) => k === 0
                || f[0].d > firsts[k - 1][0].d || (f[0].d === firsts[k - 1][0].d && f[0].s > firsts[k - 1][0].s));
            return inOrder ? { level: 'match', hits: firsts.flat() } : none;
        }
        // Từ khóa tác giả cho sẵn (khớp nguyên cụm), chia: dùng được / chỉ là chữ trong đề / lệch phủ định
        const kwAll = it.keywords.map(kw => {
            const words = phraseTokens(kw).map(x => x.t);
            const seq = words.length ? findSeq(segs, words, hits => negOk(hits, kw) && !isCopied(hits)) || findSeq(segs, words) : null;
            return seq ? { kw, seq, neg: negOk(seq, kw) } : null;
        }).filter(Boolean);
        const kwOk = kwAll.filter(h => h.neg);
        const kwWhy = kwAll.length && !kwOk.length ? 'neg' : '';
        // Nội dung ý: cách nói khớp nhất
        let best = { score: 0, hits: [] }, bestAlt = '';
        altsOf(it.text).forEach(alt => { const r = scoreAlt(segs, alt); if (r.score > best.score) { best = r; bestAlt = alt; } });
        const bestOk = best.hits.length > 0 && negOk(best.hits, bestAlt);
        const P = partsOf(it.text);
        // Con số của ý (liều, ngưỡng, tỉ lệ): ý có số mà bài không ghi số nào của ý -> chưa đủ
        const mt = tokenize(P.main);
        const numIdx = mt.map((tk, i) => (/^\d/.test(tk.t) && (/%/.test(P.main.slice(tk.e, tk.e + 2))
            || (mt[i + 1] && UNIT_RE.test(mt[i + 1].t) && !/tuần|ngày|giờ|phút|lần/.test(mt[i + 1].t))) ? i : -1)).filter(i => i >= 0);
        const nums = numIdx.map(i => mt[i].t);
        const numLabel = numIdx.map(i => (/%/.test(P.main.slice(mt[i].e, mt[i].e + 2)) ? mt[i].t + '%' : P.main.slice(mt[i].s, mt[i + 1].e))).join(', ');
        const numOk = !nums.length || segs.some(seg => seg.some(g => nums.includes(g.t)));
        const weakWhy = !best.hits.length ? '' : !bestOk ? 'neg' : 'weak';
        // Độ phủ trên THÂN ý (bỏ ngoặc): chữ trong ngoặc như "(CBC)" khớp 100% nhưng một mình không đủ đạt cả ý dài
        const cover = scoreAlt(segs, P.main);
        const more = kwOk.flatMap(h => h.seq).concat(best.hits, cover.hits);   // mọi bằng chứng (xét "có chữ mới không" trên cả ý)

        if (P.list.length) {
            // ③ Ý nhiều thành phần: đếm thành phần được nêu (nội dung khớp ≥ 0,5, hoặc có từ khóa nằm trong thành phần đó)
            const comps = P.list.map(({ core, full }) => {
                const cs = tokSet(full);
                const byKw = kwOk.filter(h => { const ks = tokSet(h.kw); return ks.size && [...ks].every(x => cs.has(x)); });
                if (byKw.length) return { c: core, ok: true, hits: byKw.flatMap(h => h.seq) };
                const r = scoreAlt(segs, core);
                if (r.score >= 0.45 && negOk(r.hits, core)) return { c: core, ok: true, hits: r.hits };
                // tên khác ghi trong ngoặc của vế ("lợi tiểu quai (furosemide)")
                const syn = [...full.matchAll(/\(([^)]*)\)/g)].map(x => scoreAlt(segs, x[1])).find(x => x.score >= 0.6 && negOk(x.hits, ''));
                return syn ? { c: core, ok: true, hits: syn.hits } : { c: core, ok: false, hits: r.hits };
            });
            // Từ khóa đồng nghĩa không nằm trong chữ của vế nào ("mong con" cho vế "thai kỳ có trong kế hoạch") -> bù một vế còn thiếu
            // (chỉ từ khóa KHÔNG có trong chữ của ý và không trùng chỗ với chữ đã khớp: "đau" của ý "Đau bụng: …" không bù được gì)
            const own = tokSet(it.text);
            const used = new Set(comps.filter(x => x.ok).flatMap(x => x.hits).map(h => h.d + ':' + h.s));
            kwOk.filter(h => { const ks = tokSet(h.kw); return ks.size && ![...ks].every(x => own.has(x)); })
                .forEach(h => {
                    const miss = comps.find(x => !x.ok);
                    if (!miss || h.seq.some(t => used.has(t.d + ':' + t.s))) return;
                    miss.ok = true; miss.hits = h.seq;
                    h.seq.forEach(t => used.add(t.d + ':' + t.s));
                });
            const got = comps.filter(x => x.ok);
            const need = comps.length === 2 ? 2 : Math.ceil(comps.length / 2);
            const hits = got.flatMap(x => x.hits).concat(kwOk.flatMap(h => h.seq));
            if (got.length >= need && numOk) return { more, level: 'match', hits };
            const head = P.head ? scoreAlt(segs, P.head) : null;
            const headOk = head && head.score >= 0.6 && negOk(head.hits, P.head);
            if (got.length || headOk || kwOk.length) {
                const missing = comps.filter(x => !x.ok).map(x => x.c);
                if (!numOk) missing.push(numLabel);
                return { more, level: 'near', why: 'few', missing, hits: hits.length ? hits : (headOk ? head.hits : best.hits) };
            }
            if (kwWhy || (best.score >= 0.34 && weakWhy)) return { more, level: 'near', why: kwWhy || weakWhy, hits: kwAll.length ? kwAll[0].seq : best.hits };
            return none;
        }
        // ④ Ý một thành phần
        // Thân ý khớp nhiều nhưng bị phủ định ("không kháng đông…") -> chỉ gần khớp, kể cả khi từ khóa / chữ trong ngoặc khớp
        if (cover.score >= 0.35 && !negOk(cover.hits, P.main)) return { more, level: 'near', why: 'neg', hits: cover.hits };
        // Ý "Tên ý: giải thích" / "Tên ý — giải thích" (không liệt kê): nêu đủ TÊN ý cụ thể (≥ 2 tiếng có nghĩa, không phải
        // tiêu đề chung "Chẩn đoán:") là đạt — phần sau là lời giải thích, hiện ở "vì sao"
        const lead = P.head || (P.main.split(/\s+[—–-]\s+|\s*→\s*/)[0] || '').trim();
        const leadOk = lead && lead !== P.main && contentToks(lead).length >= 2 && scoreAlt(segs, lead).score >= 0.8;
        const enough = contentToks(P.main).length <= 8 || cover.score >= 0.35 || leadOk;
        const byText = bestOk && best.score >= (it.keywords.length ? 0.75 : 0.6);
        if ((kwOk.length || byText) && enough) {
            const h = kwOk.length ? kwOk[0].seq : best.hits;
            return numOk ? { more, level: 'match', hits: h } : { more, level: 'near', why: 'few', missing: [numLabel], hits: h };
        }
        if (byText) return { more, level: 'near', why: 'kw', hits: best.hits };
        if (kwOk.length) return { more, level: 'near', why: 'kw', hits: kwOk[0].seq };
        if (kwWhy) return { more, level: 'near', why: kwWhy, hits: kwAll[0].seq };
        if (best.score >= 0.34) return { more, level: 'near', why: weakWhy || 'weak', hits: best.hits };
        return none;
    }

    return keyPointsOf(q).map(it => {
        const own = fieldDocs(fmt, it.field, docs.length);
        // ① Chỉ hạ mức khi mọi bằng chứng đều nằm trong đoạn chép nguyên đề / ca.
        const judge = (segs) => {
            const r = evalItem(it, segs);
            if (!r.level || !isCopied(r.ev || r.hits)) return r;
            return r.why === 'neg' ? r : { ...r, level: 'near', why: 'given' };
        };
        let r = judge(own.flatMap(d => segsByDoc[d]));
        // ⑤ Ý gắn ô: ô của nó không có gì -> dò các ô khác, có thì chỉ gợi ý (người làm tự quyết)
        if (!r.level && own.length < docs.length) {
            const other = docs.map((_, d) => d).filter(d => !own.includes(d));
            const r2 = judge(other.flatMap(d => segsByDoc[d]));
            if (r2.level && r2.hits.length) r = { level: 'near', why: 'elsewhere', at: first(r2.hits).d + 1, hits: r2.hits };
        }
        // Lỗi trừ điểm: bài nói NGƯỢC lại ("không dùng nitrat") hay chỉ lặp chữ trong đề thì không phải mắc lỗi
        if (it.penalty && (r.why === 'neg' || r.why === 'given')) r = { level: null, hits: [] };
        if (!r.level) return { level: null, ranges: [], words: [] };
        const out = pack(r.level, r.hits);
        if (r.why) out.why = r.why;
        if (r.missing && r.missing.length) out.missing = r.missing;
        if (r.at) out.at = r.at;
        return out;
    });
    function pack(level, toks) {
        // Gộp các tiếng liền nhau (cách 1 ký tự) trong cùng ô thành cụm: "bóc tách" chứ không phải "bóc, tách"
        const ranges = toks.filter(t => t.e > t.s).map(t => [t.d, t.s, t.e])
            .sort((a, b) => a[0] - b[0] || a[1] - b[1])
            .reduce((acc, r) => {
                const last = acc[acc.length - 1];
                if (last && last[0] === r[0] && r[1] - last[2] <= 1) last[2] = Math.max(last[2], r[2]);
                else if (!last || last[0] !== r[0] || r[1] >= last[2]) acc.push([...r]);
                return acc;
            }, []);
        const words = [...new Set(ranges.map(([d, s, e]) => docs[d].slice(s, e)))];
        return { level, ranges, words };
    }
}

// Máy chấm sơ bộ: tick ý khớp, không tự trừ điểm. Chấm lại kết quả auto, giữ nguyên điểm đã chấm tay.
export function withAutoGrade(q, ans) {
    if (!ans || typeof ans !== 'object' || !answerDocs(q, ans).some(t => t.trim()) || (isEssayGraded(q, ans) && !ans.auto)) return ans;
    const items = keyPointsOf(q);
    if (!items.length) return ans;
    const ms = autoMatch(q, ans);
    const ticks = ms.map((m, i) => (m.level === 'match' && !items[i].penalty ? i : -1)).filter(i => i >= 0);
    // Ý có mức "nêu chưa đủ" (partial) mà bài mới nêu một phần thành phần / thiếu con số -> ½ điểm (vẫn auto: chờ người làm xem lại)
    const partials = ms.map((m, i) => (m.level === 'near' && m.why === 'few' && items[i].partial > 0 && !items[i].penalty ? i : -1)).filter(i => i >= 0);
    return { ...ans, ticks, partials, auto: true };
}

// Câu không có barem: bài nhắc được bao nhiêu thuật ngữ của đáp án mẫu (chỉ để tham khảo khi tự chấm)
export function modelCoverage(q, text) {
    const segs = answerSegments(text);
    const seen = new Set();
    const toks = phraseTokens(String(q && q.modelAnswer || '').replace(/[*_`#>]/g, ' '))
        .filter(tk => !STOP.has(tk.t) && tk.t.length > 1 && !seen.has(tk.t) && seen.add(tk.t));
    const hit = toks.filter(tk => segs.some(seg => seg.some(g => tokEq(tk.t, g)))).length;
    return { hit, total: toks.length };
}

/* ------------------------------------------------------------------
   Kiểu ô nhập (answerFormat) — AI/MCP chọn theo đề:
     text   (mặc định) ô văn bản dài           · short  một dòng ("Chẩn đoán xác định?")
     list   N ô đánh số ("Nêu 3 nguyên nhân")    · fields các ô có nhãn (Chẩn đoán / Phân biệt / Xử trí)
     table  bảng cột × hàng (Thuốc | Liều | Đường dùng), hàng có thể có nhãn
   Bài nhiều ô lưu ans.parts (bảng: theo hàng, trái -> phải); ans.text luôn là bản gộp để đếm/hiện.
   Ô của list / fields đặt TỰ DO từng ô (người dùng ở bộ sửa ô, AI qua MCP): phần tử labels là chuỗi (= nhãn)
   hoặc { label, hint (gợi ý trong ô), size: 'line' | 'para' | 'long', unit (đơn vị sau ô, vd. "lần/phút") }.
   formatOf trả slots[] đã chuẩn hóa; labels[] (chuỗi) giữ nguyên cho mã cũ.
   ------------------------------------------------------------------ */
const strList = (a) => (Array.isArray(a) ? a.map(x => String(x ?? '').trim()).filter(Boolean) : []);
const clampInt = (n, lo, hi, dflt) => { const x = Math.round(Number(n)); return x >= lo ? Math.min(hi, x) : dflt; };
export const SLOT_SIZES = ['line', 'para', 'long'];
export function slotOf(x, size = 'line') {
    const o = x && typeof x === 'object' ? x : { label: x };
    const s = (v) => String(v ?? '').trim();
    return { label: s(o.label), hint: s(o.hint ?? o.placeholder), size: SLOT_SIZES.includes(o.size) ? o.size : size, unit: s(o.unit) };
}
const hasSlot = (s) => !!(s.label || s.hint || s.unit);

export function formatOf(q) {
    const f = (q && q.answerFormat) || {};
    const placeholder = f.placeholder ? String(f.placeholder) : '';
    if (f.kind === 'list') {
        const raw = Array.isArray(f.labels) ? f.labels.map(x => slotOf(x)) : [];
        const count = clampInt(f.count, 1, 12, raw.length || 3);
        const slots = Array.from({ length: count }, (_, k) => raw[k] || slotOf(''));
        return { kind: 'list', count, slots, labels: slots.map(s => s.label), parts: count, placeholder };
    }
    if (f.kind === 'fields') {
        // Ô có nhãn mặc định là ĐOẠN (Enter xuống dòng); ô "1 dòng" thì Enter sang ô kế
        const slots = (Array.isArray(f.labels) ? f.labels : []).map(x => slotOf(x, 'para')).filter(hasSlot).slice(0, 20);
        if (slots.length) return { kind: 'fields', slots, labels: slots.map(s => s.label), parts: slots.length, placeholder };
    }
    if (f.kind === 'table') {
        const columns = strList(f.columns);
        const rowLabels = strList(f.rows);
        const rows = rowLabels.length || clampInt(f.rows, 1, 12, 3);
        if (columns.length) return { kind: 'table', columns, rowLabels, rows, parts: rows * columns.length, placeholder };
    }
    return { kind: f.kind === 'short' ? 'short' : 'text', parts: 1, placeholder };
}

// Đặt lại các ô (bộ sửa ô trả order[n] = ô cũ nằm ở ô mới thứ n, null = ô mới): ý barem có field đi theo ô của
// nó; ô bị xóa thì ý đó thôi gắn ô (dò cả bài). Nhóm "nêu k trong n" dời từng ý con.
export function remapFields(keyPoints, order) {
    if (!Array.isArray(keyPoints) || !Array.isArray(order)) return keyPoints;
    const move = (it) => {
        if (!it || typeof it !== 'object' || !Number(it.field)) return it;
        const n = order.indexOf(Number(it.field) - 1);
        const { field, ...rest } = it;
        return n >= 0 ? { ...rest, field: n + 1 } : rest;
    };
    return keyPoints.map(kp => (kp && Array.isArray(kp.items) ? { ...kp, items: kp.items.map(move) } : move(kp)));
}

// Bài làm -> danh sách "ô" để dò (bài một ô: [text])
export function answerDocs(q, input) {
    if (typeof input === 'string') return [input];
    const fmt = formatOf(q);
    if (input && Array.isArray(input.parts) && !['text', 'short'].includes(fmt.kind)) {
        return Array.from({ length: fmt.parts }, (_, i) => String(input.parts[i] ?? ''));
    }
    return [String((input && input.text) || '')];
}

// Ô có vai trò riêng chấm đúng ô / hàng; danh sách không nhãn được phép đổi thứ tự.
function fieldDocs(fmt, field, n) {
    const all = Array.from({ length: n }, (_, i) => i);
    if (!field || n <= 1 || (fmt.kind === 'list' && fmt.slots.every(s => !s.label && !s.hint && !s.unit))) return all;
    if (fmt.kind === 'table') {
        const cols = fmt.columns.length;
        return field <= fmt.rows ? all.slice((field - 1) * cols, field * cols) : all;
    }
    return field <= n ? [field - 1] : all;
}

// Gộp các ô thành một văn bản đọc được (lưu ở ans.text)
export function partsText(fmt, parts) {
    const v = (i) => String((parts && parts[i]) || '').trim();
    const u = (i) => (fmt.slots?.[i]?.unit ? ' ' + fmt.slots[i].unit : '');
    if (fmt.kind === 'list') {
        return Array.from({ length: fmt.count }, (_, i) => (v(i) ? `${i + 1}. ${v(i)}${u(i)}` : '')).filter(Boolean).join('\n');
    }
    if (fmt.kind === 'fields') return fmt.labels.map((l, i) => (v(i) ? `${l ? l + ': ' : ''}${v(i)}${u(i)}` : '')).filter(Boolean).join('\n');
    if (fmt.kind === 'table') {
        const cols = fmt.columns.length;
        return Array.from({ length: fmt.rows }, (_, r) => {
            const cells = fmt.columns.map((_, c) => v(r * cols + c));
            if (!cells.some(Boolean)) return '';
            return (fmt.rowLabels[r] ? fmt.rowLabels[r] + ': ' : '') + cells.map((x, c) => `${fmt.columns[c]}: ${x || '—'}`).join(' · ');
        }).filter(Boolean).join('\n');
    }
    return v(0);
}

/* ------------------------------------------------------------------
   Barem <-> dạng dòng chữ (để sửa tay trong modal sửa câu)
     - Aspirin liều nạp (0,5đ, ½ 0,25đ, bắt buộc, ô 2) [aspirin; asa]
     # Nêu 2 trong 3 nguyên nhân (tối đa 1đ)
       - Tăng huyết áp (0,5đ) [tăng huyết áp; THA]
     - Dùng nitrat khi tụt HA (-0,5đ) [nitrat]        <- điểm âm = lỗi trừ điểm
     - Aspirin liều nạp (0,5đ) [aspirin] {vì sao: ức chế tiểu cầu sớm giảm tử vong} {viết mẫu: Aspirin 300 mg nhai}   <- bản 2
   Từ khóa ngăn bằng ";" (dấu phẩy dùng được trong từ khóa, vd. "NaCl 0,9").
   ------------------------------------------------------------------ */
const num = (n) => String(Math.round(n * 1000) / 1000).replace('.', ',');
const META_TOKEN = /^(?:-?\d+(?:[.,]\d+)?\s*(?:đ|điểm)?|(?:½|một phần)\s*\d+(?:[.,]\d+)?\s*(?:đ|điểm)?|bắt buộc|ô\s*\d+)$/i;

export function rubricToText(keyPoints) {
    if (!Array.isArray(keyPoints)) return '';
    const line = (k, pad) => {
        const meta = [`${num(Number(k.points) || 1)}đ`];
        if (Number(k.partial) > 0) meta.push(`½ ${num(Number(k.partial))}đ`);
        if (k.critical) meta.push('bắt buộc');
        if (Number(k.field) >= 1) meta.push(`ô ${Number(k.field)}`);
        const kw = strList(k.keywords);
        const ord = strList(k.order);
        const brace = (s) => String(s || '').replace(/[{}]/g, '').trim();
        const why = brace(k.why), ex = brace(k.example);
        return `${pad}- ${String(k.text || '').trim()} (${meta.join(', ')})${kw.length ? ` [${kw.join('; ')}]` : ''}`
            + (ord.length >= 2 ? ` {thứ tự: ${ord.join(' > ')}}` : '') + (why ? ` {vì sao: ${why}}` : '') + (ex ? ` {viết mẫu: ${ex}}` : '');
    };
    return keyPoints.map(k => (k && Array.isArray(k.items)
        ? [`# ${String(k.group || 'Nhóm ý').trim()}${Number(k.max) > 0 ? ` (tối đa ${num(Number(k.max))}đ)` : ''}`,
            ...k.items.map(it => line(it, '  '))].join('\n')
        : line(k || {}, ''))).join('\n');
}

export function textToRubric(text) {
    const out = [];
    let group = null;
    String(text || '').split('\n').forEach(raw => {
        if (!raw.trim()) return;
        const head = raw.match(/^\s*#+\s*(.*?)\s*(?:\(\s*tối đa\s*(\d+(?:[.,]\d+)?)\s*(?:đ|điểm)?\s*\))?\s*$/i);
        if (head) {
            group = { group: head[1] || 'Nhóm ý', items: [] };
            if (head[2]) group.max = parseFloat(head[2].replace(',', '.'));
            out.push(group);
            return;
        }
        const m = raw.match(/^(\s*)(?:[-*+•]|\d{1,2}[.)])\s+(.*)$/);
        if (!m) return;
        let body = m[2].trim();
        const item = { text: '', points: 1 };
        // Đuôi {viết mẫu: …} rồi {vì sao: …} (đúng thứ tự rubricToText ghi ra, đọc từ cuối lên)
        const tail = (key, prop) => {
            const m = body.match(new RegExp(`\\{\\s*${key}\\s*:\\s*([^}]*)\\}\\s*$`, 'i'));
            if (!m) return;
            if (m[1].trim()) item[prop] = m[1].trim();
            body = body.slice(0, m.index).trim();
        };
        tail('viết mẫu', 'example');
        tail('vì sao', 'why');
        const ord = body.match(/\{\s*thứ tự\s*:\s*([^}]*)\}\s*$/i);
        if (ord) {
            item.order = ord[1].split('>').map(s => s.trim()).filter(Boolean);
            body = body.slice(0, ord.index).trim();
            if (item.order.length < 2) delete item.order;
        }
        const kw = body.match(/\[([^\]]*)\]\s*$/);
        if (kw) {
            item.keywords = kw[1].split(';').map(s => s.trim()).filter(Boolean);
            body = body.slice(0, kw.index).trim();
        }
        const meta = body.match(/\(([^()]*)\)\s*$/);
        // Tách theo dấu phẩy KHÔNG nằm giữa hai chữ số ("0,5đ" là số thập phân)
        const toks = meta ? meta[1].split(/(?<!\d),|,(?!\d)/).map(s => s.trim()).filter(Boolean) : [];
        // Ngoặc cuối chỉ là "thông số" khi MỌI mảnh đều đúng mẫu — "(ticagrelor hoặc clopidogrel)" vẫn là nội dung ý
        if (meta && toks.length && toks.every(t => META_TOKEN.test(t))) {
            body = body.slice(0, meta.index).trim();
            toks.forEach(t => {
                let x;
                if (/^bắt buộc$/i.test(t)) item.critical = true;
                else if ((x = t.match(/^ô\s*(\d+)$/i))) item.field = Number(x[1]);
                else if ((x = t.match(/^(?:½|một phần)\s*(\d+(?:[.,]\d+)?)/i))) item.partial = parseFloat(x[1].replace(',', '.'));
                else if ((x = t.match(/^(-?\d+(?:[.,]\d+)?)/))) item.points = parseFloat(x[1].replace(',', '.')) || 1;
            });
        }
        item.text = body;
        if (!item.text) return;
        if (!item.keywords || !item.keywords.length) delete item.keywords;
        if (m[1].length >= 2 && group) group.items.push(item);
        else { group = null; out.push(item); }
    });
    return out.filter(k => !Array.isArray(k.items) || k.items.length);
}

// Ca mở dần: câu ở vị trí seq bị KHÓA khi người làm đã xem tới câu seen (> seq) của cùng ca
// và giữa (seq, seen] có câu mang caseReveal (tức là đã lộ thông tin mới).
// caseQs = các câu của ca theo thứ tự (index 0 = câu 1).
export function isLockedByReveal(caseQs, seq, seen) {
    if (!Array.isArray(caseQs) || !(seen > seq)) return false;
    for (let s = seq + 1; s <= seen && s <= caseQs.length; s++) {
        if (String(caseQs[s - 1]?.caseReveal || '').trim()) return true;
    }
    return false;
}

/* ------------------------------------------------------------------
   PHIẾU CHẤM BẢN 2 (2026-10-22) — sắp lại nội dung để mỗi ý chỉ hiện MỘT lần.
   Bộ đã nạp (bản 1) KHÔNG cần sửa dữ liệu: các hàm dưới tự tách lúc hiển thị, không tách được thì trả
   nguyên văn (không mất chữ nào):
     sheetOf      -> các hàng đối chiếu: mỗi ô bài làm + các ý barem dò trong ô đó (ý không gắn ô = hàng "cả bài")
     splitModel   -> đáp án mẫu tách theo mục "1. Tên mục:" / "a. **Tên mục**" khi số mục = số ô
     splitChot    -> dải Chốt = explanation + dòng "📌/🎯 Chốt…:" của note (dòng đó rời khỏi Ghi nhớ)
     studyLayers  -> Ghi nhớ tách thẻ theo nhãn đầu dòng; Mở rộng tách theo tiêu đề có biểu tượng (⚙️ / 🔀 / …);
                     khúc "⚠️ Radar cạm bẫy" của Mở rộng dời sang Ghi nhớ (bẫy ở một chỗ)
   ------------------------------------------------------------------ */
const EMOJI = '\\p{Extended_Pictographic}[\\uFE0F\\u200D\\p{Extended_Pictographic}]*';
const wordPairs = (s) => {
    const w = stripMarks(String(s || '').toLowerCase()).match(/[a-z0-9]+/g) || [];
    return new Set(w.slice(1).map((x, k) => w[k] + ' ' + x));
};
// Tỉ lệ cặp tiếng của a có trong b (≈ a chép lại b)
export function pairOverlap(a, b) {
    const pa = wordPairs(a), pb = wordPairs(b);
    if (!pa.size) return 0;
    let n = 0;
    pa.forEach(p => { if (pb.has(p)) n++; });
    return n / pa.size;
}

// Hàng đối chiếu. unit = một ý lẻ ({idxs:[i], group:-1}) hoặc cả nhóm "nêu k trong n" ({idxs, group}).
export function sheetOf(q) {
    const format = formatOf(q);
    const { items, groups } = rubricOf(q);
    const nSlots = format.kind === 'table' ? format.rows : (format.kind === 'fields' || format.kind === 'list') ? format.parts : 0;
    const fieldOf = (i) => (items[i].field && items[i].field <= nSlots ? items[i].field : 0);
    const units = [], pens = [];
    items.forEach((it, i) => {
        if (it.penalty) pens.push(i);
        else if (it.group < 0) units.push({ idxs: [i], group: -1, field: fieldOf(i) });
        else if (groups[it.group].idxs[0] === i) {
            const fs = new Set(groups[it.group].idxs.map(fieldOf));
            units.push({ idxs: groups[it.group].idxs, group: it.group, field: fs.size === 1 ? [...fs][0] : 0 });
        }
    });
    // Chia theo ô chỉ khi barem CÓ gắn ô; không thì một hàng: cả bài | cả barem
    const split = nSlots > 1 && units.some(u => u.field);
    const rows = split
        ? [...Array.from({ length: nSlots }, (_, k) => ({ field: k + 1, units: units.filter(u => u.field === k + 1) })),
            { field: 0, units: units.filter(u => !u.field) }].filter(r => r.field || r.units.length)
        : [{ field: 0, units }];
    return { format, items, groups, split, rows, pens };
}

// Điểm đạt / tối đa của một unit (nhóm có trần max)
export function unitScore(q, unit, ans) {
    const { items, groups } = rubricOf(q);
    const val = (i) => (ans && typeof ans === 'object' ? itemValue(items[i], ans, i) : 0);
    if (unit.group < 0) return { got: val(unit.idxs[0]), max: items[unit.idxs[0]].points };
    const max = groups[unit.group].max;
    return { got: Math.min(max, unit.idxs.reduce((a, i) => a + val(i), 0)), max };
}

// Dòng tiêu đề mục của đáp án mẫu: "1. **Tên mục:**", "a. Tên mục:", "**b) Tên mục**", "### 2. Tên mục:" — phải là cả dòng
// (in đậm trọn hoặc kết thúc bằng ":"), không thụt lề. "1. Kháng sinh: ceftriaxone" là nội dung, không phải tiêu đề.
function modelHead(line) {
    if (/^\s{2,}|^\t/.test(line)) return null;
    const m = line.match(/^\s*(?:#{1,4}\s*)?(\*\*)?\s*(?:\d{1,2}|[a-zA-Z])[.)]\s+(.+?)\s*$/);
    if (!m) return null;
    const t = m[2];
    const bold = /^\*\*.+\*\*:?$/.test(t) || (!!m[1] && /\*\*:?$/.test(t));
    if (!bold && !/:\s*(?:\*\*)?$/.test(t)) return null;
    const title = t.replace(/\*\*/g, '').replace(/:\s*$/, '').trim();
    return title && title.length <= 140 ? title : null;
}

// -> mảng n mục { title, body } (body bỏ dòng tiêu đề; đoạn mở đầu trước mục 1 dính vào body mục 1),
//    hoặc null khi số mục ≠ n
// Chống tách nhầm (gặp thật ở bộ APP 4.6: "3. **Quản lý giai đoạn 2:**" là tiêu đề CON trong phần kế hoạch, vô tình
// đủ số mục): đoạn mở đầu phải ngắn và tên mục phải chung ít nhất một tiếng có nghĩa với tên ô tương ứng.
const meaningWords = (s) => new Set(tokenize(s).map(t => t.t).filter(t => t.length > 1 && !STOP.has(t) && !/^\d+$/.test(t)));
export function splitModel(q, n) {
    const lines = String((q && q.modelAnswer) || '').split('\n');
    const heads = lines.map((l, k) => (modelHead(l) ? k : -1)).filter(k => k >= 0);
    if (!(n > 1) || heads.length !== n) return null;
    if (lines.slice(0, heads[0]).join(' ').trim().length > 300) return null;
    const labels = formatOf(q).labels || [];
    const parts = heads.map((h, k) => ({
        title: modelHead(lines[h]),
        body: [...(k ? [] : lines.slice(0, h)), ...lines.slice(h + 1, heads[k + 1] ?? lines.length)].join('\n').trim(),
    }));
    const fits = (p, k) => {
        const lb = meaningWords(labels[k] || '');
        return !lb.size || [...meaningWords(p.title)].some(w => lb.has(w));
    };
    return parts.every((p, k) => p.body && fits(p, k)) ? parts : null;
}

const CHOT_RE = new RegExp(`^\\s*(?:[-*+]\\s+)?(?:\\*\\*)?\\s*(?:${EMOJI}\\s*)?(?:\\*\\*)?\\s*Chốt\\b[^:\\n]{0,40}:\\s*(?:\\*\\*)?\\s*`, 'u');
export function splitChot(q) {
    const raw = String((q && q.note) || '');
    const exp = String((q && q.explanation) || '').trim();
    const lines = raw.split('\n');
    const k = lines.findIndex(l => CHOT_RE.test(l));
    const line = k >= 0 ? lines[k].replace(CHOT_RE, '').trim() : '';
    const chot = [exp, line].filter(Boolean);
    if (chot.length === 2 && pairOverlap(line, exp) >= 0.6) chot.pop();   // gần y hệt explanation -> giữ một
    return { chot, note: line ? lines.filter((_, j) => j !== k).join('\n').trim() : raw.trim() };
}

const TRAP_RE = /bẫy|cạm|radar|sai lầm|nhầm|cờ đỏ|tránh|error|⚠|🚫|❌|🔴/i;
// Ghi nhớ -> thẻ: dòng "emoji Nhãn: nội dung" hoặc "**Nhãn:** nội dung" mở thẻ mới; dòng sau (gạch con…) dính vào thẻ trước
const NOTE_EMOJI_RE = new RegExp(`^\\s*(?:[-*+]\\s+)?(?:\\*\\*)?\\s*(${EMOJI})\\s*(?:\\*\\*)?\\s*([^:\\n]{1,60}?)\\s*(?:\\*\\*)?\\s*:\\s*(?:\\*\\*)?\\s*(.*)$`, 'u');
const NOTE_BOLD_RE = /^\s*(?:[-*+]\s+)?\*\*\s*([^*:\n]{1,50}?)\s*:?\s*\*\*\s*:?\s*(.*)$/;
function noteCards(note) {
    const cards = [];
    String(note || '').split('\n').forEach(line => {
        const a = line.match(NOTE_EMOJI_RE);
        const b = !a && line.match(NOTE_BOLD_RE);
        if (a || b) {
            const label = (a ? a[2] : b[1]).replace(/\*\*/g, '').trim();
            cards.push({ icon: a ? a[1] : '', label, body: (a ? a[3] : b[2]).trim(), trap: TRAP_RE.test((a ? a[1] : '') + label) });
        } else if (cards.length && line.trim()) {
            cards[cards.length - 1].body += '\n' + line;
        } else if (line.trim()) {
            cards.push({ icon: '', label: '', body: line, trap: false });
        }
    });
    return cards.map(c => ({ ...c, body: c.body.trim() })).filter(c => c.body || c.label);
}

// Mở rộng -> khúc theo dòng tiêu đề "⚙️ **Tên khúc:**" / "### 🔀 Tên khúc" (cả dòng là tiêu đề, sau ":" không còn chữ)
const SEC_RE = new RegExp(`^\\s*(?:#{1,4}\\s*)?(?:\\*\\*)?\\s*(${EMOJI})\\s*(?:\\*\\*)?\\s*([^\\n]{1,90}?)\\s*(?:\\*\\*)?\\s*:?\\s*(?:\\*\\*)?\\s*:?\\s*$`, 'u');
// Bộ cũ hay viết tiêu đề dính nội dung: "⚙️ **Tên khúc:** nội dung…" (tiêu đề phải in đậm mới tính)
const SEC_INLINE_RE = new RegExp(`^\\s*(?:#{1,4}\\s*)?(${EMOJI})\\s*\\*\\*([^*\\n]{1,90}?)\\s*:?\\s*\\*\\*\\s*:?\\s+(\\S.*)$`, 'u');
function sections(md) {
    const out = [];
    String(md || '').split('\n').forEach(line => {
        const m = line.match(SEC_RE);
        const n = !(m && !/:\s*\S/.test(m[2])) && line.match(SEC_INLINE_RE);
        if (m && !/:\s*\S/.test(m[2])) out.push({ icon: m[1], title: m[2].replace(/\*\*/g, '').replace(/:$/, '').trim(), body: '' });
        else if (n) out.push({ icon: n[1], title: n[2].trim(), body: n[3] + '\n' });
        else if (out.length) out[out.length - 1].body += line + '\n';
        else out.push({ icon: '', title: '', body: line + '\n' });
    });
    return out.map(s => ({ ...s, body: s.body.trim(), trap: !!s.title && TRAP_RE.test(s.icon + s.title) })).filter(s => s.body || s.title);
}

export function studyLayers(q) {
    const { chot, note } = splitChot(q);
    const secs = sections(q && q.expanded);
    // Chỉ tách khi Mở rộng thật sự có từ 2 khúc tiêu đề trở lên (khung "⚙️ → ⚠️ → 🔀" của skill)
    const split = secs.filter(s => s.title).length >= 2;
    return {
        chot,
        memo: noteCards(note),
        traps: split ? secs.filter(s => s.trap) : [],
        more: split ? secs.filter(s => !s.trap) : [{ icon: '', title: '', body: String((q && q.expanded) || '').trim(), trap: false }].filter(s => s.body),
    };
}
