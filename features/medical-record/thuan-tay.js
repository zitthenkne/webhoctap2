/* =====================================================================
   thuan-tay.js — CHO TAY THUẬN HƠN (2026-09-06)

   Cùng tầng với tao-benh-an-them.js: chỉ đọc DOM và bấm hộ những nút đã
   có. KHÔNG thêm ô nội dung nào (trừ đường khôi phục bản cũ, đi qua đúng
   saveRecord của record-store), nên không phải đụng FIELDS / buildModel.

   Sáu thứ trong này:
      7. BẢNG LỆNH — Ctrl+K nay chạy được việc, không chỉ nhảy tới ô.
      8. CHẾ ĐỘ TRÌNH BỆNH — toàn màn hình, chữ to, mười thẻ theo đúng
         trình tự trình ca lâm sàng, có đồng hồ và câu hỏi kèm theo.
      9. LỊCH SỬ PHIÊN BẢN — tự chụp bệnh án theo giờ, so bản cũ với bản
         đang viết, khôi phục được. Xóa nhầm cả đoạn không còn là mất.
     10. GHIM ĐÔI MỤC — xem mục Khám ở cột phải trong khi gõ Biện luận ở
         cột trái; ghim node THẬT nên vẫn sửa được ở cả hai bên.
     11. BẢNG PHÍM TẮT — phím `?`.
     12. QUAY LẠI CHỖ CŨ — Alt+←/→ đi lại giữa các ô vừa gõ, và mở lại
         bệnh án thì được hỏi có về đúng ô đang viết dở không.
   ===================================================================== */
import { showToast } from '../../core/utils.js';
import { goTo, labelOf, addCmdSource } from './tao-benh-an-them.js';
import { getRecord, saveRecord } from './record-store.js';
import { moTram, moSoi } from './mach-benh-an.js';
import { abnormalItems } from './cls-shared.js';
import { getCls } from './cls-editor.js';
import { getSteps, stepLabel } from './benh-su-editor.js';

const $ = (id) => document.getElementById(id);
const body = document.body;
const form = $('medical-record-form');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const val = (id) => String($(id)?.value || '').trim();
const trim = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const click = (id) => $(id)?.click();
const recId = () => val('medical-record-id') || 'BA-tam';

const TABS = [...document.querySelectorAll('.tab-link')].map(l => ({
    id: l.dataset.tab, ten: trim(l.querySelector('.tab-text')?.textContent), el: l
}));
const moTab = (id) => TABS.find(t => t.id === id)?.el.click();

/* =====================================================================
   8. CHẾ ĐỘ TRÌNH BỆNH
   Trình một ca ở buồng bệnh thì không ai cầm cái biểu mẫu 300 ô ra đọc.
   Cần mười thẻ, chữ to, đi bằng mũi tên, và một cái đồng hồ vì đứng trình
   quá năm phút là bị cắt.
   ===================================================================== */
const NORMAL_HINT = /^ch[ưu]a ghi nh[ậa]n/i;

function dongCua(ids) {
    return ids.map(id => {
        const v = val(id);
        return v ? { ten: labelOf($(id)), v } : null;
    }).filter(Boolean);
}

