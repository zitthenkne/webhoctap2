// ui-fold.js — gom các hộp phụ (máy tự tính, thang điểm, khối chuyên khoa…) thành
// thẻ mở/đóng được, để trang không dài lê thê.
//
// Quy tắc: hộp nào đã có dữ liệu thì mở sẵn, hộp trống thì cụp lại; tiêu đề hiện
// một chấm xanh khi bên trong đã điền, nhìn là biết chỗ nào còn bỏ trống.

const FOLDABLE = '.calc-box:not(.no-fold), .score-box:not(.no-fold), '
    + '.cnv-box:not(.no-fold), .spec-box:not(.no-fold)';

const hasValue = (box) => [...box.querySelectorAll('input, select, textarea')]
    .some(el => el.type === 'checkbox' ? el.checked : String(el.value || '').trim());

function foldOne(box) {
    const title = box.querySelector(':scope > .calc-title');
    if (!title || box.dataset.folded) return;
    box.dataset.folded = '1';

    const det = document.createElement('details');
    det.className = box.className + ' fold-panel';
    det.dataset.folded = '1';
    if (box.dataset.spec) det.dataset.spec = box.dataset.spec;
    if (box.hasAttribute('data-nocount')) det.setAttribute('data-nocount', '');
    if (box.id) { det.id = box.id; box.removeAttribute('id'); }

    const summary = document.createElement('summary');
    const icon = title.querySelector('i');
    summary.innerHTML = (icon ? `<i class="${icon.className} lead"></i>` : '')
        + `<span>${title.textContent.trim()}</span>`
        + `<span class="filled-dot" hidden></span><i class="fas fa-chevron-down caret"></i>`;

    const body = document.createElement('div');
    body.className = 'fold-body';
    title.remove();
    while (box.firstChild) body.appendChild(box.firstChild);

    det.append(summary, body);
    box.replaceWith(det);
    det.open = hasValue(det);
    markFilled(det);
    return det;
}

function markFilled(det) {
    const dot = det.querySelector(':scope > summary .filled-dot');
    if (dot) dot.hidden = !hasValue(det);
}

export function initFold(root = document) {
    root.querySelectorAll(FOLDABLE).forEach(foldOne);

    // Điền xong thì chấm xanh sáng lên, không cần mở ra kiểm tra lại
    document.addEventListener('input', (e) => {
        const det = e.target.closest?.('.fold-panel');
        if (det) markFilled(det);
    });
    document.addEventListener('change', (e) => {
        const det = e.target.closest?.('.fold-panel');
        if (det) markFilled(det);
    });
}

/** Mở các thẻ của một chuyên khoa khi người dùng vừa chọn loại bệnh án */
export function openSpec(type) {
    document.querySelectorAll(`.fold-panel[data-spec="${type}"]`).forEach(d => { d.open = true; });
}
