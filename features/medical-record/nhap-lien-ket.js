/* =====================================================================
   nhap-lien-ket.js — NHẬP LIỆU NHANH & LIÊN KẾT DỮ KIỆN

   Vì sao tách file: tao-benh-an.js giữ mạch lưu/xuất bản (FIELDS →
   collectRecord → buildModel), tao-benh-an-them.js giữ mấy lối tắt giao
   diện. File này KHÔNG thêm ô nội dung nào cho bệnh án — nó chỉ đổ chữ
   vào những ô đã có, nên không phải đụng FIELDS hay buildModel, và không
   sinh cạnh `no_route_to_output` trong codegraph.

   Mọi lần ghi đều đi qua setField() → dispatch input + change, để tự lưu,
   MIRRORS, bindAuto và thanh phần trăm chạy y như người gõ tay.

   12 thứ trong này:
     NHẬP LIỆU
      1. Đọc chính tả tiếng Việt vào ô đang gõ (Web Speech, không thư viện)
      2. Dán khối chữ → tự chia vào đúng ô, có bảng xác nhận từng ô
      3. Gõ cả dòng sinh hiệu "M 96 HA 120/80 T 38,5" → tách ra 7 ô
      4. Gõ tắt tự bung: ";bn " → "bệnh nhân"; ";;" mở bảng tra
      5. Kho chữ đã gõ của chính mình theo từng ô (bỏ qua ô danh tính)
      6. Hàng ký hiệu y khoa (P) (T) ↑ ↓ → ≈ … cho ô chữ
      7. Ô số nhận dấu phẩy thập phân ("38,5")
      8. Hoàn tác cả một loạt ô vừa được điền tự động (Ctrl + Z)
     LIÊN KẾT
      9. Gõ "@" trong ô chữ → chèn thẳng dữ kiện đã nhập ở mục khác
     10. Thẻ "Nhìn nhanh" dính: dữ kiện chính luôn thấy ở mọi mục, chạm
         một dòng là nhảy về đúng ô gốc
     11. "Dữ kiện chưa dùng": cái đã khám ra mà chưa vào Vấn đề / Biện
         luận, một chạm là đưa xuống
     12. Soi lệch số: chữ viết "mạch 90" mà ô Mạch ghi 110 thì nói ra
   ===================================================================== */
import { showToast } from '../../core/utils.js';
import { fold } from './tim-kiem.js';
import { openListPicker } from './list-picker.js';
import { getCls } from './cls-editor.js';
import { abnormalItems } from './cls-shared.js';
import { NORMAL_EXAM } from './goi-y-nhap.js';
import { goTo, labelOf } from './tao-benh-an-them.js';

const $ = (id) => document.getElementById(id);
const form = $('medical-record-form');
const val = (id) => String($(id)?.value || '').trim();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Ô gõ được chữ (khác select, checkbox, date…) */
const isText = (el) => !!el && (el.tagName === 'TEXTAREA' ||
    (el.tagName === 'INPUT' && /^(text|search|tel|url|email|number|)$/.test(el.type)));

const VITALS = [
    ['Mạch', 'vital-pulse', 'l/p', n => n > 100 || n < 60],
    ['Nhiệt độ', 'vital-temp', '°C', n => n > 37.5 || n < 36],
    ['Huyết áp', 'vital-bp', 'mmHg', null],
    ['Nhịp thở', 'vital-resp', 'l/p', n => n > 20],
    ['SpO2', 'vital-spo2', '%', n => n < 95],
    ['Cân nặng', 'vital-weight', 'kg', null],
    ['Chiều cao', 'vital-height', 'cm', null]
];
const VITAL_LABEL = Object.fromEntries(VITALS.map(([lab, id]) => [id, lab]));

const EXAM_FIELDS = [['Tổng trạng', 'exam-general'], ['Đầu – cổ', 'exam-head'], ['Ngực', 'exam-chest'],
['Tim', 'exam-heart'], ['Phổi', 'exam-lung'], ['Bụng', 'exam-abdomen'],
['Thần kinh – cơ xương khớp', 'exam-neuro-msk']];

/* =====================================================================
   0. GHI VÀO Ô + HOÀN TÁC CẢ LOẠT  (nâng cấp 8)
   Mấy tính năng dưới đây điền một lúc cả chục ô. Điền sai mà phải xóa tay
   từng ô thì không ai dám bấm nữa — nên mọi loạt ghi đều gom lại được
   hoàn tác bằng một nút hoặc Ctrl + Z.
   ===================================================================== */
let batch = null;        // loạt đang gom
let lastBatch = null;    // loạt gần nhất, để hoàn tác

function fire(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
}

function setField(el, v) {
    if (!el || String(el.value) === String(v)) return false;
    batch?.push({ el, old: el.value });
    el.value = v;
    fire(el);
    return true;
}

/** Chạy một loạt ghi rồi bày nút hoàn tác. Trả về số ô đã đổi. */
function runBatch(label, fn) {
    batch = [];
    let items;
    try { fn(); } finally { items = batch; batch = null; }
    if (!items.length) return 0;
    lastBatch = { label, items };
    showUndo(`${label}: ${items.length} ô`);
    return items.length;
}

let undoBar, undoTimer;
function showUndo(text) {
    if (!undoBar) {
        undoBar = document.createElement('div');
        undoBar.className = 'nl-undo hidden';
        undoBar.innerHTML = '<span></span><button type="button"><i class="fas fa-rotate-left"></i> Hoàn tác</button>';
        document.body.appendChild(undoBar);
        undoBar.querySelector('button').addEventListener('click', undoLast);
    }
    undoBar.querySelector('span').textContent = text;
    undoBar.classList.remove('hidden');
    document.body.classList.add('nl-undo-on');   // toast nhường thêm một nấc
    clearTimeout(undoTimer);
    undoTimer = setTimeout(hideUndo, 9000);
}

function hideUndo() {
    undoBar?.classList.add('hidden');
    document.body.classList.remove('nl-undo-on');
}

function undoLast() {
    if (!lastBatch) return;
    [...lastBatch.items].reverse().forEach(({ el, old }) => { el.value = old; fire(el); });
    showToast(`Đã hoàn tác — ${lastBatch.label}`, 'success');
    lastBatch = null;
    hideUndo();
}