/** Mỗi thẻ: { ten, icon, dong: [chuỗi] } — rỗng thì bỏ luôn khỏi bộ bài */
function dungThe() {
    const the = [];
    const them = (ten, icon, dong, field) => {
        const list = (dong || []).filter(x => trim(x));
        if (list.length) the.push({ ten, icon, dong: list, field });
    };

    const ten = body.classList.contains('ba-priv') ? 'Bệnh nhân (đã ẩn tên)' : (val('patient-name') || 'Bệnh nhân');
    const hc = [ten, val('patient-age') && val('patient-age') + ' tuổi', val('patient-gender'),
        val('patient-occupation')].filter(Boolean).join(', ');
    them('Hành chính', 'fa-user', [
        hc,
        val('admission-date') && `Vào viện ${val('admission-date').split('-').reverse().join('/')}${val('admission-time') ? ' lúc ' + val('admission-time') : ''}`,
        val('department-name') && `Khoa ${val('department-name')}`
    ], 'patient-name');

    them('Lý do vào viện', 'fa-door-open', [val('reason-for-admission')], 'reason-for-admission');

    const mocs = getSteps().map(m => {
        const s = trim(String(m.s || '').replace(/\s*;\s*/g, ' · '));
        return s ? `${stepLabel(m)}: ${s}` : '';
    });
    them('Bệnh sử', 'fa-timeline', mocs.length ? mocs : [val('hx-general')], 'hx-list');
    them('Ghi âm tính', 'fa-ban', [val('hx-negatives')], 'hx-negatives');

    them('Tiền căn', 'fa-clock-rotate-left',
        dongCua(['history-internal', 'history-surgery', 'history-allergy', 'history-family', 'history-habit'])
            .map(d => `${d.ten}: ${d.v}`), 'history-internal');

    const sinh = [['Mạch', 'vital-pulse', 'l/p'], ['HA', 'vital-bp', 'mmHg'], ['Nhiệt độ', 'vital-temp', '°C'],
        ['Nhịp thở', 'vital-resp', 'l/p'], ['SpO2', 'vital-spo2', '%'], ['Cân nặng', 'vital-weight', 'kg']]
        .filter(([, id]) => val(id)).map(([l, id, u]) => `${l} ${val(id)} ${u}`).join(' · ');
    const kham = ['exam-general', 'exam-head', 'exam-chest', 'exam-heart', 'exam-lung', 'exam-abdomen', 'exam-neuro-msk']
        .map(id => {
            const v = val(id);
            if (!v || NORMAL_HINT.test(v)) return '';
            return `${labelOf($(id))}: ${trim(v)}`;
        });
    them('Khám lâm sàng', 'fa-stethoscope', [sinh, ...kham], 'vital-pulse');

    const bt = abnormalItems(getCls()).map(i =>
        `${i.n} ${i.v}${i.u ? ' ' + i.u : ''} ${i.flag === 'high' ? '↑' : '↓'}${i.from ? ` (${i.from})` : ''}`);
    them('Cận lâm sàng bất thường', 'fa-vials', bt.length ? bt : [val('labs-results')], 'cls-list');

    them('Tóm tắt', 'fa-file-lines', [val('summary')], 'summary');
    them('Đặt vấn đề', 'fa-list-check', val('problem-list').split('\n'), 'problem-list');
    them('Chẩn đoán sơ bộ', 'fa-diagnoses',
        [val('dx1-main') || val('provisional-diagnosis'), val('dx1-comp') && 'Biến chứng: ' + val('dx1-comp'),
        val('differential-diagnosis') && 'Phân biệt: ' + val('differential-diagnosis')], 'dx1-main');
    them('Biện luận', 'fa-scale-balanced', val('diagnosis-reasoning').split('\n'), 'diagnosis-reasoning');
    them('Đề nghị cận lâm sàng', 'fa-flask', val('labs-proposed').split('\n'), 'labs-proposed');
    them('Chẩn đoán xác định', 'fa-clipboard-check',
        [val('dx2-main') || val('final-diagnosis'), val('dx2-comp') && 'Biến chứng: ' + val('dx2-comp')], 'dx2-main');
    them('Điều trị', 'fa-prescription-bottle-medical',
        [val('treatment-plan'), val('treatment-detail')], 'treatment-plan');
    them('Tiên lượng', 'fa-chart-line', [val('prognosis')], 'prognosis');

    return the;
}

let tbThe = [], tbI = 0, tbDem = 0, tbTimer = 0;

const tb = document.createElement('div');
tb.id = 'tb';
tb.className = 'tb hidden';
tb.innerHTML = `
    <div class="tb-bar">
        <span class="tb-clock" id="tb-clock">0:00</span>
        <span class="tb-pos" id="tb-pos"></span>
        <span class="tb-grow"></span>
        <button type="button" class="tb-mini" id="tb-fs" title="Toàn màn hình"><i class="fas fa-expand"></i></button>
        <button type="button" class="tb-mini" id="tb-edit" title="Sửa mục này"><i class="fas fa-pen"></i></button>
        <button type="button" class="tb-mini" id="tb-x" title="Đóng (Esc)"><i class="fas fa-xmark"></i></button>
    </div>
    <div class="tb-stage" id="tb-stage"></div>
    <div class="tb-foot">
        <button type="button" class="tb-nav" id="tb-prev"><i class="fas fa-chevron-left"></i></button>
        <div class="tb-dots" id="tb-dots"></div>
        <button type="button" class="tb-nav" id="tb-next"><i class="fas fa-chevron-right"></i></button>
    </div>`;
