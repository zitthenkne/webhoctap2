/* =====================================================================
   mach-benh-an.js — MẠCH LIÊN KẾT CỦA BỆNH ÁN (2026-09-06)

   Cùng tầng với nhap-lien-ket.js và toan-canh.js: KHÔNG thêm ô nội dung
   nào, chỉ đọc DOM + các module đã có; khi ghi thì ghi vào ô có sẵn qua
   fire() (dispatch cả input lẫn change). Nên không phải đụng FIELDS /
   buildModel và không sinh cạnh no_route_to_output trong codegraph.

   Vì sao có file này: trang đã có bản đồ mạng 5 cột (lien-ket-map) và màn
   Toàn cảnh, nhưng cả hai đều là ẢNH CHỤP cả bệnh án. Cái còn thiếu là đi
   theo MỘT dữ kiện, đi theo MỘT trục thời gian, và biết việc nào đáng làm
   trước. Sáu thứ trong này:

     1. SỢI DỮ KIỆN — bôi đen một đoạn chữ bất kỳ, máy chỉ ra nó đang nằm
        ở những ô nào của cả bệnh án và CÒN THIẾU ở mục nào; một chạm là
        chèn xuống mục đang thiếu.
     2. DÒNG THỜI GIAN HỢP NHẤT — mọi mốc thời gian của cả bệnh án (khởi
        bệnh, mốc bệnh sử, nhập viện, mổ, kết quả CLS, đi buồng) trên MỘT
        trục, kèm phép soi mâu thuẫn ngày giờ.
     3. VIỆC TIẾP THEO — xếp theo mức quan trọng lâm sàng chứ không theo
        thứ tự ô trên trang như nút "Ô còn trống".
     4. CÂU HỎI BẢO VỆ BỆNH ÁN — sinh từ chính chỗ hở của bệnh án: thầy sẽ
        hỏi gì, và bấm một cái là nhảy tới ô phải bổ sung.
     5. TÌM & THAY THẾ TOÀN BỆNH ÁN — sửa một chữ ở mọi mục cùng lúc, xem
        trước từng chỗ, hoàn tác được.
     6. BẢN VĂN XUÔI BẤM ĐƯỢC — bấm một câu trong bản xem trước là nhảy
        về đúng ô đã sinh ra câu đó (đường đi ngược của buildModel).
   ===================================================================== */
import { showToast } from '../../core/utils.js';
import { fold } from './tim-kiem.js';
import { goTo, labelOf } from './tao-benh-an-them.js';
import { buildNetwork } from './lien-ket-map.js';
import { validateRecord } from './clinical-validator.js';
import { getBienLuan } from './bien-luan-editor.js';
import { getRx } from './rx-editor.js';
import { getSteps, stepLabel } from './benh-su-editor.js';
import { getCls } from './cls-editor.js';
import { abnormalItems } from './cls-shared.js';

const $ = (id) => document.getElementById(id);
const form = $('medical-record-form');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const val = (id) => String($(id)?.value || '').trim();
const trim = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/* Ghi vào ô: phải dispatch CẢ input LẪN change, thiếu change là MIRRORS và
   bindAuto của tao-benh-an.js không chạy (xem BAN-DO-DU-LIEU.md). */
function fire(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
}

const TAB_TEN = {};
document.querySelectorAll('.tab-link').forEach(l => {
    TAB_TEN[l.dataset.tab] = trim(l.querySelector('.tab-text')?.textContent);
});
const tabOf = (el) => el?.closest('.tab-content')?.id || '';
const tabTen = (id) => TAB_TEN[id] || 'Bệnh án';

/* Ô nội dung của bệnh án — bỏ ô cài đặt phiên và ô chỉ để bấm/tìm. */
const BO_QUA = new Set(['cmdk-q', 'medical-record-id', 'stu-name', 'stu-id', 'stu-class', 'stu-no']);
function oNoiDung() {
    if (!form) return [];
    return [...form.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea')]
        .filter(el => !BO_QUA.has(el.id) && !el.closest('#ba-settings')
            && !el.disabled && !el.readOnly && String(el.value || '').trim());
}

/* Mục nào là "đích đến" của một dữ kiện: khám ra rồi thì phải chảy xuống
   đây, không thì dữ kiện chết tại mục khám. Thứ tự = thứ tự trong bệnh án. */
const DICH = [
    ['summary', 'VII. Tóm tắt bệnh án'],
    ['problem-list', 'VIII. Đặt vấn đề'],
    ['dx1-main', 'IX. Chẩn đoán sơ bộ'],
    ['diagnosis-reasoning', 'X. Biện luận chẩn đoán'],
    ['labs-proposed', 'XI. Cận lâm sàng đề nghị'],
    ['dx2-main', 'XIII. Chẩn đoán xác định'],
    ['treatment-plan', 'XIV. Hướng điều trị']
];

/* Đi tới một ô từ bảng Trạm — cửa DUY NHẤT, đừng gọi goTo() thẳng ở đây.

   Bấm "Bổ sung ngay" mà `field` trỏ vào một id không có thật thì trước đây
   TUYỆT ĐỐI không có gì xảy ra: bảng không đóng, trang không nhảy, không một
   dòng báo. Người dùng chỉ thấy nút chết. Đúng cái bẫy đã ghi trong
   BAN-DO-DU-LIEU.md cho clinical-validator, nay chặn ở một chỗ:
     - không có id  -> nói ra kèm tên id, để còn biết đường sửa
     - có id nhưng đang ẩn (mục đặc thù của loại bệnh án khác) -> cũng nói ra,
       vì cuộn tới một ô display:none thì nhìn cũng như không có gì xảy ra. */
function diToi(field) {
    const el = field && $(field);
    if (!el) {
        showToast(field
            ? `Chưa tới được: trang không có ô “${field}”.`
            : 'Việc này không gắn với một ô cụ thể — xem ở mục liên quan.', 'warning');
        return false;
    }
    dongTram();
    goTo(el);
    /* goTo đổi tab rồi mới cuộn ở nhịp 260ms — đợi qua nhịp đó mới đo được ẩn/hiện */
    setTimeout(() => {
        if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') {
            showToast(`Ô “${labelOf(el)}” đang ẩn — mục này chỉ hiện với loại bệnh án khác.`, 'warning');
        }
    }, 400);
    return true;
}

/* =====================================================================
   1. SỢI DỮ KIỆN
   ===================================================================== */

/** Rút cụm chữ đáng đi soi từ một đoạn: bỏ đầu dòng đánh số, bỏ dấu câu thừa */
function chuanCum(s) {
    return trim(String(s || '')).replace(/^[-•*\d.)\s]+/, '').replace(/[.;,:]+$/, '').slice(0, 60);
}

