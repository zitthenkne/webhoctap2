// tao-benh-an.js — Trang viết bệnh án
import { showToast } from '../../core/utils.js';
import { getRecord, saveRecord, syncFromCloud, authReady } from './record-store.js';
import { initCls, getCls, setCls } from './cls-editor.js';
import { abnormalItems, flagOf } from './cls-shared.js';

/* =====================================================================
   1. BẢN ĐỒ TRƯỜNG: dùng chung cho cả nạp và lưu, khỏi viết 2 lần
   ===================================================================== */
const FIELDS = {
    'hanhChinh.hoTen': 'patient-name',
    'hanhChinh.namSinh': 'patient-yob',
    'hanhChinh.tuoi': 'patient-age',
    'hanhChinh.gioiTinh': 'patient-gender',
    'hanhChinh.danToc': 'patient-ethnicity',
    'hanhChinh.ngheNghiep': 'patient-occupation',
    'hanhChinh.diaChi': 'patient-address',
    'hanhChinh.nguoiLienHe': 'contact-name',
    'hanhChinh.sdtLienHe': 'contact-phone',
    'hanhChinh.gioVaoVien': 'admission-time',
    'hanhChinh.ngayVaoVien': 'admission-date',
    'hanhChinh.ngayLamBenhAn': 'record-datetime',
    'hanhChinh.soGiuong': 'bed-number',
    'hanhChinh.soPhong': 'room-number',
    'hanhChinh.benhVien': 'hospital-name',
    'lyDoVaoVien': 'reason-for-admission',
    'benhSu': 'illness-history',
    'tienSu.noiKhoa': 'history-internal',
    'tienSu.ngoaiKhoa': 'history-surgery',
    'tienSu.sanPhuKhoa': 'history-obgyne',
    'tienSu.diUng': 'history-allergy',
    'tienSu.thoiQuen': 'history-habit',
    'tienSu.giaDinh': 'history-family',
    // Ô phụ để máy tự tính — lưu lại để mở bệnh án cũ vẫn còn số đã nhập
    'tienSu.para.duThang': 'para-1',
    'tienSu.para.thieuThang': 'para-2',
    'tienSu.para.say': 'para-3',
    'tienSu.para.conSong': 'para-4',
    'tienSu.thuocLa.dieuMoiNgay': 'smoke-cpd',
    'tienSu.thuocLa.tuTuoi': 'smoke-from',
    'tienSu.thuocLa.denTuoi': 'smoke-to',
    'tienSu.ruou.mlMoiNgay': 'alc-ml',
    'tienSu.ruou.doCon': 'alc-abv',
    'tienSu.ruou.soNam': 'alc-years',
    'khamBenh.sinhTon.mach': 'vital-pulse',
    'khamBenh.sinhTon.nhietDo': 'vital-temp',
    'khamBenh.sinhTon.huyetAp': 'vital-bp',
    'khamBenh.sinhTon.nhipTho': 'vital-resp',
    'khamBenh.sinhTon.spo2': 'vital-spo2',
    'khamBenh.sinhTon.chieuCao': 'vital-height',
    'khamBenh.sinhTon.canNang': 'vital-weight',
    'khamBenh.sinhTon.bmi': 'vital-bmi',
    'khamBenh.sinhTon.bsa': 'vital-bsa',
    'khamBenh.toanThan': 'exam-general',
    'khamBenh.theTrang': 'exam-physical',
    'khamBenh.daNiemMac': 'exam-skin-mucosa',
    'khamBenh.longTocMong': 'exam-hair-nail',
    'khamBenh.tuyenGiapHach': 'exam-thyroid-lymph',
    'khamBenh.phuXuatHuyet': 'exam-edema-bleed',
    'khamBenh.circulation': 'exam-circulation',
    'khamBenh.respiratory': 'exam-respiratory',
    'khamBenh.digestive': 'exam-digestive',
    'khamBenh.urinary': 'exam-urinary',
    'khamBenh.neuro': 'exam-neuro',
    'khamBenh.musculoskeletal': 'exam-musculoskeletal',
    'khamBenh.ent': 'exam-ent',
    'khamBenh.dental': 'exam-dental',
    'khamBenh.eye': 'exam-eye',
    'tomTatBenhAn': 'summary',
    'datVanDe': 'problem-list',
    'chanDoanSoBo': 'provisional-diagnosis',
    'chanDoanPhanBiet': 'differential-diagnosis',
    'bienLuanChanDoan': 'diagnosis-reasoning',
    'canLamSangDeNghi': 'labs-proposed',
    'bienLuanDeNghiCLS': 'labs-rationale',
    'ketQuaCanLamSang': 'labs-results',
    'bienLuanKetQuaCLS': 'labs-interpretation',
    'chanDoanXacDinh': 'final-diagnosis',
    'huongDieuTri': 'treatment-plan',
    'dieuTriCuThe': 'treatment-detail',
    'tienLuong': 'prognosis',
    'duPhong': 'prevention'
};

const $ = (id) => document.getElementById(id);