document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
    // Đang gõ trong một ô thì để trình duyệt tự hoàn tác từng chữ
    if (isText(e.target) || e.target?.isContentEditable) return;
    if (!lastBatch) return;
    e.preventDefault();
    undoLast();
});

/** Chèn chữ ngay tại con trỏ (giữ nguyên phần đã gõ hai bên) */
function insertAt(el, text) {
    el.focus({ preventScroll: true });
    if (el.selectionStart == null) {          // input type=number không có con trỏ
        el.value = (el.value ? el.value + ' ' : '') + text;
        return fire(el);
    }
    el.setRangeText(text, el.selectionStart, el.selectionEnd, 'end');
    fire(el);
}

/** Thêm một ý vào ô: trống thì đặt, có rồi thì nối (xuống dòng / dấu phẩy) */
function addValue(el, text) {
    const cur = String(el.value || '').trim();
    if (fold(cur).includes(fold(text))) return;
    el.value = !cur ? text : (el.tagName === 'TEXTAREA' ? cur + '\n' + text : cur + ', ' + text);
    fire(el);
}

/* =====================================================================
   1. ĐỌC CẢ DÒNG SINH HIỆU  (nâng cấp 3)
   "M 96 HA 120/80 T 38,5 NT 22 SpO2 94 58kg 162cm" → 7 ô.
   Bộ đọc này dùng chung cho cả ô dán khối chữ ở dưới.
   ===================================================================== */
const numTxt = (s) => String(s).replace(',', '.');

export function parseVitals(raw) {
    const out = {};
    let t = ' ' + fold(raw).replace(/\s+/g, ' ') + ' ';
    /* Huyết áp phải bắt TRƯỚC: bỏ "120/80" ra khỏi chuỗi rồi mới dò số
       khác, không thì 120 bị nhận nhầm thành mạch. */
    const bp = t.match(/(\d{2,3})\s*[\/-]\s*(\d{2,3})/);
    if (bp && +bp[1] >= 50 && +bp[1] <= 300) {
        out['vital-bp'] = `${bp[1]}/${bp[2]}`;
        t = t.replace(bp[0], ' ');
    }

    const grab = (re, id, ok) => {
        if (out[id]) return;
        const m = t.match(re);
        if (!m) return;
        const n = parseFloat(numTxt(m[1]));
        if (isNaN(n) || (ok && !ok(n))) return;
        out[id] = numTxt(m[1]);
        t = t.replace(m[0], ' ');
    };
    grab(/(\d{2,3}(?:[.,]\d)?)\s*kg\b/, 'vital-weight', n => n >= 1 && n <= 300);
    grab(/(\d{2,3})\s*cm\b/, 'vital-height', n => n >= 30 && n <= 230);
    grab(/\b(?:mach|pulse|hr|m)\s*[:=]?\s*(\d{2,3})\b/, 'vital-pulse', n => n >= 20 && n <= 250);
    grab(/\b(?:nhiet do|nhiet|temp|to|t)\s*[:=]?\s*(3\d(?:[.,]\d)?|4[0-3](?:[.,]\d)?)\b/, 'vital-temp');
    grab(/\b(?:nhip tho|tho|rr|nt)\s*[:=]?\s*(\d{1,2})\b/, 'vital-resp', n => n >= 5 && n <= 80);
    grab(/\bspo ?2\s*[:=]?\s*(\d{2,3})\b/, 'vital-spo2', n => n >= 40 && n <= 100);
    grab(/\b(?:can nang|cn)\s*[:=]?\s*(\d{1,3}(?:[.,]\d)?)\b/, 'vital-weight', n => n >= 1 && n <= 300);
    grab(/\b(?:chieu cao|cao|cc)\s*[:=]?\s*(\d{2,3})\b/, 'vital-height', n => n >= 30 && n <= 230);
    return out;
}

function initVitalsLine() {
    const grid = $('vital-pulse')?.closest('.grid');
    if (!grid) return;
    const box = document.createElement('div');
    box.className = 'nl-vq';
    box.setAttribute('data-nocount', '');   // ô phụ trợ, không tính vào %
    box.innerHTML = `
        <i class="fas fa-bolt" aria-hidden="true"></i>
        <input type="text" id="nl-vq-in" autocomplete="off" enterkeyhint="done"
               aria-label="Gõ cả dòng sinh hiệu"
               placeholder="Gõ cả dòng: M 96 HA 120/80 T 38,5 NT 22 SpO2 94 58kg 162cm">
        <button type="button" id="nl-vq-go" class="nl-vq-go">Tách ra</button>
        <span id="nl-vq-hint" class="nl-vq-hint">máy tự tách vào từng ô — Enter là xong</span>`;
    grid.before(box);

    const inp = $('nl-vq-in'), hint = $('nl-vq-hint');
    const preview = () => {
        const got = parseVitals(inp.value);
        const names = Object.entries(got).map(([id, v]) => `${VITAL_LABEL[id]} ${v}`);
        hint.textContent = names.length ? '→ ' + names.join(' · ') : 'máy tự tách vào từng ô — Enter là xong';
        hint.classList.toggle('is-on', !!names.length);
    };
    const apply = () => {
        const got = parseVitals(inp.value);
        const n = runBatch('Tách dòng sinh hiệu',
            () => Object.entries(got).forEach(([id, v]) => setField($(id), v)));
        if (!n) return showToast('Chưa đọc ra số nào — thử "M 96 HA 120/80 T 38,5".', 'warning');
        inp.value = '';
        preview();
        /* Không kèm toast: nút hoàn tác đã nói đủ "điền mấy ô" rồi. Hai thứ cùng
           chớp lên là hai lớp tranh nhau một chỗ ở đáy màn hình. */
    };
    inp.addEventListener('input', preview);
    inp.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        e.stopPropagation();     // chặn luật "Enter = ô kế" của tao-benh-an.js
        apply();
    });
    $('nl-vq-go').addEventListener('click', apply);
}

