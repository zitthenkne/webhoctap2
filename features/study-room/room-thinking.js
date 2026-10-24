// room-thinking.js — "Quét dữ kiện & hướng tư duy" trong phòng học: CÙNG trường `reasoning` của bộ đề như trang làm bài
// (features/quiz/page/quiz-reasoning.js, skill /up-cau-hoi ghi). Trước đây phòng bỏ qua trường này — đề soạn kỹ vào phòng là mất thẻ.
//  · Sổ tay: khối 🧠 Hướng tư duy (thân thẻ dùng chung quiz-reasoning-core.js) — chỉ mở khi đáp án đã lộ (Hiện đáp án / Chốt),
//    trước đó mục lục báo 🔒 như lời giải của file.
//  · Tô dữ kiện ngay trong ca / đề / phương án bằng CSS Custom Highlight API — KHÔNG chèn <mark> vào DOM: đề trong phòng là ô
//    contenteditable sửa chung, chèn thẻ sẽ lọt vào bản sửa của cả phòng. Trình duyệt chưa có API thì không tô, thẻ vẫn đủ.
//  · Bấm dữ kiện ở thẻ -> cuộn tới chỗ đó trong đề + nháy; bấm B1/B2 -> nháy bước đó. Công tắc "Tô trong đề" dùng chung khóa
//    localStorage quiz_reason_marks với trang làm bài (tắt ở đâu thì tắt cả hai nơi).
import { readReasoning, reasoningBodyHtml, reasoningLines, locateCue } from '../quiz/quiz-reasoning-core.js';

const LS_MARKS = 'quiz_reason_marks';
const marksOn = () => { try { return localStorage.getItem(LS_MARKS) !== '0'; } catch (e) { return true; } };
const HL = typeof CSS !== 'undefined' && !!CSS.highlights && typeof Highlight === 'function';
const KIND_HL = { key: 'rm-qr-key', neg: 'rm-qr-neg', trap: 'rm-qr-trap' };
const PING_HL = 'rm-qr-ping';
const L = (k) => String.fromCharCode(65 + k);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let last = null;          // { q, revealed } lần tô gần nhất — bật/tắt công tắc thì tô lại theo nó
let pingTimer = 0;

export const hasThinking = (q) => !!readReasoning(q);

/** Khối sổ tay (chỉ gọi khi đáp án đã lộ). */
export function thinkingBoxHtml(q, fresh = false) {
    const rs = readReasoning(q);
    if (!rs) return '';
    wire();
    const count = [rs.cues.length && `${rs.cues.length} dữ kiện`, rs.steps.length && `${rs.steps.length} bước`].filter(Boolean).join(' · ');
    const tg = HL ? `<button type="button" class="rm-qr-tg${marksOn() ? ' on' : ''}" data-qr-marks aria-pressed="${marksOn()}" title="Tô / bỏ tô dữ kiện ngay trong đề (nhớ chung với trang làm bài)">🖍 Tô trong đề</button>` : '';
    return `<div class="rm-xbox is-reason ${fresh ? 'is-fresh' : ''}" data-nb-sec="reason">
        <div class="rm-hub-boxhead">
            <span class="rm-xlabel"><span class="rm-xic">🧠</span>Hướng tư duy</span>
            ${count ? `<span class="rm-hint">${count}</span>` : ''}
            <span class="flex-1"></span>
            ${tg}
        </div>
        <div class="qr">${reasoningBodyHtml(q, true)}</div>
    </div>`;
}

/** Bản HTML gọn (đoạn + danh sách) cho chép sổ tay / lưu vào ghi chú của tôi. */
export function thinkingPlainHtml(q) {
    const r = reasoningLines(q);
    if (!r) return '';
    const b = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    return (r.cues.length ? `<p><b>Dữ kiện trong đề:</b></p><ul>${r.cues.map(c => `<li>${b(c)}</li>`).join('')}</ul>` : '')
        + (r.steps.length ? `<p><b>Chuỗi suy luận:</b></p><ul>${r.steps.map(s => `<li>${b(s)}</li>`).join('')}</ul>` : '')
        + (r.goal ? `<p><b>Chốt:</b> ${b(r.goal)}</p>` : '');
}

// Các vùng đề đang hiện, đúng quy ước phạm vi của `cues[].in`: 'case' | 'q' | 'A'…'H'
// (phòng không xáo phương án nên chữ cái gốc của file khớp thẳng ô trên màn)
function regionsNow() {
    const regions = [
        ['case', document.querySelector('#case-box:not(.hidden) .rm-case-body')],
        ['q', document.getElementById('question-text')],
    ];
    document.querySelectorAll('#options-area [data-card]').forEach(c => regions.push([L(+c.dataset.card), c.querySelector('.rm-otext > .rm-md')]));
    return regions;
}