/** Tìm mọi ô đang chứa cụm chữ này. So bằng chữ đã bỏ dấu để "sot" ra "Sốt". */
function timSoi(cum) {
    const q = fold(chuanCum(cum));
    if (q.length < 3) return [];
    return oNoiDung().map(el => {
        const v = String(el.value);
        if (!fold(v).includes(q)) return null;
        /* Trích đúng DÒNG chứa cụm — ô khám dài 8 dòng thì đọc cả ô là vô ích */
        const dong = v.split('\n').find(d => fold(d).includes(q)) || v;
        return { el, tab: tabOf(el), ten: labelOf(el), trich: trim(dong).slice(0, 120) };
    }).filter(Boolean);
}

let soiCum = '';
const soiPanel = document.createElement('div');
soiPanel.id = 'soi-panel';
soiPanel.className = 'soi hidden';
soiPanel.innerHTML = `
    <div class="soi-head">
        <i class="fas fa-share-nodes"></i>
        <input id="soi-q" type="search" autocomplete="off" placeholder="Dữ kiện muốn đi theo…">
        <button type="button" id="soi-close" aria-label="Đóng"><i class="fas fa-xmark"></i></button>
    </div>
    <div class="soi-body" id="soi-body"></div>`;
document.body.appendChild(soiPanel);

const soiBtn = document.createElement('button');
soiBtn.type = 'button';
soiBtn.id = 'soi-btn';
soiBtn.className = 'soi-btn hidden';
soiBtn.innerHTML = '<i class="fas fa-share-nodes"></i> Soi sợi';
document.body.appendChild(soiBtn);

function veSoi() {
    const body = $('soi-body');
    const cum = chuanCum(soiCum);
    if (fold(cum).length < 3) {
        body.innerHTML = `<p class="soi-empty">Bôi đen một dấu chứng bất kỳ trong bệnh án — hoặc gõ vào ô trên —
            rồi máy chỉ ra nó đang nằm ở những mục nào và còn thiếu ở đâu.</p>`;
        return;
    }
    const hits = timSoi(cum);
    const tabs = new Set(hits.map(h => h.tab));
    const thieu = DICH.filter(([id]) => {
        const el = $(id);
        return el && !fold(String(el.value || '')).includes(fold(cum));
    });

    body.innerHTML = `
        <div class="soi-sum">
            <b>${esc(cum)}</b>
            <span>${hits.length} chỗ · ${tabs.size} mục</span>
        </div>
        <div class="soi-sec"><i class="fas fa-location-dot"></i> Đang có ở</div>
        ${hits.length ? hits.map((h, i) => `
            <button type="button" class="soi-row" data-i="${i}">
                <span class="soi-tab">${esc(tabTen(h.tab))}</span>
                <b>${esc(h.ten)}</b>
                <span class="soi-trich">${esc(h.trich)}</span>
            </button>`).join('')
            : `<p class="soi-empty">Chưa ô nào trong bệnh án chứa cụm này.</p>`}
        <div class="soi-sec"><i class="fas fa-link-slash"></i> Chưa nhắc tới ở
            <span class="soi-n">${thieu.length}</span></div>
        ${thieu.length ? thieu.map(([id, ten]) => `
            <div class="soi-gap">
                <span>${esc(ten)}</span>
                <button type="button" class="soi-add" data-add="${id}"><i class="fas fa-arrow-turn-down"></i> Chèn xuống</button>
            </div>`).join('')
            : `<p class="soi-ok"><i class="fas fa-circle-check"></i> Dữ kiện này đã đi hết chuỗi — khám ra, đặt vấn đề, biện luận, điều trị.</p>`}`;

    body.querySelectorAll('.soi-row').forEach(b => b.addEventListener('click', () => {
        goTo(hits[+b.dataset.i].el);
    }));
    body.querySelectorAll('.soi-add').forEach(b => b.addEventListener('click', () => {
        const el = $(b.dataset.add);
        if (!el) return;
        const cu = String(el.value).trim();
        const noi = el.tagName === 'TEXTAREA' ? '\n' : '; ';
        el.value = cu ? cu + noi + cum : cum;
        fire(el);
        goTo(el);
        showToast(`Đã chèn “${cum}” xuống ${labelOf(el)}.`, 'success');
        veSoi();
    }));
}

function moSoi(cum) {
    soiCum = cum || soiCum;
    $('soi-q').value = chuanCum(soiCum);
    soiPanel.classList.remove('hidden');
    document.body.classList.add('soi-on');
    veSoi();
}
const dongSoi = () => {
    soiPanel.classList.add('hidden');
    document.body.classList.remove('soi-on');
};

$('soi-close').addEventListener('click', dongSoi);
$('soi-q').addEventListener('input', (e) => { soiCum = e.target.value; veSoi(); });
/* Bấm nút nổi mà không chặn mousedown là ô đang gõ mất con trỏ trước khi click chạy */
soiBtn.addEventListener('mousedown', e => e.preventDefault());
soiBtn.addEventListener('click', () => { soiBtn.classList.add('hidden'); moSoi(soiBtn.dataset.cum); });

const laO = (el) => !!el && (el.tagName === 'TEXTAREA'
    || (el.tagName === 'INPUT' && /^(text|search|)$/i.test(el.type || 'text')))
    && !!el.closest('#medical-record-form');

function capNhatNutSoi() {
    const el = document.activeElement;
    if (!laO(el) || !soiPanel.classList.contains('hidden')) return soiBtn.classList.add('hidden');
    const s = String(el.value || '').slice(el.selectionStart, el.selectionEnd).trim();
    if (s.length < 3 || s.length > 60) return soiBtn.classList.add('hidden');
    const r = el.getBoundingClientRect();
    soiBtn.dataset.cum = s;
    soiBtn.style.left = Math.max(8, Math.min(r.right - 110, window.innerWidth - 118)) + 'px';
    soiBtn.style.top = (r.top > 56 ? r.top - 38 : r.bottom + 8) + 'px';
    soiBtn.classList.remove('hidden');
}
/* selectionchange là đường chính; mouseup/keyup là đường vòng cho trình duyệt
   không bắn selectionchange trên <input> (Safari cũ). */
document.addEventListener('selectionchange', capNhatNutSoi);
document.addEventListener('mouseup', capNhatNutSoi);
document.addEventListener('keyup', (e) => { if (e.shiftKey || e.key === 'Shift') capNhatNutSoi(); });
document.addEventListener('scroll', () => soiBtn.classList.add('hidden'), true);

/* =====================================================================
   2. DÒNG THỜI GIAN HỢP NHẤT
   ===================================================================== */
const GIO = { 'giờ': 1, 'ngày': 24, 'tuần': 168, 'tháng': 720 };