document.body.appendChild(tb);

function veTb() {
    const t = tbThe[tbI];
    if (!t) return;
    $('tb-stage').innerHTML = `
        <div class="tb-card">
            <h2><i class="fas ${t.icon}"></i> ${esc(t.ten)}</h2>
            <ul>${t.dong.map(d => `<li>${esc(trim(d))}</li>`).join('')}</ul>
        </div>`;
    $('tb-pos').textContent = `${tbI + 1}/${tbThe.length} · ${t.ten}`;
    $('tb-dots').innerHTML = tbThe.map((x, i) =>
        `<button type="button" class="tb-dot${i === tbI ? ' is-on' : ''}" data-d="${i}" title="${esc(x.ten)}"></button>`).join('');
}

function tbDi(n) {
    tbI = Math.max(0, Math.min(tbThe.length - 1, tbI + n));
    veTb();
}

function moTrinhBenh() {
    tbThe = dungThe();
    if (!tbThe.length) return showToast('Chưa có nội dung nào để trình — nhập bệnh án trước đã.', 'warning');
    tbI = 0;
    tbDem = 0;
    tb.classList.remove('hidden');
    body.classList.add('tb-on');
    veTb();
    clearInterval(tbTimer);
    tbTimer = setInterval(() => {
        tbDem++;
        const el = $('tb-clock');
        el.textContent = `${Math.floor(tbDem / 60)}:${String(tbDem % 60).padStart(2, '0')}`;
        el.className = 'tb-clock' + (tbDem > 360 ? ' is-late' : tbDem > 240 ? ' is-warn' : '');
    }, 1000);
}

function dongTb() {
    tb.classList.add('hidden');
    body.classList.remove('tb-on');
    clearInterval(tbTimer);
}

tb.addEventListener('click', e => {
    if (e.target.closest('#tb-x')) return dongTb();
    if (e.target.closest('#tb-prev')) return tbDi(-1);
    if (e.target.closest('#tb-next')) return tbDi(1);
    if (e.target.closest('#tb-fs')) {
        if (document.fullscreenElement) document.exitFullscreen?.();
        else tb.requestFullscreen?.().catch(() => showToast('Trình duyệt không cho bật toàn màn hình.', 'warning'));
        return;
    }
    if (e.target.closest('#tb-edit')) {
        const ten = tbThe[tbI]?.field;
        const f = ten && $(ten);
        dongTb();
        if (f) goTo(f);
        else showToast(`Chưa tới được: trang không có ô “${ten}”.`, 'warning');
        return;
    }
    const d = e.target.closest('[data-d]');
    if (d) { tbI = +d.dataset.d; veTb(); }
});
/* Vuốt ngang để lật thẻ khi cầm điện thoại đứng trình */
let tbX = 0;
tb.addEventListener('touchstart', e => { tbX = e.touches[0].clientX; }, { passive: true });
tb.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - tbX;
    if (Math.abs(dx) > 60) tbDi(dx < 0 ? 1 : -1);
}, { passive: true });

/* =====================================================================
   9. LỊCH SỬ PHIÊN BẢN
   Chụp bản đã LƯU (getRecord) chứ không chụp ô đang gõ: bản đã lưu mới là
   thứ khôi phục lại được nguyên vẹn qua saveRecord. Bỏ ảnh ra khỏi bản
   chụp — ảnh base64 sẽ làm đầy localStorage chỉ sau vài bản.
   ===================================================================== */
const VER_KEY = () => 'baVer_' + recId();
const VER_MAX = 15;

function gonNhe(rec) {
    const r = JSON.parse(JSON.stringify(rec));
    delete r.anhKham;
    delete r.anhHoSo;
    (r.canLamSang || []).forEach(c => delete c.images);
    return r;
}

const docVer = () => {
    try { return JSON.parse(localStorage.getItem(VER_KEY())) || []; } catch { return []; }
};
function ghiVer(list) {
    try { localStorage.setItem(VER_KEY(), JSON.stringify(list)); }
    catch { localStorage.setItem(VER_KEY(), JSON.stringify(list.slice(0, 5))); }
}