// { nodes, start, end } (offset trên chuỗi ghép) -> Range
function toRange({ nodes, start, end }) {
    let acc = 0, r = null;
    for (const n of nodes) {
        const len = n.nodeValue.length;
        if (!r && start < acc + len) { r = document.createRange(); r.setStart(n, start - acc); }
        if (r && end <= acc + len) { r.setEnd(n, end - acc); return r; }
        acc += len;
    }
    return null;
}

/** Tô / gỡ tô dữ kiện trong đề câu đang xem — gọi sau mỗi lần vẽ lại màn câu (DOM đề có thể vừa thay). */
export function paintThinking(q, revealed) {
    last = { q, revealed };
    const rs = revealed ? readReasoning(q) : null;
    const found = new Set();
    if (HL) {
        const byKind = { key: [], neg: [], trap: [] };
        if (rs && marksOn()) {
            const regions = regionsNow();
            rs.cues.forEach((c, k) => {
                const hit = locateCue(c, regions);
                const r = hit && toRange(hit);
                if (!r) return;
                found.add(k + 1);
                byKind[c.kind].push(r);
            });
        }
        Object.entries(KIND_HL).forEach(([k, name]) => {
            if (byKind[k].length) CSS.highlights.set(name, new Highlight(...byKind[k]));
            else CSS.highlights.delete(name);
        });
    }
    // Cụm không tìm thấy trong đề (nhóm đã sửa chữ, hoặc file chép sai) -> vé dữ kiện viền đứt, bấm không nhảy
    if (rs && HL && marksOn()) {
        document.querySelectorAll('#notebook .is-reason .qr-cue[data-cue]').forEach(b => {
            const miss = !found.has(+b.dataset.cue);
            b.classList.toggle('is-miss', miss);
            b.title = miss ? 'Không tìm thấy cụm này trong đề' : '';
        });
    }
}

function flash(node) {
    if (!node) return;
    node.classList.remove('is-ping');
    void node.offsetWidth;
    node.classList.add('is-ping');
    setTimeout(() => node.classList.remove('is-ping'), 1700);
}

// Bấm dữ kiện ở thẻ: tìm lại NGAY lúc bấm (đề có thể vừa được sửa / vẽ lại) -> cuộn tới + nháy
function goCue(n) {
    const rs = last?.revealed && readReasoning(last.q);
    const c = rs?.cues[n - 1];
    if (!c) return;
    let hit = locateCue(c, regionsNow());
    if (!hit) {
        // Ca đang gập: mở ra rồi tìm lại
        const box = document.getElementById('case-box');
        if (box?.classList.contains('is-folded')) { box.querySelector('.rm-case-head [data-case-fold]')?.click(); hit = locateCue(c, regionsNow()); }
    }
    const r = hit && toRange(hit);
    if (!r) return;
    const host = r.startContainer.parentElement;
    const rect = r.getBoundingClientRect();
    if (rect.top < 80 || rect.bottom > innerHeight - 80) host?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    clearTimeout(pingTimer);
    if (HL) {
        CSS.highlights.set(PING_HL, new Highlight(r));
        pingTimer = setTimeout(() => CSS.highlights.delete(PING_HL), 1600);
    } else {
        const region = host?.closest('#question-text, .rm-case-body, .rm-otext') || host;
        flash(region);
    }
}

let wired = false;
function wire() {
    if (wired) return;
    wired = true;
    document.addEventListener('click', (e) => {
        const box = e.target.closest?.('#notebook .is-reason');
        if (!box || String(window.getSelection() || '').trim()) return;
        if (e.target.closest('[data-qr-marks]')) {
            const on = !marksOn();
            try { localStorage.setItem(LS_MARKS, on ? '1' : '0'); } catch (err) {}
            box.querySelector('[data-qr-marks]').classList.toggle('on', on);
            box.querySelector('[data-qr-marks]').setAttribute('aria-pressed', String(on));
            if (!on) box.querySelectorAll('.qr-cue.is-miss').forEach(b => { b.classList.remove('is-miss'); b.title = ''; });
            if (last) paintThinking(last.q, last.revealed);
            return;
        }
        const stepRef = e.target.closest('[data-goto-step]');
        if (stepRef) return void flash(box.querySelector(`.qr-step[data-step="${stepRef.dataset.gotoStep}"]`));
        const cue = e.target.closest('[data-cue]');
        if (cue && !cue.classList.contains('is-miss')) return void goCue(+cue.dataset.cue);
    });
}
