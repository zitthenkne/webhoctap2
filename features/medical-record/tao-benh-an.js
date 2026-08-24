// tao-benh-an.js — Trang viết bệnh án
import { showToast } from '../../core/utils.js';
import { getRecord, saveRecord, syncFromCloud, authReady } from './record-store.js';
import { initCls, getCls, setCls } from './cls-editor.js';
import { abnormalItems } from './cls-shared.js';
import { initHistory, getSteps, setSteps, calcOnset, buildProse, missingDetails } from './benh-su-editor.js';
import { initBienLuan, getBienLuan, setBienLuan, buildProse as buildBienLuan, derivedDiagnosis, derivedCls, syncFromProblems } from './bien-luan-editor.js';
import { createCnvList } from './cnv-list.js';
import { createBenhKemList } from './benh-kem-list.js';
import { BMI_TAGS, BP_STAGES } from './chi-so-chuan.js';
import { buildChips, buildPickers, NORMAL_EXAM } from './goi-y-nhap.js';
import { suggestStage, pastDiseases } from './muc-do-benh-kem.js';
import { initFindings } from './findings-editor.js';
import { getFolder, folderMeta } from './folder-store.js';
import { initFold, openSpec } from './ui-fold.js';
import { initTheoDoi, getTheoDoi, setTheoDoi } from './theo-doi-editor.js';
import { createImageBox } from './image-upload.js';
import { initRx, getRx, setRx, rxToText } from './rx-editor.js';
import { gradeAll, gradeToText } from './auto-grade.js';

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
    'hanhChinh.khoa': 'department-name',
    'loaiBenhAn': 'record-type',
    'sinhVien.hoTen': 'stu-name',
    'sinhVien.mssv': 'stu-id',
    'sinhVien.lop': 'stu-class',
    'sinhVien.stt': 'stu-no',
    'lyDoVaoVien': 'reason-for-admission',
    'benhSu': 'illness-history',
    'benhSuChiTiet.nguoiKhai': 'hx-informant',
    'benhSuChiTiet.quanHe': 'hx-relation',
    'benhSuChiTiet.doTinCay': 'hx-reliability',
    'benhSuChiTiet.ngayKhoiPhat': 'hx-onset-date',
    'benhSuChiTiet.trieuChung.ten': 'hx-sym-name',
    'benhSuChiTiet.trieuChung.viTri': 'hx-sym-site',
    'benhSuChiTiet.trieuChung.tinhChat': 'hx-sym-char',
    'benhSuChiTiet.trieuChung.mucDo': 'hx-sym-severity',
    'benhSuChiTiet.trieuChung.thoiGian': 'hx-sym-time',
    'benhSuChiTiet.trieuChung.tangGiam': 'hx-sym-factors',
    'benhSuChiTiet.trieuChung.kemTheo': 'hx-sym-assoc',
    'benhSuChiTiet.trieuChung.daXuTri': 'hx-sym-treated',
    'benhSuChiTiet.toanThan': 'hx-general',
    'benhSuChiTiet.amTinh': 'hx-negatives',
    'benhSuChiTiet.lucNhapVien': 'hx-admit-state',
    'benhSuChiTiet.sinhHieuNhapVien.mach': 'adm-pulse',
    'benhSuChiTiet.sinhHieuNhapVien.huyetAp': 'adm-bp',
    'benhSuChiTiet.sinhHieuNhapVien.nhietDo': 'adm-temp',
    'benhSuChiTiet.sinhHieuNhapVien.nhipTho': 'adm-resp',
    'benhSuChiTiet.sinhHieuNhapVien.spo2': 'adm-spo2',
    'benhSuChiTiet.sinhHieuNhapVien.ghiChu': 'adm-note',
    'benhSuChiTiet.sauNhapVien': 'hx-after-admit',
    'tienSu.noiKhoa': 'history-internal',
    'tienSu.ngoaiKhoa': 'history-surgery',
    'tienSu.sanPhuKhoa': 'history-obgyne',
    'tienSu.diUng': 'history-allergy',
    'tienSu.moiTruong': 'history-environment',
    // Sản khoa
    'sanKhoa.kinhChot': 'ob-lmp',
    'sanKhoa.vongKinh': 'ob-cycle',
    'sanKhoa.bcTC': 'ob-bctc',
    'sanKhoa.vongBung': 'ob-vb',
    'sanKhoa.timThai': 'ob-fhr',
    'sanKhoa.conCo': 'ob-contraction',
    'sanKhoa.coTuCung': 'ob-cervix',
    'sanKhoa.ngoiThai': 'ob-position',
    'sanKhoa.oi': 'ob-amniotic',
    'sanKhoa.khungChau': 'ob-pelvis',
    // Nhi khoa
    'nhiKhoa.tuoiThang': 'ped-months',
    'nhiKhoa.lieuMgKg': 'ped-dose',
    'nhiKhoa.sanKhoaLucSinh': 'ped-birth',
    'nhiKhoa.dinhDuong': 'ped-nutrition',
    'nhiKhoa.chungNgua': 'ped-vaccine',
    'nhiKhoa.phatTrien': 'ped-development',
    // Cấp cứu
    'capCuu.uuTien': 'cc-triage',
    'capCuu.thoiDiem': 'cc-time',
    'capCuu.a': 'cc-a',
    'capCuu.b': 'cc-b',
    'capCuu.c': 'cc-c',
    'capCuu.d': 'cc-d',
    'capCuu.e': 'cc-e',
    'capCuu.xuTriBanDau': 'cc-initial',
    // Chấn thương (ngoại khoa)
    'chanThuong.loai': 'tr-type',
    'chanThuong.thoiDiem': 'tr-time',
    'chanThuong.vanTocDoCao': 'tr-energy',
    'chanThuong.baoHo': 'tr-protect',
    'chanThuong.viTriVaDap': 'tr-impact',
    'chanThuong.vatGayThuongTich': 'tr-object',
    'chanThuong.batTinh': 'tr-loc',
    'chanThuong.quenSuViec': 'tr-amnesia',
    'chanThuong.non': 'tr-vomit',
    'chanThuong.vanDong': 'tr-walk',
    'chanThuong.soCuu': 'tr-firstaid',
    'chanThuong.chuyenVien': 'tr-transport',
    'chanThuong.bongDoSau': 'tr-burn-depth',
    'chanThuong.bongTacNhan': 'tr-burn-agent',
    // Ngoại khoa
    'phauThuat.ngayGio': 'sx-datetime',
    'phauThuat.phuongPhap': 'sx-method',
    'phauThuat.voCam': 'sx-anesthesia',
    'phauThuat.danLuu': 'sx-drain',
    'phauThuat.chanDoanTruocMo': 'sx-pre-dx',
    'phauThuat.chanDoanSauMo': 'sx-post-dx',
    'phauThuat.tuongTrinh': 'sx-report',
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
    'tienSu.ruou.thucUong': 'alc-drink',
    'tienSu.ruou.soLuongMoiLan': 'alc-qty',
    'tienSu.ruou.tanSuat': 'alc-freq',
    'tienSu.ruou.dungTich': 'alc-vol',
    'tienSu.ruou.doCon': 'alc-abv',
    'tienSu.ruou.tuTuoi': 'alc-from',
    'tienSu.ruou.denTuoi': 'alc-to',
    'khamBenh.sinhTon.mach': 'vital-pulse',
    'khamBenh.sinhTon.nhietDo': 'vital-temp',
    'khamBenh.sinhTon.huyetAp': 'vital-bp',
    'khamBenh.sinhTon.nhipTho': 'vital-resp',
    'khamBenh.sinhTon.spo2': 'vital-spo2',
    'khamBenh.sinhTon.chieuCao': 'vital-height',
    'khamBenh.sinhTon.canNang': 'vital-weight',
    'khamBenh.sinhTon.bmi': 'vital-bmi',
    'khamBenh.sinhTon.bsa': 'vital-bsa',
    'khamBenh.glasgow.e': 'gcs-e',
    'khamBenh.glasgow.v': 'gcs-v',
    'khamBenh.glasgow.m': 'gcs-m',
    'khamBenh.roiLoanTriGiac': 'curb-confusion',
    // V. Lược qua các cơ quan (cơ năng)
    'luocQuaCoQuan.timMach': 'ros-cardio',
    'luocQuaCoQuan.hoHap': 'ros-resp',
    'luocQuaCoQuan.tieuHoa': 'ros-gi',
    'luocQuaCoQuan.thanKinh': 'ros-neuro',
    'luocQuaCoQuan.coXuongKhop': 'ros-msk',
    'luocQuaCoQuan.thanNieu': 'ros-uro',
    // VI. Khám lâm sàng theo 7 nhóm như mẫu bệnh án của trường
    'khamBenh.tongTrang': 'exam-general',
    'khamBenh.dauMatCo': 'exam-head',
    'khamBenh.nguc': 'exam-chest',
    'khamBenh.tim': 'exam-heart',
    'khamBenh.phoi': 'exam-lung',
    'khamBenh.bung': 'exam-abdomen',
    'khamBenh.thanKinhCoXuongKhop': 'exam-neuro-msk',
    'tomTatBenhAn': 'summary',
    'datVanDe': 'problem-list',
    'chanDoanSoBo': 'provisional-diagnosis',
    'chanDoanSoBoChiTiet.benhChinh': 'dx1-main',
    'chanDoanSoBoChiTiet.bienChung': 'dx1-comp',
    'chanDoanSoBoChiTiet.benhKem': 'dx1-assoc',
    'chanDoanSoBoChiTiet.mucDo': 'dx1-stage',
    'chanDoanPhanBiet': 'differential-diagnosis',
    'bienLuanChanDoan': 'diagnosis-reasoning',
    'canLamSangDeNghi': 'labs-proposed',
    'bienLuanDeNghiCLS': 'labs-rationale',
    'ketQuaCanLamSang': 'labs-results',
    'chanDoanXacDinh': 'final-diagnosis',
    'chanDoanXacDinhChiTiet.benhChinh': 'dx2-main',
    'chanDoanXacDinhChiTiet.bienChung': 'dx2-comp',
    'chanDoanXacDinhChiTiet.benhKem': 'dx2-assoc',
    'chanDoanXacDinhChiTiet.mucDo': 'dx2-stage',
    'huongDieuTri': 'treatment-plan',
    'dieuTriCuThe': 'treatment-detail',
    'tienLuong': 'prognosis'
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
    setPath(rec, 'benhSuChiTiet.mocs', getSteps());
    rec.bienLuan = getBienLuan();
    rec.theoDoi = getTheoDoi();
    rec.anhKham = imgExam ? imgExam.get() : [];
    rec.anhHoSo = imgHoSo ? imgHoSo.get() : [];
    rec.yLenhThuoc = getRx();
    if (currentFolder) rec.thuMuc = { ...currentFolder };
    setPath(rec, 'tienSu.noiKhoaMoc', cnvInternal ? cnvInternal.get() : []);
    setPath(rec, 'tienSu.ngoaiKhoaMoc', cnvSurgery ? cnvSurgery.get() : []);
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
    migrateOldExam(rec);
    setCls(rec.canLamSang);
    setSteps(rec.benhSuChiTiet?.mocs);
    setBienLuan(rec.bienLuan);
    setTheoDoi(rec.theoDoi);
    imgExam?.set(rec.anhKham);
    imgHoSo?.set(rec.anhHoSo);
    setRx(rec.yLenhThuoc);
    cnvInternal?.set(rec.tienSu?.noiKhoaMoc);
    cnvSurgery?.set(rec.tienSu?.ngoaiKhoaMoc);
}

