// features/quiz/quiz-helpers.js
import { isEssay, isEssayPassed, essayCredit, questionWeight } from './quiz-essay-core.js';

// Cờ đảm bảo mermaid.initialize() chỉ chạy MỘT lần duy nhất (tránh reset cấu hình giữa chừng)
let mermaidInitialized = false;

// Hàng đợi để các lần render không chạy đè (await) lên nhau gây race condition
let mermaidRenderQueue = Promise.resolve();

export function ensureMermaidInit() {
    if (mermaidInitialized || !window.mermaid || typeof mermaid.initialize !== 'function') return;
    try {
        // Cấu hình Mermaid với tông màu Pastel tương đồng với trang web, phân biệt rõ các ô
        mermaid.initialize({
            startOnLoad: false,
            theme: 'base',
            securityLevel: _mmSecurity, // mặc định 'loose' (nhãn HTML); trang nhiều người cùng sửa đặt 'antiscript' qua configureMermaid
            flowchart: { useMaxWidth: true, htmlLabels: true },
            themeVariables: {
                // Bảng màu kẹo pastel dùng chung cả web (quiz, flashcard, phòng đánh đề): nền phẳng,
                // viền đậm hơn một bậc, chữ mực cùng tông. Ô sơ đồ luồng ở quiz.html còn được tô
                // xoay vòng 6 màu bằng CSS (quiz-stationery.css §16).
                fontSize: '15px',
                fontFamily: 'Quicksand, sans-serif',
                background: '#FFFDF8',
                textColor: '#5A4640',
                titleColor: '#8E2F57',

                primaryColor: '#FFE3EC', primaryTextColor: '#8E2F57', primaryBorderColor: '#F5A3BF',
                secondaryColor: '#E9E1FF', secondaryTextColor: '#5B45A8', secondaryBorderColor: '#C3B1F5',
                tertiaryColor: '#DDF5EA', tertiaryTextColor: '#1F6B4C', tertiaryBorderColor: '#98DDBD',

                lineColor: '#E98BAE',
                arrowheadColor: '#E98BAE',
                edgeLabelBackground: '#FFF3C4',
                clusterBkg: '#F6F1FF',
                clusterBorder: '#C9B8F5',

                // Ghi chú / sơ đồ trình tự
                noteBkgColor: '#FFF3C4', noteTextColor: '#7A5E1E', noteBorderColor: '#F2CE6B',
                actorBkg: '#E3F1FD', actorBorder: '#8DC3EF', actorTextColor: '#2A5E8C', actorLineColor: '#B9D8F2',
                signalColor: '#C97A98', signalTextColor: '#5A4640',
                labelBoxBkgColor: '#FFE3EC', labelBoxBorderColor: '#F5A3BF', labelTextColor: '#8E2F57', loopTextColor: '#8E2F57',
                activationBkgColor: '#FFF3C4', activationBorderColor: '#F2CE6B',

                // Biểu đồ tròn: 12 lát kẹo, viền trắng thay viền đen
                pie1: '#FFB3C7', pie2: '#FFD0A8', pie3: '#FFE39A', pie4: '#B8E6CF', pie5: '#BCDAF6', pie6: '#D6C9FA',
                pie7: '#F8C4DF', pie8: '#CDEBB8', pie9: '#FFCFC7', pie10: '#C4E8F0', pie11: '#EFD8C0', pie12: '#E6D3F6',
                pieStrokeColor: '#FFFFFF', pieStrokeWidth: '2px',
                pieOuterStrokeColor: '#F3C3D2', pieOuterStrokeWidth: '2px',
                pieTitleTextColor: '#8E2F57', pieSectionTextColor: '#5A4640', pieLegendTextColor: '#5A4640', pieOpacity: '1',

                // Sơ đồ tư duy / dòng thời gian / hành trình: mỗi nhánh một màu kẹo, chữ mực đậm
                cScale0: '#FFD1DE', cScale1: '#FFDDC2', cScale2: '#FFEBAF', cScale3: '#C9EEDB', cScale4: '#CBE3F9', cScale5: '#E0D6FC',
                cScale6: '#F9D2E6', cScale7: '#D8F0C8', cScale8: '#FFD9D2', cScale9: '#D0EDF3', cScale10: '#F2E1CF', cScale11: '#ECDDF8',
                cScaleLabel0: '#8E2F57', cScaleLabel1: '#9A4A12', cScaleLabel2: '#7A5E1E', cScaleLabel3: '#1F6B4C', cScaleLabel4: '#2A5E8C', cScaleLabel5: '#5B45A8',
                cScaleLabel6: '#8E2F57', cScaleLabel7: '#3F6B22', cScaleLabel8: '#A33A42', cScaleLabel9: '#1F6275', cScaleLabel10: '#83603F', cScaleLabel11: '#6A4FB8',
                // vạch dưới mỗi nhánh sơ đồ tư duy: đậm hơn nền nhánh một bậc (mặc định Mermaid là màu nghịch đảo, xanh/đỏ gắt)
                cScaleInv0: '#F28DB0', cScaleInv1: '#F5A870', cScaleInv2: '#E8C24A', cScaleInv3: '#7FCFAE', cScaleInv4: '#7EB8EA', cScaleInv5: '#A994EE',
                cScaleInv6: '#EFA0C8', cScaleInv7: '#9FCF7F', cScaleInv8: '#F59A8C', cScaleInv9: '#86CCD9', cScaleInv10: '#D9B48E', cScaleInv11: '#C9A8EE',
                git0: '#F5A3BF', git1: '#F7B889', git2: '#F0CF6B', git3: '#8FD6B4', git4: '#93C4F0', git5: '#BBA5F2', git6: '#F2A5CF', git7: '#A9D98A',
                // Biểu đồ đường / cột (xychart-beta): mặc định Mermaid tô đường vàng nhạt gần như vô hình trên nền giấy
                xyChart: {
                    backgroundColor: '#FFFDF8', titleColor: '#8E2F57',
                    xAxisLabelColor: '#5A4640', xAxisTitleColor: '#5A4640', xAxisTickColor: '#E3C7D2', xAxisLineColor: '#E3C7D2',
                    yAxisLabelColor: '#5A4640', yAxisTitleColor: '#5A4640', yAxisTickColor: '#E3C7D2', yAxisLineColor: '#E3C7D2',
                    plotColorPalette: '#E0528A, #5B9BD5, #3FAE7F, #F08A4B, #8C6FE0, #D9A21B'
                }
            }
        });
        mermaidInitialized = true;
    } catch (e) {
        console.error("Lỗi cấu hình Mermaid:", e);
    }
}

