// list-picker.js — bảng chọn dùng chung: tìm kiếm + gấp theo từng nhóm.
//
// Dùng cho những danh sách dài mà nhét vào chip hay datalist thì không đủ và
// không dễ nhìn: tên bệnh theo chuyên khoa, tên thuốc theo nhóm, cận lâm sàng…
//
// openListPicker({ title, groups, value, multi, onPick })
//   groups: [{ ten, icon, items: ['…'] }]
//   value : chuỗi đang có trong ô (để đánh dấu mục đã chọn)
//   multi : cho chọn nhiều mục cùng lúc
//   onPick: (mảngTênĐãChọn) => {}

import { searchList, highlight } from './tim-kiem.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let el;
let st = { groups: [], flat: [], chosen: new Set(), multi: false, onPick: null, q: '', open: new Set(), active: 0 };

function ensureDom() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'lp-modal hidden';
    el.innerHTML = `
        <div class="sp-bg" data-lp-close></div>
        <div class="sp-panel">
            <div class="sp-head">
                <b id="lp-title">Chọn</b>
                <button type="button" class="sp-x" data-lp-close aria-label="Đóng"><i class="fas fa-xmark"></i></button>
            </div>
            <input id="lp-q" class="sp-search" placeholder="Tìm nhanh — gõ không dấu cũng ra" aria-label="Tìm trong danh sách">
            <div id="lp-body" class="sp-body"></div>
            <div class="sp-foot">
                <span id="lp-count" class="sp-preview"></span>
                <button type="button" id="lp-ok" class="sp-ok"><i class="fas fa-check"></i> Xong</button>
            </div>
        </div>`;
    document.body.appendChild(el);

    el.addEventListener('click', (e) => {
        if (e.target.closest('[data-lp-close]')) return close();

        const head = e.target.closest('[data-g]');
        if (head) {
            const k = head.dataset.g;
            st.open.has(k) ? st.open.delete(k) : st.open.add(k);
            return renderBody();
        }
        const pick = e.target.closest('[data-item]');
        if (pick) {
            const name = pick.dataset.item;
            if (!st.multi) { st.onPick?.([name]); return close(); }
            st.chosen.has(name) ? st.chosen.delete(name) : st.chosen.add(name);
            return renderBody();
        }
        if (e.target.closest('#lp-add-free')) {
            const t = st.q.trim();
            if (!t) return;
            if (!st.multi) { st.onPick?.([t]); return close(); }
            st.chosen.add(t);
            return renderBody();
        }
        if (e.target.closest('#lp-ok')) {
            st.onPick?.([...st.chosen]);
            return close();
        }
    });

    el.addEventListener('input', (e) => {
        if (e.target.id !== 'lp-q') return;
        st.q = e.target.value;
        st.active = 0;
        renderBody();
    });

    // Bàn phím: lên xuống chọn dòng, Enter là chèn luôn — khỏi rời tay khỏi ô tìm
    el.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') return close();
        if (!st.q.trim()) return;
        const found = hits();
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const last = found.length - 1;
            st.active = e.key === 'ArrowDown'
                ? (st.active >= last ? -1 : st.active + 1)     // -1 = dòng "dùng đúng chữ tôi gõ"
                : (st.active <= -1 ? last : st.active - 1);
            return renderBody();
        }
        if (e.key !== 'Enter' || e.isComposing) return;
        e.preventDefault();
        const name = st.active >= 0 ? found[st.active]?.ten : st.q.trim();
        if (!name) return;
        if (!st.multi) { st.onPick?.([name]); return close(); }
        st.chosen.has(name) ? st.chosen.delete(name) : st.chosen.add(name);
        const box = el.querySelector('#lp-q');
        box.value = '';
        st.q = '';
        st.active = 0;
        renderBody();
        box.focus();
    });
    return el;
}

/** Kết quả đang khớp, đã xếp hạng — dùng chung cho lúc vẽ và lúc bấm Enter */
function hits() {
    return searchList(st.flat, st.q, { key: (x) => x.ten, alias: (x) => x.nhom, limit: 60 });
}

function itemHtml(name, { nhom, q, active } = {}) {
    const on = st.chosen.has(name);
    return `<button type="button" class="lp-item${on ? ' is-on' : ''}${active ? ' is-active' : ''}" data-item="${esc(name)}">
        <i class="fas ${on ? 'fa-circle-check' : 'fa-circle-plus'}"></i>
        <span>${q ? highlight(name, q) : esc(name)}</span>
        ${nhom ? `<small class="lp-from">${esc(nhom)}</small>` : ''}</button>`;
}