function chup(bat = false) {
    const rec = getRecord(recId());
    if (!rec) return;
    const nhe = gonNhe(rec);
    const chuoi = JSON.stringify(nhe);
    if (chuoi.length < 40) return;                 // bệnh án trắng thì khỏi chụp
    const list = docVer();
    if (list[0] && JSON.stringify(list[0].rec) === chuoi) return;   // không đổi gì
    list.unshift({ t: new Date().toISOString(), rec: nhe, tay: bat });
    ghiVer(list.slice(0, VER_MAX));
}

/** Bẹt một bệnh án thành bảng đường-dẫn → chữ, để so hai bản */
function bet(o, tien = '', ra = {}) {
    if (o == null) return ra;
    if (typeof o !== 'object') { ra[tien] = String(o); return ra; }
    if (Array.isArray(o)) {
        o.forEach((v, i) => bet(v, `${tien}[${i + 1}]`, ra));
        return ra;
    }
    Object.entries(o).forEach(([k, v]) => {
        if (k === 'lastUpdated' || k === 'id') return;
        bet(v, tien ? `${tien}.${k}` : k, ra);
    });
    return ra;
}

const TEN_MUC = {
    hanhChinh: 'I. Hành chính', lyDoVaoVien: 'II. Lý do vào viện', benhSuChiTiet: 'III. Bệnh sử',
    tienSu: 'IV. Tiền căn', luocQuaCoQuan: 'V. Lược qua cơ quan', khamBenh: 'VI. Khám',
    tomTatBenhAn: 'VII. Tóm tắt', datVanDe: 'VIII. Đặt vấn đề', chanDoanSoBo: 'IX. Chẩn đoán sơ bộ',
    chanDoanSoBoChiTiet: 'IX. Chẩn đoán sơ bộ', bienLuan: 'X. Biện luận',
    bienLuanChanDoan: 'X. Biện luận', canLamSangDeNghi: 'XI. CLS đề nghị',
    canLamSang: 'XII. Kết quả CLS', ketQuaCanLamSang: 'XII. Kết quả CLS',
    chanDoanXacDinh: 'XIII. Chẩn đoán xác định', chanDoanXacDinhChiTiet: 'XIII. Chẩn đoán xác định',
    huongDieuTri: 'XIV. Điều trị', dieuTriCuThe: 'XIV. Điều trị', yLenhThuoc: 'XIV. Y lệnh thuốc',
    tienLuong: 'XV. Tiên lượng', theoDoi: 'Theo dõi'
};
const tenMuc = (p) => TEN_MUC[p.split(/[.[]/)[0]] || p.split(/[.[]/)[0];

function soSanh(cu, moi) {
    const a = bet(cu), b = bet(moi);
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    const ra = [];
    keys.forEach(k => {
        const x = trim(a[k] || ''), y = trim(b[k] || '');
        if (x === y) return;
        ra.push({ k, muc: tenMuc(k), cu: x, moi: y });
    });
    return ra;
}

const lsBox = document.createElement('div');
lsBox.id = 'ls-box';
lsBox.className = 'mach hidden';
lsBox.innerHTML = `
    <div class="mach-bg" data-ls-close></div>
    <div class="mach-panel">
        <div class="mach-head">
            <i class="fas fa-clock-rotate-left"></i><b>Lịch sử phiên bản</b>
            <span class="mach-grow"></span>
            <button type="button" class="mach-btn" id="ls-now"><i class="fas fa-camera"></i> Chụp bản lúc này</button>
            <button type="button" class="mach-x" data-ls-close aria-label="Đóng"><i class="fas fa-xmark"></i></button>
        </div>
        <div class="mach-body" id="ls-body"></div>
    </div>`;
document.body.appendChild(lsBox);

const gio = (iso) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} · ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

function veLs(chon = -1) {
    const list = docVer();
    const nay = gonNhe(getRecord(recId()) || {});
    const bodyEl = $('ls-body');
    if (!list.length) {
        bodyEl.innerHTML = `<p class="mach-empty"><i class="fas fa-camera"></i>
            Chưa có bản chụp nào. Máy tự chụp mỗi vài phút khi bệnh án có thay đổi, hoặc bấm “Chụp bản lúc này”.</p>`;
        return;
    }
    const kh = chon >= 0 ? soSanh(list[chon].rec, nay) : [];
    bodyEl.innerHTML = `
        <p class="mach-lead">Bản chụp nằm trên máy này, giữ ${VER_MAX} bản gần nhất và <b>không kèm ảnh</b>.
            Khôi phục sẽ ghi đè nội dung chữ, ảnh đang có vẫn giữ nguyên.</p>
        <div class="ls-grid">
            <div class="ls-list">
                ${list.map((v, i) => `
                    <button type="button" class="ls-item${i === chon ? ' is-on' : ''}" data-v="${i}">
                        <b>${gio(v.t)}</b>
                        <span>${v.tay ? 'tự bấm chụp' : 'tự động'} · ${soSanh(v.rec, nay).length} chỗ khác bản đang viết</span>
                    </button>`).join('')}
            </div>
            <div class="ls-diff">
                ${chon < 0 ? `<p class="mach-empty">Chọn một bản bên trái để xem nó khác bản đang viết ở chỗ nào.</p>`
                : !kh.length ? `<p class="mach-ok"><i class="fas fa-equals"></i> Bản này giống hệt bản đang viết.</p>`
                : `<div class="ls-act">
                        <b>${kh.length} chỗ khác</b>
                        <button type="button" class="mach-btn is-do" id="ls-restore"><i class="fas fa-rotate-left"></i> Khôi phục bản này</button>
                    </div>` + kh.slice(0, 60).map(d => `
                        <div class="ls-row">
                            <span class="ls-muc">${esc(d.muc)}</span>
                            <span class="ls-cu">${esc(d.cu.slice(0, 160)) || '<trống>'}</span>
                            <span class="ls-moi">${esc(d.moi.slice(0, 160)) || '<trống>'}</span>
                        </div>`).join('')}
            </div>
        </div>`;

    bodyEl.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => veLs(+b.dataset.v)));
    bodyEl.querySelector('#ls-restore')?.addEventListener('click', () => khoiPhuc(list[chon]));
}