// --- Tải KaTeX / Mermaid THEO NHU CẦU: chỉ nạp khi câu hỏi thật sự có công thức / sơ đồ ---
// Nhờ vậy các bộ đề thuần văn bản không phải tải 2 thư viện nặng này -> mở trang nhanh hơn.
function _loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src; s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Không tải được ' + src));
        document.head.appendChild(s);
    });
}
function _loadCssOnce(href) {
    return new Promise((resolve) => {
        const l = document.createElement('link');
        l.rel = 'stylesheet'; l.href = href;
        l.onload = () => resolve();
        l.onerror = () => resolve(); // CSS lỗi cũng không nên treo việc render
        document.head.appendChild(l);
    });
}
let _katexPromise = null;
export function ensureKaTeXLoaded() {
    if (window.renderMathInElement) return Promise.resolve();
    if (_katexPromise) return _katexPromise;
    const base = 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist';
    _katexPromise = Promise.all([
        _loadCssOnce(base + '/katex.min.css'),
        _loadScriptOnce(base + '/katex.min.js')
            .then(() => _loadScriptOnce(base + '/contrib/auto-render.min.js'))
    ]).catch((e) => { console.error('Không tải được KaTeX:', e); });
    return _katexPromise;
}
let _mermaidPromise = null;
export function ensureMermaidLoaded() {
    if (window.mermaid) return Promise.resolve();
    if (_mermaidPromise) return _mermaidPromise;
    // Tính theo vị trí file này (features/quiz/) chứ không theo trang -> index.html ở gốc cũng đúng
    _mermaidPromise = _loadScriptOnce(new URL('../../core/libs/mermaid.min.js', import.meta.url).href)
        .catch((e) => { console.error('Không tải được Mermaid:', e); });
    return _mermaidPromise;
}

// --- Bộ nhớ đệm sơ đồ: mã -> { svg, id }. Khung chứa sơ đồ bị vẽ lại (mỗi lần có người bấm / gõ) chỉ cần dán
// lại SVG cũ (đổi id cho khỏi trùng) — không gọi mermaid lần nữa, hết nháy trắng + đỡ tốn CPU.
const _mmCache = new Map();
let _mmSecurity = 'loose';
let _mmDecorate = null;
/**
 * Trang nào cần chặt hơn (nội dung do nhiều người cùng sửa, vd. phòng đánh đề) gọi hàm này TRƯỚC sơ đồ đầu tiên.
 * @param {{securityLevel?: 'strict'|'antiscript'|'loose', decorate?: (div: Element, ok: boolean) => void}} opt
 *   decorate: gọi sau khi mỗi sơ đồ vẽ xong (ok) hoặc hỏng — để trang gắn nút phóng to / sửa mã.
 */
export function configureMermaid({ securityLevel, decorate } = {}) {
    if (securityLevel) _mmSecurity = securityLevel;
    if (decorate !== undefined) _mmDecorate = decorate;
}