function renderBody() {
    const body = el.querySelector('#lp-body');
    const q = st.q.trim();

    if (q) {
        // Đang tìm: bỏ nhóm, trải phẳng kết quả đã xếp hạng cho nhanh mắt
        const found = hits();
        if (st.active >= found.length) st.active = found.length - 1;
        body.innerHTML = `
            ${found.length ? `<div class="lp-items">${found.map((h, i) =>
                itemHtml(h.ten, { nhom: h.nhom, q, active: i === st.active })).join('')}</div>`
                : `<p class="sp-empty">Không có mục nào khớp “${esc(q)}” — cứ dùng đúng chữ bạn gõ.</p>`}
            <button type="button" id="lp-add-free" class="lp-free${st.active < 0 ? ' is-active' : ''}">
                <i class="fas fa-plus"></i> Dùng đúng chữ tôi gõ: <b>${esc(q)}</b></button>`;
        body.querySelector('.lp-item.is-active')?.scrollIntoView({ block: 'nearest' });
    } else {
        body.innerHTML = st.groups.map(g => {
            const open = st.open.has(g.ten);
            const n = g.items.length;
            const picked = g.items.filter(i => st.chosen.has(i)).length;
            return `<section class="lp-group">
                <button type="button" class="lp-ghead${open ? ' is-open' : ''}" data-g="${esc(g.ten)}">
                    <i class="fas ${g.icon || 'fa-folder'} lead"></i>
                    <b>${esc(g.ten)}</b>
                    ${picked ? `<span class="lp-badge">${picked}</span>` : ''}
                    <span class="lp-n">${n}</span>
                    <i class="fas fa-chevron-down caret"></i>
                </button>
                ${open ? `<div class="lp-items">${g.items.map(x => itemHtml(x)).join('')}</div>` : ''}
            </section>`;
        }).join('');
    }

    const count = el.querySelector('#lp-count');
    const ok = el.querySelector('#lp-ok');
    if (q) {
        const n = hits().length;
        count.innerHTML = `<i class="fas fa-magnifying-glass"></i> ${n} kết quả`
            + (st.multi && st.chosen.size ? ` · đã chọn ${st.chosen.size}` : '')
            + ' <small>↑↓ chọn dòng · Enter chèn</small>';
        ok.style.display = st.multi ? '' : 'none';
    } else if (st.multi) {
        count.innerHTML = st.chosen.size
            ? `<i class="fas fa-check"></i> Đã chọn ${st.chosen.size} mục`
            : 'Chạm để chọn, chọn được nhiều mục';
        ok.style.display = '';
    } else {
        count.textContent = 'Chạm vào một mục để chèn';
        ok.style.display = 'none';
    }
}

function close() {
    el?.classList.add('hidden');
    document.body.classList.remove('lp-locked');
}

export function openListPicker({ title, groups, value, multi = false, onPick } = {}) {
    ensureDom();
    const flat = [];
    const seen = new Set();
    (groups || []).forEach(g => (g.items || []).forEach(ten => {
        if (seen.has(ten)) return;          // trùng tên giữa hai nhóm thì giữ nhóm đầu
        seen.add(ten);
        flat.push({ ten, nhom: g.ten });
    }));
    st = {
        groups: groups || [],
        chosen: new Set(multi ? splitValue(value) : []),
        multi, onPick, q: '', flat,
        active: 0,                          // con trỏ bàn phím trong danh sách kết quả
        // Gấp hết: một màn thấy đủ các chuyên khoa, chạm nhóm nào mới xổ nhóm đó
        open: new Set()
    };
    el.querySelector('#lp-title').textContent = title || 'Chọn';
    const q = el.querySelector('#lp-q');
    q.value = '';
    renderBody();
    el.classList.remove('hidden');
    document.body.classList.add('lp-locked');
    // Điện thoại: đừng bật bàn phím ngay, người dùng thường muốn duyệt theo nhóm trước
    if (!window.matchMedia('(hover: none)').matches) setTimeout(() => q.focus(), 30);
}

/** Tách nội dung ô hiện có thành các mục đã chọn */
function splitValue(v) {
    return String(v || '').split(/[;\n]+/).map(x => x.trim()).filter(Boolean);
}