async function khoiPhuc(snap) {
    if (!confirm(`Khôi phục bản lúc ${gio(snap.t)}?\n\nBản đang viết sẽ được chụp lại trước khi ghi đè, nên vẫn quay lui được.`)) return;
    chup(true);                                     // giữ lại bản hiện tại đã
    /* Ép trang lưu nốt chỗ vừa gõ trước đã: beforeunload của tao-benh-an.js chỉ
       ghi khi còn `dirty`, ghi sau lúc mình khôi phục là mất công khôi phục. */
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
    await new Promise(r => setTimeout(r, 600));

    const nay = getRecord(recId()) || {};
    const rec = {
        ...snap.rec, id: recId(),
        anhKham: nay.anhKham || [], anhHoSo: nay.anhHoSo || []
    };
    /* Ảnh trong phiếu CLS cũng trả về từ bản đang có, theo tên phiếu */
    (rec.canLamSang || []).forEach(c => {
        const cu = (nay.canLamSang || []).find(x => x.name === c.name);
        if (cu?.images) c.images = cu.images;
    });
    try {
        await saveRecord(rec);
        showToast('Đã khôi phục — đang mở lại trang.', 'success');
        setTimeout(() => location.reload(), 400);
    } catch (e) {
        console.warn('Khôi phục lỗi:', e);
        showToast('Không ghi được bản khôi phục.', 'error');
    }
}

const moLs = () => { lsBox.classList.remove('hidden'); veLs(); };

/* Chụp tay: bệnh án vừa gõ có thể chưa kịp qua nhịp tự lưu, mà chup() lại đọc
   BẢN ĐÃ LƯU — không ép lưu trước thì bấm "Chụp" xong không thấy gì hiện ra. */
async function chupTay() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
    await new Promise(r => setTimeout(r, 500));
    const truoc = docVer().length;
    chup(true);
    veLs(0);
    showToast(docVer().length > truoc ? 'Đã chụp bản lúc này.'
        : 'Bản này giống hệt bản chụp gần nhất — không tạo thêm.', 'info');
}