/** Ngày tuyệt đối của một mốc bệnh sử, quy từ ngày nhập viện */
function ngayCuaMoc(m, admit) {
    if (!admit) return null;
    const base = new Date(admit + 'T00:00:00');
    if (m.phase === 'nv') return base;
    const n = parseFloat(String(m.n || '').replace(',', '.'));
    if (!isFinite(n)) return null;
    const gio = (GIO[m.u] || 24) * n;
    return new Date(base.getTime() + (m.phase === 'sau' ? gio : -gio) * 3600000);
}

const dmy = (d) => d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : '';
const hm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/**
 * Gom mọi mốc thời gian của cả bệnh án.
 * Ô ngày lấy bằng cách quét thẳng `input[type=date|datetime-local]` chứ không
 * liệt kê tay: bảng CLS và bảng theo dõi sinh ô lúc chạy, liệt kê tay là sót.
 */
function docThoiGian() {
    if (!form) return [];
    const admit = val('admission-date');
    const out = [];
    const them = (o) => { if (o.t || o.thu) out.push(o); };

    form.querySelectorAll('input[type=date], input[type=datetime-local]').forEach(el => {
        const v = String(el.value || '').trim();
        /* Ngày vào viện đã có mốc "NHẬP VIỆN" riêng ở dưới — quét thêm lần nữa
           là trục mọc hai hàng trùng nhau ngay cùng một ngày. */
        if (!v || el.id === 'admission-date' || el.closest('#ba-settings')) return;
        const t = new Date(v.length > 10 ? v : v + 'T00:00:00');
        if (isNaN(t)) return;
        let ten = labelOf(el);
        let loai = 'o';
        /* Ô ngày của thẻ CLS / dòng theo dõi không có nhãn riêng — lấy tên thẻ */
        if (el.classList.contains('cls-c-dt')) {
            loai = 'cls';
            ten = 'Kết quả ' + trim(el.closest('.cls-card')?.querySelector('.cls-c-name')?.value || 'cận lâm sàng');
        } else if (el.classList.contains('td-dt')) {
            loai = 'td';
            ten = 'Đi buồng';
        }
        them({ t, ten, tab: tabOf(el), el, loai });
    });

    getSteps().forEach(m => {
        const t = ngayCuaMoc(m, admit);
        const sub = trim(String(m.s || '').replace(/\s*;\s*/g, ' · ')).slice(0, 90);
        them({
            t, thu: !t, ten: stepLabel(m), sub, loai: 'moc',
            tab: 'lydo-tiensu', el: $('hx-list') || $('hx-onset-date')
        });
    });

    if (admit) {
        const t = new Date(admit + 'T' + (val('admission-time') || '00:00'));
        if (!isNaN(t)) them({ t, ten: 'NHẬP VIỆN', loai: 'nv', tab: 'hanh-chinh', el: $('admission-date') });
    }

    return out.sort((a, b) => (a.t ? a.t.getTime() : Infinity) - (b.t ? b.t.getTime() : Infinity));
}

/** Mâu thuẫn ngày giờ — thứ không ô nào tự báo được vì chúng ở 4 mục khác nhau */
function soiThoiGian(items) {
    const canh = [];
    const admit = val('admission-date') ? new Date(val('admission-date') + 'T00:00:00') : null;
    const onset = val('hx-onset-date') ? new Date(val('hx-onset-date') + 'T00:00:00') : null;
    const nay = new Date();

    if (admit && onset && onset > admit)
        canh.push({ m: 'Ngày khởi bệnh nằm SAU ngày nhập viện — một trong hai ô đang gõ nhầm.', el: $('hx-onset-date') });
    items.forEach(i => {
        if (!i.t) return;
        if (i.t > nay && i.loai !== 'moc')
            canh.push({ m: `“${i.ten}” đang ghi ngày ở tương lai (${dmy(i.t)}).`, el: i.el });
        else if (admit && i.t < admit && (i.loai === 'td' || i.loai === 'cls'))
            canh.push({ m: `“${i.ten}” (${dmy(i.t)}) sớm hơn ngày nhập viện — của lần nằm viện này thì không thể có trước.`, el: i.el });
        else if (onset && i.t < onset && (i.loai === 'td' || i.loai === 'cls'))
            canh.push({ m: `“${i.ten}” (${dmy(i.t)}) sớm hơn ngày khởi bệnh.`, el: i.el });
    });
    const mocThu = items.filter(i => i.thu).length;
    if (mocThu) canh.push({ m: `${mocThu} mốc bệnh sử chưa xếp được lên trục — thiếu ngày nhập viện hoặc mốc chưa ghi số.`, el: $('admission-date') });
    return canh;
}

const TL_ICON = { nv: 'fa-hospital', cls: 'fa-vials', td: 'fa-clipboard-list', moc: 'fa-wave-square', o: 'fa-calendar-day' };

function veThoiGian(items, canh) {
    if (!items.length) return `<p class="mach-empty"><i class="fas fa-clock"></i>
        Chưa có mốc thời gian nào. Nhập ngày vào viện và các mốc bệnh sử là trục hiện ra.</p>`;

    const nhom = [];
    items.forEach(i => {
        const k = i.t ? dmy(i.t) : 'Chưa xếp được lên trục';
        let g = nhom.find(x => x.k === k);
        if (!g) { g = { k, list: [] }; nhom.push(g); }
        g.list.push(i);
    });

    return `
        ${canh.length ? `<div class="mach-warn"><b><i class="fas fa-triangle-exclamation"></i> ${canh.length} chỗ lệch thời gian</b>
            ${canh.map((c, i) => `<button type="button" class="mach-warn-row" data-go="${i}">${esc(c.m)}</button>`).join('')}
        </div>` : `<p class="mach-ok"><i class="fas fa-circle-check"></i> Các mốc thời gian khớp nhau.</p>`}
        <div class="tl">
            ${nhom.map(g => `
                <div class="tl-day"><span>${esc(g.k)}</span></div>
                ${g.list.map(i => `
                    <button type="button" class="tl-row tl-${i.loai}" data-tl="${items.indexOf(i)}">
                        <i class="fas ${TL_ICON[i.loai] || 'fa-circle'}"></i>
                        <span class="tl-time">${i.t && i.loai !== 'moc' ? hm(i.t) : ''}</span>
                        <b>${esc(i.ten)}</b>
                        ${i.sub ? `<span class="tl-sub">${esc(i.sub)}</span>` : ''}
                    </button>`).join('')}`).join('')}
        </div>`;
}

/* =====================================================================
   3. VIỆC TIẾP THEO  &  4. CÂU HỎI BẢO VỆ
   Cả hai đọc CHUNG một lần rà: mạng lưới liên kết + bộ luật lâm sàng.
   ===================================================================== */
