import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrowize, arrowizeTyping, noteMdHtml, noteInlineHtml, noteHasMd } from '../page/quiz-note-md.js';

test('ký hiệu: mũi tên / so sánh đổi đúng, chuỗi dài trước chuỗi ngắn', () => {
    assert.equal(arrowize('a -> b --> c'), 'a → b → c');
    assert.equal(arrowize('x <- y <-- z'), 'x ← y ← z');
    assert.equal(arrowize('A <-> B <--> C'), 'A ↔ B ↔ C');
    assert.equal(arrowize('p => q ==> r <=> s <==> t'), 'p ⇒ q ⇒ r ⇔ s ⇔ t');
    assert.equal(arrowize('a >= 1, b <= 2, c != 3, d ~= 4, e +/- 5'), 'a ≥ 1, b ≤ 2, c ≠ 3, d ≈ 4, e ± 5');
    assert.equal(arrowize('34-35 ngày ~ 5,5 tuần'), '34-35 ngày ~ 5,5 tuần', 'gạch nối / dấu ~ thường giữ nguyên');
});

test('khung viết: đổi ngay khi gõ ký tự khép, Backspace có chữ gốc để trả lại', () => {
    const r = arrowizeTyping('hcg ->', 6, '>');
    assert.deepEqual(r, { text: 'hcg →', caret: 5, raw: '->', rep: '→' });
    assert.equal(arrowizeTyping('a <-', 4, '-'), null, '"<-" còn có thể thành "<->" nên chưa đổi');
    assert.equal(arrowizeTyping('a <->', 5, '>').text, 'a ↔');
    // gõ từng ký tự "<==>": ≤ -> ⇐ -> ⇔
    let v = 'x <='; v = arrowizeTyping(v, v.length, '=').text; assert.equal(v, 'x ≤');
    v += '='; v = arrowizeTyping(v, v.length, '=').text; assert.equal(v, 'x ⇐');
    v += '>'; v = arrowizeTyping(v, v.length, '>').text; assert.equal(v, 'x ⇔');
    assert.equal(arrowizeTyping('`a ->', 5, '>'), null, 'trong `mã` thì để nguyên');
    assert.equal(arrowizeTyping('->x>', 4, '>'), null, 'không đổi lén "->" người dùng đã giữ lại phía trước');
});

test('markdown: định dạng trong dòng, thoát HTML, không đụng chữ có dấu ~ thường', () => {
    assert.equal(noteInlineHtml('**đậm** và *nghiêng* ~~gạch~~ ==tô== `a->b` x^2^ H~2~O'),
        '<b>đậm</b> và <i>nghiêng</i> <s>gạch</s> <mark>tô</mark> <code>a-&gt;b</code> x<sup>2</sup> H<sub>2</sub>O');
    assert.equal(noteInlineHtml('<img src=x onerror=alert(1)> -> ok'), '&lt;img src=x onerror=alert(1)&gt; → ok');
    assert.equal(noteInlineHtml('khoảng ~ 34-35 ngày ~ 5,5 tuần'), 'khoảng ~ 34-35 ngày ~ 5,5 tuần');
    assert.equal(noteInlineHtml('snake_case_name và 3 * 4 * 5'), 'snake_case_name và 3 * 4 * 5');
});

test('markdown: mỗi dòng một khối, danh sách lồng, việc cần làm, tiêu đề, trích, nhãn', () => {
    const html = noteMdHtml('# Ý chính\n- một\n  - con\n1. số\n- [x] xong\n> trích\n\nNhớ: điều này\n---');
    assert.match(html, /<div class="h h1">Ý chính<\/div>/);
    assert.match(html, /<div class="li" style="--lv:0"><span class="b" aria-hidden="true">•<\/span><span class="c">một<\/span><\/div>/);
    assert.match(html, /style="--lv:1"><span class="b" aria-hidden="true">◦<\/span>/);
    assert.match(html, /<div class="li ol" style="--lv:0"><span class="b" aria-hidden="true">1\.<\/span>/);
    assert.match(html, /<div class="li task"[^>]*><span class="c"><span class="ck on"/);
    assert.match(html, /<div class="q">trích<\/div>/);
    assert.match(html, /<div class="g"><\/div>/);
    assert.match(html, /<span class="t">Nhớ:<\/span> điều này/);
    assert.match(html, /<hr>$/);
    assert.match(noteMdHtml('-> dòng mở đầu bằng mũi tên'), /^<div class="p">→ dòng/, '"->" đầu dòng không phải dấu danh sách');
    assert.equal(noteHasMd('ghi chú thường'), false);
    assert.equal(noteHasMd('có\nhai dòng'), true);
    assert.equal(noteHasMd('a -> b'), true);
});

test('ghi chú lồng: {cụm :: ghi chú con} — gạch cụm, dòng ↳ ngay sau dòng chứa cụm, lồng nhiều tầng, định dạng vẫn chạy', () => {
    const html = noteMdHtml('Do {niêm mạc :: **mỏng** {một lớp :: tế bào trụ}} dễ rách\ndòng hai');
    assert.equal(html, '<div class="p">Do <span class="sn" data-k="0">niêm mạc</span> dễ rách</div>'
        + '<div class="sub" data-k="0"><b>mỏng</b> <span class="sn" data-k="1">một lớp</span><div class="sub" data-k="1">tế bào trụ</div></div>'
        + '<div class="p">dòng hai</div>');
    assert.equal(noteMdHtml('{thiếu ghi chú ::} và {không có dấu}'), '<div class="p">{thiếu ghi chú ::} và {không có dấu}</div>', 'sai khuôn thì để nguyên chữ');
    assert.equal(noteHasMd('a {b :: c}'), true);
});
