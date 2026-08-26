// ui-ask.js — "mục này có cần hỏi không?"
//
// Bệnh án đang bày sẵn mọi khối câu hỏi cho mọi bệnh nhân: người không hề chấn
// thương vẫn thấy khối cơ chế chấn thương, người không hút thuốc vẫn phải nhìn
// bảng tính gói·năm. Mỗi khối như vậy được gắn một cặp nút Có / Không:
//   · Không  -> cụp khối lại, và nếu khối có ô chữ tương ứng thì ghi luôn câu
//               phủ định chuẩn ("Chưa ghi nhận dị ứng…") — trả lời "không" cũng
//               là một dữ kiện của bệnh án, không phải bỏ trống.
//   · Có     -> mở khối ra, gỡ câu phủ định nếu trước đó đã ghi.
//   · Bấm lại nút đang chọn -> quay về "chưa hỏi".
//
// Khai báo ngay trên HTML, không cần sửa JS:
//   data-ask     = câu hỏi hiện cạnh tiêu đề
//   data-ask-key = khóa lưu trong record.hoiCo (mặc định lấy id)
//   data-ask-no  = "idÔChữ::Câu phủ định" (không bắt buộc)
//
// Chạy SAU ui-fold.js vì lúc đó khối đã được bọc thành <details>.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const answers = new Map();          // khóa -> 'co' | 'khong'
let onChangeCb = () => { };
let growCb = null;

const keyOf = (box) => box.dataset.askKey || box.id || '';
const boxes = () => [...document.querySelectorAll('[data-ask]')];

/** Khối có ô nào đã điền chưa — để cảnh báo khi trả lời "không" mà bên trong còn chữ */
const hasValue = (box) => [...box.querySelectorAll('input, select, textarea')]
    .some(el => el.type === 'checkbox' ? el.checked : String(el.value || '').trim());

/* ---------- ô chữ phủ định đi kèm ---------- */
function noPair(box) {
    const [id, text] = String(box.dataset.askNo || '').split('::');
    const el = id && $(id.trim());
    return el && text ? { el, text: text.trim() } : null;
}

function writeNo(box) {
    const p = noPair(box);
    if (!p) return;
    const cur = String(p.el.value || '').trim();
    if (cur.includes(p.text)) return;
    p.el.value = cur ? cur + '\n' + p.text : p.text;
    p.el.dispatchEvent(new Event('input', { bubbles: true }));
    growCb?.(p.el);
}

/** Trả lời lại là "có" thì câu phủ định phải biến mất, không để hai ý ngược nhau */
function eraseNo(box) {
    const p = noPair(box);
    if (!p) return;
    const left = String(p.el.value || '').split('\n')
        .filter(l => l.trim() && l.trim() !== p.text).join('\n');
    if (left === p.el.value) return;
    p.el.value = left;
    p.el.dispatchEvent(new Event('input', { bubbles: true }));
    growCb?.(p.el);
}

/* ---------- vẽ ---------- */
function mount(box) {
    const head = box.tagName === 'DETAILS'
        ? box.querySelector(':scope > summary')
        : box.querySelector(':scope > .calc-title, :scope > .cnv-head');
    if (!head || head.querySelector('.ask')) return;
    head.insertAdjacentHTML('beforeend', `<span class="ask">
        <span class="ask-q">${esc(box.dataset.ask)}</span>
        <button type="button" class="ask-b" data-v="co">Có</button>
        <button type="button" class="ask-b" data-v="khong">Không</button>
        <span class="ask-keep" hidden title="Đã trả lời không nhưng bên trong vẫn còn ô đã điền">
            <i class="fas fa-triangle-exclamation"></i> còn dữ liệu</span>
    </span>`);
}

function paint(box) {
    const v = answers.get(keyOf(box)) || '';
    box.querySelectorAll(':scope .ask-b').forEach(b => b.classList.toggle('is-on', b.dataset.v === v));
    box.classList.toggle('ask-off', v === 'khong');
    const keep = box.querySelector(':scope .ask-keep');
    if (keep) keep.hidden = !(v === 'khong' && hasValue(box));
}

export function getAsk() {
    return Object.fromEntries(answers);
}

export function setAsk(obj) {
    answers.clear();
    Object.entries(obj || {}).forEach(([k, v]) => { if (v === 'co' || v === 'khong') answers.set(k, v); });
    boxes().forEach(box => {
        paint(box);
        if (box.tagName === 'DETAILS' && answers.get(keyOf(box)) === 'khong') box.open = false;
    });
}

/**
 * @param onChange gọi khi người dùng đổi câu trả lời (để lưu bệnh án)
 * @param autoGrow hàm giãn ô textarea của trang
 */
export function initAsk({ onChange, autoGrow } = {}) {
    onChangeCb = onChange || (() => { });
    growCb = autoGrow || null;
    boxes().forEach(box => { mount(box); paint(box); });

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.ask-b');
        if (!btn) return;
        // Nút nằm trong <summary>, không chặn thì bấm một cái vừa trả lời vừa gập khối
        e.preventDefault();
        e.stopPropagation();
        const box = btn.closest('[data-ask]');
        if (!box) return;
        const k = keyOf(box);
        const v = btn.dataset.v;
        if (answers.get(k) === v) answers.delete(k);
        else answers.set(k, v);

        const now = answers.get(k);
        if (now === 'khong') writeNo(box);
        if (now === 'co') eraseNo(box);
        if (box.tagName === 'DETAILS') box.open = now === 'co' ? true : now === 'khong' ? false : box.open;
        paint(box);
        onChangeCb();
    });

    // Điền thêm vào khối đã trả lời "không" thì nhắc ngay, khỏi để mâu thuẫn nằm im
    document.addEventListener('input', (e) => {
        const box = e.target.closest?.('[data-ask]');
        if (box) paint(box);
    });
}