/** Sửa sẵn vài lỗi cú pháp hay gặp trong mã Mermaid viết tay (nhãn tiếng Việt, dấu so sánh, ngoặc). */
export function fixMermaidCode(code) {
    return String(code || '')
        // Nhãn liên kết thiếu nháy kép (Mermaid v10 khi có tiếng Việt, khoảng trắng hoặc +, /)
        .replace(/([=-]+>|==>|-\.->|---)\s*\|([^"\n|]+)\|/g, (m, arrow, label) => `${arrow} |"${label.trim()}"|`)
        // Dấu so sánh trong nhãn (vd "K < 3.3 mEq/L") -> mã ký tự #60; / #62; (không đụng mũi tên -->, <--, ==>)
        .replace(/(?<![-=.<])<(?=\s*\d)/g, '#60;')
        .replace(/(?<![-=.>])>(?=\s*\d)/g, '#62;')
        // Nhãn node trong [...] có ( ) hoặc & -> bọc nháy kép (bỏ qua nhãn đã có nháy / shape lồng nhau)
        .replace(/\[([^\[\]"]*[()&][^\[\]"]*)\]/g, (m, label) => `["${label.trim()}"]`);
}

/** Vẽ mã Mermaid (đã sửa) thành chuỗi SVG, có bộ nhớ đệm. Sai cú pháp thì ném lỗi. */
export async function mermaidSvg(code) {
    await ensureMermaidLoaded();
    if (!window.mermaid) throw new Error('Không tải được thư viện Mermaid');
    ensureMermaidInit();
    const id = 'mmd-' + Math.random().toString(36).slice(2, 11);
    const hit = _mmCache.get(code);
    if (hit?.err) throw hit.err;
    if (hit) return { svg: hit.svg.split(hit.id).join(id), bind: null };
    try {
        const { svg, bindFunctions } = await mermaid.render(id, code);
        _mmCache.set(code, { svg, id });
        if (_mmCache.size > 80) _mmCache.delete(_mmCache.keys().next().value);
        return { svg, bind: bindFunctions };
    } catch (err) {
        // Mermaid 10 để lại khung tạm (#d<id>) và hình "quả bom" báo lỗi ngay trong <body> -> dọn
        document.getElementById('d' + id)?.remove();
        const stray = document.getElementById(id);
        if (stray && !stray.closest('.mermaid')) stray.remove();
        _mmCache.set(code, { err });
        throw err;
    }
}

// Công thức: chỉ thoát < > (không thì "$a<b$" bị hiểu là thẻ <b>). GIỮ & — nội dung phòng lưu dạng HTML
// đã thoát sẵn ("a&lt;b") và LaTeX dùng & cho ma trận; thoát & nữa là ra chữ "&lt;" trên màn.
const _escMath = (s) => String(s ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const _escHtml = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** Thẻ báo lỗi dễ đọc thay cho hình "quả bom" của Mermaid (màu phẳng, tự chứa style — dùng được ở mọi trang). */
function _mermaidErrorHtml(code, err) {
    const line = /line (\d+)/i.exec(String(err?.message || err || ''))?.[1];
    return `<div class="mm-err" style="text-align:left;padding:.7rem .9rem;border-radius:.85rem;background:#FFF6EA;border:1.5px dashed #E8B27A;color:#7A4B12;font-size:.85rem;line-height:1.45;width:100%;box-sizing:border-box">`
        + `<b>⚠ Sơ đồ chưa vẽ được</b> — mã Mermaid sai cú pháp${line ? ` ở dòng ${line}` : ''}.`
        + `<pre style="margin:.5rem 0 0;white-space:pre-wrap;word-break:break-word;font-size:.74rem;opacity:.85;max-height:10rem;overflow:auto">${_escHtml(code)}</pre></div>`;
}

function _paintMermaidError(div, code, err) {
    div.innerHTML = _mermaidErrorHtml(code, err);
    div.style.width = '100%';
    const box = div.closest('.mermaid-container');
    if (box) box.style.justifyContent = 'flex-start';
}

// Bề rộng gốc của sơ đồ (viewBox) -> biến CSS --mm-w trên khung: trang dùng để "thu vừa khung nhưng
// không phóng to quá cỡ gốc" (style.css ép svg width:100% !important nên max-width nội tuyến của Mermaid vô hiệu).
function _noteNaturalWidth(div) {
    const w = div.querySelector('svg')?.viewBox?.baseVal?.width;
    if (w) div.style.setProperty('--mm-w', Math.ceil(w) + 'px');
}

export async function renderMermaid(element) {
    if (!element) return;
    // Chỉ nạp Mermaid khi vùng này thật sự có sơ đồ
    if (!element.querySelector('.mermaid, .mermaid-viewer')) return;
    await ensureMermaidLoaded();
    if (!window.mermaid) return;

    ensureMermaidInit();

    // Chuyển các thẻ mermaid-viewer (còn ở dạng dữ liệu) thành thẻ .mermaid sẵn sàng render.
    // GIỮ data-code (mã gốc) trên thẻ: trang sửa tại chỗ cần nó để đổi sơ đồ đã vẽ ngược về mã khi lưu.
    element.querySelectorAll('.mermaid-viewer').forEach(div => {
        const encodedCode = div.getAttribute('data-code');
        if (!encodedCode) return;
        try {
            // Gán text thuần để bảo vệ các ký tự đặc biệt như <, >, & không bị trình duyệt parse nhầm
            div.textContent = fixMermaidCode(decodeURIComponent(encodedCode));
            div.classList.remove('mermaid-viewer');
            div.classList.add('mermaid');
        } catch (e) {
            console.error("Lỗi giải mã code Mermaid:", e);
        }
    });

    // Chỉ lấy các node CHƯA render (đánh dấu node đã xong bằng data-processed)
    const mermaidDivs = Array.from(element.querySelectorAll('.mermaid'))
        .filter(div => div.getAttribute('data-processed') !== 'true');
    if (mermaidDivs.length === 0) return mermaidRenderQueue;
    mermaidDivs.forEach(div => { if (!div.hasAttribute('data-code')) div.setAttribute('data-code', encodeURIComponent((div.textContent || '').trim())); });

    // Sơ đồ đã từng vẽ (có trong bộ nhớ đệm): dán ngay, không đợi hàng đợi / font -> không nháy
    const pending = [];
    for (const div of mermaidDivs) {
        const code = (div.textContent || '').trim();
        const hit = code && _mmCache.get(code);
        if (!hit) { pending.push(div); continue; }
        if (hit.err) _paintMermaidError(div, code, hit.err);
        else div.innerHTML = hit.svg.split(hit.id).join('mmd-' + Math.random().toString(36).slice(2, 11));
        _noteNaturalWidth(div);
        div.setAttribute('data-processed', 'true');
        try { _mmDecorate?.(div, !hit.err); } catch (e) {}
    }
    if (!pending.length) return mermaidRenderQueue;

    // Nối vào hàng đợi: render tuần tự, không để các lần gọi chạy đè lên nhau
    mermaidRenderQueue = mermaidRenderQueue.then(async () => {
        // QUAN TRỌNG: chờ font Quicksand tải xong rồi mới vẽ. Mermaid đo kích thước chữ theo font,
        // nếu font chưa sẵn sàng (lần đầu vào trang, chưa cache) thì sơ đồ sẽ vẽ sai/trống.
        if (document.fonts) {
            try { await document.fonts.load('1em Quicksand'); } catch (e) { /* trình duyệt không hỗ trợ load() */ }
            try { await document.fonts.ready; } catch (e) { /* bỏ qua */ }
        }
        for (const div of pending) {
            // Có thể node đã bị render bởi lần gọi trước khi tới lượt -> bỏ qua
            if (div.getAttribute('data-processed') === 'true') continue;
            const code = (div.textContent || '').trim();
            if (!code) continue;
            try {
                // mermaid.render(): tự dựng SVG trong vùng tạm rồi gắn vào — không phụ thuộc phần tử có
                // đang hiển thị hay không (sơ đồ nằm trong vùng đang ẩn vẫn vẽ đúng).
                const { svg, bind } = await mermaidSvg(code);
                div.innerHTML = svg;
                if (typeof bind === 'function') bind(div);
                _noteNaturalWidth(div);
                div.setAttribute('data-processed', 'true');
                try { _mmDecorate?.(div, true); } catch (e) {}
            } catch (err) {
                // Một sơ đồ lỗi cú pháp không được làm hỏng cả trang -> thẻ báo lỗi kèm mã để sửa
                console.warn("Sơ đồ Mermaid sai cú pháp:", String(err?.message || err).split('\n')[0], '\n' + code);
                _paintMermaidError(div, code, err);
                div.setAttribute('data-processed', 'true');
                try { _mmDecorate?.(div, false); } catch (e) {}
            }
        }
    });

    return mermaidRenderQueue;
}

// $$…$$ / \[…\] nằm GIỮA câu (cùng một dòng với chữ) -> hạ xuống inline, kẻo KaTeX dựng khối display
// chiếm nguyên dòng làm câu đứt làm 3. Chạy trên DOM nên phủ cả nội dung HTML đã lưu (sửa tay trong phòng),
// không chỉ đường Markdown. Công thức đứng riêng một dòng / một đoạn thì giữ nguyên là khối display.
function _inlineMidLineMath(root) {
    const BREAK = /^(BR|DIV|P|UL|OL|LI|TABLE|TR|H[1-6]|HR|PRE|BLOCKQUOTE|ARTICLE|SECTION)$/;
    const re = /\$\$([^\n$]{1,80}?)\$\$|\\\[([^\n]{1,80}?)\\\]/g;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const sib = (t, dir) => {
        let s = '';
        for (let n = t[dir]; n && !(n.nodeType === 1 && BREAK.test(n.nodeName)); n = n[dir]) s += n.textContent;
        return s;
    };
    for (const t of nodes) {
        const v = t.nodeValue;
        if (!/\$\$|\\\[/.test(v)) continue;
        const out = v.replace(re, (m, a, b, off) => {
            const ls = v.lastIndexOf('\n', off - 1) + 1;
            let le = v.indexOf('\n', off + m.length);
            if (le < 0) le = v.length;
            const line = (ls === 0 ? sib(t, 'previousSibling') : '') + v.slice(ls, off)
                + v.slice(off + m.length, le) + (le === v.length ? sib(t, 'nextSibling') : '');
            if (!line.replace(re, '').trim()) return m;
            return a !== undefined ? `$${a.trim()}$` : `\\(${b.trim()}\\)`;
        });
        if (out !== v) t.nodeValue = out;
    }
}

function _runKaTeX(element) {
    if (!window.renderMathInElement) return;
    try {
        _inlineMidLineMath(element);
        window.renderMathInElement(element, {
            delimiters: [
                {left: "$$", right: "$$", display: true},
                {left: "$", right: "$", display: false},
                {left: "\\(", right: "\\)", display: false},
                {left: "\\[", right: "\\]", display: true}
            ],
            throwOnError: false
        });
    } catch (err) {
        console.error("Lỗi render công thức KaTeX:", err);
    }
}

export function renderMath(element) {
    if (!element) return;
    // Chỉ tải KaTeX khi vùng này có dấu hiệu công thức ($, \( hoặc \[)
    if (/\$|\\\(|\\\[/.test(element.textContent || '')) {
        ensureKaTeXLoaded().then(() => _runKaTeX(element));
    }
    // Sơ đồ Mermaid: renderMermaid tự nạp thư viện khi cần
    renderMermaid(element);
}

// canvas-confetti nạp lười (không còn thẻ <script defer> trong quiz.html): tải lúc rảnh sau khi trang
// mở xong, hoặc ngay lần bắn đầu tiên nếu chưa kịp.
let _confettiLoad = null;
function loadConfetti() {
    if (typeof confetti === 'function') return Promise.resolve();
    return _confettiLoad || (_confettiLoad = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js';
        s.async = true;
        s.onload = resolve;
        s.onerror = () => { _confettiLoad = null; reject(); };
        document.head.appendChild(s);
    }));
}
if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
        const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
        idle(() => loadConfetti().catch(() => {}));
    }, { once: true });
}

export function triggerConfetti() {
    loadConfetti().then(() => confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.8 }
    })).catch(() => {});
}