lsBox.addEventListener('click', e => {
    if (e.target.closest('[data-ls-close]') || e.target.classList.contains('mach-bg')) lsBox.classList.add('hidden');
    if (e.target.closest('#ls-now')) chupTay();
});
setInterval(() => chup(false), 150000);            // 2,5 phút một lần, chỉ khi có đổi
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') chup(false); });
setTimeout(() => chup(false), 6000);

/* =====================================================================
   10. GHIM ĐÔI MỤC
   Dời node THẬT sang khay phải (như cách #hx-dt dời ra body), để yên một
   comment làm neo mà trả về chỗ cũ. Vì là node thật nên vẫn gõ được ở cả
   hai bên và mọi sự kiện đã gắn vẫn còn nguyên.
   ===================================================================== */
const pin = document.createElement('aside');
pin.id = 'pin-pane';
pin.className = 'pin hidden';
pin.innerHTML = `
    <div class="pin-head">
        <i class="fas fa-thumbtack"></i><b id="pin-name">Ghim một mục</b>
        <button type="button" id="pin-x" aria-label="Bỏ ghim"><i class="fas fa-xmark"></i></button>
    </div>
    <div class="pin-body" id="pin-body"></div>`;
document.body.appendChild(pin);

let pinNode = null, pinNeo = null, pinQuan = null;

function boGhim() {
    if (pinNode && pinNeo?.parentNode) {
        pinNeo.parentNode.insertBefore(pinNode, pinNeo);
        pinNeo.remove();
    }
    pinQuan?.disconnect();
    pinQuan = pinNode = pinNeo = null;
    pin.classList.add('hidden');
    body.classList.remove('pin-on');
}

function ghim(tabId) {
    if (innerWidth < 1024) return showToast('Ghim đôi mục cần màn hình rộng từ 1024px.', 'warning');
    boGhim();
    const node = $(tabId);
    const t = TABS.find(x => x.id === tabId);
    if (!node || !t) return;
    if (node.classList.contains('active')) return showToast('Mục này đang mở ở cột chính — chọn mục khác để ghim.', 'info');

    pinNeo = document.createComment('neo-ghim');
    node.parentNode.insertBefore(pinNeo, node);
    $('pin-body').appendChild(node);
    pinNode = node;
    $('pin-name').textContent = t.ten;
    pin.classList.remove('hidden');
    body.classList.add('pin-on');

    /* Bấm đúng mục đang ghim ở thanh tab thì trả nó về cột chính, không thì
       cột chính trống trơn mà người dùng không hiểu vì sao. */
    pinQuan = new MutationObserver(() => {
        if (pinNode?.classList.contains('active')) boGhim();
    });
    pinQuan.observe(node, { attributes: true, attributeFilter: ['class'] });
}

function chonGhim() {
    if (innerWidth < 1024) return showToast('Ghim đôi mục cần màn hình rộng từ 1024px.', 'warning');
    if (pinNode) return boGhim();
    const dang = TABS.find(t => $(t.id)?.classList.contains('active'))?.id;
    pin.classList.remove('hidden');
    body.classList.add('pin-on');
    $('pin-name').textContent = 'Ghim một mục';
    $('pin-body').innerHTML = `<div class="pin-pick">
        <p>Chọn mục muốn thấy song song với mục đang viết:</p>
        ${TABS.filter(t => t.id !== dang).map(t =>
            `<button type="button" data-ghim="${t.id}"><i class="fas fa-thumbtack"></i> ${esc(t.ten)}</button>`).join('')}
    </div>`;
}

pin.addEventListener('click', e => {
    if (e.target.closest('#pin-x')) return boGhim();
    const g = e.target.closest('[data-ghim]');
    if (g) { $('pin-body').innerHTML = ''; ghim(g.dataset.ghim); }
});
addEventListener('resize', () => { if (pinNode && innerWidth < 1024) boGhim(); });

/* =====================================================================
   11. BẢNG PHÍM TẮT
   ===================================================================== */