const BAT_BUOC = [
    ['patient-name', 'Họ tên bệnh nhân'], ['patient-age', 'Tuổi'], ['patient-gender', 'Giới tính'],
    ['admission-date', 'Ngày vào viện'], ['reason-for-admission', 'Lý do vào viện']
];
const LOI_CHINH = [
    ['summary', 'Tóm tắt bệnh án (VII)'], ['problem-list', 'Đặt vấn đề (VIII)'],
    ['dx1-main', 'Chẩn đoán sơ bộ (IX)'], ['labs-proposed', 'Cận lâm sàng đề nghị (XI)'],
    ['treatment-plan', 'Hướng điều trị (XIV)'], ['prognosis', 'Tiên lượng (XV)']
];

/* Một lần rà dùng cho cả ba khung; rà lại tốn ~30ms nên nhớ trong 1,5 giây. */
let raCache = null, raLuc = 0;
function raSoat() {
    if (raCache && Date.now() - raLuc < 1500) return raCache;
    let alerts = [];
    try { alerts = validateRecord({ bienLuan: getBienLuan(), rx: getRx() }); }
    catch (e) { console.warn('mach: rà luật lỗi', e); }
    let net = { nodes: [], edges: [], breaks: [] };
    try { net = buildNetwork(); } catch (e) { console.warn('mach: dựng mạng lỗi', e); }
    raCache = { alerts, net };
    raLuc = Date.now();
    return raCache;
}

function dsViec() {
    const { alerts, net } = raSoat();
    const viec = [];
    const them = (uu, icon, tieu, vi, field) => viec.push({ uu, icon, tieu, vi, field });

    BAT_BUOC.forEach(([id, ten]) => {
        if (!val(id)) them(0, 'fa-id-card', `Điền ${ten}`, 'Ô bắt buộc — thiếu là bản xuất không đứng tên ai.', id);
    });
    alerts.filter(a => a.severity === 'HIGH').forEach(a =>
        them(1, 'fa-triangle-exclamation', a.title, a.message, a.targetField));
    net.breaks.filter(n => n.col === 'dukien').forEach(n =>
        them(2, 'fa-link-slash', `Dữ kiện chưa dùng: ${n.text}`, 'Đã khám ra nhưng chưa vào Đặt vấn đề hay Biện luận.', n.field));
    net.breaks.filter(n => n.col !== 'dukien').forEach(n =>
        them(3, 'fa-diagram-project', n.text, n.warn, n.field));
    alerts.filter(a => a.severity === 'MEDIUM').forEach(a =>
        them(4, 'fa-circle-exclamation', a.title, a.message, a.targetField));
    LOI_CHINH.forEach(([id, ten]) => {
        if (!val(id)) them(5, 'fa-pen', `Viết ${ten}`, 'Mục lõi của bệnh án còn trống.', id);
    });
    alerts.filter(a => a.severity === 'LOW').forEach(a =>
        them(6, 'fa-circle-info', a.title, a.message, a.targetField));

    return viec.sort((a, b) => a.uu - b.uu);
}

const MUC_VIEC = ['Phải có', 'Nguy hiểm nếu bỏ qua', 'Dữ kiện đang rơi', 'Mạch còn đứt',
    'Nên xem lại', 'Còn trống', 'Có thì tốt'];

function veViec(list) {
    if (!list.length) return `<p class="mach-ok"><i class="fas fa-champagne-glasses"></i>
        Không còn việc nào đáng làm trước — bệnh án đủ ý và các mạch đã nối.</p>`;
    let mucCu = -1;
    return `<p class="mach-lead">Xếp theo mức quan trọng lâm sàng, không theo thứ tự ô trên trang.
        <b>${list.length} việc</b> — làm từ trên xuống.</p>` +
        list.slice(0, 24).map((v, i) => {
            let head = '';
            if (v.uu !== mucCu) { mucCu = v.uu; head = `<div class="mach-sec u${v.uu}">${MUC_VIEC[v.uu]}</div>`; }
            return head + `<button type="button" class="viec" data-viec="${i}">
                <i class="fas ${v.icon}"></i>
                <span class="viec-txt"><b>${esc(v.tieu)}</b><small>${esc(v.vi || '')}</small></span>
                ${v.field ? '<span class="viec-go">Làm ngay <i class="fas fa-arrow-right"></i></span>' : ''}
            </button>`;
        }).join('');
}

/* --------------------------------------------------------- câu hỏi thầy
   Bản đầu nhét mọi thứ vào MỘT dòng chữ dài — đọc ra một đoạn văn chứ không
   ra được "thầy hỏi gì" và "vì sao mình bị hỏi". Nay mỗi câu là một THẺ ba tầng:

     hỏi   đúng một câu, ngắn, đọc lên thành tiếng được
     vì    chỗ hở nào trong bệnh án đẻ ra câu đó
     thêm  mấy ý thầy sẽ vặn tiếp

   Thêm NHÓM (mục nào của bệnh án) để lọc, mức chắc để xếp, và dấu "trả lời
   được" nhớ theo từng bệnh án.

   Cảnh báo thô của clinical-validator KHÔNG còn nhét vào đây: đó là chữ máy
   báo lỗi, đọc không ra câu hỏi — và chúng đã nằm nguyên ở khung Việc tiếp
   theo rồi, để cả hai chỗ là đọc hai lần cùng một thứ.
*/
const NHOM = {
    benhsu: ['Bệnh sử', 'fa-timeline'],
    kham: ['Khám', 'fa-stethoscope'],
    vande: ['Đặt vấn đề', 'fa-list-check'],
    chandoan: ['Chẩn đoán', 'fa-diagnoses'],
    cls: ['Cận lâm sàng', 'fa-vials'],
    dieutri: ['Điều trị', 'fa-prescription-bottle-medical'],
    tienluong: ['Tiên lượng', 'fa-chart-line']
};

const HOI_CHO_DUT = {
    dukien: n => ({
        nhom: 'vande', hoi: `“${n.text}” ủng hộ vấn đề nào?`,
        vi: 'Bạn khám ra dấu chứng này nhưng chưa dùng ở mục VIII hay mục X.',
        them: ['Nếu không dùng thì vì sao lại ghi vào bệnh án?']
    }),
    vande: n => ({
        nhom: 'vande', hoi: `“${n.text}” là do nguyên nhân gì?`,
        vi: 'Vấn đề này chưa có nhánh nguyên nhân nào ở mục X.',
        them: ['Kể ít nhất ba hướng.', 'Xếp thứ tự hướng nào nghĩ tới trước.']
    }),
    chandoan: n => /lý do/.test(n.warn || '')
        ? {
            nhom: 'chandoan', hoi: `Vì sao bạn nghĩ tới “${n.text}”?`,
            vi: 'Nhánh này chưa ghi lý do biện luận.',
            them: ['Dấu chứng nào ủng hộ?', 'Dấu chứng nào KHÔNG phù hợp mà bạn vẫn giữ hướng này?']
        }
        : {
            nhom: 'cls', hoi: `Cận lâm sàng nào chốt được “${n.text}”?`,
            vi: 'Nhánh này chưa có cận lâm sàng phân định.',
            them: ['Kết quả thế nào thì bạn bỏ hướng này?']
        },
    cls: n => ({
        nhom: 'cls', hoi: `Bạn đề nghị “${n.text}” để tìm gì?`,
        vi: 'Dòng đề nghị này chưa ghi mục đích.',
        them: ['Kết quả ra sao thì đổi xử trí?']
    }),
    dieutri: n => ({
        nhom: 'dieutri', hoi: `“${n.text}” dùng cho vấn đề nào?`,
        vi: 'Thuốc này chưa khớp với chẩn đoán nào đang ghi trong bệnh án.',
        them: ['Liều, đường dùng, thời gian bao lâu?']
    })
};

