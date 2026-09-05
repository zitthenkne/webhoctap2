// symptom-picker.js — bảng chọn triệu chứng có sẵn rồi khai thác đủ đặc điểm.
//
// Mở bằng openSymptomPicker({ title, initial, onPick }) — người dùng chọn một triệu chứng
// trong thư viện (hoặc tự gõ), điền các ô đặc điểm, xem trước câu mô tả rồi chèn.
// Dùng chung cho bệnh sử (triệu chứng mới ở mỗi mốc) và theo dõi diễn tiến.

import { SYMPTOMS, NHOM, describe, findSymptom, searchSymptoms, heIcon, heMau } from './trieu-chung-data.js';
import { highlight } from './tim-kiem.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const newState = (over = {}) => ({
    sym: null, values: {}, onPick: null, custom: '',
    open: new Set(), other: new Set(),
    extras: new Set(),   // triệu chứng đi kèm chọn thêm — chèn luôn vào cùng mốc
    negs: new Set(),     // triệu chứng âm tính có giá trị đã tick
    ...over
});

let el, state = newState();

function ensureDom() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'sp-modal hidden';
    el.innerHTML = `
        <div class="sp-bg" data-sp-close></div>
        <div class="sp-panel">
            <div class="sp-head">
                <b id="sp-title">Thêm triệu chứng</b>
                <button type="button" class="sp-x" data-sp-close aria-label="Đóng"><i class="fas fa-xmark"></i></button>
            </div>
            <input id="sp-search" class="sp-search" placeholder="Tìm triệu chứng (sốt, ho, đau bụng…) hoặc tự gõ tên" aria-label="Tìm triệu chứng">
            <div id="sp-body" class="sp-body"></div>
            <div class="sp-foot">
                <span id="sp-preview" class="sp-preview"></span>
                <button type="button" id="sp-ok" class="sp-ok"><i class="fas fa-plus"></i> Chèn vào bệnh án</button>
            </div>
        </div>`;
    document.body.appendChild(el);

    el.addEventListener('click', (e) => {
        if (e.target.closest('[data-sp-close]')) return close();
        const head = e.target.closest('[data-g]');
        if (head) {
            const k = head.dataset.g;
            state.open.has(k) ? state.open.delete(k) : state.open.add(k);
            return renderBody();
        }
        const other = e.target.closest('[data-other]');
        if (other) {
            const k = other.dataset.other;
            state.other.has(k) ? state.other.delete(k) : state.other.add(k);
            renderBody();
            el.querySelector(`.sp-f input[data-f="${k}"]`)?.focus();
            return;
        }
        const opt = e.target.closest('[data-opt]');
        if (opt) {
            const f = opt.dataset.opt, v = opt.dataset.v;
            state.values[f] = state.values[f] === v ? '' : v;
            return renderBody();
        }
        const co = e.target.closest('[data-co]');
        if (co) {
            const k = co.dataset.co;
            state.extras.has(k) ? state.extras.delete(k) : state.extras.add(k);
            return renderBody();
        }
        const neg = e.target.closest('[data-neg]');
        if (neg) {
            const k = neg.dataset.neg;
            state.negs.has(k) ? state.negs.delete(k) : state.negs.add(k);
            return renderBody();
        }
        const pick = e.target.closest('[data-sym]');
        if (pick) {
            state.sym = SYMPTOMS.find(s => s.ten === pick.dataset.sym) || null;
            state.values = {};
            state.extras = new Set();
            state.negs = new Set();
            renderBody();
            return;
        }
        if (e.target.closest('#sp-ok')) {
            const text = currentText();
            if (!text) return;
            state.onPick?.(text, state.sym?.ten || state.custom,
                // `values` để nơi gọi đổ thẳng vào các ô thuộc tính có sẵn của mình,
                // khỏi phải tách lại từ câu mô tả đã ghép.
                { extras: [...state.extras], negatives: [...state.negs], values: { ...state.values } });
            close();
        }
    });

    el.addEventListener('input', (e) => {
        if (e.target.id === 'sp-search') {
            state.custom = e.target.value.trim();
            const hit = findSymptom(state.custom);
            if (hit && hit !== state.sym && state.custom.length > 2) { state.sym = hit; state.values = {}; }
            renderBody();
            return;
        }
        if (e.target.dataset.f) {
            state.values[e.target.dataset.f] = e.target.value;
            // Gõ tay ý khác thì bỏ sáng chip đang chọn của đúng ô đó
            e.target.closest('.sp-f')?.querySelectorAll('.sp-opt')
                .forEach(b => b.classList.toggle('is-on', b.dataset.v === e.target.value));
            updatePreview();
        }
    });
    el.addEventListener('change', (e) => {
        if (e.target.dataset.f) { state.values[e.target.dataset.f] = e.target.value; updatePreview(); }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

    // Enter ở ô tìm: chọn luôn triệu chứng khớp nhất, khỏi rời tay đi bấm chip
    el.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.target.id !== 'sp-search' || e.isComposing) return;
        e.preventDefault();
        if (state.sym) return;
        const first = searchSymptoms(state.custom)[0];
        if (!first) return;
        state.sym = first;
        state.values = {};
        state.extras = new Set();
        state.negs = new Set();
        renderBody();
    });
    return el;
}

