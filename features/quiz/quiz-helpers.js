// features/quiz/quiz-helpers.js

export function renderMermaid(element) {
    if (window.mermaid && element) {
        const mermaidDivs = element.querySelectorAll('.mermaid');
        if (mermaidDivs.length > 0) {
            try {
                if (typeof mermaid.run === 'function') {
                    mermaid.run({
                        nodes: Array.from(mermaidDivs),
                        suppressErrors: true
                    });
                } else if (typeof mermaid.init === 'function') {
                    mermaid.init(undefined, mermaidDivs);
                }
            } catch (err) {
                console.error("Lỗi render Mermaid:", err);
            }
        }
    }
}

export function renderMath(element) {
    if (window.renderMathInElement && element) {
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
    } else if (element) {
        setTimeout(() => {
            if (window.renderMathInElement) {
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
                    console.error("Lỗi render công thức KaTeX sau khi chờ:", err);
                }
            }
        }, 200);
    }
    
    // Render Mermaid diagrams
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
    let html = text;
    
    // Phân tách các dòng để xử lý bảng và Mermaid
    const lines = html.split('\n');
    let inTable = false;
    let tableHtml = '';
    let inMermaid = false;
    let mermaidCode = '';
    let processedLines = [];
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        
        // Nhận diện khối mã Mermaid
        if (line.startsWith('```mermaid')) {
            inMermaid = true;
            mermaidCode = '';
            continue;
        }
        
        if (inMermaid) {
            if (line.startsWith('```')) {
                inMermaid = false;
                processedLines.push(`<div class="mermaid-container flex justify-center my-4 overflow-x-auto w-full bg-white/50 p-4 rounded-xl border border-pink-100/30 shadow-sm"><div class="mermaid">${mermaidCode.trim()}</div></div>`);
                mermaidCode = '';
            } else {
                // Không trim dòng trong mermaid để giữ nguyên cấu trúc thụt lề
                mermaidCode += lines[i] + '\n';
            }
            continue;
        }

        if (line.startsWith('|') && line.endsWith('|')) {
            // Tách các ô trong hàng, lọc bỏ cột trống ở 2 đầu
            const cells = line.split('|').map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
            
            if (!inTable) {
                inTable = true;
                tableHtml = '<div class="table-responsive my-4"><table class="cute-table w-full border-collapse rounded-xl overflow-hidden shadow-sm border border-pink-100 bg-white">';
                tableHtml += '<thead><tr class="bg-pink-100/70 text-pink-800 font-bold border-b border-pink-200">';
                cells.forEach(cell => {
                    tableHtml += `<th class="p-3 text-left text-sm md:text-base font-bold">${parseInlineMarkdown(cell)}</th>`;
                });
                tableHtml += '</tr></thead><tbody>';
            } else {
                // Kiểm tra xem có phải dòng gạch ngang phân cách header (| --- | --- |) không
                const isSeparator = cells.every(cell => cell.replace(/:/g, '').split('').every(char => char === '-'));
                if (isSeparator) {
                    continue; // Bỏ qua hàng phân cách
                }
                
                tableHtml += '<tr class="border-b border-pink-50 hover:bg-pink-50/30 transition-colors text-gray-700">';
                cells.forEach(cell => {
                    tableHtml += `<td class="p-3 text-sm md:text-base">${parseInlineMarkdown(cell)}</td>`;
                });
                tableHtml += '</tr>';
            }
        } else {
            if (inTable) {
                inTable = false;
                tableHtml += '</tbody></table></div>';
                processedLines.push(tableHtml);
                tableHtml = '';
            }
            // Dòng thường thì xử lý các tag inline
            processedLines.push(parseInlineMarkdown(lines[i]));
        }
    }
    
    if (inTable) {
        tableHtml += '</tbody></table></div>';
        processedLines.push(tableHtml);
    }
    
    if (inMermaid) {
        // Đóng block Mermaid nếu quên đóng dấu ``` ở cuối
        processedLines.push(`<div class="mermaid-container flex justify-center my-4 overflow-x-auto w-full bg-white/50 p-4 rounded-xl border border-pink-100/30 shadow-sm"><div class="mermaid">${mermaidCode.trim()}</div></div>`);
    }
    
    // Ghép các dòng lại và chuyển đổi dòng thường thành xuống dòng <br>
    html = processedLines.join('<br>');
    
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
