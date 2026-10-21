// Trích dẫn ">" + callout kiểu Obsidian "> [!tip] …" (AI hay tự chèn) -> khối màu thay vì hiện nguyên dấu ">" / "[!tip]".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown } from '../quiz-helpers.js';

test('callout: loại -> màu + biểu tượng, tiêu đề tự đặt hoặc tên mặc định, nội dung parse như thường', () => {
    const html = parseMarkdown('> [!tip] Nhớ nhanh\n> - ý **một**\n> - ý hai');
    assert.match(html, /class="quiz-callout co-butter" data-co="tip"/);
    assert.match(html, /fa-lightbulb/);
    assert.match(html, /class="qco-t">Nhớ nhanh</);
    assert.match(html, /quiz-li[\s\S]*<strong class="obsidian-bold">một<\/strong>/);   // danh sách bên trong khối vẫn là danh sách
    assert.doesNotMatch(html, /\[!tip\]|&gt;|>\s*-\s*ý/);
    assert.match(parseMarkdown('> [!warning]\n> Coi chừng'), /co-peach[\s\S]*qco-t">Lưu ý</);
    assert.match(parseMarkdown('> [!DANGER] Cấp cứu'), /co-bad" data-co="danger"/);
});

test('callout: tên tiếng Việt (có / không dấu) và loại lạ', () => {
    assert.match(parseMarkdown('> [!Lưu ý] Bẫy hay gặp\n> x'), /co-peach" data-co="warning"[\s\S]*Bẫy hay gặp/);
    assert.match(parseMarkdown('> [!meo nho]\n> x'), /co-butter" data-co="tip"[\s\S]*Mẹo/);
    assert.match(parseMarkdown('> [!gv nhấn]\n> x'), /data-co="important"/);
    assert.match(parseMarkdown('> [!Cơ chế lõi]\n> x'), /co-sky" data-co="note"[\s\S]*qco-t">Cơ chế lõi</);   // loại lạ: kiểu Ghi chú, giữ chữ người viết
});

test('callout gập: "-" gập sẵn, "+" mở sẵn', () => {
    const closed = parseMarkdown('> [!example]- Ví dụ ca bệnh\n> Bệnh nhân nam');
    assert.match(closed, /^<details class="quiz-callout co-lav" data-co="example"><summary class="qco-head">/);
    assert.doesNotMatch(closed, / open>/);
    assert.match(parseMarkdown('> [!note]+ Mở sẵn\n> x'), /<details[^>]* open><summary/);
});

test('trích dẫn thường, tô màu theo emoji đầu dòng, khối lồng ">>"', () => {
    assert.match(parseMarkdown('> Lời dặn của thầy\n> dòng hai'), /^<blockquote class="quiz-quote">Lời dặn của thầy/);
    assert.match(parseMarkdown('> ⚠️ **Lưu ý:** không dùng nitrat'), /quiz-quote co-peach/);
    assert.match(parseMarkdown('> 💡 Mẹo'), /quiz-quote co-butter/);
    const nested = parseMarkdown('> [!note] Ngoài\n> > [!tip] Trong\n> > ý con');
    assert.match(nested, /data-co="note"[\s\S]*data-co="tip"[\s\S]*ý con/);
});

test('không nhận nhầm: "> 140 lần/phút", ">= 5", chữ ">" giữa câu, công thức trong khối vẫn còn', () => {
    assert.doesNotMatch(parseMarkdown('> 140 lần/phút là nhịp nhanh'), /quiz-quote|quiz-callout/);
    assert.doesNotMatch(parseMarkdown('>= 5 điểm'), /quiz-quote/);
    assert.doesNotMatch(parseMarkdown('HA > 140 mmHg'), /quiz-quote/);
    const math = parseMarkdown('Công thức:\n> [!info] Liều\n> $\\frac{a}{b}$ và $x^2$\n\nSau khối $y$');
    assert.match(math, /data-co="info"/);
    assert.equal((math.match(/\$\\frac\{a\}\{b\}\$|\$x\^2\$|\$y\$|frac|x\^2/g) || []).length >= 2, true);
    assert.doesNotMatch(math, /PLACEHOLDER/);                                // không sót chỗ giữ nào
});

test('hai callout viết liền nhau (không dòng trống) -> hai khối riêng, không lộ "[!tip]"', () => {
    const html = parseMarkdown('> [!warning] Bẫy\n> Nhầm A với B\n> [!tip]- Mẹo nhớ\n> Mg = magic guard');
    assert.equal((html.match(/class="quiz-callout/g) || []).length, 2);
    assert.match(html, /data-co="warning"[\s\S]*<details class="quiz-callout co-butter" data-co="tip">/);
    assert.doesNotMatch(html, /\[!tip\]/);
});