/* =====================================================================
   2. DÁN KHỐI CHỮ → CHIA VÀO ĐÚNG Ô  (nâng cấp 2)
   Bệnh án giấy, tin nhắn của bạn cùng nhóm, phần mềm khoa phòng… đều là
   một khối "Họ tên: … Tuổi: … Chẩn đoán: …". Trước giờ phải chép tay 15
   lần. Giờ dán một lần, máy chỉ ra sẽ điền ô nào, tick rồi bấm.
   ===================================================================== */
const PARSE_LABELS = [
    [/^(ho( va)? ten|hoten|ten benh nhan|ten bn|benh nhan)$/, 'patient-name'],
    [/^(tuoi)$/, 'patient-age'],
    [/^(nam sinh|ngay sinh|sinh)$/, 'patient-yob'],
    [/^(gioi|gioi tinh|phai|nam ?\/ ?nu)$/, 'patient-gender'],
    [/^(dan toc)$/, 'patient-ethnicity'],
    [/^(nghe nghiep|nghe)$/, 'patient-occupation'],
    [/^(dia chi|noi o|thuong tru|dc)$/, 'patient-address'],
    [/^(nguoi lien he|nguoi nha|than nhan|lien he)$/, 'contact-name'],
    [/^(sdt|so dien thoai|dien thoai|dt)$/, 'contact-phone'],
    [/^(ngay vao vien|ngay nhap vien|vao vien|nhap vien|ngay vv)$/, 'admission-date'],
    [/^(gio vao vien|gio nhap vien|gio vv)$/, 'admission-time'],
    [/^(giuong|so giuong)$/, 'bed-number'],
    [/^(phong|so phong|buong)$/, 'room-number'],
    [/^(benh vien|bv)$/, 'hospital-name'],
    [/^(khoa|khoa phong)$/, 'department-name'],
    [/^(ly do vao vien|ly do nhap vien|ly do den kham|ly do|lddv)$/, 'reason-for-admission'],
    [/^(chan doan|chan doan so bo|chan doan luc vao vien|chan doan tuyen truoc|cd|cdsb)$/, 'dx1-main'],
    [/^(chan doan xac dinh|chan doan ra vien|chan doan sau mo|cdxd)$/, 'dx2-main'],
    [/^(tien can|tien su|tien can noi khoa|benh nen)$/, 'history-internal'],
    [/^(tien can ngoai khoa|da mo|phau thuat cu)$/, 'history-surgery'],
    [/^(di ung)$/, 'history-allergy'],
    [/^(gia dinh|tien can gia dinh)$/, 'history-family'],
    [/^(thoi quen|thoi quen sinh hoat)$/, 'history-habit'],
    [/^(van de|danh sach van de)$/, 'problem-list']
];