function setPath(obj, path, value) {
    const keys = path.split('.');
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) cur = (cur[keys[i]] ||= {});
    cur[keys.at(-1)] = value;
}
function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/* Ngày cũ lưu dạng dd/mm/yyyy, input type=date cần yyyy-mm-dd */
function toDateInput(v) {
    if (!v) return '';
    const m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : String(v);
}

function collectRecord() {
    const rec = { id: recordId, status: $('record-status').value };
    for (const [path, id] of Object.entries(FIELDS)) {
        setPath(rec, path, $(id)?.value ?? '');
    }
    rec.canLamSang = getCls();
    return rec;
}

function fillForm(rec) {
    if (rec.status) $('record-status').value = rec.status;
    for (const [path, id] of Object.entries(FIELDS)) {
        const el = $(id);
        if (!el) continue;
        let v = getPath(rec, path) ?? '';
        // tương thích bản cũ
        if (path === 'hanhChinh.soGiuong' && !v) v = rec.hanhChinh?.bedNumber || '';
        if (path === 'hanhChinh.soPhong' && !v) v = rec.hanhChinh?.roomNumber || '';
        if (el.type === 'date') v = toDateInput(v);
        el.value = v;
    }
    setCls(rec.canLamSang);
}

/* =====================================================================
   2. TAB + THANH TIẾN ĐỘ
   ===================================================================== */
const tabLinks = [...document.querySelectorAll('.tab-link')];
const tabContents = [...document.querySelectorAll('.tab-content')];

function showTab(tabId) {
    tabLinks.forEach(l => l.classList.toggle('active', l.dataset.tab === tabId));
    tabContents.forEach(c => c.classList.toggle('active', c.id === tabId));
    const link = tabLinks.find(l => l.dataset.tab === tabId);
    link?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try { sessionStorage.setItem('benhAnTab', tabId); } catch { }
}

tabLinks.forEach(link => link.addEventListener('click', () => showTab(link.dataset.tab)));

// Nút Trước / Tiếp ở cuối mỗi tab
tabContents.forEach(content => {
    const idx = tabLinks.findIndex(l => l.dataset.tab === content.id);
    const nav = document.createElement('div');
    nav.className = 'flex justify-between items-center gap-2 mt-6 pt-4 border-t border-pink-100';
    const mk = (target, html, primary) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'px-4 py-2.5 rounded-xl text-sm font-semibold transition ' +
            (primary ? 'bg-pink-500 text-white hover:bg-pink-600 shadow' : 'bg-pink-50 text-pink-600 hover:bg-pink-100 border border-pink-200');
        b.innerHTML = html;
        b.addEventListener('click', () => showTab(target.dataset.tab));
        return b;
    };
    nav.append(
        tabLinks[idx - 1] ? mk(tabLinks[idx - 1], '<i class="fas fa-arrow-left"></i> Trước') : document.createElement('span'),
        Object.assign(document.createElement('span'), { className: 'text-xs text-gray-400 font-medium', textContent: `${idx + 1}/${tabLinks.length}` }),
        tabLinks[idx + 1] ? mk(tabLinks[idx + 1], 'Tiếp <i class="fas fa-arrow-right"></i>', true) : document.createElement('span')
    );
    content.appendChild(nav);
});

/* Vuốt ngang để đổi mục — trên điện thoại nhanh hơn là với tay lên thanh tab */
const isTouch = window.matchMedia('(hover: none)').matches;
if (isTouch) {
    let sx = 0, sy = 0, tracking = false;
    const zone = document.querySelector('.page-card') || document.body;
    zone.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) { tracking = false; return; }
        sx = e.touches[0].clientX; sy = e.touches[0].clientY; tracking = true;
    }, { passive: true });
    zone.addEventListener('touchend', (e) => {
        if (!tracking) return;
        tracking = false;
        const dx = e.changedTouches[0].clientX - sx;
        const dy = e.changedTouches[0].clientY - sy;
        if (Math.abs(dx) < 70 || Math.abs(dy) > 50) return;
        const cur = tabLinks.findIndex(l => l.classList.contains('active'));
        const target = tabLinks[dx < 0 ? cur + 1 : cur - 1];
        if (target) showTab(target.dataset.tab);
    }, { passive: true });
}

/* Ô nhiều dòng tự cao theo nội dung: không phải cuộn bên trong ô nữa */
function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = Math.max(el.scrollHeight, 44) + 'px';
}
function growAll() {
    document.querySelectorAll('#medical-record-form textarea').forEach(autoGrow);
}

