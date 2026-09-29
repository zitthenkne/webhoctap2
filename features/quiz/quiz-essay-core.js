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

function findSeq(segs, words) {
    for (const seg of segs) {
        for (let i = 0; i + words.length <= seg.length; i++) {
            if (words.every((w, k) => tokEq(w, seg[i + k], true))) return seg.slice(i, i + words.length);
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

// Điểm khớp của một cách nói = trung bình của
//   (1) tỉ lệ tiếng có mặt (tiếng "mạnh" nặng gấp đôi) và
//   (2) tỉ lệ CẶP tiếng liền nhau có mặt đúng thứ tự (cách nhau tối đa 1 tiếng) —
// thiếu (2) thì "tụt huyết áp" khớp nhầm "tăng huyết áp" (2/3 tiếng trùng).
function altScore(segs, alt) {
    const toks = phraseTokens(alt).filter(tk => !STOP.has(tk.t) && (tk.t.length > 1 || /\d/.test(tk.t)));
    if (!toks.length) return { score: 0, hits: [] };
    let total = 0, got = 0;
    const hits = [];
    toks.forEach(tk => {
        // Tiếng "mạnh": có số, tên thuốc/thuật ngữ gốc Latin (≥4 chữ không dấu), hoặc từ viết tắt IN HOA
        const strong = /\d/.test(tk.t) || (/^[a-z]{4,}$/.test(tk.t) && !hasMarks(tk.t)) || /^[A-ZĐ]{2,}$/.test(tk.src.raw);
        const w = strong ? 2 : 1;
        total += w;
        for (const seg of segs) {
            const m = seg.find(g => tokEq(tk.t, g));
            if (m) { got += w; hits.push(m); break; }
        }
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
//   { level: 'match' | 'near' | null, ranges: [[ô, s, e],…] (vị trí trong ô bài làm), words: [chữ khớp] }
// input = chuỗi bài làm, hoặc object bài làm { text, parts } (bài nhiều ô).
// Ý có field (số ô, đếm từ 1; bảng = số hàng) chỉ dò trong ô đó -> "NMCT" ghi ở ô chẩn đoán phân biệt
// không được tính cho ý chẩn đoán chính.
export function autoMatch(q, input) {
    const docs = answerDocs(q, input);
    const fmt = formatOf(q);
    const segsByDoc = docs.map((t, d) => answerSegments(t, d));
    return keyPointsOf(q).map(it => {
        const segs = fieldDocs(fmt, it.field, docs.length).flatMap(d => segsByDoc[d]);
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
            return inOrder ? pack('match', firsts.flat()) : { level: null, ranges: [], words: [] };
        }
        // 1) Từ khóa tác giả cho sẵn: khớp nguyên cụm là đạt
        for (const kw of it.keywords) {
            const words = phraseTokens(kw).map(x => x.t);
            const seq = words.length ? findSeq(segs, words) : null;
            if (seq) return pack('match', seq);
        }
        // 2) Tự so với nội dung ý: tỉ lệ tiếng khớp (tiếng mạnh nặng gấp đôi), lấy cách nói khớp nhất
        let best = { score: 0, hits: [] };
        altsOf(it.text).forEach(alt => { const r = altScore(segs, alt); if (r.score > best.score) best = r; });
        const level = best.score >= 0.6 && !it.keywords.length ? 'match' : best.score >= 0.34 ? 'near' : null;
        return level ? pack(level, best.hits) : { level: null, ranges: [], words: [] };
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
        const words = [...new Set(ranges.map(([d, s, e]) => String(docs[d]).normalize('NFC').slice(s, e)))];
        return { level, ranges, words };
    }
}

// Máy chấm sơ bộ: tick các ý khớp (KHÔNG tự tick lỗi trừ điểm — máy không hiểu câu phủ định,
// "tránh nitrat" vẫn chứa chữ "nitrat"). Chỉ áp khi bài có chữ, có barem và chưa được chấm.
export function withAutoGrade(q, ans) {
    if (!ans || typeof ans !== 'object' || !String(ans.text || '').trim() || isEssayGraded(q, ans)) return ans;
    const items = keyPointsOf(q);
    if (!items.length) return ans;
    const ticks = autoMatch(q, ans)
        .map((m, i) => (m.level === 'match' && !items[i].penalty ? i : -1)).filter(i => i >= 0);
    return { ...ans, ticks, partials: [], auto: true };
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
   ------------------------------------------------------------------ */
const strList = (a) => (Array.isArray(a) ? a.map(x => String(x ?? '').trim()).filter(Boolean) : []);
const clampInt = (n, lo, hi, dflt) => { const x = Math.round(Number(n)); return x >= lo ? Math.min(hi, x) : dflt; };

export function formatOf(q) {
    const f = (q && q.answerFormat) || {};
    const placeholder = f.placeholder ? String(f.placeholder) : '';
    if (f.kind === 'list') {
        const labels = strList(f.labels);
        const count = clampInt(f.count, 1, 12, labels.length || 3);
        return { kind: 'list', count, labels, parts: count, placeholder };
    }
    if (f.kind === 'fields') {
        const labels = strList(f.labels);
        if (labels.length) return { kind: 'fields', labels, parts: labels.length, placeholder };
    }
    if (f.kind === 'table') {
        const columns = strList(f.columns);
        const rowLabels = strList(f.rows);
        const rows = rowLabels.length || clampInt(f.rows, 1, 12, 3);
        if (columns.length) return { kind: 'table', columns, rowLabels, rows, parts: rows * columns.length, placeholder };
    }
    return { kind: f.kind === 'short' ? 'short' : 'text', parts: 1, placeholder };
}

// Bài làm -> danh sách "ô" để dò (bài một ô: [text])
export function answerDocs(q, input) {
    if (typeof input === 'string') return [input];
    const fmt = formatOf(q);
    if (fmt.parts > 1 && input && Array.isArray(input.parts)) {
        return Array.from({ length: fmt.parts }, (_, i) => String(input.parts[i] ?? ''));
    }
    return [String((input && input.text) || '')];
}

// Ô được phép dò cho một ý có field (đếm từ 1): danh sách/ô nhãn = đúng ô đó, bảng = cả hàng đó
function fieldDocs(fmt, field, n) {
    const all = Array.from({ length: n }, (_, i) => i);
    if (!field || n <= 1) return all;
    if (fmt.kind === 'table') {
        const cols = fmt.columns.length;
        return field <= fmt.rows ? all.slice((field - 1) * cols, field * cols) : all;
    }
    return field <= n ? [field - 1] : all;
}

// Gộp các ô thành một văn bản đọc được (lưu ở ans.text)
export function partsText(fmt, parts) {
    const v = (i) => String((parts && parts[i]) || '').trim();
    if (fmt.kind === 'list') {
        return Array.from({ length: fmt.count }, (_, i) => (v(i) ? `${i + 1}. ${v(i)}` : '')).filter(Boolean).join('\n');
    }
    if (fmt.kind === 'fields') return fmt.labels.map((l, i) => (v(i) ? `${l}: ${v(i)}` : '')).filter(Boolean).join('\n');
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
        return `${pad}- ${String(k.text || '').trim()} (${meta.join(', ')})${kw.length ? ` [${kw.join('; ')}]` : ''}`
            + (ord.length >= 2 ? ` {thứ tự: ${ord.join(' > ')}}` : '');
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