const PHIM = [
    ['Ctrl K', 'Bảng lệnh: chạy việc, nhảy mục, tìm ô, tìm cả chữ đã gõ'],
    ['Ctrl S', 'Lưu bệnh án ngay'],
    ['Alt 1…7', 'Nhảy thẳng tới mục I…Theo dõi'],
    ['Alt ← / →', 'Quay lại / tiến tới ô vừa gõ (nhật ký chỗ đã đi)'],
    ['Ctrl ⇧ O', 'Toàn cảnh ca bệnh'],
    ['Ctrl ⇧ J', 'Trạm liên kết — việc tiếp theo'],
    ['Ctrl ⇧ Y', 'Dòng thời gian hợp nhất'],
    ['Ctrl ⇧ U', 'Câu hỏi bảo vệ bệnh án'],
    ['Ctrl ⇧ R', 'Tìm & thay thế toàn bệnh án'],
    ['Ctrl ⇧ L', 'Soi sợi dữ kiện đang bôi đen'],
    ['Ctrl ⇧ P', 'Chế độ trình bệnh'],
    ['Ctrl Z', 'Hoàn tác cả loạt ô vừa được điền tự động'],
    ['← →', 'Lật thẻ khi đang trình bệnh'],
    ['?', 'Mở bảng này'],
    ['Esc', 'Đóng bảng đang mở']
];

const pt = document.createElement('div');
pt.id = 'pt-box';
pt.className = 'mach hidden';
pt.innerHTML = `
    <div class="mach-bg" data-pt-close></div>
    <div class="mach-panel is-narrow">
        <div class="mach-head"><i class="fas fa-keyboard"></i><b>Phím tắt</b>
            <span class="mach-grow"></span>
            <button type="button" class="mach-x" data-pt-close aria-label="Đóng"><i class="fas fa-xmark"></i></button>
        </div>
        <div class="mach-body">
            <div class="pt-list">${PHIM.map(([k, v]) =>
                `<div class="pt-row"><kbd>${esc(k)}</kbd><span>${esc(v)}</span></div>`).join('')}</div>
        </div>
    </div>`;
document.body.appendChild(pt);
pt.addEventListener('click', e => {
    if (e.target.closest('[data-pt-close]') || e.target.classList.contains('mach-bg')) pt.classList.add('hidden');
});
const moPt = () => pt.classList.remove('hidden');

/* =====================================================================
   12. QUAY LẠI CHỖ CŨ
   Biểu mẫu 300 ô thì "chỗ vừa nãy" là thứ hay mất nhất: bấm sang mục khác
   tra một số rồi không tìm được đường về. Nhật ký chỗ đã đi chữa đúng đó.
   ===================================================================== */
const LAST_KEY = () => 'baOCu_' + recId();
let nhatKy = [], nkI = -1, nkKhoa = false;

form?.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!el.id || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.type === 'hidden') return;
    if (nkKhoa) return;                            // đang tự nhảy thì đừng ghi lại
    if (nhatKy[nkI] === el.id) return;
    nhatKy = nhatKy.slice(0, nkI + 1);
    nhatKy.push(el.id);
    if (nhatKy.length > 30) nhatKy.shift();
    nkI = nhatKy.length - 1;
    try { localStorage.setItem(LAST_KEY(), el.id); } catch { /* bộ nhớ đầy thì thôi */ }
});

function diNhatKy(n) {
    const i = nkI + n;
    if (i < 0 || i >= nhatKy.length) return showToast(n < 0 ? 'Đã ở đầu nhật ký.' : 'Đã ở cuối nhật ký.', 'info', 1500);
    nkI = i;
    const el = $(nhatKy[i]);
    if (!el) return;
    nkKhoa = true;
    goTo(el);
    setTimeout(() => { nkKhoa = false; }, 400);
}

/* Mở lại bệnh án: hỏi có về đúng ô đang viết dở không, KHÔNG tự nhảy —
   tự cuộn đi chỗ khác lúc vừa mở trang là mất phương hướng hơn. */
setTimeout(() => {
    let id = '';
    try { id = localStorage.getItem(LAST_KEY()) || ''; } catch { /* bỏ qua */ }
    const el = id && $(id);
    if (!el || !el.closest('.tab-content')) return;
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'tt-pill';
    pill.innerHTML = `<i class="fas fa-location-arrow"></i> Tiếp tục ở <b>${esc(labelOf(el))}</b>`;
    document.body.appendChild(pill);
    const tat = () => pill.remove();
    pill.addEventListener('click', () => { goTo(el); tat(); });
    setTimeout(tat, 12000);
}, 1800);