/* Bản cũ khám theo hệ cơ quan (tuần hoàn / hô hấp / tiêu hóa…), mẫu mới khám theo
   7 nhóm giải phẫu. Gộp lại một lần khi mở bệnh án cũ để không mất chữ đã ghi. */
function migrateOldExam(rec) {
    const k = rec.khamBenh || {};
    const join = (...xs) => xs.map(x => String(x || '').trim()).filter(Boolean).join('\n');
    const put = (id, text) => { if (text && !$(id).value.trim()) $(id).value = text; };
    put('exam-general', join(k.toanThan, k.theTrang, k.daNiemMac, k.longTocMong, k.phuXuatHuyet));
    put('exam-head', join(k.tuyenGiapHach, k.ent, k.dental, k.eye));
    put('exam-heart', k.circulation);
    put('exam-lung', k.respiratory);
    put('exam-abdomen', join(k.digestive, k.urinary));
    put('exam-neuro-msk', join(k.neuro, k.musculoskeletal));
    // Hai mục cũ không còn trong mẫu -> dồn vào phần biện luận / tiên lượng
    if (rec.bienLuanKetQuaCLS && $('diagnosis-reasoning')) {
        const el = $('diagnosis-reasoning');
        if (!el.value.includes(rec.bienLuanKetQuaCLS)) el.value = join(el.value, rec.bienLuanKetQuaCLS);
    }
    if (rec.duPhong && $('prognosis')) {
        const el = $('prognosis');
        if (!el.value.includes(rec.duPhong)) el.value = join(el.value, 'Dự phòng: ' + rec.duPhong);
    }
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
    // Ô nhiều dòng bị tính chiều cao lúc còn ẩn sẽ ra 44px -> tính lại khi tab hiện ra
    document.querySelectorAll(`#${tabId} textarea`).forEach(autoGrow);
    link?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try { sessionStorage.setItem('benhAnTab', tabId); } catch { }
    syncSecPicker?.();
}

tabLinks.forEach(link => link.addEventListener('click', () => showTab(link.dataset.tab)));

/* Điện thoại: thay 7 tab bằng một nút mở danh sách mục cho đỡ chật */
const secSheet = document.getElementById('sec-sheet');
function tabTitle(link) {
    return link.querySelector('.tab-text')?.textContent.trim() || '';
}
function renderSecSheet() {
    const box = document.getElementById('sec-sheet-list');
    if (!box) return;
    box.innerHTML = tabLinks.map(l => {
        const pct = l.querySelector('.tab-progress')?.textContent || '0%';
        const n = parseInt(pct) || 0;
        const icon = l.querySelector('.tab-top i')?.className || 'fas fa-circle';
        return `<button type="button" class="sec-item ${l.classList.contains('active') ? 'active' : ''}" data-go="${l.dataset.tab}">
            <i class="${icon}"></i><b>${tabTitle(l)}</b>
            <span class="pct ${n >= 80 ? 'full' : n > 0 ? 'part' : ''}">${pct}</span></button>`;
    }).join('');
}
function syncSecPicker() {
    const cur = tabLinks.find(l => l.classList.contains('active'));
    if (!cur) return;
    const name = document.getElementById('sec-picker-name');
    const pct = document.getElementById('sec-picker-pct');
    if (name) name.textContent = tabTitle(cur);
    if (pct) pct.textContent = cur.querySelector('.tab-progress')?.textContent || '0%';
}
/* Mở bảng chọn mục có đẩy một mốc lịch sử: nút Back của điện thoại đóng bảng
   thay vì thoát khỏi trang đang soạn dở. */