/* Nhóm dài thì cho thu gọn lại, đỡ phải cuộn dài trên điện thoại */
const foldGroups = [];   // [{ body, count }] để cập nhật số ô đã điền
function makeCollapsible(fs, startCollapsed) {
    if (!fs) return;
    const legend = fs.querySelector(':scope > legend');
    if (!legend) return;
    const body = document.createElement('div');
    while (fs.children.length > 1) body.appendChild(fs.children[1]);
    fs.appendChild(body);

    const count = document.createElement('span');
    count.className = 'fold-count';
    legend.appendChild(count);
    foldGroups.push({ body, count });

    const caret = document.createElement('i');
    caret.className = 'fas fa-chevron-down fold-caret';
    legend.appendChild(caret);
    legend.classList.add('foldable');
    legend.setAttribute('role', 'button');
    legend.setAttribute('tabindex', '0');

    const apply = (folded) => {
        body.hidden = folded;
        legend.classList.toggle('folded', folded);
        if (!folded) body.querySelectorAll('textarea').forEach(autoGrow);
    };
    apply(!!startCollapsed);
    const toggle = () => apply(!body.hidden);
    legend.addEventListener('click', toggle);
    legend.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
}
makeCollapsible(document.querySelector('#kham-benh fieldset fieldset'), isTouch);
makeCollapsible(document.querySelector('#lydo-tiensu fieldset'), false);

/** Đếm ô đã điền trong một vùng (bỏ ô ẩn, ô chỉ đọc, ô có sẵn giá trị mặc định) */
function countFilled(root) {
    const els = [...root.querySelectorAll('input:not([type=hidden]):not([readonly]), textarea, select')]
        .filter(el => !el.closest('.sticky-actions') && !el.closest('[data-nocount]'));
    return { total: els.length, filled: els.filter(el => String(el.value || '').trim()).length };
}

function updateProgress() {
    let total = 0, filled = 0;
    tabContents.forEach(content => {
        const c = countFilled(content);
        total += c.total; filled += c.filled;
        const pct = c.total ? Math.round(c.filled / c.total * 100) : 0;
        const link = tabLinks.find(l => l.dataset.tab === content.id);
        const dot = link?.querySelector('.tab-progress');
        if (dot) {
            dot.textContent = pct + '%';
            dot.className = 'tab-progress ' + (pct >= 80 ? 'is-full' : pct > 0 ? 'is-part' : 'is-empty');
        }
    });
    foldGroups.forEach(({ body, count }) => {
        const c = countFilled(body);
        count.textContent = `${c.filled}/${c.total}`;
        count.classList.toggle('is-full', c.total > 0 && c.filled === c.total);
    });
    const pct = total ? Math.round(filled / total * 100) : 0;
    const bar = $('overall-bar');
    if (bar) bar.style.width = pct + '%';
    const label = $('overall-pct');
    if (label) label.textContent = pct + '%';
}

/* =====================================================================
   3. TỰ ĐỘNG LƯU
   ===================================================================== */
let recordId = new URL(location.href).searchParams.get('id') || 'BA-' + Date.now();
let dirty = false;
let saveTimer = null;

function setSaveState(state, text) {
    const el = $('save-state');
    if (!el) return;
    const icons = {
        saving: '<i class="fas fa-circle-notch fa-spin text-pink-400"></i>',
        saved: '<i class="fas fa-check-circle text-green-500"></i>',
        idle: '<i class="fas fa-cloud text-gray-300"></i>',
        local: '<i class="fas fa-hdd text-amber-400"></i>'
    };
    el.innerHTML = (icons[state] || '') + ' <span>' + text + '</span>';
}

async function doSave({ silent = true, force = false } = {}) {
    if (!dirty && !force) return getRecord(recordId);
    setSaveState('saving', 'Đang lưu…');
    const rec = collectRecord();
    const res = await saveRecord(rec);
    dirty = false;
    const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    setSaveState(res.cloud ? 'saved' : 'local',
        res.cloud ? `Đã lưu ${time}` : `Đã lưu trên máy ${time}`);
    if (!silent) showToast('Đã lưu bệnh án.', 'success');
    return rec;
}

function scheduleSave() {
    if (!dirty) setSaveState('saving', 'Đang soạn…');
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => doSave(), 1200);
}

/* =====================================================================
   4. TÍNH TOÁN TỰ ĐỘNG
   ===================================================================== */
const THIS_YEAR = new Date().getFullYear();

/* Năm sinh <-> tuổi: điền ô nào máy cũng suy ra ô còn lại */
function calcAge() {
    const raw = $('patient-yob').value.trim();
    if (!raw) { $('patient-age').value = ''; return; }
    const yob = parseInt(raw);
    if (yob > 1900 && yob <= THIS_YEAR) $('patient-age').value = THIS_YEAR - yob;
}
function calcYob() {
    const age = parseInt($('patient-age').value.trim());
    if (!isNaN(age) && age >= 0 && age <= 120) $('patient-yob').value = THIS_YEAR - age;
    else if (!$('patient-age').value.trim()) $('patient-yob').value = '';
}