function currentText() {
    if (state.sym) return describe(state.sym, state.values);
    return state.custom.trim();
}

function updatePreview() {
    const p = el.querySelector('#sp-preview');
    const t = currentText();
    const more = [state.extras.size && `+${state.extras.size} triệu chứng kèm`,
        state.negs.size && `+${state.negs.size} âm tính`].filter(Boolean).join(' · ');
    p.innerHTML = t
        ? `<i class="fas fa-quote-left"></i> ${esc(t)}${more ? ` <b class="sp-more">${esc(more)}</b>` : ''}`
        : 'Chọn triệu chứng để bắt đầu';
}

function fieldHtml([k, label, opts, ph]) {
    const val = state.values[k] || '';
    if (!opts) {
        return `<label class="sp-f"><span>${esc(label)}</span>
            <input data-f="${k}" value="${esc(val)}" placeholder="${esc(ph || '')}"></label>`;
    }
    // Có sẵn lựa chọn thì bày hết ra để chạm; ô gõ tay giấu sau nút "Khác"
    // cho bảng khỏi dài, chỉ tự mở khi nội dung không nằm trong danh sách.
    const free = val && !opts.includes(val);
    const showInput = free || state.other.has(k);
    const chips = opts.map(o =>
        `<button type="button" class="sp-opt${val === o ? ' is-on' : ''}" data-opt="${esc(k)}" data-v="${esc(o)}">${esc(o)}</button>`
    ).join('');
    return `<label class="sp-f"><span>${esc(label)}</span>
        <div class="sp-opts">${chips}
            <button type="button" class="sp-opt sp-other${showInput ? ' is-open' : ''}" data-other="${esc(k)}">
                <i class="fas fa-pen"></i> Khác</button>
        </div>
        ${showInput ? `<input data-f="${k}" value="${esc(val)}" placeholder="tự gõ ý khác">` : ''}</label>`;
}

/* Hai khối phụ dưới bộ thuộc tính: chùm triệu chứng hay đi kèm và các câu âm tính
   có giá trị. Chọn ở đây rồi bấm "Chèn" là máy tự thêm vào mốc, khỏi mở lại bảng. */