/* Bốn chỗ khai thác bệnh sử mà sinh viên hay bị hỏi hụt. Dò trên chữ đã bỏ
   dấu nên \b chạy được; nhưng phải né đồng âm: "ho" ăn vào "hô hấp",
   "dau" ăn vào "dấu chứng" — nên "đau" phải đi kèm tên bộ phận. */
const KHAI_THAC = [
    {
        co: /\bsot\b|sot cao|sot nhe/, chua: /lanh run|ret run|gai lanh|sot ve chieu/,
        nhom: 'benhsu', hoi: 'Sốt kiểu gì?',
        vi: 'Bệnh án có sốt nhưng chưa ghi tính chất cơn sốt.',
        them: ['Bao nhiêu độ, đo lúc nào?', 'Có lạnh run không?', 'Sốt liên tục hay từng cơn, vào giờ nào?'],
        field: 'hx-sym-char'
    },
    {
        co: /dau (bung|nguc|dau|lung|hong|khop|co|vai|chan|tay|thuong vi|ha suon|rang|tai|mat)/,
        chua: /lan (len|xuong|ra|sang)|kieu dau|am i|quan that|nhoi|tang khi|giam khi|diem dau/,
        nhom: 'benhsu', hoi: 'Đau kiểu gì và lan đi đâu?',
        vi: 'Bệnh án có đau nhưng chưa mô tả tính chất và hướng lan.',
        them: ['Âm ỉ hay quặn từng cơn?', 'Tăng giảm khi làm gì?', 'Thang điểm mấy trên 10?'],
        field: 'hx-sym-char'
    },
    {
        co: /\bho\b(?! hap)/, chua: /ho khan|ho dam|ho ra mau|dam (trang|vang|xanh|mau)/,
        nhom: 'benhsu', hoi: 'Ho khan hay ho đàm?',
        vi: 'Bệnh án có ho nhưng chưa ghi khan hay có đàm.',
        them: ['Đàm màu gì, lượng bao nhiêu?', 'Có ho ra máu không?'],
        field: 'hx-sym-char'
    },
    {
        co: /kho tho/, chua: /gang suc|khi nam|ve dem|mmrc|nyha|do \d/,
        nhom: 'benhsu', hoi: 'Khó thở mức nào?',
        vi: 'Bệnh án có khó thở nhưng chưa xếp được mức độ.',
        them: ['Khi gắng sức hay cả lúc nghỉ?', 'Nằm có khó thở hơn không?', 'Xếp mMRC / NYHA mấy?'],
        field: 'hx-sym-severity'
    }
];

const hoiId = (s) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);

function dsCauHoi() {
    const { net } = raSoat();
    const hoi = [];
    const them = (chac, o) => {
        if (!o?.hoi || hoi.some(h => h.hoi === o.hoi)) return;
        hoi.push({ chac, them: [], vi: '', nhom: 'chandoan', ...o, id: hoiId(o.hoi) });
    };

    /* Dữ kiện rơi thường ra cả nắm (đủ bộ sinh hiệu bất thường) và câu hỏi cho
       từng cái giống hệt nhau — gộp lại một thẻ, đọc mới ra vấn đề. */
    const roi = net.breaks.filter(n => n.col === 'dukien');
    if (roi.length >= 3) {
        them(1, {
            nhom: 'vande', hoi: `${roi.length} dấu chứng này ủng hộ vấn đề nào?`,
            vi: 'Bạn đã khám ra nhưng chưa cái nào vào mục VIII hay mục X.',
            them: roi.slice(0, 8).map(n => n.text), field: 'problem-list'
        });
    }
    net.breaks.forEach(n => {
        if (n.col === 'dukien' && roi.length >= 3) return;
        const f = HOI_CHO_DUT[n.col];
        if (f) them(1, { ...f(n), field: n.field });
    });

    const dx = [val('dx2-main'), val('dx1-main'), val('final-diagnosis'), val('provisional-diagnosis')]
        .find(Boolean);
    if (dx) {
        const ten = trim(dx.split('\n')[0]).slice(0, 60);
        them(1, {
            nhom: 'chandoan', hoi: `Ca này thỏa mấy tiêu chuẩn của “${ten}”?`,
            vi: 'Câu mở màn của gần như mọi buổi bảo vệ.',
            them: ['Tiêu chuẩn chẩn đoán gồm những gì?', 'Ca này thiếu tiêu chuẩn nào?'],
            field: 'dx1-main'
        });
        if (!val('differential-diagnosis')) them(1, {
            nhom: 'chandoan', hoi: `Ngoài “${ten}” còn nghĩ tới bệnh nào nữa?`,
            vi: 'Mục chẩn đoán phân biệt đang trống.',
            them: ['Bạn loại từng bệnh đó bằng dữ kiện nào?'],
            field: 'differential-diagnosis'
        });
        them(2, {
            nhom: 'chandoan', hoi: `“${ten}” đã có biến chứng nào chưa?`,
            vi: 'Hỏi tiếp ngay sau khi bạn chốt được chẩn đoán.',
            them: ['Bạn tìm biến chứng đó bằng dấu chứng hay cận lâm sàng gì?'],
            field: 'dx1-comp'
        });
        if (!val('dx1-stage') && !val('dx2-stage')) them(2, {
            nhom: 'chandoan', hoi: `“${ten}” ở mức độ hay giai đoạn nào?`,
            vi: 'Chẩn đoán chưa kèm mức độ / giai đoạn.',
            them: ['Dựa vào thang điểm nào để xếp?'],
            field: 'dx1-stage'
        });
    }

    /* Kết quả bất thường mà không mục nào nhắc tới thì chắc chắn bị vặn */
    const noiDung = fold([val('summary'), val('problem-list'), val('diagnosis-reasoning'),
        val('labs-results')].join('\n'));
    const boQuen = abnormalItems(getCls())
        .filter(i => !noiDung.includes(fold(i.n))).slice(0, 8);
    if (boQuen.length) them(1, {
        nhom: 'cls', hoi: boQuen.length === 1
            ? `Kết quả ${boQuen[0].n} bất thường, bạn giải thích thế nào?`
            : `${boQuen.length} kết quả bất thường này giải thích ra sao?`,
        vi: 'Đã có kết quả nhưng tóm tắt và biện luận chưa nhắc tới.',
        them: boQuen.map(i => `${i.n} ${i.v}${i.u ? ' ' + i.u : ''} ${i.flag === 'high' ? '↑' : '↓'}`),
        field: 'summary'
    });

    const thuoc = getRx().map(r => trim(r.ten)).filter(Boolean).slice(0, 6);
    if (thuoc.length) them(2, {
        nhom: 'dieutri', hoi: 'Vì sao chọn liều này cho từng thuốc?',
        vi: `Y lệnh đang có ${thuoc.length} thuốc.`,
        them: thuoc.concat('Có phải chỉnh theo chức năng thận hay cân nặng không?'),
        field: 'rx-list'
    });

    if (!val('prognosis')) them(2, {
        nhom: 'tienluong', hoi: 'Ca này tiên lượng thế nào?',
        vi: 'Mục XV đang trống — thường là câu chốt buổi bảo vệ.',
        them: ['Tiên lượng gần?', 'Tiên lượng xa?', 'Yếu tố nào làm nặng thêm?'],
        field: 'prognosis'
    });
    if (!val('hx-negatives')) them(2, {
        nhom: 'benhsu', hoi: 'Bạn đã hỏi và ghi âm tính những gì?',
        vi: 'Chưa có triệu chứng âm tính nào — thầy sẽ hỏi bạn loại các hướng khác bằng cách nào.',
        field: 'hx-negatives'
    });
    if (getSteps().length < 2) them(2, {
        nhom: 'benhsu', hoi: 'Bệnh khởi phát và diễn tiến ra sao?',
        vi: 'Bệnh sử mới có dưới hai mốc thời gian.',
        them: ['Triệu chứng nào có trước, nào có sau?', 'Đã đi khám ở đâu, dùng thuốc gì chưa?'],
        field: 'hx-list'
    });
    if (!val('history-internal')) them(2, {
        nhom: 'benhsu', hoi: 'Bệnh nhân có bệnh nền gì không?',
        vi: 'Tiền căn nội khoa đang trống.',
        them: ['Đang uống thuốc gì hằng ngày?', 'Có dị ứng thuốc không?'],
        field: 'history-internal'
    });

    /* Khai thác còn hụt — dò trên chính chữ đã gõ ở bệnh sử và khám */
    const moTa = fold([val('reason-for-admission'), val('hx-general'),
        val('hx-sym-name'), val('hx-sym-char'), val('hx-sym-severity'),
        getSteps().map(m => m.s).join(' '),
        val('exam-general'), val('exam-chest'), val('exam-abdomen')].join(' '));
    KHAI_THAC.forEach(k => {
        if (k.co.test(moTa) && !k.chua.test(moTa)) them(1, k);
    });

    return hoi.sort((a, b) => a.chac - b.chac);
}