const BMI_TAGS = [
    [18.5, 'Gầy', 'text-blue-500'],
    [23, 'Bình thường', 'text-green-600'],
    [25, 'Thừa cân', 'text-amber-500'],
    [Infinity, 'Béo phì', 'text-red-500']
];
function calcBmi() {
    const cm = parseFloat($('vital-height').value);
    const h = cm / 100;
    const w = parseFloat($('vital-weight').value);
    const tag = $('bmi-tag');
    if (h > 0 && w > 0) {
        const bmi = w / (h * h);
        $('vital-bmi').value = bmi.toFixed(1);
        const hit = BMI_TAGS.find(([max]) => bmi < max);
        if (tag) { tag.textContent = hit[1]; tag.className = 'text-xs font-semibold mt-1 block ' + hit[2]; }
        // Diện tích da theo Du Bois — dùng để tính liều thuốc, chỉ số tim
        $('vital-bsa').value = (0.007184 * Math.pow(cm, 0.725) * Math.pow(w, 0.425)).toFixed(2);
    } else {
        $('vital-bmi').value = '';
        $('vital-bsa').value = '';
        if (tag) tag.textContent = '';
    }
}

/* Huyết áp: máy tự tính huyết áp trung bình, hiệu áp và phân độ THA */
const BP_STAGES = [
    [90, 60, 'Tụt huyết áp', 'text-red-500'],
    [120, 80, 'Tối ưu', 'text-green-600'],
    [130, 85, 'Bình thường', 'text-green-600'],
    [140, 90, 'Bình thường cao', 'text-amber-500'],
    [160, 100, 'Tăng huyết áp độ 1', 'text-orange-500'],
    [180, 110, 'Tăng huyết áp độ 2', 'text-red-500'],
    [Infinity, Infinity, 'Tăng huyết áp độ 3', 'text-red-600']
];
function calcBp() {
    const tag = $('bp-tag');
    if (!tag) return;
    const m = String($('vital-bp').value).match(/(\d{2,3})\s*[\/\-]\s*(\d{2,3})/);
    if (!m) { tag.textContent = ''; return; }
    const sys = +m[1], dia = +m[2];
    const map = Math.round((sys + 2 * dia) / 3);
    let stage = BP_STAGES.at(-1);
    if (sys < 90 || dia < 60) stage = BP_STAGES[0];
    else stage = BP_STAGES.find(([s, d]) => sys < s && dia < d) || BP_STAGES.at(-1);
    tag.textContent = `HATB ${map} mmHg · Hiệu áp ${sys - dia} · ${stage[2]}`;
    tag.className = 'text-xs font-semibold mt-1 block ' + stage[3];
}

/* Ngày điều trị thứ mấy = ngày làm bệnh án - ngày vào viện + 1 */
function calcStay() {
    const tag = $('stay-tag');
    if (!tag) return;
    const from = $('admission-date').value;
    const to = String($('record-datetime').value).slice(0, 10);
    if (!from || !to) { tag.textContent = ''; return; }
    const days = Math.round((new Date(to) - new Date(from)) / 86400000);
    tag.textContent = isNaN(days) || days < 0 ? '' : `Ngày điều trị thứ ${days + 1}`;
}

/* Hút thuốc lá: gói·năm = (số điếu/ngày ÷ 20) × số năm hút */
function calcSmoke() {
    const out = $('smoke-out');
    if (!out) return null;
    const cpd = parseFloat($('smoke-cpd').value);
    const from = parseFloat($('smoke-from').value);
    const ageNow = parseFloat($('patient-age').value) || (THIS_YEAR - parseFloat($('patient-yob').value));
    const toRaw = $('smoke-to').value.trim();
    const to = toRaw ? parseFloat(toRaw) : ageNow;
    if (!(cpd > 0) || !(from >= 0) || !(to > from)) {
        out.textContent = 'Nhập số điếu/ngày và tuổi bắt đầu để tính';
        out.parentElement.classList.remove('is-warn');
        return null;
    }
    const years = to - from;
    const py = (cpd / 20) * years;
    const text = `${cpd} điếu/ngày × ${years} năm = ${py.toFixed(1)} gói·năm`
        + (toRaw ? ` (đã ngưng lúc ${to} tuổi)` : ' (còn đang hút)');
    out.textContent = text + (py >= 20 ? ' — nguy cơ cao (≥20 gói·năm)' : '');
    out.parentElement.classList.toggle('is-warn', py >= 20);
    return { py, years, cpd, from, to, stopped: !!toRaw };
}

/* Rượu bia: g cồn/ngày = ml × %ABV × 0,789; 1 đơn vị cồn = 10 g */
function calcAlcohol() {
    const out = $('alc-out');
    if (!out) return null;
    const ml = parseFloat($('alc-ml').value);
    const abv = parseFloat($('alc-abv').value);
    const years = parseFloat($('alc-years').value);
    if (!(ml > 0) || !(abv > 0)) {
        out.textContent = 'Nhập lượng và độ cồn để quy đổi';
        out.parentElement.classList.remove('is-warn');
        return null;
    }
    const grams = ml * (abv / 100) * 0.789;
    const units = grams / 10;
    const male = $('patient-gender').value !== 'Nữ';
    const risky = units > (male ? 2 : 1);
    out.textContent = `${grams.toFixed(0)} g cồn/ngày ≈ ${units.toFixed(1)} đơn vị cồn/ngày`
        + (years > 0 ? ` × ${years} năm` : '') + (risky ? ' — vượt ngưỡng khuyến cáo' : '');
    out.parentElement.classList.toggle('is-warn', risky);
    return { grams, units, years };
}