function openSecSheet() {
    if (!secSheet) return;
    renderSecSheet();
    secSheet.classList.remove('hidden');
    try { history.pushState({ secSheet: 1 }, ''); } catch { }
}
function closeSecSheet(fromBack) {
    if (!secSheet || secSheet.classList.contains('hidden')) return;
    secSheet.classList.add('hidden');
    if (!fromBack && history.state?.secSheet) { try { history.back(); } catch { } }
}
window.addEventListener('popstate', () => closeSecSheet(true));

document.getElementById('sec-picker')?.addEventListener('click', openSecSheet);
secSheet?.addEventListener('click', (e) => {
    if (e.target.closest('[data-sec-close]') || e.target.classList.contains('sec-sheet-bg')) {
        return closeSecSheet();
    }
    const go = e.target.closest('[data-go]');
    if (!go) return;
    closeSecSheet();
    showTab(go.dataset.go);
});

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
    // Không cướp cú vuốt của ô đang gõ, sơ đồ cuộn ngang hay bảng đang mở
    const NO_SWIPE = 'input, textarea, select, .bl-map-wrap, .cls-thumbs, .img-grid, [data-noswipe]';
    zone.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1 || e.target.closest(NO_SWIPE)) { tracking = false; return; }
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
document.querySelectorAll('#kham-benh > fieldset').forEach(fs => makeCollapsible(fs, false));
document.querySelectorAll('#lydo-tiensu > fieldset').forEach(fs => makeCollapsible(fs, false));

/** Đếm ô đã điền trong một vùng (bỏ ô ẩn, ô chỉ đọc, ô có sẵn giá trị mặc định) */
function countFilled(root) {
    const els = [...root.querySelectorAll('input:not([type=hidden]):not([readonly]), textarea, select')]
        .filter(el => !el.closest('.sticky-actions') && !el.closest('[data-nocount]'));
    return { total: els.length, filled: els.filter(el => String(el.value || '').trim()).length };
}

/* Gõ một chữ là đếm lại toàn bộ ô của 7 tab -> dồn về 1 lần mỗi khung hình
   cho khỏi khựng khi gõ trên điện thoại. */
let progressRaf = 0;
function updateProgress() {
    if (progressRaf) return;
    progressRaf = requestAnimationFrame(() => { progressRaf = 0; updateProgressNow(); });
}

function updateProgressNow() {
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
    // Ô sinh ra sau (mốc bệnh sử, y lệnh, phiếu CLS…) cũng cần phím Enter = "ô kế"
    document.querySelectorAll('#medical-record-form input:not([type=hidden]):not([enterkeyhint])')
        .forEach(el => el.setAttribute('enterkeyhint', 'next'));
    syncSecPicker?.();
}

/* =====================================================================
   3. TỰ ĐỘNG LƯU
   ===================================================================== */
let recordId = new URL(location.href).searchParams.get('id') || 'BA-' + Date.now();
let currentFolder = null;   // đợt thực hành của bệnh án này
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