function contextHtml(sym) {
    const co = sym.coOccurring || [], neg = sym.pertinentNegatives || [];
    if (!co.length && !neg.length) return '';
    const coBox = co.length ? `<div class="sp-ctx">
        <div class="sp-ctxhead"><i class="fas fa-diagram-project"></i> Triệu chứng đi kèm hay gặp
            <span>chạm để thêm luôn vào mốc này</span></div>
        <div class="sp-opts">${co.map(x => `<button type="button" class="sp-opt${state.extras.has(x) ? ' is-on' : ''}"
            data-co="${esc(x)}">${state.extras.has(x) ? '<i class="fas fa-check"></i> ' : '+ '}${esc(x)}</button>`).join('')}</div>
    </div>` : '';
    const negBox = neg.length ? `<div class="sp-ctx">
        <div class="sp-ctxhead"><i class="fas fa-circle-minus"></i> Triệu chứng âm tính có giá trị
            <span>tick để loại trừ, máy ghép thành câu và đưa vào ô âm tính</span></div>
        <div class="sp-negs">${neg.map(([val, why]) => `<button type="button" class="sp-neg${state.negs.has(val) ? ' is-on' : ''}"
            data-neg="${esc(val)}"><i class="${state.negs.has(val) ? 'fa-solid fa-square-check' : 'fa-regular fa-square'}"></i>
            <b>${esc(val)}</b><small>loại trừ ${esc(why)}</small></button>`).join('')}</div>
    </div>` : '';
    return coBox + negBox;
}

function renderBody() {
    const body = el.querySelector('#sp-body');
    const q = el.querySelector('#sp-search').value;

    if (state.sym) {
        body.innerHTML = `<div class="sp-chosen">
                <span class="sp-chip active"><i class="fas fa-check"></i> ${esc(state.sym.ten)}</span>
                <button type="button" class="sp-back" data-sym="">Chọn triệu chứng khác</button>
            </div>
            <div class="sp-grid">${state.sym.fields.map(fieldHtml).join('')}</div>
            ${contextHtml(state.sym)}`;
        // nút "chọn khác" dùng data-sym rỗng
        body.querySelector('.sp-back')?.addEventListener('click', () => {
            state.sym = null; state.values = {}; renderBody();
        });
    } else {
        const list = searchSymptoms(q);
        /* Chip mang màu + biểu tượng của hệ cơ quan: đang tìm giữa 180 triệu chứng
           thì mắt lọc theo màu nhanh hơn đọc từng chữ. */
        const chip = (s, i) => `<button type="button" class="sp-chip${q.trim() && !i ? ' is-first' : ''}"
            data-sym="${esc(s.ten)}" title="${esc(s.nhom)}" style="--he:${heMau(s.nhom)}"><i
            class="fas ${heIcon(s.nhom)} sp-he"></i>${q.trim() ? highlight(s.ten, q) : esc(s.ten)}</button>`;

        if (q.trim()) {
            // Đang tìm: bỏ nhóm cho nhanh mắt
            body.innerHTML = list.length
                ? `<p class="sp-hint">${list.length} triệu chứng khớp — Enter để chọn cái đầu tiên</p>
                   <div class="sp-chips">${list.map(chip).join('')}</div>`
                : `<p class="sp-empty">Không có sẵn triệu chứng này — cứ gõ tên rồi bấm “Chèn vào bệnh án”.</p>`;
        } else {
            const groups = NHOM.filter(g => list.some(s => s.nhom === g));
            body.innerHTML = groups.map(g => {
                const items = list.filter(s => s.nhom === g);
                const open = state.open.has(g);
                return `<section class="lp-group" style="--he:${heMau(g)}">
                    <button type="button" class="lp-ghead${open ? ' is-open' : ''}" data-g="${esc(g)}">
                        <i class="fas ${heIcon(g)} lead" style="color:${heMau(g)}"></i><b>${esc(g)}</b>
                        <span class="lp-n">${items.length}</span>
                        <i class="fas fa-chevron-down caret"></i>
                    </button>
                    ${open ? `<div class="sp-chips">${items.map(chip).join('')}</div>` : ''}
                </section>`;
            }).join('');
        }
    }
    updatePreview();
}

function close() { el?.classList.add('hidden'); }

export function openSymptomPicker({ title, initial, onPick } = {}) {
    ensureDom();
    state = newState({ sym: initial ? findSymptom(initial) : null, onPick, custom: initial || '' });
    el.querySelector('#sp-title').textContent = title || 'Thêm triệu chứng';
    el.querySelector('#sp-search').value = initial || '';
    renderBody();
    el.classList.remove('hidden');
    if (!state.sym && !window.matchMedia('(hover: none)').matches) {
        el.querySelector('#sp-search').focus();
    }
}
