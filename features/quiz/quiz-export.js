// Xuất các câu sai / bỏ trống ở màn kết quả (giai đoạn D · D4): Markdown để dán vào ghi chú, CSV (;) để nhập Anki.
// Hàm THUẦN (không đụng DOM) — test ở tests/quiz-export.test.js. Dựng mục xuất từ state ở quiz-ui.js (showResults).
//
// Một mục: { n, question, caseText, options: [chuỗi], correct: [chỉ số], picked: [chỉ số] | null (chưa trả lời),
//            modelAnswer (tự luận), explanation, note, expanded, myNote (ghi chú cá nhân của người làm) }

const letter = (i) => String.fromCharCode(65 + i);
const clean = (s) => String(s == null ? '' : s).replace(/\r\n/g, '\n').trim();
const optLine = (it, i) => `${letter(i)}. ${clean(it.options[i]).replace(/\n+/g, ' ')}`;
const optList = (it, idx) => idx.filter((i) => i >= 0 && i < it.options.length).map((i) => optLine(it, i));

export function wrongItemsMarkdown(items, title = '') {
    const out = [];
    const t = clean(title);
    out.push(`# ${t ? t + ' — ' : ''}${items.length} câu sai hoặc bỏ trống`, '');
    for (const it of items) {
        out.push(`## Câu ${it.n}`);
        if (clean(it.caseText)) out.push(`Tình huống: ${clean(it.caseText)}`, '');
        out.push(clean(it.question), '');
        const hasOptions = Array.isArray(it.options) && it.options.length > 0;
        if (hasOptions) {
            it.options.forEach((_, i) => out.push(`- ${optLine(it, i)}`));
            out.push('');
            const right = optList(it, it.correct || []);
            if (right.length) out.push(`✔ Đáp án đúng: ${right.join(' | ')}`);
            const mine = it.picked ? optList(it, it.picked) : [];
            out.push(mine.length ? `✘ Bạn chọn: ${mine.join(' | ')}` : '✘ Bạn chưa trả lời');
        } else if (clean(it.modelAnswer)) {
            out.push(`✔ Đáp án mẫu: ${clean(it.modelAnswer)}`);
        }
        if (clean(it.explanation)) out.push(`Giải thích: ${clean(it.explanation)}`);
        if (clean(it.note)) out.push(`Ghi nhớ: ${clean(it.note)}`);
        if (clean(it.expanded)) out.push(`Mở rộng: ${clean(it.expanded)}`);
        if (clean(it.myNote)) out.push(`Ghi chú của tôi: ${clean(it.myNote)}`);
        out.push('');
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// Một ô CSV: bọc nháy kép, nháy kép thành "", xuống dòng thành <br> (Anki bật "Allow HTML in fields")
const cell = (s) => '"' + clean(s).replace(/"/g, '""').replace(/\n/g, '<br>') + '"';

export function wrongItemsCsv(items, tag = '') {
    const safeTag = clean(tag).replace(/\s+/g, '_').replace(/["';]/g, '');
    const rows = items.map((it) => {
        const hasOptions = Array.isArray(it.options) && it.options.length > 0;
        const front = [clean(it.caseText) ? `Tình huống: ${clean(it.caseText)}` : '', clean(it.question),
            ...(hasOptions ? it.options.map((_, i) => optLine(it, i)) : [])].filter(Boolean).join('\n');
        const right = hasOptions ? optList(it, it.correct || []) : [];
        const back = [
            right.length ? `Đáp án đúng: ${right.join(' | ')}` : (clean(it.modelAnswer) ? `Đáp án mẫu: ${clean(it.modelAnswer)}` : ''),
            clean(it.explanation) ? `Giải thích: ${clean(it.explanation)}` : '',
            clean(it.note) ? `Ghi nhớ: ${clean(it.note)}` : '',
            clean(it.expanded) ? `Mở rộng: ${clean(it.expanded)}` : '',
            clean(it.myNote) ? `Ghi chú của tôi: ${clean(it.myNote)}` : '',
        ].filter(Boolean).join('\n');
        return [cell(front), cell(back), cell(safeTag)].join(';');
    });
    // BOM để Excel/Anki nhận UTF-8 tiếng Việt
    return '﻿' + rows.join('\r\n') + '\r\n';
}