/** Thêm một dòng vào ô nhiều dòng, thay dòng cũ cùng chủ đề nếu có */
function upsertLine(id, prefixRe, line) {
    const el = $(id);
    if (!el) return;
    const kept = el.value.split('\n').filter(l => l.trim() && !prefixRe.test(l.trim()));
    el.value = [...kept, line].join('\n');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    autoGrow(el);
}

/* Bệnh nhân nữ: làm nổi phần sản phụ khoa để không quên hỏi PARA */
function syncGenderUi() {
    const female = $('patient-gender').value === 'Nữ';
    const box = $('obgyne-box');
    if (!box) return;
    box.classList.toggle('is-female', female);
    box.classList.toggle('is-male', !female);
    $('obgyne-flag')?.classList.toggle('hidden', !female);
}

// Cảnh báo sinh hiệu bất thường (viền cam, không chặn nhập)
const VITAL_RANGE = {
    'vital-pulse': [60, 100], 'vital-temp': [36, 37.5],
    'vital-resp': [12, 20], 'vital-spo2': [95, 100]
};
function flagVital(el) {
    const range = VITAL_RANGE[el.id];
    if (!range) return;
    const v = parseFloat(el.value);
    el.classList.toggle('vital-warn', !isNaN(v) && (v < range[0] || v > range[1]));
}

/* =====================================================================
   5. CHIP GỢI Ý NHANH
   ===================================================================== */
const nowTime = () => new Date().toTimeString().slice(0, 5);
const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const QUICK_FILL = {
    'admission-time': [['Bây giờ', nowTime]],
    'admission-date': [['Hôm nay', todayISO]],
    'reason-for-admission': ['Sốt', 'Ho', 'Khó thở', 'Đau ngực', 'Đau bụng', 'Đau đầu', 'Chóng mặt', 'Nôn ói', 'Tiêu chảy', 'Phù', 'Mệt mỏi'],
    'history-internal': ['Chưa ghi nhận bệnh lý nội khoa', 'Tăng huyết áp', 'Đái tháo đường type 2', 'Rối loạn lipid máu', 'Viêm dạ dày'],
    'history-surgery': ['Chưa ghi nhận tiền căn ngoại khoa', 'Mổ lấy thai', 'Cắt ruột thừa'],
    'history-obgyne': ['Kinh nguyệt đều', 'PARA', 'Đã mãn kinh'],
    'history-allergy': ['Chưa ghi nhận dị ứng thuốc, thức ăn'],
    'history-habit': ['Không hút thuốc lá, không uống rượu bia', 'Hút thuốc lá', 'Uống rượu bia thường xuyên'],
    'history-family': ['Chưa ghi nhận bệnh lý tương tự trong gia đình', 'Gia đình có người tăng huyết áp', 'Gia đình có người đái tháo đường'],
    'exam-general': ['Bệnh nhân tỉnh, tiếp xúc tốt', 'Không sốt', 'Sinh hiệu ổn'],
    'exam-physical': ['Thể trạng trung bình', 'Gầy', 'Thừa cân – béo phì'],
    'exam-skin-mucosa': ['Da niêm hồng', 'Da niêm nhạt', 'Không vàng da'],
    'exam-hair-nail': ['Lông, tóc, móng không dễ gãy rụng'],
    'exam-thyroid-lymph': ['Tuyến giáp không to, hạch ngoại vi sờ không chạm'],
    'exam-edema-bleed': ['Không phù, không xuất huyết da niêm'],
    'exam-circulation': ['Tim đều, T1 T2 rõ, không âm thổi', 'Mỏm tim khoang liên sườn V đường trung đòn trái'],
    'exam-respiratory': ['Lồng ngực cân đối, di động đều theo nhịp thở', 'Rì rào phế nang êm dịu 2 phế trường, không rale'],
    'exam-digestive': ['Bụng mềm, không điểm đau khu trú', 'Gan lách sờ không chạm'],
    'exam-urinary': ['Chạm thận (-), bập bềnh thận (-)', 'Ấn các điểm niệu quản không đau'],
    'exam-neuro': ['Cổ mềm, không dấu thần kinh định vị'],
    'exam-musculoskeletal': ['Không giới hạn vận động, không biến dạng khớp'],
    'exam-ent': ['Chưa ghi nhận bất thường'],
    'exam-dental': ['Chưa ghi nhận bất thường'],
    'exam-eye': ['Chưa ghi nhận bất thường'],
    'labs-proposed': ['Công thức máu', 'Sinh hóa máu: ure, creatinine, AST, ALT, ion đồ', 'Đường huyết', 'CRP', 'Tổng phân tích nước tiểu', 'X-quang ngực thẳng', 'ECG', 'Siêu âm bụng tổng quát'],
    'prognosis': ['Tiên lượng gần: khá', 'Tiên lượng xa: dè dặt'],
    'prevention': ['Tuân thủ điều trị, tái khám đúng hẹn', 'Chế độ ăn hợp lý, tập luyện đều đặn']
};

