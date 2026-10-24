// Kiểm tra bố cục thật bằng Playwright có sẵn. Khi không cài trong repo, đặt PLAYWRIGHT_MODULE
// trỏ tới package Playwright và ANNOTATION_BROWSER_PATH trỏ tới Chrome / Edge executable.
// --touch-only: chỉ chạy hồi quy lưu ghi chú khi chuyển câu trên cảm ứng.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source = (await readFile(new URL('../page/quiz-annotations.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?$/gm, '').replace(/^export /gm, '');
const css = await readFile(new URL('../quiz-stationery.css', import.meta.url), 'utf8');
const notesSource = await readFile(new URL('../page/quiz-notes-panel.js', import.meta.url), 'utf8');
const noteTags = notesSource.slice(notesSource.indexOf('export const NOTE_TAGS'), notesSource.indexOf('// Một ghi chú → HTML')).replace(/^export /gm, '');
const stub = `const state={questions:[{question:'fixture'}],currentIndex:0,quizData:{id:'test'}};
const studyKeys=()=>({annot:'test-annotations',annotDel:'test-del'}),pushStudyToCloud=()=>{};
const noteTextHtml=v=>v.replaceAll('<','&lt;');
const noteCount=()=>0,syncQuizNavPanel=()=>{},showQuestion=()=>{};` + noteTags;
const phrase = (id, text, note) => `<span class="quiz-annot annot-note" data-annot-id="${id}" data-note="${note}">${text}</span>`;
const balancedNote = 'cái này dùng để hạ huyết áp nhưng vô tình làm lượng máu đến bánh nhau giảm -> nếu dùng thì dùng loại uống phóng thích nhanh để hạ áp từ từ kiểm soát được tốc độ';
const fixtures = {
    inlineArrow: `Tiền căn sản khoa: 1 lần ${phrase('surgery', 'mổ lấy thai', '⭐ nhưng mà vết mổ kiểu gì (ngang, dọc, T?)')} vì ngôi ngang, cách đây ${phrase('years', '4 năm', 'hơn mốc 18–24 tháng')} tại bệnh viện Từ Dũ.`,
    adjacent: `Nhau bong tự nhiên kiểu ${phrase('a', 'Duncan', 'bong từ rìa vào trung tâm')}, kèm mất máu ${phrase('b', '500 mL', 'mất trên 500 là tính là BHSS rồi')}. ${phrase('c', 'Tử cung gò kém', 'đờ tử cung')} sau sổ nhau.`,
    dense: 'Một đoạn ' + ['rất', 'nhiều', 'cụm', 'từ', 'gần nhau'].map((text, i) => phrase('d' + i, text, 'Ghi chú số ' + i + ' có nhiều chữ để thử bố cục')).join(' ') + ' trong một đoạn dài để theo dõi xuống dòng.',
    multiline: 'Đây là <strong>nội dung ' + phrase('m', 'cụm từ rất dài trải qua nhiều dòng trên điện thoại và chứa <em>định dạng lồng nhau</em> bên trong để kiểm tra', 'Nhớ xem toàn bộ cụm từ') + ' cách đặt ghi chú</strong> sau khi đổi kích thước màn hình.',
    table: '<table style="width:100%;table-layout:fixed"><tr><td>' + phrase('t1', 'Một cụm từ', 'Diễn giải thứ nhất') + ' trong ô một</td><td>' + phrase('t2', 'Một cụm khác', 'Diễn giải thứ hai') + ' trong ô hai</td></tr></table>'
};
fixtures.hardBreak = fixtures.inlineArrow + '<br>hậu phẫu ổn, bé hiện khỏe.';
fixtures.upperFallback = 'Hai cụm ' + phrase('upper1', 'A', 'Ghi chú thứ nhất khá dài và cần bám sát cụm từ') + ' '
    + phrase('upper2', 'B', 'Ghi chú thứ hai khá dài và cần bám sát cụm từ') + ' đứng rất gần nhau trên cùng một dòng.';
fixtures.balancedLines = 'Sáng nay: Huyết áp đột ngột tăng, kèm nhức đầu nhiều. Nhân viên y tế<br>cho thêm '
    + phrase('balanced', 'Nifedipine ngậm dưới lưỡi', balancedNote) + '.';
