// ly-do-list.js — II. LÝ DO VÀO VIỆN: chọn triệu chứng thay vì gõ một câu.
//
// Lý do vào viện là chỗ khởi đầu của cả bệnh án: triệu chứng đứng đầu ở đây gần
// như luôn là triệu chứng chính của bệnh sử, các triệu chứng còn lại là triệu
// chứng đi kèm. Trước đây nó chỉ là một ô chữ, gõ xong không ai dùng lại được.
//
// Nay mỗi triệu chứng là một viên:
//   · gõ tới đâu xổ gợi ý tới đó (tìm cả theo nhóm và theo bệnh cảnh nguy hiểm)
//   · chọn xong máy bày luôn các triệu chứng THƯỜNG ĐI KÈM để bấm thêm
//   · viên đầu tiên là triệu chứng chính (bấm ngôi sao để đổi), phần còn lại là phụ
//   · nhắc luôn các bệnh cảnh phải loại trừ của triệu chứng chính
//
// Vẫn ghi vào ô chữ cũ `reason-for-admission` dạng "Sốt, ho khan, đau ngực",
// triệu chứng chính đứng đầu — record không thêm trường mới.

import { SYMPTOMS, searchSymptoms, findSymptom } from './trieu-chung-data.js';
import { highlight } from './tim-kiem.js';
import { openSymptomPicker } from './symptom-picker.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const trim = (x) => String(x ?? '').trim();
const low = (x) => trim(x).toLowerCase();

const parse = (text) => String(text || '').split(/[,;\n]+/).map(trim).filter(Boolean);

/**
 * @param field ô chữ gốc (reason-for-admission) — nguồn lưu duy nhất
 * @param host  hộp chứa giao diện
 * @param onChange gọi sau mỗi lần danh sách đổi
 */
