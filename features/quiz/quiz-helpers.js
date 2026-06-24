// features/quiz/quiz-helpers.js

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
            securityLevel: 'loose', // Cho phép nhãn HTML / ký tự đặc biệt (tiếng Việt) không bị chặn
            flowchart: { useMaxWidth: true, htmlLabels: true },
            themeVariables: {
                fontSize: '16px',
                fontFamily: 'Quicksand, sans-serif',

                // Node tiến trình (Hình chữ nhật) màu hồng anh đào ngọt ngào
                primaryColor: '#FFEbee',
                primaryTextColor: '#c62828',
                primaryBorderColor: '#FFcdd2',

                // Node quyết định (Hình thoi/Decision) màu xanh ngọc mint để cực kỳ dễ phân biệt
                tertiaryColor: '#E0f2f1',
                tertiaryTextColor: '#004d40',
                tertiaryBorderColor: '#b2dfdb',

                // Node kết quả (hoặc trạng thái khác) màu tím Lavender thanh lịch
                secondaryColor: '#F3e5f5',
                secondaryTextColor: '#4a148c',
                secondaryBorderColor: '#e1bee7',

                // Đường nối và mũi tên màu hồng sen nổi bật
                lineColor: '#FF69B4',
                arrowheadColor: '#FF69B4',

                // Nhãn chữ trên đường nối nền trắng chữ đen rõ nét
                edgeLabelBackground: '#ffffff',
                textColor: '#333333'
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
    // Đường dẫn tương đối tính theo trang HTML (features/quiz/*.html) -> core/libs
    _mermaidPromise = _loadScriptOnce('../../core/libs/mermaid.min.js')
        .catch((e) => { console.error('Không tải được Mermaid:', e); });
    return _mermaidPromise;
}