export function parseInlineMarkdown(text) {
    if (text === null || text === undefined) return '';
    if (typeof text === 'object') {
        text = text.text || text.content || JSON.stringify(text);
    } else if (typeof text !== 'string') {
        text = String(text);
    }
    if (!text) return '';
    let html = text;
    // Thẻ ảnh / link dựng xong được CẤT vào chỗ giữ tạm: URL hay có dấu _ (ảnh Wikimedia "Some_file_name.jpg")
    // mà để luật in nghiêng _…_ / in đậm __…__ chạy qua là hỏng đường dẫn. Gắn lại ở cuối hàm.
    const kept = [];
    const keep = (h) => `\u0001${kept.push(h) - 1}\u0001`;
    
    // Parse Markdown Image: ![alt](src)
    html = html.replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, src) => {
        let finalSrc = src;
        // Nếu là ảnh local trong thư mục uploads, tự động sửa đường dẫn cho trang quiz
        if (src.startsWith('uploads/') || src.startsWith('/uploads/')) {
            const cleanSrc = src.startsWith('/') ? src.substring(1) : src;
            if (typeof window !== 'undefined' && window.location.pathname.includes('/features/quiz/')) {
                finalSrc = `../../${cleanSrc}`;
            } else {
                finalSrc = cleanSrc;
            }
        }
        // Chỉ nhận https / http / ảnh nhúng data:image / đường dẫn nội bộ; thoát dấu nháy — ảnh chèn tự động
        // (skill tìm ảnh) hay dán tay đều không nhét được thuộc tính lạ / javascript: vào thẻ
        finalSrc = String(finalSrc).trim();
        if (!/^(https?:\/\/|data:image\/|\.{0,2}\/|[\w-]+\/)/i.test(finalSrc) || /^javascript:/i.test(finalSrc)) return _escHtml(match);
        return keep(`<img src="${_escHtml(finalSrc)}" alt="${_escHtml(alt)}" loading="lazy" decoding="async" class="quiz-image max-w-full h-auto my-4 rounded-xl shadow-md border border-pink-100/30 mx-auto block" />`);
    });

    // Link: [chữ](https://…) — dòng ghi nguồn ảnh (Wikimedia Commons…), tài liệu tham khảo. Chỉ http/https, mở tab mới.
    html = html.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, label, url) =>
        keep(`<a href="${_escHtml(url)}" target="_blank" rel="noopener noreferrer" class="quiz-link">${_escHtml(label)}</a>`));

    // Bold: **text** hoặc __text__ (in đậm nét dày hơn, phối màu hồng tím mận nổi bật)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="obsidian-bold">$1</strong>');
    html = html.replace(/__(.*?)__/g, '<strong class="obsidian-bold">$1</strong>');
    
    // Italic: *text* hoặc _text_ (in nghiêng màu xanh mint nổi bật đặc biệt)
    html = html.replace(/\*(.*?)\*/g, '<em class="obsidian-italic">$1</em>');
    html = html.replace(/_(.*?)_/g, '<em class="obsidian-italic">$1</em>');
    
    // Code inline: `text` (đoạn mã cao hơn, co giãn cỡ chữ theo dòng [0.9em] và căn giữa dòng)
    html = html.replace(/`(.*?)`/g, '<code class="bg-gray-100 text-pink-600 px-1.5 py-0.5 rounded font-mono text-[0.9em] align-middle inline-block">$1</code>');
    return html.replace(/\u0001(\d+)\u0001/g, (m, k) => kept[k] ?? '');
}