function buildChips() {
    for (const [id, items] of Object.entries(QUICK_FILL)) {
        const el = $(id);
        if (!el) continue;
        const wrap = document.createElement('div');
        wrap.className = 'chips';
        items.forEach(item => {
            const [label, getValue] = Array.isArray(item) ? item : [item, () => item];
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'chip';
            btn.textContent = label;
            btn.addEventListener('click', () => {
                const text = getValue();
                if (el.tagName === 'TEXTAREA' && el.value.trim()) {
                    el.value = el.value.replace(/\s+$/, '') + '\n' + text;
                } else {
                    el.value = text;
                }
                el.dispatchEvent(new Event('input', { bubbles: true }));
            });
            wrap.appendChild(btn);
        });
        el.insertAdjacentElement('afterend', wrap);
    }
}

/* Mẫu "khám bình thường": điền một lượt các mục khám không bất thường */
const NORMAL_EXAM = {
    'exam-general': 'Bệnh nhân tỉnh, tiếp xúc tốt, sinh hiệu ổn',
    'exam-physical': 'Thể trạng trung bình',
    'exam-skin-mucosa': 'Da niêm hồng, không vàng da',
    'exam-hair-nail': 'Lông, tóc, móng không dễ gãy rụng',
    'exam-thyroid-lymph': 'Tuyến giáp không to, hạch ngoại vi sờ không chạm',
    'exam-edema-bleed': 'Không phù, không xuất huyết da niêm',
    'exam-circulation': 'Tim đều, T1 T2 rõ, không âm thổi',
    'exam-respiratory': 'Lồng ngực cân đối, rì rào phế nang êm dịu 2 phế trường, không rale',
    'exam-digestive': 'Bụng mềm, không điểm đau khu trú, gan lách sờ không chạm',
    'exam-urinary': 'Chạm thận (-), bập bềnh thận (-), ấn các điểm niệu quản không đau',
    'exam-neuro': 'Cổ mềm, không dấu thần kinh định vị',
    'exam-musculoskeletal': 'Không giới hạn vận động, không biến dạng khớp',
    'exam-ent': 'Chưa ghi nhận bất thường',
    'exam-dental': 'Chưa ghi nhận bất thường',
    'exam-eye': 'Chưa ghi nhận bất thường'
};

/* =====================================================================
   6. TÓM TẮT TỰ ĐỘNG
   ===================================================================== */
function buildSummary() {
    const v = (id) => ($(id)?.value || '').trim();
    const gender = v('patient-gender');
    const genderText = gender === 'Nam' ? 'Bệnh nhân nam' : gender === 'Nữ' ? 'Bệnh nhân nữ'
        : gender ? 'Bệnh nhân ' + gender.toLowerCase() : 'Bệnh nhân';
    const age = v('patient-age') || (v('patient-yob') ? new Date().getFullYear() - parseInt(v('patient-yob')) : '');
    const ageText = age ? `, ${age} tuổi` : '';
    const reason = v('reason-for-admission');

    let out = `${genderText}${ageText}${reason ? ', vào viện vì ' + reason : ''}.`;

    const organs = ['exam-circulation', 'exam-respiratory', 'exam-digestive', 'exam-urinary',
        'exam-neuro', 'exam-musculoskeletal', 'exam-ent', 'exam-dental', 'exam-eye']
        .map(v).filter(Boolean).join('; ');
    const findings = [v('illness-history'), v('exam-general'), organs,
    v('provisional-diagnosis') && 'Chẩn đoán sơ bộ: ' + v('provisional-diagnosis')].filter(Boolean);
    if (findings.length) {
        out += '\n\nQua hỏi bệnh và thăm khám phát hiện các hội chứng và triệu chứng sau:';
        findings.forEach(f => { out += '\n- ' + f; });
    }

    const vitals = [
        v('vital-pulse') && `Mạch ${v('vital-pulse')} l/p`,
        v('vital-temp') && `Nhiệt độ ${v('vital-temp')}°C`,
        v('vital-bp') && `Huyết áp ${v('vital-bp')} mmHg`,
        v('vital-resp') && `Nhịp thở ${v('vital-resp')} l/p`,
        v('vital-spo2') && `SpO2 ${v('vital-spo2')}%`
    ].filter(Boolean);
    if (vitals.length) out += `\n\nSinh hiệu: ${vitals.join(', ')}.`;

    const history = [
        ['Nội khoa', v('history-internal')], ['Ngoại khoa', v('history-surgery')],
        ['Sản phụ khoa', v('history-obgyne')], ['Dị ứng', v('history-allergy')],
        ['Thói quen', v('history-habit')], ['Gia đình', v('history-family')]
    ].filter(([, val]) => val);
    if (history.length) {
        out += '\n\nTiền sử:';
        history.forEach(([k, val]) => { out += `\n- ${k}: ${val}`; });
    }

    const abn = abnormalItems(getCls());
    if (abn.length) {
        out += '\n\nCận lâm sàng bất thường: ' + abn
            .map(i => `${i.n} ${i.v}${i.u ? ' ' + i.u : ''} ${i.flag === 'high' ? '↑' : '↓'}`).join(', ') + '.';
    }
    return out.trim();
}