export function initLyDo({ field, host, onChange }) {
    if (!field || !host) return null;
    let rows = parse(field.value);
    let pop = [], active = -1, writing = false;

    host.innerHTML = `<div class="ld-row">
            <span class="ld-chips"></span>
            <input class="ld-in" placeholder="Gõ triệu chứng — vd sốt, ho, đau ngực…" aria-label="Thêm triệu chứng vào lý do vào viện">
            <button type="button" class="ld-more" data-act="pick" title="Mở bảng triệu chứng đầy đủ"><i class="fas fa-table-list"></i></button>
        </div>
        <div class="ld-pop hidden"></div>
        <div class="ld-co"></div>`;

    const chipsEl = host.querySelector('.ld-chips');
    const inputEl = host.querySelector('.ld-in');
    const popEl = host.querySelector('.ld-pop');
    const coEl = host.querySelector('.ld-co');

    const has = (ten) => rows.some(r => low(r) === low(ten));

    function flush() {
        writing = true;
        field.value = rows.join(', ');
        field.dispatchEvent(new Event('input', { bubbles: true }));
        writing = false;
        onChange?.();
    }

    /* ---------- viên triệu chứng ---------- */
    function renderChips() {
        chipsEl.innerHTML = rows.map((ten, i) => `<span class="ld-chip${i === 0 ? ' is-main' : ''}" data-i="${i}">
            ${i === 0 ? '<i class="fas fa-star ld-star" title="Triệu chứng chính"></i>' : ''}
            <b>${esc(ten)}</b>
            ${i === 0 ? '<em>chính</em>' : `<button type="button" class="ld-up" data-act="main" title="Đặt làm triệu chứng chính"><i class="far fa-star"></i></button>`}
            <button type="button" class="ld-x" data-act="del" aria-label="Xóa ${esc(ten)}"><i class="fas fa-xmark"></i></button>
        </span>`).join('');
        renderCo();
    }

    /* ---------- hàng "thường đi kèm" + bệnh cảnh cần loại trừ ---------- */
    function renderCo() {
        const sym = rows[0] ? findSymptom(rows[0]) : null;
        if (!sym) {
            coEl.innerHTML = rows.length ? '' : `<div class="ld-hint"><i class="fas fa-lightbulb"></i>
                Chọn triệu chứng đưa bệnh nhân tới viện — cái đầu tiên sẽ thành <b>triệu chứng chính</b> của bệnh sử.</div>`;
            return;
        }
        // Một dải duy nhất, cuộn ngang: trên điện thoại mấy hàng gợi ý xuống dòng
        // là đẩy phần nhập trôi mất tăm.
        const kem = (sym.coOccurring || []).filter(x => !has(x)).slice(0, 6);
        const rf = (sym.redFlags || []).slice(0, 4);
        coEl.innerHTML = `<div class="ld-line ld-scroll">
            ${kem.length ? `<b>Đi kèm</b>${kem.map(x => `<button type="button" class="ld-sug" data-add="${esc(x)}">+ ${esc(x)}</button>`).join('')}` : ''}
            ${rf.length ? `<span class="ld-rf"><i class="fas fa-triangle-exclamation"></i> Loại trừ: ${rf.map(esc).join(' · ')}</span>` : ''}
        </div>`;
    }

    /* ---------- gợi ý xổ xuống khi gõ ---------- */
    function suggest(q) {
        const s = trim(q);
        if (s.length < 1) return hidePop();
        // Vừa dò tên triệu chứng, vừa kéo theo các triệu chứng hay đi cùng cái đang gõ
        const hits = searchSymptoms(s).filter(x => !has(x.ten)).slice(0, 8);
        const kem = hits.length === 1
            ? (hits[0].coOccurring || []).filter(x => !has(x)).slice(0, 4)
                .map(ten => SYMPTOMS.find(y => y.ten === ten)).filter(Boolean)
            : [];
        pop = [...hits, ...kem.filter(k => !hits.some(h => h.ten === k.ten))];
        if (!pop.length) return hidePop();
        active = 0;
        popEl.innerHTML = pop.map((x, i) => `<button type="button" class="ld-opt${i === active ? ' is-active' : ''}" data-i="${i}">
                <span>${highlight(x.ten, s)}</span>
                <em>${esc(x.nhom || '')}${i >= hits.length ? ' · thường đi cùng' : ''}</em>
            </button>`).join('')
            + `<div class="ld-foot">↑↓ chọn · Enter thêm · Esc bỏ qua — gõ tên khác thì Enter vẫn thêm được</div>`;
        popEl.classList.remove('hidden');
    }

    const hidePop = () => { popEl.classList.add('hidden'); pop = []; active = -1; };

    function add(ten) {
        const t = trim(ten);
        if (!t || has(t)) return false;
        rows.push(t);
        renderChips();
        flush();
        return true;
    }

    /* ---------- sự kiện ---------- */
    inputEl.addEventListener('input', () => suggest(inputEl.value));
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') return hidePop();
        if (e.key === 'Backspace' && !inputEl.value && rows.length) {
            rows.pop(); renderChips(); flush(); return;
        }
        if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && pop.length) {
            e.preventDefault();
            active = (active + (e.key === 'ArrowDown' ? 1 : pop.length - 1)) % pop.length;
            popEl.querySelectorAll('.ld-opt').forEach((b, i) => b.classList.toggle('is-active', i === active));
            return;
        }
        if (e.key !== 'Enter' || e.isComposing) return;
        e.preventDefault();
        add(pop[active]?.ten || inputEl.value);
        inputEl.value = '';
        hidePop();
    });
    inputEl.addEventListener('blur', () => setTimeout(hidePop, 150));

    popEl.addEventListener('mousedown', (e) => e.preventDefault());
    popEl.addEventListener('click', (e) => {
        const b = e.target.closest('.ld-opt');
        if (!b) return;
        add(pop[+b.dataset.i]?.ten);
        inputEl.value = '';
        hidePop();
        inputEl.focus();
    });

    host.addEventListener('click', (e) => {
        const sug = e.target.closest('[data-add]');
        if (sug) return add(sug.dataset.add);
        if (e.target.closest('[data-act="pick"]')) {
            // Lý do vào viện chỉ cần TÊN triệu chứng, phần đặc điểm để dành cho bệnh sử
            return openSymptomPicker({
                title: 'Chọn triệu chứng đưa bệnh nhân tới viện',
                onPick: (text, ten, extra) => {
                    add(ten || String(text).split(':')[0]);
                    (extra?.extras || []).forEach(add);
                }
            });
        }
        const chip = e.target.closest('.ld-chip');
        if (!chip) return;
        const i = +chip.dataset.i;
        if (e.target.closest('[data-act="del"]')) rows.splice(i, 1);
        else if (e.target.closest('[data-act="main"]')) rows.unshift(rows.splice(i, 1)[0]);
        else return;
        renderChips();
        flush();
    });

    // Người dùng sửa thẳng trong ô chữ (bản máy ghép) thì các viên phải theo kịp
    field.addEventListener('input', () => {
        if (writing) return;
        rows = parse(field.value);
        renderChips();
    });

    renderChips();
    return {
        get: () => rows.slice(),
        main: () => rows[0] || '',
        sync() {
            if (rows.join(', ') === trim(field.value)) return;
            rows = parse(field.value);
            renderChips();
        }
    };
}