// Lột bỏ nhãn "A." / "B)" … dính đầu mỗi phương án khi nhập liệu. Vì app tự gán chữ cái
// theo VỊ TRÍ (và còn xáo trộn đáp án) nên nhãn cũ vừa thừa vừa lệch, lại bị parseMarkdown
// hiểu nhầm là mục danh sách chữ. Chỉ lột khi đa số phương án đều có nhãn (>=2 và quá nửa)
// để không cắt nhầm một đáp án tình cờ bắt đầu bằng "X.". Trả về MẢNG MỚI, giữ nguyên thứ tự.
export function stripOptionLabels(options) {
    if (!Array.isArray(options)) return options;
    const re = /^\s*[A-Za-z][.)]\s+/;
    const labeled = options.filter(o => typeof o === 'string' && re.test(o)).length;
    if (labeled < 2 || labeled < Math.ceil(options.length / 2)) return options;
    return options.map(o => (typeof o === 'string' ? o.replace(re, '') : o));
}

/**
 * Hình SVG vẽ bằng mã -> khung hình: hiện qua <img src="data:image/svg+xml"> nên trình duyệt KHÔNG chạy script,
 * không bắt sự kiện, không tải tài nguyên ngoài trong SVG — an toàn cả ở phòng đánh đề (ai có link cũng sửa được).
 * data-svg giữ mã gốc (encodeURIComponent) để phòng lưu / sửa / xuất biên bản mà không mất hình.
 * Chữ trong ảnh SVG chỉ dùng font máy (không tải được Quicksand) — nên đặt font-family có sans-serif dự phòng.
 */