/* =====================================================================
   6b. ĐẶT VẤN ĐỀ TỰ ĐỘNG — gom bất thường thành danh sách vấn đề
   ===================================================================== */
const CLS_PROBLEM = [
    ['HGB', 'low', 'Thiếu máu'],
    ['HCT', 'low', 'Thiếu máu'],
    ['WBC', 'high', 'Tăng bạch cầu'],
    ['WBC', 'low', 'Giảm bạch cầu'],
    ['NEU', 'high', 'Tăng bạch cầu đa nhân trung tính'],
    ['PLT', 'low', 'Giảm tiểu cầu'],
    ['CRP', 'high', 'Hội chứng viêm (CRP tăng)'],
    ['eGFR', 'low', 'Giảm độ lọc cầu thận'],
    ['Creatinine', 'high', 'Tăng creatinine máu'],
    ['Ure', 'high', 'Tăng ure máu'],
    ['K+', 'high', 'Tăng kali máu'],
    ['K+', 'low', 'Hạ kali máu'],
    ['Na+', 'high', 'Tăng natri máu'],
    ['Na+', 'low', 'Hạ natri máu'],
    ['Glucose', 'high', 'Tăng đường huyết'],
    ['Glucose', 'low', 'Hạ đường huyết'],
    ['HbA1c', 'high', 'HbA1c tăng'],
    ['AST', 'high', 'Tăng men gan'],
    ['ALT', 'high', 'Tăng men gan'],
    ['Bilirubin toàn phần', 'high', 'Tăng bilirubin máu'],
    ['Albumin', 'low', 'Giảm albumin máu'],
    ['Troponin T hs', 'high', 'Tăng troponin'],
    ['NT-proBNP', 'high', 'NT-proBNP tăng'],
    ['LDL-C', 'high', 'Rối loạn lipid máu'],
    ['Triglyceride', 'high', 'Rối loạn lipid máu'],
    ['INR', 'high', 'Rối loạn đông máu'],
    ['pH', 'low', 'Toan máu'],
    ['pH', 'high', 'Kiềm máu'],
    ['PaO2', 'low', 'Giảm oxy máu'],
    ['Lactate', 'high', 'Tăng lactate máu']
];

function buildProblems() {
    const v = (id) => ($(id)?.value || '').trim();
    const items = [];
    const add = (t) => { if (t && !items.includes(t)) items.push(t); };

    if (v('reason-for-admission')) add(v('reason-for-admission').replace(/\.$/, ''));

    // Sinh hiệu
    const num = (id) => parseFloat(v(id));
    if (num('vital-temp') > 37.5) add('Sốt');
    if (num('vital-temp') < 36) add('Hạ thân nhiệt');
    if (num('vital-pulse') > 100) add('Nhịp tim nhanh');
    if (num('vital-pulse') < 60) add('Nhịp tim chậm');
    if (num('vital-resp') > 20) add('Thở nhanh');
    if (num('vital-spo2') < 95) add('Giảm SpO2');
    const bp = v('vital-bp').match(/(\d{2,3})\s*[\/\-]\s*(\d{2,3})/);
    if (bp && (+bp[1] >= 140 || +bp[2] >= 90)) add('Tăng huyết áp');
    if (bp && (+bp[1] < 90 || +bp[2] < 60)) add('Tụt huyết áp');
    const bmi = parseFloat(v('vital-bmi'));
    if (bmi >= 25) add('Thừa cân – béo phì');
    if (bmi && bmi < 18.5) add('Suy dinh dưỡng / gầy');

    // Cận lâm sàng
    abnormalItems(getCls()).forEach(i => {
        const hit = CLS_PROBLEM.find(([n, f]) => n.toLowerCase() === i.n.toLowerCase() && f === i.flag);
        add(hit ? hit[2] : `${i.n} ${i.flag === 'high' ? 'tăng' : 'giảm'} (${i.v}${i.u ? ' ' + i.u : ''})`);
    });

    // Bệnh nền đã biết
    v('history-internal').split(/[\n,;]/).map(s => s.trim())
        .filter(s => s && !/^chưa ghi nhận/i.test(s)).forEach(add);

    return items.map((t, i) => `${i + 1}. ${t}`).join('\n');
}

/* =====================================================================
   7. KHỞI ĐỘNG
   ===================================================================== */
const form = $('medical-record-form');
$('medical-record-id').value = recordId;

buildChips();