/* Thang điểm: Glasgow tự cộng, CURB-65 tự gom từ dữ liệu đã nhập */
function calcScores() {
    const gOut = $('gcs-out');
    const e = parseInt($('gcs-e')?.value), v = parseInt($('gcs-v')?.value), m = parseInt($('gcs-m')?.value);
    let gcs = null;
    if (gOut) {
        if (e && v && m) {
            gcs = e + v + m;
            const lvl = gcs >= 13 ? 'nhẹ' : gcs >= 9 ? 'trung bình' : 'nặng';
            gOut.textContent = `GCS ${gcs}/15 (E${e} V${v} M${m}) — rối loạn tri giác mức ${lvl}`;
            gOut.classList.toggle('is-warn', gcs <= 12);
        } else {
            gOut.textContent = 'Chọn E, V, M để tính';
            gOut.classList.remove('is-warn');
        }
    }

    const cOut = $('curb-out');
    if (!cOut) return;
    const age = parseFloat($('patient-age').value) || (THIS_YEAR - parseFloat($('patient-yob').value));
    const resp = parseFloat($('vital-resp').value);
    const bp = String($('vital-bp').value).match(/(\d{2,3})\s*[\/\-]\s*(\d{2,3})/);
    const ure = getCls().flatMap(c => c.items || []).find(i => /^ure$/i.test(i.n));
    const ureVal = ure ? parseFloat(String(ure.v).replace(',', '.')) : NaN;
    const confusion = $('curb-confusion').value === 'Có' || (gcs != null && gcs < 15);

    const hit = [], missing = [];
    if (confusion) hit.push('rối loạn tri giác');
    else if (!$('curb-confusion').value && gcs == null) missing.push('tri giác');

    if (!isNaN(ureVal)) { if (ureVal > 7) hit.push('ure > 7'); } else missing.push('ure máu');
    if (!isNaN(resp)) { if (resp >= 30) hit.push('nhịp thở ≥ 30'); } else missing.push('nhịp thở');
    if (bp) { if (+bp[1] < 90 || +bp[2] <= 60) hit.push('tụt huyết áp'); } else missing.push('huyết áp');
    if (!isNaN(age)) { if (age >= 65) hit.push('tuổi ≥ 65'); } else missing.push('tuổi');

    if (missing.length === 5) {
        cOut.textContent = 'Điền tuổi, nhịp thở, huyết áp để tính';
        cOut.classList.remove('is-warn');
        return;
    }
    const score = hit.length;
    const advice = score <= 1 ? 'nguy cơ thấp — có thể điều trị ngoại trú'
        : score === 2 ? 'nguy cơ trung bình — nên nhập viện điều trị nội trú'
            : 'nguy cơ cao — nhập viện, cân nhắc hồi sức tích cực';
    cOut.textContent = `CURB-65 = ${score}/5${hit.length ? ' (' + hit.join(', ') + ')' : ''} — ${advice}`
        + (missing.length ? ` · chưa có: ${missing.join(', ')}` : '');
    cOut.classList.toggle('is-warn', score >= 3);
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

/* Rượu bia: bệnh nhân khai theo lon / chai / ly và bao lâu uống một lần,
   máy quy ra gam cồn và đơn vị cồn (1 đơn vị = 10 g cồn nguyên chất). */
function calcAlcohol() {
    const out = $('alc-out');
    if (!out) return null;
    const qty = parseFloat($('alc-qty').value);
    const vol = parseFloat($('alc-vol').value);
    const abv = parseFloat($('alc-abv').value);
    const perWeek = parseFloat($('alc-freq').value);
    if (!(qty > 0) || !(vol > 0) || !(abv > 0) || !(perWeek > 0)) {
        out.textContent = 'Chọn loại thức uống, số lượng và tần suất để quy ra đơn vị cồn';
        out.parentElement.classList.remove('is-warn');
        return null;
    }
    const gPerTime = qty * vol * (abv / 100) * 0.789;
    const unitsPerTime = gPerTime / 10;
    const unitsPerWeek = unitsPerTime * perWeek;
    const unitsPerDay = unitsPerWeek / 7;

    const ageNow = parseFloat($('patient-age').value) || (THIS_YEAR - parseFloat($('patient-yob').value));
    const from = parseFloat($('alc-from').value);
    const toRaw = $('alc-to').value.trim();
    const to = toRaw ? parseFloat(toRaw) : ageNow;
    const years = (from >= 0 && to > from) ? to - from : null;

    const male = $('patient-gender').value !== 'Nữ';
    const risky = unitsPerDay > (male ? 2 : 1);
    const vn1 = (n) => n.toFixed(1).replace('.', ',');
    out.textContent = `${vn1(unitsPerTime)} đơn vị cồn/lần (${Math.round(gPerTime)} g) `
        + `· ${vn1(unitsPerWeek)} đơn vị/tuần · ${vn1(unitsPerDay)} đơn vị/ngày trung bình`
        + (years ? ` · uống ${years} năm` : '')
        + (risky ? ' — vượt ngưỡng khuyến cáo' : '');
    out.parentElement.classList.toggle('is-warn', risky);
    return { gPerTime, unitsPerTime, unitsPerWeek, unitsPerDay, years, from, to, stopped: !!toRaw };
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

/* Mục V và VI trong mẫu ghi rõ "khám ngày …" */
function showExamDate() {
    const m = String($('record-datetime')?.value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    const text = m ? `(khám ngày ${+m[3]}/${+m[2]}/${m[1]})` : '';
    ['ros-date', 'exam-date'].forEach(id => { const el = $(id); if (el) el.textContent = text; });
}

/* Bệnh nhân nữ: làm nổi phần sản phụ khoa để không quên hỏi PARA */
/* Checklist đủ ý cho bệnh sử — nhắc ngay khi đang nhập, không chờ tại bàn giảng */
function hxChecklist() {
    const box = $('hx-check');
    if (!box) return;
    const v = (id) => ($(id)?.value || '').trim();
    const steps = getSteps();
    const symAttrs = ['hx-sym-site', 'hx-sym-char', 'hx-sym-severity', 'hx-sym-time',
        'hx-sym-factors', 'hx-sym-assoc'].filter(id => v(id)).length;
    const items = [
        ['Người khai bệnh', !!v('hx-informant')],
        ['Ngày khởi phát', !!v('hx-onset-date')],
        [`Diễn tiến ≥ 2 mốc (${steps.length})`, steps.length >= 2],
        [`Triệu chứng chính đủ thuộc tính (${symAttrs}/6)`, !!v('hx-sym-name') && symAttrs >= 4],
        ['Toàn thân trong quá trình bệnh', !!v('hx-general')],
        ['Triệu chứng âm tính', !!v('hx-negatives')],
        ['Tình trạng lúc nhập viện', !!v('hx-admit-state')],
        ['Sinh hiệu lúc nhập viện', ['adm-pulse', 'adm-bp', 'adm-temp', 'adm-resp'].some(id => v(id))]
    ];
    const done = items.filter(([, ok]) => ok).length;
    const miss = items.filter(([, ok]) => !ok).map(([label]) => label);
    const shown = miss.slice(0, 3);
    box.innerHTML = `<span class="hx-score"><i class="fas fa-clipboard-check"></i> Đủ ý ${done}/${items.length}
            <span class="hx-bar"><i style="width:${Math.round(done / items.length * 100)}%"></i></span></span>`
        + (miss.length
            ? `<span class="hx-miss">${shown.map(l => `<span class="hx-chk">${l}</span>`).join('')}`
            + (miss.length > shown.length ? `<span class="hx-chk">+${miss.length - shown.length} mục nữa</span>` : '')
            + `</span>`
            : `<span class="hx-done"><i class="fas fa-circle-check"></i> Đã đủ ý — đọc lại một lượt là xong</span>`);
}

/* Bệnh án thuộc đợt thực hành nào thì lấy sẵn khoa + bệnh viện của đợt đó */
function applyFolder() {
    const fromUrl = new URL(location.href).searchParams.get('folder');
    if (fromUrl) currentFolder = getFolder(fromUrl) || currentFolder;
    if (!currentFolder) return;
    if (currentFolder.khoa && !$('department-name').value.trim()) $('department-name').value = currentFolder.khoa;
    if (currentFolder.benhVien && !$('hospital-name').value.trim()) $('hospital-name').value = currentFolder.benhVien;

    const head = document.querySelector('.page-card h2');
    if (head && !document.getElementById('folder-banner')) {
        const tag = document.createElement('span');
        tag.id = 'folder-banner';
        tag.className = 'folder-banner';
        tag.innerHTML = `<i class="fas fa-folder"></i> ${currentFolder.ten || 'Thư mục'}`;
        tag.title = folderMeta(currentFolder);
        head.insertAdjacentElement('afterend', tag);
    }
}

const TYPE_TITLE = {
    noi: 'Bệnh Án Nội Khoa', ngoai: 'Bệnh Án Ngoại Khoa', san: 'Bệnh Án Sản Khoa',
    nhi: 'Bệnh Án Nhi Khoa', cc: 'Bệnh Án Cấp Cứu'
};

/* Loại bệnh án quyết định những khối đặc thù nào hiện ra */
function applyRecordType(type) {
    const t = type || $('record-type').value || 'noi';
    $('record-type').value = t;
    document.querySelectorAll('.type-chip').forEach(c => c.classList.toggle('active', c.dataset.type === t));
    document.querySelectorAll('[data-spec]').forEach(box => {
        box.classList.toggle('is-hidden', box.dataset.spec !== t);
    });
    document.querySelectorAll('.spec-box.is-hidden, .fold-panel.is-hidden').forEach(b => { b.hidden = true; });
    document.querySelectorAll('[data-spec]:not(.is-hidden)').forEach(b => { b.hidden = false; });
    const head = document.querySelector('.page-card h2');
    if (head) {
        const icon = head.querySelector('i')?.outerHTML || '';
        head.innerHTML = icon + ' ' + (TYPE_TITLE[t] || TYPE_TITLE.noi);
    }
    updateProgress();
}

/* Sản: tuổi thai + ngày dự sinh từ kinh chót; ước lượng cân thai từ BCTC + vòng bụng */
function calcObstetric() {
    const out = $('ob-out');
    if (out) {
        const lmp = $('ob-lmp').value;
        const ref = String($('record-datetime').value || '').slice(0, 10);
        if (lmp && ref) {
            const cycle = parseFloat($('ob-cycle').value) || 28;
            const adj = (cycle - 28);                       // vòng kinh dài thì rụng trứng muộn
            const days = Math.round((new Date(ref) - new Date(lmp)) / 86400000) - adj;
            const edd = new Date(new Date(lmp).getTime() + (280 + adj) * 86400000);
            if (days >= 0 && days < 320) {
                out.textContent = `Tuổi thai ${Math.floor(days / 7)} tuần ${days % 7} ngày `
                    + `· Dự sinh ${edd.getDate()}/${edd.getMonth() + 1}/${edd.getFullYear()}`;
            } else out.textContent = 'Kiểm tra lại kinh chót — tuổi thai tính ra không hợp lý';
        } else out.textContent = 'Nhập kinh chót để tính tuổi thai và ngày dự sinh';
    }
    const wOut = $('ob-weight-out');
    if (wOut) {
        const bc = parseFloat($('ob-bctc').value), vb = parseFloat($('ob-vb').value);
        wOut.textContent = (bc > 0 && vb > 0)
            ? `Ước lượng cân thai ≈ ${Math.round((bc + vb) * 100 / 4)} g  ((BCTC + vòng bụng) × 100 / 4)`
            : 'Nhập bề cao tử cung và vòng bụng để ước lượng cân thai';
    }
}

/* Nhi: dịch duy trì Holliday-Segar + liều thuốc theo cân */
function calcPediatric() {
    const out = $('ped-out');
    if (!out) return;
    const kg = parseFloat($('vital-weight').value);
    if (!(kg > 0)) {
        out.textContent = 'Nhập cân nặng ở phần sinh hiệu để tính dịch duy trì và liều thuốc';
        return;
    }
    const ml = kg <= 10 ? kg * 100
        : kg <= 20 ? 1000 + (kg - 10) * 50
            : 1500 + (kg - 20) * 20;
    const parts = [`Dịch duy trì ${Math.round(ml)} mL/24h (≈ ${Math.round(ml / 24)} mL/giờ)`];
    const dose = parseFloat($('ped-dose').value);
    if (dose > 0) parts.push(`Liều thuốc ${Math.round(dose * kg * 10) / 10} mg/lần (${dose} mg/kg × ${kg} kg)`);
    out.textContent = parts.join(' · ');
}

/* Ngoại: hậu phẫu ngày thứ mấy */
function calcSurgery() {
    const out = $('sx-out');
    if (!out) return;
    const day = String($('sx-datetime').value || '').slice(0, 10);
    const ref = String($('record-datetime').value || '').slice(0, 10);
    if (!day || !ref) { out.textContent = 'Nhập ngày mổ để tính hậu phẫu ngày thứ mấy'; return; }
    const n = Math.round((new Date(ref) - new Date(day)) / 86400000);
    out.textContent = n >= 0 ? `Hậu phẫu ngày thứ ${n}` : 'Ngày mổ sau ngày làm bệnh án — xem lại';
}

/* Cấp cứu: qSOFA từ nhịp thở, huyết áp tâm thu, tri giác */
function calcQsofa() {
    const out = $('qsofa-out');
    if (!out) return;
    const resp = parseFloat($('vital-resp').value);
    const bp = String($('vital-bp').value).match(/(\d{2,3})\s*[\/\-]\s*(\d{2,3})/);
    const e = parseInt($('gcs-e')?.value), v = parseInt($('gcs-v')?.value), m = parseInt($('gcs-m')?.value);
    const gcs = (e && v && m) ? e + v + m : null;
    const hit = [], miss = [];
    if (!isNaN(resp)) { if (resp >= 22) hit.push('nhịp thở ≥ 22'); } else miss.push('nhịp thở');
    if (bp) { if (+bp[1] <= 100) hit.push('HA tâm thu ≤ 100'); } else miss.push('huyết áp');
    if (gcs != null) { if (gcs < 15) hit.push('Glasgow < 15'); } else miss.push('Glasgow');
    if (miss.length === 3) { out.textContent = 'Nhập nhịp thở, huyết áp, Glasgow để tính qSOFA'; return; }
    out.textContent = `qSOFA = ${hit.length}/3${hit.length ? ' (' + hit.join(', ') + ')' : ''}`
        + (hit.length >= 2 ? ' — nguy cơ cao, tầm soát nhiễm khuẩn huyết' : '')
        + (miss.length ? ` · chưa có: ${miss.join(', ')}` : '');
    out.parentElement.classList.toggle('is-warn', hit.length >= 2);
}

/* Chấn thương: giờ thứ mấy sau tai nạn + tổng diện tích bỏng theo quy tắc số 9 */
function burnPercent() {
    return [...document.querySelectorAll('.burn-area:checked')]
        .reduce((sum, el) => sum + (parseFloat(el.dataset.pct) || 0), 0);
}

function calcTrauma() {
    const out = $('tr-out');
    if (!out) return;
    const isBurn = $('tr-type').value === 'Bỏng';
    $('burn-wrap')?.classList.toggle('is-hidden', !isBurn);

    const parts = [];
    const t = $('tr-time').value;
    const ref = $('record-datetime').value;
    if (t && ref) {
        const h = (new Date(ref) - new Date(t)) / 3600000;
        if (h >= 0) {
            parts.push(h < 48
                ? `Giờ thứ ${Math.floor(h)} sau chấn thương`
                : `Ngày thứ ${Math.floor(h / 24)} sau chấn thương`);
            if (h <= 1) parts.push('còn trong giờ vàng');
        } else parts.push('Thời điểm chấn thương sau ngày làm bệnh án — xem lại');
    }
    const pct = burnPercent();
    if (isBurn && pct) {
        parts.push(`Diện tích bỏng ${pct}% diện tích da`);
        // Parkland: 4 mL x kg x %TBSA cho 24 giờ đầu
        const kg = parseFloat($('vital-weight').value);
        if (kg > 0) {
            const ml = Math.round(4 * kg * pct);
            parts.push(`bù dịch Parkland ${ml} mL/24h (nửa đầu trong 8 giờ: ${Math.round(ml / 2)} mL)`);
        }
    }
    out.textContent = parts.length ? parts.join(' · ')
        : 'Chọn loại tai nạn và thời điểm chấn thương';
    out.parentElement.classList.toggle('is-warn', isBurn && pct >= 20);
}

/** Câu văn cơ chế chấn thương để chèn vào bệnh sử */
function traumaProse() {
    const v = (id) => ($(id)?.value || '').trim();
    const when = (() => {
        const m = String(v('tr-time')).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
        return m ? `lúc ${m[4]}:${m[5]} ngày ${m[3]}/${m[2]}/${m[1]}` : '';
    })();
    if (!v('tr-type') && !when) return '';

    const lines = [];
    const co = [v('tr-energy'), v('tr-impact') && 'va đập đầu tiên: ' + v('tr-impact'),
    v('tr-object') && 'vật gây thương tích: ' + v('tr-object'), v('tr-protect')].filter(Boolean);
    lines.push(`Bệnh nhân bị ${(v('tr-type') || 'chấn thương').toLowerCase()}${when ? ' ' + when : ''}`
        + (co.length ? `. Cơ chế: ${co.join(', ')}` : '') + '.');

    const sau = [v('tr-loc'), v('tr-amnesia'), v('tr-vomit'), v('tr-walk')].filter(Boolean);
    if (sau.length) lines.push(`Sau tai nạn: ${sau.join(', ').toLowerCase()}.`);

    const pct = burnPercent();
    if (pct) {
        lines.push(`Bỏng ${pct}% diện tích da`
            + (v('tr-burn-depth') ? `, ${v('tr-burn-depth')}` : '')
            + (v('tr-burn-agent') ? `, tác nhân ${v('tr-burn-agent')}` : '') + '.');
    }
    const dua = [v('tr-firstaid') && 'Sơ cứu: ' + v('tr-firstaid'),
    v('tr-transport') && 'Chuyển viện: ' + v('tr-transport')].filter(Boolean);
    if (dua.length) lines.push(dua.join('. ') + '.');
    return lines.join('\n');
}

/* Tự chấm mức độ: góp sinh hiệu + Glasgow + các chỉ số cận lâm sàng đã nhập */
function gradeContext() {
    const labs = {};
    getCls().forEach(c => (c.items || []).forEach(i => {
        if (String(i.v ?? '').trim()) labs[i.n] = i.v;
    }));
    const e = parseInt($('gcs-e')?.value), v = parseInt($('gcs-v')?.value), m = parseInt($('gcs-m')?.value);
    return {
        pulse: $('vital-pulse').value, bp: $('vital-bp').value, temp: $('vital-temp').value,
        resp: $('vital-resp').value, spo2: $('vital-spo2').value, weight: $('vital-weight').value,
        gcs: (e && v && m) ? e + v + m : null,
        gender: $('patient-gender').value, age: $('patient-age').value,
        painText: [$('hx-sym-severity')?.value, $('hx-sym-name')?.value].filter(Boolean).join(' '),
        labs
    };
}

let lastGrades = [];
function renderGrades() {
    const box = $('grade-list');
    if (!box) return;
    lastGrades = gradeAll(gradeContext());
    box.innerHTML = lastGrades.length
        ? lastGrades.map(g => `<div class="grade-row ${g.muc || ''}">
                <span class="grade-dot"></span>
                <span class="grade-name">${g.ten}</span>
                <span class="grade-val">${g.ketQua}
                    ${g.dua ? `<span class="grade-src">d\u1ef1a v\u00e0o: ${g.dua}</span>` : ''}
                    ${g.thieu ? `<span class="grade-src">c\u00f2n thi\u1ebfu: ${g.thieu}</span>` : ''}</span>
            </div>`).join('')
        : '<p class="grade-empty">Nh\u1eadp sinh hi\u1ec7u ho\u1eb7c k\u1ebft qu\u1ea3 c\u1eadn l\u00e2m s\u00e0ng, m\u00e1y s\u1ebd t\u1ef1 ch\u1ea5m \u0111\u1ed9 cho b\u1ea1n.</p>';
}

function calcSpecialty() { calcObstetric(); calcPediatric(); calcSurgery(); calcQsofa(); calcTrauma(); renderGrades(); }

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
   6. TÓM TẮT TỰ ĐỘNG
   ===================================================================== */
function buildSummary() {
    const v = (id) => ($(id)?.value || '').trim();
    const gender = v('patient-gender');
    const genderText = gender === 'Nam' ? 'Bệnh nhân nam' : gender === 'Nữ' ? 'Bệnh nhân nữ'
        : gender ? 'Bệnh nhân ' + gender.toLowerCase() : 'Bệnh nhân';
    const age = v('patient-age') || (v('patient-yob') ? THIS_YEAR - parseInt(v('patient-yob')) : '');
    const reason = v('reason-for-admission');
    // "Bệnh ngày thứ N" lấy từ ngày khởi phát bên mục Bệnh sử
    const dayNo = ($('hx-onset-tag')?.textContent || '').match(/Bệnh ngày thứ (\d+)/);

    const lines = [`${genderText}${age ? ', ' + age + ' tuổi' : ''}` +
        `${reason ? ', vào viện vì ' + reason.replace(/\.$/, '') : ''}` +
        `${dayNo ? ', bệnh ngày thứ ' + dayNo[1] : ''}.`];

    lines.push('', 'Qua hỏi bệnh sử, tiền căn, thăm khám lâm sàng và các cận lâm sàng đã có, ghi nhận:');

    let n = 0;
    const group = (title, body) => { if (body) lines.push(`${++n}. ${title}: ${body}`); };

    // Cơ năng: lấy mốc diễn tiến, không có thì lấy đoạn bệnh sử
    const timeline = getSteps().map(m =>
        [String(m.s || '').trim(), ...(m.refs || []).filter(r => r.sym)
            .map(r => `${r.sym} ${r.st}${r.d ? ' (' + r.d + ')' : ''}`)].filter(Boolean).join('; ')
    ).filter(Boolean).join('; ');
    group('Triệu chứng cơ năng', timeline || v('illness-history').split('\n')[0]);

    const vitals = [
        v('vital-pulse') && `mạch ${v('vital-pulse')} l/p`,
        v('vital-temp') && `nhiệt độ ${v('vital-temp')}°C`,
        v('vital-bp') && `huyết áp ${v('vital-bp')} mmHg`,
        v('vital-resp') && `nhịp thở ${v('vital-resp')} l/p`,
        v('vital-spo2') && `SpO2 ${v('vital-spo2')}%`,
        v('vital-bmi') && `BMI ${v('vital-bmi')} kg/m²`
    ].filter(Boolean).join(', ');
    group('Sinh hiệu', vitals);

    // Dấu chứng thực thể: bỏ mục còn nguyên mẫu "khám bình thường" và mục "chưa ghi nhận"
    const notable = (id) => {
        const val = v(id);
        if (!val) return '';
        if (NORMAL_EXAM[id] && val === NORMAL_EXAM[id]) return '';
        if (/^chưa ghi nhận/i.test(val)) return '';
        return val;
    };
    const signs = ['exam-general', 'exam-head', 'exam-chest', 'exam-heart', 'exam-lung',
        'exam-abdomen', 'exam-neuro-msk'].map(notable).filter(Boolean).join('; ');
    group('Dấu chứng thực thể', signs);

    const gcs = ($('gcs-out')?.textContent || '').startsWith('GCS') ? $('gcs-out').textContent : '';
    const curb = ($('curb-out')?.textContent || '').startsWith('CURB') ? $('curb-out').textContent : '';
    group('Thang điểm', [gcs, curb].filter(Boolean).join(' · '));

    const abn = abnormalItems(getCls())
        .map(i => `${i.n} ${i.v}${i.u ? ' ' + i.u : ''} ${i.flag === 'high' ? '↑' : '↓'}`).join(', ');
    group('Cận lâm sàng bất thường', abn);

    const history = [
        ['nội khoa', v('history-internal')], ['ngoại khoa', v('history-surgery')],
        ['sản phụ khoa', v('history-obgyne')], ['dị ứng', v('history-allergy')],
        ['môi trường', v('history-environment')], ['thói quen', v('history-habit')], ['gia đình', v('history-family')]
    ].filter(([, val]) => val && !/^chưa ghi nhận/i.test(val))
        .map(([k, val]) => `${k}: ${val}`).join('; ');
    group('Tiền căn', history);

    if (v('provisional-diagnosis')) lines.push('', 'Chẩn đoán sơ bộ: ' + v('provisional-diagnosis'));
    return lines.join('\n').trim();
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
buildPickers({ autoGrow });

/* Thông tin sinh viên giống nhau ở mọi bệnh án -> nhớ lại cho lần sau */
const STU_KEY = 'benhAnSinhVien';
const STU_IDS = ['stu-name', 'stu-id', 'stu-class', 'stu-no'];
function restoreStudent() {
    try {
        const saved = JSON.parse(localStorage.getItem(STU_KEY) || '{}');
        STU_IDS.forEach(id => { if (!$(id).value.trim() && saved[id]) $(id).value = saved[id]; });
    } catch { }
}
function rememberStudent() {
    try {
        localStorage.setItem(STU_KEY, JSON.stringify(
            Object.fromEntries(STU_IDS.map(id => [id, $(id).value]))));
    } catch { }
}

// Trình nhập phiếu cận lâm sàng (chỉ số + ảnh) — nằm ở tab riêng
initCls({
    recordId,
    getGender: () => $('patient-gender').value,
    getAge: () => $('patient-age').value || (THIS_YEAR - parseFloat($('patient-yob').value)),
    onChange: () => { calcScores(); renderGrades(); benhKem.forEach(l => l.regrade()); updateProgress(); scheduleSave(); }
});

initHistory({ onChange: () => { syncProse(); hxChecklist(); updateProgress(); scheduleSave(); } });

initFindings({ onChange: () => { growAll(); updateProgress(); scheduleSave(); } });

initBienLuan({
    onChange: () => { blBinder.sync(); updateProgress(); scheduleSave(); },
    onNoProblems: () => showToast('Chưa có vấn đề nào ở mục VIII — điền Đặt vấn đề trước.', 'warning')
});

/* Tiền căn nội / ngoại khoa: danh sách "CNV bao lâu, nội dung" -> ghép vào ô chữ */
const cnvInternal = $('cnv-internal') && createCnvList({
    host: $('cnv-internal'), addBtn: $('cnv-internal-add'),
    onChange: () => { cnvIntoField(cnvInternal, 'history-internal'); updateProgress(); scheduleSave(); }
});
const cnvSurgery = $('cnv-surgery') && createCnvList({
    host: $('cnv-surgery'), addBtn: $('cnv-surgery-add'),
    onChange: () => { cnvIntoField(cnvSurgery, 'history-surgery'); updateProgress(); scheduleSave(); }
});

/** Ghép các dòng CNV vào ô tiền căn, giữ lại phần người dùng tự gõ */
const cnvLast = new Map();
function cnvIntoField(list, id) {
    const el = $(id);
    if (!el || !list) return;
    const lines = list.toLines();
    const prev = cnvLast.get(id) || '';
    const keep = el.value.split('\n').filter(l => l.trim() && !prev.split('\n').includes(l)).join('\n');
    el.value = [lines, keep].filter(Boolean).join('\n');
    cnvLast.set(id, lines);
    autoGrow(el);
}

const imgExam = createImageBox({
    host: document.getElementById('img-exam'), recordId, folder: 'kham',
    label: 'Thêm ảnh lâm sàng',
    onChange: () => { updateProgress(); scheduleSave(); }
});
const imgHoSo = createImageBox({
    host: document.getElementById('img-hoso'), recordId, folder: 'hoso',
    label: 'Thêm ảnh hồ sơ',
    onChange: () => { updateProgress(); scheduleSave(); }
});

/* Bệnh kèm: chẩn đoán sơ bộ (bk1) và chẩn đoán xác định (bk2) */
const benhKem = [1, 2].map(n => $(`bk${n}-list`) && createBenhKemList({
    host: $(`bk${n}-list`), addBtn: $(`bk${n}-add`), pullBtn: $(`bk${n}-pull`),
    field: $(`dx${n}-assoc`), suggest: suggestStage, getPast: pastDiseases,
    onChange: () => { dxBinder[`dx${n}`].sync(); updateProgress(); scheduleSave(); }
})).filter(Boolean);

const syncBenhKem = () => benhKem.forEach(l => l.sync());
[1, 2].forEach(n => $(`bk${n}-pull`)?.addEventListener('bk-pulled', (e) => {
    showToast(e.detail.n
        ? `Đã chép ${e.detail.n} bệnh nền từ tiền căn sang mục bệnh kèm.`
        : 'Không có bệnh nền nào mới trong tiền căn nội khoa.',
        e.detail.n ? 'success' : 'info');
}));

initRx({ onChange: () => { rxBinder.sync(); updateProgress(); scheduleSave(); } });

initTheoDoi({ onChange: () => { updateProgress(); scheduleSave(); } });

initFold();

// Nạp bệnh án cũ (ưu tiên bản trên máy, không có thì hỏi cloud)
(async function loadExisting() {
    applyFolder();   // ap dung ngay, khong doi Firebase tra loi
    let rec = getRecord(recordId);
    if (!rec && await authReady()) {
        // Bệnh án có thể được tạo ở máy khác
        await syncFromCloud();
        rec = getRecord(recordId);
    }
    if (rec) {
        fillForm(rec);
        currentFolder = rec.thuMuc || null;
        setSaveState('idle', 'Đã mở bệnh án đã lưu');
    } else {
        // Bệnh án mới: điền sẵn ngày giờ làm bệnh án
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        $('record-datetime').value = now.toISOString().slice(0, 16);
        setSaveState('idle', 'Bệnh án mới — tự động lưu khi bạn gõ');
    }
    applyFolder();
    applyRecordType($('record-type').value);
    calcSpecialty();
    calcBmi();
    calcBp();
    calcStay();
    calcSmoke();
    calcAlcohol();
    calcOnset();
    calcScores();
    restoreStudent();
    showExamDate();
    hxChecklist();
    syncBenhKem();
    syncGenderUi();
    Object.keys(VITAL_RANGE).forEach(id => $(id) && flagVital($(id)));
    growAll();
    updateProgress();
    // Mở lại tab đang xem dở — chỉ khi sửa bệnh án cũ, bệnh án mới luôn bắt đầu ở tab I
    try {
        const wanted = new URL(location.href).searchParams.get('tab');
        if (wanted && tabLinks.some(l => l.dataset.tab === wanted)) return showTab(wanted);
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
    if (el.id === 'patient-age') calcYob();
    if (el.id === 'vital-height' || el.id === 'vital-weight') calcBmi();
    if (el.id === 'vital-bp') calcBp();
    if (el.id === 'admission-date' || el.id === 'record-datetime') { calcStay(); calcOnset(); showExamDate(); }
    if (el.id === 'hx-onset-date') calcOnset();
    if (STU_IDS.includes(el.id)) rememberStudent();
    if (el.id.startsWith('hx-') || el.id.startsWith('adm-')) { syncProse(); hxChecklist(); }
    if (el.id.startsWith('dx1-')) dxBinder.dx1.sync();
    if (el.id.startsWith('dx2-')) dxBinder.dx2.sync();
    if (['smoke-cpd', 'smoke-from', 'smoke-to', 'patient-yob', 'patient-age'].includes(el.id)) calcSmoke();
    if (el.id.startsWith('alc-')) calcAlcohol();
    if (['vital-resp', 'vital-bp', 'patient-age', 'patient-yob'].includes(el.id)) calcScores();
    if (el.id.startsWith('vital-') || el.id.startsWith('gcs-') || el.id.startsWith('hx-sym-')) renderGrades();
    if (el.id === 'vital-bp' || el.id === 'vital-bmi') benhKem.forEach(l => l.regrade());
    if (el.id.startsWith('tr-')) calcTrauma();
    if (el.id.startsWith('ob-') || el.id.startsWith('ped-') || el.id.startsWith('sx-')
        || el.id.startsWith('cc-') || ['vital-weight', 'vital-resp', 'vital-bp', 'record-datetime'].includes(el.id)) calcSpecialty();
    if (VITAL_RANGE[el.id]) flagVital(el);
    if (el.tagName === 'TEXTAREA') autoGrow(el);
    updateProgress();
    scheduleSave();
});
form.addEventListener('change', (e) => {
    if (e.target.id === 'alc-drink') {
        const opt = e.target.selectedOptions[0];
        if (opt?.dataset.vol) $('alc-vol').value = opt.dataset.vol;
        if (opt?.dataset.abv) $('alc-abv').value = opt.dataset.abv;
        calcAlcohol();
    }
    if (['alc-qty', 'alc-freq', 'alc-vol', 'alc-abv', 'alc-from', 'alc-to'].includes(e.target.id)) calcAlcohol();
    if (e.target.id.startsWith('gcs-') || e.target.id === 'curb-confusion') calcScores();
    if (e.target.id.startsWith('gcs-') || e.target.id.startsWith('ob-') || e.target.id.startsWith('sx-')) calcSpecialty();
    if (e.target.id.startsWith('tr-') || e.target.classList?.contains('burn-area')) calcTrauma();
    if (e.target.id === 'hx-onset-date' || e.target.id === 'admission-date') calcOnset();
    if (e.target.id === 'patient-gender') { syncGenderUi(); calcAlcohol(); }
    updateProgress(); scheduleSave();
});

/* Nút "Ghi vào tiền sử" của các ô máy tự tính */
$('smoke-apply')?.addEventListener('click', () => {
    const s = calcSmoke();
    if (!s) return showToast('Nhập số điếu/ngày và tuổi bắt đầu hút trước.', 'warning');
    upsertLine('history-habit', /^hút thuốc lá/i,
        `Hút thuốc lá ${s.cpd} điếu/ngày từ ${s.from} tuổi đến ${s.stopped ? s.to + ' tuổi (đã ngưng)' : 'nay'}` +
        ` — ${s.py.toFixed(1)} gói·năm`);
    showToast('Đã ghi tiền sử hút thuốc.', 'success');
});
$('alc-apply')?.addEventListener('click', () => {
    const a = calcAlcohol();
    if (!a) return showToast('Chưa đủ dữ liệu — chọn thức uống, số lượng và tần suất.', 'warning');
    const drink = $('alc-drink').value || 'rượu bia';
    // Bệnh nhân khai "mấy lon", "mấy chai", "mấy ly" — giữ đúng chữ đó
    const unitWord = /lon/i.test(drink) ? 'lon' : /chai/i.test(drink) ? 'chai' : /ly/i.test(drink) ? 'ly' : 'phần';
    const vn = (n) => n.toFixed(1).replace('.', ',');
    const freq = $('alc-freq').selectedOptions[0]?.textContent || '';
    const when = a.years
        ? `, uống từ ${a.from} tuổi ${a.stopped ? `đến ${a.to} tuổi (đã ngưng)` : 'đến nay'} — ${a.years} năm`
        : '';
    upsertLine('history-habit', /^uống /i,
        `Uống ${drink}, ${$('alc-qty').value} ${unitWord}/lần, ${freq.toLowerCase()}`
        + ` ≈ ${vn(a.unitsPerDay)} đơn vị cồn/ngày (${Math.round(a.gPerTime)} g cồn mỗi lần)${when}`);
    showToast('Đã ghi tiền căn rượu bia.', 'success');
});
$('para-apply')?.addEventListener('click', () => {
    const n = [1, 2, 3, 4].map(i => String(parseInt($('para-' + i).value) || 0));
    upsertLine('history-obgyne', /^para/i,
        `PARA ${n.join('')} (${n[0]} đủ tháng, ${n[1]} thiếu tháng, ${n[2]} sảy/phá, ${n[3]} con sống)`);
    showToast('Đã ghi PARA vào tiền sử sản phụ khoa.', 'success');
});

/* Ô chữ máy ghép từ các ô đã chia nhỏ: chỉ ghi đè khi ô còn trống hoặc nội dung vẫn
   đúng bản máy ghép lần trước — người dùng sửa tay một chữ là máy thôi đụng vào. */
function bindAuto(targetId, build) {
    let last = '';
    const write = (text) => {
        const el = $(targetId);
        last = text;
        el.value = text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        autoGrow(el);
    };
    return {
        sync() {
            const el = $(targetId);
            if (!el || (el.value.trim() && el.value !== last)) return;
            last = build();
            el.value = last;
            autoGrow(el);
        },
        force() { const t = build(); if (t) write(t); return t; }
    };
}

const proseBinder = bindAuto('illness-history', buildProse);
const syncProse = () => proseBinder.sync();

function buildDx(prefix) {
    const v = (id) => ($(id)?.value || '').trim();
    const parts = [v(prefix + '-main'), v(prefix + '-stage'),
    v(prefix + '-comp') && 'Biến chứng: ' + v(prefix + '-comp'),
    v(prefix + '-assoc') && 'Bệnh kèm: ' + v(prefix + '-assoc')].filter(Boolean);
    return parts.join(' – ');
}
const dxBinder = {
    dx1: bindAuto('provisional-diagnosis', () => buildDx('dx1')),
    dx2: bindAuto('final-diagnosis', () => buildDx('dx2'))
};

const blBinder = bindAuto('diagnosis-reasoning', buildBienLuan);
const rxBinder = bindAuto('treatment-detail', () => rxToText(getRx()));

$('tr-apply')?.addEventListener('click', () => {
    const text = traumaProse();
    if (!text) return showToast('Chưa có dữ liệu chấn thương — chọn loại tai nạn trước.', 'warning');
    const el = $('illness-history');
    const keep = el.value.split('\n').filter(l => l.trim() && !/^Bệnh nhân bị |^Sau tai nạn:|^Bỏng \d|^Sơ cứu:|^Chuyển viện:/.test(l.trim()));
    el.value = [text, ...keep].join('\n');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    autoGrow(el);
    showToast('Đã ghi cơ chế chấn thương vào bệnh sử.', 'success');
});

document.getElementById('type-chips')?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-type]');
    if (!chip) return;
    applyRecordType(chip.dataset.type);
    openSpec(chip.dataset.type);
    calcSpecialty();
    scheduleSave();
});

$('bl-build')?.addEventListener('click', () => {
    const text = blBinder.force();
    showToast(text ? 'Đã ghép đoạn biện luận.' : 'Chưa có nội dung biện luận để ghép.', text ? 'success' : 'warning');
});

$('grade-insert')?.addEventListener('click', () => {
    const text = gradeToText(lastGrades);
    if (!text) return showToast('Chưa có dữ liệu để chấm độ.', 'warning');
    const el = $('summary');
    const cur = el.value.trim();
    el.value = cur ? cur + '\n\nĐánh giá mức độ:\n' + text : 'Đánh giá mức độ:\n' + text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    autoGrow(el);
    showToast('Đã chèn các đánh giá mức độ vào tóm tắt.', 'success');
});

$('bl-to-cls')?.addEventListener('click', () => {
    const list = derivedCls();
    if (!list.length) return showToast('Chưa ghi cận lâm sàng ở nhánh nào trong sơ đồ biện luận.', 'warning');
    const el = $('labs-proposed');
    const co = el.value.split('\n').map(x => x.trim()).filter(Boolean);
    list.forEach(x => { if (!co.some(y => y.toLowerCase() === x.toLowerCase())) co.push(x); });
    el.value = co.join('\n');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    autoGrow(el);
    showToast(`Đã đổ ${list.length} cận lâm sàng sang mục XI.`, 'success');
});

$('bl-to-dx')?.addEventListener('click', () => {
    const { soBo, phanBiet } = derivedDiagnosis();
    if (!soBo && !phanBiet) return showToast('Chưa phân định chẩn đoán nào ở bảng biện luận.', 'warning');
    if (soBo) $('dx1-main').value = soBo;
    if (phanBiet) $('differential-diagnosis').value = phanBiet;
    dxBinder.dx1.force();
    autoGrow($('differential-diagnosis'));
    updateProgress(); scheduleSave();
    showToast('Đã đổ vào chẩn đoán sơ bộ và chẩn đoán phân biệt.', 'success');
});

$('dx-copy')?.addEventListener('click', () => {
    ['main', 'comp', 'assoc', 'stage'].forEach(k => { $('dx2-' + k).value = $('dx1-' + k).value; });
    dxBinder.dx2.force();
    updateProgress(); scheduleSave();
    showToast('Đã chép sang chẩn đoán xác định — sửa lại theo kết quả cận lâm sàng.', 'success');
});

$('hx-build')?.addEventListener('click', () => {
    const text = proseBinder.force();
    if (!text) return showToast('Chưa có dữ liệu — điền người khai bệnh, triệu chứng hoặc mốc diễn tiến trước.', 'warning');
    const missing = missingDetails();
    showToast(missing.length
        ? `Đã ghép bệnh sử. Còn thiếu mô tả rõ: ${missing.join('; ')}.`
        : 'Đã ghép bệnh sử — đọc lại và sửa cho mượt.', missing.length ? 'warning' : 'success', missing.length ? 6000 : 3000);
});

// Đặt vấn đề tự động
$('auto-problem-btn')?.addEventListener('click', () => {
    const text = buildProblems();
    if (!text) return showToast('Chưa đủ dữ liệu để gợi ý — nhập lý do vào viện, sinh hiệu hoặc cận lâm sàng trước.', 'warning');
    $('problem-list').value = text;
    $('problem-list').dispatchEvent(new Event('input', { bubbles: true }));
    autoGrow($('problem-list'));
    syncFromProblems();
    showToast('Đã gợi ý các vấn đề và tạo khung biện luận tương ứng.', 'success');
});

/* Bàn phím điện thoại: phím Enter/Go nhảy sang ô kế thay vì submit form
   (submit = lưu rồi rời trang — lỡ tay là mất mạch nhập liệu). */
form.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.isComposing) return;
    const el = e.target;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'BUTTON' || el.closest('.sticky-actions')) return;
    e.preventDefault();
    const fields = [...form.querySelectorAll('input:not([type=hidden]):not([readonly]), select, textarea')]
        .filter(f => f.offsetParent !== null && !f.closest('.sticky-actions'));
    const next = fields[fields.indexOf(el) + 1];
    if (!next) return el.blur();
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (next.tagName === 'INPUT' && next.type !== 'date' && next.type !== 'time') next.select?.();
});

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
            ['summary', 'Tóm tắt bệnh án'], ['problem-list', 'Đặt vấn đề'],
            ['provisional-diagnosis', 'Chẩn đoán sơ bộ'], ['differential-diagnosis', 'Chẩn đoán phân biệt'],
            ['diagnosis-reasoning', 'Biện luận chẩn đoán'],
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