/** dd/mm/yyyy hay dd-mm-yyyy → yyyy-mm-dd cho input type=date */
function toISODate(s) {
    const m = String(s).match(/(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const iso = String(s).match(/(\d{4})-(\d{2})-(\d{2})/);
    return iso ? iso[0] : '';
}

function normalize(id, raw) {
    const v = String(raw).trim();
    /* Phải bỏ dấu TRƯỚC rồi mới dò: `\b` của JavaScript chỉ hiểu chữ ASCII,
       nên /\bn[ữu]\b/ KHÔNG khớp "Nữ" — ranh giới sau chữ "ữ" không tồn tại. */
    if (id === 'patient-gender') {
        const g = fold(v);
        return /\bnu\b|female/.test(g) ? 'Nữ' : /\bnam\b|male/.test(g) ? 'Nam' : '';
    }
    if (id === 'patient-yob') return (v.match(/(19|20)\d{2}/) || [''])[0];
    if (id === 'patient-age') return (v.match(/\d{1,3}/) || [''])[0];
    if (id === 'admission-date') return toISODate(v);
    if (id === 'admission-time') {
        const m = v.match(/(\d{1,2})\s*[:h]\s*(\d{2})/);
        return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
    }
    if (id === 'contact-phone') return v.replace(/[^\d+ .]/g, '').trim();
    return v;
}

/** "Tuổi: 47" → {id, value}; không phải nhãn quen thì trả null */
function keyOf(line) {
    const m = line.match(/^\s*[-•*]?\s*([^:：]{2,34})\s*[:：]\s*(.+?)\s*$/);
    if (!m) return null;
    const key = fold(m[1]).replace(/[^a-z0-9 /]+/g, ' ').replace(/\s+/g, ' ').trim();
    const hit = PARSE_LABELS.find(([re]) => re.test(key));
    return hit ? { id: hit[1], value: m[2] } : null;
}

/* Một dòng hay chứa hai mục: "Tuổi: 47 — Giới: Nam". Cắt ở gạch dài / gạch
   đứng, nhưng mẩu nào KHÔNG phải "nhãn quen: giá trị" thì dán trả lại cho mẩu
   trước — không thì địa chỉ có dấu gạch bị cắt cụt mà không ai biết. */
function segments(line) {
    const out = [];
    line.split(/\s+[—–|]\s+/).forEach((p, i) => {
        if (i && !keyOf(p)) out[out.length - 1] += ' — ' + p;
        else out.push(p);
    });
    return out;
}

function parseBlock(raw) {
    const rows = [];
    const push = (id, value) => {
        const el = $(id);
        if (!el || !value || rows.some(r => r.id === id)) return;
        rows.push({ id, value: String(value).trim(), label: labelOf(el), current: String(el.value || '').trim() });
    };

    raw.split('\n').forEach(line => segments(line).forEach(seg => {
        const k = keyOf(seg);
        if (k) push(k.id, normalize(k.id, k.value));
    }));

    /* Vế rời không có nhãn: "62 tuổi", ngày vào viện, và cả dòng sinh hiệu */
    const f = fold(raw);
    const age = f.match(/\b(\d{1,3})\s*tuoi\b/);
    if (age && +age[1] <= 120) push('patient-age', age[1]);
    const nvDate = raw.match(/(?:v[àa]o vi[eệ]n|nh[aậ]p vi[eệ]n)[^\d]{0,12}(\d{1,2}\s*[/\-.]\s*\d{1,2}\s*[/\-.]\s*\d{4})/i);
    if (nvDate) push('admission-date', toISODate(nvDate[1]));
    Object.entries(parseVitals(raw)).forEach(([id, v]) => push(id, v));
    return rows;
}

let pasteEl;
function openPaste() {
    if (!pasteEl) {
        pasteEl = document.createElement('div');
        pasteEl.className = 'nl-modal hidden';
        pasteEl.innerHTML = `
            <div class="nl-bg" data-nl-close></div>
            <div class="nl-panel">
                <div class="nl-head"><i class="fas fa-paste"></i> Dán thông tin bệnh nhân
                    <button type="button" data-nl-close aria-label="Đóng"><i class="fas fa-xmark"></i></button></div>
                <textarea id="nl-paste-in" rows="5" placeholder="Dán vào đây, mỗi dòng một mục:&#10;Họ tên: Nguyễn Văn A&#10;Tuổi: 62 — Giới: Nam&#10;Ngày vào viện: 03/09/2026&#10;Chẩn đoán: Viêm phổi cộng đồng&#10;M 96 HA 130/80 T 38,5 SpO2 93"></textarea>
                <div id="nl-paste-rows" class="nl-rows"></div>
                <div class="nl-foot">
                    <span id="nl-paste-note" class="nl-note">Máy chỉ điền những ô bạn tick.</span>
                    <button type="button" id="nl-paste-ok" class="nl-ok"><i class="fas fa-check"></i> Điền</button>
                </div>
            </div>`;
        document.body.appendChild(pasteEl);
        pasteEl.addEventListener('click', (e) => {
            if (e.target.closest('[data-nl-close]') || e.target.classList.contains('nl-bg'))
                pasteEl.classList.add('hidden');
        });
        $('nl-paste-in').addEventListener('input', renderPasteRows);
        $('nl-paste-ok').addEventListener('click', applyPaste);
    }
    pasteEl.classList.remove('hidden');
    const ta = $('nl-paste-in');
    ta.value = '';
    renderPasteRows();
    ta.focus();
    // Trình duyệt cho đọc bộ nhớ tạm thì dán sẵn luôn, khỏi bắt bấm Ctrl V
    navigator.clipboard?.readText?.().then(t => {
        if (t && !ta.value) { ta.value = t; renderPasteRows(); }
    }).catch(() => { });
}

function renderPasteRows() {
    const rows = parseBlock($('nl-paste-in').value);
    const host = $('nl-paste-rows');
    host.innerHTML = rows.length ? rows.map((r, i) => `
        <label class="nl-row${r.current ? ' is-busy' : ''}">
            <input type="checkbox" data-i="${i}" ${r.current ? '' : 'checked'}>
            <span class="nl-row-lab">${esc(r.label)}</span>
            <b>${esc(r.value)}</b>
            ${r.current ? `<em>đang có: ${esc(r.current.slice(0, 40))}</em>` : ''}
        </label>`).join('')
        : '<p class="nl-empty">Chưa đọc ra mục nào. Mỗi dòng viết kiểu <b>Nhãn: nội dung</b> (Họ tên, Tuổi, Giới, Ngày vào viện, Chẩn đoán…).</p>';
    host._rows = rows;
    $('nl-paste-note').textContent = rows.length
        ? `Đọc ra ${rows.length} mục — ô đang có chữ thì bỏ tick sẵn để khỏi đè.`
        : 'Máy chỉ điền những ô bạn tick.';
}

function applyPaste() {
    const host = $('nl-paste-rows');
    const rows = host._rows || [];
    const picked = [...host.querySelectorAll('input:checked')].map(c => rows[+c.dataset.i]).filter(Boolean);
    if (!picked.length) return showToast('Chưa tick ô nào.', 'warning');
    runBatch('Dán thông tin', () => picked.forEach(r => setField($(r.id), r.value)));
    pasteEl.classList.add('hidden');
    if (picked[0]) goTo($(picked[0].id));
}

/* =====================================================================
   3. GÕ TẮT TỰ BUNG  (nâng cấp 4)
   ";bn " → "bệnh nhân". Gõ ";;" mở bảng tra cả kho, thêm được chữ tắt
   riêng (để trong localStorage, không đẩy lên máy chủ).
   ===================================================================== */
const GO_TAT_SAN = {
    bn: 'bệnh nhân', ba: 'bệnh án', bv: 'bệnh viện', bs: 'bác sĩ',
    nv: 'nhập viện', vv: 'vào viện', xv: 'xuất viện', tkh: 'tái khám',
    cd: 'chẩn đoán', cdsb: 'chẩn đoán sơ bộ', cdpb: 'chẩn đoán phân biệt', cdxd: 'chẩn đoán xác định',
    bl: 'biện luận', tcan: 'tiền căn', tccn: 'triệu chứng cơ năng', tctt: 'triệu chứng thực thể',
    cls: 'cận lâm sàng', ls: 'lâm sàng', dtri: 'điều trị', tdoi: 'theo dõi', dtien: 'diễn tiến',
    ks: 'kháng sinh', ha: 'huyết áp', nth: 'nhịp thở', shieu: 'sinh hiệu', cnang: 'cân nặng',
    cgn: 'chưa ghi nhận', cgnbl: 'chưa ghi nhận bệnh lý', btg: 'bình thường', kbt: 'không bất thường',
    tha: 'tăng huyết áp', dtd: 'đái tháo đường type 2', rlla: 'rối loạn lipid máu',
    copd: 'bệnh phổi tắc nghẽn mạn tính', hpq: 'hen phế quản', shh: 'suy hô hấp',
    nmct: 'nhồi máu cơ tim', hcvc: 'hội chứng vành cấp', stim: 'suy tim',
    tbmmn: 'tai biến mạch máu não', xhth: 'xuất huyết tiêu hóa', vrt: 'viêm ruột thừa',
    xgan: 'xơ gan', stman: 'suy thận mạn', hcth: 'hội chứng thận hư', nkh: 'nhiễm khuẩn huyết',
    rrpn: 'rì rào phế nang', ttt: 'tiếng thổi tâm thu', ndr: 'nhu động ruột',
    pxgx: 'phản xạ gân xương', glsc: 'gan lách sờ không chạm',
    ctm: 'công thức máu', tptnt: 'tổng phân tích nước tiểu', kmdm: 'khí máu động mạch',
    sab: 'siêu âm bụng', xqn: 'X-quang ngực thẳng', ecg: 'điện tâm đồ',
    nsdd: 'nội soi dạ dày – tá tràng', ctsc: 'CT scan',
    ttm: 'truyền tĩnh mạch', tmc: 'tiêm mạch chậm', tdd: 'tiêm dưới da', tbap: 'tiêm bắp'
};
const goTatRieng = () => {
    try { return JSON.parse(localStorage.getItem('baGoTat') || '{}'); } catch { return {}; }
};
const goTatAll = () => ({ ...GO_TAT_SAN, ...goTatRieng() });

function expandAbbrev(el) {
    const caret = el.selectionStart;
    if (caret == null) return false;
    const m = el.value.slice(0, caret).match(/(?:^|[\s(«"'\n])(;([a-z0-9]{1,12}))$/i);
    if (!m) return false;
    const full = goTatAll()[m[2].toLowerCase()];
    if (!full) return false;
    el.setRangeText(full, caret - m[1].length, caret, 'end');
    fire(el);
    return true;
}

function openGoTatBang(el) {
    const rieng = goTatRieng();
    const line = (k, v) => `;${k} → ${v}`;
    openListPicker({
        title: 'Gõ tắt — chạm để chèn; gõ ";từ" rồi dấu cách là tự bung',
        groups: [
            ...(Object.keys(rieng).length
                ? [{ ten: 'Chữ tắt của bạn', icon: 'fa-star', items: Object.entries(rieng).map(([k, v]) => line(k, v)) }]
                : []),
            { ten: 'Có sẵn', icon: 'fa-bolt', items: Object.entries(GO_TAT_SAN).map(([k, v]) => line(k, v)) }
        ],
        onPick: (picked) => {
            const text = String(picked[0] || '').split('→').pop().trim();
            if (text && el) insertAt(el, text);
        }
    });
}

function themGoTat() {
    const k = prompt('Chữ tắt (không dấu, không kèm dấu chấm phẩy), vd: vpcd');
    if (!k) return;
    const v = prompt(`";${k.trim()}" sẽ bung thành gì?`);
    if (!v) return;
    const r = goTatRieng();
    r[k.trim().toLowerCase()] = v.trim();
    localStorage.setItem('baGoTat', JSON.stringify(r));
    showToast(`Đã nhớ ";${k.trim()}" → ${v.trim()}`, 'success');
}

/* =====================================================================
   4. KHO CHỮ ĐÃ GÕ CỦA CHÍNH MÌNH  (nâng cấp 5)
   Sinh viên viết bệnh án thứ mười vẫn gõ lại đúng những câu của bệnh án
   thứ nhất. Nhớ giùm, theo từng ô.
   KHÔNG nhớ ô danh tính (tên, địa chỉ, điện thoại, số giường, ngày giờ)
   — đó là dữ liệu của một bệnh nhân cụ thể, để lẫn sang ca khác là sai.
   ===================================================================== */
const KHONG_NHO = new Set(['patient-name', 'patient-address', 'patient-age', 'patient-yob',
    'contact-name', 'contact-phone', 'bed-number', 'room-number', 'medical-record-id',
    'admission-date', 'admission-time', 'record-datetime', 'nl-vq-in', 'cmdk-q']);

const HIST_KEY = 'baDaGo';
const histAll = () => {
    try { return JSON.parse(localStorage.getItem(HIST_KEY) || '{}'); } catch { return {}; }
};
const histFor = (id) => (histAll()[id] || []);

function remember(el) {
    const id = el.id;
    const v = String(el.value || '').trim();
    if (!id || KHONG_NHO.has(id) || el.type === 'number' || !isText(el)) return;
    if (v.length < 3 || v.length > 160) return;
    const all = histAll();
    all[id] = [v, ...(all[id] || []).filter(x => x !== v)].slice(0, 8);
    try { localStorage.setItem(HIST_KEY, JSON.stringify(all)); } catch { /* hết chỗ thì thôi */ }
}
form?.addEventListener('change', (e) => {
    if (e.target.matches('input, textarea')) remember(e.target);
});

/* =====================================================================
   5. THANH TRỢ NHẬP BÁM Ô ĐANG GÕ
   Một chỗ duy nhất chứa: micro, chèn dữ kiện "@", gõ tắt, chữ đã gõ
   trước, và hàng ký hiệu y khoa.  (nâng cấp 1, 5, 6, 9)
   ===================================================================== */
const KY_HIEU = ['(P)', '(T)', '2 bên', '↑', '↓', '→', '≈', '±', '°C', 'mmHg', 'l/p', 'mg', 'ml', '/ngày'];

const assist = document.createElement('div');
assist.className = 'nl-assist hidden';
document.body.appendChild(assist);
// Bấm nút trên thanh không được cướp con trỏ khỏi ô đang gõ
assist.addEventListener('mousedown', (e) => e.preventDefault());

let curField = null;

function renderAssist() {
    const el = curField;
    if (!el) return;
    const goDuoc = isText(el) && el.type !== 'number';
    const hist = histFor(el.id).filter(v => v !== String(el.value || '').trim()).slice(0, 4);
    const chips = [];
    if (SR) chips.push('<button type="button" class="nl-a-btn nl-mic" data-act="mic"><i class="fas fa-microphone"></i> Đọc</button>');
    if (goDuoc) chips.push('<button type="button" class="nl-a-btn" data-act="fact"><i class="fas fa-link"></i> Dữ kiện @</button>');
    if (goDuoc) chips.push('<button type="button" class="nl-a-btn" data-act="tat"><i class="fas fa-bolt"></i> Gõ tắt</button>');
    hist.forEach(v => chips.push(
        `<button type="button" class="nl-a-old" data-old="${esc(v)}" title="Bạn từng gõ câu này">` +
        `<i class="fas fa-clock-rotate-left"></i> ${esc(v.slice(0, 34))}${v.length > 34 ? '…' : ''}</button>`));
    if (goDuoc) KY_HIEU.forEach(k => chips.push(`<button type="button" class="nl-a-sym" data-sym="${esc(k)}">${esc(k)}</button>`));

    assist.innerHTML = `<span class="nl-a-lab">${esc(String(labelOf(el) || '').slice(0, 26))}</span>`
        + chips.join('')
        + '<button type="button" class="nl-a-x" data-act="close" aria-label="Ẩn thanh"><i class="fas fa-xmark"></i></button>';
}

function showAssist(el) {
    curField = el;
    renderAssist();
    assist.classList.remove('hidden');
}
function hideAssist() {
    if (rec) return;              // đang đọc chính tả thì giữ thanh lại
    assist.classList.add('hidden');
    curField = null;
}

form?.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!el.matches('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea')
        || el.readOnly || el.closest('#ba-settings')) return hideAssist();
    showAssist(el);
});
form?.addEventListener('focusout', () => setTimeout(() => {
    const a = document.activeElement;
    if (!a || !form.contains(a) || !a.matches('input, textarea')) hideAssist();
}, 150));

assist.addEventListener('click', (e) => {
    const el = curField;
    const b = e.target.closest('button');
    if (!b || !el) return;
    if (b.dataset.old) { addValue(el, b.dataset.old); return renderAssist(); }
    if (b.dataset.sym) return insertAt(el, b.dataset.sym + ' ');
    const act = b.dataset.act;
    if (act === 'close') { assist.classList.add('hidden'); curField = null; return; }
    if (act === 'mic') return toggleMic();
    if (act === 'fact') return openFactPicker(el);
    if (act === 'tat') return openGoTatBang(el);
});

/* Bàn phím ảo che mất thanh: bám theo phần màn hình còn nhìn thấy.
   Chỉ đặt bottom bằng tay KHI bàn phím thật sự đang che (iOS thu nhỏ
   visualViewport nhưng giữ nguyên innerHeight). Bàn phím đóng thì XÓA hẳn
   style inline — không thì nó ghim bottom=0 và đè mất thang lớp trong CSS,
   thanh trợ nhập nằm chồng lên thanh Lưu ở máy tính. */
const vv = window.visualViewport;
const placeAssist = () => {
    if (!vv) return;
    const kb = Math.max(0, innerHeight - (vv.height + vv.offsetTop));
    assist.style.bottom = kb > 40 ? (kb + 8) + 'px' : '';
};
vv?.addEventListener('resize', placeAssist);
vv?.addEventListener('scroll', placeAssist);

/* =====================================================================
   6. ĐỌC CHÍNH TẢ  (nâng cấp 1)
   Web Speech API có sẵn trong Chrome/Edge — không thêm thư viện nào.
   Nói "dấu chấm" / "dấu phẩy" / "xuống dòng" để đặt dấu câu.
   ===================================================================== */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const LENH_NOI = [
    [/\bxu[oố]ng d[òo]ng\b/gi, '\n'],
    [/\bd[ấa]u ch[ấa]m ph[ẩa]y\b/gi, '; '],
    [/\bd[ấa]u ch[ấa]m\b/gi, '. '],
    [/\bd[ấa]u ph[ẩa]y\b/gi, ', '],
    [/\bd[ấa]u hai ch[ấa]m\b/gi, ': ']
];
const cleanSpeech = (s) => LENH_NOI.reduce((t, [re, r]) => t.replace(re, r), ' ' + s.trim())
    .replace(/\s+([.,;:])/g, '$1');

let rec = null, recEl = null;
function toggleMic() {
    if (!SR) return showToast('Trình duyệt này chưa đọc chính tả được — mở bằng Chrome hoặc Edge.', 'warning');
    if (rec) return rec.stop();
    recEl = curField;
    if (!recEl) return;
    rec = new SR();
    rec.lang = 'vi-VN';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (ev) => {
        let add = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++)
            if (ev.results[i].isFinal) add += ev.results[i][0].transcript;
        if (add) insertAt(recEl, cleanSpeech(add));
    };
    rec.onerror = (ev) => {
        if (ev.error !== 'aborted' && ev.error !== 'no-speech')
            showToast('Không nghe được (' + ev.error + ').', 'error');
    };
    rec.onend = () => {
        rec = null;
        document.body.classList.remove('nl-mic-on');
        assist.querySelector('.nl-mic')?.classList.remove('is-on');
    };
    try { rec.start(); } catch { rec = null; return; }
    document.body.classList.add('nl-mic-on');
    assist.querySelector('.nl-mic')?.classList.add('is-on');
    showToast('Đang nghe… nói "dấu chấm", "xuống dòng" để đặt dấu câu. Bấm lại để dừng.', 'info', 4000);
}

/* =====================================================================
   7. GÕ TẮT + DẤU PHẨY THẬP PHÂN + "@"  (nâng cấp 4, 7, 9)
   ===================================================================== */
form?.addEventListener('keydown', (e) => {
    const el = e.target;
    /* Ô số: bàn phím tiếng Việt để dấu phẩy ngay tầm tay, mà input
       type=number gặp dấu phẩy là bỏ trắng cả ô. Đổi thành dấu chấm. */
    if (e.key === ',' && el.matches?.('input[type=number]')) {
        e.preventDefault();
        if (!String(el.value).includes('.')) { el.value = el.value + '.'; fire(el); }
        return;
    }
    // ";tat" + dấu cách / dấu câu → bung ra chữ đầy đủ
    if (!isText(el) || el.type === 'number') return;
    if (e.key === ' ' || e.key === '.' || e.key === ',' || e.key === ';' || e.key === 'Enter') {
        if (expandAbbrev(el) && e.key === 'Enter') e.preventDefault();
    }
});

form?.addEventListener('input', (e) => {
    const el = e.target;
    if (!isText(el) || el.type === 'number' || el.selectionStart == null) return;
    const caret = el.selectionStart;
    const before = el.value.slice(0, caret);
    /* Xóa ký tự mồi rồi mới mở bảng. Phải fire() sau khi xóa: setRangeText
       không tự phát sự kiện, không thì người dùng đóng bảng là ô còn lệch
       với bản đã lưu cho tới lần gõ kế. Vòng lặp không xảy ra — lượt sau
       chuỗi trước con trỏ đã hết ";;" / "@". */
    if (before.endsWith(';;')) {
        el.setRangeText('', caret - 2, caret, 'end');
        fire(el);
        return openGoTatBang(el);
    }
    if (before.endsWith('@')) {
        el.setRangeText('', caret - 1, caret, 'end');
        fire(el);
        openFactPicker(el);
    }
});

/* =====================================================================
   8. DỮ KIỆN ĐÃ NHẬP — nguồn chung cho "@" và thẻ Nhìn nhanh
   (nâng cấp 9, 10, 11)
   ===================================================================== */
const splitLines = (v) => String(v || '').split('\n')
    .map(l => l.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, '').trim()).filter(Boolean);

/** Mọi dữ kiện đã có trong bệnh án, kèm chỗ để nhảy về */
function facts() {
    const out = [];
    const add = (text, nhom, tab, field) => {
        if (!text || out.some(x => x.text === text)) return;
        out.push({ text, nhom, tab, field });
    };

    if (val('patient-age')) add(`${val('patient-age')} tuổi`, 'Hành chính', 'hanh-chinh', 'patient-age');
    if (val('patient-gender')) add(val('patient-gender'), 'Hành chính', 'hanh-chinh', 'patient-gender');
    if (val('patient-occupation')) add(val('patient-occupation'), 'Hành chính', 'hanh-chinh', 'patient-occupation');

    VITALS.forEach(([lab, id, u, bad]) => {
        const v = val(id);
        if (!v) return;
        const n = parseFloat(v);
        const bp = id === 'vital-bp' ? (v.match(/(\d{2,3})\s*\/\s*(\d{2,3})/) || []) : [];
        const batThuong = (bad && !isNaN(n) && bad(n))
            || (bp[1] && (+bp[1] >= 140 || +bp[2] >= 90 || +bp[1] < 90));
        add(`${lab} ${v}${u ? ' ' + u : ''}`,
            batThuong ? 'Sinh hiệu bất thường' : 'Sinh hiệu', 'kham-benh', id);
    });

    if (val('hx-sym-name')) add(val('hx-sym-name'), 'Triệu chứng chính', 'lydo-tiensu', 'hx-sym-name');
    splitLines(val('reason-for-admission')).forEach(t => add(t, 'Lý do vào viện', 'lydo-tiensu', 'reason-for-admission'));

    EXAM_FIELDS.forEach(([lab, id]) => {
        const v = val(id);
        if (!v || v === NORMAL_EXAM[id]) return;
        splitLines(v).filter(t => !/^ch[ưu]a ghi nh[ậa]n/i.test(t))
            .forEach(t => add(t, 'Khám — ' + lab, 'kham-benh', id));
    });

    try {
        abnormalItems(getCls()).forEach(i => add(
            `${i.n} ${i.v}${i.u ? ' ' + i.u : ''} ${i.flag === 'high' ? '↑' : '↓'}`,
            'Cận lâm sàng bất thường', 'can-lam-sang', 'cls-host'));
    } catch { /* phiếu CLS chưa dựng xong thì bỏ qua */ }

    splitLines(val('history-internal')).filter(t => !/^ch[ưu]a ghi nh[ậa]n/i.test(t))
        .forEach(t => add(t, 'Tiền căn', 'lydo-tiensu', 'history-internal'));
    splitLines(val('problem-list')).forEach(t => add(t, 'Vấn đề', 'chan-doan-dieu-tri', 'problem-list'));
    if (val('dx1-main')) add(val('dx1-main'), 'Chẩn đoán sơ bộ', 'chan-doan-dieu-tri', 'dx1-main');
    if (val('dx2-main')) add(val('dx2-main'), 'Chẩn đoán xác định', 'ket-luan', 'dx2-main');
    return out;
}

function openFactPicker(el) {
    const list = facts();
    if (!list.length) return showToast('Chưa có dữ kiện nào để chèn — nhập sinh hiệu hoặc khám trước đã.', 'info');
    const groups = [];
    list.forEach(f => {
        let g = groups.find(x => x.ten === f.nhom);
        if (!g) groups.push(g = { ten: f.nhom, icon: 'fa-circle-nodes', items: [] });
        g.items.push(f.text);
    });
    openListPicker({
        title: 'Chèn dữ kiện đã nhập',
        multi: true,
        groups,
        onPick: (picked) => { if (picked.length) insertAt(el, picked.join(', ')); }
    });
}

/* =====================================================================
   9. THẺ "NHÌN NHANH"  (nâng cấp 10, 11, 12)
   Viết biện luận ở mục X mà số đo nằm ở mục VI thì phải nhảy tới nhảy lui.
   Thẻ này dính vào màn hình, mang dữ kiện chính đi khắp 7 mục, và chỉ
   thẳng hai chỗ hay đứt: dữ kiện chưa dùng và số liệu chép lệch.
   ===================================================================== */
const peek = document.createElement('aside');
peek.className = 'nl-peek hidden';
peek.innerHTML = '<div class="nl-peek-head"><i class="fas fa-eye"></i> Nhìn nhanh'
    + '<button type="button" data-peek-close aria-label="Đóng"><i class="fas fa-xmark"></i></button></div>'
    + '<div class="nl-peek-body"></div>';
document.body.appendChild(peek);

peek.addEventListener('click', (e) => {
    if (e.target.closest('[data-peek-close]')) return togglePeek(false);
    const use = e.target.closest('[data-use]');
    if (use) {
        const toVanDe = use.dataset.use === 'vd';
        const target = toVanDe ? $('problem-list') : $('diagnosis-reasoning');
        const text = use.closest('[data-text]').dataset.text;
        runBatch('Đưa xuống ' + (toVanDe ? 'Vấn đề' : 'Biện luận'), () => {
            batch.push({ el: target, old: target.value });
            addValue(target, text);
        });
        return renderPeek();
    }
    const go = e.target.closest('[data-go]');
    if (go) goTo($(go.dataset.go));
});

/* Chưa dùng: dữ kiện đã khám ra mà không thấy bóng dáng ở phần lập luận.
   So bằng "có chữ nào của dữ kiện xuất hiện không" — nới tay như vậy để
   thà bỏ sót còn hơn báo bừa. */
const TU_CHUNG = new Set(['khong', 'chua', 'ghi', 'nhan', 'benh', 'tuoi', 'ben', 'kham', 'thay', 'nhieu']);
function chuaDung(list) {
    const hay = fold([val('problem-list'), val('diagnosis-reasoning'), val('summary'),
    val('dx1-main'), val('dx2-main'), val('treatment-plan')].join(' \n '));
    return list.filter(f => {
        if (!/^(Sinh hiệu bất thường|Khám|Cận lâm sàng bất thường|Triệu chứng chính)/.test(f.nhom)) return false;
        const w = fold(f.text).split(/[^a-z0-9]+/).filter(x => x.length >= 4 && !TU_CHUNG.has(x));
        return w.length && !w.some(x => hay.includes(x));
    }).slice(0, 12);
}

/* Số chép lệch: câu văn ghi một đằng, ô sinh hiệu ghi một nẻo */
const SOI_SO = [
    [/\bmach\s*[:=]?\s*(\d{2,3})/g, 'vital-pulse', 'Mạch'],
    [/\b(?:huyet ap|ha)\s*[:=]?\s*(\d{2,3})\s*\/\s*\d{2,3}/g, 'vital-bp', 'Huyết áp'],
    [/\b(?:nhiet do|nhiet)\s*[:=]?\s*(3\d(?:[.,]\d)?|4[0-3](?:[.,]\d)?)/g, 'vital-temp', 'Nhiệt độ'],
    [/\bspo ?2\s*[:=]?\s*(\d{2,3})/g, 'vital-spo2', 'SpO2'],
    [/\bnhip tho\s*[:=]?\s*(\d{1,2})/g, 'vital-resp', 'Nhịp thở']
];
const SOI_NGUON = ['summary', 'diagnosis-reasoning', 'hx-admit-state', 'adm-note', 'hx-after-admit'];

function soLech() {
    const out = [];
    SOI_NGUON.forEach(src => {
        const raw = val(src);
        if (!raw) return;
        const f = fold(raw);
        SOI_SO.forEach(([re, id, lab]) => {
            const oRaw = val(id);
            if (!oRaw) return;
            const o = id === 'vital-bp' ? (oRaw.match(/\d{2,3}/) || [''])[0] : oRaw;
            for (const m of f.matchAll(re))
                if (parseFloat(numTxt(m[1])) !== parseFloat(numTxt(o)))
                    out.push({ lab, viet: numTxt(m[1]), o, id });
        });
    });
    return out;
}

function renderPeek() {
    if (peek.classList.contains('hidden')) return;
    const list = facts();
    const chinh = list.filter(f => /^(Hành chính|Sinh hiệu bất thường|Chẩn đoán|Triệu chứng chính)/.test(f.nhom));
    const thieu = chuaDung(list);
    const lech = soLech();

    const rowsChinh = chinh.length ? chinh.map(f =>
        `<button type="button" class="nl-pk-item" data-go="${f.field}"><span>${esc(f.nhom)}</span>${esc(f.text)}</button>`).join('')
        : '<p class="nl-pk-empty">Chưa có dữ kiện nào — nhập hành chính và sinh hiệu trước đã.</p>';

    const rowsThieu = thieu.map(f => `
        <div class="nl-pk-gap" data-text="${esc(f.text)}">
            <b data-go="${f.field}">${esc(f.text)}</b>
            <span>${esc(f.nhom)}</span>
            <button type="button" data-use="vd">→ Vấn đề</button>
            <button type="button" data-use="bl">→ Biện luận</button>
        </div>`).join('');

    const rowsLech = lech.map(x => `
        <button type="button" class="nl-pk-warn" data-go="${x.id}"><i class="fas fa-triangle-exclamation"></i>
            Chữ ghi <b>${esc(x.lab)} ${esc(x.viet)}</b> nhưng ô ${esc(x.lab)} là <b>${esc(x.o)}</b></button>`).join('');

    peek.querySelector('.nl-peek-body').innerHTML =
        `<div class="nl-pk-sec">${rowsChinh}</div>`
        + (thieu.length ? `<div class="nl-pk-sec"><h4><i class="fas fa-link-slash"></i> Chưa dùng tới (${thieu.length})</h4>${rowsThieu}</div>` : '')
        + (lech.length ? `<div class="nl-pk-sec"><h4><i class="fas fa-scale-unbalanced"></i> Số chép lệch (${lech.length})</h4>${rowsLech}</div>` : '')
        + (!thieu.length && !lech.length ? '<p class="nl-pk-ok"><i class="fas fa-circle-check"></i> Dữ kiện đã dùng hết, số liệu khớp nhau.</p>' : '');
}

let peekTimer = 0;
form?.addEventListener('input', () => {
    clearTimeout(peekTimer);
    peekTimer = setTimeout(renderPeek, 700);
});

function togglePeek(on) {
    const open = on ?? peek.classList.contains('hidden');
    peek.classList.toggle('hidden', !open);
    /* Tầng 1 chỉ chứa một thứ: mở thẻ này thì đóng khay công cụ, và báo cho CSS
       biết để viên đèn logic nhường chỗ (xem "THANG LỚP NỔI"). */
    if (open) document.body.classList.remove('ba-tools-open');
    document.body.classList.toggle('nl-peek-on', open);
    $('ba-peek')?.classList.toggle('is-on', open);
    localStorage.setItem('baPeek', open ? '1' : '0');
    if (open) renderPeek();
}

/* =====================================================================
   10. GẮN VÀO THANH CÔNG CỤ CÓ SẴN
   ===================================================================== */
const tools = $('ba-tools');
if (tools) {
    tools.insertAdjacentHTML('beforeend',
        '<button type="button" class="ba-tool" id="ba-paste"><i class="fas fa-paste"></i> Dán thông tin</button>'
        + '<button type="button" class="ba-tool" id="ba-peek"><i class="fas fa-eye"></i> Nhìn nhanh</button>'
        + '<button type="button" class="ba-tool" id="ba-tat"><i class="fas fa-bolt"></i> Thêm gõ tắt</button>');
    $('ba-paste').addEventListener('click', openPaste);
    $('ba-peek').addEventListener('click', () => togglePeek());
    $('ba-tat').addEventListener('click', themGoTat);
}

initVitalsLine();
if (localStorage.getItem('baPeek') === '1') togglePeek(true);