// Nạp bệnh án cũ (ưu tiên bản trên máy, không có thì hỏi cloud)
(async function loadExisting() {
    let rec = getRecord(recordId);
    if (!rec && await authReady()) {
        // Bệnh án có thể được tạo ở máy khác
        await syncFromCloud();
        rec = getRecord(recordId);
    }
    if (rec) {
        fillForm(rec);
        setSaveState('idle', 'Đã mở bệnh án đã lưu');
    } else {
        // Bệnh án mới: điền sẵn ngày giờ làm bệnh án
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        $('record-datetime').value = now.toISOString().slice(0, 16);
        setSaveState('idle', 'Bệnh án mới — tự động lưu khi bạn gõ');
    }
    calcBmi();
    Object.keys(VITAL_RANGE).forEach(id => $(id) && flagVital($(id)));
    growAll();
    updateProgress();
    // Mở lại tab đang xem dở — chỉ khi sửa bệnh án cũ, bệnh án mới luôn bắt đầu ở tab I
    try {
        const last = sessionStorage.getItem('benhAnTab');
        if (rec && last && tabLinks.some(l => l.dataset.tab === last)) showTab(last);
        else sessionStorage.removeItem('benhAnTab');
    } catch { }
})();

// Mọi thay đổi -> tính lại + hẹn giờ lưu
form.addEventListener('input', (e) => {
    const el = e.target;
    if (el.id === 'patient-name') {
        const pos = el.selectionStart;
        el.value = el.value.toUpperCase();
        el.setSelectionRange?.(pos, pos);
    }
    if (el.id === 'patient-yob') calcAge();
    if (el.id === 'vital-height' || el.id === 'vital-weight') calcBmi();
    if (VITAL_RANGE[el.id]) flagVital(el);
    if (el.tagName === 'TEXTAREA') autoGrow(el);
    updateProgress();
    scheduleSave();
});
form.addEventListener('change', () => { updateProgress(); scheduleSave(); });

// Mobile: ẩn thanh nút khi bàn phím mở
form.addEventListener('focusin', (e) => {
    if (e.target.matches('input, textarea, select') && !e.target.closest('.sticky-actions')) {
        document.body.classList.add('typing');
    }
});
form.addEventListener('focusout', () => setTimeout(() => {
    const a = document.activeElement;
    if (!a || !a.matches('input, textarea, select') || a.closest('.sticky-actions')) {
        document.body.classList.remove('typing');
    }
}, 100));

// Tóm tắt tự động
$('auto-summary-btn')?.addEventListener('click', () => {
    $('summary').value = buildSummary();
    $('summary').dispatchEvent(new Event('input', { bubbles: true }));
    autoGrow($('summary'));
    showToast('Đã tạo tóm tắt từ dữ liệu đã nhập.', 'success');
});

// Mẫu khám bình thường
$('normal-exam-btn')?.addEventListener('click', () => {
    let n = 0;
    for (const [id, text] of Object.entries(NORMAL_EXAM)) {
        const el = $(id);
        if (el && !el.value.trim()) { el.value = text; n++; }
    }
    growAll(); updateProgress(); scheduleSave();
    showToast(n ? `Đã điền ${n} mục khám bình thường (chỉ điền ô còn trống).` : 'Các mục khám đều đã có nội dung.', n ? 'success' : 'info');
});

// Xem trước
$('preview-btn')?.addEventListener('click', async () => {
    if (!$('patient-name').value.trim()) {
        showTab('hanh-chinh'); $('patient-name').focus();
        showToast('Nhập họ tên bệnh nhân trước khi xem trước.', 'warning');
        return;
    }
    await doSave({ force: true });
    location.href = 'xem-benh-an.html?id=' + encodeURIComponent(recordId);
});

// Lưu & đóng
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('patient-name').value.trim();
    const reason = $('reason-for-admission').value.trim();
    if (!name) {
        showTab('hanh-chinh'); $('patient-name').focus();
        showToast('Vui lòng nhập họ tên bệnh nhân.', 'warning');
        return;
    }
    if (!reason) {
        showTab('lydo-tiensu'); $('reason-for-admission').focus();
        showToast('Vui lòng nhập lý do vào viện.', 'warning');
        return;
    }
    // Đánh dấu Hoàn thành mà còn thiếu mục quan trọng thì nhắc một lần
    if ($('record-status').value === 'Hoàn thành') {
        const missing = [
            ['summary', 'Tóm tắt bệnh án'], ['provisional-diagnosis', 'Chẩn đoán sơ bộ'],
            ['final-diagnosis', 'Chẩn đoán xác định'], ['treatment-plan', 'Hướng điều trị']
        ].filter(([id]) => !$(id).value.trim()).map(([, ten]) => ten);
        if (missing.length && !confirm(`Bệnh án còn thiếu: ${missing.join(', ')}.
Vẫn lưu là "Hoàn thành"?`)) {
            showTab('chan-doan-dieu-tri');
            return;
        }
    }

    const btn = $('save-button');
    btn.disabled = true;
    btn.querySelector('.button-text').classList.add('hidden');
    btn.querySelector('.button-spinner').classList.remove('hidden');
    await doSave({ force: true });
    location.href = '../study-room/waiting-room.html';
});

// Ctrl/Cmd + S
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        doSave({ silent: false, force: true });
    }
});

// Rời trang khi còn nội dung chưa kịp lưu
const saveOnLeave = () => { if (dirty) doSave(); };
window.addEventListener('beforeunload', saveOnLeave);
window.addEventListener('pagehide', saveOnLeave);
