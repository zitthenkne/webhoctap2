// File: core/quiz-autofix-report.js
// Hiển thị kết quả "tự chữa lỗi" sau khi người dùng tải file bộ đề lên.
// Tách khỏi core/quiz-autofix.js để file kia thuần JS (chạy được trong node:test).

import { summarizeReport } from './quiz-autofix.js';

const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const letter = (i) => (i == null || i < 0 ? '—' : String.fromCharCode(65 + i));

function ensureStyle() {
    if (document.getElementById('zt-autofix-style')) return;
    const st = document.createElement('style');
    st.id = 'zt-autofix-style';
    st.textContent = `
    .zt-af{margin:.75rem auto 0;max-width:44rem;text-align:left;border-radius:1rem;padding:.85rem 1rem;
        border:1px solid;font-size:.85rem;line-height:1.5;}
    .zt-af-success{background:#f0fdf4;border-color:#bbf7d0;color:#166534;}
    .zt-af-warning{background:#fffbeb;border-color:#fde68a;color:#92400e;}
    .zt-af-info{background:#f8fafc;border-color:#e2e8f0;color:#475569;}
    .zt-af-head{display:flex;align-items:center;gap:.5rem;font-weight:800;}
    .zt-af-lines{margin:.5rem 0 0;padding:0;list-style:none;}
    .zt-af-lines li{margin:.15rem 0;}
    .zt-af-more{margin-top:.6rem;background:none;border:none;padding:0;font:inherit;font-weight:700;
        text-decoration:underline;cursor:pointer;color:inherit;opacity:.85;}
    .zt-af-more:hover{opacity:1;}
    .zt-af-detail{margin-top:.6rem;max-height:16rem;overflow:auto;border-top:1px dashed currentColor;padding-top:.5rem;}
    .zt-af-detail h5{margin:.5rem 0 .2rem;font-weight:800;font-size:.8rem;text-transform:uppercase;letter-spacing:.03em;opacity:.8;}
    .zt-af-detail ol{margin:0;padding-left:1.2rem;}
    .zt-af-detail li{margin:.2rem 0;}
    .zt-af-q{opacity:.75;}
    .zt-af-arrow{font-weight:800;white-space:nowrap;}
    .theme-dark .zt-af-success{background:rgba(22,101,52,.18);border-color:rgba(34,197,94,.35);color:#86efac;}
    .theme-dark .zt-af-warning{background:rgba(146,64,14,.18);border-color:rgba(245,158,11,.35);color:#fcd34d;}
    .theme-dark .zt-af-info{background:rgba(148,163,184,.12);border-color:rgba(148,163,184,.3);color:#cbd5e1;}`;
    document.head.appendChild(st);
}

function detailHtml(report) {
    let html = '';
    if (report.answerFixes.length) {
        html += '<h5>Đáp án đã sửa</h5><ol>' + report.answerFixes.slice(0, 60).map(f =>
            `<li><span class="zt-af-arrow">${f.from == null ? '(trống)' : letter(f.from)} → ${letter(f.to)}</span> ` +
            `<span class="zt-af-q">dòng ${f.row} · ${esc(f.question)}</span><br><span class="zt-af-q">↳ ${esc(f.reason)}</span></li>`
        ).join('') + '</ol>';
        if (report.answerFixes.length > 60) html += `<p class="zt-af-q">…và ${report.answerFixes.length - 60} câu nữa</p>`;
    }
    if (report.suspects.length) {
        html += '<h5>Câu nên xem lại (chưa tự sửa)</h5><ol>' + report.suspects.slice(0, 40).map(f =>
            `<li><span class="zt-af-arrow">đang là ${letter(f.current)}, có thể là ${letter(f.suggested)}</span> ` +
            `<span class="zt-af-q">dòng ${f.row} · ${esc(f.question)}</span><br><span class="zt-af-q">↳ ${esc(f.reason)}</span></li>`
        ).join('') + '</ol>';
    }
    if (report.dropped.length) {
        html += '<h5>Câu bị bỏ qua</h5><ol>' + report.dropped.slice(0, 40).map(f =>
            `<li><span class="zt-af-q">dòng ${f.row} · ${esc(f.question)}</span> — ${esc(f.why)}</li>`
        ).join('') + '</ol>';
    }
    if (report.duplicates.length) {
        html += '<h5>Câu trùng đã gộp</h5><ol>' + report.duplicates.slice(0, 40).map(f =>
            `<li><span class="zt-af-q">dòng ${f.row} · ${esc(f.question)}</span> — trùng dòng ${f.sameAs}</li>`
        ).join('') + '</ol>';
    }
    return html || '<p class="zt-af-q">Không có gì để liệt kê.</p>';
}

/**
 * Vẽ khối báo cáo vào một phần tử chứa.
 * @param {HTMLElement|string} container phần tử hoặc id
 * @param {Object|null} report kết quả từ autofixQuestions()
 */
export function renderAutofixReport(container, report) {
    const el = typeof container === 'string' ? document.getElementById(container) : container;
    if (!el) return;
    if (!report) { el.innerHTML = ''; return; }
    const { headline, lines, tone } = summarizeReport(report);
    ensureStyle();

    const hasDetail = report.answerFixes.length || report.suspects.length
        || report.dropped.length || report.duplicates.length;
    const icons = { success: 'fa-wand-magic-sparkles', warning: 'fa-triangle-exclamation', info: 'fa-circle-check' };

    el.innerHTML = `
    <div class="zt-af zt-af-${tone}">
        <div class="zt-af-head"><i class="fas ${icons[tone]}"></i><span>${esc(headline)}</span></div>
        ${lines.length ? `<ul class="zt-af-lines">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
        ${hasDetail ? `<button type="button" class="zt-af-more" aria-expanded="false">Xem chi tiết</button>
        <div class="zt-af-detail" hidden></div>` : ''}
    </div>`;

    const btn = el.querySelector('.zt-af-more');
    if (btn) {
        const box = el.querySelector('.zt-af-detail');
        btn.addEventListener('click', () => {
            const open = box.hasAttribute('hidden');
            if (open && !box.innerHTML) box.innerHTML = detailHtml(report);
            box.toggleAttribute('hidden', !open);
            btn.setAttribute('aria-expanded', String(open));
            btn.textContent = open ? 'Ẩn chi tiết' : 'Xem chi tiết';
        });
    }
}