export const SVG_MAX = 200000;
export function svgFigureHtml(code) {
    let src = String(code || '').trim();
    if (!/^<svg[\s>]/i.test(src)) return '';
    if (src.length > SVG_MAX) return '<p class="svg-fig-err">⚠ Hình SVG quá lớn (tối đa 200 KB) — nên rút gọn hoặc đổi sang ảnh.</p>';
    // SVG làm ảnh BẮT BUỘC có xmlns, thiếu là ảnh vỡ — AI hay quên
    if (!/^<svg[^>]*\sxmlns=/i.test(src)) src = src.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    const tag = src.match(/^<svg[^>]*>/i)[0];
    const w = Number((tag.match(/\swidth=["']?(\d+(?:\.\d+)?)(?:px)?["'\s>]/i) || [])[1])
        || Number((tag.match(/viewBox=["'][-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)/i) || [])[1]) || 0;
    const title = (src.match(/<title>([^<]{1,160})<\/title>/i) || [])[1] || 'Hình vẽ';
    return `<div class="svg-fig" data-svg="${encodeURIComponent(src)}"><img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(src)}"`
        + ` alt="${_escHtml(title)}" loading="lazy" decoding="async" style="width:100%;height:auto;${w ? `max-width:${Math.round(w)}px;--svg-w:${Math.round(w)}px;` : ''}"></div>`;
}

export function parseMarkdown(text) {
    if (text === null || text === undefined) return '';
    if (typeof text === 'object') {
        text = text.text || text.content || JSON.stringify(text);
    } else if (typeof text !== 'string') {
        text = String(text);
    }
    if (!text) return '';
    
    // Chuẩn hóa xuống dòng của Windows (\r\n -> \n) để tránh lỗi cú pháp Mermaid
    let html = text.replace(/\r\n/g, '\n');
    
    const placeholders = [];
    
    // 1. Trích xuất và bảo vệ các khối mã Mermaid (```mermaid ... ```)
    html = html.replace(/```mermaid([\s\S]*?)```/g, (match, code) => {
        const placeholder = `<!--MERMAIDPLACEHOLDER${placeholders.length}-->`;
        // Encode URL an toàn để chèn vào attribute của thẻ HTML mà không sợ lỗi cú pháp
        const encodedCode = encodeURIComponent(code.trim());
        placeholders.push({
            type: 'mermaid',
            content: `<div class="mermaid-container flex justify-center my-4 overflow-x-auto w-full bg-white/50 p-4 rounded-xl border border-pink-100/30 shadow-sm"><div class="mermaid-viewer" data-code="${encodedCode}"></div></div>`
        });
        return placeholder;
    });

    // 1b. HÌNH SVG (```svg … ``` hoặc thẻ <svg>…</svg> trần): biểu đồ AI / người soạn vẽ lại (CTG, biểu đồ chuyển dạ,
    //     đường cong tăng trưởng…) -> svgFigureHtml hiện thành ẢNH, không chèn thẳng vào trang.
    html = html.replace(/```svg[ \t]*\n?([\s\S]*?)```|(<svg[\s>][\s\S]*?<\/svg>)/gi, (match, fenced, bare) => {
        const code = String(fenced || bare || '').trim();
        if (!/^<svg[\s>]/i.test(code)) return match;
        const placeholder = `<!--SVGPLACEHOLDER${placeholders.length}-->`;
        placeholders.push({ type: 'svg', content: svgFigureHtml(code) });
        return placeholder;
    });

    // 2. Trích xuất và bảo vệ các khối LaTeX $$...$$ (Display Math)
    // AI hay viết $$LR^-$$ ngay GIỮA câu: KaTeX dựng thành khối display (chiếm nguyên dòng) -> câu bị đứt làm 3.
    // Nên: công thức ngắn, một dòng, có chữ cùng dòng (trước/sau) => coi là inline; còn lại mới là khối riêng.
    html = html.replace(/\$\$([\s\S]*?)\$\$/g, (match, formula, offset, str) => {
        const ls = str.lastIndexOf('\n', offset - 1) + 1;
        let le = str.indexOf('\n', offset + match.length);
        if (le < 0) le = str.length;
        const around = (str.slice(ls, offset) + str.slice(offset + match.length, le)).replace(/<!--[A-Z]+PLACEHOLDER\d+-->/g, '').trim();
        const inline = !formula.includes('\n') && formula.length <= 80 && around.length > 0;
        const placeholder = `<!--${inline ? 'MATHINLINE' : 'MATHBLOCK'}PLACEHOLDER${placeholders.length}-->`;
        placeholders.push({
            type: inline ? 'math_inline' : 'math_block',
            content: inline ? `$${_escMath(formula.trim())}$` : `$$${_escMath(formula)}$$`
        });
        return placeholder;
    });

    // 3. Trích xuất và bảo vệ các khối LaTeX $...$ (Inline Math)
    html = html.replace(/\$([^\$\s\n](?:[^\$\n]*?[^\$\s\n])?)\$/g, (match, formula) => {
        const placeholder = `<!--MATHINLINEPLACEHOLDER${placeholders.length}-->`;
        placeholders.push({
            type: 'math_inline',
            content: `$${_escMath(formula)}$`
        });
        return placeholder;
    });

    // 3b. Công thức inline bị tách khỏi câu bằng dấu xuống dòng lẻ ("…Ratio -\n$LR^-$\n) cực…") mà parse từng dòng
    // sẽ chèn khoảng trắng cả đoạn giữa chúng. Nối lại khi câu rõ ràng chưa hết: dòng trước không kết thúc bằng
    // . : ; ? ! và dòng sau không phải mục danh sách / bảng / thụt lề.
    const MI = '<!--MATHINLINEPLACEHOLDER\\d+-->';
    const NOT_BLOCK = '(?![-*+]\\s|\\d+\\.\\s|[a-zA-Z]\\.\\s|\\||\\s{2})';
    html = html.replace(new RegExp(`([^\\s.:;?!>])[ \\t]*\\n[ \\t]*(${MI})`, 'g'), '$1 $2')
               .replace(new RegExp(`(${MI})[ \\t]*\\n[ \\t]*(?=[a-zà-ỹ),;.\\]])${NOT_BLOCK}`, 'g'), '$1 ');

    // 4. Phân tách các dòng để xử lý bảng, danh sách phân cấp và Markdown inline
    const lines = html.split('\n');
    let inTable = false;
    let tableHtml = '';
    let inList = false;
    let listHtml = '';
    let processedLines = [];
    
    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const trimmedLine = rawLine.trim();
        
        // Nhận diện danh sách và thụt lề
        // Danh sách không thứ tự: ví dụ "- mục", "* mục", "+ mục"
        const unorderedListMatch = rawLine.match(/^(\s*)([-*+])\s+(.*)$/);
        // Danh sách có thứ tự: ví dụ "1. mục", "1.1. mục", "a. mục"
        const orderedListMatch = rawLine.match(/^(\s*)(\d+\.(?:\d+\.)*|[a-zA-Z]\.)\s+(.*)$/);
        // Văn bản thụt lề (ít nhất 2 khoảng trắng ở đầu dòng, không bắt đầu bằng ký tự đặc biệt của list hoặc khoảng trắng)
        const indentedTextMatch = rawLine.match(/^(\s{2,})([^-*+\d\s][^\n]*)$/);
        
        const isList = unorderedListMatch || orderedListMatch || indentedTextMatch;
        const isTable = trimmedLine.startsWith('|') && trimmedLine.endsWith('|');
        
        if (isList) {
            // Đóng bảng nếu đang mở
            if (inTable) {
                inTable = false;
                tableHtml += '</tbody></table></div>';
                processedLines.push(tableHtml);
                tableHtml = '';
            }
            
            // Mở container danh sách nếu chưa mở
            if (!inList) {
                inList = true;
                listHtml = '<div class="quiz-list-container">';
            }
            
            let indentStr = '';
            let contentStr = '';
            let lineHtml = '';
            
            if (unorderedListMatch) {
                indentStr = unorderedListMatch[1];
                const bulletSymbol = unorderedListMatch[2];
                contentStr = unorderedListMatch[3];
                
                const indentLevel = Math.floor(indentStr.length / 2);
                let bulletHtml = '';

                // Chọn bullet point dựa trên độ sâu thụt lề (mỗi cấp một dạng riêng cho rõ phân cấp)
                if (indentLevel === 0) {
                    bulletHtml = '<i class="fas fa-circle text-[6px] text-[#FF69B4]"></i>';
                } else if (indentLevel === 1) {
                    bulletHtml = '<i class="far fa-circle text-[7px] text-[#FF69B4]"></i>';
                } else if (indentLevel === 2) {
                    bulletHtml = '<i class="fas fa-square text-[5px] text-pink-400"></i>';
                } else {
                    bulletHtml = '<i class="far fa-square text-[5px] text-pink-400"></i>';
                }

                lineHtml = `
                    <div class="quiz-li" data-lvl="${indentLevel}" style="--lvl:${indentLevel};">
                        <span class="quiz-li-bullet">${bulletHtml}</span>
                        <div class="quiz-li-body">${parseInlineMarkdown(contentStr)}</div>
                    </div>
                `;
            } else if (orderedListMatch) {
                indentStr = orderedListMatch[1];
                const orderPrefix = orderedListMatch[2];
                contentStr = orderedListMatch[3];
                
                const indentLevel = Math.floor(indentStr.length / 2);

                lineHtml = `
                    <div class="quiz-li" data-lvl="${indentLevel}" style="--lvl:${indentLevel};">
                        <span class="quiz-li-bullet quiz-li-num">${orderPrefix}</span>
                        <div class="quiz-li-body">${parseInlineMarkdown(contentStr)}</div>
                    </div>
                `;
            } else if (indentedTextMatch) {
                indentStr = indentedTextMatch[1];
                contentStr = indentedTextMatch[2];
                
                const indentLevel = Math.floor(indentStr.length / 2);

                // Dòng bổ trợ (xuống dòng trong cùng một cấp): canh thẳng hàng với phần chữ của mục cha
                lineHtml = `
                    <div class="quiz-li quiz-li-continued" data-lvl="${indentLevel}" style="--lvl:${indentLevel};">
                        <div class="quiz-li-cont">${parseInlineMarkdown(contentStr)}</div>
                    </div>
                `;
            }
            
            listHtml += lineHtml;
        } else if (isTable) {
            // Đóng danh sách nếu đang mở
            if (inList) {
                inList = false;
                listHtml += '</div>';
                processedLines.push(listHtml);
                listHtml = '';
            }
            
            const cells = trimmedLine.split('|').map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
            
            if (!inTable) {
                inTable = true;
                tableHtml = '<div class="table-responsive my-4"><table class="cute-table w-full border-collapse rounded-xl overflow-hidden shadow-sm border border-pink-100 bg-white">';
                tableHtml += '<thead><tr class="bg-pink-100/70 text-pink-800 font-bold border-b border-pink-200">';
                cells.forEach(cell => {
                    tableHtml += `<th class="p-3 text-left text-sm md:text-base font-bold">${parseInlineMarkdown(cell)}</th>`;
                });
                tableHtml += '</tr></thead><tbody>';
            } else {
                const isSeparator = cells.every(cell => cell.replace(/:/g, '').split('').every(char => char === '-'));
                if (isSeparator) {
                    continue;
                }
                
                tableHtml += '<tr class="border-b border-pink-50 hover:bg-pink-50/30 transition-colors text-gray-700">';
                cells.forEach(cell => {
                    tableHtml += `<td class="p-3 text-sm md:text-base">${parseInlineMarkdown(cell)}</td>`;
                });
                tableHtml += '</tr>';
            }
        } else {
            // Dòng bình thường (không list, không table)
            // Đóng các khối đang mở
            if (inList) {
                inList = false;
                listHtml += '</div>';
                processedLines.push(listHtml);
                listHtml = '';
            }
            if (inTable) {
                inTable = false;
                tableHtml += '</tbody></table></div>';
                processedLines.push(tableHtml);
                tableHtml = '';
            }
            
            processedLines.push(parseInlineMarkdown(rawLine));
        }
    }
    
    // Đóng các khối còn sót sau khi duyệt hết các dòng
    if (inList) {
        listHtml += '</div>';
        processedLines.push(listHtml);
    }
    if (inTable) {
        tableHtml += '</tbody></table></div>';
        processedLines.push(tableHtml);
    }
    
    html = processedLines.join('<div class="quiz-md-gap"></div>');
    
    // 5. Khôi phục lại các khối đã bảo vệ bằng cách thay thế an toàn (dùng callback để tránh lỗi ký tự $)
    for (let i = placeholders.length - 1; i >= 0; i--) {
        const placeholderPattern = new RegExp(`<!--(?:MERMAID|SVG|MATHBLOCK|MATHINLINE)PLACEHOLDER${i}-->`, 'g');
        html = html.replace(placeholderPattern, () => placeholders[i].content);
    }
    return html;
}

export function formatTime(seconds) {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
}

export function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}

/* ----------------------------------------------------------------
   Đáp án đúng: hỗ trợ CẢ hai kiểu câu hỏi
   - 1 đáp án đúng  -> correctAnswerIndex (số)
   - nhiều đáp án đúng -> correctAnswerIndexes (mảng số), chỉ có khi được điền
   Câu chưa điền correctAnswerIndexes vẫn chạy y như cũ.
   ---------------------------------------------------------------- */
export function isMultiAnswer(q) {
    return !!(q && Array.isArray(q.correctAnswerIndexes) && q.correctAnswerIndexes.length > 0);
}
// Mảng index đúng đã sắp xếp (dùng chung cho tô màu, chấm điểm, hiển thị kết quả).
export function getCorrectIndexes(q) {
    if (!q) return [];
    if (Array.isArray(q.correctAnswerIndexes) && q.correctAnswerIndexes.length > 0) {
        return q.correctAnswerIndexes.slice().sort((a, b) => a - b);
    }
    if (typeof q.correctAnswerIndex === 'number' && q.correctAnswerIndex >= 0) {
        return [q.correctAnswerIndex];
    }
    return [];
}
// Trả lời của người dùng đúng không? userAnswer là số (1 đáp án) hoặc mảng (nhiều đáp án).
export function isAnswerCorrect(q, userAnswer) {
    if (userAnswer === null || userAnswer === undefined) return false;
    if (isEssay(q)) return isEssayPassed(q, userAnswer);
    const correct = getCorrectIndexes(q);
    if (correct.length === 0) return false;
    if (Array.isArray(userAnswer)) {
        const u = userAnswer.slice().sort((a, b) => a - b);
        return u.length === correct.length && u.every((v, i) => v === correct[i]);
    }
    return correct.length === 1 && userAnswer === correct[0];
}
// Điểm của MỘT câu (0..1): trắc nghiệm 0/1, tự luận theo tỉ lệ ý đã tick. Tổng điểm bài = tổng các câu.
export function answerCredit(q, userAnswer) {
    if (isEssay(q)) return essayCredit(q, userAnswer);
    return isAnswerCorrect(q, userAnswer) ? 1 : 0;
}
// Điểm cả bài theo trọng số câu (maxScore, mặc định 1): { score, max, pct }.
// Không câu nào có maxScore thì score = số câu đúng như trước.
export function sessionScore(questions, answers) {
    let score = 0, max = 0;
    (questions || []).forEach((q, i) => {
        const w = questionWeight(q);
        max += w;
        score += answerCredit(q, answers[i]) * w;
    });
    score = Math.round(score * 100) / 100;
    return { score, max, pct: max > 0 ? (score / max) * 100 : 0 };
}

/**
 * Áp dụng một thứ tự đáp án cố định (order) lên câu hỏi:
 * - Đảo vị trí các lựa chọn theo mảng chỉ số `order`
 * - Cập nhật lại correctAnswerIndex, correctAnswerIndexes, optionExplanations
 * - Gắn `__optOrder` để có thể tái tạo hoặc lưu dạng blueprint siêu nhẹ
 */
export function applyOptionOrder(question, order) {
    if (!Array.isArray(order) || order.length <= 1) {
        return { ...question };
    }
    const answerOptions = question.answers || question.options;
    if (!Array.isArray(answerOptions) || answerOptions.length <= 1) {
        return { ...question };
    }

    const shuffled = { ...question, __optOrder: order };
    const newOptions = order.map(i => answerOptions[i]);

    if (Array.isArray(question.answers)) shuffled.answers = newOptions;
    if (Array.isArray(question.options)) shuffled.options = newOptions;
    if (!Array.isArray(question.answers) && !Array.isArray(question.options)) {
        shuffled.options = newOptions;
    }

    if (typeof question.correctAnswerIndex === 'number' && question.correctAnswerIndex >= 0) {
        shuffled.correctAnswerIndex = order.indexOf(question.correctAnswerIndex);
    }
    if (Array.isArray(question.correctAnswerIndexes) && question.correctAnswerIndexes.length > 0) {
        shuffled.correctAnswerIndexes = question.correctAnswerIndexes
            .map(ci => order.indexOf(ci)).filter(x => x >= 0).sort((a, b) => a - b);
    }
    if (Array.isArray(question.optionExplanations)) {
        shuffled.optionExplanations = order.map(i => question.optionExplanations[i]);
    }

    return shuffled;
}

/**
 * Tái tạo lại danh sách câu hỏi phiên làm bài từ câu hỏi gốc và blueprint nhẹ (origIdx + optOrder).
 * Không cần lưu lại toàn bộ chuỗi đề/giải thích/ảnh cồng kềnh, tránh vượt quota localStorage và Firestore.
 */
export function reconstructQuestionsFromBlueprint(originalQuestions, blueprint) {
    if (!Array.isArray(originalQuestions) || !originalQuestions.length) return [];
    if (!Array.isArray(blueprint) || !blueprint.length) {
        return originalQuestions.map((q, i) => ({ ...q, __origIdx: i }));
    }
    return blueprint.map((item, idx) => {
        const origIdx = (typeof item.origIdx === 'number' && item.origIdx >= 0 && item.origIdx < originalQuestions.length)
            ? item.origIdx
            : (idx < originalQuestions.length ? idx : 0);
        const baseQ = originalQuestions[origIdx];
        if (!baseQ) return null;
        let q = { ...baseQ, __origIdx: origIdx };
        if (item.caseId) q.caseId = item.caseId;
        if (Array.isArray(item.optOrder)) {
            q = applyOptionOrder(q, item.optOrder);
        }
        return q;
    }).filter(Boolean);
}

/**
 * Trộn thứ tự đáp án của MỘT câu hỏi một cách an toàn:
 * - Đảo vị trí các lựa chọn (answers/options)
 * - Cập nhật lại correctAnswerIndex theo vị trí mới
 * - Cập nhật lại optionExplanations (giải thích từng đáp án) theo vị trí mới
 * Trả về một object câu hỏi MỚI, không làm thay đổi dữ liệu gốc.
 */
export function shuffleQuestionOptions(question) {
    const answerOptions = question.answers || question.options;
    // Không trộn nếu dữ liệu không hợp lệ hoặc chỉ có 0-1 đáp án
    if (!Array.isArray(answerOptions) || answerOptions.length <= 1) {
        return { ...question };
    }

    // Tạo mảng vị trí gốc rồi xáo trộn (Fisher–Yates)
    const order = answerOptions.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
    }

    return applyOptionOrder(question, order);
}

export function convertScoreToGPA(correct, total) {
    if (isNaN(correct) || isNaN(total) || total <= 0 || correct < 0 || correct > total) {
        return {
            score10: 0,
            score4: 0,
            letterGrade: 'F',
            motivation: 'Dữ liệu không hợp lệ.'
        };
    }
    const n = correct / total;
    let score10;
    if (n < 0.5) {
        score10 = (8 * correct) / total;
    } else if (n === 0.5) {
        score10 = 4.0;
    } else if (n > 0.5 && n < 0.6) {
        score10 = 4 + (10 * (correct - 0.5 * total)) / total;
    } else if (n === 0.6) {
        score10 = 5.0;
    } else { // n > 0.6
        score10 = 5 + (12.5 * (correct - 0.6 * total)) / total;
    }
    let score4, letterGrade, motivation;
    if (score10 >= 9.5) {
        score4 = 4.0;
        letterGrade = 'A+';
        motivation = "Thành tích xuất sắc! Điểm số đạt mức tối đa (A+).";
    } else if (score10 >= 8.5) {
        score4 = 4.0;
        letterGrade = 'A';
        motivation = "Kết quả rất tốt! Đạt chuẩn điểm Giỏi (A) theo thang điểm UMP.";
    } else if (score10 >= 8.0) {
        score4 = 3.5;
        letterGrade = 'B+';
        motivation = "Kết quả tốt! Đạt mức Khá Giỏi (B+), cận kề mức điểm A.";
    } else if (score10 >= 7.0) {
        score4 = 3.0;
        letterGrade = 'B';
        motivation = "Đạt chuẩn mức Khá (B). Tiếp tục duy trì phong độ.";
    } else if (score10 >= 6.5) {
        score4 = 2.5;
        letterGrade = 'C+';
        motivation = "Đạt mức Trung bình Khá (C+). Cần rà soát các câu sai để cải thiện.";
    } else if (score10 >= 5.5) {
        score4 = 2.0;
        letterGrade = 'C';
        motivation = "Đạt mức Trung bình (C). Cần củng cố thêm các phần lý thuyết trọng tâm.";
    } else if (score10 >= 5.0) {
        score4 = 1.5;
        letterGrade = 'D+';
        motivation = "Đạt mức Trung bình yếu (D+). Cần xem lại các ca lâm sàng và câu hỏi lý thuyết.";
    } else if (score10 >= 4.0) {
        score4 = 1.0;
        letterGrade = 'D';
        motivation = "Đạt mức đạt chuẩn tối thiểu (D). Cần tập trung ôn luyện kỹ càng hơn.";
    } else {
        score4 = 0.0;
        letterGrade = 'F';
        motivation = "Chưa đạt yêu cầu qua môn (F). Cần rà soát lại toàn bộ kiến thức nền tảng.";
    }
    return {
        score10: Number(score10.toFixed(2)),
        score4: Number(score4.toFixed(1)),
        letterGrade,
        motivation
    };
}
