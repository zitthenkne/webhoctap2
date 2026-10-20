// Xuống dòng / bảng / danh sách trong Ghi nhớ – Mở rộng (lỗi thật trên bộ đề 2026-10).
// Chạy: node --test  (từ thư mục webhoctap2)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown, splitRunOn } from '../quiz-helpers.js';

const text = (html) => html.replace(/<[^>]+>/g, ' ');

test('bảng thụt lề dưới một mục danh sách vẫn là bảng, không hiện nguyên dấu |', () => {
    const html = parseMarkdown('- **Phân tầng FIGO:**\n  | Stage | Doppler |\n  |---|---|\n  | 1 | bình thường |');
    assert.match(html, /<table/);
    assert.match(html, /<th[^>]*>Stage<\/th>/);
    assert.ok(!text(html).includes('|'));
});

test('"S. aureus" / "E. coli" đầu dòng là chữ thường, "a. mục" / "B. Mục" vẫn là danh sách', () => {
    for (const s of ['S. aureus gây ngộ độc.', 'E. coli, Klebsiella', 'H. pylori được WHO xếp nhóm I'])
        assert.ok(!parseMarkdown(s).includes('quiz-li-num'), s);
    assert.match(parseMarkdown('a. tăng huyết áp'), /quiz-li-num">a\.</);
    assert.match(parseMarkdown('B. Thai lưu'), /quiz-li-num">B\.</);
});

test('nhãn đậm "**…:**" rồi dòng mở đầu bằng $công thức$ không bị nối vào một dòng', () => {
    const html = parseMarkdown('**🧰 Công cụ:**\n$CPR = MCA/UA$ dưới p5');
    assert.match(html, /<\/strong><div class="quiz-md-gap"><\/div>/);
});

test('tự chữa: chữ "\\n" thô ngoài công thức thành xuống dòng, \\neq trong $…$ giữ nguyên', () => {
    const html = parseMarkdown('🧠 Ý một.\\n🤔 **Vì sao:** $a \\neq b$');
    assert.match(html, /Ý một\.<div class="quiz-md-gap"><\/div>🤔/);
    assert.ok(html.includes('$a \\neq b$'));
});

test('tự chữa: "\\to" bị JSON đọc thành TAB + o, "\\\\approx" trong $…$', () => {
    assert.ok(parseMarkdown('giảm $\to$ tăng').includes('giảm → tăng'));
    assert.ok(parseMarkdown('($\\\\approx 0$)').includes('$\\approx 0$'));
    assert.ok(parseMarkdown('$\x07lpha + 1$').includes('$\\alpha + 1$'));   // Python nuốt \a
});

test('KaTeX: % chưa escape, chữ Việt trong công thức, công thức chỉ là con số', () => {
    assert.ok(parseMarkdown('tỉ lệ $p < 5% x$').includes('$p &lt; 5\\% x$'));
    assert.ok(parseMarkdown('$Thiếu oxy \\to Giảm O_2 máu$ x').includes('$\\text{Thiếu oxy }\\to\\text{ Giảm O}_2\\text{ máu}$'));
    assert.ok(parseMarkdown('$Na_{đo được} + 1$ x').includes('$Na_{\\text{đo được}} + 1$'));
    assert.ok(parseMarkdown('$10\\text{ giờ}$ x').includes('$10\\text{ giờ}$'));      // \text sẵn: giữ nguyên
    assert.ok(parseMarkdown('$PI > p95$ x').includes('$PI &gt; p95$'));             // ký hiệu toán: giữ nguyên
    assert.match(parseMarkdown('**$37 - 38$ tuần**, $90 - 95%$'), /<strong[^>]*>37 - 38 tuần<\/strong>, 90 - 95%/);
});

test('tự chữa bảng gãy: xuống dòng giữa ô, rác sau dòng kẻ; "|x| = 3" vẫn là chữ', () => {
    const a = parseMarkdown('| Giai đoạn | Xử Trí &\nThời Điểm Sinh |\n|---|---|\n| 1 | 37 tuần |');
    assert.match(a, /<th[^>]*>Xử Trí &amp; Thời Điểm Sinh<\/th>|<th[^>]*>Xử Trí & Thời Điểm Sinh<\/th>/);
    assert.ok(!text(a).includes('|'));
    const b = parseMarkdown('| Thể | CTC |\n|---|---|s\n| Dọa sẩy | đóng |');
    assert.equal((b.match(/<table/g) || []).length, 1);
    assert.ok(!text(b).includes('---'));
    assert.ok(!parseMarkdown('|x| = 3 khi x âm').includes('<table'));
});

test('chặng Ghi nhớ dính cuối câu trước -> xuống dòng; "A ➔ 🎯 B" giữa câu giữ nguyên', () => {
    const s = splitRunOn('📌 Chốt: mổ ngay. 🤔 Tự vấn: vì sao? ⚠️ Bẫy: máy CT nguy hiểm. 🧠 Mẹo nhớ: bù không lên thì mổ.');
    assert.equal(s.split('\n').length, 4);
    assert.equal(splitRunOn('eGFR < 30 ➔ 🎯 ngưng thuốc'), 'eGFR < 30 ➔ 🎯 ngưng thuốc');
    assert.equal(splitRunOn('| a. 🧠 Mẹo: x | b |'), '| a. 🧠 Mẹo: x | b |');
});

test('mục 🔀 What-if viết liền nhiều "Nếu" -> mỗi kịch bản một gạch đầu dòng; mục sau không bị đụng', () => {
    const s = splitRunOn('🔀 **Đổi tình huống:** nếu A thì X. Nếu B thì Y. Nếu C thì Z.\n💊 **Ngọc:** Nếu đau. Nếu sốt.');
    assert.deepEqual(s.split('\n'), ['🔀 **Đổi tình huống:** ', '- nếu A thì X.', '- Nếu B thì Y.', '- Nếu C thì Z.', '💊 **Ngọc:** Nếu đau. Nếu sốt.']);
    assert.equal(splitRunOn('🔀 What-if\n- **Mổ ngay. Nếu chưa** thì chờ.'), '🔀 What-if\n- **Mổ ngay. Nếu chưa** thì chờ.');   // trong **đậm**: không tách
    assert.equal((parseMarkdown('🔀 What-if: nếu A. Nếu B.').match(/quiz-li"/g) || []).length, 2);
});

test('dòng trống sinh khoảng .quiz-md-gap2 (CSS gộp đúng nó); dòng chữ liền nhau chỉ có .quiz-md-gap thường', () => {
    const html = parseMarkdown('📌 Chốt: a\n🤔 Tự vấn: b\n⚠️ Bẫy: c\n\n🔀 What-if');
    assert.equal((html.match(/class="quiz-md-gap"/g) || []).length, 3);
    assert.equal((html.match(/quiz-md-gap2/g) || []).length, 1);
    assert.match(html, /c<div class="quiz-md-gap"><\/div><div class="quiz-md-gap quiz-md-gap2"><\/div>🔀/);
});

test('"<p3", "<p10" ngoài công thức hiện đúng chữ, không nuốt ô bảng', () => {
    const html = parseMarkdown('| Sớm | AC/EFW <p3 hoặc UA mất dòng | AC <p10 |\n|---|---|---|\n| a | b | c |');
    assert.ok(html.includes('&lt;p3 hoặc UA mất dòng'));
    assert.ok(html.includes('&lt;p10'));
    assert.match(parseMarkdown('<h4>Tiêu đề</h4>'), /<h4>/);   // thẻ thật vẫn giữ
});