/* =====================================================================
   7. BẢNG LỆNH — nạp lệnh vào đúng ô tìm Ctrl+K đã có
   ===================================================================== */
addCmdSource(() => [
    { text: 'Lưu bệnh án', icon: 'fa-floppy-disk', hint: 'Ctrl S', run: () => click('save-button') },
    { text: 'Xem trước bản văn xuôi', icon: 'fa-file-lines', hint: 'bấm một câu là về ô gốc', run: () => click('preview-btn') },
    { text: 'Toàn cảnh ca bệnh', icon: 'fa-panorama', hint: 'Ctrl ⇧ O', run: () => click('ba-overview') },
    { text: 'Trạm liên kết — việc tiếp theo', icon: 'fa-list-check', hint: 'Ctrl ⇧ J', run: () => moTram('viec') },
    { text: 'Dòng thời gian hợp nhất', icon: 'fa-timeline', hint: 'Ctrl ⇧ Y', run: () => moTram('thoigian') },
    { text: 'Câu hỏi bảo vệ bệnh án', icon: 'fa-comments', hint: 'Ctrl ⇧ U', run: () => moTram('hoi') },
    { text: 'Tìm & thay thế toàn bệnh án', icon: 'fa-right-left', hint: 'Ctrl ⇧ R', run: () => moTram('thay') },
    { text: 'Soi sợi dữ kiện', icon: 'fa-share-nodes', hint: 'Ctrl ⇧ L', run: () => moSoi('') },
    { text: 'Chế độ trình bệnh', icon: 'fa-chalkboard-user', hint: 'Ctrl ⇧ P', run: moTrinhBenh },
    { text: 'Lịch sử phiên bản', icon: 'fa-clock-rotate-left', hint: 'khôi phục bản cũ', run: moLs },
    { text: pinNode ? 'Bỏ ghim mục' : 'Ghim mục để xem song song', icon: 'fa-thumbtack', hint: 'màn ≥1024px', run: chonGhim },
    { text: 'Bảng phím tắt', icon: 'fa-keyboard', hint: '?', run: moPt },
    { text: 'Nhảy tới ô còn trống kế tiếp', icon: 'fa-location-crosshairs', run: () => click('ba-gap') },
    { text: 'Thu gọn hết các khối', icon: 'fa-compress', run: () => click('ba-fold') },
    { text: 'Bật/tắt đọc đêm', icon: 'fa-moon', run: () => click('ba-night') },
    { text: 'Bật/tắt chế độ tập trung', icon: 'fa-mug-saucer', run: () => click('ba-zen') },
    { text: 'Bật/tắt chế độ riêng tư', icon: 'fa-eye-slash', hint: 'che tên bệnh nhân', run: () => click('ba-priv') },
    { text: 'Đổi cỡ chữ', icon: 'fa-font', run: () => click('ba-fs') },
    { text: 'Cài đặt bệnh án', icon: 'fa-sliders', hint: 'loại bệnh án, thông tin sinh viên', run: () => click('open-settings') },
    ...TABS.map(t => ({ text: `Mở mục ${t.ten}`, icon: 'fa-folder-open', group: 'Nhảy mục', run: () => moTab(t.id) }))
]);

/* =====================================================================
   Phím tắt + nút ở thanh công cụ
   ===================================================================== */
const dangGo = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')
    || document.activeElement?.isContentEditable;

document.addEventListener('keydown', (e) => {
    if (!tb.classList.contains('hidden')) {
        if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); return tbDi(1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); return tbDi(-1); }
        if (e.key === 'Escape') return dongTb();
    }
    if (e.key === 'Escape') { lsBox.classList.add('hidden'); pt.classList.add('hidden'); return; }

    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        return diNhatKy(e.key === 'ArrowLeft' ? -1 : 1);
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        return moTrinhBenh();
    }
    if (e.key === '?' && !dangGo()) { e.preventDefault(); moPt(); }
});

$('ba-trinh')?.addEventListener('click', moTrinhBenh);
$('ba-ls')?.addEventListener('click', moLs);
$('ba-ghim')?.addEventListener('click', chonGhim);