/* ---- dấu "trả lời được": nhớ theo từng bệnh án, để biết còn phải ôn gì ---- */
const XONG_KEY = () => 'baHoiXong_' + (val('medical-record-id') || 'tam');
let xongSet = null;
function docXong() {
    if (!xongSet) {
        try { xongSet = new Set(JSON.parse(localStorage.getItem(XONG_KEY()) || '[]')); }
        catch { xongSet = new Set(); }
    }
    return xongSet;
}
const ghiXong = () => {
    try { localStorage.setItem(XONG_KEY(), JSON.stringify([...docXong()])); } catch { /* đầy thì thôi */ }
};

let hoiLoc = 'all';

function theHoi(h, i) {
    const [ten, ic] = NHOM[h.nhom] || NHOM.chandoan;
    const xong = docXong().has(h.id);
    return `<article class="hq n-${h.nhom}${xong ? ' is-done' : ''}${h.chac === 1 ? ' is-chac' : ''}">
        <div class="hq-head">
            <span class="hq-chip"><i class="fas ${ic}"></i> ${ten}</span>
            <span class="hq-lv">${h.chac === 1 ? 'Chắc chắn hỏi' : 'Có thể hỏi'}</span>
        </div>
        <h4>${esc(h.hoi)}</h4>
        ${h.vi ? `<p class="hq-vi"><i class="fas fa-circle-info"></i> ${esc(h.vi)}</p>` : ''}
        ${h.them?.length ? `<ul class="hq-them">${h.them.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
        <div class="hq-foot">
            ${h.field ? `<button type="button" class="hq-go" data-hoi="${i}">Bổ sung ngay <i class="fas fa-arrow-right"></i></button>` : ''}
            <button type="button" class="hq-done" data-xong="${i}">
                <i class="${xong ? 'fas fa-circle-check' : 'far fa-circle'}"></i> ${xong ? 'Trả lời được' : 'Đánh dấu trả lời được'}
            </button>
        </div>
    </article>`;
}

function veCauHoi(list) {
    if (!list.length) return `<p class="mach-ok"><i class="fas fa-circle-check"></i>
        Chưa đủ nội dung để đoán câu hỏi. Viết chẩn đoán và biện luận rồi quay lại.</p>`;

    const xong = docXong();
    const soXong = list.filter(h => xong.has(h.id)).length;
    const pct = Math.round(soXong / list.length * 100);
    const dem = {};
    list.forEach(h => { dem[h.nhom] = (dem[h.nhom] || 0) + 1; });
    if (hoiLoc !== 'all' && !dem[hoiLoc]) hoiLoc = 'all';
    const hien = hoiLoc === 'all' ? list : list.filter(h => h.nhom === hoiLoc);
    const chac = hien.filter(h => h.chac === 1), co = hien.filter(h => h.chac === 2);
    const khoi = (ten, cls, arr) => arr.length
        ? `<div class="mach-sec ${cls}">${ten} <span class="mach-n is-on">${arr.length}</span></div>`
            + arr.map(h => theHoi(h, list.indexOf(h))).join('')
        : '';

    return `
        <div class="hq-top">
            <div class="hq-prog">
                <b>${soXong}/${list.length}</b> câu bạn tự tin trả lời
                <span class="hq-bar"><i style="width:${pct}%"></i></span>
            </div>
            <button type="button" id="hoi-copy" class="mach-btn"><i class="fas fa-copy"></i> Chép danh sách</button>
        </div>
        <div class="hq-filters">
            <button type="button" class="hq-f${hoiLoc === 'all' ? ' is-on' : ''}" data-f="all">Tất cả ${list.length}</button>
            ${Object.entries(NHOM).filter(([k]) => dem[k]).map(([k, [ten, ic]]) =>
                `<button type="button" class="hq-f n-${k}${hoiLoc === k ? ' is-on' : ''}" data-f="${k}">
                    <i class="fas ${ic}"></i> ${ten} ${dem[k]}</button>`).join('')}
        </div>
        ${khoi('Gần như chắc chắn bị hỏi', 'u1', chac)}
        ${khoi('Có thể bị hỏi', 'u4', co)}
        <p class="hq-cuoi"><i class="fas fa-shield-heart"></i> Còn chỗ hở nào máy soi ra được thì nằm ở
            <button type="button" id="hoi-toviec" class="hq-link">khung Việc tiếp theo</button> — thầy nhìn là thấy.</p>`;
}

/** Vẽ + gắn sự kiện cho khung Câu hỏi. Tách ra vì phải vẽ lại mỗi lần lọc
    hay đánh dấu, mà vẽ lại thì phải giữ nguyên chỗ đang cuộn. */
function veHoiVao(bodyEl, doiKhung) {
    function gan() {
        bodyEl.querySelectorAll('[data-hoi]').forEach(b => b.addEventListener('click', () =>
            diToi(hoiList[+b.dataset.hoi]?.field)));
        bodyEl.querySelectorAll('[data-xong]').forEach(b => b.addEventListener('click', () => {
            const h = hoiList[+b.dataset.xong];
            const s = docXong();
            if (s.has(h.id)) s.delete(h.id); else s.add(h.id);
            ghiXong();
            veLai(true);
            demHuy();
        }));
        bodyEl.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => {
            hoiLoc = b.dataset.f;
            veLai(false);
        }));
        bodyEl.querySelector('#hoi-copy')?.addEventListener('click', async () => {
            const t = hoiList.map((h, i) =>
                `${i + 1}. ${h.hoi}${h.them?.length ? '\n   – ' + h.them.join('\n   – ') : ''}`).join('\n');
            try { await navigator.clipboard.writeText(t); showToast('Đã chép danh sách câu hỏi.', 'success'); }
            catch { showToast('Trình duyệt chặn sao chép.', 'error'); }
        });
        bodyEl.querySelector('#hoi-toviec')?.addEventListener('click', doiKhung);
    }
    function veLai(giuCuon) {
        const y = giuCuon ? bodyEl.scrollTop : 0;
        bodyEl.innerHTML = veCauHoi(hoiList);
        bodyEl.scrollTop = y;
        gan();
    }
    hoiList = dsCauHoi();
    veLai(false);
}

/* =====================================================================
   5. TÌM & THAY THẾ TOÀN BỆNH ÁN
   ===================================================================== */
let hoanTac = [];

const reOf = (s, boQuaHoa) => new RegExp(String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), boQuaHoa ? 'gi' : 'g');

function timThay(q, boQuaHoa) {
    if (!q || q.length < 2) return [];
    return oNoiDung().map(el => {
        const v = String(el.value);
        const n = (v.match(reOf(q, boQuaHoa)) || []).length;
        if (!n) return null;
        const i = Math.max(0, v.search(reOf(q, boQuaHoa)));
        return { el, n, ten: labelOf(el), tab: tabOf(el), trich: trim(v.slice(Math.max(0, i - 30), i + q.length + 40)) };
    }).filter(Boolean);
}

const veThay = () => `
    <div class="thay-bar">
        <label>Tìm chữ<input id="thay-q" type="search" autocomplete="off" placeholder="vd: BN, Paracetamol, viêm phổi"></label>
        <label>Thay bằng<input id="thay-r" type="text" autocomplete="off" placeholder="vd: bệnh nhân"></label>
        <label class="thay-chk"><input id="thay-case" type="checkbox" checked> Bỏ qua hoa/thường</label>
    </div>
    <div id="thay-out"></div>`;

function veThayKetQua() {
    const out = $('thay-out');
    if (!out) return;
    const q = $('thay-q').value.trim();
    const boQuaHoa = $('thay-case').checked;
    const hits = q ? timThay(q, boQuaHoa) : [];
    const tong = hits.reduce((s, h) => s + h.n, 0);

    out.innerHTML = !q ? `<p class="mach-empty"><i class="fas fa-magnifying-glass"></i>
            Gõ chữ cần sửa. Một lần thay là sửa đủ mọi mục — khỏi mở từng tab đi tìm.</p>`
        : !hits.length ? `<p class="mach-empty">Không thấy “${esc(q)}” trong bệnh án.</p>`
        : `<div class="thay-act">
                <b>${tong} chỗ trong ${hits.length} ô</b>
                <button type="button" id="thay-all" class="mach-btn is-do"><i class="fas fa-wand-magic-sparkles"></i> Thay tất cả</button>
                ${hoanTac.length ? '<button type="button" id="thay-undo" class="mach-btn"><i class="fas fa-rotate-left"></i> Hoàn tác lần thay trước</button>' : ''}
            </div>` +
            hits.map((h, i) => `<div class="thay-row">
                <button type="button" class="thay-go" data-thay="${i}">
                    <span class="soi-tab">${esc(tabTen(h.tab))}</span><b>${esc(h.ten)}</b>
                    <span class="soi-trich">…${esc(h.trich)}…</span>
                </button>
                <span class="thay-n">${h.n}</span>
                <button type="button" class="thay-one" data-one="${i}">Thay ô này</button>
            </div>`).join('');

    const doi = (list) => {
        const r = $('thay-r').value;
        hoanTac = list.map(h => ({ el: h.el, cu: h.el.value }));
        list.forEach(h => { h.el.value = h.el.value.replace(reOf(q, boQuaHoa), r); fire(h.el); });
        showToast(`Đã thay ${list.reduce((s, h) => s + h.n, 0)} chỗ. Bấm “Hoàn tác” nếu nhầm.`, 'success');
        veThayKetQua();
    };
    out.querySelector('#thay-all')?.addEventListener('click', () => doi(hits));
    out.querySelectorAll('.thay-one').forEach(b => b.addEventListener('click', () => doi([hits[+b.dataset.one]])));
    out.querySelectorAll('.thay-go').forEach(b => b.addEventListener('click', () => goTo(hits[+b.dataset.thay].el)));
    out.querySelector('#thay-undo')?.addEventListener('click', () => {
        hoanTac.forEach(({ el, cu }) => { el.value = cu; fire(el); });
        hoanTac = [];
        showToast('Đã trả lại như cũ.', 'info');
        veThayKetQua();
    });
}

/* =====================================================================
   TRẠM LIÊN KẾT — một bảng, bốn khung, khỏi đẻ thêm bốn nút nổi
   ===================================================================== */
const KHUNG = [
    ['viec', 'Việc tiếp theo', 'fa-list-check'],
    ['thoigian', 'Dòng thời gian', 'fa-timeline'],
    ['hoi', 'Câu hỏi bảo vệ', 'fa-comments'],
    ['thay', 'Tìm & thay', 'fa-right-left']
];
let khung = 'viec';

const tram = document.createElement('div');
tram.id = 'mach-tram';
tram.className = 'mach hidden';
tram.innerHTML = `
    <div class="mach-bg" data-mach-close></div>
    <div class="mach-panel">
        <div class="mach-head">
            <i class="fas fa-diagram-project"></i><b>Trạm liên kết</b>
            <div class="mach-tabs">${KHUNG.map(([k, t, ic]) =>
                `<button type="button" data-khung="${k}"><i class="fas ${ic}"></i> ${t}<span class="mach-n" data-n="${k}"></span></button>`).join('')}</div>
            <button type="button" class="mach-x" data-mach-close aria-label="Đóng"><i class="fas fa-xmark"></i></button>
        </div>
        <div class="mach-body" id="mach-body"></div>
    </div>`;
document.body.appendChild(tram);

let tgItems = [], tgCanh = [], viecList = [], hoiList = [];

function veTram() {
    const body = $('mach-body');
    tram.querySelectorAll('[data-khung]').forEach(b => b.classList.toggle('is-on', b.dataset.khung === khung));

    if (khung === 'viec') {
        viecList = dsViec();
        body.innerHTML = veViec(viecList);
        body.querySelectorAll('[data-viec]').forEach(b => b.addEventListener('click', () =>
            diToi(viecList[+b.dataset.viec]?.field)));
    } else if (khung === 'thoigian') {
        tgItems = docThoiGian();
        tgCanh = soiThoiGian(tgItems);
        body.innerHTML = veThoiGian(tgItems, tgCanh);
        body.querySelectorAll('[data-tl]').forEach(b => b.addEventListener('click', () => {
            const it = tgItems[+b.dataset.tl];
            if (it?.el) { dongTram(); goTo(it.el); }
        }));
        body.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
            const c = tgCanh[+b.dataset.go];
            if (c?.el) { dongTram(); goTo(c.el); }
        }));
    } else if (khung === 'hoi') {
        veHoiVao(body, () => { khung = 'viec'; veTram(); });
    } else {
        body.innerHTML = veThay();
        $('thay-q').addEventListener('input', veThayKetQua);
        $('thay-case').addEventListener('change', veThayKetQua);
        veThayKetQua();
        setTimeout(() => $('thay-q')?.focus(), 40);
    }
    body.scrollTop = 0;
    demHuy();
}

/** Con số trên đầu mỗi khung — biết có việc mà không phải mở từng cái ra xem */
function demHuy() {
    /* Câu hỏi đếm số CÒN LẠI: đánh dấu trả lời được rồi thì con số phải tụt
       xuống, không thì cái huy hiệu không nói lên điều gì. */
    const xong = docXong();
    const n = {
        viec: dsViec().length,
        hoi: dsCauHoi().filter(h => !xong.has(h.id)).length,
        thoigian: soiThoiGian(docThoiGian()).length, thay: 0
    };
    tram.querySelectorAll('[data-n]').forEach(s => {
        const v = n[s.dataset.n];
        s.textContent = v || '';
        s.classList.toggle('is-on', !!v);
    });
}

export function moTram(k) {
    khung = k || khung;
    tram.classList.remove('hidden');
    veTram();
}
const dongTram = () => tram.classList.add('hidden');

tram.addEventListener('click', e => {
    if (e.target.closest('[data-mach-close]') || e.target.classList.contains('mach-bg')) return dongTram();
    const b = e.target.closest('[data-khung]');
    if (b) { khung = b.dataset.khung; veTram(); }
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { dongTram(); dongSoi(); }
});

/* =====================================================================
   6. BẢN VĂN XUÔI BẤM ĐƯỢC — đi ngược từ câu chữ về ô đã sinh ra nó
   buildModel ghép nhiều ô thành một đoạn nên không có bảng tra sẵn; dò
   bằng cách tìm ô nào chứa đoạn chữ dài nhất của câu vừa bấm.
   ===================================================================== */
function oCuaCau(text) {
    const cau = trim(text);
    if (cau.length < 6) return null;
    const dsO = oNoiDung();
    /* Thử từ cả câu rút dần xuống — khớp càng dài càng chắc là đúng ô */
    const nen = [cau, ...cau.split(/[.;•—]/).map(trim).filter(x => x.length > 8)]
        .sort((a, b) => b.length - a.length);
    for (const m of nen) {
        const q = fold(m).slice(0, 80);
        if (q.length < 6) continue;
        const hit = dsO.find(el => fold(el.value).includes(q));
        if (hit) return hit;
    }
    /* Chưa ra thì lấy cụm 5 chữ đầu — đủ để về đúng khối */
    const q = fold(cau.split(/\s+/).slice(0, 5).join(' '));
    return q.length > 5 ? dsO.find(el => fold(el.value).includes(q)) : null;
}

const mdpBody = $('mdp-body');
if (mdpBody) {
    mdpBody.classList.add('mdp-clickable');
    mdpBody.addEventListener('click', (e) => {
        const line = e.target.closest('p, li, td, h1, h2, h3, h4, blockquote');
        if (!line || !mdpBody.contains(line)) return;
        const el = oCuaCau(line.textContent);
        if (!el) return showToast('Câu này do máy ghép từ nhiều ô — chưa dò được ô gốc.', 'info');
        $('md-preview')?.classList.add('hidden');
        goTo(el);
        showToast(`Nguồn: ${labelOf(el)}`, 'info', 2000);
    });
}

/* =====================================================================
   Cửa vào: nút ở thanh công cụ + phím tắt
   ===================================================================== */
$('ba-tram')?.addEventListener('click', () => moTram('viec'));

function laySelection() {
    const el = document.activeElement;
    if (laO(el)) {
        const s = String(el.value || '').slice(el.selectionStart, el.selectionEnd).trim();
        return s || trim(el.value).slice(0, 60);
    }
    return String(window.getSelection?.() || '').trim();
}

document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;
    const k = e.key.toLowerCase();
    if (k === 'l') { e.preventDefault(); moSoi(laySelection()); }
    else if (k === 'j') { e.preventDefault(); moTram('viec'); }
    else if (k === 'y') { e.preventDefault(); moTram('thoigian'); }
    else if (k === 'u') { e.preventDefault(); moTram('hoi'); }
    else if (k === 'r') { e.preventDefault(); moTram('thay'); }
});

/* Đèn nhỏ trên nút Trạm: có việc gấp thì chấm đỏ, khỏi phải mở ra xem */
let demTimer = 0;
function capNhatDen() {
    clearTimeout(demTimer);
    demTimer = setTimeout(() => {
        const btn = $('ba-tram');
        if (!btn) return;
        const gap = dsViec().filter(v => v.uu <= 1).length;
        btn.classList.toggle('has-gap', gap > 0);
        btn.dataset.gap = gap || '';
        if (!tram.classList.contains('hidden')) demHuy();
    }, 1500);
}
document.addEventListener('input', capNhatDen);
document.addEventListener('change', capNhatDen);
setTimeout(capNhatDen, 2500);

/* Cho bảng lệnh (thuan-tay.js) gọi lại */
export { moSoi };