export async function renderMermaid(element) {
    if (!element) return;
    // Chỉ nạp Mermaid khi vùng này thật sự có sơ đồ
    if (!element.querySelector('.mermaid, .mermaid-viewer')) return;
    await ensureMermaidLoaded();
    if (!window.mermaid) return;

    ensureMermaidInit();

    // Chuyển các thẻ mermaid-viewer (còn ở dạng dữ liệu) thành thẻ .mermaid sẵn sàng render
    const viewerDivs = element.querySelectorAll('.mermaid-viewer');
    viewerDivs.forEach(div => {
        const encodedCode = div.getAttribute('data-code');
        if (!encodedCode) return;
        try {
            let decodedCode = decodeURIComponent(encodedCode);

            // Tự động sửa lỗi nhãn liên kết thiếu nháy kép trong Mermaid v10 (khi có tiếng Việt, khoảng trắng hoặc ký tự đặc biệt +, /)
            decodedCode = decodedCode.replace(/([=-]+>|==>|-\.->|---)\s*\|([^"\n|]+)\|/g, (match, arrow, label) => {
                return `${arrow} |"${label.trim()}"|`;
            });

            // Tự động đổi dấu so sánh < / > trong nhãn (vd "K < 3.3 mEq/L") thành mã ký tự an toàn
            // của Mermaid (#60; / #62;) để không bị hiểu nhầm là mũi tên hay thẻ HTML -> tránh "Syntax error".
            // Chỉ áp dụng khi đứng cạnh chữ số, nên KHÔNG đụng tới mũi tên -->, <--, ==>, -.->
            decodedCode = decodedCode
                .replace(/(?<![-=.<])<(?=\s*\d)/g, '#60;')   // "< 3.3" -> "#60; 3.3"
                .replace(/(?<![-=.>])>(?=\s*\d)/g, '#62;');  // "> 5.3" -> "#62; 5.3"

            // Tự động bọc nháy kép cho nhãn node trong [...] khi chứa ký tự đặc biệt ( ) hoặc &
            // (vd "[ACE (Men chuyển)]", "[Co mạch & Tiết Aldosterone]") -> "[\"...\"]" để Mermaid không báo lỗi cú pháp.
            // Bỏ qua nhãn đã có sẵn nháy kép. [^\[\]"] đảm bảo không ăn lan sang node khác / shape lồng nhau.
            decodedCode = decodedCode.replace(/\[([^\[\]"]*[()&][^\[\]"]*)\]/g, (match, label) => {
                return `["${label.trim()}"]`;
            });

            // Gán text thuần để bảo vệ các ký tự đặc biệt như <, >, & không bị trình duyệt parse nhầm
            div.textContent = decodedCode;
            div.classList.remove('mermaid-viewer');
            div.classList.add('mermaid');
        } catch (e) {
            console.error("Lỗi giải mã code Mermaid:", e);
        }
    });

    // Chỉ lấy các node CHƯA render (mermaid đánh dấu node đã xong bằng data-processed)
    const mermaidDivs = Array.from(element.querySelectorAll('.mermaid'))
        .filter(div => div.getAttribute('data-processed') !== 'true');

    if (mermaidDivs.length === 0) return mermaidRenderQueue;

    // Nối vào hàng đợi: render tuần tự, không để các lần gọi chạy đè lên nhau
    mermaidRenderQueue = mermaidRenderQueue.then(async () => {
        // QUAN TRỌNG: chờ font Quicksand tải xong rồi mới vẽ. Mermaid đo kích thước chữ theo font,
        // nếu font chưa sẵn sàng (lần đầu vào trang, chưa cache) thì sơ đồ sẽ vẽ sai/trống.
        // Đây là lý do trước đây phải F5 mới hiện (lần 2 font đã có trong cache).
        if (document.fonts) {
            try {
                await document.fonts.load('1em Quicksand');
            } catch (e) { /* bỏ qua nếu trình duyệt không hỗ trợ load() */ }
            try {
                await document.fonts.ready;
            } catch (e) { /* bỏ qua */ }
        }

        for (const div of mermaidDivs) {
            // Có thể node đã bị render bởi lần gọi trước khi tới lượt -> bỏ qua
            if (div.getAttribute('data-processed') === 'true') continue;
            const code = (div.textContent || '').trim();
            if (!code) continue;
            try {
                // Ưu tiên mermaid.render(): tự dựng SVG trong vùng tạm rồi gắn vào.
                // KHÔNG phụ thuộc phần tử có đang hiển thị / có layout hay không
                // -> khắc phục việc sơ đồ trống ở lần đầu (phải F5 mới hiện) khi nó nằm
                // trong vùng đang ẩn (giải thích, mở rộng kiến thức...).
                if (typeof mermaid.render === 'function') {
                    const renderId = 'mmd-' + Math.random().toString(36).slice(2, 11);
                    const { svg, bindFunctions } = await mermaid.render(renderId, code);
                    div.innerHTML = svg;
                    if (typeof bindFunctions === 'function') bindFunctions(div);
                    div.setAttribute('data-processed', 'true');
                } else if (typeof mermaid.run === 'function') {
                    await mermaid.run({ nodes: [div], suppressErrors: false });
                } else if (typeof mermaid.init === 'function') {
                    mermaid.init(undefined, div);
                }
            } catch (err) {
                // Một sơ đồ lỗi cú pháp không được làm hỏng cả trang -> log code để dễ debug
                console.error("Lỗi render Mermaid (code bên dưới):", err);
                console.error(code);
            }
        }
    });

    return mermaidRenderQueue;
}

function _runKaTeX(element) {
    if (!window.renderMathInElement) return;
    try {
        window.renderMathInElement(element, {
            delimiters: [
                {left: "$$", right: "$$", display: true},
                {left: "$", right: "$", display: false},
                {left: "\\(", right: "\\)", display: false},
                {left: "\\[", right: "\\[", display: true}
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

export function triggerConfetti() {
    if (typeof confetti === 'function') {
        confetti({
            particleCount: 80,
            spread: 60,
            origin: { y: 0.8 }
        });
    }
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
    
    // Parse Markdown Image: ![alt](src)
    html = html.replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, src) => {
        let finalSrc = src;
        // Nếu là ảnh local trong thư mục uploads, tự động sửa đường dẫn cho trang quiz
        if (src.startsWith('uploads/') || src.startsWith('/uploads/')) {
            const cleanSrc = src.startsWith('/') ? src.substring(1) : src;
            if (window.location.pathname.includes('/features/quiz/')) {
                finalSrc = `../../${cleanSrc}`;
            } else {
                finalSrc = cleanSrc;
            }
        }
        return `<img src="${finalSrc}" alt="${alt}" class="quiz-image max-w-full h-auto my-4 rounded-xl shadow-md border border-pink-100/30 mx-auto block" />`;
    });

    // Bold: **text** hoặc __text__ (in đậm nét dày hơn, phối màu hồng tím mận nổi bật)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="obsidian-bold">$1</strong>');
    html = html.replace(/__(.*?)__/g, '<strong class="obsidian-bold">$1</strong>');
    
    // Italic: *text* hoặc _text_ (in nghiêng màu xanh mint nổi bật đặc biệt)
    html = html.replace(/\*(.*?)\*/g, '<em class="obsidian-italic">$1</em>');
    html = html.replace(/_(.*?)_/g, '<em class="obsidian-italic">$1</em>');
    
    // Code inline: `text` (đoạn mã cao hơn, co giãn cỡ chữ theo dòng [0.9em] và căn giữa dòng)
    html = html.replace(/`(.*?)`/g, '<code class="bg-gray-100 text-pink-600 px-1.5 py-0.5 rounded font-mono text-[0.9em] align-middle inline-block">$1</code>');
    return html;
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

    // 2. Trích xuất và bảo vệ các khối LaTeX $$...$$ (Display Math)
    html = html.replace(/\$\$([\s\S]*?)\$\$/g, (match, formula) => {
        const placeholder = `<!--MATHBLOCKPLACEHOLDER${placeholders.length}-->`;
        placeholders.push({
            type: 'math_block',
            content: `$$${formula}$$`
        });
        return placeholder;
    });

    // 3. Trích xuất và bảo vệ các khối LaTeX $...$ (Inline Math)
    html = html.replace(/\$([^\$\s\n](?:[^\$\n]*?[^\$\s\n])?)\$/g, (match, formula) => {
        const placeholder = `<!--MATHINLINEPLACEHOLDER${placeholders.length}-->`;
        placeholders.push({
            type: 'math_inline',
            content: `$${formula}$`
        });
        return placeholder;
    });

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
        const placeholderPattern = new RegExp(`<!--(?:MERMAID|MATHBLOCK|MATHINLINE)PLACEHOLDER${i}-->`, 'g');
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

    const shuffled = { ...question };
    const newOptions = order.map(i => answerOptions[i]);

    // Đồng bộ cả hai trường nếu cùng tồn tại (editor lưu cả answers lẫn options),
    // để không sót mảng cũ chưa trộn ở bất kỳ nơi nào đọc dữ liệu.
    if (Array.isArray(question.answers)) shuffled.answers = newOptions;
    if (Array.isArray(question.options)) shuffled.options = newOptions;
    if (!Array.isArray(question.answers) && !Array.isArray(question.options)) {
        shuffled.options = newOptions;
    }

    // Remap đáp án đúng: vị trí mới của index đúng cũ
    if (typeof question.correctAnswerIndex === 'number' && question.correctAnswerIndex >= 0) {
        shuffled.correctAnswerIndex = order.indexOf(question.correctAnswerIndex);
    }

    // Remap giải thích theo từng đáp án (nếu có)
    if (Array.isArray(question.optionExplanations)) {
        shuffled.optionExplanations = order.map(i => question.optionExplanations[i]);
    }

    return shuffled;
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
        motivation = "Ối dồi ôi, trình là j mà là trình ai chấm!!! Anh chỉ biết làm ba mẹ anh tự hào, xây căn nhà thật to ở 1 mình 2 tấm";
    } else if (score10 >= 8.5) {
        score4 = 4.0;
        letterGrade = 'A';
        motivation = "Dỏi dữ dị bà, trộm vía trộm víaaaaaa, xin vía 4.0 <3";
    } else if (score10 >= 8.0) {
        score4 = 3.5;
        letterGrade = 'B+';
        motivation = "gút chóp bây bề";
    } else if (score10 >= 7.0) {
        score4 = 3.0;
        letterGrade = 'B';
        motivation = "Quaooooooo, vá là dỏi òiiiiii";
    } else if (score10 >= 6.5) {
        score4 = 2.5;
        letterGrade = 'C+';
        motivation = "Điểm này là cũng cũng ròi á mom, u so gud babi";
    } else if (score10 >= 5.5) {
        score4 = 2.0;
        letterGrade = 'C';
        motivation = "Cũn cũn ik, cố gắng lên nhennn";
    } else if (score10 >= 5.0) {
        score4 = 1.5;
        letterGrade = 'D+';
        motivation = "Vừa đủ qua. Cần xem lại kiến thức một chút.";
    } else if (score10 >= 4.0) {
        score4 = 1.0;
        letterGrade = 'D';
        motivation = "Qua môn rồi! Chúc mừng nha bàaaaa";
    } else {
        score4 = 0.0;
        letterGrade = 'F';
        motivation = "Hoi mò hoi mò, lần sau sẽ tốt hơn mà!";
    }
    return {
        score10: Number(score10.toFixed(2)),
        score4: Number(score4.toFixed(1)),
        letterGrade,
        motivation
    };
}