fixtures.manualBreak = phrase('manual', 'Cụm từ', 'Dòng ngắn.\nDòng dài hơn được giữ nguyên.');
const fixtureHtml = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}
body{margin:0;padding:18px;font:600 20px/1.8 sans-serif}#quizSection{max-width:1200px;margin:auto}</style>
<body class="qz-notes-inline"><div id="quizSection"><div data-annot="q"></div></div><div id="annot-toolbar" hidden></div></body>`;
const browser = await chromium.launch(process.env.ANNOTATION_BROWSER_PATH
    ? { executablePath: process.env.ANNOTATION_BROWSER_PATH, headless: true } : { headless: true });
async function checkLayoutAndColors() {
    const page = await browser.newPage();
    await page.route('http://annotations.test/**', route => route.fulfill({ contentType: 'text/html', body: fixtureHtml }));
    await page.goto('http://annotations.test/');
    await page.addScriptTag({ content: stub + source + '\nwindow.annotationTest={renderNoteLines,clearNoteLines};setupAnnotations();' });
    const load = html => page.evaluate(html => {
        const scope = document.querySelector('[data-annot]');
        scope.innerHTML = html;
        localStorage.setItem('test-annotations', JSON.stringify({ fixture: [...scope.querySelectorAll('[data-annot-id]')].map(sp => ({
            id: sp.dataset.annotId, scope: 'q', type: 'note', text: sp.textContent, note: sp.dataset.note
        })) }));
        annotationTest.renderNoteLines(document.getElementById('quizSection'));
    }, html);
    const inspect = () => page.evaluate(() => {
        const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
        const scope = document.querySelector('[data-annot]'), original = scope.textContent;
        const rows = [...scope.querySelectorAll('.an-line')], boxes = rows.map(r => r.getBoundingClientRect());
        const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT), textBoxes = [];
        let node;
        while ((node = walker.nextNode())) {
            if (!node.nodeValue.trim()) continue;
            const range = document.createRange(); range.selectNodeContents(node);
            textBoxes.push(...range.getClientRects());
        }
        const collisions = boxes.some((a, i) => boxes.slice(i + 1).some(b => overlap(a, b)));
        const textOverlap = boxes.some(a => textBoxes.some(b => b.width > 1 && overlap(a, b)));
        for (let i = 0; i < 5; i++) annotationTest.renderNoteLines(document.getElementById('quizSection'));
        const directionCorrect = [...scope.querySelectorAll('.an-band')].every(band => {
            const br = band.getBoundingClientRect(), rows = [...band.querySelectorAll('.an-line')];
            return [...band.querySelectorAll('.an-links path')].every((path, i) => {
                const d = path.getAttribute('d');
                const curve = d.split(' M')[0].match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi).map(Number);
                const tip = d.match(/ L([^ ]+)/)[1].split(',').map(Number);
                const note = rows[i].getBoundingClientRect(), phrase = [...rows[i]._last.getClientRects()].at(-1);
                const near = (x, y, rect) => x >= rect.left - 6 && x <= rect.right + 6 && y >= rect.top - 6 && y <= rect.bottom + 6;
                return near(curve[0] + br.left, curve[1] + br.top, phrase)
                    && near(curve.at(-2) + br.left, curve.at(-1) + br.top, note)
                    && tip[0] === curve.at(-2) && tip[1] === curve.at(-1);
            });
        });
        const textFollowsArrow = [...scope.querySelectorAll('.an-band')].every(band => {
            const br = band.getBoundingClientRect(), rows = [...band.querySelectorAll('.an-line')];
            return [...band.querySelectorAll('.an-links path')].every((path, i) => {
                const row = rows[i];
                if (row.classList.contains('is-side')) return true;
                const tip = path.getAttribute('d').match(/ L([^ ]+)/)[1].split(',').map(Number);
                const rr = row.getBoundingClientRect(), style = getComputedStyle(row);
                const edge = row.classList.contains('is-trailing') ? rr.right - parseFloat(style.paddingRight) + 4 : rr.left + parseFloat(style.paddingLeft) - 4;
                return Math.abs(tip[1] + br.top - rr.top - parseFloat(style.lineHeight) / 2) < 1
                    && Math.abs(tip[0] + br.left - edge) < 1;
            });
        });
        return { collisions, textOverlap, overflow: document.documentElement.scrollWidth > innerWidth,
            stable: scope.textContent === original && scope.querySelectorAll('.an-line').length === rows.length,
            directionCorrect, textFollowsArrow, arrows: scope.querySelectorAll('.an-links path[data-points-to="note"]').length, count: rows.length };
    });
    let checks = 0;
    for (const width of [320, 375, 390, 480, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        for (const [name, html] of Object.entries(fixtures)) {
            await load(html);
            const result = await inspect();
            assert.equal(result.collisions, false, `${name}/${width}: ghi chú chồng nhau`);
            assert.equal(result.textOverlap, false, `${name}/${width}: ghi chú đè lên đề`);
            assert.equal(result.overflow, false, `${name}/${width}: tràn màn hình`);
            assert.equal(result.stable, true, `${name}/${width}: reflow đổi chữ / nhân đôi ghi chú`);
            assert.equal(result.arrows, result.count, `${name}/${width}: thiếu mũi tên tới ghi chú`);
            assert.equal(result.directionCorrect, true, `${name}/${width}: đuôi phải ở cụm từ, đầu nhọn phải ở ghi chú`);
            assert.equal(result.textFollowsArrow, true, `${name}/${width}: chữ ghi chú phải ngay sau đầu tên trên cùng hàng`);
            checks++;
        }
    }
    await page.setViewportSize({ width: 1000, height: 900 });
    await load(fixtures.balancedLines);
    const balance = await page.locator('.an-line[data-id="balanced"]').evaluate(row => {
        // Probe dùng đúng font, bề rộng và cách dựng ::after để đo độ dài từng dòng chữ thật.
        const style = getComputedStyle(row, '::after'), probe = document.createElement('span');
        for (const prop of ['display', 'font', 'letter-spacing', 'line-height', 'white-space', 'overflow-wrap', 'text-wrap', '-webkit-box-orient', '-webkit-line-clamp']) {
            probe.style.setProperty(prop, style.getPropertyValue(prop));
        }
        Object.assign(probe.style, { position: 'fixed', left: '-10000px', top: '0', width: style.width, visibility: 'hidden' });
        probe.textContent = row.dataset.txt;
        document.body.append(probe);
        let arrowIntact = true;
        const widths = () => {
            const lines = new Map();
            for (const word of probe.textContent.matchAll(/\S+/g)) {
                const range = document.createRange();
                range.setStart(probe.firstChild, word.index); range.setEnd(probe.firstChild, word.index + word[0].length);
                const rects = [...range.getClientRects()];
                if (word[0].includes('-\u2060>') && rects.length !== 1) arrowIntact = false;
                rects.forEach(rect => {
                    const y = Math.round(rect.top), old = lines.get(y) || { left: rect.left, right: rect.right };
                    old.left = Math.min(old.left, rect.left); old.right = Math.max(old.right, rect.right); lines.set(y, old);
                });
            }
            return [...lines.values()].map(line => line.right - line.left);
        };
        const balanced = widths();
        probe.style.textWrap = 'wrap'; const greedy = widths();
        probe.style.textWrap = 'balance'; probe.style.width = '900px';
        probe.textContent = 'Dòng ngắn.\nDòng dài hơn được giữ nguyên.'; const manualLines = widths().length;
        probe.textContent = 'Ghi chú ngắn'; const shortLines = widths().length;
        probe.remove();
        const band = row.closest('.an-band');
        const coords = band.querySelector('.an-links path').getAttribute('d').split(' M')[0].match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi).map(Number);
        return { balanced, greedy, arrowIntact, manualLines, shortLines, rowWidth: row.offsetWidth, bandWidth: band.clientWidth,
            arrowSpan: Math.abs(coords[0] - coords.at(-2)), side: row.classList.contains('is-side') };
    });
    assert.equal(balance.balanced.length, 2, 'ghi chú dài có hai dòng hiển thị đầy đủ');
    assert.equal(balance.balanced.length, balance.greedy.length, 'cân dòng không tăng số dòng');
    const ratio = widths => Math.min(...widths) / Math.max(...widths);
    assert.ok(ratio(balance.balanced) >= .85, 'hai dòng cân đối: ' + JSON.stringify(balance.balanced));
    assert.ok(ratio(balance.balanced) >= ratio(balance.greedy), 'cân bằng tốt hơn kiểu dồn đầy dòng đầu');
    assert.ok(balance.rowWidth < balance.bandWidth * .9, 'khung thu theo chữ đã cân, để khoảng trống còn lại dùng được: ' + JSON.stringify(balance));
    assert.ok(balance.arrowSpan <= 36, 'ghi chú được đặt lại sát cụm, không kéo bẹt mũi tên vì khung rỗng: ' + balance.arrowSpan);
    assert.equal(balance.side, false, 'ghi chú hai dòng không bị nhét vào khoảng trống cùng dòng nguồn');
    assert.equal(balance.arrowIntact, true, 'ký hiệu -> không bị chẻ giữa hai dòng');
    assert.equal(balance.manualLines, 2, 'giữ ngắt dòng người dùng nhập');
    assert.equal(balance.shortLines, 1, 'ghi chú ngắn vẫn nằm trên một dòng');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('test-annotations')).fixture[0].note), balancedNote, 'không đổi nội dung ghi chú đã lưu');
    await load(fixtures.hardBreak);
    assert.equal(await page.locator('.an-line[data-id="years"]').evaluate(r => r.classList.contains('is-trailing')), false, 'ghi chú ngắn quay phải khi vẫn gần cụm và còn chỗ');
    const spacing = await page.locator('.an-band').evaluate(b => {
        const rows = [...b.querySelectorAll('.an-line')].map(r => r.getBoundingClientRect()).sort((a, b) => a.left - b.left);
        return rows[1].left - rows[0].right;
    });
    const spacingDetails = await page.locator('.an-band').evaluate(b => ({ width: b.clientWidth, rows: [...b.querySelectorAll('.an-line')].map(r => ({
        text: r.dataset.txt, width: r.offsetWidth, natural: r._nat, left: r.getBoundingClientRect().left,
        source: r._last.getBoundingClientRect().toJSON(), trailing: r.classList.contains('is-trailing')
    })) }));
    assert.ok(spacing >= 39, 'ưu tiên đủ khoảng thở giữa hai ghi chú (cho phép làm tròn pixel): ' + spacing + ' ' + JSON.stringify(spacingDetails));
    assert.equal(await page.locator('.an-band').count(), 1, 'hai ghi chú cùng dòng trước BR phải được xếp chung để nhường chỗ');
    assert.equal(await page.locator('.an-links path').evaluateAll(paths => paths.every(path => {
        const coords = path.getAttribute('d').split(' M')[0].match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi).map(Number);
        return Math.abs(coords[0] - coords.at(-2)) <= 64;
    })), true, 'tận dụng hai mép nối để giữ đường cong ngắn');
    await load(fixtures.upperFallback);
    assert.equal(await page.locator('.an-line.is-above').count(), 1, 'cả hai hướng dưới dòng không bám sát được thì đặt một ghi chú lên trên');
    assert.equal(await page.locator('.an-line:not(.is-above)').count(), 1, 'ghi chú còn lại vẫn sát cụm bên dưới, không thêm tầng thừa');
    assert.equal((await inspect()).textOverlap, false, 'ghi chú phía trên không đè lên dòng nguồn');
    await load(phrase('side', 'Cụm từ', 'Ghi chú ngắn'));
    assert.equal(await page.locator('.an-line').evaluate(r => r.classList.contains('is-side')), true, 'tận dụng khoảng trống ngay cạnh cụm');
    assert.equal(await page.locator('.an-links path').getAttribute('data-shape'), 'side');
    const svgSize = await page.locator('.an-links').evaluate(r => ({ height: r.getBoundingClientRect().height, min: getComputedStyle(r).minHeight, cssHeight: getComputedStyle(r).height }));
    assert.ok(svgSize.height > 0, 'SVG cùng dòng vẫn có viewport để vẽ: ' + JSON.stringify(svgSize));
    await load('Khám trong: Cổ tử cung mở ' + phrase('near', '4 cm', 'chuyển dạ rồi') + ', xóa 70%, ngôi chỏm, độ lọt -2, ối còn. Ước lượng cân thai # 3300 g.');
    assert.equal(await page.locator('.an-line').evaluate(r => r.classList.contains('is-side')), false, 'không đẩy ghi chú xa ra mép phải');
    assert.equal(await page.locator('.an-links path').getAttribute('data-shape'), 'hook');
    await page.locator('.annot-note').click();
    await page.locator('[data-anp="edit"]').click();
    await page.locator('[data-note-color="#6FD1AE"]').click();
    await page.locator('[data-note-field="inkColor"]').fill('#13579b');
    await page.locator('[data-anp="save"]').click();
    assert.equal(await page.locator('.an-line').evaluate(r => r.style.getPropertyValue('--nt-ink')), '#13579b');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('test-annotations')).fixture[0].color), '#6fd1ae');
    await page.locator('.annot-note').click();
    await page.locator('[data-anp="edit"]').click();
    assert.equal(await page.locator('[data-note-field="inkColor"]').inputValue(), '#13579b');
    await page.locator('[data-anp="auto-color"]').click();
    await page.locator('[data-anp="save"]').click();
    assert.equal(await page.locator('.an-line').evaluate(r => r.style.getPropertyValue('--nt-ink')), '');
    await page.evaluate(() => document.body.classList.remove('qz-notes-inline'));
    await page.waitForFunction(() => !document.querySelector('.an-line'));
    await page.evaluate(() => document.body.classList.add('qz-notes-inline'));
    await page.waitForFunction(() => document.querySelector('.an-links path'));
    await page.setViewportSize({ width: 320, height: 400 });
    await page.evaluate(() => { document.documentElement.classList.add('theme-dark'); window.quizKeyEvents = 0; document.addEventListener('keydown', () => window.quizKeyEvents++); });
    await page.locator('.annot-note').click();
    await page.locator('[data-anp="edit"]').click();
    assert.equal(await page.locator('[data-anp-tag]').count(), 6);
    assert.equal(await page.locator('#annot-note-pop').evaluate(r => r.getBoundingClientRect().bottom <= innerHeight), true, 'khung sửa nằm gọn trên màn hình thấp');
    await page.locator('[data-note-field="inkColor"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => window.quizKeyEvents), 0, 'chỉnh màu bằng bàn phím không kích hoạt phím tắt quiz');
    await page.locator('#annot-note-pop').evaluate(el => el.remove());
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.addStyleTag({ content: await readFile(new URL('../quiz-min.css', import.meta.url), 'utf8') });
    const colorNotes = key => ['Ghi chú tự động', '⭐ Quan trọng', 'Dễ nhầm với: tình huống khác', 'Hỏi lại: vì sao?'].map((note, i) =>
        phrase(key + i, 'Cụm từ cần ghi nhớ', note) + ' trong nội dung câu hỏi. ').join('');
    const surface = (name, attrs) => `<section data-surface="${name}" ${attrs}>${colorNotes(name)}</section>`;
    await load(surface('paper', 'class="quiz-card"') + surface('case', 'id="clinical-case-panel"')
        + surface('memo', 'class="kb-card kb-memo"') + surface('more', 'class="kb-card kb-more"')
        + surface('reason', 'class="kb-card kb-reason"') + '<div id="answers-container">'
        + ['a', 'b', 'c', 'd', 'picked', 'correct', 'wrong'].map((name, i) => surface(name,
            `class="answer-btn ${['', '', '', '', 'bg-blue-100', 'bg-green-200', 'bg-red-200'][i]}"`)).join('') + '</div>'
        + ['exp-correct', 'exp-wrong-selected', 'exp-wrong-normal'].map(name => surface(name, `class="option-explanation ${name}"`)).join('')
        + surface('custom', '') + '<p><span data-note="Ghi chú của nhóm">Ghi chú tĩnh của nhóm</span></p>');
    await page.evaluate(() => {
        const store = JSON.parse(localStorage.getItem('test-annotations'));
        store.fixture.filter(a => a.id.startsWith('custom')).forEach(a => { a.color = '#aabbcc'; a.inkColor = '#13579b'; });
        localStorage.setItem('test-annotations', JSON.stringify(store));
        annotationTest.renderNoteLines(document.getElementById('quizSection'));
    });
    let colorChecks = 0, minContrast = Infinity;
    for (const minimal of [false, true]) for (const paper of ['plain', 'grid', 'dot', 'lined']) for (const dark of [false, true]) {
        await page.evaluate(({ minimal, paper, dark }) => {
            document.documentElement.classList.toggle('ui-min', minimal);
            document.documentElement.classList.toggle('theme-dark', dark);
            document.documentElement.setAttribute('data-paper', paper);
        }, { minimal, paper, dark });
        await page.waitForTimeout(250); // Chờ transition màu; không gọi lại renderer khi đổi sáng/tối.
        const colors = await page.evaluate(() => {
            // Canvas chuyển cả rgb() và color-mix() đã tính thành pixel sRGB thật.
            const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
            const pixel = color => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data]; };
            const over = (a, b) => a.slice(0, 3).map((v, i) => v * a[3] / 255 + b[i] * (1 - a[3] / 255));
            const background = el => {
                const layers = [];
                for (let p = el; p; p = p.parentElement) layers.push(pixel(getComputedStyle(p).backgroundColor));
                return layers.reverse().reduce((bg, fg) => over(fg, bg), [255, 255, 255]);
            };
            const luminance = rgb => rgb.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
                .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
            const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
            return [...document.querySelectorAll('.an-band')].flatMap(band => {
                const paths = [...band.querySelectorAll('.an-links path')];
                return [...band.querySelectorAll('.an-line')].map((row, i) => {
                    const bg = background(row), ink = pixel(getComputedStyle(row).color);
                    const path = paths[i], arrow = pixel(getComputedStyle(path).stroke);
                    arrow[3] *= Number(getComputedStyle(path).opacity);
                    return { surface: row.closest('[data-surface]')?.dataset.surface || 'group', id: row.dataset.id,
                        ink: ink.slice(0, 3), arrow: pixel(getComputedStyle(path).stroke).slice(0, 3),
                        textContrast: contrast(over(ink, bg), bg), arrowContrast: contrast(over(arrow, bg), bg),
                        highlight: row._last.style.getPropertyValue('--nt') };
                });
            });
        });
        for (const color of colors) {
            const label = `${minimal ? 'minimal' : 'pastel'}/${paper}/${dark ? 'dark' : 'light'}/${color.surface}/${color.id}`;
            assert.deepEqual(color.arrow, color.ink, label + ': mũi tên phải đổi cùng màu chữ, kể cả nhãn và màu tự chọn');
            if (color.surface === 'custom') {
                assert.deepEqual(color.ink, [19, 87, 155], label + ': giữ chính xác màu tự chọn');
                assert.equal(color.highlight, '#aabbcc', label + ': giữ highlight tự chọn');
            } else {
                assert.ok(color.textContrast >= 4.5, label + ': chữ chưa đủ rõ: ' + color.textContrast);
                assert.ok(color.arrowContrast >= 3, label + ': mũi tên chưa đủ rõ: ' + color.arrowContrast);
                minContrast = Math.min(minContrast, color.textContrast);
            }
            colorChecks++;
        }
    }
    console.log(`PASS: ${checks} bố cục, ${colorChecks} màu ghi chú theo nền/sáng tối/kiểu giấy, tương phản chữ thấp nhất ${minContrast.toFixed(2)}:1, lưu/reset màu, bật/tắt và bàn phím.`);
}
async function checkTouchPersistence() {
    const touchPage = await browser.newPage({ viewport: { width: 768, height: 1024 }, hasTouch: true, isMobile: true });
    await touchPage.route('http://annotations.test/**', route => route.fulfill({ contentType: 'text/html', body: fixtureHtml }));
    const bootTouch = async () => {
        await touchPage.goto('http://annotations.test/');
        await touchPage.addScriptTag({ content: stub + source + '\nwindow.annotationTest={openNoteEditor,applyAnnotationsAll,dismissNoteEditor};setupAnnotations();' });
        await touchPage.evaluate(() => {
            const sec = document.getElementById('quizSection');
            const draw = () => {
                sec.innerHTML = '<div data-annot="q">Cụm từ cần nhớ ở câu ' + (state.currentIndex + 1) + '.</div>';
                annotationTest.applyAnnotationsAll();
            };
            const next = document.createElement('button');
            next.id = 'touch-next'; next.textContent = 'Chuyển câu';
            Object.assign(next.style, { position: 'fixed', bottom: '20px', right: '20px' });
            next.onclick = () => { state.currentIndex = 1 - state.currentIndex; draw(); };
            document.body.append(next);
            state.questions.push({ question: 'câu thứ hai' });
            draw();
        });
    };
    const openTouch = (ctx = {}) => touchPage.evaluate(ctx => {
        const scopeEl = document.querySelector('[data-annot]');
        annotationTest.openNoteEditor({ mode: 'new', qText: 'fixture', scope: 'q', scopeEl, start: 0, end: 6, text: 'Cụm từ', rect: scopeEl.getBoundingClientRect(), ...ctx });
    }, ctx);
    const storedTouch = () => touchPage.evaluate(() => JSON.parse(localStorage.getItem('test-annotations') || '{}'));
    await bootTouch();
    assert.equal(await touchPage.evaluate(() => matchMedia('(pointer: coarse)').matches), true);
    await openTouch();
    await touchPage.locator('.anp-ta').fill('Ghi chú viết trên iPad dọc');
    await touchPage.locator('#touch-next').tap();
    assert.equal((await storedTouch()).fixture?.[0]?.note, 'Ghi chú viết trên iPad dọc', 'chạm chuyển câu phải lưu phần đang viết');
    assert.equal(await touchPage.locator('#annot-note-pop').count(), 0);
    await touchPage.locator('#touch-next').tap();
    assert.equal(await touchPage.locator('.annot-note').getAttribute('data-note'), 'Ghi chú viết trên iPad dọc', 'quay lại câu phải khôi phục ghi chú');
    await touchPage.locator('.annot-note').tap();
    await touchPage.locator('[data-anp="edit"]').tap();
    await touchPage.locator('.anp-ta').fill('Nội dung đã sửa');
    await touchPage.locator('[data-note-color="#6FD1AE"]').tap();
    await touchPage.locator('#touch-next').tap();
    const edited = (await storedTouch()).fixture;
    assert.equal(edited.length, 1, 'sửa ghi chú không tạo bản trùng');
    assert.equal(edited[0].note, 'Nội dung đã sửa');
    assert.equal(edited[0].color, '#6fd1ae');
    await bootTouch();
    assert.equal(await touchPage.locator('.annot-note').getAttribute('data-note'), 'Nội dung đã sửa', 'tải lại trang vẫn giữ ghi chú');
    await touchPage.locator('.annot-note').tap();
    await touchPage.locator('[data-anp="edit"]').tap();
    await touchPage.locator('.anp-ta').fill('Phần sửa đã hủy');
    await touchPage.locator('[data-anp="cancel"]').tap();
    assert.equal((await storedTouch()).fixture[0].note, 'Nội dung đã sửa', 'Hủy phải bỏ phần sửa');
    await touchPage.evaluate(() => { document.querySelector('[data-annot="q"]').textContent = 'Cụm từ khác.'; });
    await openTouch();
    await touchPage.locator('.anp-ta').fill('   ');
    await touchPage.locator('#touch-next').tap();
    assert.equal((await storedTouch()).fixture.length, 1, 'chạm ngoài ô rỗng không tạo hoặc xóa ghi chú');
    await touchPage.evaluate(() => {
        state.questions.forEach(q => q.caseId = 'shared');
        document.getElementById('quizSection').innerHTML = '<div data-annot="case">Cụm từ dùng chung trong ca.</div>';
    });
    await openTouch({ qText: 'case:shared', scope: 'case' });
    await touchPage.locator('.anp-ta').fill('Ghi chú của ca dùng chung');
    await touchPage.locator('[data-anp="save"]').tap();
    await touchPage.locator('#touch-next').tap();
    await touchPage.evaluate(() => {
        document.getElementById('quizSection').innerHTML = '<div data-annot="case">Cụm từ dùng chung trong ca.</div>';
        annotationTest.applyAnnotationsAll();
    });
    assert.equal(await touchPage.locator('.annot-note').getAttribute('data-note'), 'Ghi chú của ca dùng chung', 'câu con khác vẫn đọc được ghi chú cùng ca');
    await touchPage.locator('.annot-note').tap();
    await touchPage.locator('[data-anp="edit"]').tap();
    await touchPage.locator('.anp-ta').fill('Phần sửa còn mở khi đổi câu');
    await touchPage.evaluate(() => {
        state.currentIndex = 1 - state.currentIndex;
        document.getElementById('quizSection').innerHTML = '';
        annotationTest.dismissNoteEditor(); // đổi câu từ mã: không có touchstart / mousedown
    });
    assert.equal((await storedTouch())['case:shared'][0].note, 'Phần sửa còn mở khi đổi câu', 'lưu theo ngữ cảnh cũ kể cả khi DOM đã bị thay');
    assert.equal((await storedTouch())['case:shared'].length, 1);
    assert.equal(await touchPage.locator('#annot-note-pop').count(), 0);
    await touchPage.close();
    console.log('PASS: lưu/sửa ghi chú và màu trên iPad dọc khi chuyển câu, quay lại, tải lại; Hủy, ô rỗng và ca dùng chung giữ đúng dữ liệu.');
}
try {
    await checkTouchPersistence();
    if (!process.argv.includes('--touch-only')) await checkLayoutAndColors();
} finally {
    await browser.close();
}
